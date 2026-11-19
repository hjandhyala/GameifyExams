import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, migrate, Repo, type DbHandle } from '@prepdle/db';
import { allSlots } from '@prepdle/core';
import { ensureDevContent } from '../src/publish/seed';
import { schedule } from '../src/publish/schedule';

let h: DbHandle;
let repo: Repo;

beforeAll(async () => {
  h = await createDb({ pgliteDir: 'memory', url: '' });
  repo = new Repo(h.db);
});
afterAll(async () => {
  await h.close();
});

describe('database + scheduling (PGlite)', () => {
  it('migrates idempotently', async () => {
    expect(await migrate(h)).toEqual(['0001_init']);
    expect(await migrate(h)).toEqual([]);
  });

  it('seeds fixtures and fills every slot around today', async () => {
    const res = await ensureDevContent(h, { today: '2026-11-18', launchDate: '2026-07-15', back: 1, ahead: 2 });
    expect(res.unfilled).toEqual([]);
    expect(res.filled).toHaveLength(allSlots().length * 4);
    const day = await repo.puzzlesOnDate('2026-11-18');
    expect(day).toHaveLength(16);
    const p = await repo.getPuzzle('boards', 'workup', '2026-11-18');
    expect(p?.number).toBe(127);
    const v = await repo.getVersion(p!.id, 1);
    expect((v!.public as { firstClue: unknown }).firstClue).toBeTruthy();
    // second run is a no-op
    const again = await ensureDevContent(h, { today: '2026-11-18', launchDate: '2026-07-15', back: 1, ahead: 2 });
    expect(again.filled).toHaveLength(0);
  });

  it('does not repeat a concept within a track-day', async () => {
    const day = await repo.puzzlesOnDate('2026-11-19');
    for (const track of ['mcat', 'lsat', 'boards', 'bar'] as const) {
      const ids = day.filter((p) => p.track === track).flatMap((p) => p.itemIds);
      const its = await repo.getItems(ids);
      const concepts = its.flatMap((i) => i.conceptIds);
      expect(new Set(concepts).size).toBe(concepts.length);
    }
  });

  it('strict scheduling refuses published items', async () => {
    const r = await schedule(repo, { from: '2026-12-25', days: 1, launchDate: '2026-07-15', dryRun: true });
    const picked = await repo.getItems(r.filled.flatMap((f) => f.itemIds));
    expect(picked.every((i) => i.status === 'approved')).toBe(true);
    expect(r.filled.length + r.unfilled.length).toBe(16);
  });

  it('results are idempotent and aggregate', async () => {
    const p = (await repo.getPuzzle('bar', 'jargon', '2026-11-18'))!;
    const dev = Buffer.from('a'.repeat(32));
    const row = { puzzleId: p.id, version: 1, deviceHash: dev, passed: true, bucket: '3', outcome: { guesses: 3 }, transcript: [] };
    expect(await repo.insertResult(row)).toBe(true);
    expect(await repo.insertResult(row)).toBe(false);
    await repo.bumpAggregate(p.id, '3');
    await repo.bumpAggregate(p.id, '3');
    expect(await repo.aggregates(p.id)).toEqual({ '3': 2 });
    await repo.reconcileAggregates([p.id]);
    expect(await repo.aggregates(p.id)).toEqual({ '3': 1 });
    const hist = await repo.deviceHistory(dev);
    expect(hist[0]).toMatchObject({ date: '2026-11-18', track: 'bar', gameId: 'jargon', passed: true });
    await repo.deleteDevice(dev);
    expect(await repo.deviceHistory(dev)).toEqual([]);
  });

  it('versions: patch and void', async () => {
    const p = (await repo.getPuzzle('mcat', 'quartet', '2026-11-18'))!;
    const v1 = (await repo.getVersion(p.id, 1))!;
    const n = await repo.addVersion(p.id, v1.public, v1.secret, { voidPrevious: true, reason: 'test', actor: 'test' });
    expect(n).toBe(2);
    expect((await repo.getVersion(p.id, 1))!.voided).toBe(true);
    expect((await repo.getPuzzleById(p.id))!.currentVersion).toBe(2);
  });

  it('buffer days and lock window', async () => {
    const buf = await repo.bufferDays('2026-11-17');
    expect(buf.find((b) => b.track === 'boards' && b.gameId === 'workup')?.days).toBe(4);
    expect(await repo.lockWindow('2026-11-18')).toBeGreaterThan(0);
  });
});
