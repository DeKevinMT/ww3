import { describe, expect, it } from 'vitest';
import { summarizeFoodTradeV2 } from './foodTrade';

describe('food trade summary', () => {
  it('reports annual net exports after subtracting imports', () => {
    expect(summarizeFoodTradeV2(3, 1)).toEqual({
      direction: 'export',
      label: 'NET FOOD EXPORTS',
      weeklyNet: 2,
      annualVolume: 104,
    });
  });

  it('explicitly reports net imports when there are no exports', () => {
    expect(summarizeFoodTradeV2(0, 4)).toEqual({
      direction: 'import',
      label: 'NET FOOD IMPORTS',
      weeklyNet: -4,
      annualVolume: 208,
    });
  });

  it('reports balanced trade when imports and exports cancel out', () => {
    expect(summarizeFoodTradeV2(2, 2)).toEqual({
      direction: 'balanced',
      label: 'FOOD TRADE',
      weeklyNet: 0,
      annualVolume: 0,
    });
  });

  it('sanitizes invalid or negative flow inputs', () => {
    expect(summarizeFoodTradeV2(Number.NaN, -2)).toEqual({
      direction: 'balanced',
      label: 'FOOD TRADE',
      weeklyNet: 0,
      annualVolume: 0,
    });
  });
});
