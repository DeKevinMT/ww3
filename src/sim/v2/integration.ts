import {
  CONQUEST_INITIAL_INTEGRATION_SHARE,
  INTEGRATION_ADMINISTRATION_ANNUAL_OUTPUT_SHARE,
  RESEARCH_BRANCH_EFFECTS,
  RESEARCH_BRANCHES,
  WEEKS_PER_YEAR,
  clamp,
  round,
} from './balance';
import type { WorldContentV2 } from './content';
import { addWorldEventV2 } from './events';
import { invalidateNationIndexV2 } from './selectors';
import {
  territoryIdV2,
  type PlayerId,
  type TerritoryId,
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
/** Current captures use a 1.2x calendar: exactly 20% faster than the former 1.5x calendar. */
export const INTEGRATION_DURATION_MULTIPLIER_V2 = 1.2;
/** Voluntary defensive unions complete four times faster than conquest. */
export const FEDERATION_INTEGRATION_DURATION_FACTOR_V2 = 0.25;

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
  // universal 1.2x calendar after its old whole-week promise is calculated.
  // This makes the extension exact for every territory and avoids changing
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

/**
 * Starts one immutable integration calendar. A sovereign-core recapture is the
 * only case that restores full access immediately.
 */
function beginTerritoryIntegrationWithFactorV2(
  state: WorldStateV2,
  content: WorldContentV2,
  territoryId: TerritoryId,
  newOwnerId: PlayerId,
  durationFactor: number,
): void {
  const territory = state.territories[territoryId];
  if (!territory) return;
  const formerOwnerId = territory.owner;
  territory.owner = newOwnerId;
  if (territory.coreOwner === newOwnerId) {
    territory.integration = 1;
    delete territory.integrationProgram;
    return;
  }
  territory.integration = CONQUEST_INITIAL_INTEGRATION_SHARE;
  territory.integrationProgram = {
    fromOwnerId: formerOwnerId,
    fromCoreOwnerId: territory.coreOwner,
    toOwnerId: newOwnerId,
    startedTick: state.tick,
    completesTick: state.tick + Math.max(1, Math.round(
      territoryIntegrationDurationWeeksV2(content, territoryId) * durationFactor,
    )),
    annualCost: territoryIntegrationAnnualCostV2(territory.economy),
  };
}

export function beginTerritoryIntegrationV2(
  state: WorldStateV2,
  content: WorldContentV2,
  territoryId: TerritoryId,
  newOwnerId: PlayerId,
): void {
  beginTerritoryIntegrationWithFactorV2(state, content, territoryId, newOwnerId, 1);
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
): void {
  beginTerritoryIntegrationWithFactorV2(
    state,
    content,
    territoryId,
    newOwnerId,
    FEDERATION_INTEGRATION_DURATION_FACTOR_V2,
  );
}

function nationStillHasBackendIdentityV2(
  state: WorldStateV2,
  playerId: PlayerId,
): boolean {
  return Object.values(state.territories).some((territory) => (
    territory.owner === playerId
      || territory.coreOwner === playerId
      || territory.control?.controller === playerId
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
  // A country that owns, controls or remains referenced by any unfinished
  // integration is still a real institution and cannot be retired yet.
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
  // Full integration has no selected-country exception. If the former nation
  // was the player's country, the campaign ends with the absorbing country as
  // victor while the obsolete backend record still disappears normally.
  if (formerNationId === state.humanPlayerId) {
    state.winnerId = owner === state.players[canonicalSuccessorId]
      ? canonicalSuccessorId : ownerId;
    state.gameOver = true;
    state.speed = 0;
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
      ownerId === state.humanPlayerId ? 'action' : 'info',
      `${formerName} completed integration into ${ownerName} and is now permanent core territory.`,
      territoryId,
      ownerId,
    );
    completions.push({ territoryId, formerCoreOwnerId, ownerId });
  }
  return completions;
}
