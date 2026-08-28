const MIN_BATTLE_EFFECT_SCALE = 0.72;
const MAX_BATTLE_EFFECT_SCALE = 1.80;
const MIN_BATTLE_PROJECTILE_SCALE = 0.70;
const MAX_BATTLE_PROJECTILE_SCALE = 0.94;
const FULL_SCALE_ATTACK_POWER = 180;
const FALLBACK_LOSS_POWER_MULTIPLIER = 20;
const MIN_WAVE_RADIUS_DEGREES = 0.8;
const MAX_WAVE_RADIUS_DEGREES = 70;

export interface BattleEffectMagnitudeInput {
  readonly attackerPower?: number;
  readonly attackerLosses?: number;
  readonly defenderLosses?: number;
}

type CountryRings = readonly (readonly (readonly [number, number])[])[];

function finitePositive(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;
}

/**
 * Maps real battle power onto a deliberately narrow visual range. The log curve
 * keeps a USA-scale assault visibly larger than an island skirmish without ever
 * allowing a large empire to cover the globe with one projectile or explosion.
 * Legacy map events fall back to actual military losses when power is absent.
 */
export function battleEffectScale(input: BattleEffectMagnitudeInput): number {
  const reportedPower = finitePositive(input.attackerPower);
  const fallbackPower = (
    finitePositive(input.attackerLosses) + finitePositive(input.defenderLosses)
  ) * FALLBACK_LOSS_POWER_MULTIPLIER;
  const power = reportedPower > 0 ? reportedPower : fallbackPower;
  const curved = Math.min(1, Math.log1p(power) / Math.log1p(FULL_SCALE_ATTACK_POWER));
  return MIN_BATTLE_EFFECT_SCALE
    + curved * (MAX_BATTLE_EFFECT_SCALE - MIN_BATTLE_EFFECT_SCALE);
}

/**
 * Keeps attack magnitude legible through the impact and territory wave while
 * compressing the projectile itself into a deliberately subtle size range.
 */
export function battleProjectileScale(effectScale: number): number {
  const boundedEffectScale = Number.isFinite(effectScale)
    ? Math.max(MIN_BATTLE_EFFECT_SCALE, Math.min(MAX_BATTLE_EFFECT_SCALE, effectScale))
    : MIN_BATTLE_EFFECT_SCALE;
  const normalized = (boundedEffectScale - MIN_BATTLE_EFFECT_SCALE)
    / (MAX_BATTLE_EFFECT_SCALE - MIN_BATTLE_EFFECT_SCALE);
  return MIN_BATTLE_PROJECTILE_SCALE
    + normalized * (MAX_BATTLE_PROJECTILE_SCALE - MIN_BATTLE_PROJECTILE_SCALE);
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
