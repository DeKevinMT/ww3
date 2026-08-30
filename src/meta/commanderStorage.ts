import type { ScenarioConfigV2 } from '../sim/v2/scenarios';
import type { WarOutcomeV2 } from '../sim/v2/types';
import {
  COMMANDER_TALENT_IDS_V1,
  COMMANDER_PROFILE_SCHEMA_VERSION,
  MAX_COUNTRY_MASTERY_LEVEL,
  commanderDoctrineRequirementMetV1,
  createCommanderProfileV1,
  normalizeCommanderProfileV1,
  normalizeCountryMasteryAllocationsV1,
  resolveCountryMasteryMilitaryEffectsV1,
  type CommanderProfileV1,
  type CommanderTalentId,
  type ResolvedCountryLoadoutV1,
} from './commanderProfile';

export const COMMANDER_PROFILE_STORAGE_KEY = 'frontier-command:commander-profile:v1';
export const CAMPAIGN_SLOT_STORAGE_KEY = 'frontier-command:campaign-slot:v1';
export const CAMPAIGN_SLOT_SCHEMA_VERSION = 1 as const;

export interface CampaignBaselineV1 {
  startingTerritoryIds: string[];
  startingMilitaryLosses: number;
  startingTick: number;
}

/**
 * The save-stable part of a completed war outcome used by account settlement.
 * The full tactical report remains a runtime/UI concern; these five facts are
 * sufficient to reproduce the exact campaign record and national losses after
 * a reload without making the meta save depend on presentation-only fields.
 */
export type StoredCampaignWarOutcomeV1 = Pick<
  WarOutcomeV2,
  'warId' | 'endedTick' | 'humanId' | 'result' | 'ownLosses'
>;

export interface StoredCampaignV1 {
  schemaVersion: typeof CAMPAIGN_SLOT_SCHEMA_VERSION;
  campaignId: string;
  scenario: ScenarioConfigV2;
  countryId: string;
  /** Legacy per-run war record retained for save compatibility; never grants unlock access. */
  defeatedCountryIds: string[];
  /** Nations whose complete homeland reached 100% Signal Purge in this Campaign. */
  signalPurgedCountryIds: string[];
  /** Completed human wars retained across menu returns, reloads and reconnects. */
  warOutcomes: StoredCampaignWarOutcomeV1[];
  /**
   * First tick covered by `warOutcomes`. Missing on legacy version-one slots;
   * those retain the previous conservative event reconstruction for earlier play.
   */
  warOutcomeLedgerStartedTick?: number;
  profileRevisionAtStart: number;
  loadout: ResolvedCountryLoadoutV1;
  rewardEligible: boolean;
  stateSave: string;
  baseline: CampaignBaselineV1;
  startedAt: number;
  updatedAt: number;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Read-only migration evidence for a pre-ledger active Campaign. Its world
 * save remains authoritative and is never rewritten here, so a first tutorial
 * already in progress continues exactly where it stopped after reconnect.
 */
export function storedCampaignWasPlayedV1(campaign: StoredCampaignV1): boolean {
  if (campaign.scenario.mode !== 'standard-2026') return false;
  const parsed = parseJson(campaign.stateSave);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  const save = parsed as Record<string, unknown>;
  const tick = Number(save.tick);
  if (Number.isFinite(tick) && tick > campaign.baseline.startingTick) return true;

  const polar = save.polarEndgame;
  if (!polar || typeof polar !== 'object' || Array.isArray(polar)) return false;
  const polarRecord = polar as Record<string, unknown>;
  const programs = polarRecord.arcticPrograms;
  if (programs && typeof programs === 'object' && !Array.isArray(programs)) {
    const progress = (programs as Record<string, unknown>)[campaign.countryId];
    if (progress && typeof progress === 'object' && !Array.isArray(progress)) {
      const record = progress as Record<string, unknown>;
      if (record.activeProject
        || Array.isArray(record.completedProjects) && record.completedProjects.length > 0) return true;
    }
  }
  const narrative = polarRecord.apexNarrative;
  if (narrative && typeof narrative === 'object' && !Array.isArray(narrative)) {
    const players = (narrative as Record<string, unknown>).players;
    if (players && typeof players === 'object' && !Array.isArray(players)) {
      const progress = (players as Record<string, unknown>)[campaign.countryId];
      if (progress && typeof progress === 'object' && !Array.isArray(progress)) {
        const transmissions = (progress as Record<string, unknown>).transmissions;
        if (Array.isArray(transmissions) && transmissions.length > 0) return true;
      }
    }
  }
  return false;
}

function parseJson(value: string | null): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function canonicalScenario(input: unknown): ScenarioConfigV2 | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const source = input as Partial<ScenarioConfigV2>;
  if (source.mode !== 'standard-2026' && source.mode !== 'random-world' && source.mode !== 'survival') {
    return undefined;
  }
  if (!Number.isInteger(source.version) || !Number.isInteger(source.seed) || Number(source.seed) <= 0) {
    return undefined;
  }
  return { mode: source.mode, version: Number(source.version), seed: Number(source.seed) };
}

function canonicalLoadout(input: unknown): ResolvedCountryLoadoutV1 | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const source = input as Partial<ResolvedCountryLoadoutV1>;
  const upgrades = source.upgrades;
  if (source.catalogVersion !== 1 || !upgrades || typeof upgrades !== 'object') return undefined;
  const level = (value: unknown): number => Math.max(0, Math.min(5, Math.floor(Number(value) || 0)));
  const multiplier = (value: unknown, fallback: number): number => (
    Number.isFinite(value) ? Math.max(0, Number(value)) : fallback
  );
  const exactMultiplier = (value: number): number => Math.round(value * 1_000_000_000) / 1_000_000_000;
  const rawTalents = source.commanderTalents && typeof source.commanderTalents === 'object'
    ? source.commanderTalents as Partial<Record<CommanderTalentId, number>> : {};
  const commanderLevel = Math.max(1, Math.min(
    Number.MAX_SAFE_INTEGER,
    Math.floor(Number(source.commanderLevel) || 1),
  ));
  let remainingTalentPoints = commanderLevel;
  const commanderTalents = Object.fromEntries(COMMANDER_TALENT_IDS_V1.map((id) => {
    const rank = Math.min(
      remainingTalentPoints,
      Math.max(0, Math.min(
        Number.MAX_SAFE_INTEGER,
        Math.floor(Number(rawTalents[id]) || 0),
      )),
    );
    remainingTalentPoints -= rank;
    return [id, rank];
  })) as Record<CommanderTalentId, number>;
  const activeDoctrine = source.activeDoctrine === 'bastion'
    || source.activeDoctrine === 'rapid-response'
    || source.activeDoctrine === 'vanguard'
    ? source.activeDoctrine : null;
  const masteryLevel = Math.max(1, Math.min(
    MAX_COUNTRY_MASTERY_LEVEL,
    Math.floor(Number(source.masteryLevel) || 1),
  ));
  const masteryAllocations = normalizeCountryMasteryAllocationsV1(
    source.masteryAllocations,
    masteryLevel,
  );
  const masteryPointsEarned = masteryLevel - 1;
  const masteryPointsSpent = Object.values(masteryAllocations)
    .reduce((sum, rank) => sum + rank, 0);
  const masteryMilitary = resolveCountryMasteryMilitaryEffectsV1(
    masteryLevel,
    masteryAllocations,
  );
  const mobilizationLevel = level(upgrades.mobilization);
  const economyLevel = level(upgrades.economy);
  return {
    catalogVersion: 1,
    masteryLevel,
    masteryAllocations,
    masteryPointsEarned,
    masteryPointsSpent,
    masteryPointsAvailable: masteryPointsEarned - masteryPointsSpent,
    masteryMilitary,
    upgrades: {
      mobilization: mobilizationLevel,
      logistics: level(upgrades.logistics),
      research: level(upgrades.research),
      economy: economyLevel,
      trait: level(upgrades.trait),
    },
    openingArmyMultiplier: exactMultiplier(
      (1 + mobilizationLevel * 0.04) * masteryMilitary.openingArmyMultiplier,
    ),
    openingEconomyMultiplier: exactMultiplier(1 + economyLevel * 0.04),
    masteryOpeningArmyMultiplier: masteryMilitary.openingArmyMultiplier,
    masteryOpeningEconomyMultiplier: 1,
    // Legacy campaigns remain loadable, but retired country traits are inert.
    traitScale: 0,
    commanderLevel,
    commanderTalents,
    activeDoctrine: activeDoctrine
      && commanderDoctrineRequirementMetV1(commanderTalents, activeDoctrine)
      ? activeDoctrine : null,
    eliteStarterManpower: multiplier(source.eliteStarterManpower, 0),
    regularStarterManpower: multiplier(source.regularStarterManpower, 0),
    trainedReserveStarterManpower: multiplier(source.trainedReserveStarterManpower, 0),
    openingTreasuryBonus: multiplier(source.openingTreasuryBonus, 0),
    openingFoodWeeksBonus: multiplier(source.openingFoodWeeksBonus, 0),
  };
}

const CAMPAIGN_WAR_RESULTS = new Set<StoredCampaignWarOutcomeV1['result']>([
  'victory',
  'defeat',
  'territorial-gain',
  'territorial-loss',
  'stalemate',
]);

function canonicalCampaignWarOutcomes(input: unknown): StoredCampaignWarOutcomeV1[] {
  if (!Array.isArray(input)) return [];
  const byWarId = new Map<string, StoredCampaignWarOutcomeV1>();
  for (const entry of input) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const source = entry as Partial<StoredCampaignWarOutcomeV1>;
    const warId = typeof source.warId === 'string' ? source.warId.trim() : '';
    const humanId = typeof source.humanId === 'string' ? source.humanId.trim() : '';
    const endedTick = Math.floor(Number(source.endedTick));
    const ownLosses = Number(source.ownLosses);
    if (!warId || !humanId
      || !Number.isSafeInteger(endedTick) || endedTick < 0
      || !CAMPAIGN_WAR_RESULTS.has(source.result as StoredCampaignWarOutcomeV1['result'])
      || !Number.isFinite(ownLosses) || ownLosses < 0) continue;
    const outcome: StoredCampaignWarOutcomeV1 = {
      warId,
      endedTick,
      humanId: humanId as StoredCampaignWarOutcomeV1['humanId'],
      result: source.result as StoredCampaignWarOutcomeV1['result'],
      ownLosses: Math.round(ownLosses * 1_000_000_000) / 1_000_000_000,
    };
    const previous = byWarId.get(warId);
    if (!previous || previous.endedTick <= endedTick) byWarId.set(warId, outcome);
  }
  return [...byWarId.values()].sort((left, right) => (
    left.endedTick - right.endedTick || left.warId.localeCompare(right.warId)
  ));
}

export function loadCommanderProfileV1(
  storage: KeyValueStorage,
  now = Date.now(),
): CommanderProfileV1 {
  const profile = normalizeCommanderProfileV1(
    parseJson(storage.getItem(COMMANDER_PROFILE_STORAGE_KEY)),
    now,
  );
  // Persist normalization immediately so a corrupt/old value cannot keep
  // reappearing on every launch.
  storage.setItem(COMMANDER_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  return profile;
}

export function saveCommanderProfileV1(
  storage: KeyValueStorage,
  profile: CommanderProfileV1,
  now = Date.now(),
): CommanderProfileV1 {
  const normalized = normalizeCommanderProfileV1({ ...profile, updatedAt: now }, now);
  storage.setItem(COMMANDER_PROFILE_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function loadCampaignSlotV1(storage: KeyValueStorage): StoredCampaignV1 | undefined {
  const input = parseJson(storage.getItem(CAMPAIGN_SLOT_STORAGE_KEY));
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const source = input as Partial<StoredCampaignV1>;
  const scenario = canonicalScenario(source.scenario);
  const loadout = canonicalLoadout(source.loadout);
  if (source.schemaVersion !== CAMPAIGN_SLOT_SCHEMA_VERSION
    || !scenario
    || !loadout
    || typeof source.campaignId !== 'string'
    || typeof source.countryId !== 'string'
    || typeof source.stateSave !== 'string'
    || !source.baseline
    || typeof source.baseline !== 'object') return undefined;
  const baseline = source.baseline as CampaignBaselineV1;
  if (!Array.isArray(baseline.startingTerritoryIds)
    || !baseline.startingTerritoryIds.every((id) => typeof id === 'string')) return undefined;
  return {
    schemaVersion: CAMPAIGN_SLOT_SCHEMA_VERSION,
    campaignId: source.campaignId,
    scenario,
    countryId: source.countryId,
    defeatedCountryIds: [...new Set(
      Array.isArray(source.defeatedCountryIds)
        ? source.defeatedCountryIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
        : [],
    )].sort(),
    signalPurgedCountryIds: [...new Set(
      Array.isArray(source.signalPurgedCountryIds)
        ? source.signalPurgedCountryIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
        : [],
    )].sort(),
    // Version-one saves created before the cumulative ledger migrate to an
    // empty lower-bound record. New outcomes become exact from the first
    // resumed war onward without invalidating the playable world save.
    warOutcomes: canonicalCampaignWarOutcomes(source.warOutcomes),
    ...(Number.isSafeInteger(source.warOutcomeLedgerStartedTick)
      && Number(source.warOutcomeLedgerStartedTick) >= 0
      ? { warOutcomeLedgerStartedTick: Number(source.warOutcomeLedgerStartedTick) }
      : {}),
    profileRevisionAtStart: Math.max(1, Math.floor(Number(source.profileRevisionAtStart) || 1)),
    loadout,
    rewardEligible: scenario.mode !== 'random-world' && source.rewardEligible !== false,
    stateSave: source.stateSave,
    baseline: {
      startingTerritoryIds: [...baseline.startingTerritoryIds],
      startingMilitaryLosses: Math.max(0, Number(baseline.startingMilitaryLosses) || 0),
      startingTick: Math.max(0, Math.floor(Number(baseline.startingTick) || 0)),
    },
    startedAt: Math.max(0, Number(source.startedAt) || 0),
    updatedAt: Math.max(0, Number(source.updatedAt) || 0),
  };
}

export function saveCampaignSlotV1(
  storage: KeyValueStorage,
  slot: StoredCampaignV1,
): void {
  storage.setItem(CAMPAIGN_SLOT_STORAGE_KEY, JSON.stringify(slot));
}

export function clearCampaignSlotV1(storage: KeyValueStorage): void {
  storage.removeItem(CAMPAIGN_SLOT_STORAGE_KEY);
}

export function resetCommanderProfileV1(
  storage: KeyValueStorage,
  now = Date.now(),
): CommanderProfileV1 {
  const profile = createCommanderProfileV1(now);
  storage.setItem(COMMANDER_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  return profile;
}

export function profileStorageVersionV1(): number {
  return COMMANDER_PROFILE_SCHEMA_VERSION;
}
