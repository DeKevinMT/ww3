export type WarStrainLevelV2 = 'sustainable' | 'stretched' | 'overextended' | 'critical' | 'recovering';

export interface WarStrainInputsV2 {
  activeWars: number;
  activeFronts: number;
  warFatigue: number;
  armyFillRatio: number;
  reserveFillRatio: number;
}

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
 * Read-only HUD summary of existing war pressure. It creates no gameplay
 * modifier: fronts, accumulated fatigue and depleted personnel merely explain
 * how sustainable the current campaign already is.
 */
export function summarizeWarStrainV2(inputs: WarStrainInputsV2): WarStrainSummaryV2 {
  const activeWars = Math.max(0, Math.floor(Number.isFinite(inputs.activeWars) ? inputs.activeWars : 0));
  const activeFronts = Math.max(0, Math.floor(Number.isFinite(inputs.activeFronts) ? inputs.activeFronts : 0));
  const fatigue = bounded(inputs.warFatigue, 0, 100);
  const armyFill = bounded(inputs.armyFillRatio);
  const reserveFill = bounded(inputs.reserveFillRatio);
  const atWar = activeWars > 0;
  const rawScore = atWar
    ? 14
      + 7 * Math.max(0, activeWars - 1)
      + 9 * Math.max(0, activeFronts - 1)
      + 0.48 * fatigue
      + 18 * (1 - armyFill)
      + 12 * (1 - reserveFill)
    : 0.65 * fatigue;
  const score = Math.round(bounded(rawScore, 0, 100));

  if (!atWar && fatigue > 0) return {
    score,
    level: 'recovering',
    label: 'RECOVERING',
    guidance: 'The campaign has ended; remaining economic and operational drag fades each peaceful week.',
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
