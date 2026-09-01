import {
  DEFAULT_BUDGET_V2,
  DEFAULT_RESEARCH_ALLOCATIONS_V2,
  EMPTY_RESEARCH_BREAKTHROUGHS,
  EMPTY_RESEARCH_EFFECT_LEVELS,
  EMPTY_RESEARCH_PROGRESS,
  clamp,
  round,
} from './balance';
import { createDefaultResearchDirectionsV2 } from './researchDirections';
import type { WorldContentV2 } from './content';
import { calculateBlendedFiscalCapacityV2 } from './fiscal';
import { OPENING_ARMY_BONUS_DURATION_TICKS_V2 } from './openingArmyBonus';
import {
  countryTraitFactorV2,
  humanCountryTraitMultiplierForContentV2,
  humanStartingArmyMultiplierForContentV2,
  legacyV261HumanStartingArmyMultiplierForContentV2,
} from './traits';
import type { NationStateV2, PlayerId, WorldStateV2 } from './types';

/** Canonical opening cash for one immutable 2026 identity and controller type. */
export function openingStartingTreasuryV2(
  id: PlayerId,
  content: WorldContentV2,
  humanControlled = false,
): number {
  const definition = content.nations[id];
  if (!definition) throw new Error(`Missing V2 nation content for ${id}.`);
  const structuralPopulation = Math.max(0, definition.real.population);
  const fiscalCapacity = calculateBlendedFiscalCapacityV2(
    definition.real.gdp,
    structuralPopulation,
    structuralPopulation,
  );
  const gdpPerCapita = fiscalCapacity.wealthPerPerson * 1_000;
  const wealthTier = clamp(
    Math.log2(Math.max(10_000, gdpPerCapita) / 10_000),
    0,
    4,
  );
  const largeEconomyDamping = 1 / Math.sqrt(Math.max(1, definition.real.gdp / 500));
  const startingCashWeeks = clamp(
    2 + 2.25 * wealthTier * largeEconomyDamping,
    2,
    9,
  );
  return round(
    Math.max(0.10, fiscalCapacity.weeklyTaxRevenue * startingCashWeeks)
      * countryTraitFactorV2(id, 'starting-treasury', {
        humanControlled,
        humanTraitMultiplier: humanControlled
          ? humanCountryTraitMultiplierForContentV2(content, id)
          : undefined,
      }),
    3,
  );
}

/**
 * Requotes the one opening-only treasury trait when tick-zero lobby seats
 * change. Only identities whose controller type changed and whose factor is
 * non-neutral are touched, so repeated lobby synchronization cannot stack it.
 */
export function synchronizeOpeningTreasuryHumanRosterV2(
  state: WorldStateV2,
  content: WorldContentV2,
  previousHumanPlayerIds: readonly PlayerId[],
  nextHumanPlayerIds: readonly PlayerId[],
): void {
  if (state.tick !== 0) return;
  const previous = new Set(previousHumanPlayerIds);
  const next = new Set(nextHumanPlayerIds);
  const changed = new Set([...previous, ...next]);
  for (const id of [...changed].sort((left, right) => left.localeCompare(right))) {
    if (previous.has(id) === next.has(id) || !state.players[id]) continue;
    const ordinaryFactor = countryTraitFactorV2(id, 'starting-treasury');
    const humanFactor = countryTraitFactorV2(
      id,
      'starting-treasury',
      {
        humanControlled: true,
        humanTraitMultiplier: humanCountryTraitMultiplierForContentV2(content, id),
      },
    );
    if (Math.abs(ordinaryFactor - humanFactor) <= 0.000000001) continue;
    state.players[id]!.treasury = openingStartingTreasuryV2(id, content, next.has(id));
  }
}

/**
 * Applies the opening-only human army boost when tick-zero seats change.
 * The old controller multiplier is removed before the new one is applied, so
 * repeated lobby updates and country switches cannot stack the bonus. Deployed
 * manpower changes here; capacity is synchronized by the caller onto the same
 * temporary curve. Extra deployed soldiers are free and non-replenishable,
 * and the fading capacity entitlement gates future recruitment without
 * deleting paid soldiers that already exist. The retired compatibility field
 * is always reset to zero.
 */
export function synchronizeOpeningArmyHumanRosterV2(
  state: WorldStateV2,
  content: WorldContentV2,
  previousHumanPlayerIds: readonly PlayerId[],
  nextHumanPlayerIds: readonly PlayerId[],
): void {
  if (state.tick !== 0) return;
  const previous = new Set(previousHumanPlayerIds);
  const next = new Set(nextHumanPlayerIds);
  const changed = new Set([...previous, ...next]);
  for (const id of [...changed].sort((left, right) => left.localeCompare(right))) {
    if (previous.has(id) === next.has(id) || !content.nations[id] || !state.players[id]) continue;
    state.players[id]!.trainedReserves = 0;
    const before = previous.has(id) ? humanStartingArmyMultiplierForContentV2(content, id) : 1;
    const after = next.has(id) ? humanStartingArmyMultiplierForContentV2(content, id) : 1;
    if (Math.abs(before - after) <= 0.000000001) continue;
    state.players[id]!.openingArmyBonus = null;
    for (const territory of Object.values(state.territories)) {
      if (territory.owner !== id) continue;
      territory.army.manpower = round(territory.army.manpower / before * after, 9);
    }
    if (next.has(id) && after > 1.000000001) {
      const deployed = round(Object.values(state.territories)
        .filter((territory) => territory.owner === id)
        .reduce((sum, territory) => sum + Math.max(0, territory.army.manpower), 0), 9);
      const initialManpower = round(Math.max(0, deployed - deployed / after), 9);
      if (initialManpower > 0.000000001) state.players[id]!.openingArmyBonus = {
        initialManpower,
        remainingManpower: initialManpower,
        startedTick: state.tick,
        expiresTick: state.tick + OPENING_ARMY_BONUS_DURATION_TICKS_V2,
      };
    }
  }
}

/**
 * Adds bookkeeping to an authenticated V2.61 tick-zero save whose manpower was
 * already boosted. It deliberately does not rescale the army a second time.
 */
export function trackExistingOpeningArmyHumanRosterV2(
  state: WorldStateV2,
  content: WorldContentV2,
): void {
  if (state.tick !== 0) return;
  const humans = new Set(state.humanPlayerIds);
  for (const [id, nation] of Object.entries(state.players) as Array<[PlayerId, NationStateV2]>) {
    nation.openingArmyBonus = null;
    if (!humans.has(id)) continue;
    const multiplier = legacyV261HumanStartingArmyMultiplierForContentV2(content, id);
    if (multiplier <= 1.000000001) continue;
    const deployed = round(Object.values(state.territories)
      .filter((territory) => territory.owner === id)
      .reduce((sum, territory) => sum + Math.max(0, territory.army.manpower), 0), 9);
    const initialManpower = round(Math.max(0, deployed - deployed / multiplier), 9);
    if (initialManpower <= 0.000000001) continue;
    nation.openingArmyBonus = {
      initialManpower,
      remainingManpower: initialManpower,
      startedTick: 0,
      expiresTick: OPENING_ARMY_BONUS_DURATION_TICKS_V2,
    };
  }
}

/** Builds the canonical national payload for one immutable 2026 identity. */
export function createNationStateV2(
  id: PlayerId,
  content: WorldContentV2,
  humanControlled = false,
): NationStateV2 {
  const definition = content.nations[id];
  if (!definition) throw new Error(`Missing V2 nation content for ${id}.`);
  return {
    empireName: '',
    treasury: openingStartingTreasuryV2(id, content, humanControlled),
    // Retained only as neutral schema sentinels for authenticated old saves.
    foodStock: 0,
    domesticFoodCapacity: 0,
    foodSecurity: 1,
    // Persisted only so old saves and reconnect snapshots retain their shape.
    trainedReserves: 0,
    budget: { ...DEFAULT_BUDGET_V2 },
    research: {
      allocations: { ...DEFAULT_RESEARCH_ALLOCATIONS_V2 },
      activeProgram: null,
      categoryDirections: createDefaultResearchDirectionsV2(),
      progress: { ...EMPTY_RESEARCH_PROGRESS },
      effectLevels: { ...EMPTY_RESEARCH_EFFECT_LEVELS },
      breakthroughs: { ...EMPTY_RESEARCH_BREAKTHROUGHS },
    },
    ceasefiresRequested: 0,
    manualActionUses: { rapidRecruitment: 0, researchSurge: 0, propaganda: 0 },
    rapidRecruitmentAvailableTick: 0,
    researchSurgeAvailableTick: 0,
    propagandaAvailableTick: 0,
    propagandaProgram: null,
    openingArmyBonus: null,
    warFatigue: 0,
    capitalId: definition.initialCapitalId,
  };
}
