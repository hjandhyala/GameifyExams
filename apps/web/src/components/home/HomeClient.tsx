'use client';
import { displayStreak, puzzleNumber, shortDateLabel, type GameId, type TrackId } from '@prepdle/core';
import Link from 'next/link';
import { useEffect } from 'react';
import { saveKey, useStore } from '@/client/store';
import { useToday } from '@/client/today';
import { AppHeader } from '@/components/shell/AppHeader';
import { Countdown } from '@/components/shell/Countdown';
import { StreakBadge } from '@/components/shell/StreakBadge';
import { StatusDots } from './StatusDots';

export interface TrackSummary {
  id: TrackId;
  name: string;
  subtitle: string;
  blurb: string;
  accent: string;
  games: { gameId: GameId; slug: string; name: string; icon: string }[];
}

const LAUNCH = process.env.NEXT_PUBLIC_LAUNCH_DATE ?? '2026-07-15';

export function HomeClient({ tracks }: { tracks: TrackSummary[] }) {
  const today = useToday();
  const hydrated = useStore((s) => s.hydrated);
  const streaks = useStore((s) => s.streaks);
  const favorite = useStore((s) => s.settings.favoriteTrack);
  const day = useStore((s) => (today ? s.days[today] : undefined));
  const firstVisit = hydrated && !favorite && useStore.getState().history.length === 0;

  useEffect(() => {
    document.documentElement.removeAttribute('data-track');
    if (today) useStore.getState().loadDay(today);
  }, [today]);

  const ordered = favorite ? [...tracks].sort((a, b) => (a.id === favorite ? -1 : b.id === favorite ? 1 : 0)) : tracks;

  return (
    <>
      <AppHeader title={<span className="tracking-tight">PREPDLE</span>} />
      <main id="main" className="mx-auto max-w-5xl px-4 pb-16 pt-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">
            {today ? `${shortDateLabel(today)} · #${puzzleNumber(today, LAUNCH)}` : ' '}
          </p>
          {today && <StreakBadge n={displayStreak(streaks.global, today)} label="day streak" big />}
        </div>
        {firstVisit ? (
          <section className="mt-6">
            <h2 className="text-3xl font-extrabold tracking-tight">Daily exam games.</h2>
            <p className="mt-2 max-w-prose text-muted">Same puzzles for everyone, every day. Built to exam standard. No account needed.</p>
          </section>
        ) : (
          favorite && (
            <Link href={`/${favorite}`} className="btn btn-primary mt-5" style={{ ['--accent' as string]: tracks.find((t) => t.id === favorite)?.accent }}>
              Continue → {tracks.find((t) => t.id === favorite)?.name}
            </Link>
          )
        )}
        <h2 className="mb-3 mt-7 text-sm font-bold uppercase tracking-wider text-muted">Pick your exam</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {ordered.map((t) => {
            const statuses = t.games.map((g) => day?.[saveKey(t.id, g.gameId)]);
            const allDone = statuses.every((s) => s && s.status !== 'in_progress');
            const ts = today ? displayStreak(streaks.track[t.id], today) : 0;
            return (
              <Link
                key={t.id}
                href={`/${t.id}`}
                onClick={() => useStore.getState().setSettings({ favoriteTrack: t.id })}
                className="card group flex min-h-36 flex-col justify-between overflow-hidden p-4 transition hover:-translate-y-0.5"
                style={{ borderTop: `4px solid ${t.accent}` }}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xl font-extrabold" style={{ color: t.accent }}>
                      {t.name}
                    </span>
                    {allDone && <span aria-label="All done today">✅</span>}
                  </div>
                  <p className="mt-0.5 text-sm text-muted">{t.blurb}</p>
                  <p className="text-xs text-muted">{t.subtitle}</p>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <StatusDots statuses={statuses} />
                  {ts > 0 && <StreakBadge n={ts} />}
                </div>
              </Link>
            );
          })}
        </div>
        <div className="mt-8">
          <Countdown />
        </div>
        <nav className="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm text-muted">
          <Link href="/how-to-play" className="underline-offset-2 hover:underline">How it works</Link>
          <Link href="/stats" className="underline-offset-2 hover:underline">Stats & insights</Link>
          <Link href="/about" className="underline-offset-2 hover:underline">About</Link>
          <Link href="/sources" className="underline-offset-2 hover:underline">Sources</Link>
          <Link href="/privacy" className="underline-offset-2 hover:underline">Privacy</Link>
        </nav>
        <p className="mx-auto mt-6 max-w-prose text-center text-xs text-muted">
          Educational use only. Not medical or legal advice. Not affiliated with AAMC, LSAC, FSMB, NBME or NCBE.
        </p>
      </main>
    </>
  );
}
