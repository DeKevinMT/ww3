import type { BattleTactic, TerrainType } from '../../game/types';

export type { BattleTactic, TerrainType };

declare const nationIdBrand: unique symbol;
declare const territoryIdBrand: unique symbol;

export type NationIdV2 = string & { readonly [nationIdBrand]: 'NationIdV2' };
export type TerritoryIdV2 = string & { readonly [territoryIdBrand]: 'TerritoryIdV2' };
export type PlayerId = NationIdV2;
export type TerritoryId = TerritoryIdV2;

export const nationIdV2 = (value: string): NationIdV2 => value as NationIdV2;
export const territoryIdV2 = (value: string): TerritoryIdV2 => value as TerritoryIdV2;

export type WorldSpeedV2 = 0 | 1 | 2;
export type BudgetDomainV2 = 'military' | 'research' | 'development';
export type ResearchBranchV2 =
  | 'population-recruitment'
  | 'military-industry'
  | 'advanced-weapons'
  | 'defensive-systems'
  | 'logistics-medicine'
  | 'economy-science'
  | 'food-systems'
  | 'reserve-doctrine'
  | 'public-administration'
  | 'education-intelligence';
export type ResearchEffectV2 =
  | 'population-growth'
  | 'training'
  | 'force-capacity'
  | 'reinforcement-efficiency'
  | 'attack'
  | 'defense'
  | 'casualty-reduction'
  | 'recovery'
  | 'supply'
  | 'economy-growth'
  | 'research-speed'
  | 'research-efficiency'
  | 'food-production'
  | 'food-storage'
  | 'reserve-training'
  | 'reserve-mobilization'
  | 'tax-efficiency'
  | 'operating-efficiency'
  | 'iq-increase';
export type OperationDoctrineV2 = 'pressure' | 'breakthrough' | 'siege' | 'counteroffensive' | 'consolidation';
export type PolarRegionV2 = 'arctic' | 'antarctica';
export type PolarEndgamePhaseV2 =
  | 'dormant'
  | 'arctic-research'
  | 'warning'
  | 'contact'
  | 'counteroffensive'
  | 'core-exposed'
  | 'victory';
export type ArcticProjectIdV2 =
  | 'polar-demography'
  | 'baseline-calibration'
  | 'polar-relay-mesh'
  | 'anomaly-filtering'
  | 'neural-signature-map'
  | 'command-verification'
  | 'recovery-routing'
  | 'cryogenic-logistics'
  | 'rogue-ballistics'
  | 'predictive-defense'
  | 'strategic-mobilisation'
  | 'polar-supply-model'
  | 'ice-theatre-simulation'
  | 'deep-ice-signals';
export type AntarcticCorridorIdV2 = 'drake' | 'maud' | 'ross';
export type AntarcticSectorIdV2 =
  | 'drake-entry'
  | 'maud-entry'
  | 'ross-entry'
  | 'weddell-forge'
  | 'queen-maud-grid'
  | 'ross-array'
  | 'sentinel-labyrinth'
  | 'transantarctic-vault'
  | 'zero-point-core';
export type WarAccessV2 = 'land' | 'naval' | 'none';
export type FinanceModeV2 = 'normal' | 'conserving' | 'war' | 'insolvent';
export type NationalAiModeV2 = 'growth' | 'rebuild' | 'recovery' | 'catch-up' | 'war';
export type PeaceSettlementV2 = 'reparations' | 'ceasefire';
export type OfferStatusV2 = 'pending' | 'accepted' | 'declined' | 'expired';
export type CommanderMissionV2 =
  | 'standby'
  | 'assault-support'
  | 'defense'
  | 'logistics-relief'
  | 'evacuate'
  | 'hq-training';

/** Exact-100 policy for the Commander's non-territorial, player-managed economy. */
export interface CommanderEconomyPrioritiesV2 {
  training: number;
  logistics: number;
  development: number;
}

/**
 * APEX is a neural shield and force multiplier, never an army. Keeping these
 * values in a dedicated record prevents integrity from leaking into national
 * manpower, defeat, stalemate or casualty accounting.
 */
export interface ApexShieldStateV2 {
  /** Current energy available to intercept incoming national-army damage. */
  integrity: number;
  /** Maximum integrity. Fresh campaigns start fully charged. */
  maxIntegrity: number;
  /** Offline energy prepared for the next safe recharge step. */
  rechargeBuffer: number;
  /** Frozen talent multiplier applied to every safe integrity-recharge step. */
  rechargeMultiplier: number;
  /** Multiplies the supported national army's existing attack pressure. */
  attackMultiplier: number;
  /** Multiplies the supported national army's existing defensive pressure. */
  defenseMultiplier: number;
  /**
   * Fixed neural pulse damage available to a supported battle. This is energy,
   * never personnel, and the combat boundary bounds it against both the real
   * national formation and the hostile force before applying it.
   */
  pulseAttack: number;
  /** Share of Pulse power recovered from the normal multi-front split loss. */
  pulseProjectionRetention?: number;
  /** Extra Pulse multiplier contributed by each stored offensive charge. */
  pulseChargeBonusPerStep?: number;
  /** Damage blocked by one Energy. Base value is exactly one. */
  interceptEfficiency?: number;
  /** Spent interception Energy banked as offline Reserve Energy. */
  impactRecoveryShare?: number;
  /** Pulse multiplier used only while the network supports a defending front. */
  defensivePulseMultiplier?: number;
}

export interface CommanderEconomyStateV2 {
  /** Retained compatibility field. Canonical APEX private treasury is always zero. */
  treasury: number;
  /** Institutional output in billions per year, transferred fully to the Empire. */
  annualOutput: number;
  /** Stored projection energy used by movement, strikes and interception. */
  supplyStock: number;
  priorities: CommanderEconomyPrioritiesV2;
}

/** Stable save keys for frozen shield upgrades and campaign-local reboot charges. */
export interface CommanderCapabilitiesV2 {
  /** Projection Relay: 75% faster projection travel and safe-node transfer. */
  mobileHeadquarters: boolean;
  /** Emergency Reboot compatibility key: captures bounded impact energy. */
  fieldHospital: boolean;
  /** Omnipresence Grid; expands one shared projection budget across live fronts. */
  rapidResponse: boolean;
  /** Theater Mesh; expands the shared army-buff pool across extra fronts. */
  forceMultiplier: boolean;
  /** Overdrive: every third resolved supported assault doubles APEX Pulse only. */
  assaultSpecialist: boolean;
  /** Countermeasure: reflects 15% of damage actually intercepted. */
  defenseSpecialist: boolean;
  emergencyExtractionCharges: number;
}

/** Frozen account-wide support multipliers carried by one allied APEX network. */
export interface CommanderEmpireSupportV2 {
  recruitmentMultiplier: number;
  reserveTrainingMultiplier: number;
  /** National casualty multiplier while the shield is operational. */
  armyCasualtyMultiplier: number;
  /** Field-army recovery multiplier during shielded peacetime. */
  armyPeaceRecoveryMultiplier: number;
  /** Direct APEX food output in million-person-weeks per year. */
  annualFoodOutput: number;
  foodProductionMultiplier: number;
  foodStorageMultiplier: number;
  foodImportCostMultiplier: number;
}

/** Stable front selected by national strategy; APEX autonomously projects to it. */
export interface CommanderFrontAssignmentV2 {
  warId: string;
  sourceId: TerritoryId;
  targetId: TerritoryId;
}

/**
 * Retired NEXUS split-dome assignment retained only to normalize older saves.
 * Live Omnipresence Grid state is derived from active fronts and never writes
 * this location-bound sidecar.
 */
export interface ApexSecondaryProjectionV2 {
  locationId: TerritoryId;
  mission: Extract<CommanderMissionV2, 'assault-support' | 'defense'>;
  front: CommanderFrontAssignmentV2;
  /** Primary assignment that caused this deterministic secondary selection. */
  pairedPrimaryFront: CommanderFrontAssignmentV2;
}

/** Persisted capstone progress with deterministic legacy defaults. */
export interface ApexDoctrineRuntimeV2 {
  /** Supported assaults stored toward the next Overdrive: exact integer 0, 1 or 2. */
  lancerSupportedAssaultCount: number;
  /** Legacy migration field; canonical live runtime keeps this null. */
  secondaryProjection: ApexSecondaryProjectionV2 | null;
  /** True after the one Emergency Reboot charge has restored the shield. */
  emergencyRebootUsed: boolean;
}

/** Canonical multi-week movement; renderers interpolate this stored route and ETA. */
export interface CommanderTransitStateV2 {
  path: TerritoryId[];
  distanceKm: number;
  departTick: number;
  arriveTick: number;
}

/**
 * A genuine non-territorial neural-shield platform. APEX never owns soldiers,
 * reserves, recruitment, borders or a TerritoryState army.
 */
export interface CommanderForceStateV2 {
  shield: ApexShieldStateV2;
  economy: CommanderEconomyStateV2;
  capabilities: CommanderCapabilitiesV2;
  empireSupport: CommanderEmpireSupportV2;
  /** Frozen account progression for this campaign: zero is neutral, one is the full country trait. */
  countryTraitScale: number;
  /** Legacy save anchor for core recovery; never limits empire-shield coverage. */
  locationId: TerritoryId;
  /** `standby` while the distributed field is online; `hq-training` while fully recharging. */
  mission: CommanderMissionV2;
  /** Compatibility discriminant. New timelines always normalize APEX to autonomous control. */
  orderSource: 'manual' | 'autonomous';
  /** Legacy name retained for authenticated saves; no live retargeting depends on it. */
  manualHoldUntilTick: number;
  /** Legacy location-bound assignment; normalized to null by the network runtime. */
  front: CommanderFrontAssignmentV2 | null;
  /** Legacy movement record; normalized to null by the network runtime. */
  transit: CommanderTransitStateV2 | null;
  /**
   * Optional only at the TypeScript boundary so authenticated legacy saves can
   * be normalized before exact current-schema validation.
   */
  doctrineRuntime?: ApexDoctrineRuntimeV2;
}

/** Immutable profile snapshot supplied once at campaign bootstrap. */
export interface CommanderForceInitializationV2 {
  /** One non-personnel neural-energy pool; this is never national manpower. */
  shield: {
    integrity: number;
    maxIntegrity: number;
    rechargeBuffer?: number;
    rechargeMultiplier?: number;
    pulseAttack: number;
    pulseProjectionRetention?: number;
    pulseChargeBonusPerStep?: number;
    interceptEfficiency?: number;
    impactRecoveryShare?: number;
    defensivePulseMultiplier?: number;
  };
  /** Multipliers applied to the real national/Empire army while the shield is online. */
  attackMultiplier: number;
  defenseMultiplier: number;
  /** Frozen army modifiers copied into campaign-local Empire support. */
  armyCasualtyMultiplier?: number;
  armyPeaceRecoveryMultiplier?: number;
  treasury: number;
  annualOutput: number;
  supplyStock?: number;
  /** Defaults to one for direct/legacy callers; account campaigns always pass their frozen loadout. */
  countryTraitScale?: number;
  capabilities?: Partial<CommanderCapabilitiesV2>;
  /** Exact account snapshot; omitted by direct/legacy callers for base APEX support. */
  empireSupport?: Partial<CommanderEmpireSupportV2>;
}

export interface CommanderOrderTermsV2 {
  allowed: boolean;
  reason?: string;
  destinationId: TerritoryId;
  path: TerritoryId[];
  distanceKm: number;
  travelTicks: number;
  treasuryCost: number;
  supplyCost: number;
}

export interface BudgetPolicyV2 {
  military: number;
  research: number;
  development: number;
}

export interface NationalAiPlanV2 {
  mode: NationalAiModeV2;
  /** Normalized base plan after adapting intent; emergency food transfers happen in finance. */
  activeBudget: BudgetPolicyV2;
  /** Visible IQ-scaled execution multiplier shared by every country's AI. */
  efficiency: number;
  explanation: string;
}

/**
 * Authoritative projection of the regular army's next finance phase.
 * Recruitment, explicit extreme-crisis demobilization and all population-derived
 * territory caps are exact. During war, the following battle phase remains
 * stochastic, so `net` includes only a clearly marked historical loss estimate.
 */
export interface WeeklyManpowerProjectionV2 {
  deployedBefore: number;
  deployedAfterFinance: number;
  recruited: number;
  demobilized: number;
  trainedReservesBefore: number;
  trainedReservesAfter: number;
  reserveTrained: number;
  reserveDeployed: number;
  financePhaseNet: number;
  estimatedBattleLosses: number;
  net: number;
  exactNextWeek: boolean;
  battleLossesAreEstimate: boolean;
}

export interface GlobalResistanceV2 {
  level: 0 | 1 | 2;
  threat: number;
  members: number;
  memberIds: readonly PlayerId[];
  defenseBonus: number;
  offensiveBonus: number;
}

export type ResearchEffectLevelsV2 = Record<ResearchEffectV2, number>;
export type ResearchBreakthroughsV2 = Record<ResearchBranchV2, number>;
export type ResearchAllocationsV2 = Record<ResearchBranchV2, number>;
export type ResearchProgressByBranchV2 = Record<ResearchBranchV2, number>;

export interface ResearchStateV2 {
  /** Exact-100 extra-attention mix. The equal passive baseline is derived. */
  allocations: ResearchAllocationsV2;
  progress: ResearchProgressByBranchV2;
  effectLevels: ResearchEffectLevelsV2;
  breakthroughs: ResearchBreakthroughsV2;
}

/** One paid public-influence campaign. Suspicion relief is applied in equal weekly instalments. */
export interface PropagandaProgramStateV2 {
  startedTick: number;
  endsTick: number;
  totalSuspicionReduction: number;
  weeklySuspicionReduction: number;
}

export interface ManualActionUsesV2 {
  rapidRecruitment: number;
  researchSurge: number;
  propaganda: number;
}

/**
 * The free human opening-force surplus. It is tracked separately from ordinary
 * capacity so recruitment can never recreate it after losses or expiry.
 */
export interface OpeningArmyBonusStateV2 {
  initialManpower: number;
  remainingManpower: number;
  startedTick: number;
  expiresTick: number;
}

/** Exact canonical nation payload; identity and aggregates are derived. */
export interface NationStateV2 {
  /** Empty until the player names the empire after its first conquest. */
  empireName: string;
  treasury: number;
  /** Million-person-weeks of edible reserves. */
  foodStock: number;
  /** Fundable domestic output in million-person-weeks per week; changes only through the slow capacity ramp. */
  domesticFoodCapacity: number;
  /** Share of last week's national food demand actually supplied. */
  foodSecurity: number;
  /** Trained personnel held outside the deployed regular army, in millions. */
  trainedReserves: number;
  budget: BudgetPolicyV2;
  research: ResearchStateV2;
  /** Retired save-compatibility counter. Canonical runtime value is always zero. */
  ceasefiresRequested: number;
  /** Successful manual-button uses; each raises only that button's next fixed quote. */
  manualActionUses: ManualActionUsesV2;
  rapidRecruitmentAvailableTick: number;
  researchSurgeAvailableTick: number;
  propagandaAvailableTick: number;
  propagandaProgram: PropagandaProgramStateV2 | null;
  /** Human-only free opening surplus, fading to zero over its fixed calendar. */
  openingArmyBonus: OpeningArmyBonusStateV2 | null;
  warFatigue: number;
  capitalId: TerritoryId;
}

/** Presentation projection assembled by WorldEngineV2.player(). */
export interface NationViewV2 extends NationStateV2 {
  id: PlayerId;
  manpower: number;
  capacity: number;
  name: string;
  shortName: string;
  color: number;
  cssColor: string;
  darkColor: string;
  sigil: string;
  profile: string;
  isHuman: boolean;
  eliminated: boolean;
}

export interface ArmyStateV2 {
  /** Deployed regular combat manpower, in millions. */
  manpower: number;
  /** Built capacity, in millions; recruitment may fill manpower up to this value. */
  capacity: number;
  /** Manpower-weighted base attack quality carried by this local force. */
  baseAttack: number;
  /** Manpower-weighted base defense quality carried by this local force. */
  baseDefense: number;
}

export interface IntegrationProgramStateV2 {
  /** Distinguishes hostile occupation from a voluntary federation calendar. */
  cause?: 'conquest' | 'federation';
  /** The sovereign owner displaced when this specific capture began. */
  fromOwnerId: PlayerId;
  /** The sovereign core whose identity is being absorbed. */
  fromCoreOwnerId: PlayerId;
  /** The empire that becomes the permanent core owner on completion. */
  toOwnerId: PlayerId;
  startedTick: number;
  completesTick: number;
  /** Fixed billions per year, quoted from local GDP at the capture tick. */
  annualCost: number;
}

/** Exact canonical territory payload; geometry and presentation are static. */
export interface TerritoryStateV2 {
  owner: PlayerId;
  /** Permanent sovereign identity; changes only when a full integration program completes. */
  coreOwner: PlayerId;
  population: number;
  economy: number;
  /** 0..1 share of the population integrated into this owner's army system. */
  integration: number;
  /** Fixed calendar promise created on conquest; absent for stable core territory. */
  integrationProgram?: IntegrationProgramStateV2;
  army: ArmyStateV2;
}

export interface TerritoryViewV2 extends TerritoryStateV2 {
  id: TerritoryId;
}

export interface FrontOperationV2 {
  commanderId: PlayerId;
  sourceId: TerritoryId;
  targetId: TerritoryId;
  doctrine: OperationDoctrineV2;
  access: Exclude<WarAccessV2, 'none'>;
  startedTick: number;
  lastBattleTick: number;
  holdUntilTick: number;
  momentum: number;
}

/** One bounded post-settlement retaliation claim attached to its originating war. */
export interface WarRevengeStateV2 {
  claimantId: PlayerId;
  triggeredTick: number;
  expiresTick: number;
}

/** Persisted, bounded territorial goals for one bilateral war. */
export interface WarCampaignStateV2 {
  attackerObjective: number;
  defenderObjective: number;
  attackerCaptures: number;
  defenderCaptures: number;
  consolidationUntilTick: number;
  expiresTick: number;
}

/**
 * Canonical per-player APEX facts accumulated during one war. The nested
 * ledger is save-stable so a mid-war reload or multiplayer reconnect cannot
 * erase the eventual neural-dome report.
 */
export interface ApexWarTelemetryV2 {
  supportedBattles: number;
  /** Peak player-facing APEX support Power, on the same scale as map Power. */
  peakPower: number;
  /** Factual Max Integrity captured when this player's war ledger begins. */
  maxIntegrity: number;
  /** Net unrecoverable integrity impact reported by the compatibility allocator. */
  integrityLosses: number;
  supplyDelivered: number;
  supplySpent: number;
  singularityPulses: number;
  mirrorCounterpulseDamage: number;
  twinProjectionBattles: number;
}

/**
 * Canonical human-perspective facts that cannot be reconstructed after an
 * active war has already changed territory, treasury or national ratings.
 * Arrays stay sorted and unique so save hashes are independent of insertion
 * order. A missing ledger on an authenticated older save is hydrated from the
 * first loaded boundary and becomes save-stable from that point onward.
 */
export interface WarReportBaselineV2 {
  ownedTerritoryIds: TerritoryId[];
  touchedTerritoryIds: TerritoryId[];
  treasuryBefore: number;
  treasurySeized: number;
  treasuryLost: number;
  allySupportedBattles: number;
  allyPeakPower: number;
  allyLosses: number;
  allyContributorIds: PlayerId[];
  effectiveAttackBefore: number;
  effectiveDefenseBefore: number;
  combatPowerBefore: number;
  capacityBefore: number;
}

export interface WarStateV2 {
  id: string;
  attackerId: PlayerId;
  defenderId: PlayerId;
  startedTick: number;
  lastBattleTick: number;
  warScore: number;
  battles: number;
  attackerLosses: number;
  defenderLosses: number;
  /** Cumulative civilian population lost by the formal attacker, in millions. */
  attackerCivilianLosses?: number;
  /** Cumulative civilian population lost by the formal defender, in millions. */
  defenderCivilianLosses?: number;
  lastPeaceOfferTick: number;
  /** Compatibility lists containing at most one canonical front in total. */
  attackerOperations: FrontOperationV2[];
  defenderOperations: FrontOperationV2[];
  /** Canonical bounded retaliation window; absent legacy inputs normalize to null in saves. */
  revenge?: WarRevengeStateV2 | null;
  /** Absent legacy fixtures initialize deterministically on first simulation use. */
  campaign?: WarCampaignStateV2;
  /** Absent authenticated legacy saves normalize to an empty canonical ledger. */
  apexTelemetryByPlayer?: Partial<Record<PlayerId, ApexWarTelemetryV2>>;
  /** Save-stable post-war report inputs for each human belligerent. */
  reportBaselineByPlayer?: Partial<Record<PlayerId, WarReportBaselineV2>>;
}

export interface TruceStateV2 {
  leftId: PlayerId;
  rightId: PlayerId;
  expiresTick: number;
}

/** Retired save-only shape. Runtime and newly written saves always keep this array empty. */
export interface CeasefireObligationV2 {
  warId: string;
  payerId: PlayerId;
  payeeId: PlayerId;
  weeklyCost: number;
  startsTick: number;
  expiresTick: number;
}

/** Retired save-only shape. Runtime and newly written saves always keep this array empty. */
export interface PeaceOfferV2 {
  id: string;
  fromId: PlayerId;
  toId: PlayerId;
  warId: string;
  settlement: PeaceSettlementV2;
  createdTick: number;
  expiresTick: number;
  status: OfferStatusV2;
  cashAmount?: number;
  weeklyCost?: number;
  paymentWeeks?: number;
}

/** A permanent bilateral non-aggression pact between two human multiplayer countries. */
export interface AllianceV2 {
  /** Canonical lexicographically smaller country id. */
  leftId: PlayerId;
  /** Canonical lexicographically larger country id. */
  rightId: PlayerId;
  formedTick: number;
}

/** One directed, pending human-to-human alliance invitation. */
export interface AllianceOfferV2 {
  fromId: PlayerId;
  toId: PlayerId;
  createdTick: number;
  expiresTick: number;
}

export interface AllianceProposalStatusV2 {
  allowed: boolean;
  reason?: string;
}

export type WorldEventKindV2 = 'system' | 'economy' | 'research' | 'war' | 'battle' | 'conquest' | 'peace' | 'critical' | 'polar';

export interface WorldEventV2 {
  id: number;
  tick: number;
  kind: WorldEventKindV2;
  severity: 'info' | 'action' | 'critical';
  message: string;
  territoryId?: TerritoryId;
  playerId?: PlayerId;
  polarRegion?: PolarRegionV2;
  polarSectorId?: AntarcticSectorIdV2;
  unread: boolean;
}

export interface BattleEventV2 {
  warId: string;
  source: TerritoryId;
  target: TerritoryId;
  attacker: PlayerId;
  defender: PlayerId;
  sourceId: TerritoryId;
  targetId: TerritoryId;
  attackerId: PlayerId;
  defenderId: PlayerId;
  /** Actual national and allied military headcount lost, in millions. */
  attackerLosses: number;
  defenderLosses: number;
  /** National personnel losses only; APEX integrity is reported separately below. */
  regularAttackerLosses: number;
  regularDefenderLosses: number;
  commanderAttackerId: PlayerId | null;
  commanderDefenderId: PlayerId | null;
  commanderAttackerLosses: number;
  commanderDefenderLosses: number;
  /** National-equivalent damage actually intercepted by each neural dome. */
  commanderAttackerInterceptedDamage?: number;
  commanderDefenderInterceptedDamage?: number;
  /** Real hostile personnel removed by a bounded Countermeasure pulse. */
  commanderAttackerCounterpulseDamage?: number;
  commanderDefenderCounterpulseDamage?: number;
  /** Bounded neural-pulse damage committed by each supporting shield. */
  commanderAttackerPulseDamage?: number;
  commanderDefenderPulseDamage?: number;
  /** True only on an actually resolved third APEX-supported offensive Pulse. */
  commanderAttackerSingularityPulse?: boolean;
  /** Projection order only; all fronts consume one shared integrity pool. */
  commanderAttackerProjection?: 'primary' | 'secondary' | null;
  commanderDefenderProjection?: 'primary' | 'secondary' | null;
  commanderAttackerProjectionShare?: number;
  commanderDefenderProjectionShare?: number;
  commanderAttackerPower: number;
  commanderDefenderPower: number;
  commanderAttackerSupplySpent: number;
  commanderDefenderSupplySpent: number;
  commanderAttackerSupplyDelivered: number;
  commanderDefenderSupplyDelivered: number;
  /** Bounded human teammate contingent; ownership and losses stay with contributor. */
  allyAttackerSupport?: CoopAllyBattleSupportV2;
  allyDefenderSupport?: CoopAllyBattleSupportV2;
  /** Civilian losses in the attacker's source territory, in millions. */
  attackerPopulationLoss: number;
  /** Civilian losses in the attacked territory, in millions. */
  defenderPopulationLoss: number;
  /** Compatibility alias for defenderPopulationLoss. */
  populationLoss: number;
  economyLoss: number;
  capturedPopulation: number;
  capturedEconomy: number;
  treasurySeized: number;
  conquered: boolean;
  terrain: TerrainType;
  tactic: BattleTactic;
  phase: 'assault';
  attackerPower: number;
  defenderPower: number;
  operation: OperationDoctrineV2;
  attackerSupply: number;
  defenderSupply: number;
  momentum: number;
  supportingForces: number;
  tick: number;
}

export interface CoopAllyBattleSupportV2 {
  contributorId: PlayerId;
  sourceId: TerritoryId;
  manpower: number;
  power: number;
  losses: number;
  supplySpent: number;
  logisticsCost: number;
  access: Exclude<WarAccessV2, 'none'>;
  distanceKm: number;
}

/** One real, one-hop army redeployment generated by the weekly logistics phase. */
export interface LogisticsMovementV2 {
  playerId: PlayerId;
  sourceId: TerritoryId;
  targetId: TerritoryId;
  manpower: number;
  capacity: number;
  /** Actual one-hop route used by this weekly movement. */
  access: Exclude<WarAccessV2, 'none'>;
  /** Canonical sea-route distance; zero for land movements. */
  distanceKm: number;
  /** Sublinear equivalent-radius distance inside the source country. */
  interiorDistanceKm: number;
  /** Bounded physical-size load applied to this hop. */
  interiorOperationMultiplier: number;
  /** Treasury paid for this movement in billions; land logistics stays free. */
  logisticsCost: number;
}

export interface AiEscalationStateV2 {
  lastWarStartTick: number;
  /** Durable count of scripted opening conflicts already issued; event history is intentionally prunable. */
  openingConflictsStarted: number;
  lastFederationTick: number;
  resistanceLevel: 0 | 1 | 2;
  globalThreat: number;
  coalitionMembers: PlayerId[];
  lastHumanTerritoryCount: number;
  lastHumanPower: number;
}

export interface ArcticProjectRunV2 {
  projectId: ArcticProjectIdV2;
  playerId: PlayerId;
  startedTick: number;
  completesTick: number;
  costPaid: number;
}

export interface ArcticResearchProgressV2 {
  playerId: PlayerId;
  activeProject: ArcticProjectRunV2 | null;
  completedProjects: ArcticProjectIdV2[];
}

export type AntarcticSectorStatusV2 = 'hidden' | 'available' | 'contested' | 'secured';

export interface AntarcticSectorStateV2 {
  status: AntarcticSectorStatusV2;
  /** Remaining rogue-machine integrity, from zero through one hundred. */
  integrity: number;
  wave: number;
  discoveredTick: number | null;
  securedTick: number | null;
  securedBy: PlayerId | null;
}

export interface AntarcticExpeditionStateV2 {
  id: number;
  playerId: PlayerId;
  sectorId: AntarcticSectorIdV2;
  /** Surviving deployed trained reserves, in millions. */
  manpower: number;
  initialManpower: number;
  startedTick: number;
  lastPulseTick: number;
  damageDealt: number;
}

export type AntarcticGatewayBreachStatusV2 = 'sealed' | 'breaching' | 'open';

/** One of the three authored sea breaches; order and timing are save-stable. */
export interface AntarcticGatewayBreachStateV2 {
  gatewayId: AntarcticSectorIdV2;
  status: AntarcticGatewayBreachStatusV2;
  breachStartedTick: number | null;
  opensTick: number | null;
  openedTick: number | null;
}

export type RogueAttentionStageV2 =
  | 'disabled'
  | 'dormant'
  | 'observing'
  | 'mobilising'
  | 'breach-imminent'
  | 'active';

/** Campaign-only transparent gate; Survival starts directly at active. */
export interface RogueAttentionStateV2 {
  stage: RogueAttentionStageV2;
  liberatedWorldShare: number;
  benchmarkMetTick: number | null;
  nextStageTick: number | null;
  activatedTick: number | null;
}

export const APEX_TRANSMISSION_IDS_V2 = Object.freeze([
  'campaign-signal-anomaly',
  'campaign-communications-blackout',
  'campaign-first-strike-guidance',
  'campaign-ai-defeat-pattern',
  'campaign-first-war-recovery',
  'campaign-first-conquest',
  'campaign-first-purge-arrival',
  'campaign-first-liberation',
  'campaign-attention-observing',
  'campaign-attention-mobilising',
  'campaign-first-gateway',
  'campaign-first-wave',
  'rogue-prime-detected',
  'campaign-first-antarctic-sector',
  'campaign-core-defeated',
  'survival-terminal-briefing',
] as const);
export type ApexTransmissionIdV2 = (typeof APEX_TRANSMISSION_IDS_V2)[number];
/** `later` remains loadable for authenticated legacy saves, but is no longer a valid command. */
export type ApexTransmissionChoiceV2 = 'accept' | 'later' | 'acknowledge';

export interface ApexTransmissionV2 {
  id: ApexTransmissionIdV2;
  playerId: PlayerId;
  sentTick: number;
  title: string;
  body: string;
  action: 'north-pole-investigation' | 'first-strike-guidance' | null;
  /** Persisted map objective for actionable guidance; null for ordinary briefings. */
  targetId: TerritoryId | null;
  choice: ApexTransmissionChoiceV2 | null;
  /** Authoritative acknowledgement week; drives save-stable narrative spacing. */
  resolvedTick: number | null;
}

export interface ApexNarrativePlayerStateV2 {
  transmissions: ApexTransmissionV2[];
  investigationAuthorized: boolean;
}

/** Save-stable, run-local APEX story history. Never copied into account meta. */
export interface ApexNarrativeStateV2 {
  players: Partial<Record<PlayerId, ApexNarrativePlayerStateV2>>;
}

export type RoguePrimeStatusV2 =
  | 'dormant'
  | 'guarding'
  | 'sortie'
  | 'rebuilding'
  | 'destroyed';

/**
 * ROGUE PRIME is deliberately not stored with the allied APEX shield network.
 * Its route, sortie and rebuild clock are authoritative run state so reconnects
 * cannot reroll either its warning window or its vulnerability window.
 */
export interface RoguePrimeStateV2 {
  status: RoguePrimeStatusV2;
  force: CommanderForceStateV2 | null;
  sortieSequence: number;
  nextSortieTick: number | null;
  gatewayId: AntarcticSectorIdV2 | null;
  targetId: TerritoryId | null;
  departTick: number | null;
  strikeTick: number | null;
  returnTick: number | null;
  rebuildReadyTick: number | null;
}

/** Canonical fixed-size Arctic research and Antarctic endgame campaign. */
export interface PolarEndgameStateV2 {
  phase: PolarEndgamePhaseV2;
  /** First Stage-I completion: campaign intel blackout and ordinary-war unlock. */
  communicationsBlackoutTick: number | null;
  revealedBy: PlayerId | null;
  warningTick: number | null;
  contactTick: number | null;
  victoryTick: number | null;
  /** Commander whose expedition dealt the final blow; null denotes a shared Earth Defence victory. */
  victoryCommanderId: PlayerId | null;
  warningAcknowledgedBy: PlayerId[];
  arcticPrograms: Partial<Record<PlayerId, ArcticResearchProgressV2>>;
  sectors: Record<AntarcticSectorIdV2, AntarcticSectorStateV2>;
  /** Seeded permutation of the three authored gateways. */
  gatewayBreachOrder: AntarcticSectorIdV2[];
  gatewayBreaches: Partial<Record<AntarcticSectorIdV2, AntarcticGatewayBreachStateV2>>;
  rogueAttention: RogueAttentionStateV2;
  apexNarrative: ApexNarrativeStateV2;
  roguePrime: RoguePrimeStateV2;
  expeditions: AntarcticExpeditionStateV2[];
  earthDefenseMembers: PlayerId[];
  globalWave: number;
  nextCounteroffensiveTick: number | null;
  bossPhase: 0 | 1 | 2 | 3;
  bossIntegrity: number;
  suspicionReliefEarned: number;
  /**
   * Survival-only provenance for personnel physically staged by a Rogue wave
   * at Zero Point and subsequently carried through ordinary army logistics.
   * Sparse entries are millions of eligible machine personnel at a territory.
   */
  rogueWaveManpowerByTerritory: Partial<Record<TerritoryId, number>>;
  /** Cumulative eligible Rogue-wave losses personally inflicted by each human. */
  rogueWaveLossCreditByPlayer: Partial<Record<PlayerId, number>>;
  /** Incremented only when the renderer-visible polar state changes. */
  visualRevision: number;
  nextExpeditionId: number;
}

export type RunProgressionModeV2 = 'disabled' | 'campaign' | 'survival';
export type RunUpgradeCategoryV2 = 'commander' | 'logistics' | 'military' | 'recovery' | 'risk';

export const RUN_UPGRADE_IDS_V2 = Object.freeze([
  'corps-shock-doctrine',
  'corps-bulwark-doctrine',
  'corps-expansion',
  'corps-field-logistics',
  'blue-water-convoys',
  'continental-rail',
  'efficient-sealift',
  'forward-depots',
  'combined-arms',
  'defense-in-depth',
  'total-mobilization',
  'accelerated-training',
  'field-hospitals',
  'industrial-recovery',
  'civil-reconstruction',
  'reserve-stockpile',
  'all-in-offensive',
  'austere-mobilization',
  'overclocked-convoys',
] as const);
export type RunUpgradeIdV2 = (typeof RUN_UPGRADE_IDS_V2)[number];

export type RunDraftMilestoneKindV2 =
  | 'campaign-region'
  | 'survival-wave'
  | 'survival-recapture'
  | 'survival-antarctic-depth';

/** One once-only trigger waiting behind the currently visible offer. */
export interface RunDraftMilestoneV2 {
  id: string;
  label: string;
  kind: RunDraftMilestoneKindV2;
  createdTick: number;
}

/** Exactly three deterministic one-click choices belonging to one human. */
export interface RunDraftOfferV2 {
  id: string;
  playerId: PlayerId;
  milestoneId: string;
  milestoneLabel: string;
  milestoneKind: RunDraftMilestoneKindV2;
  createdTick: number;
  optionIds: [RunUpgradeIdV2, RunUpgradeIdV2, RunUpgradeIdV2];
}

export interface RunUpgradePickV2 {
  offerId: string;
  milestoneId: string;
  milestoneLabel: string;
  upgradeId: RunUpgradeIdV2;
  pickedTick: number;
}

export interface RunProgressionPlayerStateV2 {
  activeOffer: RunDraftOfferV2 | null;
  queuedMilestones: RunDraftMilestoneV2[];
  /** Includes active and queued milestones so oscillation can never retrigger one. */
  triggeredMilestoneIds: string[];
  picks: RunUpgradePickV2[];
  stacks: Partial<Record<RunUpgradeIdV2, number>>;
  /** Distinct scorched countries ever reclaimed by this player in this run. */
  recapturedScorchedTerritoryIds: TerritoryId[];
}

/** Canonical, run-only progression. It is saved and hashed but never copied to account meta. */
export interface RunProgressionStateV2 {
  mode: RunProgressionModeV2;
  players: Partial<Record<PlayerId, RunProgressionPlayerStateV2>>;
  /** Survival world ruins stay ruined after ownership and integration changes. */
  scorchedWorldTerritoryIds: TerritoryId[];
  nextOfferSequence: number;
}

/** Live facade state. speed/winner/gameOver are transient projections and omitted from saves/hashes. */
export interface WorldStateV2 {
  schemaVersion: 22;
  rulesVersion: string;
  contentVersion: string;
  mapId: string;
  seed: number;
  rngState: number;
  tick: number;
  actionSequence: number;
  speed: WorldSpeedV2;
  /** Legacy/global focus used by solo saves and primary containment pacing. */
  humanPlayerId: PlayerId;
  /** Sorted active countries whose war and peace choices belong to people. */
  humanPlayerIds: PlayerId[];
  /** Human country identities that consumed their one half-cost first conquest integration. */
  firstIntegrationDiscountUsedBy: PlayerId[];
  /** Human-owned non-territorial Commander organisations; absent entries preserve legacy national play. */
  commanderForces: Partial<Record<PlayerId, CommanderForceStateV2>>;
  players: Record<PlayerId, NationStateV2>;
  territories: Record<TerritoryId, TerritoryStateV2>;
  wars: WarStateV2[];
  truces: TruceStateV2[];
  ceasefireObligations: CeasefireObligationV2[];
  offers: PeaceOfferV2[];
  alliances: AllianceV2[];
  allianceOffers: AllianceOfferV2[];
  events: WorldEventV2[];
  aiEscalation: AiEscalationStateV2;
  polarEndgame: PolarEndgameStateV2;
  runProgression: RunProgressionStateV2;
  nextEventId: number;
  nextWarId: number;
  nextOfferId: number;
  winnerId?: PlayerId;
  gameOver: boolean;
}

export interface WeeklyFinanceBreakdownV2 {
  /** Realized domain shares; Development may reach 0 and the sum may fall below 100 while it is redirected to food. */
  activeBudget: BudgetPolicyV2;
  aiMode: NationalAiModeV2;
  aiEfficiency: number;
  /** Free weekly APEX institutional output paid directly into the shared Empire treasury. */
  apexContribution: number;
  /** Free weekly APEX food delivered into consumption/storage, in million-person-weeks. */
  apexFoodContribution: number;
  revenue: number;
  foodDemand: number;
  foodLandCapacity: number;
  foodStorageCapacity: number;
  /** Structural last-mile food access; prosperity and research can improve it. */
  foodAccessCeiling: number;
  foodProduced: number;
  foodDomesticProduced: number;
  foodImported: number;
  /** Domestic-only surplus sold after current demand and physical storage are fully covered. */
  foodExported: number;
  /** Gross weekly export receipt; domestic production remains fully recorded as an expense. */
  foodExportIncome: number;
  foodConsumed: number;
  foodBalance: number;
  /** Actual change in stored million-person-weeks after consumption and the storage cap. */
  foodStockChange: number;
  foodProduction: number;
  /** Development funding actually redirected to food during a live shortage. */
  foodDevelopmentTransfer: number;
  foodCoverage: number;
  foodTargetStock: number;
  ceasefirePayment: number;
  ceasefireIncome: number;
  /** Mandatory weekly administration and reconstruction cost for unfinished integrations. */
  integrationCost: number;
  /** Weekly state operations: starts at 20% of tax revenue and can fall toward 15% through research. */
  baseOperatingCost: number;
  /** Principal newly borrowed this week because committed payments exceeded liquidity. */
  newBorrowing: number;
  /** 10% origination premium plus the bounded carrying premium on persistent debt. */
  debtPremium: number;
  /** Cash above the displayed effective reserve invested through recurring programmes this week. */
  excessCashInvestment: number;
  /** Required weekly payroll and maintenance; underfunding alone never demobilizes. */
  armyUpkeep: number;
  /** Cash paid into upkeep, including a treasury-funded premium up to 125%. */
  fundedArmyUpkeep: number;
  warOperations: number;
  /** All weekly military spending: ordinary military envelope plus live-front operations. */
  totalMilitaryCost: number;
  military: number;
  research: number;
  development: number;
  recruitment: number;
  /** Regular trained soldiers added through the upkeep-funded national pipeline. */
  passiveRecruitment: number;
  /** Extra soldiers trained through the AI's paid mobilization fast-track. */
  acceleratedRecruitment: number;
  recruitmentAccelerationCost: number;
  /** Maximum trained reserve pool at the live 1x active-capacity rule. */
  trainedReserveCapacity: number;
  trainedReservesBefore: number;
  trainedReservesAfter: number;
  /** Newly trained reserve personnel, in millions. */
  reserveTraining: number;
  /** Military-envelope spending used to train the reserve pool. */
  reserveTrainingCost: number;
  /** Existing reserves transferred into deployed armies this week. */
  reserveDeployment: number;
  /** Explicit catastrophic-crisis force reduction, capped at 0.05% per week. */
  acceleratedDemobilization: number;
  demobilizationCost: number;
  standingOperations: number;
  /** Development funding committed to productive investment this week. */
  economyGrowth: number;
  /** Visible final annual real-economy growth rate after every component. */
  annualEconomyGrowthRate: number;
  economyBaseGrowthRate: number;
  economyInvestmentGrowthRate: number;
  economyResearchGrowthRate: number;
  economyFoodGrowthRate: number;
  populationGrowth: number;
  expenses: number;
  net: number;
  closingTreasury: number;
  reserveTarget: number;
  /** Effective upkeep funding from zero through 1.25; surplus above one accelerates training. */
  mandatoryFundingRatio: number;
  recruitmentFundingRatio: number;
  /** Immediate share of productive output lost to mobilization, disruption and fatigue. */
  warEconomicPenalty: number;
  /** Annual real-economy growth drag from active fronts and post-war fatigue. */
  warEconomyGrowthDrag: number;
  /** Annual population-growth drag expressed as a decimal rate. */
  warPopulationDrag: number;
  /** Share of research throughput lost to active-war disruption. */
  warResearchPenalty: number;
  mode: FinanceModeV2;
}

export interface TotalManpowerV2 {
  deployed: number;
  capacity: number;
}

/** One expensive emergency army action chosen automatically from current readiness. */
export interface RapidRecruitmentTermsV2 {
  playerId: PlayerId;
  allowed: boolean;
  reason?: string;
  atWar: boolean;
  cooldownRemaining: number;
  amount: number;
  cost: number;
  baseCost: number;
  useCount: number;
  useMultiplier: number;
  /** Weighted ATK/DEF quality of every recruited soldier. */
  qualityMultiplier: number;
  /** Quadratic elite-training price multiplier derived from ATK/DEF quality. */
  qualityCostMultiplier: number;
  /** Final peacetime price in billions per one million recruited soldiers. */
  costPerMillion: number;
  deployedBefore: number;
  deployedAfter: number;
  capacity: number;
}

/** One costly, player-directed push for exactly one normal research program. */
export interface ResearchSurgeTermsV2 {
  playerId: PlayerId;
  targetBranch: ResearchBranchV2;
  allowed: boolean;
  reason?: string;
  cooldownRemaining: number;
  /** Normal funded weeks applied only to the selected program. */
  progressWeeks: number;
  progressAdded: number;
  /** Explicit expansion premium on top of structural empire revenue. */
  empireScale: number;
  baseCost: number;
  useCount: number;
  useMultiplier: number;
  cost: number;
}

export interface NuclearPowerViewV2 {
  /** 0 = conventional only, 1–5 = increasingly difficult strategic deterrence tiers. */
  level: number;
  attackBonus: number;
  advancedWeaponsBreakthroughs: number;
  nextLevelAt: number;
  progressRatio: number;
  maxed: boolean;
}

export interface ArmyStrengthV2 extends TotalManpowerV2 {
  capacityTarget: number;
  fillRatio: number;
}

export interface NationalEconomyV2 {
  population: number;
  /** Current live population unlocked by the visible integration share. */
  effectivePopulation: number;
  /** Immutable opening population unlocked by the same integration share. */
  baselineProductivePopulation: number;
  /** Live productive population divided by its immutable reference. */
  productivePopulationFactor: number;
  /** Current live wealth in thousands of dollars per owned person. */
  wealthPerPerson: number;
  /** GDP per immutable reference person, used only to set the automatic tax rate. */
  fiscalReferenceWealthPerPerson: number;
  output: number;
  /** Real integrated GDP; population damage never changes this field by itself. */
  controlledOutput: number;
  /** Blended 50% GDP / 50% live-population public-revenue base. */
  taxableOutput: number;
  /** One fixed normalized fiscal percentage; alias of `dynamicTaxRate`. */
  taxRate: number;
  /** Compatibility name for the fixed normalized fiscal percentage. */
  dynamicTaxRate: number;
  weeklyRevenue: number;
}

/**
 * Compatibility ledger behind `NationalEconomyV2`. Real integrated GDP stays
 * separate from the blended public-revenue base so demographic damage can
 * change tax receipts without silently changing GDP, ranking or target value.
 */
export interface EconomicOutputLedgerV2 {
  population: number;
  /** Current live population unlocked by the visible integration share. */
  productivePopulation: number;
  /** Immutable opening population unlocked by the same integration share. */
  baselineProductivePopulation: number;
  /** Live productive population divided by its immutable reference. */
  productivePopulationFactor: number;
  /** Compatibility alias of current live productive population. */
  effectivePopulation: number;
  /** Current live wealth in thousands of dollars per owned person. */
  wealthPerPerson: number;
  /** GDP per immutable reference person, used only to set the automatic tax rate. */
  fiscalReferenceWealthPerPerson: number;
  /** Current total live owned GDP; population alone does not multiply it. */
  demographicOutput: number;
  /** Current GDP unlocked by the visible integration share. */
  integratedOutput: number;
  warOutputPenalty: number;
  warAdjustedOutput: number;
  /** Integrated GDP weighted 50/50 with live productive population. */
  taxableOutput: number;
  /** One fixed normalized fiscal percentage; this is not a player policy. */
  dynamicTaxRate: number;
  /** Compatibility alias of `dynamicTaxRate`. */
  taxRate: number;
  /** Historical IMF tax/GDP observation retained only as reference metadata. */
  referenceTaxRate: number | null;
  weeklyTaxRevenue: number;
}

export interface PopulationDynamicsV2 {
  /** Estimated births as an annual share of population. */
  annualBirthRate: number;
  /** Baseline and crisis mortality as an annual share of population. */
  annualDeathRate: number;
  /** Non-lethal demographic drag from active wars and post-war recovery. */
  annualWarPenaltyRate: number;
  /** Final annual population change after every component. */
  annualNetRate: number;
  weeklyDeaths: number;
  weeklyNet: number;
}

export interface ResearchEffectProgressV2 {
  effect: ResearchEffectV2;
  level: number;
  /** Effective percentage gained from one level for this country's live baseline. */
  impactPerLevel: number;
}

export interface ResearchBranchProgressV2 {
  branch: ResearchBranchV2;
  allocation: number;
  /** 5% baseline plus 70% of the extra-attention allocation. */
  fundingShare: number;
  weeklyFunding: number;
  progress: number;
  nextCost: number;
  /** Cost of the requirement after one more completion, using current modifiers. */
  followingCost: number;
  /** followingCost / nextCost; zero when the branch is capped. */
  nextCostIncreaseRatio: number;
  weeklyProgress: number;
  progressRatio: number;
  breakthroughs: number;
  maxed: boolean;
  effects: readonly ResearchEffectProgressV2[];
}

export type ResearchPortfolioV2 = readonly ResearchBranchProgressV2[];

export interface WarDeclarationStatusV2 {
  allowed: boolean;
  reason?: string;
  warning?: string;
  access: WarAccessV2;
  mobilizationCost: number;
}

export type ApexForecastStatusV2 = 'absent' | 'ready' | 'delayed' | 'committed' | 'unreachable';

/** Route-legal APEX neural-shield contribution used by target cards and forecasts. */
export interface ApexForecastContributionV2 {
  status: ApexForecastStatusV2;
  stagingTerritoryId: TerritoryId | null;
  /** Retired compatibility fields: APEX never has independent combat power. */
  power: number;
  effectivePower: number;
  /** Multipliers applied to the existing national formation on this front. */
  attackMultiplier: number;
  defenseMultiplier: number;
  supportBonusPercent: number;
  /** Expected first-pulse APEX pressure after route, readiness and supply availability. */
  projectedAttackPressure: number;
  /** Expected first-pulse APEX protection against counterfire. */
  projectedDefenseShield: number;
  /** Bounded fixed neural-pulse damage in the expected first battle. */
  projectedPulseDamage: number;
  chanceDelta: number;
  etaWeeks: number | null;
  readiness: number;
  supplyReadiness: number;
  reason: string;
}

export interface WarForecastV2 {
  attackerId: PlayerId;
  defenderId: PlayerId;
  access: WarAccessV2;
  sourceId?: TerritoryId;
  targetId?: TerritoryId;
  terrain?: TerrainType;
  winChance: number;
  outlook: 'dominant' | 'favored' | 'contested' | 'risky' | 'desperate';
  attackerStrength: number;
  defenderStrength: number;
  /** Total currently deployed combat manpower across the defending empire. */
  defenderEmpireStrength: number;
  /** Extra local deployment room supplied by the defending empire. */
  defenderEmpireSupport: number;
  defenderTerritoryCount: number;
  /** A surviving multi-territory defender receives one bounded retaliation phase. */
  retaliationExpected: boolean;
  attackerAttack: number;
  attackerDefense: number;
  defenderAttack: number;
  defenderDefense: number;
  attackerSupply: number;
  defenderSupply: number;
  supportingForces: number;
  defenderPositionMultiplier: number;
  terrainDefenseMultiplier: number;
  /** Expected first-pulse losses from the exact live combat formula. */
  projectedAttackerLosses: number;
  projectedDefenderLosses: number;
  projectedAttackerLossRate: number;
  projectedDefenderLossRate: number;
  estimatedWeeksMin: number;
  estimatedWeeksMax: number;
  apexContribution: ApexForecastContributionV2;
}

/** Live, perspective-aware estimate for one active war. Losses are actual headcount. */
export interface LiveWarEstimateV2 {
  warId: string;
  viewerId: PlayerId;
  enemyId: PlayerId;
  sourceId?: TerritoryId;
  targetId?: TerritoryId;
  operationCommanderId?: PlayerId;
  projectedOwnLosses: number;
  projectedEnemyLosses: number;
  totalOwnLosses: number;
  totalEnemyLosses: number;
  estimatedWeeksMin: number;
  estimatedWeeksMax: number;
  confidence: 'low' | 'medium' | 'high';
  outlook: 'enemy-collapse' | 'our-collapse' | 'contested' | 'stalled';
}

/** Authoritative quote for the manual, long-running suspicion-reduction program. */
export interface PropagandaTermsV2 {
  allowed: boolean;
  reason?: string;
  playerId: PlayerId;
  cost: number;
  structuralWeeklyTaxRevenue: number;
  empireScale: number;
  baseCost: number;
  useCount: number;
  useMultiplier: number;
  durationTicks: number;
  cooldownTicks: number;
  cooldownRemainingTicks: number;
  activeRemainingTicks: number;
  activeProgress: number;
  totalSuspicionReduction: number;
  weeklySuspicionReduction: number;
}

export interface ConquestForecastV2 {
  attackerId: PlayerId;
  targetId: PlayerId;
  territoryCount: number;
  retainedPopulation: number;
  retainedEconomy: number;
  initialIntegratedOutput: number;
  maxTreasurySeized: number;
  inheritedEnemyManpower: 0;
  asOfTick: number;
  assumptions: readonly string[];
}

/** A completed human campaign summary. This is emitted live and never saved. */
export interface WarOutcomeV2 {
  warId: string;
  startedTick: number;
  endedTick: number;
  humanId: PlayerId;
  opponentId: PlayerId;
  humanRole: 'attacker' | 'defender';
  result: 'victory' | 'defeat' | 'territorial-gain' | 'territorial-loss' | 'stalemate';
  reason: string;
  battles: number;
  warScore: number;
  ownLosses: number;
  enemyLosses: number;
  /** Civilian population lost by the human side during this war, in millions. */
  ownCivilianLosses: number;
  /** Civilian population lost by the opposing side during this war, in millions. */
  enemyCivilianLosses: number;
  /** Battles in this bilateral conflict where the human APEX shield was projected. */
  apexSupportedBattles: number;
  /** Highest actual APEX combat contribution recorded on one battle pulse. */
  apexPeakPower: number;
  /** Factual APEX Max Integrity captured for this conflict. */
  apexMaxIntegrity?: number;
  /** Net unrecoverable shield impact after any bounded recharge-buffer capture. */
  apexLosses: number;
  /** Exact APEX supply delivered and consumed while supporting this conflict. */
  apexSupplyDelivered: number;
  apexSupplySpent: number;
  /** Actually fired Overdrive Pulses during this conflict. */
  apexSingularityPulses?: number;
  /** Actual hostile personnel removed by Countermeasure pulses. */
  apexMirrorCounterpulseDamage?: number;
  /** Legacy counter for reports created before Omnipresence Grid. */
  apexTwinProjectionBattles?: number;
  /** Automatic co-op contingent contribution on this human side. */
  allySupportedBattles?: number;
  allyPeakPower?: number;
  allyLosses?: number;
  allyContributorIds?: PlayerId[];
  survivingManpower: number;
  territoriesGained: TerritoryId[];
  territoriesLost: TerritoryId[];
  gainedPopulation: number;
  lostPopulation: number;
  gainedEconomy: number;
  lostEconomy: number;
  treasuryBefore: number;
  treasuryAfter: number;
  treasurySeized: number;
  treasuryLost: number;
  /** National effective ATK at war start, including IQ, GDP/capita and research. */
  effectiveAttackBefore: number;
  /** National effective ATK after peace, on the same basis used everywhere else. */
  effectiveAttackAfter: number;
  /** National effective DEF at war start, including IQ, GDP/capita and research. */
  effectiveDefenseBefore: number;
  /** National effective DEF after peace, on the same basis used everywhere else. */
  effectiveDefenseAfter: number;
  combatPowerBefore: number;
  combatPowerAfter: number;
  capacityBefore: number;
  capacityAfter: number;
}

export interface WorldChangeV2 {
  reason: string;
  battle?: BattleEventV2;
  warOutcome?: WarOutcomeV2;
  victorId?: PlayerId;
  defeatedId?: PlayerId;
  critical?: boolean;
  polar?: {
    kind: 'project-started' | 'project-complete' | 'warning' | 'contact' | 'battle' | 'sector-secured' | 'counteroffensive' | 'victory';
    region: PolarRegionV2;
    playerId?: PlayerId;
    projectId?: ArcticProjectIdV2;
    sectorId?: AntarcticSectorIdV2;
  };
}

export type WorldCommandV2 =
  | { type: 'choose-country'; countryId: PlayerId }
  | { type: 'form-survival-empire'; flagshipId: PlayerId; memberIds: PlayerId[] }
  | { type: 'set-speed'; speed: WorldSpeedV2 }
  | { type: 'set-commander-priorities'; playerId: PlayerId; priorities: CommanderEconomyPrioritiesV2 }
  | {
    type: 'issue-commander-order';
    playerId: PlayerId;
    destinationId: TerritoryId;
    mission: CommanderMissionV2;
    front: CommanderFrontAssignmentV2 | null;
  }
  | { type: 'set-research-allocations'; playerId: PlayerId; allocations: ResearchAllocationsV2 }
  | { type: 'adjust-budget'; playerId: PlayerId; domain: BudgetDomainV2; delta: number }
  | { type: 'set-budget-policy'; playerId: PlayerId; budget: BudgetPolicyV2 }
  | { type: 'rapid-recruitment'; playerId: PlayerId }
  | { type: 'research-surge'; playerId: PlayerId; targetBranch: ResearchBranchV2 }
  | { type: 'launch-propaganda'; playerId: PlayerId }
  | { type: 'start-arctic-project'; playerId: PlayerId; projectId: ArcticProjectIdV2 }
  | { type: 'acknowledge-polar-warning'; playerId: PlayerId }
  | {
    type: 'respond-apex-transmission';
    playerId: PlayerId;
    transmissionId: ApexTransmissionIdV2;
    choice: ApexTransmissionChoiceV2;
  }
  | {
    type: 'choose-run-upgrade';
    playerId: PlayerId;
    offerId: string;
    upgradeId: RunUpgradeIdV2;
  }
  | { type: 'deploy-antarctic-expedition'; playerId: PlayerId; sectorId: AntarcticSectorIdV2; manpower: number }
  | { type: 'set-empire-name'; playerId: PlayerId; name: string }
  | { type: 'declare-war'; attackerId: PlayerId; defenderId: PlayerId; escalatedFromWarId?: string }
  | { type: 'propose-alliance'; fromId: PlayerId; targetId: PlayerId }
  | { type: 'respond-to-alliance'; fromId: PlayerId; toId: PlayerId; accept: boolean };

export interface CommandResultV2 {
  accepted: boolean;
  reason?: string;
}

export interface RankingEntryV2 {
  player: NationViewV2;
  score: number;
  /** Cached components from the same ranking snapshot, for cheap UI detail. */
  combatPower: number;
  economicOutput: number;
}
