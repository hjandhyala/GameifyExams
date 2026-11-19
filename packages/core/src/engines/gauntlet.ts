import { z } from 'zod';
import { CONFIDENCE_EMOJI, RESULT_EMOJI } from '../emoji';
import { EvaluationError, type Engine, type Issue, type SourceRef } from '../types';
import { lintMcq, McqAuthoredSchema, McqPublicSchema, McqSecretSchema, type McqAuthored, type McqSecret } from './mcq';

export const GauntletPublicSchema = z.object({
  questions: z.array(McqPublicSchema).length(5),
  paceSeconds: z.number(),
  timedAllowed: z.boolean(),
});
export type GauntletPublic = z.infer<typeof GauntletPublicSchema>;

export const GauntletSecretSchema = z.object({ keys: z.record(z.string(), McqSecretSchema) });
export type GauntletSecret = z.infer<typeof GauntletSecretSchema>;

export const GauntletMoveSchema = z.object({
  type: z.literal('answer'),
  questionId: z.string(),
  optionId: z.string().nullable(),
  confidence: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  ms: z.number().int().min(0).max(3_600_000),
});
export type GauntletMove = z.infer<typeof GauntletMoveSchema>;

export interface GauntletStepFb {
  questionId: string;
  optionId: string | null;
  correct: boolean;
  correctOptionId: string;
  points: number;
  confidence: 1 | 2 | 3;
  explanation: string;
  optionRationales: Record<string, string>;
  takeaway: string;
  sources: SourceRef[];
  blueprint: { code: string; name: string };
}

export interface GauntletOutcome {
  correct: number;
  points: number;
  perQuestion: { correct: boolean; confidence: 1 | 2 | 3; ms: number }[];
  passed: boolean;
  onPace: boolean;
}

export type GauntletReveal = Record<string, never>;

/** A Gauntlet puzzle is compiled from five MCQ items. */
export const GauntletAuthoredSchema = McqAuthoredSchema;
export type GauntletAuthored = McqAuthored;

export const pointsFor = (correct: boolean, confidence: 1 | 2 | 3): number =>
  correct ? confidence : confidence === 1 ? 0 : confidence === 2 ? -1 : -2;

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

/** Re-letter options so the key lands on `targetLetter`; rationales follow their options. */
export function reletter(q: McqAuthored, targetLetter: string): McqAuthored {
  const keyIdx = q.options.findIndex((o) => o.id === q.correctOptionId);
  const target = LETTERS.indexOf(targetLetter as (typeof LETTERS)[number]);
  if (keyIdx < 0 || target < 0 || target >= q.options.length || keyIdx === target) return q;
  const order = q.options.map((_, i) => i);
  order[keyIdx] = target;
  order[target] = keyIdx;
  const options = order.map((src, i) => ({ id: LETTERS[i]!, text: q.options[src]!.text }));
  const optionRationales: Record<string, string> = {};
  order.forEach((src, i) => {
    const r = q.optionRationales[q.options[src]!.id];
    if (r !== undefined) optionRationales[LETTERS[i]!] = r;
  });
  return { ...q, options, optionRationales, correctOptionId: LETTERS[target]! };
}

export const gauntletEngine: Engine<GauntletPublic, GauntletSecret, GauntletMove, GauntletStepFb, GauntletOutcome, GauntletReveal, GauntletAuthored> = {
  id: 'gauntlet',
  publicSchema: GauntletPublicSchema,
  secretSchema: GauntletSecretSchema,
  moveSchema: GauntletMoveSchema,
  authoredSchema: GauntletAuthoredSchema,

  maxMoves: () => 5,

  validateMove(pub, priorMoves, _steps, move) {
    const q = pub.questions[priorMoves.length];
    if (!q || q.id !== move.questionId) return { ok: false, reason: 'Answer questions in order' };
    if (move.optionId !== null && !q.options.some((o) => o.id === move.optionId)) return { ok: false, reason: 'Pick an option' };
    return { ok: true };
  },

  evaluate(pub, sec, transcript) {
    if (transcript.length > 5) throw new EvaluationError('TOO_MANY_MOVES', 5);
    const steps: GauntletStepFb[] = transcript.map((m, i) => {
      const q = pub.questions[i];
      if (!q || q.id !== m.questionId) throw new EvaluationError('BAD_SEQUENCE', i, 'questions must be answered in order');
      if (m.optionId !== null && !q.options.some((o) => o.id === m.optionId)) throw new EvaluationError('INVALID_MOVE', i);
      const key = sec.keys[q.id];
      if (!key) throw new Error(`missing key for ${q.id}`);
      const correct = m.optionId === key.correctOptionId;
      return {
        questionId: q.id,
        optionId: m.optionId,
        correct,
        correctOptionId: key.correctOptionId,
        points: pointsFor(correct, m.confidence),
        confidence: m.confidence,
        explanation: key.explanation,
        optionRationales: key.optionRationales,
        takeaway: key.takeaway,
        sources: key.sources,
        blueprint: key.blueprint,
      };
    });
    if (steps.length < 5) return { status: 'in_progress', steps };
    const correct = steps.filter((s) => s.correct).length;
    const avgMs = transcript.reduce((a, m) => a + m.ms, 0) / transcript.length;
    return {
      status: correct >= 3 ? 'won' : 'lost',
      steps,
      outcome: {
        correct,
        points: steps.reduce((a, s) => a + s.points, 0),
        perQuestion: transcript.map((m, i) => ({ correct: steps[i]!.correct, confidence: m.confidence, ms: m.ms })),
        passed: correct >= 3,
        onPace: avgMs <= pub.paceSeconds * 1000,
      },
      reveal: {},
    };
  },

  bucket: (o) => String(o.correct),
  bucketOrder: ['5', '4', '3', '2', '1', '0'],
  passed: (o) => o.passed,
  scoreLabel: (o) => `${o.correct}/5 · ${o.points} pts`,
  headline: (o) => (o.correct === 5 ? 'Flawless Gauntlet!' : o.passed ? `${o.correct}/5: you passed` : `${o.correct}/5: review time`),

  shareLines(_pub, steps, o) {
    const lines = [steps.map((s) => (s.correct ? RESULT_EMOJI.right : RESULT_EMOJI.wrong)).join(''), steps.map((s) => CONFIDENCE_EMOJI[s.confidence]).join('')];
    if (o.onPace) lines.push('⏱ on pace');
    return lines;
  },

  checkInvariants(a) {
    const issues: Issue[] = lintMcq(a, { minOptions: 4, maxOptions: 8, negativeStemAllowed: /cannot|except/i.test(a.leadIn) && a.displayTag.startsWith('Logical') });
    if (a.stem.length > 1600) issues.push({ level: 'error', code: 'STEM_LENGTH', message: 'Stem too long' });
    if (a.passage && a.passage.split(/\s+/).length > 320) issues.push({ level: 'warn', code: 'PASSAGE_LENGTH', message: 'Passage over 320 words' });
    if (!a.takeaway.trim()) issues.push({ level: 'error', code: 'TAKEAWAY', message: 'Missing takeaway' });
    return issues;
  },

  compile(items, ctx) {
    if (items.length !== 5) throw new Error('Gauntlet needs exactly 5 items');
    const questions: GauntletPublic['questions'] = [];
    const keys: Record<string, McqSecret> = {};
    for (const q of items) {
      const id = ctx.newId();
      questions.push({
        id,
        displayTag: q.displayTag,
        ...(q.passage ? { passage: q.passage } : {}),
        stem: q.stem,
        ...(q.figure ? { figure: q.figure } : {}),
        ...(q.labs ? { labs: q.labs } : {}),
        leadIn: q.leadIn,
        options: q.options,
        difficulty: q.difficulty,
      });
      keys[id] = {
        correctOptionId: q.correctOptionId,
        explanation: q.explanation,
        optionRationales: q.optionRationales,
        takeaway: q.takeaway,
        blueprint: q.blueprint,
        sources: q.sources,
      };
    }
    return { public: { questions, paceSeconds: ctx.paceSeconds ?? 90, timedAllowed: true }, secret: { keys } };
  },

  secretStrings: (sec) => Object.values(sec.keys).flatMap((k) => [k.explanation, k.takeaway]),
};
