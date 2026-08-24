export const MATCHMAKING_PROTOCOL_VERSION = 'frontier-command-matchmaking-v2';
export const MIN_PUBLIC_MATCH_PLAYERS = 2;
/** Technical peer-session ceiling; players never choose a requested lobby size. */
export const MAX_PUBLIC_MATCH_PLAYERS = 8;
export const MAX_MATCHMAKING_NAME_LENGTH = 40;
export const MAX_MATCHMAKING_SIGNAL_LENGTH = 200_000;

export interface MatchmakingParticipant {
  readonly clientId: string;
  readonly displayName: string;
}

export type MatchmakingClientMessage =
  | {
    readonly type: 'queue-join';
    readonly protocolVersion: typeof MATCHMAKING_PROTOCOL_VERSION;
    readonly rulesVersion: string;
    readonly clientId: string;
    readonly displayName: string;
  }
  | { readonly type: 'queue-leave' }
  | {
    readonly type: 'signal';
    readonly matchId: string;
    readonly toClientId: string;
    readonly kind: 'offer' | 'answer';
    readonly payload: string;
  }
  | { readonly type: 'match-complete'; readonly matchId: string }
  | { readonly type: 'ping'; readonly sentAt: number };

export type MatchmakingServerMessage =
  | {
    readonly type: 'queue-status';
    readonly position: number;
    readonly queuedPlayers: number;
  }
  | {
    readonly type: 'match-found';
    readonly matchId: string;
    readonly hostClientId: string;
    readonly participants: readonly MatchmakingParticipant[];
  }
  | {
    readonly type: 'signal';
    readonly matchId: string;
    readonly fromClientId: string;
    readonly kind: 'offer' | 'answer';
    readonly payload: string;
  }
  | { readonly type: 'match-cancelled'; readonly matchId: string; readonly reason: string }
  | { readonly type: 'error'; readonly code: string; readonly message: string }
  | { readonly type: 'pong'; readonly sentAt: number };

const isObject = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isSafeId = (value: unknown): value is string => (
  typeof value === 'string' && value.length >= 3 && value.length <= 120 && /^[a-zA-Z0-9_-]+$/.test(value)
);

export function parseMatchmakingClientMessage(value: unknown): MatchmakingClientMessage | undefined {
  if (!isObject(value) || typeof value.type !== 'string') return undefined;
  if (value.type === 'queue-leave') return { type: 'queue-leave' };
  if (value.type === 'match-complete' && isSafeId(value.matchId)) {
    return { type: 'match-complete', matchId: value.matchId };
  }
  if (value.type === 'ping' && typeof value.sentAt === 'number' && Number.isFinite(value.sentAt)) {
    return { type: 'ping', sentAt: value.sentAt };
  }
  if (value.type === 'queue-join'
    && value.protocolVersion === MATCHMAKING_PROTOCOL_VERSION
    && typeof value.rulesVersion === 'string' && value.rulesVersion.length > 0 && value.rulesVersion.length <= 120
    && isSafeId(value.clientId)
    && typeof value.displayName === 'string'
    && value.displayName.trim().length > 0
    && value.displayName.trim().length <= MAX_MATCHMAKING_NAME_LENGTH) {
    return {
      type: 'queue-join',
      protocolVersion: MATCHMAKING_PROTOCOL_VERSION,
      rulesVersion: value.rulesVersion,
      clientId: value.clientId,
      displayName: value.displayName.trim(),
    };
  }
  if (value.type === 'signal'
    && isSafeId(value.matchId)
    && isSafeId(value.toClientId)
    && (value.kind === 'offer' || value.kind === 'answer')
    && typeof value.payload === 'string'
    && value.payload.length > 0
    && value.payload.length <= MAX_MATCHMAKING_SIGNAL_LENGTH) {
    return {
      type: 'signal',
      matchId: value.matchId,
      toClientId: value.toClientId,
      kind: value.kind,
      payload: value.payload,
    };
  }
  return undefined;
}

export function parseMatchmakingServerMessage(value: unknown): MatchmakingServerMessage | undefined {
  if (!isObject(value) || typeof value.type !== 'string') return undefined;
  if (value.type === 'queue-status'
    && Number.isInteger(value.position) && Number(value.position) > 0
    && Number.isInteger(value.queuedPlayers) && Number(value.queuedPlayers) > 0) {
    return {
      type: 'queue-status',
      position: Number(value.position),
      queuedPlayers: Number(value.queuedPlayers),
    };
  }
  if (value.type === 'match-found'
    && isSafeId(value.matchId)
    && isSafeId(value.hostClientId)
    && Array.isArray(value.participants)
    && value.participants.length >= MIN_PUBLIC_MATCH_PLAYERS
    && value.participants.length <= MAX_PUBLIC_MATCH_PLAYERS) {
    const participants = value.participants.flatMap((entry) => (
      isObject(entry) && isSafeId(entry.clientId)
        && typeof entry.displayName === 'string'
        && entry.displayName.trim().length > 0
        && entry.displayName.trim().length <= MAX_MATCHMAKING_NAME_LENGTH
        ? [{ clientId: entry.clientId, displayName: entry.displayName.trim() }]
        : []
    ));
    if (participants.length !== value.participants.length
      || !participants.some((entry) => entry.clientId === value.hostClientId)) return undefined;
    return { type: 'match-found', matchId: value.matchId, hostClientId: value.hostClientId, participants };
  }
  if (value.type === 'signal'
    && isSafeId(value.matchId)
    && isSafeId(value.fromClientId)
    && (value.kind === 'offer' || value.kind === 'answer')
    && typeof value.payload === 'string'
    && value.payload.length > 0
    && value.payload.length <= MAX_MATCHMAKING_SIGNAL_LENGTH) {
    return {
      type: 'signal', matchId: value.matchId, fromClientId: value.fromClientId,
      kind: value.kind, payload: value.payload,
    };
  }
  if (value.type === 'match-cancelled'
    && isSafeId(value.matchId)
    && typeof value.reason === 'string' && value.reason.length > 0 && value.reason.length <= 240) {
    return { type: 'match-cancelled', matchId: value.matchId, reason: value.reason };
  }
  if (value.type === 'error'
    && typeof value.code === 'string' && value.code.length > 0 && value.code.length <= 80
    && typeof value.message === 'string' && value.message.length > 0 && value.message.length <= 240) {
    return { type: 'error', code: value.code, message: value.message };
  }
  if (value.type === 'pong' && typeof value.sentAt === 'number' && Number.isFinite(value.sentAt)) {
    return { type: 'pong', sentAt: value.sentAt };
  }
  return undefined;
}
