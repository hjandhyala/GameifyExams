import { isISODate } from '@prepdle/core';
import type { NextRequest } from 'next/server';
import { requireDevice } from '@/server/device';
import { json, route } from '@/server/http';
import { deviceHistory } from '@/server/identity';

export const GET = route('me.history', async (req: NextRequest) => {
  const d = requireDevice(req);
  const since = req.nextUrl.searchParams.get('since');
  return json({ history: d ? await deviceHistory(d.hash, since && isISODate(since) ? since : undefined) : [] }, { cache: 'private' });
});
