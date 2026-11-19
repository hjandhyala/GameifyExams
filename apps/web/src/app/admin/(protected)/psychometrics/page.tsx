import { difficultyFromP } from '@prepdle/core';
import { getRepo } from '@/server/db';

export default async function PsychometricsPage() {
  const repo = await getRepo();
  const stats = await repo.itemResponseStats(1);
  const rows = await Promise.all(
    stats.map(async (s) => {
      const item = await repo.getItem(s.itemId.replace(/:bonus$/, ''));
      const key = (item?.content as { correctOptionId?: string } | undefined)?.correctOptionId;
      const top = Object.entries(s.options).filter(([k]) => k !== key).sort((a, b) => b[1] - a[1])[0];
      const flag = s.n >= 50 && s.p < 0.2 && top && top[1] / s.n > (key ? (s.options[key] ?? 0) / s.n : s.p) ? 'possible miskey' : s.n >= 50 && s.p > 0.95 && (item?.difficulty ?? 0) >= 3 ? 'too easy' : '';
      return { ...s, item, key, top, flag };
    }),
  );
  rows.sort((a, b) => a.p - b.p);
  return (
    <div>
      <h1 className="text-2xl font-extrabold">Psychometrics</h1>
      <p className="text-sm text-muted">Flags are computed with n ≥ 50 responses (nightly job also updates observed difficulty and routes flagged items to review).</p>
      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-muted">
          <tr>
            <th>Item</th>
            <th>n</th>
            <th>p</th>
            <th>D (authored → observed)</th>
            <th>Options</th>
            <th>Confidence accuracy</th>
            <th>Flag</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.itemId} className="border-t border-border">
              <td>{r.itemId}</td>
              <td className="tabular">{r.n}</td>
              <td className="tabular">{r.p.toFixed(2)}</td>
              <td>
                {r.item?.difficulty ?? '?'} → {difficultyFromP(r.p)}
              </td>
              <td className="tabular">
                {Object.entries(r.options)
                  .map(([k, v]) => `${k}${k === r.key ? '*' : ''}:${v}`)
                  .join(' ')}
              </td>
              <td className="tabular">
                {Object.entries(r.confidence)
                  .map(([c, v]) => `${c}: ${Math.round((v.correct / v.n) * 100)}%`)
                  .join(' · ')}
              </td>
              <td className={r.flag ? 'font-bold text-wrong' : ''}>{r.flag}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="mt-4 text-muted">No responses yet.</p>}
    </div>
  );
}
