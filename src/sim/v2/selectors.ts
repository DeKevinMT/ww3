import {
  AI_HEALTHY_ARMY_TARGET,
  AI_SEVERE_DEBT_REVENUE_WEEKS,
  AI_EXCESS_TREASURY_RESEARCH_SHARE_MAX,
  AI_EXCESS_TREASURY_RESEARCH_SHARE_MIN,
  DEBT_CARRYING_PREMIUM_BASE_RATE,
  DEBT_CARRYING_PREMIUM_CRITICAL_RATE,
  DEBT_CARRYING_PREMIUM_FULL_REVENUE_WEEKS,
  DEBT_CARRYING_PREMIUM_MAX_REVENUE_SHARE,
  DEBT_CARRYING_PREMIUM_RECOVERY_RATE,
  DEBT_CARRYING_PREMIUM_START_REVENUE_WEEKS,
  DEBT_IMPORT_COST_CRITICAL_BONUS,
  DEBT_IMPORT_COST_RECOVERY_BONUS,
  DEBT_NEW_BORROWING_PREMIUM,
  DEBT_PROGRAM_ENVELOPE_FLOOR_PEACE,
  DEBT_PROGRAM_ENVELOPE_FLOOR_WAR,
  DEBT_PROGRAM_PENALTY_PEACE_CRITICAL,
  DEBT_PROGRAM_PENALTY_PEACE_RECOVERY,
  DEBT_PROGRAM_PENALTY_WAR_CRITICAL,
  DEBT_PROGRAM_PENALTY_WAR_RECOVERY,
  BASE_OPERATING_COST_MIN_TAX_REVENUE_SHARE,
  BASE_OPERATING_COST_TAX_REVENUE_SHARE,
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
  effectiveDefenseStatV2,
  FOOD_ACCESS_RESEARCH_RELIEF_PER_LEVEL,
  FOOD_ARMY_LOGISTICS_POWER,
  FOOD_ARMY_LOGISTICS_RATE,
  FOOD_ARMY_LOGISTICS_SCALE,
  FOOD_COST_GLOBAL_MULTIPLIER,
  FOOD_DOMESTIC_COST_PER_MILLION,
  FOOD_EMPTY_RESERVE_ANNUAL_MORTALITY_MAX,
  FOOD_MORTALITY_RESERVE_START_SHARE,
  FOOD_EXPORT_MARKET_PRICE_LEVEL,
  FOOD_EXPORT_PRICE_MULTIPLIER,
  FOOD_IMPORT_COST_PER_MILLION,
  FOOD_POPULATION_PRESSURE_POWER,
  FOOD_POPULATION_PRESSURE_RATE,
  FOOD_POPULATION_PRESSURE_SCALE,
  FOOD_PRESSURE_RESEARCH_RELIEF_PER_LEVEL,
  FOOD_PRICE_LEVEL_FLOOR,
  FOOD_PRICE_LEVEL_POST_THRESHOLD_SLOPE_SHARE,
  FOOD_PRICE_LEVEL_PER_WEALTH_THOUSAND,
  FOOD_PRICE_LEVEL_SOFTENING_THRESHOLD,
  FOOD_SHORTAGE_POPULATION_LOSS,
  FOOD_STORAGE_BASE_WEEKS,
  FOOD_STORAGE_MILLIONS_PER_KM2,
  FOOD_PRODUCTION_RESEARCH_BONUS_PER_EFFECTIVE_LEVEL,
  FOOD_PRODUCTION_RESEARCH_EFFECTIVE_CEILING,
  FOOD_PRODUCTION_RESEARCH_HALF_SATURATION,
  FOOD_STORAGE_RESEARCH_BONUS_PER_EFFECTIVE_LEVEL,
  FOOD_STORAGE_RESEARCH_EFFECTIVE_CEILING,
  FOOD_STORAGE_RESEARCH_HALF_SATURATION,
  FOOD_MAX_STOCK_WEEKS,
  FOOD_TARGET_WEEKS,
  FOOD_WAR_DEMAND_SHARE_OF_PRESSURE,
  FOOD_WAR_LOGISTICS_PRESSURE_MAX,
  FOOD_WAR_LOGISTICS_PRESSURE_PER_LOAD,
  FOOD_WAR_SUPPLY_RELIEF_PER_LEVEL,
  NATIONAL_IQ_ECONOMY_GROWTH_PER_POINT,
  NATIONAL_IQ_EFFECTIVE_SCORE_MAX,
  NATIONAL_COMBAT_GDP_PER_CAPITA_CEILING,
  NATIONAL_COMBAT_GDP_PER_CAPITA_FLOOR,
  NATIONAL_COMBAT_SYSTEM_QUALITY_SPAN,
  NATIONAL_COMBAT_ECONOMY_RESEARCH_HALF_SATURATION,
  NATIONAL_COMBAT_ECONOMY_RESEARCH_MAX_BONUS,
  NATIONAL_COMBAT_RESEARCH_CONVERSION_MAX,
  NATIONAL_COMBAT_RESEARCH_CONVERSION_MIN,
  NATIONAL_IQ_GDP_PER_CAPITA_FLOOR,
  NATIONAL_IQ_INSTITUTIONAL_CAPACITY_CEILING,
  NATIONAL_IQ_INSTITUTIONAL_CAPACITY_FLOOR,
  NATIONAL_IQ_LOGISTICS_PER_POINT,
  NATIONAL_IQ_POPULATION_GROWTH_PER_POINT,
  NATIONAL_IQ_RESEARCH_PER_POINT,
  NATIONAL_IQ_RESEARCH_HALF_SATURATION,
  NATIONAL_IQ_RESEARCH_MAX_BONUS,
  NATIONAL_IQ_SCORE_MAX,
  NATIONAL_IQ_SCORE_MIN,
  NATIONAL_IQ_SCORE_NEUTRAL,
  NATIONAL_QUALITY_GDP_WEIGHT,
  NATIONAL_QUALITY_IQ_WEIGHT,
  EXTREME_CRISIS_DEMOBILIZATION_RATE,
  EXTREME_CRISIS_FOOD_COVERAGE,
  EXTREME_CRISIS_FOOD_RESERVE_WEEKS,
  EXTREME_CRISIS_HOME_GUARD_CAPACITY_SHARE,
  EXTREME_CRISIS_MAX_UPKEEP_FUNDING,
  PASSIVE_RECRUITMENT_CAPACITY_RATE,
  PASSIVE_RECRUITMENT_TRAINING_BONUS,
  RECRUITMENT_SIZE_REFERENCE_CAPACITY,
  RECRUITMENT_SIZE_SCALING_EXPONENT,
  RECRUITMENT_SIZE_SPEED_MAX,
  RECRUITMENT_SIZE_SPEED_MIN,
  OPERATING_EFFICIENCY_RESEARCH_EFFECTIVE_CEILING,
  OPERATING_EFFICIENCY_RESEARCH_HALF_SATURATION,
  OPERATING_EFFICIENCY_RESEARCH_REDUCTION_PER_EFFECTIVE_LEVEL,
  PEACE_RECRUITMENT_ACCELERATION_COST_MULTIPLIER,
  PEACE_RECRUITMENT_ACCELERATION_MULTIPLIER,
  TRAINED_RESERVE_ACTIVE_READY_RATIO,
  TRAINED_RESERVE_CAPACITY_MULTIPLIER,
  TRAINED_RESERVE_DEPLOYMENT_THROUGHPUT_MULTIPLIER,
  TRAINED_RESERVE_TRAINING_COST_MULTIPLIER,
  TRAINED_RESERVE_WARTIME_TRAINING_FACTOR,
  RESERVE_MOBILIZATION_RESEARCH_BONUS_PER_EFFECTIVE_LEVEL,
  RESERVE_MOBILIZATION_RESEARCH_EFFECTIVE_CEILING,
  RESERVE_MOBILIZATION_RESEARCH_HALF_SATURATION,
  RESERVE_TRAINING_RESEARCH_BONUS_PER_EFFECTIVE_LEVEL,
  RESERVE_TRAINING_RESEARCH_EFFECTIVE_CEILING,
  RESERVE_TRAINING_RESEARCH_HALF_SATURATION,
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
  RESEARCH_CATCH_UP_FULL_GAP,
  RESEARCH_CATCH_UP_MAX_BONUS,
  RESEARCH_COST_CAPACITY_MAX_MULTIPLIER,
  RESEARCH_COST_CAPACITY_MIN_MULTIPLIER,
  RESEARCH_COST_CAPACITY_REFERENCE,
  RESEARCH_COST_GROWTH,
  RESEARCH_INSTITUTION_CAPACITY_BASE_MAX,
  RESEARCH_INSTITUTION_CAPACITY_BASE_MIN,
  RESEARCH_INSTITUTION_MULTIPLIER_MAX,
  RESEARCH_INSTITUTION_MULTIPLIER_MIN,
  RESEARCH_MASTERY_POWER,
  TAX_EFFICIENCY_RESEARCH_BONUS_PER_EFFECTIVE_LEVEL,
  TAX_EFFICIENCY_RESEARCH_EFFECTIVE_CEILING,
  TAX_EFFICIENCY_RESEARCH_HALF_SATURATION,
  NATIONAL_AI_FUNDED_FREE_CASHFLOW_SHARE,
  WAR_RECRUITMENT_ACCELERATION_COST_MULTIPLIER,
  WAR_RECRUITMENT_ACCELERATION_MULTIPLIER,
  warAccessOperationMultiplierV2,
  WAR_FATIGUE_OPERATION_COST_MAX_BONUS,
  WAR_FATIGUE_OPERATION_COST_PER_POINT,
  WAR_OPERATION_COST_PER_MILLION,
  WAR_OPERATION_REVENUE_SHARE,
  WAR_RECRUITMENT_THROUGHPUT_FACTOR,
  researchFundingShareV2,
  clamp,
  debtPressureV2,
  diminishingResearchLevelV2,
  excessTreasuryInvestmentV2,
  round,
  smoothstep,
} from './balance';
import {
  WORLD_CONTENT_V2,
  nationalCombatSystemQualityMultiplierV2,
  openingCombatQualityMultiplierV2,
  type WorldContentV2,
} from './content';
import { calculateBlendedFiscalCapacityV2 } from './fiscal';
import { localArmyBaseQualityV2, mixArmyBaseQualityV2, nationArmyBaseQualityV2 } from './armyQuality';
import {
  initialNationArmyCapacityBenchmarkV2,
  nationalArmyCapacityTargetV2,
  stateArmyCapacityTargetsV2,
} from './capacity';
import {
  nationalAiEfficiencyV2,
  nationalAiTreasuryPolicyV2,
  optimizeNationalAiPlanV2,
  redirectDevelopmentFundingToFoodV2,
} from './nationalAi';
import { initialManualActionCostV2, manualActionUseMultiplierV2 } from './manualActions';
import { isHumanPlayerV2 } from './humanPlayers';
import {
  processOpeningArmyBonusDecayV2,
  selectOpeningArmyBonusRemainingV2,
} from './openingArmyBonus';
import {
  composeTraitContextV2,
  traitNationContextV2,
  traitOperationContextV2,
  traitTerritoryContextV2,
  traitWarContextV2,
} from './traitContext';
import { applyResearchProgressTraitV2 } from './traitResearch';
import {
  countryTraitFactorV2,
  countryTraitModifiersV2,
  countryTraitReplacementValueV2,
  traitModifierAppliesV2,
  type TraitEvaluationContextV2,
} from './traits';
import {
  nationIdV2,
  type ArmyStateV2,
  ArmyStrengthV2,
  BudgetPolicyV2,
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
  ResearchAllocationsV2,
  ResearchBranchV2,
  ResearchEffectV2,
  ResearchPortfolioV2,
  ResearchSurgeTermsV2,
  TerritoryId,
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
const ordinaryResearchFundingSharesCache = new WeakMap<ResearchAllocationsV2, Readonly<Record<ResearchBranchV2, number>>>();
const cappedEducationFundingSharesCache = new WeakMap<ResearchAllocationsV2, Readonly<Record<ResearchBranchV2, number>>>();
interface TerritoryIndexV2 {
  owned: Map<PlayerId, TerritoryId[]>;
}
const territoryIndexCache = new WeakMap<WorldStateV2, TerritoryIndexV2>();

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

export interface NationalCombatQualityV2 {
  /** Live integrated GDP per person, in dollars. */
  gdpPerCapita: number;
  /** Signed additive share of system quality supplied by live GDP per capita. */
  gdpSystemContribution: number;
  /** Signed additive share of system quality supplied by live national IQ. */
  iqSystemContribution: number;
  /** Owner-wide quality created by current GDP per capita plus national IQ. */
  systemMultiplier: number;
  /** IQ-scaled conversion of completed research into practical capability. */
  researchConversion: number;
  /** Shared ATK/DEF modernisation supplied by Economy & Science research. */
  economyResearchMultiplier: number;
  /** Product of the live national system and shared research multipliers. */
  combinedMultiplier: number;
}

export interface MilitaryBaseSnapshotV2 {
  byNation: ReadonlyMap<PlayerId, MilitaryBaseRatingsV2>;
  nationalQualityByNation: ReadonlyMap<PlayerId, NationalCombatQualityV2>;
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
  index = { owned: new Map() };
  for (const id of sortedTerritoryIdsV2(state)) {
    const territory = state.territories[id]!;
    const owned = index.owned.get(territory.owner) ?? [];
    owned.push(id);
    index.owned.set(territory.owner, owned);
  }
  territoryIndexCache.set(state, index);
  return index;
}

/** Call whenever canonical territory ownership changes during a tick. */
export function invalidateTerritoryIndexV2(state: WorldStateV2): void {
  territoryIndexCache.delete(state);
}

/** Call whenever a permanently absorbed nation is removed from canonical state. */
export function invalidateNationIndexV2(state: WorldStateV2): void {
  nationIdCache.delete(state);
}

function nationalCombatQualityFromWealthV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  wealthPerPersonThousands: number,
): NationalCombatQualityV2 {
  const nation = state.players[playerId];
  const definition = content.nations[playerId];
  const iqScore = selectNationalIqViewV2(state, content, playerId).score;
  const iqProgress = (iqScore - NATIONAL_IQ_SCORE_MIN)
    / Math.max(0.000001, NATIONAL_IQ_EFFECTIVE_SCORE_MAX - NATIONAL_IQ_SCORE_MIN);
  const researchConversion = NATIONAL_COMBAT_RESEARCH_CONVERSION_MIN
    + (NATIONAL_COMBAT_RESEARCH_CONVERSION_MAX - NATIONAL_COMBAT_RESEARCH_CONVERSION_MIN)
      * iqProgress;
  const economyLevel = Math.max(0, nation?.research.effectLevels['economy-growth'] ?? 0)
    * researchConversion;
  const economyResearchBonus = economyLevel <= 0 ? 0
    : NATIONAL_COMBAT_ECONOMY_RESEARCH_MAX_BONUS * economyLevel
      / (economyLevel + NATIONAL_COMBAT_ECONOMY_RESEARCH_HALF_SATURATION);
  const gdpPerCapita = Math.max(0, wealthPerPersonThousands) * 1_000;
  const openingGdpPerCapita = definition
    ? definition.real.gdp / Math.max(0.000001, definition.real.population) * 1_000
    : gdpPerCapita;
  const openingIqScore = definition?.iqScore ?? iqScore;
  const openingSystemQuality = nationalCombatSystemQualityMultiplierV2(
    openingGdpPerCapita, openingIqScore,
  );
  const gdpOnlySystemQuality = nationalCombatSystemQualityMultiplierV2(
    gdpPerCapita, openingIqScore,
  );
  const liveSystemQuality = nationalCombatSystemQualityMultiplierV2(gdpPerCapita, iqScore);
  // Opening GDP, GDP/capita and IQ already form the army's stored ATK/DEF.
  // The live multiplier is therefore relative to that opening quality and only
  // represents subsequent economic or educational change.
  const systemMultiplier = liveSystemQuality / Math.max(0.000001, openingSystemQuality);
  const gdpSystemContribution = gdpOnlySystemQuality
    / Math.max(0.000001, openingSystemQuality) - 1;
  const iqSystemContribution = (liveSystemQuality - gdpOnlySystemQuality)
    / Math.max(0.000001, openingSystemQuality);
  const economyResearchMultiplier = 1 + economyResearchBonus;
  return {
    gdpPerCapita: round(gdpPerCapita, 6),
    gdpSystemContribution: round(gdpSystemContribution, 9),
    iqSystemContribution: round(iqSystemContribution, 9),
    systemMultiplier,
    researchConversion: round(researchConversion, 9),
    economyResearchMultiplier: round(economyResearchMultiplier, 9),
    combinedMultiplier: round(systemMultiplier * economyResearchMultiplier, 9),
  };
}

/** National display/outcome average. Combat always reads each local army. */
export function createMilitaryBaseSnapshotV2(
  state: WorldStateV2,
  content: WorldContentV2,
): MilitaryBaseSnapshotV2 {
  interface Accumulator { attackMass: number; defenseMass: number; manpower: number }
  const accumulators = new Map<PlayerId, Accumulator>();
  const integratedEconomies = new Map<PlayerId, { output: number; population: number }>();
  for (const territoryId of sortedTerritoryIdsV2(state)) {
    const territory = state.territories[territoryId];
    if (!territory) continue;
    const integration = clamp(territory.integration, 0, 1);
    const economy = integratedEconomies.get(territory.owner) ?? { output: 0, population: 0 };
    economy.output += territory.economy * integration;
    economy.population += territory.population * integration;
    integratedEconomies.set(territory.owner, economy);
    if (territory.army.manpower > 0) {
      const accumulator = accumulators.get(territory.owner) ?? {
        attackMass: 0, defenseMass: 0, manpower: 0,
      };
      accumulator.attackMass += territory.army.baseAttack * territory.army.manpower;
      accumulator.defenseMass += territory.army.baseDefense * territory.army.manpower;
      accumulator.manpower += territory.army.manpower;
      accumulators.set(territory.owner, accumulator);
    }
  }

  const byNation = new Map<PlayerId, MilitaryBaseRatingsV2>();
  const nationalQualityByNation = new Map<PlayerId, NationalCombatQualityV2>();
  for (const playerId of sortedNationIdsV2(state)) {
    const fallback = nationArmyBaseQualityV2(content, playerId);
    const accumulator = accumulators.get(playerId);
    if (!accumulator || accumulator.manpower <= 0) {
      byNation.set(playerId, fallback);
    } else {
      byNation.set(playerId, {
        attack: round(accumulator.attackMass / accumulator.manpower, 9),
        defense: round(accumulator.defenseMass / accumulator.manpower, 9),
      });
    }
    const live = integratedEconomies.get(playerId);
    const definition = content.nations[playerId];
    const fallbackWealth = definition
      ? definition.real.gdp / Math.max(0.000001, definition.real.population) : 0;
    const wealthPerPerson = live && live.population > 0
      ? live.output / live.population : fallbackWealth;
    nationalQualityByNation.set(playerId, nationalCombatQualityFromWealthV2(
      state, content, playerId, wealthPerPerson,
    ));
  }
  return { byNation, nationalQualityByNation };
}

export function selectMilitaryBaseRatingsV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  snapshot: MilitaryBaseSnapshotV2 = createMilitaryBaseSnapshotV2(state, content),
): MilitaryBaseRatingsV2 {
  return snapshot.byNation.get(playerId) ?? nationArmyBaseQualityV2(content, playerId);
}

export function selectNationalCombatQualityV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  snapshot?: MilitaryBaseSnapshotV2,
): NationalCombatQualityV2 {
  const cached = snapshot?.nationalQualityByNation.get(playerId);
  if (cached) return cached;
  const economy = selectNationalEconomyV2(state, content, playerId);
  const definition = content.nations[playerId];
  const fallbackWealth = definition
    ? definition.real.gdp / Math.max(0.000001, definition.real.population) : 0;
  return nationalCombatQualityFromWealthV2(
    state,
    content,
    playerId,
    economy.population > 0 ? economy.wealthPerPerson : fallbackWealth,
  );
}

export interface NationalIqViewV2 {
  baselineScore: number;
  researchBonus: number;
  score: number;
  source: 'country-learning-gameplay-baseline' | 'country-learning-gameplay-baseline-plus-research';
  combatQualityMultiplier: number;
  economyGrowthMultiplier: number;
  researchMultiplier: number;
  logisticsMultiplier: number;
  populationGrowthMultiplier: number;
}

interface NationalIqViewCacheEntryV2 {
  content: WorldContentV2;
  baselineScore: number;
  researchLevel: number;
  view: NationalIqViewV2;
}

const nationalIqViewCache = new WeakMap<
  WorldStateV2,
  Map<PlayerId, NationalIqViewCacheEntryV2>
>();

/**
 * One bounded, inspectable quality view shared by every IQ-influenced system.
 * The score is a gameplay proxy, not a scientific real-world IQ measurement.
 */
export function selectNationalIqViewV2(content: WorldContentV2, playerId: PlayerId): NationalIqViewV2;
export function selectNationalIqViewV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): NationalIqViewV2;
export function selectNationalIqViewV2(
  stateOrContent: WorldStateV2 | WorldContentV2,
  contentOrPlayerId: WorldContentV2 | PlayerId,
  effectivePlayerId?: PlayerId,
): NationalIqViewV2 {
  const state = effectivePlayerId === undefined ? undefined : stateOrContent as WorldStateV2;
  const content = effectivePlayerId === undefined
    ? stateOrContent as WorldContentV2 : contentOrPlayerId as WorldContentV2;
  const playerId = effectivePlayerId ?? contentOrPlayerId as PlayerId;
  const definition = content.nations[playerId];
  const iqTraitFactor = countryTraitFactorV2(
    playerId,
    'national-iq',
    state ? traitNationContextV2(state, playerId) : {},
  );
  const baselineScore = clamp(
    (definition?.iqScore ?? NATIONAL_IQ_SCORE_NEUTRAL) * iqTraitFactor,
    NATIONAL_IQ_SCORE_MIN,
    NATIONAL_IQ_SCORE_MAX,
  );
  const researchLevel = Math.max(
    0,
    state?.players[playerId]?.research.effectLevels['iq-increase'] ?? 0,
  );
  const cached = state ? nationalIqViewCache.get(state)?.get(playerId) : undefined;
  if (cached
    && cached.content === content
    && cached.baselineScore === baselineScore
    && cached.researchLevel === researchLevel) return cached.view;
  const uncappedResearchBonus = diminishingResearchLevelV2(
    researchLevel,
    NATIONAL_IQ_RESEARCH_MAX_BONUS,
    NATIONAL_IQ_RESEARCH_HALF_SATURATION,
  );
  const score = clamp(
    baselineScore + uncappedResearchBonus,
    NATIONAL_IQ_SCORE_MIN,
    NATIONAL_IQ_EFFECTIVE_SCORE_MAX,
  );
  const researchBonus = score - baselineScore;
  const delta = score - NATIONAL_IQ_SCORE_NEUTRAL;
  const gdpPerCapita = definition
    ? definition.real.gdp / Math.max(0.000001, definition.real.population) * 1_000
    : NATIONAL_IQ_GDP_PER_CAPITA_FLOOR;
  const view: NationalIqViewV2 = {
    baselineScore: round(baselineScore, 3),
    researchBonus: round(researchBonus, 3),
    score: round(score, 3),
    source: researchBonus > 0
      ? 'country-learning-gameplay-baseline-plus-research'
      : 'country-learning-gameplay-baseline',
    combatQualityMultiplier: definition
      ? openingCombatQualityMultiplierV2(gdpPerCapita, score) : 1,
    economyGrowthMultiplier: round(1 + delta * NATIONAL_IQ_ECONOMY_GROWTH_PER_POINT, 9),
    researchMultiplier: round(1 + delta * NATIONAL_IQ_RESEARCH_PER_POINT, 9),
    logisticsMultiplier: round(1 + delta * NATIONAL_IQ_LOGISTICS_PER_POINT, 9),
    populationGrowthMultiplier: round(
      1 - delta * NATIONAL_IQ_POPULATION_GROWTH_PER_POINT,
      9,
    ),
  };
  if (state) {
    let byPlayer = nationalIqViewCache.get(state);
    if (!byPlayer) {
      byPlayer = new Map();
      nationalIqViewCache.set(state, byPlayer);
    }
    byPlayer.set(playerId, { content, baselineScore, researchLevel, view });
  }
  return view;
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
    isHuman: isHumanPlayerV2(state, playerId),
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
      fronts > 0 ? 0.05 + 0.025 * (fronts - 1) + 0.0008 * fatigue : 0.03 * peaceTransition,
      0,
      fronts > 0 ? 0.25 : 0.03,
    )),
    economyGrowthDrag: round(fronts > 0
      ? 0.014 + 0.005 * (fronts - 1) + 0.00006 * fatigue
      : 0.007 * peaceTransition),
    populationGrowthDrag: round(fronts > 0 ? 0.004 * fronts + 0.00004 * fatigue : 0.0025 * peaceTransition),
    researchPenalty: round(clamp(
      fronts > 0 ? 0.16 + 0.06 * (fronts - 1) + 0.0006 * fatigue : 0.08 * peaceTransition,
      0,
      0.45,
    )),
  };
}

function attributedShare(territory: TerritoryStateV2, playerId: PlayerId): number {
  // Ownership changes only after decisive conquest. Integration is the one
  // visible share used by population capacity, output, revenue and food until
  // the conquered territory is fully incorporated.
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
    baselineProductivePopulation: ledger.baselineProductivePopulation,
    productivePopulationFactor: ledger.productivePopulationFactor,
    wealthPerPerson: ledger.wealthPerPerson,
    fiscalReferenceWealthPerPerson: ledger.fiscalReferenceWealthPerPerson,
    output: ledger.demographicOutput,
    controlledOutput: ledger.integratedOutput,
    taxableOutput: ledger.taxableOutput,
    taxRate: ledger.taxRate,
    dynamicTaxRate: ledger.dynamicTaxRate,
    weeklyRevenue: ledger.weeklyTaxRevenue,
  };
}

export function selectTaxEfficiencyMultiplierV2(state: WorldStateV2, playerId: PlayerId): number {
  const level = state.players[playerId]?.research.effectLevels['tax-efficiency'] ?? 0;
  const effectiveLevel = diminishingResearchLevelV2(
    level,
    TAX_EFFICIENCY_RESEARCH_EFFECTIVE_CEILING,
    TAX_EFFICIENCY_RESEARCH_HALF_SATURATION,
  );
  const researchedMultiplier = 1
    + TAX_EFFICIENCY_RESEARCH_BONUS_PER_EFFECTIVE_LEVEL * effectiveLevel;
  return round(researchedMultiplier * countryTraitFactorV2(
    playerId,
    'tax-efficiency',
    traitNationContextV2(state, playerId),
  ), 9);
}

export function selectBaseOperatingCostShareV2(state: WorldStateV2, playerId: PlayerId): number {
  const level = state.players[playerId]?.research.effectLevels['operating-efficiency'] ?? 0;
  const effectiveLevel = diminishingResearchLevelV2(
    level,
    OPERATING_EFFICIENCY_RESEARCH_EFFECTIVE_CEILING,
    OPERATING_EFFICIENCY_RESEARCH_HALF_SATURATION,
  );
  const researchedShare = Math.max(
    BASE_OPERATING_COST_MIN_TAX_REVENUE_SHARE,
    BASE_OPERATING_COST_TAX_REVENUE_SHARE
      - OPERATING_EFFICIENCY_RESEARCH_REDUCTION_PER_EFFECTIVE_LEVEL * effectiveLevel,
  );
  return round(researchedShare * countryTraitFactorV2(
    playerId,
    'base-operating-cost',
    traitNationContextV2(state, playerId),
  ), 9);
}

export function selectEconomicOutputLedgerV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): EconomicOutputLedgerV2 {
  let population = 0;
  let productivePopulation = 0;
  let baselineProductivePopulation = 0;
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
    baselineProductivePopulation += Math.max(
      0,
      content.territories[id]?.baseline.population ?? 0,
    ) * share;
  }
  // The automatic rate uses immutable reference population so population
  // growth cannot lower the rate enough to cancel its contribution to tax.
  // The taxable base itself blends a stable half of real integrated GDP with
  // a half that follows live productive population. At the opening baseline
  // the factor is exactly one, preserving the previous calibrated income.
  const fiscalCapacity = calculateBlendedFiscalCapacityV2(
    integratedOutput,
    productivePopulation,
    baselineProductivePopulation,
  );
  const configuredReferenceRate = content.nations[playerId]?.real.taxRevenueShare;
  const referenceTaxRate = Number.isFinite(configuredReferenceRate)
    ? configuredReferenceRate! : null;
  return {
    population: round(population),
    productivePopulation: round(productivePopulation),
    baselineProductivePopulation: round(baselineProductivePopulation),
    productivePopulationFactor: fiscalCapacity.productivePopulationFactor,
    effectivePopulation: round(productivePopulation, 9),
    wealthPerPerson: fiscalCapacity.wealthPerPerson,
    fiscalReferenceWealthPerPerson: fiscalCapacity.fiscalReferenceWealthPerPerson,
    demographicOutput: round(demographicOutput),
    conditionAdjustedOutput: round(demographicOutput),
    integratedOutput: round(integratedOutput),
    warOutputPenalty: 0,
    warAdjustedOutput: round(integratedOutput),
    taxableOutput: round(fiscalCapacity.taxableOutput),
    dynamicTaxRate: round(fiscalCapacity.dynamicTaxRate, 9),
    taxRate: round(fiscalCapacity.dynamicTaxRate, 9),
    referenceTaxRate: referenceTaxRate === null ? null : round(referenceTaxRate, 9),
    weeklyTaxRevenue: round(
      fiscalCapacity.weeklyTaxRevenue * selectTaxEfficiencyMultiplierV2(state, playerId),
    ),
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
  militaryBaseSnapshot?: MilitaryBaseSnapshotV2,
): number {
  const level = state.players[playerId]?.research.effectLevels.attack ?? 0;
  const nationalQuality = selectNationalCombatQualityV2(
    state, content, playerId, militaryBaseSnapshot,
  );
  const deterrence = selectNuclearPowerV2(state, content, playerId);
  const researchMultiplier = (1 + 0.01 * level * nationalQuality.researchConversion)
    * (1 + deterrence.attackBonus);
  return round(army.baseAttack * nationalQuality.combinedMultiplier * researchMultiplier);
}

export function selectEffectiveDefenseV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  army: ArmyStateV2,
  militaryBaseSnapshot?: MilitaryBaseSnapshotV2,
): number {
  const level = state.players[playerId]?.research.effectLevels.defense ?? 0;
  const nationalQuality = selectNationalCombatQualityV2(
    state, content, playerId, militaryBaseSnapshot,
  );
  const convertedLevel = level * nationalQuality.researchConversion;
  const researchBonus = convertedLevel <= 0 ? 0
    : DEFENSE_RESEARCH_MAX_BONUS * convertedLevel
      / (convertedLevel + DEFENSE_RESEARCH_HALF_SATURATION);
  const researchMultiplier = 1 + researchBonus;
  const rawDefense = army.baseDefense * nationalQuality.combinedMultiplier * researchMultiplier;
  return round(effectiveDefenseStatV2(rawDefense));
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

/** Live conventional army power from deployed manpower and current quality. */
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

export function createPowerSnapshotV2(
  state: WorldStateV2,
  content: WorldContentV2,
  militaryBaseSnapshot: MilitaryBaseSnapshotV2 = createMilitaryBaseSnapshotV2(state, content),
): PowerSnapshotV2 {
  const byNation = new Map<PlayerId, number>();
  let leaderPower = 1;
  let leaderBreakthroughs = 0;
  for (const playerId of sortedNationIdsV2(state)) {
    const power = selectCurrentPowerV2(state, content, playerId, militaryBaseSnapshot);
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
  state: WorldStateV2,
  _content: WorldContentV2,
  playerId: PlayerId,
  powerSnapshot: PowerSnapshotV2 = createPowerSnapshotV2(state, _content),
): number {
  const nation = state.players[playerId];
  if (!nation) return 1;
  const ownBreakthroughs = Object.values(nation.research.breakthroughs)
    .reduce((sum, value) => sum + value, 0);
  const technologyGap = Math.max(0, powerSnapshot.leaderBreakthroughs - ownBreakthroughs);
  const catchUpBonus = RESEARCH_CATCH_UP_MAX_BONUS
    * clamp(technologyGap / RESEARCH_CATCH_UP_FULL_GAP, 0, 1);
  return round(1 + catchUpBonus * countryTraitFactorV2(
    playerId,
    'research-catch-up-bonus',
    traitNationContextV2(state, playerId),
  ));
}

/**
 * One stored breakthrough level is not equally valuable to every country.
 * Demographic research scales down as the empire population grows; economic
 * research has diminishing returns as output per person approaches rich-state
 * levels. Other effects remain the clear +1% baseline.
 */
export function selectResearchEffectImpactV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  effect: ResearchEffectV2,
): number {
  if (effect === 'population-growth') {
    const population = Math.max(0.01, selectControlledPopulationV2(state, playerId));
    // Small countries can translate a breakthrough across their whole
    // population quickly; continental-scale systems gain less per level.
    return round(clamp(2.4 / (1 + Math.sqrt(population / 25)), 0.25, 2.4));
  }
  if (effect === 'economy-growth') {
    const wealthPerPerson = Math.max(0, selectNationalEconomyV2(
      state, content, playerId,
    ).wealthPerPerson);
    // Catch-up is strongest in low-output economies, while rich economies
    // still receive a useful but bounded improvement from every level.
    return round(clamp(2.4 / (1 + wealthPerPerson / 40), 0.40, 2.4));
  }
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
  const costOfLiving = selectArmyCostOfLivingFactorV2(state, content, playerId);
  const baseCost = 2 * qualityPremium * (1 - 0.01 * efficiency)
    * costOfLiving
    / nationalAiEfficiencyV2(selectNationalIqViewV2(state, content, playerId).score);
  return round(baseCost * countryTraitFactorV2(
    playerId,
    'recruitment-cost',
    traitNationContextV2(state, playerId),
  ));
}

/**
 * Local military labour and supply prices track live GDP per capita. The
 * square-root curve makes low-income mass armies materially cheaper without
 * allowing poverty to erase upkeep, while rich elite forces pay more per
 * soldier on top of their existing quality premium.
 */
export function armyCostOfLivingFactorFromWealthV2(
  wealthPerPersonThousands: number,
): number {
  const localWealth = Math.max(0, wealthPerPersonThousands);
  return round(clamp(0.55 + 0.45 * Math.sqrt(localWealth / 40), 0.58, 1.45));
}

export function selectArmyCostOfLivingFactorV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): number {
  return armyCostOfLivingFactorFromWealthV2(
    selectNationalEconomyV2(state, content, playerId).wealthPerPerson,
  );
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
  const cost = amount <= 0 ? 0 : round(openingQuote.baseCost * useMultiplier
    * countryTraitFactorV2(
      playerId,
      'rapid-recruitment-cost',
      traitNationContextV2(state, playerId),
    ));
  const costPerMillion = amount > 0 ? round(cost / amount) : 0;
  let reason: string | undefined;
  if (!nation || selectTerritoriesOfV2(state, playerId).length === 0) reason = 'Country is unavailable.';
  else if (atWar) reason = 'Rapid Recruitment is unavailable during war; trained reserves handle replacements.';
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
  _powerSnapshot?: PowerSnapshotV2,
): number {
  const army = selectTotalManpowerV2(state, playerId);
  const gap = Math.max(0, army.capacity - army.deployed);
  const activeWars = selectWarsOfV2(state, playerId).length;
  const wartimeTraining = activeWars > 0
    ? WAR_RECRUITMENT_THROUGHPUT_FACTOR / Math.sqrt(activeWars) : 1;
  const passiveTraitFactor = activeWars === 0
    ? countryTraitFactorV2(
      playerId,
      'passive-recruitment',
      traitNationContextV2(state, playerId),
    )
    : 1;
  return round(Math.min(gap, selectRecruitmentTrainingPipelineV2(
    state, content, playerId,
  ) * wartimeTraining * passiveTraitFactor));
}

/**
 * Gross weekly training capacity before an active-army gap is applied. This
 * same deterministic pipeline fills the deployed army in peace, builds the
 * trained pool after readiness, and bounds reserve replacement in war.
 */
export function selectRecruitmentTrainingPipelineV2(
  state: WorldStateV2,
  _content: WorldContentV2,
  playerId: PlayerId,
): number {
  const nation = state.players[playerId];
  if (!nation) return 0;
  const army = selectTotalManpowerV2(state, playerId);
  if (army.capacity <= 0) return 0;
  // Every nation shares the same baseline. Scaling is deliberately sublinear:
  // a small maximum army reaches readiness sooner than a very large one, while
  // the bounded factor prevents microstates or superpowers becoming outliers.
  // IQ still affects actual funding through selectRecruitmentUnitCostV2.
  const sizeSpeed = clamp(
    (RECRUITMENT_SIZE_REFERENCE_CAPACITY / army.capacity)
      ** RECRUITMENT_SIZE_SCALING_EXPONENT,
    RECRUITMENT_SIZE_SPEED_MIN,
    RECRUITMENT_SIZE_SPEED_MAX,
  );
  const base = Math.max(
    0.000001,
    army.capacity * PASSIVE_RECRUITMENT_CAPACITY_RATE * sizeSpeed,
  );
  const trainingLevel = diminishingResearchLevelV2(nation.research.effectLevels.training, 30, 20);
  const trained = base
    * (1 + PASSIVE_RECRUITMENT_TRAINING_BONUS * trainingLevel)
    * clamp(nation.foodSecurity, 0.10, 1);
  return round(trained * countryTraitFactorV2(
    playerId,
    'recruitment-throughput',
    traitNationContextV2(state, playerId),
  ));
}

/** A lower live cap blocks further training but never deletes existing reserves. */
export function selectTrainedReserveCapacityV2(state: WorldStateV2, playerId: PlayerId): number {
  return round(selectTotalManpowerV2(state, playerId).capacity
    * TRAINED_RESERVE_CAPACITY_MULTIPLIER
    * countryTraitFactorV2(
      playerId,
      'reserve-capacity',
      traitNationContextV2(state, playerId),
    ));
}

export function activeArmyReadyForReserveTrainingV2(deployed: number, capacity: number): boolean {
  return capacity > 0 && deployed >= capacity * TRAINED_RESERVE_ACTIVE_READY_RATIO;
}

export function selectFoodLandCapacityV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  demandOverride?: number,
): number {
  const nation = state.players[playerId];
  if (!nation) return 0;
  const foodProductionLevel = diminishingResearchLevelV2(
    nation.research.effectLevels['food-production'],
    FOOD_PRODUCTION_RESEARCH_EFFECTIVE_CEILING,
    FOOD_PRODUCTION_RESEARCH_HALF_SATURATION,
  );
  const yieldResearch = (1 + 0.005 * nation.research.effectLevels['economy-growth'])
    * (1 + FOOD_PRODUCTION_RESEARCH_BONUS_PER_EFFECTIVE_LEVEL * foodProductionLevel);
  const warDisruption = clamp(1 - 1.50 * selectWarPressureV2(state, playerId).outputPenalty, 0.35, 1);
  const demand = demandOverride ?? selectFoodDemandV2(state, playerId);
  let productivePopulation = 0;
  let calibratedProduction = 0;
  for (const view of selectTerritoriesOfV2(state, playerId)) {
    const territory = state.territories[view.id]!;
    const definition = content.territories[view.id]!;
    const integrationYield = clamp(territory.integration, 0, 1);
    const population = territory.population * integrationYield;
    if (population <= 0) continue;
    const openingCondition = clamp(
      0.66 + Math.log10(definition.baseline.gdp + 1) * 0.055
        + definition.baseline.powerIndex / 1_200,
      0.62,
      0.96,
    );
    const conditionYield = clamp(
      territory.condition / Math.max(0.01, openingCondition),
      0.20,
      1.10,
    );
    const liveEconomicStrength = clamp(
      territory.economy / Math.max(0.10, definition.baseline.gdp),
      0.25,
      1.50,
    );
    const economicYield = clamp(Math.sqrt(liveEconomicStrength), 0.50, 1.20);
    const calibratedRatio = definition.baseline.foodSelfSufficiencyRatio;
    // Synthetic test/mod content created before the FAOSTAT field existed is
    // neutral rather than non-finite; official playable content fails fast in
    // content.ts and therefore always takes the calibrated path.
    const selfSufficiency = Number.isFinite(calibratedRatio)
      ? clamp(calibratedRatio, 0.001, 3)
      : 1;
    productivePopulation += population;
    calibratedProduction += population * selfSufficiency
      * conditionYield * economicYield;
  }
  if (productivePopulation <= 0) return 0;
  // FAOSTAT's calorie-based self-sufficiency ratio is the immutable opening
  // anchor. Live damage, integration, the economy, research and war then move
  // actual capacity without confusing agricultural supply with food access.
  return round(demand * calibratedProduction / productivePopulation
    * yieldResearch * warDisruption
    * countryTraitFactorV2(
      playerId,
      'food-production',
      traitNationContextV2(state, playerId),
    ));
}

/**
 * Structural efficiency of the national food system. This influences how
 * much food can be produced locally and how expensive the remaining supply is;
 * it never directly decides how many people eat. Actual coverage is derived
 * only from funded supply plus reserves.
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
  const unmodifiedRemainingVulnerability = Math.max(0.005,
    weightedVulnerability - researchRelief - economicRelief + economicStress
      + conditionPenalty + warPenalty);
  const remainingVulnerability = Math.max(0.005,
    unmodifiedRemainingVulnerability * countryTraitFactorV2(
      playerId,
      'food-access-vulnerability',
      traitNationContextV2(state, playerId),
    ));
  const rawAccess = clamp(1 - remainingVulnerability, 0.20, 0.995);
  // Food access is a real last-mile limit. Money can buy imports, but fragile
  // distribution and institutions still leave part of the population without
  // reliable nutrition until condition, prosperity or research improves.
  return round(rawAccess);
}

/**
 * Food demand is intentionally nonlinear in the late game. Civilians remain
 * the base demand, while mega-populations and mass human armies add logistics
 * pressure.
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
  economyOverride?: NationalEconomyV2,
): number {
  const nation = state.players[playerId];
  if (!nation) return 0;
  const demand = Math.max(0.01, demandOverride ?? selectFoodDemandV2(state, playerId));
  const territories = selectTerritoriesOfV2(state, playerId);
  const landArea = territories.reduce((sum, territory) => (
    sum + (content.territories[territory.id]?.baseline.landArea ?? 0)
  ), 0);
  const economy = economyOverride ?? selectNationalEconomyV2(state, content, playerId);
  const economicInfrastructure = 0.75
    + 0.25 * clamp(economy.wealthPerPerson / 50, 0, 1);
  const foodStorageLevel = diminishingResearchLevelV2(
    nation.research.effectLevels['food-storage'],
    FOOD_STORAGE_RESEARCH_EFFECTIVE_CEILING,
    FOOD_STORAGE_RESEARCH_HALF_SATURATION,
  );
  const researchInfrastructure = (1
    + 0.01 * diminishingResearchLevelV2(nation.research.effectLevels.supply))
    * (1 + FOOD_STORAGE_RESEARCH_BONUS_PER_EFFECTIVE_LEVEL * foodStorageLevel);
  const physicalCapacity = (demand * FOOD_STORAGE_BASE_WEEKS
    + landArea * FOOD_STORAGE_MILLIONS_PER_KM2)
    * economicInfrastructure * researchInfrastructure
    * countryTraitFactorV2(
      playerId,
      'food-storage-capacity',
      traitNationContextV2(state, playerId),
    );
  return round(clamp(physicalCapacity, demand * 2, demand * FOOD_MAX_STOCK_WEEKS));
}

interface FoodPlanV2 {
  demand: number;
  landCapacity: number;
  accessCeiling: number;
  importThroughput: number;
  storageCapacity: number;
  targetStock: number;
  domesticTarget: number;
  importTarget: number;
  domesticUnitCost: number;
  importUnitCost: number;
  request: number;
}

interface FoodCapacityPlanV2 {
  demand: number;
  landCapacity: number;
  accessCeiling: number;
  importThroughput: number;
  storageCapacity: number;
  targetStock: number;
  desiredProduction: number;
}

interface FundedFoodPlanV2 {
  foodProduction: number;
  foodProduced: number;
  foodDomesticProduced: number;
  foodImported: number;
  foodExported: number;
  foodExportIncome: number;
  foodConsumed: number;
  foodCoverage: number;
  foodStockChange: number;
}

/**
 * Converts live land/naval operations into one bounded food-logistics load.
 * Before armies have selected their first operation, the declared route is
 * used so border mobilisation already carries a real supply burden.
 */
function selectWartimeFoodLogisticsPressureV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): number {
  const operationalLoad = selectWarOperationsLogisticsLoadV2(
    state,
    content,
    playerId,
    'food-logistics-pressure',
  );
  if (operationalLoad <= 0) return 0;
  const nation = state.players[playerId]!;
  const supplyRelief = 1 / (1 + FOOD_WAR_SUPPLY_RELIEF_PER_LEVEL
    * diminishingResearchLevelV2(nation.research.effectLevels.supply));
  const fatiguePressure = clamp(nation.warFatigue, 0, 100) * 0.001;
  return round(clamp(
    (operationalLoad * FOOD_WAR_LOGISTICS_PRESSURE_PER_LOAD + fatiguePressure) * supplyRelief,
    0,
    FOOD_WAR_LOGISTICS_PRESSURE_MAX,
  ));
}

function selectFoodCapacityPlanV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  demandOverride?: number,
  economyOverride?: NationalEconomyV2,
): FoodCapacityPlanV2 {
  const nation = state.players[playerId]!;
  const wartimeLogisticsPressure = selectWartimeFoodLogisticsPressureV2(state, content, playerId);
  const baseDemand = Math.max(0.01, demandOverride ?? selectFoodDemandV2(state, playerId));
  const demand = Math.max(0.01, baseDemand
    * (1 + FOOD_WAR_DEMAND_SHARE_OF_PRESSURE * wartimeLogisticsPressure));
  const physicalLandCapacity = selectFoodLandCapacityV2(state, content, playerId, baseDemand);
  const accessCeiling = selectFoodAccessCeilingV2(state, content, playerId);
  const importThroughput = clamp(1 - wartimeLogisticsPressure, 0.45, 1);
  // Domestic capacity is data-calibrated. Import-dependent microstates remain
  // genuinely import-dependent instead of receiving an artificial 70-80% floor.
  const landCapacity = physicalLandCapacity;
  const storageCapacity = selectFoodStorageCapacityV2(
    state,
    content,
    playerId,
    demand,
    economyOverride,
  );
  const targetStock = Math.min(storageCapacity, demand * FOOD_TARGET_WEEKS * accessCeiling);
  // A healthy country never deliberately produces less than this week's needs.
  // Extra supply above 100% refills storage; storage is only drawn down when
  // funding or access prevents the weekly target from being met.
  const restock = clamp((targetStock - nation.foodStock) / 26, 0, 0.10 * demand);
  // Weekly supply may exceed 100% of demand while reserves are rebuilding.
  // Citizens consume at most one week of demand; the surplus is stored.
  const desiredProduction = Math.max(0, demand + restock);
  return {
    demand: round(demand),
    landCapacity: round(landCapacity),
    accessCeiling: round(accessCeiling),
    importThroughput: round(importThroughput),
    storageCapacity: round(storageCapacity),
    targetStock: round(targetStock),
    desiredProduction: round(desiredProduction),
  };
}

/**
 * The long-run domestic food-system target. Actual capacity is canonical
 * nation state and moves toward this value only in the weekly economy phase.
 */
export function selectFoodDomesticCapacityTargetV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): number {
  if (!state.players[playerId] || selectTerritoriesOfV2(state, playerId).length === 0) return 0;
  const plan = selectFoodCapacityPlanV2(state, content, playerId);
  // Keep the whole calibrated sector online. Once reserves are full, every
  // funded domestic unit above national demand becomes an export.
  return round(plan.landCapacity);
}

export function foodPriceLevelForOutputPerPersonV2(outputPerPerson: number): number {
  const wealth = Math.max(0, Number.isFinite(outputPerPerson) ? outputPerPerson : 0);
  const fullSlopeWealth = Math.min(FOOD_PRICE_LEVEL_SOFTENING_THRESHOLD, wealth);
  const softenedWealth = Math.max(0, wealth - FOOD_PRICE_LEVEL_SOFTENING_THRESHOLD)
    * FOOD_PRICE_LEVEL_POST_THRESHOLD_SLOPE_SHARE;
  return FOOD_PRICE_LEVEL_FLOOR
    + FOOD_PRICE_LEVEL_PER_WEALTH_THOUSAND * (fullSlopeWealth + softenedWealth);
}

function selectFoodPlanV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  demandOverride?: number,
  economyOverride?: NationalEconomyV2,
): FoodPlanV2 {
  const nation = state.players[playerId]!;
  const capacityPlan = selectFoodCapacityPlanV2(
    state,
    content,
    playerId,
    demandOverride,
    economyOverride,
  );
  const domesticTarget = Number.isFinite(nation.domesticFoodCapacity)
    ? Math.max(0, nation.domesticFoodCapacity)
    : Math.min(capacityPlan.desiredProduction, capacityPlan.landCapacity);
  // Imports are the responsive channel: they immediately fill the gap left by
  // slowly changing domestic farms, processing and distribution capacity.
  // When old capacity temporarily exceeds demand it remains funded and may be
  // stored or exported rather than switching off in a single week.
  const usefulSupplyLimit = capacityPlan.demand + Math.max(
    0,
    capacityPlan.storageCapacity - nation.foodStock,
  );
  const importTarget = Math.max(
    0,
    Math.min(capacityPlan.desiredProduction, usefulSupplyLimit) - domesticTarget,
  );
  const economy = economyOverride ?? selectNationalEconomyV2(state, content, playerId);
  const outputPerPerson = economy.output / Math.max(0.01, economy.population);
  const dependency = clamp(importTarget / capacityPlan.demand, 0, 1);
  // The public efficiency view is deliberately compressed into a 70–99.5%
  // range. Expand that range again for actual costs so fragile systems carry a
  // meaningful bill without turning the value into a coverage cap.
  const systemInefficiency = clamp((1 - capacityPlan.accessCeiling) / 0.35, 0, 1);
  const warPressure = selectWarPressureV2(state, playerId).outputPenalty;
  const debtPressure = debtPressureV2(
    nation.treasury / Math.max(0.001, economy.weeklyRevenue),
  );
  const debtImportCostMultiplier = 1
    + DEBT_IMPORT_COST_RECOVERY_BONUS * debtPressure.recovery
    + DEBT_IMPORT_COST_CRITICAL_BONUS * debtPressure.critical;
  const localPriceLevel = foodPriceLevelForOutputPerPersonV2(outputPerPerson);
  const domesticUnitCost = FOOD_DOMESTIC_COST_PER_MILLION
    * FOOD_COST_GLOBAL_MULTIPLIER
    * localPriceLevel * (1 + 0.80 * systemInefficiency) * (1 + 1.5 * warPressure)
    * countryTraitFactorV2(
      playerId,
      'food-production-cost',
      traitNationContextV2(state, playerId),
    );
  const importUnitCost = FOOD_IMPORT_COST_PER_MILLION
    * FOOD_COST_GLOBAL_MULTIPLIER
    * localPriceLevel
    // Low income already reduces public revenue, so charging a second poverty
    // penalty here made India-like economies structurally unable to recover.
    // Import dependence and actual access vulnerability remain the visible risks.
    * (1 + 0.70 * dependency + 1.50 * systemInefficiency)
    * (1 + 2 * warPressure) * debtImportCostMultiplier
    * countryTraitFactorV2(
      playerId,
      'food-import-cost',
      traitNationContextV2(state, playerId),
    );
  return {
    demand: capacityPlan.demand,
    landCapacity: capacityPlan.landCapacity,
    accessCeiling: capacityPlan.accessCeiling,
    importThroughput: capacityPlan.importThroughput,
    storageCapacity: capacityPlan.storageCapacity,
    targetStock: capacityPlan.targetStock,
    domesticTarget: round(domesticTarget),
    importTarget: round(importTarget),
    domesticUnitCost: round(domesticUnitCost, 9),
    importUnitCost: round(importUnitCost, 9),
    request: round(domesticTarget * domesticUnitCost + importTarget * importUnitCost),
  };
}

/** Fund one immutable food plan and account for storage before exports. */
function fundFoodPlanV2(
  nation: NationStateV2,
  plan: FoodPlanV2,
  funding: number,
  exportIncomeFactor = 1,
): FundedFoodPlanV2 {
  const foodProduction = Math.min(plan.request, Math.max(0, funding));
  const domesticCost = plan.domesticTarget * plan.domesticUnitCost;
  const foodDomesticProduced = Math.min(
    plan.domesticTarget,
    foodProduction / plan.domesticUnitCost,
  );
  const foodFundingAfterDomestic = Math.max(
    0,
    foodProduction - Math.min(foodProduction, domesticCost),
  );
  // Import bills cover cargo loaded at origin; wartime route loss means only
  // part of that paid shipment reaches the domestic food network.
  const foodImported = Math.min(
    plan.importTarget,
    foodFundingAfterDomestic / plan.importUnitCost,
  ) * plan.importThroughput;
  const foodProduced = foodDomesticProduced + foodImported;
  const storageRoom = Math.max(0, plan.storageCapacity - nation.foodStock);
  // Exports come exclusively from domestic output remaining after a complete
  // week of national demand and every empty physical storage slot. Imports and
  // reserves can therefore never be re-exported.
  const foodExported = foodImported <= 0.000000001 ? Math.max(
    0,
    foodDomesticProduced - plan.demand - storageRoom,
  ) : 0;
  // Exporters face one bounded world market price. War disruption, debt and
  // inefficient domestic systems still raise their own production cost, so
  // only genuinely efficient producers retain a positive margin.
  const exportUnitPrice = FOOD_DOMESTIC_COST_PER_MILLION
    * FOOD_COST_GLOBAL_MULTIPLIER
    * FOOD_EXPORT_MARKET_PRICE_LEVEL
    * FOOD_EXPORT_PRICE_MULTIPLIER;
  const foodExportIncome = foodExported * exportUnitPrice * exportIncomeFactor;
  const foodAvailable = nation.foodStock + foodProduced - foodExported;
  // Access vulnerability raises the real cost of producing and importing
  // enough food. Existing national stores can still bridge a temporary crisis;
  // famine begins only when funded supply plus those reserves fall short.
  const foodConsumed = Math.min(plan.demand, foodAvailable);
  const foodCoverage = clamp(foodConsumed / Math.max(0.01, plan.demand), 0, 1);
  const foodStockChange = clamp(
    foodAvailable - foodConsumed,
    0,
    plan.storageCapacity,
  ) - nation.foodStock;
  return {
    foodProduction,
    foodProduced,
    foodDomesticProduced,
    foodImported,
    foodExported,
    foodExportIncome,
    foodConsumed,
    foodCoverage,
    foodStockChange,
  };
}

export function selectResearchBranchMaxedV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  branch: ResearchBranchV2,
): boolean {
  if (!state.players[playerId] || !RESEARCH_BRANCH_EFFECTS[branch]) return true;
  return branch === 'education-intelligence'
    && selectNationalIqViewV2(state, content, playerId).score
      >= NATIONAL_IQ_EFFECTIVE_SCORE_MAX - 0.000001;
}

/**
 * Live expansion appetite combines a neutral 2026 military-posture prior with
 * campaign history. Actual declarations, occupations and attacking wars raise
 * the value; weak reserves, damage and exhaustion still pull it back down.
 */
export function selectNationalAggressivenessV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  powerSnapshot: PowerSnapshotV2 = createPowerSnapshotV2(state, content),
): number {
  const player = state.players[playerId];
  if (!player || selectIsEliminatedV2(state, playerId)) return 0;
  const livingPowers = [...powerSnapshot.byNation.entries()]
    .filter(([id]) => Boolean(state.players[id]) && !selectIsEliminatedV2(state, id))
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const rankIndex = Math.max(0, livingPowers.findIndex(([id]) => id === playerId));
  const powerConfidence = livingPowers.length <= 1
    ? 1 : 1 - rankIndex / (livingPowers.length - 1);
  const army = selectArmyStrengthV2(state, content, playerId);
  const armyReadiness = clamp((army.fillRatio - 0.25) / 0.75, 0, 1);
  const economy = selectNationalEconomyV2(state, content, playerId);
  const treasuryWeeks = player.treasury / Math.max(0.01, economy.weeklyRevenue);
  const cashReadiness = clamp((treasuryWeeks + 2) / 10, 0, 1);
  const territories = selectTerritoriesOfV2(state, playerId);
  const condition = territories.length > 0
    ? territories.reduce((sum, territory) => sum + territory.condition, 0) / territories.length
    : 0;
  const fatigue = clamp(player.warFatigue / 100, 0, 1);
  const activeWars = selectWarsOfV2(state, playerId);
  const frontLoad = clamp(activeWars.length / 2, 0, 1);
  const activeAttacks = activeWars.filter((war) => war.attackerId === playerId).length;
  const historyStartTick = Math.max(0, state.tick - 260);
  const recentDeclarations = state.events.filter((event) => (
    event.tick >= historyStartTick
      && event.kind === 'war'
      && event.playerId === playerId
      && /declared war|joined the war/i.test(event.message)
  )).length;
  const recentConquests = state.events.filter((event) => (
    event.tick >= historyStartTick
      && event.kind === 'conquest'
      && event.playerId === playerId
  )).length;
  const occupiedOpeningHomelands = territories.filter((territory) => (
    content.territories[territory.id]?.initialOwnerId !== playerId
  )).length;
  const recentMilitaryActivity = clamp(
    0.35 * activeAttacks
      + 0.16 * recentDeclarations
      + 0.08 * recentConquests
      + 0.03 * occupiedOpeningHomelands,
    0,
    1,
  );
  const foodSecurity = clamp(player.foodSecurity, 0, 1);
  return round(clamp(
    4
      + 55 * clamp(content.nations[playerId]?.ambition ?? 0.30, 0, 1)
      + 8 * powerConfidence
      + 9 * armyReadiness
      + 5 * cashReadiness
      + 4 * condition
      + 3 * foodSecurity
      + 18 * recentMilitaryActivity
      - 20 * fatigue
      - 8 * frontLoad,
    2,
    98,
  ), 1);
}

/** Reassigns every passive and focused research dollar when a program reaches its useful cap. */
export function selectResearchFundingSharesV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): Readonly<Record<ResearchBranchV2, number>> {
  const nation = state.players[playerId];
  if (!nation) return Object.fromEntries(RESEARCH_BRANCHES.map((branch) => [branch, 0])) as Record<ResearchBranchV2, number>;
  const educationMaxed = nation.research.effectLevels['iq-increase'] > 0
    && selectResearchBranchMaxedV2(state, content, playerId, 'education-intelligence');
  const cache = educationMaxed
    ? cappedEducationFundingSharesCache : ordinaryResearchFundingSharesCache;
  const cached = cache.get(nation.research.allocations);
  if (cached) return cached;
  const raw = Object.fromEntries(RESEARCH_BRANCHES.map((branch) => [
    branch,
    educationMaxed && branch === 'education-intelligence'
      ? 0 : researchFundingShareV2(nation.research.allocations, branch),
  ])) as Record<ResearchBranchV2, number>;
  const total = RESEARCH_BRANCHES.reduce((sum, branch) => sum + raw[branch], 0);
  if (total <= 0) return raw;
  const normalized = Object.fromEntries(RESEARCH_BRANCHES.map((branch) => [
    branch,
    raw[branch] / total,
  ])) as Record<ResearchBranchV2, number>;
  cache.set(nation.research.allocations, normalized);
  return normalized;
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
  void powerSnapshot;
  const efficiency = diminishingResearchLevelV2(nation.research.effectLevels['research-efficiency']);
  const researchCapacity = Math.max(0, content.nations[playerId]?.real.researchCapacity ?? 0);
  const capacityCostMultiplier = clamp(
    researchCapacity / RESEARCH_COST_CAPACITY_REFERENCE,
    RESEARCH_COST_CAPACITY_MIN_MULTIPLIER,
    RESEARCH_COST_CAPACITY_MAX_MULTIPLIER,
  );
  return round(RESEARCH_BRANCH_BASE_RP[branch]
    * RESEARCH_BASE_COST_SCALE
    * capacityCostMultiplier
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
  if (!nation || selectResearchBranchMaxedV2(state, content, playerId, branch)) return 0;
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
  if (!nation || RESEARCH_BRANCHES.every((branch) => (
    selectResearchBranchMaxedV2(state, content, playerId, branch)
  ))) return 0;
  const fundingRatio = finance.research / Math.max(0.001, finance.revenue * 0.25);
  // Research has an institutional base, but cash still has to activate it.
  // Logarithmic cash returns stop giant economies converting raw scale into an
  // overwhelming upgrade conveyor belt; sqrt intensity rescues small states
  // from the old double linear punishment without granting progress at $0.
  const base = 0.22 + 0.08 * Math.log2(1 + Math.max(0, finance.research));
  const output = base * Math.sqrt(clamp(fundingRatio, 0, 1.25))
    * (1 + 0.01 * nation.research.effectLevels['research-speed'])
    * selectResearchInstitutionalCapacityV2(state, content, playerId)
    * (catchUpOverride ?? selectResearchCatchUpFactorV2(state, content, playerId))
    * nationalAiEfficiencyV2(selectNationalIqViewV2(state, content, playerId).score)
    * (1 - finance.warResearchPenalty)
    * (0.55 + 0.45 * clamp(nation.foodSecurity, 0, 1));
  return round(output * countryTraitFactorV2(
    playerId,
    'research-output',
    traitNationContextV2(state, playerId),
  ));
}

/** Bounded IQ gameplay-proxy effect used by ordinary R&D. */
export function selectResearchInstitutionalCapacityV2(content: WorldContentV2, playerId: PlayerId): number;
export function selectResearchInstitutionalCapacityV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): number;
export function selectResearchInstitutionalCapacityV2(
  stateOrContent: WorldStateV2 | WorldContentV2,
  contentOrPlayerId: WorldContentV2 | PlayerId,
  effectivePlayerId?: PlayerId,
): number {
  const state = effectivePlayerId === undefined ? undefined : stateOrContent as WorldStateV2;
  const content = effectivePlayerId === undefined
    ? stateOrContent as WorldContentV2 : contentOrPlayerId as WorldContentV2;
  const playerId = effectivePlayerId ?? contentOrPlayerId as PlayerId;
  const researchCapacity = content.nations[playerId]?.real.researchCapacity
    ?? NATIONAL_IQ_INSTITUTIONAL_CAPACITY_FLOOR;
  const capacityShare = clamp(
    (researchCapacity - NATIONAL_IQ_INSTITUTIONAL_CAPACITY_FLOOR)
      / (NATIONAL_IQ_INSTITUTIONAL_CAPACITY_CEILING
        - NATIONAL_IQ_INSTITUTIONAL_CAPACITY_FLOOR),
    0,
    1,
  );
  const capacityBase = RESEARCH_INSTITUTION_CAPACITY_BASE_MIN
    + (RESEARCH_INSTITUTION_CAPACITY_BASE_MAX
      - RESEARCH_INSTITUTION_CAPACITY_BASE_MIN) * capacityShare;
  return round(clamp(
    capacityBase * (state
      ? selectNationalIqViewV2(state, content, playerId)
      : selectNationalIqViewV2(content, playerId)).researchMultiplier,
    RESEARCH_INSTITUTION_MULTIPLIER_MIN,
    RESEARCH_INSTITUTION_MULTIPLIER_MAX,
  ));
}

interface NationalAiPlanSelectorInputsV2 {
  army: TotalManpowerV2;
  territories: readonly TerritoryViewV2[];
  economy: NationalEconomyV2;
  foodDemand: number;
  populationTrend: PopulationDynamicsV2;
  activeWarCount: number;
  iqScore: number;
}

export function selectNationalAiPlanV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  powerSnapshot: PowerSnapshotV2 = createPowerSnapshotV2(state, content),
  intentOverride?: BudgetPolicyV2,
  selectorInputs?: NationalAiPlanSelectorInputsV2,
): NationalAiPlanV2 {
  const nation = state.players[playerId];
  if (!nation) throw new Error(`Unknown nation ${playerId}.`);
  const army = selectorInputs?.army ?? selectTotalManpowerV2(state, playerId);
  const territories = selectorInputs?.territories ?? selectTerritoriesOfV2(state, playerId);
  const averageCondition = territories.length > 0
    ? territories.reduce((sum, territory) => sum + territory.condition, 0) / territories.length : 0;
  const breakthroughs = Object.values(nation.research.breakthroughs).reduce((sum, value) => sum + value, 0);
  const economy = selectorInputs?.economy ?? selectNationalEconomyV2(state, content, playerId);
  const foodDemand = selectorInputs?.foodDemand
    ?? Math.max(0.01, selectFoodDemandV2(state, playerId));
  const populationTrend = selectorInputs?.populationTrend
    ?? selectPopulationDynamicsV2(state, content, playerId, 0);
  return optimizeNationalAiPlanV2({
    intent: intentOverride ?? nation.budget,
    activeWars: selectorInputs?.activeWarCount ?? selectWarsOfV2(state, playerId).length,
    fillRatio: army.capacity > 0 ? clamp(army.deployed / army.capacity, 0, 1) : 0,
    averageCondition,
    researchGap: Math.max(0, powerSnapshot.leaderBreakthroughs - breakthroughs),
    treasuryWeeks: nation.treasury / Math.max(0.001, economy.weeklyRevenue),
    foodSecurity: nation.foodSecurity,
    populationGrowthRate: populationTrend.annualNetRate,
    foodReserveWeeks: nation.foodStock / foodDemand,
    iqScore: selectorInputs?.iqScore ?? selectNationalIqViewV2(state, content, playerId).score,
  });
}

/**
 * National investment is later distributed across every live owned economy.
 * Weighting its trait factor over those same territories lets an existing
 * local condition scope (for example condition below 80%) affect only its
 * share, without ever consulting absorbed owners or stacking their traits.
 */
function developmentEconomyGrowthTraitFactorV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): number {
  const territories = selectTerritoriesOfV2(state, playerId);
  const nationContext = traitNationContextV2(state, playerId);
  if (territories.length === 0) {
    return countryTraitFactorV2(playerId, 'development-economy-growth', nationContext);
  }
  let weightedFactors = 0;
  let totalWeight = 0;
  for (const territory of territories) {
    const weight = Math.max(0.000001, territory.economy);
    weightedFactors += weight * countryTraitFactorV2(
      playerId,
      'development-economy-growth',
      composeTraitContextV2(
        nationContext,
        traitTerritoryContextV2(state, content, playerId, territory.id),
      ),
    );
    totalWeight += weight;
  }
  return weightedFactors / Math.max(0.000001, totalWeight);
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
  const rawInvestment = ECONOMY_INVESTMENT_GROWTH_MULTIPLIER
    * clamp(annualInvestmentShare * aiEfficiency, 0, 0.12);
  const researchImpact = selectResearchEffectImpactV2(
    state,
    content,
    playerId,
    'economy-growth',
  );
  const rawResearch = Math.min(0.012,
    ECONOMY_RESEARCH_GROWTH_PER_LEVEL
      * nation.research.effectLevels['economy-growth'] * researchImpact);
  const iqGrowthMultiplier = selectNationalIqViewV2(state, content, playerId).economyGrowthMultiplier;
  const base = ECONOMY_BASE_ANNUAL_GROWTH * iqGrowthMultiplier;
  const investment = rawInvestment * iqGrowthMultiplier
    * developmentEconomyGrowthTraitFactorV2(state, content, playerId);
  const research = rawResearch * iqGrowthMultiplier;
  const food = foodCoverage >= 0.98
    ? ECONOMY_FOOD_SURPLUS_MAX_BONUS * clamp((foodCoverage - 0.98) / 0.02, 0, 1)
    : -ECONOMY_FOOD_SHORTAGE_MAX_DRAG
      * clamp((0.90 - foodCoverage) / 0.50, 0, 1) ** 1.25;
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
  const fundingShares = selectResearchFundingSharesV2(state, content, playerId);
  const lastFundedIndex = RESEARCH_BRANCHES.reduce((last, branch, index) => (
    fundingShares[branch] > 0 ? index : last
  ), -1);
  let assignedFunding = 0;
  let assignedOutput = 0;
  return RESEARCH_BRANCHES.map((branch, index) => {
    const maxed = selectResearchBranchMaxedV2(state, content, playerId, branch);
    const isLastFunded = index === lastFundedIndex;
    const fundingShare = fundingShares[branch];
    const weeklyFunding = maxed ? 0 : isLastFunded
      ? round(Math.max(0, finance.research - assignedFunding), 9)
      : round(finance.research * fundingShare, 9);
    const outputShare = maxed ? 0 : isLastFunded
      ? round(Math.max(0, poolOutput - assignedOutput), 9)
      : round(poolOutput * fundingShare, 9);
    assignedFunding = round(assignedFunding + weeklyFunding, 9);
    assignedOutput = round(assignedOutput + outputShare, 9);
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
      weeklyProgress: maxed ? 0 : applyResearchProgressTraitV2(
        playerId,
        branch,
        outputShare,
        traitNationContextV2(state, playerId),
      ),
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
  targetBranch: ResearchBranchV2,
): ResearchSurgeTermsV2 {
  const nation = state.players[playerId];
  const cooldownRemaining = nation
    ? Math.max(0, nation.researchSurgeAvailableTick - state.tick) : 0;
  const finance = nation ? selectWeeklyFinanceBreakdownV2(state, content, playerId) : undefined;
  const openingQuote = initialManualActionCostV2(content, playerId, 'researchSurge');
  const empireScale = openingQuote.openingScale;
  const useCount = nation?.manualActionUses.researchSurge ?? 0;
  const useMultiplier = manualActionUseMultiplierV2('researchSurge', useCount);
  const cost = round(openingQuote.baseCost * useMultiplier);
  const portfolio = nation && finance
    ? selectResearchPortfolioV2(state, content, playerId, finance) : [];
  const target = portfolio.find((branch) => branch.branch === targetBranch);
  const progressAdded = round((target?.weeklyProgress ?? 0) * RESEARCH_SURGE_PROGRESS_WEEKS);
  let reason: string | undefined;
  if (!nation || selectTerritoriesOfV2(state, playerId).length === 0) reason = 'Country is unavailable.';
  else if (!target) reason = 'Research program is unavailable.';
  else if (cooldownRemaining > 0) reason = `Research Surge returns in ${cooldownRemaining} weeks.`;
  else if (nation.treasury <= 0) reason = 'Research Surge is locked while the treasury is in debt.';
  else if (target.maxed || progressAdded <= 0.0000001) reason = 'Selected research program cannot advance.';
  else if (nation.treasury + 0.0000001 < cost) reason = `Requires $${cost.toFixed(2)}B in cash.`;
  return {
    playerId,
    targetBranch,
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
  const budget = { ...(budgetOverride ?? nation.budget) };
  const economy = selectNationalEconomyV2(state, content, playerId);
  const army = selectTotalManpowerV2(state, playerId);
  const paidDeployed = Math.max(
    0,
    army.deployed - selectOpeningArmyBonusRemainingV2(state, playerId),
  );
  const activeWars = selectWarsOfV2(state, playerId).length;
  const warPressure = selectWarPressureV2(state, playerId);
  const atWar = activeWars > 0;
  const territories = selectTerritoriesOfV2(state, playerId);
  const baseFoodDemand = Math.max(0.01, selectFoodDemandV2(state, playerId));
  const foodPlan = selectFoodPlanV2(
    state,
    content,
    playerId,
    baseFoodDemand,
    economy,
  );
  const foodExportIncomeTraitFactor = countryTraitFactorV2(
    playerId,
    'food-export-income',
    traitNationContextV2(state, playerId),
  );
  const iq = selectNationalIqViewV2(state, content, playerId);
  const populationTrend = selectPopulationDynamicsV2(
    state,
    content,
    playerId,
    0,
    foodPlan.targetStock,
  );
  const aiPlan = selectNationalAiPlanV2(
    state,
    content,
    playerId,
    powerSnapshot,
    budgetOverride,
    {
      army,
      territories,
      economy,
      foodDemand: baseFoodDemand,
      populationTrend,
      activeWarCount: activeWars,
      iqScore: iq.score,
    },
  );
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
  const integrationCost = territories.reduce((sum, territory) => sum
      + (territory.integrationProgram?.annualCost ?? 0) / 52, 0);
  const baseOperatingCost = economy.weeklyRevenue * selectBaseOperatingCostShareV2(state, playerId);
  const recurringRevenueAfterMandatory = Math.max(
    0,
    economy.weeklyRevenue + ceasefireIncome
      - baseOperatingCost - ceasefirePayment - integrationCost,
  );
  // A negative treasury is debt, not the disappearance of the country's new
  // weekly revenue. Positive reserves can fund a surge; debt cannot.
  const cashAfterRevenue = Math.max(0, nation.treasury) + economy.weeklyRevenue + ceasefireIncome;
  const cashAfterMandatory = Math.max(
    0,
    cashAfterRevenue - ceasefirePayment - integrationCost - baseOperatingCost,
  );
  // Food remains first priority, but it cannot consume several years of a
  // fragile country's public revenue in one week. Severe access crises may
  // command up to 72% of weekly revenue; the resulting unmet need remains a
  // real food shortage instead of silently draining all reserves and every
  // other national system.
  const foodFundingStress = clamp((0.98 - nation.foodSecurity) / 0.58, 0, 1);
  const foodSystemInefficiency = clamp((1 - foodPlan.accessCeiling) / 0.35, 0, 1);
  const foodReserveRatio = clamp(
    nation.foodStock / Math.max(0.01, foodPlan.targetStock),
    0,
    1,
  );
  const foodReserveStress = 1 - foodReserveRatio;
  const foodBudgetShare = clamp(
    0.12 + 0.32 * foodSystemInefficiency + 0.25 * foodFundingStress
      + 0.30 * foodReserveStress,
    0.12,
    0.78,
  );
  const ordinaryFoodAllowance = recurringRevenueAfterMandatory * foodBudgetShare;
  const reserveWeeks = nation.foodStock / Math.max(0.01, foodPlan.demand);
  const foodEmergency = reserveWeeks < 1 || nation.foodSecurity < 0.65;
  const preventiveReserveDrawShare = foodEmergency ? 1
    : smoothstep(0.15, 0.90, foodReserveStress);
  // In a genuine food emergency the national cash reserve is a survival fund.
  // It may bridge the remaining bill after normal weekly food funding, but it
  // never borrows extra money or spends beyond the actual food request.
  const emergencyReserveDraw = Math.min(
    Math.max(0, nation.treasury),
    Math.max(0, foodPlan.request - ordinaryFoodAllowance) * preventiveReserveDrawShare,
  );
  const foodSpendable = Math.min(
    cashAfterMandatory,
    ordinaryFoodAllowance + emergencyReserveDraw,
  );
  const ordinaryFoodProduction = Math.min(foodPlan.request, foodSpendable);
  const ordinaryFood = fundFoodPlanV2(
    nation,
    foodPlan,
    ordinaryFoodProduction,
    foodExportIncomeTraitFactor,
  );
  // A healthy export receipt is ordinary public income and can finance the
  // same week's national programs. Crisis transfers are resolved later and do
  // not create a circular promise here; shortages cannot export in practice.
  const discretionaryRevenue = Math.max(
    0,
    recurringRevenueAfterMandatory + ordinaryFood.foodExportIncome - ordinaryFoodProduction,
  );
  const treasuryWeeks = nation.treasury / Math.max(0.001, economy.weeklyRevenue);
  const debtPressure = debtPressureV2(treasuryWeeks);
  // Free cash is a strategic reserve rather than an invitation to buy sudden
  // one-off advantages. National IQ only improves the consistency of this
  // shared cash discipline; selection status never changes the rules.
  const economyScale = clamp(Math.log10(economy.weeklyRevenue + 1) / 2, 0, 1);
  const treasuryPolicy = nationalAiTreasuryPolicyV2(
    iq.score,
    activeWars,
    economyScale,
  );
  const excessCashInvestment = excessTreasuryInvestmentV2(
    nation.treasury,
    economy.controlledOutput,
    economy.weeklyRevenue,
  ).weeklyDraw;
  const reserveProgress = clamp(
    treasuryWeeks / Math.max(0.25, treasuryPolicy.reserveWeeks),
    0,
    1,
  );
  const disciplinedSpendingRate = 1 - treasuryPolicy.freeCashflowShare;
  const fundedWarSpendingRate = disciplinedSpendingRate
    + (1.02 - disciplinedSpendingRate) * smoothstep(
      0,
      6,
      Math.max(0, treasuryWeeks - treasuryPolicy.reserveWeeks),
    );
  const debtProgramPenalty = (atWar
    ? DEBT_PROGRAM_PENALTY_WAR_RECOVERY : DEBT_PROGRAM_PENALTY_PEACE_RECOVERY)
      * debtPressure.recovery
    + (atWar
      ? DEBT_PROGRAM_PENALTY_WAR_CRITICAL : DEBT_PROGRAM_PENALTY_PEACE_CRITICAL)
      * debtPressure.critical;
  const envelopeRate = debtPressure.debtWeeks > 0
    // A one-week overdraft keeps the ordinary disciplined envelope. Deeper
    // debt then contracts every existing programme smoothly while treaty and
    // integration obligations continue to consume real national revenue.
    ? clamp(
      disciplinedSpendingRate - debtProgramPenalty,
      atWar ? DEBT_PROGRAM_ENVELOPE_FLOOR_WAR : DEBT_PROGRAM_ENVELOPE_FLOOR_PEACE,
      disciplinedSpendingRate,
    )
    : atWar
      // Crossing a cash-runway threshold never unlocks a sudden spending
      // block. Excess war-chest weeks smoothly raise the envelope over a
      // six-week band, eventually allowing a bounded 2% weekly drawdown.
      ? fundedWarSpendingRate
      : disciplinedSpendingRate
        + (1 - NATIONAL_AI_FUNDED_FREE_CASHFLOW_SHARE - disciplinedSpendingRate)
          * reserveProgress;
  // Normal commitments are allowed to overrun liquid cash. That overrun is
  // sovereign borrowing below; without this, the treasury could never become
  // negative and expensive peace contracts merely switched the country off.
  const envelope = discretionaryRevenue * envelopeRate;
  const frontLoad = selectWarOperationsCostLoadV2(state, content, playerId);
  const armyCostOfLiving = armyCostOfLivingFactorFromWealthV2(economy.wealthPerPerson);
  const warFatigueSurcharge = clamp(
    nation.warFatigue * WAR_FATIGUE_OPERATION_COST_PER_POINT,
    0,
    WAR_FATIGUE_OPERATION_COST_MAX_BONUS,
  );
  const warFatigueCostMultiplier = 1 + warFatigueSurcharge
    * countryTraitFactorV2(
      playerId,
      'war-fatigue-operation-surcharge',
      traitNationContextV2(state, playerId),
    );
  const warOperations = atWar ? frontLoad * (
    economy.weeklyRevenue * WAR_OPERATION_REVENUE_SHARE
    + paidDeployed * WAR_OPERATION_COST_PER_MILLION * armyCostOfLiving
  ) * warFatigueCostMultiplier : 0;
  const weeklyRealDefence = Math.max(0.001, (content.nations[playerId]?.real.defenceSpending ?? 0.052) / 52);
  const initialArmy = Math.max(0.000001, initialNationArmyCapacityBenchmarkV2(content, playerId));
  const weaponsUpkeep = 1 + 0.005 * nation.research.effectLevels.attack;
  const baselineUpkeep = weeklyRealDefence * (
    0.35 * paidDeployed / initialArmy
    + 0.65 * army.capacity / initialArmy
  );
  const weaponsPremium = weeklyRealDefence * 0.65 * army.capacity / initialArmy * (weaponsUpkeep - 1);
  const armyUpkeep = (baselineUpkeep + weaponsPremium) * armyCostOfLiving
    * countryTraitFactorV2(
      playerId,
      'army-upkeep',
      traitNationContextV2(state, playerId),
    );
  // Ordinary revenue uses the persisted budget exactly. A GDP-scale cash
  // surplus may supplement only real military needs before its remainder is
  // routed into productive research and development below.
  let excessCashRemaining = excessCashInvestment;
  let military = envelope * budget.military / 100;
  const excessArmyUpkeep = Math.min(
    excessCashRemaining,
    Math.max(0, armyUpkeep - military),
  );
  military += excessArmyUpkeep;
  excessCashRemaining -= excessArmyUpkeep;
  // Front operations are paid directly below. They do not consume the Armed
  // Forces envelope a second time or masquerade as ordinary standing upkeep.
  const mandatoryRequest = armyUpkeep;
  const mandatoryFundingRatio = mandatoryRequest > 0 ? clamp(military / mandatoryRequest, 0, 1) : 1;
  const mandatoryFunded = Math.min(military, mandatoryRequest);
  let remainingMilitary = Math.max(0, military - mandatoryFunded);
  const passiveRecruitmentRequest = selectRecruitmentThroughputV2(state, content, playerId, powerSnapshot);
  const fundedPassiveCapacity = passiveRecruitmentRequest * mandatoryFundingRatio;
  const trainingPipeline = selectRecruitmentTrainingPipelineV2(state, content, playerId);
  const recruitmentUnitCost = selectRecruitmentUnitCostV2(state, playerId, content);
  const fillRatio = army.capacity > 0 ? army.deployed / army.capacity : 0;
  const accelerationNeed = atWar
    ? clamp((0.90 - fillRatio) / 0.45, 0, 1)
    : clamp((AI_HEALTHY_ARMY_TARGET - fillRatio) / 0.50, 0, 1);
  const accelerationMultiplier = atWar
    ? WAR_RECRUITMENT_ACCELERATION_MULTIPLIER : PEACE_RECRUITMENT_ACCELERATION_MULTIPLIER;
  const accelerationCostMultiplier = atWar
    ? WAR_RECRUITMENT_ACCELERATION_COST_MULTIPLIER : PEACE_RECRUITMENT_ACCELERATION_COST_MULTIPLIER;
  const acceleratedRecruitmentRequest = Math.min(
    Math.max(0, army.capacity - army.deployed - fundedPassiveCapacity),
    trainingPipeline * accelerationMultiplier * accelerationNeed
      * countryTraitFactorV2(
        playerId,
        'accelerated-recruitment',
        traitNationContextV2(state, playerId),
      ),
  );
  const recruitmentRequest = acceleratedRecruitmentRequest * recruitmentUnitCost * accelerationCostMultiplier;
  const excessRecruitment = mandatoryFundingRatio >= 0.999999 ? Math.min(
    excessCashRemaining,
    Math.max(0, recruitmentRequest - remainingMilitary),
  ) : 0;
  military += excessRecruitment;
  remainingMilitary += excessRecruitment;
  excessCashRemaining -= excessRecruitment;
  const affordableRecruitmentCost = mandatoryFundingRatio >= 0.999999
    ? Math.min(remainingMilitary, recruitmentRequest) : 0;
  const affordableAcceleratedRecruitment = recruitmentUnitCost > 0
    ? affordableRecruitmentCost / (recruitmentUnitCost * accelerationCostMultiplier) : 0;
  // Peace creates new active soldiers first. War does not: the finite trained
  // pool supplies replacements. Existing reservists can mobilise faster than
  // fresh soldiers can be trained, without creating a second manpower source.
  const reserveMobilizationLevel = diminishingResearchLevelV2(
    nation.research.effectLevels['reserve-mobilization'],
    RESERVE_MOBILIZATION_RESEARCH_EFFECTIVE_CEILING,
    RESERVE_MOBILIZATION_RESEARCH_HALF_SATURATION,
  );
  const reserveDeploymentThroughput = TRAINED_RESERVE_DEPLOYMENT_THROUGHPUT_MULTIPLIER
    * (1 + RESERVE_MOBILIZATION_RESEARCH_BONUS_PER_EFFECTIVE_LEVEL
      * reserveMobilizationLevel)
    * countryTraitFactorV2(
      playerId,
      'reserve-deployment-throughput',
      traitNationContextV2(state, playerId),
    );
  const passiveRecruitment = atWar ? 0 : fundedPassiveCapacity;
  const acceleratedRecruitment = atWar ? 0 : affordableAcceleratedRecruitment;
  const reservePassiveDeployment = atWar ? Math.min(
    nation.trainedReserves,
    Math.max(0, army.capacity - army.deployed),
    fundedPassiveCapacity * reserveDeploymentThroughput,
  ) : 0;
  const reserveAcceleratedDeployment = atWar ? Math.min(
    Math.max(0, nation.trainedReserves - reservePassiveDeployment),
    Math.max(0, army.capacity - army.deployed - reservePassiveDeployment),
    affordableAcceleratedRecruitment * reserveDeploymentThroughput,
  ) : 0;
  const reserveDeployment = reservePassiveDeployment + reserveAcceleratedDeployment;
  const recruitment = atWar
    ? reserveAcceleratedDeployment
      / reserveDeploymentThroughput
      * recruitmentUnitCost * accelerationCostMultiplier
    : affordableRecruitmentCost;
  const trainedReserveCapacity = selectTrainedReserveCapacityV2(state, playerId);
  const reserveRoomAfterDeployment = Math.max(
    0,
    trainedReserveCapacity - (nation.trainedReserves - reserveDeployment),
  );
  const deployedAfterFinanceRecruitment = army.deployed
    + passiveRecruitment + acceleratedRecruitment + reserveDeployment;
  const activeReadyForReserve = activeArmyReadyForReserveTrainingV2(
    deployedAfterFinanceRecruitment,
    army.capacity,
  );
  const reserveTrainingLevel = diminishingResearchLevelV2(
    nation.research.effectLevels['reserve-training'],
    RESERVE_TRAINING_RESEARCH_EFFECTIVE_CEILING,
    RESERVE_TRAINING_RESEARCH_HALF_SATURATION,
  );
  const reserveTrainingMultiplier = 1
    + RESERVE_TRAINING_RESEARCH_BONUS_PER_EFFECTIVE_LEVEL * reserveTrainingLevel;
  const reserveTrainingRequest = (atWar || activeReadyForReserve)
    ? trainingPipeline * (atWar ? TRAINED_RESERVE_WARTIME_TRAINING_FACTOR : 1)
      * reserveTrainingMultiplier
      * countryTraitFactorV2(
        playerId,
        'reserve-training',
        traitNationContextV2(state, playerId),
      )
    : 0;
  const reserveTrainingCostPerUnit = recruitmentUnitCost * TRAINED_RESERVE_TRAINING_COST_MULTIPLIER;
  const reserveTrainingCostRequest = Math.min(
    reserveRoomAfterDeployment,
    reserveTrainingRequest,
  ) * reserveTrainingCostPerUnit;
  const excessReserveTraining = mandatoryFundingRatio >= 0.999999 ? Math.min(
    excessCashRemaining,
    Math.max(0, reserveTrainingCostRequest - Math.max(0, remainingMilitary - recruitment)),
  ) : 0;
  military += excessReserveTraining;
  remainingMilitary += excessReserveTraining;
  excessCashRemaining -= excessReserveTraining;
  const reserveTrainingFunds = Math.max(0, remainingMilitary - recruitment);
  const reserveTraining = mandatoryFundingRatio >= 0.999999 && reserveTrainingCostPerUnit > 0
    ? Math.min(
      reserveRoomAfterDeployment,
      reserveTrainingRequest,
      reserveTrainingFunds / reserveTrainingCostPerUnit,
    ) : 0;
  const reserveTrainingCost = reserveTraining * reserveTrainingCostPerUnit;
  const trainedReservesAfter = Math.min(
    Math.max(trainedReserveCapacity, nation.trainedReserves - reserveDeployment),
    Math.max(0, nation.trainedReserves - reserveDeployment + reserveTraining),
  );
  // Once genuine readiness needs are covered, all remaining surplus goes to
  // programmes that always create durable output. Development retains its
  // existing repair-first and food-emergency redirection behavior.
  const nonMilitaryBudget = budget.research + budget.development;
  const excessResearchShare = clamp(
    nonMilitaryBudget > 0 ? budget.research / nonMilitaryBudget : 0.45,
    AI_EXCESS_TREASURY_RESEARCH_SHARE_MIN,
    AI_EXCESS_TREASURY_RESEARCH_SHARE_MAX,
  );
  const excessResearch = excessCashRemaining * excessResearchShare;
  const excessDevelopment = excessCashRemaining - excessResearch;
  // Research remains fully financed in food crises because its logistics,
  // medicine and economy programs are the durable route out of shortages.
  const research = envelope * budget.research / 100 + excessResearch;
  const plannedDevelopment = envelope * budget.development / 100 + excessDevelopment;
  const foodDevelopmentRedirect = redirectDevelopmentFundingToFoodV2({
    baseBudget: budget,
    plannedDevelopment,
    foodFundingGap: foodPlan.request - ordinaryFoodProduction,
    foodCoverage: ordinaryFood.foodCoverage,
    foodReserveWeeks: reserveWeeks,
    foodStockChange: ordinaryFood.foodStockChange,
    foodDemand: foodPlan.demand,
    iqScore: iq.score,
  });
  const development = foodDevelopmentRedirect.development;
  const foodDevelopmentTransfer = foodDevelopmentRedirect.transfer;
  const fundedFood = fundFoodPlanV2(
    nation,
    foodPlan,
    ordinaryFoodProduction + foodDevelopmentTransfer,
    foodExportIncomeTraitFactor,
  );
  const {
    foodProduction,
    foodProduced,
    foodDomesticProduced,
    foodImported,
    foodExported,
    foodExportIncome,
    foodConsumed,
    foodCoverage,
    foodStockChange,
  } = fundedFood;
  const standingOperations = Math.max(
    0,
    military - mandatoryFunded - recruitment - reserveTrainingCost,
  );
  const catastrophicFoodCrisis = foodCoverage < EXTREME_CRISIS_FOOD_COVERAGE
    && reserveWeeks < EXTREME_CRISIS_FOOD_RESERVE_WEEKS;
  const catastrophicDebtCrisis = treasuryWeeks < -AI_SEVERE_DEBT_REVENUE_WEEKS;
  const shouldDemobilize = !atWar
    && mandatoryFundingRatio <= EXTREME_CRISIS_MAX_UPKEEP_FUNDING
    && (catastrophicFoodCrisis || catastrophicDebtCrisis);
  // This legacy-named telemetry field now represents the only permitted force
  // reduction: at most 0.05% per week in an extreme survival crisis.
  const acceleratedDemobilization = shouldDemobilize
    ? round(Math.min(
      army.deployed * EXTREME_CRISIS_DEMOBILIZATION_RATE,
      Math.max(0, army.deployed
        - army.capacity * EXTREME_CRISIS_HOME_GUARD_CAPACITY_SHARE),
    ), 9) : 0;
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
  const actuallySpent = baseOperatingCost + ceasefirePayment + integrationCost + foodProduction
    + military + research + development + warOperations;
  const operatingNet = economy.weeklyRevenue + ceasefireIncome + foodExportIncome - actuallySpent;
  const prePremiumTreasury = nation.treasury + operatingNet;
  const debtBefore = Math.max(0, -nation.treasury);
  const debtAfterBeforePremium = Math.max(0, -prePremiumTreasury);
  const newBorrowing = Math.max(0, debtAfterBeforePremium - debtBefore);
  const carryingPremiumActivation = smoothstep(
    DEBT_CARRYING_PREMIUM_START_REVENUE_WEEKS,
    DEBT_CARRYING_PREMIUM_FULL_REVENUE_WEEKS,
    debtPressure.debtWeeks,
  );
  const carryingPremiumRate = carryingPremiumActivation * (
    DEBT_CARRYING_PREMIUM_BASE_RATE
    + DEBT_CARRYING_PREMIUM_RECOVERY_RATE * debtPressure.recovery
    + DEBT_CARRYING_PREMIUM_CRITICAL_RATE * debtPressure.critical
  );
  // Charge carrying cost only on opening debt that remains after this week's
  // operating result. New principal pays its origination premium once below;
  // a final successful repayment never reopens a microscopic balance.
  const oldDebtRemaining = Math.min(debtBefore, debtAfterBeforePremium);
  const carryingPremium = Math.min(
    economy.weeklyRevenue * DEBT_CARRYING_PREMIUM_MAX_REVENUE_SHARE,
    oldDebtRemaining * carryingPremiumRate,
  );
  const debtPremium = newBorrowing * DEBT_NEW_BORROWING_PREMIUM + carryingPremium;
  const closingTreasury = prePremiumTreasury - debtPremium;
  return roundedFinanceV2({
    activeBudget: { ...foodDevelopmentRedirect.activeBudget },
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
    foodExported,
    foodExportIncome,
    foodConsumed,
    // Negative means either supply is structurally below demand or the food
    // network cannot reach everyone. Positive is reserved for a real increase
    // in stored reserves, so an empty warehouse can never hide famine as zero.
    foodBalance: foodCoverage < 0.999999
      ? foodConsumed - foodPlan.demand
      : foodStockChange,
    foodStockChange,
    foodProduction,
    foodDevelopmentTransfer,
    foodCoverage,
    foodTargetStock: foodPlan.targetStock,
    ceasefirePayment,
    ceasefireIncome,
    integrationCost,
    baseOperatingCost,
    newBorrowing,
    debtPremium,
    excessCashInvestment,
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
    trainedReserveCapacity,
    trainedReservesBefore: nation.trainedReserves,
    trainedReservesAfter,
    reserveTraining,
    reserveTrainingCost,
    reserveDeployment,
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
    reserveTarget: economy.weeklyRevenue * treasuryPolicy.reserveWeeks,
    mandatoryFundingRatio,
    recruitmentFundingRatio: recruitmentRequest > 0 ? recruitment / recruitmentRequest : 1,
    conditionFundingRatio: conditionRequest > 0 ? condition / conditionRequest : 1,
    warEconomicPenalty: warPressure.outputPenalty,
    warEconomyGrowthDrag: warPressure.economyGrowthDrag,
    warPopulationDrag: warPressure.populationGrowthDrag,
    warResearchPenalty: warPressure.researchPenalty,
    mode: atWar ? 'war' : nation.treasury <= 0.000001 ? 'insolvent'
      : nation.treasury < economy.weeklyRevenue * treasuryPolicy.reserveWeeks ? 'conserving' : 'normal',
  });
}

/**
 * Batch finance under the controller roster already encoded in `state`.
 * This deliberately does not rewrite controller identity. The country picker
 * supplies an all-AI opening state so player-only trait amplification cannot
 * leak into baseline stats or ranking. One supplied power snapshot keeps this
 * generic batch deterministic.
 */
export function selectOpeningCandidateFinancePlansV2(
  state: WorldStateV2,
  content: WorldContentV2,
  powerSnapshot: PowerSnapshotV2 = createPowerSnapshotV2(state, content),
): ReadonlyMap<PlayerId, WeeklyFinanceBreakdownV2> {
  const plans = new Map<PlayerId, WeeklyFinanceBreakdownV2>();
  for (const playerId of sortedNationIdsV2(state)) {
    if (selectTerritoriesOfV2(state, playerId).length === 0) continue;
    plans.set(playerId, selectWeeklyFinanceBreakdownV2(
      state,
      content,
      playerId,
      powerSnapshot,
    ));
  }
  return plans;
}

export function selectWeeklyRecruitmentV2(state: WorldStateV2, content: WorldContentV2, playerId: PlayerId): number {
  const powerSnapshot = createPowerSnapshotV2(state, content);
  const finance = selectWeeklyFinanceBreakdownV2(state, content, playerId, powerSnapshot);
  return round(finance.passiveRecruitment + finance.acceleratedRecruitment + finance.reserveDeployment);
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
  trainedReservesBefore: number;
  trainedReservesAfter: number;
  reserveTrained: number;
  reserveDeployed: number;
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
    trainedReservesBefore: 0, trainedReservesAfter: 0,
    reserveTrained: 0, reserveDeployed: 0,
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
  const emergencyHomeGuard = nationalCapacity * EXTREME_CRISIS_HOME_GUARD_CAPACITY_SHARE;
  const requestedDemobilization = clamp(
    finance.acceleratedDemobilization,
    0,
    Math.min(
      maximumWeeklyDemobilization,
      Math.max(0, deployedBefore - emergencyHomeGuard),
    ),
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
    finance.passiveRecruitment + finance.acceleratedRecruitment + finance.reserveDeployment,
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
  const recruited = Math.max(0, deployedAfterFinance - deployedAfterDemobilization);
  const ordinaryRequested = finance.passiveRecruitment + finance.acceleratedRecruitment;
  const reserveDeployed = Math.min(
    finance.reserveDeployment,
    Math.max(0, recruited - Math.min(recruited, ordinaryRequested)),
  );
  const reserveTrained = Math.max(0, finance.reserveTraining);
  const trainedReservesAfter = Math.min(
    Math.max(finance.trainedReserveCapacity, nation.trainedReserves - reserveDeployed),
    Math.max(0, nation.trainedReserves - reserveDeployed + reserveTrained),
  );
  return {
    territories: projected,
    deployedBefore: round(deployedBefore),
    deployedAfterDemobilization: round(deployedAfterDemobilization),
    deployedAfterFinance: round(deployedAfterFinance),
    recruited: round(recruited),
    demobilized: round(Math.max(0, deployedBefore - deployedAfterDemobilization)),
    trainedReservesBefore: round(nation.trainedReserves),
    trainedReservesAfter: round(trainedReservesAfter),
    reserveTrained: round(reserveTrained),
    reserveDeployed: round(reserveDeployed),
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
  const deployedBefore = selectTotalManpowerV2(state, playerId).deployed;
  // The authoritative step retires the temporary opening entitlement before
  // finance. Project that same deterministic mutation on a narrow clone so the
  // HUD includes the weekly fade without touching the live simulation.
  const financeState: WorldStateV2 = {
    ...state,
    tick: state.tick + 1,
    players: Object.fromEntries((Object.entries(state.players) as Array<[PlayerId, NationStateV2]>)
      .map(([id, nation]) => [id, {
        ...nation,
        openingArmyBonus: nation.openingArmyBonus ? { ...nation.openingArmyBonus } : null,
      }])) as Record<PlayerId, NationStateV2>,
    territories: Object.fromEntries((Object.entries(state.territories) as Array<[TerritoryId, TerritoryStateV2]>)
      .map(([id, territory]) => [id, {
        ...territory,
        army: { ...territory.army },
      }])) as Record<TerritoryId, TerritoryStateV2>,
  };
  processOpeningArmyBonusDecayV2(financeState, content);
  const powerSnapshot = createPowerSnapshotV2(financeState, content);
  const finance = selectWeeklyFinanceBreakdownV2(financeState, content, playerId, powerSnapshot);
  const phase = projectFinanceManpowerPhaseV2(financeState, content, playerId, finance);
  const wars = selectWarsOfV2(state, playerId);
  const averageWarLoss = wars.reduce((sum, war) => {
    const losses = war.attackerId === playerId ? war.attackerLosses : war.defenderLosses;
    return sum + losses / Math.max(1, state.tick - war.startedTick + 1);
  }, 0);
  const openingRetirement = Math.max(0, deployedBefore - phase.deployedBefore);
  const financePhaseNet = phase.deployedAfterFinance - deployedBefore;
  return {
    deployedBefore: round(deployedBefore),
    deployedAfterFinance: phase.deployedAfterFinance,
    recruited: phase.recruited,
    demobilized: round(openingRetirement + phase.demobilized),
    trainedReservesBefore: phase.trainedReservesBefore,
    trainedReservesAfter: phase.trainedReservesAfter,
    reserveTrained: phase.reserveTrained,
    reserveDeployed: phase.reserveDeployed,
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
 * Explicit demographic accounting. The source population-growth input is net
 * of normal deaths, so the calibrated birth estimate reconstructs it by adding
 * the separate crude death rate. There is no cross-border migration system.
 * Crisis mortality is then added once to avoid double-counting deaths.
 */
export function selectPopulationDynamicsV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  populationGrowthFunding?: number,
  foodTargetStockOverride?: number,
): PopulationDynamicsV2 {
  const nation = state.players[playerId];
  if (!nation) return {
    annualBirthRate: 0,
    annualDeathRate: 0,
    annualWarPenaltyRate: 0,
    annualNetRate: 0,
    weeklyDeaths: 0,
    weeklyNet: 0,
  };
  const owned = selectTerritoriesOfV2(state, playerId);
  const population = owned.reduce((sum, territory) => sum + territory.population, 0);
  const projectedFinance = populationGrowthFunding === undefined
    ? selectWeeklyFinanceBreakdownV2(state, content, playerId)
    : undefined;
  const funds = populationGrowthFunding ?? projectedFinance!.populationGrowth;
  const baselineNetRate = owned.reduce((sum, territory) => sum
    + (content.territories[territory.id]?.baseline.populationGrowthRate ?? 0) / 100 * territory.population, 0)
    / Math.max(0.01, population);
  const baselineDeathRate = owned.reduce((sum, territory) => sum
    + (content.territories[territory.id]?.baseline.deathRatePerThousand ?? 8) / 1_000 * territory.population, 0)
    / Math.max(0.01, population);
  const averageCondition = owned.reduce((sum, territory) => sum + territory.condition * territory.population, 0)
    / Math.max(0.01, population);
  const level = nation.research.effectLevels['population-growth'];
  const impact = selectResearchEffectImpactV2(state, content, playerId, 'population-growth');
  const warPressure = selectWarPressureV2(state, playerId);
  // Views use this week's projected access immediately; the canonical economy
  // phase stores the same value before applying population change.
  const foodSecurity = clamp(projectedFinance?.foodCoverage ?? nation.foodSecurity, 0, 1);
  const researchedNet = baselineNetRate >= 0
    ? baselineNetRate * (1 + 0.005 * level * impact)
    : baselineNetRate * (1 - 0.004 * level * impact);
  const iq = selectNationalIqViewV2(state, content, playerId);
  const nationTraitContext = traitNationContextV2(state, playerId);
  const naturalAndResearchedNet = researchedNet > 0
    ? researchedNet * countryTraitFactorV2(
      playerId,
      'population-growth',
      nationTraitContext,
    )
    : researchedNet;
  const fundedGrowth = 0.0005 * Math.sqrt(funds * nationalAiEfficiencyV2(iq.score)
      / Math.max(0.01, population))
    * countryTraitFactorV2(
      playerId,
      'population-growth-funding',
      nationTraitContext,
    );
  const supportedNet = naturalAndResearchedNet + fundedGrowth;
  const iqPopulationMultiplier = iq.populationGrowthMultiplier;
  const annualBirthRate = Math.max(
    0,
    (baselineDeathRate + supportedNet) * iqPopulationMultiplier,
  );
  const medicalReduction = 0.20 * nation.research.effectLevels.recovery
    / (nation.research.effectLevels.recovery + 46.67);
  const foodCrisis = clamp((0.90 - foodSecurity) / 0.50, 0, 1);
  const foodTargetStock = foodTargetStockOverride
    ?? selectFoodCapacityPlanV2(state, content, playerId).targetStock;
  const foodReserveShare = nation.foodStock / Math.max(0.01, foodTargetStock);
  const depletedReserve = clamp(
    (FOOD_MORTALITY_RESERVE_START_SHARE - foodReserveShare)
      / FOOD_MORTALITY_RESERVE_START_SHARE,
    0,
    1,
  );
  const acuteShortage = clamp((0.95 - foodSecurity) / 0.45, 0, 1);
  const foodMortality = FOOD_SHORTAGE_POPULATION_LOSS * 52 * foodCrisis
    + FOOD_EMPTY_RESERVE_ANNUAL_MORTALITY_MAX * depletedReserve * acuteShortage;
  const conditionMortality = Math.max(0, 0.65 - averageCondition) * 0.015;
  const annualDeathRate = Math.max(0,
    baselineDeathRate * (1 - medicalReduction) + foodMortality + conditionMortality);
  const annualWarPenaltyRate = Math.max(0, warPressure.populationGrowthDrag);
  const annualNetRate = clamp(
    annualBirthRate - annualDeathRate - annualWarPenaltyRate,
    -0.08,
    0.04,
  );
  return {
    annualBirthRate: round(annualBirthRate),
    annualDeathRate: round(annualDeathRate),
    annualWarPenaltyRate: round(annualWarPenaltyRate),
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
  const initialIntegratedOutput = retainedEconomy * CONQUEST_INITIAL_INTEGRATION_SHARE;
  return {
    attackerId,
    targetId,
    territoryCount: territories.length,
    retainedPopulation: round(retainedPopulation),
    retainedEconomy: round(retainedEconomy),
    initialIntegratedOutput: round(initialIntegratedOutput),
    maxTreasurySeized: round((state.players[targetId]?.treasury ?? 0)
      * selectTreasurySeizureShareV2(state, targetId)),
    inheritedEnemyManpower: 0,
    asOfTick: state.tick,
    assumptions: ['10% initial integration', '15–~204 year immutable size curve', 'conquest guard transferred from attacker', `${round(selectTreasurySeizureShareV2(state, targetId) * 100, 3)}% treasury only on final elimination`, 'no enemy manpower inheritance'],
  };
}

/**
 * The defeated country's own immutable identity protects its treasury. A
 * catalog replacement wins when it matches the live base share; otherwise
 * the bounded ordinary trait factor scales that same base exactly once.
 */
export function selectTreasurySeizureShareV2(
  state: WorldStateV2,
  defeatedPlayerId: PlayerId,
): number {
  const baseShare = 0.25;
  const context = traitNationContextV2(state, defeatedPlayerId);
  const applicable = countryTraitModifiersV2(defeatedPlayerId, 'treasury-seizure')
    .filter((entry) => traitModifierAppliesV2(entry, context));
  const replacementEntry = applicable.find((entry) => (
    entry.replacement?.unit === 'share'
    && Math.abs(entry.replacement.from - baseShare) <= 0.000000001
  ));
  const replacement = replacementEntry
    ? countryTraitReplacementValueV2(defeatedPlayerId, replacementEntry, context)
    : undefined;
  if (replacement !== undefined) return clamp(replacement, 0, 1);
  return baseShare * countryTraitFactorV2(
    defeatedPlayerId,
    'treasury-seizure',
    context,
  );
}

export function selectStrategicScoreV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  militaryBaseSnapshot: MilitaryBaseSnapshotV2 = createMilitaryBaseSnapshotV2(state, content),
): number {
  if (!state.players[playerId]) return 0;
  return militaryRankingScoreV2(
    selectCurrentPowerV2(state, content, playerId, militaryBaseSnapshot),
  );
}

function militaryRankingScoreV2(combatPower: number): number {
  // The one global rank is deliberately pure military power. Economy remains
  // visible alongside it, but can never move a country above a stronger force.
  return round(Math.max(0, combatPower));
}

export function selectGlobalRankingV2(
  state: WorldStateV2,
  content: WorldContentV2,
  powerSnapshot: PowerSnapshotV2 = createPowerSnapshotV2(state, content),
): RankingEntryV2[] {
  return sortedNationIdsV2(state).filter((id) => !selectIsEliminatedV2(state, id)).map((id) => {
    const combatPower = powerSnapshot.byNation.get(id) ?? 0;
    const economicOutput = selectNationalEconomyV2(state, content, id).controlledOutput;
    return {
      player: selectNationViewV2(state, content, id)!,
      score: militaryRankingScoreV2(combatPower),
      combatPower,
      economicOutput,
    };
  }).sort((a, b) => b.combatPower - a.combatPower || a.player.id.localeCompare(b.player.id));
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
  if (!Number.isFinite(state.seed) || !Number.isFinite(state.rngState)
    || !Number.isFinite(state.tick)) return false;
  const finiteRecord = (record: object): boolean => {
    for (const key in record) {
      if (Object.prototype.hasOwnProperty.call(record, key)
        && !Number.isFinite((record as Record<string, unknown>)[key])) return false;
    }
    return true;
  };
  for (const nation of Object.values(state.players)) {
    if (!Number.isFinite(nation.treasury)
      || !Number.isFinite(nation.foodStock)
      || !Number.isFinite(nation.domesticFoodCapacity)
      || !Number.isFinite(nation.foodSecurity)
      || !Number.isFinite(nation.trainedReserves)
      || !Number.isFinite(nation.warFatigue)
      || !Number.isFinite(nation.propagandaAvailableTick)
      || !Number.isFinite(nation.propagandaProgram?.startedTick ?? 0)
      || !Number.isFinite(nation.propagandaProgram?.endsTick ?? 0)
      || !Number.isFinite(nation.propagandaProgram?.totalSuspicionReduction ?? 0)
      || !Number.isFinite(nation.propagandaProgram?.weeklySuspicionReduction ?? 0)
      || !finiteRecord(nation.research.allocations)
      || !finiteRecord(nation.research.progress)
      || !finiteRecord(nation.research.effectLevels)
      || !finiteRecord(nation.research.breakthroughs)) return false;
  }
  for (const territory of Object.values(state.territories)) {
    if (!Number.isFinite(territory.population)
      || !Number.isFinite(territory.economy)
      || !Number.isFinite(territory.condition)
      || !Number.isFinite(territory.integration)
      || !Number.isFinite(territory.army.manpower)
      || !Number.isFinite(territory.army.capacity)
      || !Number.isFinite(territory.army.baseAttack)
      || !Number.isFinite(territory.army.baseDefense)
      || !Number.isFinite(territory.integrationProgram?.startedTick ?? 0)
      || !Number.isFinite(territory.integrationProgram?.completesTick ?? 0)
      || !Number.isFinite(territory.integrationProgram?.annualCost ?? 0)) return false;
  }
  return true;
}

/** Shortest direct route between two empires; land reports zero kilometres. */
export function selectWarRouteDistanceKmV2(
  state: WorldStateV2,
  content: WorldContentV2,
  attackerId: PlayerId,
  defenderId: PlayerId,
): number | undefined {
  let shortest = Number.POSITIVE_INFINITY;
  for (const source of selectTerritoriesOfV2(state, attackerId)) {
    for (const connection of content.territories[source.id]?.connections ?? []) {
      if (state.territories[connection.targetId]?.owner !== defenderId) continue;
      if (connection.kind === 'land') return 0;
      shortest = Math.min(shortest, connection.distanceKm ?? 0);
    }
  }
  return Number.isFinite(shortest) ? shortest : undefined;
}

export function selectTerritoryRouteDistanceKmV2(
  content: WorldContentV2,
  sourceId: TerritoryId,
  targetId: TerritoryId,
): number | undefined {
  return content.territories[sourceId]?.connections
    .find((connection) => connection.targetId === targetId)?.distanceKm;
}

function selectWarOperationsLogisticsLoadV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  activeOperationTrait?: 'food-logistics-pressure',
): number {
  return selectWarsOfV2(state, playerId).reduce((sum, war) => {
    const opponentId = war.attackerId === playerId ? war.defenderId : war.attackerId;
    const operations = war.attackerId === playerId ? war.attackerOperations : war.defenderOperations;
    if (operations.length === 0) {
      const inferredAccess = selectWarAccessTypeV2(state, content, playerId, opponentId);
      const access = inferredAccess === 'none' ? 'land' : inferredAccess;
      const distance = access === 'naval'
        ? selectWarRouteDistanceKmV2(state, content, playerId, opponentId) : undefined;
      return sum + warAccessOperationMultiplierV2(access, distance);
    }
    return sum + operations.reduce((fronts, operation) => {
      const load = warAccessOperationMultiplierV2(
        operation.access,
        selectTerritoryRouteDistanceKmV2(content, operation.sourceId, operation.targetId),
      );
      const traitFactor = activeOperationTrait
        ? countryTraitFactorV2(
          playerId,
          activeOperationTrait,
          traitOperationContextV2(state, content, war, operation, playerId),
        )
        : 1;
      return fronts + load * traitFactor;
    }, 0);
  }, 0);
}

/**
 * Applies distance relief only to the incremental naval-distance component,
 * then applies ordinary operation-cost relief to that one front. This keeps
 * land/naval access and mixed-front scopes local to their actual operation.
 */
function traitAdjustedOperationCostLoadV2(
  playerId: PlayerId,
  access: Exclude<WarAccessV2, 'none'>,
  distanceKm: number | undefined,
  context: TraitEvaluationContextV2,
): number {
  const fullLoad = warAccessOperationMultiplierV2(access, distanceKm);
  const accessOnlyLoad = warAccessOperationMultiplierV2(access);
  const distanceAdjustedLoad = access === 'naval'
    ? accessOnlyLoad + (fullLoad - accessOnlyLoad) * countryTraitFactorV2(
      playerId,
      'naval-distance-pressure',
      context,
    )
    : fullLoad;
  return distanceAdjustedLoad * countryTraitFactorV2(
    playerId,
    'operation-cost',
    context,
  );
}

function selectWarOperationsCostLoadV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): number {
  const nationContext = traitNationContextV2(state, playerId);
  return selectWarsOfV2(state, playerId).reduce((sum, war) => {
    const opponentId = war.attackerId === playerId ? war.defenderId : war.attackerId;
    const operations = war.attackerId === playerId ? war.attackerOperations : war.defenderOperations;
    if (operations.length === 0) {
      const inferredAccess = selectWarAccessTypeV2(state, content, playerId, opponentId);
      const access = inferredAccess === 'none' ? 'land' : inferredAccess;
      const distance = access === 'naval'
        ? selectWarRouteDistanceKmV2(state, content, playerId, opponentId) : undefined;
      return sum + traitAdjustedOperationCostLoadV2(
        playerId,
        access,
        distance,
        composeTraitContextV2(
          nationContext,
          traitWarContextV2(war, playerId),
          { access },
        ),
      );
    }
    return sum + operations.reduce((fronts, operation) => (
      fronts + traitAdjustedOperationCostLoadV2(
        playerId,
        operation.access,
        selectTerritoryRouteDistanceKmV2(content, operation.sourceId, operation.targetId),
        traitOperationContextV2(state, content, war, operation, playerId),
      )
    ), 0);
  }, 0);
}

export function roundedFinanceV2(value: WeeklyFinanceBreakdownV2): WeeklyFinanceBreakdownV2 {
  const rounded = { ...value } as WeeklyFinanceBreakdownV2 & Record<string, unknown>;
  for (const key in rounded) {
    const item = rounded[key];
    if (typeof item === 'number') rounded[key] = round(item);
  }
  return rounded;
}

export const selectDefaultContentV2 = (): WorldContentV2 => WORLD_CONTENT_V2;
