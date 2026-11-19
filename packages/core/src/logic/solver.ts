/**
 * Tiny propositional-logic toolkit for the LSAT "Verdict" game (§5.5.3).
 * Syntax: variables are identifiers ([A-Za-z_][A-Za-z0-9_]*), `~` not, `&` and, `|` or, `->` implies, parentheses.
 * Precedence: ~ > & > | > ->  (-> is right-associative).
 */

export type Formula =
  | { t: 'var'; n: string }
  | { t: 'not'; a: Formula }
  | { t: 'and'; a: Formula; b: Formula }
  | { t: 'or'; a: Formula; b: Formula }
  | { t: 'imp'; a: Formula; b: Formula };

export type Verdict = 'must' | 'could' | 'cannot';

export function parse(src: string): Formula {
  const tokens = src.match(/->|[~&|()]|[A-Za-z_][A-Za-z0-9_]*|\S/g) ?? [];
  let i = 0;
  const peek = () => tokens[i];
  const eat = (t?: string) => {
    const tok = tokens[i++];
    if (t && tok !== t) throw new Error(`Expected ${t} but got ${tok ?? 'end'} in "${src}"`);
    return tok;
  };
  const imp = (): Formula => {
    const a = or();
    if (peek() === '->') {
      eat('->');
      return { t: 'imp', a, b: imp() };
    }
    return a;
  };
  const or = (): Formula => {
    let a = and();
    while (peek() === '|') {
      eat('|');
      a = { t: 'or', a, b: and() };
    }
    return a;
  };
  const and = (): Formula => {
    let a = unary();
    while (peek() === '&') {
      eat('&');
      a = { t: 'and', a, b: unary() };
    }
    return a;
  };
  const unary = (): Formula => {
    const tok = peek();
    if (tok === '~') {
      eat('~');
      return { t: 'not', a: unary() };
    }
    if (tok === '(') {
      eat('(');
      const f = imp();
      eat(')');
      return f;
    }
    if (tok && /^[A-Za-z_]/.test(tok)) {
      eat();
      return { t: 'var', n: tok };
    }
    throw new Error(`Unexpected token ${tok ?? 'end'} in "${src}"`);
  };
  const f = imp();
  if (i !== tokens.length) throw new Error(`Trailing tokens in "${src}"`);
  return f;
}

export function evaluate(f: Formula, env: Record<string, boolean>): boolean {
  switch (f.t) {
    case 'var':
      return env[f.n] ?? false;
    case 'not':
      return !evaluate(f.a, env);
    case 'and':
      return evaluate(f.a, env) && evaluate(f.b, env);
    case 'or':
      return evaluate(f.a, env) || evaluate(f.b, env);
    case 'imp':
      return !evaluate(f.a, env) || evaluate(f.b, env);
  }
}

export function variables(f: Formula, acc = new Set<string>()): Set<string> {
  if (f.t === 'var') acc.add(f.n);
  else if (f.t === 'not') variables(f.a, acc);
  else {
    variables(f.a, acc);
    variables(f.b, acc);
  }
  return acc;
}

function* assignments(vars: string[]): Generator<Record<string, boolean>> {
  const n = vars.length;
  for (let mask = 0; mask < 1 << n; mask++) {
    const env: Record<string, boolean> = {};
    vars.forEach((v, i) => (env[v] = ((mask >> i) & 1) === 1));
    yield env;
  }
}

/** All variable assignments that satisfy every premise. */
export function models(premises: Formula[], extraVars: string[] = []): Record<string, boolean>[] {
  const vars = new Set<string>(extraVars);
  premises.forEach((p) => variables(p, vars));
  const list = [...vars].sort();
  if (list.length > 12) throw new Error('Too many variables');
  return [...assignments(list)].filter((env) => premises.every((p) => evaluate(p, env)));
}

export function classify(premises: Formula[], claim: Formula): Verdict {
  const ms = models(premises, [...variables(claim)]);
  if (ms.length === 0) throw new Error('Premises are unsatisfiable');
  const truths = ms.map((m) => evaluate(claim, m));
  if (truths.every(Boolean)) return 'must';
  if (truths.every((t) => !t)) return 'cannot';
  return 'could';
}

/** Logical equivalence of two premise sets (used for back-translation checks). */
export function equivalentSets(a: Formula[], b: Formula[]): boolean {
  const vars = new Set<string>();
  [...a, ...b].forEach((f) => variables(f, vars));
  for (const env of assignments([...vars].sort())) {
    const va = a.every((f) => evaluate(f, env));
    const vb = b.every((f) => evaluate(f, env));
    if (va !== vb) return false;
  }
  return true;
}

export function equivalent(a: Formula, b: Formula): boolean {
  return equivalentSets([a], [b]);
}

export function show(f: Formula): string {
  switch (f.t) {
    case 'var':
      return f.n;
    case 'not':
      return f.a.t === 'var' ? `~${f.a.n}` : `~(${show(f.a)})`;
    case 'and':
      return `(${show(f.a)} & ${show(f.b)})`;
    case 'or':
      return `(${show(f.a)} | ${show(f.b)})`;
    case 'imp':
      return `(${show(f.a)} -> ${show(f.b)})`;
  }
}

/** Longest implication chain length among premises of the form X -> Y over literals (difficulty signal). */
export function chainLength(premises: Formula[]): number {
  const edges = new Map<string, string[]>();
  const lit = (f: Formula): string | null => (f.t === 'var' ? f.n : f.t === 'not' && f.a.t === 'var' ? `~${f.a.n}` : null);
  for (const p of premises) {
    if (p.t !== 'imp') continue;
    const a = lit(p.a);
    const b = lit(p.b);
    if (!a || !b) continue;
    edges.set(a, [...(edges.get(a) ?? []), b]);
  }
  const memo = new Map<string, number>();
  const depth = (n: string, seen: Set<string>): number => {
    if (memo.has(n)) return memo.get(n)!;
    if (seen.has(n)) return 0;
    seen.add(n);
    const d = 1 + Math.max(0, ...(edges.get(n) ?? []).map((x) => depth(x, seen)));
    seen.delete(n);
    memo.set(n, d);
    return d;
  };
  return Math.max(0, ...[...edges.keys()].map((k) => depth(k, new Set())));
}

export interface VerdictModel {
  variables: string[];
  premises: string[];
  claims: { formula: string; verdict: Verdict; trap?: 'converse' | 'inverse' }[];
}

/**
 * Generates a satisfiable chain-style premise set plus six claims with at least one of each verdict
 * and at least one converse/inverse trap. Deterministic for a given rng.
 */
export function generateVerdictModel(rng: () => number, varCount = 5): VerdictModel {
  for (let attempt = 0; attempt < 500; attempt++) {
    const vars = ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, varCount);
    const neg = () => rng() < 0.3;
    const lit = (v: string, n: boolean) => (n ? `~${v}` : v);
    // Chain A -> B -> C -> D (with optional negations), plus a disjunction tying in the last variable.
    const chain = vars.slice(0, varCount - 1);
    const premises: string[] = [];
    const polarity = chain.map(() => neg());
    for (let i = 0; i < chain.length - 1; i++) premises.push(`${lit(chain[i]!, polarity[i]!)} -> ${lit(chain[i + 1]!, polarity[i + 1]!)}`);
    const last = vars[varCount - 1]!;
    premises.push(`${lit(chain[0]!, polarity[0]!)} | ${last}`);
    if (rng() < 0.5) premises.push(`~(${last} & ${lit(chain[chain.length - 1]!, polarity[chain.length - 1]!)})`);
    const P = premises.map(parse);
    if (models(P).length === 0) continue;

    const L = (i: number, flip = false) => lit(chain[i]!, flip ? !polarity[i] : polarity[i]!);
    const n = chain.length;
    const candidates: { formula: string; trap?: 'converse' | 'inverse' }[] = [
      { formula: `${L(0)} -> ${L(n - 1)}` },
      { formula: `${L(n - 1, true)} -> ${L(0, true)}` },
      { formula: `${L(n - 1)} -> ${L(0)}`, trap: 'converse' },
      { formula: `${L(0, true)} -> ${L(n - 1, true)}`, trap: 'inverse' },
      { formula: `${L(0)} & ${L(n - 1, true)}` },
      { formula: `${L(n - 1, true)} -> ${last}` },
      { formula: `~${last} & ${L(0, true)}` },
      { formula: `${L(1)}` },
      { formula: `${L(1)} & ~${L(0)}`.replace('~~', '') },
      { formula: `${last} & ${L(n - 1)}` },
    ];
    const scored = candidates
      .map((c) => {
        try {
          return { ...c, verdict: classify(P, parse(c.formula)) };
        } catch {
          return null;
        }
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
    // pick 6 with ≥1 of each verdict and ≥1 trap
    const picked: typeof scored = [];
    for (const v of ['must', 'could', 'cannot'] as const) {
      const c = scored.find((x) => x.verdict === v && !picked.includes(x));
      if (c) picked.push(c);
    }
    const trap = scored.find((x) => x.trap && !picked.includes(x));
    if (trap) picked.push(trap);
    for (const c of scored) if (picked.length < 6 && !picked.includes(c)) picked.push(c);
    const verdicts = new Set(picked.map((p) => p.verdict));
    if (picked.length === 6 && verdicts.size === 3 && picked.some((p) => p.trap)) {
      const order = picked.map((p) => ({ p, k: rng() })).sort((a, b) => a.k - b.k).map((x) => x.p);
      return { variables: vars, premises, claims: order.map(({ formula, verdict, trap }) => ({ formula, verdict, ...(trap ? { trap } : {}) })) };
    }
  }
  throw new Error('Could not generate a verdict model');
}
