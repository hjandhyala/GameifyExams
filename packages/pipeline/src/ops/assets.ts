import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXTURES, VOCABULARIES } from '@prepdle/content';
import type { TrackId } from '@prepdle/core';
import { sha256 } from '../publish/hash';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, '../../../..');
const CONTENT = join(ROOT, 'packages/content');
const WEB_PUBLIC = join(ROOT, 'apps/web/public');

const JARGON_TRACKS: TrackId[] = ['mcat', 'boards', 'bar'];

function readWordFile(p: string): string[] {
  return readFileSync(p, 'utf8')
    .split(/\s+/)
    .filter((w) => w && !w.startsWith('#'))
    .map((w) => w.trim().toUpperCase())
    .filter((w) => /^[A-Z]{5,8}$/.test(w));
}

/** Valid-guess dictionary for a track = ENABLE(5–8) ∪ domain terms ∪ fixture answers (§5.2.4). */
export function buildDictionary(track: TrackId): string[] {
  const enable = readWordFile(join(CONTENT, 'wordlists/enable1.txt'));
  const domainPath = join(CONTENT, `wordlists/domain-${track}.txt`);
  const domain = existsSync(domainPath) ? readWordFile(domainPath) : [];
  const answers = FIXTURES.filter((f) => f.track === track && f.gameId === 'jargon').map((f) => (f.authored as { answer: string }).answer);
  return [...new Set([...enable, ...domain, ...answers])].sort();
}

/**
 * Generates content-hashed static assets for the web app and the manifest read by the server:
 *  - apps/web/public/dict/{track}/{len}.{hash}.txt
 *  - apps/web/public/vocab/{id}.{hash}.json
 *  - packages/content/generated/{assets.json, dict-{track}.json}
 */
export function buildAssets(log: (m: string) => void = console.log) {
  const manifest: { dict: Record<string, Record<string, string>>; vocab: Record<string, string> } = { dict: {}, vocab: {} };
  rmSync(join(WEB_PUBLIC, 'dict'), { recursive: true, force: true });
  rmSync(join(WEB_PUBLIC, 'vocab'), { recursive: true, force: true });
  mkdirSync(join(CONTENT, 'generated'), { recursive: true });

  for (const track of JARGON_TRACKS) {
    const words = buildDictionary(track);
    writeFileSync(join(CONTENT, `generated/dict-${track}.json`), JSON.stringify(words));
    manifest.dict[track] = {};
    for (const len of [5, 6, 7, 8]) {
      const body = words.filter((w) => w.length === len).join('\n');
      const hash = sha256(body).slice(0, 6);
      const dir = join(WEB_PUBLIC, 'dict', track);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${len}.${hash}.txt`), body);
      manifest.dict[track]![String(len)] = hash;
    }
    log(`dict ${track}: ${words.length} words`);
  }

  for (const v of Object.values(VOCABULARIES)) {
    const compact = {
      id: v.id,
      attributes: v.attributes,
      entries: v.entries.map((e) => ({ id: e.id, name: e.name, syn: e.syn ?? [], abbr: e.abbr ?? [], attrs: e.attrs, commonness: e.commonness ?? 50 })),
    };
    const body = JSON.stringify(compact);
    const hash = sha256(body).slice(0, 6);
    mkdirSync(join(WEB_PUBLIC, 'vocab'), { recursive: true });
    writeFileSync(join(WEB_PUBLIC, 'vocab', `${v.id}.${hash}.json`), body);
    manifest.vocab[v.id] = hash;
    log(`vocab ${v.id}: ${v.entries.length} entries`);
  }

  writeFileSync(join(CONTENT, 'generated/assets.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

export function listPublicAssets(): string[] {
  const out: string[] = [];
  for (const sub of ['dict', 'vocab']) {
    const base = join(WEB_PUBLIC, sub);
    if (!existsSync(base)) continue;
    const walk = (d: string) =>
      readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(join(d, e.name)) : out.push(join(d, e.name))));
    walk(base);
  }
  return out;
}
