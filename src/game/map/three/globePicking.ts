export const MICROSTATE_PICK_MAX_ANGULAR_RADIUS_DEGREES = 1.5;
export const MICROSTATE_PICK_MAX_CAMERA_DISTANCE = 15;

const MICROSTATE_PICK_MIN_VIEWPORT_EDGE = 240;
const DEGREES_TO_RADIANS = Math.PI / 180;

export interface ProjectedMicrostatePickAnchor {
  readonly territoryId: string;
  readonly clientX: number;
  readonly clientY: number;
  readonly angularRadiusDegrees: number;
  readonly frontFacing: boolean;
}

export interface MicrostateScreenPickOptions {
  readonly clientX: number;
  readonly clientY: number;
  readonly pointerType: string;
  readonly cameraDistance: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
}

const clamp = (value: number, minimum: number, maximum: number): number => (
  Math.min(maximum, Math.max(minimum, value))
);

/**
 * Measures a country's furthest ring vertex from its real presentation anchor.
 * This runs once while the module is initialized and keeps ordinary countries
 * out of the forgiving hit-proxy path entirely.
 */
export function countryAngularRadiusDegrees(
  anchor: readonly [number, number],
  rings: readonly (readonly (readonly [number, number])[])[],
): number {
  const anchorLongitude = anchor[0] * DEGREES_TO_RADIANS;
  const anchorLatitude = anchor[1] * DEGREES_TO_RADIANS;
  const anchorSinLatitude = Math.sin(anchorLatitude);
  const anchorCosLatitude = Math.cos(anchorLatitude);
  let maximumRadians = 0;

  for (const ring of rings) {
    for (const [longitude, latitude] of ring) {
      const latitudeRadians = latitude * DEGREES_TO_RADIANS;
      const cosine = anchorSinLatitude * Math.sin(latitudeRadians)
        + anchorCosLatitude * Math.cos(latitudeRadians)
          * Math.cos(longitude * DEGREES_TO_RADIANS - anchorLongitude);
      maximumRadians = Math.max(
        maximumRadians,
        Math.acos(clamp(cosine, -1, 1)),
      );
    }
  }

  return maximumRadians / DEGREES_TO_RADIANS;
}

export function isMicrostatePickCandidate(angularRadiusDegrees: number): boolean {
  return Number.isFinite(angularRadiusDegrees)
    && angularRadiusDegrees > 0
    && angularRadiusDegrees <= MICROSTATE_PICK_MAX_ANGULAR_RADIUS_DEGREES;
}

/**
 * A fixed CSS-pixel target stays usable at normal and close zoom without
 * becoming a broad geographic search. Tiny countries receive a few extra
 * pixels, touch receives a modest accessibility allowance, and every value is
 * hard-capped. The proxy is disabled at far overview zoom and unusably small
 * viewports.
 */
export function microstateScreenPickRadius(
  angularRadiusDegrees: number,
  options: Pick<
    MicrostateScreenPickOptions,
    'pointerType' | 'cameraDistance' | 'viewportWidth' | 'viewportHeight'
  >,
): number {
  const viewportEdge = Math.min(options.viewportWidth, options.viewportHeight);
  if (!isMicrostatePickCandidate(angularRadiusDegrees)
    || !Number.isFinite(options.cameraDistance)
    || options.cameraDistance > MICROSTATE_PICK_MAX_CAMERA_DISTANCE
    || !Number.isFinite(viewportEdge)
    || viewportEdge < MICROSTATE_PICK_MIN_VIEWPORT_EDGE) return 0;

  const smallness = 1 - angularRadiusDegrees / MICROSTATE_PICK_MAX_ANGULAR_RADIUS_DEGREES;
  const touch = options.pointerType === 'touch';
  const baseRadius = touch ? 15 + smallness * 5 : 8 + smallness * 3;
  const viewportScale = clamp(viewportEdge / 720, 0.72, 1);
  return Math.min(touch ? 20 : 11, baseRadius * viewportScale);
}

/**
 * Resolves the closest visible anchor only. Callers supply a precomputed and
 * projection-cached microstate list, so pointer movement never scans every
 * country or samples unrelated texture pixels.
 */
export function nearestMicrostateScreenPick(
  candidates: readonly ProjectedMicrostatePickAnchor[],
  options: MicrostateScreenPickOptions,
): string | undefined {
  let nearestTerritoryId: string | undefined;
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    if (!candidate.frontFacing) continue;
    const hitRadius = microstateScreenPickRadius(candidate.angularRadiusDegrees, options);
    if (hitRadius <= 0) continue;
    const deltaX = options.clientX - candidate.clientX;
    const deltaY = options.clientY - candidate.clientY;
    const distanceSquared = deltaX * deltaX + deltaY * deltaY;
    if (distanceSquared > hitRadius * hitRadius || distanceSquared >= nearestDistanceSquared) continue;
    nearestDistanceSquared = distanceSquared;
    nearestTerritoryId = candidate.territoryId;
  }

  return nearestTerritoryId;
}
