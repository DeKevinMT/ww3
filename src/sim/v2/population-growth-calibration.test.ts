import { describe, expect, it } from 'vitest';
import { COUNTRIES } from '../../game/data/worldMap';
import { balancedPopulationGrowthRateV2, WORLD_CONTENT_V2 } from './content';
import { nationIdV2 } from './types';

describe('V2 population-growth balancing', () => {
  it('moves every source rate exactly halfway toward 1% without changing country order', () => {
    const sourceOrder = [...COUNTRIES].sort((left, right) => (
      left.populationGrowthRate - right.populationGrowthRate || left.id.localeCompare(right.id)
    ));
    const balanced = sourceOrder.map((country) => {
      const rate = WORLD_CONTENT_V2.nations[nationIdV2(country.id)]!.real.populationGrowthRate;
      expect(rate, country.id).toBeCloseTo(1 + 0.5 * (country.populationGrowthRate - 1), 8);
      return rate;
    });

    for (let index = 1; index < balanced.length; index += 1) {
      expect(balanced[index]!, sourceOrder[index]!.id).toBeGreaterThanOrEqual(balanced[index - 1]!);
    }
    expect(balanced[0]!).toBeGreaterThan(sourceOrder[0]!.populationGrowthRate);
    expect(balanced.at(-1)!).toBeLessThan(sourceOrder.at(-1)!.populationGrowthRate);
    expect(balancedPopulationGrowthRateV2(1)).toBe(1);
  });

  it('raises low-growth countries and lowers high-growth countries', () => {
    const rate = (id: string) => WORLD_CONTENT_V2.nations[nationIdV2(id)]!.real.populationGrowthRate;
    expect(rate('jpn')).toBeGreaterThan(0);
    expect(rate('chn')).toBeGreaterThan(0);
    expect(rate('bel')).toBeCloseTo(0.8505, 3);
    // Current source rates are 2.084% and 3.275%; the balancing rule moves
    // each exactly halfway toward the neutral 1% baseline.
    expect(rate('nga')).toBeCloseTo(1.542, 3);
    expect(rate('ner')).toBeCloseTo(2.1375, 3);
  });
});
