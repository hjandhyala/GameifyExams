import 'server-only';
import { addDays, utcISO } from '@prepdle/core';
import { runPsychometrics, schedule } from '@prepdle/pipeline/publish';
import { getRepo } from './db';
import { LAUNCH_DATE } from './env';
import { log } from './log';
import { warmSecretPut } from './puzzles';

export async function alert(severity: 'P1' | 'P2', title: string, detail: unknown): Promise<void> {
  log(severity === 'P1' ? 'error' : 'warn', `ALERT ${severity}: ${title}`, { detail });
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: `[${severity}] ${title}\n${JSON.stringify(detail).slice(0, 1500)}` }) });
  } catch (e) {
    log('error', 'alert webhook failed', { error: (e as Error).message });
  }
}

export const CRON_JOBS = {
  /** Buffer days per slot; auto-fill slots ≤ 48h out from the reserve (§12.7, §15.3). */
  async 'buffer-check'() {
    const repo = await getRepo();
    const today = utcISO(Date.now());
    const fill = await schedule(repo, { from: today, days: 3, launchDate: LAUNCH_DATE, log: (m) => log('info', m) });
    if (fill.filled.length) await alert('P2', 'Reserve items auto-assigned', fill.filled.map((f) => f.id));
    if (fill.unfilled.length) await alert('P1', 'Unfilled puzzle slots within 48h', fill.unfilled);
    const buffers = await repo.bufferDays(today);
    const low = buffers.filter((b) => b.days < 14);
    if (low.length) await alert('P2', 'Content buffer below 14 days', low);
    return { filled: fill.filled.length, unfilled: fill.unfilled.length, buffers };
  },
  async 'lock-window'() {
    const repo = await getRepo();
    return { locked: await repo.lockWindow(addDays(utcISO(Date.now()), 7)) };
  },
  /** Pre-load tomorrow's secrets into Redis so evaluate survives a DB outage (§15.4). */
  async 'warm-secrets'() {
    const repo = await getRepo();
    const today = utcISO(Date.now());
    let n = 0;
    for (const d of [today, addDays(today, 1)]) {
      for (const p of await repo.puzzlesOnDate(d)) {
        const v = await repo.getVersion(p.id, p.currentVersion);
        if (v) {
          await warmSecretPut(v);
          n++;
        }
      }
    }
    return { warmed: n };
  },
  async 'aggregates-reconcile'() {
    const repo = await getRepo();
    const y = addDays(utcISO(Date.now()), -1);
    const ps = await repo.puzzlesInRange(addDays(y, -1), y);
    await repo.reconcileAggregates(ps.map((p) => p.id));
    return { reconciled: ps.length };
  },
  async psychometrics() {
    const repo = await getRepo();
    const r = await runPsychometrics(repo);
    const serious = r.flags.filter((f) => f.flag === 'possible_miskey');
    if (serious.length) await alert('P2', 'Possible miskeyed items', serious);
    return r;
  },
  async prune() {
    return (await getRepo()).prune();
  },
} as const;

export type CronJob = keyof typeof CRON_JOBS;
