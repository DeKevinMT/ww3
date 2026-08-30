import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { synchronizeArmyCapacityV2 } from './capacity';
import {
  applyCommanderCasualtiesV2,
  initializeCommanderForceV2,
  processCommanderForcesV2,
  reconcileCommanderTerritorialAccessV2,
  retreatApexFromCollapsedFrontV2,
  retreatApexForRecoveryV2,
  selectCommanderBattleSupportV2,
} from './commanderForce';
import { WORLD_CONTENT_V2 } from './content';
import { retireAbsorbedNationV2 } from './integration';
import { assertInvariantsV2 } from './invariants';
import { createSaveV2, loadSaveV2 } from './persistence';
import {
  nationIdV2,
  territoryIdV2,
  type CommanderForceInitializationV2,
  type FrontOperationV2,
  type WarStateV2,
} from './types';

const apex: CommanderForceInitializationV2 = {
  manpower: 0.00048,
  capacity: 0.0009,
  trainedReserves: 0.00008,
  baseAttack: 100,
  baseDefense: 108,
  treasury: 4,
  annualOutput: 1,
  supplyStock: 0.006,
};

function threatenedBelgium(seed: number) {
  const state = createWorldStateV2(seed, WORLD_CONTENT_V2);
  const belgium = nationIdV2('bel');
  const netherlands = nationIdV2('nld');
  const bel = territoryIdV2('bel');
  const nld = territoryIdV2('nld');
  state.humanPlayerId = belgium;
  state.humanPlayerIds = [belgium];
  expect(initializeCommanderForceV2(state, WORLD_CONTENT_V2, belgium, apex).accepted).toBe(true);
  const operation: FrontOperationV2 = {
    commanderId: netherlands,
    sourceId: nld,
    targetId: bel,
    doctrine: 'breakthrough',
    access: 'land',
    startedTick: 0,
    lastBattleTick: 0,
    holdUntilTick: 0,
    momentum: 1,
  };
  const war: WarStateV2 = {
    id: 'war-collapse',
    attackerId: netherlands,
    defenderId: belgium,
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
  state.wars.push(war);
  return { state, belgium, bel, nld, war, operation };
}

describe('APEX critical front retreat', () => {
  it('normalizes a legacy order but keeps a healthy APEX shielding a collapsed national line', () => {
    const { state, belgium, bel, nld, war } = threatenedBelgium(81_001);
    const lux = territoryIdV2('lux');
    state.territories[lux]!.owner = belgium;
    state.territories[lux]!.coreOwner = belgium;
    state.territories[lux]!.integration = 1;
    state.territories[bel]!.army.manpower = 0.00001;
    state.territories[nld]!.army.manpower = state.territories[nld]!.army.capacity;
    Object.assign(state.commanderForces[belgium]!, {
      mission: 'defense',
      orderSource: 'manual',
      manualHoldUntilTick: 10_000,
      front: {
      warId: war.id, sourceId: nld, targetId: bel,
      },
    });

    processCommanderForcesV2(state, WORLD_CONTENT_V2);

    expect(state.commanderForces[belgium]).toMatchObject({
      mission: 'defense',
      orderSource: 'autonomous',
      front: { warId: war.id, sourceId: nld, targetId: bel },
      transit: null,
    });
    expect(selectCommanderBattleSupportV2(
      state, war, war.attackerOperations[0]!, WORLD_CONTENT_V2,
    ).defender)
      .toMatchObject({ playerId: belgium });
    expect(state.events.at(-1)?.message).not.toContain('APEX EMERGENCY RETREAT');
  });

  it('holds a safe supplied front instead of retreating', () => {
    const { state, belgium, bel, nld, war } = threatenedBelgium(81_002);
    state.territories[nld]!.army.manpower = 0.00001;
    Object.assign(state.commanderForces[belgium]!, {
      mission: 'defense',
      orderSource: 'autonomous',
      manualHoldUntilTick: 0,
      front: { warId: war.id, sourceId: nld, targetId: bel },
    });

    expect(retreatApexFromCollapsedFrontV2(state, WORLD_CONTENT_V2, belgium)).toBe(false);
    expect(state.commanderForces[belgium]).toMatchObject({ mission: 'defense', transit: null });
  });

  it('holds its assigned front at nine percent instead of voluntarily retreating', () => {
    const { state, belgium, bel, nld, war } = threatenedBelgium(81_004);
    const lux = territoryIdV2('lux');
    state.territories[lux]!.owner = belgium;
    state.territories[lux]!.coreOwner = belgium;
    state.territories[lux]!.integration = 1;
    retireAbsorbedNationV2(state, nationIdV2('lux'));
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    state.territories[nld]!.army.manpower = 0.00001;
    const force = state.commanderForces[belgium]!;
    force.mission = 'defense';
    force.front = { warId: war.id, sourceId: nld, targetId: bel };
    force.army.manpower = force.army.capacity * 0.09;

    expect(retreatApexForRecoveryV2(state, WORLD_CONTENT_V2, belgium)).toBe(false);
    expect(force).toMatchObject({
      locationId: bel,
      mission: 'defense',
      front: { warId: war.id, sourceId: nld, targetId: bel },
      transit: null,
    });
    expect(state.territories[bel]).not.toHaveProperty('condition');

    const loaded = loadSaveV2(createSaveV2(state, WORLD_CONTENT_V2), WORLD_CONTENT_V2);
    expect(loaded.commanderForces[belgium]).toEqual({
      ...force,
      empireSupport: { ...force.empireSupport, annualFoodOutput: 0 },
    });
  });

  it('holds its assigned front at low supply instead of voluntarily retreating', () => {
    const { state, belgium, bel, nld, war } = threatenedBelgium(81_006);
    const lux = territoryIdV2('lux');
    state.territories[lux]!.owner = belgium;
    state.territories[lux]!.coreOwner = belgium;
    state.territories[lux]!.integration = 1;
    retireAbsorbedNationV2(state, nationIdV2('lux'));
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    state.territories[nld]!.army.manpower = 0.00001;
    const force = state.commanderForces[belgium]!;
    force.mission = 'defense';
    force.front = { warId: war.id, sourceId: nld, targetId: bel };
    force.army.manpower = force.army.capacity * 0.80;
    force.economy.supplyStock = force.army.capacity * 10 * 0.05;

    expect(retreatApexForRecoveryV2(state, WORLD_CONTENT_V2, belgium)).toBe(false);
    expect(force).toMatchObject({
      locationId: bel,
      mission: 'defense',
      front: { warId: war.id, sourceId: nld, targetId: bel },
      transit: null,
    });
  });

  it('does not manufacture a recovery move without combat exhaustion', () => {
    const { state, belgium, bel } = threatenedBelgium(81_007);
    const force = state.commanderForces[belgium]!;
    force.army.manpower = force.army.capacity * 0.09;

    expect(retreatApexForRecoveryV2(state, WORLD_CONTENT_V2, belgium)).toBe(false);
    expect(force).toMatchObject({
      locationId: bel,
      mission: 'standby',
      transit: null,
      front: null,
    });
  });

  it('keeps exhaustion recovery pinned until 70% manpower and 60% supply', () => {
    const { state, belgium, bel, nld, war, operation } = threatenedBelgium(81_005);
    const force = state.commanderForces[belgium]!;
    force.locationId = bel;
    force.mission = 'hq-training';
    force.front = null;
    force.manualHoldUntilTick = 0;
    force.army.manpower = force.army.capacity * 0.29;
    force.army.trainedReserves = 0;
    force.economy.supplyStock = force.army.capacity * 10 * 0.50;
    state.territories[bel]!.army.manpower = state.territories[bel]!.army.capacity * 0.70;
    state.territories[nld]!.army.manpower = 0.2;

    processCommanderForcesV2(state, WORLD_CONTENT_V2);
    expect(force.mission).toBe('hq-training');
    expect(selectCommanderBattleSupportV2(
      state, war, operation, WORLD_CONTENT_V2,
    ).defender).toBeNull();

    force.army.manpower = force.army.capacity * 0.50;
    force.economy.supplyStock = force.army.capacity * 10 * 0.50;
    force.manualHoldUntilTick = state.tick;
    processCommanderForcesV2(state, WORLD_CONTENT_V2);
    expect(force.mission).toBe('hq-training');
    expect(selectCommanderBattleSupportV2(
      state, war, operation, WORLD_CONTENT_V2,
    ).defender).toBeNull();

    force.army.manpower = force.army.capacity * 0.70;
    force.economy.supplyStock = force.army.capacity * 10 * 0.60;
    force.manualHoldUntilTick = state.tick;
    processCommanderForcesV2(state, WORLD_CONTENT_V2);
    expect(force).toMatchObject({
      mission: 'defense',
      front: { warId: war.id, sourceId: nld, targetId: bel },
    });
  });

  it('does not leave pinned recovery early even for a threatened army', () => {
    const { state, belgium, bel, nld, war, operation } = threatenedBelgium(81_009);
    const force = state.commanderForces[belgium]!;
    force.locationId = bel;
    force.mission = 'hq-training';
    force.front = null;
    force.transit = null;
    force.manualHoldUntilTick = state.tick + 100;
    force.army.manpower = force.army.capacity * 0.50;
    force.army.trainedReserves = 0;
    force.economy.supplyStock = force.army.capacity * 10 * 0.40;
    state.territories[bel]!.army.manpower = state.territories[bel]!.army.capacity * 0.05;
    state.territories[nld]!.army.manpower = state.territories[nld]!.army.capacity;

    processCommanderForcesV2(state, WORLD_CONTENT_V2);

    expect(force).toMatchObject({
      locationId: bel,
      mission: 'hq-training',
      front: null,
      transit: null,
    });
    expect(selectCommanderBattleSupportV2(
      state, war, operation, WORLD_CONTENT_V2,
    ).defender).toBeNull();
  });

  it('holds at 50%, 10% and 1%, then extracts once at zero and pins recovery', () => {
    const { state, belgium, bel, nld, war } = threatenedBelgium(81_011);
    const lux = territoryIdV2('lux');
    const fra = territoryIdV2('fra');
    for (const territoryId of [lux, fra]) {
      state.territories[territoryId]!.owner = belgium;
      state.territories[territoryId]!.coreOwner = belgium;
      state.territories[territoryId]!.integration = 1;
    }
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const force = state.commanderForces[belgium]!;
    force.locationId = bel;
    force.mission = 'defense';
    force.front = { warId: war.id, sourceId: nld, targetId: bel };
    force.transit = null;
    force.capabilities.mobileHeadquarters = true;
    force.army.manpower = force.army.capacity * 0.50;
    force.army.trainedReserves = 0;
    force.economy.supplyStock = force.army.capacity * 10 * 0.60;

    for (const readiness of [0.50, 0.10, 0.01]) {
      force.army.manpower = force.army.capacity * readiness;
      for (let week = 0; week < 12; week += 1) {
        state.tick += 1;
        processCommanderForcesV2(state, WORLD_CONTENT_V2);
        expect(force).toMatchObject({
          locationId: bel,
          mission: 'defense',
          front: { warId: war.id, sourceId: nld, targetId: bel },
          transit: null,
        });
      }
    }

    const exhaustedManpower = force.army.manpower;
    expect(applyCommanderCasualtiesV2(
      state, belgium, exhaustedManpower,
    )).toBeCloseTo(exhaustedManpower, 9);
    expect(force).toMatchObject({
      locationId: bel,
      mission: 'hq-training',
      front: null,
      transit: null,
    });
    expect(state.events.filter((event) => (
      event.message.includes('APEX EXHAUSTED')
    ))).toHaveLength(1);
    const recoveryDestination = force.locationId;

    force.army.manpower = force.army.capacity * 0.50;
    force.army.trainedReserves = force.army.capacity * 0.40;
    force.economy.supplyStock = force.army.capacity * 10 * 0.59;
    force.manualHoldUntilTick = state.tick + 10;
    for (let week = 0; week < 9; week += 1) {
      state.tick += 1;
      processCommanderForcesV2(state, WORLD_CONTENT_V2);
      expect(force.locationId).toBe(recoveryDestination);
      expect(force.mission).toBe('hq-training');
      expect(force.transit).toBeNull();
    }
  });

  it('cannot outheal repeated live-front losses while its dome remains deployed', () => {
    const { state, belgium, bel, nld, war } = threatenedBelgium(81_010);
    const force = state.commanderForces[belgium]!;
    force.locationId = bel;
    force.mission = 'defense';
    force.front = { warId: war.id, sourceId: nld, targetId: bel };
    force.transit = null;
    force.army.manpower = force.army.capacity * 0.75;
    force.army.trainedReserves = force.army.capacity * 0.15;
    force.economy.supplyStock = force.army.capacity * 10 * 0.80;
    state.territories[nld]!.army.manpower = state.territories[nld]!.army.capacity * 0.50;
    const openingManpower = force.army.manpower;
    const openingReserves = force.army.trainedReserves;

    for (let pulse = 0; pulse < 4; pulse += 1) {
      const before = force.army.manpower;
      expect(applyCommanderCasualtiesV2(state, belgium, 0.00001)).toBeGreaterThan(0);
      state.tick += 1;
      processCommanderForcesV2(state, WORLD_CONTENT_V2);
      expect(force.army.manpower).toBeLessThan(before);
      expect(force.mission).toBe('defense');
    }

    expect(force.army.manpower).toBeCloseTo(openingManpower - 0.00004, 9);
    expect(force.army.trainedReserves).toBe(openingReserves);
  });

  it('preserves human APEX as inert at a safe enclave when no secured route survives', () => {
    const { state, belgium, bel } = threatenedBelgium(81_003);
    const usa = territoryIdV2('usa');
    state.territories[usa]!.owner = belgium;
    state.territories[usa]!.coreOwner = belgium;

    expect(retreatApexFromCollapsedFrontV2(state, WORLD_CONTENT_V2, belgium)).toBe(false);
    expect(state.commanderForces[belgium]!.transit).toBeNull();
    expect(state.commanderForces[belgium]!.locationId).toBe(bel);

    state.territories[bel]!.owner = nationIdV2('nld');
    expect(reconcileCommanderTerritorialAccessV2(
      state, WORLD_CONTENT_V2, belgium,
    )).toBe(true);
    expect(state.commanderForces[belgium]).toMatchObject({
      locationId: usa,
      mission: 'standby',
      front: null,
      transit: null,
    });
    expect(state.commanderForces[belgium]!.army.manpower).toBeGreaterThan(0);
    expect(state.territories[usa]!.owner).toBe(belgium);
  });

  it('visibly extracts from lost Greenland to a surviving African foothold and survives save/load', () => {
    const state = createWorldStateV2(81_008, WORLD_CONTENT_V2);
    const greenland = nationIdV2('grl');
    const guineaBissau = nationIdV2('gnb');
    const canada = nationIdV2('can');
    const grl = territoryIdV2('grl');
    const gnb = territoryIdV2('gnb');
    state.humanPlayerId = greenland;
    state.humanPlayerIds = [greenland];
    expect(initializeCommanderForceV2(state, WORLD_CONTENT_V2, greenland, {
      ...apex,
      capabilities: { emergencyExtractionCharges: 1 },
    }).accepted).toBe(true);

    state.territories[gnb]!.owner = greenland;
    state.territories[gnb]!.coreOwner = greenland;
    state.territories[gnb]!.integration = 1;
    state.players[greenland]!.capitalId = gnb;
    retireAbsorbedNationV2(state, guineaBissau);
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);

    state.territories[grl]!.owner = canada;
    state.territories[grl]!.coreOwner = canada;
    state.territories[grl]!.integration = 1;
    state.territories[grl]!.integrationProgram = null;
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const force = state.commanderForces[greenland]!;
    const supplyBefore = force.economy.supplyStock;

    expect(reconcileCommanderTerritorialAccessV2(
      state, WORLD_CONTENT_V2, greenland,
    )).toBe(true);
    expect(force).toMatchObject({
      locationId: grl,
      mission: 'evacuate',
      orderSource: 'autonomous',
      front: null,
      transit: { path: [grl, gnb], departTick: state.tick },
      capabilities: { emergencyExtractionCharges: 1 },
    });
    expect(force.transit!.arriveTick - force.transit!.departTick).toBeGreaterThanOrEqual(5);
    expect(force.economy.supplyStock).toBeLessThan(supplyBefore);
    expect(state.events.at(-1)?.message).toContain('APEX EMERGENCY EXTRACTION');

    const loaded = loadSaveV2(createSaveV2(state, WORLD_CONTENT_V2), WORLD_CONTENT_V2);
    const loadedForce = loaded.commanderForces[greenland]!;
    expect(loadedForce.transit).toEqual(force.transit);
    expect(loadedForce.locationId).toBe(grl);
    expect(loadedForce.capabilities.emergencyExtractionCharges).toBe(1);

    const arriveTick = loadedForce.transit!.arriveTick;
    while (loaded.tick < arriveTick) {
      loaded.tick += 1;
      processCommanderForcesV2(loaded, WORLD_CONTENT_V2);
    }
    expect(loaded.commanderForces[greenland]).toMatchObject({
      locationId: gnb,
      mission: 'hq-training',
      transit: null,
      capabilities: { emergencyExtractionCharges: 1 },
    });
    expect(() => createSaveV2(loaded, WORLD_CONTENT_V2)).not.toThrow();
  });

  it('loads and advances a damaged APEX recovering remotely without relocating it', () => {
    const { state, belgium, bel } = threatenedBelgium(81_012);
    const lux = territoryIdV2('lux');
    state.territories[lux]!.owner = belgium;
    state.territories[lux]!.coreOwner = belgium;
    state.territories[lux]!.integration = 1;
    const force = state.commanderForces[belgium]!;
    force.locationId = lux;
    force.mission = 'hq-training';
    force.front = null;
    force.transit = null;
    force.manualHoldUntilTick = state.tick + 100;
    force.army.manpower = force.army.capacity * 0.35;

    const loaded = loadSaveV2(createSaveV2(state, WORLD_CONTENT_V2), WORLD_CONTENT_V2);
    const loadedForce = loaded.commanderForces[belgium]!;
    expect(loadedForce.army.manpower).toBeCloseTo(force.army.manpower, 9);
    expect(loadedForce.locationId).toBe(lux);
    expect(() => assertInvariantsV2(loaded, WORLD_CONTENT_V2)).not.toThrow();

    loaded.tick += 1;
    expect(() => processCommanderForcesV2(loaded, WORLD_CONTENT_V2)).not.toThrow();
    expect(loadedForce.locationId).toBe(lux);
    expect(loadedForce.mission).toBe('hq-training');
    expect(loadedForce.transit).toBeNull();

    loaded.wars = [];
    loaded.players[belgium]!.capitalId = lux;
    Object.assign(loaded.territories[bel]!, {
      owner: nationIdV2('nld'),
      coreOwner: nationIdV2('nld'),
      integration: 1,
      integrationProgram: null,
    });
    const withoutCapital = loadSaveV2(
      createSaveV2(loaded, WORLD_CONTENT_V2),
      WORLD_CONTENT_V2,
    );
    expect(() => assertInvariantsV2(withoutCapital, WORLD_CONTENT_V2)).not.toThrow();
    withoutCapital.tick += 1;
    expect(() => processCommanderForcesV2(withoutCapital, WORLD_CONTENT_V2)).not.toThrow();
    expect(withoutCapital.commanderForces[belgium]).toMatchObject({
      locationId: lux,
      mission: 'hq-training',
      transit: null,
    });
  });
});
