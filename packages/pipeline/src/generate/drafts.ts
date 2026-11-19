import type { ClassifyAuthored, GauntletAuthored, JargonAuthored, QuartetAuthored, WorkupAuthored } from '@prepdle/core';
import { z } from 'zod';

/**
 * LLM-facing draft schemas. They avoid constructs structured outputs handle poorly (records, tuples)
 * and are converted to the engines' authored schemas, which then run full validation.
 */

const Rationale = z.object({ optionId: z.string(), rationale: z.string() });
const Option = z.object({ id: z.string(), text: z.string() });
const Source = z.object({ id: z.string(), locator: z.string(), url: z.string().optional() });

export const McqDraft = z.object({
  displayTag: z.string().describe('Subject-level tag only, e.g. "Evidence · Hearsay". Never name the tested rule or answer.'),
  passage: z.string().optional(),
  stem: z.string(),
  labs: z.array(z.object({ label: z.string(), value: z.string(), unit: z.string().optional(), flag: z.enum(['H', 'L']).optional() })).optional(),
  leadIn: z.string(),
  options: z.array(Option),
  correctOptionId: z.string(),
  explanation: z.string().describe('Cite source excerpts inline as [S1], [S2].'),
  optionRationales: z.array(Rationale),
  takeaway: z.string(),
  difficulty: z.number().int(),
  sourcesUsed: z.array(z.string()).describe('Ids of grounding excerpts actually relied on, e.g. ["S1"]'),
});
export type McqDraft = z.infer<typeof McqDraft>;

export function mcqFromDraft(d: McqDraft, blueprint: { code: string; name: string }, sources: z.infer<typeof Source>[]): GauntletAuthored {
  return {
    displayTag: d.displayTag,
    ...(d.passage ? { passage: d.passage } : {}),
    stem: d.stem,
    ...(d.labs?.length ? { labs: d.labs } : {}),
    leadIn: d.leadIn,
    options: d.options.map((o) => ({ id: o.id.trim().toUpperCase() as GauntletAuthored['options'][number]['id'], text: o.text })),
    difficulty: Math.min(5, Math.max(1, d.difficulty)),
    correctOptionId: d.correctOptionId.trim().toUpperCase() as GauntletAuthored['correctOptionId'],
    explanation: d.explanation,
    optionRationales: Object.fromEntries(d.optionRationales.map((r) => [r.optionId.trim().toUpperCase(), r.rationale])),
    takeaway: d.takeaway,
    blueprint,
    sources: sources.filter((s) => d.sourcesUsed.includes(s.id)),
  };
}

export const QuartetDraft = z.object({
  topicHint: z.string(),
  groups: z.array(
    z.object({ tier: z.number().int(), label: z.string(), tiles: z.array(z.string()), explanation: z.string(), blueprintCodes: z.array(z.string()) }),
  ),
  redHerrings: z.array(z.object({ tile: z.string(), alsoFits: z.string(), note: z.string() })),
});
export const quartetFromDraft = (d: z.infer<typeof QuartetDraft>): QuartetAuthored => ({
  topicHint: d.topicHint,
  groups: d.groups.map((g) => ({ ...g, tier: g.tier as 1 | 2 | 3 | 4 })),
  redHerrings: d.redHerrings,
});

export const JargonDraft = z.object({
  category: z.string(),
  definitionClue: z.string().describe('Must not contain the answer or any word sharing its first five letters.'),
  definition: z.string(),
  whyItMatters: z.string(),
  bonus: z
    .object({ displayTag: z.string(), stem: z.string(), leadIn: z.string(), options: z.array(Option), correctOptionId: z.string(), explanation: z.string(), optionRationales: z.array(Rationale), takeaway: z.string() })
    .optional(),
});
export function jargonFromDraft(answer: string, blueprintCodes: string[], d: z.infer<typeof JargonDraft>): JargonAuthored {
  return {
    answer,
    category: d.category,
    definitionClue: d.definitionClue,
    definition: d.definition,
    whyItMatters: d.whyItMatters,
    blueprintCodes,
    ...(d.bonus
      ? {
          bonus: {
            displayTag: d.bonus.displayTag,
            stem: d.bonus.stem,
            leadIn: d.bonus.leadIn,
            options: d.bonus.options.map((o) => ({ id: o.id.toUpperCase() as 'A', text: o.text })),
            correctOptionId: d.bonus.correctOptionId.toUpperCase() as 'A',
            explanation: d.bonus.explanation,
            optionRationales: Object.fromEntries(d.bonus.optionRationales.map((r) => [r.optionId.toUpperCase(), r.rationale])),
            takeaway: d.bonus.takeaway,
            difficulty: 2,
          },
        }
      : {}),
  };
}

export const WorkupDraft = z.object({
  clues: z.array(z.object({ stage: z.string(), text: z.string(), table: z.array(z.object({ label: z.string(), value: z.string(), unit: z.string().optional(), flag: z.enum(['H', 'L']).optional() })).optional() })),
  explanation: z.string(),
  discriminators: z.array(z.object({ vsEntityId: z.string(), point: z.string() })),
  closeIds: z.array(z.string()),
  sourcesUsed: z.array(z.string()),
});
export function workupFromDraft(answerId: string, blueprintCodes: string[], d: z.infer<typeof WorkupDraft>, sources: z.infer<typeof Source>[]): WorkupAuthored {
  return {
    answerId,
    acceptIds: [],
    closeIds: d.closeIds.filter((x) => x !== answerId),
    clues: d.clues,
    explanation: d.explanation,
    discriminators: d.discriminators,
    blueprintCodes,
    sources: sources.filter((s) => d.sourcesUsed.includes(s.id)),
  };
}

export const AnatomyDraft = z.object({
  segments: z.array(z.object({ text: z.string(), label: z.enum(['main', 'inter', 'premise', 'background', 'opposing', 'concession']), explanation: z.string() })),
  bonus: z.object({ displayTag: z.string(), stem: z.string(), leadIn: z.string(), options: z.array(Option), correctOptionId: z.string(), explanation: z.string(), optionRationales: z.array(Rationale), takeaway: z.string() }),
});
export function anatomyFromDraft(blueprintCodes: string[], d: z.infer<typeof AnatomyDraft>): ClassifyAuthored {
  return {
    mode: 'anatomy',
    intro: 'Label the role each highlighted part plays in the argument.',
    segments: d.segments,
    bonus: {
      displayTag: d.bonus.displayTag,
      stem: d.bonus.stem,
      leadIn: d.bonus.leadIn,
      options: d.bonus.options.map((o) => ({ id: o.id.toUpperCase() as 'A', text: o.text })),
      correctOptionId: d.bonus.correctOptionId.toUpperCase() as 'A',
      explanation: d.bonus.explanation,
      optionRationales: Object.fromEntries(d.bonus.optionRationales.map((r) => [r.optionId.toUpperCase(), r.rationale])),
      takeaway: d.bonus.takeaway,
      difficulty: 2,
    },
    blueprintCodes,
  };
}

export const VerbalizeDraft = z.object({
  scenario: z.string(),
  variableMeanings: z.array(z.object({ variable: z.string(), meaning: z.string() })),
  premises: z.array(z.string()),
  claims: z.array(z.object({ formula: z.string(), text: z.string(), explanation: z.string() })),
});
export const BackTranslation = z.object({
  premises: z.array(z.string().describe('Formula using the given variables with ~ & | -> and parentheses')),
  claims: z.array(z.string()),
});

// Validator outputs
export const SolveMcq = z.object({ answer: z.string(), confidence: z.number(), reasoning: z.string() });
export const SolveWorkup = z.object({ guesses: z.array(z.object({ afterClue: z.number().int(), guess: z.string(), confidence: z.number() })) });
export const SolvePartition = z.object({ groups: z.array(z.array(z.string())), confidence: z.number() });
export const SolveLabels = z.object({ labels: z.array(z.object({ index: z.number().int(), label: z.string() })) });
export const Adversarial = z.object({ items: z.array(z.object({ target: z.string(), argument: z.string(), defensibility: z.number().int() })) });
export const FactCheck = z.object({ claims: z.array(z.object({ claim: z.string(), verdict: z.enum(['supported', 'unsupported', 'contradicted']), sourceIds: z.array(z.string()) })) });
export const FairnessLint = z.object({ issues: z.array(z.object({ text: z.string(), problem: z.string(), severity: z.enum(['warn', 'fail']) })) });
