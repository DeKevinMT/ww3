import type {
  AvailableWarTargetAccessV2,
  WarTargetRouteIntelInputV2,
} from '../sim/v2/warTargetRanking';

export type {
  AvailableWarTargetAccessV2,
  WarTargetRecommendationRankInputV2,
  WarTargetRouteIntelInputV2,
} from '../sim/v2/warTargetRanking';
export {
  compareWarTargetRecommendationsV2,
  rankWarTargetRecommendationsV2,
  warTargetFusionValueBonusV2,
  warTargetRecommendationScoreV2,
  warTargetRoutePenaltyV2,
} from '../sim/v2/warTargetRanking';

function finiteClamped(value: number | undefined, minimum: number, maximum: number): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  return Math.max(minimum, Math.min(maximum, value!));
}

function safeDistance(distanceKm: number | undefined): number {
  return finiteClamped(distanceKm, 0, Number.MAX_SAFE_INTEGER) ?? 0;
}

function routeInput(
  accessOrIntel: AvailableWarTargetAccessV2 | WarTargetRouteIntelInputV2,
  distanceKm?: number,
): WarTargetRouteIntelInputV2 {
  return typeof accessOrIntel === 'string'
    ? { access: accessOrIntel, distanceKm }
    : accessOrIntel;
}

function routeEtaWeeks(target: WarTargetRouteIntelInputV2): number | undefined {
  return finiteClamped(target.etaWeeks ?? target.preparationWeeks, 0, Number.MAX_SAFE_INTEGER);
}

function roundedNumberLabel(value: number): string {
  return Math.round(Math.max(0, value)).toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function routeCategory(target: WarTargetRouteIntelInputV2): string {
  if (target.access === 'land') return 'LAND BORDER';
  if (target.sameRegion === true || safeDistance(target.distanceKm) <= 2_500) {
    return 'REGIONAL NAVAL';
  }
  return 'OCEAN EXPEDITION';
}

/** Compact presentation of the same route facts used by canonical ranking. */
export function warTargetRouteLabelV2(
  access: AvailableWarTargetAccessV2,
  distanceKm?: number,
): string;
export function warTargetRouteLabelV2(target: WarTargetRouteIntelInputV2): string;
export function warTargetRouteLabelV2(
  accessOrTarget: AvailableWarTargetAccessV2 | WarTargetRouteIntelInputV2,
  distanceKm?: number,
): string {
  const target = routeInput(accessOrTarget, distanceKm);
  const parts = [routeCategory(target)];
  if (target.access === 'naval' && Number.isFinite(target.distanceKm)) {
    parts.push(`${roundedNumberLabel(target.distanceKm!)} KM`);
  }
  const etaWeeks = routeEtaWeeks(target);
  if (etaWeeks !== undefined) parts.push(`ETA ${roundedNumberLabel(etaWeeks)}D`);
  return parts.join(' · ');
}
