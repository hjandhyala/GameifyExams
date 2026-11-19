import { allSlots, utcISO } from '@prepdle/core';
import Link from 'next/link';
import { getRepo } from '@/server/db';

export default async function Dashboard() {
  const repo = await getRepo();
  const today = utcISO(Date.now());
  const [buffers, counts, reports, runs, live] = await Promise.all([repo.bufferDays(today), repo.itemCounts(), repo.listReports('open', 50), repo.listRuns(10), repo.puzzlesOnDate(today)]);
  const agg = await Promise.all(live.map(async (p) => ({ p, a: await repo.aggregates(p.id) })));
  const reportCounts = await repo.reportCounts(live.map((p) => p.id));
  const inReview = counts.filter((c) => c.status === 'in_review').reduce((a, c) => a + c.n, 0);
  const cost = runs.reduce((a, r) => a + Number(r.costUsd ?? 0), 0);
  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-extrabold">Dashboard</h1>
        <p className="text-sm text-muted">
          {inReview} items in review · {reports.length} open reports · pipeline spend (last {runs.length} runs) ${cost.toFixed(2)}
        </p>
      </section>
      <section>
        <h2 className="mb-2 font-bold">Content buffer (days scheduled ahead)</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {allSlots().map(({ track, game }) => {
            const b = buffers.find((x) => x.track === track && x.gameId === game.gameId)?.days ?? 0;
            const color = b < 14 ? 'bg-wrong/20' : b < 21 ? 'bg-present/25' : 'bg-correct/20';
            return (
              <div key={`${track}:${game.gameId}`} className={`rounded-lg p-2 text-sm ${color}`}>
                <div className="font-semibold">
                  {track} · {game.name}
                </div>
                <div className="text-2xl font-extrabold tabular">{b}</div>
              </div>
            );
          })}
        </div>
      </section>
      <section>
        <h2 className="mb-2 font-bold">Live today (UTC {today})</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th>Puzzle</th>
              <th>v</th>
              <th>Players</th>
              <th>Pass rate</th>
              <th>Reports</th>
            </tr>
          </thead>
          <tbody>
            {agg.map(({ p, a }) => {
              const players = Object.values(a).reduce((x, y) => x + y, 0);
              const failed = a.X ?? 0;
              return (
                <tr key={p.id} className="border-t border-border">
                  <td>
                    <Link className="underline" href={`/admin/puzzles/${p.id}`}>
                      {p.id}
                    </Link>
                  </td>
                  <td>{p.currentVersion}</td>
                  <td className="tabular">{players}</td>
                  <td className="tabular">{players && p.gameId !== 'gauntlet' ? `${Math.round(((players - failed) / players) * 100)}%` : '—'}</td>
                  <td className={reportCounts[p.id] ? 'font-bold text-wrong' : ''}>{reportCounts[p.id] ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <section>
        <h2 className="mb-2 font-bold">Bank inventory</h2>
        <div className="grid gap-1 text-sm sm:grid-cols-3">
          {counts
            .sort((a, b) => `${a.track}${a.gameId}${a.status}`.localeCompare(`${b.track}${b.gameId}${b.status}`))
            .map((c) => (
              <div key={`${c.track}${c.gameId}${c.status}`}>
                {c.track}/{c.gameId} · {c.status}: <b>{c.n}</b>
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}
