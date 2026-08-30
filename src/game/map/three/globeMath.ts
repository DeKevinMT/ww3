/** Plain vector shapes keep these helpers independent from Three.js at runtime. */
export interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

export interface Point2Like {
  x: number;
  y: number;
}

export interface LongitudeLatitude {
  longitude: number;
  latitude: number;
}

export interface CssViewport {
  left: number;
  top: number;
  width: number;
  height: number;
}

const DEGREES_TO_RADIANS = Math.PI / 180;
const RADIANS_TO_DEGREES = 180 / Math.PI;
const POLE_EPSILON = 1e-12;

const clamp = (value: number, minimum: number, maximum: number): number => (
  Math.min(maximum, Math.max(minimum, value))
);

/** Distance-aware pointer rotation that remains controllable without feeling stuck up close. */
export const globeRotateSpeedForDistance = (
  distance: number,
  minimumDistance: number,
  maximumDistance: number,
): number => {
  const distanceRange = Math.max(Number.EPSILON, maximumDistance - minimumDistance);
  const zoomRatio = clamp((distance - minimumDistance) / distanceRange, 0, 1);
  const easedRatio = zoomRatio * zoomRatio * (3 - 2 * zoomRatio);
  return 0.06 + (0.52 - 0.06) * easedRatio;
};

/**
 * Converts geographic coordinates to a unit vector for a Three.js Y-up scene.
 * Longitude 0 faces +X, 90 east faces -Z, and the north pole faces +Y.
 * The negative Z convention matches Three.js SphereGeometry's default UVs,
 * so an ordinary west-to-east equirectangular canvas is not mirrored.
 * Longitudes wrap across the antimeridian; latitudes outside the poles clamp.
 */
export const lonLatToUnitXyz = (longitude: number, latitude: number): Vector3Like => {
  const longitudeRadians = longitude * DEGREES_TO_RADIANS;
  const latitudeRadians = clamp(latitude, -90, 90) * DEGREES_TO_RADIANS;
  const horizontalRadius = Math.cos(latitudeRadians);
  return {
    x: horizontalRadius * Math.cos(longitudeRadians),
    y: Math.sin(latitudeRadians),
    z: -horizontalRadius * Math.sin(longitudeRadians),
  };
};

/**
 * Converts any non-zero Cartesian direction back to geographic coordinates.
 * The antimeridian is canonicalized to -180 degrees. Longitude is defined as
 * zero at the poles, where every longitude describes the same point.
 */
export const unitXyzToLonLat = ({ x, y, z }: Vector3Like): LongitudeLatitude => {
  const length = Math.hypot(x, y, z);
  if (!Number.isFinite(length) || length <= Number.EPSILON) {
    throw new RangeError('A finite, non-zero direction is required.');
  }

  const normalizedY = clamp(y / length, -1, 1);
  const horizontalRadius = Math.hypot(x, z) / length;
  const rawLongitude = horizontalRadius <= POLE_EPSILON
    ? 0
    : Math.atan2(-z, x) * RADIANS_TO_DEGREES;
  const longitude = ((rawLongitude + 180) % 360 + 360) % 360 - 180;
  return {
    longitude,
    latitude: Math.asin(normalizedY) * RADIANS_TO_DEGREES,
  };
};

/**
 * Maps lon/lat to an integer pixel in an equirectangular texture.
 * Both sides of the antimeridian wrap to column 0. Pole rows clamp to the
 * first/last valid pixel so the returned point is always inside the texture.
 */
export const lonLatToEquirectangularPixel = (
  longitude: number,
  latitude: number,
  width: number,
  height: number,
): Point2Like => {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError('Texture width and height must be positive integers.');
  }

  const wrappedLongitude = ((longitude + 180) % 360 + 360) % 360;
  const x = Math.min(width - 1, Math.floor((wrappedLongitude / 360) * width));
  const clampedLatitude = clamp(latitude, -90, 90);
  const y = Math.min(height - 1, Math.floor(((90 - clampedLatitude) / 180) * height));
  return { x, y };
};

/**
 * Reports whether a surface direction lies on the camera-facing hemisphere.
 * `cameraDirection` points from the globe centre towards the camera. `minDot`
 * may be raised above zero to hide labels close to the horizon.
 */
export const isFrontSideVisible = (
  surfaceDirection: Vector3Like,
  cameraDirection: Vector3Like,
  minDot = 0,
): boolean => {
  const surfaceLength = Math.hypot(surfaceDirection.x, surfaceDirection.y, surfaceDirection.z);
  const cameraLength = Math.hypot(cameraDirection.x, cameraDirection.y, cameraDirection.z);
  if (surfaceLength <= Number.EPSILON || cameraLength <= Number.EPSILON) return false;
  const cosine = (
    surfaceDirection.x * cameraDirection.x
    + surfaceDirection.y * cameraDirection.y
    + surfaceDirection.z * cameraDirection.z
  ) / (surfaceLength * cameraLength);
  return cosine > minDot;
};

/** Converts WebGL normalized device coordinates to CSS client coordinates. */
export const ndcToCssPoint = (
  ndc: Point2Like,
  viewport: CssViewport,
): Point2Like => ({
  x: viewport.left + ((ndc.x + 1) * 0.5 * viewport.width),
  y: viewport.top + ((1 - ndc.y) * 0.5 * viewport.height),
});
