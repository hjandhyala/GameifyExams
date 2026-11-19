import { CATALOG } from './catalog';
import { shortDateLabel } from './date';
import type { GameId, ISODate, TrackId } from './types';

export const SHARE_DOMAIN = 'examdle.com';
export const BRAND = 'Examdle';

export function buildGameShare(p: {
  track: TrackId;
  gameId: GameId;
  number: number;
  scoreLabel: string;
  lines: string[];
  streak: number;
  domain?: string;
}): string {
  const t = CATALOG[p.track];
  const g = t.games.find((x) => x.gameId === p.gameId)!;
  const header = `${BRAND} · ${t.short} ${g.name} #${p.number} · ${p.scoreLabel}`;
  const footer = [p.streak > 0 ? `🔥${p.streak}` : null, `${p.domain ?? SHARE_DOMAIN}/${p.track}`].filter(Boolean).join(' · ');
  return [header, ...p.lines, footer].join('\n');
}

export function buildDailyCard(p: {
  track: TrackId;
  date: ISODate;
  number: number;
  games: { gameId: GameId; scoreLabel: string | null }[];
  streak: number;
  domain?: string;
}): string {
  const t = CATALOG[p.track];
  const lines = [`${BRAND} ${t.short} · ${shortDateLabel(p.date)} · #${p.number}`];
  for (const g of t.games) {
    const r = p.games.find((x) => x.gameId === g.gameId);
    lines.push(`${g.icon} ${g.name.padEnd(9)} ${r?.scoreLabel ?? '—'}`);
  }
  if (p.streak > 0) lines.push(`🔥 ${p.streak}-day streak`);
  lines.push(`${p.domain ?? SHARE_DOMAIN}/${p.track}`);
  return lines.join('\n');
}
