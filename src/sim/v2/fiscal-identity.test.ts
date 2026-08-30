import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import {
  isHumanSelectableNationV2,
  ROGUE_AI_NATION_ID_V2,
  WORLD_CONTENT_V2,
} from './content';
import { OPENING_ARMY_BONUS_DURATION_TICKS_V2 } from './openingArmyBonus';
import {
  FULL_STRENGTH_WEALTH_PER_PERSON_V2,
  MAX_NORMALIZED_TAX_RATE_V2,
  MIN_NORMALIZED_TAX_RATE_V2,
  calculateBlendedFiscalCapacityV2,
  calculateFiscalCapacityV2,
} from './fiscal';
import {
  selectEconomicOutputLedgerV2,
  selectNationalEconomyV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import { traitNationContextV2 } from './traitContext';
import { countryTraitFactorV2 } from './traits';
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
    const ordinaryIds = WORLD_CONTENT_V2.nationIds.filter((id) => (
      isHumanSelectableNationV2(WORLD_CONTENT_V2, id)
    ));
    const direct = ordinaryIds.filter((id) => (
      WORLD_CONTENT_V2.nations[id]!.real.taxRevenueSource === 'IMF_WORLD_G11_POGDP_PT_R'
    ));
    const imputed = ordinaryIds.filter((id) => WORLD_CONTENT_V2.nations[id]!.real.taxRevenueImputed);

    expect(direct).toHaveLength(160);
    expect(imputed).toHaveLength(5);
    expect(WORLD_CONTENT_V2.nations[ROGUE_AI_NATION_ID_V2]!.real.taxRevenueImputed).toBe(true);
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

  it('preserves opening calibration while exposing GDP and taxable output separately', () => {
    const state = createWorldStateV2(4_201, WORLD_CONTENT_V2);
    state.wars = [];
    const economy = selectNationalEconomyV2(state, WORLD_CONTENT_V2, bel);
    // The fiscal formula stays canonical; Belgium's trait multiplies its tax
    // collection after that formula has produced ordinary weekly revenue.
    const taxTraitFactor = countryTraitFactorV2(
      bel,
      'tax-efficiency',
      traitNationContextV2(state, bel),
    );
    expect(economy.weeklyRevenue).toBeCloseTo(
      economy.taxableOutput * economy.taxRate / 52 * taxTraitFactor,
      5,
    );
    expect(economy.effectivePopulation).toBe(economy.population);
    expect(economy.baselineProductivePopulation).toBe(economy.population);
    expect(economy.productivePopulationFactor).toBe(1);
    expect(economy.taxableOutput).toBeCloseTo(economy.controlledOutput, 8);
    expect(economy.fiscalReferenceWealthPerPerson).toBeCloseTo(economy.wealthPerPerson, 8);
    expect(economy.taxRate).toBeCloseTo(
      expectedTaxRate(economy.fiscalReferenceWealthPerPerson),
      8,
    );
    expect(economy.taxRate).toBeGreaterThanOrEqual(MIN_NORMALIZED_TAX_RATE_V2);
    expect(economy.taxRate).toBeLessThanOrEqual(MAX_NORMALIZED_TAX_RATE_V2);

    const lowTaxContent = contentWithTaxRate(bel, 0.125);
    const highTaxContent = contentWithTaxRate(bel, 0.25);
    const lowTax = selectNationalEconomyV2(state, lowTaxContent, bel);
    const highTax = selectNationalEconomyV2(state, highTaxContent, bel);
    expect(highTax.output).toBeCloseTo(lowTax.output, 8);
    expect(highTax.weeklyRevenue).toBeCloseTo(lowTax.weeklyRevenue, 8);
  });

  it('moves tax monotonically with live population without changing GDP or eliminating recovery income', () => {
    const baselineState = createWorldStateV2(4_202, WORLD_CONTENT_V2);
    baselineState.wars = [];
    const grownState = structuredClone(baselineState);
    const reducedState = structuredClone(baselineState);
    const collapsedState = structuredClone(baselineState);
    grownState.territories[belTerritory]!.population *= 1.10;
    reducedState.territories[belTerritory]!.population *= 0.80;
    collapsedState.territories[belTerritory]!.population *= 0.01;

    const baseline = selectNationalEconomyV2(baselineState, WORLD_CONTENT_V2, bel);
    const grown = selectNationalEconomyV2(grownState, WORLD_CONTENT_V2, bel);
    const reduced = selectNationalEconomyV2(reducedState, WORLD_CONTENT_V2, bel);
    const collapsed = selectNationalEconomyV2(collapsedState, WORLD_CONTENT_V2, bel);

    for (const economy of [grown, reduced, collapsed]) {
      expect(economy.controlledOutput).toBeCloseTo(baseline.controlledOutput, 8);
      expect(economy.output).toBeCloseTo(baseline.output, 8);
      expect(economy.taxRate).toBeCloseTo(baseline.taxRate, 8);
    }
    expect(grown.wealthPerPerson).toBeCloseTo(baseline.wealthPerPerson / 1.10, 8);
    expect(grown.productivePopulationFactor).toBeCloseTo(1.10, 8);
    expect(reduced.productivePopulationFactor).toBeCloseTo(0.80, 8);
    expect(collapsed.productivePopulationFactor).toBeCloseTo(0.01, 8);
    expect(grown.taxableOutput).toBeCloseTo(baseline.controlledOutput * 1.05, 6);
    expect(reduced.taxableOutput).toBeCloseTo(baseline.controlledOutput * 0.90, 6);
    expect(collapsed.taxableOutput).toBeCloseTo(baseline.controlledOutput * 0.505, 6);
    expect(grown.weeklyRevenue).toBeGreaterThan(baseline.weeklyRevenue);
    expect(reduced.weeklyRevenue).toBeLessThan(baseline.weeklyRevenue);
    expect(collapsed.weeklyRevenue).toBeLessThan(reduced.weeklyRevenue);
    expect(collapsed.weeklyRevenue).toBeGreaterThan(0);
    expect(collapsed.weeklyRevenue).toBeCloseTo(baseline.weeklyRevenue * 0.505, 5);
  });

  it('still raises tax when real GDP grows at fixed population', () => {
    const baselineState = createWorldStateV2(4_207, WORLD_CONTENT_V2);
    const richerState = structuredClone(baselineState);
    richerState.territories[belTerritory]!.economy *= 1.10;

    const baseline = selectNationalEconomyV2(baselineState, WORLD_CONTENT_V2, bel);
    const richer = selectNationalEconomyV2(richerState, WORLD_CONTENT_V2, bel);
    expect(richer.productivePopulationFactor).toBe(1);
    expect(richer.controlledOutput).toBeCloseTo(baseline.controlledOutput * 1.10, 6);
    expect(richer.taxableOutput).toBeCloseTo(richer.controlledOutput, 6);
    expect(richer.fiscalReferenceWealthPerPerson)
      .toBeGreaterThan(baseline.fiscalReferenceWealthPerPerson);
    expect(richer.taxRate).toBeGreaterThanOrEqual(baseline.taxRate);
    expect(richer.weeklyRevenue).toBeGreaterThan(baseline.weeklyRevenue);
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

    const blended = calculateBlendedFiscalCapacityV2(200, 8, 10);
    expect(blended.productivePopulationFactor).toBe(0.8);
    expect(blended.taxableOutput).toBe(180);
    expect(blended.weeklyTaxRevenue).toBeCloseTo(
      blended.taxableOutput * blended.dynamicTaxRate / 52,
      8,
    );
  });

  it('keeps every country rate between 10% and 20% and every result finite', () => {
    expect(calculateFiscalCapacityV2(1, 0).dynamicTaxRate).toBe(MIN_NORMALIZED_TAX_RATE_V2);
    expect(calculateFiscalCapacityV2(1, 1e-12).dynamicTaxRate).toBeCloseTo(MIN_NORMALIZED_TAX_RATE_V2, 8);
    expect(calculateFiscalCapacityV2(1, 1e12).dynamicTaxRate).toBe(MAX_NORMALIZED_TAX_RATE_V2);

    const state = createWorldStateV2(4_206, WORLD_CONTENT_V2);
    for (const id of WORLD_CONTENT_V2.nationIds) {
      const economy = selectNationalEconomyV2(state, WORLD_CONTENT_V2, id);
      const ledger = selectEconomicOutputLedgerV2(state, WORLD_CONTENT_V2, id);
      expect(Number.isFinite(economy.effectivePopulation), String(id)).toBe(true);
      expect(Number.isFinite(economy.baselineProductivePopulation), String(id)).toBe(true);
      expect(Number.isFinite(economy.productivePopulationFactor), String(id)).toBe(true);
      expect(Number.isFinite(economy.wealthPerPerson), String(id)).toBe(true);
      expect(Number.isFinite(economy.fiscalReferenceWealthPerPerson), String(id)).toBe(true);
      expect(Number.isFinite(economy.taxableOutput), String(id)).toBe(true);
      expect(Number.isFinite(economy.dynamicTaxRate), String(id)).toBe(true);
      expect(Number.isFinite(economy.weeklyRevenue), String(id)).toBe(true);
      expect(economy.controlledOutput, String(id)).toBe(ledger.integratedOutput);
      expect(economy.dynamicTaxRate, String(id)).toBeGreaterThanOrEqual(MIN_NORMALIZED_TAX_RATE_V2);
      expect(economy.dynamicTaxRate, String(id)).toBeLessThanOrEqual(MAX_NORMALIZED_TAX_RATE_V2);
    }
  });

  it('uses canonical automatic income plus a diminishing small-rich-state buffer for starting treasury', () => {
    const state = createWorldStateV2(4_203, WORLD_CONTENT_V2);
    for (const id of WORLD_CONTENT_V2.nationIds) {
      if (!isHumanSelectableNationV2(WORLD_CONTENT_V2, id)) continue;
      const real = WORLD_CONTENT_V2.nations[id]!.real;
      const fiscal = calculateBlendedFiscalCapacityV2(real.gdp, real.population, real.population);
      const weeklyRevenue = fiscal.weeklyTaxRevenue;
      const gdpPerCapita = real.gdp / Math.max(0.01, real.population) * 1_000;
      const wealthTier = Math.min(4, Math.max(0, Math.log2(Math.max(10_000, gdpPerCapita) / 10_000)));
      const sizeDamping = 1 / Math.sqrt(Math.max(1, real.gdp / 500));
      const startingCashWeeks = Math.min(9, Math.max(2, 2 + 2.25 * wealthTier * sizeDamping));
      // The minimum/cash-weeks calculation is shared by every country. Country
      // traits no longer add one-off starting cash.
      const traitFactor = countryTraitFactorV2(id, 'starting-treasury');
      expect(traitFactor, String(id)).toBe(1);
      const expected = Math.round(
        Math.max(0.10, weeklyRevenue * startingCashWeeks) * traitFactor * 1_000,
      ) / 1_000;
      expect(state.players[id]!.treasury, String(id)).toBe(expected);
    }
    expect(state.players[ROGUE_AI_NATION_ID_V2]!.treasury).toBe(8_000);
    const qatarWeeks = state.players[qat]!.treasury
      / calculateBlendedFiscalCapacityV2(
        WORLD_CONTENT_V2.nations[qat]!.real.gdp,
        WORLD_CONTENT_V2.nations[qat]!.real.population,
        WORLD_CONTENT_V2.nations[qat]!.real.population,
      ).weeklyTaxRevenue;
    const usaWeeks = state.players[usa]!.treasury
      / calculateBlendedFiscalCapacityV2(
        WORLD_CONTENT_V2.nations[usa]!.real.gdp,
        WORLD_CONTENT_V2.nations[usa]!.real.population,
        WORLD_CONTENT_V2.nations[usa]!.real.population,
      ).weeklyTaxRevenue;
    expect(qatarWeeks).toBeGreaterThan(usaWeeks * 2);
    expect(usaWeeks).toBeLessThan(4);
  });

  it('charges the full real army footprint instead of making large forces free above a revenue cap', () => {
    const state = createWorldStateV2(4_204, WORLD_CONTENT_V2);
    state.wars = [];
    // Isolate paid standing-force upkeep from the selected country's temporary
    // free opening force/capacity entitlement.
    state.tick = OPENING_ARMY_BONUS_DURATION_TICKS_V2;
    state.players[bel].openingArmyBonus = null;
    const before = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, bel);
    const army = state.territories[belTerritory]!.army;
    army.manpower *= 100;
    army.capacity *= 100;
    const enlarged = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, bel);

    expect(enlarged.armyUpkeep).toBeGreaterThan(before.armyUpkeep * 80);
    expect(enlarged.armyUpkeep).toBeGreaterThan(enlarged.revenue * 0.30);
    expect(enlarged.mandatoryFundingRatio).toBeLessThan(1);
  });

  it('keeps retired commodity fields neutral while military spending uses real cash', () => {
    const state = createWorldStateV2(4_205, WORLD_CONTENT_V2);
    state.wars = [];
    for (const id of WORLD_CONTENT_V2.nationIds) {
      const finance = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, id);
      expect(finance.foodProduction, String(id)).toBe(0);
      expect(finance.foodDemand, String(id)).toBe(0);
      expect(finance.foodExportIncome, String(id)).toBe(0);
      expect(finance.foodCoverage, String(id)).toBe(1);
      expect(Number.isFinite(finance.mandatoryFundingRatio), String(id)).toBe(true);
    }

    const unitedStates = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, usa);
    expect(unitedStates.armyUpkeep / unitedStates.revenue).toBeGreaterThan(0.14);
    // A healthy country now deliberately retains part of ordinary cashflow as
    // a war chest instead of spending almost every dollar each week.
    expect(unitedStates.net / unitedStates.revenue).toBeGreaterThan(0.04);
    expect(unitedStates.net / unitedStates.revenue).toBeLessThan(0.15);
  });
});
