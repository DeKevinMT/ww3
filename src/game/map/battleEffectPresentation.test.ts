import { describe, expect, it } from 'vitest';
import {
  battleEffectScale,
  battleProjectileScale,
  battleTerritoryWaveRadiusDegrees,
} from './battleEffectPresentation';

describe('battle effect presentation', () => {
  it('makes a major-power assault visibly larger than an island skirmish', () => {
    const island = battleEffectScale({ attackerPower: 0.08 });
    const regional = battleEffectScale({ attackerPower: 8 });
    const major = battleEffectScale({ attackerPower: 180 });

    expect(island).toBeGreaterThanOrEqual(0.72);
    expect(regional).toBeGreaterThan(island + 0.25);
    expect(major).toBeGreaterThan(regional + 0.35);
    expect(major).toBeLessThanOrEqual(1.8);
  });

  it('uses a bounded logarithmic curve for extreme and malformed values', () => {
    expect(battleEffectScale({ attackerPower: 1_000_000 })).toBe(1.8);
    expect(battleEffectScale({ attackerPower: -100 })).toBe(0.72);
    expect(battleEffectScale({ attackerPower: Number.NaN })).toBe(0.72);
    expect(battleEffectScale({ attackerPower: Number.POSITIVE_INFINITY })).toBe(0.72);
  });

  it('compresses only projectile size while leaving impact magnitude broad', () => {
    const islandEffect = battleEffectScale({ attackerPower: 0 });
    const regionalEffect = battleEffectScale({ attackerPower: 8 });
    const majorEffect = battleEffectScale({ attackerPower: 180 });
    const islandProjectile = battleProjectileScale(islandEffect);
    const regionalProjectile = battleProjectileScale(regionalEffect);
    const majorProjectile = battleProjectileScale(majorEffect);

    expect(islandProjectile).toBeCloseTo(0.70, 12);
    expect(regionalProjectile).toBeGreaterThan(islandProjectile);
    expect(majorProjectile).toBeCloseTo(0.94, 12);
    expect(majorProjectile - islandProjectile).toBeLessThanOrEqual(0.24);
    expect(majorEffect - islandEffect).toBeGreaterThan(1);
  });

  it('keeps legacy events scalable through their actual losses', () => {
    expect(battleEffectScale({ attackerLosses: 0.4, defenderLosses: 0.6 }))
      .toBeGreaterThan(battleEffectScale({ attackerLosses: 0.001, defenderLosses: 0.002 }));
  });

  it('covers detached target geography and remains bounded', () => {
    const radius = battleTerritoryWaveRadiusDegrees([179, 0], [[
      [178, -1], [-178, -1], [-178, 1], [178, 1], [178, -1],
    ]]);
    expect(radius).toBeGreaterThan(2.5);
    expect(radius).toBeLessThan(4);

    expect(battleTerritoryWaveRadiusDegrees([0, 0], [])).toBe(0.8);
    expect(battleTerritoryWaveRadiusDegrees([0, 0], [[[179, 0]]])).toBe(70);
  });
});
