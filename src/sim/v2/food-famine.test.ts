import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { processEconomyV2 } from './economy';
import {
  selectPopulationDynamicsV2,
  selectTerritoriesOfV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import { nationIdV2 } from './types';

describe('progressive famine mortality', () => {
  it('shows a real negative food balance and population decline in the Central African Republic', () => {
    const state = createWorldStateV2(72_001);
    const centralAfricanRepublic = nationIdV2('caf');
    state.humanPlayerId = centralAfricanRepublic;
    state.humanPlayerIds = [centralAfricanRepublic];
    state.wars = [];
    state.players[centralAfricanRepublic].treasury = 0;
    state.players[centralAfricanRepublic].foodStock = 0;

    const finance = selectWeeklyFinanceBreakdownV2(
      state, WORLD_CONTENT_V2, centralAfricanRepublic,
    );
    const demographics = selectPopulationDynamicsV2(
      state, WORLD_CONTENT_V2, centralAfricanRepublic,
    );
    expect(finance.foodCoverage).toBeLessThan(0.75);
    expect(finance.foodBalance).toBeLessThan(0);
    expect(demographics.annualNetRate).toBeLessThan(0);

    const populationBefore = selectTerritoriesOfV2(state, centralAfricanRepublic)
      .reduce((sum, territory) => sum + territory.population, 0);
    processEconomyV2(state, WORLD_CONTENT_V2);
    const populationAfter = selectTerritoriesOfV2(state, centralAfricanRepublic)
      .reduce((sum, territory) => sum + territory.population, 0);
    expect(populationAfter).toBeLessThan(populationBefore);
  });

  it('raises deaths and lowers net growth progressively as hunger deepens', () => {
    const country = nationIdV2('caf');
    const rates = [0.85, 0.60, 0.30].map((foodSecurity, index) => {
      const state = createWorldStateV2(72_010 + index);
      state.wars = [];
      state.players[country].foodSecurity = foodSecurity;
      state.players[country].foodStock = 0;
      return selectPopulationDynamicsV2(state, WORLD_CONTENT_V2, country, 0, 100);
    });
    expect(rates[1].annualDeathRate).toBeGreaterThan(rates[0].annualDeathRate);
    expect(rates[2].annualDeathRate).toBeGreaterThan(rates[1].annualDeathRate);
    expect(rates[1].annualNetRate).toBeLessThan(rates[0].annualNetRate);
    expect(rates[2].annualNetRate).toBeLessThan(rates[1].annualNetRate);
    expect(rates[2].annualNetRate).toBeLessThan(0);
  });
});
