import type { TrackId, VocabEntry } from '@prepdle/core';
import barDoctrines from '../vocab/bar-doctrines.json';
import boardsDx from '../vocab/boards-dx.json';
import mcatEntities from '../vocab/mcat-entities.json';

export interface Vocabulary {
  id: string;
  track: TrackId;
  attributes: { key: string; label: string }[];
  entries: VocabEntry[];
}

export const VOCABULARIES: Record<string, Vocabulary> = {
  'boards-dx': boardsDx as Vocabulary,
  'mcat-entities': mcatEntities as Vocabulary,
  'bar-doctrines': barDoctrines as Vocabulary,
};

const maps = new Map<string, Map<string, VocabEntry>>();
export function vocabMap(id: string): Map<string, VocabEntry> {
  let m = maps.get(id);
  if (!m) {
    const v = VOCABULARIES[id];
    if (!v) throw new Error(`Unknown vocabulary ${id}`);
    m = new Map(v.entries.map((e) => [e.id, e]));
    maps.set(id, m);
  }
  return m;
}
