import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { DEVICE_COOKIE, DEVICE_MAX_AGE, ipHash } from '@/server/device';
import { assertSameOrigin, body, json, route } from '@/server/http';
import { redeemTransferCode } from '@/server/identity';
import { rateLimit } from '@/server/ratelimit';

export const POST = route('me.transfer.redeem', async (req: NextRequest) => {
  assertSameOrigin(req);
  await rateLimit('transferRedeemIp', ipHash(req));
  const { code } = await body(req, z.object({ code: z.string().min(6).max(20) }));
  const did = await redeemTransferCode(code);
  const res = json({ ok: true });
  res.cookies.set(DEVICE_COOKIE, did, { httpOnly: true, secure: req.nextUrl.protocol === 'https:', sameSite: 'lax', path: '/', maxAge: DEVICE_MAX_AGE });
  return res;
});
