import type { MapArmyState } from '../bridge';

export type GlobeTerritoryReadinessTone = 'critical' | 'strained' | 'ready';

export interface GlobeTerritoryReadinessPresentation {
  readonly fillRatio: number;
  readonly localCapacityRatio: number;
  readonly tone: GlobeTerritoryReadinessTone;
}

export interface GlobeTerritorySupplyNodePresentation {
  readonly compact: boolean;
  readonly persistent: boolean;
  readonly showIntegrationProgress: boolean;
}

const boundedRatio = (value: number): number => Math.max(0, Math.min(1, value));

/** Player-controlled non-capitals are permanent compact supply nameplates. */
export function globeTerritorySupplyNodePresentation(
  ownerId: string,
  humanPlayerId: string | undefined,
  empireCapital: boolean,
  integrating: boolean,
): GlobeTerritorySupplyNodePresentation {
  const compact = ownerId === humanPlayerId && !empireCapital;
  return Object.freeze({
    compact,
    persistent: compact,
    showIntegrationProgress: compact && integrating,
  });
}

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
