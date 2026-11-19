'use client';
import { track } from './analytics';

export type ShareMethod = 'native' | 'clipboard' | 'manual';

/** Web Share API → clipboard → manual copy fallback (§4.6). */
export async function shareText(text: string, kind: 'game' | 'daily'): Promise<ShareMethod> {
  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  if (coarse && typeof navigator.share === 'function') {
    try {
      await navigator.share({ text });
      track('share', { kind, method: 'native' });
      return 'native';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'native';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    track('share', { kind, method: 'clipboard' });
    return 'clipboard';
  } catch {
    track('share', { kind, method: 'manual' });
    return 'manual';
  }
}
