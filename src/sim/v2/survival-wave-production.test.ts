import { describe, expect, it } from 'vitest';
import { WorldEngineV2 } from './WorldEngineV2';
import { ANTARCTIC_GATEWAY_IDS_V2 } from './antarcticGateways';
import { ANTARCTIC_TERRITORY_IDS_V2, ROGUE_AI_NATION_ID_V2 } from './content';
import { createFinancePlansV2, processFinanceMilitaryV2 } from './economy';
import { resolveScenarioV2 } from './scenarios';
import {
  ROGUE_ANNUAL_WAVE_ACTIVE_ARMY_SHARE_V2,
  ROGUE_ANNUAL_WAVE_INTERVAL_TICKS_V2,
  processRogueAiSurvivalV2,
  rogueActiveArmyManpowerV2,
  rogueAnnualWaveActiveArmyShareV2,
  rogueAnnualWaveActiveArmyShareForStateV2,
  rogueAnnualWaveManpowerV2,
} from './survival';
import {
  clearRogueWaveManpowerV2,
  recordRogueWaveCasualtiesV2,
  rogueWaveManpowerAtV2,
} from './survivalProvenance';

function formedSurvival(seed: number): WorldEngineV2 {
  const { content } = resolveScenarioV2({ mode: 'survival', seed });
  const engine = new WorldEngineV2(seed, content);
  expect(engine.chooseCountry('grl')).toEqual({ accepted: true });
  expect(engine.formSurvivalEmpire('grl', [])).toEqual({ accepted: true });
  return engine;
}

function verifiedWaveTotal(engine: WorldEngineV2): number {
  return Object.values(engine.state.polarEndgame.rogueWaveManpowerByTerritory)
    .reduce((sum, manpower) => sum + Math.max(0, manpower ?? 0), 0);
}

describe('annual live-army Survival waves', () => {
  it('manufactures 5% in every Survival wave while retaining the Campaign compatibility curve', () => {
    const engine = formedSurvival(93_100);
    expect([1, 2, 3, 4, 5, 20].map((wave) => (
      rogueAnnualWaveActiveArmyShareForStateV2(engine.state, wave)
    ))).toEqual([0.05, 0.05, 0.05, 0.05, 0.05, 0.05]);
    expect([1, 2, 3, 4, 5, 6, 20].map(rogueAnnualWaveActiveArmyShareV2))
      .toEqual([0.01, 0.02, 0.03, 0.04, ROGUE_ANNUAL_WAVE_ACTIVE_ARMY_SHARE_V2, 0.05, 0.05]);
  });

  it('manufactures exactly five percent every 52 weeks and tracks only those new troops', () => {
    const engine = formedSurvival(93_101);
    const liveArmyBefore = rogueActiveArmyManpowerV2(engine.state);
    const requested = rogueAnnualWaveManpowerV2(engine.state);
    const provenanceBefore = verifiedWaveTotal(engine);
    const sourceManpowerBefore = new Map(ANTARCTIC_TERRITORY_IDS_V2
      .filter((territoryId) => !(ANTARCTIC_GATEWAY_IDS_V2 as readonly string[]).includes(territoryId))
      .map((territoryId) => [territoryId, engine.state.territories[territoryId]!.army.manpower]));
    expect(requested).toBeCloseTo(
      liveArmyBefore * ROGUE_ANNUAL_WAVE_ACTIVE_ARMY_SHARE_V2,
      8,
    );

    const firstDueTick = engine.state.polarEndgame.nextCounteroffensiveTick!;
    expect(firstDueTick - engine.state.tick).toBe(ROGUE_ANNUAL_WAVE_INTERVAL_TICKS_V2);
    engine.state.tick = firstDueTick - 1;
    expect(processRogueAiSurvivalV2(engine.state, engine.content).waveStarted).toBeNull();
    engine.state.tick = firstDueTick;
    expect(processRogueAiSurvivalV2(engine.state, engine.content).waveStarted).toBe(1);

    expect(rogueActiveArmyManpowerV2(engine.state)).toBeCloseTo(
      liveArmyBefore + requested,
      8,
    );
    for (const [territoryId, manpower] of sourceManpowerBefore) {
      expect(engine.state.territories[territoryId]!.army.manpower, territoryId)
        .toBe(manpower);
    }
    expect(verifiedWaveTotal(engine) - provenanceBefore).toBeCloseTo(requested, 8);
    expect(engine.state.polarEndgame.nextCounteroffensiveTick)
      .toBe(firstDueTick + ROGUE_ANNUAL_WAVE_INTERVAL_TICKS_V2);
    expect(engine.state.players[ROGUE_AI_NATION_ID_V2]!.trainedReserves).toBe(0);

    const gatewayId = ANTARCTIC_GATEWAY_IDS_V2[0];
    const gateway = engine.state.territories[gatewayId]!;
    const verifiedBeforeLoss = rogueWaveManpowerAtV2(engine.state, gatewayId);
    const manpowerBeforeLoss = gateway.army.manpower;
    const casualty = verifiedBeforeLoss * 0.5;
    gateway.army.manpower -= casualty;
    expect(recordRogueWaveCasualtiesV2(
      engine.state,
      gatewayId,
      manpowerBeforeLoss,
      casualty,
      engine.state.humanPlayerId,
    )).toBeGreaterThan(0);
    expect(rogueWaveManpowerAtV2(engine.state, gatewayId)).toBeLessThan(verifiedBeforeLoss);
  });

  it('opens and visibly stages manufactured troops through all three gateways deterministically', () => {
    const first = formedSurvival(93_102);
    const replay = formedSurvival(93_102);
    for (const engine of [first, replay]) {
      expect(ANTARCTIC_GATEWAY_IDS_V2.map((gatewayId) => (
        engine.state.polarEndgame.gatewayBreaches[gatewayId]!.status
      ))).toEqual(['open', 'open', 'open']);
      engine.state.tick = engine.state.polarEndgame.nextCounteroffensiveTick!;
      expect(processRogueAiSurvivalV2(engine.state, engine.content).waveStarted).toBe(1);
    }
    const signature = (engine: WorldEngineV2) => ANTARCTIC_GATEWAY_IDS_V2.map((gatewayId) => ({
      gatewayId,
      manpower: engine.state.territories[gatewayId]!.army.manpower,
      verified: rogueWaveManpowerAtV2(engine.state, gatewayId),
    }));
    expect(signature(first)).toEqual(signature(replay));
    expect(signature(first).every((gateway) => gateway.verified > 0)).toBe(true);
  });

  it('keeps the core formation intact while adding the wave across the gateways', () => {
    const engine = formedSurvival(93_103);
    const coreBefore = engine.state.territories['zero-point-core']!.army.manpower;
    const requested = rogueAnnualWaveManpowerV2(engine.state);
    const garrisonsBefore = new Map(ANTARCTIC_GATEWAY_IDS_V2.map((gatewayId) => [
      gatewayId,
      engine.state.territories[gatewayId]!.army.manpower,
    ]));
    engine.state.tick = engine.state.polarEndgame.nextCounteroffensiveTick!;
    expect(processRogueAiSurvivalV2(engine.state, engine.content).waveStarted).toBe(1);
    expect(engine.state.territories['zero-point-core']!.army.manpower).toBe(coreBefore);
    expect(ANTARCTIC_GATEWAY_IDS_V2.reduce((sum, gatewayId) => (
      sum + engine.state.territories[gatewayId]!.army.manpower
        - (garrisonsBefore.get(gatewayId) ?? 0)
    ), 0)).toBeCloseTo(requested, 8);
    for (const gatewayId of ANTARCTIC_GATEWAY_IDS_V2) {
      expect(engine.state.territories[gatewayId]!.army.manpower)
        .toBeGreaterThan((garrisonsBefore.get(gatewayId) ?? 0) * 0.70);
    }
  });

  it('keeps ordinary Antarctic recovery defensive until the annual scheduler commits it', () => {
    const engine = formedSurvival(93_104);
    engine.state.wars = [];
    const core = engine.state.territories['zero-point-core']!;
    core.army.manpower = core.army.capacity * 0.5;
    clearRogueWaveManpowerV2(engine.state, 'zero-point-core');
    const before = core.army.manpower;
    processFinanceMilitaryV2(
      engine.state,
      engine.content,
      createFinancePlansV2(engine.state, engine.content),
    );
    expect(core.army.manpower).toBeGreaterThan(before);
    expect(rogueWaveManpowerAtV2(engine.state, 'zero-point-core')).toBe(0);
    expect(verifiedWaveTotal(engine)).toBe(0);
  });

  it('still manufactures five percent when non-gateway Antarctic sources are depleted', () => {
    const engine = formedSurvival(93_105);
    for (const territoryId of ANTARCTIC_TERRITORY_IDS_V2) {
      clearRogueWaveManpowerV2(engine.state, territoryId);
      if (!(ANTARCTIC_GATEWAY_IDS_V2 as readonly string[]).includes(territoryId)) {
        engine.state.territories[territoryId]!.army.manpower = 0;
      }
    }
    const requested = rogueAnnualWaveManpowerV2(engine.state);
    const liveBefore = rogueActiveArmyManpowerV2(engine.state);
    expect(requested).toBeGreaterThan(0);
    engine.state.tick = engine.state.polarEndgame.nextCounteroffensiveTick!;

    expect(processRogueAiSurvivalV2(engine.state, engine.content).waveStarted).toBe(1);
    expect(verifiedWaveTotal(engine)).toBeCloseTo(requested, 8);
    expect(rogueActiveArmyManpowerV2(engine.state)).toBeCloseTo(
      liveBefore + requested,
      8,
    );
    const report = [...engine.state.events].reverse().find((event) => (
      event.message.startsWith('ROGUE WAVE 1:')
    ))?.message;
    expect(report).toContain('5% of the live machine army');
    expect(report).toContain('newly manufactured units');
  });
});
