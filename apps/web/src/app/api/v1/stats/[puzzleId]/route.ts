import type { NextRequest } from 'next/server';
import { getRepo } from '@/server/db';
import { FLAGS } from '@/server/env';
import { AppError } from '@/server/errors';
import { json, route } from '@/server/http';
import { puzzleStats } from '@/server/results';

export const GET = route('stats', async (_req: NextRequest, ctx: { params: Promise<{ puzzleId: string }> }) => {
  const { puzzleId } = await ctx.params;
  if (!FLAGS.showGlobalStats) throw new AppError('NOT_FOUND', 'Stats disabled');
  const p = await (await getRepo()).getPuzzleById(puzzleId);
  if (!p) throw new AppError('NOT_FOUND', 'Unknown puzzle');
  const s = await puzzleStats(p);
  return json({ ...s, updatedAt: new Date().toISOString() }, { cache: { sMaxAge: 60, swr: 300 } });
});
