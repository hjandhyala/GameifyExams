import { z } from 'zod';
import { letterEmoji } from '../emoji';
import { EvaluationError, type Engine, type Issue } from '../types';
import { BonusSchema, bonusPublic, lintMcq, type McqPublic } from './mcq';

export type LetterState = 'correct' | 'present' | 'absent';

export const JargonPublicSchema = z.object({
  length: z.number().int().min(5).max(8),
  maxGuesses: z.literal(6),
  dictionaryRef: z.object({ track: z.string(), length: z.number(), hash: z.string() }),
  hints: z.array(z.object({ index: z.number(), unlockAfterGuesses: z.number(), kind: z.enum(['category', 'definition']) })),
  hasBonus: z.boolean(),
});
export type JargonPublic = z.infer<typeof JargonPublicSchema>;

export const JargonAuthoredSchema = z.object({
  answer: z.string().regex(/^[A-Z]{5,8}$/),
  category: z.string(),
  definitionClue: z.string(),
  definition: z.string(),
  whyItMatters: z.string(),
  bonus: BonusSchema.optional(),
  blueprintCodes: z.array(z.string()).min(1),
});
export type JargonAuthored = z.infer<typeof JargonAuthoredSchema>;

export const JargonSecretSchema = JargonAuthoredSchema;
export type JargonSecret = JargonAuthored;

export const JargonMoveSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('guess'), word: z.string() }),
  z.object({ type: z.literal('hint'), index: z.number().int().min(0).max(1) }),
  z.object({ type: z.literal('bonus'), optionId: z.string() }),
]);
export type JargonMove = z.infer<typeof JargonMoveSchema>;

export type JargonStepFb =
  | { kind: 'guess'; word: string; letters: LetterState[] }
  | { kind: 'hint'; index: number; text: string }
  | { kind: 'bonus'; correct: boolean; correctOptionId: string; rationale: string };

export interface JargonOutcome {
  solved: boolean;
  guesses: number;
  hintsUsed: number;
  hardMode: boolean;
  bonus?: boolean;
  passed: boolean;
}

export interface JargonReveal {
  answer: string;
  category: string;
  definition: string;
  whyItMatters: string;
  bonus?: Omit<McqPublic, 'id'>;
}

export const HINT_UNLOCKS = [2, 4] as const;

export function scoreGuess(answer: string, guess: string): LetterState[] {
  const res: LetterState[] = Array(guess.length).fill('absent');
  const remaining = new Map<string, number>();
  for (let i = 0; i < answer.length; i++) {
    if (guess[i] === answer[i]) res[i] = 'correct';
    else remaining.set(answer[i]!, (remaining.get(answer[i]!) ?? 0) + 1);
  }
  for (let i = 0; i < guess.length; i++) {
    if (res[i] === 'correct') continue;
    const n = remaining.get(guess[i]!) ?? 0;
    if (n > 0) {
      res[i] = 'present';
      remaining.set(guess[i]!, n - 1);
    }
  }
  return res;
}

/** Returns a reason string if the guess violates hard-mode constraints, else null. */
export function hardModeViolation(prior: { word: string; letters: LetterState[] }[], guess: string): string | null {
  for (const p of prior) {
    for (let i = 0; i < p.word.length; i++)
      if (p.letters[i] === 'correct' && guess[i] !== p.word[i]) return `Letter ${i + 1} must be ${p.word[i]}`;
    const need = new Map<string, number>();
    for (let i = 0; i < p.word.length; i++)
      if (p.letters[i] !== 'absent') need.set(p.word[i]!, (need.get(p.word[i]!) ?? 0) + 1);
    for (const [ch, n] of need) {
      const have = [...guess].filter((c) => c === ch).length;
      if (have < n) return `Guess must contain ${ch}`;
    }
  }
  return null;
}

const guessesOf = (steps: JargonStepFb[]) => steps.filter((s): s is Extract<JargonStepFb, { kind: 'guess' }> => s.kind === 'guess');

export const jargonEngine: Engine<JargonPublic, JargonSecret, JargonMove, JargonStepFb, JargonOutcome, JargonReveal, JargonAuthored> = {
  id: 'jargon',
  publicSchema: JargonPublicSchema,
  secretSchema: JargonSecretSchema,
  moveSchema: JargonMoveSchema,
  authoredSchema: JargonAuthoredSchema,

  maxMoves: () => 9,

  validateMove(pub, priorMoves, priorSteps, move, ctx) {
    if (move.type === 'guess') {
      const w = move.word.toUpperCase();
      if (w.length !== pub.length) return { ok: false, reason: 'Not enough letters' };
      if (!/^[A-Z]+$/.test(w)) return { ok: false, reason: 'Letters only' };
      if (ctx.dictionary && !ctx.dictionary.has(w)) return { ok: false, reason: 'Not in word list' };
      if (ctx.hardMode) {
        const v = hardModeViolation(guessesOf(priorSteps), w);
        if (v) return { ok: false, reason: v };
      }
      return { ok: true };
    }
    if (move.type === 'hint') {
      const used = priorMoves.filter((m) => m.type === 'hint').length;
      const guesses = priorMoves.filter((m) => m.type === 'guess').length;
      if (move.index !== used) return { ok: false, reason: 'Use hints in order' };
      if (guesses < HINT_UNLOCKS[move.index as 0 | 1]) return { ok: false, reason: 'Hint locked' };
      return { ok: true };
    }
    return { ok: true };
  },

  evaluate(pub, sec, transcript, ctx) {
    if (transcript.length > 9) throw new EvaluationError('TOO_MANY_MOVES', 9);
    const steps: JargonStepFb[] = [];
    let guesses = 0;
    let hints = 0;
    let solved = false;
    let terminal = false;
    let bonus: boolean | undefined;
    const answer = sec.answer;

    transcript.forEach((m, i) => {
      if (m.type === 'bonus') {
        if (!terminal || !sec.bonus || bonus !== undefined) throw new EvaluationError('BAD_SEQUENCE', i, 'bonus not available');
        const ok = m.optionId === sec.bonus.correctOptionId;
        bonus = ok;
        steps.push({
          kind: 'bonus',
          correct: ok,
          correctOptionId: sec.bonus.correctOptionId,
          rationale: sec.bonus.optionRationales[m.optionId] ?? sec.bonus.explanation,
        });
        return;
      }
      if (terminal) throw new EvaluationError('MOVE_AFTER_TERMINAL', i);
      if (m.type === 'hint') {
        if (m.index !== hints || guesses < HINT_UNLOCKS[m.index as 0 | 1]) throw new EvaluationError('BAD_SEQUENCE', i, 'hint locked');
        hints++;
        steps.push({ kind: 'hint', index: m.index, text: m.index === 0 ? sec.category : sec.definitionClue });
        return;
      }
      const w = m.word.toUpperCase();
      if (w.length !== pub.length || !/^[A-Z]+$/.test(w)) throw new EvaluationError('INVALID_MOVE', i, 'bad word shape');
      if (ctx.dictionary && !ctx.dictionary.has(w) && w !== answer) throw new EvaluationError('INVALID_MOVE', i, 'not in word list');
      if (ctx.hardMode) {
        const v = hardModeViolation(guessesOf(steps), w);
        if (v) throw new EvaluationError('INVALID_MOVE', i, v);
      }
      guesses++;
      steps.push({ kind: 'guess', word: w, letters: scoreGuess(answer, w) });
      if (w === answer) {
        solved = true;
        terminal = true;
      } else if (guesses >= 6) terminal = true;
    });

    if (!terminal) return { status: 'in_progress', steps };
    return {
      status: solved ? 'won' : 'lost',
      steps,
      outcome: { solved, guesses, hintsUsed: hints, hardMode: !!ctx.hardMode, passed: solved, ...(bonus !== undefined ? { bonus } : {}) },
      reveal: {
        answer: sec.answer,
        category: sec.category,
        definition: sec.definition,
        whyItMatters: sec.whyItMatters,
        ...(sec.bonus ? { bonus: bonusPublic(sec.bonus) } : {}),
      },
    };
  },

  bucket: (o) => (o.solved ? String(o.guesses) : 'X'),
  bucketOrder: ['1', '2', '3', '4', '5', '6', 'X'],
  passed: (o) => o.passed,
  scoreLabel: (o) => `${o.solved ? o.guesses : 'X'}/6${o.hardMode ? '*' : ''}`,
  headline: (o) => (o.solved ? (o.guesses <= 2 ? 'Brilliant!' : o.guesses <= 4 ? 'Nicely done!' : 'Phew, got it!') : 'Not this time'),

  shareLines(_pub, steps, o, opts) {
    const e = letterEmoji(opts);
    const rows = guessesOf(steps).map((s) => s.letters.map((l) => e[l]).join(''));
    const extras = [`💡${o.hintsUsed}`];
    if (o.bonus !== undefined) extras.push(`Bonus ${o.bonus ? '✅' : '❌'}`);
    return [...rows, extras.join(' · ')];
  },

  checkInvariants(a, ctx) {
    const issues: Issue[] = [];
    if (ctx.dictionary && !ctx.dictionary.has(a.answer))
      issues.push({ level: 'error', code: 'NOT_IN_DICT', message: `${a.answer} is not in the guess dictionary` });
    const stem = a.answer.slice(0, 5).toLowerCase();
    if (a.definitionClue.toLowerCase().includes(stem) || a.category.toLowerCase().includes(stem))
      issues.push({ level: 'error', code: 'CLUE_LEAK', message: 'Hint text leaks the answer' });
    if (!a.definition.trim() || !a.whyItMatters.trim()) issues.push({ level: 'error', code: 'MISSING_TEXT', message: 'Definition and why-it-matters required' });
    if (a.bonus) for (const i of lintMcq(a.bonus, { minOptions: 3, maxOptions: 5 })) issues.push({ ...i, code: `BONUS_${i.code}` });
    return issues;
  },

  compile(items, ctx) {
    const a = items[0]!;
    const hash = ctx.dictHashes?.[a.answer.length];
    if (!hash) throw new Error(`No dictionary hash for length ${a.answer.length}`);
    return {
      public: {
        length: a.answer.length,
        maxGuesses: 6,
        dictionaryRef: { track: ctx.track, length: a.answer.length, hash },
        hints: [
          { index: 0, unlockAfterGuesses: HINT_UNLOCKS[0], kind: 'category' },
          { index: 1, unlockAfterGuesses: HINT_UNLOCKS[1], kind: 'definition' },
        ],
        hasBonus: !!a.bonus,
      },
      secret: a,
    };
  },

  secretStrings: (sec) => [sec.answer, sec.category, sec.definitionClue, sec.definition],
};

