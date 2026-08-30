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

export interface GlobeRogueTerritoryPresentation {
  readonly rogue: boolean;
  readonly compact: boolean;
  readonly persistent: boolean;
  readonly showPower: boolean;
  readonly humanBorder: boolean;
  readonly activeFront: boolean;
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
 * Machine occupation is legible everywhere without covering the globe in
 * full country cards. Only an immediate human border or a live front expands
 * a local node to expose its comparable Combat Power.
 */
export function globeRogueTerritoryPresentation(
  ownerId: string,
  humanPlayerIds: string | readonly string[] | undefined,
  neighborOwnerIds: readonly string[],
  activeFront: boolean,
  roguePlayerId = 'rai',
): GlobeRogueTerritoryPresentation {
  const rogue = ownerId === roguePlayerId;
  const humanIds = new Set(
    typeof humanPlayerIds === 'string'
      ? [humanPlayerIds]
      : humanPlayerIds ?? [],
  );
  const humanBorder = Boolean(
    rogue && neighborOwnerIds.some((neighborOwnerId) => humanIds.has(neighborOwnerId)),
  );
  const showPower = rogue && (humanBorder || activeFront);
  return Object.freeze({
    rogue,
    compact: rogue && !showPower,
    persistent: rogue,
    showPower,
    humanBorder,
    activeFront: rogue && activeFront,
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
