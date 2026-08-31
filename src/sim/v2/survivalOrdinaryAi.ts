import {
  isRogueAiNationV2,
  type WorldContentV2,
} from './content';
import { round } from './balance';
import { isHumanPlayerV2 } from './humanPlayers';
import type { PlayerId, TerritoryId, WorldStateV2 } from './types';

/**
 * Every ordinary sovereign begins Survival fully deployed at its real live
 * cap. Capacity, finance and later recruitment use the normal simulation.
 */
export const SURVIVAL_ORDINARY_AI_STARTING_FORCE_FACTOR_V2 = 1;
export const SURVIVAL_ORDINARY_AI_STARTING_RESERVE_FACTOR_V2 = 0;
/** The surviving Arctic sovereign bloc. The run-local empire name is its durable tag. */
export const SURVIVAL_DAWNLINE_ACCORD_NAME_V2 = 'The Dawnline Accord';

export function isSurvivalDawnlineNationV2(
  state: WorldStateV2,
  playerId: PlayerId,
): boolean {
  return state.players[playerId]?.empireName === SURVIVAL_DAWNLINE_ACCORD_NAME_V2;
}

/** Compatibility export: Survival no longer changes ordinary Army Capacity. */
export const SURVIVAL_ORDINARY_AI_CAPACITY_FACTOR_V2 = 1;

/**
 * Compatibility export for the retired reinforcement limiter. Active army
 * refill is controller-neutral and uses the normal peace-only recruitment.
 */
export const SURVIVAL_ORDINARY_AI_REINFORCEMENT_FACTOR_V2 = 1;

/** One canonical scope check for non-player, non-Dawnline sovereigns in Survival. */
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

/** Neutral compatibility helper; it no longer scales any active system. */
export function survivalOrdinaryAiReinforcementFactorV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): number {
  void state;
  void content;
  void playerId;
  return SURVIVAL_ORDINARY_AI_REINFORCEMENT_FACTOR_V2;
}

/**
 * Canonical tick-zero readiness pass. Every non-Rogue sovereign deploys at
 * 100% of its already-synchronised live cap. Antarctica is untouched.
 * Calling this again at tick zero is intentionally idempotent, which keeps
 * country selection and multiplayer roster preparation deterministic.
 */
export function applySurvivalOpeningArmyReadinessV2(
  state: WorldStateV2,
  content: WorldContentV2,
): void {
  if (content.metadata?.scenarioId !== 'survival' || state.tick !== 0) return;
  for (const territoryId of content.territoryIds) {
    const definition = content.territories[territoryId];
    const territory = state.territories[territoryId];
    if (!definition || !territory || (definition.kind ?? 'sovereign') !== 'sovereign') continue;
    if (isRogueAiNationV2(content, territory.owner)) continue;
    territory.army.manpower = round(
      territory.army.capacity * SURVIVAL_ORDINARY_AI_STARTING_FORCE_FACTOR_V2,
      9,
    );
  }
}
