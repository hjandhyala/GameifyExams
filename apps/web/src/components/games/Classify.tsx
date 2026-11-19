'use client';
import { RESULT_EMOJI, type ClassifyPublic, type ClassifyReveal, type ClassifyStepFb } from '@prepdle/core';
import { useMemo, useState } from 'react';
import { haptic } from '@/client/haptics';
import { useToast } from '@/components/shell/Toast';
import type { EngineProps } from '@/components/game/types';

const LABEL_COLORS: Record<string, string> = {
  main: 'var(--tier-4)',
  inter: 'var(--tier-3)',
  premise: 'var(--tier-2)',
  background: '#8a8f98',
  opposing: '#8b5cf6',
  concession: 'var(--tier-1)',
  must: 'var(--tier-1)',
  could: 'var(--tier-3)',
  cannot: 'var(--tier-4)',
};

export default function Classify({ g }: EngineProps) {
  const pub = g.puzzle!.payload as ClassifyPublic;
  const steps = (g.save?.steps ?? []) as ClassifyStepFb[];
  const reveal = g.save?.reveal as ClassifyReveal | undefined;
  const checks = steps.filter((s): s is Extract<ClassifyStepFb, { kind: 'check' }> => s.kind === 'check');
  const transcript = (g.save?.transcript ?? []) as { type: string; assignment?: Record<string, string> }[];
  const lastAssignment = [...transcript].reverse().find((m) => m.type === 'check')?.assignment ?? {};
  const lastCheck = checks.at(-1);
  const done = g.phase === 'completed';
  const busy = g.phase === 'submitting';
  const { toast } = useToast();
  const [assign, setAssign] = useState<Record<string, string>>(() => ({ ...lastAssignment }));
  const [activeItem, setActiveItem] = useState<string | null>(pub.items[0]?.id ?? null);
  const labelById = useMemo(() => new Map(pub.labels.map((l) => [l.id, l])), [pub.labels]);
  const locked = (id: string) => pub.feedback === 'per_item' && !!lastCheck?.perItem?.[id];

  const setLabel = (itemId: string, labelId: string) => {
    if (done || locked(itemId)) return;
    setAssign((a) => ({ ...a, [itemId]: labelId }));
    haptic(5);
    if (pub.mode === 'anatomy') {
      const next = pub.items.find((it) => it.id !== itemId && !assign[it.id] && !locked(it.id));
      setActiveItem(next?.id ?? itemId);
    }
  };

  const mainCount = Object.entries(assign).filter(([id, l]) => l === 'main' && pub.items.some((i) => i.id === id)).length;
  const allLabeled = pub.items.every((it) => assign[it.id]);

  const check = async () => {
    if (!allLabeled) return toast('Label every part first');
    if (pub.mode === 'anatomy' && mainCount !== 1) toast(mainCount === 0 ? 'Tip: exactly one part is the main conclusion' : 'Tip: only one part can be the main conclusion');
    const r = await g.dispatchMove({ type: 'check', assignment: assign });
    if (!r.ok) return toast(r.reason);
    const last = g.latest()?.steps.filter((s) => (s as ClassifyStepFb).kind === 'check').at(-1) as Extract<ClassifyStepFb, { kind: 'check' }> | undefined;
    if (last && last.correctCount < last.total) {
      haptic([20, 30, 20]);
      toast(`${last.correctCount} of ${last.total} correct`);
    }
  };

  const finalLabel = (id: string) => (done && reveal ? reveal.key[id] : assign[id]);

  return (
    <div className="mx-auto max-w-[680px] px-4 pt-3">
      <div className="flex items-center justify-between">
        <p className="text-[15px] text-muted">{pub.intro}</p>
        <span className="shrink-0 text-sm font-semibold" aria-label={`${pub.maxChecks - checks.length} checks left`}>
          Checks {Array.from({ length: pub.maxChecks }).map((_, i) => (i < checks.length ? '●' : '○')).join('')}
        </span>
      </div>

      {pub.mode === 'verdict' && pub.premises && (
        <section className="mt-3 rounded-2xl bg-surface-2 px-4 py-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted">Premises</h2>
          <ol className="prose-game mt-1 list-decimal space-y-1 pl-5 text-[16px]">
            {pub.premises.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>
        </section>
      )}

      {pub.mode === 'anatomy' ? (
        <section className="prose-game mt-4 leading-[2.1]" aria-label="Argument">
          {pub.items.map((it) => {
            const l = finalLabel(it.id);
            const lab = l ? labelById.get(l) : undefined;
            const ok = done && reveal ? lastAssignment[it.id] === reveal.key[it.id] : locked(it.id);
            return (
              <button
                key={it.id}
                onClick={() => setActiveItem(it.id)}
                disabled={done}
                aria-pressed={activeItem === it.id}
                aria-label={`${it.text}${lab ? `, labeled ${lab.name}` : ', unlabeled'}${ok ? ', correct' : ''}`}
                className={`mr-1 inline rounded-md px-1 text-left transition ${activeItem === it.id && !done ? 'bg-accent/15 ring-2 ring-accent' : 'hover:bg-surface-2'}`}
                style={{ textDecoration: lab ? `underline 3px ${LABEL_COLORS[lab.id]}` : 'underline dotted 2px var(--border)', textUnderlineOffset: 6 }}
              >
                {it.text}
                {lab && (
                  <sup className="ml-1 rounded px-1 text-[11px] font-bold text-white no-underline" style={{ background: LABEL_COLORS[lab.id] }}>
                    {lab.short}
                    {ok ? ' ✓' : ''}
                  </sup>
                )}
              </button>
            );
          })}
        </section>
      ) : (
        <section className="mt-4 space-y-2" aria-label="Claims">
          {pub.items.map((it, idx) => (
            <div key={it.id} className="rounded-xl border border-border bg-surface px-3 py-2.5">
              <p className="text-[16px]">
                <span className="mr-1 font-bold text-muted">{String.fromCharCode(97 + idx)}.</span>
                {it.text}
              </p>
              <div role="radiogroup" aria-label={`Verdict for claim ${idx + 1}`} className="mt-2 grid grid-cols-3 gap-1.5">
                {pub.labels.map((l) => {
                  const sel = finalLabel(it.id) === l.id;
                  const wrongPick = done && reveal && lastAssignment[it.id] === l.id && reveal.key[it.id] !== l.id;
                  return (
                    <button
                      key={l.id}
                      role="radio"
                      aria-checked={sel}
                      disabled={done || busy}
                      onClick={() => setLabel(it.id, l.id)}
                      className={`min-h-10 rounded-lg border text-sm font-bold transition ${sel ? 'border-transparent text-white' : 'border-border bg-surface-2'} ${wrongPick ? 'line-through opacity-70' : ''}`}
                      style={sel ? { background: LABEL_COLORS[l.id] } : undefined}
                    >
                      {l.short}
                    </button>
                  );
                })}
              </div>
              {done && reveal && <p className="mt-2 text-sm text-muted">{reveal.explanations[it.id]}</p>}
            </div>
          ))}
        </section>
      )}

      {checks.length > 0 && (
        <section className="mt-4" aria-label="Check history">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted">History</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {checks.map((c, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="text-muted">#{i + 1}</span>
                <span aria-hidden="true">
                  {c.perItem
                    ? pub.items.map((it) => (c.perItem![it.id] ? RESULT_EMOJI.right : RESULT_EMOJI.wrong)).join('')
                    : `${RESULT_EMOJI.right.repeat(c.correctCount)}${RESULT_EMOJI.unused.repeat(c.total - c.correctCount)}`}
                </span>
                <span className="font-semibold">
                  {c.correctCount}/{c.total}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {done && reveal && pub.mode === 'anatomy' && (
        <section className="mt-4 space-y-2">
          {pub.items.map((it) => (
            <p key={it.id} className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
              <span className="font-bold" style={{ color: LABEL_COLORS[reveal.key[it.id]!] }}>
                {labelById.get(reveal.key[it.id]!)?.name}:
              </span>{' '}
              {reveal.explanations[it.id]}
            </p>
          ))}
        </section>
      )}

      {!done && (
        <div className="safe-bottom sticky bottom-0 mt-4 bg-bg pt-2">
          {pub.mode === 'anatomy' && (
            <div className="mb-2 grid grid-cols-3 gap-1.5" role="group" aria-label="Roles">
              {pub.labels.map((l) => (
                <button
                  key={l.id}
                  disabled={!activeItem || busy || (activeItem ? locked(activeItem) : true)}
                  onClick={() => activeItem && setLabel(activeItem, l.id)}
                  title={l.description}
                  className="min-h-10 rounded-lg px-1 text-[13px] font-bold text-white disabled:opacity-40"
                  style={{ background: LABEL_COLORS[l.id] }}
                >
                  {l.name}
                </button>
              ))}
            </div>
          )}
          <button className="btn btn-primary w-full" onClick={() => void check()} disabled={!allLabeled || busy}>
            {busy ? 'Checking…' : `Check (${pub.maxChecks - checks.length} left)`}
          </button>
        </div>
      )}
    </div>
  );
}
