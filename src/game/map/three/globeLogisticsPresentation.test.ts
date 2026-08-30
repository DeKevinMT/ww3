import { describe, expect, it } from 'vitest';
import {
  groupGlobeLogisticsMovements,
  selectGlobeVisibleLogisticsRoutes,
} from './globeLogisticsPresentation';

describe('globe logistics presentation', () => {
  it('groups repeated pulses into one directional route', () => {
    const routes = groupGlobeLogisticsMovements([
      { playerId: 'bel', sourceId: 'bel', targetId: 'nld', manpower: 2, capacity: 3 },
      { playerId: 'bel', sourceId: 'bel', targetId: 'nld', manpower: 4, capacity: 5 },
      { playerId: 'fra', sourceId: 'fra', targetId: 'bel', manpower: 9, capacity: 9 },
    ], 'bel');
    expect(routes).toEqual([{
      playerId: 'bel',
      sourceId: 'bel',
      targetId: 'nld',
      manpower: 6,
      capacity: 8,
    }]);
  });

  it('keeps only the strongest bounded set of visible routes', () => {
    const routes = groupGlobeLogisticsMovements([
      { playerId: 'bel', sourceId: 'bel', targetId: 'a', manpower: 1, capacity: 1 },
      { playerId: 'bel', sourceId: 'bel', targetId: 'b', manpower: 4, capacity: 1 },
      { playerId: 'bel', sourceId: 'bel', targetId: 'c', manpower: 2, capacity: 1 },
    ], 'bel', 2);
    expect(routes.map((route) => route.targetId)).toEqual(['b', 'c']);
  });

  it('keeps bounded human and Rogue AI lanes visible alongside each other', () => {
    const routes = selectGlobeVisibleLogisticsRoutes([
      { playerId: 'bel', sourceId: 'bel', targetId: 'nld', manpower: 4, capacity: 5, access: 'land' },
      { playerId: 'bel', sourceId: 'bel', targetId: 'fra', manpower: 2, capacity: 3, access: 'land' },
      { playerId: 'rai', sourceId: 'deu', targetId: 'bel', manpower: 8, capacity: 9, access: 'land' },
      { playerId: 'rai', sourceId: 'zero-point-core', targetId: 'ross-entry', manpower: 6, capacity: 7, access: 'naval' },
      { playerId: 'fra', sourceId: 'fra', targetId: 'bel', manpower: 99, capacity: 99, access: 'land' },
    ], 'bel', 'rai', 1);

    expect(routes).toEqual([
      expect.objectContaining({ playerId: 'bel', targetId: 'nld', allegiance: 'human', access: 'land' }),
      expect.objectContaining({ playerId: 'rai', targetId: 'bel', allegiance: 'rogue-ai', access: 'land' }),
    ]);
    expect(routes).toHaveLength(2);
  });
});
