import type { PlayerId, WorldStateV2 } from './types';

type HumanPlayerStateV2 = Pick<WorldStateV2, 'humanPlayerId' | 'players'> & {
  humanPlayerIds?: readonly PlayerId[];
};

type HumanDefeatStateV2 = HumanPlayerStateV2 & Pick<WorldStateV2, 'territories' | 'wars'>;

const ORDINARY_COMBAT_MANPOWER_EPSILON_V2 = 0.000000001;

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

/** Two different configured human seats are permanent co-op teammates. */
export function areHumanTeammatesV2(
  state: HumanPlayerStateV2,
  leftId: PlayerId,
  rightId: PlayerId,
): boolean {
  if (leftId === rightId) return false;
  const humans = selectHumanPlayerIdsV2(state);
  return humans.length > 1 && humans.includes(leftId) && humans.includes(rightId);
}

export function hasLivingHumanPlayerV2(state: HumanPlayerStateV2): boolean {
  return selectHumanPlayerIdsV2(state).some((playerId) => Boolean(state.players[playerId]));
}

/**
 * Returns the deterministic victor when every human seat has either lost its
 * land or has no ordinary combat formation left anywhere in the shared
 * empire. A surviving APEX shield is deliberately ignored: it
 * can protect and reinforce national armies, but it cannot be the sole army
 * keeping a campaign alive.
 */
export function selectHumanEmpireDefeatWinnerV2(
  state: HumanDefeatStateV2,
): PlayerId | undefined {
  const humanIds = new Set(selectHumanPlayerIdsV2(state));
  const territories = Object.values(state.territories);
  const humanTerritories = territories.filter((territory) => humanIds.has(territory.owner));
  const ordinaryCombatManpower = humanTerritories.reduce(
    (sum, territory) => sum + Math.max(0, territory.army.manpower),
    0,
  );
  if (humanTerritories.length > 0
    && ordinaryCombatManpower > ORDINARY_COMBAT_MANPOWER_EPSILON_V2) return undefined;

  const activeOpponents = new Map<PlayerId, number>();
  for (const war of state.wars) {
    const attackerHuman = humanIds.has(war.attackerId);
    const defenderHuman = humanIds.has(war.defenderId);
    if (attackerHuman === defenderHuman) continue;
    const opponentId = attackerHuman ? war.defenderId : war.attackerId;
    if (!state.players[opponentId]) continue;
    activeOpponents.set(opponentId, (activeOpponents.get(opponentId) ?? 0) + 1);
  }

  const scores = new Map<PlayerId, {
    capturedHumanCores: number;
    activeHumanWars: number;
    totalTerritories: number;
  }>();
  for (const territory of territories) {
    if (humanIds.has(territory.owner) || !state.players[territory.owner]) continue;
    const score = scores.get(territory.owner) ?? {
      capturedHumanCores: 0,
      activeHumanWars: activeOpponents.get(territory.owner) ?? 0,
      totalTerritories: 0,
    };
    score.totalTerritories += 1;
    if (humanIds.has(territory.coreOwner)) score.capturedHumanCores += 1;
    scores.set(territory.owner, score);
  }
  return [...scores]
    .sort((left, right) => (
      right[1].capturedHumanCores - left[1].capturedHumanCores
        || right[1].activeHumanWars - left[1].activeHumanWars
        || right[1].totalTerritories - left[1].totalTerritories
        || left[0].localeCompare(right[0])
    ))[0]?.[0];
}
