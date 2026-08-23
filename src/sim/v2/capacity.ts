import {
  ARMY_CAPACITY_STRUCTURAL_POPULATION_SHARE,
  clamp,
  round,
} from './balance';
import { resetEmptyArmyBaseQualityV2 } from './armyQuality';
import type { WorldContentV2 } from './content';
import type { PlayerId, TerritoryId, WorldStateV2 } from './types';

const initialNationCapacityCache = new WeakMap<WorldContentV2, Map<PlayerId, number>>();

/** A newly conquered foreign territory can host this extra share of empire forces. */
export const CONQUERED_TERRITORY_EMPIRE_COMBAT_CAP_SHARE_V2 = 0.01;
/** Full integration expands that scalable foreign-territory deployment allowance. */
export const INTEGRATED_CORE_EMPIRE_COMBAT_CAP_SHARE_V2 = 0.025;

/**
 * The one canonical army-cap rule. Captured territory unlocks its structural
 * population reserve gradually through the canonical integration share.
 */
export function territoryArmyCapacityTargetV2(
  content: WorldContentV2,
  territoryId: TerritoryId,
  ownerId: PlayerId,
  population: number,
  forceCapacityLevel = 0,
  integration = 1,
): number {
  if (!content.territories[territoryId] || !content.nations[ownerId]) return 0;
  return round(Math.max(0.0001, Math.max(0, population)
    * ARMY_CAPACITY_STRUCTURAL_POPULATION_SHARE
    * clamp(integration, 0, 1)
    * (1 + 0.01 * Math.max(0, forceCapacityLevel))));
}

/** Share of the population cap occupied by the calibrated opening army. */
export function initialArmyCapacityRatioV2(content: WorldContentV2, ownerId: PlayerId): number {
  const nation = content.nations[ownerId];
  if (!nation) return 0;
  const target = content.territoryIds.reduce((sum, territoryId) => {
    const territory = content.territories[territoryId];
    return territory?.initialOwnerId === ownerId
      ? sum + territoryArmyCapacityTargetV2(content, territoryId, ownerId, territory.baseline.population)
      : sum;
  }, 0);
  return target > 0 ? clamp(nation.balance.initialManpower / target, 0, 1) : 0;
}

/** Opening local cap. Opening manpower may fill only part of it. */
export function initialTerritoryArmyCapacityV2(content: WorldContentV2, territoryId: TerritoryId): number {
  const territory = content.territories[territoryId];
  if (!territory) return 0;
  return territoryArmyCapacityTargetV2(
    content,
    territoryId,
    territory.initialOwnerId,
    territory.baseline.population,
  );
}

/** Initial national cap benchmark used only to normalize upkeep. */
export function initialNationArmyCapacityBenchmarkV2(content: WorldContentV2, playerId: PlayerId): number {
  let byNation = initialNationCapacityCache.get(content);
  if (!byNation) {
    byNation = new Map();
    initialNationCapacityCache.set(content, byNation);
  }
  const cached = byNation.get(playerId);
  if (cached !== undefined) return cached;
  const benchmark = round(content.territoryIds.reduce((sum, territoryId) => (
    content.territories[territoryId]?.initialOwnerId === playerId
      ? sum + initialTerritoryArmyCapacityV2(content, territoryId)
      : sum
  ), 0));
  byNation.set(playerId, benchmark);
  return benchmark;
}

export function nationalArmyCapacityTargetV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  ownedTerritoryIds: readonly TerritoryId[] = content.territoryIds,
): number {
  const level = state.players[playerId]?.research.effectLevels['force-capacity'] ?? 0;
  return round(ownedTerritoryIds.reduce((sum, territoryId) => {
    const territory = state.territories[territoryId];
    return territory?.owner === playerId
      ? sum + territoryArmyCapacityTargetV2(
        content,
        territoryId,
        playerId,
        territory.population,
        level,
        territory.integration,
      )
      : sum;
  }, 0));
}

/** Local population shares of the same national rule. */
export function stateArmyCapacityTargetsV2(
  state: WorldStateV2,
  content: WorldContentV2,
  ownerId: PlayerId,
  ownedTerritoryIds: readonly TerritoryId[] = content.territoryIds,
): ReadonlyMap<TerritoryId, number> {
  const level = state.players[ownerId]?.research.effectLevels['force-capacity'] ?? 0;
  return new Map(ownedTerritoryIds.flatMap((id) => {
    const territory = state.territories[id];
    return territory?.owner === ownerId ? [[id, territoryArmyCapacityTargetV2(
      content,
      id,
      ownerId,
      territory.population,
      level,
      territory.integration,
    )] as const] : [];
  }));
}

export function stateTerritoryArmyCapacityTargetV2(
  state: WorldStateV2,
  content: WorldContentV2,
  territoryId: TerritoryId,
  ownerId: PlayerId,
): number {
  const territory = state.territories[territoryId];
  if (!territory || territory.owner !== ownerId) return 0;
  return territoryArmyCapacityTargetV2(
    content,
    territoryId,
    ownerId,
    territory.population,
    state.players[ownerId]?.research.effectLevels['force-capacity'] ?? 0,
    territory.integration,
  );
}

/** Hard ceiling for new recruitment or logistics entering one territory. */
export function stateTerritoryArmySupportCeilingV2(
  state: WorldStateV2,
  content: WorldContentV2,
  territoryId: TerritoryId,
  ownerId: PlayerId,
  empireArmyCapacityOverride?: number,
): number {
  const localCapacity = stateTerritoryArmyCapacityTargetV2(
    state,
    content,
    territoryId,
    ownerId,
  );
  const territory = state.territories[territoryId];
  const isForeignTerritory = Boolean(
    territory
      && territory.owner === ownerId
      && content.territories[territoryId]?.initialOwnerId !== ownerId,
  );
  const empireSupportShare = !isForeignTerritory ? 0
    : territory!.integration >= 1
      ? INTEGRATED_CORE_EMPIRE_COMBAT_CAP_SHARE_V2
      : CONQUERED_TERRITORY_EMPIRE_COMBAT_CAP_SHARE_V2;
  const empireSupport = empireSupportShare <= 0 ? 0
    : (empireArmyCapacityOverride
      ?? nationalArmyCapacityTargetV2(state, content, ownerId)) * empireSupportShare;
  return round(
    localCapacity + empireSupport,
    9,
  );
}

/**
 * Stable local deployment envelope. A legacy/external overshoot is never
 * deleted; bounded logistics may rehome its excess when another owned
 * territory has room, while attrition and extreme-crisis demobilisation can
 * reduce national headcount.
 */
export function stateTerritoryArmyDeploymentLimitV2(
  state: WorldStateV2,
  content: WorldContentV2,
  territoryId: TerritoryId,
  ownerId: PlayerId,
): number {
  const territory = state.territories[territoryId];
  if (!territory || territory.owner !== ownerId) return 0;
  return Math.max(
    stateTerritoryArmySupportCeilingV2(state, content, territoryId, ownerId),
    Math.max(0, territory.army.manpower),
  );
}

/**
 * Restores every local cap from live population and research. Capacity gates
 * future recruitment; recalculation never deletes trained personnel.
 */
export function synchronizeArmyCapacityV2(state: WorldStateV2, content: WorldContentV2): void {
  for (const territoryId of content.territoryIds) {
    const territory = state.territories[territoryId];
    if (!territory) continue;
    territory.army.capacity = stateTerritoryArmyCapacityTargetV2(
      state,
      content,
      territoryId,
      territory.owner,
    );
    territory.army.manpower = round(Math.max(0, territory.army.manpower), 9);
    resetEmptyArmyBaseQualityV2(territory.army, content, territoryId);
  }
}
