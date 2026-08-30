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
import {
  clearRogueWaveManpowerV2,
  rogueWaveManpowerAtV2,
} from './survivalProvenance';
import {
  SURVIVAL_DAWNLINE_ACCORD_NAME_V2,
  isSurvivalDawnlineNationV2,
} from './survivalOrdinaryAi';
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
  /** Independent surviving faction, deliberately remote from the human fronts. */
  readonly dawnlineLeaderId?: PlayerId;
  readonly dawnlineMemberIds?: readonly PlayerId[];
  readonly dawnlineTerritoryIds?: readonly TerritoryId[];
  /** @deprecated Use dawnlineTerritoryIds. */
  readonly weakenedTerritoryIds?: readonly TerritoryId[];
  /** World countries already held as non-productive Rogue transit territory. */
  readonly occupiedTerritoryIds?: readonly TerritoryId[];
}

/**
 * Independent countries retain half of their civilian economy/population and
 * a deliberately reduced effective Army Capacity. Their field army starts at
 * 100% of that smaller cap, keeps national combat quality and can fight until
 * a real Rogue wave wins.
 */
export const SURVIVAL_OCCUPATION_ECONOMY_FACTOR_V2 = 0.50;
export const SURVIVAL_OCCUPATION_POPULATION_FACTOR_V2 = 0.50;
/** @deprecated Opening manpower is normalized to the reduced live cap. */
export const SURVIVAL_OCCUPATION_MANPOWER_FACTOR_V2 = 1;
export const SURVIVAL_OCCUPATION_QUALITY_FACTOR_V2 = 1;
export const SURVIVAL_SCORCHED_ECONOMY_CEILING_FACTOR_V2 = 0.025;
export const SURVIVAL_SCORCHED_POPULATION_CEILING_FACTOR_V2 = 0.12;

function fillOpeningTerritoriesToCapacityV2(
  state: WorldStateV2,
  territoryIds: readonly TerritoryId[],
): void {
  for (const territoryId of territoryIds) {
    const territory = state.territories[territoryId];
    if (!territory) continue;
    territory.army.manpower = round(territory.army.capacity, 9);
  }
}

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
  markSurvivalScorchedTerritoriesV2(state, content, [territoryId]);
}

/**
 * Bulk opening/capture path. Merging and sorting the registry once prevents a
 * Survival bootstrap from repeatedly reallocating the same 160-entry array.
 */
export function markSurvivalScorchedTerritoriesV2(
  state: WorldStateV2,
  content: WorldContentV2,
  territoryIds: readonly TerritoryId[],
): void {
  if (content.metadata?.scenarioId !== 'survival') return;
  const registry = new Set(state.runProgression.scorchedWorldTerritoryIds);
  for (const territoryId of territoryIds) {
    if ((content.territories[territoryId]?.kind ?? 'sovereign') === 'sovereign') {
      registry.add(territoryId);
    }
  }
  state.runProgression.scorchedWorldTerritoryIds = [...registry]
    .sort((left, right) => left.localeCompare(right));
  // Capture is latency-sensitive. Enforce only the new/changed nodes here;
  // weekly and load-boundary normalization still audits the full registry.
  for (const territoryId of territoryIds) {
    enforceSurvivalScorchedTerritoryV2(state, content, territoryId);
  }
}

interface SurvivalOpeningWorldResultV2 {
  readonly dawnlineNationIds: readonly PlayerId[];
  readonly dawnlineTerritoryIds: readonly TerritoryId[];
  readonly occupiedNationIds: readonly PlayerId[];
  readonly occupiedTerritoryIds: readonly TerritoryId[];
}

/**
 * Selects one small, connected survival cluster elsewhere on the planet. No
 * member may directly border a human-owned territory: every human contact is
 * therefore a real Rogue border, while Dawnline owns a separate theatre.
 */
export function survivalDawnlineNationIdsV2(
  state: WorldStateV2,
  content: WorldContentV2,
  protectedOwnerIds: ReadonlySet<PlayerId>,
): PlayerId[] {
  const humanBorderNationIds = new Set<PlayerId>();
  for (const territoryId of content.territoryIds) {
    const ownerId = state.territories[territoryId]?.owner;
    if (!ownerId || !protectedOwnerIds.has(ownerId)) continue;
    for (const connection of content.territories[territoryId]?.connections ?? []) {
      const neighbor = state.territories[connection.targetId];
      if (!neighbor || protectedOwnerIds.has(neighbor.owner)
        || neighbor.owner === ROGUE_AI_NATION_ID_V2
        || (content.territories[connection.targetId]?.kind ?? 'sovereign') !== 'sovereign'
        || !isHumanSelectableNationV2(content, neighbor.owner)) continue;
      humanBorderNationIds.add(neighbor.owner);
    }
  }

  const eligible = (Object.keys(state.players) as PlayerId[])
    .filter((playerId) => isHumanSelectableNationV2(content, playerId)
      && !protectedOwnerIds.has(playerId)
      && !humanBorderNationIds.has(playerId))
    .sort((left, right) => left.localeCompare(right));
  const eligibleSet = new Set(eligible);
  const neighbors = new Map<PlayerId, Set<PlayerId>>(eligible.map((id) => [id, new Set()]));
  const strength = new Map<PlayerId, number>(eligible.map((id) => [id, 0]));
  for (const territoryId of content.territoryIds) {
    const territory = state.territories[territoryId];
    if (!territory || !eligibleSet.has(territory.owner)) continue;
    strength.set(territory.owner, (strength.get(territory.owner) ?? 0)
      + Math.log10(1 + Math.max(0, territory.economy))
      + Math.sqrt(Math.max(0, territory.army.capacity)));
    for (const connection of content.territories[territoryId]?.connections ?? []) {
      const neighborOwnerId = state.territories[connection.targetId]?.owner;
      if (neighborOwnerId && neighborOwnerId !== territory.owner
        && eligibleSet.has(neighborOwnerId)) neighbors.get(territory.owner)!.add(neighborOwnerId);
    }
  }
  const preferred = new Map<PlayerId, number>([
    ['nor', 0], ['swe', 1], ['fin', 2],
  ].map(([id, rank]) => [id as PlayerId, rank as number]));
  const compare = (left: PlayerId, right: PlayerId): number => (
    (preferred.get(left) ?? Number.MAX_SAFE_INTEGER)
      - (preferred.get(right) ?? Number.MAX_SAFE_INTEGER)
      || (neighbors.get(right)?.size ?? 0) - (neighbors.get(left)?.size ?? 0)
      || (strength.get(right) ?? 0) - (strength.get(left) ?? 0)
      || left.localeCompare(right)
  );
  const seed = [...eligible].sort(compare)[0];
  if (!seed) return [];
  const selected: PlayerId[] = [seed];
  const selectedSet = new Set(selected);
  while (selected.length < 3) {
    const next = [...new Set(selected.flatMap((id) => [...(neighbors.get(id) ?? [])]))]
      .filter((id) => !selectedSet.has(id))
      .sort(compare)[0];
    if (!next) break;
    selected.push(next);
    selectedSet.add(next);
  }
  return selected.sort((left, right) => left.localeCompare(right));
}

/** Compatibility alias for older callers; this is no longer a player ring. */
export const survivalDefensiveRingNationIdsV2 = survivalDawnlineNationIdsV2;

export function selectSurvivalDawnlineLeaderIdV2(
  state: WorldStateV2,
): PlayerId | undefined {
  return (Object.keys(state.players) as PlayerId[])
    .filter((playerId) => isSurvivalDawnlineNationV2(state, playerId))
    .sort((left, right) => Number(state.humanPlayerIds.includes(right))
      - Number(state.humanPlayerIds.includes(left))
      || left.localeCompare(right))[0];
}

/**
 * Gives one controller the intact remote cluster without touching any host
 * territory. Physical economies and formations stay on their authored land;
 * only command ownership, stores and national backends are consolidated.
 */
export function unifySurvivalDawnlineAccordV2(
  state: WorldStateV2,
  content: WorldContentV2,
  leaderId: PlayerId,
  memberIds: readonly PlayerId[],
  territoryIds: readonly TerritoryId[],
): void {
  if (!state.players[leaderId]) {
    throw new Error(`Survival opening could not find Dawnline leader ${leaderId}.`);
  }
  state.players[leaderId]!.empireName = SURVIVAL_DAWNLINE_ACCORD_NAME_V2;
  const members = new Set(memberIds.filter((memberId) => memberId !== leaderId));
  for (const territoryId of territoryIds) {
    const territory = state.territories[territoryId];
    if (!territory || !members.has(territory.owner)) continue;
    territory.owner = leaderId;
    territory.coreOwner = leaderId;
    territory.integration = 1;
    delete territory.integrationProgram;
  }
  invalidateTerritoryIndexV2(state);
  for (const memberId of [...members].sort((left, right) => left.localeCompare(right))) {
    if (!retireAbsorbedNationV2(state, content, memberId, leaderId, true)) {
      throw new Error(`Survival opening could not unify Dawnline member ${memberId}.`);
    }
  }
  invalidateNationIndexV2(state);
}

/**
 * Establishes the terminal Survival map in one linear pass. The opening
 * garrisons are deliberately unverified placeholders: only later personnel
 * manufactured in Antarctica enter the provenance ledger and award rewards.
 */
function establishSurvivalOpeningWorldV2(
  state: WorldStateV2,
  content: WorldContentV2,
  protectedOwnerIds: ReadonlySet<PlayerId>,
  retainAiDawnline = true,
): SurvivalOpeningWorldResultV2 {
  const dawnlineNationIds = retainAiDawnline
    ? survivalDawnlineNationIdsV2(state, content, protectedOwnerIds) : [];
  const dawnline = new Set(dawnlineNationIds);
  const occupiedNationIds = (Object.keys(state.players) as PlayerId[])
    .filter((playerId) => isHumanSelectableNationV2(content, playerId)
      && !protectedOwnerIds.has(playerId)
      && !dawnline.has(playerId))
    .sort((left, right) => left.localeCompare(right));
  const occupiedNations = new Set(occupiedNationIds);
  const dawnlineTerritoryIds: TerritoryId[] = [];
  const occupiedTerritoryIds: TerritoryId[] = [];

  for (const territoryId of content.territoryIds) {
    const territory = state.territories[territoryId];
    if (!territory
      || (content.territories[territoryId]?.kind ?? 'sovereign') !== 'sovereign') continue;
    if (dawnline.has(territory.owner)) {
      dawnlineTerritoryIds.push(territoryId);
      continue;
    }
    if (!occupiedNations.has(territory.owner)) continue;
    occupiedTerritoryIds.push(territoryId);
    territory.owner = ROGUE_AI_NATION_ID_V2;
    territory.coreOwner = ROGUE_AI_NATION_ID_V2;
    territory.integration = 0;
    delete territory.integrationProgram;
    // This small static screen force can fight, but is never entered in the
    // Antarctic-wave ledger and therefore never grants progression rewards.
    territory.army.manpower = round(Math.min(
      territory.army.manpower,
      Math.max(0.000005, territory.army.capacity * 0.002),
    ), 9);
    clearRogueWaveManpowerV2(state, territoryId);
  }

  markSurvivalScorchedTerritoriesV2(
    state,
    content,
    occupiedTerritoryIds,
  );
  invalidateTerritoryIndexV2(state);
  for (const playerId of occupiedNationIds) {
    const retired = retireAbsorbedNationV2(
      state,
      content,
      playerId,
      ROGUE_AI_NATION_ID_V2,
      false,
    );
    if (!retired) {
      throw new Error(`Survival opening could not retire occupied country ${playerId}.`);
    }
  }
  invalidateNationIndexV2(state);
  return {
    dawnlineNationIds,
    dawnlineTerritoryIds: dawnlineTerritoryIds
      .sort((left, right) => left.localeCompare(right)),
    occupiedNationIds,
    occupiedTerritoryIds: occupiedTerritoryIds
      .sort((left, right) => left.localeCompare(right)),
  };
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
 * seat receive the terminal-timeline civilian and military opening shock;
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
  if (state.runProgression.scorchedWorldTerritoryIds.length > 0) {
    return { accepted: false, reason: 'The co-op Survival world is already prepared.' };
  }

  const opening = establishSurvivalOpeningWorldV2(
    state,
    content,
    new Set(selected),
    true,
  );
  const dawnlineLeaderId = selected.find((playerId) => playerId !== state.humanPlayerId);
  if (dawnlineLeaderId) {
    unifySurvivalDawnlineAccordV2(
      state,
      content,
      dawnlineLeaderId,
      opening.dawnlineNationIds,
      opening.dawnlineTerritoryIds,
    );
  }
  invalidateTerritoryIndexV2(state);
  invalidateNationIndexV2(state);
  pruneAllianceStateV2(state);
  synchronizeArmyCapacityV2(state, content);
  enforceSurvivalScorchedWorldV2(state, content);
  fillOpeningTerritoriesToCapacityV2(state, opening.dawnlineTerritoryIds);
  addWorldEventV2(
    state,
    'system',
    'action',
    `CO-OP SURVIVAL: ${selected.length} sovereign human empires hold separate fronts. ${dawnlineLeaderId ? `${SURVIVAL_DAWNLINE_ACCORD_NAME_V2} is commanded by the second seat. ` : ''}The Rogue AI already controls ${opening.occupiedNationIds.length} world countries as Antarctic-fed transit territory.`,
    undefined,
    state.humanPlayerId,
  );
  return {
    accepted: true,
    memberIds: selected,
    dawnlineLeaderId,
    dawnlineMemberIds: dawnlineLeaderId
      ? [dawnlineLeaderId, ...opening.dawnlineNationIds] : opening.dawnlineNationIds,
    dawnlineTerritoryIds: [...new Set([
      ...(dawnlineLeaderId
        ? content.territoryIds.filter((territoryId) => (
          state.territories[territoryId]?.owner === dawnlineLeaderId
        )) : []),
      ...opening.dawnlineTerritoryIds,
    ])].sort((left, right) => left.localeCompare(right)),
    weakenedTerritoryIds: opening.dawnlineTerritoryIds,
    occupiedTerritoryIds: opening.occupiedTerritoryIds,
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
  if (state.runProgression.scorchedWorldTerritoryIds.length > 0) {
    return { accepted: false, reason: 'The Survival starting empire is already formed.' };
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

  for (const territoryId of transferredTerritoryIds) {
    const territory = state.territories[territoryId]!;
    territory.owner = flagshipId;
    territory.coreOwner = flagshipId;
    territory.integration = 1;
    delete territory.integrationProgram;
  }
  invalidateTerritoryIndexV2(state);

  const flagship = state.players[flagshipId]!;
  for (const memberId of absorbedMemberIds) {
    if (!retireAbsorbedNationV2(state, content, memberId, flagshipId, true)) {
      throw new Error(`Survival empire formation could not retire member ${memberId}.`);
    }
  }
  const opening = establishSurvivalOpeningWorldV2(
    state,
    content,
    new Set([flagshipId]),
  );
  const dawnlineLeaderId = opening.dawnlineNationIds[0];
  if (dawnlineLeaderId) {
    unifySurvivalDawnlineAccordV2(
      state,
      content,
      dawnlineLeaderId,
      opening.dawnlineNationIds,
      opening.dawnlineTerritoryIds,
    );
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
  enforceSurvivalScorchedWorldV2(state, content);
  fillOpeningTerritoriesToCapacityV2(state, opening.dawnlineTerritoryIds);

  const flagshipName = content.nations[flagshipId]?.shortName ?? flagshipId;
  addWorldEventV2(
    state,
    'system',
    'action',
    `SURVIVAL COMMAND: ${flagshipName} unified ${canonicalMemberIds.length} unlocked countr${canonicalMemberIds.length === 1 ? 'y' : 'ies'}. ${SURVIVAL_DAWNLINE_ACCORD_NAME_V2} holds a separate ${opening.dawnlineNationIds.length}-country theatre; the Rogue AI already holds ${opening.occupiedNationIds.length} world countries as Antarctic-fed transit territory.`,
    flagship.capitalId,
    flagshipId,
  );
  return {
    accepted: true,
    memberIds: canonicalMemberIds,
    territoryIds: transferredTerritoryIds,
    dawnlineLeaderId,
    dawnlineMemberIds: opening.dawnlineNationIds,
    dawnlineTerritoryIds: opening.dawnlineTerritoryIds,
    weakenedTerritoryIds: opening.dawnlineTerritoryIds,
    occupiedTerritoryIds: opening.occupiedTerritoryIds,
  };
}
