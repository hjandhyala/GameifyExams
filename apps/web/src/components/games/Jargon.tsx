'use client';
import { HINT_UNLOCKS, type JargonPublic, type JargonReveal, type JargonStepFb, type LetterState } from '@prepdle/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { haptic } from '@/client/haptics';
import { useStore } from '@/client/store';
import { Icons } from '@/components/shell/AppHeader';
import { useToast } from '@/components/shell/Toast';
import type { EngineProps } from '@/components/game/types';

const ROWS = [['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'], ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'], ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACK']];
const RANK: Record<LetterState, number> = { absent: 1, present: 2, correct: 3 };
const STATE_CLS: Record<LetterState, string> = { correct: 'bg-correct text-white border-correct', present: 'bg-present text-white border-present', absent: 'bg-absent text-white border-absent' };
const STATE_WORD: Record<LetterState, string> = { correct: 'correct', present: 'in the word, wrong spot', absent: 'not in the word' };

export default function Jargon({ g }: EngineProps) {
  const pub = g.puzzle!.payload as JargonPublic;
  const steps = (g.save?.steps ?? []) as JargonStepFb[];
  const reveal = g.save?.reveal as JargonReveal | undefined;
  const guesses = steps.filter((s): s is Extract<JargonStepFb, { kind: 'guess' }> => s.kind === 'guess');
  const hints = steps.filter((s): s is Extract<JargonStepFb, { kind: 'hint' }> => s.kind === 'hint');
  const hardModeSetting = useStore((s) => s.settings.jargonHardMode);
  const hardMode = (g.save?.uiExtras?.hardMode as boolean | undefined) ?? hardModeSetting;
  const { toast } = useToast();
  const [input, setInput] = useState('');
  const [shake, setShake] = useState(false);
  const [flipRow, setFlipRow] = useState<number | null>(null);
  const done = g.phase === 'completed';
  const busy = g.phase === 'submitting';
  const L = pub.length;

  const keyStates = useMemo(() => {
    const m = new Map<string, LetterState>();
    for (const gs of guesses)
      gs.letters.forEach((st, i) => {
        const ch = gs.word[i]!;
        if (!m.has(ch) || RANK[st] > RANK[m.get(ch)!]) m.set(ch, st);
      });
    return m;
  }, [guesses]);

  const submit = useCallback(async () => {
    if (done || busy) return;
    if (input.length !== L) {
      setShake(true);
      setTimeout(() => setShake(false), 320);
      toast('Not enough letters');
      return;
    }
    const r = await g.dispatchMove({ type: 'guess', word: input });
    if (!r.ok) {
      setShake(true);
      setTimeout(() => setShake(false), 320);
      toast(r.reason);
      haptic([20, 30, 20]);
      return;
    }
    const row = guesses.length;
    setFlipRow(row);
    setInput('');
    setTimeout(() => setFlipRow(null), 250 + 120 * L);
  }, [done, busy, input, L, g, toast, guesses.length]);

  const press = useCallback(
    (k: string) => {
      if (done || busy) return;
      if (k === 'ENTER') return void submit();
      if (k === 'BACK') return setInput((s) => s.slice(0, -1));
      if (/^[A-Z]$/.test(k)) setInput((s) => (s.length < L ? s + k : s));
    },
    [done, busy, submit, L],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement)?.closest('input, textarea, [role="dialog"]')) return;
      if (e.key === 'Enter') press('ENTER');
      else if (e.key === 'Backspace') press('BACK');
      else if (/^[a-zA-Z]$/.test(e.key)) press(e.key.toUpperCase());
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press]);

  const takeHint = async (index: 0 | 1) => {
    const r = await g.dispatchMove({ type: 'hint', index });
    if (!r.ok) toast(r.reason);
  };

  const cell = Math.min(56, Math.floor((Math.min(typeof window !== 'undefined' ? window.innerWidth : 400, 420) - 32 - (L - 1) * 6) / L));

  return (
    <div className="mx-auto flex max-w-[500px] flex-col px-4 pt-3" style={{ minHeight: 'calc(100dvh - 72px)' }}>
      <div className="flex items-center justify-center gap-2 text-sm text-muted">
        <span>{L}-letter term</span>
        {hardMode && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-bold">Hard mode</span>}
      </div>
      <div className="mt-3 flex flex-1 flex-col items-center justify-start gap-1.5" role="grid" aria-label="Guesses">
        {Array.from({ length: 6 }).map((_, r) => {
          const gs = guesses[r];
          const isCurrent = !gs && r === guesses.length && !done;
          const letters = gs ? gs.word : isCurrent ? input.padEnd(L) : ''.padEnd(L);
          return (
            <div key={r} role="row" className={`flex gap-1.5 ${isCurrent && shake ? 'anim-shake' : ''}`} aria-label={gs ? `Guess ${r + 1}: ${gs.word}` : `Row ${r + 1}`}>
              {Array.from({ length: L }).map((__, i) => {
                const ch = letters[i]?.trim() ?? '';
                const st = gs?.letters[i];
                const flipping = flipRow === r;
                return (
                  <div
                    key={i}
                    role="gridcell"
                    aria-label={ch ? `${ch}${st ? `, ${STATE_WORD[st]}` : ''}` : 'empty'}
                    className={`grid place-items-center rounded-md border-2 font-extrabold uppercase ${
                      st ? STATE_CLS[st] : ch ? 'border-muted text-fg' : 'border-border text-fg'
                    } ${flipping ? 'anim-flip' : ''} ${isCurrent && ch && i === input.length - 1 ? 'anim-pop' : ''}`}
                    style={{ width: cell, height: cell, fontSize: cell * 0.5, animationDelay: flipping ? `${i * 120}ms` : undefined }}
                  >
                    {ch}
                  </div>
                );
              })}
            </div>
          );
        })}
        {done && reveal && guesses.at(-1)?.word !== reveal.answer && (
          <p className="mt-2 rounded-lg bg-fg px-3 py-1.5 font-extrabold tracking-widest text-bg">{reveal.answer}</p>
        )}
      </div>

      {!done && (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {pub.hints.map((h) => {
            const used = hints.find((x) => x.index === h.index);
            const unlocked = guesses.length >= HINT_UNLOCKS[h.index as 0 | 1] && hints.length === h.index;
            if (used) return null;
            return (
              <button key={h.index} className="btn min-h-9 text-sm" disabled={!unlocked || busy} onClick={() => void takeHint(h.index as 0 | 1)}>
                💡 {h.kind === 'category' ? 'Category hint' : 'Definition hint'}
                {!unlocked && <span className="text-xs text-muted"> (after {h.unlockAfterGuesses})</span>}
              </button>
            );
          })}
        </div>
      )}
      {hints.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {hints.map((h) => (
            <p key={h.index} className="anim-slide-up rounded-lg bg-surface-2 px-3 py-2 text-sm">
              <span className="font-bold">💡 {h.index === 0 ? 'Category' : 'Definition'}:</span> {h.text}
            </p>
          ))}
        </div>
      )}

      {!done && (
        <div className="no-select safe-bottom mt-3 space-y-1.5 pb-1" aria-label="Keyboard">
          {ROWS.map((row, ri) => (
            <div key={ri} className="flex justify-center gap-1.5">
              {row.map((k) => {
                const st = keyStates.get(k);
                const wide = k === 'ENTER' || k === 'BACK';
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => press(k)}
                    disabled={busy}
                    aria-label={k === 'BACK' ? 'Backspace' : k === 'ENTER' ? 'Enter' : `${k}${st ? `, ${STATE_WORD[st]}` : ''}`}
                    className={`grid h-13 min-w-0 place-items-center rounded-md text-sm font-bold ${wide ? 'flex-[1.5] px-1 text-xs' : 'flex-1'} ${
                      st ? STATE_CLS[st] : 'bg-surface-2 text-fg'
                    }`}
                    style={{ maxWidth: wide ? 66 : 44, height: 54 }}
                  >
                    {k === 'BACK' ? Icons.backspace : k}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
