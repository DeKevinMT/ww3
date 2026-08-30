import type { WarAccessV2 } from './types';

export type AvailableWarTargetAccessV2 = Exclude<WarAccessV2, 'none'>;

/** Canonical route facts shared by simulation guidance and the War UI. */
export interface WarTargetRouteIntelInputV2 {
  readonly access: AvailableWarTargetAccessV2;
  readonly distanceKm?: number;
  readonly sameRegion?: boolean;
  readonly existingBeachhead?: boolean;
  readonly frontSupply?: number;
  readonly transferThroughput?: number;
  readonly stagingReadiness?: number;
  readonly preparationWeeks?: number;
  readonly etaWeeks?: number;
}

export interface WarTargetRecommendationRankInputV2 extends WarTargetRouteIntelInputV2 {
  readonly targetId: string;
  readonly chance: number;
  readonly gdpPerCapitaThousands?: number;
  readonly nationalIq?: number;
}

const FUSION_VALUE_MAX = 4;
const NAVAL_ACCESS_PENALTY = 3;
const NAVAL_DISTANCE_KM_PER_POINT = 500;
const SAME_REGION_RELIEF = 5;
const BEACHHEAD_RELIEF = 7;
const MINIMUM_NAVAL_PENALTY = 1.5;
const READINESS_NEUTRAL_POINT = 0.65;

function finiteClamped(value: number | undefined, minimum: number, maximum: number): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  return Math.max(minimum, Math.min(maximum, value!));
}

function safeChance(chance: number): number {
  return finiteClamped(chance, 0, 100) ?? 0;
}

function safeDistance(distanceKm: number | undefined): number {
  return finiteClamped(distanceKm, 0, Number.MAX_SAFE_INTEGER) ?? 0;
}

function readinessPenalty(value: number | undefined, weight: number): number {
  const readiness = finiteClamped(value, 0, 1);
  return readiness === undefined ? 0 : (READINESS_NEUTRAL_POINT - readiness) * weight;
}

function routeEtaWeeks(target: WarTargetRouteIntelInputV2): number | undefined {
  return finiteClamped(target.etaWeeks ?? target.preparationWeeks, 0, Number.MAX_SAFE_INTEGER);
}

function routeInput(
  accessOrTarget: AvailableWarTargetAccessV2 | WarTargetRouteIntelInputV2,
  distanceKm?: number,
): WarTargetRouteIntelInputV2 {
  return typeof accessOrTarget === 'string'
    ? { access: accessOrTarget, distanceKm }
    : accessOrTarget;
}

/** Valuable targets break close calls but never erase a military disadvantage. */
export function warTargetFusionValueBonusV2(
  target: Pick<WarTargetRecommendationRankInputV2, 'gdpPerCapitaThousands' | 'nationalIq'>,
): number {
  const wealth = finiteClamped(target.gdpPerCapitaThousands, 0, Number.MAX_SAFE_INTEGER) ?? 0;
  const iq = Number.isFinite(target.nationalIq) ? target.nationalIq ?? 0 : 0;
  const wealthBonus = 2 * Math.min(1, Math.log1p(wealth / 10) / Math.log(11));
  const iqBonus = 2 * Math.max(0, Math.min(1, (iq - 70) / 50));
  return Math.min(FUSION_VALUE_MAX, wealthBonus + iqBonus);
}

/** Route friction is expressed in forecast percentage points. */
export function warTargetRoutePenaltyV2(
  access: AvailableWarTargetAccessV2,
  distanceKm?: number,
): number;
export function warTargetRoutePenaltyV2(target: WarTargetRouteIntelInputV2): number;
export function warTargetRoutePenaltyV2(
  accessOrTarget: AvailableWarTargetAccessV2 | WarTargetRouteIntelInputV2,
  distanceKm?: number,
): number {
  const target = routeInput(accessOrTarget, distanceKm);
  if (target.access === 'land') return 0;
  const distancePenalty = safeDistance(target.distanceKm) / NAVAL_DISTANCE_KM_PER_POINT;
  const regionalRelief = target.sameRegion === true ? SAME_REGION_RELIEF : 0;
  const beachheadRelief = target.existingBeachhead === true ? BEACHHEAD_RELIEF : 0;
  const supplyPenalty = readinessPenalty(target.frontSupply, 10);
  const throughputPenalty = readinessPenalty(target.transferThroughput, 8);
  const stagingPenalty = readinessPenalty(target.stagingReadiness, 8);
  const preparationPenalty = Math.min(12, (routeEtaWeeks(target) ?? 0) * 0.75);
  return Math.max(
    MINIMUM_NAVAL_PENALTY,
    NAVAL_ACCESS_PENALTY + distancePenalty + supplyPenalty + throughputPenalty
      + stagingPenalty + preparationPenalty - regionalRelief - beachheadRelief,
  );
}

export function warTargetRecommendationScoreV2(
  target: WarTargetRecommendationRankInputV2,
): number {
  return safeChance(target.chance) - warTargetRoutePenaltyV2(target)
    + warTargetFusionValueBonusV2(target);
}

export function compareWarTargetRecommendationsV2(
  left: WarTargetRecommendationRankInputV2,
  right: WarTargetRecommendationRankInputV2,
): number {
  const scoreDifference = warTargetRecommendationScoreV2(right)
    - warTargetRecommendationScoreV2(left);
  if (Math.abs(scoreDifference) > 0.000_001) return scoreDifference;
  const chanceDifference = safeChance(right.chance) - safeChance(left.chance);
  if (Math.abs(chanceDifference) > 0.000_001) return chanceDifference;
  const routeDifference = warTargetRoutePenaltyV2(left) - warTargetRoutePenaltyV2(right);
  if (Math.abs(routeDifference) > 0.000_001) return routeDifference;
  const distanceDifference = safeDistance(left.distanceKm) - safeDistance(right.distanceKm);
  if (Math.abs(distanceDifference) > 0.000_001) return distanceDifference;
  return left.targetId < right.targetId ? -1 : left.targetId > right.targetId ? 1 : 0;
}

export function rankWarTargetRecommendationsV2<T extends WarTargetRecommendationRankInputV2>(
  targets: readonly T[],
): T[] {
  return [...targets].sort(compareWarTargetRecommendationsV2);
}
