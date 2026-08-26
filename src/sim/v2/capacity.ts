import {
  ARMY_CAPACITY_INITIAL_FORCE_FLOOR,
  ARMY_CAPACITY_STRUCTURAL_POPULATION_SHARE,
  CONQUEST_INITIAL_INTEGRATION_SHARE,
  clamp,
  round,
} from './balance';
import { resetEmptyArmyBaseQualityV2 } from './armyQuality';
import type { WorldContentV2 } from './content';
import { isHumanPlayerV2 } from './humanPlayers';
import { OPENING_ARMY_BONUS_DURATION_TICKS_V2 } from './openingArmyBonus';
import { traitNationContextV2 } from './traitContext';
import {
  countryTraitFactorV2,
  humanStartingArmyMultiplierForContentV2,
} from './traits';
import type { PlayerId, TerritoryId, WorldStateV2 } from './types';

const initialNationCapacityCache = new WeakMap<WorldContentV2, Map<PlayerId, number>>();

export function openingArmyCapacityMultiplierV2(
  state: WorldStateV2,
  content: WorldContentV2,
  ownerId: PlayerId,
): number {
  if (!isHumanPlayerV2(state, ownerId)
    || state.tick >= OPENING_ARMY_BONUS_DURATION_TICKS_V2) return 1;
  const openingMultiplier = humanStartingArmyMultiplierForContentV2(content, ownerId);
  const remainingShare = clamp(
    (OPENING_ARMY_BONUS_DURATION_TICKS_V2 - state.tick)
      / OPENING_ARMY_BONUS_DURATION_TICKS_V2,
    0,
    1,
  );
  return round(1 + (openingMultiplier - 1) * remainingShare, 12);
}

interface ArmyCapacityFactorsV2 {
  readonly trait: number;
  readonly homelandOpening: number;
}

const armyCapacityFactorsV2 = (
  state: WorldStateV2,
  content: WorldContentV2,
  ownerId: PlayerId,
): ArmyCapacityFactorsV2 => ({
  trait: countryTraitFactorV2(
    ownerId,
    'army-capacity',
    traitNationContextV2(state, ownerId),
  ),
  homelandOpening: openingArmyCapacityMultiplierV2(state, content, ownerId),
});

const territoryArmyCapacityFactorV2 = (
  content: WorldContentV2,
  territoryId: TerritoryId,
  ownerId: PlayerId,
  factors: ArmyCapacityFactorsV2,
): number => factors.trait * (
  content.territories[territoryId]?.initialOwnerId === ownerId
    ? factors.homelandOpening
    : 1
);

const liveTerritoryArmyCapacityTargetV2 = (
  state: WorldStateV2,
  content: WorldContentV2,
  territoryId: TerritoryId,
  ownerId: PlayerId,
  factor: number,
): number => {
  const territory = state.territories[territoryId];
  if (!territory || territory.owner !== ownerId) return 0;
  return round(territoryArmyCapacityTargetV2(
    content,
    territoryId,
    ownerId,
    territory.population,
    state.players[ownerId]?.research.effectLevels['force-capacity'] ?? 0,
    territory.integration,
  ) * factor);
};

/** A newly conquered foreign territory can host this extra share of empire forces. */
export const CONQUERED_TERRITORY_EMPIRE_COMBAT_CAP_SHARE_V2 = 0.10;
/** Existing public name for the established opening-homeland allowance. */
export const INTEGRATED_CORE_EMPIRE_COMBAT_CAP_SHARE_V2 = 0.03;
/** A fully integrated foreign territory retains this bounded empire allowance. */
export const INTEGRATED_FOREIGN_TERRITORY_EMPIRE_COMBAT_CAP_SHARE_V2 = 0.05;
/** Explicit semantic alias used by the ownership-aware support selector. */
export const ORIGINAL_HOMELAND_EMPIRE_COMBAT_CAP_SHARE_V2
  = INTEGRATED_CORE_EMPIRE_COMBAT_CAP_SHARE_V2;

/**
 * Foreign occupation starts with a large consolidation envelope, then releases
 * half of that empire-wide deployment room as integration becomes permanent.
 * This is only a stationing ceiling: it neither requires nor creates troops.
 */
export function foreignTerritoryEmpireCombatCapShareV2(integration: number): number {
  const progress = clamp(
    (integration - CONQUEST_INITIAL_INTEGRATION_SHARE)
      / (1 - CONQUEST_INITIAL_INTEGRATION_SHARE),
    0,
    1,
  );
  return round(
    CONQUERED_TERRITORY_EMPIRE_COMBAT_CAP_SHARE_V2
      + (INTEGRATED_FOREIGN_TERRITORY_EMPIRE_COMBAT_CAP_SHARE_V2
        - CONQUERED_TERRITORY_EMPIRE_COMBAT_CAP_SHARE_V2) * progress,
    12,
  );
}

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
  const owner = content.nations[ownerId]!;
  const nationalProfessionalForceShare = owner.balance.initialManpower
    * ARMY_CAPACITY_INITIAL_FORCE_FLOOR
    / Math.max(0.0001, owner.real.population);
  const structuralPopulationShare = Math.max(
    ARMY_CAPACITY_STRUCTURAL_POPULATION_SHARE,
    nationalProfessionalForceShare,
  );
  return round(Math.max(0.0001, Math.max(0, population)
    * structuralPopulationShare
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
  const factors = armyCapacityFactorsV2(state, content, playerId);
  return nationalArmyCapacityTargetWithFactorsV2(
    state,
    content,
    playerId,
    ownedTerritoryIds,
    factors,
  );
}

const nationalArmyCapacityTargetWithFactorsV2 = (
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  ownedTerritoryIds: readonly TerritoryId[],
  factors: ArmyCapacityFactorsV2,
): number => {
  return round(ownedTerritoryIds.reduce((sum, territoryId) => {
    return sum + liveTerritoryArmyCapacityTargetV2(
      state,
      content,
      territoryId,
      playerId,
      territoryArmyCapacityFactorV2(content, territoryId, playerId, factors),
    );
  }, 0));
};

/** National capacity with the temporary player-opening modifier held at 1×. */
export function nationalArmyCapacityAtOneXOpeningV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  ownedTerritoryIds: readonly TerritoryId[] = content.territoryIds,
): number {
  const factors = armyCapacityFactorsV2(state, content, playerId);
  return nationalArmyCapacityTargetWithFactorsV2(
    state,
    content,
    playerId,
    ownedTerritoryIds,
    { ...factors, homelandOpening: 1 },
  );
}

/** Local population shares of the same national rule. */
export function stateArmyCapacityTargetsV2(
  state: WorldStateV2,
  content: WorldContentV2,
  ownerId: PlayerId,
  ownedTerritoryIds: readonly TerritoryId[] = content.territoryIds,
): ReadonlyMap<TerritoryId, number> {
  const factors = armyCapacityFactorsV2(state, content, ownerId);
  return new Map(ownedTerritoryIds.flatMap((id) => {
    const territory = state.territories[id];
    return territory?.owner === ownerId ? [[id, liveTerritoryArmyCapacityTargetV2(
      state,
      content,
      id,
      ownerId,
      territoryArmyCapacityFactorV2(content, id, ownerId, factors),
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
  return liveTerritoryArmyCapacityTargetV2(
    state,
    content,
    territoryId,
    ownerId,
    territoryArmyCapacityFactorV2(
      content,
      territoryId,
      ownerId,
      armyCapacityFactorsV2(state, content, ownerId),
    ),
  );
}

/**
 * Hard ceiling for new recruitment or logistics entering one territory.
 * Opening homeland retains its mature allowance. Foreign territory receives a
 * larger consolidation envelope that declines smoothly throughout integration.
 */
export function stateTerritoryArmySupportCeilingV2(
  state: WorldStateV2,
  content: WorldContentV2,
  territoryId: TerritoryId,
  ownerId: PlayerId,
  empireArmyCapacityOverride?: number,
  empireArmyCapacityAtOneXOpeningOverride?: number,
): number {
  const localCapacity = stateTerritoryArmyCapacityTargetV2(
    state,
    content,
    territoryId,
    ownerId,
  );
  const territory = state.territories[territoryId];
  const isOwned = territory?.owner === ownerId;
  const isOriginalHomeland = isOwned
    && content.territories[territoryId]?.initialOwnerId === ownerId;
  const empireSupportShare = !isOwned ? 0
    : isOriginalHomeland
      ? ORIGINAL_HOMELAND_EMPIRE_COMBAT_CAP_SHARE_V2
      : foreignTerritoryEmpireCombatCapShareV2(territory.integration);
  const empireSupportCapacity = isOriginalHomeland
    ? (empireArmyCapacityOverride
      ?? nationalArmyCapacityTargetV2(state, content, ownerId))
    : (empireArmyCapacityAtOneXOpeningOverride
      ?? nationalArmyCapacityAtOneXOpeningV2(state, content, ownerId));
  const empireSupport = empireSupportShare <= 0 ? 0
    : empireSupportCapacity * empireSupportShare;
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
  // The national multiplier is invariant throughout this pass. Large empires
  // should not rebuild the same war/trait context once for every territory.
  const factorsByOwner = new Map<PlayerId, ArmyCapacityFactorsV2>();
  for (const territoryId of content.territoryIds) {
    const territory = state.territories[territoryId];
    if (!territory) continue;
    let factors = factorsByOwner.get(territory.owner);
    if (factors === undefined) {
      factors = armyCapacityFactorsV2(state, content, territory.owner);
      factorsByOwner.set(territory.owner, factors);
    }
    territory.army.capacity = liveTerritoryArmyCapacityTargetV2(
      state,
      content,
      territoryId,
      territory.owner,
      territoryArmyCapacityFactorV2(
        content,
        territoryId,
        territory.owner,
        factors,
      ),
    );
    territory.army.manpower = round(Math.max(0, territory.army.manpower), 9);
    resetEmptyArmyBaseQualityV2(territory.army, content, territoryId);
  }
}
