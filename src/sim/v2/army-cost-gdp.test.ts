import { describe, expect, it } from 'vitest';
import {
  countryInteriorOperationMultiplierV2,
  WAR_OPERATION_COST_PER_MILLION,
  WAR_OPERATION_REVENUE_SHARE,
} from './balance';
import { createWorldStateV2 } from './bootstrap';
import {
  WORLD_CONTENT_V2,
  territoryTerrainOperationCostMultiplierV2,
} from './content';
import {
  armyCostOfLivingFactorFromWealthV2,
  selectArmyCostOfLivingFactorV2,
  selectRecruitmentUnitCostV2,
  selectTotalManpowerV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import { nationIdV2, territoryIdV2 } from './types';
import { declareWarV2 } from './war';

describe('GDP-per-capita military costs', () => {
  it('uses one bounded local-cost curve for poor mass armies and rich elite forces', () => {
    expect(armyCostOfLivingFactorFromWealthV2(0)).toBe(0.58);
    expect(armyCostOfLivingFactorFromWealthV2(40)).toBe(1);
    expect(armyCostOfLivingFactorFromWealthV2(160)).toBe(1.45);
    expect(armyCostOfLivingFactorFromWealthV2(Number.POSITIVE_INFINITY)).toBe(1.45);
  });

  it('makes North Korea materially cheaper per soldier without making its army free', () => {
    const state = createWorldStateV2(82_024);
    const northKorea = nationIdV2('prk');
    const unitedStates = nationIdV2('usa');
    const northKoreanFactor = selectArmyCostOfLivingFactorV2(
      state, WORLD_CONTENT_V2, northKorea,
    );
    const unitedStatesFactor = selectArmyCostOfLivingFactorV2(
      state, WORLD_CONTENT_V2, unitedStates,
    );
    const northKoreanFinance = selectWeeklyFinanceBreakdownV2(
      state, WORLD_CONTENT_V2, northKorea,
    );
    const realWeeklyDefence = WORLD_CONTENT_V2.nations[northKorea].real.defenceSpending / 52;

    expect(northKoreanFactor).toBeGreaterThanOrEqual(0.58);
    expect(northKoreanFactor).toBeLessThan(0.75);
    expect(unitedStatesFactor).toBeGreaterThan(1.15);
    expect(northKoreanFactor).toBeLessThan(unitedStatesFactor);
    expect(northKoreanFinance.armyUpkeep).toBeGreaterThan(0);
    expect(northKoreanFinance.armyUpkeep).toBeLessThan(realWeeklyDefence * 0.75);
    expect(selectRecruitmentUnitCostV2(state, northKorea, WORLD_CONTENT_V2))
      .toBeLessThan(selectRecruitmentUnitCostV2(state, unitedStates, WORLD_CONTENT_V2));
  });

  it('applies North Korea’s local-cost factor to the manpower part of active war operations', () => {
    const state = createWorldStateV2(82_025);
    const northKorea = nationIdV2('prk');
    const southKorea = nationIdV2('kor');
    state.wars = [];
    state.players[northKorea].treasury = 1_000;
    expect(declareWarV2(state, WORLD_CONTENT_V2, northKorea, southKorea))
      .toEqual({ accepted: true });

    const factor = selectArmyCostOfLivingFactorV2(state, WORLD_CONTENT_V2, northKorea);
    const deployed = selectTotalManpowerV2(state, northKorea).deployed;
    const finance = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, northKorea);
    const targetTerrainCost = territoryTerrainOperationCostMultiplierV2(
      WORLD_CONTENT_V2,
      territoryIdV2('kor'),
    );
    const expectedOneLandFrontCost = finance.revenue * WAR_OPERATION_REVENUE_SHARE
      + deployed * WAR_OPERATION_COST_PER_MILLION * factor;
    const sourceInteriorCost = countryInteriorOperationMultiplierV2(
      WORLD_CONTENT_V2.territories[territoryIdV2('prk')].baseline.landArea,
    );

    expect(finance.warOperations).toBeGreaterThan(0);
    expect(finance.warOperations).toBeCloseTo(
      expectedOneLandFrontCost * targetTerrainCost * sourceInteriorCost,
      5,
    );
  });
});
