import { describe, expect, it } from 'vitest';
import {
  WAR_OPERATION_COST_PER_MILLION,
  WAR_OPERATION_REVENUE_SHARE,
} from './balance';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { createFinancePlansV2, processDevelopmentPhaseV2 } from './economy';
import {
  selectNationalEconomyV2,
  selectResearchOutputV2,
  selectWarPressureV2,
  selectWeeklyFinanceBreakdownV2,
  selectWeeklyPopulationTrendV2,
} from './selectors';
import { nationIdV2, territoryIdV2, type WorldStateV2 } from './types';

function addFront(state: WorldStateV2, index: number, defenderId: 'nld' | 'lux'): void {
  state.wars.push({
    id: `war-pressure-${index}`,
    attackerId: nationIdV2('bel'),
    defenderId: nationIdV2(defenderId),
    startedTick: 0,
    lastBattleTick: 0,
    warScore: 0,
    battles: 0,
    attackerLosses: 0,
    defenderLosses: 0,
    lastPeaceOfferTick: -1,
    attackerOperations: [],
    defenderOperations: [],
  });
}

function pressureState(fronts: 0 | 1 | 2): WorldStateV2 {
  const state = createWorldStateV2(880);
  state.wars = [];
  state.players[nationIdV2('bel')].warFatigue = 30;
  state.players[nationIdV2('bel')].research.activeProgram = 'economy-science';
  if (fronts >= 1) addFront(state, 1, 'nld');
  if (fronts >= 2) addFront(state, 2, 'lux');
  return state;
}

describe('V2 wartime economy pressure', () => {
  it('stacks output and population pressure for every active front', () => {
    const belgium = nationIdV2('bel');
    const peace = pressureState(0);
    const oneFront = pressureState(1);
    const twoFronts = pressureState(2);
    const peacePressure = selectWarPressureV2(peace, belgium);
    const onePressure = selectWarPressureV2(oneFront, belgium);
    const twoPressure = selectWarPressureV2(twoFronts, belgium);

    expect(peacePressure.outputPenalty).toBeGreaterThan(0);
    expect(peacePressure.outputPenalty).toBeLessThanOrEqual(0.03);
    expect(peacePressure.populationGrowthDrag).toBeGreaterThan(0);
    expect(peacePressure.researchPenalty).toBeGreaterThan(0);
    expect(onePressure.outputPenalty).toBeGreaterThan(peacePressure.outputPenalty);
    expect(twoPressure.outputPenalty).toBeGreaterThan(onePressure.outputPenalty);
    expect(twoPressure.populationGrowthDrag).toBeGreaterThan(onePressure.populationGrowthDrag);
    expect(onePressure.outputPenalty).toBeCloseTo(0.074, 6);
    expect(onePressure.populationGrowthDrag).toBeCloseTo(0.0052, 6);
    expect(onePressure.researchPenalty).toBeCloseTo(0.178, 6);

    const peaceEconomy = selectNationalEconomyV2(peace, WORLD_CONTENT_V2, belgium);
    const oneEconomy = selectNationalEconomyV2(oneFront, WORLD_CONTENT_V2, belgium);
    const twoEconomy = selectNationalEconomyV2(twoFronts, WORLD_CONTENT_V2, belgium);
    // War pressure affects subsequent population/economy growth, research and
    // explicit war costs. It no longer applies a second hidden tax discount to
    // otherwise identical live population and wealth.
    expect(oneEconomy.weeklyRevenue).toBeCloseTo(peaceEconomy.weeklyRevenue, 8);
    expect(twoEconomy.weeklyRevenue).toBeCloseTo(oneEconomy.weeklyRevenue, 8);
    expect(selectWeeklyPopulationTrendV2(oneFront, WORLD_CONTENT_V2, belgium))
      .toBeLessThan(selectWeeklyPopulationTrendV2(peace, WORLD_CONTENT_V2, belgium));
    expect(selectWeeklyPopulationTrendV2(twoFronts, WORLD_CONTENT_V2, belgium))
      .toBeLessThan(selectWeeklyPopulationTrendV2(oneFront, WORLD_CONTENT_V2, belgium));

    const finance = selectWeeklyFinanceBreakdownV2(twoFronts, WORLD_CONTENT_V2, belgium);
    expect(finance.warEconomicPenalty).toBe(twoPressure.outputPenalty);
    expect(finance.warPopulationDrag).toBe(twoPressure.populationGrowthDrag);
    expect(finance.warResearchPenalty).toBe(twoPressure.researchPenalty);
    expect(selectResearchOutputV2(twoFronts, WORLD_CONTENT_V2, belgium, finance))
      .toBeLessThan(selectResearchOutputV2(peace, WORLD_CONTENT_V2, belgium));
  });

  it('applies the pressure to actual weekly economy and population growth', () => {
    const belgium = nationIdV2('bel');
    const territory = territoryIdV2('bel');
    const peace = pressureState(0);
    const war = pressureState(2);
    const peaceEconomyBefore = peace.territories[territory].economy;
    const warEconomyBefore = war.territories[territory].economy;
    const peacePopulationBefore = peace.territories[territory].population;
    const warPopulationBefore = war.territories[territory].population;

    processDevelopmentPhaseV2(peace, WORLD_CONTENT_V2, createFinancePlansV2(peace, WORLD_CONTENT_V2));
    processDevelopmentPhaseV2(war, WORLD_CONTENT_V2, createFinancePlansV2(war, WORLD_CONTENT_V2));

    expect(war.territories[territory].economy / warEconomyBefore)
      .toBeLessThan(peace.territories[territory].economy / peaceEconomyBefore);
    expect(war.territories[territory].population / warPopulationBefore)
      .toBeLessThan(peace.territories[territory].population / peacePopulationBefore);
    expect(selectWarPressureV2(war, belgium).fronts).toBe(2);
  });

  it('makes repeat-war operations progressively more expensive with a bounded surcharge', () => {
    const belgium = nationIdV2('bel');
    const operationsAt = (fatigue: number): number => {
      const state = pressureState(1);
      state.players[belgium]!.warFatigue = fatigue;
      return selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium).warOperations;
    };

    const fresh = operationsAt(0);
    expect(WAR_OPERATION_REVENUE_SHARE).toBe(0.07);
    expect(WAR_OPERATION_COST_PER_MILLION).toBe(0.07);
    expect(operationsAt(8) / fresh).toBeCloseTo(1.06, 4);
    expect(operationsAt(16) / fresh).toBeCloseTo(1.12, 4);
    expect(operationsAt(20) / fresh).toBeCloseTo(1.15, 4);
    expect(operationsAt(80) / fresh).toBeCloseTo(1.20, 4);
    expect(operationsAt(100)).toBeCloseTo(operationsAt(80), 6);
  });

  it('keeps retired settlement obligations financially inert', () => {
    const state = pressureState(0);
    const belgium = nationIdV2('bel');
    state.ceasefireObligations = [{
      warId: 'retired-obligation',
      payerId: belgium,
      payeeId: nationIdV2('nld'),
      weeklyCost: 999,
      startsTick: 0,
      expiresTick: 1_000,
    }];

    const belgian = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    const dutch = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, nationIdV2('nld'));
    expect(belgian.ceasefirePayment).toBe(0);
    expect(dutch.ceasefireIncome).toBe(0);
  });
});
