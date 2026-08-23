import { WORLD_CONTENT_V2, type WorldContentV2 } from '../sim/v2/content';
import { createSaveV2, type SaveGameV2 } from '../sim/v2/persistence';
import { WorldEngineV2, type QueuedWorldActionV2 } from '../sim/v2/WorldEngineV2';
import type {
  CommandResultV2,
  PlayerId,
  WorldChangeV2,
  WorldCommandV2,
  WorldSpeedV2,
  WorldStateV2,
} from '../sim/v2/types';
import { authorizeMultiplayerCommandV2 } from './authorization';
import type {
  DirectConnectGuestHandlers,
  DirectConnectHostHandlers,
  DirectConnectState,
  DirectPeerInfo,
} from './directConnect';
import {
  MAX_MULTIPLAYER_PLAYERS,
  MIN_MULTIPLAYER_PLAYERS,
  type CommandMessage,
  type CommandResultMessage,
  type ResyncRequestMessage,
  type SequencedWorldCommand,
  type SessionMessage,
  type SnapshotMessage,
  type SpeedMessage,
  type TickMessage,
} from './protocol';

export const CANONICAL_HASH_INTERVAL_TICKS = 8;
export const RESYNC_REQUEST_COOLDOWN_TICKS = 4;
export const MAX_PENDING_CLIENT_COMMANDS = 256;
export const MAX_CACHED_COMMAND_RESULTS_PER_PEER = 256;
export const MAX_ACTIONS_PER_TICK = 512;

export type GameSessionRole = 'host' | 'guest';
export type GameSessionPhase =
  | 'lobby'
  | 'waiting-snapshot'
  | 'running'
  | 'resyncing'
  | 'disconnected'
  | 'error'
  | 'closed';

export interface GameSessionStatus {
  role: GameSessionRole;
  phase: GameSessionPhase;
  tick: number;
  speed: WorldSpeedV2;
  connectedPeers: number;
  seatCount: number;
  pendingCommands: number;
  lastHashTick: number | null;
  lastError?: string;
}

export interface GameSessionEngineV2 {
  readonly content: WorldContentV2;
  readonly state: WorldStateV2;
  readonly clockAuthority: boolean;
  readonly viewerPlayerId: PlayerId;
  subscribe(listener: (state: WorldStateV2, change: WorldChangeV2) => void): () => void;
  subscribeQueuedActions(listener: (action: QueuedWorldActionV2) => void): () => void;
  setClientCommandSink(sink?: (command: WorldCommandV2) => CommandResultV2): void;
  setClockAuthority(authoritative: boolean): void;
  configureHumanPlayers(playerIds: readonly string[], viewerPlayerId: string): CommandResultV2;
  setViewerPlayerId(playerId: string): CommandResultV2;
  enqueueAuthoritativeAction(action: QueuedWorldActionV2): CommandResultV2;
  submitCommand(command: WorldCommandV2): CommandResultV2;
  setAuthoritativeSpeed(speed: WorldSpeedV2): CommandResultV2;
  canonicalHash(): string;
  step(ticks?: number): void;
}

export interface HostSessionTransport {
  readonly hostPeerId: string;
  listPeers(): DirectPeerInfo[];
  subscribe(handlers: DirectConnectHostHandlers): () => void;
  send(peerId: string, message: SessionMessage): void;
  broadcast(message: SessionMessage): number;
  close(): void;
}

export interface GuestSessionTransport {
  readonly hostPeerId: string;
  readonly state: DirectConnectState;
  subscribe(handlers: DirectConnectGuestHandlers): () => void;
  send(message: SessionMessage): void;
  close(): void;
}

export class GameSessionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GameSessionError';
  }
}

export interface HostGameSessionOptions {
  engine: GameSessionEngineV2;
  transport: HostSessionTransport;
  seats: ReadonlyMap<string, PlayerId> | Readonly<Record<string, PlayerId>>;
  onStatus?: (status: GameSessionStatus) => void;
}

export interface HostGameSessionHandlers {
  onStatus?: (status: GameSessionStatus) => void;
}

export interface GuestCommandResultEvent {
  result: CommandResultMessage;
  command: WorldCommandV2;
}

export interface GuestSnapshotEvent {
  message: SnapshotMessage;
  engine: GameSessionEngineV2;
}

export interface GuestGameSessionHandlers {
  onStatus?: (status: GameSessionStatus) => void;
  onCommandResult?: (event: GuestCommandResultEvent) => void;
  onSnapshot?: (event: GuestSnapshotEvent) => void;
}

export interface GuestGameSessionOptions extends GuestGameSessionHandlers {
  transport: GuestSessionTransport;
  countryId: PlayerId;
  seatCount: number;
  /** Canonical human-country roster captured from the started lobby. */
  humanPlayerIds?: readonly PlayerId[];
  engine?: GameSessionEngineV2;
  content?: WorldContentV2;
  replicaFactory?: (save: SaveGameV2, content: WorldContentV2) => GameSessionEngineV2;
  requestIdFactory?: () => string;
}

interface SubmissionContext {
  senderPeerId: string;
  capturedAction?: QueuedWorldActionV2;
}

interface CachedCommandResult {
  fingerprint: string;
  result: CommandResultMessage;
}

interface PendingClientCommand {
  command: WorldCommandV2;
  clientSequence: number;
}

interface PendingResyncRequest {
  reason: string;
  expectedTick: number;
  expectedHash?: string;
  actualHash?: string;
}

function safeNotify(callback: (() => void) | undefined): void {
  if (!callback) return;
  try {
    callback();
  } catch (error) {
    console.error('Frontier Command multiplayer session callback failed.', error);
  }
}

function rejected(reason: string): CommandResultV2 {
  return { accepted: false, reason };
}

function cleanReason(reason: string | undefined, fallback: string): string {
  return (reason?.trim() || fallback).slice(0, 300);
}

function normalizeSeats(
  input: ReadonlyMap<string, PlayerId> | Readonly<Record<string, PlayerId>>,
): Map<string, PlayerId> {
  const seats = input instanceof Map
    ? new Map(input)
    : new Map(Object.entries(input) as Array<[string, PlayerId]>);
  if (seats.size < MIN_MULTIPLAYER_PLAYERS || seats.size > MAX_MULTIPLAYER_PLAYERS) {
    throw new GameSessionError(`A multiplayer campaign requires ${MIN_MULTIPLAYER_PLAYERS}-${MAX_MULTIPLAYER_PLAYERS} seats.`);
  }
  for (const peerId of seats.keys()) {
    if (peerId.trim().length === 0) throw new GameSessionError('Every multiplayer seat needs a peer ID.');
  }
  if (new Set(seats.values()).size !== seats.size) {
    throw new GameSessionError('Every multiplayer seat must control a different country.');
  }
  return seats;
}

function samePlayerRoster(left: readonly PlayerId[], right: readonly PlayerId[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort((a, b) => a.localeCompare(b));
  const sortedRight = [...right].sort((a, b) => a.localeCompare(b));
  return sortedLeft.every((id, index) => id === sortedRight[index]);
}

function randomRequestId(): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) throw new GameSessionError('Secure browser randomness is unavailable.');
  const bytes = new Uint8Array(12);
  cryptoApi.getRandomValues(bytes);
  let suffix = '';
  for (const byte of bytes) suffix += byte.toString(16).padStart(2, '0');
  return `request_${suffix}`;
}

function commandFingerprint(message: CommandMessage): string {
  return JSON.stringify({ clientSequence: message.clientSequence, command: message.command });
}

function defaultReplicaFactory(save: SaveGameV2, content: WorldContentV2): GameSessionEngineV2 {
  return WorldEngineV2.fromSave(save, content);
}

export class HostGameSession {
  readonly role = 'host' as const;
  readonly engine: GameSessionEngineV2;
  readonly transport: HostSessionTransport;
  readonly seats: ReadonlyMap<string, PlayerId>;
  readonly hostCountryId: PlayerId;

  private phase: GameSessionPhase = 'lobby';
  private lastError?: string;
  private lastHashTick: number | null = null;
  private readonly statusListeners = new Set<(status: GameSessionStatus) => void>();
  private readonly actionsByTargetTick = new Map<number, SequencedWorldCommand[]>();
  private readonly commandResultsByPeer = new Map<string, Map<string, CachedCommandResult>>();
  private readonly lastClientSequenceByPeer = new Map<string, number>();
  private readonly deferredSnapshots = new Map<string, SnapshotMessage['reason']>();
  private readonly lastSnapshotTickByPeer = new Map<string, number>();
  private readonly lastSnapshotAttemptTickByPeer = new Map<string, number>();
  private readonly peerSendErrors = new Map<string, string>();
  private activeSubmission?: SubmissionContext;
  private handlingTick = false;
  private unsubscribeEngine: () => void;
  private unsubscribeQueuedActions: () => void;
  private unsubscribeTransport: () => void;

  constructor(options: HostGameSessionOptions) {
    this.engine = options.engine;
    this.transport = options.transport;
    const seats = normalizeSeats(options.seats);
    const hostCountryId = seats.get(this.transport.hostPeerId);
    if (!hostCountryId) throw new GameSessionError('The room host must have a country seat.');
    for (const countryId of seats.values()) {
      if (!this.engine.state.players[countryId]) throw new GameSessionError(`Seat country ${countryId} is not active.`);
    }
    const roster = [...seats.values()].sort((a, b) => a.localeCompare(b));
    if (this.engine.state.tick === 0) {
      const configuration = this.engine.configureHumanPlayers(roster, hostCountryId);
      if (!configuration.accepted) {
        throw new GameSessionError(cleanReason(configuration.reason, 'The human seat roster is invalid.'));
      }
    } else if (!samePlayerRoster(this.engine.state.humanPlayerIds, roster)) {
      throw new GameSessionError('The seat map does not match the saved human-player roster.');
    }
    this.seats = seats;
    this.hostCountryId = hostCountryId;
    const viewerResult = this.engine.setViewerPlayerId(this.hostCountryId);
    if (!viewerResult.accepted) throw new GameSessionError(cleanReason(viewerResult.reason, 'The host viewer seat is invalid.'));
    this.engine.setClockAuthority(false);
    if (options.onStatus) this.statusListeners.add(options.onStatus);
    this.unsubscribeQueuedActions = this.engine.subscribeQueuedActions((action) => this.captureQueuedAction(action));
    this.unsubscribeEngine = this.engine.subscribe((_state, change) => this.handleEngineChange(change));
    this.unsubscribeTransport = this.transport.subscribe({
      onMessage: (event) => this.handleTransportMessage(event.peerId, event.message),
      onStateChange: () => this.emitStatus(),
    });
  }

  get status(): GameSessionStatus {
    const connectedPeers = this.transport.listPeers().filter((peer) => (
      peer.state === 'connected' && peer.peerId !== null && this.seats.has(peer.peerId)
    )).length;
    const pendingCommands = [...this.actionsByTargetTick.values()].reduce((sum, actions) => sum + actions.length, 0);
    const latestPeerError = [...this.peerSendErrors.values()].at(-1);
    const statusError = this.lastError ?? latestPeerError;
    return {
      role: this.role,
      phase: this.phase,
      tick: this.engine.state.tick,
      speed: this.engine.state.speed,
      connectedPeers,
      seatCount: this.seats.size,
      pendingCommands,
      lastHashTick: this.lastHashTick,
      ...(statusError ? { lastError: statusError } : {}),
    };
  }

  subscribe(handlers: HostGameSessionHandlers): () => void {
    if (handlers.onStatus) this.statusListeners.add(handlers.onStatus);
    if (handlers.onStatus) safeNotify(() => handlers.onStatus!(this.status));
    return () => {
      if (handlers.onStatus) this.statusListeners.delete(handlers.onStatus);
    };
  }

  start(): CommandResultV2 {
    if (this.phase === 'closed') return rejected('This multiplayer session is closed.');
    if (this.phase === 'running') return { accepted: true };
    const connectedPeerIds = new Set(this.transport.listPeers()
      .filter((peer) => peer.state === 'connected' && peer.peerId !== null)
      .map((peer) => peer.peerId!));
    const missingPeer = [...this.seats.keys()].find((peerId) => (
      peerId !== this.transport.hostPeerId && !connectedPeerIds.has(peerId)
    ));
    if (missingPeer) return rejected('Every seated friend must be connected before the campaign starts.');
    if (this.pendingActionCount() > 0) return rejected('Wait for queued setup actions to reach a tick boundary before starting.');

    let snapshot: SnapshotMessage;
    try {
      snapshot = this.createSnapshot('join');
    } catch (error) {
      return this.failResult('The initial multiplayer snapshot could not be created.', error);
    }

    this.phase = 'running';
    for (const peerId of this.remotePeerIds()) {
      this.lastSnapshotAttemptTickByPeer.set(peerId, this.engine.state.tick);
      if (this.sendToPeer(peerId, snapshot, 'The initial snapshot could not be sent')) {
        this.lastSnapshotTickByPeer.set(peerId, snapshot.tick);
      } else {
        this.deferredSnapshots.set(peerId, 'reconnect');
      }
    }
    const speed: SpeedMessage = {
      type: 'speed',
      speed: this.engine.state.speed,
      effectiveTick: this.engine.state.tick,
    };
    this.sendToRemoteSeats(speed, 'The initial speed could not be sent');
    this.engine.setClockAuthority(true);
    this.emitStatus();
    return { accepted: true };
  }

  submitHostCommand(command: WorldCommandV2): CommandResultV2 {
    if (this.phase !== 'running') return rejected('The multiplayer campaign is not running.');
    const authorization = authorizeMultiplayerCommandV2(this.engine.state, this.hostCountryId, command, true);
    if (!authorization.accepted) return authorization;
    if (command.type !== 'set-speed' && this.targetTickActions().length >= MAX_ACTIONS_PER_TICK) {
      return rejected('Too many commands are already queued for the next week.');
    }
    const context: SubmissionContext = { senderPeerId: this.transport.hostPeerId };
    this.activeSubmission = context;
    try {
      const result = this.engine.submitCommand(command);
      if (result.accepted && command.type !== 'set-speed' && !context.capturedAction) {
        return rejected('The host accepted the command without assigning an action sequence.');
      }
      return result;
    } finally {
      this.activeSubmission = undefined;
      this.emitStatus();
    }
  }

  requestSnapshot(peerId: string, reason: SnapshotMessage['reason'] = 'reconnect'): CommandResultV2 {
    if (!this.seats.has(peerId) || peerId === this.transport.hostPeerId) return rejected('That peer has no remote campaign seat.');
    if (this.phase !== 'running') return rejected('The multiplayer campaign is not running.');
    this.queueOrSendSnapshot(peerId, reason);
    return { accepted: true };
  }

  close(closeTransport = true): void {
    if (this.phase === 'closed') return;
    this.phase = 'closed';
    this.engine.setClockAuthority(false);
    this.unsubscribeEngine();
    this.unsubscribeQueuedActions();
    this.unsubscribeTransport();
    this.actionsByTargetTick.clear();
    this.commandResultsByPeer.clear();
    this.lastClientSequenceByPeer.clear();
    this.deferredSnapshots.clear();
    this.lastSnapshotTickByPeer.clear();
    this.lastSnapshotAttemptTickByPeer.clear();
    this.peerSendErrors.clear();
    this.emitStatus();
    this.statusListeners.clear();
    if (closeTransport) this.transport.close();
  }

  private remotePeerIds(): string[] {
    return [...this.seats.keys()]
      .filter((peerId) => peerId !== this.transport.hostPeerId)
      .sort((a, b) => a.localeCompare(b));
  }

  private sendToPeer(peerId: string, message: SessionMessage, failureMessage: string): boolean {
    try {
      this.transport.send(peerId, message);
      if (message.type === 'snapshot') this.peerSendErrors.delete(peerId);
      return true;
    } catch (error) {
      const detail = error instanceof Error && error.message.trim() ? ` ${error.message.trim()}` : '';
      this.peerSendErrors.delete(peerId);
      this.peerSendErrors.set(peerId, `${failureMessage} for ${peerId}.${detail}`);
      return false;
    }
  }

  private sendToRemoteSeats(message: SessionMessage, failureMessage: string): number {
    let sent = 0;
    for (const peerId of this.remotePeerIds()) {
      if (this.sendToPeer(peerId, message, failureMessage)) sent += 1;
    }
    return sent;
  }

  private canAttemptSnapshot(peerId: string): boolean {
    const lastAttemptTick = this.lastSnapshotAttemptTickByPeer.get(peerId);
    return lastAttemptTick === undefined
      || this.engine.state.tick - lastAttemptTick >= RESYNC_REQUEST_COOLDOWN_TICKS;
  }

  private pendingActionCount(): number {
    return [...this.actionsByTargetTick.values()].reduce((sum, actions) => sum + actions.length, 0);
  }

  private targetTickActions(): SequencedWorldCommand[] {
    return this.actionsByTargetTick.get(this.engine.state.tick + 1) ?? [];
  }

  private captureQueuedAction(action: QueuedWorldActionV2): void {
    if (this.phase === 'closed') return;
    const targetTick = this.engine.state.tick + 1;
    let actions = this.actionsByTargetTick.get(targetTick);
    if (!actions) {
      actions = [];
      this.actionsByTargetTick.set(targetTick, actions);
    }
    if (actions.length >= MAX_ACTIONS_PER_TICK) {
      this.setError(`The action queue exceeded ${MAX_ACTIONS_PER_TICK} commands for tick ${targetTick}.`);
      return;
    }
    const senderPeerId = this.activeSubmission?.senderPeerId ?? this.transport.hostPeerId;
    actions.push({ sequence: action.sequence, senderPeerId, command: action.command });
    if (this.activeSubmission) this.activeSubmission.capturedAction = action;
  }

  private handleEngineChange(change: WorldChangeV2): void {
    if (this.phase !== 'running') return;
    if (change.reason === 'tick') {
      this.broadcastTick();
      return;
    }
    if (change.reason === 'speed-changed') {
      const speed: SpeedMessage = {
        type: 'speed',
        speed: this.engine.state.speed,
        effectiveTick: this.engine.state.tick,
      };
      this.sendToRemoteSeats(speed, 'The shared speed could not be sent');
      this.emitStatus();
    }
  }

  private broadcastTick(): void {
    const tick = this.engine.state.tick;
    const commands = this.actionsByTargetTick.get(tick) ?? [];
    this.actionsByTargetTick.delete(tick);
    for (const staleTick of [...this.actionsByTargetTick.keys()]) {
      if (staleTick < tick) this.actionsByTargetTick.delete(staleTick);
    }
    this.handlingTick = true;
    try {
      const message: TickMessage = {
        type: 'tick',
        tick,
        commands: [...commands].sort((left, right) => left.sequence - right.sequence),
      };
      if (tick % CANONICAL_HASH_INTERVAL_TICKS === 0 && this.pendingActionCount() === 0) {
        message.hash = this.engine.canonicalHash();
        this.lastHashTick = tick;
      }
      this.sendToRemoteSeats(message, `Authoritative tick ${tick} could not be sent`);
    } catch (error) {
      this.setError(`The authoritative tick ${tick} could not be broadcast.`, error);
    } finally {
      this.handlingTick = false;
    }
    this.flushDeferredSnapshots();
    this.emitStatus();
  }

  private handleTransportMessage(peerId: string, message: SessionMessage): void {
    if (!this.seats.has(peerId) || peerId === this.transport.hostPeerId) return;
    if (message.type === 'command') {
      this.handleRemoteCommand(peerId, message);
      return;
    }
    if (message.type === 'resync-request') this.handleResyncRequest(peerId, message);
    // Guests never authoritatively apply tick, speed, snapshot or lobby messages.
  }

  private handleRemoteCommand(peerId: string, message: CommandMessage): void {
    const fingerprint = commandFingerprint(message);
    const peerCache = this.commandResultsByPeer.get(peerId);
    const cached = peerCache?.get(message.requestId);
    if (cached) {
      if (cached.fingerprint === fingerprint) this.sendCommandResult(peerId, cached.result);
      else this.sendCommandResult(peerId, {
        type: 'command-result',
        requestId: message.requestId,
        accepted: false,
        reason: 'That request ID was already used for a different command.',
      });
      return;
    }

    if (this.phase !== 'running') {
      this.cacheAndSendResult(peerId, fingerprint, {
        type: 'command-result', requestId: message.requestId, accepted: false, reason: 'The campaign is not running.',
      });
      return;
    }
    const expectedClientSequence = (this.lastClientSequenceByPeer.get(peerId) ?? 0) + 1;
    if (message.clientSequence !== expectedClientSequence) {
      this.cacheAndSendResult(peerId, fingerprint, {
        type: 'command-result',
        requestId: message.requestId,
        accepted: false,
        reason: `Expected client command ${expectedClientSequence}, received ${message.clientSequence}.`,
      });
      return;
    }
    this.lastClientSequenceByPeer.set(peerId, message.clientSequence);

    const seatCountryId = this.seats.get(peerId)!;
    const authorization = authorizeMultiplayerCommandV2(this.engine.state, seatCountryId, message.command, false);
    if (!authorization.accepted) {
      this.cacheAndSendResult(peerId, fingerprint, {
        type: 'command-result',
        requestId: message.requestId,
        accepted: false,
        reason: cleanReason(authorization.reason, 'This command is not authorized for your seat.'),
      });
      return;
    }
    if (this.targetTickActions().length >= MAX_ACTIONS_PER_TICK) {
      this.cacheAndSendResult(peerId, fingerprint, {
        type: 'command-result',
        requestId: message.requestId,
        accepted: false,
        reason: 'Too many commands are already queued for the next week.',
      });
      return;
    }

    const context: SubmissionContext = { senderPeerId: peerId };
    this.activeSubmission = context;
    let result: CommandResultV2;
    try {
      result = this.engine.submitCommand(message.command);
    } catch (error) {
      result = rejected(cleanReason(error instanceof Error ? error.message : undefined, 'The host could not process this command.'));
    } finally {
      this.activeSubmission = undefined;
    }
    const response: CommandResultMessage = result.accepted && context.capturedAction
      ? {
          type: 'command-result',
          requestId: message.requestId,
          accepted: true,
          assignedSequence: context.capturedAction.sequence,
        }
      : {
          type: 'command-result',
          requestId: message.requestId,
          accepted: false,
          reason: cleanReason(
            result.reason,
            result.accepted
              ? 'The host accepted the command without assigning an action sequence.'
              : 'The command was rejected by the game rules.',
          ),
        };
    this.cacheAndSendResult(peerId, fingerprint, response);
    this.emitStatus();
  }

  private cacheAndSendResult(peerId: string, fingerprint: string, result: CommandResultMessage): void {
    let cache = this.commandResultsByPeer.get(peerId);
    if (!cache) {
      cache = new Map<string, CachedCommandResult>();
      this.commandResultsByPeer.set(peerId, cache);
    }
    cache.set(result.requestId, { fingerprint, result });
    while (cache.size > MAX_CACHED_COMMAND_RESULTS_PER_PEER) {
      const oldest = cache.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
    this.sendCommandResult(peerId, result);
  }

  private sendCommandResult(peerId: string, result: CommandResultMessage): void {
    this.sendToPeer(peerId, result, `The result for ${result.requestId} could not be returned`);
    this.emitStatus();
  }

  private handleResyncRequest(peerId: string, _message: ResyncRequestMessage): void {
    this.queueOrSendSnapshot(peerId, 'resync');
  }

  private queueOrSendSnapshot(peerId: string, reason: SnapshotMessage['reason']): void {
    if (!this.canAttemptSnapshot(peerId)
      || this.handlingTick
      || this.pendingActionCount() > 0) {
      this.deferredSnapshots.set(peerId, reason);
      this.emitStatus();
      return;
    }
    this.lastSnapshotAttemptTickByPeer.set(peerId, this.engine.state.tick);
    try {
      const snapshot = this.createSnapshot(reason);
      if (this.sendToPeer(peerId, snapshot, `A ${reason} snapshot could not be sent`)) {
        this.lastSnapshotTickByPeer.set(peerId, snapshot.tick);
        this.deferredSnapshots.delete(peerId);
      } else {
        this.deferredSnapshots.set(peerId, reason);
      }
    } catch (error) {
      this.setError(`A ${reason} snapshot could not be created for ${peerId}.`, error);
    }
    this.emitStatus();
  }

  private flushDeferredSnapshots(): void {
    if (this.handlingTick || this.pendingActionCount() > 0 || this.deferredSnapshots.size === 0) return;
    const eligible = [...this.deferredSnapshots].filter(([peerId]) => this.canAttemptSnapshot(peerId));
    if (eligible.length === 0) return;
    let save: SaveGameV2;
    try {
      save = createSaveV2(this.engine.state, this.engine.content);
    } catch (error) {
      this.setError('Deferred resync snapshots could not be created.', error);
      return;
    }
    for (const [peerId, reason] of eligible) {
      this.lastSnapshotAttemptTickByPeer.set(peerId, this.engine.state.tick);
      const snapshot: SnapshotMessage = {
        type: 'snapshot',
        reason,
        tick: save.tick,
        hash: save.canonicalStateHash,
        save,
      };
      if (this.sendToPeer(peerId, snapshot, `A deferred ${reason} snapshot could not be sent`)) {
        this.lastSnapshotTickByPeer.set(peerId, snapshot.tick);
        this.deferredSnapshots.delete(peerId);
      }
    }
  }

  private createSnapshot(reason: SnapshotMessage['reason']): SnapshotMessage {
    const save = createSaveV2(this.engine.state, this.engine.content);
    return {
      type: 'snapshot',
      reason,
      tick: save.tick,
      hash: save.canonicalStateHash,
      save,
    };
  }

  private failResult(message: string, error: unknown): CommandResultV2 {
    this.setError(message, error);
    return rejected(this.lastError ?? message);
  }

  private setError(message: string, error?: unknown): void {
    this.lastError = error instanceof Error ? `${message} ${error.message}` : message;
    if (this.phase !== 'closed') {
      this.phase = 'error';
      this.engine.setClockAuthority(false);
    }
    this.emitStatus();
  }

  private emitStatus(): void {
    const status = this.status;
    for (const listener of this.statusListeners) safeNotify(() => listener(status));
  }
}

export class GuestGameSession {
  readonly role = 'guest' as const;
  readonly transport: GuestSessionTransport;
  readonly countryId: PlayerId;
  readonly seatCount: number;

  private readonly content: WorldContentV2;
  private readonly replicaFactory: (save: SaveGameV2, content: WorldContentV2) => GameSessionEngineV2;
  private readonly requestIdFactory: () => string;
  private readonly expectedHumanPlayerIds?: readonly PlayerId[];
  private readonly statusListeners = new Set<(status: GameSessionStatus) => void>();
  private readonly commandResultListeners = new Set<(event: GuestCommandResultEvent) => void>();
  private readonly snapshotListeners = new Set<(event: GuestSnapshotEvent) => void>();
  private readonly pendingCommands = new Map<string, PendingClientCommand>();
  private currentEngine?: GameSessionEngineV2;
  private phase: GameSessionPhase = 'waiting-snapshot';
  private lastError?: string;
  private lastHashTick: number | null = null;
  private nextClientSequence = 1;
  private resyncPending = false;
  private resyncRetry?: PendingResyncRequest;
  private pendingSpeed?: SpeedMessage;
  private unsubscribeTransport: () => void;

  constructor(options: GuestGameSessionOptions) {
    if (!Number.isSafeInteger(options.seatCount)
      || options.seatCount < MIN_MULTIPLAYER_PLAYERS
      || options.seatCount > MAX_MULTIPLAYER_PLAYERS) {
      throw new GameSessionError(`Seat count must be ${MIN_MULTIPLAYER_PLAYERS}-${MAX_MULTIPLAYER_PLAYERS}.`);
    }
    this.transport = options.transport;
    this.countryId = options.countryId;
    this.seatCount = options.seatCount;
    if (options.humanPlayerIds) {
      const expectedHumanPlayerIds = [...new Set(options.humanPlayerIds)]
        .sort((left, right) => left.localeCompare(right));
      if (expectedHumanPlayerIds.length !== options.seatCount) {
        throw new GameSessionError('The expected human-country roster must match the multiplayer seat count.');
      }
      if (!expectedHumanPlayerIds.includes(options.countryId)) {
        throw new GameSessionError('The guest country must be present in the expected human-country roster.');
      }
      this.expectedHumanPlayerIds = expectedHumanPlayerIds;
    }
    this.content = options.content ?? options.engine?.content ?? WORLD_CONTENT_V2;
    this.replicaFactory = options.replicaFactory ?? defaultReplicaFactory;
    this.requestIdFactory = options.requestIdFactory ?? randomRequestId;
    if (options.onStatus) this.statusListeners.add(options.onStatus);
    if (options.onCommandResult) this.commandResultListeners.add(options.onCommandResult);
    if (options.onSnapshot) this.snapshotListeners.add(options.onSnapshot);
    if (options.engine) this.attachReplica(options.engine);
    this.unsubscribeTransport = this.transport.subscribe({
      onMessage: (message) => this.handleTransportMessage(message),
      onStateChange: (event) => this.handleTransportState(event.peer.state, event.error?.message),
    });
  }

  get engine(): GameSessionEngineV2 | undefined {
    return this.currentEngine;
  }

  get status(): GameSessionStatus {
    return {
      role: this.role,
      phase: this.phase,
      tick: this.currentEngine?.state.tick ?? 0,
      speed: this.currentEngine?.state.speed ?? 0,
      connectedPeers: this.transport.state === 'connected' ? 1 : 0,
      seatCount: this.seatCount,
      pendingCommands: this.pendingCommands.size,
      lastHashTick: this.lastHashTick,
      ...(this.lastError ? { lastError: this.lastError } : {}),
    };
  }

  subscribe(handlers: GuestGameSessionHandlers): () => void {
    if (handlers.onStatus) this.statusListeners.add(handlers.onStatus);
    if (handlers.onCommandResult) this.commandResultListeners.add(handlers.onCommandResult);
    if (handlers.onSnapshot) this.snapshotListeners.add(handlers.onSnapshot);
    if (handlers.onStatus) safeNotify(() => handlers.onStatus!(this.status));
    return () => {
      if (handlers.onStatus) this.statusListeners.delete(handlers.onStatus);
      if (handlers.onCommandResult) this.commandResultListeners.delete(handlers.onCommandResult);
      if (handlers.onSnapshot) this.snapshotListeners.delete(handlers.onSnapshot);
    };
  }

  submitCommand(command: WorldCommandV2): CommandResultV2 {
    if (!this.currentEngine || this.phase !== 'running') return rejected('The authoritative snapshot is not ready.');
    const authorization = authorizeMultiplayerCommandV2(this.currentEngine.state, this.countryId, command, false);
    if (!authorization.accepted) return authorization;
    return this.currentEngine.submitCommand(command);
  }

  requestResync(reason = 'Manual resync requested.'): void {
    this.sendResyncRequest(reason);
  }

  /** Applies the lobby's already-received launch snapshot before game handlers take ownership. */
  acceptSnapshot(message: SnapshotMessage): CommandResultV2 {
    if (this.phase === 'closed') return rejected('This multiplayer session is closed.');
    return this.applySnapshot(message)
      ? { accepted: true }
      : rejected(this.lastError ?? 'The authoritative snapshot could not be loaded.');
  }

  close(closeTransport = true): void {
    if (this.phase === 'closed') return;
    this.phase = 'closed';
    this.detachReplica();
    this.unsubscribeTransport();
    this.pendingCommands.clear();
    this.resyncRetry = undefined;
    this.emitStatus();
    this.statusListeners.clear();
    this.commandResultListeners.clear();
    this.snapshotListeners.clear();
    if (closeTransport) this.transport.close();
  }

  private attachReplica(engine: GameSessionEngineV2): void {
    this.detachReplica();
    engine.setClockAuthority(false);
    const viewerResult = engine.setViewerPlayerId(this.countryId);
    if (!viewerResult.accepted) throw new GameSessionError(cleanReason(viewerResult.reason, 'The guest viewer seat is invalid.'));
    engine.setClientCommandSink((command) => this.forwardReplicaCommand(command));
    this.currentEngine = engine;
  }

  private detachReplica(): void {
    if (!this.currentEngine) return;
    this.currentEngine.setClientCommandSink(undefined);
    this.currentEngine.setClockAuthority(false);
    this.currentEngine = undefined;
  }

  private forwardReplicaCommand(command: WorldCommandV2): CommandResultV2 {
    if (!this.currentEngine || this.phase !== 'running') return rejected('The multiplayer replica is not ready.');
    const authorization = authorizeMultiplayerCommandV2(this.currentEngine.state, this.countryId, command, false);
    if (!authorization.accepted) return authorization;
    if (this.pendingCommands.size >= MAX_PENDING_CLIENT_COMMANDS) {
      return rejected('Wait for the host to acknowledge earlier commands.');
    }
    const requestId = this.requestIdFactory();
    if (this.pendingCommands.has(requestId)) return rejected('The command request ID was already used.');
    const clientSequence = this.nextClientSequence;
    const message: CommandMessage = {
      type: 'command',
      requestId,
      clientSequence,
      baseTick: this.currentEngine.state.tick,
      command,
    };
    this.pendingCommands.set(requestId, { command, clientSequence });
    this.nextClientSequence += 1;
    try {
      this.transport.send(message);
      this.emitStatus();
      return { accepted: true };
    } catch (error) {
      this.pendingCommands.delete(requestId);
      if (this.nextClientSequence === clientSequence + 1) this.nextClientSequence = clientSequence;
      this.setError('The command could not be sent to the host.', error);
      return rejected(this.lastError ?? 'The command could not be sent to the host.');
    }
  }

  private handleTransportMessage(message: SessionMessage): void {
    switch (message.type) {
      case 'snapshot':
        this.applySnapshot(message);
        break;
      case 'tick':
        this.applyTick(message);
        break;
      case 'speed':
        this.applySpeed(message);
        break;
      case 'command-result':
        this.applyCommandResult(message);
        break;
      default:
        // The host never drives guest state through command/lobby/resync payloads.
        break;
    }
  }

  private applySnapshot(message: SnapshotMessage): boolean {
    let replica: GameSessionEngineV2;
    try {
      replica = this.replicaFactory(message.save, this.content);
      if (replica.state.tick !== message.tick) throw new GameSessionError('Snapshot tick does not match its save.');
      const actualHash = replica.canonicalHash();
      if (actualHash !== message.hash) throw new GameSessionError('Snapshot canonical hash does not match its save.');
      if (this.expectedHumanPlayerIds
        && !samePlayerRoster(replica.state.humanPlayerIds, this.expectedHumanPlayerIds)) {
        throw new GameSessionError('Snapshot human-country roster does not match the started lobby.');
      }
      this.attachReplica(replica);
    } catch (error) {
      this.setError('The host snapshot could not be loaded.', error);
      this.resyncPending = false;
      this.sendResyncRequest('Snapshot validation failed.');
      return false;
    }
    this.phase = 'running';
    this.lastError = undefined;
    this.lastHashTick = message.tick;
    this.resyncPending = false;
    this.resyncRetry = undefined;
    if (this.pendingCommands.size > 0) {
      const superseded = [...this.pendingCommands.entries()];
      this.pendingCommands.clear();
      for (const [requestId, pending] of superseded) {
        const event: GuestCommandResultEvent = {
          result: {
            type: 'command-result',
            requestId,
            accepted: false,
            reason: 'The authoritative snapshot superseded this pending command.',
          },
          command: pending.command,
        };
        for (const listener of this.commandResultListeners) safeNotify(() => listener(event));
      }
    }
    if (this.pendingSpeed) {
      this.currentEngine!.setAuthoritativeSpeed(this.pendingSpeed.speed);
      this.pendingSpeed = undefined;
    }
    const event = { message, engine: this.currentEngine! };
    for (const listener of this.snapshotListeners) safeNotify(() => listener(event));
    this.emitStatus();
    return true;
  }

  private applyTick(message: TickMessage): void {
    const engine = this.currentEngine;
    if (!engine || this.phase === 'waiting-snapshot' || this.resyncPending) return;
    const expectedTick = engine.state.tick + 1;
    if (message.tick < expectedTick) {
      if (message.tick === engine.state.tick && message.hash && this.lastHashTick !== message.tick) {
        this.verifyHash(message.tick, message.hash);
      }
      return;
    }
    if (message.tick !== expectedTick) {
      this.sendResyncRequest(`Authoritative tick gap: expected ${expectedTick}, received ${message.tick}.`, message.tick);
      return;
    }

    for (const ordered of message.commands) {
      const result = engine.enqueueAuthoritativeAction({ sequence: ordered.sequence, command: ordered.command });
      if (!result.accepted) {
        this.sendResyncRequest(cleanReason(result.reason, 'Authoritative command sequence mismatch.'), message.tick);
        return;
      }
    }
    try {
      engine.step();
    } catch (error) {
      this.setError(`Replica tick ${message.tick} failed.`, error);
      this.resyncPending = false;
      this.sendResyncRequest(`Replica tick ${message.tick} failed.`);
      return;
    }
    if (engine.state.tick !== message.tick) {
      this.sendResyncRequest(`Replica ended on tick ${engine.state.tick}, expected ${message.tick}.`, message.tick);
      return;
    }
    if (message.hash) this.verifyHash(message.tick, message.hash);
    if (!this.resyncPending) {
      this.phase = 'running';
      this.emitStatus();
    }
  }

  private verifyHash(tick: number, expectedHash: string): void {
    const engine = this.currentEngine;
    if (!engine) return;
    let actualHash: string;
    try {
      actualHash = engine.canonicalHash();
    } catch (error) {
      this.setError(`Replica hash at tick ${tick} could not be calculated.`, error);
      this.resyncPending = false;
      this.sendResyncRequest(`Replica hash at tick ${tick} failed.`);
      return;
    }
    if (actualHash !== expectedHash) {
      this.sendResyncRequest(
        `Canonical hash mismatch at tick ${tick}.`,
        tick,
        expectedHash,
        actualHash,
      );
      return;
    }
    this.lastHashTick = tick;
  }

  private applySpeed(message: SpeedMessage): void {
    if (!this.currentEngine) {
      this.pendingSpeed = message;
      return;
    }
    const result = this.currentEngine.setAuthoritativeSpeed(message.speed);
    if (!result.accepted) this.setError(cleanReason(result.reason, 'The authoritative speed was invalid.'));
    else this.emitStatus();
  }

  private applyCommandResult(message: CommandResultMessage): void {
    const pending = this.pendingCommands.get(message.requestId);
    if (!pending) return;
    this.pendingCommands.delete(message.requestId);
    const event = { result: message, command: pending.command };
    for (const listener of this.commandResultListeners) safeNotify(() => listener(event));
    this.emitStatus();
  }

  private sendResyncRequest(
    reason: string,
    expectedTick = (this.currentEngine?.state.tick ?? 0) + 1,
    expectedHash?: string,
    actualHash?: string,
  ): void {
    if (this.resyncPending || this.phase === 'closed') return;
    const retry: PendingResyncRequest = {
      reason,
      expectedTick,
      ...(expectedHash ? { expectedHash } : {}),
      ...(actualHash ? { actualHash } : {}),
    };
    this.resyncRetry = retry;
    this.resyncPending = true;
    this.phase = 'resyncing';
    const request: ResyncRequestMessage = {
      type: 'resync-request',
      expectedTick,
      actualTick: this.currentEngine?.state.tick ?? 0,
      ...(expectedHash ? { expectedHash } : {}),
      ...(actualHash ? { actualHash } : {}),
      reason: reason.slice(0, 300),
    };
    try {
      this.transport.send(request);
    } catch (error) {
      this.resyncPending = false;
      this.setError('The resync request could not reach the host.', error);
    }
    this.emitStatus();
  }

  private handleTransportState(state: DirectConnectState, error?: string): void {
    if (this.phase === 'closed') return;
    if (state === 'failed') {
      this.resyncPending = false;
      this.setError(error ?? 'The host connection failed.');
      return;
    }
    if (state === 'closed' || state === 'disconnected') {
      this.resyncPending = false;
      this.phase = 'disconnected';
      this.lastError = error;
      this.emitStatus();
      return;
    }
    if (state === 'connected' && this.currentEngine) {
      const retry = this.resyncRetry;
      this.resyncPending = false;
      this.sendResyncRequest(
        retry?.reason ?? 'Host connection restored.',
        retry?.expectedTick ?? this.currentEngine.state.tick + 1,
        retry?.expectedHash,
        retry?.actualHash,
      );
    }
  }

  private setError(message: string, error?: unknown): void {
    this.lastError = error instanceof Error ? `${message} ${error.message}` : message;
    if (this.phase !== 'closed') this.phase = 'error';
    this.emitStatus();
  }

  private emitStatus(): void {
    const status = this.status;
    for (const listener of this.statusListeners) safeNotify(() => listener(status));
  }
}
