import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { createFinancePlansV2, processFinanceMilitaryV2 } from './economy';
import {
  projectFinanceManpowerPhaseV2,
  selectRecruitmentTrainingPipelineV2,
  selectTotalManpowerV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import { WorldEngineV2 } from './WorldEngineV2';
import {
  nationIdV2,
  type PlayerId,
  type WarStateV2,
  type WorldStateV2,
} from './types';

const belgium = nationIdV2('bel');
const netherlands = nationIdV2('nld');
const france = nationIdV2('fra');
const germany = nationIdV2('deu');

function setActiveFill(state: WorldStateV2, playerId: PlayerId, ratio: number): void {
  for (const territory of Object.values(state.territories)) {
    if (territory.owner !== playerId) continue;
    territory.army.manpower = territory.army.capacity * ratio;
  }
}

function warBetween(
  id: string,
  attackerId: PlayerId,
  defenderId: PlayerId,
  tick = 100,
): WarStateV2 {
  return {
    id,
    attackerId,
    defenderId,
    startedTick: tick - 20,
    lastBattleTick: tick,
    warScore: 0,
    battles: 2,
    attackerLosses: 0,
    defenderLosses: 0,
    attackerCivilianLosses: 0,
    defenderCivilianLosses: 0,
    lastPeaceOfferTick: -1_000_000,
    revenge: null,
    attackerOperations: [],
    defenderOperations: [],
  };
}

function fundedState(seed: number): WorldStateV2 {
  const state = createWorldStateV2(seed);
  state.tick = 100;
  state.wars = [];
  for (const id of [belgium, netherlands, france, germany]) {
    state.players[id]!.treasury = 1_000_000;
    state.players[id]!.budget = { military: 90, research: 5, development: 5 };
  }
  return state;
}

function combinedPersonnel(state: WorldStateV2, playerId: PlayerId): number {
  return selectTotalManpowerV2(state, playerId).deployed;
}

describe('global wartime recruitment freeze', () => {
  it('freezes every party across multiple simultaneous fronts while a non-participant rebuilds', () => {
    const state = fundedState(91_001);
    for (const id of [belgium, netherlands, france, germany]) {
      setActiveFill(state, id, 0.40);
      state.players[id]!.trainedReserves = 0;
    }
    state.wars = [
      warBetween('bel-nld', belgium, netherlands),
      warBetween('fra-bel', france, belgium),
    ];

    for (const participant of [belgium, netherlands, france]) {
      const finance = selectWeeklyFinanceBreakdownV2(
        state,
        WORLD_CONTENT_V2,
        participant,
      );
      expect(selectRecruitmentTrainingPipelineV2(
        state,
        WORLD_CONTENT_V2,
        participant,
      ), String(participant)).toBe(0);
      expect(finance.passiveRecruitment, String(participant)).toBe(0);
      expect(finance.acceleratedRecruitment, String(participant)).toBe(0);
      expect(finance.reserveTraining, String(participant)).toBe(0);
      expect(finance.reserveDeployment, String(participant)).toBe(0);
    }

    const peaceFinance = selectWeeklyFinanceBreakdownV2(
      state,
      WORLD_CONTENT_V2,
      germany,
    );
    expect(selectRecruitmentTrainingPipelineV2(state, WORLD_CONTENT_V2, germany))
      .toBeGreaterThan(0);
    expect(peaceFinance.passiveRecruitment + peaceFinance.acceleratedRecruitment)
      .toBeGreaterThan(0);
    expect(peaceFinance.reserveTraining).toBe(0);
  });

  it('ignores and retires a stale reserve payload instead of mobilising it', () => {
    const state = fundedState(91_002);
    setActiveFill(state, belgium, 0.50);
    state.players[belgium]!.trainedReserves = 0.25;
    state.wars = [warBetween('reserve-transfer', belgium, netherlands)];
    const before = combinedPersonnel(state, belgium);
    const finance = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    const projection = projectFinanceManpowerPhaseV2(
      state,
      WORLD_CONTENT_V2,
      belgium,
      finance,
    );

    expect(finance.reserveDeployment).toBe(0);
    expect(finance.passiveRecruitment).toBe(0);
    expect(finance.acceleratedRecruitment).toBe(0);
    expect(finance.reserveTraining).toBe(0);
    expect(projection.deployedAfterFinance).toBe(projection.deployedBefore);
    expect(projection.trainedReservesBefore).toBe(0);
    expect(projection.trainedReservesAfter).toBe(0);

    processFinanceMilitaryV2(
      state,
      WORLD_CONTENT_V2,
      createFinancePlansV2(state, WORLD_CONTENT_V2),
    );
    expect(combinedPersonnel(state, belgium)).toBeCloseTo(before, 5);
    expect(state.players[belgium]!.trainedReserves).toBe(0);
  });

  it('spends no treasury on hidden wartime training, including an empty reserve pool', () => {
    const state = fundedState(91_003);
    setActiveFill(state, belgium, 0.15);
    state.players[belgium]!.trainedReserves = 0;
    state.wars = [warBetween('no-training-bill', belgium, netherlands)];
    const finance = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    const projection = projectFinanceManpowerPhaseV2(
      state,
      WORLD_CONTENT_V2,
      belgium,
      finance,
    );

    expect(finance.recruitment).toBe(0);
    expect(finance.recruitmentAccelerationCost).toBe(0);
    expect(finance.reserveTrainingCost).toBe(0);
    expect(finance.recruitmentFundingRatio).toBe(1);
    expect(projection.recruited).toBe(0);
    expect(projection.reserveTrained).toBe(0);
    expect(projection.deployedAfterFinance).toBe(projection.deployedBefore);
  });

  it('rechecks emergency recruitment at execution so a newly started war cancels a queued order', () => {
    const state = fundedState(91_004);
    setActiveFill(state, belgium, 0.20);
    state.players[belgium]!.trainedReserves = 0;
    const engine = new WorldEngineV2(91_004, WORLD_CONTENT_V2, state);
    const before = selectTotalManpowerV2(engine.state, belgium).deployed;

    expect(engine.rapidRecruitment(belgium).accepted).toBe(true);
    engine.state.wars = [warBetween('war-before-command-commit', belgium, netherlands)];
    expect(engine.rapidRecruitmentTerms(belgium)).toMatchObject({
      allowed: false,
      atWar: true,
    });
    const wartimeCallManpower = selectTotalManpowerV2(engine.state, belgium).deployed;
    const wartimeCallTreasury = engine.state.players[belgium]!.treasury;
    expect(engine.rapidRecruitment(belgium).accepted).toBe(false);
    expect(selectTotalManpowerV2(engine.state, belgium).deployed).toBe(wartimeCallManpower);
    expect(engine.state.players[belgium]!.treasury).toBe(wartimeCallTreasury);
    engine.step(1);

    expect(selectTotalManpowerV2(engine.state, belgium).deployed)
      .toBeLessThanOrEqual(before);
    expect(engine.state.players[belgium]!.trainedReserves).toBe(0);
  });

  it('shows material week-by-week recovery across the full peacetime curve', () => {
    const state = fundedState(91_005);
    setActiveFill(state, belgium, 0.10);
    state.players[belgium]!.trainedReserves = 0;
    const initial = selectTotalManpowerV2(state, belgium);
    let previous = initial.deployed;

    for (let week = 0; week < 52; week += 1) {
      processFinanceMilitaryV2(
        state,
        WORLD_CONTENT_V2,
        createFinancePlansV2(state, WORLD_CONTENT_V2),
      );
      state.tick += 1;
      const current = selectTotalManpowerV2(state, belgium).deployed;
      expect(current, `week ${week + 1}`).toBeGreaterThan(previous);
      previous = current;
    }

    const final = selectTotalManpowerV2(state, belgium);
    expect(final.deployed / final.capacity).toBeGreaterThan(0.70);
    expect(state.players[belgium]!.trainedReserves).toBe(0);
  });
});
