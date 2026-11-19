import { isISODate, puzzleNumber } from '@prepdle/core';
import type { NextRequest } from 'next/server';
import { getRepo } from '@/server/db';
import { gameEnabled, LAUNCH_DATE } from '@/server/env';
import { AppError } from '@/server/errors';
import { json, route } from '@/server/http';
import { assertPlayable, nowMs } from '@/server/puzzles';

export const GET = route('days', async (req: NextRequest, ctx: { params: Promise<{ date: string }> }) => {
  const { date } = await ctx.params;
  if (!isISODate(date)) throw new AppError('BAD_REQUEST', 'Invalid date');
  assertPlayable(date, nowMs(req.headers.get('x-debug-now')));
  const rows = await (await getRepo()).puzzlesOnDate(date);
  return json(
    {
      date,
      number: puzzleNumber(date, LAUNCH_DATE),
      puzzles: rows
        .filter((p) => gameEnabled(p.track, p.gameId))
        .map((p) => ({ track: p.track, gameId: p.gameId, puzzleId: p.id, version: p.currentVersion, difficulty: p.difficulty, status: p.status === 'voided' ? 'voided' : 'live' })),
    },
    { cache: { sMaxAge: 60, swr: 600 } },
  );
});
