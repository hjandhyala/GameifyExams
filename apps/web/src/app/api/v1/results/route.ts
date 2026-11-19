import type { NextRequest } from 'next/server';
import { requireDevice } from '@/server/device';
import { AppError } from '@/server/errors';
import { assertSameOrigin, body, json, route } from '@/server/http';
import { nowMs } from '@/server/puzzles';
import { rateLimit } from '@/server/ratelimit';
import { ResultSubmission, submitResult } from '@/server/results';

export const POST = route('results', async (req: NextRequest) => {
  assertSameOrigin(req);
  const device = requireDevice(req);
  if (!device) throw new AppError('UNAUTHORIZED', 'Missing device cookie');
  await rateLimit('resultsDevice', device.hash.toString('base64url'));
  const sub = await body(req, ResultSubmission, 16_384);
  const r = await submitResult(sub, device, nowMs(req.headers.get('x-debug-now')));
  return json(r);
});
