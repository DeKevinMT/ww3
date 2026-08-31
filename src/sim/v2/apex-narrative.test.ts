import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { prepareAntarcticGatewayBreachesV2 } from './antarcticGateways';
import { synchronizeArmyCapacityV2 } from './capacity';
import { ANTARCTIC_TERRITORY_IDS_V2, WORLD_CONTENT_V2 } from './content';
import {
  APEX_FIRST_TRANSMISSION_TICK_V2,
  APEX_TRANSMISSION_MIN_SPACING_TICKS_V2,
  processApexNarrativeV2,
  recordApexConquestNarrativeV2,
  respondToApexTransmissionV2,
  selectApexTransmissionsV2,
} from './apexNarrative';
import { CAMPAIGN_TUTORIAL_TRANSMISSION_IDS_V2 } from './campaignTutorial';
import { canonicalStateHashV2, loadSaveV2, serializeSaveV2 } from './persistence';
import { resolveScenarioV2 } from './scenarios';
import { nationIdV2, territoryIdV2 } from './types';
import { WorldEngineV2 } from './WorldEngineV2';

describe('EONSCAR narrative transmissions', () => {
  it('never dispatches or accepts any temporarily retired Campaign tutorial message', () => {
    const engine = new WorldEngineV2(900);
    const playerId = engine.state.humanPlayerId;
    for (const tick of [
      APEX_FIRST_TRANSMISSION_TICK_V2,
      APEX_FIRST_TRANSMISSION_TICK_V2 + 20,
      1_000,
    ]) {
      engine.state.tick = tick;
      expect(processApexNarrativeV2(engine.state, engine.content)).toBe(0);
    }
    recordApexConquestNarrativeV2(
      engine.state,
      engine.content,
      playerId,
      nationIdV2('can'),
      territoryIdV2('can'),
      nationIdV2('can'),
    );
    expect(selectApexTransmissionsV2(engine.state, playerId)
      .filter((item) => CAMPAIGN_TUTORIAL_TRANSMISSION_IDS_V2.includes(item.id)))
      .toEqual([]);
    expect(respondToApexTransmissionV2(
      engine.state,
      playerId,
      'campaign-signal-anomaly',
      'accept',
    )).toMatchObject({ accepted: false, reason: expect.stringContaining('stale') });
  });

  it('continues genuine attention, gateway, wave and core story after the bypass', () => {
    const state = createWorldStateV2(903, WORLD_CONTENT_V2);
    const playerId = state.humanPlayerId;
    state.tick = 1_000;
    state.polarEndgame.rogueAttention = {
      stage: 'observing',
      liberatedWorldShare: 0.2,
      benchmarkMetTick: state.tick,
      nextStageTick: state.tick + 100,
      activatedTick: null,
    };

    expect(processApexNarrativeV2(state, WORLD_CONTENT_V2)).toBe(1);
    expect(selectApexTransmissionsV2(state, playerId).at(-1)).toMatchObject({
      id: 'campaign-attention-observing',
      choice: null,
    });
    expect(respondToApexTransmissionV2(
      state, playerId, 'campaign-attention-observing', 'acknowledge',
    )).toEqual({ accepted: true });

    state.tick += APEX_TRANSMISSION_MIN_SPACING_TICKS_V2;
    state.polarEndgame.rogueAttention.stage = 'mobilising';
    expect(processApexNarrativeV2(state, WORLD_CONTENT_V2)).toBe(1);
    expect(selectApexTransmissionsV2(state, playerId).at(-1)?.id)
      .toBe('campaign-attention-mobilising');
    expect(respondToApexTransmissionV2(
      state, playerId, 'campaign-attention-mobilising', 'acknowledge',
    )).toEqual({ accepted: true });

    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const serialized = serializeSaveV2(state, WORLD_CONTENT_V2);
    const loaded = loadSaveV2(serialized, WORLD_CONTENT_V2);
    expect(loaded.polarEndgame.apexNarrative).toEqual(state.polarEndgame.apexNarrative);
    expect(processApexNarrativeV2(loaded, WORLD_CONTENT_V2)).toBe(0);
    expect(canonicalStateHashV2(JSON.parse(serialized)))
      .toBe(JSON.parse(serialized).canonicalStateHash);

    prepareAntarcticGatewayBreachesV2(loaded);
    const gatewayId = loaded.polarEndgame.gatewayBreachOrder[0]!;
    loaded.polarEndgame.gatewayBreaches[gatewayId] = {
      gatewayId,
      status: 'open',
      breachStartedTick: loaded.tick,
      opensTick: loaded.tick,
      openedTick: loaded.tick,
    };
    loaded.tick += APEX_TRANSMISSION_MIN_SPACING_TICKS_V2;
    expect(processApexNarrativeV2(loaded, WORLD_CONTENT_V2)).toBe(1);
    expect(selectApexTransmissionsV2(loaded, playerId).at(-1)?.id)
      .toBe('campaign-first-gateway');
    expect(respondToApexTransmissionV2(
      loaded, playerId, 'campaign-first-gateway', 'acknowledge',
    )).toEqual({ accepted: true });

    loaded.polarEndgame.globalWave = 2;
    loaded.tick += APEX_TRANSMISSION_MIN_SPACING_TICKS_V2;
    expect(processApexNarrativeV2(loaded, WORLD_CONTENT_V2)).toBe(1);
    expect(selectApexTransmissionsV2(loaded, playerId).at(-1)?.id)
      .toBe('campaign-first-wave');
    expect(respondToApexTransmissionV2(
      loaded, playerId, 'campaign-first-wave', 'acknowledge',
    )).toEqual({ accepted: true });

    loaded.polarEndgame.roguePrime.status = 'sortie';
    loaded.tick += APEX_TRANSMISSION_MIN_SPACING_TICKS_V2;
    expect(processApexNarrativeV2(loaded, WORLD_CONTENT_V2)).toBe(1);
    expect(selectApexTransmissionsV2(loaded, playerId).at(-1)?.id)
      .toBe('rogue-prime-detected');
    expect(respondToApexTransmissionV2(
      loaded, playerId, 'rogue-prime-detected', 'acknowledge',
    )).toEqual({ accepted: true });

    const antarcticSectorId = ANTARCTIC_TERRITORY_IDS_V2.find((id) => id !== 'zero-point-core')!;
    loaded.territories[antarcticSectorId]!.owner = playerId;
    loaded.tick += APEX_TRANSMISSION_MIN_SPACING_TICKS_V2;
    expect(processApexNarrativeV2(loaded, WORLD_CONTENT_V2)).toBe(1);
    expect(selectApexTransmissionsV2(loaded, playerId).at(-1)?.id)
      .toBe('campaign-first-antarctic-sector');
    expect(respondToApexTransmissionV2(
      loaded, playerId, 'campaign-first-antarctic-sector', 'acknowledge',
    )).toEqual({ accepted: true });

    loaded.polarEndgame.phase = 'victory';
    loaded.tick += APEX_TRANSMISSION_MIN_SPACING_TICKS_V2;
    expect(processApexNarrativeV2(loaded, WORLD_CONTENT_V2)).toBe(1);
    expect(selectApexTransmissionsV2(loaded, playerId).at(-1)?.id)
      .toBe('campaign-core-defeated');
  });

  it('archives the Survival briefing without blocking the opening map', () => {
    const survival = resolveScenarioV2({ mode: 'survival', seed: 9022 }).content;
    const state = createWorldStateV2(9022, survival);
    const playerId = state.humanPlayerId;
    state.tick = 1;
    expect(processApexNarrativeV2(state, survival)).toBe(1);
    expect(selectApexTransmissionsV2(state, playerId)[0]).toMatchObject({
      id: 'survival-terminal-briefing',
      choice: 'acknowledge',
      resolvedTick: 1,
    });
    const primeBeforeDetection = structuredClone(state.polarEndgame.roguePrime);
    state.polarEndgame.roguePrime.status = 'sortie';
    state.tick += APEX_TRANSMISSION_MIN_SPACING_TICKS_V2;
    expect(processApexNarrativeV2(state, survival)).toBe(1);
    expect(selectApexTransmissionsV2(state, playerId).at(-1)?.id)
      .toBe('rogue-prime-detected');
    expect(respondToApexTransmissionV2(
      state, playerId, 'rogue-prime-detected', 'acknowledge',
    )).toEqual({ accepted: true });
    expect(processApexNarrativeV2(state, survival)).toBe(0);
    state.polarEndgame.roguePrime = primeBeforeDetection;

    synchronizeArmyCapacityV2(state, survival);
    const loaded = loadSaveV2(serializeSaveV2(state, survival), survival);
    expect(selectApexTransmissionsV2(loaded, playerId)[0]?.choice).toBe('acknowledge');
  });

  it('keeps Campaign tutorial histories empty per multiplayer seat and disables Alternative narrative', () => {
    const state = createWorldStateV2(905, WORLD_CONTENT_V2);
    const secondPlayer = WORLD_CONTENT_V2.nationIds.find((id) => (
      id !== state.humanPlayerId && WORLD_CONTENT_V2.nations[id]?.kind !== 'rogue-ai'
    ))!;
    state.humanPlayerIds = [state.humanPlayerId, secondPlayer]
      .sort((left, right) => left.localeCompare(right));
    state.tick = 100;
    expect(processApexNarrativeV2(state, WORLD_CONTENT_V2)).toBe(0);
    expect(selectApexTransmissionsV2(state, state.humanPlayerId)).toEqual([]);
    expect(selectApexTransmissionsV2(state, secondPlayer)).toEqual([]);

    const alternative = resolveScenarioV2({ mode: 'random-world', seed: 905 }).content;
    const alternativeState = createWorldStateV2(905, alternative);
    alternativeState.tick = 100;
    expect(processApexNarrativeV2(alternativeState, alternative)).toBe(0);
    expect(alternativeState.polarEndgame.apexNarrative.players).toEqual({});
  });
});
