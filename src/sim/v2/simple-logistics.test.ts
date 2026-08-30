import { describe, expect, it } from 'vitest';
import {
  LAND_ARMY_CAPACITY_SUPPLY_SHARE_V2,
  NAVAL_ARMY_CAPACITY_SUPPLY_SHARE_V2,
  armyCapacitySupplyBudgetV2,
  armyCapacitySupplyLabelV2,
  quoteArmyCapacitySupplyV2,
} from './logistics';

describe('simple Army Capacity logistics contract', () => {
  it('uses exactly 8% by land and half of that by sea', () => {
    expect(LAND_ARMY_CAPACITY_SUPPLY_SHARE_V2).toBe(0.08);
    expect(NAVAL_ARMY_CAPACITY_SUPPLY_SHARE_V2).toBe(0.04);
    expect(armyCapacitySupplyBudgetV2(10, 'land')).toBe(0.8);
    expect(armyCapacitySupplyBudgetV2(10, 'naval')).toBe(0.4);
  });

  it('lets a large country deliver more while reporting actual fulfilment', () => {
    const large = quoteArmyCapacitySupplyV2(10, 10, 'land');
    const small = quoteArmyCapacitySupplyV2(1, 1, 'land');
    const depleted = quoteArmyCapacitySupplyV2(10, 0.2, 'land');
    expect(large.delivered).toBe(0.8);
    expect(small.delivered).toBe(0.08);
    expect(depleted.readiness).toBe(0.25);
  });

  it('exposes the same concise rule used by attack UI', () => {
    expect(armyCapacitySupplyLabelV2('land')).toBe('8% CAP / ATTACK');
    expect(armyCapacitySupplyLabelV2('naval')).toBe('4% CAP / ATTACK · NAVAL');
  });
});
