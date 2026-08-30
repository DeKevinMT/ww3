import { REGIONS, TERRITORIES, TERRITORY_BY_ID, territoriesInRegion } from './data/map';
import { UNIT_DEFINITIONS, stackValue } from './data/units';
import type { GameState, PlayerId, RegionId, TerritoryId, UnitInstance } from './types';

export function activePlayer(state: GameState) {
  return state.players[state.activePlayerIndex]!;
}

export function territoriesOwnedBy(state: GameState, playerId: PlayerId) {
  return TERRITORIES.filter((territory) => state.territories[territory.id]?.ownerId === playerId);
}

export function territoryCount(state: GameState, playerId: PlayerId): number {
  return territoriesOwnedBy(state, playerId).length;
}

export function controlsRegion(state: GameState, playerId: PlayerId, regionId: RegionId): boolean {
  const territories = territoriesInRegion(regionId);
  return territories.length > 0 && territories.every((territory) => state.territories[territory.id]?.ownerId === playerId);
}

export function controlledRegions(state: GameState, playerId: PlayerId) {
  return REGIONS.filter((region) => controlsRegion(state, playerId, region.id));
}

export function reinforcementIncome(state: GameState, playerId: PlayerId): number {
  const territories = territoryCount(state, playerId);
  if (territories === 0) return 0;
  const regionBonus = controlledRegions(state, playerId).reduce((sum, region) => sum + region.bonus, 0);
  return Math.max(3, Math.floor(territories / 3)) + regionBonus;
}

export function isBorderTerritory(state: GameState, territoryId: TerritoryId): boolean {
  const territory = state.territories[territoryId];
  const definition = TERRITORY_BY_ID[territoryId];
  if (!territory || !definition) return false;
  return definition.neighbors.some((neighborId) => state.territories[neighborId]?.ownerId !== territory.ownerId);
}

export function enemyNeighbors(state: GameState, territoryId: TerritoryId): TerritoryId[] {
  const territory = state.territories[territoryId];
  if (!territory) return [];
  return (TERRITORY_BY_ID[territoryId]?.neighbors ?? []).filter(
    (neighborId) => state.territories[neighborId]?.ownerId !== territory.ownerId,
  );
}

export function ownedNeighbors(state: GameState, territoryId: TerritoryId): TerritoryId[] {
  const territory = state.territories[territoryId];
  if (!territory) return [];
  return (TERRITORY_BY_ID[territoryId]?.neighbors ?? []).filter(
    (neighborId) => state.territories[neighborId]?.ownerId === territory.ownerId,
  );
}

export function findOwnedPath(
  state: GameState,
  playerId: PlayerId,
  startId: TerritoryId,
  targetId: TerritoryId,
): TerritoryId[] | undefined {
  if (startId === targetId) return [startId];
  const visited = new Set<TerritoryId>([startId]);
  const queue: { id: TerritoryId; path: TerritoryId[] }[] = [{ id: startId, path: [startId] }];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of TERRITORY_BY_ID[current.id]?.neighbors ?? []) {
      if (visited.has(neighbor) || state.territories[neighbor]?.ownerId !== playerId) continue;
      const path = [...current.path, neighbor];
      if (neighbor === targetId) return path;
      visited.add(neighbor);
      queue.push({ id: neighbor, path });
    }
  }
  return undefined;
}

export function unitCombatPower(units: readonly UnitInstance[]): number {
  return units.reduce((sum, unit) => {
    const definition = UNIT_DEFINITIONS[unit.type];
    const healthFactor = 0.5 + 0.5 * (unit.hp / definition.maxHp);
    return sum + definition.attack * healthFactor + definition.defense * 0.55 + unit.hp * 0.3;
  }, 0);
}

export function playerArmyValue(state: GameState, playerId: PlayerId): number {
  return territoriesOwnedBy(state, playerId).reduce(
    (sum, territory) => sum + stackValue(state.territories[territory.id]?.units ?? []),
    0,
  );
}
