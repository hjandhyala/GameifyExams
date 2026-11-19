import type { NextRequest } from 'next/server';
import { ipHash } from '@/server/device';
import { json, route } from '@/server/http';
import { assertPlayable, getPublicPuzzle, nowMs, parseSlot } from '@/server/puzzles';
import { rateLimit } from '@/server/ratelimit';

type Ctx = { params: Promise<{ track: string; game: string; date: string }> };

export const GET = route('puzzle', async (req: NextRequest, ctx: Ctx) => {
  const p = await ctx.params;
  const slot = parseSlot(p.track, p.game, p.date);
  assertPlayable(slot.date, nowMs(req.headers.get('x-debug-now')));
  await rateLimit('puzzleGetIp', ipHash(req));
  const envelope = await getPublicPuzzle(slot.track, slot.gameId, slot.date);
  return json(envelope, { cache: { sMaxAge: 60, swr: 600 } });
});
