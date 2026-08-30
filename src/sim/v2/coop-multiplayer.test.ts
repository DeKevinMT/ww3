import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2, type WorldContentV2 } from './content';
import {
  selectBestCoopMilitaryAccessRouteV2,
  selectCoopMilitaryAccessRouteBetweenV2,
} from './coopAccess';
import {
  selectWarAccessTypeV2,
} from './selectors';
import { nationIdV2, type PlayerId, type TerritoryId } from './types';
import {
  coopRouteLogisticsTermsV2,
  declareWarV2,
  resolveBattlePulseV2,
  frontCapacitySupplyQuoteV2,
  supplyFactorV2,
  warDeclarationStatusV2,
} from './war';

const bel = nationIdV2('bel');
const nld = nationIdV2('nld');
const deu = nationIdV2('deu');
const fra = nationIdV2('fra');
const ids = [bel, nld, deu, fra] as const;

type EdgeSpec = readonly [PlayerId, PlayerId, 'land' | 'sea', number?];

function fixtureContent(edges: readonly EdgeSpec[]): WorldContentV2 {
  const connections = new Map<PlayerId, Array<{
    targetId: TerritoryId;
    kind: 'land' | 'sea';
    distanceKm?: number;
  }>>(ids.map((id) => [id, []]));
  for (const [left, right, kind, distanceKm] of edges) {
    connections.get(left)!.push({ targetId: right, kind, ...(distanceKm ? { distanceKm } : {}) });
    connections.get(right)!.push({ targetId: left, kind, ...(distanceKm ? { distanceKm } : {}) });
  }
  return {
    nationIds: ids,
    territoryIds: ids,
    nations: Object.fromEntries(ids.map((id) => [id, WORLD_CONTENT_V2.nations[id]!])),
    territories: Object.fromEntries(ids.map((id) => [id, {
      ...WORLD_CONTENT_V2.territories[id]!,
      id,
      initialOwnerId: id,
      connections: connections.get(id)!,
    }])),
  };
}

function coopState(content: WorldContentV2) {
  const state = createWorldStateV2(97_701, content);
  state.humanPlayerId = bel;
  state.humanPlayerIds = [bel, nld];
  return state;
}

describe('explicit co-op access and battlefield support', () => {
  it('blocks human-human war even though their authored border remains a team route', () => {
    const content = fixtureContent([
      [bel, nld, 'land'],
      [nld, deu, 'land'],
    ]);
    const state = coopState(content);

    expect(warDeclarationStatusV2(state, content, bel, nld)).toMatchObject({
      allowed: false,
      reason: 'Co-op teammates are permanently on the same side.',
    });
    expect(declareWarV2(state, content, bel, nld).accepted).toBe(false);
  });

  it('uses a teammate land corridor for legal access and supplied fronts, never neutral AI land', () => {
    const content = fixtureContent([
      [bel, nld, 'land'],
      [nld, deu, 'land'],
    ]);
    const state = coopState(content);
    const route = selectBestCoopMilitaryAccessRouteV2(state, content, bel, deu);

    expect(route).toMatchObject({
      sourceId: bel,
      targetId: deu,
      path: [bel, nld, deu],
      access: 'land',
      relayOwnerIds: [nld],
    });
    expect(selectWarAccessTypeV2(state, content, bel, deu)).toBe('land');
    expect(warDeclarationStatusV2(state, content, bel, deu).allowed).toBe(true);
    expect(supplyFactorV2(state, content, bel, bel, 'land', deu)).toBeGreaterThan(0.25);

    state.territories[nld]!.owner = fra;
    expect(selectBestCoopMilitaryAccessRouteV2(state, content, bel, deu)).toBeUndefined();
    expect(selectWarAccessTypeV2(state, content, bel, deu)).toBe('none');
  });

  it('keeps a friendly naval relay authored, range-bound, cheap and half-throughput', () => {
    const content = fixtureContent([
      [bel, nld, 'sea', 3_200],
      [nld, deu, 'land'],
    ]);
    const state = coopState(content);
    const route = selectCoopMilitaryAccessRouteBetweenV2(
      state,
      content,
      bel,
      deu,
      bel,
      deu,
    )!;
    const terms = coopRouteLogisticsTermsV2(state, content, bel, route);

    expect(route).toMatchObject({ access: 'naval', distanceKm: 3_200, seaHops: 1 });
    expect(route.path).toEqual([bel, nld, deu]);
    expect(terms.costPerMillion).toBeGreaterThan(0);
    expect(terms.throughputMultiplier).toBe(0.5);
    const sourceId = state.players[bel]!.capitalId;
    const navalQuote = frontCapacitySupplyQuoteV2(state, sourceId, 'naval');
    const landQuote = frontCapacitySupplyQuoteV2(state, sourceId, 'land');
    expect(navalQuote.readiness).toBe(landQuote.readiness);
    expect(navalQuote.capacityBudget).toBeCloseTo(landQuote.capacityBudget * 0.5, 9);

    const overRangeContent = fixtureContent([
      [bel, nld, 'sea', 13_000],
      [nld, deu, 'land'],
    ]);
    const overRangeState = coopState(overRangeContent);
    expect(selectBestCoopMilitaryAccessRouteV2(
      overRangeState, overRangeContent, bel, deu,
    )).toBeUndefined();
    expect(selectWarAccessTypeV2(overRangeState, overRangeContent, bel, deu)).toBe('none');
  });

  it('projects one bounded ally contingent, debits its real source, and cannot duplicate it', () => {
    const content = fixtureContent([
      [bel, nld, 'land'],
      [nld, deu, 'land'],
    ]);
    const state = coopState(content);
    state.territories[bel]!.army.manpower = 0.12;
    state.territories[nld]!.army.manpower = 0.10;
    state.territories[deu]!.army.manpower = 0.10;
    state.players[bel]!.treasury = 10;
    state.players[nld]!.treasury = 10;

    expect(declareWarV2(state, content, bel, deu).accepted).toBe(true);
    const war = state.wars[0]!;
    expect(war.attackerOperations).toHaveLength(1);
    expect(war.defenderOperations).toHaveLength(0);
    const operation = war.attackerOperations[0]!;
    const allyBefore = state.territories[nld]!.army.manpower;
    const used = new Set<TerritoryId>();
    const battle = resolveBattlePulseV2(state, content, war, operation, used)!;

    expect(battle.allyAttackerSupport).toMatchObject({
      contributorId: nld,
      sourceId: nld,
      access: 'land',
    });
    expect(battle.allyAttackerSupport!.power).toBeGreaterThan(0);
    expect(battle.allyAttackerSupport!.manpower).toBeLessThanOrEqual(allyBefore * 0.18 + 1e-9);
    expect(allyBefore - state.territories[nld]!.army.manpower)
      .toBeCloseTo(battle.allyAttackerSupport!.losses, 8);
    expect(battle.allyAttackerSupport!.supplySpent).toBeGreaterThan(0);
    expect(used.has(nld)).toBe(true);

    const next = resolveBattlePulseV2(state, content, war, operation, used)!;
    expect(next.allyAttackerSupport).toBeUndefined();
  });

  it('charges a supporting teammate for an authored naval relay without inventing another front', () => {
    const content = fixtureContent([
      [bel, deu, 'land'],
      [nld, bel, 'sea', 3_200],
    ]);
    const state = coopState(content);
    state.territories[bel]!.army.manpower = 0.12;
    state.territories[nld]!.army.manpower = 0.10;
    state.territories[deu]!.army.manpower = 0.10;
    state.players[nld]!.treasury = 10;
    state.players[nld]!.foodStock = 10;
    const treasuryBefore = state.players[nld]!.treasury;

    expect(declareWarV2(state, content, bel, deu)).toEqual({ accepted: true });
    const war = state.wars[0]!;
    const battle = resolveBattlePulseV2(
      state,
      content,
      war,
      war.attackerOperations[0]!,
    )!;

    expect(war.attackerOperations).toHaveLength(1);
    expect(battle.allyAttackerSupport).toMatchObject({
      contributorId: nld,
      sourceId: nld,
      access: 'naval',
      distanceKm: 3_200,
    });
    expect(battle.allyAttackerSupport!.logisticsCost).toBeGreaterThan(0);
    expect(treasuryBefore - state.players[nld]!.treasury)
      .toBeCloseTo(battle.allyAttackerSupport!.logisticsCost, 8);
    expect(battle.allyAttackerSupport!.manpower).toBeLessThan(0.10 * 0.18);
  });
});
