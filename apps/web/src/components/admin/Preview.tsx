'use client';
import { engineFor, gameById, type GameId, type PuzzleEnvelope, type TrackId, type VocabEntry } from '@prepdle/core';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import type { GameSave } from '@/client/store';
import type { DailyGame, VocabFile } from '@/client/useDailyGame';

const ENGINES = {
  quartet: dynamic(() => import('@/components/games/Quartet')),
  jargon: dynamic(() => import('@/components/games/Jargon')),
  workup: dynamic(() => import('@/components/games/Workup')),
  gauntlet: dynamic(() => import('@/components/games/Gauntlet')),
  classify: dynamic(() => import('@/components/games/Classify')),
} as const;

/** Plays a compiled puzzle locally with the real engine UI (admin preview; secrets are visible to staff). */
export function Preview({ track, gameId, pub, secret, vocabUrl }: { track: TrackId; gameId: GameId; pub: unknown; secret: unknown; vocabUrl?: string }) {
  const engine = engineFor(gameId);
  const config = gameById(track, gameId)!;
  const [save, setSave] = useState<GameSave | undefined>();
  const [vocab, setVocab] = useState<VocabFile>();
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (vocabUrl) fetch(vocabUrl).then((r) => r.json()).then(setVocab);
  }, [vocabUrl]);
  const vocabMap = useMemo(() => (vocab ? new Map(vocab.entries.map((e) => [e.id, e as VocabEntry])) : undefined), [vocab]);
  const puzzle: PuzzleEnvelope = { puzzleId: 'preview', track, gameId, engine: engine.id, date: '2000-01-01', number: 0, version: 1, difficulty: 3, payload: pub };
  const g: DailyGame = {
    phase: !save || save.status === 'in_progress' ? 'ready' : 'completed',
    date: '2000-01-01',
    puzzle,
    save,
    vocab,
    vocabMap,
    dispatchMove: async (move) => {
      const cur = save ?? { puzzleId: 'preview', version: 1, number: 0, startedAt: '', transcript: [], steps: [], status: 'in_progress' as const, submitted: true };
      const v = engine.validateMove(pub, cur.transcript, cur.steps, move, { vocab: vocabMap });
      if (!v.ok) return v;
      try {
        const transcript = [...cur.transcript, move];
        const r = engine.evaluate(pub, secret, transcript, { vocab: vocabMap });
        const next: GameSave = { ...cur, transcript, steps: r.steps, status: r.status, outcome: (r.outcome as Record<string, unknown>) ?? cur.outcome, reveal: r.reveal ?? cur.reveal };
        latest = next;
        setSave(next);
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: (e as Error).message };
      }
    },
    playCorrected: () => {},
    skipVoided: () => {},
    reload: () => {
      setSave(undefined);
      setNonce((n) => n + 1);
    },
    latest: () => latest,
  };
  let latest = save;
  const Engine = ENGINES[engine.id];
  return (
    <div className="rounded-2xl border border-border bg-bg py-3" data-track={track}>
      <div className="flex items-center justify-between px-4 pb-2 text-sm">
        <span className="font-bold">Live preview: {config.name}</span>
        <button className="underline" onClick={g.reload}>
          Reset
        </button>
      </div>
      <Engine key={nonce} g={g} track={track} config={config} timedMode="off" bonusEnabled openResults={() => {}} />
      {save?.status && save.status !== 'in_progress' && <p className="mt-3 px-4 text-sm font-bold">Result: {engine.scoreLabel(save.outcome!)}</p>}
    </div>
  );
}
