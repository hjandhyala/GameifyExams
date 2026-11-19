import type { ISODate } from './types';

const DAY_MS = 86_400_000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== 'string') return false;
  const m = ISO_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Local calendar date in the given IANA zone (defaults to the runtime's zone). */
export function localDate(now: Date = new Date(), tz?: string): ISODate {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

const toUTCDays = (d: ISODate): number => {
  const [y, m, dd] = d.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, dd) / DAY_MS;
};

/** Whole days from a to b (DST-proof). */
export const daysBetween = (a: ISODate, b: ISODate): number => toUTCDays(b) - toUTCDays(a);

export const addDays = (d: ISODate, n: number): ISODate =>
  new Date((toUTCDays(d) + n) * DAY_MS).toISOString().slice(0, 10);

/** 0 = Sunday … 6 = Saturday */
export const weekday = (d: ISODate): number => new Date(toUTCDays(d) * DAY_MS).getUTCDay();

export const utcISO = (ms: number): ISODate => new Date(ms).toISOString().slice(0, 10);

export const puzzleNumber = (d: ISODate, launchDate: ISODate): number => daysBetween(launchDate, d) + 1;

export function msUntilLocalMidnight(now: Date = new Date()): number {
  const t = new Date(now);
  t.setHours(24, 0, 0, 0);
  return t.getTime() - now.getTime();
}

/** Dates that exist somewhere on Earth right now (UTC−12 … UTC+14). */
export function playableWindow(nowMs: number = Date.now()): { earliest: ISODate; latest: ISODate } {
  return { earliest: utcISO(nowMs - 12 * 3_600_000), latest: utcISO(nowMs + 14 * 3_600_000) };
}

export function isPlayable(d: ISODate, launchDate: ISODate, nowMs: number = Date.now()): boolean {
  const { earliest, latest } = playableWindow(nowMs);
  return d >= launchDate && d >= earliest && d <= latest;
}

/** Results/evaluate accept a one-day grace for games started before local midnight. */
export function isSubmittable(d: ISODate, launchDate: ISODate, nowMs: number = Date.now()): boolean {
  const { earliest, latest } = playableWindow(nowMs);
  return d >= launchDate && d >= addDays(earliest, -1) && d <= latest;
}

export const compactDate = (d: ISODate): string => d.replaceAll('-', '');

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Wed Nov 18" */
export function shortDateLabel(d: ISODate): string {
  const [, m, dd] = d.split('-').map(Number) as [number, number, number];
  return `${DOW[weekday(d)]} ${MON[m - 1]} ${dd}`;
}
