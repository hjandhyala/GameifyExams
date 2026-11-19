import type { GameSave } from '@/client/store';

export function StatusDots({ statuses }: { statuses: (GameSave | undefined)[] }) {
  const label = statuses.map((s) => (!s ? 'not started' : s.status === 'in_progress' ? 'in progress' : s.status === 'won' ? 'passed' : 'missed')).join(', ');
  return (
    <span className="flex gap-1.5" role="img" aria-label={`Today: ${label}`}>
      {statuses.map((s, i) => (
        <span
          key={i}
          className={`grid h-4 w-4 place-items-center rounded-full border text-[9px] font-black ${
            !s ? 'border-border' : s.status === 'in_progress' ? 'border-accent bg-accent/30' : s.status === 'won' ? 'border-correct bg-correct text-white' : 'border-wrong bg-wrong text-white'
          }`}
        >
          {s && s.status !== 'in_progress' ? (s.status === 'won' ? '✓' : '✗') : ''}
        </span>
      ))}
    </span>
  );
}
