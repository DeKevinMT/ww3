import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import {
  createPowerSnapshotV2,
  selectOpeningCandidateFinancePlansV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import { nationIdV2 } from './types';

describe('V2 opening candidate finance projections', () => {
  it('evaluates every candidate with the same shared national AI', () => {
    const state = createWorldStateV2(8_228);
    const snapshot = createPowerSnapshotV2(state, WORLD_CONTENT_V2);
    const plans = selectOpeningCandidateFinancePlansV2(state, WORLD_CONTENT_V2, snapshot);

    for (const playerId of [nationIdV2('bel'), nationIdV2('che'), nationIdV2('usa')]) {
      const direct = selectWeeklyFinanceBreakdownV2(
        state,
        WORLD_CONTENT_V2,
        playerId,
        snapshot,
      );
      expect(plans.get(playerId)?.annualEconomyGrowthRate)
        .toBeCloseTo(direct.annualEconomyGrowthRate, 9);
      expect(plans.get(playerId)?.aiEfficiency).toBe(direct.aiEfficiency);
      expect(plans.get(playerId)?.activeBudget).toEqual(direct.activeBudget);
    }
  });

  it('keeps opening finance identical when legacy trait ownership changes', () => {
    const ireland = nationIdV2('irl');
    const irelandState = createWorldStateV2(8_229);
    irelandState.humanPlayerId = ireland;
    irelandState.humanPlayerIds = [ireland];
    const usaState = {
      ...irelandState,
      humanPlayerId: nationIdV2('usa'),
      humanPlayerIds: [nationIdV2('usa')],
    };
    const irelandPlans = selectOpeningCandidateFinancePlansV2(irelandState, WORLD_CONTENT_V2);
    const usaPlans = selectOpeningCandidateFinancePlansV2(usaState, WORLD_CONTENT_V2);

    for (const playerId of WORLD_CONTENT_V2.nationIds.filter((id) => id !== ireland)) {
      expect(usaPlans.get(playerId)?.annualEconomyGrowthRate, String(playerId))
        .toBeCloseTo(irelandPlans.get(playerId)?.annualEconomyGrowthRate ?? 0, 9);
    }
    expect(irelandPlans.get(ireland)!.annualEconomyGrowthRate)
      .toBeCloseTo(usaPlans.get(ireland)!.annualEconomyGrowthRate, 9);
  });
});
