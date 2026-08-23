import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from '../sim/v2/bootstrap';
import { WORLD_CONTENT_V2 } from '../sim/v2/content';
import { nationIdV2 } from '../sim/v2/types';
import { authorizeMultiplayerCommandV2 } from './authorization';

describe('multiplayer command authorization', () => {
  const belgium = nationIdV2('bel');
  const canada = nationIdV2('can');

  it('allows a player to manage and declare war only as its assigned country', () => {
    const state = createWorldStateV2(51, WORLD_CONTENT_V2);
    expect(authorizeMultiplayerCommandV2(state, belgium, {
      type: 'rapid-recruitment', playerId: belgium,
    }, false).accepted).toBe(true);
    expect(authorizeMultiplayerCommandV2(state, belgium, {
      type: 'rapid-recruitment', playerId: canada,
    }, false).accepted).toBe(false);
    expect(authorizeMultiplayerCommandV2(state, belgium, {
      type: 'declare-war', attackerId: canada, defenderId: belgium,
    }, false).accepted).toBe(false);
  });

  it('reserves shared speed for the room host and rejects AI escalation spoofing', () => {
    const state = createWorldStateV2(52, WORLD_CONTENT_V2);
    expect(authorizeMultiplayerCommandV2(state, belgium, {
      type: 'set-speed', speed: 2,
    }, false).accepted).toBe(false);
    expect(authorizeMultiplayerCommandV2(state, belgium, {
      type: 'set-speed', speed: 2,
    }, true).accepted).toBe(true);
    expect(authorizeMultiplayerCommandV2(state, belgium, {
      type: 'declare-war', attackerId: belgium, defenderId: canada, escalatedFromWarId: 'war-ai',
    }, true).accepted).toBe(false);
  });

  it('only lets the addressed country answer a peace offer', () => {
    const state = createWorldStateV2(53, WORLD_CONTENT_V2);
    state.offers.push({
      id: 'offer-test',
      fromId: canada,
      toId: belgium,
      warId: 'war-test',
      createdTick: 1,
      expiresTick: 20,
      status: 'pending',
      settlement: 'ceasefire',
    });

    expect(authorizeMultiplayerCommandV2(state, belgium, {
      type: 'respond-to-offer', offerId: 'offer-test', accept: true,
    }, false).accepted).toBe(true);
    expect(authorizeMultiplayerCommandV2(state, canada, {
      type: 'respond-to-offer', offerId: 'offer-test', accept: true,
    }, false).accepted).toBe(false);
  });

  it('binds alliance invitations to the sender seat and replies to the addressed seat', () => {
    const state = createWorldStateV2(54, WORLD_CONTENT_V2);
    state.humanPlayerIds = [belgium, canada].sort((left, right) => left.localeCompare(right));

    expect(authorizeMultiplayerCommandV2(state, belgium, {
      type: 'propose-alliance', fromId: belgium, targetId: canada,
    }, false).accepted).toBe(true);
    expect(authorizeMultiplayerCommandV2(state, canada, {
      type: 'propose-alliance', fromId: belgium, targetId: canada,
    }, false).accepted).toBe(false);

    state.allianceOffers.push({
      fromId: belgium,
      toId: canada,
      createdTick: 0,
      expiresTick: 26,
    });
    expect(authorizeMultiplayerCommandV2(state, canada, {
      type: 'respond-to-alliance', fromId: belgium, toId: canada, accept: true,
    }, false).accepted).toBe(true);
    expect(authorizeMultiplayerCommandV2(state, belgium, {
      type: 'respond-to-alliance', fromId: belgium, toId: canada, accept: true,
    }, true).accepted).toBe(false);
    expect(authorizeMultiplayerCommandV2(state, canada, {
      type: 'respond-to-alliance', fromId: nationIdV2('fra'), toId: canada, accept: true,
    }, false).accepted).toBe(false);
  });
});
