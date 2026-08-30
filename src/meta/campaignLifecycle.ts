import {
  calculateCampaignRewardV1,
  type CampaignOutcomeV1,
  type CampaignRewardV1,
} from './commanderProfile';
import type {
  StoredCampaignV1,
  StoredCampaignWarOutcomeV1,
} from './commanderStorage';
import type { WorldEngineV2 } from '../sim/v2/WorldEngineV2';
import type {
  PlayerId,
  WarStateV2,
  WorldEventV2,
  WorldStateV2,
} from '../sim/v2/types';
import { rogueWaveLossCreditV2 } from '../sim/v2/survivalProvenance';

export const CAMPAIGN_LIFECYCLE_SCHEMA_VERSION = 1 as const;

export type CampaignOutcomeRequestV1 = CampaignOutcomeV1 | 'auto';
export type CampaignLifecycleSourceV1 = WorldStateV2 | Pick<WorldEngineV2, 'state'>;

export interface CampaignWarRecordV1 {
  wins: number;
  losses: number;
  /** False means the values are a conservative lower bound reconstructed from retained state. */
  complete: boolean;
  source: 'war-outcomes' | 'conquest-events' | 'terminal-state';
}

export interface CampaignLifecycleSnapshotV1 {
  schemaVersion: typeof CAMPAIGN_LIFECYCLE_SCHEMA_VERSION;
  /** Stable key used by the account settlement ledger. */
  settlementId: string;
  campaignId: string;
  countryId: string;
  mode: StoredCampaignV1['scenario']['mode'];
  seed: number;
  outcome: CampaignOutcomeV1;
  terminalTick: number;
  weeksSurvived: number;
  startingTerritoryIds: readonly string[];
  currentTerritoryIds: readonly string[];
  territoriesGainedIds: readonly string[];
  territoriesLostIds: readonly string[];
  territoryDelta: number;
  warsWon: number;
  warsLost: number;
  warRecord: CampaignWarRecordV1;
  highestSurvivalWave: number;
  /** Verified Rogue-wave personnel destroyed, excluding starting occupation garrisons. */
  verifiedRogueWaveLosses: number;
  /** Military personnel lost, in the simulation's million-person unit. */
  militaryLosses: number;
  militaryLossesComplete: boolean;
  rewardEligible: boolean;
  reward: CampaignRewardV1;
}

export interface CreateCampaignLifecycleSnapshotInputV1 {
  source: CampaignLifecycleSourceV1;
  campaign: StoredCampaignV1;
  /** Auto returns undefined while the campaign is still active. */
  outcome?: CampaignOutcomeRequestV1;
  /**
   * WorldEngine emits completed war outcomes live but deliberately does not put
   * them in deterministic saves. Passing the campaign ledger makes both the
   * win/loss record and military-loss total exact.
   */
  warOutcomes?: readonly StoredCampaignWarOutcomeV1[];
  /** Country-power grind curve; affects nation mastery only, never APEX XP. */
  countryMasteryXpDifficultyMultiplier?: number;
}

function stateFromSourceV1(source: CampaignLifecycleSourceV1): WorldStateV2 {
  return 'state' in source ? source.state : source;
}

function ownedTerritoryIdsV1(state: WorldStateV2, countryId: string): string[] {
  return Object.entries(state.territories)
    .filter(([, territory]) => territory.owner === countryId)
    .map(([territoryId]) => territoryId)
    .sort((left, right) => left.localeCompare(right));
}

function finiteNonNegativeV1(value: unknown): number {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : 0;
}

function roundLossV1(value: number): number {
  return Math.round(finiteNonNegativeV1(value) * 1_000_000) / 1_000_000;
}

function isHumanWarV1(war: Pick<WarStateV2, 'attackerId' | 'defenderId'>, countryId: string): boolean {
  return war.attackerId === countryId || war.defenderId === countryId;
}

function humanLossesFromWarV1(
  war: Pick<WarStateV2, 'attackerId' | 'defenderId' | 'attackerLosses' | 'defenderLosses'>,
  countryId: string,
): number {
  if (war.attackerId === countryId) return finiteNonNegativeV1(war.attackerLosses);
  if (war.defenderId === countryId) return finiteNonNegativeV1(war.defenderLosses);
  return 0;
}

function relevantWarOutcomesV1(
  outcomes: readonly StoredCampaignWarOutcomeV1[],
  countryId: string,
  startingTick: number,
): StoredCampaignWarOutcomeV1[] {
  const byWarId = new Map<string, StoredCampaignWarOutcomeV1>();
  for (const outcome of outcomes) {
    if (outcome.humanId !== countryId || outcome.endedTick < startingTick) continue;
    const previous = byWarId.get(outcome.warId);
    if (!previous || previous.endedTick <= outcome.endedTick) byWarId.set(outcome.warId, outcome);
  }
  return [...byWarId.values()].sort((left, right) => (
    left.endedTick - right.endedTick || left.warId.localeCompare(right.warId)
  ));
}

function reconstructedWarRecordV1(
  state: WorldStateV2,
  campaign: StoredCampaignV1,
  outcome: CampaignOutcomeV1,
  beforeTick = Number.POSITIVE_INFINITY,
): CampaignWarRecordV1 {
  const conquestEvents = state.events.filter((event: WorldEventV2) => (
    event.tick >= campaign.baseline.startingTick
      && event.tick < beforeTick
      && event.kind === 'conquest'
      && event.playerId === campaign.countryId
      && /\bdefeated\b.+\bconquered\b/i.test(event.message)
  ));
  const wins = new Set(conquestEvents.map((event) => event.id)).size;
  const losses = outcome === 'defeat' ? 1 : 0;
  if (wins > 0) return { wins, losses, complete: false, source: 'conquest-events' };
  return { wins: 0, losses, complete: false, source: 'terminal-state' };
}

function exactWarRecordV1(outcomes: readonly StoredCampaignWarOutcomeV1[]): CampaignWarRecordV1 {
  const wins = outcomes.filter((outcome) => (
    outcome.result === 'victory' || outcome.result === 'territorial-gain'
  )).length;
  const losses = outcomes.filter((outcome) => (
    outcome.result === 'defeat' || outcome.result === 'territorial-loss'
  )).length;
  return { wins, losses, complete: true, source: 'war-outcomes' };
}

function migratedWarRecordV1(
  state: WorldStateV2,
  campaign: StoredCampaignV1,
  outcome: CampaignOutcomeV1,
  exactOutcomes: readonly StoredCampaignWarOutcomeV1[],
  ledgerStartedTick: number,
): CampaignWarRecordV1 {
  const legacy = reconstructedWarRecordV1(state, campaign, outcome, ledgerStartedTick);
  const exact = exactWarRecordV1(exactOutcomes);
  const terminalLossAlreadyRetained = exactOutcomes.some((entry) => (
    entry.result === 'defeat' || entry.result === 'territorial-loss'
  ));
  return {
    wins: legacy.wins + exact.wins,
    losses: exact.losses + (terminalLossAlreadyRetained ? 0 : legacy.losses),
    complete: false,
    source: exactOutcomes.length > 0 ? 'war-outcomes' : legacy.source,
  };
}

function highestSurvivalWaveV1(state: WorldStateV2, startingTick: number): number {
  const phase = state.polarEndgame.phase;
  const stateWave = phase === 'contact' || phase === 'counteroffensive'
    || phase === 'core-exposed' || phase === 'victory'
    ? Math.max(0, Math.floor(finiteNonNegativeV1(state.polarEndgame.globalWave)) - 1)
    : 0;
  let eventWave = 0;
  for (const event of state.events) {
    if (event.tick < startingTick || event.kind !== 'polar') continue;
    const match = /\bROGUE WAVE\s+(\d+)\b/i.exec(event.message);
    if (match) eventWave = Math.max(eventWave, Number(match[1]) || 0);
  }
  return Math.max(stateWave, eventWave);
}

function suppressIneligibleRewardV1(reward: CampaignRewardV1): CampaignRewardV1 {
  return {
    ...reward,
    masteryXp: 0,
    commanderXp: 0,
  };
}

/**
 * Resolves only genuine terminal states unless an explicit outcome is supplied.
 * Surrender is intentionally explicit: merely opening the end screen can never
 * surrender a live campaign.
 */
export function resolveCampaignOutcomeV1(
  source: CampaignLifecycleSourceV1,
  campaign: StoredCampaignV1,
  requested: CampaignOutcomeRequestV1 = 'auto',
): CampaignOutcomeV1 | undefined {
  if (requested !== 'auto') return requested;
  const state = stateFromSourceV1(source);
  const currentTerritories = ownedTerritoryIdsV1(state, campaign.countryId);
  const countryStillExists = Boolean(state.players[campaign.countryId as PlayerId]);
  if (state.polarEndgame.phase === 'victory' && currentTerritories.length > 0) return 'victory';
  if (!countryStillExists || currentTerritories.length === 0) return 'defeat';
  if (!state.gameOver) return undefined;
  return state.winnerId === campaign.countryId ? 'victory' : 'defeat';
}

/** Pure, deterministic settlement builder. It never mutates the engine, save or profile. */
export function createCampaignLifecycleSnapshotV1(
  input: CreateCampaignLifecycleSnapshotInputV1,
): CampaignLifecycleSnapshotV1 | undefined {
  const { campaign } = input;
  const state = stateFromSourceV1(input.source);
  const outcome = resolveCampaignOutcomeV1(input.source, campaign, input.outcome ?? 'auto');
  if (!outcome) return undefined;

  const startingTerritoryIds = [...new Set(campaign.baseline.startingTerritoryIds)].sort();
  const startingTerritories = new Set(startingTerritoryIds);
  const currentTerritoryIds = ownedTerritoryIdsV1(state, campaign.countryId);
  const currentTerritories = new Set(currentTerritoryIds);
  const territoriesGainedIds = currentTerritoryIds.filter((id) => !startingTerritories.has(id));
  const territoriesLostIds = startingTerritoryIds.filter((id) => !currentTerritories.has(id));
  const weeksSurvived = Math.max(0, Math.floor(state.tick) - campaign.baseline.startingTick);
  const retainedOutcomes = input.warOutcomes ?? campaign.warOutcomes ?? [];
  const completedOutcomes = relevantWarOutcomesV1(
    retainedOutcomes,
    campaign.countryId,
    campaign.baseline.startingTick,
  );
  const ledgerStartedTick = input.warOutcomes !== undefined
    ? campaign.baseline.startingTick
    : campaign.warOutcomeLedgerStartedTick;
  const completeWarLedger = ledgerStartedTick !== undefined
    && ledgerStartedTick <= campaign.baseline.startingTick;
  const warRecord = completeWarLedger
    ? exactWarRecordV1(completedOutcomes)
    : migratedWarRecordV1(
      state,
      campaign,
      outcome,
      completedOutcomes,
      ledgerStartedTick ?? Number.POSITIVE_INFINITY,
    );
  const completedWarIds = new Set(completedOutcomes.map((entry) => entry.warId));
  const activeHumanWars = state.wars.filter((war) => (
    isHumanWarV1(war, campaign.countryId) && !completedWarIds.has(war.id)
  ));
  const exactCompletedRecord = exactWarRecordV1(completedOutcomes);
  const reconstructedPreLedgerWins = completeWarLedger
    ? 0
    : Math.max(0, warRecord.wins - exactCompletedRecord.wins);
  const warsFought = completedOutcomes.length
    + reconstructedPreLedgerWins
    + activeHumanWars.length;
  const observedMilitaryLosses = completedOutcomes.reduce(
    (sum, entry) => sum + finiteNonNegativeV1(entry.ownLosses),
    0,
  ) + activeHumanWars.reduce(
    (sum, war) => sum + humanLossesFromWarV1(war, campaign.countryId),
    0,
  );
  const militaryLosses = roundLossV1(
    Math.max(0, observedMilitaryLosses - campaign.baseline.startingMilitaryLosses),
  );
  const highestSurvivalWave = highestSurvivalWaveV1(
    state,
    campaign.baseline.startingTick,
  );
  const verifiedRogueWaveLosses = campaign.scenario.mode === 'survival'
    ? rogueWaveLossCreditV2(state, campaign.countryId as PlayerId)
    : 0;
  const rawReward = calculateCampaignRewardV1({
    campaignId: campaign.campaignId,
    countryId: campaign.countryId,
    mode: campaign.scenario.mode,
    outcome,
    weeksSurvived,
    territoriesGained: territoriesGainedIds.length,
    territoriesLost: territoriesLostIds.length,
    warsWon: warRecord.wins,
    warsFought,
    highestSurvivalWave,
    verifiedRogueWaveLosses,
    militaryLosses,
  });
  const masteryDifficulty = Number.isFinite(input.countryMasteryXpDifficultyMultiplier)
    ? Math.max(1, Number(input.countryMasteryXpDifficultyMultiplier)) : 1;
  const calculatedReward = {
    ...rawReward,
    masteryXp: Math.max(0, Math.round(rawReward.masteryXp / masteryDifficulty)),
  };
  const rewardEligible = campaign.scenario.mode !== 'random-world'
    && campaign.rewardEligible;

  return {
    schemaVersion: CAMPAIGN_LIFECYCLE_SCHEMA_VERSION,
    settlementId: `${campaign.campaignId}:${outcome}`,
    campaignId: campaign.campaignId,
    countryId: campaign.countryId,
    mode: campaign.scenario.mode,
    seed: campaign.scenario.seed,
    outcome,
    terminalTick: Math.max(0, Math.floor(state.tick)),
    weeksSurvived,
    startingTerritoryIds,
    currentTerritoryIds,
    territoriesGainedIds,
    territoriesLostIds,
    territoryDelta: currentTerritoryIds.length - startingTerritoryIds.length,
    warsWon: warRecord.wins,
    warsLost: warRecord.losses,
    warRecord,
    highestSurvivalWave,
    verifiedRogueWaveLosses,
    militaryLosses,
    militaryLossesComplete: completeWarLedger,
    rewardEligible,
    reward: rewardEligible
      ? calculatedReward
      : suppressIneligibleRewardV1(calculatedReward),
  };
}
