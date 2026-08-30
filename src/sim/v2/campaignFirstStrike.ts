import { clamp } from './balance';
import { ROGUE_AI_NATION_ID_V2, type WorldContentV2 } from './content';
import {
  CAMPAIGN_FIRST_STRIKE_MOBILIZATION_TICKS_V2,
  campaignHumanWarStoryReadyV2,
} from './campaignPrologue';
import { campaignTutorialBypassedV2 } from './campaignTutorial';
import { recordApexFirstStrikeGuidanceV2 } from './apexNarrative';
import {
  selectIsEliminatedV2,
  selectNationalEconomyV2,
  selectNationalIqViewV2,
  selectWarRouteDistanceKmV2,
} from './selectors';
import type { PlayerId, TerritoryId, WorldStateV2 } from './types';
import { forecastWarV2, warDeclarationStatusV2 } from './war';
import {
  rankWarTargetRecommendationsV2,
  type WarTargetRecommendationRankInputV2,
} from './warTargetRanking';

export const FIRST_STRIKE_GUIDANCE_MIN_WIN_CHANCE_V2 = 35;

export interface CampaignFirstStrikeTargetV2
  extends WarTargetRecommendationRankInputV2 {
  opponentId: PlayerId;
  objectiveTerritoryId: TerritoryId;
  sourceTerritoryId: TerritoryId;
  reason: string;
}

/** The same canonical distance/logistics ranking used by the in-game War list. */
export function selectCampaignFirstStrikeTargetV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): CampaignFirstStrikeTargetV2 | undefined {
  if (content.metadata?.scenarioId !== 'standard-2026'
    || state.polarEndgame.communicationsBlackoutTick === null
    || !campaignHumanWarStoryReadyV2(state, content, playerId)
    || state.wars.some((war) => war.attackerId === playerId || war.defenderId === playerId)) {
    return undefined;
  }
  const candidates = content.nationIds.flatMap((opponentId): CampaignFirstStrikeTargetV2[] => {
    if (opponentId === playerId || opponentId === ROGUE_AI_NATION_ID_V2
      || !state.players[opponentId] || selectIsEliminatedV2(state, opponentId)) return [];
    const declaration = warDeclarationStatusV2(
      state,
      content,
      playerId,
      opponentId,
      undefined,
      { ignoreCampaignTutorialLock: true },
    );
    if (!declaration.allowed || declaration.access === 'none') return [];
    const forecast = forecastWarV2(state, content, playerId, opponentId);
    if (!forecast.sourceId || !forecast.targetId) return [];
    const distanceKm = selectWarRouteDistanceKmV2(state, content, playerId, opponentId);
    const sourceRegion = content.territories[forecast.sourceId]?.regionId;
    const targetRegion = content.territories[forecast.targetId]?.regionId;
    const sameRegion = Boolean(sourceRegion && targetRegion && sourceRegion === targetRegion);
    const existingBeachhead = Boolean(targetRegion && content.territoryIds.some((territoryId) => (
      content.territories[territoryId]?.regionId === targetRegion
        && state.territories[territoryId]?.owner === playerId
    )));
    const sourceArmy = state.territories[forecast.sourceId]?.army;
    const stagingReadiness = sourceArmy && sourceArmy.capacity > 0
      ? clamp(sourceArmy.manpower / sourceArmy.capacity, 0, 1) : 0;
    const preparationWeeks = declaration.access === 'naval'
      ? Math.max(4, Math.ceil((distanceKm ?? 2_500) / 1_200)) : 0;
    const chance = Math.round(forecast.winChance);
    const routeReason = declaration.access === 'land'
      ? 'It shares a reachable land route'
      : sameRegion ? 'It has a short regional sea route'
        : 'It is our safest reachable sea route';
    const reason = forecast.winChance >= FIRST_STRIKE_GUIDANCE_MIN_WIN_CHANCE_V2
      ? `${routeReason} with ${chance}% projected success.`
      : `${routeReason}, but projected success is only ${chance}%. Build readiness before confirming the attack.`;
    return [{
      targetId: opponentId,
      opponentId,
      objectiveTerritoryId: forecast.targetId,
      sourceTerritoryId: forecast.sourceId,
      chance: forecast.winChance,
      access: declaration.access,
      distanceKm,
      sameRegion,
      existingBeachhead,
      frontSupply: forecast.attackerSupply,
      transferThroughput: declaration.access === 'land'
        ? clamp(forecast.attackerSupply, 0, 1)
        : clamp(forecast.attackerSupply * 0.75, 0, 0.85),
      stagingReadiness,
      preparationWeeks,
      // APEX has already completed this route planning inside the briefing;
      // ETA is the real guided mobilisation wait, not a second phantom delay.
      etaWeeks: CAMPAIGN_FIRST_STRIKE_MOBILIZATION_TICKS_V2,
      gdpPerCapitaThousands: selectNationalEconomyV2(state, content, opponentId)
        .wealthPerPerson,
      nationalIq: selectNationalIqViewV2(state, content, opponentId).score,
      reason,
    }];
  });
  return rankWarTargetRecommendationsV2(candidates)[0];
}

/** Authoritative once-only per-seat tutorial continuation after Stage I. */
export function processCampaignFirstStrikeGuidanceV2(
  state: WorldStateV2,
  content: WorldContentV2,
): number {
  if (content.metadata?.scenarioId !== 'standard-2026'
    || state.polarEndgame.communicationsBlackoutTick === null) return 0;
  return [...state.humanPlayerIds]
    .sort((left, right) => left.localeCompare(right))
    .reduce((sent, playerId) => {
      if (campaignTutorialBypassedV2(state, content, playerId)) return sent;
      const target = selectCampaignFirstStrikeTargetV2(state, content, playerId);
      return sent + Number(Boolean(target) && recordApexFirstStrikeGuidanceV2(
        state,
        content,
        playerId,
        target!.objectiveTerritoryId,
        target!.reason,
      ));
    }, 0);
}
