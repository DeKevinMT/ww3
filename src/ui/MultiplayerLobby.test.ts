import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { V2_RULES_VERSION } from '../sim/v2/balance';
import type { DirectHostMessageEvent } from '../multiplayer/directConnect';
import { HostLobbyModel } from '../multiplayer/lobbyModel';
import { createNeutralMultiplayerDeploymentSnapshotV1 } from '../multiplayer/deployment';
import { formMatchmakingGroups } from '../multiplayer/matchmakingGroups';
import type { LobbyAction, LobbyStateMessage, SessionMessage, SnapshotMessage } from '../multiplayer/protocol';
import { normalizeScenarioConfigV2, type ResolvedScenarioV2 } from '../sim/v2/scenarios';
import { nationIdV2 } from '../sim/v2/types';
import { WorldEngineV2 } from '../sim/v2/WorldEngineV2';
import { MultiplayerLobby, multiplayerQueueCompatibilityKey } from './MultiplayerLobby';
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
const stylesSource = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

const selection = (countryId: ReturnType<typeof nationIdV2>) => ({
  type: 'select-country' as const,
  countryId,
  deployment: createNeutralMultiplayerDeploymentSnapshotV1(countryId),
});

interface LobbyInternals {
  launched: boolean;
  advancedPrivateOpen: boolean;
  mode: 'menu' | 'matchmaking' | 'host' | 'guest';
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
  resolvedScenario: ResolvedScenarioV2;
  openingMetrics: ReturnType<IntroOpeningMetricsCacheV2['read']>;
  launchHost(): Promise<void>;
  onHostMessage(event: DirectHostMessageEvent): void;
  onGuestMessage(message: SessionMessage): void;
  selectPreferredCountryIfAvailable(): void;
  applyLocalAction(action: LobbyAction): void;
  changeScenario(mode: 'standard-2026' | 'random-world', reroll?: boolean): void;
  render(): void;
}

function stubMatchmakingSocket(): unknown[] {
  const sockets: unknown[] = [];
  class FakeWebSocket {
    static readonly OPEN = 1;
    readonly readyState = 0;
    readonly send = vi.fn();
    readonly close = vi.fn();

    constructor(readonly url: string) { sockets.push(this); }

    addEventListener(): void {}
  }
  vi.stubGlobal('WebSocket', FakeWebSocket);
  return sockets;
}

function readyLobby(): HostLobbyModel {
  const model = new HostLobbyModel('host', 'Alice');
  model.connect('guest', 'Bob');
  model.apply('host', selection(nationIdV2('bel')));
  model.apply('guest', selection(nationIdV2('can')));
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
    expect(onHostLaunch).toHaveBeenLastCalledWith(expect.objectContaining({
      scenario: firstStart.scenario,
    }));
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

    expect(onGuestLaunch).toHaveBeenLastCalledWith(expect.objectContaining({
      scenario: model.snapshot().scenario,
    }));
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
    expect(rendered.html).toContain('GDP / capita');
    expect(rendered.html).toContain('MILITARY POWER');
    expect(rendered.html).not.toContain('Aggressiveness');
    expect(rendered.html).toContain('data-mp-action="continent-filter"');
    expect(rendered.html).toContain('data-mp-action="select-country"');
    expect(rendered.html).toContain('CLAIMED');
    expect(rendered.html).toContain('Bob');
    expect(rendered.html).not.toContain('mp-country-select');
    expect(rendered.html.match(/<button[^>]*data-country="can"[^>]*>/)?.[0]).toContain('disabled');
    expect(rendered.html.match(/<button[^>]*data-country="bel"[^>]*>/)?.[0]).not.toContain('disabled');
    expect(rendered.previewCountryId).toBe(nationIdV2('bel'));
  });

  it('uses the ordinary AI baseline aggressiveness value in picker metrics', () => {
    const belgium = openingMetrics.byNation.get(nationIdV2('bel'))!;
    const preview = pickerEngine.openingCandidatePreviewSnapshot();
    expect(belgium.aggressiveness).toBe(
      preview.aggressivenessByNation.get(nationIdV2('bel')),
    );
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

  it('applies shared-account unlocks and mastery to the local multiplayer picker', () => {
    const belgium = nationIdV2('bel');
    const canada = nationIdV2('can');
    const usa = nationIdV2('usa');
    const ui = new MultiplayerLobby({
      onClose: vi.fn(), onHostLaunch: vi.fn(), onGuestLaunch: vi.fn(), openingMetrics,
      availableCountryIds: new Set([belgium, canada]),
      countryMasteryLevels: new Map([[belgium, 7], [canada, 3]]),
    });
    const internals = ui as unknown as LobbyInternals;
    const model = new HostLobbyModel('host', 'Alice');
    internals.mode = 'host';
    internals.host = { hostPeerId: 'host', roomId: 'room', broadcast: vi.fn() };
    internals.hostModel = model;
    internals.lobby = model.snapshot();

    internals.render();

    expect(internals.root.innerHTML).toContain('data-country="bel"');
    expect(internals.root.innerHTML).toContain('data-country="can"');
    expect(internals.root.innerHTML).not.toContain('data-country="usa"');
    expect(internals.root.innerHTML).toContain('MASTERY LV 7');
    expect(internals.root.innerHTML).toContain('MASTERY LV 3');
    expect(internals.root.innerHTML).toContain('MASTERY LEVEL 3');

    internals.applyLocalAction({ type: 'select-country', countryId: usa });
    expect(model.snapshot().players[0]?.countryId).toBeNull();
    expect(internals.root.innerHTML).toContain('Unlock that nation');
    ui.destroy(false);
  });

  it('rejects a locked preferred country without disturbing a remote seat', () => {
    const belgium = nationIdV2('bel');
    const canada = nationIdV2('can');
    const usa = nationIdV2('usa');
    const ui = new MultiplayerLobby({
      onClose: vi.fn(), onHostLaunch: vi.fn(), onGuestLaunch: vi.fn(), openingMetrics,
      preferredCountryId: usa,
      availableCountryIds: new Set([belgium]),
      countryMasteryLevels: new Map([[belgium, 4]]),
    });
    const internals = ui as unknown as LobbyInternals;
    const model = new HostLobbyModel('host', 'Alice');
    model.connect('guest', 'Bob');
    model.apply('guest', selection(canada));
    internals.mode = 'host';
    internals.host = { hostPeerId: 'host', roomId: 'room', broadcast: vi.fn() };
    internals.hostModel = model;
    internals.lobby = model.snapshot();

    internals.selectPreferredCountryIfAvailable();
    internals.render();

    expect(model.snapshot().players.find((player) => player.peerId === 'host')?.countryId).toBeNull();
    expect(model.snapshot().players.find((player) => player.peerId === 'guest')?.countryId).toBe(canada);
    expect(internals.root.innerHTML).toContain('not unlocked on this account');
    expect(internals.root.innerHTML).toContain('MASTERY LEVEL 4');
    ui.destroy(false);
  });

  it('can refresh local account access while preserving host and guest synchronization', () => {
    const belgium = nationIdV2('bel');
    const canada = nationIdV2('can');
    const ui = new MultiplayerLobby({
      onClose: vi.fn(), onHostLaunch: vi.fn(), onGuestLaunch: vi.fn(), openingMetrics,
      availableCountryIds: new Set([belgium, canada]),
    });
    const internals = ui as unknown as LobbyInternals;
    const model = new HostLobbyModel('host', 'Alice');
    model.connect('guest', 'Bob');
    model.apply('host', selection(canada));
    model.apply('guest', selection(belgium));
    internals.mode = 'host';
    internals.host = { hostPeerId: 'host', roomId: 'room', broadcast: vi.fn() };
    internals.hostModel = model;
    internals.lobby = model.snapshot();

    ui.setAccountCountries({
      availableCountryIds: new Set([belgium]),
      countryMasteryLevels: new Map([[belgium, 9]]),
    });

    expect(model.snapshot().players.find((player) => player.peerId === 'host')?.countryId).toBeNull();
    expect(model.snapshot().players.find((player) => player.peerId === 'guest')?.countryId).toBe(belgium);
    expect(internals.root.innerHTML).toContain('MASTERY LEVEL 9');
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
        revision: model.snapshot().revision,
        action: selection(nationIdV2('can')),
      },
    });

    expect(internals.lobby?.players.find((player) => player.peerId === 'guest'))
      .toMatchObject({ displayName: 'Bob', countryId: nationIdV2('can') });
    expect(internals.root.innerHTML).toContain('Bob');
    expect(internals.root.innerHTML).toContain('Canada');

    const acceptedRevision = model.snapshot().revision;
    internals.onHostMessage({
      peerId: 'guest',
      invitationId: 'invite-bob',
      message: {
        type: 'lobby-action',
        revision: acceptedRevision - 1,
        action: { type: 'clear-country' },
      },
    });
    expect(model.snapshot().players.find((player) => player.peerId === 'guest')?.countryId)
      .toBe(nationIdV2('can'));
    ui.destroy(false);
  });

  it('uses the host scenario content and renders it read-only for guests', () => {
    const scenario = normalizeScenarioConfigV2({ mode: 'random-world', seed: 424_242 });
    const ui = new MultiplayerLobby({
      onClose: vi.fn(), onHostLaunch: vi.fn(), onGuestLaunch: vi.fn(), openingMetrics,
      scenarioConfig: scenario,
    });
    const internals = ui as unknown as LobbyInternals;
    const model = new HostLobbyModel('host', 'Alice', scenario);
    internals.mode = 'guest';
    internals.guest = { peerId: 'guest', hostName: 'Alice', state: 'connected' };
    model.connect('guest', 'Bob');

    internals.onGuestMessage(model.snapshot());

    expect(internals.resolvedScenario.config).toEqual(scenario);
    expect(internals.resolvedScenario.content.metadata?.scenarioId).toBe('random-world');
    expect(internals.openingMetrics.byNation.get(nationIdV2('usa'))?.economyView.population)
      .toBeCloseTo(internals.resolvedScenario.content.nations[nationIdV2('usa')]!.real.population, 6);
    expect(internals.root.innerHTML).toContain('ALTERNATIVE UNIVERSE');
    expect(internals.root.innerHTML).toContain('424242');
    expect(internals.root.innerHTML).toContain('data-mp-action="scenario-random" disabled');
    expect(internals.root.innerHTML).not.toContain('data-mp-action="scenario-reroll"');
    ui.destroy(false);
  });

  it('lets the host reroll Random World and publishes the exact new seed', () => {
    const scenario = normalizeScenarioConfigV2({ mode: 'random-world', seed: 111 });
    vi.stubGlobal('crypto', {
      getRandomValues: (values: Uint32Array) => {
        values[0] = 222;
        return values;
      },
    });
    const ui = new MultiplayerLobby({
      onClose: vi.fn(), onHostLaunch: vi.fn(), onGuestLaunch: vi.fn(), openingMetrics,
      scenarioConfig: scenario,
    });
    const internals = ui as unknown as LobbyInternals;
    const model = new HostLobbyModel('host', 'Alice', scenario);
    internals.mode = 'host';
    internals.host = { hostPeerId: 'host', roomId: 'room', broadcast: vi.fn() };
    internals.hostModel = model;
    internals.lobby = model.snapshot();

    internals.changeScenario('random-world', true);

    expect(internals.lobby?.scenario).toEqual(normalizeScenarioConfigV2({
      mode: 'random-world', seed: 222,
    }));
    expect(internals.resolvedScenario.config).toEqual(internals.lobby?.scenario);
    expect(internals.root.innerHTML).toContain('data-mp-action="scenario-reroll"');
    ui.destroy(false);
  });

  it('keeps the constrained country picker layout after matchmaking elects a host', () => {
    const ui = new MultiplayerLobby({
      onClose: vi.fn(), onHostLaunch: vi.fn(), onGuestLaunch: vi.fn(), openingMetrics,
    });
    const internals = ui as unknown as LobbyInternals;
    const model = new HostLobbyModel('host', 'Alice');
    internals.mode = 'matchmaking';
    internals.host = { hostPeerId: 'host', roomId: 'room', broadcast: vi.fn() };
    internals.hostModel = model;
    internals.lobby = model.snapshot();

    internals.render();

    expect(internals.root.innerHTML).toContain('multiplayer-lobby-card has-country-picker');
    expect(internals.root.innerHTML).toContain('country-select--lobby');
    ui.destroy(false);
  });

  it('uses distinct public queue cohorts for Campaign, Survival and Alternative Universe', () => {
    const modes = ['standard-2026', 'survival', 'random-world'] as const;
    const entries = modes.flatMap((mode, modeIndex) => [0, 1].map((seat) => ({
      clientId: `${mode}-${seat}`,
      rulesVersion: multiplayerQueueCompatibilityKey(mode),
      queuedAt: modeIndex * 10 + seat,
    })));
    const groups = formMatchmakingGroups(entries);

    expect(new Set(modes.map(multiplayerQueueCompatibilityKey))).toHaveLength(3);
    expect(groups).toHaveLength(3);
    expect(groups.every((group) => new Set(group.map((entry) => entry.rulesVersion)).size === 1)).toBe(true);
    expect(groups.flat().every((entry) => entry.rulesVersion.startsWith(`${V2_RULES_VERSION}:`))).toBe(true);
  });

  it('starts direct matchmaking with the chosen nation and mission locked in', async () => {
    const sockets = stubMatchmakingSocket();
    const scenario = normalizeScenarioConfigV2({ mode: 'survival', seed: 77 });
    const ui = new MultiplayerLobby({
      onClose: vi.fn(), onHostLaunch: vi.fn(), onGuestLaunch: vi.fn(), openingMetrics,
      scenarioConfig: scenario,
      preferredCountryId: nationIdV2('bel'),
      availableCountryIds: new Set([nationIdV2('bel')]),
      directMatchmaking: true,
    });
    const internals = ui as unknown as LobbyInternals;

    await vi.waitFor(() => expect(sockets).toHaveLength(1));

    expect(internals.mode).toBe('matchmaking');
    expect(internals.resolvedScenario.config).toEqual(scenario);
    expect(internals.root.innerHTML).toContain('Belgium');
    expect(internals.root.innerHTML).toContain('Survival');
    expect(internals.root.innerHTML).toContain('Searching for teammates');
    expect(internals.root.innerHTML).not.toContain('country-select--lobby');
    expect(internals.root.innerHTML).not.toContain('data-mp-action="scenario-');
    expect(internals.root.innerHTML).not.toContain('HOST PRIVATE ROOM');
    expect(internals.root.innerHTML).not.toContain('invite code');
    expect(internals.root.innerHTML).not.toContain('answer code');
    ui.destroy();
  });

  it('keeps private/direct-connect setup collapsed until Advanced / Private is opened', () => {
    const ui = new MultiplayerLobby({
      onClose: vi.fn(), onHostLaunch: vi.fn(), onGuestLaunch: vi.fn(), openingMetrics,
      preferredCountryId: nationIdV2('bel'),
    });
    const internals = ui as unknown as LobbyInternals;

    expect(internals.root.innerHTML).toContain('ADVANCED / PRIVATE');
    expect(internals.root.innerHTML).not.toContain('HOST PRIVATE ROOM');
    expect(internals.root.innerHTML).not.toContain('JOIN PRIVATE ROOM');

    internals.advancedPrivateOpen = true;
    internals.render();

    expect(internals.root.innerHTML).toContain('HOST PRIVATE ROOM');
    expect(internals.root.innerHTML).toContain('JOIN PRIVATE ROOM');
    ui.destroy(false);
  });

  it('renders a matchmade room as one readiness flow without a second nation or mode setup', async () => {
    stubMatchmakingSocket();
    const scenario = normalizeScenarioConfigV2({ mode: 'standard-2026', seed: 88 });
    const ui = new MultiplayerLobby({
      onClose: vi.fn(), onHostLaunch: vi.fn(), onGuestLaunch: vi.fn(), openingMetrics,
      scenarioConfig: scenario,
      preferredCountryId: nationIdV2('bel'),
      directMatchmaking: true,
    });
    const internals = ui as unknown as LobbyInternals;
    await Promise.resolve();
    const model = new HostLobbyModel('host', 'Alice', scenario);
    internals.host = { hostPeerId: 'host', roomId: 'room', broadcast: vi.fn() };
    internals.hostModel = model;
    internals.lobby = model.snapshot();
    internals.selectPreferredCountryIfAvailable();
    internals.render();

    expect(internals.root.innerHTML).toContain('CO-OP TEAM');
    expect(internals.root.innerHTML).not.toContain('ALLY');
    expect(internals.root.innerHTML).toContain(
      'Your countries stay independent; allied territory carries team supply.',
    );
    expect(internals.root.innerHTML).toContain('Belgium');
    expect(internals.root.innerHTML).toContain('Campaign');
    expect(internals.root.innerHTML).toContain('READY UP');
    expect(internals.root.innerHTML.match(/data-mp-action="(?:toggle-ready|start)"/g)).toHaveLength(1);
    expect(internals.root.innerHTML).not.toContain('country-select--lobby');
    expect(internals.root.innerHTML).not.toContain('scenario-standard');
    expect(internals.root.innerHTML).not.toContain('CREATE FRIEND INVITE');
    expect(internals.root.innerHTML).not.toContain('Host invite code');
    ui.destroy(false);
  });

  it('explains the two sovereign Survival commands without implying shared logistics', () => {
    const scenario = normalizeScenarioConfigV2({ mode: 'survival', seed: 404_456 });
    const ui = new MultiplayerLobby({
      onClose: vi.fn(), onHostLaunch: vi.fn(), onGuestLaunch: vi.fn(), openingMetrics,
      scenarioConfig: scenario,
    });
    const internals = ui as unknown as LobbyInternals;
    const model = new HostLobbyModel('host', 'Alice', scenario);
    model.connect('guest', 'Bob');
    model.apply('host', selection(nationIdV2('grl')));
    model.apply('guest', selection(nationIdV2('can')));
    internals.mode = 'host';
    internals.host = { hostPeerId: 'host', roomId: 'room', broadcast: vi.fn() };
    internals.hostModel = model;
    internals.lobby = model.snapshot();

    internals.render();

    expect(internals.root.innerHTML).toContain('EMPIRE COMMAND');
    expect(internals.root.innerHTML).toContain('DAWNLINE ACCORD');
    expect(internals.root.innerHTML).toContain('Shared outcome, separate forces.');
    expect(internals.root.innerHTML).toContain('/2 CONNECTED');
    expect(internals.root.innerHTML).not.toContain('allied territory carries team supply');
    ui.destroy(false);
  });

  it('keeps lobby type floors readable and mobile inputs at 16px', () => {
    expect(stylesSource).toContain('.mp-deployment-summary__item span');
    expect(stylesSource).toMatch(/\.mp-deployment-summary__item span\s*\{[^}]*font-size:\s*11px/s);
    expect(stylesSource).toMatch(/\.mp-one-line-help\s*\{[^}]*font-size:\s*11px/s);
    expect(stylesSource).toMatch(/@media \(max-width: 700px\)[\s\S]*\.mp-field input,[\s\S]*font-size:\s*16px/);
    expect(stylesSource).toContain('.multiplayer-lobby-card.is-direct-matchmaking:not(.has-country-picker)');
    expect(stylesSource).toMatch(/\.mp-direct-room \.mp-player-list\s*\{[^}]*overflow-y:\s*auto/s);
  });
});
