import { TRACKS } from '@prepdle/core';
import { HomeClient } from '@/components/home/HomeClient';
import { FLAGS } from '@/server/env';

export default function HomePage() {
  const tracks = TRACKS.filter((t) => !FLAGS.tracksDisabled.includes(t.id)).map((t) => ({
    id: t.id,
    name: t.name,
    subtitle: t.subtitle,
    blurb: t.blurb,
    accent: t.accent,
    games: t.games.map((g) => ({ gameId: g.gameId, slug: g.slug, name: g.name, icon: g.icon })),
  }));
  return <HomeClient tracks={tracks} />;
}
