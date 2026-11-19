import 'server-only';
import { engineFor, gameById, parsePuzzleId, percentile, type GameId, type PuzzleStats, type TrackId } from '@prepdle/core';
import { vocabMap } from '@prepdle/content';
import type { PuzzleRow } from '@prepdle/db';
import { z } from 'zod';
import { getRepo } from './db';
import { DEV_FEATURES, FLAGS } from './env';
import { AppError } from './errors';
import { assertSubmittable, evaluateTranscript, versionForPlay } from './puzzles';

export const ResultSubmission = z.object({
  puzzleId: z.string().max(64),
  version: z.number().int().min(1),
  transcript: z.array(z.unknown()).max(12),
  meta: z
    .object({
      durationMs: z.number().int().min(0).max(86_400_000).optional(),
      hardMode: z.boolean().optional(),
      timed: z.boolean().optional(),
      tz: z.string().max(64).optional(),
      appVersion: z.string().max(32).optional(),
    })
    .default({}),
});
export type ResultSubmission = z.infer<typeof ResultSubmission>;

const MIN_PLAYERS_TOP_GUESSES = Number(process.env.MIN_PLAYERS_TOP_GUESSES ?? (DEV_FEATURES ? 1 : 30));

export async function puzzleStats(p: PuzzleRow, bucket?: string): Promise<PuzzleStats> {
  const repo = await getRepo();
  const distribution = await repo.aggregates(p.id);
  const players = Object.values(distribution).reduce((a, b) => a + b, 0);
  const engine = engineFor(p.gameId as GameId);
  const stats: PuzzleStats = { players, distribution };
  if (bucket) stats.percentile = percentile(distribution, engine.bucketOrder, bucket);
  if (engine.id === 'workup' && players >= MIN_PLAYERS_TOP_GUESSES) {
    const game = gameById(p.track as TrackId, p.gameId as GameId);
    const vocab = game?.workup ? vocabMap(game.workup.vocabId) : undefined;
    const top = await repo.topGuesses(p.id, 5);
    stats.topWrongGuesses = top
      .filter((t) => t.guessKey.startsWith('w:'))
      .map((t) => {
        const id = t.guessKey.slice(2);
        return { key: id, name: vocab?.get(id)?.name ?? id, pct: Math.round((t.count / players) * 100) };
      });
  }
  return stats;
}

export async function submitResult(sub: ResultSubmission, device: { hash: Buffer }, now: number) {
  const slot = parsePuzzleId(sub.puzzleId);
  if (!slot) throw new AppError('BAD_REQUEST', 'Unknown puzzle');
  assertSubmittable(slot.date, now);
  const repo = await getRepo();
  const p = await repo.getPuzzleById(sub.puzzleId);
  if (!p) throw new AppError('PUZZLE_NOT_SCHEDULED', 'Unknown puzzle');
  const v = await versionForPlay(p, sub.version);
  const hardMode = !!sub.meta.hardMode;
  const evalRes = evaluateTranscript(slot.track, slot.gameId, v, sub.transcript, hardMode);
  if (evalRes.status === 'in_progress' || !evalRes.outcome) throw new AppError('NOT_TERMINAL', 'Game is not finished');
  const engine = engineFor(slot.gameId);
  const outcome = evalRes.outcome as Record<string, unknown>;
  const bucket = engine.bucket(outcome);
  const passed = engine.passed(outcome);

  if (FLAGS.dailyLimitMode === 'per_day') {
    const today = await repo.deviceHistory(device.hash, slot.date);
    if (today.some((r) => r.date === slot.date && r.puzzleId !== p.id)) throw new AppError('FORBIDDEN', 'Only one game per day is allowed.');
  }

  const row = {
    puzzleId: p.id,
    version: sub.version,
    deviceHash: device.hash,
    passed,
    bucket,
    outcome,
    transcript: sub.transcript,
    durationMs: sub.meta.durationMs ?? null,
    hardMode,
    timed: !!sub.meta.timed,
    tz: sub.meta.tz ?? null,
    appVersion: sub.meta.appVersion ?? null,
  };

  let inserted = await repo.insertResult(row);
  let storedOutcome = outcome;
  let storedBucket = bucket;
  if (!inserted) {
    const existing = (await repo.getResult(p.id, device.hash))!;
    const existingVersion = await repo.getVersion(p.id, existing.version);
    if (existingVersion?.voided && existing.version !== sub.version) {
      await repo.replaceResult(existing.id, row);
      await repo.bumpAggregate(p.id, bucket, 1);
      inserted = true;
    } else if (existing.version === sub.version && 'bonus' in outcome && !(existing.outcome as Record<string, unknown>).bonus) {
      await repo.setResultBonus(existing.id, outcome.bonus as boolean, sub.transcript);
      storedOutcome = { ...(existing.outcome as Record<string, unknown>), bonus: outcome.bonus };
      storedBucket = existing.bucket;
      await recordBonusResponse(p, device.hash, sub.transcript, outcome.bonus as boolean);
    } else {
      storedOutcome = existing.outcome as Record<string, unknown>;
      storedBucket = existing.bucket;
    }
  }

  if (inserted) {
    await repo.bumpAggregate(p.id, bucket, 1);
    await sideEffects(p, engine.id, device.hash, sub.transcript, evalRes.steps, outcome);
  }
  return { outcome: storedOutcome, bucket: storedBucket, passed: engine.passed(storedOutcome), stats: await puzzleStats(p, storedBucket) };
}

async function recordBonusResponse(p: PuzzleRow, deviceHash: Buffer, transcript: unknown[], correct: boolean) {
  const repo = await getRepo();
  const bonusMove = transcript.find((m) => (m as { type?: string }).type === 'bonus') as { optionId?: string } | undefined;
  await repo.insertItemResponses([{ itemId: `${p.itemIds[0]}:bonus`, puzzleId: p.id, deviceHash, optionId: bonusMove?.optionId ?? null, correct }]);
}

async function sideEffects(p: PuzzleRow, engine: string, deviceHash: Buffer, transcript: unknown[], steps: unknown[], outcome: Record<string, unknown>) {
  const repo = await getRepo();
  if (engine === 'workup') {
    const keys = (steps as { kind: string; entityId?: string; result?: string }[])
      .filter((s) => s.kind === 'guess' && s.result !== 'correct' && s.entityId)
      .map((s) => `w:${s.entityId}`);
    if (keys.length) await repo.bumpGuesses(p.id, keys);
  }
  if (engine === 'jargon') {
    const first = (transcript as { type: string; word?: string }[]).find((m) => m.type === 'guess');
    if (first?.word) await repo.bumpGuesses(p.id, [`first:${first.word.toUpperCase()}`]);
  }
  if (engine === 'gauntlet') {
    const total = outcome.correct as number;
    const rows = (transcript as { optionId: string | null; confidence: number; ms: number }[]).map((m, i) => ({
      itemId: p.itemIds[i] ?? `q${i}`,
      puzzleId: p.id,
      deviceHash,
      optionId: m.optionId,
      correct: (steps[i] as { correct: boolean }).correct,
      confidence: m.confidence,
      ms: m.ms,
      totalCorrect: total,
    }));
    await repo.insertItemResponses(rows);
  }
  if ('bonus' in outcome) await recordBonusResponse(p, deviceHash, transcript, outcome.bonus as boolean);
}
