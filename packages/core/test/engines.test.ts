import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  classifyEngine,
  EvaluationError,
  gauntletEngine,
  hardModeViolation,
  jargonEngine,
  pointsFor,
  quartetEngine,
  reletter,
  scoreGuess,
  seededRng,
  uniqueIdFactory,
  workupEngine,
  type ClassifyAuthored,
  type CompileCtx,
  type GauntletAuthored,
  type QuartetAuthored,
  type VocabEntry,
  type WorkupAuthored,
} from '../src';

const ctx = (extra: Partial<CompileCtx> = {}): CompileCtx => ({ track: 'boards', rng: seededRng('t'), newId: uniqueIdFactory(), ...extra });

describe('jargon scoreGuess', () => {
  it('handles duplicate letters (two-pass)', () => {
    expect(scoreGuess('SEPSIS', 'SISSES')).toEqual(['correct', 'present', 'absent', 'correct', 'present', 'correct']);
    expect(scoreGuess('LLAMA', 'ALLAY')).toEqual(['present', 'correct', 'present', 'present', 'absent']);
    expect(scoreGuess('ABBEY', 'BABES')).toEqual(['present', 'present', 'correct', 'correct', 'absent']);
  });
  it('all correct / no overlap', () => {
    expect(scoreGuess('CODON', 'CODON').every((s) => s === 'correct')).toBe(true);
    expect(scoreGuess('CODON', 'BLIMP').every((s) => s === 'absent')).toBe(true);
  });
  it('hard mode requires revealed letters', () => {
    const prior = [{ word: 'CRANE', letters: scoreGuess('CODON', 'CRANE') }];
    expect(hardModeViolation(prior, 'BLIMP')).toMatch(/Letter 1 must be C/);
    expect(hardModeViolation(prior, 'CLOTH')).toMatch(/must contain N/i);
    expect(hardModeViolation(prior, 'COLON')).toBeNull();
  });
  it('counts present letters (property: correct+present ≤ letters in common)', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[A-E]{5}$/), fc.stringMatching(/^[A-E]{5}$/), (a, g) => {
        const res = scoreGuess(a, g);
        const hits = res.filter((r) => r !== 'absent').length;
        let common = 0;
        const ca = [...a];
        for (const ch of g) {
          const i = ca.indexOf(ch);
          if (i >= 0) {
            common++;
            ca.splice(i, 1);
          }
        }
        return hits === common;
      }),
    );
  });
});

const jargonItem = {
  answer: 'CODON',
  category: 'Biology · Translation',
  definitionClue: 'Three-nucleotide mRNA sequence.',
  definition: 'Codon: triplet.',
  whyItMatters: 'Translation.',
  blueprintCodes: ['X'],
  bonus: {
    displayTag: 'Bio',
    stem: 'Stem',
    leadIn: 'Which?',
    options: [
      { id: 'A' as const, text: 'one' },
      { id: 'B' as const, text: 'two' },
      { id: 'C' as const, text: 'three' },
    ],
    correctOptionId: 'B' as const,
    explanation: 'because',
    optionRationales: { A: 'a', B: 'b', C: 'c' },
    takeaway: 't',
    difficulty: 2,
  },
};

describe('jargon engine', () => {
  const dict = new Set(['CODON', 'BLIMP', 'CRANE', 'COLON', 'CLOWN', 'ROBIN', 'FLASK', 'SPORE']);
  const compiled = jargonEngine.compile([jargonItem], ctx({ dictHashes: { 5: 'abc123' } }));
  const pub = compiled.public;
  const sec = compiled.secret;

  it('wins and reveals', () => {
    const r = jargonEngine.evaluate(pub, sec, [{ type: 'guess', word: 'crane' }, { type: 'guess', word: 'CODON' }], { dictionary: dict });
    expect(r.status).toBe('won');
    expect(r.outcome).toMatchObject({ solved: true, guesses: 2, hintsUsed: 0 });
    expect(r.reveal?.answer).toBe('CODON');
    expect(jargonEngine.bucket(r.outcome!)).toBe('2');
  });
  it('rejects unknown words and locked hints', () => {
    expect(() => jargonEngine.evaluate(pub, sec, [{ type: 'guess', word: 'ZZZZZ' }], { dictionary: dict })).toThrow(EvaluationError);
    expect(() => jargonEngine.evaluate(pub, sec, [{ type: 'hint', index: 0 }], { dictionary: dict })).toThrow(/hint locked/);
  });
  it('unlocks hints in order and loses after six', () => {
    const t = [
      { type: 'guess', word: 'BLIMP' },
      { type: 'guess', word: 'CRANE' },
      { type: 'hint', index: 0 },
      { type: 'guess', word: 'ROBIN' },
      { type: 'guess', word: 'FLASK' },
      { type: 'hint', index: 1 },
      { type: 'guess', word: 'SPORE' },
      { type: 'guess', word: 'CLOWN' },
    ] as const;
    const r = jargonEngine.evaluate(pub, sec, [...t], { dictionary: dict });
    expect(r.status).toBe('lost');
    expect(r.outcome).toMatchObject({ solved: false, hintsUsed: 2, guesses: 6 });
    const bonus = jargonEngine.evaluate(pub, sec, [...t, { type: 'bonus', optionId: 'B' }], { dictionary: dict });
    expect(bonus.outcome?.bonus).toBe(true);
    expect(() => jargonEngine.evaluate(pub, sec, [...t, { type: 'guess', word: 'CODON' }], { dictionary: dict })).toThrow(/MOVE_AFTER_TERMINAL/);
  });
  it('enforces hard mode on the server', () => {
    expect(() =>
      jargonEngine.evaluate(pub, sec, [{ type: 'guess', word: 'CRANE' }, { type: 'guess', word: 'BLIMP' }], { dictionary: dict, hardMode: true }),
    ).toThrow(EvaluationError);
  });
  it('shares without spoilers', () => {
    const r = jargonEngine.evaluate(pub, sec, [{ type: 'guess', word: 'CODON' }], { dictionary: dict });
    const lines = jargonEngine.shareLines(pub, r.steps, r.outcome!, { theme: 'light', highContrast: false });
    expect(lines[0]).toBe('🟢🟢🟢🟢🟢');
    expect(lines.join('\n')).not.toMatch(/CODON/);
  });
});

const quartetItem: QuartetAuthored = {
  groups: [
    { tier: 1, label: 'Colors', tiles: ['Red', 'Blue', 'Green', 'Yellow'], explanation: 'colors', blueprintCodes: ['X'] },
    { tier: 2, label: 'Fruits', tiles: ['Apple', 'Pear', 'Plum', 'Lime'], explanation: 'fruits', blueprintCodes: ['X'] },
    { tier: 3, label: 'Metals', tiles: ['Iron', 'Gold', 'Tin', 'Lead'], explanation: 'metals', blueprintCodes: ['X'] },
    { tier: 4, label: 'Birds', tiles: ['Robin', 'Crow', 'Wren', 'Swan'], explanation: 'birds', blueprintCodes: ['X'] },
  ],
  redHerrings: [
    { tile: 'Lime', alsoFits: 'Colors', note: 'n' },
    { tile: 'Gold', alsoFits: 'Colors', note: 'n' },
  ],
};

describe('quartet engine', () => {
  const { public: pub, secret: sec } = quartetEngine.compile([quartetItem], ctx());
  const ids = (labels: string[]) => labels.map((l) => pub.tiles.find((t) => t.label === l)!.id);

  it('uses opaque ids and never places a full group in one row', () => {
    expect(new Set(pub.tiles.map((t) => t.id)).size).toBe(16);
    expect(JSON.stringify(pub)).not.toMatch(/Colors|Fruits|Metals|Birds/);
    for (let r = 0; r < 4; r++) {
      const row = pub.tiles.slice(r * 4, r * 4 + 4).map((t) => t.id);
      expect(sec.groups.some((g) => g.tileIds.every((id) => row.includes(id)))).toBe(false);
    }
  });
  it('one-away, correct, duplicate, win', () => {
    const t1 = { type: 'guess' as const, tileIds: ids(['Red', 'Blue', 'Green', 'Lime']) };
    const r1 = quartetEngine.evaluate(pub, sec, [t1], {});
    expect(r1.steps[0]).toEqual({ result: 'one_away' });
    expect(() => quartetEngine.evaluate(pub, sec, [t1, { ...t1, tileIds: [...t1.tileIds].reverse() }], {})).toThrow(/DUPLICATE/);
    const all = [t1, ...[quartetItem.groups[0]!, quartetItem.groups[1]!, quartetItem.groups[2]!, quartetItem.groups[3]!].map((g) => ({ type: 'guess' as const, tileIds: ids(g.tiles) }))];
    const r = quartetEngine.evaluate(pub, sec, all, {});
    expect(r.status).toBe('won');
    expect(r.outcome).toMatchObject({ mistakes: 1, passed: true });
    expect(quartetEngine.scoreLabel(r.outcome!)).toBe('✅ 1 mistake');
    expect(quartetEngine.shareLines(pub, r.steps, r.outcome!, { theme: 'light', highContrast: false })[0]).toBe('🟢🟢🟢🔵');
  });
  it('loses after four mistakes', () => {
    const bad = [
      ['Red', 'Apple', 'Iron', 'Robin'],
      ['Blue', 'Pear', 'Gold', 'Crow'],
      ['Green', 'Plum', 'Tin', 'Wren'],
      ['Yellow', 'Lime', 'Lead', 'Swan'],
    ].map((l) => ({ type: 'guess' as const, tileIds: ids(l) }));
    const r = quartetEngine.evaluate(pub, sec, bad, {});
    expect(r.status).toBe('lost');
    expect(r.reveal?.groups).toHaveLength(4);
    expect(quartetEngine.bucket(r.outcome!)).toBe('X');
  });
  it('invariants catch duplicates and tier problems', () => {
    expect(quartetEngine.checkInvariants(quartetItem, {}).filter((i) => i.level === 'error')).toEqual([]);
    const bad = structuredClone(quartetItem);
    bad.groups[3]!.tiles[0] = 'Red';
    bad.groups[3]!.tier = 1;
    const codes = quartetEngine.checkInvariants(bad, {}).map((i) => i.code);
    expect(codes).toContain('TILES_UNIQUE');
    expect(codes).toContain('TIERS');
  });
});

const vocab = new Map<string, VocabEntry>([
  ['a', { id: 'a', name: 'Alpha', attrs: { system: ['Cardio', 'Resp'], etiology: 'Infectious', acuity: 'Acute' } }],
  ['b', { id: 'b', name: 'Beta', attrs: { system: ['Resp'], etiology: 'Neoplastic', acuity: 'Acute' } }],
  ['c', { id: 'c', name: 'Gamma', attrs: { system: ['Cardio', 'Resp'], etiology: 'Infectious', acuity: 'Chronic' } }],
  ['d', { id: 'd', name: 'Delta', attrs: { system: ['Renal'], etiology: 'Toxic', acuity: 'Acute' } }],
]);
const workupItem: WorkupAuthored = {
  answerId: 'a',
  acceptIds: [],
  closeIds: ['c'],
  clues: [1, 2, 3, 4, 5, 6].map((n) => ({ stage: `S${n}`, text: `clue number ${n}` })),
  explanation: 'because',
  discriminators: [
    { vsEntityId: 'b', point: 'x' },
    { vsEntityId: 'c', point: 'y' },
  ],
  blueprintCodes: ['X'],
  sources: [],
};
describe('workup engine', () => {
  const { public: pub, secret: sec } = workupEngine.compile([workupItem], {
    ...ctx(),
    vocabRef: { id: 'v', hash: 'h' },
    attributes: [
      { key: 'system', label: 'System' },
      { key: 'etiology', label: 'Etiology' },
      { key: 'acuity', label: 'Acuity' },
    ],
    prompt: 'Name it',
  });
  it('public payload holds only the first clue', () => {
    expect(JSON.stringify(pub)).toContain('clue number 1');
    expect(JSON.stringify(pub)).not.toContain('clue number 2');
  });
  it('reveals clues, compares attributes, scores clue count', () => {
    const r = workupEngine.evaluate(pub, sec, [{ type: 'guess', entityId: 'b' }, { type: 'skip' }, { type: 'guess', entityId: 'c' }, { type: 'guess', entityId: 'a' }], { vocab });
    expect(r.steps[0]!.attributes).toEqual([
      { key: 'system', match: 'partial', guessValue: 'Resp' },
      { key: 'etiology', match: 'no', guessValue: 'Neoplastic' },
      { key: 'acuity', match: 'yes', guessValue: 'Acute' },
    ]);
    expect(r.steps[0]!.nextClue?.text).toBe('clue number 2');
    expect(r.steps[2]!.result).toBe('close');
    expect(r.status).toBe('won');
    expect(r.outcome).toMatchObject({ cluesUsed: 4, closeCount: 1, path: ['W', 'S', 'C', 'R'] });
    expect(workupEngine.shareLines(pub, r.steps, r.outcome!, { theme: 'light', highContrast: false })[0]).toBe('🔴⚫🟡🟢⚪⚪');
  });
  it('loses after six actions; rejects duplicates and unknown ids', () => {
    const r = workupEngine.evaluate(pub, sec, Array(6).fill({ type: 'skip' }), { vocab });
    expect(r.status).toBe('lost');
    expect(r.reveal?.answerName).toBe('Alpha');
    expect(() => workupEngine.evaluate(pub, sec, [{ type: 'guess', entityId: 'b' }, { type: 'guess', entityId: 'b' }], { vocab })).toThrow(/DUPLICATE/);
    expect(() => workupEngine.evaluate(pub, sec, [{ type: 'guess', entityId: 'zzz' }], { vocab })).toThrow(/UNKNOWN_ID/);
  });
  it('flags early leaks', () => {
    const leaky = { ...workupItem, clues: workupItem.clues.map((c, i) => (i === 1 ? { ...c, text: 'Classic Alpha presentation' } : c)) };
    expect(workupEngine.checkInvariants(leaky, { vocab }).map((i) => i.code)).toContain('EARLY_LEAK');
  });
});

const mcq = (difficulty: number, key: 'A' | 'B' | 'C' | 'D' = 'A'): GauntletAuthored => ({
  displayTag: 'Tag',
  stem: `Stem ${difficulty}`,
  leadIn: 'Which?',
  options: (['A', 'B', 'C', 'D'] as const).map((id) => ({ id, text: `opt ${id} ${difficulty}` })),
  difficulty,
  correctOptionId: key,
  explanation: `expl ${difficulty}`,
  optionRationales: { A: 'ra', B: 'rb', C: 'rc', D: 'rd' },
  takeaway: 'tk',
  blueprint: { code: 'C', name: 'N' },
  sources: [],
});

describe('gauntlet engine', () => {
  const { public: pub, secret: sec } = gauntletEngine.compile([1, 2, 3, 4, 5].map((d) => mcq(d)), ctx({ paceSeconds: 90 }));
  it('points table', () => {
    expect([pointsFor(true, 1), pointsFor(true, 2), pointsFor(true, 3)]).toEqual([1, 2, 3]);
    expect([pointsFor(false, 1), pointsFor(false, 2), pointsFor(false, 3)]).toEqual([0, -1, -2]);
  });
  it('requires order and scores pass at 3/5', () => {
    const qs = pub.questions;
    const ans = (i: number, opt: string | null, conf: 1 | 2 | 3) => ({ type: 'answer' as const, questionId: qs[i]!.id, optionId: opt, confidence: conf, ms: 10_000 });
    expect(() => gauntletEngine.evaluate(pub, sec, [ans(1, 'A', 1)], {})).toThrow(/BAD_SEQUENCE/);
    const r = gauntletEngine.evaluate(pub, sec, [ans(0, 'A', 3), ans(1, 'A', 2), ans(2, 'B', 3), ans(3, null, 1), ans(4, 'A', 1)], {});
    expect(r.outcome).toMatchObject({ correct: 3, points: 3 + 2 - 2 + 0 + 1, passed: true, onPace: true });
    expect(gauntletEngine.shareLines(pub, r.steps, r.outcome!, { theme: 'light', highContrast: false })).toEqual(['🟢🟢🔴🔴🟢', '3️⃣2️⃣3️⃣1️⃣1️⃣', '⏱ on pace']);
  });
  it('reletter keeps rationales aligned', () => {
    const q = mcq(3, 'A');
    const out = reletter(q, 'C');
    expect(out.correctOptionId).toBe('C');
    expect(out.options[2]!.text).toBe('opt A 3');
    expect(out.optionRationales.C).toBe('ra');
    expect(out.optionRationales.A).toBe('rc');
  });
});

const verdict: ClassifyAuthored = {
  mode: 'verdict',
  intro: 'x',
  premises: ['p1', 'p2'],
  formal: { variables: { A: 'a', B: 'b' }, premises: ['A -> B', 'A | B'] },
  claims: [
    { text: 'B', formula: 'B', label: 'must', explanation: 'e' },
    { text: 'A', formula: 'A', label: 'could', explanation: 'e' },
    { text: 'not B', formula: '~B', label: 'cannot', explanation: 'e' },
    { text: 'A&~B', formula: 'A & ~B', label: 'cannot', explanation: 'e' },
    { text: 'B->A', formula: 'B -> A', label: 'could', explanation: 'e' },
    { text: '~A->B', formula: '~A -> B', label: 'must', explanation: 'e' },
  ],
  blueprintCodes: ['X'],
};
describe('classify engine', () => {
  it('verdict invariants agree with solver', () => {
    expect(classifyEngine.checkInvariants(verdict, {})).toEqual([]);
    const wrong = structuredClone(verdict);
    if (wrong.mode === 'verdict') wrong.claims[0]!.label = 'could';
    expect(classifyEngine.checkInvariants(wrong, {}).map((i) => i.code)).toContain('SOLVER_MISMATCH');
  });
  it('count feedback hides positions; three checks', () => {
    const { public: pub, secret: sec } = classifyEngine.compile([verdict], ctx());
    const allMust = Object.fromEntries(pub.items.map((i) => [i.id, 'must']));
    const r = classifyEngine.evaluate(pub, sec, [{ type: 'check', assignment: allMust }], {});
    expect(r.steps[0]).toEqual({ kind: 'check', correctCount: 2, total: 6 });
    const r3 = classifyEngine.evaluate(pub, sec, [1, 2, 3].map(() => ({ type: 'check' as const, assignment: allMust })), {});
    expect(r3.status).toBe('lost');
    const key = sec.key;
    const win = classifyEngine.evaluate(pub, sec, [{ type: 'check', assignment: allMust }, { type: 'check', assignment: key }], {});
    expect(win.outcome).toMatchObject({ solved: true, checks: 2, firstCheckCorrect: 2 });
  });
  it('anatomy gives per-item feedback', () => {
    const anatomy: ClassifyAuthored = {
      mode: 'anatomy',
      intro: 'x',
      segments: [
        { text: 's1', label: 'premise', explanation: 'e' },
        { text: 's2', label: 'premise', explanation: 'e' },
        { text: 's3', label: 'main', explanation: 'e' },
      ],
      blueprintCodes: ['X'],
    };
    const { public: pub, secret: sec } = classifyEngine.compile([anatomy], ctx());
    const a = Object.fromEntries(pub.items.map((i) => [i.id, 'premise']));
    const r = classifyEngine.evaluate(pub, sec, [{ type: 'check', assignment: a }], {});
    const step = r.steps[0]!;
    expect(step.kind === 'check' && Object.values(step.perItem!)).toEqual([true, true, false]);
  });
});

describe('determinism', () => {
  it('evaluate is pure: prefix of transcript yields prefix of steps', () => {
    const { public: pub, secret: sec } = quartetEngine.compile([quartetItem], ctx());
    const groups = sec.groups;
    const t = groups.map((g) => ({ type: 'guess' as const, tileIds: g.tileIds }));
    const full = quartetEngine.evaluate(pub, sec, t, {});
    for (let k = 0; k <= t.length; k++) expect(quartetEngine.evaluate(pub, sec, t.slice(0, k), {}).steps).toEqual(full.steps.slice(0, k));
  });
});
