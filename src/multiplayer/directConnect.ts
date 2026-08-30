import {
  MAX_MULTIPLAYER_PLAYERS,
  MIN_MULTIPLAYER_PLAYERS,
  MULTIPLAYER_PROTOCOL_VERSION,
  MultiplayerProtocolError,
  WireMessageAssembler,
  assertSignalCompatibility,
  decodeSignalCode,
  encodeSignalCode,
  encodeWireFrames,
  isSessionMessage,
  type DirectAnswerSignal,
  type DirectInviteSignal,
  type HelloAckMessage,
  type HelloMessage,
  type MultiplayerProtocolMessage,
  type RejectMessage,
  type SessionMessage,
} from './protocol';

export const DIRECT_CONNECT_CHANNEL_LABEL = 'frontier-command-direct-v1';
export const DEFAULT_ICE_GATHERING_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_BUFFERED_AMOUNT_BYTES = 8 * 1024 * 1024;
export const DEFAULT_REJOIN_GRACE_MS = 5 * 60_000;

/** Public STUN only: no account, credential or game server is required. */
export const DEFAULT_DIRECT_CONNECT_RTC_CONFIGURATION: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
  bundlePolicy: 'max-bundle',
};

export type DirectConnectState =
  | 'new'
  | 'gathering'
  | 'waiting-for-answer'
  | 'waiting-for-host'
  | 'connecting'
  | 'handshaking'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';

export type DirectConnectErrorCode =
  | 'webrtc-unavailable'
  | 'invalid-options'
  | 'capacity-reached'
  | 'invalid-code'
  | 'incompatible-protocol'
  | 'incompatible-rules'
  | 'unknown-invitation'
  | 'duplicate-peer'
  | 'ice-timeout'
  | 'connection-failed'
  | 'protocol-error'
  | 'not-connected'
  | 'backpressure'
  | 'send-failed'
  | 'closed';

export class DirectConnectError extends Error {
  readonly code: DirectConnectErrorCode;

  constructor(code: DirectConnectErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DirectConnectError';
    this.code = code;
  }
}

export type PeerConnectionFactory = (configuration: RTCConfiguration) => RTCPeerConnection;

export interface DirectPeerInfo {
  invitationId: string;
  peerId: string | null;
  displayName: string | null;
  state: DirectConnectState;
}

export interface DirectReconnectCredential {
  readonly sessionId: string;
  readonly peerId: string;
  readonly rejoinToken: string;
}

export interface DirectConnectStateEvent {
  peer: DirectPeerInfo;
  error?: DirectConnectError;
}

export interface DirectHostMessageEvent {
  peerId: string;
  invitationId: string;
  message: SessionMessage;
}

export interface DirectConnectHostHandlers {
  onStateChange?: (event: DirectConnectStateEvent) => void;
  onMessage?: (event: DirectHostMessageEvent) => void;
}

export interface DirectConnectGuestHandlers {
  onStateChange?: (event: DirectConnectStateEvent) => void;
  onMessage?: (message: SessionMessage) => void;
}

interface DirectConnectCommonOptions {
  rulesVersion: string;
  displayName: string;
  rtcConfiguration?: RTCConfiguration;
  peerConnectionFactory?: PeerConnectionFactory;
  iceGatheringTimeoutMs?: number;
  maxBufferedAmountBytes?: number;
}

export interface DirectConnectHostOptions extends DirectConnectCommonOptions, DirectConnectHostHandlers {
  maxPlayers?: number;
  roomId?: string;
  hostPeerId?: string;
  rejoinGraceMs?: number;
  now?: () => number;
  onStateChange?: (event: DirectConnectStateEvent) => void;
  onMessage?: (event: DirectHostMessageEvent) => void;
}

export interface DirectConnectGuestOptions extends DirectConnectCommonOptions, DirectConnectGuestHandlers {
  peerId?: string;
  resume?: DirectReconnectCredential;
  onStateChange?: (event: DirectConnectStateEvent) => void;
  onMessage?: (message: SessionMessage) => void;
}

export interface DirectInviteResult {
  invitationId: string;
  inviteCode: string;
}

export interface DirectGuestJoinResult {
  connection: DirectConnectGuest;
  answerCode: string;
}

interface NormalizedCommonOptions {
  rulesVersion: string;
  displayName: string;
  rtcConfiguration: RTCConfiguration;
  peerConnectionFactory: PeerConnectionFactory;
  iceGatheringTimeoutMs: number;
  maxBufferedAmountBytes: number;
}

interface HostPeerRecord {
  invitationId: string;
  peerId: string | null;
  displayName: string | null;
  state: DirectConnectState;
  pc: RTCPeerConnection;
  channel: RTCDataChannel;
  assembler: WireMessageAssembler;
  handshakeComplete: boolean;
  disposed: boolean;
  expectedPeerId: string | null;
}

interface DirectSeatReservation {
  credential: DirectReconnectCredential;
  connected: boolean;
  expiresAt: number | null;
}

function safeCallback(callback: (() => void) | undefined): void {
  if (!callback) return;
  try {
    callback();
  } catch (error) {
    console.error('Frontier Command Direct Connect callback failed.', error);
  }
}

function defaultPeerConnectionFactory(configuration: RTCConfiguration): RTCPeerConnection {
  if (typeof RTCPeerConnection === 'undefined') {
    throw new DirectConnectError('webrtc-unavailable', 'This browser does not support WebRTC Direct Connect.');
  }
  return new RTCPeerConnection(configuration);
}

function requireShortText(value: string, label: string, maxLength: number): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new DirectConnectError('invalid-options', `${label} must contain 1-${maxLength} characters.`);
  }
  return normalized;
}

function requireId(value: string, label: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(normalized)) {
    throw new DirectConnectError('invalid-options', `${label} must be an 8-128 character URL-safe ID.`);
  }
  return normalized;
}

function requirePositiveInteger(value: number, label: string, max: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new DirectConnectError('invalid-options', `${label} must be an integer from 1 through ${max}.`);
  }
  return value;
}

function randomId(prefix: string): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new DirectConnectError('webrtc-unavailable', 'Secure browser randomness is required for Direct Connect.');
  }
  const random = new Uint8Array(16);
  cryptoApi.getRandomValues(random);
  let suffix = '';
  for (const byte of random) suffix += byte.toString(16).padStart(2, '0');
  return `${prefix}_${suffix}`;
}

/**
 * Host-owned authentication for stable campaign seats. Tokens never enter the
 * lobby snapshot and are accepted exactly once per live transport.
 */
export class DirectReconnectSeatRegistry {
  readonly sessionId: string;
  readonly graceMs: number;

  private readonly reservations = new Map<string, DirectSeatReservation>();
  private readonly now: () => number;

  constructor(options: { sessionId?: string; graceMs?: number; now?: () => number } = {}) {
    this.sessionId = options.sessionId === undefined
      ? randomId('session')
      : requireId(options.sessionId, 'Session ID');
    this.graceMs = requirePositiveInteger(
      options.graceMs ?? DEFAULT_REJOIN_GRACE_MS,
      'Rejoin grace period',
      24 * 60 * 60_000,
    );
    this.now = options.now ?? Date.now;
  }

  get size(): number {
    this.releaseExpired();
    return this.reservations.size;
  }

  credential(peerId: string): DirectReconnectCredential | undefined {
    this.releaseExpired();
    const reservation = this.reservations.get(peerId);
    return reservation ? { ...reservation.credential } : undefined;
  }

  canRejoin(peerId: string): boolean {
    this.releaseExpired();
    const reservation = this.reservations.get(peerId);
    return Boolean(reservation && !reservation.connected);
  }

  accept(peerId: string, supplied?: DirectReconnectCredential): {
    credential: DirectReconnectCredential;
    rejoined: boolean;
  } {
    this.releaseExpired();
    const existing = this.reservations.get(peerId);
    if (!existing) {
      if (supplied) {
        throw new DirectConnectError('duplicate-peer', 'That campaign seat is no longer reserved.');
      }
      const credential = {
        sessionId: this.sessionId,
        peerId,
        rejoinToken: randomId('rejoin'),
      } satisfies DirectReconnectCredential;
      this.reservations.set(peerId, { credential, connected: true, expiresAt: null });
      return { credential: { ...credential }, rejoined: false };
    }
    if (existing.connected) {
      throw new DirectConnectError('duplicate-peer', 'That campaign seat is already connected.');
    }
    if (!supplied
      || supplied.sessionId !== this.sessionId
      || supplied.peerId !== peerId
      || supplied.rejoinToken !== existing.credential.rejoinToken) {
      throw new DirectConnectError('duplicate-peer', 'The rejoin token does not match that reserved campaign seat.');
    }
    existing.connected = true;
    existing.expiresAt = null;
    return { credential: { ...existing.credential }, rejoined: true };
  }

  disconnect(peerId: string): void {
    const reservation = this.reservations.get(peerId);
    if (!reservation || !reservation.connected) return;
    reservation.connected = false;
    reservation.expiresAt = this.now() + this.graceMs;
  }

  releaseExpired(now = this.now()): string[] {
    const released: string[] = [];
    for (const [peerId, reservation] of this.reservations) {
      if (!reservation.connected && reservation.expiresAt !== null && reservation.expiresAt <= now) {
        this.reservations.delete(peerId);
        released.push(peerId);
      }
    }
    return released;
  }

  clear(): void {
    this.reservations.clear();
  }
}

function normalizeCommonOptions(options: DirectConnectCommonOptions): NormalizedCommonOptions {
  const timeout = options.iceGatheringTimeoutMs ?? DEFAULT_ICE_GATHERING_TIMEOUT_MS;
  const maxBuffered = options.maxBufferedAmountBytes ?? DEFAULT_MAX_BUFFERED_AMOUNT_BYTES;
  return {
    rulesVersion: requireShortText(options.rulesVersion, 'Rules version', 160),
    displayName: requireShortText(options.displayName, 'Player name', 40),
    rtcConfiguration: options.rtcConfiguration ?? DEFAULT_DIRECT_CONNECT_RTC_CONFIGURATION,
    peerConnectionFactory: options.peerConnectionFactory ?? defaultPeerConnectionFactory,
    iceGatheringTimeoutMs: requirePositiveInteger(timeout, 'ICE gathering timeout', 120_000),
    maxBufferedAmountBytes: requirePositiveInteger(maxBuffered, 'Buffered data limit', 64 * 1024 * 1024),
  };
}

function directError(error: unknown, fallbackCode: DirectConnectErrorCode, fallbackMessage: string): DirectConnectError {
  if (error instanceof DirectConnectError) return error;
  if (error instanceof MultiplayerProtocolError) {
    const code: DirectConnectErrorCode = error.code === 'incompatible-protocol'
      ? 'incompatible-protocol'
      : error.code === 'incompatible-rules'
        ? 'incompatible-rules'
        : error.code === 'invalid-signal'
          ? 'invalid-code'
          : 'protocol-error';
    return new DirectConnectError(code, error.message, { cause: error });
  }
  return new DirectConnectError(fallbackCode, fallbackMessage, { cause: error });
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function ensureReliableOrderedChannel(channel: RTCDataChannel): void {
  if (
    channel.label !== DIRECT_CONNECT_CHANNEL_LABEL
    || !channel.ordered
    || channel.maxPacketLifeTime != null
    || channel.maxRetransmits != null
  ) {
    throw new DirectConnectError(
      'protocol-error',
      'The remote player offered an unexpected or unreliable data channel.',
    );
  }
}

function sendFrames(
  channel: RTCDataChannel,
  frames: readonly string[],
  maxBufferedAmountBytes: number,
): void {
  if (channel.readyState !== 'open') {
    throw new DirectConnectError('not-connected', 'The Direct Connect data channel is not open.');
  }
  const totalBytes = frames.reduce((sum, frame) => sum + byteLength(frame), 0);
  if (channel.bufferedAmount + totalBytes > maxBufferedAmountBytes) {
    throw new DirectConnectError(
      'backpressure',
      'The connection is temporarily saturated. Wait for pending multiplayer data before sending more.',
    );
  }
  try {
    for (const frame of frames) channel.send(frame);
  } catch (error) {
    throw new DirectConnectError('send-failed', 'The multiplayer message could not be sent.', { cause: error });
  }
}

function channelFrames(message: MultiplayerProtocolMessage): string[] {
  return encodeWireFrames(message, randomId('msg'));
}

export function waitForIceGatheringComplete(
  peerConnection: RTCPeerConnection,
  timeoutMs = DEFAULT_ICE_GATHERING_TIMEOUT_MS,
): Promise<void> {
  if (peerConnection.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: DirectConnectError): void => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeoutId);
      peerConnection.removeEventListener('icegatheringstatechange', onGatheringChange);
      peerConnection.removeEventListener('connectionstatechange', onConnectionChange);
      if (error) reject(error);
      else resolve();
    };
    const onGatheringChange = (): void => {
      if (peerConnection.iceGatheringState === 'complete') finish();
    };
    const onConnectionChange = (): void => {
      if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'closed') {
        finish(new DirectConnectError('connection-failed', 'The peer connection closed while gathering network candidates.'));
      }
    };
    const timeoutId = globalThis.setTimeout(() => {
      finish(new DirectConnectError(
        'ice-timeout',
        'Network candidate gathering timed out. Check the connection and create a fresh Direct Connect code.',
      ));
    }, timeoutMs);
    peerConnection.addEventListener('icegatheringstatechange', onGatheringChange);
    peerConnection.addEventListener('connectionstatechange', onConnectionChange);
    onGatheringChange();
  });
}

function localDescription(
  peerConnection: RTCPeerConnection,
  expectedType: 'offer' | 'answer',
): RTCSessionDescriptionInit & { type: 'offer' | 'answer'; sdp: string } {
  const description = peerConnection.localDescription;
  if (!description || description.type !== expectedType || typeof description.sdp !== 'string' || description.sdp.length === 0) {
    throw new DirectConnectError('connection-failed', `The browser did not produce a complete ${expectedType}.`);
  }
  return { type: expectedType, sdp: description.sdp };
}

export class DirectConnectHost {
  readonly roomId: string;
  readonly hostPeerId: string;
  readonly rulesVersion: string;
  readonly displayName: string;
  readonly maxPlayers: number;
  readonly reconnectSeats: DirectReconnectSeatRegistry;

  private readonly normalized: NormalizedCommonOptions;
  private readonly stateListeners = new Set<(event: DirectConnectStateEvent) => void>();
  private readonly messageListeners = new Set<(event: DirectHostMessageEvent) => void>();
  private readonly peerRecords = new Map<string, HostPeerRecord>();
  private closed = false;

  constructor(options: DirectConnectHostOptions) {
    this.normalized = normalizeCommonOptions(options);
    this.rulesVersion = this.normalized.rulesVersion;
    this.displayName = this.normalized.displayName;
    this.maxPlayers = requirePositiveInteger(options.maxPlayers ?? MAX_MULTIPLAYER_PLAYERS, 'Maximum players', MAX_MULTIPLAYER_PLAYERS);
    if (this.maxPlayers < MIN_MULTIPLAYER_PLAYERS) {
      throw new DirectConnectError('invalid-options', `Maximum players must be at least ${MIN_MULTIPLAYER_PLAYERS}.`);
    }
    this.roomId = options.roomId === undefined ? randomId('room') : requireId(options.roomId, 'Room ID');
    this.hostPeerId = options.hostPeerId === undefined ? randomId('host') : requireId(options.hostPeerId, 'Host peer ID');
    this.reconnectSeats = new DirectReconnectSeatRegistry({
      graceMs: options.rejoinGraceMs,
      now: options.now,
    });
    if (options.onStateChange) this.stateListeners.add(options.onStateChange);
    if (options.onMessage) this.messageListeners.add(options.onMessage);
  }

  listPeers(): DirectPeerInfo[] {
    return [...this.peerRecords.values()].map((record) => this.peerInfo(record));
  }

  /** Multiple lobby/game-session listeners may coexist; unsubscribe during ownership transfer. */
  subscribe(handlers: DirectConnectHostHandlers): () => void {
    if (handlers.onStateChange) this.stateListeners.add(handlers.onStateChange);
    if (handlers.onMessage) this.messageListeners.add(handlers.onMessage);
    return () => {
      if (handlers.onStateChange) this.stateListeners.delete(handlers.onStateChange);
      if (handlers.onMessage) this.messageListeners.delete(handlers.onMessage);
    };
  }

  async createInvite(): Promise<DirectInviteResult> {
    return this.createInviteForPeer(null);
  }

  /** Creates a fresh route that may authenticate only as the reserved seat. */
  async createReconnectInvite(peerId: string): Promise<DirectInviteResult> {
    const normalizedPeerId = requireId(peerId, 'Guest peer ID');
    if (!this.reconnectSeats.canRejoin(normalizedPeerId)) {
      throw new DirectConnectError('unknown-invitation', 'That campaign seat is not waiting to reconnect.');
    }
    return this.createInviteForPeer(normalizedPeerId);
  }

  /** Ends a stale route while retaining its authenticated campaign seat. */
  prepareReconnect(peerId: string): boolean {
    const record = [...this.peerRecords.values()].find((candidate) => candidate.peerId === peerId);
    if (!record) return this.reconnectSeats.canRejoin(peerId);
    this.disposePeer(record, 'closed');
    return true;
  }

  releaseExpiredReconnectSeats(now?: number): string[] {
    return this.reconnectSeats.releaseExpired(now);
  }

  private async createInviteForPeer(expectedPeerId: string | null): Promise<DirectInviteResult> {
    this.assertOpen();
    const pendingOpenInvitations = [...this.peerRecords.values()]
      .filter((record) => record.peerId === null).length;
    if (expectedPeerId === null
      && this.reconnectSeats.size + pendingOpenInvitations >= this.maxPlayers - 1) {
      throw new DirectConnectError('capacity-reached', `This room already has ${this.maxPlayers} reserved player slots.`);
    }

    const invitationId = randomId('invite');
    let pc: RTCPeerConnection;
    try {
      pc = this.normalized.peerConnectionFactory(this.normalized.rtcConfiguration);
    } catch (error) {
      throw directError(error, 'webrtc-unavailable', 'The browser could not create a WebRTC peer connection.');
    }
    let channel: RTCDataChannel;
    try {
      channel = pc.createDataChannel(DIRECT_CONNECT_CHANNEL_LABEL, { ordered: true });
      ensureReliableOrderedChannel(channel);
    } catch (error) {
      pc.close();
      throw directError(error, 'connection-failed', 'The browser could not create a reliable game data channel.');
    }
    const record: HostPeerRecord = {
      invitationId,
      peerId: null,
      displayName: null,
      state: 'new',
      pc,
      channel,
      assembler: new WireMessageAssembler(),
      handshakeComplete: false,
      disposed: false,
      expectedPeerId,
    };
    this.peerRecords.set(invitationId, record);
    this.attachPeer(record);
    this.setPeerState(record, 'gathering');

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGatheringComplete(pc, this.normalized.iceGatheringTimeoutMs);
      const signal: DirectInviteSignal = {
        kind: 'direct-invite',
        protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
        rulesVersion: this.rulesVersion,
        roomId: this.roomId,
        invitationId,
        hostPeerId: this.hostPeerId,
        hostName: this.displayName,
        description: localDescription(pc, 'offer') as DirectInviteSignal['description'],
      };
      const inviteCode = encodeSignalCode(signal);
      this.setPeerState(record, 'waiting-for-answer');
      return { invitationId, inviteCode };
    } catch (error) {
      const normalized = directError(error, 'connection-failed', 'The Direct Connect invite could not be created.');
      this.disposePeer(record, 'failed', normalized);
      throw normalized;
    }
  }

  async acceptAnswer(answerCode: string): Promise<DirectPeerInfo> {
    this.assertOpen();
    let signal;
    try {
      signal = decodeSignalCode(answerCode);
      if (signal.kind !== 'direct-answer') {
        throw new DirectConnectError('invalid-code', 'The pasted code is an invite, not a friend answer.');
      }
      assertSignalCompatibility(signal, this.rulesVersion, { roomId: this.roomId });
    } catch (error) {
      throw directError(error, 'invalid-code', 'The friend answer code is invalid.');
    }

    const record = this.peerRecords.get(signal.invitationId);
    if (!record || record.disposed) {
      throw new DirectConnectError('unknown-invitation', 'This answer does not match an active invitation.');
    }
    if (record.state !== 'waiting-for-answer') {
      throw new DirectConnectError('invalid-code', 'This invitation already has an answer or is no longer active.');
    }
    if (record.expectedPeerId !== null && record.expectedPeerId !== signal.guestPeerId) {
      throw new DirectConnectError('duplicate-peer', 'This reconnect route belongs to another campaign seat.');
    }
    if ([...this.peerRecords.values()].some((other) => other !== record && other.peerId === signal.guestPeerId)) {
      throw new DirectConnectError('duplicate-peer', 'That friend is already connected to this room.');
    }
    record.peerId = signal.guestPeerId;
    record.displayName = signal.guestName;
    this.setPeerState(record, 'connecting');
    try {
      await record.pc.setRemoteDescription(signal.description);
      return this.peerInfo(record);
    } catch (error) {
      const normalized = directError(error, 'connection-failed', 'The browser rejected the friend answer.');
      this.disposePeer(record, 'failed', normalized);
      throw normalized;
    }
  }

  send(peerId: string, message: SessionMessage): void {
    this.assertOpen();
    const record = [...this.peerRecords.values()].find((candidate) => candidate.peerId === peerId);
    if (!record || !record.handshakeComplete || record.state !== 'connected') {
      throw new DirectConnectError('not-connected', 'That player is not connected.');
    }
    const frames = channelFrames(message);
    try {
      sendFrames(record.channel, frames, this.normalized.maxBufferedAmountBytes);
    } catch (error) {
      const normalized = directError(error, 'send-failed', 'The multiplayer message could not be sent.');
      if (normalized.code !== 'backpressure') this.disposePeer(record, 'failed', normalized);
      throw normalized;
    }
  }

  broadcast(message: SessionMessage): number {
    this.assertOpen();
    const frames = channelFrames(message);
    const targets = [...this.peerRecords.values()]
      .filter((record) => record.handshakeComplete && record.state === 'connected');
    const totalBytes = frames.reduce((sum, frame) => sum + byteLength(frame), 0);
    for (const record of targets) {
      if (record.channel.readyState !== 'open') {
        throw new DirectConnectError('not-connected', `Player ${record.displayName ?? record.peerId ?? 'unknown'} is not connected.`);
      }
      if (record.channel.bufferedAmount + totalBytes > this.normalized.maxBufferedAmountBytes) {
        throw new DirectConnectError(
          'backpressure',
          `Player ${record.displayName ?? record.peerId ?? 'unknown'} is still receiving earlier multiplayer data.`,
        );
      }
    }
    let sent = 0;
    let firstError: DirectConnectError | undefined;
    for (const record of targets) {
      try {
        sendFrames(record.channel, frames, this.normalized.maxBufferedAmountBytes);
        sent += 1;
      } catch (error) {
        const normalized = directError(error, 'send-failed', 'The multiplayer broadcast could not be sent.');
        if (normalized.code !== 'backpressure') this.disposePeer(record, 'failed', normalized);
        firstError ??= normalized;
      }
    }
    if (firstError) throw firstError;
    return sent;
  }

  disconnect(peerIdOrInvitationId: string): boolean {
    const record = this.peerRecords.get(peerIdOrInvitationId)
      ?? [...this.peerRecords.values()].find((candidate) => candidate.peerId === peerIdOrInvitationId);
    if (!record) return false;
    this.disposePeer(record, 'closed');
    return true;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const record of [...this.peerRecords.values()]) this.disposePeer(record, 'closed');
    this.reconnectSeats.clear();
    this.stateListeners.clear();
    this.messageListeners.clear();
  }

  private assertOpen(): void {
    if (this.closed) throw new DirectConnectError('closed', 'This Direct Connect host is closed.');
  }

  private peerInfo(record: HostPeerRecord): DirectPeerInfo {
    return {
      invitationId: record.invitationId,
      peerId: record.peerId,
      displayName: record.displayName,
      state: record.state,
    };
  }

  private setPeerState(record: HostPeerRecord, state: DirectConnectState, error?: DirectConnectError): void {
    if (record.disposed || (record.state === state && error === undefined)) return;
    record.state = state;
    const event = { peer: this.peerInfo(record), ...(error ? { error } : {}) };
    for (const listener of this.stateListeners) safeCallback(() => listener(event));
  }

  private attachPeer(record: HostPeerRecord): void {
    const { pc, channel } = record;
    channel.addEventListener('open', () => {
      if (!record.disposed) this.setPeerState(record, 'handshaking');
    });
    channel.addEventListener('message', (event) => {
      if (record.disposed) return;
      if (typeof event.data !== 'string') {
        this.rejectPeer(record, 'binary-message', 'Only framed text messages are supported.');
        return;
      }
      try {
        const message = record.assembler.accept(event.data);
        if (message) this.handlePeerMessage(record, message);
      } catch (error) {
        const normalized = directError(error, 'protocol-error', 'The remote player sent an invalid multiplayer message.');
        this.rejectPeer(record, normalized.code, normalized.message);
      }
    });
    channel.addEventListener('close', () => {
      if (!record.disposed) this.disposePeer(record, 'closed');
    });
    channel.addEventListener('error', () => {
      if (!record.disposed) {
        this.disposePeer(record, 'failed', new DirectConnectError('connection-failed', 'The player data channel failed.'));
      }
    });
    pc.addEventListener('connectionstatechange', () => {
      if (record.disposed) return;
      // Chromium may report `connecting` while an offer is still waiting for
      // its manually exchanged answer.  That transport-level signal must not
      // consume the invitation state: acceptAnswer still needs to match it.
      if (!record.peerId) return;
      switch (pc.connectionState) {
        case 'connected':
          this.setPeerState(record, record.handshakeComplete ? 'connected' : 'handshaking');
          break;
        case 'connecting':
          if (!record.handshakeComplete) this.setPeerState(record, 'connecting');
          break;
        case 'disconnected':
          this.setPeerState(record, 'disconnected');
          break;
        case 'failed':
          this.disposePeer(record, 'failed', new DirectConnectError(
            'connection-failed',
            'The peer-to-peer route failed. A restrictive network may require another connection.',
          ));
          break;
        case 'closed':
          this.disposePeer(record, 'closed');
          break;
        default:
          break;
      }
    });
  }

  private handlePeerMessage(record: HostPeerRecord, message: MultiplayerProtocolMessage): void {
    if (!record.handshakeComplete) {
      if (message.type !== 'hello') {
        this.rejectPeer(record, 'handshake-required', 'A hello handshake is required before game messages.');
        return;
      }
      this.acceptHello(record, message);
      return;
    }
    if (!isSessionMessage(message)) {
      this.rejectPeer(record, 'duplicate-handshake', 'Handshake messages are not allowed after connecting.');
      return;
    }
    if (!record.peerId) {
      this.rejectPeer(record, 'missing-peer', 'The connected player has no peer identity.');
      return;
    }
    const event = {
      peerId: record.peerId!,
      invitationId: record.invitationId,
      message,
    };
    for (const listener of this.messageListeners) safeCallback(() => listener(event));
  }

  private acceptHello(record: HostPeerRecord, message: HelloMessage): void {
    if (
      message.protocolVersion !== MULTIPLAYER_PROTOCOL_VERSION
      || message.rulesVersion !== this.rulesVersion
      || message.roomId !== this.roomId
      || message.invitationId !== record.invitationId
      || (record.peerId !== null && message.peerId !== record.peerId)
      || (record.expectedPeerId !== null && message.peerId !== record.expectedPeerId)
    ) {
      this.rejectPeer(record, 'incompatible-handshake', 'The player handshake does not match this room invitation.');
      return;
    }
    if ([...this.peerRecords.values()].some((other) => other !== record && other.handshakeComplete && other.peerId === message.peerId)) {
      this.rejectPeer(record, 'duplicate-peer', 'That player is already connected.');
      return;
    }
    let seat;
    try {
      seat = this.reconnectSeats.accept(message.peerId, message.sessionId && message.rejoinToken ? {
        sessionId: message.sessionId,
        peerId: message.peerId,
        rejoinToken: message.rejoinToken,
      } : undefined);
    } catch (error) {
      const normalized = directError(error, 'duplicate-peer', 'That campaign seat could not be reclaimed.');
      this.rejectPeer(record, normalized.code, normalized.message);
      return;
    }
    record.peerId = message.peerId;
    record.displayName = message.displayName;
    const acknowledgement: HelloAckMessage = {
      type: 'hello-ack',
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      rulesVersion: this.rulesVersion,
      roomId: this.roomId,
      invitationId: record.invitationId,
      hostPeerId: this.hostPeerId,
      acceptedPeerId: message.peerId,
      maxPlayers: this.maxPlayers,
      sessionId: seat.credential.sessionId,
      rejoinToken: seat.credential.rejoinToken,
      rejoined: seat.rejoined,
    };
    try {
      sendFrames(record.channel, channelFrames(acknowledgement), this.normalized.maxBufferedAmountBytes);
      record.handshakeComplete = true;
      this.setPeerState(record, 'connected');
    } catch (error) {
      this.reconnectSeats.disconnect(message.peerId);
      this.disposePeer(record, 'failed', directError(error, 'send-failed', 'The handshake reply could not be sent.'));
    }
  }

  private rejectPeer(record: HostPeerRecord, code: string, message: string): void {
    const error = new DirectConnectError('protocol-error', message);
    const rejection: RejectMessage = {
      type: 'reject',
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      code: code.slice(0, 80) || 'rejected',
      message: message.slice(0, 300) || 'Connection rejected.',
    };
    try {
      if (record.channel.readyState === 'open') {
        sendFrames(record.channel, channelFrames(rejection), this.normalized.maxBufferedAmountBytes);
      }
    } catch {
      // The original protocol failure is more useful than a secondary rejection-send failure.
    }
    this.disposePeer(record, 'failed', error, 75);
  }

  private disposePeer(
    record: HostPeerRecord,
    state: 'failed' | 'closed',
    error?: DirectConnectError,
    closeDelayMs = 0,
  ): void {
    if (record.disposed) return;
    record.state = state;
    if (record.handshakeComplete && record.peerId) this.reconnectSeats.disconnect(record.peerId);
    const event = { peer: this.peerInfo(record), ...(error ? { error } : {}) };
    for (const listener of this.stateListeners) safeCallback(() => listener(event));
    record.disposed = true;
    record.assembler.clear();
    this.peerRecords.delete(record.invitationId);
    const close = (): void => {
      try {
        record.channel.close();
      } catch {
        // Already closed.
      }
      try {
        record.pc.close();
      } catch {
        // Already closed.
      }
    };
    if (closeDelayMs > 0) globalThis.setTimeout(close, closeDelayMs);
    else close();
  }
}

export class DirectConnectGuest {
  readonly roomId: string;
  readonly invitationId: string;
  readonly hostPeerId: string;
  readonly hostName: string;
  readonly peerId: string;
  readonly rulesVersion: string;
  readonly displayName: string;

  private resumeCredential?: DirectReconnectCredential;

  private readonly normalized: NormalizedCommonOptions;
  private readonly pc: RTCPeerConnection;
  private readonly stateListeners = new Set<(event: DirectConnectStateEvent) => void>();
  private readonly messageListeners = new Set<(message: SessionMessage) => void>();
  private readonly assembler = new WireMessageAssembler();
  private channel: RTCDataChannel | null = null;
  private currentState: DirectConnectState = 'new';
  private handshakeComplete = false;
  private disposed = false;

  private constructor(
    invite: DirectInviteSignal,
    options: DirectConnectGuestOptions,
    normalized: NormalizedCommonOptions,
    pc: RTCPeerConnection,
  ) {
    this.roomId = invite.roomId;
    this.invitationId = invite.invitationId;
    this.hostPeerId = invite.hostPeerId;
    this.hostName = invite.hostName;
    if (options.resume && options.peerId && options.resume.peerId !== options.peerId) {
      throw new DirectConnectError('invalid-options', 'The guest peer ID does not match the reserved campaign seat.');
    }
    this.peerId = options.resume
      ? requireId(options.resume.peerId, 'Guest peer ID')
      : options.peerId === undefined ? randomId('guest') : requireId(options.peerId, 'Guest peer ID');
    if (options.resume) {
      this.resumeCredential = {
        sessionId: requireId(options.resume.sessionId, 'Session ID'),
        peerId: this.peerId,
        rejoinToken: requireId(options.resume.rejoinToken, 'Rejoin token'),
      };
    }
    this.rulesVersion = normalized.rulesVersion;
    this.displayName = normalized.displayName;
    this.normalized = normalized;
    this.pc = pc;
    if (options.onStateChange) this.stateListeners.add(options.onStateChange);
    if (options.onMessage) this.messageListeners.add(options.onMessage);
    this.attachPeerConnection();
  }

  static async acceptInvite(inviteCode: string, options: DirectConnectGuestOptions): Promise<DirectGuestJoinResult> {
    const normalized = normalizeCommonOptions(options);
    let invite: DirectInviteSignal;
    try {
      const signal = decodeSignalCode(inviteCode);
      if (signal.kind !== 'direct-invite') {
        throw new DirectConnectError('invalid-code', 'The pasted code is a friend answer, not a host invite.');
      }
      assertSignalCompatibility(signal, normalized.rulesVersion);
      invite = signal;
    } catch (error) {
      throw directError(error, 'invalid-code', 'The host invite code is invalid.');
    }

    let pc: RTCPeerConnection;
    try {
      pc = normalized.peerConnectionFactory(normalized.rtcConfiguration);
    } catch (error) {
      throw directError(error, 'webrtc-unavailable', 'The browser could not create a WebRTC peer connection.');
    }
    let guest: DirectConnectGuest;
    try {
      guest = new DirectConnectGuest(invite, options, normalized, pc);
    } catch (error) {
      pc.close();
      throw directError(error, 'invalid-options', 'The guest connection could not be initialized.');
    }
    guest.setState('gathering');
    try {
      await pc.setRemoteDescription(invite.description);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await waitForIceGatheringComplete(pc, normalized.iceGatheringTimeoutMs);
      const signal: DirectAnswerSignal = {
        kind: 'direct-answer',
        protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
        rulesVersion: normalized.rulesVersion,
        roomId: invite.roomId,
        invitationId: invite.invitationId,
        guestPeerId: guest.peerId,
        guestName: guest.displayName,
        description: localDescription(pc, 'answer') as DirectAnswerSignal['description'],
      };
      const answerCode = encodeSignalCode(signal);
      if (!guest.handshakeComplete && guest.currentState !== 'connecting' && guest.currentState !== 'handshaking') {
        guest.setState('waiting-for-host');
      }
      return { connection: guest, answerCode };
    } catch (error) {
      const normalizedError = directError(error, 'connection-failed', 'The Direct Connect answer could not be created.');
      guest.fail(normalizedError);
      throw normalizedError;
    }
  }

  get state(): DirectConnectState {
    return this.currentState;
  }

  get reconnectCredential(): DirectReconnectCredential | undefined {
    return this.resumeCredential ? { ...this.resumeCredential } : undefined;
  }

  /** Lets the lobby hand the live peer connection to the game session without reconnecting. */
  subscribe(handlers: DirectConnectGuestHandlers): () => void {
    if (handlers.onStateChange) this.stateListeners.add(handlers.onStateChange);
    if (handlers.onMessage) this.messageListeners.add(handlers.onMessage);
    return () => {
      if (handlers.onStateChange) this.stateListeners.delete(handlers.onStateChange);
      if (handlers.onMessage) this.messageListeners.delete(handlers.onMessage);
    };
  }

  send(message: SessionMessage): void {
    if (this.disposed) throw new DirectConnectError('closed', 'This Direct Connect guest is closed.');
    if (!this.handshakeComplete || this.currentState !== 'connected' || !this.channel) {
      throw new DirectConnectError('not-connected', 'The host connection is not ready.');
    }
    try {
      sendFrames(this.channel, channelFrames(message), this.normalized.maxBufferedAmountBytes);
    } catch (error) {
      const normalized = directError(error, 'send-failed', 'The multiplayer message could not be sent.');
      if (normalized.code !== 'backpressure') this.fail(normalized);
      throw normalized;
    }
  }

  close(): void {
    this.dispose('closed');
  }

  private peerInfo(): DirectPeerInfo {
    return {
      invitationId: this.invitationId,
      peerId: this.hostPeerId,
      displayName: this.hostName,
      state: this.currentState,
    };
  }

  private setState(state: DirectConnectState, error?: DirectConnectError): void {
    if (this.disposed || (this.currentState === state && error === undefined)) return;
    this.currentState = state;
    const event = { peer: this.peerInfo(), ...(error ? { error } : {}) };
    for (const listener of this.stateListeners) safeCallback(() => listener(event));
  }

  private attachPeerConnection(): void {
    this.pc.addEventListener('datachannel', (event) => {
      if (this.disposed) {
        event.channel.close();
        return;
      }
      if (this.channel !== null) {
        event.channel.close();
        this.fail(new DirectConnectError('protocol-error', 'The host opened more than one game data channel.'));
        return;
      }
      try {
        ensureReliableOrderedChannel(event.channel);
        this.channel = event.channel;
        this.attachDataChannel(event.channel);
      } catch (error) {
        event.channel.close();
        this.fail(directError(error, 'protocol-error', 'The host opened an invalid data channel.'));
      }
    });
    this.pc.addEventListener('connectionstatechange', () => {
      if (this.disposed) return;
      switch (this.pc.connectionState) {
        case 'connected':
          this.setState(this.handshakeComplete ? 'connected' : 'handshaking');
          break;
        case 'connecting':
          if (!this.handshakeComplete) this.setState('connecting');
          break;
        case 'disconnected':
          this.setState('disconnected');
          break;
        case 'failed':
          this.fail(new DirectConnectError(
            'connection-failed',
            'The peer-to-peer route failed. A restrictive network may require another connection.',
          ));
          break;
        case 'closed':
          this.dispose('closed');
          break;
        default:
          break;
      }
    });
  }

  private attachDataChannel(channel: RTCDataChannel): void {
    channel.addEventListener('open', () => {
      if (this.disposed) return;
      this.setState('handshaking');
      const hello: HelloMessage = {
        type: 'hello',
        protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
        rulesVersion: this.rulesVersion,
        roomId: this.roomId,
        invitationId: this.invitationId,
        peerId: this.peerId,
        displayName: this.displayName,
        role: 'guest',
        ...(this.resumeCredential ? {
          sessionId: this.resumeCredential.sessionId,
          rejoinToken: this.resumeCredential.rejoinToken,
        } : {}),
      };
      try {
        sendFrames(channel, channelFrames(hello), this.normalized.maxBufferedAmountBytes);
      } catch (error) {
        this.fail(directError(error, 'send-failed', 'The guest handshake could not be sent.'));
      }
    });
    channel.addEventListener('message', (event) => {
      if (this.disposed) return;
      if (typeof event.data !== 'string') {
        this.fail(new DirectConnectError('protocol-error', 'The host sent an unsupported binary message.'));
        return;
      }
      try {
        const message = this.assembler.accept(event.data);
        if (message) this.handleHostMessage(message);
      } catch (error) {
        this.fail(directError(error, 'protocol-error', 'The host sent an invalid multiplayer message.'));
      }
    });
    channel.addEventListener('close', () => {
      if (!this.disposed) this.dispose('closed');
    });
    channel.addEventListener('error', () => {
      if (!this.disposed) this.fail(new DirectConnectError('connection-failed', 'The host data channel failed.'));
    });
  }

  private handleHostMessage(message: MultiplayerProtocolMessage): void {
    if (!this.handshakeComplete) {
      if (message.type === 'reject') {
        this.fail(new DirectConnectError('protocol-error', `Host rejected the connection: ${message.message}`));
        return;
      }
      if (message.type !== 'hello-ack') {
        this.fail(new DirectConnectError('protocol-error', 'The host must acknowledge the handshake before game messages.'));
        return;
      }
      this.acceptHelloAck(message);
      return;
    }
    if (!isSessionMessage(message)) {
      this.fail(new DirectConnectError('protocol-error', 'Unexpected handshake message after connecting.'));
      return;
    }
    for (const listener of this.messageListeners) safeCallback(() => listener(message));
  }

  private acceptHelloAck(message: HelloAckMessage): void {
    if (
      message.protocolVersion !== MULTIPLAYER_PROTOCOL_VERSION
      || message.rulesVersion !== this.rulesVersion
      || message.roomId !== this.roomId
      || message.invitationId !== this.invitationId
      || message.hostPeerId !== this.hostPeerId
      || message.acceptedPeerId !== this.peerId
      || !message.sessionId
      || !message.rejoinToken
    ) {
      this.fail(new DirectConnectError('protocol-error', 'The host handshake does not match this invitation.'));
      return;
    }
    if (this.resumeCredential && (
      message.sessionId !== this.resumeCredential.sessionId
      || message.rejoinToken !== this.resumeCredential.rejoinToken
      || message.rejoined !== true
    )) {
      this.fail(new DirectConnectError('protocol-error', 'The host did not reclaim the reserved campaign seat.'));
      return;
    }
    this.resumeCredential = {
      sessionId: message.sessionId,
      peerId: this.peerId,
      rejoinToken: message.rejoinToken,
    };
    this.handshakeComplete = true;
    this.setState('connected');
  }

  private fail(error: DirectConnectError): void {
    this.dispose('failed', error);
  }

  private dispose(state: 'failed' | 'closed', error?: DirectConnectError): void {
    if (this.disposed) return;
    this.currentState = state;
    const event = { peer: this.peerInfo(), ...(error ? { error } : {}) };
    for (const listener of this.stateListeners) safeCallback(() => listener(event));
    this.disposed = true;
    this.assembler.clear();
    try {
      this.channel?.close();
    } catch {
      // Already closed.
    }
    try {
      this.pc.close();
    } catch {
      // Already closed.
    }
    this.stateListeners.clear();
    this.messageListeners.clear();
  }
}
