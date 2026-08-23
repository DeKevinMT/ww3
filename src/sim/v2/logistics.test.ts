import { describe, expect, it } from 'vitest';
import { CONQUEST_CAPTURE_GUARD_TICKS } from './balance';
import { createWorldStateV2 } from './bootstrap';
import {
  stateTerritoryArmySupportCeilingV2,
  synchronizeArmyCapacityV2,
} from './capacity';
import { WORLD_CONTENT_V2 } from './content';
import { territoryIntegrationAnnualCostV2 } from './integration';
import { assertInvariantsV2 } from './invariants';
import { selectNationalIqViewV2, selectTerritoriesOfV2 } from './selectors';
import { nationIdV2, type FrontOperationV2, type TerritoryId } from './types';
import { logisticsThroughputShareV2, redistributeArmiesV2 } from './war';

const bel = nationIdV2('bel');

describe('route-aware empire logistics', () => {
  it('gives small armies a larger movable share while large empires retain diminishing absolute throughput', () => {
    const miniShare = logisticsThroughputShareV2(0.03, 0);
    const regionalShare = logisticsThroughputShareV2(0.25, 0);
    const empireShare = logisticsThroughputShareV2(5, 0);
    expect(miniShare).toBeGreaterThan(regionalShare);
    expect(regionalShare).toBeGreaterThan(empireShare);
    expect(5 * empireShare).toBeGreaterThan(0.03 * miniShare);
    expect(logisticsThroughputShareV2(0.25, 20)).toBeGreaterThan(regionalShare);
  });

  it('moves real forces one owned hop at a time from safe interior land to an active frontier', () => {
    const state = createWorldStateV2(4_401);
    state.wars = [];
    const capitalId = state.players[bel]!.capitalId;
    const firstId = WORLD_CONTENT_V2.territories[capitalId]!.connections
      .find((edge) => edge.kind === 'land')!.targetId;
    const secondId = WORLD_CONTENT_V2.territories[firstId]!.connections
      .find((edge) => edge.kind === 'land' && edge.targetId !== capitalId)!.targetId;
    const enemyEdge = WORLD_CONTENT_V2.territories[secondId]!.connections
      .find((edge) => edge.kind === 'land' && edge.targetId !== firstId)!;
    const enemyId = state.territories[enemyEdge.targetId]!.owner;
    for (const id of [firstId, secondId]) {
      state.territories[id]!.owner = bel;
      state.territories[id]!.coreOwner = bel;
      state.territories[id]!.integration = 1;
      delete state.territories[id]!.integrationProgram;
    }
    // Model a recently conquered frontier whose native population cap was
    // heavily reduced, while the connected empire can still support it.
    state.territories[secondId]!.population *= 0.05;
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const capital = state.territories[capitalId]!;
    const relay = state.territories[firstId]!;
    const frontier = state.territories[secondId]!;
    capital.army.manpower = capital.army.capacity * 0.90;
    relay.army.manpower = relay.army.capacity * 0.90;
    frontier.army.manpower = frontier.army.capacity * 0.01;
    const operation: FrontOperationV2 = {
      commanderId: bel, sourceId: secondId, targetId: enemyEdge.targetId,
      doctrine: 'pressure', access: 'land', startedTick: 0, lastBattleTick: 0,
      holdUntilTick: 12, momentum: 0,
    };
    state.wars = [{
      id: 'logistics-front', attackerId: bel, defenderId: enemyId,
      startedTick: 0, lastBattleTick: 0, warScore: 0, battles: 0,
      attackerLosses: 0, defenderLosses: 0, lastPeaceOfferTick: -1,
      attackerOperations: [operation], defenderOperations: [],
    }];
    const manpowerBefore = selectTerritoriesOfV2(state, bel)
      .reduce((sum, territory) => sum + territory.army.manpower, 0);
    const capacityBefore = selectTerritoriesOfV2(state, bel)
      .reduce((sum, territory) => sum + territory.army.capacity, 0);
    const attackQualityMassBefore = selectTerritoriesOfV2(state, bel)
      .reduce((sum, territory) => sum + territory.army.manpower * territory.army.baseAttack, 0);
    const defenseQualityMassBefore = selectTerritoriesOfV2(state, bel)
      .reduce((sum, territory) => sum + territory.army.manpower * territory.army.baseDefense, 0);
    const frontierBefore = frontier.army.manpower;
    const treasuryBefore = state.players[bel]!.treasury;
    const firstWeek = redistributeArmiesV2(state, WORLD_CONTENT_V2);
    const firstWeekManpowerMoved = firstWeek.reduce((sum, move) => sum + move.manpower, 0);
    expect(firstWeek.some((move) => move.sourceId === capitalId && move.targetId === firstId)).toBe(true);
    expect(firstWeek.some((move) => move.sourceId === capitalId
      && move.targetId === secondId && move.manpower > 0)).toBe(false);
    expect(firstWeekManpowerMoved).toBeLessThanOrEqual(
      manpowerBefore * logisticsThroughputShareV2(
        manpowerBefore,
        20,
        selectNationalIqViewV2(WORLD_CONTENT_V2, bel).logisticsMultiplier,
      ) + 1e-9,
    );
    expect(firstWeek.every((move) => !('veteranManpower' in move))).toBe(true);
    expect(firstWeek.every((move) => move.capacity === 0)).toBe(true);
    expect(state.players[bel]!.treasury).toBe(treasuryBefore);
    // The relay is itself an external border and therefore builds its own
    // garrison before forwarding the surplus. The active front must still be
    // reinforced within a deliberate, non-teleporting half-year window.
    for (let week = 0; week < 100; week += 1) redistributeArmiesV2(state, WORLD_CONTENT_V2);
    expect(frontier.army.manpower).toBeGreaterThan(frontierBefore);
    expect(frontier.army.manpower).toBeGreaterThan(frontier.army.capacity);
    expect(frontier.army.manpower).toBeLessThanOrEqual(
      stateTerritoryArmySupportCeilingV2(state, WORLD_CONTENT_V2, secondId, bel) + 1e-9,
    );
    expect(capital.army.manpower).toBeLessThan(capital.army.capacity * 0.90);
    expect(selectTerritoriesOfV2(state, bel).reduce((sum, territory) => sum + territory.army.manpower, 0))
      .toBeCloseTo(manpowerBefore, 7);
    expect(selectTerritoriesOfV2(state, bel).reduce((sum, territory) => sum + territory.army.capacity, 0))
      .toBeCloseTo(capacityBefore, 7);
    expect(selectTerritoriesOfV2(state, bel).reduce((sum, territory) => sum
      + territory.army.manpower * territory.army.baseAttack, 0))
      .toBeCloseTo(attackQualityMassBefore, 7);
    expect(selectTerritoriesOfV2(state, bel).reduce((sum, territory) => sum
      + territory.army.manpower * territory.army.baseDefense, 0))
      .toBeCloseTo(defenseQualityMassBefore, 7);

    // A pre-existing save/scenario overshoot is never clamped. Its excess can
    // move only through the normal weekly logistics budget when another owned
    // territory has support room.
    capital.army.manpower = capital.army.capacity * 0.10;
    relay.army.manpower = relay.army.capacity * 0.10;
    const frontierSupportCeiling = stateTerritoryArmySupportCeilingV2(
      state, WORLD_CONTENT_V2, secondId, bel,
    );
    const legacyOvershoot = frontier.army.capacity * 10;
    frontier.army.manpower = legacyOvershoot;
    const overshootEmpireManpower = selectTerritoriesOfV2(state, bel)
      .reduce((sum, territory) => sum + territory.army.manpower, 0);
    const normalizationMoves = redistributeArmiesV2(state, WORLD_CONTENT_V2);
    const normalizedThisWeek = legacyOvershoot - frontier.army.manpower;
    expect(normalizationMoves.some((move) => move.sourceId === secondId)).toBe(true);
    expect(normalizedThisWeek).toBeGreaterThan(0);
    expect(normalizedThisWeek).toBeLessThanOrEqual(
      overshootEmpireManpower * logisticsThroughputShareV2(
        overshootEmpireManpower,
        state.players[bel]!.research.effectLevels.supply,
        selectNationalIqViewV2(WORLD_CONTENT_V2, bel).logisticsMultiplier,
      ) + 1e-9,
    );
    expect(frontier.army.manpower).toBeGreaterThan(frontierSupportCeiling);
    expect(selectTerritoriesOfV2(state, bel).reduce((sum, territory) => sum + territory.army.manpower, 0))
      .toBeCloseTo(overshootEmpireManpower, 8);

    // With every possible receiver already at its combat ceiling, logistics has nowhere legal
    // to place the excess and therefore leaves it untouched.
    capital.army.manpower = stateTerritoryArmySupportCeilingV2(
      state, WORLD_CONTENT_V2, capitalId, bel,
    );
    relay.army.manpower = stateTerritoryArmySupportCeilingV2(
      state, WORLD_CONTENT_V2, firstId, bel,
    );
    frontier.army.manpower = legacyOvershoot;
    expect(redistributeArmiesV2(state, WORLD_CONTENT_V2)).toHaveLength(0);
    expect(frontier.army.manpower).toBe(legacyOvershoot);
    assertInvariantsV2(state, WORLD_CONTENT_V2);
  });

  it('holds a real capture guard for 52 weeks and releases it through normal logistics afterward', () => {
    const state = createWorldStateV2(4_402);
    state.wars = [];
    const capitalId = state.players[bel]!.capitalId;
    const relayId = WORLD_CONTENT_V2.territories[capitalId]!.connections
      .find((edge) => edge.kind === 'land')!.targetId;
    const frontierId = WORLD_CONTENT_V2.territories[relayId]!.connections
      .find((edge) => edge.kind === 'land' && edge.targetId !== capitalId)!.targetId;
    const enemyEdge = WORLD_CONTENT_V2.territories[frontierId]!.connections
      .find((edge) => edge.kind === 'land' && edge.targetId !== relayId)!;
    const relayCoreOwner = state.territories[relayId]!.owner;
    const enemyId = state.territories[enemyEdge.targetId]!.owner;
    state.territories[relayId]!.owner = bel;
    state.territories[relayId]!.coreOwner = relayCoreOwner;
    state.territories[relayId]!.integration = 0.10;
    state.territories[relayId]!.population *= 0.05;
    state.territories[frontierId]!.owner = bel;
    state.territories[frontierId]!.coreOwner = bel;
    state.territories[frontierId]!.integration = 1;
    delete state.territories[frontierId]!.integrationProgram;
    const startedTick = 20;
    state.territories[relayId]!.integrationProgram = {
      fromOwnerId: relayCoreOwner,
      fromCoreOwnerId: relayCoreOwner,
      toOwnerId: bel,
      startedTick,
      completesTick: 10_000,
      annualCost: territoryIntegrationAnnualCostV2(state.territories[relayId]!.economy),
    };
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const capital = state.territories[capitalId]!;
    const relay = state.territories[relayId]!;
    const frontier = state.territories[frontierId]!;
    capital.army.manpower = 0;
    frontier.army.manpower = 0;
    relay.army.manpower = stateTerritoryArmySupportCeilingV2(
      state, WORLD_CONTENT_V2, relayId, bel,
    );
    const operation: FrontOperationV2 = {
      commanderId: bel,
      sourceId: frontierId,
      targetId: enemyEdge.targetId,
      doctrine: 'pressure',
      access: 'land',
      startedTick,
      lastBattleTick: startedTick,
      holdUntilTick: startedTick + 12,
      momentum: 0,
    };
    state.wars = [{
      id: 'capture-guard-logistics',
      attackerId: bel,
      defenderId: enemyId,
      startedTick,
      lastBattleTick: startedTick,
      warScore: 0,
      battles: 0,
      attackerLosses: 0,
      defenderLosses: 0,
      lastPeaceOfferTick: -1,
      attackerOperations: [operation],
      defenderOperations: [],
    }];
    const guardedManpower = relay.army.manpower;
    const empireManpower = selectTerritoriesOfV2(state, bel)
      .reduce((sum, territory) => sum + territory.army.manpower, 0);

    state.tick = startedTick + CONQUEST_CAPTURE_GUARD_TICKS - 1;
    const guardedMoves = redistributeArmiesV2(state, WORLD_CONTENT_V2);
    expect(guardedMoves.some((move) => move.sourceId === relayId)).toBe(false);
    expect(relay.army.manpower).toBe(guardedManpower);

    state.tick = startedTick + CONQUEST_CAPTURE_GUARD_TICKS;
    const releasedMoves = redistributeArmiesV2(state, WORLD_CONTENT_V2);
    expect(releasedMoves.some((move) => move.sourceId === relayId && move.manpower > 0)).toBe(true);
    expect(relay.army.manpower).toBeLessThan(guardedManpower);
    expect(selectTerritoriesOfV2(state, bel).reduce((sum, territory) => sum + territory.army.manpower, 0))
      .toBeCloseTo(empireManpower, 8);
    assertInvariantsV2(state, WORLD_CONTENT_V2);
  });
});
