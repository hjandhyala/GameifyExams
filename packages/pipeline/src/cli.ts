#!/usr/bin/env node
/**
 * Prepdle content pipeline CLI (§12.2). Run with `npm run pipeline -- <command> [--flags]`.
 *
 *   migrate | seed-fixtures | build-assets
 *   ingest <sources|clinicaltables|mesh|rxclass|openfda|pubchem|wikidata|courtlistener|url> [...]
 *   enrich-vocab
 *   plan [--weeks 6]
 *   generate --track boards --game gauntlet --n 20 [--batch] [--seed s]
 *   collect --run <runId>
 *   validate [--run <runId>] [--no-llm] [--limit n]
 *   eval-golden [--track t] [--game g] [--no-llm]
 *   schedule [--from YYYY-MM-DD] [--days 28] [--dry-run]
 *   lock [--days 7] | psychometrics | buffer | cost [--since 30]
 */
import { addDays, allSlots, CATALOG, engineFor, GAME_IDS, isTrackId, ulid, utcISO, type GameId, type TrackId } from '@prepdle/core';
import { FIXTURES } from '@prepdle/content';
import { createDb, migrate, Repo } from '@prepdle/db';
import { allBlueprintWeights } from './blueprints';
import { collectBatch, generateBatch, generateSync, planSlots } from './generate/run';
import { ingestClinicalTables, ingestCourtListener, ingestMesh, ingestOpenFda, ingestPubChem, ingestRxClass, ingestUrl, ingestWikidata, CORE_DRUGS, enrichBoardsVocab, seedSources } from './ingest/sources';
import { buildAssets } from './ops/assets';
import { fixtureToItem, seedFixtureItems } from './publish/seed';
import { runPsychometrics } from './publish/psychometrics';
import { schedule } from './publish/schedule';
import { validateDrafts, validateItem } from './validate/run';

const log = (m: string) => console.log(m);

function parseArgs(argv: string[]) {
  const pos: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) flags[k!] = v;
      else if (argv[i + 1] && !argv[i + 1]!.startsWith('--')) flags[k!] = argv[++i]!;
      else flags[k!] = true;
    } else pos.push(a);
  }
  return { cmd: pos[0], args: pos.slice(1), flags };
}

const LAUNCH = process.env.LAUNCH_DATE ?? '2026-07-15';

async function main() {
  const { cmd, args, flags } = parseArgs(process.argv.slice(2));
  if (!cmd || cmd === 'help') {
    console.log(String(require_help()));
    return;
  }
  if (cmd === 'build-assets' || cmd === 'build-dict') {
    buildAssets(log);
    return;
  }
  const h = await createDb();
  if (h.kind === 'pglite') await migrate(h); // local/CI convenience; Postgres uses `migrate` explicitly
  const repo = new Repo(h.db);
  const runId = `${cmd}-${ulid()}`;
  const track = flags.track as string | undefined;
  const game = flags.game as string | undefined;
  if (track && !isTrackId(track)) throw new Error(`Unknown track ${track}`);
  if (game && !(GAME_IDS as readonly string[]).includes(game)) throw new Error(`Unknown game ${game}`);
  try {
    switch (cmd) {
      case 'migrate':
        log(`applied: ${(await migrate(h)).join(', ') || 'none'}`);
        break;
      case 'seed-fixtures': {
        await migrate(h);
        log(`inserted ${await seedFixtureItems(repo)} fixture items; ${await seedSources(h.db)} sources`);
        break;
      }
      case 'ingest': {
        await repo.startRun(runId, 'ingest', { args });
        const what = args[0];
        if (what === 'sources') await seedSources(h.db);
        else if (what === 'clinicaltables') await ingestClinicalTables(h.db, log);
        else if (what === 'mesh') await ingestMesh(h.db, log);
        else if (what === 'rxclass') await ingestRxClass(h.db, log, args.slice(1).length ? args.slice(1) : CORE_DRUGS);
        else if (what === 'openfda') await ingestOpenFda(h.db, log, args.slice(1).length ? args.slice(1) : CORE_DRUGS);
        else if (what === 'pubchem') await ingestPubChem(h.db, log);
        else if (what === 'wikidata') {
          // Example: hormone → secreting gland (P2283 "uses"? use custom query via --query)
          const q = String(flags.query ?? 'SELECT ?s ?sLabel ?o ?oLabel WHERE { ?s wdt:P31 wd:Q8047. ?s wdt:P361 ?o. SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 500');
          await ingestWikidata(h.db, log, q, String(flags.tag ?? 'part_of'));
        } else if (what === 'courtlistener') await ingestCourtListener(h.db, log, args.slice(1));
        else if (what === 'url') {
          if (!flags.url || !flags.source || !flags.locator) throw new Error('ingest url --source id --locator "..." --url https://… [--track t]');
          await ingestUrl(h.db, log, { sourceId: String(flags.source), track: (track as TrackId) ?? null, locator: String(flags.locator), url: String(flags.url) });
        } else throw new Error(`unknown ingest source ${what}`);
        await repo.finishRun(runId, 'done', { what });
        break;
      }
      case 'enrich-vocab':
        await enrichBoardsVocab(h.db, log);
        break;
      case 'plan': {
        const weeks = Number(flags.weeks ?? 6);
        const counts = await repo.itemCounts();
        for (const { track: t, game: g } of allSlots()) {
          const need = weeks * 7 * (g.gameId === 'gauntlet' ? 5 : 1) + 10;
          const have = counts.filter((c) => c.track === t && c.gameId === g.gameId && ['approved', 'reserve'].includes(c.status)).reduce((a, c) => a + c.n, 0);
          const review = counts.filter((c) => c.track === t && c.gameId === g.gameId && c.status === 'in_review').reduce((a, c) => a + c.n, 0);
          const toGenerate = Math.max(0, Math.ceil((need - have - review) / 0.65));
          log(`${t.padEnd(6)} ${g.name.padEnd(9)} need ${String(need).padStart(4)} · approved ${String(have).padStart(4)} · in review ${String(review).padStart(3)} · generate ≈ ${toGenerate}`);
        }
        break;
      }
      case 'generate': {
        if (!track || !game) throw new Error('generate --track <t> --game <g> --n <count> [--batch]');
        const n = Number(flags.n ?? 10);
        const slots = await planSlots(repo, track as TrackId, game as GameId, n, String(flags.seed ?? runId));
        await repo.startRun(runId, 'generate', { track, game, n, batch: !!flags.batch });
        if (flags.batch) {
          const batchId = await generateBatch(repo, slots, runId);
          log(`submitted batch ${batchId} as run ${runId}. Next: npm run pipeline -- collect --run ${runId}`);
        } else {
          const r = await generateSync(repo, slots, runId, log);
          await repo.finishRun(runId, 'done', r, r.cost);
          log(`generated ${r.inserted} drafts (${r.failed} failed) · $${r.cost.toFixed(2)}. Next: npm run pipeline -- validate --run ${runId}`);
        }
        break;
      }
      case 'collect': {
        const id = String(flags.run);
        const r = await collectBatch(repo, id, log);
        await repo.finishRun(id, 'collected', r, r.cost);
        log(`collected ${r.inserted} drafts (${r.failed} failed) · $${r.cost.toFixed(2)}`);
        break;
      }
      case 'validate': {
        await repo.startRun(runId, 'validate', { run: flags.run });
        const r = await validateDrafts(repo, { runId: flags.run as string | undefined, llm: !flags['no-llm'], log, limit: flags.limit ? Number(flags.limit) : undefined });
        await repo.finishRun(runId, 'done', r, r.cost);
        log(`validated ${r.total}: ${r.passed} to review · $${r.cost.toFixed(2)}`);
        break;
      }
      case 'eval-golden': {
        // Golden set = reviewed fixtures. Validators should pass them; a regression blocks prompt/model changes (§12.12).
        const golden = FIXTURES.filter((f) => (!track || f.track === track) && (!game || f.gameId === game));
        let ok = 0;
        let cost = 0;
        for (const f of golden) {
          const item = { ...fixtureToItem(f), timesUsed: 0, version: 1, lastUsedOn: null, difficultyObserved: null, validation: null, createdAt: new Date(), updatedAt: new Date(), id: `golden:${f.key}` } as never;
          const r = await validateItem(repo, item, { llm: !flags['no-llm'], log });
          cost += r.costUsd;
          if (r.passed) ok++;
          else log(`REGRESSION ${f.key}: ${r.checks.filter((c) => c.status === 'fail').map((c) => `${c.id} ${c.details}`).join(' | ')}`);
        }
        log(`golden: ${ok}/${golden.length} pass · $${cost.toFixed(2)}`);
        if (ok < golden.length) process.exitCode = 1;
        break;
      }
      case 'schedule': {
        const from = String(flags.from ?? utcISO(Date.now()));
        const days = Number(flags.days ?? 28);
        const r = await schedule(repo, { from, days, launchDate: LAUNCH, blueprints: allBlueprintWeights(), dryRun: !!flags['dry-run'], log });
        log(`filled ${r.filled.length}, unfilled ${r.unfilled.length}`);
        if (r.unfilled.length) process.exitCode = 2;
        break;
      }
      case 'lock':
        log(`locked ${await repo.lockWindow(addDays(utcISO(Date.now()), Number(flags.days ?? 7)))}`);
        break;
      case 'psychometrics': {
        const r = await runPsychometrics(repo, { minN: Number(flags['min-n'] ?? 50) });
        log(`updated ${r.updated}; flags: ${r.flags.map((f) => `${f.itemId}:${f.flag}`).join(', ') || 'none'}`);
        break;
      }
      case 'buffer': {
        for (const b of await repo.bufferDays(utcISO(Date.now()))) log(`${b.track}/${b.gameId}: ${b.days} days`);
        break;
      }
      case 'cost': {
        const since = Date.now() - Number(flags.since ?? 30) * 86_400_000;
        const runs = (await repo.listRuns(1000)).filter((r) => new Date(r.startedAt).getTime() >= since);
        const total = runs.reduce((a, r) => a + Number(r.costUsd ?? 0), 0);
        log(`${runs.length} runs · $${total.toFixed(2)}`);
        break;
      }
      case 'catalog':
        for (const t of Object.values(CATALOG)) log(`${t.id}: ${t.games.map((g) => `${g.name} (${engineFor(g.gameId).id})`).join(', ')}`);
        break;
      default:
        throw new Error(`Unknown command ${cmd}`);
    }
  } finally {
    await h.close();
  }
}

function require_help() {
  return `Prepdle pipeline
  migrate                         apply DB migrations (DATABASE_URL, or local PGlite under node_modules/.cache)
  seed-fixtures                   insert reviewed fixture items + source registry
  build-assets                    rebuild hashed dictionaries/vocab assets for the web app
  ingest <source> [...]           sources | clinicaltables | mesh | rxclass [drugs] | openfda [drugs] | pubchem | wikidata --query | courtlistener <case names> | url --source --locator --url
  enrich-vocab                    merge ingested synonyms into the Boards vocabulary (review the diff)
  plan [--weeks 6]                bank inventory vs. demand per (track, game)
  generate --track --game --n     draft items with Claude (add --batch for the Message Batches API)
  collect --run <id>              collect a batch run into draft items
  validate [--run id] [--no-llm]  run validators V1–V8; drafts → in_review / auto_rejected
  eval-golden [--track --game]    run validators on the reviewed golden set (CI gate for prompt/model changes)
  schedule [--from --days]        fill empty slots from approved items and compile puzzles
  lock [--days 7] · buffer · psychometrics · cost [--since 30] · catalog`;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
