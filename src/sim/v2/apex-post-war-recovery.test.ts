import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { synchronizeArmyCapacityV2 } from './capacity';
import { WORLD_CONTENT_V2 } from './content';
import { processApexNarrativeV2, selectApexTransmissionsV2 } from './apexNarrative';
import { CAMPAIGN_TUTORIAL_TRANSMISSION_IDS_V2 } from './campaignTutorial';
import { loadSaveV2, serializeSaveV2 } from './persistence';
import { resolveScenarioV2 } from './scenarios';

describe('retired EONSCAR post-war recovery tutorial', () => {
  it('does not appear after quiet time, a later tick, or reconnect', () => {
    const state = createWorldStateV2(89_201, WORLD_CONTENT_V2);
    const playerId = state.humanPlayerId;
    for (const tick of [20, 34, 100]) {
      state.tick = tick;
      expect(processApexNarrativeV2(state, WORLD_CONTENT_V2)).toBe(0);
    }
    expect(selectApexTransmissionsV2(state, playerId)
      .some((item) => item.id === 'campaign-first-war-recovery')).toBe(false);

    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const serialized = serializeSaveV2(state, WORLD_CONTENT_V2);
    const loaded = loadSaveV2(serialized, WORLD_CONTENT_V2);
    loaded.tick += 100;
    expect(processApexNarrativeV2(loaded, WORLD_CONTENT_V2)).toBe(0);
    expect(selectApexTransmissionsV2(loaded, playerId)
      .filter((item) => CAMPAIGN_TUTORIAL_TRANSMISSION_IDS_V2.includes(item.id)))
      .toEqual([]);
  });

  it('stays absent from Survival and Alternative Universe', () => {
    for (const mode of ['survival', 'random-world'] as const) {
      const content = resolveScenarioV2({ mode, seed: 89_204 }).content;
      const state = createWorldStateV2(89_204, content);
      state.tick = 100;
      processApexNarrativeV2(state, content);
      expect(selectApexTransmissionsV2(state, state.humanPlayerId)
        .some((item) => item.id === 'campaign-first-war-recovery')).toBe(false);
    }
  });
});
