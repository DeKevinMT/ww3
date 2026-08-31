import { describe, expect, it } from 'vitest';
import { RESEARCH_BRANCH_EFFECTS } from './balance';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { processFinanceMilitaryV2 } from './economy';
import { initialTrainedReserveManpowerV2 } from './reserveForces';
import { normalizeRetiredReserveCompatibilityV2 } from './retiredReserves';
import {
  activeArmyReadyForReserveTrainingV2,
  peacetimeReserveTrainingPipelineShareV2,
  projectFinanceManpowerPhaseV2,
  selectRecruitmentTrainingPipelineV2,
  selectRapidRecruitmentTermsV2,
  selectTotalManpowerV2,
  selectTrainedReserveCapacityV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import { nationIdV2, type PlayerId, type WarStateV2, type WorldStateV2 } from './types';

const belgium = nationIdV2('bel');
const netherlands = nationIdV2('nld');

function setFill(state: WorldStateV2, playerId: PlayerId, ratio: number): void {
  for (const territory of Object.values(state.territories)) {
    if (territory.owner === playerId) territory.army.manpower = territory.army.capacity * ratio;
  }
}

function war(): WarStateV2 {
  return {
    id: 'retired-reserve-war',
    attackerId: belgium,
    defenderId: netherlands,
    startedTick: 80,
    lastBattleTick: 100,
    warScore: 0,
    battles: 1,
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

describe('retired trained-reserve compatibility', () => {
  it('starts every nation with a neutral compatibility pool', () => {
    const state = createWorldStateV2(71_000);
    for (const id of WORLD_CONTENT_V2.nationIds) {
      expect(state.players[id]!.trainedReserves, String(id)).toBe(0);
      expect(selectTrainedReserveCapacityV2(state, id), String(id)).toBe(0);
      expect(initialTrainedReserveManpowerV2(String(id), 10, WORLD_CONTENT_V2)).toBe(0);
    }
    expect(activeArmyReadyForReserveTrainingV2(1, 1)).toBe(false);
    expect(peacetimeReserveTrainingPipelineShareV2(1)).toBe(0);
  });

  it('migrates paid legacy reserve research once and zeros its stable keys', () => {
    const state = createWorldStateV2(71_001);
    const nation = state.players[belgium]!;
    nation.trainedReserves = 0.5;
    nation.research.effectLevels.training = 2;
    nation.research.effectLevels['force-capacity'] = 3;
    nation.research.effectLevels['reserve-training'] = 4;
    nation.research.effectLevels['reserve-mobilization'] = 5;

    normalizeRetiredReserveCompatibilityV2(state);
    expect(nation.trainedReserves).toBe(0);
    expect(nation.research.effectLevels.training).toBe(6);
    expect(nation.research.effectLevels['force-capacity']).toBe(8);
    expect(nation.research.effectLevels['reserve-training']).toBe(0);
    expect(nation.research.effectLevels['reserve-mobilization']).toBe(0);

    normalizeRetiredReserveCompatibilityV2(state);
    expect(nation.research.effectLevels.training).toBe(6);
    expect(nation.research.effectLevels['force-capacity']).toBe(8);
  });

  it('keeps the stable research branch but gives it two live active-army effects', () => {
    expect(RESEARCH_BRANCH_EFFECTS['reserve-doctrine']).toEqual([
      'training',
      'force-capacity',
    ]);
  });

  it('refills territorial active armies directly during peace and never creates reserves', () => {
    const state = createWorldStateV2(71_002);
    setFill(state, belgium, 0.4);
    state.players[belgium]!.treasury = 1_000_000;
    state.players[belgium]!.budget = { military: 90, research: 5, development: 5 };
    const before = selectTotalManpowerV2(state, belgium).deployed;
    const finance = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    const projection = projectFinanceManpowerPhaseV2(
      state,
      WORLD_CONTENT_V2,
      belgium,
      finance,
    );

    expect(selectRecruitmentTrainingPipelineV2(state, WORLD_CONTENT_V2, belgium)).toBeGreaterThan(0);
    expect(finance.passiveRecruitment).toBeGreaterThan(0);
    expect(projection.deployedAfterFinance).toBeGreaterThan(before);
    expect(finance).toMatchObject({
      trainedReserveCapacity: 0,
      trainedReservesBefore: 0,
      trainedReservesAfter: 0,
      reserveTraining: 0,
      reserveTrainingCost: 0,
      reserveDeployment: 0,
    });

    processFinanceMilitaryV2(
      state,
      WORLD_CONTENT_V2,
      new Map([[belgium, finance]]),
    );
    expect(state.players[belgium]!.trainedReserves).toBe(0);
    expect(selectTotalManpowerV2(state, belgium).deployed).toBeGreaterThan(before);
  });

  it('never consumes a stale reserve value to refill an army during war', () => {
    const state = createWorldStateV2(71_003);
    state.tick = 100;
    setFill(state, belgium, 0.2);
    state.players[belgium]!.trainedReserves = 50;
    state.wars = [war()];
    const before = selectTotalManpowerV2(state, belgium).deployed;
    const finance = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, belgium);
    const projection = projectFinanceManpowerPhaseV2(
      state,
      WORLD_CONTENT_V2,
      belgium,
      finance,
    );

    expect(selectRecruitmentTrainingPipelineV2(state, WORLD_CONTENT_V2, belgium)).toBe(0);
    expect(finance.passiveRecruitment).toBe(0);
    expect(finance.reserveDeployment).toBe(0);
    expect(projection.deployedAfterFinance).toBe(before);
    expect(projection.trainedReservesAfter).toBe(0);
    expect(selectRapidRecruitmentTermsV2(state, WORLD_CONTENT_V2, belgium).reason)
      .toBe('Rapid Recruitment is unavailable during war.');
  });
});
