import { describe, expect, it } from 'vitest';
import type { SaveGameV2 } from '../sim/v2/persistence';
import { WorldEngineV2 } from '../sim/v2/WorldEngineV2';
import type {
  CommandResultV2,
  PlayerId,
  WorldChangeV2,
  WorldCommandV2,
  WorldSpeedV2,
  WorldStateV2,
} from '../sim/v2/types';
import type { WorldContentV2 } from '../sim/v2/content';
import type {
  DirectConnectGuestHandlers,
  DirectConnectHostHandlers,
  DirectConnectState,
  DirectPeerInfo,
} from './directConnect';
import {
  CANONICAL_HASH_INTERVAL_TICKS,
  GuestGameSession,
  HostGameSession,
  RESYNC_REQUEST_COOLDOWN_TICKS,
  type GameSessionEngineV2,
  type GuestSessionTransport,
  type HostSessionTransport,
} from './gameSession';
import type { SessionMessage, SnapshotMessage, TickMessage } from './protocol';

class LoopbackHostTransport implements HostSessionTransport {
  readonly hostPeerId = 'host_12345678';
  readonly hostToGuest: Array<{ peerId: string; message: SessionMessage }> = [];
  readonly sendAttempts: Array<{ peerId: string; message: SessionMessage }> = [];
  readonly guestToHost: Array<{ peerId: string; message: SessionMessage }> = [];
  private readonly handlers = new Set<DirectConnectHostHandlers>();
  private readonly guests = new Map<string, LoopbackGuestTransport>();
  private readonly failingPeers = new Set<string>();

  connectGuest(peerId: string): LoopbackGuestTransport {
    const guest = new LoopbackGuestTransport(peerId, this);
    this.guests.set(peerId, guest);
    return guest;
  }

  listPeers(): DirectPeerInfo[] {
    return [...this.guests].map(([peerId, guest]) => ({
      invitationId: `invite_${peerId}`,
      peerId,
      displayName: 'Friend',
      state: guest.state,
    }));
  }

  subscribe(handlers: DirectConnectHostHandlers): () => void {
    this.handlers.add(handlers);
    return () => this.handlers.delete(handlers);
  }

  send(peerId: string, message: SessionMessage): void {
    this.sendAttempts.push({ peerId, message });
    const guest = this.guests.get(peerId);
    if (!guest || guest.state !== 'connected' || this.failingPeers.has(peerId)) {
      throw new Error(`Peer ${peerId} is unavailable.`);
    }
    this.hostToGuest.push({ peerId, message });
    guest.deliver(message);
  }

  broadcast(message: SessionMessage): number {
    for (const peerId of this.guests.keys()) this.send(peerId, message);
    return this.guests.size;
  }

  receive(peerId: string, message: SessionMessage): void {
    this.guestToHost.push({ peerId, message });
    for (const handlers of this.handlers) handlers.onMessage?.({
      peerId,
      invitationId: `invite_${peerId}`,
      message,
    });
  }

  failPeer(peerId: string): void {
    this.failingPeers.add(peerId);
  }

  restorePeer(peerId: string): void {
    this.failingPeers.delete(peerId);
  }

  notifyGuestState(guest: LoopbackGuestTransport): void {
    for (const handlers of this.handlers) handlers.onStateChange?.({
      peer: {
        invitationId: `invite_${guest.peerId}`,
        peerId: guest.peerId,
        displayName: 'Friend',
        state: guest.state,
      },
    });
  }

  close(): void {
    for (const guest of this.guests.values()) guest.close();
    this.handlers.clear();
  }
}

class LoopbackGuestTransport implements GuestSessionTransport {
  readonly hostPeerId: string;
  state: DirectConnectState = 'connected';
  private readonly handlers = new Set<DirectConnectGuestHandlers>();

  constructor(readonly peerId: string, private readonly host: LoopbackHostTransport) {
    this.hostPeerId = host.hostPeerId;
  }

  subscribe(handlers: DirectConnectGuestHandlers): () => void {
    this.handlers.add(handlers);
    return () => this.handlers.delete(handlers);
  }

  send(message: SessionMessage): void {
    this.host.receive(this.peerId, message);
  }

  deliver(message: SessionMessage): void {
    for (const handlers of this.handlers) handlers.onMessage?.(message);
  }

  setState(state: DirectConnectState): void {
    this.state = state;
    const event = {
      peer: {
        invitationId: `invite_${this.peerId}`,
        peerId: this.hostPeerId,
        displayName: 'Host',
        state,
      },
    };
    for (const handlers of this.handlers) handlers.onStateChange?.(event);
    this.host.notifyGuestState(this);
  }

  close(): void {
    this.state = 'closed';
    for (const handlers of this.handlers) handlers.onStateChange?.({
      peer: {
        invitationId: `invite_${this.peerId}`,
        peerId: this.hostPeerId,
        displayName: 'Host',
        state: 'closed',
      },
    });
    this.handlers.clear();
  }
}

function secondLivingCountry(engine: WorldEngineV2): PlayerId {
  const result = (Object.keys(engine.state.players) as PlayerId[])
    .find((countryId) => countryId !== engine.state.humanPlayerId);
  if (!result) throw new Error('The fixture needs a second country.');
  return result;
}

function createRealLoopback(seed = 919): {
  engine: WorldEngineV2;
  hostSession: HostGameSession;
  guestSession: GuestGameSession;
  hostTransport: LoopbackHostTransport;
  guestTransport: LoopbackGuestTransport;
  hostCountryId: PlayerId;
  guestCountryId: PlayerId;
} {
  const engine = new WorldEngineV2(seed);
  const hostCountryId = engine.state.humanPlayerId;
  const guestCountryId = secondLivingCountry(engine);
  const hostTransport = new LoopbackHostTransport();
  const guestTransport = hostTransport.connectGuest('guest_12345678');
  const hostSession = new HostGameSession({
    engine,
    transport: hostTransport,
    seats: new Map([
      [hostTransport.hostPeerId, hostCountryId],
      [guestTransport.peerId, guestCountryId],
    ]),
  });
  const guestSession = new GuestGameSession({
    transport: guestTransport,
    countryId: guestCountryId,
    seatCount: 2,
    humanPlayerIds: [hostCountryId, guestCountryId],
  });
  expect(hostSession.start()).toEqual({ accepted: true });
  return {
    engine,
    hostSession,
    guestSession,
    hostTransport,
    guestTransport,
    hostCountryId,
    guestCountryId,
  };
}

describe('authoritative multiplayer game sessions', () => {
  it('keeps the explicitly selected host country as the shared primary seat', () => {
    const engine = new WorldEngineV2(918);
    const originalCountryId = engine.state.humanPlayerId;
    const hostCountryId = secondLivingCountry(engine);
    expect(engine.chooseCountry(hostCountryId)).toEqual({ accepted: true });
    engine.setClockAuthority(false);

    const transport = new LoopbackHostTransport();
    const guest = transport.connectGuest('guest_12345678');
    const session = new HostGameSession({
      engine,
      transport,
      seats: new Map([
        [transport.hostPeerId, hostCountryId],
        [guest.peerId, originalCountryId],
      ]),
    });

    expect(engine.state.humanPlayerId).toBe(hostCountryId);
    expect(engine.viewerPlayerId).toBe(hostCountryId);
    expect(engine.state.humanPlayerIds).toEqual(
      [hostCountryId, originalCountryId].sort((left, right) => left.localeCompare(right)),
    );
    session.close(false);
  });

  it('launches from one snapshot, forwards guest commands and stays deterministic through hash tick 8', () => {
    const fixture = createRealLoopback();
    const results: Array<{ accepted: boolean; assignedSequence?: number }> = [];
    fixture.guestSession.subscribe({
      onCommandResult: ({ result }) => results.push({
        accepted: result.accepted,
        ...(result.assignedSequence === undefined ? {} : { assignedSequence: result.assignedSequence }),
      }),
    });
    const guestEngine = fixture.guestSession.engine;
    expect(guestEngine).toBeDefined();
    expect(guestEngine!.clockAuthority).toBe(false);
    expect(guestEngine!.viewerPlayerId).toBe(fixture.guestCountryId);
    expect(guestEngine!.canonicalHash()).toBe(fixture.engine.canonicalHash());

    const allocations = { ...guestEngine!.state.players[fixture.guestCountryId]!.research.allocations };
    expect(fixture.guestSession.submitCommand({
      type: 'set-research-allocations',
      playerId: fixture.guestCountryId,
      allocations,
    })).toEqual({ accepted: true });
    expect(results).toEqual([{ accepted: true, assignedSequence: 1 }]);

    for (let tick = 1; tick <= CANONICAL_HASH_INTERVAL_TICKS; tick += 1) fixture.engine.step();
    expect(fixture.guestSession.engine!.state.tick).toBe(CANONICAL_HASH_INTERVAL_TICKS);
    expect(fixture.guestSession.engine!.canonicalHash()).toBe(fixture.engine.canonicalHash());

    const tickMessages = fixture.hostTransport.hostToGuest
      .map(({ message }) => message)
      .filter((message): message is TickMessage => message.type === 'tick');
    expect(tickMessages).toHaveLength(CANONICAL_HASH_INTERVAL_TICKS);
    expect(tickMessages.slice(0, -1).every((message) => message.hash === undefined)).toBe(true);
    expect(tickMessages.at(-1)?.hash).toBe(fixture.engine.canonicalHash());

    const commandsBeforeGuestSpeed = fixture.hostTransport.guestToHost.length;
    expect(fixture.guestSession.submitCommand({ type: 'set-speed', speed: 2 })).toMatchObject({ accepted: false });
    expect(fixture.hostTransport.guestToHost).toHaveLength(commandsBeforeGuestSpeed);
    expect(fixture.hostSession.submitHostCommand({ type: 'set-speed', speed: 0 })).toEqual({ accepted: true });
    expect(fixture.guestSession.engine!.state.speed).toBe(0);

    fixture.guestSession.close(false);
    fixture.hostSession.close(false);
  });

  it('keeps host and guest human markers symmetric after snapshot resync and replica remount', () => {
    const fixture = createRealLoopback(919_1);
    const expectedRoster = [fixture.hostCountryId, fixture.guestCountryId]
      .sort((left, right) => left.localeCompare(right));
    const assertSymmetricRoster = (engine: GameSessionEngineV2): void => {
      expect(engine).toBeInstanceOf(WorldEngineV2);
      const worldEngine = engine as WorldEngineV2;
      expect(engine.state.humanPlayerIds).toEqual(expectedRoster);
      expect(engine.state.humanPlayerIds).toContain(fixture.hostCountryId);
      expect(engine.state.humanPlayerIds).toContain(fixture.guestCountryId);
      expect(worldEngine.player(fixture.hostCountryId)?.isHuman).toBe(true);
      expect(worldEngine.player(fixture.guestCountryId)?.isHuman).toBe(true);
    };

    assertSymmetricRoster(fixture.engine);
    const firstGuestReplica = fixture.guestSession.engine!;
    assertSymmetricRoster(firstGuestReplica);
    expect(firstGuestReplica.viewerPlayerId).toBe(fixture.guestCountryId);

    fixture.guestSession.requestResync('Verify the complete human-country roster.');
    fixture.engine.step(RESYNC_REQUEST_COOLDOWN_TICKS);

    const remountedGuestReplica = fixture.guestSession.engine!;
    expect(remountedGuestReplica).not.toBe(firstGuestReplica);
    expect(remountedGuestReplica.viewerPlayerId).toBe(fixture.guestCountryId);
    assertSymmetricRoster(remountedGuestReplica);
    expect(remountedGuestReplica.canonicalHash()).toBe(fixture.engine.canonicalHash());

    fixture.guestSession.close(false);
    fixture.hostSession.close(false);
  });

  it('rejects seat spoofing and deduplicates an identical request without queuing it twice', () => {
    const fixture = createRealLoopback(920);
    const hostSequenceBefore = fixture.engine.state.actionSequence;
    const hostAllocations = { ...fixture.engine.state.players[fixture.hostCountryId]!.research.allocations };
    fixture.guestTransport.send({
      type: 'command',
      requestId: 'request_spoof_1234',
      clientSequence: 1,
      baseTick: fixture.engine.state.tick,
      command: {
        type: 'set-research-allocations',
        playerId: fixture.hostCountryId,
        allocations: hostAllocations,
      },
    });
    const spoofResult = fixture.hostTransport.hostToGuest.at(-1)?.message;
    expect(spoofResult).toMatchObject({ type: 'command-result', accepted: false });
    expect(fixture.engine.state.actionSequence).toBe(hostSequenceBefore);

    const guestAllocations = { ...fixture.engine.state.players[fixture.guestCountryId]!.research.allocations };
    const validCommand = {
      type: 'command',
      requestId: 'request_valid_1234',
      clientSequence: 2,
      baseTick: fixture.engine.state.tick,
      command: {
        type: 'set-research-allocations',
        playerId: fixture.guestCountryId,
        allocations: guestAllocations,
      },
    } as const;
    fixture.guestTransport.send(validCommand);
    const sequenceAfterFirst = fixture.engine.state.actionSequence;
    fixture.guestTransport.send(validCommand);
    expect(fixture.engine.state.actionSequence).toBe(sequenceAfterFirst);
    expect(sequenceAfterFirst).toBe(hostSequenceBefore + 1);

    const acceptedResults = fixture.hostTransport.hostToGuest
      .map(({ message }) => message)
      .filter((message) => message.type === 'command-result'
        && message.requestId === validCommand.requestId
        && message.accepted);
    expect(acceptedResults).toHaveLength(2);
    expect(acceptedResults[0]).toEqual(acceptedResults[1]);
    expect(fixture.hostSession.submitHostCommand(validCommand.command)).toMatchObject({ accepted: false });

    fixture.guestSession.close(false);
    fixture.hostSession.close(false);
  });

  it('keeps healthy seats and the host clock running when one seated peer cannot receive', () => {
    const engine = new WorldEngineV2(921);
    const [hostCountryId, failedCountryId, healthyCountryId] = Object.keys(engine.state.players) as PlayerId[];
    if (!hostCountryId || !failedCountryId || !healthyCountryId) throw new Error('The fixture needs three countries.');
    const transport = new LoopbackHostTransport();
    const failedTransport = transport.connectGuest('guest_failed_1234');
    const healthyTransport = transport.connectGuest('guest_healthy_123');
    const failedGuest = new GuestGameSession({
      transport: failedTransport,
      countryId: failedCountryId,
      seatCount: 3,
    });
    const healthyGuest = new GuestGameSession({
      transport: healthyTransport,
      countryId: healthyCountryId,
      seatCount: 3,
    });
    const host = new HostGameSession({
      engine,
      transport,
      seats: new Map([
        [transport.hostPeerId, hostCountryId],
        [failedTransport.peerId, failedCountryId],
        [healthyTransport.peerId, healthyCountryId],
      ]),
    });
    expect(host.start()).toEqual({ accepted: true });

    failedTransport.setState('disconnected');
    host.requestSnapshot(failedTransport.peerId, 'reconnect');
    engine.step(RESYNC_REQUEST_COOLDOWN_TICKS * 3);

    expect(host.status.phase).toBe('running');
    expect(host.status.lastError).toContain(failedTransport.peerId);
    expect(engine.clockAuthority).toBe(true);
    expect(engine.state.tick).toBe(RESYNC_REQUEST_COOLDOWN_TICKS * 3);
    expect(failedGuest.engine?.state.tick).toBe(0);
    expect(healthyGuest.engine?.state.tick).toBe(RESYNC_REQUEST_COOLDOWN_TICKS * 3);
    expect(transport.hostToGuest.some(({ peerId, message }) => (
      peerId === healthyTransport.peerId && message.type === 'tick' && message.tick === 1
    ))).toBe(true);
    expect(transport.sendAttempts
      .filter(({ peerId, message }) => peerId === failedTransport.peerId && message.type === 'snapshot')
      .map(({ message }) => (message as SnapshotMessage).tick)).toEqual([
        0,
        RESYNC_REQUEST_COOLDOWN_TICKS,
        RESYNC_REQUEST_COOLDOWN_TICKS * 2,
        RESYNC_REQUEST_COOLDOWN_TICKS * 3,
      ]);

    failedGuest.close(false);
    healthyGuest.close(false);
    host.close(false);
  });

  it('rate-limits repeated resync snapshots by authoritative tick and serves a deferred recovery', () => {
    const fixture = createRealLoopback(922);
    const request = {
      type: 'resync-request',
      expectedTick: 1,
      actualTick: 0,
      reason: 'Repeated recovery probe.',
    } as const;
    const resyncSnapshots = (): SnapshotMessage[] => fixture.hostTransport.hostToGuest
      .map(({ message }) => message)
      .filter((message): message is SnapshotMessage => message.type === 'snapshot' && message.reason === 'resync');

    fixture.guestTransport.send(request);
    fixture.guestTransport.send(request);
    expect(resyncSnapshots()).toHaveLength(0);

    for (let tick = 1; tick < RESYNC_REQUEST_COOLDOWN_TICKS; tick += 1) fixture.engine.step();
    expect(resyncSnapshots()).toHaveLength(0);
    fixture.engine.step();
    expect(resyncSnapshots()).toHaveLength(1);
    expect(resyncSnapshots().at(-1)?.tick).toBe(RESYNC_REQUEST_COOLDOWN_TICKS);

    fixture.guestTransport.send(request);
    for (let tick = 1; tick < RESYNC_REQUEST_COOLDOWN_TICKS; tick += 1) fixture.engine.step();
    expect(resyncSnapshots()).toHaveLength(1);
    fixture.engine.step();
    expect(resyncSnapshots()).toHaveLength(2);
    expect(resyncSnapshots().at(-1)?.tick).toBe(RESYNC_REQUEST_COOLDOWN_TICKS * 2);
    expect(fixture.hostSession.status.phase).toBe('running');

    fixture.guestSession.close(false);
    fixture.hostSession.close(false);
  });
});

class MemoryGuestTransport implements GuestSessionTransport {
  readonly hostPeerId = 'host_12345678';
  state: DirectConnectState = 'connected';
  readonly sent: SessionMessage[] = [];
  failNextSend = false;
  private readonly handlers = new Set<DirectConnectGuestHandlers>();

  subscribe(handlers: DirectConnectGuestHandlers): () => void {
    this.handlers.add(handlers);
    return () => this.handlers.delete(handlers);
  }

  send(message: SessionMessage): void {
    if (this.failNextSend) {
      this.failNextSend = false;
      throw new Error('Temporary transport backpressure.');
    }
    this.sent.push(message);
  }

  deliver(message: SessionMessage): void {
    for (const handlers of this.handlers) handlers.onMessage?.(message);
  }

  setState(state: DirectConnectState): void {
    this.state = state;
    for (const handlers of this.handlers) handlers.onStateChange?.({
      peer: {
        invitationId: 'invite_host_12345678',
        peerId: this.hostPeerId,
        displayName: 'Host',
        state,
      },
    });
  }

  close(): void {
    this.state = 'closed';
  }
}

class FakeReplicaEngine implements GameSessionEngineV2 {
  readonly content = {} as WorldContentV2;
  readonly state: WorldStateV2;
  clockAuthority = false;
  viewerPlayerId: PlayerId;
  hash: string;
  private commandSink?: (command: WorldCommandV2) => CommandResultV2;

  constructor(readonly countryId: PlayerId, tick: number, hash: string) {
    this.viewerPlayerId = countryId;
    this.hash = hash;
    this.state = {
      tick,
      actionSequence: 0,
      speed: 0,
      humanPlayerId: countryId,
      humanPlayerIds: [countryId],
      players: { [countryId]: {} },
      offers: [],
    } as unknown as WorldStateV2;
  }

  subscribe(_listener: (state: WorldStateV2, change: WorldChangeV2) => void): () => void {
    return () => undefined;
  }

  subscribeQueuedActions(_listener: (action: { sequence: number; command: WorldCommandV2 }) => void): () => void {
    return () => undefined;
  }

  setClientCommandSink(sink?: (command: WorldCommandV2) => CommandResultV2): void {
    this.commandSink = sink;
  }

  setClockAuthority(authoritative: boolean): void {
    this.clockAuthority = authoritative;
  }

  configureHumanPlayers(_playerIds: readonly string[], viewerPlayerId: string): CommandResultV2 {
    this.viewerPlayerId = viewerPlayerId as PlayerId;
    return { accepted: true };
  }

  setViewerPlayerId(playerId: string): CommandResultV2 {
    this.viewerPlayerId = playerId as PlayerId;
    return { accepted: true };
  }

  enqueueAuthoritativeAction(action: { sequence: number; command: WorldCommandV2 }): CommandResultV2 {
    if (action.sequence !== this.state.actionSequence + 1) return { accepted: false, reason: 'sequence gap' };
    this.state.actionSequence = action.sequence;
    return { accepted: true };
  }

  submitCommand(command: WorldCommandV2): CommandResultV2 {
    return this.commandSink?.(command) ?? { accepted: true };
  }

  setAuthoritativeSpeed(speed: WorldSpeedV2): CommandResultV2 {
    this.state.speed = speed;
    return { accepted: true };
  }

  canonicalHash(): string {
    return this.hash;
  }

  step(): void {
    this.state.tick += 1;
  }
}

function fakeSnapshot(countryId: PlayerId, hash = 'snapshot-good'): SnapshotMessage {
  const save = {
    schemaVersion: 22,
    rulesVersion: 'test-rules',
    tick: 0,
    canonicalStateHash: hash,
  } as unknown as SaveGameV2;
  return { type: 'snapshot', reason: 'join', tick: 0, hash, save };
}

describe('guest ordering and desync recovery', () => {
  it('requests resync for a tick gap without advancing the replica', () => {
    const countryId = 'guest-country' as PlayerId;
    const transport = new MemoryGuestTransport();
    const guest = new GuestGameSession({
      transport,
      countryId,
      seatCount: 2,
      replicaFactory: (save) => new FakeReplicaEngine(countryId, save.tick, save.canonicalStateHash),
    });
    transport.deliver(fakeSnapshot(countryId));
    transport.deliver({ type: 'tick', tick: 2, commands: [] });

    expect(guest.engine?.state.tick).toBe(0);
    expect(transport.sent.at(-1)).toMatchObject({
      type: 'resync-request',
      expectedTick: 2,
      actualTick: 0,
    });
    expect(guest.status.phase).toBe('resyncing');
    guest.close(false);
  });

  it('detects an optional checkpoint hash mismatch after ordered replay', () => {
    const countryId = 'guest-country' as PlayerId;
    const transport = new MemoryGuestTransport();
    const guest = new GuestGameSession({
      transport,
      countryId,
      seatCount: 2,
      replicaFactory: (save) => new FakeReplicaEngine(countryId, save.tick, save.canonicalStateHash),
    });
    transport.deliver(fakeSnapshot(countryId));
    (guest.engine as FakeReplicaEngine).hash = 'actual-hash';
    transport.deliver({ type: 'tick', tick: 1, hash: 'host-hash', commands: [] });

    expect(guest.engine?.state.tick).toBe(1);
    expect(transport.sent.at(-1)).toMatchObject({
      type: 'resync-request',
      expectedTick: 1,
      actualTick: 1,
      expectedHash: 'host-hash',
      actualHash: 'actual-hash',
    });
    expect(guest.status.phase).toBe('resyncing');
    guest.close(false);
  });

  it('clears a failed resync send and retries recovery after reconnect', () => {
    const countryId = 'guest-country' as PlayerId;
    const transport = new MemoryGuestTransport();
    const guest = new GuestGameSession({
      transport,
      countryId,
      seatCount: 2,
      replicaFactory: (save) => new FakeReplicaEngine(countryId, save.tick, save.canonicalStateHash),
    });
    transport.deliver(fakeSnapshot(countryId));
    transport.failNextSend = true;
    transport.deliver({ type: 'tick', tick: 2, commands: [] });

    expect(guest.status.phase).toBe('error');
    expect(guest.status.lastError).toContain('Temporary transport backpressure');
    expect(transport.sent.filter((message) => message.type === 'resync-request')).toHaveLength(0);

    transport.setState('disconnected');
    expect(guest.status.phase).toBe('disconnected');
    transport.setState('connected');
    expect(guest.status.phase).toBe('resyncing');
    expect(transport.sent.at(-1)).toMatchObject({
      type: 'resync-request',
      expectedTick: 2,
      actualTick: 0,
    });

    transport.deliver({ ...fakeSnapshot(countryId), reason: 'resync' });
    expect(guest.status.phase).toBe('running');
    guest.close(false);
  });

  it('rejects a snapshot whose human-country roster does not match the started lobby', () => {
    const countryId = 'guest-country' as PlayerId;
    const hostCountryId = 'host-country' as PlayerId;
    const transport = new MemoryGuestTransport();
    const guest = new GuestGameSession({
      transport,
      countryId,
      seatCount: 2,
      humanPlayerIds: [hostCountryId, countryId],
      replicaFactory: (save) => new FakeReplicaEngine(countryId, save.tick, save.canonicalStateHash),
    });

    transport.deliver(fakeSnapshot(countryId));

    expect(guest.engine).toBeUndefined();
    expect(guest.status.phase).toBe('resyncing');
    expect(guest.status.lastError).toMatch(/human-country roster does not match/i);
    expect(transport.sent.at(-1)).toMatchObject({
      type: 'resync-request',
      expectedTick: 1,
      actualTick: 0,
      reason: 'Snapshot validation failed.',
    });
    guest.close(false);
  });
});
