import { describe, expect, it } from 'vitest';
import { summarizeWarStrainV2 } from './warStrain';

describe('war strain HUD summary', () => {
  it('shows a fresh, fully supplied single-front war as sustainable', () => {
    expect(summarizeWarStrainV2({
      activeWars: 1,
      activeFronts: 1,
      warFatigue: 0,
      armyFillRatio: 1,
      reserveFillRatio: 1,
    })).toMatchObject({ score: 14, level: 'sustainable', label: 'SUSTAINABLE' });
  });

  it('warns clearly when multiple fronts, losses and empty reserves compound', () => {
    const summary = summarizeWarStrainV2({
      activeWars: 2,
      activeFronts: 4,
      warFatigue: 80,
      armyFillRatio: 0.45,
      reserveFillRatio: 0.05,
    });
    expect(summary.score).toBeGreaterThanOrEqual(75);
    expect(summary.level).toBe('critical');
    expect(summary.guidance).toMatch(/exhaustion|recovery/i);
  });

  it('uses the same meter after peace to explain the fading recovery tail', () => {
    expect(summarizeWarStrainV2({
      activeWars: 0,
      activeFronts: 0,
      warFatigue: 40,
      armyFillRatio: 0.2,
      reserveFillRatio: 0,
    })).toMatchObject({ score: 26, level: 'recovering', label: 'RECOVERING' });
  });

  it('sanitizes invalid ratios without exceeding the meter range', () => {
    const summary = summarizeWarStrainV2({
      activeWars: Number.NaN,
      activeFronts: Number.POSITIVE_INFINITY,
      warFatigue: 500,
      armyFillRatio: -5,
      reserveFillRatio: Number.NaN,
    });
    expect(summary.score).toBeGreaterThanOrEqual(0);
    expect(summary.score).toBeLessThanOrEqual(100);
  });
});
