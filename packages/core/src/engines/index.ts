import type { Engine, EngineId, GameId } from '../types';
import { classifyEngine } from './classify';
import { gauntletEngine } from './gauntlet';
import { jargonEngine } from './jargon';
import { quartetEngine } from './quartet';
import { workupEngine } from './workup';

export const ENGINES: Record<EngineId, Engine> = {
  quartet: quartetEngine as Engine,
  jargon: jargonEngine as Engine,
  workup: workupEngine as Engine,
  gauntlet: gauntletEngine as Engine,
  classify: classifyEngine as Engine,
};

export const ENGINE_FOR_GAME: Record<GameId, EngineId> = {
  quartet: 'quartet',
  jargon: 'jargon',
  workup: 'workup',
  gauntlet: 'gauntlet',
  anatomy: 'classify',
  verdict: 'classify',
};

export const engineFor = (gameId: GameId): Engine => ENGINES[ENGINE_FOR_GAME[gameId]];

/** Item `kind` stored in the content bank for each game. */
export const ITEM_KIND_FOR_GAME: Record<GameId, string> = {
  quartet: 'quartet_board',
  jargon: 'jargon_word',
  workup: 'workup_case',
  gauntlet: 'mcq',
  anatomy: 'classify_anatomy',
  verdict: 'classify_verdict',
};

export * from './classify';
export * from './gauntlet';
export * from './jargon';
export * from './mcq';
export * from './quartet';
export * from './workup';
