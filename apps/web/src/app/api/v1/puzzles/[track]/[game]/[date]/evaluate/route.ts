import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ipHash, requireDevice } from '@/server/device';
import { AppError } from '@/server/errors';
import { assertSameOrigin, body, json, route } from '@/server/http';
import { assertSubmittable, evaluateTranscript, getPuzzleRow, nowMs, parseSlot, versionForPlay } from '@/server/puzzles';
import { rateLimit } from '@/server/ratelimit';

type Ctx = { params: Promise<{ track: string; game: string; date: string }> };

const Body = z.object({
  version: z.number().int().min(1),
  transcript: z.array(z.unknown()).max(12),
  flags: z.object({ hardMode: z.boolean().optional() }).default({}),
});

export const POST = route('evaluate', async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const p = await ctx.params;
  const slot = parseSlot(p.track, p.game, p.date);
  assertSubmittable(slot.date, nowMs(req.headers.get('x-debug-now')));
  const device = requireDevice(req);
  if (!device) throw new AppError('UNAUTHORIZED', 'Missing device cookie');
  await rateLimit('evaluateDevice', device.hash.toString('base64url'));
  await rateLimit('evaluateIp', ipHash(req));
  const b = await body(req, Body);
  const puzzle = await getPuzzleRow(slot.track, slot.gameId, slot.date);
  const v = await versionForPlay(puzzle, b.version);
  const r = evaluateTranscript(slot.track, slot.gameId, v, b.transcript, !!b.flags.hardMode);
  return json(r);
});
