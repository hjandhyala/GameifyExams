import type { NextRequest } from 'next/server';
import { getRepo } from '@/server/db';
import { DEVICE_COOKIE, requireDevice } from '@/server/device';
import { assertSameOrigin, json, route } from '@/server/http';

/** Deletes all server data for this device and clears the cookie (§14.3). */
export const DELETE = route('me.delete', async (req: NextRequest) => {
  assertSameOrigin(req);
  const d = requireDevice(req);
  if (d) await (await getRepo()).deleteDevice(d.hash);
  const res = json({ deleted: true });
  res.cookies.delete(DEVICE_COOKIE);
  res.cookies.delete('pd_r');
  return res;
});
