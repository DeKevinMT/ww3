import { describe, expect, it } from 'vitest';
import {
  areAlliedV2,
  proposeAllianceV2,
  pruneAllianceStateV2,
  respondToAllianceV2,
} from './alliances';
import { ALLIANCE_OFFER_DURATION_TICKS } from './balance';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { assertInvariantsV2 } from './invariants';
import { WorldEngineV2 } from './WorldEngineV2';
import { nationIdV2 } from './types';

describe('V2 human multiplayer alliances', () => {
  const belgium = nationIdV2('bel');
  const canada = nationIdV2('can');
  const france = nationIdV2('fra');

  function multiplayerState() {
    const engine = new WorldEngineV2(72_001, WORLD_CONTENT_V2);
    const roster = [belgium, canada, france]
      .sort((left, right) => left.localeCompare(right));
    if (!engine.configureHumanPlayers(roster, belgium).accepted) {
      throw new Error('Unable to configure the multiplayer alliance fixture.');
    }
    return engine.state;
  }

  it('permits only one directed invitation between living human countries', () => {
    const state = multiplayerState();

    expect(proposeAllianceV2(state, belgium, belgium).accepted).toBe(false);
    expect(proposeAllianceV2(state, belgium, nationIdV2('nld')).accepted).toBe(false);
    expect(proposeAllianceV2(state, belgium, canada)).toEqual({ accepted: true });
    expect(proposeAllianceV2(state, canada, belgium).accepted).toBe(false);
    expect(state.allianceOffers).toEqual([{
      fromId: belgium,
      toId: canada,
      createdTick: 0,
      expiresTick: ALLIANCE_OFFER_DURATION_TICKS,
    }]);
    expect(() => assertInvariantsV2(state, WORLD_CONTENT_V2)).not.toThrow();
  });

  it('accepts or declines only the exact pending invitation and expires stale invitations', () => {
    const state = multiplayerState();
    expect(proposeAllianceV2(state, belgium, canada).accepted).toBe(true);
    expect(respondToAllianceV2(state, belgium, france, true).accepted).toBe(false);
    expect(respondToAllianceV2(state, belgium, canada, false)).toEqual({ accepted: true });
    expect(state.alliances).toEqual([]);
    expect(state.allianceOffers).toEqual([]);

    expect(proposeAllianceV2(state, canada, france).accepted).toBe(true);
    state.tick = ALLIANCE_OFFER_DURATION_TICKS;
    pruneAllianceStateV2(state);
    expect(state.allianceOffers).toEqual([]);
  });

  it('replicates the serious-Campaign alliance rejection and preserves empty blocs through resync', () => {
    const host = new WorldEngineV2(72_002);
    const replica = new WorldEngineV2(72_002);
    const roster = [belgium, canada];
    expect(host.configureHumanPlayers(roster, belgium)).toEqual({ accepted: true });
    expect(replica.configureHumanPlayers(roster, canada)).toEqual({ accepted: true });
    replica.setClockAuthority(false);
    host.subscribeQueuedActions((action) => {
      expect(replica.enqueueAuthoritativeAction(action)).toEqual({ accepted: true });
    });
    replica.setClientCommandSink((command) => host.submitCommand(command));

    expect(host.proposeAlliance(belgium, canada)).toEqual({
      accepted: false,
      reason: 'The Rogue Signal has shattered alliances; every country fights independently.',
    });
    host.step();
    replica.step();
    expect(host.state.allianceOffers).toEqual([]);
    expect(replica.state.allianceOffers).toEqual([]);
    expect(areAlliedV2(host.state, belgium, canada)).toBe(false);
    expect(areAlliedV2(replica.state, canada, belgium)).toBe(false);
    expect(replica.canonicalHash()).toBe(host.canonicalHash());

    const resumed = WorldEngineV2.fromSave(host.save());
    expect(resumed.areAllied(canada, belgium)).toBe(false);
    expect(resumed.state.alliances).toEqual([]);
    expect(resumed.canonicalHash()).toBe(host.canonicalHash());
  }, 20_000);
});
