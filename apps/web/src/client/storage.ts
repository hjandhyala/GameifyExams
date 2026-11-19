/** Safe localStorage wrapper with in-memory fallback (private mode, quota) (§8.3). */
const PREFIX = 'pd:v1:';
const memory = new Map<string, string>();
let available: boolean | null = null;

function ls(): Storage | null {
  if (typeof window === 'undefined') return null;
  if (available === null) {
    try {
      const k = '__pd_test__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      available = true;
    } catch {
      available = false;
    }
  }
  return available ? window.localStorage : null;
}

export const storageAvailable = () => ls() !== null;

export function read<T>(key: string, fallback: T): T {
  const k = PREFIX + key;
  try {
    const raw = ls()?.getItem(k) ?? memory.get(k) ?? null;
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function write(key: string, value: unknown): void {
  const k = PREFIX + key;
  const raw = JSON.stringify(value);
  try {
    const s = ls();
    if (s) s.setItem(k, raw);
    else memory.set(k, raw);
  } catch {
    memory.set(k, raw);
  }
}

export function remove(key: string): void {
  try {
    ls()?.removeItem(PREFIX + key);
  } catch {}
  memory.delete(PREFIX + key);
}

export function keys(): string[] {
  const out = new Set<string>([...memory.keys()].filter((k) => k.startsWith(PREFIX)).map((k) => k.slice(PREFIX.length)));
  try {
    const s = ls();
    if (s) for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k?.startsWith(PREFIX)) out.add(k.slice(PREFIX.length));
    }
  } catch {}
  return [...out];
}

export function clearAll(): void {
  for (const k of keys()) remove(k);
}

export const PREFIX_KEY = PREFIX;
