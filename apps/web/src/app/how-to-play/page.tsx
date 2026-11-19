import { TRACKS } from '@prepdle/core';
import type { Metadata } from 'next';
import { PageShell } from '@/components/shell/PageShell';

export const metadata: Metadata = { title: 'How to play' };

export default function HowToPlayPage() {
  const seen = new Set<string>();
  const games = TRACKS.flatMap((t) => t.games.map((g) => ({ ...g, tracks: TRACKS.filter((x) => x.games.some((y) => y.name === g.name)).map((x) => x.name) }))).filter((g) => {
    if (seen.has(g.name)) return false;
    seen.add(g.name);
    return true;
  });
  return (
    <PageShell title="How to play">
      <p className="text-muted">One puzzle per game per day, at your local midnight. Play each once, keep your streak, share your result.</p>
      <div className="mt-5 space-y-4">
        {games.map((g) => (
          <section key={g.name} className="card p-4">
            <h2 className="text-lg font-bold">
              {g.icon} {g.name} <span className="text-sm font-medium text-muted">· {g.tracks.join(', ')}</span>
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px]">
              {g.howTo.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </section>
        ))}
        <section className="card p-4">
          <h2 className="text-lg font-bold">🔥 Streaks</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px]">
            <li>Daily streak: finish at least one game on consecutive days (win or lose).</li>
            <li>Track streak: the same, per exam.</li>
            <li>Win streaks: consecutive days passing a specific game.</li>
            <li>Add Examdle to your home screen to keep your streak safe, or use Settings → Move to another device.</li>
          </ul>
        </section>
      </div>
    </PageShell>
  );
}
