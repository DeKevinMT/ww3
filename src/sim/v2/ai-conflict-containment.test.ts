import { describe, expect, it } from 'vitest';
import {
  activeAutonomousAiVsAiWarsV2,
  autonomousAiVsAiWarCapV2,
  CAMPAIGN_SINGLE_AI_VS_AI_WAR_PHASE_TICKS_V2,
  CAMPAIGN_TWO_AI_VS_AI_WAR_PHASE_TICKS_V2,
} from './ai';
import { STALE_WAR_TICKS } from './balance';
import { createWorldStateV2 } from './bootstrap';
import { ROGUE_AI_NATION_ID_V2, WORLD_CONTENT_V2 } from './content';
import { enterPostBlackoutCampaignForTestV2 } from './testSupport';
import { nationIdV2, territoryIdV2 } from './types';
import {
  declareWarV2,
  processWarsV2,
} from './war';

describe('contained background AI conflicts', () => {
  it('never persists a synthetic land-health field in Campaign homelands', () => {
    const state = createWorldStateV2(7);
    expect(state.territories[territoryIdV2('grl')]).not.toHaveProperty('condition');
    expect(state.territories[territoryIdV2('bel')]).not.toHaveProperty('condition');
    expect(state.territories[territoryIdV2('sdn')]).not.toHaveProperty('condition');
  });

  it('keeps background AI wars at one early, two midgame and three only late', () => {
    const state = createWorldStateV2(10);
    state.polarEndgame.communicationsBlackoutTick = 20;
    state.tick = 20 + CAMPAIGN_SINGLE_AI_VS_AI_WAR_PHASE_TICKS_V2 - 1;
    expect(autonomousAiVsAiWarCapV2(state, WORLD_CONTENT_V2, 190)).toBe(1);
    state.tick += 1;
    expect(autonomousAiVsAiWarCapV2(state, WORLD_CONTENT_V2, 190)).toBe(2);
    state.tick = 20 + CAMPAIGN_TWO_AI_VS_AI_WAR_PHASE_TICKS_V2;
    expect(autonomousAiVsAiWarCapV2(state, WORLD_CONTENT_V2, 190)).toBe(3);
  });

  it('does not charge human or Rogue wars to the background AI conflict budget', () => {
    const state = createWorldStateV2(12);
    state.humanPlayerId = nationIdV2('grl');
    state.humanPlayerIds = [nationIdV2('grl')];
    const war = (id: string, attackerId: ReturnType<typeof nationIdV2>, defenderId: ReturnType<typeof nationIdV2>) => ({
      id,
      attackerId,
      defenderId,
      startedTick: 0,
      lastBattleTick: 0,
      warScore: 0,
      battles: 0,
      attackerLosses: 0,
      defenderLosses: 0,
      attackerCivilianLosses: 0,
      defenderCivilianLosses: 0,
      lastPeaceOfferTick: -1_000_000,
      attackerOperations: [],
      defenderOperations: [],
    });
    state.wars = [
      war('war-ai', nationIdV2('rus'), nationIdV2('ukr')),
      war('war-human', nationIdV2('grl'), nationIdV2('isl')),
      war('war-rogue', ROGUE_AI_NATION_ID_V2, nationIdV2('arg')),
    ];

    expect(activeAutonomousAiVsAiWarsV2(state, WORLD_CONTENT_V2)).toBe(1);
  });

  it('closes an ordinary AI-vs-AI campaign after a full stale-front window', () => {
    const state = createWorldStateV2(11);
    state.humanPlayerId = nationIdV2('grl');
    state.humanPlayerIds = [nationIdV2('grl')];
    enterPostBlackoutCampaignForTestV2(state);
    state.players[nationIdV2('rus')]!.treasury = 1_000_000;
    expect(declareWarV2(
      state, WORLD_CONTENT_V2, nationIdV2('rus'), nationIdV2('ukr'),
    ).accepted).toBe(true);

    const startedTick = state.wars[0]!.startedTick;
    state.tick = startedTick + STALE_WAR_TICKS;
    const conclusions: Parameters<typeof processWarsV2>[3] = [];
    processWarsV2(state, WORLD_CONTENT_V2, undefined, conclusions);

    expect(state.wars).toHaveLength(0);
    expect(conclusions?.[0]?.reason).toContain('without a legal battle front');
  });
});
