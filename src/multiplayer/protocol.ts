import type { SaveGameV2 } from '../sim/v2/persistence';
import { normalizeScenarioConfigV2, type ScenarioConfigV2 } from '../sim/v2/scenarios';
import type {
  PlayerId,
  ResearchBranchV2,
  WorldCommandV2,
  WorldSpeedV2,
} from '../sim/v2/types';

export const MULTIPLAYER_PROTOCOL_VERSION = 2 as const;
export const MIN_MULTIPLAYER_PLAYERS = 2;
export const MAX_MULTIPLAYER_PLAYERS = 8;
export const MAX_PROTOCOL_MESSAGE_BYTES = 4 * 1024 * 1024;
export const MAX_SIGNAL_CODE_BYTES = 512 * 1024;
export const MAX_DATA_CHANNEL_FRAME_BYTES = 64 * 1024;

const SIGNAL_CODE_PREFIX = 'FCMP1';
const WIRE_FRAME_PREFIX = 'FCW1|';
const WIRE_CHUNK_CODE_UNITS = 12 * 1024;
const MAX_WIRE_FRAGMENTS = 512;
const MAX_PENDING_WIRE_MESSAGES = 16;
const WIRE_MESSAGE_TTL_MS = 30_000;
const MAX_ID_LENGTH = 128;
const MAX_NAME_LENGTH = 40;
const MAX_REASON_LENGTH = 300;

const RESEARCH_BRANCHES = [
  'population-recruitment',
  'military-industry',
  'advanced-weapons',
  'defensive-systems',
  'logistics-medicine',
  'economy-science',
  'food-systems',
  'reserve-doctrine',
  'public-administration',
  'education-intelligence',
] as const satisfies readonly ResearchBranchV2[];

const RESEARCH_BRANCH_SET = new Set<string>(RESEARCH_BRANCHES);

export type ProtocolErrorCode =
  | 'invalid-message'
  | 'message-too-large'
  | 'invalid-signal'
  | 'incompatible-protocol'
  | 'incompatible-rules'
  | 'invalid-wire-frame';

export class MultiplayerProtocolError extends Error {
  readonly code: ProtocolErrorCode;

  constructor(code: ProtocolErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'MultiplayerProtocolError';
    this.code = code;
  }
}

export interface LobbyPlayer {
  peerId: string;
  displayName: string;
  countryId: PlayerId | null;
  ready: boolean;
  connected: boolean;
}

export type LobbyAction =
  | { type: 'set-name'; displayName: string }
  | { type: 'set-scenario'; scenario: ScenarioConfigV2 }
  | { type: 'select-country'; countryId: PlayerId }
  | { type: 'clear-country' }
  | { type: 'set-ready'; ready: boolean }
  | { type: 'start' };

export interface SequencedWorldCommand {
  sequence: number;
  senderPeerId: string;
  command: WorldCommandV2;
}

export interface HelloMessage {
  type: 'hello';
  protocolVersion: typeof MULTIPLAYER_PROTOCOL_VERSION;
  rulesVersion: string;
  roomId: string;
  invitationId: string;
  peerId: string;
  displayName: string;
  role: 'guest';
}

export interface HelloAckMessage {
  type: 'hello-ack';
  protocolVersion: typeof MULTIPLAYER_PROTOCOL_VERSION;
  rulesVersion: string;
  roomId: string;
  invitationId: string;
  hostPeerId: string;
  acceptedPeerId: string;
  maxPlayers: number;
}

export interface RejectMessage {
  type: 'reject';
  protocolVersion: typeof MULTIPLAYER_PROTOCOL_VERSION;
  code: string;
  message: string;
}

export interface LobbyStateMessage {
  type: 'lobby-state';
  revision: number;
  hostPeerId: string;
  scenario: ScenarioConfigV2;
  started: boolean;
  players: LobbyPlayer[];
}

export interface LobbyActionMessage {
  type: 'lobby-action';
  revision: number;
  action: LobbyAction;
}

/** A client request. The host validates ownership and assigns the global sequence. */
export interface CommandMessage {
  type: 'command';
  requestId: string;
  clientSequence: number;
  baseTick: number;
  command: WorldCommandV2;
}

/** Host acknowledgement for a client request, including deterministic rejection feedback. */
export interface CommandResultMessage {
  type: 'command-result';
  requestId: string;
  accepted: boolean;
  reason?: string;
  assignedSequence?: number;
}

/** One authoritative simulation boundary, broadcast by the host in exact order. */
export interface TickMessage {
  type: 'tick';
  tick: number;
  /** Periodic checkpoint only; omitted on hot-path ticks between hash intervals. */
  hash?: string;
  commands: SequencedWorldCommand[];
}

export interface SpeedMessage {
  type: 'speed';
  speed: WorldSpeedV2;
  effectiveTick: number;
}

export interface SnapshotMessage {
  type: 'snapshot';
  reason: 'join' | 'resync' | 'reconnect';
  tick: number;
  hash: string;
  save: SaveGameV2;
}

export interface ResyncRequestMessage {
  type: 'resync-request';
  expectedTick: number;
  actualTick: number;
  expectedHash?: string;
  actualHash?: string;
  reason: string;
}

export type SessionMessage =
  | LobbyStateMessage
  | LobbyActionMessage
  | CommandMessage
  | CommandResultMessage
  | TickMessage
  | SpeedMessage
  | SnapshotMessage
  | ResyncRequestMessage;

export type MultiplayerProtocolMessage =
  | HelloMessage
  | HelloAckMessage
  | RejectMessage
  | SessionMessage;

export interface DirectInviteSignal {
  kind: 'direct-invite';
  protocolVersion: typeof MULTIPLAYER_PROTOCOL_VERSION;
  rulesVersion: string;
  roomId: string;
  invitationId: string;
  hostPeerId: string;
  hostName: string;
  description: RTCSessionDescriptionInit & { type: 'offer'; sdp: string };
}

export interface DirectAnswerSignal {
  kind: 'direct-answer';
  protocolVersion: typeof MULTIPLAYER_PROTOCOL_VERSION;
  rulesVersion: string;
  roomId: string;
  invitationId: string;
  guestPeerId: string;
  guestName: string;
  description: RTCSessionDescriptionInit & { type: 'answer'; sdp: string };
}

export type DirectSignal = DirectInviteSignal | DirectAnswerSignal;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(message: string): never {
  throw new MultiplayerProtocolError('invalid-message', message);
}

function requireRecord(value: unknown, label: string): UnknownRecord {
  if (!isRecord(value)) fail(`${label} must be an object.`);
  return value;
}

function requireString(value: unknown, label: string, maxLength = MAX_ID_LENGTH, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0) || value.length > maxLength) {
    fail(`${label} must be ${allowEmpty ? 'a' : 'a non-empty'} string of at most ${maxLength} characters.`);
  }
  return value;
}

function requireFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label} must be a finite number.`);
  return value;
}

function requireInteger(value: unknown, label: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const number = requireFiniteNumber(value, label);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    fail(`${label} must be an integer from ${min} through ${max}.`);
  }
  return number;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') fail(`${label} must be a boolean.`);
  return value;
}

function requireScenarioConfig(value: unknown, label: string): ScenarioConfigV2 {
  const scenario = requireRecord(value, label);
  const expectedKeys = ['mode', 'seed', 'version'];
  const keys = Object.keys(scenario).sort((left, right) => left.localeCompare(right, 'en'));
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
    fail(`${label} must contain exactly mode, seed and version.`);
  }
  if (scenario.mode !== 'standard-2026' && scenario.mode !== 'random-world') {
    fail(`${label}.mode is not supported.`);
  }
  const version = requireInteger(scenario.version, `${label}.version`, 1, 1_000);
  const seed = requireInteger(scenario.seed, `${label}.seed`, 1, 0xffff_ffff);
  try {
    const normalized = normalizeScenarioConfigV2({ mode: scenario.mode, version, seed });
    if (normalized.seed !== seed) fail(`${label}.seed is not canonical.`);
    return normalized;
  } catch (error) {
    fail(error instanceof Error ? `${label} is invalid: ${error.message}` : `${label} is invalid.`);
  }
}

function requireHash(value: unknown, label: string): string {
  return requireString(value, label, 128);
}

function requirePlayerId(value: unknown, label: string): PlayerId {
  return requireString(value, label, MAX_ID_LENGTH) as PlayerId;
}

function requireProtocolVersion(value: unknown): typeof MULTIPLAYER_PROTOCOL_VERSION {
  if (value !== MULTIPLAYER_PROTOCOL_VERSION) {
    throw new MultiplayerProtocolError(
      'incompatible-protocol',
      `Multiplayer protocol ${String(value)} is not supported; expected ${MULTIPLAYER_PROTOCOL_VERSION}.`,
    );
  }
  return MULTIPLAYER_PROTOCOL_VERSION;
}

function validateBudget(value: unknown, label: string): void {
  const budget = requireRecord(value, label);
  for (const domain of ['military', 'research', 'development'] as const) {
    const amount = requireFiniteNumber(budget[domain], `${label}.${domain}`);
    if (amount < 0 || amount > 100) fail(`${label}.${domain} must be from 0 through 100.`);
  }
}

function validateResearchAllocations(value: unknown): void {
  const allocations = requireRecord(value, 'command.allocations');
  const keys = Object.keys(allocations);
  if (keys.length !== RESEARCH_BRANCHES.length || keys.some((key) => !RESEARCH_BRANCH_SET.has(key))) {
    fail('command.allocations must contain every supported research branch exactly once.');
  }
  for (const branch of RESEARCH_BRANCHES) {
    const allocation = requireFiniteNumber(allocations[branch], `command.allocations.${branch}`);
    if (allocation < 0 || allocation > 100) fail(`command.allocations.${branch} must be from 0 through 100.`);
  }
}

function validateWorldCommand(value: unknown): WorldCommandV2 {
  const command = requireRecord(value, 'command');
  const type = requireString(command.type, 'command.type', 64);

  switch (type) {
    case 'choose-country':
      requirePlayerId(command.countryId, 'command.countryId');
      break;
    case 'set-speed':
      if (command.speed !== 0 && command.speed !== 1 && command.speed !== 2) fail('command.speed must be 0, 1 or 2.');
      break;
    case 'set-research-allocations':
      requirePlayerId(command.playerId, 'command.playerId');
      validateResearchAllocations(command.allocations);
      break;
    case 'adjust-budget':
      requirePlayerId(command.playerId, 'command.playerId');
      if (command.domain !== 'military' && command.domain !== 'research' && command.domain !== 'development') {
        fail('command.domain is invalid.');
      }
      if (Math.abs(requireFiniteNumber(command.delta, 'command.delta')) > 100) fail('command.delta is out of range.');
      break;
    case 'set-budget-policy':
      requirePlayerId(command.playerId, 'command.playerId');
      validateBudget(command.budget, 'command.budget');
      break;
    case 'rapid-recruitment':
    case 'launch-propaganda':
      requirePlayerId(command.playerId, 'command.playerId');
      break;
    case 'research-surge':
      requirePlayerId(command.playerId, 'command.playerId');
      if (typeof command.targetBranch !== 'string' || !RESEARCH_BRANCH_SET.has(command.targetBranch)) {
        fail('command.targetBranch is invalid.');
      }
      break;
    case 'set-empire-name':
      requirePlayerId(command.playerId, 'command.playerId');
      requireString(command.name, 'command.name', 80);
      break;
    case 'declare-war':
      requirePlayerId(command.attackerId, 'command.attackerId');
      requirePlayerId(command.defenderId, 'command.defenderId');
      if (command.escalatedFromWarId !== undefined) {
        requireString(command.escalatedFromWarId, 'command.escalatedFromWarId');
      }
      break;
    case 'request-ceasefire':
      requireString(command.warId, 'command.warId');
      requirePlayerId(command.requesterId, 'command.requesterId');
      break;
    case 'propose-peace':
      requirePlayerId(command.fromId, 'command.fromId');
      requirePlayerId(command.targetId, 'command.targetId');
      if (command.settlement !== 'reparations' && command.settlement !== 'ceasefire') fail('command.settlement is invalid.');
      break;
    case 'respond-to-offer':
      requireString(command.offerId, 'command.offerId');
      requireBoolean(command.accept, 'command.accept');
      break;
    case 'propose-alliance':
      requirePlayerId(command.fromId, 'command.fromId');
      requirePlayerId(command.targetId, 'command.targetId');
      break;
    case 'respond-to-alliance':
      requirePlayerId(command.fromId, 'command.fromId');
      requirePlayerId(command.toId, 'command.toId');
      requireBoolean(command.accept, 'command.accept');
      break;
    default:
      fail(`Unknown command type: ${type}.`);
  }

  return command as unknown as WorldCommandV2;
}

function validateLobbyPlayer(value: unknown, index: number): LobbyPlayer {
  const player = requireRecord(value, `players[${index}]`);
  return {
    peerId: requireString(player.peerId, `players[${index}].peerId`),
    displayName: requireString(player.displayName, `players[${index}].displayName`, MAX_NAME_LENGTH),
    countryId: player.countryId === null ? null : requirePlayerId(player.countryId, `players[${index}].countryId`),
    ready: requireBoolean(player.ready, `players[${index}].ready`),
    connected: requireBoolean(player.connected, `players[${index}].connected`),
  };
}

function validateLobbyAction(value: unknown): LobbyAction {
  const action = requireRecord(value, 'action');
  const type = requireString(action.type, 'action.type', 32);
  switch (type) {
    case 'set-name':
      return { type, displayName: requireString(action.displayName, 'action.displayName', MAX_NAME_LENGTH) };
    case 'set-scenario':
      return { type, scenario: requireScenarioConfig(action.scenario, 'action.scenario') };
    case 'select-country':
      return { type, countryId: requirePlayerId(action.countryId, 'action.countryId') };
    case 'clear-country':
      return { type };
    case 'set-ready':
      return { type, ready: requireBoolean(action.ready, 'action.ready') };
    case 'start':
      return { type };
    default:
      fail(`Unknown lobby action: ${type}.`);
  }
}

function validateSequencedCommand(value: unknown, index: number): SequencedWorldCommand {
  const ordered = requireRecord(value, `commands[${index}]`);
  return {
    sequence: requireInteger(ordered.sequence, `commands[${index}].sequence`, 1),
    senderPeerId: requireString(ordered.senderPeerId, `commands[${index}].senderPeerId`),
    command: validateWorldCommand(ordered.command),
  };
}

function validateSnapshotSave(value: unknown, tick: number): SaveGameV2 {
  const save = requireRecord(value, 'save');
  if (requireInteger(save.tick, 'save.tick') !== tick) fail('save.tick must match the snapshot tick.');
  requireString(save.rulesVersion, 'save.rulesVersion', 160);
  requireHash(save.canonicalStateHash, 'save.canonicalStateHash');
  requireInteger(save.schemaVersion, 'save.schemaVersion', 1, 10_000);
  return save as unknown as SaveGameV2;
}

export function validateProtocolMessage(value: unknown): MultiplayerProtocolMessage {
  const message = requireRecord(value, 'message');
  const type = requireString(message.type, 'message.type', 40);

  switch (type) {
    case 'hello':
      requireProtocolVersion(message.protocolVersion);
      if (message.role !== 'guest') fail('hello.role must be guest.');
      return {
        type,
        protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
        rulesVersion: requireString(message.rulesVersion, 'message.rulesVersion', 160),
        roomId: requireString(message.roomId, 'message.roomId'),
        invitationId: requireString(message.invitationId, 'message.invitationId'),
        peerId: requireString(message.peerId, 'message.peerId'),
        displayName: requireString(message.displayName, 'message.displayName', MAX_NAME_LENGTH),
        role: 'guest',
      };
    case 'hello-ack':
      requireProtocolVersion(message.protocolVersion);
      return {
        type,
        protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
        rulesVersion: requireString(message.rulesVersion, 'message.rulesVersion', 160),
        roomId: requireString(message.roomId, 'message.roomId'),
        invitationId: requireString(message.invitationId, 'message.invitationId'),
        hostPeerId: requireString(message.hostPeerId, 'message.hostPeerId'),
        acceptedPeerId: requireString(message.acceptedPeerId, 'message.acceptedPeerId'),
        maxPlayers: requireInteger(message.maxPlayers, 'message.maxPlayers', MIN_MULTIPLAYER_PLAYERS, MAX_MULTIPLAYER_PLAYERS),
      };
    case 'reject':
      requireProtocolVersion(message.protocolVersion);
      return {
        type,
        protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
        code: requireString(message.code, 'message.code', 80),
        message: requireString(message.message, 'message.message', MAX_REASON_LENGTH),
      };
    case 'lobby-state': {
      if (!Array.isArray(message.players) || message.players.length < 1 || message.players.length > MAX_MULTIPLAYER_PLAYERS) {
        fail(`message.players must contain 1 through ${MAX_MULTIPLAYER_PLAYERS} players.`);
      }
      const players = message.players.map(validateLobbyPlayer);
      if (new Set(players.map((player) => player.peerId)).size !== players.length) fail('Lobby peer IDs must be unique.');
      const selectedCountries = players.flatMap((player) => player.countryId === null ? [] : [player.countryId]);
      if (new Set(selectedCountries).size !== selectedCountries.length) fail('Lobby countries must be unique.');
      return {
        type,
        revision: requireInteger(message.revision, 'message.revision'),
        hostPeerId: requireString(message.hostPeerId, 'message.hostPeerId'),
        scenario: requireScenarioConfig(message.scenario, 'message.scenario'),
        started: requireBoolean(message.started, 'message.started'),
        players,
      };
    }
    case 'lobby-action':
      return {
        type,
        revision: requireInteger(message.revision, 'message.revision'),
        action: validateLobbyAction(message.action),
      };
    case 'command':
      return {
        type,
        requestId: requireString(message.requestId, 'message.requestId'),
        clientSequence: requireInteger(message.clientSequence, 'message.clientSequence', 1),
        baseTick: requireInteger(message.baseTick, 'message.baseTick'),
        command: validateWorldCommand(message.command),
      };
    case 'command-result': {
      const accepted = requireBoolean(message.accepted, 'message.accepted');
      const assignedSequence = message.assignedSequence === undefined
        ? undefined
        : requireInteger(message.assignedSequence, 'message.assignedSequence', 1);
      if (accepted && assignedSequence === undefined) fail('Accepted commands require an assigned sequence.');
      return {
        type,
        requestId: requireString(message.requestId, 'message.requestId'),
        accepted,
        ...(message.reason === undefined ? {} : { reason: requireString(message.reason, 'message.reason', MAX_REASON_LENGTH) }),
        ...(assignedSequence === undefined ? {} : { assignedSequence }),
      };
    }
    case 'tick': {
      if (!Array.isArray(message.commands) || message.commands.length > 1_000) fail('message.commands must be an array of at most 1000 commands.');
      const commands = message.commands.map(validateSequencedCommand);
      for (let index = 1; index < commands.length; index += 1) {
        if (commands[index]!.sequence <= commands[index - 1]!.sequence) fail('Tick commands must be strictly sequence ordered.');
      }
      return {
        type,
        tick: requireInteger(message.tick, 'message.tick'),
        ...(message.hash === undefined ? {} : { hash: requireHash(message.hash, 'message.hash') }),
        commands,
      };
    }
    case 'speed':
      if (message.speed !== 0 && message.speed !== 1 && message.speed !== 2) fail('message.speed must be 0, 1 or 2.');
      return {
        type,
        speed: message.speed,
        effectiveTick: requireInteger(message.effectiveTick, 'message.effectiveTick'),
      };
    case 'snapshot': {
      const tick = requireInteger(message.tick, 'message.tick');
      if (message.reason !== 'join' && message.reason !== 'resync' && message.reason !== 'reconnect') {
        fail('message.reason is invalid.');
      }
      return {
        type,
        reason: message.reason,
        tick,
        hash: requireHash(message.hash, 'message.hash'),
        save: validateSnapshotSave(message.save, tick),
      };
    }
    case 'resync-request':
      return {
        type,
        expectedTick: requireInteger(message.expectedTick, 'message.expectedTick'),
        actualTick: requireInteger(message.actualTick, 'message.actualTick'),
        ...(message.expectedHash === undefined ? {} : { expectedHash: requireHash(message.expectedHash, 'message.expectedHash') }),
        ...(message.actualHash === undefined ? {} : { actualHash: requireHash(message.actualHash, 'message.actualHash') }),
        reason: requireString(message.reason, 'message.reason', MAX_REASON_LENGTH),
      };
    default:
      fail(`Unknown multiplayer message type: ${type}.`);
  }
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function encodeProtocolMessage(message: MultiplayerProtocolMessage): string {
  const validated = validateProtocolMessage(message);
  let encoded: string;
  try {
    encoded = JSON.stringify(validated);
  } catch (error) {
    throw new MultiplayerProtocolError('invalid-message', 'The multiplayer message cannot be encoded.', { cause: error });
  }
  if (utf8Length(encoded) > MAX_PROTOCOL_MESSAGE_BYTES) {
    throw new MultiplayerProtocolError('message-too-large', `Multiplayer messages may not exceed ${MAX_PROTOCOL_MESSAGE_BYTES} bytes.`);
  }
  return encoded;
}

export function decodeProtocolMessage(encoded: string): MultiplayerProtocolMessage {
  if (typeof encoded !== 'string') fail('The multiplayer payload must be text.');
  if (utf8Length(encoded) > MAX_PROTOCOL_MESSAGE_BYTES) {
    throw new MultiplayerProtocolError('message-too-large', `Multiplayer messages may not exceed ${MAX_PROTOCOL_MESSAGE_BYTES} bytes.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(encoded) as unknown;
  } catch (error) {
    throw new MultiplayerProtocolError('invalid-message', 'The multiplayer payload is not valid JSON.', { cause: error });
  }
  return validateProtocolMessage(parsed);
}

function validateWireMessageId(messageId: string): void {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(messageId)) {
    throw new MultiplayerProtocolError('invalid-wire-frame', 'Wire message IDs must be 8-80 URL-safe characters.');
  }
}

function splitWithoutBreakingSurrogates(value: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < value.length) {
    let end = Math.min(value.length, start + WIRE_CHUNK_CODE_UNITS);
    if (end < value.length) {
      const last = value.charCodeAt(end - 1);
      if (last >= 0xd800 && last <= 0xdbff) end -= 1;
    }
    chunks.push(value.slice(start, end));
    start = end;
  }
  return chunks;
}

/** Frames one validated message below conservative cross-browser SCTP message sizes. */
export function encodeWireFrames(message: MultiplayerProtocolMessage, messageId: string): string[] {
  validateWireMessageId(messageId);
  const encoded = encodeProtocolMessage(message);
  const chunks = splitWithoutBreakingSurrogates(encoded);
  if (chunks.length > MAX_WIRE_FRAGMENTS) {
    throw new MultiplayerProtocolError('message-too-large', 'The multiplayer message requires too many wire frames.');
  }
  return chunks.map((chunk, part) => {
    const frame = `${WIRE_FRAME_PREFIX}${messageId}|${part}|${chunks.length}|${chunk}`;
    if (utf8Length(frame) > MAX_DATA_CHANNEL_FRAME_BYTES) {
      throw new MultiplayerProtocolError('message-too-large', 'A multiplayer wire frame exceeds the safe data-channel size.');
    }
    return frame;
  });
}

interface ParsedWireFrame {
  messageId: string;
  part: number;
  total: number;
  payload: string;
}

export function parseWireFrame(frame: string): ParsedWireFrame {
  if (typeof frame !== 'string' || utf8Length(frame) > MAX_DATA_CHANNEL_FRAME_BYTES || !frame.startsWith(WIRE_FRAME_PREFIX)) {
    throw new MultiplayerProtocolError('invalid-wire-frame', 'Invalid multiplayer wire frame.');
  }
  const idEnd = frame.indexOf('|', WIRE_FRAME_PREFIX.length);
  const partEnd = idEnd < 0 ? -1 : frame.indexOf('|', idEnd + 1);
  const totalEnd = partEnd < 0 ? -1 : frame.indexOf('|', partEnd + 1);
  if (idEnd < 0 || partEnd < 0 || totalEnd < 0) {
    throw new MultiplayerProtocolError('invalid-wire-frame', 'Incomplete multiplayer wire-frame header.');
  }
  const messageId = frame.slice(WIRE_FRAME_PREFIX.length, idEnd);
  validateWireMessageId(messageId);
  const partText = frame.slice(idEnd + 1, partEnd);
  const totalText = frame.slice(partEnd + 1, totalEnd);
  if (!/^\d{1,3}$/.test(partText) || !/^\d{1,3}$/.test(totalText)) {
    throw new MultiplayerProtocolError('invalid-wire-frame', 'Invalid multipart wire-frame counters.');
  }
  const part = Number(partText);
  const total = Number(totalText);
  if (total < 1 || total > MAX_WIRE_FRAGMENTS || part < 0 || part >= total) {
    throw new MultiplayerProtocolError('invalid-wire-frame', 'Multipart wire-frame counters are out of range.');
  }
  return { messageId, part, total, payload: frame.slice(totalEnd + 1) };
}

interface PendingWireMessage {
  createdAt: number;
  total: number;
  byteLength: number;
  parts: Array<string | undefined>;
  received: number;
}

/** Per-peer ordered-frame assembler with strict memory and age bounds. */
export class WireMessageAssembler {
  private readonly pending = new Map<string, PendingWireMessage>();

  accept(frameText: string, now = Date.now()): MultiplayerProtocolMessage | null {
    this.expire(now);
    const frame = parseWireFrame(frameText);
    let pending = this.pending.get(frame.messageId);
    if (!pending) {
      if (this.pending.size >= MAX_PENDING_WIRE_MESSAGES) {
        throw new MultiplayerProtocolError('invalid-wire-frame', 'Too many incomplete multiplayer messages.');
      }
      pending = {
        createdAt: now,
        total: frame.total,
        byteLength: 0,
        parts: new Array<string | undefined>(frame.total),
        received: 0,
      };
      this.pending.set(frame.messageId, pending);
    } else if (pending.total !== frame.total) {
      this.pending.delete(frame.messageId);
      throw new MultiplayerProtocolError('invalid-wire-frame', 'Wire-frame totals changed within one message.');
    }

    const existing = pending.parts[frame.part];
    if (existing !== undefined) {
      if (existing !== frame.payload) {
        this.pending.delete(frame.messageId);
        throw new MultiplayerProtocolError('invalid-wire-frame', 'A duplicate wire frame contained conflicting data.');
      }
      return null;
    }

    pending.parts[frame.part] = frame.payload;
    pending.received += 1;
    pending.byteLength += utf8Length(frame.payload);
    if (pending.byteLength > MAX_PROTOCOL_MESSAGE_BYTES) {
      this.pending.delete(frame.messageId);
      throw new MultiplayerProtocolError('message-too-large', 'The reassembled multiplayer message is too large.');
    }
    if (pending.received !== pending.total) return null;

    this.pending.delete(frame.messageId);
    return decodeProtocolMessage(pending.parts.join(''));
  }

  clear(): void {
    this.pending.clear();
  }

  private expire(now: number): void {
    for (const [messageId, pending] of this.pending) {
      if (now - pending.createdAt > WIRE_MESSAGE_TTL_MS) this.pending.delete(messageId);
    }
  }
}

const BASE64_URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function encodeBase64Url(bytes: Uint8Array): string {
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const left = bytes[index]!;
    const middle = bytes[index + 1];
    const right = bytes[index + 2];
    result += BASE64_URL_ALPHABET[left >>> 2];
    result += BASE64_URL_ALPHABET[((left & 3) << 4) | ((middle ?? 0) >>> 4)];
    if (middle !== undefined) result += BASE64_URL_ALPHABET[((middle & 15) << 2) | ((right ?? 0) >>> 6)];
    if (right !== undefined) result += BASE64_URL_ALPHABET[right & 63];
  }
  return result;
}

function decodeBase64Url(encoded: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1) {
    throw new MultiplayerProtocolError('invalid-signal', 'The Direct Connect code is not valid base64url.');
  }
  const values = new Uint8Array(128);
  values.fill(255);
  for (let index = 0; index < BASE64_URL_ALPHABET.length; index += 1) {
    values[BASE64_URL_ALPHABET.charCodeAt(index)] = index;
  }
  const bytes: number[] = [];
  for (let index = 0; index < encoded.length; index += 4) {
    const a = values[encoded.charCodeAt(index)]!;
    const b = values[encoded.charCodeAt(index + 1)]!;
    const c = index + 2 < encoded.length ? values[encoded.charCodeAt(index + 2)]! : 0;
    const d = index + 3 < encoded.length ? values[encoded.charCodeAt(index + 3)]! : 0;
    if (a === 255 || b === 255 || c === 255 || d === 255) {
      throw new MultiplayerProtocolError('invalid-signal', 'The Direct Connect code contains invalid characters.');
    }
    bytes.push((a << 2) | (b >>> 4));
    if (index + 2 < encoded.length) bytes.push(((b & 15) << 4) | (c >>> 2));
    if (index + 3 < encoded.length) bytes.push(((c & 3) << 6) | d);
  }
  return Uint8Array.from(bytes);
}

function validateSignal(value: unknown): DirectSignal {
  const signal = requireRecord(value, 'signal');
  const kind = requireString(signal.kind, 'signal.kind', 32);
  requireProtocolVersion(signal.protocolVersion);
  const common = {
    protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
    rulesVersion: requireString(signal.rulesVersion, 'signal.rulesVersion', 160),
    roomId: requireString(signal.roomId, 'signal.roomId'),
    invitationId: requireString(signal.invitationId, 'signal.invitationId'),
  };
  const description = requireRecord(signal.description, 'signal.description');
  const sdp = requireString(description.sdp, 'signal.description.sdp', MAX_SIGNAL_CODE_BYTES);
  if (kind === 'direct-invite') {
    if (description.type !== 'offer') fail('An invite must contain an offer description.');
    return {
      kind,
      ...common,
      hostPeerId: requireString(signal.hostPeerId, 'signal.hostPeerId'),
      hostName: requireString(signal.hostName, 'signal.hostName', MAX_NAME_LENGTH),
      description: { type: 'offer', sdp },
    };
  }
  if (kind === 'direct-answer') {
    if (description.type !== 'answer') fail('An answer must contain an answer description.');
    return {
      kind,
      ...common,
      guestPeerId: requireString(signal.guestPeerId, 'signal.guestPeerId'),
      guestName: requireString(signal.guestName, 'signal.guestName', MAX_NAME_LENGTH),
      description: { type: 'answer', sdp },
    };
  }
  throw new MultiplayerProtocolError('invalid-signal', `Unknown Direct Connect signal kind: ${kind}.`);
}

export function encodeSignalCode(signal: DirectSignal): string {
  const validated = validateSignal(signal);
  const bytes = new TextEncoder().encode(JSON.stringify(validated));
  if (bytes.byteLength > MAX_SIGNAL_CODE_BYTES) {
    throw new MultiplayerProtocolError('message-too-large', `Direct Connect codes may not exceed ${MAX_SIGNAL_CODE_BYTES} bytes.`);
  }
  return `${SIGNAL_CODE_PREFIX}.${encodeBase64Url(bytes)}`;
}

export function decodeSignalCode(code: string): DirectSignal {
  if (typeof code !== 'string') {
    throw new MultiplayerProtocolError('invalid-signal', 'The Direct Connect code must be text.');
  }
  const compact = code.trim();
  if (!compact.startsWith(`${SIGNAL_CODE_PREFIX}.`)) {
    throw new MultiplayerProtocolError('invalid-signal', 'This is not a Frontier Command Direct Connect code.');
  }
  const maximumEncodedLength = SIGNAL_CODE_PREFIX.length + 1 + Math.ceil(MAX_SIGNAL_CODE_BYTES * 4 / 3);
  if (compact.length > maximumEncodedLength) {
    throw new MultiplayerProtocolError('message-too-large', `Direct Connect codes may not exceed ${MAX_SIGNAL_CODE_BYTES} decoded bytes.`);
  }
  const encoded = compact.slice(SIGNAL_CODE_PREFIX.length + 1);
  const bytes = decodeBase64Url(encoded);
  if (bytes.byteLength > MAX_SIGNAL_CODE_BYTES) {
    throw new MultiplayerProtocolError('message-too-large', `Direct Connect codes may not exceed ${MAX_SIGNAL_CODE_BYTES} bytes.`);
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new MultiplayerProtocolError('invalid-signal', 'The Direct Connect code is not valid UTF-8.', { cause: error });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    throw new MultiplayerProtocolError('invalid-signal', 'The Direct Connect code does not contain valid JSON.', { cause: error });
  }
  try {
    return validateSignal(parsed);
  } catch (error) {
    if (error instanceof MultiplayerProtocolError && error.code === 'invalid-message') {
      throw new MultiplayerProtocolError('invalid-signal', error.message, { cause: error });
    }
    throw error;
  }
}

export function assertSignalCompatibility(
  signal: DirectSignal,
  rulesVersion: string,
  expected?: { roomId?: string; invitationId?: string },
): void {
  if (signal.protocolVersion !== MULTIPLAYER_PROTOCOL_VERSION) {
    throw new MultiplayerProtocolError('incompatible-protocol', 'The other player uses an incompatible multiplayer protocol.');
  }
  if (signal.rulesVersion !== rulesVersion) {
    throw new MultiplayerProtocolError(
      'incompatible-rules',
      `Game rules do not match (${signal.rulesVersion} versus ${rulesVersion}).`,
    );
  }
  if (expected?.roomId !== undefined && signal.roomId !== expected.roomId) {
    throw new MultiplayerProtocolError('invalid-signal', 'This answer belongs to a different room.');
  }
  if (expected?.invitationId !== undefined && signal.invitationId !== expected.invitationId) {
    throw new MultiplayerProtocolError('invalid-signal', 'This answer belongs to a different invitation.');
  }
}

export function isSessionMessage(message: MultiplayerProtocolMessage): message is SessionMessage {
  return message.type !== 'hello' && message.type !== 'hello-ack' && message.type !== 'reject';
}
