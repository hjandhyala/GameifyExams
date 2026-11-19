'use client';
export function Distribution({ distribution, order, highlight, labels }: { distribution: Record<string, number>; order: readonly string[]; highlight?: string; labels?: Record<string, string> }) {
  const total = order.reduce((a, b) => a + (distribution[b] ?? 0), 0);
  const max = Math.max(1, ...order.map((b) => distribution[b] ?? 0));
  return (
    <div>
      <div className="space-y-1" role="img" aria-label={order.map((b) => `${labels?.[b] ?? b}: ${distribution[b] ?? 0}`).join(', ')}>
        {order.map((b) => {
          const n = distribution[b] ?? 0;
          const pct = total ? Math.round((n / total) * 100) : 0;
          return (
            <div key={b} className="flex items-center gap-2 text-sm">
              <span className="w-8 shrink-0 text-right font-semibold tabular">{labels?.[b] ?? b}</span>
              <div className="flex-1">
                <div
                  className={`flex h-6 min-w-7 items-center justify-end rounded px-1.5 text-xs font-bold tabular ${b === highlight ? 'bg-accent text-on-accent' : 'bg-surface-2 text-fg'}`}
                  style={{ width: `${Math.max(8, (n / max) * 100)}%` }}
                >
                  {n}
                </div>
              </div>
              <span className="w-9 shrink-0 text-xs text-muted tabular">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
