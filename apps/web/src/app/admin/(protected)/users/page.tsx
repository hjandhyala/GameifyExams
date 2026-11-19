import { CATALOG, utcISO, type TrackId } from '@prepdle/core';
import { getRepo } from '@/server/db';

export const dynamic = 'force-dynamic';

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="text-3xl font-extrabold tabular">{value}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—');

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  const today = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : utcISO(Date.now() - 5 * 3_600_000); // US-centric "today"
  const m = await (await getRepo()).userMetrics(today);
  const t = m.totals;
  const max = Math.max(1, ...m.daily.map((d) => d.visitors));
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold">Users</h1>
        <p className="text-sm text-muted">
          A user is one anonymous browser (device cookie). Visitors opened the site that day; players finished at least one game. Day = {today}.
        </p>
      </div>
      <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Visitors today" value={t.dau} />
        <Stat label="Players today" value={t.players_today} hint={`${pct(t.players_today, t.dau)} of visitors`} />
        <Stat label="Games finished today" value={t.completions_today} hint={t.players_today ? `${(t.completions_today / t.players_today).toFixed(1)} per player` : undefined} />
        <Stat label="All-time users" value={t.all_time} />
        <Stat label="Weekly active" value={t.wau} hint={`${t.players_7} played`} />
        <Stat label="Monthly active" value={t.mau} hint={`${t.players_30} played`} />
        <Stat label="Stickiness (DAU/MAU)" value={pct(t.dau, t.mau)} />
        <Stat label="New today" value={m.daily[0]?.new_visitors ?? 0} hint={`${Math.max(0, t.dau - (m.daily[0]?.new_visitors ?? 0))} returning`} />
      </section>

      <section>
        <h2 className="mb-2 font-bold">Last 30 days</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th className="w-28">Date</th>
              <th>Visitors (new) / players</th>
              <th className="text-right">Visitors</th>
              <th className="text-right">New</th>
              <th className="text-right">Players</th>
              <th className="text-right">Games</th>
            </tr>
          </thead>
          <tbody>
            {m.daily.map((d) => (
              <tr key={d.date} className="border-t border-border">
                <td className="tabular">{d.date}</td>
                <td>
                  <div className="relative h-4 rounded bg-surface-2" style={{ width: `${Math.max(2, (d.visitors / max) * 100)}%` }} title={`${d.visitors} visitors`}>
                    <div className="absolute inset-y-0 left-0 rounded bg-accent/40" style={{ width: `${d.visitors ? (d.new_visitors / d.visitors) * 100 : 0}%` }} />
                    <div className="absolute inset-y-1 left-0 rounded bg-correct" style={{ width: `${d.visitors ? Math.min(100, (d.players / d.visitors) * 100) : 0}%` }} />
                  </div>
                </td>
                <td className="text-right tabular">{d.visitors}</td>
                <td className="text-right tabular">{d.new_visitors}</td>
                <td className="text-right tabular">{d.players}</td>
                <td className="text-right tabular">{d.completions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 font-bold">Retention by first-visit day</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th>Cohort</th>
                <th className="text-right">New users</th>
                <th className="text-right">Came back next day</th>
                <th className="text-right">Came back day 7</th>
              </tr>
            </thead>
            <tbody>
              {m.retention.map((r) => (
                <tr key={r.cohort} className="border-t border-border">
                  <td className="tabular">{r.cohort}</td>
                  <td className="text-right tabular">{r.size}</td>
                  <td className="text-right tabular">{r.d1} ({pct(r.d1, r.size)})</td>
                  <td className="text-right tabular">{r.d7} ({pct(r.d7, r.size)})</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!m.retention.length && <p className="text-sm text-muted">No visitors recorded yet.</p>}
        </section>

        <section>
          <h2 className="mb-2 font-bold">Players by exam</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th>Exam</th>
                <th className="text-right">Today</th>
                <th className="text-right">Last 7 days</th>
              </tr>
            </thead>
            <tbody>
              {m.byTrack.map((r) => (
                <tr key={r.track} className="border-t border-border">
                  <td>{CATALOG[r.track as TrackId]?.name ?? r.track}</td>
                  <td className="text-right tabular">{r.today}</td>
                  <td className="text-right tabular">{r.week}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2 className="mb-2 mt-6 font-bold">Days active in the last 7 (devices)</h2>
          <p className="text-sm tabular">{m.engagement.map((e) => `${e.days_active}d: ${e.devices}`).join(' · ') || '—'}</p>
        </section>
      </div>

      <section>
        <h2 className="mb-2 font-bold">Games today</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th>Game</th>
              <th className="text-right">Finished</th>
              <th className="text-right">Pass rate</th>
            </tr>
          </thead>
          <tbody>
            {m.byGame.map((g) => (
              <tr key={`${g.track}-${g.game_id}`} className="border-t border-border">
                <td>
                  {CATALOG[g.track as TrackId]?.name} · {CATALOG[g.track as TrackId]?.games.find((x) => x.gameId === g.game_id)?.name ?? g.game_id}
                </td>
                <td className="text-right tabular">{g.completions}</td>
                <td className="text-right tabular">{pct(g.passed, g.completions)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
