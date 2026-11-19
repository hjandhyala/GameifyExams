import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../ops/assets';

const UA = process.env.PREPDLE_USER_AGENT ?? 'PrepdleContentBot/1.0 (+https://prepdle.app/about; content@prepdle.app)';
const CACHE = join(ROOT, '.cache/http');
const last = new Map<string, number>();

/** Rate per host in requests/second (§11.3 limits, with headroom). */
const RATES: Record<string, number> = {
  'rxnav.nlm.nih.gov': 10,
  'api.fda.gov': 3,
  'pubchem.ncbi.nlm.nih.gov': 4,
  'clinicaltables.nlm.nih.gov': 5,
  'id.nlm.nih.gov': 5,
  'query.wikidata.org': 0.5,
  'www.courtlistener.com': 1,
  'api.govinfo.gov': 0.25,
};

async function throttle(host: string) {
  const rate = RATES[host] ?? 2;
  const gap = 1000 / rate;
  const prev = last.get(host) ?? 0;
  const wait = prev + gap - Date.now();
  last.set(host, Math.max(Date.now(), prev + gap));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

/** Polite, cached GET with retry on 429/5xx (honors Retry-After). */
export async function fetchCached(url: string, opts: { ttlHours?: number; headers?: Record<string, string>; asText?: boolean } = {}): Promise<string> {
  mkdirSync(CACHE, { recursive: true });
  const key = createHash('sha256').update(url).digest('hex');
  const file = join(CACHE, key);
  const ttl = (opts.ttlHours ?? 24) * 3_600_000;
  if (existsSync(file) && Date.now() - statSync(file).mtimeMs < ttl) return readFileSync(file, 'utf8');
  const host = new URL(url).host;
  for (let attempt = 0; attempt < 5; attempt++) {
    await throttle(host);
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*', ...(opts.headers ?? {}) } });
    if (res.ok) {
      const text = await res.text();
      writeFileSync(file, text);
      return text;
    }
    if (res.status === 429 || res.status >= 500) {
      const ra = Number(res.headers.get('retry-after'));
      await new Promise((r) => setTimeout(r, (Number.isFinite(ra) && ra > 0 ? ra * 1000 : 2 ** attempt * 1000)));
      continue;
    }
    throw new Error(`GET ${url} → ${res.status}`);
  }
  throw new Error(`GET ${url} failed after retries`);
}

export const fetchJson = async <T>(url: string, opts?: Parameters<typeof fetchCached>[1]): Promise<T> => JSON.parse(await fetchCached(url, opts)) as T;

export const stripHtml = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

/** Splits text into ~300–800-token chunks on paragraph/sentence boundaries. */
export function chunkText(text: string, maxChars = 2800): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if ((cur + ' ' + s).length > maxChars && cur.length > 800) {
      out.push(cur.trim());
      cur = s;
    } else cur += ' ' + s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
