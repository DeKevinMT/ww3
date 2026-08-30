/**
 * Combat FX are presentation-only and deliberately invariant to army size.
 * A skirmish and a major-power attack therefore consume the same visual budget
 * and never turn simulation magnitude into extra GPU or DOM work.
 */
export const BATTLE_EFFECT_SCALE = 1;
export const BATTLE_PROJECTILE_SCALE = 0.82;
export const BATTLE_EFFECT_MAX_ACTIVE = 4;
export const BATTLE_EFFECT_COALESCE_WINDOW_MS = 280;
const MIN_WAVE_RADIUS_DEGREES = 0.8;
const MAX_WAVE_RADIUS_DEGREES = 70;

export interface BattleEffectMagnitudeInput {
  readonly attackerPower?: number;
  readonly attackerLosses?: number;
  readonly defenderLosses?: number;
}

type CountryRings = readonly (readonly (readonly [number, number])[])[];

/**
 * Kept as a function for renderer/API compatibility. Magnitude is intentionally
 * ignored: battle power and losses affect simulation outcomes, never FX scale.
 */
export function battleEffectScale(_input: BattleEffectMagnitudeInput): number {
  return BATTLE_EFFECT_SCALE;
}

/**
 * The projectile has one authored screen presence in every battle. The ignored
 * argument preserves the existing renderer call sites and saved-event contract.
 */
export function battleProjectileScale(_effectScale: number): number {
  return BATTLE_PROJECTILE_SCALE;
}

function unitVector(longitude: number, latitude: number): readonly [number, number, number] {
  const longitudeRadians = longitude * Math.PI / 180;
  const latitudeRadians = latitude * Math.PI / 180;
  const latitudeCosine = Math.cos(latitudeRadians);
  return [
    latitudeCosine * Math.cos(longitudeRadians),
    Math.sin(latitudeRadians),
    latitudeCosine * Math.sin(longitudeRadians),
  ];
}

/** Geographic reach used by the masked impact wave, including detached islands. */
export function battleTerritoryWaveRadiusDegrees(
  impact: readonly [number, number],
  rings: CountryRings,
): number {
  const center = unitVector(impact[0], impact[1]);
  let maximumRadians = 0;
  for (const ring of rings) {
    for (const [longitude, latitude] of ring) {
      const point = unitVector(longitude, latitude);
      const dot = Math.max(-1, Math.min(1,
        center[0] * point[0] + center[1] * point[1] + center[2] * point[2],
      ));
      maximumRadians = Math.max(maximumRadians, Math.acos(dot));
    }
  }
  const degrees = maximumRadians * 180 / Math.PI;
  return Math.max(MIN_WAVE_RADIUS_DEGREES, Math.min(MAX_WAVE_RADIUS_DEGREES, degrees));
}
