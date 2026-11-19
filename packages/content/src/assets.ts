import type { TrackId } from '@prepdle/core';
import manifest from '../generated/assets.json';

/** Content-hashed static asset references produced by `npm run pipeline build-assets`. */
export interface AssetManifest {
  dict: Partial<Record<TrackId, Record<string, string>>>;
  vocab: Record<string, string>;
}

export const ASSETS: AssetManifest = manifest as AssetManifest;

export const dictHashes = (track: TrackId): Record<number, string> =>
  Object.fromEntries(Object.entries(ASSETS.dict[track] ?? {}).map(([k, v]) => [Number(k), v]));

export const vocabHash = (id: string): string => {
  const h = ASSETS.vocab[id];
  if (!h) throw new Error(`No asset hash for vocab ${id}; run build-assets`);
  return h;
};

import barDict from '../generated/dict-bar.json';
import boardsDict from '../generated/dict-boards.json';
import mcatDict from '../generated/dict-mcat.json';

const DICT_SOURCES: Partial<Record<TrackId, string[]>> = { mcat: mcatDict as string[], boards: boardsDict as string[], bar: barDict as string[] };
const dictSets = new Map<TrackId, Set<string>>();

/** Server-side valid-guess dictionary for Jargon (same words as the hashed public files). */
export function dictionary(track: TrackId): Set<string> {
  let s = dictSets.get(track);
  if (!s) {
    s = new Set(DICT_SOURCES[track] ?? []);
    dictSets.set(track, s);
  }
  return s;
}
