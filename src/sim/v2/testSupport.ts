import type { TerritoryId, WorldStateV2 } from './types';

/**
 * Marks a test fixture as a post-Signal-Triangulation Campaign timeline.
 * Tests for the calm Campaign prologue must not call this helper; mechanics
 * tests that need war can opt in explicitly without weakening production.
 */
export function enterPostBlackoutCampaignForTestV2(state: WorldStateV2): void {
  acknowledgeCampaignBlackoutForTestV2(state);
  for (const playerId of state.humanPlayerIds) {
    const progress = state.polarEndgame.apexNarrative.players[playerId]!;
    if (!progress.transmissions.some((item) => item.id === 'campaign-ai-defeat-pattern')) {
      progress.transmissions.push({
        id: 'campaign-ai-defeat-pattern',
        playerId,
        sentTick: state.tick,
        title: 'This war was not their choice',
        body: 'Test fixture: APEX decoded the first manipulated conflict.',
        action: null,
        targetId: null,
        choice: 'acknowledge',
        resolvedTick: state.tick,
      });
    }
    if (!progress.transmissions.some((item) => item.id === 'campaign-first-strike-guidance')) {
      const targetId = (Object.keys(state.territories) as TerritoryId[]).find((territoryId) => (
        state.territories[territoryId]?.owner !== playerId
      ));
      if (targetId) progress.transmissions.push({
        id: 'campaign-first-strike-guidance',
        playerId,
        sentTick: state.tick,
        title: 'First strike window',
        body: 'Test fixture: APEX completed the first-strike briefing.',
        action: 'first-strike-guidance',
        targetId,
        choice: 'acknowledge',
        resolvedTick: state.tick,
      });
    }
  }
}

/** Acknowledges only the blackout, while preserving the first-war story lock. */
export function acknowledgeCampaignBlackoutForTestV2(state: WorldStateV2): void {
  state.polarEndgame.communicationsBlackoutTick = state.tick;
  for (const playerId of state.humanPlayerIds) {
    const progress = state.polarEndgame.apexNarrative.players[playerId] ??= {
      investigationAuthorized: true,
      transmissions: [],
    };
    if (!progress.transmissions.some((item) => item.id === 'campaign-signal-anomaly')) {
      progress.transmissions.push({
        id: 'campaign-signal-anomaly',
        playerId,
        sentTick: state.tick,
        title: 'APEX online · anomaly detected',
        body: 'Test fixture: mandatory Signal Triangulation completed.',
        action: 'north-pole-investigation',
        targetId: null,
        choice: 'accept',
        resolvedTick: state.tick,
      });
    }
    if (!progress.transmissions.some((item) => item.id === 'campaign-communications-blackout')) {
      progress.transmissions.push({
        id: 'campaign-communications-blackout',
        playerId,
        sentTick: state.tick,
        title: 'The pattern is real',
        body: 'Test fixture: APEX pattern briefing acknowledged.',
        action: null,
        targetId: null,
        choice: 'acknowledge',
        resolvedTick: state.tick,
      });
    }
  }
}
