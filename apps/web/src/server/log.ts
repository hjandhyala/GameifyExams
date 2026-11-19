import 'server-only';

type Level = 'debug' | 'info' | 'warn' | 'error';

/** Structured JSON logs (§15.1). Never pass cookies, device ids, raw IPs, bodies or transcripts. */
export function log(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  if (level === 'debug' && process.env.NODE_ENV === 'production') return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}
