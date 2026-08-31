import { describe, expect, it } from 'vitest';
import {
  commanderXpForLevelV1,
  countryMasteryXpForLevelV1,
  createCommanderProfileV1,
  emptyCommanderTalentsV1,
  normalizeCommanderProfileV1,
  type CommanderProfileV1,
  type CountryMasteryAllocationsV1,
} from '../meta/commanderProfile';
import { selectRegisteredCountryMasteryRuntimeV2 } from '../sim/v2/countryMasteryRuntime';
import {
  selectBestCoopFriendlyTransitRouteV2,
  survivalCoopUsesSovereignLogisticsV2,
} from '../sim/v2/coopAccess';
import { selectHumanEmpireDefeatWinnerV2 } from '../sim/v2/humanPlayers';
import { WORLD_CONTENT_V2, type WorldContentV2 } from '../sim/v2/content';
import { createSaveV2 } from '../sim/v2/persistence';
import { resolveScenarioV2 } from '../sim/v2/scenarios';
import { selectSurvivalDawnlineLeaderIdV2 } from '../sim/v2/survivalEmpire';
import { nationIdV2, type PlayerId } from '../sim/v2/types';
import { WorldEngineV2 } from '../sim/v2/WorldEngineV2';
import type {
  DirectConnectGuestHandlers,
  DirectConnectState,
} from './directConnect';
import {
  applyMultiplayerDeploymentsV1,
  createMultiplayerDeploymentSnapshotV1,
  registerMultiplayerDeploymentRuntimeV1,
  resolveSurvivalCoopSeatRolesV1,
} from './deployment';
import { GuestGameSession, type GuestSessionTransport } from './gameSession';
import type { MultiplayerDeploymentSnapshotV1, SnapshotMessage } from './protocol';
import {
  GUEST_RECONNECT_SESSION_STORAGE_KEY,
  loadGuestReconnectSessionV1,
  saveGuestReconnectSessionV1,
} from './reconnectStorage';

const EMPTY_MASTERY: CountryMasteryAllocationsV1 = {
  force: 0,
  firepower: 0,
  defense: 0,
  mobilization: 0,
  'land-logistics': 0,
  expeditionary: 0,
  'military-industry': 0,
  'field-medicine': 0,
};

class SnapshotGuestTransport implements GuestSessionTransport {
  readonly hostPeerId = 'host_deployment_test';
  readonly state: DirectConnectState = 'connected';
  private readonly handlers = new Set<DirectConnectGuestHandlers>();

  subscribe(handlers: DirectConnectGuestHandlers): () => void {
    this.handlers.add(handlers);
    return () => this.handlers.delete(handlers);
  }

  send(): void {}

  close(): void {
    this.handlers.clear();
  }
}

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

function isolatedCampaignContent(): WorldContentV2 {
  // A distinct WeakMap identity emulates another browser/process without
  // copying hundreds of megabytes of immutable world definitions.
  return Object.freeze({ ...WORLD_CONTENT_V2 });
}

function accountProfile(
  countryId: PlayerId,
  variant: 'vanguard' | 'bastion',
): CommanderProfileV1 {
  const level = variant === 'vanguard' ? 22 : 13;
  const masteryLevel = variant === 'vanguard' ? 9 : 6;
  const masteryAllocations: CountryMasteryAllocationsV1 = variant === 'vanguard'
    ? {
      ...EMPTY_MASTERY,
      force: 2,
      firepower: 2,
      defense: 1,
      mobilization: 1,
      'land-logistics': 1,
      'military-industry': 1,
    }
    : { ...EMPTY_MASTERY, force: 1, defense: 3, 'field-medicine': 1 };
  return normalizeCommanderProfileV1({
    ...createCommanderProfileV1(1, `profile-${countryId}`),
    commanderXp: commanderXpForLevelV1(level),
    commanderTalents: {
      ...emptyCommanderTalentsV1(),
      ...(variant === 'vanguard'
        ? {
          'science-corps': 5,
          'treasury-reserve': 4,
          'elite-vanguard': 3,
          'mobile-logistics': 5,
          'combat-recovery': 4,
        }
        : {
          'volunteer-brigade': 5,
          'civil-defense': 3,
          'doctrine-command': 1,
          'reserve-cadre': 3,
        }),
    },
    activeDoctrine: variant,
    unlockedCountryIds: [countryId],
    countryMastery: {
      [countryId]: {
        xp: countryMasteryXpForLevelV1(masteryLevel),
        level: masteryLevel,
        campaigns: 4,
        victories: 2,
        bestSurvivalWave: 0,
        allocations: masteryAllocations,
      },
    },
  }, 2);
}

function deploymentMap(): ReadonlyMap<PlayerId, MultiplayerDeploymentSnapshotV1> {
  const belgium = nationIdV2('bel');
  const netherlands = nationIdV2('nld');
  return new Map([
    [belgium, createMultiplayerDeploymentSnapshotV1(
      accountProfile(belgium, 'vanguard'), belgium,
    )],
    [netherlands, createMultiplayerDeploymentSnapshotV1(
      accountProfile(netherlands, 'bastion'), netherlands,
    )],
  ]);
}

function snapshotFrom(engine: WorldEngineV2): SnapshotMessage {
  const save = createSaveV2(engine.state, engine.content);
  return {
    type: 'snapshot',
    reason: 'join',
    tick: save.tick,
    hash: save.canonicalStateHash,
    nextClientSequence: 1,
    save,
  };
}

function expectFrozenSeatBuilds(
  engine: WorldEngineV2,
  deployments: ReadonlyMap<PlayerId, MultiplayerDeploymentSnapshotV1>,
): void {
  const belgium = nationIdV2('bel');
  const netherlands = nationIdV2('nld');
  const belgianDeployment = deployments.get(belgium)!;
  const dutchDeployment = deployments.get(netherlands)!;
  const belgianApex = engine.state.commanderForces[belgium]!;
  const dutchApex = engine.state.commanderForces[netherlands]!;

  expect(belgianApex.shield.attackMultiplier)
    .toBeCloseTo(belgianDeployment.apex.attackMultiplier, 12);
  expect(dutchApex.shield.attackMultiplier)
    .toBeCloseTo(dutchDeployment.apex.attackMultiplier, 12);
  expect(belgianApex.shield.defenseMultiplier)
    .toBeCloseTo(belgianDeployment.apex.defenseMultiplier, 12);
  expect(dutchApex.shield.defenseMultiplier)
    .toBeCloseTo(dutchDeployment.apex.defenseMultiplier, 12);
  expect(belgianApex.shield.maxIntegrity)
    .toBeCloseTo(belgianDeployment.apex.shield.maxIntegrity, 12);
  expect(dutchApex.shield.maxIntegrity)
    .toBeCloseTo(dutchDeployment.apex.shield.maxIntegrity, 12);
  expect(belgianApex.shield.pulseAttack)
    .toBeCloseTo(belgianDeployment.apex.shield.pulseAttack, 12);
  expect(dutchApex.shield.pulseAttack)
    .toBeCloseTo(dutchDeployment.apex.shield.pulseAttack, 12);
  expect(belgianApex.economy.annualOutput)
    .toBeCloseTo(belgianDeployment.apex.annualOutput, 12);
  expect(dutchApex.economy.annualOutput)
    .toBeCloseTo(dutchDeployment.apex.annualOutput, 12);
  expect(belgianApex.shield.attackMultiplier)
    .not.toBe(dutchApex.shield.attackMultiplier);
  expect(belgianApex.shield.defenseMultiplier)
    .not.toBe(dutchApex.shield.defenseMultiplier);
  expect(belgianApex.shield.maxIntegrity)
    .not.toBe(dutchApex.shield.maxIntegrity);
  expect(belgianApex.shield.pulseAttack)
    .not.toBe(dutchApex.shield.pulseAttack);
  expect(belgianApex.shield.pulseProjectionRetention)
    .not.toBe(dutchApex.shield.pulseProjectionRetention);
  expect(belgianApex.shield.interceptEfficiency)
    .not.toBe(dutchApex.shield.interceptEfficiency);
  const { openingArmyMultiplier: _belgianOpening, ...belgianRuntime }
    = belgianDeployment.countryMastery;
  const { openingArmyMultiplier: _dutchOpening, ...dutchRuntime }
    = dutchDeployment.countryMastery;
  expect(selectRegisteredCountryMasteryRuntimeV2(engine.content, belgium))
    .toEqual(belgianRuntime);
  expect(selectRegisteredCountryMasteryRuntimeV2(engine.content, netherlands))
    .toEqual(dutchRuntime);
  expect(belgianDeployment.countryMastery.attackMultiplier)
    .not.toBe(dutchDeployment.countryMastery.attackMultiplier);
  expect(belgianDeployment.countryMastery.defenseMultiplier)
    .not.toBe(dutchDeployment.countryMastery.defenseMultiplier);
  expect(belgianDeployment.countryMastery.armyCapacityMultiplier)
    .not.toBe(dutchDeployment.countryMastery.armyCapacityMultiplier);
}

describe('frozen multiplayer account deployment through session and reconnect', () => {
  it('applies two profiles before launch and restores the exact builds after a hard reload', () => {
    const belgium = nationIdV2('bel');
    const netherlands = nationIdV2('nld');
    const deployments = deploymentMap();
    const host = new WorldEngineV2(88_401, isolatedCampaignContent());
    expect(host.chooseCountry(belgium)).toEqual({ accepted: true });
    expect(host.configureHumanPlayers([belgium, netherlands], belgium))
      .toEqual({ accepted: true });
    expect(applyMultiplayerDeploymentsV1(host, deployments)).toEqual({ accepted: true });
    expectFrozenSeatBuilds(host, deployments);
    // A live LANCER charge is runtime state, not part of the immutable account
    // deployment. Authoritative snapshots and reconnect must still preserve it.
    host.state.commanderForces[belgium]!.doctrineRuntime!
      .lancerSupportedAssaultCount = 2;
    const reconnectTelemetry = {
      supportedBattles: 7,
      peakPower: 143.25,
      maxIntegrity: host.state.commanderForces[belgium]!.shield.maxIntegrity,
      integrityLosses: 0.00031,
      supplyDelivered: 0.0042,
      supplySpent: 0.0064,
      singularityPulses: 2,
      mirrorCounterpulseDamage: 0.0017,
      twinProjectionBattles: 3,
    };
    host.state.wars = [{
      id: 'war-apex-reconnect-ledger',
      attackerId: belgium,
      defenderId: nationIdV2('lux'),
      startedTick: 0,
      lastBattleTick: 0,
      warScore: 2,
      battles: 7,
      attackerLosses: 0.001,
      defenderLosses: 0.002,
      attackerCivilianLosses: 0,
      defenderCivilianLosses: 0,
      lastPeaceOfferTick: -1_000_000,
      attackerOperations: [],
      defenderOperations: [],
      revenge: null,
      apexTelemetryByPlayer: { [belgium]: reconnectTelemetry },
    }];

    const launchSnapshot = snapshotFrom(host);
    expect(launchSnapshot.save.wars[0]!.apexTelemetryByPlayer?.[belgium])
      .toEqual(reconnectTelemetry);
    const guestContent = isolatedCampaignContent();
    registerMultiplayerDeploymentRuntimeV1(guestContent, deployments);
    const guest = new GuestGameSession({
      transport: new SnapshotGuestTransport(),
      countryId: netherlands,
      seatCount: 2,
      humanPlayerIds: [belgium, netherlands],
      content: guestContent,
    });
    expect(guest.acceptSnapshot(launchSnapshot)).toEqual({ accepted: true });
    expectFrozenSeatBuilds(guest.engine as WorldEngineV2, deployments);
    expect((guest.engine as WorldEngineV2).state.commanderForces[belgium]!
      .doctrineRuntime?.lancerSupportedAssaultCount).toBe(2);
    expect((guest.engine as WorldEngineV2).state.wars[0]!
      .apexTelemetryByPlayer?.[belgium]).toEqual(reconnectTelemetry);

    const storage = new MemoryStorage();
    expect(saveGuestReconnectSessionV1(storage, {
      schemaVersion: 1,
      roomId: 'room-profile-reconnect',
      rulesVersion: 'rules-profile-reconnect',
      displayName: 'Dutch seat',
      credential: {
        sessionId: 'session-profile-reconnect',
        peerId: 'guest-profile-reconnect',
        rejoinToken: 'token-profile-reconnect',
      },
      scenario: { mode: 'standard-2026', version: 1, seed: 88_401 },
      countryId: netherlands,
      seatCount: 2,
      humanPlayerIds: [belgium, netherlands],
      controllerNames: [[belgium, 'Belgian seat'], [netherlands, 'Dutch seat']],
      deployments: [...deployments.values()],
      expiresAt: 50_000,
    })).toBe(true);
    expect(storage.getItem(GUEST_RECONNECT_SESSION_STORAGE_KEY)).not.toBeNull();
    const restored = loadGuestReconnectSessionV1(storage, 10_000)!;
    const restoredDeployments = new Map(restored.deployments.map((deployment) => [
      deployment.countryId, deployment,
    ] as const));
    const reloadContent = isolatedCampaignContent();
    registerMultiplayerDeploymentRuntimeV1(reloadContent, restoredDeployments);
    const reloadedGuest = new GuestGameSession({
      transport: new SnapshotGuestTransport(),
      countryId: netherlands,
      seatCount: restored.seatCount,
      humanPlayerIds: restored.humanPlayerIds as PlayerId[],
      content: reloadContent,
    });
    expect(reloadedGuest.acceptSnapshot({ ...launchSnapshot, reason: 'reconnect' }))
      .toEqual({ accepted: true });
    expectFrozenSeatBuilds(reloadedGuest.engine as WorldEngineV2, restoredDeployments);
    expect((reloadedGuest.engine as WorldEngineV2).state.commanderForces[belgium]!
      .doctrineRuntime?.lancerSupportedAssaultCount).toBe(2);
    expect((reloadedGuest.engine as WorldEngineV2).state.wars[0]!
      .apexTelemetryByPlayer?.[belgium]).toEqual(reconnectTelemetry);

    guest.close(false);
    reloadedGuest.close(false);
  });

  it('starts Survival as two sovereign commands allied with a separate NPC Dawnline', () => {
    const belgium = nationIdV2('bel');
    const netherlands = nationIdV2('nld');
    const scenario = resolveScenarioV2({ mode: 'survival', seed: 88_402 });
    const host = new WorldEngineV2(scenario.config.seed, scenario.content);
    expect(host.chooseCountry(belgium)).toEqual({ accepted: true });
    expect(host.configureHumanPlayers([belgium, netherlands], belgium))
      .toEqual({ accepted: true });
    const belgianTerritories = scenario.content.territoryIds.filter((territoryId) => (
      host.state.territories[territoryId]?.owner === belgium
    ));
    const dutchTerritories = scenario.content.territoryIds.filter((territoryId) => (
      host.state.territories[territoryId]?.owner === netherlands
    ));

    expect(applyMultiplayerDeploymentsV1(host, deploymentMap()))
      .toEqual({ accepted: true });

    expect(host.state.humanPlayerIds).toEqual([belgium, netherlands]);
    expect(resolveSurvivalCoopSeatRolesV1(host.state)).toEqual({
      hostCommanderId: belgium,
      alliedCommanderId: netherlands,
    });
    expect(host.state.players[belgium]).toBeDefined();
    expect(host.state.players[netherlands]).toBeDefined();
    const dawnlineLeader = selectSurvivalDawnlineLeaderIdV2(host.state);
    expect(dawnlineLeader).toBeDefined();
    expect(dawnlineLeader).not.toBe(netherlands);
    expect(dawnlineLeader).not.toBe(belgium);
    expect(host.state.alliances).toContainEqual({
      leftId: [belgium, dawnlineLeader!].sort()[0]!,
      rightId: [belgium, dawnlineLeader!].sort()[1]!,
      formedTick: 0,
    });
    expect(host.state.alliances).toContainEqual({
      leftId: [netherlands, dawnlineLeader!].sort()[0]!,
      rightId: [netherlands, dawnlineLeader!].sort()[1]!,
      formedTick: 0,
    });
    expect(host.state.commanderForces[belgium]).toBeDefined();
    expect(host.state.commanderForces[netherlands]).toBeDefined();
    expect(survivalCoopUsesSovereignLogisticsV2(host.state, scenario.content)).toBe(true);
    expect(selectBestCoopFriendlyTransitRouteV2(
      host.state,
      scenario.content,
      belgium,
      dutchTerritories[0]!,
    )).toBeUndefined();
    expect(belgianTerritories.every((territoryId) => (
      host.state.territories[territoryId]?.owner === belgium
    ))).toBe(true);
    expect(dutchTerritories.every((territoryId) => (
      host.state.territories[territoryId]?.owner === netherlands
    ))).toBe(true);
    const guestTerritories = Object.entries(host.state.territories)
      .filter(([, territory]) => territory.owner === netherlands);
    expect(guestTerritories).toHaveLength(dutchTerritories.length);
    expect(Object.values(host.state.territories).some((territory) => (
      territory.owner === belgium && territory.coreOwner === netherlands
    ))).toBe(false);

    const deployments = deploymentMap();
    const guestContent = Object.freeze({ ...scenario.content });
    registerMultiplayerDeploymentRuntimeV1(guestContent, deployments);
    const guest = new GuestGameSession({
      transport: new SnapshotGuestTransport(),
      countryId: netherlands,
      seatCount: 2,
      humanPlayerIds: [belgium, netherlands],
      content: guestContent,
    });
    expect(guest.acceptSnapshot({ ...snapshotFrom(host), reason: 'reconnect' }))
      .toEqual({ accepted: true });
    const replica = guest.engine as WorldEngineV2;
    expect(replica.viewerPlayerId).toBe(netherlands);
    expect(selectSurvivalDawnlineLeaderIdV2(replica.state)).toBe(dawnlineLeader);
    expect(replica.state.commanderForces[netherlands]).toBeDefined();
    expect(replica.state.alliances).toContainEqual({
      leftId: [netherlands, dawnlineLeader!].sort()[0]!,
      rightId: [netherlands, dawnlineLeader!].sort()[1]!,
      formedTick: 0,
    });
    guest.close(false);

    for (const territory of Object.values(host.state.territories)) {
      if (territory.owner === belgium) territory.army.manpower = 0;
    }
    host.state.players[belgium]!.trainedReserves = 0;
    expect(selectHumanEmpireDefeatWinnerV2(host.state)).toBeUndefined();
    for (const territory of Object.values(host.state.territories)) {
      if (territory.owner === netherlands) territory.army.manpower = 0;
    }
    host.state.players[netherlands]!.trainedReserves = 0;
    const sharedDefeatWinner = selectHumanEmpireDefeatWinnerV2(host.state);
    expect(sharedDefeatWinner).toBeDefined();
    expect(host.state.humanPlayerIds).not.toContain(sharedDefeatWinner);
  });
});
