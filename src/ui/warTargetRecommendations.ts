import type { WarAccessV2 } from '../sim/v2/types';

export type AvailableWarTargetAccessV2 = Exclude<WarAccessV2, 'none'>;

export interface WarTargetRecommendationRankInputV2 {
  readonly targetId: string;
  readonly chance: number;
  readonly access: AvailableWarTargetAccessV2;
  readonly distanceKm?: number;
  readonly gdpPerCapitaThousands?: number;
  readonly nationalIq?: number;
}

/** Bounded fusion value: conquest quality can add at most eight forecast points. */
export function warTargetFusionValueBonusV2(
  target: Pick<WarTargetRecommendationRankInputV2, 'gdpPerCapitaThousands' | 'nationalIq'>,
): number {
  const wealth = Number.isFinite(target.gdpPerCapitaThousands)
    ? Math.max(0, target.gdpPerCapitaThousands ?? 0) : 0;
  const iq = Number.isFinite(target.nationalIq) ? target.nationalIq ?? 0 : 0;
  const wealthBonus = 4 * Math.min(1, Math.log1p(wealth / 10) / Math.log(11));
  const iqBonus = 4 * Math.max(0, Math.min(1, (iq - 70) / 50));
  return Math.min(8, wealthBonus + iqBonus);
}

/**
 * Route friction is expressed in forecast percentage points so the military
 * outlook stays dominant. Naval access starts 1.5 points behind a land border
 * and adds at most another 6.5 points over 12,000 km. Consequently, any target
 * with a forecast advantage greater than eight points wins on military merit,
 * regardless of distance.
 */
export function warTargetRoutePenaltyV2(
  access: AvailableWarTargetAccessV2,
  distanceKm?: number,
): number {
  if (access === 'land') return 0;
  const finiteDistance = Number.isFinite(distanceKm) ? Math.max(0, distanceKm ?? 0) : 0;
  const distancePressure = Math.min(1, finiteDistance / 12_000);
  return 1.5 + 6.5 * distancePressure;
}

export function warTargetRecommendationScoreV2(
  target: WarTargetRecommendationRankInputV2,
): number {
  const chance = Number.isFinite(target.chance)
    ? Math.max(0, Math.min(100, target.chance))
    : 0;
  return chance - warTargetRoutePenaltyV2(target.access, target.distanceKm)
    + warTargetFusionValueBonusV2(target);
}

export function compareWarTargetRecommendationsV2(
  left: WarTargetRecommendationRankInputV2,
  right: WarTargetRecommendationRankInputV2,
): number {
  const scoreDifference = warTargetRecommendationScoreV2(right)
    - warTargetRecommendationScoreV2(left);
  if (Math.abs(scoreDifference) > 0.000_001) return scoreDifference;
  if (right.chance !== left.chance) return right.chance - left.chance;
  const routeDifference = warTargetRoutePenaltyV2(left.access, left.distanceKm)
    - warTargetRoutePenaltyV2(right.access, right.distanceKm);
  if (Math.abs(routeDifference) > 0.000_001) return routeDifference;
  const distanceDifference = (left.distanceKm ?? 0) - (right.distanceKm ?? 0);
  if (distanceDifference !== 0) return distanceDifference;
  return left.targetId < right.targetId ? -1 : left.targetId > right.targetId ? 1 : 0;
}

export function rankWarTargetRecommendationsV2<T extends WarTargetRecommendationRankInputV2>(
  targets: readonly T[],
): T[] {
  return [...targets].sort(compareWarTargetRecommendationsV2);
}

function roundedDistanceLabel(distanceKm: number): string {
  return Math.round(Math.max(0, distanceKm)).toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Compact route intel for the recommendation row. */
export function warTargetRouteLabelV2(
  access: AvailableWarTargetAccessV2,
  distanceKm?: number,
): string {
  if (access === 'land') return 'LAND BORDER';
  if (!Number.isFinite(distanceKm)) return 'NAVAL';
  const distance = Math.max(0, distanceKm ?? 0);
  const category = distance <= 2_000 ? 'SHORT NAVAL'
    : distance >= 6_500 ? 'LONG NAVAL' : 'NAVAL';
  return `${category} · ${roundedDistanceLabel(distance)} KM`;
}
