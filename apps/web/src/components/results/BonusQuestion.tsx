'use client';
import type { McqPublic } from '@prepdle/core';
import { useState } from 'react';
import { useToast } from '@/components/shell/Toast';
import { QuestionBody } from '@/components/games/Gauntlet';

export function BonusQuestion({
  bonus,
  result,
  onAnswer,
}: {
  bonus: Omit<McqPublic, 'id'>;
  result?: { correct: boolean; correctOptionId: string; rationale: string; chosen?: string };
  onAnswer: (optionId: string) => Promise<{ ok: boolean; reason?: string }>;
}) {
  const [choice, setChoice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  return (
    <section className="rounded-2xl border border-border p-4">
      <h3 className="text-sm font-bold uppercase tracking-wider text-muted">Bonus question (doesn’t affect your score)</h3>
      <div className="mt-2 text-[15px]">
        <QuestionBody q={bonus} />
      </div>
      <div className="mt-2 space-y-1.5">
        {bonus.options.map((o) => {
          const cls = result
            ? o.id === result.correctOptionId
              ? 'border-correct bg-correct/10'
              : o.id === result.chosen
                ? 'border-wrong bg-wrong/10'
                : 'border-border opacity-70'
            : choice === o.id
              ? 'border-accent ring-2 ring-accent'
              : 'border-border';
          return (
            <button key={o.id} disabled={!!result || busy} onClick={() => setChoice(o.id)} className={`w-full rounded-xl border-2 px-3 py-2 text-left text-[15px] ${cls}`}>
              <b>({o.id})</b> {o.text}
            </button>
          );
        })}
      </div>
      {result ? (
        <p className={`mt-3 text-sm ${result.correct ? 'text-correct' : 'text-wrong'}`}>
          <b>{result.correct ? '✓ Correct.' : '✗ Not quite.'}</b> <span className="text-fg">{result.rationale}</span>
        </p>
      ) : (
        <button
          className="btn btn-primary mt-3 w-full"
          disabled={!choice || busy}
          onClick={async () => {
            if (!choice) return;
            setBusy(true);
            const r = await onAnswer(choice);
            setBusy(false);
            if (!r.ok && r.reason) toast(r.reason);
          }}
        >
          Submit bonus answer
        </button>
      )}
    </section>
  );
}
