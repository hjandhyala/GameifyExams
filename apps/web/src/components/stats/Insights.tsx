'use client';
import { addDays, CATALOG, displayStreak, TRACKS, type TrackId } from '@prepdle/core';
import { useMemo, useState } from 'react';
import { activeDays, gameStats, useStore } from '@/client/store';
import { useToday } from '@/client/today';
import { StreakBadge } from '@/components/shell/StreakBadge';

/** Prep Insights (§4.5, §6.5.5): weak spots, calibration, history calendar — all from local history. */
export function Insights({ initialTrack }: { initialTrack?: TrackId }) {
  const history = useStore((s) => s.history);
  const streaks = useStore((s) => s.streaks);
  const today = useToday() ?? new Date().toISOString().slice(0, 10);
  const [track, setTrack] = useState<TrackId>(initialTrack ?? 'mcat');
  const [windowDays, setWindowDays] = useState<30 | 90>(30);

  const insights = useMemo(() => {
    const from = addDays(today, -windowDays);
    const gs = history.filter((h) => h.t === track && h.g === 'gauntlet' && h.d >= from && h.x?.ok);
    const areas = new Map<string, { n: number; ok: number }>();
    const conf = new Map<number, { n: number; ok: number }>();
    for (const h of gs) {
      h.x!.ok!.forEach((ok, i) => {
        const code = h.x!.bp?.[i];
        if (code) {
          const a = areas.get(code) ?? { n: 0, ok: 0 };
          a.n++;
          a.ok += ok;
          areas.set(code, a);
        }
        const c = h.x!.conf?.[i];
        if (c) {
          const cc = conf.get(c) ?? { n: 0, ok: 0 };
          cc.n++;
          cc.ok += ok;
          conf.set(c, cc);
        }
      });
    }
    const weak = [...areas.entries()].map(([code, v]) => ({ code, ...v, pct: Math.round((v.ok / v.n) * 100) })).sort((a, b) => a.pct - b.pct);
    return { weak, conf };
  }, [history, track, today, windowDays]);

  const days = activeDays(history, today, 84);
  const perfectDays = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const h of history.filter((x) => x.t === track && x.p === 1)) byDay.set(h.d, (byDay.get(h.d) ?? 0) + 1);
    return [...byDay.values()].filter((n) => n >= CATALOG[track].games.length).length;
  }, [history, track]);

  const confLabel = { 1: 'Guess', 2: 'Likely', 3: 'Sure' } as const;
  const confExpect = { 1: '≤ 50%', 2: '~70%', 3: '≥ 90%' } as const;
  const sure = insights.conf.get(3);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <StreakBadge n={displayStreak(streaks.global, today)} label="day streak" big />
        <span className="text-sm text-muted">Max {streaks.global.max}</span>
      </div>
      <div role="tablist" className="flex gap-1 overflow-x-auto">
        {TRACKS.map((t) => (
          <button key={t.id} role="tab" aria-selected={track === t.id} onClick={() => setTrack(t.id)} className={`btn min-h-9 ${track === t.id ? 'btn-primary' : ''}`} style={track === t.id ? { background: t.accent } : undefined}>
            {t.name}
          </button>
        ))}
      </div>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted">Games</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {CATALOG[track].games.map((g) => {
            const st = gameStats(history, track, g.gameId);
            const s = streaks.game[`${track}:${g.gameId}`];
            return (
              <div key={g.gameId} className="card flex items-center justify-between p-3">
                <span className="font-bold">
                  {g.icon} {g.name}
                </span>
                <span className="text-sm text-muted tabular">
                  {st.played} played · {st.played ? Math.round((st.passed / st.played) * 100) : 0}% · 🔥{displayStreak(s, today)} (max {s?.max ?? 0})
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-sm text-muted">Perfect days (all games passed): {perfectDays}</p>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted">Weak spots (Gauntlet)</h2>
          <select value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value) as 30 | 90)} className="rounded-md border border-border bg-surface px-2 py-1 text-sm">
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
        {insights.weak.filter((w) => w.n >= 3).length ? (
          <ul className="space-y-1.5">
            {insights.weak
              .filter((w) => w.n >= 3)
              .slice(0, 8)
              .map((w) => (
                <li key={w.code} className="flex items-center gap-3 text-sm">
                  <span className="w-44 truncate font-semibold" title={w.code}>
                    {w.code.split('.').slice(1).join(' › ')}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded bg-surface-2">
                    <span className="block h-full rounded" style={{ width: `${w.pct}%`, background: w.pct < 50 ? 'var(--fb-wrong)' : w.pct < 75 ? 'var(--fb-present)' : 'var(--fb-correct)' }} />
                  </span>
                  <span className="w-20 text-right tabular text-muted">
                    {w.pct}% (n={w.n})
                  </span>
                </li>
              ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Need more data: areas appear after 3+ questions.</p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted">Calibration</h2>
        <div className="grid grid-cols-3 gap-2 text-center">
          {([1, 2, 3] as const).map((c) => {
            const v = insights.conf.get(c);
            return (
              <div key={c} className="card p-3">
                <div className="text-2xl font-extrabold tabular">{v ? `${Math.round((v.ok / v.n) * 100)}%` : '—'}</div>
                <div className="text-xs text-muted">
                  {confLabel[c]} (n={v?.n ?? 0}) · expect {confExpect[c]}
                </div>
              </div>
            );
          })}
        </div>
        {sure && sure.n >= 5 && (
          <p className="mt-2 text-sm">
            Your “Sure” answers are right {Math.round((sure.ok / sure.n) * 100)}% of the time
            {sure.ok / sure.n < 0.85 ? ': you may be overconfident.' : '. Nicely calibrated.'}
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted">Last 12 weeks</h2>
        <div className="grid grid-flow-col grid-rows-7 gap-1" role="img" aria-label={`${days.size} active days in the last 12 weeks`}>
          {Array.from({ length: 84 }).map((_, i) => {
            const d = addDays(today, i - 83);
            return <span key={d} title={d} className={`h-3.5 w-3.5 rounded-sm ${days.has(d) ? 'bg-accent' : 'bg-surface-2'}`} />;
          })}
        </div>
      </section>
    </div>
  );
}
