import type { PlayerId, WorldStateV2 } from './types';

type HumanPlayerStateV2 = Pick<WorldStateV2, 'humanPlayerId' | 'players'> & {
  humanPlayerIds?: readonly PlayerId[];
};

/**
 * Returns the canonical human-controlled countries in deterministic order.
 *
 * Older saves and focused unit tests only carry or replace `humanPlayerId`.
 * When the multiplayer list is absent or no longer contains that primary id,
 * treat the state as a legacy single-player state instead of accidentally
 * exempting a stale country from AI control. A valid configured roster keeps
 * defeated seats too: they remain multiplayer spectators after absorption.
 */
export function selectHumanPlayerIdsV2(state: HumanPlayerStateV2): readonly PlayerId[] {
  const configured = state.humanPlayerIds;
  if (!configured?.includes(state.humanPlayerId)) return [state.humanPlayerId];

  return [...new Set(configured)]
    .sort((left, right) => left.localeCompare(right));
}

export function isHumanPlayerV2(state: HumanPlayerStateV2, playerId: PlayerId): boolean {
  return selectHumanPlayerIdsV2(state).includes(playerId);
}

export function hasLivingHumanPlayerV2(state: HumanPlayerStateV2): boolean {
  return selectHumanPlayerIdsV2(state).some((playerId) => Boolean(state.players[playerId]));
}
