/** Peaceful map badges are a strategic snapshot, not a second live simulation UI. */
export const PEACE_MAP_STATS_REFRESH_TICKS = 4;

export interface MapStatsTerritoryIdentity {
  id: string;
  ownerId: string;
  /** Changes on ownership and integration lifecycle transitions, not on weekly progress. */
  lifecycleKey: string;
}

export interface MapStatsCadenceInput {
  tick: number;
  territories: readonly MapStatsTerritoryIdentity[];
  warOwnerIds: ReadonlySet<string>;
}

/** Stable staggering prevents every peaceful country from refreshing in the same week. */
export function peacefulMapStatsBucket(ownerId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < ownerId.length; index += 1) {
    hash ^= ownerId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % PEACE_MAP_STATS_REFRESH_TICKS;
}

/**
 * Decides which national map-stat projections must be rebuilt for one renderer
 * snapshot. Simulation state remains fully weekly; only its map projection is
 * cadenced. The first read, selection invalidation, ownership/integration
 * lifecycle changes and war transitions always bypass the peaceful cadence.
 */
export class MapStatsRefreshCadence {
  private initialized = false;
  private readonly invalidatedOwnerIds = new Set<string>();
  private readonly ownerByTerritory = new Map<string, string>();
  private readonly lifecycleByTerritory = new Map<string, string>();
  private warOwnerIds = new Set<string>();
  private readonly lastCadenceRefreshTick = new Map<string, number>();

  invalidateOwners(ownerIds: Iterable<string>): void {
    for (const ownerId of ownerIds) if (ownerId) this.invalidatedOwnerIds.add(ownerId);
  }

  resolve(input: MapStatsCadenceInput): ReadonlySet<string> {
    const refreshOwnerIds = new Set<string>();
    const currentOwnerIds = new Set<string>();
    const currentTerritoryIds = new Set<string>();

    for (const territory of input.territories) {
      currentOwnerIds.add(territory.ownerId);
      currentTerritoryIds.add(territory.id);
      const previousOwnerId = this.ownerByTerritory.get(territory.id);
      const previousLifecycle = this.lifecycleByTerritory.get(territory.id);
      if (this.initialized && previousOwnerId !== undefined && previousOwnerId !== territory.ownerId) {
        refreshOwnerIds.add(previousOwnerId);
        refreshOwnerIds.add(territory.ownerId);
      }
      if (this.initialized && previousLifecycle !== undefined
        && previousLifecycle !== territory.lifecycleKey) {
        if (previousOwnerId) refreshOwnerIds.add(previousOwnerId);
        refreshOwnerIds.add(territory.ownerId);
      }
      this.ownerByTerritory.set(territory.id, territory.ownerId);
      this.lifecycleByTerritory.set(territory.id, territory.lifecycleKey);
    }

    for (const [territoryId, previousOwnerId] of this.ownerByTerritory) {
      if (currentTerritoryIds.has(territoryId)) continue;
      refreshOwnerIds.add(previousOwnerId);
      this.ownerByTerritory.delete(territoryId);
      this.lifecycleByTerritory.delete(territoryId);
    }

    if (!this.initialized) {
      for (const ownerId of currentOwnerIds) refreshOwnerIds.add(ownerId);
    } else {
      // Starting or ending a war immediately materialises both sides once. A
      // country that remains at war continues through the live path below.
      for (const ownerId of this.warOwnerIds) {
        if (!input.warOwnerIds.has(ownerId)) refreshOwnerIds.add(ownerId);
      }
      for (const ownerId of input.warOwnerIds) {
        if (!this.warOwnerIds.has(ownerId)) refreshOwnerIds.add(ownerId);
      }
    }

    for (const ownerId of this.invalidatedOwnerIds) refreshOwnerIds.add(ownerId);
    this.invalidatedOwnerIds.clear();

    for (const ownerId of currentOwnerIds) {
      if (input.warOwnerIds.has(ownerId)) {
        // Deliberately refresh again after a same-tick action: battle, reserve
        // deployment and peace decisions should be visible without delay.
        refreshOwnerIds.add(ownerId);
        continue;
      }
      const due = ((input.tick % PEACE_MAP_STATS_REFRESH_TICKS)
        + PEACE_MAP_STATS_REFRESH_TICKS) % PEACE_MAP_STATS_REFRESH_TICKS
        === peacefulMapStatsBucket(ownerId);
      if (due && this.lastCadenceRefreshTick.get(ownerId) !== input.tick) {
        refreshOwnerIds.add(ownerId);
        this.lastCadenceRefreshTick.set(ownerId, input.tick);
      }
    }

    this.initialized = true;
    this.warOwnerIds = new Set(input.warOwnerIds);
    return refreshOwnerIds;
  }
}
