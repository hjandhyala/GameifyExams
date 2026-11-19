'use client';
import { api, ApiError } from './api';
import { useStore, type OutboxEntry } from './store';

const BACKOFF = [1_000, 5_000, 30_000, 120_000, 600_000];
const MAX_AGE = 48 * 3_600_000;
let flushing = false;

/** Result outbox: submit with retry/backoff for up to 48h; server is idempotent (§8.7). */
export async function flushOutbox(): Promise<void> {
  if (flushing || typeof navigator !== 'undefined' && !navigator.onLine) return;
  flushing = true;
  try {
    const { outbox, dequeue, reschedule } = useStore.getState();
    const now = Date.now();
    for (const e of outbox) {
      if (now - e.createdAt > MAX_AGE) {
        dequeue(e.id);
        continue;
      }
      if (e.nextAt > now) continue;
      try {
        const r = await api.submitResult(e.body);
        const st = useStore.getState();
        const save = st.loadDay(e.date)[e.key];
        if (save) st.putSave(e.date, e.key, { ...save, submitted: true, globalStats: r.stats });
        dequeue(e.id);
        window.dispatchEvent(new CustomEvent('pd:result-submitted', { detail: { key: e.key, date: e.date, stats: r.stats } }));
      } catch (err) {
        const retryable = !(err instanceof ApiError) || err.retryable;
        if (!retryable) dequeue(e.id);
        else reschedule(e.id, now + (BACKOFF[e.attempts] ?? 3_600_000));
      }
    }
  } finally {
    flushing = false;
  }
}

export function enqueueResult(e: Omit<OutboxEntry, 'attempts' | 'nextAt' | 'createdAt'>) {
  useStore.getState().enqueue({ ...e, attempts: 0, nextAt: 0, createdAt: Date.now() });
  void flushOutbox();
}
