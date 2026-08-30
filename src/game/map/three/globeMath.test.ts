import { describe, expect, it } from 'vitest';
import {
  globeRotateSpeedForDistance,
  isFrontSideVisible,
  lonLatToEquirectangularPixel,
  lonLatToUnitXyz,
  ndcToCssPoint,
  unitXyzToLonLat,
} from './globeMath';

const expectVectorClose = (
  actual: { x: number; y: number; z: number },
  expected: { x: number; y: number; z: number },
): void => {
  expect(actual.x).toBeCloseTo(expected.x, 12);
  expect(actual.y).toBeCloseTo(expected.y, 12);
  expect(actual.z).toBeCloseTo(expected.z, 12);
};

describe('globe math', () => {
  it('keeps close globe dragging responsive without sacrificing overview control', () => {
    const minimumDistance = 7.2;
    const maximumDistance = 16.75;

    expect(globeRotateSpeedForDistance(minimumDistance, minimumDistance, maximumDistance))
      .toBeCloseTo(0.06, 6);
    expect(globeRotateSpeedForDistance(7.35, minimumDistance, maximumDistance)).toBeGreaterThan(0.06);
    expect(globeRotateSpeedForDistance(7.35, minimumDistance, maximumDistance)).toBeLessThan(0.07);
    expect(globeRotateSpeedForDistance(14.5, minimumDistance, maximumDistance)).toBeGreaterThan(0.43);
    expect(globeRotateSpeedForDistance(maximumDistance, minimumDistance, maximumDistance))
      .toBeCloseTo(0.52, 6);
  });

  it('clamps globe drag sensitivity beyond the supported zoom range', () => {
    expect(globeRotateSpeedForDistance(0, 7.2, 16.75)).toBeCloseTo(0.06, 6);
    expect(globeRotateSpeedForDistance(100, 7.2, 16.75)).toBeCloseTo(0.52, 6);
  });

  it('uses a Three.js-compatible Y-up unit sphere convention', () => {
    expectVectorClose(lonLatToUnitXyz(0, 0), { x: 1, y: 0, z: 0 });
    expectVectorClose(lonLatToUnitXyz(90, 0), { x: 0, y: 0, z: -1 });
    expectVectorClose(lonLatToUnitXyz(0, 90), { x: 0, y: 1, z: 0 });
    expectVectorClose(lonLatToUnitXyz(0, -90), { x: 0, y: -1, z: 0 });
  });

  it('round-trips ordinary locations and canonicalizes the antimeridian', () => {
    for (const [longitude, latitude] of [[4.35, 50.85], [151.21, -33.87], [-73.57, 45.5]]) {
      const roundTrip = unitXyzToLonLat(lonLatToUnitXyz(longitude!, latitude!));
      expect(roundTrip.longitude).toBeCloseTo(longitude!, 10);
      expect(roundTrip.latitude).toBeCloseTo(latitude!, 10);
    }

    expect(unitXyzToLonLat(lonLatToUnitXyz(180, 0))).toEqual({ longitude: -180, latitude: 0 });
    expect(unitXyzToLonLat(lonLatToUnitXyz(37, 90))).toEqual({ longitude: 0, latitude: 90 });
  });

  it('rejects a direction that cannot identify a location', () => {
    expect(() => unitXyzToLonLat({ x: 0, y: 0, z: 0 })).toThrow(RangeError);
  });

  it('wraps longitude and clamps the pole rows inside equirectangular textures', () => {
    expect(lonLatToEquirectangularPixel(-180, 90, 360, 180)).toEqual({ x: 0, y: 0 });
    expect(lonLatToEquirectangularPixel(180, -90, 360, 180)).toEqual({ x: 0, y: 179 });
    expect(lonLatToEquirectangularPixel(540, 0, 360, 180)).toEqual({ x: 0, y: 90 });
    expect(lonLatToEquirectangularPixel(0, 0, 360, 180)).toEqual({ x: 180, y: 90 });
    expect(lonLatToEquirectangularPixel(90, 120, 360, 180)).toEqual({ x: 270, y: 0 });
  });

  it('requires real pixel dimensions', () => {
    expect(() => lonLatToEquirectangularPixel(0, 0, 0, 180)).toThrow(RangeError);
    expect(() => lonLatToEquirectangularPixel(0, 0, 360.5, 180)).toThrow(RangeError);
  });

  it('tests visibility using normalized camera-facing hemisphere angles', () => {
    expect(isFrontSideVisible({ x: 2, y: 0, z: 0 }, { x: 10, y: 0, z: 0 })).toBe(true);
    expect(isFrontSideVisible({ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBe(false);
    expect(isFrontSideVisible({ x: 0.6, y: 0.8, z: 0 }, { x: 1, y: 0, z: 0 }, 0.7)).toBe(false);
    expect(isFrontSideVisible({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBe(false);
  });

  it('projects normalized device coordinates into an offset CSS viewport', () => {
    const viewport = { left: 100, top: 50, width: 800, height: 600 };
    expect(ndcToCssPoint({ x: -1, y: 1 }, viewport)).toEqual({ x: 100, y: 50 });
    expect(ndcToCssPoint({ x: 0, y: 0 }, viewport)).toEqual({ x: 500, y: 350 });
    expect(ndcToCssPoint({ x: 1, y: -1 }, viewport)).toEqual({ x: 900, y: 650 });
  });
});
