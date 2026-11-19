import { difficultyFromP, pointBiserial } from '@prepdle/core';
import type { Repo } from '@prepdle/db';

export interface ItemFlag {
  itemId: string;
  flag: 'possible_miskey' | 'poor_discrimination' | 'too_easy_for_slot';
  detail: string;
}

/** Nightly item statistics and quality flags (§12.9). */
export async function runPsychometrics(repo: Repo, opts: { minN?: number } = {}): Promise<{ updated: number; flags: ItemFlag[] }> {
  const minN = opts.minN ?? 50;
  const stats = await repo.itemResponseStats(minN);
  const flags: ItemFlag[] = [];
  let updated = 0;
  for (const s of stats) {
    if (s.itemId.endsWith(':bonus')) continue;
    const item = await repo.getItem(s.itemId);
    if (!item) continue;
    const content = item.content as { correctOptionId?: string };
    await repo.setObservedDifficulty(s.itemId, difficultyFromP(s.p));
    updated++;
    const key = content.correctOptionId;
    const keyRate = key ? (s.options[key] ?? 0) / s.n : s.p;
    const topDistractor = Object.entries(s.options)
      .filter(([k]) => k !== key)
      .sort((a, b) => b[1] - a[1])[0];
    if (s.p < 0.2 && topDistractor && topDistractor[1] / s.n > keyRate)
      flags.push({ itemId: s.itemId, flag: 'possible_miskey', detail: `p=${s.p.toFixed(2)}; option ${topDistractor[0]} chosen more than key` });
    if (s.n >= 100) {
      const pairs = await repo.itemResponsePairs(s.itemId);
      const r = pointBiserial(pairs.map((x) => x.correct), pairs.map((x) => x.rest));
      if (r < 0.05) flags.push({ itemId: s.itemId, flag: 'poor_discrimination', detail: `r_pb=${r.toFixed(3)}` });
    }
    if (s.p > 0.95 && item.difficulty >= 3) flags.push({ itemId: s.itemId, flag: 'too_easy_for_slot', detail: `p=${s.p.toFixed(2)} at D${item.difficulty}` });
  }
  for (const f of flags) {
    if (f.flag !== 'too_easy_for_slot') await repo.updateItem(f.itemId, { status: 'in_review' }, 'psychometrics', `flag:${f.flag}`);
  }
  return { updated, flags };
}
