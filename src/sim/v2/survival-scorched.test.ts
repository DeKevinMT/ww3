import { describe, expect, it } from 'vitest';
import { WorldEngineV2 } from './WorldEngineV2';
import { assertInvariantsV2 } from './invariants';
import { canonicalStateHashV2, type SaveGameV2 } from './persistence';
import { resolveScenarioV2 } from './scenarios';
import {
  enforceSurvivalScorchedWorldV2,
  markSurvivalScorchedTerritoryV2,
} from './survivalEmpire';
import { territoryIdV2 } from './types';

function formedSurvival(seed: number): WorldEngineV2 {
  const { content } = resolveScenarioV2({ mode: 'survival', seed });
  const engine = new WorldEngineV2(seed, content);
  expect(engine.chooseCountry('bel')).toEqual({ accepted: true });
  expect(engine.formSurvivalEmpire('bel', [])).toEqual({ accepted: true });
  return engine;
}

function installLegacyScorch(engine: WorldEngineV2, rawId = 'sen') {
  const territoryId = territoryIdV2(rawId);
  const territory = engine.state.territories[territoryId]!;
  territory.population = 0;
  territory.economy = 0;
  territory.army.capacity = 0;
  territory.integration = 0;
  delete territory.integrationProgram;
  engine.state.runProgression.scorchedWorldTerritoryIds = [territoryId];
  return { territoryId, territory };
}

describe('retired Survival scorched-world compatibility', () => {
  it('repairs a legacy corridor to canonical full civilian stats and clears the registry', () => {
    const engine = formedSurvival(72_101);
    const { territoryId, territory } = installLegacyScorch(engine);
    const baseline = engine.content.territories[territoryId]!.baseline;

    enforceSurvivalScorchedWorldV2(engine.state, engine.content);

    expect(engine.state.runProgression.scorchedWorldTerritoryIds).toEqual([]);
    expect(territory.population).toBe(baseline.population);
    expect(territory.economy).toBe(baseline.gdp);
    expect(territory.integration).toBe(1);
    expect(territory.coreOwner).toBe(territory.owner);
    expect(territory.integrationProgram).toBeUndefined();
    expect(territory.army.capacity).toBeGreaterThan(0);
    assertInvariantsV2(engine.state, engine.content);
  });

  it('keeps the retired marking API as a no-op for compatibility callers', () => {
    const engine = formedSurvival(72_102);
    const territoryId = territoryIdV2('sen');
    const before = structuredClone(engine.state.territories[territoryId]);

    markSurvivalScorchedTerritoryV2(engine.state, engine.content, territoryId);

    expect(engine.state.runProgression.scorchedWorldTerritoryIds).toEqual([]);
    expect(engine.state.territories[territoryId]).toEqual(before);
  });

  it('migrates an authenticated old save on load and never re-zeroes it on later weeks', () => {
    const engine = formedSurvival(72_103);
    const territoryId = territoryIdV2('sen');
    const baseline = engine.content.territories[territoryId]!.baseline;
    const saved = JSON.parse(engine.save()) as SaveGameV2;
    saved.territories[territoryId]!.population = 0;
    saved.territories[territoryId]!.economy = 0;
    saved.territories[territoryId]!.army.capacity = 0;
    saved.territories[territoryId]!.integration = 0;
    delete saved.territories[territoryId]!.integrationProgram;
    saved.runProgression.scorchedWorldTerritoryIds = [territoryId];
    saved.canonicalStateHash = canonicalStateHashV2(saved);

    const loaded = WorldEngineV2.fromSave(saved, engine.content);
    const restored = loaded.state.territories[territoryId]!;
    expect(loaded.state.runProgression.scorchedWorldTerritoryIds).toEqual([]);
    expect(restored.population).toBe(baseline.population);
    expect(restored.economy).toBe(baseline.gdp);
    expect(restored.army.capacity).toBeGreaterThan(0);

    loaded.step(4);
    expect(restored.population).toBeGreaterThan(0);
    expect(restored.economy).toBeGreaterThan(0);
    expect(loaded.state.runProgression.scorchedWorldTerritoryIds).toEqual([]);
    assertInvariantsV2(loaded.state, loaded.content);
  });
});
