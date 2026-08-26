import { describe, expect, it } from 'vitest';
import { aiIntegrationBudgetPressureV2 } from './ai';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import {
  beginTerritoryIntegrationV2,
  territoryIntegrationWeeklyCostV2,
} from './integration';
import { selectNationalEconomyV2, selectWeeklyFinanceBreakdownV2 } from './selectors';
import { nationIdV2, territoryIdV2 } from './types';

const belgium = nationIdV2('bel');
const luxembourg = nationIdV2('lux');
const luxembourgTerritory = territoryIdV2('lux');

describe('V2 integration administration cost', () => {
  it('charges 3% of captured local output per year for the full unfinished calendar', () => {
    const state = createWorldStateV2(8_225);
    state.firstIntegrationDiscountUsedBy = [belgium];
    beginTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      luxembourgTerritory,
      belgium,
    );
    const territory = state.territories[luxembourgTerritory]!;
    const opening = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    const expected = territory.economy * 0.03 / 52;

    expect(territory.integrationProgram?.annualCost).toBeCloseTo(
      territory.economy * 0.03,
      8,
    );
    expect(opening.integrationCost).toBeCloseTo(expected, 6);
    expect(opening.integrationCost).toBeCloseTo(
      territoryIntegrationWeeklyCostV2(territory.economy),
      6,
    );
    expect(opening.expenses).toBeGreaterThan(opening.integrationCost);
    expect(opening.net).toBeCloseTo(
      opening.revenue + opening.ceasefireIncome - opening.expenses,
      5,
    );

    territory.integration = 0.75;
    territory.economy *= 1.75;
    const late = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    expect(late.integrationCost).toBeCloseTo(expected, 6);

    territory.integration = 1;
    territory.coreOwner = belgium;
    delete territory.integrationProgram;
    expect(selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium).integrationCost)
      .toBe(0);
  });

  it('stops charging when the original sovereign core recaptures its land', () => {
    const state = createWorldStateV2(8_226);
    beginTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      luxembourgTerritory,
      belgium,
    );
    expect(selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium).integrationCost)
      .toBeGreaterThan(0);

    beginTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      luxembourgTerritory,
      luxembourg,
    );

    expect(selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium).integrationCost)
      .toBe(0);
    expect(selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, luxembourg).integrationCost)
      .toBe(0);
  });

  it('reserves integration administration before AI programmes can spend the same revenue', () => {
    const state = createWorldStateV2(8_227);
    beginTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      luxembourgTerritory,
      belgium,
    );
    const economy = selectNationalEconomyV2(state, WORLD_CONTENT_V2, belgium);
    state.territories[luxembourgTerritory]!.integrationProgram!.annualCost
      = economy.weeklyRevenue * 52 * 0.25;
    const preview = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    state.players[belgium]!.foodStock = preview.foodStorageCapacity;
    state.players[belgium]!.foodSecurity = 1;
    state.players[belgium]!.treasury = 0;
    const withoutCost = structuredClone(state);
    withoutCost.territories[luxembourgTerritory]!.integrationProgram!.annualCost = 0;

    const reserved = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    const unreserved = selectWeeklyFinanceBreakdownV2(withoutCost, WORLD_CONTENT_V2, belgium);
    const programmeSpend = (finance: typeof reserved) => (
      finance.military + finance.research + finance.development
    );

    expect(reserved.integrationCost).toBeCloseTo(economy.weeklyRevenue * 0.25, 5);
    expect(programmeSpend(reserved)).toBeLessThan(programmeSpend(unreserved));
    expect(programmeSpend(unreserved) - programmeSpend(reserved))
      .toBeGreaterThan(reserved.integrationCost * 0.50);
    expect(unreserved.closingTreasury - reserved.closingTreasury)
      .toBeLessThan(reserved.integrationCost * 0.50);
  });

  it('makes AI expansion progressively respect recurring integration burden', () => {
    expect(aiIntegrationBudgetPressureV2(0, 10, 2)).toEqual({
      burden: 0,
      blocksExpansion: false,
      additionalRunwayWeeks: 0,
    });
    expect(aiIntegrationBudgetPressureV2(2, 10, 5)).toMatchObject({
      burden: 0.2,
      blocksExpansion: true,
      additionalRunwayWeeks: 4,
    });
    expect(aiIntegrationBudgetPressureV2(4.5, 10, 20)).toMatchObject({
      burden: 0.45,
      blocksExpansion: true,
      additionalRunwayWeeks: 9,
    });
  });
});
