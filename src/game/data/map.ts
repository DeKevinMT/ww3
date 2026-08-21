import type { Point, RegionDefinition, RegionId, TerritoryDefinition, TerritoryId } from '../types';

type TerritorySeed = Omit<TerritoryDefinition, 'neighbors' | 'seaNeighbors'>;

export const MAP_WIDTH = 1280;
export const MAP_HEIGHT = 760;

export const REGIONS: readonly RegionDefinition[] = [
  {
    id: 'northreach',
    name: 'Noord-Amerika',
    bonus: 3,
    color: 0x58b8c9,
    hull: [
      { x: 262, y: 74 }, { x: 420, y: 54 }, { x: 595, y: 68 }, { x: 742, y: 112 },
      { x: 716, y: 234 }, { x: 560, y: 265 }, { x: 378, y: 251 }, { x: 284, y: 188 },
    ],
  },
  {
    id: 'westreach',
    name: 'Zuid-Amerika',
    bonus: 3,
    color: 0x5aa889,
    hull: [
      { x: 58, y: 218 }, { x: 181, y: 186 }, { x: 326, y: 224 }, { x: 376, y: 337 },
      { x: 349, y: 506 }, { x: 267, y: 566 }, { x: 117, y: 515 }, { x: 59, y: 392 },
    ],
  },
  {
    id: 'heartlands',
    name: 'Europa',
    bonus: 4,
    color: 0xd0a55d,
    hull: [
      { x: 361, y: 250 }, { x: 492, y: 222 }, { x: 664, y: 247 }, { x: 745, y: 332 },
      { x: 728, y: 512 }, { x: 604, y: 556 }, { x: 430, y: 525 }, { x: 365, y: 411 },
    ],
  },
  {
    id: 'suncoast',
    name: 'Afrika',
    bonus: 3,
    color: 0xd47b5b,
    hull: [
      { x: 187, y: 534 }, { x: 337, y: 499 }, { x: 526, y: 516 }, { x: 648, y: 594 },
      { x: 581, y: 710 }, { x: 402, y: 728 }, { x: 244, y: 682 },
    ],
  },
  {
    id: 'ashen',
    name: 'Azië',
    bonus: 3,
    color: 0xa47bb7,
    hull: [
      { x: 756, y: 170 }, { x: 911, y: 147 }, { x: 1082, y: 192 }, { x: 1165, y: 294 },
      { x: 1103, y: 455 }, { x: 962, y: 501 }, { x: 801, y: 449 }, { x: 741, y: 315 },
    ],
  },
  {
    id: 'jade',
    name: 'Indo-Pacific',
    bonus: 2,
    color: 0x61a7a4,
    hull: [
      { x: 744, y: 516 }, { x: 897, y: 491 }, { x: 1064, y: 518 }, { x: 1152, y: 606 },
      { x: 1051, y: 710 }, { x: 891, y: 724 }, { x: 755, y: 652 },
    ],
  },
];

const TERRITORY_SEEDS: readonly TerritorySeed[] = [
  { id: 'vaelor', name: 'West-Canada', regionId: 'northreach', x: 332, y: 132, radiusX: 57, radiusY: 43, shapeSeed: 11 },
  { id: 'iskar', name: 'Oost-Canada', regionId: 'northreach', x: 458, y: 116, radiusX: 62, radiusY: 43, shapeSeed: 12 },
  { id: 'nivor', name: 'Groenland', regionId: 'northreach', x: 610, y: 130, radiusX: 65, radiusY: 45, shapeSeed: 13 },
  { id: 'eiren', name: 'West-VS', regionId: 'northreach', x: 405, y: 207, radiusX: 66, radiusY: 42, shapeSeed: 14 },
  { id: 'solvik', name: 'Oost-VS', regionId: 'northreach', x: 558, y: 207, radiusX: 68, radiusY: 43, shapeSeed: 15 },

  { id: 'brannoc', name: 'Colombia', regionId: 'westreach', x: 131, y: 278, radiusX: 57, radiusY: 49, shapeSeed: 21 },
  { id: 'cael', name: 'Brazilië', regionId: 'westreach', x: 258, y: 272, radiusX: 61, radiusY: 47, shapeSeed: 22 },
  { id: 'mirewatch', name: 'Peru', regionId: 'westreach', x: 127, y: 397, radiusX: 57, radiusY: 56, shapeSeed: 23 },
  { id: 'ordan', name: 'Bolivia', regionId: 'westreach', x: 255, y: 394, radiusX: 65, radiusY: 54, shapeSeed: 24 },
  { id: 'greyfen', name: 'Argentinië', regionId: 'westreach', x: 282, y: 507, radiusX: 62, radiusY: 45, shapeSeed: 25 },

  { id: 'ardent', name: 'VK & Ierland', regionId: 'heartlands', x: 421, y: 309, radiusX: 55, radiusY: 48, shapeSeed: 31 },
  { id: 'vela', name: 'Frankrijk', regionId: 'heartlands', x: 536, y: 288, radiusX: 56, radiusY: 46, shapeSeed: 32 },
  { id: 'crownstep', name: 'Duitsland', regionId: 'heartlands', x: 658, y: 320, radiusX: 57, radiusY: 48, shapeSeed: 33 },
  { id: 'halden', name: 'Iberië', regionId: 'heartlands', x: 432, y: 422, radiusX: 57, radiusY: 52, shapeSeed: 34 },
  { id: 'lume', name: 'Italië', regionId: 'heartlands', x: 552, y: 410, radiusX: 59, radiusY: 52, shapeSeed: 35 },
  { id: 'bastion', name: 'Oost-Europa', regionId: 'heartlands', x: 665, y: 463, radiusX: 58, radiusY: 49, shapeSeed: 36 },

  { id: 'sirocco', name: 'Maghreb', regionId: 'suncoast', x: 267, y: 576, radiusX: 56, radiusY: 44, shapeSeed: 41 },
  { id: 'aven', name: 'West-Afrika', regionId: 'suncoast', x: 388, y: 558, radiusX: 61, radiusY: 43, shapeSeed: 42 },
  { id: 'maris', name: 'Nijlstaten', regionId: 'suncoast', x: 516, y: 574, radiusX: 62, radiusY: 44, shapeSeed: 43 },
  { id: 'emberbay', name: 'Centraal-Afrika', regionId: 'suncoast', x: 337, y: 661, radiusX: 62, radiusY: 42, shapeSeed: 44 },
  { id: 'caldera', name: 'Zuid-Afrika', regionId: 'suncoast', x: 493, y: 668, radiusX: 69, radiusY: 42, shapeSeed: 45 },

  { id: 'oris', name: 'Rusland', regionId: 'ashen', x: 824, y: 240, radiusX: 62, radiusY: 50, shapeSeed: 51 },
  { id: 'tarn', name: 'Centraal-Azië', regionId: 'ashen', x: 955, y: 230, radiusX: 62, radiusY: 47, shapeSeed: 52 },
  { id: 'zephyr', name: 'Korea-Japan', regionId: 'ashen', x: 1080, y: 290, radiusX: 62, radiusY: 51, shapeSeed: 53 },
  { id: 'khepri', name: 'India', regionId: 'ashen', x: 837, y: 384, radiusX: 65, radiusY: 55, shapeSeed: 54 },
  { id: 'redmesa', name: 'China', regionId: 'ashen', x: 981, y: 412, radiusX: 70, radiusY: 52, shapeSeed: 55 },

  { id: 'nara', name: 'ASEAN-kern', regionId: 'jade', x: 800, y: 573, radiusX: 55, radiusY: 45, shapeSeed: 61 },
  { id: 'osei', name: 'Indonesië', regionId: 'jade', x: 915, y: 550, radiusX: 56, radiusY: 43, shapeSeed: 62 },
  { id: 'tidesong', name: 'Pacific', regionId: 'jade', x: 1044, y: 589, radiusX: 66, radiusY: 49, shapeSeed: 63 },
  { id: 'jadecrown', name: 'Australië', regionId: 'jade', x: 929, y: 670, radiusX: 64, radiusY: 42, shapeSeed: 64 },
];

const EDGES: readonly (readonly [TerritoryId, TerritoryId])[] = [
  ['vaelor', 'iskar'], ['vaelor', 'eiren'], ['iskar', 'nivor'], ['iskar', 'eiren'], ['iskar', 'solvik'],
  ['nivor', 'solvik'], ['eiren', 'solvik'],
  ['brannoc', 'cael'], ['brannoc', 'mirewatch'], ['cael', 'mirewatch'], ['cael', 'ordan'],
  ['mirewatch', 'ordan'], ['mirewatch', 'greyfen'], ['ordan', 'greyfen'],
  ['ardent', 'vela'], ['ardent', 'halden'], ['vela', 'crownstep'], ['vela', 'halden'], ['vela', 'lume'],
  ['crownstep', 'lume'], ['crownstep', 'bastion'], ['halden', 'lume'], ['lume', 'bastion'],
  ['sirocco', 'aven'], ['sirocco', 'emberbay'], ['aven', 'maris'], ['aven', 'emberbay'],
  ['maris', 'caldera'], ['emberbay', 'caldera'], ['maris', 'emberbay'],
  ['oris', 'tarn'], ['oris', 'khepri'], ['tarn', 'zephyr'], ['tarn', 'khepri'], ['tarn', 'redmesa'],
  ['zephyr', 'redmesa'], ['khepri', 'redmesa'],
  ['nara', 'osei'], ['nara', 'jadecrown'], ['osei', 'tidesong'], ['osei', 'jadecrown'],
  ['tidesong', 'jadecrown'],

  ['eiren', 'cael'], ['solvik', 'vela'], ['nivor', 'oris'],
  ['cael', 'ardent'], ['ordan', 'halden'], ['greyfen', 'sirocco'],
  ['halden', 'aven'], ['lume', 'maris'], ['crownstep', 'oris'], ['bastion', 'khepri'],
  ['bastion', 'nara'], ['caldera', 'nara'], ['redmesa', 'osei'], ['zephyr', 'tidesong'],
  ['brannoc', 'zephyr'],
];

const neighborMap = new Map<TerritoryId, Set<TerritoryId>>();
for (const territory of TERRITORY_SEEDS) neighborMap.set(territory.id, new Set());
for (const [left, right] of EDGES) {
  neighborMap.get(left)?.add(right);
  neighborMap.get(right)?.add(left);
}

export const TERRITORIES: readonly TerritoryDefinition[] = TERRITORY_SEEDS.map((territory) => ({
  ...territory,
  neighbors: [...(neighborMap.get(territory.id) ?? [])],
  seaNeighbors: [],
}));

export const TERRITORY_BY_ID: Readonly<Record<TerritoryId, TerritoryDefinition>> = Object.fromEntries(
  TERRITORIES.map((territory) => [territory.id, territory]),
);

export const REGION_BY_ID: Readonly<Record<RegionId, RegionDefinition>> = Object.fromEntries(
  REGIONS.map((region) => [region.id, region]),
);

export function territoriesInRegion(regionId: RegionId): TerritoryDefinition[] {
  return TERRITORIES.filter((territory) => territory.regionId === regionId);
}

export function makeTerritoryPolygon(territory: TerritoryDefinition): Point[] {
  let state = territory.shapeSeed * 2_654_435_761;
  const random = (): number => {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    return ((state ^ (state >>> 14)) >>> 0) / 4_294_967_296;
  };
  const points: Point[] = [];
  const count = 12;
  for (let index = 0; index < count; index += 1) {
    const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
    const jitter = 0.86 + random() * 0.22;
    points.push({
      x: Math.cos(angle) * territory.radiusX * jitter,
      y: Math.sin(angle) * territory.radiusY * jitter,
    });
  }
  return points;
}

export function validateMap(): string[] {
  const errors: string[] = [];
  const ids = new Set(TERRITORIES.map((territory) => territory.id));
  const regionIds = new Set(REGIONS.map((region) => region.id));

  if (ids.size !== TERRITORIES.length) errors.push('Territory IDs zijn niet uniek.');

  for (const territory of TERRITORIES) {
    if (!regionIds.has(territory.regionId)) errors.push(`${territory.name} heeft een onbekende regio.`);
    if (territory.neighbors.length === 0) errors.push(`${territory.name} heeft geen buren.`);
    for (const neighbor of territory.neighbors) {
      if (!ids.has(neighbor)) errors.push(`${territory.name} verwijst naar onbekende buur ${neighbor}.`);
      if (!TERRITORY_BY_ID[neighbor]?.neighbors.includes(territory.id)) {
        errors.push(`Verbinding ${territory.id} ↔ ${neighbor} is niet wederzijds.`);
      }
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
  if (visited.size !== TERRITORIES.length) errors.push('De kaart is niet volledig verbonden.');

  return errors;
}
