'use client';
import { localDate, msUntilLocalMidnight } from '@prepdle/core';
import { useEffect, useState } from 'react';
import { debugDate } from './debug';

export const currentDate = (): string => debugDate() ?? localDate();

/** Local puzzle date; re-evaluated on focus/visibility and every 60 s while visible (§8.5). */
export function useToday(): string | null {
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    const update = () => setToday(currentDate());
    update();
    const onVis = () => document.visibilityState === 'visible' && update();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', update);
    const t = setInterval(() => document.visibilityState === 'visible' && update(), 60_000);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', update);
      clearInterval(t);
    };
  }, []);
  return today;
}

export function useCountdown(): string {
  const [label, setLabel] = useState('');
  useEffect(() => {
    let raf = 0;
    let last = '';
    const tick = () => {
      const ms = msUntilLocalMidnight();
      const s = Math.floor(ms / 1000);
      const l = `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
      if (l !== last) {
        last = l;
        setLabel(l);
      }
      if (document.visibilityState === 'visible') raf = window.setTimeout(tick, 250) as unknown as number;
    };
    tick();
    const onVis = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearTimeout(raf);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
  return label;
}
