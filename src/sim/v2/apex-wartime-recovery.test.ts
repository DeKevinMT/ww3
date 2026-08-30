import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { synchronizeArmyCapacityV2 } from './capacity';
import { WORLD_CONTENT_V2 } from './content';
import {
  COMMANDER_PEACE_FIELD_TRANSFER_CAPACITY_SHARE_V2,
  applyCommanderCasualtiesV2,
  initializeCommanderForceV2,
  processCommanderForcesV2,
  selectCommanderEconomyProjectionV2,
} from './commanderForce';
import { beginTerritoryIntegrationV2 } from './integration';
import { assertInvariantsV2 } from './invariants';
import { createSaveV2, loadSaveV2 } from './persistence';
import {
  nationIdV2,
  territoryIdV2,
  type PlayerId,
  type WarStateV2,
  type WorldStateV2,
} from './types';

const belgium = nationIdV2('bel');
const netherlands = nationIdV2('nld');
const france = nationIdV2('fra');
const belgiumTerritory = territoryIdV2('bel');
const luxembourgTerritory = territoryIdV2('lux');
const netherlandsTerritory = territoryIdV2('nld');

function installDamagedApex(state: WorldStateV2): void {
  state.humanPlayerId = belgium;
  state.humanPlayerIds = [belgium];
  expect(initializeCommanderForceV2(state, WORLD_CONTENT_V2, belgium, {
    manpower: 0.001,
    capacity: 0.001,
    trainedReserves: 0,
    baseAttack: 125,
    baseDefense: 125,
    treasury: 0,
    annualOutput: 0,
    // Keep logistics full so this suite isolates personnel recovery.
    supplyStock: 1,
    capabilities: { fieldHospital: true },
  }).accepted).toBe(true);
  const force = state.commanderForces[belgium]!;
  force.army.manpower = 0.0002;
  force.army.trainedReserves = 0.0001;
  force.locationId = belgiumTerritory;
  force.mission = 'hq-training';
  force.front = null;
  force.transit = null;
  force.manualHoldUntilTick = state.tick + 10_000;
}

function activeWar(
  state: WorldStateV2,
  opponentId: PlayerId,
  id: string,
): WarStateV2 {
  return {
    id,
    attackerId: belgium,
    defenderId: opponentId,
    startedTick: state.tick,
    lastBattleTick: state.tick,
    warScore: 0,
    battles: 0,
    attackerLosses: 0,
    defenderLosses: 0,
    lastPeaceOfferTick: -1_000_000,
    attackerOperations: [],
    defenderOperations: [],
  };
}

function advanceCommander(state: WorldStateV2, weeks: number): void {
  for (let week = 0; week < weeks; week += 1) {
    state.tick += 1;
    processCommanderForcesV2(state, WORLD_CONTENT_V2);
  }
}

describe('APEX personnel recovery cadence', () => {
  it('freezes low-HP active manpower and reserves across every simultaneous war', () => {
    const state = createWorldStateV2(92_101, WORLD_CONTENT_V2);
    installDamagedApex(state);
    state.wars.push(
      activeWar(state, netherlands, 'war-apex-one'),
      activeWar(state, france, 'war-apex-two'),
    );
    const force = state.commanderForces[belgium]!;
    const openingManpower = force.army.manpower;
    const openingReserves = force.army.trainedReserves;

    expect(selectCommanderEconomyProjectionV2(state, belgium)?.trainedReserveGain)
      .toBe(0);
    advanceCommander(state, 24);

    expect(force.army.manpower).toBe(openingManpower);
    expect(force.army.trainedReserves).toBe(openingReserves);
    expect(force.mission).toBe('hq-training');

    // Field Hospital preserves a bounded share as wounded reserves; it is not
    // fresh recruitment and cannot return anyone to active duty during war.
    const hospitalReserveGain = Math.min(
      0.00005 * 0.10,
      force.army.capacity * 0.025,
    );
    expect(applyCommanderCasualtiesV2(state, belgium, 0.00005))
      .toBeCloseTo(0.00005 - hospitalReserveGain, 9);
    expect(force.army.manpower).toBeCloseTo(openingManpower - 0.00005, 9);
    expect(force.army.trainedReserves)
      .toBeCloseTo(openingReserves + hospitalReserveGain, 9);

    const damagedManpower = force.army.manpower;
    const preservedPool = force.army.trainedReserves;
    advanceCommander(state, 8);
    expect(force.army.manpower).toBe(damagedManpower);
    expect(force.army.trainedReserves).toBe(preservedPool);

    state.wars = [];
    advanceCommander(state, 1);
    expect(force.army.manpower).toBeGreaterThan(damagedManpower);
  });

  it('cannot bypass the lock by purging or rebuilding away from the capital', () => {
    const state = createWorldStateV2(92_102, WORLD_CONTENT_V2);
    installDamagedApex(state);
    beginTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      luxembourgTerritory,
      belgium,
      'land',
    );
    const force = state.commanderForces[belgium]!;
    force.locationId = luxembourgTerritory;
    force.mission = 'standby';
    force.manualHoldUntilTick = 0;
    state.wars.push(activeWar(state, france, 'war-during-purge'));
    const opening = { ...force.army };

    advanceCommander(state, 12);

    expect(force.locationId).toBe(luxembourgTerritory);
    expect(force.army.manpower).toBe(opening.manpower);
    expect(force.army.trainedReserves).toBe(opening.trainedReserves);
  });

  it('visibly restores the active dome every peaceful week, including purge duty', () => {
    const state = createWorldStateV2(92_103, WORLD_CONTENT_V2);
    installDamagedApex(state);
    beginTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      luxembourgTerritory,
      belgium,
      'land',
    );
    const force = state.commanderForces[belgium]!;
    force.locationId = luxembourgTerritory;
    force.mission = 'standby';
    force.manualHoldUntilTick = 0;
    force.army.trainedReserves = 0;
    const openingManpower = force.army.manpower;
    const expectedWeeklyActiveGain = force.army.capacity
      * COMMANDER_PEACE_FIELD_TRANSFER_CAPACITY_SHARE_V2;

    for (let week = 1; week <= 8; week += 1) {
      const before = force.army.manpower;
      advanceCommander(state, 1);
      expect(force.army.manpower - before)
        .toBeCloseTo(expectedWeeklyActiveGain, 9);
      expect(force.locationId).toBe(luxembourgTerritory);
    }

    expect(force.army.manpower - openingManpower)
      .toBeCloseTo(force.army.capacity * 0.10, 9);
    expect(force.army.trainedReserves).toBeGreaterThan(0);
  });

  it('preserves the lock through a damaged remote save, then resumes on peace', () => {
    const state = createWorldStateV2(92_104, WORLD_CONTENT_V2);
    installDamagedApex(state);
    beginTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      luxembourgTerritory,
      belgium,
      'land',
    );
    const force = state.commanderForces[belgium]!;
    force.locationId = luxembourgTerritory;
    force.mission = 'hq-training';
    state.wars.push(activeWar(state, france, 'war-saved-remote'));
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);

    const loaded = loadSaveV2(createSaveV2(state, WORLD_CONTENT_V2), WORLD_CONTENT_V2);
    expect(() => assertInvariantsV2(loaded, WORLD_CONTENT_V2)).not.toThrow();
    const loadedForce = loaded.commanderForces[belgium]!;
    const wartimeManpower = loadedForce.army.manpower;
    const wartimeReserves = loadedForce.army.trainedReserves;

    advanceCommander(loaded, 10);
    expect(loadedForce.locationId).toBe(luxembourgTerritory);
    expect(loadedForce.army.manpower).toBe(wartimeManpower);
    expect(loadedForce.army.trainedReserves).toBe(wartimeReserves);

    loaded.wars = [];
    advanceCommander(loaded, 1);
    expect(loadedForce.locationId).toBe(luxembourgTerritory);
    expect(loadedForce.army.manpower).toBeGreaterThan(wartimeManpower);
  });

  it('reaches exact zero, recovers only at its safe station during multiple wars, and releases at exactly full', () => {
    const state = createWorldStateV2(92_105, WORLD_CONTENT_V2);
    installDamagedApex(state);
    const force = state.commanderForces[belgium]!;
    force.capabilities.emergencyExtractionCharges = 1;
    state.wars.push(
      activeWar(state, netherlands, 'war-zero-extraction-one'),
      activeWar(state, france, 'war-zero-extraction-two'),
    );
    state.wars[0]!.attackerOperations = [{
      commanderId: belgium,
      sourceId: belgiumTerritory,
      targetId: netherlandsTerritory,
      doctrine: 'balanced',
      access: 'land',
      startedTick: state.tick,
      lastBattleTick: state.tick,
      holdUntilTick: state.tick + 12,
      momentum: 0,
    }];
    const reservesBefore = force.army.trainedReserves;

    expect(applyCommanderCasualtiesV2(state, belgium, 1))
      .toBeCloseTo(0.0002, 9);
    expect(force.army.manpower).toBe(0);
    expect(force.army.trainedReserves).toBeGreaterThan(reservesBefore);
    expect(force).toMatchObject({
      mission: 'hq-training',
      front: null,
      transit: null,
      capabilities: { emergencyExtractionCharges: 0 },
    });
    const recoveryStation = force.locationId;

    const preservedPool = force.army.trainedReserves;
    advanceCommander(state, 1);
    expect(force.locationId).toBe(recoveryStation);
    expect(force.army.manpower).toBeGreaterThan(0);
    expect(force.army.trainedReserves).toBeLessThan(preservedPool);
    expect(force.mission).toBe('hq-training');

    // The zero-recovery lifecycle and both active wars survive a reconnect.
    const loaded = loadSaveV2(createSaveV2(state, WORLD_CONTENT_V2), WORLD_CONTENT_V2);
    const loadedForce = loaded.commanderForces[belgium]!;
    expect(loaded.wars).toHaveLength(2);
    expect(loadedForce.locationId).toBe(recoveryStation);
    expect(loadedForce.mission).toBe('hq-training');

    // Even 99.9% remains unavailable. The final safe-station recovery tick
    // fills active strength exactly to capacity and releases APEX once.
    loadedForce.army.manpower = loadedForce.army.capacity * 0.999;
    loadedForce.army.trainedReserves = Math.max(
      loadedForce.army.trainedReserves,
      loadedForce.army.capacity * 0.01,
    );
    expect(loadedForce.mission).toBe('hq-training');
    expect(loadedForce.army.manpower / loadedForce.army.capacity)
      .toBeCloseTo(0.999, 9);
    advanceCommander(loaded, 1);
    expect(loadedForce.locationId).toBe(recoveryStation);
    expect(loadedForce.army.manpower).toBe(loadedForce.army.capacity);
    expect(loadedForce).toMatchObject({
      mission: 'assault-support',
      front: { warId: 'war-zero-extraction-one' },
    });
  });
});
