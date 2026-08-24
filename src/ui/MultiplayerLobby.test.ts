import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectHostMessageEvent } from '../multiplayer/directConnect';
import { HostLobbyModel } from '../multiplayer/lobbyModel';
import type { LobbyStateMessage, SnapshotMessage } from '../multiplayer/protocol';
import { nationIdV2 } from '../sim/v2/types';
import { WorldEngineV2 } from '../sim/v2/WorldEngineV2';
import { MultiplayerLobby } from './MultiplayerLobby';
import { IntroOpeningMetricsCacheV2, renderNationPickerV2 } from './WorldUIV2';

class FakeElement {
  className = '';
  innerHTML = '';

  setAttribute(): void {}

  addEventListener(): void {}

  removeEventListener(): void {}

  remove(): void {}

  querySelector(): null { return null; }

  querySelectorAll(): [] { return []; }
}

const pickerEngine = new WorldEngineV2(20_260_823);
const openingMetrics = new IntroOpeningMetricsCacheV2().read(pickerEngine);

interface LobbyInternals {
  launched: boolean;
  mode: 'menu' | 'host' | 'guest';
  root: FakeElement;
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
  onHostMessage(event: DirectHostMessageEvent): void;
  onGuestMessage(message: SnapshotMessage): void;
  selectPreferredCountryIfAvailable(): void;
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
    const ui = new MultiplayerLobby({
      onClose: vi.fn(), onHostLaunch, onGuestLaunch: vi.fn(), openingMetrics,
    });
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
    const ui = new MultiplayerLobby({
      onClose: vi.fn(), onHostLaunch: vi.fn(), onGuestLaunch, openingMetrics,
    });
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

  it('renders the full shared nation picker without the old country dropdown', () => {
    const rendered = renderNationPickerV2(openingMetrics, {
      previewCountryId: nationIdV2('bel'),
      searchQuery: '',
      continent: 'ALL',
      sort: 'military',
      context: 'lobby',
      selectedCountryId: nationIdV2('bel'),
      claimedCountryIds: new Set([nationIdV2('can')]),
      claimantNames: new Map([[nationIdV2('can'), 'Bob']]),
    });

    expect(rendered.html).toContain('Choose your nation');
    expect(rendered.html).toContain('id="mp-country-search"');
    expect(rendered.html).toContain('id="mp-country-sort"');
    expect(rendered.html).toContain('Military ranking');
    expect(rendered.html).toContain('MILITARY POWER');
    expect(rendered.html).toContain('Aggressiveness');
    expect(rendered.html).toContain('data-mp-action="continent-filter"');
    expect(rendered.html).toContain('data-mp-action="select-country"');
    expect(rendered.html).toContain('CLAIMED');
    expect(rendered.html).toContain('Bob');
    expect(rendered.html).not.toContain('mp-country-select');
    expect(rendered.html.match(/<button[^>]*data-country="can"[^>]*>/)?.[0]).toContain('disabled');
    expect(rendered.html.match(/<button[^>]*data-country="bel"[^>]*>/)?.[0]).not.toContain('disabled');
    expect(rendered.previewCountryId).toBe(nationIdV2('bel'));
  });

  it('uses the live derived aggressiveness value in picker metrics', () => {
    const belgium = openingMetrics.byNation.get(nationIdV2('bel'))!;
    expect(belgium.aggressiveness).toBe(pickerEngine.nationalAggressiveness(nationIdV2('bel')));
    expect(belgium.aggressiveness).toBeGreaterThanOrEqual(0);
    expect(belgium.aggressiveness).toBeLessThanOrEqual(100);
  });

  it('reserves the intro-preview country when the host creates the lobby seat', () => {
    const ui = new MultiplayerLobby({
      onClose: vi.fn(), onHostLaunch: vi.fn(), onGuestLaunch: vi.fn(),
      openingMetrics, preferredCountryId: nationIdV2('bel'),
    });
    const internals = ui as unknown as LobbyInternals;
    const model = new HostLobbyModel('host', 'Alice');
    internals.host = { hostPeerId: 'host', roomId: 'room', broadcast: vi.fn() };
    internals.hostModel = model;
    internals.lobby = model.snapshot();

    internals.selectPreferredCountryIfAvailable();

    expect(internals.lobby?.players[0]?.countryId).toBe(nationIdV2('bel'));
    ui.destroy(false);
  });

  it('rerenders the host lobby immediately after a guest selects a country', () => {
    const ui = new MultiplayerLobby({
      onClose: vi.fn(), onHostLaunch: vi.fn(), onGuestLaunch: vi.fn(), openingMetrics,
    });
    const internals = ui as unknown as LobbyInternals;
    const model = new HostLobbyModel('host', 'Alice');
    model.connect('guest', 'Bob');
    internals.mode = 'host';
    internals.host = { hostPeerId: 'host', roomId: 'room', broadcast: vi.fn() };
    internals.hostModel = model;
    internals.lobby = model.snapshot();

    internals.onHostMessage({
      peerId: 'guest',
      invitationId: 'invite-bob',
      message: {
        type: 'lobby-action',
        action: { type: 'select-country', countryId: nationIdV2('can') },
      },
    });

    expect(internals.lobby?.players.find((player) => player.peerId === 'guest'))
      .toMatchObject({ displayName: 'Bob', countryId: nationIdV2('can') });
    expect(internals.root.innerHTML).toContain('Bob');
    expect(internals.root.innerHTML).toContain('Canada');
    ui.destroy(false);
  });
});
