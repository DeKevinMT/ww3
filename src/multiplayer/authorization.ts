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
  state: Pick<WorldStateV2, 'allianceOffers' | 'humanPlayerIds' | 'offers' | 'players'>,
  seatCountryId: PlayerId,
  command: WorldCommandV2,
  isRoomHost: boolean,
): CommandResultV2 {
  if (!state.players[seatCountryId]) return rejected('Your country is no longer active; you are now spectating.');

  switch (command.type) {
    case 'choose-country':
      return rejected('Country choices are locked when the multiplayer campaign starts.');
    case 'form-survival-empire':
      if (!isRoomHost) return rejected('Only the room host can form the shared Survival empire.');
      return command.flagshipId === seatCountryId
        ? allowed() : rejected('The Survival flagship must be your own country.');
    case 'deploy-antarctic-expedition':
      return rejected('Antarctic expeditions were retired; use normal wars and logistics.');
    case 'set-speed':
      return isRoomHost ? allowed() : rejected('Only the room host can change the shared game speed.');
    case 'set-research-allocations':
    case 'set-commander-priorities':
    case 'issue-commander-order':
    case 'adjust-budget':
    case 'set-budget-policy':
    case 'rapid-recruitment':
    case 'research-surge':
    case 'launch-propaganda':
    case 'start-arctic-project':
    case 'acknowledge-polar-warning':
    case 'respond-apex-transmission':
    case 'set-empire-name':
      return command.playerId === seatCountryId
        ? allowed() : rejected('You can only manage your own country.');
    case 'choose-run-upgrade':
      return rejected('Timeline adaptation cards were retired; use APEX talents and nation mastery.');
    case 'declare-war':
      if (command.escalatedFromWarId !== undefined) {
        return rejected('Coalition escalation is reserved for the world AI.');
      }
      if (state.humanPlayerIds.includes(command.attackerId)
        && state.humanPlayerIds.includes(command.defenderId)) {
        return rejected('Co-op teammates are permanently on the same side.');
      }
      return command.attackerId === seatCountryId
        ? allowed() : rejected('You can only declare war as your own country.');
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
