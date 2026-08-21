import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { synchronizeArmyCapacityV2 } from './capacity';
import { WORLD_CONTENT_V2 } from './content';
import { assertInvariantsV2 } from './invariants';
import { selectTerritoriesOfV2 } from './selectors';
import { nationIdV2, type FrontOperationV2, type TerritoryId } from './types';
import { veteranBonusScoreV2 } from './veterans';
import { logisticsThroughputShareV2, redistributeArmiesV2 } from './war';

const bel = nationIdV2('bel');

describe('route-aware empire logistics', () => {
  it('gives small armies a larger movable share while large empires retain diminishing absolute throughput', () => {
    const miniShare = logisticsThroughputShareV2(0.03, 0, false);
    const regionalShare = logisticsThroughputShareV2(0.25, 0, false);
    const empireShare = logisticsThroughputShareV2(5, 0, false);
    expect(miniShare).toBeGreaterThan(regionalShare);
    expect(regionalShare).toBeGreaterThan(empireShare);
    expect(5 * empireShare).toBeGreaterThan(0.03 * miniShare);
    expect(logisticsThroughputShareV2(0.25, 20, false)).toBeGreaterThan(regionalShare);
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
      state.territories[id]!.integration = 1;
    }
    // Model a recently conquered frontier whose native population cap was
    // heavily reduced, while the connected empire can still support it.
    state.territories[secondId]!.population *= 0.05;
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const capital = state.territories[capitalId]!;
    const relay = state.territories[firstId]!;
    const frontier = state.territories[secondId]!;
    capital.army.manpower = capital.army.capacity * 0.90;
    capital.army.veteranManpower = capital.army.manpower * 0.40;
    capital.army.veteranExperience = 9;
    relay.army.manpower = relay.army.capacity * 0.90;
    relay.army.veteranManpower = relay.army.manpower * 0.50;
    relay.army.veteranExperience = 1;
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
    const veteransBefore = selectTerritoriesOfV2(state, bel)
      .reduce((sum, territory) => sum + territory.army.veteranManpower, 0);
    const veteranBonusScoreMassBefore = selectTerritoriesOfV2(state, bel)
      .reduce((sum, territory) => sum
        + territory.army.veteranManpower * veteranBonusScoreV2(territory.army.veteranExperience), 0);
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
      manpowerBefore * logisticsThroughputShareV2(manpowerBefore, 20, true) + 1e-9,
    );
    expect(firstWeek.some((move) => move.veteranManpower > 0)).toBe(true);
    expect(firstWeek.every((move) => move.capacity === 0)).toBe(true);
    expect(state.players[bel]!.treasury).toBe(treasuryBefore);
    // The relay is itself an external border and therefore builds its own
    // garrison before forwarding the surplus. The active front must still be
    // reinforced within a deliberate, non-teleporting half-year window.
    for (let week = 0; week < 100; week += 1) redistributeArmiesV2(state, WORLD_CONTENT_V2);
    expect(frontier.army.manpower).toBeGreaterThan(frontierBefore);
    expect(frontier.army.manpower).toBeGreaterThan(frontier.army.capacity);
    expect(capital.army.manpower).toBeLessThan(capital.army.capacity * 0.90);
    expect(selectTerritoriesOfV2(state, bel).reduce((sum, territory) => sum + territory.army.manpower, 0))
      .toBeCloseTo(manpowerBefore, 7);
    expect(selectTerritoriesOfV2(state, bel).reduce((sum, territory) => sum + territory.army.capacity, 0))
      .toBeCloseTo(capacityBefore, 7);
    expect(selectTerritoriesOfV2(state, bel).reduce((sum, territory) => sum + territory.army.veteranManpower, 0))
      .toBeCloseTo(veteransBefore, 7);
    expect(selectTerritoriesOfV2(state, bel).reduce((sum, territory) => sum
      + territory.army.veteranManpower * veteranBonusScoreV2(territory.army.veteranExperience), 0))
      .toBeCloseTo(veteranBonusScoreMassBefore, 7);
    expect(selectTerritoriesOfV2(state, bel).reduce((sum, territory) => sum
      + territory.army.manpower * territory.army.baseAttack, 0))
      .toBeCloseTo(attackQualityMassBefore, 7);
    expect(selectTerritoriesOfV2(state, bel).reduce((sum, territory) => sum
      + territory.army.manpower * territory.army.baseDefense, 0))
      .toBeCloseTo(defenseQualityMassBefore, 7);
    assertInvariantsV2(state, WORLD_CONTENT_V2);
  });
});
