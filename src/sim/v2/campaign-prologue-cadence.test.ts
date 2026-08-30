import { describe, expect, it } from 'vitest';
import { AI_FIRST_WAR_TICK } from './balance';
import { createWorldStateV2 } from './bootstrap';
import { synchronizeArmyCapacityV2 } from './capacity';
import {
  CAMPAIGN_AI_VS_AI_POST_BLACKOUT_GRACE_TICKS_V2,
  campaignBlackoutBriefingAcknowledgedV2,
  campaignAiVsAiWarOpeningTickV2,
  campaignAiVsAiWarsUnlockedV2,
} from './campaignPrologue';
import { WORLD_CONTENT_V2 } from './content';
import { loadSaveV2, serializeSaveV2 } from './persistence';

describe('Campaign prologue cadence', () => {
  it('never starts the proof conflict underneath an unread blackout briefing', () => {
    const state = createWorldStateV2(77_000, WORLD_CONTENT_V2);
    const playerId = state.humanPlayerId;
    state.tick = 200;
    state.polarEndgame.communicationsBlackoutTick = 20;
    state.polarEndgame.apexNarrative.players[playerId] = {
      investigationAuthorized: true,
      transmissions: [{
        id: 'campaign-signal-anomaly',
        playerId,
        sentTick: 6,
        title: 'APEX online',
        body: 'Signal Triangulation completed.',
        action: 'north-pole-investigation',
        targetId: null,
        choice: 'accept',
        resolvedTick: 6,
      }, {
        id: 'campaign-communications-blackout',
        playerId,
        sentTick: 20,
        title: 'The pattern is real',
        body: 'Read this briefing first.',
        action: null,
        targetId: null,
        choice: null,
        resolvedTick: null,
      }],
    };

    expect(campaignBlackoutBriefingAcknowledgedV2(state, WORLD_CONTENT_V2)).toBe(false);
    expect(campaignAiVsAiWarsUnlockedV2(state, WORLD_CONTENT_V2)).toBe(false);
    const briefing = state.polarEndgame.apexNarrative.players[playerId]!.transmissions[1]!;
    briefing.choice = 'acknowledge';
    briefing.resolvedTick = state.tick;
    expect(campaignBlackoutBriefingAcknowledgedV2(state, WORLD_CONTENT_V2)).toBe(true);
    expect(campaignAiVsAiWarsUnlockedV2(state, WORLD_CONTENT_V2)).toBe(true);
  });

  it('uses the short Campaign proof-war floor without changing the global AI floor', () => {
    const state = createWorldStateV2(77_001, WORLD_CONTENT_V2);
    state.tick = 1_000;
    expect(campaignAiVsAiWarOpeningTickV2(state, WORLD_CONTENT_V2))
      .toBe(Number.POSITIVE_INFINITY);
    expect(campaignAiVsAiWarsUnlockedV2(state, WORLD_CONTENT_V2)).toBe(false);

    state.polarEndgame.communicationsBlackoutTick = 20;
    const opensTick = 20 + CAMPAIGN_AI_VS_AI_POST_BLACKOUT_GRACE_TICKS_V2;
    expect(campaignAiVsAiWarOpeningTickV2(state, WORLD_CONTENT_V2)).toBe(opensTick);
    state.tick = opensTick - 1;
    expect(campaignAiVsAiWarsUnlockedV2(state, WORLD_CONTENT_V2)).toBe(false);
    state.tick = opensTick;
    expect(campaignAiVsAiWarsUnlockedV2(state, WORLD_CONTENT_V2)).toBe(true);

    const nonCampaign = { ...WORLD_CONTENT_V2, metadata: { scenarioId: 'survival' } };
    expect(campaignAiVsAiWarOpeningTickV2(state, nonCampaign)).toBe(AI_FIRST_WAR_TICK);
  });

  it('gives a late Stage-I completion the same six-week reaction window across reconnect', () => {
    const state = createWorldStateV2(77_002, WORLD_CONTENT_V2);
    state.polarEndgame.communicationsBlackoutTick = 200;
    const opensTick = 200 + CAMPAIGN_AI_VS_AI_POST_BLACKOUT_GRACE_TICKS_V2;
    expect(campaignAiVsAiWarOpeningTickV2(state, WORLD_CONTENT_V2)).toBe(opensTick);

    state.tick = opensTick - 1;
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const loaded = loadSaveV2(
      serializeSaveV2(state, WORLD_CONTENT_V2),
      WORLD_CONTENT_V2,
    );
    expect(campaignAiVsAiWarsUnlockedV2(loaded, WORLD_CONTENT_V2)).toBe(false);
    loaded.tick = opensTick;
    expect(campaignAiVsAiWarsUnlockedV2(loaded, WORLD_CONTENT_V2)).toBe(true);
  });
});
