import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { WAR_MOBILIZATION_TICKS } from './balance';
import {
  COMMANDER_AUTONOMY_HYSTERESIS_TICKS_V2,
  initializeCommanderForceV2,
  processCommanderForcesV2,
  selectCommanderAutonomyStatusV2,
} from './commanderForce';
import { WORLD_CONTENT_V2 } from './content';
import {
  nationIdV2,
  territoryIdV2,
  type FrontOperationV2,
  type PlayerId,
  type TerritoryId,
  type WarStateV2,
} from './types';

function front(
  commanderId: PlayerId,
  sourceId: TerritoryId,
  targetId: TerritoryId,
  access: FrontOperationV2['access'] = 'land',
  startedTick = 0,
): FrontOperationV2 {
  return {
    commanderId,
    sourceId,
    targetId,
    doctrine: 'pressure',
    access,
    startedTick,
    lastBattleTick: 0,
    holdUntilTick: 0,
    momentum: 0,
  };
}

function war(
  id: string,
  attackerId: PlayerId,
  defenderId: PlayerId,
  operation: FrontOperationV2,
): WarStateV2 {
  return {
    id,
    attackerId,
    defenderId,
    startedTick: 0,
    lastBattleTick: 0,
    warScore: 0,
    battles: 0,
    attackerLosses: 0,
    defenderLosses: 0,
    attackerCivilianLosses: 0,
    defenderCivilianLosses: 0,
    lastPeaceOfferTick: -1_000_000,
    attackerOperations: [operation],
    defenderOperations: [],
    revenge: null,
  };
}

function apexBelgium(seed: number) {
  const state = createWorldStateV2(seed, WORLD_CONTENT_V2);
  const belgium = nationIdV2('bel');
  state.humanPlayerId = belgium;
  state.humanPlayerIds = [belgium];
  expect(initializeCommanderForceV2(state, WORLD_CONTENT_V2, belgium, {
    manpower: 0.00048,
    capacity: 0.0009,
    trainedReserves: 0.00008,
    baseAttack: 100,
    baseDefense: 108,
    treasury: 0,
    annualOutput: 0.015,
    supplyStock: 0.006,
  }).accepted).toBe(true);
  return { state, belgium };
}

describe('fully autonomous APEX front optimizer', () => {
  it('keeps all routine economy, logistics and recovery work remote at half strength', () => {
    const { state, belgium } = apexBelgium(83_007);
    const bel = territoryIdV2('bel');
    const lux = territoryIdV2('lux');
    state.territories[lux]!.owner = belgium;
    state.territories[lux]!.coreOwner = belgium;
    state.territories[lux]!.integration = 1;
    state.territories[lux]!.integrationProgram = null;
    const force = state.commanderForces[belgium]!;
    force.locationId = bel;
    force.mission = 'standby';
    force.front = null;
    force.transit = null;
    force.army.manpower = force.army.capacity * 0.50;
    force.army.trainedReserves = 0;
    const openingManpower = force.army.manpower;
    const openingReserves = force.army.trainedReserves;

    for (let week = 0; week < 40; week += 1) {
      state.tick += 1;
      processCommanderForcesV2(state, WORLD_CONTENT_V2);
      expect(force).toMatchObject({
        locationId: bel,
        mission: 'standby',
        front: null,
        transit: null,
      });
    }
    expect(force.army.manpower).toBeGreaterThan(openingManpower);
    expect(force.army.trainedReserves).toBeGreaterThan(openingReserves);

    // Old saves may still contain a physical logistics deployment. It is
    // cancelled rather than allowed to move the dome to its destination.
    force.mission = 'logistics-relief';
    force.transit = {
      path: [bel, lux], distanceKm: 100, departTick: state.tick, arriveTick: state.tick + 5,
    };
    state.tick += 1;
    processCommanderForcesV2(state, WORLD_CONTENT_V2);
    expect(force).toMatchObject({
      locationId: bel,
      mission: 'standby',
      front: null,
      transit: null,
    });
  });

  it('immediately joins a fresh reachable human assault despite ordinary hysteresis', () => {
    const { state, belgium } = apexBelgium(83_003);
    const netherlands = nationIdV2('nld');
    const france = nationIdV2('fra');
    const bel = territoryIdV2('bel');
    const nld = territoryIdV2('nld');
    const fra = territoryIdV2('fra');
    state.tick = 20;
    state.territories[bel]!.army.manpower = 0.30;
    state.territories[nld]!.army.manpower = 0.08;
    state.territories[fra]!.army.manpower = 0.01;
    const oldDefense = front(france, fra, bel);
    const freshAttack = front(belgium, bel, nld, 'land', state.tick);
    state.wars.push(
      war('war-old-defense', france, belgium, oldDefense),
      { ...war('war-new-assault', belgium, netherlands, freshAttack), startedTick: state.tick },
    );
    const force = state.commanderForces[belgium]!;
    force.mission = 'defense';
    force.front = { warId: 'war-old-defense', sourceId: fra, targetId: bel };
    force.manualHoldUntilTick = state.tick + 100;

    processCommanderForcesV2(state, WORLD_CONTENT_V2);

    expect(force).toMatchObject({
      mission: 'assault-support',
      front: { warId: 'war-new-assault', sourceId: bel, targetId: nld },
    });
    expect(selectCommanderAutonomyStatusV2(
      state, WORLD_CONTENT_V2, belgium,
    ).reason).toContain('new human assault');
  });

  it('treats a new player offensive as the next APEX assignment even during another crisis', () => {
    const { state, belgium } = apexBelgium(83_004);
    const netherlands = nationIdV2('nld');
    const france = nationIdV2('fra');
    const bel = territoryIdV2('bel');
    const nld = territoryIdV2('nld');
    const fra = territoryIdV2('fra');
    const lux = territoryIdV2('lux');
    state.tick = 30;
    state.territories[lux]!.owner = belgium;
    state.territories[lux]!.coreOwner = belgium;
    state.territories[lux]!.integration = 1;
    state.territories[bel]!.army.manpower = 0.10;
    state.territories[fra]!.army.manpower = 0.80;
    state.territories[nld]!.army.manpower = 0.01;
    const collapse = front(france, fra, bel);
    const freshAttack = front(belgium, bel, nld, 'land', state.tick);
    state.wars.push(
      war('war-collapse-priority', france, belgium, collapse),
      { ...war('war-new-but-secondary', belgium, netherlands, freshAttack), startedTick: state.tick },
    );
    state.commanderForces[belgium]!.locationId = lux;

    processCommanderForcesV2(state, WORLD_CONTENT_V2);

    expect(state.commanderForces[belgium]).toMatchObject({
      mission: 'assault-support',
      front: { warId: 'war-new-but-secondary', sourceId: bel, targetId: nld },
      transit: { path: [lux, bel] },
    });
  });

  it('does not leave damage recovery for a fresh assault', () => {
    const { state, belgium } = apexBelgium(83_005);
    const netherlands = nationIdV2('nld');
    const bel = territoryIdV2('bel');
    const nld = territoryIdV2('nld');
    state.tick = 40;
    const freshAttack = front(belgium, bel, nld, 'land', state.tick);
    state.wars.push({
      ...war('war-recovery-blocks', belgium, netherlands, freshAttack),
      startedTick: state.tick,
    });
    const force = state.commanderForces[belgium]!;
    force.mission = 'hq-training';
    force.front = null;
    force.army.manpower = force.army.capacity * 0.25;
    force.army.trainedReserves = 0;

    processCommanderForcesV2(state, WORLD_CONTENT_V2);

    expect(force).toMatchObject({ mission: 'hq-training', front: null, transit: null });
  });

  it('pre-positions APEX during mobilisation once pinned recovery is complete', () => {
    const { state, belgium } = apexBelgium(83_006);
    const netherlands = nationIdV2('nld');
    const bel = territoryIdV2('bel');
    const nld = territoryIdV2('nld');
    const lux = territoryIdV2('lux');
    state.tick = 40;
    state.territories[lux]!.owner = belgium;
    state.territories[lux]!.coreOwner = belgium;
    state.territories[lux]!.integration = 1;
    state.territories[bel]!.army.manpower = state.territories[bel]!.army.capacity * 0.05;
    state.territories[nld]!.army.manpower = state.territories[nld]!.army.capacity;
    const mobilisingDefense = front(netherlands, nld, bel, 'land', state.tick);
    const mobilisingWar = {
      ...war('war-mobilising-defense', netherlands, belgium, mobilisingDefense),
      startedTick: state.tick,
    };
    state.wars.push(mobilisingWar);
    const force = state.commanderForces[belgium]!;
    force.locationId = lux;
    force.mission = 'hq-training';
    force.front = null;
    force.transit = null;
    force.manualHoldUntilTick = state.tick;
    force.army.manpower = force.army.capacity * 0.70;
    force.army.trainedReserves = 0;
    force.economy.supplyStock = force.army.capacity * 10 * 0.60;
    const firstBattleTick = mobilisingWar.startedTick + WAR_MOBILIZATION_TICKS;

    processCommanderForcesV2(state, WORLD_CONTENT_V2);

    expect(mobilisingWar.battles).toBe(0);
    expect(force).toMatchObject({
      locationId: lux,
      mission: 'defense',
      front: { warId: mobilisingWar.id, sourceId: nld, targetId: bel },
      transit: { path: [lux, bel], departTick: 40 },
    });
    expect(force.transit!.arriveTick).toBeGreaterThan(state.tick);
    expect(force.transit!.arriveTick).toBeLessThanOrEqual(firstBattleTick);

    while (force.transit && state.tick < firstBattleTick) {
      state.tick += 1;
      processCommanderForcesV2(state, WORLD_CONTENT_V2);
    }
    expect(force).toMatchObject({ locationId: bel, mission: 'defense', transit: null });
    expect(state.tick).toBeLessThanOrEqual(firstBattleTick);
  });

  it('holds a useful front through small score changes, then switches on its review cadence', () => {
    const { state, belgium } = apexBelgium(83_001);
    const netherlands = nationIdV2('nld');
    const france = nationIdV2('fra');
    const bel = territoryIdV2('bel');
    const nld = territoryIdV2('nld');
    const fra = territoryIdV2('fra');
    state.tick = 20;
    state.territories[bel]!.army.manpower = 1;
    state.territories[nld]!.army.manpower = 0.20;
    state.territories[fra]!.army.manpower = 0.70;
    const dutch = front(netherlands, nld, bel);
    const french = front(france, fra, bel);
    state.wars.push(
      war('war-hold-dutch', netherlands, belgium, dutch),
      war('war-better-french', france, belgium, french),
    );
    const force = state.commanderForces[belgium]!;
    force.mission = 'defense';
    force.front = { warId: 'war-hold-dutch', sourceId: nld, targetId: bel };
    force.manualHoldUntilTick = state.tick + COMMANDER_AUTONOMY_HYSTERESIS_TICKS_V2;

    processCommanderForcesV2(state, WORLD_CONTENT_V2);
    expect(force.front?.warId).toBe('war-hold-dutch');

    const holdUntil = force.manualHoldUntilTick;
    for (state.tick = holdUntil; state.tick <= holdUntil + 4; state.tick += 1) {
      processCommanderForcesV2(state, WORLD_CONTENT_V2);
      if (force.front?.warId === 'war-better-french') break;
    }
    expect(force.front?.warId).toBe('war-better-french');
    const nextReview = force.manualHoldUntilTick;
    state.territories[nld]!.army.manpower = 0.48;
    state.tick += 1;
    processCommanderForcesV2(state, WORLD_CONTENT_V2);
    expect(force.front?.warId).toBe('war-better-french');
    expect(force.manualHoldUntilTick).toBe(nextReview);
  });

  it('never crosses an enemy gap to reach a disconnected owned front', () => {
    const { state, belgium } = apexBelgium(83_002);
    const usa = territoryIdV2('usa');
    const canada = territoryIdV2('can');
    const usaNation = nationIdV2('usa');
    const canadaNation = nationIdV2('can');
    state.territories[usa]!.owner = belgium;
    state.territories[usa]!.coreOwner = belgium;
    state.territories[usa]!.integration = 1;
    state.tick = 50;
    const operation = front(belgium, usa, canada, 'land', state.tick);
    state.wars.push({
      ...war('war-disconnected-front', belgium, canadaNation, operation),
      startedTick: state.tick,
    });
    state.commanderForces[belgium]!.army.manpower
      = state.commanderForces[belgium]!.army.capacity;
    state.commanderForces[belgium]!.army.trainedReserves = 0;

    processCommanderForcesV2(state, WORLD_CONTENT_V2);

    expect(state.commanderForces[belgium]).toMatchObject({
      locationId: territoryIdV2('bel'),
      mission: 'standby',
      front: null,
      transit: null,
    });
    expect(selectCommanderAutonomyStatusV2(
      state, WORLD_CONTENT_V2, belgium,
    )).toMatchObject({
      state: 'monitoring',
      reason: expect.stringContaining('reachable through friendly territory'),
    });
    expect(state.players[usaNation]).toBeDefined();
  });
});
