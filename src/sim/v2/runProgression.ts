import type { WorldContentV2 } from './content';
import type {
  CommandResultV2,
  PlayerId,
  RunDraftOfferV2,
  RunProgressionModeV2,
  RunProgressionPlayerStateV2,
  RunProgressionStateV2,
  RunUpgradeCategoryV2,
  RunUpgradeIdV2,
  WorldStateV2,
} from './types';

/**
 * Save-compatibility shell for the retired timeline card system.
 *
 * `scorchedWorldTerritoryIds` remains a schema-only empty compatibility field.
 * Old corridor saves are repaired and cleared at load while every offer, pick
 * and modifier remains intentionally neutralised.
 */

export type RunUpgradeRarityV2 = 'common' | 'uncommon' | 'rare';

export interface RunUpgradeDefinitionV2 {
  id: RunUpgradeIdV2;
  category: RunUpgradeCategoryV2;
  rarity: RunUpgradeRarityV2;
  label: string;
  description: string;
  exactEffects: readonly string[];
  maxStacks: number;
}

export interface RunModifierTotalsV2 {
  nationalAttackMultiplier: number;
  nationalDefenseMultiplier: number;
  nationalCapacityMultiplier: number;
  recruitmentMultiplier: number;
  regularCasualtyMultiplier: number;
  taxRevenueMultiplier: number;
  navalSupplyMultiplier: number;
  landSupplyMultiplier: number;
  navalTransferThroughputMultiplier: number;
  landTransferThroughputMultiplier: number;
  navalTransferCostMultiplier: number;
  frontSupplyFloorBonus: number;
  commanderAttackBonus: number;
  commanderDefenseBonus: number;
  commanderSupplyMultiplier: number;
}

export interface RunDraftChoiceViewV2 extends RunUpgradeDefinitionV2 {
  currentStacks: number;
  nextStack: number;
}

export interface RunDraftViewV2 {
  offer: RunDraftOfferV2;
  choices: [RunDraftChoiceViewV2, RunDraftChoiceViewV2, RunDraftChoiceViewV2];
}

export interface RunBuildSummaryV2 {
  mode: RunProgressionModeV2;
  pickedCards: Array<{
    id: RunUpgradeIdV2;
    label: string;
    category: RunUpgradeCategoryV2;
    stacks: number;
    maxStacks: number;
    exactEffects: readonly string[];
  }>;
  modifiers: RunModifierTotalsV2;
  choicesMade: number;
  queuedChoices: number;
}

/** Deprecated exports kept so old save/protocol tooling compiles. */
export const CAMPAIGN_REGION_DOMINANCE_SHARE_V2 = 0.75;
export const SURVIVAL_RECAPTURE_DRAFT_THRESHOLDS_V2 = Object.freeze([] as const);
export const SURVIVAL_OPENING_WAVE_DRAFTS_V2 = Object.freeze([] as const);
export const SURVIVAL_LATE_WAVE_DRAFT_START_V2 = Number.POSITIVE_INFINITY;
export const SURVIVAL_LATE_WAVE_DRAFT_INTERVAL_V2 = Number.POSITIVE_INFINITY;
export const RUN_UPGRADES_V2: readonly RunUpgradeDefinitionV2[] = Object.freeze([]);

function emptyPlayerProgressionV2(): RunProgressionPlayerStateV2 {
  return {
    activeOffer: null,
    queuedMilestones: [],
    triggeredMilestoneIds: [],
    picks: [],
    stacks: {},
    recapturedScorchedTerritoryIds: [],
  };
}

export function runProgressionModeForContentV2(_content: WorldContentV2): RunProgressionModeV2 {
  return 'disabled';
}

export function createInitialRunProgressionV2(_content: WorldContentV2): RunProgressionStateV2 {
  return {
    mode: 'disabled',
    players: {},
    scorchedWorldTerritoryIds: [],
    nextOfferSequence: 1,
  };
}

export function cloneRunProgressionV2(
  source: RunProgressionStateV2 | undefined,
  content: WorldContentV2,
): RunProgressionStateV2 {
  const clone = createInitialRunProgressionV2(content);
  clone.scorchedWorldTerritoryIds = [...(source?.scorchedWorldTerritoryIds ?? [])]
    .sort((left, right) => left.localeCompare(right));
  for (const rawPlayerId of Object.keys(source?.players ?? {}).sort()) {
    clone.players[rawPlayerId as PlayerId] = emptyPlayerProgressionV2();
  }
  return clone;
}

export function resetRunProgressionRosterV2(
  state: WorldStateV2,
  content: WorldContentV2,
): void {
  state.runProgression = createInitialRunProgressionV2(content);
  synchronizeRunProgressionRosterV2(state);
}

export function synchronizeRunProgressionRosterV2(state: WorldStateV2): void {
  state.runProgression.mode = 'disabled';
  state.runProgression.nextOfferSequence = 1;
  state.runProgression.players = Object.fromEntries(
    [...state.humanPlayerIds]
      .sort((left, right) => left.localeCompare(right))
      .map((playerId) => [playerId, emptyPlayerProgressionV2()]),
  );
}

export function processRunProgressionMilestonesV2(
  state: WorldStateV2,
  _content: WorldContentV2,
): number {
  synchronizeRunProgressionRosterV2(state);
  return 0;
}

export function chooseRunUpgradeV2(
  _state: WorldStateV2,
  _playerId: PlayerId,
  _offerId: string,
  _upgradeId: RunUpgradeIdV2,
): CommandResultV2 {
  return {
    accepted: false,
    reason: 'Timeline adaptation cards were retired; use EONSCAR talents and nation mastery.',
  };
}

export function selectRunUpgradeDefinitionV2(
  _upgradeId: RunUpgradeIdV2,
): RunUpgradeDefinitionV2 {
  throw new Error('Timeline adaptation cards were retired.');
}

export function selectRunModifiersV2(
  _state: Pick<WorldStateV2, 'runProgression'>,
  _playerId: PlayerId,
): RunModifierTotalsV2 {
  return {
    nationalAttackMultiplier: 1,
    nationalDefenseMultiplier: 1,
    nationalCapacityMultiplier: 1,
    recruitmentMultiplier: 1,
    regularCasualtyMultiplier: 1,
    taxRevenueMultiplier: 1,
    navalSupplyMultiplier: 1,
    landSupplyMultiplier: 1,
    navalTransferThroughputMultiplier: 1,
    landTransferThroughputMultiplier: 1,
    navalTransferCostMultiplier: 1,
    frontSupplyFloorBonus: 0,
    commanderAttackBonus: 0,
    commanderDefenseBonus: 0,
    commanderSupplyMultiplier: 1,
  };
}

export function selectRunDraftV2(
  _state: WorldStateV2,
  _playerId: PlayerId,
): RunDraftViewV2 | null {
  return null;
}

export function selectRunBuildSummaryV2(
  state: WorldStateV2,
  playerId: PlayerId,
): RunBuildSummaryV2 {
  return {
    mode: 'disabled',
    pickedCards: [],
    modifiers: selectRunModifiersV2(state, playerId),
    choicesMade: 0,
    queuedChoices: 0,
  };
}
