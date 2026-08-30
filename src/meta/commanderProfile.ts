import type { GameModeV2 } from '../sim/v2/scenarios';
import type { CommanderForceInitializationV2 } from '../sim/v2/types';
import {
  APEX_EMPIRE_RECRUITMENT_BASE_BONUS_V2,
  APEX_EMPIRE_RESERVE_TRAINING_BASE_BONUS_V2,
} from '../sim/v2/commanderForce';

export const COMMANDER_PROFILE_SCHEMA_VERSION = 1 as const;
export const STARTER_COUNTRY_ID = 'grl' as const;
export const STARTER_COUNTRY_POOL_SIZE = 1;
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
  | 'drill-instructors';
export type CommanderDoctrineV1 = 'vanguard' | 'bastion' | 'rapid-response';
export type CampaignOutcomeV1 = 'victory' | 'defeat' | 'surrender';
export type CommanderTransactionKindV1 = 'starter-grant' | 'country-unlock'
  | 'country-upgrade' | 'commander-talent' | 'campaign-reward';

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

export type CommanderTalentBranchV1 = 'lancer' | 'aegis' | 'nexus';

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
}

/**
 * Exact campaign-start contribution of the account talent build. Integrity
 * values retain the simulation's legacy million-unit scale. Keeping this calculation
 * separate from menu copy prevents a talent description drifting away from
 * the force that is actually spawned.
 */
export interface ResolvedCommanderTalentEffectsV1 {
  activeManpower: number;
  capacity: number;
  trainedReserves: number;
  attack: number;
  defense: number;
  supplyStock: number;
  empireRecruitmentBonus: number;
  empireReserveTrainingBonus: number;
}

/** One projected APEX neural dome. Legacy force fields carry shield state. */
export const BASE_COMMANDER_FORCE_V1 = Object.freeze({
  activeManpower: 0.0008,
  /** Maximum Shield Integrity; every fresh projection starts fully charged. */
  capacity: 0.0008,
  /** Recharge buffer; it never reduces active Shield Integrity. */
  trainedReserves: 0.00008,
  attack: 125,
  defense: 125,
  treasury: 0,
  annualOutput: 0.015,
  supplyStock: 0.010,
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
}

export interface CommanderProfileV1 {
  schemaVersion: typeof COMMANDER_PROFILE_SCHEMA_VERSION;
  revision: number;
  commanderId: string;
  displayName: string;
  /** Account-wide identity applied when a new solo campaign starts. */
  empireName: string;
  /** @deprecated Legacy schema field. Always normalized to zero and never shown or spent. */
  commandCredits: 0;
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
  completedCampaigns: number;
  victories: number;
  defeats: number;
  surrenders: number;
  /** @deprecated Legacy schema field. Always normalized to zero. */
  lifetimeCreditsEarned: 0;
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
  score: number;
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
    label: 'Singularity Pulse',
    role: 'LANCER CAPSTONE PROTOCOL',
    requirement: { talentId: 'elite-vanguard', rank: 5, label: 'Lancer Crown Rank 5' },
    description: 'Every third APEX-supported offensive battle gains +60% dome Attack.',
  },
  {
    id: 'bastion',
    label: 'Mirror Matrix',
    role: 'AEGIS CAPSTONE PROTOCOL',
    requirement: { talentId: 'doctrine-command', rank: 5, label: 'Aegis Crown Rank 5' },
    description: 'Returns 20% of damage actually intercepted by the dome as a bounded counterpulse.',
  },
  {
    id: 'rapid-response',
    label: 'Twin Projection',
    role: 'NEXUS CAPSTONE PROTOCOL',
    requirement: { talentId: 'mobile-logistics', rank: 5, label: 'Nexus Crown Rank 5' },
    description: 'Supports two distinct legal fronts at 60% projection each, sharing one Shield Integrity and energy pool; both projections recombine when one front ends.',
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
    id: 'science-corps', branch: 'lancer', tier: 1, label: 'Pulse Calibration',
    description: 'Amplifies the neural dome\'s offensive pulse.',
    perRank: '+0.40 Attack per effective rank; the exact next-rank gain follows the live curve.',
    prerequisites: [],
    milestones: [
      { rank: 5, label: 'Pulse Harmonics', description: '+0.74 Attack total.' },
      { rank: 10, label: 'Focused Pulse', description: '+2.59 Attack total.' },
      { rank: 15, label: 'Perfect Frequency', description: '+7.20 Attack total.' },
    ],
    synergy: 'Feeds Targeting Lattice and the Lancer Crown.', coreRank: COMMANDER_TALENT_CORE_RANK,
  },
  {
    id: 'treasury-reserve', branch: 'lancer', tier: 2, label: 'Targeting Lattice',
    description: 'Tightens hostile-signal tracking for harder dome strikes.',
    perRank: '+0.35 Attack per effective rank; the exact next-rank gain follows the live curve.',
    prerequisites: [{ talentId: 'science-corps', rank: 3 }],
    milestones: [
      { rank: 5, label: 'Predictive Lock', description: '+0.65 Attack total.' },
      { rank: 10, label: 'Threat Solution', description: '+2.27 Attack total.' },
      { rank: 15, label: 'Zero-Lag Targeting', description: '+6.30 Attack total.' },
    ],
    synergy: 'Requires Pulse Calibration Rank 3.', coreRank: COMMANDER_TALENT_CORE_RANK,
  },
  {
    id: 'elite-vanguard', branch: 'lancer', tier: 3, label: 'Lancer Crown',
    description: 'Hardens the live dome while pushing its Attack ceiling.',
    perRank: '+0.625% Shield Integrity, +0.625% Max Integrity and +0.60 Attack per effective rank, plus authored integrity breakthroughs.',
    prerequisites: [{ talentId: 'treasury-reserve', rank: 3 }],
    milestones: [
      { rank: 5, label: 'Lancer Protocol', description: '+2.41% Shield Integrity · +2.41% Max Integrity · +1.12 Attack total · unlock Singularity Pulse: every third supported offensive battle gains +60% dome Attack.' },
      { rank: 10, label: 'Lancer Resonance', description: '+7.80% Shield Integrity · +7.80% Max Integrity · +3.89 Attack total.' },
      { rank: 15, label: 'Lancer Singularity', description: '+18.75% Shield Integrity · +18.75% Max Integrity · +10.80 Attack total.' },
    ],
    synergy: 'Branch capstone; unlocks Singularity Pulse at Rank 5.', coreRank: COMMANDER_TALENT_CORE_RANK,
  },
  {
    id: 'volunteer-brigade', branch: 'aegis', tier: 1, label: 'Integrity Lattice',
    description: 'Expands the dome\'s maximum damage capacity.',
    perRank: '+2.50% Max Integrity per effective rank, plus authored integrity breakthroughs.',
    prerequisites: [],
    milestones: [
      { rank: 5, label: 'Layered Shell', description: '+8.40% Max Integrity total.' },
      { rank: 10, label: 'Deep Lattice', description: '+27.47% Max Integrity total.' },
      { rank: 15, label: 'Boundless Shell', description: '+67.50% Max Integrity total.' },
    ],
    synergy: 'Feeds Interception Mesh.', coreRank: COMMANDER_TALENT_CORE_RANK,
  },
  {
    id: 'civil-defense', branch: 'aegis', tier: 2, label: 'Interception Mesh',
    description: 'Raises Defense and restores charge between hostile impacts.',
    perRank: '+0.60 Defense and +5% Recharge per effective rank.',
    prerequisites: [{ talentId: 'volunteer-brigade', rank: 3 }],
    milestones: [
      { rank: 5, label: 'Crossfire Screen', description: '+1.12 Defense · +9.30% Recharge total.' },
      { rank: 10, label: 'Dense Interception', description: '+3.89 Defense · +32.43% Recharge total.' },
      { rank: 15, label: 'Perfect Screen', description: '+10.80 Defense · +90% Recharge total.' },
    ],
    synergy: 'Requires Integrity Lattice Rank 3.', coreRank: COMMANDER_TALENT_CORE_RANK,
  },
  {
    id: 'reserve-cadre', branch: 'aegis', tier: 3, label: 'Emergency Reboot',
    description: 'Stores a protected recharge buffer for impact recovery.',
    perRank: '+1% Max Integrity and +1% Recharge Buffer per effective rank, plus authored reboot breakthroughs.',
    prerequisites: [{ talentId: 'civil-defense', rank: 3 }],
    milestones: [
      { rank: 5, label: 'Reboot Kernel', description: '+1.86% Max Integrity · +1.86% Recharge Buffer total · recover 10% of impact loss, up to 2.5% Max Integrity per battle.' },
      { rank: 10, label: 'Twin Kernel', description: '+8.99% Max Integrity · +8.99% Recharge Buffer total.' },
      { rank: 15, label: 'Persistent Kernel', description: '+24.25% Max Integrity · +24.25% Recharge Buffer total.' },
    ],
    synergy: 'Feeds the Aegis Crown.', coreRank: COMMANDER_TALENT_CORE_RANK,
  },
  {
    id: 'doctrine-command', branch: 'aegis', tier: 4, label: 'Aegis Crown',
    description: 'Concentrates the dome on Defense and peak interception.',
    perRank: '+0.35 Defense per effective rank; the exact next-rank gain follows the live curve.',
    prerequisites: [{ talentId: 'reserve-cadre', rank: 3 }],
    milestones: [
      { rank: 5, label: 'Aegis Protocol', description: '+0.65 Defense total · unlock Mirror Matrix: return 20% of intercepted damage as a bounded counterpulse.' },
      { rank: 10, label: 'Aegis Resonance', description: '+2.27 Defense total.' },
      { rank: 15, label: 'Aegis Singularity', description: '+6.30 Defense total.' },
    ],
    synergy: 'Branch capstone; unlocks Mirror Matrix at Rank 5.', coreRank: COMMANDER_TALENT_CORE_RANK,
  },
  {
    id: 'drill-instructors', branch: 'nexus', tier: 1, label: 'Projection Relay',
    description: 'Stabilizes remote dome projection and its recharge link.',
    perRank: '+0.50% Shield Integrity, +1% Max Integrity, +0.50% Recharge Buffer and +2.50% Recharge per effective rank.',
    prerequisites: [],
    milestones: [
      { rank: 3, label: 'Distributed Projection', description: '+0.45% Shield Integrity · +0.91% Max Integrity · +0.45% Recharge Buffer · +2.27% Recharge total · recharge from any controlled territory and transfer charge 75% faster.' },
      { rank: 10, label: 'Wide Relay', description: '+3.24% Shield Integrity · +6.49% Max Integrity · +3.24% Recharge Buffer · +16.22% Recharge total.' },
      { rank: 15, label: 'Global Relay', description: '+9% Shield Integrity · +18% Max Integrity · +9% Recharge Buffer · +45% Recharge total.' },
    ],
    synergy: 'Feeds Closed Recharge Loop.', coreRank: COMMANDER_TALENT_CORE_RANK,
  },
  {
    id: 'frugal-quartermaster', branch: 'nexus', tier: 2, label: 'Closed Recharge Loop',
    description: 'Recycles field energy into Max Integrity, recharge buffer and uptime.',
    perRank: '+0.75% Max Integrity, +0.75% Recharge Buffer and +6% Recharge per effective rank.',
    prerequisites: [{ talentId: 'drill-instructors', rank: 3 }],
    milestones: [
      { rank: 5, label: 'Failsafe Shift I', description: '+1.39% Max Integrity · +1.39% Recharge Buffer · +11.16% Recharge total · one emergency projection shift.' },
      { rank: 10, label: 'Failsafe Shift II', description: '+4.86% Max Integrity · +4.86% Recharge Buffer · +38.92% Recharge total · two emergency projection shifts.' },
      { rank: 15, label: 'Closed Field', description: '+13.50% Max Integrity · +13.50% Recharge Buffer · +108% Recharge total.' },
    ],
    synergy: 'Requires Projection Relay Rank 3.', coreRank: COMMANDER_TALENT_CORE_RANK,
  },
  {
    id: 'mobile-logistics', branch: 'nexus', tier: 3, label: 'Nexus Crown',
    description: 'Maximizes recharge uptime and unlocks a shared twin projection.',
    perRank: '+10% Recharge per effective rank.',
    prerequisites: [{ talentId: 'frugal-quartermaster', rank: 3 }],
    milestones: [
      { rank: 5, label: 'Nexus Protocol', description: '+18.59% Recharge total · unlock Twin Projection: two legal fronts at 60% projection each, sharing one Shield Integrity and energy pool.' },
      { rank: 10, label: 'Nexus Resonance', description: '+64.87% Recharge total.' },
      { rank: 15, label: 'Nexus Singularity', description: '+180% Recharge total.' },
    ],
    synergy: 'Branch capstone; unlocks Twin Projection at Rank 5.', coreRank: COMMANDER_TALENT_CORE_RANK,
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
    commandCredits: 0,
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
  return value === 'vanguard' || value === 'bastion' || value === 'rapid-response';
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
      && source.kind !== 'campaign-reward') continue;
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
    // Legacy balances are deliberately discarded. They cannot influence any
    // unlock, reward or UI surface under the current rules.
    commandCredits: 0,
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
    completedCampaigns,
    victories: Math.floor(finiteNonNegative(source.victories)),
    defeats: Math.floor(finiteNonNegative(source.defeats)),
    surrenders: Math.floor(finiteNonNegative(source.surrenders)),
    lifetimeCreditsEarned: 0,
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

const reachedV1 = (rank: number, threshold: number, value: number): number => (
  rank >= threshold ? value : 0
);

const roundForceValueV1 = (value: number): number => Math.round(value * 1_000_000_000) / 1_000_000_000;

/** Resolves the shield tree to legacy simulation fields without exposing force semantics. */
export function resolveCommanderTalentEffectsV1(
  talents: Readonly<Partial<Record<CommanderTalentId, number>>>,
): ResolvedCommanderTalentEffectsV1 {
  const rawLancer = talentRankV1(talents, 'elite-vanguard');
  const rawIntegrity = talentRankV1(talents, 'volunteer-brigade');
  const rawReboot = talentRankV1(talents, 'reserve-cadre');
  const lancer = commanderTalentEffectiveRankV1(rawLancer);
  const integrity = commanderTalentEffectiveRankV1(rawIntegrity);
  const reboot = commanderTalentEffectiveRankV1(rawReboot);
  const projection = commanderTalentEffectiveRankV1(talentRankV1(talents, 'drill-instructors'));
  const recharge = commanderTalentEffectiveRankV1(talentRankV1(talents, 'mobile-logistics'));
  const closedLoop = commanderTalentEffectiveRankV1(talentRankV1(talents, 'frugal-quartermaster'));
  const pulse = commanderTalentEffectiveRankV1(talentRankV1(talents, 'science-corps'));
  const targeting = commanderTalentEffectiveRankV1(talentRankV1(talents, 'treasury-reserve'));
  const interception = commanderTalentEffectiveRankV1(talentRankV1(talents, 'civil-defense'));
  const aegis = commanderTalentEffectiveRankV1(talentRankV1(talents, 'doctrine-command'));

  const lancerBreakthroughs = reachedV1(rawLancer, 5, 0.00001)
    + reachedV1(rawLancer, 10, 0.00002)
    + reachedV1(rawLancer, 15, 0.00003);
  const lancerIntegrity = lancer * 0.000005 + lancerBreakthroughs;
  const maxIntegrity = integrity * 0.00002
    + reachedV1(rawIntegrity, 5, 0.00003)
    + reachedV1(rawIntegrity, 10, 0.00006)
    + reachedV1(rawIntegrity, 15, 0.00009);
  const rebootBuffer = reboot * 0.000008
    + reachedV1(rawReboot, 10, 0.00002)
    + reachedV1(rawReboot, 15, 0.00003);
  const projectionIntegrity = projection * 0.000004;
  const projectionBuffer = projection * 0.000004;
  const closedLoopBuffer = closedLoop * 0.000006;

  return {
    activeManpower: roundForceValueV1(lancerIntegrity + projectionIntegrity),
    capacity: roundForceValueV1(
      lancerIntegrity + maxIntegrity + rebootBuffer
        + projectionIntegrity + projectionBuffer + closedLoopBuffer,
    ),
    trainedReserves: roundForceValueV1(rebootBuffer + projectionBuffer + closedLoopBuffer),
    attack: roundForceValueV1(lancer * 0.60 + pulse * 0.40 + targeting * 0.35),
    defense: roundForceValueV1(interception * 0.60 + aegis * 0.35),
    supplyStock: roundForceValueV1(BASE_COMMANDER_FORCE_V1.supplyStock * (
      recharge * 0.10 + interception * 0.05 + projection * 0.025 + closedLoop * 0.06
    )),
    // Retained compatibility fields. Shield talents never create or train national units.
    empireRecruitmentBonus: 0,
    empireReserveTrainingBonus: 0,
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
    // Compatibility field names are retained in the stored loadout schema,
    // but now carry one coherent active/capacity/reserve package.
    eliteStarterManpower: commanderEffects.activeManpower,
    regularStarterManpower: commanderEffects.capacity,
    trainedReserveStarterManpower: commanderEffects.trainedReserves,
    // Retained loadout key for old snapshots; talents never grant money.
    openingTreasuryBonus: 0,
    openingFoodWeeksBonus: commanderEffects.supplyStock,
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
  // Capacity is Max Shield Integrity. Integrity talents expand both the ceiling
  // and the fresh charge, so a new campaign never presents APEX as already damaged.
  // The separate energy buffer recharges the same dome during the campaign.
  const capacity = roundForceValueV1(
    BASE_COMMANDER_FORCE_V1.capacity
      + loadout.regularStarterManpower + levelGrowth * 0.000001,
  );
  const trainedReserves = roundForceValueV1(
    BASE_COMMANDER_FORCE_V1.trainedReserves
      + loadout.trainedReserveStarterManpower,
  );
  return {
    manpower: capacity,
    capacity,
    trainedReserves,
    baseAttack: Math.min(160, BASE_COMMANDER_FORCE_V1.attack
      + levelGrowth * 0.018 + effects.attack),
    baseDefense: Math.min(160, BASE_COMMANDER_FORCE_V1.defense
      + levelGrowth * 0.018 + effects.defense),
    treasury: BASE_COMMANDER_FORCE_V1.treasury,
    annualOutput: BASE_COMMANDER_FORCE_V1.annualOutput
      + levelGrowth * COMMANDER_LEVEL_ANNUAL_OUTPUT_GROWTH_V1,
    // Resolve from the stable talent ids at launch; legacy loadout snapshots
    // cannot reintroduce retired civilian/economic talent semantics.
    supplyStock: BASE_COMMANDER_FORCE_V1.supplyStock + effects.supplyStock,
    countryTraitScale: loadout.traitScale,
    capabilities: {
      mobileHeadquarters: talents['drill-instructors'] >= 3,
      fieldHospital: talents['reserve-cadre'] >= 5,
      rapidResponse: doctrine === 'rapid-response' && talents['mobile-logistics'] >= 5,
      assaultSpecialist: doctrine === 'vanguard' && talents['elite-vanguard'] >= 5,
      defenseSpecialist: doctrine === 'bastion' && talents['doctrine-command'] >= 5,
      emergencyExtractionCharges: talents['frugal-quartermaster'] >= 10
        ? 2 : talents['frugal-quartermaster'] >= 5 ? 1 : 0,
    },
    empireSupport: {
      recruitmentMultiplier: Math.min(
        1.50,
        1 + APEX_EMPIRE_RECRUITMENT_BASE_BONUS_V2 + effects.empireRecruitmentBonus,
      ),
      reserveTrainingMultiplier: Math.min(
        1.75,
        1 + APEX_EMPIRE_RESERVE_TRAINING_BASE_BONUS_V2
          + effects.empireReserveTrainingBonus,
      ),
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
  detail: Pick<CommanderTransactionV1, 'countryId' | 'track' | 'talentId' | 'campaignId'> = {},
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
  const revision = nextRevision(profile);
  const next = normalizeCommanderProfileV1({
    ...profile,
    revision,
    commanderXp: nextCommanderXp,
    commanderLevel: commanderLevelFromXpV1(nextCommanderXp),
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
      profile, 'campaign-reward', 0, 0, now,
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
