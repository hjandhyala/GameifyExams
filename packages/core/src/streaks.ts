import { daysBetween } from './date';
import type { GameId, ISODate, TrackId } from './types';

export interface Streak {
  current: number;
  max: number;
  lastDate: ISODate | null;
}

export interface Streaks {
  global: Streak;
  track: Partial<Record<TrackId, Streak>>;
  game: Partial<Record<`${TrackId}:${GameId}`, Streak>>;
}

/** Compact local history record (§8.3). */
export interface HistoryRecord {
  d: ISODate;
  t: TrackId;
  g: GameId;
  p: 0 | 1;
  /** Distribution bucket, or 'VOID' for a voided puzzle the player started, 'SHIELD' for a grace day. */
  b: string;
  x?: { pts?: number; conf?: number[]; ok?: number[]; bp?: string[] };
}

export const emptyStreak = (): Streak => ({ current: 0, max: 0, lastDate: null });

/**
 * Apply one day's completion to a streak. `success` = true for play streaks (any completion),
 * = passed for win streaks. Dates are puzzle dates, not wall-clock completion times.
 */
export function applyDay(s: Streak, d: ISODate, success: boolean): Streak {
  if (s.lastDate && d <= s.lastDate) return s;
  if (!success) return { current: 0, max: s.max, lastDate: null };
  const consecutive = s.lastDate !== null && daysBetween(s.lastDate, d) === 1;
  const current = consecutive ? s.current + 1 : 1;
  return { current, max: Math.max(s.max, current), lastDate: d };
}

/** A streak is alive if its last date is today or yesterday. */
export const displayStreak = (s: Streak | undefined, today: ISODate): number =>
  s?.lastDate && daysBetween(s.lastDate, today) <= 1 ? s.current : 0;

export function recomputeStreaks(history: HistoryRecord[]): Streaks {
  const sorted = [...history].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  const out: Streaks = { global: emptyStreak(), track: {}, game: {} };
  // win-streak tracking needs "last date processed" separately so a loss followed by a gap resets correctly
  for (const r of sorted) {
    out.global = applyDay(out.global, r.d, true);
    out.track[r.t] = applyDay(out.track[r.t] ?? emptyStreak(), r.d, true);
    const key = `${r.t}:${r.g}` as const;
    if (r.b === 'VOID') continue; // neutral for win streaks
    out.game[key] = applyDay(out.game[key] ?? emptyStreak(), r.d, r.p === 1);
  }
  return out;
}

/** Merge local and server histories (server wins on conflicts for the same (date, track, game) only if local is missing). */
export function mergeHistory(a: HistoryRecord[], b: HistoryRecord[]): HistoryRecord[] {
  const map = new Map<string, HistoryRecord>();
  for (const r of [...b, ...a]) map.set(`${r.d}|${r.t}|${r.g}`, r);
  return [...map.values()].sort((x, y) => (x.d < y.d ? -1 : x.d > y.d ? 1 : 0));
}
