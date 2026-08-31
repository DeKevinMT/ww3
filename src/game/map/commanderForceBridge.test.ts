import { describe, expect, it } from 'vitest';
import {
  mapCommanderRecoveryLifecycleActive,
  mapCommanderTransitEta,
  mapCommanderTransitProgress,
  type MapCommanderForceState,
} from './bridge';

function forceWithTransit(
  departTick: number,
  arriveTick: number,
): Pick<MapCommanderForceState, 'transit'> {
  return {
    transit: {
      path: ['bel', 'fra', 'esp'],
      departTick,
      arriveTick,
    },
  };
}

describe('EONSCAR neural-dome map transit projection', () => {
  it('interpolates only inside the canonical movement window', () => {
    const force = forceWithTransit(100, 120);
    expect(mapCommanderTransitProgress(force, 90)).toBe(0);
    expect(mapCommanderTransitProgress(force, 105)).toBe(0.25);
    expect(mapCommanderTransitProgress(force, 120)).toBe(1);
    expect(mapCommanderTransitProgress(force, 140)).toBe(1);
  });

  it('reports a stable whole-week ETA and zero while on station', () => {
    const force = forceWithTransit(100, 120);
    expect(mapCommanderTransitEta(force, 112.4)).toBe(8);
    expect(mapCommanderTransitEta(force, 121)).toBe(0);
    expect(mapCommanderTransitEta({ transit: null }, 112)).toBe(0);
  });

  it('handles same-tick movement without division by zero', () => {
    const force = forceWithTransit(25, 25);
    expect(mapCommanderTransitProgress(force, 24)).toBe(0);
    expect(mapCommanderTransitProgress(force, 25)).toBe(0);
    expect(mapCommanderTransitProgress(force, 26)).toBe(1);
  });

  it('keeps extracted EONSCAR unavailable for the complete canonical recovery mission', () => {
    expect(mapCommanderRecoveryLifecycleActive({ mission: 'hq-training' })).toBe(true);
    expect(mapCommanderRecoveryLifecycleActive({ mission: 'evacuate' })).toBe(true);
    expect(mapCommanderRecoveryLifecycleActive({ mission: 'standby' })).toBe(false);
    expect(mapCommanderRecoveryLifecycleActive({ mission: 'assault-support' })).toBe(false);
  });
});
