import { COUNTRIES } from '../../data/worldMap';
import { ANTARCTICA_SECTOR_PRESENTATIONS } from '../mapGeographyPresentation';
import type { WorldMapEngineContract } from '../bridge';
import {
  mapOwnerPairKey,
  strategicBorderKind,
  strategicBorderThreatSignature,
} from '../borderThreatPresentation';
import { lonLatToUnitXyz } from './globeMath';
import { globeOverlayRadius } from './globeSurfacePresentation';

type Coordinate = readonly [number, number];
type UnitPosition = readonly [number, number, number];
type UnitColor = readonly [number, number, number];

interface MutableBorderEdge {
  start: Coordinate;
  end: Coordinate;
  territoryIds: Set<string>;
  occurrenceCount: number;
  antarctic: boolean;
}

interface PreparedBorderEdge {
  points: readonly UnitPosition[];
  territoryIds: readonly string[];
  internalCanonicalEdge: boolean;
  antarctic: boolean;
}

export interface GlobeBorderBuffer {
  readonly positions: Float32Array;
  readonly colors: Float32Array;
}

/**
 * A LineSegments edge is a straight chord. Long chords sink through the globe
 * between their endpoints and start to flicker or disappear at close range.
 * Subdivide once at module load so every visible segment follows the sphere.
 * 0.22 degrees is below one screen pixel at the supported closest camera while
 * keeping the cached buffer compact enough for a single border draw call.
 */
const MAX_BORDER_ARC_RADIANS = 0.22 * Math.PI / 180;
export const GLOBE_BORDER_COLORS = Object.freeze({
  neutral: Object.freeze([0.39, 0.55, 0.62] as const),
  threatened: Object.freeze([0.94, 0.59, 0.18] as const),
  acute: Object.freeze([1, 0.22, 0.13] as const),
  rogue: Object.freeze([0.76, 0.16, 0.42] as const),
  activeWar: Object.freeze([1, 0.25, 0.20] as const),
});

/**
 * Border hierarchy is encoded in the existing vertex-color buffer. This keeps
 * the political surface and projected empire flag dominant without adding a
 * material, geometry or draw call for internal realms.
 */
export const GLOBE_BORDER_VISUAL_INTENSITY = Object.freeze({
  internal: 1,
  integrating: 1,
  international: 1,
});

function pointKey([longitude, latitude]: Coordinate): string {
  // +180 and -180 are the same point on the globe and must share one seam key.
  const wrappedLongitude = ((longitude + 180) % 360 + 360) % 360 - 180;
  return `${wrappedLongitude.toFixed(5)}:${latitude.toFixed(5)}`;
}

function edgeKey(start: Coordinate, end: Coordinate): string {
  const left = pointKey(start);
  const right = pointKey(end);
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

function unitPosition([longitude, latitude]: Coordinate): UnitPosition {
  const point = lonLatToUnitXyz(longitude, latitude);
  return [point.x, point.y, point.z];
}

function sphericalArcPoints(start: Coordinate, end: Coordinate): readonly UnitPosition[] {
  const startPosition = unitPosition(start);
  const endPosition = unitPosition(end);
  const cosine = Math.max(-1, Math.min(1,
    startPosition[0] * endPosition[0]
      + startPosition[1] * endPosition[1]
      + startPosition[2] * endPosition[2],
  ));
  const angle = Math.acos(cosine);
  const segmentCount = Math.max(1, Math.ceil(angle / MAX_BORDER_ARC_RADIANS));
  if (segmentCount === 1 || angle < 1e-8) return [startPosition, endPosition];

  const sine = Math.sin(angle);
  const points: UnitPosition[] = [];
  for (let index = 0; index <= segmentCount; index += 1) {
    const progress = index / segmentCount;
    const startWeight = Math.sin((1 - progress) * angle) / sine;
    const endWeight = Math.sin(progress * angle) / sine;
    points.push([
      startPosition[0] * startWeight + endPosition[0] * endWeight,
      startPosition[1] * startWeight + endPosition[1] * endWeight,
      startPosition[2] * startWeight + endPosition[2] * endWeight,
    ]);
  }
  return points;
}

/**
 * Natural Earth neighbours repeat their shared segment in opposite directions.
 * Collapse those copies once at module load so every later ownership rebuild is
 * a pair of compact linear passes rather than another topology calculation.
 */
const PREPARED_BORDER_EDGES: readonly PreparedBorderEdge[] = (() => {
  const edgesByKey = new Map<string, MutableBorderEdge>();

  const addRings = (
    territoryId: string,
    rings: readonly (readonly Coordinate[])[],
    antarctic: boolean,
  ): void => {
    for (const ring of rings) {
      if (ring.length < 2) continue;
      for (let index = 0; index < ring.length; index += 1) {
        const start = ring[index];
        const end = ring[(index + 1) % ring.length];
        if (!start || !end || pointKey(start) === pointKey(end)) continue;

        const key = edgeKey(start, end);
        const existing = edgesByKey.get(key);
        if (existing) {
          existing.territoryIds.add(territoryId);
          existing.occurrenceCount += 1;
          existing.antarctic ||= antarctic;
          continue;
        }
        edgesByKey.set(key, {
          start,
          end,
          territoryIds: new Set([territoryId]),
          occurrenceCount: 1,
          antarctic,
        });
      }
    }
  };

  for (const country of COUNTRIES) addRings(country.id, country.rings, false);
  for (const sector of ANTARCTICA_SECTOR_PRESENTATIONS) {
    addRings(sector.id, sector.rings, true);
  }

  return [...edgesByKey.values()].map((edge) => {
    const territoryIds = [...edge.territoryIds];
    return {
      points: sphericalArcPoints(edge.start, edge.end),
      territoryIds,
      // Absorbed source polygons such as Morocco / Western Sahara can retain
      // the same edge twice inside one canonical territory. It is not a coast.
      internalCanonicalEdge: edge.occurrenceCount > territoryIds.length,
      antarctic: edge.antarctic,
    };
  });
})();

function visibleBorderColor(
  edge: PreparedBorderEdge,
  engine: WorldMapEngineContract | undefined,
  activeWarPairs: ReadonlySet<string>,
): UnitColor | undefined {
  if (edge.internalCanonicalEdge) return undefined;
  if (!engine) return GLOBE_BORDER_COLORS.neutral;
  const kind = strategicBorderKind(
    edge.territoryIds,
    engine.state.territories,
    engine.state.humanPlayerId,
    activeWarPairs,
  );
  return kind === 'active-war' ? GLOBE_BORDER_COLORS.activeWar
    : kind === 'rogue' ? GLOBE_BORDER_COLORS.rogue
      : kind === 'acute' ? GLOBE_BORDER_COLORS.acute
        : kind === 'threatened' ? GLOBE_BORDER_COLORS.threatened
          : GLOBE_BORDER_COLORS.neutral;
}

/** Stable key for caching border buffers between otherwise frequent map syncs. */
export function globeBorderOwnershipSignature(engine?: WorldMapEngineContract): string {
  if (!engine) return 'canonical';
  const ordinary = COUNTRIES.map((country) => {
    const territory = engine.state.territories[country.id];
    if (!territory) return '-';
    return territory.ownerId;
  }).join('|');
  const antarctic = ANTARCTICA_SECTOR_PRESENTATIONS.map((sector) => {
    const territory = engine.state.territories[sector.id];
    if (!territory) return '-';
    return territory.ownerId;
  }).join('|');
  const viewerId = engine.state.humanPlayerId;
  const viewerWars = engine.state.wars
    .filter((war) => war.attackerId === viewerId || war.defenderId === viewerId);
  const activeWarPairs = new Set(viewerWars.map((war) => (
    mapOwnerPairKey(war.attackerId, war.defenderId)
  )));
  const warSignature = viewerWars
    .map((war) => `${war.id}:${mapOwnerPairKey(war.attackerId, war.defenderId)}`)
    .sort()
    .join(',');
  const threats = strategicBorderThreatSignature(
    PREPARED_BORDER_EDGES,
    engine.state.territories,
    viewerId,
    activeWarPairs,
  );
  return `${viewerId}|${ordinary}|antarctica:${antarctic}|wars:${warSignature}|threats:${threats}`;
}

/**
 * Build the two attributes for one merged LineSegments geometry. Fully absorbed
 * realm borders stay present at low intensity, integrating borders remain a
 * warmer intermediate layer, and international borders retain full contrast.
 * Every segment endpoint receives one statically prepared color, so ownership
 * changes still cost only a cached linear pass and one GPU draw call.
 */
export function buildGlobeBorderBuffer(
  engine: WorldMapEngineContract | undefined,
  radius: number,
): GlobeBorderBuffer {
  const borderRadius = globeOverlayRadius(radius);
  const visibleEdges: Array<{
    edge: PreparedBorderEdge;
    points: readonly UnitPosition[];
    color: UnitColor;
  }> = [];
  const viewerId = engine?.state.humanPlayerId;
  const activeWarPairs = new Set(engine?.state.wars
    .filter((war) => war.attackerId === viewerId || war.defenderId === viewerId)
    .map((war) => mapOwnerPairKey(war.attackerId, war.defenderId)) ?? []);
  let visibleSegmentCount = 0;
  for (const edge of PREPARED_BORDER_EDGES) {
    const color = visibleBorderColor(edge, engine, activeWarPairs);
    if (!color) continue;
    const points = edge.points;
    visibleEdges.push({ edge, points, color });
    visibleSegmentCount += points.length - 1;
  }

  const positions = new Float32Array(visibleSegmentCount * 6);
  const colors = new Float32Array(visibleSegmentCount * 6);
  let offset = 0;
  for (const { points, color: edgeColor } of visibleEdges) {
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index]!;
      const end = points[index + 1]!;
      positions[offset] = start[0] * borderRadius;
      positions[offset + 1] = start[1] * borderRadius;
      positions[offset + 2] = start[2] * borderRadius;
      positions[offset + 3] = end[0] * borderRadius;
      positions[offset + 4] = end[1] * borderRadius;
      positions[offset + 5] = end[2] * borderRadius;
      colors[offset] = edgeColor[0];
      colors[offset + 1] = edgeColor[1];
      colors[offset + 2] = edgeColor[2];
      colors[offset + 3] = edgeColor[0];
      colors[offset + 4] = edgeColor[1];
      colors[offset + 5] = edgeColor[2];
      offset += 6;
    }
  }
  return { positions, colors };
}

/** Compatibility helper for callers that only need the position attribute. */
export function buildGlobeBorderPositions(
  engine: WorldMapEngineContract | undefined,
  radius: number,
): Float32Array {
  return buildGlobeBorderBuffer(engine, radius).positions;
}
