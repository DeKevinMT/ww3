import { describe, expect, it } from 'vitest';
import { AI_FIRST_WAR_TICK } from './balance';
import { createWorldStateV2 } from './bootstrap';
import { synchronizeArmyCapacityV2 } from './capacity';
import {
  campaignBlackoutBriefingAcknowledgedV2,
  campaignAiVsAiWarOpeningTickV2,
  campaignAiVsAiWarsUnlockedV2,
  campaignHumanWarsUnlockedV2,
  campaignWarsUnlockedV2,
} from './campaignPrologue';
import { WORLD_CONTENT_V2 } from './content';
import { loadSaveV2, serializeSaveV2 } from './persistence';

describe('Campaign prologue cadence', () => {
  it('keeps player war commands unlocked even with an unresolved legacy briefing', () => {
    const state = createWorldStateV2(77_000, WORLD_CONTENT_V2);
    const playerId = state.humanPlayerId;
    state.tick = 20;
    state.polarEndgame.apexNarrative.players[playerId] = {
      investigationAuthorized: false,
      transmissions: [{
        id: 'campaign-communications-blackout',
        playerId,
        sentTick: 20,
        title: 'Legacy tutorial briefing',
        body: 'This no longer gates play.',
        action: null,
        targetId: null,
        choice: null,
        resolvedTick: null,
      }],
    };

    expect(campaignBlackoutBriefingAcknowledgedV2(state, WORLD_CONTENT_V2)).toBe(true);
    expect(campaignWarsUnlockedV2(state, WORLD_CONTENT_V2)).toBe(true);
    expect(campaignHumanWarsUnlockedV2(state, WORLD_CONTENT_V2, playerId)).toBe(true);
  });

  it('uses the ordinary global AI-war floor without a blackout-relative gate', () => {
    const state = createWorldStateV2(77_001, WORLD_CONTENT_V2);
    state.polarEndgame.communicationsBlackoutTick = 20;
    expect(campaignAiVsAiWarOpeningTickV2(state, WORLD_CONTENT_V2)).toBe(AI_FIRST_WAR_TICK);
    state.tick = AI_FIRST_WAR_TICK - 1;
    expect(campaignAiVsAiWarsUnlockedV2(state, WORLD_CONTENT_V2)).toBe(false);
    state.tick = AI_FIRST_WAR_TICK;
    expect(campaignAiVsAiWarsUnlockedV2(state, WORLD_CONTENT_V2)).toBe(true);

    const nonCampaign = { ...WORLD_CONTENT_V2, metadata: { scenarioId: 'survival' } };
    expect(campaignAiVsAiWarOpeningTickV2(state, nonCampaign)).toBe(AI_FIRST_WAR_TICK);
  });

  it('preserves the ordinary AI-war floor across reconnect', () => {
    const state = createWorldStateV2(77_002, WORLD_CONTENT_V2);
    state.polarEndgame.communicationsBlackoutTick = 20;
    state.tick = AI_FIRST_WAR_TICK - 1;
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const loaded = loadSaveV2(
      serializeSaveV2(state, WORLD_CONTENT_V2),
      WORLD_CONTENT_V2,
    );
    expect(campaignAiVsAiWarOpeningTickV2(loaded, WORLD_CONTENT_V2)).toBe(AI_FIRST_WAR_TICK);
    expect(campaignAiVsAiWarsUnlockedV2(loaded, WORLD_CONTENT_V2)).toBe(false);
    loaded.tick = AI_FIRST_WAR_TICK;
    expect(campaignAiVsAiWarsUnlockedV2(loaded, WORLD_CONTENT_V2)).toBe(true);
  });
});
