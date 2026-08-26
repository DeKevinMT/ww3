import {
  CONQUEST_INITIAL_INTEGRATION_SHARE,
  INTEGRATION_ADMINISTRATION_ANNUAL_OUTPUT_SHARE,
  RESEARCH_BRANCH_EFFECTS,
  RESEARCH_BRANCHES,
  WEEKS_PER_YEAR,
  clamp,
  round,
} from './balance';
import {
  stateTerritoryArmyCapacityTargetV2,
  synchronizeArmyCapacityV2,
} from './capacity';
import { territoryTerrainTypesV2, type WorldContentV2 } from './content';
import { addWorldEventV2 } from './events';
import { isHumanPlayerV2, selectHumanPlayerIdsV2 } from './humanPlayers';
import { createNationStateV2 } from './nationState';
import { invalidateNationIndexV2, invalidateTerritoryIndexV2 } from './selectors';
import { composeTraitContextV2, traitNationContextV2 } from './traitContext';
import { countryTraitFactorV2, type TraitEvaluationContextV2 } from './traits';
import { selectWarStrainSummaryV2 } from './warStrain';
import {
  territoryIdV2,
  type IntegrationProgramStateV2,
  type PlayerId,
  type TerritoryId,
  type TerritoryStateV2,
  type WarAccessV2,
  type WorldStateV2,
} from './types';

interface SizeAxesV2 {
  population: number;
  economy: number;
  area: number;
}

const sizeBoundsCache = new WeakMap<WorldContentV2, { min: SizeAxesV2; max: SizeAxesV2 }>();

const SMALL_COUNTRY_INTEGRATION_YEARS = 12.5;
const INTEGRATION_LINEAR_YEARS = 25;
const INTEGRATION_QUADRATIC_YEARS = 50;
const INTEGRATION_LARGE_COUNTRY_YEARS = 100;
/** New captures complete 15% faster than the preceding 1.2x calendar. */
export const INTEGRATION_DURATION_MULTIPLIER_V2 = 1.02;
/** Voluntary defensive unions complete four times faster than conquest. */
export const FEDERATION_INTEGRATION_DURATION_FACTOR_V2 = 0.25;
/** Exactly one keyed roll is made for each frozen integration program. */
export const TERRITORY_INTEGRATION_REVOLUTION_CHANCE_V2 = 0.02;
/** A destined revolution occurs away from both capture and completion edges. */
export const TERRITORY_INTEGRATION_REVOLUTION_WINDOW_START_V2 = 0.20;
export const TERRITORY_INTEGRATION_REVOLUTION_WINDOW_END_V2 = 0.80;
/** Critical overreach adds one bounded, deterministic chance per conquest. */
export const TERRITORY_INTEGRATION_PRESSURE_REVOLUTION_MIN_CHANCE_V2 = 0.10;
export const TERRITORY_INTEGRATION_PRESSURE_REVOLUTION_MAX_CHANCE_V2 = 0.35;
export const TERRITORY_INTEGRATION_PRESSURE_REVOLUTION_MIN_SCORE_V2 = 75;

export type TerritoryIntegrationRevolutionRiskLevelV2
  = 'none' | 'elevated' | 'high' | 'critical';

export interface TerritoryIntegrationWarPressureRevolutionRiskV2 {
  exposedTerritories: number;
  bonusChance: number;
  level: TerritoryIntegrationRevolutionRiskLevelV2;
  label: string;
}

function integrationRevolutionHashV2(seed: number, key: string, salt: number): number {
  let value = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  for (let index = 0; index < key.length; index += 1) {
    value = Math.imul(value ^ key.charCodeAt(index), 0x85ebca6b) >>> 0;
    value ^= value >>> 13;
  }
  value = Math.imul(value ^ (value >>> 16), 0xc2b2ae35) >>> 0;
  return value >>> 0;
}

function integrationRevolutionKeyV2(
  territoryId: TerritoryId,
  program: IntegrationProgramStateV2,
): string {
  return [
    territoryId,
    program.fromOwnerId,
    program.fromCoreOwnerId,
    program.toOwnerId,
    program.startedTick,
    program.completesTick,
  ].join('|');
}

function integrationRevolutionWindowV2(program: IntegrationProgramStateV2): {
  firstTick: number;
  lastTick: number;
} | undefined {
  const duration = program.completesTick - program.startedTick;
  if (!Number.isInteger(duration) || duration < 2) return undefined;
  const firstTick = Math.max(
    program.startedTick + 1,
    program.startedTick + Math.ceil(
      duration * TERRITORY_INTEGRATION_REVOLUTION_WINDOW_START_V2,
    ),
  );
  const lastTick = Math.min(
    program.completesTick - 1,
    program.startedTick + Math.floor(
      duration * TERRITORY_INTEGRATION_REVOLUTION_WINDOW_END_V2,
    ),
  );
  return lastTick >= firstTick ? { firstTick, lastTick } : undefined;
}

export function territoryIntegrationWarPressureRevolutionBonusChanceV2(
  score: number,
): number {
  if (!Number.isFinite(score) || score < TERRITORY_INTEGRATION_PRESSURE_REVOLUTION_MIN_SCORE_V2) {
    return 0;
  }
  const progress = clamp(
    (score - TERRITORY_INTEGRATION_PRESSURE_REVOLUTION_MIN_SCORE_V2)
      / (100 - TERRITORY_INTEGRATION_PRESSURE_REVOLUTION_MIN_SCORE_V2),
    0,
    1,
  );
  return round(
    TERRITORY_INTEGRATION_PRESSURE_REVOLUTION_MIN_CHANCE_V2
      + (TERRITORY_INTEGRATION_PRESSURE_REVOLUTION_MAX_CHANCE_V2
        - TERRITORY_INTEGRATION_PRESSURE_REVOLUTION_MIN_CHANCE_V2) * progress,
    9,
  );
}

/** Canonical pressure exposure shared by simulation and presentation. */
export function territoryIntegrationWarPressureRevolutionRiskV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): TerritoryIntegrationWarPressureRevolutionRiskV2 {
  const exposedTerritories = content.territoryIds.filter((territoryId) => {
    const territory = state.territories[territoryId];
    const program = territory?.integrationProgram;
    return territory?.owner === playerId
      && program?.toOwnerId === playerId
      && program.cause !== 'federation'
      && state.tick < program.completesTick;
  }).length;
  if (exposedTerritories === 0) return {
    exposedTerritories: 0,
    bonusChance: 0,
    level: 'none',
    label: 'NO OCCUPIED TERRITORIES',
  };
  const score = selectWarStrainSummaryV2(state, content, playerId).score;
  const bonusChance = territoryIntegrationWarPressureRevolutionBonusChanceV2(score);
  const level: TerritoryIntegrationRevolutionRiskLevelV2 = bonusChance <= 0
    ? 'none' : score >= 95 ? 'critical' : score >= 85 ? 'high' : 'elevated';
  return {
    exposedTerritories,
    bonusChance,
    level,
    label: level === 'critical' ? 'CRITICAL REVOLUTION RISK'
      : level === 'high' ? 'HIGH REVOLUTION RISK'
        : level === 'elevated' ? 'ELEVATED REVOLUTION RISK'
          : 'LOW REVOLUTION RISK',
  };
}

/**
 * Derives a single optional revolution tick without consuming the campaign RNG.
 * Saving, loading and iteration order therefore cannot change either the event
 * or any unrelated future battle, research or AI draw.
 */
export function territoryIntegrationRevolutionTickV2(
  state: Pick<WorldStateV2, 'seed'>,
  territoryId: TerritoryId,
  program: IntegrationProgramStateV2,
): number | undefined {
  const window = integrationRevolutionWindowV2(program);
  if (!window) return undefined;
  const key = integrationRevolutionKeyV2(territoryId, program);
  const chanceRoll = integrationRevolutionHashV2(state.seed, key, 0)
    / 4_294_967_296;
  if (chanceRoll >= TERRITORY_INTEGRATION_REVOLUTION_CHANCE_V2) return undefined;
  const windowTicks = window.lastTick - window.firstTick + 1;
  return window.firstTick
    + integrationRevolutionHashV2(state.seed, key, 1) % windowTicks;
}

/**
 * One independent pressure roll and one earliest trigger week are frozen from
 * the program key. The current score is checked weekly after that gate. This
 * reacts to later overreach without compounding a long integration into near
 * certainty: sustained pressure can never exceed the advertised per-program
 * bonus chance.
 */
export function territoryIntegrationPressureRevolutionDueV2(
  state: Pick<WorldStateV2, 'seed' | 'tick'>,
  territoryId: TerritoryId,
  program: IntegrationProgramStateV2,
  bonusChance: number,
): boolean {
  if (program.cause === 'federation' || bonusChance <= 0) return false;
  const window = integrationRevolutionWindowV2(program);
  if (!window || state.tick < window.firstTick || state.tick > window.lastTick) return false;
  const key = integrationRevolutionKeyV2(territoryId, program);
  const chanceRoll = integrationRevolutionHashV2(state.seed, key, 2)
    / 4_294_967_296;
  if (chanceRoll >= bonusChance) return false;
  const windowTicks = window.lastTick - window.firstTick + 1;
  const gateTick = window.firstTick
    + integrationRevolutionHashV2(state.seed, key, 3) % windowTicks;
  return state.tick >= gateTick;
}

/**
 * Administration price frozen from the territory's live output at conquest.
 * Later growth or war damage never changes this promised annual bill.
 */
export function territoryIntegrationAnnualCostV2(
  economyBillions: number,
): number {
  return round(Math.max(0, economyBillions)
    * INTEGRATION_ADMINISTRATION_ANNUAL_OUTPUT_SHARE, 9);
}

export function territoryIntegrationWeeklyCostV2(economyBillions: number): number {
  return round(territoryIntegrationAnnualCostV2(economyBillions) / WEEKS_PER_YEAR, 9);
}

function logarithmicSize(value: number): number {
  return Math.log1p(Math.max(0, value));
}

function sizeBoundsV2(content: WorldContentV2): { min: SizeAxesV2; max: SizeAxesV2 } {
  const cached = sizeBoundsCache.get(content);
  if (cached) return cached;
  const axes = content.territoryIds.map((id) => {
    const baseline = content.territories[id]?.baseline;
    return {
      population: logarithmicSize(baseline?.population ?? 0),
      economy: logarithmicSize(baseline?.gdp ?? 0),
      area: logarithmicSize(baseline?.landArea ?? 0),
    };
  });
  const bounds = {
    min: {
      population: Math.min(...axes.map((item) => item.population)),
      economy: Math.min(...axes.map((item) => item.economy)),
      area: Math.min(...axes.map((item) => item.area)),
    },
    max: {
      population: Math.max(...axes.map((item) => item.population)),
      economy: Math.max(...axes.map((item) => item.economy)),
      area: Math.max(...axes.map((item) => item.area)),
    },
  };
  sizeBoundsCache.set(content, bounds);
  return bounds;
}

function normalizeAxis(value: number, min: number, max: number): number {
  return max > min ? clamp((value - min) / (max - min), 0, 1) : 0;
}

/**
 * Immutable country size used by the integration calendar. Live war damage,
 * growth and ownership never shorten or lengthen a conquest after the fact.
 */
export function territoryIntegrationSizeV2(content: WorldContentV2, territoryId: TerritoryId): number {
  const baseline = content.territories[territoryId]?.baseline;
  if (!baseline) return 0;
  const bounds = sizeBoundsV2(content);
  const population = normalizeAxis(
    logarithmicSize(baseline.population), bounds.min.population, bounds.max.population,
  );
  const economy = normalizeAxis(
    logarithmicSize(baseline.gdp), bounds.min.economy, bounds.max.economy,
  );
  const area = normalizeAxis(
    logarithmicSize(baseline.landArea), bounds.min.area, bounds.max.area,
  );
  return round(0.50 * population + 0.30 * economy + 0.20 * area, 12);
}

export function territoryIntegrationDurationWeeksV2(
  content: WorldContentV2,
  territoryId: TerritoryId,
): number {
  // The underlying size curve remains unchanged; new captures receive the
  // universal 1.02x calendar after its old whole-week promise is calculated.
  // This makes the current speed-up exact for every territory and avoids changing
  // the relative ordering through fractional-week rounding.
  const luxembourgId = territoryIdV2('lux');
  const luxembourgSize = content.territories[luxembourgId]
    ? territoryIntegrationSizeV2(content, luxembourgId) : 0;
  const size = territoryIntegrationSizeV2(content, territoryId);
  const relativeSize = clamp(
    (size - luxembourgSize) / Math.max(0.000001, 1 - luxembourgSize),
    0,
    1,
  );
  const years = SMALL_COUNTRY_INTEGRATION_YEARS
    + INTEGRATION_LINEAR_YEARS * relativeSize
    + INTEGRATION_QUADRATIC_YEARS * relativeSize ** 2
    + INTEGRATION_LARGE_COUNTRY_YEARS * relativeSize ** 4;
  const previousCalendarWeeks = Math.round(years * WEEKS_PER_YEAR);
  return Math.round(previousCalendarWeeks * INTEGRATION_DURATION_MULTIPLIER_V2);
}

export function territoryIntegrationGainPerWeekV2(
  content: WorldContentV2,
  territoryId: TerritoryId,
): number {
  return (1 - CONQUEST_INITIAL_INTEGRATION_SHARE)
    / territoryIntegrationDurationWeeksV2(content, territoryId);
}

/** Canonical calendar-only integration step, shared by simulation and tests. */
export function advanceTerritoryIntegrationV2(
  content: WorldContentV2,
  territoryId: TerritoryId,
  currentShare: number,
  weeks = 1,
): number {
  return round(clamp(
    currentShare + territoryIntegrationGainPerWeekV2(content, territoryId) * Math.max(0, weeks),
    0,
    1,
  ), 12);
}

export interface IntegrationCompletionV2 {
  territoryId: TerritoryId;
  formerCoreOwnerId: PlayerId;
  ownerId: PlayerId;
}

export type TerritoryIntegrationCauseV2 = 'conquest' | 'federation';
export type TerritoryIntegrationAccessV2 = Exclude<WarAccessV2, 'none'>;

export interface TerritoryIntegrationQuoteOptionsV2 {
  readonly cause: TerritoryIntegrationCauseV2;
  readonly access?: TerritoryIntegrationAccessV2;
}

export interface TerritoryIntegrationQuoteV2 {
  readonly territoryId: TerritoryId;
  readonly newOwnerId: PlayerId;
  readonly cause: TerritoryIntegrationCauseV2;
  readonly access?: TerritoryIntegrationAccessV2;
  /** Derived before ownership changes, without adding any persisted schema. */
  readonly firstConquest: boolean;
  /** One-time human-seat discount; independent from country-trait first-conquest conditions. */
  readonly firstPlayerIntegrationDiscount: boolean;
  readonly durationWeeks: number;
  readonly annualCost: number;
}

type TerritoryIntegrationStartOptionsV2 =
  | TerritoryIntegrationAccessV2
  | { readonly access?: TerritoryIntegrationAccessV2 };

function ownedForeignOpeningHomelandV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): boolean {
  return content.territoryIds.some((ownedTerritoryId) => {
    const openingOwnerId = content.territories[ownedTerritoryId]?.initialOwnerId;
    return state.territories[ownedTerritoryId]?.owner === playerId
      && openingOwnerId !== undefined
      && openingOwnerId !== playerId;
  });
}

function integrationAccessV2(
  accessOrOptions?: TerritoryIntegrationStartOptionsV2,
): TerritoryIntegrationAccessV2 | undefined {
  return typeof accessOrOptions === 'string' ? accessOrOptions : accessOrOptions?.access;
}

/**
 * Quotes the immutable calendar and administration bill while the target still
 * has its old owner. Only the active leader (`newOwnerId`) contributes a trait;
 * a conquered or federating member can therefore never donate or stack traits.
 */
export function quoteTerritoryIntegrationV2(
  state: WorldStateV2,
  content: WorldContentV2,
  territoryId: TerritoryId,
  newOwnerId: PlayerId,
  options: TerritoryIntegrationQuoteOptionsV2 = { cause: 'conquest' },
): TerritoryIntegrationQuoteV2 {
  const territory = state.territories[territoryId];
  const definition = content.territories[territoryId];
  const sovereignRecapture = territory?.coreOwner === newOwnerId;
  const firstConquest = !sovereignRecapture && options.cause === 'conquest'
    && !ownedForeignOpeningHomelandV2(state, content, newOwnerId);
  const firstPlayerIntegrationDiscount = !sovereignRecapture
    && options.cause === 'conquest'
    && isHumanPlayerV2(state, newOwnerId)
    && !state.firstIntegrationDiscountUsedBy.includes(newOwnerId);
  // Runtime restores a country's own sovereign core immediately. Exposing the
  // same zero quote keeps War Command from promising a calendar or bill that
  // beginTerritoryIntegrationWithCauseV2 will never create.
  if (sovereignRecapture) {
    return {
      territoryId,
      newOwnerId,
      cause: options.cause,
      access: options.access,
      firstConquest: false,
      firstPlayerIntegrationDiscount: false,
      durationWeeks: 0,
      annualCost: 0,
    };
  }
  const atWar = state.wars.some((war) => (
    war.attackerId === newOwnerId || war.defenderId === newOwnerId
  ));
  const leader = state.players[newOwnerId];
  const context: TraitEvaluationContextV2 = composeTraitContextV2(
    traitNationContextV2(state, newOwnerId),
    {
    access: options.access,
    terrain: definition?.terrain,
    terrains: Object.freeze([...territoryTerrainTypesV2(content, territoryId)]),
    homeland: definition?.initialOwnerId === newOwnerId,
    firstConquest,
    atWar,
    treasury: leader?.treasury,
    foodSecurity: leader?.foodSecurity,
    condition: territory?.condition,
    },
  );
  const federationFactor = options.cause === 'federation'
    ? FEDERATION_INTEGRATION_DURATION_FACTOR_V2
    : 1;
  const durationFactor = countryTraitFactorV2(
    newOwnerId,
    'integration-duration',
    context,
  );
  const costFactor = countryTraitFactorV2(
    newOwnerId,
    'integration-cost',
    context,
  );
  return {
    territoryId,
    newOwnerId,
    cause: options.cause,
    access: options.access,
    firstConquest,
    firstPlayerIntegrationDiscount,
    durationWeeks: Math.max(1, Math.round(
      territoryIntegrationDurationWeeksV2(content, territoryId)
        * federationFactor
        * durationFactor,
    )),
    annualCost: round(
      territoryIntegrationAnnualCostV2(territory?.economy ?? 0)
        * costFactor
        * (firstPlayerIntegrationDiscount ? 0.25 : 1),
      9,
    ),
  };
}

/**
 * Starts one immutable integration calendar. A sovereign-core recapture is the
 * only case that restores full access immediately.
 */
function beginTerritoryIntegrationWithCauseV2(
  state: WorldStateV2,
  content: WorldContentV2,
  territoryId: TerritoryId,
  newOwnerId: PlayerId,
  cause: TerritoryIntegrationCauseV2,
  access?: TerritoryIntegrationAccessV2,
): void {
  const territory = state.territories[territoryId];
  if (!territory) return;
  const formerOwnerId = territory.owner;
  if (territory.coreOwner === newOwnerId) {
    territory.owner = newOwnerId;
    territory.integration = 1;
    delete territory.integrationProgram;
    invalidateTerritoryIndexV2(state);
    synchronizeArmyCapacityV2(state, content);
    return;
  }
  const quote = quoteTerritoryIntegrationV2(
    state,
    content,
    territoryId,
    newOwnerId,
    { cause, access },
  );
  territory.owner = newOwnerId;
  territory.integration = CONQUEST_INITIAL_INTEGRATION_SHARE;
  territory.integrationProgram = {
    cause,
    fromOwnerId: formerOwnerId,
    fromCoreOwnerId: territory.coreOwner,
    toOwnerId: newOwnerId,
    startedTick: state.tick,
    completesTick: state.tick + quote.durationWeeks,
    annualCost: quote.annualCost,
  };
  if (quote.firstPlayerIntegrationDiscount) {
    state.firstIntegrationDiscountUsedBy = [
      ...state.firstIntegrationDiscountUsedBy,
      newOwnerId,
    ].sort((left, right) => left.localeCompare(right));
  }
  invalidateTerritoryIndexV2(state);
  synchronizeArmyCapacityV2(state, content);
}

export function beginTerritoryIntegrationV2(
  state: WorldStateV2,
  content: WorldContentV2,
  territoryId: TerritoryId,
  newOwnerId: PlayerId,
  accessOrOptions?: TerritoryIntegrationStartOptionsV2,
): void {
  beginTerritoryIntegrationWithCauseV2(
    state,
    content,
    territoryId,
    newOwnerId,
    'conquest',
    integrationAccessV2(accessOrOptions),
  );
}

/**
 * A coalition member retains every live local and national value while its
 * peaceful federation proceeds through the same visible core-fusion model.
 */
export function beginFederationTerritoryIntegrationV2(
  state: WorldStateV2,
  content: WorldContentV2,
  territoryId: TerritoryId,
  newOwnerId: PlayerId,
  accessOrOptions?: TerritoryIntegrationStartOptionsV2,
): void {
  beginTerritoryIntegrationWithCauseV2(
    state,
    content,
    territoryId,
    newOwnerId,
    'federation',
    integrationAccessV2(accessOrOptions),
  );
}

export interface IntegrationRevolutionV2 {
  territoryId: TerritoryId;
  displacedOwnerId: PlayerId;
  restoredOwnerId: PlayerId;
}

/** A revolt fields part of its own live local cap, never a national free army. */
export const TERRITORY_REVOLUTION_LOCAL_ARMY_MIN_CAP_SHARE_V2 = 0.28;
export const TERRITORY_REVOLUTION_LOCAL_ARMY_MAX_CAP_SHARE_V2 = 0.50;

/**
 * Recreates only the canonical shell of an absorbed opening nation. Its old
 * inventories and knowledge were already transferred during permanent fusion,
 * so a revolution must not mint those national resources a second time.
 */
function restoreAbsorbedOpeningNationV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  capitalId: TerritoryId,
): void {
  if (state.players[playerId]) return;
  const restored = createNationStateV2(playerId, content);
  restored.treasury = 0;
  restored.foodStock = 0;
  restored.domesticFoodCapacity = 0;
  restored.trainedReserves = 0;
  restored.capitalId = capitalId;
  state.players[playerId] = restored;
  invalidateNationIndexV2(state);
}

function relocateLostCapitalsV2(
  state: WorldStateV2,
  playerIds: ReadonlySet<PlayerId>,
): void {
  for (const playerId of [...playerIds].sort((left, right) => left.localeCompare(right))) {
    const nation = state.players[playerId];
    if (!nation || state.territories[nation.capitalId]?.owner === playerId) continue;
    const replacement = (Object.entries(state.territories) as Array<[
      TerritoryId,
      TerritoryStateV2,
    ]>)
      .filter(([, territory]) => territory.owner === playerId)
      .sort((left, right) => right[1].economy - left[1].economy
        || left[0].localeCompare(right[0]))[0]?.[0];
    if (replacement) nation.capitalId = replacement;
  }
}

/** Ownership changes can invalidate either end of a stored operation. */
function pruneRevolutionWarOperationsV2(state: WorldStateV2): void {
  for (const war of state.wars) {
    war.attackerOperations = war.attackerOperations.filter((operation) => (
      state.territories[operation.sourceId]?.owner === war.attackerId
        && state.territories[operation.targetId]?.owner === war.defenderId
    ));
    war.defenderOperations = war.defenderOperations.filter((operation) => (
      state.territories[operation.sourceId]?.owner === war.defenderId
        && state.territories[operation.targetId]?.owner === war.attackerId
    ));
  }
}

function replaceOccupationWithLocalRebelArmyV2(
  state: WorldStateV2,
  content: WorldContentV2,
  territoryId: TerritoryId,
  restoredOwnerId: PlayerId,
  pressureBonusChance: number,
): void {
  const territory = state.territories[territoryId];
  const originalNation = content.nations[restoredOwnerId];
  if (!territory || !originalNation) return;
  const localCapacity = stateTerritoryArmyCapacityTargetV2(
    state,
    content,
    territoryId,
    restoredOwnerId,
  );
  const pressureShare = clamp(
    pressureBonusChance / TERRITORY_INTEGRATION_PRESSURE_REVOLUTION_MAX_CHANCE_V2,
    0,
    1,
  );
  const localForceShare = TERRITORY_REVOLUTION_LOCAL_ARMY_MIN_CAP_SHARE_V2
    + (TERRITORY_REVOLUTION_LOCAL_ARMY_MAX_CAP_SHARE_V2
      - TERRITORY_REVOLUTION_LOCAL_ARMY_MIN_CAP_SHARE_V2) * pressureShare;
  territory.army = {
    manpower: round(Math.min(localCapacity, localCapacity * localForceShare), 9),
    capacity: round(localCapacity, 9),
    baseAttack: originalNation.militaryAttackRating
      ?? originalNation.militaryQuality ?? 1,
    baseDefense: originalNation.militaryDefenseRating
      ?? originalNation.militaryQuality ?? 1,
  };
}

/**
 * Resolves rare, seed-stable revolutions before weekly finance is projected.
 * The immutable 2026 opening owner is the sole restoration source; live owner,
 * mutable core identity and fusion leader are deliberately ignored.
 */
export function processTerritoryIntegrationRevolutionsV2(
  state: WorldStateV2,
  content: WorldContentV2,
): IntegrationRevolutionV2[] {
  const revolutions: IntegrationRevolutionV2[] = [];
  const displacedOwners = new Map<PlayerId, PlayerId>();
  // Freeze every risk and trigger before changing any ownership. Simultaneous
  // revolutions therefore do not depend on territory iteration order.
  const pressureRiskByOwner = new Map<PlayerId, TerritoryIntegrationWarPressureRevolutionRiskV2>();
  for (const territoryId of content.territoryIds) {
    const territory = state.territories[territoryId];
    const ownerId = territory?.owner;
    const program = territory?.integrationProgram;
    if (ownerId && program && program.cause !== 'federation'
      && program.toOwnerId === ownerId && state.tick < program.completesTick
      && !pressureRiskByOwner.has(ownerId)) {
      pressureRiskByOwner.set(
        ownerId,
        territoryIntegrationWarPressureRevolutionRiskV2(state, content, ownerId),
      );
    }
  }
  const triggered = [...content.territoryIds]
    .sort((left, right) => left.localeCompare(right))
    .filter((territoryId) => {
      const territory = state.territories[territoryId];
      const program = territory?.integrationProgram;
      const restoredOwnerId = content.territories[territoryId]?.initialOwnerId;
      if (!territory || !program || !restoredOwnerId
        || program.toOwnerId !== territory.owner
        || restoredOwnerId === territory.owner
        || state.tick <= program.startedTick
        || state.tick >= program.completesTick) return false;
      const ordinaryTick = territoryIntegrationRevolutionTickV2(
        state,
        territoryId,
        program,
      );
      const pressureBonusChance = pressureRiskByOwner.get(territory.owner)?.bonusChance ?? 0;
      return ordinaryTick === state.tick
        || territoryIntegrationPressureRevolutionDueV2(
          state,
          territoryId,
          program,
          pressureBonusChance,
        );
    });
  for (const territoryId of triggered) {
    const territory = state.territories[territoryId];
    const program = territory?.integrationProgram;
    const restoredOwnerId = content.territories[territoryId]?.initialOwnerId;
    if (!territory || !program || !restoredOwnerId
      || program.toOwnerId !== territory.owner
      || restoredOwnerId === territory.owner
      || state.tick <= program.startedTick
      || state.tick >= program.completesTick) {
      continue;
    }
    const displacedOwnerId = territory.owner;
    const pressureBonusChance = pressureRiskByOwner.get(displacedOwnerId)?.bonusChance ?? 0;
    const displacedName = state.players[displacedOwnerId]?.empireName
      || content.nations[displacedOwnerId]?.shortName || displacedOwnerId;
    const restoredName = content.nations[restoredOwnerId]?.shortName || restoredOwnerId;
    const territoryName = content.territories[territoryId]?.name || territoryId;
    restoreAbsorbedOpeningNationV2(
      state,
      content,
      restoredOwnerId,
      territoryId,
    );
    territory.owner = restoredOwnerId;
    territory.coreOwner = restoredOwnerId;
    territory.integration = 1;
    delete territory.integrationProgram;
    replaceOccupationWithLocalRebelArmyV2(
      state,
      content,
      territoryId,
      restoredOwnerId,
      pressureBonusChance,
    );
    displacedOwners.set(displacedOwnerId, restoredOwnerId);
    revolutions.push({ territoryId, displacedOwnerId, restoredOwnerId });
    addWorldEventV2(
      state,
      'critical',
      'critical',
      `${restoredName} rose in revolution with a local rebel army and restored its sovereignty in ${territoryName}, ending integration into ${displacedName}.`,
      territoryId,
      restoredOwnerId,
    );
  }
  if (revolutions.length === 0) return revolutions;
  invalidateTerritoryIndexV2(state);
  relocateLostCapitalsV2(state, new Set([
    ...displacedOwners.keys(),
    ...revolutions.map((revolution) => revolution.restoredOwnerId),
  ]));
  pruneRevolutionWarOperationsV2(state);
  // Resolve a landless occupier only after every simultaneous revolution has
  // changed ownership, so canonical successor selection is order-independent.
  for (const [displacedOwnerId, fallbackOwnerId] of [...displacedOwners]
    .sort(([left], [right]) => left.localeCompare(right))) {
    retireAbsorbedNationV2(
      state,
      content,
      displacedOwnerId,
      fallbackOwnerId,
    );
  }
  synchronizeArmyCapacityV2(state, content);
  return revolutions;
}

function nationStillHasBackendIdentityV2(
  state: WorldStateV2,
  playerId: PlayerId,
): boolean {
  return Object.values(state.territories).some((territory) => (
    territory.owner === playerId
      || territory.coreOwner === playerId
      || territory.integrationProgram?.fromOwnerId === playerId
      || territory.integrationProgram?.fromCoreOwnerId === playerId
      || territory.integrationProgram?.toOwnerId === playerId
  )) || state.wars.some((war) => war.attackerId === playerId || war.defenderId === playerId);
}

/**
 * Permanently folds a vanished sovereign into its successor. Territory-held
 * population, output, armies and capacity already belong to the owner, so only
 * genuinely national stores are transferred before the old backend record is
 * removed.
 */
export function retireAbsorbedNationV2(
  state: WorldStateV2,
  content: WorldContentV2,
  formerNationId: PlayerId,
  ownerId: PlayerId,
  mergeKnowledge = true,
): boolean {
  if (formerNationId === ownerId) return false;
  // A country that owns land, retains a core or remains referenced by any
  // unfinished integration is still a real institution and cannot retire yet.
  if (nationStillHasBackendIdentityV2(state, formerNationId)) return false;
  const former = state.players[formerNationId];
  const canonicalSuccessorId = absorbedNationSuccessorV2(
    state,
    content,
    formerNationId,
  ) ?? ownerId;
  const owner = state.players[canonicalSuccessorId] ?? state.players[ownerId];
  if (!former || !owner) return false;
  // The final disappearance transfers national stores exactly once. An
  // over-cap reserve pool is preserved under the ordinary reserve rules.
  owner.treasury = round(owner.treasury + former.treasury);
  owner.foodStock = round(owner.foodStock + former.foodStock);
  owner.trainedReserves = round(owner.trainedReserves + former.trainedReserves);
  former.treasury = 0;
  former.foodStock = 0;
  former.trainedReserves = 0;
  if (mergeKnowledge) {
    for (const branch of RESEARCH_BRANCHES) {
      owner.research.progress[branch] = round(Math.max(
        owner.research.progress[branch],
        former.research.progress[branch],
      ));
      owner.research.breakthroughs[branch] = Math.max(
        owner.research.breakthroughs[branch],
        former.research.breakthroughs[branch],
      );
      for (const effect of RESEARCH_BRANCH_EFFECTS[branch]) {
        owner.research.effectLevels[effect] = Math.max(
          owner.research.effectLevels[effect],
          former.research.effectLevels[effect],
        );
      }
    }
  }
  state.aiEscalation.coalitionMembers = state.aiEscalation.coalitionMembers
    .filter((id) => id !== formerNationId);
  state.truces = state.truces.filter((truce) => (
    truce.leftId !== formerNationId && truce.rightId !== formerNationId
  ));
  state.offers = state.offers.filter((offer) => (
    offer.fromId !== formerNationId && offer.toId !== formerNationId
  ));
  state.ceasefireObligations = state.ceasefireObligations.filter((obligation) => (
    obligation.payerId !== formerNationId && obligation.payeeId !== formerNationId
  ));
  // Focused simulations and legacy callers may still replace only the primary
  // id. Canonicalise that effective roster before retirement decisions so a
  // stale bootstrap seat cannot masquerade as a second living human.
  const humanPlayerIds = [...selectHumanPlayerIdsV2(state)];
  state.humanPlayerIds = humanPlayerIds;
  // One defeated seat becomes a spectator without ending the shared campaign.
  // The legacy/global focus moves deterministically to another living human;
  // only the loss of every human-controlled country ends the room.
  if (isHumanPlayerV2(state, formerNationId)) {
    const livingHumanId = humanPlayerIds
      .filter((playerId) => playerId !== formerNationId && Boolean(state.players[playerId]))
      .sort((left, right) => left.localeCompare(right))[0];
    if (formerNationId === state.humanPlayerId && livingHumanId) {
      state.humanPlayerId = livingHumanId;
      state.aiEscalation.lastHumanTerritoryCount = Object.values(state.territories)
        .filter((territory) => territory.owner === livingHumanId).length;
      state.aiEscalation.lastHumanPower = 0;
    }
    if (!livingHumanId) {
      state.winnerId = owner === state.players[canonicalSuccessorId]
        ? canonicalSuccessorId : ownerId;
      state.gameOver = true;
      state.speed = 0;
    }
  }
  delete state.players[formerNationId];
  invalidateNationIndexV2(state);
  return true;
}

/** Finds the present owner holding most of an absorbed country's home cores. */
export function absorbedNationSuccessorV2(
  state: WorldStateV2,
  content: WorldContentV2,
  formerNationId: PlayerId,
): PlayerId | undefined {
  const successors = new Map<PlayerId, number>();
  for (const territoryId of content.territoryIds) {
    if (content.territories[territoryId]?.initialOwnerId !== formerNationId) continue;
    const ownerId = state.territories[territoryId]?.owner;
    if (ownerId && ownerId !== formerNationId) {
      successors.set(ownerId, (successors.get(ownerId) ?? 0) + 1);
    }
  }
  return [...successors]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];
}

/**
 * Same-schema saves from before true backend fusion may contain already
 * absorbed nation records. Remove those zombies deterministically on load.
 */
export function retireDormantAbsorbedNationsV2(
  state: WorldStateV2,
  content: WorldContentV2,
): void {
  for (const formerNationId of (Object.keys(state.players) as PlayerId[])
    .sort((left, right) => left.localeCompare(right))) {
    if (nationStillHasBackendIdentityV2(state, formerNationId)) continue;
    const ownerId = absorbedNationSuccessorV2(state, content, formerNationId);
    // Knowledge uses maxima, so repeating this merge while normalising an old
    // save is idempotent and also preserves exiles that vanished before their
    // research had ever reached the successor.
    if (ownerId) retireAbsorbedNationV2(state, content, formerNationId, ownerId);
  }
}

/**
 * Advances every active program by one calendar week and performs the single
 * permanent core-identity transfer exactly on its promised completion tick.
 */
export function advanceTerritoryIntegrationProgramsV2(
  state: WorldStateV2,
  content: WorldContentV2,
): IntegrationCompletionV2[] {
  const completions: IntegrationCompletionV2[] = [];
  for (const territoryId of content.territoryIds) {
    const territory = state.territories[territoryId];
    const program = territory?.integrationProgram;
    if (!territory || !program || state.tick <= program.startedTick) continue;
    if (state.tick < program.completesTick) {
      // This remaining-distance step preserves migrated progress while still
      // landing on the immutable endpoint without accumulated rounding drift.
      const remainingSteps = program.completesTick - state.tick + 1;
      territory.integration = round(clamp(
        territory.integration + (1 - territory.integration) / remainingSteps,
        CONQUEST_INITIAL_INTEGRATION_SHARE,
        1,
      ), 12);
      continue;
    }
    const formerCoreOwnerId = program.fromCoreOwnerId;
    const ownerId = territory.owner;
    const formerName = state.players[formerCoreOwnerId]?.empireName
      || content.nations[formerCoreOwnerId]?.shortName || formerCoreOwnerId;
    const ownerName = state.players[ownerId]?.empireName
      || content.nations[ownerId]?.shortName || ownerId;
    territory.integration = 1;
    territory.coreOwner = ownerId;
    delete territory.integrationProgram;
    for (const formerNationId of new Set([
      program.fromOwnerId,
      formerCoreOwnerId,
    ])) retireAbsorbedNationV2(state, content, formerNationId, ownerId);
    addWorldEventV2(
      state,
      'conquest',
      isHumanPlayerV2(state, ownerId) ? 'action' : 'info',
      `${formerName} completed integration into ${ownerName} and is now permanent core territory.`,
      territoryId,
      ownerId,
    );
    completions.push({ territoryId, formerCoreOwnerId, ownerId });
  }
  // The capacity model is owner-specific. Final core fusion can retire a
  // sovereign and change the live leader context, so persist the resulting
  // local caps before invariants, saves or multiplayer snapshots observe it.
  if (completions.length > 0) synchronizeArmyCapacityV2(state, content);
  return completions;
}
