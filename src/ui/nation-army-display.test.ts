import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from '../sim/v2/bootstrap';
import { nationIdV2 } from '../sim/v2/types';
import {
  armyCapacityLabel,
  baseOperatingCostLabel,
  globalRankingDetail,
  taxIncomeBasisLabel,
  toastVisibilityDuration,
  treasuryTopbarPresentationV2,
  worldTopbarStatsV2,
} from './WorldUIV2';

describe('nation army display', () => {
  it('combines deployed manpower and capacity into one x / x value', () => {
    expect(armyCapacityLabel(1.25, 2.5)).toBe('1.25M / 2.5M');
    expect(armyCapacityLabel(0.05, 0.125)).toBe('50K / 125K');
  });

  it('shows only military power in global ranking detail', () => {
    expect(globalRankingDetail(1_250_000, 5)).toBe('MILITARY POWER 1.25M');
  });

  it('presents current treasury separately from its weekly forecast', () => {
    expect(treasuryTopbarPresentationV2(4.25, -0.125, 8.5)).toEqual({
      className: 'top-metric--economy is-positive',
      value: '$4.25B',
      reserveFill: '50%',
      reserveFillClassName: 'is-warn',
      trend: '−$125M/wk',
      trendClassName: 'is-negative',
      ariaLabel: 'Current empire treasury $4.25B; projected recurring net −$125M per week',
    });
    expect(treasuryTopbarPresentationV2(-0.5, 0.05, 2)).toMatchObject({
      className: 'top-metric--economy is-debt is-negative',
      value: '−$500M',
      reserveFill: '0%',
      reserveFillClassName: 'is-negative',
      trend: '+$50M/wk',
      trendClassName: 'is-positive',
    });
  });

  it('reports live world population and mapped land-area control', () => {
    const state = createWorldStateV2(77_001);
    const belgium = nationIdV2('bel');
    const stats = worldTopbarStatsV2(state, belgium);

    expect(stats.population).toBeCloseTo(
      Object.values(state.territories).reduce((sum, territory) => sum + territory.population, 0),
      8,
    );
    expect(stats.controlledLandShare).toBeGreaterThan(0);
    expect(stats.controlledLandShare).toBeLessThan(1);
    expect(stats.controlledTerritories).toBeGreaterThan(0);
    expect(stats.worldTerritories).toBe(Object.keys(state.territories).length);
  });

  it('keeps important bottom notifications readable for longer', () => {
    expect(toastVisibilityDuration('default')).toBe(3_200);
    expect(toastVisibilityDuration('war')).toBe(4_000);
    expect(toastVisibilityDuration('conquest')).toBe(5_000);
  });

  it('names the universal operating cost as exactly 30% of tax revenue', () => {
    expect(baseOperatingCostLabel()).toBe('BASE OPERATIONS · 30% OF TAX REVENUE');
  });

  it('explains the blended tax base in the compact economy UI', () => {
    expect(taxIncomeBasisLabel()).toBe('50% ECONOMY BASE · 50% LIVE PRODUCTIVE PEOPLE');
  });
});
