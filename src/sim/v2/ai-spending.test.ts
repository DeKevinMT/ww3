import { describe, expect, it } from 'vitest';
import {
  AI_EARTH_DEFENSE_MILITARY_PRIORITY_V2,
  aiEarthDefenseMilitaryPriorityV2,
  aiSuspicionMilitaryPriorityV2,
  autonomousAiVsAiWarCapV2,
  planAiCommandsV2,
} from './ai';
import {
  AI_EXCESS_TREASURY_GDP_THRESHOLD_SHARE,
  AI_EXCESS_TREASURY_WEEKLY_REVENUE_CAP,
  UPKEEP_OVERFUNDING_FULL_SURPLUS_WEEKS,
  UPKEEP_OVERFUNDING_MAX_RATIO,
  excessTreasuryInvestmentV2,
  upkeepFundingTargetRatioV2,
} from './balance';
import { createWorldStateV2 } from './bootstrap';
import { isHumanSelectableNationV2, WORLD_CONTENT_V2 } from './content';
import { nationalAiTreasuryPolicyV2 } from './nationalAi';
import { resolveScenarioV2 } from './scenarios';
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
  it('raises the military planning priority monotonically with player suspicion', () => {
    const priorities = [0, 10, 25, 50, 75, 100]
      .map((suspicion) => aiSuspicionMilitaryPriorityV2(suspicion));

    expect(priorities[0]).toBe(0);
    for (let index = 1; index < priorities.length; index += 1) {
      expect(priorities[index]).toBeGreaterThan(priorities[index - 1]!);
    }
    expect(aiSuspicionMilitaryPriorityV2(-100)).toBe(priorities[0]);
    expect(aiSuspicionMilitaryPriorityV2(1_000)).toBe(priorities.at(-1));
    expect(aiSuspicionMilitaryPriorityV2(80)).toBeGreaterThan(
      aiSuspicionMilitaryPriorityV2(75) * 1.25,
    );
    expect(aiSuspicionMilitaryPriorityV2(80, 2))
      .toBeGreaterThan(aiSuspicionMilitaryPriorityV2(80, 1));
    expect(aiSuspicionMilitaryPriorityV2(80, 1))
      .toBeGreaterThan(aiSuspicionMilitaryPriorityV2(80));
  });

  it('switches every active country to strong Suspicion-independent Earth Defense budgets', () => {
    const lowSuspicion = createWorldStateV2(91_012);
    const human = nationIdV2('bel');
    const rival = nationIdV2('nld');
    lowSuspicion.humanPlayerId = human;
    lowSuspicion.humanPlayerIds = [human];
    lowSuspicion.tick = 104;
    lowSuspicion.aiEscalation.globalThreat = 0;
    for (const playerId of [human, rival]) {
      lowSuspicion.players[playerId]!.budget = {
        military: 40,
        research: 30,
        development: 30,
      };
    }
    const highSuspicion = structuredClone(lowSuspicion);
    highSuspicion.aiEscalation.globalThreat = 100;
    const plannedMilitary = (state: typeof lowSuspicion, playerId: typeof human): number => {
      const command = planAiCommandsV2(state, WORLD_CONTENT_V2).find((candidate) => (
        candidate.type === 'set-budget-policy' && candidate.playerId === playerId
      ));
      return command?.type === 'set-budget-policy'
        ? command.budget.military
        : state.players[playerId]!.budget.military;
    };

    expect(plannedMilitary(highSuspicion, human))
      .toBe(plannedMilitary(lowSuspicion, human));
    expect(plannedMilitary(highSuspicion, rival))
      .toBe(plannedMilitary(lowSuspicion, rival));
    expect(aiEarthDefenseMilitaryPriorityV2(lowSuspicion)).toBe(0);

    const lowContact = structuredClone(lowSuspicion);
    lowContact.polarEndgame.phase = 'contact';
    lowContact.polarEndgame.contactTick = lowContact.tick;
    const highContact = structuredClone(highSuspicion);
    highContact.polarEndgame.phase = 'contact';
    highContact.polarEndgame.contactTick = highContact.tick;
    expect(aiEarthDefenseMilitaryPriorityV2(lowContact))
      .toBe(AI_EARTH_DEFENSE_MILITARY_PRIORITY_V2);
    for (const playerId of [human, rival]) {
      expect(plannedMilitary(lowContact, playerId))
        .toBeGreaterThan(plannedMilitary(lowSuspicion, playerId));
      expect(plannedMilitary(highContact, playerId))
        .toBe(plannedMilitary(lowContact, playerId));
    }
  });

  it('moves every independent Survival country toward military anti-Rogue readiness', () => {
    const { content } = resolveScenarioV2({ mode: 'survival', seed: 91_013 });
    const state = createWorldStateV2(91_013, content);
    state.tick = 104;
    const independentIds = content.nationIds.filter((playerId) => (
      isHumanSelectableNationV2(content, playerId)
    ));
    for (const playerId of independentIds) {
      state.players[playerId]!.budget = { military: 10, research: 45, development: 45 };
    }

    expect(aiEarthDefenseMilitaryPriorityV2(state))
      .toBe(AI_EARTH_DEFENSE_MILITARY_PRIORITY_V2);
    expect(autonomousAiVsAiWarCapV2(state, content, independentIds.length)).toBe(0);

    const commands = planAiCommandsV2(state, content);
    const plannedBudgets = new Map(commands.flatMap((command) => (
      command.type === 'set-budget-policy' ? [[command.playerId, command.budget] as const] : []
    )));
    expect(plannedBudgets.size).toBeGreaterThanOrEqual(independentIds.length);
    for (const playerId of independentIds) {
      expect(plannedBudgets.get(playerId)?.military, playerId).toBeGreaterThan(10);
    }
    expect(commands.some((command) => (
      command.type === 'declare-war'
        && !state.humanPlayerIds.includes(command.attackerId)
        && !state.humanPlayerIds.includes(command.defenderId)
        && isHumanSelectableNationV2(content, command.attackerId)
        && isHumanSelectableNationV2(content, command.defenderId)
    ))).toBe(false);
  });

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
    expect(building.reserveTarget).toBeCloseTo(Math.max(
      building.revenue * policy.reserveWeeks,
      selectNationalEconomyV2(state, WORLD_CONTENT_V2, belgium).controlledOutput
        * AI_EXCESS_TREASURY_GDP_THRESHOLD_SHARE,
    ), 6);
    expect(recurringProgramEnvelope(building)).toBeCloseTo(
      buildingCashflow * (1 - policy.freeCashflowShare),
      5,
    );
    expect(building.net).toBeCloseTo(buildingCashflow * policy.freeCashflowShare, 5);

    state.players[belgium]!.treasury = building.reserveTarget;
    const funded = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    const fundedCashflow = discretionaryCashflow(funded);
    expect(recurringProgramEnvelope(funded)).toBeCloseTo(fundedCashflow * 0.95, 5);
    expect(funded.net).toBeCloseTo(fundedCashflow * 0.05, 5);
  });

  it('spends only treasury above target on smooth upkeep overfunding up to 125%', () => {
    const state = createWorldStateV2(91_006);
    const belgium = nationIdV2('bel');
    for (const territory of Object.values(state.territories)) {
      if (territory.owner === belgium) territory.army.manpower = territory.army.capacity * 0.45;
    }
    state.players[belgium]!.treasury = 0;
    const probe = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    const target = probe.reserveTarget;

    state.players[belgium]!.treasury = target;
    const atTarget = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    state.players[belgium]!.treasury = target
      + probe.revenue * UPKEEP_OVERFUNDING_FULL_SURPLUS_WEEKS / 2;
    const halfway = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    state.players[belgium]!.treasury = target
      + probe.revenue * UPKEEP_OVERFUNDING_FULL_SURPLUS_WEEKS;
    const fullyFunded = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    state.players[belgium]!.treasury = target + probe.revenue * 200;
    const enormousBuffer = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);

    expect(atTarget.mandatoryFundingRatio).toBeCloseTo(1, 6);
    expect(halfway.mandatoryFundingRatio).toBeGreaterThan(1);
    expect(halfway.mandatoryFundingRatio).toBeLessThan(UPKEEP_OVERFUNDING_MAX_RATIO);
    expect(fullyFunded.mandatoryFundingRatio).toBeCloseTo(UPKEEP_OVERFUNDING_MAX_RATIO, 6);
    expect(enormousBuffer.mandatoryFundingRatio).toBeCloseTo(UPKEEP_OVERFUNDING_MAX_RATIO, 6);
    expect(fullyFunded.fundedArmyUpkeep).toBeCloseTo(
      fullyFunded.armyUpkeep * UPKEEP_OVERFUNDING_MAX_RATIO,
      5,
    );
    expect(fullyFunded.passiveRecruitment).toBeGreaterThan(atTarget.passiveRecruitment);
    expect(fullyFunded.military - atTarget.military).toBeGreaterThan(0);
    expect(upkeepFundingTargetRatioV2(target - 1, target, probe.revenue)).toBe(1);
    expect(upkeepFundingTargetRatioV2(
      target + probe.revenue * UPKEEP_OVERFUNDING_FULL_SURPLUS_WEEKS,
      target,
      probe.revenue,
    )).toBeCloseTo(UPKEEP_OVERFUNDING_MAX_RATIO, 10);
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
      justAbove.reserveTarget,
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
      apex.reserveTarget,
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
    expect(invested.mandatoryFundingRatio).toBeCloseTo(1, 6);
    expect(invested.military).toBeCloseTo(fundedBuffer.military, 6);
    expect(invested.standingOperations).toBeCloseTo(fundedBuffer.standingOperations, 6);
    expect(productiveCivilianInvestment(invested) - productiveCivilianInvestment(fundedBuffer))
      .toBeCloseTo(invested.excessCashInvestment, 5);
  });

  it('never turns AI or selected-country EONSCAR cash into manual purchase commands', () => {
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
