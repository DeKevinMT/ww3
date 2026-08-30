import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DirectConnectGuest,
  type DirectConnectGuestHandlers,
  type DirectConnectHost,
  type DirectConnectStateEvent,
} from './directConnect';
import type { MatchmakingClient, MatchmakingClientOptions } from './matchmakingClient';
import type { MatchmakingServerMessage } from './matchmakingProtocol';
import {
  GuestReconnectCoordinator,
  HostReconnectCoordinator,
  reconnectCompatibilityKeyV1,
} from './reconnect';

class FakeMatchmaker {
  readonly clientId: string;
  readonly sent: Array<{ matchId: string; toClientId: string; kind: string; payload: string }> = [];
  readonly completed: string[] = [];
  closed = false;

  constructor(readonly options: MatchmakingClientOptions) {
    this.clientId = options.clientId ?? 'generated_client';
  }

  sendSignal(matchId: string, toClientId: string, kind: 'offer' | 'answer', payload: string): void {
    this.sent.push({ matchId, toClientId, kind, payload });
  }

  complete(matchId: string): void {
    this.completed.push(matchId);
  }

  close(): void {
    this.closed = true;
  }

  message(message: MatchmakingServerMessage): void {
    this.options.onMessage?.(message);
  }
}

describe('multiplayer reconnect rendezvous', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('uses a stable seat-specific key for public and private campaigns alike', () => {
    const first = reconnectCompatibilityKeyV1('room_12345678', 'guest_12345678');
    expect(first).toBe(reconnectCompatibilityKeyV1('room_12345678', 'guest_12345678'));
    expect(first).not.toBe(reconnectCompatibilityKeyV1('room_12345678', 'guest_87654321'));
    expect(first).not.toContain('guest_12345678');
  });

  it('lets the authoritative host wait, offer only the reserved seat, then cleans up', async () => {
    let stateHandler: ((event: DirectConnectStateEvent) => void) | undefined;
    const matchmakers: FakeMatchmaker[] = [];
    const transport = {
      roomId: 'room_12345678',
      hostPeerId: 'host_12345678',
      displayName: 'Host',
      reconnectSeats: { canRejoin: () => true },
      subscribe: (handlers: { onStateChange?: (event: DirectConnectStateEvent) => void }) => {
        stateHandler = handlers.onStateChange;
        return () => { stateHandler = undefined; };
      },
      prepareReconnect: vi.fn(() => true),
      releaseExpiredReconnectSeats: vi.fn(() => []),
      createReconnectInvite: vi.fn(async () => ({ invitationId: 'invite_rejoin', inviteCode: 'INVITE' })),
      acceptAnswer: vi.fn(async () => ({ peerId: 'guest_12345678' })),
    } as unknown as DirectConnectHost;
    const coordinator = new HostReconnectCoordinator({
      transport,
      seatPeerIds: new Set(['guest_12345678']),
      matchmakingUrl: 'wss://example.test/rejoin',
      matchmakerFactory: (options) => {
        const fake = new FakeMatchmaker(options);
        matchmakers.push(fake);
        return fake as unknown as MatchmakingClient;
      },
    });

    stateHandler?.({
      peer: { invitationId: 'invite_old', peerId: 'guest_12345678', displayName: 'Guest', state: 'closed' },
    });
    expect(matchmakers).toHaveLength(1);
    matchmakers[0]!.message({
      type: 'match-found',
      matchId: 'match_12345678',
      hostClientId: 'host_signal',
      participants: [
        { clientId: 'host_signal', displayName: 'Host' },
        { clientId: 'guest_12345678', displayName: 'Guest' },
      ],
    });
    await vi.runAllTicks();
    expect(transport.createReconnectInvite).toHaveBeenCalledWith('guest_12345678');
    expect(matchmakers[0]!.sent).toContainEqual({
      matchId: 'match_12345678', toClientId: 'guest_12345678', kind: 'offer', payload: 'INVITE',
    });

    matchmakers[0]!.message({
      type: 'signal', matchId: 'match_12345678', fromClientId: 'guest_12345678', kind: 'answer', payload: 'ANSWER',
    });
    await vi.runAllTicks();
    expect(transport.acceptAnswer).toHaveBeenCalledWith('ANSWER');
    stateHandler?.({
      peer: { invitationId: 'invite_rejoin', peerId: 'guest_12345678', displayName: 'Guest', state: 'connected' },
    });
    expect(matchmakers[0]!.completed).toEqual(['match_12345678']);
    expect(matchmakers[0]!.closed).toBe(true);
    coordinator.destroy();
  });

  it('reclaims the same guest identity with one retry and attaches before answering', async () => {
    const credential = {
      sessionId: 'session_12345678', peerId: 'guest_12345678', rejoinToken: 'rejoin_12345678',
    };
    const original = {
      roomId: 'room_12345678', rulesVersion: 'rules-v1', displayName: 'Guest',
      reconnectCredential: credential,
      close: vi.fn(),
    } as unknown as DirectConnectGuest;
    let replacementState: DirectConnectGuestHandlers['onStateChange'];
    const replacement = {
      subscribe: (handlers: DirectConnectGuestHandlers) => {
        replacementState = handlers.onStateChange;
        return () => undefined;
      },
    } as unknown as DirectConnectGuest;
    vi.spyOn(DirectConnectGuest, 'acceptInvite').mockResolvedValue({
      connection: replacement,
      answerCode: 'ANSWER',
    });
    let matchmaker: FakeMatchmaker | undefined;
    const attach = vi.fn();
    const coordinator = new GuestReconnectCoordinator({
      transport: original,
      attachTransport: attach,
      matchmakingUrl: 'wss://example.test/rejoin',
      matchmakerFactory: (options) => {
        matchmaker = new FakeMatchmaker(options);
        return matchmaker as unknown as MatchmakingClient;
      },
    });

    coordinator.reconnect();
    expect(original.close).toHaveBeenCalledOnce();
    matchmaker!.message({
      type: 'match-found', matchId: 'match_12345678', hostClientId: 'host_signal',
      participants: [
        { clientId: 'host_signal', displayName: 'Host' },
        { clientId: 'guest_12345678', displayName: 'Guest' },
      ],
    });
    matchmaker!.message({
      type: 'signal', matchId: 'match_12345678', fromClientId: 'host_signal', kind: 'offer', payload: 'INVITE',
    });
    await vi.runAllTicks();
    expect(DirectConnectGuest.acceptInvite).toHaveBeenCalledWith('INVITE', {
      rulesVersion: 'rules-v1', displayName: 'Guest', resume: credential,
    });
    expect(attach).toHaveBeenCalledWith(replacement);
    expect(matchmaker!.sent.at(-1)).toEqual({
      matchId: 'match_12345678', toClientId: 'host_signal', kind: 'answer', payload: 'ANSWER',
    });
    replacementState?.({
      peer: { invitationId: 'invite_new', peerId: 'host_12345678', displayName: 'Host', state: 'connected' },
    });
    expect(matchmaker!.completed).toEqual(['match_12345678']);
    expect(matchmaker!.closed).toBe(true);
    coordinator.destroy();
  });
});
