import { isISODate } from '@prepdle/core';
import type { NextRequest } from 'next/server';
import { requireDevice } from '@/server/device';
import { AppError } from '@/server/errors';
import { json, route } from '@/server/http';
import { dayOutcomes } from '@/server/identity';

export const GET = route('me.day', async (req: NextRequest, ctx: { params: Promise<{ date: string }> }) => {
  const { date } = await ctx.params;
  if (!isISODate(date)) throw new AppError('BAD_REQUEST', 'Invalid date');
  const d = requireDevice(req);
  return json({ date, results: d ? await dayOutcomes(d.hash, date) : [] }, { cache: 'private' });
});
