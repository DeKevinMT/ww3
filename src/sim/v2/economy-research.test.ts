import { describe, expect, it } from 'vitest';
import {
  clamp,
  debtPressureV2,
  effectiveTreasuryReserveTargetV2,
} from './balance';
import { createWorldStateV2 } from './bootstrap';
import { nationalArmyCapacityTargetV2, synchronizeArmyCapacityV2 } from './capacity';
import { WORLD_CONTENT_V2 } from './content';
import { createFinancePlansV2, processFinanceMilitaryV2 } from './economy';
import { nationalAiTreasuryPolicyV2 } from './nationalAi';
import { drawResearchEffectV2 } from './research';
import {
  selectNationalEconomyV2,
  selectResearchBranchCostV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import { enterPostBlackoutCampaignForTestV2 } from './testSupport';
import { nationIdV2, territoryIdV2 } from './types';
import { WorldEngineV2 } from './WorldEngineV2';

describe('V2 finance and research', () => {
  it('commits the full budget envelope and exposes unused military money as standing operations', () => {
    const state = createWorldStateV2(10);
    const bel = nationIdV2('bel');
    // Keep this baseline below the separate >10%-of-GDP surplus-investment path.
    state.players[bel].treasury = 0;
    const plan = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, bel);
    expect(plan.expenses).toBeCloseTo(plan.baseOperatingCost + plan.foodProduction
      + plan.military + plan.research + plan.development, 5);
    expect(plan.standingOperations).toBeCloseTo(
      plan.military
        - Math.min(plan.military, plan.armyUpkeep)
        - plan.recruitment
        - plan.reserveTrainingCost,
      5,
    );
    const mandatoryFunded = Math.min(plan.military, plan.armyUpkeep);
    expect(mandatoryFunded + plan.recruitment + plan.reserveTrainingCost + plan.standingOperations)
      .toBeCloseTo(plan.military, 5);
    expect(plan.economyGrowth + plan.populationGrowth).toBeCloseTo(plan.development, 5);
    expect(plan.net).toBeCloseTo(plan.revenue + plan.foodExportIncome - plan.expenses, 5);
    expect(plan.closingTreasury).toBeCloseTo(state.players[bel].treasury + plan.net, 5);
    expect(plan.activeBudget.military).toBeCloseTo(state.players[bel].budget.military, 10);
    expect(plan.activeBudget.research).toBeCloseTo(state.players[bel].budget.research, 10);
    expect(plan.activeBudget.development).toBeCloseTo(state.players[bel].budget.development, 10);
    expect(plan.military / (plan.military + plan.research + plan.development))
      .toBeCloseTo(state.players[bel].budget.military / 100, 6);
  });

  it('keeps a mature branch improving beyond the former level-20 limit', () => {
    const engine = new WorldEngineV2(16);
    engine.stopClock();
    const state = engine.state;
    const bel = nationIdV2('bel');
    state.players[bel].treasury = 100;
    state.players[bel].research.allocations = {
      'population-recruitment': 0, 'military-industry': 0, 'advanced-weapons': 100,
      'defensive-systems': 0, 'logistics-medicine': 0, 'economy-science': 0,
      'food-systems': 0, 'reserve-doctrine': 0, 'public-administration': 0,
      'education-intelligence': 0,
    };
    state.players[bel].research.effectLevels.attack = 20;
    state.players[bel].research.effectLevels['reinforcement-efficiency'] = 20;
    const plans = createFinancePlansV2(state, WORLD_CONTENT_V2);
    const plan = plans.get(bel)!;
    const beforeLevels = state.players[bel].research.effectLevels.attack
      + state.players[bel].research.effectLevels['reinforcement-efficiency'];
    expect(plan.research).toBeGreaterThan(0);
    expect(plan.baseOperatingCost + plan.foodProduction + plan.military + plan.research + plan.development)
      .toBeCloseTo(plan.expenses, 5);
    state.players[bel].research.progress['advanced-weapons'] = selectResearchBranchCostV2(
      state, WORLD_CONTENT_V2, bel, 'advanced-weapons',
    );
    engine.step();
    expect(state.players[bel].research.effectLevels.attack
      + state.players[bel].research.effectLevels['reinforcement-efficiency']).toBe(beforeLevels + 1);
    expect(state.players[bel].research.progress['advanced-weapons']).toBeGreaterThan(0);
    expect(state.players[bel].research.progress['population-recruitment']).toBeGreaterThan(0);
  });

  it('protects the peace floor and manages wartime cash as an adaptive runway', () => {
    const peace = createWorldStateV2(11);
    const bel = nationIdV2('bel');
    peace.players[bel].treasury = 0;
    const peacePlan = selectWeeklyFinanceBreakdownV2(peace, WORLD_CONTENT_V2, bel);
    const peacePolicy = nationalAiTreasuryPolicyV2(
      WORLD_CONTENT_V2.nations[bel]!.iqScore,
      0,
      clamp(Math.log10(peacePlan.revenue + 1) / 2, 0, 1),
    );
    expect(peacePlan.reserveTarget).toBeCloseTo(effectiveTreasuryReserveTargetV2(
      peacePlan.revenue,
      peacePolicy.reserveWeeks,
      selectNationalEconomyV2(peace, WORLD_CONTENT_V2, bel).controlledOutput,
    ).effectiveTarget, 5);
    expect(peacePlan.net).toBeGreaterThan(0);
    expect(peacePlan.closingTreasury).toBeGreaterThan(peace.players[bel].treasury);

    const war = createWorldStateV2(11);
    const nld = nationIdV2('nld');
    war.players[bel].treasury = 0;
    war.wars.push({
      id: 'war-test', attackerId: bel, defenderId: nld, startedTick: 0, lastBattleTick: 0,
      warScore: 0, battles: 0, attackerLosses: 0, defenderLosses: 0,
      lastPeaceOfferTick: -1,
      attackerOperations: [], defenderOperations: [],
    });
    const warPlan = selectWeeklyFinanceBreakdownV2(war, WORLD_CONTENT_V2, bel);
    const warPolicy = nationalAiTreasuryPolicyV2(
      WORLD_CONTENT_V2.nations[bel]!.iqScore,
      1,
      clamp(Math.log10(warPlan.revenue + 1) / 2, 0, 1),
    );
    expect(warPlan.reserveTarget).toBeCloseTo(effectiveTreasuryReserveTargetV2(
      warPlan.revenue,
      warPolicy.reserveWeeks,
      selectNationalEconomyV2(war, WORLD_CONTENT_V2, bel).controlledOutput,
    ).effectiveTarget, 5);
    const warDiscretionary = warPlan.revenue + warPlan.foodExportIncome
      - warPlan.baseOperatingCost - warPlan.foodProduction + warPlan.foodDevelopmentTransfer;
    expect(warPlan.military + warPlan.research + warPlan.development
      + warPlan.foodDevelopmentTransfer).toBeCloseTo(
      warDiscretionary * (1 - warPolicy.freeCashflowShare),
      5,
    );
    expect(warPlan.net).toBeCloseTo(
      warDiscretionary * warPolicy.freeCashflowShare - warPlan.warOperations, 5,
    );

    war.players[bel].treasury = 100;
    const fundedOffensive = selectWeeklyFinanceBreakdownV2(war, WORLD_CONTENT_V2, bel);
    const fundedDiscretionary = fundedOffensive.revenue + fundedOffensive.foodExportIncome
      - fundedOffensive.baseOperatingCost - fundedOffensive.foodProduction
      + fundedOffensive.foodDevelopmentTransfer;
    const fundedUpkeepPremium = Math.max(
      0,
      fundedOffensive.fundedArmyUpkeep - fundedOffensive.armyUpkeep,
    );
    expect(fundedOffensive.military + fundedOffensive.research + fundedOffensive.development
      + fundedOffensive.foodDevelopmentTransfer).toBeCloseTo(
      fundedDiscretionary * 1.02 + fundedOffensive.excessCashInvestment,
      5,
    );
    expect(fundedOffensive.net).toBeCloseTo(
      -fundedDiscretionary * 0.02
        - fundedOffensive.warOperations
        - fundedOffensive.excessCashInvestment,
      5,
    );
    expect(fundedUpkeepPremium).toBeLessThanOrEqual(
      fundedOffensive.excessCashInvestment + 0.000001,
    );
  });

  it('changes wartime spending continuously around the cash-runway boundaries', () => {
    const state = createWorldStateV2(1_102);
    const bel = nationIdV2('bel');
    const nld = nationIdV2('nld');
    state.wars.push({
      id: 'war-smooth-cash', attackerId: bel, defenderId: nld, startedTick: 0,
      lastBattleTick: 0, warScore: 0, battles: 0, attackerLosses: 0,
      defenderLosses: 0, lastPeaceOfferTick: -1,
      attackerOperations: [], defenderOperations: [],
    });
    const baseline = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, bel);
    const targetWeeks = baseline.reserveTarget / baseline.revenue;
    const rateAt = (treasuryWeeks: number): number => {
      state.players[bel].treasury = baseline.revenue * treasuryWeeks;
      const plan = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, bel);
      const discretionary = plan.revenue + plan.foodExportIncome
        - plan.baseOperatingCost - plan.foodProduction + plan.foodDevelopmentTransfer;
      return (plan.military + plan.research + plan.development
        + plan.foodDevelopmentTransfer - plan.excessCashInvestment) / discretionary;
    };

    const epsilon = 0.0001;
    expect(Math.abs(rateAt(targetWeeks - epsilon)
      - rateAt(targetWeeks + epsilon))).toBeLessThan(0.0001);
    expect(Math.abs(rateAt(targetWeeks + 6 - epsilon)
      - rateAt(targetWeeks + 6 + epsilon))).toBeLessThan(0.0001);
    expect(rateAt(targetWeeks + 3)).toBeGreaterThan(rateAt(targetWeeks));
    expect(rateAt(targetWeeks + 6)).toBeCloseTo(1.02, 5);
  });

  it('retains free cash at every scale while preserving great-power economic weight', () => {
    const state = createWorldStateV2(1101);
    const usa = nationIdV2('usa');
    const bel = nationIdV2('bel');
    const usaPlan = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, usa);
    const belgiumPlan = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, bel);
    const usaSavingsRate = usaPlan.net / usaPlan.revenue;
    const belgiumSavingsRate = belgiumPlan.net / belgiumPlan.revenue;
    expect(usaPlan.revenue).toBeGreaterThan(belgiumPlan.revenue * 20);
    expect(usaPlan.net).toBeGreaterThan(belgiumPlan.net * 10);
    expect(usaSavingsRate).toBeGreaterThan(0);
    expect(belgiumSavingsRate).toBeGreaterThan(0);
    expect(usaSavingsRate).toBeLessThan(0.20);
    expect(belgiumSavingsRate).toBeLessThan(0.20);
  });

  it('retires settlement transfers without inventing income, spending or debt', () => {
    const state = createWorldStateV2(1_106);
    const bel = nationIdV2('bel');
    const nld = nationIdV2('nld');
    state.tick = 2;
    state.players[bel].treasury = 0;
    const revenue = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, bel).revenue;
    state.ceasefireObligations.push({
      warId: 'war-debt', payerId: bel, payeeId: nld, weeklyCost: revenue + 1,
      startsTick: 0, expiresTick: 54,
    });
    const borrowed = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, bel);
    const receiver = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, nld);
    expect(borrowed.ceasefirePayment).toBe(0);
    expect(receiver.ceasefireIncome).toBe(0);
    expect(borrowed.newBorrowing).toBe(0);
    expect(borrowed.debtPremium).toBe(0);
    expect(borrowed.closingTreasury).toBeGreaterThanOrEqual(0);
  });

  it('escalates debt consequences smoothly while keeping a shallow deficit recoverable', () => {
    const state = createWorldStateV2(1_107);
    const bel = nationIdV2('bel');
    const opening = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, bel);
    const plans = [0.5, 8, 26, 52].map((debtWeeks) => {
      state.players[bel].treasury = -opening.revenue * debtWeeks;
      return selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, bel);
    });
    const programmeEnvelope = (index: number) => plans[index]!.military
      + plans[index]!.research + plans[index]!.development;

    expect(debtPressureV2(-0.5)).toMatchObject({ recovery: 0, critical: 0 });
    expect(debtPressureV2(-8).recovery).toBeGreaterThan(0);
    expect(debtPressureV2(-26)).toMatchObject({ recovery: 1, critical: 0 });
    expect(debtPressureV2(-52)).toMatchObject({ recovery: 1, critical: 1 });
    expect(plans[0]!.debtPremium).toBe(0);
    expect(plans[0]!.net).toBeGreaterThan(0);
    expect(plans[0]!.closingTreasury).toBeGreaterThan(-opening.revenue * 0.5);
    expect(programmeEnvelope(1)).toBeLessThan(programmeEnvelope(0));
    expect(programmeEnvelope(2)).toBeLessThan(programmeEnvelope(1));
    expect(programmeEnvelope(3)).toBeLessThan(programmeEnvelope(2));
    expect(plans[2]!.debtPremium / plans[2]!.revenue)
      .toBeGreaterThan(plans[1]!.debtPremium / plans[1]!.revenue);
    expect(plans[3]!.debtPremium / plans[3]!.revenue).toBeGreaterThan(0.15);
    expect(plans.every((plan) => Number.isFinite(plan.closingTreasury))).toBe(true);
  });

  it('rebuilds a larger runway and fully funds mandatory costs on multiple fronts', () => {
    const state = createWorldStateV2(111);
    const bel = nationIdV2('bel');
    state.players[bel].treasury = 0.25;
    for (const [index, defender] of ['nld', 'lux'].entries()) {
      state.wars.push({
        id: `war-runway-${index}`, attackerId: bel, defenderId: nationIdV2(defender),
        startedTick: 0, lastBattleTick: 0, warScore: 0, battles: 0,
        attackerLosses: 0, defenderLosses: 0, lastPeaceOfferTick: -1,
        attackerOperations: [], defenderOperations: [],
      });
    }
    const plan = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, bel);
    const treasuryPolicy = nationalAiTreasuryPolicyV2(
      WORLD_CONTENT_V2.nations[bel]!.iqScore,
      2,
      clamp(Math.log10(plan.revenue + 1) / 2, 0, 1),
    );
    expect(plan.reserveTarget).toBeCloseTo(effectiveTreasuryReserveTargetV2(
      plan.revenue,
      treasuryPolicy.reserveWeeks,
      selectNationalEconomyV2(state, WORLD_CONTENT_V2, bel).controlledOutput,
    ).effectiveTarget, 5);
    expect(plan.net).toBeLessThan(0);
    expect(plan.closingTreasury).toBeLessThan(state.players[bel].treasury);
    expect(plan.mandatoryFundingRatio).toBeCloseTo(1, 6);
  });

  it('keeps payroll funded through a complete low-cash campaign', () => {
    const engine = new WorldEngineV2(112);
    const bel = nationIdV2('bel');
    const lux = nationIdV2('lux');
    const belgianArmy = engine.state.territories[territoryIdV2('bel')]!.army;
    belgianArmy.manpower = belgianArmy.capacity;
    belgianArmy.baseAttack = 20;
    belgianArmy.baseDefense = 20;
    const luxembourgArmy = engine.state.territories[territoryIdV2('lux')]!.army;
    luxembourgArmy.manpower = 0;
    luxembourgArmy.baseAttack = 0.1;
    luxembourgArmy.baseDefense = 0.1;
    enterPostBlackoutCampaignForTestV2(engine.state);
    const declaration = engine.declareWar(bel, lux);
    expect(declaration.accepted).toBe(true);
    let minimumTreasury = Number.POSITIVE_INFINITY;
    let minimumMandatoryFunding = 1;
    for (let week = 0; week < 120 && engine.state.territories[territoryIdV2('lux')]!.owner !== bel; week += 1) {
      // Keep this finance regression focused on the attacker's payroll. A
      // replenishing defender is covered by the dedicated reserve tests.
      engine.state.players[lux]!.trainedReserves = 0;
      engine.step();
      const plan = engine.weeklyFinanceBreakdown(bel);
      minimumTreasury = Math.min(minimumTreasury, engine.state.players[bel]!.treasury);
      minimumMandatoryFunding = Math.min(minimumMandatoryFunding, plan.mandatoryFundingRatio);
    }
    expect(engine.state.territories[territoryIdV2('lux')]!.owner).toBe(bel);
    expect(minimumTreasury).toBeGreaterThan(0);
    expect(minimumMandatoryFunding).toBeGreaterThanOrEqual(0.999);
  });

  it('preserves personnel under ordinary unfunded payroll without shrinking cap', () => {
    const state = createWorldStateV2(12);
    const bel = nationIdV2('bel');
    const territory = state.territories[territoryIdV2('bel')];
    state.players[bel].treasury = 0;
    territory.army.manpower = territory.army.capacity;
    const beforeCapacity = territory.army.capacity;
    const beforeManpower = territory.army.manpower;
    const plans = createFinancePlansV2(state, WORLD_CONTENT_V2);
    plans.set(bel, {
      ...plans.get(bel)!,
      mandatoryFundingRatio: 0,
      recruitment: 0,
      recruitmentFundingRatio: 0,
    });
    processFinanceMilitaryV2(state, WORLD_CONTENT_V2, plans);
    expect(territory.army.capacity).toBeCloseTo(beforeCapacity, 8);
    expect(territory.army.manpower).toBe(beforeManpower);
  });

  it('updates army cap from force-capacity research without a purchase system', () => {
    const state = createWorldStateV2(13);
    const bel = nationIdV2('bel');
    const territory = state.territories[territoryIdV2('bel')];
    territory.army.manpower = territory.army.capacity;
    const beforeCapacity = territory.army.capacity;
    const beforeManpower = territory.army.manpower;
    state.players[bel].research.effectLevels['force-capacity'] = 10;
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    expect(territory.army.capacity).toBeGreaterThan(beforeCapacity);
    expect(territory.army.capacity).toBeCloseTo(
      nationalArmyCapacityTargetV2(state, WORLD_CONTENT_V2, bel),
      8,
    );
    expect(territory.army.manpower).toBe(beforeManpower);
  });

  it('draws seeded branch effects and keeps drawing above former reference levels', () => {
    const levels = createWorldStateV2(14).players[nationIdV2('bel')].research.effectLevels;
    const left = { rngState: 1234 };
    const right = { rngState: 1234 };
    expect(drawResearchEffectV2(left, 'economy-science', levels)).toBe(drawResearchEffectV2(right, 'economy-science', levels));
    levels.attack = 200;
    levels['reinforcement-efficiency'] = 200;
    expect(['attack', 'reinforcement-efficiency']).toContain(drawResearchEffectV2({ rngState: 1 }, 'advanced-weapons', levels));
  });

  it('turns one completion into exactly one +1 effect and one branch count', () => {
    const engine = new WorldEngineV2(15);
    engine.stopClock();
    const state = engine.state;
    const bel = nationIdV2('bel');
    state.players[bel].treasury = 100;
    state.players[bel].research.progress['advanced-weapons'] = selectResearchBranchCostV2(
      state, WORLD_CONTENT_V2, bel, 'advanced-weapons',
    );
    const beforeEffects = Object.values(state.players[bel].research.effectLevels).reduce((a, b) => a + b, 0);
    engine.step();
    const afterEffects = Object.values(state.players[bel].research.effectLevels).reduce((a, b) => a + b, 0);
    expect(afterEffects - beforeEffects).toBe(1);
    expect(state.players[bel].research.breakthroughs['advanced-weapons']).toBe(1);
  });
});
