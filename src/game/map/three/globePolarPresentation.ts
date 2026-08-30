import type { MapPolarEndgameSnapshot } from '../bridge';

/**
 * Exact state consumed by the awakened Antarctica summary. Access points have
 * no bespoke labels or beacons; their route state stays in the simulation.
 * `visualRevision` deliberately stays out: supply moves, PRIME updates and
 * other simulation-only revisions must not rewrite these DOM surfaces.
 */
export function globePolarPresentationSignature(
  polar: MapPolarEndgameSnapshot | undefined,
): string {
  if (!polar) return 'legacy';
  const securedCount = Object.values(polar.sectors)
    .filter((sector) => sector?.status === 'secured').length;
  return `${polar.phase}|secured:${securedCount}`;
}
