/** Autocomplete ranking for Workup vocabularies (§5.3.5). */
export interface Searchable {
  id: string;
  name: string;
  syn: string[];
  abbr: string[];
  commonness: number;
}

export const normalize = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/β/g, 'beta')
    .replace(/α/g, 'alpha')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Damerau–Levenshtein distance capped at 2. */
export function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
    }
  return d[a.length]![b.length]!;
}

export interface Prepared<T extends Searchable> {
  e: T;
  name: string;
  tokens: string[];
  syn: string[];
  abbr: string[];
}

export const prepare = <T extends Searchable>(entries: T[]): Prepared<T>[] =>
  entries.map((e) => ({ e, name: normalize(e.name), tokens: normalize(e.name).split(' '), syn: e.syn.map(normalize), abbr: e.abbr.map(normalize) }));

export function search<T extends Searchable>(prepared: Prepared<T>[], query: string, limit = 8): { e: T; via?: string }[] {
  const q = normalize(query);
  if (!q) return [];
  const scored: { e: T; via?: string; s: number }[] = [];
  for (const p of prepared) {
    let s = 0;
    let via: string | undefined;
    if (p.name === q || p.abbr.includes(q)) {
      s = 100;
      if (p.name !== q) via = p.e.abbr[p.abbr.indexOf(q)];
    } else if (p.name.startsWith(q)) s = 80;
    else if (p.tokens.some((t) => t.startsWith(q)) || (q.includes(' ') && p.name.includes(q))) s = 60;
    else {
      const si = p.syn.findIndex((x) => x.startsWith(q) || x.split(' ').some((t) => t.startsWith(q)));
      if (si >= 0) {
        s = 55;
        via = p.e.syn[si];
      } else if (q.length >= 5 && p.tokens.some((t) => t.length >= 5 && editDistance(t, q) <= 1)) s = 30;
    }
    if (s) scored.push({ e: p.e, via, s: s + p.e.commonness / 1000 });
  }
  return scored
    .sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name))
    .slice(0, limit)
    .map(({ e, via }) => ({ e, via }));
}
