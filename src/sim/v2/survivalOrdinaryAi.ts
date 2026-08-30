import {
  isRogueAiNationV2,
  type WorldContentV2,
} from './content';
import { isHumanPlayerV2 } from './humanPlayers';
import type { PlayerId, TerritoryId, WorldStateV2 } from './types';

/**
 * Compatibility sentinel for older callers. Ordinary Survival AI now starts
 * fully staffed relative to its deliberately reduced effective capacity.
 */
export const SURVIVAL_ORDINARY_AI_STARTING_FORCE_FACTOR_V2 = 1;
export const SURVIVAL_ORDINARY_AI_STARTING_RESERVE_FACTOR_V2 = 0.01;
/** The surviving sovereign bloc. The run-local empire name is its durable tag. */
export const SURVIVAL_DAWNLINE_ACCORD_NAME_V2 = 'The Dawnline Accord';

export function isSurvivalDawnlineNationV2(
  state: WorldStateV2,
  playerId: PlayerId,
): boolean {
  return state.players[playerId]?.empireName === SURVIVAL_DAWNLINE_ACCORD_NAME_V2;
}

/**
 * Ordinary Survival states field about 20% of their pristine-world force.
 * Population damage is modeled separately and does not reduce the military
 * power selector a second time, so this capacity factor is the full authored
 * reduction. The smaller army starts at 100% of that reduced cap.
 */
export const SURVIVAL_ORDINARY_AI_CAPACITY_FACTOR_V2 = 0.20;

/**
 * Reserve training and reserve mobilisation keep their existing 10% Survival
 * cadence. Active army refill is controller-neutral and is handled separately
 * from this reserve-only compatibility factor.
 */
export const SURVIVAL_ORDINARY_AI_REINFORCEMENT_FACTOR_V2 = 0.10;

/** One canonical scope check for the damaged, non-player world in Survival. */
export function isSurvivalOrdinaryAiNationV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): boolean {
  return content.metadata?.scenarioId === 'survival'
    && Boolean(state.players[playerId])
    && !isHumanPlayerV2(state, playerId)
    && !isRogueAiNationV2(content, playerId)
    && !isSurvivalDawnlineNationV2(state, playerId);
}

/** Owner-level factor, resolved once per capacity synchronization pass. */
export function survivalOrdinaryAiCapacityFactorV2(
  state: WorldStateV2,
  content: WorldContentV2,
  ownerId: PlayerId,
): number {
  return isSurvivalOrdinaryAiNationV2(state, content, ownerId)
    ? SURVIVAL_ORDINARY_AI_CAPACITY_FACTOR_V2
    : 1;
}

/** Antarctica never inherits the ordinary-world force-cap shock. */
export function survivalOrdinaryAiTerritoryCapacityFactorV2(
  state: WorldStateV2,
  content: WorldContentV2,
  territoryId: TerritoryId,
  ownerId: PlayerId,
): number {
  const kind = content.territories[territoryId]?.kind ?? 'sovereign';
  return kind === 'sovereign'
    ? survivalOrdinaryAiCapacityFactorV2(state, content, ownerId)
    : 1;
}

/** Existing reserve training and mobilisation limiter. */
export function survivalOrdinaryAiReinforcementFactorV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): number {
  return isSurvivalOrdinaryAiNationV2(state, content, playerId)
    ? SURVIVAL_ORDINARY_AI_REINFORCEMENT_FACTOR_V2
    : 1;
}
