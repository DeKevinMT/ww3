import { clamp, smoothstep } from './balance';
import type { WorldContentV2 } from './content';
import {
  selectArmyStrengthV2,
  selectTrainedReserveCapacityV2,
  selectWarsOfV2,
} from './selectors';
import type { PlayerId, WorldStateV2 } from './types';

export type WarStrainLevelV2 = 'sustainable' | 'stretched' | 'overextended' | 'critical' | 'recovering';

export interface WarStrainInputsV2 {
  activeWars: number;
  activeFronts: number;
  /** Naval routes are real fronts, but each adds less theatre strain than a land contact line. */
  navalFronts?: number;
  /** Mean age of the country's live wars. A fresh declaration starts near zero. */
  warDurationWeeks?: number;
  warFatigue: number;
  armyFillRatio: number;
  reserveFillRatio: number;
}

export const NAVAL_WAR_STRAIN_FRONT_WEIGHT_V2 = 0.25;

/** Only recent expansion tempo, not the duration of one difficult war, alarms neighbours. */
export const EXPANSION_THREAT_CONQUEST_WINDOW_WEEKS_V2 = 104;

export interface ExpansionThreatSummaryV2 {
  score: number;
  activeOffensiveWars: number;
  recentConquestCountries: number;
  recentConquestTempo: number;
  scaleBonus: number;
}

export interface WarStrainSummaryV2 {
  score: number;
  level: WarStrainLevelV2;
  label: string;
  guidance: string;
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

function bounded(value: number, minimum = 0, maximum = 1): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(maximum, value));
}

/**
 * Canonical derived summary of campaign sustainability. A declaration starts
 * gently, duration builds real pressure, and simultaneous wars receive a
 * deliberately steeper penalty than extra fronts inside one conflict.
 */
export function summarizeWarStrainV2(inputs: WarStrainInputsV2): WarStrainSummaryV2 {
  const activeWars = Math.max(0, Math.floor(Number.isFinite(inputs.activeWars) ? inputs.activeWars : 0));
  const activeFronts = Math.max(0, Number.isFinite(inputs.activeFronts) ? inputs.activeFronts : 0);
  const navalFronts = clamp(
    Number.isFinite(inputs.navalFronts) ? inputs.navalFronts ?? 0 : 0,
    0,
    activeFronts,
  );
  const effectiveFronts = activeFronts - navalFronts
    + navalFronts * NAVAL_WAR_STRAIN_FRONT_WEIGHT_V2;
  const warDurationWeeks = Math.max(
    0,
    Number.isFinite(inputs.warDurationWeeks) ? inputs.warDurationWeeks ?? 0 : 0,
  );
  const fatigue = bounded(inputs.warFatigue, 0, 100);
  const armyFill = bounded(inputs.armyFillRatio);
  const reserveFill = bounded(inputs.reserveFillRatio);
  const atWar = activeWars > 0;
  const extraWars = Math.max(0, activeWars - 1);
  const extraFronts = Math.max(0, effectiveFronts - 1);
  const durationStrain = 18 * (1 - Math.exp(-warDurationWeeks / 84));
  const simultaneousWarStrain = Math.min(28, 8 * Math.pow(extraWars, 1.25));
  const rawScore = atWar
    ? 2 + 3 * Math.min(1, effectiveFronts)
      + simultaneousWarStrain
      + 2.25 * Math.log2(1 + extraFronts)
      + durationStrain
      + 0.48 * fatigue
      + 8.5 * (1 - armyFill)
      + 5 * (1 - reserveFill)
    : 0.56 * fatigue;
  const score = Math.round(bounded(rawScore, 0, 100));

  if (!atWar && fatigue > 0) return {
    score,
    level: 'recovering',
    label: 'RECOVERING',
    guidance: 'The campaign has ended; fatigue fades as the country stabilizes.',
  };
  if (score >= 75) return {
    score,
    level: 'critical',
    label: 'CRITICAL OVERREACH',
    guidance: 'Your army and reserves are close to exhaustion. Another push risks a long and expensive recovery.',
  };
  if (score >= 55) return {
    score,
    level: 'overextended',
    label: 'OVEREXTENDED',
    guidance: 'Losses, extra fronts and fatigue are compounding. Consolidate or seek peace before the next push.',
  };
  if (score >= 30) return {
    score,
    level: 'stretched',
    label: 'STRETCHED',
    guidance: 'The war is sustainable for now, but costs and recovery time are building.',
  };
  return {
    score,
    level: 'sustainable',
    label: 'SUSTAINABLE',
    guidance: 'Current force, reserve and fatigue levels can support this pace.',
  };
}

/**
 * Progressive Expansion Threat curve. Below 40 there is no extra risk. A guarded
 * border begins with a deliberately small four-percent pressure signal, then
 * rises smoothly through HIGH (60) and CRITICAL (80) to its bounded maximum.
 */
export function counterattackRiskForWarStrainV2(
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
    ? 'Only countries sharing a live land border can exploit this strain.'
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
 * Separates geopolitical expansion threat from military War Pressure. One
 * long, exhausting campaign contributes only a small signal. Two recent
 * sovereign conquests, several simultaneous offensive wars, or both in quick
 * succession cross the reaction threshold. Country scale matters only after
 * such a pattern exists, so a minor is allowed a credible first expansion.
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
 * Public UI/AI selector: `neighbourId` is the possible attacker and
 * `strainedId` is the country whose expansion tempo may invite a counterattack.
 */
export function selectNeighborCounterattackRiskV2(
  state: WorldStateV2,
  content: WorldContentV2,
  neighbourId: PlayerId,
  strainedId: PlayerId,
): NeighborCounterattackRiskV2 {
  return counterattackRiskForWarStrainV2(
    selectExpansionThreatSummaryV2(state, content, strainedId).score,
    areLandNeighborNationsV2(state, content, neighbourId, strainedId),
  );
}

/**
 * Derives exactly the same score for simulation decisions and the HUD. Nothing
 * here is persisted, random or viewer-dependent.
 */
export function selectWarStrainSummaryV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): WarStrainSummaryV2 {
  const nation = state.players[playerId];
  if (!nation) return summarizeWarStrainV2({
    activeWars: 0,
    activeFronts: 0,
    warFatigue: 0,
    armyFillRatio: 0,
    reserveFillRatio: 0,
  });
  const wars = selectWarsOfV2(state, playerId);
  const operations = wars.flatMap((war) => (
    war.attackerId === playerId ? war.attackerOperations : war.defenderOperations
  ));
  const activeFronts = operations.length;
  const navalFronts = operations.filter((operation) => operation.access === 'naval').length;
  const warDurationWeeks = wars.length > 0
    ? wars.reduce((sum, war) => sum + Math.max(0, state.tick - war.startedTick), 0) / wars.length
    : 0;
  const army = selectArmyStrengthV2(state, content, playerId);
  const reserveCapacity = selectTrainedReserveCapacityV2(state, playerId);
  return summarizeWarStrainV2({
    activeWars: wars.length,
    activeFronts,
    navalFronts,
    warDurationWeeks,
    warFatigue: nation.warFatigue,
    armyFillRatio: army.fillRatio,
    reserveFillRatio: reserveCapacity > 0
      ? clamp(nation.trainedReserves / reserveCapacity, 0, 1)
      : 1,
  });
}
