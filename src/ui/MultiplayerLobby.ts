import { V2_RULES_VERSION } from '../sim/v2/balance';
import { WORLD_CONTENT_V2 } from '../sim/v2/content';
import type { PlayerId } from '../sim/v2/types';
import {
  DirectConnectGuest,
  DirectConnectHost,
  type DirectConnectStateEvent,
  type DirectHostMessageEvent,
} from '../multiplayer/directConnect';
import { HostLobbyModel } from '../multiplayer/lobbyModel';
import type {
  LobbyAction,
  LobbyPlayer,
  LobbyStateMessage,
  SessionMessage,
  SnapshotMessage,
} from '../multiplayer/protocol';

export interface MultiplayerHostLaunch {
  transport: DirectConnectHost;
  lobby: LobbyStateMessage;
}

export interface MultiplayerGuestLaunch {
  transport: DirectConnectGuest;
  lobby: LobbyStateMessage;
  snapshot: SnapshotMessage;
}

export interface MultiplayerLobbyOptions {
  onClose: () => void;
  onHostLaunch: (launch: MultiplayerHostLaunch) => void | Promise<void>;
  onGuestLaunch: (launch: MultiplayerGuestLaunch) => void | Promise<void>;
}

type LobbyMode = 'menu' | 'host' | 'guest';

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
  private hostModel?: HostLobbyModel;
  private lobby?: LobbyStateMessage;
  private transportUnsubscribe?: () => void;
  private inviteCode = '';
  private answerCode = '';
  private pastedInvite = '';
  private pastedAnswer = '';

  constructor(private readonly options: MultiplayerLobbyOptions) {
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
    this.transportUnsubscribe?.();
    this.transportUnsubscribe = undefined;
    if (closeConnection) {
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
  };

  private readonly onChange = (event: Event): void => {
    const select = event.target as HTMLSelectElement;
    if (select.id !== 'mp-country-select') return;
    const action: LobbyAction = select.value
      ? { type: 'select-country', countryId: select.value as PlayerId }
      : { type: 'clear-country' };
    this.applyLocalAction(action);
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
      case 'show-guest':
        this.mode = 'guest'; this.error = ''; this.render();
        break;
      case 'back':
        this.host?.close(); this.guest?.close();
        this.host = undefined; this.guest = undefined; this.hostModel = undefined; this.lobby = undefined;
        this.transportUnsubscribe?.(); this.transportUnsubscribe = undefined;
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
    }
  };

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
      this.hostModel = new HostLobbyModel(this.host.hostPeerId, name);
      this.lobby = this.hostModel.snapshot();
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
    this.render();
  }

  private onHostMessage(event: DirectHostMessageEvent): void {
    if (event.message.type !== 'lobby-action' || !this.hostModel) return;
    const result = this.hostModel.apply(event.peerId, event.message.action);
    if (!result.accepted) this.error = result.reason ?? 'Lobby action rejected.';
    this.publishLobby();
    if (result.accepted && event.message.action.type === 'start') void this.launchHost();
  }

  private onGuestMessage(message: SessionMessage): void {
    if (message.type === 'lobby-state') {
      if (!this.lobby || message.revision >= this.lobby.revision) this.lobby = message;
      this.render();
      return;
    }
    if (message.type === 'snapshot' && this.lobby?.started && !this.launched && this.guest) {
      this.launched = true;
      void Promise.resolve(this.options.onGuestLaunch({
        transport: this.guest,
        lobby: this.lobby,
        snapshot: message,
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
      const result = this.hostModel.apply(this.host.hostPeerId, action);
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
    this.launched = true;
    try {
      await this.options.onHostLaunch({ transport: this.host, lobby: launchLobby });
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

  private countryOptions(player: LobbyPlayer): string {
    const claimed = new Set(this.lobby?.players.flatMap((candidate) => (
      candidate.peerId === player.peerId || !candidate.countryId ? [] : [candidate.countryId]
    )) ?? []);
    return `<option value="">Choose a country…</option>${WORLD_CONTENT_V2.nationIds
      .map((id) => WORLD_CONTENT_V2.nations[id])
      .filter((nation): nation is NonNullable<typeof nation> => Boolean(nation))
      .sort((left, right) => left.name.localeCompare(right.name, 'en'))
      .map((nation) => `<option value="${nation.id}" ${player.countryId === nation.id ? 'selected' : ''} ${claimed.has(nation.id) ? 'disabled' : ''}>${escapeHtml(nation.sigil)} ${escapeHtml(nation.name)}${claimed.has(nation.id) ? ' · claimed' : ''}</option>`)
      .join('')}`;
  }

  private renderPlayers(): string {
    if (!this.lobby) return '<div class="mp-empty">Waiting for the host lobby…</div>';
    const localId = this.host?.hostPeerId ?? this.guest?.peerId;
    return `<div class="mp-player-list">${this.lobby.players.map((player) => {
      const local = player.peerId === localId;
      const country = player.countryId ? WORLD_CONTENT_V2.nations[player.countryId] : undefined;
      return `<article class="mp-player ${local ? 'is-local' : ''} ${player.connected ? '' : 'is-offline'}"><div class="mp-player__identity"><span>${country?.sigil ?? '◇'}</span><div><strong>${escapeHtml(player.displayName)}${player.peerId === this.lobby!.hostPeerId ? ' · HOST' : ''}</strong><small>${player.connected ? player.ready ? 'READY' : 'CHOOSING' : 'DISCONNECTED'}</small></div></div>${local && !this.lobby!.started ? `<select id="mp-country-select" aria-label="Your country">${this.countryOptions(player)}</select>` : `<b>${escapeHtml(country?.name ?? 'No country')}</b>`}</article>`;
    }).join('')}</div>`;
  }

  private renderMenu(): string {
    return `<div class="mp-lobby__intro"><div class="panel-kicker">DIRECT MULTIPLAYER · 2–8 PLAYERS</div><h1>Play Frontier Command with friends</h1><p>One player hosts the same deterministic world. Every friend controls a different country while APEX continues to manage each national economy and research program.</p><label class="mp-field"><span>YOUR NAME</span><input id="mp-player-name" maxlength="40" value="${escapeHtml(this.displayName)}" autocomplete="nickname"></label><div class="mp-choice"><button class="primary-button" data-mp-action="show-host"><b>HOST GAME</b><small>Create invites for your friends</small></button><button class="secondary-button" data-mp-action="show-guest"><b>JOIN FRIEND</b><small>Paste a host invite</small></button></div><small class="mp-caveat">Direct Connect needs no account or game server. The host tab must stay open; restrictive school, office or mobile networks can block peer-to-peer traffic.</small></div>`;
  }

  private renderHost(): string {
    if (!this.host) return `<div class="mp-setup"><div class="panel-kicker">HOST A DIRECT GAME</div><h2>Create your room</h2><label class="mp-field"><span>YOUR NAME</span><input id="mp-player-name" maxlength="40" value="${escapeHtml(this.displayName)}" autocomplete="nickname"></label><button class="primary-button" data-mp-action="create-room">CREATE ROOM</button></div>`;
    const local = this.localPlayer();
    const block = this.hostModel?.startBlockReason();
    return `<div class="mp-room"><div class="mp-room__head"><div><div class="panel-kicker">HOST ROOM · ${escapeHtml(this.host.roomId.slice(-8).toUpperCase())}</div><h2>Commanders</h2></div><span>${this.lobby?.players.filter((player) => player.connected).length ?? 1}/8 CONNECTED</span></div>${this.renderPlayers()}<div class="mp-connect-grid"><section><h3>1 · Invite one friend</h3><p>Create a private code and send it to that friend.</p>${this.inviteCode ? `<textarea readonly aria-label="Host invite code">${escapeHtml(this.inviteCode)}</textarea><button class="secondary-button" data-mp-action="copy-invite">COPY INVITE</button>` : `<button class="secondary-button" data-mp-action="create-invite">CREATE FRIEND INVITE</button>`}</section><section><h3>2 · Accept their answer</h3><p>Paste the answer they send back.</p><textarea id="mp-answer-input" placeholder="Paste friend answer…">${escapeHtml(this.pastedAnswer)}</textarea><button class="secondary-button" data-mp-action="accept-answer">CONNECT FRIEND</button></section></div><div class="mp-room__actions"><button class="secondary-button ${local?.ready ? 'is-ready' : ''}" data-mp-action="toggle-ready" ${local?.countryId ? '' : 'disabled'}>${local?.ready ? '✓ READY' : 'MARK READY'}</button><button class="primary-button" data-mp-action="start" ${block ? 'disabled' : ''}>START CAMPAIGN</button></div>${block ? `<small class="mp-start-note">${escapeHtml(block)}</small>` : ''}</div>`;
  }

  private renderGuest(): string {
    if (!this.guest) return `<div class="mp-setup"><div class="panel-kicker">JOIN A DIRECT GAME</div><h2>Paste your friend’s invite</h2><label class="mp-field"><span>YOUR NAME</span><input id="mp-player-name" maxlength="40" value="${escapeHtml(this.displayName)}" autocomplete="nickname"></label><label class="mp-field"><span>HOST INVITE</span><textarea id="mp-invite-input" placeholder="Paste the long Frontier Command invite code…">${escapeHtml(this.pastedInvite)}</textarea></label><button class="primary-button" data-mp-action="join-room">CREATE ANSWER</button></div>`;
    const local = this.localPlayer();
    return `<div class="mp-room"><div class="mp-room__head"><div><div class="panel-kicker">GUEST · ${escapeHtml(this.guest.hostName.toUpperCase())}</div><h2>Multiplayer lobby</h2></div><span>${escapeHtml(connectionLabel(this.guest.state).toUpperCase())}</span></div>${this.answerCode ? `<div class="mp-answer-callout"><h3>Send this answer back to the host</h3><p>The connection completes only after the host pastes it.</p><textarea readonly aria-label="Friend answer code">${escapeHtml(this.answerCode)}</textarea><button class="secondary-button" data-mp-action="copy-answer">COPY ANSWER</button></div>` : ''}${this.renderPlayers()}${this.lobby ? `<div class="mp-room__actions"><button class="secondary-button ${local?.ready ? 'is-ready' : ''}" data-mp-action="toggle-ready" ${local?.countryId ? '' : 'disabled'}>${local?.ready ? '✓ READY' : 'MARK READY'}</button><span>Only the host starts the shared campaign.</span></div>` : ''}</div>`;
  }

  private render(): void {
    const content = this.mode === 'menu' ? this.renderMenu() : this.mode === 'host' ? this.renderHost() : this.renderGuest();
    this.root.innerHTML = `<section class="multiplayer-lobby-card"><button class="modal-close" data-mp-action="${this.mode === 'menu' ? 'close' : 'back'}" aria-label="${this.mode === 'menu' ? 'Close multiplayer' : 'Back'}">×</button>${content}<footer class="mp-status ${this.error ? 'has-error' : ''}"><i></i><span>${escapeHtml(this.error || this.status)}</span>${this.busy ? '<b>WORKING…</b>' : ''}</footer></section>`;
  }
}
