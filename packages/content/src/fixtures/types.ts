import type { ClassifyAuthored, GameId, GauntletAuthored, JargonAuthored, QuartetAuthored, TrackId, WorkupAuthored } from '@prepdle/core';

interface Base<G extends GameId, A> {
  /** Stable fixture key (also used as the item id when seeding). */
  key: string;
  track: TrackId;
  gameId: G;
  difficulty: 1 | 2 | 3 | 4 | 5;
  /** Cross-game conflict tags (e.g. 'dx:sarcoidosis'). */
  conceptIds: string[];
  authored: A;
}

export type FixtureItem =
  | Base<'quartet', QuartetAuthored>
  | Base<'jargon', JargonAuthored>
  | Base<'workup', WorkupAuthored>
  | Base<'gauntlet', GauntletAuthored>
  | Base<'anatomy', ClassifyAuthored>
  | Base<'verdict', ClassifyAuthored>;
