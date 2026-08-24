import {
  DEFAULT_BUDGET_V2,
  DEFAULT_RESEARCH_ALLOCATIONS_V2,
  EMPTY_RESEARCH_BREAKTHROUGHS,
  EMPTY_RESEARCH_EFFECT_LEVELS,
  EMPTY_RESEARCH_PROGRESS,
  FOOD_TARGET_WEEKS,
  clamp,
  round,
} from './balance';
import { initialNationArmyCapacityBenchmarkV2 } from './capacity';
import type { WorldContentV2 } from './content';
import { calculateBlendedFiscalCapacityV2 } from './fiscal';
import { initialTrainedReserveManpowerV2 } from './reserveForces';
import { countryTraitFactorV2 } from './traits';
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
      * countryTraitFactorV2(id, 'starting-treasury', { humanControlled }),
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
      { humanControlled: true },
    );
    if (Math.abs(ordinaryFactor - humanFactor) <= 0.000000001) continue;
    state.players[id]!.treasury = openingStartingTreasuryV2(id, content, next.has(id));
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
  const initialFoodBufferWeeks = FOOD_TARGET_WEEKS
    * clamp(1 - 4 * definition.real.foodInsecurityRate, 0.08, 1);
  const initialArmyCapacity = initialNationArmyCapacityBenchmarkV2(content, id);
  return {
    empireName: '',
    treasury: openingStartingTreasuryV2(id, content, humanControlled),
    foodStock: round(definition.real.population * initialFoodBufferWeeks),
    domesticFoodCapacity: 0,
    // Food security is a live result of funded supply plus stored reserves,
    // never a country-data percentage imposed on the simulation. Historical
    // vulnerability still starts fragile systems with a smaller buffer and a
    // higher production/import burden below.
    foodSecurity: 1,
    trainedReserves: initialTrainedReserveManpowerV2(String(id), initialArmyCapacity),
    budget: { ...DEFAULT_BUDGET_V2 },
    research: {
      allocations: { ...DEFAULT_RESEARCH_ALLOCATIONS_V2 },
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
    warFatigue: 0,
    capitalId: definition.initialCapitalId,
  };
}
