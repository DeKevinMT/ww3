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

  it('limits the human multiplier to the controlled country\'s own applicable trait', () => {
    const belgiumState = createWorldStateV2(8_229);
    const usaState = { ...belgiumState, humanPlayerId: nationIdV2('usa') };
    const belgiumPlans = selectOpeningCandidateFinancePlansV2(belgiumState, WORLD_CONTENT_V2);
    const usaPlans = selectOpeningCandidateFinancePlansV2(usaState, WORLD_CONTENT_V2);

    const belgium = nationIdV2('bel');
    for (const playerId of WORLD_CONTENT_V2.nationIds.filter((id) => id !== belgium)) {
      expect(usaPlans.get(playerId)?.annualEconomyGrowthRate, String(playerId))
        .toBeCloseTo(belgiumPlans.get(playerId)?.annualEconomyGrowthRate ?? 0, 9);
    }
    expect(belgiumPlans.get(belgium)!.annualEconomyGrowthRate)
      .toBeGreaterThan(usaPlans.get(belgium)!.annualEconomyGrowthRate);
  });
});
