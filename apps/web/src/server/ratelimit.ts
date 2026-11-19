import 'server-only';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { AppError } from './errors';
import { log } from './log';

type Window = `${number} ${'s' | 'm' | 'h'}`;
export const LIMITS = {
  puzzleGetIp: { limit: 120, window: '1 m' as Window },
  evaluateDevice: { limit: 120, window: '1 m' as Window },
  evaluateIp: { limit: 600, window: '1 m' as Window },
  resultsDevice: { limit: 30, window: '1 m' as Window },
  reportsDevice: { limit: 10, window: '1 h' as Window },
  transferCreate: { limit: 5, window: '1 h' as Window },
  transferRedeemIp: { limit: 10, window: '1 h' as Window },
} as const;
export type LimitName = keyof typeof LIMITS;

const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN ? Redis.fromEnv() : null;
const limiters = new Map<LimitName, Ratelimit>();

const windowMs = (w: Window) => {
  const [n, unit] = w.split(' ') as [string, 's' | 'm' | 'h'];
  return Number(n) * (unit === 's' ? 1000 : unit === 'm' ? 60_000 : 3_600_000);
};

// In-memory sliding window fallback (per instance) when Upstash isn't configured.
const memory = new Map<string, number[]>();
function memoryLimit(key: string, limit: number, ms: number): { success: boolean; reset: number } {
  const now = Date.now();
  const hits = (memory.get(key) ?? []).filter((t) => now - t < ms);
  if (hits.length >= limit) return { success: false, reset: hits[0]! + ms };
  hits.push(now);
  memory.set(key, hits);
  if (memory.size > 50_000) memory.clear();
  return { success: true, reset: now + ms };
}

/** Throws RATE_LIMITED when over the limit. Fails open if Redis is unreachable (§15.5). */
export async function rateLimit(name: LimitName, key: string): Promise<void> {
  const cfg = LIMITS[name];
  let res: { success: boolean; reset: number };
  if (redis) {
    let rl = limiters.get(name);
    if (!rl) {
      rl = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(cfg.limit, cfg.window), prefix: `rl:${name}` });
      limiters.set(name, rl);
    }
    try {
      res = await rl.limit(key);
    } catch (e) {
      log('warn', 'ratelimit unavailable; failing open', { error: (e as Error).message });
      return;
    }
  } else {
    res = memoryLimit(`${name}:${key}`, cfg.limit, windowMs(cfg.window));
  }
  if (!res.success) throw new AppError('RATE_LIMITED', 'Too many requests', { retryAfter: Math.max(1, Math.ceil((res.reset - Date.now()) / 1000)) });
}

export { redis };
