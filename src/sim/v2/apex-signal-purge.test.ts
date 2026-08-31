import { describe, expect, it } from 'vitest';
import { campaignCountrySignalPurgeCompleteV1 } from '../../meta/countryUnlockEligibility';
import { CONQUEST_INITIAL_INTEGRATION_SHARE } from './balance';
import { createWorldStateV2 } from './bootstrap';
import { synchronizeArmyCapacityV2 } from './capacity';
import { WORLD_CONTENT_V2 } from './content';
import {
  initializeCommanderForceV2,
  processCommanderForcesV2,
} from './commanderForce';
import {
  APEX_SIGNAL_PURGE_FRONT_SPEED_V2,
  APEX_SIGNAL_PURGE_ON_SITE_SPEED_V2,
  APEX_SIGNAL_PURGE_RELAY_PERCENT_V2,
  advanceTerritoryIntegrationProgramsV2,
  apexSignalPurgeRelayActiveV2,
  beginTerritoryIntegrationV2,
  selectApexSignalPurgeArrivalV2,
  selectApexSignalPurgeFocusV2,
  selectApexSignalPurgeStatusV2,
  territoryIntegrationDurationWeeksV2,
} from './integration';
import { canonicalStateHashV2, createSaveV2, loadSaveV2 } from './persistence';
import { resolveScenarioV2 } from './scenarios';
import {
  nationIdV2,
  territoryIdV2,
  type FrontOperationV2,
  type TerritoryId,
  type WarStateV2,
  type WorldStateV2,
} from './types';

const belgium = nationIdV2('bel');
const france = nationIdV2('fra');
const luxembourg = nationIdV2('lux');
const luxembourgTerritory = territoryIdV2('lux');
const netherlandsTerritory = territoryIdV2('nld');
const japanTerritory = territoryIdV2('jpn');

function installApex(state: WorldStateV2): void {
  state.humanPlayerId = belgium;
  state.humanPlayerIds = [belgium];
  expect(initializeCommanderForceV2(state, WORLD_CONTENT_V2, belgium, {
    shield: {
      integrity: 0.001,
      maxIntegrity: 0.001,
      rechargeBuffer: 0,
      pulseAttack: 0.001,
    },
    attackMultiplier: 1.12,
    defenseMultiplier: 1.18,
    treasury: 0,
    annualOutput: 0.01,
    supplyStock: 0,
  }).accepted).toBe(true);
}

function beginTwoHumanPurges(state: WorldStateV2): void {
  installApex(state);
  beginTerritoryIntegrationV2(
    state, WORLD_CONTENT_V2, luxembourgTerritory, belgium, 'land',
  );
  beginTerritoryIntegrationV2(
    state, WORLD_CONTENT_V2, netherlandsTerritory, belgium, 'land',
  );
}

function operation(
  sourceId: TerritoryId,
  targetId: TerritoryId,
): FrontOperationV2 {
  return {
    commanderId: belgium,
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

function war(activeOperation: FrontOperationV2): WarStateV2 {
  return {
    id: 'war-purge-priority',
    attackerId: belgium,
    defenderId: stateOwner(activeOperation.targetId),
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

// Every authored target used below has its ordinary country id as owner at tick zero.
function stateOwner(territoryId: TerritoryId) {
  return nationIdV2(territoryId);
}

describe('distributed EONSCAR Signal Purge', () => {
  it('focuses one peace-time purge at 3× while deterministic relays keep the rest at 50%', () => {
    const state = createWorldStateV2(88_101, WORLD_CONTENT_V2);
    beginTwoHumanPurges(state);
    const focusId = selectApexSignalPurgeFocusV2(
      state, WORLD_CONTENT_V2, belgium,
    )!;
    const relayId = focusId === luxembourgTerritory
      ? netherlandsTerritory : luxembourgTerritory;
    const focusEndpoint = state.territories[focusId]!.integrationProgram!.completesTick;
    const relayEndpoint = state.territories[relayId]!.integrationProgram!.completesTick;
    let productiveRelayWeeks = 0;

    for (let tick = 1; tick <= 10; tick += 1) {
      state.tick = tick;
      if (apexSignalPurgeRelayActiveV2(relayId, tick)) productiveRelayWeeks += 1;
      advanceTerritoryIntegrationProgramsV2(state, WORLD_CONTENT_V2);
    }

    expect(productiveRelayWeeks).toBe(5);
    expect(state.territories[focusId]!.integrationProgram!.completesTick)
      .toBe(focusEndpoint - 10 * (APEX_SIGNAL_PURGE_ON_SITE_SPEED_V2 - 1));
    expect(state.territories[relayId]!.integrationProgram!.completesTick)
      .toBe(relayEndpoint + (10 - productiveRelayWeeks));
    expect(selectApexSignalPurgeStatusV2(
      state, WORLD_CONTENT_V2, focusId,
    )).toMatchObject({
      mode: 'network-focus',
      label: `EONSCAR PRIORITY PURGE · ${APEX_SIGNAL_PURGE_ON_SITE_SPEED_V2}×`,
      focused: true,
    });
    expect(selectApexSignalPurgeArrivalV2(
      state, WORLD_CONTENT_V2, belgium,
    )?.territoryId).toBe(focusId);
  });

  it('protects wars first: supplied purge fronts keep 1× and remote purges keep relay cadence', () => {
    const state = createWorldStateV2(88_102, WORLD_CONTENT_V2);
    beginTwoHumanPurges(state);
    const focusId = selectApexSignalPurgeFocusV2(
      state, WORLD_CONTENT_V2, belgium,
    )!;
    const hostileTarget = focusId === luxembourgTerritory
      ? territoryIdV2('fra') : territoryIdV2('deu');
    const activeOperation = operation(focusId, hostileTarget);
    state.wars = [war(activeOperation)];
    state.territories[focusId]!.army.manpower = Math.max(
      0.001,
      state.territories[focusId]!.army.manpower,
    );
    const endpoint = state.territories[focusId]!.integrationProgram!.completesTick;
    state.tick = 1;

    advanceTerritoryIntegrationProgramsV2(state, WORLD_CONTENT_V2);

    expect(APEX_SIGNAL_PURGE_FRONT_SPEED_V2).toBe(1);
    expect(state.territories[focusId]!.integrationProgram!.completesTick).toBe(endpoint);
    expect(selectApexSignalPurgeStatusV2(
      state, WORLD_CONTENT_V2, focusId,
    )).toMatchObject({ mode: 'front', label: 'FRONT PURGE · 1×' });
    expect(selectApexSignalPurgeArrivalV2(
      state, WORLD_CONTENT_V2, belgium,
    )).toBeUndefined();
  });

  it('uses the same network focus regardless of authenticated location or transit', () => {
    const state = createWorldStateV2(88_103, WORLD_CONTENT_V2);
    beginTwoHumanPurges(state);
    const force = state.commanderForces[belgium]!;
    force.locationId = territoryIdV2('usa');
    force.transit = {
      path: [territoryIdV2('usa'), territoryIdV2('can')],
      distanceKm: 20_000,
      departTick: 0,
      arriveTick: 2_000,
    };

    expect(selectApexSignalPurgeStatusV2(
      state,
      WORLD_CONTENT_V2,
      selectApexSignalPurgeFocusV2(state, WORLD_CONTENT_V2, belgium)!,
    )).toMatchObject({ mode: 'network-focus', focused: true });
    processCommanderForcesV2(state, WORLD_CONTENT_V2);
    expect(force.transit).toBeNull();
  });

  it(`keeps remote relay throughput at exactly ${APEX_SIGNAL_PURGE_RELAY_PERCENT_V2}%`, () => {
    const state = createWorldStateV2(88_104, WORLD_CONTENT_V2);
    beginTwoHumanPurges(state);
    const focusId = selectApexSignalPurgeFocusV2(
      state, WORLD_CONTENT_V2, belgium,
    )!;
    const relayId = focusId === luxembourgTerritory
      ? netherlandsTerritory : luxembourgTerritory;
    let productive = 0;
    for (let tick = 1; tick <= 100; tick += 1) {
      if (apexSignalPurgeRelayActiveV2(relayId, tick)) productive += 1;
    }
    expect(productive).toBe(APEX_SIGNAL_PURGE_RELAY_PERCENT_V2);
  });

  it('selects deterministically and survives an authenticated reconnect', () => {
    const state = createWorldStateV2(88_105, WORLD_CONTENT_V2);
    beginTwoHumanPurges(state);
    beginTerritoryIntegrationV2(
      state, WORLD_CONTENT_V2, japanTerritory, belgium, 'naval',
    );
    const lux = state.territories[luxembourgTerritory]!;
    const nld = state.territories[netherlandsTerritory]!;
    const japan = state.territories[japanTerritory]!;
    lux.integration = nld.integration = japan.integration = 0.8;
    lux.integrationProgram!.completesTick = 40;
    nld.integrationProgram!.completesTick = 40;
    japan.integrationProgram!.completesTick = 40;
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const focus = selectApexSignalPurgeFocusV2(
      state, WORLD_CONTENT_V2, belgium,
    );
    const save = createSaveV2(state, WORLD_CONTENT_V2);
    const loaded = loadSaveV2(save, WORLD_CONTENT_V2);

    expect(focus).toBe(luxembourgTerritory);
    expect(selectApexSignalPurgeFocusV2(
      loaded, WORLD_CONTENT_V2, belgium,
    )).toBe(focus);
    expect(canonicalStateHashV2(createSaveV2(loaded, WORLD_CONTENT_V2)))
      .toBe(canonicalStateHashV2(save));
  });

  it('bounds even the largest current purge to authored years, never decades', () => {
    const state = createWorldStateV2(88_106, WORLD_CONTENT_V2);
    installApex(state);
    const largest = [...WORLD_CONTENT_V2.territoryIds]
      .filter((id) => state.territories[id]?.owner !== belgium)
      .sort((left, right) => (
        territoryIntegrationDurationWeeksV2(WORLD_CONTENT_V2, right)
          - territoryIntegrationDurationWeeksV2(WORLD_CONTENT_V2, left)
      ))[0]!;
    beginTerritoryIntegrationV2(
      state, WORLD_CONTENT_V2, largest, belgium, 'naval',
    );
    expect(territoryIntegrationDurationWeeksV2(
      WORLD_CONTENT_V2, largest,
    )).toBeLessThanOrEqual(12 * 52);
    expect(selectApexSignalPurgeStatusV2(
      state, WORLD_CONTENT_V2, largest,
    )!.remainingWeeks).toBeLessThanOrEqual(4 * 52);
  });

  it('leaves ordinary AI integration parallel and unchanged', () => {
    const state = createWorldStateV2(88_107, WORLD_CONTENT_V2);
    beginTerritoryIntegrationV2(
      state, WORLD_CONTENT_V2, luxembourgTerritory, france, 'land',
    );
    beginTerritoryIntegrationV2(
      state, WORLD_CONTENT_V2, netherlandsTerritory, france, 'land',
    );
    const before = [
      state.territories[luxembourgTerritory]!.integration,
      state.territories[netherlandsTerritory]!.integration,
    ];
    state.tick = 1;
    advanceTerritoryIntegrationProgramsV2(state, WORLD_CONTENT_V2);

    expect(state.territories[luxembourgTerritory]!.integration).toBeGreaterThan(before[0]!);
    expect(state.territories[netherlandsTerritory]!.integration).toBeGreaterThan(before[1]!);
    expect(selectApexSignalPurgeStatusV2(
      state, WORLD_CONTENT_V2, luxembourgTerritory,
    )).toMatchObject({ mode: 'standard', label: 'INTEGRATING' });
  });

  it('keeps Survival human captures on the normal integration path', () => {
    const resolved = resolveScenarioV2({ mode: 'survival', seed: 88_108 });
    const state = createWorldStateV2(88_108, resolved.content);
    const playerId = state.humanPlayerId;
    beginTerritoryIntegrationV2(
      state, resolved.content, luxembourgTerritory, playerId, 'land',
    );

    expect(state.territories[luxembourgTerritory]).toMatchObject({
      owner: playerId,
      coreOwner: luxembourg,
      integration: CONQUEST_INITIAL_INTEGRATION_SHARE,
    });
    expect(state.territories[luxembourgTerritory]!.integrationProgram).toBeDefined();
    expect(selectApexSignalPurgeFocusV2(
      state, resolved.content, playerId,
    )).toBe(luxembourgTerritory);
  });

  it('completes through the existing 100% country-unlock gate and notification path', () => {
    const state = createWorldStateV2(88_109, WORLD_CONTENT_V2);
    installApex(state);
    beginTerritoryIntegrationV2(
      state, WORLD_CONTENT_V2, luxembourgTerritory, belgium, 'land',
    );
    expect(state.territories[luxembourgTerritory]!.integration)
      .toBe(CONQUEST_INITIAL_INTEGRATION_SHARE);
    state.territories[luxembourgTerritory]!.integrationProgram!.completesTick = 1;
    state.tick = 1;

    expect(advanceTerritoryIntegrationProgramsV2(
      state, WORLD_CONTENT_V2,
    )).toEqual([{
      territoryId: luxembourgTerritory,
      formerCoreOwnerId: luxembourg,
      ownerId: belgium,
    }]);
    expect(campaignCountrySignalPurgeCompleteV1(
      state, WORLD_CONTENT_V2, belgium, luxembourg,
    )).toBe(true);
    expect(state.events.at(-1)?.message).toContain('EONSCAR completed the Signal Purge');
  });
});
