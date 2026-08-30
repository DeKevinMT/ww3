import { clamp, smoothstep } from './balance';
import type { WorldContentV2 } from './content';
import type { PlayerId, WorldStateV2 } from './types';

/** Only recent expansion tempo, not the duration of one difficult war, alarms neighbours. */
export const EXPANSION_THREAT_CONQUEST_WINDOW_WEEKS_V2 = 104;

export interface ExpansionThreatSummaryV2 {
  score: number;
  activeOffensiveWars: number;
  recentConquestCountries: number;
  recentConquestTempo: number;
  scaleBonus: number;
}

export type NeighborCounterattackRiskLevelV2 = 'none' | 'guarded' | 'high' | 'critical';

/**
 * Canonical anti-expansion signal shared by the AI and UI. The score remains
 * visible for non-neighbours, but every strategic modifier is exactly zero
 * unless the two live empires share a real land border.
 */
export interface NeighborCounterattackRiskV2 {
  score: number;
  isLandNeighbor: boolean;
  level: NeighborCounterattackRiskLevelV2;
  label: string;
  guidance: string;
  pressure: number;
  priorityBonus: number;
  declarationChanceBonus: number;
  rivalCautionMultiplier: number;
  targetWarLimit: number;
}

/**
 * Progressive Expansion Threat curve. Below 40 there is no extra risk. A guarded
 * border begins with a deliberately small four-percent pressure signal, then
 * rises smoothly through HIGH (60) and CRITICAL (80) to its bounded maximum.
 */
export function counterattackRiskForExpansionThreatV2(
  score: number,
  isLandNeighbor: boolean,
): NeighborCounterattackRiskV2 {
  const boundedScore = Number.isFinite(score) ? clamp(score, 0, 100) : 0;
  const level: NeighborCounterattackRiskLevelV2 = !isLandNeighbor || boundedScore < 40
    ? 'none' : boundedScore >= 80 ? 'critical' : boundedScore >= 60 ? 'high' : 'guarded';
  const pressure = level === 'none' ? 0 : clamp(
    0.04
      + 0.12 * smoothstep(40, 60, boundedScore)
      + 0.26 * smoothstep(60, 80, boundedScore)
      + 0.38 * smoothstep(80, 100, boundedScore),
    0,
    1,
  );
  const label = !isLandNeighbor ? 'NO LAND BORDER'
    : level === 'critical' ? 'CRITICAL COUNTERATTACK RISK'
      : level === 'high' ? 'HIGH COUNTERATTACK RISK'
        : level === 'guarded' ? 'GUARDED BORDER'
          : 'LOW COUNTERATTACK RISK';
  const guidance = !isLandNeighbor
    ? 'Only countries sharing a live land border can react to this expansion pattern.'
    : level === 'critical'
      ? 'Repeated expansion has created an exceptional opening for neighbouring armies.'
      : level === 'high'
        ? 'Land neighbours are actively weighing a response to rapid expansion.'
        : level === 'guarded'
          ? 'Land neighbours are becoming more alert to the recent expansion pattern.'
          : 'Expansion Threat is controlled and creates no extra neighbour aggression.';
  return {
    score: Math.round(boundedScore),
    isLandNeighbor,
    level,
    label,
    guidance,
    pressure,
    priorityBonus: 36 * pressure,
    declarationChanceBonus: 0.18 * pressure,
    rivalCautionMultiplier: 1 - 0.55 * pressure,
    targetWarLimit: level === 'critical' ? 3 : level === 'high' ? 2 : 1,
  };
}

/**
 * Expansion Threat is geopolitical tempo, not military exhaustion. One long,
 * difficult campaign contributes only a small signal. Two recent sovereign
 * conquests, several simultaneous offensive wars, or both in quick succession
 * cross the reaction threshold. Country scale matters only after such a pattern
 * exists, so a minor is allowed a credible first expansion.
 */
export function selectExpansionThreatSummaryV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): ExpansionThreatSummaryV2 {
  const activeOffensiveWars = state.wars.filter((war) => war.attackerId === playerId).length;
  const newestConquestByCountry = new Map<PlayerId, number>();
  for (const territory of Object.values(state.territories)) {
    const program = territory.integrationProgram;
    if (territory.owner !== playerId || !program || program.toOwnerId !== playerId
      || program.cause !== 'conquest' || program.fromOwnerId === playerId) continue;
    const age = Math.max(0, state.tick - program.startedTick);
    const recency = clamp(1 - age / EXPANSION_THREAT_CONQUEST_WINDOW_WEEKS_V2, 0, 1);
    if (recency <= 0) continue;
    newestConquestByCountry.set(
      program.fromOwnerId,
      Math.max(newestConquestByCountry.get(program.fromOwnerId) ?? 0, recency),
    );
  }
  const recentConquestTempo = [...newestConquestByCountry.values()]
    .reduce((sum, recency) => sum + recency, 0);
  const offensiveTempo = activeOffensiveWars <= 0 ? 0 : Math.min(
    65,
    5 + 31 * Math.pow(Math.max(0, activeOffensiveWars - 1), 0.90),
  );
  const conquestTempo = Math.min(
    70,
    8 * Math.min(1, recentConquestTempo)
      + 34 * Math.max(0, recentConquestTempo - 1),
  );
  const combinedTempo = activeOffensiveWars > 0 && recentConquestTempo > 0
    ? 10 * Math.min(1, recentConquestTempo) : 0;
  const ownedTerritories = Object.values(state.territories)
    .filter((territory) => territory.owner === playerId);
  const controlledPopulation = ownedTerritories.reduce(
    (sum, territory) => sum + Math.max(0, territory.population),
    0,
  );
  const hasExpansionPattern = activeOffensiveWars >= 2 || recentConquestTempo > 1;
  const scaleBonus = hasExpansionPattern
    ? 8 * smoothstep(20, 250, controlledPopulation)
      + 4 * smoothstep(2, 8, ownedTerritories.length)
    : 0;
  return {
    score: Math.round(clamp(offensiveTempo + conquestTempo + combinedTempo + scaleBonus, 0, 100)),
    activeOffensiveWars,
    recentConquestCountries: newestConquestByCountry.size,
    recentConquestTempo,
    scaleBonus,
  };
}

/** Current ownership, not historical geography, defines a live land border. */
export function areLandNeighborNationsV2(
  state: WorldStateV2,
  content: WorldContentV2,
  leftId: PlayerId,
  rightId: PlayerId,
): boolean {
  if (leftId === rightId) return false;
  return content.territoryIds.some((sourceId) => {
    if (state.territories[sourceId]?.owner !== leftId) return false;
    return (content.territories[sourceId]?.connections ?? []).some((connection) => (
      connection.kind === 'land'
        && state.territories[connection.targetId]?.owner === rightId
    ));
  });
}

/**
 * `neighbourId` is the possible attacker and `expandingId` is the country
 * whose expansion tempo may invite a counterattack.
 */
export function selectNeighborCounterattackRiskV2(
  state: WorldStateV2,
  content: WorldContentV2,
  neighbourId: PlayerId,
  expandingId: PlayerId,
): NeighborCounterattackRiskV2 {
  return counterattackRiskForExpansionThreatV2(
    selectExpansionThreatSummaryV2(state, content, expandingId).score,
    areLandNeighborNationsV2(state, content, neighbourId, expandingId),
  );
}
