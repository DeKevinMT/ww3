import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { selectWeeklyFinanceBreakdownV2 } from './selectors';
import { nationIdV2 } from './types';

describe('V2 representative food balance', () => {
  it('keeps every country fed while fragile systems pay a clearly larger burden', () => {
    const planWithoutStock = (rawId: string) => {
      const state = createWorldStateV2(44_001);
      const id = nationIdV2(rawId);
      state.players[id]!.foodStock = 0;
      return selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, id);
    };

    const nigeria = planWithoutStock('nga');
    const india = planWithoutStock('ind');
    const usa = planWithoutStock('usa');
    const canada = planWithoutStock('can');
    const palestine = planWithoutStock('psx');

    expect(nigeria.foodCoverage).toBe(1);
    expect(india.foodCoverage).toBe(1);
    expect(usa.foodCoverage).toBe(1);
    expect(canada.foodCoverage).toBe(1);
    expect(palestine.foodCoverage).toBe(1);
    expect(nigeria.foodProduction / nigeria.revenue)
      .toBeGreaterThan((usa.foodProduction / usa.revenue) * 10);
    expect(india.foodProduction / india.revenue)
      .toBeGreaterThan((canada.foodProduction / canada.revenue) * 8);
    expect(palestine.foodProduction / palestine.revenue)
      .toBeGreaterThan((usa.foodProduction / usa.revenue) * 20);
  });
});
