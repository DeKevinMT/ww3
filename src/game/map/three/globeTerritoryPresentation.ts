import type { MapArmyState } from '../bridge';

export type GlobeTerritoryReadinessTone = 'critical' | 'strained' | 'ready';

export interface GlobeTerritoryReadinessPresentation {
  readonly fillRatio: number;
  readonly localCapacityRatio: number;
  readonly tone: GlobeTerritoryReadinessTone;
}

const boundedRatio = (value: number): number => Math.max(0, Math.min(1, value));

/**
 * Compact local-force readiness for globe nameplates. The numerator is the
 * force physically available in this territory; the denominator includes its
 * bounded empire-support deployment room when supplied by the map snapshot.
 */
export function globeTerritoryReadinessPresentation(
  army: Pick<MapArmyState, 'manpower' | 'capacity' | 'deploymentCapacity'>,
): GlobeTerritoryReadinessPresentation {
  const localCapacity = Math.max(0, army.capacity);
  const deploymentCapacity = Math.max(
    localCapacity,
    army.deploymentCapacity ?? localCapacity,
  );
  const fillRatio = deploymentCapacity > 0
    ? boundedRatio(Math.max(0, army.manpower) / deploymentCapacity)
    : 0;
  const localCapacityRatio = deploymentCapacity > 0
    ? boundedRatio(localCapacity / deploymentCapacity)
    : 1;
  const tone: GlobeTerritoryReadinessTone = fillRatio < 0.35
    ? 'critical'
    : fillRatio < 0.7 ? 'strained' : 'ready';
  return Object.freeze({ fillRatio, localCapacityRatio, tone });
}
