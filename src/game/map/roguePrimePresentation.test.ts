import { describe, expect, it } from 'vitest';
import type { ApexIntelligenceVisibility } from './apexIntelligenceFog';
import type { MapRoguePrimeState } from './bridge';
import {
  ROGUE_PRIME_BEACHHEAD_ROUTE_LIMIT,
  roguePrimeMapPresentation,
} from './roguePrimePresentation';

const visibility = (
  visibleTerritoryIds: readonly string[],
  enabled = true,
  roguePrimeDetected = visibleTerritoryIds.some((id) => (
    id === 'zero-point-core' || id === 'maud-entry' || id === 'zaf'
  )),
): ApexIntelligenceVisibility => ({
  enabled,
  viewerId: 'gnb',
  chartedTerritoryIds: new Set(),
  clearTerritoryIds: new Set(visibleTerritoryIds),
  frontierTerritoryIds: new Set(),
  visibleTerritoryIds: new Set(visibleTerritoryIds),
  detectedRogueRouteKeys: new Set(),
  roguePrimeDetected,
  roguePrimeTrackedRemotely: false,
  detectedRoguePrimeTerritoryIds: roguePrimeDetected
    ? new Set(['zero-point-core', 'queen-maud-grid', 'maud-entry', 'zaf'])
    : new Set(),
  signature: visibleTerritoryIds.join(','),
});

const prime = (): MapRoguePrimeState => ({
  status: 'sortie',
  sortieSequence: 1,
  nextSortieTick: null,
  gatewayId: 'maud-entry',
  targetId: 'zaf',
  departTick: 10,
  strikeTick: 20,
  returnTick: 40,
  rebuildReadyTick: null,
  force: {
    playerId: 'rogue-prime',
    role: 'rogue-prime',
    headquartersId: 'zero-point-core',
    locationId: 'zero-point-core',
    mission: 'standby',
    front: 'zaf',
    army: { manpower: 0.0003, capacity: 0.0005, trainedReserves: 0, baseAttack: 70, baseDefense: 80 },
    economy: { treasury: 20, annualOutput: 0, supplyStock: 0.01 },
    transit: { path: ['zero-point-core', 'queen-maud-grid', 'maud-entry'], departTick: 10, arriveTick: 20 },
  },
});

describe('ROGUE PRIME map presentation', () => {
  it('does not disclose a hostile force while every relevant territory is outside intel', () => {
    expect(roguePrimeMapPresentation(prime(), 14, visibility(['gnb']))).toMatchObject({
      visible: false,
      routeVisible: false,
    });
  });

  it('shows the slow authored Antarctic approach once its route is detected', () => {
    const view = roguePrimeMapPresentation(prime(), 15, visibility(['maud-entry']));
    expect(view.visible).toBe(true);
    expect(view.routePath).toEqual(['zero-point-core', 'queen-maud-grid', 'maud-entry']);
    expect(view.routeProgress).toBe(0.5);
    expect(view.etaTicks).toBe(5);
    expect(view.combatActive).toBe(false);
  });

  it('uses one direct beachhead lane, reverses, and never enters the target interior', () => {
    const mid = roguePrimeMapPresentation(prime(), 30, visibility(['zaf']));
    expect(mid.routePath).toEqual(['maud-entry', 'zaf']);
    expect(mid.routeProgress).toBe(ROGUE_PRIME_BEACHHEAD_ROUTE_LIMIT);
    expect(mid.routeProgress).toBeLessThan(0.5);
    expect(mid.combatActive).toBe(true);
    const returning = roguePrimeMapPresentation(prime(), 35, visibility(['zaf']));
    expect(returning.routeProgress).toBeLessThan(mid.routeProgress);
    expect(returning.etaTicks).toBe(5);
  });

  it('renders guarding PRIME only when its exact Antarctic post is visible', () => {
    const guarding = { ...prime(), status: 'guarding' as const, gatewayId: null, targetId: null };
    guarding.force = { ...guarding.force!, locationId: 'zero-point-core', transit: null, front: null };
    expect(roguePrimeMapPresentation(guarding, 50, visibility(['zero-point-core']))).toMatchObject({
      visible: true,
      routePath: ['zero-point-core'],
      moving: false,
    });
    expect(roguePrimeMapPresentation(guarding, 50, visibility(['gnb'])).visible).toBe(false);
  });
});
