import { isTrackId, utcISO } from '@prepdle/core';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { getRepo } from '@/server/db';
import { requireDevice } from '@/server/device';
import { assertSameOrigin, body, json, route } from '@/server/http';
import { assertSubmittable, nowMs } from '@/server/puzzles';

const Ping = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), track: z.string().max(12).optional() });

/** Daily active-device check-in for admin user analytics (one row per device per local day). */
export const POST = route('ping', async (req: NextRequest) => {
  assertSameOrigin(req);
  const d = requireDevice(req);
  if (!d) return json({ ok: false }, { status: 202 });
  const p = await body(req, Ping, 512);
  let date = p.date;
  try {
    assertSubmittable(date, nowMs(req.headers.get('x-debug-now')));
  } catch {
    date = utcISO(Date.now()); // device clock off: count under the server's day
  }
  await (await getRepo()).recordVisit(date, d.hash, p.track && isTrackId(p.track) ? p.track : null);
  return json({ ok: true }, { status: 202 });
});
