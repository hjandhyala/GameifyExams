import {
  addDays,
  allSlots,
  daysBetween,
  GAUNTLET_RAMP_BY_WEEKDAY,
  PUZZLE_DIFFICULTY_BY_WEEKDAY,
  seededRng,
  weekday,
  type GameId,
  type ISODate,
  type TrackId,
} from '@prepdle/core';
import type { ItemRow, Repo } from '@prepdle/db';
import { publishSlot } from './compile';

/** Flattened blueprint: top-level node code → weight, plus leaf code → top-level code. */
export interface BlueprintWeights {
  top: Record<string, number>;
}

export interface ScheduleOptions {
  from: ISODate;
  days: number;
  launchDate: ISODate;
  /** Allow re-using already-published items (fixtures/dev/preview only). */
  allowReuse?: boolean;
  blueprints?: Partial<Record<TrackId, BlueprintWeights>>;
  slots?: { track: TrackId; gameId: GameId }[];
  dryRun?: boolean;
  log?: (msg: string) => void;
}

export interface ScheduleResult {
  filled: { id: string; itemIds: string[] }[];
  unfilled: { track: TrackId; gameId: GameId; date: ISODate }[];
}

const effectiveDifficulty = (i: ItemRow) => (i.difficultyObserved != null ? Math.round(i.difficultyObserved) : i.difficulty);
const topCode = (code: string) => code.split('.').slice(0, 2).join('.');

interface State {
  /** date → concept ids used on that date per track */
  concepts: Map<string, Set<string>>;
  /** item id → true once assigned in this run */
  used: Set<string>;
  /** track → recent top-level codes (most recent last) for the 28-day window */
  coverage: Map<TrackId, { date: ISODate; code: string }[]>;
  /** (track:game) → last leaf code */
  lastLeaf: Map<string, string>;
  /** answer key → last date used (per track/game) */
  answers: Map<string, ISODate>;
  keyTally: Record<string, number>;
}

function deficitGain(codes: string[], track: TrackId, date: ISODate, st: State, bp?: BlueprintWeights): number {
  if (!bp) return 0;
  const window = (st.coverage.get(track) ?? []).filter((c) => daysBetween(c.date, date) <= 28);
  const total = window.length || 1;
  let gain = 0;
  for (const c of new Set(codes.map(topCode))) {
    const target = bp.top[c] ?? 0;
    const share = window.filter((w) => w.code === c).length / total;
    gain += Math.max(0, target - share);
  }
  return gain;
}

function eligible(i: ItemRow, track: TrackId, date: ISODate, st: State, opts: ScheduleOptions): boolean {
  if (st.used.has(i.id)) return false;
  if (!opts.allowReuse) {
    if (!['approved', 'reserve'].includes(i.status)) return false;
    if (i.answerKey) {
      const last = st.answers.get(`${track}:${i.gameId}:${i.answerKey}`);
      if (last && Math.abs(daysBetween(last, date)) < 365) return false;
    }
  }
  const dayConcepts = st.concepts.get(`${track}:${date}`);
  if (dayConcepts && i.conceptIds.some((c) => dayConcepts.has(c))) return false;
  return true;
}

function score(i: ItemRow, target: number, track: TrackId, date: ISODate, st: State, bp?: BlueprintWeights): number {
  const leafKey = `${track}:${i.gameId}`;
  const consecutive = st.lastLeaf.get(leafKey) === i.blueprintCodes[0] ? 1 : 0;
  const reuse = i.timesUsed;
  return 3 * deficitGain(i.blueprintCodes, track, date, st, bp) - 2 * Math.abs(effectiveDifficulty(i) - target) - 1.5 * consecutive - 0.75 * reuse;
}

function pickBest(cands: ItemRow[], target: number, track: TrackId, date: ISODate, st: State, seed: string, bp?: BlueprintWeights): ItemRow | undefined {
  const rng = seededRng(seed);
  let best: ItemRow | undefined;
  let bestScore = -Infinity;
  for (const c of cands) {
    const s = score(c, target, track, date, st, bp) + rng() * 0.01;
    if (s > bestScore) {
      best = c;
      bestScore = s;
    }
  }
  return best;
}

function commit(st: State, track: TrackId, date: ISODate, chosen: ItemRow[]) {
  const key = `${track}:${date}`;
  const set = st.concepts.get(key) ?? new Set<string>();
  for (const it of chosen) {
    st.used.add(it.id);
    it.conceptIds.forEach((c) => set.add(c));
    const cov = st.coverage.get(track) ?? [];
    it.blueprintCodes.forEach((code) => cov.push({ date, code: topCode(code) }));
    st.coverage.set(track, cov);
    st.lastLeaf.set(`${track}:${it.gameId}`, it.blueprintCodes[0] ?? '');
    if (it.answerKey) st.answers.set(`${track}:${it.gameId}:${it.answerKey}`, date);
  }
  st.concepts.set(key, set);
}

/**
 * Greedy, deficit-weighted scheduler (§12.7). Fills empty, unlocked slots from `from` for `days` days,
 * compiling and publishing each puzzle as version 1.
 */
export async function schedule(repo: Repo, opts: ScheduleOptions): Promise<ScheduleResult> {
  const log = opts.log ?? (() => {});
  const to = addDays(opts.from, opts.days - 1);
  const existing = await repo.puzzlesInRange(addDays(opts.from, -28), to);
  const bank = await repo.listItems({ status: opts.allowReuse ? undefined : ['approved', 'reserve'], limit: 100_000 });
  const allItems = opts.allowReuse ? bank.filter((i) => !['auto_rejected', 'retired', 'draft'].includes(i.status)) : bank;
  const byId = new Map(allItems.map((i) => [i.id, i]));

  const st: State = { concepts: new Map(), used: new Set(), coverage: new Map(), lastLeaf: new Map(), answers: new Map(), keyTally: {} };
  // Seed state from already-scheduled puzzles in the window.
  const priorItems = await repo.getItems([...new Set(existing.flatMap((p) => p.itemIds))]);
  const priorById = new Map(priorItems.map((i) => [i.id, i]));
  for (const p of existing) commit(st, p.track as TrackId, p.date, p.itemIds.map((id) => priorById.get(id)).filter((x): x is ItemRow => !!x));
  if (opts.allowReuse) st.used.clear(); // fixtures cycle; concept/coverage state still applies
  const filledSlots = new Set(existing.map((p) => `${p.track}:${p.gameId}:${p.date}`));

  const slots = opts.slots ?? allSlots().map((s) => ({ track: s.track, gameId: s.game.gameId }));
  const result: ScheduleResult = { filled: [], unfilled: [] };

  for (let d = 0; d < opts.days; d++) {
    const date = addDays(opts.from, d);
    const wd = weekday(date);
    if (opts.allowReuse) st.used.clear();
    for (const { track, gameId } of slots) {
      if (filledSlots.has(`${track}:${gameId}:${date}`)) continue;
      const pool = allItems.filter((i) => i.track === track && i.gameId === gameId);
      const seed = `${track}:${gameId}:${date}`;
      let chosen: ItemRow[] = [];
      let difficulty: number;
      if (gameId === 'gauntlet') {
        const ramp = GAUNTLET_RAMP_BY_WEEKDAY[wd]!;
        const bySection = new Map<string, number>();
        for (let q = 0; q < 5; q++) {
          const cands = pool.filter(
            (i) => !chosen.includes(i) && eligible(i, track, date, st, opts) && (bySection.get(topCode(i.blueprintCodes[0] ?? '')) ?? 0) < 2,
          );
          const pick = pickBest(cands, ramp[q]!, track, date, st, `${seed}:${q}`, opts.blueprints?.[track]);
          if (!pick) break;
          chosen.push(pick);
          const sec = topCode(pick.blueprintCodes[0] ?? '');
          bySection.set(sec, (bySection.get(sec) ?? 0) + 1);
        }
        if (chosen.length < 5) {
          // relax the per-section cap before giving up
          const extra = pool.filter((i) => !chosen.includes(i) && eligible(i, track, date, st, opts));
          while (chosen.length < 5 && extra.length) chosen.push(extra.shift()!);
        }
        if (chosen.length < 5) chosen = [];
        chosen.sort((a, b) => effectiveDifficulty(a) - effectiveDifficulty(b));
        difficulty = Math.round(chosen.reduce((a, i) => a + effectiveDifficulty(i), 0) / Math.max(1, chosen.length));
      } else {
        const target = PUZZLE_DIFFICULTY_BY_WEEKDAY[wd]!;
        const cands = pool.filter((i) => eligible(i, track, date, st, opts));
        const pick = pickBest(cands, target, track, date, st, seed, opts.blueprints?.[track]);
        if (pick) chosen = [pick];
        difficulty = pick ? effectiveDifficulty(pick) : target;
      }
      if (!chosen.length) {
        result.unfilled.push({ track, gameId, date });
        log(`unfilled: ${track}/${gameId} ${date}`);
        continue;
      }
      commit(st, track, date, chosen);
      if (opts.dryRun) {
        result.filled.push({ id: `${track}-${gameId}-${date}`, itemIds: chosen.map((c) => c.id) });
        continue;
      }
      const id = await publishSlot(repo, { track, gameId, date, items: chosen.map((c) => byId.get(c.id) ?? c), launchDate: opts.launchDate, keyTally: st.keyTally }, difficulty);
      result.filled.push({ id, itemIds: chosen.map((c) => c.id) });
      log(`filled: ${id}`);
    }
  }
  return result;
}
