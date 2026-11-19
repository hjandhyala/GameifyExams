import 'server-only';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

export const hmac = (key: string, data: string): Buffer => createHmac('sha256', key).update(data).digest();
const key32 = (k: string) => createHash('sha256').update(k).digest();

export function encrypt(keyMaterial: string, plaintext: string): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key32(keyMaterial), iv);
  const body = Buffer.concat([c.update(plaintext, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]);
}

export function decrypt(keyMaterial: string, blob: Buffer): string {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const d = createDecipheriv('aes-256-gcm', key32(keyMaterial), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(blob.subarray(28)), d.final()]).toString('utf8');
}

export const randomToken = (bytes = 16) => randomBytes(bytes).toString('base64url');
