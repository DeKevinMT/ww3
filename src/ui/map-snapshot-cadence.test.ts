import { describe, expect, it, vi } from 'vitest';
import {
  PEACE_MAP_STATS_REFRESH_TICKS,
  peacefulMapStatsBucket,
} from '../game/map/mapStatsCadence';
import { WorldEngineV2 } from '../sim/v2/WorldEngineV2';
import { nationIdV2, territoryIdV2 } from '../sim/v2/types';
import { createMapEngineAdapter } from './WorldUIV2';

function nextTickOutsideBucket(afterTick: number, ownerId: string): number {
  let tick = afterTick + 1;
  while (tick % PEACE_MAP_STATS_REFRESH_TICKS === peacefulMapStatsBucket(ownerId)) tick += 1;
  return tick;
}

function nextTickInBucket(afterTick: number, ownerId: string): number {
  let tick = afterTick + 1;
  while (tick % PEACE_MAP_STATS_REFRESH_TICKS !== peacefulMapStatsBucket(ownerId)) tick += 1;
  return tick;
}

describe('cadenced map snapshots', () => {
  it('keeps peaceful army badges cached until their staggered monthly refresh', () => {
    const engine = new WorldEngineV2(8_805);
    const belgium = nationIdV2('bel');
    const belgiumTerritory = territoryIdV2('bel');
    engine.state.wars = [];
    const adapter = createMapEngineAdapter(engine, () => engine.globalRanking());
    adapter.refreshSnapshot?.();
    const openingPower = adapter.state.territories[belgiumTerritory]!.army.power;

    engine.state.territories[belgiumTerritory]!.army.manpower *= 0.5;
    engine.state.tick = nextTickOutsideBucket(engine.state.tick, belgium);
    adapter.refreshSnapshot?.();
    expect(adapter.state.territories[belgiumTerritory]!.army.power).toBe(openingPower);

    engine.state.tick = nextTickInBucket(engine.state.tick, belgium);
    adapter.refreshSnapshot?.();
    expect(adapter.state.territories[belgiumTerritory]!.army.power).toBeLessThan(openingPower);
  });

  it('projects only one peaceful bucket but keeps war and selection changes immediate', () => {
    const engine = new WorldEngineV2(8_806);
    const belgium = nationIdV2('bel');
    const netherlands = nationIdV2('nld');
    const belgiumTerritory = territoryIdV2('bel');
    engine.state.wars = [];
    const attack = vi.spyOn(engine, 'effectiveAttack');
    const adapter = createMapEngineAdapter(engine, () => engine.globalRanking());
    adapter.refreshSnapshot?.();
    const territoryCount = Object.keys(adapter.state.territories).length;

    attack.mockClear();
    engine.state.tick = nextTickOutsideBucket(engine.state.tick, belgium);
    adapter.refreshSnapshot?.();
    expect(attack.mock.calls.length).toBeGreaterThan(0);
    expect(attack.mock.calls.length).toBeLessThan(territoryCount / 2);

    const beforeWar = adapter.state.territories[belgiumTerritory]!.army.power;
    engine.state.territories[belgiumTerritory]!.army.manpower *= 0.8;
    engine.state.wars.push({
      id: 'war-map-live', attackerId: belgium, defenderId: netherlands,
      startedTick: engine.state.tick, lastBattleTick: engine.state.tick,
      warScore: 0, battles: 0, attackerLosses: 0, defenderLosses: 0,
      lastPeaceOfferTick: -1, attackerOperations: [], defenderOperations: [],
    });
    adapter.refreshSnapshot?.();
    const wartimePower = adapter.state.territories[belgiumTerritory]!.army.power;
    expect(wartimePower).toBeLessThan(beforeWar);

    engine.state.territories[belgiumTerritory]!.army.manpower *= 0.8;
    engine.state.actionSequence += 1;
    adapter.refreshSnapshot?.();
    expect(adapter.state.territories[belgiumTerritory]!.army.power).toBeLessThan(wartimePower);

    engine.state.wars = [];
    adapter.refreshSnapshot?.();
    const afterPeace = adapter.state.territories[belgiumTerritory]!.army.power;
    engine.state.territories[belgiumTerritory]!.army.manpower *= 0.8;
    adapter.invalidateMapStats?.([belgiumTerritory]);
    adapter.refreshSnapshot?.();
    expect(adapter.state.territories[belgiumTerritory]!.army.power).toBeLessThan(afterPeace);
  });
});
