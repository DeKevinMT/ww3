import {
  DirectConnectGuest,
  DirectConnectHost,
  type DirectConnectStateEvent,
  type DirectReconnectCredential,
} from './directConnect';
import {
  MatchmakingClient,
  matchmakingServiceUrl,
  type MatchmakingClientOptions,
} from './matchmakingClient';
import type { MatchmakingServerMessage } from './matchmakingProtocol';

export const RECONNECT_ROUTE_TIMEOUT_MS = 90_000;
export const RECONNECT_DISCONNECTED_SETTLE_MS = 3_000;
export const RECONNECT_HOST_RETRY_MS = 1_500;

type MatchmakerFactory = (options: MatchmakingClientOptions) => MatchmakingClient;

export interface MultiplayerReconnectStatus {
  readonly peerId: string;
  readonly phase: 'waiting' | 'connecting' | 'connected' | 'expired' | 'error';
  readonly message: string;
}

function compactHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** Non-secret rendezvous key; the Direct Connect rejoin token authenticates the seat. */
export function reconnectCompatibilityKeyV1(roomId: string, peerId: string): string {
  return `frontier-rejoin-v1-${compactHash(roomId)}-${compactHash(peerId)}`;
}

interface HostRoute {
  matchmaker: MatchmakingClient;
  matchId?: string;
  offered: boolean;
  timeout: ReturnType<typeof setTimeout>;
}

export interface HostReconnectCoordinatorOptions {
  readonly transport: DirectConnectHost;
  readonly seatPeerIds: ReadonlySet<string>;
  readonly matchmakingUrl?: string;
  readonly matchmakerFactory?: MatchmakerFactory;
  readonly onStatus?: (status: MultiplayerReconnectStatus) => void;
}

/** Keeps the authoritative host reachable while a reserved guest seat is offline. */
export class HostReconnectCoordinator {
  private readonly routes = new Map<string, HostRoute>();
  private readonly settleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly matchmakerFactory: MatchmakerFactory;
  private readonly url?: string;
  private readonly unsubscribe: () => void;
  private destroyed = false;

  constructor(private readonly options: HostReconnectCoordinatorOptions) {
    this.matchmakerFactory = options.matchmakerFactory ?? ((configuration) => new MatchmakingClient(configuration));
    this.url = options.matchmakingUrl ?? matchmakingServiceUrl();
    this.unsubscribe = options.transport.subscribe({
      onStateChange: (event) => this.handleTransportState(event),
    });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribe();
    for (const timer of this.settleTimers.values()) clearTimeout(timer);
    this.settleTimers.clear();
    for (const peerId of [...this.routes.keys()]) this.closeRoute(peerId);
  }

  private handleTransportState(event: DirectConnectStateEvent): void {
    const peerId = event.peer.peerId;
    if (!peerId || !this.options.seatPeerIds.has(peerId) || this.destroyed) return;
    if (event.peer.state === 'connected') {
      const timer = this.settleTimers.get(peerId);
      if (timer) clearTimeout(timer);
      this.settleTimers.delete(peerId);
      this.options.onStatus?.({ peerId, phase: 'connected', message: 'Timeline seat restored.' });
      this.closeRoute(peerId, true);
      return;
    }
    if (event.peer.state === 'disconnected') {
      if (this.settleTimers.has(peerId)) return;
      const timer = setTimeout(() => {
        this.settleTimers.delete(peerId);
        if (this.destroyed) return;
        this.options.transport.prepareReconnect(peerId);
        this.openRoute(peerId);
      }, RECONNECT_DISCONNECTED_SETTLE_MS);
      this.settleTimers.set(peerId, timer);
      return;
    }
    if (event.peer.state === 'failed' || event.peer.state === 'closed') this.openRoute(peerId);
  }

  private openRoute(peerId: string): void {
    if (this.destroyed || this.routes.has(peerId)) return;
    if (!this.options.transport.reconnectSeats.canRejoin(peerId)) return;
    if (!this.url) {
      this.options.onStatus?.({
        peerId,
        phase: 'error',
        message: 'Reconnect service is unavailable; the seat remains reserved for now.',
      });
      return;
    }
    let matchmaker: MatchmakingClient;
    try {
      matchmaker = this.matchmakerFactory({
        url: this.url,
        rulesVersion: reconnectCompatibilityKeyV1(this.options.transport.roomId, peerId),
        displayName: this.options.transport.displayName,
        clientId: `rejoin_host_${compactHash(this.options.transport.hostPeerId)}_${compactHash(peerId)}`,
        onOpen: () => this.options.onStatus?.({
          peerId, phase: 'waiting', message: 'Seat reserved. Waiting for the commander to reconnect.',
        }),
        onMessage: (message) => { void this.handleMatchmakerMessage(peerId, message); },
        onError: (error) => this.failRoute(peerId, error.message),
        onClose: () => {
          if (this.routes.has(peerId)) this.failRoute(peerId, 'Reconnect signaling closed.');
        },
      });
    } catch (error) {
      this.failRoute(peerId, error instanceof Error ? error.message : 'Reconnect signaling failed.');
      return;
    }
    const timeout = setTimeout(() => {
      this.options.transport.releaseExpiredReconnectSeats();
      const expired = !this.options.transport.reconnectSeats.canRejoin(peerId);
      this.options.onStatus?.({
        peerId,
        phase: expired ? 'expired' : 'error',
        message: expired ? 'The reconnect grace period ended.' : 'Reconnect timed out; retry remains available.',
      });
      this.closeRoute(peerId);
      if (!expired) this.scheduleRetry(peerId);
    }, this.options.transport.reconnectSeats.graceMs + 50);
    this.routes.set(peerId, { matchmaker, offered: false, timeout });
  }

  private async handleMatchmakerMessage(peerId: string, message: MatchmakingServerMessage): Promise<void> {
    const route = this.routes.get(peerId);
    if (!route) return;
    if (message.type === 'error' || message.type === 'match-cancelled') {
      this.failRoute(peerId, message.type === 'error' ? message.message : message.reason);
      return;
    }
    if (message.type === 'match-found') {
      route.matchId = message.matchId;
      if (route.offered) return;
      const guest = message.participants.find((participant) => participant.clientId === peerId);
      if (!guest) return;
      try {
        const invite = await this.options.transport.createReconnectInvite(peerId);
        route.offered = true;
        route.matchmaker.sendSignal(message.matchId, peerId, 'offer', invite.inviteCode);
        this.options.onStatus?.({ peerId, phase: 'connecting', message: 'Reconnecting the reserved campaign seat…' });
      } catch (error) {
        this.failRoute(peerId, error instanceof Error ? error.message : 'Reconnect invite failed.');
      }
      return;
    }
    if (message.type === 'signal' && message.kind === 'answer' && route.matchId === message.matchId) {
      try {
        await this.options.transport.acceptAnswer(message.payload);
      } catch (error) {
        this.failRoute(peerId, error instanceof Error ? error.message : 'Reconnect answer failed.');
      }
    }
  }

  private failRoute(peerId: string, message: string): void {
    this.options.onStatus?.({ peerId, phase: 'error', message });
    this.closeRoute(peerId);
    if (this.options.transport.reconnectSeats.canRejoin(peerId)) this.scheduleRetry(peerId);
  }

  private scheduleRetry(peerId: string): void {
    if (this.destroyed || this.settleTimers.has(peerId)) return;
    const timer = setTimeout(() => {
      this.settleTimers.delete(peerId);
      this.openRoute(peerId);
    }, RECONNECT_HOST_RETRY_MS);
    this.settleTimers.set(peerId, timer);
  }

  private closeRoute(peerId: string, complete = false): void {
    const route = this.routes.get(peerId);
    if (!route) return;
    this.routes.delete(peerId);
    clearTimeout(route.timeout);
    if (complete && route.matchId) route.matchmaker.complete(route.matchId);
    route.matchmaker.close();
  }
}

export interface GuestReconnectCoordinatorOptions {
  readonly transport: GuestReconnectTransportIdentity;
  readonly attachTransport: (transport: DirectConnectGuest) => void;
  readonly matchmakingUrl?: string;
  readonly matchmakerFactory?: MatchmakerFactory;
  readonly onStatus?: (status: MultiplayerReconnectStatus) => void;
}

/** Minimal secret-bearing identity needed to rebuild a guest route after a reload. */
export interface GuestReconnectTransportIdentity {
  readonly roomId: string;
  readonly rulesVersion: string;
  readonly displayName: string;
  readonly reconnectCredential?: DirectReconnectCredential;
  close(): void;
}

/** One-action guest recovery; nation, mission and stable peer identity are immutable. */
export class GuestReconnectCoordinator {
  private transport: GuestReconnectTransportIdentity;
  private readonly matchmakerFactory: MatchmakerFactory;
  private readonly url?: string;
  private matchmaker?: MatchmakingClient;
  private matchId?: string;
  private timeout?: ReturnType<typeof setTimeout>;
  private reconnecting = false;
  private destroyed = false;

  constructor(private readonly options: GuestReconnectCoordinatorOptions) {
    this.transport = options.transport;
    this.matchmakerFactory = options.matchmakerFactory ?? ((configuration) => new MatchmakingClient(configuration));
    this.url = options.matchmakingUrl ?? matchmakingServiceUrl();
  }

  get canReconnect(): boolean {
    return !this.destroyed && !this.reconnecting && Boolean(this.transport.reconnectCredential);
  }

  reconnect(): void {
    if (!this.canReconnect) return;
    const credential = this.transport.reconnectCredential;
    if (!credential) return;
    if (!this.url) {
      this.options.onStatus?.({
        peerId: credential.peerId,
        phase: 'error',
        message: 'Reconnect service is unavailable. Check your connection and retry.',
      });
      return;
    }
    this.reconnecting = true;
    this.transport.close();
    this.options.onStatus?.({
      peerId: credential.peerId,
      phase: 'connecting',
      message: 'Finding your reserved timeline seat…',
    });
    try {
      this.matchmaker = this.matchmakerFactory({
        url: this.url,
        rulesVersion: reconnectCompatibilityKeyV1(this.transport.roomId, credential.peerId),
        displayName: this.transport.displayName,
        clientId: credential.peerId,
        onMessage: (message) => { void this.handleMatchmakerMessage(message, credential); },
        onError: (error) => this.fail(error.message, credential.peerId),
        onClose: () => {
          if (this.reconnecting) this.fail('Reconnect signaling closed.', credential.peerId);
        },
      });
      this.timeout = setTimeout(() => this.fail('Reconnect timed out. Retry when your connection is stable.', credential.peerId), RECONNECT_ROUTE_TIMEOUT_MS);
    } catch (error) {
      this.fail(error instanceof Error ? error.message : 'Reconnect could not start.', credential.peerId);
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.cleanup();
  }

  private async handleMatchmakerMessage(
    message: MatchmakingServerMessage,
    credential: DirectReconnectCredential,
  ): Promise<void> {
    if (!this.matchmaker || !this.reconnecting) return;
    if (message.type === 'error' || message.type === 'match-cancelled') {
      this.fail(message.type === 'error' ? message.message : message.reason, credential.peerId);
      return;
    }
    if (message.type === 'match-found') {
      this.matchId = message.matchId;
      return;
    }
    if (message.type !== 'signal' || message.kind !== 'offer') return;
    this.matchId = message.matchId;
    try {
      const joined = await DirectConnectGuest.acceptInvite(message.payload, {
        rulesVersion: this.transport.rulesVersion,
        displayName: this.transport.displayName,
        resume: credential,
      });
      // Attach before the answer reaches the host so its immediate authoritative
      // snapshot cannot race past the game session listener.
      this.options.attachTransport(joined.connection);
      joined.connection.subscribe({
        onStateChange: (event) => {
          if (event.peer.state === 'connected') {
            this.transport = joined.connection;
            this.options.onStatus?.({
              peerId: credential.peerId,
              phase: 'connected',
              message: 'Timeline restored and synchronized.',
            });
            if (this.matchmaker && this.matchId) this.matchmaker.complete(this.matchId);
            this.cleanup();
          } else if (event.peer.state === 'failed' || event.peer.state === 'closed') {
            this.fail(event.error?.message ?? 'The restored route closed.', credential.peerId);
          }
        },
      });
      this.matchmaker.sendSignal(message.matchId, message.fromClientId, 'answer', joined.answerCode);
    } catch (error) {
      this.fail(error instanceof Error ? error.message : 'The reserved seat could not be reclaimed.', credential.peerId);
    }
  }

  private fail(message: string, peerId: string): void {
    this.options.onStatus?.({ peerId, phase: 'error', message });
    this.cleanup();
  }

  private cleanup(): void {
    this.reconnecting = false;
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = undefined;
    this.matchmaker?.close();
    this.matchmaker = undefined;
    this.matchId = undefined;
  }
}
