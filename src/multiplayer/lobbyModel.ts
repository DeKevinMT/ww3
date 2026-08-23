import { MAX_MULTIPLAYER_PLAYERS, MIN_MULTIPLAYER_PLAYERS, type LobbyAction, type LobbyPlayer, type LobbyStateMessage } from './protocol';
import type { CommandResultV2 } from '../sim/v2/types';
import { WORLD_CONTENT_V2 } from '../sim/v2/content';

function cleanName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 40);
}

export class HostLobbyModel {
  private readonly players = new Map<string, LobbyPlayer>();
  private revision = 0;
  private started = false;
  private startedRevision?: number;

  constructor(readonly hostPeerId: string, hostName: string) {
    this.players.set(hostPeerId, {
      peerId: hostPeerId,
      displayName: cleanName(hostName) || 'Host',
      countryId: null,
      ready: false,
      connected: true,
    });
  }

  connect(peerId: string, displayName: string): CommandResultV2 {
    if (this.started) return { accepted: false, reason: 'The campaign has already started.' };
    const existing = this.players.get(peerId);
    if (!existing && this.players.size >= MAX_MULTIPLAYER_PLAYERS) {
      return { accepted: false, reason: `This room is full (${MAX_MULTIPLAYER_PLAYERS} players).` };
    }
    const name = cleanName(displayName);
    if (!name) return { accepted: false, reason: 'Enter a player name.' };
    if ([...this.players.values()].some((player) => (
      player.peerId !== peerId && player.displayName.toLocaleLowerCase('en') === name.toLocaleLowerCase('en')
    ))) return { accepted: false, reason: 'That player name is already in use.' };

    this.players.set(peerId, existing
      ? { ...existing, displayName: name, connected: true }
      : { peerId, displayName: name, countryId: null, ready: false, connected: true });
    this.revision += 1;
    return { accepted: true };
  }

  disconnect(peerId: string): void {
    const player = this.players.get(peerId);
    if (!player || !player.connected) return;
    // A new direct invitation creates a new peer identity. Releasing a guest
    // before launch avoids permanent ghost names, countries and room slots.
    if (peerId === this.hostPeerId) {
      this.players.set(peerId, { ...player, connected: false, ready: false });
    } else {
      this.players.delete(peerId);
    }
    this.revision += 1;
  }

  apply(peerId: string, action: LobbyAction): CommandResultV2 {
    if (this.started) return { accepted: false, reason: 'The campaign has already started.' };
    const player = this.players.get(peerId);
    if (!player?.connected) return { accepted: false, reason: 'This player is not connected.' };

    switch (action.type) {
      case 'set-name':
        return this.connect(peerId, action.displayName);
      case 'select-country':
        if (!WORLD_CONTENT_V2.nations[action.countryId]) {
          return { accepted: false, reason: 'That country is not available in this scenario.' };
        }
        if ([...this.players.values()].some((candidate) => (
          candidate.peerId !== peerId && candidate.countryId === action.countryId
        ))) return { accepted: false, reason: 'That country is already claimed.' };
        this.players.set(peerId, { ...player, countryId: action.countryId, ready: false });
        this.revision += 1;
        return { accepted: true };
      case 'clear-country':
        this.players.set(peerId, { ...player, countryId: null, ready: false });
        this.revision += 1;
        return { accepted: true };
      case 'set-ready':
        if (action.ready && !player.countryId) return { accepted: false, reason: 'Choose a country first.' };
        this.players.set(peerId, { ...player, ready: action.ready });
        this.revision += 1;
        return { accepted: true };
      case 'start': {
        if (peerId !== this.hostPeerId) return { accepted: false, reason: 'Only the room host can start.' };
        const reason = this.startBlockReason();
        if (reason) return { accepted: false, reason };
        this.started = true;
        this.revision += 1;
        this.startedRevision = this.revision;
        return { accepted: true };
      }
    }
  }

  /**
   * Reopens a lobby only when the host's matching asynchronous launch attempt
   * failed. This is deliberately not a wire-level LobbyAction, so a guest can
   * never forge a rollback after the campaign has started successfully.
   */
  resetStartAfterLaunchFailure(peerId: string, startedRevision: number): CommandResultV2 {
    if (peerId !== this.hostPeerId) return { accepted: false, reason: 'Only the room host can recover a failed start.' };
    if (!this.started || this.startedRevision === undefined) {
      return { accepted: false, reason: 'There is no failed campaign start to recover.' };
    }
    if (startedRevision !== this.startedRevision) {
      return { accepted: false, reason: 'That campaign start attempt is no longer current.' };
    }
    this.started = false;
    this.startedRevision = undefined;
    this.revision += 1;
    return { accepted: true };
  }

  startBlockReason(): string | undefined {
    const connected = [...this.players.values()].filter((player) => player.connected);
    if (connected.length < MIN_MULTIPLAYER_PLAYERS) return 'At least two connected players are required.';
    if (connected.some((player) => !player.countryId)) return 'Every connected player must choose a country.';
    if (connected.some((player) => !player.ready)) return 'Every connected player must be ready.';
    return undefined;
  }

  snapshot(): LobbyStateMessage {
    return {
      type: 'lobby-state',
      revision: this.revision,
      hostPeerId: this.hostPeerId,
      started: this.started,
      players: [...this.players.values()]
        .sort((left, right) => (
          Number(right.peerId === this.hostPeerId) - Number(left.peerId === this.hostPeerId)
          || left.displayName.localeCompare(right.displayName, 'en')
          || left.peerId.localeCompare(right.peerId)
        ))
        .map((player) => ({ ...player })),
    };
  }
}
