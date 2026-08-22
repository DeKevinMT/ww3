import {
  PROPAGANDA_COST_REVENUE_WEEKS,
  PROPAGANDA_MIN_COST_BILLIONS,
  PROPAGANDA_TERRITORY_LOG_SCALE,
  PROPAGANDA_POPULATION_LOG_SCALE,
  RAPID_RECRUITMENT_COST_MULTIPLIER,
  RESEARCH_SURGE_COST_REVENUE_WEEKS,
  RESEARCH_SURGE_POPULATION_SCALE,
  RESEARCH_SURGE_TERRITORY_SCALE,
  MANUAL_ACTION_BASE_DISCOUNT,
  MANUAL_PROPAGANDA_COST_GROWTH,
  MANUAL_RAPID_RECRUITMENT_COST_GROWTH,
  MANUAL_RESEARCH_SURGE_COST_GROWTH,
  round,
} from './balance';
import { initialNationArmyCapacityBenchmarkV2 } from './capacity';
import type { WorldContentV2 } from './content';
import { calculateFiscalCapacityV2 } from './fiscal';
import { nationalAiEfficiencyV2 } from './nationalAi';
import type { ManualActionUsesV2, PlayerId } from './types';

export type ManualActionV2 = keyof ManualActionUsesV2;

export function initialStructuralWeeklyRevenueV2(
  content: WorldContentV2,
  playerId: PlayerId,
): number {
  const nation = content.nations[playerId];
  if (!nation) return 0;
  return calculateFiscalCapacityV2(
    nation.real.population,
    nation.real.gdp / Math.max(0.01, nation.real.population),
  ).weeklyTaxRevenue;
}

function initialEmpireScaleV2(
  content: WorldContentV2,
  playerId: PlayerId,
  territoryScale: number,
  populationScale: number,
): number {
  const nation = content.nations[playerId];
  if (!nation) return 1;
  const territoryCount = content.territoryIds.filter((id) => (
    content.territories[id]?.initialOwnerId === playerId
  )).length;
  return round(1
    + territoryScale * Math.log2(Math.max(1, territoryCount))
    + populationScale * Math.log2(Math.max(1, nation.real.population / 10)));
}

export function manualActionUseMultiplierV2(action: ManualActionV2, uses: number): number {
  const growth = action === 'rapidRecruitment' ? MANUAL_RAPID_RECRUITMENT_COST_GROWTH
    : action === 'researchSurge' ? MANUAL_RESEARCH_SURGE_COST_GROWTH
      : MANUAL_PROPAGANDA_COST_GROWTH;
  return round(growth ** Math.max(0, Math.floor(uses)));
}

export function initialManualActionCostV2(
  content: WorldContentV2,
  playerId: PlayerId,
  action: ManualActionV2,
): { baseCost: number; openingScale: number } {
  const nation = content.nations[playerId];
  if (!nation) return { baseCost: 0, openingScale: 1 };
  if (action === 'rapidRecruitment') {
    const initialAmount = initialNationArmyCapacityBenchmarkV2(content, playerId) * 0.05;
    const quality = 0.55 * (nation.militaryAttackRating ?? nation.militaryQuality)
      + 0.45 * (nation.militaryDefenseRating ?? nation.militaryQuality);
    const baseCost = Math.max(0.001, initialAmount
      * (2 / nationalAiEfficiencyV2(nation.iqScore))
      * RAPID_RECRUITMENT_COST_MULTIPLIER
      * quality ** 2
      * MANUAL_ACTION_BASE_DISCOUNT);
    return { baseCost: round(baseCost), openingScale: round(quality ** 2) };
  }
  const revenue = initialStructuralWeeklyRevenueV2(content, playerId);
  if (action === 'researchSurge') {
    const openingScale = initialEmpireScaleV2(
      content, playerId, RESEARCH_SURGE_TERRITORY_SCALE, RESEARCH_SURGE_POPULATION_SCALE,
    );
    return {
      baseCost: round(Math.max(0.20,
        revenue * RESEARCH_SURGE_COST_REVENUE_WEEKS * openingScale * MANUAL_ACTION_BASE_DISCOUNT)),
      openingScale,
    };
  }
  const openingScale = initialEmpireScaleV2(
    content, playerId, PROPAGANDA_TERRITORY_LOG_SCALE, PROPAGANDA_POPULATION_LOG_SCALE,
  );
  return {
    baseCost: round(Math.max(PROPAGANDA_MIN_COST_BILLIONS * MANUAL_ACTION_BASE_DISCOUNT,
      revenue * PROPAGANDA_COST_REVENUE_WEEKS * openingScale * MANUAL_ACTION_BASE_DISCOUNT), 3),
    openingScale,
  };
}
