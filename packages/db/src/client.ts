import { sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { MIGRATIONS } from './migrations';
import * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DbHandle {
  db: Db;
  kind: 'postgres' | 'pglite';
  /** Execute a multi-statement SQL script. */
  exec(script: string): Promise<void>;
  close(): Promise<void>;
}

/**
 * Creates a database handle.
 * - `DATABASE_URL` set → Postgres (Neon or any Postgres) via postgres.js.
 * - otherwise → embedded PGlite (WASM Postgres) persisted at `PGLITE_DIR`,
 *   or in memory when `PGLITE_DIR=memory`. Default: `node_modules/.cache/prepdle-pglite` (ignored by file watchers). Used for local development and tests (no Docker required).
 */
export async function createDb(opts: { url?: string; pgliteDir?: string } = {}): Promise<DbHandle> {
  const url = opts.url ?? process.env.DATABASE_URL;
  if (!url && (process.env.VERCEL_ENV === 'production' || process.env.PREPDLE_PRODUCTION === '1'))
    throw new Error('DATABASE_URL is required in production (embedded PGlite is for development only)');
  if (url) {
    const { default: postgres } = await import('postgres');
    const { drizzle } = await import('drizzle-orm/postgres-js');
    // Serverless-friendly: few connections per instance, short idle timeout; use Neon's pooled (-pooler) URL.
    const client = postgres(url, { prepare: false, max: Number(process.env.DB_POOL_MAX ?? 3), idle_timeout: 20, connect_timeout: 10, onnotice: () => {} });
    const db = drizzle(client, { schema }) as unknown as Db;
    return {
      db,
      kind: 'postgres',
      exec: async (script) => {
        await client.unsafe(script);
      },
      close: async () => {
        await client.end();
      },
    };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  // Default lives under node_modules/.cache so dev-server file watchers ignore database writes.
  const dir = opts.pgliteDir ?? process.env.PGLITE_DIR ?? 'node_modules/.cache/prepdle-pglite';
  if (dir !== 'memory') {
    const { mkdirSync } = await import('node:fs');
    const { dirname } = await import('node:path');
    mkdirSync(dirname(dir), { recursive: true });
  }
  const client = dir === 'memory' ? new PGlite() : new PGlite(dir);
  await client.waitReady;
  const db = drizzle(client, { schema }) as unknown as Db;
  return {
    db,
    kind: 'pglite',
    exec: async (script) => {
      await client.exec(script);
    },
    close: async () => {
      await client.close();
    },
  };
}

/** Applies pending migrations, tracked in `_migrations`. Idempotent. */
export async function migrate(h: DbHandle): Promise<string[]> {
  await h.exec('CREATE TABLE IF NOT EXISTS _migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const applied = new Set(
    (await rows<{ id: string }>(h.db, sql`SELECT id FROM _migrations`)).map((r) => r.id),
  );
  const ran: string[] = [];
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    await h.exec(`BEGIN;\n${m.sql}\nINSERT INTO _migrations (id) VALUES ('${m.id}');\nCOMMIT;`);
    ran.push(m.id);
  }
  return ran;
}

/** Driver-agnostic raw query helper (postgres.js returns arrays; PGlite returns { rows }). */
export async function rows<T>(db: Db, query: ReturnType<typeof sql>): Promise<T[]> {
  const res = (await db.execute(query)) as unknown;
  if (Array.isArray(res)) return res as T[];
  return ((res as { rows?: T[] }).rows ?? []) as T[];
}
