import { describe, expect, it } from 'vitest';
import { selectAiResearchAllocationsV2 } from './ai';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { optimizeNationalAiPlanV2 } from './nationalAi';
import {
  createPowerSnapshotV2,
  selectWeeklyFinanceBreakdownV2,
  projectFinanceManpowerPhaseV2,
  selectWeeklyManpowerProjectionV2,
  selectTotalManpowerV2,
} from './selectors';
import { nationIdV2, territoryIdV2 } from './types';
import { WorldEngineV2 } from './WorldEngineV2';

const belgium = nationIdV2('bel');
const nigeria = nationIdV2('nga');

describe('V2 authoritative manpower projection', () => {
  it('uses a paid peace fast-track and finite trained reserves for wartime replacement', () => {
    const peace = createWorldStateV2(2_398);
    peace.wars = [];
    peace.players[belgium]!.budget = { military: 70, research: 10, development: 20 };
    peace.players[belgium]!.treasury = 1_000;
    for (const territory of Object.values(peace.territories)) {
      if (territory.owner === belgium) territory.army.manpower = territory.army.capacity * 0.40;
    }
    const peaceFinance = selectWeeklyFinanceBreakdownV2(peace, WORLD_CONTENT_V2, belgium);
    const war = structuredClone(peace);
    war.players[belgium]!.trainedReserves = selectTotalManpowerV2(war, belgium).capacity * 2;
    war.wars = [{
      id: 'mobilization-war', attackerId: belgium, defenderId: nationIdV2('nld'),
      startedTick: 0, lastBattleTick: 0, warScore: 0, battles: 0,
      attackerLosses: 0, defenderLosses: 0, lastPeaceOfferTick: -1_000_000,
      attackerOperations: [], defenderOperations: [],
    }];
    const warFinance = selectWeeklyFinanceBreakdownV2(war, WORLD_CONTENT_V2, belgium);

    expect(peaceFinance.passiveRecruitment).toBeGreaterThan(0);
    expect(peaceFinance.acceleratedRecruitment).toBeGreaterThan(0);
    expect(warFinance.passiveRecruitment).toBe(0);
    expect(warFinance.acceleratedRecruitment).toBe(0);
    expect(warFinance.reserveDeployment).toBeGreaterThan(0);
    expect(warFinance.reserveTraining).toBeGreaterThan(0);
    expect(warFinance.trainedReservesAfter).toBeLessThan(warFinance.trainedReservesBefore);
    expect(warFinance.recruitmentAccelerationCost).toBeGreaterThan(0);
  });

  it('does not demobilize a healthy post-war army merely because territory needs repair', () => {
    const state = createWorldStateV2(2_397);
    state.wars = [];
    const army = state.territories[territoryIdV2('bel')]!.army;
    army.manpower = army.capacity * 0.80;
    state.territories[territoryIdV2('bel')]!.condition = 0.40;
    state.players[belgium]!.budget = { military: 5, research: 5, development: 90 };
    state.players[belgium]!.treasury = 1_000_000;
    state.players[belgium]!.foodStock = 1_000_000;
    state.players[belgium]!.foodSecurity = 1;
    const finance = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    const projection = projectFinanceManpowerPhaseV2(state, WORLD_CONTENT_V2, belgium, finance);

    expect(finance.mandatoryFundingRatio).toBeGreaterThan(0);
    expect(finance.mandatoryFundingRatio).toBeLessThan(1);
    expect(finance.acceleratedDemobilization).toBe(0);
    expect(finance.demobilizationCost).toBe(0);
    expect(projection.demobilized).toBeCloseTo(0, 12);
    expect(projection.recruited).toBeGreaterThan(0);
    expect(projection.deployedAfterFinance).toBeGreaterThan(projection.deployedBefore);
  });

  it('keeps recruiting a solvent post-war country even when already at 99% capacity', () => {
    for (const fillRatio of [0.80, 0.95, 0.99]) {
      const state = createWorldStateV2(2_397_1);
      state.wars = [];
      const army = state.territories[territoryIdV2('bel')]!.army;
      army.manpower = army.capacity * fillRatio;
      state.territories[territoryIdV2('bel')]!.condition = 0.40;
      state.players[belgium]!.warFatigue = 35;
      state.players[belgium]!.budget = { military: 5, research: 5, development: 90 };
      state.players[belgium]!.treasury = 1_000_000;
      state.players[belgium]!.foodStock = 1_000_000;
      state.players[belgium]!.foodSecurity = 1;

      const finance = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
      const projection = projectFinanceManpowerPhaseV2(state, WORLD_CONTENT_V2, belgium, finance);
      expect(projection.demobilized, `demobilization at ${fillRatio}`).toBeCloseTo(0, 12);
      expect(projection.recruited, `recruitment at ${fillRatio}`).toBeGreaterThan(0);
      expect(projection.deployedAfterFinance, `deployed at ${fillRatio}`)
        .toBeGreaterThan(projection.deployedBefore);
    }
  });

  it('matches the actual next peace week after funded recruitment and territory caps', () => {
    const engine = new WorldEngineV2(2_401);
    engine.state.wars = engine.state.wars.filter((war) => (
      war.attackerId !== belgium && war.defenderId !== belgium
    ));
    const army = engine.state.territories[territoryIdV2('bel')]!.army;
    army.manpower = army.capacity * 0.55;
    const before = engine.totalManpower(belgium).deployed;
    const projection = engine.weeklyManpowerProjection(belgium);

    expect(projection.exactNextWeek).toBe(true);
    expect(projection.battleLossesAreEstimate).toBe(false);
    expect(projection.recruited).toBeGreaterThan(0);
    engine.step();

    const actual = engine.totalManpower(belgium).deployed - before;
    expect(actual).toBeCloseTo(projection.net, 6);
    expect(engine.weeklyManpowerTrend(belgium)).toBeGreaterThanOrEqual(0);
  });

  it('demobilizes only gradually when food and debt make payroll genuinely unaffordable', () => {
    const engine = new WorldEngineV2(2_402);
    engine.state.wars = [];
    const army = engine.state.territories[territoryIdV2('bel')]!.army;
    army.manpower = army.capacity;
    engine.state.territories[territoryIdV2('bel')]!.economy = 0.10;
    engine.state.players[belgium]!.budget = { military: 5, research: 5, development: 90 };
    engine.state.players[belgium]!.foodStock = 0;
    engine.state.players[belgium]!.foodSecurity = 0.10;
    engine.state.players[belgium]!.treasury = -1_000;
    const finance = selectWeeklyFinanceBreakdownV2(engine.state, WORLD_CONTENT_V2, belgium);
    const projection = engine.weeklyManpowerProjection(belgium);

    expect(finance.mandatoryFundingRatio).toBeLessThan(1);
    expect(projection.demobilized).toBeGreaterThan(0);
    expect(projection.demobilized).toBeLessThan(projection.deployedBefore * 0.01);
    expect(projection.deployedBefore - projection.demobilized).toBeGreaterThan(
      projection.deployedBefore * 0.99,
    );
  });

  it('marks battle-week losses as an estimate while keeping the finance phase exact', () => {
    const state = createWorldStateV2(2_403);
    state.tick = 30;
    state.wars = [{
      id: 'projection-war', attackerId: belgium, defenderId: nationIdV2('nld'),
      startedTick: 10, lastBattleTick: 30, warScore: 0, battles: 4,
      attackerLosses: 0.12, defenderLosses: 0.08, lastPeaceOfferTick: -1_000_000,
      attackerOperations: [], defenderOperations: [],
    }];
    const projection = selectWeeklyManpowerProjectionV2(state, WORLD_CONTENT_V2, belgium);
    expect(projection.exactNextWeek).toBe(false);
    expect(projection.battleLossesAreEstimate).toBe(true);
    expect(projection.estimatedBattleLosses).toBeGreaterThan(0);
    expect(projection.net).toBeCloseTo(
      projection.financePhaseNet - projection.estimatedBattleLosses,
      6,
    );
  });
});

describe('V2 food-aware national AI', () => {
  it('uses low condition for reconstruction without authorizing demobilization', () => {
    const state = createWorldStateV2(2_400);
    state.wars = [];
    for (const territory of Object.values(state.territories)) {
      if (territory.owner !== belgium) continue;
      territory.army.manpower = territory.army.capacity * 0.80;
    }
    state.players[belgium]!.budget = { military: 5, research: 5, development: 90 };
    state.players[belgium]!.treasury = 1_000_000;
    state.players[belgium]!.foodStock = 1_000_000;
    state.players[belgium]!.foodSecurity = 1;
    state.territories[territoryIdV2('bel')]!.condition = 0.45;
    const finance = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    const projection = projectFinanceManpowerPhaseV2(state, WORLD_CONTENT_V2, belgium, finance);
    expect(finance.aiMode).toBe('rebuild');
    expect(finance.acceleratedDemobilization).toBe(0);
    expect(projection.demobilized).toBeCloseTo(0, 12);
    expect(projection.recruited).toBeGreaterThan(0);
  });

  it('keeps an emergency home guard even during a severe food and debt crisis', () => {
    const state = createWorldStateV2(2_399);
    state.wars = [];
    for (const territory of Object.values(state.territories)) {
      if (territory.owner !== belgium) continue;
      territory.army.manpower = territory.army.capacity * 0.25;
    }
    state.players[belgium]!.budget = { military: 5, research: 5, development: 90 };
    state.players[belgium]!.foodStock = 0;
    state.players[belgium]!.foodSecurity = 0.1;
    state.players[belgium]!.treasury = -1_000;
    const finance = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    const projection = projectFinanceManpowerPhaseV2(state, WORLD_CONTENT_V2, belgium, finance);
    const capacity = projection.territories.reduce((sum, army) => sum + army.capacity, 0);

    expect(projection.deployedAfterDemobilization).toBeGreaterThanOrEqual(capacity * 0.25 - 0.000001);
  });

  it('moves finite ordinary budget toward development and research as food stress rises', () => {
    const common = {
      intent: { military: 35, research: 15, development: 50 } as const,
      activeWars: 0,
      fillRatio: 1,
      averageCondition: 1,
      researchGap: 0,
      treasuryWeeks: 8,
      iqScore: 100,
    };
    const healthy = optimizeNationalAiPlanV2({ ...common, foodSecurity: 1 });
    const strained = optimizeNationalAiPlanV2({ ...common, foodSecurity: 0.72 });
    const crisis = optimizeNationalAiPlanV2({ ...common, foodSecurity: 0.35 });
    expect(strained.activeBudget.research).toBeGreaterThan(healthy.activeBudget.research);
    expect(crisis.activeBudget.research).toBeGreaterThan(strained.activeBudget.research);
    expect(crisis.activeBudget.development + crisis.activeBudget.research)
      .toBeGreaterThan(healthy.activeBudget.development + healthy.activeBudget.research);
    expect(Object.values(crisis.activeBudget).reduce((sum, value) => sum + value, 0)).toBe(100);
    expect(crisis.explanation).toMatch(/food/i);
  });

  it('concentrates stressed research on Economy & Science and Logistics & Medicine', () => {
    const healthy = createWorldStateV2(2_404);
    const crisis = structuredClone(healthy);
    healthy.players[nigeria]!.foodSecurity = 0.99;
    crisis.players[nigeria]!.foodSecurity = 0.35;
    const healthyAllocations = selectAiResearchAllocationsV2(
      healthy, WORLD_CONTENT_V2, nigeria, createPowerSnapshotV2(healthy, WORLD_CONTENT_V2),
    );
    const crisisAllocations = selectAiResearchAllocationsV2(
      crisis, WORLD_CONTENT_V2, nigeria, createPowerSnapshotV2(crisis, WORLD_CONTENT_V2),
    );
    const foodResearch = (allocations: typeof healthyAllocations) => (
      allocations['economy-science'] + allocations['logistics-medicine']
    );
    expect(foodResearch(crisisAllocations)).toBeGreaterThan(foodResearch(healthyAllocations) + 15);
    expect(crisisAllocations['population-recruitment'])
      .toBeLessThan(healthyAllocations['population-recruitment']);
  });

  it('fully prioritizes a shortage and exposes authoritative military costs', () => {
    const healthy = createWorldStateV2(2_405);
    const crisis = structuredClone(healthy);
    healthy.players[nigeria]!.foodStock = 0;
    crisis.players[nigeria]!.foodStock = 0;
    healthy.players[nigeria]!.foodSecurity = 0.99;
    crisis.players[nigeria]!.foodSecurity = 0.35;
    const healthyFinance = selectWeeklyFinanceBreakdownV2(healthy, WORLD_CONTENT_V2, nigeria);
    const crisisFinance = selectWeeklyFinanceBreakdownV2(crisis, WORLD_CONTENT_V2, nigeria);

    expect(crisisFinance.foodProduction).toBeGreaterThanOrEqual(healthyFinance.foodProduction);
    expect(crisisFinance.foodCoverage).toBe(1);
    expect(crisisFinance.foodProduction).toBeLessThanOrEqual(crisisFinance.expenses);
    expect(crisisFinance.totalMilitaryCost).toBeCloseTo(
      crisisFinance.military + crisisFinance.warOperations,
      6,
    );
    expect(crisisFinance.fundedArmyUpkeep).toBeCloseTo(
      Math.min(crisisFinance.military, crisisFinance.armyUpkeep),
      6,
    );
    expect(selectTotalManpowerV2(crisis, nigeria).deployed).toBeGreaterThan(0);
  });
});
