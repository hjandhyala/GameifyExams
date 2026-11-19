import type { ShareOpts } from './types';

export const TIER_EMOJI = { 1: '🟢', 2: '🔵', 3: '🟠', 4: '🔴' } as const;
export const TIER_GLYPH = { 1: '●', 2: '◆', 3: '▲', 4: '★' } as const;
export const TIER_NAME = { 1: 'Green', 2: 'Blue', 3: 'Orange', 4: 'Red' } as const;

export function letterEmoji(opts: ShareOpts) {
  return {
    correct: opts.highContrast ? '🟠' : '🟢',
    present: opts.highContrast ? '🔵' : '🟡',
    absent: opts.theme === 'dark' ? '⚫' : '⚪',
  };
}

export const RESULT_EMOJI = { right: '🟢', wrong: '🔴', close: '🟡', skip: '⚫', unused: '⚪' } as const;
export const CONFIDENCE_EMOJI = { 1: '1️⃣', 2: '2️⃣', 3: '3️⃣' } as const;
