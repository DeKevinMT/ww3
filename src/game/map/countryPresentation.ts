import type { Point, TerritoryId } from '../types';

type WorldProjection = (longitude: number, latitude: number) => Point;

const COUNTRY_PRESENTATION_GEO_ANCHORS: Readonly<Partial<Record<TerritoryId, readonly [number, number]>>> = {
  // Natural Earth's France record also contains overseas departments. Pin map
  // labels and the protected home flag group to metropolitan France.
  fra: [2.5, 46.6],
};

const COUNTRY_MAINLAND_FLAG_RADII: Readonly<Partial<Record<TerritoryId, number>>> = {
  // Metropolitan rings are at most ~41 map units from the anchor; every
  // overseas French ring centre is more than 270 map units away.
  fra: 96,
};

const FLAG_LANDMASS_LINK_DISTANCE = 260;

export function resolveCountryPresentationAnchor(
  countryId: TerritoryId,
  fallback: Point,
  project: WorldProjection,
): Point {
  const override = COUNTRY_PRESENTATION_GEO_ANCHORS[countryId];
  return override ? project(override[0], override[1]) : fallback;
}

export interface CenteredFlagRing<Ring> extends Point {
  readonly ring: Ring;
}

function wrappedDistance(left: Point, right: Point, mapWidth: number): number {
  const directX = Math.abs(left.x - right.x);
  const normalizedX = mapWidth > 0 ? directX % mapWidth : directX;
  const deltaX = mapWidth > 0 ? Math.min(normalizedX, mapWidth - normalizedX) : normalizedX;
  return Math.hypot(deltaX, left.y - right.y);
}

function groupNearbyFlagRings<Ring>(
  entries: readonly CenteredFlagRing<Ring>[],
  mapWidth: number,
): CenteredFlagRing<Ring>[][] {
  const groups: CenteredFlagRing<Ring>[][] = [];
  for (const entry of entries) {
    const linked = groups.filter((group) => group.some((candidate) => (
      wrappedDistance(candidate, entry, mapWidth) <= FLAG_LANDMASS_LINK_DISTANCE
    )));
    if (linked.length === 0) groups.push([entry]);
    else {
      linked[0]!.push(entry);
      for (const extra of linked.slice(1)) {
        linked[0]!.push(...extra);
        groups.splice(groups.indexOf(extra), 1);
      }
    }
  }
  return groups;
}

/**
 * Groups disconnected landmasses before a flag is stretched over their bounds.
 * France receives one protected metropolitan partition so nearby island rings
 * cannot transitively connect Europe to its overseas departments.
 */
export function groupFlagLandmasses<Ring>(
  countryId: TerritoryId,
  entries: readonly CenteredFlagRing<Ring>[],
  mapWidth: number,
  presentationAnchor?: Point,
): CenteredFlagRing<Ring>[][] {
  const mainlandRadius = COUNTRY_MAINLAND_FLAG_RADII[countryId];
  if (!mainlandRadius || !presentationAnchor) return groupNearbyFlagRings(entries, mapWidth);

  const mainland: CenteredFlagRing<Ring>[] = [];
  const overseas: CenteredFlagRing<Ring>[] = [];
  for (const entry of entries) {
    (wrappedDistance(entry, presentationAnchor, mapWidth) <= mainlandRadius ? mainland : overseas).push(entry);
  }
  return [
    ...groupNearbyFlagRings(mainland, mapWidth),
    ...groupNearbyFlagRings(overseas, mapWidth),
  ];
}
