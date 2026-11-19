'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/client/api';
import { useStore } from '@/client/store';

export function TransferClient() {
  const [state, setState] = useState<'working' | 'done' | 'error'>('working');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    const code = window.location.hash.slice(1);
    if (!code) {
      setState('error');
      setMsg('No code found in the link.');
      return;
    }
    (async () => {
      try {
        useStore.getState().hydrate();
        await api.redeemTransfer(code);
        const { history } = await api.meHistory();
        const n = useStore.getState().mergeServerHistory(history);
        history.length && setMsg(`Restored ${n} results.`);
        setState('done');
        window.history.replaceState(null, '', '/transfer');
      } catch (e) {
        setState('error');
        setMsg((e as Error).message);
      }
    })();
  }, []);
  return (
    <div className="text-center">
      <p className="text-4xl">{state === 'done' ? '✅' : state === 'error' ? '⚠️' : '⏳'}</p>
      <h2 className="mt-2 text-xl font-bold">{state === 'done' ? 'This device is linked' : state === 'error' ? 'Couldn’t link this device' : 'Linking…'}</h2>
      <p className="mt-1 text-muted">{msg}</p>
      <Link href="/" className="btn btn-primary mt-5">
        Go to today’s games
      </Link>
    </div>
  );
}
