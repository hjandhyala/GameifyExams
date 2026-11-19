import type { NextRequest } from 'next/server';
import { requireDevice } from '@/server/device';
import { AppError } from '@/server/errors';
import { assertSameOrigin, json, route } from '@/server/http';
import { createTransferCode } from '@/server/identity';
import { rateLimit } from '@/server/ratelimit';

export const POST = route('me.transfer.create', async (req: NextRequest) => {
  assertSameOrigin(req);
  const d = requireDevice(req);
  if (!d) throw new AppError('UNAUTHORIZED', 'Missing device cookie');
  await rateLimit('transferCreate', d.hash.toString('base64url'));
  return json(await createTransferCode(d.did, d.hash));
});
