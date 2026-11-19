/** Development-only date override (`?__date=YYYY-MM-DD`). The server ignores it in production. */
const KEY = 'pd:debugDate';

export function debugDate(): string | null {
  if (typeof window === 'undefined' || process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_FIXTURES) return null;
  try {
    const url = new URL(window.location.href).searchParams.get('__date');
    if (url !== null) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(url)) sessionStorage.setItem(KEY, url);
      else sessionStorage.removeItem(KEY);
    }
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Header the server uses (dev only) as "now" for the playable-window check. */
export function debugNowHeader(): Record<string, string> {
  const d = debugDate();
  return d ? { 'x-debug-now': `${d}T12:00:00Z` } : {};
}
