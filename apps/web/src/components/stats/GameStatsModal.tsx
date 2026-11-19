'use client';
import { displayStreak, engineFor, type GameId, type TrackId } from '@prepdle/core';
import { gameStats, useStore } from '@/client/store';
import { useToday } from '@/client/today';
import { Distribution } from '@/components/results/Distribution';

export function GameStatsModal({ track, gameId }: { track: TrackId; gameId: GameId }) {
  const history = useStore((s) => s.history);
  const streaks = useStore((s) => s.streaks);
  const today = useToday();
  const st = gameStats(history, track, gameId);
  const s = streaks.game[`${track}:${gameId}`];
  const engine = engineFor(gameId);
  const todayBucket = history.find((h) => h.d === today && h.t === track && h.g === gameId)?.b;
  const tiles = [
    ['Played', st.played],
    ['Pass %', st.played ? Math.round((st.passed / st.played) * 100) : 0],
    ['Current streak', today ? displayStreak(s, today) : 0],
    ['Max streak', s?.max ?? 0],
  ] as const;
  return (
    <div>
      <div className="grid grid-cols-4 gap-2 text-center">
        {tiles.map(([l, v]) => (
          <div key={l}>
            <div className="text-3xl font-extrabold tabular">{v}</div>
            <div className="text-xs text-muted">{l}</div>
          </div>
        ))}
      </div>
      <h3 className="mb-2 mt-5 text-sm font-bold uppercase tracking-wider text-muted">Your distribution</h3>
      {st.played ? <Distribution distribution={st.distribution} order={engine.bucketOrder} highlight={todayBucket} labels={{ X: '✗' }} /> : <p className="text-sm text-muted">Play a game to see your stats.</p>}
    </div>
  );
}
