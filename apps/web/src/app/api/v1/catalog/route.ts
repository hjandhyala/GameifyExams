import { TRACKS } from '@prepdle/core';
import { FLAGS, gameEnabled, LAUNCH_DATE } from '@/server/env';
import { json, route } from '@/server/http';

export const GET = route('catalog', async () =>
  json(
    {
      launchDate: LAUNCH_DATE,
      tracks: TRACKS.filter((t) => !FLAGS.tracksDisabled.includes(t.id)).map((t) => ({
        id: t.id,
        name: t.name,
        subtitle: t.subtitle,
        accent: t.accent,
        games: t.games
          .filter((g) => gameEnabled(t.id, g.gameId))
          .map((g) => ({ gameId: g.gameId, slug: g.slug, engine: g.engine, name: g.name, tagline: g.tagline, estMinutes: g.estMinutes, icon: g.icon })),
      })),
      flags: { dailyLimitMode: FLAGS.dailyLimitMode, archiveEnabled: FLAGS.archiveEnabled, gauntletTimedMode: FLAGS.gauntletTimedMode, showGlobalStats: FLAGS.showGlobalStats, bonusQuestions: FLAGS.bonusQuestions },
    },
    { cache: { sMaxAge: 3600, swr: 86_400 } },
  ),
);
