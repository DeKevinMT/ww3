import { describe, expect, it } from 'vitest';
import { globeTerritoryReadinessPresentation } from './globeTerritoryPresentation';

describe('globe territory readiness presentation', () => {
  it('uses the empire-support deployment ceiling as its denominator', () => {
    const readiness = globeTerritoryReadinessPresentation({
      manpower: 60,
      capacity: 40,
      deploymentCapacity: 100,
    });
    expect(readiness.fillRatio).toBe(0.6);
    expect(readiness.localCapacityRatio).toBe(0.4);
    expect(readiness.tone).toBe('strained');
  });

  it('falls back to the local cap for legacy map snapshots', () => {
    expect(globeTerritoryReadinessPresentation({
      manpower: 8,
      capacity: 10,
    })).toEqual({
      fillRatio: 0.8,
      localCapacityRatio: 1,
      tone: 'ready',
    });
  });

  it('clamps temporary overshoots and handles an empty territory', () => {
    expect(globeTerritoryReadinessPresentation({
      manpower: 25,
      capacity: 10,
      deploymentCapacity: 20,
    }).fillRatio).toBe(1);
    expect(globeTerritoryReadinessPresentation({
      manpower: 0,
      capacity: 0,
      deploymentCapacity: 0,
    }).tone).toBe('critical');
  });
});
