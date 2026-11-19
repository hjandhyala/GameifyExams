import 'server-only';
import { isISODate } from '@prepdle/core';

const bool = (v: string | undefined) => v === '1' || v === 'true';

export const IS_PROD_DEPLOY = process.env.VERCEL_ENV === 'production' || bool(process.env.PREPDLE_PRODUCTION);

/** Fixtures + date override are only ever enabled outside production deploys (§18.1). */
export const DEV_FEATURES = !IS_PROD_DEPLOY && (process.env.NODE_ENV !== 'production' || bool(process.env.FIXTURES));

export const LAUNCH_DATE = (() => {
  const d = process.env.LAUNCH_DATE ?? '2026-07-15';
  if (!isISODate(d)) throw new Error(`Invalid LAUNCH_DATE ${d}`);
  return d;
})();

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '1.0.0';
export const MIN_APP_VERSION = process.env.MIN_APP_VERSION ?? '1.0.0';

function secret(name: string, devFallback: string): string {
  const v = process.env[name];
  if (v) return v;
  if (IS_PROD_DEPLOY) throw new Error(`${name} must be set in production`);
  return devFallback;
}

export const DEVICE_PEPPER = () => secret('DEVICE_PEPPER', 'dev-device-pepper-not-secret');
export const TRANSFER_KEY = () => secret('TRANSFER_KEY', 'dev-transfer-key-not-secret');
export const REDIS_SECRET_KEY = () => secret('REDIS_SECRET_KEY', 'dev-redis-secret-key-not-secret');
export const CRON_SECRET = () => process.env.CRON_SECRET ?? (IS_PROD_DEPLOY ? '' : 'dev-cron-secret');

export interface Flags {
  dailyLimitMode: 'per_game' | 'per_day';
  archiveEnabled: boolean;
  gamesDisabled: string[];
  tracksDisabled: string[];
  gauntletTimedMode: 'off' | 'optional' | 'forced';
  showGlobalStats: boolean;
  bonusQuestions: boolean;
}

export const FLAGS: Flags = (() => {
  const defaults: Flags = {
    dailyLimitMode: 'per_game',
    archiveEnabled: false,
    gamesDisabled: [],
    tracksDisabled: [],
    gauntletTimedMode: 'optional',
    showGlobalStats: true,
    bonusQuestions: true,
  };
  try {
    return { ...defaults, ...(process.env.FEATURE_FLAGS ? (JSON.parse(process.env.FEATURE_FLAGS) as Partial<Flags>) : {}) };
  } catch {
    return defaults;
  }
})();

export const gameEnabled = (track: string, gameId: string) =>
  !FLAGS.tracksDisabled.includes(track) && !FLAGS.gamesDisabled.includes(`${track}:${gameId}`);
