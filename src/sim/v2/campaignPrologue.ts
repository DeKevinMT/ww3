import { AI_FIRST_WAR_TICK, BATTLE_INTERVAL_TICKS, WAR_MOBILIZATION_TICKS } from './balance';
import type { WorldContentV2 } from './content';
import type { PlayerId, WarStateV2, WorldStateV2 } from './types';

export const CAMPAIGN_WAR_LOCK_REASON_V2
  = 'Complete Signal Triangulation to restore verified military intelligence.';
export const CAMPAIGN_HUMAN_WAR_STORY_LOCK_REASON_V2
  = 'Wait for EONSCAR to finish the first-strike briefing.';

/**
 * Stage I is already a three-month calm opening. Six further weeks leave a
 * clear reaction beat before the one staged proof conflict, without making the
 * player wait through another half year after completing the mandatory task.
 */
export const CAMPAIGN_AI_VS_AI_POST_BLACKOUT_GRACE_TICKS_V2 = 6;

/** Compatibility names for UI/tests: the guided war uses the exact same
 * mobilisation and battle clock as every comparable Campaign operation. */
export const CAMPAIGN_FIRST_STRIKE_MOBILIZATION_TICKS_V2 = WAR_MOBILIZATION_TICKS;
export const CAMPAIGN_FIRST_STRIKE_BATTLE_INTERVAL_TICKS_V2 = BATTLE_INTERVAL_TICKS;

/** Deterministic quote shared by pre-war UI and the live war clock. */
export function campaignProspectiveWarMobilizationTicksV2(
  _state: WorldStateV2,
  _content: WorldContentV2,
  _attackerId: PlayerId,
  _defenderId: PlayerId,
): number {
  return WAR_MOBILIZATION_TICKS;
}

/** Deterministic preview of the exact live battle clock used after declaration. */
export function campaignProspectiveWarBattleIntervalTicksV2(
  _state: WorldStateV2,
  _content: WorldContentV2,
  _attackerId: PlayerId,
  _defenderId: PlayerId,
): number {
  return BATTLE_INTERVAL_TICKS;
}

export function campaignWarMobilizationTicksV2(
  _state: WorldStateV2,
  _content: WorldContentV2,
  _war: Pick<WarStateV2, 'attackerId' | 'defenderId' | 'startedTick'>,
): number {
  return WAR_MOBILIZATION_TICKS;
}

export function campaignWarBattleIntervalTicksV2(
  _state: WorldStateV2,
  _content: WorldContentV2,
  _war: Pick<WarStateV2, 'attackerId' | 'defenderId' | 'startedTick'>,
): number {
  return BATTLE_INTERVAL_TICKS;
}

export function campaignCommunicationsBlackoutActiveV2(
  state: Pick<WorldStateV2, 'polarEndgame'>,
  content: WorldContentV2,
): boolean {
  return content.metadata?.scenarioId === 'standard-2026'
    && state.polarEndgame.communicationsBlackoutTick !== null;
}

/** Campaign no longer has a guided opening lock; ordinary war rules apply immediately. */
export function campaignWarsUnlockedV2(
  _state: Pick<WorldStateV2, 'polarEndgame' | 'wars' | 'nextWarId'>,
  _content: WorldContentV2,
): boolean {
  return true;
}

export function campaignAiVsAiWarOpeningTickV2(
  _state: Pick<WorldStateV2, 'humanPlayerIds' | 'polarEndgame'>,
  _content: WorldContentV2,
): number {
  return AI_FIRST_WAR_TICK;
}

/**
 * The proof-of-manipulation conflict never advances underneath an unread APEX
 * briefing. Requiring every connected human seat also prevents multiplayer
 * reconnects from skipping one player's story. A pre-narrative authenticated
 * save has no transmission history at all and keeps its established cadence.
 */
export function campaignBlackoutBriefingAcknowledgedV2(
  _state: Pick<WorldStateV2, 'humanPlayerIds' | 'polarEndgame'>,
  _content: WorldContentV2,
): boolean {
  return true;
}

export function campaignAiVsAiWarsUnlockedV2(
  state: Pick<WorldStateV2, 'tick' | 'humanPlayerIds' | 'polarEndgame'>,
  content: WorldContentV2,
): boolean {
  return campaignBlackoutBriefingAcknowledgedV2(state, content)
    && state.tick >= campaignAiVsAiWarOpeningTickV2(state, content);
}

/** The first-strike preview becomes available after the manipulation is explained. */
export function campaignHumanWarStoryReadyV2(
  _state: Pick<WorldStateV2, 'polarEndgame'>,
  _content: WorldContentV2,
  _playerId: PlayerId,
): boolean {
  return true;
}

/** No Campaign declaration may involve this seat before its tutorial briefing resolves. */
export function campaignHumanWarsUnlockedV2(
  _state: Pick<WorldStateV2, 'polarEndgame'>,
  _content: WorldContentV2,
  _playerId: PlayerId,
): boolean {
  return true;
}
