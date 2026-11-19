'use client';
import {
  buildGameShare,
  displayStreak,
  engineFor,
  gameById,
  type EvalCtx,
  type GameId,
  type HistoryRecord,
  type PuzzleEnvelope,
  type PuzzleStats,
  type TrackId,
  type VocabEntry,
} from '@prepdle/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { durationBucket, track as trackEvent } from './analytics';
import { api, ApiError } from './api';
import { haptic } from './haptics';
import { enqueueResult } from './outbox';
import { saveKey, useStore, type GameSave } from './store';
import { currentDate } from './today';

export type Phase = 'loading' | 'error' | 'ready' | 'submitting' | 'completed';

export interface VocabFile {
  id: string;
  attributes: { key: string; label: string }[];
  entries: (VocabEntry & { syn: string[]; abbr: string[]; commonness: number })[];
}

export interface DailyGame {
  phase: Phase;
  error?: ApiError;
  date: string | null;
  puzzle?: PuzzleEnvelope;
  save?: GameSave;
  dictionary?: Set<string>;
  vocab?: VocabFile;
  vocabMap?: Map<string, VocabEntry>;
  voided?: { replacementVersion?: number };
  /** Validates (client-side, public rules) and submits a move. Resolves with a reason when rejected locally. */
  dispatchMove: (move: unknown) => Promise<{ ok: true } | { ok: false; reason: string }>;
  shareText?: string;
  globalStats?: PuzzleStats;
  playCorrected: () => void;
  skipVoided: () => void;
  reload: () => void;
  /** Freshest persisted save (use right after awaiting dispatchMove). */
  latest: () => GameSave | undefined;
}

const dictCache = new Map<string, Promise<Set<string>>>();
const vocabCache = new Map<string, Promise<VocabFile>>();

function loadDictionary(ref: { track: string; length: number; hash: string }): Promise<Set<string>> {
  const url = `/dict/${ref.track}/${ref.length}.${ref.hash}.txt`;
  let p = dictCache.get(url);
  if (!p) {
    p = fetch(url).then(async (r) => {
      if (!r.ok) throw new ApiError('ASSET', r.status, 'Could not load the word list');
      return new Set((await r.text()).split('\n'));
    });
    dictCache.set(url, p);
  }
  return p;
}

function loadVocab(ref: { id: string; hash: string }): Promise<VocabFile> {
  const url = `/vocab/${ref.id}.${ref.hash}.json`;
  let p = vocabCache.get(url);
  if (!p) {
    p = fetch(url).then(async (r) => {
      if (!r.ok) throw new ApiError('ASSET', r.status, 'Could not load the answer list');
      return (await r.json()) as VocabFile;
    });
    vocabCache.set(url, p);
  }
  return p;
}

export function historyRecordFor(track: TrackId, gameId: GameId, date: string, outcome: Record<string, unknown>, steps: unknown[]): HistoryRecord {
  const engine = engineFor(gameId);
  const rec: HistoryRecord = { d: date, t: track, g: gameId, p: engine.passed(outcome) ? 1 : 0, b: engine.bucket(outcome) };
  if (engine.id === 'gauntlet') {
    const s = steps as { correct: boolean; confidence: number; blueprint: { code: string } }[];
    rec.x = { pts: outcome.points as number, conf: s.map((x) => x.confidence), ok: s.map((x) => (x.correct ? 1 : 0)), bp: s.map((x) => x.blueprint.code) };
  }
  return rec;
}

export function useDailyGame(track: TrackId, gameId: GameId): DailyGame {
  const key = saveKey(track, gameId);
  const engine = engineFor(gameId);
  const [date, setDate] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<ApiError>();
  const [puzzle, setPuzzle] = useState<PuzzleEnvelope>();
  const [dictionary, setDictionary] = useState<Set<string>>();
  const [vocab, setVocab] = useState<VocabFile>();
  const [voided, setVoided] = useState<{ replacementVersion?: number }>();
  const [reloadTick, setReloadTick] = useState(0);
  const save = useStore((s) => (date ? s.days[date]?.[key] : undefined));
  const settings = useStore((s) => s.settings);
  const streaks = useStore((s) => s.streaks);
  const inflight = useRef(false);

  const vocabMap = useMemo(() => (vocab ? new Map(vocab.entries.map((e) => [e.id, e as VocabEntry])) : undefined), [vocab]);

  // ------------------------------------------------------------ load
  useEffect(() => {
    let cancelled = false;
    const st = useStore.getState();
    st.hydrate();
    const d = currentDate();
    setDate(d);
    setPhase('loading');
    setError(undefined);
    (async () => {
      try {
        const env = await api.puzzle(track, gameId, d);
        if (cancelled) return;
        const pub = env.payload as Record<string, unknown>;
        const assets: Promise<unknown>[] = [];
        if (engine.id === 'jargon') assets.push(loadDictionary(pub.dictionaryRef as never).then((s) => !cancelled && setDictionary(s)));
        if (engine.id === 'workup') assets.push(loadVocab(pub.vocabRef as never).then((v) => !cancelled && setVocab(v)));
        let existing = useStore.getState().loadDay(d)[key];
        if (existing && existing.puzzleId !== env.puzzleId) existing = undefined;
        if (!existing) {
          // Restore from server if this device already finished it (localStorage lost, cookie kept).
          try {
            const day = await api.meDay(d);
            const done = day.results.find((r) => r.puzzleId === env.puzzleId);
            if (done?.transcript) {
              const r = await api.evaluate(track, gameId, d, { version: done.version, transcript: done.transcript });
              const restored: GameSave = {
                puzzleId: env.puzzleId,
                version: done.version,
                number: env.number,
                startedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
                transcript: done.transcript,
                steps: r.steps,
                status: r.status,
                outcome: r.outcome as Record<string, unknown>,
                reveal: r.reveal,
                submitted: true,
              };
              useStore.getState().putSave(d, key, restored);
              if (r.outcome) useStore.getState().recordCompletion(historyRecordFor(track, gameId, d, r.outcome as Record<string, unknown>, r.steps));
              existing = restored;
            }
          } catch {
            /* best effort */
          }
        }
        await Promise.all(assets);
        if (cancelled) return;
        setPuzzle(env);
        if (existing?.status && existing.status !== 'in_progress') setPhase('completed');
        else setPhase('ready');
        if (!existing) trackEvent('game_start', { track, game: gameId, puzzleNumber: env.number });
      } catch (e) {
        if (cancelled) return;
        const err = e instanceof ApiError ? e : new ApiError('UNKNOWN', 0, (e as Error).message);
        if (err.code === 'PUZZLE_VOIDED') setVoided({});
        setError(err);
        setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [track, gameId, key, engine.id, reloadTick]);

  const evalCtx: EvalCtx = useMemo(
    () => ({ dictionary, vocab: vocabMap, hardMode: gameId === 'jargon' && (save?.uiExtras?.hardMode as boolean | undefined) }),
    [dictionary, vocabMap, gameId, save?.uiExtras?.hardMode],
  );

  // ------------------------------------------------------------ moves
  const dispatchMove = useCallback(
    async (move: unknown): Promise<{ ok: true } | { ok: false; reason: string }> => {
      if (!puzzle || !date || inflight.current) return { ok: false, reason: 'Please wait…' };
      const st = useStore.getState();
      const current: GameSave =
        st.loadDay(date)[key] ??
        ({
          puzzleId: puzzle.puzzleId,
          version: puzzle.version,
          number: puzzle.number,
          startedAt: new Date().toISOString(),
          transcript: [],
          steps: [],
          status: 'in_progress',
          submitted: false,
          uiExtras: gameId === 'jargon' ? { hardMode: settings.jargonHardMode } : gameId === 'gauntlet' ? { timed: settings.gauntletTimed } : {},
        } satisfies GameSave);
      const isBonus = (move as { type?: string }).type === 'bonus';
      if (current.status !== 'in_progress' && !isBonus) return { ok: false, reason: 'This game is finished' };
      const hardMode = !!current.uiExtras?.hardMode;
      const v = engine.validateMove(puzzle.payload, current.transcript, current.steps, move, { ...evalCtx, hardMode });
      if (!v.ok) return v;

      inflight.current = true;
      setPhase('submitting');
      const transcript = [...current.transcript, move];
      try {
        const r = await api.evaluate(track, gameId, date, { version: current.version, transcript, flags: { hardMode } });
        const wasTerminal = current.status !== 'in_progress';
        const next: GameSave = {
          ...current,
          transcript,
          steps: r.steps,
          status: r.status,
          outcome: (r.outcome as Record<string, unknown>) ?? current.outcome,
          reveal: r.reveal ?? current.reveal,
        };
        if (!wasTerminal && r.status !== 'in_progress' && r.outcome) {
          next.completedAt = new Date().toISOString();
          useStore.getState().putSave(date, key, next);
          useStore.getState().recordCompletion(historyRecordFor(track, gameId, date, r.outcome as Record<string, unknown>, r.steps));
          haptic(r.status === 'won' ? [10, 40, 10] : 30);
          const ms = Date.parse(next.completedAt) - Date.parse(next.startedAt);
          trackEvent('game_complete', { track, game: gameId, passed: r.status === 'won', bucket: engine.bucket(r.outcome), durationBucket: durationBucket(ms), hintsUsed: (r.outcome as { hintsUsed?: number }).hintsUsed });
          enqueueResult({
            id: `${next.puzzleId}`,
            date,
            key,
            body: { puzzleId: next.puzzleId, version: next.version, transcript, meta: { durationMs: ms, hardMode, timed: !!next.uiExtras?.timed, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? '1.0.0' } },
          });
          setPhase('completed');
        } else {
          useStore.getState().putSave(date, key, next);
          if (isBonus) {
            enqueueResult({ id: `${next.puzzleId}:bonus`, date, key, body: { puzzleId: next.puzzleId, version: next.version, transcript, meta: { hardMode } } });
          }
          setPhase(next.status === 'in_progress' ? 'ready' : 'completed');
        }
        return { ok: true };
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError('UNKNOWN', 0, String(e));
        setPhase(current.status === 'in_progress' ? 'ready' : 'completed');
        if (err.code === 'PUZZLE_VOIDED') {
          setVoided({ replacementVersion: err.details.replacementVersion as number | undefined });
          return { ok: false, reason: 'This puzzle was corrected' };
        }
        if (err.code === 'NETWORK') return { ok: false, reason: 'Connection issue: try again' };
        return { ok: false, reason: err.message };
      } finally {
        inflight.current = false;
      }
    },
    [puzzle, date, key, engine, evalCtx, track, gameId, settings.jargonHardMode, settings.gauntletTimed],
  );

  // ------------------------------------------------------------ voided puzzle handling (§8.9)
  const playCorrected = useCallback(() => {
    if (date) useStore.getState().removeSave(date, key);
    setVoided(undefined);
    setReloadTick((t) => t + 1);
  }, [date, key]);

  const skipVoided = useCallback(() => {
    if (date && puzzle) {
      const st = useStore.getState();
      const cur = st.loadDay(date)[key];
      if (cur) st.putSave(date, key, { ...cur, voided: true, status: 'lost' });
      st.recordCompletion({ d: date, t: track, g: gameId, p: 0, b: 'VOID' });
    }
    setVoided(undefined);
  }, [date, puzzle, key, track, gameId]);

  // ------------------------------------------------------------ share text
  const shareText = useMemo(() => {
    if (!puzzle || !save?.outcome || save.status === 'in_progress' || save.voided) return undefined;
    const theme = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    const lines = engine.shareLines(puzzle.payload, save.steps, save.outcome, { theme, highContrast: settings.highContrast });
    return buildGameShare({
      track,
      gameId,
      number: puzzle.number,
      scoreLabel: engine.scoreLabel(save.outcome),
      lines,
      streak: date ? displayStreak(streaks.global, date) : 0,
      domain: typeof window !== 'undefined' && process.env.NEXT_PUBLIC_SHARE_DOMAIN ? process.env.NEXT_PUBLIC_SHARE_DOMAIN : undefined,
    });
  }, [puzzle, save, engine, settings.highContrast, track, gameId, streaks.global, date]);

  // Global stats arrive asynchronously from the outbox.
  const [globalStats, setGlobalStats] = useState<PuzzleStats | undefined>(save?.globalStats);
  useEffect(() => setGlobalStats(save?.globalStats), [save?.globalStats]);
  useEffect(() => {
    if (phase === 'completed' && puzzle && !save?.globalStats && save?.submitted) {
      api.stats(puzzle.puzzleId).then(setGlobalStats).catch(() => {});
    }
  }, [phase, puzzle, save?.globalStats, save?.submitted]);

  return {
    phase,
    error,
    date,
    puzzle,
    save,
    dictionary,
    vocab,
    vocabMap,
    voided,
    dispatchMove,
    shareText,
    globalStats,
    playCorrected,
    skipVoided,
    reload: () => setReloadTick((t) => t + 1),
    latest: () => (date ? useStore.getState().days[date]?.[key] : undefined),
  };
}

export const gameConfig = (track: TrackId, gameId: GameId) => gameById(track, gameId)!;
