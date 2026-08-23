import { describe, expect, it } from 'vitest';
import { nationIdV2 } from '../sim/v2/types';
import { localCountryFromLobby, multiplayerSeatsFromLobby } from './orchestration';
import type { LobbyStateMessage } from './protocol';

function lobby(): LobbyStateMessage {
  return {
    type: 'lobby-state',
    revision: 9,
    hostPeerId: 'host_12345678',
    started: true,
    players: [
      { peerId: 'host_12345678', displayName: 'Host', countryId: nationIdV2('BEL'), ready: true, connected: true },
      { peerId: 'guest_12345678', displayName: 'Guest', countryId: nationIdV2('NLD'), ready: true, connected: true },
      { peerId: 'old_guest_1234', displayName: 'Offline', countryId: nationIdV2('FRA'), ready: false, connected: false },
    ],
  };
}

describe('multiplayer launch orchestration', () => {
  it('creates seats only for the connected launch roster', () => {
    const seats = multiplayerSeatsFromLobby(lobby());
    expect([...seats.entries()]).toEqual([
      ['guest_12345678', nationIdV2('NLD')],
      ['host_12345678', nationIdV2('BEL')],
    ]);
    expect(localCountryFromLobby(lobby(), 'guest_12345678')).toBe(nationIdV2('NLD'));
  });

  it('rejects a launch without a host or unique selected countries', () => {
    const noHost = lobby();
    noHost.players[0]!.connected = false;
    expect(() => multiplayerSeatsFromLobby(noHost)).toThrow(/host is not connected/i);

    const duplicate = lobby();
    duplicate.players[1]!.countryId = nationIdV2('BEL');
    expect(() => multiplayerSeatsFromLobby(duplicate)).toThrow(/unique/i);
  });
});
