import { describe, expect, it } from 'vitest';
import {
  MATCHMAKING_PROTOCOL_VERSION,
  parseMatchmakingClientMessage,
  parseMatchmakingServerMessage,
} from './matchmakingProtocol';

describe('public matchmaking protocol', () => {
  it('accepts a versioned queue request without a requested lobby size', () => {
    expect(parseMatchmakingClientMessage({
      type: 'queue-join',
      protocolVersion: MATCHMAKING_PROTOCOL_VERSION,
      rulesVersion: 'rules-v1',
      clientId: 'player_123',
      displayName: '  Alice  ',
    })).toEqual({
      type: 'queue-join',
      protocolVersion: MATCHMAKING_PROTOCOL_VERSION,
      rulesVersion: 'rules-v1',
      clientId: 'player_123',
      displayName: 'Alice',
    });
    expect(parseMatchmakingClientMessage({
      type: 'queue-join', protocolVersion: MATCHMAKING_PROTOCOL_VERSION,
      rulesVersion: 'rules-v1', clientId: 'player_123', displayName: '',
    })).toBeUndefined();
  });

  it('accepts opaque directed WebRTC signaling but rejects oversized or malformed payloads', () => {
    expect(parseMatchmakingClientMessage({
      type: 'signal', matchId: 'match_123', toClientId: 'player_456', kind: 'offer', payload: 'opaque-code',
    })).toEqual({
      type: 'signal', matchId: 'match_123', toClientId: 'player_456', kind: 'offer', payload: 'opaque-code',
    });
    expect(parseMatchmakingClientMessage({
      type: 'signal', matchId: '../escape', toClientId: 'player_456', kind: 'offer', payload: 'opaque-code',
    })).toBeUndefined();
    expect(parseMatchmakingClientMessage({
      type: 'signal', matchId: 'match_123', toClientId: 'player_456', kind: 'offer', payload: 'x'.repeat(200_001),
    })).toBeUndefined();
  });

  it('requires every announced participant and host to be valid', () => {
    expect(parseMatchmakingServerMessage({
      type: 'match-found',
      matchId: 'match_123',
      hostClientId: 'player_a',
      participants: [
        { clientId: 'player_a', displayName: 'Alice' },
        { clientId: 'player_b', displayName: 'Bob' },
      ],
    })).toMatchObject({ type: 'match-found', hostClientId: 'player_a' });
    expect(parseMatchmakingServerMessage({
      type: 'match-found',
      matchId: 'match_123',
      hostClientId: 'missing_host',
      participants: [
        { clientId: 'player_a', displayName: 'Alice' },
        { clientId: 'player_b', displayName: 'Bob' },
      ],
    })).toBeUndefined();
  });
});
