import { clamp, round } from './balance';
import { isWorldConnectionOpenV2 } from './antarcticGateways';
import { synchronizeArmyCapacityV2, initialNationArmyCapacityBenchmarkV2 } from './capacity';
import {
  ANTARCTIC_TERRITORY_IDS_V2,
  ROGUE_AI_NATION_ID_V2,
  type WorldContentV2,
} from './content';
import { addWorldEventV2 } from './events';
import { isHumanPlayerV2 } from './humanPlayers';
import { selectApexSignalPurgeFocusV2 } from './apexSignalPurgeFocus';
import { openingStartingTreasuryV2 } from './nationState';
import { initialTrainedReserveManpowerV2 } from './reserveForces';
import { selectRunModifiersV2 } from './runProgression';
import { humanStartingArmyMultiplierForContentV2 } from './traits';
import type {
  ApexDoctrineRuntimeV2,
  ApexSecondaryProjectionV2,
  CommandResultV2,
  CommanderCapabilitiesV2,
  CommanderEmpireSupportV2,
  CommanderEconomyPrioritiesV2,
  CommanderForceInitializationV2,
  CommanderForceStateV2,
  CommanderFrontAssignmentV2,
  CommanderMissionV2,
  CommanderOrderTermsV2,
  FrontOperationV2,
  PlayerId,
  TerritoryId,
  WarStateV2,
  WorldStateV2,
} from './types';

export const DEFAULT_COMMANDER_PRIORITIES_V2: Readonly<CommanderEconomyPrioritiesV2>
  = Object.freeze({ training: 40, logistics: 40, development: 20 });

export const APEX_AUTONOMY_COMMAND_REASON_V2
  = 'APEX chooses its own deployment and internal allocation; use War fronts to track its assignment.';

export const COMMANDER_TRAVEL_SPEED_KM_PER_TICK_V2 = 1_200;
/** Compatibility export: this is now the minimum normal autonomous assignment hold. */
export const COMMANDER_MANUAL_IDLE_GRACE_TICKS_V2 = 13;
export const COMMANDER_AUTONOMY_HYSTERESIS_TICKS_V2 = COMMANDER_MANUAL_IDLE_GRACE_TICKS_V2;
export const COMMANDER_AUTONOMY_REVIEW_TICKS_V2 = 4;
export const COMMANDER_AUTONOMY_SWITCH_MARGIN_V2 = 8;
const COMMANDER_LAND_EDGE_FALLBACK_KM_V2 = 350;
const COMMANDER_SEA_EDGE_FALLBACK_KM_V2 = 750;
const COMMANDER_TRAVEL_SUPPLY_PER_MILLION_TICK_V2 = 0.50;
const COMMANDER_SUPPLY_CAPACITY_WEEKS_V2 = 104;
/** APEX has no private cash runway: its tiny network uses shared Empire logistics. */
export const COMMANDER_TREASURY_RESERVE_WEEKS_V2 = 0;
/** Base APEX instruction network: useful at level one, never a source of national troops. */
export const APEX_EMPIRE_RECRUITMENT_BASE_BONUS_V2 = 0.10;
export const APEX_EMPIRE_RESERVE_TRAINING_BASE_BONUS_V2 = 0.15;
/** Retired compatibility export: civilian food no longer exists in gameplay. */
export const APEX_EMPIRE_BASE_ANNUAL_FOOD_OUTPUT_V2 = 0;
/** Legacy protocol ceiling; canonical runtime output is always zero. */
export const APEX_EMPIRE_ANNUAL_FOOD_OUTPUT_CAP_V2 = 1.56;
export const BASE_APEX_EMPIRE_SUPPORT_V2: Readonly<CommanderEmpireSupportV2> = Object.freeze({
  recruitmentMultiplier: 1 + APEX_EMPIRE_RECRUITMENT_BASE_BONUS_V2,
  reserveTrainingMultiplier: 1 + APEX_EMPIRE_RESERVE_TRAINING_BASE_BONUS_V2,
  armyCasualtyMultiplier: 1,
  armyPeaceRecoveryMultiplier: 1,
  annualFoodOutput: APEX_EMPIRE_BASE_ANNUAL_FOOD_OUTPUT_V2,
  foodProductionMultiplier: 1,
  foodStorageMultiplier: 1,
  foodImportCostMultiplier: 1,
});
export const NEUTRAL_COMMANDER_EMPIRE_SUPPORT_V2: Readonly<CommanderEmpireSupportV2>
  = Object.freeze({
    recruitmentMultiplier: 1,
    reserveTrainingMultiplier: 1,
    armyCasualtyMultiplier: 1,
    armyPeaceRecoveryMultiplier: 1,
    annualFoodOutput: 0,
    foodProductionMultiplier: 1,
    foodStorageMultiplier: 1,
    foodImportCostMultiplier: 1,
  });
/**
 * In peace the dome can rebuild at most 3% of its maximum integrity each week
 * before its automatic energy allocation is applied. Persisted reserve fields
 * are a backward-compatible recovery buffer, not soldiers or national reserves.
 */
export const COMMANDER_PEACE_TRAINING_CAPACITY_SHARE_V2 = 0.03;
const COMMANDER_FREE_SUPPLY_CAPACITY_WEEKS_PER_TICK_V2 = 0.50;
const COMMANDER_LEGACY_ANNUAL_OUTPUT_CAP_V2 = 0.05;
const COMMANDER_LEGACY_TREASURY_GRANT_CAP_V2 = 0.015;
/** A stationary recovery node can restore up to 3.5% dome integrity per week. */
export const COMMANDER_HQ_TRANSFER_CAPACITY_SHARE_V2 = 0.035;
/**
 * APEX multitasks during peaceful travel and purge duty: up to 1.25% of the
 * buffered energy can return to active dome integrity each week.
 */
export const COMMANDER_PEACE_FIELD_TRANSFER_CAPACITY_SHARE_V2 = 0.0125;
/** Projection Relay improves transfer/recharge throughput and route speed by 75%. */
const COMMANDER_MOBILE_HQ_TRANSFER_MULTIPLIER_V2 = 1.75;
/** Emergency Reboot preserves a small energy share; its save key remains `fieldHospital`. */
export const COMMANDER_FIELD_HOSPITAL_RECOVERY_SHARE_V2 = 0.10;
/** One battle can preserve at most 2.5% of maximum integrity in the recovery buffer. */
export const COMMANDER_FIELD_HOSPITAL_RECOVERY_CAPACITY_SHARE_V2 = 0.025;
const COMMANDER_EXTRACTION_CAPACITY_SHARE_V2 = 0.08;
/** Narrative core-continuity floor when the paid extraction talent is unavailable. */
const COMMANDER_NARRATIVE_EXTRACTION_CAPACITY_SHARE_V2 = 0.02;
/** Compatibility bounds for energy preserved by a consumed extraction. */
const COMMANDER_EXTRACTION_SURVIVORS_MIN_V2 = 0.000025;
const COMMANDER_EXTRACTION_SURVIVORS_MAX_V2 = 0.0001;
/** Compatibility thresholds: APEX holds every live front until dome integrity reaches zero. */
export const COMMANDER_DAMAGE_RETREAT_MANPOWER_READINESS_V2 = 0;
export const COMMANDER_DAMAGE_RETREAT_SUPPLY_READINESS_V2 = 0;
export const COMMANDER_RECOVERY_MANPOWER_READINESS_V2 = 0.70;
export const COMMANDER_RECOVERY_SUPPLY_READINESS_V2 = 0.60;
/** Active frontline circuitry can stabilise energy, but never rebuild at node speed. */
export const COMMANDER_FRONTLINE_RECOVERY_MULTIPLIER_V2 = 0.15;
/** One battle pulse can drain at most twenty percent of maximum shield Energy. */
export const APEX_SHIELD_MAX_ENERGY_LOSS_SHARE_PER_HIT_V2 = 0.20;
/** APEX can intercept at most half of the post-DEF national damage in one hit. */
export const APEX_FRONTLINE_SHIELD_INTERCEPT_SHARE_V2 = 0.50;
/** Compatibility export: shield integrity and blocked damage now use the same unit. */
export const APEX_FRONTLINE_DURABILITY_MAX_V2 = 1;
const COMMANDER_OPERATIONAL_SUPPLY_WEEKS_V2 = 10;
/** Persisted marker for the one canonical zero-integrity recovery lifecycle. */
const COMMANDER_EXHAUSTED_RECOVERY_HOLD_TICK_V2 = Number.MAX_SAFE_INTEGER;

const EPSILON = 0.000000001;

export const APEX_LANCER_PULSE_INTERVAL_V2 = 3;
export const APEX_LANCER_PULSE_ATTACK_MULTIPLIER_V2 = 2;
export const APEX_AEGIS_COUNTERPULSE_SHARE_V2 = 0.15;
/** Theater Mesh adds this much shared army-buff budget per extra front. */
export const APEX_NEXUS_ADDITIONAL_FRONT_BUDGET_V2 = 0.20;
/** Theater Mesh can project at most 140% total ATK/DEF across all fronts. */
export const APEX_NEXUS_MAX_PROJECTION_BUDGET_V2 = 1.40;

export const DEFAULT_APEX_DOCTRINE_RUNTIME_V2: Readonly<ApexDoctrineRuntimeV2>
  = Object.freeze({
    lancerSupportedAssaultCount: 0,
    secondaryProjection: null,
    emergencyRebootUsed: false,
  });

const APEX_CAPSTONE_CAPABILITY_KEYS_V2 = [
  'assaultSpecialist',
  'defenseSpecialist',
  'fieldHospital',
  'forceMultiplier',
] as const;

type ApexCapstoneCapabilityKeyV2 = typeof APEX_CAPSTONE_CAPABILITY_KEYS_V2[number];

/** A campaign can freeze no protocol or exactly one mutually-exclusive capstone. */
export function apexCapstoneCapabilityCountV2(
  capabilities?: Readonly<Partial<CommanderCapabilitiesV2>>,
): number {
  return APEX_CAPSTONE_CAPABILITY_KEYS_V2.reduce(
    (count, key) => count + (capabilities?.[key] === true ? 1 : 0),
    0,
  );
}

function cloneApexFrontAssignmentV2(
  front: CommanderFrontAssignmentV2,
): CommanderFrontAssignmentV2 {
  return { ...front };
}

export function normalizeApexDoctrineRuntimeV2(
  runtime?: Partial<ApexDoctrineRuntimeV2> | null,
): ApexDoctrineRuntimeV2 {
  const rawCount = Number.isFinite(runtime?.lancerSupportedAssaultCount)
    ? Math.floor(runtime!.lancerSupportedAssaultCount!) : 0;
  const lancerSupportedAssaultCount = clamp(
    rawCount,
    0,
    APEX_LANCER_PULSE_INTERVAL_V2 - 1,
  );
  const secondary = runtime?.secondaryProjection;
  const secondaryProjection = secondary
    && (secondary.mission === 'assault-support' || secondary.mission === 'defense')
    && secondary.locationId
    && secondary.front
    && secondary.pairedPrimaryFront
    ? {
        locationId: secondary.locationId,
        mission: secondary.mission,
        front: cloneApexFrontAssignmentV2(secondary.front),
        pairedPrimaryFront: cloneApexFrontAssignmentV2(secondary.pairedPrimaryFront),
      }
    : null;
  return {
    lancerSupportedAssaultCount,
    secondaryProjection,
    emergencyRebootUsed: runtime?.emergencyRebootUsed === true,
  };
}

/**
 * Repairs authenticated saves created before capstone selection became
 * exclusive. A retired NEXUS sidecar first preserves the player's chosen
 * rapid-response protocol, then migration cleanup removes its placement data.
 * Otherwise persisted Lancer charge or stable talent-tree order selects one.
 */
export function normalizeApexCapstoneProtocolV2(
  force: CommanderForceStateV2,
): ApexCapstoneCapabilityKeyV2 | null {
  const runtime = normalizeApexDoctrineRuntimeV2(force.doctrineRuntime);
  const capabilities = force.capabilities;
  let selected: ApexCapstoneCapabilityKeyV2 | null = null;
  if (runtime.secondaryProjection && capabilities.rapidResponse) {
    capabilities.forceMultiplier = true;
    selected = 'forceMultiplier';
  } else if (runtime.lancerSupportedAssaultCount > 0 && capabilities.assaultSpecialist) {
    selected = 'assaultSpecialist';
  } else {
    selected = APEX_CAPSTONE_CAPABILITY_KEYS_V2.find((key) => capabilities[key]) ?? null;
  }
  for (const key of APEX_CAPSTONE_CAPABILITY_KEYS_V2) capabilities[key] = key === selected;
  if (selected !== 'assaultSpecialist'
    && (force.shield.pulseChargeBonusPerStep ?? 0) <= EPSILON) {
    runtime.lancerSupportedAssaultCount = 0;
  }
  capabilities.rapidResponse = false;
  runtime.secondaryProjection = null;
  force.doctrineRuntime = runtime;
  return selected;
}

function apexDoctrineRuntimeV2(
  force: CommanderForceStateV2,
): ApexDoctrineRuntimeV2 {
  const normalized = normalizeApexDoctrineRuntimeV2(force.doctrineRuntime);
  force.doctrineRuntime = normalized;
  return normalized;
}

export const BASE_APEX_ARMY_ATTACK_MULTIPLIER_V2 = 1.12;
export const BASE_APEX_ARMY_DEFENSE_MULTIPLIER_V2 = 1.07;
/** Base fixed neural-pulse damage potential (one thousand troop-equivalent). */
export const BASE_APEX_PULSE_ATTACK_V2 = 0.001;

function apexArmyAttackMultiplierV2(
  state: WorldStateV2,
  playerId: PlayerId,
  force: CommanderForceStateV2,
): number {
  const legacyRunBonus = selectRunModifiersV2(state, playerId).commanderAttackBonus;
  return Math.max(1, force.shield.attackMultiplier + legacyRunBonus / 100);
}

function apexArmyDefenseMultiplierV2(
  state: WorldStateV2,
  playerId: PlayerId,
  force: CommanderForceStateV2,
): number {
  const legacyRunBonus = selectRunModifiersV2(state, playerId).commanderDefenseBonus;
  return Math.max(1, force.shield.defenseMultiplier + legacyRunBonus / 100);
}

export interface ApexFrontlineDamageAllocationV2 {
  nationalLosses: number;
  /** Legacy field name: damage removed from active neural-dome integrity. */
  apexLosses: number;
  allyLosses: number;
  /** National-equivalent damage stopped by the dome before casualty conversion. */
  interceptedDamage: number;
  /** Damage blocked per Energy spent; one without Energy Efficiency talents. */
  durabilityMultiplier: number;
  /** Bounded Countermeasure damage reflected toward the hostile formation. */
  counterpulseDamage: number;
}

/**
 * Pure frontline shield allocator. Combat supplies one post-DEF, already-capped
 * hit; ally exposure is resolved first and the separate APEX layer then absorbs
 * at most 50% of the national share while spending at most 20% of its own
 * maximum Energy. Interception talents can make each Energy stop more damage,
 * but cannot bypass either limit. An empty national formation receives no
 * protection that could extend defeat or stalemate.
 */
export function allocateApexFrontlineDamageV2(input: {
  requestedDamage: number;
  nationalManpower: number;
  allyManpower?: number;
  /** Compatibility input retained for older callers; the shared combat cap bounds reflection. */
  hostileManpower?: number;
  apex?: {
    shieldActive: boolean;
    integrity: number;
    maxIntegrity?: number;
    mirrorMatrixEligible?: boolean;
    interceptEfficiency?: number;
  };
}): ApexFrontlineDamageAllocationV2 {
  const nationalManpower = Math.max(0, input.nationalManpower);
  const allyManpower = Math.max(0, input.allyManpower ?? 0);
  const apexIntegrity = Math.max(0, input.apex?.integrity ?? 0);
  const apexMaxIntegrity = Math.max(
    apexIntegrity,
    input.apex?.maxIntegrity ?? apexIntegrity,
  );
  const interceptEfficiency = clamp(
    input.apex?.interceptEfficiency ?? 1,
    1,
    1.45,
  );
  const rawRequestedDamage = Math.max(0, input.requestedDamage);
  const exposed = nationalManpower + allyManpower;
  if (rawRequestedDamage <= EPSILON || exposed <= EPSILON) {
    return {
      nationalLosses: 0,
      apexLosses: 0,
      allyLosses: 0,
      interceptedDamage: 0,
      durabilityMultiplier: 1,
      counterpulseDamage: 0,
    };
  }

  const requestedDamage = Math.min(exposed, rawRequestedDamage);
  const allyLosses = Math.min(
    allyManpower,
    requestedDamage * allyManpower / exposed,
  );
  const nationalDamageBeforeShield = Math.min(
    nationalManpower,
    Math.max(0, requestedDamage - allyLosses),
  );
  if (!input.apex?.shieldActive || apexIntegrity <= EPSILON
    || nationalDamageBeforeShield <= EPSILON) {
    return {
      nationalLosses: nationalDamageBeforeShield,
      apexLosses: 0,
      allyLosses,
      interceptedDamage: 0,
      durabilityMultiplier: 1,
      counterpulseDamage: 0,
    };
  }

  const maximumEnergySpend = Math.min(
    apexIntegrity,
    apexMaxIntegrity * APEX_SHIELD_MAX_ENERGY_LOSS_SHARE_PER_HIT_V2,
  );
  const interceptedDamage = Math.min(
    nationalDamageBeforeShield * APEX_FRONTLINE_SHIELD_INTERCEPT_SHARE_V2,
    maximumEnergySpend * interceptEfficiency,
  );
  const energySpent = Math.min(
    maximumEnergySpend,
    interceptedDamage / interceptEfficiency,
  );
  const nationalLosses = Math.max(0, nationalDamageBeforeShield - interceptedDamage);
  const counterpulseDamage = input.apex.mirrorMatrixEligible
    ? interceptedDamage * APEX_AEGIS_COUNTERPULSE_SHARE_V2
    : 0;
  return {
    nationalLosses,
    apexLosses: energySpent,
    allyLosses,
    interceptedDamage,
    durabilityMultiplier: interceptEfficiency,
    counterpulseDamage,
  };
}

/**
 * Bounds one immutable account snapshot. Direct and authenticated legacy APEX
 * callers receive the useful level-one baseline; PRIME passes explicit neutral
 * support and can therefore never inherit human economy bonuses.
 */
export function normalizeApexEmpireSupportV2(
  support?: Readonly<Partial<CommanderEmpireSupportV2>>,
  fallback: Readonly<CommanderEmpireSupportV2> = BASE_APEX_EMPIRE_SUPPORT_V2,
): CommanderEmpireSupportV2 {
  return {
    recruitmentMultiplier: round(clamp(
      support?.recruitmentMultiplier ?? fallback.recruitmentMultiplier, 1, 1.50,
    ), 9),
    reserveTrainingMultiplier: round(clamp(
      support?.reserveTrainingMultiplier ?? fallback.reserveTrainingMultiplier, 1, 1.75,
    ), 9),
    armyCasualtyMultiplier: round(clamp(
      support?.armyCasualtyMultiplier ?? fallback.armyCasualtyMultiplier, 0.82, 1,
    ), 9),
    armyPeaceRecoveryMultiplier: round(clamp(
      support?.armyPeaceRecoveryMultiplier ?? fallback.armyPeaceRecoveryMultiplier, 1, 1.75,
    ), 9),
    annualFoodOutput: 0,
    foodProductionMultiplier: round(clamp(
      support?.foodProductionMultiplier ?? fallback.foodProductionMultiplier, 1, 1.50,
    ), 9),
    foodStorageMultiplier: round(clamp(
      support?.foodStorageMultiplier ?? fallback.foodStorageMultiplier, 1, 1.75,
    ), 9),
    foodImportCostMultiplier: round(clamp(
      support?.foodImportCostMultiplier ?? fallback.foodImportCostMultiplier, 0.75, 1,
    ), 9),
  };
}

/** Only a real human APEX force can support its own aggregated Empire. */
export function selectApexEmpireSupportV2(
  state: WorldStateV2,
  playerId: PlayerId,
): CommanderEmpireSupportV2 {
  const force = state.commanderForces?.[playerId];
  if (!force || !isHumanPlayerV2(state, playerId)) {
    return { ...NEUTRAL_COMMANDER_EMPIRE_SUPPORT_V2 };
  }
  return normalizeApexEmpireSupportV2(force.empireSupport);
}

/** Army-side talent effects exist only while the one shared shield is online. */
export function selectApexOperationalArmyModifiersV2(
  state: WorldStateV2,
  playerId: PlayerId,
): Pick<CommanderEmpireSupportV2, 'armyCasualtyMultiplier' | 'armyPeaceRecoveryMultiplier'> {
  if (selectApexShieldOperationalStateV2(state, playerId) !== 'operational') {
    return { armyCasualtyMultiplier: 1, armyPeaceRecoveryMultiplier: 1 };
  }
  const support = selectApexEmpireSupportV2(state, playerId);
  return {
    armyCasualtyMultiplier: support.armyCasualtyMultiplier,
    armyPeaceRecoveryMultiplier: support.armyPeaceRecoveryMultiplier,
  };
}

/** Narrow compatibility selector retained for military callsites and tests. */
export function selectApexEmpireReplenishmentModifiersV2(
  state: WorldStateV2,
  playerId: PlayerId,
): Pick<CommanderEmpireSupportV2, 'recruitmentMultiplier' | 'reserveTrainingMultiplier'> {
  const support = selectApexEmpireSupportV2(state, playerId);
  return {
    recruitmentMultiplier: support.recruitmentMultiplier,
    reserveTrainingMultiplier: support.reserveTrainingMultiplier,
  };
}

const prioritiesValidV2 = (priorities: CommanderEconomyPrioritiesV2): boolean => (
  [priorities.training, priorities.logistics, priorities.development]
    .every((value) => Number.isInteger(value) && value >= 0 && value <= 100)
  && priorities.training + priorities.logistics + priorities.development === 100
);

export type CommanderQualityTierV2 = 'national' | 'veteran' | 'elite' | 'apex-elite';

/** Truthful comparison source for menu, HUD and map presentation. */
export interface CommanderEliteComparisonV2 {
  attack: number;
  defense: number;
  nationalAverageAttack: number;
  nationalAverageDefense: number;
  attackRatio: number;
  defenseRatio: number;
  qualityTier: CommanderQualityTierV2;
  qualityLabel: string;
  benchmarkNationCount: number;
}

/**
 * Read-only next-week APEX contribution for HUDs and deterministic simulation.
 * APEX uses shared logistics at no gameplay cash cost; all institutional
 * output is therefore a direct national-finance contribution.
 */
export interface CommanderEconomyProjectionV2 {
  weeklyIncome: number;
  weeklyActiveUpkeep: number;
  weeklyReserveUpkeep: number;
  weeklyUpkeepDue: number;
  weeklyUpkeepPaid: number;
  weeklyTrainingInvestment: number;
  weeklyLogisticsInvestment: number;
  weeklyDevelopmentInvestment: number;
  weeklyInvestment: number;
  treasuryReserveTarget: number;
  weeklyEmpireTransfer: number;
  corpsTreasuryAfter: number;
  empireTreasuryAfter: number;
  trainedReserveGain: number;
  supplyGain: number;
  annualOutputGain: number;
}

export interface CommanderTreasuryReserveStatusV2 {
  treasury: number;
  reserveTarget: number;
  reserveShortfall: number;
  reserveSurplus: number;
}

export interface CommanderForecastMobilityV2 {
  status: 'absent' | 'ready' | 'delayed' | 'committed' | 'unreachable';
  etaWeeks: number | null;
  readiness: number;
  supplyReadiness: number;
  integrity: number;
  maxIntegrity: number;
  attackMultiplier: number;
  defenseMultiplier: number;
  pulseAttack: number;
  interceptEfficiency: number;
  reason: string;
}

/**
 * Canonical public state for the APEX neural energy shield.
 */
export type ApexShieldOperationalStateV2 =
  | 'operational'
  | 'recharging'
  | 'unavailable';

export interface ApexShieldPresentationV2 {
  readonly integrityCurrent: number;
  readonly integrityMax: number;
  /** Display percentage from 0 through 100, retaining tenths near full. */
  readonly integrityPercent: number;
  readonly operationalState: ApexShieldOperationalStateV2;
  /** Multiplier applied to the supported national army; one while offline. */
  readonly attackMultiplier: number;
  /** Multiplier applied to the supported national army; one while offline. */
  readonly defenseMultiplier: number;
  /** Fixed neural attack potential; zero while the network is offline. */
  readonly pulseAttack: number;
  /** Readable average percentage bonus, never independent combat strength. */
  readonly supportBonusPercent: number;
}

export interface ApexEmpireShieldFrontV2 {
  readonly warId: string;
  readonly sourceId: TerritoryId;
  readonly targetId: TerritoryId;
  readonly friendlyTerritoryId: TerritoryId;
  readonly hostileTerritoryId: TerritoryId;
  readonly mission: Extract<CommanderMissionV2, 'assault-support' | 'defense'>;
  /**
   * Share of the one global ATK/DEF pool projected into this front. Integrity
   * is never cloned: every pulse still damages the same persisted shield.
   */
  readonly allocationShare: number;
}

/**
 * Renderer- and UI-facing projection of the distributed APEX network. The
 * legacy force location remains in saves only as a recovery/core anchor; it
 * never limits coverage, combat support or Signal Purge work.
 */
export interface ApexEmpireShieldNetworkV2 extends ApexShieldPresentationV2 {
  readonly active: boolean;
  readonly coverageTerritoryIds: readonly TerritoryId[];
  readonly activeFrontTerritoryIds: readonly TerritoryId[];
  readonly activeFrontCount: number;
  readonly fronts: readonly ApexEmpireShieldFrontV2[];
}

/** Hostile signal remnants block combat-field authentication until purged. */
function apexEmpireShieldTerritoryEligibleV2(
  state: WorldStateV2,
  playerId: PlayerId,
  territoryId: TerritoryId,
): boolean {
  const territory = state.territories[territoryId];
  return Boolean(
    territory?.owner === playerId
      && territory.integration >= 1 - EPSILON
      && !territory.integrationProgram,
  );
}

/**
 * Single authoritative adapter from persisted shield state to public terms.
 * A true-zero extraction stays non-operational for the complete recovery
 * mission, including a loaded 99.9% state; only the process that reaches 100%
 * releases the dome and makes its force multipliers available again.
 */
export function selectApexShieldPresentationV2(
  state: WorldStateV2,
  playerId: PlayerId,
): ApexShieldPresentationV2 | null {
  const force = state.commanderForces?.[playerId];
  if (!force) return null;

  const integrityMax = Math.max(0, force.shield.maxIntegrity);
  const integrityCurrent = clamp(force.shield.integrity, 0, integrityMax);
  const rawIntegrityPercent = clamp(
    integrityMax > EPSILON ? integrityCurrent / integrityMax * 100 : 0,
    0,
    100,
  );
  // Never round a still-recharging 99.x dome up to the operational 100% gate.
  const integrityPercent = integrityMax > EPSILON
    && integrityCurrent >= integrityMax
    ? 100
    : Math.floor((rawIntegrityPercent + Number.EPSILON) * 10) / 10;
  const recoveryLifecycle = force.mission === 'evacuate'
    || force.mission === 'hq-training';
  const ownerAvailable = Boolean(state.players[playerId]);
  const operational = ownerAvailable
    && integrityCurrent > EPSILON
    && !recoveryLifecycle;
  const operationalState: ApexShieldOperationalStateV2 = !ownerAvailable
    ? 'unavailable'
    : recoveryLifecycle
      ? 'recharging'
      : operational
        ? 'operational'
        : 'unavailable';
  const attackMultiplier = operational
    ? round(apexArmyAttackMultiplierV2(state, playerId, force), 6) : 1;
  const defenseMultiplier = operational
    ? round(apexArmyDefenseMultiplierV2(state, playerId, force), 6) : 1;
  const pulseAttack = operational ? round(Math.max(0, force.shield.pulseAttack), 9) : 0;
  const supportBonusPercent = operational ? round(
    ((attackMultiplier - 1) * 0.55 + (defenseMultiplier - 1) * 0.45) * 100,
    3,
  ) : 0;

  return Object.freeze({
    integrityCurrent: round(integrityCurrent, 9),
    integrityMax: round(integrityMax, 9),
    integrityPercent,
    operationalState,
    attackMultiplier,
    defenseMultiplier,
    pulseAttack,
    supportBonusPercent,
  });
}

/**
 * Exact per-front share of the one global ATK/DEF pool. Without Theater Mesh,
 * the normal 100% budget is divided evenly. Theater Mesh adds 20% budget for
 * every additional live front, caps the total at 140%, then divides it evenly.
 */
export function apexEmpireFrontAllocationShareV2(
  activeFrontCount: number,
  omnipresenceGrid: boolean,
): number {
  if (activeFrontCount <= 1) return 1;
  const totalProjectionBudget = omnipresenceGrid
    ? Math.min(
        APEX_NEXUS_MAX_PROJECTION_BUDGET_V2,
        1 + (activeFrontCount - 1) * APEX_NEXUS_ADDITIONAL_FRONT_BUDGET_V2,
      )
    : 1;
  return clamp(totalProjectionBudget / activeFrontCount, 0, 1);
}

/**
 * One deterministic empire-wide shield view. Every human-controlled territory
 * is covered while the network is operational and every live war front gets a
 * projection. All projections consume the same integrity and energy records.
 */
export function selectApexEmpireShieldNetworkV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): ApexEmpireShieldNetworkV2 | null {
  const force = state.commanderForces?.[playerId];
  const presentation = selectApexShieldPresentationV2(state, playerId);
  if (!force || !presentation || !isHumanPlayerV2(state, playerId)) return null;

  const coverageTerritoryIds = content.territoryIds
    .filter((territoryId) => apexEmpireShieldTerritoryEligibleV2(
      state,
      playerId,
      territoryId,
    ))
    .sort((left, right) => left.localeCompare(right));
  const coverage = new Set(coverageTerritoryIds);
  const rawFronts = activeCommanderFrontsV2(state).flatMap((front) => {
    const humanAssaults = front.source.owner === playerId
      && front.target.owner !== playerId;
    const humanDefends = front.target.owner === playerId
      && front.source.owner !== playerId;
    if (!humanAssaults && !humanDefends) return [];
    const friendlyTerritoryId = humanAssaults
      ? front.operation.sourceId : front.operation.targetId;
    // A newly captured country is still carrying the hostile signal. APEX can
    // purge it through the distributed network, but cannot authenticate a
    // combat dome there until integration reaches exactly 100%.
    if (!coverage.has(friendlyTerritoryId)) return [];
    return [{
      warId: front.war.id,
      sourceId: front.operation.sourceId,
      targetId: front.operation.targetId,
      friendlyTerritoryId,
      hostileTerritoryId: humanAssaults
        ? front.operation.targetId : front.operation.sourceId,
      mission: humanAssaults ? 'assault-support' as const : 'defense' as const,
    }];
  });
  const allocationShare = apexEmpireFrontAllocationShareV2(
    rawFronts.length,
    force.capabilities.forceMultiplier,
  );
  const fronts = rawFronts.map((front) => Object.freeze({
    ...front,
    allocationShare: round(allocationShare, 9),
  }));
  const active = presentation.operationalState === 'operational'
    && coverageTerritoryIds.length > 0;

  return Object.freeze({
    ...presentation,
    active,
    coverageTerritoryIds: Object.freeze([...coverageTerritoryIds]),
    activeFrontTerritoryIds: Object.freeze([...new Set(
      fronts.map((front) => front.friendlyTerritoryId),
    )].sort((left, right) => left.localeCompare(right))),
    activeFrontCount: fronts.length,
    fronts: Object.freeze(fronts),
  });
}

/** Focused scalar selectors for HUD, name-tag and map consumers. */
export const selectApexShieldIntegrityCurrentV2 = (
  state: WorldStateV2,
  playerId: PlayerId,
): number => selectApexShieldPresentationV2(state, playerId)?.integrityCurrent ?? 0;

export const selectApexShieldIntegrityMaxV2 = (
  state: WorldStateV2,
  playerId: PlayerId,
): number => selectApexShieldPresentationV2(state, playerId)?.integrityMax ?? 0;

export const selectApexShieldIntegrityPercentV2 = (
  state: WorldStateV2,
  playerId: PlayerId,
): number => selectApexShieldPresentationV2(state, playerId)?.integrityPercent ?? 0;

export const selectApexShieldOperationalStateV2 = (
  state: WorldStateV2,
  playerId: PlayerId,
): ApexShieldOperationalStateV2 => (
  selectApexShieldPresentationV2(state, playerId)?.operationalState ?? 'unavailable'
);

export const selectApexShieldAttackV2 = (
  state: WorldStateV2,
  playerId: PlayerId,
): number => selectApexShieldPresentationV2(state, playerId)?.attackMultiplier ?? 1;

export const selectApexShieldDefenseV2 = (
  state: WorldStateV2,
  playerId: PlayerId,
): number => selectApexShieldPresentationV2(state, playerId)?.defenseMultiplier ?? 1;

export const selectApexShieldCombatPowerV2 = (
  state: WorldStateV2,
  playerId: PlayerId,
): number => selectApexShieldPresentationV2(state, playerId)?.supportBonusPercent ?? 0;

export interface ApexLancerPulseStatusV2 {
  /** Exact persisted progress toward the next Overdrive Pulse: 0, 1 or 2. */
  readonly supportedAssaultCount: number;
  readonly nextPulseCharged: boolean;
  readonly nextAttackMultiplier: number;
}

export interface ApexLancerBattleCommitV2 extends ApexLancerPulseStatusV2 {
  readonly recorded: boolean;
  readonly singularityPulse: boolean;
}

/** Read-only charge state for panels, forecasts and the live battle boundary. */
export function selectApexLancerPulseStatusV2(
  state: WorldStateV2,
  playerId: PlayerId,
): ApexLancerPulseStatusV2 {
  const force = state.commanderForces?.[playerId];
  const chargeBonusPerStep = clamp(
    force?.shield.pulseChargeBonusPerStep ?? 0,
    0,
    0.45,
  );
  const enabled = Boolean(force
    && isHumanPlayerV2(state, playerId)
    && (force.capabilities.assaultSpecialist || chargeBonusPerStep > EPSILON));
  const supportedAssaultCount = enabled
    ? normalizeApexDoctrineRuntimeV2(force?.doctrineRuntime)
      .lancerSupportedAssaultCount
    : 0;
  const nextPulseCharged = Boolean(force?.capabilities.assaultSpecialist)
    && supportedAssaultCount === APEX_LANCER_PULSE_INTERVAL_V2 - 1;
  const storedChargeMultiplier = 1 + supportedAssaultCount * chargeBonusPerStep;
  return Object.freeze({
    supportedAssaultCount,
    nextPulseCharged,
    nextAttackMultiplier: storedChargeMultiplier * (nextPulseCharged
      ? APEX_LANCER_PULSE_ATTACK_MULTIPLIER_V2 : 1),
  });
}

/**
 * Commits exactly one actually resolved APEX-supported offensive battle. The
 * resolved attacker formation is the capability token: passing null for an
 * unsupported or defensive battle is a no-op. Selectors never call this, so
 * previews cannot charge or consume the pulse.
 */
export function registerApexSupportedAssaultBattleV2(
  state: WorldStateV2,
  supportedAttacker: CommanderBattleFormationV2 | null | undefined,
): ApexLancerBattleCommitV2 {
  const playerId = supportedAttacker?.playerId;
  if (!playerId || supportedAttacker.mission !== 'assault-support') return {
    recorded: false,
    singularityPulse: false,
    supportedAssaultCount: 0,
    nextPulseCharged: false,
    nextAttackMultiplier: 1,
  };
  const force = state.commanderForces?.[playerId];
  const chargeBonusPerStep = clamp(
    force?.shield.pulseChargeBonusPerStep ?? 0,
    0,
    0.45,
  );
  if (!force || !isHumanPlayerV2(state, playerId)
    || (!force.capabilities.assaultSpecialist && chargeBonusPerStep <= EPSILON)) {
    return {
      recorded: false,
      singularityPulse: false,
      supportedAssaultCount: 0,
      nextPulseCharged: false,
      nextAttackMultiplier: 1,
    };
  }
  const runtime = apexDoctrineRuntimeV2(force);
  const completedChargeCycle = runtime.lancerSupportedAssaultCount
    === APEX_LANCER_PULSE_INTERVAL_V2 - 1;
  const singularityPulse = force.capabilities.assaultSpecialist
    && completedChargeCycle;
  runtime.lancerSupportedAssaultCount = completedChargeCycle
    ? 0 : runtime.lancerSupportedAssaultCount + 1;
  if (singularityPulse) {
    applyApexShieldDamageV2(
      state,
      playerId,
      force.shield.maxIntegrity * 0.02,
    );
  }
  const next = selectApexLancerPulseStatusV2(state, playerId);
  return {
    recorded: true,
    singularityPulse,
    ...next,
  };
}

/**
 * Legacy comparison API for the dome's ATK/DEF ratings against the mean
 * national formation baseline. It compares ratings, never soldiers or troop
 * manpower. The Rogue AI is excluded because it is an endgame faction.
 */
export function commanderEliteComparisonForRatingsV2(
  content: WorldContentV2,
  attack: number,
  defense: number,
): CommanderEliteComparisonV2 {
  const ordinaryNations = content.nationIds
    .filter((nationId) => content.nations[nationId]?.kind !== 'rogue-ai')
    .map((nationId) => content.nations[nationId]!);
  const benchmarkNationCount = ordinaryNations.length;
  const nationalAverageAttack = benchmarkNationCount > 0
    ? ordinaryNations.reduce((sum, nation) => (
      sum + (nation.militaryAttackRating ?? nation.militaryQuality ?? 1)
    ), 0) / benchmarkNationCount
    : 1;
  const nationalAverageDefense = benchmarkNationCount > 0
    ? ordinaryNations.reduce((sum, nation) => (
      sum + (nation.militaryDefenseRating ?? nation.militaryQuality ?? 1)
    ), 0) / benchmarkNationCount
    : 1;
  const attackRatio = Math.max(0, attack) / Math.max(EPSILON, nationalAverageAttack);
  const defenseRatio = Math.max(0, defense) / Math.max(EPSILON, nationalAverageDefense);
  const lowerRatio = Math.min(attackRatio, defenseRatio);
  const qualityTier: CommanderQualityTierV2 = lowerRatio >= 2
    ? 'apex-elite' : lowerRatio >= 1.5 ? 'elite' : lowerRatio >= 1.15 ? 'veteran' : 'national';
  const qualityLabel = qualityTier === 'apex-elite' ? 'APEX DOME'
    : qualityTier === 'elite' ? 'HIGH-ENERGY DOME'
      : qualityTier === 'veteran' ? 'REINFORCED DOME' : 'BASELINE DOME';
  return {
    attack: round(attack, 3),
    defense: round(defense, 3),
    nationalAverageAttack: round(nationalAverageAttack, 3),
    nationalAverageDefense: round(nationalAverageDefense, 3),
    attackRatio: round(attackRatio, 2),
    defenseRatio: round(defenseRatio, 2),
    qualityTier,
    qualityLabel,
    benchmarkNationCount,
  };
}

export function selectCommanderEliteComparisonV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): CommanderEliteComparisonV2 | null {
  const shield = state.commanderForces?.[playerId]?.shield;
  return shield
    ? commanderEliteComparisonForRatingsV2(
        content,
        shield.attackMultiplier,
        shield.defenseMultiplier,
      )
    : null;
}

const frontSignatureV2 = (front: CommanderFrontAssignmentV2): string => (
  `${front.warId}:${front.sourceId}:${front.targetId}`
);

function apexFrontAssignmentOperationalV2(
  state: WorldStateV2,
  playerId: PlayerId,
  locationId: TerritoryId,
  mission: CommanderMissionV2,
  front: CommanderFrontAssignmentV2 | null,
): boolean {
  if (!front || (mission !== 'assault-support' && mission !== 'defense')) return false;
  const war = state.wars.find((candidate) => candidate.id === front.warId);
  const operationActive = war
    && [...war.attackerOperations, ...war.defenderOperations]
      .some((operation) => operation.sourceId === front.sourceId
        && operation.targetId === front.targetId);
  if (!war || !operationActive) return false;
  const source = state.territories[front.sourceId];
  const target = state.territories[front.targetId];
  if (!source || !target || source.owner === target.owner) return false;
  return mission === 'assault-support'
    ? source.owner === playerId && locationId === front.sourceId
    : target.owner === playerId && locationId === front.targetId;
}

function apexSecondaryProjectionPairedFrontsOperationalV2(
  state: WorldStateV2,
  playerId: PlayerId,
  force: CommanderForceStateV2,
  secondary: ApexSecondaryProjectionV2 | null,
): secondary is ApexSecondaryProjectionV2 {
  return Boolean(
    force.capabilities.forceMultiplier
      && !force.transit
      && force.shield.integrity > EPSILON
      && force.front
      && secondary
      && frontSignatureV2(secondary.pairedPrimaryFront)
        === frontSignatureV2(force.front)
      && frontSignatureV2(secondary.front) !== frontSignatureV2(force.front)
      && secondary.locationId !== force.locationId
      && apexFrontAssignmentOperationalV2(
        state, playerId, force.locationId, force.mission, force.front,
      )
      && apexFrontAssignmentOperationalV2(
        state,
        playerId,
        secondary.locationId,
        secondary.mission,
        secondary.front,
      ),
  );
}

function apexSecondaryProjectionHasLegalTetherV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  force: CommanderForceStateV2,
  secondary: ApexSecondaryProjectionV2,
): boolean {
  return Boolean(selectCommanderRouteV2(
    state,
    content,
    playerId,
    force.locationId,
    secondary.locationId,
  ));
}

function apexSecondaryProjectionOperationalV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  force: CommanderForceStateV2,
  secondary: ApexSecondaryProjectionV2 | null,
): secondary is ApexSecondaryProjectionV2 {
  return apexSecondaryProjectionPairedFrontsOperationalV2(
    state, playerId, force, secondary,
  ) && apexSecondaryProjectionHasLegalTetherV2(
    state, content, playerId, force, secondary,
  );
}

function clearApexSecondaryProjectionV2(
  force: CommanderForceStateV2,
): boolean {
  const runtime = apexDoctrineRuntimeV2(force);
  if (!runtime.secondaryProjection) return false;
  runtime.secondaryProjection = null;
  return true;
}

/**
 * Compatibility view retained for older UI/save adapters. Live NEXUS no
 * longer owns a second location or projection sidecar; `combatShare` is the
 * current even share of the distributed Omnipresence Grid.
 */
export interface ApexTwinProjectionStatusV2 {
  readonly active: boolean;
  readonly combatShare: number;
  readonly primaryLocationId: TerritoryId | null;
  readonly secondaryProjection: ApexSecondaryProjectionV2 | null;
}

/** Read-only legacy adapter over the stateless Omnipresence Grid. */
export function selectApexTwinProjectionStatusV2(
  state: WorldStateV2,
  playerId: PlayerId,
  content: WorldContentV2,
): ApexTwinProjectionStatusV2 {
  const force = state.commanderForces?.[playerId];
  if (!force) return Object.freeze({
    active: false,
    combatShare: 1,
    primaryLocationId: null,
    secondaryProjection: null,
  });
  if (isHumanPlayerV2(state, playerId)) {
    const network = selectApexEmpireShieldNetworkV2(state, content, playerId);
    const active = Boolean(
      force.capabilities.forceMultiplier
        && network?.active
        && (network.activeFrontCount ?? 0) > 1,
    );
    return Object.freeze({
      active,
      combatShare: active ? network!.fronts[0]?.allocationShare ?? 1 : 1,
      primaryLocationId: network?.fronts[0]?.friendlyTerritoryId
        ?? network?.coverageTerritoryIds[0] ?? null,
      secondaryProjection: null,
    });
  }
  return Object.freeze({
    active: false,
    combatShare: 1,
    primaryLocationId: force.locationId,
    secondaryProjection: null,
  });
}

const frontMatchesV2 = (
  front: CommanderFrontAssignmentV2 | null,
  war: WarStateV2,
  operation: FrontOperationV2,
): boolean => Boolean(front
  && front.warId === war.id
  && front.sourceId === operation.sourceId
  && front.targetId === operation.targetId);

function connectionExistsV2(
  state: WorldStateV2,
  content: WorldContentV2,
  sourceId: TerritoryId,
  targetId: TerritoryId,
): boolean {
  return Boolean(content.territories[sourceId]?.connections.some((edge) => (
    edge.targetId === targetId && isWorldConnectionOpenV2(state, sourceId, targetId)
  )));
}

function edgeDistanceKmV2(
  content: WorldContentV2,
  sourceId: TerritoryId,
  targetId: TerritoryId,
): number | undefined {
  const edge = content.territories[sourceId]?.connections.find((candidate) => (
    candidate.targetId === targetId
  ));
  if (!edge) return undefined;
  const fallback = edge.kind === 'land'
    ? COMMANDER_LAND_EDGE_FALLBACK_KM_V2
    : COMMANDER_SEA_EDGE_FALLBACK_KM_V2;
  return Math.max(50, Number.isFinite(edge.distanceKm) ? edge.distanceKm! : fallback);
}

interface CommanderRouteV2 {
  path: TerritoryId[];
  distanceKm: number;
}

function commanderRouteTravelTicksV2(
  force: CommanderForceStateV2,
  route: CommanderRouteV2,
): number {
  const travelSpeed = COMMANDER_TRAVEL_SPEED_KM_PER_TICK_V2
    * (force.capabilities.mobileHeadquarters
      ? COMMANDER_MOBILE_HQ_TRANSFER_MULTIPLIER_V2 : 1);
  return route.distanceKm <= EPSILON ? 0 : Math.max(1, Math.ceil(
    route.distanceKm / travelSpeed
      + Math.max(0, route.path.length - 2) * 0.15,
  ));
}

function selectCommanderRouteInternalV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  sourceId: TerritoryId,
  destinationId: TerritoryId,
  allowOccupiedSource: boolean,
): CommanderRouteV2 | undefined {
  if (!content.territories[sourceId] || !content.territories[destinationId]) return undefined;
  if ((!allowOccupiedSource && state.territories[sourceId]?.owner !== playerId)
    || state.territories[destinationId]?.owner !== playerId) return undefined;
  if (sourceId === destinationId) return { path: [sourceId], distanceKm: 0 };

  const best = new Map<TerritoryId, { distanceKm: number; signature: string; path: TerritoryId[] }>();
  const visited = new Set<TerritoryId>();
  best.set(sourceId, { distanceKm: 0, signature: sourceId, path: [sourceId] });

  while (visited.size < content.territoryIds.length) {
    let currentId: TerritoryId | undefined;
    let current: { distanceKm: number; signature: string; path: TerritoryId[] } | undefined;
    for (const [candidateId, candidate] of best) {
      if (visited.has(candidateId)) continue;
      if (!current
        || candidate.distanceKm < current.distanceKm - EPSILON
        || Math.abs(candidate.distanceKm - current.distanceKm) <= EPSILON
          && candidate.signature.localeCompare(current.signature) < 0) {
        currentId = candidateId;
        current = candidate;
      }
    }
    if (!currentId || !current) break;
    if (currentId === destinationId) {
      return { path: current.path, distanceKm: round(current.distanceKm, 3) };
    }
    visited.add(currentId);
    const edges = [...(content.territories[currentId]?.connections ?? [])]
      .filter((edge) => isWorldConnectionOpenV2(state, currentId, edge.targetId))
      .sort((left, right) => left.targetId.localeCompare(right.targetId));
    for (const edge of edges) {
      if (!content.territories[edge.targetId]
        || state.territories[edge.targetId]?.owner !== playerId
        || visited.has(edge.targetId)) continue;
      const edgeDistance = edgeDistanceKmV2(content, currentId, edge.targetId);
      if (edgeDistance === undefined) continue;
      const distanceKm = current.distanceKm + edgeDistance;
      const signature = `${current.signature}>${edge.targetId}`;
      const previous = best.get(edge.targetId);
      if (!previous
        || distanceKm < previous.distanceKm - EPSILON
        || Math.abs(distanceKm - previous.distanceKm) <= EPSILON
          && signature.localeCompare(previous.signature) < 0) {
        best.set(edge.targetId, {
          distanceKm,
          signature,
          path: [...current.path, edge.targetId],
        });
      }
    }
  }
  return undefined;
}

/** Stable physical route that never leaves territory controlled by the Commander. */
export function selectCommanderRouteV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  sourceId: TerritoryId,
  destinationId: TerritoryId,
): CommanderRouteV2 | undefined {
  return selectCommanderRouteInternalV2(
    state, content, playerId, sourceId, destinationId, false,
  );
}

/**
 * A one-way route out of the station that has just fallen. The occupied source
 * is the sole exception: every node APEX enters after departure must already
 * be controlled by the human empire. This preserves a visible extraction
 * without ever granting movement through hostile intermediate territory.
 */
export function selectCommanderEmergencyExtractionRouteV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  sourceId: TerritoryId,
  destinationId: TerritoryId,
): CommanderRouteV2 | undefined {
  if (state.territories[sourceId]?.owner === playerId) return undefined;
  return selectCommanderRouteInternalV2(
    state, content, playerId, sourceId, destinationId, true,
  );
}

/**
 * Side-effect-free availability for a prospective friendly staging territory.
 * The shield is an empire-wide network: physical routes, legacy transit and
 * another active front never delay its projection. Existing fronts only divide
 * the conserved ATK/DEF budget with the prospective campaign.
 */
export function selectCommanderForecastMobilityV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  destinationId: TerritoryId,
): CommanderForecastMobilityV2 {
  const force = state.commanderForces?.[playerId];
  const absent = (status: CommanderForecastMobilityV2['status'], reason: string): CommanderForecastMobilityV2 => ({
    status,
    etaWeeks: null,
    readiness: 0,
    supplyReadiness: 0,
    integrity: 0,
    maxIntegrity: 0,
    attackMultiplier: 1,
    defenseMultiplier: 1,
    pulseAttack: 0,
    interceptEfficiency: 1,
    reason,
  });
  if (!force || force.shield.integrity <= EPSILON) {
    return absent('absent', 'No operational APEX neural dome is available.');
  }
  if (state.territories[destinationId]?.owner !== playerId) {
    return absent('unreachable', 'The prospective staging territory is not under your control.');
  }
  const presentation = selectApexShieldPresentationV2(state, playerId);
  if (!presentation || presentation.operationalState !== 'operational') {
    return absent(
      presentation?.operationalState === 'recharging' ? 'committed' : 'absent',
      presentation?.operationalState === 'recharging'
        ? 'APEX is rebuilding the global shield to full Energy.'
        : 'No operational APEX neural shield is available.',
    );
  }
  const network = selectApexEmpireShieldNetworkV2(state, content, playerId);
  const prospectiveFrontCount = Math.max(1, (network?.activeFrontCount ?? 0) + 1);
  const allocationShare = apexEmpireFrontAllocationShareV2(
    prospectiveFrontCount,
    force.capabilities.forceMultiplier,
  );
  const readiness = clamp(
    force.shield.integrity / Math.max(EPSILON, force.shield.maxIntegrity),
    0,
    1,
  );
  return {
    status: 'ready',
    etaWeeks: 0,
    readiness,
    // Integrity is a damage pool, not a throttle. Any online shield projects
    // its complete per-front army modifier until the pool reaches true zero.
    supplyReadiness: 1,
    integrity: force.shield.integrity,
    maxIntegrity: force.shield.maxIntegrity,
    attackMultiplier: round(
      1 + (presentation.attackMultiplier - 1) * allocationShare,
      9,
    ),
    defenseMultiplier: round(
      1 + (presentation.defenseMultiplier - 1) * allocationShare,
      9,
    ),
    pulseAttack: round(
      presentation.pulseAttack
        * apexPulseProjectionShareV2(force, allocationShare),
      9,
    ),
    interceptEfficiency: clamp(force.shield.interceptEfficiency ?? 1, 1, 1.45),
    reason: prospectiveFrontCount === 1
      ? 'The empire-wide APEX shield can support this front immediately.'
      : `The empire-wide APEX shield can support this front immediately while sharing energy across ${prospectiveFrontCount} fronts.`,
  };
}

function commanderFrontValidityV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  destinationId: TerritoryId,
  mission: CommanderMissionV2,
  front: CommanderFrontAssignmentV2 | null,
): CommandResultV2 {
  const requiresFront = mission === 'assault-support'
    || mission === 'defense'
    || mission === 'logistics-relief';
  if (!requiresFront) {
    if (front) return { accepted: false, reason: 'This Commander mission cannot carry a war-front assignment.' };
    if (mission === 'evacuate' && state.territories[destinationId]?.owner !== playerId) {
      return { accepted: false, reason: 'Evacuation must end in territory controlled by your country.' };
    }
    return { accepted: true };
  }
  if (!front) return { accepted: false, reason: 'Choose the exact war front for this Commander mission.' };
  const war = state.wars.find((candidate) => candidate.id === front.warId);
  const source = state.territories[front.sourceId];
  const target = state.territories[front.targetId];
  if (!war || !source || !target || source.owner === target.owner
    || !connectionExistsV2(state, content, front.sourceId, front.targetId)) {
    return { accepted: false, reason: 'That Commander front is no longer active.' };
  }
  const partiesMatch = (
    war.attackerId === source.owner && war.defenderId === target.owner
  ) || (
    war.defenderId === source.owner && war.attackerId === target.owner
  );
  if (!partiesMatch) return { accepted: false, reason: 'That route does not belong to the selected war.' };
  const operationActive = [...war.attackerOperations, ...war.defenderOperations]
    .some((operation) => operation.sourceId === front.sourceId
      && operation.targetId === front.targetId);
  if (!operationActive) return { accepted: false, reason: 'That Commander front is no longer active.' };
  if (mission === 'assault-support'
    && (source.owner !== playerId || destinationId !== front.sourceId)) {
    return { accepted: false, reason: 'Assault support must stage with your national attacking army.' };
  }
  if (mission === 'defense'
    && (target.owner !== playerId || destinationId !== front.targetId)) {
    return { accepted: false, reason: 'Defense must deploy to your territory on the selected front.' };
  }
  if (mission === 'logistics-relief') {
    const friendlyDestination = source.owner === playerId ? front.sourceId
      : target.owner === playerId ? front.targetId : undefined;
    if (!friendlyDestination || destinationId !== friendlyDestination) {
      return { accepted: false, reason: 'Logistics relief must deploy to your side of the selected front.' };
    }
  }
  return { accepted: true };
}

function quoteAutonomousCommanderOrderV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  destinationId: TerritoryId,
  mission: CommanderMissionV2,
  front: CommanderFrontAssignmentV2 | null,
  allowStandbyTransitOverride = false,
): CommanderOrderTermsV2 {
  const force = state.commanderForces?.[playerId];
  const denied = (reason: string): CommanderOrderTermsV2 => ({
    allowed: false,
    reason,
    destinationId,
    path: [],
    distanceKm: 0,
    travelTicks: 0,
    treasuryCost: 0,
    supplyCost: 0,
  });
  if (!force) return denied('This human seat has no APEX neural dome in the campaign.');
  if (!isHumanPlayerV2(state, playerId)) return denied('Only the controlling human can route this APEX neural dome.');
  if (force.transit && !allowStandbyTransitOverride) {
    return denied('APEX must finish its current movement before receiving another route.');
  }
  if (!content.territories[destinationId]) return denied('Unknown Commander destination.');
  if (state.territories[destinationId]?.owner !== playerId) {
    return denied('APEX can deploy only inside territory controlled by your empire.');
  }
  const frontStatus = commanderFrontValidityV2(
    state, content, playerId, destinationId, mission, front,
  );
  if (!frontStatus.accepted) return denied(frontStatus.reason ?? 'Commander front is unavailable.');
  const route = selectCommanderRouteV2(
    state, content, playerId, force.locationId, destinationId,
  );
  if (!route) {
    return denied('No route entirely inside territory controlled by your empire reaches that destination.');
  }
  const travelTicks = commanderRouteTravelTicksV2(force, route);
  const supplyCost = travelTicks === 0 ? 0 : round(
    COMMANDER_TRAVEL_SUPPLY_PER_MILLION_TICK_V2 * force.shield.integrity * travelTicks,
    9,
  );
  if (force.economy.supplyStock + EPSILON < supplyCost) {
    return denied('The Commander supply stock cannot sustain that movement.');
  }
  return {
    allowed: true,
    destinationId,
    path: route.path,
    distanceKm: route.distanceKm,
    travelTicks,
    treasuryCost: 0,
    supplyCost,
  };
}

/**
 * Compatibility quote for retired player-issued movement. Keeping a stable
 * denial lets old clients and queued multiplayer commands fail safely without
 * changing the authoritative timeline.
 */
export function quoteCommanderOrderV2(
  _state: WorldStateV2,
  _content: WorldContentV2,
  _playerId: PlayerId,
  destinationId: TerritoryId,
  _mission: CommanderMissionV2,
  _front: CommanderFrontAssignmentV2 | null,
): CommanderOrderTermsV2 {
  return {
    allowed: false,
    reason: APEX_AUTONOMY_COMMAND_REASON_V2,
    destinationId,
    path: [],
    distanceKm: 0,
    travelTicks: 0,
    treasuryCost: 0,
    supplyCost: 0,
  };
}

export function issueCommanderOrderV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  destinationId: TerritoryId,
  mission: CommanderMissionV2,
  front: CommanderFrontAssignmentV2 | null,
): CommandResultV2 {
  void state;
  void content;
  void playerId;
  void destinationId;
  void mission;
  void front;
  return { accepted: false, reason: APEX_AUTONOMY_COMMAND_REASON_V2 };
}

function applyCommanderOrderV2(
  state: WorldStateV2,
  playerId: PlayerId,
  mission: CommanderMissionV2,
  front: CommanderFrontAssignmentV2 | null,
  quote: CommanderOrderTermsV2,
  orderSource: CommanderForceStateV2['orderSource'],
): void {
  const force = state.commanderForces[playerId]!;
  const currentDestinationId = force.transit?.path.at(-1) ?? force.locationId;
  const sameFront = (!force.front && !front)
    || Boolean(force.front && front
      && frontSignatureV2(force.front) === frontSignatureV2(front));
  // Reissuing the exact same autonomous intent is a true no-op. In particular,
  // it may not spend supply, restart travel, extend commitment or recreate the
  // dome/map state every simulation tick.
  if (force.mission === mission
    && sameFront
    && currentDestinationId === quote.destinationId
    && (Boolean(force.transit) || force.locationId === quote.destinationId)) {
    return;
  }
  clearApexSecondaryProjectionV2(force);
  force.economy.treasury = 0;
  force.economy.supplyStock = round(force.economy.supplyStock - quote.supplyCost, 9);
  force.mission = mission;
  force.orderSource = orderSource;
  force.manualHoldUntilTick = orderSource === 'autonomous'
    ? state.tick + quote.travelTicks + COMMANDER_AUTONOMY_HYSTERESIS_TICKS_V2
    : 0;
  force.front = front ? { ...front } : null;
  force.transit = quote.travelTicks > 0 ? {
    path: [...quote.path],
    distanceKm: quote.distanceKm,
    departTick: state.tick,
    arriveTick: state.tick + quote.travelTicks,
  } : null;
  if (quote.travelTicks === 0) {
    force.locationId = quote.destinationId;
    if (mission === 'evacuate') force.mission = 'standby';
  }
}

export function setCommanderPrioritiesV2(
  state: WorldStateV2,
  playerId: PlayerId,
  priorities: CommanderEconomyPrioritiesV2,
): CommandResultV2 {
  void state;
  void playerId;
  void priorities;
  return { accepted: false, reason: APEX_AUTONOMY_COMMAND_REASON_V2 };
}

function initializationValidV2(input: CommanderForceInitializationV2): boolean {
  const values = [
    input.shield.integrity,
    input.shield.maxIntegrity,
    input.shield.rechargeBuffer ?? 0,
    input.shield.rechargeMultiplier ?? 1,
    input.shield.pulseAttack,
    input.shield.pulseProjectionRetention ?? 0,
    input.shield.pulseChargeBonusPerStep ?? 0,
    input.shield.interceptEfficiency ?? 1,
    input.shield.impactRecoveryShare ?? 0,
    input.shield.defensivePulseMultiplier ?? 1,
    input.attackMultiplier,
    input.defenseMultiplier,
    input.armyCasualtyMultiplier ?? 1,
    input.armyPeaceRecoveryMultiplier ?? 1,
    input.treasury,
    input.annualOutput,
    input.supplyStock ?? 0,
    input.countryTraitScale ?? 0,
  ];
  const capabilities = input.capabilities ?? {};
  const support = input.empireSupport ?? {};
  const supportValues = [
    support.recruitmentMultiplier,
    support.reserveTrainingMultiplier,
    support.annualFoodOutput,
    support.foodProductionMultiplier,
    support.foodStorageMultiplier,
    support.foodImportCostMultiplier,
  ];
  return values.every(Number.isFinite)
    && input.shield.integrity >= 0
    && input.shield.maxIntegrity > 0
    && input.shield.integrity <= input.shield.maxIntegrity + EPSILON
    && (input.shield.rechargeBuffer ?? 0) >= 0
    && (input.shield.rechargeBuffer ?? 0) <= input.shield.maxIntegrity + EPSILON
    && input.attackMultiplier >= 1
    && input.attackMultiplier <= 2.5
    && input.defenseMultiplier >= 1
    && input.defenseMultiplier <= 2.5
    && (input.shield.rechargeMultiplier ?? 1) >= 1
    && (input.shield.rechargeMultiplier ?? 1) <= 3.5
    && input.shield.pulseAttack >= 0
    && input.shield.pulseAttack <= 1
    && (input.shield.pulseProjectionRetention ?? 0) >= 0
    && (input.shield.pulseProjectionRetention ?? 0) <= 0.35
    && (input.shield.pulseChargeBonusPerStep ?? 0) >= 0
    && (input.shield.pulseChargeBonusPerStep ?? 0) <= 0.45
    && (input.shield.interceptEfficiency ?? 1) >= 1
    && (input.shield.interceptEfficiency ?? 1) <= 1.45
    && (input.shield.impactRecoveryShare ?? 0) >= 0
    && (input.shield.impactRecoveryShare ?? 0) <= 0.35
    && (input.shield.defensivePulseMultiplier ?? 1) >= 1
    && (input.shield.defensivePulseMultiplier ?? 1) <= 1.75
    && (input.armyCasualtyMultiplier ?? 1) >= 0.82
    && (input.armyCasualtyMultiplier ?? 1) <= 1
    && (input.armyPeaceRecoveryMultiplier ?? 1) >= 1
    && (input.armyPeaceRecoveryMultiplier ?? 1) <= 1.75
    && input.treasury >= 0 && input.annualOutput >= 0
    && (input.supplyStock ?? 0) >= 0
    && (input.countryTraitScale ?? 0) >= 0
    && (input.countryTraitScale ?? 0) <= 1
    && supportValues.every((value) => value === undefined || Number.isFinite(value))
    && (support.recruitmentMultiplier ?? 1) >= 1
    && (support.recruitmentMultiplier ?? 1) <= 1.50
    && (support.reserveTrainingMultiplier ?? 1) >= 1
    && (support.reserveTrainingMultiplier ?? 1) <= 1.75
    && (support.annualFoodOutput ?? 0) >= 0
    && (support.annualFoodOutput ?? 0) <= APEX_EMPIRE_ANNUAL_FOOD_OUTPUT_CAP_V2
    && (support.foodProductionMultiplier ?? 1) >= 1
    && (support.foodProductionMultiplier ?? 1) <= 1.50
    && (support.foodStorageMultiplier ?? 1) >= 1
    && (support.foodStorageMultiplier ?? 1) <= 1.75
    && (support.foodImportCostMultiplier ?? 1) >= 0.75
    && (support.foodImportCostMultiplier ?? 1) <= 1
    && [
      capabilities.mobileHeadquarters,
      capabilities.fieldHospital,
      capabilities.rapidResponse,
      capabilities.assaultSpecialist,
      capabilities.defenseSpecialist,
      capabilities.forceMultiplier,
    ].every((value) => value === undefined || typeof value === 'boolean')
    // Retired rapid-response snapshots are normalized only at authenticated
    // migration boundaries. New campaign launches must select one of the four
    // shield-native capstones and can never emit this legacy capability.
    && capabilities.rapidResponse !== true
    && apexCapstoneCapabilityCountV2(capabilities) <= 1
    && Number.isSafeInteger(capabilities.emergencyExtractionCharges ?? 0)
    && (capabilities.emergencyExtractionCharges ?? 0) >= 0
    && (capabilities.emergencyExtractionCharges ?? 0) <= 2;
}

/** Removes only the retired rank overlay from the host's immutable opening homeland. */
function neutralizeLegacyHumanOpeningOverlayV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): void {
  const nation = state.players[playerId]!;
  const multiplier = humanStartingArmyMultiplierForContentV2(content, playerId);
  if (Math.abs(multiplier) > EPSILON && Math.abs(multiplier - 1) > EPSILON) {
    for (const territoryId of content.territoryIds) {
      const territory = state.territories[territoryId];
      if (territory?.owner !== playerId
        || content.territories[territoryId]?.initialOwnerId !== playerId) continue;
      territory.army.manpower = round(territory.army.manpower / multiplier, 9);
    }
  }
  nation.openingArmyBonus = null;
  nation.trainedReserves = initialTrainedReserveManpowerV2(
    String(playerId),
    initialNationArmyCapacityBenchmarkV2(content, playerId),
    content,
  );
  nation.treasury = openingStartingTreasuryV2(playerId, content, false);
}

/**
 * Installs the immutable account snapshot once. Call before national loadout
 * additions where possible; the fallback homeland-only reversal stays safe
 * when a Survival roster has already fused under the flagship.
 */
export function initializeCommanderForceV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  input: CommanderForceInitializationV2,
): CommandResultV2 {
  state.commanderForces ??= {};
  if (state.tick !== 0) return { accepted: false, reason: 'APEX neural-dome setup is locked after week zero.' };
  if (!isHumanPlayerV2(state, playerId) || !state.players[playerId]) {
    return { accepted: false, reason: 'APEX neural-dome setup requires a living human-controlled country.' };
  }
  if (state.commanderForces[playerId]) {
    return { accepted: false, reason: 'This human seat already has an APEX neural dome.' };
  }
  if (!initializationValidV2(input)) {
    return { accepted: false, reason: 'APEX neural-dome profile snapshot is invalid.' };
  }
  const integrity = round(input.shield.integrity, 9);
  const maxIntegrity = round(input.shield.maxIntegrity, 9);
  const recoveryBuffer = round(input.shield.rechargeBuffer ?? 0, 9);
  const force: CommanderForceStateV2 = {
    shield: {
      integrity,
      maxIntegrity,
      rechargeBuffer: recoveryBuffer,
      attackMultiplier: round(input.attackMultiplier, 9),
      defenseMultiplier: round(input.defenseMultiplier, 9),
      rechargeMultiplier: round(input.shield.rechargeMultiplier ?? 1, 9),
      pulseAttack: round(input.shield.pulseAttack, 9),
      pulseProjectionRetention: round(
        input.shield.pulseProjectionRetention ?? 0,
        9,
      ),
      pulseChargeBonusPerStep: round(
        input.shield.pulseChargeBonusPerStep ?? 0,
        9,
      ),
      interceptEfficiency: round(input.shield.interceptEfficiency ?? 1, 9),
      impactRecoveryShare: round(input.shield.impactRecoveryShare ?? 0, 9),
      defensivePulseMultiplier: round(
        input.shield.defensivePulseMultiplier ?? 1,
        9,
      ),
    },
    economy: {
      treasury: 0,
      annualOutput: round(input.annualOutput, 9),
      supplyStock: round(input.supplyStock ?? Math.max(0.001, integrity * 26), 9),
      priorities: { ...DEFAULT_COMMANDER_PRIORITIES_V2 },
    },
    capabilities: {
      mobileHeadquarters: input.capabilities?.mobileHeadquarters ?? false,
      fieldHospital: input.capabilities?.fieldHospital ?? false,
      rapidResponse: input.capabilities?.rapidResponse ?? false,
      forceMultiplier: input.capabilities?.forceMultiplier ?? false,
      assaultSpecialist: input.capabilities?.assaultSpecialist ?? false,
      defenseSpecialist: input.capabilities?.defenseSpecialist ?? false,
      emergencyExtractionCharges: input.capabilities?.emergencyExtractionCharges ?? 0,
    },
    empireSupport: normalizeApexEmpireSupportV2({
      ...input.empireSupport,
      armyCasualtyMultiplier: input.armyCasualtyMultiplier
        ?? input.empireSupport?.armyCasualtyMultiplier,
      armyPeaceRecoveryMultiplier: input.armyPeaceRecoveryMultiplier
        ?? input.empireSupport?.armyPeaceRecoveryMultiplier,
    }),
    countryTraitScale: round(input.countryTraitScale ?? 0, 9),
    locationId: state.players[playerId]!.capitalId,
    mission: 'standby',
    orderSource: 'autonomous',
    manualHoldUntilTick: 0,
    front: null,
    transit: null,
    doctrineRuntime: normalizeApexDoctrineRuntimeV2(),
  };
  if (commanderCandidateClaimedByOtherV2(
    state,
    playerId,
    force.locationId,
  )) {
    return { accepted: false, reason: 'Another co-op APEX already protects this territory.' };
  }
  // The marker must exist before capacity and trait contexts are refreshed.
  state.commanderForces[playerId] = force;
  neutralizeLegacyHumanOpeningOverlayV2(state, content, playerId);
  // Compatibility field `treasury` is now an exact opening Empire grant.
  state.players[playerId]!.treasury = round(
    state.players[playerId]!.treasury + Math.max(0, input.treasury),
    9,
  );
  synchronizeArmyCapacityV2(state, content);
  return { accepted: true };
}

/**
 * APEX continuously reallocates its internal energy budget to the largest
 * operational shortfall. Persisted player priority sliders are compatibility
 * data only and never represent recruitment or influence new decisions.
 */
export function selectCommanderAutomaticPrioritiesV2(
  force: CommanderForceStateV2,
  supplyMultiplier = 1,
): CommanderEconomyPrioritiesV2 {
  const capacity = Math.max(EPSILON, force.shield.maxIntegrity);
  const activeGap = clamp((capacity - force.shield.integrity) / capacity, 0, 1);
  const reserveGap = clamp(
    (capacity - force.shield.rechargeBuffer) / capacity,
    0,
    1,
  );
  const supplyCapacity = Math.max(
    0.001,
    capacity * COMMANDER_SUPPLY_CAPACITY_WEEKS_V2 * supplyMultiplier,
  );
  const supplyGap = 1 - clamp(force.economy.supplyStock / supplyCapacity, 0, 1);
  const onOperation = Boolean(force.transit || force.front);
  const trainingWeight = 0.30 + reserveGap * 2
    + (force.mission === 'hq-training' ? 0.45 : 0);
  const logisticsWeight = 0.30 + supplyGap * 2
    + (onOperation ? 0.40 : 0);
  const developmentWeight = 0.20 + activeGap * 0.50;
  const total = trainingWeight + logisticsWeight + developmentWeight;
  const training = clamp(Math.round(trainingWeight / total * 100), 0, 100);
  const logistics = clamp(
    Math.round(logisticsWeight / total * 100),
    0,
    100 - training,
  );
  return {
    training,
    logistics,
    development: 100 - training - logistics,
  };
}

function commanderEconomyProjectionV2(
  force: CommanderForceStateV2,
  empireTreasury: number,
  supplyMultiplier = 1,
  allowIntegrityRecovery = true,
): CommanderEconomyProjectionV2 {
  const weeklyIncome = round(Math.max(0, force.economy.annualOutput) / 52, 9);
  const recoveryBufferGap = Math.max(
    0,
    force.shield.maxIntegrity - force.shield.rechargeBuffer,
  );
  const priorities = selectCommanderAutomaticPrioritiesV2(force, supplyMultiplier);
  const trainingAllocation = clamp(
    (priorities.training + priorities.development * 0.35) / 100,
    0,
    1,
  );
  const frontlineRecoveryMultiplier = force.front && (
    force.mission === 'assault-support'
      || force.mission === 'defense'
      || force.mission === 'logistics-relief'
  ) ? COMMANDER_FRONTLINE_RECOVERY_MULTIPLIER_V2 : 1;
  const recoveryBufferGain = allowIntegrityRecovery ? Math.min(
    recoveryBufferGap,
    force.shield.maxIntegrity * COMMANDER_PEACE_TRAINING_CAPACITY_SHARE_V2
      * trainingAllocation * frontlineRecoveryMultiplier,
  ) : 0;
  const supplyCap = Math.max(
    0.001,
    force.shield.maxIntegrity * COMMANDER_SUPPLY_CAPACITY_WEEKS_V2 * supplyMultiplier,
  );
  const logisticsAllocation = clamp(
    (priorities.logistics + priorities.development * 0.35) / 100,
    0,
    1,
  );
  const supplyGain = Math.min(
    Math.max(0, supplyCap - force.economy.supplyStock),
    force.shield.maxIntegrity * COMMANDER_FREE_SUPPLY_CAPACITY_WEEKS_PER_TICK_V2
      * logisticsAllocation * supplyMultiplier * frontlineRecoveryMultiplier,
  );
  return {
    weeklyIncome,
    weeklyActiveUpkeep: 0,
    weeklyReserveUpkeep: 0,
    weeklyUpkeepDue: 0,
    weeklyUpkeepPaid: 0,
    weeklyTrainingInvestment: 0,
    weeklyLogisticsInvestment: 0,
    weeklyDevelopmentInvestment: 0,
    weeklyInvestment: 0,
    treasuryReserveTarget: 0,
    weeklyEmpireTransfer: weeklyIncome,
    corpsTreasuryAfter: 0,
    empireTreasuryAfter: round(empireTreasury + weeklyIncome, 9),
    // Compatibility output name: this is buffered shield energy.
    trainedReserveGain: round(recoveryBufferGain, 9),
    supplyGain: round(supplyGain, 9),
    annualOutputGain: 0,
  };
}

/**
 * A true-zero extraction is the sole wartime integrity-recovery exception.
 * The sentinel survives save/load and keeps the dome unavailable until full.
 */
function commanderExhaustedRecoveryActiveV2(
  force: CommanderForceStateV2,
): boolean {
  return force.mission === 'hq-training'
    && !force.transit
    && force.manualHoldUntilTick === COMMANDER_EXHAUSTED_RECOVERY_HOLD_TICK_V2;
}

/** Compatibility view: APEX has no private cash or protected reserve. */
export function commanderTreasuryReserveStatusV2(
  force: CommanderForceStateV2,
): CommanderTreasuryReserveStatusV2 {
  return {
    treasury: 0,
    reserveTarget: 0,
    reserveShortfall: 0,
    reserveSurplus: 0,
  };
}

export function selectCommanderTreasuryReserveStatusV2(
  state: WorldStateV2,
  playerId: PlayerId,
): CommanderTreasuryReserveStatusV2 | null {
  const force = state.commanderForces?.[playerId];
  return force ? commanderTreasuryReserveStatusV2(force) : null;
}

/**
 * Authenticated legacy saves used a private APEX treasury. Normalize output
 * onto the shared-economy scale and merge at most $15M into the Empire once.
 */
export function migrateLegacyCommanderEconomiesV2(
  state: WorldStateV2,
  sourceBaseAnnualOutput: number,
): void {
  const safeSourceBase = Math.max(EPSILON, sourceBaseAnnualOutput);
  for (const [rawPlayerId, force] of Object.entries(state.commanderForces ?? {})) {
    if (!force) continue;
    const playerId = rawPlayerId as PlayerId;
    const privateTreasury = Math.max(0, force.economy.treasury);
    force.economy.annualOutput = round(Math.min(
      COMMANDER_LEGACY_ANNUAL_OUTPUT_CAP_V2,
      Math.max(0, force.economy.annualOutput)
        * 0.015 / safeSourceBase,
    ), 9);
    force.economy.treasury = 0;
    const nation = state.players[playerId];
    if (nation) nation.treasury = round(
      nation.treasury + Math.min(COMMANDER_LEGACY_TREASURY_GRANT_CAP_V2, privateTreasury),
      9,
    );
  }
}

/** Exact weekly APEX income used by national finance and UI projections. */
export function selectCommanderWeeklyEmpireContributionV2(
  state: WorldStateV2,
  playerId: PlayerId,
): number {
  return round(Math.max(0, state.commanderForces?.[playerId]?.economy.annualOutput ?? 0) / 52, 9);
}

/** UI-safe, non-mutating projection of the next Commander economy phase. */
export function selectCommanderEconomyProjectionV2(
  state: WorldStateV2,
  playerId: PlayerId,
): CommanderEconomyProjectionV2 | null {
  const force = state.commanderForces?.[playerId];
  const nation = state.players[playerId];
  return force && nation
    ? commanderEconomyProjectionV2(
        force,
        nation.treasury,
        selectRunModifiersV2(state, playerId).commanderSupplyMultiplier,
        !state.wars.some((war) => (
          war.attackerId === playerId || war.defenderId === playerId
        )) || commanderExhaustedRecoveryActiveV2(force),
      )
    : null;
}

function processCommanderEconomyV2(
  state: WorldStateV2,
  playerId: PlayerId,
  force: CommanderForceStateV2,
): void {
  const nation = state.players[playerId];
  if (!nation) return;
  const projection = commanderEconomyProjectionV2(
    force,
    nation.treasury,
    selectRunModifiersV2(state, playerId).commanderSupplyMultiplier,
    !state.wars.some((war) => (
      war.attackerId === playerId || war.defenderId === playerId
    )) || commanderExhaustedRecoveryActiveV2(force),
  );
  force.economy.priorities = selectCommanderAutomaticPrioritiesV2(
    force,
    selectRunModifiersV2(state, playerId).commanderSupplyMultiplier,
  );
  // National finance has already booked `weeklyIncome` exactly once.
  force.economy.treasury = 0;
  force.shield.rechargeBuffer = round(
    force.shield.rechargeBuffer + projection.trainedReserveGain,
    9,
  );
  force.economy.supplyStock = round(
    force.economy.supplyStock + projection.supplyGain,
    9,
  );

  const ownerAtWar = state.wars.some((war) => (
    war.attackerId === playerId || war.defenderId === playerId
  ));
  const exhaustedRecovery = commanderExhaustedRecoveryActiveV2(force);
  const atHqRecovery = force.mission === 'hq-training' && !force.transit;
  const onWarFront = Boolean(force.front) && (
    force.mission === 'assault-support'
      || force.mission === 'defense'
      || force.mission === 'logistics-relief'
  );
  const onPeaceDuty = !onWarFront && force.mission !== 'evacuate';
  // Apart from the canonical true-zero recovery lifecycle, APEX never creates
  // buffered energy or restores active integrity while its owner is at war.
  // Location, front assignment, purge duty and transit cannot bypass the lock.
  if ((!ownerAtWar || exhaustedRecovery) && (atHqRecovery || onPeaceDuty)) {
    const weeklyTransferCap = atHqRecovery
      ? Math.max(
          0.000001,
          force.shield.maxIntegrity * COMMANDER_HQ_TRANSFER_CAPACITY_SHARE_V2
            * force.shield.rechargeMultiplier
            * (force.capabilities.mobileHeadquarters
              ? COMMANDER_MOBILE_HQ_TRANSFER_MULTIPLIER_V2 : 1),
        )
      : force.shield.maxIntegrity * COMMANDER_PEACE_FIELD_TRANSFER_CAPACITY_SHARE_V2
        * force.shield.rechargeMultiplier;
    const integrityRestored = Math.min(
      force.shield.rechargeBuffer,
      Math.max(0, force.shield.maxIntegrity - force.shield.integrity),
      weeklyTransferCap,
    );
    force.shield.rechargeBuffer = round(
      force.shield.rechargeBuffer - integrityRestored,
      9,
    );
    force.shield.integrity = round(force.shield.integrity + integrityRestored, 9);
  }
}

function frontStillValidV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  force: CommanderForceStateV2,
): boolean {
  if (!force.front) return false;
  const assignedDestinationId = force.transit?.path.at(-1) ?? force.locationId;
  return commanderFrontValidityV2(
    state,
    content,
    playerId,
    assignedDestinationId,
    force.mission,
    force.front,
  ).accepted;
}

interface CommanderAutonomyCandidateV2 {
  destinationId: TerritoryId;
  hostileTerritoryId: TerritoryId;
  mission: Extract<CommanderMissionV2, 'assault-support' | 'defense'>;
  front: CommanderFrontAssignmentV2;
  score: number;
  criticalDefense: boolean;
  freshHumanAssault: boolean;
  marginalWinImpact: number;
  travelTicks: number;
  supplyReadiness: number;
  access: FrontOperationV2['access'];
  signature: string;
}

export interface CommanderAutonomyStatusV2 {
  state: 'absent' | 'monitoring' | 'rebuilding' | 'moving' | 'supporting';
  headline: string;
  reason: string;
  etaWeeks: number | null;
  locationId: TerritoryId | null;
  destinationId: TerritoryId | null;
  front: CommanderFrontAssignmentV2 | null;
}

export interface CommanderFrontPriorityV2 {
  front: CommanderFrontAssignmentV2;
  destinationId: TerritoryId;
  hostileTerritoryId: TerritoryId;
  mission: Extract<CommanderMissionV2, 'assault-support' | 'defense'>;
  access: FrontOperationV2['access'];
  score: number;
  criticalDefense: boolean;
  freshHumanAssault: boolean;
  marginalWinImpact: number;
  travelTicks: number;
  assigned: boolean;
}

interface CommanderActiveFrontV2 {
  war: WarStateV2;
  operation: FrontOperationV2;
  source: WorldStateV2['territories'][TerritoryId];
  target: WorldStateV2['territories'][TerritoryId];
  signature: string;
}

function activeCommanderFrontsV2(state: WorldStateV2): CommanderActiveFrontV2[] {
  const fronts = new Map<string, CommanderActiveFrontV2>();
  for (const war of [...state.wars].sort((left, right) => left.id.localeCompare(right.id))) {
    const operations = [...war.attackerOperations, ...war.defenderOperations]
      .sort((left, right) => (
        `${left.sourceId}:${left.targetId}:${left.commanderId}`
          .localeCompare(`${right.sourceId}:${right.targetId}:${right.commanderId}`)
      ));
    for (const operation of operations) {
      const source = state.territories[operation.sourceId];
      const target = state.territories[operation.targetId];
      if (!source || !target || source.owner === target.owner) continue;
      const signature = `${war.id}:${operation.sourceId}:${operation.targetId}`;
      if (!fronts.has(signature)) {
        fronts.set(signature, { war, operation, source, target, signature });
      }
    }
  }
  return [...fronts.values()].sort((left, right) => left.signature.localeCompare(right.signature));
}

function commanderClaimedTerritoryIdsV2(force: CommanderForceStateV2): TerritoryId[] {
  const destinationId = force.transit?.path.at(-1);
  const secondaryLocationId = normalizeApexDoctrineRuntimeV2(
    force.doctrineRuntime,
  ).secondaryProjection?.locationId;
  return [...new Set([
    force.locationId,
    ...(destinationId ? [destinationId] : []),
    ...(secondaryLocationId ? [secondaryLocationId] : []),
  ])];
}

/** One deterministic dome owner per territory, including reserved arrivals. */
export function selectApexTerritoryClaimOwnerV2(
  state: WorldStateV2,
  territoryId: TerritoryId,
): PlayerId | undefined {
  return (Object.entries(state.commanderForces ?? {}) as Array<[
    PlayerId,
    CommanderForceStateV2,
  ]>)
    .filter(([playerId, force]) => isHumanPlayerV2(state, playerId)
      && state.territories[territoryId]?.owner === playerId
      && commanderClaimedTerritoryIdsV2(force).includes(territoryId))
    .sort(([left], [right]) => left.localeCompare(right))[0]?.[0];
}

function commanderFrontClaimOwnerV2(
  state: WorldStateV2,
  front: CommanderFrontAssignmentV2,
): PlayerId | undefined {
  const signature = frontSignatureV2(front);
  return (Object.entries(state.commanderForces ?? {}) as Array<[
    PlayerId,
    CommanderForceStateV2,
  ]>)
    .filter(([playerId, force]) => {
      if (!isHumanPlayerV2(state, playerId)) return false;
      const secondary = normalizeApexDoctrineRuntimeV2(force.doctrineRuntime)
        .secondaryProjection;
      return Boolean(
        force.front && frontSignatureV2(force.front) === signature
          || secondary && frontSignatureV2(secondary.front) === signature,
      );
    })
    .sort(([left], [right]) => left.localeCompare(right))[0]?.[0];
}

function commanderCandidateClaimedByOtherV2(
  state: WorldStateV2,
  playerId: PlayerId,
  destinationId: TerritoryId,
  front?: CommanderFrontAssignmentV2 | null,
): boolean {
  const territoryClaim = selectApexTerritoryClaimOwnerV2(state, destinationId);
  const frontClaim = front ? commanderFrontClaimOwnerV2(state, front) : undefined;
  return Boolean(
    territoryClaim && territoryClaim !== playerId
      || frontClaim && frontClaim !== playerId,
  );
}

function hostilePressureAtV2(
  state: WorldStateV2,
  playerId: PlayerId,
  territoryId: TerritoryId,
): { pressure: number; ratio: number } {
  const territory = state.territories[territoryId];
  if (!territory || territory.owner !== playerId) return { pressure: 0, ratio: 0 };
  let pressure = 0;
  for (const front of activeCommanderFrontsV2(state)) {
    if (front.source.owner === playerId && front.operation.sourceId === territoryId) {
      pressure = Math.max(pressure, armyPressureV2(front.target, true));
    } else if (front.target.owner === playerId && front.operation.targetId === territoryId) {
      pressure = Math.max(pressure, armyPressureV2(front.source, true));
    }
  }
  return {
    pressure,
    ratio: pressure / Math.max(EPSILON, armyPressureV2(territory, false)),
  };
}

function commanderOperationalReadinessV2(force: CommanderForceStateV2): {
  integrity: number;
  supply: number;
} {
  return {
    integrity: clamp(
      force.shield.integrity / Math.max(EPSILON, force.shield.maxIntegrity),
      0,
      1,
    ),
    supply: clamp(
      force.economy.supplyStock
        / Math.max(EPSILON, force.shield.maxIntegrity * COMMANDER_OPERATIONAL_SUPPLY_WEEKS_V2),
      0,
      1,
    ),
  };
}

function territoryAdjacentHostileFrontsV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  territoryId: TerritoryId,
): number {
  const enemies = new Set(state.wars.flatMap((war) => (
    war.attackerId === playerId ? [war.defenderId]
      : war.defenderId === playerId ? [war.attackerId] : []
  )));
  return content.territories[territoryId]?.connections.filter((connection) => {
    if (!isWorldConnectionOpenV2(state, territoryId, connection.targetId)) return false;
    const owner = state.territories[connection.targetId]?.owner;
    return Boolean(owner && owner !== playerId && enemies.has(owner));
  }).length ?? 0;
}

/** Compatibility selector: APEX no longer voluntarily retreats at any readiness. */
export function retreatApexForRecoveryV2(
  _state: WorldStateV2,
  _content: WorldContentV2,
  _playerId: PlayerId,
): boolean {
  return false;
}

/**
 * Critical safety override for APEX. It never grants survival or teleports:
 * the destination and every route node must already be friendly, and no legal
 * route means the force stays exposed to the normal defeat flow.
 */
export function retreatApexFromCollapsedFrontV2(
  _state: WorldStateV2,
  _content: WorldContentV2,
  _playerId: PlayerId,
): boolean {
  return false;
}

function armyPressureV2(
  territory: WorldStateV2['territories'][TerritoryId],
  attack: boolean,
): number {
  const quality = attack ? territory.army.baseAttack : territory.army.baseDefense;
  return Math.max(EPSILON, territory.army.manpower * quality);
}

function frontSupplyProxyV2(
  _state: WorldStateV2,
  _playerId: PlayerId,
  territory: WorldStateV2['territories'][TerritoryId],
  operation: FrontOperationV2,
): number {
  const accessFactor = operation.access === 'naval' ? 0.72 : 1;
  return clamp(accessFactor, 0, 1);
}

function candidateFrontV2(front: CommanderActiveFrontV2): CommanderFrontAssignmentV2 {
  return {
    warId: front.war.id,
    sourceId: front.operation.sourceId,
    targetId: front.operation.targetId,
  };
}

function commanderForcePowerV2(
  state: WorldStateV2,
  playerId: PlayerId,
  force: CommanderForceStateV2,
  mission: Extract<CommanderMissionV2, 'assault-support' | 'defense'>,
): { power: number; supplyReadiness: number } {
  const rating = mission === 'assault-support'
    ? apexArmyAttackMultiplierV2(state, playerId, force)
    : apexArmyDefenseMultiplierV2(state, playerId, force);
  const integrityReadiness = clamp(
    force.shield.integrity / Math.max(EPSILON, force.shield.maxIntegrity),
    0,
    1,
  );
  const supplyReadiness = clamp(
    force.economy.supplyStock / Math.max(EPSILON, force.shield.maxIntegrity * 13),
    0,
    1,
  );
  return {
    power: Math.max(0, rating - 1) * 100
      * (0.55 + 0.45 * integrityReadiness)
      * (0.35 + 0.65 * supplyReadiness),
    supplyReadiness,
  };
}

function buildAutonomousCommanderCandidatesV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  force: CommanderForceStateV2,
  allowStandbyTransitOverride = false,
): CommanderAutonomyCandidateV2[] {
  if (force.shield.integrity <= EPSILON || force.economy.supplyStock <= EPSILON) return [];
  const survival = content.metadata?.scenarioId === 'survival';
  const candidates: CommanderAutonomyCandidateV2[] = [];
  for (const front of activeCommanderFrontsV2(state)) {
    const humanAssaults = front.source.owner === playerId && front.target.owner !== playerId;
    const humanDefends = front.target.owner === playerId && front.source.owner !== playerId;
    if (!humanAssaults && !humanDefends) continue;
    const mission = humanAssaults ? 'assault-support' : 'defense';
    const destinationId = humanAssaults
      ? front.operation.sourceId : front.operation.targetId;
    const hostileTerritoryId = humanAssaults
      ? front.operation.targetId : front.operation.sourceId;
    const assignment = candidateFrontV2(front);
    if (commanderCandidateClaimedByOtherV2(
      state,
      playerId,
      destinationId,
      assignment,
    )) continue;
    const quote = quoteAutonomousCommanderOrderV2(
      state,
      content,
      playerId,
      destinationId,
      mission,
      assignment,
      allowStandbyTransitOverride,
    );
    if (!quote.allowed) continue;

    const friendly = state.territories[destinationId]!;
    const hostile = state.territories[hostileTerritoryId]!;
    const ownPower = armyPressureV2(friendly, humanAssaults);
    const enemyPower = armyPressureV2(hostile, !humanAssaults);
    const apex = commanderForcePowerV2(state, playerId, force, mission);
    const before = ownPower / Math.max(EPSILON, ownPower + enemyPower);
    const after = (ownPower + apex.power)
      / Math.max(EPSILON, ownPower + apex.power + enemyPower);
    const marginalWinImpact = Math.max(0, (after - before) * 100);
    const pressureRatio = enemyPower / Math.max(EPSILON, ownPower);
    const frontSupply = frontSupplyProxyV2(state, playerId, friendly, front.operation);
    const criticalDefense = humanDefends && (
      pressureRatio >= 1.50
      || frontSupply <= 0.22 && pressureRatio >= 0.90
    );
    const freshHumanAssault = humanAssaults
      && state.tick - Math.max(front.war.startedTick, front.operation.startedTick) <= 2;
    const humanMomentum = humanAssaults
      ? clamp(front.operation.momentum, -1, 1)
      : -clamp(front.operation.momentum, -1, 1);
    const defenseUrgency = humanDefends
      ? 44 + Math.min(4, pressureRatio) * 16
      : 20;
    const landContinuity = front.operation.access === 'land'
      ? (survival ? 24 : 12) : -(survival ? 28 : 12);
    const distancePenalty = quote.travelTicks * (survival ? 5 : 3.5);
    const score = (criticalDefense ? 1_000 : 0)
      + (freshHumanAssault ? 500 : 0)
      + defenseUrgency
      + marginalWinImpact * 4
      + frontSupply * 10
      + apex.supplyReadiness * 6
      + landContinuity
      + humanMomentum * 5
      - distancePenalty;
    candidates.push({
      destinationId,
      hostileTerritoryId,
      mission,
      front: assignment,
      score,
      criticalDefense,
      freshHumanAssault,
      marginalWinImpact,
      travelTicks: quote.travelTicks,
      supplyReadiness: apex.supplyReadiness,
      access: front.operation.access,
      signature: front.signature,
    });
  }
  return candidates.sort((left, right) => (
    // A new player-declared offensive is an implicit APEX deployment order.
    // Recovery and illegal routes are filtered before this point; otherwise
    // the fresh operation is always the force's next assignment.
    Number(right.freshHumanAssault) - Number(left.freshHumanAssault)
      || Number(right.criticalDefense) - Number(left.criticalDefense)
      || right.score - left.score
      || right.marginalWinImpact - left.marginalWinImpact
      || left.travelTicks - right.travelTicks
      || left.signature.localeCompare(right.signature)
  ));
}

/**
 * Compatibility recovery for a damaged but non-exhausted dome. True-zero
 * extraction uses the stricter full-integrity branch in the main process.
 */
function selectRecoveryFrontReentryCandidateV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  force: CommanderForceStateV2,
): CommanderAutonomyCandidateV2 | undefined {
  const readiness = commanderOperationalReadinessV2(force);
  const best = buildAutonomousCommanderCandidatesV2(
    state, content, playerId, force,
  )[0];
  if (!best) return undefined;
  const normalRecoveryComplete = state.tick >= force.manualHoldUntilTick
    && readiness.integrity + EPSILON >= COMMANDER_RECOVERY_MANPOWER_READINESS_V2
    && readiness.supply + EPSILON >= COMMANDER_RECOVERY_SUPPLY_READINESS_V2;
  return normalRecoveryComplete ? best : undefined;
}

function sameCommanderCandidateV2(
  force: CommanderForceStateV2,
  candidate: CommanderAutonomyCandidateV2,
): boolean {
  return force.mission === candidate.mission
    && Boolean(force.front)
    && frontSignatureV2(force.front!) === frontSignatureV2(candidate.front);
}

function commanderReviewOffsetV2(playerId: PlayerId): number {
  let hash = 0;
  for (const character of playerId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % COMMANDER_AUTONOMY_REVIEW_TICKS_V2;
}

function selectAutonomousCommanderCandidateV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  force: CommanderForceStateV2,
): CommanderAutonomyCandidateV2 | undefined {
  const candidates = buildAutonomousCommanderCandidatesV2(
    state, content, playerId, force,
  );
  const best = candidates[0];
  if (!best) return undefined;
  const current = candidates.find((candidate) => sameCommanderCandidateV2(force, candidate));
  if (current && sameCommanderCandidateV2(force, best)) return current;
  const immediateCollapseResponse = best.criticalDefense && !current?.criticalDefense;
  const immediateFreshAssault = best.freshHumanAssault;
  const reviewDue = state.tick >= force.manualHoldUntilTick
    && (state.tick + commanderReviewOffsetV2(playerId))
      % COMMANDER_AUTONOMY_REVIEW_TICKS_V2 === 0;
  if (current && !immediateCollapseResponse && !immediateFreshAssault && (
    !reviewDue || best.score < current.score + COMMANDER_AUTONOMY_SWITCH_MARGIN_V2
  )) return current;

  const quote = quoteAutonomousCommanderOrderV2(
    state, content, playerId, best.destinationId, best.mission, best.front,
  );
  if (!quote.allowed) return current;
  applyCommanderOrderV2(
    state, playerId, best.mission, best.front, quote, 'autonomous',
  );
  return best;
}

/**
 * Migration cleanup for obsolete location-bound NEXUS saves. Omnipresence
 * Grid is derived from active fronts and never creates a secondary sidecar.
 */
export function reconcileApexTwinProjectionV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): boolean {
  const force = state.commanderForces?.[playerId];
  if (!force) return false;
  void state;
  void content;
  return clearApexSecondaryProjectionV2(force);
}

/** Shared deterministic ranking for the autonomous sim and read-only War UI. */
export function selectCommanderFrontPrioritiesV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): CommanderFrontPriorityV2[] {
  const network = selectApexEmpireShieldNetworkV2(state, content, playerId);
  if (!network) return [];
  const activeBySignature = new Map(activeCommanderFrontsV2(state)
    .map((front) => [front.signature, front] as const));
  return network.fronts.map((front, index) => {
    const signature = `${front.warId}:${front.sourceId}:${front.targetId}`;
    const active = activeBySignature.get(signature);
    const friendly = state.territories[front.friendlyTerritoryId];
    const hostile = state.territories[front.hostileTerritoryId];
    const ownPower = friendly ? armyPressureV2(
      friendly,
      front.mission === 'assault-support',
    ) : 0;
    const enemyPower = hostile ? armyPressureV2(
      hostile,
      front.mission !== 'assault-support',
    ) : 0;
    const supportedMultiplier = front.mission === 'assault-support'
      ? 1 + (network.attackMultiplier - 1) * front.allocationShare
      : 1 + (network.defenseMultiplier - 1) * front.allocationShare;
    const allocatedPower = ownPower * Math.max(0, supportedMultiplier - 1);
    const before = ownPower / Math.max(EPSILON, ownPower + enemyPower);
    const after = (ownPower + allocatedPower)
      / Math.max(EPSILON, ownPower + allocatedPower + enemyPower);
    const pressureRatio = enemyPower / Math.max(EPSILON, ownPower);
    return {
      front: {
        warId: front.warId,
        sourceId: front.sourceId,
        targetId: front.targetId,
      },
      destinationId: front.friendlyTerritoryId,
      hostileTerritoryId: front.hostileTerritoryId,
      mission: front.mission,
      access: active?.operation.access ?? 'land',
      score: round((network.fronts.length - index) * 10 + pressureRatio, 3),
      criticalDefense: front.mission === 'defense' && pressureRatio >= 1.5,
      freshHumanAssault: front.mission === 'assault-support'
        && Boolean(active && state.tick - Math.max(
          active.war.startedTick,
          active.operation.startedTick,
        ) <= 2),
      marginalWinImpact: round(Math.max(0, (after - before) * 100), 3),
      travelTicks: 0,
      assigned: network.active,
    };
  });
}

export function selectCommanderAutonomyStatusV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): CommanderAutonomyStatusV2 {
  const force = state.commanderForces?.[playerId];
  if (!force) return {
    state: 'absent', headline: 'APEX UNAVAILABLE', reason: 'No neural dome is active in this timeline.',
    etaWeeks: null, locationId: null, destinationId: null, front: null,
  };
  const network = selectApexEmpireShieldNetworkV2(state, content, playerId);
  if (network?.operationalState === 'recharging') return {
    state: 'rebuilding', headline: 'APEX NETWORK RECHARGING',
    reason: 'The empire-wide shield is offline until Energy reaches 100%.',
    etaWeeks: null, locationId: force.locationId,
    destinationId: force.locationId, front: null,
  };
  if (network?.active && network.fronts.length > 0) {
    const lead = network.fronts[0]!;
    return {
    state: 'supporting',
    headline: 'APEX EMPIRE SHIELD ENGAGED',
    reason: network.fronts.length === 1
      ? 'The full network is reinforcing the active front.'
      : `${network.fronts.length} fronts share one Energy and ATK/DEF pool.`,
    etaWeeks: 0,
    locationId: force.locationId,
    destinationId: lead.friendlyTerritoryId,
    front: {
      warId: lead.warId,
      sourceId: lead.sourceId,
      targetId: lead.targetId,
    },
  };
  }
  const purgeFocusId = selectApexSignalPurgeFocusV2(state, content, playerId);
  if (network?.active && purgeFocusId) {
    return {
      state: 'monitoring', headline: 'APEX PRIORITY PURGE ACTIVE',
      reason: 'The distributed network is focusing purge bandwidth here while maintaining Empire coverage.',
      etaWeeks: 0,
      locationId: force.locationId,
      destinationId: purgeFocusId,
      front: null,
    };
  }
  return {
    state: network?.active ? 'monitoring' : 'absent',
    headline: network?.active ? 'APEX EMPIRE SHIELD ONLINE' : 'APEX UNAVAILABLE',
    reason: network?.active
      ? `Protecting ${network.coverageTerritoryIds.length} Empire territories.`
      : 'The global shield has no operational Energy.',
    etaWeeks: null, locationId: force.locationId, destinationId: force.locationId, front: null,
  };
}

function releaseCommanderToAutonomyV2(force: CommanderForceStateV2): void {
  clearApexSecondaryProjectionV2(force);
  force.mission = 'standby';
  force.orderSource = 'autonomous';
  force.manualHoldUntilTick = 0;
  force.front = null;
}

function commanderEmergencyTransitValidV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  force: CommanderForceStateV2,
): boolean {
  const transit = force.transit;
  if (!transit || force.mission !== 'evacuate'
    || transit.path.length < 2
    || transit.path[0] !== force.locationId
    || state.territories[force.locationId]?.owner === playerId) return false;
  return transit.path.slice(1).every((territoryId) => (
    state.territories[territoryId]?.owner === playerId
  )) && transit.path.every((territoryId, index) => (
    index === 0 || connectionExistsV2(
      state, content, transit.path[index - 1]!, territoryId,
    )
  ));
}

function selectCommanderEmergencyExtractionDestinationV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  force: CommanderForceStateV2,
  ownedTerritoryIds: readonly TerritoryId[],
): { territoryId: TerritoryId; route: CommanderRouteV2 } | undefined {
  const capitalId = state.players[playerId]?.capitalId;
  return ownedTerritoryIds.flatMap((territoryId) => {
    const territory = state.territories[territoryId];
    const route = selectCommanderEmergencyExtractionRouteV2(
      state, content, playerId, force.locationId, territoryId,
    );
    if (!territory || !route || route.path.length < 2) return [];
    return [{
      territoryId,
      route,
      pressureRatio: hostilePressureAtV2(state, playerId, territoryId).ratio,
      adjacentHostileFronts: territoryAdjacentHostileFrontsV2(
        state, content, playerId, territoryId,
      ),
      capital: territoryId === capitalId,
    }];
  }).sort((left, right) => (
    Number(right.capital) - Number(left.capital)
      || left.pressureRatio - right.pressureRatio
      || left.adjacentHostileFronts - right.adjacentHostileFronts
      || left.route.distanceKm - right.route.distanceKm
      || left.territoryId.localeCompare(right.territoryId)
  ))[0];
}

/**
 * Normalizes location-bound legacy saves into the distributed network model.
 * `locationId` remains a compatibility core/recovery anchor, but the live
 * shield never travels, reserves a territory or carries a front assignment.
 */
export function reconcileCommanderTerritorialAccessV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): boolean {
  const force = state.commanderForces?.[playerId];
  if (!force) return false;
  const ownedTerritoryIds = (Object.entries(state.territories) as Array<[
    TerritoryId,
    WorldStateV2['territories'][TerritoryId],
  ]>)
    .filter(([, territory]) => territory.owner === playerId)
    .map(([territoryId]) => territoryId)
    .sort((left, right) => left.localeCompare(right));
  if (ownedTerritoryIds.length === 0) {
    // Human APEX is a persistent timeline narrator, never a sovereign army.
    // With no liberated ground its core becomes inert: victory and defeat
    // continue to derive exclusively from ordinary national territory/forces.
    const changed = Boolean(force.front || force.transit || force.mission !== 'standby');
    force.front = null;
    force.transit = null;
    force.mission = 'standby';
    force.orderSource = 'autonomous';
    force.manualHoldUntilTick = 0;
    clearApexSecondaryProjectionV2(force);
    return changed;
  }

  const capitalId = state.players[playerId]?.capitalId;
  const anchorId = capitalId && state.territories[capitalId]?.owner === playerId
    ? capitalId : ownedTerritoryIds[0]!;
  const recoveryActive = force.mission === 'hq-training'
    || force.mission === 'evacuate';
  const changed = force.locationId !== anchorId
    || Boolean(force.front)
    || Boolean(force.transit)
    || force.orderSource !== 'autonomous'
    || (!recoveryActive && force.mission !== 'standby')
    || Boolean(normalizeApexDoctrineRuntimeV2(force.doctrineRuntime)
      .secondaryProjection);
  force.locationId = anchorId;
  force.front = null;
  force.transit = null;
  force.orderSource = 'autonomous';
  if (force.mission === 'evacuate') force.mission = 'hq-training';
  else if (!recoveryActive) force.mission = 'standby';
  if (force.mission !== 'hq-training') force.manualHoldUntilTick = 0;
  clearApexSecondaryProjectionV2(force);
  void content;
  return changed;
}

/**
 * Sends the physical neural-dome core to the deterministic liberation focus.
 * A concrete reachable war assignment and damage safety run before this; an
 * unrelated or unreachable war no longer freezes physical purge work.
 */
function assignAutonomousSignalPurgeV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  force: CommanderForceStateV2,
): boolean {
  const focusId = selectApexSignalPurgeFocusV2(state, content, playerId);
  if (!focusId
    || commanderCandidateClaimedByOtherV2(state, playerId, focusId)
    || force.shield.integrity <= EPSILON
    || force.economy.supplyStock <= EPSILON
    || force.front
    || force.mission === 'evacuate') {
    return false;
  }
  if (force.transit) {
    return force.transit.path.at(-1) === focusId;
  }
  if (force.locationId === focusId) {
    force.mission = 'standby';
    force.front = null;
    force.orderSource = 'autonomous';
    return true;
  }
  const quote = quoteAutonomousCommanderOrderV2(
    state,
    content,
    playerId,
    focusId,
    'standby',
    null,
  );
  if (!quote.allowed) return false;
  applyCommanderOrderV2(state, playerId, 'standby', null, quote, 'autonomous');
  addWorldEventV2(
    state,
    'conquest',
    'action',
    `APEX MOVING TO PURGE: the neural dome is travelling through secured Empire territory to ${content.territories[focusId]?.name ?? focusId}.`,
    focusId,
    playerId,
  );
  return true;
}

/**
 * Distributed shields do not claim individual territories or fronts. This
 * compatibility hook now only normalizes old co-op movement assignments.
 */
export function reconcileCoopApexClaimsV2(
  state: WorldStateV2,
  content: WorldContentV2,
): boolean {
  let changed = false;
  for (const [playerId] of (Object.entries(state.commanderForces ?? {}) as Array<[
    PlayerId,
    CommanderForceStateV2,
  ]>)
    .filter(([candidateId]) => isHumanPlayerV2(state, candidateId))
    .sort(([left], [right]) => left.localeCompare(right))) {
    changed = reconcileCommanderTerritorialAccessV2(
      state,
      content,
      playerId,
    ) || changed;
  }
  return changed;
}

/** Separate economy/travel phase with deterministic autonomous decisions. */
export function processCommanderForcesV2(
  state: WorldStateV2,
  content: WorldContentV2,
): void {
  for (const [rawPlayerId] of Object.entries(state.commanderForces ?? {})
    .sort(([left], [right]) => left.localeCompare(right))) {
    const playerId = rawPlayerId as PlayerId;
    reconcileCommanderTerritorialAccessV2(state, content, playerId);
    const force = state.commanderForces?.[playerId];
    if (!force) continue;
    apexDoctrineRuntimeV2(force);
    if (!state.players[playerId]) {
      // A defeated human seat keeps its non-sovereign narrative APEX core,
      // but it has no economy, autonomy or battlefield presence after its
      // national backend retires.
      force.mission = 'standby';
      force.front = null;
      force.transit = null;
      clearApexSecondaryProjectionV2(force);
      continue;
    }
    force.empireSupport = normalizeApexEmpireSupportV2(force.empireSupport);
    // Authenticated location/front assignments have already been collapsed by
    // reconcileCommanderTerritorialAccessV2. Only true-zero recovery remains a
    // physical-core lifecycle; normal combat and purge projection are global.
    if (force.mission === 'hq-training'
      && force.shield.integrity <= EPSILON) {
      force.manualHoldUntilTick = COMMANDER_EXHAUSTED_RECOVERY_HOLD_TICK_V2;
    }
    processCommanderEconomyV2(state, playerId, force);
    if (force.mission === 'hq-training') {
      const readiness = commanderOperationalReadinessV2(force);
      // Once integrity reaches zero the field is genuinely absent everywhere.
      // The network returns atomically at full integrity so no tiny projection
      // can stall a national defeat while the core is recharging.
      if (readiness.integrity + EPSILON < 1) continue;
      force.manualHoldUntilTick = 0;
      releaseCommanderToAutonomyV2(force);
    }
    // A healthy human APEX is an empire service, not a movable formation.
    // The canonical network selector derives live fronts without writing any
    // of the retired location-bound assignment fields.
    force.front = null;
    force.transit = null;
    force.mission = 'standby';
  }
}

/** Closed fronts release immediately; active assignments remain optimizer-owned. */
export function reconcileCommanderForcesV2(
  state: WorldStateV2,
  content: WorldContentV2,
): void {
  for (const [rawPlayerId] of Object.entries(state.commanderForces ?? {})
    .sort(([left], [right]) => left.localeCompare(right))) {
    reconcileCommanderTerritorialAccessV2(
      state,
      content,
      rawPlayerId as PlayerId,
    );
  }
  reconcileCoopApexClaimsV2(state, content);
  for (const [rawPlayerId] of Object.entries(state.commanderForces ?? {})
    .sort(([left], [right]) => left.localeCompare(right))) {
    const playerId = rawPlayerId as PlayerId;
    reconcileCommanderTerritorialAccessV2(state, content, playerId);
    const force = state.commanderForces?.[playerId];
    if (!force) continue;
    apexDoctrineRuntimeV2(force);
    force.empireSupport = normalizeApexEmpireSupportV2(force.empireSupport);
    if (force.orderSource === 'manual') {
      force.orderSource = 'autonomous';
      force.manualHoldUntilTick = 0;
    }
    if (force.mission === 'logistics-relief') {
      force.transit = null;
      releaseCommanderToAutonomyV2(force);
    }
    if (force.transit) continue;
    if ((force.mission === 'assault-support'
      || force.mission === 'defense'
      || force.mission === 'logistics-relief')
      && !frontStillValidV2(state, content, playerId, force)) {
      releaseCommanderToAutonomyV2(force);
    }
    reconcileApexTwinProjectionV2(state, content, playerId);
    if (force.mission !== 'hq-training') {
      force.front = null;
      force.transit = null;
      force.mission = 'standby';
    }
  }
}

export interface CommanderBattleFormationV2 {
  playerId: PlayerId;
  /** Explicit projection role lets the commit boundary reject defensive pulses. */
  mission: Extract<CommanderMissionV2, 'assault-support' | 'defense'>;
  shieldIntegrity: number;
  maxShieldIntegrity: number;
  /** Applied only to the existing national army on this front. */
  attackMultiplier: number;
  /** Applied only to the existing national army on this front. */
  defenseMultiplier: number;
  /** Fixed neural-pulse damage budget after this front's shared allocation. */
  pulseAttack: number;
  /** Damage blocked by each point of Energy spent on this hit. */
  interceptEfficiency?: number;
  availableSupply: number;
  projection: 'primary' | 'secondary';
  /** Multi-front network share allocated to this battle. */
  projectionCombatShare: number;
  /** True only when this resolved offensive battle should fire Overdrive Pulse. */
  singularityPulseCharged: boolean;
  /** Countermeasure may reflect 15% of damage this shield actually intercepts. */
  mirrorMatrixEligible: boolean;
}

/** Pulse-specialized builds retain part of the power normally lost to a split network. */
function apexPulseProjectionShareV2(
  force: CommanderForceStateV2,
  projectionCombatShare: number,
): number {
  const share = clamp(projectionCombatShare, 0, 1);
  const retention = clamp(force.shield.pulseProjectionRetention ?? 0, 0, 0.35);
  return clamp(share + (1 - share) * retention, 0, 1);
}

export interface CommanderBattleLogisticsV2 {
  playerId: PlayerId;
  availableSupply: number;
}

export interface CommanderBattleSupportV2 {
  attacker: CommanderBattleFormationV2 | null;
  defender: CommanderBattleFormationV2 | null;
  attackerLogistics: CommanderBattleLogisticsV2 | null;
  defenderLogistics: CommanderBattleLogisticsV2 | null;
}

/** Human APEX remains in commanderForces; the hostile Prime has a polar sidecar. */
export function battleCommanderForceV2(
  state: WorldStateV2,
  ownerId: PlayerId,
): CommanderForceStateV2 | undefined {
  if (ownerId === ROGUE_AI_NATION_ID_V2) {
    const prime = state.polarEndgame.roguePrime;
    return (prime?.status === 'guarding' || prime?.status === 'sortie')
      ? prime.force ?? undefined
      : undefined;
  }
  return state.commanderForces?.[ownerId];
}

function apexBattleProjectionV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  force: CommanderForceStateV2,
  war: WarStateV2,
  operation: FrontOperationV2,
  mission: Extract<CommanderMissionV2, 'assault-support' | 'defense'>,
): { role: 'primary' | 'secondary'; share: number } | null {
  if (playerId !== ROGUE_AI_NATION_ID_V2 && isHumanPlayerV2(state, playerId)) {
    const network = selectApexEmpireShieldNetworkV2(state, content, playerId);
    if (!network?.active) return null;
    const frontIndex = network.fronts.findIndex((front) => (
      front.warId === war.id
      && front.sourceId === operation.sourceId
      && front.targetId === operation.targetId
      && front.mission === mission
    ));
    if (frontIndex < 0) return null;
    return {
      role: frontIndex === 0 ? 'primary' : 'secondary',
      share: network.fronts[frontIndex]!.allocationShare,
    };
  }
  if (playerId === ROGUE_AI_NATION_ID_V2) {
    // PRIME's hostile red field is Antarctic infrastructure, not a second
    // worldwide network. A gateway strike may originate on the ice, but weak
    // machine-occupied world territories never gain PRIME shield support.
    const friendlyTerritoryId = mission === 'assault-support'
      ? operation.sourceId : operation.targetId;
    if (!ANTARCTIC_TERRITORY_IDS_V2.includes(friendlyTerritoryId)) return null;
  }
  if (force.transit) return null;
  if (force.mission === mission
    && force.locationId === (mission === 'assault-support'
      ? operation.sourceId : operation.targetId)
    && frontMatchesV2(force.front, war, operation)) return { role: 'primary', share: 1 };
  const twin = selectApexTwinProjectionStatusV2(state, playerId, content);
  const secondary = twin.secondaryProjection;
  return twin.active
    && secondary?.mission === mission
    && secondary.locationId === (mission === 'assault-support'
      ? operation.sourceId : operation.targetId)
    && frontMatchesV2(secondary.front, war, operation)
    ? { role: 'secondary', share: twin.combatShare } : null;
}

/** Exact selected-front lookup. Unassigned, moving or recharging domes contribute nothing. */
export function selectCommanderBattleSupportV2(
  state: WorldStateV2,
  war: WarStateV2,
  operation: FrontOperationV2,
  content: WorldContentV2,
): CommanderBattleSupportV2 {
  const source = state.territories[operation.sourceId];
  const target = state.territories[operation.targetId];
  const result: CommanderBattleSupportV2 = {
    attacker: null,
    defender: null,
    attackerLogistics: null,
    defenderLogistics: null,
  };
  if (!source || !target) return result;
  const attackerForce = battleCommanderForceV2(state, source.owner);
  const defenderForce = battleCommanderForceV2(state, target.owner);
  const attackerReadiness = attackerForce
    ? commanderOperationalReadinessV2(attackerForce) : null;
  const defenderReadiness = defenderForce
    ? commanderOperationalReadinessV2(defenderForce) : null;
  const attackerOperational = isHumanPlayerV2(state, source.owner)
    ? selectApexShieldOperationalStateV2(state, source.owner) === 'operational'
    : source.owner === ROGUE_AI_NATION_ID_V2
      || Boolean(attackerReadiness
        && attackerReadiness.integrity > COMMANDER_DAMAGE_RETREAT_MANPOWER_READINESS_V2
        && attackerReadiness.supply > COMMANDER_DAMAGE_RETREAT_SUPPLY_READINESS_V2);
  const defenderOperational = isHumanPlayerV2(state, target.owner)
    ? selectApexShieldOperationalStateV2(state, target.owner) === 'operational'
    : target.owner === ROGUE_AI_NATION_ID_V2
      || Boolean(defenderReadiness
        && defenderReadiness.integrity > COMMANDER_DAMAGE_RETREAT_MANPOWER_READINESS_V2
        && defenderReadiness.supply > COMMANDER_DAMAGE_RETREAT_SUPPLY_READINESS_V2);
  const attackerProjection = attackerForce
    ? apexBattleProjectionV2(
        state, content, source.owner, attackerForce, war, operation, 'assault-support',
      )
    : null;
  const defenderProjection = defenderForce
    ? apexBattleProjectionV2(
        state, content, target.owner, defenderForce, war, operation, 'defense',
      )
    : null;
  if (attackerForce
    && attackerOperational
    && attackerProjection) {
    if (attackerForce.shield.integrity > EPSILON) {
      const projectionCombatShare = attackerProjection.share;
      const pulseProjectionShare = apexPulseProjectionShareV2(
        attackerForce,
        projectionCombatShare,
      );
      const lancer = selectApexLancerPulseStatusV2(state, source.owner);
      const attackBonus = Math.max(
        0,
        apexArmyAttackMultiplierV2(state, source.owner, attackerForce) - 1,
      ) * projectionCombatShare;
      const defenseBonus = Math.max(
        0,
        apexArmyDefenseMultiplierV2(state, source.owner, attackerForce) - 1,
      ) * projectionCombatShare;
      result.attacker = {
        playerId: source.owner,
        mission: 'assault-support',
        shieldIntegrity: attackerForce.shield.integrity,
        maxShieldIntegrity: attackerForce.shield.maxIntegrity,
        attackMultiplier: round(1 + attackBonus, 9),
        defenseMultiplier: round(1 + defenseBonus, 9),
        pulseAttack: round(
          attackerForce.shield.pulseAttack
            * pulseProjectionShare
            * lancer.nextAttackMultiplier,
          9,
        ),
        interceptEfficiency: clamp(
          attackerForce.shield.interceptEfficiency ?? 1,
          1,
          1.45,
        ),
        availableSupply: isHumanPlayerV2(state, source.owner)
          ? attackerForce.shield.integrity : attackerForce.economy.supplyStock,
        projection: attackerProjection.role,
        projectionCombatShare,
        singularityPulseCharged: lancer.nextPulseCharged,
        mirrorMatrixEligible: attackerForce.capabilities.defenseSpecialist,
      };
    }
  }
  if (defenderForce
    && defenderOperational
    && defenderProjection) {
    if (defenderForce.shield.integrity > EPSILON) {
      const projectionCombatShare = defenderProjection.share;
      const pulseProjectionShare = apexPulseProjectionShareV2(
        defenderForce,
        projectionCombatShare,
      );
      result.defender = {
        playerId: target.owner,
        mission: 'defense',
        shieldIntegrity: defenderForce.shield.integrity,
        maxShieldIntegrity: defenderForce.shield.maxIntegrity,
        attackMultiplier: round(1 + Math.max(
          0,
          apexArmyAttackMultiplierV2(state, target.owner, defenderForce) - 1,
        ) * projectionCombatShare, 9),
        defenseMultiplier: round(1 + Math.max(
          0,
          apexArmyDefenseMultiplierV2(state, target.owner, defenderForce) - 1,
        ) * projectionCombatShare, 9),
        pulseAttack: round(
          defenderForce.shield.pulseAttack
            * pulseProjectionShare
            * clamp(defenderForce.shield.defensivePulseMultiplier ?? 1, 1, 1.75),
          9,
        ),
        interceptEfficiency: clamp(
          defenderForce.shield.interceptEfficiency ?? 1,
          1,
          1.45,
        ),
        availableSupply: isHumanPlayerV2(state, target.owner)
          ? defenderForce.shield.integrity : defenderForce.economy.supplyStock,
        projection: defenderProjection.role,
        projectionCombatShare,
        singularityPulseCharged: false,
        mirrorMatrixEligible: defenderForce.capabilities.defenseSpecialist,
      };
    }
  }
  // Authenticated older saves may briefly retain the retired physical
  // logistics mission until the weekly reconciliation phase normalizes it.
  // Preserve its battle-protocol behavior during that compatibility window.
  if (attackerForce
    && !attackerForce.transit
    && attackerOperational
    && attackerForce.locationId === operation.sourceId
    && attackerForce.mission === 'logistics-relief'
    && frontMatchesV2(attackerForce.front, war, operation)
    && attackerForce.economy.supplyStock > EPSILON) {
    result.attackerLogistics = {
      playerId: source.owner,
      availableSupply: attackerForce.economy.supplyStock,
    };
  }
  if (defenderForce
    && !defenderForce.transit
    && defenderOperational
    && defenderForce.locationId === operation.targetId
    && defenderForce.mission === 'logistics-relief'
    && frontMatchesV2(defenderForce.front, war, operation)
    && defenderForce.economy.supplyStock > EPSILON) {
    result.defenderLogistics = {
      playerId: target.owner,
      availableSupply: defenderForce.economy.supplyStock,
    };
  }
  return result;
}

/**
 * Applies damage to active neural-dome integrity. The compatibility return is
 * the unrecoverable impact after Emergency Reboot captures bounded energy into
 * the offline buffer. Current integrity still takes the full hit immediately;
 * the buffer never repairs the operational dome during wartime processing.
 */
export function applyApexShieldDamageV2(
  state: WorldStateV2,
  playerId: PlayerId | null,
  requestedIntegrityDamage: number,
): number {
  if (!playerId || !(requestedIntegrityDamage > 0)) return 0;
  const force = battleCommanderForceV2(state, playerId);
  if (!force) return 0;
  const integrityBefore = Math.max(0, force.shield.integrity);
  const appliedIntegrityDamage = Math.min(
    integrityBefore,
    requestedIntegrityDamage,
  );
  force.shield.integrity = round(
    Math.max(0, integrityBefore - appliedIntegrityDamage),
    9,
  );
  const humanApex = isHumanPlayerV2(state, playerId)
    && playerId !== ROGUE_AI_NATION_ID_V2;
  const collapsed = integrityBefore > EPSILON
    && force.shield.integrity <= EPSILON;
  if (collapsed && humanApex) {
    const runtime = apexDoctrineRuntimeV2(force);
    if (force.capabilities.fieldHospital && !runtime.emergencyRebootUsed) {
      runtime.emergencyRebootUsed = true;
      force.shield.integrity = round(force.shield.maxIntegrity * 0.20, 9);
      addWorldEventV2(
        state,
        'war',
        'critical',
        'APEX EMERGENCY REBOOT · Energy restored to 20%.',
        force.locationId,
        playerId,
      );
      return round(appliedIntegrityDamage, 9);
    }
    const capitalId = state.players[playerId]?.capitalId;
    const compatibilityAnchorId = capitalId
      && state.territories[capitalId]?.owner === playerId
      ? capitalId
      : (Object.entries(state.territories) as Array<[
          TerritoryId,
          WorldStateV2['territories'][TerritoryId],
        ]>)
          .filter(([, territory]) => territory.owner === playerId)
          .map(([territoryId]) => territoryId)
          .sort((left, right) => left.localeCompare(right))[0];
    if (compatibilityAnchorId) force.locationId = compatibilityAnchorId;
    force.mission = compatibilityAnchorId ? 'hq-training' : 'standby';
    force.orderSource = 'autonomous';
    force.manualHoldUntilTick = compatibilityAnchorId
      ? COMMANDER_EXHAUSTED_RECOVERY_HOLD_TICK_V2
      : state.tick + COMMANDER_AUTONOMY_HYSTERESIS_TICKS_V2;
    force.front = null;
    force.transit = null;
    clearApexSecondaryProjectionV2(force);
    addWorldEventV2(
      state,
      'war',
      'critical',
      compatibilityAnchorId
        ? 'APEX EXHAUSTED · DOME OFFLINE: Energy reached zero and a full network recharge has begun.'
        : 'APEX EXHAUSTED · DOME OFFLINE: Energy reached zero and no sovereign Empire network remains.',
      compatibilityAnchorId ?? force.locationId,
      playerId,
    );
  }
  return round(appliedIntegrityDamage, 9);
}

/**
 * Backward-compatible battle API. Commander casualty fields are frozen into
 * save/replay/multiplayer protocols; for APEX this delegates to dome damage.
 */
export function applyCommanderCasualtiesV2(
  state: WorldStateV2,
  playerId: PlayerId | null,
  requested: number,
): number {
  const force = playerId ? battleCommanderForceV2(state, playerId) : undefined;
  const applied = applyApexShieldDamageV2(state, playerId, requested);
  const recoveredImpactEnergy = applied * clamp(
    force?.shield.impactRecoveryShare ?? 0,
    0,
    0.35,
  );
  if (force && recoveredImpactEnergy > EPSILON) {
    // Impact Recovery never repairs the live wartime shield. It only banks
    // offline Reserve Energy consumed by the existing safe recharge phase.
    force.shield.rechargeBuffer = round(Math.min(
      force.shield.maxIntegrity,
      force.shield.rechargeBuffer + recoveredImpactEnergy,
    ), 9);
  }
  return applied;
}

export function consumeCommanderSupplyV2(
  state: WorldStateV2,
  playerId: PlayerId | null,
  requested: number,
): number {
  if (!playerId || !(requested > 0)) return 0;
  // Human APEX combat is powered by the one shared integrity pool. The legacy
  // field supply stock remains a recharge buffer and can no longer make a
  // distributed shield disappear from a distant front.
  if (playerId !== ROGUE_AI_NATION_ID_V2 && isHumanPlayerV2(state, playerId)) return 0;
  const force = battleCommanderForceV2(state, playerId);
  if (!force) return 0;
  const applied = Math.min(force.economy.supplyStock, requested);
  force.economy.supplyStock = round(Math.max(0, force.economy.supplyStock - applied), 9);
  return round(applied, 9);
}

type LegacyCommanderForceArmyBoundaryV2 = {
  manpower?: unknown;
  capacity?: unknown;
  trainedReserves?: unknown;
  baseAttack?: unknown;
  baseDefense?: unknown;
};

function finiteCommanderBoundaryNumberV2(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * One authenticated-save migration boundary. Old APEX Army records are read
 * here and immediately converted into shield energy plus army multipliers;
 * the returned runtime object can never expose personnel or reserves.
 */
export function normalizeCommanderForceRuntimeV2(
  source: unknown,
  empireSupportFallback: Readonly<CommanderEmpireSupportV2> = BASE_APEX_EMPIRE_SUPPORT_V2,
): CommanderForceStateV2 | null {
  if (!source || typeof source !== 'object') return null;
  const raw = source as Record<string, unknown>;
  const legacyArmy = (raw.army && typeof raw.army === 'object'
    ? raw.army : {}) as LegacyCommanderForceArmyBoundaryV2;
  const rawShield = (raw.shield && typeof raw.shield === 'object'
    ? raw.shield : {}) as Record<string, unknown>;
  const legacyCapacity = Math.max(
    EPSILON,
    finiteCommanderBoundaryNumberV2(legacyArmy.capacity, 0.0008),
  );
  const maxIntegrity = Math.max(
    EPSILON,
    finiteCommanderBoundaryNumberV2(rawShield.maxIntegrity, legacyCapacity),
  );
  const integrity = clamp(
    finiteCommanderBoundaryNumberV2(
      rawShield.integrity,
      finiteCommanderBoundaryNumberV2(legacyArmy.manpower, maxIntegrity),
    ),
    0,
    maxIntegrity,
  );
  const legacyAttackRating = finiteCommanderBoundaryNumberV2(legacyArmy.baseAttack, 125);
  const legacyDefenseRating = finiteCommanderBoundaryNumberV2(legacyArmy.baseDefense, 125);
  const capabilitiesSource = (raw.capabilities && typeof raw.capabilities === 'object'
    ? raw.capabilities : {}) as Record<string, unknown>;
  const economySource = (raw.economy && typeof raw.economy === 'object'
    ? raw.economy : {}) as Record<string, unknown>;
  const prioritiesSource = (economySource.priorities
    && typeof economySource.priorities === 'object'
    ? economySource.priorities : {}) as Record<string, unknown>;
  const candidatePriorities: CommanderEconomyPrioritiesV2 = {
    training: finiteCommanderBoundaryNumberV2(prioritiesSource.training, 40),
    logistics: finiteCommanderBoundaryNumberV2(prioritiesSource.logistics, 40),
    development: finiteCommanderBoundaryNumberV2(prioritiesSource.development, 20),
  };
  const frontSource = raw.front && typeof raw.front === 'object'
    ? raw.front as CommanderFrontAssignmentV2 : null;
  const transitSource = raw.transit && typeof raw.transit === 'object'
    ? raw.transit as Partial<CommanderForceStateV2['transit']> : null;
  const mission = typeof raw.mission === 'string' && [
    'standby', 'assault-support', 'defense', 'logistics-relief', 'evacuate', 'hq-training',
  ].includes(raw.mission)
    ? raw.mission as CommanderMissionV2 : 'standby';
  const force: CommanderForceStateV2 = {
    shield: {
      integrity: round(integrity, 9),
      maxIntegrity: round(maxIntegrity, 9),
      rechargeBuffer: round(clamp(
        finiteCommanderBoundaryNumberV2(
          rawShield.rechargeBuffer,
          finiteCommanderBoundaryNumberV2(legacyArmy.trainedReserves, 0),
        ),
        0,
        maxIntegrity,
      ), 9),
      rechargeMultiplier: round(clamp(
        finiteCommanderBoundaryNumberV2(rawShield.rechargeMultiplier, 1),
        1,
        3.5,
      ), 9),
      attackMultiplier: round(clamp(
        finiteCommanderBoundaryNumberV2(
          rawShield.attackMultiplier,
          1 + Math.max(0, legacyAttackRating) * 0.00064,
        ),
        1,
        2.5,
      ), 9),
      defenseMultiplier: round(clamp(
        finiteCommanderBoundaryNumberV2(
          rawShield.defenseMultiplier,
          1 + Math.max(0, legacyDefenseRating) * 0.00064,
        ),
        1,
        2.5,
      ), 9),
      pulseAttack: round(clamp(
        finiteCommanderBoundaryNumberV2(rawShield.pulseAttack, BASE_APEX_PULSE_ATTACK_V2),
        0,
        1,
      ), 9),
      pulseProjectionRetention: round(clamp(
        finiteCommanderBoundaryNumberV2(rawShield.pulseProjectionRetention, 0),
        0,
        0.35,
      ), 9),
      pulseChargeBonusPerStep: round(clamp(
        finiteCommanderBoundaryNumberV2(rawShield.pulseChargeBonusPerStep, 0),
        0,
        0.45,
      ), 9),
      interceptEfficiency: round(clamp(
        finiteCommanderBoundaryNumberV2(rawShield.interceptEfficiency, 1),
        1,
        1.45,
      ), 9),
      impactRecoveryShare: round(clamp(
        finiteCommanderBoundaryNumberV2(rawShield.impactRecoveryShare, 0),
        0,
        0.35,
      ), 9),
      defensivePulseMultiplier: round(clamp(
        finiteCommanderBoundaryNumberV2(rawShield.defensivePulseMultiplier, 1),
        1,
        1.75,
      ), 9),
    },
    economy: {
      treasury: 0,
      annualOutput: round(Math.max(
        0,
        finiteCommanderBoundaryNumberV2(economySource.annualOutput),
      ), 9),
      supplyStock: round(Math.max(
        0,
        finiteCommanderBoundaryNumberV2(economySource.supplyStock),
      ), 9),
      priorities: prioritiesValidV2(candidatePriorities)
        ? candidatePriorities : { ...DEFAULT_COMMANDER_PRIORITIES_V2 },
    },
    capabilities: {
      mobileHeadquarters: capabilitiesSource.mobileHeadquarters === true,
      fieldHospital: capabilitiesSource.fieldHospital === true,
      rapidResponse: false,
      forceMultiplier: capabilitiesSource.forceMultiplier === true
        || capabilitiesSource.rapidResponse === true,
      assaultSpecialist: capabilitiesSource.assaultSpecialist === true,
      defenseSpecialist: capabilitiesSource.defenseSpecialist === true,
      emergencyExtractionCharges: clamp(Math.floor(finiteCommanderBoundaryNumberV2(
        capabilitiesSource.emergencyExtractionCharges,
      )), 0, 2),
    },
    empireSupport: normalizeApexEmpireSupportV2(
      raw.empireSupport && typeof raw.empireSupport === 'object'
        ? raw.empireSupport as Partial<CommanderEmpireSupportV2> : undefined,
      empireSupportFallback,
    ),
    countryTraitScale: round(clamp(
      finiteCommanderBoundaryNumberV2(raw.countryTraitScale),
      0,
      1,
    ), 9),
    locationId: (typeof raw.locationId === 'string' ? raw.locationId : '') as TerritoryId,
    mission,
    orderSource: raw.orderSource === 'manual' ? 'manual' : 'autonomous',
    manualHoldUntilTick: Math.max(
      0,
      Math.floor(finiteCommanderBoundaryNumberV2(raw.manualHoldUntilTick)),
    ),
    front: frontSource ? { ...frontSource } : null,
    transit: transitSource && Array.isArray(transitSource.path)
      ? {
          path: [...transitSource.path],
          distanceKm: finiteCommanderBoundaryNumberV2(transitSource.distanceKm),
          departTick: finiteCommanderBoundaryNumberV2(transitSource.departTick),
          arriveTick: finiteCommanderBoundaryNumberV2(transitSource.arriveTick),
        }
      : null,
    doctrineRuntime: normalizeApexDoctrineRuntimeV2(
      raw.doctrineRuntime && typeof raw.doctrineRuntime === 'object'
        ? raw.doctrineRuntime as Partial<ApexDoctrineRuntimeV2> : undefined,
    ),
  };
  normalizeApexCapstoneProtocolV2(force);
  return force;
}

export function cloneCommanderForcesV2(
  forces: WorldStateV2['commanderForces'] | Readonly<Record<string, unknown>>,
): WorldStateV2['commanderForces'] {
  return Object.fromEntries(Object.entries(forces ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([playerId, source]) => {
      const force = normalizeCommanderForceRuntimeV2(source);
      return force ? [[playerId, force] as const] : [];
    })) as WorldStateV2['commanderForces'];
}

export function commanderFrontSignatureV2(
  force: CommanderForceStateV2,
): string | undefined {
  return force.front ? frontSignatureV2(force.front) : undefined;
}

export function commanderPrioritiesValidV2(
  priorities: CommanderEconomyPrioritiesV2,
): boolean {
  return prioritiesValidV2(priorities);
}

export function clampCommanderBattleSupplyV2(value: number): number {
  return clamp(value, 0, 1);
}
