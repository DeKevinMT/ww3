import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import {
  applyApexShieldDamageV2,
  initializeCommanderForceV2,
  processCommanderForcesV2,
  reconcileCommanderForcesV2,
  retreatApexForRecoveryV2,
  retreatApexFromCollapsedFrontV2,
  selectApexEmpireShieldNetworkV2,
  selectCommanderBattleSupportV2,
} from './commanderForce';
import { WORLD_CONTENT_V2 } from './content';
import { createSaveV2, loadSaveV2 } from './persistence';
import {
  nationIdV2,
  territoryIdV2,
  type FrontOperationV2,
  type PlayerId,
  type TerritoryId,
  type WarStateV2,
} from './types';

function operation(
  commanderId: PlayerId,
  sourceId: TerritoryId,
  targetId: TerritoryId,
): FrontOperationV2 {
  return {
    commanderId,
    sourceId,
    targetId,
    doctrine: 'pressure',
    access: 'land',
    startedTick: 1,
    lastBattleTick: 1,
    holdUntilTick: 0,
    momentum: 0,
  };
}

function war(
  humanId: PlayerId,
  activeOperation: FrontOperationV2,
): WarStateV2 {
  return {
    id: 'war-apex-integrity',
    attackerId: nationIdV2('nld'),
    defenderId: humanId,
    startedTick: 1,
    lastBattleTick: 1,
    warScore: 0,
    battles: 0,
    attackerLosses: 0,
    defenderLosses: 0,
    attackerCivilianLosses: 0,
    defenderCivilianLosses: 0,
    lastPeaceOfferTick: -1_000_000,
    attackerOperations: [activeOperation],
    defenderOperations: [],
    revenge: null,
  };
}

function threatenedBelgium(seed: number) {
  const state = createWorldStateV2(seed, WORLD_CONTENT_V2);
  const humanId = nationIdV2('bel');
  state.humanPlayerId = humanId;
  state.humanPlayerIds = [humanId];
  expect(initializeCommanderForceV2(state, WORLD_CONTENT_V2, humanId, {
    shield: {
      integrity: 1,
      maxIntegrity: 1,
      rechargeBuffer: 0,
      pulseAttack: 0.001,
    },
    attackMultiplier: 1.2,
    defenseMultiplier: 1.3,
    treasury: 0,
    annualOutput: 0,
    supplyStock: 0,
  }).accepted).toBe(true);
  state.tick = 1;
  const activeOperation = operation(
    nationIdV2('nld'), territoryIdV2('nld'), territoryIdV2('bel'),
  );
  const activeWar = war(humanId, activeOperation);
  state.wars = [activeWar];
  return { state, humanId, activeWar, activeOperation };
}

describe('EONSCAR shared-integrity recovery lifecycle', () => {
  it('retires all voluntary and route-based retreat behavior', () => {
    const { state, humanId } = threatenedBelgium(84_001);
    const before = structuredClone(state.commanderForces[humanId]);
    expect(retreatApexForRecoveryV2(
      state, WORLD_CONTENT_V2, humanId,
    )).toBe(false);
    expect(retreatApexFromCollapsedFrontV2(
      state, WORLD_CONTENT_V2, humanId,
    )).toBe(false);
    expect(state.commanderForces[humanId]).toEqual(before);
  });

  it('keeps a damaged non-zero network online and cannot outheal war damage', () => {
    const {
      state, humanId, activeWar, activeOperation,
    } = threatenedBelgium(84_002);
    const force = state.commanderForces[humanId]!;
    force.shield.integrity = 0.01;
    force.shield.rechargeBuffer = 0.9;
    const before = force.shield.integrity;

    processCommanderForcesV2(state, WORLD_CONTENT_V2);

    expect(force.shield.integrity).toBe(before);
    expect(force.mission).toBe('standby');
    expect(selectApexEmpireShieldNetworkV2(
      state, WORLD_CONTENT_V2, humanId,
    )).toMatchObject({ active: true, integrityPercent: 1 });
    expect(selectCommanderBattleSupportV2(
      state, activeWar, activeOperation, WORLD_CONTENT_V2,
    ).defender).not.toBeNull();
  });

  it('takes true zero, disappears everywhere, then returns only at full integrity', () => {
    const {
      state, humanId, activeWar, activeOperation,
    } = threatenedBelgium(84_003);
    const force = state.commanderForces[humanId]!;
    expect(applyApexShieldDamageV2(state, humanId, 2)).toBe(1);
    expect(force).toMatchObject({
      mission: 'hq-training', front: null, transit: null,
      shield: { integrity: 0 },
    });
    expect(selectCommanderBattleSupportV2(
      state, activeWar, activeOperation, WORLD_CONTENT_V2,
    ).defender).toBeNull();

    force.shield.integrity = 0.99;
    force.shield.rechargeBuffer = 0.01;
    processCommanderForcesV2(state, WORLD_CONTENT_V2);
    expect(force).toMatchObject({
      mission: 'standby', front: null, transit: null,
      shield: { integrity: 1 },
    });
    expect(selectCommanderBattleSupportV2(
      state, activeWar, activeOperation, WORLD_CONTENT_V2,
    ).defender).not.toBeNull();
  });

  it('normalizes authenticated location and transit fields to a compatibility anchor', () => {
    const { state, humanId } = threatenedBelgium(84_004);
    state.wars = [];
    const force = state.commanderForces[humanId]!;
    force.locationId = territoryIdV2('lux');
    force.transit = {
      path: [territoryIdV2('lux'), territoryIdV2('fra')],
      distanceKm: 900,
      departTick: 0,
      arriveTick: 5,
    };

    reconcileCommanderForcesV2(state, WORLD_CONTENT_V2);
    expect(force).toMatchObject({
      locationId: state.players[humanId]!.capitalId,
      mission: 'standby', front: null, transit: null,
    });
    const loaded = loadSaveV2(
      createSaveV2(state, WORLD_CONTENT_V2),
      WORLD_CONTENT_V2,
    );
    expect(loaded.commanderForces[humanId]).toMatchObject({
      locationId: loaded.players[humanId]!.capitalId,
      mission: 'standby', front: null, transit: null,
    });
  });

  it('becomes inert when no sovereign Empire territory remains', () => {
    const { state, humanId } = threatenedBelgium(84_005);
    for (const territory of Object.values(state.territories)) {
      if (territory.owner === humanId) territory.owner = nationIdV2('nld');
    }

    processCommanderForcesV2(state, WORLD_CONTENT_V2);

    expect(selectApexEmpireShieldNetworkV2(
      state, WORLD_CONTENT_V2, humanId,
    )).toMatchObject({ active: false, coverageTerritoryIds: [] });
  });
});
