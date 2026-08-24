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
export type WarAccessV2 = 'land' | 'naval' | 'none';
export type FinanceModeV2 = 'normal' | 'conserving' | 'war' | 'insolvent';
export type NationalAiModeV2 = 'growth' | 'rebuild' | 'recovery' | 'catch-up' | 'war';
export type PeaceSettlementV2 = 'reparations' | 'ceasefire';
export type OfferStatusV2 = 'pending' | 'accepted' | 'declined' | 'expired';

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
  /** Number of unilateral player ceasefires; each makes the next contract 10% dearer. */
  ceasefiresRequested: number;
  /** Successful manual-button uses; each raises only that button's next fixed quote. */
  manualActionUses: ManualActionUsesV2;
  rapidRecruitmentAvailableTick: number;
  researchSurgeAvailableTick: number;
  propagandaAvailableTick: number;
  propagandaProgram: PropagandaProgramStateV2 | null;
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
  condition: number;
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
  /** Stable, source-unique active fronts for each belligerent. */
  attackerOperations: FrontOperationV2[];
  defenderOperations: FrontOperationV2[];
  /** Canonical bounded retaliation window; absent legacy inputs normalize to null in saves. */
  revenge?: WarRevengeStateV2 | null;
}

export interface TruceStateV2 {
  leftId: PlayerId;
  rightId: PlayerId;
  expiresTick: number;
}

export interface CeasefireObligationV2 {
  warId: string;
  payerId: PlayerId;
  payeeId: PlayerId;
  weeklyCost: number;
  startsTick: number;
  expiresTick: number;
}

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

export type WorldEventKindV2 = 'system' | 'economy' | 'research' | 'war' | 'battle' | 'conquest' | 'peace' | 'critical';

export interface WorldEventV2 {
  id: number;
  tick: number;
  kind: WorldEventKindV2;
  severity: 'info' | 'action' | 'critical';
  message: string;
  territoryId?: TerritoryId;
  playerId?: PlayerId;
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
  /** Actual military headcount lost, in millions. */
  attackerLosses: number;
  defenderLosses: number;
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

/** One real, one-hop army redeployment generated by the weekly logistics phase. */
export interface LogisticsMovementV2 {
  playerId: PlayerId;
  sourceId: TerritoryId;
  targetId: TerritoryId;
  manpower: number;
  capacity: number;
}

export interface AiEscalationStateV2 {
  lastWarStartTick: number;
  lastFederationTick: number;
  resistanceLevel: 0 | 1 | 2;
  globalThreat: number;
  coalitionMembers: PlayerId[];
  lastHumanTerritoryCount: number;
  lastHumanPower: number;
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
  revenue: number;
  foodDemand: number;
  foodLandCapacity: number;
  foodStorageCapacity: number;
  /** Structural last-mile food access; prosperity, condition and research can improve it. */
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
  /** Opening cash above 10% of live GDP invested through recurring autonomous programmes this week. */
  excessCashInvestment: number;
  /** Required weekly payroll and maintenance; underfunding alone never demobilizes. */
  armyUpkeep: number;
  /** Portion of required upkeep actually funded inside the military envelope. */
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
  condition: number;
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
  mandatoryFundingRatio: number;
  recruitmentFundingRatio: number;
  conditionFundingRatio: number;
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
  /** Compatibility alias of `demographicOutput`. */
  conditionAdjustedOutput: number;
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
  /** Non-lethal demographic drag from active wars and war strain. */
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

export interface PeaceProposalTermsV2 {
  allowed: boolean;
  reason?: string;
  warId?: string;
  suggestedSettlement?: PeaceSettlementV2;
  cashAmount?: number;
  strengthGap: number;
}

export interface WarDeclarationStatusV2 {
  allowed: boolean;
  reason?: string;
  warning?: string;
  access: WarAccessV2;
  mobilizationCost: number;
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

export interface CeasefireTermsV2 {
  allowed: boolean;
  reason?: string;
  warId?: string;
  requesterId: PlayerId;
  opponentId?: PlayerId;
  weeklyCost: number;
  paymentWeeks: number;
  totalCost: number;
  repeatMultiplier: number;
  cooldownRemaining: number;
  truceTicks: number;
  postPaymentTruceTicks: number;
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
  result: 'victory' | 'defeat' | 'territorial-gain' | 'territorial-loss' | 'treaty' | 'stalemate';
  reason: string;
  battles: number;
  warScore: number;
  ownLosses: number;
  enemyLosses: number;
  /** Civilian population lost by the human side during this war, in millions. */
  ownCivilianLosses: number;
  /** Civilian population lost by the opposing side during this war, in millions. */
  enemyCivilianLosses: number;
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
  reparationsReceived: number;
  reparationsPaid: number;
  treatyWeeklyPayment: number;
  treatyPaymentWeeks: number;
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
}

export type WorldCommandV2 =
  | { type: 'choose-country'; countryId: PlayerId }
  | { type: 'set-speed'; speed: WorldSpeedV2 }
  | { type: 'set-research-allocations'; playerId: PlayerId; allocations: ResearchAllocationsV2 }
  | { type: 'adjust-budget'; playerId: PlayerId; domain: BudgetDomainV2; delta: number }
  | { type: 'set-budget-policy'; playerId: PlayerId; budget: BudgetPolicyV2 }
  | { type: 'rapid-recruitment'; playerId: PlayerId }
  | { type: 'research-surge'; playerId: PlayerId; targetBranch: ResearchBranchV2 }
  | { type: 'launch-propaganda'; playerId: PlayerId }
  | { type: 'set-empire-name'; playerId: PlayerId; name: string }
  | { type: 'declare-war'; attackerId: PlayerId; defenderId: PlayerId; escalatedFromWarId?: string }
  | { type: 'request-ceasefire'; warId: string; requesterId: PlayerId }
  | { type: 'propose-peace'; fromId: PlayerId; targetId: PlayerId; settlement: PeaceSettlementV2 }
  | { type: 'respond-to-offer'; offerId: string; accept: boolean }
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
