import type { PlayerId } from '../sim/v2/types';
import {
  MAX_MULTIPLAYER_PLAYERS,
  MIN_MULTIPLAYER_PLAYERS,
  type LobbyStateMessage,
  type MultiplayerDeploymentSnapshotV1,
} from './protocol';

export function multiplayerSeatsFromLobby(lobby: LobbyStateMessage): Map<string, PlayerId> {
  if (!lobby.started) throw new Error('The multiplayer lobby has not started.');
  const connected = lobby.players
    .filter((player) => player.connected)
    .sort((left, right) => left.peerId.localeCompare(right.peerId));
  if (!connected.some((player) => player.peerId === lobby.hostPeerId)) {
    throw new Error('The room host is not connected.');
  }
  if (connected.length < MIN_MULTIPLAYER_PLAYERS || connected.length > MAX_MULTIPLAYER_PLAYERS) {
    throw new Error(`A campaign requires ${MIN_MULTIPLAYER_PLAYERS}-${MAX_MULTIPLAYER_PLAYERS} connected players.`);
  }
  if (connected.some((player) => !player.countryId || !player.deployment)) {
    throw new Error('Every connected player must have a frozen country deployment.');
  }
  const countries = connected.map((player) => player.countryId!);
  if (new Set(countries).size !== countries.length) throw new Error('Country seats must be unique.');
  return new Map(connected.map((player) => [player.peerId, player.countryId!]));
}

/** Country-keyed immutable account effects captured by the started room. */
export function multiplayerDeploymentsFromLobby(
  lobby: LobbyStateMessage,
): Map<PlayerId, MultiplayerDeploymentSnapshotV1> {
  const seats = multiplayerSeatsFromLobby(lobby);
  const deployments = new Map<PlayerId, MultiplayerDeploymentSnapshotV1>();
  for (const player of lobby.players) {
    const countryId = seats.get(player.peerId);
    if (!countryId) continue;
    if (!player.deployment || player.deployment.countryId !== countryId) {
      throw new Error(`The deployment for ${countryId} does not match its co-op seat.`);
    }
    deployments.set(countryId, structuredClone(player.deployment));
  }
  if (deployments.size !== seats.size) {
    throw new Error('Every co-op seat needs exactly one deployment snapshot.');
  }
  return deployments;
}

export function localCountryFromLobby(lobby: LobbyStateMessage, peerId: string): PlayerId {
  const countryId = multiplayerSeatsFromLobby(lobby).get(peerId);
  if (!countryId) throw new Error('This player has no active country seat.');
  return countryId;
}

/** Stable country-to-controller labels retained after the lobby UI closes. */
export function multiplayerControllerNamesFromLobby(lobby: LobbyStateMessage): Map<PlayerId, string> {
  const seats = multiplayerSeatsFromLobby(lobby);
  const countryByPeer = seats;
  return new Map(lobby.players.flatMap((player) => {
    const countryId = countryByPeer.get(player.peerId);
    return countryId ? [[countryId, player.displayName] as const] : [];
  }));
}
