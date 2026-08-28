import { describe, expect, it } from 'vitest';
import {
  GLOBE_SPHERE_HEIGHT_SEGMENTS,
  GLOBE_SPHERE_WIDTH_SEGMENTS,
  GLOBE_SURFACE_CLEARANCE,
  globeOverlayRadius,
} from './globeSurfacePresentation';

describe('globe surface presentation', () => {
  it('shares one moderately dense sphere and one sub-pixel overlay radius', () => {
    expect(GLOBE_SPHERE_WIDTH_SEGMENTS).toBe(320);
    expect(GLOBE_SPHERE_HEIGHT_SEGMENTS).toBe(200);
    expect(GLOBE_SURFACE_CLEARANCE).toBe(0.00018);
    expect(globeOverlayRadius(5)).toBeCloseTo(5.00018, 8);
  });

  it('keeps the overlay clearance visually negligible at close zoom', () => {
    const closeCameraDistance = 6.6;
    const viewportHeight = 900;
    const fieldOfViewRadians = 41 * Math.PI / 180;
    const projectedPixels = GLOBE_SURFACE_CLEARANCE
      / (closeCameraDistance - 5)
      * viewportHeight / (2 * Math.tan(fieldOfViewRadians / 2));
    expect(projectedPixels).toBeLessThan(0.16);
  });
});
