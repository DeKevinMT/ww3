import type { GameModeV2 } from '../sim/v2/scenarios';

/** Campaign is exclusively solo; multiplayer remains available in the two side modes. */
export type MultiplayerGameModeV2 = Exclude<GameModeV2, 'standard-2026'>;

export const DEFAULT_MULTIPLAYER_GAME_MODE_V2: MultiplayerGameModeV2 = 'random-world';

export function isMultiplayerGameModeV2(
  mode: GameModeV2,
): mode is MultiplayerGameModeV2 {
  return mode === 'survival' || mode === 'random-world';
}

export const CAMPAIGN_SINGLE_PLAYER_REASON_V2 =
  'Campaign is single-player only. Choose Survival or Alternative Universe for multiplayer.';
