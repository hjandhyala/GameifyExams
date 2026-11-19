'use client';
export function StreakBadge({ n, label, big }: { n: number; label?: string; big?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 font-bold tabular ${big ? 'text-lg' : 'text-sm'}`} aria-label={`${n}-day streak${label ? ` ${label}` : ''}`}>
      <span aria-hidden="true" className={n > 0 ? '' : 'grayscale opacity-50'}>
        🔥
      </span>
      {n}
      {label && <span className="font-medium text-muted">{label}</span>}
    </span>
  );
}
