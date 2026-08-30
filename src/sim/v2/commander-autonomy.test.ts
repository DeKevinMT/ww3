import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import {
  initializeCommanderForceV2,
  processCommanderForcesV2,
  selectApexEmpireShieldNetworkV2,
  selectCommanderAutonomyStatusV2,
  selectCommanderBattleSupportV2,
  selectCommanderFrontPrioritiesV2,
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
): FrontOperationV2 {
  return {
    commanderId,
    sourceId,
    targetId,
    doctrine: 'pressure',
    access: 'land',
    startedTick: 20,
    lastBattleTick: 20,
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
    startedTick: 20,
    lastBattleTick: 20,
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
    shield: {
      integrity: 0.0009,
      maxIntegrity: 0.0009,
      rechargeBuffer: 0,
      pulseAttack: 0.001,
    },
    attackMultiplier: 1.2,
    defenseMultiplier: 1.25,
    treasury: 0,
    annualOutput: 0.015,
    supplyStock: 0,
  }).accepted).toBe(true);
  state.tick = 20;
  return { state, belgium };
}

describe('autonomous distributed APEX network', () => {
  it('normalizes every retired movement command without relocating the network', () => {
    const { state, belgium } = apexBelgium(83_007);
    const force = state.commanderForces[belgium]!;
    force.locationId = territoryIdV2('fra');
    force.mission = 'logistics-relief';
    force.front = {
      warId: 'retired',
      sourceId: territoryIdV2('fra'),
      targetId: territoryIdV2('bel'),
    };
    force.transit = {
      path: [territoryIdV2('fra'), territoryIdV2('deu')],
      distanceKm: 5_000,
      departTick: 0,
      arriveTick: 500,
    };

    processCommanderForcesV2(state, WORLD_CONTENT_V2);

    expect(force).toMatchObject({
      locationId: state.players[belgium]!.capitalId,
      mission: 'standby',
      front: null,
      transit: null,
      orderSource: 'autonomous',
    });
  });

  it('supports simultaneous assault and defence without travel or hysteresis', () => {
    const { state, belgium } = apexBelgium(83_003);
    const belgiumTerritory = territoryIdV2('bel');
    const luxembourg = territoryIdV2('lux');
    const netherlands = territoryIdV2('nld');
    const france = territoryIdV2('fra');
    state.territories[luxembourg]!.owner = belgium;
    state.territories[luxembourg]!.coreOwner = belgium;
    state.territories[luxembourg]!.integration = 1;
    state.territories[luxembourg]!.integrationProgram = null;
    const assault = front(belgium, belgiumTerritory, netherlands);
    const defense = front(nationIdV2('fra'), france, luxembourg);
    const assaultWar = war(
      'war-a-assault', belgium, nationIdV2('nld'), assault,
    );
    const defenseWar = war(
      'war-b-defense', nationIdV2('fra'), belgium, defense,
    );
    state.wars = [assaultWar, defenseWar];

    processCommanderForcesV2(state, WORLD_CONTENT_V2);

    expect(state.commanderForces[belgium]).toMatchObject({
      mission: 'standby', front: null, transit: null,
    });
    expect(selectCommanderBattleSupportV2(
      state, assaultWar, assault, WORLD_CONTENT_V2,
    ).attacker).not.toBeNull();
    expect(selectCommanderBattleSupportV2(
      state, defenseWar, defense, WORLD_CONTENT_V2,
    ).defender).not.toBeNull();
    expect(selectApexEmpireShieldNetworkV2(
      state, WORLD_CONTENT_V2, belgium,
    )?.activeFrontCount).toBe(2);
    expect(selectCommanderFrontPrioritiesV2(
      state, WORLD_CONTENT_V2, belgium,
    )).toHaveLength(2);
  });

  it('is already active during mobilisation and reports the shared front', () => {
    const { state, belgium } = apexBelgium(83_006);
    const defense = front(
      nationIdV2('nld'), territoryIdV2('nld'), territoryIdV2('bel'),
    );
    const mobilisingWar = war(
      'war-mobilising-defense', nationIdV2('nld'), belgium, defense,
    );
    state.wars = [mobilisingWar];

    expect(selectCommanderAutonomyStatusV2(
      state, WORLD_CONTENT_V2, belgium,
    )).toMatchObject({
      state: 'supporting',
      etaWeeks: 0,
      destinationId: territoryIdV2('bel'),
      front: { warId: mobilisingWar.id },
    });
  });

  it('does not require a friendly route to protect an integrated enclave', () => {
    const { state, belgium } = apexBelgium(83_008);
    const usa = territoryIdV2('usa');
    const canada = territoryIdV2('can');
    state.territories[usa]!.owner = belgium;
    state.territories[usa]!.coreOwner = belgium;
    state.territories[usa]!.integration = 1;
    state.territories[usa]!.integrationProgram = null;
    const defense = front(nationIdV2('can'), canada, usa);
    const distantWar = war(
      'war-distant-defense', nationIdV2('can'), belgium, defense,
    );
    state.wars = [distantWar];

    expect(selectCommanderBattleSupportV2(
      state, distantWar, defense, WORLD_CONTENT_V2,
    ).defender).not.toBeNull();
    expect(selectCommanderAutonomyStatusV2(
      state, WORLD_CONTENT_V2, belgium,
    )).toMatchObject({ state: 'supporting', etaWeeks: 0 });
  });

  it('keeps the complete network offline while true-zero integrity recharges', () => {
    const { state, belgium } = apexBelgium(83_005);
    const force = state.commanderForces[belgium]!;
    force.mission = 'hq-training';
    force.shield.integrity = force.shield.maxIntegrity * 0.5;
    force.shield.rechargeBuffer = 0;

    processCommanderForcesV2(state, WORLD_CONTENT_V2);

    expect(force.mission).toBe('hq-training');
    expect(selectApexEmpireShieldNetworkV2(
      state, WORLD_CONTENT_V2, belgium,
    )?.active).toBe(false);
  });
});
