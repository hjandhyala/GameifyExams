import { describe, expect, it } from 'vitest';
import { engineFor, gameById, type EvalCtx } from '@prepdle/core';
import { dictionary, FIXTURES, vocabMap } from '@prepdle/content';
import { compileSlot, vocabFor } from '../src/publish/compile';
import { fixtureToItem } from '../src/publish/seed';

function ctxFor(f: (typeof FIXTURES)[number]): EvalCtx {
  const g = gameById(f.track, f.gameId)!;
  return {
    ...(g.engine === 'jargon' ? { dictionary: dictionary(f.track) } : {}),
    ...(g.workup ? { vocab: vocabMap(g.workup.vocabId) } : {}),
  };
}

describe('fixture content', () => {
  it('has unique keys and every track has every game', () => {
    expect(new Set(FIXTURES.map((f) => f.key)).size).toBe(FIXTURES.length);
    for (const t of ['mcat', 'lsat', 'boards', 'bar'] as const) {
      const games = new Set(FIXTURES.filter((f) => f.track === t).map((f) => f.gameId));
      for (const g of ['quartet', 'gauntlet'] as const) expect(games.has(g), `${t}/${g}`).toBe(true);
      expect(FIXTURES.filter((f) => f.track === t && f.gameId === 'gauntlet').length).toBeGreaterThanOrEqual(5);
    }
  });

  for (const f of FIXTURES) {
    it(`${f.key} passes invariants`, () => {
      const engine = engineFor(f.gameId);
      const authored = engine.authoredSchema.parse(f.authored);
      const errors = engine.checkInvariants(authored, ctxFor(f)).filter((i) => i.level === 'error');
      expect(errors).toEqual([]);
      const game = gameById(f.track, f.gameId)!;
      if (game.gauntlet) expect((authored as { options: unknown[] }).options.length).toBe(game.gauntlet.optionCount);
    });
  }

  it('every non-gauntlet fixture compiles without leaks and is winnable', () => {
    for (const f of FIXTURES.filter((x) => x.gameId !== 'gauntlet')) {
      const item = { ...fixtureToItem(f), timesUsed: 0, version: 1 } as never;
      const compiled = compileSlot({ track: f.track, gameId: f.gameId, date: '2026-11-18', items: [item], launchDate: '2026-07-15' });
      const engine = engineFor(f.gameId);
      const ctx = ctxFor(f);
      const sec = compiled.secret as Record<string, unknown>;
      let transcript: unknown[];
      switch (engine.id) {
        case 'quartet':
          transcript = (sec.groups as { tileIds: string[] }[]).map((g) => ({ type: 'guess', tileIds: g.tileIds }));
          break;
        case 'jargon':
          transcript = [{ type: 'guess', word: sec.answer }];
          break;
        case 'workup':
          transcript = [{ type: 'guess', entityId: sec.answerId }];
          break;
        default:
          transcript = [{ type: 'check', assignment: sec.key }];
      }
      const r = engine.evaluate(compiled.public, compiled.secret, transcript, ctx);
      expect(r.status, f.key).toBe('won');
    }
  });

  it('gauntlet compiles five items with balanced keys', () => {
    for (const t of ['mcat', 'lsat', 'boards', 'bar'] as const) {
      const qs = FIXTURES.filter((f) => f.track === t && f.gameId === 'gauntlet').slice(0, 5);
      const tally: Record<string, number> = {};
      const compiled = compileSlot({
        track: t,
        gameId: 'gauntlet',
        date: '2026-11-18',
        items: qs.map((q) => ({ ...fixtureToItem(q), timesUsed: 0 }) as never),
        launchDate: '2026-07-15',
        keyTally: tally,
      });
      const keys = Object.values((compiled.secret as { keys: Record<string, { correctOptionId: string }> }).keys).map((k) => k.correctOptionId);
      expect(new Set(keys).size).toBeGreaterThanOrEqual(3);
    }
  });

  it('vocab lookup for workup games', () => {
    expect(vocabFor('boards', 'workup')?.get('dx_sarcoidosis')?.name).toBe('Sarcoidosis');
    expect(vocabFor('bar', 'quartet')).toBeUndefined();
  });
});
