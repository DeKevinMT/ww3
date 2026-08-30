import { pruneAllianceStateV2 } from './alliances';
import { round } from './balance';
import { synchronizeArmyCapacityV2 } from './capacity';
import {
  ROGUE_AI_NATION_ID_V2,
  isHumanSelectableNationV2,
  isRogueAiNationV2,
  type WorldContentV2,
} from './content';
import { addWorldEventV2 } from './events';
import { selectHumanPlayerIdsV2 } from './humanPlayers';
import { retireAbsorbedNationV2 } from './integration';
import { rogueWaveManpowerAtV2 } from './survivalProvenance';
import {
  invalidateNationIndexV2,
  invalidateTerritoryIndexV2,
} from './selectors';
import type {
  CommandResultV2,
  PlayerId,
  TerritoryId,
  WorldStateV2,
} from './types';

export interface SurvivalEmpireFormationResultV2 extends CommandResultV2 {
  readonly memberIds?: readonly PlayerId[];
  readonly territoryIds?: readonly TerritoryId[];
  /** Ordinary independent countries damaged by the opening machine signal. */
  readonly weakenedTerritoryIds?: readonly TerritoryId[];
  /** @deprecated Save/UI compatibility alias for weakenedTerritoryIds. */
  readonly occupiedTerritoryIds?: readonly TerritoryId[];
}

/**
 * Independent countries retain half of their civilian economy/population but
 * only one fifth of their opening military force. They remain sovereign, keep
 * national combat quality and can recruit/fight until a real Rogue wave wins.
 */
export const SURVIVAL_OCCUPATION_ECONOMY_FACTOR_V2 = 0.50;
export const SURVIVAL_OCCUPATION_POPULATION_FACTOR_V2 = 0.50;
export const SURVIVAL_OCCUPATION_MANPOWER_FACTOR_V2 = 0.20;
export const SURVIVAL_OCCUPATION_QUALITY_FACTOR_V2 = 1;
export const SURVIVAL_SCORCHED_ECONOMY_CEILING_FACTOR_V2 = 0.025;
export const SURVIVAL_SCORCHED_POPULATION_CEILING_FACTOR_V2 = 0.12;

function enforceSurvivalScorchedTerritoryV2(
  state: WorldStateV2,
  content: WorldContentV2,
  territoryId: TerritoryId,
): void {
  const territory = state.territories[territoryId];
  const baseline = content.territories[territoryId]?.baseline;
  if (!territory || !baseline) return;
  // A fallen world country never enters Signal Purge in the terminal
  // timeline. Ownership/core represent route control only; the map keeps the
  // physical country label while every productive share remains zero.
  territory.coreOwner = territory.owner;
  territory.integration = 0;
  delete territory.integrationProgram;
  territory.economy = round(Math.min(
    territory.economy,
    Math.max(0.10, baseline.gdp * SURVIVAL_SCORCHED_ECONOMY_CEILING_FACTOR_V2),
  ), 9);
  territory.population = round(Math.min(
    territory.population,
    Math.max(0.01, baseline.population * SURVIVAL_SCORCHED_POPULATION_CEILING_FACTOR_V2),
  ), 9);
  // Ordinary national recruitment must not quietly rebuild a second world
  // army. Provenanced personnel that travelled from Antarctica stay intact.
  if (territory.owner === ROGUE_AI_NATION_ID_V2) {
    const antarcticWave = Math.min(
      territory.army.manpower,
      rogueWaveManpowerAtV2(state, territoryId),
    );
    const placeholder = Math.max(0, territory.army.manpower - antarcticWave);
    const placeholderCeiling = Math.max(0.000005, territory.army.capacity * 0.002);
    territory.army.manpower = round(
      antarcticWave + Math.min(placeholder, placeholderCeiling),
      9,
    );
  }
}

/**
 * Occupation damage is a durable run rule, not a one-off opening debuff.
 * Ownership/integration may change, but a reclaimed ruin cannot silently
 * regenerate into free world-scale output or manpower during the same run.
 */
export function enforceSurvivalScorchedWorldV2(
  state: WorldStateV2,
  content: WorldContentV2,
): void {
  if (content.metadata?.scenarioId !== 'survival') return;
  for (const territoryId of state.runProgression.scorchedWorldTerritoryIds) {
    enforceSurvivalScorchedTerritoryV2(state, content, territoryId);
  }
}

/** Makes a newly reached world territory a durable, zero-windfall ruin. */
export function markSurvivalScorchedTerritoryV2(
  state: WorldStateV2,
  content: WorldContentV2,
  territoryId: TerritoryId,
): void {
  if (content.metadata?.scenarioId !== 'survival') return;
  if (!state.runProgression.scorchedWorldTerritoryIds.includes(territoryId)) {
    state.runProgression.scorchedWorldTerritoryIds.push(territoryId);
    state.runProgression.scorchedWorldTerritoryIds.sort((left, right) => left.localeCompare(right));
  }
  // Capture is latency-sensitive. Enforce only the new/changed node here;
  // weekly and load-boundary normalization still audits the full registry.
  enforceSurvivalScorchedTerritoryV2(state, content, territoryId);
}

function selectedMemberBlocksFormationV2(
  state: WorldStateV2,
  selectedMemberIds: ReadonlySet<PlayerId>,
): boolean {
  if (state.wars.some((war) => (
    selectedMemberIds.has(war.attackerId)
      || selectedMemberIds.has(war.defenderId)
      || war.attackerOperations.some((operation) => selectedMemberIds.has(operation.commanderId))
      || war.defenderOperations.some((operation) => selectedMemberIds.has(operation.commanderId))
  ))) return true;
  return Object.values(state.territories).some((territory) => {
    const program = territory.integrationProgram;
    return Boolean(program && (
      selectedMemberIds.has(program.fromOwnerId)
        || selectedMemberIds.has(program.fromCoreOwnerId)
        || selectedMemberIds.has(program.toOwnerId)
    ));
  });
}

/**
 * Co-op keeps every chosen nation sovereign. Only countries without a human
 * seat receive the terminal-timeline civilian and 20%-military opening shock;
 * no local account's wider solo unlock roster is consulted or absorbed.
 */
export function prepareMultiplayerSurvivalRosterV2(
  state: WorldStateV2,
  content: WorldContentV2,
  selectedHumanIds: readonly PlayerId[],
): SurvivalEmpireFormationResultV2 {
  if (content.metadata?.scenarioId !== 'survival') {
    return { accepted: false, reason: 'A Survival roster can only be prepared in Survival.' };
  }
  if (state.tick !== 0 || state.gameOver) {
    return { accepted: false, reason: 'The co-op Survival roster must be prepared before week one.' };
  }
  const selected = [...new Set(selectedHumanIds)]
    .sort((left, right) => left.localeCompare(right));
  const configured = [...selectHumanPlayerIdsV2(state)]
    .sort((left, right) => left.localeCompare(right));
  if (selected.length < 2 || selected.length !== configured.length
    || selected.some((playerId, index) => playerId !== configured[index])
    || selected.some((playerId) => !isHumanSelectableNationV2(content, playerId)
      || !state.players[playerId])) {
    return { accepted: false, reason: 'Every selected co-op country must match a living human seat.' };
  }

  const selectedSet = new Set(selected);
  const weakenedNationIds = content.nationIds
    .filter((playerId) => isHumanSelectableNationV2(content, playerId)
      && !selectedSet.has(playerId)
      && Boolean(state.players[playerId]))
    .sort((left, right) => left.localeCompare(right));
  const weakenedSet = new Set(weakenedNationIds);
  const weakenedTerritoryIds = content.territoryIds
    .filter((territoryId) => {
      const owner = state.territories[territoryId]?.owner;
      return owner !== undefined && weakenedSet.has(owner);
    })
    .sort((left, right) => left.localeCompare(right));

  for (const territoryId of weakenedTerritoryIds) {
    const territory = state.territories[territoryId]!;
    territory.economy = round(Math.max(
      0.10,
      territory.economy * SURVIVAL_OCCUPATION_ECONOMY_FACTOR_V2,
    ), 9);
    territory.population = round(Math.max(
      0.01,
      territory.population * SURVIVAL_OCCUPATION_POPULATION_FACTOR_V2,
    ), 9);
    territory.army.manpower = round(
      territory.army.manpower * SURVIVAL_OCCUPATION_MANPOWER_FACTOR_V2,
      9,
    );
  }
  for (const playerId of weakenedNationIds) {
    const nation = state.players[playerId]!;
    nation.treasury = round(
      nation.treasury * SURVIVAL_OCCUPATION_ECONOMY_FACTOR_V2,
      9,
    );
    nation.trainedReserves = round(
      nation.trainedReserves * SURVIVAL_OCCUPATION_MANPOWER_FACTOR_V2,
      9,
    );
    nation.openingArmyBonus = null;
  }
  state.runProgression.scorchedWorldTerritoryIds = [];
  invalidateTerritoryIndexV2(state);
  invalidateNationIndexV2(state);
  synchronizeArmyCapacityV2(state, content);
  addWorldEventV2(
    state,
    'system',
    'action',
    `CO-OP SURVIVAL: ${selected.length} sovereign human countries hold the line together. ${weakenedNationIds.length} independent nations begin with 20% military strength.`,
    undefined,
    state.humanPlayerId,
  );
  return {
    accepted: true,
    memberIds: selected,
    weakenedTerritoryIds,
    occupiedTerritoryIds: weakenedTerritoryIds,
  };
}

/**
 * Fuses the account-provided Survival roster into one ordinary flagship empire.
 * The roster is treated as an already-authorized list: this simulation layer
 * validates that every entry is a living, human-selectable nation but never
 * reads or mutates the persistent commander profile.
 */
export function formSurvivalEmpireV2(
  state: WorldStateV2,
  content: WorldContentV2,
  flagshipId: PlayerId,
  memberIds: readonly PlayerId[],
): SurvivalEmpireFormationResultV2 {
  if (content.metadata?.scenarioId !== 'survival') {
    return { accepted: false, reason: 'A unified starting empire is exclusive to Survival.' };
  }
  if (state.tick !== 0) {
    return { accepted: false, reason: 'The Survival empire must be formed before week one.' };
  }
  if (state.gameOver) return { accepted: false, reason: 'The campaign has already ended.' };
  if (state.humanPlayerId !== flagshipId
    || selectHumanPlayerIdsV2(state).some((playerId) => playerId !== flagshipId)) {
    return { accepted: false, reason: 'The Survival flagship must be the sole selected human country.' };
  }
  if (!isHumanSelectableNationV2(content, flagshipId)
    || isRogueAiNationV2(content, flagshipId)
    || !state.players[flagshipId]
    || !Object.values(state.territories).some((territory) => territory.owner === flagshipId)) {
    return { accepted: false, reason: 'The Survival flagship must be a living human country.' };
  }

  const canonicalMemberIds = [...new Set([flagshipId, ...memberIds])]
    .filter((playerId) => (
      isHumanSelectableNationV2(content, playerId)
        && !isRogueAiNationV2(content, playerId)
        && Boolean(state.players[playerId])
        && Object.values(state.territories).some((territory) => territory.owner === playerId)
    ))
    .sort((left, right) => left.localeCompare(right));
  const absorbedMemberIds = canonicalMemberIds.filter((playerId) => playerId !== flagshipId);
  const unlockedMembers = new Set(canonicalMemberIds);
  const weakenedNationIds = content.nationIds
    .filter((playerId) => (
      isHumanSelectableNationV2(content, playerId)
        && !unlockedMembers.has(playerId)
        && Boolean(state.players[playerId])
        && Object.values(state.territories).some((territory) => territory.owner === playerId)
    ))
    .sort((left, right) => left.localeCompare(right));
  const retiringNationIds = new Set(absorbedMemberIds);
  if (selectedMemberBlocksFormationV2(state, retiringNationIds)) {
    return {
      accepted: false,
      reason: 'A Survival member is already involved in a war or territorial integration.',
    };
  }

  const transferredTerritoryIds = (Object.entries(state.territories) as Array<[
    TerritoryId,
    WorldStateV2['territories'][TerritoryId],
  ]>)
    .filter(([, territory]) => absorbedMemberIds.includes(territory.owner))
    .map(([territoryId]) => territoryId)
    .sort((left, right) => left.localeCompare(right));
  const weakenedNationSet = new Set(weakenedNationIds);
  const weakenedTerritoryIds = (Object.entries(state.territories) as Array<[
    TerritoryId,
    WorldStateV2['territories'][TerritoryId],
  ]>)
    .filter(([, territory]) => weakenedNationSet.has(territory.owner))
    .map(([territoryId]) => territoryId)
    .sort((left, right) => left.localeCompare(right));
  const alreadyFormed = weakenedTerritoryIds.length > 0
    && weakenedTerritoryIds.every((territoryId) => {
      const territory = state.territories[territoryId]!;
      const baseline = content.territories[territoryId]!.baseline;
      return territory.economy <= Math.max(
        0.10,
        baseline.gdp * SURVIVAL_OCCUPATION_ECONOMY_FACTOR_V2,
      ) + 0.000001
        && territory.population <= Math.max(
          0.01,
          baseline.population * SURVIVAL_OCCUPATION_POPULATION_FACTOR_V2,
        ) + 0.000001;
    });
  if (alreadyFormed) {
    return { accepted: false, reason: 'The Survival starting empire is already formed.' };
  }

  for (const territoryId of transferredTerritoryIds) {
    const territory = state.territories[territoryId]!;
    territory.owner = flagshipId;
    territory.coreOwner = flagshipId;
    territory.integration = 1;
    delete territory.integrationProgram;
  }
  for (const territoryId of weakenedTerritoryIds) {
    const territory = state.territories[territoryId]!;
    // The Rogue signal shatters institutions but does not teleport ownership.
    // Every country remains an independent actor until a physical wave wins a
    // normal war through one of the authored gateway corridors.
    territory.economy = round(Math.max(
      0.10,
      territory.economy * SURVIVAL_OCCUPATION_ECONOMY_FACTOR_V2,
    ), 9);
    territory.population = round(Math.max(
      0.01,
      territory.population * SURVIVAL_OCCUPATION_POPULATION_FACTOR_V2,
    ), 9);
    territory.army.manpower = round(
      territory.army.manpower * SURVIVAL_OCCUPATION_MANPOWER_FACTOR_V2,
      9,
    );
    // Quality is an identity, not a second force-size multiplier: a damaged
    // United States formation must still outperform a damaged microstate.
    territory.army.baseAttack = round(
      territory.army.baseAttack * SURVIVAL_OCCUPATION_QUALITY_FACTOR_V2,
      9,
    );
    territory.army.baseDefense = round(
      territory.army.baseDefense * SURVIVAL_OCCUPATION_QUALITY_FACTOR_V2,
      9,
    );
  }
  // `scorchedWorldTerritoryIds` deliberately starts empty. It records only
  // territories a physical Antarctic-origin wave has actually captured; only
  // those become permanent zero-production transit nodes after liberation.
  state.runProgression.scorchedWorldTerritoryIds = [];
  invalidateTerritoryIndexV2(state);

  const flagship = state.players[flagshipId]!;
  for (const memberId of absorbedMemberIds) {
    if (!retireAbsorbedNationV2(state, content, memberId, flagshipId, true)) {
      throw new Error(`Survival empire formation could not retire member ${memberId}.`);
    }
  }
  for (const weakenedNationId of weakenedNationIds) {
    const weakenedNation = state.players[weakenedNationId]!;
    weakenedNation.treasury = round(
      weakenedNation.treasury * SURVIVAL_OCCUPATION_ECONOMY_FACTOR_V2,
      9,
    );
    weakenedNation.trainedReserves = round(
      weakenedNation.trainedReserves * SURVIVAL_OCCUPATION_MANPOWER_FACTOR_V2,
      9,
    );
    weakenedNation.openingArmyBonus = null;
  }

  const retired = retiringNationIds;
  state.firstIntegrationDiscountUsedBy = state.firstIntegrationDiscountUsedBy
    .filter((playerId) => !retired.has(playerId));
  state.truces = state.truces.filter((truce) => (
    !retired.has(truce.leftId) && !retired.has(truce.rightId)
  ));
  state.ceasefireObligations = state.ceasefireObligations.filter((obligation) => (
    !retired.has(obligation.payerId) && !retired.has(obligation.payeeId)
  ));
  state.offers = state.offers.filter((offer) => (
    !retired.has(offer.fromId) && !retired.has(offer.toId)
  ));
  state.allianceOffers = state.allianceOffers.filter((offer) => (
    !retired.has(offer.fromId) && !retired.has(offer.toId)
  ));
  pruneAllianceStateV2(state);
  state.humanPlayerId = flagshipId;
  state.humanPlayerIds = [flagshipId];
  state.aiEscalation.lastHumanTerritoryCount = Object.values(state.territories)
    .filter((territory) => territory.owner === flagshipId).length;
  state.aiEscalation.lastHumanPower = 0;
  invalidateNationIndexV2(state);
  synchronizeArmyCapacityV2(state, content);

  const flagshipName = content.nations[flagshipId]?.shortName ?? flagshipId;
  addWorldEventV2(
    state,
    'system',
    'action',
    `SURVIVAL COMMAND: ${flagshipName} unified ${canonicalMemberIds.length} unlocked countr${canonicalMemberIds.length === 1 ? 'y' : 'ies'}. ${weakenedNationIds.length} independent nations remain badly damaged while Antarctic waves prepare to breach.`,
    flagship.capitalId,
    flagshipId,
  );
  return {
    accepted: true,
    memberIds: canonicalMemberIds,
    territoryIds: transferredTerritoryIds,
    weakenedTerritoryIds,
    occupiedTerritoryIds: weakenedTerritoryIds,
  };
}
