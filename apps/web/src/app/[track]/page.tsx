import { CATALOG, isTrackId } from '@prepdle/core';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HubClient } from '@/components/hub/HubClient';
import { FLAGS, gameEnabled } from '@/server/env';

export async function generateMetadata({ params }: { params: Promise<{ track: string }> }): Promise<Metadata> {
  const { track } = await params;
  return isTrackId(track) ? { title: `${CATALOG[track].name} daily games`, description: `Today's ${CATALOG[track].name} puzzles: ${CATALOG[track].subtitle}.` } : {};
}

export default async function TrackPage({ params }: { params: Promise<{ track: string }> }) {
  const { track } = await params;
  if (!isTrackId(track) || FLAGS.tracksDisabled.includes(track)) notFound();
  const t = CATALOG[track];
  return (
    <HubClient
      track={track}
      name={t.name}
      subtitle={t.subtitle}
      games={t.games.filter((g) => gameEnabled(track, g.gameId)).map((g) => ({ gameId: g.gameId, slug: g.slug, name: g.name, icon: g.icon, tagline: g.tagline, estMinutes: g.estMinutes, engine: g.engine }))}
      dailyLimitMode={FLAGS.dailyLimitMode}
    />
  );
}
