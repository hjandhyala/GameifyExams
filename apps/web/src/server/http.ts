import 'server-only';
import { EvaluationError, ulid } from '@prepdle/core';
import { NextResponse, type NextRequest } from 'next/server';
import { ZodError, type z } from 'zod';
import { MIN_APP_VERSION } from './env';
import { AppError } from './errors';
import { log } from './log';

export type CachePolicy = 'no-store' | 'private' | { sMaxAge: number; swr?: number } | { immutable: true };

function cacheHeader(c: CachePolicy): string {
  if (c === 'no-store') return 'no-store';
  if (c === 'private') return 'private, no-store';
  if ('immutable' in c) return 'public, max-age=31536000, immutable';
  return `public, s-maxage=${c.sMaxAge}${c.swr ? `, stale-while-revalidate=${c.swr}` : ''}`;
}

export function json(data: unknown, opts: { status?: number; cache?: CachePolicy; requestId?: string } = {}): NextResponse {
  const res = NextResponse.json(data, { status: opts.status ?? 200 });
  res.headers.set('Cache-Control', cacheHeader(opts.cache ?? 'no-store'));
  res.headers.set('X-Server-Time', new Date().toISOString());
  res.headers.set('X-App-Min-Version', MIN_APP_VERSION);
  if (opts.requestId) res.headers.set('X-Request-Id', opts.requestId);
  return res;
}

export function errorResponse(err: unknown, requestId: string, route: string): NextResponse {
  let e: AppError;
  if (err instanceof AppError) e = err;
  else if (err instanceof EvaluationError) {
    const msg = err.message.replace(/^[A-Z_]+: /, '');
    e = new AppError(err.code, msg === err.code ? 'Invalid move' : msg.charAt(0).toUpperCase() + msg.slice(1), { moveIndex: err.moveIndex });
  }
  else if (err instanceof ZodError) e = new AppError('BAD_REQUEST', 'Invalid request', { issues: err.issues.slice(0, 5).map((i) => ({ path: i.path.join('.'), message: i.message })) });
  else {
    log('error', 'unhandled', { route, requestId, error: (err as Error)?.message, stack: (err as Error)?.stack?.split('\n').slice(0, 4).join(' | ') });
    e = new AppError('INTERNAL', 'Something went wrong');
  }
  if (e.status >= 400 && e.status < 500 && e.code !== 'RATE_LIMITED' && Math.random() < 0.01)
    log('info', 'client error sample', { route, code: e.code, moveIndex: e.details?.moveIndex });
  const res = json({ error: { code: e.code, message: e.message, requestId, ...(e.details ?? {}) } }, { status: e.status, requestId });
  if (e.code === 'RATE_LIMITED' && e.details?.retryAfter) res.headers.set('Retry-After', String(e.details.retryAfter));
  return res;
}

type Handler<C> = (req: NextRequest, ctx: C, meta: { requestId: string }) => Promise<NextResponse>;

/** Wraps a route handler with request ids, structured logging and the error envelope (§9.1). */
export function route<C>(name: string, fn: Handler<C>) {
  return async (req: NextRequest, ctx: C): Promise<NextResponse> => {
    const requestId = ulid();
    const started = Date.now();
    try {
      const res = await fn(req, ctx, { requestId });
      res.headers.set('X-Request-Id', requestId);
      log('debug', 'request', { route: name, status: res.status, latencyMs: Date.now() - started, requestId });
      return res;
    } catch (err) {
      const res = errorResponse(err, requestId, name);
      log(res.status >= 500 ? 'error' : 'debug', 'request', { route: name, status: res.status, latencyMs: Date.now() - started, requestId });
      return res;
    }
  };
}

/** Parses a JSON body with a size cap and schema. */
export async function body<T extends z.ZodType>(req: NextRequest, schema: T, maxBytes = 8192): Promise<z.infer<T>> {
  const ct = req.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) throw new AppError('BAD_REQUEST', 'Expected application/json');
  const text = await req.text();
  if (text.length > maxBytes) throw new AppError('BAD_REQUEST', 'Body too large');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AppError('BAD_REQUEST', 'Invalid JSON');
  }
  return schema.parse(parsed);
}

/** Same-origin check for state-changing requests (§14.1 CSRF). */
export function assertSameOrigin(req: NextRequest): void {
  const origin = req.headers.get('origin');
  if (!origin) return; // non-browser clients
  if (new URL(origin).host !== req.headers.get('host')) throw new AppError('FORBIDDEN', 'Cross-origin request');
}
