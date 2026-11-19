import { parsePuzzleId } from '@prepdle/core';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { getRepo } from '@/server/db';
import { requireDevice } from '@/server/device';
import { AppError } from '@/server/errors';
import { assertSameOrigin, body, json, route } from '@/server/http';
import { rateLimit } from '@/server/ratelimit';

const Report = z.object({
  puzzleId: z.string().max(64),
  itemId: z.string().max(64).optional(),
  category: z.enum(['wrong_answer', 'ambiguous', 'outdated', 'typo', 'too_easy_hard', 'offensive_biased', 'bug', 'other']),
  message: z.string().max(1000).optional(),
  context: z.object({ version: z.number().int().optional(), stepIndex: z.number().int().optional() }).optional(),
});

export const POST = route('reports', async (req: NextRequest) => {
  assertSameOrigin(req);
  const d = requireDevice(req);
  if (!d) throw new AppError('UNAUTHORIZED', 'Missing device cookie');
  await rateLimit('reportsDevice', d.hash.toString('base64url'));
  const r = await body(req, Report);
  if (!parsePuzzleId(r.puzzleId)) throw new AppError('BAD_REQUEST', 'Unknown puzzle');
  await (await getRepo()).insertReport({
    puzzleId: r.puzzleId,
    itemId: r.itemId ?? null,
    version: r.context?.version ?? null,
    deviceHash: d.hash,
    category: r.category,
    message: r.message ?? null,
    context: r.context ?? null,
  });
  return json({ accepted: true }, { status: 202 });
});
