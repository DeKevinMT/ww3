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

  it('blocks a correctly owned war command when both countries are permanent co-op seats', () => {
    const state = createWorldStateV2(511, WORLD_CONTENT_V2);
    state.humanPlayerIds = [belgium, canada].sort((left, right) => left.localeCompare(right));

    expect(authorizeMultiplayerCommandV2(state, belgium, {
      type: 'declare-war', attackerId: belgium, defenderId: canada,
    }, false)).toEqual({
      accepted: false,
      reason: 'Co-op teammates are permanently on the same side.',
    });
  });

  it('reserves shared speed for the room host and rejects AI escalation spoofing', () => {
    const state = createWorldStateV2(52, WORLD_CONTENT_V2);
    expect(authorizeMultiplayerCommandV2(state, belgium, {
      type: 'set-speed', speed: 3,
    }, false).accepted).toBe(false);
    expect(authorizeMultiplayerCommandV2(state, belgium, {
      type: 'set-speed', speed: 3,
    }, true).accepted).toBe(true);
    expect(authorizeMultiplayerCommandV2(state, belgium, {
      type: 'declare-war', attackerId: belgium, defenderId: canada, escalatedFromWarId: 'war-ai',
    }, true).accepted).toBe(false);
  });

  it('reserves Survival empire formation for the host-owned flagship', () => {
    const state = createWorldStateV2(521, WORLD_CONTENT_V2);
    const command = {
      type: 'form-survival-empire' as const,
      flagshipId: belgium,
      memberIds: [belgium, canada],
    };
    expect(authorizeMultiplayerCommandV2(state, belgium, command, false).accepted).toBe(false);
    expect(authorizeMultiplayerCommandV2(state, belgium, command, true).accepted).toBe(true);
    expect(authorizeMultiplayerCommandV2(state, canada, command, true).accepted).toBe(false);
  });

  it('binds Arctic research and warnings to the issuing seat while expeditions stay retired', () => {
    const state = createWorldStateV2(55, WORLD_CONTENT_V2);
    const ownCommands = [
      { type: 'start-arctic-project', playerId: belgium, projectId: 'polar-demography' },
      { type: 'acknowledge-polar-warning', playerId: belgium },
    ] as const;
    const spoofedCommands = [
      { type: 'start-arctic-project', playerId: canada, projectId: 'polar-demography' },
      { type: 'acknowledge-polar-warning', playerId: canada },
      { type: 'deploy-antarctic-expedition', playerId: canada, sectorId: 'drake-entry', manpower: 1 },
    ] as const;

    for (const command of ownCommands) {
      expect(authorizeMultiplayerCommandV2(state, belgium, command, false).accepted).toBe(true);
    }
    for (const command of spoofedCommands) {
      expect(authorizeMultiplayerCommandV2(state, belgium, command, true).accepted).toBe(false);
    }
    expect(authorizeMultiplayerCommandV2(state, belgium, {
      type: 'deploy-antarctic-expedition', playerId: belgium,
      sectorId: 'drake-entry', manpower: 1,
    }, true)).toEqual({
      accepted: false,
      reason: 'Antarctic expeditions were retired; use normal wars and logistics.',
    });
  });

  it('binds the separate Commander economy and manual route to its owning seat', () => {
    const state = createWorldStateV2(551, WORLD_CONTENT_V2);
    const ownCommands = [
      {
        type: 'set-commander-priorities' as const,
        playerId: belgium,
        priorities: { training: 40, logistics: 40, development: 20 },
      },
      {
        type: 'issue-commander-order' as const,
        playerId: belgium,
        destinationId: nationIdV2('bel') as never,
        mission: 'standby' as const,
        front: null,
      },
    ];
    for (const command of ownCommands) {
      expect(authorizeMultiplayerCommandV2(state, belgium, command, false).accepted).toBe(true);
      expect(authorizeMultiplayerCommandV2(state, canada, command, true).accepted).toBe(false);
    }
  });

  it('binds EONSCAR transmission responses to the addressed human seat', () => {
    const state = createWorldStateV2(552, WORLD_CONTENT_V2);
    const command = {
      type: 'respond-apex-transmission' as const,
      playerId: belgium,
      transmissionId: 'campaign-signal-anomaly' as const,
      choice: 'accept' as const,
    };

    expect(authorizeMultiplayerCommandV2(state, belgium, command, false).accepted).toBe(true);
    expect(authorizeMultiplayerCommandV2(state, canada, command, true)).toEqual({
      accepted: false,
      reason: 'You can only manage your own country.',
    });
  });

  it('binds a physical Survival counteroffensive to its owning seat', () => {
    const state = createWorldStateV2(553, WORLD_CONTENT_V2);
    const command = {
      type: 'select-survival-counteroffensive' as const,
      playerId: belgium,
      targetId: nationIdV2('sen') as never,
    };

    expect(authorizeMultiplayerCommandV2(state, belgium, command, false).accepted).toBe(true);
    expect(authorizeMultiplayerCommandV2(state, canada, command, true)).toEqual({
      accepted: false,
      reason: 'You can only manage your own country.',
    });
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
