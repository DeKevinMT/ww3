import { describe, expect, it } from 'vitest';
import {
  LAND_ARMY_CAPACITY_SUPPLY_SHARE_V2,
  NAVAL_ARMY_CAPACITY_SUPPLY_SHARE_V2,
  armyCapacitySupplyBudgetV2,
  armyCapacitySupplyLabelV2,
  quoteArmyCapacitySupplyV2,
} from './logistics';

describe('simple Army Capacity logistics contract', () => {
  it('uses exactly 10% by land and half of that by sea', () => {
    expect(LAND_ARMY_CAPACITY_SUPPLY_SHARE_V2).toBe(0.10);
    expect(NAVAL_ARMY_CAPACITY_SUPPLY_SHARE_V2).toBe(0.05);
    expect(armyCapacitySupplyBudgetV2(10, 'land')).toBe(1);
    expect(armyCapacitySupplyBudgetV2(10, 'naval')).toBe(0.5);
  });

  it('lets a large country deliver more while reporting actual fulfilment', () => {
    const large = quoteArmyCapacitySupplyV2(10, 10, 'land');
    const small = quoteArmyCapacitySupplyV2(1, 1, 'land');
    const depleted = quoteArmyCapacitySupplyV2(10, 0.2, 'land');
    expect(large.delivered).toBe(1);
    expect(small.delivered).toBe(0.10);
    expect(depleted.readiness).toBe(0.2);
  });

  it('exposes the same concise rule used by attack UI', () => {
    expect(armyCapacitySupplyLabelV2('land')).toBe('10% CAP / ATTACK');
    expect(armyCapacitySupplyLabelV2('naval')).toBe('5% CAP / ATTACK · NAVAL');
  });
});
