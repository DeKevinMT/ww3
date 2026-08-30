import type { LocalHostileThreatLevelV2 } from '../sim/v2/localHostileThreat';

export type ApexTerritoryIntelModeV2 = 'full' | 'partial' | 'dossier' | 'hidden';

export interface ApexTerritoryIntelVisibilityInputV2 {
  readonly fogEnabled: boolean;
  readonly exactIntelVisible: boolean;
  readonly mapClear: boolean;
  readonly accountCharted: boolean;
}

export interface PartialApexIntelInputV2 {
  /** Used only to select a privacy-preserving range; never returned verbatim. */
  readonly exactCombatPower: number;
  readonly accountCharted: boolean;
  readonly threatLevel?: LocalHostileThreatLevelV2;
  readonly activeWar: boolean;
  readonly access: 'land' | 'naval' | 'none';
  readonly distanceKm?: number;
  /** Exact ratios are collapsed into broad operational descriptions. */
  readonly readinessRatio: number;
}

export interface PartialApexIntelPresentationV2 {
  readonly combatPowerBand: string;
  readonly combatPowerAriaLabel: string;
  readonly estimateQuality: 'BROAD ESTIMATE' | 'DOSSIER ESTIMATE';
  readonly threat: string;
  readonly access: string;
  readonly accessDetail: string;
  readonly readiness: string;
  readonly verification: 'UNVERIFIED';
}

const BROAD_POWER_THRESHOLDS_V2 = Object.freeze([
  0, 5, 10, 20, 40, 75, 125, 200, 350, 600, 1_000, 1_800,
  3_000, 5_000, 8_000, 12_000, 20_000, 32_000, 50_000,
]);

const DOSSIER_POWER_THRESHOLDS_V2 = Object.freeze([
  0, 5, 10, 15, 25, 40, 60, 90, 135, 200, 300, 450, 675, 1_000,
  1_500, 2_250, 3_400, 5_100, 7_600, 11_500, 17_000, 25_000, 38_000, 57_000,
]);

function finiteRatio(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function formatPowerBoundaryV2(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  return `${Math.round(value)}`;
}

/**
 * Fixed, deterministic bins deliberately avoid displaying a noisy fake exact
 * number. Account dossiers narrow the bin, but still never reveal live power.
 */
export function partialApexCombatPowerBandV2(
  exactCombatPower: number,
  accountCharted: boolean,
): { readonly lower: number; readonly upper: number; readonly label: string } {
  const power = finiteRatio(exactCombatPower);
  const base = accountCharted ? DOSSIER_POWER_THRESHOLDS_V2 : BROAD_POWER_THRESHOLDS_V2;
  const thresholds = [...base];
  while (power >= thresholds[thresholds.length - 1]!) {
    thresholds.push(thresholds[thresholds.length - 1]! * 2);
  }
  const upperIndex = Math.max(1, thresholds.findIndex((threshold) => power < threshold));
  const lower = thresholds[upperIndex - 1]!;
  const upper = thresholds[upperIndex]!;
  return {
    lower,
    upper,
    label: `${formatPowerBoundaryV2(lower)}–${formatPowerBoundaryV2(upper)}`,
  };
}

export function resolveApexTerritoryIntelModeV2(
  _input: ApexTerritoryIntelVisibilityInputV2,
): ApexTerritoryIntelModeV2 {
  // Reachability may still tint the political map, but it never redacts the
  // inspector. Attack legality remains a separate simulation rule.
  return 'full';
}

function partialThreatLabelV2(
  level: LocalHostileThreatLevelV2 | undefined,
  activeWar: boolean,
): string {
  if (activeWar || level === 'imminent') return 'IMMINENT';
  if (level === 'likely') return 'LIKELY';
  if (level === 'watching') return 'WATCHING';
  if (level === 'calm') return 'LOW';
  return 'UNVERIFIED';
}

function partialReadinessLabelV2(ratio: number): string {
  const value = finiteRatio(ratio);
  if (value >= 0.82) return 'HIGH';
  if (value >= 0.55) return 'READY';
  if (value >= 0.28) return 'LOW';
  return 'MINIMAL';
}

export function buildPartialApexIntelPresentationV2(
  input: PartialApexIntelInputV2,
): PartialApexIntelPresentationV2 {
  const band = partialApexCombatPowerBandV2(input.exactCombatPower, input.accountCharted);
  const distance = Number.isFinite(input.distanceKm) && input.distanceKm !== undefined
    ? Math.max(0, Math.round(input.distanceKm)) : undefined;
  const access = input.access === 'land' ? 'LAND'
    : input.access === 'naval' ? 'NAVAL' : 'NO VERIFIED ROUTE';
  const accessDetail = input.access === 'land' ? 'SHARED BORDER'
    : input.access === 'naval' && distance !== undefined
      ? `${distance.toLocaleString('en-US')} KM`
      : input.access === 'naval' ? 'DISTANCE UNVERIFIED' : 'ACCESS UNVERIFIED';
  return {
    combatPowerBand: band.label,
    combatPowerAriaLabel: `Estimated Combat Power between ${formatPowerBoundaryV2(band.lower)} and ${formatPowerBoundaryV2(band.upper)}`,
    estimateQuality: input.accountCharted ? 'DOSSIER ESTIMATE' : 'BROAD ESTIMATE',
    threat: partialThreatLabelV2(input.threatLevel, input.activeWar),
    access,
    accessDetail,
    readiness: partialReadinessLabelV2(input.readinessRatio),
    verification: 'UNVERIFIED',
  };
}
