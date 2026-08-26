import { describe, expect, it } from 'vitest';
import { planAiCommandsV2 } from './ai';
import {
  AI_EXHAUSTION_CEASEFIRE_COST_MULTIPLIER,
  AI_OFFENSIVE_EXHAUSTION_ARMY_FILL_RATIO,
  CEASEFIRE_PAYMENT_WEEKS,
  NATIONAL_AI_REVIEW_TICKS,
  PEACE_REQUEST_MIN_WAR_AGE_TICKS,
  WAR_MOBILIZATION_TICKS,
  round,
} from './balance';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { createFinancePlansV2 } from './economy';
import type { PlayerId, WarStateV2, WorldStateV2 } from './types';
import { nationIdV2 } from './types';
import {
  aiAttackerIsOffensivelyExhaustedV2,
  aiAttackerMustStandDownV2,
  ceasefireTermsV2,
  processWarsV2,
  requestCeasefireV2,
  respondToOfferV2,
  warDeclarationStatusV2,
  type WarConclusionV2,
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
    humanState.wars = [];
    humanState.truces = [];
    humanState.ceasefireObligations = [];
    setNationalArmyFill(humanState, attacker, AI_OFFENSIVE_EXHAUSTION_ARMY_FILL_RATIO);

    expect(aiAttackerIsOffensivelyExhaustedV2(humanState, attacker)).toBe(false);
    expect(warDeclarationStatusV2(humanState, WORLD_CONTENT_V2, attacker, defender).allowed).toBe(true);

    humanState.tick = PEACE_REQUEST_MIN_WAR_AGE_TICKS;
    const humanWar = activeWar(attacker, defender, humanState.tick);
    humanState.wars = [humanWar];
    const ordinaryHumanTerms = ceasefireTermsV2(
      humanState,
      WORLD_CONTENT_V2,
      humanWar.id,
      attacker,
    );
    expect(ordinaryHumanTerms.allowed).toBe(true);
    expect(requestCeasefireV2(
      humanState,
      WORLD_CONTENT_V2,
      humanWar.id,
      attacker,
    ).accepted).toBe(true);
    expect(humanState.offers[0]?.weeklyCost).toBe(ordinaryHumanTerms.weeklyCost);
  });

  it('requests the attacker-paid peace deal immediately and charges exactly 1.5x', () => {
    const state = createWorldStateV2(91_002, WORLD_CONTENT_V2);
    const attacker = nationIdV2('lux');
    const defender = nationIdV2('bel');
    setHuman(state, defender);
    state.tick = NATIONAL_AI_REVIEW_TICKS;
    state.wars = [activeWar(attacker, defender, state.tick)];
    state.offers = [];
    setNationalArmyFill(state, attacker, AI_OFFENSIVE_EXHAUSTION_ARMY_FILL_RATIO);

    // Establish the canonical ordinary price on the same economy, then put the
    // young war back inside the normally locked one-year peace window.
    const war = state.wars[0]!;
    war.startedTick = state.tick - PEACE_REQUEST_MIN_WAR_AGE_TICKS;
    const ordinaryTerms = ceasefireTermsV2(state, WORLD_CONTENT_V2, war.id, attacker);
    expect(ordinaryTerms.allowed).toBe(true);
    war.startedTick = 0;
    expect(ceasefireTermsV2(state, WORLD_CONTENT_V2, war.id, attacker).allowed).toBe(false);

    const commands = planAiCommandsV2(state, WORLD_CONTENT_V2);
    expect(commands).toContainEqual({
      type: 'request-ceasefire',
      warId: war.id,
      requesterId: attacker,
    });
    expect(commands.some((command) => (
      command.type === 'declare-war' && command.attackerId === attacker
    ))).toBe(false);

    expect(requestCeasefireV2(state, WORLD_CONTENT_V2, war.id, attacker).accepted).toBe(true);
    const offer = state.offers.find((candidate) => candidate.warId === war.id)!;
    const expectedWeeklyPayment = round(
      ordinaryTerms.weeklyCost * AI_EXHAUSTION_CEASEFIRE_COST_MULTIPLIER,
    );
    expect(offer).toMatchObject({
      fromId: attacker,
      toId: defender,
      settlement: 'ceasefire',
      weeklyCost: expectedWeeklyPayment,
      paymentWeeks: CEASEFIRE_PAYMENT_WEEKS,
    });

    const conclusions: WarConclusionV2[] = [];
    expect(respondToOfferV2(
      state,
      WORLD_CONTENT_V2,
      offer.id,
      true,
      conclusions,
    ).accepted).toBe(true);
    expect(state.wars).toHaveLength(0);
    expect(conclusions).toHaveLength(1);
    expect(conclusions[0]?.settlement).toMatchObject({
      kind: 'ceasefire',
      payerId: attacker,
      payeeId: defender,
      weeklyCost: expectedWeeklyPayment,
      paymentWeeks: CEASEFIRE_PAYMENT_WEEKS,
    });
    expect(state.ceasefireObligations).toContainEqual(expect.objectContaining({
      payerId: attacker,
      payeeId: defender,
      weeklyCost: expectedWeeklyPayment,
    }));

    state.tick += 1;
    const finance = createFinancePlansV2(state, WORLD_CONTENT_V2);
    expect(finance.get(attacker)?.ceasefirePayment).toBe(expectedWeeklyPayment);
    expect(finance.get(defender)?.ceasefireIncome).toBe(expectedWeeklyPayment);
  }, 15_000);

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

  it('keeps a recovered AI attacker stood down until its outgoing peace offer is handled', () => {
    const state = createWorldStateV2(91_004, WORLD_CONTENT_V2);
    const attacker = nationIdV2('lux');
    const defender = nationIdV2('bel');
    setHuman(state, defender);
    state.tick = WAR_MOBILIZATION_TICKS;
    const war = activeWar(attacker, defender, state.tick);
    state.wars = [war];
    state.offers = [{
      id: 'offer-ai-exhaustion',
      fromId: attacker,
      toId: defender,
      warId: war.id,
      settlement: 'ceasefire',
      createdTick: state.tick - 1,
      expiresTick: state.tick + 10,
      status: 'pending',
      weeklyCost: 1,
      paymentWeeks: CEASEFIRE_PAYMENT_WEEKS,
    }];
    setNationalArmyFill(state, attacker, 0.50);

    expect(aiAttackerIsOffensivelyExhaustedV2(state, attacker)).toBe(false);
    expect(aiAttackerMustStandDownV2(state, war)).toBe(true);
    const battles = processWarsV2(state, WORLD_CONTENT_V2);
    expect(battles.length).toBeGreaterThan(0);
    expect(battles.every((battle) => battle.attackerId === defender)).toBe(true);
  });
});
