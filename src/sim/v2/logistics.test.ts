import { describe, expect, it } from 'vitest';
import { CONQUEST_CAPTURE_GUARD_TICKS } from './balance';
import { createWorldStateV2 } from './bootstrap';
import { synchronizeArmyCapacityV2 } from './capacity';
import { WORLD_CONTENT_V2, type WorldContentV2 } from './content';
import { territoryIntegrationAnnualCostV2 } from './integration';
import {
  LAND_ARMY_CAPACITY_SUPPLY_SHARE_V2,
  NAVAL_ARMY_CAPACITY_SUPPLY_SHARE_V2,
} from './logistics';
import { invalidateTerritoryIndexV2 } from './selectors';
import {
  nationIdV2,
  territoryIdV2,
  type FrontOperationV2,
  type TerritoryId,
  type WorldStateV2,
} from './types';
import {
  internalArmyTransferLogisticsTermsV2,
  logisticsThroughputShareV2,
  redistributeArmiesV2,
} from './war';

const BEL = nationIdV2('bel');

function withConnections(
  connections: Readonly<Record<string, readonly {
    targetId: TerritoryId;
    kind: 'land' | 'sea';
    distanceKm?: number;
  }[]>>,
): WorldContentV2 {
  const territories = { ...WORLD_CONTENT_V2.territories };
  for (const [id, edges] of Object.entries(connections)) {
    const territoryId = territoryIdV2(id);
    territories[territoryId] = {
      ...territories[territoryId]!,
      connections: edges.map((edge) => ({ ...edge })),
    };
  }
  return { ...WORLD_CONTENT_V2, territories };
}

function twoTerritoryFixture(
  access: 'land' | 'sea',
  distanceKm = 0,
  treasury = 10_000,
): { state: WorldStateV2; content: WorldContentV2; sourceId: TerritoryId; targetId: TerritoryId } {
  const state = createWorldStateV2(4_450);
  state.wars = [];
  const targetId = state.players[BEL]!.capitalId;
  const sourceId = territoryIdV2('nld');
  const edge = access === 'sea'
    ? { kind: access, distanceKm, targetId }
    : { kind: access, targetId };
  const reverse = access === 'sea'
    ? { kind: access, distanceKm, targetId: sourceId }
    : { kind: access, targetId: sourceId };
  const content = withConnections({ [sourceId]: [edge], [targetId]: [reverse] });
  state.territories[sourceId]!.owner = BEL;
  state.territories[sourceId]!.coreOwner = BEL;
  state.territories[sourceId]!.integration = 1;
  delete state.territories[sourceId]!.integrationProgram;
  state.players[BEL]!.openingArmyBonus = null;
  state.players[BEL]!.treasury = treasury;
  invalidateTerritoryIndexV2(state);
  synchronizeArmyCapacityV2(state, content);
  state.territories[targetId]!.army.manpower = 0;
  state.territories[sourceId]!.army.manpower = state.territories[sourceId]!.army.capacity;
  return { state, content, sourceId, targetId };
}

describe('simple Army Capacity logistics', () => {
  it('uses one fixed 8% land share independent of empire size or research', () => {
    expect(logisticsThroughputShareV2(0.03, 0)).toBe(LAND_ARMY_CAPACITY_SUPPLY_SHARE_V2);
    expect(logisticsThroughputShareV2(5, 20, 1.1)).toBe(LAND_ARMY_CAPACITY_SUPPLY_SHARE_V2);
  });

  it('moves at most one owned hop per weekly pass and prioritises the active war territory', () => {
    const state = createWorldStateV2(4_401);
    state.wars = [];
    const capitalId = state.players[BEL]!.capitalId;
    const relayId = WORLD_CONTENT_V2.territories[capitalId]!.connections
      .find((edge) => edge.kind === 'land')!.targetId;
    const frontId = WORLD_CONTENT_V2.territories[relayId]!.connections
      .find((edge) => edge.kind === 'land' && edge.targetId !== capitalId)!.targetId;
    const enemyEdge = WORLD_CONTENT_V2.territories[frontId]!.connections
      .find((edge) => edge.kind === 'land' && edge.targetId !== relayId)!;
    for (const id of [relayId, frontId]) {
      state.territories[id]!.owner = BEL;
      state.territories[id]!.coreOwner = BEL;
      state.territories[id]!.integration = 1;
      delete state.territories[id]!.integrationProgram;
    }
    invalidateTerritoryIndexV2(state);
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    state.territories[capitalId]!.army.manpower = state.territories[capitalId]!.army.capacity;
    state.territories[relayId]!.army.manpower = state.territories[relayId]!.army.capacity;
    state.territories[frontId]!.army.manpower = 0;
    const enemyId = state.territories[enemyEdge.targetId]!.owner;
    const operation: FrontOperationV2 = {
      commanderId: BEL,
      sourceId: frontId,
      targetId: enemyEdge.targetId,
      doctrine: 'pressure',
      access: 'land',
      startedTick: 0,
      lastBattleTick: 0,
      holdUntilTick: 12,
      momentum: 0,
    };
    state.wars = [{
      id: 'front', attackerId: BEL, defenderId: enemyId,
      startedTick: 0, lastBattleTick: 0, warScore: 0, battles: 0,
      attackerLosses: 0, defenderLosses: 0, lastPeaceOfferTick: -1,
      attackerOperations: [operation], defenderOperations: [],
    }];

    const movements = redistributeArmiesV2(state, WORLD_CONTENT_V2)
      .filter((movement) => movement.playerId === BEL);
    const direct = movements.find((movement) => movement.sourceId === relayId
      && movement.targetId === frontId);
    expect(direct?.manpower).toBeGreaterThan(0);
    expect(direct!.manpower).toBeLessThanOrEqual(
      state.territories[relayId]!.army.capacity * LAND_ARMY_CAPACITY_SUPPLY_SHARE_V2 + 1e-9,
    );
    expect(movements.some((movement) => movement.sourceId === capitalId
      && movement.targetId === frontId)).toBe(false);
  });

  it('moves exactly half as much by sea and ignores route distance', () => {
    const land = twoTerritoryFixture('land');
    const shortSea = twoTerritoryFixture('sea', 2_000);
    const longSea = twoTerritoryFixture('sea', 12_000);
    const moved = (fixture: typeof land): number => redistributeArmiesV2(
      fixture.state,
      fixture.content,
    ).reduce((sum, movement) => sum + movement.manpower, 0);
    const landMoved = moved(land);
    const shortMoved = moved(shortSea);
    const longMoved = moved(longSea);
    expect(shortMoved).toBeCloseTo(longMoved, 9);
    expect(shortMoved / landMoved).toBeCloseTo(
      NAVAL_ARMY_CAPACITY_SUPPLY_SHARE_V2 / LAND_ARMY_CAPACITY_SUPPLY_SHARE_V2,
      9,
    );
  });

  it('charges a small flat cost but never blocks a cash-poor movement', () => {
    const poor = twoTerritoryFixture('sea', 12_000, 0);
    const rich = twoTerritoryFixture('sea', 12_000, 10_000);
    const poorMoves = redistributeArmiesV2(poor.state, poor.content);
    const richMoves = redistributeArmiesV2(rich.state, rich.content);
    expect(poorMoves[0]?.manpower).toBeCloseTo(richMoves[0]?.manpower ?? 0, 9);
    expect(poorMoves[0]?.logisticsCost).toBe(0);
    expect(richMoves[0]?.logisticsCost).toBeGreaterThan(0);
    expect(richMoves[0]?.logisticsCost).toBeLessThan(0.01);
    const quote = internalArmyTransferLogisticsTermsV2(
      rich.state, rich.content, BEL, rich.sourceId, rich.targetId, 1,
    );
    expect(quote.throughputMultiplier).toBe(0.5);
    expect(quote.interiorDistanceKm).toBe(0);
  });

  it('holds the capture guard, then releases the same direct neighbour budget', () => {
    const fixture = twoTerritoryFixture('land');
    const { state, content, sourceId, targetId } = fixture;
    const originalCore = nationIdV2('nld');
    state.territories[sourceId]!.integrationProgram = {
      fromOwnerId: originalCore,
      fromCoreOwnerId: originalCore,
      toOwnerId: BEL,
      startedTick: 20,
      completesTick: 10_000,
      annualCost: territoryIntegrationAnnualCostV2(state.territories[sourceId]!.economy),
    };
    state.tick = 20 + CONQUEST_CAPTURE_GUARD_TICKS - 1;
    expect(redistributeArmiesV2(state, content)
      .some((movement) => movement.sourceId === sourceId)).toBe(false);
    state.tick += 1;
    const released = redistributeArmiesV2(state, content)
      .find((movement) => movement.sourceId === sourceId && movement.targetId === targetId);
    expect(released?.manpower).toBeGreaterThan(0);
  });
});
