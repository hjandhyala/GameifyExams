import { NextResponse, type NextRequest } from 'next/server';

const DEVICE_COOKIE = 'pd_did';
const REFRESH_COOKIE = 'pd_r';
const MAX_AGE = 400 * 86_400;
const DID_RE = /^[A-Za-z0-9_-]{22}$/;

function newDid(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Buffer.from(b).toString('base64url');
}

function csp(nonce: string): string {
  const dev = process.env.NODE_ENV === 'development';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${process.env.NEXT_PUBLIC_SENTRY_DSN ? ' https://*.sentry.io' : ''}${process.env.NEXT_PUBLIC_ANALYTICS_HOST ? ` ${process.env.NEXT_PUBLIC_ANALYTICS_HOST}` : ''}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

/**
 * - Issues the anonymous HttpOnly device cookie (§9.1, D4) and refreshes it at most once a day.
 * - Adds a per-request CSP nonce for pages (§14.2).
 */
export function proxy(request: NextRequest) {
  const isApi = request.nextUrl.pathname.startsWith('/api/');
  const headers = new Headers(request.headers);
  let did = request.cookies.get(DEVICE_COOKIE)?.value;
  const needsCookie = !did || !DID_RE.test(did);
  const needsRefresh = needsCookie || !request.cookies.get(REFRESH_COOKIE);
  if (needsCookie) {
    did = newDid();
    const existing = headers.get('cookie');
    headers.set('cookie', `${existing ? `${existing}; ` : ''}${DEVICE_COOKIE}=${did}`);
  }

  let policy: string | undefined;
  if (!isApi) {
    const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
    policy = csp(nonce);
    headers.set('x-nonce', nonce);
    headers.set('Content-Security-Policy', policy);
  }

  const res = NextResponse.next({ request: { headers } });
  if (policy) res.headers.set('Content-Security-Policy', policy);
  if (needsRefresh && did) {
    const secure = request.nextUrl.protocol === 'https:';
    res.cookies.set(DEVICE_COOKIE, did, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: MAX_AGE });
    res.cookies.set(REFRESH_COOKIE, '1', { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 86_400 });
  }
  return res;
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico|icons/|dict/|vocab/|sw.js|manifest.webmanifest).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
