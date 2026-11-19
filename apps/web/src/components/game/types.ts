import type { GameConfig, TrackId } from '@prepdle/core';
import type { DailyGame } from '@/client/useDailyGame';

export interface EngineProps {
  g: DailyGame;
  track: TrackId;
  config: GameConfig;
  timedMode: 'off' | 'optional' | 'forced';
  bonusEnabled: boolean;
  openResults: () => void;
}
