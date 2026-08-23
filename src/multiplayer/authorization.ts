import type { CommandResultV2, PlayerId, WorldCommandV2, WorldStateV2 } from '../sim/v2/types';

function allowed(): CommandResultV2 {
  return { accepted: true };
}

function rejected(reason: string): CommandResultV2 {
  return { accepted: false, reason };
}

/**
 * Host-side seat ownership validation. This runs before the ordinary game-rule
 * validation in WorldEngineV2, so a guest can never submit an action for a
 * country it does not own even when the payload itself is otherwise valid.
 */
export function authorizeMultiplayerCommandV2(
  state: Pick<WorldStateV2, 'allianceOffers' | 'offers' | 'players'>,
  seatCountryId: PlayerId,
  command: WorldCommandV2,
  isRoomHost: boolean,
): CommandResultV2 {
  if (!state.players[seatCountryId]) return rejected('Your country is no longer active; you are now spectating.');

  switch (command.type) {
    case 'choose-country':
      return rejected('Country choices are locked when the multiplayer campaign starts.');
    case 'set-speed':
      return isRoomHost ? allowed() : rejected('Only the room host can change the shared game speed.');
    case 'set-research-allocations':
    case 'adjust-budget':
    case 'set-budget-policy':
    case 'rapid-recruitment':
    case 'research-surge':
    case 'launch-propaganda':
    case 'set-empire-name':
      return command.playerId === seatCountryId
        ? allowed() : rejected('You can only manage your own country.');
    case 'declare-war':
      if (command.escalatedFromWarId !== undefined) {
        return rejected('Coalition escalation is reserved for the world AI.');
      }
      return command.attackerId === seatCountryId
        ? allowed() : rejected('You can only declare war as your own country.');
    case 'request-ceasefire':
      return command.requesterId === seatCountryId
        ? allowed() : rejected('You can only request peace for your own country.');
    case 'propose-peace':
      return command.fromId === seatCountryId
        ? allowed() : rejected('You can only send an offer from your own country.');
    case 'respond-to-offer': {
      const offer = state.offers.find((candidate) => candidate.id === command.offerId);
      return offer?.toId === seatCountryId
        ? allowed() : rejected('That peace offer is not addressed to your country.');
    }
    case 'propose-alliance':
      return command.fromId === seatCountryId
        ? allowed() : rejected('You can only invite another player from your own country.');
    case 'respond-to-alliance': {
      if (command.toId !== seatCountryId) {
        return rejected('That alliance invitation is not addressed to your country.');
      }
      const offer = state.allianceOffers.find((candidate) => (
        candidate.fromId === command.fromId && candidate.toId === command.toId
      ));
      return offer
        ? allowed() : rejected('That alliance invitation is no longer available.');
    }
  }
}
