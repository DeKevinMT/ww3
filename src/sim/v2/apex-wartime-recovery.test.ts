import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { synchronizeArmyCapacityV2 } from './capacity';
import { WORLD_CONTENT_V2 } from './content';
import {
  COMMANDER_PEACE_FIELD_TRANSFER_CAPACITY_SHARE_V2,
  applyCommanderCasualtiesV2,
  initializeCommanderForceV2,
  processCommanderForcesV2,
  selectApexEmpireShieldNetworkV2,
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
    shield: {
      integrity: 0.001,
      maxIntegrity: 0.001,
      rechargeBuffer: 0,
      pulseAttack: 0.001,
      impactRecoveryShare: 0.10,
    },
    attackMultiplier: 1.25,
    defenseMultiplier: 1.25,
    treasury: 0,
    annualOutput: 0,
    // Keep logistics full so this suite isolates shield-Energy recovery.
    supplyStock: 1,
  }).accepted).toBe(true);
  const force = state.commanderForces[belgium]!;
  force.shield.integrity = 0.0002;
  force.shield.rechargeBuffer = 0.0001;
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
    attackerCivilianLosses: 0,
    defenderCivilianLosses: 0,
    lastPeaceOfferTick: -1_000_000,
    attackerOperations: [],
    defenderOperations: [],
    revenge: null,
  };
}

function advanceCommander(state: WorldStateV2, weeks: number): void {
  for (let week = 0; week < weeks; week += 1) {
    state.tick += 1;
    processCommanderForcesV2(state, WORLD_CONTENT_V2);
  }
}

describe('EONSCAR shield-Energy recovery cadence', () => {
  it('freezes low active Energy and Reserve Energy across every simultaneous war', () => {
    const state = createWorldStateV2(92_101, WORLD_CONTENT_V2);
    installDamagedApex(state);
    state.wars.push(
      activeWar(state, netherlands, 'war-apex-one'),
      activeWar(state, france, 'war-apex-two'),
    );
    const force = state.commanderForces[belgium]!;
    const openingEnergy = force.shield.integrity;
    const openingReserveEnergy = force.shield.rechargeBuffer;

    expect(selectCommanderEconomyProjectionV2(state, belgium)?.trainedReserveGain)
      .toBe(0);
    advanceCommander(state, 24);

    expect(force.shield.integrity).toBe(openingEnergy);
    expect(force.shield.rechargeBuffer).toBe(openingReserveEnergy);
    expect(force.mission).toBe('hq-training');

    // Impact Recovery banks a bounded share as offline Reserve Energy. It does
    // not reduce the live hit or restore the operational shield during war.
    const impactRecoveryGain = 0.00005 * 0.10;
    expect(applyCommanderCasualtiesV2(state, belgium, 0.00005))
      .toBeCloseTo(0.00005, 9);
    expect(force.shield.integrity).toBeCloseTo(openingEnergy - 0.00005, 9);
    expect(force.shield.rechargeBuffer)
      .toBeCloseTo(openingReserveEnergy + impactRecoveryGain, 9);

    const damagedEnergy = force.shield.integrity;
    const preservedPool = force.shield.rechargeBuffer;
    advanceCommander(state, 8);
    expect(force.shield.integrity).toBe(damagedEnergy);
    expect(force.shield.rechargeBuffer).toBe(preservedPool);

    state.wars = [];
    advanceCommander(state, 1);
    expect(force.shield.integrity).toBeGreaterThan(damagedEnergy);
  });

  it('cannot bypass the wartime recovery lock through a distributed purge', () => {
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
    const opening = { ...force.shield };

    advanceCommander(state, 12);

    expect(force.locationId).toBe(belgiumTerritory);
    expect(force.shield.integrity).toBe(opening.integrity);
    expect(force.shield.rechargeBuffer).toBe(opening.rechargeBuffer);
  });

  it('visibly restores the distributed dome every peaceful week, including purge duty', () => {
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
    force.shield.rechargeBuffer = 0;
    const openingEnergy = force.shield.integrity;
    const expectedWeeklyActiveGain = force.shield.maxIntegrity
      * COMMANDER_PEACE_FIELD_TRANSFER_CAPACITY_SHARE_V2;

    for (let week = 1; week <= 8; week += 1) {
      const before = force.shield.integrity;
      advanceCommander(state, 1);
      expect(force.shield.integrity - before)
        .toBeCloseTo(expectedWeeklyActiveGain, 9);
      expect(force.locationId).toBe(belgiumTerritory);
    }

    expect(force.shield.integrity - openingEnergy)
      .toBeCloseTo(force.shield.maxIntegrity * 0.10, 9);
    expect(force.shield.rechargeBuffer).toBeGreaterThan(0);
  });

  it('normalizes a damaged legacy remote save and resumes recovery on peace', () => {
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
    const wartimeEnergy = loadedForce.shield.integrity;
    const wartimeReserveEnergy = loadedForce.shield.rechargeBuffer;

    advanceCommander(loaded, 10);
    expect(loadedForce.locationId).toBe(belgiumTerritory);
    expect(loadedForce.shield.integrity).toBe(wartimeEnergy);
    expect(loadedForce.shield.rechargeBuffer).toBe(wartimeReserveEnergy);

    loaded.wars = [];
    advanceCommander(loaded, 1);
    expect(loadedForce.locationId).toBe(belgiumTerritory);
    expect(loadedForce.shield.integrity).toBeGreaterThan(wartimeEnergy);
  });

  it('reaches exact zero, recovers only at its safe station during multiple wars, and releases at exactly full', () => {
    const state = createWorldStateV2(92_105, WORLD_CONTENT_V2);
    installDamagedApex(state);
    const force = state.commanderForces[belgium]!;
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
    const reservesBefore = force.shield.rechargeBuffer;

    expect(applyCommanderCasualtiesV2(state, belgium, 1))
      .toBeCloseTo(0.0002, 9);
    expect(force.shield.integrity).toBe(0);
    expect(force.shield.rechargeBuffer).toBeGreaterThan(reservesBefore);
    expect(force).toMatchObject({
      mission: 'hq-training',
      front: null,
      transit: null,
    });
    const recoveryStation = force.locationId;

    const preservedPool = force.shield.rechargeBuffer;
    advanceCommander(state, 1);
    expect(force.locationId).toBe(recoveryStation);
    expect(force.shield.integrity).toBeGreaterThan(0);
    expect(force.shield.rechargeBuffer).toBeLessThan(preservedPool);
    expect(force.mission).toBe('hq-training');

    // The zero-recovery lifecycle and both active wars survive a reconnect.
    const loaded = loadSaveV2(createSaveV2(state, WORLD_CONTENT_V2), WORLD_CONTENT_V2);
    const loadedForce = loaded.commanderForces[belgium]!;
    expect(loaded.wars).toHaveLength(2);
    expect(loadedForce.locationId).toBe(recoveryStation);
    expect(loadedForce.mission).toBe('hq-training');

    // Even 99.9% remains unavailable. The final safe-station recovery tick
    // fills active strength exactly to capacity and releases APEX once.
    loadedForce.shield.integrity = loadedForce.shield.maxIntegrity * 0.999;
    loadedForce.shield.rechargeBuffer = Math.max(
      loadedForce.shield.rechargeBuffer,
      loadedForce.shield.maxIntegrity * 0.01,
    );
    expect(loadedForce.mission).toBe('hq-training');
    expect(loadedForce.shield.integrity / loadedForce.shield.maxIntegrity)
      .toBeCloseTo(0.999, 9);
    advanceCommander(loaded, 1);
    expect(loadedForce.locationId).toBe(recoveryStation);
    expect(loadedForce.shield.integrity).toBe(loadedForce.shield.maxIntegrity);
    expect(loadedForce).toMatchObject({ mission: 'standby', front: null });
    expect(selectApexEmpireShieldNetworkV2(
      loaded, WORLD_CONTENT_V2, belgium,
    )).toMatchObject({ active: true, activeFrontCount: 1 });
  });
});
