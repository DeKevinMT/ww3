import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { createFinancePlansV2, processDevelopmentPhaseV2, processFinanceMilitaryV2 } from './economy';
import {
  selectNationalEconomyV2,
  selectResearchOutputV2,
  selectWarPressureV2,
  selectWeeklyFinanceBreakdownV2,
  selectWeeklyPopulationTrendV2,
} from './selectors';
import { nationIdV2, territoryIdV2, type WorldStateV2 } from './types';
import { requestCeasefireV2, respondToOfferV2 } from './war';

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
    expect(peacePressure.outputPenalty).toBeLessThanOrEqual(0.05);
    expect(peacePressure.populationGrowthDrag).toBeGreaterThan(0);
    expect(peacePressure.researchPenalty).toBeGreaterThan(0);
    expect(onePressure.outputPenalty).toBeGreaterThan(peacePressure.outputPenalty);
    expect(twoPressure.outputPenalty).toBeGreaterThan(onePressure.outputPenalty);
    expect(twoPressure.populationGrowthDrag).toBeGreaterThan(onePressure.populationGrowthDrag);
    expect(onePressure.outputPenalty).toBeGreaterThan(0.08);
    expect(onePressure.populationGrowthDrag).toBeGreaterThan(0.007);
    expect(onePressure.researchPenalty).toBeGreaterThan(0.25);

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

  it('keeps both countries in a gradual post-war transition after their final front closes', () => {
    const state = createWorldStateV2(881);
    state.wars = [];
    state.truces = [];
    state.offers = [];
    state.tick = 52;
    addFront(state, 1, 'nld');
    state.wars[0]!.startedTick = 0;
    state.players[nationIdV2('bel')].treasury = 1_000;
    expect(requestCeasefireV2(state, WORLD_CONTENT_V2, state.wars[0]!.id, nationIdV2('bel')).accepted).toBe(true);
    const offer = state.offers.find((candidate) => candidate.status === 'pending')!;
    expect(respondToOfferV2(state, WORLD_CONTENT_V2, offer.id, true).accepted).toBe(true);
    expect(state.wars).toHaveLength(0);
    expect(state.players[nationIdV2('bel')].warFatigue).toBeGreaterThanOrEqual(8);
    expect(state.players[nationIdV2('nld')].warFatigue).toBeGreaterThanOrEqual(8);
    const transition = selectWarPressureV2(state, nationIdV2('bel'));
    expect(transition.outputPenalty).toBeCloseTo(0.05, 6);
    expect(transition.researchPenalty).toBeCloseTo(0.15, 6);

    for (let week = 0; week < 32; week += 1) {
      const plans = createFinancePlansV2(state, WORLD_CONTENT_V2);
      processFinanceMilitaryV2(state, WORLD_CONTENT_V2, plans);
      state.tick += 1;
    }
    expect(state.players[nationIdV2('bel')].warFatigue).toBe(0);
    expect(selectWarPressureV2(state, nationIdV2('bel')).outputPenalty).toBe(0);
    expect(selectWarPressureV2(state, nationIdV2('bel')).researchPenalty).toBe(0);
  });
});
