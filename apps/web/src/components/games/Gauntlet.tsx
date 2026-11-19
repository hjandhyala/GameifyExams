'use client';
import { pointsFor, type GauntletPublic, type GauntletStepFb, type McqPublic } from '@prepdle/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { haptic } from '@/client/haptics';
import { useStore } from '@/client/store';
import { Md } from '@/components/shell/Markdown';
import { useToast } from '@/components/shell/Toast';
import type { EngineProps } from '@/components/game/types';
import { Figure } from './Figure';
import { LabDrawer, PeriodicDrawer } from './References';

const CONF = [
  { c: 1 as const, label: 'Guess', key: 'g' },
  { c: 2 as const, label: 'Likely', key: 'l' },
  { c: 3 as const, label: 'Sure', key: 's' },
];

export function QuestionBody({ q }: { q: Pick<McqPublic, 'passage' | 'stem' | 'figure' | 'labs' | 'leadIn'> }) {
  return (
    <>
      {q.passage && (
        <div className="prose-game mb-3 rounded-xl bg-surface-2 px-4 py-3 text-[15px]">
          <Md text={q.passage} />
        </div>
      )}
      <Md text={q.stem} className="prose-game" />
      {q.figure && <Figure figure={q.figure} />}
      {q.labs && (
        <dl className="my-3 grid max-w-sm grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-lg bg-surface-2 px-3 py-2 text-[15px]">
          {q.labs.map((r) => (
            <div key={r.label} className="contents">
              <dt className="text-muted">{r.label}</dt>
              <dd className="tabular text-right font-semibold">
                {r.value}
                {r.unit ? ` ${r.unit}` : ''}
                {r.flag && <span className="ml-1 text-xs font-black text-wrong">{r.flag}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p className="prose-game mt-3 font-bold">{q.leadIn}</p>
    </>
  );
}

export function Explanation({ step, options }: { step: GauntletStepFb; options: McqPublic['options'] }) {
  const [tab, setTab] = useState<'why' | 'options' | 'sources'>('why');
  return (
    <div className="anim-slide-up mt-4 rounded-2xl border border-border bg-surface p-4">
      <p className={`font-extrabold ${step.correct ? 'text-correct' : 'text-wrong'}`}>
        {step.correct ? '✓ Correct' : `✗ The answer is ${step.correctOptionId}`} · {step.points > 0 ? `+${step.points}` : step.points} pts
      </p>
      <div role="tablist" className="mt-2 flex gap-1 border-b border-border text-sm">
        {(['why', 'options', 'sources'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`-mb-px border-b-2 px-3 py-2 font-semibold ${tab === t ? 'border-accent text-fg' : 'border-transparent text-muted'}`}>
            {t === 'why' ? 'Explanation' : t === 'options' ? 'Why not…' : 'Sources'}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="pt-3 text-[15px] leading-relaxed">
        {tab === 'why' && (
          <>
            <Md text={step.explanation} />
            <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
              <span className="font-bold">Takeaway:</span> {step.takeaway}
            </p>
            <p className="mt-2 text-xs text-muted">{step.blueprint.name}</p>
          </>
        )}
        {tab === 'options' && (
          <ul className="space-y-2">
            {options.map((o) => (
              <li key={o.id}>
                <span className={`font-bold ${o.id === step.correctOptionId ? 'text-correct' : ''}`}>({o.id})</span> {step.optionRationales[o.id]}
              </li>
            ))}
          </ul>
        )}
        {tab === 'sources' && (
          <ul className="list-disc pl-5 text-sm">
            {step.sources.map((s) => (
              <li key={s.id}>{s.url ? <a className="underline" href={s.url} target="_blank" rel="noreferrer noopener">{s.locator}</a> : s.locator}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function Gauntlet({ g, config, timedMode }: EngineProps) {
  const pub = g.puzzle!.payload as GauntletPublic;
  const steps = (g.save?.steps ?? []) as GauntletStepFb[];
  const timedSetting = useStore((s) => s.settings.gauntletTimed);
  const timed = timedMode === 'forced' || (timedMode === 'optional' && ((g.save?.uiExtras?.timed as boolean | undefined) ?? timedSetting));
  const { toast } = useToast();
  const answered = steps.length;
  const done = g.phase === 'completed';
  const [viewIdx, setViewIdx] = useState(Math.min(answered, 4));
  const [choice, setChoice] = useState<string | null>(null);
  const [struck, setStruck] = useState<Record<string, string[]>>({});
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());
  const busy = g.phase === 'submitting';
  const q = pub.questions[viewIdx]!;
  const step = steps[viewIdx];
  const isCurrent = viewIdx === answered && !done;

  useEffect(() => {
    startRef.current = Date.now();
    setElapsed(0);
    setChoice(null);
  }, [viewIdx]);

  const submit = useCallback(
    async (confidence: 1 | 2 | 3, timeout = false) => {
      if (!isCurrent || busy) return;
      if (!timeout && !choice) return toast('Pick an answer first');
      const ms = Date.now() - startRef.current;
      const r = await g.dispatchMove({ type: 'answer', questionId: q.id, optionId: timeout ? null : choice, confidence, ms });
      if (!r.ok) return toast(r.reason);
      const last = g.latest()?.steps.at(-1) as GauntletStepFb | undefined;
      haptic(last?.correct ? 15 : [20, 30, 20]);
    },
    [isCurrent, busy, choice, g, q.id, toast],
  );

  useEffect(() => {
    if (!isCurrent) return;
    const t = setInterval(() => {
      const s = Math.floor((Date.now() - startRef.current) / 1000);
      setElapsed(s);
      if (timed && s >= pub.paceSeconds) void submit(1, true);
    }, 500);
    return () => clearInterval(t);
  }, [isCurrent, timed, pub.paceSeconds, submit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, [role="dialog"]') || e.metaKey || e.ctrlKey) return;
      const k = e.key.toLowerCase();
      const opt = q.options.find((o, i) => o.id.toLowerCase() === k || String(i + 1) === k);
      if (isCurrent && opt && !CONF.some((c) => c.key === k)) {
        setChoice(opt.id);
        e.preventDefault();
        return;
      }
      const conf = CONF.find((c) => c.key === k);
      if (isCurrent && conf && choice) {
        void submit(conf.c);
        e.preventDefault();
      } else if ((k === 'arrowright' || k === 'enter') && step && viewIdx < 4 && viewIdx < answered) {
        setViewIdx((v) => v + 1);
        e.preventDefault();
      } else if (k === 'x' && choice && isCurrent) {
        toggleStrike(choice);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const toggleStrike = (id: string) =>
    setStruck((s) => {
      const cur = s[q.id] ?? [];
      return { ...s, [q.id]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] };
    });

  const optionCls = (id: string) => {
    if (step) {
      if (id === step.correctOptionId) return 'border-correct bg-correct/10';
      if (id === step.optionId) return 'border-wrong bg-wrong/10';
      return 'border-border opacity-70';
    }
    return choice === id ? 'border-accent bg-accent/10 ring-2 ring-accent' : 'border-border';
  };

  const total = steps.reduce((a, s) => a + s.points, 0);
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="mx-auto max-w-[680px] px-4 pt-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5" role="tablist" aria-label="Questions">
          {pub.questions.map((qq, i) => {
            const s = steps[i];
            return (
              <button
                key={qq.id}
                role="tab"
                aria-selected={i === viewIdx}
                aria-label={`Question ${i + 1}${s ? (s.correct ? ', correct' : ', incorrect') : ''}`}
                disabled={i > answered || (i === answered && done)}
                onClick={() => setViewIdx(i)}
                className={`h-2.5 w-9 rounded-full ${s ? (s.correct ? 'bg-correct' : 'bg-wrong') : i === answered ? 'bg-accent' : 'bg-border'} ${i === viewIdx ? 'outline outline-2 outline-offset-2 outline-fg' : ''}`}
              />
            );
          })}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="tabular font-semibold">{total} pts</span>
          {isCurrent && (
            <span className={`tabular ${timed && pub.paceSeconds - elapsed <= 10 ? 'font-bold text-wrong' : 'text-muted'}`} aria-label="Timer">
              ⏱ {timed ? mmss(Math.max(0, pub.paceSeconds - elapsed)) : mmss(elapsed)}
            </span>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-muted">
          Q{viewIdx + 1}/5 · {q.displayTag}{' '}
          <span aria-label={`Difficulty ${q.difficulty} of 5`}>{'◆'.repeat(q.difficulty)}{'◇'.repeat(5 - q.difficulty)}</span>
        </p>
        <div className="flex gap-2">
          {config.gauntlet?.references.includes('labs') && <LabDrawer />}
          {config.gauntlet?.references.includes('periodic') && <PeriodicDrawer />}
        </div>
      </div>
      <article className="mt-3">
        <QuestionBody q={q} />
        <div role="radiogroup" aria-label="Answer options" className="mt-3 space-y-2">
          {q.options.map((o) => {
            const isStruck = (struck[q.id] ?? []).includes(o.id);
            return (
              <button
                key={o.id}
                role="radio"
                aria-checked={choice === o.id || step?.optionId === o.id}
                disabled={!isCurrent || busy}
                onClick={() => setChoice(o.id)}
                onContextMenu={(e) => {
                  if (!isCurrent) return;
                  e.preventDefault();
                  toggleStrike(o.id);
                }}
                onTouchStart={(e) => {
                  if (!isCurrent) return;
                  const t = setTimeout(() => toggleStrike(o.id), 550);
                  const clear = () => clearTimeout(t);
                  e.currentTarget.addEventListener('touchend', clear, { once: true });
                  e.currentTarget.addEventListener('touchmove', clear, { once: true });
                }}
                className={`flex min-h-12 w-full items-start gap-3 rounded-xl border-2 bg-surface px-4 py-3 text-left text-[16px] transition ${optionCls(o.id)}`}
              >
                <span className="font-bold">({o.id})</span>
                <span className={isStruck ? 'text-muted line-through' : ''}>{o.text}</span>
              </button>
            );
          })}
        </div>
        {step && <Explanation step={step} options={q.options} />}
      </article>
      {isCurrent && (
        <div className="safe-bottom sticky bottom-0 mt-4 bg-bg pt-2">
          <p className="mb-1.5 text-center text-sm text-muted">{choice ? 'How sure are you?' : 'Pick an answer (long-press or right-click to strike one out)'}</p>
          <div className="grid grid-cols-3 gap-2">
            {CONF.map(({ c, label }) => (
              <button key={c} className="btn flex-col gap-0 py-1.5" disabled={!choice || busy} onClick={() => void submit(c)} aria-label={`${label}: plus ${pointsFor(true, c)} if right, ${pointsFor(false, c)} if wrong`}>
                <span>{label}</span>
                <span className="text-xs font-medium text-muted">
                  +{pointsFor(true, c)}/{pointsFor(false, c) === 0 ? '0' : `−${-pointsFor(false, c)}`}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {step && viewIdx < 4 && viewIdx < answered && (
        <div className="mt-4 flex justify-end">
          <button className="btn btn-primary" onClick={() => setViewIdx((v) => v + 1)}>
            {viewIdx + 1 === answered && !done ? 'Next question →' : 'Next →'}
          </button>
        </div>
      )}
    </div>
  );
}
