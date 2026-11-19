'use client';
import { useStore } from './store';

export function haptic(pattern: number | number[] = 10): void {
  if (!useStore.getState().settings.haptics) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {}
}
