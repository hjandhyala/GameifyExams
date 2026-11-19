import { z } from 'zod';

export const OptionId = z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
export type OptionId = z.infer<typeof OptionId>;

export const SourceRefSchema = z.object({ id: z.string(), locator: z.string(), url: z.string().optional() });

export const FigureSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('table'),
    caption: z.string().optional(),
    columns: z.array(z.string()),
    rows: z.array(z.array(z.union([z.string(), z.number()]))),
  }),
  z.object({
    type: z.literal('chart'),
    caption: z.string().optional(),
    kind: z.enum(['line', 'bar', 'scatter']),
    x: z.object({ label: z.string(), unit: z.string().optional() }),
    y: z.object({ label: z.string(), unit: z.string().optional() }),
    series: z.array(z.object({ name: z.string(), points: z.array(z.tuple([z.number(), z.number()])) })),
  }),
  z.object({ type: z.literal('structure'), smiles: z.string(), caption: z.string().optional(), name: z.string() }),
]);
export type Figure = z.infer<typeof FigureSchema>;

export const LabRowSchema = z.object({
  label: z.string(),
  value: z.string(),
  unit: z.string().optional(),
  flag: z.enum(['H', 'L']).optional(),
});
export type LabRow = z.infer<typeof LabRowSchema>;

export const McqPublicSchema = z.object({
  id: z.string(),
  displayTag: z.string(),
  passage: z.string().optional(),
  stem: z.string(),
  figure: FigureSchema.optional(),
  labs: z.array(LabRowSchema).optional(),
  leadIn: z.string(),
  options: z.array(z.object({ id: OptionId, text: z.string() })).min(2).max(8),
  difficulty: z.number().int().min(1).max(5),
});
export type McqPublic = z.infer<typeof McqPublicSchema>;

export const McqSecretSchema = z.object({
  correctOptionId: OptionId,
  explanation: z.string(),
  optionRationales: z.record(z.string(), z.string()),
  takeaway: z.string(),
  blueprint: z.object({ code: z.string(), name: z.string() }),
  sources: z.array(SourceRefSchema),
});
export type McqSecret = z.infer<typeof McqSecretSchema>;

/** An authored MCQ = public fields (without id) + secret fields. */
export const McqAuthoredSchema = McqPublicSchema.omit({ id: true }).extend(McqSecretSchema.shape);
export type McqAuthored = z.infer<typeof McqAuthoredSchema>;

export const BonusSchema = McqPublicSchema.omit({ id: true, difficulty: true })
  .extend(McqSecretSchema.omit({ blueprint: true, sources: true }).shape)
  .extend({ difficulty: z.number().int().min(1).max(5).default(2) });
export type Bonus = z.infer<typeof BonusSchema>;

export const bonusPublic = (b: Bonus): Omit<McqPublic, 'id'> => ({
  displayTag: b.displayTag,
  passage: b.passage,
  stem: b.stem,
  figure: b.figure,
  labs: b.labs,
  leadIn: b.leadIn,
  options: b.options,
  difficulty: b.difficulty,
});

const BANNED = [/all of the above/i, /none of the above/i, /both [a-h] and [a-h]/i];
const NEGATIVE = /\b(EXCEPT|NOT)\b/;

export interface McqLintCtx {
  minOptions: number;
  maxOptions: number;
  negativeStemAllowed?: boolean;
}

/** Item-writing invariants shared by Gauntlet questions and bonus questions (§5.4.9). */
export function lintMcq(
  q: Pick<McqAuthored, 'stem' | 'leadIn' | 'options' | 'correctOptionId' | 'optionRationales' | 'explanation'>,
  ctx: McqLintCtx,
): { level: 'error' | 'warn'; code: string; message: string }[] {
  const issues: { level: 'error' | 'warn'; code: string; message: string }[] = [];
  const n = q.options.length;
  if (n < ctx.minOptions || n > ctx.maxOptions)
    issues.push({ level: 'error', code: 'OPTION_COUNT', message: `Expected ${ctx.minOptions}–${ctx.maxOptions} options, got ${n}` });
  const ids = q.options.map((o) => o.id);
  const expected = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].slice(0, n);
  if (ids.join() !== expected.join())
    issues.push({ level: 'error', code: 'OPTION_IDS', message: `Options must be lettered ${expected.join(',')}` });
  const texts = q.options.map((o) => o.text.trim().toLowerCase().replace(/\s+/g, ' '));
  if (new Set(texts).size !== texts.length) issues.push({ level: 'error', code: 'DUP_OPTION', message: 'Duplicate option text' });
  if (!ids.includes(q.correctOptionId)) issues.push({ level: 'error', code: 'KEY_MISSING', message: 'Key is not an option' });
  for (const id of ids)
    if (!q.optionRationales[id]?.trim())
      issues.push({ level: 'error', code: 'RATIONALE_MISSING', message: `Missing rationale for ${id}` });
  for (const o of q.options)
    for (const re of BANNED) if (re.test(o.text)) issues.push({ level: 'error', code: 'BANNED_OPTION', message: `Banned option phrasing: "${o.text}"` });
  if (!ctx.negativeStemAllowed && NEGATIVE.test(q.leadIn))
    issues.push({ level: 'error', code: 'NEGATIVE_STEM', message: 'Negative lead-in (EXCEPT/NOT) not allowed' });
  if (!/[?:]\s*$/.test(q.leadIn.trim())) issues.push({ level: 'warn', code: 'LEADIN_PUNCT', message: 'Lead-in should end with ? or :' });
  const key = q.options.find((o) => o.id === q.correctOptionId);
  if (key) {
    const others = q.options.filter((o) => o.id !== key.id).map((o) => o.text.length);
    const longestOther = Math.max(...others);
    if (key.text.length > longestOther * 1.3 && key.text.length - longestOther > 15)
      issues.push({ level: 'warn', code: 'KEY_LENGTH_CUE', message: 'Key is much longer than every distractor' });
  }
  if (!q.explanation.trim()) issues.push({ level: 'error', code: 'NO_EXPLANATION', message: 'Missing explanation' });
  return issues;
}
