import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import {
  APEX_NEXUS_ADDITIONAL_FRONT_BUDGET_V2,
  APEX_NEXUS_MAX_PROJECTION_BUDGET_V2,
  apexEmpireFrontAllocationShareV2,
  applyApexShieldDamageV2,
  initializeCommanderForceV2,
  processCommanderForcesV2,
  reconcileCommanderForcesV2,
  selectApexEmpireShieldNetworkV2,
  selectCommanderBattleSupportV2,
  selectCommanderForecastMobilityV2,
} from './commanderForce';
import { ROGUE_AI_NATION_ID_V2, WORLD_CONTENT_V2 } from './content';
import {
  selectApexSignalPurgeStatusesV2,
  territoryIntegrationDurationWeeksV2,
} from './integration';
import {
  canonicalStateHashV2,
  createSaveV2,
  loadSaveV2,
} from './persistence';
import {
  activateRoguePrimeV2,
  ROGUE_PRIME_CORE_TERRITORY_ID_V2,
} from './roguePrime';
import {
  nationIdV2,
  territoryIdV2,
  type CommanderCapabilitiesV2,
  type FrontOperationV2,
  type PlayerId,
  type TerritoryId,
  type WarStateV2,
  type WorldStateV2,
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
    startedTick: 10,
    lastBattleTick: 10,
    holdUntilTick: 0,
    momentum: 0,
  };
}

function war(
  id: string,
  attackerId: PlayerId,
  defenderId: PlayerId,
  activeOperation: FrontOperationV2,
): WarStateV2 {
  return {
    id,
    attackerId,
    defenderId,
    startedTick: 10,
    lastBattleTick: 10,
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

function empireAtTwoFronts(
  capabilities: Partial<CommanderCapabilitiesV2> = {},
): {
  state: WorldStateV2;
  humanId: PlayerId;
  assaultWar: WarStateV2;
  defenseWar: WarStateV2;
  assault: FrontOperationV2;
  defense: FrontOperationV2;
} {
  const state = createWorldStateV2(98_401, WORLD_CONTENT_V2);
  const humanId = nationIdV2('bel');
  const netherlandsId = nationIdV2('nld');
  const franceId = nationIdV2('fra');
  const belgium = territoryIdV2('bel');
  const luxembourg = territoryIdV2('lux');
  const netherlands = territoryIdV2('nld');
  const france = territoryIdV2('fra');
  state.humanPlayerId = humanId;
  state.humanPlayerIds = [humanId];
  state.territories[luxembourg]!.owner = humanId;
  state.territories[luxembourg]!.coreOwner = humanId;
  state.territories[luxembourg]!.integration = 1;
  state.territories[luxembourg]!.integrationProgram = null;
  expect(initializeCommanderForceV2(state, WORLD_CONTENT_V2, humanId, {
    shield: {
      integrity: 1,
      maxIntegrity: 1,
      rechargeBuffer: 0,
      rechargeMultiplier: 1,
      pulseAttack: 0.001,
    },
    attackMultiplier: 1.10,
    defenseMultiplier: 1.12,
    treasury: 0,
    annualOutput: 0,
    supplyStock: 0,
    capabilities,
  }).accepted).toBe(true);
  state.tick = 20;
  const assault = operation(humanId, belgium, netherlands);
  const defense = operation(franceId, france, luxembourg);
  const assaultWar = war('war-a-assault', humanId, netherlandsId, assault);
  const defenseWar = war('war-b-defense', franceId, humanId, defense);
  state.wars = [assaultWar, defenseWar];
  return { state, humanId, assaultWar, defenseWar, assault, defense };
}

describe('APEX distributed Empire Shield Network', () => {
  it('covers every owned territory and conserves one ATK/DEF pool across fronts', () => {
    const { state, humanId } = empireAtTwoFronts();
    const force = state.commanderForces[humanId]!;
    // Prove that authenticated location data cannot constrain the network.
    force.locationId = territoryIdV2('fra');
    force.transit = {
      path: [territoryIdV2('fra'), territoryIdV2('deu')],
      distanceKm: 999,
      departTick: 1,
      arriveTick: 999,
    };
    force.front = null;

    const network = selectApexEmpireShieldNetworkV2(
      state, WORLD_CONTENT_V2, humanId,
    )!;
    expect(network).toMatchObject({
      active: true,
      integrityCurrent: 1,
      integrityMax: 1,
      integrityPercent: 100,
      attackMultiplier: 1.10,
      defenseMultiplier: 1.12,
      activeFrontCount: 2,
    });
    expect(network.coverageTerritoryIds).toEqual([
      territoryIdV2('bel'), territoryIdV2('lux'),
    ]);
    expect(network.activeFrontTerritoryIds).toEqual([
      territoryIdV2('bel'), territoryIdV2('lux'),
    ]);
    expect(network.fronts.map((front) => [front.mission, front.allocationShare]))
      .toEqual([
        ['assault-support', 0.5],
        ['defense', 0.5],
      ]);
    expect(network.fronts.reduce(
      (total, front) => total + (network.attackMultiplier - 1) * front.allocationShare,
      0,
    )).toBeCloseTo(network.attackMultiplier - 1, 9);
    expect(network.fronts.reduce(
      (total, front) => total + (network.defenseMultiplier - 1) * front.allocationShare,
      0,
    )).toBeCloseTo(network.defenseMultiplier - 1, 9);
  });

  it('supports every live front from the same damageable integrity pool', () => {
    const {
      state, humanId, assaultWar, defenseWar, assault, defense,
    } = empireAtTwoFronts();
    const assaultSupport = selectCommanderBattleSupportV2(
      state, assaultWar, assault, WORLD_CONTENT_V2,
    );
    const defenseSupport = selectCommanderBattleSupportV2(
      state, defenseWar, defense, WORLD_CONTENT_V2,
    );
    expect(assaultSupport.attacker).toMatchObject({
      playerId: humanId,
      mission: 'assault-support',
      shieldIntegrity: 1,
      attackMultiplier: 1.05,
      defenseMultiplier: 1.06,
      projectionCombatShare: 0.5,
    });
    expect(defenseSupport.defender).toMatchObject({
      playerId: humanId,
      mission: 'defense',
      shieldIntegrity: 1,
      attackMultiplier: 1.05,
      defenseMultiplier: 1.06,
      projectionCombatShare: 0.5,
    });

    expect(applyApexShieldDamageV2(state, humanId, 0.25)).toBe(0.25);
    expect(selectCommanderBattleSupportV2(
      state, defenseWar, defense, WORLD_CONTENT_V2,
    ).defender?.shieldIntegrity).toBe(0.75);
    expect(selectApexEmpireShieldNetworkV2(
      state, WORLD_CONTENT_V2, humanId,
    )?.integrityPercent).toBe(75);
  });

  it('retains split Pulse through Front Projection and boosts Pulse only on defense', () => {
    const {
      state, humanId, assaultWar, defenseWar, assault, defense,
    } = empireAtTwoFronts();
    const force = state.commanderForces[humanId]!;

    const baselineAssault = selectCommanderBattleSupportV2(
      state, assaultWar, assault, WORLD_CONTENT_V2,
    ).attacker!;
    const baselineDefense = selectCommanderBattleSupportV2(
      state, defenseWar, defense, WORLD_CONTENT_V2,
    ).defender!;
    expect(baselineAssault.pulseAttack).toBeCloseTo(0.0005, 12);
    expect(baselineDefense.pulseAttack).toBeCloseTo(0.0005, 12);

    force.shield.pulseProjectionRetention = 0.35;
    force.shield.defensivePulseMultiplier = 1.50;
    const projectedAssault = selectCommanderBattleSupportV2(
      state, assaultWar, assault, WORLD_CONTENT_V2,
    ).attacker!;
    const projectedDefense = selectCommanderBattleSupportV2(
      state, defenseWar, defense, WORLD_CONTENT_V2,
    ).defender!;

    // A 50% split retains 35% of the lost half: 0.50 + 0.50 × 0.35 = 0.675.
    expect(projectedAssault.pulseAttack).toBeCloseTo(0.000675, 12);
    expect(projectedDefense.pulseAttack).toBeCloseTo(0.000675 * 1.5, 12);
    expect(projectedAssault.attackMultiplier).toBe(baselineAssault.attackMultiplier);
    expect(projectedDefense.attackMultiplier).toBe(baselineDefense.attackMultiplier);
    expect(projectedDefense.defenseMultiplier).toBe(baselineDefense.defenseMultiplier);
  });

  it('withholds combat protection from a conquered territory until Signal Purge reaches 100%', () => {
    const {
      state, humanId, assaultWar, defenseWar, assault, defense,
    } = empireAtTwoFronts();
    const luxembourg = territoryIdV2('lux');
    state.territories[luxembourg]!.integration = 0.5;
    state.territories[luxembourg]!.integrationProgram = {
      cause: 'conquest',
      fromOwnerId: nationIdV2('lux'),
      fromCoreOwnerId: nationIdV2('lux'),
      toOwnerId: humanId,
      startedTick: state.tick,
      completesTick: state.tick + 300,
      annualCost: 0,
    };

    const purging = selectApexEmpireShieldNetworkV2(
      state, WORLD_CONTENT_V2, humanId,
    )!;
    expect(purging.coverageTerritoryIds).toEqual([territoryIdV2('bel')]);
    expect(purging.fronts).toHaveLength(1);
    expect(purging.fronts[0]).toMatchObject({
      warId: assaultWar.id,
      friendlyTerritoryId: territoryIdV2('bel'),
    });
    expect(selectCommanderBattleSupportV2(
      state, assaultWar, assault, WORLD_CONTENT_V2,
    ).attacker).not.toBeNull();
    expect(selectCommanderBattleSupportV2(
      state, defenseWar, defense, WORLD_CONTENT_V2,
    ).defender).toBeNull();

    // Combat eligibility is the only gate: purge work itself retains its
    // supplied-front rate and canonical ETA.
    expect(selectApexSignalPurgeStatusesV2(
      state, WORLD_CONTENT_V2, humanId,
    )[0]).toMatchObject({
      territoryId: luxembourg,
      mode: 'front',
      projectedCompletesTick: state.tick
        + territoryIntegrationDurationWeeksV2(WORLD_CONTENT_V2, luxembourg),
    });

    state.territories[luxembourg]!.integration = 1;
    state.territories[luxembourg]!.integrationProgram = null;
    const liberated = selectApexEmpireShieldNetworkV2(
      state, WORLD_CONTENT_V2, humanId,
    )!;
    expect(liberated.coverageTerritoryIds).toContain(luxembourg);
    expect(selectCommanderBattleSupportV2(
      state, defenseWar, defense, WORLD_CONTENT_V2,
    ).defender).not.toBeNull();
  });

  it('allocates Theater Mesh at 100%, 60%, 46.7% and 35% per front', () => {
    expect(APEX_NEXUS_ADDITIONAL_FRONT_BUDGET_V2).toBe(0.20);
    expect(APEX_NEXUS_MAX_PROJECTION_BUDGET_V2).toBe(1.4);
    expect([1, 2, 3, 4].map((frontCount) => (
      apexEmpireFrontAllocationShareV2(frontCount, true)
    ))).toEqual([1, 0.6, 0.4666666666666666, 0.35]);
    expect([1, 2, 3, 4].map((frontCount) => (
      apexEmpireFrontAllocationShareV2(frontCount, false)
    ))).toEqual([1, 0.5, 1 / 3, 0.25]);
  });

  it('makes Theater Mesh a bounded grid-efficiency protocol instead of cloning a dome', () => {
    const { state, humanId } = empireAtTwoFronts({ forceMultiplier: true });
    const network = selectApexEmpireShieldNetworkV2(
      state, WORLD_CONTENT_V2, humanId,
    )!;
    expect(network.fronts.map((front) => front.allocationShare)).toEqual([0.6, 0.6]);
    expect(network.fronts.reduce(
      (total, front) => total + (network.attackMultiplier - 1) * front.allocationShare,
      0,
    )).toBeCloseTo((network.attackMultiplier - 1) * 1.2, 9);
    expect(state.commanderForces[humanId]!.doctrineRuntime?.secondaryProjection)
      .toBeNull();
  });

  it('forecasts instant projection and normalizes location-bound legacy saves', () => {
    const { state, humanId } = empireAtTwoFronts();
    const force = state.commanderForces[humanId]!;
    force.locationId = territoryIdV2('fra');
    force.mission = 'defense';
    force.front = {
      warId: 'retired-front',
      sourceId: territoryIdV2('fra'),
      targetId: territoryIdV2('bel'),
    };
    force.transit = {
      path: [territoryIdV2('fra'), territoryIdV2('deu')],
      distanceKm: 10_000,
      departTick: state.tick,
      arriveTick: state.tick + 500,
    };

    const forecast = selectCommanderForecastMobilityV2(
      state, WORLD_CONTENT_V2, humanId, territoryIdV2('bel'),
    );
    expect(forecast).toMatchObject({ status: 'ready', etaWeeks: 0 });

    reconcileCommanderForcesV2(state, WORLD_CONTENT_V2);
    const legacySave = structuredClone(createSaveV2(state, WORLD_CONTENT_V2));
    const serializedForce = legacySave.commanderForces[humanId]!;
    serializedForce.locationId = territoryIdV2('fra');
    serializedForce.mission = 'defense';
    serializedForce.front = {
      warId: 'retired-front',
      sourceId: territoryIdV2('fra'),
      targetId: territoryIdV2('bel'),
    };
    serializedForce.transit = {
      path: [territoryIdV2('fra'), territoryIdV2('deu')],
      distanceKm: 10_000,
      departTick: state.tick,
      arriveTick: state.tick + 500,
    };
    legacySave.canonicalStateHash = canonicalStateHashV2(legacySave);
    const loaded = loadSaveV2(legacySave, WORLD_CONTENT_V2);
    reconcileCommanderForcesV2(loaded, WORLD_CONTENT_V2);
    const loadedForce = loaded.commanderForces[humanId]!;
    expect(loadedForce.locationId).toBe(loaded.players[humanId]!.capitalId);
    expect(loadedForce.transit).toBeNull();
    expect(loadedForce.front).toBeNull();
    expect(loadedForce.mission).toBe('standby');
    expect(selectApexEmpireShieldNetworkV2(
      loaded, WORLD_CONTENT_V2, humanId,
    )?.activeFrontCount).toBe(2);
  });

  it('drops every projection at zero and only returns the network when fully recharged', () => {
    const {
      state, humanId, assaultWar, defenseWar, assault, defense,
    } = empireAtTwoFronts();
    expect(applyApexShieldDamageV2(state, humanId, 99)).toBe(1);
    expect(selectApexEmpireShieldNetworkV2(
      state, WORLD_CONTENT_V2, humanId,
    )).toMatchObject({ active: false, integrityPercent: 0 });
    expect(selectCommanderBattleSupportV2(
      state, assaultWar, assault, WORLD_CONTENT_V2,
    ).attacker).toBeNull();
    expect(selectCommanderBattleSupportV2(
      state, defenseWar, defense, WORLD_CONTENT_V2,
    ).defender).toBeNull();

    const force = state.commanderForces[humanId]!;
    force.shield.integrity = 0.99;
    force.shield.rechargeBuffer = 0.01;
    processCommanderForcesV2(state, WORLD_CONTENT_V2);
    expect(force.shield.integrity).toBe(1);
    expect(selectApexEmpireShieldNetworkV2(
      state, WORLD_CONTENT_V2, humanId,
    )).toMatchObject({ active: true, integrityPercent: 100 });
  });

  it('prioritizes Signal Purge through the network without physical travel', () => {
    const { state, humanId } = empireAtTwoFronts();
    const luxembourg = territoryIdV2('lux');
    state.wars = [];
    state.territories[luxembourg]!.integration = 0.25;
    state.territories[luxembourg]!.integrationProgram = {
      cause: 'conquest',
      fromOwnerId: nationIdV2('lux'),
      fromCoreOwnerId: nationIdV2('lux'),
      toOwnerId: humanId,
      startedTick: state.tick,
      completesTick: state.tick + 300,
      annualCost: 0,
    };
    const force = state.commanderForces[humanId]!;
    force.locationId = territoryIdV2('fra');
    force.transit = {
      path: [territoryIdV2('fra'), territoryIdV2('deu')],
      distanceKm: 50_000,
      departTick: state.tick,
      arriveTick: state.tick + 5_000,
    };

    expect(selectApexSignalPurgeStatusesV2(
      state, WORLD_CONTENT_V2, humanId,
    )[0]).toMatchObject({
      territoryId: luxembourg,
      focused: true,
      mode: 'network-focus',
    });
  });

  it('keeps the hostile PRIME shield on Antarctic infrastructure only', () => {
    const state = createWorldStateV2(98_402, WORLD_CONTENT_V2);
    state.polarEndgame.phase = 'contact';
    expect(activateRoguePrimeV2(state)).toBe(true);
    const prime = state.polarEndgame.roguePrime!;
    const force = prime.force!;
    const conqueredWorldSource = territoryIdV2('bel');
    const worldTarget = territoryIdV2('nld');
    state.territories[conqueredWorldSource]!.owner = ROGUE_AI_NATION_ID_V2;
    const outsideOperation = operation(
      ROGUE_AI_NATION_ID_V2,
      conqueredWorldSource,
      worldTarget,
    );
    const outsideWar = war(
      'rogue-prime-outside-antarctica',
      ROGUE_AI_NATION_ID_V2,
      state.territories[worldTarget]!.owner,
      outsideOperation,
    );
    prime.status = 'sortie';
    force.locationId = conqueredWorldSource;
    force.mission = 'assault-support';
    force.front = {
      warId: outsideWar.id,
      sourceId: conqueredWorldSource,
      targetId: worldTarget,
    };
    state.wars = [outsideWar];
    expect(selectCommanderBattleSupportV2(
      state, outsideWar, outsideOperation, WORLD_CONTENT_V2,
    ).attacker).toBeNull();

    const antarcticOperation = operation(
      ROGUE_AI_NATION_ID_V2,
      ROGUE_PRIME_CORE_TERRITORY_ID_V2,
      worldTarget,
    );
    const antarcticWar = war(
      'rogue-prime-antarctic-gateway',
      ROGUE_AI_NATION_ID_V2,
      state.territories[worldTarget]!.owner,
      antarcticOperation,
    );
    force.locationId = ROGUE_PRIME_CORE_TERRITORY_ID_V2;
    force.front = {
      warId: antarcticWar.id,
      sourceId: ROGUE_PRIME_CORE_TERRITORY_ID_V2,
      targetId: worldTarget,
    };
    state.wars = [antarcticWar];
    expect(selectCommanderBattleSupportV2(
      state, antarcticWar, antarcticOperation, WORLD_CONTENT_V2,
    ).attacker).toMatchObject({ playerId: ROGUE_AI_NATION_ID_V2 });
  });
});
