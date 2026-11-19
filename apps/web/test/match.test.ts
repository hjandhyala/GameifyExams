import { describe, expect, it } from 'vitest';
import vocab from '../../../packages/content/vocab/boards-dx.json';
import { editDistance, normalize, prepare, search, type Searchable } from '../src/client/match';

const entries = (vocab as { entries: Searchable[] }).entries.map((e) => ({ ...e, syn: e.syn ?? [], abbr: e.abbr ?? [], commonness: e.commonness ?? 50 }));
const prepared = prepare(entries);

describe('workup autocomplete', () => {
  it('normalizes diacritics and greek letters', () => {
    expect(normalize('Löfgren  Syndrome')).toBe('lofgren syndrome');
    expect(normalize('β-thalassemia')).toBe('beta thalassemia');
  });
  it('matches abbreviations exactly first, with the synonym shown', () => {
    const r = search(prepared, 'MI');
    expect(r[0]?.e.name).toBe('Myocardial infarction');
    expect(r[0]?.via).toBe('MI');
  });
  it('matches name prefixes and token prefixes', () => {
    expect(search(prepared, 'sarc')[0]?.e.name).toBe('Sarcoidosis');
    expect(search(prepared, 'gravis').map((x) => x.e.name)).toContain('Myasthenia gravis');
  });
  it('matches synonyms', () => {
    const r = search(prepared, 'heart attack');
    expect(r[0]?.e.name).toBe('Myocardial infarction');
    expect(r[0]?.via).toBe('Heart attack');
  });
  it('tolerates one typo in long tokens', () => {
    expect(editDistance('sarcoidosis', 'sarcoidsis')).toBe(1);
    expect(search(prepared, 'sarcoidsis').map((x) => x.e.name)).toContain('Sarcoidosis');
  });
  it('limits results', () => {
    expect(search(prepared, 'a', 8).length).toBeLessThanOrEqual(8);
    expect(search(prepared, '')).toEqual([]);
  });
});
