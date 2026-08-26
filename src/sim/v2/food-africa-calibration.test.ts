import { describe, expect, it } from 'vitest';
import { FOOD_OPENING_RESERVE_MIN_WEEKS } from './balance';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { selectWeeklyFinanceBreakdownV2 } from './selectors';

describe('V2 African food-security calibration', () => {
  it('expresses vulnerability through finance and reserves, never a hard coverage stat', () => {
    const state = createWorldStateV2(8_227);
    const plans = WORLD_CONTENT_V2.nationIds
      .filter((id) => WORLD_CONTENT_V2.nations[id]?.continent === 'Africa')
      .map((id) => ({
        id: String(id),
        insecurity: WORLD_CONTENT_V2.nations[id]!.real.foodInsecurityRate,
        reserveWeeks: state.players[id]!.foodStock
          / selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, id).foodDemand,
        plan: selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, id),
      }));
    const byId = new Map(plans.map((entry) => [entry.id, entry]));

    expect(plans.length).toBeGreaterThan(40);
    expect(plans.every(({ plan, id }) => {
      const stock = state.players[WORLD_CONTENT_V2.nationIds.find((candidate) => String(candidate) === id)!]!.foodStock;
      return Math.abs(plan.foodCoverage - Math.min(1,
        (plan.foodProduced + stock) / plan.foodDemand)) < 0.000001;
    })).toBe(true);
    expect(plans.some(({ plan }) => plan.foodProduction / plan.revenue > 0.25)).toBe(true);
    expect(byId.get('sds')!.reserveWeeks).toBeCloseTo(FOOD_OPENING_RESERVE_MIN_WEEKS, 5);
    expect(byId.get('nga')!.reserveWeeks).toBeCloseTo(FOOD_OPENING_RESERVE_MIN_WEEKS, 5);
    expect(byId.get('nga')!.reserveWeeks).toBeLessThan(byId.get('zaf')!.reserveWeeks);
    expect(byId.get('sds')!.insecurity).toBeGreaterThan(byId.get('nga')!.insecurity);
    expect(byId.get('nga')!.insecurity).toBeGreaterThan(byId.get('zaf')!.insecurity);
  });

  it('feeds Palestine from a full store and creates a shortage only after money and reserves run out', () => {
    const funded = createWorldStateV2(8_228);
    const palestine = WORLD_CONTENT_V2.nationIds.find((id) => String(id) === 'psx')!;
    const opening = selectWeeklyFinanceBreakdownV2(funded, WORLD_CONTENT_V2, palestine);
    funded.players[palestine]!.foodStock = opening.foodStorageCapacity;
    funded.players[palestine]!.treasury = 0;
    funded.territories[palestine]!.economy = 0.1;
    const unfunded = structuredClone(funded);
    unfunded.players[palestine]!.foodStock = 0;

    const fundedPlan = selectWeeklyFinanceBreakdownV2(funded, WORLD_CONTENT_V2, palestine);
    const unfundedPlan = selectWeeklyFinanceBreakdownV2(unfunded, WORLD_CONTENT_V2, palestine);
    expect(fundedPlan.foodCoverage).toBe(1);
    expect(fundedPlan.foodStockChange).toBeLessThan(0);
    expect(unfundedPlan.foodCoverage).toBeLessThan(1);
    expect(unfundedPlan.foodCoverage).toBeCloseTo(
      (unfundedPlan.foodProduced + unfunded.players[palestine]!.foodStock)
        / unfundedPlan.foodDemand,
      6,
    );
  });

  it('creates varied African shortages from an empty treasury and reserve', () => {
    const state = createWorldStateV2(8_229);
    const coverage = WORLD_CONTENT_V2.nationIds
      .filter((id) => WORLD_CONTENT_V2.nations[id]?.continent === 'Africa')
      .map((id) => {
        state.players[id]!.foodStock = 0;
        state.players[id]!.treasury = 0;
        const plan = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, id);
        return { id, plan };
      });
    expect(coverage.filter(({ plan }) => plan.foodCoverage < 0.999).length)
      .toBeGreaterThanOrEqual(8);
    for (const { plan } of coverage) {
      expect(plan.foodCoverage).toBeCloseTo(
        Math.min(1, plan.foodProduced / plan.foodDemand),
        5,
      );
    }
  });
});
