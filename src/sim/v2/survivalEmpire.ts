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
  SURVIVAL_BASE_PACKET_ARMY_CAPACITY_FACTOR_V2,
  SURVIVAL_DAWNLINE_ARCTIC_NATION_IDS_V2,
  SURVIVAL_DAWNLINE_ACCORD_NAME_V2,
  applySurvivalOpeningArmyReadinessV2,
  isSurvivalDawnlineNationV2,
} from './survivalOrdinaryAi';
import {
  createMilitaryBaseSnapshotV2,
  invalidateNationIndexV2,
  invalidateTerritoryIndexV2,
  selectCurrentPowerV2,
  selectTerritoryPowerV2,
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
  readonly fullMemberIds?: readonly PlayerId[];
  readonly basePacketMemberIds?: readonly PlayerId[];
  readonly basePacketTerritoryIds?: readonly TerritoryId[];
  readonly roguePowerRatio?: number;
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

export { SURVIVAL_DAWNLINE_ARCTIC_NATION_IDS_V2 } from './survivalOrdinaryAi';

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

function survivalArcticOriginTerritoryIdsV2(
  state: WorldStateV2,
  content: WorldContentV2,
): TerritoryId[] {
  const arcticOrigins = new Set<string>(SURVIVAL_DAWNLINE_ARCTIC_NATION_IDS_V2);
  return content.territoryIds.filter((territoryId) => {
    const originId = content.territories[territoryId]?.initialOwnerId;
    return originId !== undefined
      && arcticOrigins.has(originId)
      && Boolean(state.territories[territoryId]);
  }).sort((left, right) => left.localeCompare(right));
}

export interface SurvivalArcticPowerBenchmarkV2 {
  readonly allBasePower: number;
  readonly effectivePower: number;
  readonly unlockMasteryExtraPower: number;
  readonly rogueTargetPower: number;
}

/**
 * Quotes only Arctic-origin formations. The cloned all-base counterfactual
 * marks every Arctic territory as a neutral 50% packet, so unlocked capacity
 * and local mastery become measurable upside without mutating the live run.
 */
export function selectSurvivalArcticPowerBenchmarkV2(
  state: WorldStateV2,
  content: WorldContentV2,
): SurvivalArcticPowerBenchmarkV2 {
  const territoryIds = survivalArcticOriginTerritoryIdsV2(state, content);
  const effectiveSnapshot = createMilitaryBaseSnapshotV2(state, content);
  const effectivePower = round(territoryIds.reduce((sum, territoryId) => (
    sum + selectTerritoryPowerV2(state, content, territoryId, effectiveSnapshot)
  ), 0), 9);

  const allBaseState = structuredClone(state);
  for (const territoryId of territoryIds) {
    allBaseState.territories[territoryId]!.survivalBasePacket = true;
  }
  synchronizeArmyCapacityV2(allBaseState, content);
  applySurvivalOpeningArmyReadinessV2(allBaseState, content);
  const allBaseSnapshot = createMilitaryBaseSnapshotV2(allBaseState, content);
  const allBasePower = round(territoryIds.reduce((sum, territoryId) => (
    sum + selectTerritoryPowerV2(allBaseState, content, territoryId, allBaseSnapshot)
  ), 0), 9);
  const unlockMasteryExtraPower = round(Math.max(0, effectivePower - allBasePower), 9);
  return {
    allBasePower,
    effectivePower,
    unlockMasteryExtraPower,
    rogueTargetPower: round(
      allBasePower * SURVIVAL_ROGUE_DAWNLINE_POWER_RATIO_V2
        + unlockMasteryExtraPower * 0.50,
      9,
    ),
  };
}

/**
 * Calibrates the physical Antarctic army against the player's effective
 * Arctic-origin contribution. The old leader parameter is ignored so legacy
 * callers compile while new openings no longer require a separate NPC bloc.
 */
export function balanceSurvivalRogueAgainstDawnlineV2(
  state: WorldStateV2,
  content: WorldContentV2,
  _legacyDawnlineLeaderId?: PlayerId,
): number {
  const rogue = state.players[ROGUE_AI_NATION_ID_V2];
  if (!rogue) return 0;
  const benchmark = selectSurvivalArcticPowerBenchmarkV2(state, content);
  let roguePower = selectCurrentPowerV2(state, content, ROGUE_AI_NATION_ID_V2);
  const territoryIds = rogueAntarcticTerritoryIdsV2(state);
  const activeManpower = territoryIds.reduce((sum, territoryId) => (
    sum + Math.max(0, state.territories[territoryId]?.army.manpower ?? 0)
  ), 0);
  if (benchmark.rogueTargetPower <= 0 || benchmark.effectivePower <= 0
    || roguePower <= 0 || activeManpower <= 0) return 0;

  const targetPower = benchmark.rogueTargetPower;
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
  return round(roguePower / benchmark.effectivePower, 9);
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

interface SurvivalMemberMergeV2 {
  readonly absorbedMemberIds: readonly PlayerId[];
  readonly transferredTerritoryIds: readonly TerritoryId[];
  readonly basePacketTerritoryIds: readonly TerritoryId[];
}

/**
 * Permanently folds full and Base Packet members into a real human backend.
 * Base Packets surrender only half their opening treasury and never merge
 * research. Their physical economy and population are deliberately untouched.
 */
function mergeSurvivalMembersIntoHostV2(
  state: WorldStateV2,
  content: WorldContentV2,
  hostId: PlayerId,
  fullMemberIds: readonly PlayerId[],
  basePacketMemberIds: readonly PlayerId[],
): SurvivalMemberMergeV2 {
  const full = new Set(fullMemberIds);
  const base = new Set(basePacketMemberIds.filter((memberId) => !full.has(memberId)));
  const absorbedMemberIds = [...new Set([...full, ...base])]
    .filter((memberId) => memberId !== hostId)
    .sort((left, right) => left.localeCompare(right));
  const absorbed = new Set(absorbedMemberIds);
  const transferredTerritoryIds: TerritoryId[] = [];
  const basePacketTerritoryIds: TerritoryId[] = [];

  for (const territoryId of content.territoryIds) {
    const territory = state.territories[territoryId];
    if (!territory || !absorbed.has(territory.owner)) continue;
    const sourceOwnerId = territory.owner;
    territory.owner = hostId;
    territory.coreOwner = hostId;
    territory.integration = 1;
    delete territory.integrationProgram;
    if (base.has(sourceOwnerId)) {
      territory.survivalBasePacket = true;
      basePacketTerritoryIds.push(territoryId);
    } else {
      delete territory.survivalBasePacket;
    }
    transferredTerritoryIds.push(territoryId);
  }
  invalidateTerritoryIndexV2(state);

  for (const memberId of absorbedMemberIds) {
    const basePacket = base.has(memberId);
    if (basePacket && state.players[memberId]) {
      state.players[memberId]!.treasury = round(
        state.players[memberId]!.treasury
          * SURVIVAL_BASE_PACKET_ARMY_CAPACITY_FACTOR_V2,
        9,
      );
    }
    if (!retireAbsorbedNationV2(state, content, memberId, hostId, !basePacket)) {
      throw new Error(`Survival empire formation could not retire member ${memberId}.`);
    }
  }
  invalidateNationIndexV2(state);
  return {
    absorbedMemberIds,
    transferredTerritoryIds: transferredTerritoryIds
      .sort((left, right) => left.localeCompare(right)),
    basePacketTerritoryIds: basePacketTerritoryIds
      .sort((left, right) => left.localeCompare(right)),
  };
}

function prepareSurvivalOpeningForcesV2(
  state: WorldStateV2,
  content: WorldContentV2,
): number {
  synchronizeArmyCapacityV2(state, content);
  applySurvivalOpeningArmyReadinessV2(state, content);
  return balanceSurvivalRogueAgainstDawnlineV2(state, content);
}

/**
 * Co-op keeps every chosen nation sovereign and fully deployed. Every
 * unselected authored Arctic state becomes a 50% Base Packet of the primary
 * human host; no separate NPC controller or alliance is created.
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
    return { accepted: false, reason: 'The co-op Survival roster must be prepared before day one.' };
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
  const allArcticMemberIds = survivalDawnlineNationIdsV2(
    state,
    content,
    new Set<PlayerId>(),
  );
  const selectedSet = new Set(selected);
  const basePacketMemberIds = allArcticMemberIds
    .filter((memberId) => !selectedSet.has(memberId))
    .sort((left, right) => left.localeCompare(right));
  if (selectedMemberBlocksFormationV2(state, new Set(basePacketMemberIds))) {
    return {
      accepted: false,
      reason: 'An Arctic Base Packet member is already involved in a war or territorial integration.',
    };
  }
  invalidateTerritoryIndexV2(state);
  invalidateNationIndexV2(state);
  pruneAllianceStateV2(state);
  const hostId = state.humanPlayerId;
  const merged = mergeSurvivalMembersIntoHostV2(
    state,
    content,
    hostId,
    [hostId],
    basePacketMemberIds,
  );
  pruneAllianceStateV2(state);
  state.aiEscalation.lastHumanTerritoryCount = Object.values(state.territories)
    .filter((territory) => territory.owner === hostId).length;
  state.aiEscalation.lastHumanPower = 0;
  const roguePowerRatio = prepareSurvivalOpeningForcesV2(state, content);
  addWorldEventV2(
    state,
    'system',
    'action',
    `CO-OP SURVIVAL: ${selected.length} sovereign human commands deploy at full power. ${basePacketMemberIds.length} unselected Arctic countr${basePacketMemberIds.length === 1 ? 'y joins' : 'ies join'} the primary Dawnline Empire as 50% Base Packets; no separate NPC bloc deploys. The Rogue holds Antarctica and opens all three gateways.`,
    undefined,
    hostId,
  );
  return {
    accepted: true,
    memberIds: selected,
    territoryIds: merged.transferredTerritoryIds,
    fullMemberIds: selected,
    basePacketMemberIds,
    basePacketTerritoryIds: merged.basePacketTerritoryIds,
    roguePowerRatio,
    dawnlineLeaderId: undefined,
    dawnlineMemberIds: [],
    dawnlineTerritoryIds: [],
    weakenedTerritoryIds: merged.basePacketTerritoryIds,
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
    return { accepted: false, reason: 'The Survival empire must be formed before day one.' };
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

  const fullMemberIds = [...new Set([flagshipId, ...memberIds])]
    .filter((playerId) => (
      isHumanSelectableNationV2(content, playerId)
        && !isRogueAiNationV2(content, playerId)
        && Boolean(state.players[playerId])
        && Object.values(state.territories).some((territory) => territory.owner === playerId)
    ))
    .sort((left, right) => left.localeCompare(right));
  const fullMemberSet = new Set(fullMemberIds);
  const arcticMemberIds = survivalDawnlineNationIdsV2(
    state,
    content,
    new Set<PlayerId>(),
  );
  const basePacketMemberIds = arcticMemberIds
    .filter((playerId) => !fullMemberSet.has(playerId))
    .sort((left, right) => left.localeCompare(right));
  const canonicalMemberIds = [...new Set([...fullMemberIds, ...arcticMemberIds])]
    .sort((left, right) => left.localeCompare(right));
  const absorbedMemberIds = canonicalMemberIds.filter((playerId) => playerId !== flagshipId);
  const retiringNationIds = new Set(absorbedMemberIds);
  if (selectedMemberBlocksFormationV2(state, retiringNationIds)) {
    return {
      accepted: false,
      reason: 'A Survival member is already involved in a war or territorial integration.',
    };
  }

  const flagship = state.players[flagshipId]!;
  const merged = mergeSurvivalMembersIntoHostV2(
    state,
    content,
    flagshipId,
    fullMemberIds,
    basePacketMemberIds,
  );
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
  const roguePowerRatio = prepareSurvivalOpeningForcesV2(state, content);

  const flagshipName = content.nations[flagshipId]?.shortName ?? flagshipId;
  addWorldEventV2(
    state,
    'system',
    'action',
    `SURVIVAL COMMAND: ${flagshipName} leads one Dawnline Empire with ${fullMemberIds.length} full-power countr${fullMemberIds.length === 1 ? 'y' : 'ies'} and ${basePacketMemberIds.length} locked Arctic 50% Base Packet${basePacketMemberIds.length === 1 ? '' : 's'}. Every member is fused into the flagship; no separate NPC bloc deploys. The Rogue holds Antarctica and opens all three gateways.`,
    flagship.capitalId,
    flagshipId,
  );
  return {
    accepted: true,
    memberIds: canonicalMemberIds,
    territoryIds: merged.transferredTerritoryIds,
    fullMemberIds,
    basePacketMemberIds,
    basePacketTerritoryIds: merged.basePacketTerritoryIds,
    roguePowerRatio,
    dawnlineLeaderId: undefined,
    dawnlineMemberIds: [],
    dawnlineTerritoryIds: [],
    weakenedTerritoryIds: merged.basePacketTerritoryIds,
    occupiedTerritoryIds: [],
  };
}
