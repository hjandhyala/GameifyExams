/** Percentile = share of players with a strictly worse bucket + half of ties (§9.3.5). */
export function percentile(distribution: Record<string, number>, bucketOrder: readonly string[], bucket: string): number {
  const idx = bucketOrder.indexOf(bucket);
  let total = 0;
  let worse = 0;
  let ties = 0;
  bucketOrder.forEach((b, i) => {
    const n = distribution[b] ?? 0;
    total += n;
    if (i > idx) worse += n;
    if (i === idx) ties += n;
  });
  if (total === 0) return 0;
  return Math.floor(((worse + ties / 2) / total) * 100);
}

export interface PuzzleStats {
  players: number;
  distribution: Record<string, number>;
  percentile?: number;
  topWrongGuesses?: { key: string; name: string; pct: number }[];
}

/** Difficulty band from observed p-value (§3.5). */
export function difficultyFromP(p: number): 1 | 2 | 3 | 4 | 5 {
  if (p >= 0.85) return 1;
  if (p >= 0.7) return 2;
  if (p >= 0.55) return 3;
  if (p >= 0.4) return 4;
  return 5;
}

/** Point-biserial correlation between a binary item score and a continuous total. */
export function pointBiserial(itemCorrect: boolean[], rest: number[]): number {
  const n = itemCorrect.length;
  if (n < 2) return 0;
  const mean = rest.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(rest.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  if (sd === 0) return 0;
  const ones = rest.filter((_, i) => itemCorrect[i]);
  const zeros = rest.filter((_, i) => !itemCorrect[i]);
  if (ones.length === 0 || zeros.length === 0) return 0;
  const m1 = ones.reduce((a, b) => a + b, 0) / ones.length;
  const m0 = zeros.reduce((a, b) => a + b, 0) / zeros.length;
  const p = ones.length / n;
  return ((m1 - m0) / sd) * Math.sqrt(p * (1 - p));
}
