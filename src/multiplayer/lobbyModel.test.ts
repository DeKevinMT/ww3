import { describe, expect, it } from 'vitest';
import { nationIdV2 } from '../sim/v2/types';
import { HostLobbyModel } from './lobbyModel';

describe('Direct Connect lobby model', () => {
  it('requires two unique, connected and ready country seats', () => {
    const lobby = new HostLobbyModel('host', 'Alice');
    expect(lobby.connect('guest', 'Bob').accepted).toBe(true);
    expect(lobby.apply('host', { type: 'select-country', countryId: nationIdV2('bel') }).accepted).toBe(true);
    expect(lobby.apply('guest', { type: 'select-country', countryId: nationIdV2('bel') }).accepted).toBe(false);
    expect(lobby.apply('guest', { type: 'select-country', countryId: nationIdV2('can') }).accepted).toBe(true);
    expect(lobby.apply('host', { type: 'set-ready', ready: true }).accepted).toBe(true);
    expect(lobby.apply('host', { type: 'start' }).accepted).toBe(false);
    expect(lobby.apply('guest', { type: 'set-ready', ready: true }).accepted).toBe(true);
    expect(lobby.apply('host', { type: 'start' }).accepted).toBe(true);
    expect(lobby.snapshot().started).toBe(true);
  });

  it('does not let a guest start and releases a disconnected guest seat', () => {
    const lobby = new HostLobbyModel('host', 'Alice');
    lobby.connect('guest', 'Bob');
    expect(lobby.apply('guest', { type: 'start' }).accepted).toBe(false);
    lobby.apply('guest', { type: 'select-country', countryId: nationIdV2('can') });
    lobby.apply('guest', { type: 'set-ready', ready: true });
    lobby.disconnect('guest');
    const guest = lobby.snapshot().players.find((player) => player.peerId === 'guest');
    expect(guest).toBeUndefined();
  });

  it('rejects a forged country identifier before it can poison the room', () => {
    const lobby = new HostLobbyModel('host', 'Alice');
    expect(lobby.apply('host', {
      type: 'select-country',
      countryId: nationIdV2('not-a-country'),
    }).accepted).toBe(false);
    expect(lobby.snapshot().players[0]?.countryId).toBeNull();
  });

  it('lets only the host roll back the matching failed launch and retry', () => {
    const lobby = new HostLobbyModel('host', 'Alice');
    lobby.connect('guest', 'Bob');
    lobby.apply('host', { type: 'select-country', countryId: nationIdV2('bel') });
    lobby.apply('guest', { type: 'select-country', countryId: nationIdV2('can') });
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
});
