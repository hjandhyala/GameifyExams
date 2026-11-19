import { BAR_FIXTURES } from './bar';
import { BOARDS_FIXTURES } from './boards';
import { LSAT_FIXTURES } from './lsat';
import { MCAT_FIXTURES } from './mcat';
import type { FixtureItem } from './types';

export type { FixtureItem } from './types';
export const FIXTURES: FixtureItem[] = [...MCAT_FIXTURES, ...LSAT_FIXTURES, ...BOARDS_FIXTURES, ...BAR_FIXTURES];
