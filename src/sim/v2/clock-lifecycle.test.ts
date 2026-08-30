import { afterEach, describe, expect, it, vi } from 'vitest';
import { V2_TICK_DURATION_MS } from './balance';
import { createWorldStateV2 } from './bootstrap';
import { synchronizeArmyCapacityV2 } from './capacity';
import { WORLD_CONTENT_V2, type WorldContentV2 } from './content';
import { WorldEngineV2 } from './WorldEngineV2';
import {
  nationIdV2,
  territoryIdV2,
  type FrontOperationV2,
  type PlayerId,
  type TerritoryId,
} from './types';

const BEL = nationIdV2('bel');
const DEU = nationIdV2('deu');
const BEL_HOME = territoryIdV2('bel');
const BEL_FRONT = territoryIdV2('nld');
const DEU_HOME = territoryIdV2('deu');

function activeWarResumeContent(): WorldContentV2 {
  return {
    nationIds: [BEL, DEU],
    territoryIds: [BEL_HOME, BEL_FRONT, DEU_HOME],
    nations: {
      [BEL]: { ...WORLD_CONTENT_V2.nations[BEL]!, initialCapitalId: BEL_HOME },
      [DEU]: { ...WORLD_CONTENT_V2.nations[DEU]!, initialCapitalId: DEU_HOME },
    } as Record<PlayerId, WorldContentV2['nations'][PlayerId]>,
    territories: {
      [BEL_HOME]: {
        ...WORLD_CONTENT_V2.territories[BEL_HOME]!,
        initialOwnerId: BEL,
        connections: [{ targetId: BEL_FRONT, kind: 'land' }],
      },
      [BEL_FRONT]: {
        ...WORLD_CONTENT_V2.territories[BEL_FRONT]!,
        initialOwnerId: BEL,
        connections: [
          { targetId: BEL_HOME, kind: 'land' },
          { targetId: DEU_HOME, kind: 'land' },
        ],
      },
      [DEU_HOME]: {
        ...WORLD_CONTENT_V2.territories[DEU_HOME]!,
        initialOwnerId: DEU,
        connections: [{ targetId: BEL_FRONT, kind: 'land' }],
      },
    } as Record<TerritoryId, WorldContentV2['territories'][TerritoryId]>,
  };
}

describe('V2 clock lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps country selection pure and starts only under an explicit clock owner', () => {
    vi.useFakeTimers();
    const engine = new WorldEngineV2(73_001);

    expect(engine.chooseCountry(nationIdV2('grl'))).toEqual({ accepted: true });
    expect(engine.state.speed).toBe(1);
    expect(vi.getTimerCount()).toBe(0);

    engine.startClock();
    expect(vi.getTimerCount()).toBe(1);

    // Restarting replaces the existing interval instead of leaking a second one.
    engine.startClock();
    expect(vi.getTimerCount()).toBe(1);

    engine.stopClock();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('explicitly resumes a paused active-war save with its front and logistics intact', () => {
    vi.useFakeTimers();
    const content = activeWarResumeContent();
    const state = createWorldStateV2(73_002, content);
    state.tick = 8;
    state.speed = 0;
    state.wars = [];
    synchronizeArmyCapacityV2(state, content);

    const home = state.territories[BEL_HOME]!;
    const front = state.territories[BEL_FRONT]!;
    const enemy = state.territories[DEU_HOME]!;
    home.army.manpower = home.army.capacity * 0.95;
    front.army.manpower = front.army.capacity * 0.05;
    enemy.army.manpower = enemy.army.capacity * 0.95;
    // This fixture authors its own force distribution and is not exercising
    // Belgium's temporary opening-force entitlement.
    state.players[BEL]!.openingArmyBonus = null;
    const operation: FrontOperationV2 = {
      commanderId: BEL,
      sourceId: BEL_FRONT,
      targetId: DEU_HOME,
      doctrine: 'pressure',
      access: 'land',
      startedTick: 0,
      lastBattleTick: 8,
      holdUntilTick: 20,
      momentum: 0,
    };
    state.wars.push({
      id: 'resume-active-war',
      attackerId: BEL,
      defenderId: DEU,
      startedTick: 0,
      lastBattleTick: 8,
      warScore: 0,
      battles: 0,
      attackerLosses: 0,
      defenderLosses: 0,
      lastPeaceOfferTick: -1_000_000,
      attackerOperations: [operation],
      defenderOperations: [],
    });

    const saved = new WorldEngineV2(1, content, state).save();
    const resumed = WorldEngineV2.fromSave(saved, content);
    expect(resumed.state.speed).toBe(0);
    expect(resumed.state.wars[0]?.attackerOperations).toEqual([operation]);

    // Loading alone is intentionally inert, even if a caller invokes the old
    // startClock path. This was the Continue Campaign freeze.
    resumed.startClock();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(V2_TICK_DURATION_MS * 2);
    expect(resumed.state.tick).toBe(8);

    expect(resumed.resumeClock()).toEqual({ accepted: true });
    expect(resumed.state.speed).toBe(1);
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(V2_TICK_DURATION_MS);
    expect(resumed.state.tick).toBe(9);
    expect(resumed.recentLogisticsMovements().some((movement) => (
      movement.playerId === BEL
        && movement.sourceId === BEL_HOME
        && movement.targetId === BEL_FRONT
        && movement.manpower > 0
    ))).toBe(true);

    vi.advanceTimersByTime(V2_TICK_DURATION_MS);
    const activeWar = resumed.state.wars.find((war) => war.id === 'resume-active-war');
    expect(resumed.state.tick).toBe(10);
    expect(activeWar?.battles).toBeGreaterThan(0);
    expect(activeWar?.attackerOperations[0]?.lastBattleTick).toBe(10);
    resumed.stopClock();
    expect(vi.getTimerCount()).toBe(0);
  });
});
