'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { track } from '@/client/analytics';
import { flushOutbox } from '@/client/outbox';
import { maybeRestore } from '@/client/restore';
import { useStore } from '@/client/store';
import { ToastProvider, useToast } from './Toast';

function useApplySettings() {
  const settings = useStore((s) => s.settings);
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && mq.matches);
      root.dataset.theme = dark ? 'dark' : 'light';
      root.dataset.contrast = settings.highContrast ? 'high' : 'normal';
      if (settings.reduceMotion === 'on') root.dataset.motion = 'reduce';
      else delete root.dataset.motion;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#111214' : '#fafaf7');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings.theme, settings.highContrast, settings.reduceMotion]);
}

function Boot() {
  const { toast } = useToast();
  const [offline, setOffline] = useState(false);
  const [skew, setSkew] = useState(false);
  const [newer, setNewer] = useState(false);
  useApplySettings();

  useEffect(() => {
    useStore.getState().hydrate();
    const params = new URL(window.location.href).searchParams;
    track('app_open', { source: params.get('source') ?? (params.get('s') ? 'share' : 'web'), returning: useStore.getState().history.length > 0 });
    maybeRestore().then((n) => n > 0 && toast('Welcome back. We restored your streak.', 3500));
    void flushOutbox();
    const onOnline = () => {
      setOffline(false);
      void flushOutbox();
    };
    const onOffline = () => setOffline(true);
    const onVis = () => document.visibilityState === 'visible' && void flushOutbox();
    const timer = setInterval(() => useStore.getState().outbox.length && void flushOutbox(), 30_000);
    setOffline(!navigator.onLine);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pd:clock-skew', () => setSkew(true));
    window.addEventListener('pd:schema-newer', () => setNewer(true));
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [toast]);

  return (
    <>
      {offline && (
        <div role="status" className="fixed inset-x-0 bottom-0 z-50 bg-fg px-4 py-2 text-center text-sm font-semibold text-bg safe-bottom">
          You’re offline. Moves will resume when you reconnect.
        </div>
      )}
      {skew && (
        <div role="status" className="bg-present/20 px-4 py-2 text-center text-sm">
          Your device clock seems off. Today’s puzzle is based on your local date.{' '}
          <button className="underline" onClick={() => setSkew(false)}>
            Dismiss
          </button>
        </div>
      )}
      {newer && (
        <div role="status" className="bg-present/20 px-4 py-2 text-center text-sm">
          A newer version of Prepdle saved data here. Please refresh.
        </div>
      )}
    </>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <Boot />
      {children}
    </ToastProvider>
  );
}
