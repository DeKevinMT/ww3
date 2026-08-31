import { describe, expect, it } from 'vitest';
import { WorldEngineV2 } from './WorldEngineV2';
import { createWorldStateV2, openingConflictScheduleV2 } from './bootstrap';
import { V2_CONTENT_VERSION } from './balance';
import { invariantErrorsV2 } from './invariants';
import { strategicAlignmentScoreV2, geopoliticalTargetGuidanceV2 } from './geopolitics';
import { initialTrainedReserveManpowerV2 } from './reserveForces';
import {
  resolveScenarioV2,
  scenarioConfigFromEngineV2,
  scenarioConfigFromSaveHeaderV2,
} from './scenarios';
import { nationIdV2 } from './types';

describe('scenario resolution and Alternative Universe policies', () => {
  it('resolves Standard compatibly and Alternative Universe deterministically', () => {
    const standard = resolveScenarioV2({ mode: 'standard-2026', seed: 73_001 });
    expect(standard.content.metadata?.contentVersion).toBe(V2_CONTENT_VERSION);

    const first = resolveScenarioV2({ mode: 'random-world', seed: 73_001 });
    const repeated = resolveScenarioV2({ mode: 'random-world', seed: 73_001 });
    expect(repeated.content).toEqual(first.content);
    expect(first.content.metadata).toMatchObject({
      scenarioId: 'random-world',
      scenarioVersion: 2,
      generatedFromSeed: 73_001,
      openingProfile: 'none',
      geopoliticsProfile: 'neutral',
      reserveProfile: 'generated',
    });
  });

  it('starts Alternative Universe without real opening crises, conflicts or geopolitics', () => {
    const { content } = resolveScenarioV2({ mode: 'random-world', seed: 73_002 });
    const state = createWorldStateV2(73_002, content);
    expect(openingConflictScheduleV2(state.seed, content)).toEqual([]);
    expect(state.events.some((event) => event.kind === 'critical')).toBe(false);
    expect(strategicAlignmentScoreV2(nationIdV2('prk'), nationIdV2('rus'), content)).toBe(0);
    expect(geopoliticalTargetGuidanceV2(nationIdV2('rus'), nationIdV2('ukr'), content)).toBe(0);
    expect(initialTrainedReserveManpowerV2('fin', 1, content)).toBe(0);
    expect(initialTrainedReserveManpowerV2('fin', 1)).toBe(0);
    expect(invariantErrorsV2(state, content)).toEqual([]);
  });

  it('rebuilds Alternative Universe from a schema-22 save header and rejects mismatched content', () => {
    const resolved = resolveScenarioV2({ mode: 'random-world', seed: 73_003 });
    const engine = new WorldEngineV2(73_003, resolved.content);
    const serialized = engine.save();
    expect(scenarioConfigFromSaveHeaderV2(serialized)).toEqual(resolved.config);

    const restored = WorldEngineV2.fromSave(serialized);
    expect(scenarioConfigFromEngineV2(restored)).toEqual(resolved.config);
    expect(restored.canonicalHash()).toBe(engine.canonicalHash());

    const wrongContent = resolveScenarioV2({ mode: 'random-world', seed: 73_004 }).content;
    expect(() => WorldEngineV2.fromSave(serialized, wrongContent)).toThrow(/contentVersion/i);
    const mismatchedState = structuredClone(engine.state);
    mismatchedState.contentVersion = V2_CONTENT_VERSION;
    expect(invariantErrorsV2(mismatchedState, resolved.content))
      .toContain('Canonical state does not match the supplied scenario content version.');
    const wrongSeedState = structuredClone(engine.state);
    wrongSeedState.seed += 1;
    expect(invariantErrorsV2(wrongSeedState, resolved.content))
      .toContain('Canonical state seed does not match the generated scenario seed.');
  });

  it('fails closed on unknown generated content identities', () => {
    expect(() => scenarioConfigFromSaveHeaderV2({
      seed: 1,
      contentVersion: 'random-world-v999@unknown:seed-1',
    })).toThrow(/Unsupported V2 contentVersion/);
  });
});
