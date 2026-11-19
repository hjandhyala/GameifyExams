/** Deterministic PRNG helpers (layout, scheduling tie-breaks) and CSPRNG ids (opaque identifiers). */

export function hashString(s: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const seededRng = (seed: string): (() => number) => mulberry32(hashString(seed));

export function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Random base62 id from the platform CSPRNG. */
export function randomId(len = 6): string {
  const bytes = new Uint8Array(len);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += B62[b % 62];
  return out;
}

/** Id generator that never repeats within one compile. */
export function uniqueIdFactory(len = 6): () => string {
  const seen = new Set<string>();
  return () => {
    let id = randomId(len);
    while (seen.has(id)) id = randomId(len);
    seen.add(id);
    return id;
  };
}

/** Sortable unique id (ULID-like: 10 chars time + 16 chars random, Crockford base32). */
export function ulid(now: number = Date.now()): string {
  const C = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let t = now;
  let time = '';
  for (let i = 0; i < 10; i++) {
    time = C[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let rand = '';
  for (const b of bytes) rand += C[b % 32];
  return time + rand;
}
