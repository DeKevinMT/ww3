import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { synchronizeArmyCapacityV2 } from './capacity';
import {
  APEX_AEGIS_COUNTERPULSE_SHARE_V2,
  APEX_LANCER_PULSE_ATTACK_MULTIPLIER_V2,
  allocateApexFrontlineDamageV2,
  applyCommanderCasualtiesV2,
  cloneCommanderForcesV2,
  initializeCommanderForceV2,
  reconcileApexTwinProjectionV2,
  registerApexSupportedAssaultBattleV2,
  selectApexEmpireShieldNetworkV2,
  selectApexLancerPulseStatusV2,
  selectApexTwinProjectionStatusV2,
  selectCommanderBattleSupportV2,
  selectCommanderRouteV2,
} from './commanderForce';
import { WORLD_CONTENT_V2 } from './content';
import { assertInvariantsV2 } from './invariants';
import { canonicalStateHashV2, createSaveV2, loadSaveV2 } from './persistence';
import { invalidateTerritoryIndexV2 } from './selectors';
import {
  type CommanderCapabilitiesV2,
  type CommanderForceInitializationV2,
  type FrontOperationV2,
  type PlayerId,
  type TerritoryId,
  type WarStateV2,
  type WorldStateV2,
} from './types';

const apexProfile: CommanderForceInitializationV2 = {
  shield: {
    integrity: 0.001,
    maxIntegrity: 0.001,
    rechargeBuffer: 0,
    rechargeMultiplier: 1,
    pulseAttack: 0.001,
  },
  attackMultiplier: 1.10,
  defenseMultiplier: 1.12,
  treasury: 0,
  annualOutput: 0,
  supplyStock: 1,
};

function installApex(
  state: WorldStateV2,
  capabilities: Partial<CommanderCapabilitiesV2>,
): PlayerId {
  const playerId = state.humanPlayerId;
  expect(initializeCommanderForceV2(state, WORLD_CONTENT_V2, playerId, {
    ...apexProfile,
    capabilities,
  }).accepted).toBe(true);
  return playerId;
}

function operation(
  commanderId: PlayerId,
  sourceId: TerritoryId,
  targetId: TerritoryId,
  access: FrontOperationV2['access'] = 'land',
): FrontOperationV2 {
  return {
    commanderId,
    sourceId,
    targetId,
    doctrine: 'pressure',
    access,
    startedTick: 0,
    lastBattleTick: 0,
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
    startedTick: 0,
    lastBattleTick: 0,
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

describe('APEX doctrine capstones', () => {
  it('rejects multi-capstone launches, runtime state and authenticated mixed current saves', () => {
    const rejectedState = createWorldStateV2(95_000, WORLD_CONTENT_V2);
    const rejectedPlayerId = rejectedState.humanPlayerId;
    expect(initializeCommanderForceV2(
      rejectedState,
      WORLD_CONTENT_V2,
      rejectedPlayerId,
      {
        ...apexProfile,
        capabilities: { assaultSpecialist: true, rapidResponse: true },
      },
    )).toMatchObject({ accepted: false });
    expect(rejectedState.commanderForces[rejectedPlayerId]).toBeUndefined();

    const invalidState = createWorldStateV2(95_004, WORLD_CONTENT_V2);
    const invalidPlayerId = installApex(invalidState, { assaultSpecialist: true });
    invalidState.commanderForces[invalidPlayerId]!.capabilities.defenseSpecialist = true;
    expect(() => assertInvariantsV2(invalidState, WORLD_CONTENT_V2))
      .toThrow(/Commander force .* invalid canonical state/i);

    const state = createWorldStateV2(95_005, WORLD_CONTENT_V2);
    const playerId = installApex(state, { assaultSpecialist: true });
    state.commanderForces[playerId]!.doctrineRuntime = {
      lancerSupportedAssaultCount: 2,
      secondaryProjection: null,
      emergencyRebootUsed: false,
    };
    const mixedSave = structuredClone(createSaveV2(state, WORLD_CONTENT_V2));
    mixedSave.commanderForces[playerId]!.capabilities.defenseSpecialist = true;
    mixedSave.commanderForces[playerId]!.capabilities.rapidResponse = true;
    mixedSave.canonicalStateHash = canonicalStateHashV2(mixedSave);
    // Current-rule saves are strict. Only authenticated legacy rulesets may be
    // normalized during migration; a mixed current protocol must be rejected.
    expect(() => loadSaveV2(mixedSave, WORLD_CONTENT_V2))
      .toThrow(/Commander force .* invalid canonical state/i);
  });

  it('charges only APEX Pulse on resolved assaults and Overdrives exactly every third', () => {
    const state = createWorldStateV2(95_001, WORLD_CONTENT_V2);
    const playerId = installApex(state, { assaultSpecialist: true });
    const sourceId = state.players[playerId]!.capitalId;
    const targetId = WORLD_CONTENT_V2.territories[sourceId]!.connections
      .map((connection) => connection.targetId)
      .find((territoryId) => state.territories[territoryId]?.owner !== playerId)!;
    const defenderId = state.territories[targetId]!.owner;
    const activeOperation = operation(playerId, sourceId, targetId);
    const activeWar = war('war-lancer-cadence', playerId, defenderId, activeOperation);
    state.wars.push(activeWar);
    const force = state.commanderForces[playerId]!;
    force.shield.pulseChargeBonusPerStep = 0.10;
    force.locationId = sourceId;
    force.mission = 'assault-support';
    force.front = { warId: activeWar.id, sourceId, targetId };

    const firstPreview = selectCommanderBattleSupportV2(
      state, activeWar, activeOperation, WORLD_CONTENT_V2,
    ).attacker!;
    expect(firstPreview.attackMultiplier).toBe(1.10);
    expect(firstPreview.pulseAttack).toBe(0.001);
    expect(firstPreview.singularityPulseCharged).toBe(false);
    expect(selectApexLancerPulseStatusV2(state, playerId).supportedAssaultCount).toBe(0);
    // Repeated previews are pure and cannot arm the pulse.
    selectCommanderBattleSupportV2(
      state, activeWar, activeOperation, WORLD_CONTENT_V2,
    );
    selectCommanderBattleSupportV2(
      state, activeWar, activeOperation, WORLD_CONTENT_V2,
    );
    expect(selectApexLancerPulseStatusV2(state, playerId).supportedAssaultCount).toBe(0);

    expect(registerApexSupportedAssaultBattleV2(state, firstPreview)).toMatchObject({
      recorded: true,
      singularityPulse: false,
      supportedAssaultCount: 1,
    });
    const secondPreview = selectCommanderBattleSupportV2(
      state, activeWar, activeOperation, WORLD_CONTENT_V2,
    ).attacker!;
    expect(secondPreview.attackMultiplier).toBe(1.10);
    expect(secondPreview.pulseAttack).toBeCloseTo(0.0011, 9);
    expect(registerApexSupportedAssaultBattleV2(state, secondPreview)).toMatchObject({
      recorded: true,
      singularityPulse: false,
      supportedAssaultCount: 2,
      nextPulseCharged: true,
    });

    // Null/unsupported and defensive formations cannot advance LANCER.
    expect(registerApexSupportedAssaultBattleV2(state, null).recorded).toBe(false);
    expect(registerApexSupportedAssaultBattleV2(state, {
      ...secondPreview,
      mission: 'defense',
    }).recorded).toBe(false);
    expect(selectApexLancerPulseStatusV2(state, playerId).supportedAssaultCount).toBe(2);

    const cloned = cloneCommanderForcesV2(state.commanderForces);
    expect(cloned[playerId]!.doctrineRuntime?.lancerSupportedAssaultCount).toBe(2);
    const loaded = loadSaveV2(createSaveV2(state, WORLD_CONTENT_V2), WORLD_CONTENT_V2);
    expect(selectApexLancerPulseStatusV2(loaded, playerId)).toMatchObject({
      supportedAssaultCount: 2,
      nextPulseCharged: true,
      nextAttackMultiplier: 1.2 * APEX_LANCER_PULSE_ATTACK_MULTIPLIER_V2,
    });
    const loadedWar = loaded.wars.find((candidate) => candidate.id === activeWar.id)!;
    const loadedOperation = loadedWar.attackerOperations[0]!;
    const pulsePreview = selectCommanderBattleSupportV2(
      loaded, loadedWar, loadedOperation, WORLD_CONTENT_V2,
    ).attacker!;
    expect(pulsePreview.attackMultiplier).toBe(apexProfile.attackMultiplier);
    expect(pulsePreview.pulseAttack).toBeCloseTo(
      apexProfile.shield.pulseAttack * 1.2 * APEX_LANCER_PULSE_ATTACK_MULTIPLIER_V2,
      9,
    );
    expect(pulsePreview.singularityPulseCharged).toBe(true);
    const energyBeforeOverdrive = loaded.commanderForces[playerId]!.shield.integrity;
    expect(registerApexSupportedAssaultBattleV2(loaded, pulsePreview)).toMatchObject({
      recorded: true,
      singularityPulse: true,
      supportedAssaultCount: 0,
      nextPulseCharged: false,
    });
    expect(loaded.commanderForces[playerId]!.shield.integrity).toBeCloseTo(
      energyBeforeOverdrive - loaded.commanderForces[playerId]!.shield.maxIntegrity * 0.02,
      9,
    );
    expect(selectCommanderBattleSupportV2(
      loaded, loadedWar, loadedOperation, WORLD_CONTENT_V2,
    ).attacker).toMatchObject({
      attackMultiplier: apexProfile.attackMultiplier,
      pulseAttack: apexProfile.shield.pulseAttack,
    });
  });

  it('makes interception more efficient without raising the 20% Max Energy spend limit', () => {
    const baseline = allocateApexFrontlineDamageV2({
      requestedDamage: 1,
      nationalManpower: 1,
      apex: {
        shieldActive: true,
        integrity: 1,
        maxIntegrity: 1,
        interceptEfficiency: 1,
      },
    });
    const efficient = allocateApexFrontlineDamageV2({
      requestedDamage: 1,
      nationalManpower: 1,
      apex: {
        shieldActive: true,
        integrity: 1,
        maxIntegrity: 1,
        interceptEfficiency: 1.45,
      },
    });

    expect(baseline.apexLosses).toBeCloseTo(0.2, 12);
    expect(efficient.apexLosses).toBeCloseTo(0.2, 12);
    expect(efficient.interceptedDamage).toBeCloseTo(0.29, 12);
    expect(efficient.interceptedDamage).toBeGreaterThan(baseline.interceptedDamage);
    expect(efficient.nationalLosses).toBeCloseTo(0.71, 12);
  });

  it('banks Impact Recovery as offline Reserve Energy without repairing the live shield', () => {
    const state = createWorldStateV2(95_007, WORLD_CONTENT_V2);
    const playerId = installApex(state, {});
    const force = state.commanderForces[playerId]!;
    force.shield.rechargeBuffer = 0;
    force.shield.impactRecoveryShare = 0.25;

    expect(applyCommanderCasualtiesV2(state, playerId, 0.0002))
      .toBeCloseTo(0.0002, 12);
    expect(force.shield.integrity).toBeCloseTo(0.0008, 12);
    expect(force.shield.rechargeBuffer).toBeCloseTo(0.00005, 12);
  });

  it('reflects exactly 15% of intercepted damage without a second hidden hostile cap', () => {
    const baseInput = {
      requestedDamage: 0.1,
      nationalManpower: 1,
      apex: {
        shieldActive: true,
        integrity: 1,
        maxIntegrity: 1,
        mirrorMatrixEligible: true,
      },
    };
    const reflected = allocateApexFrontlineDamageV2({
      ...baseInput,
      hostileManpower: 1,
    });
    expect(reflected.counterpulseDamage).toBeCloseTo(
      reflected.interceptedDamage * APEX_AEGIS_COUNTERPULSE_SHARE_V2,
      12,
    );
    const smallHostile = allocateApexFrontlineDamageV2({
      ...baseInput,
      hostileManpower: 0.001,
    });
    expect(smallHostile.counterpulseDamage).toBeCloseTo(
      smallHostile.interceptedDamage * APEX_AEGIS_COUNTERPULSE_SHARE_V2,
      12,
    );
    expect(smallHostile.counterpulseDamage).toBeGreaterThan(0.001 * 0.01);
    expect(allocateApexFrontlineDamageV2({
      ...baseInput,
      hostileManpower: 1,
      apex: { ...baseInput.apex, mirrorMatrixEligible: false },
    }).counterpulseDamage).toBe(0);
  });

  it('accepts an absent legacy doctrine sidecar and normalizes it to deterministic defaults', () => {
    const state = createWorldStateV2(95_002, WORLD_CONTENT_V2);
    const playerId = installApex(state, {});
    delete state.commanderForces[playerId]!.doctrineRuntime;

    expect(() => assertInvariantsV2(state, WORLD_CONTENT_V2)).not.toThrow();
    expect(cloneCommanderForcesV2(state.commanderForces)[playerId]!.doctrineRuntime)
      .toEqual({
        lancerSupportedAssaultCount: 0,
        secondaryProjection: null,
        emergencyRebootUsed: false,
      });

    state.commanderForces[playerId]!.doctrineRuntime = {
      lancerSupportedAssaultCount: 3,
      secondaryProjection: null,
      emergencyRebootUsed: false,
    };
    expect(() => assertInvariantsV2(state, WORLD_CONTENT_V2))
      .toThrow(/invalid canonical state/i);
  });

  it('uses Theater Mesh as bounded efficiency across every network front without cloning state', () => {
    const state = createWorldStateV2(95_003, WORLD_CONTENT_V2);
    const playerId = installApex(state, { forceMultiplier: true });
    const primaryLocationId = state.players[playerId]!.capitalId;
    const adjacent = WORLD_CONTENT_V2.territories[primaryLocationId]!.connections
      .map((connection) => connection.targetId)
      .filter((territoryId) => Boolean(state.territories[territoryId]))
      .slice(0, 3);
    expect(adjacent.length).toBe(3);
    const [secondarySourceId, thirdSourceId] = adjacent as [
      TerritoryId, TerritoryId, TerritoryId,
    ];
    state.territories[secondarySourceId]!.owner = playerId;
    state.territories[thirdSourceId]!.owner = playerId;
    state.territories[secondarySourceId]!.coreOwner = playerId;
    state.territories[thirdSourceId]!.coreOwner = playerId;
    state.territories[secondarySourceId]!.integration = 1;
    state.territories[secondarySourceId]!.integrationProgram = null;
    state.territories[thirdSourceId]!.integration = 1;
    state.territories[thirdSourceId]!.integrationProgram = null;
    invalidateTerritoryIndexV2(state);

    const primaryConnection = WORLD_CONTENT_V2.territories[primaryLocationId]!.connections
      .find((connection) => state.territories[connection.targetId]?.owner !== playerId)!;
    const secondaryConnection = WORLD_CONTENT_V2.territories[secondarySourceId]!.connections
      .find((connection) => state.territories[connection.targetId]?.owner !== playerId)!;
    const thirdConnection = WORLD_CONTENT_V2.territories[thirdSourceId]!.connections
      .find((connection) => state.territories[connection.targetId]?.owner !== playerId)!;
    const primaryTargetId = primaryConnection.targetId;
    const secondaryTargetId = secondaryConnection.targetId;
    const thirdTargetId = thirdConnection.targetId;
    expect(primaryTargetId).toBeDefined();
    expect(secondaryTargetId).toBeDefined();
    expect(thirdTargetId).toBeDefined();

    const primaryOperation = operation(
      playerId,
      primaryLocationId,
      primaryTargetId,
      primaryConnection.kind === 'land' ? 'land' : 'naval',
    );
    const secondaryOperation = operation(
      playerId,
      secondarySourceId,
      secondaryTargetId,
      secondaryConnection.kind === 'land' ? 'land' : 'naval',
    );
    const thirdOperation = operation(
      playerId,
      thirdSourceId,
      thirdTargetId,
      thirdConnection.kind === 'land' ? 'land' : 'naval',
    );
    const primaryWar = war(
      'war-nexus-primary', playerId, state.territories[primaryTargetId]!.owner, primaryOperation,
    );
    const secondaryWar = war(
      'war-nexus-secondary', playerId, state.territories[secondaryTargetId]!.owner,
      secondaryOperation,
    );
    const thirdWar = war(
      'war-nexus-third', playerId, state.territories[thirdTargetId]!.owner, thirdOperation,
    );
    state.wars = [primaryWar, secondaryWar, thirdWar];
    const force = state.commanderForces[playerId]!;
    force.locationId = primaryLocationId;
    force.mission = 'assault-support';
    force.front = {
      warId: primaryWar.id,
      sourceId: primaryLocationId,
      targetId: primaryTargetId,
    };

    expect(reconcileApexTwinProjectionV2(state, WORLD_CONTENT_V2, playerId)).toBe(false);
    const network = selectApexEmpireShieldNetworkV2(
      state, WORLD_CONTENT_V2, playerId,
    )!;
    expect(network.activeFrontCount).toBe(3);
    expect(network.fronts.map((front) => front.allocationShare))
      .toEqual([0.466666667, 0.466666667, 0.466666667]);
    expect(network.fronts.reduce(
      (sum, front) => sum + front.allocationShare,
      0,
    )).toBeCloseTo(1.4, 8);
    expect(force.doctrineRuntime?.secondaryProjection).toBeNull();
    expect([
      [primaryWar, primaryOperation],
      [secondaryWar, secondaryOperation],
      [thirdWar, thirdOperation],
    ].map(([activeWar, activeFront]) => selectCommanderBattleSupportV2(
      state,
      activeWar as WarStateV2,
      activeFront as FrontOperationV2,
      WORLD_CONTENT_V2,
    ).attacker)).toHaveLength(3);
  });

  it('keeps Omnipresence route-independent and stores no location sidecar', () => {
    const state = createWorldStateV2(95_006, WORLD_CONTENT_V2);
    const playerId = installApex(state, { forceMultiplier: true });
    const primaryLocationId = state.players[playerId]!.capitalId;
    const primaryConnections = [...WORLD_CONTENT_V2.territories[primaryLocationId]!.connections]
      .sort((left, right) => left.targetId.localeCompare(right.targetId));
    const primaryNeighborIds = new Set(primaryConnections.map((edge) => edge.targetId));
    let fixture: {
      intermediateId: TerritoryId;
      secondaryLocationId: TerritoryId;
      primaryTargetId: TerritoryId;
      secondaryTargetId: TerritoryId;
      primaryAccess: FrontOperationV2['access'];
      secondaryAccess: FrontOperationV2['access'];
    } | undefined;

    for (const intermediateEdge of primaryConnections) {
      const intermediate = WORLD_CONTENT_V2.territories[intermediateEdge.targetId];
      if (!intermediate || !state.territories[intermediateEdge.targetId]) continue;
      for (const secondaryEdge of [...intermediate.connections]
        .sort((left, right) => left.targetId.localeCompare(right.targetId))) {
        const secondaryLocationId = secondaryEdge.targetId;
        const secondary = WORLD_CONTENT_V2.territories[secondaryLocationId];
        if (!secondary || !state.territories[secondaryLocationId]
          || secondaryLocationId === primaryLocationId
          || primaryNeighborIds.has(secondaryLocationId)) continue;
        const primaryTarget = primaryConnections.find((edge) => (
          edge.targetId !== intermediateEdge.targetId
            && edge.targetId !== secondaryLocationId
            && state.territories[edge.targetId]?.owner !== playerId
        ));
        if (!primaryTarget) continue;
        const primaryDefenderId = state.territories[primaryTarget.targetId]!.owner;
        const secondaryTarget = [...secondary.connections]
          .sort((left, right) => left.targetId.localeCompare(right.targetId))
          .find((edge) => (
            edge.targetId !== intermediateEdge.targetId
              && state.territories[edge.targetId]?.owner !== playerId
              && state.territories[edge.targetId]?.owner !== primaryDefenderId
          ));
        if (!secondaryTarget) continue;
        fixture = {
          intermediateId: intermediateEdge.targetId,
          secondaryLocationId,
          primaryTargetId: primaryTarget.targetId,
          secondaryTargetId: secondaryTarget.targetId,
          primaryAccess: primaryTarget.kind === 'land' ? 'land' : 'naval',
          secondaryAccess: secondaryTarget.kind === 'land' ? 'land' : 'naval',
        };
        break;
      }
      if (fixture) break;
    }
    expect(fixture).toBeDefined();
    const {
      intermediateId,
      secondaryLocationId,
      primaryTargetId,
      secondaryTargetId,
      primaryAccess,
      secondaryAccess,
    } = fixture!;

    for (const territoryId of [intermediateId, secondaryLocationId]) {
      const territory = state.territories[territoryId]!;
      territory.owner = playerId;
      territory.coreOwner = playerId;
      territory.integration = 1;
      territory.integrationProgram = null;
    }
    invalidateTerritoryIndexV2(state);
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const initialRoute = selectCommanderRouteV2(
      state, WORLD_CONTENT_V2, playerId, primaryLocationId, secondaryLocationId,
    );
    expect(initialRoute?.path).toEqual(expect.arrayContaining([
      primaryLocationId, intermediateId, secondaryLocationId,
    ]));
    expect(initialRoute?.path[0]).toBe(primaryLocationId);
    expect(initialRoute?.path.at(-1)).toBe(secondaryLocationId);
    expect(initialRoute!.path.length).toBeGreaterThanOrEqual(3);

    const primaryOperation = operation(
      playerId, primaryLocationId, primaryTargetId, primaryAccess,
    );
    const secondaryOperation = operation(
      playerId, secondaryLocationId, secondaryTargetId, secondaryAccess,
    );
    const primaryWar = war(
      'war-nexus-tether-primary',
      playerId,
      state.territories[primaryTargetId]!.owner,
      primaryOperation,
    );
    const secondaryWar = war(
      'war-nexus-tether-secondary',
      playerId,
      state.territories[secondaryTargetId]!.owner,
      secondaryOperation,
    );
    state.wars = [primaryWar, secondaryWar];
    const force = state.commanderForces[playerId]!;
    force.locationId = primaryLocationId;
    force.mission = 'assault-support';
    force.front = {
      warId: primaryWar.id,
      sourceId: primaryLocationId,
      targetId: primaryTargetId,
    };

    expect(reconcileApexTwinProjectionV2(state, WORLD_CONTENT_V2, playerId)).toBe(false);
    expect(selectApexTwinProjectionStatusV2(
      state, playerId, WORLD_CONTENT_V2,
    )).toMatchObject({
      active: true,
      combatShare: 0.6,
    });
    expect(force.doctrineRuntime?.secondaryProjection).toBeNull();
  });
});
