import { ALLIANCE_OFFER_DURATION_TICKS } from './balance';
import { isHumanPlayerV2 } from './humanPlayers';
import { isSurvivalDawnlineNationV2 } from './survivalOrdinaryAi';
import {
  relationKeyV2,
  selectActiveWarBetweenV2,
  selectIsEliminatedV2,
} from './selectors';
import type {
  AllianceOfferV2,
  AllianceProposalStatusV2,
  AllianceV2,
  CommandResultV2,
  PlayerId,
  WorldStateV2,
} from './types';

function alliancePairV2(leftId: PlayerId, rightId: PlayerId): [PlayerId, PlayerId] {
  return leftId.localeCompare(rightId) <= 0 ? [leftId, rightId] : [rightId, leftId];
}

function compareAllianceV2(left: AllianceV2, right: AllianceV2): number {
  return left.leftId.localeCompare(right.leftId)
    || left.rightId.localeCompare(right.rightId);
}

function compareAllianceOfferV2(left: AllianceOfferV2, right: AllianceOfferV2): number {
  return left.fromId.localeCompare(right.fromId)
    || left.toId.localeCompare(right.toId);
}

function livingHumanCountryV2(state: WorldStateV2, playerId: PlayerId): boolean {
  return isHumanPlayerV2(state, playerId)
    && Boolean(state.players[playerId])
    && !selectIsEliminatedV2(state, playerId);
}

function livingStrategicAllyV2(state: WorldStateV2, playerId: PlayerId): boolean {
  return (isHumanPlayerV2(state, playerId)
    || (state.contentVersion.startsWith('survival-v')
      && isSurvivalDawnlineNationV2(state, playerId)))
    && Boolean(state.players[playerId])
    && !selectIsEliminatedV2(state, playerId);
}

export function selectAllianceV2(
  state: Pick<WorldStateV2, 'alliances'>,
  leftId: PlayerId,
  rightId: PlayerId,
): AllianceV2 | undefined {
  const key = relationKeyV2(leftId, rightId);
  return state.alliances.find((alliance) => relationKeyV2(alliance.leftId, alliance.rightId) === key);
}

export function areAlliedV2(
  state: Pick<WorldStateV2, 'alliances'>,
  leftId: PlayerId,
  rightId: PlayerId,
): boolean {
  return Boolean(selectAllianceV2(state, leftId, rightId));
}

export function selectAllianceOfferBetweenV2(
  state: Pick<WorldStateV2, 'allianceOffers'>,
  leftId: PlayerId,
  rightId: PlayerId,
): AllianceOfferV2 | undefined {
  const key = relationKeyV2(leftId, rightId);
  return state.allianceOffers.find((offer) => relationKeyV2(offer.fromId, offer.toId) === key);
}

export function allianceProposalStatusV2(
  state: WorldStateV2,
  fromId: PlayerId,
  targetId: PlayerId,
): AllianceProposalStatusV2 {
  if (fromId === targetId) return { allowed: false, reason: 'A country cannot ally with itself.' };
  if (!livingHumanCountryV2(state, fromId) || !livingHumanCountryV2(state, targetId)) {
    return { allowed: false, reason: 'Alliances are available only between living human-player countries.' };
  }
  if (selectActiveWarBetweenV2(state, fromId, targetId)) {
    return { allowed: false, reason: 'Countries at war cannot form an alliance.' };
  }
  if (areAlliedV2(state, fromId, targetId)) {
    return { allowed: false, reason: 'These countries are already allied.' };
  }
  if (selectAllianceOfferBetweenV2(state, fromId, targetId)) {
    return { allowed: false, reason: 'An alliance invitation is already pending between these countries.' };
  }
  return { allowed: true };
}

/**
 * Removes only relations that can no longer be valid. Active alliances do not
 * silently dissolve because of a war: opening that war is itself an invariant
 * failure which the declaration path must prevent.
 */
export function pruneAllianceStateV2(state: WorldStateV2): void {
  state.alliances ??= [];
  state.allianceOffers ??= [];
  state.alliances = state.alliances
    .filter((alliance) => livingStrategicAllyV2(state, alliance.leftId)
      && livingStrategicAllyV2(state, alliance.rightId)
      && (isHumanPlayerV2(state, alliance.leftId)
        || isHumanPlayerV2(state, alliance.rightId)))
    .sort(compareAllianceV2);
  state.allianceOffers = state.allianceOffers
    .filter((offer) => offer.expiresTick > state.tick
      && livingHumanCountryV2(state, offer.fromId)
      && livingHumanCountryV2(state, offer.toId)
      && !selectActiveWarBetweenV2(state, offer.fromId, offer.toId)
      && !areAlliedV2(state, offer.fromId, offer.toId))
    .sort(compareAllianceOfferV2);
}

/** A declaration may cancel an invitation, but never an already active pact. */
export function cancelAllianceOfferBetweenV2(
  state: WorldStateV2,
  leftId: PlayerId,
  rightId: PlayerId,
): void {
  const key = relationKeyV2(leftId, rightId);
  state.allianceOffers = state.allianceOffers.filter((offer) => (
    relationKeyV2(offer.fromId, offer.toId) !== key
  ));
}

export function proposeAllianceV2(
  state: WorldStateV2,
  fromId: PlayerId,
  targetId: PlayerId,
): CommandResultV2 {
  pruneAllianceStateV2(state);
  const status = allianceProposalStatusV2(state, fromId, targetId);
  if (!status.allowed) return { accepted: false, reason: status.reason };
  state.allianceOffers.push({
    fromId,
    toId: targetId,
    createdTick: state.tick,
    expiresTick: state.tick + ALLIANCE_OFFER_DURATION_TICKS,
  });
  state.allianceOffers.sort(compareAllianceOfferV2);
  return { accepted: true };
}

export function respondToAllianceV2(
  state: WorldStateV2,
  fromId: PlayerId,
  toId: PlayerId,
  accept: boolean,
): CommandResultV2 {
  pruneAllianceStateV2(state);
  const offerIndex = state.allianceOffers.findIndex((offer) => (
    offer.fromId === fromId && offer.toId === toId
  ));
  if (offerIndex < 0) return { accepted: false, reason: 'Alliance invitation is unavailable.' };
  if (!accept) {
    state.allianceOffers.splice(offerIndex, 1);
    return { accepted: true };
  }
  if (!livingHumanCountryV2(state, fromId) || !livingHumanCountryV2(state, toId)) {
    return { accepted: false, reason: 'Both alliance countries must still be active human-player countries.' };
  }
  if (selectActiveWarBetweenV2(state, fromId, toId)) {
    return { accepted: false, reason: 'Countries at war cannot form an alliance.' };
  }
  if (areAlliedV2(state, fromId, toId)) {
    state.allianceOffers.splice(offerIndex, 1);
    return { accepted: false, reason: 'These countries are already allied.' };
  }
  state.allianceOffers.splice(offerIndex, 1);
  const [leftId, rightId] = alliancePairV2(fromId, toId);
  state.alliances.push({ leftId, rightId, formedTick: state.tick });
  state.alliances.sort(compareAllianceV2);
  return { accepted: true };
}
