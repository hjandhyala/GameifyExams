'use client';
import type { Clue, WorkupPublic, WorkupReveal, WorkupStepFb } from '@prepdle/core';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { haptic } from '@/client/haptics';
import { prepare, search } from '@/client/match';
import { useToast } from '@/components/shell/Toast';
import type { EngineProps } from '@/components/game/types';

export function ClueCard({ clue, index, fresh }: { clue: Clue; index: number; fresh?: boolean }) {
  return (
    <div className={`rounded-xl border border-border bg-surface px-4 py-3 ${fresh ? 'anim-slide-up anim-highlight' : ''}`}>
      <div className="text-xs font-bold uppercase tracking-wider text-muted">
        {index + 1} · {clue.stage}
      </div>
      <p className="prose-game mt-0.5">{clue.text}</p>
      {clue.table && (
        <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-lg bg-surface-2 px-3 py-2 text-[15px]">
          {clue.table.map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-muted">{row.label}</dt>
              <dd className="tabular text-right font-semibold">
                {row.value}
                {row.unit ? ` ${row.unit}` : ''}
                {row.flag && <span className={`ml-1.5 rounded px-1 text-xs font-black ${row.flag === 'H' ? 'bg-wrong/15 text-wrong' : 'bg-tier-2/15 text-tier-2'}`}>{row.flag}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

const MATCH_GLYPH = { yes: '✓', partial: '◐', no: '✗' } as const;
const MATCH_CLS = { yes: 'bg-correct/15 text-correct', partial: 'bg-present/20 text-[color:var(--fb-present)]', no: 'bg-surface-2 text-muted' } as const;

function GuessRow({ step, name, labels }: { step: WorkupStepFb; name: string; labels: Map<string, string> }) {
  if (step.kind === 'skip') return <div className="px-2 text-sm font-semibold text-muted">⚫ Skipped</div>;
  const icon = step.result === 'correct' ? '🟢' : step.result === 'close' ? '🟡' : '🔴';
  return (
    <div className="anim-slide-up flex flex-wrap items-center gap-1.5 px-1" aria-label={`Guess ${name}: ${step.result}`}>
      <span className="mr-1 font-bold">
        <span aria-hidden="true">{icon} </span>
        {name}
        {step.result === 'close' && <span className="ml-1 text-sm font-medium text-muted">(close: be more specific or consider a related entity)</span>}
      </span>
      {step.result !== 'correct' &&
        step.attributes?.map((a) => (
          <span key={a.key} className={`rounded-md px-2 py-0.5 text-xs font-semibold ${MATCH_CLS[a.match]}`} title={a.guessValue}>
            {labels.get(a.key) ?? a.key} {MATCH_GLYPH[a.match]}
          </span>
        ))}
    </div>
  );
}

export default function Workup({ g }: EngineProps) {
  const pub = g.puzzle!.payload as WorkupPublic;
  const steps = (g.save?.steps ?? []) as WorkupStepFb[];
  const reveal = g.save?.reveal as WorkupReveal | undefined;
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [mobileSheet, setMobileSheet] = useState(false);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const done = g.phase === 'completed';
  const busy = g.phase === 'submitting';
  const labels = useMemo(() => new Map(pub.attributes.map((a) => [a.key, a.label])), [pub.attributes]);
  const prepared = useMemo(() => (g.vocab ? prepare(g.vocab.entries) : []), [g.vocab]);
  const guessed = new Set(steps.map((s) => s.entityId).filter(Boolean) as string[]);
  const results = useMemo(() => search(prepared, q, 8), [prepared, q]);
  const nameOf = (id?: string) => (id ? g.vocabMap?.get(id)?.name ?? id : '');
  const cluesShown = 1 + steps.filter((s) => s.nextClue).length;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [steps.length]);

  // Keep suggestions above the on-screen keyboard (§6.6).
  useEffect(() => {
    if (!mobileSheet || !window.visualViewport) return;
    const vv = window.visualViewport;
    const el = document.getElementById('workup-sheet');
    const fit = () => el && (el.style.height = `${vv.height}px`);
    fit();
    vv.addEventListener('resize', fit);
    return () => vv.removeEventListener('resize', fit);
  }, [mobileSheet]);

  const choose = async (id: string) => {
    if (guessed.has(id)) return toast('Already guessed');
    setQ('');
    setOpen(false);
    setMobileSheet(false);
    const r = await g.dispatchMove({ type: 'guess', entityId: id });
    if (!r.ok) return toast(r.reason);
    const last = g.latest()?.steps.at(-1) as WorkupStepFb | undefined;
    haptic(last?.result === 'correct' ? [10, 40, 10] : 20);
    if (last?.result === 'close') toast('Close! Be more specific.');
  };

  const skip = async () => {
    const r = await g.dispatchMove({ type: 'skip' });
    if (!r.ok) toast(r.reason);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!results.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[active];
      if (r) void choose(r.e.id);
    } else if (e.key === 'Escape') setOpen(false);
  };

  const searchBox = (autoFocus: boolean) => (
    <div className="relative">
      <input
        ref={autoFocus ? undefined : inputRef}
        autoFocus={autoFocus}
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
        aria-autocomplete="list"
        aria-label={pub.prompt}
        value={q}
        disabled={busy || done}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={(e) => {
          if (!autoFocus && window.matchMedia('(pointer: coarse)').matches) {
            e.currentTarget.blur();
            setMobileSheet(true);
          } else setOpen(true);
        }}
        onKeyDown={onKey}
        placeholder={`🔍 ${pub.prompt}…`}
        className="h-12 w-full rounded-full border border-border bg-surface px-4 text-base outline-none focus:border-accent"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      {open && results.length > 0 && (autoFocus || !mobileSheet) && (
        <ul
          id={listId}
          role="listbox"
          className={`${autoFocus ? 'mt-2' : 'absolute bottom-14 left-0 right-0'} z-20 max-h-80 overflow-y-auto rounded-2xl border border-border bg-surface py-1 shadow-xl`}
        >
          {results.map((r, i) => (
            <li
              key={r.e.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              aria-disabled={guessed.has(r.e.id)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void choose(r.e.id)}
              className={`cursor-pointer px-4 py-2.5 ${i === active ? 'bg-surface-2' : ''} ${guessed.has(r.e.id) ? 'opacity-40' : ''}`}
            >
              <span className="font-semibold">{r.e.name}</span>
              {r.via && <span className="ml-2 text-sm text-muted">{r.via} →</span>}
            </li>
          ))}
        </ul>
      )}
      {open && q && results.length === 0 && g.vocab && (autoFocus || !mobileSheet) && <p className="mt-2 px-4 text-sm text-muted">No matches. Try another name or abbreviation.</p>}
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl px-4 pt-3 lg:grid lg:grid-cols-[3fr_2fr] lg:gap-6">
      <section aria-label="Clues">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">{pub.prompt}</h2>
          <span className="text-sm text-muted" aria-label={`Clue ${Math.min(cluesShown, 6)} of 6`}>
            Clue {Math.min(cluesShown, 6)} of 6{' '}
            <span aria-hidden="true">
              {Array.from({ length: 6 })
                .map((_, i) => (i < cluesShown ? '●' : '○'))
                .join('')}
            </span>
          </span>
        </div>
        <div className="space-y-2.5" aria-live="polite">
          <ClueCard clue={pub.firstClue} index={0} />
          {steps.map((s, i) => (
            <div key={i} className="space-y-2.5">
              <GuessRow step={s} name={nameOf(s.entityId)} labels={labels} />
              {s.nextClue && <ClueCard clue={s.nextClue} index={i + 1} fresh={i === steps.length - 1} />}
            </div>
          ))}
          {done && reveal && (
            <div className={`rounded-xl px-4 py-3 text-center font-bold ${g.save?.status === 'won' ? 'bg-correct/15 text-correct' : 'bg-wrong/10 text-wrong'}`}>
              {g.save?.status === 'won' ? '✓ ' : 'Answer: '}
              {reveal.answerName}
            </div>
          )}
          <div ref={endRef} />
        </div>
      </section>
      <aside className="mt-4 hidden text-sm text-muted lg:block">
        <h3 className="font-bold text-fg">Reading the feedback</h3>
        <ul className="mt-2 space-y-1">
          <li>✓ attribute matches the answer</li>
          <li>◐ partial overlap (e.g. one of several systems)</li>
          <li>✗ no match</li>
          <li>🟡 a closely related answer: be more specific</li>
        </ul>
        <p className="mt-3">Attributes: {pub.attributes.map((a) => a.label).join(' · ')}</p>
      </aside>
      {!done && (
        <div className="safe-bottom sticky bottom-0 col-span-2 mt-4 flex gap-2 bg-bg pt-2">
          <div className="flex-1">{searchBox(false)}</div>
          <button className="btn h-12" onClick={() => void skip()} disabled={busy}>
            Skip
          </button>
        </div>
      )}
      {mobileSheet && (
        <div id="workup-sheet" className="fixed inset-x-0 top-0 z-50 flex flex-col bg-bg p-4" role="dialog" aria-modal="true" aria-label={pub.prompt}>
          <div className="mb-2 flex items-center gap-2">
            <button className="btn" onClick={() => setMobileSheet(false)}>
              Cancel
            </button>
            <span className="text-sm text-muted">Clue {Math.min(cluesShown, 6)} of 6</span>
          </div>
          <div className="overflow-y-auto">{searchBox(true)}</div>
        </div>
      )}
    </div>
  );
}
