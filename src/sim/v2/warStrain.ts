import { clamp } from './balance';
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
  /** Temporary score carried by recent hostile territorial captures. */
  conquestAftershock?: number;
  warFatigue: number;
  armyFillRatio: number;
  reserveFillRatio: number;
}

export const NAVAL_WAR_STRAIN_FRONT_WEIGHT_V2 = 0.25;
export const CONQUEST_WAR_STRAIN_POINTS_V2 = 8;
export const CONQUEST_WAR_STRAIN_RECOVERY_WEEKS_V2 = 78;

export interface WarStrainSummaryV2 {
  score: number;
  level: WarStrainLevelV2;
  label: string;
  guidance: string;
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
  const conquestAftershock = bounded(inputs.conquestAftershock ?? 0, 0, 30);
  const fatigue = bounded(inputs.warFatigue, 0, 100);
  const armyFill = bounded(inputs.armyFillRatio);
  const reserveFill = bounded(inputs.reserveFillRatio);
  const atWar = activeWars > 0;
  const extraWars = Math.max(0, activeWars - 1);
  const extraFronts = Math.max(0, effectiveFronts - 1);
  const durationStrain = 22 * (1 - Math.exp(-warDurationWeeks / 60));
  const simultaneousWarStrain = Math.min(34, 10 * Math.pow(extraWars, 1.25));
  const rawScore = atWar
    ? 2 + 3 * Math.min(1, effectiveFronts)
      + simultaneousWarStrain
      + 3 * Math.log2(1 + extraFronts)
      + durationStrain
      + conquestAftershock
      + 0.56 * fatigue
      + 10 * (1 - armyFill)
      + 6 * (1 - reserveFill)
    : 0.65 * fatigue + conquestAftershock;
  const score = Math.round(bounded(rawScore, 0, 100));

  if (!atWar && (fatigue > 0 || conquestAftershock > 0)) return {
    score,
    level: 'recovering',
    label: 'RECOVERING',
    guidance: 'The campaign has ended; fatigue and recent conquest pressure fade as the country stabilizes.',
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
  const conquestAftershock = Math.min(30, Object.values(state.territories).reduce((sum, territory) => {
    const program = territory.integrationProgram;
    if (territory.owner !== playerId || !program || program.toOwnerId !== playerId
      || program.cause === 'federation') return sum;
    const age = Math.max(0, state.tick - program.startedTick);
    const recovery = clamp(1 - age / CONQUEST_WAR_STRAIN_RECOVERY_WEEKS_V2, 0, 1);
    return sum + CONQUEST_WAR_STRAIN_POINTS_V2 * recovery;
  }, 0));
  const army = selectArmyStrengthV2(state, content, playerId);
  const reserveCapacity = selectTrainedReserveCapacityV2(state, playerId);
  return summarizeWarStrainV2({
    activeWars: wars.length,
    activeFronts,
    navalFronts,
    warDurationWeeks,
    conquestAftershock,
    warFatigue: nation.warFatigue,
    armyFillRatio: army.fillRatio,
    reserveFillRatio: reserveCapacity > 0
      ? clamp(nation.trainedReserves / reserveCapacity, 0, 1)
      : 1,
  });
}
