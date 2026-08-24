import {
  MATCHMAKING_PROTOCOL_VERSION,
  parseMatchmakingServerMessage,
  type MatchmakingClientMessage,
  type MatchmakingServerMessage,
} from './matchmakingProtocol';

export interface MatchmakingClientHandlers {
  onOpen?: () => void;
  onMessage?: (message: MatchmakingServerMessage) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
}

export interface MatchmakingClientOptions extends MatchmakingClientHandlers {
  readonly url: string;
  readonly rulesVersion: string;
  readonly displayName: string;
  readonly clientId?: string;
  readonly webSocketFactory?: (url: string) => WebSocket;
}

function randomId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `player_${[...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

export function matchmakingServiceUrl(): string | undefined {
  const configured = (import.meta as ImportMeta & { env?: Record<string, string | undefined> })
    .env?.VITE_MATCHMAKING_URL?.trim();
  if (!configured) return undefined;
  try {
    const url = new URL(configured, window.location.href);
    if (url.protocol !== 'wss:' && !(url.protocol === 'ws:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

export class MatchmakingClient {
  readonly clientId: string;
  private readonly socket: WebSocket;
  private opened = false;
  private closed = false;
  private heartbeat?: number;

  constructor(private readonly options: MatchmakingClientOptions) {
    this.clientId = options.clientId ?? randomId();
    this.socket = (options.webSocketFactory ?? ((url) => new WebSocket(url)))(options.url);
    this.socket.addEventListener('open', this.onOpen);
    this.socket.addEventListener('message', this.onMessage);
    this.socket.addEventListener('error', this.onError);
    this.socket.addEventListener('close', this.onClose);
  }

  sendSignal(matchId: string, toClientId: string, kind: 'offer' | 'answer', payload: string): void {
    this.send({ type: 'signal', matchId, toClientId, kind, payload });
  }

  complete(matchId: string): void {
    if (this.closed) return;
    this.send({ type: 'match-complete', matchId });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.heartbeat !== undefined) window.clearInterval(this.heartbeat);
    if (this.opened && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: 'queue-leave' } satisfies MatchmakingClientMessage));
    }
    this.socket.close(1000, 'Player left matchmaking');
  }

  private readonly onOpen = (): void => {
    if (this.closed) return;
    this.opened = true;
    this.send({
      type: 'queue-join',
      protocolVersion: MATCHMAKING_PROTOCOL_VERSION,
      rulesVersion: this.options.rulesVersion,
      clientId: this.clientId,
      displayName: this.options.displayName,
    });
    this.heartbeat = window.setInterval(() => this.send({ type: 'ping', sentAt: Date.now() }), 25_000);
    this.options.onOpen?.();
  };

  private readonly onMessage = (event: MessageEvent): void => {
    try {
      if (typeof event.data !== 'string') throw new Error('Matchmaking sent a non-text message.');
      const parsed = parseMatchmakingServerMessage(JSON.parse(event.data));
      if (!parsed) throw new Error('Matchmaking sent an invalid message.');
      this.options.onMessage?.(parsed);
    } catch (error) {
      this.options.onError?.(error instanceof Error ? error : new Error('Matchmaking message failed.'));
    }
  };

  private readonly onError = (): void => {
    if (!this.closed) this.options.onError?.(new Error('The public matchmaking service could not be reached.'));
  };

  private readonly onClose = (): void => {
    if (this.heartbeat !== undefined) window.clearInterval(this.heartbeat);
    this.heartbeat = undefined;
    if (!this.closed) this.options.onClose?.();
  };

  private send(message: MatchmakingClientMessage): void {
    if (this.closed || this.socket.readyState !== WebSocket.OPEN) {
      if (message.type !== 'queue-join') throw new Error('Matchmaking is not connected.');
      return;
    }
    this.socket.send(JSON.stringify(message));
  }
}
