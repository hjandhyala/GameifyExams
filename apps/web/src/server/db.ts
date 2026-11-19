import 'server-only';
import { addDays, utcISO } from '@prepdle/core';
import { createDb, migrate, Repo, type DbHandle } from '@prepdle/db';
import { DEV_FEATURES, LAUNCH_DATE } from './env';
import { log } from './log';

interface DbState {
  handle?: Promise<DbHandle>;
  ensuredFor?: string;
  ensuring?: Promise<unknown>;
}
const g = globalThis as unknown as { __examdleDb?: DbState };
const state: DbState = (g.__examdleDb ??= {});

async function open(): Promise<DbHandle> {
  const h = await createDb();
  if (h.kind === 'pglite' || process.env.AUTO_MIGRATE === '1') {
    const ran = await migrate(h);
    if (ran.length) log('info', 'migrations applied', { ran });
  }
  return h;
}

/**
 * Repository for request handlers. In dev/preview (fixtures enabled) this also makes sure puzzles exist
 * around today by seeding fixture content and scheduling with reuse (§18.1).
 */
function handle(): Promise<DbHandle> {
  state.handle ??= open().catch((e) => {
    state.handle = undefined; // retry on next request
    throw e;
  });
  return state.handle;
}

export async function getRepo(): Promise<Repo> {
  const h = await handle();
  if (DEV_FEATURES) {
    const today = utcISO(Date.now());
    if (state.ensuredFor !== today) {
      state.ensuring ??= (async () => {
        const { ensureDevContent } = await import('@prepdle/pipeline/publish');
        const r = await ensureDevContent(h, { today, launchDate: LAUNCH_DATE, back: 7, ahead: 14 });
        if (r.filled.length) log('info', 'dev content scheduled', { filled: r.filled.length, unfilled: r.unfilled.length });
        state.ensuredFor = today;
      })().finally(() => {
        state.ensuring = undefined;
      });
      await state.ensuring;
    }
  }
  return new Repo(h.db);
}

export const getHandle = handle;

export const horizon = (from: string, days: number) => addDays(from, days);
