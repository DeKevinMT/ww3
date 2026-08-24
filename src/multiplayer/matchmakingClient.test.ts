import { describe, expect, it } from 'vitest';
import {
  matchmakingServiceUrl,
  PUBLIC_MATCHMAKING_SERVICE_URL,
} from './matchmakingClient';

describe('public matchmaking service URL', () => {
  it('ships with the deployed production queue configured', () => {
    expect(matchmakingServiceUrl()).toBe(PUBLIC_MATCHMAKING_SERVICE_URL);
  });

  it('rejects insecure remote sockets but permits local development', () => {
    expect(matchmakingServiceUrl('ws://example.com/matchmaking')).toBeUndefined();
    expect(matchmakingServiceUrl('ws://127.0.0.1:8787/matchmaking'))
      .toBe('ws://127.0.0.1:8787/matchmaking');
  });
});
