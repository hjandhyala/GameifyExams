import { z } from 'zod';
import { RESULT_EMOJI } from '../emoji';
import { EvaluationError, type Engine, type Issue, type VocabEntry } from '../types';
import { LabRowSchema, SourceRefSchema } from './mcq';

export const ClueSchema = z.object({
  stage: z.string(),
  text: z.string(),
  table: z.array(LabRowSchema).optional(),
});
export type Clue = z.infer<typeof ClueSchema>;

export const WorkupPublicSchema = z.object({
  prompt: z.string(),
  totalClues: z.literal(6),
  firstClue: ClueSchema,
  vocabRef: z.object({ id: z.string(), hash: z.string() }),
  attributes: z.array(z.object({ key: z.string(), label: z.string() })),
});
export type WorkupPublic = z.infer<typeof WorkupPublicSchema>;

export const WorkupAuthoredSchema = z.object({
  answerId: z.string(),
  acceptIds: z.array(z.string()).default([]),
  closeIds: z.array(z.string()).default([]),
  clues: z.array(ClueSchema).length(6),
  explanation: z.string(),
  discriminators: z.array(z.object({ vsEntityId: z.string(), point: z.string() })),
  blueprintCodes: z.array(z.string()).min(1),
  sources: z.array(SourceRefSchema).default([]),
});
export type WorkupAuthored = z.infer<typeof WorkupAuthoredSchema>;

export const WorkupSecretSchema = WorkupAuthoredSchema;
export type WorkupSecret = WorkupAuthored;

export const WorkupMoveSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('guess'), entityId: z.string() }),
  z.object({ type: z.literal('skip') }),
]);
export type WorkupMove = z.infer<typeof WorkupMoveSchema>;

export type AttrMatch = 'yes' | 'partial' | 'no';
export interface WorkupStepFb {
  kind: 'guess' | 'skip';
  entityId?: string;
  result?: 'correct' | 'close' | 'wrong';
  attributes?: { key: string; match: AttrMatch; guessValue: string }[];
  nextClue?: Clue;
}

export interface WorkupOutcome {
  solved: boolean;
  cluesUsed: number;
  closeCount: number;
  passed: boolean;
  /** R = right, W = wrong, C = close, S = skip */
  path: ('R' | 'W' | 'C' | 'S')[];
}

export interface WorkupReveal {
  answerId: string;
  answerName: string;
  clues: Clue[];
  explanation: string;
  discriminators: { vsEntityId: string; vsName: string; point: string }[];
  sources: z.infer<typeof SourceRefSchema>[];
}

const asArray = (v: string | string[] | undefined): string[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

export function compareAttributes(guess: VocabEntry, answer: VocabEntry, keys: string[]) {
  return keys.map((key) => {
    const g = asArray(guess.attrs[key]);
    const a = asArray(answer.attrs[key]);
    const inter = g.filter((x) => a.includes(x));
    const equal = inter.length === g.length && inter.length === a.length && g.length > 0;
    const match: AttrMatch = equal ? 'yes' : inter.length > 0 ? 'partial' : 'no';
    return { key, match, guessValue: g.join(', ') || '—' };
  });
}

const normText = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const workupEngine: Engine<WorkupPublic, WorkupSecret, WorkupMove, WorkupStepFb, WorkupOutcome, WorkupReveal, WorkupAuthored> = {
  id: 'workup',
  publicSchema: WorkupPublicSchema,
  secretSchema: WorkupSecretSchema,
  moveSchema: WorkupMoveSchema,
  authoredSchema: WorkupAuthoredSchema,

  maxMoves: () => 6,

  validateMove(_pub, priorMoves, _steps, move, ctx) {
    if (move.type === 'skip') return { ok: true };
    if (ctx.vocab && !ctx.vocab.has(move.entityId)) return { ok: false, reason: 'Pick an option from the list' };
    if (priorMoves.some((m) => m.type === 'guess' && m.entityId === move.entityId)) return { ok: false, reason: 'Already guessed' };
    return { ok: true };
  },

  evaluate(pub, sec, transcript, ctx) {
    const vocab = ctx.vocab;
    if (!vocab) throw new Error('workup evaluate requires vocab');
    if (transcript.length > 6) throw new EvaluationError('TOO_MANY_MOVES', 6);
    const keys = pub.attributes.map((a) => a.key);
    const answer = vocab.get(sec.answerId);
    if (!answer) throw new Error(`answer ${sec.answerId} missing from vocab`);
    const steps: WorkupStepFb[] = [];
    const path: WorkupOutcome['path'] = [];
    const guessed = new Set<string>();
    let solved = false;
    let terminal = false;
    let closeCount = 0;

    transcript.forEach((m, i) => {
      if (terminal) throw new EvaluationError('MOVE_AFTER_TERMINAL', i);
      const next = i < 5 ? sec.clues[i + 1] : undefined;
      if (m.type === 'skip') {
        path.push('S');
        steps.push({ kind: 'skip', ...(next ? { nextClue: next } : {}) });
        if (i === 5) terminal = true;
        return;
      }
      const g = vocab.get(m.entityId);
      if (!g) throw new EvaluationError('UNKNOWN_ID', i);
      if (guessed.has(m.entityId)) throw new EvaluationError('DUPLICATE_GUESS', i);
      guessed.add(m.entityId);
      if (m.entityId === sec.answerId || sec.acceptIds.includes(m.entityId)) {
        solved = true;
        terminal = true;
        path.push('R');
        steps.push({ kind: 'guess', entityId: m.entityId, result: 'correct', attributes: compareAttributes(g, answer, keys) });
        return;
      }
      const close = sec.closeIds.includes(m.entityId);
      if (close) closeCount++;
      path.push(close ? 'C' : 'W');
      steps.push({
        kind: 'guess',
        entityId: m.entityId,
        result: close ? 'close' : 'wrong',
        attributes: compareAttributes(g, answer, keys),
        ...(next ? { nextClue: next } : {}),
      });
      if (i === 5) terminal = true;
    });

    if (!terminal) return { status: 'in_progress', steps };
    return {
      status: solved ? 'won' : 'lost',
      steps,
      outcome: { solved, cluesUsed: transcript.length, closeCount, passed: solved, path },
      reveal: {
        answerId: sec.answerId,
        answerName: answer.name,
        clues: sec.clues,
        explanation: sec.explanation,
        discriminators: sec.discriminators.map((d) => ({ ...d, vsName: vocab.get(d.vsEntityId)?.name ?? d.vsEntityId })),
        sources: sec.sources,
      },
    };
  },

  bucket: (o) => (o.solved ? String(o.cluesUsed) : 'X'),
  bucketOrder: ['1', '2', '3', '4', '5', '6', 'X'],
  passed: (o) => o.passed,
  scoreLabel: (o) => `${o.solved ? o.cluesUsed : 'X'}/6`,
  headline: (o) => (o.solved ? (o.cluesUsed === 1 ? 'First-clue call!' : `Got it in ${o.cluesUsed}/6`) : 'The answer slipped away'),

  shareLines(_pub, _steps, o) {
    const map = { R: RESULT_EMOJI.right, W: RESULT_EMOJI.wrong, C: RESULT_EMOJI.close, S: RESULT_EMOJI.skip } as const;
    const cells: string[] = o.path.map((p) => map[p]);
    while (cells.length < 6) cells.push(RESULT_EMOJI.unused);
    return [cells.join('')];
  },

  checkInvariants(a, ctx) {
    const issues: Issue[] = [];
    const vocab = ctx.vocab;
    if (vocab) {
      for (const id of [a.answerId, ...a.acceptIds, ...a.closeIds])
        if (!vocab.has(id)) issues.push({ level: 'error', code: 'NOT_IN_VOCAB', message: `${id} not in vocabulary` });
      const answer = vocab.get(a.answerId);
      if (answer) {
        const leaks = [answer.name, ...(answer.syn ?? []), ...(answer.abbr ?? []).filter((x) => x.length >= 3), ...(answer.giveaways ?? [])];
        a.clues.slice(0, 3).forEach((c, i) => {
          const t = normText(c.text);
          for (const l of leaks)
            if (l && new RegExp(`\\b${normText(l).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t))
              issues.push({ level: 'error', code: 'EARLY_LEAK', message: `Clue ${i + 1} contains “${l}”` });
        });
      }
    }
    if (a.acceptIds.some((x) => a.closeIds.includes(x))) issues.push({ level: 'error', code: 'ACCEPT_CLOSE_OVERLAP', message: 'acceptIds and closeIds overlap' });
    a.clues.forEach((c, i) => {
      if (c.text.length > 260) issues.push({ level: 'error', code: 'CLUE_LENGTH', message: `Clue ${i + 1} longer than 260 chars` });
      if ((c.table?.length ?? 0) > 8) issues.push({ level: 'error', code: 'TABLE_ROWS', message: `Clue ${i + 1} table > 8 rows` });
    });
    if (a.discriminators.length < 2) issues.push({ level: 'warn', code: 'DISCRIMINATORS', message: 'Provide ≥ 2 discriminators' });
    return issues;
  },

  compile(items, ctx) {
    const a = items[0]!;
    if (!ctx.vocabRef || !ctx.attributes || !ctx.prompt) throw new Error('workup compile requires vocabRef, attributes, prompt');
    return {
      public: { prompt: ctx.prompt, totalClues: 6, firstClue: a.clues[0]!, vocabRef: ctx.vocabRef, attributes: ctx.attributes },
      secret: a,
    };
  },

  secretStrings: (sec) => [sec.answerId, ...sec.clues.slice(1).map((c) => c.text), sec.explanation],
};
