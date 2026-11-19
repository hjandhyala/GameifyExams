import 'server-only';
import {
  engineFor,
  gameById,
  isISODate,
  isPlayable,
  isSubmittable,
  isTrackId,
  type EvalCtx,
  type GameId,
  type ISODate,
  type PuzzleEnvelope,
  type TrackId,
  GAME_IDS,
} from '@prepdle/core';
import { dictionary, vocabMap } from '@prepdle/content';
import type { PuzzleRow, PuzzleVersionRow } from '@prepdle/db';
import { decrypt, encrypt } from './crypto';
import { getRepo } from './db';
import { DEV_FEATURES, gameEnabled, LAUNCH_DATE, REDIS_SECRET_KEY } from './env';
import { AppError } from './errors';
import { log } from './log';
import { redis } from './ratelimit';

export function parseSlot(track: string, gameId: string, date: string): { track: TrackId; gameId: GameId; date: ISODate } {
  if (!isTrackId(track)) throw new AppError('NOT_FOUND', 'Unknown track');
  if (!(GAME_IDS as readonly string[]).includes(gameId) || !gameById(track, gameId as GameId)) throw new AppError('NOT_FOUND', 'Unknown game');
  if (!isISODate(date)) throw new AppError('BAD_REQUEST', 'Invalid date');
  if (!gameEnabled(track, gameId)) throw new AppError('GAME_DISABLED', 'This game is not available');
  return { track, gameId: gameId as GameId, date };
}

/** The client may send `?__date=` / `X-Debug-Now` only outside production (fixtures/preview). */
export function nowMs(debugNow?: string | null): number {
  if (DEV_FEATURES && debugNow) {
    const t = Date.parse(debugNow);
    if (!Number.isNaN(t)) return t;
  }
  return Date.now();
}

export function assertPlayable(date: ISODate, now: number) {
  if (DEV_FEATURES && process.env.DEV_ALLOW_ANY_DATE === '1') return;
  if (!isPlayable(date, LAUNCH_DATE, now)) throw new AppError('DATE_NOT_AVAILABLE', 'Puzzle date is outside the playable window.');
}

export function assertSubmittable(date: ISODate, now: number) {
  if (DEV_FEATURES && process.env.DEV_ALLOW_ANY_DATE === '1') return;
  if (!isSubmittable(date, LAUNCH_DATE, now)) throw new AppError('DATE_NOT_AVAILABLE', 'Puzzle date is outside the submission window.');
}

// ---------------------------------------------------------------- secret LRU (§7.5)
const LRU_MAX = 500;
const LRU_TTL = 10 * 60_000;
const lru = new Map<string, { v: PuzzleVersionRow; at: number }>();

async function loadVersion(puzzleId: string, version: number): Promise<PuzzleVersionRow | undefined> {
  const key = `${puzzleId}@${version}`;
  const hit = lru.get(key);
  if (hit && Date.now() - hit.at < LRU_TTL) return hit.v;
  let v: PuzzleVersionRow | undefined;
  try {
    v = await (await getRepo()).getVersion(puzzleId, version);
  } catch (e) {
    log('error', 'db unavailable; trying warm secret cache', { error: (e as Error).message });
    v = await warmSecretGet(puzzleId, version);
    if (!v) throw e;
  }
  if (v) {
    lru.set(key, { v, at: Date.now() });
    if (lru.size > LRU_MAX) lru.delete(lru.keys().next().value!);
  }
  return v;
}

export function invalidateCached(puzzleId: string) {
  for (const k of lru.keys()) if (k.startsWith(`${puzzleId}@`)) lru.delete(k);
}

// ---------------------------------------------------------------- warm secret cache in Redis (§15.4)
export async function warmSecretPut(v: PuzzleVersionRow): Promise<void> {
  if (!redis) return;
  const blob = encrypt(REDIS_SECRET_KEY(), JSON.stringify(v)).toString('base64');
  await redis.set(`secret:${v.puzzleId}@${v.version}`, blob, { ex: 3 * 86_400 });
}
async function warmSecretGet(puzzleId: string, version: number): Promise<PuzzleVersionRow | undefined> {
  if (!redis) return undefined;
  const blob = await redis.get<string>(`secret:${puzzleId}@${version}`);
  if (!blob) return undefined;
  return JSON.parse(decrypt(REDIS_SECRET_KEY(), Buffer.from(blob, 'base64'))) as PuzzleVersionRow;
}

// ---------------------------------------------------------------- public puzzle
export async function getPuzzleRow(track: TrackId, gameId: GameId, date: ISODate): Promise<PuzzleRow> {
  const p = await (await getRepo()).getPuzzle(track, gameId, date);
  if (!p) throw new AppError('PUZZLE_NOT_SCHEDULED', 'No puzzle is scheduled for this day yet.');
  return p;
}

export async function getPublicPuzzle(track: TrackId, gameId: GameId, date: ISODate): Promise<PuzzleEnvelope> {
  const p = await getPuzzleRow(track, gameId, date);
  const v = await loadVersion(p.id, p.currentVersion);
  if (!v || v.voided || p.status === 'voided') throw new AppError('PUZZLE_VOIDED', 'This puzzle was withdrawn.');
  return {
    puzzleId: p.id,
    track,
    gameId,
    engine: p.engine,
    date,
    number: p.number,
    version: p.currentVersion,
    difficulty: p.difficulty,
    payload: v.public,
  };
}

export function evalCtx(track: TrackId, gameId: GameId, hardMode = false): EvalCtx {
  const game = gameById(track, gameId)!;
  return {
    ...(game.engine === 'jargon' ? { dictionary: dictionary(track) } : {}),
    ...(game.workup ? { vocab: vocabMap(game.workup.vocabId) } : {}),
    hardMode,
  };
}

/** Loads the version a client is playing; voided versions return 410 with the replacement (§8.9). */
export async function versionForPlay(p: PuzzleRow, version: number): Promise<PuzzleVersionRow> {
  const v = await loadVersion(p.id, version);
  if (!v) throw new AppError('VERSION_UNKNOWN', 'Unknown puzzle version');
  if (v.voided) {
    const replacement = p.currentVersion > version && p.status !== 'voided' ? p.currentVersion : undefined;
    throw new AppError('PUZZLE_VOIDED', 'This puzzle was corrected. Sorry about that! Your streak is protected.', replacement ? { replacementVersion: replacement } : {});
  }
  return v;
}

export function evaluateTranscript(track: TrackId, gameId: GameId, v: PuzzleVersionRow, transcript: unknown[], hardMode: boolean) {
  const engine = engineFor(gameId);
  const pub = v.public;
  if (transcript.length > engine.maxMoves(pub)) throw new AppError('TOO_MANY_MOVES', 'Transcript too long');
  const moves = transcript.map((m, i) => {
    const r = engine.moveSchema.safeParse(m);
    if (!r.success) throw new AppError('INVALID_MOVE', 'Malformed move', { moveIndex: i });
    return r.data;
  });
  return engine.evaluate(pub, v.secret, moves, evalCtx(track, gameId, hardMode));
}
