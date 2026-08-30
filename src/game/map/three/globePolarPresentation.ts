import type { MapPolarEndgameSnapshot } from '../bridge';

const POLAR_CORRIDOR_ENTRY_IDS = [
  'drake-entry',
  'maud-entry',
  'ross-entry',
] as const;

/**
 * Exact state consumed by the three corridor labels and Antarctica summary.
 * `visualRevision` deliberately stays out: supply moves, PRIME updates and
 * other simulation-only revisions must not rewrite these DOM surfaces.
 */
export function globePolarPresentationSignature(
  polar: MapPolarEndgameSnapshot | undefined,
): string {
  if (!polar) return 'legacy';
  const corridorStatuses = POLAR_CORRIDOR_ENTRY_IDS.map((sectorId) => (
    polar.sectors[sectorId]?.status ?? 'hidden'
  )).join(',');
  const securedCount = Object.values(polar.sectors)
    .filter((sector) => sector?.status === 'secured').length;
  return `${polar.phase}|${corridorStatuses}|secured:${securedCount}`;
}
