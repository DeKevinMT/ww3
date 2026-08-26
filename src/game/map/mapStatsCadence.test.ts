import { describe, expect, it } from 'vitest';
import { MapStatsRefreshCadence, PEACE_MAP_STATS_REFRESH_TICKS, peacefulMapStatsBucket } from './mapStatsCadence';

const territory = (id: string, ownerId = id, lifecycleKey = `${ownerId}:core`) => ({ id, ownerId, lifecycleKey });

describe('map stat refresh cadence', () => {
  it('stagger-refreshes peaceful countries exactly once per four-week cycle', () => {
    const cadence = new MapStatsRefreshCadence();
    const territories = [territory('bel'), territory('nld'), territory('lux')];
    expect([...cadence.resolve({ tick: 0, territories, warOwnerIds: new Set() })].sort())
      .toEqual(['bel', 'lux', 'nld']);
    const seen = new Map<string, number>();
    for (let tick = 1; tick <= PEACE_MAP_STATS_REFRESH_TICKS; tick += 1) {
      for (const ownerId of cadence.resolve({ tick, territories, warOwnerIds: new Set() })) {
        seen.set(ownerId, (seen.get(ownerId) ?? 0) + 1);
        expect(tick % PEACE_MAP_STATS_REFRESH_TICKS).toBe(peacefulMapStatsBucket(ownerId));
      }
    }
    expect(Object.fromEntries(seen)).toEqual({ bel: 1, nld: 1, lux: 1 });
  });

  it('keeps belligerents live while peaceful nations remain on their own bucket', () => {
    const cadence = new MapStatsRefreshCadence();
    const territories = [territory('bel'), territory('nld'), territory('lux')];
    cadence.resolve({ tick: 0, territories, warOwnerIds: new Set() });
    for (let tick = 1; tick <= 3; tick += 1) {
      const due = cadence.resolve({ tick, territories, warOwnerIds: new Set(['bel', 'nld']) });
      expect(due.has('bel')).toBe(true);
      expect(due.has('nld')).toBe(true);
      if (tick % 4 !== peacefulMapStatsBucket('lux')) expect(due.has('lux')).toBe(false);
    }
  });

  it('immediately refreshes selection, ownership, integration and war lifecycle changes', () => {
    const cadence = new MapStatsRefreshCadence();
    cadence.resolve({ tick: 0, territories: [territory('bel')], warOwnerIds: new Set() });
    const offBucketTick = [1, 2, 3, 4].find((tick) => tick % 4 !== peacefulMapStatsBucket('bel'))!;
    cadence.invalidateOwners(['bel']);
    expect(cadence.resolve({ tick: offBucketTick, territories: [territory('bel')], warOwnerIds: new Set() }).has('bel')).toBe(true);
    const ownership = cadence.resolve({ tick: offBucketTick + 4, territories: [territory('bel', 'nld', 'nld:integrating')], warOwnerIds: new Set() });
    expect(ownership.has('bel')).toBe(true);
    expect(ownership.has('nld')).toBe(true);
    expect(cadence.resolve({ tick: offBucketTick + 8, territories: [territory('bel', 'nld', 'nld:core')], warOwnerIds: new Set() }).has('nld')).toBe(true);
    expect(cadence.resolve({ tick: offBucketTick + 12, territories: [territory('bel', 'nld', 'nld:core')], warOwnerIds: new Set(['nld']) }).has('nld')).toBe(true);
    expect(cadence.resolve({ tick: offBucketTick + 13, territories: [territory('bel', 'nld', 'nld:core')], warOwnerIds: new Set() }).has('nld')).toBe(true);
  });
});
