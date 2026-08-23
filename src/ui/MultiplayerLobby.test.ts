import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HostLobbyModel } from '../multiplayer/lobbyModel';
import type { LobbyStateMessage, SnapshotMessage } from '../multiplayer/protocol';
import { nationIdV2 } from '../sim/v2/types';
import { MultiplayerLobby } from './MultiplayerLobby';

class FakeElement {
  className = '';
  innerHTML = '';

  setAttribute(): void {}

  addEventListener(): void {}

  removeEventListener(): void {}

  remove(): void {}
}

interface LobbyInternals {
  launched: boolean;
  host?: {
    hostPeerId: string;
    roomId: string;
    broadcast: ReturnType<typeof vi.fn>;
  };
  guest?: {
    peerId: string;
    hostName: string;
    state: 'connected';
  };
  hostModel?: HostLobbyModel;
  lobby?: LobbyStateMessage;
  launchHost(): Promise<void>;
  onGuestMessage(message: SnapshotMessage): void;
}

function readyLobby(): HostLobbyModel {
  const model = new HostLobbyModel('host', 'Alice');
  model.connect('guest', 'Bob');
  model.apply('host', { type: 'select-country', countryId: nationIdV2('bel') });
  model.apply('guest', { type: 'select-country', countryId: nationIdV2('can') });
  model.apply('host', { type: 'set-ready', ready: true });
  model.apply('guest', { type: 'set-ready', ready: true });
  return model;
}

describe('multiplayer lobby launch recovery', () => {
  beforeEach(() => {
    vi.stubGlobal('document', {
      createElement: () => new FakeElement(),
      body: { append: () => undefined },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('publishes an unstarted revision after host launch failure and can retry', async () => {
    const onHostLaunch = vi.fn()
      .mockRejectedValueOnce(new Error('launch failed'))
      .mockResolvedValueOnce(undefined);
    const ui = new MultiplayerLobby({ onClose: vi.fn(), onHostLaunch, onGuestLaunch: vi.fn() });
    const internals = ui as unknown as LobbyInternals;
    const model = readyLobby();
    expect(model.apply('host', { type: 'start' })).toEqual({ accepted: true });
    const firstStart = model.snapshot();
    const broadcast = vi.fn();
    internals.host = { hostPeerId: 'host', roomId: 'room', broadcast };
    internals.hostModel = model;
    internals.lobby = firstStart;

    await internals.launchHost();

    expect(internals.launched).toBe(false);
    expect(model.snapshot()).toMatchObject({ started: false, revision: firstStart.revision + 1 });
    expect(broadcast).toHaveBeenLastCalledWith(model.snapshot());

    expect(model.apply('host', { type: 'start' })).toEqual({ accepted: true });
    internals.lobby = model.snapshot();
    await internals.launchHost();
    expect(onHostLaunch).toHaveBeenCalledTimes(2);
    expect(internals.launched).toBe(true);
    ui.destroy(false);
  });

  it('clears the guest launch latch after failure so a fresh snapshot retries', async () => {
    const onGuestLaunch = vi.fn()
      .mockRejectedValueOnce(new Error('guest launch failed'))
      .mockResolvedValueOnce(undefined);
    const ui = new MultiplayerLobby({ onClose: vi.fn(), onHostLaunch: vi.fn(), onGuestLaunch });
    const internals = ui as unknown as LobbyInternals;
    const model = readyLobby();
    model.apply('host', { type: 'start' });
    internals.lobby = model.snapshot();
    internals.guest = { peerId: 'guest', hostName: 'Alice', state: 'connected' };
    const snapshot = { type: 'snapshot' } as SnapshotMessage;

    internals.onGuestMessage(snapshot);
    await vi.waitFor(() => expect(internals.launched).toBe(false));
    internals.onGuestMessage(snapshot);
    await vi.waitFor(() => expect(onGuestLaunch).toHaveBeenCalledTimes(2));

    expect(internals.launched).toBe(true);
    ui.destroy(false);
  });
});
