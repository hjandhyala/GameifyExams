import type { z } from 'zod';

export type TrackId = 'mcat' | 'lsat' | 'boards' | 'bar';
export type EngineId = 'quartet' | 'jargon' | 'workup' | 'gauntlet' | 'classify';
export type GameId = 'quartet' | 'jargon' | 'workup' | 'gauntlet' | 'anatomy' | 'verdict';
/** 'YYYY-MM-DD' */
export type ISODate = string;
export type GameStatus = 'in_progress' | 'won' | 'lost';

export const TRACK_IDS: readonly TrackId[] = ['mcat', 'lsat', 'boards', 'bar'];
export const GAME_IDS: readonly GameId[] = ['quartet', 'jargon', 'workup', 'gauntlet', 'anatomy', 'verdict'];

export interface SourceRef {
  id: string;
  locator: string;
  url?: string;
}

export interface PuzzleEnvelope<P = unknown> {
  puzzleId: string;
  track: TrackId;
  gameId: GameId;
  engine: EngineId;
  date: ISODate;
  number: number;
  version: number;
  difficulty: number;
  payload: P;
}

export interface EvaluationResult<StepFb = unknown, Outcome = unknown, Reveal = unknown> {
  status: GameStatus;
  steps: StepFb[];
  /** Present iff status !== 'in_progress'. */
  outcome?: Outcome;
  /** Full solution and explanations; present iff terminal. */
  reveal?: Reveal;
}

export type EvaluationErrorCode =
  | 'INVALID_MOVE'
  | 'MOVE_AFTER_TERMINAL'
  | 'TOO_MANY_MOVES'
  | 'DUPLICATE_GUESS'
  | 'UNKNOWN_ID'
  | 'BAD_SEQUENCE';

export class EvaluationError extends Error {
  constructor(
    public readonly code: EvaluationErrorCode,
    public readonly moveIndex: number,
    message: string = code,
  ) {
    super(message === code ? code : `${code}: ${message}`);
    this.name = 'EvaluationError';
  }
}

export interface ShareOpts {
  theme: 'light' | 'dark';
  highContrast: boolean;
}

export interface Issue {
  level: 'error' | 'warn';
  code: string;
  message: string;
}

export type MoveValidation = { ok: true } | { ok: false; reason: string };

export interface VocabEntry {
  id: string;
  name: string;
  syn?: string[];
  abbr?: string[];
  attrs: Record<string, string | string[]>;
  parent?: string;
  commonness?: number;
  giveaways?: string[];
}

/** Context available while evaluating or validating. Servers always provide dictionary/vocab where the engine needs them. */
export interface EvalCtx {
  dictionary?: ReadonlySet<string>;
  vocab?: ReadonlyMap<string, VocabEntry>;
  hardMode?: boolean;
}

export interface CompileCtx {
  track: TrackId;
  /** Seeded RNG for deterministic layout decisions. */
  rng: () => number;
  /** CSPRNG-backed opaque id generator. */
  newId: () => string;
  dictHashes?: Partial<Record<number, string>>;
  vocabRef?: { id: string; hash: string };
  attributes?: { key: string; label: string }[];
  prompt?: string;
  paceSeconds?: number;
}

export interface Compiled<Pub, Sec> {
  public: Pub;
  secret: Sec;
}

export interface Engine<Pub = any, Sec = any, Move = any, StepFb = any, Outcome = any, Reveal = any, Authored = any> {
  id: EngineId;
  publicSchema: z.ZodType<Pub>;
  secretSchema: z.ZodType<Sec>;
  moveSchema: z.ZodType<Move>;
  authoredSchema: z.ZodType<Authored>;

  maxMoves(pub: Pub): number;
  validateMove(pub: Pub, priorMoves: Move[], priorSteps: StepFb[], move: Move, ctx: EvalCtx): MoveValidation;
  evaluate(pub: Pub, sec: Sec, transcript: Move[], ctx: EvalCtx): EvaluationResult<StepFb, Outcome, Reveal>;

  bucket(outcome: Outcome): string;
  bucketOrder: readonly string[];
  passed(outcome: Outcome): boolean;
  /** Short score label, e.g. "4/6", "✅ 1 mistake". */
  scoreLabel(outcome: Outcome): string;
  headline(outcome: Outcome): string;
  shareLines(pub: Pub, steps: StepFb[], outcome: Outcome, opts: ShareOpts): string[];

  checkInvariants(authored: Authored, ctx: EvalCtx): Issue[];
  /** Turns an authored item (or items) into a compiled puzzle. */
  compile(authored: Authored[], ctx: CompileCtx): Compiled<Pub, Sec>;
  /** Strings that must never appear in public payloads or non-terminal steps. */
  secretStrings(sec: Sec): string[];
}
