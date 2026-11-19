import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  applyDay,
  buildDailyCard,
  buildGameShare,
  daysBetween,
  displayStreak,
  emptyStreak,
  isISODate,
  isPlayable,
  isSubmittable,
  localDate,
  logic,
  percentile,
  playableWindow,
  puzzleNumber,
  recomputeStreaks,
  shortDateLabel,
  weekday,
  type HistoryRecord,
} from '../src';

describe('dates', () => {
  it('validates ISO dates', () => {
    expect(isISODate('2026-11-18')).toBe(true);
    expect(isISODate('2026-02-30')).toBe(false);
    expect(isISODate('20261118')).toBe(false);
  });
  it('local date across extreme zones', () => {
    const instant = new Date('2026-11-18T11:30:00Z');
    expect(localDate(instant, 'Pacific/Kiritimati')).toBe('2026-11-19');
    expect(localDate(instant, 'Pacific/Pago_Pago')).toBe('2026-11-18');
    expect(localDate(new Date('2026-11-18T02:00:00Z'), 'America/St_Johns')).toBe('2026-11-17');
  });
  it('daysBetween is DST-proof and symmetric', () => {
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-11-02', '2026-10-31')).toBe(-2);
    fc.assert(fc.property(fc.integer({ min: -2000, max: 2000 }), (n) => daysBetween('2026-01-01', addDays('2026-01-01', n)) === n));
  });
  it('puzzle numbers and weekdays', () => {
    expect(puzzleNumber('2026-11-18', '2026-07-15')).toBe(127);
    expect(weekday('2026-11-18')).toBe(3);
    expect(shortDateLabel('2026-11-18')).toBe('Wed Nov 18');
  });
  it('playable window covers UTC-12..UTC+14', () => {
    const now = Date.parse('2026-11-18T12:00:00Z');
    expect(playableWindow(now)).toEqual({ earliest: '2026-11-18', latest: '2026-11-19' });
    expect(isPlayable('2026-11-19', '2026-01-01', now)).toBe(true);
    expect(isPlayable('2026-11-20', '2026-01-01', now)).toBe(false);
    expect(isPlayable('2026-11-17', '2026-01-01', now)).toBe(false);
    expect(isSubmittable('2026-11-17', '2026-01-01', now)).toBe(true);
    expect(isPlayable('2026-11-18', '2026-12-01', now)).toBe(false);
  });
});

describe('streaks', () => {
  it('consecutive, gaps, same-day and older dates', () => {
    let s = emptyStreak();
    s = applyDay(s, '2026-11-01', true);
    s = applyDay(s, '2026-11-02', true);
    s = applyDay(s, '2026-11-02', true);
    expect(s).toEqual({ current: 2, max: 2, lastDate: '2026-11-02' });
    s = applyDay(s, '2026-11-01', true);
    expect(s.current).toBe(2);
    s = applyDay(s, '2026-11-04', true);
    expect(s).toEqual({ current: 1, max: 2, lastDate: '2026-11-04' });
  });
  it('win streak resets on fail', () => {
    let s = applyDay(applyDay(emptyStreak(), '2026-11-01', true), '2026-11-02', true);
    s = applyDay(s, '2026-11-03', false);
    expect(s).toEqual({ current: 0, max: 2, lastDate: null });
    s = applyDay(s, '2026-11-04', true);
    expect(s.current).toBe(1);
  });
  it('display: alive today or yesterday', () => {
    const s = { current: 5, max: 5, lastDate: '2026-11-17' };
    expect(displayStreak(s, '2026-11-18')).toBe(5);
    expect(displayStreak(s, '2026-11-19')).toBe(0);
  });
  it('recompute from history; void is neutral for win streak', () => {
    const h: HistoryRecord[] = [
      { d: '2026-11-01', t: 'boards', g: 'jargon', p: 1, b: '3' },
      { d: '2026-11-01', t: 'mcat', g: 'quartet', p: 0, b: 'X' },
      { d: '2026-11-02', t: 'boards', g: 'jargon', p: 0, b: 'VOID' },
      { d: '2026-11-03', t: 'boards', g: 'jargon', p: 1, b: '4' },
    ];
    const s = recomputeStreaks(h);
    expect(s.global).toEqual({ current: 3, max: 3, lastDate: '2026-11-03' });
    expect(s.track.boards?.current).toBe(3);
    expect(s.track.mcat?.current).toBe(1);
    expect(s.game['boards:jargon']).toEqual({ current: 1, max: 1, lastDate: '2026-11-03' });
    expect(s.game['mcat:quartet']).toEqual({ current: 0, max: 0, lastDate: null });
  });
  it('recompute equals incremental fold (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.integer({ min: 0, max: 40 }), fc.boolean()), { maxLength: 40 }), (days) => {
        const h: HistoryRecord[] = days.map(([n, p]) => ({ d: addDays('2026-01-01', n), t: 'bar', g: 'quartet', p: p ? 1 : 0, b: p ? '1' : 'X' }));
        const uniq = [...new Map(h.map((r) => [r.d, r])).values()].sort((a, b) => (a.d < b.d ? -1 : 1));
        let g = emptyStreak();
        for (const r of uniq) g = applyDay(g, r.d, true);
        return recomputeStreaks(uniq).global.current === g.current;
      }),
    );
  });
});

describe('share & stats', () => {
  it('game share text', () => {
    expect(buildGameShare({ track: 'boards', gameId: 'workup', number: 127, scoreLabel: '3/6', lines: ['🔴🟡🟢⚪⚪⚪'], streak: 12 })).toBe(
      'Prepdle · Boards Workup #127 · 3/6\n🔴🟡🟢⚪⚪⚪\n🔥12 · prepdle.app/boards',
    );
  });
  it('daily card', () => {
    const card = buildDailyCard({ track: 'bar', date: '2026-11-18', number: 127, games: [{ gameId: 'quartet', scoreLabel: '✅ 1 mistake' }], streak: 3 });
    expect(card.split('\n')[0]).toBe('Prepdle Bar · Wed Nov 18 · #127');
    expect(card).toContain('📜 Doctrine  —');
    expect(card).toContain('🔥 3-day streak');
  });
  it('percentile', () => {
    expect(percentile({ '1': 10, '2': 20, X: 70 }, ['1', '2', 'X'], '2')).toBe(80);
    expect(percentile({}, ['1'], '1')).toBe(0);
  });
});

describe('logic solver', () => {
  it('parses precedence and classifies', () => {
    const P = ['A -> B', 'B -> C', 'A | D'].map(logic.parse);
    expect(logic.classify(P, logic.parse('A -> C'))).toBe('must');
    expect(logic.classify(P, logic.parse('C -> A'))).toBe('could');
    expect(logic.classify(P, logic.parse('A & ~C'))).toBe('cannot');
    expect(logic.equivalent(logic.parse('~(A & B)'), logic.parse('~A | ~B'))).toBe(true);
    expect(logic.chainLength(P)).toBe(3);
  });
  it('generates valid verdict models', () => {
    for (let s = 0; s < 20; s++) {
      let seed = s + 1;
      const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const m = logic.generateVerdictModel(rng);
      const P = m.premises.map(logic.parse);
      expect(m.claims).toHaveLength(6);
      expect(new Set(m.claims.map((c) => c.verdict)).size).toBe(3);
      for (const c of m.claims) expect(logic.classify(P, logic.parse(c.formula))).toBe(c.verdict);
    }
  });
});
