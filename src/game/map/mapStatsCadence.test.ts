import { describe, expect, it } from 'vitest';
import {
  MapStatsRefreshCadence,
  PEACE_MAP_STATS_REFRESH_TICKS,
  peacefulMapStatsBucket,
} from './mapStatsCadence';

const territory = (id: string, ownerId = id, lifecycleKey = `${ownerId}:core`) => ({
  id, ownerId, lifecycleKey,
});
describe('map stat refresh cadence', () => {
  it('stagger-refreshes non-front territory bars exactly once per slow cycle', () => {
    const cadence = new MapStatsRefreshCadence();
    const territories = [territory('bel'), territory('nld'), territory('lux')];
    expect([...cadence.resolve({ tick: 0, territories, warOwnerIds: new Set() }).territoryIds].sort())
      .toEqual(['bel', 'lux', 'nld']);
    const seen = new Map<string, number>();
    for (let tick = 1; tick <= PEACE_MAP_STATS_REFRESH_TICKS; tick += 1) {
      const plan = cadence.resolve({ tick, territories, warOwnerIds: new Set() });
      for (const territoryId of plan.territoryIds) {
        seen.set(territoryId, (seen.get(territoryId) ?? 0) + 1);
        expect(tick % PEACE_MAP_STATS_REFRESH_TICKS).toBe(peacefulMapStatsBucket(territoryId));
      }
    }
    expect(Object.fromEntries(seen)).toEqual({ bel: 1, nld: 1, lux: 1 });
  });

  it('keeps only real war endpoints live instead of every Rogue holding', () => {
    const cadence = new MapStatsRefreshCadence();
    const territories = [
      territory('human-core', 'human'),
      ...Array.from({ length: 100 }, (_, index) => territory(`rai-${index}`, 'rai')),
    ];
    cadence.resolve({ tick: 0, territories, warOwnerIds: new Set() });
    const plan = cadence.resolve({
      tick: 1,
      territories,
      warOwnerIds: new Set(['human', 'rai']),
      warTerritoryIds: new Set(['human-core', 'rai-0']),
    });
    expect(plan.territoryIds.has('human-core')).toBe(true);
    expect(plan.territoryIds.has('rai-0')).toBe(true);
    expect(plan.aggregateOwnerIds).toEqual(new Set(['human', 'rai']));
    expect(plan.territoryIds.size).toBeLessThanOrEqual(20);
    expect(plan.territoryIds.size).toBeLessThan(territories.length / 2);
  });

  it('immediately refreshes exact selection, ownership, integration and war lifecycle changes', () => {
    const cadence = new MapStatsRefreshCadence();
    cadence.resolve({ tick: 0, territories: [territory('bel')], warOwnerIds: new Set() });
    const offBucketTick = Array.from({ length: PEACE_MAP_STATS_REFRESH_TICKS }, (_, index) => index + 1)
      .find((tick) => tick % PEACE_MAP_STATS_REFRESH_TICKS !== peacefulMapStatsBucket('bel'))!;
    cadence.invalidateTerritories(['bel']);
    expect(cadence.resolve({
      tick: offBucketTick,
      territories: [territory('bel')],
      warOwnerIds: new Set(),
    }).territoryIds.has('bel')).toBe(true);

    const ownership = cadence.resolve({
      tick: offBucketTick + PEACE_MAP_STATS_REFRESH_TICKS,
      territories: [territory('bel', 'nld', 'nld:integrating')],
      warOwnerIds: new Set(),
    });
    expect(ownership.territoryIds.has('bel')).toBe(true);
    expect(ownership.aggregateOwnerIds).toEqual(new Set(['bel', 'nld']));

    const integration = cadence.resolve({
      tick: offBucketTick + PEACE_MAP_STATS_REFRESH_TICKS * 2,
      territories: [territory('bel', 'nld', 'nld:core')],
      warOwnerIds: new Set(),
    });
    expect(integration.territoryIds.has('bel')).toBe(true);
    expect(integration.aggregateOwnerIds.has('nld')).toBe(true);

    const warStart = cadence.resolve({
      tick: offBucketTick + PEACE_MAP_STATS_REFRESH_TICKS * 3,
      territories: [territory('bel', 'nld', 'nld:core')],
      warOwnerIds: new Set(['nld']),
      warTerritoryIds: new Set(['bel']),
    });
    expect(warStart.territoryIds.has('bel')).toBe(true);
    expect(warStart.aggregateOwnerIds.has('nld')).toBe(true);
  });
});
