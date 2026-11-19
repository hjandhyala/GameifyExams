import { sql } from 'drizzle-orm';
import { rows } from '@prepdle/db';
import { getHandle } from '@/server/db';
import { APP_VERSION } from '@/server/env';
import { json, route } from '@/server/http';

export const GET = route('health', async () => {
  let db = 'ok';
  try {
    const h = await getHandle();
    await rows(h.db, sql`SELECT 1`);
  } catch {
    db = 'down';
  }
  return json({ status: db === 'ok' ? 'ok' : 'degraded', db, version: APP_VERSION }, { status: db === 'ok' ? 200 : 503 });
});
