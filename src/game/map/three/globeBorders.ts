import {
  COUNTRIES,
  terrainProfileForTerritory,
} from '../../data/worldMap';
import type { WorldMapEngineContract } from '../bridge';
import { lonLatToUnitXyz } from './globeMath';
import { terrainTextureLayerPresentation } from './terrainTexturePresentation';
import { globeOverlayRadius } from './globeSurfacePresentation';

type Coordinate = readonly [number, number];
type UnitPosition = readonly [number, number, number];
type UnitColor = readonly [number, number, number];

interface MutableBorderEdge {
  start: Coordinate;
  end: Coordinate;
  territoryIds: Set<string>;
  occurrenceCount: number;
}

interface PreparedBorderEdge {
  points: readonly UnitPosition[];
  territoryIds: readonly string[];
  internalCanonicalEdge: boolean;
  color: UnitColor;
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

/**
 * LineBasicMaterial has one opacity for the complete draw call. Premultiply
 * each terrain hue by its percentage-derived border alpha instead, so the RGB
 * attribute carries both hue and intensity without another material or pass.
 */
const TERRAIN_BORDER_COLOR_BY_TERRITORY = new Map<string, UnitColor>(
  COUNTRIES.map((country) => {
    const presentation = terrainTextureLayerPresentation(
      terrainProfileForTerritory(country.id),
    );
    const red = (presentation.borderColor >> 16) & 0xff;
    const green = (presentation.borderColor >> 8) & 0xff;
    const blue = presentation.borderColor & 0xff;
    return [country.id, [
      red / 255 * presentation.borderAlpha,
      green / 255 * presentation.borderAlpha,
      blue / 255 * presentation.borderAlpha,
    ] as const];
  }),
);

function terrainBorderColor(territoryIds: readonly string[]): UnitColor {
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;
  for (const territoryId of territoryIds) {
    const color = TERRAIN_BORDER_COLOR_BY_TERRITORY.get(territoryId);
    if (!color) continue;
    red += color[0];
    green += color[1];
    blue += color[2];
    count += 1;
  }
  if (count === 0) return [0, 0, 0];
  return [red / count, green / count, blue / count];
}

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

  for (const country of COUNTRIES) {
    for (const ring of country.rings) {
      if (ring.length < 2) continue;
      for (let index = 0; index < ring.length; index += 1) {
        const start = ring[index];
        const end = ring[(index + 1) % ring.length];
        if (!start || !end || pointKey(start) === pointKey(end)) continue;

        const key = edgeKey(start, end);
        const existing = edgesByKey.get(key);
        if (existing) {
          existing.territoryIds.add(country.id);
          existing.occurrenceCount += 1;
          continue;
        }
        edgesByKey.set(key, {
          start,
          end,
          territoryIds: new Set([country.id]),
          occurrenceCount: 1,
        });
      }
    }
  }

  return [...edgesByKey.values()].map((edge) => {
    const territoryIds = [...edge.territoryIds];
    return {
      points: sphericalArcPoints(edge.start, edge.end),
      territoryIds,
      // Absorbed source polygons such as Morocco / Western Sahara can retain
      // the same edge twice inside one canonical territory. It is not a coast.
      internalCanonicalEdge: edge.occurrenceCount > territoryIds.length,
      color: terrainBorderColor(territoryIds),
    };
  });
})();

function isIntegratingTerritory(territoryId: string, engine: WorldMapEngineContract): boolean {
  const territory = engine.state.territories[territoryId];
  return Boolean(territory
    && territory.coreOwnerId !== territory.ownerId
    && territory.integration < 0.999999);
}

function edgeIsIntegrating(edge: PreparedBorderEdge, engine?: WorldMapEngineContract): boolean {
  return Boolean(engine && edge.territoryIds.some((territoryId) => (
    isIntegratingTerritory(territoryId, engine)
  )));
}

function isHiddenInternalBorder(
  edge: PreparedBorderEdge,
  engine: WorldMapEngineContract | undefined,
): boolean {
  if (edge.internalCanonicalEdge) return true;
  if (!engine || edge.territoryIds.length < 2) return false;
  // An unfinished conquest keeps its complete perimeter readable, even where
  // both sides are already controlled by the conqueror. Completion removes it.
  if (edgeIsIntegrating(edge, engine)) return false;
  const firstTerritoryId = edge.territoryIds[0];
  if (!firstTerritoryId) return false;
  const ownerId = engine.state.territories[firstTerritoryId]?.ownerId;
  if (!ownerId) return false;

  // A missing territory snapshot never hides a border. This keeps the renderer
  // conservative during scenario transitions and for partial test adapters.
  return edge.territoryIds.every((territoryId) => (
    engine.state.territories[territoryId]?.ownerId === ownerId
  ));
}

/** Stable key for caching border buffers between otherwise frequent map syncs. */
export function globeBorderOwnershipSignature(engine?: WorldMapEngineContract): string {
  if (!engine) return 'canonical';
  return COUNTRIES.map((country) => {
    const territory = engine.state.territories[country.id];
    if (!territory) return '-';
    return `${territory.ownerId}:${territory.coreOwnerId}:${isIntegratingTerritory(country.id, engine) ? 1 : 0}`;
  }).join('|');
}

/**
 * Build the two attributes for one merged LineSegments geometry. Shared borders
 * disappear only when every canonical territory touching that exact edge has
 * one owner; coastlines, incomplete snapshots and the canonical no-engine view
 * remain. Every segment endpoint receives the same statically prepared terrain
 * color, averaged across the territories on a shared edge.
 */
export function buildGlobeBorderBuffer(
  engine: WorldMapEngineContract | undefined,
  radius: number,
): GlobeBorderBuffer {
  const borderRadius = globeOverlayRadius(radius);
  const visibleEdges: Array<{
    edge: PreparedBorderEdge;
    points: readonly UnitPosition[];
  }> = [];
  let visibleSegmentCount = 0;
  for (const edge of PREPARED_BORDER_EDGES) {
    if (isHiddenInternalBorder(edge, engine)) continue;
    const points = edge.points;
    visibleEdges.push({ edge, points });
    visibleSegmentCount += points.length - 1;
  }

  const positions = new Float32Array(visibleSegmentCount * 6);
  const colors = new Float32Array(visibleSegmentCount * 6);
  let offset = 0;
  for (const { edge, points } of visibleEdges) {
    const edgeColor = edge.color;
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
