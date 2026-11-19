import { z } from 'zod';
import { TIER_EMOJI } from '../emoji';
import { shuffle } from '../random';
import { EvaluationError, type Engine, type Issue } from '../types';

const Tier = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
export type Tier = z.infer<typeof Tier>;

export const QuartetPublicSchema = z.object({
  tiles: z.array(z.object({ id: z.string(), label: z.string() })).length(16),
  maxMistakes: z.literal(4),
  topicHint: z.string().optional(),
});
export type QuartetPublic = z.infer<typeof QuartetPublicSchema>;

const GroupSchema = z.object({
  id: z.string(),
  tier: Tier,
  label: z.string(),
  tileIds: z.array(z.string()).length(4),
  explanation: z.string(),
  blueprintCodes: z.array(z.string()),
});
export type QuartetGroup = z.infer<typeof GroupSchema>;

export const QuartetSecretSchema = z.object({
  groups: z.array(GroupSchema).length(4),
  redHerrings: z.array(z.object({ tileId: z.string(), alsoFits: z.string(), note: z.string() })),
  tileNotes: z.record(z.string(), z.string()).optional(),
});
export type QuartetSecret = z.infer<typeof QuartetSecretSchema>;

export const QuartetMoveSchema = z.object({ type: z.literal('guess'), tileIds: z.array(z.string()).length(4) });
export type QuartetMove = z.infer<typeof QuartetMoveSchema>;

export type QuartetStepFb =
  | { result: 'correct'; groupId: string; tier: Tier; label: string; tileIds: string[]; explanation: string }
  | { result: 'one_away' }
  | { result: 'incorrect' };

export interface QuartetOutcome {
  solved: number;
  mistakes: number;
  passed: boolean;
  guessTiers: Tier[][];
}

export interface QuartetReveal {
  groups: QuartetGroup[];
  redHerrings: QuartetSecret['redHerrings'];
  tileNotes?: Record<string, string>;
}

export const QuartetAuthoredSchema = z.object({
  topicHint: z.string().optional(),
  groups: z
    .array(
      z.object({
        tier: Tier,
        label: z.string(),
        tiles: z.array(z.string()).length(4),
        explanation: z.string(),
        blueprintCodes: z.array(z.string()).min(1),
      }),
    )
    .length(4),
  redHerrings: z.array(z.object({ tile: z.string(), alsoFits: z.string(), note: z.string() })),
});
export type QuartetAuthored = z.infer<typeof QuartetAuthoredSchema>;

const norm = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

export const quartetEngine: Engine<QuartetPublic, QuartetSecret, QuartetMove, QuartetStepFb, QuartetOutcome, QuartetReveal, QuartetAuthored> = {
  id: 'quartet',
  publicSchema: QuartetPublicSchema,
  secretSchema: QuartetSecretSchema,
  moveSchema: QuartetMoveSchema,
  authoredSchema: QuartetAuthoredSchema,

  maxMoves: () => 7,

  validateMove(pub, priorMoves, priorSteps, move) {
    const ids = new Set(move.tileIds);
    if (ids.size !== 4) return { ok: false, reason: 'Select four different tiles' };
    const known = new Set(pub.tiles.map((t) => t.id));
    if ([...ids].some((id) => !known.has(id))) return { ok: false, reason: 'Unknown tile' };
    const solved = new Set(priorSteps.flatMap((s) => (s.result === 'correct' ? s.tileIds : [])));
    if ([...ids].some((id) => solved.has(id))) return { ok: false, reason: 'Tile already solved' };
    const key = [...ids].sort().join(',');
    if (priorMoves.some((m) => [...m.tileIds].sort().join(',') === key)) return { ok: false, reason: 'Already guessed' };
    return { ok: true };
  },

  evaluate(pub, sec, transcript) {
    const tileToGroup = new Map<string, QuartetGroup>();
    for (const g of sec.groups) for (const t of g.tileIds) tileToGroup.set(t, g);
    const solved = new Set<string>();
    const seen = new Set<string>();
    const steps: QuartetStepFb[] = [];
    const guessTiers: Tier[][] = [];
    let mistakes = 0;
    if (transcript.length > 7) throw new EvaluationError('TOO_MANY_MOVES', 7);

    transcript.forEach((m, i) => {
      if (solved.size === 4 || mistakes === 4) throw new EvaluationError('MOVE_AFTER_TERMINAL', i);
      const ids = [...new Set(m.tileIds)];
      if (ids.length !== 4 || ids.some((id) => !tileToGroup.has(id))) throw new EvaluationError('INVALID_MOVE', i);
      if (ids.some((id) => solved.has(tileToGroup.get(id)!.id))) throw new EvaluationError('INVALID_MOVE', i, 'tile already solved');
      const key = [...ids].sort().join(',');
      if (seen.has(key)) throw new EvaluationError('DUPLICATE_GUESS', i);
      seen.add(key);
      guessTiers.push(m.tileIds.map((id) => tileToGroup.get(id)!.tier));
      const counts = new Map<string, number>();
      for (const id of ids) {
        const gid = tileToGroup.get(id)!.id;
        counts.set(gid, (counts.get(gid) ?? 0) + 1);
      }
      const [gid, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
      if (n === 4) {
        solved.add(gid);
        const g = sec.groups.find((x) => x.id === gid)!;
        steps.push({ result: 'correct', groupId: g.id, tier: g.tier, label: g.label, tileIds: g.tileIds, explanation: g.explanation });
      } else {
        mistakes++;
        steps.push({ result: n === 3 ? 'one_away' : 'incorrect' });
      }
    });

    const status = solved.size === 4 ? 'won' : mistakes === 4 ? 'lost' : 'in_progress';
    if (status === 'in_progress') return { status, steps };
    return {
      status,
      steps,
      outcome: { solved: solved.size, mistakes, passed: status === 'won', guessTiers },
      reveal: { groups: [...sec.groups].sort((a, b) => a.tier - b.tier), redHerrings: sec.redHerrings, tileNotes: sec.tileNotes },
    };
  },

  bucket: (o) => (o.passed ? String(o.mistakes) : 'X'),
  bucketOrder: ['0', '1', '2', '3', 'X'],
  passed: (o) => o.passed,
  scoreLabel: (o) => (o.passed ? `✅ ${o.mistakes} mistake${o.mistakes === 1 ? '' : 's'}` : `❌ ${o.solved}/4 groups`),
  headline: (o) =>
    o.passed ? (o.mistakes === 0 ? 'Perfect board!' : `Solved with ${o.mistakes} mistake${o.mistakes === 1 ? '' : 's'}`) : `${o.solved} of 4 groups`,

  shareLines: (_pub, _steps, o) => o.guessTiers.map((row) => row.map((t) => TIER_EMOJI[t]).join('')),

  checkInvariants(a) {
    const issues: Issue[] = [];
    const tiles = a.groups.flatMap((g) => g.tiles);
    if (new Set(tiles.map(norm)).size !== 16) issues.push({ level: 'error', code: 'TILES_UNIQUE', message: 'Need 16 unique tiles' });
    const tiers = a.groups.map((g) => g.tier).sort();
    if (tiers.join() !== '1,2,3,4') issues.push({ level: 'error', code: 'TIERS', message: 'Tiers 1–4 must each appear once' });
    for (const t of tiles) {
      if (t.length > 22) issues.push({ level: 'error', code: 'TILE_LENGTH', message: `Tile too long: ${t}` });
      for (const w of t.split(/\s+/)) if (w.length > 12) issues.push({ level: 'warn', code: 'TILE_WORD', message: `Long word may need hyphenation: ${w}` });
    }
    for (const g of a.groups) {
      if (g.label.length > 40) issues.push({ level: 'error', code: 'LABEL_LENGTH', message: `Label too long: ${g.label}` });
      if (!g.explanation.trim()) issues.push({ level: 'error', code: 'EXPLANATION', message: `Missing explanation for ${g.label}` });
    }
    if (a.redHerrings.length < 2) issues.push({ level: 'error', code: 'RED_HERRINGS', message: 'Need ≥ 2 red herrings' });
    const tileSet = new Set(tiles.map(norm));
    for (const r of a.redHerrings)
      if (!tileSet.has(norm(r.tile))) issues.push({ level: 'error', code: 'RED_HERRING_TILE', message: `Red herring not a tile: ${r.tile}` });
    const tier4 = a.groups.find((g) => g.tier === 4);
    const rhTiles = new Set(a.redHerrings.map((r) => norm(r.tile)));
    if (tier4 && !tier4.tiles.some((t) => rhTiles.has(norm(t))) && !a.redHerrings.some((r) => norm(r.alsoFits) === norm(tier4.label)))
      issues.push({ level: 'warn', code: 'TIER4_TRAP', message: 'Tier-4 group should involve a red herring' });
    return issues;
  },

  compile(items, ctx) {
    const a = items[0]!;
    const labelToId = new Map<string, string>();
    const groups: QuartetGroup[] = a.groups.map((g) => {
      const tileIds = g.tiles.map((t) => {
        const id = ctx.newId();
        labelToId.set(t, id);
        return id;
      });
      return { id: ctx.newId(), tier: g.tier, label: g.label, tileIds, explanation: g.explanation, blueprintCodes: g.blueprintCodes };
    });
    const tiles = a.groups.flatMap((g) => g.tiles).map((label) => ({ id: labelToId.get(label)!, label }));
    // Shuffle until no row of four is a complete group.
    const groupOf = new Map(groups.flatMap((g) => g.tileIds.map((t) => [t, g.id] as const)));
    let order = shuffle(tiles, ctx.rng);
    for (let attempt = 0; attempt < 50; attempt++) {
      const rowsOk = [0, 1, 2, 3].every((r) => new Set(order.slice(r * 4, r * 4 + 4).map((t) => groupOf.get(t.id))).size > 1);
      if (rowsOk) break;
      order = shuffle(tiles, ctx.rng);
    }
    const tileNotes: Record<string, string> = {};
    const redHerrings = a.redHerrings.map((r) => {
      const tileId = labelToId.get(r.tile) ?? '';
      tileNotes[tileId] = r.note;
      return { tileId, alsoFits: r.alsoFits, note: r.note };
    });
    return {
      public: { tiles: order, maxMistakes: 4, ...(a.topicHint ? { topicHint: a.topicHint } : {}) },
      secret: { groups, redHerrings, tileNotes },
    };
  },

  secretStrings: (sec) => [...sec.groups.map((g) => g.label), ...sec.groups.map((g) => g.explanation)],
};
