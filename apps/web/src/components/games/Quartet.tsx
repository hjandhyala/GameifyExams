'use client';
import { TIER_GLYPH, TIER_NAME, type QuartetPublic, type QuartetReveal, type QuartetStepFb } from '@prepdle/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { haptic } from '@/client/haptics';
import { useToast } from '@/components/shell/Toast';
import type { EngineProps } from '@/components/game/types';

/** Font size that fits the longest word on one line inside the tile (container-query units). */
const tileFontSize = (label: string) => {
  const longest = Math.max(...label.split(/\s+/).map((w) => w.length));
  return `clamp(10.5px, calc((100cqi - 10px) / ${(longest * 0.62).toFixed(2)}), 16px)`;
};

function Band({ tier, label, labels, explanation }: { tier: 1 | 2 | 3 | 4; label: string; labels: string[]; explanation?: string }) {
  return (
    <div className="anim-pop rounded-xl px-3 py-2.5 text-center text-white" style={{ background: `var(--tier-${tier})` }} role="group" aria-label={`${TIER_NAME[tier]} group: ${label}`}>
      <div className="text-sm font-extrabold uppercase tracking-wide">
        <span aria-hidden="true">{TIER_GLYPH[tier]} </span>
        {label}
      </div>
      <div className="text-[13px] font-medium opacity-95">{labels.join(', ')}</div>
      {explanation && <div className="mt-1 text-xs opacity-90">{explanation}</div>}
    </div>
  );
}

export default function Quartet({ g }: EngineProps) {
  const pub = g.puzzle!.payload as QuartetPublic;
  const steps = (g.save?.steps ?? []) as QuartetStepFb[];
  const reveal = g.save?.reveal as QuartetReveal | undefined;
  const { toast } = useToast();
  const labelOf = useMemo(() => new Map(pub.tiles.map((t) => [t.id, t.label])), [pub.tiles]);
  const orderKey = `pd:quartet-order:${g.puzzle!.puzzleId}`;
  const [order, setOrder] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(orderKey) ?? 'null') as string[] | null;
      if (saved && saved.length === 16) return saved;
    } catch {}
    return pub.tiles.map((t) => t.id);
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [shake, setShake] = useState(false);
  const [focusIdx, setFocusIdx] = useState(0);
  const [announce, setAnnounce] = useState('');
  const gridRef = useRef<HTMLDivElement>(null);

  const solved = steps.filter((s): s is Extract<QuartetStepFb, { result: 'correct' }> => s.result === 'correct');
  const solvedIds = new Set(solved.flatMap((s) => s.tileIds));
  const mistakes = steps.filter((s) => s.result !== 'correct').length;
  const done = g.phase === 'completed';
  const remaining = order.filter((id) => !solvedIds.has(id));
  const busy = g.phase === 'submitting';

  useEffect(() => {
    try {
      sessionStorage.setItem(orderKey, JSON.stringify(order));
    } catch {}
  }, [order, orderKey]);

  const submit = useCallback(
    async (ids: string[]) => {
      const r = await g.dispatchMove({ type: 'guess', tileIds: ids });
      if (!r.ok) {
        toast(r.reason);
        return;
      }
      const st = (g.latest()?.steps ?? []) as QuartetStepFb[];
      const last = st[st.length - 1];
      if (last?.result === 'correct') {
        setSelected([]);
        setAnnounce(`Correct: ${last.label}, ${TIER_NAME[last.tier]} tier`);
        haptic(15);
      } else {
        setShake(true);
        setTimeout(() => setShake(false), 320);
        haptic([20, 30, 20]);
        const left = 4 - st.filter((s) => s.result !== 'correct').length;
        if (last?.result === 'one_away') toast('One away…');
        setAnnounce(`${last?.result === 'one_away' ? 'Incorrect, one away.' : 'Incorrect.'} ${left} mistakes remaining.`);
      }
    },
    [g, toast],
  );

  // Auto-finish: with three groups solved the last four tiles are submitted automatically.
  useEffect(() => {
    if (!done && !busy && solved.length === 3 && remaining.length === 4 && mistakes < 4) {
      const t = setTimeout(() => void submit(remaining), 450);
      return () => clearTimeout(t);
    }
  }, [solved.length, remaining.length, done, busy, mistakes, submit, remaining]);

  const toggle = (id: string) => {
    if (done || busy) return;
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 4 ? [...s, id] : s));
    haptic(5);
  };

  const shuffle = () => {
    const rest = [...remaining];
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j]!, rest[i]!];
    }
    setOrder([...order.filter((id) => solvedIds.has(id)), ...rest]);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const cols = 4;
    let i = focusIdx;
    if (e.key === 'ArrowRight') i = Math.min(remaining.length - 1, i + 1);
    else if (e.key === 'ArrowLeft') i = Math.max(0, i - 1);
    else if (e.key === 'ArrowDown') i = Math.min(remaining.length - 1, i + cols);
    else if (e.key === 'ArrowUp') i = Math.max(0, i - cols);
    else if ((e.key === 'Enter' && (e.metaKey || e.ctrlKey)) && selected.length === 4) {
      e.preventDefault();
      void submit(selected);
      return;
    } else if (e.key === 's' || e.key === 'S') {
      shuffle();
      return;
    } else if (e.key === 'Escape') {
      setSelected([]);
      return;
    } else return;
    e.preventDefault();
    setFocusIdx(i);
    gridRef.current?.querySelectorAll<HTMLButtonElement>('button[data-tile]')[i]?.focus();
  };

  const groupsToShow = done && reveal ? reveal.groups : solved.map((s) => ({ id: s.groupId, tier: s.tier, label: s.label, tileIds: s.tileIds, explanation: s.explanation }));

  return (
    <div className="mx-auto max-w-[560px] px-4 pt-4">
      <p className="mb-3 text-center text-[15px] text-muted">
        {pub.topicHint ? <>Create four groups of four · <span className="font-semibold text-fg">{pub.topicHint}</span></> : 'Create four groups of four'}
      </p>
      <div className="space-y-2">
        {groupsToShow.map((gr) => (
          <Band key={gr.id} tier={gr.tier} label={gr.label} labels={gr.tileIds.map((id) => labelOf.get(id) ?? '')} explanation={done ? gr.explanation : undefined} />
        ))}
      </div>
      {!done && (
        <div
          ref={gridRef}
          role="grid"
          aria-label="Tiles"
          onKeyDown={onKeyDown}
          className={`no-select mt-2 grid grid-cols-4 gap-2 ${shake ? 'anim-shake' : ''}`}
        >
          {remaining.map((id, i) => {
            const label = labelOf.get(id) ?? '';
            const sel = selected.includes(id);
            return (
              <button
                key={id}
                data-tile
                type="button"
                aria-pressed={sel}
                tabIndex={i === focusIdx ? 0 : -1}
                onFocus={() => setFocusIdx(i)}
                onClick={() => toggle(id)}
                disabled={busy}
                style={{ containerType: 'inline-size' }}
                className={`flex min-h-16 items-center justify-center rounded-xl px-1 py-2 text-center font-bold leading-tight transition-all sm:min-h-20 ${
                  sel ? '-translate-y-0.5 bg-fg text-bg shadow-md' : 'bg-surface-2 text-fg'
                }`}
              >
                <span style={{ fontSize: tileFontSize(label), overflowWrap: 'break-word' }}>{label}</span>
              </button>
            );
          })}
        </div>
      )}
      <div aria-live="polite" className="sr-only">
        {announce || (selected.length ? `Selected ${selected.length} of 4` : '')}
      </div>
      {!done && (
        <>
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted">
            Mistakes remaining:
            <span className="flex gap-1.5" aria-label={`${4 - mistakes} mistakes remaining`}>
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`h-3 w-3 rounded-full ${i < 4 - mistakes ? 'bg-fg' : 'bg-border'}`} />
              ))}
            </span>
          </div>
          <div className="safe-bottom sticky bottom-0 mt-4 flex justify-center gap-2 bg-bg pt-2">
            <button className="btn" onClick={shuffle} disabled={busy}>
              Shuffle
            </button>
            <button className="btn" onClick={() => setSelected([])} disabled={!selected.length || busy}>
              Deselect all
            </button>
            <button className="btn btn-primary" onClick={() => void submit(selected)} disabled={selected.length !== 4 || busy}>
              {busy ? '…' : 'Submit'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
