import { describe, expect, it } from 'vitest';
import { WorldEngineV2 } from './WorldEngineV2';
import { V2_RULES_VERSION } from './balance';
import { createWorldStateV2 } from './bootstrap';
import { openingArmyCapacityMultiplierV2, synchronizeArmyCapacityV2 } from './capacity';
import {
  APEX_AUTONOMY_COMMAND_REASON_V2,
  COMMANDER_HQ_TRANSFER_CAPACITY_SHARE_V2,
  COMMANDER_MANUAL_IDLE_GRACE_TICKS_V2,
  COMMANDER_TREASURY_RESERVE_WEEKS_V2,
  applyCommanderCasualtiesV2,
  commanderEliteComparisonForRatingsV2,
  initializeCommanderForceV2,
  issueCommanderOrderV2,
  processCommanderForcesV2,
  reconcileCommanderForcesV2,
  reconcileCommanderTerritorialAccessV2,
  selectCommanderEconomyProjectionV2,
  selectCommanderForecastMobilityV2,
  selectCommanderRouteV2,
  selectCommanderBattleSupportV2,
  selectApexShieldPresentationV2,
} from './commanderForce';
import { ROGUE_AI_NATION_ID_V2, WORLD_CONTENT_V2 } from './content';
import { beginTerritoryIntegrationV2 } from './integration';
import { assertInvariantsV2 } from './invariants';
import { openingStartingTreasuryV2 } from './nationState';
import { canonicalStateHashV2, createSaveV2, loadSaveV2 } from './persistence';
import { resolveScenarioV2 } from './scenarios';
import { markSurvivalScorchedTerritoryV2 } from './survivalEmpire';
import { traitNationContextV2 } from './traitContext';
import {
  nationIdV2,
  territoryIdV2,
  type CommanderForceInitializationV2,
  type FrontOperationV2,
  type PlayerId,
  type TerritoryId,
  type WarStateV2,
} from './types';
import { resolveBattlePulseV2 } from './war';

const commanderProfile: CommanderForceInitializationV2 = {
  shield: {
    integrity: 0.02,
    maxIntegrity: 0.04,
    rechargeBuffer: 0.01,
    pulseAttack: 0.001,
  },
  attackMultiplier: 1.32,
  defenseMultiplier: 1.36,
  treasury: 0,
  annualOutput: 6,
  supplyStock: 2,
};

function createGlobalSurvivalCommander(seed: number): {
  engine: WorldEngineV2;
  playerId: PlayerId;
} {
  const resolved = resolveScenarioV2({ mode: 'survival', seed });
  const engine = new WorldEngineV2(seed, resolved.content);
  const playerId = nationIdV2('bel');
  expect(engine.chooseCountry(playerId)).toEqual({ accepted: true });
  expect(engine.formSurvivalEmpire(
    playerId,
    resolved.content.nationIds.filter((id) => id !== ROGUE_AI_NATION_ID_V2),
  )).toEqual({ accepted: true });
  expect(engine.initializeCommanderForce(playerId, commanderProfile).accepted).toBe(true);
  return { engine, playerId };
}

function testOperation(
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
    startedTick: 0,
    lastBattleTick: 0,
    holdUntilTick: 0,
    momentum: 0,
  };
}

function testWar(
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

describe('APEX neural dome', () => {
  it('accepts the canonical high-energy APEX rating band but rejects unsafe ratings', () => {
    const state = createWorldStateV2(21_021, WORLD_CONTENT_V2);
    const playerId = state.humanPlayerId;
    expect(initializeCommanderForceV2(state, WORLD_CONTENT_V2, playerId, {
      ...commanderProfile,
      shield: {
        ...commanderProfile.shield,
        integrity: 0.0009,
        maxIntegrity: 0.0009,
        rechargeBuffer: 0.00008,
      },
      attackMultiplier: 2.5,
      defenseMultiplier: 2.5,
    })).toEqual({ accepted: true });

    const unsafeState = createWorldStateV2(21_022, WORLD_CONTENT_V2);
    expect(initializeCommanderForceV2(
      unsafeState,
      WORLD_CONTENT_V2,
      unsafeState.humanPlayerId,
      { ...commanderProfile, attackMultiplier: 2.5001 },
    ).accepted).toBe(false);
  });

  it('replaces the old human rank overlay with neutral account trait progression by default', () => {
    const state = createWorldStateV2(21_001, WORLD_CONTENT_V2);
    const playerId = state.humanPlayerId;
    const result = initializeCommanderForceV2(
      state, WORLD_CONTENT_V2, playerId, commanderProfile,
    );

    expect(result.accepted).toBe(true);
    expect(state.commanderForces[playerId]?.locationId).toBe(state.players[playerId]!.capitalId);
    expect(state.players[playerId]!.openingArmyBonus).toBeNull();
    expect(state.players[playerId]!.treasury).toBe(
      openingStartingTreasuryV2(playerId, WORLD_CONTENT_V2, false),
    );
    expect(openingArmyCapacityMultiplierV2(state, WORLD_CONTENT_V2, playerId)).toBe(1);
    expect(traitNationContextV2(state, playerId)).toMatchObject({
      humanControlled: true,
      humanTraitMultiplier: 0,
    });
    expect(state.commanderForces[playerId]).toMatchObject({
      countryTraitScale: 0,
      capabilities: {
        mobileHeadquarters: false,
        fieldHospital: false,
        rapidResponse: false,
        assaultSpecialist: false,
        defenseSpecialist: false,
        emergencyExtractionCharges: 0,
      },
    });
  });

  it('exposes free APEX income without adding it a second time in the Commander phase', () => {
    const state = createWorldStateV2(21_019, WORLD_CONTENT_V2);
    const playerId = state.humanPlayerId;
    expect(initializeCommanderForceV2(
      state, WORLD_CONTENT_V2, playerId, commanderProfile,
    ).accepted).toBe(true);
    const force = state.commanderForces[playerId]!;
    const empireTreasuryBefore = state.players[playerId]!.treasury;
    const projection = selectCommanderEconomyProjectionV2(state, playerId)!;

    expect(projection.weeklyEmpireTransfer).toBe(projection.weeklyIncome);
    expect(projection.treasuryReserveTarget).toBe(0);
    expect(projection.weeklyUpkeepDue).toBe(0);
    expect(projection.weeklyInvestment).toBe(0);
    expect(projection.trainedReserveGain).toBeGreaterThan(0);
    expect(projection.supplyGain).toBeGreaterThan(0);

    processCommanderForcesV2(state, WORLD_CONTENT_V2);

    expect(state.players[playerId]!.treasury).toBe(empireTreasuryBefore);
    expect(force.economy.treasury).toBe(0);
    expect(force.economy.annualOutput).toBe(commanderProfile.annualOutput);
  });

  it('never creates a private APEX reserve or cash expense', () => {
    const state = createWorldStateV2(21_020, WORLD_CONTENT_V2);
    const playerId = state.humanPlayerId;
    expect(initializeCommanderForceV2(state, WORLD_CONTENT_V2, playerId, {
      ...commanderProfile,
      treasury: 0,
    }).accepted).toBe(true);
    const force = state.commanderForces[playerId]!;
    const empireTreasuryBefore = state.players[playerId]!.treasury;
    const projection = selectCommanderEconomyProjectionV2(state, playerId)!;

    expect(projection.corpsTreasuryAfter).toBe(0);
    expect(projection.treasuryReserveTarget).toBe(0);
    expect(projection.weeklyUpkeepPaid).toBe(0);
    expect(projection.weeklyInvestment).toBe(0);
    expect(projection.weeklyEmpireTransfer).toBe(projection.weeklyIncome);
    processCommanderForcesV2(state, WORLD_CONTENT_V2);
    expect(state.players[playerId]!.treasury).toBe(empireTreasuryBefore);
    expect(force.economy.treasury).toBe(0);
  });

  it('freezes account trait progression into the canonical force snapshot', () => {
    const state = createWorldStateV2(21_011, WORLD_CONTENT_V2);
    const playerId = state.humanPlayerId;
    expect(initializeCommanderForceV2(state, WORLD_CONTENT_V2, playerId, {
      ...commanderProfile,
      countryTraitScale: 0.35,
    }).accepted).toBe(true);
    expect(traitNationContextV2(state, playerId).humanTraitMultiplier).toBe(0.35);

    const loaded = loadSaveV2(createSaveV2(state, WORLD_CONTENT_V2), WORLD_CONTENT_V2);
    expect(loaded.commanderForces[playerId]?.countryTraitScale).toBe(0.35);
    expect(traitNationContextV2(loaded, playerId).humanTraitMultiplier).toBe(0.35);
  });

  it('rejects retired manual deployment commands without mutating the timeline', () => {
    const { engine, playerId } = createGlobalSurvivalCommander(21_002);
    const destinationId = engine.content.territoryIds.find((territoryId) => (
      engine.state.territories[territoryId]?.owner === playerId
        && territoryId !== engine.state.commanderForces[playerId]!.locationId
    ))!;
    const before = structuredClone(engine.state.commanderForces[playerId]);
    const sequence = engine.state.actionSequence;
    expect(engine.commanderOrderTerms(playerId, destinationId, 'standby', null)).toMatchObject({
      allowed: false,
      reason: APEX_AUTONOMY_COMMAND_REASON_V2,
      treasuryCost: 0,
    });
    expect(engine.issueCommanderOrder(playerId, destinationId, 'standby', null)).toEqual({
      accepted: false,
      reason: APEX_AUTONOMY_COMMAND_REASON_V2,
    });
    expect(engine.state.commanderForces[playerId]).toEqual(before);
    expect(engine.state.actionSequence).toBe(sequence);
  });

  it('rejects enemy destinations and friendly enclaves behind an enemy corridor', () => {
    const state = createWorldStateV2(21_015, WORLD_CONTENT_V2);
    const playerId = state.humanPlayerId;
    expect(initializeCommanderForceV2(
      state, WORLD_CONTENT_V2, playerId, commanderProfile,
    ).accepted).toBe(true);
    const sourceId = state.commanderForces[playerId]!.locationId;
    const directTargets = new Set(
      WORLD_CONTENT_V2.territories[sourceId]!.connections.map((edge) => edge.targetId),
    );
    const chain = WORLD_CONTENT_V2.territories[sourceId]!.connections
      .flatMap((firstEdge) => (
        WORLD_CONTENT_V2.territories[firstEdge.targetId]?.connections
          .filter((secondEdge) => secondEdge.targetId !== sourceId
            && !directTargets.has(secondEdge.targetId))
          .map((secondEdge) => ({
            middleId: firstEdge.targetId,
            destinationId: secondEdge.targetId,
          })) ?? []
      ))[0];
    expect(chain).toBeDefined();
    const { middleId, destinationId } = chain!;

    expect(issueCommanderOrderV2(
      state, WORLD_CONTENT_V2, playerId, destinationId, 'standby', null,
    )).toMatchObject({ accepted: false });

    for (const [territoryId, territory] of Object.entries(state.territories)) {
      if (territoryId !== sourceId) territory.owner = ROGUE_AI_NATION_ID_V2;
    }
    state.territories[destinationId]!.owner = playerId;
    expect(selectCommanderRouteV2(
      state, WORLD_CONTENT_V2, playerId, sourceId, destinationId,
    )).toBeUndefined();
    expect(issueCommanderOrderV2(
      state, WORLD_CONTENT_V2, playerId, destinationId, 'standby', null,
    )).toEqual({ accepted: false, reason: APEX_AUTONOMY_COMMAND_REASON_V2 });

    state.territories[middleId]!.owner = playerId;
    expect(selectCommanderRouteV2(
      state, WORLD_CONTENT_V2, playerId, sourceId, destinationId,
    )).toMatchObject({ path: [sourceId, middleId, destinationId] });
    expect(issueCommanderOrderV2(
      state, WORLD_CONTENT_V2, playerId, destinationId, 'standby', null,
    )).toEqual({ accepted: false, reason: APEX_AUTONOMY_COMMAND_REASON_V2 });
  });

  it('cancels an autonomous deployment when its friendly corridor falls, including on save load', () => {
    const { engine, playerId } = createGlobalSurvivalCommander(21_016);
    const force = engine.state.commanderForces[playerId]!;
    const route = engine.content.territoryIds
      .map((territoryId) => selectCommanderRouteV2(
        engine.state, engine.content, playerId, force.locationId, territoryId,
      ))
      .find((candidate) => candidate && candidate.path.length >= 3);
    expect(route).toBeDefined();
    force.transit = {
      path: [...route!.path],
      distanceKm: route!.distanceKm,
      departTick: engine.state.tick,
      arriveTick: engine.state.tick + 5,
    };
    force.orderSource = 'autonomous';
    force.manualHoldUntilTick = engine.state.tick + COMMANDER_MANUAL_IDLE_GRACE_TICKS_V2;
    expect(force.transit?.path).toEqual(route!.path);
    const treasuryAfterDeparture = force.economy.treasury;
    const supplyAfterDeparture = force.economy.supplyStock;
    const departureId = force.locationId;
    const fallenCorridorId = force.transit!.path[1]!;
    const preCollapseSave = structuredClone(
      createSaveV2(engine.state, engine.content),
    ) as Record<string, any>;
    engine.state.territories[fallenCorridorId]!.owner = ROGUE_AI_NATION_ID_V2;
    markSurvivalScorchedTerritoryV2(engine.state, engine.content, fallenCorridorId);
    synchronizeArmyCapacityV2(engine.state, engine.content);

    preCollapseSave.territories = structuredClone(engine.state.territories);
    preCollapseSave.runProgression = structuredClone(engine.state.runProgression);
    preCollapseSave.firstIntegrationDiscountUsedBy = [
      ...engine.state.firstIntegrationDiscountUsedBy,
    ];
    preCollapseSave.canonicalStateHash = canonicalStateHashV2(preCollapseSave);
    const loaded = loadSaveV2(
      preCollapseSave as never, engine.content,
    );
    expect(loaded.commanderForces[playerId]).toMatchObject({
      locationId: departureId,
      transit: null,
      mission: 'standby',
      orderSource: 'autonomous',
      manualHoldUntilTick: 0,
      front: null,
    });
    assertInvariantsV2(loaded, engine.content);

    expect(reconcileCommanderTerritorialAccessV2(
      engine.state, engine.content, playerId,
    )).toBe(true);
    expect(engine.state.commanderForces[playerId]).toMatchObject({
      locationId: departureId,
      transit: null,
      mission: 'standby',
      orderSource: 'autonomous',
      manualHoldUntilTick: 0,
      front: null,
    });
    expect(force.economy.treasury).toBe(treasuryAfterDeparture);
    expect(force.economy.supplyStock).toBe(supplyAfterDeparture);
    assertInvariantsV2(engine.state, engine.content);
  });

  it('normalizes a captured legacy station to the empire compatibility anchor', () => {
    const { engine, playerId } = createGlobalSurvivalCommander(21_017);
    const force = engine.state.commanderForces[playerId]!;
    const capitalId = engine.state.players[playerId]!.capitalId;
    const exposedStationId = engine.content.territoryIds.find((territoryId) => (
      territoryId !== capitalId && engine.state.territories[territoryId]?.owner === playerId
    ))!;
    force.locationId = exposedStationId;
    engine.state.territories[exposedStationId]!.owner = ROGUE_AI_NATION_ID_V2;
    engine.state.territories[exposedStationId]!.coreOwner = ROGUE_AI_NATION_ID_V2;
    engine.state.territories[exposedStationId]!.integration = 1;
    engine.state.territories[exposedStationId]!.integrationProgram = null;
    markSurvivalScorchedTerritoryV2(engine.state, engine.content, exposedStationId);
    synchronizeArmyCapacityV2(engine.state, engine.content);

    expect(reconcileCommanderTerritorialAccessV2(
      engine.state, engine.content, playerId,
    )).toBe(true);
    expect(engine.state.commanderForces[playerId]).toMatchObject({
      locationId: capitalId,
      mission: 'standby',
      orderSource: 'autonomous',
      front: null,
      transit: null,
    });
    assertInvariantsV2(engine.state, engine.content);
    expect(engine.state.territories[capitalId]?.owner).toBe(playerId);
  });

  it('automatically supports an eligible front and records shield-integrity loss separately', () => {
    const state = createWorldStateV2(21_003, WORLD_CONTENT_V2);
    const belgium = nationIdV2('bel');
    const netherlands = nationIdV2('nld');
    const belTerritory = territoryIdV2('bel');
    const nldTerritory = territoryIdV2('nld');
    state.humanPlayerId = belgium;
    state.humanPlayerIds = [belgium];
    expect(initializeCommanderForceV2(
      state, WORLD_CONTENT_V2, belgium, commanderProfile,
    ).accepted).toBe(true);
    state.tick = 2;
    state.territories[nldTerritory]!.army.manpower = 0.20;
    state.territories[nldTerritory]!.army.capacity = 0.20;
    state.territories[belTerritory]!.army.manpower = 0.02;
    state.territories[belTerritory]!.army.capacity = 0.02;
    const operation = {
      commanderId: netherlands,
      sourceId: nldTerritory,
      targetId: belTerritory,
      doctrine: 'pressure' as const,
      access: 'land' as const,
      startedTick: 0,
      lastBattleTick: 0,
      holdUntilTick: 0,
      momentum: 0,
    };
    const war = {
      id: 'war-commander-defense',
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
    expect(selectCommanderBattleSupportV2(
      state, war, operation, WORLD_CONTENT_V2,
    ).defender).not.toBeNull();
    processCommanderForcesV2(state, WORLD_CONTENT_V2);
    expect(state.commanderForces[belgium]).toMatchObject({
      mission: 'standby',
      front: null,
    });
    const integrityBefore = state.commanderForces[belgium]!.shield.integrity;

    const event = resolveBattlePulseV2(state, WORLD_CONTENT_V2, war, operation)!;
    expect(event.commanderDefenderId).toBe(belgium);
    expect(event.commanderDefenderPower).toBeGreaterThan(0);
    expect(event.commanderDefenderSupplySpent).toBe(0);
    expect(event.commanderDefenderLosses).toBeGreaterThan(0);
    expect(event.defenderLosses).toBeCloseTo(event.regularDefenderLosses, 5);
    expect(state.commanderForces[belgium]!.shield.integrity).toBeLessThan(integrityBefore);
  });

  it('uses the same neural shield allocation while APEX supports an attacking front', () => {
    const state = createWorldStateV2(21_003_1, WORLD_CONTENT_V2);
    const belgium = nationIdV2('bel');
    const netherlands = nationIdV2('nld');
    const belTerritory = territoryIdV2('bel');
    const nldTerritory = territoryIdV2('nld');
    state.humanPlayerId = belgium;
    state.humanPlayerIds = [belgium];
    expect(initializeCommanderForceV2(
      state, WORLD_CONTENT_V2, belgium, commanderProfile,
    ).accepted).toBe(true);
    state.tick = 2;
    state.territories[belTerritory]!.army.manpower = 0.20;
    state.territories[belTerritory]!.army.capacity = 0.20;
    state.territories[nldTerritory]!.army.manpower = 0.20;
    state.territories[nldTerritory]!.army.capacity = 0.20;
    const operation = testOperation(belgium, belTerritory, nldTerritory);
    const war = testWar('war-commander-assault-shield', belgium, netherlands, operation);
    state.wars.push(war);
    processCommanderForcesV2(state, WORLD_CONTENT_V2);
    const force = state.commanderForces[belgium]!;
    const integrityBefore = force.shield.integrity;
    const supplyBefore = force.economy.supplyStock;
    const unsupportedState = structuredClone(state);
    delete unsupportedState.commanderForces[belgium];
    const unsupportedWar = unsupportedState.wars.find((candidate) => candidate.id === war.id)!;
    const unsupportedOperation = unsupportedWar.attackerOperations[0]!;
    const unsupportedEvent = resolveBattlePulseV2(
      unsupportedState,
      WORLD_CONTENT_V2,
      unsupportedWar,
      unsupportedOperation,
    )!;

    const event = resolveBattlePulseV2(state, WORLD_CONTENT_V2, war, operation)!;

    expect(event.commanderAttackerId).toBe(belgium);
    expect(event.commanderAttackerPower).toBeGreaterThan(0);
    expect(event.attackerPower).toBeGreaterThan(unsupportedEvent.attackerPower);
    expect(event.defenderLosses).toBeGreaterThan(unsupportedEvent.defenderLosses);
    expect(event.commanderAttackerLosses).toBeGreaterThan(0);
    // The dome intercepts only half of the already-capped post-DEF hit. The
    // national formation must therefore still take damage, just less than the
    // identical unsupported assault.
    expect(event.regularAttackerLosses).toBeGreaterThan(0);
    expect(event.regularAttackerLosses).toBeLessThan(unsupportedEvent.regularAttackerLosses);
    expect(event.attackerLosses).toBeCloseTo(event.regularAttackerLosses, 5);
    expect(force.shield.integrity).toBeLessThan(integrityBefore);
    expect(force.economy.supplyStock).toBe(supplyBefore);
  });

  it('extracts at true zero and cannot shield a later pulse', () => {
    const state = createWorldStateV2(21_003_2, WORLD_CONTENT_V2);
    const belgium = nationIdV2('bel');
    const netherlands = nationIdV2('nld');
    const belTerritory = territoryIdV2('bel');
    const nldTerritory = territoryIdV2('nld');
    state.humanPlayerId = belgium;
    state.humanPlayerIds = [belgium];
    expect(initializeCommanderForceV2(
      state, WORLD_CONTENT_V2, belgium, commanderProfile,
    ).accepted).toBe(true);
    state.tick = 2;
    state.territories[nldTerritory]!.army.manpower = 2;
    state.territories[nldTerritory]!.army.capacity = 2;
    state.territories[belTerritory]!.army.manpower = 0.20;
    state.territories[belTerritory]!.army.capacity = 0.20;
    const operation = testOperation(netherlands, nldTerritory, belTerritory);
    const war = testWar('war-commander-shield-retreat', netherlands, belgium, operation);
    state.wars.push(war);
    processCommanderForcesV2(state, WORLD_CONTENT_V2);
    const force = state.commanderForces[belgium]!;
    force.shield.integrity = force.shield.maxIntegrity * 0.20;
    const reserveEnergyBefore = force.shield.rechargeBuffer;
    const supplyBefore = force.economy.supplyStock;

    const event = resolveBattlePulseV2(state, WORLD_CONTENT_V2, war, operation)!;

    expect(event.commanderDefenderLosses).toBeGreaterThan(0);
    expect(event.commanderDefenderLosses)
      .toBeLessThanOrEqual(force.shield.maxIntegrity * 0.20 + 1e-9);
    expect(force.shield.integrity).toBe(0);
    expect(force.shield.rechargeBuffer).toBe(reserveEnergyBefore);
    expect(force.economy.supplyStock).toBe(supplyBefore);
    expect(force).toMatchObject({ mission: 'hq-training', front: null, transit: null });
    expect(selectCommanderBattleSupportV2(
      state, war, operation, WORLD_CONTENT_V2,
    ).defender).toBeNull();
  });

  it('cannot create a stalemate: repeated hits drain the finite dome, force retreat and capture', () => {
    const state = createWorldStateV2(21_003_3, WORLD_CONTENT_V2);
    const belgium = nationIdV2('bel');
    const netherlands = nationIdV2('nld');
    const belTerritory = territoryIdV2('bel');
    const nldTerritory = territoryIdV2('nld');
    state.humanPlayerId = belgium;
    state.humanPlayerIds = [belgium];
    expect(initializeCommanderForceV2(state, WORLD_CONTENT_V2, belgium, {
      ...commanderProfile,
      shield: {
        ...commanderProfile.shield,
        integrity: 0.00048,
        maxIntegrity: 0.0009,
        rechargeBuffer: 0,
      },
      attackMultiplier: 2.5,
      defenseMultiplier: 2.5,
      supplyStock: 0.006,
    }).accepted).toBe(true);
    state.tick = 2;
    state.territories[nldTerritory]!.army.manpower = 0.20;
    state.territories[nldTerritory]!.army.capacity = 0.20;
    state.territories[belTerritory]!.army.manpower = 0.05;
    state.territories[belTerritory]!.army.capacity = 0.05;
    const operation = testOperation(netherlands, nldTerritory, belTerritory);
    const war = testWar('war-finite-apex-shield', netherlands, belgium, operation);
    state.wars.push(war);
    processCommanderForcesV2(state, WORLD_CONTENT_V2);
    const force = state.commanderForces[belgium]!;
    const openingSupply = force.economy.supplyStock;
    let shieldedPulses = 0;
    let unshieldedNationalLosses = 0;
    let conquered = false;

    for (let pulse = 0; pulse < 24 && !conquered; pulse += 1) {
      state.tick += 2;
      const event = resolveBattlePulseV2(state, WORLD_CONTENT_V2, war, operation);
      if (!event) break;
      if (event.commanderDefenderId === belgium) shieldedPulses += 1;
      else unshieldedNationalLosses += event.regularDefenderLosses;
      conquered = event.conquered;
    }

    expect(shieldedPulses).toBeGreaterThan(0);
    expect(force.economy.supplyStock).toBe(openingSupply);
    expect(force.shield.integrity).toBe(0);
    expect(force.front).toBeNull();
    expect(unshieldedNationalLosses).toBeGreaterThan(0);
    expect(conquered).toBe(true);
    expect(state.tick).toBeLessThan(260);
  });

  it('restores exactly 20% Energy only when Emergency Reboot catches a collapse', () => {
    const makeForce = (fieldHospital: boolean) => {
      const state = createWorldStateV2(fieldHospital ? 21_003_4 : 21_003_5, WORLD_CONTENT_V2);
      const belgium = nationIdV2('bel');
      state.humanPlayerId = belgium;
      state.humanPlayerIds = [belgium];
      expect(initializeCommanderForceV2(state, WORLD_CONTENT_V2, belgium, {
        ...commanderProfile,
        shield: { ...commanderProfile.shield, rechargeBuffer: 0 },
        capabilities: {
          mobileHeadquarters: false,
          fieldHospital,
          rapidResponse: false,
          assaultSpecialist: false,
          defenseSpecialist: false,
          emergencyExtractionCharges: 0,
        },
      }).accepted).toBe(true);
      return { state, belgium, force: state.commanderForces[belgium]! };
    };
    const baseline = makeForce(false);
    const hospital = makeForce(true);

    const baselineLosses = applyCommanderCasualtiesV2(
      baseline.state, baseline.belgium, 1,
    );
    const hospitalLosses = applyCommanderCasualtiesV2(
      hospital.state, hospital.belgium, 1,
    );

    expect(baselineLosses).toBe(commanderProfile.shield.integrity);
    expect(hospitalLosses).toBe(baselineLosses);
    expect(baseline.force.shield.integrity).toBe(0);
    expect(baseline.force.mission).toBe('hq-training');
    expect(hospital.force.shield.integrity)
      .toBe(hospital.force.shield.maxIntegrity * 0.20);
    expect(hospital.force.shield.rechargeBuffer).toBe(0);
    expect(hospital.force.doctrineRuntime?.emergencyRebootUsed).toBe(true);
    expect(hospital.force.mission).toBe('standby');
  });

  it('consumes Emergency Reboot once, then requires a complete node recharge', () => {
    const state = createWorldStateV2(21_003_6, WORLD_CONTENT_V2);
    const belgium = nationIdV2('bel');
    state.humanPlayerId = belgium;
    state.humanPlayerIds = [belgium];
    expect(initializeCommanderForceV2(state, WORLD_CONTENT_V2, belgium, {
      ...commanderProfile,
      shield: {
        ...commanderProfile.shield,
        integrity: 0.00048,
        maxIntegrity: 0.0009,
        rechargeBuffer: 0.0001,
      },
      capabilities: { fieldHospital: true },
    }).accepted).toBe(true);
    const force = state.commanderForces[belgium]!;

    expect(applyCommanderCasualtiesV2(state, belgium, 1)).toBe(0.00048);
    expect(force.shield.integrity).toBe(force.shield.maxIntegrity * 0.20);
    expect(force.doctrineRuntime?.emergencyRebootUsed).toBe(true);
    expect(force.mission).toBe('standby');

    expect(applyCommanderCasualtiesV2(state, belgium, 1))
      .toBe(force.shield.maxIntegrity * 0.20);
    expect(force.shield.integrity).toBe(0);
    expect(force.mission).toBe('hq-training');
    force.shield.integrity = force.shield.maxIntegrity * 0.999;
    force.shield.rechargeBuffer = force.shield.maxIntegrity * 0.01;
    expect(selectApexShieldPresentationV2(state, belgium)?.operationalState)
      .toBe('recharging');
    processCommanderForcesV2(state, WORLD_CONTENT_V2);
    expect(force.shield.integrity).toBe(force.shield.maxIntegrity);
    expect(force.mission).toBe('standby');
  });

  it('collapses into Energy recovery without creating an APEX personnel army', () => {
    const state = createWorldStateV2(21_003_8, WORLD_CONTENT_V2);
    const belgium = nationIdV2('bel');
    state.humanPlayerId = belgium;
    state.humanPlayerIds = [belgium];
    expect(initializeCommanderForceV2(state, WORLD_CONTENT_V2, belgium, {
      ...commanderProfile,
      shield: {
        ...commanderProfile.shield,
        integrity: 0.00048,
        maxIntegrity: 0.0009,
        rechargeBuffer: 0,
      },
    }).accepted).toBe(true);
    const force = state.commanderForces[belgium]!;
    force.mission = 'defense';
    force.front = {
      warId: 'lethal-front',
      sourceId: territoryIdV2('nld'),
      targetId: territoryIdV2('bel'),
    };

    expect(applyCommanderCasualtiesV2(state, belgium, 1)).toBeCloseTo(0.00048, 9);
    expect(force.shield.integrity).toBe(0);
    expect(force.shield.rechargeBuffer).toBe(0);
    expect(force).not.toHaveProperty('army');
    expect(force).toMatchObject({ mission: 'hq-training', front: null, transit: null });
    expect(selectCommanderBattleSupportV2(
      state,
      testWar(
        'lethal-front',
        nationIdV2('nld'),
        belgium,
        testOperation(nationIdV2('nld'), territoryIdV2('nld'), territoryIdV2('bel')),
      ),
      testOperation(nationIdV2('nld'), territoryIdV2('nld'), territoryIdV2('bel')),
      WORLD_CONTENT_V2,
    ).defender).toBeNull();
  });

  it('defends a threatened home front without persisting a local assignment', () => {
    const state = createWorldStateV2(21_006, WORLD_CONTENT_V2);
    const belgium = nationIdV2('bel');
    const netherlands = nationIdV2('nld');
    const belTerritory = territoryIdV2('bel');
    const nldTerritory = territoryIdV2('nld');
    state.humanPlayerId = belgium;
    state.humanPlayerIds = [belgium];
    expect(initializeCommanderForceV2(
      state, WORLD_CONTENT_V2, belgium, commanderProfile,
    ).accepted).toBe(true);
    state.tick = 2;
    state.territories[nldTerritory]!.army.manpower = 0.30;
    state.territories[belTerritory]!.army.manpower = 0.01;
    const operation = testOperation(netherlands, nldTerritory, belTerritory);
    state.wars.push(testWar('war-auto-defense', netherlands, belgium, operation));

    processCommanderForcesV2(state, WORLD_CONTENT_V2);

    expect(state.commanderForces[belgium]).toMatchObject({
      locationId: belTerritory,
      mission: 'standby',
      orderSource: 'autonomous',
      manualHoldUntilTick: 0,
      front: null,
    });
  });

  it('normalizes a legacy manual assignment into the global network', () => {
    const state = createWorldStateV2(21_007, WORLD_CONTENT_V2);
    const belgium = nationIdV2('bel');
    const netherlands = nationIdV2('nld');
    const france = nationIdV2('fra');
    const belTerritory = territoryIdV2('bel');
    const nldTerritory = territoryIdV2('nld');
    const fraTerritory = territoryIdV2('fra');
    state.humanPlayerId = belgium;
    state.humanPlayerIds = [belgium];
    expect(initializeCommanderForceV2(
      state, WORLD_CONTENT_V2, belgium, commanderProfile,
    ).accepted).toBe(true);
    state.tick = 20;
    state.territories[nldTerritory]!.army.manpower = 0.001;
    state.territories[fraTerritory]!.army.manpower = 0.60;
    state.territories[belTerritory]!.army.manpower = 0.10;
    const dutchOperation = testOperation(netherlands, nldTerritory, belTerritory);
    const frenchOperation = testOperation(france, fraTerritory, belTerritory);
    state.wars.push(
      testWar('war-dutch-front', netherlands, belgium, dutchOperation),
      testWar('war-french-front', france, belgium, frenchOperation),
    );
    const dutchFront = {
      warId: 'war-dutch-front', sourceId: nldTerritory, targetId: belTerritory,
    };
    const force = state.commanderForces[belgium]!;
    force.locationId = belTerritory;
    force.mission = 'defense';
    force.front = dutchFront;
    force.orderSource = 'manual';
    force.manualHoldUntilTick = state.tick + 1_000;

    processCommanderForcesV2(state, WORLD_CONTENT_V2);
    expect(state.commanderForces[belgium]).toMatchObject({
      mission: 'standby',
      orderSource: 'autonomous',
      front: null,
    });
    expect(force.manualHoldUntilTick).toBe(0);
  });

  it('supports an outgoing assault without a local supply assignment', () => {
    const state = createWorldStateV2(21_008, WORLD_CONTENT_V2);
    const belgium = nationIdV2('bel');
    const netherlands = nationIdV2('nld');
    const belTerritory = territoryIdV2('bel');
    const nldTerritory = territoryIdV2('nld');
    state.humanPlayerId = belgium;
    state.humanPlayerIds = [belgium];
    expect(initializeCommanderForceV2(
      state, WORLD_CONTENT_V2, belgium, commanderProfile,
    ).accepted).toBe(true);
    state.tick = 2;
    state.players[belgium]!.foodSecurity = 0;
    state.territories[belTerritory]!.army.manpower = 0.40;
    state.territories[nldTerritory]!.army.manpower = 0.02;
    const operation = testOperation(belgium, belTerritory, nldTerritory);
    state.wars.push(testWar('war-auto-logistics', belgium, netherlands, operation));

    processCommanderForcesV2(state, WORLD_CONTENT_V2);

    expect(state.commanderForces[belgium]).toMatchObject({
      mission: 'standby',
      orderSource: 'autonomous',
      front: null,
    });
  });

  it('keeps an outgoing assault in the distributed network', () => {
    const state = createWorldStateV2(21_009, WORLD_CONTENT_V2);
    const belgium = nationIdV2('bel');
    const netherlands = nationIdV2('nld');
    const belTerritory = territoryIdV2('bel');
    const nldTerritory = territoryIdV2('nld');
    state.humanPlayerId = belgium;
    state.humanPlayerIds = [belgium];
    expect(initializeCommanderForceV2(
      state, WORLD_CONTENT_V2, belgium, commanderProfile,
    ).accepted).toBe(true);
    state.tick = 2;
    state.players[belgium]!.foodSecurity = 1;
    state.territories[belTerritory]!.army.manpower = 0.40;
    state.territories[nldTerritory]!.army.manpower = 0.02;
    const operation = testOperation(belgium, belTerritory, nldTerritory);
    state.wars.push(testWar('war-auto-assault', belgium, netherlands, operation));

    processCommanderForcesV2(state, WORLD_CONTENT_V2);

    expect(state.commanderForces[belgium]).toMatchObject({
      mission: 'standby',
      orderSource: 'autonomous',
      front: null,
    });
  });

  it('reserves doctrine capstones for their unique mechanics without hidden ATK/DEF boosts', () => {
    const state = createWorldStateV2(21_012, WORLD_CONTENT_V2);
    const belgium = nationIdV2('bel');
    const netherlands = nationIdV2('nld');
    const belTerritory = territoryIdV2('bel');
    const luxTerritory = territoryIdV2('lux');
    const nldTerritory = territoryIdV2('nld');
    state.humanPlayerId = belgium;
    state.humanPlayerIds = [belgium];
    expect(initializeCommanderForceV2(state, WORLD_CONTENT_V2, belgium, {
      ...commanderProfile,
      capabilities: {
        mobileHeadquarters: false,
        fieldHospital: false,
        rapidResponse: false,
        assaultSpecialist: false,
        defenseSpecialist: true,
        emergencyExtractionCharges: 0,
      },
    }).accepted).toBe(true);
    const force = state.commanderForces[belgium]!;

    state.territories[luxTerritory]!.owner = belgium;
    force.locationId = luxTerritory;
    force.mission = 'hq-training';
    force.front = null;
    force.orderSource = 'autonomous';
    expect(force.mission).toBe('hq-training');
    reconcileCommanderForcesV2(state, WORLD_CONTENT_V2);
    expect(force.mission).toBe('hq-training');

    const assaultOperation = testOperation(belgium, belTerritory, nldTerritory);
    const assaultWar = testWar('war-specialist-assault', belgium, netherlands, assaultOperation);
    state.wars = [assaultWar];
    force.locationId = belTerritory;
    force.transit = null;
    force.mission = 'assault-support';
    force.front = {
      warId: assaultWar.id, sourceId: belTerritory, targetId: nldTerritory,
    };
    const assaultSupport = selectCommanderBattleSupportV2(
      state, assaultWar, assaultOperation, WORLD_CONTENT_V2,
    ).attacker!;
    expect(assaultSupport.attackMultiplier).toBe(commanderProfile.attackMultiplier);
    expect(assaultSupport.defenseMultiplier).toBe(commanderProfile.defenseMultiplier);
    expect(assaultSupport.singularityPulseCharged).toBe(false);
    expect(selectApexShieldPresentationV2(state, belgium)).toMatchObject({
      attackMultiplier: commanderProfile.attackMultiplier,
      defenseMultiplier: commanderProfile.defenseMultiplier,
    });

    const defenseOperation = testOperation(netherlands, nldTerritory, belTerritory);
    const defenseWar = testWar('war-specialist-defense', netherlands, belgium, defenseOperation);
    state.wars = [defenseWar];
    force.mission = 'defense';
    force.front = {
      warId: defenseWar.id, sourceId: nldTerritory, targetId: belTerritory,
    };
    const defenseSupport = selectCommanderBattleSupportV2(
      state, defenseWar, defenseOperation, WORLD_CONTENT_V2,
    ).defender!;
    expect(defenseSupport.attackMultiplier).toBe(commanderProfile.attackMultiplier);
    expect(defenseSupport.defenseMultiplier).toBe(commanderProfile.defenseMultiplier);
    expect(defenseSupport.mirrorMatrixEligible).toBe(true);
    expect(selectApexShieldPresentationV2(state, belgium)).toMatchObject({
      attackMultiplier: commanderProfile.attackMultiplier,
      defenseMultiplier: commanderProfile.defenseMultiplier,
    });

    const reservesBefore = force.shield.rechargeBuffer;
    expect(applyCommanderCasualtiesV2(state, belgium, 0.01)).toBeCloseTo(0.01, 9);
    expect(force.shield.rechargeBuffer).toBe(reservesBefore);
    expect(force.shield.integrity).toBeCloseTo(0.01, 9);

    expect(applyCommanderCasualtiesV2(state, belgium, 1)).toBeCloseTo(0.01, 9);
    expect(force.shield.integrity).toBe(0);
    expect(force.capabilities.emergencyExtractionCharges).toBe(0);
    expect(force.locationId).toBe(state.players[belgium]!.capitalId);
    expect(force).toMatchObject({ mission: 'hq-training', front: null, transit: null });
  });

  it('publishes a simulation-backed dome-rating comparison against ordinary nations', () => {
    const comparison = commanderEliteComparisonForRatingsV2(
      WORLD_CONTENT_V2, 82, 90,
    );
    expect(comparison.benchmarkNationCount).toBe(
      WORLD_CONTENT_V2.nationIds.length - 1,
    );
    expect(comparison.attackRatio).toBeGreaterThanOrEqual(14);
    expect(comparison.attackRatio).toBeLessThanOrEqual(20);
    expect(comparison.defenseRatio).toBeGreaterThanOrEqual(14);
    expect(comparison.defenseRatio).toBeLessThanOrEqual(20);
    expect(comparison.qualityTier).toBe('apex-elite');
    expect(comparison.qualityLabel).toBe('APEX DOME');
    expect(comparison.attack).toBe(82);
    expect(comparison.defense).toBe(90);
  });

  it('keeps all network forecasts instant while Projection Relay accelerates recharge', () => {
    const { engine, playerId } = createGlobalSurvivalCommander(21_017);
    const force = engine.state.commanderForces[playerId]!;
    const regularQuotes = engine.content.territoryIds.map((territoryId) => ({
      territoryId,
      mobility: selectCommanderForecastMobilityV2(
        engine.state, engine.content, playerId, territoryId,
      ),
    }));
    force.capabilities.forceMultiplier = true;
    const twinQuotes = engine.content.territoryIds.map((territoryId) => ({
      territoryId,
      mobility: selectCommanderForecastMobilityV2(
        engine.state, engine.content, playerId, territoryId,
      ),
    }));
    expect(twinQuotes.map((entry) => entry.mobility.etaWeeks))
      .toEqual(regularQuotes.map((entry) => entry.mobility.etaWeeks));
    force.capabilities.forceMultiplier = false;
    force.capabilities.mobileHeadquarters = true;
    const acceleratedQuotes = engine.content.territoryIds.map((territoryId) => ({
      territoryId,
      mobility: selectCommanderForecastMobilityV2(
        engine.state, engine.content, playerId, territoryId,
      ),
    }));
    const acceleratedByDestination = new Map(acceleratedQuotes.map((entry) => [
      entry.territoryId, entry.mobility,
    ]));
    const improved = regularQuotes.find((regular) => {
      const accelerated = acceleratedByDestination.get(regular.territoryId);
      return regular.mobility.etaWeeks !== null && accelerated?.etaWeeks !== null
        && accelerated.etaWeeks < regular.mobility.etaWeeks;
    });
    expect(improved).toBeUndefined();

    const trainingState = createWorldStateV2(21_018, WORLD_CONTENT_V2);
    const trainingPlayer = trainingState.humanPlayerId;
    expect(initializeCommanderForceV2(trainingState, WORLD_CONTENT_V2, trainingPlayer, {
      ...commanderProfile,
      treasury: 0,
      annualOutput: 0,
      capabilities: { mobileHeadquarters: true },
    }).accepted).toBe(true);
    const trainingForce = trainingState.commanderForces[trainingPlayer]!;
    trainingForce.mission = 'hq-training';
    const activeBefore = trainingForce.shield.integrity;
    const reservesBefore = trainingForce.shield.rechargeBuffer;
    const freeCapacity = selectCommanderEconomyProjectionV2(
      trainingState,
      trainingPlayer,
    )!.trainedReserveGain;
    processCommanderForcesV2(trainingState, WORLD_CONTENT_V2);
    const mobileHqTransfer = trainingForce.shield.maxIntegrity
      * COMMANDER_HQ_TRANSFER_CAPACITY_SHARE_V2 * 1.75;
    expect(trainingForce.shield.integrity - activeBefore)
      .toBeCloseTo(mobileHqTransfer, 9);
    expect(reservesBefore + freeCapacity - trainingForce.shield.rechargeBuffer)
      .toBeCloseTo(mobileHqTransfer, 9);
  });

  it('defends developing threats with or without the Omnipresence Grid capability', () => {
    const threatenedState = (forceMultiplier: boolean) => {
      const state = createWorldStateV2(21_013, WORLD_CONTENT_V2);
      const belgium = nationIdV2('bel');
      const netherlands = nationIdV2('nld');
      const belTerritory = territoryIdV2('bel');
      const nldTerritory = territoryIdV2('nld');
      state.humanPlayerId = belgium;
      state.humanPlayerIds = [belgium];
      initializeCommanderForceV2(state, WORLD_CONTENT_V2, belgium, {
        ...commanderProfile,
        capabilities: { forceMultiplier },
      });
      state.tick = 2;
      state.players[belgium]!.foodSecurity = 1;
      state.territories[belTerritory]!.army = {
        ...state.territories[belTerritory]!.army,
        manpower: 0.1, capacity: 0.1, baseAttack: 1, baseDefense: 1,
      };
      state.territories[nldTerritory]!.army = {
        ...state.territories[nldTerritory]!.army,
        manpower: 0.6, capacity: 0.6, baseAttack: 0.1, baseDefense: 1,
      };
      const operation = testOperation(netherlands, nldTerritory, belTerritory);
      state.wars.push(testWar('war-developing-threat', netherlands, belgium, operation));
      processCommanderForcesV2(state, WORLD_CONTENT_V2);
      return state.commanderForces[belgium]!;
    };

    for (const force of [threatenedState(false), threatenedState(true)]) {
      expect(force).toMatchObject({
        mission: 'standby',
        orderSource: 'autonomous',
        front: null,
      });
    }
  });

  it('authenticates the pre-APEX V2.67 shape before adding an empty force record', () => {
    const original = createWorldStateV2(21_004, WORLD_CONTENT_V2);
    const humanId = original.humanPlayerId;
    const manpowerBefore = Object.values(original.territories)
      .filter((territory) => territory.owner === humanId)
      .reduce((sum, territory) => sum + territory.army.manpower, 0);
    const legacy = structuredClone(createSaveV2(original, WORLD_CONTENT_V2)) as Record<string, any>;
    delete legacy.commanderForces;
    delete legacy.runProgression;
    legacy.rulesVersion = 'frontier-command-v2.67-survival-rebalance';
    legacy.canonicalStateHash = canonicalStateHashV2(legacy);

    const loaded = loadSaveV2(legacy as never, WORLD_CONTENT_V2);
    expect(loaded.rulesVersion).toBe(V2_RULES_VERSION);
    expect(loaded.commanderForces).toEqual({});
    expect(Object.values(loaded.territories)
      .filter((territory) => territory.owner === humanId)
      .reduce((sum, territory) => sum + territory.army.manpower, 0)).toBeCloseTo(manpowerBefore, 9);
  });

  it('authenticates V2.68 Commander missions before adding autonomy metadata', () => {
    const state = createWorldStateV2(21_010, WORLD_CONTENT_V2);
    const belgium = nationIdV2('bel');
    const netherlands = nationIdV2('nld');
    const belTerritory = territoryIdV2('bel');
    const nldTerritory = territoryIdV2('nld');
    state.humanPlayerId = belgium;
    state.humanPlayerIds = [belgium];
    expect(initializeCommanderForceV2(
      state, WORLD_CONTENT_V2, belgium, commanderProfile,
    ).accepted).toBe(true);
    state.tick = 7;
    const operation = testOperation(netherlands, nldTerritory, belTerritory);
    state.wars.push(testWar('war-legacy-commander', netherlands, belgium, operation));
    const front = {
      warId: 'war-legacy-commander', sourceId: nldTerritory, targetId: belTerritory,
    };
    state.commanderForces[belgium]!.mission = 'defense';
    state.commanderForces[belgium]!.front = front;
    const legacy = structuredClone(createSaveV2(state, WORLD_CONTENT_V2)) as Record<string, any>;
    delete legacy.runProgression;
    delete legacy.commanderForces[belgium].countryTraitScale;
    delete legacy.commanderForces[belgium].capabilities;
    delete legacy.commanderForces[belgium].orderSource;
    delete legacy.commanderForces[belgium].manualHoldUntilTick;
    legacy.rulesVersion = 'frontier-command-v2.68-commander-corps';
    legacy.canonicalStateHash = canonicalStateHashV2(legacy);

    const loaded = loadSaveV2(legacy as never, WORLD_CONTENT_V2);

    expect(loaded.rulesVersion).toBe(V2_RULES_VERSION);
    expect(loaded.commanderForces[belgium]).toMatchObject({
      countryTraitScale: 1,
      capabilities: {
        mobileHeadquarters: false,
        fieldHospital: false,
        rapidResponse: false,
        assaultSpecialist: false,
        defenseSpecialist: false,
        emergencyExtractionCharges: 0,
      },
      mission: 'standby',
      orderSource: 'autonomous',
      manualHoldUntilTick: 0,
      front: null,
    });
  });

  it('migrates V2.69 traits and V2.70 doctrine capabilities without rewriting history', () => {
    const state = createWorldStateV2(21_014, WORLD_CONTENT_V2);
    const belgium = state.humanPlayerId;
    expect(initializeCommanderForceV2(state, WORLD_CONTENT_V2, belgium, {
      ...commanderProfile,
      countryTraitScale: 0.4,
      capabilities: { fieldHospital: true, emergencyExtractionCharges: 2 },
    }).accepted).toBe(true);

    const v269 = structuredClone(createSaveV2(state, WORLD_CONTENT_V2)) as Record<string, any>;
    delete v269.runProgression;
    delete v269.commanderForces[belgium].countryTraitScale;
    delete v269.commanderForces[belgium].capabilities;
    v269.rulesVersion = 'frontier-command-v2.69-commander-autonomy';
    v269.canonicalStateHash = canonicalStateHashV2(v269);
    expect(loadSaveV2(v269 as never, WORLD_CONTENT_V2).commanderForces[belgium])
      .toMatchObject({
        countryTraitScale: 1,
        capabilities: { fieldHospital: false, emergencyExtractionCharges: 0 },
      });

    const v270 = structuredClone(createSaveV2(state, WORLD_CONTENT_V2)) as Record<string, any>;
    delete v270.runProgression;
    delete v270.commanderForces[belgium].capabilities;
    v270.rulesVersion = 'frontier-command-v2.70-meta-traits';
    v270.canonicalStateHash = canonicalStateHashV2(v270);
    expect(loadSaveV2(v270 as never, WORLD_CONTENT_V2).commanderForces[belgium])
      .toMatchObject({
        countryTraitScale: 0.4,
        capabilities: {
          mobileHeadquarters: false,
          fieldHospital: false,
          rapidResponse: false,
          assaultSpecialist: false,
          defenseSpecialist: false,
          emergencyExtractionCharges: 0,
        },
      });
  });

  it('rejects current saves that omit canonical Commander doctrine state', () => {
    const state = createWorldStateV2(21_015, WORLD_CONTENT_V2);
    const belgium = state.humanPlayerId;
    initializeCommanderForceV2(state, WORLD_CONTENT_V2, belgium, commanderProfile);
    const malformed = structuredClone(createSaveV2(state, WORLD_CONTENT_V2)) as Record<string, any>;
    delete malformed.commanderForces[belgium].capabilities;
    malformed.canonicalStateHash = canonicalStateHashV2(malformed);
    expect(() => loadSaveV2(malformed as never, WORLD_CONTENT_V2))
      .toThrow(/Commander force .* invalid canonical state/i);
  });

  it('requires the Commander-force root key in current authenticated saves', () => {
    const malformed = structuredClone(createSaveV2(
      createWorldStateV2(21_005, WORLD_CONTENT_V2), WORLD_CONTENT_V2,
    )) as Record<string, any>;
    delete malformed.commanderForces;
    malformed.canonicalStateHash = canonicalStateHashV2(malformed);
    expect(() => loadSaveV2(malformed as never, WORLD_CONTENT_V2))
      .toThrow(/missing or extra top-level keys/i);
  });
});
