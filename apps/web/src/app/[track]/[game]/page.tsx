import { CATALOG, gameBySlug, isTrackId } from '@prepdle/core';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { GameScreen } from '@/components/game/GameScreen';
import { FLAGS, gameEnabled } from '@/server/env';

type Params = { params: Promise<{ track: string; game: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { track, game } = await params;
  if (!isTrackId(track)) return {};
  const g = gameBySlug(track, game);
  return g ? { title: `${CATALOG[track].name} ${g.name}`, description: g.tagline } : {};
}

export default async function GamePage({ params }: Params) {
  const { track, game } = await params;
  if (!isTrackId(track)) notFound();
  const g = gameBySlug(track, game);
  if (!g || !gameEnabled(track, g.gameId)) notFound();
  return <GameScreen track={track} gameId={g.gameId} timedMode={FLAGS.gauntletTimedMode} bonusEnabled={FLAGS.bonusQuestions} showGlobalStats={FLAGS.showGlobalStats} />;
}
