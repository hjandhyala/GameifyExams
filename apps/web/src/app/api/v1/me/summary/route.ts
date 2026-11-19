import type { NextRequest } from 'next/server';
import { getRepo } from '@/server/db';
import { requireDevice } from '@/server/device';
import { json, route } from '@/server/http';

export const GET = route('me.summary', async (req: NextRequest) => {
  const d = requireDevice(req);
  if (!d) return json({ firstSeen: null, resultsCount: 0 }, { cache: 'private' });
  return json(await (await getRepo()).deviceSummary(d.hash), { cache: 'private' });
});
