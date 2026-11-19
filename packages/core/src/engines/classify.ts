import { z } from 'zod';
import { RESULT_EMOJI } from '../emoji';
import { classify as solve, parse } from '../logic/solver';
import { EvaluationError, type Engine, type Issue } from '../types';
import { BonusSchema, bonusPublic, lintMcq, type McqPublic } from './mcq';

export const ANATOMY_LABELS = [
  { id: 'main', name: 'Main conclusion', short: 'Main', description: 'The claim the whole argument is trying to establish.' },
  { id: 'inter', name: 'Intermediate conclusion', short: 'Sub-concl.', description: 'Supported by a premise and in turn supports the main conclusion.' },
  { id: 'premise', name: 'Premise', short: 'Premise', description: 'Offered as support for a conclusion.' },
  { id: 'background', name: 'Background', short: 'Context', description: 'Sets the scene; neither supports nor opposes the conclusion.' },
  { id: 'opposing', name: 'Opposing view', short: 'Opposing', description: 'A position the author argues against.' },
  { id: 'concession', name: 'Concession', short: 'Concede', description: 'Acknowledges a point that cuts against the conclusion.' },
] as const;

export const VERDICT_LABELS = [
  { id: 'must', name: 'Must be true', short: 'Must', description: 'True in every scenario consistent with the premises.' },
  { id: 'could', name: 'Could be true', short: 'Could', description: 'True in some scenarios, false in others.' },
  { id: 'cannot', name: 'Cannot be true', short: 'Cannot', description: 'False in every scenario consistent with the premises.' },
] as const;

const LabelSchema = z.object({ id: z.string(), name: z.string(), short: z.string(), description: z.string() });

export const ClassifyPublicSchema = z.object({
  mode: z.enum(['anatomy', 'verdict']),
  intro: z.string(),
  premises: z.array(z.string()).optional(),
  items: z.array(z.object({ id: z.string(), text: z.string() })).min(3).max(8),
  labels: z.array(LabelSchema),
  maxChecks: z.literal(3),
  feedback: z.enum(['per_item', 'count']),
  constraints: z.array(z.object({ labelId: z.string(), exactly: z.number().optional() })).optional(),
  hasBonus: z.boolean(),
});
export type ClassifyPublic = z.infer<typeof ClassifyPublicSchema>;

export const ClassifySecretSchema = z.object({
  key: z.record(z.string(), z.string()),
  explanations: z.record(z.string(), z.string()),
  formal: z
    .object({ variables: z.record(z.string(), z.string()), premises: z.array(z.string()), claims: z.record(z.string(), z.string()) })
    .optional(),
  bonus: BonusSchema.optional(),
  blueprintCodes: z.array(z.string()),
});
export type ClassifySecret = z.infer<typeof ClassifySecretSchema>;

const AnatomyAuthored = z.object({
  mode: z.literal('anatomy'),
  intro: z.string().default('Label the role each highlighted part plays in the argument.'),
  segments: z.array(z.object({ text: z.string(), label: z.enum(['main', 'inter', 'premise', 'background', 'opposing', 'concession']), explanation: z.string() })).min(3).max(8),
  bonus: BonusSchema.optional(),
  blueprintCodes: z.array(z.string()).min(1),
});
const VerdictAuthored = z.object({
  mode: z.literal('verdict'),
  intro: z.string().default('Assume every premise is true. Classify each claim.'),
  premises: z.array(z.string()).min(2).max(5),
  formal: z.object({ variables: z.record(z.string(), z.string()), premises: z.array(z.string()) }),
  claims: z.array(z.object({ text: z.string(), formula: z.string(), label: z.enum(['must', 'could', 'cannot']), explanation: z.string() })).length(6),
  blueprintCodes: z.array(z.string()).min(1),
});
export const ClassifyAuthoredSchema = z.discriminatedUnion('mode', [AnatomyAuthored, VerdictAuthored]);
export type ClassifyAuthored = z.infer<typeof ClassifyAuthoredSchema>;

export const ClassifyMoveSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('check'), assignment: z.record(z.string(), z.string()) }),
  z.object({ type: z.literal('bonus'), optionId: z.string() }),
]);
export type ClassifyMove = z.infer<typeof ClassifyMoveSchema>;

export type ClassifyStepFb =
  | { kind: 'check'; correctCount: number; total: number; perItem?: Record<string, boolean> }
  | { kind: 'bonus'; correct: boolean; correctOptionId: string; rationale: string };

export interface ClassifyOutcome {
  solved: boolean;
  checks: number;
  firstCheckCorrect: number;
  total: number;
  passed: boolean;
  bonus?: boolean;
}

export interface ClassifyReveal {
  key: Record<string, string>;
  explanations: Record<string, string>;
  bonus?: Omit<McqPublic, 'id'>;
}

const checksOf = (steps: ClassifyStepFb[]) => steps.filter((s): s is Extract<ClassifyStepFb, { kind: 'check' }> => s.kind === 'check');

export const classifyEngine: Engine<ClassifyPublic, ClassifySecret, ClassifyMove, ClassifyStepFb, ClassifyOutcome, ClassifyReveal, ClassifyAuthored> = {
  id: 'classify',
  publicSchema: ClassifyPublicSchema,
  secretSchema: ClassifySecretSchema,
  moveSchema: ClassifyMoveSchema,
  authoredSchema: ClassifyAuthoredSchema,

  maxMoves: () => 4,

  validateMove(pub, _prior, _steps, move) {
    if (move.type === 'bonus') return { ok: true };
    const labels = new Set(pub.labels.map((l) => l.id));
    for (const it of pub.items) {
      const l = move.assignment[it.id];
      if (!l) return { ok: false, reason: 'Label every part first' };
      if (!labels.has(l)) return { ok: false, reason: 'Unknown label' };
    }
    return { ok: true };
  },

  evaluate(pub, sec, transcript) {
    if (transcript.length > 4) throw new EvaluationError('TOO_MANY_MOVES', 4);
    const steps: ClassifyStepFb[] = [];
    const labels = new Set(pub.labels.map((l) => l.id));
    let checks = 0;
    let solved = false;
    let terminal = false;
    let first = 0;
    let bonus: boolean | undefined;
    const total = pub.items.length;

    transcript.forEach((m, i) => {
      if (m.type === 'bonus') {
        if (!terminal || !sec.bonus || bonus !== undefined) throw new EvaluationError('BAD_SEQUENCE', i, 'bonus not available');
        bonus = m.optionId === sec.bonus.correctOptionId;
        steps.push({ kind: 'bonus', correct: bonus, correctOptionId: sec.bonus.correctOptionId, rationale: sec.bonus.optionRationales[m.optionId] ?? sec.bonus.explanation });
        return;
      }
      if (terminal) throw new EvaluationError('MOVE_AFTER_TERMINAL', i);
      const perItem: Record<string, boolean> = {};
      let correctCount = 0;
      for (const it of pub.items) {
        const l = m.assignment[it.id];
        if (!l || !labels.has(l)) throw new EvaluationError('INVALID_MOVE', i, 'every item needs a valid label');
        perItem[it.id] = l === sec.key[it.id];
        if (perItem[it.id]) correctCount++;
      }
      checks++;
      if (checks === 1) first = correctCount;
      steps.push(pub.feedback === 'per_item' ? { kind: 'check', correctCount, total, perItem } : { kind: 'check', correctCount, total });
      if (correctCount === total) {
        solved = true;
        terminal = true;
      } else if (checks >= pub.maxChecks) terminal = true;
    });

    if (!terminal) return { status: 'in_progress', steps };
    return {
      status: solved ? 'won' : 'lost',
      steps,
      outcome: { solved, checks, firstCheckCorrect: first, total, passed: solved, ...(bonus !== undefined ? { bonus } : {}) },
      reveal: { key: sec.key, explanations: sec.explanations, ...(sec.bonus ? { bonus: bonusPublic(sec.bonus) } : {}) },
    };
  },

  bucket: (o) => (o.solved ? String(o.checks) : 'X'),
  bucketOrder: ['1', '2', '3', 'X'],
  passed: (o) => o.passed,
  scoreLabel: (o) => `${o.solved ? o.checks : 'X'}/3`,
  headline: (o) => (o.solved ? (o.checks === 1 ? 'Nailed it first try!' : `Solved in ${o.checks} checks`) : 'Out of checks'),

  shareLines(pub, steps, o) {
    const rows = checksOf(steps).map((s) => {
      if (s.perItem) return pub.items.map((it) => (s.perItem![it.id] ? RESULT_EMOJI.right : RESULT_EMOJI.wrong)).join('');
      return `${RESULT_EMOJI.right.repeat(s.correctCount)}${RESULT_EMOJI.unused.repeat(s.total - s.correctCount)}  ${s.correctCount}/${s.total}`;
    });
    if (o.bonus !== undefined) rows.push(`Bonus ${o.bonus ? '✅' : '❌'}`);
    return rows;
  },

  checkInvariants(a) {
    const issues: Issue[] = [];
    if (a.mode === 'anatomy') {
      const mains = a.segments.filter((s) => s.label === 'main').length;
      if (mains !== 1) issues.push({ level: 'error', code: 'ONE_MAIN', message: `Exactly one main conclusion required (got ${mains})` });
      if (a.bonus) for (const i of lintMcq(a.bonus, { minOptions: 4, maxOptions: 5, negativeStemAllowed: true })) issues.push({ ...i, code: `BONUS_${i.code}` });
    } else {
      if (a.formal.premises.length !== a.premises.length)
        issues.push({ level: 'error', code: 'FORMAL_COUNT', message: 'Formal premises must align with natural-language premises' });
      try {
        const P = a.formal.premises.map(parse);
        a.claims.forEach((c, i) => {
          const v = solve(P, parse(c.formula));
          if (v !== c.label) issues.push({ level: 'error', code: 'SOLVER_MISMATCH', message: `Claim ${i + 1}: solver says ${v}, key says ${c.label}` });
        });
      } catch (e) {
        issues.push({ level: 'error', code: 'FORMAL_PARSE', message: (e as Error).message });
      }
      const labels = new Set(a.claims.map((c) => c.label));
      if (labels.size < 3) issues.push({ level: 'error', code: 'LABEL_COVERAGE', message: 'Need at least one claim per verdict' });
      for (const p of a.premises) if (p.length > 160) issues.push({ level: 'warn', code: 'PREMISE_LENGTH', message: 'Premise over 160 chars' });
    }
    return issues;
  },

  compile(items, ctx) {
    const a = items[0]!;
    const key: Record<string, string> = {};
    const explanations: Record<string, string> = {};
    if (a.mode === 'anatomy') {
      const its = a.segments.map((s) => {
        const id = ctx.newId();
        key[id] = s.label;
        explanations[id] = s.explanation;
        return { id, text: s.text };
      });
      return {
        public: {
          mode: 'anatomy',
          intro: a.intro,
          items: its,
          labels: ANATOMY_LABELS.map((l) => ({ ...l })),
          maxChecks: 3,
          feedback: 'per_item',
          constraints: [{ labelId: 'main', exactly: 1 }],
          hasBonus: !!a.bonus,
        },
        secret: { key, explanations, ...(a.bonus ? { bonus: a.bonus } : {}), blueprintCodes: a.blueprintCodes },
      };
    }
    const claims: Record<string, string> = {};
    const its = a.claims.map((c) => {
      const id = ctx.newId();
      key[id] = c.label;
      explanations[id] = c.explanation;
      claims[id] = c.formula;
      return { id, text: c.text };
    });
    return {
      public: {
        mode: 'verdict',
        intro: a.intro,
        premises: a.premises,
        items: its,
        labels: VERDICT_LABELS.map((l) => ({ ...l })),
        maxChecks: 3,
        feedback: 'count',
        hasBonus: false,
      },
      secret: { key, explanations, formal: { variables: a.formal.variables, premises: a.formal.premises, claims }, blueprintCodes: a.blueprintCodes },
    };
  },

  secretStrings: (sec) => Object.values(sec.explanations),
};
