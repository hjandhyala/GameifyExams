import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SOURCES, VOCABULARIES } from '@prepdle/content';
import type { TrackId, VocabEntry } from '@prepdle/core';
import { schema, type Db } from '@prepdle/db';
import { sql } from 'drizzle-orm';
import { ROOT } from '../ops/assets';
import { chunkText, fetchCached, fetchJson, stripHtml } from './http';

type Log = (m: string) => void;
const hash = (s: string) => createHash('sha256').update(s).digest('hex');

export async function seedSources(db: Db): Promise<number> {
  for (const s of SOURCES)
    await db
      .insert(schema.kbSources)
      .values({ id: s.id, name: s.name, url: s.url, license: s.license, attribution: s.attribution, verifiedOn: new Date().toISOString().slice(0, 10), notes: s.usedFor })
      .onConflictDoUpdate({ target: schema.kbSources.id, set: { license: s.license, attribution: s.attribution, url: s.url } });
  return SOURCES.length;
}

async function addFact(db: Db, sourceId: string, subject: string, predicate: string, object: string, qualifiers?: unknown) {
  await db.insert(schema.kbFacts).values({ sourceId, subject, predicate, object, qualifiers: qualifiers ?? null, retrievedAt: new Date() }).onConflictDoNothing();
}

export async function addDocument(db: Db, d: { sourceId: string; track: TrackId | null; locator: string; url?: string; title?: string; text: string; blueprintCodes?: string[] }) {
  const parts = chunkText(d.text);
  let n = 0;
  for (const [i, text] of parts.entries()) {
    const id = `${d.sourceId}:${hash(d.locator + i).slice(0, 16)}`;
    const ins = await db
      .insert(schema.kbDocuments)
      .values({ id, sourceId: d.sourceId, track: d.track, locator: parts.length > 1 ? `${d.locator} (part ${i + 1})` : d.locator, url: d.url, title: d.title, text, textHash: hash(text), retrievedAt: new Date(), blueprintCodes: d.blueprintCodes ?? [] })
      .onConflictDoNothing()
      .returning({ id: schema.kbDocuments.id });
    n += ins.length;
  }
  return n;
}

// ------------------------------------------------------------------ medical
/** NLM Clinical Tables: synonyms + ICD-10-CM codes for every Boards vocab entry. */
export async function ingestClinicalTables(db: Db, log: Log) {
  const v = VOCABULARIES['boards-dx']!;
  let n = 0;
  for (const e of v.entries) {
    const url = `https://clinicaltables.nlm.nih.gov/api/conditions/v3/search?terms=${encodeURIComponent(e.name)}&df=primary_name,consumer_name&ef=synonyms,icd10cm_codes&maxList=3`;
    const r = await fetchJson<[number, string[], { synonyms?: string[][]; icd10cm_codes?: string[] }, string[][]]>(url, { ttlHours: 24 * 30 });
    const rows = r[3] ?? [];
    rows.forEach((row, i) => {
      if (row[0]?.toLowerCase() !== e.name.toLowerCase()) return;
      for (const syn of r[2]?.synonyms?.[i] ?? []) void addFact(db, 'nlm-clinicaltables', e.id, 'has_synonym', syn);
      const icd = r[2]?.icd10cm_codes?.[i];
      if (icd) void addFact(db, 'nlm-clinicaltables', e.id, 'has_icd10cm', String(icd));
      n++;
    });
  }
  log(`clinicaltables: matched ${n}/${v.entries.length} entries`);
}

/** MeSH lookup: descriptor ids + tree numbers (system attribute cross-check). */
export async function ingestMesh(db: Db, log: Log) {
  const v = VOCABULARIES['boards-dx']!;
  let n = 0;
  for (const e of v.entries) {
    const r = await fetchJson<{ resource: string; label: string }[]>(`https://id.nlm.nih.gov/mesh/lookup/descriptor?label=${encodeURIComponent(e.name)}&match=exact&limit=1`, { ttlHours: 24 * 90 });
    const d = r[0];
    if (!d) continue;
    const uid = d.resource.split('/').pop()!;
    await addFact(db, 'mesh', e.id, 'mesh_descriptor', uid);
    const details = await fetchJson<{ treeNumber?: string[] }>(`https://id.nlm.nih.gov/mesh/lookup/details?descriptor=${uid}`, { ttlHours: 24 * 90 }).catch(() => ({ treeNumber: [] as string[] }));
    for (const t of details.treeNumber ?? []) await addFact(db, 'mesh', e.id, 'mesh_tree', String(t).split('/').pop()!);
    n++;
  }
  log(`mesh: ${n}/${v.entries.length} descriptors`);
}

/** RxClass: drug → class memberships (MoA, EPC, ATC) for Quartet group mining. */
export async function ingestRxClass(db: Db, log: Log, drugs: string[]) {
  let n = 0;
  for (const drug of drugs) {
    for (const [relaSource, rela] of [['MEDRT', 'has_moa'], ['FDASPL', 'has_epc'], ['ATC', '']] as const) {
      const url = `https://rxnav.nlm.nih.gov/REST/rxclass/class/byDrugName.json?drugName=${encodeURIComponent(drug)}&relaSource=${relaSource}${rela ? `&relas=${rela}` : ''}`;
      const r = await fetchJson<{ rxclassDrugInfoList?: { rxclassDrugInfo: { rxclassMinConceptItem: { className: string; classType: string } }[] } }>(url, { ttlHours: 24 * 30 }).catch(() => ({}) as never);
      for (const info of r.rxclassDrugInfoList?.rxclassDrugInfo ?? []) {
        await addFact(db, 'rxnav', drug.toLowerCase(), `class:${info.rxclassMinConceptItem.classType}`, info.rxclassMinConceptItem.className);
        n++;
      }
    }
  }
  log(`rxclass: ${n} class memberships for ${drugs.length} drugs`);
}

/** openFDA drug labels: mechanism, indications, boxed warnings → grounding documents. */
export async function ingestOpenFda(db: Db, log: Log, drugs: string[]) {
  const key = process.env.OPENFDA_API_KEY ? `&api_key=${process.env.OPENFDA_API_KEY}` : '';
  let n = 0;
  for (const drug of drugs) {
    const url = `https://api.fda.gov/drug/label.json?search=openfda.generic_name:%22${encodeURIComponent(drug)}%22&limit=1${key}`;
    const r = await fetchJson<{ results?: Record<string, string[] | Record<string, string[]>>[] }>(url, { ttlHours: 24 * 7 }).catch(() => ({ results: [] }));
    const label = r.results?.[0];
    if (!label) continue;
    const pick = (k: string) => ((label[k] as string[] | undefined) ?? []).join(' ').slice(0, 4000);
    const setId = String((label.set_id as unknown as string) ?? drug);
    const text = [`Drug: ${drug}.`, pick('mechanism_of_action') && `Mechanism of action: ${pick('mechanism_of_action')}`, pick('indications_and_usage') && `Indications: ${pick('indications_and_usage')}`, pick('boxed_warning') && `Boxed warning: ${pick('boxed_warning')}`, pick('adverse_reactions') && `Adverse reactions: ${pick('adverse_reactions').slice(0, 1500)}`]
      .filter(Boolean)
      .join('\n');
    n += await addDocument(db, { sourceId: 'openfda', track: 'boards', locator: `openFDA SPL ${setId} (${drug})`, url: `https://open.fda.gov/`, title: drug, text });
  }
  log(`openfda: ${n} chunks`);
}

// ------------------------------------------------------------------ science
export async function ingestPubChem(db: Db, log: Log) {
  const v = VOCABULARIES['mcat-entities']!;
  const targets = v.entries.filter((e) => ['Biomolecule', 'Hormone', 'Neurotransmitter'].includes(String(e.attrs.type)));
  let n = 0;
  for (const e of targets) {
    const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(e.name)}/property/MolecularFormula,MolecularWeight,IsomericSMILES,XLogP/JSON`;
    const r = await fetchJson<{ PropertyTable?: { Properties: Record<string, string | number>[] } }>(url, { ttlHours: 24 * 90 }).catch(() => ({}) as never);
    const p = r.PropertyTable?.Properties?.[0];
    if (!p) continue;
    for (const [k, val] of Object.entries(p)) if (k !== 'CID') await addFact(db, 'pubchem', e.id, k, String(val), { cid: p.CID });
    n++;
  }
  log(`pubchem: ${n}/${targets.length} compounds`);
}

export async function ingestWikidata(db: Db, log: Log, query: string, sourceTag: string) {
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
  const r = await fetchJson<{ results: { bindings: Record<string, { value: string }>[] } }>(url, { ttlHours: 24 * 30, headers: { Accept: 'application/sparql-results+json' } });
  let n = 0;
  for (const b of r.results.bindings) {
    const s = b.sLabel?.value ?? b.s?.value;
    const o = b.oLabel?.value ?? b.o?.value;
    if (s && o) {
      await addFact(db, 'wikidata', s, sourceTag, o);
      n++;
    }
  }
  log(`wikidata(${sourceTag}): ${n} facts`);
}

/** Generic document ingest (OpenStax sections, Federal Rules pages, glossaries) from a URL. */
export async function ingestUrl(db: Db, log: Log, p: { sourceId: string; track: TrackId | null; locator: string; url: string; blueprintCodes?: string[] }) {
  const html = await fetchCached(p.url, { ttlHours: 24 * 30 });
  const text = stripHtml(html);
  const n = await addDocument(db, { ...p, text });
  log(`${p.sourceId}: ${n} chunks from ${p.locator}`);
}

// ------------------------------------------------------------------ law
export async function ingestCourtListener(db: Db, log: Log, cases: string[]) {
  const token = process.env.COURTLISTENER_TOKEN;
  if (!token) throw new Error('COURTLISTENER_TOKEN required');
  let n = 0;
  for (const name of cases) {
    const url = `https://www.courtlistener.com/api/rest/v4/search/?q=${encodeURIComponent(`caseName:("${name}")`)}&type=o&order_by=score%20desc`;
    const r = await fetchJson<{ results?: { caseName: string; citation?: string[]; dateFiled?: string; court?: string; absolute_url?: string }[] }>(url, { headers: { Authorization: `Token ${token}` }, ttlHours: 24 * 90 });
    const top = r.results?.[0];
    if (!top) continue;
    await addFact(db, 'courtlistener', top.caseName, 'citation', (top.citation ?? []).join('; ') || 'n/a', { dateFiled: top.dateFiled, court: top.court, url: top.absolute_url });
    n++;
  }
  log(`courtlistener: ${n}/${cases.length} cases`);
}

// ------------------------------------------------------------------ vocab enrichment
/** Merges ingested synonyms (Clinical Tables) into the Boards vocabulary file (editor review via git diff). */
export async function enrichBoardsVocab(db: Db, log: Log) {
  const path = join(ROOT, 'packages/content/vocab/boards-dx.json');
  const doc = JSON.parse(readFileSync(path, 'utf8')) as { entries: VocabEntry[] };
  const facts = (await db.execute(sql`SELECT subject, object FROM kb.facts WHERE predicate = 'has_synonym' AND source_id = 'nlm-clinicaltables'`)) as unknown;
  const rows = (Array.isArray(facts) ? facts : (facts as { rows: { subject: string; object: string }[] }).rows) as { subject: string; object: string }[];
  let added = 0;
  for (const e of doc.entries) {
    const syns = new Set(e.syn ?? []);
    for (const r of rows.filter((x) => x.subject === e.id)) {
      const s = r.object.trim();
      if (s.length >= 3 && s.length <= 60 && s.toLowerCase() !== e.name.toLowerCase() && !syns.has(s)) {
        syns.add(s);
        added++;
      }
    }
    e.syn = [...syns].slice(0, 12);
  }
  writeFileSync(path, JSON.stringify(doc, null, 1));
  log(`boards vocab: +${added} synonyms (review the git diff, then run build-assets)`);
}

/** Exam-relevant drugs for RxClass/openFDA ingestion (extend as the bank grows). */
export const CORE_DRUGS = [
  'lithium', 'warfarin', 'heparin', 'metformin', 'insulin glargine', 'lisinopril', 'losartan', 'metoprolol', 'propranolol', 'amlodipine', 'furosemide', 'hydrochlorothiazide', 'spironolactone',
  'digoxin', 'amiodarone', 'atorvastatin', 'aspirin', 'clopidogrel', 'apixaban', 'levothyroxine', 'methimazole', 'propylthiouracil', 'prednisone', 'hydralazine', 'procainamide', 'isoniazid',
  'rifampin', 'methyldopa', 'phenytoin', 'carbamazepine', 'valproate', 'lamotrigine', 'haloperidol', 'clozapine', 'fluoxetine', 'sertraline', 'bupropion', 'venlafaxine', 'amitriptyline',
  'methotrexate', 'hydroxyurea', 'cyclophosphamide', 'cisplatin', 'doxorubicin', 'vincristine', 'tamoxifen', 'imatinib', 'vancomycin', 'gentamicin', 'ciprofloxacin', 'doxycycline',
  'azithromycin', 'penicillin', 'ceftriaxone', 'trimethoprim', 'dapsone', 'primaquine', 'nitrofurantoin', 'acyclovir', 'oseltamivir', 'fluconazole', 'amphotericin b', 'ondansetron', 'omeprazole',
];
