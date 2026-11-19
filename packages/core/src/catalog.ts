import type { EngineId, GameId, TrackId } from './types';

export interface GameConfig {
  gameId: GameId;
  slug: string;
  engine: EngineId;
  name: string;
  icon: string;
  estMinutes: number;
  tagline: string;
  howTo: string[];
  workup?: { prompt: string; vocabId: string; attributes: { key: string; label: string }[] };
  gauntlet?: { optionCount: number; references: ('labs' | 'periodic')[] };
  classify?: { mode: 'anatomy' | 'verdict' };
}

export interface TrackConfig {
  id: TrackId;
  name: string;
  short: string;
  subtitle: string;
  blurb: string;
  accent: string;
  paceSeconds: number;
  games: GameConfig[];
}

const quartet: GameConfig = {
  gameId: 'quartet',
  slug: 'quartet',
  engine: 'quartet',
  name: 'Quartet',
  icon: '🧩',
  estMinutes: 3,
  tagline: 'Find four groups of four',
  howTo: [
    'Sort the 16 tiles into four hidden groups of four.',
    'Select four tiles and tap Submit.',
    'You can make four mistakes. “One away…” means three of your four belong together.',
    'Groups range from straightforward (green ●) to tricky (red ★). Watch for traps.',
  ],
};

const jargon: GameConfig = {
  gameId: 'jargon',
  slug: 'jargon',
  engine: 'jargon',
  name: 'Jargon',
  icon: '🔤',
  estMinutes: 2,
  tagline: 'Guess the term in six',
  howTo: [
    'Guess the hidden exam term in six tries. Every guess must be a real word of the right length.',
    'Green = right letter, right spot. Gold = in the word, wrong spot. Grey = not in the word.',
    'Stuck? Hints unlock after guesses 2 and 4 (they show in your share).',
    'Finish to see the definition and a bonus question.',
  ],
};

const gauntlet: GameConfig = {
  gameId: 'gauntlet',
  slug: 'gauntlet',
  engine: 'gauntlet',
  name: 'Gauntlet',
  icon: '⚡',
  estMinutes: 7,
  tagline: 'Five questions, rising stakes',
  howTo: [
    'Five exam-style questions, each harder than the last. One shot each.',
    'Pick an answer, then bet your confidence: Guess (+1/0), Likely (+2/−1), Sure (+3/−2).',
    'Every answer comes with an explanation and why each option is right or wrong.',
    'Three or more correct is a pass.',
  ],
};

function workupGame(
  slug: string,
  name: string,
  icon: string,
  tagline: string,
  prompt: string,
  vocabId: string,
  attributes: { key: string; label: string }[],
  noun: string,
): GameConfig {
  return {
    gameId: 'workup',
    slug,
    engine: 'workup',
    name,
    icon,
    estMinutes: 3,
    tagline,
    howTo: [
      `Identify the ${noun} from as few clues as possible. Clues go from vague to specific.`,
      'Pick a guess from the list, or Skip to see the next clue. Each miss reveals another clue.',
      'Wrong guesses show how close you were: ✓ match, ◐ partial, ✗ no match. 🟡 means closely related.',
      'Six clues total. Fewer clues = better score.',
    ],
    workup: { prompt, vocabId, attributes },
  };
}

export const CATALOG: Record<TrackId, TrackConfig> = {
  mcat: {
    id: 'mcat',
    name: 'MCAT',
    short: 'MCAT',
    subtitle: 'Medical College Admission Test',
    blurb: 'Med school',
    accent: '#0F9D9A',
    paceSeconds: 95,
    games: [
      quartet,
      jargon,
      workupGame('specimen', 'Specimen', '🔬', 'Identify it from the clues', 'Identify the specimen', 'mcat-entities', [
        { key: 'section', label: 'Section' },
        { key: 'discipline', label: 'Discipline' },
        { key: 'type', label: 'Type' },
      ], 'molecule, structure or concept'),
      { ...gauntlet, gauntlet: { optionCount: 4, references: ['periodic'] } },
    ],
  },
  lsat: {
    id: 'lsat',
    name: 'LSAT',
    short: 'LSAT',
    subtitle: 'Law School Admission Test',
    blurb: 'Law school',
    accent: '#5B5BD6',
    paceSeconds: 84,
    games: [
      quartet,
      {
        gameId: 'anatomy',
        slug: 'anatomy',
        engine: 'classify',
        name: 'Anatomy',
        icon: '🦴',
        estMinutes: 3,
        tagline: 'Label every part of the argument',
        howTo: [
          'Tap each highlighted part of the argument and give it a role.',
          'Exactly one part is the main conclusion.',
          'Check up to three times: correct parts lock in green.',
          'Solve it to unlock a bonus question.',
        ],
        classify: { mode: 'anatomy' },
      },
      {
        gameId: 'verdict',
        slug: 'verdict',
        engine: 'classify',
        name: 'Verdict',
        icon: '⚖️',
        estMinutes: 4,
        tagline: 'Must, could, or cannot?',
        howTo: [
          'Assume every premise is true.',
          'Classify each claim: Must be true, Could be true, or Cannot be true.',
          'Each check only tells you how many are right, not which. You get three checks.',
          'Watch for converses and inverses: “only if” and “unless” are classic traps.',
        ],
        classify: { mode: 'verdict' },
      },
      { ...gauntlet, gauntlet: { optionCount: 5, references: [] } },
    ],
  },
  boards: {
    id: 'boards',
    name: 'Boards',
    short: 'Boards',
    subtitle: 'USMLE Step 1 & 2 CK',
    blurb: 'Medical boards',
    accent: '#D1435B',
    paceSeconds: 90,
    games: [
      quartet,
      jargon,
      workupGame('workup', 'Workup', '🩺', 'Diagnose with fewer clues', 'Name the diagnosis', 'boards-dx', [
        { key: 'system', label: 'System' },
        { key: 'etiology', label: 'Etiology' },
        { key: 'acuity', label: 'Acuity' },
      ], 'diagnosis'),
      { ...gauntlet, gauntlet: { optionCount: 5, references: ['labs'] } },
    ],
  },
  bar: {
    id: 'bar',
    name: 'Bar',
    short: 'Bar',
    subtitle: 'MBE & NextGen',
    blurb: 'Bar exam',
    accent: '#B7791F',
    paceSeconds: 108,
    games: [
      quartet,
      jargon,
      workupGame('doctrine', 'Doctrine', '📜', 'Name the rule from the facts', 'Name the doctrine', 'bar-doctrines', [
        { key: 'subject', label: 'Subject' },
        { key: 'area', label: 'Area' },
        { key: 'type', label: 'Type' },
      ], 'doctrine'),
      { ...gauntlet, gauntlet: { optionCount: 4, references: [] } },
    ],
  },
};

export const TRACKS: TrackConfig[] = [CATALOG.mcat, CATALOG.lsat, CATALOG.boards, CATALOG.bar];

export function isTrackId(s: string): s is TrackId {
  return s in CATALOG;
}

export function gameBySlug(track: TrackId, slug: string): GameConfig | undefined {
  return CATALOG[track].games.find((g) => g.slug === slug);
}

export function gameById(track: TrackId, gameId: GameId): GameConfig | undefined {
  return CATALOG[track].games.find((g) => g.gameId === gameId);
}

/** All (track, game) slots that are scheduled daily. */
export function allSlots(): { track: TrackId; game: GameConfig }[] {
  return TRACKS.flatMap((t) => t.games.map((game) => ({ track: t.id, game })));
}

/** Weekday difficulty ramp (0 = Sunday). */
export const PUZZLE_DIFFICULTY_BY_WEEKDAY = [3, 2, 2, 3, 3, 4, 4] as const;
export const GAUNTLET_RAMP_BY_WEEKDAY: readonly (readonly number[])[] = [
  [2, 3, 3, 4, 4],
  [1, 2, 2, 3, 3],
  [1, 2, 3, 3, 3],
  [2, 2, 3, 3, 4],
  [2, 3, 3, 4, 4],
  [2, 3, 4, 4, 5],
  [3, 3, 4, 5, 5],
];

export const puzzleIdFor = (track: TrackId, gameId: GameId, date: string): string =>
  `${track}-${gameId}-${date.replaceAll('-', '')}`;

export function parsePuzzleId(id: string): { track: TrackId; gameId: GameId; date: string } | null {
  const m = /^(mcat|lsat|boards|bar)-(quartet|jargon|workup|gauntlet|anatomy|verdict)-(\d{4})(\d{2})(\d{2})$/.exec(id);
  if (!m) return null;
  return { track: m[1] as TrackId, gameId: m[2] as GameId, date: `${m[3]}-${m[4]}-${m[5]}` };
}
