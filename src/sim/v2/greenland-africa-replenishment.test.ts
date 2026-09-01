import { describe, expect, it } from 'vitest';
import {
  createCommanderProfileV1,
  resolveCommanderForceInitializationV1,
  resolveCountryLoadoutV1,
} from '../../meta/commanderProfile';
import { createWorldStateV2 } from './bootstrap';
import { territoryArmyCapacityTargetV2 } from './capacity';
import { initializeCommanderForceV2 } from './commanderForce';
import { WORLD_CONTENT_V2 } from './content';
import { createFinancePlansV2, processFinanceMilitaryV2 } from './economy';
import {
  invalidateTerritoryIndexV2,
  selectNationalEconomyV2,
  selectRecruitmentBaseManpowerV2,
  selectRecruitmentTrainingPipelineV2,
  selectTerritoriesOfV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import {
  nationIdV2,
  territoryIdV2,
  type FrontOperationV2,
  type WarStateV2,
  type WorldStateV2,
} from './types';
import {
  INTERNAL_NAVAL_TRANSFER_WEEKLY_TREASURY_SHARE_MAX_V2,
  internalArmyTransferLogisticsTermsV2,
  internalNavalTransferWillingnessV2,
  redistributeArmiesV2,
  resolveBattlePulseV2,
} from './war';

const GREENLAND = nationIdV2('grl');
const GUINEA_BISSAU = nationIdV2('gnb');
const GREENLAND_TERRITORY = territoryIdV2('grl');
const GUINEA_BISSAU_TERRITORY = territoryIdV2('gnb');

function conqueredGreenlandBeachhead(): WorldStateV2 {
  const state = createWorldStateV2(84_601, WORLD_CONTENT_V2);
  state.humanPlayerId = GREENLAND;
  state.humanPlayerIds = [GREENLAND];
  const profile = createCommanderProfileV1(1, 'greenland-africa-replenishment');
  expect(initializeCommanderForceV2(
    state,
    WORLD_CONTENT_V2,
    GREENLAND,
    resolveCommanderForceInitializationV1(resolveCountryLoadoutV1(profile, GREENLAND)),
  )).toEqual({ accepted: true });
  state.territories[GUINEA_BISSAU_TERRITORY]!.army.manpower = 0;
  const operation: FrontOperationV2 = {
    commanderId: GREENLAND,
    sourceId: GREENLAND_TERRITORY,
    targetId: GUINEA_BISSAU_TERRITORY,
    doctrine: 'breakthrough',
    access: 'naval',
    startedTick: 0,
    lastBattleTick: 0,
    holdUntilTick: 12,
    momentum: 0,
  };
  const war: WarStateV2 = {
    id: 'war-greenland-africa-replenishment',
    attackerId: GREENLAND,
    defenderId: GUINEA_BISSAU,
    startedTick: 0,
    lastBattleTick: 0,
    warScore: 0,
    battles: 0,
    attackerLosses: 0,
    defenderLosses: 0,
    lastPeaceOfferTick: -1,
    attackerOperations: [operation],
    defenderOperations: [],
  };
  state.wars = [war];
  expect(resolveBattlePulseV2(state, WORLD_CONTENT_V2, war, operation)?.conquered).toBe(true);
  state.wars = [];
  invalidateTerritoryIndexV2(state);
  return state;
}

function prepareLowStaffedBeachhead(state: WorldStateV2): void {
  const greenland = state.players[GREENLAND]!;
  const beachhead = state.territories[GUINEA_BISSAU_TERRITORY]!;
  const source = state.territories[GREENLAND_TERRITORY]!;
  beachhead.army.manpower = beachhead.army.capacity * 0.01;
  source.army.manpower = source.army.capacity * 0.9;
  greenland.treasury = 0.01;
  greenland.budget = { military: 80, research: 10, development: 10 };
}

function advanceReplenishment(
  state: WorldStateV2,
  weeks: number,
): { moved: number; cost: number; trained: number; recruited: number } {
  let moved = 0;
  let cost = 0;
  let trained = 0;
  let recruited = 0;
  for (let week = 0; week < weeks; week += 1) {
    const plans = createFinancePlansV2(state, WORLD_CONTENT_V2);
    const finance = plans.get(GREENLAND)!;
    trained += finance.reserveTraining;
    recruited += finance.passiveRecruitment + finance.acceleratedRecruitment;
    processFinanceMilitaryV2(state, WORLD_CONTENT_V2, plans);
    const routeMoves = redistributeArmiesV2(state, WORLD_CONTENT_V2)
      .filter((movement) => movement.playerId === GREENLAND);
    const weeklyMoved = routeMoves.reduce((sum, movement) => sum + movement.manpower, 0);
    const weeklyCost = routeMoves.reduce((sum, movement) => sum + movement.logisticsCost, 0);
    moved += weeklyMoved;
    cost += weeklyCost;
    state.tick += 1;
  }
  return { moved, cost, trained, recruited };
}

describe('Greenland to Africa post-conquest replenishment', () => {
  it('visibly rebuilds both shattered territories during the calm recovery phase', () => {
    const state = conqueredGreenlandBeachhead();
    const greenland = state.players[GREENLAND]!;
    const home = state.territories[GREENLAND_TERRITORY]!;
    const beachhead = state.territories[GUINEA_BISSAU_TERRITORY]!;
    home.army.manpower = home.army.capacity * 0.02;
    beachhead.army.manpower = beachhead.army.capacity * 0.03;
    greenland.trainedReserves = 0;
    // This is intentionally the cash-poor post-war situation observed in a
    // real Greenland run, not an artificially rich sandbox.
    greenland.treasury = 0.01;
    greenland.budget = { military: 80, research: 10, development: 10 };
    const homeBefore = home.army.manpower / home.army.capacity;
    const beachheadBefore = beachhead.army.manpower / beachhead.army.capacity;

    const result = advanceReplenishment(state, 8);
    const homeAfter = home.army.manpower / home.army.capacity;
    const beachheadAfter = beachhead.army.manpower / beachhead.army.capacity;

    expect(result.recruited).toBeGreaterThan(0);
    expect(homeAfter).toBeGreaterThan(homeBefore + 0.015);
    expect(beachheadAfter).toBeGreaterThan(beachheadBefore + 0.015);
  });

  it('raises post-conquest Army Ready visibly at 13 and 26 weeks within capacity and funding', () => {
    const state = conqueredGreenlandBeachhead();
    const greenland = state.players[GREENLAND]!;
    const home = state.territories[GREENLAND_TERRITORY]!;
    const beachhead = state.territories[GUINEA_BISSAU_TERRITORY]!;
    home.army.manpower = home.army.capacity * 0.02;
    beachhead.army.manpower = beachhead.army.capacity * 0.03;
    greenland.trainedReserves = 0;
    greenland.treasury = 0.01;
    greenland.budget = { military: 80, research: 10, development: 10 };
    const snapshot = () => {
      const army = selectRecruitmentBaseManpowerV2(state, GREENLAND);
      const finance = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, GREENLAND);
      return {
        tick: state.tick,
        readiness: army.deployed / army.capacity,
        deployed: army.deployed,
        capacity: army.capacity,
        home: home.army.manpower / home.army.capacity,
        beachhead: beachhead.army.manpower / beachhead.army.capacity,
        integration: beachhead.integration,
        treasury: greenland.treasury,
        weeklyRevenue: finance.revenue,
        retiredCommodityCost: finance.foodProduction,
        retiredCommodityCoverage: finance.foodCoverage,
        military: finance.military,
        upkeep: finance.armyUpkeep,
        funding: finance.mandatoryFundingRatio,
        passiveRecruitment: finance.passiveRecruitment,
        acceleratedRecruitment: finance.acceleratedRecruitment,
        reserveTraining: finance.reserveTraining,
      };
    };
    const opening = snapshot();
    const first = advanceReplenishment(state, 13);
    const week13 = snapshot();
    const second = advanceReplenishment(state, 13);
    const week26 = snapshot();

    // Foreign recruitment capacity belongs to the local country structure;
    // Greenland's unusually high opening force/population ratio must never be
    // projected over every new resident of Guinea-Bissau.
    const localPopulation = beachhead.population;
    expect(territoryArmyCapacityTargetV2(
      WORLD_CONTENT_V2,
      GUINEA_BISSAU_TERRITORY,
      GREENLAND,
      localPopulation,
      0,
      1,
    )).toBe(territoryArmyCapacityTargetV2(
      WORLD_CONTENT_V2,
      GUINEA_BISSAU_TERRITORY,
      GUINEA_BISSAU,
      localPopulation,
      0,
      1,
    ));

    expect(first.recruited).toBeGreaterThan(0);
    expect(second.recruited).toBeGreaterThan(0);
    expect(first.trained + second.trained).toBe(0);
    // The fixed one-percent peace curve remains visibly material even while
    // the integrating beachhead expands the denominator beneath it.
    expect(week13.readiness).toBeGreaterThan(opening.readiness + 0.075);
    expect(week26.readiness).toBeGreaterThan(week13.readiness + 0.015);
    expect(week26.home).toBeGreaterThan(opening.home + 0.04);
    expect(week26.beachhead).toBeGreaterThan(opening.beachhead + 0.12);

    // This remains a real integration and finance simulation. Local capacity
    // expands while direct active recruitment stays inside real funding.
    expect(week26.integration).toBeGreaterThan(opening.integration);
    expect(week26.capacity).toBeGreaterThan(opening.capacity);
    expect(week26.retiredCommodityCost).toBe(0);
    expect(week26.retiredCommodityCoverage).toBe(1);
    // The deliberately faster peace rebuild fields materially more soldiers.
    expect(week26.funding).toBe(1);
    expect(week26.military).toBeGreaterThan(week26.upkeep);
  });

  it('keeps a real African coastal bridgehead moving on its bounded naval route', () => {
    const state = conqueredGreenlandBeachhead();
    prepareLowStaffedBeachhead(state);
    const greenland = state.players[GREENLAND]!;
    const beachhead = state.territories[GUINEA_BISSAU_TERRITORY]!;
    const beachheadBefore = beachhead.army.manpower;
    const reservesBefore = greenland.trainedReserves;
    const quote = internalArmyTransferLogisticsTermsV2(
      state,
      WORLD_CONTENT_V2,
      GREENLAND,
      GREENLAND_TERRITORY,
      GUINEA_BISSAU_TERRITORY,
      1,
    );
    const treasuryWeeks = greenland.treasury / Math.max(
      0.001,
      selectNationalEconomyV2(state, WORLD_CONTENT_V2, GREENLAND).weeklyRevenue,
    );
    expect(quote.access).toBe('naval');
    expect(quote.distanceKm).toBeGreaterThan(6_000);
    expect(quote.throughputMultiplier).toBeGreaterThanOrEqual(0.10);
    expect(quote.throughputMultiplier).toBeLessThan(0.75);
    expect(quote.costPerMillion).toBeGreaterThan(0);
    // Cash and distance no longer create a hidden willingness gate.
    expect(internalNavalTransferWillingnessV2(
      quote.distanceKm, treasuryWeeks, false,
    )).toBe(1);
    expect(internalNavalTransferWillingnessV2(
      quote.distanceKm, treasuryWeeks, true,
    )).toBe(1);

    // Prove the physical path independently from local post-conquest
    // recruitment. This is the exact redistribution phase that used to stall.
    const treasuryBeforeRoute = greenland.treasury;
    const routeCapacity = state.territories[GREENLAND_TERRITORY]!.army.capacity * 0.10;
    const openingMoves = redistributeArmiesV2(state, WORLD_CONTENT_V2)
      .filter((movement) => movement.playerId === GREENLAND);
    const openingMoved = openingMoves.reduce((sum, movement) => sum + movement.manpower, 0);
    const openingCost = openingMoves.reduce((sum, movement) => sum + movement.logisticsCost, 0);
    expect(openingMoves.length).toBeGreaterThan(0);
    expect(openingMoves.every((movement) => movement.sourceId === GREENLAND_TERRITORY
      && movement.targetId === GUINEA_BISSAU_TERRITORY
      && movement.access === 'naval'
      && movement.distanceKm > 5_000
      && movement.logisticsCost > 0)).toBe(true);
    expect(openingMoved).toBeGreaterThan(0);
    expect(openingMoved).toBeLessThanOrEqual(routeCapacity + 0.000000001);
    expect(openingCost).toBeLessThanOrEqual(
      treasuryBeforeRoute * INTERNAL_NAVAL_TRANSFER_WEEKLY_TREASURY_SHARE_MAX_V2
        + 0.000000001,
    );

    // Then run the production ordering used by the engine: finance first,
    // route redistribution second. Local training may close part of the gap,
    // so the result is readiness rather than mandatory weekly telemetry.
    const result = advanceReplenishment(state, 26);
    expect(openingMoved + result.moved).toBeGreaterThan(0.001);
    expect(result.cost).toBeGreaterThan(0);
    expect(beachhead.army.manpower).toBeGreaterThan(beachheadBefore);
    expect(greenland.trainedReserves).toBeGreaterThanOrEqual(reservesBefore);
    expect(result.trained).toBe(0);
    expect(result.recruited).toBeGreaterThan(0);
  });

  it('lets EONSCAR improve the same bounded replenishment loop without changing the route', () => {
    const withApex = conqueredGreenlandBeachhead();
    prepareLowStaffedBeachhead(withApex);
    const neutralSupport = structuredClone(withApex);
    const force = neutralSupport.commanderForces[GREENLAND]!;
    force.empireSupport = {
      ...force.empireSupport,
      recruitmentMultiplier: 1,
      reserveTrainingMultiplier: 1,
    };

    expect(selectRecruitmentTrainingPipelineV2(withApex, WORLD_CONTENT_V2, GREENLAND))
      // The public weekly ledger stores whole soldiers. A tiny empire can
      // quantize a sub-soldier APEX edge in one isolated week; the 26-week
      // authoritative result below must still show the accumulated benefit.
      .toBeGreaterThanOrEqual(selectRecruitmentTrainingPipelineV2(
        neutralSupport, WORLD_CONTENT_V2, GREENLAND,
      ));
    const apexResult = advanceReplenishment(withApex, 26);
    const neutralResult = advanceReplenishment(neutralSupport, 26);
    expect(apexResult.recruited).toBeGreaterThan(neutralResult.recruited);
    expect(apexResult.trained).toBeGreaterThanOrEqual(neutralResult.trained);
    expect(apexResult.moved).toBeGreaterThan(neutralResult.moved);
    expect(withApex.territories[GUINEA_BISSAU_TERRITORY]!.army.manpower)
      .toBeGreaterThan(neutralSupport.territories[GUINEA_BISSAU_TERRITORY]!.army.manpower);
  });

  it('keeps a fully liberated overseas land border strategically supplied', () => {
    const state = conqueredGreenlandBeachhead();
    prepareLowStaffedBeachhead(state);
    const beachhead = state.territories[GUINEA_BISSAU_TERRITORY]!;
    beachhead.integration = 1;
    beachhead.coreOwner = GREENLAND;
    delete beachhead.integrationProgram;
    const before = beachhead.army.manpower;
    const quote = internalArmyTransferLogisticsTermsV2(
      state,
      WORLD_CONTENT_V2,
      GREENLAND,
      GREENLAND_TERRITORY,
      GUINEA_BISSAU_TERRITORY,
      1,
    );
    const treasuryWeeks = state.players[GREENLAND]!.treasury / Math.max(
      0.001,
      selectNationalEconomyV2(state, WORLD_CONTENT_V2, GREENLAND).weeklyRevenue,
    );

    expect(quote.distanceKm).toBeGreaterThan(6_000);
    expect(internalNavalTransferWillingnessV2(
      quote.distanceKm,
      treasuryWeeks,
      false,
      true,
    )).toBeGreaterThanOrEqual(0.35);

    const movements = redistributeArmiesV2(state, WORLD_CONTENT_V2)
      .filter((movement) => movement.playerId === GREENLAND
        && movement.targetId === GUINEA_BISSAU_TERRITORY);
    expect(movements.some((movement) => movement.access === 'naval'
      && movement.distanceKm > 5_000
      && movement.manpower > 0
      && movement.logisticsCost > 0)).toBe(true);
    expect(beachhead.army.manpower).toBeGreaterThan(before);
  });
});
