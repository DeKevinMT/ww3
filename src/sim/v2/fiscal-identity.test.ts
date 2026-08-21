import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import {
  FULL_STRENGTH_WEALTH_PER_PERSON_V2,
  MAX_NORMALIZED_TAX_RATE_V2,
  MIN_NORMALIZED_TAX_RATE_V2,
  calculateFiscalCapacityV2,
} from './fiscal';
import {
  selectNationalEconomyV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import { nationIdV2, territoryIdV2, type WorldContentV2 } from './types';

const bel = nationIdV2('bel');
const usa = nationIdV2('usa');
const qat = nationIdV2('qat');
const nga = nationIdV2('nga');
const cub = nationIdV2('cub');
const belTerritory = territoryIdV2('bel');

function contentWithTaxRate(playerId: typeof bel, taxRevenueShare: number): WorldContentV2 {
  const nation = WORLD_CONTENT_V2.nations[playerId]!;
  return {
    ...WORLD_CONTENT_V2,
    nations: {
      ...WORLD_CONTENT_V2.nations,
      [playerId]: {
        ...nation,
        real: { ...nation.real, taxRevenueShare },
      },
    },
  };
}

function expectedTaxRate(wealthPerPerson: number): number {
  return MIN_NORMALIZED_TAX_RATE_V2
    + (MAX_NORMALIZED_TAX_RATE_V2 - MIN_NORMALIZED_TAX_RATE_V2)
      * Math.min(1, Math.max(0, wealthPerPerson) / FULL_STRENGTH_WEALTH_PER_PERSON_V2);
}

describe('V2 fiscal identity and population-linked income', () => {
  it('retains official IMF tax observations only as reference metadata', () => {
    const direct = WORLD_CONTENT_V2.nationIds.filter((id) => (
      WORLD_CONTENT_V2.nations[id]!.real.taxRevenueSource === 'IMF_WORLD_G11_POGDP_PT_R'
    ));
    const imputed = WORLD_CONTENT_V2.nationIds.filter((id) => WORLD_CONTENT_V2.nations[id]!.real.taxRevenueImputed);

    expect(direct).toHaveLength(160);
    expect(imputed).toHaveLength(5);
    expect(WORLD_CONTENT_V2.nations[bel]!.real.taxRevenueShare).toBeCloseTo(0.29570690, 8);
    expect(WORLD_CONTENT_V2.nations[usa]!.real.taxRevenueShare).toBeCloseTo(0.19478716, 8);
    expect(WORLD_CONTENT_V2.nations[nga]!.real.taxRevenueShare).toBeCloseTo(0.03423527, 8);
    expect(WORLD_CONTENT_V2.nations[cub]!.real.taxRevenueShare).toBeCloseTo(0.14511966, 8);
    expect(WORLD_CONTENT_V2.nations[cub]!.real.observedTaxRevenueShare).toBeNull();
    expect(WORLD_CONTENT_V2.nations[cub]!.real.taxRevenueSource).toBe('subregion-median');

    for (const id of WORLD_CONTENT_V2.nationIds) {
      const fiscal = WORLD_CONTENT_V2.nations[id]!.real;
      expect(fiscal.taxRevenueShare, String(id)).toBeGreaterThanOrEqual(0.01);
      expect(fiscal.taxRevenueShare, String(id)).toBeLessThanOrEqual(0.50);
      if (!fiscal.taxRevenueImputed) {
        expect(fiscal.observedTaxRevenueShare, String(id)).toBe(fiscal.taxRevenueShare);
        expect(fiscal.taxRevenueYear, String(id)).toBeGreaterThanOrEqual(2015);
      }
    }
  });

  it('derives weekly income from live population, live wealth and the visible country rate', () => {
    const state = createWorldStateV2(4_201, WORLD_CONTENT_V2);
    state.wars = [];
    const economy = selectNationalEconomyV2(state, WORLD_CONTENT_V2, bel);
    expect(economy.weeklyRevenue).toBeCloseTo(
      economy.population * economy.wealthPerPerson * economy.taxRate / 52,
      5,
    );
    expect(economy.effectivePopulation).toBe(economy.population);
    expect(economy.taxRate).toBeCloseTo(expectedTaxRate(economy.wealthPerPerson), 8);
    expect(economy.taxRate).toBeGreaterThanOrEqual(MIN_NORMALIZED_TAX_RATE_V2);
    expect(economy.taxRate).toBeLessThanOrEqual(MAX_NORMALIZED_TAX_RATE_V2);

    const lowTaxContent = contentWithTaxRate(bel, 0.125);
    const highTaxContent = contentWithTaxRate(bel, 0.25);
    const lowTax = selectNationalEconomyV2(state, lowTaxContent, bel);
    const highTax = selectNationalEconomyV2(state, highTaxContent, bel);
    expect(highTax.output).toBeCloseTo(lowTax.output, 8);
    expect(highTax.weeklyRevenue).toBeCloseTo(lowTax.weeklyRevenue, 8);
  });

  it('does not create free GDP when population grows by itself', () => {
    const state = createWorldStateV2(4_202, WORLD_CONTENT_V2);
    state.wars = [];
    const before = selectNationalEconomyV2(state, WORLD_CONTENT_V2, bel);
    state.territories[belTerritory]!.population *= 1.10;
    const after = selectNationalEconomyV2(state, WORLD_CONTENT_V2, bel);
    expect(after.output).toBeCloseTo(before.output, 6);
    expect(after.wealthPerPerson).toBeCloseTo(before.wealthPerPerson / 1.10, 8);
    expect(after.weeklyRevenue).toBeLessThan(before.weeklyRevenue);
  });

  it('scales exactly with population and gives stronger economies a higher bounded rate', () => {
    const baseline = calculateFiscalCapacityV2(10, 20);
    const twicePopulation = calculateFiscalCapacityV2(20, 20);
    const richer = calculateFiscalCapacityV2(10, 40);

    expect(baseline.dynamicTaxRate).toBeCloseTo(expectedTaxRate(20), 8);
    expect(twicePopulation.dynamicTaxRate).toBe(baseline.dynamicTaxRate);
    expect(richer.dynamicTaxRate).toBeCloseTo(expectedTaxRate(40), 8);
    expect(richer.dynamicTaxRate).toBeGreaterThan(baseline.dynamicTaxRate);
    expect(twicePopulation.weeklyTaxRevenue).toBeCloseTo(baseline.weeklyTaxRevenue * 2, 8);
    expect(richer.weeklyTaxRevenue).toBeGreaterThan(baseline.weeklyTaxRevenue * 2);
  });

  it('keeps every country rate between 10% and 20% and every result finite', () => {
    expect(calculateFiscalCapacityV2(1, 0).dynamicTaxRate).toBe(MIN_NORMALIZED_TAX_RATE_V2);
    expect(calculateFiscalCapacityV2(1, 1e-12).dynamicTaxRate).toBeCloseTo(MIN_NORMALIZED_TAX_RATE_V2, 8);
    expect(calculateFiscalCapacityV2(1, 1e12).dynamicTaxRate).toBe(MAX_NORMALIZED_TAX_RATE_V2);

    const state = createWorldStateV2(4_206, WORLD_CONTENT_V2);
    for (const id of WORLD_CONTENT_V2.nationIds) {
      const economy = selectNationalEconomyV2(state, WORLD_CONTENT_V2, id);
      expect(Number.isFinite(economy.effectivePopulation), String(id)).toBe(true);
      expect(Number.isFinite(economy.wealthPerPerson), String(id)).toBe(true);
      expect(Number.isFinite(economy.dynamicTaxRate), String(id)).toBe(true);
      expect(Number.isFinite(economy.weeklyRevenue), String(id)).toBe(true);
      expect(economy.dynamicTaxRate, String(id)).toBeGreaterThanOrEqual(MIN_NORMALIZED_TAX_RATE_V2);
      expect(economy.dynamicTaxRate, String(id)).toBeLessThanOrEqual(MAX_NORMALIZED_TAX_RATE_V2);
    }
  });

  it('uses canonical automatic income plus a diminishing small-rich-state buffer for starting treasury', () => {
    const state = createWorldStateV2(4_203, WORLD_CONTENT_V2);
    for (const id of WORLD_CONTENT_V2.nationIds) {
      const real = WORLD_CONTENT_V2.nations[id]!.real;
      const fiscal = calculateFiscalCapacityV2(real.population, real.gdp / real.population);
      const weeklyRevenue = fiscal.weeklyTaxRevenue;
      const gdpPerCapita = real.gdp / Math.max(0.01, real.population) * 1_000;
      const wealthTier = Math.min(4, Math.max(0, Math.log2(Math.max(10_000, gdpPerCapita) / 10_000)));
      const sizeDamping = 1 / Math.sqrt(Math.max(1, real.gdp / 500));
      const startingCashWeeks = Math.min(9, Math.max(2, 2 + 2.25 * wealthTier * sizeDamping));
      const expected = Math.round(Math.max(0.10, weeklyRevenue * startingCashWeeks) * 1_000) / 1_000;
      expect(state.players[id]!.treasury, String(id)).toBe(expected);
    }
    const qatarWeeks = state.players[qat]!.treasury
      / calculateFiscalCapacityV2(
        WORLD_CONTENT_V2.nations[qat]!.real.population,
        WORLD_CONTENT_V2.nations[qat]!.real.gdp / WORLD_CONTENT_V2.nations[qat]!.real.population,
      ).weeklyTaxRevenue;
    const usaWeeks = state.players[usa]!.treasury
      / calculateFiscalCapacityV2(
        WORLD_CONTENT_V2.nations[usa]!.real.population,
        WORLD_CONTENT_V2.nations[usa]!.real.gdp / WORLD_CONTENT_V2.nations[usa]!.real.population,
      ).weeklyTaxRevenue;
    expect(qatarWeeks).toBeGreaterThan(usaWeeks * 2);
    expect(usaWeeks).toBeLessThan(4);
  });

  it('charges the full real army footprint instead of making large forces free above a revenue cap', () => {
    const state = createWorldStateV2(4_204, WORLD_CONTENT_V2);
    state.wars = [];
    const before = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, bel);
    const army = state.territories[belTerritory]!.army;
    army.manpower *= 100;
    army.capacity *= 100;
    const enlarged = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, bel);

    expect(enlarged.armyUpkeep).toBeGreaterThan(before.armyUpkeep * 80);
    expect(enlarged.armyUpkeep).toBeGreaterThan(enlarged.revenue * 0.30);
    expect(enlarged.mandatoryFundingRatio).toBeLessThan(1);
  });

  it('keeps food funded and lets true emergencies draw only from available cash', () => {
    const state = createWorldStateV2(4_205, WORLD_CONTENT_V2);
    state.wars = [];
    for (const id of WORLD_CONTENT_V2.nationIds) {
      const finance = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, id);
      expect(finance.foodProduction, String(id)).toBeLessThanOrEqual(
        finance.revenue + Math.max(0, state.players[id]!.treasury) + 1e-6,
      );
      expect(Number.isFinite(finance.mandatoryFundingRatio), String(id)).toBe(true);
    }

    const nigeria = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, nga);
    const india = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, nationIdV2('ind'));
    const unitedStates = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, usa);
    expect(nigeria.foodCoverage).toBe(1);
    expect(india.foodCoverage).toBe(1);
    expect(nigeria.foodProduction / nigeria.revenue)
      .toBeGreaterThan(unitedStates.foodProduction / unitedStates.revenue);
    expect(india.foodProduction / india.revenue)
      .toBeGreaterThan(unitedStates.foodProduction / unitedStates.revenue);
    expect(unitedStates.armyUpkeep / unitedStates.revenue).toBeGreaterThan(0.15);
    expect(unitedStates.net / unitedStates.revenue).toBeLessThan(0.02);
  });
});
