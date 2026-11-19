'use client';
import { recomputeStreaks, type HistoryRecord } from '@prepdle/core';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { track } from '@/client/analytics';
import { api } from '@/client/api';
import { storageAvailable } from '@/client/storage';
import { useStore, type Settings } from '@/client/store';
import { useToast } from '@/components/shell/Toast';

function Row({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3">
      <div>
        <div className="font-semibold">{title}</div>
        {desc && <div className="text-sm text-muted">{desc}</div>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-accent' : 'bg-border'}`}>
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

export function SettingsClient({ version }: { version: string }) {
  const settings = useStore((s) => s.settings);
  const set = (p: Partial<Settings>) => {
    useStore.getState().setSettings(p);
    track('settings_change', { key: Object.keys(p)[0] });
  };
  const { toast } = useToast();
  const [code, setCode] = useState<{ display: string; code: string; expiresAt: string } | null>(null);
  const [redeem, setRedeem] = useState('');
  const [confirmReset, setConfirmReset] = useState('');

  const createCode = async () => {
    try {
      setCode(await api.createTransfer());
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const doRedeem = async () => {
    try {
      await api.redeemTransfer(redeem);
      const { history } = await api.meHistory();
      const n = useStore.getState().mergeServerHistory(history);
      toast(`Linked! Restored ${n} results.`);
      setRedeem('');
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const exportData = () => {
    const s = useStore.getState();
    const blob = new Blob([JSON.stringify({ app: 'prepdle', version: 1, exportedAt: new Date().toISOString(), settings: s.settings, history: s.history }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `prepdle-data-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importData = async (f: File) => {
    try {
      const data = JSON.parse(await f.text()) as { app?: string; settings?: Partial<Settings>; history?: HistoryRecord[] };
      if (data.app !== 'prepdle' || !Array.isArray(data.history)) throw new Error('Not a Prepdle export');
      const valid = data.history.filter((h) => typeof h.d === 'string' && typeof h.t === 'string' && typeof h.g === 'string');
      recomputeStreaks(valid);
      useStore.getState().importData({ settings: data.settings, history: valid });
      toast(`Imported ${valid.length} results`);
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const deleteAll = async () => {
    try {
      await api.deleteMe();
    } catch {}
    useStore.getState().resetAll();
    toast('All data deleted');
    setConfirmReset('');
  };

  return (
    <div>
      {!storageAvailable() && <p className="mb-3 rounded-lg bg-present/20 p-3 text-sm">Progress can’t be saved in this browser mode (private browsing?).</p>}
      <h2 className="mt-2 text-sm font-bold uppercase tracking-wider text-muted">Display</h2>
      <Row title="Theme">
        <select value={settings.theme} onChange={(e) => set({ theme: e.target.value as Settings['theme'] })} className="rounded-md border border-border bg-surface px-2 py-1.5" aria-label="Theme">
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </Row>
      <Row title="High-contrast colors" desc="Orange/blue feedback for color-vision deficiency">
        <Toggle label="High-contrast colors" checked={settings.highContrast} onChange={(v) => set({ highContrast: v })} />
      </Row>
      <Row title="Reduce motion">
        <Toggle label="Reduce motion" checked={settings.reduceMotion === 'on'} onChange={(v) => set({ reduceMotion: v ? 'on' : 'system' })} />
      </Row>
      <Row title="Haptics" desc="Vibration feedback (Android)">
        <Toggle label="Haptics" checked={settings.haptics} onChange={(v) => set({ haptics: v })} />
      </Row>

      <h2 className="mt-6 text-sm font-bold uppercase tracking-wider text-muted">Gameplay</h2>
      <Row title="Jargon hard mode" desc="Revealed hints must be used in later guesses. Applies to games you haven’t started.">
        <Toggle label="Jargon hard mode" checked={settings.jargonHardMode} onChange={(v) => set({ jargonHardMode: v })} />
      </Row>
      <Row title="Timed Gauntlet" desc="Auto-submit at exam pace (MCAT 95s, LSAT 84s, Boards 90s, Bar 108s)">
        <Toggle label="Timed Gauntlet" checked={settings.gauntletTimed} onChange={(v) => set({ gauntletTimed: v })} />
      </Row>

      <h2 className="mt-6 text-sm font-bold uppercase tracking-wider text-muted">Your data</h2>
      <div className="border-b border-border py-3">
        <div className="font-semibold">Move to another device</div>
        <p className="text-sm text-muted">No account needed: create a one-time code here and enter it on your other device within 15 minutes.</p>
        {code ? (
          <div className="mt-2 rounded-xl bg-surface-2 p-3 text-center">
            <div className="text-3xl font-extrabold tracking-[0.2em] tabular">{code.display}</div>
            <div className="mt-1 text-xs text-muted">or open {typeof window !== 'undefined' ? window.location.origin : ''}/transfer#{code.code}</div>
          </div>
        ) : (
          <button className="btn mt-2" onClick={() => void createCode()}>
            Create transfer code
          </button>
        )}
        <div className="mt-3 flex gap-2">
          <input value={redeem} onChange={(e) => setRedeem(e.target.value)} placeholder="Enter code (e.g. K7Q-M2X-9PA)" className="h-11 flex-1 rounded-full border border-border bg-surface px-4 text-base" aria-label="Transfer code" />
          <button className="btn" onClick={() => void doRedeem()} disabled={redeem.replace(/[^A-Za-z0-9]/g, '').length < 9}>
            Link
          </button>
        </div>
      </div>
      <Row title="Export my data" desc="Download your settings and history (JSON)">
        <button className="btn" onClick={exportData}>
          Export
        </button>
      </Row>
      <Row title="Import data" desc="Merge a Prepdle export into this device">
        <label className="btn cursor-pointer">
          Import
          <input type="file" accept="application/json" className="sr-only" onChange={(e) => e.target.files?.[0] && void importData(e.target.files[0])} />
        </label>
      </Row>
      <div className="border-b border-border py-3">
        <div className="font-semibold text-wrong">Delete all my data</div>
        <p className="text-sm text-muted">Removes local data and everything stored on our server for this device. Type DELETE to confirm.</p>
        <div className="mt-2 flex gap-2">
          <input value={confirmReset} onChange={(e) => setConfirmReset(e.target.value)} className="h-11 flex-1 rounded-full border border-border bg-surface px-4 text-base" aria-label="Type DELETE to confirm" />
          <button className="btn" disabled={confirmReset !== 'DELETE'} onClick={() => void deleteAll()}>
            Delete
          </button>
        </div>
      </div>
      <p className="mt-6 text-center text-sm text-muted">
        Prepdle v{version} · <Link className="underline" href="/privacy">Privacy</Link> · <Link className="underline" href="/sources">Sources</Link>
      </p>
    </div>
  );
}
