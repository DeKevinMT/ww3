import type { MapLogisticsMovement } from '../bridge';

export interface GlobeLogisticsRoute {
  readonly playerId: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly manpower: number;
  readonly capacity: number;
}

export type GlobeLogisticsAllegiance = 'human' | 'rogue-ai';

export interface GlobeVisibleLogisticsRoute extends GlobeLogisticsRoute {
  readonly allegiance: GlobeLogisticsAllegiance;
  readonly access?: 'land' | 'naval';
}

/**
 * Recent simulation transfers may contain several pulses over the same lane.
 * Merge them before touching Three.js so one visible lane always remains one
 * line/material and the route graph stays bounded.
 */
export function groupGlobeLogisticsMovements(
  movements: readonly MapLogisticsMovement[],
  playerId: string,
  limit = 6,
): readonly GlobeLogisticsRoute[] {
  const routes = new Map<string, GlobeLogisticsRoute>();
  for (const movement of movements) {
    if (movement.playerId !== playerId || movement.manpower <= 0.000001) continue;
    const key = movement.sourceId + '>' + movement.targetId;
    const existing = routes.get(key);
    routes.set(key, existing ? {
      ...existing,
      manpower: existing.manpower + movement.manpower,
      capacity: existing.capacity + movement.capacity,
    } : { ...movement });
  }
  return [...routes.values()]
    .sort((left, right) => (
      right.manpower - left.manpower
      || left.sourceId.localeCompare(right.sourceId)
      || left.targetId.localeCompare(right.targetId)
    ))
    .slice(0, Math.max(0, limit));
}

/**
 * Keep the strongest recent routes for both sides. A per-side cap prevents a
 * busy permanent Survival war from creating an unbounded Three.js material
 * graph while still ensuring enemy logistics never displaces the player's.
 */
export function selectGlobeVisibleLogisticsRoutes(
  movements: readonly MapLogisticsMovement[],
  humanPlayerId: string,
  roguePlayerId = 'rai',
  perSideLimit = 5,
): readonly GlobeVisibleLogisticsRoute[] {
  const withAllegiance = (
    routes: readonly GlobeLogisticsRoute[],
    allegiance: GlobeLogisticsAllegiance,
  ): GlobeVisibleLogisticsRoute[] => routes.map((route) => ({
    ...route,
    allegiance,
    access: movements.find((movement) => (
      movement.playerId === route.playerId
        && movement.sourceId === route.sourceId
        && movement.targetId === route.targetId
    ))?.access,
  }));
  const human = withAllegiance(
    groupGlobeLogisticsMovements(movements, humanPlayerId, perSideLimit),
    'human',
  );
  if (humanPlayerId === roguePlayerId) return human;
  const rogue = withAllegiance(
    groupGlobeLogisticsMovements(movements, roguePlayerId, perSideLimit),
    'rogue-ai',
  );
  return [...human, ...rogue];
}
