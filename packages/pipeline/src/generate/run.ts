import {
  engineFor,
  gameById,
  ITEM_KIND_FOR_GAME,
  logic,
  seededRng,
  ulid,
  type GameId,
  type TrackId,
} from '@prepdle/core';
import { VOCABULARIES } from '@prepdle/content';
import { rows, type NewItem, type Repo } from '@prepdle/db';
import { sql } from 'drizzle-orm';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { z } from 'zod';
import { loadBlueprint, type Leaf } from '../blueprints';
import { ROOT } from '../ops/assets';
import { contentHash } from '../publish/hash';
import {
  AnatomyDraft,
  anatomyFromDraft,
  BackTranslation,
  JargonDraft,
  jargonFromDraft,
  McqDraft,
  mcqFromDraft,
  QuartetDraft,
  quartetFromDraft,
  VerbalizeDraft,
  WorkupDraft,
  workupFromDraft,
} from './drafts';
import { batchResults, callStructured, costUsd, MODEL, submitBatch, waitForBatch, type CallSpec } from './llm';
import { PROMPT_VERSION, SEEDS, slotMessage, systemPrompt, type Grounding } from './prompts';

export interface Slot {
  id: string;
  track: TrackId;
  gameId: GameId;
  leaf: Leaf;
  difficulty: number;
  seed: string;
  grounding: Grounding[];
  /** engine-specific context (answer, verdict model, candidate ids…) */
  ctx: Record<string, unknown>;
}

type Log = (m: string) => void;

/** Picks blueprint leaves proportional to target weight minus current share of the approved bank (§12.7 deficits). */
async function pickLeaves(repo: Repo, track: TrackId, gameId: GameId, n: number, rng: () => number): Promise<Leaf[]> {
  const { leaves } = loadBlueprint(track);
  const bank = await repo.listItems({ track, gameId, status: ['approved', 'reserve', 'in_review', 'published'], limit: 100_000 });
  const counts = new Map<string, number>();
  for (const i of bank) for (const c of i.blueprintCodes) counts.set(c, (counts.get(c) ?? 0) + 1);
  const total = Math.max(1, bank.length);
  const scored = leaves.map((l) => ({ l, w: Math.max(0.002, l.weight - (counts.get(l.code) ?? 0) / total) }));
  const out: Leaf[] = [];
  for (let k = 0; k < n; k++) {
    const sum = scored.reduce((a, s) => a + s.w, 0);
    let r = rng() * sum;
    const pick = scored.find((s) => (r -= s.w) <= 0) ?? scored[0]!;
    out.push(pick.l);
    pick.w *= 0.5; // spread picks within one run
  }
  return out;
}

async function grounding(repo: Repo, track: TrackId, leaf: Leaf, extraTerms: string[] = []): Promise<Grounding[]> {
  const q = [leaf.name.split('›').pop()!.trim(), ...extraTerms].join(' ');
  const r = await rows<{ id: string; locator: string; text: string; url: string | null }>(
    repo.db,
    sql`SELECT id, locator, text, url FROM kb.documents
        WHERE (track = ${track} OR track IS NULL) AND to_tsvector('english', text) @@ plainto_tsquery('english', ${q})
        ORDER BY ts_rank(to_tsvector('english', text), plainto_tsquery('english', ${q})) DESC LIMIT 5`,
  ).catch(() => []);
  return r.map((x, i) => ({ id: `S${i + 1}`, locator: x.locator, text: x.text.slice(0, 3000), ...(x.url ? { url: x.url } : {}) }));
}

function domainAnswers(track: TrackId): string[] {
  const p = join(ROOT, `packages/content/wordlists/domain-${track}.txt`);
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8')
    .split(/\s+/)
    .filter((w) => /^[A-Z]{5,8}$/.test(w));
}

const ANATOMY_PATTERNS = [
  ['opposing', 'premise', 'premise', 'main'],
  ['background', 'premise', 'inter', 'main'],
  ['opposing', 'premise', 'concession', 'inter', 'main'],
  ['premise', 'premise', 'inter', 'concession', 'main'],
  ['background', 'opposing', 'premise', 'premise', 'main'],
];

/** Plans `n` slots for a (track, game), choosing leaves, difficulty, seeds, answers and grounding. */
export async function planSlots(repo: Repo, track: TrackId, gameId: GameId, n: number, seed = ulid()): Promise<Slot[]> {
  const rng = seededRng(seed);
  const leaves = await pickLeaves(repo, track, gameId, n, rng);
  const used = new Set((await repo.listItems({ track, gameId, limit: 100_000 })).map((i) => i.answerKey).filter(Boolean) as string[]);
  const game = gameById(track, gameId)!;
  const slots: Slot[] = [];
  for (const [k, leaf] of leaves.entries()) {
    const difficulty = 1 + Math.floor(rng() * 5);
    const s: Slot = { id: `${seed}:${k}`, track, gameId, leaf, difficulty, seed: SEEDS[track][(k + Math.floor(rng() * 7)) % SEEDS[track].length]!, grounding: [], ctx: {} };
    if (gameId === 'jargon') {
      const pool = domainAnswers(track).filter((w) => !used.has(w));
      const answer = pool[Math.floor(rng() * pool.length)];
      if (!answer) continue;
      used.add(answer);
      s.ctx.answer = answer;
    }
    if (gameId === 'workup' && game.workup) {
      const v = VOCABULARIES[game.workup.vocabId]!;
      const pool = v.entries.filter((e) => !used.has(e.id) && (e.commonness ?? 50) >= 50);
      const ans = pool[Math.floor(rng() * pool.length)];
      if (!ans) continue;
      used.add(ans.id);
      const near = v.entries
        .filter((e) => e.id !== ans.id)
        .map((e) => ({ e, score: Object.keys(ans.attrs).filter((key) => JSON.stringify(e.attrs[key]) === JSON.stringify(ans.attrs[key])).length + (e.parent === ans.id || ans.parent === e.id ? 2 : 0) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 12)
        .map((x) => x.e);
      s.ctx = { answerId: ans.id, answerName: ans.name, giveaways: [ans.name, ...(ans.syn ?? []), ...(ans.abbr ?? []), ...(ans.giveaways ?? [])], candidates: near.map((e) => ({ id: e.id, name: e.name })) };
    }
    if (gameId === 'anatomy') s.ctx.pattern = ANATOMY_PATTERNS[k % ANATOMY_PATTERNS.length];
    if (gameId === 'verdict') s.ctx.model = logic.generateVerdictModel(seededRng(`${seed}:${k}:verdict`), 4 + (difficulty >= 4 ? 1 : 0));
    s.grounding = gameId === 'verdict' ? [] : await grounding(repo, track, leaf, s.ctx.answerName ? [String(s.ctx.answerName)] : s.ctx.answer ? [String(s.ctx.answer)] : []);
    slots.push(s);
  }
  return slots;
}

export function specFor(slot: Slot): CallSpec<z.ZodType> {
  const system = systemPrompt(slot.track, slot.gameId);
  const base = { blueprint: { code: slot.leaf.code, name: slot.leaf.name }, difficulty: slot.difficulty, seed: slot.seed, grounding: slot.grounding };
  switch (slot.gameId) {
    case 'gauntlet': {
      const n = gameById(slot.track, 'gauntlet')!.gauntlet!.optionCount;
      return { system, schema: McqDraft, user: slotMessage({ ...base, constraints: [`Exactly ${n} options lettered ${'ABCDE'.slice(0, n).split('').join(', ')}`] }) };
    }
    case 'quartet':
      return { system, schema: QuartetDraft, user: slotMessage({ ...base, constraints: ['Exactly 4 groups with tiers 1, 2, 3, 4', 'Each group has exactly 4 tiles', `Use blueprint codes from ${slot.track.toUpperCase()} (e.g. ${slot.leaf.code})`] }) };
    case 'jargon':
      return { system, schema: JargonDraft, user: slotMessage({ ...base, extra: `Answer term: ${String(slot.ctx.answer)}` }) };
    case 'workup':
      return {
        system,
        schema: WorkupDraft,
        user: slotMessage({
          ...base,
          extra: `Answer entity: ${String(slot.ctx.answerName)} (id ${String(slot.ctx.answerId)}).\nGiveaway terms to keep out of clues 1–3: ${(slot.ctx.giveaways as string[]).join('; ')}\nCandidate entities for discriminators/close ids (id: name):\n${(slot.ctx.candidates as { id: string; name: string }[]).map((c) => `${c.id}: ${c.name}`).join('\n')}`,
        }),
      };
    case 'anatomy':
      return { system, schema: AnatomyDraft, user: slotMessage({ ...base, extra: `Role pattern (in order): ${(slot.ctx.pattern as string[]).join(' → ')}` }) };
    case 'verdict': {
      const m = slot.ctx.model as ReturnType<typeof logic.generateVerdictModel>;
      return {
        system,
        schema: VerbalizeDraft,
        user: slotMessage({ ...base, extra: `Variables: ${m.variables.join(', ')}\nPremises (formal): ${m.premises.join(' ; ')}\nClaims (formal, keep order): ${m.claims.map((c) => c.formula).join(' ; ')}` }),
      };
    }
    default:
      throw new Error(`No generator for ${slot.gameId}`);
  }
}

/** Converts a model draft into an authored item (and for Verdict runs the back-translation check). */
export async function draftToAuthored(slot: Slot, draft: unknown, log: Log): Promise<unknown | null> {
  const code = [slot.leaf.code];
  switch (slot.gameId) {
    case 'gauntlet':
      return mcqFromDraft(draft as z.infer<typeof McqDraft>, { code: slot.leaf.code, name: slot.leaf.name }, slot.grounding);
    case 'quartet':
      return quartetFromDraft(draft as z.infer<typeof QuartetDraft>);
    case 'jargon':
      return jargonFromDraft(String(slot.ctx.answer), code, draft as z.infer<typeof JargonDraft>);
    case 'workup':
      return workupFromDraft(String(slot.ctx.answerId), code, draft as z.infer<typeof WorkupDraft>, slot.grounding);
    case 'anatomy':
      return anatomyFromDraft(code, draft as z.infer<typeof AnatomyDraft>);
    case 'verdict': {
      const m = slot.ctx.model as ReturnType<typeof logic.generateVerdictModel>;
      const d = draft as z.infer<typeof VerbalizeDraft>;
      if (d.premises.length !== m.premises.length || d.claims.length !== m.claims.length) return null;
      // Back-translation: an independent call parses the English back into formulas; the solver checks equivalence (§5.5.3).
      const bt = await callStructured({
        system: 'You translate English logical statements into propositional formulas. Use only the given variables and the operators ~ (not), & (and), | (or), -> (implies), with parentheses. Translate faithfully; do not simplify.',
        user: `Variables:\n${d.variableMeanings.map((v) => `${v.variable}: ${v.meaning}`).join('\n')}\n\nPremises:\n${d.premises.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\nClaims:\n${d.claims.map((c, i) => `${i + 1}. ${c.text}`).join('\n')}`,
        schema: BackTranslation,
        effort: 'medium',
      });
      if (bt.kind !== 'ok') return null;
      try {
        const okPremises = logic.equivalentSets(m.premises.map(logic.parse), bt.data.premises.map(logic.parse));
        const okClaims = m.claims.every((c, i) => bt.data.claims[i] && logic.equivalent(logic.parse(c.formula), logic.parse(bt.data.claims[i]!)));
        if (!okPremises || !okClaims) {
          log(`verdict back-translation mismatch for ${slot.id}`);
          return null;
        }
      } catch {
        return null;
      }
      return {
        mode: 'verdict',
        intro: 'Assume every premise is true. Classify each claim.',
        premises: d.premises,
        formal: { variables: Object.fromEntries(d.variableMeanings.map((v) => [v.variable, v.meaning])), premises: m.premises },
        claims: m.claims.map((c, i) => ({ text: d.claims[i]!.text, formula: c.formula, label: c.verdict, explanation: d.claims[i]!.explanation })),
        blueprintCodes: code,
      };
    }
    default:
      return null;
  }
}

export function itemFromAuthored(slot: Slot, authored: unknown, provenance: Record<string, unknown>): NewItem | null {
  const engine = engineFor(slot.gameId);
  const parsed = engine.authoredSchema.safeParse(authored);
  if (!parsed.success) return null;
  const content = parsed.data as Record<string, unknown>;
  const answerKey = slot.gameId === 'jargon' ? String(slot.ctx.answer) : slot.gameId === 'workup' ? String(slot.ctx.answerId) : null;
  return {
    id: ulid(),
    track: slot.track,
    engine: engine.id,
    gameId: slot.gameId,
    kind: ITEM_KIND_FOR_GAME[slot.gameId],
    status: 'draft',
    difficulty: slot.difficulty,
    blueprintCodes: [slot.leaf.code],
    conceptIds: answerKey ? [`${slot.gameId}:${answerKey}`] : [`leaf:${slot.leaf.code}`],
    answerKey,
    content,
    sources: (content.sources as unknown[]) ?? slot.grounding.map(({ id, locator, url }) => ({ id, locator, url })),
    provenance: { method: 'llm', model: MODEL, promptVersion: PROMPT_VERSION, slot: { leaf: slot.leaf.code, seed: slot.seed, difficulty: slot.difficulty }, ...provenance },
    contentHash: contentHash(content),
  };
}

/** generate --sync: calls Claude per slot (refusals retried with server-side fallbacks). */
export async function generateSync(repo: Repo, slots: Slot[], runId: string, log: Log): Promise<{ inserted: number; failed: number; cost: number }> {
  let inserted = 0;
  let failed = 0;
  let cost = 0;
  for (const slot of slots) {
    const spec = specFor(slot);
    let r = await callStructured(spec);
    if (r.kind === 'refused') r = await callStructured(spec, { fallback: true });
    if (r.usage) cost += costUsd(MODEL, r.usage);
    if (r.kind !== 'ok') {
      failed++;
      log(`slot ${slot.id}: ${r.kind}`);
      continue;
    }
    const authored = await draftToAuthored(slot, r.data, log);
    const item = authored ? itemFromAuthored(slot, authored, { runId }) : null;
    if (!item) {
      failed++;
      continue;
    }
    inserted += await repo.insertItems([item]);
  }
  return { inserted, failed, cost };
}

/** generate --batch: submits a Message Batch; `collect` turns results into draft items. */
export async function generateBatch(repo: Repo, slots: Slot[], runId: string): Promise<string> {
  // custom_id must be ≤ 64 chars: use the slot index; the run record maps index → slot.
  const batchId = await submitBatch(slots.map((s, i) => ({ customId: `s${i}`, spec: specFor(s) })));
  await repo.finishRun(runId, 'submitted', { batchId, slots });
  return batchId;
}

export async function collectBatch(repo: Repo, runId: string, log: Log): Promise<{ inserted: number; failed: number; cost: number }> {
  const run = (await repo.listRuns(500)).find((r) => r.id === runId);
  if (!run) throw new Error(`run ${runId} not found`);
  const stats = run.stats as { batchId: string; slots: Slot[] };
  await waitForBatch(stats.batchId, log);
  const bySlot = new Map(stats.slots.map((s, i) => [`s${i}`, s]));
  let inserted = 0;
  let failed = 0;
  let cost = 0;
  for await (const r of batchResults(stats.batchId)) {
    const slot = bySlot.get(r.customId);
    if (!slot) continue;
    if (r.result.kind !== 'ok') {
      // Refusals: retry synchronously with fallbacks (fallbacks are not available on the Batches API).
      if (r.result.kind === 'refused') {
        const res = await generateSync(repo, [slot], runId, log);
        inserted += res.inserted;
        failed += res.failed;
        cost += res.cost;
      } else failed++;
      continue;
    }
    cost += costUsd(r.result.model, r.result.usage, true);
    const spec = specFor(slot);
    const parsed = spec.schema.safeParse((() => {
      try {
        return JSON.parse(r.result.text);
      } catch {
        return null;
      }
    })());
    if (!parsed.success) {
      failed++;
      continue;
    }
    const authored = await draftToAuthored(slot, parsed.data, log);
    const item = authored ? itemFromAuthored(slot, authored, { runId, batchId: stats.batchId }) : null;
    if (item) inserted += await repo.insertItems([item]);
    else failed++;
  }
  return { inserted, failed, cost };
}
