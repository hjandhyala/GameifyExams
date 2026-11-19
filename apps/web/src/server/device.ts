import 'server-only';
import type { NextRequest } from 'next/server';
import { DEVICE_PEPPER } from './env';
import { hmac } from './crypto';

export const DEVICE_COOKIE = 'pd_did';
export const DEVICE_MAX_AGE = 400 * 86_400;
const DID_RE = /^[A-Za-z0-9_-]{22}$/;

export const isValidDid = (v: string | undefined): v is string => !!v && DID_RE.test(v);
export const deviceHash = (did: string): Buffer => hmac(DEVICE_PEPPER(), `did:${did}`);

/** Device identity for a request. The proxy guarantees the cookie exists; this validates it. */
export function requireDevice(req: NextRequest): { did: string; hash: Buffer } | null {
  const did = req.cookies.get(DEVICE_COOKIE)?.value;
  if (!isValidDid(did)) return null;
  return { did, hash: deviceHash(did) };
}

export function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '0.0.0.0';
}

/** IP hash with a daily-rotating salt (unlinkable across days). */
export function ipHash(req: NextRequest): string {
  const day = new Date().toISOString().slice(0, 10);
  return hmac(DEVICE_PEPPER(), `ip:${day}:${clientIp(req)}`).toString('base64url').slice(0, 22);
}
