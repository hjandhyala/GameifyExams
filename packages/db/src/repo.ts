import type { EngineId, GameId, ISODate, TrackId } from '@prepdle/core';
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { rows, type Db } from './client';
import {
  auditLog,
  guessAggregates,
  itemResponses,
  itemReviews,
  items,
  pipelineRuns,
  puzzles,
  puzzleVersions,
  reports,
  resultAggregates,
  results,
  staffUsers,
  transferCodes,
  dailyVisitors,
} from './schema';

export type ItemRow = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type PuzzleRow = typeof puzzles.$inferSelect;
export type PuzzleVersionRow = typeof puzzleVersions.$inferSelect;
export type ResultRow = typeof results.$inferSelect;
export type ReportRow = typeof reports.$inferSelect;
export type StaffRow = typeof staffUsers.$inferSelect;

const buf = (b: Uint8Array | Buffer): Buffer => (Buffer.isBuffer(b) ? b : Buffer.from(b));

export class Repo {
  constructor(public readonly db: Db) {}

  // ------------------------------------------------------------------ puzzles (player)
  async getPuzzle(track: TrackId, gameId: GameId, date: ISODate): Promise<PuzzleRow | undefined> {
    const r = await this.db
      .select()
      .from(puzzles)
      .where(and(eq(puzzles.track, track), eq(puzzles.gameId, gameId), eq(puzzles.date, date)))
      .limit(1);
    return r[0];
  }

  async getPuzzleById(id: string): Promise<PuzzleRow | undefined> {
    return (await this.db.select().from(puzzles).where(eq(puzzles.id, id)).limit(1))[0];
  }

  async getVersion(puzzleId: string, version: number): Promise<PuzzleVersionRow | undefined> {
    return (
      await this.db
        .select()
        .from(puzzleVersions)
        .where(and(eq(puzzleVersions.puzzleId, puzzleId), eq(puzzleVersions.version, version)))
        .limit(1)
    )[0];
  }

  async listVersions(puzzleId: string): Promise<PuzzleVersionRow[]> {
    return this.db.select().from(puzzleVersions).where(eq(puzzleVersions.puzzleId, puzzleId)).orderBy(asc(puzzleVersions.version));
  }

  async puzzlesOnDate(date: ISODate): Promise<PuzzleRow[]> {
    return this.db.select().from(puzzles).where(eq(puzzles.date, date));
  }

  async puzzlesInRange(from: ISODate, to: ISODate, track?: TrackId): Promise<PuzzleRow[]> {
    const conds = [gte(puzzles.date, from), lte(puzzles.date, to)];
    if (track) conds.push(eq(puzzles.track, track));
    return this.db.select().from(puzzles).where(and(...conds)).orderBy(asc(puzzles.date));
  }

  async insertPuzzle(p: typeof puzzles.$inferInsert, v: Omit<typeof puzzleVersions.$inferInsert, 'puzzleId'>): Promise<void> {
    await this.db.insert(puzzles).values(p);
    await this.db.insert(puzzleVersions).values({ ...v, puzzleId: p.id });
  }

  /** Creates version n+1; optionally voids the previous current version. */
  async addVersion(puzzleId: string, pub: unknown, secret: unknown, opts: { voidPrevious: boolean; reason: string; actor: string }): Promise<number> {
    const p = await this.getPuzzleById(puzzleId);
    if (!p) throw new Error('puzzle not found');
    const next = p.currentVersion + 1;
    await this.db.insert(puzzleVersions).values({ puzzleId, version: next, public: pub, secret, reason: opts.reason, createdBy: opts.actor });
    if (opts.voidPrevious) {
      await this.db
        .update(puzzleVersions)
        .set({ voided: true, reason: opts.reason })
        .where(and(eq(puzzleVersions.puzzleId, puzzleId), eq(puzzleVersions.version, p.currentVersion)));
    }
    await this.db.update(puzzles).set({ currentVersion: next }).where(eq(puzzles.id, puzzleId));
    await this.audit(opts.actor, opts.voidPrevious ? 'void_and_patch' : 'patch', 'puzzle', puzzleId, { version: next, reason: opts.reason });
    return next;
  }

  /** Voids the current version without replacement ("pull"). */
  async pullPuzzle(puzzleId: string, actor: string, reason: string): Promise<void> {
    const p = await this.getPuzzleById(puzzleId);
    if (!p) throw new Error('puzzle not found');
    await this.db
      .update(puzzleVersions)
      .set({ voided: true, reason })
      .where(and(eq(puzzleVersions.puzzleId, puzzleId), eq(puzzleVersions.version, p.currentVersion)));
    await this.db.update(puzzles).set({ status: 'voided' }).where(eq(puzzles.id, puzzleId));
    await this.audit(actor, 'pull', 'puzzle', puzzleId, { reason });
  }

  async deletePuzzle(puzzleId: string): Promise<void> {
    await this.db.delete(puzzleVersions).where(eq(puzzleVersions.puzzleId, puzzleId));
    await this.db.delete(puzzles).where(eq(puzzles.id, puzzleId));
  }

  async lockWindow(through: ISODate): Promise<number> {
    const r = await rows<{ n: number }>(
      this.db,
      sql`WITH u AS (UPDATE puzzles SET locked = true WHERE date <= ${through} AND locked = false RETURNING 1) SELECT count(*)::int AS n FROM u`,
    );
    return r[0]?.n ?? 0;
  }

  /** Days of consecutive scheduled coverage from `from` for each (track, game). */
  async bufferDays(from: ISODate, horizon = 60): Promise<{ track: TrackId; gameId: GameId; days: number }[]> {
    const r = await rows<{ track: TrackId; game_id: GameId; dates: string[] }>(
      this.db,
      sql`SELECT track, game_id, array_agg(to_char(date, 'YYYY-MM-DD') ORDER BY date) AS dates
          FROM puzzles WHERE date >= ${from} AND date < (${from}::date + ${horizon}::int) AND status <> 'voided'
          GROUP BY track, game_id`,
    );
    return r.map((x) => {
      const set = new Set(x.dates);
      let days = 0;
      const d = new Date(`${from}T00:00:00Z`);
      while (set.has(d.toISOString().slice(0, 10))) {
        days++;
        d.setUTCDate(d.getUTCDate() + 1);
      }
      return { track: x.track, gameId: x.game_id, days };
    });
  }

  // ------------------------------------------------------------------ results
  async getResult(puzzleId: string, deviceHash: Buffer): Promise<ResultRow | undefined> {
    return (
      await this.db
        .select()
        .from(results)
        .where(and(eq(results.puzzleId, puzzleId), eq(results.deviceHash, deviceHash)))
        .limit(1)
    )[0];
  }

  /** Inserts a result; returns true if newly inserted. */
  async insertResult(r: typeof results.$inferInsert): Promise<boolean> {
    const ins = await this.db.insert(results).values(r).onConflictDoNothing().returning({ id: results.id });
    return ins.length > 0;
  }

  async replaceResult(id: number, r: Partial<typeof results.$inferInsert>): Promise<void> {
    await this.db.update(results).set(r).where(eq(results.id, id));
  }

  async setResultBonus(id: number, bonus: boolean, transcript: unknown): Promise<void> {
    await rows(
      this.db,
      sql`UPDATE results SET outcome = jsonb_set(outcome, '{bonus}', ${JSON.stringify(bonus)}::jsonb), transcript = ${JSON.stringify(transcript)}::jsonb
          WHERE id = ${id} AND NOT (outcome ? 'bonus')`,
    );
  }

  async bumpAggregate(puzzleId: string, bucket: string, delta = 1): Promise<void> {
    await this.db
      .insert(resultAggregates)
      .values({ puzzleId, bucket, count: delta })
      .onConflictDoUpdate({ target: [resultAggregates.puzzleId, resultAggregates.bucket], set: { count: sql`${resultAggregates.count} + ${delta}` } });
  }

  async aggregates(puzzleId: string): Promise<Record<string, number>> {
    const r = await this.db.select().from(resultAggregates).where(eq(resultAggregates.puzzleId, puzzleId));
    return Object.fromEntries(r.filter((x) => x.count > 0).map((x) => [x.bucket, x.count]));
  }

  async bumpGuesses(puzzleId: string, keys: string[]): Promise<void> {
    for (const guessKey of new Set(keys)) {
      await this.db
        .insert(guessAggregates)
        .values({ puzzleId, guessKey, count: 1 })
        .onConflictDoUpdate({ target: [guessAggregates.puzzleId, guessAggregates.guessKey], set: { count: sql`${guessAggregates.count} + 1` } });
    }
  }

  async topGuesses(puzzleId: string, n = 5): Promise<{ guessKey: string; count: number }[]> {
    return this.db
      .select({ guessKey: guessAggregates.guessKey, count: guessAggregates.count })
      .from(guessAggregates)
      .where(eq(guessAggregates.puzzleId, puzzleId))
      .orderBy(desc(guessAggregates.count))
      .limit(n);
  }

  async insertItemResponses(rs: (typeof itemResponses.$inferInsert)[]): Promise<void> {
    if (rs.length) await this.db.insert(itemResponses).values(rs).onConflictDoNothing();
  }

  /** Reconstructs this device's history for streak restore (§8.8). */
  async deviceHistory(
    deviceHash: Buffer,
    since?: ISODate,
  ): Promise<{ date: string; track: TrackId; gameId: GameId; passed: boolean; bucket: string; outcome: unknown; puzzleId: string; version: number }[]> {
    return rows(
      this.db,
      sql`SELECT to_char(p.date, 'YYYY-MM-DD') AS date, p.track, p.game_id AS "gameId", r.passed, r.bucket, r.outcome, r.puzzle_id AS "puzzleId", r.version
          FROM results r JOIN puzzles p ON p.id = r.puzzle_id
          WHERE r.device_hash = ${deviceHash} ${since ? sql`AND p.date >= ${since}` : sql``}
          ORDER BY p.date ASC`,
    );
  }

  async deviceSummary(deviceHash: Buffer): Promise<{ firstSeen: string | null; resultsCount: number }> {
    const r = await rows<{ first: string | null; n: number }>(
      this.db,
      sql`SELECT min(created_at)::text AS first, count(*)::int AS n FROM results WHERE device_hash = ${deviceHash}`,
    );
    return { firstSeen: r[0]?.first ?? null, resultsCount: r[0]?.n ?? 0 };
  }

  async deleteDevice(deviceHash: Buffer): Promise<void> {
    await this.db.delete(results).where(eq(results.deviceHash, deviceHash));
    await this.db.delete(itemResponses).where(eq(itemResponses.deviceHash, deviceHash));
    await this.db.delete(reports).where(eq(reports.deviceHash, deviceHash));
    await this.db.delete(transferCodes).where(eq(transferCodes.deviceHash, deviceHash));
    await this.db.delete(dailyVisitors).where(eq(dailyVisitors.deviceHash, deviceHash));
  }

  // ------------------------------------------------------------------ user analytics (admin)
  async recordVisit(date: ISODate, deviceHash: Buffer, track: TrackId | null): Promise<void> {
    await this.db.insert(dailyVisitors).values({ date, deviceHash, track }).onConflictDoNothing();
  }

  /** Aggregate user metrics for the admin Users page. A "user" is an anonymous device. */
  async userMetrics(today: ISODate) {
    const q = <T>(query: ReturnType<typeof sql>) => rows<T>(this.db, query);
    const [totals] = await q<{ all_time: number; dau: number; wau: number; mau: number; players_today: number; players_7: number; players_30: number; completions_today: number }>(sql`
      SELECT
        (SELECT count(DISTINCT device_hash)::int FROM daily_visitors) AS all_time,
        (SELECT count(*)::int FROM daily_visitors WHERE date = ${today}::date) AS dau,
        (SELECT count(DISTINCT device_hash)::int FROM daily_visitors WHERE date > ${today}::date - 7) AS wau,
        (SELECT count(DISTINCT device_hash)::int FROM daily_visitors WHERE date > ${today}::date - 30) AS mau,
        (SELECT count(DISTINCT r.device_hash)::int FROM results r JOIN puzzles p ON p.id = r.puzzle_id WHERE p.date = ${today}::date) AS players_today,
        (SELECT count(DISTINCT r.device_hash)::int FROM results r JOIN puzzles p ON p.id = r.puzzle_id WHERE p.date > ${today}::date - 7) AS players_7,
        (SELECT count(DISTINCT r.device_hash)::int FROM results r JOIN puzzles p ON p.id = r.puzzle_id WHERE p.date > ${today}::date - 30) AS players_30,
        (SELECT count(*)::int FROM results r JOIN puzzles p ON p.id = r.puzzle_id WHERE p.date = ${today}::date) AS completions_today`);
    const daily = await q<{ date: string; visitors: number; new_visitors: number; players: number; completions: number }>(sql`
      WITH days AS (SELECT generate_series(${today}::date - 29, ${today}::date, interval '1 day')::date AS d),
      first_seen AS (SELECT device_hash, min(date) AS first FROM daily_visitors GROUP BY device_hash)
      SELECT to_char(days.d, 'YYYY-MM-DD') AS date,
        (SELECT count(*)::int FROM daily_visitors v WHERE v.date = days.d) AS visitors,
        (SELECT count(*)::int FROM first_seen f WHERE f.first = days.d) AS new_visitors,
        (SELECT count(DISTINCT r.device_hash)::int FROM results r JOIN puzzles p ON p.id = r.puzzle_id WHERE p.date = days.d) AS players,
        (SELECT count(*)::int FROM results r JOIN puzzles p ON p.id = r.puzzle_id WHERE p.date = days.d) AS completions
      FROM days ORDER BY days.d DESC`);
    const retention = await q<{ cohort: string; size: number; d1: number; d7: number }>(sql`
      WITH first_seen AS (SELECT device_hash, min(date) AS first FROM daily_visitors GROUP BY device_hash)
      SELECT to_char(f.first, 'YYYY-MM-DD') AS cohort, count(*)::int AS size,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM daily_visitors v WHERE v.device_hash = f.device_hash AND v.date = f.first + 1))::int AS d1,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM daily_visitors v WHERE v.device_hash = f.device_hash AND v.date = f.first + 7))::int AS d7
      FROM first_seen f WHERE f.first > ${today}::date - 30 GROUP BY f.first ORDER BY f.first DESC`);
    const byTrack = await q<{ track: string; today: number; week: number }>(sql`
      SELECT p.track,
        count(DISTINCT r.device_hash) FILTER (WHERE p.date = ${today}::date)::int AS today,
        count(DISTINCT r.device_hash) FILTER (WHERE p.date > ${today}::date - 7)::int AS week
      FROM results r JOIN puzzles p ON p.id = r.puzzle_id WHERE p.date > ${today}::date - 7 GROUP BY p.track ORDER BY p.track`);
    const byGame = await q<{ track: string; game_id: string; completions: number; passed: number }>(sql`
      SELECT p.track, p.game_id, count(*)::int AS completions, count(*) FILTER (WHERE r.passed)::int AS passed
      FROM results r JOIN puzzles p ON p.id = r.puzzle_id WHERE p.date = ${today}::date GROUP BY p.track, p.game_id ORDER BY 1, 2`);
    const engagement = await q<{ days_active: number; devices: number }>(sql`
      SELECT days_active, count(*)::int AS devices FROM (
        SELECT device_hash, count(*)::int AS days_active FROM daily_visitors WHERE date > ${today}::date - 7 GROUP BY device_hash
      ) x GROUP BY days_active ORDER BY days_active`);
    return { totals: totals!, daily, retention, byTrack, byGame, engagement };
  }

  // ------------------------------------------------------------------ transfer codes
  async createTransferCode(codeHash: Buffer, deviceHash: Buffer, didCiphertext: Buffer, expiresAt: Date): Promise<void> {
    await this.db.insert(transferCodes).values({ codeHash, deviceHash, didCiphertext, expiresAt });
  }

  async redeemTransferCode(codeHash: Buffer): Promise<Buffer | null> {
    const r = await rows<{ did_ciphertext: Uint8Array }>(
      this.db,
      sql`UPDATE transfer_codes SET redeemed_at = now()
          WHERE code_hash = ${codeHash} AND redeemed_at IS NULL AND expires_at > now()
          RETURNING did_ciphertext`,
    );
    return r[0] ? buf(r[0].did_ciphertext) : null;
  }

  // ------------------------------------------------------------------ reports
  async insertReport(r: typeof reports.$inferInsert): Promise<void> {
    await this.db.insert(reports).values(r);
  }

  async listReports(status?: string, limit = 200): Promise<ReportRow[]> {
    const q = this.db.select().from(reports);
    return (status ? q.where(eq(reports.status, status)) : q).orderBy(desc(reports.createdAt)).limit(limit);
  }

  async updateReport(id: number, status: string, resolution: string | null, actor: string): Promise<void> {
    await this.db.update(reports).set({ status, resolution, resolvedBy: actor }).where(eq(reports.id, id));
    await this.audit(actor, 'report_update', 'report', String(id), { status, resolution });
  }

  async reportCounts(puzzleIds: string[]): Promise<Record<string, number>> {
    if (!puzzleIds.length) return {};
    const r = await this.db
      .select({ puzzleId: reports.puzzleId, n: sql<number>`count(*)::int` })
      .from(reports)
      .where(inArray(reports.puzzleId, puzzleIds))
      .groupBy(reports.puzzleId);
    return Object.fromEntries(r.map((x) => [x.puzzleId, x.n]));
  }

  // ------------------------------------------------------------------ items (bank)
  async insertItems(rs: NewItem[]): Promise<number> {
    if (!rs.length) return 0;
    const ins = await this.db.insert(items).values(rs).onConflictDoNothing().returning({ id: items.id });
    return ins.length;
  }

  async getItem(id: string): Promise<ItemRow | undefined> {
    return (await this.db.select().from(items).where(eq(items.id, id)).limit(1))[0];
  }

  async getItems(ids: string[]): Promise<ItemRow[]> {
    if (!ids.length) return [];
    return this.db.select().from(items).where(inArray(items.id, ids));
  }

  async listItems(f: { track?: TrackId; gameId?: GameId; status?: string[]; limit?: number } = {}): Promise<ItemRow[]> {
    const conds = [];
    if (f.track) conds.push(eq(items.track, f.track));
    if (f.gameId) conds.push(eq(items.gameId, f.gameId));
    if (f.status?.length) conds.push(inArray(items.status, f.status as ItemRow['status'][]));
    const q = this.db.select().from(items);
    return (conds.length ? q.where(and(...conds)) : q).orderBy(asc(items.createdAt)).limit(f.limit ?? 500);
  }

  async updateItem(id: string, patch: Partial<NewItem>, actor: string, action: string): Promise<void> {
    await this.db.update(items).set({ ...patch, updatedAt: new Date() }).where(eq(items.id, id));
    await this.audit(actor, action, 'item', id, patch);
  }

  async markItemsUsed(ids: string[], date: ISODate): Promise<void> {
    if (!ids.length) return;
    await this.db
      .update(items)
      .set({ status: 'published', lastUsedOn: date, timesUsed: sql`${items.timesUsed} + 1` })
      .where(inArray(items.id, ids));
  }

  async insertReview(r: typeof itemReviews.$inferInsert): Promise<void> {
    await this.db.insert(itemReviews).values(r);
  }

  async itemCounts(): Promise<{ track: TrackId; gameId: GameId; status: string; n: number }[]> {
    return rows(
      this.db,
      sql`SELECT track, game_id AS "gameId", status, count(*)::int AS n FROM items GROUP BY track, game_id, status`,
    );
  }

  // ------------------------------------------------------------------ psychometrics
  async itemResponseStats(minN = 1): Promise<
    { itemId: string; n: number; p: number; options: Record<string, number>; confidence: Record<string, { n: number; correct: number }> }[]
  > {
    const r = await rows<{ item_id: string; n: number; p: number; options: Record<string, number> | null; conf: Record<string, { n: number; correct: number }> | null }>(
      this.db,
      sql`SELECT item_id, count(*)::int AS n, avg(CASE WHEN correct THEN 1 ELSE 0 END)::float AS p,
            (SELECT jsonb_object_agg(coalesce(o.option_id, 'null'), o.c) FROM (SELECT option_id, count(*)::int c FROM item_responses x WHERE x.item_id = ir.item_id GROUP BY option_id) o) AS options,
            (SELECT jsonb_object_agg(c.confidence::text, jsonb_build_object('n', c.n, 'correct', c.k)) FROM (SELECT confidence, count(*)::int n, sum(CASE WHEN correct THEN 1 ELSE 0 END)::int k FROM item_responses y WHERE y.item_id = ir.item_id GROUP BY confidence) c) AS conf
          FROM item_responses ir GROUP BY item_id HAVING count(*) >= ${minN}`,
    );
    return r.map((x) => ({ itemId: x.item_id, n: x.n, p: x.p, options: x.options ?? {}, confidence: x.conf ?? {} }));
  }

  async itemResponsePairs(itemId: string): Promise<{ correct: boolean; rest: number }[]> {
    return rows(
      this.db,
      sql`SELECT correct, (coalesce(total_correct, 0) - CASE WHEN correct THEN 1 ELSE 0 END)::int AS rest FROM item_responses WHERE item_id = ${itemId}`,
    );
  }

  async setObservedDifficulty(itemId: string, d: number): Promise<void> {
    await this.db.update(items).set({ difficultyObserved: d }).where(eq(items.id, itemId));
  }

  async reconcileAggregates(puzzleIds: string[]): Promise<void> {
    for (const id of puzzleIds) {
      await this.db.delete(resultAggregates).where(eq(resultAggregates.puzzleId, id));
      await rows(
        this.db,
        sql`INSERT INTO result_aggregates (puzzle_id, bucket, count)
            SELECT r.puzzle_id, r.bucket, count(*)::int FROM results r
            JOIN puzzle_versions v ON v.puzzle_id = r.puzzle_id AND v.version = r.version AND v.voided = false
            WHERE r.puzzle_id = ${id} GROUP BY r.puzzle_id, r.bucket`,
      );
    }
  }

  async prune(): Promise<{ transcripts: number; codes: number }> {
    const t = await rows<{ n: number }>(
      this.db,
      sql`WITH u AS (UPDATE results SET transcript = NULL WHERE transcript IS NOT NULL AND created_at < now() - interval '180 days' RETURNING 1) SELECT count(*)::int n FROM u`,
    );
    const c = await rows<{ n: number }>(this.db, sql`WITH d AS (DELETE FROM transfer_codes WHERE expires_at < now() - interval '1 day' RETURNING 1) SELECT count(*)::int n FROM d`);
    await rows(
      this.db,
      sql`DELETE FROM results WHERE device_hash IN (SELECT device_hash FROM results GROUP BY device_hash HAVING max(created_at) < now() - interval '400 days')`,
    );
    await rows(this.db, sql`DELETE FROM daily_visitors WHERE date < now()::date - 400`);
    return { transcripts: t[0]?.n ?? 0, codes: c[0]?.n ?? 0 };
  }

  // ------------------------------------------------------------------ staff, audit, pipeline
  async staffByEmail(email: string): Promise<StaffRow | undefined> {
    return (await this.db.select().from(staffUsers).where(eq(staffUsers.email, email.toLowerCase())).limit(1))[0];
  }

  async upsertStaff(s: typeof staffUsers.$inferInsert): Promise<void> {
    await this.db
      .insert(staffUsers)
      .values({ ...s, email: s.email.toLowerCase() })
      .onConflictDoUpdate({ target: staffUsers.email, set: { role: s.role, name: s.name, tracks: s.tracks, qualifications: s.qualifications } });
  }

  async listStaff(): Promise<StaffRow[]> {
    return this.db.select().from(staffUsers).orderBy(asc(staffUsers.email));
  }

  async audit(actor: string, action: string, entity: string, entityId: string, diff?: unknown): Promise<void> {
    await this.db.insert(auditLog).values({ actor, action, entity, entityId, diff: diff ?? null });
  }

  async recentAudit(limit = 100) {
    return this.db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit);
  }

  async startRun(id: string, kind: string, params: unknown): Promise<void> {
    await this.db.insert(pipelineRuns).values({ id, kind, params, status: 'running' });
  }

  async finishRun(id: string, status: string, stats: unknown, costUsd?: number): Promise<void> {
    await this.db
      .update(pipelineRuns)
      .set({ status, stats, costUsd: costUsd === undefined ? null : costUsd.toFixed(4), finishedAt: new Date() })
      .where(eq(pipelineRuns.id, id));
  }

  async listRuns(limit = 50) {
    return this.db.select().from(pipelineRuns).orderBy(desc(pipelineRuns.startedAt)).limit(limit);
  }
}

export type { EngineId };
