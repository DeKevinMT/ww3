import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { synchronizeArmyCapacityV2 } from './capacity';
import {
  APEX_AEGIS_COUNTERPULSE_SHARE_V2,
  APEX_LANCER_PULSE_ATTACK_MULTIPLIER_V2,
  APEX_NEXUS_PROJECTION_COMBAT_SHARE_V2,
  allocateApexFrontlineDamageV2,
  applyApexShieldDamageV2,
  cloneCommanderForcesV2,
  consumeCommanderSupplyV2,
  initializeCommanderForceV2,
  reconcileApexTwinProjectionV2,
  registerApexSupportedAssaultBattleV2,
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
  manpower: 0.001,
  capacity: 0.001,
  trainedReserves: 0,
  baseAttack: 100,
  baseDefense: 120,
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
  it('rejects multi-capstone launches and repairs authenticated mixed saves to one protocol', () => {
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
    };
    const mixedSave = structuredClone(createSaveV2(state, WORLD_CONTENT_V2));
    mixedSave.commanderForces[playerId]!.capabilities.defenseSpecialist = true;
    mixedSave.commanderForces[playerId]!.capabilities.rapidResponse = true;
    mixedSave.canonicalStateHash = canonicalStateHashV2(mixedSave);

    const loaded = loadSaveV2(mixedSave, WORLD_CONTENT_V2);
    expect(loaded.commanderForces[playerId]!.capabilities).toMatchObject({
      assaultSpecialist: true,
      defenseSpecialist: false,
      rapidResponse: false,
    });
    expect(selectApexLancerPulseStatusV2(loaded, playerId)).toMatchObject({
      supportedAssaultCount: 2,
      nextPulseCharged: true,
    });
    expect(selectApexTwinProjectionStatusV2(
      loaded, playerId, WORLD_CONTENT_V2,
    )).toMatchObject({
      active: false,
      combatShare: 1,
      secondaryProjection: null,
    });

    const sourceId = loaded.players[playerId]!.capitalId;
    const targetId = WORLD_CONTENT_V2.territories[sourceId]!.connections
      .map((connection) => connection.targetId)
      .find((territoryId) => loaded.territories[territoryId]?.owner !== playerId)!;
    const activeOperation = operation(playerId, sourceId, targetId);
    const activeWar = war(
      'war-normalized-protocol',
      playerId,
      loaded.territories[targetId]!.owner,
      activeOperation,
    );
    loaded.wars.push(activeWar);
    const force = loaded.commanderForces[playerId]!;
    force.locationId = sourceId;
    force.mission = 'assault-support';
    force.front = { warId: activeWar.id, sourceId, targetId };
    const support = selectCommanderBattleSupportV2(
      loaded, activeWar, activeOperation, WORLD_CONTENT_V2,
    ).attacker!;
    expect(support.singularityPulseCharged).toBe(true);
    expect(support.mirrorMatrixEligible).toBe(false);
    expect(support.projectionCombatShare).toBe(1);
  });

  it('charges LANCER only on resolved supported assaults and pulses on exactly every third', () => {
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
    force.locationId = sourceId;
    force.mission = 'assault-support';
    force.front = { warId: activeWar.id, sourceId, targetId };

    const firstPreview = selectCommanderBattleSupportV2(
      state, activeWar, activeOperation, WORLD_CONTENT_V2,
    ).attacker!;
    expect(firstPreview.baseAttack).toBe(100);
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
      nextAttackMultiplier: APEX_LANCER_PULSE_ATTACK_MULTIPLIER_V2,
    });
    const loadedWar = loaded.wars.find((candidate) => candidate.id === activeWar.id)!;
    const loadedOperation = loadedWar.attackerOperations[0]!;
    const pulsePreview = selectCommanderBattleSupportV2(
      loaded, loadedWar, loadedOperation, WORLD_CONTENT_V2,
    ).attacker!;
    expect(pulsePreview.baseAttack).toBe(
      apexProfile.baseAttack * APEX_LANCER_PULSE_ATTACK_MULTIPLIER_V2,
    );
    expect(pulsePreview.singularityPulseCharged).toBe(true);
    expect(registerApexSupportedAssaultBattleV2(loaded, pulsePreview)).toMatchObject({
      recorded: true,
      singularityPulse: true,
      supportedAssaultCount: 0,
      nextPulseCharged: false,
    });
    expect(selectCommanderBattleSupportV2(
      loaded, loadedWar, loadedOperation, WORLD_CONTENT_V2,
    ).attacker!.baseAttack).toBe(apexProfile.baseAttack);
  });

  it('reflects exactly 20% of intercepted damage for AEGIS, bounded by the hostile formation', () => {
    const baseInput = {
      requestedDamage: 0.1,
      nationalManpower: 1,
      apex: {
        shieldActive: true,
        engagedManpower: 1,
        manpower: 1,
        capacity: 1,
        defense: 1,
        nationalDefense: 1,
        opposingAttack: 1,
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
    const bounded = allocateApexFrontlineDamageV2({
      ...baseInput,
      hostileManpower: 0.001,
    });
    expect(bounded.counterpulseDamage).toBe(0.001);
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
      .toEqual({ lancerSupportedAssaultCount: 0, secondaryProjection: null });

    state.commanderForces[playerId]!.doctrineRuntime = {
      lancerSupportedAssaultCount: 3,
      secondaryProjection: null,
    };
    expect(() => assertInvariantsV2(state, WORLD_CONTENT_V2))
      .toThrow(/invalid canonical state/i);
  });

  it('maintains at most two deterministic NEXUS projections over one shared integrity and energy pool', () => {
    const state = createWorldStateV2(95_003, WORLD_CONTENT_V2);
    const playerId = installApex(state, { rapidResponse: true });
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

    expect(reconcileApexTwinProjectionV2(state, WORLD_CONTENT_V2, playerId)).toBe(true);
    const twin = selectApexTwinProjectionStatusV2(
      state, playerId, WORLD_CONTENT_V2,
    );
    expect(twin).toMatchObject({
      active: true,
      combatShare: APEX_NEXUS_PROJECTION_COMBAT_SHARE_V2,
      primaryLocationId,
    });
    expect(twin.secondaryProjection).not.toBeNull();
    expect(twin.secondaryProjection!.locationId).not.toBe(primaryLocationId);

    const primarySupport = selectCommanderBattleSupportV2(
      state, primaryWar, primaryOperation, WORLD_CONTENT_V2,
    ).attacker!;
    const otherSupports = [
      selectCommanderBattleSupportV2(
        state, secondaryWar, secondaryOperation, WORLD_CONTENT_V2,
      ).attacker,
      selectCommanderBattleSupportV2(
        state, thirdWar, thirdOperation, WORLD_CONTENT_V2,
      ).attacker,
    ];
    expect(primarySupport).toMatchObject({
      projection: 'primary',
      projectionCombatShare: APEX_NEXUS_PROJECTION_COMBAT_SHARE_V2,
      manpower: apexProfile.manpower,
      availableSupply: apexProfile.supplyStock,
    });
    expect(primarySupport.baseAttack).toBe(
      apexProfile.baseAttack * APEX_NEXUS_PROJECTION_COMBAT_SHARE_V2,
    );
    expect(primarySupport.baseDefense).toBe(
      apexProfile.baseDefense * APEX_NEXUS_PROJECTION_COMBAT_SHARE_V2,
    );
    expect(otherSupports.filter(Boolean)).toHaveLength(1);
    expect(otherSupports.find(Boolean)).toMatchObject({
      projection: 'secondary',
      projectionCombatShare: APEX_NEXUS_PROJECTION_COMBAT_SHARE_V2,
      manpower: apexProfile.manpower,
      availableSupply: apexProfile.supplyStock,
    });
    expect(Object.keys(force.doctrineRuntime!.secondaryProjection!).sort()).toEqual([
      'front', 'locationId', 'mission', 'pairedPrimaryFront',
    ]);

    const selectedBeforeSave = structuredClone(force.doctrineRuntime!.secondaryProjection);
    // The third legal candidate proved that NEXUS never created a third
    // projection; remove that unrelated war before the save round-trip so the
    // fixture stays a canonical one-war-per-opponent campaign state.
    state.wars = state.wars.filter((candidate) => (
      candidate.id === primaryWar.id || candidate.id === selectedBeforeSave!.front.warId
    ));
    assertInvariantsV2(state, WORLD_CONTENT_V2);
    const loaded = loadSaveV2(createSaveV2(state, WORLD_CONTENT_V2), WORLD_CONTENT_V2);
    expect(loaded.commanderForces[playerId]!.doctrineRuntime!.secondaryProjection)
      .toEqual(selectedBeforeSave);
    expect(reconcileApexTwinProjectionV2(loaded, WORLD_CONTENT_V2, playerId)).toBe(false);

    const loadedForce = loaded.commanderForces[playerId]!;
    const integrityBefore = loadedForce.army.manpower;
    const energyBefore = loadedForce.economy.supplyStock;
    expect(applyApexShieldDamageV2(loaded, playerId, 0.0001)).toBe(0.0001);
    expect(applyApexShieldDamageV2(loaded, playerId, 0.0002)).toBe(0.0002);
    expect(loadedForce.army.manpower).toBeCloseTo(integrityBefore - 0.0003, 9);
    expect(consumeCommanderSupplyV2(loaded, playerId, 0.1)).toBe(0.1);
    expect(consumeCommanderSupplyV2(loaded, playerId, 0.2)).toBe(0.2);
    expect(loadedForce.economy.supplyStock).toBeCloseTo(energyBefore - 0.3, 9);
    expect(loadedForce.doctrineRuntime!.secondaryProjection).not.toHaveProperty('army');
    expect(loadedForce.doctrineRuntime!.secondaryProjection).not.toHaveProperty('economy');

    const exhausted = structuredClone(loaded);
    expect(applyApexShieldDamageV2(exhausted, playerId, 1)).toBeGreaterThan(0);
    expect(exhausted.commanderForces[playerId]!.army.manpower).toBe(0);
    expect(exhausted.commanderForces[playerId]!.doctrineRuntime!.secondaryProjection)
      .toBeNull();
    expect(selectApexTwinProjectionStatusV2(
      exhausted, playerId, WORLD_CONTENT_V2,
    ).active).toBe(false);

    const selectedWarId = loadedForce.doctrineRuntime!.secondaryProjection!.front.warId;
    loaded.wars = loaded.wars.filter((candidate) => (
      candidate.id !== selectedWarId
    ));
    expect(reconcileApexTwinProjectionV2(loaded, WORLD_CONTENT_V2, playerId)).toBe(true);
    expect(selectApexTwinProjectionStatusV2(
      loaded, playerId, WORLD_CONTENT_V2,
    )).toMatchObject({
      active: false,
      combatShare: 1,
      secondaryProjection: null,
    });
    const recombinedWar = loaded.wars.find((candidate) => candidate.id === primaryWar.id)!;
    const recombinedOperation = recombinedWar.attackerOperations[0]!;
    expect(selectCommanderBattleSupportV2(
      loaded, recombinedWar, recombinedOperation, WORLD_CONTENT_V2,
    ).attacker).toMatchObject({
      projection: 'primary',
      projectionCombatShare: 1,
      baseAttack: apexProfile.baseAttack,
      baseDefense: apexProfile.baseDefense,
    });
  });

  it('recombines a NEXUS secondary when its owned route is severed and preserves the primary front', () => {
    const state = createWorldStateV2(95_006, WORLD_CONTENT_V2);
    const playerId = installApex(state, { rapidResponse: true });
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

    expect(reconcileApexTwinProjectionV2(state, WORLD_CONTENT_V2, playerId)).toBe(true);
    expect(selectApexTwinProjectionStatusV2(
      state, playerId, WORLD_CONTENT_V2,
    )).toMatchObject({
      active: true,
      secondaryProjection: { locationId: secondaryLocationId },
    });
    assertInvariantsV2(state, WORLD_CONTENT_V2);
    const loaded = loadSaveV2(createSaveV2(state, WORLD_CONTENT_V2), WORLD_CONTENT_V2);
    expect(loaded.commanderForces[playerId]!.doctrineRuntime!.secondaryProjection)
      .toEqual(state.commanderForces[playerId]!.doctrineRuntime!.secondaryProjection);

    const loadedForce = loaded.commanderForces[playerId]!;
    const primaryBefore = {
      locationId: loadedForce.locationId,
      mission: loadedForce.mission,
      front: structuredClone(loadedForce.front),
      manpower: loadedForce.army.manpower,
      supplyStock: loadedForce.economy.supplyStock,
    };
    const warsBefore = structuredClone(loaded.wars);
    const corridorCaptorId = loaded.territories[secondaryTargetId]!.owner;
    const corridor = loaded.territories[intermediateId]!;
    corridor.owner = corridorCaptorId;
    corridor.coreOwner = corridorCaptorId;
    corridor.integration = 1;
    corridor.integrationProgram = null;
    invalidateTerritoryIndexV2(loaded);
    synchronizeArmyCapacityV2(loaded, WORLD_CONTENT_V2);

    expect(selectCommanderRouteV2(
      loaded, WORLD_CONTENT_V2, playerId, primaryLocationId, secondaryLocationId,
    )).toBeUndefined();
    // Read-only consumers stop granting the remote 60% formation even before
    // the canonical weekly reconciliation clears the stale sidecar.
    expect(selectApexTwinProjectionStatusV2(
      loaded, playerId, WORLD_CONTENT_V2,
    )).toMatchObject({ active: false, combatShare: 1, secondaryProjection: null });
    const loadedSecondaryWar = loaded.wars.find((candidate) => (
      candidate.id === secondaryWar.id
    ))!;
    expect(selectCommanderBattleSupportV2(
      loaded,
      loadedSecondaryWar,
      loadedSecondaryWar.attackerOperations[0]!,
      WORLD_CONTENT_V2,
    ).attacker).toBeNull();

    expect(reconcileApexTwinProjectionV2(loaded, WORLD_CONTENT_V2, playerId)).toBe(true);
    expect(loadedForce.doctrineRuntime!.secondaryProjection).toBeNull();
    expect({
      locationId: loadedForce.locationId,
      mission: loadedForce.mission,
      front: loadedForce.front,
      manpower: loadedForce.army.manpower,
      supplyStock: loadedForce.economy.supplyStock,
    }).toEqual(primaryBefore);
    expect(loaded.wars).toEqual(warsBefore);
    assertInvariantsV2(loaded, WORLD_CONTENT_V2);

    const recombinedSave = createSaveV2(loaded, WORLD_CONTENT_V2);
    const reloaded = loadSaveV2(recombinedSave, WORLD_CONTENT_V2);
    expect(reloaded.commanderForces[playerId]!.doctrineRuntime!.secondaryProjection)
      .toBeNull();
    expect(reloaded.commanderForces[playerId]!.front).toEqual(primaryBefore.front);
    expect(reloaded.wars).toEqual(warsBefore);
    expect(createSaveV2(reloaded, WORLD_CONTENT_V2).canonicalStateHash)
      .toBe(recombinedSave.canonicalStateHash);
  });
});
