import type { NextRequest } from 'next/server';
import { CRON_JOBS, type CronJob } from '@/server/cron';
import { CRON_SECRET } from '@/server/env';
import { AppError } from '@/server/errors';
import { json, route } from '@/server/http';

const handler = route('cron', async (req: NextRequest, ctx: { params: Promise<{ job: string }> }) => {
  const secret = CRON_SECRET();
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) throw new AppError('UNAUTHORIZED', 'Bad cron secret');
  const { job } = await ctx.params;
  if (!(job in CRON_JOBS)) throw new AppError('NOT_FOUND', 'Unknown job');
  const result = await CRON_JOBS[job as CronJob]();
  return json({ job, result });
});

export const GET = handler;
export const POST = handler;
