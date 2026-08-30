import { describe, expect, it } from 'vitest';
import { BASE_OPERATING_COST_TAX_REVENUE_SHARE } from './balance';
import { createWorldStateV2 } from './bootstrap';
import { isRogueAiNationV2, WORLD_CONTENT_V2 } from './content';
import {
  selectOpeningCandidateFinancePlansV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import { traitNationContextV2 } from './traitContext';
import { countryTraitFactorV2 } from './traits';
import { nationIdV2, territoryIdV2 } from './types';

describe('universal base operating cost', () => {
  it('starts every ordinary country at 20% of weekly tax revenue before its trait', () => {
    const state = createWorldStateV2(72_001);
    const plans = selectOpeningCandidateFinancePlansV2(state, WORLD_CONTENT_V2);
    expect(plans.size).toBe(WORLD_CONTENT_V2.nationIds.length);
    for (const [playerId, finance] of plans) {
      if (isRogueAiNationV2(WORLD_CONTENT_V2, playerId)) continue;
      // Twenty percent remains the canonical rule. A country's own active
      // trait is a final multiplier, never a replacement hidden in content.
      const traitFactor = countryTraitFactorV2(
        playerId,
        'base-operating-cost',
        traitNationContextV2(state, playerId),
      );
      expect(finance.baseOperatingCost).toBeCloseTo(
        finance.revenue * BASE_OPERATING_COST_TAX_REVENUE_SHARE * traitFactor,
        6,
      );
    }
    const roguePlan = plans.get(nationIdV2('rai'))!;
    expect(roguePlan.baseOperatingCost).toBeLessThan(
      roguePlan.revenue * BASE_OPERATING_COST_TAX_REVENUE_SHARE,
    );
  });

  it('keeps one selected trait and amplifies Belgium\'s lower overhead for human control', () => {
    const state = createWorldStateV2(72_002);
    const belgium = nationIdV2('bel');
    const before = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    state.humanPlayerId = belgium;
    const after = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    const effectiveShare = BASE_OPERATING_COST_TAX_REVENUE_SHARE
      * countryTraitFactorV2(
        belgium,
        'base-operating-cost',
        traitNationContextV2(state, belgium),
      );

    expect(after.baseOperatingCost).toBe(before.baseOperatingCost);
    expect(after.net).toBe(before.net);
    expect(effectiveShare).toBeCloseTo(
      BASE_OPERATING_COST_TAX_REVENUE_SHARE * countryTraitFactorV2(
        belgium, 'base-operating-cost', { humanControlled: true },
      ),
      8,
    );
    expect(after.baseOperatingCost).toBeCloseTo(after.revenue * effectiveShare, 6);
    expect(after.revenue - after.baseOperatingCost)
      .toBeCloseTo(after.revenue * (1 - effectiveShare), 6);
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

  it('keeps the same canonical share and trait factor after population damage', () => {
    const state = createWorldStateV2(72_004);
    const belgium = nationIdV2('bel');
    const before = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    state.territories[territoryIdV2('bel')]!.population *= 0.50;
    const after = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    const traitFactor = countryTraitFactorV2(
      belgium,
      'base-operating-cost',
      traitNationContextV2(state, belgium),
    );

    expect(after.revenue).toBeLessThan(before.revenue);
    expect(after.baseOperatingCost).toBeLessThan(before.baseOperatingCost);
    expect(after.baseOperatingCost).toBeCloseTo(
      after.revenue * BASE_OPERATING_COST_TAX_REVENUE_SHARE * traitFactor,
      6,
    );
  });
});
