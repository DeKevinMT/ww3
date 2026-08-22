import { describe, expect, it } from 'vitest';
import { BASE_OPERATING_COST_TAX_REVENUE_SHARE } from './balance';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import {
  selectOpeningCandidateFinancePlansV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import { nationIdV2, territoryIdV2 } from './types';

describe('universal base operating cost', () => {
  it('charges every country exactly 20% of ordinary weekly tax revenue', () => {
    const state = createWorldStateV2(72_001);
    const plans = selectOpeningCandidateFinancePlansV2(state, WORLD_CONTENT_V2);
    expect(plans.size).toBe(WORLD_CONTENT_V2.nationIds.length);
    for (const finance of plans.values()) {
      expect(finance.baseOperatingCost).toBeCloseTo(
        finance.revenue * BASE_OPERATING_COST_TAX_REVENUE_SHARE,
        6,
      );
    }
  });

  it('is selection-independent and leaves the other 80% as the tax basis for ordinary programs', () => {
    const state = createWorldStateV2(72_002);
    const belgium = nationIdV2('bel');
    const before = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    state.humanPlayerId = belgium;
    const after = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);

    expect(after.baseOperatingCost).toBe(before.baseOperatingCost);
    expect(after.net).toBe(before.net);
    expect(after.baseOperatingCost).toBeCloseTo(after.revenue * 0.20, 6);
    expect(after.revenue - after.baseOperatingCost).toBeCloseTo(after.revenue * 0.80, 6);
  });

  it('counts the operating cost exactly once in expenses, net cash and debt', () => {
    const state = createWorldStateV2(72_003);
    const belgium = nationIdV2('bel');
    state.players[belgium]!.treasury = -10;
    const finance = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    const spentBeforePremium = finance.baseOperatingCost
      + finance.ceasefirePayment
      + finance.integrationCost
      + finance.foodProduction
      + finance.military
      + finance.research
      + finance.development
      + finance.warOperations;
    const income = finance.revenue + finance.ceasefireIncome + finance.foodExportIncome;

    expect(finance.expenses).toBeCloseTo(spentBeforePremium + finance.debtPremium, 5);
    expect(finance.net).toBeCloseTo(income - spentBeforePremium - finance.debtPremium, 5);
    expect(finance.closingTreasury).toBeCloseTo(
      state.players[belgium]!.treasury + finance.net,
      5,
    );
    expect(Number.isFinite(finance.closingTreasury)).toBe(true);
  });

  it('remains exactly 20% when population damage lowers the blended tax base', () => {
    const state = createWorldStateV2(72_004);
    const belgium = nationIdV2('bel');
    const before = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    state.territories[territoryIdV2('bel')]!.population *= 0.50;
    const after = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);

    expect(after.revenue).toBeLessThan(before.revenue);
    expect(after.baseOperatingCost).toBeLessThan(before.baseOperatingCost);
    expect(after.baseOperatingCost).toBeCloseTo(
      after.revenue * BASE_OPERATING_COST_TAX_REVENUE_SHARE,
      6,
    );
  });
});
