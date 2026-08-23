import rawWorldData from '../../assets/world-countries.json?raw';
import type { Point, RegionDefinition, RegionId, TerrainType, TerritoryDefinition, TerritoryId } from '../types';

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
export const MAP_HEIGHT = 760;
export const WORLD_MAX_LATITUDE = 84;
export const WORLD_MIN_LATITUDE = -58;
const WORLD_TOP = 28;
const WORLD_BOTTOM = MAP_HEIGHT - 32;

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

// Caspian-only and genuinely landlocked states do not receive artificial access to
// the global naval network. All other countries get a small set of nearby sea lanes;
// isolated islands get a few more so they remain viable conquest starts.
const LANDLOCKED_COUNTRY_IDS = new Set<TerritoryId>([
  'afg', 'arm', 'aut', 'aze', 'blr', 'btn', 'bol', 'bwa', 'bfa', 'bdi', 'caf', 'tcd', 'cze', 'swz',
  'eth', 'hun', 'kaz', 'kos', 'kgz', 'lao', 'lso', 'lux', 'mwi', 'mli', 'mda', 'mng', 'npl', 'ner',
  'mkd', 'pry', 'rwa', 'srb', 'svk', 'sds', 'che', 'tjk', 'tkm', 'uga', 'uzb', 'zmb', 'zwe',
]);

// These long-haul corridors complement the generated regional network and represent
// established military sea lanes rather than literal ferry services.
const CORE_SEA_ROUTE_PAIRS: readonly (readonly [TerritoryId, TerritoryId])[] = [
  ['bel', 'gbr'], ['nld', 'gbr'], ['gbr', 'fra'], ['gbr', 'nor'], ['gbr', 'isl'], ['gbr', 'esp'], ['gbr', 'prt'],
  ['irl', 'fra'], ['irl', 'esp'], ['isl', 'nor'], ['isl', 'can'], ['prt', 'usa'], ['esp', 'dza'], ['fra', 'dza'], ['fra', 'can'],
  ['ita', 'tun'], ['ita', 'lby'], ['ita', 'grc'], ['grc', 'egy'], ['tur', 'egy'], ['cyp', 'grc'],
  ['cyp', 'tur'], ['cyp', 'isr'], ['mar', 'sen'], ['sen', 'bra'], ['bra', 'ago'], ['bra', 'zaf'],
  ['egy', 'sau'], ['dji', 'yem'], ['som', 'yem'], ['tza', 'mdg'], ['moz', 'mdg'], ['zaf', 'mdg'],
  ['ind', 'lka'], ['ind', 'omn'], ['ind', 'mys'], ['ind', 'idn'], ['pak', 'omn'], ['irn', 'are'], ['are', 'omn'], ['vnm', 'phl'], ['vnm', 'idn'],
  ['chn', 'phl'], ['chn', 'jpn'], ['jpn', 'kor'], ['jpn', 'prk'], ['jpn', 'phl'], ['jpn', 'usa'], ['rus', 'jpn'], ['rus', 'usa'],
  ['phl', 'idn'], ['mys', 'idn'], ['sgp', 'idn'],
  ['idn', 'aus'], ['idn', 'png'], ['aus', 'png'], ['aus', 'nzl'], ['aus', 'usa'], ['chl', 'nzl'], ['chl', 'aus'],
  ['cub', 'col'], ['cub', 'mex'], ['cub', 'usa'], ['usa', 'gbr'], ['usa', 'fra'], ['usa', 'jpn'], ['can', 'grl'], ['grl', 'isl'],
  ['arg', 'zaf'], ['zaf', 'aus'], ['zaf', 'ind'], ['bra', 'prt'],
];

// The source dataset uses proximity adjacency for these Arctic island links.
// They remain connections in-game, but must be classified as naval routes rather
// than physical land borders now that Greenland is a standalone country.
const SEA_ONLY_CONNECTION_KEYS = new Set(['can:grl', 'grl:isl']);

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

function buildStrategicSeaRoutes(): readonly (readonly [TerritoryId, TerritoryId])[] {
  const routes = new Map<string, readonly [TerritoryId, TerritoryId]>();
  const degree = new Map<TerritoryId, number>();
  const addRoute = (left: TerritoryId, right: TerritoryId): void => {
    if (left === right || !ACTIVE_COUNTRY_IDS.has(left) || !ACTIVE_COUNTRY_IDS.has(right)) return;
    if (LANDLOCKED_COUNTRY_IDS.has(left) || LANDLOCKED_COUNTRY_IDS.has(right)) return;
    if (activeNeighbours(left).includes(right)) return;
    const pair = [left, right].sort() as [TerritoryId, TerritoryId];
    const key = pair.join(':');
    if (routes.has(key)) return;
    routes.set(key, pair);
    degree.set(left, (degree.get(left) ?? 0) + 1);
    degree.set(right, (degree.get(right) ?? 0) + 1);
  };

  for (const [left, right] of CORE_SEA_ROUTE_PAIRS) addRoute(left, right);
  for (const country of [...COUNTRIES].sort((left, right) => left.id.localeCompare(right.id))) {
    if (LANDLOCKED_COUNTRY_IDS.has(country.id)) continue;
    const landNeighbours = new Set(activeNeighbours(country.id));
    const isolated = landNeighbours.size === 0;
    const desiredRoutes = isolated ? 8 : 6;
    const maximumDistance = isolated ? 9_000 : 6_000;
    const candidates = COUNTRIES
      .filter((candidate) => candidate.id !== country.id
        && !LANDLOCKED_COUNTRY_IDS.has(candidate.id)
        && !landNeighbours.has(candidate.id))
      .map((candidate) => ({ id: candidate.id, distance: countryDistanceKm(country.id, candidate.id) }))
      .filter((candidate) => candidate.distance <= maximumDistance)
      .sort((left, right) => left.distance - right.distance || left.id.localeCompare(right.id));
    for (const candidate of candidates) {
      if ((degree.get(country.id) ?? 0) >= desiredRoutes) break;
      addRoute(country.id, candidate.id);
    }
  }
  return [...routes.values()].sort((left, right) => left[0].localeCompare(right[0]) || left[1].localeCompare(right[1]));
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

const MOUNTAIN_STATES = new Set(['afg', 'arm', 'aut', 'btn', 'che', 'geo', 'kgz', 'lso', 'npl', 'tjk']);
const URBAN_STATES = new Set(['bel', 'deu', 'gbr', 'jpn', 'kor', 'nld', 'sgp']);
const ARCTIC_STATES = new Set(['can', 'grl', 'isl', 'nor', 'rus', 'swe', 'fin']);

export function terrainForTerritory(territoryId: TerritoryId): TerrainType {
  const country = COUNTRY_BY_ID[territoryId];
  if (!country) return 'plains';
  if (MOUNTAIN_STATES.has(territoryId)) return 'mountain';
  if (URBAN_STATES.has(territoryId)) return 'urban';
  if (ARCTIC_STATES.has(territoryId) || country.subregion.includes('Northern Europe')) return 'arctic';
  if (country.subregion.includes('Northern Africa') || country.subregion.includes('Western Asia')) return 'desert';
  if (country.subregion.includes('Middle Africa') || country.subregion.includes('South-Eastern Asia')) return 'jungle';
  if (country.type !== 'Country' || country.rings.length > 3) return 'coastal';
  return 'plains';
}

export function validateMap(): string[] {
  const errors: string[] = [];
  const ids = new Set(TERRITORIES.map((territory) => territory.id));
  const regionIds = new Set(REGIONS.map((region) => region.id));
  if (ids.size !== TERRITORIES.length) errors.push('Country IDs are not unique.');

  for (const territory of TERRITORIES) {
    if (!regionIds.has(territory.regionId)) errors.push(`${territory.name} has an unknown region.`);
    if (territory.neighbors.length === 0) errors.push(`${territory.name} has no land or sea connection.`);
    for (const neighbor of territory.neighbors) {
      if (!ids.has(neighbor)) errors.push(`${territory.name} references unknown neighbour ${neighbor}.`);
      if (!TERRITORY_BY_ID[neighbor]?.neighbors.includes(territory.id)) errors.push(`Connection ${territory.id} ↔ ${neighbor} is not reciprocal.`);
    }
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
