'use client';
import { useCountdown } from '@/client/today';

export function Countdown({ label = 'Next puzzles in' }: { label?: string }) {
  const t = useCountdown();
  return (
    <p className="text-center text-sm text-muted">
      {label} <span className="tabular font-semibold text-fg">{t || '--:--:--'}</span>
    </p>
  );
}
