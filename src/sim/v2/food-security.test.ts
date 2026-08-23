import { describe, expect, it } from 'vitest';
import { FOOD_TARGET_WEEKS } from './balance';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { createFinancePlansV2, processEconomyV2, processFinanceMilitaryV2 } from './economy';
import {
  invalidateTerritoryIndexV2,
  selectControlledPopulationV2,
  selectFoodAccessCeilingV2,
  selectFoodDemandV2,
  selectFoodLandCapacityV2,
  selectFoodStorageCapacityV2,
  selectNationalIqViewV2,
  selectPopulationDynamicsV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import { nationIdV2, territoryIdV2, type WorldStateV2 } from './types';

function addFoodWar(
  state: WorldStateV2,
  index: number,
  opponent: 'nld' | 'gbr',
  access: 'land' | 'naval',
): void {
  const belgium = nationIdV2('bel');
  const opponentId = nationIdV2(opponent);
  state.wars.push({
    id: `food-war-${index}`,
    attackerId: belgium,
    defenderId: opponentId,
    startedTick: 0,
    lastBattleTick: 0,
    warScore: 0,
    battles: 0,
    attackerLosses: 0,
    defenderLosses: 0,
    lastPeaceOfferTick: -1,
    attackerOperations: [{
      commanderId: belgium,
      sourceId: territoryIdV2('bel'),
      targetId: territoryIdV2(opponent),
      doctrine: 'pressure',
      access,
      startedTick: 0,
      lastBattleTick: 0,
      holdUntilTick: 0,
      momentum: 0,
    }],
    defenderOperations: [],
  });
}

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
    expect(state.players[belgium].foodStock / plan.foodDemand).toBeGreaterThan(FOOD_TARGET_WEEKS * 0.80);
    expect(state.players[belgium].foodStock).toBeLessThanOrEqual(plan.foodStorageCapacity);
    expect(plan.foodCoverage).toBeGreaterThan(0.99);
    expect(plan.foodProduced).toBeGreaterThan(0);
    expect(plan.foodProduction).toBeGreaterThan(0);
    expect(plan.expenses).toBeCloseTo(
      plan.baseOperatingCost + plan.foodProduction + plan.military + plan.research + plan.development,
      5,
    );
  });

  it('never starts a country with more food than its live storage can hold', () => {
    const state = createWorldStateV2(2_113);
    for (const playerId of WORLD_CONTENT_V2.nationIds) {
      const capacity = selectFoodStorageCapacityV2(state, WORLD_CONTENT_V2, playerId);
      expect(state.players[playerId]!.foodStock, String(playerId)).toBeLessThanOrEqual(capacity + 0.000001);
    }
  });

  it('caps opening food without leaving a stale ownership index behind', () => {
    const state = createWorldStateV2(2_116);
    const belgium = nationIdV2('bel');
    const netherlands = territoryIdV2('nld');
    const homePopulation = state.territories[territoryIdV2('bel')]!.population;
    const annexedPopulation = state.territories[netherlands]!.population;
    // Scenario/test setup may legally adjust the freshly returned state before
    // any selector runs; bootstrap must not leak its temporary storage cache.
    state.territories[netherlands]!.owner = belgium;
    state.territories[netherlands]!.integration = 1;
    expect(selectControlledPopulationV2(state, belgium)).toBeCloseTo(
      homePopulation + annexedPopulation,
      6,
    );
  });

  it('turns land, naval and multiple wars into progressively harder food logistics', () => {
    const peace = createWorldStateV2(2_114);
    const landWar = structuredClone(peace);
    const navalWar = structuredClone(peace);
    const multipleWars = structuredClone(peace);
    const belgium = nationIdV2('bel');
    addFoodWar(landWar, 1, 'nld', 'land');
    addFoodWar(navalWar, 1, 'gbr', 'naval');
    addFoodWar(multipleWars, 1, 'nld', 'land');
    addFoodWar(multipleWars, 2, 'gbr', 'naval');

    const peacePlan = selectWeeklyFinanceBreakdownV2(peace, WORLD_CONTENT_V2, belgium);
    const landPlan = selectWeeklyFinanceBreakdownV2(landWar, WORLD_CONTENT_V2, belgium);
    const navalPlan = selectWeeklyFinanceBreakdownV2(navalWar, WORLD_CONTENT_V2, belgium);
    const multiplePlan = selectWeeklyFinanceBreakdownV2(multipleWars, WORLD_CONTENT_V2, belgium);

    expect(peacePlan.foodCoverage).toBe(1);
    expect(landPlan.foodCoverage).toBe(1);
    expect(navalPlan.foodCoverage).toBe(1);
    expect(multiplePlan.foodCoverage).toBe(1);
    expect(landPlan.foodDemand).toBeGreaterThan(peacePlan.foodDemand);
    expect(navalPlan.foodDemand).toBeGreaterThan(landPlan.foodDemand);
    expect(multiplePlan.foodDemand).toBeGreaterThan(navalPlan.foodDemand);
    expect(multiplePlan.foodImported / multiplePlan.foodDemand)
      .toBeLessThan(landPlan.foodImported / landPlan.foodDemand);
  });

  it('draws wartime reserves gradually while peace keeps a full opening store', () => {
    const peace = createWorldStateV2(2_115);
    const war = structuredClone(peace);
    const belgium = nationIdV2('bel');
    addFoodWar(war, 1, 'gbr', 'naval');
    const peacePlan = selectWeeklyFinanceBreakdownV2(peace, WORLD_CONTENT_V2, belgium);
    const warPlan = selectWeeklyFinanceBreakdownV2(war, WORLD_CONTENT_V2, belgium);

    expect(peacePlan.foodStockChange).toBeGreaterThanOrEqual(-0.0001);
    expect(warPlan.foodStockChange).toBeLessThan(peacePlan.foodStockChange);
    expect(warPlan.foodStockChange).toBeLessThan(0);
    expect(warPlan.foodCoverage).toBeGreaterThan(0.95);

    const stockBefore = war.players[belgium]!.foodStock;
    processFinanceMilitaryV2(war, WORLD_CONTENT_V2, new Map([[belgium, warPlan]]));
    expect(war.players[belgium]!.foodStock).toBeCloseTo(stockBefore + warPlan.foodStockChange, 5);
  });

  it('starts Nigeria fed but with a smaller buffer and a real structural financial burden', () => {
    const state = createWorldStateV2(2_105);
    const nigeria = nationIdV2('nga');
    const plan = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, nigeria);
    const stockWeeks = state.players[nigeria].foodStock / plan.foodDemand;
    expect(WORLD_CONTENT_V2.nations[nigeria].real.foodInsecurityRate).toBeCloseTo(0.146, 3);
    expect(stockWeeks).toBeGreaterThan(2);
    expect(stockWeeks).toBeLessThan(3);
    expect(plan.foodCoverage).toBe(1);
    expect(plan.foodProduced).toBeLessThan(plan.foodDemand);
    expect(plan.foodStockChange).toBeLessThan(0);
    expect(plan.foodProduction / plan.revenue).toBeGreaterThan(0.10);
    expect(state.players[nigeria].foodSecurity).toBe(1);
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

  it('bases army food demand on deployed manpower rather than unused capacity', () => {
    const state = createWorldStateV2(2_110);
    const usa = nationIdV2('usa');
    const territory = state.territories[territoryIdV2('usa')];
    territory.army.manpower = 2;
    territory.army.capacity = 20;
    const modestArmy = selectFoodDemandV2(state, usa);
    territory.army.manpower = 20;
    const massArmy = selectFoodDemandV2(state, usa);
    expect(massArmy - modestArmy).toBeGreaterThan(20);
    expect(selectFoodDemandV2(state, usa)).toBeCloseTo(massArmy, 6);
  });

  it('uses real annual deaths once and adds hunger mortality above the net-growth baseline', () => {
    const state = createWorldStateV2(2_108);
    const nigeria = nationIdV2('nga');
    const baseline = WORLD_CONTENT_V2.nations[nigeria].real;
    const dynamics = selectPopulationDynamicsV2(state, WORLD_CONTENT_V2, nigeria);
    expect(baseline.deathRatePerThousand).toBeCloseTo(11.641, 3);
    expect(dynamics.annualDeathRate).toBeCloseTo(baseline.deathRatePerThousand / 1_000, 6);
    expect(dynamics.weeklyDeaths).toBeGreaterThan(0);

    state.players[nigeria].foodSecurity = 1;
    const fed = selectPopulationDynamicsV2(state, WORLD_CONTENT_V2, nigeria, 0);
    const baselineDeathRate = baseline.deathRatePerThousand / 1_000;
    const baselineNetRate = baseline.populationGrowthRate / 100;
    const iqPopulationMultiplier = selectNationalIqViewV2(
      WORLD_CONTENT_V2,
      nigeria,
    ).populationGrowthMultiplier;
    expect(fed.annualNetRate).toBeCloseTo(
      (baselineDeathRate + baselineNetRate) * iqPopulationMultiplier - baselineDeathRate,
      5,
    );
  });

  it('starts extra reserve-starvation mortality below ten percent instead of waiting for zero', () => {
    const state = createWorldStateV2(2_117);
    const nigeria = nationIdV2('nga');
    state.players[nigeria].foodSecurity = 0.80;
    const targetStock = selectWeeklyFinanceBreakdownV2(
      state, WORLD_CONTENT_V2, nigeria,
    ).foodTargetStock;
    state.players[nigeria].foodStock = targetStock * 0.10;
    const threshold = selectPopulationDynamicsV2(state, WORLD_CONTENT_V2, nigeria, 0);

    state.players[nigeria].foodStock = targetStock * 0.09;
    const belowTenPercent = selectPopulationDynamicsV2(
      state, WORLD_CONTENT_V2, nigeria, 0,
    );

    state.players[nigeria].foodStock = 0;
    const empty = selectPopulationDynamicsV2(state, WORLD_CONTENT_V2, nigeria, 0);

    expect(belowTenPercent.annualDeathRate).toBeGreaterThan(threshold.annualDeathRate);
    expect(empty.annualDeathRate).toBeGreaterThan(threshold.annualDeathRate + 0.015);
    expect(empty.annualNetRate).toBeLessThan(0);
    expect(empty.weeklyNet).toBeLessThan(0);
  });

  it('raises preventive food purchasing smoothly as the strategic stock falls', () => {
    const state = createWorldStateV2(2_118);
    const singapore = nationIdV2('sgp');
    state.players[singapore].treasury = 1_000;
    state.players[singapore].foodSecurity = 1;
    const targetStock = selectWeeklyFinanceBreakdownV2(
      state, WORLD_CONTENT_V2, singapore,
    ).foodTargetStock;
    const spendingAt = (stockShare: number) => {
      state.players[singapore].foodStock = targetStock * stockShare;
      return selectWeeklyFinanceBreakdownV2(
        state, WORLD_CONTENT_V2, singapore,
      ).foodProduction;
    };

    const full = spendingAt(1);
    const half = spendingAt(0.5);
    const critical = spendingAt(0.1);
    expect(half).toBeGreaterThan(full);
    expect(critical).toBeGreaterThan(half);
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
