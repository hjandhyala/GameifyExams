'use client';
import { CATALOG, gameById, type GameId, type TrackId } from '@prepdle/core';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { track as trackEvent } from '@/client/analytics';
import { saveKey, useStore } from '@/client/store';
import { useDailyGame } from '@/client/useDailyGame';
import { AppHeader } from '@/components/shell/AppHeader';
import { Sheet } from '@/components/shell/Sheet';
import { HowToPlay } from './HowToPlay';
import { ResultSheet } from '@/components/results/ResultSheet';
import { GameStatsModal } from '@/components/stats/GameStatsModal';
import type { EngineProps } from './types';

const Skeleton = () => (
  <div className="mx-auto mt-6 grid max-w-md grid-cols-4 gap-2 px-4" aria-hidden="true">
    {Array.from({ length: 16 }).map((_, i) => (
      <div key={i} className="anim-pulse h-16 rounded-xl bg-surface-2" />
    ))}
  </div>
);

const ENGINES = {
  quartet: dynamic(() => import('@/components/games/Quartet'), { loading: Skeleton }),
  jargon: dynamic(() => import('@/components/games/Jargon'), { loading: Skeleton }),
  workup: dynamic(() => import('@/components/games/Workup'), { loading: Skeleton }),
  gauntlet: dynamic(() => import('@/components/games/Gauntlet'), { loading: Skeleton }),
  classify: dynamic(() => import('@/components/games/Classify'), { loading: Skeleton }),
} as const;

export function GameScreen({
  track,
  gameId,
  timedMode,
  bonusEnabled,
  showGlobalStats,
}: {
  track: TrackId;
  gameId: GameId;
  timedMode: 'off' | 'optional' | 'forced';
  bonusEnabled: boolean;
  showGlobalStats: boolean;
}) {
  const config = gameById(track, gameId)!;
  const g = useDailyGame(track, gameId);
  const key = saveKey(track, gameId);
  const seen = useStore((s) => s.settings.seenHowTo[key]);
  const hydrated = useStore((s) => s.hydrated);
  const [howTo, setHowTo] = useState(false);
  const [stats, setStats] = useState(false);
  const [results, setResults] = useState(false);
  const wasCompleted = useRef<boolean | null>(null);

  useEffect(() => {
    document.documentElement.dataset.track = track;
  }, [track]);

  useEffect(() => {
    if (hydrated && !seen && g.phase !== 'loading') {
      setHowTo(true);
      trackEvent('howto_open', { track, game: gameId, auto: true });
    }
  }, [hydrated, seen, g.phase, track, gameId]);

  // Open the result sheet shortly after the game ends (not when revisiting a finished game).
  useEffect(() => {
    if (g.phase === 'loading') return;
    const completed = g.phase === 'completed';
    if (wasCompleted.current === false && completed) {
      const t = setTimeout(() => setResults(true), 900);
      return () => clearTimeout(t);
    }
    if (wasCompleted.current === null && completed) setResults(true);
    wasCompleted.current = completed;
  }, [g.phase]);

  const closeHowTo = () => {
    setHowTo(false);
    useStore.getState().setSettings({ seenHowTo: { ...useStore.getState().settings.seenHowTo, [key]: true } });
  };

  const Engine = ENGINES[config.engine];
  const props: EngineProps = { g, track, config, timedMode, bonusEnabled, openResults: () => setResults(true) };

  return (
    <>
      <AppHeader
        backHref={`/${track}`}
        badge={CATALOG[track].short}
        title={
          <>
            {config.name}
            {g.puzzle && <span className="ml-2 hidden text-sm font-medium text-muted sm:inline">#{g.puzzle.number}</span>}
          </>
        }
        onHelp={() => setHowTo(true)}
        onStats={() => setStats(true)}
      />
      <main id="main" className="mx-auto max-w-5xl pb-6">
        {g.phase === 'loading' && <Skeleton />}
        {g.phase === 'error' && g.error && !g.voided && (
          <div className="mx-auto mt-10 max-w-md px-4 text-center">
            <p className="text-4xl" aria-hidden="true">
              {g.error.code === 'PUZZLE_NOT_SCHEDULED' ? '🧪' : g.error.code === 'DATE_NOT_AVAILABLE' ? '🕰️' : '⚠️'}
            </p>
            <h2 className="mt-3 text-xl font-bold">
              {g.error.code === 'PUZZLE_NOT_SCHEDULED'
                ? 'Today’s puzzle is still in the oven.'
                : g.error.code === 'DATE_NOT_AVAILABLE'
                  ? 'Your device clock looks off.'
                  : g.error.code === 'NETWORK'
                    ? 'You appear to be offline.'
                    : 'Something went wrong.'}
            </h2>
            <p className="mt-2 text-muted">
              {g.error.code === 'DATE_NOT_AVAILABLE' ? 'Today’s puzzle is based on your local date. Check your date and time settings.' : 'Try another game, or try again in a moment.'}
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <button className="btn" onClick={g.reload}>
                Try again
              </button>
              <Link className="btn btn-primary" href={`/${track}`}>
                Other games
              </Link>
            </div>
          </div>
        )}
        {g.puzzle && g.phase !== 'loading' && g.phase !== 'error' && <Engine {...props} />}
        {g.phase === 'completed' && !results && (
          <div className="mt-4 flex justify-center px-4">
            <button className="btn btn-primary w-full max-w-sm" onClick={() => setResults(true)}>
              See results
            </button>
          </div>
        )}
      </main>

      <Sheet open={howTo} onClose={closeHowTo} title={`How to play ${config.name}`}>
        <HowToPlay config={config} track={track} onDone={closeHowTo} />
      </Sheet>
      <Sheet open={stats} onClose={() => setStats(false)} title={`${config.name} statistics`}>
        <GameStatsModal track={track} gameId={gameId} />
      </Sheet>
      <Sheet open={results && g.phase === 'completed'} onClose={() => setResults(false)} wide title={undefined}>
        {g.puzzle && g.save && <ResultSheet g={g} track={track} config={config} showGlobalStats={showGlobalStats} bonusEnabled={bonusEnabled} />}
      </Sheet>
      <Sheet open={!!g.voided} onClose={g.skipVoided} title="We fixed today’s puzzle">
        <p className="text-muted">We found an error in today’s puzzle and corrected it. Sorry! Your streak is protected either way.</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          {g.voided?.replacementVersion !== undefined || g.phase === 'error' ? (
            <button className="btn btn-primary flex-1" onClick={g.playCorrected}>
              Play corrected puzzle
            </button>
          ) : null}
          <button className="btn flex-1" onClick={g.skipVoided}>
            Skip today
          </button>
        </div>
      </Sheet>
    </>
  );
}
