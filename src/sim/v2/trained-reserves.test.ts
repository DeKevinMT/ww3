import { describe, expect, it } from 'vitest';
import { nextRandom } from '../../game/random';
import {
  TRAINED_RESERVE_TRAINING_COST_MULTIPLIER,
  TRAINED_RESERVE_WARTIME_TRAINING_FACTOR,
} from './balance';
import { planAiCommandsV2 } from './ai';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2, type WorldContentV2 } from './content';
import { createFinancePlansV2, processFinanceMilitaryV2 } from './economy';
import {
  projectFinanceManpowerPhaseV2,
  activeArmyReadyForReserveTrainingV2,
  selectRecruitmentTrainingPipelineV2,
  selectRecruitmentUnitCostV2,
  selectRapidRecruitmentTermsV2,
  selectTotalManpowerV2,
  selectTrainedReserveCapacityV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import {
  nationIdV2,
  type PlayerId,
  type WorldStateV2,
} from './types';

const belgium = nationIdV2('bel');
const netherlands = nationIdV2('nld');

function setActiveFill(state: WorldStateV2, playerId: PlayerId, ratio: number): void {
  for (const territory of Object.values(state.territories)) {
    if (territory.owner !== playerId) continue;
    territory.army.manpower = territory.army.capacity * ratio;
  }
}

function addWar(state: WorldStateV2): void {
  state.tick = 100;
  state.wars = [{
    id: 'reserve-war',
    attackerId: belgium,
    defenderId: netherlands,
    startedTick: 80,
    lastBattleTick: 100,
    warScore: 0,
    battles: 4,
    attackerLosses: 0,
    defenderLosses: 0,
    lastPeaceOfferTick: -1,
    attackerOperations: [],
    defenderOperations: [],
  }];
}

function fundedState(seed: number): WorldStateV2 {
  const state = createWorldStateV2(seed);
  const nation = state.players[belgium]!;
  nation.treasury = 1_000_000;
  nation.foodSecurity = 1;
  nation.budget = { military: 90, research: 5, development: 5 };
  return state;
}

describe('finite trained reserves', () => {
  it('uses only a one-millionth rounding tolerance at the full-active boundary', () => {
    expect(activeArmyReadyForReserveTrainingV2(0.999998, 1)).toBe(false);
    expect(activeArmyReadyForReserveTrainingV2(0.999999, 1)).toBe(true);
  });

  it('restores the active army first and starts peace reserves only at a full cap', () => {
    const state = fundedState(71_001);
    const pipeline = selectRecruitmentTrainingPipelineV2(state, WORLD_CONTENT_V2, belgium);
    const capacity = selectTotalManpowerV2(state, belgium).capacity;
    setActiveFill(state, belgium, (capacity - 2 * pipeline) / capacity);

    const restoring = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    expect(restoring.passiveRecruitment + restoring.acceleratedRecruitment).toBeGreaterThan(0);
    expect(restoring.reserveTraining).toBe(0);

    setActiveFill(state, belgium, 1);
    const full = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    expect(full.reserveTraining).toBeGreaterThan(0);
    expect(full.trainedReservesAfter).toBe(full.reserveTraining);
  });

  it('caps training at twice live active capacity without deleting an over-cap legacy pool', () => {
    const state = fundedState(71_002);
    setActiveFill(state, belgium, 1);
    const capacity = selectTrainedReserveCapacityV2(state, belgium);
    const pipeline = selectRecruitmentTrainingPipelineV2(state, WORLD_CONTENT_V2, belgium);
    state.players[belgium]!.trainedReserves = capacity - pipeline / 2;

    const finalFill = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    expect(finalFill.trainedReservesAfter).toBeCloseTo(capacity, 6);
    expect(finalFill.trainedReservesAfter).toBeLessThanOrEqual(capacity);
    expect(finalFill.reserveTraining).toBeCloseTo(pipeline / 2, 5);

    state.players[belgium]!.trainedReserves = capacity * 1.25;
    const overCap = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    expect(overCap.reserveTraining).toBe(0);
    expect(overCap.trainedReservesAfter).toBeCloseTo(capacity * 1.25, 6);
  });

  it('pays reserve training from the military envelope and conserves its subdivisions', () => {
    const state = fundedState(71_003);
    setActiveFill(state, belgium, 1);
    const finance = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    const unitCost = selectRecruitmentUnitCostV2(state, belgium, WORLD_CONTENT_V2);

    expect(finance.reserveTrainingCost).toBeGreaterThan(0);
    expect(finance.reserveTrainingCost).toBeCloseTo(
      finance.reserveTraining * unitCost * TRAINED_RESERVE_TRAINING_COST_MULTIPLIER,
      5,
    );
    expect(finance.fundedArmyUpkeep + finance.recruitmentAccelerationCost
      + finance.reserveTrainingCost + finance.standingOperations).toBeCloseTo(finance.military, 5);
  });

  it('keeps a paid wartime trickle at exactly 5% of the normal peace pipeline', () => {
    const peace = fundedState(71_004);
    setActiveFill(peace, belgium, 1);
    const war = structuredClone(peace);
    addWar(war);

    const peaceFinance = selectWeeklyFinanceBreakdownV2(peace, WORLD_CONTENT_V2, belgium);
    const warFinance = selectWeeklyFinanceBreakdownV2(war, WORLD_CONTENT_V2, belgium);
    expect(peaceFinance.reserveTraining).toBeGreaterThan(0);
    expect(warFinance.reserveDeployment).toBe(0);
    expect(warFinance.reserveTraining).toBeCloseTo(
      peaceFinance.reserveTraining * TRAINED_RESERVE_WARTIME_TRAINING_FACTOR,
      6,
    );
    expect(warFinance.reserveTrainingCost).toBeGreaterThan(0);
  });

  it('draws wartime replacements from reserves with no double recruitment and conserves personnel', () => {
    const state = fundedState(71_005);
    setActiveFill(state, belgium, 0.70);
    state.players[belgium]!.trainedReserves = selectTrainedReserveCapacityV2(state, belgium) / 2;
    addWar(state);
    const before = selectTotalManpowerV2(state, belgium).deployed;
    const reserveBefore = state.players[belgium]!.trainedReserves;
    const finance = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    const projection = projectFinanceManpowerPhaseV2(state, WORLD_CONTENT_V2, belgium, finance);

    expect(finance.passiveRecruitment).toBe(0);
    expect(finance.acceleratedRecruitment).toBe(0);
    expect(finance.reserveDeployment).toBeGreaterThan(finance.reserveTraining);
    expect(projection.recruited).toBeCloseTo(projection.reserveDeployed, 6);
    expect(projection.deployedAfterFinance + projection.trainedReservesAfter).toBeCloseTo(
      before + reserveBefore + projection.reserveTrained,
      6,
    );
    expect(projection.trainedReservesAfter).toBeLessThan(reserveBefore);
  });

  it('cannot refill a wartime active gap directly after the reserve pool is exhausted', () => {
    const state = fundedState(71_006);
    setActiveFill(state, belgium, 0.50);
    state.players[belgium]!.trainedReserves = 0;
    addWar(state);
    const finance = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    const projection = projectFinanceManpowerPhaseV2(state, WORLD_CONTENT_V2, belgium, finance);

    expect(finance.reserveDeployment).toBe(0);
    expect(finance.reserveTraining).toBeGreaterThan(0);
    expect(finance.passiveRecruitment + finance.acceleratedRecruitment).toBe(0);
    expect(projection.recruited).toBe(0);
    expect(projection.trainedReservesAfter).toBeCloseTo(finance.reserveTraining, 6);
  });

  it('commits the projected pool deterministically during the finance phase', () => {
    const state = fundedState(71_007);
    setActiveFill(state, belgium, 1);
    const plans = createFinancePlansV2(state, WORLD_CONTENT_V2);
    const expected = plans.get(belgium)!.trainedReservesAfter;
    processFinanceMilitaryV2(state, WORLD_CONTENT_V2, plans);
    expect(state.players[belgium]!.trainedReserves).toBe(expected);
  });

  it('uses only the same modest IQ efficiency and never selection status', () => {
    const state = fundedState(71_008);
    setActiveFill(state, belgium, 1);
    const unselected = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    state.humanPlayerId = belgium;
    const selected = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    expect(selected.reserveTraining).toBe(unselected.reserveTraining);
    expect(selected.reserveTrainingCost).toBe(unselected.reserveTrainingCost);

    const contentWithIq = (iqScore: number): WorldContentV2 => ({
      ...WORLD_CONTENT_V2,
      nations: {
        ...WORLD_CONTENT_V2.nations,
        [belgium]: { ...WORLD_CONTENT_V2.nations[belgium]!, iqScore },
      },
    });
    const lowCost = selectRecruitmentUnitCostV2(state, belgium, contentWithIq(80));
    const highCost = selectRecruitmentUnitCostV2(state, belgium, contentWithIq(108));
    expect(highCost).toBeLessThan(lowCost);
    expect(lowCost / highCost).toBeLessThan(1.10);
  });

  it('blocks wartime rapid recruitment equally for the selected country and rivals', () => {
    const state = fundedState(71_009);
    addWar(state);
    state.tick = 104;
    state.wars[0]!.lastBattleTick = state.tick;
    setActiveFill(state, netherlands, 0.05);
    state.players[netherlands]!.treasury = 1_000_000;

    const rivalTerms = selectRapidRecruitmentTermsV2(
      state,
      WORLD_CONTENT_V2,
      netherlands,
    );
    const selectedState = structuredClone(state);
    selectedState.humanPlayerId = netherlands;
    const selectedTerms = selectRapidRecruitmentTermsV2(
      selectedState,
      WORLD_CONTENT_V2,
      netherlands,
    );

    expect(rivalTerms.allowed).toBe(false);
    expect(rivalTerms.reason).toMatch(/war.*reserve/i);
    expect(selectedTerms.allowed).toBe(rivalTerms.allowed);
    expect(selectedTerms.reason).toBe(rivalTerms.reason);
    expect(planAiCommandsV2(state, WORLD_CONTENT_V2)).not.toContainEqual({
      type: 'rapid-recruitment',
      playerId: netherlands,
    });
  });

  it('lets selected-country APEX make the same peacetime rebuild decision as a rival', () => {
    const base = fundedState(71_010);
    base.tick = 104;
    base.wars = [];
    base.aiEscalation.lastWarStartTick = 1_000_000;
    for (const nation of Object.values(base.players)) nation.treasury = 0;
    base.players[netherlands]!.treasury = 1_000_000;
    for (const id of WORLD_CONTENT_V2.nationIds) setActiveFill(base, id, 1);
    setActiveFill(base, netherlands, 0.05);

    let favorableRngState = 1;
    while (true) {
      const probe = { rngState: favorableRngState };
      if (nextRandom(probe) < 0.025) break;
      favorableRngState += 1;
    }
    const asRival = structuredClone(base);
    const asSelected = structuredClone(base);
    asRival.humanPlayerId = belgium;
    asSelected.humanPlayerId = netherlands;
    asRival.rngState = favorableRngState;
    asSelected.rngState = favorableRngState;

    const expected = { type: 'rapid-recruitment', playerId: netherlands } as const;
    expect(planAiCommandsV2(asRival, WORLD_CONTENT_V2)).toContainEqual(expected);
    expect(planAiCommandsV2(asSelected, WORLD_CONTENT_V2)).toContainEqual(expected);
  });
});
