import { describe, expect, it } from 'vitest';
import {
  AI_OFFENSIVE_EXHAUSTION_ARMY_FILL_RATIO,
  WAR_MOBILIZATION_TICKS,
  round,
} from './balance';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import type { PlayerId, WarStateV2, WorldStateV2 } from './types';
import { nationIdV2 } from './types';
import { enterPostBlackoutCampaignForTestV2 } from './testSupport';
import {
  aiAttackerIsOffensivelyExhaustedV2,
  aiAttackerMustStandDownV2,
  processWarsV2,
  warDeclarationStatusV2,
} from './war';

function setHuman(state: WorldStateV2, humanId: PlayerId): void {
  state.humanPlayerId = humanId;
  state.humanPlayerIds = [humanId];
}

function setNationalArmyFill(state: WorldStateV2, playerId: PlayerId, fillRatio: number): void {
  for (const territory of Object.values(state.territories)) {
    if (territory.owner !== playerId) continue;
    territory.army.manpower = round(territory.army.capacity * fillRatio, 9);
  }
}

function activeWar(attackerId: PlayerId, defenderId: PlayerId, tick: number): WarStateV2 {
  return {
    id: 'war-ai-exhaustion',
    attackerId,
    defenderId,
    startedTick: 0,
    lastBattleTick: tick,
    warScore: 0,
    battles: 0,
    attackerLosses: 0,
    defenderLosses: 0,
    lastPeaceOfferTick: -1_000_000,
    attackerOperations: [],
    defenderOperations: [],
  };
}

describe('AI offensive exhaustion', () => {
  it('blocks a new AI invasion at 10% current capacity without changing the human rule', () => {
    const aiState = createWorldStateV2(91_001, WORLD_CONTENT_V2);
    const attacker = nationIdV2('lux');
    const defender = nationIdV2('bel');
    setHuman(aiState, defender);
    enterPostBlackoutCampaignForTestV2(aiState);
    aiState.wars = [];
    aiState.truces = [];
    aiState.ceasefireObligations = [];
    setNationalArmyFill(aiState, attacker, AI_OFFENSIVE_EXHAUSTION_ARMY_FILL_RATIO);

    expect(aiAttackerIsOffensivelyExhaustedV2(aiState, attacker)).toBe(true);
    expect(warDeclarationStatusV2(aiState, WORLD_CONTENT_V2, attacker, defender)).toMatchObject({
      allowed: false,
      reason: expect.stringMatching(/10%.*capacity/i),
    });

    const humanState = createWorldStateV2(91_001, WORLD_CONTENT_V2);
    setHuman(humanState, attacker);
    enterPostBlackoutCampaignForTestV2(humanState);
    humanState.wars = [];
    humanState.truces = [];
    humanState.ceasefireObligations = [];
    setNationalArmyFill(humanState, attacker, AI_OFFENSIVE_EXHAUSTION_ARMY_FILL_RATIO);

    expect(aiAttackerIsOffensivelyExhaustedV2(humanState, attacker)).toBe(false);
    expect(warDeclarationStatusV2(humanState, WORLD_CONTENT_V2, attacker, defender).allowed).toBe(true);

    expect(humanState.offers).toEqual([]);
  });

  it('keeps defensive counterattacks active while the exhausted AI attacker stands down', () => {
    const state = createWorldStateV2(91_003, WORLD_CONTENT_V2);
    const attacker = nationIdV2('lux');
    const defender = nationIdV2('bel');
    setHuman(state, defender);
    state.tick = WAR_MOBILIZATION_TICKS;
    const war = activeWar(attacker, defender, state.tick);
    state.wars = [war];
    state.offers = [];
    setNationalArmyFill(state, attacker, AI_OFFENSIVE_EXHAUSTION_ARMY_FILL_RATIO);

    expect(aiAttackerMustStandDownV2(state, war)).toBe(true);
    const battles = processWarsV2(state, WORLD_CONTENT_V2);
    expect(battles.length).toBeGreaterThan(0);
    expect(battles.every((battle) => battle.attackerId === defender)).toBe(true);
    expect(battles.some((battle) => battle.attackerId === attacker)).toBe(false);
  });

});
