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

  it('uses diminishing strain for simultaneous fronts instead of a linear dogpile spike', () => {
    const scoreAt = (activeFronts: number) => summarizeWarStrainV2({
      activeWars: 1,
      activeFronts,
      warFatigue: 0,
      armyFillRatio: 1,
      reserveFillRatio: 1,
    }).score;

    expect(scoreAt(1)).toBe(14);
    expect(scoreAt(4)).toBeLessThanOrEqual(24);
    expect(scoreAt(2) - scoreAt(1)).toBeGreaterThan(scoreAt(5) - scoreAt(4));
  });

  it('counts naval routes as lighter theatre strain than the same number of land fronts', () => {
    const land = summarizeWarStrainV2({
      activeWars: 1,
      activeFronts: 6,
      navalFronts: 0,
      warFatigue: 20,
      armyFillRatio: 0.9,
      reserveFillRatio: 0.8,
    });
    const naval = summarizeWarStrainV2({
      activeWars: 1,
      activeFronts: 6,
      navalFronts: 6,
      warFatigue: 20,
      armyFillRatio: 0.9,
      reserveFillRatio: 0.8,
    });

    expect(naval.score).toBeLessThan(land.score);
    expect(land.score - naval.score).toBeGreaterThanOrEqual(6);
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
