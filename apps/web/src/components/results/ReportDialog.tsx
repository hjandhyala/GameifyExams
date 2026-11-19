'use client';
import { useState } from 'react';
import { track } from '@/client/analytics';
import { api } from '@/client/api';
import { Sheet } from '@/components/shell/Sheet';
import { useToast } from '@/components/shell/Toast';

const CATEGORIES = [
  ['wrong_answer', 'The answer is wrong'],
  ['ambiguous', 'More than one answer works'],
  ['outdated', 'Outdated information'],
  ['typo', 'Typo or formatting'],
  ['too_easy_hard', 'Difficulty felt off'],
  ['offensive_biased', 'Offensive or biased'],
  ['bug', 'Something broke'],
  ['other', 'Other'],
] as const;

export function ReportButton({ puzzleId, version, itemId }: { puzzleId: string; version: number; itemId?: string }) {
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState<string>('wrong_answer');
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const { toast } = useToast();
  const send = async () => {
    setSending(true);
    try {
      await api.report({ puzzleId, itemId, category: cat, message: msg.trim() || undefined, context: { version } });
      track('report_submit', { category: cat });
      toast('Thanks! Our reviewers will take a look.');
      setOpen(false);
      setMsg('');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setSending(false);
    }
  };
  return (
    <>
      <button className="text-sm text-muted underline" onClick={() => setOpen(true)}>
        Report a problem
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Report a problem">
        <fieldset className="space-y-1.5">
          <legend className="sr-only">Category</legend>
          {CATEGORIES.map(([v, l]) => (
            <label key={v} className="flex min-h-10 items-center gap-3 rounded-lg px-2 hover:bg-surface-2">
              <input type="radio" name="cat" value={v} checked={cat === v} onChange={() => setCat(v)} className="h-4 w-4 accent-[var(--accent)]" />
              {l}
            </label>
          ))}
        </fieldset>
        <label className="mt-3 block text-sm font-semibold">
          Details (optional)
          <textarea value={msg} onChange={(e) => setMsg(e.target.value.slice(0, 1000))} rows={3} className="mt-1 w-full rounded-lg border border-border bg-surface p-2 text-base" />
        </label>
        <button className="btn btn-primary mt-3 w-full" onClick={() => void send()} disabled={sending}>
          {sending ? 'Sending…' : 'Send report'}
        </button>
      </Sheet>
    </>
  );
}
