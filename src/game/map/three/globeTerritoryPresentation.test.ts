import { describe, expect, it } from 'vitest';
import {
  globeTerritoryReadinessPresentation,
  globeRogueTerritoryPresentation,
  globeTerritorySupplyNodePresentation,
} from './globeTerritoryPresentation';

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

describe('Rogue AI territory map presentation', () => {
  it('renders rear occupation as one persistent compact readiness bar', () => {
    expect(globeRogueTerritoryPresentation('rai', 'bel', ['rai', 'fra'], false)).toEqual({
      rogue: true,
      compact: true,
      persistent: true,
      showPower: false,
      humanBorder: false,
      activeFront: false,
    });
  });

  it('expands a human border or active front to local Combat Power', () => {
    expect(globeRogueTerritoryPresentation('rai', 'bel', ['bel'], false)).toMatchObject({
      compact: false,
      showPower: true,
      humanBorder: true,
    });
    expect(globeRogueTerritoryPresentation('rai', 'bel', [], true)).toMatchObject({
      compact: false,
      showPower: true,
      activeFront: true,
    });
    expect(globeRogueTerritoryPresentation('rai', ['bel', 'nld'], ['nld'], false)).toMatchObject({
      compact: false,
      showPower: true,
      humanBorder: true,
    });
  });

  it('does not alter ordinary human or neutral territory labels', () => {
    expect(globeRogueTerritoryPresentation('fra', 'bel', ['bel'], true)).toEqual({
      rogue: false,
      compact: false,
      persistent: false,
      showPower: false,
      humanBorder: false,
      activeFront: false,
    });
  });
});

describe('globe territory supply-node presentation', () => {
  it('keeps integrating and completed player territories in one compact persistent style', () => {
    expect(globeTerritorySupplyNodePresentation('human', 'human', false, true)).toEqual({
      compact: true,
      persistent: true,
      showIntegrationProgress: true,
    });
    expect(globeTerritorySupplyNodePresentation('human', 'human', false, false)).toEqual({
      compact: true,
      persistent: true,
      showIntegrationProgress: false,
    });
  });

  it('does not collapse capitals or foreign integrating territories', () => {
    expect(globeTerritorySupplyNodePresentation('human', 'human', true, true).compact).toBe(false);
    expect(globeTerritorySupplyNodePresentation('rival', 'human', false, true).persistent).toBe(false);
  });
});
