import { describe, expect, it } from 'vitest';
import {
  CONQUEST_CAPTURE_GUARD_TICKS,
  countryInteriorOperationMultiplierV2,
} from './balance';
import { createWorldStateV2 } from './bootstrap';
import {
  stateTerritoryArmySupportCeilingV2,
  synchronizeArmyCapacityV2,
} from './capacity';
import { WORLD_CONTENT_V2, type WorldContentV2 } from './content';
import { territoryIntegrationAnnualCostV2 } from './integration';
import { assertInvariantsV2 } from './invariants';
import {
  invalidateTerritoryIndexV2,
  selectNationalIqViewV2,
  selectTerritoriesOfV2,
} from './selectors';
import {
  nationIdV2,
  territoryIdV2,
  type FrontOperationV2,
  type TerritoryId,
  type WorldStateV2,
} from './types';
import {
  INTERNAL_NAVAL_TRANSFER_COST_PER_MILLION_PER_1K_KM_V2,
  INTERNAL_NAVAL_TRANSFER_WEEKLY_TREASURY_SHARE_MAX_V2,
  internalArmyTransferLogisticsTermsV2,
  internalNavalTransferWillingnessV2,
  logisticsThroughputShareV2,
  redistributeArmiesV2,
} from './war';

const bel = nationIdV2('bel');

function withTestConnectionsV2(
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

function twoTerritoryLogisticsFixtureV2(
  kind: 'land' | 'sea',
  distanceKm: number,
  treasury = 10_000,
): { state: WorldStateV2; content: WorldContentV2; sourceId: TerritoryId; targetId: TerritoryId } {
  const state = createWorldStateV2(4_450);
  state.wars = [];
  const targetId = state.players[bel]!.capitalId;
  const sourceId = territoryIdV2('nld');
  const edge = kind === 'sea'
    ? { kind, distanceKm, targetId }
    : { kind, targetId };
  const reverse = kind === 'sea'
    ? { kind, distanceKm, targetId: sourceId }
    : { kind, targetId: sourceId };
  const content = withTestConnectionsV2({
    [sourceId]: [edge],
    [targetId]: [reverse],
  });
  state.territories[sourceId]!.owner = bel;
  state.territories[sourceId]!.coreOwner = bel;
  state.territories[sourceId]!.integration = 1;
  delete state.territories[sourceId]!.integrationProgram;
  state.players[bel]!.openingArmyBonus = null;
  state.players[bel]!.treasury = treasury;
  invalidateTerritoryIndexV2(state);
  synchronizeArmyCapacityV2(state, content);
  state.territories[targetId]!.army.manpower = 0;
  state.territories[sourceId]!.army.manpower = stateTerritoryArmySupportCeilingV2(
    state,
    content,
    sourceId,
    bel,
  );
  return { state, content, sourceId, targetId };
}

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
    const firstWeek = redistributeArmiesV2(state, WORLD_CONTENT_V2)
      .filter((movement) => movement.playerId === bel);
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
    const legacyOvershoot = frontierSupportCeiling * 10;
    frontier.army.manpower = legacyOvershoot;
    const overshootEmpireManpower = selectTerritoriesOfV2(state, bel)
      .reduce((sum, territory) => sum + territory.army.manpower, 0);
    const normalizationMoves = redistributeArmiesV2(state, WORLD_CONTENT_V2)
      .filter((movement) => movement.playerId === bel);
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
    expect(redistributeArmiesV2(state, WORLD_CONTENT_V2)
      .filter((movement) => movement.playerId === bel)).toHaveLength(0);
    expect(frontier.army.manpower).toBe(legacyOvershoot);
    assertInvariantsV2(state, WORLD_CONTENT_V2);
  });

  it('moves less over longer sea hops, charges exact distance logistics, and leaves land unchanged', () => {
    const land = twoTerritoryLogisticsFixtureV2('land', 0);
    const short = twoTerritoryLogisticsFixtureV2('sea', 2_000);
    const long = twoTerritoryLogisticsFixtureV2('sea', 12_000);
    const manpowerBefore = (fixture: typeof land): number => (
      fixture.state.territories[fixture.sourceId]!.army.manpower
        + fixture.state.territories[fixture.targetId]!.army.manpower
    );
    const landTreasury = land.state.players[bel]!.treasury;
    const shortTreasury = short.state.players[bel]!.treasury;
    const longTreasury = long.state.players[bel]!.treasury;
    const landTotal = manpowerBefore(land);
    const shortTotal = manpowerBefore(short);
    const longTotal = manpowerBefore(long);

    const landMoves = redistributeArmiesV2(land.state, land.content)
      .filter((movement) => movement.playerId === bel);
    const shortMoves = redistributeArmiesV2(short.state, short.content)
      .filter((movement) => movement.playerId === bel);
    const longMoves = redistributeArmiesV2(long.state, long.content)
      .filter((movement) => movement.playerId === bel);
    const landMoved = landMoves.reduce((sum, move) => sum + move.manpower, 0);
    const shortMoved = shortMoves.reduce((sum, move) => sum + move.manpower, 0);
    const longMoved = longMoves.reduce((sum, move) => sum + move.manpower, 0);
    const shortCost = shortMoves.reduce((sum, move) => sum + move.logisticsCost, 0);
    const longCost = longMoves.reduce((sum, move) => sum + move.logisticsCost, 0);

    expect(landMoved).toBeGreaterThan(shortMoved);
    expect(shortMoved).toBeGreaterThan(longMoved);
    expect(shortCost).toBeGreaterThan(0);
    expect(longCost).toBeGreaterThan(shortCost);
    expect(short.state.players[bel]!.treasury).toBeCloseTo(shortTreasury - shortCost, 8);
    expect(long.state.players[bel]!.treasury).toBeCloseTo(longTreasury - longCost, 8);
    expect(land.state.players[bel]!.treasury).toBe(landTreasury);
    expect(landMoves.every((move) => move.access === 'land'
      && move.distanceKm === 0 && move.logisticsCost === 0)).toBe(true);
    for (const fixture of [land, short, long]) {
      expect(manpowerBefore(fixture)).toBeCloseTo(
        fixture === land ? landTotal : fixture === short ? shortTotal : longTotal,
        8,
      );
    }
    const quote = internalArmyTransferLogisticsTermsV2(
      long.state,
      long.content,
      bel,
      long.sourceId,
      long.targetId,
      0.25,
    );
    expect(quote.access).toBe('naval');
    expect(quote.distanceKm).toBe(12_000);
    expect(quote.logisticsCost).toBeCloseTo(quote.costPerMillion * 0.25, 9);
  });

  it('skips nonurgent long-ocean balancing when cash-poor but funds rich or threatened transfers', () => {
    expect(INTERNAL_NAVAL_TRANSFER_COST_PER_MILLION_PER_1K_KM_V2).toBe(0.005);
    expect(INTERNAL_NAVAL_TRANSFER_WEEKLY_TREASURY_SHARE_MAX_V2).toBe(0.03);
    expect(internalNavalTransferWillingnessV2(12_000, 0, false)).toBe(0);
    expect(internalNavalTransferWillingnessV2(12_000, 0, false, true)).toBe(0.35);
    expect(internalNavalTransferWillingnessV2(12_000, 0, true)).toBe(0.75);
    const poor = twoTerritoryLogisticsFixtureV2('sea', 12_000, 0.10);
    const rich = twoTerritoryLogisticsFixtureV2('sea', 12_000, 10_000);
    expect(redistributeArmiesV2(poor.state, poor.content)
      .filter((movement) => movement.playerId === bel)).toHaveLength(0);
    expect(redistributeArmiesV2(rich.state, rich.content)
      .some((move) => move.playerId === bel && move.manpower > 0 && move.logisticsCost > 0)).toBe(true);

    const urgent = twoTerritoryLogisticsFixtureV2('sea', 12_000, 0.10);
    const enemyId = nationIdV2('fra');
    urgent.state.wars = [{
      id: 'urgent-ocean-logistics',
      attackerId: enemyId,
      defenderId: bel,
      startedTick: 0,
      lastBattleTick: 0,
      warScore: 0,
      battles: 0,
      attackerLosses: 0,
      defenderLosses: 0,
      lastPeaceOfferTick: -1,
      attackerOperations: [{
        commanderId: enemyId,
        sourceId: territoryIdV2('fra'),
        targetId: urgent.targetId,
        doctrine: 'pressure',
        access: 'naval',
        startedTick: 0,
        lastBattleTick: 0,
        holdUntilTick: 12,
        momentum: 0,
      }],
      defenderOperations: [],
    }];
    const urgentTreasury = urgent.state.players[bel]!.treasury;
    const urgentMoves = redistributeArmiesV2(urgent.state, urgent.content)
      .filter((movement) => movement.playerId === bel);
    const urgentCost = urgentMoves.reduce((sum, move) => sum + move.logisticsCost, 0);
    expect(urgentMoves.some((move) => move.manpower > 0)).toBe(true);
    expect(urgentCost).toBeGreaterThan(0);
    expect(urgentCost).toBeLessThanOrEqual(
      urgentTreasury * INTERNAL_NAVAL_TRANSFER_WEEKLY_TREASURY_SHARE_MAX_V2 + 1e-9,
    );
    expect(urgent.state.players[bel]!.treasury).toBeGreaterThanOrEqual(0);
    expect(urgent.state.players[bel]!.treasury).toBeCloseTo(urgentTreasury - urgentCost, 8);
  });

  it('prioritizes a concrete naval operation over an unrelated hostile-connected coast', () => {
    const state = createWorldStateV2(4_453);
    state.wars = [];
    state.players[bel]!.treasury = 10_000;
    state.players[bel]!.openingArmyBonus = null;
    const capitalId = state.players[bel]!.capitalId;
    const operationSourceId = territoryIdV2('nld');
    const unrelatedCoastId = territoryIdV2('deu');
    const enemyTerritoryId = territoryIdV2('fra');
    const enemyId = state.territories[enemyTerritoryId]!.owner;
    const content = withTestConnectionsV2({
      [capitalId]: [
        { targetId: operationSourceId, kind: 'land' },
        { targetId: unrelatedCoastId, kind: 'land' },
      ],
      [operationSourceId]: [
        { targetId: capitalId, kind: 'land' },
        { targetId: enemyTerritoryId, kind: 'sea', distanceKm: 12_000 },
      ],
      [unrelatedCoastId]: [
        { targetId: capitalId, kind: 'land' },
        { targetId: enemyTerritoryId, kind: 'sea', distanceKm: 2_000 },
      ],
      [enemyTerritoryId]: [
        { targetId: operationSourceId, kind: 'sea', distanceKm: 12_000 },
        { targetId: unrelatedCoastId, kind: 'sea', distanceKm: 2_000 },
      ],
    });
    for (const id of [operationSourceId, unrelatedCoastId]) {
      state.territories[id]!.owner = bel;
      state.territories[id]!.coreOwner = bel;
      state.territories[id]!.integration = 1;
      delete state.territories[id]!.integrationProgram;
    }
    invalidateTerritoryIndexV2(state);
    synchronizeArmyCapacityV2(state, content);
    state.territories[capitalId]!.army.manpower = stateTerritoryArmySupportCeilingV2(
      state,
      content,
      capitalId,
      bel,
    );
    state.territories[operationSourceId]!.army.manpower = 0;
    state.territories[unrelatedCoastId]!.army.manpower = 0;
    const operation: FrontOperationV2 = {
      commanderId: bel,
      sourceId: operationSourceId,
      targetId: enemyTerritoryId,
      doctrine: 'pressure',
      access: 'naval',
      startedTick: 0,
      lastBattleTick: 0,
      holdUntilTick: 12,
      momentum: 0,
    };
    state.wars = [{
      id: 'operation-route-priority',
      attackerId: bel,
      defenderId: enemyId,
      startedTick: 0,
      lastBattleTick: 0,
      warScore: 0,
      battles: 0,
      attackerLosses: 0,
      defenderLosses: 0,
      lastPeaceOfferTick: -1,
      attackerOperations: [operation],
      defenderOperations: [],
    }];

    for (let week = 0; week < 120; week += 1) redistributeArmiesV2(state, content);

    const operationSource = state.territories[operationSourceId]!.army;
    const unrelatedCoast = state.territories[unrelatedCoastId]!.army;
    expect(operationSource.manpower).toBeGreaterThan(unrelatedCoast.manpower);
    expect(unrelatedCoast.manpower).toBeLessThanOrEqual(unrelatedCoast.capacity * 0.05 + 1e-9);
  });

  it('prefers the closest land donor over an equally supplied naval donor', () => {
    const state = createWorldStateV2(4_451);
    state.wars = [];
    state.players[bel]!.treasury = 10_000;
    state.players[bel]!.openingArmyBonus = null;
    const targetId = state.players[bel]!.capitalId;
    const landDonorId = territoryIdV2('nld');
    const navalDonorId = territoryIdV2('deu');
    const content = withTestConnectionsV2({
      [targetId]: [
        { targetId: landDonorId, kind: 'land' },
        { targetId: navalDonorId, kind: 'sea', distanceKm: 2_000 },
      ],
      [landDonorId]: [{ targetId, kind: 'land' }],
      [navalDonorId]: [{ targetId, kind: 'sea', distanceKm: 2_000 }],
    });
    for (const donorId of [landDonorId, navalDonorId]) {
      state.territories[donorId]!.owner = bel;
      state.territories[donorId]!.coreOwner = bel;
      state.territories[donorId]!.integration = 1;
      delete state.territories[donorId]!.integrationProgram;
    }
    invalidateTerritoryIndexV2(state);
    synchronizeArmyCapacityV2(state, content);
    state.territories[targetId]!.army.manpower = 0;
    const equalDonorManpower = Math.min(
      stateTerritoryArmySupportCeilingV2(state, content, landDonorId, bel),
      stateTerritoryArmySupportCeilingV2(state, content, navalDonorId, bel),
    );
    state.territories[landDonorId]!.army.manpower = equalDonorManpower;
    state.territories[navalDonorId]!.army.manpower = equalDonorManpower;

    const movements = redistributeArmiesV2(state, content)
      .filter((movement) => movement.playerId === bel);
    expect(movements.length).toBeGreaterThan(0);
    expect(movements[0]!.sourceId).toBe(landDonorId);
    expect(movements[0]!.targetId).toBe(targetId);
    expect(movements[0]!.access).toBe('land');
  });

  it('makes continental Russia materially slower and costlier to traverse than Luxembourg', () => {
    const targetId = territoryIdV2('bel');
    const quoteLandInterior = (playerCode: 'rus' | 'lux') => {
      const playerId = nationIdV2(playerCode);
      const sourceId = territoryIdV2(playerCode);
      const state = createWorldStateV2(4_452);
      state.territories[targetId]!.owner = playerId;
      state.territories[targetId]!.coreOwner = playerId;
      state.territories[targetId]!.integration = 1;
      delete state.territories[targetId]!.integrationProgram;
      const content = withTestConnectionsV2({
        [sourceId]: [{ targetId, kind: 'land' }],
        [targetId]: [{ targetId: sourceId, kind: 'land' }],
      });
      return internalArmyTransferLogisticsTermsV2(
        state,
        content,
        playerId,
        sourceId,
        targetId,
        0.1,
      );
    };
    const luxembourg = quoteLandInterior('lux');
    const russia = quoteLandInterior('rus');
    const luxembourgArea = WORLD_CONTENT_V2.nations[nationIdV2('lux')]!.real.landArea;
    const russiaArea = WORLD_CONTENT_V2.nations[nationIdV2('rus')]!.real.landArea;

    expect(russia.interiorDistanceKm).toBeGreaterThan(luxembourg.interiorDistanceKm * 20);
    expect(russia.interiorOperationMultiplier).toBe(
      countryInteriorOperationMultiplierV2(russiaArea),
    );
    expect(luxembourg.interiorOperationMultiplier).toBe(
      countryInteriorOperationMultiplierV2(luxembourgArea),
    );
    expect(russia.interiorOperationMultiplier).toBeGreaterThan(
      luxembourg.interiorOperationMultiplier,
    );
    expect(russia.throughputMultiplier).toBeLessThan(luxembourg.throughputMultiplier);
    expect(russia.logisticsCost).toBe(0);
    expect(luxembourg.logisticsCost).toBe(0);
  });

  it('pre-supplies an AI outer border more strongly at extreme Suspicion', () => {
    const low = twoTerritoryLogisticsFixtureV2('land', 0);
    const frontierId = low.sourceId;
    const capitalId = low.targetId;
    const enemyId = territoryIdV2('deu');
    const content = withTestConnectionsV2({
      [capitalId]: [{ targetId: frontierId, kind: 'land' }],
      [frontierId]: [
        { targetId: capitalId, kind: 'land' },
        { targetId: enemyId, kind: 'land' },
      ],
      [enemyId]: [{ targetId: frontierId, kind: 'land' }],
    });
    const high = structuredClone(low.state);
    for (const state of [low.state, high]) {
      state.humanPlayerId = nationIdV2('usa');
      state.humanPlayerIds = [nationIdV2('usa')];
      // Keep the reserve pool deliberately below both territories' combined
      // peacetime targets. A fully staffed capital eventually fills the same
      // hard support ceiling in both worlds and hides the priority difference.
      state.territories[capitalId]!.army.manpower = 0.20 * (
        state.territories[capitalId]!.army.capacity
          + state.territories[frontierId]!.army.capacity
      );
      state.territories[frontierId]!.army.manpower = 0;
    }
    low.state.aiEscalation.globalThreat = 0;
    high.aiEscalation.globalThreat = 100;

    for (let week = 0; week < 24; week += 1) {
      redistributeArmiesV2(low.state, content);
      redistributeArmiesV2(high, content);
    }

    expect(high.territories[frontierId]!.army.manpower)
      .toBeGreaterThan(low.state.territories[frontierId]!.army.manpower);
    expect(high.territories[frontierId]!.army.manpower)
      .toBeLessThanOrEqual(stateTerritoryArmySupportCeilingV2(
        high, content, frontierId, bel,
      ) + 1e-9);
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
    state.players[bel]!.openingArmyBonus = null;
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
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const guardedMoves = redistributeArmiesV2(state, WORLD_CONTENT_V2)
      .filter((movement) => movement.playerId === bel);
    expect(guardedMoves.some((move) => move.sourceId === relayId)).toBe(false);
    expect(relay.army.manpower).toBe(guardedManpower);

    state.tick = startedTick + CONQUEST_CAPTURE_GUARD_TICKS;
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const releasedMoves = redistributeArmiesV2(state, WORLD_CONTENT_V2)
      .filter((movement) => movement.playerId === bel);
    expect(releasedMoves.some((move) => move.sourceId === relayId && move.manpower > 0)).toBe(true);
    expect(relay.army.manpower).toBeLessThan(guardedManpower);
    expect(selectTerritoriesOfV2(state, bel).reduce((sum, territory) => sum + territory.army.manpower, 0))
      .toBeCloseTo(empireManpower, 8);
    assertInvariantsV2(state, WORLD_CONTENT_V2);
  });
});
