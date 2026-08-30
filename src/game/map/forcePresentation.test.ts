import { describe, expect, it } from 'vitest';
import {
  commanderForceMapCombatPower,
  forcePresentationSignature,
  mapCombatPowerLabel,
} from './forcePresentation';

describe('force presentation signature', () => {
  it('is stable across insertion order', () => {
    const left = forcePresentationSignature({
      moved: new Set(['bel', 'nld']),
      active: new Set(['fra', 'deu']),
      strongest: new Set(['lux', 'bel']),
    });
    const right = forcePresentationSignature({
      moved: new Set(['nld', 'bel']),
      active: new Set(['deu', 'fra']),
      strongest: new Set(['bel', 'lux']),
    });

    expect(right).toBe(left);
  });

  it.each(['moved', 'active', 'strongest'] as const)(
    'changes immediately when the %s force set changes',
    (setName) => {
      const baseline = {
        moved: new Set(['bel']),
        active: new Set(['bel']),
        strongest: new Set(['bel']),
      };
      const changed = {
        ...baseline,
        [setName]: new Set(['bel', 'nld']),
      };

      expect(forcePresentationSignature(changed)).not.toBe(forcePresentationSignature(baseline));
    },
  );

  it('emphasises one combat-power value on map tags without stat-label clutter', () => {
    expect(mapCombatPowerLabel(12_345.678)).toBe('⚔ 12.35K');
    expect(mapCombatPowerLabel(987.6, 'YOU')).toBe('YOU · ⚔ 987.60');
    expect(mapCombatPowerLabel(12_345.678)).not.toMatch(/ATK|DEF|COMBAT POWER/);
  });

  it('projects Commander Corps power on the same neutral map scale', () => {
    expect(commanderForceMapCombatPower({
      manpower: 0.012,
      baseAttack: 3.2,
      baseDefense: 2.8,
    })).toBe(36.24);
    expect(commanderForceMapCombatPower({
      manpower: -1,
      baseAttack: Number.NaN,
      baseDefense: 4,
    })).toBe(0);
  });
});
