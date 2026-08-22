import { describe, expect, it } from 'vitest';
import {
  armyCapacityLabel,
  baseOperatingCostLabel,
  globalRankingDetail,
  taxIncomeBasisLabel,
  toastVisibilityDuration,
} from './WorldUIV2';

describe('nation army display', () => {
  it('combines deployed manpower and capacity into one x / x value', () => {
    expect(armyCapacityLabel(1.25, 2.5)).toBe('1.25M / 2.50M');
    expect(armyCapacityLabel(0.05, 0.125)).toBe('50.00K / 125.00K');
  });

  it('shows combat power and economy together under one global score', () => {
    expect(globalRankingDetail(1_250_000, 5)).toBe('COMBAT 1.25M · ECONOMY $5.00B');
  });

  it('keeps important bottom notifications readable for longer', () => {
    expect(toastVisibilityDuration('default')).toBe(3_200);
    expect(toastVisibilityDuration('war')).toBe(4_000);
    expect(toastVisibilityDuration('conquest')).toBe(5_000);
  });

  it('names the universal operating cost as exactly 20% of tax revenue', () => {
    expect(baseOperatingCostLabel()).toBe('BASE OPERATIONS · 20% OF TAX REVENUE');
  });

  it('explains the blended tax base in the compact economy UI', () => {
    expect(taxIncomeBasisLabel()).toBe('50% ECONOMY BASE · 50% LIVE PRODUCTIVE PEOPLE');
  });
});
