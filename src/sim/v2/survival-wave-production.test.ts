import { describe, expect, it } from 'vitest';
import { WorldEngineV2 } from './WorldEngineV2';
import { ROGUE_AI_NATION_ID_V2 } from './content';
import { resolveScenarioV2 } from './scenarios';
import {
  ROGUE_AI_CORE_TERRITORY_ID_V2,
  processRogueAiSurvivalV2,
  survivalWaveStagingManpowerV2,
} from './survival';
import {
  clearRogueWaveManpowerV2,
  rogueWaveManpowerAtV2,
} from './survivalProvenance';

function longHorizonWaveProduction(seed: number): {
  staged: number[];
  signature: string;
  finalWave: number;
} {
  const { content } = resolveScenarioV2({ mode: 'survival', seed });
  const engine = new WorldEngineV2(seed, content);
  expect(engine.chooseCountry('grl')).toEqual({ accepted: true });
  expect(engine.formSurvivalEmpire('grl', [])).toEqual({ accepted: true });
  const rogue = engine.state.players[ROGUE_AI_NATION_ID_V2]!;
  const core = engine.state.territories[ROGUE_AI_CORE_TERRITORY_ID_V2]!;

  // Prove the scheduler does not consume a hidden peacetime stockpile. A full
  // unverified core also proves placeholders are displaced, never re-labelled.
  rogue.trainedReserves = 0;
  core.army.manpower = core.army.capacity;
  clearRogueWaveManpowerV2(engine.state, ROGUE_AI_CORE_TERRITORY_ID_V2);

  const staged: number[] = [];
  for (let wave = 1; wave <= 24; wave += 1) {
    engine.state.tick = engine.state.polarEndgame.nextCounteroffensiveTick!;
    const result = processRogueAiSurvivalV2(engine.state, engine.content);
    const authored = survivalWaveStagingManpowerV2(wave);
    const verified = rogueWaveManpowerAtV2(
      engine.state,
      ROGUE_AI_CORE_TERRITORY_ID_V2,
    );

    expect(result.waveStarted).toBe(wave);
    expect(verified).toBeCloseTo(authored, 8);
    expect(verified).toBeLessThan(core.army.manpower);
    expect(rogue.trainedReserves).toBeCloseTo(0, 8);
    expect(core.army.manpower).toBeCloseTo(core.army.capacity, 8);
    staged.push(verified);

    // Represents the already-covered normal logistics convoy leaving Zero
    // Point; no production or recruitment is invoked between due waves.
    core.army.manpower -= verified;
    clearRogueWaveManpowerV2(engine.state, ROGUE_AI_CORE_TERRITORY_ID_V2);
  }

  return {
    staged,
    signature: JSON.stringify({
      tick: engine.state.tick,
      nextCounteroffensiveTick: engine.state.polarEndgame.nextCounteroffensiveTick,
      gatewayBreachOrder: engine.state.polarEndgame.gatewayBreachOrder,
      gatewayBreaches: engine.state.polarEndgame.gatewayBreaches,
      research: rogue.research.effectLevels,
    }),
    finalWave: engine.state.polarEndgame.globalWave,
  };
}

describe('endless authored Survival wave production', () => {
  it('manufactures deterministic genuine Zero-Point waves beyond wave twenty', () => {
    const first = longHorizonWaveProduction(93_101);
    const replay = longHorizonWaveProduction(93_101);

    expect(first).toEqual(replay);
    expect(first.finalWave).toBe(25);
    expect(first.staged).toHaveLength(24);
    expect(first.staged[20]).toBeCloseTo(survivalWaveStagingManpowerV2(21), 8);
    expect(first.staged[23]).toBeGreaterThan(first.staged[20]!);
  });
});
