import { describe, expect, it } from 'vitest';
import { FOOD_TARGET_WEEKS } from './balance';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { createFinancePlansV2, processEconomyV2 } from './economy';
import {
  invalidateTerritoryIndexV2,
  selectFoodAccessCeilingV2,
  selectFoodDemandV2,
  selectFoodLandCapacityV2,
  selectFoodStorageCapacityV2,
  selectPopulationDynamicsV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import { nationIdV2, territoryIdV2 } from './types';

describe('V2 automated food security', () => {
  it('gives larger controlled landmasses more physical food storage', () => {
    const state = createWorldStateV2(2_100);
    const belgium = nationIdV2('bel');
    const canada = nationIdV2('can');
    const belgiumDemand = selectFoodDemandV2(state, belgium);
    const canadaDemand = selectFoodDemandV2(state, canada);
    const belgiumWeeks = selectFoodStorageCapacityV2(state, WORLD_CONTENT_V2, belgium) / belgiumDemand;
    const canadaWeeks = selectFoodStorageCapacityV2(state, WORLD_CONTENT_V2, canada) / canadaDemand;
    expect(canadaWeeks).toBeGreaterThan(belgiumWeeks);
  });

  it('starts a food-secure country near its strategic buffer and funds food first', () => {
    const state = createWorldStateV2(2_101);
    const belgium = nationIdV2('bel');
    const plan = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    expect(state.players[belgium].foodStock / plan.foodDemand).toBeGreaterThan(FOOD_TARGET_WEEKS * 0.95);
    expect(plan.foodCoverage).toBeGreaterThan(0.99);
    expect(plan.foodProduced).toBeGreaterThan(0);
    expect(plan.foodProduction).toBeGreaterThan(0);
    expect(plan.expenses).toBeCloseTo(
      plan.foodProduction + plan.military + plan.research + plan.development,
      5,
    );
  });

  it('starts Nigeria fed but with a smaller buffer and a real structural burden', () => {
    const state = createWorldStateV2(2_105);
    const nigeria = nationIdV2('nga');
    const plan = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, nigeria);
    const stockWeeks = state.players[nigeria].foodStock / plan.foodDemand;
    expect(WORLD_CONTENT_V2.nations[nigeria].real.foodInsecurityRate).toBeCloseTo(0.146, 3);
    expect(stockWeeks).toBeGreaterThan(2);
    expect(stockWeeks).toBeLessThan(3);
    expect(plan.foodCoverage).toBe(1);
    expect(plan.foodProduced).toBeGreaterThan(plan.foodDemand);
    expect(state.players[nigeria].foodSecurity).toBeCloseTo(0.854, 3);
  });

  it('makes unsupported population growth worsen food access and raise the food bill', () => {
    const state = createWorldStateV2(2_106);
    const nigeria = nationIdV2('nga');
    const territory = state.territories[territoryIdV2('nga')];
    const before = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, nigeria);
    territory.population *= 1.25;
    invalidateTerritoryIndexV2(state);
    const after = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, nigeria);
    expect(after.foodDemand).toBeGreaterThan(before.foodDemand * 1.25);
    expect(after.foodProduction / after.revenue).toBeGreaterThan(before.foodProduction / before.revenue);
    expect(after.foodProduction).toBeGreaterThan(before.foodProduction);
  });

  it('lets sustained economic development repair food access gradually', () => {
    const state = createWorldStateV2(2_107);
    const nigeria = nationIdV2('nga');
    const before = selectFoodAccessCeilingV2(state, WORLD_CONTENT_V2, nigeria);
    state.players[nigeria].research.effectLevels['economy-growth'] = 20;
    const after = selectFoodAccessCeilingV2(state, WORLD_CONTENT_V2, nigeria);
    expect(after).toBeGreaterThan(before + 0.02);
    expect(after).toBeLessThan(1);
  });

  it('uses deep economy and logistics research to move, but not erase, the endgame food ceiling', () => {
    const state = createWorldStateV2(2_109);
    const india = nationIdV2('ind');
    const population = state.territories[territoryIdV2('ind')].population;
    const before = selectFoodDemandV2(state, india);
    state.players[india].research.effectLevels['economy-growth'] = 20;
    state.players[india].research.effectLevels.supply = 20;
    const after = selectFoodDemandV2(state, india);
    expect(before).toBeGreaterThan(population * 1.05);
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(population);
  });

  it('does not let Combat Experience create extra manpower food demand', () => {
    const state = createWorldStateV2(2_110);
    const usa = nationIdV2('usa');
    const territory = state.territories[territoryIdV2('usa')];
    territory.army.manpower = 2;
    territory.army.capacity = 20;
    const modestArmy = selectFoodDemandV2(state, usa);
    territory.army.manpower = 20;
    const massArmy = selectFoodDemandV2(state, usa);
    expect(massArmy - modestArmy).toBeGreaterThan(20);
    state.players[usa].combatExperience = 500;
    expect(selectFoodDemandV2(state, usa)).toBeCloseTo(massArmy, 6);
  });

  it('uses real annual deaths once and adds hunger mortality above the net-growth baseline', () => {
    const state = createWorldStateV2(2_108);
    const nigeria = nationIdV2('nga');
    const baseline = WORLD_CONTENT_V2.nations[nigeria].real;
    const dynamics = selectPopulationDynamicsV2(state, WORLD_CONTENT_V2, nigeria);
    expect(baseline.deathRatePerThousand).toBeCloseTo(11.641, 3);
    expect(dynamics.annualDeathRate).toBeGreaterThan(baseline.deathRatePerThousand / 1_000);
    expect(dynamics.annualNetRate).toBeLessThan(baseline.populationGrowthRate / 100);
    expect(dynamics.weeklyDeaths).toBeGreaterThan(0);

    state.players[nigeria].foodSecurity = 1;
    const fed = selectPopulationDynamicsV2(state, WORLD_CONTENT_V2, nigeria, 0);
    expect(fed.annualNetRate).toBeCloseTo(baseline.populationGrowthRate / 100, 5);
  });

  it('makes more land materially increase domestic food capacity', () => {
    const state = createWorldStateV2(2_102);
    const usa = nationIdV2('usa');
    const canada = territoryIdV2('can');
    const before = selectFoodLandCapacityV2(state, WORLD_CONTENT_V2, usa);
    state.territories[canada].owner = usa;
    invalidateTerritoryIndexV2(state);
    const after = selectFoodLandCapacityV2(state, WORLD_CONTENT_V2, usa);
    expect(after).toBeGreaterThan(before * 1.1);
  });

  it('raises demand with actual population instead of abstract maximum manpower', () => {
    const state = createWorldStateV2(2_103);
    const india = nationIdV2('ind');
    const territory = state.territories[territoryIdV2('ind')];
    const before = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, india);
    territory.population *= 1.25;
    state.players[india].foodStock = 0;
    invalidateTerritoryIndexV2(state);
    const after = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, india);
    expect(after.foodDemand).toBeGreaterThan(before.foodDemand * 1.25);
    expect(after.foodProduction).toBeGreaterThan(before.foodProduction);
  });

  it('slows population, economy and recruiting when the treasury cannot feed the country', () => {
    const state = createWorldStateV2(2_104);
    const india = nationIdV2('ind');
    const territory = state.territories[territoryIdV2('ind')];
    territory.population *= 8;
    territory.economy = 0.1;
    state.players[india].treasury = 0;
    state.players[india].foodStock = 0;
    invalidateTerritoryIndexV2(state);
    const populationBefore = territory.population;
    const economyBefore = territory.economy;
    const plans = createFinancePlansV2(state, WORLD_CONTENT_V2);
    expect(plans.get(india)!.foodCoverage).toBeLessThan(0.1);
    processEconomyV2(state, WORLD_CONTENT_V2, plans);
    expect(state.players[india].foodSecurity).toBeLessThan(0.1);
    expect(territory.population).toBeLessThan(populationBefore);
    expect(territory.economy).toBeLessThanOrEqual(economyBefore);
  });

  it('uses cash reserves to protect the population during a genuine food emergency', () => {
    const funded = createWorldStateV2(2_112);
    const unfunded = structuredClone(funded);
    const belgium = nationIdV2('bel');
    for (const state of [funded, unfunded]) {
      state.players[belgium]!.foodStock = 0;
      state.players[belgium]!.foodSecurity = 0.20;
      state.territories[territoryIdV2('bel')]!.population *= 10_000;
      state.territories[territoryIdV2('bel')]!.economy *= 0.0001;
      invalidateTerritoryIndexV2(state);
    }
    funded.players[belgium]!.treasury = 250;
    unfunded.players[belgium]!.treasury = 0;
    const fundedPlan = selectWeeklyFinanceBreakdownV2(funded, WORLD_CONTENT_V2, belgium);
    const unfundedPlan = selectWeeklyFinanceBreakdownV2(unfunded, WORLD_CONTENT_V2, belgium);
    expect(fundedPlan.foodProduction).toBeGreaterThan(unfundedPlan.foodProduction);
    expect(fundedPlan.foodCoverage).toBeGreaterThan(unfundedPlan.foodCoverage);
  });
});
