import { V2_RULES_VERSION } from '../sim/v2/balance';
import { normalizeSeed } from '../game/random';
import {
  normalizeScenarioConfigV2,
  resolveScenarioV2,
  type GameModeV2,
  type ResolvedScenarioV2,
  type ScenarioConfigV2,
} from '../sim/v2/scenarios';
import type { PlayerId } from '../sim/v2/types';
import { WorldEngineV2 } from '../sim/v2/WorldEngineV2';
import {
  DirectConnectGuest,
  DirectConnectHost,
  type DirectConnectStateEvent,
  type DirectHostMessageEvent,
} from '../multiplayer/directConnect';
import { HostLobbyModel } from '../multiplayer/lobbyModel';
import { MatchmakingClient, matchmakingServiceUrl } from '../multiplayer/matchmakingClient';
import type { MatchmakingParticipant, MatchmakingServerMessage } from '../multiplayer/matchmakingProtocol';
import type {
  LobbyAction,
  LobbyPlayer,
  LobbyStateMessage,
  SessionMessage,
  SnapshotMessage,
} from '../multiplayer/protocol';
import {
  compareIntroNationMetricsV2,
  IntroOpeningMetricsCacheV2,
  renderNationPickerV2,
  type IntroOpeningMetricsSnapshotV2,
  type IntroSort,
} from './WorldUIV2';

export interface MultiplayerHostLaunch {
  transport: DirectConnectHost;
  lobby: LobbyStateMessage;
  scenario: ScenarioConfigV2;
}

export interface MultiplayerGuestLaunch {
  transport: DirectConnectGuest;
  lobby: LobbyStateMessage;
  snapshot: SnapshotMessage;
  scenario: ScenarioConfigV2;
}

export interface MultiplayerLobbyOptions {
  onClose: () => void;
  onHostLaunch: (launch: MultiplayerHostLaunch) => void | Promise<void>;
  onGuestLaunch: (launch: MultiplayerGuestLaunch) => void | Promise<void>;
  openingMetrics: IntroOpeningMetricsSnapshotV2;
  scenarioConfig?: ScenarioConfigV2;
  preferredCountryId?: PlayerId;
}

type LobbyMode = 'menu' | 'matchmaking' | 'host' | 'guest';

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]!);
}

function storedCommanderName(): string {
  try {
    return localStorage.getItem('frontier-command-player-name')?.trim() || 'Commander';
  } catch {
    return 'Commander';
  }
}

function rememberCommanderName(name: string): void {
  try {
    localStorage.setItem('frontier-command-player-name', name.trim());
  } catch {
    // Private browsing may deny storage; the lobby remains fully usable.
  }
}

function freshScenarioSeedV2(): number {
  const values = new Uint32Array(1);
  globalThis.crypto?.getRandomValues?.(values);
  return normalizeSeed(values[0] || Date.now());
}

function sameScenarioV2(left: ScenarioConfigV2, right: ScenarioConfigV2): boolean {
  return left.mode === right.mode && left.version === right.version && left.seed === right.seed;
}

function connectionLabel(state: DirectConnectStateEvent['peer']['state']): string {
  return ({
    new: 'Preparing', gathering: 'Finding a route', 'waiting-for-answer': 'Invite ready',
    'waiting-for-host': 'Answer ready', connecting: 'Connecting', handshaking: 'Verifying game',
    connected: 'Connected', disconnected: 'Connection interrupted', failed: 'Connection failed', closed: 'Closed',
  })[state];
}

export class MultiplayerLobby {
  private readonly root = document.createElement('div');
  private mode: LobbyMode = 'menu';
  private displayName = storedCommanderName();
  private error = '';
  private status = 'Choose whether to host or join.';
  private busy = false;
  private launched = false;
  private host?: DirectConnectHost;
  private guest?: DirectConnectGuest;
  private matchmaker?: MatchmakingClient;
  private matchmakingMatchId?: string;
  private matchmakingParticipants: readonly MatchmakingParticipant[] = [];
  private readonly matchmakingInvitedClientIds = new Set<string>();
  private queuedPlayers = 1;
  private queuePosition = 1;
  private hostModel?: HostLobbyModel;
  private lobby?: LobbyStateMessage;
  private transportUnsubscribe?: () => void;
  private inviteCode = '';
  private answerCode = '';
  private pastedInvite = '';
  private pastedAnswer = '';
  private pickerPreviewCountryId: PlayerId;
  private pickerSearchQuery = '';
  private pickerContinent = 'ALL';
  private pickerSort: IntroSort = 'power';
  private pickerGridScrollTop = 0;
  private pickerSearchTimer?: number;
  private preferredCountryAttempted = false;
  private resolvedScenario: ResolvedScenarioV2;
  private openingMetrics: IntroOpeningMetricsSnapshotV2;

  constructor(private readonly options: MultiplayerLobbyOptions) {
    const initialScenario = normalizeScenarioConfigV2(options.scenarioConfig ?? {
      mode: 'standard-2026',
      seed: freshScenarioSeedV2(),
    });
    this.resolvedScenario = resolveScenarioV2(initialScenario);
    this.openingMetrics = new IntroOpeningMetricsCacheV2().read(new WorldEngineV2(
      this.resolvedScenario.config.seed,
      this.resolvedScenario.content,
    ));
    const content = this.resolvedScenario.content;
    this.pickerPreviewCountryId = options.preferredCountryId
      ?? (initialScenario.mode === 'random-world'
        ? this.openingMetrics.ranking[0]?.player.id
        : undefined)
      ?? content.nationIds.find((id) => id === 'usa')
      ?? content.nationIds[0]!;
    this.root.className = 'multiplayer-lobby-layer';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', 'Frontier Command multiplayer lobby');
    this.root.addEventListener('click', this.onClick);
    this.root.addEventListener('input', this.onInput);
    this.root.addEventListener('change', this.onChange);
    document.body.append(this.root);
    this.render();
  }

  destroy(closeConnection = true): void {
    if (this.pickerSearchTimer !== undefined) window.clearTimeout(this.pickerSearchTimer);
    this.transportUnsubscribe?.();
    this.transportUnsubscribe = undefined;
    if (closeConnection) {
      this.matchmaker?.close();
      this.host?.close();
      this.guest?.close();
    }
    this.root.removeEventListener('click', this.onClick);
    this.root.removeEventListener('input', this.onInput);
    this.root.removeEventListener('change', this.onChange);
    this.root.remove();
  }

  private setError(error: unknown, fallback: string): void {
    this.error = error instanceof Error ? error.message : fallback;
    this.busy = false;
    this.render();
  }

  private readonly onInput = (event: Event): void => {
    const input = event.target as HTMLInputElement | HTMLTextAreaElement;
    if (input.id === 'mp-player-name') this.displayName = input.value;
    if (input.id === 'mp-invite-input') this.pastedInvite = input.value;
    if (input.id === 'mp-answer-input') this.pastedAnswer = input.value;
    if (input.id === 'mp-country-search') {
      const query = input.value.trim().toLocaleLowerCase('en');
      this.pickerSearchQuery = input.value;
      const visible: HTMLElement[] = [];
      for (const option of this.root.querySelectorAll<HTMLElement>('.country-grid [data-name]')) {
        const continentMatches = this.pickerContinent === 'ALL'
          || option.dataset.continent === this.pickerContinent;
        option.hidden = !continentMatches || (query.length > 0 && !(option.dataset.name ?? '').includes(query));
        if (!option.hidden && !option.matches(':disabled')) visible.push(option);
      }
      if (query) {
        const match = visible.find((option) => option.dataset.countryName === query) ?? visible[0];
        if (match?.dataset.country) this.pickerPreviewCountryId = match.dataset.country as PlayerId;
      }
      if (this.pickerSearchTimer !== undefined) window.clearTimeout(this.pickerSearchTimer);
      this.pickerSearchTimer = window.setTimeout(() => {
        this.pickerSearchTimer = undefined;
        this.pickerGridScrollTop = 0;
        const currentGrid = this.root.querySelector<HTMLElement>('.country-select--lobby .country-grid');
        if (currentGrid) currentGrid.scrollTop = 0;
        this.render();
        const nextSearch = this.root.querySelector<HTMLInputElement>('#mp-country-search');
        nextSearch?.focus();
        nextSearch?.setSelectionRange(nextSearch.value.length, nextSearch.value.length);
      }, 90);
    }
  };

  private readonly onChange = (event: Event): void => {
    const select = event.target as HTMLSelectElement;
    if (select.id !== 'mp-country-sort') return;
    this.pickerSort = select.value as IntroSort;
    this.pickerGridScrollTop = 0;
    window.setTimeout(() => this.render(), 0);
  };

  private readonly onClick = (event: MouseEvent): void => {
    const target = (event.target as Element | null)?.closest<HTMLElement>('[data-mp-action]');
    if (!target || this.busy) return;
    event.preventDefault();
    event.stopPropagation();
    switch (target.dataset.mpAction) {
      case 'close':
        this.destroy();
        this.options.onClose();
        break;
      case 'show-host':
        this.mode = 'host'; this.error = ''; this.render();
        break;
      case 'find-match': void this.startMatchmaking(); break;
      case 'cancel-matchmaking':
        this.stopMatchmaking();
        this.mode = 'menu';
        this.status = 'Matchmaking cancelled.';
        this.render();
        break;
      case 'show-guest':
        this.mode = 'guest'; this.error = ''; this.render();
        break;
      case 'back':
        this.stopMatchmaking();
        this.host?.close(); this.guest?.close();
        this.host = undefined; this.guest = undefined; this.hostModel = undefined; this.lobby = undefined;
        this.transportUnsubscribe?.(); this.transportUnsubscribe = undefined;
        this.preferredCountryAttempted = false;
        this.mode = 'menu'; this.error = ''; this.status = 'Choose whether to host or join.'; this.render();
        break;
      case 'create-room': void this.createRoom(); break;
      case 'create-invite': void this.createInvite(); break;
      case 'accept-answer': void this.acceptAnswer(); break;
      case 'join-room': void this.joinRoom(); break;
      case 'copy-invite': void this.copyCode(this.inviteCode, 'Invite copied. Send it privately to one friend.'); break;
      case 'copy-answer': void this.copyCode(this.answerCode, 'Answer copied. Send it back to the host.'); break;
      case 'toggle-ready': {
        const local = this.localPlayer();
        this.applyLocalAction({ type: 'set-ready', ready: !local?.ready });
        break;
      }
      case 'start': this.applyLocalAction({ type: 'start' }); break;
      case 'scenario-standard': this.changeScenario('standard-2026'); break;
      case 'scenario-random': this.changeScenario('random-world'); break;
      case 'scenario-reroll': this.changeScenario(this.lobby?.scenario.mode ?? 'random-world', true); break;
      case 'continent-filter': {
        this.capturePickerScroll();
        this.pickerContinent = target.dataset.continent ?? 'ALL';
        this.pickerGridScrollTop = 0;
        const first = this.availablePickerNationIds()[0];
        if (first) this.pickerPreviewCountryId = first;
        this.render();
        break;
      }
      case 'preview-country':
        this.capturePickerScroll();
        if (target.dataset.country) this.pickerPreviewCountryId = target.dataset.country as PlayerId;
        this.render();
        break;
      case 'select-country':
        if (target.dataset.country) {
          this.pickerPreviewCountryId = target.dataset.country as PlayerId;
          this.applyLocalAction({ type: 'select-country', countryId: this.pickerPreviewCountryId });
        }
        break;
    }
  };

  private async startMatchmaking(): Promise<void> {
    const name = this.displayName.trim();
    if (!name) return this.setError(undefined, 'Enter your name first.');
    const url = matchmakingServiceUrl();
    if (!url) {
      return this.setError(undefined, 'Public matchmaking is not configured yet. You can still use a private room below.');
    }
    this.stopMatchmaking();
    rememberCommanderName(name);
    this.mode = 'matchmaking';
    this.busy = true;
    this.error = '';
    this.queuedPlayers = 1;
    this.queuePosition = 1;
    this.status = 'Connecting to the live matchmaking queue…';
    this.render();
    try {
      this.matchmaker = new MatchmakingClient({
        url,
        rulesVersion: V2_RULES_VERSION,
        displayName: name,
        onOpen: () => {
          this.busy = false;
          this.status = 'You are in the queue. Looking for compatible commanders now.';
          this.render();
        },
        onMessage: (message) => void this.onMatchmakingMessage(message),
        onError: (error) => this.setError(error, 'Public matchmaking failed.'),
        onClose: () => {
          if (this.mode === 'matchmaking' && !this.lobby) {
            this.setError(undefined, 'The matchmaking connection closed. Try the queue again.');
          }
        },
      });
    } catch (error) {
      this.setError(error, 'Public matchmaking could not start.');
    }
  }

  private async onMatchmakingMessage(message: MatchmakingServerMessage): Promise<void> {
    if (message.type === 'pong') return;
    if (message.type === 'error') {
      this.setError(new Error(message.message), 'Public matchmaking rejected the request.');
      return;
    }
    if (message.type === 'queue-status') {
      this.queuedPlayers = message.queuedPlayers;
      this.queuePosition = message.position;
      this.busy = false;
      this.status = message.queuedPlayers > 1
        ? 'Compatible commanders found. Opening a lobby…'
        : 'Waiting for another compatible commander to open a lobby…';
      this.render();
      return;
    }
    if (message.type === 'match-cancelled') {
      this.host?.close();
      this.guest?.close();
      this.host = undefined;
      this.guest = undefined;
      this.hostModel = undefined;
      this.lobby = undefined;
      this.matchmakingMatchId = undefined;
      this.matchmakingParticipants = [];
      this.matchmakingInvitedClientIds.clear();
      this.busy = false;
      this.status = `${message.reason} You are back in the queue.`;
      this.render();
      return;
    }
    if (message.type === 'match-found') {
      await this.prepareMatchedLobby(message);
      return;
    }
    if (message.type === 'signal') {
      await this.acceptMatchmakingSignal(message);
    }
  }

  private async prepareMatchedLobby(message: Extract<MatchmakingServerMessage, { type: 'match-found' }>): Promise<void> {
    if (!this.matchmaker
      || (this.matchmakingMatchId && this.matchmakingMatchId !== message.matchId)) return;
    this.matchmakingMatchId = message.matchId;
    this.matchmakingParticipants = message.participants;
    this.busy = true;
    this.status = `Open lobby found. Connecting ${message.participants.length} commanders…`;
    this.render();
    if (message.hostClientId !== this.matchmaker.clientId) return;
    try {
      if (!this.host) {
        const name = this.displayName.trim();
        this.host = new DirectConnectHost({
          rulesVersion: V2_RULES_VERSION,
          displayName: name,
          maxPlayers: 8,
        });
        this.hostModel = new HostLobbyModel(this.host.hostPeerId, name, this.resolvedScenario.config);
        this.lobby = this.hostModel.snapshot();
        this.selectPreferredCountryIfAvailable();
        this.transportUnsubscribe = this.host.subscribe({
          onStateChange: (change) => this.onHostState(change),
          onMessage: (hostMessage) => this.onHostMessage(hostMessage),
        });
      }
      for (const participant of message.participants) {
        if (participant.clientId === message.hostClientId
          || this.matchmakingInvitedClientIds.has(participant.clientId)) continue;
        this.matchmakingInvitedClientIds.add(participant.clientId);
        const invite = await this.host.createInvite();
        this.matchmaker.sendSignal(message.matchId, participant.clientId, 'offer', invite.inviteCode);
      }
      this.status = 'Lobby open. More commanders may join until the host starts.';
      this.busy = false;
      this.render();
    } catch (error) {
      this.setError(error, 'The matched lobby could not be opened.');
    }
  }

  private async acceptMatchmakingSignal(message: Extract<MatchmakingServerMessage, { type: 'signal' }>): Promise<void> {
    if (!this.matchmaker || message.matchId !== this.matchmakingMatchId) return;
    try {
      if (message.kind === 'offer') {
        if (this.guest || this.host) return;
        const joined = await DirectConnectGuest.acceptInvite(message.payload, {
          rulesVersion: V2_RULES_VERSION,
          displayName: this.displayName.trim(),
        });
        this.guest = joined.connection;
        this.transportUnsubscribe = this.guest.subscribe({
          onStateChange: (change) => this.onGuestState(change),
          onMessage: (guestMessage) => this.onGuestMessage(guestMessage),
        });
        this.matchmaker.sendSignal(message.matchId, message.fromClientId, 'answer', joined.answerCode);
        this.status = 'Secure answer sent automatically. Joining the shared lobby…';
        this.render();
        return;
      }
      if (!this.host) return;
      await this.host.acceptAnswer(message.payload);
      this.status = 'Secure route accepted. Waiting for the commander handshake…';
      this.render();
    } catch (error) {
      this.setError(error, 'A matched peer-to-peer route could not be completed.');
    }
  }

  private finishMatchmakingConnection(closeRoom: boolean): void {
    if (!this.matchmaker || !this.matchmakingMatchId) return;
    if (closeRoom) this.matchmaker.complete(this.matchmakingMatchId);
    this.matchmaker.close();
    this.matchmaker = undefined;
    this.busy = false;
  }

  private stopMatchmaking(): void {
    this.matchmaker?.close();
    this.matchmaker = undefined;
    this.matchmakingMatchId = undefined;
    this.matchmakingParticipants = [];
    this.matchmakingInvitedClientIds.clear();
    this.queuedPlayers = 1;
    this.queuePosition = 1;
  }

  private async createRoom(): Promise<void> {
    const name = this.displayName.trim();
    if (!name) return this.setError(undefined, 'Enter your name first.');
    this.busy = true;
    this.error = '';
    this.status = 'Opening the room…';
    this.render();
    try {
      rememberCommanderName(name);
      this.host = new DirectConnectHost({ rulesVersion: V2_RULES_VERSION, displayName: name, maxPlayers: 8 });
      this.hostModel = new HostLobbyModel(this.host.hostPeerId, name, this.resolvedScenario.config);
      this.lobby = this.hostModel.snapshot();
      this.selectPreferredCountryIfAvailable();
      this.transportUnsubscribe = this.host.subscribe({
        onStateChange: (change) => this.onHostState(change),
        onMessage: (message) => this.onHostMessage(message),
      });
      this.status = 'Room ready. Choose your country, then invite a friend.';
      this.busy = false;
      this.render();
    } catch (error) {
      this.setError(error, 'The room could not be created.');
    }
  }

  private async createInvite(): Promise<void> {
    if (!this.host) return;
    this.busy = true;
    this.error = '';
    this.status = 'Creating a secure peer route…';
    this.render();
    try {
      const invite = await this.host.createInvite();
      this.inviteCode = invite.inviteCode;
      this.pastedAnswer = '';
      this.status = 'Invite ready. Your friend pastes it and returns an answer code.';
      this.busy = false;
      this.render();
    } catch (error) {
      this.setError(error, 'The invite could not be created.');
    }
  }

  private async acceptAnswer(): Promise<void> {
    if (!this.host || !this.pastedAnswer.trim()) return this.setError(undefined, 'Paste your friend’s answer code first.');
    this.busy = true;
    this.error = '';
    this.status = 'Completing the connection…';
    this.render();
    try {
      await this.host.acceptAnswer(this.pastedAnswer);
      this.pastedAnswer = '';
      this.inviteCode = '';
      this.status = 'Answer accepted. Waiting for the secure connection.';
      this.busy = false;
      this.render();
    } catch (error) {
      this.setError(error, 'The answer code could not be accepted.');
    }
  }

  private async joinRoom(): Promise<void> {
    const name = this.displayName.trim();
    if (!name) return this.setError(undefined, 'Enter your name first.');
    if (!this.pastedInvite.trim()) return this.setError(undefined, 'Paste the host invite first.');
    this.busy = true;
    this.error = '';
    this.status = 'Reading the invite and finding a route…';
    this.render();
    try {
      rememberCommanderName(name);
      const joined = await DirectConnectGuest.acceptInvite(this.pastedInvite, {
        rulesVersion: V2_RULES_VERSION,
        displayName: name,
      });
      this.guest = joined.connection;
      this.transportUnsubscribe = this.guest.subscribe({
        onStateChange: (change) => this.onGuestState(change),
        onMessage: (message) => this.onGuestMessage(message),
      });
      this.answerCode = joined.answerCode;
      this.status = 'Answer ready. Send it back to the host; keep this window open.';
      this.busy = false;
      this.render();
    } catch (error) {
      this.setError(error, 'The invite could not be joined.');
    }
  }

  private onHostState(change: DirectConnectStateEvent): void {
    const { peer } = change;
    this.status = `${peer.displayName ?? 'Friend'} · ${connectionLabel(peer.state)}`;
    if (peer.peerId && peer.displayName && peer.state === 'connected') {
      const result = this.hostModel?.connect(peer.peerId, peer.displayName);
      if (result && !result.accepted) {
        this.error = result.reason ?? 'That player cannot join.';
        this.host?.disconnect(peer.peerId);
      }
      this.publishLobby();
      this.busy = false;
      if (this.matchmakingParticipants.length > 0) {
        this.status = 'Lobby open. The host can start when everyone is ready.';
      }
    } else if (peer.peerId && ['disconnected', 'failed', 'closed'].includes(peer.state)) {
      this.hostModel?.disconnect(peer.peerId);
      this.publishLobby();
    }
    if (change.error) this.error = change.error.message;
    this.render();
  }

  private onGuestState(change: DirectConnectStateEvent): void {
    this.status = `${change.peer.displayName ?? 'Host'} · ${connectionLabel(change.peer.state)}`;
    if (change.error) this.error = change.error.message;
    if (change.peer.state === 'connected') this.busy = false;
    this.render();
  }

  private onHostMessage(event: DirectHostMessageEvent): void {
    if (event.message.type !== 'lobby-action' || !this.hostModel) return;
    const result = this.hostModel.apply(event.peerId, event.message.action, event.message.revision);
    if (!result.accepted) this.error = result.reason ?? 'Lobby action rejected.';
    this.publishLobby();
    this.render();
    if (result.accepted && event.message.action.type === 'start') void this.launchHost();
  }

  private onGuestMessage(message: SessionMessage): void {
    if (message.type === 'lobby-state') {
      if (!this.lobby || message.revision >= this.lobby.revision) {
        this.lobby = message;
        this.synchronizeScenarioPresentation(message.scenario);
      }
      this.selectPreferredCountryIfAvailable();
      this.render();
      return;
    }
    if (message.type === 'snapshot' && this.lobby?.started && !this.launched && this.guest) {
      this.finishMatchmakingConnection(false);
      this.launched = true;
      void Promise.resolve(this.options.onGuestLaunch({
        transport: this.guest,
        lobby: this.lobby,
        snapshot: message,
        scenario: { ...this.lobby.scenario },
      })).catch((error) => {
        this.launched = false;
        this.setError(error, 'The multiplayer campaign could not start.');
      });
    }
  }

  private publishLobby(): void {
    if (!this.hostModel || !this.host) return;
    this.lobby = this.hostModel.snapshot();
    try {
      this.host.broadcast(this.lobby);
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Lobby update failed.';
    }
  }

  private applyLocalAction(action: LobbyAction): void {
    this.error = '';
    if (this.host && this.hostModel) {
      const result = this.hostModel.apply(this.host.hostPeerId, action, this.lobby?.revision);
      if (!result.accepted) this.error = result.reason ?? 'Lobby action rejected.';
      this.publishLobby();
      this.render();
      if (result.accepted && action.type === 'start') void this.launchHost();
      return;
    }
    if (this.guest && this.lobby) {
      try {
        this.guest.send({ type: 'lobby-action', revision: this.lobby.revision, action });
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Lobby action could not be sent.';
      }
      this.render();
    }
  }

  private async launchHost(): Promise<void> {
    if (this.launched || !this.host || !this.lobby?.started) return;
    const launchLobby = this.lobby;
    this.finishMatchmakingConnection(true);
    this.launched = true;
    try {
      await this.options.onHostLaunch({
        transport: this.host,
        lobby: launchLobby,
        scenario: { ...launchLobby.scenario },
      });
    } catch (error) {
      this.launched = false;
      const recovery = this.hostModel?.resetStartAfterLaunchFailure(
        this.host.hostPeerId,
        launchLobby.revision,
      );
      if (recovery?.accepted) this.publishLobby();
      this.setError(error, 'The multiplayer campaign could not start.');
    }
  }

  private localPlayer(): LobbyPlayer | undefined {
    const peerId = this.host?.hostPeerId ?? this.guest?.peerId;
    return this.lobby?.players.find((player) => player.peerId === peerId);
  }

  private localPeerId(): string | undefined {
    return this.host?.hostPeerId ?? this.guest?.peerId;
  }

  private claimedCountryIds(): Set<PlayerId> {
    const localId = this.localPeerId();
    return new Set(this.lobby?.players.flatMap((player) => (
      player.peerId === localId || !player.countryId ? [] : [player.countryId]
    )) ?? []);
  }

  private claimantNames(): Map<PlayerId, string> {
    const localId = this.localPeerId();
    return new Map(this.lobby?.players.flatMap((player) => (
      player.peerId === localId || !player.countryId ? [] : [[player.countryId, player.displayName] as const]
    )) ?? []);
  }

  private availablePickerNationIds(): PlayerId[] {
    const query = this.pickerSearchQuery.trim().toLocaleLowerCase('en');
    const claimed = this.claimedCountryIds();
    const content = this.resolvedScenario.content;
    return [...content.nationIds]
      .map((id) => content.nations[id])
      .filter((nation): nation is NonNullable<typeof nation> => Boolean(nation)
        && this.openingMetrics.byNation.has(nation!.id)
        && !claimed.has(nation!.id)
        && (this.pickerContinent === 'ALL' || nation!.continent === this.pickerContinent)
        && (!query || `${nation!.name} ${nation!.sigil}`.toLowerCase().includes(query)))
      .sort((left, right) => compareIntroNationMetricsV2(
        left, right, this.pickerSort, this.openingMetrics,
      ))
      .map((nation) => nation.id);
  }

  private capturePickerScroll(): void {
    this.pickerGridScrollTop = this.root.querySelector<HTMLElement>('.country-select--lobby .country-grid')
      ?.scrollTop ?? this.pickerGridScrollTop;
  }

  private selectPreferredCountryIfAvailable(): void {
    if (this.preferredCountryAttempted || !this.lobby) return;
    const local = this.localPlayer();
    if (!local) return;
    if (local.countryId) {
      this.preferredCountryAttempted = true;
      this.pickerPreviewCountryId = local.countryId;
      return;
    }
    const preferred = this.options.preferredCountryId;
    if (!preferred) {
      this.preferredCountryAttempted = true;
      return;
    }
    this.preferredCountryAttempted = true;
    this.pickerPreviewCountryId = preferred;
    if (this.claimedCountryIds().has(preferred)) {
      this.status = `${this.resolvedScenario.content.nations[preferred]?.name ?? 'That country'} is already claimed. Choose another nation.`;
      return;
    }
    if (this.hostModel && this.host) {
      const result = this.hostModel.apply(
        this.host.hostPeerId,
        { type: 'select-country', countryId: preferred },
        this.lobby.revision,
      );
      if (result.accepted) this.lobby = this.hostModel.snapshot();
      else this.error = result.reason ?? 'Your preferred country could not be selected.';
      return;
    }
    try {
      this.guest?.send({
        type: 'lobby-action',
        revision: this.lobby.revision,
        action: { type: 'select-country', countryId: preferred },
      });
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Your preferred country could not be selected.';
    }
  }

  private renderNationPicker(): string {
    const picker = renderNationPickerV2(this.openingMetrics, {
      previewCountryId: this.pickerPreviewCountryId,
      searchQuery: this.pickerSearchQuery,
      continent: this.pickerContinent,
      sort: this.pickerSort,
      context: 'lobby',
      claimedCountryIds: this.claimedCountryIds(),
      claimantNames: this.claimantNames(),
      selectedCountryId: this.localPlayer()?.countryId ?? undefined,
      content: this.resolvedScenario.content,
      scenarioConfig: this.lobby?.scenario ?? this.resolvedScenario.config,
      scenarioEditable: Boolean(this.host && this.lobby?.hostPeerId === this.host.hostPeerId),
    });
    this.pickerPreviewCountryId = picker.previewCountryId;
    return picker.html;
  }

  private async copyCode(code: string, success: string): Promise<void> {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      this.status = success;
      this.error = '';
    } catch {
      this.error = 'Clipboard access was blocked. Select the code and copy it manually.';
    }
    this.render();
  }

  private renderPlayers(): string {
    if (!this.lobby) return '<div class="mp-empty">Waiting for the host lobby…</div>';
    const localId = this.host?.hostPeerId ?? this.guest?.peerId;
    return `<div class="mp-player-list">${this.lobby.players.map((player) => {
      const local = player.peerId === localId;
      const country = player.countryId ? this.resolvedScenario.content.nations[player.countryId] : undefined;
      return `<article class="mp-player ${local ? 'is-local' : ''} ${player.connected ? '' : 'is-offline'}"><div class="mp-player__identity"><span>${country?.sigil ?? '◇'}</span><div><strong>${escapeHtml(player.displayName)}${player.peerId === this.lobby!.hostPeerId ? ' · HOST' : ''}</strong><small>${player.connected ? player.ready ? 'READY' : 'CHOOSING' : 'DISCONNECTED'}</small></div></div><b>${escapeHtml(country?.name ?? (local ? 'Choose below' : 'No country'))}</b></article>`;
    }).join('')}</div>`;
  }

  private renderMenu(): string {
    return `<div class="mp-lobby__intro mp-lobby__intro--matchmaking"><div class="panel-kicker">LIVE MATCHMAKING · NO CODES</div><h1>Find commanders who want to play now</h1><p>Enter the public queue and join an open compatible lobby. More commanders can keep joining until its host starts the campaign.</p><div class="mp-matchmaking-form"><label class="mp-field"><span>YOUR NAME</span><input id="mp-player-name" maxlength="40" value="${escapeHtml(this.displayName)}" autocomplete="nickname"></label><button class="primary-button mp-find-match" data-mp-action="find-match"><b>FIND A LOBBY</b><small>Wait with everyone playing now</small></button></div><div class="mp-private-divider"><span>PRIVATE GAME WITH FRIENDS</span></div><div class="mp-choice mp-choice--private"><button class="secondary-button" data-mp-action="show-host"><b>HOST PRIVATE ROOM</b><small>Create direct invites</small></button><button class="secondary-button" data-mp-action="show-guest"><b>JOIN PRIVATE ROOM</b><small>Use a friend’s invite</small></button></div><small class="mp-caveat">Public matchmaking automates discovery and signaling. Campaign traffic remains peer-to-peer and the elected host tab must stay open.</small></div>`;
  }

  private renderMatchmaking(): string {
    const matched = this.matchmakingParticipants.length > 0;
    const players = matched
      ? `<div class="mp-matchmaking__players">${this.matchmakingParticipants.map((player) => `<span>${escapeHtml(player.displayName)}</span>`).join('')}</div>`
      : `<div class="mp-matchmaking__count"><b>${this.queuedPlayers}</b><span>compatible commander${this.queuedPlayers === 1 ? '' : 's'} waiting</span></div>`;
    return `<div class="mp-matchmaking"><div class="mp-matchmaking__radar ${matched ? 'is-matched' : ''}" aria-hidden="true"><i></i><i></i><b>${matched ? '✓' : '⌁'}</b></div><div class="panel-kicker">${matched ? 'OPEN LOBBY FOUND' : `QUEUE POSITION ${this.queuePosition}`}</div><h2>${matched ? 'Joining the shared lobby' : 'Searching for commanders'}</h2><p>${matched ? 'No codes are needed. The room stays open to new players until the host starts.' : 'Keep this tab open. Everyone on the same game version can meet in one open lobby.'}</p>${players}<button class="secondary-button" data-mp-action="cancel-matchmaking">${matched ? 'LEAVE LOBBY' : 'CANCEL SEARCH'}</button></div>`;
  }

  private renderHost(): string {
    if (!this.host) return `<div class="mp-setup"><div class="panel-kicker">HOST A DIRECT GAME</div><h2>Create your room</h2><label class="mp-field"><span>YOUR NAME</span><input id="mp-player-name" maxlength="40" value="${escapeHtml(this.displayName)}" autocomplete="nickname"></label><button class="primary-button" data-mp-action="create-room">CREATE ROOM</button></div>`;
    const local = this.localPlayer();
    const block = this.hostModel?.startBlockReason();
    const rail = `<div class="mp-room__rail"><div class="mp-room__head"><div><div class="panel-kicker">HOST ROOM · ${escapeHtml(this.host.roomId.slice(-8).toUpperCase())}</div><h2>Commanders</h2></div><span>${this.lobby?.players.filter((player) => player.connected).length ?? 1}/8 CONNECTED</span></div>${this.renderPlayers()}<div class="mp-connect-grid"><section><h3>1 · Invite one friend</h3><p>Create a private code and send it to that friend.</p>${this.inviteCode ? `<textarea readonly aria-label="Host invite code">${escapeHtml(this.inviteCode)}</textarea><button class="secondary-button" data-mp-action="copy-invite">COPY INVITE</button>` : '<button class="secondary-button" data-mp-action="create-invite">CREATE FRIEND INVITE</button>'}</section><section><h3>2 · Accept their answer</h3><p>Paste the answer they send back.</p><textarea id="mp-answer-input" placeholder="Paste friend answer…">${escapeHtml(this.pastedAnswer)}</textarea><button class="secondary-button" data-mp-action="accept-answer">CONNECT FRIEND</button></section></div><div class="mp-room__actions"><button class="secondary-button ${local?.ready ? 'is-ready' : ''}" data-mp-action="toggle-ready" ${local?.countryId ? '' : 'disabled'}>${local?.ready ? '✓ READY' : 'MARK READY'}</button><button class="primary-button" data-mp-action="start" ${block ? 'disabled' : ''}>START CAMPAIGN</button></div>${block ? `<small class="mp-start-note">${escapeHtml(block)}</small>` : ''}</div>`;
    return `<div class="mp-room mp-room--with-picker">${rail}${this.renderNationPicker()}</div>`;
  }

  private renderGuest(): string {
    if (!this.guest) return `<div class="mp-setup"><div class="panel-kicker">JOIN A DIRECT GAME</div><h2>Paste your friend’s invite</h2><label class="mp-field"><span>YOUR NAME</span><input id="mp-player-name" maxlength="40" value="${escapeHtml(this.displayName)}" autocomplete="nickname"></label><label class="mp-field"><span>HOST INVITE</span><textarea id="mp-invite-input" placeholder="Paste the long Frontier Command invite code…">${escapeHtml(this.pastedInvite)}</textarea></label><button class="primary-button" data-mp-action="join-room">CREATE ANSWER</button></div>`;
    const local = this.localPlayer();
    const rail = `<div class="mp-room__rail"><div class="mp-room__head"><div><div class="panel-kicker">GUEST · ${escapeHtml(this.guest.hostName.toUpperCase())}</div><h2>Multiplayer lobby</h2></div><span>${escapeHtml(connectionLabel(this.guest.state).toUpperCase())}</span></div>${this.answerCode ? `<div class="mp-answer-callout"><h3>Send this answer back to the host</h3><p>The connection completes only after the host pastes it.</p><textarea readonly aria-label="Friend answer code">${escapeHtml(this.answerCode)}</textarea><button class="secondary-button" data-mp-action="copy-answer">COPY ANSWER</button></div>` : ''}${this.renderPlayers()}${this.lobby ? `<div class="mp-room__actions"><button class="secondary-button ${local?.ready ? 'is-ready' : ''}" data-mp-action="toggle-ready" ${local?.countryId ? '' : 'disabled'}>${local?.ready ? '✓ READY' : 'MARK READY'}</button><span>Only the host starts the shared campaign.</span></div>` : ''}</div>`;
    return this.lobby
      ? `<div class="mp-room mp-room--with-picker">${rail}${this.renderNationPicker()}</div>`
      : `<div class="mp-room">${rail}</div>`;
  }
  private render(): void {
    this.capturePickerScroll();
    if (this.lobby) this.synchronizeScenarioPresentation(this.lobby.scenario);
    const content = this.mode === 'menu' ? this.renderMenu()
      : this.mode === 'matchmaking' && !this.lobby ? this.renderMatchmaking()
        : this.mode === 'host' || this.host ? this.renderHost() : this.renderGuest();
    // Matchmade rooms keep `mode === 'matchmaking'` after a host/guest transport
    // has been elected. Key the fullscreen picker layout off the actual room
    // state instead of the entry route, otherwise a public room renders the
    // picker inside the unconstrained setup-card layout and the preview scrolls
    // out of view beside the long country list.
    const hasPicker = Boolean(this.mode !== 'menu' && this.lobby && (this.host || this.guest));
    this.root.innerHTML = `<section class="multiplayer-lobby-card ${hasPicker ? 'has-country-picker' : ''}"><button class="modal-close" data-mp-action="${this.mode === 'menu' ? 'close' : 'back'}" aria-label="${this.mode === 'menu' ? 'Close multiplayer' : 'Back'}">×</button>${content}<footer class="mp-status ${this.error ? 'has-error' : ''}"><i></i><span>${escapeHtml(this.error || this.status)}</span>${this.busy ? '<b>WORKING…</b>' : ''}</footer></section>`;
    const pickerGrid = this.root.querySelector<HTMLElement>('.country-select--lobby .country-grid');
    if (pickerGrid) pickerGrid.scrollTop = this.pickerGridScrollTop;
  }

  private changeScenario(mode: GameModeV2, reroll = false): void {
    const current = this.lobby?.scenario ?? this.resolvedScenario.config;
    const scenario = normalizeScenarioConfigV2({
      mode,
      seed: reroll ? freshScenarioSeedV2() : current.seed,
    });
    this.applyLocalAction({ type: 'set-scenario', scenario });
  }

  private synchronizeScenarioPresentation(scenario: ScenarioConfigV2): void {
    if (sameScenarioV2(this.resolvedScenario.config, scenario)) return;
    const previousMode = this.resolvedScenario.config.mode;
    const previousPreviewCountryId = this.pickerPreviewCountryId;
    const resolved = resolveScenarioV2(scenario);
    this.resolvedScenario = resolved;
    this.openingMetrics = new IntroOpeningMetricsCacheV2().read(new WorldEngineV2(
      resolved.config.seed,
      resolved.content,
    ));
    this.pickerPreviewCountryId = resolved.content.nations[previousPreviewCountryId]
      ? previousPreviewCountryId
      : resolved.config.mode === 'random-world'
        ? this.openingMetrics.ranking[0]?.player.id ?? resolved.content.nationIds[0]!
        : resolved.content.nationIds.find((id) => id === 'usa')
          ?? resolved.content.nationIds[0]!;
    if (previousMode !== resolved.config.mode) this.pickerGridScrollTop = 0;
  }
}
