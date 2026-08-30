import {
  ALLIANCE_OFFER_DURATION_TICKS,
  PROPAGANDA_DURATION_TICKS,
  RESEARCH_BRANCHES,
  V2_MAP_ID,
  V2_RULES_VERSION,
  localFormationCapitulationThresholdV2,
  WAR_CAMPAIGN_MAX_TICKS,
  WAR_REVENGE_WINDOW_TICKS,
} from './balance';

/** Authenticates the retired save-only obligation shape before load strips it. */
const LEGACY_CEASEFIRE_PAYMENT_WEEKS = 52;
import {
  ANTARCTIC_GATEWAY_COUNTRY_ROUTES_V2,
  ANTARCTIC_TERRITORY_IDS_V2,
  ROGUE_AI_NATION_ID_V2,
  type WorldContentV2,
} from './content';
import { stateTerritoryArmyCapacityTargetV2 } from './capacity';
import {
  apexCapstoneCapabilityCountV2,
  selectCommanderRouteV2,
} from './commanderForce';
import { selectCoopMilitaryAccessRouteBetweenV2 } from './coopAccess';
import { isHumanPlayerV2 } from './humanPlayers';
import { OPENING_ARMY_BONUS_DURATION_TICKS_V2 } from './openingArmyBonus';
import {
  ANTARCTIC_SECTOR_IDS_V2,
  ARCTIC_PROJECT_IDS_V2,
} from './polarEndgame';
import {
  ANTARCTIC_GATEWAY_IDS_V2,
  deterministicAntarcticGatewayOrderV2,
  deterministicSurvivalAntarcticGatewayOrderV2,
} from './antarcticGateways';
import { contentVersionForWorldContentV2 } from './scenarios';
import {
  RUN_UPGRADES_V2,
  runProgressionModeForContentV2,
} from './runProgression';
import {
  finiteStateNumbersV2,
  relationKeyV2,
  selectArmyCombatManpowerV2,
  selectIsEliminatedV2,
  selectTerritoriesOfV2,
} from './selectors';
import {
  APEX_TRANSMISSION_IDS_V2,
  RUN_UPGRADE_IDS_V2,
  type CommanderEmpireSupportV2,
  type CommanderForceStateV2,
  type PlayerId,
  type TerritoryId,
  type WorldStateV2,
} from './types';

const NATION_KEYS = ['budget', 'capitalId', 'ceasefiresRequested', 'domesticFoodCapacity', 'empireName', 'foodSecurity', 'foodStock', 'manualActionUses', 'openingArmyBonus', 'propagandaAvailableTick', 'propagandaProgram', 'rapidRecruitmentAvailableTick', 'research', 'researchSurgeAvailableTick', 'trainedReserves', 'treasury', 'warFatigue'];
const TERRITORY_KEYS = ['army', 'coreOwner', 'economy', 'integration', 'integrationProgram', 'owner', 'population'];
const RESEARCH_KEYS = ['allocations', 'breakthroughs', 'effectLevels', 'progress'];
const BUDGET_KEYS = ['development', 'military', 'research'];
const MANUAL_ACTION_USE_KEYS = ['propaganda', 'rapidRecruitment', 'researchSurge'];
const EFFECT_KEYS = [
  'attack',
  'casualty-reduction',
  'defense',
  'economy-growth',
  'food-production',
  'food-storage',
  'force-capacity',
  'iq-increase',
  'operating-efficiency',
  'population-growth',
  'recovery',
  'reinforcement-efficiency',
  'reserve-mobilization',
  'reserve-training',
  'research-efficiency',
  'research-speed',
  'supply',
  'tax-efficiency',
  'training',
];
const BREAKTHROUGH_KEYS = [
  'advanced-weapons',
  'defensive-systems',
  'education-intelligence',
  'economy-science',
  'food-systems',
  'logistics-medicine',
  'military-industry',
  'population-recruitment',
  'public-administration',
  'reserve-doctrine',
];
const ARMY_KEYS = ['baseAttack', 'baseDefense', 'capacity', 'manpower'];
const PROPAGANDA_PROGRAM_KEYS = ['endsTick', 'startedTick', 'totalSuspicionReduction', 'weeklySuspicionReduction'];
const OPENING_ARMY_BONUS_KEYS = ['expiresTick', 'initialManpower', 'remainingManpower', 'startedTick'];
const LEGACY_COMMANDER_FORCE_KEYS = [
  'capabilities', 'countryTraitScale', 'economy', 'empireSupport', 'front', 'locationId', 'manualHoldUntilTick', 'mission', 'orderSource', 'shield', 'transit',
];
const COMMANDER_FORCE_KEYS = [...LEGACY_COMMANDER_FORCE_KEYS, 'doctrineRuntime'];
const COMMANDER_CAPABILITY_KEYS = [
  'assaultSpecialist', 'defenseSpecialist', 'emergencyExtractionCharges',
  'fieldHospital', 'forceMultiplier', 'mobileHeadquarters', 'rapidResponse',
];
const COMMANDER_SHIELD_KEYS = [
  'attackMultiplier', 'defenseMultiplier', 'integrity', 'maxIntegrity',
  'pulseAttack', 'rechargeBuffer', 'rechargeMultiplier',
  'pulseProjectionRetention', 'pulseChargeBonusPerStep',
  'interceptEfficiency', 'impactRecoveryShare', 'defensivePulseMultiplier',
];
const COMMANDER_ECONOMY_KEYS = ['annualOutput', 'priorities', 'supplyStock', 'treasury'];
const COMMANDER_PRIORITY_KEYS = ['development', 'logistics', 'training'];
const COMMANDER_EMPIRE_SUPPORT_KEYS = [
  'annualFoodOutput', 'foodImportCostMultiplier', 'foodProductionMultiplier', 'foodStorageMultiplier',
  'armyCasualtyMultiplier', 'armyPeaceRecoveryMultiplier',
  'recruitmentMultiplier', 'reserveTrainingMultiplier',
];
const COMMANDER_FRONT_KEYS = ['sourceId', 'targetId', 'warId'];
const COMMANDER_TRANSIT_KEYS = ['arriveTick', 'departTick', 'distanceKm', 'path'];
const APEX_DOCTRINE_RUNTIME_KEYS = [
  'emergencyRebootUsed', 'lancerSupportedAssaultCount', 'secondaryProjection',
];
const APEX_SECONDARY_PROJECTION_KEYS = [
  'front', 'locationId', 'mission', 'pairedPrimaryFront',
];
const INTEGRATION_PROGRAM_KEYS = ['annualCost', 'cause', 'completesTick', 'fromCoreOwnerId', 'fromOwnerId', 'startedTick', 'toOwnerId'];
const WAR_KEYS = ['apexTelemetryByPlayer', 'attackerCivilianLosses', 'attackerId', 'attackerLosses', 'attackerOperations', 'battles', 'campaign', 'defenderCivilianLosses', 'defenderId', 'defenderLosses', 'defenderOperations', 'id', 'lastBattleTick', 'lastPeaceOfferTick', 'reportBaselineByPlayer', 'revenge', 'startedTick', 'warScore'];
const WAR_REVENGE_KEYS = ['claimantId', 'expiresTick', 'triggeredTick'];
const WAR_CAMPAIGN_KEYS = ['attackerCaptures', 'attackerObjective', 'consolidationUntilTick', 'defenderCaptures', 'defenderObjective', 'expiresTick'];
const APEX_WAR_TELEMETRY_KEYS = [
  'integrityLosses', 'maxIntegrity', 'mirrorCounterpulseDamage', 'peakPower',
  'singularityPulses', 'supplyDelivered', 'supplySpent', 'supportedBattles',
  'twinProjectionBattles',
];
const WAR_REPORT_BASELINE_KEYS = [
  'allyContributorIds', 'allyLosses', 'allyPeakPower', 'allySupportedBattles',
  'capacityBefore', 'combatPowerBefore', 'effectiveAttackBefore',
  'effectiveDefenseBefore', 'ownedTerritoryIds', 'touchedTerritoryIds',
  'treasuryBefore', 'treasuryLost', 'treasurySeized',
];
const OPERATION_KEYS = ['access', 'commanderId', 'doctrine', 'holdUntilTick', 'lastBattleTick', 'momentum', 'sourceId', 'startedTick', 'targetId'];
const TRUCE_KEYS = ['expiresTick', 'leftId', 'rightId'];
const CEASEFIRE_OBLIGATION_KEYS = ['expiresTick', 'payeeId', 'payerId', 'startsTick', 'warId', 'weeklyCost'];
const OFFER_KEYS = ['cashAmount', 'createdTick', 'expiresTick', 'fromId', 'id', 'paymentWeeks', 'settlement', 'status', 'toId', 'warId', 'weeklyCost'];
const ALLIANCE_KEYS = ['formedTick', 'leftId', 'rightId'];
const ALLIANCE_OFFER_KEYS = ['createdTick', 'expiresTick', 'fromId', 'toId'];
const AI_ESCALATION_KEYS = ['coalitionMembers', 'globalThreat', 'lastFederationTick', 'lastHumanPower', 'lastHumanTerritoryCount', 'lastWarStartTick', 'openingConflictsStarted', 'resistanceLevel'];
const POLAR_ENDGAME_KEYS = ['apexNarrative', 'arcticPrograms', 'bossIntegrity', 'bossPhase', 'communicationsBlackoutTick', 'contactTick', 'earthDefenseMembers', 'expeditions', 'gatewayBreaches', 'gatewayBreachOrder', 'globalWave', 'nextCounteroffensiveTick', 'nextExpeditionId', 'phase', 'revealedBy', 'rogueAttention', 'roguePrime', 'rogueWaveLossCreditByPlayer', 'rogueWaveManpowerByTerritory', 'sectors', 'suspicionReliefEarned', 'victoryCommanderId', 'victoryTick', 'visualRevision', 'warningAcknowledgedBy', 'warningTick'];
const ARCTIC_PROGRESS_KEYS = ['activeProject', 'completedProjects', 'playerId'];
const ARCTIC_RUN_KEYS = ['completesTick', 'costPaid', 'playerId', 'projectId', 'startedTick'];
const ANTARCTIC_SECTOR_KEYS = ['discoveredTick', 'integrity', 'securedBy', 'securedTick', 'status', 'wave'];
const ANTARCTIC_EXPEDITION_KEYS = ['damageDealt', 'id', 'initialManpower', 'lastPulseTick', 'manpower', 'playerId', 'sectorId', 'startedTick'];
const ANTARCTIC_GATEWAY_BREACH_KEYS = ['breachStartedTick', 'gatewayId', 'openedTick', 'opensTick', 'status'];
const ROGUE_ATTENTION_KEYS = ['activatedTick', 'benchmarkMetTick', 'liberatedWorldShare', 'nextStageTick', 'stage'];
const ROGUE_PRIME_KEYS = ['departTick', 'force', 'gatewayId', 'nextSortieTick', 'rebuildReadyTick', 'returnTick', 'sortieSequence', 'status', 'strikeTick', 'targetId'];
const APEX_NARRATIVE_KEYS = ['players'];
const APEX_NARRATIVE_PLAYER_KEYS = ['investigationAuthorized', 'transmissions'];
const APEX_TRANSMISSION_KEYS = [
  'action', 'body', 'choice', 'id', 'playerId', 'resolvedTick', 'sentTick', 'targetId', 'title',
];
const RUN_PROGRESSION_KEYS = ['mode', 'nextOfferSequence', 'players', 'scorchedWorldTerritoryIds'];
const RUN_PLAYER_KEYS = ['activeOffer', 'picks', 'queuedMilestones', 'recapturedScorchedTerritoryIds', 'stacks', 'triggeredMilestoneIds'];
const RUN_OFFER_KEYS = ['createdTick', 'id', 'milestoneId', 'milestoneKind', 'milestoneLabel', 'optionIds', 'playerId'];
const RUN_MILESTONE_KEYS = ['createdTick', 'id', 'kind', 'label'];
const RUN_PICK_KEYS = ['milestoneId', 'milestoneLabel', 'offerId', 'pickedTick', 'upgradeId'];
const OPTIONAL_CANONICAL_KEYS = ['cause', 'integrationProgram'] as const;
const allowedKeySetCache = new WeakMap<readonly string[], ReadonlySet<string>>();

function allowedKeySet(allowed: readonly string[]): ReadonlySet<string> {
  let keys = allowedKeySetCache.get(allowed);
  if (!keys) {
    keys = new Set(allowed);
    allowedKeySetCache.set(allowed, keys);
  }
  return keys;
}

function exactKeys(value: object, allowed: readonly string[]): boolean {
  const actual = Object.keys(value);
  const allowedSet = allowedKeySet(allowed);
  let expectedCount = allowed.length;
  for (const key of OPTIONAL_CANONICAL_KEYS) {
    if (allowedSet.has(key) && !(key in value)) expectedCount -= 1;
  }
  return actual.length === expectedCount && actual.every((key) => allowedSet.has(key));
}

function commanderEmpireSupportValidV2(support: CommanderEmpireSupportV2): boolean {
  return exactKeys(support, COMMANDER_EMPIRE_SUPPORT_KEYS)
    && [
      support.recruitmentMultiplier,
      support.reserveTrainingMultiplier,
      support.armyCasualtyMultiplier,
      support.armyPeaceRecoveryMultiplier,
      support.annualFoodOutput,
      support.foodProductionMultiplier,
      support.foodStorageMultiplier,
      support.foodImportCostMultiplier,
    ].every(Number.isFinite)
    && support.recruitmentMultiplier >= 1 && support.recruitmentMultiplier <= 1.50
    && support.reserveTrainingMultiplier >= 1 && support.reserveTrainingMultiplier <= 1.75
    && support.armyCasualtyMultiplier >= 0.82 && support.armyCasualtyMultiplier <= 1
    && support.armyPeaceRecoveryMultiplier >= 1
    && support.armyPeaceRecoveryMultiplier <= 1.75
    && support.annualFoodOutput >= 0 && support.annualFoodOutput <= 1.56
    && support.foodProductionMultiplier >= 1 && support.foodProductionMultiplier <= 1.50
    && support.foodStorageMultiplier >= 1 && support.foodStorageMultiplier <= 1.75
    && support.foodImportCostMultiplier >= 0.75 && support.foodImportCostMultiplier <= 1;
}

/** The absent doctrine sidecar is the deterministic authenticated-legacy default. */
function commanderForceKeysValidV2(force: CommanderForceStateV2): boolean {
  return exactKeys(force, COMMANDER_FORCE_KEYS)
    || exactKeys(force, LEGACY_COMMANDER_FORCE_KEYS);
}

function sameCommanderFrontV2(
  left: CommanderForceStateV2['front'],
  right: CommanderForceStateV2['front'],
): boolean {
  return Boolean(left && right
    && left.warId === right.warId
    && left.sourceId === right.sourceId
    && left.targetId === right.targetId);
}

function apexDoctrineRuntimeValidV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  force: CommanderForceStateV2,
): boolean {
  const runtime = force.doctrineRuntime;
  if (runtime === undefined) return true;
  if (!runtime || !exactKeys(runtime, APEX_DOCTRINE_RUNTIME_KEYS)
    || !Number.isSafeInteger(runtime.lancerSupportedAssaultCount)
    || runtime.lancerSupportedAssaultCount < 0
    || runtime.lancerSupportedAssaultCount > 2
    || typeof runtime.emergencyRebootUsed !== 'boolean'
    || (!force.capabilities.assaultSpecialist
      && (force.shield.pulseChargeBonusPerStep ?? 0) <= 0.000000001
      && runtime.lancerSupportedAssaultCount !== 0)) return false;
  const secondary = runtime.secondaryProjection;
  if (secondary === null) return true;
  if (!secondary || !exactKeys(secondary, APEX_SECONDARY_PROJECTION_KEYS)
    || !exactKeys(secondary.front, COMMANDER_FRONT_KEYS)
    || !exactKeys(secondary.pairedPrimaryFront, COMMANDER_FRONT_KEYS)
    || !['assault-support', 'defense'].includes(secondary.mission)
    || !force.capabilities.rapidResponse
    || Boolean(force.transit)
    || force.shield.integrity <= 0
    || !force.front
    || !['assault-support', 'defense'].includes(force.mission)
    || !sameCommanderFrontV2(force.front, secondary.pairedPrimaryFront)
    || sameCommanderFrontV2(force.front, secondary.front)
    || secondary.locationId === force.locationId
    || !state.territories[secondary.locationId]
    || state.territories[secondary.locationId]?.owner !== playerId
    || !selectCommanderRouteV2(
      state, content, playerId, force.locationId, secondary.locationId,
    )) return false;
  const primaryRoleValid = force.mission === 'assault-support'
    ? force.locationId === force.front.sourceId
      && state.territories[force.front.sourceId]?.owner === playerId
    : force.locationId === force.front.targetId
      && state.territories[force.front.targetId]?.owner === playerId;
  const assignedWar = state.wars.find((war) => war.id === secondary.front.warId);
  const operationActive = assignedWar
    && [...assignedWar.attackerOperations, ...assignedWar.defenderOperations]
      .some((operation) => operation.sourceId === secondary.front.sourceId
        && operation.targetId === secondary.front.targetId);
  return Boolean(primaryRoleValid && operationActive
    && (secondary.mission === 'assault-support'
      ? secondary.locationId === secondary.front.sourceId
        && state.territories[secondary.front.sourceId]?.owner === playerId
      : secondary.locationId === secondary.front.targetId
        && state.territories[secondary.front.targetId]?.owner === playerId));
}

function hasOnlyKeys(value: object, allowed: readonly string[]): boolean {
  const allowedSet = allowedKeySet(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
}

function isSortedUniqueStringArray(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.every((item) => typeof item === 'string')
    && value.every((item, index) => index === 0 || value[index - 1]! < item);
}

export function invariantErrorsV2(state: WorldStateV2, content: WorldContentV2): string[] {
  const errors: string[] = [];
  if (state.schemaVersion !== 22) errors.push('Canonical state must use schema version 22.');
  if (state.rulesVersion !== V2_RULES_VERSION) errors.push('Canonical state has an incompatible rules version.');
  if (state.contentVersion !== contentVersionForWorldContentV2(content)) {
    errors.push('Canonical state does not match the supplied scenario content version.');
  }
  if (content.metadata?.generatedFromSeed !== undefined
    && state.seed !== content.metadata.generatedFromSeed) {
    errors.push('Canonical state seed does not match the generated scenario seed.');
  }
  if (state.mapId !== V2_MAP_ID) errors.push('Canonical state has an incompatible map id.');
  if (!finiteStateNumbersV2(state)) errors.push('Canonical state contains a non-finite number.');
  const playerIds = Object.keys(state.players) as PlayerId[];
  const territoryIds = Object.keys(state.territories) as TerritoryId[];
  const humanPlayerIds = state.humanPlayerIds;
  if (!Array.isArray(humanPlayerIds)
    || humanPlayerIds.length < 1 || humanPlayerIds.length > 8
    || !humanPlayerIds.includes(state.humanPlayerId)
    || new Set(humanPlayerIds).size !== humanPlayerIds.length
    || humanPlayerIds.some((id) => !content.nations[id])
    || humanPlayerIds.join('|') !== [...humanPlayerIds].sort((left, right) => left.localeCompare(right)).join('|')) {
    errors.push('Human player roster is invalid.');
  }
  const run = state.runProgression;
  const runUpgradeIds = new Set<string>(RUN_UPGRADE_IDS_V2);
  const upgradeMaxStacks = new Map(RUN_UPGRADES_V2.map((card) => [card.id, card.maxStacks]));
  const runPlayerKeys = run && typeof run.players === 'object'
    ? Object.keys(run.players).sort() : [];
  if (!run || !exactKeys(run, RUN_PROGRESSION_KEYS)
    || run.mode !== runProgressionModeForContentV2(content)
    || !Number.isSafeInteger(run.nextOfferSequence) || run.nextOfferSequence < 1) {
    errors.push('Run progression envelope is invalid.');
  } else {
    const scorched = run.scorchedWorldTerritoryIds;
    if (!Array.isArray(scorched)
      || new Set(scorched).size !== scorched.length
      || scorched.join('|') !== [...scorched].sort().join('|')
      || scorched.some((id) => !state.territories[id]
        || content.territories[id]?.regionId === 'antarctica')
      || (content.metadata?.scenarioId !== 'survival' && scorched.length > 0)) {
      errors.push('Run progression scorched-world registry is invalid.');
    }
    for (const [rawPlayerId, progress] of Object.entries(run.players)) {
      const playerId = rawPlayerId as PlayerId;
      if (!content.nations[playerId] || !progress || !exactKeys(progress, RUN_PLAYER_KEYS)) {
        errors.push(`Run progression for ${playerId} is invalid.`);
        continue;
      }
      if (progress.activeOffer !== null
        || progress.queuedMilestones.length > 0
        || progress.triggeredMilestoneIds.length > 0
        || progress.picks.length > 0
        || Object.keys(progress.stacks).length > 0
        || progress.recapturedScorchedTerritoryIds.length > 0) {
        errors.push(`Retired run progression for ${playerId} must be empty.`);
        continue;
      }
    }
  }
  const commanderMissions = [
    'standby', 'assault-support', 'defense', 'logistics-relief', 'evacuate', 'hq-training',
  ];
  const frontMissions = new Set(['assault-support', 'defense', 'logistics-relief']);
  for (const [rawPlayerId, force] of Object.entries(state.commanderForces ?? {})) {
    const playerId = rawPlayerId as PlayerId;
    const narrativeSurvivor = Boolean(force
      && !Object.values(state.territories).some((territory) => territory.owner === playerId)
      && force.shield.integrity > 0
      && force.mission === 'standby'
      && !force.front
      && !force.transit);
    const lostStationEvacuation = Boolean(force?.transit
      && force.mission === 'evacuate'
      && force.transit.path.length >= 2
      && force.transit.path[0] === force.locationId
      && state.territories[force.locationId]
      && state.territories[force.locationId]?.owner !== playerId
      && force.transit.path.slice(1).every((territoryId) => (
        state.territories[territoryId]?.owner === playerId
      )));
    if (!force || !humanPlayerIds.includes(playerId)
      || !state.players[playerId] && !narrativeSurvivor
      || !commanderForceKeysValidV2(force)
      || !exactKeys(force.shield, COMMANDER_SHIELD_KEYS)
      || !exactKeys(force.capabilities, COMMANDER_CAPABILITY_KEYS)
      || !commanderEmpireSupportValidV2(force.empireSupport)
      || !exactKeys(force.economy, COMMANDER_ECONOMY_KEYS)
      || !exactKeys(force.economy.priorities, COMMANDER_PRIORITY_KEYS)
      || !state.territories[force.locationId]
      || state.territories[force.locationId]?.owner !== playerId
        && !lostStationEvacuation && !narrativeSurvivor
      || !commanderMissions.includes(force.mission)
      || !['manual', 'autonomous'].includes(force.orderSource)
      || !Number.isFinite(force.countryTraitScale)
      || force.countryTraitScale < 0 || force.countryTraitScale > 1
      || ![
        force.capabilities.mobileHeadquarters,
        force.capabilities.fieldHospital,
        force.capabilities.rapidResponse,
        force.capabilities.forceMultiplier,
        force.capabilities.assaultSpecialist,
        force.capabilities.defenseSpecialist,
      ].every((value) => typeof value === 'boolean')
      || apexCapstoneCapabilityCountV2(force.capabilities) > 1
      || !Number.isSafeInteger(force.capabilities.emergencyExtractionCharges)
      || force.capabilities.emergencyExtractionCharges < 0
      || force.capabilities.emergencyExtractionCharges > 2
      || !Number.isSafeInteger(force.manualHoldUntilTick)
      || force.manualHoldUntilTick < 0
      || !apexDoctrineRuntimeValidV2(state, content, playerId, force)) {
      errors.push(`Commander force ${rawPlayerId} has invalid canonical state.`);
      continue;
    }
    const shield = force.shield;
    const economy = force.economy;
    const priorities = economy.priorities;
    if (![shield.integrity, shield.maxIntegrity, shield.rechargeBuffer,
      shield.rechargeMultiplier,
      shield.attackMultiplier, shield.defenseMultiplier, shield.pulseAttack,
      shield.pulseProjectionRetention, shield.pulseChargeBonusPerStep,
      shield.interceptEfficiency, shield.impactRecoveryShare,
      shield.defensivePulseMultiplier,
      economy.treasury, economy.annualOutput, economy.supplyStock].every(Number.isFinite)
      || shield.integrity < 0 || shield.maxIntegrity <= 0 || shield.rechargeBuffer < 0
      || shield.integrity > shield.maxIntegrity + 0.000000001
      || shield.rechargeBuffer > shield.maxIntegrity + 0.000000001
      || shield.rechargeMultiplier < 1 || shield.rechargeMultiplier > 3.5
      || shield.attackMultiplier < 1 || shield.attackMultiplier > 2.5
      || shield.defenseMultiplier < 1 || shield.defenseMultiplier > 2.5
      || shield.pulseAttack < 0 || shield.pulseAttack > 1
      || (shield.pulseProjectionRetention ?? 0) < 0
      || (shield.pulseProjectionRetention ?? 0) > 0.35
      || (shield.pulseChargeBonusPerStep ?? 0) < 0
      || (shield.pulseChargeBonusPerStep ?? 0) > 0.45
      || (shield.interceptEfficiency ?? 1) < 1
      || (shield.interceptEfficiency ?? 1) > 1.45
      || (shield.impactRecoveryShare ?? 0) < 0
      || (shield.impactRecoveryShare ?? 0) > 0.35
      || (shield.defensivePulseMultiplier ?? 1) < 1
      || (shield.defensivePulseMultiplier ?? 1) > 1.75
      || economy.treasury < 0 || economy.annualOutput < 0 || economy.supplyStock < 0
      || ![priorities.training, priorities.logistics, priorities.development]
        .every((value) => Number.isInteger(value) && value >= 0 && value <= 100)
      || priorities.training + priorities.logistics + priorities.development !== 100) {
      errors.push(`Commander force ${rawPlayerId} has invalid economy or shield values.`);
    }
    if (frontMissions.has(force.mission) !== Boolean(force.front)) {
      errors.push(`Commander force ${rawPlayerId} has an invalid mission/front pairing.`);
    }
    if (force.front) {
      const front = force.front;
      const assignedWar = state.wars.find((war) => war.id === front.warId);
      if (!exactKeys(front, COMMANDER_FRONT_KEYS)
        || !front.warId || !state.territories[front.sourceId] || !state.territories[front.targetId]
        || !force.transit && (!assignedWar
          || ![...assignedWar.attackerOperations, ...assignedWar.defenderOperations]
            .some((operation) => operation.sourceId === front.sourceId
              && operation.targetId === front.targetId))) {
        errors.push(`Commander force ${rawPlayerId} has an invalid front assignment.`);
      }
    }
    if (force.transit) {
      const transit = force.transit;
      if (!exactKeys(transit, COMMANDER_TRANSIT_KEYS)
        || !Array.isArray(transit.path) || transit.path.length < 2
        || transit.path[0] !== force.locationId
        || transit.path.some((id) => !state.territories[id])
        || transit.path.some((id, index) => state.territories[id]?.owner !== playerId
          && !(index === 0 && lostStationEvacuation))
        || transit.path.some((id, index) => index > 0
          && !content.territories[transit.path[index - 1]!]?.connections
            .some((connection) => connection.targetId === id))
        || !Number.isFinite(transit.distanceKm) || transit.distanceKm <= 0
        || !Number.isInteger(transit.departTick) || !Number.isInteger(transit.arriveTick)
        || transit.departTick < 0 || transit.departTick > state.tick
        || transit.arriveTick <= state.tick || transit.arriveTick <= transit.departTick) {
        errors.push(`Commander force ${rawPlayerId} has invalid canonical transit.`);
      }
    }
    // `hq-training` is the persisted compatibility name for stationary APEX
    // recovery. Recovery is remote and legal at any currently owned station;
    // the canonical location/ownership checks above remain authoritative.
  }
  const apexTerritoryClaims = new Map<TerritoryId, PlayerId>();
  const apexFrontClaims = new Map<string, PlayerId>();
  for (const [rawPlayerId, force] of (Object.entries(state.commanderForces ?? {}) as Array<[
    string,
    CommanderForceStateV2,
  ]>)
    .sort(([left], [right]) => left.localeCompare(right))) {
    const playerId = rawPlayerId as PlayerId;
    for (const territoryId of new Set([
      force.locationId,
      ...(force.transit?.path.at(-1) ? [force.transit.path.at(-1)!] : []),
      ...(force.doctrineRuntime?.secondaryProjection?.locationId
        ? [force.doctrineRuntime.secondaryProjection.locationId] : []),
    ])) {
      const existing = apexTerritoryClaims.get(territoryId);
      if (existing && existing !== playerId) {
        errors.push(`APEX territory ${territoryId} is claimed by both ${existing} and ${playerId}.`);
      } else apexTerritoryClaims.set(territoryId, playerId);
    }
    if (force.front) {
      const signature = `${force.front.warId}:${force.front.sourceId}:${force.front.targetId}`;
      const existing = apexFrontClaims.get(signature);
      if (existing && existing !== playerId) {
        errors.push(`APEX front ${signature} is claimed by both ${existing} and ${playerId}.`);
      } else apexFrontClaims.set(signature, playerId);
    }
    const secondaryFront = force.doctrineRuntime?.secondaryProjection?.front;
    if (secondaryFront) {
      const signature = `${secondaryFront.warId}:${secondaryFront.sourceId}:${secondaryFront.targetId}`;
      const existing = apexFrontClaims.get(signature);
      if (existing && existing !== playerId) {
        errors.push(`APEX front ${signature} is claimed by both ${existing} and ${playerId}.`);
      } else apexFrontClaims.set(signature, playerId);
    }
  }
  const firstIntegrationDiscountUsedBy = state.firstIntegrationDiscountUsedBy;
  if (!Array.isArray(firstIntegrationDiscountUsedBy)
    || new Set(firstIntegrationDiscountUsedBy).size !== firstIntegrationDiscountUsedBy.length
    || firstIntegrationDiscountUsedBy.some((id) => !humanPlayerIds.includes(id))
    || firstIntegrationDiscountUsedBy.join('|') !== [...firstIntegrationDiscountUsedBy]
      .sort((left, right) => left.localeCompare(right)).join('|')) {
    errors.push('First player integration discount ledger is invalid.');
  }
  if (!exactKeys(state.aiEscalation, AI_ESCALATION_KEYS)
    || ![0, 1, 2].includes(state.aiEscalation.resistanceLevel)
    || ![state.aiEscalation.lastWarStartTick, state.aiEscalation.openingConflictsStarted, state.aiEscalation.lastFederationTick, state.aiEscalation.globalThreat, state.aiEscalation.lastHumanPower, state.aiEscalation.lastHumanTerritoryCount].every(Number.isFinite)
    || state.aiEscalation.globalThreat < 0 || state.aiEscalation.globalThreat > 100
    || !Number.isInteger(state.aiEscalation.openingConflictsStarted) || state.aiEscalation.openingConflictsStarted < 0
    || !Number.isInteger(state.aiEscalation.lastHumanTerritoryCount) || state.aiEscalation.lastHumanTerritoryCount < 0) errors.push('AI escalation state is invalid.');
  const coalitionMembers = state.aiEscalation.coalitionMembers;
  if ([...new Set(coalitionMembers)].length !== coalitionMembers.length
    || coalitionMembers.some((id) => isHumanPlayerV2(state, id) || !state.players[id])
    || coalitionMembers.join('|') !== [...coalitionMembers].sort((a, b) => a.localeCompare(b)).join('|')) {
    errors.push('AI coalition membership is invalid.');
  }
  const polar = state.polarEndgame;
  const polarPhases = ['dormant', 'arctic-research', 'warning', 'contact', 'counteroffensive', 'core-exposed', 'victory'];
  if (!polar || !exactKeys(polar, POLAR_ENDGAME_KEYS)
    || !polarPhases.includes(polar.phase)
    || ![polar.globalWave, polar.bossPhase, polar.bossIntegrity, polar.suspicionReliefEarned, polar.visualRevision, polar.nextExpeditionId]
      .every(Number.isFinite)
    || !Number.isInteger(polar.globalWave) || polar.globalWave < 1
    || !Number.isInteger(polar.bossPhase) || polar.bossPhase < 0 || polar.bossPhase > 3
    || polar.bossIntegrity < 0 || polar.bossIntegrity > 100
    || polar.suspicionReliefEarned < 0
    || !Number.isInteger(polar.visualRevision) || polar.visualRevision < 0
    || !Number.isInteger(polar.nextExpeditionId) || polar.nextExpeditionId < 1
    || polar.revealedBy !== null && !content.nations[polar.revealedBy]
    || polar.victoryCommanderId !== null && !content.nations[polar.victoryCommanderId]
    || polar.phase !== 'victory' && polar.victoryCommanderId !== null
    || ![polar.warningTick, polar.contactTick, polar.victoryTick, polar.nextCounteroffensiveTick,
      polar.communicationsBlackoutTick]
      .every((value) => value === null || Number.isInteger(value) && value >= 0 && value <= state.tick + 52)
    || (polar.phase === 'dormant' || polar.phase === 'arctic-research') && polar.warningTick !== null
    || !['dormant', 'arctic-research'].includes(polar.phase) && polar.warningTick === null
    || ['contact', 'counteroffensive', 'core-exposed', 'victory'].includes(polar.phase) && polar.contactTick === null
    || polar.phase === 'victory' && polar.victoryTick === null) {
    errors.push('Polar endgame state is invalid.');
  }
  if (polar) {
    const narrative = polar.apexNarrative;
    if (!narrative || !exactKeys(narrative, APEX_NARRATIVE_KEYS)) {
      errors.push('APEX narrative state is invalid.');
    } else {
      for (const [rawPlayerId, progress] of Object.entries(narrative.players)) {
        const playerId = rawPlayerId as PlayerId;
        if (!progress || !content.nations[playerId]
          || !exactKeys(progress, APEX_NARRATIVE_PLAYER_KEYS)
          || typeof progress.investigationAuthorized !== 'boolean'
          || !Array.isArray(progress.transmissions)) {
          errors.push(`APEX narrative player ${rawPlayerId} is invalid.`);
          continue;
        }
        const ids = new Set<string>();
        for (const transmission of progress.transmissions) {
          if (!transmission || !exactKeys(transmission, APEX_TRANSMISSION_KEYS)
            || !APEX_TRANSMISSION_IDS_V2.includes(transmission.id)
            || transmission.playerId !== playerId
            || ids.has(transmission.id)
            || !Number.isInteger(transmission.sentTick)
            || transmission.sentTick < 0 || transmission.sentTick > state.tick
            || transmission.resolvedTick !== null
              && (!Number.isInteger(transmission.resolvedTick)
                || transmission.resolvedTick < transmission.sentTick
                || transmission.resolvedTick > state.tick)
            || typeof transmission.title !== 'string' || transmission.title.length < 1
            || transmission.title.length > 120
            || typeof transmission.body !== 'string' || transmission.body.length < 1
            || transmission.body.length > 500
            || ![null, 'north-pole-investigation', 'first-strike-guidance']
              .includes(transmission.action)
            || transmission.targetId !== null && !content.territories[transmission.targetId]
            || ![null, 'accept', 'later', 'acknowledge'].includes(transmission.choice)) {
            errors.push(`APEX transmission ${String(transmission?.id)} is invalid.`);
            continue;
          }
          ids.add(transmission.id);
          if ((transmission.choice === null) !== (transmission.resolvedTick === null)) {
            errors.push(`APEX transmission ${transmission.id} has invalid response timing.`);
          }
          if (transmission.action === null
            && transmission.choice !== null && transmission.choice !== 'acknowledge') {
            errors.push(`APEX transmission ${transmission.id} has an invalid acknowledgement.`);
          }
          if (transmission.action === 'north-pole-investigation'
            && transmission.choice === 'acknowledge') {
            errors.push(`APEX transmission ${transmission.id} did not receive its required decision.`);
          }
          const targetAllowed = transmission.action === 'first-strike-guidance'
            || transmission.id === 'campaign-first-conquest'
            || transmission.id === 'campaign-first-war-recovery'
            || transmission.id === 'campaign-first-purge-arrival'
            || transmission.id === 'campaign-first-liberation';
          if (transmission.action === 'first-strike-guidance'
            ? transmission.targetId === null
            : transmission.targetId !== null && !targetAllowed) {
            errors.push(`APEX transmission ${transmission.id} has an invalid guidance target.`);
          }
        }
      }
    }
    const prime = polar.roguePrime;
    const primeTicks = prime ? [
      prime.nextSortieTick,
      prime.departTick,
      prime.strikeTick,
      prime.returnTick,
      prime.rebuildReadyTick,
    ] : [];
    const primeBasicValid = Boolean(prime
      && exactKeys(prime, ROGUE_PRIME_KEYS)
      && ['dormant', 'guarding', 'sortie', 'rebuilding', 'destroyed'].includes(prime.status)
      && Number.isSafeInteger(prime.sortieSequence) && prime.sortieSequence >= 0
      && primeTicks.every((tick) => tick === null || Number.isSafeInteger(tick) && tick >= 0));
    if (!primeBasicValid) {
      errors.push('ROGUE PRIME lifecycle state is invalid.');
    } else {
      const force = prime.force;
      const forceRequired = prime.status === 'guarding' || prime.status === 'sortie';
      const timingValid = prime.status === 'dormant' || prime.status === 'destroyed'
        ? prime.nextSortieTick === null && prime.rebuildReadyTick === null
          && prime.gatewayId === null && prime.targetId === null
          && prime.departTick === null && prime.strikeTick === null && prime.returnTick === null
        : prime.status === 'guarding'
          ? prime.rebuildReadyTick === null && prime.gatewayId === null && prime.targetId === null
            && prime.departTick === null && prime.strikeTick === null && prime.returnTick === null
          : prime.status === 'rebuilding'
            ? prime.rebuildReadyTick !== null && prime.nextSortieTick === null
              && prime.gatewayId === null && prime.targetId === null
              && prime.departTick === null && prime.strikeTick === null && prime.returnTick === null
            : prime.status === 'sortie'
              && prime.nextSortieTick === null && prime.rebuildReadyTick === null
              && prime.gatewayId !== null && prime.targetId !== null
              && prime.departTick !== null && prime.departTick <= state.tick
              && prime.strikeTick !== null && prime.strikeTick > prime.departTick
              && prime.returnTick !== null && prime.returnTick > prime.strikeTick;
      if (!timingValid || forceRequired !== Boolean(force)) {
        errors.push('ROGUE PRIME status/timing pairing is invalid.');
      }
      if (force) {
        const priorities = force.economy.priorities;
        const shield = force.shield;
        const directSortieRoute = prime.gatewayId === null || prime.targetId === null
          ? true
          : ANTARCTIC_GATEWAY_COUNTRY_ROUTES_V2.some((route) => (
            route.gatewayId === prime.gatewayId && route.countryId === prime.targetId
          ));
        if (!commanderForceKeysValidV2(force)
          || !apexDoctrineRuntimeValidV2(
            state, content, ROGUE_AI_NATION_ID_V2, force,
          )
          || !exactKeys(force.shield, COMMANDER_SHIELD_KEYS)
          || !exactKeys(force.capabilities, COMMANDER_CAPABILITY_KEYS)
          || !commanderEmpireSupportValidV2(force.empireSupport)
          || !exactKeys(force.economy, COMMANDER_ECONOMY_KEYS)
          || !exactKeys(priorities, COMMANDER_PRIORITY_KEYS)
          || !ANTARCTIC_TERRITORY_IDS_V2.includes(force.locationId)
          || state.territories[force.locationId]?.owner !== ROGUE_AI_NATION_ID_V2
          || !['standby', 'assault-support', 'defense'].includes(force.mission)
          || force.orderSource !== 'autonomous' || force.manualHoldUntilTick !== 0
          || force.countryTraitScale !== 0
          || ![shield.integrity, shield.maxIntegrity, shield.rechargeBuffer,
            shield.rechargeMultiplier,
            shield.attackMultiplier, shield.defenseMultiplier, shield.pulseAttack,
            shield.pulseProjectionRetention, shield.pulseChargeBonusPerStep,
            shield.interceptEfficiency, shield.impactRecoveryShare,
            shield.defensivePulseMultiplier,
            force.economy.treasury,
            force.economy.annualOutput, force.economy.supplyStock].every(Number.isFinite)
          || shield.integrity < 0 || shield.maxIntegrity <= 0 || shield.rechargeBuffer < 0
          || shield.integrity > shield.maxIntegrity + 0.000000001
          || shield.rechargeBuffer > shield.maxIntegrity + 0.000000001
          || shield.rechargeMultiplier < 1 || shield.rechargeMultiplier > 3.5
          || shield.attackMultiplier < 1 || shield.attackMultiplier > 2.5
          || shield.defenseMultiplier < 1 || shield.defenseMultiplier > 2.5
          || shield.pulseAttack < 0 || shield.pulseAttack > 1
          || (shield.pulseProjectionRetention ?? 0) < 0
          || (shield.pulseProjectionRetention ?? 0) > 0.35
          || (shield.pulseChargeBonusPerStep ?? 0) < 0
          || (shield.pulseChargeBonusPerStep ?? 0) > 0.45
          || (shield.interceptEfficiency ?? 1) < 1
          || (shield.interceptEfficiency ?? 1) > 1.45
          || (shield.impactRecoveryShare ?? 0) < 0
          || (shield.impactRecoveryShare ?? 0) > 0.35
          || (shield.defensivePulseMultiplier ?? 1) < 1
          || (shield.defensivePulseMultiplier ?? 1) > 1.75
          || force.economy.treasury < 0 || force.economy.annualOutput !== 0
          || force.economy.supplyStock < 0
          || priorities.training + priorities.logistics + priorities.development !== 100
          || !directSortieRoute) {
          errors.push('ROGUE PRIME force state is invalid.');
        }
        if (force.front && (!exactKeys(force.front, COMMANDER_FRONT_KEYS)
          || !state.wars.some((war) => war.id === force.front!.warId)
          || !content.territories[force.front.sourceId]?.connections
            .some((edge) => edge.targetId === force.front!.targetId))) {
          errors.push('ROGUE PRIME front assignment is invalid.');
        }
        if (force.transit && (!exactKeys(force.transit, COMMANDER_TRANSIT_KEYS)
          || force.transit.path.length < 2
          || force.transit.path[0] !== force.locationId
          || force.transit.path.some((id) => !ANTARCTIC_TERRITORY_IDS_V2.includes(id)
            || state.territories[id]?.owner !== ROGUE_AI_NATION_ID_V2)
          || force.transit.departTick < 0 || force.transit.departTick > state.tick
          || force.transit.arriveTick <= state.tick
          || force.transit.arriveTick <= force.transit.departTick
          || !Number.isFinite(force.transit.distanceKm) || force.transit.distanceKm <= 0)) {
          errors.push('ROGUE PRIME Antarctic transit is invalid.');
        }
      }
    }
    for (const [rawTerritoryId, manpower] of Object.entries(
      polar.rogueWaveManpowerByTerritory,
    )) {
      const territoryId = rawTerritoryId as TerritoryId;
      const territory = state.territories[territoryId];
      if (!territory || territory.owner !== 'rai' || typeof manpower !== 'number'
        || !Number.isFinite(manpower)
        || manpower <= 0 || manpower - territory.army.manpower > 0.000000001) {
        errors.push(`Rogue wave provenance ${rawTerritoryId} is invalid.`);
      }
    }
    for (const [rawPlayerId, losses] of Object.entries(
      polar.rogueWaveLossCreditByPlayer,
    )) {
      const playerId = rawPlayerId as PlayerId;
      if (!state.humanPlayerIds.includes(playerId) || typeof losses !== 'number'
        || !Number.isFinite(losses) || losses <= 0) {
        errors.push(`Rogue wave loss credit ${rawPlayerId} is invalid.`);
      }
    }
    if (new Set(polar.warningAcknowledgedBy).size !== polar.warningAcknowledgedBy.length
      || polar.warningAcknowledgedBy.some((id) => !state.humanPlayerIds.includes(id))
      || polar.warningAcknowledgedBy.join('|') !== [...polar.warningAcknowledgedBy]
        .sort((left, right) => left.localeCompare(right)).join('|')) {
      errors.push('Polar warning acknowledgement ledger is invalid.');
    }
    for (const [rawPlayerId, progress] of Object.entries(polar.arcticPrograms)) {
      const playerId = rawPlayerId as PlayerId;
      if (!progress || !exactKeys(progress, ARCTIC_PROGRESS_KEYS)
        || progress.playerId !== playerId || !state.humanPlayerIds.includes(playerId)
        || new Set(progress.completedProjects).size !== progress.completedProjects.length
        || progress.completedProjects.some((id) => !ARCTIC_PROJECT_IDS_V2.includes(id))
        || progress.completedProjects.join('|') !== [...progress.completedProjects]
          .sort((left, right) => ARCTIC_PROJECT_IDS_V2.indexOf(left) - ARCTIC_PROJECT_IDS_V2.indexOf(right)).join('|')) {
        errors.push(`Arctic research program ${rawPlayerId} is invalid.`);
        continue;
      }
      const run = progress.activeProject;
      if (run && (!exactKeys(run, ARCTIC_RUN_KEYS)
        || run.playerId !== playerId || !ARCTIC_PROJECT_IDS_V2.includes(run.projectId)
        || progress.completedProjects.includes(run.projectId)
        || ![run.startedTick, run.completesTick, run.costPaid].every(Number.isFinite)
        || !Number.isInteger(run.startedTick) || !Number.isInteger(run.completesTick)
        || run.startedTick < 0 || run.startedTick > state.tick || run.completesTick <= state.tick
        || run.completesTick <= run.startedTick || run.costPaid <= 0)) {
        errors.push(`Arctic research run ${rawPlayerId} is invalid.`);
      }
    }
    const sectorKeys = Object.keys(polar.sectors).sort();
    if (sectorKeys.length !== ANTARCTIC_SECTOR_IDS_V2.length
      || sectorKeys.some((id, index) => id !== [...ANTARCTIC_SECTOR_IDS_V2].sort()[index])) {
      errors.push('Antarctic sector record is incomplete.');
    }
    for (const sectorId of ANTARCTIC_SECTOR_IDS_V2) {
      const sector = polar.sectors[sectorId];
      if (!sector || !exactKeys(sector, ANTARCTIC_SECTOR_KEYS)
        || !['hidden', 'available', 'contested', 'secured'].includes(sector.status)
        || !Number.isFinite(sector.integrity) || sector.integrity < 0 || sector.integrity > 100
        || !Number.isInteger(sector.wave) || sector.wave < 1
        || ![sector.discoveredTick, sector.securedTick]
          .every((value) => value === null || Number.isInteger(value) && value >= 0 && value <= state.tick)
        || sector.securedBy !== null && !content.nations[sector.securedBy]
        || sector.status === 'secured' && (sector.integrity !== 0 || sector.securedTick === null)
        || sector.status === 'hidden' && sector.discoveredTick !== null) {
        errors.push(`Antarctic sector ${sectorId} is invalid.`);
      }
    }
    const gatewayOrder = polar.gatewayBreachOrder;
    const activeGatewayCampaign = gatewayOrder.length > 0;
    const acceptedGatewayOrders = state.contentVersion.startsWith('survival-v')
      ? [
        deterministicSurvivalAntarcticGatewayOrderV2(state.seed),
        // Existing Survival saves keep the pre-weighting seeded permutation;
        // changing it mid-breach would reroute a convoy after reconnect.
        deterministicAntarcticGatewayOrderV2(state.seed),
      ]
      : [deterministicAntarcticGatewayOrderV2(state.seed)];
    const gatewayOrderValid = gatewayOrder.length === (activeGatewayCampaign
      ? ANTARCTIC_GATEWAY_IDS_V2.length : 0)
      && new Set(gatewayOrder).size === gatewayOrder.length
      && gatewayOrder.every((gatewayId) => ANTARCTIC_GATEWAY_IDS_V2.includes(
        gatewayId as (typeof ANTARCTIC_GATEWAY_IDS_V2)[number],
      ))
      && (!activeGatewayCampaign || acceptedGatewayOrders.some((acceptedOrder) => (
        gatewayOrder.join('|') === acceptedOrder.join('|')
      )));
    if (!gatewayOrderValid) errors.push('Antarctic gateway breach order is invalid.');
    const gatewayBreachKeys = Object.keys(polar.gatewayBreaches).sort();
    const expectedGatewayKeys = activeGatewayCampaign
      ? [...ANTARCTIC_GATEWAY_IDS_V2].sort() : [];
    if (gatewayBreachKeys.join('|') !== expectedGatewayKeys.join('|')) {
      errors.push('Antarctic gateway breach records are incomplete.');
    }
    let breachingCount = 0;
    let seenNotOpen = false;
    for (const gatewayId of gatewayOrder) {
      const breach = polar.gatewayBreaches[gatewayId];
      if (!breach || !exactKeys(breach, ANTARCTIC_GATEWAY_BREACH_KEYS)
        || breach.gatewayId !== gatewayId
        || !['sealed', 'breaching', 'open'].includes(breach.status)
        || ![breach.breachStartedTick, breach.opensTick, breach.openedTick]
          .every((tick) => tick === null || Number.isInteger(tick) && tick >= 0)
        || breach.status === 'sealed'
          && (breach.breachStartedTick !== null || breach.opensTick !== null || breach.openedTick !== null)
        || breach.status === 'breaching'
          && (breach.breachStartedTick === null || breach.opensTick === null
            || breach.openedTick !== null || breach.opensTick <= breach.breachStartedTick)
        || breach.status === 'open'
          && (breach.breachStartedTick === null || breach.opensTick === null
            || breach.openedTick === null || breach.openedTick < breach.opensTick
            || breach.openedTick > state.tick)) {
        errors.push(`Antarctic gateway breach ${gatewayId} is invalid.`);
        continue;
      }
      if (breach.status === 'breaching') breachingCount += 1;
      if (breach.status !== 'open') seenNotOpen = true;
      else if (seenNotOpen) errors.push('Antarctic gateways did not open monotonically.');
    }
    if (breachingCount > 1) errors.push('More than one Antarctic gateway is breaching.');
    const attention = polar.rogueAttention;
    if (!attention || !exactKeys(attention, ROGUE_ATTENTION_KEYS)
      || !['disabled', 'dormant', 'observing', 'mobilising', 'breach-imminent', 'active']
        .includes(attention.stage)
      || !Number.isFinite(attention.liberatedWorldShare)
      || attention.liberatedWorldShare < 0 || attention.liberatedWorldShare > 1
      || ![attention.benchmarkMetTick, attention.nextStageTick, attention.activatedTick]
        .every((tick) => tick === null || Number.isInteger(tick) && tick >= 0)
      || attention.stage === 'active' && attention.activatedTick === null
      || attention.stage === 'dormant'
        && (attention.benchmarkMetTick !== null || attention.nextStageTick !== null
          || attention.activatedTick !== null)
      || ['observing', 'mobilising', 'breach-imminent'].includes(attention.stage)
        && (attention.benchmarkMetTick === null || attention.nextStageTick === null
          || attention.activatedTick !== null)) {
      errors.push('Rogue attention state is invalid.');
    }
    if (polar.phase === 'victory'
      && polar.victoryCommanderId !== polar.sectors['zero-point-core']?.securedBy) {
      errors.push('Polar victory commander does not match the final core strike.');
    }
    const expeditionIds = new Set<number>();
    for (const expedition of polar.expeditions) {
      expeditionIds.add(expedition.id);
      if (!exactKeys(expedition, ANTARCTIC_EXPEDITION_KEYS)
        || !Number.isInteger(expedition.id) || expedition.id < 1
        || !state.players[expedition.playerId]
        || !ANTARCTIC_SECTOR_IDS_V2.includes(expedition.sectorId)
        || polar.sectors[expedition.sectorId]?.status !== 'contested'
        || ![expedition.manpower, expedition.initialManpower, expedition.startedTick, expedition.lastPulseTick, expedition.damageDealt].every(Number.isFinite)
        || expedition.manpower <= 0 || expedition.initialManpower < expedition.manpower
        || expedition.startedTick < 0 || expedition.startedTick > expedition.lastPulseTick || expedition.lastPulseTick > state.tick
        || expedition.damageDealt < 0) {
        errors.push(`Antarctic expedition ${expedition.id} is invalid.`);
      }
    }
    if (expeditionIds.size !== polar.expeditions.length
      || polar.expeditions.some((expedition, index) => index > 0 && polar.expeditions[index - 1]!.id >= expedition.id)
      || polar.expeditions.some((expedition) => expedition.id >= polar.nextExpeditionId)) {
      errors.push('Antarctic expedition ordering is invalid.');
    }
    if (new Set(polar.earthDefenseMembers).size !== polar.earthDefenseMembers.length
      || polar.earthDefenseMembers.some((id) => !state.players[id])
      || polar.earthDefenseMembers.join('|') !== [...polar.earthDefenseMembers]
        .sort((left, right) => left.localeCompare(right)).join('|')) {
      errors.push('Earth defense membership is invalid.');
    }
  }
  const humanNationExists = Boolean(state.players[state.humanPlayerId]);
  if (!humanNationExists && (!state.gameOver || !state.winnerId || !state.players[state.winnerId])) {
    errors.push('Human nation state is missing outside a completed absorption defeat.');
  }
  for (const id of content.territoryIds) if (!state.territories[id]) errors.push(`Missing territory state: ${id}.`);
  for (const id of playerIds) {
    const nation = state.players[id]!;
    const owned = selectTerritoriesOfV2(state, id);
    if (!content.nations[id]) errors.push(`Unknown nation state: ${id}.`);
    if (!exactKeys(nation, NATION_KEYS)) errors.push(`Nation ${id} has non-canonical keys.`);
    if (nation.openingArmyBonus) {
      const bonus = nation.openingArmyBonus;
      const deployed = owned.reduce((sum, territory) => sum + territory.army.manpower, 0);
      if (!exactKeys(bonus, OPENING_ARMY_BONUS_KEYS)
        || ![bonus.initialManpower, bonus.remainingManpower, bonus.startedTick, bonus.expiresTick].every(Number.isFinite)
        || !Number.isInteger(bonus.startedTick) || !Number.isInteger(bonus.expiresTick)
        || bonus.startedTick < 0 || state.tick < bonus.startedTick
        || bonus.expiresTick - bonus.startedTick !== OPENING_ARMY_BONUS_DURATION_TICKS_V2
        || bonus.initialManpower <= 0 || bonus.remainingManpower <= 0
        || bonus.remainingManpower > bonus.initialManpower + 0.000000001
        || bonus.remainingManpower > deployed + 0.000000001) {
        errors.push(`Nation ${id} has an invalid temporary opening army bonus.`);
      }
    }
    if (nation.propagandaProgram) {
      const program = nation.propagandaProgram;
      if (!isHumanPlayerV2(state, id)
        || !exactKeys(program, PROPAGANDA_PROGRAM_KEYS)
        || ![program.startedTick, program.endsTick, program.totalSuspicionReduction, program.weeklySuspicionReduction].every(Number.isFinite)
        || !Number.isInteger(program.startedTick) || !Number.isInteger(program.endsTick)
        || program.startedTick < 0 || program.endsTick - program.startedTick !== PROPAGANDA_DURATION_TICKS
        || program.endsTick <= state.tick || program.totalSuspicionReduction <= 0 || program.weeklySuspicionReduction <= 0
        || Math.abs(program.weeklySuspicionReduction * PROPAGANDA_DURATION_TICKS - program.totalSuspicionReduction) > 0.0001
        || nation.propagandaAvailableTick < program.endsTick) {
        errors.push(`Nation ${id} has an invalid propaganda program.`);
      }
    }
    if (!exactKeys(nation.research, RESEARCH_KEYS)) errors.push(`Nation ${id} research has non-canonical keys.`);
    if (!exactKeys(nation.budget, BUDGET_KEYS)) errors.push(`Nation ${id} budget has non-canonical keys.`);
    if (!exactKeys(nation.manualActionUses, MANUAL_ACTION_USE_KEYS)
      || !Object.values(nation.manualActionUses).every((value) => Number.isInteger(value) && value >= 0)) {
      errors.push(`Nation ${id} has invalid manual action uses.`);
    }
    if (!exactKeys(nation.research.effectLevels, EFFECT_KEYS)) errors.push(`Nation ${id} effect levels have non-canonical keys.`);
    if (!exactKeys(nation.research.breakthroughs, BREAKTHROUGH_KEYS)) errors.push(`Nation ${id} breakthroughs have non-canonical keys.`);
    if (!exactKeys(nation.research.allocations, BREAKTHROUGH_KEYS)) errors.push(`Nation ${id} research allocations have non-canonical keys.`);
    if (!exactKeys(nation.research.progress, BREAKTHROUGH_KEYS)) errors.push(`Nation ${id} research progress has non-canonical keys.`);
    const budget = nation.budget;
    if (![budget.military, budget.research, budget.development].every((value) => Number.isInteger(value) && value >= 5 && value <= 90)
      || budget.military + budget.research + budget.development !== 100) errors.push(`Nation ${id} has an invalid budget.`);
    if (nation.empireName.length > 36 || /[<>\r\n]/.test(nation.empireName)) errors.push(`Nation ${id} has an invalid empire name.`);
    if (!Number.isFinite(nation.treasury)
      || !Number.isFinite(nation.domesticFoodCapacity) || nation.domesticFoodCapacity < 0
      || !Number.isFinite(nation.trainedReserves) || nation.trainedReserves < 0
      || nation.foodStock < 0 || nation.foodSecurity < 0 || nation.foodSecurity > 1
      || nation.ceasefiresRequested !== 0
      || !Number.isInteger(nation.rapidRecruitmentAvailableTick) || nation.rapidRecruitmentAvailableTick < 0
      || !Number.isInteger(nation.researchSurgeAvailableTick) || nation.researchSurgeAvailableTick < 0
      || !Number.isInteger(nation.propagandaAvailableTick) || nation.propagandaAvailableTick < 0
      || nation.warFatigue < 0 || nation.warFatigue > 100) {
      errors.push(`Nation ${id} has an invalid scalar.`);
    }
    if (!RESEARCH_BRANCHES.every((branch) => Number.isInteger(nation.research.allocations[branch])
      && nation.research.allocations[branch] >= 0 && nation.research.allocations[branch] <= 100)
      || RESEARCH_BRANCHES.reduce((sum, branch) => sum + nation.research.allocations[branch], 0) !== 100) {
      errors.push(`Nation ${id} has invalid research allocations.`);
    }
    for (const effect of EFFECT_KEYS) {
      const level = nation.research.effectLevels[effect as keyof typeof nation.research.effectLevels];
      if (!Number.isInteger(level) || level < 0) errors.push(`Nation ${id} has invalid ${effect} research.`);
    }
    for (const branch of RESEARCH_BRANCHES) {
      const breakthroughs = nation.research.breakthroughs[branch];
      if (!Number.isInteger(breakthroughs) || breakthroughs < 0) errors.push(`Nation ${id} has invalid ${branch} breakthroughs.`);
      if (!Number.isFinite(nation.research.progress[branch]) || nation.research.progress[branch] < 0) errors.push(`Nation ${id} has invalid ${branch} progress.`);
    }
    if (owned.length > 0 && state.territories[nation.capitalId]?.owner !== id) errors.push(`Living nation ${id} does not own its capital.`);
  }
  for (const id of territoryIds) {
    const territory = state.territories[id]!;
    if (!content.territories[id]) errors.push(`Unknown territory state: ${id}.`);
    if (!exactKeys(territory, TERRITORY_KEYS)) errors.push(`Territory ${id} has non-canonical keys.`);
    if (!exactKeys(territory.army, ARMY_KEYS)) errors.push(`Territory ${id} army has non-canonical keys.`);
    if (!state.players[territory.owner]) errors.push(`Territory ${id} has an unknown owner.`);
    if (!state.players[territory.coreOwner]) errors.push(`Territory ${id} has an unknown core owner.`);
    const expectedCapacity = stateTerritoryArmyCapacityTargetV2(state, content, id, territory.owner);
    if (territory.population < 0.01 || territory.economy < 0.10
      || territory.integration < 0 || territory.integration > 1
      || territory.army.capacity < 0 || territory.army.manpower < 0
      || !Number.isFinite(territory.army.baseAttack) || territory.army.baseAttack <= 0 || territory.army.baseAttack > 20
      || !Number.isFinite(territory.army.baseDefense) || territory.army.baseDefense <= 0 || territory.army.baseDefense > 20
      || Math.abs(territory.army.capacity - expectedCapacity) > 0.000001) errors.push(`Territory ${id} has invalid canonical values.`);
    const program = territory.integrationProgram;
    if (program) {
      if (!exactKeys(program, INTEGRATION_PROGRAM_KEYS)
        || (program.cause !== undefined
          && program.cause !== 'conquest' && program.cause !== 'federation')
        || !state.players[program.fromOwnerId]
        || !state.players[program.fromCoreOwnerId] || !state.players[program.toOwnerId]
        || program.fromOwnerId === program.toOwnerId
        || program.fromCoreOwnerId === program.toOwnerId
        || program.fromCoreOwnerId !== territory.coreOwner
        || program.toOwnerId !== territory.owner
        || !Number.isFinite(program.annualCost) || program.annualCost <= 0
        || !Number.isInteger(program.startedTick) || !Number.isInteger(program.completesTick)
        || program.startedTick < 0 || program.completesTick <= program.startedTick
        || program.completesTick <= state.tick || territory.integration >= 1) {
        errors.push(`Territory ${id} has an invalid integration program.`);
      }
    } else {
      const survivalSupplyCorridor = content.metadata?.scenarioId === 'survival'
        && state.runProgression.scorchedWorldTerritoryIds.includes(id)
        && !ANTARCTIC_TERRITORY_IDS_V2.includes(id);
      if (survivalSupplyCorridor
        ? territory.integration !== 0
        : territory.coreOwner !== territory.owner || territory.integration !== 1) {
      errors.push(`Territory ${id} has unfinished integration without a program.`);
      }
    }
  }
  if (state.offers.length !== 0) errors.push('Retired settlement offers must be empty.');
  if (state.ceasefireObligations.length !== 0) errors.push('Retired settlement obligations must be empty.');
  const referencedNations = new Set<PlayerId>();
  for (const humanId of humanPlayerIds) if (state.players[humanId]) referencedNations.add(humanId);
  for (const territory of Object.values(state.territories)) {
    referencedNations.add(territory.owner);
    referencedNations.add(territory.coreOwner);
    if (territory.integrationProgram) {
      referencedNations.add(territory.integrationProgram.fromOwnerId);
      referencedNations.add(territory.integrationProgram.fromCoreOwnerId);
      referencedNations.add(territory.integrationProgram.toOwnerId);
    }
  }
  for (const war of state.wars) {
    referencedNations.add(war.attackerId);
    referencedNations.add(war.defenderId);
  }
  for (const truce of state.truces) {
    referencedNations.add(truce.leftId);
    referencedNations.add(truce.rightId);
  }
  for (const offer of state.offers) {
    referencedNations.add(offer.fromId);
    referencedNations.add(offer.toId);
  }
  for (const alliance of state.alliances) {
    referencedNations.add(alliance.leftId);
    referencedNations.add(alliance.rightId);
  }
  for (const offer of state.allianceOffers) {
    referencedNations.add(offer.fromId);
    referencedNations.add(offer.toId);
  }
  for (const obligation of state.ceasefireObligations) {
    referencedNations.add(obligation.payerId);
    referencedNations.add(obligation.payeeId);
  }
  for (const memberId of state.aiEscalation.coalitionMembers) referencedNations.add(memberId);
  for (const id of referencedNations) {
    if (!state.players[id]) errors.push(`Missing referenced nation state: ${id}.`);
  }
  const warPairs = new Set<string>();
  for (const war of state.wars) {
    if (!hasOnlyKeys(war, WAR_KEYS)) errors.push(`War ${war.id} has non-canonical keys.`);
    if (!state.players[war.attackerId] || !state.players[war.defenderId] || war.attackerId === war.defenderId) errors.push(`War ${war.id} has invalid parties.`);
    const numericWarState = [
      war.startedTick,
      war.lastBattleTick,
      war.warScore,
      war.battles,
      war.attackerLosses,
      war.defenderLosses,
      war.attackerCivilianLosses ?? 0,
      war.defenderCivilianLosses ?? 0,
      war.lastPeaceOfferTick,
    ];
    if (!numericWarState.every(Number.isFinite)
      || (war.attackerCivilianLosses ?? 0) < 0
      || (war.defenderCivilianLosses ?? 0) < 0) {
      errors.push(`War ${war.id} has invalid numeric state.`);
    }
    const apexTelemetry = war.apexTelemetryByPlayer as unknown;
    if (apexTelemetry !== undefined) {
      if (!apexTelemetry || typeof apexTelemetry !== 'object' || Array.isArray(apexTelemetry)) {
        errors.push(`War ${war.id} has invalid APEX telemetry.`);
      } else {
        for (const [playerId, rawTelemetry] of Object.entries(apexTelemetry)) {
          if (!rawTelemetry || typeof rawTelemetry !== 'object' || Array.isArray(rawTelemetry)) {
            errors.push(`War ${war.id} has invalid APEX telemetry for ${playerId}.`);
            continue;
          }
          const telemetry = rawTelemetry as NonNullable<
            NonNullable<typeof war.apexTelemetryByPlayer>[PlayerId]
          >;
          const nonNegativeValues = [
            telemetry.peakPower,
            telemetry.maxIntegrity,
            telemetry.integrityLosses,
            telemetry.supplyDelivered,
            telemetry.supplySpent,
            telemetry.mirrorCounterpulseDamage,
          ];
          const countValues = [
            telemetry.supportedBattles,
            telemetry.singularityPulses,
            telemetry.twinProjectionBattles,
          ];
          if (!exactKeys(telemetry, APEX_WAR_TELEMETRY_KEYS)
            || !isHumanPlayerV2(state, playerId as PlayerId)
            || !nonNegativeValues.every((value) => Number.isFinite(value) && value >= 0)
            || !countValues.every((value) => Number.isSafeInteger(value) && value >= 0)
            || telemetry.singularityPulses > telemetry.supportedBattles
            || telemetry.twinProjectionBattles > telemetry.supportedBattles) {
            errors.push(`War ${war.id} has invalid APEX telemetry for ${playerId}.`);
          }
        }
      }
    }
    const reportBaselines = war.reportBaselineByPlayer as unknown;
    if (reportBaselines !== undefined) {
      if (!reportBaselines || typeof reportBaselines !== 'object' || Array.isArray(reportBaselines)) {
        errors.push(`War ${war.id} has invalid report baselines.`);
      } else {
        for (const [playerId, rawBaseline] of Object.entries(reportBaselines)) {
          if (!rawBaseline || typeof rawBaseline !== 'object' || Array.isArray(rawBaseline)) {
            errors.push(`War ${war.id} has invalid report baseline for ${playerId}.`);
            continue;
          }
          const baseline = rawBaseline as NonNullable<
            NonNullable<typeof war.reportBaselineByPlayer>[PlayerId]
          >;
          const nonNegativeValues = [
            baseline.treasurySeized,
            baseline.treasuryLost,
            baseline.allyPeakPower,
            baseline.allyLosses,
            baseline.effectiveAttackBefore,
            baseline.effectiveDefenseBefore,
            baseline.combatPowerBefore,
            baseline.capacityBefore,
          ];
          const territoryIdsValid = (ids: unknown): ids is TerritoryId[] => (
            isSortedUniqueStringArray(ids)
              && ids.every((territoryId) => Boolean(content.territories[territoryId as TerritoryId]))
          );
          if (!exactKeys(baseline, WAR_REPORT_BASELINE_KEYS)
            || !isHumanPlayerV2(state, playerId as PlayerId)
            || (playerId !== war.attackerId && playerId !== war.defenderId)
            || !Number.isFinite(baseline.treasuryBefore)
            || !nonNegativeValues.every((value) => Number.isFinite(value) && value >= 0)
            || !Number.isSafeInteger(baseline.allySupportedBattles)
            || baseline.allySupportedBattles < 0
            || baseline.allySupportedBattles > war.battles
            || !territoryIdsValid(baseline.ownedTerritoryIds)
            || !territoryIdsValid(baseline.touchedTerritoryIds)
            || !isSortedUniqueStringArray(baseline.allyContributorIds)
            || !baseline.allyContributorIds.every((contributorId) => (
              humanPlayerIds.includes(contributorId as PlayerId)
            ))) {
            errors.push(`War ${war.id} has invalid report baseline for ${playerId}.`);
          }
        }
      }
    }
    const revenge = war.revenge as unknown;
    if (revenge !== undefined && revenge !== null) {
      if (typeof revenge !== 'object' || Array.isArray(revenge)) {
        errors.push(`War ${war.id} has invalid revenge state.`);
      } else {
        const claim = revenge as NonNullable<typeof war.revenge>;
        if (!exactKeys(claim, WAR_REVENGE_KEYS)
          || (claim.claimantId !== war.attackerId && claim.claimantId !== war.defenderId)
          || !Number.isInteger(claim.triggeredTick) || !Number.isInteger(claim.expiresTick)
          || claim.triggeredTick < war.startedTick || claim.triggeredTick > state.tick
          || claim.expiresTick - claim.triggeredTick !== WAR_REVENGE_WINDOW_TICKS
          || claim.expiresTick <= state.tick) {
          errors.push(`War ${war.id} has invalid revenge state.`);
        }
      }
    }
    const campaign = war.campaign as unknown;
    if (campaign !== undefined) {
      if (!campaign || typeof campaign !== 'object' || Array.isArray(campaign)) {
        errors.push(`War ${war.id} has invalid campaign state.`);
      } else {
        const objective = campaign as NonNullable<typeof war.campaign>;
        const integerValues = [
          objective.attackerObjective,
          objective.defenderObjective,
          objective.attackerCaptures,
          objective.defenderCaptures,
          objective.consolidationUntilTick,
          objective.expiresTick,
        ];
        if (!exactKeys(objective, WAR_CAMPAIGN_KEYS)
          || !integerValues.every(Number.isInteger)
          || objective.attackerObjective < 1 || objective.attackerObjective > 3
          || objective.defenderObjective !== 1
          || objective.attackerCaptures < 0 || objective.defenderCaptures < 0
          || objective.consolidationUntilTick < war.startedTick
          || objective.consolidationUntilTick > objective.expiresTick
          || objective.expiresTick - war.startedTick !== WAR_CAMPAIGN_MAX_TICKS) {
          errors.push(`War ${war.id} has invalid campaign state.`);
        }
      }
    }
    const key = relationKeyV2(war.attackerId, war.defenderId);
    if (warPairs.has(key)) errors.push(`Duplicate active war: ${key}.`);
    warPairs.add(key);
    if (state.truces.some((truce) => relationKeyV2(truce.leftId, truce.rightId) === key)) errors.push(`War and truce overlap: ${key}.`);
    if (state.alliances.some((alliance) => relationKeyV2(alliance.leftId, alliance.rightId) === key)) {
      errors.push(`War and alliance overlap: ${key}.`);
    }
    if (!Array.isArray(war.attackerOperations) || !Array.isArray(war.defenderOperations)) {
      errors.push(`War ${war.id} has invalid operation lists.`);
      continue;
    }
    const survivalRogueHumanWar = content.metadata?.scenarioId === 'survival'
      && war.attackerId === ROGUE_AI_NATION_ID_V2
      && isHumanPlayerV2(state, war.defenderId);
    const operationLimit = survivalRogueHumanWar ? 2 : 1;
    if (war.attackerOperations.length + war.defenderOperations.length > operationLimit) {
      errors.push(`War ${war.id} has more than one canonical front.`);
    }
    const usedSources = new Set<TerritoryId>();
    const usedAxes = new Set<string>();
    for (const [commanderId, opponentId, operations] of [
      [war.attackerId, war.defenderId, war.attackerOperations],
      [war.defenderId, war.attackerId, war.defenderOperations],
    ] as const) {
      const signature = operations.map((operation) => `${operation.sourceId}:${operation.targetId}`).join('|');
      const sortedSignature = [...operations]
        .sort((left, right) => left.sourceId.localeCompare(right.sourceId) || left.targetId.localeCompare(right.targetId))
        .map((operation) => `${operation.sourceId}:${operation.targetId}`).join('|');
      if (signature !== sortedSignature) errors.push(`War ${war.id} operations are not stably sorted.`);
      for (const operation of operations) {
        if (!exactKeys(operation, OPERATION_KEYS)) errors.push(`War ${war.id} operation has non-canonical keys.`);
        const source = state.territories[operation.sourceId];
        const target = state.territories[operation.targetId];
        const axisKey = [operation.sourceId, operation.targetId]
          .sort((left, right) => left.localeCompare(right)).join(':');
        if (usedSources.has(operation.sourceId)) errors.push(`War ${war.id} reuses an army source across fronts.`);
        usedSources.add(operation.sourceId);
        if (usedAxes.has(axisKey)) errors.push(`War ${war.id} reuses the same physical front.`);
        usedAxes.add(axisKey);
        if (!source || !target || operation.commanderId !== commanderId
          || source.owner !== commanderId
          || selectArmyCombatManpowerV2(state, commanderId, source.army) <= 0
          || target.owner !== opponentId) errors.push(`War ${war.id} has an invalid operation.`);
        const route = selectCoopMilitaryAccessRouteBetweenV2(
          state,
          content,
          commanderId,
          opponentId,
          operation.sourceId,
          operation.targetId,
        );
        if (route?.access !== operation.access) {
          errors.push(`War ${war.id} operation has no legal route.`);
        }
        if (survivalRogueHumanWar && commanderId === war.defenderId
          && (war.battles <= 0
            || !state.runProgression.scorchedWorldTerritoryIds.includes(operation.targetId)
            || !target
            || selectArmyCombatManpowerV2(state, ROGUE_AI_NATION_ID_V2, target.army)
              > localFormationCapitulationThresholdV2(target.army.capacity)
            || route?.hopCount !== 1)) {
          errors.push(`Survival Rogue war ${war.id} has an invalid human counterfront.`);
        }
      }
    }
  }
  for (const truce of state.truces) {
    if (!exactKeys(truce, TRUCE_KEYS)) errors.push('Truce has non-canonical keys.');
    if (!state.players[truce.leftId] || !state.players[truce.rightId] || truce.leftId === truce.rightId || !Number.isFinite(truce.expiresTick)) errors.push('Truce has invalid references or values.');
  }
  for (const obligation of state.ceasefireObligations) {
    if (!exactKeys(obligation, CEASEFIRE_OBLIGATION_KEYS)) errors.push('Ceasefire obligation has non-canonical keys.');
    if (!state.players[obligation.payerId] || !state.players[obligation.payeeId]
      || obligation.payerId === obligation.payeeId || !obligation.warId
      || ![obligation.weeklyCost, obligation.startsTick, obligation.expiresTick].every(Number.isFinite)
      || obligation.weeklyCost < 0 || obligation.expiresTick <= obligation.startsTick) {
      errors.push('Ceasefire obligation has invalid references or values.');
    }
  }
  for (const offer of state.offers) {
    if (!hasOnlyKeys(offer, OFFER_KEYS)) errors.push(`Offer ${offer.id} has non-canonical keys.`);
    if (!state.players[offer.fromId] || !state.players[offer.toId] || !state.wars.some((war) => war.id === offer.warId)) errors.push(`Offer ${offer.id} has invalid references.`);
    if (![offer.createdTick, offer.expiresTick, offer.cashAmount ?? 0, offer.weeklyCost ?? 0, offer.paymentWeeks ?? 0].every(Number.isFinite)
      || (offer.settlement === 'ceasefire' && (!(offer.weeklyCost! > 0) || offer.paymentWeeks !== LEGACY_CEASEFIRE_PAYMENT_WEEKS))) {
      errors.push(`Offer ${offer.id} has invalid numeric state.`);
    }
  }
  const alliancePairs = new Set<string>();
  const allianceSignature = state.alliances.map((alliance) => `${alliance.leftId}:${alliance.rightId}`).join('|');
  const sortedAllianceSignature = [...state.alliances]
    .sort((left, right) => left.leftId.localeCompare(right.leftId) || left.rightId.localeCompare(right.rightId))
    .map((alliance) => `${alliance.leftId}:${alliance.rightId}`).join('|');
  if (allianceSignature !== sortedAllianceSignature) errors.push('Alliances are not stably sorted.');
  for (const alliance of state.alliances) {
    const key = relationKeyV2(alliance.leftId, alliance.rightId);
    if (!exactKeys(alliance, ALLIANCE_KEYS)
      || alliance.leftId.localeCompare(alliance.rightId) >= 0
      || !isHumanPlayerV2(state, alliance.leftId) || !isHumanPlayerV2(state, alliance.rightId)
      || !state.players[alliance.leftId] || !state.players[alliance.rightId]
      || selectIsEliminatedV2(state, alliance.leftId) || selectIsEliminatedV2(state, alliance.rightId)
      || !Number.isInteger(alliance.formedTick) || alliance.formedTick < 0 || alliance.formedTick > state.tick
      || warPairs.has(key)) {
      errors.push(`Alliance ${key} is invalid.`);
    }
    if (alliancePairs.has(key)) errors.push(`Duplicate alliance: ${key}.`);
    alliancePairs.add(key);
  }
  const offerPairs = new Set<string>();
  const offerSignature = state.allianceOffers.map((offer) => `${offer.fromId}:${offer.toId}`).join('|');
  const sortedOfferSignature = [...state.allianceOffers]
    .sort((left, right) => left.fromId.localeCompare(right.fromId) || left.toId.localeCompare(right.toId))
    .map((offer) => `${offer.fromId}:${offer.toId}`).join('|');
  if (offerSignature !== sortedOfferSignature) errors.push('Alliance invitations are not stably sorted.');
  for (const offer of state.allianceOffers) {
    const key = relationKeyV2(offer.fromId, offer.toId);
    if (!exactKeys(offer, ALLIANCE_OFFER_KEYS)
      || offer.fromId === offer.toId
      || !isHumanPlayerV2(state, offer.fromId) || !isHumanPlayerV2(state, offer.toId)
      || !state.players[offer.fromId] || !state.players[offer.toId]
      || selectIsEliminatedV2(state, offer.fromId) || selectIsEliminatedV2(state, offer.toId)
      || !Number.isInteger(offer.createdTick) || !Number.isInteger(offer.expiresTick)
      || offer.createdTick < 0 || offer.createdTick > state.tick
      || offer.expiresTick - offer.createdTick !== ALLIANCE_OFFER_DURATION_TICKS
      || offer.expiresTick <= state.tick
      || alliancePairs.has(key) || warPairs.has(key)) {
      errors.push(`Alliance invitation ${offer.fromId}->${offer.toId} is invalid.`);
    }
    if (offerPairs.has(key)) errors.push(`Duplicate alliance invitation: ${key}.`);
    offerPairs.add(key);
  }
  return errors;
}

export function assertInvariantsV2(state: WorldStateV2, content: WorldContentV2): void {
  const errors = invariantErrorsV2(state, content);
  if (errors.length > 0) throw new Error(`V2 invariant failure:\n${errors.join('\n')}`);
}
