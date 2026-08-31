import { nextRandom, randomInt } from '../../game/random';
import {
  BATTLE_INTERVAL_TICKS,
  battleDamageMeanV2,
  battleDamageVarianceV2,
  ATTACKER_MILITARY_LOSS_MULTIPLIER,
  CAPTURE_MIN_CONTRIBUTION_SHARE,
  localFormationCapitulationThresholdV2,
  COMBAT_DAMAGE_EFFECTIVENESS,
  COMBAT_HIT_EMPIRE_CAP_SHARE_V2,
  COMBAT_POWER_RATIO_EXPONENT,
  COMBAT_ROUTE_STRENGTH_RATIO,
  combatDefenseEffectV2,
  CONQUEST_WAR_FATIGUE_FULL_SCALE_SHARE,
  CONQUEST_WAR_FATIGUE_MAX,
  CONQUEST_WAR_FATIGUE_MIN,
  CONQUEST_CAPTURE_GUARD_MAX_TRANSFER_SHARE,
  CONQUEST_CAPTURE_GUARD_TICKS,
  CONQUEST_GUARD_MIN_TRANSFER_SHARE,
  DECISIVE_SURRENDER_MAX_DEFENDER_FILL,
  DECISIVE_SURRENDER_MIN_CUMULATIVE_LOSS_SHARE,
  DECISIVE_SURRENDER_MIN_FORCE_RATIO,
  DECISIVE_SURRENDER_MIN_FRONT_TICKS,
  DECISIVE_SURRENDER_MIN_MOMENTUM,
  ATTACKER_CIVILIAN_LOSS_DEFENDER_SHARE,
  ATTACKER_CIVILIAN_LOSS_INTENSITY,
  ATTACKER_CIVILIAN_LOSS_POPULATION_CAP,
  AI_OFFENSIVE_EXHAUSTION_ARMY_FILL_RATIO,
  DEFENDER_CIVILIAN_LOSS_INTENSITY,
  DEFENDER_CIVILIAN_LOSS_POPULATION_CAP,
  DEFENDER_COUNTERFIRE_MULTIPLIER,
  DEFENDER_POSITION_MULTIPLIER,
  POST_WAR_TRANSITION_FATIGUE,
  NAVAL_BATTLE_FATIGUE_MULTIPLIER,
  NAVAL_ROUTE_BASE_DISTANCE_KM,
  STALE_WAR_TICKS,
  TRUCE_TICKS,
  WAR_ACCESS_ASSAULT_MULTIPLIER,
  WAR_ACCESS_CASUALTY_MULTIPLIER,
  warAccessOperationMultiplierV2,
  WAR_DECLARATION_ATTACKER_LOSS_SHARE,
  WAR_CAMPAIGN_CONSOLIDATE_FATIGUE,
  WAR_CAMPAIGN_MAX_TICKS,
  WAR_CAMPAIGN_MIN_CONTINUE_FILL_RATIO,
  WAR_CAMPAIGN_MULTI_WAR_MIN_CONTINUE_FILL_RATIO,
  WAR_CAPTURE_CONSOLIDATION_TICKS,
  WAR_REVENGE_WINDOW_TICKS,
  FOOD_CONQUEST_LOCAL_STOCK_RETENTION_SHARE,
  clamp,
  round,
  smoothstep,
} from './balance';
import { areAlliedV2 } from './alliances';
import {
  ANTARCTIC_GATEWAY_IDS_V2,
  antarcticGatewayForConnectionV2,
  antarcticGatewayTerritoryIdV2,
  isAntarcticGatewayOpenV2,
  isWorldConnectionOpenV2,
} from './antarcticGateways';
import {
  CAMPAIGN_HUMAN_WAR_STORY_LOCK_REASON_V2,
  CAMPAIGN_WAR_LOCK_REASON_V2,
  campaignHumanWarsUnlockedV2,
  campaignProspectiveWarBattleIntervalTicksV2,
  campaignWarBattleIntervalTicksV2,
  campaignWarMobilizationTicksV2,
  campaignWarsUnlockedV2,
} from './campaignPrologue';
import {
  ANTARCTIC_TERRITORY_IDS_V2,
  ROGUE_AI_NATION_ID_V2,
  isRogueAiNationV2,
  territoryTerrainDefenseMultiplierV2,
  territoryTerrainFoodProductionMultiplierV2,
  type WorldContentV2,
} from './content';
import {
  nationalArmyCapacityAtOneXOpeningV2,
  nationalArmyCapacityTargetV2,
  stateTerritoryArmyCapacityTargetV2,
  stateTerritoryArmySupportCeilingV2,
} from './capacity';
import {
  allocateApexFrontlineDamageV2,
  applyCommanderCasualtiesV2,
  clampCommanderBattleSupplyV2,
  consumeCommanderSupplyV2,
  registerApexSupportedAssaultBattleV2,
  retreatApexForRecoveryV2,
  selectApexOperationalArmyModifiersV2,
  selectCommanderBattleSupportV2,
  selectCommanderForecastMobilityV2,
} from './commanderForce';
import { selectTerritoryCountryMasteryRuntimeV2 } from './countryMasteryRuntime';
import {
  mixArmyBaseQualityV2,
  resetEmptyArmyBaseQualityV2,
} from './armyQuality';
import { addWorldEventV2 } from './events';
import {
  areHumanTeammatesV2,
  isHumanPlayerV2,
  selectHumanPlayerIdsV2,
} from './humanPlayers';
import {
  selectBestCoopFriendlyTransitRouteV2,
  selectCoopMilitaryAccessRouteBetweenV2,
  selectCoopMilitaryAccessRoutesV2,
  type CoopMilitaryAccessRouteV2,
} from './coopAccess';
import { beginTerritoryIntegrationV2 } from './integration';
import { consumeOpeningArmyBonusLossV2 } from './openingArmyBonus';
import { resistanceCombatMultiplierV2 } from './resistance';
import { selectRunModifiersV2 } from './runProgression';
import { isSurvivalDawnlineNationV2 } from './survivalOrdinaryAi';
import {
  composeTraitContextV2,
  traitNationContextV2,
  traitOperationContextV2,
  traitTerritoryContextV2,
  traitWarContextV2,
} from './traitContext';
import { countryTraitFactorV2, type TraitEvaluationContextV2 } from './traits';
import {
  SURVIVAL_RECAPTURE_PRESSURE_RELIEF_V2,
  SURVIVAL_ROGUE_ASSAULT_MULTIPLIER_V2,
  SURVIVAL_ROGUE_FRONT_PROTECTION_MULTIPLIER_V2,
  SURVIVAL_ROGUE_GATEWAY_BREAKOUT_ASSAULT_MULTIPLIER_V2,
  SURVIVAL_ROGUE_GATEWAY_BREAKOUT_PROTECTION_MULTIPLIER_V2,
  adjustSurvivalWarPressureV2,
  isNationOperationalV2,
  isPermanentRogueWarV2,
  isSurvivalStateV2,
  rogueAnnualWaveManpowerV2,
  survivalBattlePressureGainV2,
} from './survival';
import {
  clearRogueWaveManpowerV2,
  recordRoguePrimeCasualtiesV2,
  recordRogueWaveCasualtiesV2,
  rogueWaveManpowerAtV2,
  transferRogueWaveManpowerV2,
} from './survivalProvenance';
import { recordApexConquestNarrativeV2 } from './apexNarrative';
import { selectNorthPoleModifiersV2 } from './northPoleModifiers';
import {
  LAND_ARMY_CAPACITY_SUPPLY_SHARE_V2,
  type ArmyCapacitySupplyQuoteV2,
  armyCapacitySupplyBudgetV2,
  quoteArmyCapacitySupplyV2,
} from './logistics';
import {
  createMilitaryBaseSnapshotV2,
  selectActiveWarBetweenV2,
  selectArmyCombatManpowerV2,
  selectCurrentPowerV2,
  selectEffectiveAttackV2,
  selectEffectiveDefenseV2,
  selectIsEliminatedV2,
  isSurvivalScorchedTransitTerritoryV2,
  selectArmyStrengthV2,
  selectNationalIqViewV2,
  selectNationalEconomyV2,
  selectTerritoriesOfV2,
  selectTerritoryPowerV2,
  selectTerritoryRouteDistanceKmV2,
  selectTreasurySeizureShareV2,
  selectTotalManpowerV2,
  selectWarAccessTypeV2,
  selectWarMobilizationCostV2,
  selectWarsOfV2,
  invalidateTerritoryIndexV2,
  sortedTerritoryIdsV2,
  type MilitaryBaseSnapshotV2,
} from './selectors';
import type {
  ApexForecastContributionV2,
  ApexWarTelemetryV2,
  ArmyStateV2,
  BattleEventV2,
  BattleTactic,
  CommandResultV2,
  CoopAllyBattleSupportV2,
  FrontOperationV2,
  LiveWarEstimateV2,
  LogisticsMovementV2,
  OperationDoctrineV2,
  PlayerId,
  TerritoryId,
  TruceStateV2,
  WarCampaignStateV2,
  WarStateV2,
  WarDeclarationStatusV2,
  WarForecastV2,
  WorldStateV2,
} from './types';

/** Transient exact conclusion data collected by WorldEngineV2; never canonical state. */
export interface WarConclusionV2 {
  war: WarStateV2;
  endedTick: number;
  reason: string;
}

function createApexWarTelemetryV2(
  state: WorldStateV2,
  playerId: PlayerId,
): ApexWarTelemetryV2 {
  return {
    supportedBattles: 0,
    peakPower: 0,
    maxIntegrity: round(Math.max(
      0,
      state.commanderForces[playerId]?.shield.maxIntegrity ?? 0,
    ), 9),
    integrityLosses: 0,
    supplyDelivered: 0,
    supplySpent: 0,
    singularityPulses: 0,
    mirrorCounterpulseDamage: 0,
    twinProjectionBattles: 0,
  };
}

/**
 * Starts or retrieves one persisted APEX war ledger. Legacy wars can omit the
 * sidecar; their unknowable pre-save history safely starts at zero while all
 * subsequent battle facts remain durable.
 */
export function ensureApexWarTelemetryV2(
  state: WorldStateV2,
  war: WarStateV2,
  playerId: PlayerId,
): ApexWarTelemetryV2 | undefined {
  if (!isHumanPlayerV2(state, playerId)) return undefined;
  war.apexTelemetryByPlayer ??= {};
  return war.apexTelemetryByPlayer[playerId]
    ??= createApexWarTelemetryV2(state, playerId);
}

/** Records each resolved dome projection exactly once at the battle boundary. */
export function recordApexWarBattleTelemetryV2(
  state: WorldStateV2,
  war: WarStateV2,
  battle: BattleEventV2,
  options: { attackerOverdriveShield?: boolean } = {},
): void {
  const sides = [
    {
      playerId: battle.commanderAttackerId,
      power: battle.commanderAttackerPower,
      integrityLosses: battle.commanderAttackerLosses,
      supplyDelivered: battle.commanderAttackerSupplyDelivered,
      supplySpent: battle.commanderAttackerSupplySpent,
      // The compatibility ledger counts the new, non-damaging Overdrive
      // Shield cycle without reviving the retired outgoing Pulse event.
      singularityPulse: options.attackerOverdriveShield === true
        || battle.commanderAttackerSingularityPulse === true,
      mirrorCounterpulseDamage: battle.commanderAttackerCounterpulseDamage ?? 0,
      projectionShare: battle.commanderAttackerProjectionShare,
    },
    {
      playerId: battle.commanderDefenderId,
      power: battle.commanderDefenderPower,
      integrityLosses: battle.commanderDefenderLosses,
      supplyDelivered: battle.commanderDefenderSupplyDelivered,
      supplySpent: battle.commanderDefenderSupplySpent,
      singularityPulse: false,
      mirrorCounterpulseDamage: battle.commanderDefenderCounterpulseDamage ?? 0,
      projectionShare: battle.commanderDefenderProjectionShare,
    },
  ] as const;
  for (const side of sides) {
    if (!side.playerId) continue;
    const telemetry = ensureApexWarTelemetryV2(state, war, side.playerId);
    if (!telemetry) continue;
    telemetry.supportedBattles += 1;
    // Combat pressure is expressed in billions internally. Reports and map
    // nameplates use the comparable player-facing Power scale.
    telemetry.peakPower = Math.max(
      telemetry.peakPower,
      round(side.power * 1_000),
    );
    telemetry.integrityLosses = round(
      telemetry.integrityLosses + side.integrityLosses,
      9,
    );
    telemetry.supplyDelivered = round(
      telemetry.supplyDelivered + side.supplyDelivered,
      9,
    );
    telemetry.supplySpent = round(telemetry.supplySpent + side.supplySpent, 9);
    if (side.singularityPulse) telemetry.singularityPulses += 1;
    telemetry.mirrorCounterpulseDamage = round(
      telemetry.mirrorCounterpulseDamage + side.mirrorCounterpulseDamage,
      9,
    );
    if (side.projectionShare !== undefined
      && side.projectionShare > 0
      && side.projectionShare < 1) {
      telemetry.twinProjectionBattles += 1;
    }
  }
}

interface FrontCandidateV2 {
  sourceId: TerritoryId;
  targetId: TerritoryId;
  access: 'land' | 'naval';
  routePath: readonly TerritoryId[];
  routeDistanceKm: number;
  routeHopCount: number;
  routeThroughputMultiplier: number;
  /** Bottleneck throughput across the complete staging + assault route. */
  assaultThroughputMultiplier: number;
  routeCostPerMillion: number;
  score: number;
  viable: boolean;
}

interface CaptureOutcomeV2 {
  conquered: boolean;
  capturedPopulation: number;
  capturedEconomy: number;
  treasurySeized: number;
  defeatedId?: PlayerId;
}

function armyCombatCapacityV2(state: WorldStateV2, playerId: PlayerId, army: WorldStateV2['territories'][TerritoryId]['army']): number {
  void state;
  void playerId;
  return Math.max(army.capacity, army.manpower);
}

function combatSideTraitContextV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  territoryId: TerritoryId,
  role: 'attacker' | 'defender',
  access: 'land' | 'naval',
): TraitEvaluationContextV2 {
  return composeTraitContextV2(
    traitNationContextV2(state, playerId),
    traitTerritoryContextV2(state, content, playerId, territoryId),
    { role, access },
  );
}

/** Applies only positive additions; recovery remains a separate output channel. */
function addWarFatigueGainV2(
  state: WorldStateV2,
  playerId: PlayerId,
  amount: number,
  context?: TraitEvaluationContextV2,
): void {
  if (!(amount > 0) || !state.players[playerId]) return;
  const factor = countryTraitFactorV2(
    playerId,
    'war-fatigue-gain',
    composeTraitContextV2(traitNationContextV2(state, playerId), context),
  );
  state.players[playerId]!.warFatigue = round(clamp(
    state.players[playerId]!.warFatigue + amount * factor,
    0,
    100,
  ));
}

const EPSILON = 0.000000001;

/**
 * The durable fatigue shock created by administering a conquered population.
 * It scales with the captured share of the resulting empire and is bounded so
 * a single victory creates years of recovery without permanent lockout.
 */
export function conquestWarFatigueShockV2(
  capturedPopulation: number,
  attackerPopulationBefore: number,
): number {
  const captured = Math.max(0, Number.isFinite(capturedPopulation) ? capturedPopulation : 0);
  const prior = Math.max(0, Number.isFinite(attackerPopulationBefore) ? attackerPopulationBefore : 0);
  if (captured <= 0) return 0;
  const resultingShare = captured / Math.max(0.000001, captured + prior);
  return round(CONQUEST_WAR_FATIGUE_MIN
    + (CONQUEST_WAR_FATIGUE_MAX - CONQUEST_WAR_FATIGUE_MIN)
      * smoothstep(0, CONQUEST_WAR_FATIGUE_FULL_SCALE_SHARE, resultingShare));
}

export interface CombatExchangeProjectionV2 {
  attackerStrength: number;
  defenderStrength: number;
  attackerAttack: number;
  attackerDefense: number;
  defenderAttack: number;
  defenderDefense: number;
  attackerSupply: number;
  defenderSupply: number;
  supportingForces: number;
  attackPressure: number;
  defenseShield: number;
  counterPressure: number;
  attackerShield: number;
  attackRatio: number;
  counterRatio: number;
  attackerLossRate: number;
  defenderLossRate: number;
  attackerEmpireCapacity: number;
  defenderEmpireCapacity: number;
  /** Uncapped army damage generated by the two local border formations. */
  rawAttackerLosses: number;
  rawDefenderLosses: number;
  /** One shared per-hit ceiling: 10% of the receiving Empire's full army cap. */
  attackerHitCap: number;
  defenderHitCap: number;
  attackerLosses: number;
  defenderLosses: number;
}

export interface CommanderAttackerCombatProjectionV2 {
  effectiveStrength: number;
  attackQuality: number;
  defenseQuality: number;
  operationMultiplier: number;
  /** Weighted full-strength rating shown by strategic previews. */
  displayPower: number;
  /** Exact pressure added to a live attacking front. */
  attackPressure: number;
  /** Exact protection added against the defender's counterfire. */
  attackerShield: number;
}

interface CommanderDefenderCombatProjectionV2 {
  defensePower: number;
  counterPressure: number;
}

/**
 * Resolves the one player-facing combat ceiling after ATK/DEF produced raw
 * damage. Only the army actually on the border generates or receives damage;
 * the rest of the Empire only establishes how large one hit is allowed to be.
 * Base combat receives the budget first and Rogue PRIME's standalone digital
 * attack uses any remainder, so the two can never stack past ten percent.
 * Human APEX never requests this second damage component. Shield absorption
 * happens later and never changes this Army ceiling.
 */
export function resolveFrontlineHitV2(input: {
  requestedBaseDamage: number;
  requestedApexDamage?: number;
  /** Final receiving-side DEF/casualty factor, resolved before the hard cap. */
  receivingDamageMultiplier?: number;
  frontlineManpower: number;
  empireArmyCapacity: number;
}): {
  hitCap: number;
  baseDamage: number;
  apexDamage: number;
  totalDamage: number;
} {
  const frontlineManpower = Math.max(0, input.frontlineManpower);
  const empireArmyCapacity = Math.max(0, input.empireArmyCapacity);
  const receivingDamageMultiplier = Math.max(
    0,
    Number.isFinite(input.receivingDamageMultiplier)
      ? input.receivingDamageMultiplier!
      : 1,
  );
  const hitCap = Math.min(
    frontlineManpower,
    empireArmyCapacity * COMBAT_HIT_EMPIRE_CAP_SHARE_V2,
  );
  const baseDamage = Math.min(
    hitCap,
    Math.max(0, input.requestedBaseDamage) * receivingDamageMultiplier,
  );
  const apexDamage = Math.min(
    Math.max(0, hitCap - baseDamage),
    Math.max(0, input.requestedApexDamage ?? 0) * receivingDamageMultiplier,
  );
  return {
    hitCap: round(hitCap, 9),
    baseDamage: round(baseDamage, 9),
    apexDamage: round(apexDamage, 9),
    totalDamage: round(baseDamage + apexDamage, 9),
  };
}

/**
 * Compatibility resolver for a separate digital attack request. Human APEX is
 * rejected by `resolveCommanderStandaloneDamageV2`; Rogue PRIME still uses
 * this request when real national armies exist on both sides of the front.
 */
export function resolveApexPulseDamageV2(input: {
  pulseAttack: number;
  nationalParticipatingManpower: number;
  hostileCurrentManpower: number;
}): number {
  const ownFormation = Math.max(0, input.nationalParticipatingManpower);
  const hostileFormation = Math.max(0, input.hostileCurrentManpower);
  if (ownFormation <= EPSILON || hostileFormation <= EPSILON) return 0;
  return round(Math.max(0, input.pulseAttack), 9);
}

/**
 * Standalone neural damage belongs exclusively to Rogue PRIME. Human APEX is
 * an Army multiplier and shield layer: authenticated legacy Pulse fields may
 * still deserialize, but they are inert at the authoritative combat boundary.
 */
export function resolveCommanderStandaloneDamageV2(
  ownerId: PlayerId | null | undefined,
  input: Parameters<typeof resolveApexPulseDamageV2>[0],
): number {
  return ownerId === ROGUE_AI_NATION_ID_V2
    ? resolveApexPulseDamageV2(input)
    : 0;
}

function commanderCanDealStandaloneDamageV2(
  ownerId: PlayerId | null | undefined,
): boolean {
  return ownerId === ROGUE_AI_NATION_ID_V2;
}

export interface CommanderAugmentedExchangeProjectionV2 {
  attackPressure: number;
  defenseShield: number;
  counterPressure: number;
  attackerShield: number;
  sourceStrength: number;
  targetStrength: number;
  attackRatio: number;
  counterRatio: number;
  requestedAttackerLosses: number;
  requestedDefenderLosses: number;
}

/**
 * Canonical APEX front contribution. Forecasts and battle resolution call the
 * same function so Rogue countermeasures and Antarctic theatre preparation
 * power cannot diverge between preview and the first live pulse.
 */
export function projectCommanderAttackerCombatV2(input: {
  state: WorldStateV2;
  content: WorldContentV2;
  ownerId: PlayerId;
  opponentId: PlayerId;
  sourceId: TerritoryId;
  targetId: TerritoryId;
  access: 'land' | 'naval';
  nationalAttackPressure: number;
  nationalAttackerShield: number;
  attackMultiplier: number;
  defenseMultiplier: number;
  availabilityFactor?: number;
}): CommanderAttackerCombatProjectionV2 {
  const availability = clamp(input.availabilityFactor ?? 1, 0, 1);
  const attackMultiplier = 1 + Math.max(0, input.attackMultiplier - 1) * availability;
  const defenseMultiplier = 1 + Math.max(0, input.defenseMultiplier - 1) * availability;
  const attackPressure = Math.max(0, input.nationalAttackPressure)
    * (attackMultiplier - 1);
  const attackerShield = Math.max(0, input.nationalAttackerShield)
    * (defenseMultiplier - 1);
  return {
    // APEX owns no formation strength. This remains zero by contract so it
    // can never affect defeat, capture or stalemate thresholds.
    effectiveStrength: 0,
    attackQuality: attackMultiplier,
    defenseQuality: defenseMultiplier,
    operationMultiplier: 1,
    displayPower: round((attackPressure * 0.55 + attackerShield * 0.45) * 1_000, 3),
    attackPressure,
    attackerShield,
  };
}

function projectCommanderDefenderCombatV2(input: {
  state: WorldStateV2;
  content: WorldContentV2;
  ownerId: PlayerId;
  opponentId: PlayerId;
  sourceId: TerritoryId;
  targetId: TerritoryId;
  nationalDefenseShield: number;
  nationalCounterPressure: number;
  attackMultiplier: number;
  defenseMultiplier: number;
}): CommanderDefenderCombatProjectionV2 {
  return {
    defensePower: Math.max(0, input.nationalDefenseShield)
      * Math.max(0, input.defenseMultiplier - 1),
    counterPressure: Math.max(0, input.nationalCounterPressure)
      * Math.max(0, input.attackMultiplier - 1),
  };
}

/** Exact loss projection shared by APEX-aware previews and live battles. */
export function projectCommanderAugmentedExchangeV2(input: {
  projection: CombatExchangeProjectionV2;
  access: 'land' | 'naval';
  varianceA: number;
  varianceD: number;
  hasCommanderEffect: boolean;
  nationalAttackPressure: number;
  nationalDefenseShield: number;
  nationalCounterPressure: number;
  nationalAttackerShield: number;
  commanderAttackerStrength: number;
  commanderDefenderStrength: number;
  allyAttackerStrength?: number;
  allyDefenderStrength?: number;
  commanderAttackerPower: number;
  commanderAttackerShield: number;
  commanderDefenderPower: number;
  commanderCounterPressure: number;
}): CommanderAugmentedExchangeProjectionV2 {
  const attackPressure = input.nationalAttackPressure + input.commanderAttackerPower;
  const defenseShield = input.nationalDefenseShield + input.commanderDefenderPower;
  const counterPressure = input.nationalCounterPressure + input.commanderCounterPressure;
  const attackerShield = input.nationalAttackerShield + input.commanderAttackerShield;
  const sourceStrength = input.projection.attackerStrength + input.commanderAttackerStrength
    + Math.max(0, input.allyAttackerStrength ?? 0);
  const targetStrength = input.projection.defenderStrength + input.commanderDefenderStrength
    + Math.max(0, input.allyDefenderStrength ?? 0);
  const attackRatio = sourceStrength <= EPSILON ? 0
    : attackPressure / Math.max(EPSILON, defenseShield);
  const counterRatio = targetStrength <= EPSILON ? 0
    : counterPressure / Math.max(EPSILON, attackerShield);
  const defenderDamageCoefficient = input.projection.defenderStrength > EPSILON
    && input.projection.attackRatio > EPSILON
    ? input.projection.rawDefenderLosses / input.projection.defenderStrength
      / Math.pow(input.projection.attackRatio, COMBAT_POWER_RATIO_EXPONENT)
    : COMBAT_DAMAGE_EFFECTIVENESS * input.varianceA;
  const attackerDamageCoefficient = input.projection.attackerStrength > EPSILON
    && input.projection.counterRatio > EPSILON
    ? input.projection.rawAttackerLosses / input.projection.attackerStrength
      / Math.pow(input.projection.counterRatio, COMBAT_POWER_RATIO_EXPONENT)
    : COMBAT_DAMAGE_EFFECTIVENESS * input.varianceD
      * WAR_ACCESS_CASUALTY_MULTIPLIER[input.access]
      * ATTACKER_MILITARY_LOSS_MULTIPLIER;
  const requestedDefenderLosses = input.hasCommanderEffect
    ? Math.max(0,
      targetStrength * defenderDamageCoefficient
        * Math.pow(Math.max(0, attackRatio), COMBAT_POWER_RATIO_EXPONENT),
    )
    : input.projection.rawDefenderLosses;
  const requestedAttackerLosses = input.hasCommanderEffect
    ? Math.max(0,
      sourceStrength * attackerDamageCoefficient
        * Math.pow(Math.max(0, counterRatio), COMBAT_POWER_RATIO_EXPONENT),
    )
    : input.projection.rawAttackerLosses;
  return {
    attackPressure,
    defenseShield,
    counterPressure,
    attackerShield,
    sourceStrength,
    targetStrength,
    attackRatio,
    counterRatio,
    requestedAttackerLosses,
    requestedDefenderLosses,
  };
}

function nationalDefenseCoordinationV2(
  state: WorldStateV2,
  content: WorldContentV2,
  defenderId: PlayerId,
): {
  coordination: number;
  counterattack: number;
  casualty: number;
} {
  const coordination = selectNationalIqViewV2(state, content, defenderId).logisticsMultiplier;
  return {
    coordination,
    counterattack: coordination,
    casualty: 1 / coordination,
  };
}

const doctrineTactic: Record<OperationDoctrineV2, BattleTactic> = {
  pressure: 'combined-arms',
  breakthrough: 'armored-breakthrough',
  siege: 'siege',
  counteroffensive: 'counterattack',
  consolidation: 'hold-the-line',
};

function truceWeeksRemainingV2(state: WorldStateV2, leftId: PlayerId, rightId: PlayerId): number {
  return state.truces.reduce((weeks, truce) => (
    (truce.leftId === leftId && truce.rightId === rightId)
    || (truce.leftId === rightId && truce.rightId === leftId)
      ? Math.max(weeks, truce.expiresTick - state.tick) : weeks
  ), 0);
}

/** The authoritative national readiness gate used by declarations and live fronts. */
export function aiAttackerIsOffensivelyExhaustedV2(
  state: WorldStateV2,
  attackerId: PlayerId,
): boolean {
  if (isHumanPlayerV2(state, attackerId)) return false;
  const army = selectTerritoriesOfV2(state, attackerId).reduce((total, territory) => ({
    deployed: total.deployed + Math.max(0, territory.army.manpower),
    capacity: total.capacity + Math.max(0, territory.army.capacity),
  }), { deployed: 0, capacity: 0 });
  const fillRatio = army.capacity > 0 ? army.deployed / army.capacity : 0;
  return fillRatio <= AI_OFFENSIVE_EXHAUSTION_ARMY_FILL_RATIO;
}

/** Exhausted AI armies cannot continue offensive operations. */
export function aiAttackerMustStandDownV2(
  state: WorldStateV2,
  war: WarStateV2,
): boolean {
  if (isHumanPlayerV2(state, war.attackerId)) return false;
  if (war.attackerId === ROGUE_AI_NATION_ID_V2
    && isPermanentRogueWarV2(state, war)) return false;
  return aiAttackerIsOffensivelyExhaustedV2(state, war.attackerId);
}

/** Countries currently defending themselves against the proposed target are
 * beneficiaries of a counterattack, not co-belligerents. The new attacker
 * fights the aggressor in a separate bilateral war and never inherits a war
 * against those protected defenders. */
function defensiveInterventionProtectedIdsV2(
  state: WorldStateV2,
  attackerId: PlayerId,
  defenderId: PlayerId,
): PlayerId[] {
  return [...new Set(state.wars
    .filter((war) => war.attackerId === defenderId
      && war.defenderId !== attackerId
      && !selectIsEliminatedV2(state, war.defenderId))
    .map((war) => war.defenderId))]
    .sort((left, right) => left.localeCompare(right));
}

function defensiveInterventionLinkedWarV2(
  state: WorldStateV2,
  attackerId: PlayerId,
  defenderId: PlayerId,
  escalatedFromWarId?: string,
): WarStateV2 | undefined {
  const explicit = escalatedFromWarId
    ? state.wars.find((war) => war.id === escalatedFromWarId) : undefined;
  if (explicit?.attackerId === defenderId && explicit.defenderId !== attackerId) return explicit;
  return state.wars.filter((war) => war.attackerId === defenderId
    && war.defenderId !== attackerId)
    .sort((left, right) => left.startedTick - right.startedTick
      || left.id.localeCompare(right.id))[0];
}

/** Other powers already attacking the same target become theatre rivals. A
 * linked regional intervention may name one existing belligerent as the side
 * being helped; that ally is intentionally excluded. */
function competingInvaderIdsV2(
  state: WorldStateV2,
  attackerId: PlayerId,
  defenderId: PlayerId,
  escalatedFromWarId?: string,
): PlayerId[] {
  const linkedWar = escalatedFromWarId
    ? state.wars.find((war) => war.id === escalatedFromWarId) : undefined;
  const alliedId = linkedWar && (linkedWar.attackerId === defenderId || linkedWar.defenderId === defenderId)
    ? (linkedWar.attackerId === defenderId ? linkedWar.defenderId : linkedWar.attackerId)
    : undefined;
  return [...new Set(selectWarsOfV2(state, defenderId)
    // Only another country attacking this target is a theatre rival. A country
    // being attacked by the target is exactly the side this declaration aids.
    .flatMap((war) => war.defenderId === defenderId ? [war.attackerId] : [])
    .filter((id) => id !== attackerId && id !== alliedId
      && !selectIsEliminatedV2(state, id)
      && !areAlliedV2(state, attackerId, id)
      && !selectActiveWarBetweenV2(state, attackerId, id)))]
    .sort((left, right) => left.localeCompare(right));
}

/**
 * Rival invaders remain independent actors. A new declaration against an
 * already-contested target therefore keeps the ordinary rival-war rules.
 */
function declarationRivalInvaderIdsV2(
  state: WorldStateV2,
  attackerId: PlayerId,
  defenderId: PlayerId,
  escalatedFromWarId?: string,
): PlayerId[] {
  const rivals = competingInvaderIdsV2(
    state,
    attackerId,
    defenderId,
    escalatedFromWarId,
  );
  return rivals;
}

export function canDeclareWarV2(
  state: WorldStateV2,
  content: WorldContentV2,
  attackerId: PlayerId,
  defenderId: PlayerId,
  escalatedFromWarId?: string,
): boolean {
  return warDeclarationStatusV2(state, content, attackerId, defenderId, escalatedFromWarId).allowed;
}

export function warDeclarationStatusV2(
  state: WorldStateV2,
  content: WorldContentV2,
  attackerId: PlayerId,
  defenderId: PlayerId,
  escalatedFromWarId?: string,
  options: { ignoreCampaignTutorialLock?: boolean } = {},
): WarDeclarationStatusV2 {
  const access = selectWarAccessTypeV2(state, content, attackerId, defenderId);
  const mobilizationCost = access === 'none' ? Number.POSITIVE_INFINITY
    : selectWarMobilizationCostV2(state, content, attackerId, defenderId);
  const army = selectArmyStrengthV2(state, content, attackerId);
  const activeFronts = selectWarsOfV2(state, attackerId).length;
  const armyWarning = army.fillRatio < 0.55
    ? `Only ${Math.round(army.fillRatio * 100)}% of the population-based army cap is currently manned; war remains legal but high risk.`
    : undefined;
  const rivalInvaders = declarationRivalInvaderIdsV2(
    state,
    attackerId,
    defenderId,
    escalatedFromWarId,
  );
  const frontWarning = activeFronts > 0
    ? `Opening front ${activeFronts + 1}: manpower, supply and war funding will be shared across every active war.`
    : undefined;
  const rivalryWarning = rivalInvaders.length > 0
    ? `Contested invasion: entering also opens ${rivalInvaders.length} rival war${rivalInvaders.length === 1 ? '' : 's'} against the other invader${rivalInvaders.length === 1 ? '' : 's'}.`
    : undefined;
  const protectedDefenders = defensiveInterventionProtectedIdsV2(
    state,
    attackerId,
    defenderId,
  );
  const interventionWarning = protectedDefenders.length > 0
    ? `Defensive intervention: you fight ${content.nations[defenderId]?.shortName ?? defenderId} only; ${protectedDefenders.map((id) => content.nations[id]?.shortName ?? id).join(', ')} remain outside this war.`
    : undefined;
  const warning = [interventionWarning, rivalryWarning, frontWarning, armyWarning]
    .filter(Boolean).join(' ') || undefined;
  const status = (allowed: boolean, reason?: string): WarDeclarationStatusV2 => ({
    allowed, reason, warning, access, mobilizationCost,
  });
  const attacker = state.players[attackerId];
  if (!attacker || !state.players[defenderId] || attackerId === defenderId) return status(false, 'Invalid nation pair.');
  if (areHumanTeammatesV2(state, attackerId, defenderId)) {
    return status(false, 'Co-op teammates are permanently on the same side.');
  }
  if (content.metadata?.scenarioId === 'survival') {
    const attackerIsDawnline = isSurvivalDawnlineNationV2(state, attackerId);
    const defenderIsDawnline = isSurvivalDawnlineNationV2(state, defenderId);
    if (attackerIsDawnline && !isRogueAiNationV2(content, defenderId)) {
      return status(false, 'Dawnline engages only the Rogue AI in Survival.');
    }
    if (defenderIsDawnline && !isRogueAiNationV2(content, attackerId)) {
      return status(false, 'The Arctic Dawnline Accord is a protected human ally.');
    }
  }
  if (content.metadata?.scenarioId === 'survival'
    && !isHumanPlayerV2(state, attackerId)
    && !isRogueAiNationV2(content, attackerId)
    && isHumanPlayerV2(state, defenderId)) {
    return status(false, 'Ordinary countries do not initiate wars against human commands in Survival.');
  }
  if (!campaignWarsUnlockedV2(state, content)) {
    return status(false, CAMPAIGN_WAR_LOCK_REASON_V2);
  }
  const storyLockedHuman = options.ignoreCampaignTutorialLock
    ? undefined
    : state.humanPlayerIds.find((playerId) => (
      (playerId === attackerId || playerId === defenderId)
        && !campaignHumanWarsUnlockedV2(state, content, playerId)
    ));
  if (storyLockedHuman) {
    return status(false, CAMPAIGN_HUMAN_WAR_STORY_LOCK_REASON_V2);
  }
  if (selectIsEliminatedV2(state, attackerId) || selectIsEliminatedV2(state, defenderId)) return status(false, 'An eliminated nation cannot fight.');
  if (aiAttackerIsOffensivelyExhaustedV2(state, attackerId)) {
    return status(false, `AI offensive readiness is at or below ${Math.round(AI_OFFENSIVE_EXHAUSTION_ARMY_FILL_RATIO * 100)}% of current army capacity.`);
  }
  if (attacker.treasury < 0) return status(false, 'Repay national debt before declaring a new war.');
  if (selectActiveWarBetweenV2(state, attackerId, defenderId)) return status(false, 'These nations are already at war.');
  if (areAlliedV2(state, attackerId, defenderId)) return status(false, 'Player allies cannot declare war on each other.');
  const truceWeeks = truceWeeksRemainingV2(state, attackerId, defenderId);
  if (truceWeeks > 0) return status(false, `Recent-war cooldown active for ${truceWeeks} more weeks.`);
  const coolingDownRival = rivalInvaders.find((rivalId) => truceWeeksRemainingV2(state, attackerId, rivalId) > 0);
  if (coolingDownRival) return status(false, 'A recent-war cooldown with an existing invader blocks entry into this contested war.');
  if (access === 'none') return status(false, 'No legal land or naval route.');
  return status(true);
}

function applyWarDeclarationAttackerLossV2(
  state: WorldStateV2,
  attackerId: PlayerId,
): number {
  const armies = sortedTerritoryIdsV2(state)
    .filter((territoryId) => state.territories[territoryId]?.owner === attackerId)
    .map((territoryId) => state.territories[territoryId]!.army)
    .filter((army) => army.manpower > 0);
  const deployedBefore = round(
    armies.reduce((sum, army) => sum + Math.max(0, army.manpower), 0),
    9,
  );
  if (deployedBefore <= 0 || armies.length === 0) return 0;

  // Keep every formation proportional at canonical manpower precision. The
  // largest army absorbs only the sub-nanounit rounding remainder so the
  // national loss remains exactly one percent and capacity never changes.
  const anchor = armies.reduce((largest, army) => (
    army.manpower > largest.manpower ? army : largest
  ));
  const deployedAfterTarget = round(
    deployedBefore * (1 - WAR_DECLARATION_ATTACKER_LOSS_SHARE),
    9,
  );
  let otherDeployedAfter = 0;
  for (const army of armies) {
    if (army === anchor) continue;
    army.manpower = round(
      Math.max(0, army.manpower * (1 - WAR_DECLARATION_ATTACKER_LOSS_SHARE)),
      9,
    );
    otherDeployedAfter += army.manpower;
  }
  anchor.manpower = round(clamp(
    deployedAfterTarget - otherDeployedAfter,
    0,
    anchor.manpower,
  ), 9);
  const deployedAfter = round(
    armies.reduce((sum, army) => sum + Math.max(0, army.manpower), 0),
    9,
  );
  const loss = round(Math.max(0, deployedBefore - deployedAfter), 9);
  consumeOpeningArmyBonusLossV2(state, attackerId, loss);
  return loss;
}

/** Small empires can be decided in one gain; large ones expose at most three objectives. */
export function warCampaignCaptureObjectiveV2(opponentTerritoryCount: number): number {
  const count = Math.max(0, Math.floor(opponentTerritoryCount));
  return count <= 1 ? 1 : count <= 4 ? 2 : 3;
}

function createWarCampaignStateV2(
  state: WorldStateV2,
  attackerId: PlayerId,
  defenderId: PlayerId,
  startedTick: number,
): WarCampaignStateV2 {
  return {
    attackerObjective: warCampaignCaptureObjectiveV2(
      selectTerritoriesOfV2(state, defenderId).length,
    ),
    // A counteroffensive is restorative, not a second unbounded invasion.
    defenderObjective: 1,
    attackerCaptures: 0,
    defenderCaptures: 0,
    consolidationUntilTick: startedTick,
    expiresTick: startedTick + WAR_CAMPAIGN_MAX_TICKS,
  };
}

function ensureWarCampaignStateV2(
  state: WorldStateV2,
  war: WarStateV2,
): WarCampaignStateV2 {
  war.campaign ??= createWarCampaignStateV2(
    state,
    war.attackerId,
    war.defenderId,
    war.startedTick,
  );
  return war.campaign;
}

export function declareWarV2(
  state: WorldStateV2,
  content: WorldContentV2,
  attackerId: PlayerId,
  defenderId: PlayerId,
  escalatedFromWarId?: string,
): CommandResultV2 {
  const seriousBilateralWar = content.metadata?.scenarioId === 'standard-2026'
    || content.metadata?.scenarioId === 'survival';
  const effectiveEscalationId = seriousBilateralWar ? undefined : escalatedFromWarId;
  const linkedWar = effectiveEscalationId
    ? state.wars.find((war) => war.id === effectiveEscalationId) : undefined;
  const defensiveInterventionWar = defensiveInterventionLinkedWarV2(
    state,
    attackerId,
    defenderId,
    effectiveEscalationId,
  );
  const declaration = warDeclarationStatusV2(
    state,
    content,
    attackerId,
    defenderId,
    effectiveEscalationId,
  );
  if (!declaration.allowed) return {
    accepted: false,
    reason: declaration.reason ?? 'War is not legal or affordable.',
  };
  const rivalInvaders = seriousBilateralWar ? [] : declarationRivalInvaderIdsV2(
    state, attackerId, defenderId, effectiveEscalationId,
  );
  const canonicalSurvivalHumanRogueDeclaration = isSurvivalStateV2(state)
    && isHumanPlayerV2(state, attackerId)
    && defenderId === ROGUE_AI_NATION_ID_V2;
  const canonicalAttackerId = canonicalSurvivalHumanRogueDeclaration
    ? ROGUE_AI_NATION_ID_V2 : attackerId;
  const canonicalDefenderId = canonicalSurvivalHumanRogueDeclaration
    ? attackerId : defenderId;
  const openWar = (
    newAttackerId: PlayerId,
    newDefenderId: PlayerId,
    declarationInitiatorId: PlayerId = newAttackerId,
  ): void => {
    state.allianceOffers = state.allianceOffers.filter((offer) => !(
      (offer.fromId === newAttackerId && offer.toId === newDefenderId)
      || (offer.fromId === newDefenderId && offer.toId === newAttackerId)
    ));
    const openingDeclarationLosses = applyWarDeclarationAttackerLossV2(
      state,
      declarationInitiatorId,
    );
    const war: WarStateV2 = {
      id: `war-${state.nextWarId++}`,
      attackerId: newAttackerId,
      defenderId: newDefenderId,
      startedTick: state.tick,
      lastBattleTick: state.tick,
      warScore: 0,
      battles: 0,
      attackerLosses: declarationInitiatorId === newAttackerId
        ? openingDeclarationLosses : 0,
      defenderLosses: declarationInitiatorId === newDefenderId
        ? openingDeclarationLosses : 0,
      attackerCivilianLosses: 0,
      defenderCivilianLosses: 0,
      lastPeaceOfferTick: -1_000_000,
      revenge: null,
      campaign: createWarCampaignStateV2(
        state,
        newAttackerId,
        newDefenderId,
        state.tick,
      ),
      apexTelemetryByPlayer: {},
      attackerOperations: [],
      defenderOperations: [],
    };
    ensureApexWarTelemetryV2(state, war, newAttackerId);
    ensureApexWarTelemetryV2(state, war, newDefenderId);
    state.wars.push(war);
    // Publish the one shared front immediately. APEX and the map can stage for
    // it during mobilization instead of discovering the war at its first shot.
    seedDeclaredWarFrontV2(state, content, war);
  };
  // Survival fronts have one canonical orientation. Rogue is always the
  // strategic attacker and the human command is always the defender, even
  // when the player clicks DECLARE WAR first. This keeps the exact selected
  // PUSH FRONT border and the two-axis front controller on the same war.
  openWar(canonicalAttackerId, canonicalDefenderId, attackerId);
  for (const rivalId of rivalInvaders) openWar(attackerId, rivalId);
  if (!isHumanPlayerV2(state, attackerId)) state.aiEscalation.lastWarStartTick = state.tick;
  const rivalryMessage = rivalInvaders.length > 0
    ? ` The contested invasion also opened war with ${rivalInvaders.map((id) => content.nations[id]?.shortName ?? id).join(', ')}.`
    : '';
  const message = (defensiveInterventionWar
    ? `${content.nations[attackerId]?.name ?? attackerId} opened an independent defensive intervention against ${content.nations[defenderId]?.name ?? defenderId}, supporting ${content.nations[defensiveInterventionWar.defenderId]?.name ?? defensiveInterventionWar.defenderId} without entering a war against them.`
    : linkedWar
      ? `The war between ${content.nations[linkedWar.attackerId]?.shortName ?? linkedWar.attackerId} and ${content.nations[linkedWar.defenderId]?.shortName ?? linkedWar.defenderId} escalated as ${content.nations[attackerId]?.name ?? attackerId} intervened against ${content.nations[defenderId]?.name ?? defenderId}.`
    : `${content.nations[attackerId]?.name ?? attackerId} declared war on ${content.nations[defenderId]?.name ?? defenderId}.`) + rivalryMessage;
  addWorldEventV2(state, 'war', 'critical', message, undefined, attackerId);
  return { accepted: true };
}

export interface CoopRouteLogisticsTermsV2 {
  readonly throughputMultiplier: number;
  readonly costPerMillion: number;
}

/**
 * Extra corridor burden beyond the final assault edge. A direct ordinary
 * front therefore retains its historical balance, while each teammate relay
 * is charged through the same authored one-hop logistics model as armies.
 */
export function coopRouteLogisticsTermsV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  route: CoopMilitaryAccessRouteV2,
  includeFinalEdge = false,
): CoopRouteLogisticsTermsV2 {
  const edgeCount = includeFinalEdge
    ? Math.max(0, route.path.length - 1)
    : Math.max(0, route.path.length - 2);
  if (edgeCount === 0) return { throughputMultiplier: 1, costPerMillion: 0 };
  let throughputMultiplier = 1;
  let costPerMillion = 0;
  for (let index = 0; index < edgeCount; index += 1) {
    const terms = internalArmyTransferLogisticsTermsV2(
      state,
      content,
      playerId,
      route.path[index]!,
      route.path[index + 1]!,
      1,
    );
    throughputMultiplier = Math.min(throughputMultiplier, terms.throughputMultiplier);
    costPerMillion += terms.costPerMillion;
  }
  // A long chain cannot preserve one-hop throughput by repeatedly relaying in
  // the same week. This bounded decay is mild on a single ally border and
  // increasingly visible on a multi-country or multi-port corridor.
  throughputMultiplier *= 1 / (1 + 0.10 * Math.max(0, edgeCount - 1));
  return {
    throughputMultiplier: round(clamp(throughputMultiplier, 0.10, 1), 9),
    costPerMillion: round(Math.max(0, costPerMillion), 9),
  };
}

export function supplyFactorV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  sourceId: TerritoryId,
  access: boolean | 'land' | 'naval',
  targetId?: TerritoryId,
  contextOverride?: TraitEvaluationContextV2,
): number {
  const mode = typeof access === 'boolean' ? (access ? 'naval' : 'land') : access;
  void content;
  void playerId;
  void targetId;
  void contextOverride;
  return frontCapacitySupplyQuoteV2(state, sourceId, mode).readiness;
}

/** One authoritative attack/front quote used by combat, forecast and HUD. */
export function frontCapacitySupplyQuoteV2(
  state: WorldStateV2,
  sourceId: TerritoryId,
  access: 'land' | 'naval',
): ArmyCapacitySupplyQuoteV2 {
  const territory = state.territories[sourceId];
  if (!territory) return quoteArmyCapacitySupplyV2(0, 0, access);
  const operationalCapacity = Math.max(
    0,
    territory.army.capacity,
    territory.army.manpower,
  );
  return quoteArmyCapacitySupplyV2(
    operationalCapacity,
    territory.army.manpower,
    access,
  );
}

function supportCountV2(state: WorldStateV2, content: WorldContentV2, sourceId: TerritoryId, owner: PlayerId): number {
  const sourceStrength = selectArmyCombatManpowerV2(state, owner, state.territories[sourceId]!.army);
  return (content.territories[sourceId]?.connections ?? []).filter((edge) => {
    if (!isWorldConnectionOpenV2(state, sourceId, edge.targetId)) return false;
    const territory = state.territories[edge.targetId];
    if (territory?.owner !== owner) return false;
    const deployed = selectArmyCombatManpowerV2(state, owner, territory.army);
    // Empty capacity is infrastructure, not a combat penalty. A neighbouring
    // army supports the front according to soldiers actually present.
    return deployed > 0 && deployed >= sourceStrength * 0.10;
  }).length;
}

/**
 * Canonical, side-effect-free projection for one combat pulse. Forecasts and
 * live resolution deliberately share this function so a displayed advantage
 * cannot turn into an inverted casualty percentage once the battle starts.
 */
export function projectCombatExchangeV2(
  state: WorldStateV2,
  content: WorldContentV2,
  attackerId: PlayerId,
  defenderId: PlayerId,
  sourceId: TerritoryId,
  targetId: TerritoryId,
  access: 'land' | 'naval',
  varianceA = 1,
  varianceD = 1,
  militaryBaseSnapshot: MilitaryBaseSnapshotV2 = createMilitaryBaseSnapshotV2(state, content),
): CombatExchangeProjectionV2 | undefined {
  const source = state.territories[sourceId];
  const target = state.territories[targetId];
  const terrain = content.territories[targetId]?.terrain;
  if (!source || !target || !terrain || source.owner !== attackerId || target.owner !== defenderId) return undefined;
  const terrainDefenseMultiplier = territoryTerrainDefenseMultiplierV2(content, targetId);

  const attackerTraitContext = combatSideTraitContextV2(
    state, content, attackerId, sourceId, 'attacker', access,
  );
  const defenderTraitContext = combatSideTraitContextV2(
    state, content, defenderId, targetId, 'defender', access,
  );
  const attackerSupplyQuote = frontCapacitySupplyQuoteV2(state, sourceId, access);
  const attackerSupply = attackerSupplyQuote.readiness;
  // Defenders retain the existing local-land physical supply calculation, but
  // trait access sees the actual incoming front (land or naval).
  const defenderSupplyQuote = frontCapacitySupplyQuoteV2(state, targetId, 'land');
  const defenderSupply = defenderSupplyQuote.readiness;
  // Only the physical formations stationed on this border fight. Rear armies
  // can arrive through logistics, but never grant an abstract adjacency bonus.
  const supportingForces = 0;
  const resistance = resistanceCombatMultiplierV2(state, attackerId, defenderId);
  const defensiveCoordination = nationalDefenseCoordinationV2(state, content, defenderId);
  const attackerNorthPole = selectNorthPoleModifiersV2(state, attackerId);
  const defenderNorthPole = selectNorthPoleModifiersV2(state, defenderId);
  const antarcticOperation = content.territories[sourceId]?.kind !== undefined
    && content.territories[sourceId]?.kind !== 'sovereign'
    || content.territories[targetId]?.kind !== undefined
      && content.territories[targetId]?.kind !== 'sovereign';
  const attackerRogueAttack = defenderId === ROGUE_AI_NATION_ID_V2
    ? attackerNorthPole.attackVsRogueMultiplier : 1;
  const attackerRogueDefense = defenderId === ROGUE_AI_NATION_ID_V2
    ? attackerNorthPole.defenseVsRogueMultiplier : 1;
  const defenderRogueAttack = attackerId === ROGUE_AI_NATION_ID_V2
    ? defenderNorthPole.attackVsRogueMultiplier : 1;
  const defenderRogueDefense = attackerId === ROGUE_AI_NATION_ID_V2
    ? defenderNorthPole.defenseVsRogueMultiplier : 1;
  const attackerPolarOperation = antarcticOperation
    ? attackerNorthPole.antarcticOperationMultiplier : 1;
  const defenderPolarOperation = antarcticOperation
    ? defenderNorthPole.antarcticOperationMultiplier : 1;
  const attackerAttack = selectEffectiveAttackV2(
    state, content, attackerId, source.army, militaryBaseSnapshot,
  ) * countryTraitFactorV2(attackerId, 'attack', attackerTraitContext)
    * attackerRogueAttack * attackerPolarOperation;
  const attackerDefense = selectEffectiveDefenseV2(
    state, content, attackerId, source.army, militaryBaseSnapshot,
  ) * countryTraitFactorV2(attackerId, 'defense', attackerTraitContext)
    * attackerRogueDefense * attackerPolarOperation;
  const defenderAttack = selectEffectiveAttackV2(
    state, content, defenderId, target.army, militaryBaseSnapshot,
  ) * countryTraitFactorV2(defenderId, 'attack', defenderTraitContext)
    * defenderRogueAttack * defenderPolarOperation;
  const defenderDefense = selectEffectiveDefenseV2(
    state, content, defenderId, target.army, militaryBaseSnapshot,
  ) * countryTraitFactorV2(defenderId, 'defense', defenderTraitContext)
    * defenderRogueDefense * defenderPolarOperation;
  const attackerCombatDefense = combatDefenseEffectV2(attackerDefense, defenderAttack);
  const defenderCombatDefense = combatDefenseEffectV2(defenderDefense, attackerAttack);
  // The 8%/4% quote is the supply requirement for this battle, not an
  // artificial deletion of the soldiers already deployed on the front.
  // Readiness scales their effectiveness once; naval supply is therefore not
  // halved a second time inside combat.
  const attackerStrength = selectArmyCombatManpowerV2(state, attackerId, source.army);
  const defenderStrength = selectArmyCombatManpowerV2(state, defenderId, target.army);
  const survivalRogueAssault = isSurvivalStateV2(state)
    && attackerId === ROGUE_AI_NATION_ID_V2;
  const gatewayBreakout = survivalRogueAssault
    && antarcticGatewayForConnectionV2(sourceId, targetId) !== null;
  const survivalRogueAssaultMultiplier = gatewayBreakout
    ? SURVIVAL_ROGUE_GATEWAY_BREAKOUT_ASSAULT_MULTIPLIER_V2
    : survivalRogueAssault ? SURVIVAL_ROGUE_ASSAULT_MULTIPLIER_V2 : 1;
  const survivalRogueProtectionMultiplier = gatewayBreakout
    ? SURVIVAL_ROGUE_GATEWAY_BREAKOUT_PROTECTION_MULTIPLIER_V2
    : survivalRogueAssault ? SURVIVAL_ROGUE_FRONT_PROTECTION_MULTIPLIER_V2 : 1;

  const attackPressure = attackerStrength * attackerAttack
    * attackerSupply * resistance.attacker * WAR_ACCESS_ASSAULT_MULTIPLIER[access]
    * survivalRogueAssaultMultiplier;
  const defenseShield = defenderStrength * defenderCombatDefense * DEFENDER_POSITION_MULTIPLIER
    * terrainDefenseMultiplier
    * defenderSupply * resistance.defender * defensiveCoordination.coordination;
  const counterPressure = defenderStrength <= 0 ? 0 : defenderStrength * defenderAttack
    * defenderSupply * defensiveCoordination.counterattack
    * DEFENDER_COUNTERFIRE_MULTIPLIER;
  const attackerShield = attackerStrength * attackerCombatDefense * attackerSupply
    * survivalRogueProtectionMultiplier;
  const attackRatio = attackerStrength <= 0 ? 0
    : attackPressure / Math.max(0.000001, defenseShield);
  const counterRatio = defenderStrength <= 0 ? 0
    : counterPressure / Math.max(0.000001, attackerShield);

  const attackerCasualtyLevel = state.players[attackerId]!.research.effectLevels['casualty-reduction'];
  const defenderCasualtyLevel = state.players[defenderId]!.research.effectLevels['casualty-reduction'];
  const attackerMastery = selectTerritoryCountryMasteryRuntimeV2(
    content,
    sourceId,
    attackerId,
  );
  const defenderMastery = selectTerritoryCountryMasteryRuntimeV2(
    content,
    targetId,
    defenderId,
  );
  const attackerCasualtyModifier = (1 - 0.50 * attackerCasualtyLevel / (attackerCasualtyLevel + 30))
    * selectRunModifiersV2(state, attackerId).regularCasualtyMultiplier
    * attackerMastery.casualtyMultiplier
    * countryTraitFactorV2(attackerId, 'military-casualties', attackerTraitContext);
  const defenderCasualtyModifier = (1 - 0.50 * defenderCasualtyLevel / (defenderCasualtyLevel + 30))
    * selectRunModifiersV2(state, defenderId).regularCasualtyMultiplier
    * defenderMastery.casualtyMultiplier
    * defensiveCoordination.casualty
    * countryTraitFactorV2(defenderId, 'military-casualties', defenderTraitContext);
  // The two local formations generate the raw exchange. A single, symmetric
  // ten-percent Empire-cap ceiling is then applied to each receiving side.
  const rawDefenderLosses = defenderStrength <= 0 ? 0
    : defenderStrength * COMBAT_DAMAGE_EFFECTIVENESS * Math.pow(
      Math.max(0, attackRatio), COMBAT_POWER_RATIO_EXPONENT,
    ) * varianceA * defenderCasualtyModifier;
  const rawAttackerLosses = attackerStrength <= 0 || counterPressure <= 0 ? 0
    : attackerStrength * COMBAT_DAMAGE_EFFECTIVENESS * Math.pow(
      Math.max(0, counterRatio), COMBAT_POWER_RATIO_EXPONENT,
    ) * varianceD * WAR_ACCESS_CASUALTY_MULTIPLIER[access]
      * ATTACKER_MILITARY_LOSS_MULTIPLIER * attackerCasualtyModifier;
  const attackerEmpireCapacity = Math.max(
    0,
    militaryBaseSnapshot.armyCapacityByNation.get(attackerId) ?? 0,
  );
  const defenderEmpireCapacity = Math.max(
    0,
    militaryBaseSnapshot.armyCapacityByNation.get(defenderId) ?? 0,
  );
  const attackerHit = resolveFrontlineHitV2({
    requestedBaseDamage: rawAttackerLosses,
    frontlineManpower: attackerStrength,
    empireArmyCapacity: attackerEmpireCapacity,
  });
  const defenderHit = resolveFrontlineHitV2({
    requestedBaseDamage: rawDefenderLosses,
    frontlineManpower: defenderStrength,
    empireArmyCapacity: defenderEmpireCapacity,
  });
  const attackerLosses = attackerHit.totalDamage;
  const defenderLosses = defenderHit.totalDamage;
  const defenderLossRate = defenderStrength > 0 ? defenderLosses / defenderStrength : 0;
  const attackerLossRate = attackerStrength > 0 ? attackerLosses / attackerStrength : 0;

  return {
    attackerStrength,
    defenderStrength,
    attackerAttack,
    attackerDefense,
    defenderAttack,
    defenderDefense,
    attackerSupply,
    defenderSupply,
    supportingForces,
    attackPressure,
    defenseShield,
    counterPressure,
    attackerShield,
    attackRatio,
    counterRatio,
    attackerLossRate,
    defenderLossRate,
    attackerEmpireCapacity,
    defenderEmpireCapacity,
    rawAttackerLosses,
    rawDefenderLosses,
    attackerHitCap: attackerHit.hitCap,
    defenderHitCap: defenderHit.hitCap,
    attackerLosses,
    defenderLosses,
  };
}

function frontCandidatesV2(
  state: WorldStateV2,
  content: WorldContentV2,
  commanderId: PlayerId,
  enemyId: PlayerId,
  militaryBaseSnapshot: MilitaryBaseSnapshotV2 = createMilitaryBaseSnapshotV2(state, content),
): FrontCandidateV2[] {
  const capital = state.players[enemyId]?.capitalId;
  const candidates: FrontCandidateV2[] = [];
  const sources = selectTerritoriesOfV2(state, commanderId);
  const nationalStrength = Math.max(0.000001, nationalCombatManpowerV2(state, commanderId));
  const addCandidate = (
    source: (typeof sources)[number],
    route: CoopMilitaryAccessRouteV2,
  ) => {
      const { targetId, access } = route;
      const target = state.territories[targetId];
      if (!target || target.owner !== enemyId) return;
      const sourceStrength = selectArmyCombatManpowerV2(state, commanderId, source.army);
      const supply = supplyFactorV2(state, content, commanderId, source.id, access, targetId);
      const relayTerms = coopRouteLogisticsTermsV2(
        state,
        content,
        commanderId,
        route,
      );
      const assaultTerms = coopRouteLogisticsTermsV2(
        state,
        content,
        commanderId,
        route,
        true,
      );
      const support = Math.min(4, supportCountV2(state, content, source.id, commanderId));
      const targetStrength = selectArmyCombatManpowerV2(state, enemyId, target.army);
      const targetCapacity = armyCombatCapacityV2(state, enemyId, target.army);
      const targetFill = targetStrength / Math.max(1e-9, targetCapacity);
      const economyValue = Math.log10(1 + target.economy);
      const capitalValue = capital === targetId ? 4 : 0;
      const powerRatio = selectTerritoryPowerV2(state, content, source.id, militaryBaseSnapshot)
        / Math.max(1, selectTerritoryPowerV2(state, content, targetId, militaryBaseSnapshot));
      const commitmentShare = sourceStrength / nationalStrength;
      // A source that would be routed on contact remains a legal last resort,
      // but can never outrank a locally viable front elsewhere in the empire.
      const viable = targetStrength <= 0.000001
        || sourceStrength > targetStrength * COMBAT_ROUTE_STRENGTH_RATIO;
      // Once a beachhead exists, adjacent land continuation is the ordinary
      // front. A naval operation remains legal, but cannot displace a viable
      // contiguous front merely because its target happens to be weaker.
      const routeKm = route.distanceKm;
      const accessPenalty = access === 'naval'
        ? 8 + 4 * Math.log2(1 + routeKm / 1_000) : 0;
      const relayPenalty = Math.max(0, route.hopCount - 1) * 1.5
        + (1 - relayTerms.throughputMultiplier) * 6;
      const score = 5 * supply + support + 4 * (1 - targetFill) + economyValue
        + capitalValue + 2 * clamp(powerRatio, 0, 2)
        + 4 * Math.sqrt(clamp(commitmentShare, 0, 1)) - accessPenalty - relayPenalty;
      candidates.push({
        sourceId: source.id,
        targetId,
        access,
        routePath: route.path,
        routeDistanceKm: route.distanceKm,
        routeHopCount: route.hopCount,
        routeThroughputMultiplier: relayTerms.throughputMultiplier,
        assaultThroughputMultiplier: assaultTerms.throughputMultiplier,
        routeCostPerMillion: relayTerms.costPerMillion,
        score,
        viable,
      });
  };
  const combatSources = sources.filter((source) => (
    selectArmyCombatManpowerV2(state, commanderId, source.army) > 0
  ));
  const sourceById = new Map(combatSources.map((source) => [source.id, source]));
  for (const route of selectCoopMilitaryAccessRoutesV2(
    state,
    content,
    commanderId,
    enemyId,
    combatSources.map((source) => source.id),
  )) {
    const source = sourceById.get(route.sourceId);
    if (source) addCandidate(source, route);
  }
  return candidates.sort((a, b) => Number(b.viable) - Number(a.viable)
    || Number(b.access === 'land') - Number(a.access === 'land')
    || b.score - a.score || a.sourceId.localeCompare(b.sourceId) || a.targetId.localeCompare(b.targetId));
}

/**
 * Stale-war cleanup only needs to know whether one formation can reach the
 * opponent. Building scored front candidates here used to create two complete
 * world military snapshots per active war, every week, even between battle
 * pulses. Survival's permanent machine front therefore paid the most expensive
 * part of initiative selection while nothing could fight.
 *
 * Keep this predicate structurally identical to the access portion of
 * frontCandidatesV2: only deployed combat manpower is a source and co-op uses
 * the same authored friendly-transit routes. Power, supply and target scoring
 * remain deferred to the real initiative review.
 */
export function hasLegalWarFrontV2(
  state: WorldStateV2,
  content: WorldContentV2,
  commanderId: PlayerId,
  enemyId: PlayerId,
): boolean {
  const combatSourceIds = selectTerritoriesOfV2(state, commanderId)
    .filter((source) => selectArmyCombatManpowerV2(
      state,
      commanderId,
      source.army,
    ) > 0)
    .map((source) => source.id);
  if (combatSourceIds.length === 0) return false;
  return selectCoopMilitaryAccessRoutesV2(
    state,
    content,
    commanderId,
    enemyId,
    combatSourceIds,
  ).length > 0;
}

function prospectiveFrontCountV2(state: WorldStateV2, playerId: PlayerId, opponentId: PlayerId): number {
  const active = selectWarsOfV2(state, playerId);
  return Math.max(1, active.length
    + (active.some((war) => war.attackerId === opponentId || war.defenderId === opponentId) ? 0 : 1));
}

/** Compatibility selector: the retired reserve pool gives no forecast edge. */
export function strategicReserveReadinessMultiplierV2(
  trainedReserves: number,
  activeCapacity: number,
): number {
  void trainedReserves;
  void activeCapacity;
  return 1;
}

interface ForecastOwnedRouteV2 {
  readonly territoryId: TerritoryId;
  readonly hopCount: number;
  readonly seaHops: number;
  readonly navalDistanceKm: number;
  readonly penalty: number;
  readonly pathKey: string;
}

function forecastRoutePenaltyV2(
  hopCount: number,
  seaHops: number,
  navalDistanceKm: number,
): number {
  return 0.10 * hopCount
    + (seaHops > 0 ? 0.70 : 0)
    + 0.25 * Math.max(0, seaHops - 1)
    + 0.40 * Math.max(0, navalDistanceKm) / 12_000;
}

function compareForecastOwnedRouteV2(
  left: ForecastOwnedRouteV2,
  right: ForecastOwnedRouteV2,
): number {
  return left.penalty - right.penalty
    || left.seaHops - right.seaHops
    || left.navalDistanceKm - right.navalDistanceKm
    || left.hopCount - right.hopCount
    || left.pathKey.localeCompare(right.pathKey);
}

/**
 * Finds the best real logistics path from every owned formation into one
 * proposed front. The reverse search follows only authored, currently open
 * connections and never treats a neutral, allied or hostile country as free
 * national manpower. Its bounded positive route cost makes the result stable
 * across previews, clients and repeated calls.
 */
function forecastOwnedRoutesToFrontV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  frontId: TerritoryId,
): ReadonlyMap<TerritoryId, ForecastOwnedRouteV2> {
  if (state.territories[frontId]?.owner !== playerId) return new Map();
  const ownedIds = selectTerritoriesOfV2(state, playerId)
    .map((territory) => territory.id)
    .sort((left, right) => left.localeCompare(right));
  const owned = new Set(ownedIds);
  const incoming = new Map<TerritoryId, Array<{
    sourceId: TerritoryId;
    kind: 'land' | 'sea';
    distanceKm: number;
  }>>();
  for (const sourceId of ownedIds) {
    for (const edge of content.territories[sourceId]?.connections ?? []) {
      if (!owned.has(edge.targetId)
        || !isWorldConnectionOpenV2(state, sourceId, edge.targetId)) continue;
      const edges = incoming.get(edge.targetId) ?? [];
      edges.push({
        sourceId,
        kind: edge.kind,
        distanceKm: edge.kind === 'sea'
          ? Math.max(0, edge.distanceKm ?? NAVAL_ROUTE_BASE_DISTANCE_KM)
          : 0,
      });
      incoming.set(edge.targetId, edges);
    }
  }
  for (const edges of incoming.values()) {
    edges.sort((left, right) => left.sourceId.localeCompare(right.sourceId)
      || left.kind.localeCompare(right.kind)
      || left.distanceKm - right.distanceKm);
  }

  const origin: ForecastOwnedRouteV2 = {
    territoryId: frontId,
    hopCount: 0,
    seaHops: 0,
    navalDistanceKm: 0,
    penalty: 0,
    pathKey: frontId,
  };
  const best = new Map<TerritoryId, ForecastOwnedRouteV2>([[frontId, origin]]);
  const queue: ForecastOwnedRouteV2[] = [origin];
  while (queue.length > 0) {
    queue.sort(compareForecastOwnedRouteV2);
    const current = queue.shift()!;
    if (best.get(current.territoryId) !== current) continue;
    for (const edge of incoming.get(current.territoryId) ?? []) {
      const hopCount = current.hopCount + 1;
      const seaHops = current.seaHops + Number(edge.kind === 'sea');
      const navalDistanceKm = current.navalDistanceKm + edge.distanceKm;
      const candidate: ForecastOwnedRouteV2 = {
        territoryId: edge.sourceId,
        hopCount,
        seaHops,
        navalDistanceKm,
        penalty: forecastRoutePenaltyV2(hopCount, seaHops, navalDistanceKm),
        pathKey: `${edge.sourceId}>${current.pathKey}`,
      };
      const existing = best.get(edge.sourceId);
      if (existing && compareForecastOwnedRouteV2(existing, candidate) <= 0) continue;
      best.set(edge.sourceId, candidate);
      queue.push(candidate);
    }
  }
  return best;
}

interface ForecastFrontRouteV2 {
  readonly access: 'land' | 'naval';
  readonly distanceKm: number;
  readonly hopCount: number;
  readonly throughputMultiplier: number;
}

/** Cheap strategic layer for the forecast: only formations that can actually
 * feed this exact front count. Land, naval distance, relays, local readiness,
 * field allocation and treasury runway all stay bounded and side-effect free. */
function strategicReadinessV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  opponentId: PlayerId,
  frontId: TerritoryId,
  frontRoute: ForecastFrontRouteV2,
  militaryBaseSnapshot: MilitaryBaseSnapshotV2 = createMilitaryBaseSnapshotV2(state, content),
): number {
  const routes = forecastOwnedRoutesToFrontV2(state, content, playerId, frontId);
  let deployablePower = 0;
  for (const territoryId of [...routes.keys()].sort((left, right) => left.localeCompare(right))) {
    const route = routes.get(territoryId)!;
    const territoryPower = selectTerritoryPowerV2(
      state,
      content,
      territoryId,
      militaryBaseSnapshot,
    );
    if (territoryPower <= EPSILON) continue;
    const routeUsesSea = route.seaHops > 0 || frontRoute.access === 'naval';
    const supplyAccess = routeUsesSea ? 'naval' as const : 'land' as const;
    const readiness = frontCapacitySupplyQuoteV2(state, territoryId, supplyAccess).readiness;
    const internalThroughput = route.seaHops > 0 ? 0.5 : 1;
    const throughput = Math.min(
      internalThroughput,
      clamp(frontRoute.throughputMultiplier, 0.10, 1),
    );
    // The assault quote already prices its own relays. Rear formations receive
    // only the additional owned-hop decay needed to reach that staging point.
    const internalTempo = 1 / (1 + 0.10 * route.hopCount);
    const navalDistanceKm = route.navalDistanceKm
      + (frontRoute.access === 'naval' ? Math.max(0, frontRoute.distanceKm) : 0);
    const distanceTempo = 1 / (1 + 0.50 * navalDistanceKm / 12_000);
    deployablePower += territoryPower * readiness * throughput
      * internalTempo * distanceTempo;
  }
  const economy = selectNationalEconomyV2(state, content, playerId);
  const treasuryRunway = clamp(state.players[playerId]!.treasury
    / Math.max(0.001, economy.weeklyRevenue), -2, 8);
  const funding = 0.85 + 0.15 * clamp((treasuryRunway + 2) / 10, 0, 1);
  const fronts = prospectiveFrontCountV2(state, playerId, opponentId);
  const allocation = 1 / (1 + 0.55 * (fronts - 1));
  return Math.max(EPSILON, deployablePower * funding * allocation);
}

function pulsesUntilEliminatedV2(
  ownStrength: number,
  projectedLosses: number,
): number {
  const captureThreshold = 0.000000001;
  if (ownStrength <= captureThreshold) return 1;
  if (projectedLosses <= 0) return Number.POSITIVE_INFINITY;
  // With a power-ratio exponent of one, damage is primarily absolute opposing
  // pressure. Project the first-order number of equal exchanges to zero rather
  // than compounding the opening percentage loss toward an artificial tail.
  return Math.max(1, Math.ceil(ownStrength / projectedLosses));
}

export function forecastWarV2(
  state: WorldStateV2,
  content: WorldContentV2,
  attackerId: PlayerId,
  defenderId: PlayerId,
  militaryBaseSnapshot: MilitaryBaseSnapshotV2 = createMilitaryBaseSnapshotV2(state, content),
): WarForecastV2 {
  const noApex = (reason = 'No operational APEX shield is available.'): ApexForecastContributionV2 => ({
    status: 'absent',
    stagingTerritoryId: null,
    power: 0,
    effectivePower: 0,
    attackMultiplier: 1,
    defenseMultiplier: 1,
    supportBonusPercent: 0,
    projectedAttackPressure: 0,
    projectedDefenseShield: 0,
    projectedPulseDamage: 0,
    chanceDelta: 0,
    etaWeeks: null,
    readiness: 0,
    supplyReadiness: 0,
    reason,
  });
  const access = selectWarAccessTypeV2(state, content, attackerId, defenderId);
  const candidate = frontCandidatesV2(
    state, content, attackerId, defenderId, militaryBaseSnapshot,
  )[0];
  const fallback = (winChance: number): WarForecastV2 => ({
    attackerId, defenderId, access, winChance,
    outlook: winChance >= 82 ? 'dominant' : winChance >= 64 ? 'favored'
      : winChance >= 42 ? 'contested' : winChance >= 22 ? 'risky' : 'desperate',
    attackerStrength: 0, defenderStrength: 0,
    defenderEmpireStrength: 0,
    defenderEmpireSupport: 0,
    defenderTerritoryCount: selectTerritoriesOfV2(state, defenderId).length,
    retaliationExpected: false,
    attackerAttack: 0, attackerDefense: 0, defenderAttack: 0, defenderDefense: 0,
    attackerSupply: 0, defenderSupply: 0,
    supportingForces: 0,
    defenderPositionMultiplier: DEFENDER_POSITION_MULTIPLIER,
    terrainDefenseMultiplier: 1,
    projectedAttackerLosses: 0, projectedDefenderLosses: 0,
    projectedAttackerLossRate: 0, projectedDefenderLossRate: 0,
    estimatedWeeksMin: 0, estimatedWeeksMax: 0,
    apexContribution: noApex(),
  });
  if (!candidate || access === 'none') return fallback(0);
  const source = state.territories[candidate.sourceId]!;
  const target = state.territories[candidate.targetId]!;
  const terrain = content.territories[candidate.targetId]!.terrain;
  const attackerStrength = selectArmyCombatManpowerV2(state, attackerId, source.army);
  const defenderStrength = selectArmyCombatManpowerV2(state, defenderId, target.army);
  const forecastVarianceA = battleDamageMeanV2(0);
  const forecastVarianceD = battleDamageMeanV2(0);
  const projection = projectCombatExchangeV2(
    state, content, attackerId, defenderId,
    candidate.sourceId, candidate.targetId, candidate.access,
    forecastVarianceA, forecastVarianceD, militaryBaseSnapshot,
  );
  if (!projection) return fallback(0);
  const terrainDefenseMultiplier = territoryTerrainDefenseMultiplierV2(content, candidate.targetId);
  const attritionEdge = projection.attackerLossRate <= 0
    ? (projection.defenderLossRate > 0 ? 20 : 1)
    : projection.defenderLossRate / projection.attackerLossRate;
  const attackerStrategicReadiness = strategicReadinessV2(
    state,
    content,
    attackerId,
    defenderId,
    candidate.sourceId,
    {
      access: candidate.access,
      distanceKm: candidate.routeDistanceKm,
      hopCount: candidate.routeHopCount,
      throughputMultiplier: candidate.assaultThroughputMultiplier,
    },
    militaryBaseSnapshot,
  );
  const defenderStrategicReadiness = strategicReadinessV2(
    state,
    content,
    defenderId,
    attackerId,
    candidate.targetId,
    {
      access: 'land',
      distanceKm: 0,
      hopCount: 0,
      throughputMultiplier: 1,
    },
    militaryBaseSnapshot,
  );
  const strategicEdge = attackerStrategicReadiness / defenderStrategicReadiness;
  const defenderTerritories = selectTerritoriesOfV2(state, defenderId);
  const defenderTerritoryCount = defenderTerritories.length;
  const defenderEmpireStrength = nationalCombatManpowerV2(state, defenderId);
  const defenderEmpireSupport = defenderTerritories.reduce((sum, territory) => (
    sum + Math.max(0,
      stateTerritoryArmySupportCeilingV2(state, content, territory.id, defenderId)
      - stateTerritoryArmyCapacityTargetV2(state, content, territory.id, defenderId))
  ), 0);
  const retaliationExpected = defenderTerritoryCount > 1;
  // This is a campaign forecast, not merely the first border exchange. The
  // full national readiness now carries almost half the estimate, while a
  // multi-territory empire's reinforcement room and guaranteed bounded
  // retaliation add real campaign depth. A locally empty border can therefore
  // no longer produce an automatic 95% against an otherwise capable empire.
  const tacticalEdge = clamp(attritionEdge, 0.08, 8);
  const campaignDepth = Math.log2(Math.max(1, defenderTerritoryCount));
  const supportDepth = defenderEmpireSupport / Math.max(
    0.000001,
    defenderEmpireStrength + defenderEmpireSupport,
  );
  const defenderCampaignMultiplier = 1
    + 0.10 * campaignDepth
    + 0.08 * clamp(supportDepth, 0, 1)
    + (retaliationExpected ? 0.12 : 0);
  const combinedRatio = tacticalEdge ** 0.54
    * clamp(strategicEdge, 0.05, 20) ** 0.46
    / defenderCampaignMultiplier;
  // One decimal preserves real ATK/DEF movement that whole-percent rounding
  // can hide. Multi-territory campaigns retain extra uncertainty because the
  // attacker must survive the defender's one-shot retaliation opportunity.
  const maximumChance = retaliationExpected ? 92 : 95;
  const baseWinChance = round(clamp(50 + Math.log(combinedRatio) * 24, 5, maximumChance), 1);
  const defeatPulses = pulsesUntilEliminatedV2(
    defenderStrength, projection.defenderLosses,
  );
  const retreatPulses = pulsesUntilEliminatedV2(
    attackerStrength, projection.attackerLosses,
  );
  const decisivePulses = Math.min(defeatPulses, retreatPulses);
  const battleIntervalTicks = campaignProspectiveWarBattleIntervalTicksV2(
    state,
    content,
    attackerId,
    defenderId,
  );
  const centralWeeks = Number.isFinite(decisivePulses)
    ? clamp(battleIntervalTicks * decisivePulses, 4, WAR_CAMPAIGN_MAX_TICKS)
    : WAR_CAMPAIGN_MAX_TICKS;
  const mobility = selectCommanderForecastMobilityV2(
    state,
    content,
    attackerId,
    candidate.sourceId,
  );
  const delayFactor = mobility.etaWeeks === null ? 0
    : clamp(1 - mobility.etaWeeks / Math.max(1, centralWeeks), 0, 1);
  const availabilityFactor = (mobility.status === 'ready' || mobility.status === 'delayed')
    ? delayFactor : 0;
  const defenderMobility = selectCommanderForecastMobilityV2(
    state,
    content,
    defenderId,
    candidate.targetId,
  );
  const defenderDelayFactor = defenderMobility.etaWeeks === null ? 0
    : clamp(1 - defenderMobility.etaWeeks / Math.max(1, centralWeeks), 0, 1);
  const defenderAvailabilityFactor = (
    defenderMobility.status === 'ready' || defenderMobility.status === 'delayed'
  ) ? defenderDelayFactor : 0;
  const strategicApexMultiplier = (
    forecastMobility: typeof mobility,
    availableShare: number,
  ): number => 1 + (
    Math.max(0, forecastMobility.attackMultiplier - 1) * 0.55
      + Math.max(0, forecastMobility.defenseMultiplier - 1) * 0.45
  ) * availableShare;
  const strategicEdgeWithApex = strategicEdge
    * strategicApexMultiplier(mobility, availabilityFactor)
    / strategicApexMultiplier(defenderMobility, defenderAvailabilityFactor);
  const apexCombat = projectCommanderAttackerCombatV2({
    state,
    content,
    ownerId: attackerId,
    opponentId: defenderId,
    sourceId: candidate.sourceId,
    targetId: candidate.targetId,
    access: candidate.access,
    nationalAttackPressure: projection.attackPressure,
    nationalAttackerShield: projection.attackerShield,
    attackMultiplier: mobility.attackMultiplier,
    defenseMultiplier: mobility.defenseMultiplier,
    availabilityFactor,
  });
  const apexExchange = projectCommanderAugmentedExchangeV2({
    projection,
    access: candidate.access,
    varianceA: forecastVarianceA,
    varianceD: forecastVarianceD,
    hasCommanderEffect: availabilityFactor > EPSILON
      && (mobility.attackMultiplier > 1 || mobility.defenseMultiplier > 1),
    nationalAttackPressure: projection.attackPressure,
    nationalDefenseShield: projection.defenseShield,
    nationalCounterPressure: projection.counterPressure,
    nationalAttackerShield: projection.attackerShield,
    commanderAttackerStrength: apexCombat.effectiveStrength,
    commanderDefenderStrength: 0,
    commanderAttackerPower: apexCombat.attackPressure,
    commanderAttackerShield: apexCombat.attackerShield,
    commanderDefenderPower: 0,
    commanderCounterPressure: 0,
  });
  const projectedPulseRequest = resolveCommanderStandaloneDamageV2(attackerId, {
    pulseAttack: mobility.pulseAttack,
    nationalParticipatingManpower: projection.attackerStrength,
    hostileCurrentManpower: projection.defenderStrength,
  });
  const projectedAttackerDamageMultiplier = selectApexOperationalArmyModifiersV2(
    state,
    attackerId,
  ).armyCasualtyMultiplier;
  const projectedDefenderDamageMultiplier = selectApexOperationalArmyModifiersV2(
    state,
    defenderId,
  ).armyCasualtyMultiplier;
  const projectedDefenderHit = resolveFrontlineHitV2({
    requestedBaseDamage: apexExchange.requestedDefenderLosses,
    requestedApexDamage: projectedPulseRequest,
    receivingDamageMultiplier: projectedDefenderDamageMultiplier,
    frontlineManpower: projection.defenderStrength,
    empireArmyCapacity: projection.defenderEmpireCapacity,
  });
  const projectedPulseDamage = projectedDefenderHit.apexDamage;
  const projectedDefenderPersonnelLosses = projectedDefenderHit.totalDamage;
  const apexForecastDamage = allocateApexFrontlineDamageV2({
    requestedDamage: resolveFrontlineHitV2({
      requestedBaseDamage: apexExchange.requestedAttackerLosses,
      receivingDamageMultiplier: projectedAttackerDamageMultiplier,
      frontlineManpower: projection.attackerStrength,
      empireArmyCapacity: projection.attackerEmpireCapacity,
    }).totalDamage,
    nationalManpower: projection.attackerStrength,
    ...(availabilityFactor > EPSILON && mobility.integrity > EPSILON ? {
      apex: {
        shieldActive: isHumanPlayerV2(state, attackerId),
        integrity: mobility.integrity,
        maxIntegrity: mobility.maxIntegrity,
        interceptEfficiency: mobility.interceptEfficiency,
      },
    } : {}),
  });
  // Shield-integrity damage is not personnel and therefore never appears in
  // the public casualty forecast or its national-manpower loss rate. The dome
  // still improves the forecast by intercepting damage before this value.
  const projectedAttackerPersonnelLosses = apexForecastDamage.nationalLosses;
  const apexAttackerLossRate = projection.attackerStrength > EPSILON
    ? projectedAttackerPersonnelLosses / projection.attackerStrength : 0;
  const apexDefenderLossRate = apexExchange.targetStrength > EPSILON
    ? projectedDefenderPersonnelLosses / apexExchange.targetStrength : 0;
  const apexAttritionEdge = apexAttackerLossRate <= 0
    ? (apexDefenderLossRate > 0 ? 20 : 1)
    : apexDefenderLossRate / apexAttackerLossRate;
  const tacticalEdgeWithApex = clamp(apexAttritionEdge, 0.08, 8);
  const combinedRatioWithApex = tacticalEdgeWithApex ** 0.54
    * clamp(strategicEdgeWithApex, 0.05, 20) ** 0.46
    / defenderCampaignMultiplier;
  const winChance = round(clamp(
    50 + Math.log(combinedRatioWithApex) * 24,
    5,
    maximumChance,
  ), 1);
  const apexContribution: ApexForecastContributionV2 = {
    status: mobility.status,
    stagingTerritoryId: candidate.sourceId,
    power: 0,
    effectivePower: 0,
    attackMultiplier: round(
      1 + Math.max(0, mobility.attackMultiplier - 1) * availabilityFactor,
      6,
    ),
    defenseMultiplier: round(
      1 + Math.max(0, mobility.defenseMultiplier - 1) * availabilityFactor,
      6,
    ),
    supportBonusPercent: round((
      Math.max(0, mobility.attackMultiplier - 1) * 0.55
        + Math.max(0, mobility.defenseMultiplier - 1) * 0.45
    ) * availabilityFactor * 100, 3),
    projectedAttackPressure: round(apexCombat.attackPressure, 9),
    projectedDefenseShield: round(apexCombat.attackerShield, 9),
    projectedPulseDamage,
    chanceDelta: round(Math.max(0, winChance - baseWinChance), 1),
    etaWeeks: mobility.etaWeeks,
    readiness: round(mobility.readiness, 3),
    supplyReadiness: round(mobility.supplyReadiness, 3),
    reason: mobility.reason,
  };
  return {
    attackerId, defenderId, access: candidate.access,
    sourceId: candidate.sourceId, targetId: candidate.targetId, terrain,
    routeDistanceKm: round(candidate.routeDistanceKm, 3),
    routeHopCount: candidate.routeHopCount,
    routeThroughputMultiplier: round(candidate.assaultThroughputMultiplier, 9),
    winChance,
    outlook: winChance >= 82 ? 'dominant' : winChance >= 64 ? 'favored'
      : winChance >= 42 ? 'contested' : winChance >= 22 ? 'risky' : 'desperate',
    attackerStrength: round(attackerStrength), defenderStrength: round(defenderStrength),
    defenderEmpireStrength: round(defenderEmpireStrength),
    defenderEmpireSupport: round(defenderEmpireSupport),
    defenderTerritoryCount,
    retaliationExpected,
    attackerAttack: round(projection.attackerAttack), attackerDefense: round(projection.attackerDefense),
    defenderAttack: round(projection.defenderAttack), defenderDefense: round(projection.defenderDefense),
    attackerSupply: round(projection.attackerSupply), defenderSupply: round(projection.defenderSupply),
    supportingForces: projection.supportingForces,
    defenderPositionMultiplier: DEFENDER_POSITION_MULTIPLIER,
    terrainDefenseMultiplier,
    projectedAttackerLosses: round(projectedAttackerPersonnelLosses),
    projectedDefenderLosses: round(projectedDefenderPersonnelLosses),
    projectedAttackerLossRate: round(apexAttackerLossRate),
    projectedDefenderLossRate: round(apexDefenderLossRate),
    estimatedWeeksMin: Math.max(2, Math.round(centralWeeks * 0.72)),
    estimatedWeeksMax: Math.max(4, Math.round(centralWeeks * 1.35)),
    apexContribution,
  };
}

/**
 * Project the next live pulse through the same current APEX assignment,
 * logistics lift, augmented exchange and shield allocator used by battle
 * resolution. Co-op contingent selection remains a pulse-time concern; this
 * helper deliberately isolates the commander's authoritative contribution.
 */
function projectLiveCommanderLossesV2(
  state: WorldStateV2,
  content: WorldContentV2,
  war: WarStateV2,
  operation: FrontOperationV2,
  projection: CombatExchangeProjectionV2,
  expectedDamage: number,
): { attackerLosses: number; defenderLosses: number } {
  const support = selectCommanderBattleSupportV2(state, war, operation, content);
  const hasCommanderEffect = Boolean(
    support.attacker || support.defender
      || support.attackerLogistics || support.defenderLogistics,
  );
  if (!hasCommanderEffect) {
    return {
      attackerLosses: projection.attackerLosses,
      defenderLosses: projection.defenderLosses,
    };
  }
  const attackerId = state.territories[operation.sourceId]!.owner;
  const defenderId = state.territories[operation.targetId]!.owner;
  const commanderAttackerStrength = 0;
  const commanderDefenderStrength = 0;
  const attackerSupplyDelivered = Math.min(
    support.attackerLogistics?.availableSupply ?? 0,
    projection.attackerStrength * Math.max(0, 1 - projection.attackerSupply),
  );
  const defenderSupplyDelivered = Math.min(
    support.defenderLogistics?.availableSupply ?? 0,
    projection.defenderStrength * Math.max(0, 1 - projection.defenderSupply),
  );
  const attackerSupply = clampCommanderBattleSupplyV2(
    projection.attackerSupply
      + attackerSupplyDelivered / Math.max(EPSILON, projection.attackerStrength),
  );
  const defenderSupply = clampCommanderBattleSupplyV2(
    projection.defenderSupply
      + defenderSupplyDelivered / Math.max(EPSILON, projection.defenderStrength),
  );
  const nationalAttackPressure = projection.attackPressure
    * attackerSupply / Math.max(EPSILON, projection.attackerSupply);
  const nationalDefenseShield = projection.defenseShield
    * defenderSupply / Math.max(EPSILON, projection.defenderSupply);
  const nationalCounterPressure = projection.counterPressure
    * defenderSupply / Math.max(EPSILON, projection.defenderSupply);
  const nationalAttackerShield = projection.attackerShield
    * attackerSupply / Math.max(EPSILON, projection.attackerSupply);
  const commanderAttackerCombat = projectCommanderAttackerCombatV2({
    state,
    content,
    ownerId: attackerId,
    opponentId: defenderId,
    sourceId: operation.sourceId,
    targetId: operation.targetId,
    access: operation.access,
    nationalAttackPressure,
    nationalAttackerShield,
    attackMultiplier: support.attacker?.attackMultiplier ?? 1,
    defenseMultiplier: support.attacker?.defenseMultiplier ?? 1,
  });
  const commanderDefenderCombat = projectCommanderDefenderCombatV2({
    state,
    content,
    ownerId: defenderId,
    opponentId: attackerId,
    sourceId: operation.sourceId,
    targetId: operation.targetId,
    nationalDefenseShield,
    nationalCounterPressure,
    attackMultiplier: support.defender?.attackMultiplier ?? 1,
    defenseMultiplier: support.defender?.defenseMultiplier ?? 1,
  });
  const exchange = projectCommanderAugmentedExchangeV2({
    projection,
    access: operation.access,
    varianceA: expectedDamage,
    varianceD: expectedDamage,
    hasCommanderEffect,
    nationalAttackPressure,
    nationalDefenseShield,
    nationalCounterPressure,
    nationalAttackerShield,
    commanderAttackerStrength,
    commanderDefenderStrength,
    commanderAttackerPower: commanderAttackerCombat.attackPressure,
    commanderAttackerShield: commanderAttackerCombat.attackerShield,
    commanderDefenderPower: commanderDefenderCombat.defensePower,
    commanderCounterPressure: commanderDefenderCombat.counterPressure,
  });
  const attackerPulseRequest = resolveCommanderStandaloneDamageV2(
    support.attacker?.playerId,
    {
      pulseAttack: support.attacker?.pulseAttack ?? 0,
      nationalParticipatingManpower: projection.attackerStrength,
      hostileCurrentManpower: projection.defenderStrength,
    },
  );
  const defenderPulseRequest = resolveCommanderStandaloneDamageV2(
    support.defender?.playerId,
    {
      pulseAttack: support.defender?.pulseAttack ?? 0,
      nationalParticipatingManpower: projection.defenderStrength,
      hostileCurrentManpower: projection.attackerStrength,
    },
  );
  const attackerDamageMultiplier = selectApexOperationalArmyModifiersV2(
    state,
    attackerId,
  ).armyCasualtyMultiplier;
  const defenderDamageMultiplier = selectApexOperationalArmyModifiersV2(
    state,
    defenderId,
  ).armyCasualtyMultiplier;
  const defenderHit = resolveFrontlineHitV2({
    requestedBaseDamage: exchange.requestedDefenderLosses,
    requestedApexDamage: attackerPulseRequest,
    receivingDamageMultiplier: defenderDamageMultiplier,
    frontlineManpower: projection.defenderStrength,
    empireArmyCapacity: projection.defenderEmpireCapacity,
  });
  const attackerHit = resolveFrontlineHitV2({
    requestedBaseDamage: exchange.requestedAttackerLosses,
    requestedApexDamage: defenderPulseRequest,
    receivingDamageMultiplier: attackerDamageMultiplier,
    frontlineManpower: projection.attackerStrength,
    empireArmyCapacity: projection.attackerEmpireCapacity,
  });
  const defenderAllocation = allocateApexFrontlineDamageV2({
    requestedDamage: defenderHit.totalDamage,
    nationalManpower: projection.defenderStrength,
    hostileManpower: projection.attackerStrength,
    ...(support.defender ? {
      apex: {
        shieldActive: true,
        integrity: support.defender.shieldIntegrity,
        maxIntegrity: support.defender.maxShieldIntegrity,
        mirrorMatrixEligible: support.defender.mirrorMatrixEligible,
        interceptEfficiency: support.defender.interceptEfficiency,
      },
    } : {}),
  });
  const attackerAllocation = allocateApexFrontlineDamageV2({
    requestedDamage: attackerHit.totalDamage,
    nationalManpower: projection.attackerStrength,
    hostileManpower: projection.defenderStrength,
    ...(support.attacker ? {
      apex: {
        shieldActive: true,
        integrity: support.attacker.shieldIntegrity,
        maxIntegrity: support.attacker.maxShieldIntegrity,
        mirrorMatrixEligible: support.attacker.mirrorMatrixEligible,
        interceptEfficiency: support.attacker.interceptEfficiency,
      },
    } : {}),
  });
  return {
    attackerLosses: Math.min(
      projection.attackerStrength,
      attackerAllocation.nationalLosses + Math.min(
        Math.max(0, attackerHit.hitCap - attackerHit.totalDamage),
        (commanderCanDealStandaloneDamageV2(support.defender?.playerId)
          ? defenderAllocation.counterpulseDamage : 0) * attackerDamageMultiplier,
      ),
    ),
    defenderLosses: Math.min(
      projection.defenderStrength,
      defenderAllocation.nationalLosses + Math.min(
        Math.max(0, defenderHit.hitCap - defenderHit.totalDamage),
        (commanderCanDealStandaloneDamageV2(support.attacker?.playerId)
          ? attackerAllocation.counterpulseDamage : 0) * defenderDamageMultiplier,
      ),
    ),
  };
}

/**
 * Estimate the remaining duration of an active war from the front that most
 * recently exchanged fire. Unlike the declaration forecast this is
 * perspective-aware, blends the exact next-pulse formula with observed war
 * losses. The deliberately wide range communicates uncertainty from future
 * recruitment, logistics and front changes without running the expensive
 * full finance planner during every HUD refresh.
 */
export function estimateLiveWarV2(
  state: WorldStateV2,
  content: WorldContentV2,
  warId: string,
  viewerId: PlayerId,
): LiveWarEstimateV2 | undefined {
  const war = state.wars.find((candidate) => candidate.id === warId);
  if (!war || (war.attackerId !== viewerId && war.defenderId !== viewerId)) return undefined;
  const enemyId = war.attackerId === viewerId ? war.defenderId : war.attackerId;
  const totalOwnLosses = viewerId === war.attackerId ? war.attackerLosses : war.defenderLosses;
  const totalEnemyLosses = viewerId === war.attackerId ? war.defenderLosses : war.attackerLosses;
  const operations = [...war.attackerOperations, ...war.defenderOperations]
    .filter((operation) => operationValidV2(
      state, content, operation, operation?.commanderId ?? viewerId,
      operation?.commanderId === war.attackerId ? war.defenderId : war.attackerId,
    ))
    .sort((left, right) => Number(right.lastBattleTick === war.lastBattleTick)
      - Number(left.lastBattleTick === war.lastBattleTick)
      || right.lastBattleTick - left.lastBattleTick
      || left.commanderId.localeCompare(right.commanderId));
  const operation = operations[0];
  const mobilizationTicks = campaignWarMobilizationTicksV2(state, content, war);
  const battleIntervalTicks = campaignWarBattleIntervalTicksV2(state, content, war);
  const escalatedWarAge = Math.max(
    0,
    state.tick - war.startedTick - mobilizationTicks,
  );
  const expectedDamage = battleDamageMeanV2(escalatedWarAge);
  const projection = operation ? projectCombatExchangeV2(
    state,
    content,
    operation.commanderId,
    operation.commanderId === war.attackerId ? war.defenderId : war.attackerId,
    operation.sourceId,
    operation.targetId,
    operation.access,
    expectedDamage,
    expectedDamage,
  ) : undefined;
  // A valid live operation already gives us both the exact next exchange and
  // its authored source/target. Building a declaration forecast as well would
  // take a second complete military snapshot on every HUD refresh, even though
  // none of its values are used. Keep the expensive forecast strictly as the
  // no-operation fallback for legacy or temporarily unstaffed wars.
  const fallback = projection
    ? undefined
    : forecastWarV2(state, content, viewerId, enemyId);
  const commanderLosses = projection ? projectLiveCommanderLossesV2(
    state,
    content,
    war,
    operation!,
    projection,
    expectedDamage,
  ) : undefined;
  const nextOwnLosses = commanderLosses
    ? operation!.commanderId === viewerId
      ? commanderLosses.attackerLosses : commanderLosses.defenderLosses
    : fallback!.projectedAttackerLosses;
  const nextEnemyLosses = commanderLosses
    ? operation!.commanderId === viewerId
      ? commanderLosses.defenderLosses : commanderLosses.attackerLosses
    : fallback!.projectedDefenderLosses;
  const historicalOwn = war.battles > 0 ? totalOwnLosses / war.battles : nextOwnLosses;
  const historicalEnemy = war.battles > 0 ? totalEnemyLosses / war.battles : nextEnemyLosses;
  const historyWeight = clamp(war.battles / 12, 0, 0.55);
  const projectedOwnLosses = round(nextOwnLosses * (1 - historyWeight) + historicalOwn * historyWeight);
  const projectedEnemyLosses = round(nextEnemyLosses * (1 - historyWeight) + historicalEnemy * historyWeight);

  const ownStrength = nationalCombatManpowerV2(state, viewerId);
  const enemyStrength = nationalCombatManpowerV2(state, enemyId);
  const ownErosion = Math.max(0, projectedOwnLosses);
  const enemyErosion = Math.max(0, projectedEnemyLosses);
  const ownCollapsePulses = ownErosion > 0 ? ownStrength / ownErosion : Number.POSITIVE_INFINITY;
  const enemyCollapsePulses = enemyErosion > 0 ? enemyStrength / enemyErosion : Number.POSITIVE_INFINITY;
  const finiteCollapse = Math.min(ownCollapsePulses, enemyCollapsePulses);
  const isStalled = !Number.isFinite(finiteCollapse) || finiteCollapse > 260;
  const closeRace = Number.isFinite(ownCollapsePulses) && Number.isFinite(enemyCollapsePulses)
    && Math.max(ownCollapsePulses, enemyCollapsePulses)
      / Math.max(0.000001, Math.min(ownCollapsePulses, enemyCollapsePulses)) < 1.25;
  const outlook: LiveWarEstimateV2['outlook'] = isStalled ? 'stalled'
    : closeRace ? 'contested'
    : enemyCollapsePulses < ownCollapsePulses ? 'enemy-collapse' : 'our-collapse';
  const losingId = outlook === 'enemy-collapse' ? enemyId
    : outlook === 'our-collapse' ? viewerId : undefined;
  const territoryTail = losingId
    ? Math.max(0, selectTerritoriesOfV2(state, losingId).length - 1) * battleIntervalTicks : 0;
  const mobilisation = Math.max(0, mobilizationTicks - (state.tick - war.startedTick));
  const centralWeeks = isStalled ? 390
    : clamp(finiteCollapse * battleIntervalTicks + territoryTail + mobilisation, 4, 1_040);
  const confidence: LiveWarEstimateV2['confidence'] = war.battles >= 10 ? 'high'
    : war.battles >= 3 ? 'medium' : 'low';
  const spread = confidence === 'high' ? 0.24 : confidence === 'medium' ? 0.38 : 0.58;
  return {
    warId,
    viewerId,
    enemyId,
    sourceId: operation?.sourceId ?? fallback!.sourceId,
    targetId: operation?.targetId ?? fallback!.targetId,
    operationCommanderId: operation?.commanderId,
    projectedOwnLosses,
    projectedEnemyLosses,
    totalOwnLosses: round(totalOwnLosses),
    totalEnemyLosses: round(totalEnemyLosses),
    estimatedWeeksMin: Math.max(2, Math.round(centralWeeks * (1 - spread))),
    estimatedWeeksMax: Math.max(4, Math.round(Math.min(1_040, centralWeeks * (1 + spread)))),
    confidence,
    outlook,
  };
}

function operationValidV2(
  state: WorldStateV2,
  content: WorldContentV2,
  operation: FrontOperationV2 | undefined,
  commanderId: PlayerId,
  enemyId: PlayerId,
): operation is FrontOperationV2 {
  if (!operation) return false;
  const source = state.territories[operation.sourceId];
  const target = state.territories[operation.targetId];
  const route = source && target
    ? selectCoopMilitaryAccessRouteBetweenV2(
      state,
      content,
      commanderId,
      enemyId,
      operation.sourceId,
      operation.targetId,
    )
    : undefined;
  return Boolean(source && target && source.owner === commanderId && target.owner === enemyId
    && selectArmyCombatManpowerV2(state, commanderId, source.army) > 0
    && route?.access === operation.access);
}

function clearInvalidWarOperationsV2(state: WorldStateV2, content: WorldContentV2): void {
  for (const activeWar of state.wars) {
    canonicalizeWarFrontV2(state, content, activeWar);
  }
}

function setCanonicalWarFrontV2(
  war: WarStateV2,
  operation: FrontOperationV2 | undefined,
): void {
  war.attackerOperations = operation?.commanderId === war.attackerId ? [operation] : [];
  war.defenderOperations = operation?.commanderId === war.defenderId ? [operation] : [];
}

function isSurvivalRogueHumanMultiFrontWarV2(
  state: WorldStateV2,
  war: WarStateV2,
): boolean {
  return isSurvivalStateV2(state)
    && war.attackerId === ROGUE_AI_NATION_ID_V2
    && isHumanPlayerV2(state, war.defenderId);
}

function operationCandidateKeyV2(operation: Pick<FrontOperationV2, 'sourceId' | 'targetId' | 'access'>): string {
  return `${operation.sourceId}:${operation.targetId}:${operation.access}`;
}

function survivalPhysicalAxisKeyV2(
  operation: Pick<FrontOperationV2, 'sourceId' | 'targetId'>,
): string {
  return [operation.sourceId, operation.targetId]
    .sort((left, right) => left.localeCompare(right))
    .join(':');
}

function survivalRogueTerritorySpentV2(
  state: WorldStateV2,
  territoryId: TerritoryId,
): boolean {
  const territory = state.territories[territoryId];
  if (!territory || territory.owner !== ROGUE_AI_NATION_ID_V2) return false;
  return selectArmyCombatManpowerV2(state, ROGUE_AI_NATION_ID_V2, territory.army)
    <= localFormationCapitulationThresholdV2(territory.army.capacity);
}

function survivalRogueBattlefieldTerritoryV2(
  state: WorldStateV2,
  content: WorldContentV2,
  territoryId: TerritoryId,
): boolean {
  void content;
  // A country the machine physically conquers is a normal owned battlefield,
  // not a scorched special-case. Humans can counterattack that exact territory.
  return state.territories[territoryId]?.owner === ROGUE_AI_NATION_ID_V2;
}

const SURVIVAL_ROGUE_AXIS_LIMIT_V2 = 2;
const SURVIVAL_ROGUE_FRONT_STALL_TICKS_V2 = 24;

/**
 * Every Rogue source is a real formation on a physically owned territory.
 */
function survivalRogueAxisCanFightV2(
  state: WorldStateV2,
  sourceId: TerritoryId,
): boolean {
  return !survivalRogueTerritorySpentV2(state, sourceId);
}

function survivalOperationStalledV2(
  state: WorldStateV2,
  operation: FrontOperationV2,
): boolean {
  if (operation.commanderId !== ROGUE_AI_NATION_ID_V2) return false;
  if (state.tick < operation.holdUntilTick) return false;
  return state.tick - operation.lastBattleTick >= SURVIVAL_ROGUE_FRONT_STALL_TICKS_V2
    || operation.momentum <= -0.45;
}

/**
 * A Survival wave behaves as one campaign: it finishes weak adjacent ground,
 * keeps real Antarctic personnel concentrated and uses naval contact only when
 * no contiguous land axis exists. Generic grand-strategy scoring remains the
 * final tie-breaker, so this layer stays deterministic and cheap.
 */
function rankSurvivalRogueCandidatesV2(
  state: WorldStateV2,
  candidates: readonly FrontCandidateV2[],
): FrontCandidateV2[] {
  const metric = (candidate: FrontCandidateV2) => {
    const target = state.territories[candidate.targetId]!;
    const targetStrength = selectArmyCombatManpowerV2(
      state,
      target.owner,
      target.army,
    );
    const targetFill = clamp(
      targetStrength / Math.max(1e-9, armyCombatCapacityV2(state, target.owner, target.army)),
      0,
      1,
    );
    const verifiedWave = rogueWaveManpowerAtV2(state, candidate.sourceId);
    return {
      land: candidate.access === 'land' ? 1 : 0,
      viable: candidate.viable ? 1 : 0,
      weakTarget: 1 - targetFill,
      verifiedWave,
    };
  };
  return [...candidates].sort((left, right) => {
    const leftMetric = metric(left);
    const rightMetric = metric(right);
    return rightMetric.land - leftMetric.land
      || rightMetric.weakTarget - leftMetric.weakTarget
      || rightMetric.verifiedWave - leftMetric.verifiedWave
      || rightMetric.viable - leftMetric.viable
      || right.score - left.score
      || left.routeDistanceKm - right.routeDistanceKm
      || left.sourceId.localeCompare(right.sourceId)
      || left.targetId.localeCompare(right.targetId);
  });
}

function sortSurvivalOperationsV2(operations: FrontOperationV2[]): FrontOperationV2[] {
  return operations.sort((left, right) => left.sourceId.localeCompare(right.sourceId)
    || left.targetId.localeCompare(right.targetId)
    || left.access.localeCompare(right.access));
}

/**
 * One bilateral war is one front. Authenticated older saves can contain one
 * operation per border and one for each counterattack direction; collapse
 * those contacts deterministically to the strongest still-legal objective.
 */
export function canonicalizeWarFrontV2(
  state: WorldStateV2,
  content: WorldContentV2,
  war: WarStateV2,
): FrontOperationV2 | undefined {
  if (isSurvivalRogueHumanMultiFrontWarV2(state, war)) {
    // Only an explicit player PUSH FRONT order creates a defender-led axis.
    // Retired scorched-corridor saves used to reverse spent Rogue operations
    // automatically; normal conquered countries no longer use that shortcut.
    const reversed: FrontOperationV2[] = [];
    const reversedAxes = new Set(reversed.map(survivalPhysicalAxisKeyV2));
    const candidates = [
      ...sortSurvivalOperationsV2([...war.defenderOperations, ...reversed])
        .filter((operation) => operation.commanderId === war.defenderId
          && survivalRogueBattlefieldTerritoryV2(state, content, operation.targetId)
          && operationValidV2(
            state,
            content,
            operation,
            war.defenderId,
            ROGUE_AI_NATION_ID_V2,
          )),
      ...sortSurvivalOperationsV2([...war.attackerOperations])
        .filter((operation) => operation.commanderId === ROGUE_AI_NATION_ID_V2
          && survivalRogueBattlefieldTerritoryV2(state, content, operation.sourceId)
          && !reversedAxes.has(survivalPhysicalAxisKeyV2(operation))
          && operationValidV2(
            state,
            content,
            operation,
            ROGUE_AI_NATION_ID_V2,
            war.defenderId,
          )),
    ];
    const usedAxes = new Set<string>();
    const usedRogueTerritories = new Set<TerritoryId>();
    const usedHumanTerritories = new Set<TerritoryId>();
    const selected = candidates.filter((operation) => {
      const axisKey = survivalPhysicalAxisKeyV2(operation);
      const rogueTerritoryId = operation.commanderId === ROGUE_AI_NATION_ID_V2
        ? operation.sourceId : operation.targetId;
      const humanTerritoryId = operation.commanderId === war.defenderId
        ? operation.sourceId : operation.targetId;
      if (usedAxes.has(axisKey)
        || usedRogueTerritories.has(rogueTerritoryId)
        || (operation.commanderId === war.defenderId
          && usedHumanTerritories.has(humanTerritoryId))) return false;
      usedAxes.add(axisKey);
      usedRogueTerritories.add(rogueTerritoryId);
      usedHumanTerritories.add(humanTerritoryId);
      return true;
    }).slice(0, SURVIVAL_ROGUE_AXIS_LIMIT_V2);
    war.attackerOperations = sortSurvivalOperationsV2(selected.filter((operation) => (
      operation.commanderId === ROGUE_AI_NATION_ID_V2
    )));
    war.defenderOperations = sortSurvivalOperationsV2(selected.filter((operation) => (
      operation.commanderId === war.defenderId
    )));
    return selected[0];
  }
  const liveOperations = [...war.attackerOperations, ...war.defenderOperations];
  // Canonical live saves already contain at most one operation. Scoring every
  // possible front for both sides cannot change the winner of a one-item set,
  // but used to rebuild two complete world power snapshots on every pre- and
  // post-war validation. Keep the expensive ranking only for authenticated
  // legacy duplicate fronts that genuinely need deterministic collapse.
  if (liveOperations.length <= 1) {
    const operation = liveOperations[0];
    if (!operation) return undefined;
    const participant = operation.commanderId === war.attackerId
      || operation.commanderId === war.defenderId;
    const enemyId = operation.commanderId === war.attackerId
      ? war.defenderId : war.attackerId;
    const selected = participant && operationValidV2(
      state,
      content,
      operation,
      operation.commanderId,
      enemyId,
    ) ? operation : undefined;
    setCanonicalWarFrontV2(war, selected);
    return selected;
  }
  const candidatesByCommander = new Map<PlayerId, Map<string, FrontCandidateV2>>();
  for (const [commanderId, enemyId] of [
    [war.attackerId, war.defenderId],
    [war.defenderId, war.attackerId],
  ] as const) {
    candidatesByCommander.set(commanderId, new Map(
      frontCandidatesV2(state, content, commanderId, enemyId)
        .map((candidate) => [operationCandidateKeyV2(candidate), candidate]),
    ));
  }
  const ranked = liveOperations
    .filter((operation) => {
      const enemyId = operation.commanderId === war.attackerId
        ? war.defenderId : war.attackerId;
      return (operation.commanderId === war.attackerId || operation.commanderId === war.defenderId)
        && operationValidV2(state, content, operation, operation.commanderId, enemyId);
    })
    .map((operation) => ({
      operation,
      candidate: candidatesByCommander.get(operation.commanderId)
        ?.get(operationCandidateKeyV2(operation)),
    }))
    .sort((left, right) => (
      Number(right.candidate?.viable ?? false) - Number(left.candidate?.viable ?? false)
      || Number(right.operation.access === 'land') - Number(left.operation.access === 'land')
      || (right.candidate?.score ?? Number.NEGATIVE_INFINITY)
        - (left.candidate?.score ?? Number.NEGATIVE_INFINITY)
      || right.operation.momentum - left.operation.momentum
      || left.operation.commanderId.localeCompare(right.operation.commanderId)
      || left.operation.sourceId.localeCompare(right.operation.sourceId)
      || left.operation.targetId.localeCompare(right.operation.targetId)
    ));
  const selected = ranked[0]?.operation;
  setCanonicalWarFrontV2(war, selected);
  return selected;
}

function createOperationV2(
  state: WorldStateV2,
  commanderId: PlayerId,
  enemyId: PlayerId,
  counteroffensive: boolean,
  candidate: FrontCandidateV2,
): FrontOperationV2 {
  const target = state.territories[candidate.targetId]!;
  const doctrine: OperationDoctrineV2 = counteroffensive ? 'counteroffensive'
    : selectArmyCombatManpowerV2(state, enemyId, target.army)
      <= armyCombatCapacityV2(state, enemyId, target.army) * 0.30 ? 'breakthrough'
      : 'pressure';
  const immediateSurvivalOpening = isSurvivalStateV2(state)
    && state.tick === 0
    && (commanderId === ROGUE_AI_NATION_ID_V2
      || enemyId === ROGUE_AI_NATION_ID_V2);
  return {
    commanderId,
    sourceId: candidate.sourceId,
    targetId: candidate.targetId,
    doctrine,
    access: candidate.access,
    startedTick: state.tick,
    lastBattleTick: state.tick,
    holdUntilTick: immediateSurvivalOpening
      ? state.tick + BATTLE_INTERVAL_TICKS
      : state.tick + 8 + randomInt(state, 9),
    momentum: 0,
  };
}

interface FrontProposalV2 {
  readonly commanderId: PlayerId;
  readonly enemyId: PlayerId;
  readonly candidate: FrontCandidateV2;
  readonly existing?: FrontOperationV2;
}

function frontProposalV2(
  state: WorldStateV2,
  content: WorldContentV2,
  war: WarStateV2,
  commanderId: PlayerId,
  militaryBaseSnapshot: MilitaryBaseSnapshotV2 = createMilitaryBaseSnapshotV2(state, content),
): FrontProposalV2 | undefined {
  const enemyId = commanderId === war.attackerId ? war.defenderId : war.attackerId;
  const baseCandidates = frontCandidatesV2(
    state,
    content,
    commanderId,
    enemyId,
    militaryBaseSnapshot,
  );
  const revengeActive = war.revenge?.claimantId === commanderId
    && war.revenge.expiresTick > state.tick;
  const candidates = revengeActive
    ? baseCandidates.map((candidate, index) => ({ candidate, index }))
      .sort((left, right) => Number(
        state.territories[right.candidate.targetId]?.coreOwner === enemyId,
      ) - Number(state.territories[left.candidate.targetId]?.coreOwner === enemyId)
        || left.index - right.index)
      .map(({ candidate }) => candidate)
    : baseCandidates;
  const viable = candidates.filter((candidate) => candidate.viable);
  const candidate = viable[0] ?? candidates[0];
  if (!candidate) return undefined;
  const current = [...war.attackerOperations, ...war.defenderOperations][0];
  const existing = current?.commanderId === commanderId
    && operationCandidateKeyV2(current) === operationCandidateKeyV2(candidate)
    && operationValidV2(state, content, current, commanderId, enemyId)
    && (state.tick < current.holdUntilTick || current.momentum >= -0.12)
    ? current : undefined;
  return { commanderId, enemyId, candidate, existing };
}

/** Survival-only exception: one Rogue↔human conflict owns two direct axes. */
function synchronizeSurvivalRogueHumanFrontsV2(
  state: WorldStateV2,
  content: WorldContentV2,
  war: WarStateV2,
  militaryBaseSnapshot?: MilitaryBaseSnapshotV2,
): FrontOperationV2[] {
  canonicalizeWarFrontV2(state, content, war);
  const currentDefenderOperations = [...war.defenderOperations];
  const currentAttackerOperations = [...war.attackerOperations];
  const currentOperations = [...currentDefenderOperations, ...currentAttackerOperations];
  const counterRebuildRequired = war.battles > 0 && currentAttackerOperations.some((operation) => (
    survivalRogueTerritorySpentV2(state, operation.sourceId)
      && selectArmyCombatManpowerV2(
        state,
        war.defenderId,
        state.territories[operation.targetId]!.army,
      ) > 1e-9
  ));
  const stalledRogueAxis = currentAttackerOperations.some((operation) => (
    survivalOperationStalledV2(state, operation)
  ));
  // The two stable opening axes remain legal for most of a war. Avoid a full
  // world power snapshot and candidate rescore on every weekly UI sync.
  if (currentOperations.length === SURVIVAL_ROGUE_AXIS_LIMIT_V2
    && !counterRebuildRequired
    && !stalledRogueAxis) {
    war.attackerOperations = sortSurvivalOperationsV2(currentAttackerOperations);
    war.defenderOperations = sortSurvivalOperationsV2(currentDefenderOperations);
    return currentOperations;
  }
  const currentByKey = new Map(currentOperations
    .map((operation) => [operationCandidateKeyV2(operation), operation]));
  const snapshot = militaryBaseSnapshot ?? createMilitaryBaseSnapshotV2(state, content);
  const rankedRogueCandidates = rankSurvivalRogueCandidatesV2(
    state,
    frontCandidatesV2(
      state,
      content,
      ROGUE_AI_NATION_ID_V2,
      war.defenderId,
      snapshot,
    ).filter((candidate) => candidate.routeHopCount === 1
      && survivalRogueBattlefieldTerritoryV2(state, content, candidate.sourceId)),
  );
  const stalledDirectionalKeys = new Set(currentAttackerOperations
    .filter((operation) => survivalOperationStalledV2(state, operation))
    .map(operationCandidateKeyV2));
  const rogueCandidates = [
    ...rankedRogueCandidates.filter((candidate) => (
      !stalledDirectionalKeys.has(operationCandidateKeyV2(candidate))
    )),
    ...rankedRogueCandidates.filter((candidate) => (
      stalledDirectionalKeys.has(operationCandidateKeyV2(candidate))
    )),
  ];
  const selected: FrontOperationV2[] = [];
  const selectedKeys = new Set<string>();
  const selectedRogueTerritories = new Set<TerritoryId>();
  const selectedHumanTerritories = new Set<TerritoryId>();
  const selectOperation = (
    operation: FrontOperationV2,
    allowSharedHumanTerritory = false,
  ): boolean => {
    if (selected.length >= SURVIVAL_ROGUE_AXIS_LIMIT_V2) return false;
    const axisKey = survivalPhysicalAxisKeyV2(operation);
    const rogueTerritoryId = operation.commanderId === ROGUE_AI_NATION_ID_V2
      ? operation.sourceId : operation.targetId;
    const humanTerritoryId = operation.commanderId === ROGUE_AI_NATION_ID_V2
      ? operation.targetId : operation.sourceId;
    if (selectedKeys.has(axisKey)
      || selectedRogueTerritories.has(rogueTerritoryId)
      || (!allowSharedHumanTerritory
        && selectedHumanTerritories.has(humanTerritoryId))) return false;
    selected.push(operation);
    selectedKeys.add(axisKey);
    selectedRogueTerritories.add(rogueTerritoryId);
    selectedHumanTerritories.add(humanTerritoryId);
    return true;
  };
  for (const operation of currentDefenderOperations) selectOperation(operation);
  // Keep a healthy machine assault, but never let a stale axis permanently
  // reserve one of the two decisive slots. Human-selected counteroffensives
  // were already accepted above and are therefore never overwritten here.
  for (const operation of currentAttackerOperations) {
    if (!survivalOperationStalledV2(state, operation)) {
      selectOperation(operation, true);
    }
  }
  const selectCandidates = (requireDistinctTarget: boolean): void => {
    for (const candidate of rogueCandidates) {
      if (selected.length >= SURVIVAL_ROGUE_AXIS_LIMIT_V2) break;
      const directionalKey = operationCandidateKeyV2(candidate);
      if (selectedRogueTerritories.has(candidate.sourceId)
        || (requireDistinctTarget && selectedHumanTerritories.has(candidate.targetId))) continue;
      const existing = currentByKey.get(directionalKey);
      selectOperation(
        existing && !survivalOperationStalledV2(state, existing)
          ? existing
          : createOperationV2(
              state,
              ROGUE_AI_NATION_ID_V2,
              war.defenderId,
              false,
              candidate,
            ),
        !requireDistinctTarget,
      );
    }
  };
  selectCandidates(true);
  selectCandidates(false);
  war.attackerOperations = sortSurvivalOperationsV2(selected.filter((operation) => (
    operation.commanderId === ROGUE_AI_NATION_ID_V2
  )));
  war.defenderOperations = sortSurvivalOperationsV2(selected.filter((operation) => (
    operation.commanderId === war.defenderId
  )));
  return [...war.defenderOperations, ...war.attackerOperations];
}

/**
 * Simulation boundary for a click-selected Survival counteroffensive. The
 * caller supplies the physical Rogue territory, not merely its shared owner,
 * so every adjacent corridor (and eventually Antarctica itself) remains a
 * valid player choice. Autonomous selection always preserves this operation.
 */
export interface SurvivalCounteroffensiveTargetV2 {
  readonly sourceId: TerritoryId;
  readonly targetId: TerritoryId;
  readonly access: 'land' | 'naval';
  readonly active: boolean;
}

/**
 * Lightweight UI-facing selector for exact Rogue territories that can receive
 * a Survival counteroffensive. This intentionally bypasses nation-level war
 * declaration rules: the permanent Rogue war already exists, while the player
 * is selecting one physical border inside that war.
 */
export function selectSurvivalCounteroffensiveTargetsV2(
  state: WorldStateV2,
  content: WorldContentV2,
  commanderId: PlayerId,
): readonly SurvivalCounteroffensiveTargetV2[] {
  if (!isSurvivalStateV2(state) || !isHumanPlayerV2(state, commanderId)) return [];
  const war = state.wars.find((candidate) => (
    candidate.attackerId === ROGUE_AI_NATION_ID_V2
      && candidate.defenderId === commanderId
  ));
  if (!war) return [];

  const activeByTarget = new Map<TerritoryId, FrontOperationV2>();
  for (const operation of war.defenderOperations) {
    if (operation.commanderId !== commanderId
      || state.territories[operation.sourceId]?.owner !== commanderId
      || !survivalRogueBattlefieldTerritoryV2(state, content, operation.targetId)
      || !(content.territories[operation.sourceId]?.connections ?? []).some((connection) => (
        connection.targetId === operation.targetId
      ))) continue;
    activeByTarget.set(operation.targetId, operation);
  }

  const combatSourceIds = selectTerritoriesOfV2(state, commanderId)
    .filter((source) => selectArmyCombatManpowerV2(
      state,
      commanderId,
      source.army,
    ) > 0)
    .map((source) => source.id);
  const routes = selectCoopMilitaryAccessRoutesV2(
    state,
    content,
    commanderId,
    ROGUE_AI_NATION_ID_V2,
    combatSourceIds,
  ).filter((route) => route.hopCount === 1
    && survivalRogueBattlefieldTerritoryV2(state, content, route.targetId))
    .sort((left, right) => Number(right.access === 'land') - Number(left.access === 'land')
      || left.distanceKm - right.distanceKm
      || left.sourceId.localeCompare(right.sourceId)
      || left.targetId.localeCompare(right.targetId));

  const byTarget = new Map<TerritoryId, SurvivalCounteroffensiveTargetV2>();
  for (const route of routes) {
    if (byTarget.has(route.targetId)) continue;
    byTarget.set(route.targetId, {
      sourceId: route.sourceId,
      targetId: route.targetId,
      access: route.access,
      active: activeByTarget.has(route.targetId),
    });
  }
  // Keep an already selected legal border visible as ACTIVE even when its
  // source has temporarily been drained by the current battle pulse.
  for (const operation of activeByTarget.values()) {
    if (byTarget.has(operation.targetId)) continue;
    byTarget.set(operation.targetId, {
      sourceId: operation.sourceId,
      targetId: operation.targetId,
      access: operation.access,
      active: true,
    });
  }
  return [...byTarget.values()].sort((left, right) => Number(right.active) - Number(left.active)
    || Number(right.access === 'land') - Number(left.access === 'land')
    || left.targetId.localeCompare(right.targetId)
    || left.sourceId.localeCompare(right.sourceId));
}

export function selectSurvivalCounteroffensiveTargetV2(
  state: WorldStateV2,
  content: WorldContentV2,
  commanderId: PlayerId,
  targetId: TerritoryId,
): CommandResultV2 {
  if (!isSurvivalStateV2(state) || !isHumanPlayerV2(state, commanderId)) {
    return { accepted: false, reason: 'A counteroffensive target is available only to a Survival commander.' };
  }
  if (!survivalRogueBattlefieldTerritoryV2(state, content, targetId)) {
    return { accepted: false, reason: 'Select a Rogue-controlled adjacent territory.' };
  }
  const war = state.wars.find((candidate) => (
    candidate.attackerId === ROGUE_AI_NATION_ID_V2
      && candidate.defenderId === commanderId
  ));
  if (!war) return { accepted: false, reason: 'No active Rogue front can receive this order.' };

  const candidate = frontCandidatesV2(
    state,
    content,
    commanderId,
    ROGUE_AI_NATION_ID_V2,
  ).filter((front) => front.targetId === targetId && front.routeHopCount === 1)
    .sort((left, right) => Number(right.access === 'land') - Number(left.access === 'land')
      || Number(right.viable) - Number(left.viable)
      || right.score - left.score
      || left.sourceId.localeCompare(right.sourceId))[0];
  if (!candidate) {
    return { accepted: false, reason: 'That Rogue territory is not adjacent to a combat-ready Empire territory.' };
  }

  const current = war.defenderOperations.find((operation) => (
    operation.sourceId === candidate.sourceId
      && operation.targetId === candidate.targetId
      && operation.access === candidate.access
      && operationValidV2(
        state,
        content,
        operation,
        commanderId,
        ROGUE_AI_NATION_ID_V2,
      )
  ));
  const operation = current ?? createOperationV2(
    state,
    commanderId,
    ROGUE_AI_NATION_ID_V2,
    true,
    candidate,
  );
  const selectedAxis = survivalPhysicalAxisKeyV2(operation);
  war.defenderOperations = [operation];
  war.attackerOperations = sortSurvivalOperationsV2(
    war.attackerOperations.filter((existing) => (
      survivalPhysicalAxisKeyV2(existing) !== selectedAxis
        && existing.sourceId !== targetId
    )),
  ).slice(0, SURVIVAL_ROGUE_AXIS_LIMIT_V2 - 1);
  synchronizeSurvivalRogueHumanFrontsV2(state, content, war);
  return { accepted: true };
}

function chooseInitiativeOperationsV2(
  state: WorldStateV2,
  content: WorldContentV2,
  war: WarStateV2,
  militaryBaseSnapshot: MilitaryBaseSnapshotV2 = createMilitaryBaseSnapshotV2(state, content),
): FrontOperationV2[] {
  if (isSurvivalRogueHumanMultiFrontWarV2(state, war)) {
    return synchronizeSurvivalRogueHumanFrontsV2(
      state,
      content,
      war,
      militaryBaseSnapshot,
    );
  }
  const current = canonicalizeWarFrontV2(state, content, war);
  if (isPermanentRogueWarV2(state, war)
    && war.attackerId === ROGUE_AI_NATION_ID_V2
    && war.battles === 0) {
    if (current?.commanderId === war.attackerId) return [current];
    const opening = frontProposalV2(
      state,
      content,
      war,
      war.attackerId,
      militaryBaseSnapshot,
    );
    if (opening) {
      const operation = opening.existing ?? createOperationV2(
        state,
        opening.commanderId,
        opening.enemyId,
        false,
        opening.candidate,
      );
      setCanonicalWarFrontV2(war, operation);
      return [operation];
    }
  }
  // A declaration is an actual chosen attack, not a simultaneous defender
  // sortie. Preserve that assault through its first pulse so APEX can stage
  // with the player; initiative may reverse normally after contact.
  if (war.battles === 0
    && current?.commanderId === war.attackerId
    && !aiAttackerMustStandDownV2(state, war)) return [current];
  const defender = frontProposalV2(
    state, content, war, war.defenderId, militaryBaseSnapshot,
  );
  const attacker = aiAttackerMustStandDownV2(state, war)
    ? undefined
    : frontProposalV2(state, content, war, war.attackerId, militaryBaseSnapshot);
  let selected: FrontProposalV2 | undefined;
  if (!attacker || !defender) selected = attacker ?? defender;
  else if (attacker.candidate.viable !== defender.candidate.viable) {
    selected = attacker.candidate.viable ? attacker : defender;
  }
  const attackerPower = selectCurrentPowerV2(
    state, content, war.attackerId, militaryBaseSnapshot,
  );
  const defenderPower = selectCurrentPowerV2(
    state, content, war.defenderId, militaryBaseSnapshot,
  );
  if (!selected && defenderPower > attackerPower * 1.08) selected = defender;
  if (!selected && attackerPower > defenderPower * 1.08) selected = attacker;
  if (!selected) {
    selected = ((state.tick / BATTLE_INTERVAL_TICKS + Number(war.id.replace(/\D/g, ''))) % 2 === 0)
      ? attacker : defender;
  }
  if (!selected) {
    setCanonicalWarFrontV2(war, undefined);
    return [];
  }
  const operation = selected.existing ?? createOperationV2(
    state,
    selected.commanderId,
    selected.enemyId,
    selected.commanderId === war.defenderId,
    selected.candidate,
  );
  setCanonicalWarFrontV2(war, operation);
  return [operation];
}

function seedDeclaredWarFrontV2(
  state: WorldStateV2,
  content: WorldContentV2,
  war: WarStateV2,
): void {
  const proposal = frontProposalV2(state, content, war, war.attackerId);
  if (!proposal) {
    setCanonicalWarFrontV2(war, undefined);
    return;
  }
  setCanonicalWarFrontV2(war, proposal.existing ?? createOperationV2(
    state,
    proposal.commanderId,
    proposal.enemyId,
    false,
    proposal.candidate,
  ));
}

/** Keeps one visible operation ready before autonomous APEX planning runs. */
export function synchronizeWarFrontsV2(
  state: WorldStateV2,
  content: WorldContentV2,
): void {
  for (const war of state.wars) {
    if (isSurvivalRogueHumanMultiFrontWarV2(state, war)) {
      synchronizeSurvivalRogueHumanFrontsV2(state, content, war);
      continue;
    }
    const current = canonicalizeWarFrontV2(state, content, war);
    if (!current) chooseInitiativeOperationsV2(state, content, war);
  }
}

function moveCapitalAfterLossV2(state: WorldStateV2, formerOwner: PlayerId, lostId: TerritoryId): void {
  const nation = state.players[formerOwner];
  if (!nation || nation.capitalId !== lostId) return;
  const replacement = selectTerritoriesOfV2(state, formerOwner)
    .sort((a, b) => b.economy - a.economy || a.id.localeCompare(b.id))[0];
  if (replacement) nation.capitalId = replacement.id;
}

/**
 * Allocates a national food system back to the territory that physically
 * hosts it. The weights mirror the live agricultural model: residents,
 * calibrated self-sufficiency, terrain and economy all matter. The
 * share is deliberately physical rather than scaled by political integration:
 * a captured farm does not remain with a government because Signal Purge was
 * unfinished. A one-territory country carries its complete existing sector.
 */
function territoryFoodSystemShareV2(
  state: WorldStateV2,
  content: WorldContentV2,
  ownerId: PlayerId,
  territoryId: TerritoryId,
): number {
  const owned = selectTerritoriesOfV2(state, ownerId);
  if (owned.length === 0) return 0;
  const weight = (id: TerritoryId): number => {
    const territory = state.territories[id];
    const definition = content.territories[id];
    if (!territory || !definition) return 0;
    const calibratedRatio = Number.isFinite(definition.baseline.foodSelfSufficiencyRatio)
      ? clamp(definition.baseline.foodSelfSufficiencyRatio, 0.001, 3)
      : 1;
    const economicStrength = clamp(
      territory.economy / Math.max(0.10, definition.baseline.gdp),
      0.25,
      1.50,
    );
    return Math.max(0, territory.population)
      * calibratedRatio
      * clamp(Math.sqrt(economicStrength), 0.50, 1.20)
      * territoryTerrainFoodProductionMultiplierV2(content, id);
  };
  const total = owned.reduce((sum, territory) => sum + weight(territory.id), 0);
  if (total <= 0) {
    const populationTotal = owned.reduce((sum, territory) => (
      sum + Math.max(0, territory.population)
    ), 0);
    if (populationTotal <= 0) return owned.length === 1 ? 1 : 0;
    const territory = state.territories[territoryId];
    return clamp(
      Math.max(0, territory?.population ?? 0) / populationTotal,
      0,
      1,
    );
  }
  return clamp(weight(territoryId) / total, 0, 1);
}

interface CapturedFoodContinuityV2 {
  domesticCapacity: number;
  survivingStock: number;
}

function transferCapturedFoodSystemV2(
  state: WorldStateV2,
  content: WorldContentV2,
  oldOwnerId: PlayerId,
  newOwnerId: PlayerId,
  territoryId: TerritoryId,
): CapturedFoodContinuityV2 {
  const former = state.players[oldOwnerId];
  const successor = state.players[newOwnerId];
  if (!former || !successor) {
    return { domesticCapacity: 0, survivingStock: 0 };
  }
  const share = territoryFoodSystemShareV2(state, content, oldOwnerId, territoryId);
  const domesticCapacity = round(Math.max(0, former.domesticFoodCapacity) * share, 9);
  const localStock = round(Math.max(0, former.foodStock) * share, 9);
  const survivingStock = round(
    localStock * FOOD_CONQUEST_LOCAL_STOCK_RETENTION_SHARE,
    9,
  );

  // Capacity is conserved exactly. Local stores are removed exactly once;
  // only the bounded surviving share crosses to the new administration.
  former.domesticFoodCapacity = round(Math.max(
    0,
    former.domesticFoodCapacity - domesticCapacity,
  ), 9);
  successor.domesticFoodCapacity = round(
    successor.domesticFoodCapacity + domesticCapacity,
    9,
  );
  former.foodStock = round(Math.max(0, former.foodStock - localStock), 9);
  successor.foodStock = round(successor.foodStock + survivingStock, 9);
  return { domesticCapacity, survivingStock };
}

function captureTerritoryV2(
  state: WorldStateV2,
  content: WorldContentV2,
  sourceId: TerritoryId,
  targetId: TerritoryId,
  newOwner: PlayerId,
  access: 'land' | 'naval',
  decisiveVictory: boolean,
): CaptureOutcomeV2 {
  const source = state.territories[sourceId]!;
  const target = state.territories[targetId]!;
  const none: CaptureOutcomeV2 = { conquered: false, capturedPopulation: 0, capturedEconomy: 0, treasurySeized: 0 };
  if (!decisiveVictory
    || selectArmyCombatManpowerV2(state, target.owner, target.army) > 0.000000001
    || selectArmyCombatManpowerV2(state, newOwner, source.army) <= 0.000000001) return none;
  const oldOwner = target.owner;
  const attackerTraitContext = combatSideTraitContextV2(
    state, content, newOwner, sourceId, 'attacker', access,
  );
  const defenderTraitContext = combatSideTraitContextV2(
    state, content, oldOwner, targetId, 'defender', access,
  );
  const attackerPopulationBefore = selectTerritoriesOfV2(state, newOwner)
    .reduce((sum, territory) => sum + Math.max(0, territory.population), 0);
  // A decisive conquest transfers ownership immediately. The attacker keeps
  // its field army on the original side of the border; the new territory must
  // subsequently be reinforced through the deliberately slow logistics net.
  const sourceManpowerBefore = source.army.manpower;
  const sourceBaseAttack = source.army.baseAttack;
  const sourceBaseDefense = source.army.baseDefense;
  const requestedGuardForce = sourceManpowerBefore
    * CONQUEST_GUARD_MIN_TRANSFER_SHARE;
  beginTerritoryIntegrationV2(state, content, targetId, newOwner, access);
  invalidateTerritoryIndexV2(state);
  // Battle damage has already been committed above. Annexation preserves the
  // surviving people, production and infrastructure as latent potential;
  // administration initially unlocks ten percent and then integrates it.
  target.army.capacity = stateTerritoryArmyCapacityTargetV2(state, content, targetId, newOwner);
  const supportCeiling = stateTerritoryArmySupportCeilingV2(
    state, content, targetId, newOwner,
  );
  const minimumGuardForce = Math.min(requestedGuardForce, supportCeiling);
  const guardTransferBudget = sourceManpowerBefore
    * CONQUEST_CAPTURE_GUARD_MAX_TRANSFER_SHARE;
  const guardReinforcement = Math.min(
    Math.max(0, supportCeiling - minimumGuardForce),
    Math.max(0, guardTransferBudget - minimumGuardForce),
  );
  // Every defender is transferred from the surviving source formation. The
  // destination uses its local cap plus the scalable conquered-territory
  // empire allowance, while one capture can consume no more than 10% of the
  // source and therefore leaves at least 90% behind.
  const transferredManpower = Math.min(
    sourceManpowerBefore,
    supportCeiling,
    minimumGuardForce + guardReinforcement,
  );
  source.army.manpower = round(Math.max(0, sourceManpowerBefore - transferredManpower), 9);
  target.army.manpower = round(transferredManpower, 9);
  if (target.army.manpower > 0.000000001) {
    target.army.baseAttack = sourceBaseAttack;
    target.army.baseDefense = sourceBaseDefense;
  } else {
    resetEmptyArmyBaseQualityV2(target.army, content, targetId);
  }
  clearRogueWaveManpowerV2(state, targetId);
  if (newOwner === ROGUE_AI_NATION_ID_V2) {
    transferRogueWaveManpowerV2(
      state,
      sourceId,
      targetId,
      transferredManpower,
      sourceManpowerBefore,
    );
  }
  resetEmptyArmyBaseQualityV2(source.army, content, sourceId);
  moveCapitalAfterLossV2(state, oldOwner, targetId);
  const survivalMachineCapture = isSurvivalStateV2(state)
    && (isRogueAiNationV2(content, oldOwner) || isRogueAiNationV2(content, newOwner));
  if (survivalMachineCapture) {
    if (isRogueAiNationV2(content, newOwner) && !isRogueAiNationV2(content, oldOwner)) {
      adjustSurvivalWarPressureV2(state, oldOwner, 2);
    } else if (isRogueAiNationV2(content, oldOwner) && !isRogueAiNationV2(content, newOwner)) {
      adjustSurvivalWarPressureV2(
        state,
        newOwner,
        -SURVIVAL_RECAPTURE_PRESSURE_RELIEF_V2,
      );
    }
  } else {
    addWarFatigueGainV2(state, oldOwner, 2, defenderTraitContext);
    addWarFatigueGainV2(
      state,
      newOwner,
      conquestWarFatigueShockV2(target.population, attackerPopulationBefore),
      attackerTraitContext,
    );
  }
  let treasurySeized = 0;
  if (selectIsEliminatedV2(state, oldOwner)) {
    // A nation with no territory cannot keep training or retain a detached
    // reserve pool. Signal Purge is now stable and never restores it later.
    state.players[oldOwner]!.trainedReserves = 0;
    state.players[oldOwner]!.openingArmyBonus = null;
    // Forecast and resolution share the same defeated-owner replacement path.
    const treasurySeizureShare = selectTreasurySeizureShareV2(state, oldOwner);
    treasurySeized = round(
      Math.max(0, state.players[oldOwner]!.treasury) * treasurySeizureShare,
    );
    state.players[newOwner]!.treasury = round(state.players[newOwner]!.treasury + treasurySeized);
    state.players[oldOwner]!.treasury = 0;
    // Retired compatibility sentinels remain neutral after final collapse.
    state.players[oldOwner]!.foodStock = 0;
    state.players[oldOwner]!.domesticFoodCapacity = 0;
  }
  return {
    conquered: true,
    capturedPopulation: target.population,
    capturedEconomy: target.economy,
    treasurySeized,
    defeatedId: selectIsEliminatedV2(state, oldOwner) ? oldOwner : undefined,
  };
}

function applyCombatCasualtiesV2(
  state: WorldStateV2,
  ownerId: PlayerId,
  army: WorldStateV2['territories'][TerritoryId]['army'],
  requestedDamage: number,
): number {
  const manpowerBefore = Math.max(0, army.manpower);
  const casualties = Math.min(manpowerBefore, Math.max(0, requestedDamage));
  army.manpower = round(Math.max(0, manpowerBefore - casualties), 9);
  // Budget routing from the canonical state change at the same precision as
  // manpower. Six-decimal reporting could turn a real sub-millionth loss into
  // zero and incorrectly grant the routed tail a second full cap allowance.
  const appliedLoss = round(Math.max(0, manpowerBefore - army.manpower), 9);
  consumeOpeningArmyBonusLossV2(state, ownerId, appliedLoss);
  return appliedLoss;
}

const COOP_ALLY_SOURCE_COMMITMENT_SHARE_V2 = 0.18;
const COOP_ALLY_FRONT_STRENGTH_SHARE_V2 = 0.25;
const COOP_ALLY_COMBAT_EFFICIENCY_V2 = 0.85;
const COOP_ALLY_TREASURY_SPEND_SHARE_V2 = 0.01;
const COOP_ALLY_BATTLE_SUPPLY_WEEKS_V2 = 0.20;

interface ProjectedCoopAllySupportV2 {
  readonly contributorId: PlayerId;
  readonly sourceId: TerritoryId;
  readonly route: CoopMilitaryAccessRouteV2;
  readonly manpower: number;
  readonly displayPower: number;
  readonly attackPressure: number;
  readonly attackerShield: number;
  readonly defenseShield: number;
  readonly counterPressure: number;
  readonly logisticsCost: number;
  readonly supplySpent: number;
}

/**
 * At most one real teammate formation supports each side of a pulse. The
 * strongest legal bounded contingent wins deterministically; it stages over
 * authored friendly territory and is never copied into the war owner's army.
 */
export function selectCoopAllyBattleSupportV2(
  state: WorldStateV2,
  content: WorldContentV2,
  sideOwnerId: PlayerId,
  opponentId: PlayerId,
  stagingTerritoryId: TerritoryId,
  formalSideStrength: number,
  opposingAttack: number,
  role: 'attacker' | 'defender',
  operationAccess: 'land' | 'naval',
  terrainDefenseMultiplier: number,
  excludedSourceIds: ReadonlySet<TerritoryId> = new Set(),
): ProjectedCoopAllySupportV2 | undefined {
  if (!isHumanPlayerV2(state, sideOwnerId)
    || selectHumanPlayerIdsV2(state).length < 2
    || formalSideStrength <= EPSILON) return undefined;
  const candidates: ProjectedCoopAllySupportV2[] = [];
  for (const contributorId of selectHumanPlayerIdsV2(state)) {
    if (!areHumanTeammatesV2(state, sideOwnerId, contributorId)
      || contributorId === opponentId) continue;
    const nation = state.players[contributorId];
    if (!nation) continue;
    const sourceIds = selectTerritoriesOfV2(state, contributorId)
      .filter((territory) => !excludedSourceIds.has(territory.id)
        && selectArmyCombatManpowerV2(state, contributorId, territory.army) > EPSILON)
      .map((territory) => territory.id)
      .sort((left, right) => left.localeCompare(right));
    for (const sourceId of sourceIds) {
      const route = selectBestCoopFriendlyTransitRouteV2(
        state,
        content,
        contributorId,
        stagingTerritoryId,
        [sourceId],
      );
      if (!route) continue;
      const source = state.territories[sourceId]!;
      const sourceStrength = selectArmyCombatManpowerV2(
        state,
        contributorId,
        source.army,
      );
      const logistics = coopRouteLogisticsTermsV2(
        state,
        content,
        contributorId,
        route,
        true,
      );
      let manpower = Math.min(
        sourceStrength * COOP_ALLY_SOURCE_COMMITMENT_SHARE_V2,
        formalSideStrength * COOP_ALLY_FRONT_STRENGTH_SHARE_V2,
      ) * logistics.throughputMultiplier;
      if (logistics.costPerMillion > 0) {
        const spendLimit = Math.max(0, nation.treasury) * COOP_ALLY_TREASURY_SPEND_SHARE_V2;
        manpower = Math.min(manpower, spendLimit / logistics.costPerMillion);
      }
      if (manpower <= EPSILON) continue;
      const supply = supplyFactorV2(
        state,
        content,
        contributorId,
        sourceId,
        route.access,
        stagingTerritoryId,
      );
      const attack = selectEffectiveAttackV2(state, content, contributorId, source.army);
      const defense = selectEffectiveDefenseV2(state, content, contributorId, source.army);
      const effectiveStrength = manpower * supply * COOP_ALLY_COMBAT_EFFICIENCY_V2;
      const attackPressure = role === 'attacker'
        ? effectiveStrength * attack * WAR_ACCESS_ASSAULT_MULTIPLIER[operationAccess]
        : 0;
      const attackerShield = role === 'attacker'
        ? effectiveStrength * combatDefenseEffectV2(defense, opposingAttack)
        : 0;
      const defenseShield = role === 'defender'
        ? effectiveStrength * combatDefenseEffectV2(defense, opposingAttack)
          * DEFENDER_POSITION_MULTIPLIER * terrainDefenseMultiplier
        : 0;
      const counterPressure = role === 'defender'
        ? effectiveStrength * attack * DEFENDER_COUNTERFIRE_MULTIPLIER
        : 0;
      candidates.push({
        contributorId,
        sourceId,
        route,
        manpower,
        displayPower: round(1_000 * effectiveStrength * (0.55 * attack + 0.45 * defense), 3),
        attackPressure,
        attackerShield,
        defenseShield,
        counterPressure,
        logisticsCost: round(manpower * logistics.costPerMillion, 9),
        supplySpent: round(manpower / 52 * COOP_ALLY_BATTLE_SUPPLY_WEEKS_V2, 9),
      });
    }
  }
  return candidates.sort((left, right) => (
    right.displayPower - left.displayPower
      || left.contributorId.localeCompare(right.contributorId)
      || left.sourceId.localeCompare(right.sourceId)
  ))[0];
}

export interface CoopAllySupportPreviewV2 {
  readonly contributorId: PlayerId;
  readonly power: number;
  readonly manpower: number;
}

/** Compact current-front projection for the HUD; live battle revalidates it. */
export function selectCoopAllySupportPreviewV2(
  state: WorldStateV2,
  content: WorldContentV2,
  war: WarStateV2,
  sideOwnerId: PlayerId,
): CoopAllySupportPreviewV2 | undefined {
  const operation = [...war.attackerOperations, ...war.defenderOperations][0];
  if (!operation) return undefined;
  const source = state.territories[operation.sourceId];
  const target = state.territories[operation.targetId];
  if (!source || !target || (source.owner !== sideOwnerId && target.owner !== sideOwnerId)) {
    return undefined;
  }
  const projection = projectCombatExchangeV2(
    state,
    content,
    source.owner,
    target.owner,
    operation.sourceId,
    operation.targetId,
    operation.access,
  );
  if (!projection) return undefined;
  const role = source.owner === sideOwnerId ? 'attacker' : 'defender';
  const support = selectCoopAllyBattleSupportV2(
    state,
    content,
    sideOwnerId,
    role === 'attacker' ? target.owner : source.owner,
    role === 'attacker' ? operation.sourceId : operation.targetId,
    role === 'attacker' ? projection.attackerStrength : projection.defenderStrength,
    role === 'attacker' ? projection.defenderAttack : projection.attackerAttack,
    role,
    operation.access,
    territoryTerrainDefenseMultiplierV2(content, operation.targetId),
  );
  return support ? {
    contributorId: support.contributorId,
    power: support.displayPower,
    manpower: support.manpower,
  } : undefined;
}

function applyCoopAllyBattleSupportV2(
  state: WorldStateV2,
  support: ProjectedCoopAllySupportV2 | undefined,
  requestedLosses: number,
): CoopAllyBattleSupportV2 | undefined {
  if (!support) return undefined;
  const source = state.territories[support.sourceId];
  const nation = state.players[support.contributorId];
  if (!source || !nation || source.owner !== support.contributorId) return undefined;
  const losses = applyCombatCasualtiesV2(
    state,
    support.contributorId,
    source.army,
    requestedLosses,
  );
  const logisticsCost = Math.min(Math.max(0, nation.treasury), support.logisticsCost);
  nation.treasury = round(nation.treasury - logisticsCost, 9);
  // This is a military-logistics accounting fact, not a civilian commodity
  // debit. Route throughput and treasury spend bound the projection.
  const supplySpent = support.supplySpent;
  return {
    contributorId: support.contributorId,
    sourceId: support.sourceId,
    manpower: round(support.manpower, 9),
    power: round(support.displayPower, 3),
    losses: round(losses, 9),
    supplySpent,
    logisticsCost,
    access: support.route.access,
    distanceKm: round(support.route.distanceKm, 3),
  };
}

interface AppliedApexCounterpulseV2 {
  nationalLosses: number;
  allyLosses: number;
  totalLosses: number;
}

/**
 * Applies a compatibility counterpulse to real hostile personnel after the
 * ordinary exchange. The authoritative caller permits this only for Rogue
 * PRIME; human APEX reflection fields remain serializable but inert.
 */
function applyApexCounterpulseV2(input: {
  state: WorldStateV2;
  nationalOwnerId: PlayerId;
  nationalArmy: ArmyStateV2;
  projectedAllySupport?: ProjectedCoopAllySupportV2;
  appliedAllySupport?: CoopAllyBattleSupportV2;
  requestedDamage: number;
}): AppliedApexCounterpulseV2 {
  const nationalAvailable = Math.max(0, input.nationalArmy.manpower);
  const allyTerritory = input.projectedAllySupport
    ? input.state.territories[input.projectedAllySupport.sourceId]
    : undefined;
  const allyAvailable = input.projectedAllySupport
    && input.appliedAllySupport
    && allyTerritory?.owner === input.projectedAllySupport.contributorId
    ? Math.min(
        Math.max(0, allyTerritory.army.manpower),
        Math.max(
          0,
          input.projectedAllySupport.manpower - input.appliedAllySupport.losses,
        ),
      )
    : 0;
  const available = nationalAvailable + allyAvailable;
  const requestedDamage = Math.min(
    Math.max(0, input.requestedDamage),
    available,
  );
  if (requestedDamage <= EPSILON || available <= EPSILON) return {
    nationalLosses: 0,
    allyLosses: 0,
    totalLosses: 0,
  };
  const requestedAllyLosses = Math.min(
    allyAvailable,
    requestedDamage * allyAvailable / available,
  );
  const requestedNationalLosses = Math.min(
    nationalAvailable,
    Math.max(0, requestedDamage - requestedAllyLosses),
  );
  const nationalLosses = applyCombatCasualtiesV2(
    input.state,
    input.nationalOwnerId,
    input.nationalArmy,
    requestedNationalLosses,
  );
  const allyLosses = input.projectedAllySupport && allyTerritory
    ? applyCombatCasualtiesV2(
        input.state,
        input.projectedAllySupport.contributorId,
        allyTerritory.army,
        requestedAllyLosses,
      )
    : 0;
  if (input.appliedAllySupport && allyLosses > 0) {
    input.appliedAllySupport.losses = round(
      input.appliedAllySupport.losses + allyLosses,
      9,
    );
  }
  return {
    nationalLosses: round(nationalLosses, 9),
    allyLosses: round(allyLosses, 9),
    totalLosses: round(nationalLosses + allyLosses, 9),
  };
}

function nationalCombatManpowerV2(state: WorldStateV2, playerId: PlayerId): number {
  return selectTerritoriesOfV2(state, playerId).reduce((sum, territory) => (
    sum + selectArmyCombatManpowerV2(state, playerId, territory.army)
  ), 0);
}

function nationalCombatCapacityV2(state: WorldStateV2, playerId: PlayerId): number {
  return selectTerritoriesOfV2(state, playerId).reduce((sum, territory) => (
    sum + armyCombatCapacityV2(state, playerId, territory.army)
  ), 0);
}

/**
 * A battle only exposes a fraction of a very large population. This keeps
 * casualties visible in small and medium states without letting the same
 * pulse formula erase demographic giants in a handful of battles.
 */
export function civilianPopulationExposureV2(populationMillions: number): number {
  return clamp(1 / Math.sqrt(1 + Math.max(0, populationMillions) / 120), 0.30, 1);
}

export interface BattleWarScoreSwingInputV2 {
  attackerLosses: number;
  defenderLosses: number;
  attackerStrength: number;
  defenderStrength: number;
  /** Immediate battlefield pressure from the local attacker's perspective. */
  momentum: number;
  conquered: boolean;
}

/**
 * Converts one exchange into a scale-independent campaign score. Comparing
 * losses as shares of the armies involved prevents a million-person army from
 * earning points merely because every absolute number is large. Momentum
 * makes a clearly one-sided sequence visible within a few pulses, while a
 * territorial conquest remains the unmistakable strategic swing.
 */
export function battleWarScoreSwingV2(input: BattleWarScoreSwingInputV2): number {
  const attackerLossRate = Math.max(0, input.attackerLosses)
    / Math.max(0.000000001, input.attackerStrength);
  const defenderLossRate = Math.max(0, input.defenderLosses)
    / Math.max(0.000000001, input.defenderStrength);
  const totalLossRate = attackerLossRate + defenderLossRate;
  const relativeLossEdge = totalLossRate <= 0.000000001 ? 0
    : (defenderLossRate - attackerLossRate) / totalLossRate;
  const battleIntensity = clamp(totalLossRate / 0.08, 0.35, 1);
  const exchangeSwing = 6.5 * relativeLossEdge * (0.45 + 0.55 * battleIntensity);
  const momentumSwing = 3 * clamp(input.momentum, -1, 1);
  const battlefieldSwing = clamp(exchangeSwing + momentumSwing, -7, 7);
  return round(battlefieldSwing + (input.conquered ? 20 : 0), 3);
}

export function resolveBattlePulseV2(
  state: WorldStateV2,
  content: WorldContentV2,
  war: WarStateV2,
  operation: FrontOperationV2,
  usedAllySupportSourceIds: Set<TerritoryId> = new Set(),
  militaryBaseSnapshot: MilitaryBaseSnapshotV2 = createMilitaryBaseSnapshotV2(state, content),
): BattleEventV2 | undefined {
  const source = state.territories[operation.sourceId];
  const target = state.territories[operation.targetId];
  if (!source || !target) return undefined;
  const attackerId = source.owner;
  const defenderId = target.owner;
  if (attackerId === defenderId || operation.commanderId !== attackerId) return undefined;
  const campaign = ensureWarCampaignStateV2(state, war);
  const mobilizationTicks = campaignWarMobilizationTicksV2(state, content, war);
  const attackerTraitContext = traitOperationContextV2(
    state, content, war, operation, attackerId,
  );
  const defenderTraitContext = traitOperationContextV2(
    state, content, war, operation, defenderId,
  );
  const escalatedWarAge = Math.max(
    0,
    state.tick - war.startedTick - mobilizationTicks,
  );
  const varianceA = battleDamageVarianceV2(nextRandom(state), escalatedWarAge);
  const varianceD = battleDamageVarianceV2(nextRandom(state), escalatedWarAge);
  const commanderSupport = selectCommanderBattleSupportV2(
    state, war, operation, content,
  );
  const hasCommanderEffect = Boolean(
    commanderSupport.attacker
      || commanderSupport.defender
      || commanderSupport.attackerLogistics
      || commanderSupport.defenderLogistics,
  );
  const projection = projectCombatExchangeV2(
    state, content, attackerId, defenderId,
    operation.sourceId, operation.targetId, operation.access,
    varianceA, varianceD,
    militaryBaseSnapshot,
  );
  if (!projection) return undefined;
  const supportingForces = projection.supportingForces;
  const sourceNationalStrength = projection.attackerStrength;
  const targetNationalStrength = projection.defenderStrength;
  const commanderAttackerId = commanderSupport.attacker?.playerId
    ?? commanderSupport.attackerLogistics?.playerId ?? null;
  const commanderDefenderId = commanderSupport.defender?.playerId
    ?? commanderSupport.defenderLogistics?.playerId ?? null;
  // APEX/PRIME are sidecars. They modify the existing formations but never
  // add manpower to capture, defeat, loss-rate or stalemate denominators.
  const commanderAttackerStrength = 0;
  const commanderDefenderStrength = 0;
  const commanderAttackerSupplyDelivered = Math.min(
    commanderSupport.attackerLogistics?.availableSupply ?? 0,
    sourceNationalStrength * Math.max(0, 1 - projection.attackerSupply),
  );
  const commanderDefenderSupplyDelivered = Math.min(
    commanderSupport.defenderLogistics?.availableSupply ?? 0,
    targetNationalStrength * Math.max(0, 1 - projection.defenderSupply),
  );
  const attackerSupply = clampCommanderBattleSupplyV2(
    projection.attackerSupply
      + commanderAttackerSupplyDelivered / Math.max(EPSILON, sourceNationalStrength),
  );
  const defenderSupply = clampCommanderBattleSupplyV2(
    projection.defenderSupply
      + commanderDefenderSupplyDelivered / Math.max(EPSILON, targetNationalStrength),
  );
  const terrainDefenseMultiplier = territoryTerrainDefenseMultiplierV2(
    content,
    operation.targetId,
  );
  const allyAttackerSupport = selectCoopAllyBattleSupportV2(
    state,
    content,
    attackerId,
    defenderId,
    operation.sourceId,
    sourceNationalStrength,
    projection.defenderAttack,
    'attacker',
    operation.access,
    terrainDefenseMultiplier,
    usedAllySupportSourceIds,
  );
  const allyDefenderSupport = selectCoopAllyBattleSupportV2(
    state,
    content,
    defenderId,
    attackerId,
    operation.targetId,
    targetNationalStrength,
    projection.attackerAttack,
    'defender',
    operation.access,
    terrainDefenseMultiplier,
    new Set([
      ...usedAllySupportSourceIds,
      ...(allyAttackerSupport ? [allyAttackerSupport.sourceId] : []),
    ]),
  );
  const hasAugmentedEffect = hasCommanderEffect
    || Boolean(allyAttackerSupport || allyDefenderSupport);
  const nationalAttackPressure = projection.attackPressure
    * attackerSupply / Math.max(EPSILON, projection.attackerSupply)
      + (allyAttackerSupport?.attackPressure ?? 0);
  const nationalDefenseShield = projection.defenseShield
    * defenderSupply / Math.max(EPSILON, projection.defenderSupply)
      + (allyDefenderSupport?.defenseShield ?? 0);
  const nationalCounterPressure = projection.counterPressure
    * defenderSupply / Math.max(EPSILON, projection.defenderSupply)
      + (allyDefenderSupport?.counterPressure ?? 0);
  const nationalAttackerShield = projection.attackerShield
    * attackerSupply / Math.max(EPSILON, projection.attackerSupply)
      + (allyAttackerSupport?.attackerShield ?? 0);
  const commanderAttackerCombat = projectCommanderAttackerCombatV2({
    state,
    content,
    ownerId: attackerId,
    opponentId: defenderId,
    sourceId: operation.sourceId,
    targetId: operation.targetId,
    access: operation.access,
    nationalAttackPressure,
    nationalAttackerShield,
    attackMultiplier: commanderSupport.attacker?.attackMultiplier ?? 1,
    defenseMultiplier: commanderSupport.attacker?.defenseMultiplier ?? 1,
  });
  const commanderDefenderCombat = projectCommanderDefenderCombatV2({
    state,
    content,
    ownerId: defenderId,
    opponentId: attackerId,
    sourceId: operation.sourceId,
    targetId: operation.targetId,
    nationalDefenseShield,
    nationalCounterPressure,
    attackMultiplier: commanderSupport.defender?.attackMultiplier ?? 1,
    defenseMultiplier: commanderSupport.defender?.defenseMultiplier ?? 1,
  });
  const commanderAttackerPower = commanderAttackerCombat.attackPressure;
  const commanderAttackerShield = commanderAttackerCombat.attackerShield;
  const commanderDefenderPower = commanderDefenderCombat.defensePower;
  const commanderCounterPressure = commanderDefenderCombat.counterPressure;
  const augmentedExchange = projectCommanderAugmentedExchangeV2({
    projection,
    access: operation.access,
    varianceA,
    varianceD,
    hasCommanderEffect: hasAugmentedEffect,
    nationalAttackPressure,
    nationalDefenseShield,
    nationalCounterPressure,
    nationalAttackerShield,
    commanderAttackerStrength,
    commanderDefenderStrength,
    allyAttackerStrength: allyAttackerSupport?.manpower ?? 0,
    allyDefenderStrength: allyDefenderSupport?.manpower ?? 0,
    commanderAttackerPower,
    commanderAttackerShield,
    commanderDefenderPower,
    commanderCounterPressure,
  });
  const {
    attackPressure,
    defenseShield,
    counterPressure,
    attackerShield,
    sourceStrength,
    targetStrength,
    attackRatio,
    counterRatio,
    requestedAttackerLosses: baseRequestedAttackerLosses,
    requestedDefenderLosses: baseRequestedDefenderLosses,
  } = augmentedExchange;
  const commanderAttackerPulseRequest = resolveCommanderStandaloneDamageV2(
    commanderSupport.attacker?.playerId,
    {
      pulseAttack: commanderSupport.attacker?.pulseAttack ?? 0,
      nationalParticipatingManpower: sourceNationalStrength,
      hostileCurrentManpower: targetNationalStrength,
    },
  );
  const commanderDefenderPulseRequest = resolveCommanderStandaloneDamageV2(
    commanderSupport.defender?.playerId,
    {
      pulseAttack: commanderSupport.defender?.pulseAttack ?? 0,
      nationalParticipatingManpower: targetNationalStrength,
      hostileCurrentManpower: sourceNationalStrength,
    },
  );
  const liveAttackerDamageMultiplier = selectApexOperationalArmyModifiersV2(
    state,
    attackerId,
  ).armyCasualtyMultiplier;
  const liveDefenderDamageMultiplier = selectApexOperationalArmyModifiersV2(
    state,
    defenderId,
  ).armyCasualtyMultiplier;
  const attackerEmpireCapacity = projection.attackerEmpireCapacity
    + (allyAttackerSupport
      ? militaryBaseSnapshot.armyCapacityByNation.get(
        allyAttackerSupport.contributorId,
      ) ?? 0 : 0);
  const defenderEmpireCapacity = projection.defenderEmpireCapacity
    + (allyDefenderSupport
      ? militaryBaseSnapshot.armyCapacityByNation.get(
        allyDefenderSupport.contributorId,
      ) ?? 0 : 0);
  const attackerHit = resolveFrontlineHitV2({
    requestedBaseDamage: baseRequestedAttackerLosses,
    requestedApexDamage: commanderDefenderPulseRequest,
    receivingDamageMultiplier: liveAttackerDamageMultiplier,
    frontlineManpower: sourceStrength,
    empireArmyCapacity: attackerEmpireCapacity,
  });
  const defenderHit = resolveFrontlineHitV2({
    requestedBaseDamage: baseRequestedDefenderLosses,
    requestedApexDamage: commanderAttackerPulseRequest,
    receivingDamageMultiplier: liveDefenderDamageMultiplier,
    frontlineManpower: targetStrength,
    empireArmyCapacity: defenderEmpireCapacity,
  });
  const commanderAttackerPulseDamage = defenderHit.apexDamage;
  const commanderDefenderPulseDamage = attackerHit.apexDamage;
  const requestedAttackerLosses = attackerHit.totalDamage;
  const requestedDefenderLosses = defenderHit.totalDamage;
  const defenderDamageAllocation = allocateApexFrontlineDamageV2({
    requestedDamage: requestedDefenderLosses,
    nationalManpower: targetNationalStrength,
    allyManpower: allyDefenderSupport?.manpower ?? 0,
    hostileManpower: sourceNationalStrength,
    ...(commanderSupport.defender ? {
      apex: {
        shieldActive: true,
        integrity: commanderSupport.defender.shieldIntegrity,
        maxIntegrity: commanderSupport.defender.maxShieldIntegrity,
        mirrorMatrixEligible: commanderSupport.defender.mirrorMatrixEligible,
        interceptEfficiency: commanderSupport.defender.interceptEfficiency,
      },
    } : {}),
  });
  const attackerDamageAllocation = allocateApexFrontlineDamageV2({
    requestedDamage: requestedAttackerLosses,
    nationalManpower: sourceNationalStrength,
    allyManpower: allyAttackerSupport?.manpower ?? 0,
    hostileManpower: targetNationalStrength,
    ...(commanderSupport.attacker ? {
      apex: {
        shieldActive: true,
        integrity: commanderSupport.attacker.shieldIntegrity,
        maxIntegrity: commanderSupport.attacker.maxShieldIntegrity,
        mirrorMatrixEligible: commanderSupport.attacker.mirrorMatrixEligible,
        interceptEfficiency: commanderSupport.attacker.interceptEfficiency,
      },
    } : {}),
  });
  const requestedCommanderDefenderLosses = defenderDamageAllocation.apexLosses;
  const requestedCommanderAttackerLosses = attackerDamageAllocation.apexLosses;
  const requestedAllyDefenderLosses = defenderDamageAllocation.allyLosses;
  const requestedAllyAttackerLosses = attackerDamageAllocation.allyLosses;
  const requestedRegularDefenderLosses = defenderDamageAllocation.nationalLosses;
  const requestedRegularAttackerLosses = attackerDamageAllocation.nationalLosses;
  const sourceManpowerBeforeCasualties = source.army.manpower;
  const targetManpowerBeforeCasualties = target.army.manpower;
  const sourceCapacity = Math.max(source.army.capacity, source.army.manpower);
  const targetCapacity = Math.max(target.army.capacity, target.army.manpower);
  const targetLocalCapacity = Math.max(0, target.army.capacity);
  const directRegularDamageToDefender = applyCombatCasualtiesV2(
    state, defenderId, target.army, requestedRegularDefenderLosses,
  );
  const directRegularDamageToAttacker = applyCombatCasualtiesV2(
    state, attackerId, source.army, requestedRegularAttackerLosses,
  );
  const commanderDamageToDefender = applyCommanderCasualtiesV2(
    state, commanderSupport.defender?.playerId ?? null, requestedCommanderDefenderLosses,
  );
  const commanderDamageToAttacker = applyCommanderCasualtiesV2(
    state, commanderSupport.attacker?.playerId ?? null, requestedCommanderAttackerLosses,
  );
  if (commanderSupport.defender?.playerId === ROGUE_AI_NATION_ID_V2) {
    recordRoguePrimeCasualtiesV2(state, commanderDamageToDefender, attackerId);
  }
  if (commanderSupport.attacker?.playerId === ROGUE_AI_NATION_ID_V2) {
    recordRoguePrimeCasualtiesV2(state, commanderDamageToAttacker, defenderId);
  }
  const allyDefenderBattleSupport = applyCoopAllyBattleSupportV2(
    state,
    allyDefenderSupport,
    requestedAllyDefenderLosses,
  );
  const allyAttackerBattleSupport = applyCoopAllyBattleSupportV2(
    state,
    allyAttackerSupport,
    requestedAllyAttackerLosses,
  );
  if (allyDefenderBattleSupport) usedAllySupportSourceIds.add(
    allyDefenderBattleSupport.sourceId,
  );
  if (allyAttackerBattleSupport) usedAllySupportSourceIds.add(
    allyAttackerBattleSupport.sourceId,
  );
  // A compatibility-only, non-recursive damage step for Rogue PRIME. Human
  // APEX reflection data is ignored at this authoritative boundary.
  const defenderCounterpulse = applyApexCounterpulseV2({
    state,
    nationalOwnerId: attackerId,
    nationalArmy: source.army,
    ...(allyAttackerSupport && allyAttackerBattleSupport ? {
      projectedAllySupport: allyAttackerSupport,
      appliedAllySupport: allyAttackerBattleSupport,
    } : {}),
    requestedDamage: Math.min(
      (commanderCanDealStandaloneDamageV2(commanderSupport.defender?.playerId)
        ? defenderDamageAllocation.counterpulseDamage : 0)
        * liveAttackerDamageMultiplier,
      Math.max(0, attackerHit.hitCap - attackerHit.totalDamage),
    ),
  });
  const attackerCounterpulse = applyApexCounterpulseV2({
    state,
    nationalOwnerId: defenderId,
    nationalArmy: target.army,
    ...(allyDefenderSupport && allyDefenderBattleSupport ? {
      projectedAllySupport: allyDefenderSupport,
      appliedAllySupport: allyDefenderBattleSupport,
    } : {}),
    requestedDamage: Math.min(
      (commanderCanDealStandaloneDamageV2(commanderSupport.attacker?.playerId)
        ? attackerDamageAllocation.counterpulseDamage : 0)
        * liveDefenderDamageMultiplier,
      Math.max(0, defenderHit.hitCap - defenderHit.totalDamage),
    ),
  });
  const regularDamageToDefender = round(
    directRegularDamageToDefender + attackerCounterpulse.nationalLosses,
    9,
  );
  const regularDamageToAttacker = round(
    directRegularDamageToAttacker + defenderCounterpulse.nationalLosses,
    9,
  );
  if (defenderId === ROGUE_AI_NATION_ID_V2) {
    recordRogueWaveCasualtiesV2(
      state,
      operation.targetId,
      targetManpowerBeforeCasualties,
      regularDamageToDefender,
      attackerId,
    );
  }
  if (attackerId === ROGUE_AI_NATION_ID_V2) {
    recordRogueWaveCasualtiesV2(
      state,
      operation.sourceId,
      sourceManpowerBeforeCasualties,
      regularDamageToAttacker,
      defenderId,
    );
  }
  const commanderAttackerSupplySpent = consumeCommanderSupplyV2(
    state,
    commanderSupport.attacker?.playerId ?? null,
    commanderAttackerStrength,
  );
  const commanderDefenderSupplySpent = consumeCommanderSupplyV2(
    state,
    commanderSupport.defender?.playerId ?? null,
    commanderDefenderStrength,
  );
  consumeCommanderSupplyV2(
    state,
    commanderSupport.attackerLogistics?.playerId ?? null,
    commanderAttackerSupplyDelivered,
  );
  consumeCommanderSupplyV2(
    state,
    commanderSupport.defenderLogistics?.playerId ?? null,
    commanderDefenderSupplyDelivered,
  );
  const lancerBattleCommit = registerApexSupportedAssaultBattleV2(
    state,
    commanderSupport.attacker,
  );
  const activeHumanApexIds = [
    commanderSupport.attacker?.playerId,
    commanderSupport.defender?.playerId,
  ].filter((playerId): playerId is PlayerId => Boolean(
    playerId && isHumanPlayerV2(state, playerId),
  )).filter((playerId, index, all) => all.indexOf(playerId) === index)
    .sort((left, right) => left.localeCompare(right));
  for (const playerId of activeHumanApexIds) {
    // Damage and battle energy are already booked. The lifecycle helper keeps
    // a damaged dome projected until true zero Integrity, then atomically
    // extracts it so a later pulse cannot reuse a collapsed shield.
    retreatApexForRecoveryV2(state, content, playerId);
  }
  const personnelDamageToDefender = regularDamageToDefender
    + (allyDefenderBattleSupport?.losses ?? 0);
  const personnelDamageToAttacker = regularDamageToAttacker
    + (allyAttackerBattleSupport?.losses ?? 0);
  const terrain = content.territories[operation.targetId]!.terrain;
  const civilianRisk = 1;
  const sourceCivilianRisk = 1;
  const protectionLevel = state.players[defenderId]!.research.effectLevels['casualty-reduction'];
  const attackerProtectionLevel = state.players[attackerId]!.research.effectLevels['casualty-reduction'];
  const civilianProtection = 1 - 0.25 * protectionLevel / (protectionLevel + 30);
  const attackerCivilianProtection = 1 - 0.25 * attackerProtectionLevel / (attackerProtectionLevel + 30);
  const battleIntensity = personnelDamageToAttacker + personnelDamageToDefender;
  const defenderPopulationExposure = civilianPopulationExposureV2(target.population);
  const attackerPopulationExposure = civilianPopulationExposureV2(source.population);
  const requestedDefenderPopulationLoss = Math.min(
    target.population * DEFENDER_CIVILIAN_LOSS_POPULATION_CAP * defenderPopulationExposure,
    battleIntensity * DEFENDER_CIVILIAN_LOSS_INTENSITY
      * defenderPopulationExposure * civilianRisk * civilianProtection,
  );
  const requestedAttackerPopulationLoss = Math.min(
    source.population * ATTACKER_CIVILIAN_LOSS_POPULATION_CAP * attackerPopulationExposure,
    requestedDefenderPopulationLoss * ATTACKER_CIVILIAN_LOSS_DEFENDER_SHARE,
    battleIntensity * ATTACKER_CIVILIAN_LOSS_INTENSITY
      * attackerPopulationExposure * sourceCivilianRisk * attackerCivilianProtection,
  );
  const economyLoss = Math.min(
    target.economy * 0.00150,
    regularDamageToDefender * 1.50 * civilianRisk,
  );
  const sourcePopulationBefore = source.population;
  const targetPopulationBefore = target.population;
  const sourcePopulationFloor = isSurvivalScorchedTransitTerritoryV2(
    state,
    operation.sourceId,
  ) ? 0 : 0.01;
  const targetPopulationFloor = isSurvivalScorchedTransitTerritoryV2(
    state,
    operation.targetId,
  ) ? 0 : 0.01;
  source.population = round(Math.max(
    sourcePopulationFloor,
    sourcePopulationBefore - requestedAttackerPopulationLoss,
  ));
  target.population = round(Math.max(
    targetPopulationFloor,
    targetPopulationBefore - requestedDefenderPopulationLoss,
  ));
  // Report and accumulate only the loss actually applied after the canonical
  // territory population floor, never the larger pre-clamp request.
  const attackerPopulationLoss = round(Math.max(0, sourcePopulationBefore - source.population));
  const defenderPopulationLoss = round(Math.max(0, targetPopulationBefore - target.population));
  const populationLoss = defenderPopulationLoss;
  target.economy = round(Math.max(
    isSurvivalScorchedTransitTerritoryV2(state, operation.targetId) ? 0 : 0.10,
    target.economy - economyLoss,
  ));
  const sourcePersonnelStrength = sourceNationalStrength
    + (allyAttackerSupport?.manpower ?? 0);
  const targetPersonnelStrength = targetNationalStrength
    + (allyDefenderSupport?.manpower ?? 0);
  const defenderLossShare = personnelDamageToDefender
    / Math.max(1e-9, targetPersonnelStrength);
  const attackerLossShare = personnelDamageToAttacker
    / Math.max(1e-9, sourcePersonnelStrength);
  const damageEdge = (defenderLossShare - attackerLossShare)
    / Math.max(1e-9, defenderLossShare + attackerLossShare);
  const supplyEdge = attackerSupply - defenderSupply;
  const battlefieldDominance = attackPressure / Math.max(0.000001, attackPressure + defenseShield);
  const collapse = smoothstep(0.50, 0.98, battlefieldDominance);
  const pressure = clamp(0.60 * damageEdge + 0.20 * supplyEdge + 0.20 * collapse, -1, 1);
  const undefendedNation = targetNationalStrength <= 0.000001
    && nationalCombatManpowerV2(state, defenderId) <= 0.000001;
  const leadingClaimant = undefendedNation ? capitulationVictorV2(state, defenderId) : undefined;
  const attackerFormal = attackerId === war.attackerId;
  const priorInflictedLosses = attackerFormal ? war.defenderLosses : war.attackerLosses;
  const contributionThreshold = Math.max(0.000001,
    targetCapacity * CAPTURE_MIN_CONTRIBUTION_SHARE);
  const earnedDecisiveClaim = targetNationalStrength > 0
    && priorInflictedLosses + regularDamageToDefender >= contributionThreshold;
  const sourceStrengthAfter = selectArmyCombatManpowerV2(state, attackerId, source.army);
  const targetStrengthAfter = selectArmyCombatManpowerV2(state, defenderId, target.army);
  const decisiveSurrender = targetStrengthAfter > 0.000000001
    && state.tick - operation.startedTick >= DECISIVE_SURRENDER_MIN_FRONT_TICKS
    && targetStrengthAfter / Math.max(0.000001, targetCapacity)
      <= DECISIVE_SURRENDER_MAX_DEFENDER_FILL
    && sourceStrengthAfter / Math.max(0.000001, targetStrengthAfter)
      >= DECISIVE_SURRENDER_MIN_FORCE_RATIO
    && priorInflictedLosses + regularDamageToDefender
      >= targetCapacity * DECISIVE_SURRENDER_MIN_CUMULATIVE_LOSS_SHARE
    && operation.momentum >= DECISIVE_SURRENDER_MIN_MOMENTUM
    && pressure > 0;
  // Resolve the local collapse only after all ordinary, allied, shield and
  // compatibility allocations. APEX is a sidecar and therefore contributes no
  // manpower to this threshold; a living national attacker must still exist.
  const localFormationCapitulation = targetManpowerBeforeCasualties > EPSILON
    && sourceStrengthAfter > EPSILON
    && targetStrengthAfter <= localFormationCapitulationThresholdV2(targetLocalCapacity);
  const formationCapitulated = localFormationCapitulation || decisiveSurrender;
  if (formationCapitulated) {
    // The remaining formation lays down its arms; it is removed from active
    // manpower but is not rewritten as battle casualties. No ownership or
    // partial-control state changes before the decisive capture below.
    const surrenderedManpower = Math.max(0, target.army.manpower);
    target.army.manpower = 0;
    if (defenderId === ROGUE_AI_NATION_ID_V2) {
      clearRogueWaveManpowerV2(state, operation.targetId);
    }
    consumeOpeningArmyBonusLossV2(state, defenderId, surrenderedManpower);
    resetEmptyArmyBaseQualityV2(target.army, content, operation.targetId);
  }
  // Empty local land is decided in one real battle pulse. If the whole nation
  // has already collapsed across simultaneous wars, its leading contributor
  // receives the claim deterministically instead of a late entrant.
  const earnedUnopposedClaim = targetNationalStrength <= 0.000001
    && (!undefendedNation || leadingClaimant === attackerId);
  const capture = captureTerritoryV2(
    state,
    content,
    operation.sourceId,
    operation.targetId,
    attackerId,
    operation.access,
    earnedDecisiveClaim || earnedUnopposedClaim || formationCapitulated,
  );
  const conquered = capture.conquered;
  for (const territoryId of [operation.sourceId, operation.targetId]) {
    const battleTerritory = state.territories[territoryId]!;
    const army = battleTerritory.army;
    army.capacity = stateTerritoryArmyCapacityTargetV2(
      state,
      content,
      territoryId,
      battleTerritory.owner,
    );
    army.manpower = round(Math.max(0, army.manpower), 9);
    resetEmptyArmyBaseQualityV2(army, content, territoryId);
  }
  if (conquered) {
    war.attackerOperations = [];
    war.defenderOperations = [];
    if (attackerFormal) campaign.attackerCaptures += 1;
    else campaign.defenderCaptures += 1;
    campaign.consolidationUntilTick = Math.min(
      campaign.expiresTick,
      state.tick + WAR_CAPTURE_CONSOLIDATION_TICKS,
    );
    if (!capture.defeatedId && !war.revenge) {
      war.revenge = {
        claimantId: defenderId,
        triggeredTick: state.tick,
        expiresTick: state.tick + WAR_REVENGE_WINDOW_TICKS,
      };
      addWorldEventV2(
        state,
        'war',
        'action',
        `${content.nations[defenderId]?.name ?? defenderId} gained a one-year counteroffensive priority after losing ${content.territories[operation.targetId]?.name ?? operation.targetId}.`,
        operation.targetId,
        defenderId,
      );
    }
  }

  war.battles += 1;
  war.lastBattleTick = state.tick;
  operation.lastBattleTick = state.tick;
  operation.momentum = round(clamp(operation.momentum * 0.7 + pressure * 0.3, -1, 1));
  const localAttackerScoreSwing = battleWarScoreSwingV2({
    attackerLosses: personnelDamageToAttacker,
    defenderLosses: personnelDamageToDefender,
    attackerStrength: sourcePersonnelStrength,
    defenderStrength: targetPersonnelStrength,
    momentum: pressure,
    conquered,
  });
  if (attackerFormal) {
    war.attackerLosses = round(
      war.attackerLosses + personnelDamageToAttacker,
      9,
    );
    war.defenderLosses = round(
      war.defenderLosses + personnelDamageToDefender,
      9,
    );
    war.attackerCivilianLosses = round(
      (war.attackerCivilianLosses ?? 0) + attackerPopulationLoss,
    );
    war.defenderCivilianLosses = round(
      (war.defenderCivilianLosses ?? 0) + defenderPopulationLoss,
    );
    war.warScore = round(war.warScore + localAttackerScoreSwing);
  } else {
    war.defenderLosses = round(
      war.defenderLosses + personnelDamageToAttacker,
      9,
    );
    war.attackerLosses = round(
      war.attackerLosses + personnelDamageToDefender,
      9,
    );
    war.defenderCivilianLosses = round(
      (war.defenderCivilianLosses ?? 0) + attackerPopulationLoss,
    );
    war.attackerCivilianLosses = round(
      (war.attackerCivilianLosses ?? 0) + defenderPopulationLoss,
    );
    war.warScore = round(war.warScore - localAttackerScoreSwing);
  }
  const attackerCapacity = selectTotalManpowerV2(state, attackerId).capacity;
  const defenderCapacity = selectTotalManpowerV2(state, defenderId).capacity;
  const battleFatigueMultiplier = operation.access === 'naval'
    ? NAVAL_BATTLE_FATIGUE_MULTIPLIER : 1;
  const permanentSurvivalWar = isPermanentRogueWarV2(state, war);
  addWarFatigueGainV2(
    state,
    attackerId,
    permanentSurvivalWar
      ? survivalBattlePressureGainV2(
        regularDamageToAttacker / Math.max(0.000001, sourceNationalStrength),
        attackerSupply,
      )
      : (0.08 + 4 * regularDamageToAttacker / Math.max(0.000001, attackerCapacity))
        * battleFatigueMultiplier,
    attackerTraitContext,
  );
  addWarFatigueGainV2(
    state,
    defenderId,
    permanentSurvivalWar
      ? survivalBattlePressureGainV2(
        regularDamageToDefender / Math.max(0.000001, targetNationalStrength),
        defenderSupply,
      )
      : (0.08 + 4 * regularDamageToDefender / Math.max(0.000001, defenderCapacity))
        * battleFatigueMultiplier,
    defenderTraitContext,
  );
  for (const support of [allyAttackerBattleSupport, allyDefenderBattleSupport]) {
    if (!support || support.losses <= 0) continue;
    addWarFatigueGainV2(
      state,
      support.contributorId,
      0.04 + 2 * support.losses / Math.max(
        0.000001,
        selectTotalManpowerV2(state, support.contributorId).capacity,
      ),
    );
  }

  const event: BattleEventV2 = {
    warId: war.id,
    source: operation.sourceId,
    target: operation.targetId,
    attacker: attackerId,
    defender: defenderId,
    sourceId: operation.sourceId,
    targetId: operation.targetId,
    attackerId,
    defenderId,
    attackerLosses: round(personnelDamageToAttacker, 9),
    defenderLosses: round(personnelDamageToDefender, 9),
    regularAttackerLosses: round(regularDamageToAttacker, 9),
    regularDefenderLosses: round(regularDamageToDefender, 9),
    commanderAttackerId,
    commanderDefenderId,
    commanderAttackerLosses: round(commanderDamageToAttacker, 9),
    commanderDefenderLosses: round(commanderDamageToDefender, 9),
    commanderAttackerInterceptedDamage: round(
      attackerDamageAllocation.interceptedDamage,
      9,
    ),
    commanderDefenderInterceptedDamage: round(
      defenderDamageAllocation.interceptedDamage,
      9,
    ),
    commanderAttackerCounterpulseDamage: attackerCounterpulse.totalLosses,
    commanderDefenderCounterpulseDamage: defenderCounterpulse.totalLosses,
    commanderAttackerPulseDamage,
    commanderDefenderPulseDamage,
    // Compatibility/protocol field: retired human Pulse charge never fires.
    commanderAttackerSingularityPulse: false,
    commanderAttackerProjection: commanderSupport.attacker?.projection ?? null,
    commanderDefenderProjection: commanderSupport.defender?.projection ?? null,
    commanderAttackerProjectionShare:
      commanderSupport.attacker?.projectionCombatShare ?? 0,
    commanderDefenderProjectionShare:
      commanderSupport.defender?.projectionCombatShare ?? 0,
    commanderAttackerPower: round(commanderAttackerPower),
    commanderDefenderPower: round(commanderDefenderPower),
    commanderAttackerSupplySpent: round(commanderAttackerSupplySpent),
    commanderDefenderSupplySpent: round(commanderDefenderSupplySpent),
    commanderAttackerSupplyDelivered: round(commanderAttackerSupplyDelivered),
    commanderDefenderSupplyDelivered: round(commanderDefenderSupplyDelivered),
    ...(allyAttackerBattleSupport ? { allyAttackerSupport: allyAttackerBattleSupport } : {}),
    ...(allyDefenderBattleSupport ? { allyDefenderSupport: allyDefenderBattleSupport } : {}),
    attackerPopulationLoss: round(attackerPopulationLoss),
    defenderPopulationLoss: round(defenderPopulationLoss),
    populationLoss: round(populationLoss),
    economyLoss: round(economyLoss),
    capturedPopulation: capture.capturedPopulation,
    capturedEconomy: capture.capturedEconomy,
    treasurySeized: capture.treasurySeized,
    conquered,
    terrain,
    tactic: doctrineTactic[operation.doctrine],
    phase: 'assault',
    attackerPower: round(attackPressure),
    defenderPower: round(defenseShield),
    operation: operation.doctrine,
    attackerSupply: round(attackerSupply),
    defenderSupply: round(defenderSupply),
    momentum: operation.momentum,
    supportingForces,
    tick: state.tick,
  };
  recordApexWarBattleTelemetryV2(state, war, event, {
    attackerOverdriveShield: lancerBattleCommit.singularityPulse,
  });
  if (capture.defeatedId) {
    addWorldEventV2(
      state,
      'conquest',
      'critical',
      `${content.nations[attackerId]?.name ?? attackerId} defeated ${content.nations[capture.defeatedId]?.name ?? capture.defeatedId} and conquered its land.`,
      undefined,
      attackerId,
    );
  }
  if (conquered) {
    recordApexConquestNarrativeV2(
      state,
      content,
      attackerId,
      defenderId,
      operation.targetId,
      capture.defeatedId,
    );
  }
  // Tactical pulses and routine border captures are rendered live on the map.
  // The strategic World Events history is intentionally reserved for wars,
  // peace, federations, breakthroughs and complete national defeats.
  // One conquest can invalidate a source or target used by another simultaneous
  // war. Revalidate the whole active set before end-of-tick invariants run.
  clearInvalidWarOperationsV2(state, content);
  return event;
}

function addTruceV2(
  state: WorldStateV2,
  leftId: PlayerId,
  rightId: PlayerId,
  durationTicks = TRUCE_TICKS,
): void {
  const [left, right] = leftId < rightId ? [leftId, rightId] : [rightId, leftId];
  const existingExpiry = state.truces.find((candidate) => (
    candidate.leftId === left && candidate.rightId === right
  ))?.expiresTick ?? 0;
  const truce: TruceStateV2 = {
    leftId: left,
    rightId: right,
    expiresTick: Math.max(existingExpiry, state.tick + durationTicks),
  };
  state.truces = state.truces.filter((candidate) => !(candidate.leftId === left && candidate.rightId === right));
  state.truces.push(truce);
}

function endWarV2(
  state: WorldStateV2,
  war: WarStateV2,
  reason: string,
  truceTicks = TRUCE_TICKS,
  endedWars?: WarConclusionV2[],
): void {
  endedWars?.push({
    war: {
      ...war,
      attackerOperations: war.attackerOperations.map((operation) => ({ ...operation })),
      defenderOperations: war.defenderOperations.map((operation) => ({ ...operation })),
    },
    endedTick: state.tick,
    reason,
  });
  const postWarTraitContexts = new Map<PlayerId, TraitEvaluationContextV2>(
    [war.attackerId, war.defenderId].map((playerId) => [
      playerId,
      composeTraitContextV2(
        traitNationContextV2(state, playerId),
        traitWarContextV2(war, playerId),
      ),
    ]),
  );
  state.wars = state.wars.filter((candidate) => candidate.id !== war.id);
  state.offers = state.offers.filter((offer) => offer.warId !== war.id);
  for (const playerId of [war.attackerId, war.defenderId]) {
    const stillAtWar = state.wars.some((candidate) => candidate.attackerId === playerId || candidate.defenderId === playerId);
    if (!stillAtWar && state.players[playerId]) {
      // Every completed campaign leaves another recovery load. The old floor
      // made the second and later conquest effectively free whenever the
      // first transition had not yet recovered.
      addWarFatigueGainV2(
        state,
        playerId,
        POST_WAR_TRANSITION_FATIGUE,
        postWarTraitContexts.get(playerId),
      );
    }
  }
  addTruceV2(state, war.attackerId, war.defenderId, truceTicks);
  const humanBelligerent = [war.attackerId, war.defenderId]
    .find((playerId) => isHumanPlayerV2(state, playerId));
  addWorldEventV2(
    state,
    'war',
    'action',
    reason,
    undefined,
    humanBelligerent ?? state.humanPlayerId,
  );
}

function capitulationVictorV2(state: WorldStateV2, defeatedId: PlayerId): PlayerId | undefined {
  return state.wars.filter((war) => war.attackerId === defeatedId || war.defenderId === defeatedId)
    .map((war) => {
      const defeatedIsAttacker = war.attackerId === defeatedId;
      const opponentId = defeatedIsAttacker ? war.defenderId : war.attackerId;
      const inflictedLosses = defeatedIsAttacker ? war.attackerLosses : war.defenderLosses;
      const opponentScore = defeatedIsAttacker ? -war.warScore : war.warScore;
      const opponentArmy = nationalCombatManpowerV2(state, opponentId);
      return { opponentId, score: inflictedLosses + Math.max(0, opponentScore) * 0.001 + war.battles * 0.000001, opponentArmy };
    })
    .filter((candidate) => candidate.opponentArmy > 0.000001)
    .sort((left, right) => right.score - left.score || left.opponentId.localeCompare(right.opponentId))[0]?.opponentId;
}

function endWarsForEliminatedNationV2(
  state: WorldStateV2,
  defeatedId: PlayerId,
  reason: string,
  endedWars?: WarConclusionV2[],
): void {
  const wars = state.wars.filter((war) => war.attackerId === defeatedId || war.defenderId === defeatedId);
  for (const war of wars) endWarV2(state, war, reason, TRUCE_TICKS, endedWars);
}

export function logisticsThroughputShareV2(
  _deployedManpower: number,
  _supplyLevel: number,
  _iqLogisticsMultiplier = 1,
): number {
  return LAND_ARMY_CAPACITY_SUPPLY_SHARE_V2;
}

export const INTERNAL_NAVAL_TRANSFER_COST_PER_MILLION_PER_1K_KM_V2 = 0.005;
export const INTERNAL_NAVAL_TRANSFER_LONG_DISTANCE_KM_V2 = 5_000;
export const INTERNAL_NAVAL_TRANSFER_WEEKLY_TREASURY_SHARE_MAX_V2 = 0.03;
/**
 * A breached Antarctic perimeter is a purpose-built launch base. It may stage
 * more of the real, provenanced wave than an ordinary occupied territory, but
 * every soldier still has to travel through the open Antarctic corridor one
 * hop per logistics review. This keeps the convoy visible and slow while
 * preventing the weakest gateway country from holding the machine forever.
 */
export const SURVIVAL_ROGUE_GATEWAY_SUPPORT_CEILING_MULTIPLIER_V2 = 1.5;

export interface InternalArmyTransferLogisticsTermsV2 {
  readonly access: 'land' | 'naval';
  readonly distanceKm: number;
  readonly interiorDistanceKm: number;
  readonly interiorOperationMultiplier: number;
  readonly throughputMultiplier: number;
  readonly costPerMillion: number;
  readonly logisticsCost: number;
}

/**
 * Canonical one-hop transfer quote. It deliberately has no save state: the
 * exact movement telemetry can be shown by UI/finance consumers while the
 * simulation deducts the same deterministic quote immediately.
 */
export function internalArmyTransferLogisticsTermsV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  sourceId: TerritoryId,
  targetId: TerritoryId,
  manpower = 0,
): InternalArmyTransferLogisticsTermsV2 {
  const connection = content.territories[sourceId]?.connections
    .find((edge) => edge.targetId === targetId);
  if (!connection) throw new Error(`No internal logistics connection ${sourceId} -> ${targetId}.`);
  if (!isWorldConnectionOpenV2(state, sourceId, targetId)) {
    throw new Error(`Antarctic gateway connection ${sourceId} -> ${targetId} is sealed.`);
  }
  void playerId;
  const access = connection.kind === 'sea' ? 'naval' as const : 'land' as const;
  const distanceKm = access === 'naval'
    ? Math.max(0, connection.distanceKm ?? NAVAL_ROUTE_BASE_DISTANCE_KM)
    : 0;
  const quote = quoteArmyCapacitySupplyV2(1, 1, access);
  return Object.freeze({
    access,
    distanceKm: round(distanceKm, 3),
    interiorDistanceKm: 0,
    interiorOperationMultiplier: 1,
    // This is a ratio against the land 8% budget: naval is exactly half.
    throughputMultiplier: access === 'naval' ? 0.5 : 1,
    costPerMillion: quote.costPerMillion,
    logisticsCost: round(Math.max(0, manpower) * quote.costPerMillion, 9),
  });
}

/** Rich states become less reluctant, but distance throughput and cash cost never disappear. */
export function internalNavalTransferWillingnessV2(
  _distanceKm: number,
  _treasuryWeeks: number,
  _urgentFront: boolean,
  _strategicBorder = false,
): number {
  return 1;
}

function captureGuardActiveV2(
  state: WorldStateV2,
  territoryId: TerritoryId,
): boolean {
  const territory = state.territories[territoryId];
  const program = territory?.integrationProgram;
  return Boolean(program
    && program.toOwnerId === territory.owner
    && state.tick >= program.startedTick
    && state.tick - program.startedTick < CONQUEST_CAPTURE_GUARD_TICKS);
}

/**
 * One bounded multi-source BFS selects only corridors that lead from a real
 * Antarctic-origin formation to a live Rogue front. This prevents the opening
 * empire from diffusing every wave through every occupied country each week.
 */
function computeSurvivalRogueTransitRouteDepthsV2(
  state: WorldStateV2,
  content: WorldContentV2,
  ownedIds: readonly TerritoryId[],
  ownerWars: readonly WarStateV2[],
): ReadonlyMap<TerritoryId, number> {
  if (!isSurvivalStateV2(state) || ownerWars.length === 0) return new Map();
  const owned = new Set(ownedIds);
  const focusedFrontiers = new Map<TerritoryId, {
    priority: number;
    access: 'land' | 'naval';
  }>();
  for (const war of [...ownerWars].sort((left, right) => left.id.localeCompare(right.id))) {
    const opponentId = war.attackerId === ROGUE_AI_NATION_ID_V2
      ? war.defenderId : war.attackerId;
    const humanTheatre = state.humanPlayerIds.includes(opponentId);
    const dawnlineTheatre = isSurvivalDawnlineNationV2(state, opponentId);
    for (const operation of [...war.defenderOperations, ...war.attackerOperations]) {
      const frontierId = operation.commanderId === ROGUE_AI_NATION_ID_V2
        ? operation.sourceId : operation.targetId;
      const hostileId = operation.commanderId === ROGUE_AI_NATION_ID_V2
        ? operation.targetId : operation.sourceId;
      if (!owned.has(frontierId)
        || state.territories[hostileId]?.owner !== opponentId
        || !isWorldConnectionOpenV2(state, frontierId, hostileId)) continue;
      // A selected player counteroffensive is the highest-priority corridor;
      // then protect the human theatre, then the remote Dawnline front.
      const priority = operation.commanderId !== ROGUE_AI_NATION_ID_V2
        ? 0 : humanTheatre ? 1 : dawnlineTheatre ? 2 : 3;
      const existing = focusedFrontiers.get(frontierId);
      if (!existing || priority < existing.priority
        || (priority === existing.priority
          && operation.access === 'land' && existing.access === 'naval')) {
        focusedFrontiers.set(frontierId, { priority, access: operation.access });
      }
    }
  }
  const frontiers = [...focusedFrontiers]
    .sort((left, right) => left[1].priority - right[1].priority
      || Number(left[1].access === 'naval') - Number(right[1].access === 'naval')
      || left[0].localeCompare(right[0]))
    .slice(0, 3)
    .map(([territoryId]) => territoryId);
  if (frontiers.length === 0) return new Map();

  const coreId = state.players[ROGUE_AI_NATION_ID_V2]?.capitalId;
  if (!coreId || !owned.has(coreId)) return new Map();
  const shortestPath = (
    startId: TerritoryId,
    targetId: TerritoryId,
    reusedWorldNodes: ReadonlySet<TerritoryId>,
  ): { path: TerritoryId[]; cost: number } | null => {
    const parent = new Map<TerritoryId, TerritoryId | null>([[startId, null]]);
    const costs = new Map<TerritoryId, number>([[startId, 0]]);
    const unvisited = new Set(ownedIds);
    while (unvisited.size > 0) {
      let sourceId: TerritoryId | undefined;
      let sourceCost = Number.POSITIVE_INFINITY;
      for (const territoryId of unvisited) {
        const candidateCost = costs.get(territoryId) ?? Number.POSITIVE_INFINITY;
        if (candidateCost < sourceCost - 1e-9
          || (Math.abs(candidateCost - sourceCost) <= 1e-9
            && territoryId.localeCompare(sourceId ?? '') < 0)) {
          sourceId = territoryId;
          sourceCost = candidateCost;
        }
      }
      if (!sourceId || !Number.isFinite(sourceCost)) break;
      unvisited.delete(sourceId);
      if (sourceId === targetId) break;
      const connections = [...(content.territories[sourceId]?.connections ?? [])]
        .filter((connection) => owned.has(connection.targetId)
          && isWorldConnectionOpenV2(state, sourceId!, connection.targetId))
        .sort((left, right) => Number(left.kind === 'sea') - Number(right.kind === 'sea')
          || left.targetId.localeCompare(right.targetId));
      for (const connection of connections) {
        if (!unvisited.has(connection.targetId)) continue;
        const navalCost = connection.kind === 'sea'
          ? 6 + Math.min(12, Math.max(0, connection.distanceKm ?? 0) / 1_000)
          : 1;
        const worldReusePenalty = reusedWorldNodes.has(connection.targetId)
          && !ANTARCTIC_TERRITORY_IDS_V2.includes(connection.targetId) ? 18 : 0;
        const candidateCost = sourceCost + navalCost + worldReusePenalty;
        const priorCost = costs.get(connection.targetId) ?? Number.POSITIVE_INFINITY;
        const priorParent = parent.get(connection.targetId);
        if (candidateCost < priorCost - 1e-9
          || (Math.abs(candidateCost - priorCost) <= 1e-9
            && sourceId.localeCompare(priorParent ?? '') < 0)) {
          costs.set(connection.targetId, candidateCost);
          parent.set(connection.targetId, sourceId);
        }
      }
    }
    const totalCost = costs.get(targetId);
    if (!Number.isFinite(totalCost)) return null;
    const reversed: TerritoryId[] = [];
    let cursor: TerritoryId | null = targetId;
    while (cursor !== null) {
      reversed.push(cursor);
      if (cursor === startId) break;
      cursor = parent.get(cursor) ?? null;
    }
    if (reversed.at(-1) !== startId) return null;
    return { path: reversed.reverse(), cost: totalCost! };
  };

  const gateways = state.polarEndgame.gatewayBreachOrder
    .filter((gatewayId): gatewayId is (typeof ANTARCTIC_GATEWAY_IDS_V2)[number] => (
      ANTARCTIC_GATEWAY_IDS_V2.some((candidate) => candidate === gatewayId)
        && isAntarcticGatewayOpenV2(state, gatewayId)
    ))
    .map(antarcticGatewayTerritoryIdV2)
    .filter((gatewayId) => owned.has(gatewayId));
  if (gateways.length === 0) return new Map([[coreId, 0]]);

  const usedWorldNodes = new Set<TerritoryId>();
  const assignedCount = new Map(frontiers.map((frontierId) => [frontierId, 0]));
  const routeEdges = new Map<TerritoryId, Set<TerritoryId>>();
  const addPath = (path: readonly TerritoryId[]): void => {
    for (let index = 1; index < path.length; index += 1) {
      const sourceId = path[index - 1]!;
      const targetId = path[index]!;
      const targets = routeEdges.get(sourceId) ?? new Set<TerritoryId>();
      targets.add(targetId);
      routeEdges.set(sourceId, targets);
    }
  };

  // One assignment per open gateway makes the annual formation legible as
  // three geographically different columns. The first pass covers distinct
  // human/Dawnline frontiers; any extra exit chooses the least-used closest
  // front with a strong penalty for reusing an earlier world corridor.
  for (const gatewayId of gateways) {
    const corePath = shortestPath(coreId, gatewayId, new Set());
    if (!corePath) continue;
    const choices = frontiers.flatMap((frontierId) => {
      const route = shortestPath(gatewayId, frontierId, usedWorldNodes);
      return route ? [{ frontierId, route }] : [];
    }).sort((left, right) => (
      (assignedCount.get(left.frontierId) ?? 0)
        - (assignedCount.get(right.frontierId) ?? 0)
      || left.route.cost - right.route.cost
      || left.frontierId.localeCompare(right.frontierId)
    ));
    const selected = choices[0];
    if (!selected) continue;
    addPath(corePath.path);
    addPath(selected.route.path);
    assignedCount.set(
      selected.frontierId,
      (assignedCount.get(selected.frontierId) ?? 0) + 1,
    );
    for (const territoryId of selected.route.path) {
      if (!ANTARCTIC_TERRITORY_IDS_V2.includes(territoryId)) {
        usedWorldNodes.add(territoryId);
      }
    }
  }

  const routeDepths = new Map<TerritoryId, number>([[coreId, 0]]);
  const queue: TerritoryId[] = [coreId];
  for (let index = 0; index < queue.length; index += 1) {
    const sourceId = queue[index]!;
    const sourceDepth = routeDepths.get(sourceId) ?? 0;
    for (const targetId of [...(routeEdges.get(sourceId) ?? [])].sort()) {
      const nextDepth = sourceDepth + 1;
      const priorDepth = routeDepths.get(targetId);
      if (priorDepth !== undefined && priorDepth <= nextDepth) continue;
      routeDepths.set(targetId, nextDepth);
      queue.push(targetId);
    }
  }
  return routeDepths;
}

interface SurvivalRogueTransitRouteCacheEntryV2 {
  readonly content: WorldContentV2;
  readonly signature: string;
  readonly depths: ReadonlyMap<TerritoryId, number>;
  hits: number;
  builds: number;
}

const survivalRogueTransitRouteCacheV2 = new WeakMap<
  WorldStateV2,
  SurvivalRogueTransitRouteCacheEntryV2
>();

function survivalRogueTransitRouteSignatureV2(
  state: WorldStateV2,
  ownedIds: readonly TerritoryId[],
  ownerWars: readonly WarStateV2[],
): string {
  const gatewaySignature = state.polarEndgame.gatewayBreachOrder
    .map((gatewayId) => `${gatewayId}:${state.polarEndgame.gatewayBreaches[gatewayId]?.status ?? 'missing'}`)
    .join(',');
  const warSignature = [...ownerWars]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((war) => {
      const opponentId = war.attackerId === ROGUE_AI_NATION_ID_V2
        ? war.defenderId : war.attackerId;
      const theatre = state.humanPlayerIds.includes(opponentId)
        ? 'human'
        : isSurvivalDawnlineNationV2(state, opponentId) ? 'dawnline' : 'ordinary';
      const operations = [...war.attackerOperations, ...war.defenderOperations]
        .map((operation) => [
          operation.commanderId,
          operation.sourceId,
          state.territories[operation.sourceId]?.owner ?? 'missing',
          operation.targetId,
          state.territories[operation.targetId]?.owner ?? 'missing',
          operation.access,
        ].join(':'))
        .sort()
        .join(',');
      return `${war.id}:${war.attackerId}>${war.defenderId}:${theatre}:${operations}`;
    })
    .join('|');
  return [
    state.players[ROGUE_AI_NATION_ID_V2]?.capitalId ?? 'no-core',
    ownedIds.join(','),
    gatewaySignature,
    warSignature,
  ].join('|');
}

/** Cheap diagnostics used by deterministic performance regressions. */
export function survivalRogueTransitRouteCacheStatsV2(
  state: WorldStateV2,
): Readonly<{ hits: number; builds: number }> {
  const cached = survivalRogueTransitRouteCacheV2.get(state);
  return Object.freeze({
    hits: cached?.hits ?? 0,
    builds: cached?.builds ?? 0,
  });
}

/**
 * Route geometry only changes when Rogue ownership, a live operation, an
 * opponent role/owner, or an Antarctic gateway changes. Weekly manpower and
 * treasury ticks reuse the same immutable plan instead of rebuilding up to
 * nine weighted paths through the world graph.
 */
function survivalRogueTransitRouteDepthsV2(
  state: WorldStateV2,
  content: WorldContentV2,
  ownedIds: readonly TerritoryId[],
  ownerWars: readonly WarStateV2[],
): ReadonlyMap<TerritoryId, number> {
  if (!isSurvivalStateV2(state) || ownerWars.length === 0) return new Map();
  const signature = survivalRogueTransitRouteSignatureV2(state, ownedIds, ownerWars);
  const cached = survivalRogueTransitRouteCacheV2.get(state);
  if (cached?.content === content && cached.signature === signature) {
    cached.hits += 1;
    return cached.depths;
  }
  const depths = computeSurvivalRogueTransitRouteDepthsV2(
    state,
    content,
    ownedIds,
    ownerWars,
  );
  survivalRogueTransitRouteCacheV2.set(state, {
    content,
    signature,
    depths,
    hits: cached?.hits ?? 0,
    builds: (cached?.builds ?? 0) + 1,
  });
  return depths;
}

interface ActiveFrontSupplyRouteNodeV2 {
  /** Active battle-front this territory feeds. */
  readonly frontId: TerritoryId;
  /** Adjacent owned territory one step closer to that front. */
  readonly nextId: TerritoryId | null;
  readonly routeCost: number;
  readonly hops: number;
  readonly frontPriority: number;
}

const ACTIVE_FRONT_HOME_GARRISON_CAPACITY_SHARE_V2 = 0.10;
const ACTIVE_FRONT_EMERGENCY_RELEASE_CAPACITY_SHARE_V2 = 0.01;
const ACTIVE_FRONT_LOSING_MOMENTUM_V2 = 0.20;

/**
 * A front is losing only when its persisted battle momentum clearly points
 * against this owner. This deliberately ignores a single noisy damage pulse:
 * emergency home-garrison release must be stable, cheap and deterministic.
 */
function ownerHasLosingActiveFrontV2(
  state: WorldStateV2,
  playerId: PlayerId,
  wars: readonly WarStateV2[],
): boolean {
  return wars.some((war) => (
    [...war.attackerOperations, ...war.defenderOperations].some((operation) => {
      if (operation.commanderId === playerId
        && state.territories[operation.sourceId]?.owner === playerId) {
        return operation.momentum <= -ACTIVE_FRONT_LOSING_MOMENTUM_V2;
      }
      return operation.commanderId !== playerId
        && state.territories[operation.targetId]?.owner === playerId
        && operation.momentum >= ACTIVE_FRONT_LOSING_MOMENTUM_V2;
    })
  ));
}

/**
 * Most weeks follow the largest relative front deficit. Every third week is
 * a stable round-robin fairness slot, guaranteeing that a farther/naval front
 * cannot remain starved behind a permanently nearer land front.
 */
function activeFrontSupplyPrioritiesV2(
  state: WorldStateV2,
  frontGapById: ReadonlyMap<TerritoryId, number>,
  frontCeilingById: ReadonlyMap<TerritoryId, number>,
  counteroffensiveFrontIds: ReadonlySet<TerritoryId>,
): ReadonlyMap<TerritoryId, number> {
  const needy = [...frontGapById.entries()]
    .filter(([, gap]) => gap > 1e-9)
    .map(([frontId, gap]) => ({
      frontId,
      relativeGap: gap / Math.max(1e-9, frontCeilingById.get(frontId) ?? gap),
    }));
  if (needy.length === 0) return new Map();
  const stable = [...needy].sort((left, right) => left.frontId.localeCompare(right.frontId));
  const byNeed = [...needy].sort((left, right) => (
    right.relativeGap - left.relativeGap
    || Number(counteroffensiveFrontIds.has(right.frontId))
      - Number(counteroffensiveFrontIds.has(left.frontId))
    || left.frontId.localeCompare(right.frontId)
  ));
  const fairnessTurn = Math.floor(state.tick / 3) % stable.length;
  const focusId = state.tick % 3 === 0
    ? stable[fairnessTurn]!.frontId
    : byNeed[0]!.frontId;
  const priorities = new Map<TerritoryId, number>([[focusId, 0]]);
  let priority = 1;
  for (const candidate of byNeed) {
    if (candidate.frontId === focusId) continue;
    priorities.set(candidate.frontId, priority);
    priority += 1;
  }
  return priorities;
}

/**
 * Builds one deterministic, land-first supply tree from every owned territory
 * toward the currently prioritised underfilled battle-front. Sea lanes remain
 * valid, but carry a larger route cost so a real land corridor wins whenever
 * one exists. Need priority precedes distance; the caller rotates a bounded
 * fairness slot so the closest front can never monopolise every donor.
 */
function activeFrontSupplyRoutePlanV2(
  state: WorldStateV2,
  content: WorldContentV2,
  ownedIds: readonly TerritoryId[],
  activeFrontIds: ReadonlySet<TerritoryId>,
  frontPriorityById: ReadonlyMap<TerritoryId, number>,
): ReadonlyMap<TerritoryId, ActiveFrontSupplyRouteNodeV2> {
  if (activeFrontIds.size === 0) return new Map();
  const owned = new Set(ownedIds);
  const routes = new Map<TerritoryId, ActiveFrontSupplyRouteNodeV2>();
  for (const frontId of [...activeFrontIds].filter((id) => owned.has(id)).sort()) {
    routes.set(frontId, {
      frontId,
      nextId: null,
      routeCost: 0,
      hops: 0,
      frontPriority: frontPriorityById.get(frontId) ?? Number.MAX_SAFE_INTEGER,
    });
  }
  if (routes.size === 0) return routes;

  const unvisited = new Set(ownedIds);
  while (unvisited.size > 0) {
    let sourceId: TerritoryId | undefined;
    let sourceRoute: ActiveFrontSupplyRouteNodeV2 | undefined;
    for (const candidateId of unvisited) {
      const candidate = routes.get(candidateId);
      if (!candidate) continue;
      if (!sourceRoute
        || candidate.frontPriority < sourceRoute.frontPriority
        || (candidate.frontPriority === sourceRoute.frontPriority
          && (candidate.routeCost < sourceRoute.routeCost - 1e-9
            || (Math.abs(candidate.routeCost - sourceRoute.routeCost) <= 1e-9
              && (candidate.frontId.localeCompare(sourceRoute.frontId) < 0
                || (candidate.frontId === sourceRoute.frontId
                  && candidateId.localeCompare(sourceId ?? '') < 0)))))) {
        sourceId = candidateId;
        sourceRoute = candidate;
      }
    }
    if (!sourceId || !sourceRoute) break;
    unvisited.delete(sourceId);
    const connections = [...(content.territories[sourceId]?.connections ?? [])]
      .filter((connection) => owned.has(connection.targetId)
        && isWorldConnectionOpenV2(state, sourceId!, connection.targetId))
      .sort((left, right) => Number(left.kind === 'sea') - Number(right.kind === 'sea')
        || left.targetId.localeCompare(right.targetId));
    for (const connection of connections) {
      if (!unvisited.has(connection.targetId)) continue;
      // Every active front remains its own zero-hop receiver. A high-priority
      // route may own the surrounding donor tree, but never overwrite another
      // front's seed while that front waits for its bounded fairness turn.
      if (activeFrontIds.has(connection.targetId)) continue;
      const edgeCost = connection.kind === 'sea'
        ? 6 + Math.min(12, Math.max(0, connection.distanceKm ?? 0) / 1_000)
        : 1;
      const candidate: ActiveFrontSupplyRouteNodeV2 = {
        frontId: sourceRoute.frontId,
        nextId: sourceId,
        routeCost: sourceRoute.routeCost + edgeCost,
        hops: sourceRoute.hops + 1,
        frontPriority: sourceRoute.frontPriority,
      };
      const prior = routes.get(connection.targetId);
      if (!prior
        || candidate.frontPriority < prior.frontPriority
        || (candidate.frontPriority === prior.frontPriority
          && (candidate.routeCost < prior.routeCost - 1e-9
            || (Math.abs(candidate.routeCost - prior.routeCost) <= 1e-9
              && (candidate.frontId.localeCompare(prior.frontId) < 0
                || (candidate.frontId === prior.frontId
                  && (candidate.nextId ?? '').localeCompare(prior.nextId ?? '') < 0)))))) {
        routes.set(connection.targetId, candidate);
      }
    }
  }
  return routes;
}

export function redistributeArmiesV2(state: WorldStateV2, content: WorldContentV2): LogisticsMovementV2[] {
  const movementByEdge = new Map<string, LogisticsMovementV2>();
  const recordMovement = (movement: LogisticsMovementV2): void => {
    const key = `${movement.playerId}|${movement.sourceId}|${movement.targetId}`;
    const existing = movementByEdge.get(key);
    if (!existing) {
      movementByEdge.set(key, { ...movement });
      return;
    }
    existing.manpower = round(existing.manpower + movement.manpower, 9);
    existing.capacity = round(existing.capacity + movement.capacity, 9);
    existing.logisticsCost = round(existing.logisticsCost + movement.logisticsCost, 9);
  };
  const territoriesByOwner = new Map<PlayerId, TerritoryId[]>();
  // Retired saves can still deserialize the schema field, but load migration
  // clears it. Live logistics deliberately never re-enable corridor semantics.
  const survivalScorchedIds = new Set<TerritoryId>();
  for (const id of sortedTerritoryIdsV2(state)) {
    const owner = state.territories[id]!.owner;
    territoriesByOwner.set(owner, [...(territoriesByOwner.get(owner) ?? []), id]);
  }
  const allOwners = [...territoriesByOwner.keys()].sort((a, b) => a.localeCompare(b));
  for (const playerId of allOwners) {
    if (!isNationOperationalV2(state, content, playerId)) continue;
    const ownedIds = territoriesByOwner.get(playerId) ?? [];
    // Nearly every country starts with one territory. It has nowhere to move
    // forces internally, so skip all route/threat work for that common case.
    if (ownedIds.length < 2) continue;
    const empireArmyCapacity = nationalArmyCapacityTargetV2(state, content, playerId);
    const empireArmyCapacityAtOneXOpening = nationalArmyCapacityAtOneXOpeningV2(
      state,
      content,
      playerId,
      ownedIds,
    );
    const ownerWars = selectWarsOfV2(state, playerId);
    const rogueTransitRouteDepths = playerId === ROGUE_AI_NATION_ID_V2
      ? survivalRogueTransitRouteDepthsV2(state, content, ownedIds, ownerWars)
      : new Map<TerritoryId, number>();
    const rogueWavePipeline = playerId === ROGUE_AI_NATION_ID_V2
      ? Object.values(state.polarEndgame.rogueWaveManpowerByTerritory)
        .reduce<number>((sum, manpower) => sum + Math.max(0, manpower ?? 0), 0)
      : 0;
    const rogueTransitStagingCeiling = playerId === ROGUE_AI_NATION_ID_V2
      ? Math.max(
          rogueWavePipeline,
          rogueAnnualWaveManpowerV2(state),
        )
      : 0;
    const activeWarTerritories = new Set<TerritoryId>();
    const playerCounteroffensiveSources = new Set<TerritoryId>();
    for (const war of ownerWars) {
      for (const operation of [...war.attackerOperations, ...war.defenderOperations]) {
        if (state.territories[operation.sourceId]?.owner === playerId) {
          activeWarTerritories.add(operation.sourceId);
          if (isSurvivalStateV2(state)
            && playerId !== ROGUE_AI_NATION_ID_V2
            && state.territories[operation.targetId]?.owner === ROGUE_AI_NATION_ID_V2) {
            playerCounteroffensiveSources.add(operation.sourceId);
          }
        }
        if (state.territories[operation.targetId]?.owner === playerId) {
          activeWarTerritories.add(operation.targetId);
        }
      }
    }
    const activeFrontGapById = new Map<TerritoryId, number>();
    const activeFrontCeilingById = new Map<TerritoryId, number>();
    for (const frontId of activeWarTerritories) {
      const territory = state.territories[frontId];
      if (!territory || territory.owner !== playerId) continue;
      const ceiling = stateTerritoryArmySupportCeilingV2(
        state,
        content,
        frontId,
        playerId,
        empireArmyCapacity,
        empireArmyCapacityAtOneXOpening,
      );
      activeFrontCeilingById.set(frontId, ceiling);
      activeFrontGapById.set(frontId, Math.max(0, ceiling - territory.army.manpower));
    }
    const activeFrontSupplyPriorities = activeFrontSupplyPrioritiesV2(
      state,
      activeFrontGapById,
      activeFrontCeilingById,
      playerCounteroffensiveSources,
    );
    const underfilledActiveFronts = new Set(activeFrontSupplyPriorities.keys());
    const activeFrontSupplyRoutes = playerId !== ROGUE_AI_NATION_ID_V2
      ? activeFrontSupplyRoutePlanV2(
          state,
          content,
          ownedIds,
          underfilledActiveFronts,
          activeFrontSupplyPriorities,
        )
      : new Map<TerritoryId, ActiveFrontSupplyRouteNodeV2>();
    const losingActiveFront = playerId !== ROGUE_AI_NATION_ID_V2
      && ownerHasLosingActiveFrontV2(state, playerId, ownerWars);
    const plans = ownedIds.map((id) => {
      const territory = state.territories[id]!;
      const connections = (content.territories[id]?.connections ?? [])
        .filter((edge) => isWorldConnectionOpenV2(state, id, edge.targetId));
      const exposedBorder = connections.some((edge) => edge.kind === 'land'
        && state.territories[edge.targetId]
        && state.territories[edge.targetId]!.owner !== playerId);
      const survivalRogueBorder = playerId !== ROGUE_AI_NATION_ID_V2
        && isSurvivalStateV2(state)
        && connections.some((edge) => edge.kind === 'land'
          && state.territories[edge.targetId]?.owner === ROGUE_AI_NATION_ID_V2);
      const machineLaunchGateway = playerId === ROGUE_AI_NATION_ID_V2
        && content.territories[id]?.kind === 'rogue-perimeter'
        && connections.some((edge) => edge.kind === 'sea'
          && content.territories[edge.targetId]?.kind === 'sovereign');
      const atWar = activeWarTerritories.has(id);
      const counteroffensiveSource = playerCounteroffensiveSources.has(id);
      const activeFrontSupplyRoute = activeFrontSupplyRoutes.get(id);
      const routedToActiveFront = activeFrontSupplyRoute !== undefined;
      const activeFrontSupplyGap = activeFrontSupplyRoute
        ? activeFrontGapById.get(activeFrontSupplyRoute.frontId) ?? 0
        : 0;
      const integrating = territory.integrationProgram?.toOwnerId === playerId;
      const capital = state.players[playerId]?.capitalId === id;
      const rogueTransit = playerId === ROGUE_AI_NATION_ID_V2
        && isSurvivalStateV2(state)
        && survivalScorchedIds.has(id);
      const roguePipelineDepth = rogueTransitRouteDepths.get(id);
      const routedRoguePipeline = roguePipelineDepth !== undefined;
      const nationalSupportCeiling = stateTerritoryArmySupportCeilingV2(
        state,
        content,
        id,
        playerId,
        empireArmyCapacity,
        empireArmyCapacityAtOneXOpening,
      ) * (machineLaunchGateway
        ? SURVIVAL_ROGUE_GATEWAY_SUPPORT_CEILING_MULTIPLIER_V2
        : 1);
      // Routed territories can stage the complete live Antarctic pipeline;
      // their own economy and capacity remain ordinary conquest state.
      const supportCeiling = routedRoguePipeline
        ? Math.max(territory.army.manpower, rogueTransitStagingCeiling)
        : rogueTransit ? territory.army.manpower : nationalSupportCeiling;
      // A larger core depth is closer to a live front. Sorting these receivers
      // first, together with the outward-only edge rule below, prevents verified
      // formations from oscillating between two full relay nodes.
      const priority = routedRoguePipeline ? 1_000 + roguePipelineDepth
        : counteroffensiveSource ? 100 : atWar ? 90
        : routedToActiveFront ? 80 - Math.min(50, activeFrontSupplyRoute.hops)
        : survivalRogueBorder ? 5
        : machineLaunchGateway ? 3
        : exposedBorder ? 2 : integrating ? 1 : 0;
      const desiredFill = counteroffensiveSource || atWar ? 1
        : survivalRogueBorder ? 0.85 : machineLaunchGateway ? 0.75
          : exposedBorder ? 0.70 : integrating ? 0.50 : capital ? 0.25 : 0.10;
      const scorchedTransit = survivalScorchedIds.has(id);
      const localStationingBase = scorchedTransit
        ? supportCeiling : territory.army.capacity;
      const homeGarrisonFloor = atWar || rogueTransit
        ? 0
        : Math.max(
            0,
            territory.army.capacity * ACTIVE_FRONT_HOME_GARRISON_CAPACITY_SHARE_V2,
          );
      // During war every non-front army is an available donor. Active battle
      // fronts keep their complete support envelope. Other live countries keep
      // a stable ten-percent capacity garrison instead of leaking toward zero.
      const desired = routedRoguePipeline ? supportCeiling
        : rogueTransit ? territory.army.manpower
          : ownerWars.length > 0 && playerId !== ROGUE_AI_NATION_ID_V2
            ? (atWar ? supportCeiling : homeGarrisonFloor)
            : Math.min(supportCeiling, localStationingBase * desiredFill);
      // Intermediate route nodes can temporarily host externally supplied
      // empire manpower without changing their live local capacity.
      const receivingCeiling = routedToActiveFront && !atWar
        ? Math.max(supportCeiling, territory.army.manpower, activeFrontSupplyGap)
        : supportCeiling;
      const logisticsCapacity = routedRoguePipeline
        ? supportCeiling
        : routedToActiveFront
          ? Math.max(
              receivingCeiling,
              territory.army.manpower,
              empireArmyCapacity,
            )
        : scorchedTransit
          ? Math.max(supportCeiling, territory.army.manpower)
        : playerId === ROGUE_AI_NATION_ID_V2
          ? Math.max(territory.army.capacity, territory.army.manpower)
          : territory.army.capacity;
      return {
        id,
        priority,
        desired,
        supportCeiling,
        receivingCeiling,
        logisticsCapacity,
        roguePipelineDepth,
        activeFrontSupplyRoute,
        activeFrontSupplyGap,
        atWar,
        homeGarrisonFloor,
        scorchedTransit,
      };
    });
    const logisticsCapacityById = new Map(plans.map((plan) => [
      plan.id,
      plan.logisticsCapacity,
    ]));
    const outgoing = new Map(plans.map((plan) => {
      const territory = state.territories[plan.id]!;
      const ordinaryAvailable = Math.max(0, territory.army.manpower - plan.desired);
      // A clearly losing active front may call up the final home garrison, but
      // at most one percent of live local capacity per week. No extra reserve
      // pool or mutable schedule is needed, and the last ten percent can never
      // disappear in one logistics tick.
      const emergencyAvailable = losingActiveFront && !plan.atWar
        ? Math.min(
            Math.max(0, territory.army.manpower - ordinaryAvailable),
            territory.army.capacity * ACTIVE_FRONT_EMERGENCY_RELEASE_CAPACITY_SHARE_V2,
          )
        : 0;
      return [plan.id, captureGuardActiveV2(state, plan.id)
        ? 0
        : Math.max(
            0,
            ordinaryAvailable + emergencyAvailable,
            playerId === ROGUE_AI_NATION_ID_V2
              ? rogueWaveManpowerAtV2(state, plan.id) : 0,
          )];
    }));
    // Each ordinary donor gets one weekly 8%-of-local-cap pool. A naval edge
    // may consume at most half, making sea throughput exactly 4%. Literal
    // Routed expedition formations use the external empire support envelope.
    const donorBudget = new Map(plans.map((plan) => {
      const capacity = plan.scorchedTransit
        ? plan.logisticsCapacity
        : state.territories[plan.id]!.army.capacity;
      return [plan.id, armyCapacitySupplyBudgetV2(capacity, 'land')];
    }));
    const receivers = plans
      .map((plan) => {
        const ordinaryGap = Math.min(
          plan.supportCeiling - state.territories[plan.id]!.army.manpower,
          plan.desired - state.territories[plan.id]!.army.manpower,
        );
        // Full Antarctic and occupied-world garrisons still need to exchange
        // their placeholder personnel for a verified convoy. Giving the routed
        // node a provenance gap activates the zero-net relay path below.
        const verifiedGap = plan.roguePipelineDepth !== undefined
          && plan.roguePipelineDepth > 0
          ? rogueTransitStagingCeiling - rogueWaveManpowerAtV2(state, plan.id)
          : 0;
        const activeFrontRelayGap = plan.activeFrontSupplyRoute && plan.priority < 90
          ? Math.min(
              plan.activeFrontSupplyGap,
              Math.max(0, plan.receivingCeiling - state.territories[plan.id]!.army.manpower),
            )
          : 0;
        return {
          ...plan,
          gap: Math.max(ordinaryGap, verifiedGap, activeFrontRelayGap),
        };
      })
      .filter((plan) => plan.gap > 1e-9)
      .sort((left, right) => right.priority - left.priority
        || right.gap / Math.max(1e-9, right.supportCeiling)
          - left.gap / Math.max(1e-9, left.supportCeiling)
        || left.id.localeCompare(right.id));
    for (const receiver of receivers) {
      let needed = receiver.gap;
      const incoming = (content.territories[receiver.id]?.connections ?? [])
        .filter((edge) => isWorldConnectionOpenV2(state, receiver.id, edge.targetId)
          && state.territories[edge.targetId]?.owner === playerId
          && (() => {
            if (playerId !== ROGUE_AI_NATION_ID_V2
              || rogueWaveManpowerAtV2(state, edge.targetId) <= 1e-9) return true;
            const donorDepth = rogueTransitRouteDepths.get(edge.targetId);
            return receiver.roguePipelineDepth !== undefined
              && donorDepth !== undefined
              && donorDepth + 1 === receiver.roguePipelineDepth;
          })()
          && (() => {
            if (playerId === ROGUE_AI_NATION_ID_V2
              || activeFrontSupplyRoutes.size === 0) return true;
            const donorRoute = activeFrontSupplyRoutes.get(edge.targetId);
            const receiverRoute = activeFrontSupplyRoutes.get(receiver.id);
            return Boolean(donorRoute && receiverRoute
              && donorRoute.frontId === receiverRoute.frontId
              && donorRoute.nextId === receiver.id);
          })())
        .map((edge) => ({
          donorId: edge.targetId,
          access: edge.kind === 'sea' ? 'naval' as const : 'land' as const,
        }))
        .sort((left, right) => Number(left.access === 'naval')
          - Number(right.access === 'naval')
          || (outgoing.get(right.donorId) ?? 0) - (outgoing.get(left.donorId) ?? 0)
          || left.donorId.localeCompare(right.donorId));
      for (const edge of incoming) {
        if (needed <= 1e-9) break;
        const available = outgoing.get(edge.donorId) ?? 0;
        const remainingBudget = donorBudget.get(edge.donorId) ?? 0;
        if (available <= 1e-9 || remainingBudget <= 1e-9) continue;
        const from = state.territories[edge.donorId]!;
        const to = state.territories[receiver.id]!;
        const operationalCapacity = logisticsCapacityById.get(edge.donorId)
          ?? from.army.capacity;
        const edgeBudget = armyCapacitySupplyBudgetV2(
          operationalCapacity,
          edge.access,
        );
        const sourceWaveManpower = playerId === ROGUE_AI_NATION_ID_V2
          ? rogueWaveManpowerAtV2(state, edge.donorId) : 0;
        const destinationPlaceholderManpower = playerId === ROGUE_AI_NATION_ID_V2
          ? Math.max(0, to.army.manpower - rogueWaveManpowerAtV2(state, receiver.id))
          : 0;
        const corridorRelayRoom = Math.min(
          sourceWaveManpower,
          destinationPlaceholderManpower,
        );
        const destinationRoom = Math.max(0, receiver.receivingCeiling - to.army.manpower);
        const moveManpower = round(Math.min(
          needed,
          available,
          remainingBudget,
          edgeBudget,
          destinationRoom + corridorRelayRoom,
        ), 9);
        if (moveManpower <= 1e-9) continue;
        const movementTerms = internalArmyTransferLogisticsTermsV2(
          state,
          content,
          playerId,
          edge.donorId,
          receiver.id,
          moveManpower,
        );
        const quotedCost = movementTerms.logisticsCost;
        const paidCost = Math.min(
          Math.max(0, state.players[playerId]!.treasury),
          quotedCost,
        );
        // Cost is deliberately non-blocking: a cash-poor country still moves
        // the same troops and simply pays what its treasury can cover.
        state.players[playerId]!.treasury = round(Math.max(
          0,
          state.players[playerId]!.treasury - paidCost,
        ), 9);
        const movedBaseQuality = {
          attack: from.army.baseAttack,
          defense: from.army.baseDefense,
        };
        const fromManpowerBefore = from.army.manpower;
        const relayedManpower = Math.min(
          corridorRelayRoom,
          Math.max(0, moveManpower - destinationRoom),
        );
        const netManpowerMove = moveManpower - relayedManpower;
        from.army.manpower = round(Math.max(0, from.army.manpower - netManpowerMove), 9);
        mixArmyBaseQualityV2(to.army, netManpowerMove, movedBaseQuality);
        to.army.manpower = round(to.army.manpower + netManpowerMove, 9);
        transferRogueWaveManpowerV2(
          state,
          edge.donorId,
          receiver.id,
          moveManpower,
          fromManpowerBefore,
        );
        outgoing.set(edge.donorId, Math.max(0, available - moveManpower));
        donorBudget.set(edge.donorId, Math.max(0, remainingBudget - moveManpower));
        needed -= moveManpower;
        recordMovement({
          playerId,
          sourceId: edge.donorId,
          targetId: receiver.id,
          manpower: moveManpower,
          capacity: 0,
          access: movementTerms.access,
          distanceKm: movementTerms.distanceKm,
          interiorDistanceKm: 0,
          interiorOperationMultiplier: 1,
          logisticsCost: round(paidCost, 9),
        });
      }
    }
    // A receiver's new troops cannot be forwarded until the next weekly pass:
    // outgoing and donor budgets were snapshotted before any movement.
    for (const id of ownedIds) {
      const army = state.territories[id]!.army;
      army.manpower = Math.max(0, army.manpower);
      resetEmptyArmyBaseQualityV2(army, content, id);
    }
  }
  return [...movementByEdge.values()].sort((left, right) => right.manpower - left.manpower
    || left.sourceId.localeCompare(right.sourceId)
    || left.targetId.localeCompare(right.targetId));
}

function campaignConquestStopReasonV2(
  state: WorldStateV2,
  war: WarStateV2,
  battle: BattleEventV2,
): string | undefined {
  const campaign = ensureWarCampaignStateV2(state, war);
  const formalAttackerCaptured = battle.attackerId === war.attackerId;
  const captures = formalAttackerCaptured
    ? campaign.attackerCaptures : campaign.defenderCaptures;
  const objective = formalAttackerCaptured
    ? campaign.attackerObjective : campaign.defenderObjective;
  if (captures >= objective) {
    return formalAttackerCaptured
      ? `Campaign objective completed after ${captures} territorial conquest${captures === 1 ? '' : 's'}; both empires consolidated.`
      : 'The defending empire completed its counteroffensive objective and forced the attacker to withdraw.';
  }
  const victorId = battle.attackerId;
  const manpower = selectTotalManpowerV2(state, victorId);
  const fillRatio = manpower.capacity > 0 ? manpower.deployed / manpower.capacity : 0;
  const activeWars = selectWarsOfV2(state, victorId).length;
  if ((state.players[victorId]?.warFatigue ?? 0) >= WAR_CAMPAIGN_CONSOLIDATE_FATIGUE) {
    return 'Severe war fatigue forced the victor to consolidate its latest territorial gain.';
  }
  if (fillRatio < WAR_CAMPAIGN_MIN_CONTINUE_FILL_RATIO) {
    return 'Field-army exhaustion forced the victor to consolidate its latest territorial gain.';
  }
  if (activeWars > 1 && fillRatio < WAR_CAMPAIGN_MULTI_WAR_MIN_CONTINUE_FILL_RATIO) {
    return 'Multiple active wars forced the victor to consolidate its latest territorial gain.';
  }
  return undefined;
}

export function processWarsV2(
  state: WorldStateV2,
  content: WorldContentV2,
  logisticsMovements?: LogisticsMovementV2[],
  endedWars?: WarConclusionV2[],
): BattleEventV2[] {
  state.truces = state.truces.filter((truce) => truce.expiresTick > state.tick);
  // Negotiated settlements are retired. Compatibility arrays are kept inert
  // so old authenticated saves can be loaded without reviving offers or bills.
  state.offers = [];
  state.ceasefireObligations = [];
  const weeklyMovements = redistributeArmiesV2(state, content);
  if (logisticsMovements) logisticsMovements.push(...weeklyMovements);
  // Finance, attrition and redistribution can exhaust a tiny source between
  // battle pulses. Do not keep a stale front alive until its next initiative
  // review; rapidly changing frontline garrisons can hit this path frequently.
  clearInvalidWarOperationsV2(state, content);
  const battles: BattleEventV2[] = [];
  const usedSourceIds = new Set<TerritoryId>();
  const usedAllySupportSourceIds = new Set<TerritoryId>();
  // A source army can fight only once per tick. Give the war that has waited
  // longest first claim, otherwise the lexicographically earliest war ID can
  // monopolise a shared border forever and force later wars into stale peace.
  for (const war of [...state.wars].sort((a, b) => a.lastBattleTick - b.lastBattleTick
    || a.id.localeCompare(b.id))) {
    if (!state.wars.some((candidate) => candidate.id === war.id)) continue;
    const campaign = ensureWarCampaignStateV2(state, war);
    const permanentSurvivalWar = isPermanentRogueWarV2(state, war);
    if (selectIsEliminatedV2(state, war.attackerId)) {
      endWarsForEliminatedNationV2(state, war.attackerId, 'War ended after national elimination.', endedWars);
      continue;
    }
    if (selectIsEliminatedV2(state, war.defenderId)) {
      endWarsForEliminatedNationV2(state, war.defenderId, 'War ended after national elimination.', endedWars);
      continue;
    }
    if (!permanentSurvivalWar && state.tick >= campaign.expiresTick) {
      endWarV2(
        state,
        war,
        'The five-year campaign window ended; both empires consolidated their positions.',
        TRUCE_TICKS,
        endedWars,
      );
      continue;
    }
    if (war.revenge && state.tick >= war.revenge.expiresTick) war.revenge = null;
    const attackerArmy = nationalCombatManpowerV2(state, war.attackerId);
    const defenderArmy = nationalCombatManpowerV2(state, war.defenderId);
    if (!permanentSurvivalWar && attackerArmy <= 0.000001 && defenderArmy <= 0.000001) {
      endWarV2(state, war, 'Mutual army exhaustion ended the war without absorption.', TRUCE_TICKS, endedWars);
      continue;
    }
    // Zero national manpower never hands over a multi-territory empire in one
    // global capitulation. The surviving army must win each connected territory
    // in successive battle pulses, so the campaign still advances by fronts.
    const legalFront = hasLegalWarFrontV2(state, content, war.attackerId, war.defenderId)
      || hasLegalWarFrontV2(state, content, war.defenderId, war.attackerId);
    if (!permanentSurvivalWar
      && (!legalFront || state.tick - war.lastBattleTick >= STALE_WAR_TICKS)) {
      endWarV2(state, war, 'Conflict closed after 26 weeks without a legal battle front.', TRUCE_TICKS, endedWars);
      continue;
    }
    const warAge = state.tick - war.startedTick;
    // The terminal Survival timeline begins on contact. Its tick-zero Rogue
    // front reaches a first real pulse after one ordinary battle interval;
    // later axes and every non-Survival war retain normal mobilisation.
    const mobilizationTicks = permanentSurvivalWar && war.startedTick === 0
      ? BATTLE_INTERVAL_TICKS
      : campaignWarMobilizationTicksV2(state, content, war);
    const battleIntervalTicks = campaignWarBattleIntervalTicksV2(state, content, war);
    if (warAge < mobilizationTicks) continue;
    if (state.tick < campaign.consolidationUntilTick) continue;
    if ((warAge - mobilizationTicks) % battleIntervalTicks !== 0) continue;
    // Initiative ranking and the exact combat projection read the same
    // pre-exchange military state. Build that world snapshot once per live
    // war pulse instead of once for each side and again during resolution.
    const militaryBaseSnapshot = createMilitaryBaseSnapshotV2(state, content);
    const operations = chooseInitiativeOperationsV2(
      state,
      content,
      war,
      militaryBaseSnapshot,
    );
    if (operations.length === 0) continue;
    let conquered = false;
    for (const operation of operations) {
      if (usedSourceIds.has(operation.sourceId)
        || usedAllySupportSourceIds.has(operation.sourceId)) continue;
      if (permanentSurvivalWar
        && operation.commanderId === ROGUE_AI_NATION_ID_V2
        && !survivalRogueAxisCanFightV2(state, operation.sourceId)) {
        // A destroyed country's static screen may advertise the route, but it
        // cannot manufacture an endless sequence of zero-power attacks. The
        // axis comes alive only when a verified Antarctic convoy arrives.
        continue;
      }
      // A newly opened Survival axis must visibly mobilise before contact.
      // Scorched territories deliberately have no integration record, so this
      // persisted operation timer is also the bounded anti-ping-pong guard
      // after either side captures and the physical frontier is rebuilt.
      if (isSurvivalRogueHumanMultiFrontWarV2(state, war)
        && state.tick < operation.holdUntilTick) continue;
      const enemyId = operation.commanderId === war.attackerId ? war.defenderId : war.attackerId;
      if (!operationValidV2(state, content, operation, operation.commanderId, enemyId)) continue;
      const battle = resolveBattlePulseV2(
        state,
        content,
        war,
        operation,
        usedAllySupportSourceIds,
        militaryBaseSnapshot,
      );
      if (!battle) continue;
      usedSourceIds.add(operation.sourceId);
      usedAllySupportSourceIds.add(operation.sourceId);
      battles.push(battle);
      conquered ||= battle.conquered;
      // One declaration still resolves one territorial objective. Other
      // same-tick fronts stand down as soon as any one of them captures it.
      if (conquered) break;
    }
    const warBattles = battles.filter((battle) => battle.warId === war.id);
    if (warBattles.length > 0) {
      const attackerAfter = nationalCombatManpowerV2(state, war.attackerId);
      const defenderAfter = nationalCombatManpowerV2(state, war.defenderId);
      const conquestBattle = warBattles.find((battle) => battle.conquered);
      const campaignStopReason = conquestBattle && !permanentSurvivalWar
        ? campaignConquestStopReasonV2(state, war, conquestBattle)
        : undefined;
      if (selectIsEliminatedV2(state, war.attackerId)) {
        endWarsForEliminatedNationV2(state, war.attackerId, 'War ended after national elimination.', endedWars);
      } else if (selectIsEliminatedV2(state, war.defenderId)) {
        endWarsForEliminatedNationV2(state, war.defenderId, 'War ended after national elimination.', endedWars);
      } else if (campaignStopReason) {
        endWarV2(
          state,
          war,
          campaignStopReason,
          TRUCE_TICKS,
          endedWars,
        );
      } else if (!permanentSurvivalWar
        && attackerAfter <= 0.000001 && defenderAfter <= 0.000001) {
        endWarV2(state, war, 'Mutual army exhaustion ended the war without absorption.', TRUCE_TICKS, endedWars);
      }
    }
  }
  clearInvalidWarOperationsV2(state, content);
  return battles;
}
