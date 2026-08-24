import { describe, expect, it } from 'vitest';
import { planAiCommandsV2 } from './ai';
import {
  AI_EXCESS_TREASURY_GDP_THRESHOLD_SHARE,
  AI_EXCESS_TREASURY_WEEKLY_REVENUE_CAP,
  excessTreasuryInvestmentV2,
} from './balance';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { nationalAiTreasuryPolicyV2 } from './nationalAi';
import { selectNationalEconomyV2, selectWeeklyFinanceBreakdownV2 } from './selectors';
import { nationIdV2, type WeeklyFinanceBreakdownV2 } from './types';

function discretionaryCashflow(plan: WeeklyFinanceBreakdownV2): number {
  return plan.revenue + plan.foodExportIncome
    - plan.baseOperatingCost - plan.foodProduction + plan.foodDevelopmentTransfer;
}

function recurringProgramEnvelope(plan: WeeklyFinanceBreakdownV2): number {
  return plan.military + plan.research + plan.development + plan.foodDevelopmentTransfer;
}

function productiveCivilianInvestment(plan: WeeklyFinanceBreakdownV2): number {
  return plan.research + plan.development + plan.foodDevelopmentTransfer;
}

describe('shared national-AI spending discipline', () => {
  it('uses IQ for bounded treasury judgement and adds runway per active front', () => {
    const lowIqPeace = nationalAiTreasuryPolicyV2(80, 0, 0.5);
    const highIqPeace = nationalAiTreasuryPolicyV2(108, 0, 0.5);
    const oneFront = nationalAiTreasuryPolicyV2(100, 1, 0.5);
    const twoFronts = nationalAiTreasuryPolicyV2(100, 2, 0.5);

    expect(highIqPeace.reserveWeeks).toBeGreaterThan(lowIqPeace.reserveWeeks);
    expect(highIqPeace.freeCashflowShare).toBeGreaterThan(lowIqPeace.freeCashflowShare);
    expect(highIqPeace.reserveWeeks / lowIqPeace.reserveWeeks).toBeLessThan(1.25);
    expect(oneFront.reserveWeeks).toBeGreaterThan(highIqPeace.reserveWeeks);
    expect(twoFronts.reserveWeeks).toBeGreaterThan(oneFront.reserveWeeks);
    expect(oneFront.freeCashflowShare).toBeGreaterThan(highIqPeace.freeCashflowShare);
  });

  it('builds the emergency reserve gradually and keeps a funded cash contribution', () => {
    const state = createWorldStateV2(91_001);
    const belgium = nationIdV2('bel');
    state.players[belgium]!.treasury = 0;

    const building = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    const economyScale = Math.max(0, Math.min(1, Math.log10(building.revenue + 1) / 2));
    const policy = nationalAiTreasuryPolicyV2(
      WORLD_CONTENT_V2.nations[belgium]!.iqScore,
      0,
      economyScale,
    );
    const buildingCashflow = discretionaryCashflow(building);
    expect(building.reserveTarget).toBeCloseTo(building.revenue * policy.reserveWeeks, 6);
    expect(recurringProgramEnvelope(building)).toBeCloseTo(
      buildingCashflow * (1 - policy.freeCashflowShare),
      5,
    );
    expect(building.net).toBeCloseTo(buildingCashflow * policy.freeCashflowShare, 5);

    state.players[belgium]!.treasury = building.reserveTarget * 2;
    const funded = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    const fundedCashflow = discretionaryCashflow(funded);
    expect(recurringProgramEnvelope(funded)).toBeCloseTo(fundedCashflow * 0.95, 5);
    expect(funded.net).toBeCloseTo(fundedCashflow * 0.05, 5);
  });

  it('starts GDP-scale excess-cash investment smoothly above ten percent', () => {
    const state = createWorldStateV2(91_003);
    const netherlands = nationIdV2('nld');
    const economy = selectNationalEconomyV2(state, WORLD_CONTENT_V2, netherlands);
    const threshold = economy.controlledOutput * AI_EXCESS_TREASURY_GDP_THRESHOLD_SHARE;

    state.players[netherlands]!.treasury = threshold - economy.controlledOutput * 0.001;
    const below = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, netherlands);
    state.players[netherlands]!.treasury = threshold + economy.controlledOutput * 0.001;
    const justAbove = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, netherlands);
    state.players[netherlands]!.treasury = threshold + economy.controlledOutput * 0.025;
    const halfwayUpRamp = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, netherlands);

    expect(below.excessCashInvestment).toBe(0);
    expect(justAbove.excessCashInvestment).toBeGreaterThan(0);
    expect(justAbove.excessCashInvestment).toBeLessThan(halfwayUpRamp.excessCashInvestment);
    expect(justAbove.excessCashInvestment).toBeCloseTo(excessTreasuryInvestmentV2(
      threshold + economy.controlledOutput * 0.001,
      economy.controlledOutput,
      economy.weeklyRevenue,
    ).weeklyDraw, 6);
    expect(justAbove.excessCashInvestment).toBeLessThan(economy.weeklyRevenue * 0.01);

    state.humanPlayerId = netherlands;
    state.humanPlayerIds = [netherlands];
    state.players[netherlands]!.treasury = threshold + economy.controlledOutput;
    const apex = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, netherlands);
    expect(apex.excessCashInvestment).toBeGreaterThan(0);
    expect(apex.excessCashInvestment).toBeCloseTo(excessTreasuryInvestmentV2(
      state.players[netherlands]!.treasury,
      economy.controlledOutput,
      economy.weeklyRevenue,
    ).weeklyDraw, 6);
  });

  it('draws very large AI cash piles gradually into useful recurring programmes', () => {
    const state = createWorldStateV2(91_004);
    const netherlands = nationIdV2('nld');
    const economy = selectNationalEconomyV2(state, WORLD_CONTENT_V2, netherlands);
    const threshold = economy.controlledOutput * AI_EXCESS_TREASURY_GDP_THRESHOLD_SHARE;
    state.players[netherlands]!.treasury = threshold;
    const fundedBuffer = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, netherlands);

    state.players[netherlands]!.treasury = threshold + economy.controlledOutput * 0.50;
    const invested = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, netherlands);

    expect(invested.excessCashInvestment).toBeCloseTo(
      invested.revenue * AI_EXCESS_TREASURY_WEEKLY_REVENUE_CAP,
      6,
    );
    expect(invested.excessCashInvestment)
      .toBeLessThanOrEqual(invested.revenue * AI_EXCESS_TREASURY_WEEKLY_REVENUE_CAP + 0.000001);
    expect(recurringProgramEnvelope(invested)).toBeGreaterThan(recurringProgramEnvelope(fundedBuffer));
    expect(productiveCivilianInvestment(invested))
      .toBeGreaterThan(productiveCivilianInvestment(fundedBuffer));
    expect(invested.closingTreasury).toBeLessThan(state.players[netherlands]!.treasury);
  });

  it('routes a full army surplus away from useless standing operations', () => {
    const state = createWorldStateV2(91_005);
    const netherlands = nationIdV2('nld');
    for (const territory of Object.values(state.territories)) {
      if (territory.owner === netherlands) territory.army.manpower = territory.army.capacity;
    }
    const reserveProbe = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, netherlands);
    state.players[netherlands]!.trainedReserves = reserveProbe.trainedReserveCapacity;
    const economy = selectNationalEconomyV2(state, WORLD_CONTENT_V2, netherlands);
    const threshold = economy.controlledOutput * AI_EXCESS_TREASURY_GDP_THRESHOLD_SHARE;
    state.players[netherlands]!.treasury = threshold;
    const fundedBuffer = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, netherlands);
    state.players[netherlands]!.treasury = threshold + economy.controlledOutput;
    const invested = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, netherlands);

    expect(invested.excessCashInvestment).toBeGreaterThan(0);
    expect(invested.military).toBeCloseTo(fundedBuffer.military, 6);
    expect(invested.standingOperations).toBeCloseTo(fundedBuffer.standingOperations, 6);
    expect(productiveCivilianInvestment(invested) - productiveCivilianInvestment(fundedBuffer))
      .toBeCloseTo(invested.excessCashInvestment, 5);
  });

  it('never turns AI or selected-country APEX cash into manual purchase commands', () => {
    const base = createWorldStateV2(91_002);
    const belgium = nationIdV2('bel');
    const netherlands = nationIdV2('nld');
    base.tick = 104;
    base.aiEscalation.lastWarStartTick = 1_000_000;
    base.players[netherlands]!.treasury = 1_000_000;
    for (const territory of Object.values(base.territories)) {
      if (territory.owner === netherlands) territory.army.manpower = territory.army.capacity * 0.05;
    }

    const asRival = structuredClone(base);
    const asSelected = structuredClone(base);
    asRival.humanPlayerId = belgium;
    asSelected.humanPlayerId = netherlands;
    const manualPurchases = new Set(['rapid-recruitment', 'research-surge', 'launch-propaganda']);

    expect(planAiCommandsV2(asRival, WORLD_CONTENT_V2)
      .filter((command) => manualPurchases.has(command.type))).toEqual([]);
    expect(planAiCommandsV2(asSelected, WORLD_CONTENT_V2)
      .filter((command) => manualPurchases.has(command.type))).toEqual([]);
    const regularFinance = selectWeeklyFinanceBreakdownV2(base, WORLD_CONTENT_V2, netherlands);
    expect(regularFinance.passiveRecruitment + regularFinance.acceleratedRecruitment).toBeGreaterThan(0);
  });
});
