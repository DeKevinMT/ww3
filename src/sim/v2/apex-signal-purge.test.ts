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
  advanceTerritoryIntegrationV2,
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
const germany = nationIdV2('deu');
const france = nationIdV2('fra');
const luxembourg = nationIdV2('lux');
const netherlands = nationIdV2('nld');
const franceTerritory = territoryIdV2('fra');
const germanyTerritory = territoryIdV2('deu');
const japanTerritory = territoryIdV2('jpn');
const luxembourgTerritory = territoryIdV2('lux');
const netherlandsTerritory = territoryIdV2('nld');

function humanBelgium(state: WorldStateV2): void {
  state.humanPlayerId = belgium;
  state.humanPlayerIds = [belgium];
}

function installApex(state: WorldStateV2): void {
  expect(initializeCommanderForceV2(state, WORLD_CONTENT_V2, belgium, {
    manpower: 0.001,
    capacity: 0.001,
    trainedReserves: 0,
    baseAttack: 60,
    baseDefense: 60,
    treasury: 0,
    annualOutput: 0.01,
    supplyStock: 1,
  }).accepted).toBe(true);
}

function addBelgianWar(
  state: WorldStateV2,
  operation?: FrontOperationV2,
): WarStateV2 {
  const war: WarStateV2 = {
    id: `war-${state.nextWarId++}`,
    attackerId: belgium,
    defenderId: france,
    startedTick: state.tick,
    lastBattleTick: state.tick,
    warScore: 0,
    battles: 0,
    attackerLosses: 0,
    defenderLosses: 0,
    lastPeaceOfferTick: -1_000_000,
    attackerOperations: operation ? [operation] : [],
    defenderOperations: [],
  };
  state.wars.push(war);
  return war;
}

function frontFrom(
  sourceId: TerritoryId,
  targetId: TerritoryId,
): FrontOperationV2 {
  return {
    commanderId: belgium,
    sourceId,
    targetId,
    doctrine: 'balanced',
    access: 'land',
    startedTick: 0,
    lastBattleTick: 0,
    holdUntilTick: 12,
    momentum: 0,
  };
}

function beginTwoHumanPurges(state: WorldStateV2): void {
  humanBelgium(state);
  installApex(state);
  beginTerritoryIntegrationV2(
    state, WORLD_CONTENT_V2, luxembourgTerritory, belgium, 'land',
  );
  beginTerritoryIntegrationV2(
    state, WORLD_CONTENT_V2, netherlandsTerritory, belgium, 'land',
  );
}

describe('autonomous APEX Signal Purge', () => {
  it('focuses one territory at triple APEX speed while remote purges continue at 50%', () => {
    const state = createWorldStateV2(88_101);
    beginTwoHumanPurges(state);
    const focusId = selectApexSignalPurgeFocusV2(state, WORLD_CONTENT_V2, belgium)!;
    const remoteId = focusId === luxembourgTerritory
      ? netherlandsTerritory : luxembourgTerritory;
    const focusBefore = state.territories[focusId]!.integration;
    const remoteBefore = state.territories[remoteId]!.integration;
    const focusEndpoint = state.territories[focusId]!.integrationProgram!.completesTick;
    const remoteEndpoint = state.territories[remoteId]!.integrationProgram!.completesTick;

    state.commanderForces[belgium]!.locationId = focusId;
    let remoteProductiveWeeks = 0;
    for (let tick = 1; tick <= 10; tick += 1) {
      state.tick = tick;
      if (apexSignalPurgeRelayActiveV2(remoteId, tick)) remoteProductiveWeeks += 1;
      advanceTerritoryIntegrationProgramsV2(state, WORLD_CONTENT_V2);
    }

    expect(state.territories[focusId]!.integration).toBeGreaterThan(focusBefore);
    expect(state.territories[focusId]!.integrationProgram!.completesTick)
      .toBe(focusEndpoint - 10 * (APEX_SIGNAL_PURGE_ON_SITE_SPEED_V2 - 1));
    expect(remoteProductiveWeeks).toBe(5);
    expect(state.territories[remoteId]!.integration).toBeGreaterThan(remoteBefore);
    expect(state.territories[remoteId]!.integrationProgram!.completesTick)
      .toBe(remoteEndpoint + (10 - remoteProductiveWeeks));
    expect(selectApexSignalPurgeStatusV2(state, WORLD_CONTENT_V2, focusId))
      .toMatchObject({
        focused: true,
        mode: 'on-site',
        label: `ON-SITE PURGE · ${APEX_SIGNAL_PURGE_ON_SITE_SPEED_V2}×`,
      });
    expect(selectApexSignalPurgeStatusV2(state, WORLD_CONTENT_V2, remoteId))
      .toMatchObject({
        focused: false,
        mode: 'relay',
        label: `REMOTE RELAY ${APEX_SIGNAL_PURGE_RELAY_PERCENT_V2}%`,
      });
  });

  it('turns physical APEX presence into a truthful one-third on-site ETA', () => {
    const state = createWorldStateV2(88_112);
    humanBelgium(state);
    installApex(state);
    beginTerritoryIntegrationV2(
      state, WORLD_CONTENT_V2, luxembourgTerritory, belgium, 'land',
    );
    state.commanderForces[belgium]!.locationId = luxembourgTerritory;
    const territory = state.territories[luxembourgTerritory]!;
    const baseWork = territory.integrationProgram!.completesTick - state.tick;
    const expectedCalendarWeeks = Math.ceil(
      baseWork / APEX_SIGNAL_PURGE_ON_SITE_SPEED_V2,
    );

    expect(selectApexSignalPurgeStatusV2(
      state, WORLD_CONTENT_V2, luxembourgTerritory,
    )).toMatchObject({
      mode: 'on-site',
      remainingWeeks: expectedCalendarWeeks,
    });
    for (let week = 1; week < expectedCalendarWeeks; week += 1) {
      state.tick = week;
      expect(advanceTerritoryIntegrationProgramsV2(state, WORLD_CONTENT_V2)).toEqual([]);
    }
    state.tick = expectedCalendarWeeks;
    expect(advanceTerritoryIntegrationProgramsV2(state, WORLD_CONTENT_V2))
      .toHaveLength(1);
    expect(territory.integrationProgram).toBeUndefined();
    expect(territory.integration).toBe(1);
  });

  it('uses a deterministic 50-of-100 remote relay cadence during any bilateral war', () => {
    const state = createWorldStateV2(88_102);
    humanBelgium(state);
    installApex(state);
    beginTerritoryIntegrationV2(
      state, WORLD_CONTENT_V2, luxembourgTerritory, belgium, 'land',
    );
    addBelgianWar(state);
    const territory = state.territories[luxembourgTerritory]!;
    const initialEndpoint = territory.integrationProgram!.completesTick;
    let productiveWeeks = 0;
    for (let tick = 1; tick <= 100; tick += 1) {
      state.tick = tick;
      if (apexSignalPurgeRelayActiveV2(luxembourgTerritory, tick)) productiveWeeks += 1;
      advanceTerritoryIntegrationProgramsV2(state, WORLD_CONTENT_V2);
    }

    expect(productiveWeeks).toBe(50);
    expect(territory.integration).toBeCloseTo(advanceTerritoryIntegrationV2(
      WORLD_CONTENT_V2,
      luxembourgTerritory,
      CONQUEST_INITIAL_INTEGRATION_SHARE,
      productiveWeeks,
    ), 10);
    expect(territory.integrationProgram!.completesTick)
      .toBe(initialEndpoint + 50);
    const status = selectApexSignalPurgeStatusV2(
      state, WORLD_CONTENT_V2, luxembourgTerritory,
    );
    expect(status).toMatchObject({
      focused: true,
      mode: 'relay',
      label: `REMOTE RELAY ${APEX_SIGNAL_PURGE_RELAY_PERCENT_V2}%`,
    });
    expect(status!.remainingWeeks).toBeGreaterThan(
      territory.integrationProgram!.completesTick - state.tick,
    );
  });

  it('keeps the same deterministic 50-of-100 relay while the physical dome is in transit', () => {
    const state = createWorldStateV2(88_111);
    humanBelgium(state);
    installApex(state);
    beginTerritoryIntegrationV2(
      state, WORLD_CONTENT_V2, luxembourgTerritory, belgium, 'land',
    );
    const force = state.commanderForces[belgium]!;
    force.mission = 'standby';
    force.front = null;
    force.transit = {
      path: [force.locationId, luxembourgTerritory],
      distanceKm: 120_000,
      departTick: 0,
      arriveTick: 200,
    };
    const territory = state.territories[luxembourgTerritory]!;
    let productiveWeeks = 0;
    for (let tick = 1; tick <= 100; tick += 1) {
      state.tick = tick;
      if (apexSignalPurgeRelayActiveV2(luxembourgTerritory, tick)) productiveWeeks += 1;
      advanceTerritoryIntegrationProgramsV2(state, WORLD_CONTENT_V2);
    }

    expect(productiveWeeks).toBe(50);
    expect(territory.integration).toBeCloseTo(advanceTerritoryIntegrationV2(
      WORLD_CONTENT_V2,
      luxembourgTerritory,
      CONQUEST_INITIAL_INTEGRATION_SHARE,
      productiveWeeks,
    ), 10);
    expect(selectApexSignalPurgeStatusV2(
      state, WORLD_CONTENT_V2, luxembourgTerritory,
    )).toMatchObject({ mode: 'en-route', label: 'APEX EN ROUTE' });
  });

  it('projects the exact relay completion when a purge finishes before APEX arrives', () => {
    const state = createWorldStateV2(88_113);
    humanBelgium(state);
    installApex(state);
    beginTerritoryIntegrationV2(
      state, WORLD_CONTENT_V2, luxembourgTerritory, belgium, 'land',
    );
    const territory = state.territories[luxembourgTerritory]!;
    territory.integrationProgram!.completesTick = state.tick + 3;
    const force = state.commanderForces[belgium]!;
    force.mission = 'standby';
    force.front = null;
    force.transit = {
      path: [force.locationId, luxembourgTerritory],
      distanceKm: 120_000,
      departTick: state.tick,
      arriveTick: state.tick + 100,
    };

    let expectedCompletionTick = state.tick;
    let productiveWeeks = 0;
    while (productiveWeeks < 3) {
      expectedCompletionTick += 1;
      if (apexSignalPurgeRelayActiveV2(
        luxembourgTerritory,
        expectedCompletionTick,
      )) productiveWeeks += 1;
    }
    const expectedStatus = selectApexSignalPurgeStatusV2(
      state, WORLD_CONTENT_V2, luxembourgTerritory,
    );
    expect(expectedStatus).toMatchObject({
      mode: 'en-route',
      projectedCompletesTick: expectedCompletionTick,
      remainingWeeks: expectedCompletionTick - state.tick,
    });

    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const loaded = loadSaveV2(createSaveV2(state, WORLD_CONTENT_V2), WORLD_CONTENT_V2);
    expect(selectApexSignalPurgeStatusV2(
      loaded, WORLD_CONTENT_V2, luxembourgTerritory,
    )).toEqual(expectedStatus);

    let actualCompletionTick: number | undefined;
    while (loaded.tick < force.transit.arriveTick) {
      loaded.tick += 1;
      if (advanceTerritoryIntegrationProgramsV2(loaded, WORLD_CONTENT_V2).length > 0) {
        actualCompletionTick = loaded.tick;
        break;
      }
      processCommanderForcesV2(loaded, WORLD_CONTENT_V2);
    }
    expect(actualCompletionTick).toBe(expectedCompletionTick);
  });

  it('projects relay travel followed by on-site work to the actual completion tick', () => {
    const state = createWorldStateV2(88_114);
    humanBelgium(state);
    installApex(state);
    beginTerritoryIntegrationV2(
      state, WORLD_CONTENT_V2, luxembourgTerritory, belgium, 'land',
    );
    const force = state.commanderForces[belgium]!;
    force.mission = 'standby';
    force.front = null;
    force.transit = {
      path: [force.locationId, luxembourgTerritory],
      distanceKm: 5_000,
      departTick: state.tick,
      arriveTick: state.tick + 7,
    };
    const status = selectApexSignalPurgeStatusV2(
      state, WORLD_CONTENT_V2, luxembourgTerritory,
    )!;
    expect(status).toMatchObject({ mode: 'en-route' });

    let actualCompletionTick: number | undefined;
    while (state.tick <= status.projectedCompletesTick!) {
      state.tick += 1;
      if (advanceTerritoryIntegrationProgramsV2(state, WORLD_CONTENT_V2).length > 0) {
        actualCompletionTick = state.tick;
        break;
      }
      processCommanderForcesV2(state, WORLD_CONTENT_V2);
    }
    expect(actualCompletionTick).toBe(status.projectedCompletesTick);
  });

  it('purges a supplied active front continuously at one third of on-site speed', () => {
    const state = createWorldStateV2(88_103);
    humanBelgium(state);
    installApex(state);
    beginTerritoryIntegrationV2(
      state, WORLD_CONTENT_V2, luxembourgTerritory, belgium, 'land',
    );
    addBelgianWar(state, frontFrom(luxembourgTerritory, franceTerritory));
    const territory = state.territories[luxembourgTerritory]!;
    territory.army.manpower = Math.max(0.001, territory.army.capacity * 0.5);
    state.players[belgium]!.foodSecurity = 1;
    const initialEndpoint = territory.integrationProgram!.completesTick;

    for (let tick = 1; tick <= 8; tick += 1) {
      state.tick = tick;
      advanceTerritoryIntegrationProgramsV2(state, WORLD_CONTENT_V2);
    }

    expect(territory.integration).toBeGreaterThan(CONQUEST_INITIAL_INTEGRATION_SHARE);
    expect(territory.integrationProgram!.completesTick).toBe(initialEndpoint);
    expect(selectApexSignalPurgeStatusV2(state, WORLD_CONTENT_V2, luxembourgTerritory))
      .toMatchObject({
        focused: true,
        mode: 'front',
        label: `FRONT PURGE · ${APEX_SIGNAL_PURGE_FRONT_SPEED_V2}×`,
        projectedCompletesTick: initialEndpoint,
        remainingWeeks: initialEndpoint - state.tick,
      });
  });

  it('runs distinct supplied fronts in parallel and never labels the second one queued', () => {
    const state = createWorldStateV2(88_115);
    beginTwoHumanPurges(state);
    beginTerritoryIntegrationV2(
      state, WORLD_CONTENT_V2, japanTerritory, belgium, 'naval',
    );
    const lux = state.territories[luxembourgTerritory]!;
    const nld = state.territories[netherlandsTerritory]!;
    const rear = state.territories[japanTerritory]!;
    lux.integration = 0.90;
    nld.integration = 0.80;
    rear.integration = 0.70;
    lux.army.manpower = Math.max(0.001, lux.army.capacity * 0.5);
    nld.army.manpower = Math.max(0.001, nld.army.capacity * 0.5);
    state.players[belgium]!.foodSecurity = 1;
    addBelgianWar(state, frontFrom(luxembourgTerritory, franceTerritory));
    state.wars.push({
      id: `war-${state.nextWarId++}`,
      attackerId: belgium,
      defenderId: germany,
      startedTick: state.tick,
      lastBattleTick: state.tick,
      warScore: 0,
      battles: 0,
      attackerLosses: 0,
      defenderLosses: 0,
      lastPeaceOfferTick: -1_000_000,
      attackerOperations: [frontFrom(netherlandsTerritory, germanyTerritory)],
      defenderOperations: [],
    });
    expect(selectApexSignalPurgeFocusV2(state, WORLD_CONTENT_V2, belgium))
      .toBe(luxembourgTerritory);
    state.commanderForces[belgium]!.locationId = luxembourgTerritory;
    const nldBefore = nld.integration;
    const nldEndpoint = nld.integrationProgram!.completesTick;

    state.tick = 1;
    advanceTerritoryIntegrationProgramsV2(state, WORLD_CONTENT_V2);

    expect(lux.integration).toBeGreaterThan(0.90);
    expect(nld.integration).toBeGreaterThan(nldBefore);
    expect(nld.integrationProgram!.completesTick).toBe(nldEndpoint);
    expect(selectApexSignalPurgeStatusV2(
      state, WORLD_CONTENT_V2, luxembourgTerritory,
    )).toMatchObject({ mode: 'on-site', focused: true });
    const secondFront = selectApexSignalPurgeStatusV2(
      state, WORLD_CONTENT_V2, netherlandsTerritory,
    );
    expect(secondFront).toMatchObject({
      mode: 'front',
      focused: false,
      label: `FRONT PURGE · ${APEX_SIGNAL_PURGE_FRONT_SPEED_V2}×`,
    });
    expect(secondFront?.remainingWeeks).toBeTypeOf('number');
    expect(secondFront?.label).not.toContain('QUEUED');
    expect(selectApexSignalPurgeStatusV2(
      state, WORLD_CONTENT_V2, japanTerritory,
    )).toMatchObject({ mode: 'relay', focused: false });
  });

  it('pauses only an actual front that has lost troops or national supply', () => {
    const state = createWorldStateV2(88_116);
    humanBelgium(state);
    installApex(state);
    beginTerritoryIntegrationV2(
      state, WORLD_CONTENT_V2, luxembourgTerritory, belgium, 'land',
    );
    addBelgianWar(state, frontFrom(luxembourgTerritory, franceTerritory));
    const territory = state.territories[luxembourgTerritory]!;
    territory.army.manpower = 0;
    const initialEndpoint = territory.integrationProgram!.completesTick;
    state.commanderForces[belgium]!.locationId = territoryIdV2('bel');

    state.tick = 1;
    advanceTerritoryIntegrationProgramsV2(state, WORLD_CONTENT_V2);

    expect(territory.integration).toBe(CONQUEST_INITIAL_INTEGRATION_SHARE);
    expect(territory.integrationProgram!.completesTick).toBe(initialEndpoint + 1);
    expect(selectApexSignalPurgeStatusV2(
      state, WORLD_CONTENT_V2, luxembourgTerritory,
    )).toMatchObject({
      mode: 'paused-front',
      label: 'WAITING FOR FRONT SUPPLY',
      projectedCompletesTick: undefined,
      remainingWeeks: undefined,
    });
  });

  it('bounds new and legacy purge work to months through a few years, never decades', () => {
    const state = createWorldStateV2(88_117);
    humanBelgium(state);
    installApex(state);
    const largestTerritory = WORLD_CONTENT_V2.territoryIds.reduce((largest, candidate) => (
      territoryIntegrationDurationWeeksV2(WORLD_CONTENT_V2, candidate)
        > territoryIntegrationDurationWeeksV2(WORLD_CONTENT_V2, largest)
        ? candidate : largest
    ));
    beginTerritoryIntegrationV2(
      state, WORLD_CONTENT_V2, largestTerritory, belgium, 'naval',
    );
    const territory = state.territories[largestTerritory]!;
    const baseWeeks = territoryIntegrationDurationWeeksV2(
      WORLD_CONTENT_V2, largestTerritory,
    );
    expect(baseWeeks).toBeLessThanOrEqual(6 * 52);

    // Authenticate a pre-balance frozen endpoint: presentation and live
    // simulation both clamp it to the current bounded amount of work.
    territory.integrationProgram!.completesTick = state.tick + 30 * 52;
    state.commanderForces[belgium]!.locationId = territoryIdV2('bel');
    const remote = selectApexSignalPurgeStatusV2(
      state, WORLD_CONTENT_V2, largestTerritory,
    )!;
    expect(remote.mode).toBe('relay');
    expect(remote.remainingWeeks).toBeLessThanOrEqual(12 * 52 + 10);

    state.commanderForces[belgium]!.locationId = largestTerritory;
    const onSite = selectApexSignalPurgeStatusV2(
      state, WORLD_CONTENT_V2, largestTerritory,
    )!;
    expect(onSite.mode).toBe('on-site');
    expect(onSite.remainingWeeks).toBeLessThanOrEqual(2 * 52);

    state.tick = 1;
    advanceTerritoryIntegrationProgramsV2(state, WORLD_CONTENT_V2);
    expect(territory.integrationProgram!.completesTick - state.tick)
      .toBeLessThanOrEqual(baseWeeks);
  });

  it('selects deterministically by completion, remaining work, access and stable id', () => {
    const state = createWorldStateV2(88_104);
    beginTwoHumanPurges(state);
    beginTerritoryIntegrationV2(
      state, WORLD_CONTENT_V2, japanTerritory, belgium, 'naval',
    );
    const lux = state.territories[luxembourgTerritory]!;
    const nld = state.territories[netherlandsTerritory]!;
    const japan = state.territories[japanTerritory]!;
    lux.integration = 0.70;
    nld.integration = 0.80;
    japan.integration = 0.60;
    expect(selectApexSignalPurgeFocusV2(state, WORLD_CONTENT_V2, belgium))
      .toBe(netherlandsTerritory);

    lux.integration = nld.integration = 0.80;
    japan.integration = 0.60;
    lux.integrationProgram!.completesTick = 50;
    nld.integrationProgram!.completesTick = 40;
    expect(selectApexSignalPurgeFocusV2(state, WORLD_CONTENT_V2, belgium))
      .toBe(netherlandsTerritory);

    lux.integrationProgram!.completesTick = 40;
    // Japan is lexicographically earlier but isolated from Belgium's friendly
    // network, so accessibility wins before the final stable-id tie-break.
    japan.integration = 0.80;
    japan.integrationProgram!.completesTick = 40;
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const restored = loadSaveV2(createSaveV2(state, WORLD_CONTENT_V2), WORLD_CONTENT_V2);
    expect(selectApexSignalPurgeFocusV2(restored, WORLD_CONTENT_V2, belgium))
      .toBe(luxembourgTerritory);
    expect(canonicalStateHashV2(createSaveV2(restored, WORLD_CONTENT_V2)))
      .toBe(canonicalStateHashV2(createSaveV2(state, WORLD_CONTENT_V2)));
  });

  it('leaves ordinary AI integration parallel and unchanged', () => {
    const state = createWorldStateV2(88_105);
    beginTerritoryIntegrationV2(
      state, WORLD_CONTENT_V2, luxembourgTerritory, france, 'land',
    );
    beginTerritoryIntegrationV2(
      state, WORLD_CONTENT_V2, netherlandsTerritory, france, 'land',
    );
    const luxBefore = state.territories[luxembourgTerritory]!.integration;
    const nldBefore = state.territories[netherlandsTerritory]!.integration;
    state.tick = 1;

    advanceTerritoryIntegrationProgramsV2(state, WORLD_CONTENT_V2);

    expect(state.territories[luxembourgTerritory]!.integration).toBeGreaterThan(luxBefore);
    expect(state.territories[netherlandsTerritory]!.integration).toBeGreaterThan(nldBefore);
    expect(selectApexSignalPurgeStatusV2(state, WORLD_CONTENT_V2, luxembourgTerritory))
      .toMatchObject({ mode: 'standard', label: 'INTEGRATING' });
  });

  it('keeps Survival world captures as non-integrating supply corridors', () => {
    const resolved = resolveScenarioV2({ mode: 'survival', seed: 88_106 });
    const state = createWorldStateV2(88_106, resolved.content);
    const playerId = state.humanPlayerId;
    beginTerritoryIntegrationV2(
      state,
      resolved.content,
      luxembourgTerritory,
      playerId,
      'land',
    );

    expect(state.territories[luxembourgTerritory]).toMatchObject({
      owner: playerId,
      coreOwner: playerId,
      integration: 0,
    });
    expect(state.territories[luxembourgTerritory]!.integrationProgram).toBeUndefined();
    expect(selectApexSignalPurgeFocusV2(state, resolved.content, playerId)).toBeUndefined();
  });

  it('completes through the existing 100% unlock gate and APEX notification path', () => {
    const state = createWorldStateV2(88_107);
    humanBelgium(state);
    installApex(state);
    beginTerritoryIntegrationV2(
      state, WORLD_CONTENT_V2, luxembourgTerritory, belgium, 'land',
    );
    state.territories[luxembourgTerritory]!.integrationProgram!.completesTick = 1;
    state.commanderForces[belgium]!.locationId = luxembourgTerritory;
    state.tick = 1;

    expect(advanceTerritoryIntegrationProgramsV2(state, WORLD_CONTENT_V2)).toEqual([{
      territoryId: luxembourgTerritory,
      formerCoreOwnerId: luxembourg,
      ownerId: belgium,
    }]);
    expect(campaignCountrySignalPurgeCompleteV1(
      state, WORLD_CONTENT_V2, belgium, luxembourg,
    )).toBe(true);
    expect(state.events.at(-1)?.message).toContain('APEX completed the Signal Purge');
  });

  it('physically travels to its focus, relays while moving and exposes on-site arrival', () => {
    const state = createWorldStateV2(88_108);
    humanBelgium(state);
    installApex(state);
    beginTerritoryIntegrationV2(
      state, WORLD_CONTENT_V2, luxembourgTerritory, belgium, 'land',
    );
    const force = state.commanderForces[belgium]!;
    const originId = force.locationId;

    state.tick = 1;
    processCommanderForcesV2(state, WORLD_CONTENT_V2);

    expect(force.locationId).toBe(originId);
    expect(force.transit?.path).toEqual([originId, luxembourgTerritory]);
    expect(selectApexSignalPurgeStatusV2(
      state, WORLD_CONTENT_V2, luxembourgTerritory,
    )).toMatchObject({ mode: 'en-route', label: 'APEX EN ROUTE' });
    expect(selectApexSignalPurgeArrivalV2(state, WORLD_CONTENT_V2, belgium))
      .toBeUndefined();

    state.tick = force.transit!.arriveTick;
    processCommanderForcesV2(state, WORLD_CONTENT_V2);

    expect(force.transit).toBeNull();
    expect(force.locationId).toBe(luxembourgTerritory);
    expect(selectApexSignalPurgeArrivalV2(state, WORLD_CONTENT_V2, belgium))
      .toMatchObject({ territoryId: luxembourgTerritory, mode: 'on-site' });
  });

  it('keeps recovery committed at half strength, then prioritizes purge after recovery', () => {
    const safe = createWorldStateV2(88_119);
    humanBelgium(safe);
    installApex(safe);
    beginTerritoryIntegrationV2(
      safe, WORLD_CONTENT_V2, luxembourgTerritory, belgium, 'land',
    );
    const safeForce = safe.commanderForces[belgium]!;
    safeForce.mission = 'hq-training';
    safeForce.front = null;
    safeForce.transit = null;
    safeForce.manualHoldUntilTick = 100;
    safeForce.army.manpower = safeForce.army.capacity * 0.50;
    safeForce.army.trainedReserves = 0;
    safeForce.economy.supplyStock = safeForce.army.capacity * 10 * 0.40;
    safe.tick = 1;

    processCommanderForcesV2(safe, WORLD_CONTENT_V2);

    expect(safeForce).toMatchObject({
      mission: 'hq-training',
      front: null,
      transit: null,
    });
    safeForce.army.manpower = safeForce.army.capacity * 0.70;
    safeForce.economy.supplyStock = safeForce.army.capacity * 10 * 0.60;
    safe.tick = safeForce.manualHoldUntilTick;
    processCommanderForcesV2(safe, WORLD_CONTENT_V2);
    expect(safeForce).toMatchObject({
      mission: 'standby',
      front: null,
      transit: { path: [territoryIdV2('bel'), luxembourgTerritory] },
    });

    const unsafe = createWorldStateV2(88_120);
    humanBelgium(unsafe);
    installApex(unsafe);
    beginTerritoryIntegrationV2(
      unsafe, WORLD_CONTENT_V2, luxembourgTerritory, belgium, 'land',
    );
    const unsafeForce = unsafe.commanderForces[belgium]!;
    unsafeForce.mission = 'hq-training';
    unsafeForce.front = null;
    unsafeForce.transit = null;
    unsafeForce.army.manpower = unsafeForce.army.capacity * 0.09;
    unsafeForce.army.trainedReserves = 0;
    unsafeForce.economy.supplyStock = unsafeForce.army.capacity * 10 * 0.40;
    unsafe.tick = 1;

    processCommanderForcesV2(unsafe, WORLD_CONTENT_V2);

    // Critical damage may keep APEX at HQ or make it physically evacuate to a
    // safer recovery site. Either way, it must not treat that movement as a
    // purge deployment until it clears the real safety floor.
    expect(unsafeForce.front).toBeNull();
    expect(['hq-training', 'evacuate']).toContain(unsafeForce.mission);
    expect(selectApexSignalPurgeStatusV2(
      unsafe, WORLD_CONTENT_V2, luxembourgTerritory,
    ).mode).not.toBe('on-site');
  });

  it('recharges its neural shield while purging, then gives a new war priority', () => {
    const state = createWorldStateV2(88_121);
    humanBelgium(state);
    installApex(state);
    beginTerritoryIntegrationV2(
      state, WORLD_CONTENT_V2, luxembourgTerritory, belgium, 'land',
    );
    const force = state.commanderForces[belgium]!;
    force.locationId = luxembourgTerritory;
    force.mission = 'standby';
    force.front = null;
    force.transit = null;
    force.army.manpower = force.army.capacity * 0.50;
    force.army.trainedReserves = 0;
    const openingManpower = force.army.manpower;
    const openingReserves = force.army.trainedReserves;

    for (let week = 0; week < 8; week += 1) {
      state.tick += 1;
      processCommanderForcesV2(state, WORLD_CONTENT_V2);
      expect(selectApexSignalPurgeStatusV2(
        state, WORLD_CONTENT_V2, luxembourgTerritory,
      )).toMatchObject({ mode: 'on-site', label: 'ON-SITE PURGE · 3×' });
      expect(force).toMatchObject({
        locationId: luxembourgTerritory,
        mission: 'standby',
        front: null,
        transit: null,
      });
    }
    expect(force.army.manpower).toBeGreaterThan(openingManpower);
    expect(force.army.trainedReserves).toBeGreaterThan(openingReserves);

    const war = addBelgianWar(
      state, frontFrom(luxembourgTerritory, franceTerritory),
    );
    state.tick += 1;
    processCommanderForcesV2(state, WORLD_CONTENT_V2);
    expect(force).toMatchObject({
      locationId: luxembourgTerritory,
      mission: 'assault-support',
      front: { warId: war.id, sourceId: luxembourgTerritory, targetId: franceTerritory },
      transit: null,
    });
  });

  it('pre-empts purge travel for war and returns to that purge after peace', () => {
    const state = createWorldStateV2(88_109);
    humanBelgium(state);
    installApex(state);
    beginTerritoryIntegrationV2(
      state, WORLD_CONTENT_V2, luxembourgTerritory, belgium, 'land',
    );
    const force = state.commanderForces[belgium]!;
    state.tick = 1;
    processCommanderForcesV2(state, WORLD_CONTENT_V2);
    expect(force.transit?.path.at(-1)).toBe(luxembourgTerritory);

    // Keep this fixture about mission priority rather than the independent
    // overwhelming-force emergency-retreat rule.
    state.territories[franceTerritory]!.army.manpower = 0.0001;
    const war = addBelgianWar(state, frontFrom(territoryIdV2('bel'), franceTerritory));
    state.tick = 2;
    processCommanderForcesV2(state, WORLD_CONTENT_V2);

    expect(force.front?.warId).toBe(war.id);
    expect(force.mission).toBe('assault-support');
    expect(selectApexSignalPurgeStatusV2(
      state, WORLD_CONTENT_V2, luxembourgTerritory,
    )?.mode).toBe('relay');

    state.wars = [];
    state.tick = 3;
    processCommanderForcesV2(state, WORLD_CONTENT_V2);

    expect(force.front).toBeNull();
    expect(force.transit?.path.at(-1)).toBe(luxembourgTerritory);
  });

  it('does not abandon a purge for an unreachable war and remains deterministic after reconnect', () => {
    const state = createWorldStateV2(88_118);
    humanBelgium(state);
    installApex(state);
    beginTerritoryIntegrationV2(
      state, WORLD_CONTENT_V2, luxembourgTerritory, belgium, 'land',
    );
    const force = state.commanderForces[belgium]!;
    state.tick = 1;
    processCommanderForcesV2(state, WORLD_CONTENT_V2);
    const purgeTransit = structuredClone(force.transit);
    expect(purgeTransit?.path.at(-1)).toBe(luxembourgTerritory);

    const usaTerritory = territoryIdV2('usa');
    const canadaTerritory = territoryIdV2('can');
    const canada = nationIdV2('can');
    state.territories[usaTerritory]!.owner = belgium;
    state.territories[usaTerritory]!.coreOwner = belgium;
    state.territories[usaTerritory]!.integration = 1;
    delete state.territories[usaTerritory]!.integrationProgram;
    state.wars.push({
      id: `war-${state.nextWarId++}`,
      attackerId: belgium,
      defenderId: canada,
      startedTick: state.tick,
      lastBattleTick: state.tick,
      warScore: 0,
      battles: 0,
      attackerLosses: 0,
      defenderLosses: 0,
      lastPeaceOfferTick: -1_000_000,
      attackerOperations: [frontFrom(usaTerritory, canadaTerritory)],
      defenderOperations: [],
    });

    // Re-evaluating on the same authoritative boundary must preserve the
    // existing movement instead of cancelling it merely because a war exists.
    processCommanderForcesV2(state, WORLD_CONTENT_V2);
    expect(force).toMatchObject({ mission: 'standby', front: null });
    expect(force.transit).toEqual(purgeTransit);

    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const loaded = loadSaveV2(createSaveV2(state, WORLD_CONTENT_V2), WORLD_CONTENT_V2);
    state.tick += 1;
    loaded.tick += 1;
    processCommanderForcesV2(state, WORLD_CONTENT_V2);
    processCommanderForcesV2(loaded, WORLD_CONTENT_V2);

    expect(loaded.commanderForces[belgium]).toEqual(state.commanderForces[belgium]);
    expect(loaded.commanderForces[belgium]).toMatchObject({
      mission: 'standby',
      front: null,
      locationId: luxembourgTerritory,
    });
    const normalizedState = loadSaveV2(
      createSaveV2(state, WORLD_CONTENT_V2), WORLD_CONTENT_V2,
    );
    expect(canonicalStateHashV2(createSaveV2(loaded, WORLD_CONTENT_V2)))
      .toBe(canonicalStateHashV2(createSaveV2(normalizedState, WORLD_CONTENT_V2)));
  });

  it('keeps physical purge travel and its ETA deterministic across reconnect', () => {
    const state = createWorldStateV2(88_110);
    humanBelgium(state);
    installApex(state);
    beginTerritoryIntegrationV2(
      state, WORLD_CONTENT_V2, luxembourgTerritory, belgium, 'land',
    );
    state.tick = 1;
    processCommanderForcesV2(state, WORLD_CONTENT_V2);
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const loaded = loadSaveV2(createSaveV2(state, WORLD_CONTENT_V2), WORLD_CONTENT_V2);

    expect(loaded.commanderForces[belgium]!.transit)
      .toEqual(state.commanderForces[belgium]!.transit);
    expect(selectApexSignalPurgeStatusV2(
      loaded, WORLD_CONTENT_V2, luxembourgTerritory,
    )).toEqual(selectApexSignalPurgeStatusV2(
      state, WORLD_CONTENT_V2, luxembourgTerritory,
    ));
    expect(canonicalStateHashV2(createSaveV2(loaded, WORLD_CONTENT_V2)))
      .toBe(canonicalStateHashV2(createSaveV2(state, WORLD_CONTENT_V2)));
  });
});
