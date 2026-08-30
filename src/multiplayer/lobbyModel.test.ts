import { describe, expect, it } from 'vitest';
import { nationIdV2 } from '../sim/v2/types';
import { normalizeScenarioConfigV2 } from '../sim/v2/scenarios';
import { HostLobbyModel } from './lobbyModel';
import { createNeutralMultiplayerDeploymentSnapshotV1 } from './deployment';

const selection = (countryId: ReturnType<typeof nationIdV2>) => ({
  type: 'select-country' as const,
  countryId,
  deployment: createNeutralMultiplayerDeploymentSnapshotV1(countryId),
});

describe('Direct Connect lobby model', () => {
  it('requires two unique, connected and ready country seats', () => {
    const lobby = new HostLobbyModel('host', 'Alice');
    expect(lobby.connect('guest', 'Bob').accepted).toBe(true);
    expect(lobby.apply('host', selection(nationIdV2('bel'))).accepted).toBe(true);
    expect(lobby.apply('guest', selection(nationIdV2('bel'))).accepted).toBe(false);
    expect(lobby.apply('guest', selection(nationIdV2('can'))).accepted).toBe(true);
    expect(lobby.apply('host', { type: 'set-ready', ready: true }).accepted).toBe(true);
    expect(lobby.apply('host', { type: 'start' }).accepted).toBe(false);
    expect(lobby.apply('guest', { type: 'set-ready', ready: true }).accepted).toBe(true);
    expect(lobby.apply('host', { type: 'start' }).accepted).toBe(true);
    expect(lobby.snapshot().started).toBe(true);
  });

  it('keeps Survival co-op to one Empire command and one Dawnline command', () => {
    const survival = normalizeScenarioConfigV2({ mode: 'survival', seed: 404_456 });
    const lobby = new HostLobbyModel('host', 'Alice', survival);
    expect(lobby.connect('guest', 'Bob').accepted).toBe(true);
    expect(lobby.connect('third', 'Charlie').accepted).toBe(true);
    lobby.apply('host', selection(nationIdV2('grl')));
    lobby.apply('guest', selection(nationIdV2('can')));
    lobby.apply('third', selection(nationIdV2('isl')));
    for (const peerId of ['host', 'guest', 'third']) {
      lobby.apply(peerId, { type: 'set-ready', ready: true });
    }

    expect(lobby.startBlockReason()).toBe(
      'Survival co-op deploys exactly two sovereign commands.',
    );
    expect(lobby.apply('host', { type: 'start' }).accepted).toBe(false);
  });

  it('does not let a guest start and reserves its country during reconnect grace', () => {
    let now = 1_000;
    const lobby = new HostLobbyModel('host', 'Alice', undefined, () => now, 5_000);
    lobby.connect('guest', 'Bob');
    expect(lobby.apply('guest', { type: 'start' }).accepted).toBe(false);
    lobby.apply('guest', selection(nationIdV2('can')));
    lobby.apply('guest', { type: 'set-ready', ready: true });
    lobby.disconnect('guest');
    expect(lobby.snapshot().players.find((player) => player.peerId === 'guest')).toMatchObject({
      countryId: 'can', connected: false, ready: false,
    });
    expect(lobby.apply('host', selection(nationIdV2('can'))).accepted).toBe(false);
    expect(lobby.connect('guest', 'Bob')).toEqual({ accepted: true });
    expect(lobby.snapshot().players.find((player) => player.peerId === 'guest')).toMatchObject({
      countryId: 'can', connected: true,
    });

    lobby.disconnect('guest');
    now += 5_001;
    expect(lobby.releaseExpiredDisconnected()).toEqual(['guest']);
    expect(lobby.snapshot().players.find((player) => player.peerId === 'guest')).toBeUndefined();
  });

  it('rejects a forged country identifier before it can poison the room', () => {
    const lobby = new HostLobbyModel('host', 'Alice');
    expect(lobby.apply('host', {
      ...selection(nationIdV2('not-a-country')),
    }).accepted).toBe(false);
    expect(lobby.snapshot().players[0]?.countryId).toBeNull();
  });

  it('lets only the host roll back the matching failed launch and retry', () => {
    const lobby = new HostLobbyModel('host', 'Alice');
    lobby.connect('guest', 'Bob');
    lobby.apply('host', selection(nationIdV2('bel')));
    lobby.apply('guest', selection(nationIdV2('can')));
    lobby.apply('host', { type: 'set-ready', ready: true });
    lobby.apply('guest', { type: 'set-ready', ready: true });

    expect(lobby.apply('host', { type: 'start' })).toEqual({ accepted: true });
    const started = lobby.snapshot();
    expect(lobby.resetStartAfterLaunchFailure('guest', started.revision).accepted).toBe(false);
    expect(lobby.resetStartAfterLaunchFailure('host', started.revision - 1).accepted).toBe(false);
    expect(lobby.snapshot()).toEqual(started);

    expect(lobby.resetStartAfterLaunchFailure('host', started.revision)).toEqual({ accepted: true });
    const recovered = lobby.snapshot();
    expect(recovered.started).toBe(false);
    expect(recovered.revision).toBe(started.revision + 1);
    expect(lobby.resetStartAfterLaunchFailure('host', started.revision).accepted).toBe(false);
    expect(lobby.snapshot().revision).toBe(recovered.revision);

    expect(lobby.apply('host', { type: 'start' })).toEqual({ accepted: true });
    expect(lobby.snapshot()).toMatchObject({ started: true, revision: recovered.revision + 1 });
  });

  it('lets only the host change scenario and atomically clears every seat', () => {
    const initial = normalizeScenarioConfigV2({ mode: 'standard-2026', seed: 101 });
    const random = normalizeScenarioConfigV2({ mode: 'random-world', seed: 202 });
    const lobby = new HostLobbyModel('host', 'Alice', initial);
    lobby.connect('guest', 'Bob');
    lobby.apply('host', selection(nationIdV2('bel')));
    lobby.apply('guest', selection(nationIdV2('can')));
    lobby.apply('host', { type: 'set-ready', ready: true });
    lobby.apply('guest', { type: 'set-ready', ready: true });
    const before = lobby.snapshot();

    expect(lobby.apply('guest', { type: 'set-scenario', scenario: random }, before.revision).accepted).toBe(false);
    expect(lobby.snapshot()).toEqual(before);
    expect(lobby.apply('host', { type: 'set-scenario', scenario: random }, before.revision)).toEqual({ accepted: true });

    const changed = lobby.snapshot();
    expect(changed.scenario).toEqual(random);
    expect(changed.revision).toBe(before.revision + 1);
    expect(changed.players.every((player) => player.countryId === null && !player.ready)).toBe(true);
  });

  it('rejects stale revisioned actions without changing lobby state', () => {
    const lobby = new HostLobbyModel('host', 'Alice');
    lobby.connect('guest', 'Bob');
    const revision = lobby.snapshot().revision;
    expect(lobby.apply('guest', selection(nationIdV2('can')), revision))
      .toEqual({ accepted: true });
    const current = lobby.snapshot();

    expect(lobby.apply('guest', { type: 'set-ready', ready: true }, revision).accepted).toBe(false);
    expect(lobby.snapshot()).toEqual(current);
  });
});
