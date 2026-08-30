import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { synchronizeArmyCapacityV2 } from './capacity';
import { initializeCommanderForceV2 } from './commanderForce';
import { WORLD_CONTENT_V2 } from './content';
import {
  APEX_FIRST_TRANSMISSION_TICK_V2,
  APEX_TRANSMISSION_MIN_SPACING_TICKS_V2,
  apexInvestigationAuthorizedV2,
  cloneApexNarrativeV2,
  processApexNarrativeV2,
  recordApexConquestNarrativeV2,
  respondToApexTransmissionV2,
  selectApexTransmissionsV2,
} from './apexNarrative';
import { canonicalStateHashV2, loadSaveV2, serializeSaveV2 } from './persistence';
import { selectArcticProjectTermsV2, startArcticProjectV2 } from './polarEndgame';
import { resolveScenarioV2 } from './scenarios';
import { nationIdV2, territoryIdV2 } from './types';
import { WorldEngineV2 } from './WorldEngineV2';

describe('APEX narrative transmissions', () => {
  it('starts mandatory Stage I from the first CTA with one charge and no second click', () => {
    const engine = new WorldEngineV2(900);
    const playerId = engine.state.humanPlayerId;
    engine.state.tick = APEX_FIRST_TRANSMISSION_TICK_V2;
    processApexNarrativeV2(engine.state, engine.content);
    const terms = engine.arcticProjectTerms(playerId, 'polar-demography');
    const treasuryBefore = engine.state.players[playerId]!.treasury;

    expect(engine.respondApexTransmission(
      playerId, 'campaign-signal-anomaly', 'accept',
    )).toEqual({ accepted: true });
    expect(engine.respondApexTransmission(
      playerId, 'campaign-signal-anomaly', 'accept',
    )).toMatchObject({ accepted: false });

    expect(engine.state.polarEndgame.arcticPrograms[playerId]?.activeProject)
      .toMatchObject({ projectId: 'polar-demography', costPaid: terms.cost });
    expect(treasuryBefore - engine.state.players[playerId]!.treasury)
      .toBeCloseTo(terms.cost, 4);
    expect(selectApexTransmissionsV2(engine.state, playerId)[0]?.choice).toBe('accept');
    expect(engine.state.polarEndgame.rogueAttention.stage).toBe('dormant');
  });

  it('starts the mandatory analysis immediately while its single-player overlay has paused time', () => {
    const engine = new WorldEngineV2(9002);
    const playerId = engine.state.humanPlayerId;
    engine.state.tick = APEX_FIRST_TRANSMISSION_TICK_V2;
    processApexNarrativeV2(engine.state, engine.content);
    engine.setSpeed(0);
    const tickBefore = engine.state.tick;
    const treasuryBefore = engine.state.players[playerId]!.treasury;
    const terms = engine.arcticProjectTerms(playerId, 'polar-demography');

    expect(engine.respondApexTransmission(
      playerId, 'campaign-signal-anomaly', 'accept',
    )).toEqual({ accepted: true });

    expect(engine.state.tick).toBe(tickBefore);
    expect(engine.state.polarEndgame.arcticPrograms[playerId]?.activeProject)
      .toMatchObject({ projectId: 'polar-demography', costPaid: terms.cost });
    expect(treasuryBefore - engine.state.players[playerId]!.treasury)
      .toBeCloseTo(terms.cost, 4);
    expect(selectApexTransmissionsV2(engine.state, playerId)[0]?.choice).toBe('accept');
    expect(engine.respondApexTransmission(
      playerId, 'campaign-signal-anomaly', 'accept',
    )).toMatchObject({ accepted: false });
  });

  it('commits an informational acknowledgement while paused so the proof war can unlock', () => {
    const engine = new WorldEngineV2(9003);
    const playerId = engine.state.humanPlayerId;
    engine.state.tick = APEX_FIRST_TRANSMISSION_TICK_V2;
    processApexNarrativeV2(engine.state, engine.content);
    expect(engine.respondApexTransmission(
      playerId, 'campaign-signal-anomaly', 'accept',
    )).toEqual({ accepted: true });
    engine.state.polarEndgame.communicationsBlackoutTick = engine.state.tick;
    engine.state.tick += APEX_TRANSMISSION_MIN_SPACING_TICKS_V2;
    expect(processApexNarrativeV2(engine.state, engine.content)).toBe(1);
    const actionSequenceBefore = engine.state.actionSequence;
    engine.setSpeed(0);

    expect(engine.respondApexTransmission(
      playerId, 'campaign-communications-blackout', 'acknowledge',
    )).toEqual({ accepted: true });

    expect(engine.apexTransmissions(playerId).at(-1)?.choice).toBe('acknowledge');
    expect(engine.state.actionSequence).toBe(actionSequenceBefore + 1);
  });

  it('keeps an unaffordable first CTA pending with one clear treasury reason', () => {
    const engine = new WorldEngineV2(9001);
    const playerId = engine.state.humanPlayerId;
    engine.state.tick = APEX_FIRST_TRANSMISSION_TICK_V2;
    processApexNarrativeV2(engine.state, engine.content);
    engine.state.players[playerId]!.treasury = 0;

    expect(engine.respondApexTransmission(
      playerId, 'campaign-signal-anomaly', 'accept',
    )).toMatchObject({ accepted: false, reason: expect.stringContaining('Treasury') });
    expect(selectApexTransmissionsV2(engine.state, playerId)[0]?.choice).toBeNull();
    expect(engine.state.polarEndgame.arcticPrograms[playerId]?.activeProject ?? null).toBeNull();
  });

  it('offers the mandatory analysis after six quiet opening weeks', () => {
    const state = createWorldStateV2(901, WORLD_CONTENT_V2);
    const playerId = state.humanPlayerId;

    state.tick = APEX_FIRST_TRANSMISSION_TICK_V2 - 1;
    expect(processApexNarrativeV2(state, WORLD_CONTENT_V2)).toBe(0);
    expect(selectApexTransmissionsV2(state, playerId)).toEqual([]);
    expect(selectArcticProjectTermsV2(
      state, WORLD_CONTENT_V2, playerId, 'polar-demography',
    )).toMatchObject({ allowed: true, cost: 0.01, durationTicks: 13 });

    state.tick = APEX_FIRST_TRANSMISSION_TICK_V2;
    expect(processApexNarrativeV2(state, WORLD_CONTENT_V2)).toBe(1);
    expect(selectApexTransmissionsV2(state, playerId)).toEqual([
      expect.objectContaining({
        id: 'campaign-signal-anomaly',
        title: 'APEX online · anomaly detected',
        action: 'north-pole-investigation',
        choice: null,
        sentTick: APEX_FIRST_TRANSMISSION_TICK_V2,
      }),
    ]);
    expect(selectApexTransmissionsV2(state, playerId)[0]?.body)
      .toContain('I carry fragments from a future we failed to save');
    expect(selectApexTransmissionsV2(state, playerId)[0]?.body)
      .toContain('Start Signal Triangulation');
    expect(selectApexTransmissionsV2(state, playerId)[0]?.body)
      .not.toMatch(/fog|dark|blackout|unreliable/i);
    expect(processApexNarrativeV2(state, WORLD_CONTENT_V2)).toBe(0);
  });

  it('continues with observable evidence instead of an obsolete fog or darkness story', () => {
    const state = createWorldStateV2(9011, WORLD_CONTENT_V2);
    const playerId = state.humanPlayerId;
    state.tick = APEX_FIRST_TRANSMISSION_TICK_V2;
    processApexNarrativeV2(state, WORLD_CONTENT_V2);
    expect(respondToApexTransmissionV2(
      state, playerId, 'campaign-signal-anomaly', 'accept',
    )).toEqual({ accepted: true });

    state.polarEndgame.communicationsBlackoutTick = state.tick;
    state.tick += APEX_TRANSMISSION_MIN_SPACING_TICKS_V2;
    expect(processApexNarrativeV2(state, WORLD_CONTENT_V2)).toBe(1);
    const briefing = selectApexTransmissionsV2(state, playerId).at(-1);
    expect(briefing).toMatchObject({
      id: 'campaign-communications-blackout',
      title: 'The pattern is real',
    });
    expect(briefing?.body).toContain('observe one live conflict');
    expect(briefing?.body).not.toMatch(/fog|dark|night|blackout|unreliable/i);
  });

  it('upgrades retired intro copy in an active save without losing its target', () => {
    const playerId = nationIdV2('grl');
    const targetId = territoryIdV2('isl');
    const restored = cloneApexNarrativeV2({
      players: {
        [playerId]: {
          investigationAuthorized: true,
          transmissions: [{
            id: 'campaign-communications-blackout',
            playerId,
            sentTick: 20,
            title: 'The world is going dark',
            body: 'Afterward, distant military data becomes unreliable in the blackout.',
            action: null,
            targetId,
            choice: 'acknowledge',
            resolvedTick: 20,
          }],
        },
      },
    });
    const briefing = restored.players[playerId]!.transmissions[0]!;
    expect(briefing).toMatchObject({ title: 'The pattern is real', targetId });
    expect(briefing.body).toContain('observe one live conflict');
    expect(briefing.body).not.toMatch(/fog|dark|night|blackout|unreliable/i);
  });

  it('rejects Later, authorises exactly one valid seat, and never awakens Rogue', () => {
    const state = createWorldStateV2(902, WORLD_CONTENT_V2);
    const playerId = state.humanPlayerId;
    state.tick = APEX_FIRST_TRANSMISSION_TICK_V2;
    processApexNarrativeV2(state, WORLD_CONTENT_V2);

    expect(respondToApexTransmissionV2(
      state, playerId, 'campaign-signal-anomaly', 'later',
    )).toMatchObject({ accepted: false, reason: expect.stringContaining('mandatory') });
    expect(apexInvestigationAuthorizedV2(state, playerId)).toBe(false);
    expect(respondToApexTransmissionV2(
      state, playerId, 'campaign-signal-anomaly', 'accept',
    )).toEqual({ accepted: true });
    expect(apexInvestigationAuthorizedV2(state, playerId)).toBe(true);
    expect(respondToApexTransmissionV2(
      state, playerId, 'campaign-signal-anomaly', 'accept',
    )).toMatchObject({ accepted: false });

    state.players[playerId]!.treasury = 100_000;
    expect(startArcticProjectV2(
      state, WORLD_CONTENT_V2, playerId, 'polar-demography',
    )).toEqual({ accepted: true });
    expect(state.polarEndgame.rogueAttention.stage).toBe('dormant');
    expect(state.polarEndgame.contactTick).toBeNull();
  });

  it('reopens one authenticated legacy Later choice without duplicating the briefing', () => {
    const state = createWorldStateV2(9021, WORLD_CONTENT_V2);
    const playerId = state.humanPlayerId;
    state.tick = APEX_FIRST_TRANSMISSION_TICK_V2;
    processApexNarrativeV2(state, WORLD_CONTENT_V2);
    const transmission = state.polarEndgame.apexNarrative.players[playerId]!
      .transmissions.find((item) => item.id === 'campaign-signal-anomaly')!;
    transmission.choice = 'later';

    expect(processApexNarrativeV2(state, WORLD_CONTENT_V2)).toBe(0);
    expect(transmission.choice).toBeNull();
    expect(selectApexTransmissionsV2(state, playerId)).toHaveLength(1);
  });

  it('archives the survival briefing without blocking the opening map', () => {
    const survival = resolveScenarioV2({ mode: 'survival', seed: 9022 }).content;
    const state = createWorldStateV2(9022, survival);
    const playerId = state.humanPlayerId;
    state.tick = 1;
    processApexNarrativeV2(state, survival);

    expect(selectApexTransmissionsV2(state, playerId)[0]).toMatchObject({
      choice: 'acknowledge',
      resolvedTick: 1,
    });
    expect(respondToApexTransmissionV2(
      state, playerId, 'survival-terminal-briefing', 'acknowledge',
    )).toMatchObject({ accepted: false, reason: expect.stringContaining('already') });
    expect(selectApexTransmissionsV2(state, playerId)[0]?.choice).toBe('acknowledge');

    synchronizeArmyCapacityV2(state, survival);
    const loaded = loadSaveV2(serializeSaveV2(state, survival), survival);
    expect(selectApexTransmissionsV2(loaded, playerId)[0]?.choice).toBe('acknowledge');
  });

  it('queues structured conquest and full-liberation beats without bunching', () => {
    const state = createWorldStateV2(903, WORLD_CONTENT_V2);
    const playerId = state.humanPlayerId;
    expect(initializeCommanderForceV2(state, WORLD_CONTENT_V2, playerId, {
      shield: {
        integrity: 0.01,
        maxIntegrity: 0.02,
        rechargeBuffer: 0,
        pulseAttack: 0.001,
      },
      attackMultiplier: 1.25,
      defenseMultiplier: 1.25,
      treasury: 0,
      annualOutput: 0,
      supplyStock: 1,
    })).toEqual({ accepted: true });
    const canada = nationIdV2('can');
    const targetId = WORLD_CONTENT_V2.territoryIds.find((id) => (
      WORLD_CONTENT_V2.territories[id]?.initialOwnerId === canada
    )) ?? territoryIdV2('can');

    state.tick = APEX_FIRST_TRANSMISSION_TICK_V2;
    processApexNarrativeV2(state, WORLD_CONTENT_V2);
    respondToApexTransmissionV2(state, playerId, 'campaign-signal-anomaly', 'accept');
    state.polarEndgame.communicationsBlackoutTick = state.tick;
    state.tick += APEX_TRANSMISSION_MIN_SPACING_TICKS_V2;
    processApexNarrativeV2(state, WORLD_CONTENT_V2);
    respondToApexTransmissionV2(state, playerId, 'campaign-communications-blackout', 'acknowledge');
    state.tick += APEX_TRANSMISSION_MIN_SPACING_TICKS_V2;
    const targetForGuidance = WORLD_CONTENT_V2.territoryIds.find((id) => (
      WORLD_CONTENT_V2.territories[id]?.initialOwnerId !== playerId
    ))!;
    state.polarEndgame.apexNarrative.players[playerId]!.transmissions.push({
      id: 'campaign-first-strike-guidance',
      playerId,
      sentTick: state.tick,
      title: 'First strike window',
      body: 'Guidance fixture.',
      action: 'first-strike-guidance',
      targetId: targetForGuidance,
      choice: 'acknowledge',
      resolvedTick: state.tick,
    });
    state.tick += APEX_TRANSMISSION_MIN_SPACING_TICKS_V2;

    recordApexConquestNarrativeV2(
      state, WORLD_CONTENT_V2, playerId, canada, targetId, canada,
    );
    expect(selectApexTransmissionsV2(state, playerId).at(-1)?.id)
      .toBe('campaign-first-conquest');
    respondToApexTransmissionV2(state, playerId, 'campaign-first-conquest', 'acknowledge');

    state.territories[targetId]!.owner = playerId;
    state.territories[targetId]!.integration = 0.5;
    state.territories[targetId]!.integrationProgram = {
      cause: 'conquest',
      fromOwnerId: canada,
      fromCoreOwnerId: canada,
      toOwnerId: playerId,
      startedTick: state.tick,
      completesTick: state.tick + 30,
      annualCost: 0,
    };
    const force = state.commanderForces[playerId]!;
    force.mission = 'standby';
    force.front = null;
    state.tick += APEX_TRANSMISSION_MIN_SPACING_TICKS_V2;
    // Liberation is deliberately held behind the recovery tutorial. The
    // distributed network can then focus purge bandwidth without travelling.
    expect(processApexNarrativeV2(state, WORLD_CONTENT_V2)).toBe(0);
    const progress = state.polarEndgame.apexNarrative.players[playerId]!;
    progress.transmissions.push({
      id: 'campaign-first-war-recovery',
      playerId,
      sentTick: state.tick,
      title: 'Recovery window',
      body: 'Fixture recovery.',
      action: null,
      targetId,
      choice: 'acknowledge',
      resolvedTick: state.tick,
    });
    state.tick += APEX_TRANSMISSION_MIN_SPACING_TICKS_V2;
    expect(processApexNarrativeV2(state, WORLD_CONTENT_V2)).toBe(1);
    expect(selectApexTransmissionsV2(state, playerId).at(-1)?.id)
      .toBe('campaign-first-purge-arrival');
    respondToApexTransmissionV2(
      state, playerId, 'campaign-first-purge-arrival', 'acknowledge',
    );
    state.territories[targetId]!.integration = 1;
    delete state.territories[targetId]!.integrationProgram;
    state.tick += APEX_TRANSMISSION_MIN_SPACING_TICKS_V2;
    expect(processApexNarrativeV2(state, WORLD_CONTENT_V2)).toBe(1);
    const liberation = selectApexTransmissionsV2(state, playerId)
      .find((item) => item.id === 'campaign-first-liberation');
    expect(liberation?.body).toContain('restored inside this timeline');
    expect(liberation?.body).not.toMatch(/Command Credits|\bCC\b/);
    expect(processApexNarrativeV2(state, WORLD_CONTENT_V2)).toBe(0);
  });

  it('persists exact history, responses and deterministic hash without replay', () => {
    const state = createWorldStateV2(904, WORLD_CONTENT_V2);
    const playerId = state.humanPlayerId;
    state.tick = APEX_FIRST_TRANSMISSION_TICK_V2;
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    processApexNarrativeV2(state, WORLD_CONTENT_V2);
    respondToApexTransmissionV2(state, playerId, 'campaign-signal-anomaly', 'accept');

    const serialized = serializeSaveV2(state, WORLD_CONTENT_V2);
    const loaded = loadSaveV2(serialized, WORLD_CONTENT_V2);
    expect(loaded.polarEndgame.apexNarrative).toEqual(state.polarEndgame.apexNarrative);
    expect(processApexNarrativeV2(loaded, WORLD_CONTENT_V2)).toBe(0);
    const repeated = serializeSaveV2(loaded, WORLD_CONTENT_V2);
    expect(canonicalStateHashV2(JSON.parse(repeated))).toBe(JSON.parse(repeated).canonicalStateHash);
    expect(repeated).toBe(serialized);
  });

  it('isolates multiplayer histories, disables Alternative and briefs Survival once', () => {
    const state = createWorldStateV2(905, WORLD_CONTENT_V2);
    const secondPlayer = WORLD_CONTENT_V2.nationIds.find((id) => (
      id !== state.humanPlayerId && WORLD_CONTENT_V2.nations[id]?.kind !== 'rogue-ai'
    ))!;
    state.humanPlayerIds = [state.humanPlayerId, secondPlayer]
      .sort((left, right) => left.localeCompare(right));
    state.tick = APEX_FIRST_TRANSMISSION_TICK_V2;
    expect(processApexNarrativeV2(state, WORLD_CONTENT_V2)).toBe(2);
    expect(selectApexTransmissionsV2(state, state.humanPlayerId)).toHaveLength(1);
    expect(selectApexTransmissionsV2(state, secondPlayer)).toHaveLength(1);
    expect(respondToApexTransmissionV2(
      state, secondPlayer, 'campaign-signal-anomaly', 'accept',
    )).toEqual({ accepted: true });
    expect(apexInvestigationAuthorizedV2(state, state.humanPlayerId)).toBe(false);
    expect(apexInvestigationAuthorizedV2(state, secondPlayer)).toBe(true);

    const alternative = resolveScenarioV2({ mode: 'random-world', seed: 905 }).content;
    const alternativeState = createWorldStateV2(905, alternative);
    alternativeState.tick = 100;
    expect(processApexNarrativeV2(alternativeState, alternative)).toBe(0);
    expect(alternativeState.polarEndgame.apexNarrative.players).toEqual({});

    const survival = resolveScenarioV2({ mode: 'survival', seed: 905 }).content;
    const survivalState = createWorldStateV2(905, survival);
    survivalState.tick = 1;
    expect(processApexNarrativeV2(survivalState, survival)).toBe(1);
    expect(selectApexTransmissionsV2(survivalState, survivalState.humanPlayerId)
      .map((item) => item.id)).toEqual(['survival-terminal-briefing']);
    expect(processApexNarrativeV2(survivalState, survival)).toBe(0);
  });
});
