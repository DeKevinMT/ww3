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
  // Luxembourg anchors the compact-country calendar at 12.5 years. The fourth-
  // power tail keeps medium countries demanding while making the largest
  // countries a multi-century project without a hard country-specific rule.
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
  return Math.round(years * WEEKS_PER_YEAR);
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
export function beginTerritoryIntegrationV2(
  state: WorldStateV2,
  content: WorldContentV2,
  territoryId: TerritoryId,
  newOwnerId: PlayerId,
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
    completesTick: state.tick + territoryIntegrationDurationWeeksV2(content, territoryId),
    annualCost: territoryIntegrationAnnualCostV2(territory.economy),
  };
}

function mergeEliminatedNationKnowledgeV2(
  state: WorldStateV2,
  formerNationId: PlayerId,
  ownerId: PlayerId,
): void {
  if (formerNationId === ownerId) return;
  // A country that still controls land remains a separate institution. Once it
  // has no sovereign territory, its strongest durable knowledge becomes part
  // of the empire, without summing duplicate bonuses into free power.
  if (Object.values(state.territories).some((territory) => territory.owner === formerNationId)) return;
  const former = state.players[formerNationId];
  const owner = state.players[ownerId];
  if (!former || !owner) return;
  owner.combatExperience = round(Math.max(
    owner.combatExperience,
    former.combatExperience,
  ));
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
    territory.integration = 1;
    territory.coreOwner = ownerId;
    delete territory.integrationProgram;
    for (const formerNationId of new Set([
      program.fromOwnerId,
      formerCoreOwnerId,
    ])) mergeEliminatedNationKnowledgeV2(state, formerNationId, ownerId);
    const formerName = state.players[formerCoreOwnerId]?.empireName
      || content.nations[formerCoreOwnerId]?.shortName || formerCoreOwnerId;
    const ownerName = state.players[ownerId]?.empireName
      || content.nations[ownerId]?.shortName || ownerId;
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
