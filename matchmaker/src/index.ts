import { DurableObject } from 'cloudflare:workers';
import { formMatchmakingGroups } from '../../src/multiplayer/matchmakingGroups';
import {
  MAX_PUBLIC_MATCH_PLAYERS,
  parseMatchmakingClientMessage,
  type MatchmakingParticipant,
  type MatchmakingServerMessage,
} from '../../src/multiplayer/matchmakingProtocol';

interface Env {
  readonly MATCHMAKER: DurableObjectNamespace<MatchmakingQueue>;
  readonly ALLOWED_ORIGINS?: string;
}

interface SocketAttachment {
  readonly status: 'idle' | 'queued' | 'matched' | 'complete';
  readonly clientId?: string;
  readonly displayName?: string;
  readonly rulesVersion?: string;
  readonly queuedAt?: number;
  readonly matchId?: string;
  readonly hostClientId?: string;
  readonly participants?: readonly MatchmakingParticipant[];
}

interface QueuedSocket {
  readonly socket: WebSocket;
  readonly clientId: string;
  readonly displayName: string;
  readonly rulesVersion: string;
  readonly queuedAt: number;
}

const idleAttachment = (): SocketAttachment => ({ status: 'idle' });

function attachment(socket: WebSocket): SocketAttachment {
  return (socket.deserializeAttachment() as SocketAttachment | null) ?? idleAttachment();
}

function send(socket: WebSocket, message: MatchmakingServerMessage): void {
  try {
    socket.send(JSON.stringify(message));
  } catch {
    // The close handler owns cleanup; one failed delivery cannot corrupt queue state.
  }
}

function error(socket: WebSocket, code: string, message: string): void {
  send(socket, { type: 'error', code, message });
}

function matchId(): string {
  return `match_${crypto.randomUUID().replaceAll('-', '')}`;
}

function allowedOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  const configured = (env.ALLOWED_ORIGINS
    ?? 'https://dekevinmt.github.io,http://localhost:4173,http://127.0.0.1:4173')
    .split(',').map((entry) => entry.trim()).filter(Boolean);
  return configured.includes(origin);
}

export class MatchmakingQueue extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket upgrade.', { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(idleAttachment());
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): void {
    if (typeof raw !== 'string') return error(socket, 'invalid-message', 'Matchmaking accepts text messages only.');
    let decoded: unknown;
    try {
      decoded = JSON.parse(raw);
    } catch {
      return error(socket, 'invalid-json', 'Matchmaking received invalid JSON.');
    }
    const message = parseMatchmakingClientMessage(decoded);
    if (!message) return error(socket, 'invalid-message', 'Matchmaking rejected an invalid message.');

    if (message.type === 'ping') {
      send(socket, { type: 'pong', sentAt: message.sentAt });
      return;
    }
    if (message.type === 'queue-join') {
      if (this.sockets().some((entry) => entry !== socket && attachment(entry).clientId === message.clientId)) {
        error(socket, 'duplicate-player', 'This browser is already waiting for a match.');
        return;
      }
      socket.serializeAttachment({
        status: 'queued',
        clientId: message.clientId,
        displayName: message.displayName,
        rulesVersion: message.rulesVersion,
        queuedAt: Date.now(),
      } satisfies SocketAttachment);
      this.joinOpenMatch(socket);
      this.formMatches();
      this.publishQueueStatus();
      return;
    }
    if (message.type === 'queue-leave') {
      this.leave(socket, 'A matched player left the lobby.');
      return;
    }
    const sender = attachment(socket);
    if (!sender.clientId || !sender.matchId || sender.matchId !== message.matchId
      || (sender.status !== 'matched' && sender.status !== 'complete')) {
      error(socket, 'invalid-match', 'That matchmaking session is no longer active.');
      return;
    }
    if (message.type === 'match-complete') {
      if (sender.clientId !== sender.hostClientId) {
        error(socket, 'host-only', 'Only the host can close an open lobby.');
        return;
      }
      for (const peer of this.sockets()) {
        const peerState = attachment(peer);
        if (peerState.matchId !== sender.matchId) continue;
        peer.serializeAttachment({ ...peerState, status: 'complete' } satisfies SocketAttachment);
      }
      return;
    }
    const target = this.sockets().find((entry) => {
      const targetState = attachment(entry);
      return targetState.clientId === message.toClientId && targetState.matchId === message.matchId;
    });
    if (!target || !sender.participants?.some((entry) => entry.clientId === message.toClientId)) {
      error(socket, 'missing-player', 'The matched player is no longer connected.');
      return;
    }
    send(target, {
      type: 'signal',
      matchId: message.matchId,
      fromClientId: sender.clientId,
      kind: message.kind,
      payload: message.payload,
    });
  }

  webSocketClose(socket: WebSocket): void {
    this.leave(socket, 'A matched player disconnected before the lobby was ready.');
  }

  webSocketError(socket: WebSocket): void {
    this.leave(socket, 'A matched player lost the matchmaking connection.');
  }

  private sockets(): WebSocket[] {
    return this.ctx.getWebSockets();
  }

  private queued(): QueuedSocket[] {
    return this.sockets().flatMap((socket) => {
      const state = attachment(socket);
      return state.status === 'queued'
        && state.clientId && state.displayName && state.rulesVersion
        && state.queuedAt
        ? [{
          socket,
          clientId: state.clientId,
          displayName: state.displayName,
          rulesVersion: state.rulesVersion,
          queuedAt: state.queuedAt,
        }]
        : [];
    });
  }

  private formMatches(): void {
    for (const group of formMatchmakingGroups(this.queued())) {
      const id = matchId();
      const participants = group.map(({ clientId, displayName }) => ({ clientId, displayName }));
      const hostClientId = participants[0]!.clientId;
      for (const entry of group) {
        entry.socket.serializeAttachment({
          status: 'matched',
          clientId: entry.clientId,
          displayName: entry.displayName,
          rulesVersion: entry.rulesVersion,
          queuedAt: entry.queuedAt,
          matchId: id,
          hostClientId,
          participants,
        } satisfies SocketAttachment);
        send(entry.socket, { type: 'match-found', matchId: id, hostClientId, participants });
      }
    }
  }

  private joinOpenMatch(socket: WebSocket): void {
    const joining = attachment(socket);
    if (joining.status !== 'queued' || !joining.clientId || !joining.displayName
      || !joining.rulesVersion || !joining.queuedAt) return;
    const hostSocket = this.sockets().filter((candidate) => candidate !== socket).find((candidate) => {
      const candidateState = attachment(candidate);
      return candidateState.status === 'matched'
        && candidateState.clientId === candidateState.hostClientId
        && candidateState.rulesVersion === joining.rulesVersion
        && (candidateState.participants?.length ?? 0) < MAX_PUBLIC_MATCH_PLAYERS;
    });
    if (!hostSocket) return;
    const host = attachment(hostSocket);
    if (!host.matchId || !host.hostClientId || !host.participants) return;
    const participants = [
      ...host.participants,
      { clientId: joining.clientId, displayName: joining.displayName },
    ];
    socket.serializeAttachment({
      ...joining,
      status: 'matched',
      matchId: host.matchId,
      hostClientId: host.hostClientId,
      participants,
    } satisfies SocketAttachment);
    for (const peer of this.sockets()) {
      const peerState = attachment(peer);
      if (peer !== socket && peerState.matchId !== host.matchId) continue;
      const nextState = attachment(peer);
      peer.serializeAttachment({ ...nextState, participants } satisfies SocketAttachment);
      send(peer, {
        type: 'match-found',
        matchId: host.matchId,
        hostClientId: host.hostClientId,
        participants,
      });
    }
  }

  private publishQueueStatus(): void {
    const queued = this.queued();
    const cohorts = new Map<string, QueuedSocket[]>();
    for (const entry of queued) {
      const key = entry.rulesVersion;
      const cohort = cohorts.get(key) ?? [];
      cohort.push(entry);
      cohorts.set(key, cohort);
    }
    for (const cohort of cohorts.values()) {
      cohort.sort((left, right) => left.queuedAt - right.queuedAt || left.clientId.localeCompare(right.clientId));
      cohort.forEach((entry, index) => send(entry.socket, {
        type: 'queue-status',
        position: index + 1,
        queuedPlayers: cohort.length,
      }));
    }
  }

  private leave(socket: WebSocket, reason: string): void {
    const leaving = attachment(socket);
    socket.serializeAttachment(idleAttachment());
    if (leaving.matchId && leaving.status === 'matched'
      && leaving.clientId === leaving.hostClientId) {
      for (const peer of this.sockets()) {
        if (peer === socket) continue;
        const state = attachment(peer);
        if (state.matchId !== leaving.matchId || state.status === 'complete') continue;
        peer.serializeAttachment({
          status: 'queued',
          clientId: state.clientId,
          displayName: state.displayName,
          rulesVersion: state.rulesVersion,
          queuedAt: Date.now(),
        } satisfies SocketAttachment);
        send(peer, { type: 'match-cancelled', matchId: leaving.matchId, reason });
      }
    } else if (leaving.matchId && leaving.status === 'matched') {
      const participants = (leaving.participants ?? [])
        .filter((participant) => participant.clientId !== leaving.clientId);
      for (const peer of this.sockets()) {
        if (peer === socket) continue;
        const state = attachment(peer);
        if (state.matchId !== leaving.matchId || state.status !== 'matched') continue;
        peer.serializeAttachment({ ...state, participants } satisfies SocketAttachment);
        send(peer, {
          type: 'match-found',
          matchId: leaving.matchId,
          hostClientId: leaving.hostClientId!,
          participants,
        });
      }
    }
    this.formMatches();
    this.publishQueueStatus();
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return Response.json({ service: 'frontier-command-matchmaking', status: 'ok' }, {
        headers: { 'cache-control': 'no-store' },
      });
    }
    if (url.pathname !== '/matchmaking') return new Response('Not found.', { status: 404 });
    if (!allowedOrigin(request, env)) return new Response('Origin not allowed.', { status: 403 });
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket upgrade.', { status: 426 });
    }
    return env.MATCHMAKER.getByName('global-v1').fetch(request);
  },
} satisfies ExportedHandler<Env>;
