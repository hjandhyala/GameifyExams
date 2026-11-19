import type { PuzzleEnvelope, PuzzleStats } from '@prepdle/core';
import { debugNowHeader } from './debug';

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
  get retryable() {
    return this.status === 0 || this.status >= 500 || this.status === 429;
  }
}

let skewWarned = false;
export let serverSkewMs = 0;

async function request<T>(path: string, init: RequestInit & { retries?: number } = {}): Promise<T> {
  const retries = init.retries ?? 0;
  const delays = [250, 1000, 3000];
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(path, {
        ...init,
        credentials: 'same-origin',
        headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...debugNowHeader(), ...(init.headers ?? {}) },
      });
    } catch {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delays[attempt] ?? 3000));
        continue;
      }
      throw new ApiError('NETWORK', 0, 'You appear to be offline.');
    }
    const st = res.headers.get('x-server-time');
    if (st) {
      serverSkewMs = Date.now() - Date.parse(st);
      if (!skewWarned && Math.abs(serverSkewMs) > 90 * 60_000) {
        skewWarned = true;
        window.dispatchEvent(new CustomEvent('pd:clock-skew'));
      }
    }
    if (res.ok) return (await res.json()) as T;
    let payload: { error?: { code: string; message: string } & Record<string, unknown> } = {};
    try {
      payload = await res.json();
    } catch {}
    const e = payload.error;
    const err = new ApiError(e?.code ?? 'HTTP_' + res.status, res.status, e?.message ?? res.statusText, e ?? {});
    if (err.retryable && attempt < retries && res.status !== 429) {
      await new Promise((r) => setTimeout(r, delays[attempt] ?? 3000));
      continue;
    }
    throw err;
  }
}

export interface DayManifest {
  date: string;
  number: number;
  puzzles: { track: string; gameId: string; puzzleId: string; version: number; difficulty: number; status: string }[];
}

export interface EvaluateResponse<S = unknown, O = unknown, R = unknown> {
  status: 'in_progress' | 'won' | 'lost';
  steps: S[];
  outcome?: O;
  reveal?: R;
}

export const api = {
  day: (date: string) => request<DayManifest>(`/api/v1/days/${date}`, { retries: 2 }),
  puzzle: (track: string, gameId: string, date: string) => request<PuzzleEnvelope>(`/api/v1/puzzles/${track}/${gameId}/${date}`, { retries: 2 }),
  evaluate: (track: string, gameId: string, date: string, body: { version: number; transcript: unknown[]; flags?: { hardMode?: boolean } }) =>
    request<EvaluateResponse>(`/api/v1/puzzles/${track}/${gameId}/${date}/evaluate`, { method: 'POST', body: JSON.stringify(body), retries: 3 }),
  submitResult: (body: unknown) =>
    request<{ outcome: unknown; bucket: string; passed: boolean; stats: PuzzleStats }>(`/api/v1/results`, { method: 'POST', body: JSON.stringify(body) }),
  stats: (puzzleId: string) => request<PuzzleStats>(`/api/v1/stats/${puzzleId}`),
  report: (body: unknown) => request<{ accepted: boolean }>(`/api/v1/reports`, { method: 'POST', body: JSON.stringify(body) }),
  meSummary: () => request<{ firstSeen: string | null; resultsCount: number }>(`/api/v1/me/summary`),
  meHistory: () => request<{ history: import('@prepdle/core').HistoryRecord[] }>(`/api/v1/me/history`),
  meDay: (date: string) =>
    request<{ results: { puzzleId: string; track: string; gameId: string; version: number; passed: boolean; bucket: string; outcome: unknown; transcript: unknown[] | null }[] }>(`/api/v1/me/day/${date}`),
  createTransfer: () => request<{ code: string; display: string; expiresAt: string }>(`/api/v1/me/transfer-codes`, { method: 'POST', body: '{}' }),
  redeemTransfer: (code: string) => request<{ ok: boolean }>(`/api/v1/me/transfer-codes/redeem`, { method: 'POST', body: JSON.stringify({ code }) }),
  deleteMe: () => request<{ deleted: boolean }>(`/api/v1/me`, { method: 'DELETE' }),
};
