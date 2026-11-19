'use client';
import {
  addDays,
  daysBetween,
  mergeHistory,
  recomputeStreaks,
  type GameId,
  type GameStatus,
  type HistoryRecord,
  type ISODate,
  type Streaks,
  type TrackId,
} from '@prepdle/core';
import { create } from 'zustand';
import * as storage from './storage';

export const SCHEMA_VERSION = 1;

export interface Settings {
  theme: 'system' | 'light' | 'dark';
  highContrast: boolean;
  reduceMotion: 'system' | 'on';
  jargonHardMode: boolean;
  gauntletTimed: boolean;
  haptics: boolean;
  favoriteTrack?: TrackId;
  seenHowTo: Partial<Record<string, true>>;
}

export interface GameSave {
  puzzleId: string;
  version: number;
  number: number;
  startedAt: string;
  completedAt?: string;
  transcript: unknown[];
  steps: unknown[];
  status: GameStatus;
  outcome?: Record<string, unknown>;
  reveal?: unknown;
  uiExtras?: Record<string, unknown>;
  submitted: boolean;
  globalStats?: import('@prepdle/core').PuzzleStats;
  voided?: boolean;
}
export type DaySaves = Partial<Record<string, GameSave>>;

export interface OutboxEntry {
  id: string;
  body: { puzzleId: string; version: number; transcript: unknown[]; meta: Record<string, unknown> };
  date: ISODate;
  key: string;
  attempts: number;
  nextAt: number;
  createdAt: number;
}

interface Meta {
  schemaVersion: number;
  createdAt: string;
  completedDays: number;
  installPromptShownAt?: string;
  restoredAt?: string;
}

const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  highContrast: false,
  reduceMotion: 'system',
  jargonHardMode: false,
  gauntletTimed: false,
  haptics: true,
  seenHowTo: {},
};

export const saveKey = (track: TrackId, gameId: GameId) => `${track}:${gameId}`;

interface State {
  hydrated: boolean;
  settings: Settings;
  history: HistoryRecord[];
  streaks: Streaks;
  days: Record<string, DaySaves>;
  outbox: OutboxEntry[];
  meta: Meta;
  hydrate(): void;
  setSettings(p: Partial<Settings>): void;
  loadDay(date: ISODate): DaySaves;
  putSave(date: ISODate, key: string, save: GameSave): void;
  removeSave(date: ISODate, key: string): void;
  recordCompletion(rec: HistoryRecord): void;
  mergeServerHistory(h: HistoryRecord[]): number;
  enqueue(e: OutboxEntry): void;
  dequeue(id: string): void;
  reschedule(id: string, nextAt: number): void;
  resetAll(): void;
  importData(data: { settings?: Partial<Settings>; history?: HistoryRecord[] }): void;
}

function migrate(): Meta {
  const meta = storage.read<Meta | null>('meta', null);
  if (!meta) {
    const m: Meta = { schemaVersion: SCHEMA_VERSION, createdAt: new Date().toISOString(), completedDays: 0 };
    storage.write('meta', m);
    return m;
  }
  if (meta.schemaVersion > SCHEMA_VERSION) {
    // Future schema: keep data untouched; UI shows a refresh banner.
    window.dispatchEvent(new CustomEvent('pd:schema-newer'));
  }
  return meta;
}

function pruneDays(today: ISODate) {
  for (const k of storage.keys()) {
    if (!k.startsWith('day:')) continue;
    const d = k.slice(4);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && daysBetween(d, today) > 30) storage.remove(k);
  }
}

export const useStore = create<State>((set, get) => ({
  hydrated: false,
  settings: DEFAULT_SETTINGS,
  history: [],
  streaks: { global: { current: 0, max: 0, lastDate: null }, track: {}, game: {} },
  days: {},
  outbox: [],
  meta: { schemaVersion: SCHEMA_VERSION, createdAt: new Date().toISOString(), completedDays: 0 },

  hydrate() {
    if (get().hydrated) return;
    const meta = migrate();
    const settings = { ...DEFAULT_SETTINGS, ...storage.read<Partial<Settings>>('settings', {}) };
    const history = storage.read<HistoryRecord[]>('history', []);
    const outbox = storage.read<OutboxEntry[]>('outbox', []);
    pruneDays(new Date().toISOString().slice(0, 10));
    set({ hydrated: true, meta, settings, history, streaks: recomputeStreaks(history), outbox });
  },

  setSettings(p) {
    const settings = { ...get().settings, ...p };
    storage.write('settings', settings);
    set({ settings });
  },

  loadDay(date) {
    const cached = get().days[date];
    if (cached) return cached;
    const d = storage.read<DaySaves>(`day:${date}`, {});
    set({ days: { ...get().days, [date]: d } });
    return d;
  },

  putSave(date, key, save) {
    const day = { ...get().loadDay(date), [key]: save };
    storage.write(`day:${date}`, day);
    set({ days: { ...get().days, [date]: day } });
  },

  removeSave(date, key) {
    const day = { ...get().loadDay(date) };
    delete day[key];
    storage.write(`day:${date}`, day);
    set({ days: { ...get().days, [date]: day } });
  },

  recordCompletion(rec) {
    const prev = get().history;
    if (prev.some((r) => r.d === rec.d && r.t === rec.t && r.g === rec.g)) return;
    const history = [...prev, rec].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
    const newDay = !prev.some((r) => r.d === rec.d);
    const meta = { ...get().meta, completedDays: get().meta.completedDays + (newDay ? 1 : 0) };
    storage.write('history', history);
    storage.write('meta', meta);
    set({ history, streaks: recomputeStreaks(history), meta });
  },

  mergeServerHistory(server) {
    const before = get().history.length;
    const history = mergeHistory(get().history, server);
    storage.write('history', history);
    const meta = { ...get().meta, restoredAt: new Date().toISOString(), completedDays: new Set(history.map((h) => h.d)).size };
    storage.write('meta', meta);
    set({ history, streaks: recomputeStreaks(history), meta });
    return history.length - before;
  },

  enqueue(e) {
    const outbox = [...get().outbox.filter((x) => x.id !== e.id), e];
    storage.write('outbox', outbox);
    set({ outbox });
  },
  dequeue(id) {
    const outbox = get().outbox.filter((x) => x.id !== id);
    storage.write('outbox', outbox);
    set({ outbox });
  },
  reschedule(id, nextAt) {
    const outbox = get().outbox.map((x) => (x.id === id ? { ...x, attempts: x.attempts + 1, nextAt } : x));
    storage.write('outbox', outbox);
    set({ outbox });
  },

  resetAll() {
    storage.clearAll();
    set({ settings: DEFAULT_SETTINGS, history: [], streaks: recomputeStreaks([]), days: {}, outbox: [], meta: migrate() });
  },

  importData(data) {
    if (data.settings) get().setSettings(data.settings);
    if (data.history) get().mergeServerHistory(data.history);
  },
}));

/** Per-game local stats from history (§4.5). */
export function gameStats(history: HistoryRecord[], track: TrackId, gameId: GameId) {
  const rs = history.filter((r) => r.t === track && r.g === gameId && r.b !== 'VOID');
  const distribution: Record<string, number> = {};
  for (const r of rs) distribution[r.b] = (distribution[r.b] ?? 0) + 1;
  return { played: rs.length, passed: rs.filter((r) => r.p === 1).length, distribution };
}

/** Days in the last `n` days with ≥ 1 completion (for the history calendar). */
export function activeDays(history: HistoryRecord[], today: ISODate, n = 84): Set<string> {
  const from = addDays(today, -n);
  return new Set(history.filter((r) => r.d >= from).map((r) => r.d));
}
