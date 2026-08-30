import type { GameModeV2 } from '../sim/v2/scenarios';
import {
  BASE_COMMANDER_FORCE_V1,
  COMMANDER_DOCTRINES_V1,
  COMMANDER_TALENTS_V1,
  COUNTRY_MASTERY_TRACK_IDS_V1,
  MAX_COUNTRY_MASTERY_LEVEL,
  MAX_COUNTRY_UPGRADE_LEVEL,
  commanderTalentAllocationQuoteV1,
  commanderTalentPointsAvailableV1,
  commanderTalentRankLevelRequirementV1,
  commanderXpForLevelV1,
  countryMasteryV1,
  countryMasteryXpDifficultyMultiplierV1,
  countryMasteryXpForLevelV1,
  resolveCommanderForceInitializationV1,
  resolveCommanderTalentEffectsV1,
  resolveCountryLoadoutV1,
  resolveCountryMasteryMilitaryEffectsV1,
  type CommanderProfileV1,
  type CommanderDoctrineV1,
  type CommanderTalentBranchV1,
  type CommanderTalentId,
  type CountryMasteryTrackV1,
  type CountryUnlockQuoteV1,
  type CountryUpgradeTrack,
  type ProgressionActionResultV1,
  type ResolvedCommanderTalentEffectsV1,
  type ResolvedCountryLoadoutV1,
} from '../meta/commanderProfile';
import type { StoredCampaignV1 } from '../meta/commanderStorage';
import { countryFlagHtml } from './countryFlags';
import './CommanderMenu.css';

export interface CommanderCountryCatalogEntryV1 {
  id: string;
  name: string;
  shortName: string;
  continent: string;
  subregion: string;
  cssColor: string;
  sigil: string;
  militaryPower: number;
  /** Direct, simulation-valid land borders and naval routes from this nation. */
  strategicAccess: readonly Readonly<{
    countryId: string;
    kind: 'land' | 'naval';
  }>[];
  /** The same neutral opening snapshot used by the established Choose Your Nation preview. */
  opening: Readonly<{
    attack: number;
    defense: number;
    iq: number;
    armyManpower: number;
    armyCapacity: number;
    trainedReserves: number;
    population: number;
    economy: number;
    treasury: number;
    economicGrowth: number;
    populationGrowth: number;
    gdpPerCapita: number;
  }>;
  quote: CountryUnlockQuoteV1;
}

export interface CommanderMenuOptionsV1 {
  profile: CommanderProfileV1;
  countries: readonly CommanderCountryCatalogEntryV1[];
  campaign?: StoredCampaignV1;
  /** Session-scoped multiplayer seat; secrets remain outside the presentation layer. */
  multiplayerResume?: Readonly<{
    countryId: string;
    mode: GameModeV2;
    expiresAt: number;
  }>;
  /** A solo run always starts from the nation-first deployment flow. */
  onStartMode: (mode: GameModeV2, countryId: string, replaceExistingCampaign: boolean) => void;
  /** Multiplayer keeps its own shared country-seat flow outside solo deployment. */
  onMultiplayerRequested?: (mode: GameModeV2, countryId: string) => void;
  onContinueCampaign: () => void;
  onSurrenderCampaign: () => void;
  onResumeMultiplayer?: () => void;
  onDiscardMultiplayerResume?: () => void;
  onDeleteCampaign: () => void;
  onResetAccount: () => void;
  onAllocateCountryMasteryPoint: (
    countryId: string,
    track: CountryMasteryTrackV1,
  ) => ProgressionActionResultV1;
  onRespecCountryMastery: (countryId: string) => ProgressionActionResultV1;
  onAllocateCommanderTalent: (talentId: CommanderTalentId) => ProgressionActionResultV1;
  onSelectCommanderDoctrine: (doctrine: CommanderDoctrineV1) => ProgressionActionResultV1;
  onRespecCommanderTalents: () => ProgressionActionResultV1;
  onRenameCommander: (name: string) => ProgressionActionResultV1;
  onRenameEmpire: (name: string) => ProgressionActionResultV1;
}

type CommanderMenuView = 'home' | 'country' | 'mode' | 'arsenal' | 'talents';

export type CommanderCountryRosterGroupV1 = 'owned' | 'locked';

const ROSTER_GROUP_PRESENTATION: Readonly<Record<CommanderCountryRosterGroupV1, {
  label: string;
}>> = {
  owned: {
    label: 'Your Nations',
  },
  locked: {
    label: 'Campaign Targets',
  },
};

const TALENT_BRANCH_PRESENTATION: Readonly<Record<CommanderTalentBranchV1, {
  label: string;
  kicker: string;
  icon: string;
  description: string;
}>> = {
  lancer: {
    label: 'Lancer',
    kicker: 'OFFENSIVE PULSE',
    icon: '△',
    description: 'Attack, targeting and decisive front pressure.',
  },
  aegis: {
    label: 'Aegis',
    kicker: 'INTERCEPTION SHELL',
    icon: '⬡',
    description: 'Max Integrity, Defense and emergency reboot.',
  },
  nexus: {
    label: 'Nexus',
    kicker: 'PROJECTION NETWORK',
    icon: '◎',
    description: 'Projection speed, Recharge and active uptime.',
  },
};

const TALENT_BRANCH_DOCTRINE: Readonly<Record<CommanderTalentBranchV1, CommanderDoctrineV1>> = {
  lancer: 'vanguard',
  aegis: 'bastion',
  nexus: 'rapid-response',
};

const MODE_PRESENTATION: Readonly<Record<GameModeV2, {
  label: string;
  kicker: string;
  description: string;
  badge: string;
}>> = {
  'standard-2026': {
    label: 'Campaign',
    kicker: '2026 · FIRST TIMELINE',
    description: 'The machine signal shattered every alliance. Enter a possible future, rebuild from one flag and uncover Antarctica.',
    badge: 'CORE MODE',
  },
  'random-world': {
    label: 'Alternative Universe',
    kicker: 'CHAOS / FUN MODE',
    description: 'Real borders with wildly regenerated national balance.',
    badge: 'NO META REWARDS',
  },
  survival: {
    label: 'Survival',
    kicker: '2096 · TERMINAL TIMELINE',
    description: 'The machine continent is awake from week one. Hold, expand and break the Antarctic core.',
    badge: 'ENDGAME MODE',
  },
};

const COUNTRY_MASTERY_PRESENTATION: Readonly<Record<CountryMasteryTrackV1, {
  label: string;
  icon: string;
}>> = {
  force: { label: 'Force Structure', icon: '◆' },
  firepower: { label: 'Firepower', icon: '▲' },
  defense: { label: 'Defense Grid', icon: '◇' },
  mobilization: { label: 'Mobilization', icon: '↟' },
  'land-logistics': { label: 'Land Logistics', icon: '⌁' },
  expeditionary: { label: 'Expeditionary', icon: '≈' },
  'military-industry': { label: 'Military Industry', icon: '⚙' },
  'field-medicine': { label: 'Field Medicine', icon: '✚' },
};

function upgradePercent(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Exact campaign effects produced by one legacy country-upgrade total. */
export function countryUpgradeEffectCopyV1(track: CountryUpgradeTrack, level: number): string {
  const rank = Math.max(0, Math.min(MAX_COUNTRY_UPGRADE_LEVEL, Math.floor(level)));
  if (track === 'mobilization') {
    return `Opening army +${rank * 4}% · trained reserves +${upgradePercent(rank * 2.5)}% · Training, Force Capacity and Reserve Training +${rank} effect levels`;
  }
  if (track === 'logistics') {
    return `Supply +${rank} effect levels · Operating Efficiency +${rank} effect levels`;
  }
  if (track === 'research') {
    return `Research Speed +${rank} effect levels · Research Efficiency +${rank} effect levels`;
  }
  if (track === 'economy') {
    return `Opening treasury and territory economy +${rank * 4}% · Economy Growth and Tax Efficiency +${rank} effect levels`;
  }
  return 'Legacy upgrade inactive';
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]!);
}

function compact(value: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function dateLabel(timestamp: number): string {
  if (!timestamp) return 'Unknown date';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp);
}

function campaignWeek(campaign: StoredCampaignV1): number {
  try {
    const parsed = JSON.parse(campaign.stateSave) as { tick?: unknown };
    return Math.max(0, Math.floor(Number(parsed.tick) || 0));
  } catch {
    return 0;
  }
}

interface CampaignDashboardSnapshotV1 {
  territoryCount: number;
  deployedArmy: number;
  treasury: number;
  activeWars: number;
  shieldIntegrity: number;
  maxShieldIntegrity: number;
  globalWave: number;
  coreIntegrity: number;
  controlledCountryIds: readonly string[];
}

/** A deliberately small, failure-tolerant projection of the canonical save. */
function campaignDashboardSnapshotV1(campaign: StoredCampaignV1): CampaignDashboardSnapshotV1 | undefined {
  try {
    const save = JSON.parse(campaign.stateSave) as {
      players?: Record<string, { treasury?: unknown }>;
      territories?: Record<string, { owner?: unknown; army?: { manpower?: unknown } }>;
      wars?: Array<{ attackerId?: unknown; defenderId?: unknown }>;
      commanderForces?: Record<string, { army?: { manpower?: unknown; capacity?: unknown } }>;
      polarEndgame?: { globalWave?: unknown; bossIntegrity?: unknown };
    };
    const controlledTerritories = Object.entries(save.territories ?? {})
      .filter(([, territory]) => territory.owner === campaign.countryId);
    const territories = controlledTerritories.map(([, territory]) => territory);
    const activeWars = (save.wars ?? []).filter((war) => (
      war.attackerId === campaign.countryId || war.defenderId === campaign.countryId
    )).length;
    return {
      territoryCount: territories.length,
      deployedArmy: territories.reduce((sum, territory) => (
        sum + Math.max(0, Number(territory.army?.manpower) || 0)
      ), 0),
      treasury: Number(save.players?.[campaign.countryId]?.treasury) || 0,
      activeWars,
      shieldIntegrity: Math.max(
        0,
        Number(save.commanderForces?.[campaign.countryId]?.army?.manpower) || 0,
      ),
      maxShieldIntegrity: Math.max(
        0,
        Number(save.commanderForces?.[campaign.countryId]?.army?.capacity) || 0,
      ),
      globalWave: Math.max(0, Math.floor(Number(save.polarEndgame?.globalWave) || 0)),
      coreIntegrity: Math.max(0, Math.min(
        100,
        Number(save.polarEndgame?.bossIntegrity) || 0,
      )),
      controlledCountryIds: controlledTerritories.map(([territoryId]) => territoryId),
    };
  } catch {
    return undefined;
  }
}

function peopleFromMillions(value: number): string {
  return compact(Math.max(0, value) * 1_000_000);
}

function moneyFromBillions(value: number): string {
  return `${value < 0 ? '−' : ''}$${compact(Math.abs(value) * 1_000_000_000)}`;
}

function signedPercent(value: number, digits = 2): string {
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(digits)}%`;
}

function masteryPercent(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0$/, '');
}

function masteryReductionPercent(value: number): string {
  const formatted = masteryPercent(Math.max(0, value));
  return Number(formatted) === 0 ? '0%' : `−${formatted}%`;
}

function talentStatNumber(value: number): string {
  const rounded = Math.round(Math.abs(value) * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0$/, '');
}

function talentPositive(value: number, suffix = ''): string {
  return `+${talentStatNumber(value)}${suffix}`;
}

function commanderTalentOnlyEffectsV1(
  talentId: CommanderTalentId,
  rank: number,
): ResolvedCommanderTalentEffectsV1 {
  return resolveCommanderTalentEffectsV1({
    [talentId]: Math.max(0, Math.floor(rank)),
  });
}

function commanderTalentEffectDeltaV1(
  current: ResolvedCommanderTalentEffectsV1,
  target: ResolvedCommanderTalentEffectsV1,
): ResolvedCommanderTalentEffectsV1 {
  return {
    activeManpower: target.activeManpower - current.activeManpower,
    capacity: target.capacity - current.capacity,
    trainedReserves: target.trainedReserves - current.trainedReserves,
    attack: target.attack - current.attack,
    defense: target.defense - current.defense,
    supplyStock: target.supplyStock - current.supplyStock,
    empireRecruitmentBonus: target.empireRecruitmentBonus - current.empireRecruitmentBonus,
    empireReserveTrainingBonus: target.empireReserveTrainingBonus
      - current.empireReserveTrainingBonus,
  };
}

/** Exact simulation contribution from one APEX talent at its current or next rank. */
export function commanderTalentEffectCopyV1(
  talentId: CommanderTalentId,
  rank: number,
  mode: 'current' | 'next' = 'current',
): string {
  const safeRank = Math.max(0, Math.floor(rank));
  const current = commanderTalentOnlyEffectsV1(talentId, safeRank);
  const effects = mode === 'current'
    ? current
    : commanderTalentEffectDeltaV1(
      current,
      commanderTalentOnlyEffectsV1(talentId, safeRank + 1),
    );
  const integrityPercent = talentPositive(
    100 * effects.activeManpower / BASE_COMMANDER_FORCE_V1.activeManpower,
    '%',
  );
  const maxIntegrityPercent = talentPositive(
    100 * effects.capacity / BASE_COMMANDER_FORCE_V1.capacity,
    '%',
  );
  const rechargeBufferPercent = talentPositive(
    100 * effects.trainedReserves / BASE_COMMANDER_FORCE_V1.capacity,
    '%',
  );
  const rechargePercent = talentPositive(
    100 * effects.supplyStock / Math.max(0.000_001, BASE_COMMANDER_FORCE_V1.supplyStock),
    '%',
  );

  if (talentId === 'elite-vanguard') {
    return `${integrityPercent} Shield Integrity · ${maxIntegrityPercent} Max Integrity · ${talentPositive(effects.attack)} Attack`;
  }
  if (talentId === 'volunteer-brigade') {
    return `${maxIntegrityPercent} Max Integrity`;
  }
  if (talentId === 'reserve-cadre') {
    return `${maxIntegrityPercent} Max Integrity · ${rechargeBufferPercent} Recharge Buffer`;
  }
  if (talentId === 'drill-instructors') {
    return `${integrityPercent} Shield Integrity · ${maxIntegrityPercent} Max Integrity · ${rechargeBufferPercent} Recharge Buffer · ${rechargePercent} Recharge`;
  }
  if (talentId === 'mobile-logistics') {
    return `${rechargePercent} Recharge`;
  }
  if (talentId === 'frugal-quartermaster') {
    return `${maxIntegrityPercent} Max Integrity · ${rechargeBufferPercent} Recharge Buffer · ${rechargePercent} Recharge`;
  }
  if (talentId === 'science-corps') {
    return `${talentPositive(effects.attack)} Attack`;
  }
  if (talentId === 'treasury-reserve') {
    return `${talentPositive(effects.attack)} Attack`;
  }
  if (talentId === 'civil-defense') {
    return `${talentPositive(effects.defense)} Defense · ${rechargePercent} Recharge`;
  }
  return `${talentPositive(effects.defense)} Defense`;
}

/** Exact total shown on one repeatable military-mastery track. */
export function countryMasteryTrackEffectCopyV1(
  track: CountryMasteryTrackV1,
  rank: number,
): string {
  const safeRank = Math.max(0, Math.min(MAX_COUNTRY_MASTERY_LEVEL - 1, Math.floor(rank)));
  const allocations = {
    force: 0,
    firepower: 0,
    defense: 0,
    mobilization: 0,
    'land-logistics': 0,
    expeditionary: 0,
    'military-industry': 0,
    'field-medicine': 0,
  };
  allocations[track] = safeRank;
  const effects = resolveCountryMasteryMilitaryEffectsV1(
    MAX_COUNTRY_MASTERY_LEVEL,
    allocations,
  );
  if (track === 'force') {
    return `+${masteryPercent((effects.armyCapacityMultiplier - 1) * 100)}% Army Capacity`;
  }
  if (track === 'firepower') {
    return `+${masteryPercent((effects.attackMultiplier - 1) * 100)}% ATK`;
  }
  if (track === 'defense') {
    return `+${masteryPercent((effects.defenseMultiplier - 1) * 100)}% DEF`;
  }
  if (track === 'mobilization') {
    return `+${masteryPercent((effects.recruitmentMultiplier - 1) * 100)}% Recruitment · +${masteryPercent((effects.reserveTrainingMultiplier - 1) * 100)}% Reserve Training`;
  }
  if (track === 'land-logistics') {
    return `+${masteryPercent((effects.landSupplyMultiplier - 1) * 100)}% Land Supply · +${masteryPercent((effects.landTransferThroughputMultiplier - 1) * 100)}% Land Transfer`;
  }
  if (track === 'expeditionary') {
    return `+${masteryPercent((effects.navalSupplyMultiplier - 1) * 100)}% Naval Supply · +${masteryPercent((effects.navalTransferThroughputMultiplier - 1) * 100)}% Naval Transfer · ${masteryReductionPercent((1 - effects.navalTransferCostMultiplier) * 100)} Naval Cost`;
  }
  if (track === 'military-industry') {
    return `${masteryReductionPercent((1 - effects.recruitmentCostMultiplier) * 100)} Recruit Cost · ${masteryReductionPercent((1 - effects.standingOperatingCostMultiplier) * 100)} Army Upkeep`;
  }
  return `${masteryReductionPercent((1 - effects.casualtyMultiplier) * 100)} Casualties`;
}

/**
 * Projects the visible national combat rating from the exact mastery loadout.
 * Capacity and opening-force growth increase mass; ATK/DEF preserve the
 * simulation's 55/45 combat-quality weighting.
 */
export function countryMasteredMilitaryPowerV1(
  profile: CommanderProfileV1,
  country: CommanderCountryCatalogEntryV1,
): number {
  const effects = resolveCountryLoadoutV1(profile, country.id).masteryMilitary;
  const baseQuality = 0.55 * country.opening.attack + 0.45 * country.opening.defense;
  const masteredQuality = 0.55 * country.opening.attack * effects.attackMultiplier
    + 0.45 * country.opening.defense * effects.defenseMultiplier;
  const qualityMultiplier = baseQuality > 0 ? masteredQuality / baseQuality : 1;
  return Math.max(0, country.militaryPower
    * effects.openingArmyMultiplier
    * effects.armyCapacityMultiplier
    * qualityMultiplier);
}

export function ordinalV1(value: number): string {
  const whole = Math.max(0, Math.round(value));
  const lastTwo = whole % 100;
  const suffix = lastTwo >= 11 && lastTwo <= 13 ? 'th'
    : whole % 10 === 1 ? 'st'
      : whole % 10 === 2 ? 'nd'
        : whole % 10 === 3 ? 'rd' : 'th';
  return `${whole}${suffix}`;
}

export function strongestUnlockedCountryIdV1(
  profile: CommanderProfileV1,
  countries: readonly CommanderCountryCatalogEntryV1[],
): string | undefined {
  const unlocked = new Set(profile.unlockedCountryIds);
  return [...countries]
    .filter((country) => unlocked.has(country.id))
    .sort((left, right) => countryMasteredMilitaryPowerV1(profile, right)
      - countryMasteredMilitaryPowerV1(profile, left)
      || left.quote.strengthRank - right.quote.strengthRank
      || left.name.localeCompare(right.name, 'en'))[0]?.id;
}

export function commanderCountryRosterGroupV1(
  profile: CommanderProfileV1,
  country: CommanderCountryCatalogEntryV1,
): CommanderCountryRosterGroupV1 {
  if (profile.unlockedCountryIds.includes(country.id)) return 'owned';
  return 'locked';
}

export interface CommanderProgressionTargetV1 {
  country: CommanderCountryCatalogEntryV1;
  access: 'land' | 'naval';
}

/**
 * Picks the next locked country from routes the current empire can actually
 * use. Land access and weaker military power keep the recommendation useful.
 */
export function nextCommanderProgressionTargetV1(
  profile: CommanderProfileV1,
  countries: readonly CommanderCountryCatalogEntryV1[],
  originCountryIds: readonly string[],
): CommanderProgressionTargetV1 | undefined {
  const countryById = new Map(countries.map((country) => [country.id, country]));
  const owned = new Set(profile.unlockedCountryIds);
  const accessByCountry = new Map<string, 'land' | 'naval'>();
  for (const originId of new Set(originCountryIds)) {
    for (const route of countryById.get(originId)?.strategicAccess ?? []) {
      if (owned.has(route.countryId) || !countryById.has(route.countryId)) continue;
      const existing = accessByCountry.get(route.countryId);
      if (!existing || (existing === 'naval' && route.kind === 'land')) {
        accessByCountry.set(route.countryId, route.kind);
      }
    }
  }
  const candidates = [...accessByCountry].flatMap(([countryId, access]) => {
    const country = countryById.get(countryId);
    return country ? [{ country, access }] : [];
  });
  return candidates.sort((left, right) => (
    Number(left.access === 'naval') - Number(right.access === 'naval')
      || right.country.quote.strengthRank - left.country.quote.strengthRank
      || left.country.name.localeCompare(right.country.name, 'en')
  ))[0];
}

export interface CommanderLevelProgressV1 {
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progressPercent: number;
  availableTalentPoints: number;
}

export function commanderLevelProgressV1(profile: CommanderProfileV1): CommanderLevelProgressV1 {
  const level = Math.max(1, profile.commanderLevel);
  const currentLevelXp = commanderXpForLevelV1(level);
  const nextLevelXp = commanderXpForLevelV1(level + 1);
  const xpIntoLevel = Math.max(0, profile.commanderXp - currentLevelXp);
  const xpForNextLevel = Math.max(0, nextLevelXp - currentLevelXp);
  return {
    level,
    currentLevelXp,
    nextLevelXp,
    xpIntoLevel,
    xpForNextLevel,
    progressPercent: Math.max(0, Math.min(100, Math.round(
      100 * xpIntoLevel / Math.max(1, xpForNextLevel),
    ))),
    availableTalentPoints: commanderTalentPointsAvailableV1(profile),
  };
}

export function renderCommanderTalentBranchesV1(
  profile: CommanderProfileV1,
  selectedTalentId: CommanderTalentId = 'science-corps',
): string {
  const selectedTalent = COMMANDER_TALENTS_V1.find((talent) => talent.id === selectedTalentId)
    ?? COMMANDER_TALENTS_V1[0]!;
  const selectedRank = profile.commanderTalents[selectedTalent.id] ?? 0;
  const selectedQuote = commanderTalentAllocationQuoteV1(profile, selectedTalent.id);
  const selectedBranch = TALENT_BRANCH_PRESENTATION[selectedTalent.branch];
  const selectedPips = Array.from({ length: selectedTalent.coreRank }, (_, index) => (
    `<i class="${index < selectedRank ? 'is-filled' : ''}"></i>`
  )).join('');
  const selectedMilestones = selectedTalent.milestones.map((milestone) => (
    `<li class="${selectedRank >= milestone.rank ? 'is-unlocked' : ''}"><b>R${milestone.rank} · ${escapeHtml(milestone.label)}</b><span>${escapeHtml(milestone.description)}</span></li>`
  )).join('');
  const prerequisiteCopy = selectedTalent.prerequisites.length === 0
    ? 'ROOT NODE · AVAILABLE FROM APEX LEVEL 1'
    : selectedTalent.prerequisites.map((prerequisite) => {
      const definition = COMMANDER_TALENTS_V1.find((entry) => entry.id === prerequisite.talentId)!;
      return `${definition.label} Rank ${prerequisite.rank}`;
    }).join(' + ');
  const inspectorState = selectedQuote.available
    ? 'AVAILABLE NOW'
    : selectedQuote.unmetPrerequisite ? 'BRANCH LOCKED'
      : profile.commanderLevel < selectedQuote.requiredLevel
        ? `APEX LEVEL ${selectedQuote.requiredLevel}` : 'NO FREE POINT';
  const inspector = `<section class="commander-talent-inspector commander-talent-inspector--${selectedTalent.branch}" style="--branch:${selectedTalent.branch === 'lancer' ? '#ff9b66' : selectedTalent.branch === 'aegis' ? '#67e6ff' : '#c88cff'}">
    <header><div><span>${selectedBranch.label.toUpperCase()} · TIER ${selectedTalent.tier}</span><h2>${escapeHtml(selectedTalent.label)}</h2><p>${escapeHtml(selectedTalent.description)}</p></div><b>${inspectorState}</b></header>
    <div class="commander-talent-inspector__stats"><article><small>CURRENT · RANK ${selectedRank}</small><strong>${escapeHtml(commanderTalentEffectCopyV1(selectedTalent.id, selectedRank, 'current'))}</strong></article><article class="is-next"><small>NEXT RANK · ${selectedQuote.targetRank} · LV ${selectedQuote.requiredLevel}</small><strong>${escapeHtml(commanderTalentEffectCopyV1(selectedTalent.id, selectedRank, 'next'))}</strong></article></div>
    <div class="commander-talent-inspector__path"><span>PATH REQUIREMENT</span><strong>${escapeHtml(prerequisiteCopy)}</strong><small>${escapeHtml(selectedQuote.reason ?? selectedTalent.perRank)}</small></div>
    <ol class="commander-talent-inspector__milestones">${selectedMilestones}</ol>
    <footer><em>${selectedPips}</em><button data-action="allocate-commander-talent" data-talent="${selectedTalent.id}" ${selectedQuote.available ? '' : 'disabled'}>${selectedQuote.available ? 'ADD SHIELD POINT · 1 PT' : inspectorState}</button></footer>
  </section>`;

  const lanes = (Object.keys(TALENT_BRANCH_PRESENTATION) as CommanderTalentBranchV1[]).map((branch) => {
    const presentation = TALENT_BRANCH_PRESENTATION[branch];
    const nodes = COMMANDER_TALENTS_V1
      .filter((talent) => talent.branch === branch)
      .sort((left, right) => left.tier - right.tier)
      .map((talent) => {
        const rank = profile.commanderTalents[talent.id] ?? 0;
        const quote = commanderTalentAllocationQuoteV1(profile, talent.id);
        const selected = talent.id === selectedTalent.id;
        const locked = Boolean(quote.unmetPrerequisite)
          || profile.commanderLevel < quote.requiredLevel;
        const nodeState = locked ? quote.unmetPrerequisite ? 'LOCKED' : `LV ${quote.requiredLevel}`
          : quote.available ? 'AVAILABLE' : rank > 0 ? 'INVESTED' : 'READY';
        const nodeClasses = [
          selected ? 'is-selected' : '', rank > 0 ? 'is-invested' : '',
          quote.available ? 'is-available' : '', locked ? 'is-locked' : '',
          rank >= talent.coreRank ? 'is-core-complete' : '',
        ].filter(Boolean).join(' ');
        return `<button type="button" class="commander-talent-node ${nodeClasses}" data-action="inspect-commander-talent" data-talent="${talent.id}" data-talent-card="${talent.id}" aria-pressed="${selected}" aria-label="Inspect ${escapeHtml(talent.label)}"><i>${talent.tier}</i><span><small>TIER ${talent.tier}</small><strong>${escapeHtml(talent.label)}</strong><em>RANK ${rank}${rank >= talent.coreRank ? ' · ENDLESS' : ''}</em></span><b>${nodeState}</b></button>`;
      }).join('');
    const doctrine = COMMANDER_DOCTRINES_V1.find((entry) => (
      entry.id === TALENT_BRANCH_DOCTRINE[branch]
    ))!;
    const doctrineRank = profile.commanderTalents[doctrine.requirement.talentId] ?? 0;
    const doctrineReady = doctrineRank >= doctrine.requirement.rank;
    const doctrineActive = profile.activeDoctrine === doctrine.id;
    const doctrineButton = doctrineActive ? 'ACTIVE PROTOCOL'
      : doctrineReady ? 'ACTIVATE PROTOCOL' : 'CAPSTONE LOCKED';
    return `<section class="commander-talent-lane commander-talent-lane--${branch}">
      <header><i>${presentation.icon}</i><div><span>${presentation.kicker}</span><h2>${presentation.label}</h2><p>${presentation.description}</p></div></header>
      <div class="commander-talent-lane__nodes">${nodes}</div>
      <article class="commander-talent-protocol ${doctrineActive ? 'is-active' : ''} ${doctrineReady ? 'is-ready' : 'is-locked'}"><i class="commander-talent-protocol__glyph" aria-hidden="true"><b></b><em></em></i><span>CAPSTONE ABILITY${doctrineActive ? ' · ACTIVE' : ''}</span><strong>${escapeHtml(doctrine.label)}</strong><p>${escapeHtml(doctrine.description)}</p><small>${doctrineActive ? 'ACTIVE · MUTUALLY EXCLUSIVE' : doctrineReady ? 'CAPSTONE ONLINE · MUTUALLY EXCLUSIVE' : `REQUIRES ${escapeHtml(doctrine.requirement.label)}`}</small><button data-action="select-commander-doctrine" data-doctrine="${doctrine.id}" ${doctrineActive || !doctrineReady ? 'disabled' : ''}>${doctrineButton}</button></article>
    </section>`;
  }).join('');

  return `<section class="commander-shield-tree" aria-label="APEX neural shield specialization tree">
    <header class="commander-shield-core"><i aria-hidden="true"><b>AX</b></i><div><span>NEURAL ENERGY SHIELD</span><strong>APEX CORE</strong><small>One dome · three specialization paths · one active capstone protocol</small></div><b>${commanderTalentPointsAvailableV1(profile)} <small>SHIELD POINT${commanderTalentPointsAvailableV1(profile) === 1 ? '' : 'S'}</small></b></header>
    ${inspector}
    <div class="commander-talent-lanes">${lanes}</div>
  </section>`;
}

interface CommanderMenuScrollPositionV1 {
  readonly top: number;
  readonly left: number;
}

interface CommanderMenuRenderStateV1 {
  readonly pageTop: number;
  readonly pageLeft: number;
  readonly focusKey?: string;
  readonly focusScrollSession?: string;
}

export class CommanderMenuV1 {
  private readonly host: HTMLElement;
  private profile: CommanderProfileV1;
  private view: CommanderMenuView = 'home';
  private selectedCountryId?: string;
  private selectedTalentId: CommanderTalentId = 'science-corps';
  private search = '';
  private readonly scrollPositions = new Map<string, CommanderMenuScrollPositionV1>();
  private pendingFocusCountryId?: string;
  private statusMessage = '';
  private arsenalReturnView: Extract<CommanderMenuView, 'home' | 'country'> = 'home';
  private deleteConfirmationOpen = false;
  private resetConfirmationOpen = false;
  private activeCampaignChoiceOpen = false;
  private multiplayerDeployment = false;

  constructor(private readonly options: CommanderMenuOptionsV1) {
    this.host = document.querySelector<HTMLElement>('#hud')!;
    this.profile = options.profile;
    this.selectedCountryId = strongestUnlockedCountryIdV1(this.profile, options.countries)
      ?? options.countries.at(-1)?.id;
    this.view = 'home';
    this.host.classList.add('commander-menu-host');
    this.host.addEventListener('click', this.onClick);
    this.host.addEventListener('input', this.onInput);
    this.host.addEventListener('keydown', this.onKeyDown);
    this.render();
  }

  destroy(): void {
    this.host.removeEventListener('click', this.onClick);
    this.host.removeEventListener('input', this.onInput);
    this.host.removeEventListener('keydown', this.onKeyDown);
    this.host.classList.remove('commander-menu-host');
    this.host.innerHTML = '';
  }

  updateCampaign(campaign?: StoredCampaignV1): void {
    this.options.campaign = campaign;
    this.render();
  }

  openArsenal(countryId?: string): void {
    if (countryId && this.options.countries.some((country) => country.id === countryId)) {
      this.selectedCountryId = countryId;
    }
    this.arsenalReturnView = 'home';
    this.view = 'arsenal';
    this.search = '';
    this.resetScrollSession('commander:country-list');
    this.statusMessage = '';
    this.render();
  }

  private readonly onInput = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.id === 'commander-arsenal-search') {
      this.search = target.value;
      this.renderArsenalListOnly();
    }
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>('.commander-country-row') : null;
    if (target && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      const rows = [...this.host.querySelectorAll<HTMLButtonElement>('.commander-country-row')];
      const currentIndex = rows.indexOf(target);
      if (currentIndex < 0 || rows.length === 0) return;
      event.preventDefault();
      const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1
        : event.key === 'ArrowDown' ? Math.min(rows.length - 1, currentIndex + 1)
          : Math.max(0, currentIndex - 1);
      const countryId = rows[nextIndex]?.dataset.country;
      if (!countryId) return;
      this.selectedCountryId = countryId;
      this.pendingFocusCountryId = countryId;
      this.render();
      return;
    }
    if (!['PageDown', 'PageUp', 'Home', 'End'].includes(event.key)) return;
    const scrollRegion = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-commander-scroll]') : null;
    if (!scrollRegion) return;
    event.preventDefault();
    const maximum = Math.max(0, scrollRegion.scrollHeight - scrollRegion.clientHeight);
    const page = Math.max(160, Math.round(scrollRegion.clientHeight * 0.82));
    scrollRegion.scrollTop = event.key === 'Home' ? 0 : event.key === 'End' ? maximum
      : Math.max(0, Math.min(maximum, scrollRegion.scrollTop
        + (event.key === 'PageDown' ? page : -page)));
  };

  private readonly onClick = (event: MouseEvent): void => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-action]') : null;
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'open-arsenal') {
      this.arsenalReturnView = 'home';
      this.view = 'arsenal';
      this.statusMessage = '';
      this.render();
      return;
    }
    if (action === 'open-country-picker') {
      if (this.options.campaign) {
        this.activeCampaignChoiceOpen = true;
        this.render();
        return;
      }
      this.multiplayerDeployment = false;
      this.selectedCountryId = strongestUnlockedCountryIdV1(this.profile, this.options.countries)
        ?? this.selectedCountryId;
      this.view = 'country';
      this.search = '';
      this.resetScrollSession('commander:start-country-list');
      this.statusMessage = '';
      this.render();
      return;
    }
    if (action === 'cancel-active-campaign-choice') {
      this.activeCampaignChoiceOpen = false;
      this.render();
      return;
    }
    if (action === 'surrender-active-campaign') {
      this.activeCampaignChoiceOpen = false;
      this.options.onSurrenderCampaign();
      return;
    }
    if (action === 'toggle-multiplayer') {
      if (!this.options.onMultiplayerRequested) return;
      this.multiplayerDeployment = !this.multiplayerDeployment;
      this.render();
      return;
    }
    if (action === 'resume-multiplayer') {
      this.options.onResumeMultiplayer?.();
      return;
    }
    if (action === 'discard-multiplayer-resume') {
      this.options.onDiscardMultiplayerResume?.();
      this.options.multiplayerResume = undefined;
      this.render();
      return;
    }
    if (action === 'back-to-country') {
      this.view = 'country';
      this.statusMessage = '';
      this.render();
      return;
    }
    if (action === 'open-selected-country-arsenal') {
      this.arsenalReturnView = 'country';
      this.view = 'arsenal';
      this.search = '';
      this.resetScrollSession('commander:country-list');
      this.statusMessage = '';
      this.render();
      return;
    }
    if (action === 'return-from-arsenal') {
      this.view = this.arsenalReturnView;
      this.statusMessage = '';
      this.render();
      return;
    }
    if (action === 'open-talents') {
      this.view = 'talents';
      this.statusMessage = '';
      this.render();
      return;
    }
    if (action === 'home') {
      this.view = 'home';
      this.activeCampaignChoiceOpen = false;
      this.multiplayerDeployment = false;
      this.statusMessage = '';
      this.render();
      return;
    }
    if (action === 'confirm-start-country') {
      const countryId = target.dataset.country ?? this.selectedCountryId;
      if (!countryId || !this.profile.unlockedCountryIds.includes(countryId)) {
        this.statusMessage = 'Only a nation in your command roster can deploy.';
        this.render();
        return;
      }
      this.selectedCountryId = countryId;
      this.view = 'mode';
      this.statusMessage = '';
      this.render();
      return;
    }
    if (action === 'start-mode') {
      const countryId = this.selectedCountryId;
      if (!countryId || !this.profile.unlockedCountryIds.includes(countryId)) {
        this.view = 'country';
        this.statusMessage = 'Choose an owned nation before selecting a mode.';
        this.render();
        return;
      }
      const mode = target.dataset.mode as GameModeV2;
       if (MODE_PRESENTATION[mode]) {
         if (this.multiplayerDeployment && this.options.onMultiplayerRequested) {
           this.options.onMultiplayerRequested(mode, countryId);
         } else {
           this.options.onStartMode(mode, countryId, false);
         }
       }
      return;
    }
    if (action === 'continue-campaign') {
      this.options.onContinueCampaign();
      return;
    }
    if (action === 'delete-campaign') {
      this.deleteConfirmationOpen = true;
      this.render();
      return;
    }
    if (action === 'cancel-delete-campaign') {
      this.deleteConfirmationOpen = false;
      this.render();
      return;
    }
    if (action === 'confirm-delete-campaign') {
      this.options.onDeleteCampaign();
      this.deleteConfirmationOpen = false;
      this.options.campaign = undefined;
      this.activeCampaignChoiceOpen = false;
      this.multiplayerDeployment = false;
      this.statusMessage = 'Campaign save removed.';
      this.render();
      return;
    }
    if (action === 'open-reset-account') {
      this.resetConfirmationOpen = true;
      this.render();
      return;
    }
    if (action === 'cancel-reset-account') {
      this.resetConfirmationOpen = false;
      this.render();
      return;
    }
    if (action === 'confirm-reset-account') {
      this.resetConfirmationOpen = false;
      this.options.onResetAccount();
      return;
    }
    if (action === 'rename-commander') {
      const input = this.host.querySelector<HTMLInputElement>('#commander-name');
      if (!input) return;
      this.consumeProgressionResult(this.options.onRenameCommander(input.value));
      return;
    }
    if (action === 'rename-empire') {
      const input = this.host.querySelector<HTMLInputElement>('#empire-account-name');
      if (!input) return;
      this.consumeProgressionResult(
        this.options.onRenameEmpire(input.value),
        'Empire identity saved for every new solo campaign.',
      );
      return;
    }
    if (action === 'select-meta-country') {
      this.selectedCountryId = target.dataset.country;
      this.pendingFocusCountryId = this.selectedCountryId;
      this.render();
      return;
    }
    if (action === 'inspect-commander-talent') {
      const talentId = target.dataset.talent as CommanderTalentId | undefined;
      if (talentId && COMMANDER_TALENTS_V1.some((talent) => talent.id === talentId)) {
        this.selectedTalentId = talentId;
        this.statusMessage = '';
        this.render();
      }
      return;
    }
    if (action === 'allocate-country-mastery') {
      const countryId = target.dataset.country;
      const track = target.dataset.track as CountryMasteryTrackV1 | undefined;
      if (countryId && track && COUNTRY_MASTERY_TRACK_IDS_V1.includes(track)) {
        this.consumeProgressionResult(
          this.options.onAllocateCountryMasteryPoint(countryId, track),
          `${COUNTRY_MASTERY_PRESENTATION[track].label} mastery increased.`,
        );
      }
      return;
    }
    if (action === 'respec-country-mastery') {
      const countryId = target.dataset.country;
      if (countryId) {
        this.consumeProgressionResult(
          this.options.onRespecCountryMastery(countryId),
          'All country mastery points refunded for free.',
        );
      }
      return;
    }
    if (action === 'allocate-commander-talent') {
      const talentId = target.dataset.talent as CommanderTalentId | undefined;
      if (talentId && COMMANDER_TALENTS_V1.some((talent) => talent.id === talentId)) {
        this.selectedTalentId = talentId;
        this.consumeProgressionResult(
          this.options.onAllocateCommanderTalent(talentId),
          'Shield point assigned. The effect will apply to every new campaign.',
        );
      }
      return;
    }
    if (action === 'select-commander-doctrine') {
      const doctrine = target.dataset.doctrine as CommanderDoctrineV1 | undefined;
      if (doctrine && COMMANDER_DOCTRINES_V1.some((entry) => entry.id === doctrine)) {
        this.consumeProgressionResult(
          this.options.onSelectCommanderDoctrine(doctrine),
          'Active capstone protocol saved. It will be frozen into every new campaign.',
        );
      }
      return;
    }
    if (action === 'respec-commander-talents') {
      this.consumeProgressionResult(
        this.options.onRespecCommanderTalents(),
        'All shield points refunded for free. APEX level and XP are unchanged.',
      );
    }
  };

  private consumeProgressionResult(
    result: ProgressionActionResultV1,
    acceptedMessage = 'APEX profile saved.',
  ): void {
    this.profile = result.profile;
    this.statusMessage = result.accepted ? acceptedMessage : result.reason ?? 'Action unavailable.';
    this.render();
  }

  private resetScrollSession(session: string): void {
    this.scrollPositions.set(session, { top: 0, left: 0 });
  }

  private captureScrollPositions(): void {
    if (typeof this.host.querySelectorAll !== 'function') return;
    for (const region of this.host.querySelectorAll<HTMLElement>(
      '[data-commander-scroll][data-scroll-session]',
    )) {
      const session = region.dataset.scrollSession;
      if (!session) continue;
      this.scrollPositions.set(session, {
        top: Math.max(0, region.scrollTop),
        left: Math.max(0, region.scrollLeft),
      });
    }
  }

  private focusKey(element: Element): string | undefined {
    const htmlElement = element as HTMLElement;
    if (htmlElement.id) return `id:${htmlElement.id}`;
    const dataset = htmlElement.dataset;
    if (!dataset?.action) return undefined;
    const identityKeys = ['action', 'country', 'talent', 'track', 'doctrine', 'mode'];
    return identityKeys.flatMap((key) => {
      const value = dataset[key];
      return value === undefined ? [] : [`${key}:${value}`];
    }).join('|');
  }

  private captureRenderState(): CommanderMenuRenderStateV1 {
    this.captureScrollPositions();
    const scrollingElement = typeof document !== 'undefined'
      ? document.scrollingElement as HTMLElement | null : null;
    const pageTop = typeof window !== 'undefined' && Number.isFinite(window.scrollY)
      ? window.scrollY : scrollingElement?.scrollTop ?? 0;
    const pageLeft = typeof window !== 'undefined' && Number.isFinite(window.scrollX)
      ? window.scrollX : scrollingElement?.scrollLeft ?? 0;
    const activeElement = typeof document !== 'undefined' ? document.activeElement : null;
    const activeInMenu = activeElement instanceof Element
      && (typeof this.host.contains !== 'function' || this.host.contains(activeElement));
    const focusElement = activeInMenu
      ? activeElement.closest<HTMLElement>('[data-action], [id]') : null;
    const focusScrollSession = focusElement
      ?.closest<HTMLElement>('[data-scroll-session]')?.dataset.scrollSession;
    return {
      pageTop,
      pageLeft,
      focusKey: focusElement ? this.focusKey(focusElement) : undefined,
      focusScrollSession,
    };
  }

  private restoreScrollPositions(): void {
    if (typeof this.host.querySelectorAll !== 'function') return;
    for (const region of this.host.querySelectorAll<HTMLElement>(
      '[data-commander-scroll][data-scroll-session]',
    )) {
      const session = region.dataset.scrollSession;
      const position = session ? this.scrollPositions.get(session) : undefined;
      if (!position) continue;
      region.scrollTop = position.top;
      region.scrollLeft = position.left;
    }
  }

  private restoreFocus(state: CommanderMenuRenderStateV1): boolean {
    if (!state.focusKey || typeof this.host.querySelectorAll !== 'function') return false;
    const controls = this.host.querySelectorAll<HTMLElement>('[data-action], [id]');
    const match = [...controls].find((control) => this.focusKey(control) === state.focusKey);
    const talentId = state.focusKey.match(/(?:^|\|)talent:([^|]+)/)?.[1];
    const talentNode = talentId ? [...controls].find((control) => (
      control.dataset.action === 'inspect-commander-talent'
        && control.dataset.talent === talentId
        && !(control as HTMLButtonElement).disabled
    )) : undefined;
    const focusTarget = match && !(match as HTMLButtonElement).disabled
      ? match
      : talentNode ?? (state.focusScrollSession
        ? [...this.host.querySelectorAll<HTMLElement>('[data-scroll-session]')]
          .find((region) => region.dataset.scrollSession === state.focusScrollSession)
        : undefined);
    if (!focusTarget || typeof focusTarget.focus !== 'function') return false;
    focusTarget.focus({ preventScroll: true });
    return true;
  }

  private restorePageScroll(state: CommanderMenuRenderStateV1): void {
    const scrollingElement = typeof document !== 'undefined'
      ? document.scrollingElement as HTMLElement | null : null;
    if (scrollingElement) {
      scrollingElement.scrollTop = state.pageTop;
      scrollingElement.scrollLeft = state.pageLeft;
    }
    if (typeof window === 'undefined' || typeof window.scrollTo !== 'function') return;
    try {
      window.scrollTo({ top: state.pageTop, left: state.pageLeft, behavior: 'auto' });
    } catch {
      window.scrollTo(state.pageLeft, state.pageTop);
    }
  }

  private render(): void {
    const renderState = this.captureRenderState();
    this.host.innerHTML = this.view === 'home' ? this.renderHome()
      : this.view === 'country' ? this.renderCountrySelection()
        : this.view === 'mode' ? this.renderModeSelection()
          : this.view === 'arsenal' ? this.renderArsenal() : this.renderTalents();
    this.restoreScrollPositions();
    let focused = false;
    if (this.pendingFocusCountryId) {
      const countryRow = this.host.querySelector<HTMLButtonElement>(
        `.commander-country-row[data-country="${this.pendingFocusCountryId}"]`,
      );
      if (countryRow && typeof countryRow.focus === 'function') {
        countryRow.focus({ preventScroll: true });
        focused = true;
      }
      this.pendingFocusCountryId = undefined;
    }
    if (!focused) this.restoreFocus(renderState);
    // Replacing a focused button can make browsers move the page before the
    // new control receives focus. Restore the page last so same-view talent
    // investments never jump the surrounding document.
    this.restorePageScroll(renderState);
  }

  private renderProfileStrip(linkToTalents = true): string {
    const progress = commanderLevelProgressV1(this.profile);
    const xpLabel = `${compact(progress.xpIntoLevel)} / ${compact(progress.xpForNextLevel)} XP`;
    const levelContent = `<span><small>APEX LEVEL</small><strong>LV ${progress.level}</strong></span><span class="commander-profile-strip__xp"><b style="--progress:${progress.progressPercent}%"><i></i></b><em>${xpLabel}</em></span>${progress.availableTalentPoints > 0 ? `<mark>${progress.availableTalentPoints} PT${progress.availableTalentPoints === 1 ? '' : 'S'} FREE</mark>` : ''}`;
    return `<header class="commander-profile-strip">
      <div class="commander-profile-strip__identity"><i>AX</i><div><small>GLOBAL APEX ACCOUNT</small><strong>${escapeHtml(this.profile.displayName)}</strong></div></div>
      ${linkToTalents ? `<button class="commander-profile-strip__level" data-action="open-talents" aria-label="Open APEX shield specialization">${levelContent}</button>` : `<div class="commander-profile-strip__level is-static">${levelContent}</div>`}
      <div class="commander-profile-strip__record"><span><b>${this.profile.unlockedCountryIds.length}</b> nations</span><span><b>${this.profile.victories}</b> victories</span><span><b>${this.profile.completedCampaigns}</b> campaigns</span></div>
    </header>`;
  }

  private renderHome(): string {
    const campaign = this.options.campaign;
    const multiplayerResume = this.options.multiplayerResume;
    const strongestUnlockedId = strongestUnlockedCountryIdV1(this.profile, this.options.countries);
    const flagship = this.options.countries.find((country) => country.id === strongestUnlockedId);
    const flagshipPower = flagship
      ? countryMasteredMilitaryPowerV1(this.profile, flagship) : 0;
    const starterCountry = this.options.countries.find((country) => country.quote.starterEligible);
    const activeCountry = campaign
      ? this.options.countries.find((country) => country.id === campaign.countryId) : undefined;
    const multiplayerCountry = multiplayerResume
      ? this.options.countries.find((country) => country.id === multiplayerResume.countryId) : undefined;
    const summaryCountry = activeCountry ?? flagship;
    const byPower = (
      left: CommanderCountryCatalogEntryV1,
      right: CommanderCountryCatalogEntryV1,
    ): number => left.quote.strengthRank - right.quote.strengthRank
      || right.militaryPower - left.militaryPower
      || left.name.localeCompare(right.name, 'en');
    const lockedCountries = this.options.countries.filter((country) => (
      commanderCountryRosterGroupV1(this.profile, country) === 'locked'
    )).sort(byPower);
    const campaignIntel = campaign ? campaignDashboardSnapshotV1(campaign) : undefined;
    const progressionOrigins = campaignIntel?.controlledCountryIds.length
      ? campaignIntel.controlledCountryIds
      : flagship ? [flagship.id] : [];
    const nextProgressionTarget = nextCommanderProgressionTargetV1(
      this.profile,
      this.options.countries,
      progressionOrigins,
    );
    const nextProgression = nextProgressionTarget?.country;
    const loadout = campaign?.loadout ?? (summaryCountry
      ? resolveCountryLoadoutV1(this.profile, summaryCountry.id) : undefined);
    const force = loadout ? resolveCommanderForceInitializationV1(loadout) : undefined;
    const corpsPower = force ? 1_000 * force.manpower
      * (0.55 * force.baseAttack + 0.45 * force.baseDefense) : 0;
    const commanderProgress = commanderLevelProgressV1(this.profile);
    const totalUnspentMasteryPoints = this.profile.unlockedCountryIds.reduce((total, countryId) => (
      total + resolveCountryLoadoutV1(this.profile, countryId).masteryPointsAvailable
    ), 0);
    const homeCountry = multiplayerCountry ?? activeCountry ?? flagship;
    const homeMode = campaign ? MODE_PRESENTATION[campaign.scenario.mode] : undefined;
    const multiplayerMode = multiplayerResume ? MODE_PRESENTATION[multiplayerResume.mode] : undefined;
    const campaignShieldPercent = campaignIntel
      ? Math.max(0, Math.min(100, Math.round(100 * campaignIntel.shieldIntegrity / Math.max(
        0.000_001,
        campaignIntel.maxShieldIntegrity || campaignIntel.shieldIntegrity,
      )))) : 0;
    const campaignIntelHtml = !multiplayerResume && campaign && campaignIntel ? `<section class="commander-theater__intel" aria-label="Active campaign intelligence">
      <span><small>TERRITORIES</small><b>${campaignIntel.territoryCount}</b></span>
      <span><small>ACTIVE ARMY</small><b>${peopleFromMillions(campaignIntel.deployedArmy)}</b></span>
      <span><small>TREASURY</small><b>${moneyFromBillions(campaignIntel.treasury)}</b></span>
      <span><small>ACTIVE WARS</small><b>${campaignIntel.activeWars}</b></span>
      <span><small>SHIELD INTEGRITY</small><b>${campaignShieldPercent}%</b></span>
      <span><small>${campaign.scenario.mode === 'survival' ? 'MACHINE OFFENSIVE' : 'SIGNAL PURGES'}</small><b>${campaign.scenario.mode === 'survival' ? `WAVE ${campaignIntel.globalWave} · CORE ${Math.round(campaignIntel.coreIntegrity)}%` : campaign.signalPurgedCountryIds.length}</b></span>
    </section>` : '';
    const theaterStatus = multiplayerResume
      ? '<span>MULTIPLAYER SEAT RESERVED</span><b>REJOIN AVAILABLE</b>'
      : campaign ? `<span>ACTIVE ${escapeHtml(homeMode!.label.toUpperCase())} OPERATION</span><b>${escapeHtml(homeMode!.badge)}</b>`
      : '<span>COMMAND NETWORK ONLINE</span><b>READY FOR DEPLOYMENT</b>';
    const theaterFlag = homeCountry
      ? `<i class="country-flag">${countryFlagHtml(homeCountry.id, homeCountry.sigil, true)}</i>`
      : '<i class="commander-theater__fallback-mark">FC</i>';
    const deploymentRouteHtml = !campaign && !multiplayerResume && flagship
      ? `<section class="commander-theater__deployment-route" aria-label="Deployment route">
          <article class="is-flagship"><small>${flagship.quote.starterEligible ? 'FREE STARTER NATION' : 'YOUR FLAGSHIP'}</small><span><i class="country-flag">${countryFlagHtml(flagship.id, flagship.sigil)}</i><strong>${escapeHtml(flagship.shortName)}</strong></span><b>${compact(flagshipPower)} <em>POWER</em></b></article>
          <i class="commander-theater__route-line" aria-hidden="true"><span></span><b>→</b></i>
          <article><small>DEPLOYMENT SEQUENCE</small><strong>CHOOSE MISSION</strong><b>CAMPAIGN · SURVIVAL <em>· FUN MODE</em></b></article>
        </section>`
      : '';
    const primaryOperation = multiplayerResume
      ? `<section class="commander-theater__save-choice is-multiplayer-rejoin"><div><span>ACTIVE MULTIPLAYER MATCH</span><strong>${escapeHtml(multiplayerCountry?.shortName ?? multiplayerResume.countryId.toUpperCase())} · ${escapeHtml(multiplayerMode!.label)}</strong><small>Reconnect to the same reserved country and synchronize the host's latest week.</small></div><button class="primary-button" data-action="resume-multiplayer">REJOIN MATCH</button><button class="ghost-button" data-action="discard-multiplayer-resume">LEAVE MATCH</button></section>`
      : campaign && this.activeCampaignChoiceOpen
      ? `<section class="commander-theater__save-choice"><div><span>END ACTIVE TIMELINE?</span><strong>APEX secures the campaign record.</strong><small>Earned APEX XP and Nation Mastery XP are settled exactly like any completed run.</small></div><button class="primary-button" data-action="continue-campaign">CONTINUE CURRENT</button><button class="secondary-button" data-action="surrender-active-campaign">END &amp; CLAIM PROGRESS</button><button class="ghost-button" data-action="cancel-active-campaign-choice">CANCEL</button></section>`
      : campaign ? `<div class="commander-theater__actions"><button class="primary-button commander-theater__primary" data-action="continue-campaign"><span>RETURN TO THE FRONT</span><strong>CONTINUE CAMPAIGN</strong></button><button class="secondary-button" data-action="open-country-picker">START NEW TIMELINE</button></div>`
      : '<div class="commander-theater__actions"><button class="primary-button commander-theater__primary" data-action="open-country-picker"><span>NATION FIRST · MODE SECOND</span><strong>CHOOSE YOUR NATION →</strong></button></div>';
    const nextProgressionHtml = nextProgression ? `<div class="commander-strategy-strip__progression">
      <i class="country-flag">${countryFlagHtml(nextProgression.id, nextProgression.sigil)}</i><div><small>NEXT PROGRESSION · ${nextProgressionTarget!.access === 'land' ? 'LAND BORDER' : 'NAVAL ROUTE'}</small><strong>${escapeHtml(nextProgression.shortName)}</strong><span>DEFEAT IT IN CAMPAIGN TO UNLOCK</span></div>
    </div>` : lockedCountries.length > 0
      ? '<div class="commander-strategy-strip__progression"><div><small>NEXT PROGRESSION</small><strong>No direct target</strong><span>Expand the empire to open a land border or naval route.</span></div></div>'
      : '<div class="commander-strategy-strip__progression"><div><small>ROSTER STATUS</small><strong>World roster complete</strong><span>Every nation is under your command.</span></div></div>';
    const apexMetaCard = force ? `<section class="commander-meta-card commander-meta-card--apex" data-loadout-country="${summaryCountry?.id ?? ''}" data-corps-attack="${force.baseAttack}" data-corps-defense="${force.baseDefense}">
      <header><span>APEX ENERGY SHIELD</span><strong>ACCOUNT-WIDE</strong></header>
      <div class="commander-meta-card__stats"><span class="is-power"><small>POWER</small><b>${compact(corpsPower)}</b></span><span><small>SHIELD INTEGRITY</small><b>100%</b></span><span><small>MAX INTEGRITY</small><b>×${(force.capacity / BASE_COMMANDER_FORCE_V1.capacity).toFixed(2)}</b></span><span><small>ATTACK</small><b>${force.baseAttack.toFixed(2)}</b></span><span><small>DEFENSE</small><b>${force.baseDefense.toFixed(2)}</b></span></div>
      <button class="commander-meta-card__cta" data-action="open-talents">OPEN SHIELD TREE · ${commanderProgress.availableTalentPoints} FREE →</button>
    </section>` : '';
    const arsenalMetaCard = `<section class="commander-meta-card commander-meta-card--arsenal">
      <header><span>NATION ARSENAL</span><strong>NATIONAL MASTERY</strong></header>
      <div class="commander-meta-card__stats"><span class="is-power"><small>STRONGEST POWER</small><b>${compact(flagshipPower)}</b></span><span><small>OWNED</small><b>${this.profile.unlockedCountryIds.length}</b></span><span><small>FREE POINTS</small><b>${totalUnspentMasteryPoints}</b></span><span><small>MASTERY</small><b>LV ${flagship ? countryMasteryV1(this.profile, flagship.id).level : 0}</b></span><span><small>LOCKED</small><b>${lockedCountries.length}</b></span></div>
      <button class="commander-meta-card__cta" data-action="open-arsenal">OPEN NATION ARSENAL →</button>
    </section>`;
    return `<div class="commander-menu-shell commander-menu-shell--home" style="--home-country:${homeCountry?.cssColor ?? '#71e9ff'}">
      ${this.renderProfileStrip(false)}
      <main class="commander-command-center">
        <section class="commander-command-stage">
          <article class="commander-theater ${campaign ? 'has-active-operation' : 'is-deployment-ready'}">
            <div class="commander-theater__flag-echo" aria-hidden="true">${theaterFlag}</div>
            <header class="commander-theater__status">${theaterStatus}</header>
            <div class="commander-theater__deployment-core ${deploymentRouteHtml ? 'has-deployment-route' : ''}">
              <div class="commander-theater__brief">
                <span>${multiplayerResume ? 'MULTIPLAYER · REJOIN READY' : campaign ? `${escapeHtml(homeMode!.label.toUpperCase())} · WEEK ${campaignWeek(campaign)}` : 'DEPLOYMENT READY'}</span>
                <h2>${escapeHtml(multiplayerResume ? multiplayerCountry?.name ?? multiplayerResume.countryId.toUpperCase() : campaign ? activeCountry?.name ?? campaign.countryId.toUpperCase() : flagship?.name ?? 'Choose your nation')}</h2>
                <p>${multiplayerResume ? `${escapeHtml(multiplayerMode!.label)} · ${escapeHtml(multiplayerCountry?.shortName ?? multiplayerResume.countryId.toUpperCase())}` : campaign ? `Autosaved ${escapeHtml(dateLabel(campaign.updatedAt))}` : flagship ? `${compact(flagshipPower)} POWER · base ${compact(flagship.militaryPower)} · mastery LV ${countryMasteryV1(this.profile, flagship.id).level}` : 'Inspect a nation, then choose its mission.'}</p>
              </div>
              ${deploymentRouteHtml}
            </div>
            ${campaignIntelHtml}
            ${primaryOperation}
          </article>
          <section class="commander-strategy-strip" aria-label="Account strategic readiness">
            <div class="commander-strategy-strip__roster"><small>COMMAND ROSTER</small><strong>${this.profile.unlockedCountryIds.length}<em> ready</em></strong><span>${lockedCountries.length} locked · defeat each nation in Campaign</span></div>
            <div class="commander-strategy-strip__flagship">${flagship ? `<i class="country-flag">${countryFlagHtml(flagship.id, flagship.sigil)}</i><div><small>STRONGEST OWNED</small><strong>${compact(flagshipPower)} POWER</strong><span>${escapeHtml(flagship.shortName)} · Base ${compact(flagship.militaryPower)} · Mastery LV ${countryMasteryV1(this.profile, flagship.id).level}</span></div>` : '<div><small>STRONGEST OWNED</small><strong>No flagship ready</strong></div>'}</div>
            ${nextProgressionHtml}
            <div class="commander-strategy-strip__record"><small>TIMELINES</small><strong>${this.profile.completedCampaigns} COMPLETE</strong><span>${this.profile.victories} victories · ${this.profile.surrenders} manual returns</span></div>
          </section>
        </section>
        <aside class="commander-command-dossier">
          ${apexMetaCard}
          ${arsenalMetaCard}
          <details class="commander-account-settings"><summary>ACCOUNT IDENTITY &amp; RESET</summary><div><label class="commander-identity-field"><span>APEX NAME</span><div><input id="commander-name" maxlength="28" value="${escapeHtml(this.profile.displayName)}" aria-label="APEX name"><button data-action="rename-commander">SAVE</button></div></label><label class="commander-identity-field"><span>EMPIRE</span><div><input id="empire-account-name" maxlength="36" value="${escapeHtml(this.profile.empireName)}" aria-label="Empire name"><button data-action="rename-empire">SAVE</button></div></label><button class="ghost-button commander-reset-account" data-action="open-reset-account">RESET ACCOUNT &amp; SAVES</button></div></details>
        </aside>
        ${this.statusMessage ? `<div class="commander-status">${escapeHtml(this.statusMessage)}</div>` : ''}
      </main>
      ${this.deleteConfirmationOpen ? `<div class="modal-backdrop"><section class="modal-card commander-delete-modal"><div class="panel-kicker">DELETE ACTIVE SAVE</div><h2>Abandon this campaign?</h2><p>The in-progress campaign will be removed. Your nation unlocks, mastery and APEX progress remain safe.</p><div><button class="ghost-button" data-action="cancel-delete-campaign">CANCEL</button><button class="primary-button" data-action="confirm-delete-campaign">DELETE SAVE</button></div></section></div>` : ''}
      ${this.resetConfirmationOpen ? `<div class="modal-backdrop"><section class="modal-card commander-delete-modal commander-reset-modal"><div class="panel-kicker">RESET ALL LOCAL PROGRESSION</div><h2>Start over completely?</h2><p>This permanently removes the active timeline, nation unlocks, mastery XP, APEX levels and talents on this device. A new account keeps only ${escapeHtml(starterCountry?.name ?? 'its free starter nation')}.</p><div><button class="ghost-button" data-action="cancel-reset-account">KEEP MY SAVE</button><button class="primary-button" data-action="confirm-reset-account">RESET EVERYTHING</button></div></section></div>` : ''}
    </div>`;
  }

  private renderCommanderLoadoutSummary(
    country: CommanderCountryCatalogEntryV1,
    frozenLoadout?: ResolvedCountryLoadoutV1,
  ): string {
    const loadout = frozenLoadout ?? resolveCountryLoadoutV1(this.profile, country.id);
    const force = resolveCommanderForceInitializationV1(loadout);
    const doctrine = COMMANDER_DOCTRINES_V1.find((entry) => entry.id === loadout.activeDoctrine);
    const corpsPower = 1_000 * force.manpower
      * (0.55 * force.baseAttack + 0.45 * force.baseDefense);
    const nationCount = Math.max(1, this.options.countries.length);
    const averageNationAttack = this.options.countries.reduce((total, candidate) => (
      total + candidate.opening.attack
    ), 0) / nationCount;
    const averageNationDefense = this.options.countries.reduce((total, candidate) => (
      total + candidate.opening.defense
    ), 0) / nationCount;
    const capabilities = [
      force.capabilities?.mobileHeadquarters ? 'DISTRIBUTED PROJECTION' : undefined,
      force.capabilities?.fieldHospital ? 'EMERGENCY REBOOT' : undefined,
      force.capabilities?.rapidResponse ? 'TWIN PROJECTION' : undefined,
      force.capabilities?.assaultSpecialist ? 'SINGULARITY PULSE' : undefined,
      force.capabilities?.defenseSpecialist ? 'MIRROR MATRIX' : undefined,
      (force.capabilities?.emergencyExtractionCharges ?? 0) > 0
        ? `FAILSAFE SHIFT ×${force.capabilities!.emergencyExtractionCharges}` : undefined,
    ].filter((entry): entry is string => Boolean(entry));
    const reserveMultiplier = 1 + loadout.upgrades.mobilization * 0.025;
    const recruitmentSupport = Math.max(
      0,
      ((force.empireSupport?.recruitmentMultiplier ?? 1) - 1) * 100,
    );
    const reserveTrainingSupport = Math.max(
      0,
      ((force.empireSupport?.reserveTrainingMultiplier ?? 1) - 1) * 100,
    );
    return `<section class="commander-deployment-loadout" data-loadout-country="${country.id}" data-corps-manpower="${force.manpower}" data-corps-capacity="${force.capacity}" data-corps-attack="${force.baseAttack}" data-corps-defense="${force.baseDefense}">
      <header><div><span>${frozenLoadout ? 'ACTIVE SAVE · FROZEN LOADOUT' : 'DEPLOYMENT LOADOUT PREVIEW'}</span><strong>APEX DOME + ${escapeHtml(country.shortName)}</strong></div><b>APEX LV ${loadout.commanderLevel}</b></header>
      <div class="commander-deployment-loadout__corps">
        <article class="is-power"><span>APEX POWER</span><strong>${compact(corpsPower)}</strong><small>Resolved combat index</small></article>
        <article class="is-attack"><span>ATTACK</span><strong>${force.baseAttack.toFixed(2)}</strong><small>×${(force.baseAttack / Math.max(0.01, averageNationAttack)).toFixed(1)} vs nation avg</small></article>
        <article class="is-defense"><span>DEFENSE</span><strong>${force.baseDefense.toFixed(2)}</strong><small>×${(force.baseDefense / Math.max(0.01, averageNationDefense)).toFixed(1)} vs nation avg</small></article>
        <article><span>CAPSTONE PROTOCOL</span><strong>${escapeHtml(doctrine?.label ?? 'NO PROTOCOL')}</strong><small>${escapeHtml(doctrine?.role ?? 'UNASSIGNED')}</small></article>
        <article><span>SHIELD INTEGRITY</span><strong>100%</strong><small>Max Integrity ×${(force.capacity / BASE_COMMANDER_FORCE_V1.capacity).toFixed(2)} · Recharge Buffer ${talentStatNumber(100 * (force.trainedReserves ?? 0) / Math.max(0.000_001, force.capacity))}%</small></article>
      </div>
      <div class="commander-deployment-loadout__nation">
        <span><small>NATION ARMY</small><b>×${loadout.openingArmyMultiplier.toFixed(4)}</b></span>
        <span><small>NATION ECONOMY</small><b>×${loadout.openingEconomyMultiplier.toFixed(4)}</b></span>
        <span><small>TRAINED RESERVE</small><b>×${reserveMultiplier.toFixed(3)}</b></span>
        <span><small>LOGISTICS READINESS</small><b>+${talentStatNumber(recruitmentSupport)}% RECRUIT · +${talentStatNumber(reserveTrainingSupport)}% RESERVE</b></span>
        <span><small>MASTERY POINTS</small><b>${loadout.masteryPointsSpent} / ${loadout.masteryPointsEarned}</b></span>
        <span><small>MASTERY</small><b>LV ${loadout.masteryLevel}</b></span>
      </div>
      <footer>${capabilities.length > 0 ? capabilities.map((label) => `<b>${escapeHtml(label)}</b>`).join('') : '<span>No extra abilities unlocked.</span>'}</footer>
    </section>`;
  }

  private selectedCountry(): CommanderCountryCatalogEntryV1 | undefined {
    return this.options.countries.find((country) => country.id === this.selectedCountryId)
      ?? this.options.countries.find((country) => country.id === (
        strongestUnlockedCountryIdV1(this.profile, this.options.countries)
      ));
  }

  private openingPercentile(
    country: CommanderCountryCatalogEntryV1,
    key: keyof CommanderCountryCatalogEntryV1['opening'],
  ): number {
    const values = this.options.countries.map((candidate) => candidate.opening[key])
      .filter(Number.isFinite);
    if (values.length <= 1) return 50;
    const value = country.opening[key];
    const below = values.filter((candidate) => candidate < value).length;
    const equal = values.filter((candidate) => candidate === value).length;
    return Math.round(100 * (below + Math.max(0, equal - 1) / 2) / (values.length - 1));
  }

  private renderCountryOpeningIntel(country: CommanderCountryCatalogEntryV1): string {
    const stats = country.opening;
    const metric = (
      key: keyof CommanderCountryCatalogEntryV1['opening'],
      label: string,
      value: string,
      tone = '',
    ): string => {
      const standing = this.openingPercentile(country, key);
      const standingLabel = ordinalV1(standing);
      return `<article class="${tone}" style="--standing:${standing}%" title="Neutral opening standing: ${standingLabel} percentile worldwide"><span>${label}</span><strong>${escapeHtml(value)}</strong><i><b></b></i><small>${standingLabel} percentile</small></article>`;
    };
    return `<section class="commander-country-intel"><header><div><span>OPENING INTELLIGENCE</span><strong>Neutral week-one national strength</strong></div></header><div class="commander-country-intel__primary">
      ${metric('attack', 'ATK', stats.attack.toFixed(2), 'is-attack')}
      ${metric('defense', 'DEF', stats.defense.toFixed(2), 'is-defense')}
      ${metric('iq', 'IQ', stats.iq.toFixed(1), 'is-iq')}
      ${metric('armyManpower', 'DEPLOYED ARMY', peopleFromMillions(stats.armyManpower))}
      ${metric('economy', 'ECONOMY', moneyFromBillions(stats.economy), 'is-economy')}
      ${metric('treasury', 'STARTING TREASURY', moneyFromBillions(stats.treasury))}
    </div><details class="commander-country-intel__extended"><summary><span>FULL STRATEGIC INTELLIGENCE</span><b>6 MORE METRICS</b></summary><div>
      ${metric('trainedReserves', 'TRAINED RESERVE', peopleFromMillions(stats.trainedReserves))}
      ${metric('population', 'POPULATION', peopleFromMillions(stats.population))}
      ${metric('gdpPerCapita', 'GDP / CAPITA', moneyFromBillions(stats.gdpPerCapita))}
      ${metric('economicGrowth', 'ECONOMIC GROWTH', `${signedPercent(stats.economicGrowth)}/YR`)}
      ${metric('populationGrowth', 'POPULATION GROWTH', `${signedPercent(stats.populationGrowth)}/YR`)}
      ${metric('armyCapacity', 'ARMY CAPACITY', peopleFromMillions(stats.armyCapacity))}
    </div></details></section>`;
  }

  private renderCountryDeploymentDetail(country: CommanderCountryCatalogEntryV1): string {
    const unlocked = this.profile.unlockedCountryIds.includes(country.id);
    const mastery = countryMasteryV1(this.profile, country.id);
    const displayedPower = unlocked
      ? countryMasteredMilitaryPowerV1(this.profile, country) : country.militaryPower;
    return `<section class="commander-country-detail commander-country-detail--deployment ${unlocked ? 'is-owned' : 'is-locked'}" tabindex="0" role="region" aria-label="${escapeHtml(country.name)} deployment intelligence" data-commander-scroll data-scroll-session="commander:deployment-detail:${escapeHtml(country.id)}" style="--country:${country.cssColor}">
      <header><i class="country-flag country-flag--large">${countryFlagHtml(country.id, country.sigil, true)}</i><div>${unlocked ? '' : '<span>CAMPAIGN TARGET</span>'}<h2>${escapeHtml(country.name)}</h2><p><b>${compact(displayedPower)} POWER</b><span>${unlocked && displayedPower > country.militaryPower ? `Base ${compact(country.militaryPower)} · ` : ''}#${country.quote.strengthRank} military · ${escapeHtml(country.subregion)}</span></p></div>${unlocked ? `<aside><small>COUNTRY MASTERY</small><strong>LV ${mastery.level}</strong><span>${mastery.victories} victories</span></aside>` : ''}</header>
      ${unlocked ? `<div class="commander-country-detail__launch"><div><span>SELECTED FLAGSHIP</span><strong>${escapeHtml(country.shortName)} + APEX</strong></div><button class="primary-button" data-action="confirm-start-country" data-country="${country.id}">CONFIRM ${escapeHtml(country.shortName.toUpperCase())} →</button></div>` : ''}
      ${this.renderCountryOpeningIntel(country)}
      ${unlocked ? `<details class="commander-country-loadout-details"><summary><span>APEX &amp; META LOADOUT</span><b>VIEW COMPLETE BUILD</b></summary>${this.renderCommanderLoadoutSummary(country)}</details>`
        : `<div class="commander-unlock-panel is-campaign-locked"><span>LOCKED NATION</span><strong>DEFEAT IN CAMPAIGN</strong><p>Defeat ${escapeHtml(country.name)} in a standard Campaign war to add it permanently to your roster. Alternative Universe and Survival do not unlock nations.</p></div>`}
      <button class="secondary-button commander-country-detail__arsenal" data-action="open-selected-country-arsenal">OPEN ${escapeHtml(country.shortName.toUpperCase())} IN NATION ARSENAL</button>
    </section>`;
  }

  private renderCountrySelection(): string {
    const selected = this.selectedCountry();
    const ownedCount = this.profile.unlockedCountryIds.length;
    const lockedCount = this.options.countries.length - ownedCount;
    return `<div class="commander-menu-shell commander-menu-shell--country-select">
      ${this.renderProfileStrip()}
      <main class="commander-deployment">
        <header class="commander-deployment__heading"><button class="ghost-button" data-action="home">← COMMAND CENTER</button><div><h1>Choose your nation</h1></div><ol aria-label="Deployment progress"><li class="is-active" aria-current="step"><b>1</b><span>NATION</span></li><li><b>2</b><span>MISSION</span></li><li><b>3</b><span>DEPLOY</span></li></ol></header>
        <div class="commander-deployment__tools"><label><span>SEARCH</span><input id="commander-arsenal-search" type="search" autocomplete="off" value="${escapeHtml(this.search)}" placeholder="Country, region or continent"></label><div><span><b>${ownedCount}</b> ready</span><span><b>${lockedCount}</b> defeat in Campaign</span></div></div>
        ${this.statusMessage ? `<div class="commander-status" role="status" aria-live="polite">${escapeHtml(this.statusMessage)}</div>` : ''}
        <div class="commander-deployment__body"><section class="commander-country-list commander-country-list--grouped" tabindex="0" role="region" data-commander-scroll data-scroll-session="commander:start-country-list" aria-label="Nation roster">${this.renderArsenalList()}</section>${selected ? this.renderCountryDeploymentDetail(selected) : '<section class="commander-country-detail"><h2>No country matches your search.</h2></section>'}</div>
      </main>
    </div>`;
  }

  private renderModeSelection(): string {
    const country = this.selectedCountry();
    if (!country || !this.profile.unlockedCountryIds.includes(country.id)) {
      this.view = 'country';
      return this.renderCountrySelection();
    }
    const modeCards = (['standard-2026', 'survival'] as const).map((mode) => {
      const item = MODE_PRESENTATION[mode];
      const modeNote = mode === 'survival'
        ? `${this.profile.unlockedCountryIds.length} owned nation${this.profile.unlockedCountryIds.length === 1 ? '' : 's'} form${this.profile.unlockedCountryIds.length === 1 ? 's' : ''} your empire; ${country.shortName} remains the flagship.`
        : 'Defeat a nation in war to unlock it permanently for every mode.';
      const action = this.multiplayerDeployment ? 'OPEN LOBBY'
        : mode === 'survival' ? 'DEPLOY YOUR EMPIRE' : 'BEGIN CAMPAIGN';
      return `<button type="button" class="commander-mode-card commander-mode-card--${mode}" data-action="start-mode" data-mode="${mode}" data-country="${country.id}" aria-label="${action.toLocaleLowerCase('en')} with ${escapeHtml(country.name)}"><span>${item.kicker}</span><strong>${item.label}</strong><p>${item.description}</p><small>${escapeHtml(modeNote)}</small><span class="commander-mode-card__footer"><b>${item.badge}</b><em>${action} →</em></span></button>`;
    }).join('');
    const alternative = MODE_PRESENTATION['random-world'];
    const multiplayerControl = this.options.onMultiplayerRequested
      ? `<section class="commander-multiplayer-control"><button type="button" class="commander-multiplayer-toggle ${this.multiplayerDeployment ? 'is-active' : ''}" data-action="toggle-multiplayer" role="switch" aria-checked="${this.multiplayerDeployment}"><i aria-hidden="true"><b></b></i><div><span>CO-OP</span><strong>${this.multiplayerDeployment ? 'FIND A TEAM' : 'PLAY SOLO'}</strong><small>${this.multiplayerDeployment ? 'One nation each, permanent team, shared victory or defeat.' : 'Turn on to play this mission with teammates.'}</small></div><b>${this.multiplayerDeployment ? 'ON' : 'OFF'}</b></button></section>`
      : '';
    const alternativeAction = this.multiplayerDeployment ? 'OPEN LOBBY' : 'ENTER FUN MODE';
    const displayedPower = countryMasteredMilitaryPowerV1(this.profile, country);
    return `<div class="commander-menu-shell commander-menu-shell--mode-select">
      ${this.renderProfileStrip()}
      <main class="commander-deployment commander-deployment--mode">
        <header class="commander-deployment__heading"><button class="ghost-button" data-action="back-to-country">← CHANGE NATION</button><div><span>${escapeHtml(country.shortName.toUpperCase())} CONFIRMED</span><h1>Choose your mission</h1></div><ol aria-label="Deployment progress"><li class="is-complete"><b>✓</b><span>NATION</span></li><li class="is-active" aria-current="step"><b>2</b><span>MISSION</span></li><li><b>3</b><span>DEPLOY</span></li></ol></header>
        <section class="commander-selected-flagship" style="--country:${country.cssColor}"><i class="country-flag country-flag--large">${countryFlagHtml(country.id, country.sigil, true)}</i><div><span>SELECTED FLAGSHIP</span><strong>${escapeHtml(country.name)}</strong><small><b>${compact(displayedPower)} POWER</b><em>Base ${compact(country.militaryPower)} · Mastery level ${countryMasteryV1(this.profile, country.id).level}</em></small></div><button class="secondary-button" data-action="back-to-country">CHANGE</button></section>
        ${multiplayerControl}
        <section class="commander-mode-grid">${modeCards}</section>
        <button type="button" class="commander-fun-mode" data-action="start-mode" data-mode="random-world" data-country="${country.id}" aria-label="${alternativeAction.toLocaleLowerCase('en')} with ${escapeHtml(country.name)}"><i aria-hidden="true">✦</i><div><span>FUN MODE · ${alternative.badge}</span><strong>${alternative.label}</strong><small>${alternative.description}</small></div><b>${alternativeAction} →</b></button>
        <details class="commander-mode-loadout"><summary><span>OPERATION LOADOUT</span><b>REVIEW BUILD</b></summary>${this.renderCommanderLoadoutSummary(country)}</details>
      </main>
    </div>`;
  }

  private renderTalents(): string {
    const progress = commanderLevelProgressV1(this.profile);
    const spentPoints = COMMANDER_TALENTS_V1.reduce((total, talent) => (
      total + (this.profile.commanderTalents[talent.id] ?? 0)
    ), 0);
    const activeDoctrine = COMMANDER_DOCTRINES_V1.find((entry) => (
      entry.id === this.profile.activeDoctrine
    ));
    return `<div class="commander-menu-shell commander-menu-shell--talents">
      ${this.renderProfileStrip()}
      <main class="commander-talents">
        <header class="commander-talents__heading"><button class="ghost-button" data-action="home">← MAIN MENU</button><div><span>ACCOUNT-WIDE NEURAL MATRIX</span><h1>APEX Shield Specialization</h1><p>Shape one energy dome through Lancer, Aegis and Nexus. Every level grants one shield point.</p></div><aside><small>ONE SHIELD POINT PER LEVEL</small><strong>${progress.availableTalentPoints}</strong><span>POINT${progress.availableTalentPoints === 1 ? '' : 'S'} AVAILABLE</span></aside></header>
        <div class="commander-talents__scroll" tabindex="0" role="region" aria-label="APEX talent progression" data-commander-scroll data-scroll-session="commander:talents">
        ${this.statusMessage ? `<div class="commander-status">${escapeHtml(this.statusMessage)}</div>` : ''}
        <section class="commander-talent-toolbar"><div><span>ACTIVE CAPSTONE PROTOCOL</span><strong>${escapeHtml(activeDoctrine?.label ?? 'NO PROTOCOL ACTIVE')}</strong><small>Only one branch protocol can be active. Shield effects freeze into each new campaign.</small></div><b>${spentPoints} INVESTED · ENDLESS AFTER RANK 15</b><button class="ghost-button" data-action="respec-commander-talents" ${spentPoints === 0 ? 'disabled' : ''}>FREE FULL RESPEC</button></section>
        ${renderCommanderTalentBranchesV1(this.profile, this.selectedTalentId)}
        </div>
      </main>
    </div>`;
  }

  private filteredCountries(): readonly CommanderCountryCatalogEntryV1[] {
    const query = this.search.trim().toLocaleLowerCase('en');
    return this.options.countries.filter((country) => !query
      || `${country.name} ${country.shortName} ${country.continent} ${country.subregion}`
        .toLocaleLowerCase('en').includes(query))
      .sort((left, right) => {
        const leftOwned = this.profile.unlockedCountryIds.includes(left.id);
        const rightOwned = this.profile.unlockedCountryIds.includes(right.id);
        if (leftOwned !== rightOwned) return leftOwned ? -1 : 1;
        if (leftOwned && rightOwned) {
          return countryMasteredMilitaryPowerV1(this.profile, right)
            - countryMasteredMilitaryPowerV1(this.profile, left)
            || left.quote.strengthRank - right.quote.strengthRank
            || left.name.localeCompare(right.name, 'en');
        }
        return left.quote.strengthRank - right.quote.strengthRank
          || left.name.localeCompare(right.name, 'en');
      });
  }

  private renderArsenalList(): string {
    const countries = this.filteredCountries();
    const renderCountry = (country: CommanderCountryCatalogEntryV1): string => {
      const unlocked = this.profile.unlockedCountryIds.includes(country.id);
      const selected = country.id === this.selectedCountryId;
      const displayedPower = unlocked
        ? countryMasteredMilitaryPowerV1(this.profile, country) : country.militaryPower;
      return `<button type="button" class="commander-country-row ${unlocked ? 'is-unlocked' : 'is-locked is-campaign-locked'} ${selected ? 'is-selected' : ''}" data-action="select-meta-country" data-country="${country.id}" style="--country:${country.cssColor}" aria-pressed="${selected}">
        <i class="country-flag" aria-hidden="true">${countryFlagHtml(country.id, country.sigil)}</i><div><strong>${escapeHtml(country.name)}</strong><span class="commander-country-row__power">${compact(displayedPower)} POWER</span><small>${unlocked ? `Base ${compact(country.militaryPower)} · Mastery LV ${countryMasteryV1(this.profile, country.id).level}` : `#${country.quote.strengthRank} military · ${escapeHtml(country.subregion)}`}</small></div><b>${unlocked ? 'READY' : 'DEFEAT IN CAMPAIGN'}</b>
      </button>`;
    };
    return (Object.keys(ROSTER_GROUP_PRESENTATION) as CommanderCountryRosterGroupV1[])
      .map((group) => {
        const entries = countries.filter((country) => (
          commanderCountryRosterGroupV1(this.profile, country) === group
        ));
        if (entries.length === 0) return '';
        const presentation = ROSTER_GROUP_PRESENTATION[group];
        return `<section class="commander-roster-group commander-roster-group--${group}" data-roster-group="${group}"><header><strong>${presentation.label}</strong><b>${entries.length}</b></header><div>${entries.map(renderCountry).join('')}</div></section>`;
      }).join('');
  }

  private renderArsenalListOnly(): void {
    const list = this.host.querySelector<HTMLElement>('.commander-country-list');
    if (list) list.innerHTML = this.renderArsenalList();
  }

  private renderCountryDetail(country: CommanderCountryCatalogEntryV1): string {
    const unlocked = this.profile.unlockedCountryIds.includes(country.id);
    const mastery = countryMasteryV1(this.profile, country.id);
    const currentLevelXp = countryMasteryXpForLevelV1(mastery.level);
    const nextLevelXp = countryMasteryXpForLevelV1(Math.min(MAX_COUNTRY_MASTERY_LEVEL, mastery.level + 1));
    const masteryProgress = mastery.level >= MAX_COUNTRY_MASTERY_LEVEL ? 100 : Math.round(
      100 * (mastery.xp - currentLevelXp) / Math.max(1, nextLevelXp - currentLevelXp),
    );
    const loadout = resolveCountryLoadoutV1(this.profile, country.id);
    const masteredPower = countryMasteredMilitaryPowerV1(this.profile, country);
    const masteryPowerDelta = country.militaryPower > 0
      ? (masteredPower / country.militaryPower - 1) * 100 : 0;
    const masteryOpeningBonus = (loadout.masteryMilitary.openingArmyMultiplier - 1) * 100;
    const masteryXpCost = countryMasteryXpDifficultyMultiplierV1(
      country.quote.strengthRank,
      country.quote.countryCount,
    );
    const masteryXpCostLabel = masteryXpCost.toFixed(2).replace(/\.00$/, '').replace(/0$/, '');
    const masteryTrackCards = COUNTRY_MASTERY_TRACK_IDS_V1.map((track) => {
      const item = COUNTRY_MASTERY_PRESENTATION[track];
      const rank = loadout.masteryAllocations[track];
      const canAllocate = loadout.masteryPointsAvailable > 0;
      return `<article class="commander-mastery-track commander-mastery-track--${track}">
        <header><i>${item.icon}</i><div><span>${item.label}</span><strong>RANK ${rank}</strong></div></header>
        <p><b>CURRENT</b>${escapeHtml(countryMasteryTrackEffectCopyV1(track, rank))}</p>
        <small><b>NEXT</b>${escapeHtml(countryMasteryTrackEffectCopyV1(track, rank + 1))}</small>
        <button data-action="allocate-country-mastery" data-country="${country.id}" data-track="${track}" ${canAllocate ? '' : 'disabled'}>${canAllocate ? 'ALLOCATE 1 PT' : 'NO POINTS'}</button>
      </article>`;
    }).join('');
    return `<section class="commander-country-detail" tabindex="0" role="region" aria-label="Selected nation progression" data-commander-scroll data-scroll-session="commander:arsenal-detail:${escapeHtml(country.id)}" style="--country:${country.cssColor}">
      <header><i class="country-flag country-flag--large">${countryFlagHtml(country.id, country.sigil, true)}</i><div><span>${unlocked ? country.quote.starterEligible ? 'STARTER NATION · OWNED' : 'OWNED NATION' : 'CAMPAIGN TARGET'}</span><h2>${escapeHtml(country.name)}</h2><p><b>${compact(unlocked ? masteredPower : country.militaryPower)} POWER</b><span>${unlocked ? `Base ${compact(country.militaryPower)} · ` : ''}#${country.quote.strengthRank} · ${escapeHtml(country.subregion)}</span></p></div></header>
      ${unlocked ? `<section class="commander-mastery-card">
        <header><div><span>COUNTRY MASTERY</span><strong>LEVEL ${mastery.level}</strong><small>${mastery.campaigns} campaigns · ${mastery.victories} victories</small></div><aside><strong>${loadout.masteryPointsAvailable}</strong><span>POINT${loadout.masteryPointsAvailable === 1 ? '' : 'S'} AVAILABLE</span></aside></header>
        <div class="commander-mastery-progress"><b style="--progress:${masteryProgress}%"><i></i></b><small>${mastery.level >= MAX_COUNTRY_MASTERY_LEVEL ? 'MAXIMUM MASTERY' : `${compact(mastery.xp - currentLevelXp)} / ${compact(nextLevelXp - currentLevelXp)} XP · NEXT: +0.25% OPENING ARMY + 1 POINT`} <em>MASTERY XP COST ×${masteryXpCostLabel}</em></small></div>
        <section class="commander-mastery-power" data-base-power="${country.militaryPower}" data-mastered-power="${masteredPower}"><div><span>BASE POWER</span><strong>${compact(country.militaryPower)}</strong></div><i>→</i><div><span>MASTERED POWER</span><strong>${compact(masteredPower)}</strong><em>+${masteryPowerDelta.toFixed(1)}%</em></div></section>
        <div class="commander-mastery-scope"><b>CAMPAIGN · SURVIVAL EMPIRE</b><span>Every owned nation brings its mastery build into Survival.</span></div>
        <div class="commander-mastery-tracks">${masteryTrackCards}</div>
        <footer><span><b>LEVEL BONUS</b> +${masteryPercent(masteryOpeningBonus)}% opening army</span><button class="ghost-button" data-action="respec-country-mastery" data-country="${country.id}" ${loadout.masteryPointsSpent > 0 ? '' : 'disabled'}>FREE RESPEC</button></footer>
      </section>`
        : `<div class="commander-unlock-panel is-campaign-locked"><span>LOCKED NATION</span><strong>DEFEAT IN CAMPAIGN</strong><p>Defeat ${escapeHtml(country.name)} in a standard Campaign war to unlock it permanently. Alternative Universe and Survival do not unlock nations.</p></div>`}
    </section>`;
  }

  private renderArsenal(): string {
    const selected = this.options.countries.find((country) => country.id === this.selectedCountryId)
      ?? this.options.countries.at(-1);
    return `<div class="commander-menu-shell commander-menu-shell--arsenal">
      ${this.renderProfileStrip()}
      <main class="commander-arsenal">
        <header><button class="ghost-button" data-action="return-from-arsenal">← ${this.arsenalReturnView === 'country' ? 'NATION SELECT' : 'MAIN MENU'}</button><div><h1>Nation Arsenal</h1></div><label><span>SEARCH</span><input id="commander-arsenal-search" value="${escapeHtml(this.search)}" placeholder="Country, region or continent"></label></header>
        ${this.statusMessage ? `<div class="commander-status">${escapeHtml(this.statusMessage)}</div>` : ''}
        <div class="commander-arsenal__body"><section class="commander-country-list" tabindex="0" role="region" aria-label="Nation roster" data-commander-scroll data-scroll-session="commander:country-list">${this.renderArsenalList()}</section>${selected ? this.renderCountryDetail(selected) : '<section class="commander-country-detail" tabindex="0" role="region" aria-label="Selected nation progression" data-commander-scroll data-scroll-session="commander:arsenal-detail:empty"><h2>No countries found.</h2></section>'}</div>
      </main>
    </div>`;
  }
}
