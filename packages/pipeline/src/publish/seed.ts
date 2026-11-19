import { addDays, engineFor, ITEM_KIND_FOR_GAME, type ISODate } from '@prepdle/core';
import { FIXTURES, type FixtureItem } from '@prepdle/content';
import { migrate, Repo, type DbHandle, type NewItem } from '@prepdle/db';
import { contentHash } from './hash';
import { schedule } from './schedule';

export function fixtureToItem(f: FixtureItem): NewItem {
  const engine = engineFor(f.gameId);
  const content = engine.authoredSchema.parse(f.authored) as Record<string, unknown>;
  const blueprintCodes =
    (content.blueprintCodes as string[] | undefined) ??
    ((content.blueprint as { code: string } | undefined) ? [(content.blueprint as { code: string }).code] : undefined) ??
    ((content.groups as { blueprintCodes: string[] }[] | undefined)?.flatMap((g) => g.blueprintCodes) ?? []);
  const answerKey = f.gameId === 'jargon' ? (content.answer as string) : f.gameId === 'workup' ? (content.answerId as string) : null;
  return {
    id: f.key,
    track: f.track,
    engine: engine.id,
    gameId: f.gameId,
    kind: ITEM_KIND_FOR_GAME[f.gameId],
    status: 'approved',
    difficulty: f.difficulty,
    blueprintCodes: [...new Set(blueprintCodes)],
    conceptIds: f.conceptIds,
    answerKey,
    content,
    sources: (content.sources as unknown[] | undefined) ?? [],
    provenance: { method: 'human', source: 'fixtures', note: 'Seed content; requires review before production' },
    contentHash: contentHash(content),
  };
}

/** Inserts all fixture items (idempotent). */
export async function seedFixtureItems(repo: Repo): Promise<number> {
  return repo.insertItems(FIXTURES.map(fixtureToItem));
}

/**
 * Local/preview bootstrap: migrate, seed fixtures, and schedule puzzles (with reuse) around `today`
 * so every game is playable. Safe to call repeatedly.
 */
export async function ensureDevContent(h: DbHandle, opts: { today: ISODate; launchDate: ISODate; back?: number; ahead?: number; log?: (m: string) => void }) {
  await migrate(h);
  const repo = new Repo(h.db);
  await seedFixtureItems(repo);
  const from = addDays(opts.today, -(opts.back ?? 3));
  const launch = opts.launchDate > from ? from : opts.launchDate;
  return schedule(repo, { from, days: (opts.back ?? 3) + (opts.ahead ?? 14) + 1, launchDate: launch, allowReuse: true, log: opts.log });
}
