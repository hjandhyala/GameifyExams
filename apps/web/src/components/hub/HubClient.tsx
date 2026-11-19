'use client';
import { buildDailyCard, displayStreak, engineFor, puzzleNumber, type EngineId, type GameId, type TrackId } from '@prepdle/core';
import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { shareText } from '@/client/share';
import { gameStats, saveKey, useStore } from '@/client/store';
import { useToday } from '@/client/today';
import { AppHeader, Icons } from '@/components/shell/AppHeader';
import { Countdown } from '@/components/shell/Countdown';
import { StreakBadge } from '@/components/shell/StreakBadge';
import { useToast } from '@/components/shell/Toast';

interface HubGame {
  gameId: GameId;
  slug: string;
  name: string;
  icon: string;
  tagline: string;
  estMinutes: number;
  engine: EngineId;
}

const LAUNCH = process.env.NEXT_PUBLIC_LAUNCH_DATE ?? '2026-07-15';

export function HubClient({ track, name, subtitle, games, dailyLimitMode }: { track: TrackId; name: string; subtitle: string; games: HubGame[]; dailyLimitMode: 'per_game' | 'per_day' }) {
  const today = useToday();
  const day = useStore((s) => (today ? s.days[today] : undefined));
  const streaks = useStore((s) => s.streaks);
  const history = useStore((s) => s.history);
  const { toast } = useToast();

  useEffect(() => {
    document.documentElement.dataset.track = track;
    useStore.getState().hydrate();
    useStore.getState().setSettings({ favoriteTrack: track });
    if (today) useStore.getState().loadDay(today);
  }, [track, today]);

  const results = games.map((g) => {
    const s = day?.[saveKey(track, g.gameId)];
    const done = s && s.status !== 'in_progress' && s.outcome;
    return { game: g, save: s, scoreLabel: done && !s.voided ? engineFor(g.gameId).scoreLabel(s.outcome!) : null };
  });
  const anyDoneToday = useMemo(() => !!today && history.some((h) => h.d === today), [history, today]);
  const anyDone = results.some((r) => r.scoreLabel);
  const trackStreak = today ? displayStreak(streaks.track[track], today) : 0;
  const totals = useMemo(() => {
    const all = games.map((g) => gameStats(history, track, g.gameId));
    const played = all.reduce((a, s) => a + s.played, 0);
    return { played, passPct: played ? Math.round((all.reduce((a, s) => a + s.passed, 0) / played) * 100) : 0 };
  }, [games, history, track]);

  const share = async () => {
    if (!today) return;
    const text = buildDailyCard({
      track,
      date: today,
      number: puzzleNumber(today, LAUNCH),
      games: results.map((r) => ({ gameId: r.game.gameId, scoreLabel: r.scoreLabel })),
      streak: displayStreak(streaks.global, today),
      domain: process.env.NEXT_PUBLIC_SHARE_DOMAIN,
    });
    const m = await shareText(text, 'daily');
    if (m === 'clipboard') toast('Copied to clipboard');
    if (m === 'manual') window.prompt('Copy your Daily Card:', text);
  };

  return (
    <>
      <AppHeader title={name} badge={undefined} backHref="/" />
      <main id="main" className="mx-auto max-w-5xl px-4 pb-16 pt-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">
            {subtitle}
            {today && ` · #${puzzleNumber(today, LAUNCH)}`}
          </p>
          <StreakBadge n={trackStreak} big />
        </div>
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {results.map(({ game, save, scoreLabel }) => {
            const locked = dailyLimitMode === 'per_day' && anyDoneToday && !save;
            const status = !save ? (locked ? 'Locked today' : 'Play') : save.status === 'in_progress' ? 'Continue' : scoreLabel ?? 'Done';
            return (
              <li key={game.gameId}>
                <Link
                  href={locked ? '#' : `/${track}/${game.slug}`}
                  aria-disabled={locked}
                  className={`card flex items-center gap-4 p-4 transition ${locked ? 'pointer-events-none opacity-50' : 'hover:-translate-y-0.5'}`}
                >
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-surface-2 text-2xl" aria-hidden="true">
                    {game.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="text-lg font-bold">{game.name}</span>
                      <span className="text-xs text-muted">~{game.estMinutes} min</span>
                    </span>
                    <span className="block truncate text-sm text-muted">{game.tagline}</span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-bold ${
                      !save ? 'bg-accent text-on-accent' : save.status === 'in_progress' ? 'border border-accent text-accent' : save.status === 'won' ? 'bg-correct/15 text-correct' : 'bg-wrong/15 text-wrong'
                    }`}
                  >
                    {status}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-6 flex flex-col items-center gap-4">
          <button className="btn btn-primary w-full max-w-sm" disabled={!anyDone} onClick={share}>
            {Icons.share} Share today’s card
          </button>
          <Countdown />
          <p className="text-sm text-muted">
            {totals.played} games played · {totals.passPct}% passed ·{' '}
            <Link href={`/stats?track=${track}`} className="underline">
              Insights
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}
