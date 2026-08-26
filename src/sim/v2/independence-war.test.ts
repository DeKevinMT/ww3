import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { synchronizeArmyCapacityV2 } from './capacity';
import { WORLD_CONTENT_V2 } from './content';
import { assertInvariantsV2 } from './invariants';
import { nationIdV2 } from './types';
import { beginIndependenceWarV2 } from './war';

const bel = nationIdV2('bel');
const lux = nationIdV2('lux');

describe('forced independence war', () => {
  it('supersedes bilateral peace, bypasses ordinary gates and opens only one war', () => {
    const state = createWorldStateV2(93_001);
    state.tick = 100;
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    state.players[lux]!.treasury = -50;
    state.truces = [{ leftId: bel, rightId: lux, expiresTick: 500 }];
    state.ceasefireObligations = [{
      warId: 'old-peace',
      payerId: lux,
      payeeId: bel,
      weeklyCost: 1,
      startsTick: 10,
      expiresTick: 500,
    }];
    state.offers = [{
      id: 'old-offer',
      fromId: bel,
      toId: lux,
      warId: 'old-peace',
      settlement: 'ceasefire',
      createdTick: 99,
      expiresTick: 107,
      status: 'pending',
    }];
    const manpowerBefore = Object.values(state.territories)
      .filter((territory) => territory.owner === lux)
      .reduce((sum, territory) => sum + territory.army.manpower, 0);

    expect(beginIndependenceWarV2(
      state,
      WORLD_CONTENT_V2,
      lux,
      bel,
    )).toEqual({ accepted: true });
    const wars = state.wars.filter((war) => (
      (war.attackerId === lux && war.defenderId === bel)
        || (war.attackerId === bel && war.defenderId === lux)
    ));
    expect(wars).toHaveLength(1);
    expect(wars[0]).toMatchObject({
      attackerId: lux,
      defenderId: bel,
      attackerLosses: expect.any(Number),
      battles: 0,
    });
    expect(wars[0]!.attackerLosses / manpowerBefore).toBeCloseTo(0.01, 8);
    expect(state.truces).toEqual([]);
    expect(state.ceasefireObligations).toEqual([]);
    expect(state.offers).toEqual([]);

    const manpowerAfterFirstStart = Object.values(state.territories)
      .filter((territory) => territory.owner === lux)
      .reduce((sum, territory) => sum + territory.army.manpower, 0);
    expect(beginIndependenceWarV2(
      state,
      WORLD_CONTENT_V2,
      lux,
      bel,
    )).toEqual({ accepted: true });
    expect(state.wars.filter((war) => (
      (war.attackerId === lux && war.defenderId === bel)
        || (war.attackerId === bel && war.defenderId === lux)
    ))).toHaveLength(1);
    expect(Object.values(state.territories)
      .filter((territory) => territory.owner === lux)
      .reduce((sum, territory) => sum + territory.army.manpower, 0))
      .toBeCloseTo(manpowerAfterFirstStart, 9);
    assertInvariantsV2(state, WORLD_CONTENT_V2);
  });
});
