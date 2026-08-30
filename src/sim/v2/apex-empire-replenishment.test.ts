import { describe, expect, it } from 'vitest';
import {
  createCommanderProfileV1,
  emptyCommanderTalentsV1,
  resolveCommanderForceInitializationV1,
  resolveCountryLoadoutV1,
} from '../../meta/commanderProfile';
import { createWorldStateV2 } from './bootstrap';
import {
  initializeCommanderForceV2,
  selectApexEmpireReplenishmentModifiersV2,
} from './commanderForce';
import { WORLD_CONTENT_V2 } from './content';
import {
  projectFinanceManpowerPhaseV2,
  selectRecruitmentBaseManpowerV2,
  selectRecruitmentTrainingPipelineV2,
  selectTrainedReserveCapacityV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import type {
  CommanderForceInitializationV2,
  PlayerId,
  WorldStateV2,
} from './types';

const APEX_FIXTURE: CommanderForceInitializationV2 = {
  manpower: 0.0008,
  capacity: 0.0008,
  trainedReserves: 0.00008,
  baseAttack: 125,
  baseDefense: 125,
  treasury: 0,
  annualOutput: 0.015,
  supplyStock: 0.010,
  countryTraitScale: 1,
};

function setActiveFill(state: WorldStateV2, playerId: PlayerId, ratio: number): void {
  for (const territory of Object.values(state.territories)) {
    if (territory.owner !== playerId) continue;
    territory.army.manpower = territory.army.capacity * ratio;
  }
}

function fullyFundedPair(
  seed: number,
  empireSupport: CommanderForceInitializationV2['empireSupport'] = {},
): { withApex: WorldStateV2; withoutApex: WorldStateV2; playerId: PlayerId } {
  const withApex = createWorldStateV2(seed, WORLD_CONTENT_V2);
  const playerId = withApex.humanPlayerId;
  expect(initializeCommanderForceV2(withApex, WORLD_CONTENT_V2, playerId, {
    ...APEX_FIXTURE,
    empireSupport,
  })).toEqual({ accepted: true });
  withApex.players[playerId]!.treasury = 1_000_000;
  withApex.players[playerId]!.budget = { military: 90, research: 5, development: 5 };
  withApex.players[playerId]!.trainedReserves = 0;
  setActiveFill(withApex, playerId, 0.50);

  const withoutApex = structuredClone(withApex);
  delete withoutApex.commanderForces[playerId];
  return { withApex, withoutApex, playerId };
}

describe('APEX Empire replenishment network', () => {
  it('publishes exact fixed support without talent scaling', () => {
    const base = resolveCommanderForceInitializationV1(resolveCountryLoadoutV1(
      createCommanderProfileV1(84_100, 'base-support'),
      'grl',
    ));
    expect(base.empireSupport).toEqual({
      recruitmentMultiplier: 1.10,
      reserveTrainingMultiplier: 1.15,
      annualFoodOutput: 0,
      foodProductionMultiplier: 1,
      foodStorageMultiplier: 1,
      foodImportCostMultiplier: 1,
    });

    const talents = emptyCommanderTalentsV1();
    talents['drill-instructors'] = 3;
    talents['reserve-cadre'] = 5;
    talents['frugal-quartermaster'] = 2;
    const progressed = resolveCommanderForceInitializationV1(resolveCountryLoadoutV1({
      ...createCommanderProfileV1(84_100, 'progressed-support'),
      commanderLevel: 10,
      commanderTalents: talents,
    }, 'grl'));
    expect(progressed.empireSupport).toEqual(base.empireSupport);
  });

  it('fills ordinary active forces and trained reserves faster under identical funding', () => {
    const { withApex, withoutApex, playerId } = fullyFundedPair(84_101);
    const activeWithApex = selectWeeklyFinanceBreakdownV2(
      withApex, WORLD_CONTENT_V2, playerId,
    );
    const activeWithoutApex = selectWeeklyFinanceBreakdownV2(
      withoutApex, WORLD_CONTENT_V2, playerId,
    );

    expect(activeWithApex.passiveRecruitment + activeWithApex.acceleratedRecruitment)
      .toBeGreaterThan(activeWithoutApex.passiveRecruitment + activeWithoutApex.acceleratedRecruitment);
    expect(selectRecruitmentTrainingPipelineV2(withApex, WORLD_CONTENT_V2, playerId)
      / selectRecruitmentTrainingPipelineV2(withoutApex, WORLD_CONTENT_V2, playerId))
      // The pipeline stores whole soldiers; the exact 10% support bonus may
      // quantize by one soldier for a tiny national army.
      .toBeCloseTo(1.10, 2);
    expect(activeWithApex.recruitmentAccelerationCost)
      .toBeGreaterThan(activeWithoutApex.recruitmentAccelerationCost);

    setActiveFill(withApex, playerId, 1);
    setActiveFill(withoutApex, playerId, 1);
    const reserveWithApex = selectWeeklyFinanceBreakdownV2(
      withApex, WORLD_CONTENT_V2, playerId,
    );
    const reserveWithoutApex = selectWeeklyFinanceBreakdownV2(
      withoutApex, WORLD_CONTENT_V2, playerId,
    );
    expect(reserveWithApex.reserveTraining).toBeGreaterThan(reserveWithoutApex.reserveTraining);
    expect(reserveWithApex.reserveTraining / reserveWithoutApex.reserveTraining)
      // Weekly manpower is stored to nine decimals; Belgium's tiny pipeline
      // therefore has visible final-digit quantization around the exact 1.15.
      .toBeCloseTo(1.15, 2);
    expect(reserveWithApex.reserveTrainingCost)
      .toBeGreaterThan(reserveWithoutApex.reserveTrainingCost);
  });

  it('still obeys active capacity, reserve capacity and the funded military envelope', () => {
    const { withApex, playerId } = fullyFundedPair(84_102, {
      recruitmentMultiplier: 1.15,
      reserveTrainingMultiplier: 1.30,
    });
    setActiveFill(withApex, playerId, 0.999999);
    const activeBefore = selectRecruitmentBaseManpowerV2(withApex, playerId);
    const activeFinance = selectWeeklyFinanceBreakdownV2(
      withApex, WORLD_CONTENT_V2, playerId,
    );
    const activeProjection = projectFinanceManpowerPhaseV2(
      withApex, WORLD_CONTENT_V2, playerId, activeFinance,
    );
    expect(activeProjection.deployedAfterFinance)
      .toBeLessThanOrEqual(activeBefore.capacity + 0.000000001);

    setActiveFill(withApex, playerId, 1);
    const reserveCapacity = selectTrainedReserveCapacityV2(withApex, playerId);
    const reserveRoom = selectRecruitmentTrainingPipelineV2(
      withApex, WORLD_CONTENT_V2, playerId,
    ) / 4;
    withApex.players[playerId]!.trainedReserves = reserveCapacity - reserveRoom;
    const reserveFinance = selectWeeklyFinanceBreakdownV2(
      withApex, WORLD_CONTENT_V2, playerId,
    );
    // The public finance ledger stores whole soldiers (six decimals in
    // millions). Compare on that same canonical scale; the committed reserve
    // total below remains hard-clamped to capacity.
    expect(reserveFinance.reserveTraining).toBeLessThanOrEqual(
      Math.round(reserveRoom * 1_000_000) / 1_000_000,
    );
    expect(reserveFinance.trainedReservesAfter).toBeLessThanOrEqual(reserveCapacity);

    const legacyFoodSentinel = structuredClone(withApex);
    legacyFoodSentinel.players[playerId]!.foodSecurity = 0;
    expect(selectRecruitmentTrainingPipelineV2(legacyFoodSentinel, WORLD_CONTENT_V2, playerId))
      .toBe(selectRecruitmentTrainingPipelineV2(withApex, WORLD_CONTENT_V2, playerId));

    const unfunded = structuredClone(withApex);
    setActiveFill(unfunded, playerId, 0.50);
    unfunded.players[playerId]!.trainedReserves = 0;
    unfunded.players[playerId]!.treasury = -1_000_000;
    unfunded.players[playerId]!.budget = { military: 0, research: 50, development: 50 };
    const unfundedFinance = selectWeeklyFinanceBreakdownV2(
      unfunded, WORLD_CONTENT_V2, playerId,
    );
    expect(unfundedFinance.mandatoryFundingRatio).toBe(0);
    expect(unfundedFinance.passiveRecruitment + unfundedFinance.acceleratedRecruitment).toBe(0);
    expect(unfundedFinance.reserveTraining).toBe(0);
  });

  it('never boosts AI rivals or another country without its own APEX force', () => {
    const { withApex, withoutApex, playerId } = fullyFundedPair(84_103);
    const rivalId = WORLD_CONTENT_V2.nationIds.find((candidate) => candidate !== playerId)!;
    withApex.players[rivalId]!.treasury = 1_000_000;
    withApex.players[rivalId]!.budget = { military: 90, research: 5, development: 5 };
    withApex.players[rivalId]!.trainedReserves = 0;
    setActiveFill(withApex, rivalId, 0.50);
    Object.assign(withoutApex.players[rivalId]!, structuredClone(withApex.players[rivalId]!));
    setActiveFill(withoutApex, rivalId, 0.50);

    expect(selectApexEmpireReplenishmentModifiersV2(withApex, rivalId)).toEqual({
      recruitmentMultiplier: 1,
      reserveTrainingMultiplier: 1,
    });
    expect(selectRecruitmentTrainingPipelineV2(withApex, WORLD_CONTENT_V2, rivalId))
      .toBe(selectRecruitmentTrainingPipelineV2(withoutApex, WORLD_CONTENT_V2, rivalId));
    expect(selectWeeklyFinanceBreakdownV2(withApex, WORLD_CONTENT_V2, rivalId).reserveTraining)
      .toBe(selectWeeklyFinanceBreakdownV2(withoutApex, WORLD_CONTENT_V2, rivalId).reserveTraining);
  });
});
