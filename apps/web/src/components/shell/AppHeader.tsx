'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';

export function IconButton({ label, onClick, href, children }: { label: string; onClick?: () => void; href?: string; children: ReactNode }) {
  const cls = 'grid h-11 w-11 place-items-center rounded-full text-fg hover:bg-surface-2';
  return href ? (
    <Link href={href} aria-label={label} className={cls}>
      {children}
    </Link>
  ) : (
    <button type="button" aria-label={label} onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

export const Icons = {
  back: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  ),
  help: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" />
      <path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6" />
      <circle cx="12" cy="17" r=".6" fill="currentColor" />
    </svg>
  ),
  stats: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M5 20V11M12 20V5M19 20v-7" />
    </svg>
  ),
  settings: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  share: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v13M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </svg>
  ),
  backspace: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1zM17 9l-5 6M12 9l5 6" />
    </svg>
  ),
};

export function AppHeader({
  title,
  badge,
  backHref,
  onHelp,
  onStats,
  right,
}: {
  title: ReactNode;
  badge?: string;
  backHref?: string;
  onHelp?: () => void;
  onStats?: () => void;
  right?: ReactNode;
}) {
  return (
    <header className="safe-top sticky top-0 z-30 border-b border-border bg-bg/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-1 px-2">
        {backHref ? (
          <IconButton label="Back" href={backHref}>
            {Icons.back}
          </IconButton>
        ) : (
          <span className="w-2" />
        )}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {badge && <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-on-accent">{badge}</span>}
          <h1 className="truncate text-lg font-bold">{title}</h1>
        </div>
        {right}
        {onHelp && (
          <IconButton label="How to play" onClick={onHelp}>
            {Icons.help}
          </IconButton>
        )}
        {onStats ? (
          <IconButton label="Statistics" onClick={onStats}>
            {Icons.stats}
          </IconButton>
        ) : (
          <IconButton label="Statistics" href="/stats">
            {Icons.stats}
          </IconButton>
        )}
        <IconButton label="Settings" href="/settings">
          {Icons.settings}
        </IconButton>
      </div>
    </header>
  );
}
