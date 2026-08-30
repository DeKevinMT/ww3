import rawWorldData from '../../assets/world-countries.json?raw';
import type { Point, RegionDefinition, RegionId, TerrainType, TerritoryDefinition, TerritoryId } from '../types';
import {
  COUNTRY_TERRAIN_PROFILES,
  LANDLOCKED_COUNTRY_IDS,
  type TerrainProfileEntry,
} from './terrainProfiles';
import {
  combatRouteBendDirection,
  sampleCombatRoute,
  type CombatRoutePoint,
} from '../map/combatPresentation';

export { LANDLOCKED_COUNTRY_IDS } from './terrainProfiles';
export { terrainProfileDisplayPercentages } from './terrainProfiles';
export type { TerrainProfileEntry } from './terrainProfiles';

export interface CountryRecord {
  id: TerritoryId;
  code: string;
  iso3: string;
  name: string;
  englishName: string;
  continent: string;
  subregion: string;
  regionId: RegionId;
  type: string;
  label: readonly [number, number];
  labelRank: number;
  population: number;
  populationYear: number;
  populationGrowthRate: number;
  populationGrowthYear: number;
  gdp: number;
  gdpYear: number;
  military: number;
  militaryYear: number;
  gdpPerCapita: number;
  powerIndex: number;
  rings: readonly (readonly (readonly [number, number])[])[];
}

interface WorldDataset {
  generated: string;
  sources: Record<string, string>;
  countries: CountryRecord[];
  adjacency: Record<TerritoryId, TerritoryId[]>;
}

const dataset = JSON.parse(rawWorldData) as WorldDataset;

export const MAP_WIDTH = 1280;
/** Extra southern canvas keeps Antarctica separate from the playable world. */
export const MAP_HEIGHT = 900;
export const PLAYABLE_MAP_HEIGHT = 760;
export const WORLD_MAX_LATITUDE = 84;
export const WORLD_MIN_LATITUDE = -58;
const WORLD_TOP = 28;
const WORLD_BOTTOM = PLAYABLE_MAP_HEIGHT - 32;

export function projectWorldPoint(longitude: number, latitude: number): Point {
  const clampedLongitude = Math.max(-180, Math.min(180, longitude));
  const clampedLatitude = Math.max(WORLD_MIN_LATITUDE, Math.min(WORLD_MAX_LATITUDE, latitude));
  return {
    x: ((clampedLongitude + 180) / 360) * MAP_WIDTH,
    y: WORLD_TOP + ((WORLD_MAX_LATITUDE - clampedLatitude) / (WORLD_MAX_LATITUDE - WORLD_MIN_LATITUDE)) * (WORLD_BOTTOM - WORLD_TOP),
  };
}

export const REGIONS: readonly RegionDefinition[] = [
  { id: 'northreach', name: 'North America', bonus: 3, color: 0x58b8c9, hull: [] },
  { id: 'westreach', name: 'South America', bonus: 3, color: 0x5aa889, hull: [] },
  { id: 'heartlands', name: 'Europe', bonus: 4, color: 0xd0a55d, hull: [] },
  { id: 'suncoast', name: 'Africa', bonus: 3, color: 0xd47b5b, hull: [] },
  { id: 'ashen', name: 'Asia', bonus: 3, color: 0xa47bb7, hull: [] },
  { id: 'jade', name: 'Indo-Pacific', bonus: 2, color: 0x61a7a4, hull: [] },
];

const OMITTED_MICROSTATES = new Set([
  'aia', 'ald', 'and', 'asm', 'bhs', 'blm', 'bmu', 'brb', 'cok', 'com', 'cpv', 'cym', 'fji', 'fro', 'ggy',
  'imn', 'iot', 'jey', 'kna', 'lie', 'maf', 'mco', 'mdv', 'mhl', 'mlt', 'mnp', 'msr', 'mus', 'ncl', 'nfk',
  'niu', 'nru', 'pcn', 'plw', 'pri', 'pyf', 'shn', 'slb', 'smr', 'spm', 'sxm', 'tca', 'tto', 'tuv', 'vat',
  'vgb', 'vir', 'vut', 'wlf',
]);

// Greenland is deliberately playable despite falling below the general
// population threshold. Keep this allowlist narrow so the remaining microstates
// stay filtered out.
const PLAYABLE_SMALL_COUNTRIES = new Set<TerritoryId>(['grl']);

interface CountryAbsorptionRule {
  into: TerritoryId;
  transferSeparateStats: boolean;
}

// Natural Earth contains several administrative regions or disputed entities as
// standalone countries. They remain visible geometry, but are not separate playable
// nations in this game. Records whose international statistics already cover the
// whole claimed state only contribute geometry, avoiding double-counted strength.
const ABSORBED_COUNTRIES: Readonly<Record<TerritoryId, CountryAbsorptionRule>> = {
  cyn: { into: 'cyp', transferSeparateStats: false }, // Northern Cyprus -> Cyprus
  sol: { into: 'som', transferSeparateStats: false }, // Somaliland -> Somalia
  hkg: { into: 'chn', transferSeparateStats: true },
  mac: { into: 'chn', transferSeparateStats: true },
  sah: { into: 'mar', transferSeparateStats: true },
};

function canonicalCountryId(countryId: TerritoryId): TerritoryId {
  return ABSORBED_COUNTRIES[countryId]?.into ?? countryId;
}

function recalculatePowerIndex(country: Pick<CountryRecord, 'population' | 'gdp' | 'military'>): number {
  const populationScore = Math.log10(country.population + 1) / Math.log10(1_500) * 100;
  const economyScore = Math.log10(country.gdp + 1) / Math.log10(32_000) * 100;
  const militaryScore = Math.log10(country.military + 1) / Math.log10(1_050) * 100;
  return Math.round(Math.max(4, Math.min(100,
    populationScore * 0.25 + economyScore * 0.32 + militaryScore * 0.43,
  )) * 1_000) / 1_000;
}

function buildPlayableCountries(): CountryRecord[] {
  const records = new Map<TerritoryId, CountryRecord>();
  for (const country of dataset.countries) {
    if (ABSORBED_COUNTRIES[country.id]) continue;
    records.set(country.id, { ...country, rings: [...country.rings] });
  }
  for (const country of dataset.countries) {
    const rule = ABSORBED_COUNTRIES[country.id];
    if (!rule) continue;
    const parent = records.get(rule.into);
    if (!parent) continue;
    let population = parent.population;
    let populationGrowthRate = parent.populationGrowthRate;
    let gdp = parent.gdp;
    let military = parent.military;
    if (rule.transferSeparateStats) {
      const combinedPopulation = parent.population + country.population;
      populationGrowthRate = combinedPopulation > 0
        ? (parent.population * parent.populationGrowthRate + country.population * country.populationGrowthRate) / combinedPopulation
        : parent.populationGrowthRate;
      population = combinedPopulation;
      gdp += country.gdp;
      military += country.military;
    }
    const combined = {
      ...parent,
      population: Math.round(population * 1_000) / 1_000,
      populationGrowthRate: Math.round(populationGrowthRate * 1_000) / 1_000,
      gdp: Math.round(gdp * 1_000) / 1_000,
      military: Math.round(military * 1_000) / 1_000,
      gdpPerCapita: Math.round(gdp * 1_000_000_000 / Math.max(1, population * 1_000_000)),
      rings: [...parent.rings, ...country.rings],
    };
    records.set(rule.into, { ...combined, powerIndex: recalculatePowerIndex(combined) });
  }
  return [...records.values()].filter((country) => (
    !OMITTED_MICROSTATES.has(country.id)
      && (country.population >= 0.25 || PLAYABLE_SMALL_COUNTRIES.has(country.id))
  ));
}

export const COUNTRIES: readonly CountryRecord[] = buildPlayableCountries();
const ACTIVE_COUNTRY_IDS = new Set(COUNTRIES.map((country) => country.id));
const ACTIVE_COUNTRY_BY_ID = new Map(COUNTRIES.map((country) => [country.id, country]));
const SOURCE_IDS_BY_CANONICAL = new Map<TerritoryId, TerritoryId[]>();
for (const country of dataset.countries) {
  const canonicalId = canonicalCountryId(country.id);
  const sources = SOURCE_IDS_BY_CANONICAL.get(canonicalId) ?? [];
  sources.push(country.id);
  SOURCE_IDS_BY_CANONICAL.set(canonicalId, sources);
}

const TARGET_REGIONAL_NAVAL_ROUTES = 3;
const REGIONAL_NEARBY_DISTANCE_KM = 1_800;
const REGIONAL_SUBREGION_DISTANCE_KM = 3_200;
const ISOLATED_REGIONAL_FALLBACK_DISTANCE_KM = 4_500;
const REGIONAL_CANDIDATE_LIMIT = 12;
export const AUTHORED_INTERCONTINENTAL_SEA_GATEWAYS: readonly (
  readonly [TerritoryId, TerritoryId]
)[] = [
  ['grl', 'isl'],
  ['grl', 'gnb'],
  ['grl', 'mrt'],
  ['sle', 'sur'],
  ['mdg', 'tls'],
  ['slv', 'png'],
];
export const AUTHORED_INTERCONTINENTAL_GATEWAY_POWER_CEILING = 24;

interface AuthoredSeaRouteGeometry {
  readonly leftCoast: readonly [number, number];
  readonly rightCoast: readonly [number, number];
  readonly bendDirections: readonly (-1 | 1)[];
}

// Guinea-Bissau is almost enclosed by Senegal. Its ordinary nearest-anchor
// scan cannot find the clear Atlantic exit, so the authored lane reuses exact
// midpoints from each country's canonical exposed coastline.
const AUTHORED_SEA_ROUTE_GEOMETRY_BY_KEY: Readonly<Record<string, AuthoredSeaRouteGeometry>> = {
  'gnb:grl': {
    leftCoast: [-15.2015, 11.0325],
    rightCoast: [-43.2775, 59.9595],
    bendDirections: [-1, 1],
  },
};

// The source dataset also contains proximity links across open water. Keep those
// reachable, but classify them as sea lanes instead of impossible land borders.
const SEA_ONLY_CONNECTION_KEYS = new Set([
  'aus:nzl', 'can:grl', 'chl:nzl', 'grl:isl', 'nzl:png',
]);

function isSeaOnlyConnection(leftId: TerritoryId, rightId: TerritoryId): boolean {
  return SEA_ONLY_CONNECTION_KEYS.has([leftId, rightId].sort().join(':'));
}

const ACTIVE_NEIGHBOURS_CACHE = new Map<TerritoryId, TerritoryId[]>();

function activeNeighbours(countryId: TerritoryId): TerritoryId[] {
  const cached = ACTIVE_NEIGHBOURS_CACHE.get(countryId);
  if (cached) return cached;
  const result = new Set<TerritoryId>();
  const sources = SOURCE_IDS_BY_CANONICAL.get(countryId) ?? [countryId];
  const visited = new Set<TerritoryId>(sources);
  const queue = sources.flatMap((sourceId) => dataset.adjacency[sourceId] ?? []);
  while (queue.length > 0) {
    const candidate = queue.shift()!;
    if (visited.has(candidate)) continue;
    visited.add(candidate);
    const canonicalCandidate = canonicalCountryId(candidate);
    if (canonicalCandidate !== countryId && ACTIVE_COUNTRY_IDS.has(canonicalCandidate)) {
      if (!isSeaOnlyConnection(countryId, canonicalCandidate)) result.add(canonicalCandidate);
      continue;
    }
    for (const next of dataset.adjacency[candidate] ?? []) if (!visited.has(next)) queue.push(next);
  }
  const neighbors = [...result].sort();
  ACTIVE_NEIGHBOURS_CACHE.set(countryId, neighbors);
  return neighbors;
}

export function countryDistanceKm(leftId: TerritoryId, rightId: TerritoryId): number {
  const left = ACTIVE_COUNTRY_BY_ID.get(leftId);
  const right = ACTIVE_COUNTRY_BY_ID.get(rightId);
  if (!left || !right) return Number.POSITIVE_INFINITY;
  const radians = Math.PI / 180;
  const leftLatitude = left.label[1] * radians;
  const rightLatitude = right.label[1] * radians;
  const latitudeDelta = (right.label[1] - left.label[1]) * radians;
  const longitudeDelta = (right.label[0] - left.label[0]) * radians;
  const chord = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(chord), Math.sqrt(Math.max(0, 1 - chord)));
}

interface ProjectedLandRing {
  readonly canonicalId: TerritoryId;
  readonly points: readonly CombatRoutePoint[];
  readonly minimumX: number;
  readonly maximumX: number;
  readonly minimumY: number;
  readonly maximumY: number;
  readonly centerX: number;
}

interface ProjectedLandEdge {
  readonly id: number;
  readonly canonicalId: TerritoryId;
  readonly start: CombatRoutePoint;
  readonly end: CombatRoutePoint;
}

interface CanonicalSeaRouteGeometry {
  readonly leftId: TerritoryId;
  readonly rightId: TerritoryId;
  readonly source: CombatRoutePoint;
  readonly target: CombatRoutePoint;
  readonly bendDirection: -1 | 1;
  readonly distanceKm: number;
}

export interface CountrySeaRouteMapGeometry {
  readonly source: CombatRoutePoint;
  readonly target: CombatRoutePoint;
  readonly bendDirection: -1 | 1;
}

const NAVAL_ROUTE_VALIDATION_SEGMENTS = 34;

function rawEdgeKey(
  start: readonly [number, number],
  end: readonly [number, number],
): string {
  const pointKey = (point: readonly [number, number]): string => (
    `${Math.round(point[0] * 100_000)},${Math.round(point[1] * 100_000)}`
  );
  const startKey = pointKey(start);
  const endKey = pointKey(end);
  return startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`;
}

const RAW_EDGE_OCCURRENCES = new Map<string, number>();
for (const country of dataset.countries) {
  for (const ring of country.rings) {
    for (let index = 0; index < ring.length; index += 1) {
      const start = ring[index]!;
      const end = ring[(index + 1) % ring.length]!;
      const key = rawEdgeKey(start, end);
      RAW_EDGE_OCCURRENCES.set(key, (RAW_EDGE_OCCURRENCES.get(key) ?? 0) + 1);
    }
  }
}

function geographicMidpoint(
  start: readonly [number, number],
  end: readonly [number, number],
): readonly [number, number] {
  let endLongitude = end[0];
  while (endLongitude - start[0] > 180) endLongitude -= 360;
  while (endLongitude - start[0] < -180) endLongitude += 360;
  let longitude = (start[0] + endLongitude) / 2;
  while (longitude > 180) longitude -= 360;
  while (longitude < -180) longitude += 360;
  return [longitude, (start[1] + end[1]) / 2];
}

/**
 * Approximate spherical area is sufficient for ranking a country's polygon
 * rings. The result is deterministic and antimeridian-safe; it is computed
 * once while the world dataset is prepared, never while a route is drawn.
 */
function landRingAreaScore(ring: readonly (readonly [number, number])[]): number {
  if (ring.length < 3) return 0;
  const radians = Math.PI / 180;
  let score = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index]!;
    const end = ring[(index + 1) % ring.length]!;
    let longitudeDelta = (end[0] - start[0]) * radians;
    while (longitudeDelta > Math.PI) longitudeDelta -= Math.PI * 2;
    while (longitudeDelta < -Math.PI) longitudeDelta += Math.PI * 2;
    score += longitudeDelta * (
      2 + Math.sin(start[1] * radians) + Math.sin(end[1] * radians)
    );
  }
  return Math.abs(score);
}

interface PrincipalRouteLandmass {
  readonly sourceId: TerritoryId;
  readonly ringIndex: number;
  readonly ring: readonly (readonly [number, number])[];
  readonly areaScore: number;
}

/**
 * One principal landmass per canonical country prevents naval lines from
 * jumping to tiny overseas islands. For island nations this naturally picks
 * their largest main island. Absorbed source records compete under the same
 * canonical id, so a dependency cannot displace its owner's mainland.
 */
const PRINCIPAL_ROUTE_LANDMASS_BY_COUNTRY = new Map<TerritoryId, PrincipalRouteLandmass>();
for (const country of dataset.countries) {
  const canonicalId = canonicalCountryId(country.id);
  if (!ACTIVE_COUNTRY_IDS.has(canonicalId)) continue;
  country.rings.forEach((ring, ringIndex) => {
    const candidate: PrincipalRouteLandmass = {
      sourceId: country.id,
      ringIndex,
      ring,
      areaScore: landRingAreaScore(ring),
    };
    const current = PRINCIPAL_ROUTE_LANDMASS_BY_COUNTRY.get(canonicalId);
    if (!current
      || candidate.areaScore > current.areaScore
      || (candidate.areaScore === current.areaScore
        && (candidate.sourceId.localeCompare(current.sourceId) < 0
          || (candidate.sourceId === current.sourceId && candidate.ringIndex < current.ringIndex)))) {
      PRINCIPAL_ROUTE_LANDMASS_BY_COUNTRY.set(canonicalId, candidate);
    }
  });
}

const COASTAL_ROUTE_ANCHORS = new Map<TerritoryId, CombatRoutePoint[]>();
for (const [canonicalId, landmass] of PRINCIPAL_ROUTE_LANDMASS_BY_COUNTRY) {
  const anchors: CombatRoutePoint[] = [];
  for (let index = 0; index < landmass.ring.length; index += 1) {
    const start = landmass.ring[index]!;
    const end = landmass.ring[(index + 1) % landmass.ring.length]!;
    if (RAW_EDGE_OCCURRENCES.get(rawEdgeKey(start, end)) !== 1) continue;
    const midpoint = geographicMidpoint(start, end);
    anchors.push(projectWorldPoint(midpoint[0], midpoint[1]));
  }
  COASTAL_ROUTE_ANCHORS.set(canonicalId, anchors);
}

function unwrapProjectedRing(
  canonicalId: TerritoryId,
  ring: readonly (readonly [number, number])[],
): ProjectedLandRing | undefined {
  if (ring.length < 3) return undefined;
  const points: CombatRoutePoint[] = [];
  for (const [longitude, latitude] of ring) {
    const projected = projectWorldPoint(longitude, latitude);
    if (points.length > 0) {
      const previous = points[points.length - 1]!;
      while (projected.x - previous.x > MAP_WIDTH / 2) projected.x -= MAP_WIDTH;
      while (projected.x - previous.x < -MAP_WIDTH / 2) projected.x += MAP_WIDTH;
    }
    points.push(projected);
  }
  const reducedPoints: CombatRoutePoint[] = [];
  for (const point of points) {
    const previous = reducedPoints[reducedPoints.length - 1];
    if (!previous || Math.hypot(previous.x - point.x, previous.y - point.y) >= 0.5) {
      reducedPoints.push(point);
    }
  }
  const validationPoints = reducedPoints.length >= 3 ? reducedPoints : points;
  const minimumX = Math.min(...validationPoints.map((point) => point.x));
  const maximumX = Math.max(...validationPoints.map((point) => point.x));
  const minimumY = Math.min(...validationPoints.map((point) => point.y));
  const maximumY = Math.max(...validationPoints.map((point) => point.y));
  return {
    canonicalId,
    points: validationPoints,
    minimumX,
    maximumX,
    minimumY,
    maximumY,
    centerX: (minimumX + maximumX) / 2,
  };
}

// Strategic validation uses the same principal-landmass abstraction as route
// endpoints. Tiny dependencies and offshore specks cannot block an ocean-wide
// lane, while every active country's main landmass remains a hard blocker.
const PROJECTED_LAND_RINGS: readonly ProjectedLandRing[] = [
  ...PRINCIPAL_ROUTE_LANDMASS_BY_COUNTRY,
].map(([canonicalId, landmass]) => unwrapProjectedRing(canonicalId, landmass.ring))
  .filter((ring): ring is ProjectedLandRing => Boolean(ring));

const LAND_EDGE_BUCKET_SIZE = 32;
const PROJECTED_LAND_EDGE_BUCKETS = new Map<string, ProjectedLandEdge[]>();

let projectedLandEdgeId = 0;
for (const ring of PROJECTED_LAND_RINGS) {
  for (let index = 0; index < ring.points.length; index += 1) {
    const rawStart = ring.points[index]!;
    const rawEnd = ring.points[(index + 1) % ring.points.length]!;
    for (const xShift of [-MAP_WIDTH, 0, MAP_WIDTH]) {
      const edge: ProjectedLandEdge = {
        id: projectedLandEdgeId,
        canonicalId: ring.canonicalId,
        start: { x: rawStart.x + xShift, y: rawStart.y },
        end: { x: rawEnd.x + xShift, y: rawEnd.y },
      };
      projectedLandEdgeId += 1;
      const minimumBucketX = Math.floor(Math.min(edge.start.x, edge.end.x) / LAND_EDGE_BUCKET_SIZE);
      const maximumBucketX = Math.floor(Math.max(edge.start.x, edge.end.x) / LAND_EDGE_BUCKET_SIZE);
      const minimumBucketY = Math.floor(Math.min(edge.start.y, edge.end.y) / LAND_EDGE_BUCKET_SIZE);
      const maximumBucketY = Math.floor(Math.max(edge.start.y, edge.end.y) / LAND_EDGE_BUCKET_SIZE);
      for (let bucketX = minimumBucketX; bucketX <= maximumBucketX; bucketX += 1) {
        for (let bucketY = minimumBucketY; bucketY <= maximumBucketY; bucketY += 1) {
          const key = `${bucketX}:${bucketY}`;
          const bucket = PROJECTED_LAND_EDGE_BUCKETS.get(key) ?? [];
          bucket.push(edge);
          PROJECTED_LAND_EDGE_BUCKETS.set(key, bucket);
        }
      }
    }
  }
}

function crossProduct(
  first: CombatRoutePoint,
  second: CombatRoutePoint,
  third: CombatRoutePoint,
): number {
  return (second.x - first.x) * (third.y - first.y)
    - (second.y - first.y) * (third.x - first.x);
}

function pointOnSegment(
  point: CombatRoutePoint,
  start: CombatRoutePoint,
  end: CombatRoutePoint,
): boolean {
  const epsilon = 1e-7;
  return Math.abs(crossProduct(start, end, point)) <= epsilon
    && point.x >= Math.min(start.x, end.x) - epsilon
    && point.x <= Math.max(start.x, end.x) + epsilon
    && point.y >= Math.min(start.y, end.y) - epsilon
    && point.y <= Math.max(start.y, end.y) + epsilon;
}

function routeSegmentIntersectsLandEdge(
  routeStart: CombatRoutePoint,
  routeEnd: CombatRoutePoint,
  landStart: CombatRoutePoint,
  landEnd: CombatRoutePoint,
): boolean {
  if (Math.max(routeStart.x, routeEnd.x) < Math.min(landStart.x, landEnd.x)
    || Math.min(routeStart.x, routeEnd.x) > Math.max(landStart.x, landEnd.x)
    || Math.max(routeStart.y, routeEnd.y) < Math.min(landStart.y, landEnd.y)
    || Math.min(routeStart.y, routeEnd.y) > Math.max(landStart.y, landEnd.y)) return false;
  const first = crossProduct(routeStart, routeEnd, landStart);
  const second = crossProduct(routeStart, routeEnd, landEnd);
  const third = crossProduct(landStart, landEnd, routeStart);
  const fourth = crossProduct(landStart, landEnd, routeEnd);
  if (((first > 0 && second < 0) || (first < 0 && second > 0))
    && ((third > 0 && fourth < 0) || (third < 0 && fourth > 0))) return true;
  return (Math.abs(first) <= 1e-7 && pointOnSegment(landStart, routeStart, routeEnd))
    || (Math.abs(second) <= 1e-7 && pointOnSegment(landEnd, routeStart, routeEnd))
    || (Math.abs(third) <= 1e-7 && pointOnSegment(routeStart, landStart, landEnd))
    || (Math.abs(fourth) <= 1e-7 && pointOnSegment(routeEnd, landStart, landEnd));
}

function navalRouteCrossesThirdPartyLand(
  leftId: TerritoryId,
  rightId: TerritoryId,
  samples: readonly CombatRoutePoint[],
): boolean {
  for (let sampleIndex = 1; sampleIndex < samples.length; sampleIndex += 1) {
    const routeStart = samples[sampleIndex - 1]!;
    const routeEnd = samples[sampleIndex]!;
    const minimumBucketX = Math.floor(Math.min(routeStart.x, routeEnd.x) / LAND_EDGE_BUCKET_SIZE);
    const maximumBucketX = Math.floor(Math.max(routeStart.x, routeEnd.x) / LAND_EDGE_BUCKET_SIZE);
    const minimumBucketY = Math.floor(Math.min(routeStart.y, routeEnd.y) / LAND_EDGE_BUCKET_SIZE);
    const maximumBucketY = Math.floor(Math.max(routeStart.y, routeEnd.y) / LAND_EDGE_BUCKET_SIZE);
    const checkedEdges = new Set<number>();
    for (let bucketX = minimumBucketX; bucketX <= maximumBucketX; bucketX += 1) {
      for (let bucketY = minimumBucketY; bucketY <= maximumBucketY; bucketY += 1) {
        const bucket = PROJECTED_LAND_EDGE_BUCKETS.get(`${bucketX}:${bucketY}`) ?? [];
        for (const edge of bucket) {
          if (checkedEdges.has(edge.id)) continue;
          checkedEdges.add(edge.id);
          if (edge.canonicalId === leftId || edge.canonicalId === rightId) continue;
          if (routeSegmentIntersectsLandEdge(routeStart, routeEnd, edge.start, edge.end)) return true;
        }
      }
    }
  }
  return false;
}

/** Inverse of projectWorldPoint, shared with curved globe route presentation. */
export function worldPointCoordinates(point: CombatRoutePoint): readonly [number, number] {
  return [
    point.x / MAP_WIDTH * 360 - 180,
    WORLD_MAX_LATITUDE - (point.y - WORLD_TOP) / (WORLD_BOTTOM - WORLD_TOP)
      * (WORLD_MAX_LATITUDE - WORLD_MIN_LATITUDE),
  ];
}

function coordinateDistanceKm(
  left: readonly [number, number],
  right: readonly [number, number],
): number {
  const radians = Math.PI / 180;
  const leftLatitude = left[1] * radians;
  const rightLatitude = right[1] * radians;
  const latitudeDelta = (right[1] - left[1]) * radians;
  const longitudeDelta = (right[0] - left[0]) * radians;
  const chord = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(chord), Math.sqrt(Math.max(0, 1 - chord)));
}

function sampledRouteDistanceKm(samples: readonly CombatRoutePoint[]): number {
  let distance = 0;
  for (let index = 1; index < samples.length; index += 1) {
    distance += coordinateDistanceKm(
      worldPointCoordinates(samples[index - 1]!),
      worldPointCoordinates(samples[index]!),
    );
  }
  return distance;
}

const SEA_ROUTE_GEOMETRY_CACHE = new Map<string, CanonicalSeaRouteGeometry | null>();

function wrappedPointNear(point: CombatRoutePoint, anchorX: number): CombatRoutePoint {
  let x = point.x;
  while (x - anchorX > MAP_WIDTH / 2) x -= MAP_WIDTH;
  while (x - anchorX < -MAP_WIDTH / 2) x += MAP_WIDTH;
  return { x, y: point.y };
}

function coastalAnchorCandidates(
  countryId: TerritoryId,
  target: CombatRoutePoint,
): readonly CombatRoutePoint[] {
  const anchors = COASTAL_ROUTE_ANCHORS.get(countryId) ?? [];
  const nearest: { point: CombatRoutePoint; distanceSquared: number; index: number }[] = [];
  anchors.forEach((anchor, index) => {
    const point = wrappedPointNear(anchor, target.x);
    const distanceSquared = (point.x - target.x) ** 2 + (point.y - target.y) ** 2;
    const insertionIndex = nearest.findIndex((candidate) => (
      distanceSquared < candidate.distanceSquared
        || (distanceSquared === candidate.distanceSquared && index < candidate.index)
    ));
    if (insertionIndex >= 0) nearest.splice(insertionIndex, 0, { point, distanceSquared, index });
    else nearest.push({ point, distanceSquared, index });
    if (nearest.length > 4) nearest.pop();
  });
  return nearest.map((candidate) => candidate.point);
}

function canonicalSeaRouteGeometry(
  leftId: TerritoryId,
  rightId: TerritoryId,
): CanonicalSeaRouteGeometry | undefined {
  const pair = [leftId, rightId].sort() as [TerritoryId, TerritoryId];
  const key = pair.join(':');
  const cached = SEA_ROUTE_GEOMETRY_CACHE.get(key);
  if (cached !== undefined) return cached ?? undefined;
  const left = ACTIVE_COUNTRY_BY_ID.get(pair[0]);
  const right = ACTIVE_COUNTRY_BY_ID.get(pair[1]);
  if (!left || !right || pair[0] === pair[1]
    || LANDLOCKED_COUNTRY_IDS.has(pair[0]) || LANDLOCKED_COUNTRY_IDS.has(pair[1])) {
    SEA_ROUTE_GEOMETRY_CACHE.set(key, null);
    return undefined;
  }
  const authoredGeometry = AUTHORED_SEA_ROUTE_GEOMETRY_BY_KEY[key];
  if (authoredGeometry) {
    const source = projectWorldPoint(...authoredGeometry.leftCoast);
    const target = wrappedPointNear(projectWorldPoint(...authoredGeometry.rightCoast), source.x);
    for (const bendDirection of authoredGeometry.bendDirections) {
      const samples = sampleCombatRoute(
        source,
        target,
        'naval',
        bendDirection,
        NAVAL_ROUTE_VALIDATION_SEGMENTS,
      );
      if (navalRouteCrossesThirdPartyLand(pair[0], pair[1], samples)) continue;
      const geometry = {
        leftId: pair[0],
        rightId: pair[1],
        source,
        target,
        bendDirection,
        distanceKm: sampledRouteDistanceKm(samples),
      } satisfies CanonicalSeaRouteGeometry;
      SEA_ROUTE_GEOMETRY_CACHE.set(key, geometry);
      return geometry;
    }
  }
  const leftCenter = projectWorldPoint(left.label[0], left.label[1]);
  const rightCenter = wrappedPointNear(projectWorldPoint(right.label[0], right.label[1]), leftCenter.x);
  const sourceCandidates = coastalAnchorCandidates(pair[0], rightCenter);
  const targetCandidates = coastalAnchorCandidates(pair[1], leftCenter);
  const endpointPairs = sourceCandidates.flatMap((source) => targetCandidates.map((rawTarget) => {
    const target = wrappedPointNear(rawTarget, source.x);
    return { source, target, directDistance: Math.hypot(target.x - source.x, target.y - source.y) };
  })).sort((leftPair, rightPair) => leftPair.directDistance - rightPair.directDistance)
    .slice(0, 4);
  const defaultBend = combatRouteBendDirection(pair[0], pair[1]);
  const alternateBend: -1 | 1 = defaultBend === 1 ? -1 : 1;
  for (const endpoints of endpointPairs) {
    for (const bendDirection of [defaultBend, alternateBend] as const) {
      const samples = sampleCombatRoute(
        endpoints.source,
        endpoints.target,
        'naval',
        bendDirection,
        NAVAL_ROUTE_VALIDATION_SEGMENTS,
      );
      if (navalRouteCrossesThirdPartyLand(pair[0], pair[1], samples)) continue;
      const geometry = {
        leftId: pair[0],
        rightId: pair[1],
        source: endpoints.source,
        target: endpoints.target,
        bendDirection,
        distanceKm: sampledRouteDistanceKm(samples),
      } satisfies CanonicalSeaRouteGeometry;
      SEA_ROUTE_GEOMETRY_CACHE.set(key, geometry);
      return geometry;
    }
  }
  SEA_ROUTE_GEOMETRY_CACHE.set(key, null);
  return undefined;
}

/** Whether the exact naval arc drawn on the map stays clear of third-party land. */
export function isValidSeaRoute(leftId: TerritoryId, rightId: TerritoryId): boolean {
  return Boolean(canonicalSeaRouteGeometry(leftId, rightId));
}

/** Actual length of the canonical curved sea lane, not anchor-to-anchor distance. */
export function countrySeaRouteDistanceKm(leftId: TerritoryId, rightId: TerritoryId): number | undefined {
  return canonicalSeaRouteGeometry(leftId, rightId)?.distanceKm;
}

/** Bend used by both persistent route lines and individual naval battle markers. */
export function countrySeaRouteBendDirection(leftId: TerritoryId, rightId: TerritoryId): -1 | 1 {
  const geometry = canonicalSeaRouteGeometry(leftId, rightId);
  if (!geometry) return combatRouteBendDirection(leftId, rightId);
  return leftId === geometry.leftId ? geometry.bendDirection : (geometry.bendDirection * -1) as -1 | 1;
}

/** Projected port-to-port endpoints used by the map renderer for this sea lane. */
export function countrySeaRouteMapGeometry(
  leftId: TerritoryId,
  rightId: TerritoryId,
): CountrySeaRouteMapGeometry | undefined {
  const geometry = canonicalSeaRouteGeometry(leftId, rightId);
  if (!geometry) return undefined;
  if (leftId === geometry.leftId) {
    return {
      source: { ...geometry.source },
      target: { ...geometry.target },
      bendDirection: geometry.bendDirection,
    };
  }
  const source = {
    x: ((geometry.target.x % MAP_WIDTH) + MAP_WIDTH) % MAP_WIDTH,
    y: geometry.target.y,
  };
  const target = wrappedPointNear(geometry.source, source.x);
  return {
    source,
    target,
    bendDirection: geometry.bendDirection === 1 ? -1 : 1,
  };
}

function buildStrategicSeaRoutes(): readonly (readonly [TerritoryId, TerritoryId])[] {
  const routes = new Map<string, readonly [TerritoryId, TerritoryId]>();
  const coastalCountryIds = COUNTRIES
    .map((country) => country.id)
    .filter((countryId) => (
      !LANDLOCKED_COUNTRY_IDS.has(countryId)
        && (COASTAL_ROUTE_ANCHORS.get(countryId)?.length ?? 0) > 0
    ))
    .sort();
  const landNeighboursByCountry = new Map(coastalCountryIds.map((countryId) => [
    countryId,
    new Set(activeNeighbours(countryId)),
  ]));
  const degree = new Map<TerritoryId, number>();
  const addRoute = (leftId: TerritoryId, rightId: TerritoryId): boolean => {
    if (landNeighboursByCountry.get(leftId)?.has(rightId)) return false;
    const pair = [leftId, rightId].sort() as [TerritoryId, TerritoryId];
    const key = pair.join(':');
    if (routes.has(key)) return true;
    const geometry = canonicalSeaRouteGeometry(pair[0], pair[1]);
    if (!geometry) return false;
    routes.set(key, pair);
    degree.set(pair[0], (degree.get(pair[0]) ?? 0) + 1);
    degree.set(pair[1], (degree.get(pair[1]) ?? 0) + 1);
    return true;
  };

  // Preserve authored proximity links for islands inside one continent. The
  // cross-continent entries are admitted only through the sparse gateway list.
  for (const key of SEA_ONLY_CONNECTION_KEYS) {
    const [leftId, rightId] = key.split(':') as [TerritoryId, TerritoryId];
    const left = ACTIVE_COUNTRY_BY_ID.get(leftId);
    const right = ACTIVE_COUNTRY_BY_ID.get(rightId);
    if (left?.continent === right?.continent) addRoute(leftId, rightId);
  }

  for (const countryId of coastalCountryIds) {
    const country = ACTIVE_COUNTRY_BY_ID.get(countryId)!;
    const candidates = coastalCountryIds
      .filter((candidateId) => candidateId !== countryId
        && !landNeighboursByCountry.get(countryId)!.has(candidateId))
      .map((candidateId) => ({
        id: candidateId,
        distance: countryDistanceKm(countryId, candidateId),
        country: ACTIVE_COUNTRY_BY_ID.get(candidateId)!,
      }))
      .filter((candidate) => candidate.country.continent === country.continent
        && (candidate.distance <= REGIONAL_NEARBY_DISTANCE_KM
          || (candidate.country.subregion === country.subregion
            && candidate.distance <= REGIONAL_SUBREGION_DISTANCE_KM)))
      .sort((left, right) => left.distance - right.distance || left.id.localeCompare(right.id));

    for (const candidate of candidates.slice(0, REGIONAL_CANDIDATE_LIMIT)) {
      if ((degree.get(countryId) ?? 0) >= TARGET_REGIONAL_NAVAL_ROUTES) break;
      addRoute(countryId, candidate.id);
    }
  }

  // Give a coastal country with no land or generated sea exit one nearest
  // same-continent fallback. This protects isolated starts without restoring
  // the old universal global-route entitlement.
  for (const countryId of coastalCountryIds) {
    if ((degree.get(countryId) ?? 0) > 0 || landNeighboursByCountry.get(countryId)!.size > 0) continue;
    const country = ACTIVE_COUNTRY_BY_ID.get(countryId)!;
    const candidates = coastalCountryIds
      .filter((candidateId) => candidateId !== countryId
        && ACTIVE_COUNTRY_BY_ID.get(candidateId)?.continent === country.continent)
      .map((candidateId) => ({
        id: candidateId,
        distance: countryDistanceKm(countryId, candidateId),
      }))
      .filter((candidate) => candidate.distance <= ISOLATED_REGIONAL_FALLBACK_DISTANCE_KM)
      .sort((left, right) => left.distance - right.distance || left.id.localeCompare(right.id));
    for (const candidate of candidates) if (addRoute(countryId, candidate.id)) break;
  }

  // Append the exact campaign beachheads after regional generation so a
  // gateway never consumes a local route slot or creates a hidden mesh.
  for (const [leftId, rightId] of AUTHORED_INTERCONTINENTAL_SEA_GATEWAYS) {
    addRoute(leftId, rightId);
  }
  return [...routes.values()].sort((left, right) => (
    left[0].localeCompare(right[0]) || left[1].localeCompare(right[1])
  ));
}

export const STRATEGIC_SEA_ROUTE_PAIRS = buildStrategicSeaRoutes();

const seaNeighbourMap = new Map<TerritoryId, Set<TerritoryId>>();
for (const [left, right] of STRATEGIC_SEA_ROUTE_PAIRS) {
  if (!ACTIVE_COUNTRY_IDS.has(left) || !ACTIVE_COUNTRY_IDS.has(right)) continue;
  if (!seaNeighbourMap.has(left)) seaNeighbourMap.set(left, new Set());
  if (!seaNeighbourMap.has(right)) seaNeighbourMap.set(right, new Set());
  seaNeighbourMap.get(left)!.add(right);
  seaNeighbourMap.get(right)!.add(left);
}

export const COUNTRY_BY_ID: Readonly<Record<TerritoryId, CountryRecord>> = Object.fromEntries(
  COUNTRIES.map((country) => [country.id, country]),
);

export const TERRITORIES: readonly TerritoryDefinition[] = COUNTRIES.map((country, index) => {
  const point = projectWorldPoint(country.label[0], country.label[1]);
  const landNeighbors = activeNeighbours(country.id);
  const seaNeighbors = [...(seaNeighbourMap.get(country.id) ?? [])]
    .filter((neighborId) => !landNeighbors.includes(neighborId))
    .sort();
  return {
    id: country.id,
    name: country.englishName,
    regionId: country.regionId,
    x: point.x,
    y: point.y,
    radiusX: 24,
    radiusY: 18,
    shapeSeed: index + 1,
    neighbors: [...new Set([...landNeighbors, ...seaNeighbors])].sort(),
    seaNeighbors,
  };
});

export const TERRITORY_BY_ID: Readonly<Record<TerritoryId, TerritoryDefinition>> = Object.fromEntries(
  TERRITORIES.map((territory) => [territory.id, territory]),
);

export const REGION_BY_ID: Readonly<Record<RegionId, RegionDefinition>> = Object.fromEntries(
  REGIONS.map((region) => [region.id, region]),
);

export function territoriesInRegion(regionId: RegionId): TerritoryDefinition[] {
  return TERRITORIES.filter((territory) => territory.regionId === regionId);
}

export function isSeaConnection(leftId: TerritoryId, rightId: TerritoryId): boolean {
  return Boolean(TERRITORY_BY_ID[leftId]?.seaNeighbors.includes(rightId));
}

function hueToRgb(p: number, q: number, value: number): number {
  let t = value;
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

export function countryColor(countryId: TerritoryId): number {
  let hash = 2_166_136_261;
  for (const character of countryId) hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619);
  const hue = ((hash >>> 0) % 360) / 360;
  const saturation = 0.58;
  const lightness = 0.56;
  const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  const red = Math.round(hueToRgb(p, q, hue + 1 / 3) * 255);
  const green = Math.round(hueToRgb(p, q, hue) * 255);
  const blue = Math.round(hueToRgb(p, q, hue - 1 / 3) * 255);
  return (red << 16) | (green << 8) | blue;
}

export function colorToCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

const DEFAULT_TERRAIN_PROFILE: readonly TerrainProfileEntry[] = Object.freeze([
  Object.freeze({ terrain: 'plains', share: 1 }),
]);

/** Dominant-first strategic terrain mix; shares always add up to one. */
export function terrainProfileForTerritory(
  territoryId: TerritoryId,
): readonly TerrainProfileEntry[] {
  return COUNTRY_TERRAIN_PROFILES[territoryId] ?? DEFAULT_TERRAIN_PROFILE;
}

export function terrainForTerritory(territoryId: TerritoryId): TerrainType {
  return terrainProfileForTerritory(territoryId)[0]?.terrain ?? 'plains';
}

export function validateMap(): string[] {
  const errors: string[] = [];
  const ids = new Set(TERRITORIES.map((territory) => territory.id));
  const regionIds = new Set(REGIONS.map((region) => region.id));
  if (ids.size !== TERRITORIES.length) errors.push('Country IDs are not unique.');

  for (const territory of TERRITORIES) {
    if (!regionIds.has(territory.regionId)) errors.push(`${territory.name} has an unknown region.`);
    if (territory.neighbors.length === 0) errors.push(`${territory.name} has no land or sea connection.`);
    const profile = COUNTRY_TERRAIN_PROFILES[territory.id];
    if (!profile) {
      errors.push(`${territory.name} has no terrain profile.`);
    } else {
      const terrainTypes = new Set<TerrainType>();
      let totalShare = 0;
      for (const entry of profile) {
        if (terrainTypes.has(entry.terrain)) errors.push(`${territory.name} repeats ${entry.terrain} terrain.`);
        terrainTypes.add(entry.terrain);
        if (!(entry.share > 0 && entry.share <= 1)) errors.push(`${territory.name} has an invalid ${entry.terrain} share.`);
        totalShare += entry.share;
      }
      if (Math.abs(totalShare - 1) > 0.000001) errors.push(`${territory.name} terrain shares do not add up to 100%.`);
      if (LANDLOCKED_COUNTRY_IDS.has(territory.id) && terrainTypes.has('coastal')) {
        errors.push(`${territory.name} is landlocked but has coastal terrain.`);
      }
    }
    for (const neighbor of territory.neighbors) {
      if (!ids.has(neighbor)) errors.push(`${territory.name} references unknown neighbour ${neighbor}.`);
      if (!TERRITORY_BY_ID[neighbor]?.neighbors.includes(territory.id)) errors.push(`Connection ${territory.id} ↔ ${neighbor} is not reciprocal.`);
    }
  }
  for (const countryId of Object.keys(COUNTRY_TERRAIN_PROFILES)) {
    if (!ids.has(countryId)) errors.push(`Terrain profile ${countryId} does not match a playable country.`);
  }

  const visited = new Set<TerritoryId>();
  const queue: TerritoryId[] = TERRITORIES.length > 0 ? [TERRITORIES[0]!.id] : [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const neighbor of TERRITORY_BY_ID[id]?.neighbors ?? []) queue.push(neighbor);
  }
  if (visited.size !== TERRITORIES.length) errors.push(`The world map contains ${TERRITORIES.length - visited.size} disconnected countries.`);
  return errors;
}
