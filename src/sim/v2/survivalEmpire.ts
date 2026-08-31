import { pruneAllianceStateV2 } from './alliances';
import { round } from './balance';
import { synchronizeArmyCapacityV2 } from './capacity';
import {
  ANTARCTIC_TERRITORY_IDS_V2,
  ROGUE_AI_NATION_ID_V2,
  isHumanSelectableNationV2,
  isRogueAiNationV2,
  type WorldContentV2,
} from './content';
import { addWorldEventV2 } from './events';
import { selectHumanPlayerIdsV2 } from './humanPlayers';
import { retireAbsorbedNationV2 } from './integration';
import {
  SURVIVAL_DAWNLINE_ACCORD_NAME_V2,
  applySurvivalOpeningArmyReadinessV2,
  isSurvivalDawnlineNationV2,
} from './survivalOrdinaryAi';
import {
  invalidateNationIndexV2,
  invalidateTerritoryIndexV2,
  selectCurrentPowerV2,
  selectWeeklyFinanceBreakdownV2,
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
  /** Legacy fields retained for authenticated old saves and callers. */
  readonly dawnlineLeaderId?: PlayerId;
  readonly dawnlineMemberIds?: readonly PlayerId[];
  readonly dawnlineTerritoryIds?: readonly TerritoryId[];
  /** @deprecated Use dawnlineTerritoryIds. */
  readonly weakenedTerritoryIds?: readonly TerritoryId[];
  /** New Survival openings always return an empty list here. */
  readonly occupiedTerritoryIds?: readonly TerritoryId[];
}

/**
 * Compatibility constants from the retired occupied-world opening. New
 * Survival worlds preserve the complete ordinary population and economy.
 */
export const SURVIVAL_OCCUPATION_ECONOMY_FACTOR_V2 = 1;
export const SURVIVAL_OCCUPATION_POPULATION_FACTOR_V2 = 1;
/** @deprecated Every ordinary country now opens at full live capacity. */
export const SURVIVAL_OCCUPATION_MANPOWER_FACTOR_V2 = 1;
/** @deprecated Every ordinary country keeps its normal military quality. */
export const SURVIVAL_OCCUPATION_QUALITY_FACTOR_V2 = 1;
/** @deprecated Scorched economies are retired; this neutral factor is schema compatibility only. */
export const SURVIVAL_SCORCHED_ECONOMY_CEILING_FACTOR_V2 = 1;
/** @deprecated Scorched populations are retired; this neutral factor is schema compatibility only. */
export const SURVIVAL_SCORCHED_POPULATION_CEILING_FACTOR_V2 = 1;

/** Fixed geopolitical membership: never inferred from borders or map order. */
export const SURVIVAL_DAWNLINE_ARCTIC_NATION_IDS_V2 = Object.freeze([
  'can', 'dnk', 'fin', 'isl', 'nor', 'rus', 'swe', 'usa', 'grl',
] as const);

/** The opening machine army is deliberately only a little stronger. */
export const SURVIVAL_ROGUE_DAWNLINE_POWER_RATIO_V2 = 1.20;
/** Finite opening reserve measured against live weekly revenue and war burn. */
export const SURVIVAL_ROGUE_WAR_CHEST_YEARS_V2 = 7;

/**
 * Load-boundary migration for retired scorched-corridor saves. Population and
 * economy are reconstructed from immutable content, existing ownership and
 * personnel are preserved, and the territory becomes an ordinary full core.
 * The registry is then erased so no weekly system can re-zero the country.
 */
export function enforceSurvivalScorchedWorldV2(
  state: WorldStateV2,
  content: WorldContentV2,
): void {
  if (content.metadata?.scenarioId !== 'survival'
    || state.runProgression.scorchedWorldTerritoryIds.length === 0) return;
  for (const territoryId of state.runProgression.scorchedWorldTerritoryIds) {
    const territory = state.territories[territoryId];
    const definition = content.territories[territoryId];
    if (!territory || !definition || (definition.kind ?? 'sovereign') !== 'sovereign') continue;
    territory.population = definition.baseline.population;
    territory.economy = definition.baseline.gdp;
    territory.coreOwner = territory.owner;
    territory.integration = 1;
    delete territory.integrationProgram;
  }
  state.runProgression.scorchedWorldTerritoryIds = [];
  for (const progress of Object.values(state.runProgression.players)) {
    if (!progress) continue;
    progress.recapturedScorchedTerritoryIds = [];
  }
  invalidateTerritoryIndexV2(state);
  synchronizeArmyCapacityV2(state, content);
}

/** @deprecated Compatibility no-op. Survival captures are normal conquests. */
export function markSurvivalScorchedTerritoryV2(
  state: WorldStateV2,
  content: WorldContentV2,
  territoryId: TerritoryId,
): void {
  void state;
  void content;
  void territoryId;
}

/** @deprecated Compatibility no-op. It never recreates retired corridors. */
export function markSurvivalScorchedTerritoriesV2(
  state: WorldStateV2,
  content: WorldContentV2,
  territoryIds: readonly TerritoryId[],
): void {
  void state;
  void content;
  void territoryIds;
}

/**
 * Selects the authored Arctic counterweight. Human seats and every country in
 * an authorised solo roster are excluded; no neighbouring nation is ever
 * pulled into Dawnline merely because a border happens to touch the bloc.
 */
export function survivalDawnlineNationIdsV2(
  state: WorldStateV2,
  content: WorldContentV2,
  protectedOwnerIds: ReadonlySet<PlayerId>,
): PlayerId[] {
  return SURVIVAL_DAWNLINE_ARCTIC_NATION_IDS_V2
    .map((id) => id as PlayerId)
    .filter((playerId) => !protectedOwnerIds.has(playerId)
      && isHumanSelectableNationV2(content, playerId)
      && Boolean(state.players[playerId])
      && Object.values(state.territories).some((territory) => territory.owner === playerId));
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

const SURVIVAL_DAWNLINE_LEADER_PRIORITY_V2 = Object.freeze([
  'grl', 'usa', 'rus', 'can', 'nor', 'swe', 'fin', 'dnk', 'isl',
] as const);

function chooseSurvivalDawnlineLeaderIdV2(
  memberIds: readonly PlayerId[],
): PlayerId | undefined {
  const members = new Set(memberIds);
  return SURVIVAL_DAWNLINE_LEADER_PRIORITY_V2
    .map((id) => id as PlayerId)
    .find((id) => members.has(id));
}

function establishSurvivalDawnlineHumanAlliancesV2(
  state: WorldStateV2,
  dawnlineLeaderId: PlayerId,
): void {
  state.allianceOffers = state.allianceOffers.filter((offer) => (
    offer.fromId !== dawnlineLeaderId && offer.toId !== dawnlineLeaderId
  ));
  for (const humanId of selectHumanPlayerIdsV2(state)) {
    if (humanId === dawnlineLeaderId) continue;
    const [leftId, rightId] = [humanId, dawnlineLeaderId]
      .sort((left, right) => left.localeCompare(right)) as [PlayerId, PlayerId];
    if (!state.alliances.some((alliance) => (
      alliance.leftId === leftId && alliance.rightId === rightId
    ))) state.alliances.push({ leftId, rightId, formedTick: state.tick });
  }
  state.alliances.sort((left, right) => left.leftId.localeCompare(right.leftId)
    || left.rightId.localeCompare(right.rightId));
}

function rogueAntarcticTerritoryIdsV2(
  state: WorldStateV2,
): TerritoryId[] {
  return ANTARCTIC_TERRITORY_IDS_V2
    .filter((territoryId) => state.territories[territoryId]?.owner === ROGUE_AI_NATION_ID_V2);
}

function setRogueAntarcticManpowerV2(
  state: WorldStateV2,
  totalManpower: number,
): void {
  const territoryIds = rogueAntarcticTerritoryIdsV2(state);
  const totalCapacity = territoryIds.reduce((sum, territoryId) => (
    sum + Math.max(0, state.territories[territoryId]?.army.capacity ?? 0)
  ), 0);
  if (totalCapacity <= 0) return;
  let assigned = 0;
  territoryIds.forEach((territoryId, index) => {
    const territory = state.territories[territoryId]!;
    const allocation = index === territoryIds.length - 1
      ? Math.max(0, totalManpower - assigned)
      : totalManpower * Math.max(0, territory.army.capacity) / totalCapacity;
    territory.army.manpower = round(Math.min(territory.army.capacity, allocation), 9);
    assigned = round(assigned + territory.army.manpower, 9);
  });
}

/**
 * Calibrates the real Antarctic army against the fully deployed Dawnline bloc.
 * Any extra headroom is created through the ordinary force-capacity research
 * field before manpower is assigned, so weekly capacity synchronization keeps
 * the opening sustainable instead of treating it as an off-cap spawn.
 */
export function balanceSurvivalRogueAgainstDawnlineV2(
  state: WorldStateV2,
  content: WorldContentV2,
  dawnlineLeaderId: PlayerId,
): number {
  const rogue = state.players[ROGUE_AI_NATION_ID_V2];
  if (!rogue || !state.players[dawnlineLeaderId]) return 0;
  const dawnlinePower = selectCurrentPowerV2(state, content, dawnlineLeaderId);
  let roguePower = selectCurrentPowerV2(state, content, ROGUE_AI_NATION_ID_V2);
  const territoryIds = rogueAntarcticTerritoryIdsV2(state);
  const activeManpower = territoryIds.reduce((sum, territoryId) => (
    sum + Math.max(0, state.territories[territoryId]?.army.manpower ?? 0)
  ), 0);
  if (dawnlinePower <= 0 || roguePower <= 0 || activeManpower <= 0) return 0;

  const targetPower = dawnlinePower * SURVIVAL_ROGUE_DAWNLINE_POWER_RATIO_V2;
  let targetManpower = activeManpower * targetPower / roguePower;
  const currentCapacity = territoryIds.reduce((sum, territoryId) => (
    sum + Math.max(0, state.territories[territoryId]?.army.capacity ?? 0)
  ), 0);
  const currentLevel = Math.max(0, rogue.research.effectLevels['force-capacity'] ?? 0);
  const unresearchedCapacity = currentCapacity / Math.max(1, 1 + currentLevel * 0.01);
  if (targetManpower > currentCapacity && unresearchedCapacity > 0) {
    const requiredLevel = Math.ceil(
      (targetManpower * 1.01 / unresearchedCapacity - 1) * 100,
    );
    rogue.research.effectLevels['force-capacity'] = Math.max(currentLevel, requiredLevel);
    synchronizeArmyCapacityV2(state, content);
  }

  // A second linear correction absorbs selector rounding while retaining the
  // authored distribution across all nine physical Antarctic sectors.
  setRogueAntarcticManpowerV2(state, targetManpower);
  roguePower = selectCurrentPowerV2(state, content, ROGUE_AI_NATION_ID_V2);
  if (roguePower > 0) {
    targetManpower *= targetPower / roguePower;
    setRogueAntarcticManpowerV2(state, targetManpower);
    roguePower = selectCurrentPowerV2(state, content, ROGUE_AI_NATION_ID_V2);
  }
  return dawnlinePower > 0 ? round(roguePower / dawnlinePower, 9) : 0;
}

/** Funds a finite multi-year machine campaign from the final live war budget. */
export function fundSurvivalRogueWarChestV2(
  state: WorldStateV2,
  content: WorldContentV2,
): number {
  const rogue = state.players[ROGUE_AI_NATION_ID_V2];
  if (!rogue || content.metadata?.scenarioId !== 'survival') return 0;
  // Treasury-aware programme planning can spend more once the chest exists.
  // Iterate the authored runway quote to its bounded fixed point so the final
  // live budget—not a pre-funding low-cash budget—still has seven years.
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const finance = selectWeeklyFinanceBreakdownV2(
      state,
      content,
      ROGUE_AI_NATION_ID_V2,
    );
    const weeklyMilitaryAndOperations = finance.baseOperatingCost
      + finance.integrationCost
      + finance.totalMilitaryCost;
    const annualRunwayBasis = Math.max(
      finance.revenue,
      weeklyMilitaryAndOperations,
      0.001,
    ) * 52;
    const target = round(
      annualRunwayBasis * SURVIVAL_ROGUE_WAR_CHEST_YEARS_V2,
      9,
    );
    if (Math.abs(target - rogue.treasury) <= 0.000000001) break;
    rogue.treasury = target;
  }
  return rogue.treasury;
}

interface PreparedSurvivalDawnlineV2 {
  readonly leaderId?: PlayerId;
  readonly memberIds: readonly PlayerId[];
  readonly territoryIds: readonly TerritoryId[];
  readonly roguePowerRatio: number;
}

function prepareSurvivalDawnlineV2(
  state: WorldStateV2,
  content: WorldContentV2,
  protectedOwnerIds: ReadonlySet<PlayerId>,
): PreparedSurvivalDawnlineV2 {
  const memberIds = survivalDawnlineNationIdsV2(state, content, protectedOwnerIds);
  const leaderId = chooseSurvivalDawnlineLeaderIdV2(memberIds);
  if (!leaderId) {
    synchronizeArmyCapacityV2(state, content);
    applySurvivalOpeningArmyReadinessV2(state, content);
    return { memberIds: [], territoryIds: [], roguePowerRatio: 0 };
  }
  const memberSet = new Set(memberIds);
  const territoryIds = (Object.entries(state.territories) as Array<[TerritoryId, WorldStateV2['territories'][TerritoryId]]>)
    .filter(([, territory]) => memberSet.has(territory.owner))
    .map(([territoryId]) => territoryId)
    .sort((left, right) => left.localeCompare(right));
  unifySurvivalDawnlineAccordV2(state, content, leaderId, memberIds, territoryIds);
  synchronizeArmyCapacityV2(state, content);
  applySurvivalOpeningArmyReadinessV2(state, content);
  establishSurvivalDawnlineHumanAlliancesV2(state, leaderId);
  const roguePowerRatio = balanceSurvivalRogueAgainstDawnlineV2(state, content, leaderId);
  return { leaderId, memberIds, territoryIds, roguePowerRatio };
}

function survivalRosterAlreadyPreparedV2(state: WorldStateV2): boolean {
  return state.events.some((event) => event.tick === 0 && (
    event.message.startsWith('SURVIVAL COMMAND:')
      || event.message.startsWith('CO-OP SURVIVAL:')
  ));
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
 * Co-op keeps every chosen nation sovereign and fully deployed. The remaining
 * authored Arctic states form a full-strength NPC Dawnline; all other ordinary
 * AI countries retain normal economies, capacity and full opening readiness.
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
  if (survivalRosterAlreadyPreparedV2(state)) {
    return { accepted: false, reason: 'The co-op Survival world is already prepared.' };
  }
  invalidateTerritoryIndexV2(state);
  invalidateNationIndexV2(state);
  pruneAllianceStateV2(state);
  const dawnline = prepareSurvivalDawnlineV2(state, content, new Set(selected));
  addWorldEventV2(
    state,
    'system',
    'action',
    `CO-OP SURVIVAL: ${selected.length} sovereign human commands deploy at full strength beside Greenland-founded Arctic Dawnline. Every country begins fully mobilised with normal resources; the Antarctic Rogue opens all three gateways with roughly 20% more combat power than Dawnline.`,
    undefined,
    state.humanPlayerId,
  );
  return {
    accepted: true,
    memberIds: selected,
    dawnlineLeaderId: dawnline.leaderId,
    dawnlineMemberIds: dawnline.memberIds,
    dawnlineTerritoryIds: dawnline.territoryIds,
    weakenedTerritoryIds: [],
    occupiedTerritoryIds: [],
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
  if (survivalRosterAlreadyPreparedV2(state)) {
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
  const dawnline = prepareSurvivalDawnlineV2(
    state,
    content,
    new Set(canonicalMemberIds),
  );

  const flagshipName = content.nations[flagshipId]?.shortName ?? flagshipId;
  addWorldEventV2(
    state,
    'system',
    'action',
    `SURVIVAL COMMAND: ${flagshipName} unified ${canonicalMemberIds.length} unlocked countr${canonicalMemberIds.length === 1 ? 'y' : 'ies'} at full Army Capacity. Greenland-founded Arctic Dawnline deploys separately; every country begins fully mobilised with normal resources. The Rogue holds Antarctica, opens three gateways and begins roughly 20% stronger than Dawnline.`,
    flagship.capitalId,
    flagshipId,
  );
  return {
    accepted: true,
    memberIds: canonicalMemberIds,
    territoryIds: transferredTerritoryIds,
    dawnlineLeaderId: dawnline.leaderId,
    dawnlineMemberIds: dawnline.memberIds,
    dawnlineTerritoryIds: dawnline.territoryIds,
    weakenedTerritoryIds: [],
    occupiedTerritoryIds: [],
  };
}
