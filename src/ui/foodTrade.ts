const WEEKS_PER_YEAR = 52;
const FOOD_TRADE_EPSILON = 0.0000005;

export type FoodTradeDirectionV2 = 'export' | 'import' | 'balanced';

export interface FoodTradeSummaryV2 {
  direction: FoodTradeDirectionV2;
  label: 'NET FOOD EXPORTS' | 'NET FOOD IMPORTS' | 'FOOD TRADE';
  weeklyNet: number;
  annualVolume: number;
}

function nonNegativeFinite(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function summarizeFoodTradeV2(foodExported: number, foodImported: number): FoodTradeSummaryV2 {
  const weeklyNet = nonNegativeFinite(foodExported) - nonNegativeFinite(foodImported);
  if (Math.abs(weeklyNet) <= FOOD_TRADE_EPSILON) {
    return {
      direction: 'balanced',
      label: 'FOOD TRADE',
      weeklyNet: 0,
      annualVolume: 0,
    };
  }
  return {
    direction: weeklyNet > 0 ? 'export' : 'import',
    label: weeklyNet > 0 ? 'NET FOOD EXPORTS' : 'NET FOOD IMPORTS',
    weeklyNet,
    annualVolume: Math.abs(weeklyNet) * WEEKS_PER_YEAR,
  };
}
