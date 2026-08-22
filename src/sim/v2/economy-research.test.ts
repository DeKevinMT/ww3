import { describe, expect, it } from 'vitest';
import {
  NATIONAL_AI_WAR_BASE_RUNWAY_WEEKS,
  NATIONAL_AI_WAR_FRONT_RUNWAY_WEEKS,
} from './balance';
import { createWorldStateV2 } from './bootstrap';
import { nationalArmyCapacityTargetV2, synchronizeArmyCapacityV2 } from './capacity';
import { WORLD_CONTENT_V2 } from './content';
import { createFinancePlansV2, processFinanceMilitaryV2 } from './economy';
import { drawResearchEffectV2, processResearchV2 } from './research';
import { selectResearchBranchCostV2, selectWeeklyFinanceBreakdownV2 } from './selectors';
import { nationIdV2, territoryIdV2 } from './types';
import { WorldEngineV2 } from './WorldEngineV2';

describe('V2 finance and research', () => {
  it('commits the full budget envelope and exposes unused military money as standing operations', () => {
    const state = createWorldStateV2(10);
    const bel = nationIdV2('bel');
    state.players[bel].treasury = 100;
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
    expect(plan.condition + plan.economyGrowth + plan.populationGrowth).toBeCloseTo(plan.development, 5);
    expect(plan.net).toBeCloseTo(plan.revenue + plan.foodExportIncome - plan.expenses, 5);
    expect(plan.closingTreasury).toBeCloseTo(state.players[bel].treasury + plan.net, 5);
    expect(plan.activeBudget).toEqual(state.players[bel].budget);
    expect(plan.military / (plan.military + plan.research + plan.development))
      .toBeCloseTo(state.players[bel].budget.military / 100, 6);
  });

  it('keeps a mature branch improving beyond the former level-20 limit', () => {
    const state = createWorldStateV2(16);
    const bel = nationIdV2('bel');
    state.players[bel].treasury = 100;
    state.players[bel].research.allocations = {
      'population-recruitment': 0, 'military-industry': 0, 'advanced-weapons': 100,
      'defensive-systems': 0, 'logistics-medicine': 0, 'economy-science': 0,
    };
    state.players[bel].research.effectLevels.attack = 20;
    state.players[bel].research.effectLevels.control = 20;
    state.players[bel].research.progress['advanced-weapons'] = selectResearchBranchCostV2(
      state, WORLD_CONTENT_V2, bel, 'advanced-weapons',
    );
    const plans = createFinancePlansV2(state, WORLD_CONTENT_V2);
    const plan = plans.get(bel)!;
    const beforeLevels = state.players[bel].research.effectLevels.attack
      + state.players[bel].research.effectLevels.control;
    expect(plan.research).toBeGreaterThan(0);
    expect(plan.baseOperatingCost + plan.foodProduction + plan.military + plan.research + plan.development)
      .toBeCloseTo(plan.expenses, 5);
    processResearchV2(state, WORLD_CONTENT_V2, plans);
    expect(state.players[bel].research.effectLevels.attack
      + state.players[bel].research.effectLevels.control).toBe(beforeLevels + 1);
    expect(state.players[bel].research.progress['population-recruitment']).toBeGreaterThan(0);
  });

  it('protects the peace floor and manages wartime cash as an adaptive runway', () => {
    const peace = createWorldStateV2(11);
    const bel = nationIdV2('bel');
    peace.players[bel].treasury = 4.99;
    const peacePlan = selectWeeklyFinanceBreakdownV2(peace, WORLD_CONTENT_V2, bel);
    expect(peacePlan.closingTreasury).toBeGreaterThanOrEqual(Math.min(5, 4.99 + peacePlan.revenue) - 1e-6);

    const war = createWorldStateV2(11);
    const nld = nationIdV2('nld');
    war.players[bel].treasury = 4;
    war.wars.push({
      id: 'war-test', attackerId: bel, defenderId: nld, startedTick: 0, lastBattleTick: 0,
      warScore: 0, battles: 0, attackerLosses: 0, defenderLosses: 0,
      lastPeaceOfferTick: -1,
      attackerOperations: [], defenderOperations: [],
    });
    const warPlan = selectWeeklyFinanceBreakdownV2(war, WORLD_CONTENT_V2, bel);
    expect(warPlan.reserveTarget).toBeCloseTo(warPlan.revenue
      * (NATIONAL_AI_WAR_BASE_RUNWAY_WEEKS + NATIONAL_AI_WAR_FRONT_RUNWAY_WEEKS), 5);
    expect(warPlan.closingTreasury).toBeLessThan(5);
    expect(warPlan.closingTreasury).toBeGreaterThanOrEqual(0);
    const warDiscretionary = warPlan.revenue - warPlan.baseOperatingCost - warPlan.foodProduction;
    expect(warPlan.expenses).toBeCloseTo(warPlan.baseOperatingCost + warPlan.foodProduction
      + warDiscretionary * 0.92 + warPlan.warOperations, 5);
    expect(warPlan.net).toBeCloseTo(
      warDiscretionary * 0.08 - warPlan.warOperations, 5,
    );

    war.players[bel].treasury = 100;
    const fundedOffensive = selectWeeklyFinanceBreakdownV2(war, WORLD_CONTENT_V2, bel);
    const fundedDiscretionary = fundedOffensive.revenue
      - fundedOffensive.baseOperatingCost - fundedOffensive.foodProduction;
    expect(fundedOffensive.expenses).toBeCloseTo(fundedOffensive.baseOperatingCost
      + fundedOffensive.foodProduction + fundedDiscretionary * 1.08
      + fundedOffensive.warOperations, 5);
    expect(fundedOffensive.net).toBeCloseTo(
      -fundedDiscretionary * 0.08
        - fundedOffensive.warOperations,
      5,
    );
  });

  it('normalizes great-power free cashflow while preserving their economic scale', () => {
    const state = createWorldStateV2(1101);
    const usa = nationIdV2('usa');
    const bel = nationIdV2('bel');
    const usaPlan = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, usa);
    const belgiumPlan = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, bel);
    const usaSavingsRate = usaPlan.net / usaPlan.revenue;
    const belgiumSavingsRate = belgiumPlan.net / belgiumPlan.revenue;
    expect(usaPlan.revenue).toBeGreaterThan(belgiumPlan.revenue * 20);
    expect(usaSavingsRate).toBeGreaterThanOrEqual(0);
    expect(usaSavingsRate).toBeLessThanOrEqual(0.03);
    expect(Math.abs(usaSavingsRate - belgiumSavingsRate)).toBeLessThan(0.01);
  });

  it('allows sovereign debt, adds a 10% premium to new borrowing and automatically repays it', () => {
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
    expect(borrowed.ceasefirePayment).toBeCloseTo(revenue + 1, 6);
    expect(receiver.ceasefireIncome).toBeCloseTo(revenue + 1, 6);
    expect(borrowed.newBorrowing).toBeGreaterThan(1);
    expect(borrowed.debtPremium).toBeCloseTo(borrowed.newBorrowing * 0.10, 6);
    expect(borrowed.closingTreasury).toBeCloseTo(-borrowed.newBorrowing * 1.10, 5);

    state.ceasefireObligations = [];
    state.players[bel].treasury = borrowed.closingTreasury;
    const recovery = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, bel);
    expect(recovery.newBorrowing).toBe(0);
    expect(recovery.debtPremium).toBe(0);
    expect(recovery.net).toBeGreaterThan(0);
    expect(recovery.closingTreasury).toBeGreaterThan(state.players[bel].treasury);
    expect(recovery.mode).toBe('insolvent');
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
    expect(plan.reserveTarget).toBeCloseTo(plan.revenue
      * (NATIONAL_AI_WAR_BASE_RUNWAY_WEEKS + 2 * NATIONAL_AI_WAR_FRONT_RUNWAY_WEEKS), 5);
    expect(plan.net).toBeLessThan(0);
    expect(plan.closingTreasury).toBeLessThan(state.players[bel].treasury);
    expect(plan.mandatoryFundingRatio).toBeCloseTo(1, 6);
  });

  it('keeps payroll funded through a complete low-cash campaign', () => {
    const engine = new WorldEngineV2(112);
    const bel = nationIdV2('bel');
    const lux = nationIdV2('lux');
    const declaration = engine.declareWar(bel, lux);
    expect(declaration.accepted).toBe(true);
    let minimumTreasury = Number.POSITIVE_INFINITY;
    let minimumMandatoryFunding = 1;
    for (let week = 0; week < 120 && engine.state.territories[territoryIdV2('lux')]!.owner !== bel; week += 1) {
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
    levels.control = 200;
    expect(['attack', 'control']).toContain(drawResearchEffectV2({ rngState: 1 }, 'advanced-weapons', levels));
  });

  it('turns one completion into exactly one +1 effect and one branch count', () => {
    const state = createWorldStateV2(15);
    const bel = nationIdV2('bel');
    state.players[bel].treasury = 100;
    state.players[bel].research.progress['advanced-weapons'] = selectResearchBranchCostV2(
      state, WORLD_CONTENT_V2, bel, 'advanced-weapons',
    );
    const beforeEffects = Object.values(state.players[bel].research.effectLevels).reduce((a, b) => a + b, 0);
    processResearchV2(state, WORLD_CONTENT_V2, createFinancePlansV2(state, WORLD_CONTENT_V2));
    const afterEffects = Object.values(state.players[bel].research.effectLevels).reduce((a, b) => a + b, 0);
    expect(afterEffects - beforeEffects).toBe(1);
    expect(state.players[bel].research.breakthroughs['advanced-weapons']).toBe(1);
  });
});
