import type { GameModeV2 } from '../sim/v2/scenarios';
import type { CommanderForceInitializationV2 } from '../sim/v2/types';
import {
  APEX_EMPIRE_RECRUITMENT_BASE_BONUS_V2,
  APEX_EMPIRE_RESERVE_TRAINING_BASE_BONUS_V2,
} from '../sim/v2/commanderForce';

export const COMMANDER_PROFILE_SCHEMA_VERSION = 1 as const;
export const STARTER_COUNTRY_ID = 'grl' as const;
export const STARTER_COUNTRY_POOL_SIZE = 1;
/** Campaign seed money; a fresh account must earn the remainder of its first Survival entry. */
export const STARTING_COMMAND_CREDITS_V1 = 50;
/** Charged once per local commander seat when a new Survival timeline actually launches. */
export const SURVIVAL_DEPLOYMENT_CREDIT_COST_V1 = 100;
export const MAX_COUNTRY_UPGRADE_LEVEL = 5;
export const MAX_COUNTRY_MASTERY_LEVEL = 150;
/** Authored milestones end here; every talent remains repeatable afterwards. */
export const COMMANDER_TALENT_CORE_RANK = 15;
export const COUNTRY_LOADOUT_CATALOG_VERSION = 1 as const;
export const COUNTRY_MASTERY_OPENING_BONUS_PER_LEVEL = 0.0025;
/**
 * Capacity eventually becomes real combat mass, so it cannot be priced like a
 * narrow support stat. One point is deliberately close to the weighted Power
 * gain of one Firepower/Defense point, while still requiring time and treasury
 * to recruit the newly available soldiers.
 */
export const COUNTRY_MASTERY_FORCE_CAPACITY_PER_POINT_V1 = 0.01;
export const COUNTRY_MASTERY_FIREPOWER_PER_POINT_V1 = 0.015;
export const COUNTRY_MASTERY_DEFENSE_PER_POINT_V1 = 0.015;
export const COUNTRY_MASTERY_RECRUITMENT_PER_POINT_V1 = 0.02;
export const COUNTRY_MASTERY_RESERVE_TRAINING_PER_POINT_V1 = 0.025;
export const COUNTRY_MASTERY_LAND_SUPPLY_PER_POINT_V1 = 0.02;
export const COUNTRY_MASTERY_LAND_TRANSFER_PER_POINT_V1 = 0.015;
export const COUNTRY_MASTERY_NAVAL_SUPPLY_PER_POINT_V1 = 0.015;
export const COUNTRY_MASTERY_NAVAL_TRANSFER_PER_POINT_V1 = 0.01;
export const COUNTRY_MASTERY_NAVAL_COST_FACTOR_PER_POINT_V1 = 0.995;
export const COUNTRY_MASTERY_RECRUITMENT_COST_FACTOR_PER_POINT_V1 = 0.99;
export const COUNTRY_MASTERY_OPERATING_COST_FACTOR_PER_POINT_V1 = 0.9925;
export const COUNTRY_MASTERY_CASUALTY_FACTOR_PER_POINT_V1 = 0.99;
/** Legacy save field. Country traits are retired; mastery owns national identity. */
export const BASE_COUNTRY_TRAIT_SCALE_V1 = 0;

export type CountryUpgradeTrack = 'mobilization' | 'logistics' | 'research' | 'economy' | 'trait';
export type CountryMasteryTrackV1 = 'force' | 'firepower' | 'defense' | 'mobilization'
  | 'land-logistics' | 'expeditionary' | 'military-industry' | 'field-medicine';
export type CommanderTalentId =
  | 'elite-vanguard'
  | 'volunteer-brigade'
  | 'reserve-cadre'
  | 'mobile-logistics'
  | 'frugal-quartermaster'
  | 'science-corps'
  | 'treasury-reserve'
  | 'civil-defense'
  | 'doctrine-command'
  | 'drill-instructors'
  | 'combat-recovery'
  | 'theater-network';
export type CommanderDoctrineV1 = 'vanguard' | 'bastion' | 'rapid-response' | 'force-multiplier';
export type CampaignOutcomeV1 = 'victory' | 'defeat' | 'surrender';
/** Durable one-time Home onboarding unlocked only by settling a Campaign timeline. */
export type CampaignProgressionTutorialStateV1 = 'locked' | 'ready' | 'seen';
export type CommanderTransactionKindV1 = 'starter-grant' | 'country-unlock'
  | 'country-upgrade' | 'commander-talent' | 'campaign-reward' | 'survival-deployment'
  | 'survival-deployment-refund';

/**
 * Account identity deliberately uses a discriminated object instead of a bare
 * id. A later custom-flag editor can add another source without rewriting the
 * profile, lobby or renderer contracts introduced for country flags.
 */
export type EmpireFlagIdentityV1 = Readonly<{
  kind: 'country';
  countryId: string;
}>;

export interface CountryUpgradeLevelsV1 {
  mobilization: number;
  logistics: number;
  research: number;
  economy: number;
  trait: number;
}

export interface CountryMasteryAllocationsV1 {
  force: number;
  firepower: number;
  defense: number;
  mobilization: number;
  'land-logistics': number;
  expeditionary: number;
  'military-industry': number;
  'field-medicine': number;
}

/** Exact linear military effects frozen into every new campaign loadout. */
export interface ResolvedCountryMasteryMilitaryEffectsV1 {
  /** Free baseline from country experience; never affects GDP or treasury. */
  openingArmyMultiplier: number;
  armyCapacityMultiplier: number;
  attackMultiplier: number;
  defenseMultiplier: number;
  recruitmentMultiplier: number;
  reserveTrainingMultiplier: number;
  landSupplyMultiplier: number;
  landTransferThroughputMultiplier: number;
  navalSupplyMultiplier: number;
  navalTransferThroughputMultiplier: number;
  navalTransferCostMultiplier: number;
  recruitmentCostMultiplier: number;
  standingOperatingCostMultiplier: number;
  casualtyMultiplier: number;
}

export interface CountryMasteryV1 {
  xp: number;
  level: number;
  campaigns: number;
  victories: number;
  bestSurvivalWave: number;
  allocations: CountryMasteryAllocationsV1;
}

export interface ResolvedCountryLoadoutV1 {
  catalogVersion: typeof COUNTRY_LOADOUT_CATALOG_VERSION;
  masteryLevel: number;
  masteryAllocations: CountryMasteryAllocationsV1;
  masteryPointsEarned: number;
  masteryPointsSpent: number;
  masteryPointsAvailable: number;
  masteryMilitary: ResolvedCountryMasteryMilitaryEffectsV1;
  upgrades: CountryUpgradeLevelsV1;
  openingArmyMultiplier: number;
  openingEconomyMultiplier: number;
  /** Multiplicative slice contributed by mastery alone, before paid tracks. */
  masteryOpeningArmyMultiplier: number;
  /** Legacy compatibility field. Country mastery no longer buffs economy. */
  masteryOpeningEconomyMultiplier: number;
  traitScale: number;
  commanderLevel: number;
  commanderTalents: Record<CommanderTalentId, number>;
  activeDoctrine: CommanderDoctrineV1 | null;
  eliteStarterManpower: number;
  regularStarterManpower: number;
  trainedReserveStarterManpower: number;
  openingTreasuryBonus: number;
  /** Legacy field name: this is APEX battlefield supply stock, not civilian food. */
  openingFoodWeeksBonus: number;
}

export type CommanderTalentBranchV1 = 'offensive' | 'defensive' | 'shield-core' | 'military-command';

export interface CommanderTalentPrerequisiteV1 {
  talentId: CommanderTalentId;
  rank: number;
}

export interface CommanderTalentDefinitionV1 {
  id: CommanderTalentId;
  branch: CommanderTalentBranchV1;
  /** Authored position inside one branch. Ranks remain endless after the core. */
  tier: 1 | 2 | 3 | 4;
  label: string;
  description: string;
  perRank: string;
  prerequisites: readonly Readonly<CommanderTalentPrerequisiteV1>[];
  /** Small cross-branch gate that makes deep specialization a deliberate build. */
  outsideBranchPoints: number;
  milestones: readonly Readonly<{ rank: number; label: string; description: string }>[];
  synergy: string;
  /** Last authored milestone, not a progression cap. */
  coreRank: typeof COMMANDER_TALENT_CORE_RANK;
}

export interface CommanderDoctrineDefinitionV1 {
  id: CommanderDoctrineV1;
  label: string;
  role: string;
  requirement: Readonly<{ talentId: CommanderTalentId; rank: number; label: string }>;
  description: string;
}

export interface CommanderTalentAllocationQuoteV1 {
  talentId: CommanderTalentId;
  targetRank: number;
  requiredLevel: number;
  available: boolean;
  reason?: string;
  unmetPrerequisite?: Readonly<{
    talentId: CommanderTalentId;
    rank: number;
    label: string;
  }>;
  unmetBreadth?: Readonly<{
    current: number;
    required: number;
    scope: 'outside-branch' | 'other-nodes';
  }>;
}

/**
 * Exact campaign-start contribution of the account talent build. Integrity
 * values retain the simulation's legacy million-unit scale. Keeping this calculation
 * separate from menu copy prevents a talent description drifting away from
 * the force that is actually spawned.
 */
export interface ResolvedCommanderTalentEffectsV1 {
  /** Fraction added to the shield's maximum Energy pool. */
  maxIntegrityBonus: number;
  /** Fraction of Max Energy available as protected Reserve Energy. */
  rechargeBufferBonus: number;
  /** Fraction added to peacetime shield recharge speed. */
  rechargeRateBonus: number;
  /** Fraction added to the existing national army's Attack while the shield is online. */
  armyAttackBonus: number;
  /** Fraction added to APEX's bounded, non-personnel Pulse Attack. */
  pulseAttackBonus: number;
  /** Share of Pulse power retained instead of being lost when the network splits across fronts. */
  pulseProjectionRetention: number;
  /** Extra Pulse multiplier for each stored offensive charge (zero, one or two). */
  pulseChargeBonusPerStep: number;
  /** Extra damage blocked by each point of APEX Energy. */
  interceptEfficiencyBonus: number;
  /** Share of Energy spent intercepting a hit that is banked as offline Reserve Energy. */
  impactRecoveryShare: number;
  /** Extra Pulse Attack applied only while APEX supports the defending side. */
  defensivePulseBonus: number;
  /** Fraction added to the existing national army's Defense while the shield is online. */
  armyDefenseBonus: number;
  /** Retired compatibility field; direct casualty reduction is always zero. */
  armyCasualtyReduction: number;
  /** Fraction added to national army recovery during peace while the shield is online. */
  armyPeaceRecoveryBonus: number;
}

/** One account-wide APEX neural shield. */
export const BASE_COMMANDER_FORCE_V1 = Object.freeze({
  /** Empire-wide shield Energy; every fresh campaign starts fully charged. */
  integrity: 0.001,
  maxIntegrity: 0.001,
  /** Protected energy that can refill the same shield. */
  rechargeBuffer: 0.00004,
  /** Bounded battle pulse; it never becomes personnel or survives without a national Army. */
  pulseAttack: 0.001,
  attackMultiplier: 1.12,
  defenseMultiplier: 1.07,
  treasury: 0,
  annualOutput: 0.015,
  energyStock: 0.010,
});

/** Account levels improve APEX operations without eclipsing a weak host economy. */
export const COMMANDER_LEVEL_ANNUAL_OUTPUT_GROWTH_V1 = 0.00005;

export interface CommanderTransactionV1 {
  id: string;
  revision: number;
  kind: CommanderTransactionKindV1;
  amount: number;
  balanceAfter: number;
  createdAt: number;
  countryId?: string;
  track?: CountryUpgradeTrack;
  talentId?: CommanderTalentId;
  campaignId?: string;
  deploymentId?: string;
}

export interface CommanderProfileV1 {
  schemaVersion: typeof COMMANDER_PROFILE_SCHEMA_VERSION;
  revision: number;
  commanderId: string;
  displayName: string;
  /** Account-wide identity applied when a new solo campaign starts. */
  empireName: string;
  /** Account-wide flag projected across the player's empire in every mode. */
  empireFlag: EmpireFlagIdentityV1;
  /** Account currency used only to deploy a new Survival timeline. */
  commandCredits: number;
  commanderXp: number;
  commanderLevel: number;
  commanderTalents: Record<CommanderTalentId, number>;
  /** One earned account-wide battlefield posture; null until a doctrine requirement is met. */
  activeDoctrine: CommanderDoctrineV1 | null;
  unlockedCountryIds: string[];
  /** Legacy history key. Old purge-earned access migrates directly into unlockedCountryIds. */
  defeatedCountryIds: string[];
  /** Retired save key kept only so older profiles remain schema-compatible. */
  campaignAdaptation: Record<string, number>;
  /** @deprecated Retired notification queue. Always normalized to an empty array. */
  pendingCountryUnlockNotificationIds: string[];
  countryUpgrades: Record<string, CountryUpgradeLevelsV1>;
  countryMastery: Record<string, CountryMasteryV1>;
  /** Account-wide gate: the guided APEX Campaign opening has been experienced once. */
  campaignTutorialCompleted: boolean;
  /** Separate post-run guide for spending APEX Talent and Nation Mastery points. */
  campaignProgressionTutorialState: CampaignProgressionTutorialStateV1;
  completedCampaigns: number;
  victories: number;
  defeats: number;
  surrenders: number;
  /** Campaign-earned Credits; the opening grant is intentionally excluded. */
  lifetimeCreditsEarned: number;
  claimedCampaignIds: string[];
  transactions: CommanderTransactionV1[];
  createdAt: number;
  updatedAt: number;
}

export interface CountryUnlockQuoteV1 {
  countryId: string;
  strengthRank: number;
  countryCount: number;
  starterEligible: boolean;
}

export interface CountryStrengthV1 {
  countryId: string;
  strength: number;
}

export interface CampaignRewardInputV1 {
  campaignId: string;
  countryId: string;
  mode: GameModeV2;
  outcome: CampaignOutcomeV1;
  weeksSurvived: number;
  territoriesGained: number;
  /** Starting territories genuinely lost during the timeline. */
  territoriesLost?: number;
  warsWon: number;
  /** Completed and still-active wars involving this player after deployment. */
  warsFought?: number;
  highestSurvivalWave: number;
  /** Millions of verified post-launch Rogue-wave personnel destroyed. */
  verifiedRogueWaveLosses?: number;
  militaryLosses: number;
}

export interface CampaignRewardV1 extends CampaignRewardInputV1 {
  /** XP pacing metadata retained for reports and deterministic balance tests. */
  modeMultiplier: number;
  outcomeMultiplier: number;
  masteryXp: number;
  commanderXp: number;
  /** Campaign-only deployment currency. Survival and Alternative Universe always award zero. */
  creditsEarned: number;
  score: number;
}

export interface SurvivalDeploymentCreditQuoteV1 {
  cost: number;
  balance: number;
  balanceAfter: number;
  affordable: boolean;
}

export interface SurvivalDeploymentCreditSpendResultV1 extends ProgressionActionResultV1 {
  /** False for an idempotent retry of an already-paid deployment id. */
  charged: boolean;
  quote: SurvivalDeploymentCreditQuoteV1;
}

export interface SurvivalDeploymentCreditRefundResultV1 extends ProgressionActionResultV1 {
  /** False when this deployment was already refunded or was never charged. */
  refunded: boolean;
}

export interface ProgressionActionResultV1 {
  accepted: boolean;
  profile: CommanderProfileV1;
  reason?: string;
}

export interface CampaignDefeatUnlockResultV1 extends ProgressionActionResultV1 {
  /** Countries added directly to the permanent roster; empty for an idempotent no-op. */
  newlyUnlockedCountryIds: string[];
  /** @deprecated Compatibility alias for older callers. */
  newlyAvailableCountryIds: string[];
}

export const COMMANDER_TALENT_IDS_V1: readonly CommanderTalentId[] = [
  'elite-vanguard',
  'volunteer-brigade',
  'reserve-cadre',
  'mobile-logistics',
  'frugal-quartermaster',
  'science-corps',
  'treasury-reserve',
  'civil-defense',
  'doctrine-command',
  'drill-instructors',
  'combat-recovery',
  'theater-network',
] as const;

export const COUNTRY_MASTERY_TRACK_IDS_V1: readonly CountryMasteryTrackV1[] = [
  'force',
  'firepower',
  'defense',
  'mobilization',
  'land-logistics',
  'expeditionary',
  'military-industry',
  'field-medicine',
] as const;

export const COMMANDER_DOCTRINES_V1: readonly CommanderDoctrineDefinitionV1[] = [
  {
    id: 'vanguard',
    label: 'Overdrive',
    role: 'PULSE WARFARE CAPSTONE',
    requirement: { talentId: 'elite-vanguard', rank: 5, label: 'Overdrive Core Rank 5' },
    description: 'Every third supported attack doubles APEX Pulse Attack only, then spends 2% Max Energy. Army Attack never changes.',
  },
  {
    id: 'bastion',
    label: 'Countermeasure',
    role: 'REACTIVE MATRIX CAPSTONE',
    requirement: { talentId: 'doctrine-command', rank: 5, label: 'Countermeasure Core Rank 5' },
    description: 'Returns 15% of damage actually intercepted by APEX, within the hostile Army’s remaining 10% hit budget.',
  },
  {
    id: 'rapid-response',
    label: 'Emergency Reboot',
    role: 'ENERGY CORE CAPSTONE',
    requirement: { talentId: 'frugal-quartermaster', rank: 5, label: 'Reboot Core Rank 5' },
    description: 'Once per campaign, reaching 0% Energy immediately restores 20% after the battle. An Army at zero still loses.',
  },
  {
    id: 'force-multiplier',
    label: 'Theater Mesh',
    role: 'EMPIRE WARFARE CAPSTONE',
    requirement: { talentId: 'theater-network', rank: 5, label: 'Theater Coordination Rank 5' },
    description: 'Each additional front adds 20% to the shared national Army buff pool, capped at 140%, then divides it across all fronts.',
  },
] as const;

/** Shared profile, storage and UI gate for doctrine availability. */
export function commanderDoctrineRequirementMetV1(
  talents: Readonly<Partial<Record<CommanderTalentId, number>>>,
  doctrine: CommanderDoctrineV1,
): boolean {
  const definition = COMMANDER_DOCTRINES_V1.find((entry) => entry.id === doctrine);
  return Boolean(definition
    && finiteNonNegative(talents[definition.requirement.talentId])
      >= definition.requirement.rank);
}

export const COMMANDER_TALENTS_V1: readonly CommanderTalentDefinitionV1[] = [
  {
    id: 'science-corps', branch: 'offensive', tier: 1, label: 'Pulse Output',
    description: 'Raises APEX’s own Pulse Attack.',
    perRank: '+2% Pulse Attack per effective rank. Shared Pulse ceiling: +200%.',
    prerequisites: [], outsideBranchPoints: 0,
    milestones: [
      { rank: 5, label: 'Pulse I', description: '+3.72% Pulse Attack.' },
      { rank: 10, label: 'Pulse II', description: '+12.97% Pulse Attack.' },
      { rank: 15, label: 'Pulse III', description: '+36% Pulse Attack.' },
    ],
    synergy: 'Opens Front Projection.', coreRank: COMMANDER_TALENT_CORE_RANK,
  },
  {
    id: 'treasury-reserve', branch: 'offensive', tier: 2, label: 'Front Projection',
    description: 'Preserves more Pulse power when APEX supports several fronts at once.',
    perRank: '+0.35% of otherwise-lost multi-front Pulse power retained per effective rank.',
    prerequisites: [{ talentId: 'science-corps', rank: 3 }], outsideBranchPoints: 2,
    milestones: [
      { rank: 5, label: 'Projection I', description: 'Retains 0.65% of split Pulse power.' },
      { rank: 10, label: 'Projection II', description: 'Retains 2.27% of split Pulse power.' },
      { rank: 15, label: 'Projection III', description: 'Retains 6.30% of split Pulse power.' },
    ],
    synergy: 'Requires Pulse Output Rank 3 and 2 points outside Pulse Warfare.', coreRank: COMMANDER_TALENT_CORE_RANK,
  },
  {
    id: 'elite-vanguard', branch: 'offensive', tier: 3, label: 'Pulse Charge',
    description: 'Builds stronger Pulse charge across consecutive supported attacks, then unlocks Overdrive.',
    perRank: '+0.50% Pulse Attack per stored charge and effective rank. APEX stores up to two charges.',
    prerequisites: [{ talentId: 'treasury-reserve', rank: 3 }], outsideBranchPoints: 4,
    milestones: [
      { rank: 5, label: 'Overdrive', description: '+0.93% Pulse per stored charge · unlock: every third supported attack doubles Pulse only and spends 2% Max Energy.' },
      { rank: 10, label: 'Charge II', description: '+3.24% Pulse per stored charge.' },
      { rank: 15, label: 'Charge III', description: '+9% Pulse per stored charge.' },
    ],
    synergy: 'Unlocks Overdrive at Rank 5.', coreRank: COMMANDER_TALENT_CORE_RANK,
  },
  {
    id: 'volunteer-brigade', branch: 'defensive', tier: 1, label: 'Energy Efficiency',
    description: 'Makes every point of APEX Energy stop more incoming damage.',
    perRank: '+0.50% damage blocked per Energy per effective rank. The 20% Max Energy hit limit stays unchanged.',
    prerequisites: [], outsideBranchPoints: 0,
    milestones: [
      { rank: 5, label: 'Efficiency I', description: '+0.93% damage blocked per Energy.' },
      { rank: 10, label: 'Efficiency II', description: '+3.24% damage blocked per Energy.' },
      { rank: 15, label: 'Efficiency III', description: '+9% damage blocked per Energy.' },
    ],
    synergy: 'Opens Impact Recovery.', coreRank: COMMANDER_TALENT_CORE_RANK,
  },
  {
    id: 'civil-defense', branch: 'defensive', tier: 2, label: 'Impact Recovery',
    description: 'Banks part of the Energy spent blocking a hit as offline Reserve Energy for later recovery.',
    perRank: '+0.35% of spent Energy recovered to Reserve per effective rank.',
    prerequisites: [{ talentId: 'volunteer-brigade', rank: 3 }], outsideBranchPoints: 2,
    milestones: [
      { rank: 5, label: 'Recovery I', description: 'Recovers 0.65% of spent Energy to Reserve.' },
      { rank: 10, label: 'Recovery II', description: 'Recovers 2.27% of spent Energy to Reserve.' },
      { rank: 15, label: 'Recovery III', description: 'Recovers 6.30% of spent Energy to Reserve.' },
    ],
    synergy: 'Requires Energy Efficiency Rank 3 and 2 points outside Reactive Matrix.', coreRank: COMMANDER_TALENT_CORE_RANK,
  },
  {
    id: 'doctrine-command', branch: 'defensive', tier: 3, label: 'Defense Pulse',
    description: 'Raises APEX Pulse only while defending, then unlocks bounded Countermeasure reflection.',
    perRank: '+1% defensive Pulse Attack per effective rank.',
    prerequisites: [{ talentId: 'civil-defense', rank: 3 }], outsideBranchPoints: 4,
    milestones: [
      { rank: 5, label: 'Countermeasure', description: '+1.86% defensive Pulse · unlock: return 15% of intercepted damage inside the hostile 10% hit budget.' },
      { rank: 10, label: 'Defense Pulse II', description: '+6.49% defensive Pulse.' },
      { rank: 15, label: 'Defense Pulse III', description: '+18% defensive Pulse.' },
    ],
    synergy: 'Unlocks Countermeasure at Rank 5.', coreRank: COMMANDER_TALENT_CORE_RANK,
  },
  {
    id: 'reserve-cadre', branch: 'shield-core', tier: 1, label: 'Max Energy',
    description: 'Expands the shared Energy pool.',
    perRank: '+2% Max Energy per effective rank; capped at +150%.',
    prerequisites: [], outsideBranchPoints: 0,
    milestones: [
      { rank: 5, label: 'Energy I', description: '+3.72% Max Energy.' },
      { rank: 10, label: 'Energy II', description: '+12.97% Max Energy.' },
      { rank: 15, label: 'Energy III', description: '+36% Max Energy.' },
    ],
    synergy: 'Opens Shield Recharge.', coreRank: COMMANDER_TALENT_CORE_RANK,
  },
  {
    id: 'drill-instructors', branch: 'shield-core', tier: 2, label: 'Energy Recharge',
    description: 'Recharges Energy faster between battles.',
    perRank: '+2% Energy Recharge per effective rank; capped at +120%.',
    prerequisites: [{ talentId: 'reserve-cadre', rank: 3 }], outsideBranchPoints: 2,
    milestones: [
      { rank: 5, label: 'Recharge I', description: '+3.72% Energy Recharge.' },
      { rank: 10, label: 'Recharge II', description: '+12.97% Energy Recharge.' },
      { rank: 15, label: 'Recharge III', description: '+36% Energy Recharge.' },
    ],
    synergy: 'Requires Max Energy Rank 3 and 2 points outside Energy Core.', coreRank: COMMANDER_TALENT_CORE_RANK,
  },
  {
    id: 'frugal-quartermaster', branch: 'shield-core', tier: 3, label: 'Reserve Energy',
    description: 'Expands protected Reserve Energy, then unlocks one emergency restart.',
    perRank: '+1% Reserve Energy per effective rank; capped at +60%.',
    prerequisites: [{ talentId: 'drill-instructors', rank: 3 }], outsideBranchPoints: 4,
    milestones: [
      { rank: 5, label: 'Emergency Reboot', description: '+1.86% Reserve Energy · unlock: once per campaign, 0% Energy immediately restores to 20% after battle.' },
      { rank: 10, label: 'Reserve II', description: '+6.49% Reserve Energy.' },
      { rank: 15, label: 'Reserve III', description: '+18% Reserve Energy.' },
    ],
    synergy: 'Unlocks Emergency Reboot at Rank 5.', coreRank: COMMANDER_TALENT_CORE_RANK,
  },
  {
    id: 'mobile-logistics', branch: 'military-command', tier: 1, label: 'Army Attack',
    description: 'Raises national Army Attack while APEX is online.',
    perRank: '+0.55% Army Attack per effective rank. Shared ceiling: +35%.',
    prerequisites: [], outsideBranchPoints: 0,
    milestones: [
      { rank: 5, label: 'Attack I', description: '+1.02% Army Attack.' },
      { rank: 10, label: 'Attack II', description: '+3.57% Army Attack.' },
      { rank: 15, label: 'Attack III', description: '+9.90% Army Attack.' },
    ],
    synergy: 'Opens Army Defense.', coreRank: COMMANDER_TALENT_CORE_RANK,
  },
  {
    id: 'combat-recovery', branch: 'military-command', tier: 2, label: 'Army Defense',
    description: 'Raises national Army Defense while APEX is online.',
    perRank: '+0.40% Army Defense per effective rank. Shared ceiling: +35%.',
    prerequisites: [{ talentId: 'mobile-logistics', rank: 3 }], outsideBranchPoints: 2,
    milestones: [
      { rank: 5, label: 'Defense I', description: '+0.74% Army Defense.' },
      { rank: 10, label: 'Defense II', description: '+2.59% Army Defense.' },
      { rank: 15, label: 'Defense III', description: '+7.20% Army Defense.' },
    ],
    synergy: 'Requires Army Attack Rank 3 and 2 points outside Empire Warfare.', coreRank: COMMANDER_TALENT_CORE_RANK,
  },
  {
    id: 'theater-network', branch: 'military-command', tier: 3, label: 'Peace Recovery',
    description: 'Restores the national Army faster during peace, then unlocks multi-front Theater Mesh.',
    perRank: '+1.25% peacetime Army recovery per effective rank. Shared ceiling: +75%.',
    prerequisites: [{ talentId: 'combat-recovery', rank: 3 }], outsideBranchPoints: 4,
    milestones: [
      { rank: 5, label: 'Theater Mesh', description: '+2.32% peacetime Army recovery · unlock: +20% shared Army buff pool per extra front, capped at 140%, then divided.' },
      { rank: 10, label: 'Recovery II', description: '+8.11% peacetime Army recovery.' },
      { rank: 15, label: 'Recovery III', description: '+22.50% peacetime Army recovery.' },
    ],
    synergy: 'Unlocks Theater Mesh at Rank 5.', coreRank: COMMANDER_TALENT_CORE_RANK,
  },
] as const;

const EMPTY_UPGRADES: Readonly<CountryUpgradeLevelsV1> = Object.freeze({
  mobilization: 0,
  logistics: 0,
  research: 0,
  economy: 0,
  trait: 0,
});

const EMPTY_MASTERY: Readonly<CountryMasteryV1> = Object.freeze({
  xp: 0,
  level: 1,
  campaigns: 0,
  victories: 0,
  bestSurvivalWave: 0,
  allocations: Object.freeze({
    force: 0,
    firepower: 0,
    defense: 0,
    mobilization: 0,
    'land-logistics': 0,
    expeditionary: 0,
    'military-industry': 0,
    'field-medicine': 0,
  }),
});

const EMPTY_COMMANDER_TALENTS: Readonly<Record<CommanderTalentId, number>> = Object.freeze(
  Object.fromEntries(COMMANDER_TALENT_IDS_V1.map((id) => [id, 0])) as Record<CommanderTalentId, number>,
);

const UPGRADE_TRACK_COST_FACTOR: Readonly<Record<CountryUpgradeTrack, number>> = {
  mobilization: 1,
  logistics: 1.08,
  research: 1.12,
  economy: 1.04,
  trait: 1.22,
};

const UPGRADE_MASTERY_REQUIREMENTS: Readonly<Record<CountryUpgradeTrack, readonly number[]>> = {
  mobilization: [2, 8, 16, 28, 42],
  logistics: [3, 9, 18, 30, 45],
  research: [4, 11, 21, 33, 47],
  economy: [2, 7, 15, 26, 40],
  trait: [5, 12, 22, 35, 50],
};

const MODE_XP_MULTIPLIER: Readonly<Record<GameModeV2, number>> = {
  'standard-2026': 1,
  // Alternative Universe is an intentionally unbalanced sandbox. It never
  // advances the serious Campaign -> Survival account progression.
  'random-world': 0,
  // Survival is the empire stress-test. Its wave component still rewards a
  // strong run with XP without unlocking any additional nations.
  survival: 0.7,
};

const OUTCOME_XP_MULTIPLIER: Readonly<Record<CampaignOutcomeV1, number>> = {
  // End Campaign, defeat and total victory all settle the exact progress
  // earned in the run. Players never need to prolong a finished campaign.
  victory: 1,
  defeat: 1,
  surrender: 1,
};

const MASTERY_OUTCOME_MULTIPLIER: Readonly<Record<CampaignOutcomeV1, number>> = {
  victory: 1,
  defeat: 1,
  surrender: 1,
};

const finiteNonNegative = (value: unknown, fallback = 0): number => (
  Number.isFinite(value) ? Math.max(0, Number(value)) : fallback
);

const integerInRange = (value: unknown, minimum: number, maximum: number): number => (
  Math.max(minimum, Math.min(maximum, Math.floor(finiteNonNegative(value))))
);

export function emptyCountryUpgradesV1(): CountryUpgradeLevelsV1 {
  return { ...EMPTY_UPGRADES };
}

export function emptyCountryMasteryV1(): CountryMasteryV1 {
  return { ...EMPTY_MASTERY, allocations: { ...EMPTY_MASTERY.allocations } };
}

export function emptyCommanderTalentsV1(): Record<CommanderTalentId, number> {
  return { ...EMPTY_COMMANDER_TALENTS };
}

const MAX_SAFE_PROGRESSION_XP_V1 = Number.MAX_SAFE_INTEGER - 1;
const COMMANDER_XP_CORE_CURVE_END_V1 = 100;

/**
 * Early APEX levels are intentionally quick: the smallest reward-eligible run
 * reaches level two. The cubic term then makes every later choice more earned
 * without taking an upgrade away from ordinary existing profiles.
 */
const coreCommanderXpForLevelV1 = (level: number): number => (
  Math.round(10 * Math.pow(level - 1, 2) + 0.22 * Math.pow(level - 1, 3))
);

/**
 * Cumulative account XP needed for an APEX level. The first levels provide a
 * choice after the first real timeline; the late repeatable curve grows
 * quadratically on top of its linear/logarithmic cost and has no end level.
 */
export function commanderXpForLevelV1(level: number): number {
  const safeLevel = Math.max(1, Math.min(
    Number.MAX_SAFE_INTEGER,
    Math.floor(finiteNonNegative(level, 1)),
  ));
  if (safeLevel <= COMMANDER_XP_CORE_CURVE_END_V1) {
    return coreCommanderXpForLevelV1(safeLevel);
  }
  const postCoreLevels = safeLevel - COMMANDER_XP_CORE_CURVE_END_V1;
  const coreXp = coreCommanderXpForLevelV1(COMMANDER_XP_CORE_CURVE_END_V1);
  const postCoreXp = postCoreLevels * 6_000
    + 240 * postCoreLevels * Math.log2(postCoreLevels + 1)
    + 0.75 * Math.pow(postCoreLevels, 2);
  const total = coreXp + postCoreXp;
  return total >= Number.MAX_SAFE_INTEGER
    ? Number.MAX_SAFE_INTEGER : Math.round(total);
}

export function commanderLevelFromXpV1(xp: number): number {
  const safeXp = Math.min(MAX_SAFE_PROGRESSION_XP_V1, Math.floor(finiteNonNegative(xp)));
  let low = 1;
  let high = 2;
  while (commanderXpForLevelV1(high) <= safeXp && high < Number.MAX_SAFE_INTEGER / 2) {
    high *= 2;
  }
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (commanderXpForLevelV1(middle) <= safeXp) low = middle;
    else high = middle - 1;
  }
  return low;
}

const COMMANDER_TALENT_CURVE_V1: Readonly<{
  coreTotal: number;
  coreBase: number;
  endlessScale: number;
  endlessDivisor: number;
}> = Object.freeze({
  // Rank 15 is worth 18 old linear ranks. The exponential core starts well
  // below the former +1/rank pace, then overtakes it only near the end.
  coreTotal: 18,
  coreBase: 1.20,
  endlessScale: 6,
  endlessDivisor: 6,
});

/**
 * One deterministic progression curve for every APEX talent. Ranks 1-15 use
 * normalized exponential growth; repeatable ranks use a continuous logarithmic
 * tail, so progression never ends but each post-core point is safely smaller.
 * Every talent consumes this military-only curve.
 */
export function commanderTalentCurveV1(
  rank: number,
): number {
  const safeRank = Math.max(0, Math.min(
    Number.MAX_SAFE_INTEGER,
    Math.floor(finiteNonNegative(rank)),
  ));
  if (safeRank === 0) return 0;
  const settings = COMMANDER_TALENT_CURVE_V1;
  if (safeRank <= COMMANDER_TALENT_CORE_RANK) {
    const numerator = Math.pow(settings.coreBase, safeRank) - 1;
    const denominator = Math.pow(settings.coreBase, COMMANDER_TALENT_CORE_RANK) - 1;
    return settings.coreTotal * numerator / denominator;
  }
  return settings.coreTotal + settings.endlessScale * Math.log1p(
    (safeRank - COMMANDER_TALENT_CORE_RANK) / settings.endlessDivisor,
  );
}

/** Effective general-stat rank retained as the public compatibility helper. */
export function commanderTalentEffectiveRankV1(rank: number): number {
  return commanderTalentCurveV1(rank);
}

/** Relative value of the next repeatable rank versus one authored core rank. */
export function commanderTalentNextRankEfficiencyV1(rank: number): number {
  const safeRank = Math.max(0, Math.floor(finiteNonNegative(rank)));
  return commanderTalentEffectiveRankV1(safeRank + 1)
    - commanderTalentEffectiveRankV1(safeRank);
}

const commanderLevelEffectiveGrowthV1 = (level: number): number => {
  const growth = Math.max(0, Math.floor(finiteNonNegative(level, 1)) - 1);
  if (growth <= 99) return growth;
  return 99 + 24 * Math.log1p((growth - 99) / 24);
};

const COMMANDER_SHIELD_CORE_LEVEL_V1 = 50;
const COMMANDER_SHIELD_CORE_MULTIPLIER_V1 = 12;
const COMMANDER_SHIELD_TAIL_LIMIT_MULTIPLIER_V1 = 120;
const COMMANDER_PULSE_CORE_MULTIPLIER_V1 = 18;
const COMMANDER_PULSE_TAIL_LIMIT_MULTIPLIER_V1 = 180;

function commanderLevelConvexMultiplierV1(
  level: number,
  coreMultiplier: number,
  tailLimitMultiplier: number,
): number {
  const safeLevel = Math.max(1, Math.min(
    Number.MAX_SAFE_INTEGER,
    Math.floor(finiteNonNegative(level, 1)),
  ));
  if (safeLevel <= COMMANDER_SHIELD_CORE_LEVEL_V1) {
    const progress = (safeLevel - 1) / (COMMANDER_SHIELD_CORE_LEVEL_V1 - 1);
    return Math.exp(Math.log(coreMultiplier) * progress * progress);
  }
  const softTail = Math.log1p(
    (safeLevel - COMMANDER_SHIELD_CORE_LEVEL_V1) / COMMANDER_SHIELD_CORE_LEVEL_V1,
  );
  return coreMultiplier
    + (tailLimitMultiplier - coreMultiplier) * softTail / (12 + softTail);
}

/**
 * Account progression, never the selected nation, expands the APEX shield.
 * Levels 2-50 follow a normalized convex exponential: the first upgrades are
 * deliberately small for Greenland, while a veteran level-50 APEX reaches a
 * useful 12x base pool beside a France-scale Army. Beyond the authored core an
 * asymptotic logarithmic tail remains monotonic without risking runaway saves.
 */
export function commanderLevelMaxIntegrityBonusV1(level: number): number {
  return roundForceValueV1(commanderLevelConvexMultiplierV1(
    level,
    COMMANDER_SHIELD_CORE_MULTIPLIER_V1,
    COMMANDER_SHIELD_TAIL_LIMIT_MULTIPLIER_V1,
  ) - 1);
}

/** Exact Max Energy used by menu previews and campaign initialization. */
export function commanderMaxIntegrityV1(
  level: number,
  talents: Readonly<Partial<Record<CommanderTalentId, number>>>,
): number {
  const levelMultiplier = 1 + commanderLevelMaxIntegrityBonusV1(level);
  const talentMultiplier = 1 + resolveCommanderTalentEffectsV1(talents).maxIntegrityBonus;
  return roundForceValueV1(
    BASE_COMMANDER_FORCE_V1.maxIntegrity * levelMultiplier * talentMultiplier,
  );
}

/** Exact bounded battle pulse; it never creates manpower or holds territory. */
export function commanderPulseAttackV1(
  level: number,
  talents: Readonly<Partial<Record<CommanderTalentId, number>>>,
): number {
  const levelMultiplier = commanderLevelConvexMultiplierV1(
    level,
    COMMANDER_PULSE_CORE_MULTIPLIER_V1,
    COMMANDER_PULSE_TAIL_LIMIT_MULTIPLIER_V1,
  );
  const talentMultiplier = 1 + resolveCommanderTalentEffectsV1(talents).pulseAttackBonus;
  return roundForceValueV1(BASE_COMMANDER_FORCE_V1.pulseAttack * levelMultiplier * talentMultiplier);
}

export function commanderTalentPointsSpentV1(profile: CommanderProfileV1): number {
  return COMMANDER_TALENT_IDS_V1.reduce((sum, id) => sum + (profile.commanderTalents[id] ?? 0), 0);
}

/** Level one starts with one point; every later level grants exactly one more. */
export function commanderTalentPointsAvailableV1(profile: CommanderProfileV1): number {
  return Math.max(0, profile.commanderLevel - commanderTalentPointsSpentV1(profile));
}

/**
 * Minimum account level for buying a target rank in any one talent. This keeps
 * the convex core meaningful without making a one-node rush the only sensible
 * build; already-earned legacy ranks remain loadable and are never removed.
 */
export function commanderTalentRankLevelRequirementV1(targetRank: number): number {
  const rank = Math.max(1, Math.min(
    Number.MAX_SAFE_INTEGER,
    Math.floor(finiteNonNegative(targetRank, 1)),
  ));
  if (rank <= 3) return rank;
  if (rank <= 5) return 3 + 2 * (rank - 3);
  if (rank <= 10) return 7 + 4 * (rank - 5);
  if (rank <= 15) return 27 + 8 * (rank - 10);
  const extra = rank - 15;
  return Math.min(
    Number.MAX_SAFE_INTEGER,
    Math.floor(67 + 12 * extra + extra * extra / 8),
  );
}

/** Exact branch, level and point gate used by both allocation and the tree UI. */
export function commanderTalentAllocationQuoteV1(
  profile: CommanderProfileV1,
  talentId: CommanderTalentId,
): CommanderTalentAllocationQuoteV1 {
  const definition = COMMANDER_TALENTS_V1.find((entry) => entry.id === talentId);
  const talents = normalizeCommanderTalents(profile.commanderTalents, profile.commanderLevel);
  const targetRank = (talents[talentId] ?? 0) + 1;
  const requiredLevel = commanderTalentRankLevelRequirementV1(targetRank);
  if (!definition) {
    return {
      talentId, targetRank, requiredLevel, available: false, reason: 'Unknown APEX shield node.',
    };
  }
  // Existing accounts may already own ranks under the legacy flat tree. Those
  // ranks stay investable; prerequisites gate only entry into a new deep node.
  const missing = targetRank === 1
    ? definition.prerequisites.find((prerequisite) => (
      (talents[prerequisite.talentId] ?? 0) < prerequisite.rank
    ))
    : undefined;
  if (missing) {
    const prerequisite = COMMANDER_TALENTS_V1.find((entry) => entry.id === missing.talentId)!;
    const unmetPrerequisite = {
      talentId: missing.talentId,
      rank: missing.rank,
      label: prerequisite.label,
    } as const;
    return {
      talentId,
      targetRank,
      requiredLevel,
      available: false,
      unmetPrerequisite,
      reason: `Requires ${prerequisite.label} Rank ${missing.rank} before ${definition.label}.`,
    };
  }
  const outsideBranchPoints = COMMANDER_TALENT_IDS_V1.reduce((total, id) => {
    const candidate = COMMANDER_TALENTS_V1.find((entry) => entry.id === id);
    return total + (candidate?.branch !== definition.branch ? talents[id] ?? 0 : 0);
  }, 0);
  if (targetRank === 1 && outsideBranchPoints < definition.outsideBranchPoints) {
    return {
      talentId,
      targetRank,
      requiredLevel,
      available: false,
      unmetBreadth: {
        current: outsideBranchPoints,
        required: definition.outsideBranchPoints,
        scope: 'outside-branch',
      },
      reason: `Invest ${definition.outsideBranchPoints} points outside ${definition.branch.replace('-', ' ')} first (${outsideBranchPoints}/${definition.outsideBranchPoints}).`,
    };
  }
  const otherNodePoints = COMMANDER_TALENT_IDS_V1.reduce((total, id) => (
    total + (id === talentId ? 0 : talents[id] ?? 0)
  ), 0);
  const otherNodePointsRequired = targetRank <= 3 ? 0
    : targetRank <= 5 ? targetRank - 3
      : Math.min(16, 2 + Math.ceil((targetRank - 5) / 3));
  if (otherNodePoints < otherNodePointsRequired) {
    return {
      talentId,
      targetRank,
      requiredLevel,
      available: false,
      unmetBreadth: {
        current: otherNodePoints,
        required: otherNodePointsRequired,
        scope: 'other-nodes',
      },
      reason: `Invest ${otherNodePointsRequired} total points in other nodes first (${otherNodePoints}/${otherNodePointsRequired}).`,
    };
  }
  if (profile.commanderLevel < requiredLevel) {
    return {
      talentId,
      targetRank,
      requiredLevel,
      available: false,
      reason: `Rank ${targetRank} unlocks at APEX level ${requiredLevel}.`,
    };
  }
  if (commanderTalentPointsAvailableV1(profile) < 1) {
    return {
      talentId,
      targetRank,
      requiredLevel,
      available: false,
      reason: 'Earn another APEX level for a shield point.',
    };
  }
  return { talentId, targetRank, requiredLevel, available: true };
}

/** Cumulative XP required to reach a level. Level one always starts at zero XP. */
export function countryMasteryXpForLevelV1(level: number): number {
  const bounded = integerInRange(level, 1, MAX_COUNTRY_MASTERY_LEVEL);
  const earnedLevels = bounded - 1;
  return Math.round(12 * Math.pow(earnedLevels, 2) + 0.69 * Math.pow(earnedLevels, 3));
}

export function countryMasteryLevelFromXpV1(xp: number): number {
  const safeXp = Math.floor(finiteNonNegative(xp));
  let low = 1;
  let high = MAX_COUNTRY_MASTERY_LEVEL;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (countryMasteryXpForLevelV1(middle) <= safeXp) low = middle;
    else high = middle - 1;
  }
  return low;
}

/**
 * Strong national platforms take longer to master. Rank one is the strongest
 * country; the weakest country keeps the ordinary 1x XP curve while the very
 * strongest approaches a twelve-run-equivalent curve. The multiplier is
 * applied only to country XP gain, never to global APEX XP or Credits.
 */
export function countryMasteryXpDifficultyMultiplierV1(
  strengthRank: number,
  countryCount: number,
): number {
  const count = Math.max(1, Math.floor(finiteNonNegative(countryCount, 1)));
  const rank = integerInRange(strengthRank, 1, count);
  if (count <= 1) return 1;
  const strongestShare = (count - rank) / (count - 1);
  return Math.round((1 + 11 * strongestShare ** 2) * 1_000) / 1_000;
}

/** Level 1 is neutral; experience now strengthens only the country's opening army. */
export function countryMasteryOpeningBonusV1(level: number): number {
  const bounded = integerInRange(level, 1, MAX_COUNTRY_MASTERY_LEVEL);
  return (bounded - 1) * COUNTRY_MASTERY_OPENING_BONUS_PER_LEVEL;
}

/** One military mastery point is earned for every country level above one. */
export function countryMasteryPointsEarnedV1(level: number): number {
  return integerInRange(level, 1, MAX_COUNTRY_MASTERY_LEVEL) - 1;
}

export function normalizeCountryMasteryAllocationsV1(
  input: unknown,
  level: number,
): CountryMasteryAllocationsV1 {
  const source = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Partial<CountryMasteryAllocationsV1> : {};
  let remaining = countryMasteryPointsEarnedV1(level);
  const normalized = {
    force: 0,
    firepower: 0,
    defense: 0,
    mobilization: 0,
    'land-logistics': 0,
    expeditionary: 0,
    'military-industry': 0,
    'field-medicine': 0,
  } satisfies CountryMasteryAllocationsV1;
  for (const track of COUNTRY_MASTERY_TRACK_IDS_V1) {
    const rank = Math.min(remaining, Math.floor(finiteNonNegative(source[track])));
    normalized[track] = rank;
    remaining -= rank;
  }
  return normalized;
}

export function countryMasteryPointsSpentV1(
  mastery: Pick<CountryMasteryV1, 'allocations'>,
): number {
  return COUNTRY_MASTERY_TRACK_IDS_V1.reduce(
    (sum, track) => sum + Math.floor(finiteNonNegative(mastery.allocations?.[track])),
    0,
  );
}

export function countryMasteryPointsAvailableV1(
  mastery: Pick<CountryMasteryV1, 'level' | 'allocations'>,
): number {
  return Math.max(
    0,
    countryMasteryPointsEarnedV1(mastery.level) - countryMasteryPointsSpentV1(mastery),
  );
}

const roundMasteryMultiplierV1 = (value: number): number => (
  Math.round(value * 1_000_000_000) / 1_000_000_000
);

/** Pure balance contract used by profile resolution, storage and runtime wiring. */
export function resolveCountryMasteryMilitaryEffectsV1(
  level: number,
  allocations: Readonly<Partial<CountryMasteryAllocationsV1>>,
): ResolvedCountryMasteryMilitaryEffectsV1 {
  const normalized = normalizeCountryMasteryAllocationsV1(allocations, level);
  return {
    openingArmyMultiplier: roundMasteryMultiplierV1(
      1 + countryMasteryOpeningBonusV1(level),
    ),
    armyCapacityMultiplier: roundMasteryMultiplierV1(
      1 + normalized.force * COUNTRY_MASTERY_FORCE_CAPACITY_PER_POINT_V1,
    ),
    attackMultiplier: roundMasteryMultiplierV1(
      1 + normalized.firepower * COUNTRY_MASTERY_FIREPOWER_PER_POINT_V1,
    ),
    defenseMultiplier: roundMasteryMultiplierV1(
      1 + normalized.defense * COUNTRY_MASTERY_DEFENSE_PER_POINT_V1,
    ),
    recruitmentMultiplier: roundMasteryMultiplierV1(
      1 + normalized.mobilization * COUNTRY_MASTERY_RECRUITMENT_PER_POINT_V1,
    ),
    reserveTrainingMultiplier: roundMasteryMultiplierV1(
      1 + normalized.mobilization * COUNTRY_MASTERY_RESERVE_TRAINING_PER_POINT_V1,
    ),
    landSupplyMultiplier: roundMasteryMultiplierV1(
      1 + normalized['land-logistics'] * COUNTRY_MASTERY_LAND_SUPPLY_PER_POINT_V1,
    ),
    landTransferThroughputMultiplier: roundMasteryMultiplierV1(
      1 + normalized['land-logistics'] * COUNTRY_MASTERY_LAND_TRANSFER_PER_POINT_V1,
    ),
    navalSupplyMultiplier: roundMasteryMultiplierV1(
      1 + normalized.expeditionary * COUNTRY_MASTERY_NAVAL_SUPPLY_PER_POINT_V1,
    ),
    navalTransferThroughputMultiplier: roundMasteryMultiplierV1(
      1 + normalized.expeditionary * COUNTRY_MASTERY_NAVAL_TRANSFER_PER_POINT_V1,
    ),
    navalTransferCostMultiplier: roundMasteryMultiplierV1(
      COUNTRY_MASTERY_NAVAL_COST_FACTOR_PER_POINT_V1 ** normalized.expeditionary,
    ),
    recruitmentCostMultiplier: roundMasteryMultiplierV1(
      COUNTRY_MASTERY_RECRUITMENT_COST_FACTOR_PER_POINT_V1
        ** normalized['military-industry'],
    ),
    standingOperatingCostMultiplier: roundMasteryMultiplierV1(
      COUNTRY_MASTERY_OPERATING_COST_FACTOR_PER_POINT_V1
        ** normalized['military-industry'],
    ),
    casualtyMultiplier: roundMasteryMultiplierV1(
      COUNTRY_MASTERY_CASUALTY_FACTOR_PER_POINT_V1 ** normalized['field-medicine'],
    ),
  };
}

export function countryUpgradeRequiredLevelV1(
  track: CountryUpgradeTrack,
  upgradeLevel: number,
): number {
  const bounded = integerInRange(upgradeLevel, 1, MAX_COUNTRY_UPGRADE_LEVEL);
  return UPGRADE_MASTERY_REQUIREMENTS[track][bounded - 1]!;
}

export function createCommanderProfileV1(
  now = Date.now(),
  commanderId = `commander-${Math.max(1, Math.floor(now)).toString(36)}`,
): CommanderProfileV1 {
  return {
    schemaVersion: COMMANDER_PROFILE_SCHEMA_VERSION,
    revision: 1,
    commanderId,
    displayName: 'APEX',
    empireName: 'Frontier Alliance',
    empireFlag: { kind: 'country', countryId: STARTER_COUNTRY_ID },
    commandCredits: STARTING_COMMAND_CREDITS_V1,
    commanderXp: 0,
    commanderLevel: 1,
    commanderTalents: emptyCommanderTalentsV1(),
    activeDoctrine: null,
    unlockedCountryIds: [],
    defeatedCountryIds: [],
    campaignAdaptation: {},
    pendingCountryUnlockNotificationIds: [],
    countryUpgrades: {},
    countryMastery: {},
    campaignTutorialCompleted: false,
    campaignProgressionTutorialState: 'locked',
    completedCampaigns: 0,
    victories: 0,
    defeats: 0,
    surrenders: 0,
    lifetimeCreditsEarned: 0,
    claimedCampaignIds: [],
    transactions: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Materialises the canonical free starter once the authoritative country
 * catalog is available. Existing accounts keep every nation they already own;
 * this only ensures Greenland is present for new and migrated profiles.
 */
export function grantStarterCountriesV1(
  profile: CommanderProfileV1,
  starterCountryIds: readonly string[],
  now = Date.now(),
): ProgressionActionResultV1 {
  const catalogCountryIds = normalizeCountryIds(starterCountryIds);
  const starters = catalogCountryIds.includes(STARTER_COUNTRY_ID)
    ? [STARTER_COUNTRY_ID]
    : [];
  if (starters.length === 0) {
    return { accepted: false, profile, reason: 'Greenland is unavailable in the country catalog.' };
  }
  const owned = new Set(profile.unlockedCountryIds);
  const missing = starters.filter((countryId) => !owned.has(countryId));
  if (missing.length === 0) {
    return { accepted: false, profile, reason: 'The starter nation is already owned.' };
  }
  const unlockedCountryIds = [...new Set([...profile.unlockedCountryIds, ...missing])]
    .sort((left, right) => left.localeCompare(right));
  return {
    accepted: true,
    profile: normalizeCommanderProfileV1({
      ...profile,
      revision: nextRevision(profile),
      unlockedCountryIds,
      countryUpgrades: Object.fromEntries(unlockedCountryIds.map((countryId) => [
        countryId,
        profile.countryUpgrades[countryId] ?? emptyCountryUpgradesV1(),
      ])),
      countryMastery: Object.fromEntries(unlockedCountryIds.map((countryId) => [
        countryId,
        profile.countryMastery[countryId] ?? emptyCountryMasteryV1(),
      ])),
      updatedAt: now,
    }, now),
  };
}

function normalizeUpgradeLevels(input: unknown): CountryUpgradeLevelsV1 {
  const source = input && typeof input === 'object' ? input as Partial<CountryUpgradeLevelsV1> : {};
  return {
    mobilization: integerInRange(source.mobilization, 0, MAX_COUNTRY_UPGRADE_LEVEL),
    logistics: integerInRange(source.logistics, 0, MAX_COUNTRY_UPGRADE_LEVEL),
    research: integerInRange(source.research, 0, MAX_COUNTRY_UPGRADE_LEVEL),
    economy: integerInRange(source.economy, 0, MAX_COUNTRY_UPGRADE_LEVEL),
    trait: integerInRange(source.trait, 0, MAX_COUNTRY_UPGRADE_LEVEL),
  };
}

function normalizeMastery(input: unknown): CountryMasteryV1 {
  const source = input && typeof input === 'object' ? input as Partial<CountryMasteryV1> : {};
  const xp = Math.min(
    MAX_SAFE_PROGRESSION_XP_V1,
    Math.floor(finiteNonNegative(source.xp)),
  );
  const level = countryMasteryLevelFromXpV1(xp);
  return {
    xp,
    level,
    campaigns: Math.floor(finiteNonNegative(source.campaigns)),
    victories: Math.floor(finiteNonNegative(source.victories)),
    bestSurvivalWave: Math.floor(finiteNonNegative(source.bestSurvivalWave)),
    allocations: normalizeCountryMasteryAllocationsV1(source.allocations, level),
  };
}

function normalizeCommanderTalents(
  input: unknown,
  commanderLevel: number,
): Record<CommanderTalentId, number> {
  const source = input && typeof input === 'object'
    ? input as Partial<Record<CommanderTalentId, number>> : {};
  let remainingPoints = Math.max(1, commanderLevel);
  const talents = emptyCommanderTalentsV1();
  for (const id of COMMANDER_TALENT_IDS_V1) {
    const rank = Math.min(
      Math.floor(finiteNonNegative(source[id])),
      remainingPoints,
    );
    talents[id] = rank;
    remainingPoints -= rank;
  }
  return talents;
}

function isCommanderDoctrineV1(value: unknown): value is CommanderDoctrineV1 {
  return value === 'vanguard' || value === 'bastion'
    || value === 'rapid-response' || value === 'force-multiplier';
}

function isUpgradeTrack(value: unknown): value is CountryUpgradeTrack {
  return value === 'mobilization' || value === 'logistics' || value === 'research'
    || value === 'economy' || value === 'trait';
}

function normalizeTransactions(input: unknown): CommanderTransactionV1[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const transactions: CommanderTransactionV1[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const source = item as Partial<CommanderTransactionV1>;
    if (typeof source.id !== 'string' || source.id.length === 0 || seen.has(source.id)) continue;
    if (source.kind !== 'starter-grant' && source.kind !== 'country-unlock'
      && source.kind !== 'country-upgrade' && source.kind !== 'commander-talent'
      && source.kind !== 'campaign-reward' && source.kind !== 'survival-deployment'
      && source.kind !== 'survival-deployment-refund') continue;
    seen.add(source.id);
    transactions.push({
      id: source.id,
      revision: Math.max(1, Math.floor(finiteNonNegative(source.revision, 1))),
      kind: source.kind,
      amount: Number.isFinite(source.amount) ? Math.round(Number(source.amount)) : 0,
      balanceAfter: Math.floor(finiteNonNegative(source.balanceAfter)),
      createdAt: finiteNonNegative(source.createdAt),
      ...(typeof source.countryId === 'string' ? { countryId: source.countryId } : {}),
      ...(isUpgradeTrack(source.track) ? { track: source.track } : {}),
      ...(COMMANDER_TALENT_IDS_V1.includes(source.talentId as CommanderTalentId)
        ? { talentId: source.talentId as CommanderTalentId } : {}),
      ...(typeof source.campaignId === 'string' ? { campaignId: source.campaignId } : {}),
      ...(typeof source.deploymentId === 'string' ? { deploymentId: source.deploymentId } : {}),
    });
  }
  return transactions.sort((a, b) => a.revision - b.revision || a.createdAt - b.createdAt);
}

function normalizeCountryIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input
    .filter((id): id is string => typeof id === 'string')
    .map((id) => id.trim())
    .filter((id) => id.length > 0))]
    .sort((a, b) => a.localeCompare(b));
}

function normalizeCampaignAdaptation(_input: unknown): Record<string, number> {
  // Rival scaling was retired. Clearing the old key also neutralizes existing
  // accounts without touching mastery, unlocks or campaign saves.
  return {};
}

export function normalizeCommanderProfileV1(input: unknown, now = Date.now()): CommanderProfileV1 {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return createCommanderProfileV1(now);
  }
  const source = input as Partial<CommanderProfileV1>;
  if (source.schemaVersion !== COMMANDER_PROFILE_SCHEMA_VERSION) {
    return createCommanderProfileV1(now);
  }
  const defeatedCountryIds = normalizeCountryIds(source.defeatedCountryIds);
  // A legacy Signal Purge entry necessarily means this nation had already
  // been defeated in Campaign. The creditless rules therefore migrate that
  // earned access straight into the permanent roster without deleting any
  // nation the account already owned.
  const unlockedCountryIds = [...new Set([
    ...(Array.isArray(source.unlockedCountryIds)
      ? source.unlockedCountryIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : []),
    ...defeatedCountryIds,
  ])].sort();
  // Fullscreen unlock notices were retired. Old queued ids are safely
  // consumed during migration so loading a profile can never pause gameplay.
  const pendingCountryUnlockNotificationIds: string[] = [];
  const countryUpgrades = Object.fromEntries(unlockedCountryIds.map((countryId) => [
    countryId,
    normalizeUpgradeLevels(source.countryUpgrades?.[countryId]),
  ]));
  const countryMastery = Object.fromEntries(unlockedCountryIds.map((countryId) => [
    countryId,
    normalizeMastery(source.countryMastery?.[countryId]),
  ]));
  const transactions = normalizeTransactions(source.transactions);
  const commanderXp = Math.min(
    MAX_SAFE_PROGRESSION_XP_V1,
    Math.floor(finiteNonNegative(source.commanderXp)),
  );
  const commanderLevel = commanderLevelFromXpV1(commanderXp);
  const commanderTalents = normalizeCommanderTalents(
    source.commanderTalents,
    commanderLevel,
  );
  const activeDoctrine = isCommanderDoctrineV1(source.activeDoctrine)
    && commanderDoctrineRequirementMetV1(commanderTalents, source.activeDoctrine)
    ? source.activeDoctrine : null;
  const normalizedDisplayName = typeof source.displayName === 'string'
    ? source.displayName.trim().slice(0, 28)
    : '';
  const completedCampaigns = Math.floor(finiteNonNegative(source.completedCampaigns));
  const empireFlagSource = source.empireFlag;
  const empireFlag: EmpireFlagIdentityV1 = empireFlagSource
    && empireFlagSource.kind === 'country'
    && typeof empireFlagSource.countryId === 'string'
    && /^[a-z0-9-]{2,16}$/i.test(empireFlagSource.countryId.trim())
    ? { kind: 'country', countryId: empireFlagSource.countryId.trim().toLowerCase() }
    : { kind: 'country', countryId: STARTER_COUNTRY_ID };
  // V1 profiles predate the explicit tutorial ledger. Only durable progression
  // evidence migrates them to complete; a merely old/newly-created profile does not.
  const legacyCampaignExperience = completedCampaigns > 0
    || transactions.some((entry) => entry.kind === 'campaign-reward')
    || (Array.isArray(source.claimedCampaignIds) && source.claimedCampaignIds.some((id) => (
      typeof id === 'string' && id.length > 0
    )))
    || Object.values(countryMastery).some((mastery) => mastery.campaigns > 0)
    || Math.floor(finiteNonNegative(source.victories)) > 0
    || Math.floor(finiteNonNegative(source.defeats)) > 0
    || Math.floor(finiteNonNegative(source.surrenders)) > 0;
  const campaignProgressionTutorialState: CampaignProgressionTutorialStateV1 = (
    source.campaignProgressionTutorialState === 'locked'
      || source.campaignProgressionTutorialState === 'ready'
      || source.campaignProgressionTutorialState === 'seen'
  ) ? source.campaignProgressionTutorialState
    // Existing experienced accounts have already passed the beginner moment;
    // do not surprise them with a newly introduced first-run modal on migration.
    : legacyCampaignExperience ? 'seen' : 'locked';
  const sourceCreditBalance = Math.min(
    Number.MAX_SAFE_INTEGER,
    Math.floor(finiteNonNegative(source.commandCredits)),
  );
  const sourceLifetimeCredits = Math.min(
    Number.MAX_SAFE_INTEGER,
    Math.floor(finiteNonNegative(source.lifetimeCreditsEarned)),
  );
  // The retired build wrote inert credit values without a real debit/earning
  // ledger. Ignore those stale numbers and migrate once to the new opening
  // balance. Every live balance change creates a non-zero ledger entry, so a
  // legitimately spent-to-zero account can never be refilled by normalization.
  const hasLiveCreditLedger = transactions.some((entry) => (
    entry.kind === 'survival-deployment'
      || entry.kind === 'survival-deployment-refund'
      || (entry.kind === 'campaign-reward' && entry.amount > 0)
  ));
  return {
    schemaVersion: COMMANDER_PROFILE_SCHEMA_VERSION,
    revision: Math.max(1, Math.floor(finiteNonNegative(source.revision, 1))),
    commanderId: typeof source.commanderId === 'string' && source.commanderId.length > 0
      ? source.commanderId : createCommanderProfileV1(now).commanderId,
    displayName: normalizedDisplayName === 'Commander'
      ? 'APEX' : normalizedDisplayName || 'APEX',
    empireName: typeof source.empireName === 'string'
      && /^[\p{L}\p{N}][\p{L}\p{N} .,'’&-]{2,35}$/u.test(
        source.empireName.trim().replace(/\s+/g, ' '),
      )
      ? source.empireName.trim().replace(/\s+/g, ' ')
      : 'Frontier Alliance',
    empireFlag,
    commandCredits: hasLiveCreditLedger
      ? sourceCreditBalance : STARTING_COMMAND_CREDITS_V1,
    commanderXp,
    commanderLevel,
    commanderTalents,
    activeDoctrine,
    unlockedCountryIds,
    defeatedCountryIds,
    campaignAdaptation: normalizeCampaignAdaptation(source.campaignAdaptation),
    pendingCountryUnlockNotificationIds,
    countryUpgrades,
    countryMastery,
    campaignTutorialCompleted: typeof source.campaignTutorialCompleted === 'boolean'
      ? source.campaignTutorialCompleted : legacyCampaignExperience,
    campaignProgressionTutorialState,
    completedCampaigns,
    victories: Math.floor(finiteNonNegative(source.victories)),
    defeats: Math.floor(finiteNonNegative(source.defeats)),
    surrenders: Math.floor(finiteNonNegative(source.surrenders)),
    lifetimeCreditsEarned: hasLiveCreditLedger ? sourceLifetimeCredits : 0,
    // Settlement ids and transactions are permanent ledgers. Never truncate
    // either collection or an old campaign could be rewarded twice.
    claimedCampaignIds: [...new Set(
      Array.isArray(source.claimedCampaignIds)
        ? source.claimedCampaignIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
        : [],
    )],
    transactions,
    createdAt: finiteNonNegative(source.createdAt, now),
    updatedAt: finiteNonNegative(source.updatedAt, now),
  };
}

/** Rank metadata for the nation roster. Unlocking never has a currency price. */
export function countryUnlockQuoteV1(
  countryId: string,
  strengthRank: number,
  countryCount: number,
): CountryUnlockQuoteV1 {
  const count = Math.max(1, Math.floor(countryCount));
  const rank = Math.max(1, Math.min(count, Math.floor(strengthRank)));
  const starterEligible = countryId === STARTER_COUNTRY_ID;
  return {
    countryId,
    strengthRank: rank,
    countryCount: count,
    starterEligible,
  };
}

/** Produces the authoritative deterministic rank catalog used by every mode. */
export function buildCountryUnlockCatalogV1(
  strengths: readonly CountryStrengthV1[],
): ReadonlyMap<string, CountryUnlockQuoteV1> {
  const ranked = [...strengths]
    .sort((a, b) => b.strength - a.strength || a.countryId.localeCompare(b.countryId));
  return new Map(ranked.map((entry, index) => [
    entry.countryId,
    countryUnlockQuoteV1(entry.countryId, index + 1, ranked.length),
  ]));
}

export function countryUpgradeLevelsV1(
  profile: CommanderProfileV1,
  countryId: string,
): CountryUpgradeLevelsV1 {
  return profile.countryUpgrades[countryId] ?? emptyCountryUpgradesV1();
}

export function countryMasteryV1(profile: CommanderProfileV1, countryId: string): CountryMasteryV1 {
  return profile.countryMastery[countryId]
    ? normalizeMastery(profile.countryMastery[countryId])
    : emptyCountryMasteryV1();
}

/**
 * Compatibility helper for older roster code. A nation is ready exactly when
 * it is already owned (or is the canonical free starter).
 */
export function isCountryAvailableToUnlockV1(
  profile: CommanderProfileV1,
  quote: CountryUnlockQuoteV1,
): boolean {
  return quote.starterEligible
    || profile.unlockedCountryIds.includes(quote.countryId);
}

const talentRankV1 = (
  talents: Readonly<Partial<Record<CommanderTalentId, number>>>,
  id: CommanderTalentId,
): number => Math.max(0, Math.min(
  Number.MAX_SAFE_INTEGER,
  Math.floor(finiteNonNegative(talents[id])),
));

const roundForceValueV1 = (value: number): number => Math.round(value * 1_000_000_000) / 1_000_000_000;

/**
 * Resolves the account tree into three APEX-only paths and one Army path.
 * Only `military-command` ids may emit regular national Army effects.
 */
export function resolveCommanderTalentEffectsV1(
  talents: Readonly<Partial<Record<CommanderTalentId, number>>>,
): ResolvedCommanderTalentEffectsV1 {
  const effective = (id: CommanderTalentId): number => commanderTalentEffectiveRankV1(
    talentRankV1(talents, id),
  );
  // Every regular Army scalar originates in the one Empire Warfare branch.
  const armyAttack = effective('mobile-logistics') * 0.0055;
  const armyDefense = effective('combat-recovery') * 0.004;
  const peaceRecovery = effective('theater-network') * 0.0125;

  // The other three branches modify different parts of APEX. No node is a
  // disguised bundle of Max Energy, Recharge and Army power anymore.
  const pulseAttack = effective('science-corps') * 0.02;
  const pulseProjectionRetention = effective('treasury-reserve') * 0.0035;
  const pulseChargeBonusPerStep = effective('elite-vanguard') * 0.005;
  const interceptEfficiency = effective('volunteer-brigade') * 0.005;
  const impactRecovery = effective('civil-defense') * 0.0035;
  const defensivePulse = effective('doctrine-command') * 0.01;
  const maxIntegrity = effective('reserve-cadre') * 0.02;
  const rechargeRate = effective('drill-instructors') * 0.02;
  const rechargeBuffer = effective('frugal-quartermaster') * 0.01;

  return {
    maxIntegrityBonus: roundForceValueV1(Math.min(1.5, maxIntegrity)),
    rechargeBufferBonus: roundForceValueV1(Math.min(0.75, rechargeBuffer)),
    rechargeRateBonus: roundForceValueV1(Math.min(2.5, rechargeRate)),
    armyAttackBonus: roundForceValueV1(Math.min(0.35, armyAttack)),
    pulseAttackBonus: roundForceValueV1(Math.min(2, pulseAttack)),
    pulseProjectionRetention: roundForceValueV1(Math.min(0.35, pulseProjectionRetention)),
    pulseChargeBonusPerStep: roundForceValueV1(Math.min(0.45, pulseChargeBonusPerStep)),
    interceptEfficiencyBonus: roundForceValueV1(Math.min(0.45, interceptEfficiency)),
    impactRecoveryShare: roundForceValueV1(Math.min(0.35, impactRecovery)),
    defensivePulseBonus: roundForceValueV1(Math.min(0.75, defensivePulse)),
    armyDefenseBonus: roundForceValueV1(Math.min(0.35, armyDefense)),
    armyCasualtyReduction: 0,
    armyPeaceRecoveryBonus: roundForceValueV1(Math.min(0.75, peaceRecovery)),
  };
}

/**
 * Resolves purchased nodes to immutable campaign effects. A campaign stores
 * this object at launch, so later profile or balance changes cannot rewrite a run.
 */
export function resolveCountryLoadoutV1(
  profile: CommanderProfileV1,
  countryId: string,
): ResolvedCountryLoadoutV1 {
  const upgrades = countryUpgradeLevelsV1(profile, countryId);
  const talents = normalizeCommanderTalents(profile.commanderTalents, profile.commanderLevel);
  const commanderEffects = resolveCommanderTalentEffectsV1(talents);
  const mastery = countryMasteryV1(profile, countryId);
  const masteryLevel = mastery.level;
  const masteryAllocations = normalizeCountryMasteryAllocationsV1(
    mastery.allocations,
    masteryLevel,
  );
  const masteryPointsEarned = countryMasteryPointsEarnedV1(masteryLevel);
  const masteryPointsSpent = COUNTRY_MASTERY_TRACK_IDS_V1.reduce(
    (sum, track) => sum + masteryAllocations[track],
    0,
  );
  const masteryMilitary = resolveCountryMasteryMilitaryEffectsV1(
    masteryLevel,
    masteryAllocations,
  );
  return {
    catalogVersion: COUNTRY_LOADOUT_CATALOG_VERSION,
    masteryLevel,
    masteryAllocations,
    masteryPointsEarned,
    masteryPointsSpent,
    masteryPointsAvailable: masteryPointsEarned - masteryPointsSpent,
    masteryMilitary,
    upgrades: { ...upgrades },
    openingArmyMultiplier: roundMasteryMultiplierV1(
      (1 + upgrades.mobilization * 0.04) * masteryMilitary.openingArmyMultiplier,
    ),
    openingEconomyMultiplier: roundMasteryMultiplierV1(1 + upgrades.economy * 0.04),
    masteryOpeningArmyMultiplier: masteryMilitary.openingArmyMultiplier,
    masteryOpeningEconomyMultiplier: 1,
    traitScale: 0,
    commanderLevel: profile.commanderLevel,
    commanderTalents: talents,
    activeDoctrine: profile.activeDoctrine,
    // Legacy snapshot keys preserve old saves at the launch boundary. They now
    // carry shield-energy bonuses only; APEX never contributes personnel.
    eliteStarterManpower: 0,
    regularStarterManpower: roundForceValueV1(
      BASE_COMMANDER_FORCE_V1.maxIntegrity * commanderEffects.maxIntegrityBonus,
    ),
    trainedReserveStarterManpower: roundForceValueV1(
      BASE_COMMANDER_FORCE_V1.maxIntegrity * commanderEffects.rechargeBufferBonus,
    ),
    // Retained loadout key for old snapshots; talents never grant money.
    openingTreasuryBonus: 0,
    openingFoodWeeksBonus: 0,
  };
}

/** Freezes every Commander talent into campaign-local force values. */
export function resolveCommanderForceInitializationV1(
  loadout: ResolvedCountryLoadoutV1,
): CommanderForceInitializationV2 {
  const talents = loadout.commanderTalents;
  const effects = resolveCommanderTalentEffectsV1(talents);
  const doctrine = isCommanderDoctrineV1(loadout.activeDoctrine)
    ? loadout.activeDoctrine : null;
  const levelGrowth = commanderLevelEffectiveGrowthV1(loadout.commanderLevel);
  const maxIntegrity = commanderMaxIntegrityV1(loadout.commanderLevel, talents);
  const pulseAttack = commanderPulseAttackV1(loadout.commanderLevel, talents);
  const rechargeBuffer = roundForceValueV1(
    Math.min(
      maxIntegrity,
      BASE_COMMANDER_FORCE_V1.rechargeBuffer
        + BASE_COMMANDER_FORCE_V1.maxIntegrity * effects.rechargeBufferBonus,
    ),
  );
  return {
    shield: {
      integrity: maxIntegrity,
      maxIntegrity,
      rechargeBuffer,
      rechargeMultiplier: 1 + effects.rechargeRateBonus,
      pulseAttack,
      pulseProjectionRetention: effects.pulseProjectionRetention,
      pulseChargeBonusPerStep: effects.pulseChargeBonusPerStep,
      interceptEfficiency: 1 + effects.interceptEfficiencyBonus,
      impactRecoveryShare: effects.impactRecoveryShare,
      defensivePulseMultiplier: 1 + effects.defensivePulseBonus,
    },
    attackMultiplier: Math.min(
      1.50,
      BASE_COMMANDER_FORCE_V1.attackMultiplier + effects.armyAttackBonus,
    ),
    defenseMultiplier: Math.min(
      1.50,
      BASE_COMMANDER_FORCE_V1.defenseMultiplier + effects.armyDefenseBonus,
    ),
    armyCasualtyMultiplier: 1 - effects.armyCasualtyReduction,
    armyPeaceRecoveryMultiplier: 1 + effects.armyPeaceRecoveryBonus,
    treasury: BASE_COMMANDER_FORCE_V1.treasury,
    annualOutput: BASE_COMMANDER_FORCE_V1.annualOutput
      + levelGrowth * COMMANDER_LEVEL_ANNUAL_OUTPUT_GROWTH_V1,
    // Resolve from the stable talent ids at launch; legacy loadout snapshots
    // cannot reintroduce retired civilian/economic talent semantics.
    supplyStock: BASE_COMMANDER_FORCE_V1.energyStock,
    countryTraitScale: loadout.traitScale,
    capabilities: {
      mobileHeadquarters: false,
      fieldHospital: doctrine === 'rapid-response' && talents['frugal-quartermaster'] >= 5,
      rapidResponse: false,
      assaultSpecialist: doctrine === 'vanguard' && talents['elite-vanguard'] >= 5,
      defenseSpecialist: doctrine === 'bastion' && talents['doctrine-command'] >= 5,
      forceMultiplier: doctrine === 'force-multiplier' && talents['theater-network'] >= 5,
      emergencyExtractionCharges: 0,
    },
    empireSupport: {
      recruitmentMultiplier: Math.min(
        1.50,
        1 + APEX_EMPIRE_RECRUITMENT_BASE_BONUS_V2,
      ),
      reserveTrainingMultiplier: Math.min(
        1.75,
        1 + APEX_EMPIRE_RESERVE_TRAINING_BASE_BONUS_V2
          + 0,
      ),
      armyCasualtyMultiplier: 1 - effects.armyCasualtyReduction,
      armyPeaceRecoveryMultiplier: 1 + effects.armyPeaceRecoveryBonus,
      // Retired protocol/save fields stay neutral until the next schema break.
      annualFoodOutput: 0,
      foodProductionMultiplier: 1,
      foodStorageMultiplier: 1,
      foodImportCostMultiplier: 1,
    },
  };
}

function nextRevision(profile: CommanderProfileV1): number {
  return Math.max(1, profile.revision) + 1;
}

/** Idempotent durable account marker for the one-time guided Campaign opening. */
export function recordCampaignTutorialExperiencedV1(
  profile: CommanderProfileV1,
  now = Date.now(),
): ProgressionActionResultV1 {
  if (profile.campaignTutorialCompleted) {
    return { accepted: false, profile, reason: 'Campaign tutorial was already completed.' };
  }
  return {
    accepted: true,
    profile: normalizeCommanderProfileV1({
      ...profile,
      revision: nextRevision(profile),
      campaignTutorialCompleted: true,
      updatedAt: now,
    }, now),
  };
}

/**
 * Arms the short meta-progression guide after the account's first completed
 * Campaign. Survival and Alternative Universe outcomes can never open it.
 */
export function queueCampaignProgressionTutorialV1(
  profile: CommanderProfileV1,
  mode: GameModeV2,
  now = Date.now(),
): ProgressionActionResultV1 {
  if (mode !== 'standard-2026') {
    return { accepted: false, profile, reason: 'Only a completed Campaign unlocks this guide.' };
  }
  if (profile.campaignProgressionTutorialState !== 'locked') {
    return { accepted: false, profile, reason: 'Campaign progression guide was already queued or seen.' };
  }
  return {
    accepted: true,
    profile: normalizeCommanderProfileV1({
      ...profile,
      revision: nextRevision(profile),
      campaignProgressionTutorialState: 'ready',
      updatedAt: now,
    }, now),
  };
}

/** Persists dismissal before the Home tutorial disappears or changes view. */
export function acknowledgeCampaignProgressionTutorialV1(
  profile: CommanderProfileV1,
  now = Date.now(),
): ProgressionActionResultV1 {
  if (profile.campaignProgressionTutorialState === 'seen') {
    return { accepted: false, profile, reason: 'Campaign progression guide was already seen.' };
  }
  if (profile.campaignProgressionTutorialState !== 'ready') {
    return { accepted: false, profile, reason: 'Campaign progression guide is not ready.' };
  }
  return {
    accepted: true,
    profile: normalizeCommanderProfileV1({
      ...profile,
      revision: nextRevision(profile),
      campaignProgressionTutorialState: 'seen',
      updatedAt: now,
    }, now),
  };
}

/** Signal Purge remains an in-run system and no longer changes account access. */
export function recordCampaignSignalPurgedCountriesV1(
  profile: CommanderProfileV1,
  _countryIds: string | readonly string[],
  _now = Date.now(),
): CampaignDefeatUnlockResultV1 {
  return {
    accepted: false,
    profile,
    reason: 'Signal Purge affects only the active timeline; defeat the nation in Campaign to unlock it.',
    newlyUnlockedCountryIds: [],
    newlyAvailableCountryIds: [],
  };
}

/**
 * Permanently unlocks ordinary nations eliminated in a completed standard
 * Campaign war. Alternative Universe and Survival are explicit no-ops.
 */
export function recordCampaignDefeatedCountriesV1(
  profile: CommanderProfileV1,
  countryIds: string | readonly string[],
  mode: GameModeV2 = 'standard-2026',
  now = Date.now(),
): CampaignDefeatUnlockResultV1 {
  if (mode !== 'standard-2026') {
    return {
      accepted: false,
      profile,
      reason: 'Only Campaign victories unlock nations.',
      newlyUnlockedCountryIds: [],
      newlyAvailableCountryIds: [],
    };
  }
  const requested = normalizeCountryIds(typeof countryIds === 'string' ? [countryIds] : countryIds);
  const alreadyOwned = new Set(profile.unlockedCountryIds);
  const newlyUnlockedCountryIds = requested.filter((countryId) => !alreadyOwned.has(countryId));
  if (newlyUnlockedCountryIds.length === 0) {
    return {
      accepted: false,
      profile,
      reason: 'No new Campaign victory unlocks were recorded.',
      newlyUnlockedCountryIds: [],
      newlyAvailableCountryIds: [],
    };
  }
  const unlockedCountryIds = [...new Set([
    ...profile.unlockedCountryIds,
    ...newlyUnlockedCountryIds,
  ])].sort((left, right) => left.localeCompare(right));
  return {
    accepted: true,
    profile: normalizeCommanderProfileV1({
      ...profile,
      revision: nextRevision(profile),
      unlockedCountryIds,
      defeatedCountryIds: [...profile.defeatedCountryIds, ...newlyUnlockedCountryIds],
      countryUpgrades: Object.fromEntries(unlockedCountryIds.map((countryId) => [
        countryId,
        profile.countryUpgrades[countryId] ?? emptyCountryUpgradesV1(),
      ])),
      countryMastery: Object.fromEntries(unlockedCountryIds.map((countryId) => [
        countryId,
        profile.countryMastery[countryId] ?? emptyCountryMasteryV1(),
      ])),
      pendingCountryUnlockNotificationIds: [],
      updatedAt: now,
    }, now),
    newlyUnlockedCountryIds,
    newlyAvailableCountryIds: newlyUnlockedCountryIds,
  };
}

function transactionV1(
  profile: CommanderProfileV1,
  kind: CommanderTransactionKindV1,
  amount: number,
  balanceAfter: number,
  now: number,
  detail: Pick<CommanderTransactionV1,
    'countryId' | 'track' | 'talentId' | 'campaignId' | 'deploymentId'> = {},
): CommanderTransactionV1 {
  const revision = nextRevision(profile);
  return {
    id: `${profile.commanderId}:${revision}:${kind}`,
    revision,
    kind,
    amount,
    balanceAfter,
    createdAt: now,
    ...detail,
  };
}

/** Pure account quote used by both the mission card and the launch boundary. */
export function quoteSurvivalDeploymentCreditsV1(
  profile: CommanderProfileV1,
): SurvivalDeploymentCreditQuoteV1 {
  const balance = Math.min(
    Number.MAX_SAFE_INTEGER,
    Math.floor(finiteNonNegative(profile.commandCredits)),
  );
  const cost = SURVIVAL_DEPLOYMENT_CREDIT_COST_V1;
  return {
    cost,
    balance,
    balanceAfter: Math.max(0, balance - cost),
    affordable: balance >= cost,
  };
}

function latestSurvivalDeploymentTransactionV1(
  profile: CommanderProfileV1,
  deploymentId: string,
): CommanderTransactionV1 | undefined {
  let latest: CommanderTransactionV1 | undefined;
  let latestIndex = -1;
  profile.transactions.forEach((entry, index) => {
    if (entry.deploymentId !== deploymentId
      || (entry.kind !== 'survival-deployment'
        && entry.kind !== 'survival-deployment-refund')) return;
    if (!latest
      || entry.revision > latest.revision
      || (entry.revision === latest.revision && entry.createdAt > latest.createdAt)
      || (entry.revision === latest.revision && entry.createdAt === latest.createdAt
        && index > latestIndex)) {
      latest = entry;
      latestIndex = index;
    }
  });
  return latest;
}

/**
 * Atomically debits one local Survival seat. The stable deployment id makes
 * launch retries idempotent and reconnects never call this boundary.
 */
export function spendSurvivalDeploymentCreditsV1(
  profile: CommanderProfileV1,
  deploymentId: string,
  now = Date.now(),
): SurvivalDeploymentCreditSpendResultV1 {
  const canonicalDeploymentId = deploymentId.trim().slice(0, 180);
  const quote = quoteSurvivalDeploymentCreditsV1(profile);
  if (!canonicalDeploymentId) {
    return {
      accepted: false,
      charged: false,
      profile,
      quote,
      reason: 'A Survival deployment id is required.',
    };
  }
  if (latestSurvivalDeploymentTransactionV1(profile, canonicalDeploymentId)?.kind
    === 'survival-deployment') {
    return { accepted: true, charged: false, profile, quote };
  }
  if (!quote.affordable) {
    return {
      accepted: false,
      charged: false,
      profile,
      quote,
      reason: `Survival requires ${quote.cost} Credits; balance ${quote.balance}.`,
    };
  }
  const balanceAfter = quote.balanceAfter;
  const next = normalizeCommanderProfileV1({
    ...profile,
    revision: nextRevision(profile),
    commandCredits: balanceAfter,
    transactions: [...profile.transactions, transactionV1(
      profile,
      'survival-deployment',
      -quote.cost,
      balanceAfter,
      now,
      { deploymentId: canonicalDeploymentId },
    )],
    updatedAt: now,
  }, now);
  return {
    accepted: true,
    charged: true,
    profile: next,
    quote: { ...quote, balanceAfter },
  };
}

/**
 * Reverses a deployment debit only while it is the latest ledger event for the
 * same id. Repeated rollback attempts are no-ops, while a later launch retry can
 * charge the refunded id again exactly once.
 */
export function refundSurvivalDeploymentCreditsV1(
  profile: CommanderProfileV1,
  deploymentId: string,
  now = Date.now(),
): SurvivalDeploymentCreditRefundResultV1 {
  const canonicalDeploymentId = deploymentId.trim().slice(0, 180);
  if (!canonicalDeploymentId) {
    return {
      accepted: false,
      refunded: false,
      profile,
      reason: 'A Survival deployment id is required.',
    };
  }
  const charge = latestSurvivalDeploymentTransactionV1(profile, canonicalDeploymentId);
  if (charge?.kind !== 'survival-deployment') {
    return { accepted: true, refunded: false, profile };
  }
  const refundAmount = Math.min(
    Number.MAX_SAFE_INTEGER,
    Math.floor(finiteNonNegative(-charge.amount)),
  );
  if (refundAmount <= 0) {
    return {
      accepted: false,
      refunded: false,
      profile,
      reason: 'The Survival deployment debit is not refundable.',
    };
  }
  const balanceAfter = Math.min(
    Number.MAX_SAFE_INTEGER,
    Math.floor(finiteNonNegative(profile.commandCredits)) + refundAmount,
  );
  return {
    accepted: true,
    refunded: true,
    profile: normalizeCommanderProfileV1({
      ...profile,
      revision: nextRevision(profile),
      commandCredits: balanceAfter,
      transactions: [...profile.transactions, transactionV1(
        profile,
        'survival-deployment-refund',
        refundAmount,
        balanceAfter,
        now,
        { deploymentId: canonicalDeploymentId },
      )],
      updatedAt: now,
    }, now),
  };
}

export function allocateCommanderTalentV1(
  profile: CommanderProfileV1,
  talentId: CommanderTalentId,
  now = Date.now(),
): ProgressionActionResultV1 {
  if (!COMMANDER_TALENT_IDS_V1.includes(talentId)) {
    return { accepted: false, profile, reason: 'Unknown APEX shield node.' };
  }
  const talents = normalizeCommanderTalents(profile.commanderTalents, profile.commanderLevel);
  const quote = commanderTalentAllocationQuoteV1(profile, talentId);
  if (!quote.available) {
    return { accepted: false, profile, reason: quote.reason };
  }
  talents[talentId] += 1;
  const revision = nextRevision(profile);
  const next = normalizeCommanderProfileV1({
    ...profile,
    revision,
    commanderTalents: talents,
    transactions: [...profile.transactions, transactionV1(
      profile, 'commander-talent', 0, 0, now, { talentId },
    )],
    updatedAt: now,
  }, now);
  return { accepted: true, profile: next };
}

/** Selects exactly one doctrine; its specialist mechanic still needs the linked talent rank. */
export function selectCommanderDoctrineV1(
  profile: CommanderProfileV1,
  doctrine: CommanderDoctrineV1,
  now = Date.now(),
): ProgressionActionResultV1 {
  if (!isCommanderDoctrineV1(doctrine)) {
    return { accepted: false, profile, reason: 'Unknown APEX doctrine.' };
  }
  const definition = COMMANDER_DOCTRINES_V1.find((entry) => entry.id === doctrine)!;
  const talents = normalizeCommanderTalents(profile.commanderTalents, profile.commanderLevel);
  if (!commanderDoctrineRequirementMetV1(talents, doctrine)) {
    return {
      accepted: false,
      profile,
      reason: `Requires ${definition.requirement.label} before this doctrine can activate.`,
    };
  }
  if (profile.activeDoctrine === doctrine) {
    return { accepted: false, profile, reason: 'That APEX doctrine is already active.' };
  }
  return {
    accepted: true,
    profile: normalizeCommanderProfileV1({
      ...profile,
      revision: nextRevision(profile),
      activeDoctrine: doctrine,
      updatedAt: now,
    }, now),
  };
}

/** Refunds every invested point; doctrines whose requirement disappears become unassigned. */
export function respecCommanderTalentsV1(
  profile: CommanderProfileV1,
  now = Date.now(),
): ProgressionActionResultV1 {
  if (commanderTalentPointsSpentV1(profile) === 0) {
    return { accepted: false, profile, reason: 'No APEX talent points are invested.' };
  }
  return {
    accepted: true,
    profile: normalizeCommanderProfileV1({
      ...profile,
      revision: nextRevision(profile),
      commanderTalents: emptyCommanderTalentsV1(),
      updatedAt: now,
    }, now),
  };
}

export function unlockCountryV1(
  profile: CommanderProfileV1,
  quote: CountryUnlockQuoteV1,
  now = Date.now(),
): ProgressionActionResultV1 {
  if (profile.unlockedCountryIds.includes(quote.countryId)) {
    return { accepted: false, profile, reason: 'Country already unlocked.' };
  }
  if (!quote.starterEligible) {
    return {
      accepted: false,
      profile,
      reason: 'Defeat this nation in Campaign to unlock it permanently.',
    };
  }
  const revision = nextRevision(profile);
  const next = normalizeCommanderProfileV1({
    ...profile,
    revision,
    unlockedCountryIds: [...profile.unlockedCountryIds, quote.countryId],
    countryUpgrades: { ...profile.countryUpgrades, [quote.countryId]: emptyCountryUpgradesV1() },
    countryMastery: { ...profile.countryMastery, [quote.countryId]: emptyCountryMasteryV1() },
    updatedAt: now,
  }, now);
  return { accepted: true, profile: next };
}

export function allocateCountryMasteryPointV1(
  profile: CommanderProfileV1,
  countryId: string,
  track: CountryMasteryTrackV1,
  now = Date.now(),
): ProgressionActionResultV1 {
  if (!profile.unlockedCountryIds.includes(countryId)) {
    return { accepted: false, profile, reason: 'Unlock this country first.' };
  }
  if (!COUNTRY_MASTERY_TRACK_IDS_V1.includes(track)) {
    return { accepted: false, profile, reason: 'Unknown country mastery track.' };
  }
  const mastery = countryMasteryV1(profile, countryId);
  if (countryMasteryPointsAvailableV1(mastery) <= 0) {
    return { accepted: false, profile, reason: 'No country mastery points are available.' };
  }
  const revision = nextRevision(profile);
  return {
    accepted: true,
    profile: normalizeCommanderProfileV1({
      ...profile,
      revision,
      countryMastery: {
        ...profile.countryMastery,
        [countryId]: {
          ...mastery,
          allocations: {
            ...mastery.allocations,
            [track]: mastery.allocations[track] + 1,
          },
        },
      },
      updatedAt: now,
    }, now),
  };
}

/** Free, lossless respec of one country's earned military mastery points. */
export function respecCountryMasteryV1(
  profile: CommanderProfileV1,
  countryId: string,
  now = Date.now(),
): ProgressionActionResultV1 {
  if (!profile.unlockedCountryIds.includes(countryId)) {
    return { accepted: false, profile, reason: 'Unlock this country first.' };
  }
  const mastery = countryMasteryV1(profile, countryId);
  if (countryMasteryPointsSpentV1(mastery) === 0) {
    return { accepted: false, profile, reason: 'No country mastery points are invested.' };
  }
  return {
    accepted: true,
    profile: normalizeCommanderProfileV1({
      ...profile,
      revision: nextRevision(profile),
      countryMastery: {
        ...profile.countryMastery,
        [countryId]: {
          ...mastery,
          allocations: { ...EMPTY_MASTERY.allocations },
        },
      },
      updatedAt: now,
    }, now),
  };
}

export function calculateCampaignRewardV1(input: CampaignRewardInputV1): CampaignRewardV1 {
  const weeks = Math.floor(finiteNonNegative(input.weeksSurvived));
  const territories = Math.floor(finiteNonNegative(input.territoriesGained));
  const territoriesLost = Math.floor(finiteNonNegative(input.territoriesLost ?? 0));
  const warsWon = Math.floor(finiteNonNegative(input.warsWon));
  const warsFought = Math.max(
    warsWon,
    Math.floor(finiteNonNegative(input.warsFought ?? warsWon)),
  );
  const wave = input.mode === 'survival'
    ? Math.floor(finiteNonNegative(input.highestSurvivalWave))
    : 0;
  const verifiedRogueWaveLosses = input.mode === 'survival'
    ? finiteNonNegative(input.verifiedRogueWaveLosses ?? 0)
    : 0;
  const losses = finiteNonNegative(input.militaryLosses);
  const rewardEligible = input.mode !== 'random-world';
  // Time alone is never progress. This keeps End Campaign outcome-neutral while
  // closing the open -> idle -> surrender reward loop completely.
  const meaningfulRun = rewardEligible && (territories > 0 || territoriesLost > 0 || warsFought > 0
    || wave > 0 || verifiedRogueWaveLosses > 0);
  const warsWithoutVictory = Math.max(0, warsFought - warsWon);
  const modeMultiplier = MODE_XP_MULTIPLIER[input.mode];
  const outcomeMultiplier = OUTCOME_XP_MULTIPLIER[input.outcome];
  const rawMasteryXp = meaningfulRun ? (
    8 + Math.min(90, Math.round(3 * Math.sqrt(weeks)))
      + Math.min(120, territories * 8)
      + Math.min(120, warsWon * 12)
      + Math.min(40, warsWithoutVictory * 4)
      + Math.min(120, wave * 10)
      + Math.min(10, Math.round(verifiedRogueWaveLosses * 4))
  ) * Math.min(1.1, modeMultiplier) * MASTERY_OUTCOME_MULTIPLIER[input.outcome] : 0;
  const masteryXp = Math.max(0, Math.round(rawMasteryXp));
  const commanderXp = Math.max(0, Math.round(rawMasteryXp * 0.6));
  // Credits reward demonstrated Campaign activity, never the selected outcome
  // or elapsed time by itself. Survival spends Credits but cannot refund its
  // own entry fee; Alternative Universe remains entirely outside progression.
  const meaningfulCampaignCreditActivity = input.mode === 'standard-2026'
    && (territories > 0 || territoriesLost > 0 || warsWon > 0
      || (weeks >= 4 && warsFought > 0 && losses >= 0.00025));
  const creditsEarned = meaningfulCampaignCreditActivity
    ? Math.min(50, Math.max(1, Math.round(
      5
        + Math.min(8, 2 * Math.sqrt(weeks / 13))
        + Math.min(25, territories * 5)
        + Math.min(8, territoriesLost * 2)
        + Math.min(24, warsWon * 6)
        + Math.min(6, warsWithoutVictory * 2),
    )))
    : 0;
  const score = Math.max(0, Math.round(
    weeks + territories * 125 + warsWon * 90 + warsWithoutVictory * 25 + wave * 160
      + Math.min(500, verifiedRogueWaveLosses * 1_000)
      - Math.min(2_000, losses * 8),
  ));
  return {
    ...input,
    weeksSurvived: weeks,
    territoriesGained: territories,
    territoriesLost,
    warsWon,
    warsFought,
    highestSurvivalWave: wave,
    verifiedRogueWaveLosses,
    militaryLosses: losses,
    modeMultiplier,
    outcomeMultiplier,
    masteryXp,
    commanderXp,
    creditsEarned,
    score,
  };
}

export function claimCampaignRewardV1(
  profile: CommanderProfileV1,
  reward: CampaignRewardV1,
  now = Date.now(),
): ProgressionActionResultV1 {
  if (reward.mode === 'random-world') {
    return { accepted: false, profile, reason: 'Alternative Universe has no account progression.' };
  }
  const alreadySettled = profile.claimedCampaignIds.includes(reward.campaignId)
    || profile.transactions.some((entry) => (
      entry.kind === 'campaign-reward' && entry.campaignId === reward.campaignId
    ));
  if (alreadySettled) {
    return { accepted: false, profile, reason: 'Campaign reward was already claimed.' };
  }
  if (!profile.unlockedCountryIds.includes(reward.countryId)) {
    return { accepted: false, profile, reason: 'Campaign country is not owned by this commander.' };
  }
  const currentMastery = countryMasteryV1(profile, reward.countryId);
  const nextXp = currentMastery.xp + reward.masteryXp;
  const nextCommanderXp = profile.commanderXp + reward.commanderXp;
  const creditsEarned = reward.mode === 'standard-2026'
    ? Math.floor(finiteNonNegative(reward.creditsEarned)) : 0;
  const nextCreditBalance = Math.min(
    Number.MAX_SAFE_INTEGER,
    profile.commandCredits + creditsEarned,
  );
  const creditedAmount = Math.max(0, nextCreditBalance - profile.commandCredits);
  const revision = nextRevision(profile);
  const next = normalizeCommanderProfileV1({
    ...profile,
    revision,
    commanderXp: nextCommanderXp,
    commanderLevel: commanderLevelFromXpV1(nextCommanderXp),
    commandCredits: nextCreditBalance,
    lifetimeCreditsEarned: Math.min(
      Number.MAX_SAFE_INTEGER,
      profile.lifetimeCreditsEarned + creditedAmount,
    ),
    countryMastery: {
      ...profile.countryMastery,
      [reward.countryId]: {
        ...currentMastery,
        xp: nextXp,
        level: countryMasteryLevelFromXpV1(nextXp),
        campaigns: currentMastery.campaigns + 1,
        victories: currentMastery.victories + (reward.outcome === 'victory' ? 1 : 0),
        bestSurvivalWave: Math.max(currentMastery.bestSurvivalWave, reward.highestSurvivalWave),
      },
    },
    completedCampaigns: profile.completedCampaigns + 1,
    victories: profile.victories + (reward.outcome === 'victory' ? 1 : 0),
    defeats: profile.defeats + (reward.outcome === 'defeat' ? 1 : 0),
    surrenders: profile.surrenders + (reward.outcome === 'surrender' ? 1 : 0),
    claimedCampaignIds: [...profile.claimedCampaignIds, reward.campaignId],
    transactions: [...profile.transactions, transactionV1(
      profile, 'campaign-reward', creditedAmount, nextCreditBalance, now,
      { countryId: reward.countryId, campaignId: reward.campaignId },
    )],
    updatedAt: now,
  }, now);
  return { accepted: true, profile: next };
}

export function renameCommanderV1(
  profile: CommanderProfileV1,
  requestedName: string,
  now = Date.now(),
): ProgressionActionResultV1 {
  const displayName = requestedName.trim().replace(/\s+/g, ' ').slice(0, 28);
  if (displayName.length < 3) {
    return { accepted: false, profile, reason: 'APEX name needs at least 3 characters.' };
  }
  return {
    accepted: true,
    profile: normalizeCommanderProfileV1({
      ...profile,
      revision: nextRevision(profile),
      displayName,
      updatedAt: now,
    }, now),
  };
}

export function renameEmpireV1(
  profile: CommanderProfileV1,
  requestedName: string,
  now = Date.now(),
): ProgressionActionResultV1 {
  const empireName = requestedName.trim().replace(/\s+/g, ' ');
  if (empireName.length < 3 || empireName.length > 36
    || !/^[\p{L}\p{N}][\p{L}\p{N} .,'’&-]*$/u.test(empireName)) {
    return {
      accepted: false,
      profile,
      reason: 'Use 3–36 letters, numbers, spaces or basic punctuation.',
    };
  }
  return {
    accepted: true,
    profile: normalizeCommanderProfileV1({
      ...profile,
      revision: nextRevision(profile),
      empireName,
      updatedAt: now,
    }, now),
  };
}

/** Selects any authored world flag; ownership is intentionally not required. */
export function selectEmpireFlagV1(
  profile: CommanderProfileV1,
  requestedFlag: EmpireFlagIdentityV1,
  availableCountryIds: readonly string[],
  now = Date.now(),
): ProgressionActionResultV1 {
  const countryId = requestedFlag.kind === 'country'
    ? requestedFlag.countryId.trim().toLowerCase() : '';
  const available = new Set(normalizeCountryIds(availableCountryIds));
  if (!countryId || !available.has(countryId)) {
    return { accepted: false, profile, reason: 'That world flag is unavailable.' };
  }
  if (profile.empireFlag.kind === 'country' && profile.empireFlag.countryId === countryId) {
    return { accepted: false, profile, reason: 'That flag already represents your empire.' };
  }
  return {
    accepted: true,
    profile: normalizeCommanderProfileV1({
      ...profile,
      revision: nextRevision(profile),
      empireFlag: { kind: 'country', countryId },
      updatedAt: now,
    }, now),
  };
}
