import {
  AI_HEALTHY_ARMY_TARGET,
  AI_SEVERE_DEBT_REVENUE_WEEKS,
  COMBAT_EXPERIENCE_ATTACK_BONUS_PER_SCORE,
  COMBAT_EXPERIENCE_CASUALTY_REDUCTION_PER_SCORE,
  COMBAT_EXPERIENCE_DEFENSE_BONUS_PER_SCORE,
  COMBAT_EXPERIENCE_MAX_ATTACK_BONUS,
  COMBAT_EXPERIENCE_MAX_CASUALTY_REDUCTION,
  COMBAT_EXPERIENCE_MAX_DEFENSE_BONUS,
  CONQUEST_INITIAL_INTEGRATION_SHARE,
  ECONOMY_ANNUAL_GROWTH_MAX,
  ECONOMY_ANNUAL_GROWTH_MIN,
  ECONOMY_BASE_ANNUAL_GROWTH,
  ECONOMY_FOOD_SHORTAGE_MAX_DRAG,
  ECONOMY_FOOD_SURPLUS_MAX_BONUS,
  ECONOMY_INVESTMENT_GROWTH_MULTIPLIER,
  ECONOMY_RESEARCH_GROWTH_PER_LEVEL,
  NUCLEAR_POWER_ATTACK_BONUS_PER_LEVEL,
  NUCLEAR_POWER_MAX_LEVEL,
  nuclearPowerTierCostV2,
  DEFENSE_RESEARCH_HALF_SATURATION,
  DEFENSE_RESEARCH_MAX_BONUS,
  FOOD_ACCESS_RESEARCH_RELIEF_PER_LEVEL,
  FOOD_ARMY_LOGISTICS_POWER,
  FOOD_ARMY_LOGISTICS_RATE,
  FOOD_ARMY_LOGISTICS_SCALE,
  FOOD_DOMESTIC_COST_PER_MILLION,
  FOOD_ECONOMY_YIELD_FLOOR,
  FOOD_ECONOMY_YIELD_WEIGHT,
  FOOD_IMPORT_COST_PER_MILLION,
  FOOD_INDIA_ORIGIN_YIELD_MULTIPLIER,
  FOOD_PEOPLE_MILLIONS_PER_KM2,
  FOOD_POPULATION_PRESSURE_POWER,
  FOOD_POPULATION_PRESSURE_RATE,
  FOOD_POPULATION_PRESSURE_SCALE,
  FOOD_PRESSURE_RESEARCH_RELIEF_PER_LEVEL,
  FOOD_PRICE_LEVEL_FLOOR,
  FOOD_PRICE_LEVEL_PER_WEALTH_THOUSAND,
  FOOD_PRICE_LEVEL_WEALTH_CAP,
  FOOD_SHORTAGE_POPULATION_LOSS,
  FOOD_STORAGE_BASE_WEEKS,
  FOOD_STORAGE_MILLIONS_PER_KM2,
  FOOD_MAX_STOCK_WEEKS,
  FOOD_TARGET_WEEKS,
  EXTREME_CRISIS_DEMOBILIZATION_RATE,
  EXTREME_CRISIS_FOOD_COVERAGE,
  EXTREME_CRISIS_FOOD_RESERVE_WEEKS,
  EXTREME_CRISIS_MAX_UPKEEP_FUNDING,
  PASSIVE_RECRUITMENT_CAPACITY_RATE,
  PASSIVE_RECRUITMENT_TRAINING_BONUS,
  PEACE_RECRUITMENT_ACCELERATION_COST_MULTIPLIER,
  PEACE_RECRUITMENT_ACCELERATION_MULTIPLIER,
  RAPID_RECRUITMENT_COOLDOWN_TICKS,
  RAPID_RECRUITMENT_COST_MULTIPLIER,
  RESEARCH_SURGE_COOLDOWN_TICKS,
  RESEARCH_SURGE_COST_REVENUE_WEEKS,
  RESEARCH_SURGE_POPULATION_SCALE,
  RESEARCH_SURGE_PROGRESS_WEEKS,
  RESEARCH_SURGE_TERRITORY_SCALE,
  RESEARCH_BRANCHES,
  RESEARCH_BRANCH_BASE_RP,
  RESEARCH_BRANCH_EFFECTS,
  RESEARCH_BASE_COST_SCALE,
  RESEARCH_COST_GROWTH,
  RESEARCH_MASTERY_POWER,
  RIVAL_AI_PEACE_RESERVE_WEEKS,
  SUPER_AI_PEACE_RESERVE_WEEKS,
  SUPER_AI_WAR_BASE_RUNWAY_WEEKS,
  SUPER_AI_WAR_FRONT_RUNWAY_WEEKS,
  WAR_RECRUITMENT_ACCELERATION_COST_MULTIPLIER,
  WAR_RECRUITMENT_ACCELERATION_MULTIPLIER,
  WAR_ACCESS_OPERATION_MULTIPLIER,
  WAR_OPERATION_COST_PER_MILLION,
  WAR_OPERATION_REVENUE_SHARE,
  WAR_RECRUITMENT_THROUGHPUT_FACTOR,
  researchFundingShareV2,
  clamp,
  diminishingResearchLevelV2,
  round,
} from './balance';
import { WORLD_CONTENT_V2, type WorldContentV2 } from './content';
import { calculateFiscalCapacityV2 } from './fiscal';
import { localArmyBaseQualityV2, mixArmyBaseQualityV2, nationArmyBaseQualityV2 } from './armyQuality';
import {
  initialNationArmyCapacityBenchmarkV2,
  nationalArmyCapacityTargetV2,
  stateArmyCapacityTargetsV2,
} from './capacity';
import { nationalAiEfficiencyV2, optimizeNationalAiPlanV2 } from './nationalAi';
import { initialManualActionCostV2, manualActionUseMultiplierV2 } from './manualActions';
import {
  nationIdV2,
  type ArmyStateV2,
  ArmyStrengthV2,
  BudgetPolicyV2,
  CombatExperienceViewV2,
  ConquestForecastV2,
  EconomicOutputLedgerV2,
  FrontOperationV2,
  NationStateV2,
  NationViewV2,
  NationalEconomyV2,
  NationalAiPlanV2,
  NuclearPowerViewV2,
  PlayerId,
  PopulationDynamicsV2,
  RapidRecruitmentTermsV2,
  RankingEntryV2,
  ResearchBranchV2,
  ResearchEffectV2,
  ResearchPortfolioV2,
  ResearchSurgeTermsV2,
  TerritoryId,
  TerrainType,
  TerritoryStateV2,
  TerritoryViewV2,
  TotalManpowerV2,
  WarAccessV2,
  WarStateV2,
  WeeklyFinanceBreakdownV2,
  WeeklyManpowerProjectionV2,
  WorldStateV2,
} from './types';

const nationIdCache = new WeakMap<WorldStateV2, PlayerId[]>();
const territoryIdCache = new WeakMap<WorldStateV2, TerritoryId[]>();
interface TerritoryIndexV2 {
  owned: Map<PlayerId, TerritoryId[]>;
  controlled: Map<PlayerId, TerritoryId[]>;
}
const territoryIndexCache = new WeakMap<WorldStateV2, TerritoryIndexV2>();

const FOOD_TERRAIN_YIELD: Readonly<Record<TerrainType, number>> = {
  plains: 1.20,
  coastal: 1.00,
  urban: 0.78,
  jungle: 0.72,
  mountain: 0.58,
  desert: 0.36,
  arctic: 0.16,
};

/** Ephemeral derived values for one simulation phase; never stored in canonical state. */
export interface PowerSnapshotV2 {
  byNation: ReadonlyMap<PlayerId, number>;
  leaderPower: number;
  leaderBreakthroughs: number;
}

/** Ephemeral national display average derived from canonical deployed armies. */
export interface MilitaryBaseRatingsV2 {
  attack: number;
  defense: number;
}

export interface MilitaryBaseSnapshotV2 {
  byNation: ReadonlyMap<PlayerId, MilitaryBaseRatingsV2>;
}

export const sortedNationIdsV2 = (state: WorldStateV2): PlayerId[] => {
  let ids = nationIdCache.get(state);
  if (!ids) {
    ids = (Object.keys(state.players) as PlayerId[]).sort((a, b) => a.localeCompare(b));
    nationIdCache.set(state, ids);
  }
  return ids;
};

export const sortedTerritoryIdsV2 = (state: WorldStateV2): TerritoryId[] => {
  let ids = territoryIdCache.get(state);
  if (!ids) {
    ids = (Object.keys(state.territories) as TerritoryId[]).sort((a, b) => a.localeCompare(b));
    territoryIdCache.set(state, ids);
  }
  return ids;
};

function territoryIndexV2(state: WorldStateV2): TerritoryIndexV2 {
  let index = territoryIndexCache.get(state);
  if (index) return index;
  index = { owned: new Map(), controlled: new Map() };
  for (const id of sortedTerritoryIdsV2(state)) {
    const territory = state.territories[id]!;
    const owned = index.owned.get(territory.owner) ?? [];
    owned.push(id);
    index.owned.set(territory.owner, owned);
    if (territory.control && territory.control.controller !== territory.owner) {
      const controlled = index.controlled.get(territory.control.controller) ?? [];
      controlled.push(id);
      index.controlled.set(territory.control.controller, controlled);
    }
  }
  territoryIndexCache.set(state, index);
  return index;
}

/** Call whenever canonical owner/control membership changes during a tick. */
export function invalidateTerritoryIndexV2(state: WorldStateV2): void {
  territoryIndexCache.delete(state);
}

/** National display/outcome average. Combat always reads each local army. */
export function createMilitaryBaseSnapshotV2(
  state: WorldStateV2,
  content: WorldContentV2,
): MilitaryBaseSnapshotV2 {
  interface Accumulator { attackMass: number; defenseMass: number; manpower: number }
  const accumulators = new Map<PlayerId, Accumulator>();
  for (const territoryId of sortedTerritoryIdsV2(state)) {
    const territory = state.territories[territoryId];
    if (!territory || territory.army.manpower <= 0) continue;
    const accumulator = accumulators.get(territory.owner) ?? {
      attackMass: 0, defenseMass: 0, manpower: 0,
    };
    accumulator.attackMass += territory.army.baseAttack * territory.army.manpower;
    accumulator.defenseMass += territory.army.baseDefense * territory.army.manpower;
    accumulator.manpower += territory.army.manpower;
    accumulators.set(territory.owner, accumulator);
  }

  const byNation = new Map<PlayerId, MilitaryBaseRatingsV2>();
  for (const playerId of sortedNationIdsV2(state)) {
    const fallback = nationArmyBaseQualityV2(content, playerId);
    const accumulator = accumulators.get(playerId);
    if (!accumulator || accumulator.manpower <= 0) {
      byNation.set(playerId, fallback);
      continue;
    }
    byNation.set(playerId, {
      attack: round(accumulator.attackMass / accumulator.manpower, 9),
      defense: round(accumulator.defenseMass / accumulator.manpower, 9),
    });
  }
  return { byNation };
}

export function selectMilitaryBaseRatingsV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  snapshot: MilitaryBaseSnapshotV2 = createMilitaryBaseSnapshotV2(state, content),
): MilitaryBaseRatingsV2 {
  return snapshot.byNation.get(playerId) ?? nationArmyBaseQualityV2(content, playerId);
}

export function selectNationStateV2(state: WorldStateV2, playerId: PlayerId): NationStateV2 | undefined {
  return state.players[playerId];
}

export function selectTerritoriesOfV2(state: WorldStateV2, playerId: PlayerId): TerritoryViewV2[] {
  return (territoryIndexV2(state).owned.get(playerId) ?? [])
    .map((id) => ({ id, ...state.territories[id]! }));
}

export function selectIsEliminatedV2(state: WorldStateV2, playerId: PlayerId): boolean {
  return (territoryIndexV2(state).owned.get(playerId)?.length ?? 0) === 0;
}

export function selectNationViewV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): NationViewV2 | undefined {
  const nation = state.players[playerId];
  const definition = content.nations[playerId];
  if (!nation || !definition) return undefined;
  const army = selectTotalManpowerV2(state, playerId);
  return {
    id: playerId,
    ...nation,
    manpower: army.deployed,
    capacity: army.capacity,
    name: nation.empireName || definition.name,
    shortName: nation.empireName || definition.shortName,
    color: definition.color,
    cssColor: definition.cssColor,
    darkColor: definition.darkColor,
    sigil: definition.sigil,
    profile: definition.profile,
    isHuman: state.humanPlayerId === playerId,
    eliminated: selectIsEliminatedV2(state, playerId),
  };
}

export function selectActiveWarBetweenV2(state: WorldStateV2, leftId: PlayerId, rightId: PlayerId): WarStateV2 | undefined {
  return state.wars.find((war) => (
    (war.attackerId === leftId && war.defenderId === rightId)
    || (war.attackerId === rightId && war.defenderId === leftId)
  ));
}

export function selectWarsOfV2(state: WorldStateV2, playerId: PlayerId): WarStateV2[] {
  return state.wars.filter((war) => war.attackerId === playerId || war.defenderId === playerId);
}

/**
 * One transparent wartime-pressure model shared by income, long-run growth and
 * the UI. Extra fronts hurt more than the first; accumulated fatigue keeps a
 * small recovery tail after peace instead of restoring the economy overnight.
 */
export function selectWarPressureV2(state: WorldStateV2, playerId: PlayerId): {
  fronts: number;
  outputPenalty: number;
  economyGrowthDrag: number;
  populationGrowthDrag: number;
  researchPenalty: number;
} {
  const fronts = selectWarsOfV2(state, playerId).length;
  const fatigue = clamp(state.players[playerId]?.warFatigue ?? 0, 0, 100);
  const peaceTransition = fronts === 0 ? clamp(fatigue / 8, 0, 1) : 0;
  return {
    fronts,
    outputPenalty: round(clamp(
      fronts > 0 ? 0.07 + 0.04 * (fronts - 1) + 0.0012 * fatigue : 0.05 * peaceTransition,
      0,
      fronts > 0 ? 0.35 : 0.05,
    )),
    economyGrowthDrag: round(fronts > 0
      ? 0.018 + 0.008 * (fronts - 1) + 0.00010 * fatigue
      : 0.012 * peaceTransition),
    populationGrowthDrag: round(fronts > 0 ? 0.006 * fronts + 0.00006 * fatigue : 0.004 * peaceTransition),
    researchPenalty: round(clamp(
      fronts > 0 ? 0.25 + 0.10 * (fronts - 1) + 0.001 * fatigue : 0.15 * peaceTransition,
      0,
      0.65,
    )),
  };
}

function attributedShare(territory: TerritoryStateV2, playerId: PlayerId): number {
  // Front-line control is purely military and visual. After legal capture,
  // integration is the one visible share used by population capacity, output,
  // revenue and food until the annexed territory is fully incorporated.
  return territory.owner === playerId ? clamp(territory.integration, 0, 1) : 0;
}

export function selectControlledPopulationV2(state: WorldStateV2, playerId: PlayerId): number {
  const index = territoryIndexV2(state);
  let population = 0;
  for (const id of index.owned.get(playerId) ?? []) {
    const territory = state.territories[id]!;
    population += territory.population * attributedShare(territory, playerId);
  }
  return population;
}

export function selectNationalEconomyV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): NationalEconomyV2 {
  const ledger = selectEconomicOutputLedgerV2(state, content, playerId);
  return {
    population: ledger.population,
    effectivePopulation: ledger.effectivePopulation,
    wealthPerPerson: ledger.wealthPerPerson,
    output: ledger.demographicOutput,
    controlledOutput: ledger.taxableOutput,
    taxRate: ledger.taxRate,
    dynamicTaxRate: ledger.dynamicTaxRate,
    weeklyRevenue: ledger.weeklyTaxRevenue,
  };
}

export function selectEconomicOutputLedgerV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): EconomicOutputLedgerV2 {
  let population = 0;
  let productivePopulation = 0;
  let demographicOutput = 0;
  let integratedOutput = 0;
  const index = territoryIndexV2(state);
  for (const id of index.owned.get(playerId) ?? []) {
    const territory = state.territories[id]!;
    // Territory economy is total live output, not output per baseline citizen.
    // Population growth therefore changes wealth per person but does not
    // silently multiply GDP a second time. GDP itself grows only through the
    // explicit economy-growth phase, conquest or reconstruction.
    const territoryDemographicOutput = Math.max(0, territory.economy);
    const share = attributedShare(territory, playerId);
    demographicOutput += territoryDemographicOutput;
    integratedOutput += territoryDemographicOutput * share;
    population += territory.population;
    productivePopulation += territory.population * share;
  }
  const wealthPerPerson = productivePopulation > 0 ? integratedOutput / productivePopulation : 0;
  const fiscalCapacity = calculateFiscalCapacityV2(productivePopulation, wealthPerPerson);
  const configuredReferenceRate = content.nations[playerId]?.real.taxRevenueShare;
  const referenceTaxRate = Number.isFinite(configuredReferenceRate)
    ? configuredReferenceRate! : null;
  return {
    population: round(population),
    productivePopulation: round(productivePopulation),
    effectivePopulation: round(fiscalCapacity.effectivePopulation, 9),
    wealthPerPerson: round(fiscalCapacity.wealthPerPerson, 9),
    demographicOutput: round(demographicOutput),
    conditionAdjustedOutput: round(demographicOutput),
    integratedOutput: round(integratedOutput),
    warOutputPenalty: 0,
    warAdjustedOutput: round(integratedOutput),
    taxableOutput: round(fiscalCapacity.taxableOutput),
    dynamicTaxRate: round(fiscalCapacity.dynamicTaxRate, 9),
    taxRate: round(fiscalCapacity.dynamicTaxRate, 9),
    referenceTaxRate: referenceTaxRate === null ? null : round(referenceTaxRate, 9),
    weeklyTaxRevenue: round(fiscalCapacity.weeklyTaxRevenue),
  };
}

export function selectTotalManpowerV2(state: WorldStateV2, playerId: PlayerId): TotalManpowerV2 {
  let deployed = 0;
  let capacity = 0;
  for (const id of territoryIndexV2(state).owned.get(playerId) ?? []) {
    deployed += state.territories[id]!.army.manpower;
    capacity += state.territories[id]!.army.capacity;
  }
  return { deployed: round(deployed), capacity: round(capacity) };
}

/**
 * Empire-wide institutional experience. The canonical value is deliberately
 * uncapped; square-root scoring and bounded modifiers provide diminishing
 * returns without throwing earned history away.
 */
export function selectCombatExperienceV2(
  state: WorldStateV2,
  playerId: PlayerId,
): CombatExperienceViewV2 {
  const experience = Math.max(0, state.players[playerId]?.combatExperience ?? 0);
  const score = Math.sqrt(experience);
  return {
    experience: round(experience, 9),
    score: round(score, 9),
    attackMultiplier: round(1 + Math.min(
      COMBAT_EXPERIENCE_MAX_ATTACK_BONUS,
      COMBAT_EXPERIENCE_ATTACK_BONUS_PER_SCORE * score,
    ), 9),
    defenseMultiplier: round(1 + Math.min(
      COMBAT_EXPERIENCE_MAX_DEFENSE_BONUS,
      COMBAT_EXPERIENCE_DEFENSE_BONUS_PER_SCORE * score,
    ), 9),
    casualtyMultiplier: round(1 - Math.min(
      COMBAT_EXPERIENCE_MAX_CASUALTY_REDUCTION,
      COMBAT_EXPERIENCE_CASUALTY_REDUCTION_PER_SCORE * score,
    ), 9),
  };
}

/** Combat experience changes quality and losses, never the army's headcount. */
export function selectArmyCombatManpowerV2(
  _state: WorldStateV2,
  _playerId: PlayerId,
  army: ArmyStateV2,
): number {
  return round(Math.max(0, army.manpower), 9);
}

export function selectNuclearPowerV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): NuclearPowerViewV2 {
  const breakthroughs = state.players[playerId]?.research.breakthroughs['advanced-weapons'] ?? 0;
  const initialLevel = content.nations[playerId]?.nuclearPowerLevel ?? 0;
  let level = Math.min(NUCLEAR_POWER_MAX_LEVEL, initialLevel);
  let spentBreakthroughs = 0;
  while (level < NUCLEAR_POWER_MAX_LEVEL) {
    const tierCost = nuclearPowerTierCostV2(level + 1);
    if (breakthroughs - spentBreakthroughs < tierCost) break;
    spentBreakthroughs += tierCost;
    level += 1;
  }
  const maxed = level >= NUCLEAR_POWER_MAX_LEVEL;
  const nextTierCost = maxed ? 0 : nuclearPowerTierCostV2(level + 1);
  const nextLevelAt = maxed ? spentBreakthroughs : spentBreakthroughs + nextTierCost;
  return {
    level,
    attackBonus: round(level * NUCLEAR_POWER_ATTACK_BONUS_PER_LEVEL),
    advancedWeaponsBreakthroughs: breakthroughs,
    nextLevelAt,
    progressRatio: maxed ? 1 : clamp(
      (breakthroughs - spentBreakthroughs) / Math.max(1, nextTierCost),
      0,
      1,
    ),
    maxed,
  };
}

export function selectEffectiveAttackV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  army: ArmyStateV2,
  _militaryBaseSnapshot?: MilitaryBaseSnapshotV2,
): number {
  const level = state.players[playerId]?.research.effectLevels.attack ?? 0;
  const deterrence = selectNuclearPowerV2(state, content, playerId);
  const combatExperience = selectCombatExperienceV2(state, playerId);
  const researchMultiplier = (1 + 0.01 * level) * (1 + deterrence.attackBonus);
  return round(army.baseAttack * researchMultiplier * combatExperience.attackMultiplier);
}

export function selectEffectiveDefenseV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  army: ArmyStateV2,
  _militaryBaseSnapshot?: MilitaryBaseSnapshotV2,
): number {
  const level = state.players[playerId]?.research.effectLevels.defense ?? 0;
  const researchBonus = level <= 0 ? 0
    : DEFENSE_RESEARCH_MAX_BONUS * level / (level + DEFENSE_RESEARCH_HALF_SATURATION);
  const combatExperience = selectCombatExperienceV2(state, playerId);
  const researchMultiplier = 1 + researchBonus;
  return round(army.baseDefense * researchMultiplier * combatExperience.defenseMultiplier);
}

export function selectTerritoryPowerV2(
  state: WorldStateV2,
  content: WorldContentV2,
  territoryId: TerritoryId,
  militaryBaseSnapshot?: MilitaryBaseSnapshotV2,
): number {
  const territory = state.territories[territoryId];
  if (!territory) return 0;
  const attack = selectEffectiveAttackV2(state, content, territory.owner, territory.army, militaryBaseSnapshot);
  const defense = selectEffectiveDefenseV2(state, content, territory.owner, territory.army, militaryBaseSnapshot);
  return round(1_000 * selectArmyCombatManpowerV2(state, territory.owner, territory.army) * (0.55 * attack + 0.45 * defense)
    * (0.65 + 0.35 * territory.condition));
}

export function selectCurrentPowerV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  militaryBaseSnapshot?: MilitaryBaseSnapshotV2,
): number {
  return round((territoryIndexV2(state).owned.get(playerId) ?? [])
    .reduce((sum, id) => sum + selectTerritoryPowerV2(state, content, id, militaryBaseSnapshot), 0));
}

/** Live conventional army power, including empire-wide combat experience. */
export function selectConventionalPowerV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  militaryBaseSnapshot?: MilitaryBaseSnapshotV2,
): number {
  return round((territoryIndexV2(state).owned.get(playerId) ?? []).reduce((sum, id) => {
    const territory = state.territories[id]!;
    const attack = selectEffectiveAttackV2(state, content, playerId, territory.army, militaryBaseSnapshot);
    const defense = selectEffectiveDefenseV2(state, content, playerId, territory.army, militaryBaseSnapshot);
    return sum + 1_000 * selectArmyCombatManpowerV2(state, playerId, territory.army)
      * (0.55 * attack + 0.45 * defense)
      * (0.65 + 0.35 * territory.condition);
  }, 0));
}

export function createPowerSnapshotV2(state: WorldStateV2, content: WorldContentV2): PowerSnapshotV2 {
  const byNation = new Map<PlayerId, number>();
  let leaderPower = 1;
  let leaderBreakthroughs = 0;
  for (const playerId of sortedNationIdsV2(state)) {
    const power = selectCurrentPowerV2(state, content, playerId);
    byNation.set(playerId, power);
    if (!selectIsEliminatedV2(state, playerId)) {
      leaderPower = Math.max(leaderPower, power);
      leaderBreakthroughs = Math.max(leaderBreakthroughs,
        Object.values(state.players[playerId]!.research.breakthroughs).reduce((sum, value) => sum + value, 0));
    }
  }
  return { byNation, leaderPower, leaderBreakthroughs };
}

export function selectEffectivePowerV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  army: ArmyStateV2,
  militaryBaseSnapshot?: MilitaryBaseSnapshotV2,
): number {
  const attack = selectEffectiveAttackV2(state, content, playerId, army, militaryBaseSnapshot);
  const defense = selectEffectiveDefenseV2(state, content, playerId, army, militaryBaseSnapshot);
  return round(1_000 * selectArmyCombatManpowerV2(state, playerId, army) * (0.55 * attack + 0.45 * defense));
}

export function selectCatchUpFactorV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  powerSnapshot: PowerSnapshotV2 = createPowerSnapshotV2(state, content),
): number {
  const powerGap = clamp(1 - (powerSnapshot.byNation.get(playerId) ?? 0) / powerSnapshot.leaderPower, 0, 1);
  return 1 + 0.35 * (content.nations[playerId]?.ambition ?? 0) * powerGap;
}

/** Technology-specific catch-up, deliberately independent of AI ambition. */
export function selectResearchCatchUpFactorV2(
  _state: WorldStateV2,
  _content: WorldContentV2,
  _playerId: PlayerId,
  _powerSnapshot?: PowerSnapshotV2,
): number {
  return 1;
}

/**
 * One stored breakthrough level is not equally valuable to every country.
 * Demographic research scales down as the empire population grows; economic
 * research has diminishing returns as output per person approaches rich-state
 * levels. Other effects remain the clear +1% baseline.
 */
export function selectResearchEffectImpactV2(
  _state: WorldStateV2,
  _content: WorldContentV2,
  _playerId: PlayerId,
  _effect: ResearchEffectV2,
): number {
  return 1;
}

export function selectEffectiveRecoveryV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  army: ArmyStateV2,
  powerSnapshot?: PowerSnapshotV2,
): number {
  const nation = state.players[playerId];
  if (!nation) return 0;
  const gap = Math.max(0, army.capacity - army.manpower);
  const throughput = Math.max(0.000001, army.capacity * 0.0022)
    * (1 + 0.01 * nation.research.effectLevels.training)
    * (1 + 0.01 * nation.research.effectLevels.recovery)
    * selectCatchUpFactorV2(state, content, playerId, powerSnapshot);
  return round(Math.min(gap, throughput));
}

export function selectArmyCapacityTargetV2(state: WorldStateV2, content: WorldContentV2, playerId: PlayerId): number {
  return nationalArmyCapacityTargetV2(state, content, playerId, territoryIndexV2(state).owned.get(playerId) ?? []);
}

export function selectArmyStrengthV2(state: WorldStateV2, content: WorldContentV2, playerId: PlayerId): ArmyStrengthV2 {
  const army = selectTotalManpowerV2(state, playerId);
  const capacityTarget = selectArmyCapacityTargetV2(state, content, playerId);
  return {
    ...army,
    capacityTarget,
    fillRatio: army.capacity > 0 ? round(clamp(army.deployed / army.capacity, 0, 1)) : 0,
    combatExperience: selectCombatExperienceV2(state, playerId),
  };
}

export function selectRecruitmentUnitCostV2(
  state: WorldStateV2,
  playerId: PlayerId,
  content: WorldContentV2 = WORLD_CONTENT_V2,
): number {
  const efficiency = diminishingResearchLevelV2(
    state.players[playerId]?.research.effectLevels['reinforcement-efficiency'] ?? 0,
  );
  const baseQuality = nationArmyBaseQualityV2(content, playerId);
  const combinedQuality = Math.max(0.25, 0.55 * baseQuality.attack + 0.45 * baseQuality.defense);
  // Quality remains a real cost, but the square-root curve and hard ceiling
  // prevent elite countries from becoming economically unplayable.
  const qualityPremium = clamp(0.75 + 0.25 * Math.sqrt(combinedQuality), 0.85, 1.75);
  return round(2 * qualityPremium * (1 - 0.01 * efficiency)
    / nationalAiEfficiencyV2(playerId === state.humanPlayerId));
}

/** Immediate reserves and mercenary cadres restore at most 5% of the live cap. */
export function selectRapidRecruitmentTermsV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): RapidRecruitmentTermsV2 {
  const nation = state.players[playerId];
  const army = selectTotalManpowerV2(state, playerId);
  const gap = Math.max(0, army.capacity - army.deployed);
  const amount = round(Math.min(gap, army.capacity * 0.05));
  const atWar = selectWarsOfV2(state, playerId).length > 0;
  const cooldownRemaining = nation
    ? Math.max(0, nation.rapidRecruitmentAvailableTick - state.tick) : 0;
  const militaryBaseSnapshot = createMilitaryBaseSnapshotV2(state, content);
  const baseQuality = selectMilitaryBaseRatingsV2(state, content, playerId, militaryBaseSnapshot);
  const armyState: ArmyStateV2 = {
    manpower: army.deployed,
    capacity: army.capacity,
    baseAttack: baseQuality.attack,
    baseDefense: baseQuality.defense,
  };
  const attack = selectEffectiveAttackV2(state, content, playerId, armyState, militaryBaseSnapshot);
  const defense = selectEffectiveDefenseV2(state, content, playerId, armyState, militaryBaseSnapshot);
  const qualityMultiplier = round(0.55 * attack + 0.45 * defense);
  const openingQuote = initialManualActionCostV2(content, playerId, 'rapidRecruitment');
  const qualityCostMultiplier = openingQuote.openingScale;
  const useCount = nation?.manualActionUses.rapidRecruitment ?? 0;
  const useMultiplier = manualActionUseMultiplierV2('rapidRecruitment', useCount);
  const cost = amount <= 0 ? 0 : round(openingQuote.baseCost * useMultiplier);
  const costPerMillion = amount > 0 ? round(cost / amount) : 0;
  let reason: string | undefined;
  if (!nation || selectTerritoriesOfV2(state, playerId).length === 0) reason = 'Country is unavailable.';
  else if (cooldownRemaining > 0) reason = `Emergency recruitment returns in ${cooldownRemaining} weeks.`;
  else if (nation.treasury <= 0) reason = 'Recruitment is locked while the treasury is in debt.';
  else if (amount <= 0.0000001) reason = 'Army is already at its population cap.';
  else if (nation.treasury + 0.0000001 < cost) reason = `Requires $${cost.toFixed(2)}B in cash.`;
  return {
    playerId,
    allowed: reason === undefined,
    reason,
    atWar,
    cooldownRemaining,
    amount,
    cost,
    baseCost: openingQuote.baseCost,
    useCount,
    useMultiplier,
    qualityMultiplier,
    qualityCostMultiplier,
    costPerMillion,
    deployedBefore: army.deployed,
    deployedAfter: round(army.deployed + amount),
    capacity: army.capacity,
  };
}

export function selectRecruitmentThroughputV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  powerSnapshot?: PowerSnapshotV2,
): number {
  const nation = state.players[playerId];
  if (!nation) return 0;
  const army = selectTotalManpowerV2(state, playerId);
  const gap = Math.max(0, army.capacity - army.deployed);
  // The ordinary pipeline is a stable share of live capacity. It is slow
  // enough to make losses matter and no longer jumps with current GDP/budget.
  const base = Math.max(0.000001, army.capacity * PASSIVE_RECRUITMENT_CAPACITY_RATE);
  const activeWars = selectWarsOfV2(state, playerId).length;
  const wartimeTraining = activeWars > 0
    ? WAR_RECRUITMENT_THROUGHPUT_FACTOR / Math.sqrt(activeWars) : 1;
  const trainingLevel = diminishingResearchLevelV2(nation.research.effectLevels.training, 30, 20);
  return round(Math.min(gap, base
    * (1 + PASSIVE_RECRUITMENT_TRAINING_BONUS * trainingLevel)
    * clamp(nation.foodSecurity, 0.10, 1)
    * wartimeTraining));
}

export function selectFoodLandCapacityV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): number {
  const nation = state.players[playerId];
  if (!nation) return 0;
  const yieldResearch = 1 + 0.005 * nation.research.effectLevels['economy-growth'];
  const warDisruption = clamp(1 - 1.50 * selectWarPressureV2(state, playerId).outputPenalty, 0.35, 1);
  return round(selectTerritoriesOfV2(state, playerId).reduce((sum, view) => {
    const territory = state.territories[view.id]!;
    const definition = content.territories[view.id]!;
    const terrainYield = FOOD_TERRAIN_YIELD[definition.terrain];
    const conditionYield = 0.55 + 0.45 * territory.condition;
    const integrationYield = clamp(territory.integration, 0, 1);
    const liveEconomicStrength = clamp(
      territory.economy / Math.max(0.10, definition.baseline.gdp),
      0.25,
      1.50,
    );
    const economicYield = FOOD_ECONOMY_YIELD_FLOOR
      + FOOD_ECONOMY_YIELD_WEIGHT * Math.sqrt(liveEconomicStrength);
    const foodSystemEfficiency = clamp(
      1 - 1.25 * definition.baseline.foodInsecurityRate
        + 0.0075 * nation.research.effectLevels['economy-growth'],
      0.35,
      1.10,
    );
    const originYield = definition.initialOwnerId === nationIdV2('ind')
      ? FOOD_INDIA_ORIGIN_YIELD_MULTIPLIER : 1;
    return sum + definition.baseline.landArea * FOOD_PEOPLE_MILLIONS_PER_KM2
      * terrainYield * conditionYield * integrationYield * economicYield
      * foodSystemEfficiency * originYield;
  }, 0) * yieldResearch * warDisruption);
}

/**
 * Maximum share of the population the current food network can actually
 * reach. Owning farmland is not enough: poverty, conflict and weak logistics
 * can leave food inaccessible even while aggregate supply exists.
 */
export function selectFoodAccessCeilingV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): number {
  const nation = state.players[playerId];
  const territories = selectTerritoriesOfV2(state, playerId);
  if (!nation || territories.length === 0) return 0;
  let population = 0;
  let vulnerability = 0;
  let condition = 0;
  let currentOutput = 0;
  let baselineOutput = 0;
  for (const view of territories) {
    const territory = state.territories[view.id]!;
    const definition = content.territories[view.id]!;
    population += territory.population;
    vulnerability += definition.baseline.foodInsecurityRate * territory.population;
    condition += territory.condition * territory.population;
    currentOutput += territory.economy;
    baselineOutput += definition.baseline.gdp;
  }
  const weightedVulnerability = vulnerability / Math.max(0.01, population);
  const averageCondition = condition / Math.max(0.01, population);
  const liveOutputPerPerson = currentOutput / Math.max(0.01, population);
  const baselineOutputPerPerson = baselineOutput / Math.max(0.01,
    territories.reduce((sum, view) => sum + content.territories[view.id]!.baseline.population, 0));
  const prosperityRatio = liveOutputPerPerson / Math.max(0.000001, baselineOutputPerPerson);
  const economicRelief = Math.max(0, Math.log2(Math.max(1, prosperityRatio))) * 0.04;
  const economicStress = Math.max(0, -Math.log2(Math.min(1, prosperityRatio))) * 0.05;
  const researchRelief = weightedVulnerability * Math.min(0.60,
    nation.research.effectLevels['economy-growth'] * FOOD_ACCESS_RESEARCH_RELIEF_PER_LEVEL);
  const conditionPenalty = Math.max(0, 0.78 - averageCondition) * 0.35;
  const warPenalty = selectWarPressureV2(state, playerId).outputPenalty * 0.75;
  const remainingVulnerability = Math.max(0.005,
    weightedVulnerability - researchRelief - economicRelief + economicStress
      + conditionPenalty + warPenalty);
  const rawAccess = clamp(1 - remainingVulnerability, 0.20, 0.995);
  // Essential food networks soften real-world vulnerability without erasing
  // it: fragile countries remain import-dependent, but do not begin in an
  // unrecoverable famine spiral.
  return round(clamp(0.65 + 0.35 * rawAccess, 0.70, 0.995));
}

/**
 * Food demand is intentionally nonlinear in the late game. Civilians remain
 * the base demand, while mega-populations and mass human armies add logistics
 * pressure. Combat experience does not add manpower or food demand.
 */
export function selectFoodDemandV2(state: WorldStateV2, playerId: PlayerId): number {
  const nation = state.players[playerId];
  if (!nation) return 0;
  const population = Math.max(0.01, selectControlledPopulationV2(state, playerId));
  const army = selectTotalManpowerV2(state, playerId).deployed;
  const foodResearch = 0.65 * nation.research.effectLevels['economy-growth']
    + 0.35 * nation.research.effectLevels.supply;
  const pressureRelief = 1 / (1 + FOOD_PRESSURE_RESEARCH_RELIEF_PER_LEVEL * foodResearch);
  const populationPressure = population * FOOD_POPULATION_PRESSURE_RATE
    * Math.sqrt(population / FOOD_POPULATION_PRESSURE_SCALE);
  const armyLogistics = army * FOOD_ARMY_LOGISTICS_RATE;
  return round(population + pressureRelief * (populationPressure + armyLogistics));
}

export function selectFoodStorageCapacityV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  demandOverride?: number,
): number {
  const nation = state.players[playerId];
  if (!nation) return 0;
  const demand = Math.max(0.01, demandOverride ?? selectFoodDemandV2(state, playerId));
  const territories = selectTerritoriesOfV2(state, playerId);
  const landArea = territories.reduce((sum, territory) => (
    sum + (content.territories[territory.id]?.baseline.landArea ?? 0)
  ), 0);
  const economy = selectNationalEconomyV2(state, content, playerId);
  const economicInfrastructure = 0.75
    + 0.25 * clamp(economy.wealthPerPerson / 50, 0, 1);
  const researchInfrastructure = 1
    + 0.01 * diminishingResearchLevelV2(nation.research.effectLevels.supply);
  const physicalCapacity = (demand * FOOD_STORAGE_BASE_WEEKS
    + landArea * FOOD_STORAGE_MILLIONS_PER_KM2)
    * economicInfrastructure * researchInfrastructure;
  return round(clamp(physicalCapacity, demand * 2, demand * FOOD_MAX_STOCK_WEEKS));
}

interface FoodPlanV2 {
  demand: number;
  landCapacity: number;
  accessCeiling: number;
  storageCapacity: number;
  targetStock: number;
  domesticTarget: number;
  importTarget: number;
  domesticUnitCost: number;
  importUnitCost: number;
  request: number;
}

function selectFoodPlanV2(state: WorldStateV2, content: WorldContentV2, playerId: PlayerId): FoodPlanV2 {
  const nation = state.players[playerId]!;
  const demand = Math.max(0.01, selectFoodDemandV2(state, playerId));
  const physicalLandCapacity = selectFoodLandCapacityV2(state, content, playerId);
  const accessCeiling = selectFoodAccessCeilingV2(state, content, playerId);
  // Every country has a basic domestic food economy (urban food systems,
  // greenhouse production and local processing). Land and terrain can lift it
  // much higher, but a microstate never displays zero meaningful production.
  const landCapacity = Math.max(
    physicalLandCapacity,
    demand * (0.45 + 0.35 * accessCeiling),
  );
  const storageCapacity = selectFoodStorageCapacityV2(state, content, playerId, demand);
  const targetStock = Math.min(storageCapacity, demand * FOOD_TARGET_WEEKS * accessCeiling);
  // A healthy country never deliberately produces less than this week's needs.
  // Extra supply above 100% refills storage; storage is only drawn down when
  // funding or access prevents the weekly target from being met.
  const restock = clamp((targetStock - nation.foodStock) / 26, 0, 0.10 * demand);
  // Weekly supply may exceed 100% of demand while reserves are rebuilding.
  // Citizens consume at most one week of demand; the surplus is stored.
  const desiredProduction = Math.max(0, demand + restock);
  const domesticTarget = Math.min(desiredProduction, landCapacity);
  const importTarget = Math.max(0, desiredProduction - domesticTarget);
  const economy = selectNationalEconomyV2(state, content, playerId);
  const outputPerPerson = economy.output / Math.max(0.01, economy.population);
  const dependency = clamp(importTarget / demand, 0, 1);
  const vulnerability = 1 - accessCeiling;
  const warPressure = selectWarPressureV2(state, playerId).outputPenalty;
  const debtStress = nation.treasury < 0 ? 1.25 : 1;
  const localPriceLevel = FOOD_PRICE_LEVEL_FLOOR
    + FOOD_PRICE_LEVEL_PER_WEALTH_THOUSAND
      * Math.min(FOOD_PRICE_LEVEL_WEALTH_CAP, outputPerPerson);
  const domesticUnitCost = FOOD_DOMESTIC_COST_PER_MILLION
    * localPriceLevel * (1 + 0.80 * vulnerability) * (1 + 1.5 * warPressure);
  const importUnitCost = FOOD_IMPORT_COST_PER_MILLION
    * localPriceLevel
    // Low income already reduces public revenue, so charging a second poverty
    // penalty here made India-like economies structurally unable to recover.
    // Import dependence and actual access vulnerability remain the visible risks.
    * (1 + 0.70 * dependency + 1.50 * vulnerability)
    * (1 + 2 * warPressure) * debtStress;
  return {
    demand: round(demand),
    landCapacity: round(landCapacity),
    accessCeiling: round(accessCeiling),
    storageCapacity: round(storageCapacity),
    targetStock: round(targetStock),
    domesticTarget: round(domesticTarget),
    importTarget: round(importTarget),
    domesticUnitCost: round(domesticUnitCost, 9),
    importUnitCost: round(importUnitCost, 9),
    request: round(domesticTarget * domesticUnitCost + importTarget * importUnitCost),
  };
}

function allBranchCapped(state: WorldStateV2, playerId: PlayerId, branch: ResearchBranchV2): boolean {
  return !state.players[playerId] || !RESEARCH_BRANCH_EFFECTS[branch];
}

function researchBranchCostForCompletionsV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  branch: ResearchBranchV2,
  completions: number,
  powerSnapshot: PowerSnapshotV2 = createPowerSnapshotV2(state, content),
): number {
  const nation = state.players[playerId];
  if (!nation) return 0;
  void content;
  void powerSnapshot;
  const efficiency = diminishingResearchLevelV2(nation.research.effectLevels['research-efficiency']);
  return round(RESEARCH_BRANCH_BASE_RP[branch]
    * RESEARCH_BASE_COST_SCALE
    * (completions + 1) ** RESEARCH_MASTERY_POWER
    * RESEARCH_COST_GROWTH ** completions
    * (1 - 0.01 * efficiency));
}

export function selectResearchBranchCostV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  branch: ResearchBranchV2,
  powerSnapshot: PowerSnapshotV2 = createPowerSnapshotV2(state, content),
): number {
  const nation = state.players[playerId];
  if (!nation || allBranchCapped(state, playerId, branch)) return 0;
  return researchBranchCostForCompletionsV2(
    state, content, playerId, branch, nation.research.breakthroughs[branch], powerSnapshot,
  );
}

export function selectResearchOutputV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  finance = selectWeeklyFinanceBreakdownV2(state, content, playerId),
  catchUpOverride?: number,
): number {
  const nation = state.players[playerId];
  if (!nation || RESEARCH_BRANCHES.every((branch) => allBranchCapped(state, playerId, branch))) return 0;
  const fundingRatio = finance.research / Math.max(0.001, finance.revenue * 0.25);
  // Research has an institutional base, but cash still has to activate it.
  // Logarithmic cash returns stop giant economies converting raw scale into an
  // overwhelming upgrade conveyor belt; sqrt intensity rescues small states
  // from the old double linear punishment without granting progress at $0.
  const base = 0.22 + 0.08 * Math.log2(1 + Math.max(0, finance.research));
  return round(base * Math.sqrt(clamp(fundingRatio, 0, 1.25))
    * (1 + 0.01 * nation.research.effectLevels['research-speed'])
    * (catchUpOverride ?? selectResearchCatchUpFactorV2(state, content, playerId))
    * nationalAiEfficiencyV2(playerId === state.humanPlayerId)
    * (1 - finance.warResearchPenalty)
    * (0.55 + 0.45 * clamp(nation.foodSecurity, 0, 1)));
}

/** Bounded real-world science/industry identity used by ordinary R&D. */
export function selectResearchInstitutionalCapacityV2(
  _content: WorldContentV2,
  _playerId: PlayerId,
): number {
  return 1;
}

export function selectNationalAiPlanV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  powerSnapshot: PowerSnapshotV2 = createPowerSnapshotV2(state, content),
  intentOverride?: BudgetPolicyV2,
): NationalAiPlanV2 {
  const nation = state.players[playerId];
  if (!nation) throw new Error(`Unknown nation ${playerId}.`);
  const army = selectTotalManpowerV2(state, playerId);
  const territories = selectTerritoriesOfV2(state, playerId);
  const averageCondition = territories.length > 0
    ? territories.reduce((sum, territory) => sum + territory.condition, 0) / territories.length : 0;
  const breakthroughs = Object.values(nation.research.breakthroughs).reduce((sum, value) => sum + value, 0);
  const economy = selectNationalEconomyV2(state, content, playerId);
  const foodDemand = Math.max(0.01, selectFoodDemandV2(state, playerId));
  const populationTrend = selectPopulationDynamicsV2(state, content, playerId, 0);
  return optimizeNationalAiPlanV2({
    intent: intentOverride ?? nation.budget,
    activeWars: selectWarsOfV2(state, playerId).length,
    fillRatio: army.capacity > 0 ? clamp(army.deployed / army.capacity, 0, 1) : 0,
    averageCondition,
    researchGap: Math.max(0, powerSnapshot.leaderBreakthroughs - breakthroughs),
    treasuryWeeks: nation.treasury / Math.max(0.001, economy.weeklyRevenue),
    foodSecurity: nation.foodSecurity,
    populationGrowthRate: populationTrend.annualNetRate,
    foodReserveWeeks: nation.foodStock / foodDemand,
    superAi: playerId === state.humanPlayerId,
  });
}

function economicGrowthRatesV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  economy: NationalEconomyV2,
  productiveInvestment: number,
  foodCoverage: number,
  aiEfficiency: number,
  warGrowthDrag: number,
): {
  annual: number;
  base: number;
  investment: number;
  research: number;
  food: number;
} {
  const nation = state.players[playerId]!;
  const annualInvestmentShare = productiveInvestment * 52
    / Math.max(0.10, economy.controlledOutput);
  const investment = ECONOMY_INVESTMENT_GROWTH_MULTIPLIER
    * clamp(annualInvestmentShare * aiEfficiency, 0, 0.12);
  const researchImpact = selectResearchEffectImpactV2(
    state,
    content,
    playerId,
    'economy-growth',
  );
  const research = Math.min(0.012,
    ECONOMY_RESEARCH_GROWTH_PER_LEVEL
      * nation.research.effectLevels['economy-growth'] * researchImpact);
  const food = foodCoverage >= 0.98
    ? ECONOMY_FOOD_SURPLUS_MAX_BONUS * clamp((foodCoverage - 0.98) / 0.02, 0, 1)
    : -ECONOMY_FOOD_SHORTAGE_MAX_DRAG
      * clamp((0.90 - foodCoverage) / 0.50, 0, 1) ** 1.25;
  const base = ECONOMY_BASE_ANNUAL_GROWTH;
  return {
    annual: clamp(base + investment + research + food - warGrowthDrag,
      ECONOMY_ANNUAL_GROWTH_MIN, ECONOMY_ANNUAL_GROWTH_MAX),
    base,
    investment,
    research,
    food,
  };
}

export function selectResearchPortfolioV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  finance = selectWeeklyFinanceBreakdownV2(state, content, playerId),
  powerSnapshot: PowerSnapshotV2 = createPowerSnapshotV2(state, content),
  catchUpOverride = selectResearchCatchUpFactorV2(state, content, playerId, powerSnapshot),
): ResearchPortfolioV2 {
  const nation = state.players[playerId];
  if (!nation) return [];
  const poolOutput = selectResearchOutputV2(state, content, playerId, finance, catchUpOverride);
  let assignedFunding = 0;
  let assignedOutput = 0;
  return RESEARCH_BRANCHES.map((branch, index) => {
    const isLast = index === RESEARCH_BRANCHES.length - 1;
    const fundingShare = researchFundingShareV2(nation.research.allocations, branch);
    const weeklyFunding = isLast ? round(Math.max(0, finance.research - assignedFunding), 9)
      : round(finance.research * fundingShare, 9);
    const outputShare = isLast ? round(Math.max(0, poolOutput - assignedOutput), 9)
      : round(poolOutput * fundingShare, 9);
    assignedFunding = round(assignedFunding + weeklyFunding, 9);
    assignedOutput = round(assignedOutput + outputShare, 9);
    const maxed = allBranchCapped(state, playerId, branch);
    const nextCost = selectResearchBranchCostV2(state, content, playerId, branch, powerSnapshot);
    const followingCost = maxed ? 0 : researchBranchCostForCompletionsV2(
      state, content, playerId, branch, nation.research.breakthroughs[branch] + 1, powerSnapshot,
    );
    const progress = nation.research.progress[branch];
    return {
      branch,
      allocation: nation.research.allocations[branch],
      fundingShare: round(fundingShare, 9),
      weeklyFunding,
      progress,
      nextCost,
      followingCost,
      nextCostIncreaseRatio: nextCost > 0 ? round(followingCost / nextCost, 9) : 0,
      weeklyProgress: maxed ? 0 : outputShare,
      progressRatio: nextCost > 0 ? clamp(progress / nextCost, 0, 1) : 1,
      breakthroughs: nation.research.breakthroughs[branch],
      maxed,
      effects: RESEARCH_BRANCH_EFFECTS[branch].map((effect) => ({
        effect,
        level: nation.research.effectLevels[effect],
        impactPerLevel: selectResearchEffectImpactV2(state, content, playerId, effect),
      })),
    };
  });
}

export function selectResearchSurgeTermsV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): ResearchSurgeTermsV2 {
  const nation = state.players[playerId];
  const cooldownRemaining = nation
    ? Math.max(0, nation.researchSurgeAvailableTick - state.tick) : 0;
  const finance = nation ? selectWeeklyFinanceBreakdownV2(state, content, playerId) : undefined;
  const economy = nation ? selectNationalEconomyV2(state, content, playerId) : undefined;
  const openingQuote = initialManualActionCostV2(content, playerId, 'researchSurge');
  const empireScale = openingQuote.openingScale;
  const useCount = nation?.manualActionUses.researchSurge ?? 0;
  const useMultiplier = manualActionUseMultiplierV2('researchSurge', useCount);
  const cost = round(openingQuote.baseCost * useMultiplier);
  const portfolio = nation && finance
    ? selectResearchPortfolioV2(state, content, playerId, finance) : [];
  const progressAdded = round(portfolio.reduce(
    (sum, branch) => sum + branch.weeklyProgress * RESEARCH_SURGE_PROGRESS_WEEKS,
    0,
  ));
  let reason: string | undefined;
  if (!nation || selectTerritoriesOfV2(state, playerId).length === 0) reason = 'Country is unavailable.';
  else if (cooldownRemaining > 0) reason = `Research Surge returns in ${cooldownRemaining} weeks.`;
  else if (nation.treasury <= 0) reason = 'Research Surge is locked while the treasury is in debt.';
  else if (progressAdded <= 0.0000001) reason = 'No research program can advance.';
  else if (nation.treasury + 0.0000001 < cost) reason = `Requires $${cost.toFixed(2)}B in cash.`;
  return {
    playerId,
    allowed: reason === undefined,
    reason,
    cooldownRemaining,
    progressWeeks: RESEARCH_SURGE_PROGRESS_WEEKS,
    progressAdded,
    empireScale,
    baseCost: openingQuote.baseCost,
    useCount,
    useMultiplier,
    cost,
  };
}

export function selectWeeklyFinanceBreakdownV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  powerSnapshot: PowerSnapshotV2 = createPowerSnapshotV2(state, content),
  budgetOverride?: BudgetPolicyV2,
): WeeklyFinanceBreakdownV2 {
  const nation = state.players[playerId];
  if (!nation) throw new Error(`Unknown nation ${playerId}.`);
  const aiPlan = selectNationalAiPlanV2(state, content, playerId, powerSnapshot, budgetOverride);
  let budget = { ...aiPlan.activeBudget };
  const economy = selectNationalEconomyV2(state, content, playerId);
  const army = selectTotalManpowerV2(state, playerId);
  const activeWars = selectWarsOfV2(state, playerId).length;
  const warPressure = selectWarPressureV2(state, playerId);
  const atWar = activeWars > 0;
  const ownerIndex = territoryIndexV2(state).owned;
  const activeObligations = state.ceasefireObligations
    .filter((obligation) => state.tick > obligation.startsTick && state.tick <= obligation.expiresTick
      && (ownerIndex.get(obligation.payerId)?.length ?? 0) > 0
      && (ownerIndex.get(obligation.payeeId)?.length ?? 0) > 0);
  // Peace contracts are sovereign obligations, not optional spending. The
  // receiver gets the complete amount; a payer without liquidity borrows.
  const ceasefireIncome = activeObligations
    .filter((obligation) => obligation.payeeId === playerId)
    .reduce((sum, obligation) => sum + obligation.weeklyCost, 0);
  const ceasefirePayment = activeObligations
    .filter((obligation) => obligation.payerId === playerId)
    .reduce((sum, obligation) => sum + obligation.weeklyCost, 0);
  // A negative treasury is debt, not the disappearance of the country's new
  // weekly revenue. Positive reserves can fund a surge; debt cannot.
  const cashAfterRevenue = Math.max(0, nation.treasury) + economy.weeklyRevenue + ceasefireIncome;
  const cashAfterCeasefire = Math.max(0, cashAfterRevenue - ceasefirePayment);
  const foodPlan = selectFoodPlanV2(state, content, playerId);
  // Food remains first priority, but it cannot consume several years of a
  // fragile country's public revenue in one week. Severe access crises may
  // command up to 72% of weekly revenue; the resulting unmet need remains a
  // real food shortage instead of silently draining all reserves and every
  // other national system.
  const foodFundingStress = clamp((0.98 - nation.foodSecurity) / 0.58, 0, 1);
  const foodBudgetShare = clamp(
    0.12 + 0.95 * (1 - foodPlan.accessCeiling) + 0.35 * foodFundingStress,
    0.12,
    0.72,
  );
  const ordinaryFoodAllowance = economy.weeklyRevenue * foodBudgetShare;
  const reserveWeeks = nation.foodStock / Math.max(0.01, foodPlan.demand);
  const foodEmergency = reserveWeeks < 1 || nation.foodSecurity < 0.65;
  // In a genuine food emergency the national cash reserve is a survival fund.
  // It may bridge the remaining bill after normal weekly food funding, but it
  // never borrows extra money or spends beyond the actual food request.
  const emergencyReserveDraw = foodEmergency
    ? Math.min(Math.max(0, nation.treasury), Math.max(0, foodPlan.request - ordinaryFoodAllowance))
    : 0;
  const foodSpendable = Math.min(
    cashAfterCeasefire,
    ordinaryFoodAllowance + emergencyReserveDraw,
  );
  const foodProduction = Math.min(foodPlan.request, foodSpendable);
  const domesticCost = foodPlan.domesticTarget * foodPlan.domesticUnitCost;
  const foodDomesticProduced = Math.min(foodPlan.domesticTarget,
    foodProduction / foodPlan.domesticUnitCost);
  const foodFundingAfterDomestic = Math.max(0, foodProduction - Math.min(foodProduction, domesticCost));
  const foodImported = Math.min(foodPlan.importTarget,
    foodFundingAfterDomestic / foodPlan.importUnitCost);
  const foodProduced = foodDomesticProduced + foodImported;
  const foodAvailable = nation.foodStock + foodProduced;
  const foodConsumed = Math.min(foodPlan.demand, foodAvailable);
  const foodCoverage = clamp(foodConsumed / Math.max(0.01, foodPlan.demand), 0, 1);
  const foodStockChange = clamp(
    nation.foodStock + foodProduced - foodConsumed,
    0,
    foodPlan.storageCapacity,
  ) - nation.foodStock;
  const discretionaryRevenue = Math.max(0, economy.weeklyRevenue - foodProduction);
  const treasuryWeeks = nation.treasury / Math.max(0.001, economy.weeklyRevenue);
  // Large economies have equally large structural obligations. Without this
  // normalization, a fixed percentage surplus gives the USA/China hundreds
  // of billions of effortless liquid war cash. Rich empires therefore keep a
  // smaller cash runway and commit a larger minimum share of revenue, while
  // small countries retain room to build themselves up.
  const economyScale = clamp(Math.log10(economy.weeklyRevenue + 1) / 2, 0, 1);
  const defenceBurden = clamp(
    (content.nations[playerId]?.real.defenceSpending ?? 0)
      / Math.max(0.1, content.nations[playerId]?.real.gdp ?? 0.1) / 0.08,
    0,
    1,
  );
  const structuralSpendingFloor = clamp(0.92 + 0.055 * economyScale + 0.02 * defenceBurden, 0.92, 0.99);
  const basePeaceReserveWeeks = playerId === state.humanPlayerId
    ? SUPER_AI_PEACE_RESERVE_WEEKS : RIVAL_AI_PEACE_RESERVE_WEEKS;
  const peaceReserveWeeks = basePeaceReserveWeeks * (1 - 0.30 * economyScale);
  const peaceReserveTarget = economy.weeklyRevenue * peaceReserveWeeks;
  const warReserveWeeks = playerId === state.humanPlayerId
    ? SUPER_AI_WAR_BASE_RUNWAY_WEEKS + activeWars * SUPER_AI_WAR_FRONT_RUNWAY_WEEKS
    : 3 + activeWars * 1.5;
  const reserveProgress = clamp(treasuryWeeks / Math.max(0.25, peaceReserveWeeks), 0, 1);
  const treatyRevenueShare = ceasefirePayment / Math.max(0.001, economy.weeklyRevenue);
  const envelopeRate = nation.treasury < 0
    // Debt recovery cuts the discretionary envelope sharply, especially
    // while a peace contract is already consuming national revenue.
    ? clamp((atWar ? 0.92 : 0.80) - treatyRevenueShare, 0.10, atWar ? 0.86 : 0.70)
    : atWar
      ? treasuryWeeks < warReserveWeeks ? 0.92
      : treasuryWeeks < warReserveWeeks + 2 ? 1
        : treasuryWeeks < warReserveWeeks + 6 ? 1.04 : 1.08
      : structuralSpendingFloor + (0.995 - structuralSpendingFloor) * reserveProgress;
  // Normal commitments are allowed to overrun liquid cash. That overrun is
  // sovereign borrowing below; without this, the treasury could never become
  // negative and expensive peace contracts merely switched the country off.
  const envelope = discretionaryRevenue * envelopeRate;
  const frontLoad = selectWarsOfV2(state, playerId).reduce((sum, war) => {
    const opponentId = war.attackerId === playerId ? war.defenderId : war.attackerId;
    const operations = war.attackerId === playerId ? war.attackerOperations : war.defenderOperations;
    const inferredAccess = selectWarAccessTypeV2(state, content, playerId, opponentId);
    if (operations.length === 0) {
      const access = inferredAccess === 'none' ? 'land' : inferredAccess;
      return sum + WAR_ACCESS_OPERATION_MULTIPLIER[access];
    }
    return sum + operations.reduce((fronts, operation) => (
      fronts + WAR_ACCESS_OPERATION_MULTIPLIER[operation.access]
    ), 0);
  }, 0);
  const warOperations = atWar ? frontLoad * (
    economy.weeklyRevenue * WAR_OPERATION_REVENUE_SHARE
    + army.deployed * WAR_OPERATION_COST_PER_MILLION
  ) : 0;
  const weeklyRealDefence = Math.max(0.001, (content.nations[playerId]?.real.defenceSpending ?? 0.052) / 52);
  const initialArmy = Math.max(0.000001, initialNationArmyCapacityBenchmarkV2(content, playerId));
  const weaponsUpkeep = 1 + 0.005 * nation.research.effectLevels.attack;
  const baselineUpkeep = weeklyRealDefence * (
    0.35 * army.deployed / initialArmy
    + 0.65 * army.capacity / initialArmy
  );
  const weaponsPremium = weeklyRealDefence * 0.65 * army.capacity / initialArmy * (weaponsUpkeep - 1);
  const armyUpkeep = baselineUpkeep + weaponsPremium;
  // APEX treats payroll as a real obligation. It shifts the ordinary envelope
  // toward the army before funding discretionary research or development.
  const requiredMilitaryShare = envelope > 0
    ? Math.min(90, Math.ceil(100 * armyUpkeep / envelope)) : 90;
  while (budget.military < requiredMilitaryShare) {
    const donor = (['development', 'research'] as const)
      .filter((domain) => budget[domain] > 5)
      .sort((left, right) => budget[right] - budget[left] || left.localeCompare(right))[0];
    if (!donor) break;
    budget[donor] -= 1;
    budget.military += 1;
  }
  // When APEX has a healthy army and cash above its runway, it stops wasting a
  // large Armed Forces remainder on generic operations. It keeps upkeep plus
  // a build buffer, then redirects the rest to useful research and growth.
  if (!atWar && playerId === state.humanPlayerId && nation.treasury > peaceReserveTarget
    && aiPlan.mode === 'growth' && envelope > 0) {
    const requiredMilitaryShare = clamp(Math.ceil(100 * armyUpkeep / envelope) + 10, 15, budget.military);
    const freed = Math.max(0, budget.military - requiredMilitaryShare);
    // General research already compounds strongly; most surplus belongs in
    // the real economy so a rich treasury cannot collapse the tech cadence.
    const researchGain = 0;
    budget = {
      military: requiredMilitaryShare,
      research: budget.research + researchGain,
      development: budget.development + freed - researchGain,
    };
  }
  const military = envelope * budget.military / 100;
  // The six-program portfolio divides this committed pot once; capped shares remain spent.
  const research = envelope * budget.research / 100;
  const development = envelope * budget.development / 100;
  // Front operations are paid directly below. They do not consume the Armed
  // Forces envelope a second time or masquerade as ordinary standing upkeep.
  const mandatoryRequest = armyUpkeep;
  const mandatoryFundingRatio = mandatoryRequest > 0 ? clamp(military / mandatoryRequest, 0, 1) : 1;
  const mandatoryFunded = Math.min(military, mandatoryRequest);
  const remainingMilitary = Math.max(0, military - mandatoryFunded);
  const passiveRecruitmentRequest = selectRecruitmentThroughputV2(state, content, playerId, powerSnapshot);
  const passiveRecruitment = passiveRecruitmentRequest * mandatoryFundingRatio;
  const recruitmentUnitCost = selectRecruitmentUnitCostV2(state, playerId, content);
  const fillRatio = army.capacity > 0 ? army.deployed / army.capacity : 0;
  const accelerationNeed = atWar
    ? clamp((0.90 - fillRatio) / 0.45, 0, 1)
    : clamp((AI_HEALTHY_ARMY_TARGET - fillRatio) / 0.50, 0, 1);
  const accelerationMultiplier = atWar
    ? WAR_RECRUITMENT_ACCELERATION_MULTIPLIER : PEACE_RECRUITMENT_ACCELERATION_MULTIPLIER;
  const accelerationCostMultiplier = atWar
    ? WAR_RECRUITMENT_ACCELERATION_COST_MULTIPLIER : PEACE_RECRUITMENT_ACCELERATION_COST_MULTIPLIER;
  const wartimePassiveFactor = atWar
    ? WAR_RECRUITMENT_THROUGHPUT_FACTOR / Math.sqrt(activeWars) : 1;
  const accelerationTrainingBase = passiveRecruitmentRequest / Math.max(0.01, wartimePassiveFactor);
  const acceleratedRecruitmentRequest = Math.min(
    Math.max(0, army.capacity - army.deployed - passiveRecruitment),
    accelerationTrainingBase * accelerationMultiplier * accelerationNeed,
  );
  const recruitmentRequest = acceleratedRecruitmentRequest * recruitmentUnitCost * accelerationCostMultiplier;
  const recruitment = mandatoryFundingRatio >= 0.999999
    ? Math.min(remainingMilitary, recruitmentRequest) : 0;
  const acceleratedRecruitment = recruitmentUnitCost > 0
    ? recruitment / (recruitmentUnitCost * accelerationCostMultiplier) : 0;
  const standingOperations = Math.max(0, military - mandatoryFunded - recruitment);
  const catastrophicFoodCrisis = foodCoverage < EXTREME_CRISIS_FOOD_COVERAGE
    && reserveWeeks < EXTREME_CRISIS_FOOD_RESERVE_WEEKS;
  const catastrophicDebtCrisis = treasuryWeeks < -AI_SEVERE_DEBT_REVENUE_WEEKS;
  const shouldDemobilize = !atWar
    && mandatoryFundingRatio <= EXTREME_CRISIS_MAX_UPKEEP_FUNDING
    && (catastrophicFoodCrisis || catastrophicDebtCrisis);
  // This legacy-named telemetry field now represents the only permitted force
  // reduction: at most 0.05% per week in an extreme survival crisis.
  const acceleratedDemobilization = shouldDemobilize
    ? round(army.deployed * EXTREME_CRISIS_DEMOBILIZATION_RATE, 9) : 0;
  const demobilizationCost = 0;
  const conditionRequest = selectTerritoriesOfV2(state, playerId)
    .reduce((sum, territory) => sum + (1 - territory.condition) * 0.20, 0);
  const productiveDevelopment = development;
  const condition = Math.min(productiveDevelopment, conditionRequest);
  const developmentRemainder = Math.max(0, productiveDevelopment - condition);
  const economyGrowth = developmentRemainder * 0.70;
  const populationGrowth = developmentRemainder * 0.30;
  const growthRates = economicGrowthRatesV2(
    state,
    content,
    playerId,
    economy,
    economyGrowth,
    foodCoverage,
    aiPlan.efficiency,
    warPressure.economyGrowthDrag,
  );
  const actuallySpent = ceasefirePayment + foodProduction + envelope + warOperations;
  const operatingNet = economy.weeklyRevenue + ceasefireIncome - actuallySpent;
  const prePremiumTreasury = nation.treasury + operatingNet;
  const debtBefore = Math.max(0, -nation.treasury);
  const debtAfterBeforePremium = Math.max(0, -prePremiumTreasury);
  const newBorrowing = Math.max(0, debtAfterBeforePremium - debtBefore);
  const debtPremium = newBorrowing * 0.10;
  const closingTreasury = prePremiumTreasury - debtPremium;
  return roundedFinanceV2({
    activeBudget: { ...budget },
    aiMode: aiPlan.mode,
    aiEfficiency: aiPlan.efficiency,
    revenue: economy.weeklyRevenue,
    foodDemand: foodPlan.demand,
    foodLandCapacity: foodPlan.landCapacity,
    foodStorageCapacity: foodPlan.storageCapacity,
    foodAccessCeiling: foodPlan.accessCeiling,
    foodProduced,
    foodDomesticProduced,
    foodImported,
    foodConsumed,
    foodBalance: foodProduced - foodPlan.demand,
    foodStockChange,
    foodProduction,
    foodCoverage,
    foodTargetStock: foodPlan.targetStock,
    ceasefirePayment,
    ceasefireIncome,
    newBorrowing,
    debtPremium,
    armyUpkeep,
    fundedArmyUpkeep: mandatoryFunded,
    warOperations,
    totalMilitaryCost: military + warOperations,
    military,
    research,
    development,
    recruitment,
    passiveRecruitment,
    acceleratedRecruitment,
    recruitmentAccelerationCost: recruitment,
    acceleratedDemobilization,
    demobilizationCost,
    standingOperations,
    condition,
    economyGrowth,
    annualEconomyGrowthRate: growthRates.annual,
    economyBaseGrowthRate: growthRates.base,
    economyInvestmentGrowthRate: growthRates.investment,
    economyResearchGrowthRate: growthRates.research,
    economyFoodGrowthRate: growthRates.food,
    populationGrowth,
    expenses: actuallySpent + debtPremium,
    net: operatingNet - debtPremium,
    closingTreasury,
    reserveTarget: atWar ? economy.weeklyRevenue * warReserveWeeks : peaceReserveTarget,
    mandatoryFundingRatio,
    recruitmentFundingRatio: recruitmentRequest > 0 ? recruitment / recruitmentRequest : 1,
    conditionFundingRatio: conditionRequest > 0 ? condition / conditionRequest : 1,
    warEconomicPenalty: warPressure.outputPenalty,
    warEconomyGrowthDrag: warPressure.economyGrowthDrag,
    warPopulationDrag: warPressure.populationGrowthDrag,
    warResearchPenalty: warPressure.researchPenalty,
    mode: atWar ? 'war' : nation.treasury <= 0.000001 ? 'insolvent'
      : nation.treasury < peaceReserveTarget ? 'conserving' : 'normal',
  });
}

export function selectWeeklyRecruitmentV2(state: WorldStateV2, content: WorldContentV2, playerId: PlayerId): number {
  const powerSnapshot = createPowerSnapshotV2(state, content);
  const finance = selectWeeklyFinanceBreakdownV2(state, content, playerId, powerSnapshot);
  return round(finance.passiveRecruitment + finance.acceleratedRecruitment);
}

interface ProjectedTerritoryArmyV2 {
  id: TerritoryId;
  manpower: number;
  capacity: number;
  baseAttack: number;
  baseDefense: number;
}

export interface FinanceManpowerPhaseProjectionV2 {
  territories: readonly ProjectedTerritoryArmyV2[];
  deployedBefore: number;
  deployedAfterDemobilization: number;
  deployedAfterFinance: number;
  recruited: number;
  demobilized: number;
}

/**
 * Pure projection shared by the selector and the authoritative economy phase.
 * Keeping the rounding and cap order here prevents the HUD from promising a
 * different personnel change than the simulation actually applies.
 */
export function projectFinanceManpowerPhaseV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  finance: WeeklyFinanceBreakdownV2,
): FinanceManpowerPhaseProjectionV2 {
  const nation = state.players[playerId];
  if (!nation) return {
    territories: [], deployedBefore: 0, deployedAfterDemobilization: 0,
    deployedAfterFinance: 0, recruited: 0, demobilized: 0,
  };
  const current = selectTerritoriesOfV2(state, playerId).map((view) => {
    const army = state.territories[view.id]!.army;
    return {
      id: view.id,
      manpower: army.manpower,
      capacity: army.capacity,
      baseAttack: army.baseAttack,
      baseDefense: army.baseDefense,
    };
  });
  const deployedBefore = current.reduce((sum, army) => sum + army.manpower, 0);
  const capacityTargets = stateArmyCapacityTargetsV2(
    state, content, playerId, current.map((army) => army.id),
  );
  const nationalCapacity = [...capacityTargets.values()].reduce((sum, capacity) => sum + capacity, 0);
  // Never infer demobilisation from capacity or ordinary underfunding. The
  // finance phase may explicitly request the extreme-crisis trickle only.
  const maximumWeeklyDemobilization = deployedBefore * EXTREME_CRISIS_DEMOBILIZATION_RATE;
  const requestedDemobilization = clamp(
    finance.acceleratedDemobilization,
    0,
    maximumWeeklyDemobilization,
  );
  const demobilizationTarget = deployedBefore - requestedDemobilization;
  const demobilizationScale = deployedBefore > 0
    ? clamp(demobilizationTarget / deployedBefore, 0, 1) : 1;
  const projected = current.map((army) => {
    const capacity = capacityTargets.get(army.id) ?? 0;
    const manpower = round(army.manpower * demobilizationScale);
    const localQuality = localArmyBaseQualityV2(content, army.id);
    return {
      id: army.id,
      capacity,
      manpower,
      baseAttack: manpower > 0.000000001 ? army.baseAttack : localQuality.attack,
      baseDefense: manpower > 0.000000001 ? army.baseDefense : localQuality.defense,
    };
  });
  const deployedAfterDemobilization = projected.reduce((sum, army) => sum + army.manpower, 0);
  const personnelGaps = projected.map((army) => ({
    id: army.id,
    gap: Math.max(0, army.capacity - army.manpower),
  }));
  const totalLocalRecruitmentRoom = personnelGaps.reduce((sum, item) => sum + item.gap, 0);
  const totalPersonnelGap = Math.min(
    totalLocalRecruitmentRoom,
    Math.max(0, nationalCapacity - deployedAfterDemobilization),
  );
  const recruitedUnits = Math.min(
    totalPersonnelGap,
    finance.passiveRecruitment + finance.acceleratedRecruitment,
  );
  const personnelGapById = new Map(personnelGaps.map((item) => [item.id, item.gap]));
  for (const army of projected) {
    const gap = personnelGapById.get(army.id) ?? 0;
    const added = Math.min(
      Math.max(0, army.capacity - army.manpower),
      totalLocalRecruitmentRoom > 0 ? recruitedUnits * gap / totalLocalRecruitmentRoom : 0,
    );
    mixArmyBaseQualityV2(army, added, localArmyBaseQualityV2(content, army.id));
    army.manpower = round(army.manpower + added);
  }
  const deployedAfterFinance = projected.reduce((sum, army) => sum + army.manpower, 0);
  return {
    territories: projected,
    deployedBefore: round(deployedBefore),
    deployedAfterDemobilization: round(deployedAfterDemobilization),
    deployedAfterFinance: round(deployedAfterFinance),
    recruited: round(deployedAfterFinance - deployedAfterDemobilization),
    demobilized: round(Math.max(0, deployedBefore - deployedAfterDemobilization)),
  };
}

export function selectWeeklyManpowerProjectionV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): WeeklyManpowerProjectionV2 {
  // WorldEngine advances the calendar before it creates the next finance
  // plan. Forecast against that exact tick so treaty start/end boundaries do
  // not create a one-week mismatch in the header.
  const financeState: WorldStateV2 = { ...state, tick: state.tick + 1 };
  const powerSnapshot = createPowerSnapshotV2(financeState, content);
  const finance = selectWeeklyFinanceBreakdownV2(financeState, content, playerId, powerSnapshot);
  const phase = projectFinanceManpowerPhaseV2(financeState, content, playerId, finance);
  const wars = selectWarsOfV2(state, playerId);
  const averageWarLoss = wars.reduce((sum, war) => {
    const losses = war.attackerId === playerId ? war.attackerLosses : war.defenderLosses;
    return sum + losses / Math.max(1, state.tick - war.startedTick + 1);
  }, 0);
  const financePhaseNet = phase.deployedAfterFinance - phase.deployedBefore;
  return {
    deployedBefore: phase.deployedBefore,
    deployedAfterFinance: phase.deployedAfterFinance,
    recruited: phase.recruited,
    demobilized: phase.demobilized,
    financePhaseNet: round(financePhaseNet),
    estimatedBattleLosses: round(averageWarLoss),
    net: round(financePhaseNet - averageWarLoss),
    exactNextWeek: wars.length === 0,
    battleLossesAreEstimate: wars.length > 0,
  };
}

export function selectWeeklyManpowerTrendV2(state: WorldStateV2, content: WorldContentV2, playerId: PlayerId): number {
  return selectWeeklyManpowerProjectionV2(state, content, playerId).net;
}

export function selectWeeklyPopulationTrendV2(state: WorldStateV2, content: WorldContentV2, playerId: PlayerId): number {
  return selectPopulationDynamicsV2(state, content, playerId).weeklyNet;
}

/**
 * Explicit demographic accounting. The World Bank population-growth input is
 * already net of normal deaths, so births/migration are reconstructed from
 * that net rate plus the separate crude death rate. Crisis mortality is then
 * added once, avoiding both immortal populations and double-counted deaths.
 */
export function selectPopulationDynamicsV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  populationGrowthFunding?: number,
): PopulationDynamicsV2 {
  const nation = state.players[playerId];
  if (!nation) return {
    annualBirthMigrationRate: 0,
    annualDeathRate: 0,
    annualDisplacementRate: 0,
    annualNetRate: 0,
    weeklyDeaths: 0,
    weeklyNet: 0,
  };
  const population = selectTerritoriesOfV2(state, playerId)
    .reduce((sum, territory) => sum + territory.population, 0);
  const funds = populationGrowthFunding
    ?? selectWeeklyFinanceBreakdownV2(state, content, playerId).populationGrowth;
  const owned = selectTerritoriesOfV2(state, playerId);
  const baselineNetRate = owned.reduce((sum, territory) => sum
    + (content.territories[territory.id]?.baseline.populationGrowthRate ?? 0) / 100 * territory.population, 0)
    / Math.max(0.01, owned.reduce((sum, territory) => sum + territory.population, 0));
  const baselineDeathRate = owned.reduce((sum, territory) => sum
    + (content.territories[territory.id]?.baseline.deathRatePerThousand ?? 8) / 1_000 * territory.population, 0)
    / Math.max(0.01, population);
  const averageCondition = owned.reduce((sum, territory) => sum + territory.condition * territory.population, 0)
    / Math.max(0.01, population);
  const level = nation.research.effectLevels['population-growth'];
  const impact = selectResearchEffectImpactV2(state, content, playerId, 'population-growth');
  const warPressure = selectWarPressureV2(state, playerId);
  const foodSecurity = clamp(nation.foodSecurity, 0, 1);
  const researchedNet = baselineNetRate >= 0
    ? baselineNetRate * (1 + 0.005 * level * impact)
    : baselineNetRate * (1 - 0.004 * level * impact);
  const supportedNet = researchedNet
    + 0.0005 * Math.sqrt(funds * nationalAiEfficiencyV2(playerId === state.humanPlayerId)
      / Math.max(0.01, population));
  const annualBirthMigrationRate = Math.max(0, baselineDeathRate + supportedNet);
  const medicalReduction = 0.20 * nation.research.effectLevels.recovery
    / (nation.research.effectLevels.recovery + 46.67);
  const foodCrisis = clamp((0.90 - foodSecurity) / 0.50, 0, 1);
  const foodMortality = FOOD_SHORTAGE_POPULATION_LOSS * 52 * foodCrisis;
  const conditionMortality = Math.max(0, 0.65 - averageCondition) * 0.015;
  const annualDeathRate = Math.max(0,
    baselineDeathRate * (1 - medicalReduction) + foodMortality + conditionMortality);
  const annualDisplacementRate = Math.max(0, warPressure.populationGrowthDrag);
  const annualNetRate = clamp(
    annualBirthMigrationRate - annualDeathRate - annualDisplacementRate,
    -0.08,
    0.04,
  );
  return {
    annualBirthMigrationRate: round(annualBirthMigrationRate),
    annualDeathRate: round(annualDeathRate),
    annualDisplacementRate: round(annualDisplacementRate),
    annualNetRate: round(annualNetRate),
    weeklyDeaths: round(population * (1 - Math.max(0, 1 - annualDeathRate) ** (1 / 52))),
    weeklyNet: round(population * ((1 + annualNetRate) ** (1 / 52) - 1)),
  };
}

export function selectConquestForecastV2(
  state: WorldStateV2,
  _content: WorldContentV2,
  attackerId: PlayerId,
  targetId: PlayerId,
): ConquestForecastV2 {
  const territories = selectTerritoriesOfV2(state, targetId);
  const retainedPopulation = territories.reduce((sum, territory) => sum + territory.population, 0);
  const retainedEconomy = territories.reduce((sum, territory) => sum + territory.economy, 0);
  const initialOccupationOutput = retainedEconomy * CONQUEST_INITIAL_INTEGRATION_SHARE;
  return {
    attackerId,
    targetId,
    territoryCount: territories.length,
    retainedPopulation: round(retainedPopulation),
    retainedEconomy: round(retainedEconomy),
    initialOccupationOutput: round(initialOccupationOutput),
    maxTreasurySeized: round((state.players[targetId]?.treasury ?? 0) * 0.25),
    inheritedEnemyManpower: 0,
    asOfTick: state.tick,
    assumptions: ['10% initial integration', '12.5–170 year immutable size curve', 'occupation army transferred from attacker', '25% treasury only on final elimination', 'no enemy manpower inheritance'],
  };
}

export function selectStrategicScoreV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  militaryBaseSnapshot: MilitaryBaseSnapshotV2 = createMilitaryBaseSnapshotV2(state, content),
): number {
  const nation = state.players[playerId];
  if (!nation) return 0;
  const combatPower = selectCurrentPowerV2(state, content, playerId, militaryBaseSnapshot);
  const breakthroughs = Object.values(nation.research.breakthroughs).reduce((sum, value) => sum + value, 0);
  // Global rank is deliberately a military-power rank. Economic depth, land,
  // population and research only provide a bounded resilience tiebreaker, so a
  // huge population can never outweigh an ineffective army.
  const resilience = Math.min(combatPower * 0.10,
    0.30 * Math.sqrt(selectNationalEconomyV2(state, content, playerId).controlledOutput)
      + 0.15 * Math.sqrt(selectControlledPopulationV2(state, playerId))
      + selectTerritoriesOfV2(state, playerId).length
      + 0.35 * breakthroughs);
  return round(combatPower + resilience - Math.min(combatPower * 0.05, 0.10 * nation.warFatigue));
}

export function selectGlobalRankingV2(state: WorldStateV2, content: WorldContentV2): RankingEntryV2[] {
  const militaryBaseSnapshot = createMilitaryBaseSnapshotV2(state, content);
  return sortedNationIdsV2(state).filter((id) => !selectIsEliminatedV2(state, id)).map((id) => ({
    player: selectNationViewV2(state, content, id)!,
    score: selectStrategicScoreV2(state, content, id, militaryBaseSnapshot),
  })).sort((a, b) => b.score - a.score || a.player.id.localeCompare(b.player.id));
}

export function selectWarAccessTypeV2(state: WorldStateV2, content: WorldContentV2, attackerId: PlayerId, defenderId: PlayerId): WarAccessV2 {
  let naval = false;
  const sources = selectTerritoriesOfV2(state, attackerId);
  const targets = selectTerritoriesOfV2(state, defenderId);
  for (const source of sources) {
    for (const connection of content.territories[source.id]?.connections ?? []) {
      if (state.territories[connection.targetId]?.owner !== defenderId) continue;
      if (connection.kind === 'land') return 'land';
      naval = true;
    }
  }
  if (naval) return 'naval';
  return 'none';
}

/** Cheapest direct access between two individual territories. */
const territoryWarAccessCacheV2 = new WeakMap<WorldContentV2, Map<string, Exclude<WarAccessV2, 'none'> | null>>();

export function selectTerritoryWarAccessV2(
  content: WorldContentV2,
  sourceId: TerritoryId,
  targetId: TerritoryId,
): Exclude<WarAccessV2, 'none'> | undefined {
  let cache = territoryWarAccessCacheV2.get(content);
  if (!cache) {
    cache = new Map();
    territoryWarAccessCacheV2.set(content, cache);
  }
  const cacheKey = `${sourceId}>${targetId}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached ?? undefined;
  const explicit = content.territories[sourceId]?.connections.find((connection) => connection.targetId === targetId);
  if (explicit) {
    const access = explicit.kind === 'sea' ? 'naval' : 'land';
    cache.set(cacheKey, access);
    return access;
  }
  cache.set(cacheKey, null);
  return undefined;
}

export function selectWarMobilizationCostV2(state: WorldStateV2, content: WorldContentV2, attackerId: PlayerId, defenderId: PlayerId): number {
  const access = selectWarAccessTypeV2(state, content, attackerId, defenderId);
  if (access === 'none') return Number.POSITIVE_INFINITY;
  return 0;
}

export function selectWarOperationV2(state: WorldStateV2, warId: string, commanderId: PlayerId): FrontOperationV2 | undefined {
  return selectWarOperationsV2(state, warId, commanderId)[0];
}

export function selectWarOperationsV2(
  state: WorldStateV2,
  warId: string,
  commanderId: PlayerId,
): readonly FrontOperationV2[] {
  const war = state.wars.find((candidate) => candidate.id === warId);
  if (!war) return [];
  return war.attackerId === commanderId ? war.attackerOperations
    : war.defenderId === commanderId ? war.defenderOperations : [];
}

export function relationKeyV2(leftId: PlayerId, rightId: PlayerId): string {
  return leftId < rightId ? `${leftId}::${rightId}` : `${rightId}::${leftId}`;
}

export function stableTerritoryPairV2(leftId: TerritoryId, rightId: TerritoryId): string {
  return leftId < rightId ? `${leftId}::${rightId}` : `${rightId}::${leftId}`;
}

export function finiteStateNumbersV2(state: WorldStateV2): boolean {
  const values: number[] = [state.seed, state.rngState, state.tick];
  for (const nation of Object.values(state.players)) values.push(
    nation.treasury,
    nation.foodStock,
    nation.foodSecurity,
    nation.warFatigue,
    nation.combatExperience,
    nation.propagandaAvailableTick,
    nation.propagandaProgram?.startedTick ?? 0,
    nation.propagandaProgram?.endsTick ?? 0,
    nation.propagandaProgram?.totalSuspicionReduction ?? 0,
    nation.propagandaProgram?.weeklySuspicionReduction ?? 0,
    ...Object.values(nation.research.allocations),
    ...Object.values(nation.research.progress),
    ...Object.values(nation.research.effectLevels),
    ...Object.values(nation.research.breakthroughs),
  );
  for (const territory of Object.values(state.territories)) values.push(territory.population, territory.economy, territory.condition, territory.integration,
    territory.army.manpower, territory.army.capacity,
    territory.army.baseAttack, territory.army.baseDefense,
    territory.integrationProgram?.startedTick ?? 0,
    territory.integrationProgram?.completesTick ?? 0,
    territory.control?.share ?? 0);
  return values.every(Number.isFinite);
}

export function roundedFinanceV2(value: WeeklyFinanceBreakdownV2): WeeklyFinanceBreakdownV2 {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, typeof item === 'number' ? round(item) : item])) as unknown as WeeklyFinanceBreakdownV2;
}

export const selectDefaultContentV2 = (): WorldContentV2 => WORLD_CONTENT_V2;
