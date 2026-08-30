/** Peaceful map badges are a strategic snapshot, not a second live simulation UI. */
export const PEACE_MAP_STATS_REFRESH_TICKS = 8;

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
  /** Only real operation endpoints need exact live army/power projection. */
  warTerritoryIds?: ReadonlySet<string>;
}

export interface MapStatsRefreshPlan {
  /** Exact local bars/power records to rebuild. */
  readonly territoryIds: ReadonlySet<string>;
  /** One representative aggregate badge per owner; caller resolves its capital. */
  readonly aggregateOwnerIds: ReadonlySet<string>;
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
  private readonly invalidatedTerritoryIds = new Set<string>();
  private readonly ownerByTerritory = new Map<string, string>();
  private readonly lifecycleByTerritory = new Map<string, string>();
  private warOwnerIds = new Set<string>();
  private readonly lastCadenceRefreshTick = new Map<string, number>();

  invalidateOwners(ownerIds: Iterable<string>): void {
    for (const ownerId of ownerIds) if (ownerId) this.invalidatedOwnerIds.add(ownerId);
  }

  invalidateTerritories(territoryIds: Iterable<string>): void {
    for (const territoryId of territoryIds) if (territoryId) this.invalidatedTerritoryIds.add(territoryId);
  }

  resolve(input: MapStatsCadenceInput): MapStatsRefreshPlan {
    const refreshTerritoryIds = new Set<string>();
    const aggregateOwnerIds = new Set<string>();
    const currentOwnerIds = new Set<string>();
    const currentTerritoryIds = new Set<string>();

    for (const territory of input.territories) {
      currentOwnerIds.add(territory.ownerId);
      currentTerritoryIds.add(territory.id);
      const previousOwnerId = this.ownerByTerritory.get(territory.id);
      const previousLifecycle = this.lifecycleByTerritory.get(territory.id);
      if (this.initialized && previousOwnerId !== undefined && previousOwnerId !== territory.ownerId) {
        refreshTerritoryIds.add(territory.id);
        aggregateOwnerIds.add(previousOwnerId);
        aggregateOwnerIds.add(territory.ownerId);
      }
      if (this.initialized && previousLifecycle !== undefined
        && previousLifecycle !== territory.lifecycleKey) {
        refreshTerritoryIds.add(territory.id);
        if (previousOwnerId) aggregateOwnerIds.add(previousOwnerId);
        aggregateOwnerIds.add(territory.ownerId);
      }
      this.ownerByTerritory.set(territory.id, territory.ownerId);
      this.lifecycleByTerritory.set(territory.id, territory.lifecycleKey);
    }

    for (const [territoryId, previousOwnerId] of this.ownerByTerritory) {
      if (currentTerritoryIds.has(territoryId)) continue;
      aggregateOwnerIds.add(previousOwnerId);
      this.ownerByTerritory.delete(territoryId);
      this.lifecycleByTerritory.delete(territoryId);
    }

    if (!this.initialized) {
      for (const territoryId of currentTerritoryIds) refreshTerritoryIds.add(territoryId);
      for (const ownerId of currentOwnerIds) aggregateOwnerIds.add(ownerId);
    } else {
      // Starting or ending a war immediately materialises both sides once. A
      // country that remains at war continues through the live path below.
      for (const ownerId of this.warOwnerIds) {
        if (!input.warOwnerIds.has(ownerId)) aggregateOwnerIds.add(ownerId);
      }
      for (const ownerId of input.warOwnerIds) {
        if (!this.warOwnerIds.has(ownerId)) aggregateOwnerIds.add(ownerId);
      }
    }

    for (const ownerId of this.invalidatedOwnerIds) {
      aggregateOwnerIds.add(ownerId);
      for (const territory of input.territories) {
        if (territory.ownerId === ownerId) refreshTerritoryIds.add(territory.id);
      }
    }
    this.invalidatedOwnerIds.clear();
    for (const territoryId of this.invalidatedTerritoryIds) {
      refreshTerritoryIds.add(territoryId);
      const ownerId = this.ownerByTerritory.get(territoryId);
      if (ownerId) aggregateOwnerIds.add(ownerId);
    }
    this.invalidatedTerritoryIds.clear();

    for (const territoryId of input.warTerritoryIds ?? []) refreshTerritoryIds.add(territoryId);
    // Aggregate empire power may change every combat tick, but only one
    // representative badge per belligerent needs that live national value.
    for (const ownerId of input.warOwnerIds) aggregateOwnerIds.add(ownerId);

    for (const territory of input.territories) {
      if (refreshTerritoryIds.has(territory.id)) continue;
      const due = ((input.tick % PEACE_MAP_STATS_REFRESH_TICKS)
        + PEACE_MAP_STATS_REFRESH_TICKS) % PEACE_MAP_STATS_REFRESH_TICKS
        === peacefulMapStatsBucket(territory.id);
      if (due && this.lastCadenceRefreshTick.get(territory.id) !== input.tick) {
        refreshTerritoryIds.add(territory.id);
        this.lastCadenceRefreshTick.set(territory.id, input.tick);
      }
    }

    this.initialized = true;
    this.warOwnerIds = new Set(input.warOwnerIds);
    return { territoryIds: refreshTerritoryIds, aggregateOwnerIds };
  }
}
