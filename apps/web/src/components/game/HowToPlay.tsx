'use client';
import type { GameConfig, TrackId } from '@prepdle/core';
import { TIER_EMOJI, TIER_GLYPH } from '@prepdle/core';

function Demo({ engine }: { engine: GameConfig['engine'] }) {
  if (engine === 'jargon')
    return (
      <div className="flex gap-1" aria-hidden="true">
        {[...'CODON'].map((c, i) => (
          <span
            key={i}
            className={`anim-flip grid h-11 w-11 place-items-center rounded-md text-lg font-extrabold text-white ${i === 0 ? 'bg-correct' : i === 2 ? 'bg-present' : 'bg-absent'}`}
            style={{ animationDelay: `${i * 120}ms` }}
          >
            {c}
          </span>
        ))}
      </div>
    );
  if (engine === 'quartet')
    return (
      <div className="flex gap-2 text-sm" aria-hidden="true">
        {([1, 2, 3, 4] as const).map((t) => (
          <span key={t} className="rounded-lg px-2 py-1 font-bold text-white" style={{ background: `var(--tier-${t})` }}>
            {TIER_GLYPH[t]} {TIER_EMOJI[t]}
          </span>
        ))}
      </div>
    );
  if (engine === 'workup')
    return (
      <div className="text-sm" aria-hidden="true">
        <span className="rounded-md bg-surface-2 px-2 py-1">System ✓</span> <span className="rounded-md bg-surface-2 px-2 py-1">Etiology ◐</span>{' '}
        <span className="rounded-md bg-surface-2 px-2 py-1">Acuity ✗</span>
      </div>
    );
  if (engine === 'gauntlet')
    return (
      <div className="flex gap-2 text-sm font-semibold" aria-hidden="true">
        <span className="rounded-full border border-border px-3 py-1">Guess +1/0</span>
        <span className="rounded-full border border-border px-3 py-1">Likely +2/−1</span>
        <span className="rounded-full border border-border px-3 py-1">Sure +3/−2</span>
      </div>
    );
  return null;
}

export function HowToPlay({ config, onDone }: { config: GameConfig; track: TrackId; onDone: () => void }) {
  return (
    <div>
      <ul className="list-disc space-y-2 pl-5 text-[15px]">
        {config.howTo.map((h) => (
          <li key={h}>{h}</li>
        ))}
      </ul>
      <div className="mt-4 rounded-xl bg-surface-2 p-3">
        <Demo engine={config.engine} />
      </div>
      <p className="mt-4 text-sm text-muted">A new puzzle every day at local midnight. Same puzzle for everyone.</p>
      <button className="btn btn-primary mt-5 w-full" onClick={onDone}>
        Got it
      </button>
    </div>
  );
}
