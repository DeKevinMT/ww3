import {
  ARMY_CAPACITY_INITIAL_FORCE_FLOOR,
  ARMY_CAPACITY_STRUCTURAL_POPULATION_SHARE,
  CONQUEST_INITIAL_INTEGRATION_SHARE,
  clamp,
  round,
} from './balance';
import { resetEmptyArmyBaseQualityV2 } from './armyQuality';
import type { WorldContentV2 } from './content';
import { selectTerritoryCountryMasteryRuntimeV2 } from './countryMasteryRuntime';
import { isHumanPlayerV2 } from './humanPlayers';
import { OPENING_ARMY_BONUS_DURATION_TICKS_V2 } from './openingArmyBonus';
import { selectRunModifiersV2 } from './runProgression';
import { survivalOrdinaryAiCapacityFactorV2 } from './survivalOrdinaryAi';
import { traitNationContextV2 } from './traitContext';
import {
  countryTraitFactorV2,
  humanStartingArmyMultiplierForContentV2,
} from './traits';
import type { PlayerId, TerritoryId, WorldStateV2 } from './types';

const initialNationCapacityCache = new WeakMap<WorldContentV2, Map<PlayerId, number>>();
const initialNationStructuralNormalizationCache = new WeakMap<
  WorldContentV2,
  Map<PlayerId, number>
>();

export function openingArmyCapacityMultiplierV2(
  state: WorldStateV2,
  content: WorldContentV2,
  ownerId: PlayerId,
): number {
  if (state.commanderForces?.[ownerId]
    || !isHumanPlayerV2(state, ownerId)
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
  readonly survivalOrdinaryAi: number;
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
  ) * selectRunModifiersV2(state, ownerId).nationalCapacityMultiplier,
  homelandOpening: openingArmyCapacityMultiplierV2(state, content, ownerId),
  survivalOrdinaryAi: survivalOrdinaryAiCapacityFactorV2(state, content, ownerId),
});

const territoryArmyCapacityFactorV2 = (
  content: WorldContentV2,
  territoryId: TerritoryId,
  ownerId: PlayerId,
  factors: ArmyCapacityFactorsV2,
): number => factors.trait
  * selectTerritoryCountryMasteryRuntimeV2(
    content,
    territoryId,
    ownerId,
  ).armyCapacityMultiplier
  * (content.territories[territoryId]?.initialOwnerId === ownerId
    ? factors.homelandOpening
    : 1)
  * ((content.territories[territoryId]?.kind ?? 'sovereign') === 'sovereign'
    ? factors.survivalOrdinaryAi
    : 1);

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
function rawTerritoryArmyCapacityTargetV2(
  content: WorldContentV2,
  territoryId: TerritoryId,
  ownerId: PlayerId,
  population: number,
  forceCapacityLevel = 0,
  integration = 1,
): number {
  const territory = content.territories[territoryId];
  if (!territory || !content.nations[ownerId]) return 0;
  const localForceBase = content.nations[territory.initialOwnerId];
  if (!localForceBase) return 0;
  // A conquered population keeps the recruitment institutions of its own
  // country. Applying the new owner's opening force/population ratio here
  // made a tiny, relatively militarised homeland (notably Greenland) unlock
  // an enormous foreign cap and upkeep bill as Signal Purge advanced. Local
  // capacity now stays anchored to the territory's original force structure;
  // integration, the current owner's research and mastery still improve it.
  const localProfessionalForceShare = localForceBase.balance.initialManpower
    * ARMY_CAPACITY_INITIAL_FORCE_FLOOR
    / Math.max(0.0001, localForceBase.real.population);
  const structuralPopulationShare = Math.max(
    ARMY_CAPACITY_STRUCTURAL_POPULATION_SHARE,
    localProfessionalForceShare,
  );
  const capacityPopulation = territory.armyCapacityWeight === undefined
    ? Math.max(0, population)
    : Math.max(0, territory.armyCapacityWeight)
      * Math.max(0, population)
      / Math.max(0.0001, territory.baseline.population);
  return round(Math.max(0.0001, capacityPopulation
    * structuralPopulationShare
    * clamp(integration, 0, 1)
    * (1 + 0.01 * Math.max(0, forceCapacityLevel))));
}

/**
 * Converts the old structural headroom into the authored opening army. This
 * immutable local-origin factor makes the existing starting force the 100%
 * readiness cap while retaining population, integration and research growth.
 */
function initialNationStructuralNormalizationV2(
  content: WorldContentV2,
  originId: PlayerId,
): number {
  let byNation = initialNationStructuralNormalizationCache.get(content);
  if (!byNation) {
    byNation = new Map();
    initialNationStructuralNormalizationCache.set(content, byNation);
  }
  const cached = byNation.get(originId);
  if (cached !== undefined) return cached;
  const nation = content.nations[originId];
  if (!nation) return 0;
  const structuralCapacity = content.territoryIds.reduce((sum, territoryId) => {
    const territory = content.territories[territoryId];
    return territory?.initialOwnerId === originId
      ? sum + rawTerritoryArmyCapacityTargetV2(
        content,
        territoryId,
        originId,
        territory.baseline.population,
      )
      : sum;
  }, 0);
  const normalization = structuralCapacity > 0
    ? nation.balance.initialManpower / structuralCapacity
    : 0;
  byNation.set(originId, normalization);
  return normalization;
}

export function territoryArmyCapacityTargetV2(
  content: WorldContentV2,
  territoryId: TerritoryId,
  ownerId: PlayerId,
  population: number,
  forceCapacityLevel = 0,
  integration = 1,
): number {
  const territory = content.territories[territoryId];
  if (!territory) return 0;
  const openingNormalization = (territory.kind ?? 'sovereign') === 'sovereign'
    ? initialNationStructuralNormalizationV2(content, territory.initialOwnerId)
    : 1;
  return round(rawTerritoryArmyCapacityTargetV2(
    content,
    territoryId,
    ownerId,
    population,
    forceCapacityLevel,
    integration,
  ) * openingNormalization);
}

/**
 * Sovereign countries start at their complete effective cap. Antarctica keeps
 * its authored under-filled machine garrison so real Survival waves still have
 * physical room to enter and traverse the polar logistics chain.
 */
export function initialArmyCapacityRatioV2(content: WorldContentV2, ownerId: PlayerId): number {
  const nation = content.nations[ownerId];
  if (!nation) return 0;
  const homelandIds = content.territoryIds.filter((territoryId) => (
    content.territories[territoryId]?.initialOwnerId === ownerId
  ));
  if (homelandIds.some((territoryId) => (
    (content.territories[territoryId]?.kind ?? 'sovereign') === 'sovereign'
  ))) return nation.balance.initialManpower > 0 ? 1 : 0;
  const target = homelandIds.reduce((sum, territoryId) => {
    const territory = content.territories[territoryId];
    return territory
      ? sum + territoryArmyCapacityTargetV2(
        content,
        territoryId,
        ownerId,
        territory.baseline.population,
      )
      : sum;
  }, 0);
  return target > 0 ? clamp(nation.balance.initialManpower / target, 0, 1) : 0;
}

/** Opening local cap; the national sum equals authored opening manpower. */
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
