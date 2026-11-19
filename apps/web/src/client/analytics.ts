'use client';
/** Privacy-preserving product analytics (§8.11): no device id, no IP, no free text. */
const HOST = process.env.NEXT_PUBLIC_ANALYTICS_HOST;
const DOMAIN = process.env.NEXT_PUBLIC_ANALYTICS_DOMAIN;
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '1.0.0';

export function track(event: string, props: Record<string, string | number | boolean | undefined> = {}): void {
  if (typeof window === 'undefined') return;
  const clean = Object.fromEntries(Object.entries({ ...props, appVersion: APP_VERSION }).filter(([, v]) => v !== undefined));
  if (!HOST || !DOMAIN) {
    if (process.env.NODE_ENV !== 'production') console.debug('[analytics]', event, clean);
    return;
  }
  const body = JSON.stringify({ name: event, url: window.location.origin + window.location.pathname, domain: DOMAIN, props: clean });
  try {
    navigator.sendBeacon?.(`${HOST}/api/event`, new Blob([body], { type: 'application/json' })) ||
      void fetch(`${HOST}/api/event`, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } });
  } catch {}
}

export const durationBucket = (ms: number) => (ms < 60_000 ? '<1m' : ms < 180_000 ? '1-3m' : ms < 360_000 ? '3-6m' : '6m+');
