import type { TerrainType, TerritoryId } from '../types';

/** One weighted terrain inside a country's dominant-first gameplay profile. */
export interface TerrainProfileEntry {
  readonly terrain: TerrainType;
  readonly share: number;
}

export const MAX_ACTIVE_TERRAIN_TYPES = 3;

/**
 * Select the three strategic terrain types that are actually active in the
 * simulation, then redistribute their authored weights to a complete 100%.
 * Coastal terrain remains visible for countries that have it: when it falls
 * outside the three largest authored weights, it replaces the third entry.
 */
export function canonicalTerrainProfile(
  entries: readonly TerrainProfileEntry[],
): readonly TerrainProfileEntry[] {
  const firstThree = entries.slice(0, MAX_ACTIVE_TERRAIN_TYPES);
  const coastal = entries.find((entry) => entry.terrain === 'coastal');
  const active = coastal !== undefined
    && firstThree.length === MAX_ACTIVE_TERRAIN_TYPES
    && !firstThree.some((entry) => entry.terrain === 'coastal')
    ? [...firstThree.slice(0, MAX_ACTIVE_TERRAIN_TYPES - 1), coastal]
    : firstThree;
  const total = active.reduce((sum, entry) => sum + entry.share, 0);

  if (!(total > 0) || !Number.isFinite(total)) {
    return Object.freeze(active.map((entry) => Object.freeze({ ...entry })));
  }

  // Keep already complete authored profiles byte-for-byte stable. Incomplete
  // selections are closed on their last entry so their floating sum is one.
  if (Math.abs(total - 1) <= 1e-12) {
    return Object.freeze(active.map((entry) => Object.freeze({ ...entry })));
  }
  const normalized = active.map((entry) => entry.share / total);
  const correction = 1 - normalized.reduce((sum, share) => sum + share, 0);
  // A positive floating remainder goes to the dominant entry; a negative one
  // comes off the last entry. This closes the sum without inverting equal ties.
  const correctionIndex = correction >= 0 ? 0 : normalized.length - 1;
  return Object.freeze(active.map((entry, index) => Object.freeze({
    terrain: entry.terrain,
    share: normalized[index]! + (index === correctionIndex ? correction : 0),
  })));
}

/**
 * Whole percentages for labels. Largest-remainder allocation keeps the visual
 * total at exactly 100 while following the canonical simulation weights.
 */
export function terrainProfileDisplayPercentages(
  entries: readonly TerrainProfileEntry[],
): readonly number[] {
  if (entries.length === 0) return Object.freeze([]);
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.share), 0);
  if (!(total > 0) || !Number.isFinite(total)) {
    return Object.freeze(entries.map((_, index) => index === 0 ? 100 : 0));
  }
  const exact = entries.map((entry) => Math.max(0, entry.share) / total * 100);
  const percentages = exact.map(Math.floor);
  const remaining = 100 - percentages.reduce((sum, percentage) => sum + percentage, 0);
  const allocationOrder = exact
    .map((percentage, index) => ({ index, remainder: percentage - Math.floor(percentage) }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (let index = 0; index < remaining; index += 1) {
    const targetIndex = allocationOrder[index % allocationOrder.length]!.index;
    percentages[targetIndex] = percentages[targetIndex]! + 1;
  }
  return Object.freeze(percentages);
}

const profile = (
  ...entries: readonly (readonly [TerrainType, number])[]
): readonly TerrainProfileEntry[] => canonicalTerrainProfile(
  entries.map(([terrain, share]) => ({ terrain, share })),
);

/**
 * Explicit country terrain profiles for the 166 playable map identities.
 *
 * These are strategic gameplay abstractions rather than surveyed land-cover
 * percentages: plains also represents temperate lowlands and open savanna,
 * while jungle covers dense tropical forest. Small but strategically relevant
 * urban and coastal belts are retained as secondary entries. At most three
 * types are active; their relative authored weights are normalized to 100%.
 * Entries are kept dominant-first so index zero is the primary terrain.
 */
export const COUNTRY_TERRAIN_PROFILES: Readonly<Record<
  string,
  readonly TerrainProfileEntry[]
>> = Object.freeze({
  // Africa · Eastern
  bdi: profile(['mountain', 0.50], ['jungle', 0.30], ['plains', 0.20]),
  dji: profile(['desert', 0.70], ['mountain', 0.20], ['coastal', 0.10]),
  eri: profile(['desert', 0.55], ['mountain', 0.35], ['coastal', 0.10]),
  eth: profile(['mountain', 0.50], ['plains', 0.30], ['desert', 0.20]),
  ken: profile(['plains', 0.45], ['jungle', 0.25], ['mountain', 0.20], ['coastal', 0.10]),
  mdg: profile(['jungle', 0.45], ['plains', 0.30], ['mountain', 0.15], ['coastal', 0.10]),
  moz: profile(['plains', 0.40], ['jungle', 0.35], ['coastal', 0.15], ['mountain', 0.10]),
  mwi: profile(['plains', 0.45], ['mountain', 0.35], ['jungle', 0.20]),
  rwa: profile(['mountain', 0.45], ['jungle', 0.35], ['plains', 0.20]),
  sds: profile(['plains', 0.55], ['jungle', 0.25], ['desert', 0.20]),
  som: profile(['desert', 0.65], ['plains', 0.25], ['coastal', 0.10]),
  tza: profile(['plains', 0.40], ['jungle', 0.30], ['mountain', 0.20], ['coastal', 0.10]),
  uga: profile(['plains', 0.40], ['jungle', 0.35], ['mountain', 0.25]),
  zmb: profile(['plains', 0.55], ['jungle', 0.25], ['mountain', 0.20]),
  zwe: profile(['plains', 0.55], ['mountain', 0.25], ['desert', 0.20]),

  // Africa · Middle
  ago: profile(['plains', 0.40], ['jungle', 0.35], ['desert', 0.15], ['coastal', 0.10]),
  caf: profile(['jungle', 0.45], ['plains', 0.40], ['desert', 0.15]),
  cmr: profile(['jungle', 0.45], ['plains', 0.30], ['mountain', 0.15], ['coastal', 0.10]),
  cod: profile(['jungle', 0.60], ['plains', 0.25], ['mountain', 0.15]),
  cog: profile(['jungle', 0.60], ['plains', 0.30], ['coastal', 0.10]),
  gab: profile(['jungle', 0.70], ['plains', 0.20], ['coastal', 0.10]),
  gnq: profile(['jungle', 0.65], ['mountain', 0.20], ['coastal', 0.15]),
  tcd: profile(['desert', 0.60], ['plains', 0.30], ['mountain', 0.10]),

  // Africa · Northern
  dza: profile(['desert', 0.75], ['mountain', 0.15], ['coastal', 0.10]),
  egy: profile(['desert', 0.80], ['plains', 0.10], ['coastal', 0.10]),
  lby: profile(['desert', 0.85], ['plains', 0.10], ['coastal', 0.05]),
  mar: profile(['desert', 0.45], ['mountain', 0.35], ['plains', 0.10], ['coastal', 0.10]),
  sdn: profile(['desert', 0.65], ['plains', 0.30], ['coastal', 0.05]),
  tun: profile(['desert', 0.55], ['plains', 0.30], ['coastal', 0.15]),

  // Africa · Southern
  bwa: profile(['desert', 0.55], ['plains', 0.45]),
  lso: profile(['mountain', 0.85], ['plains', 0.15]),
  nam: profile(['desert', 0.70], ['plains', 0.20], ['coastal', 0.10]),
  swz: profile(['mountain', 0.50], ['plains', 0.50]),
  zaf: profile(['plains', 0.40], ['mountain', 0.25], ['desert', 0.20], ['coastal', 0.15]),

  // Africa · Western
  ben: profile(['plains', 0.50], ['jungle', 0.40], ['coastal', 0.10]),
  bfa: profile(['plains', 0.65], ['desert', 0.35]),
  civ: profile(['jungle', 0.50], ['plains', 0.40], ['coastal', 0.10]),
  gha: profile(['plains', 0.45], ['jungle', 0.40], ['coastal', 0.15]),
  gin: profile(['jungle', 0.45], ['mountain', 0.30], ['plains', 0.15], ['coastal', 0.10]),
  gmb: profile(['plains', 0.60], ['jungle', 0.25], ['coastal', 0.15]),
  gnb: profile(['jungle', 0.45], ['plains', 0.35], ['coastal', 0.20]),
  lbr: profile(['jungle', 0.65], ['plains', 0.25], ['coastal', 0.10]),
  mli: profile(['desert', 0.65], ['plains', 0.30], ['mountain', 0.05]),
  mrt: profile(['desert', 0.80], ['plains', 0.15], ['coastal', 0.05]),
  ner: profile(['desert', 0.75], ['plains', 0.20], ['mountain', 0.05]),
  nga: profile(['plains', 0.45], ['jungle', 0.35], ['desert', 0.10], ['coastal', 0.10]),
  sen: profile(['plains', 0.55], ['desert', 0.25], ['coastal', 0.20]),
  sle: profile(['jungle', 0.55], ['mountain', 0.25], ['plains', 0.10], ['coastal', 0.10]),
  tgo: profile(['plains', 0.50], ['jungle', 0.40], ['coastal', 0.10]),

  // Asia · Central
  kaz: profile(['plains', 0.55], ['desert', 0.30], ['mountain', 0.15]),
  kgz: profile(['mountain', 0.70], ['plains', 0.25], ['desert', 0.05]),
  tjk: profile(['mountain', 0.80], ['plains', 0.15], ['desert', 0.05]),
  tkm: profile(['desert', 0.70], ['plains', 0.20], ['mountain', 0.10]),
  uzb: profile(['desert', 0.50], ['plains', 0.40], ['mountain', 0.10]),

  // Asia · Eastern
  chn: profile(
    ['plains', 0.32],
    ['mountain', 0.24],
    ['desert', 0.18],
    ['jungle', 0.10],
    ['urban', 0.09],
    ['coastal', 0.07],
  ),
  jpn: profile(['mountain', 0.45], ['urban', 0.25], ['coastal', 0.20], ['plains', 0.10]),
  kor: profile(['mountain', 0.45], ['urban', 0.30], ['plains', 0.15], ['coastal', 0.10]),
  mng: profile(['plains', 0.65], ['desert', 0.25], ['mountain', 0.10]),
  prk: profile(['mountain', 0.55], ['plains', 0.30], ['coastal', 0.10], ['urban', 0.05]),
  twn: profile(['mountain', 0.55], ['urban', 0.20], ['jungle', 0.15], ['coastal', 0.10]),

  // Asia · South-Eastern
  brn: profile(['jungle', 0.65], ['coastal', 0.20], ['plains', 0.15]),
  idn: profile(['jungle', 0.55], ['mountain', 0.20], ['coastal', 0.15], ['plains', 0.10]),
  khm: profile(['plains', 0.55], ['jungle', 0.35], ['coastal', 0.10]),
  lao: profile(['mountain', 0.45], ['jungle', 0.40], ['plains', 0.15]),
  mmr: profile(['mountain', 0.35], ['jungle', 0.35], ['plains', 0.20], ['coastal', 0.10]),
  mys: profile(['jungle', 0.55], ['plains', 0.20], ['coastal', 0.15], ['urban', 0.10]),
  phl: profile(['mountain', 0.35], ['jungle', 0.30], ['coastal', 0.25], ['plains', 0.10]),
  sgp: profile(['urban', 0.70], ['coastal', 0.30]),
  tha: profile(['plains', 0.45], ['jungle', 0.30], ['mountain', 0.15], ['coastal', 0.10]),
  tls: profile(['jungle', 0.40], ['mountain', 0.35], ['plains', 0.15], ['coastal', 0.10]),
  vnm: profile(['mountain', 0.35], ['plains', 0.30], ['jungle', 0.25], ['coastal', 0.10]),

  // Asia · Southern
  afg: profile(['mountain', 0.70], ['desert', 0.20], ['plains', 0.10]),
  bgd: profile(['plains', 0.60], ['jungle', 0.20], ['coastal', 0.10], ['urban', 0.10]),
  btn: profile(['mountain', 0.80], ['jungle', 0.15], ['plains', 0.05]),
  ind: profile(['plains', 0.40], ['mountain', 0.20], ['desert', 0.15], ['jungle', 0.15], ['coastal', 0.10]),
  irn: profile(['desert', 0.45], ['mountain', 0.40], ['plains', 0.10], ['coastal', 0.05]),
  lka: profile(['plains', 0.35], ['jungle', 0.30], ['mountain', 0.20], ['coastal', 0.15]),
  npl: profile(['mountain', 0.75], ['plains', 0.15], ['jungle', 0.10]),
  pak: profile(['plains', 0.40], ['desert', 0.35], ['mountain', 0.20], ['coastal', 0.05]),

  // Asia · Western
  are: profile(['desert', 0.70], ['urban', 0.15], ['coastal', 0.15]),
  arm: profile(['mountain', 0.70], ['plains', 0.30]),
  aze: profile(['plains', 0.45], ['mountain', 0.30], ['desert', 0.25]),
  bhr: profile(['desert', 0.45], ['urban', 0.30], ['coastal', 0.25]),
  cyp: profile(['plains', 0.35], ['mountain', 0.30], ['coastal', 0.25], ['urban', 0.10]),
  geo: profile(['mountain', 0.55], ['plains', 0.35], ['coastal', 0.10]),
  irq: profile(['desert', 0.55], ['plains', 0.40], ['mountain', 0.05]),
  isr: profile(['desert', 0.45], ['plains', 0.25], ['urban', 0.20], ['coastal', 0.10]),
  jor: profile(['desert', 0.70], ['mountain', 0.20], ['plains', 0.10]),
  kwt: profile(['desert', 0.75], ['urban', 0.15], ['coastal', 0.10]),
  lbn: profile(['mountain', 0.45], ['urban', 0.20], ['plains', 0.20], ['coastal', 0.15]),
  omn: profile(['desert', 0.55], ['mountain', 0.25], ['coastal', 0.15], ['plains', 0.05]),
  psx: profile(['mountain', 0.40], ['plains', 0.30], ['urban', 0.20], ['coastal', 0.10]),
  qat: profile(['desert', 0.65], ['urban', 0.20], ['coastal', 0.15]),
  sau: profile(['desert', 0.80], ['mountain', 0.10], ['coastal', 0.05], ['urban', 0.05]),
  syr: profile(['desert', 0.45], ['plains', 0.30], ['mountain', 0.15], ['coastal', 0.10]),
  tur: profile(['mountain', 0.45], ['plains', 0.35], ['coastal', 0.10], ['urban', 0.10]),
  yem: profile(['mountain', 0.45], ['desert', 0.40], ['coastal', 0.10], ['plains', 0.05]),

  // Europe · Eastern
  bgr: profile(['plains', 0.45], ['mountain', 0.35], ['coastal', 0.10], ['urban', 0.10]),
  blr: profile(['plains', 0.80], ['urban', 0.20]),
  cze: profile(['plains', 0.50], ['mountain', 0.30], ['urban', 0.20]),
  hun: profile(['plains', 0.70], ['urban', 0.30]),
  mda: profile(['plains', 0.80], ['urban', 0.20]),
  pol: profile(['plains', 0.65], ['urban', 0.20], ['coastal', 0.10], ['mountain', 0.05]),
  rou: profile(['plains', 0.50], ['mountain', 0.30], ['urban', 0.10], ['coastal', 0.10]),
  rus: profile(
    ['plains', 0.38],
    ['arctic', 0.30],
    ['mountain', 0.15],
    ['desert', 0.07],
    ['coastal', 0.05],
    ['urban', 0.05],
  ),
  svk: profile(['mountain', 0.55], ['plains', 0.30], ['urban', 0.15]),
  ukr: profile(['plains', 0.75], ['urban', 0.15], ['coastal', 0.10]),

  // Europe · Northern
  dnk: profile(['plains', 0.50], ['coastal', 0.30], ['urban', 0.20]),
  est: profile(['plains', 0.55], ['arctic', 0.20], ['coastal', 0.15], ['urban', 0.10]),
  fin: profile(['arctic', 0.45], ['plains', 0.35], ['coastal', 0.10], ['urban', 0.10]),
  gbr: profile(['plains', 0.45], ['urban', 0.25], ['coastal', 0.20], ['mountain', 0.10]),
  irl: profile(['plains', 0.65], ['coastal', 0.20], ['mountain', 0.10], ['urban', 0.05]),
  isl: profile(['arctic', 0.55], ['mountain', 0.30], ['coastal', 0.15]),
  ltu: profile(['plains', 0.65], ['urban', 0.15], ['arctic', 0.10], ['coastal', 0.10]),
  lva: profile(['plains', 0.60], ['arctic', 0.15], ['coastal', 0.15], ['urban', 0.10]),
  nor: profile(['mountain', 0.40], ['arctic', 0.35], ['coastal', 0.20], ['urban', 0.05]),
  swe: profile(['arctic', 0.40], ['plains', 0.35], ['coastal', 0.10], ['mountain', 0.10], ['urban', 0.05]),

  // Europe · Southern
  alb: profile(['mountain', 0.55], ['plains', 0.25], ['coastal', 0.15], ['urban', 0.05]),
  bih: profile(['mountain', 0.60], ['plains', 0.30], ['urban', 0.10]),
  esp: profile(['plains', 0.40], ['mountain', 0.30], ['desert', 0.15], ['coastal', 0.10], ['urban', 0.05]),
  grc: profile(['mountain', 0.45], ['coastal', 0.25], ['plains', 0.20], ['urban', 0.10]),
  hrv: profile(['mountain', 0.40], ['coastal', 0.25], ['plains', 0.25], ['urban', 0.10]),
  ita: profile(['mountain', 0.35], ['plains', 0.30], ['urban', 0.20], ['coastal', 0.15]),
  kos: profile(['mountain', 0.55], ['plains', 0.30], ['urban', 0.15]),
  mkd: profile(['mountain', 0.50], ['plains', 0.35], ['urban', 0.15]),
  mne: profile(['mountain', 0.60], ['coastal', 0.20], ['plains', 0.15], ['urban', 0.05]),
  prt: profile(['plains', 0.45], ['coastal', 0.25], ['mountain', 0.20], ['urban', 0.10]),
  srb: profile(['plains', 0.45], ['mountain', 0.40], ['urban', 0.15]),
  svn: profile(['mountain', 0.45], ['plains', 0.35], ['urban', 0.10], ['coastal', 0.10]),

  // Europe · Western
  aut: profile(['mountain', 0.65], ['plains', 0.20], ['urban', 0.15]),
  bel: profile(['plains', 0.45], ['urban', 0.40], ['coastal', 0.15]),
  che: profile(['mountain', 0.70], ['plains', 0.15], ['urban', 0.15]),
  deu: profile(['plains', 0.45], ['urban', 0.30], ['mountain', 0.15], ['coastal', 0.10]),
  fra: profile(
    ['plains', 0.40],
    ['mountain', 0.20],
    ['urban', 0.15],
    ['coastal', 0.15],
    ['jungle', 0.05],
    ['desert', 0.05],
  ),
  lux: profile(['plains', 0.55], ['urban', 0.30], ['mountain', 0.15]),
  nld: profile(['plains', 0.45], ['urban', 0.35], ['coastal', 0.20]),

  // North America · Caribbean
  cub: profile(['plains', 0.45], ['jungle', 0.25], ['coastal', 0.20], ['mountain', 0.10]),
  dom: profile(['mountain', 0.40], ['jungle', 0.30], ['plains', 0.20], ['coastal', 0.10]),
  hti: profile(['mountain', 0.50], ['jungle', 0.25], ['plains', 0.15], ['coastal', 0.10]),
  jam: profile(['mountain', 0.40], ['jungle', 0.30], ['coastal', 0.20], ['plains', 0.10]),

  // North America · Central
  blz: profile(['jungle', 0.55], ['plains', 0.25], ['coastal', 0.20]),
  cri: profile(['mountain', 0.40], ['jungle', 0.35], ['coastal', 0.15], ['plains', 0.10]),
  gtm: profile(['mountain', 0.45], ['jungle', 0.30], ['plains', 0.15], ['coastal', 0.10]),
  hnd: profile(['mountain', 0.45], ['jungle', 0.30], ['plains', 0.15], ['coastal', 0.10]),
  mex: profile(['desert', 0.35], ['mountain', 0.30], ['plains', 0.20], ['coastal', 0.10], ['urban', 0.05]),
  nic: profile(['jungle', 0.40], ['mountain', 0.30], ['plains', 0.20], ['coastal', 0.10]),
  pan: profile(['jungle', 0.55], ['mountain', 0.20], ['coastal', 0.15], ['plains', 0.10]),
  slv: profile(['mountain', 0.45], ['plains', 0.25], ['jungle', 0.20], ['coastal', 0.10]),

  // North America · Northern
  can: profile(['arctic', 0.45], ['plains', 0.30], ['mountain', 0.15], ['coastal', 0.05], ['urban', 0.05]),
  grl: profile(['arctic', 0.80], ['mountain', 0.15], ['coastal', 0.05]),
  usa: profile(
    ['plains', 0.40],
    ['mountain', 0.20],
    ['desert', 0.15],
    ['urban', 0.10],
    ['coastal', 0.10],
    ['arctic', 0.05],
  ),

  // Oceania
  aus: profile(['desert', 0.55], ['plains', 0.25], ['coastal', 0.10], ['jungle', 0.05], ['mountain', 0.05]),
  nzl: profile(['mountain', 0.45], ['plains', 0.30], ['coastal', 0.15], ['jungle', 0.10]),
  png: profile(['jungle', 0.55], ['mountain', 0.30], ['coastal', 0.10], ['plains', 0.05]),

  // South America
  arg: profile(['plains', 0.50], ['desert', 0.20], ['mountain', 0.15], ['coastal', 0.10], ['urban', 0.05]),
  bol: profile(['mountain', 0.45], ['plains', 0.30], ['jungle', 0.15], ['desert', 0.10]),
  bra: profile(['jungle', 0.45], ['plains', 0.30], ['coastal', 0.10], ['urban', 0.10], ['mountain', 0.05]),
  chl: profile(['mountain', 0.45], ['desert', 0.25], ['coastal', 0.20], ['plains', 0.10]),
  col: profile(['mountain', 0.40], ['jungle', 0.30], ['plains', 0.20], ['coastal', 0.10]),
  ecu: profile(['mountain', 0.45], ['jungle', 0.30], ['coastal', 0.15], ['plains', 0.10]),
  guy: profile(['jungle', 0.70], ['plains', 0.20], ['coastal', 0.10]),
  per: profile(['mountain', 0.45], ['desert', 0.25], ['jungle', 0.20], ['coastal', 0.10]),
  pry: profile(['plains', 0.65], ['jungle', 0.20], ['desert', 0.15]),
  sur: profile(['jungle', 0.75], ['plains', 0.15], ['coastal', 0.10]),
  ury: profile(['plains', 0.70], ['coastal', 0.15], ['urban', 0.15]),
  ven: profile(['plains', 0.40], ['jungle', 0.30], ['mountain', 0.20], ['coastal', 0.10]),
});

/**
 * All playable states without access to the global ocean network. Caspian-only
 * Azerbaijan, Kazakhstan and Turkmenistan intentionally count as landlocked.
 */
export const LANDLOCKED_COUNTRY_IDS: ReadonlySet<TerritoryId> = new Set<TerritoryId>([
  'afg', 'arm', 'aut', 'aze', 'blr', 'btn', 'bol', 'bwa', 'bfa', 'bdi', 'caf', 'tcd', 'cze', 'swz',
  'eth', 'hun', 'kaz', 'kos', 'kgz', 'lao', 'lso', 'lux', 'mwi', 'mli', 'mda', 'mng', 'npl', 'ner',
  'mkd', 'pry', 'rwa', 'srb', 'svk', 'sds', 'che', 'tjk', 'tkm', 'uga', 'uzb', 'zmb', 'zwe',
]);
