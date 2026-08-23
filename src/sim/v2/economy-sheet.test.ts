import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import {
  selectControlledPopulationV2,
  selectEconomicOutputLedgerV2,
  selectNationalEconomyV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import { traitNationContextV2 } from './traitContext';
import { countryTraitFactorV2 } from './traits';
import { nationIdV2, territoryIdV2 } from './types';

describe('V2 economic truth sheet', () => {
  it('derives public income from the blended tax base while preserving real GDP', () => {
    const state = createWorldStateV2(8_201);
    const belgium = nationIdV2('bel');
    const ledger = selectEconomicOutputLedgerV2(state, WORLD_CONTENT_V2, belgium);
    const economy = selectNationalEconomyV2(state, WORLD_CONTENT_V2, belgium);
    // Preserve the economic identity: the blended base and rate are canonical,
    // while Belgium's active trait is the final tax-efficiency multiplier.
    const taxTraitFactor = countryTraitFactorV2(
      belgium,
      'tax-efficiency',
      traitNationContextV2(state, belgium),
    );

    expect(ledger.weeklyTaxRevenue).toBeCloseTo(
      ledger.taxableOutput * ledger.taxRate / 52 * taxTraitFactor,
      5,
    );
    expect(ledger.baselineProductivePopulation).toBeCloseTo(ledger.productivePopulation, 6);
    expect(ledger.productivePopulationFactor).toBe(1);
    expect(ledger.taxableOutput).toBeCloseTo(ledger.integratedOutput, 6);
    expect(ledger.taxRate).toBe(ledger.dynamicTaxRate);
    expect(economy.population).toBeCloseTo(ledger.population, 6);
    expect(economy.effectivePopulation).toBeCloseTo(ledger.effectivePopulation, 6);
    expect(economy.wealthPerPerson).toBeCloseTo(ledger.wealthPerPerson, 6);
    expect(economy.output).toBeCloseTo(ledger.demographicOutput, 6);
    expect(economy.controlledOutput).toBeCloseTo(ledger.integratedOutput, 6);
    expect(economy.taxableOutput).toBeCloseTo(ledger.taxableOutput, 6);
    expect(economy.weeklyRevenue).toBeCloseTo(ledger.weeklyTaxRevenue, 6);
  });

  it('scales the taxable conquest base with integration without condition or war modifiers', () => {
    const state = createWorldStateV2(8_202);
    const control = createWorldStateV2(8_202);
    const belgium = nationIdV2('bel');
    const netherlands = nationIdV2('nld');
    const luxembourg = territoryIdV2('lux');

    state.territories[luxembourg]!.owner = belgium;
    control.territories[luxembourg]!.owner = belgium;
    state.territories[luxembourg]!.condition = 0.42;
    state.territories[luxembourg]!.integration = 0.20;
    state.wars.push({
      id: 'war-economic-sheet', attackerId: belgium, defenderId: netherlands,
      startedTick: 0, lastBattleTick: 0, warScore: 0, battles: 0,
      attackerLosses: 0, defenderLosses: 0, lastPeaceOfferTick: -1,
      attackerOperations: [], defenderOperations: [],
    });

    const ledger = selectEconomicOutputLedgerV2(state, WORLD_CONTENT_V2, belgium);
    const controlLedger = selectEconomicOutputLedgerV2(control, WORLD_CONTENT_V2, belgium);
    const finance = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    expect(ledger.population).toBe(controlLedger.population);
    expect(ledger.productivePopulation).toBeLessThan(ledger.population);
    expect(ledger.productivePopulation).toBeCloseTo(
      state.territories[territoryIdV2('bel')]!.population
        + state.territories[luxembourg]!.population * 0.20,
      6,
    );
    expect(ledger.effectivePopulation).toBeCloseTo(ledger.productivePopulation, 6);
    expect(ledger.conditionAdjustedOutput).toBe(ledger.demographicOutput);
    expect(ledger.demographicOutput).toBe(controlLedger.demographicOutput);
    expect(ledger.integratedOutput).toBeCloseTo(
      state.territories[territoryIdV2('bel')]!.economy
        + state.territories[luxembourg]!.economy * 0.20,
      6,
    );
    expect(ledger.taxableOutput).toBeCloseTo(ledger.integratedOutput, 6);
    expect(ledger.warAdjustedOutput).toBe(ledger.integratedOutput);
    expect(ledger.warOutputPenalty).toBe(0);
    expect(ledger.weeklyTaxRevenue).toBeLessThan(controlLedger.weeklyTaxRevenue);
    expect(finance.revenue).toBeCloseTo(ledger.weeklyTaxRevenue, 6);
    expect(finance.net).toBeCloseTo(
      finance.revenue + finance.ceasefireIncome - finance.expenses,
      5,
    );
  });

  it('unlocks only ten percent of conquered residents while retaining the gross local population', () => {
    const state = createWorldStateV2(8_203);
    const belgium = nationIdV2('bel');
    const luxembourg = territoryIdV2('lux');
    const homePopulation = state.territories[territoryIdV2('bel')]!.population;
    const residentPopulation = state.territories[luxembourg]!.population;

    state.territories[luxembourg]!.owner = belgium;
    state.territories[luxembourg]!.integration = 0.10;

    const ledger = selectEconomicOutputLedgerV2(state, WORLD_CONTENT_V2, belgium);
    expect(ledger.population).toBeCloseTo(homePopulation + residentPopulation, 6);
    expect(selectControlledPopulationV2(state, belgium)).toBeCloseTo(
      homePopulation + residentPopulation * 0.10,
      6,
    );
    expect(ledger.productivePopulation).toBeCloseTo(
      selectControlledPopulationV2(state, belgium),
      6,
    );
  });
});
