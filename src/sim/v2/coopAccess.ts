import { NAVAL_ROUTE_BASE_DISTANCE_KM } from './balance';
import { isWorldConnectionOpenV2 } from './antarcticGateways';
import type { WorldContentV2 } from './content';
import { areHumanTeammatesV2, selectHumanPlayerIdsV2 } from './humanPlayers';
import type { PlayerId, TerritoryId, WorldStateV2 } from './types';

/**
 * Co-op access stays deliberately local. An authored edge is always required,
 * no route may cross a neutral/AI country, and at most two real sea legs can
 * participate in one relay. This is access, never shared ownership or control.
 */
export const COOP_ACCESS_MAX_ROUTE_EDGES_V2 = 7;
export const COOP_ACCESS_MAX_NAVAL_EDGES_V2 = 2;
export const COOP_ACCESS_MAX_NAVAL_DISTANCE_KM_V2 = 12_000;

export interface CoopMilitaryAccessRouteV2 {
  readonly sourceId: TerritoryId;
  readonly targetId: TerritoryId;
  readonly path: readonly TerritoryId[];
  readonly access: 'land' | 'naval';
  readonly hopCount: number;
  readonly seaHops: number;
  readonly distanceKm: number;
  /** Human teammates whose sovereign territory carries this route. */
  readonly relayOwnerIds: readonly PlayerId[];
}

interface RouteSearchNodeV2 {
  readonly id: TerritoryId;
  readonly path: readonly TerritoryId[];
  readonly seaHops: number;
  readonly distanceKm: number;
}

/**
 * Survival co-op deliberately fields two sovereign fronts. The host Empire
 * and the Dawnline Accord share the outcome, but never pool territory,
 * formations or logistics. Other modes retain the authored co-op relay model.
 */
export function survivalCoopUsesSovereignLogisticsV2(
  state: Pick<WorldStateV2, 'humanPlayerId' | 'humanPlayerIds' | 'players'>,
  content: WorldContentV2,
): boolean {
  return content.metadata?.scenarioId === 'survival'
    && selectHumanPlayerIdsV2(state).length > 1;
}

function pathKeyV2(path: readonly TerritoryId[]): string {
  return path.join('>');
}

function compareSearchNodeV2(left: RouteSearchNodeV2, right: RouteSearchNodeV2): number {
  return left.seaHops - right.seaHops
    || left.distanceKm - right.distanceKm
    || left.path.length - right.path.length
    || pathKeyV2(left.path).localeCompare(pathKeyV2(right.path));
}

function compareRouteV2(
  left: CoopMilitaryAccessRouteV2,
  right: CoopMilitaryAccessRouteV2,
): number {
  return Number(left.access === 'naval') - Number(right.access === 'naval')
    || left.seaHops - right.seaHops
    || left.distanceKm - right.distanceKm
    || left.hopCount - right.hopCount
    || left.sourceId.localeCompare(right.sourceId)
    || left.targetId.localeCompare(right.targetId)
    || pathKeyV2(left.path).localeCompare(pathKeyV2(right.path));
}

function relayOwnersV2(
  state: WorldStateV2,
  moverId: PlayerId,
  path: readonly TerritoryId[],
): PlayerId[] {
  return [...new Set(path.slice(1, -1)
    .map((territoryId) => state.territories[territoryId]?.owner)
    .filter((ownerId): ownerId is PlayerId => Boolean(
      ownerId && ownerId !== moverId && areHumanTeammatesV2(state, moverId, ownerId),
    )))]
    .sort((left, right) => left.localeCompare(right));
}

function routeFromPathV2(
  state: WorldStateV2,
  sourceId: TerritoryId,
  targetId: TerritoryId,
  path: readonly TerritoryId[],
  seaHops: number,
  distanceKm: number,
  moverId: PlayerId,
): CoopMilitaryAccessRouteV2 {
  return {
    sourceId,
    targetId,
    path: [...path],
    access: seaHops > 0 ? 'naval' : 'land',
    hopCount: Math.max(0, path.length - 1),
    seaHops,
    distanceKm,
    relayOwnerIds: relayOwnersV2(state, moverId, path),
  };
}

function directRoutesV2(
  state: WorldStateV2,
  content: WorldContentV2,
  moverId: PlayerId,
  opponentId: PlayerId,
  sourceIds: readonly TerritoryId[],
): CoopMilitaryAccessRouteV2[] {
  const routes: CoopMilitaryAccessRouteV2[] = [];
  for (const sourceId of sourceIds) {
    for (const edge of content.territories[sourceId]?.connections ?? []) {
      if (!isWorldConnectionOpenV2(state, sourceId, edge.targetId)
        || state.territories[edge.targetId]?.owner !== opponentId) continue;
      const seaHops = edge.kind === 'sea' ? 1 : 0;
      routes.push(routeFromPathV2(
        state,
        sourceId,
        edge.targetId,
        [sourceId, edge.targetId],
        seaHops,
        seaHops > 0 ? Math.max(0, edge.distanceKm ?? NAVAL_ROUTE_BASE_DISTANCE_KM) : 0,
        moverId,
      ));
    }
  }
  return routes.sort(compareRouteV2);
}

/**
 * All deterministic legal fronts for one country's own formations. In solo
 * and for AI countries this is intentionally the old direct-contact graph.
 * Only configured human co-op seats may use teammate corridors and relays.
 */
export function selectCoopMilitaryAccessRoutesV2(
  state: WorldStateV2,
  content: WorldContentV2,
  moverId: PlayerId,
  opponentId: PlayerId,
  sourceIds: readonly TerritoryId[] = Object.entries(state.territories)
    .filter(([, territory]) => territory.owner === moverId)
    .map(([territoryId]) => territoryId as TerritoryId),
): CoopMilitaryAccessRouteV2[] {
  const canonicalSources = [...new Set(sourceIds)]
    .filter((sourceId) => state.territories[sourceId]?.owner === moverId)
    .sort((left, right) => left.localeCompare(right));
  const humanIds = selectHumanPlayerIdsV2(state);
  const expandedCoopAccess = humanIds.length > 1
    && humanIds.includes(moverId)
    && !survivalCoopUsesSovereignLogisticsV2(state, content);
  if (!expandedCoopAccess) {
    return directRoutesV2(state, content, moverId, opponentId, canonicalSources);
  }

  const routesByPair = new Map<string, CoopMilitaryAccessRouteV2>();
  const friendlyOwner = (ownerId: PlayerId | undefined): boolean => Boolean(
    ownerId && (ownerId === moverId || areHumanTeammatesV2(state, moverId, ownerId)),
  );
  for (const sourceId of canonicalSources) {
    const queue: RouteSearchNodeV2[] = [{
      id: sourceId,
      path: [sourceId],
      seaHops: 0,
      distanceKm: 0,
    }];
    const best = new Map<string, RouteSearchNodeV2>();
    best.set(`${sourceId}|0`, queue[0]!);
    while (queue.length > 0) {
      queue.sort(compareSearchNodeV2);
      const current = queue.shift()!;
      if (current.path.length - 1 >= COOP_ACCESS_MAX_ROUTE_EDGES_V2) continue;
      for (const edge of [...(content.territories[current.id]?.connections ?? [])]
        .sort((left, right) => left.targetId.localeCompare(right.targetId))) {
        if (!isWorldConnectionOpenV2(state, current.id, edge.targetId)
          || current.path.includes(edge.targetId)) continue;
        const seaHops = current.seaHops + Number(edge.kind === 'sea');
        const distanceKm = current.distanceKm + (edge.kind === 'sea'
          ? Math.max(0, edge.distanceKm ?? NAVAL_ROUTE_BASE_DISTANCE_KM) : 0);
        if (seaHops > COOP_ACCESS_MAX_NAVAL_EDGES_V2
          || distanceKm > COOP_ACCESS_MAX_NAVAL_DISTANCE_KM_V2) continue;
        const path = [...current.path, edge.targetId];
        const ownerId = state.territories[edge.targetId]?.owner;
        if (ownerId === opponentId) {
          const route = routeFromPathV2(
            state, sourceId, edge.targetId, path, seaHops, distanceKm, moverId,
          );
          const key = `${sourceId}>${edge.targetId}`;
          const existing = routesByPair.get(key);
          if (!existing || compareRouteV2(route, existing) < 0) routesByPair.set(key, route);
          continue;
        }
        // Neutral and ordinary AI land is never a free bridge, even if that
        // country happens to be diplomatically friendly in the solo model.
        if (!friendlyOwner(ownerId)) continue;
        const candidate: RouteSearchNodeV2 = {
          id: edge.targetId,
          path,
          seaHops,
          distanceKm,
        };
        const key = `${edge.targetId}|${seaHops}`;
        const existing = best.get(key);
        if (existing && compareSearchNodeV2(existing, candidate) <= 0) continue;
        best.set(key, candidate);
        queue.push(candidate);
      }
    }
  }
  return [...routesByPair.values()].sort(compareRouteV2);
}

export function selectBestCoopMilitaryAccessRouteV2(
  state: WorldStateV2,
  content: WorldContentV2,
  moverId: PlayerId,
  opponentId: PlayerId,
): CoopMilitaryAccessRouteV2 | undefined {
  return selectCoopMilitaryAccessRoutesV2(state, content, moverId, opponentId)[0];
}

export function selectCoopMilitaryAccessRouteBetweenV2(
  state: WorldStateV2,
  content: WorldContentV2,
  moverId: PlayerId,
  opponentId: PlayerId,
  sourceId: TerritoryId,
  targetId: TerritoryId,
): CoopMilitaryAccessRouteV2 | undefined {
  return selectCoopMilitaryAccessRoutesV2(
    state,
    content,
    moverId,
    opponentId,
    [sourceId],
  ).find((route) => route.targetId === targetId);
}

/**
 * Real co-op staging path into a teammate-owned territory. This is used by
 * bounded allied contingents and never changes who owns or commands either
 * endpoint. The destination itself must be a configured teammate country.
 */
export function selectBestCoopFriendlyTransitRouteV2(
  state: WorldStateV2,
  content: WorldContentV2,
  moverId: PlayerId,
  destinationId: TerritoryId,
  sourceIds: readonly TerritoryId[] = Object.entries(state.territories)
    .filter(([, territory]) => territory.owner === moverId)
    .map(([territoryId]) => territoryId as TerritoryId),
): CoopMilitaryAccessRouteV2 | undefined {
  if (survivalCoopUsesSovereignLogisticsV2(state, content)) return undefined;
  const destinationOwner = state.territories[destinationId]?.owner;
  if (!destinationOwner || !areHumanTeammatesV2(state, moverId, destinationOwner)) return undefined;
  const canonicalSources = [...new Set(sourceIds)]
    .filter((sourceId) => state.territories[sourceId]?.owner === moverId)
    .sort((left, right) => left.localeCompare(right));
  const friendlyOwner = (ownerId: PlayerId | undefined): boolean => Boolean(
    ownerId && (ownerId === moverId || areHumanTeammatesV2(state, moverId, ownerId)),
  );
  const routes: CoopMilitaryAccessRouteV2[] = [];
  for (const sourceId of canonicalSources) {
    const queue: RouteSearchNodeV2[] = [{ id: sourceId, path: [sourceId], seaHops: 0, distanceKm: 0 }];
    const best = new Map<string, RouteSearchNodeV2>([[`${sourceId}|0`, queue[0]!]]);
    while (queue.length > 0) {
      queue.sort(compareSearchNodeV2);
      const current = queue.shift()!;
      if (current.path.length - 1 >= COOP_ACCESS_MAX_ROUTE_EDGES_V2) continue;
      for (const edge of [...(content.territories[current.id]?.connections ?? [])]
        .sort((left, right) => left.targetId.localeCompare(right.targetId))) {
        if (!isWorldConnectionOpenV2(state, current.id, edge.targetId)
          || current.path.includes(edge.targetId)) continue;
        const seaHops = current.seaHops + Number(edge.kind === 'sea');
        const distanceKm = current.distanceKm + (edge.kind === 'sea'
          ? Math.max(0, edge.distanceKm ?? NAVAL_ROUTE_BASE_DISTANCE_KM) : 0);
        if (seaHops > COOP_ACCESS_MAX_NAVAL_EDGES_V2
          || distanceKm > COOP_ACCESS_MAX_NAVAL_DISTANCE_KM_V2) continue;
        const path = [...current.path, edge.targetId];
        if (edge.targetId === destinationId) {
          routes.push(routeFromPathV2(
            state,
            sourceId,
            destinationId,
            path,
            seaHops,
            distanceKm,
            moverId,
          ));
          continue;
        }
        const ownerId = state.territories[edge.targetId]?.owner;
        if (!friendlyOwner(ownerId)) continue;
        const candidate: RouteSearchNodeV2 = { id: edge.targetId, path, seaHops, distanceKm };
        const key = `${edge.targetId}|${seaHops}`;
        const existing = best.get(key);
        if (existing && compareSearchNodeV2(existing, candidate) <= 0) continue;
        best.set(key, candidate);
        queue.push(candidate);
      }
    }
  }
  return routes.sort(compareRouteV2)[0];
}
