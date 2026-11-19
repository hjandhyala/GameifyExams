import 'server-only';
import { engineFor, type GameId, type HistoryRecord, type ISODate, type TrackId } from '@prepdle/core';
import { createHash } from 'node:crypto';
import { getRepo } from './db';
import { decrypt, encrypt } from './crypto';
import { TRANSFER_KEY } from './env';
import { AppError } from './errors';
import { isValidDid } from './device';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const codeHash = (code: string) => createHash('sha256').update(`transfer:${code}`).digest();
export const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Server-side history → compact HistoryRecord[] for client restore (§8.8). */
export async function deviceHistory(hash: Buffer, since?: ISODate): Promise<HistoryRecord[]> {
  const repo = await getRepo();
  const rows = await repo.deviceHistory(hash, since);
  return rows.map((r) => {
    const rec: HistoryRecord = { d: r.date, t: r.track as TrackId, g: r.gameId as GameId, p: r.passed ? 1 : 0, b: r.bucket };
    if (engineFor(r.gameId as GameId).id === 'gauntlet') {
      const o = r.outcome as { points?: number; perQuestion?: { correct: boolean; confidence: number }[] };
      rec.x = { pts: o.points, conf: o.perQuestion?.map((q) => q.confidence), ok: o.perQuestion?.map((q) => (q.correct ? 1 : 0)) };
    }
    return rec;
  });
}

export async function dayOutcomes(hash: Buffer, date: ISODate) {
  const repo = await getRepo();
  const rows = (await repo.deviceHistory(hash, date)).filter((r) => r.date === date);
  const out = [];
  for (const r of rows) {
    const full = await repo.getResult(r.puzzleId, hash);
    out.push({ puzzleId: r.puzzleId, track: r.track, gameId: r.gameId, version: r.version, passed: r.passed, bucket: r.bucket, outcome: r.outcome, transcript: full?.transcript ?? null });
  }
  return out;
}

export async function createTransferCode(did: string, hash: Buffer): Promise<{ code: string; display: string; expiresAt: string }> {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  const code = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  await (await getRepo()).createTransferCode(codeHash(code), hash, encrypt(TRANSFER_KEY(), did), expiresAt);
  return { code, display: `${code.slice(0, 3)}-${code.slice(3, 6)}-${code.slice(6)}`, expiresAt: expiresAt.toISOString() };
}

export async function redeemTransferCode(code: string): Promise<string> {
  const norm = normalizeCode(code);
  if (norm.length !== 9) throw new AppError('BAD_REQUEST', 'Codes have 9 characters');
  const blob = await (await getRepo()).redeemTransferCode(codeHash(norm));
  if (!blob) throw new AppError('NOT_FOUND', 'That code is invalid or expired');
  const did = decrypt(TRANSFER_KEY(), blob);
  if (!isValidDid(did)) throw new AppError('INTERNAL', 'Corrupt transfer code');
  return did;
}
