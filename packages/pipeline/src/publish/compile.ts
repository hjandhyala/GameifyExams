import {
  CATALOG,
  engineFor,
  gameById,
  puzzleIdFor,
  puzzleNumber,
  reletter,
  seededRng,
  uniqueIdFactory,
  type CompileCtx,
  type Compiled,
  type GameId,
  type GauntletAuthored,
  type ISODate,
  type TrackId,
} from '@prepdle/core';
import { dictHashes, vocabHash, vocabMap } from '@prepdle/content';
import type { ItemRow, Repo } from '@prepdle/db';

export interface CompileInput {
  track: TrackId;
  gameId: GameId;
  date: ISODate;
  items: ItemRow[];
  launchDate: ISODate;
  /** Rolling tally of Gauntlet key letters (mutated) to balance answer positions (§5.4.9). */
  keyTally?: Record<string, number>;
}

/** Builds the compile context for a (track, game) slot from the catalog and asset manifest. */
export function compileCtx(track: TrackId, gameId: GameId, seed: string): CompileCtx {
  const game = gameById(track, gameId);
  if (!game) throw new Error(`No game ${gameId} for ${track}`);
  const ctx: CompileCtx = { track, rng: seededRng(seed), newId: uniqueIdFactory(6), paceSeconds: CATALOG[track].paceSeconds };
  if (game.engine === 'jargon') ctx.dictHashes = dictHashes(track);
  if (game.workup) {
    ctx.vocabRef = { id: game.workup.vocabId, hash: vocabHash(game.workup.vocabId) };
    ctx.attributes = game.workup.attributes;
    ctx.prompt = game.workup.prompt;
  }
  return ctx;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export function compileSlot(input: CompileInput): Compiled<unknown, unknown> {
  const pid = puzzleIdFor(input.track, input.gameId, input.date);
  const engine = engineFor(input.gameId);
  const ctx = compileCtx(input.track, input.gameId, pid);
  let authored = input.items.map((i) => engine.authoredSchema.parse(i.content));
  if (engine.id === 'gauntlet' && input.keyTally) {
    const tally = input.keyTally;
    authored = (authored as GauntletAuthored[]).map((q) => {
      const letters = LETTERS.slice(0, q.options.length);
      const least = [...letters].sort((a, b) => (tally[a] ?? 0) - (tally[b] ?? 0) || ctx.rng() - 0.5)[0]!;
      const out = reletter(q, least);
      tally[out.correctOptionId] = (tally[out.correctOptionId] ?? 0) + 1;
      return out;
    });
  }
  const compiled = engine.compile(authored, ctx);
  engine.publicSchema.parse(compiled.public);
  engine.secretSchema.parse(compiled.secret);
  assertNoLeak(engine.secretStrings(compiled.secret as never), compiled.public, pid);
  return compiled;
}

/** The compiled public payload must not contain any secret-only string (§17.1 leak test). */
export function assertNoLeak(secrets: string[], pub: unknown, label: string): void {
  const hay = JSON.stringify(pub).toLowerCase();
  for (const s of secrets) {
    if (s && s.length >= 4 && hay.includes(JSON.stringify(s).slice(1, -1).toLowerCase()))
      throw new Error(`Secret leak in ${label}: "${s.slice(0, 40)}"`);
  }
}

/** Compiles and inserts a puzzle (version 1) and marks its items used. */
export async function publishSlot(repo: Repo, input: CompileInput, difficulty: number): Promise<string> {
  const compiled = compileSlot(input);
  const id = puzzleIdFor(input.track, input.gameId, input.date);
  await repo.insertPuzzle(
    {
      id,
      track: input.track,
      gameId: input.gameId,
      engine: engineFor(input.gameId).id,
      date: input.date,
      number: puzzleNumber(input.date, input.launchDate),
      itemIds: input.items.map((i) => i.id),
      difficulty,
      status: 'scheduled',
    },
    { version: 1, public: compiled.public, secret: compiled.secret, createdBy: 'scheduler' },
  );
  await repo.markItemsUsed(
    input.items.map((i) => i.id),
    input.date,
  );
  return id;
}

/** Evaluation context (dictionary / vocab) for an engine on the server. */
export function vocabFor(track: TrackId, gameId: GameId) {
  const g = gameById(track, gameId);
  return g?.workup ? vocabMap(g.workup.vocabId) : undefined;
}
