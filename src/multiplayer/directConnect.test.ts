import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DIRECT_CONNECT_RTC_CONFIGURATION,
  DIRECT_CONNECT_CHANNEL_LABEL,
  DirectConnectError,
  DirectConnectHost,
  DirectReconnectSeatRegistry,
  waitForIceGatheringComplete,
} from './directConnect';
import {
  MULTIPLAYER_PROTOCOL_VERSION,
  decodeSignalCode,
  encodeSignalCode,
  type DirectInviteSignal,
} from './protocol';

class FakePeerConnection extends EventTarget {
  iceGatheringState: RTCIceGatheringState = 'new';
  connectionState: RTCPeerConnectionState = 'new';
}

class FakeDataChannel extends EventTarget {
  readonly label = DIRECT_CONNECT_CHANNEL_LABEL;
  readonly ordered = true;
  readonly maxPacketLifeTime = null;
  readonly maxRetransmits = null;
  readonly readyState: RTCDataChannelState = 'connecting';
  readonly bufferedAmount = 0;

  close(): void {}
  send(): void {}
}

class FakeInvitingPeerConnection extends FakePeerConnection {
  readonly channel = new FakeDataChannel();
  localDescription: RTCSessionDescription | null = null;

  createDataChannel(): RTCDataChannel {
    return this.channel as unknown as RTCDataChannel;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'offer', sdp: 'v=0\r\n' };
  }

  async setLocalDescription(description?: RTCLocalSessionDescriptionInit): Promise<void> {
    this.localDescription = { type: description?.type ?? 'offer', sdp: description?.sdp ?? 'v=0\r\n', toJSON: () => ({}) };
    this.iceGatheringState = 'complete';
  }

  async setRemoteDescription(): Promise<void> {}
  close(): void {}
}

describe('WebRTC Direct Connect primitives', () => {
  it('reserves a stable seat, rejects duplicate tokens and expires the grace cleanly', () => {
    let now = 10_000;
    const seats = new DirectReconnectSeatRegistry({
      sessionId: 'session_12345678',
      graceMs: 5_000,
      now: () => now,
    });
    const first = seats.accept('guest_12345678');
    expect(first.rejoined).toBe(false);
    expect(() => seats.accept('guest_12345678', first.credential)).toThrow(/already connected/i);

    seats.disconnect('guest_12345678');
    expect(() => seats.accept('guest_12345678', {
      ...first.credential,
      rejoinToken: 'rejoin_wrongtoken',
    })).toThrow(/does not match/i);
    expect(seats.accept('guest_12345678', first.credential)).toMatchObject({ rejoined: true });

    seats.disconnect('guest_12345678');
    now += 5_001;
    expect(seats.releaseExpired()).toEqual(['guest_12345678']);
    expect(seats.credential('guest_12345678')).toBeUndefined();
    expect(() => seats.accept('guest_12345678', first.credential)).toThrow(/no longer reserved/i);
  });

  it('uses public Cloudflare STUN without embedded credentials', () => {
    expect(DEFAULT_DIRECT_CONNECT_RTC_CONFIGURATION.iceServers).toEqual([
      { urls: 'stun:stun.cloudflare.com:3478' },
    ]);
    expect(JSON.stringify(DEFAULT_DIRECT_CONNECT_RTC_CONFIGURATION)).not.toMatch(/credential|username/i);
  });

  it('waits for complete ICE gathering before a manual code is shared', async () => {
    const fake = new FakePeerConnection();
    const waiting = waitForIceGatheringComplete(fake as unknown as RTCPeerConnection, 1_000);
    fake.iceGatheringState = 'complete';
    fake.dispatchEvent(new Event('icegatheringstatechange'));
    await expect(waiting).resolves.toBeUndefined();
  });

  it('rejects closed or failed ICE gathering clearly', async () => {
    const fake = new FakePeerConnection();
    const waiting = waitForIceGatheringComplete(fake as unknown as RTCPeerConnection, 1_000);
    fake.connectionState = 'failed';
    fake.dispatchEvent(new Event('connectionstatechange'));
    await expect(waiting).rejects.toMatchObject({ code: 'connection-failed' });
  });

  it('bounds host-star rooms to 2-8 total human players', () => {
    const common = {
      rulesVersion: 'frontier-command-v2.57-performance-multiplayer',
      displayName: 'Host',
      peerConnectionFactory: () => { throw new Error('not reached'); },
    };
    expect(() => new DirectConnectHost({ ...common, maxPlayers: 1 })).toThrow(DirectConnectError);
    expect(() => new DirectConnectHost({ ...common, maxPlayers: 9 })).toThrow(DirectConnectError);
    const host = new DirectConnectHost({ ...common, maxPlayers: 8 });
    expect(host.maxPlayers).toBe(8);
    host.close();
  });

  it('keeps an invitation valid when Chromium reports connecting before the manual answer', async () => {
    const pc = new FakeInvitingPeerConnection();
    const rulesVersion = 'frontier-command-v2.57-performance-multiplayer';
    const host = new DirectConnectHost({
      rulesVersion,
      displayName: 'Host',
      peerConnectionFactory: () => pc as unknown as RTCPeerConnection,
    });
    const { inviteCode } = await host.createInvite();
    const invite = decodeSignalCode(inviteCode) as DirectInviteSignal;

    pc.connectionState = 'connecting';
    pc.dispatchEvent(new Event('connectionstatechange'));

    const answerCode = encodeSignalCode({
      kind: 'direct-answer',
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      rulesVersion,
      roomId: invite.roomId,
      invitationId: invite.invitationId,
      guestPeerId: 'guest_12345678',
      guestName: 'Guest',
      description: { type: 'answer', sdp: 'v=0\r\n' },
    });
    await expect(host.acceptAnswer(answerCode)).resolves.toMatchObject({
      peerId: 'guest_12345678',
      state: 'connecting',
    });
    host.close();
  });
});
