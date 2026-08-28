/**
 * The globe, its borders and territory wave share one canonical sphere.
 * A sub-pixel clearance prevents z-fighting without making overlays float.
 */
export const GLOBE_SPHERE_WIDTH_SEGMENTS = 320;
export const GLOBE_SPHERE_HEIGHT_SEGMENTS = 200;
export const GLOBE_SURFACE_CLEARANCE = 0.00018;

export function globeOverlayRadius(baseRadius: number): number {
  return Math.max(0, baseRadius) + GLOBE_SURFACE_CLEARANCE;
}
