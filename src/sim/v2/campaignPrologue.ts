import { AI_FIRST_WAR_TICK, BATTLE_INTERVAL_TICKS, WAR_MOBILIZATION_TICKS } from './balance';
import type { WorldContentV2 } from './content';
import { campaignTutorialBypassedV2 } from './campaignTutorial';
import type { PlayerId, WarStateV2, WorldStateV2 } from './types';

export const CAMPAIGN_WAR_LOCK_REASON_V2
  = 'Complete Signal Triangulation to restore verified military intelligence.';
export const CAMPAIGN_HUMAN_WAR_STORY_LOCK_REASON_V2
  = 'Wait for APEX to finish the first-strike briefing.';

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

/** Survival/Alternative keep their own opening rules; only Campaign has this prologue lock. */
export function campaignWarsUnlockedV2(
  state: Pick<WorldStateV2, 'polarEndgame' | 'wars' | 'nextWarId'>,
  content: WorldContentV2,
): boolean {
  if (content.metadata?.scenarioId !== 'standard-2026') return true;
  if (campaignCommunicationsBlackoutActiveV2(state, content)) return true;
  // Defence-in-depth for authenticated legacy saves: an old timeline that
  // already fought can never be frozen by a newly introduced prologue field.
  return state.wars.length > 0 || state.nextWarId > 1;
}

export function campaignAiVsAiWarOpeningTickV2(
  state: Pick<WorldStateV2, 'humanPlayerIds' | 'polarEndgame'>,
  content: WorldContentV2,
): number {
  if (content.metadata?.scenarioId !== 'standard-2026') return AI_FIRST_WAR_TICK;
  if (state.humanPlayerIds.length > 0 && state.humanPlayerIds.every((playerId) => (
    campaignTutorialBypassedV2(state, content, playerId)
  ))) return AI_FIRST_WAR_TICK;
  const blackoutTick = state.polarEndgame.communicationsBlackoutTick;
  if (blackoutTick === null) return Number.POSITIVE_INFINITY;
  // The Campaign proof conflict belongs to the tutorial chronology, not the
  // ordinary autonomous-AI year-one floor. Other modes keep that global floor.
  return blackoutTick + CAMPAIGN_AI_VS_AI_POST_BLACKOUT_GRACE_TICKS_V2;
}

/**
 * The proof-of-manipulation conflict never advances underneath an unread APEX
 * briefing. Requiring every connected human seat also prevents multiplayer
 * reconnects from skipping one player's story. A pre-narrative authenticated
 * save has no transmission history at all and keeps its established cadence.
 */
export function campaignBlackoutBriefingAcknowledgedV2(
  state: Pick<WorldStateV2, 'humanPlayerIds' | 'polarEndgame'>,
  content: WorldContentV2,
): boolean {
  if (content.metadata?.scenarioId !== 'standard-2026') return true;
  const histories = state.humanPlayerIds.map((playerId) => (
    state.polarEndgame.apexNarrative.players[playerId]?.transmissions ?? []
  ));
  if (histories.every((history) => history.length === 0)) return true;
  return histories.every((history) => history.some((item) => (
    item.id === 'campaign-communications-blackout' && item.choice !== null
  )));
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
  state: Pick<WorldStateV2, 'polarEndgame'>,
  content: WorldContentV2,
  playerId: PlayerId,
): boolean {
  if (content.metadata?.scenarioId !== 'standard-2026') return true;
  if (campaignTutorialBypassedV2(state, content, playerId)) return true;
  return state.polarEndgame.apexNarrative.players[playerId]?.transmissions.some((item) => (
    item.id === 'campaign-ai-defeat-pattern' && item.choice !== null
  )) === true;
}

/** No Campaign declaration may involve this seat before its tutorial briefing resolves. */
export function campaignHumanWarsUnlockedV2(
  state: Pick<WorldStateV2, 'polarEndgame'>,
  content: WorldContentV2,
  playerId: PlayerId,
): boolean {
  if (content.metadata?.scenarioId !== 'standard-2026') return true;
  if (campaignTutorialBypassedV2(state, content, playerId)) return true;
  return state.polarEndgame.apexNarrative.players[playerId]?.transmissions.some((item) => (
    item.id === 'campaign-first-strike-guidance' && item.choice !== null
  )) === true;
}
