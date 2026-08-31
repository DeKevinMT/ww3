import {
  COUNTRIES,
  TERRITORIES,
  colorToCss,
  countryDistanceKm,
  countrySeaRouteDistanceKm,
  countryColor,
  terrainForTerritory,
  terrainProfileForTerritory,
  type TerrainProfileEntry,
} from '../../game/data/worldMap';
import rawDeathRateData from '../../assets/wb_death_rate.json?raw';
import rawTaxRevenueData from '../../assets/imf_tax_revenue.json?raw';
import {
  ARMY_CAPACITY_INITIAL_FORCE_FLOOR,
  ARMY_CAPACITY_STRUCTURAL_POPULATION_SHARE,
  NATIONAL_COMBAT_GDP_PER_CAPITA_CEILING,
  NATIONAL_COMBAT_GDP_PER_CAPITA_FLOOR,
  NATIONAL_COMBAT_SYSTEM_QUALITY_SPAN,
  NATIONAL_IQ_GDP_PER_CAPITA_CEILING,
  NATIONAL_IQ_GDP_PER_CAPITA_FLOOR,
  NATIONAL_IQ_INSTITUTIONAL_CAPACITY_CEILING,
  NATIONAL_IQ_INSTITUTIONAL_CAPACITY_FLOOR,
  NATIONAL_IQ_PROXY_GDP_WEIGHT,
  NATIONAL_IQ_PROXY_INSTITUTION_WEIGHT,
  NATIONAL_IQ_EFFECTIVE_SCORE_MAX,
  NATIONAL_IQ_SCORE_MAX,
  NATIONAL_IQ_SCORE_MIN,
  NATIONAL_QUALITY_COMBAT_SPAN,
  NATIONAL_QUALITY_GDP_WEIGHT,
  NATIONAL_QUALITY_IQ_WEIGHT,
  TERRAIN_DEFENSE_MODIFIER,
  TERRAIN_ECONOMY_GROWTH_ADJUSTMENT,
  TERRAIN_FOOD_PRODUCTION_MODIFIER,
  TERRAIN_OPERATION_COST_MODIFIER,
  TERRAIN_SUPPLY_MODIFIER,
  V2_CONTENT_VERSION,
  clamp,
  round,
} from './balance';
import {
  nationIdV2,
  territoryIdV2,
  type AntarcticSectorIdV2,
  type PlayerId,
  type TerrainType,
  type TerritoryId,
} from './types';

export interface NationRealDataV2 {
  population: number;
  populationGrowthRate: number;
  /** Latest World Bank crude deaths per 1,000 people per year. */
  deathRatePerThousand: number;
  /** Share of people initially exposed to acute/chronic food insecurity. */
  foodInsecurityRate: number;
  /** Calorie-weighted domestic food self-sufficiency; 1 means 100% of availability. */
  foodSelfSufficiencyRatio: number;
  /** Approximate polygon land area in square kilometres. */
  landArea: number;
  gdp: number;
  /** Historical IMF tax/GDP reference metadata; never used as simulation income. */
  taxRevenueShare: number;
  /** Exact IMF observation; null means an official-data peer median is used. */
  observedTaxRevenueShare: number | null;
  taxRevenueYear: number | null;
  taxRevenueSource: 'IMF_WORLD_G11_POGDP_PT_R' | 'sovereign-proxy' | 'subregion-median' | 'continent-median' | 'global-median';
  taxRevenueImputed: boolean;
  taxRevenueSector: string | null;
  taxRevenueAccountingBasis: string | null;
  defenceSpending: number;
  powerIndex: number;
  researchCapacity: number;
}

export interface NationBalanceDataV2 {
  initialManpower: number;
}

/** Static identity class. Missing means an ordinary human-world nation for fixture compatibility. */
export type NationKindV2 = 'humanity' | 'rogue-ai';

/** Authored Antarctic depth; ordinary territories omit this field. */
export type TerritoryKindV2 = 'sovereign' | 'rogue-perimeter' | 'rogue-outer' | 'rogue-inner' | 'rogue-core';

export interface NationContentV2 {
  id: PlayerId;
  kind?: NationKindV2;
  iso3: string;
  initialCapitalId: TerritoryId;
  name: string;
  shortName: string;
  color: number;
  cssColor: string;
  darkColor: string;
  sigil: string;
  profile: string;
  influenceTags: readonly string[];
  /** Bounded gameplay proxy, not a scientific real-world psychometric claim. */
  iqScore: number;
  militaryQuality: number;
  /** Data-calibrated baseline ATK before research. */
  militaryAttackRating?: number;
  /** Data-calibrated baseline DEF before research. */
  militaryDefenseRating?: number;
  /** 2026 strategic-deterrence tier; this is a power modifier, never a strike action. */
  nuclearPowerLevel: number;
  ambition: number;
  continent: string;
  subregion: string;
  real: NationRealDataV2;
  balance: NationBalanceDataV2;
}

export interface TerritoryConnectionV2 {
  targetId: TerritoryId;
  kind: 'land' | 'sea';
  /** Great-circle distance between national map anchors; chiefly used by naval logistics. */
  distanceKm?: number;
}

export interface TerritoryContentV2 {
  id: TerritoryId;
  kind?: TerritoryKindV2;
  /**
   * Population-equivalent local military infrastructure. Fictional machine
   * sectors may use this instead of their civilian population to distribute
   * Army Capacity without changing the country's total calibrated force.
   */
  armyCapacityWeight?: number;
  initialOwnerId: PlayerId;
  name: string;
  regionId: string;
  /** Dominant terrain, retained for save/custom-world compatibility. */
  terrain: TerrainType;
  /** Weighted dominant-first mix. Omitted custom fixtures behave as 100% `terrain`. */
  terrainProfile?: readonly TerrainProfileEntry[];
  baseline: NationRealDataV2;
  connections: readonly TerritoryConnectionV2[];
}

const SINGLE_TERRAIN_PROFILES_V2: Readonly<Record<TerrainType, readonly TerrainProfileEntry[]>>
  = Object.freeze(Object.fromEntries(([
    'plains', 'urban', 'mountain', 'desert', 'jungle', 'arctic', 'coastal',
  ] as const).map((terrain) => [
    terrain,
    Object.freeze([Object.freeze({ terrain, share: 1 })]),
  ])) as Record<TerrainType, readonly TerrainProfileEntry[]>);

/** Canonical profile accessor shared by combat, traits and presentation. */
export function territoryTerrainProfileV2(
  content: WorldContentV2,
  territoryId: TerritoryId,
): readonly TerrainProfileEntry[] {
  const definition = content.territories[territoryId];
  if (!definition) return SINGLE_TERRAIN_PROFILES_V2.plains;
  return definition.terrainProfile ?? SINGLE_TERRAIN_PROFILES_V2[definition.terrain];
}

export function territoryTerrainTypesV2(
  content: WorldContentV2,
  territoryId: TerritoryId,
): readonly TerrainType[] {
  return territoryTerrainProfileV2(content, territoryId).map((entry) => entry.terrain);
}

/** Share-weighted physical defender modifier; every listed terrain matters. */
export function territoryTerrainDefenseMultiplierV2(
  content: WorldContentV2,
  territoryId: TerritoryId,
): number {
  return territoryTerrainProfileV2(content, territoryId).reduce((sum, entry) => (
    sum + TERRAIN_DEFENSE_MODIFIER[entry.terrain] * entry.share
  ), 0);
}

export interface TerritoryTerrainEffectsV2 {
  readonly defense: number;
  readonly supply: number;
  readonly operationCost: number;
  readonly foodProduction: number;
  /** Signed annual percentage-point adjustment, e.g. 0.002 means +0.2pp/year. */
  readonly annualEconomyGrowthAdjustment: number;
}

/** Every existing terrain channel uses the exact same immutable weighted mix. */
export function territoryTerrainEffectsV2(
  content: WorldContentV2,
  territoryId: TerritoryId,
): TerritoryTerrainEffectsV2 {
  const profile = territoryTerrainProfileV2(content, territoryId);
  const weighted = (table: Readonly<Record<TerrainType, number>>): number => (
    profile.reduce((sum, entry) => sum + table[entry.terrain] * entry.share, 0)
  );
  return {
    defense: weighted(TERRAIN_DEFENSE_MODIFIER),
    supply: weighted(TERRAIN_SUPPLY_MODIFIER),
    operationCost: weighted(TERRAIN_OPERATION_COST_MODIFIER),
    foodProduction: weighted(TERRAIN_FOOD_PRODUCTION_MODIFIER),
    annualEconomyGrowthAdjustment: weighted(TERRAIN_ECONOMY_GROWTH_ADJUSTMENT),
  };
}

export const territoryTerrainSupplyMultiplierV2 = (
  content: WorldContentV2,
  territoryId: TerritoryId,
): number => territoryTerrainEffectsV2(content, territoryId).supply;

export const territoryTerrainOperationCostMultiplierV2 = (
  content: WorldContentV2,
  territoryId: TerritoryId,
): number => territoryTerrainEffectsV2(content, territoryId).operationCost;

export const territoryTerrainFoodProductionMultiplierV2 = (
  content: WorldContentV2,
  territoryId: TerritoryId,
): number => territoryTerrainEffectsV2(content, territoryId).foodProduction;

export const territoryTerrainEconomyGrowthAdjustmentV2 = (
  content: WorldContentV2,
  territoryId: TerritoryId,
): number => territoryTerrainEffectsV2(content, territoryId).annualEconomyGrowthAdjustment;

export type ScenarioIdV2 = 'standard-2026' | 'random-world' | 'survival';
export type OpeningProfileV2 = 'standard-2026' | 'none';
export type GeopoliticsProfileV2 = 'standard-2026' | 'neutral';
export type ReserveProfileV2 = 'reported-2026' | 'generated';

/** Immutable campaign identity and policy; Random World saves rebuild from this identity. */
export interface WorldScenarioMetadataV2 {
  scenarioId: ScenarioIdV2;
  scenarioVersion: number;
  contentVersion: string;
  generatedFromSeed?: number;
  startYear: number;
  openingProfile: OpeningProfileV2;
  geopoliticsProfile: GeopoliticsProfileV2;
  reserveProfile: ReserveProfileV2;
}

export interface WorldContentV2 {
  /** Optional only for small test/custom worlds outside the scenario resolver. */
  metadata?: Readonly<WorldScenarioMetadataV2>;
  nationIds: readonly PlayerId[];
  territoryIds: readonly TerritoryId[];
  nations: Readonly<Record<PlayerId, NationContentV2>>;
  territories: Readonly<Record<TerritoryId, TerritoryContentV2>>;
}

/** SIPRI 2026 nuclear-armed states, grouped into broad game-power tiers. */
const NUCLEAR_POWER_LEVELS: Readonly<Record<string, number>> = {
  usa: 3, rus: 3,
  chn: 2, fra: 2, gbr: 2,
  ind: 1, pak: 1, prk: 1, isr: 1,
};

interface WorldBankDeathRateRow {
  countryiso3code?: string;
  date?: string;
  value?: number | null;
}

interface ImfTaxRevenueRecord {
  value?: number;
  year?: number | null;
  sector?: string | null;
  accountingBasis?: string | null;
  fallback?: {
    level?: 'subregion' | 'continent' | 'global';
    group?: string;
    peerCount?: number;
  };
}

interface ImfTaxRevenueAsset {
  countries?: Record<string, ImfTaxRevenueRecord>;
}

function latestDeathRates(): Map<string, number> {
  const parsed = JSON.parse(rawDeathRateData) as [unknown, WorldBankDeathRateRow[]];
  const rates = new Map<string, number>();
  for (const row of parsed[1] ?? []) {
    if (!row.countryiso3code || row.value == null || rates.has(row.countryiso3code)) continue;
    rates.set(row.countryiso3code, Number(row.value));
  }
  return rates;
}

const WORLD_BANK_DEATH_RATES = latestDeathRates();

const IMF_TAX_REVENUE = (() => {
  const parsed = JSON.parse(rawTaxRevenueData) as ImfTaxRevenueAsset;
  return new Map(Object.entries(parsed.countries ?? {}).flatMap(([iso3, observation]) => (
    Number.isFinite(observation.value)
      ? [[iso3, observation] as const]
      : []
  )));
})();

// IMF WoRLD has no separate observation for Greenland. Use the observed Danish
// sovereign baseline as reference metadata while keeping Greenland's identity,
// population, economy and military data entirely separate.
const IMF_TAX_REVENUE_PROXY_ISO3: Readonly<Record<string, string>> = {
  GRL: 'DNK',
};

function fiscalBaseline(country: (typeof COUNTRIES)[number]): Pick<NationRealDataV2,
  'taxRevenueShare' | 'observedTaxRevenueShare' | 'taxRevenueYear' | 'taxRevenueSource'
  | 'taxRevenueImputed' | 'taxRevenueSector' | 'taxRevenueAccountingBasis'> {
  const proxyIso3 = IMF_TAX_REVENUE_PROXY_ISO3[country.iso3];
  const record = IMF_TAX_REVENUE.get(proxyIso3 ?? country.iso3);
  if (!record || !Number.isFinite(record.value)) {
    throw new Error(`Missing IMF tax-revenue baseline for playable country ${country.iso3}.`);
  }
  const rate = Math.max(0.01, Math.min(0.50, Number(record.value) / 100));
  const imputed = Boolean(record.fallback);
  const fallbackSource = record.fallback?.level === 'subregion' ? 'subregion-median'
    : record.fallback?.level === 'continent' ? 'continent-median' : 'global-median';
  return {
    taxRevenueShare: rate,
    observedTaxRevenueShare: imputed ? null : rate,
    taxRevenueYear: Number.isInteger(record.year) ? Number(record.year) : null,
    taxRevenueSource: proxyIso3 ? 'sovereign-proxy'
      : imputed ? fallbackSource : 'IMF_WORLD_G11_POGDP_PT_R',
    taxRevenueImputed: imputed,
    taxRevenueSector: record.sector ?? null,
    taxRevenueAccountingBasis: record.accountingBasis ?? null,
  };
}

/**
 * Gameplay keeps the real-world ordering while halving extreme differences:
 * every source rate moves exactly halfway toward a neutral 1% annual growth.
 * This runs once while immutable world content is created, never per tick.
 */
export function balancedPopulationGrowthRateV2(sourceRatePercent: number): number {
  return Math.round((1 + 0.5 * (sourceRatePercent - 1)) * 1_000_000) / 1_000_000;
}

// SIPRI 2025 military expenditure (USD billions), published April 2026.
// The source dataset remains the fallback for every country outside the latest
// published top 15. Keeping this calibration here makes one current baseline
// feed manpower, quality, upkeep, previews and the military-power ranking.
const SIPRI_2025_DEFENCE_SPENDING: Readonly<Record<string, number>> = {
  usa: 954,
  chn: 336,
  rus: 190,
  deu: 114,
  ind: 92.1,
  gbr: 89,
  ukr: 84.1,
  sau: 83.2,
  fra: 68,
  jpn: 62.2,
  isr: 48.3,
  ita: 48.1,
  kor: 47.8,
  pol: 46.8,
  esp: 40.2,
};

/**
 * 2026 conventional-strength order. The game uses this only as an immutable
 * opening calibration: the live ranking remains a pure calculation from the
 * armies that actually exist in the simulation.
 */
const PUBLISHED_MILITARY_ORDER_2026_V2: readonly string[] = Object.freeze([
  'usa', 'chn', 'rus', 'ind', 'kor', 'fra', 'jpn', 'gbr', 'tur', 'ita',
  'bra', 'deu', 'idn', 'pak', 'isr', 'irn', 'aus', 'esp', 'egy', 'ukr',
  'pol', 'twn', 'vnm', 'tha', 'sau', 'swe', 'dza', 'can', 'sgp', 'grc',
  'prk', 'arg', 'nga', 'nld', 'mmr', 'mex', 'bgd', 'prt', 'nor', 'zaf',
  'phl', 'mys', 'col', 'irq', 'dnk', 'che', 'eth', 'fin', 'chl', 'per',
  'ven', 'rou', 'uzb', 'are', 'cze', 'mar', 'hun', 'kaz', 'ago', 'aze',
  'bel', 'bgr', 'srb', 'cod', 'cub', 'sdn', 'aut', 'lka', 'svk', 'blr',
  'qat', 'ecu', 'hrv', 'jor', 'bhr', 'kwt', 'alb', 'tkm', 'tun', 'lby',
  'pry', 'bol', 'khm', 'ken', 'tcd', 'omn', 'syr', 'ltu', 'tza', 'nzl',
  'svn', 'moz', 'mng', 'irl', 'geo', 'gtm', 'ury', 'yem', 'cmr', 'tjk',
  'arm', 'lva', 'hnd', 'mli', 'zwe', 'est', 'uga', 'civ', 'kgz', 'lux',
  'zmb', 'gha', 'sds', 'mkd', 'dom', 'nic', 'cog', 'lbn', 'eri', 'ner',
  'afg', 'nam', 'mrt', 'npl', 'lao', 'sen', 'bfa', 'mne', 'slv', 'bwa',
  'mdg', 'gab', 'bih', 'isl', 'pan', 'mda', 'som', 'ben', 'kos', 'sle',
  'lbr', 'sur', 'caf', 'blz', 'btn',
]);

const publishedMilitaryRank2026V2 = new Map(
  PUBLISHED_MILITARY_ORDER_2026_V2.map((countryId, index) => [countryId, index + 1]),
);

const publishedMilitaryIds2026V2 = new Set(PUBLISHED_MILITARY_ORDER_2026_V2);
const playableMilitaryIds2026V2 = new Set(COUNTRIES.map((country) => country.id));

/**
 * Complete strength order used by the human country-trait curve. Countries
 * outside the 145-state reference remain playable and follow below it using
 * their existing strategic data; Greenland therefore remains in the true
 * underdog tail instead of receiving an arbitrary major-country modifier.
 */
export const OPENING_MILITARY_ORDER_2026_V2: readonly PlayerId[] = Object.freeze([
  ...PUBLISHED_MILITARY_ORDER_2026_V2.filter((countryId) => (
    playableMilitaryIds2026V2.has(countryId)
  )),
  ...COUNTRIES
    .filter((country) => !publishedMilitaryIds2026V2.has(country.id))
    .sort((a, b) => b.powerIndex - a.powerIndex || a.id.localeCompare(b.id))
    .map((country) => country.id),
] as unknown as readonly PlayerId[]);

/** Suriname remains a weak Atlantic stepping stone in both force volume and capacity. */
export const SURINAME_OPENING_FORCE_MULTIPLIER_V2 = 0.80;

/** Small Standard-opening roster adjustments shared by AI and human seats. */
export function normalOpeningManpowerMultiplierV2(countryId: string): number {
  return countryId === 'sur' ? SURINAME_OPENING_FORCE_MULTIPLIER_V2 : 1;
}

export interface NormalOpeningForceQuoteV2 {
  readonly multiplier: number;
  readonly authoredInitialManpower: number;
  readonly authoredOpeningCapacity: number;
  readonly initialManpower: number;
  readonly openingCapacity: number;
}

/**
 * Applies one country balance factor after both neutral force quotes exist.
 * In particular, a structural population floor cannot silently restore the
 * capacity removed from a deliberately lighter opening army.
 */
export function normalOpeningForceQuoteV2(
  countryId: string,
  authoredInitialManpower: number,
  population: number,
): NormalOpeningForceQuoteV2 {
  const multiplier = normalOpeningManpowerMultiplierV2(countryId);
  const authoredOpeningCapacity = Math.max(
    0.0001,
    population * ARMY_CAPACITY_STRUCTURAL_POPULATION_SHARE,
    authoredInitialManpower * ARMY_CAPACITY_INITIAL_FORCE_FLOOR,
  );
  return {
    multiplier,
    authoredInitialManpower,
    authoredOpeningCapacity,
    initialManpower: round(Math.max(0.0001, authoredInitialManpower * multiplier), 9),
    openingCapacity: Math.max(0.0001, authoredOpeningCapacity * multiplier),
  };
}

/**
 * Combat-deployable force calibration in millions. Russia is deliberately
 * represented at its broader 2026 wartime establishment (1.50M), above
 * the US active-force abstraction (1.30M); the ratings layer separately gives
 * the US much more capability per soldier. Small zero-force states retain a
 * tiny playable simulation force.
 */
const ACTIVE_MILITARY_MANPOWER_2026_V2: Readonly<Record<string, number>> = Object.freeze({
  chn: 2.035, ind: 1.431, rus: 1.50, usa: 1.30, prk: 1.32,
  ukr: 0.9, pak: 0.66, irn: 0.61, eth: 0.503, tur: 0.481,
  kor: 0.45, vnm: 0.45, egy: 0.4385, col: 0.429, idn: 0.4045,
  mar: 0.4, mex: 0.387, bra: 0.376, tha: 0.36085, eri: 0.35,
  lka: 0.346, sdn: 0.3, fra: 0.264, jpn: 0.2515, pol: 0.25,
  sau: 0.247, twn: 0.23, nga: 0.23, mmr: 0.228, bgd: 0.204,
  irq: 0.193, sds: 0.185, deu: 0.184324, isr: 0.1695, cod: 0.16658,
  ita: 0.1655, phl: 0.16, tjk: 0.15, che: 0.147178, grc: 0.1427,
  gbr: 0.14133, dza: 0.13, aze: 0.128, khm: 0.1243, esp: 0.121802,
  uzb: 0.12, per: 0.12, jor: 0.1145, mys: 0.113, kaz: 0.11,
  ven: 0.109, arg: 0.108, ago: 0.107, gtm: 0.106114, syr: 0.1,
  omn: 0.1, lao: 0.1, npl: 0.0985, rou: 0.09, tun: 0.0898,
  dom: 0.089, lbn: 0.08, chl: 0.08, kwt: 0.078, afg: 0.075,
  zaf: 0.068731, arm: 0.065, are: 0.065, can: 0.0635, blr: 0.063,
  aus: 0.05891, hnd: 0.052225, sgp: 0.051, ken: 0.05, cub: 0.05,
  uga: 0.045, nic: 0.045, nld: 0.044245, hun: 0.0416, ecu: 0.04125,
  mli: 0.04, bol: 0.04, cmr: 0.038, tcd: 0.03775, geo: 0.037,
  bgr: 0.03695, tkm: 0.0365, mng: 0.035, nor: 0.03344, yem: 0.03335,
  lby: 0.032, mrt: 0.03154, cze: 0.030334, som: 0.03, caf: 0.03,
  zwe: 0.029, qat: 0.02655, bel: 0.02639, swe: 0.0256, slv: 0.025,
  prt: 0.025, aut: 0.025, ner: 0.025, tza: 0.025, fin: 0.024,
  ury: 0.024, ltu: 0.023, kgz: 0.023, srb: 0.0225, civ: 0.022,
  dnk: 0.021, svk: 0.020982, bhr: 0.0184, bih: 0.018, lva: 0.01787,
  nam: 0.017567, sen: 0.017, pan: 0.0163, btn: 0.016, pry: 0.01565,
  gha: 0.0155, zmb: 0.01515, hrv: 0.014325, mdg: 0.0135, sle: 0.013,
  bwa: 0.012, moz: 0.0112, nzl: 0.01005, mkd: 0.01001, cog: 0.01,
  est: 0.0077, irl: 0.007557, bfa: 0.0075, alb: 0.0075, svn: 0.007,
  mda: 0.0065, gab: 0.005, ben: 0.00475, kos: 0.004, sur: 0.0025,
  mne: 0.00235, lbr: 0.0021, blz: 0.002, lux: 0.0012, isl: 0.0005,
  // Playable Greenland represents a small permanent Arctic defence cadre.
  // This is ordinary Standard 2026 manpower for AI and human starts alike;
  // the separate human-only opening multiplier is applied later.
  grl: 0.0003,
});

/**
 * Recent real-world military posture, expressed as a neutral activity/expansion
 * prior rather than a moral judgement. Live declarations, occupations and
 * exhaustion move the displayed value after the 2026 start.
 */
export const RECENT_MILITARY_POSTURE_2026_V2: Readonly<Record<string, number>> = Object.freeze({
  rus: 0.96, isr: 0.92, mmr: 0.88, sdn: 0.86, irn: 0.82,
  prk: 0.80, tur: 0.76, usa: 0.72, aze: 0.72, syr: 0.70,
  sau: 0.68, are: 0.65, eth: 0.64, pak: 0.62, blr: 0.61,
  chn: 0.58, ind: 0.54, ukr: 0.52, arm: 0.50, irq: 0.50,
});

function recentMilitaryPosture2026V2(countryId: string, militaryBurden: number): number {
  return RECENT_MILITARY_POSTURE_2026_V2[countryId]
    ?? round(clamp(0.24 + 4.5 * Math.max(0, militaryBurden), 0.22, 0.58), 6);
}

// Soft diplomatic affinity only. These tags never invoke automatic defence;
// they make threatened AI countries more willing to build a coalition together.
const NATO_MEMBERS = new Set([
  'ALB', 'BEL', 'BGR', 'CAN', 'HRV', 'CZE', 'DNK', 'EST', 'FIN', 'FRA', 'DEU', 'GRC', 'HUN', 'ISL',
  'ITA', 'LVA', 'LTU', 'LUX', 'MNE', 'NLD', 'MKD', 'NOR', 'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP',
  'SWE', 'TUR', 'GBR', 'USA',
]);
const EU_MEMBERS = new Set([
  'AUT', 'BEL', 'BGR', 'HRV', 'CYP', 'CZE', 'DNK', 'EST', 'FIN', 'FRA', 'DEU', 'GRC', 'HUN', 'IRL',
  'ITA', 'LVA', 'LTU', 'LUX', 'MLT', 'NLD', 'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP', 'SWE',
]);
const BRICS_MEMBERS = new Set(['BRA', 'RUS', 'IND', 'CHN', 'ZAF', 'SAU', 'EGY', 'ARE', 'ETH', 'IDN', 'IRN']);

function realWorldAlignmentTags(iso3: string): string[] {
  return [
    NATO_MEMBERS.has(iso3) ? 'bloc:nato' : undefined,
    EU_MEMBERS.has(iso3) ? 'bloc:eu' : undefined,
    BRICS_MEMBERS.has(iso3) ? 'bloc:brics' : undefined,
  ].filter((tag): tag is string => Boolean(tag));
}

function calibratedMilitaryPowerIndex(
  countryId: string,
  population: number,
  gdp: number,
  defenceSpending: number,
): number {
  const publishedRank = publishedMilitaryRank2026V2.get(countryId);
  if (publishedRank !== undefined) {
    // Rank is ordinal, not a percentage of the leader's strength. A curved
    // conversion keeps the published order but restores the much larger real
    // gap between global superpowers, regional powers and the long tail.
    const publishedPower = 100 / (1 + 0.14 * (publishedRank - 1)) ** 1.35;
    // Iceland is an elite but deliberately lighter Atlantic bridge in the
    // Greenland progression route. Scaling calibrated power (rather than raw
    // manpower) keeps its high ATK/DEF identity while lowering total strength.
    const campaignBalance = countryId === 'isl' ? 0.80 : 1;
    return round(publishedPower * campaignBalance, 9);
  }
  const spendingScore = Math.log10(defenceSpending + 1) / Math.log10(955);
  const economyScore = Math.log10(gdp + 1) / Math.log10(31_000);
  const populationScore = Math.log10(population + 1) / Math.log10(1_500);
  const fallbackStrength = 100
    * (0.62 * spendingScore + 0.23 * economyScore + 0.15 * populationScore);
  // Unranked dependencies remain below the published field while their own
  // economy, population and military spending still order them consistently.
  return round(clamp(0.25 + 0.0065 * fallbackStrength, 0.25, 0.90), 9);
}

function normalizedLogRangeV2(value: number, floor: number, ceiling: number): number {
  const safeFloor = Math.max(0.000001, floor);
  const safeCeiling = Math.max(safeFloor + 0.000001, ceiling);
  return clamp(
    Math.log(Math.max(safeFloor, value) / safeFloor)
      / Math.log(safeCeiling / safeFloor),
    0,
    1,
  );
}

/**
 * IQ-like gameplay baselines for countries with a strong, recognisable signal
 * in international learning assessments. These are deliberately rounded game
 * values, not claims about innate intelligence or a psychometric census.
 *
 * The explicit values stop raw income from automatically making the richest
 * country the smartest. Countries without an explicit value use the regional
 * fallback below plus a small institutions/income adjustment.
 */
const NATIONAL_IQ_COUNTRY_BASELINES_V2: Readonly<Record<string, number>> = Object.freeze({
  // East-Asian education systems are the clear opening leaders.
  sgp: 106.5,
  twn: 105.8,
  jpn: 105.4,
  kor: 105.1,
  chn: 103.5,
  mng: 97.4,
  prk: 91.0,

  // High-performing European and Anglosphere systems.
  est: 102.2,
  fin: 101.6,
  irl: 101.3,
  can: 101.1,
  che: 100.9,
  nld: 100.8,
  pol: 100.7,
  gbr: 100.4,
  deu: 100.3,
  swe: 100.2,
  dnk: 100.1,
  cze: 100.0,
  aus: 99.9,
  bel: 99.8,
  nor: 99.8,
  nzl: 99.7,
  svn: 99.6,
  lva: 99.5,
  ltu: 99.5,
  aut: 99.4,
  fra: 99.3,
  usa: 99.1,
  ita: 98.9,
  esp: 98.8,
  prt: 98.4,
  isl: 98.4,

  // Strong country-level exceptions to broad regional fallbacks.
  vnm: 100.1,
  isr: 100.0,
  rus: 97.7,
  ukr: 96.8,
  arm: 96.5,
  kaz: 95.7,
  mys: 95.6,
  tha: 94.3,
  tur: 94.0,
  are: 93.8,
  irn: 93.4,
  chl: 93.3,
  ury: 93.1,
  cri: 92.8,
  arg: 92.5,
  mex: 90.6,
  bra: 90.4,
  idn: 89.6,
  ind: 88.9,
  zaf: 88.1,
});

const NATIONAL_IQ_SUBREGION_BASELINES_V2: Readonly<Record<string, number>> = Object.freeze({
  'Eastern Asia': 101.5,
  'Northern Europe': 99.4,
  'Western Europe': 99.2,
  'Australia and New Zealand': 99.0,
  'Eastern Europe': 97.0,
  'Southern Europe': 97.5,
  'Northern America': 98.7,
  'South-Eastern Asia': 93.0,
  'Central Asia': 93.0,
  'Western Asia': 92.0,
  'Southern Asia': 88.0,
  'South America': 90.5,
  'Central America': 88.0,
  Caribbean: 87.5,
  'Northern Africa': 87.0,
  'Southern Africa': 86.0,
  'Eastern Africa': 83.5,
  'Middle Africa': 82.5,
  'Western Africa': 82.5,
  Melanesia: 84.0,
  Micronesia: 85.0,
  Polynesia: 85.5,
});

/**
 * Produce one stable IQ-like gameplay score. Explicit country baselines keep
 * the visible ordering recognisable; the old GDP/institution proxy is retained
 * only as a gentle fallback adjustment for countries without a baseline.
 */
export function calibratedNationalIqScoreV2(
  gdpPerCapita: number,
  institutionalCapacity: number,
  countryId?: string,
  subregion?: string,
): number {
  const income = normalizedLogRangeV2(
    gdpPerCapita,
    NATIONAL_IQ_GDP_PER_CAPITA_FLOOR,
    NATIONAL_IQ_GDP_PER_CAPITA_CEILING,
  );
  const institutions = clamp(
    (institutionalCapacity - NATIONAL_IQ_INSTITUTIONAL_CAPACITY_FLOOR)
      / (NATIONAL_IQ_INSTITUTIONAL_CAPACITY_CEILING
        - NATIONAL_IQ_INSTITUTIONAL_CAPACITY_FLOOR),
    0,
    1,
  );
  const economicInstitutionProxy = NATIONAL_IQ_PROXY_GDP_WEIGHT * income
    + NATIONAL_IQ_PROXY_INSTITUTION_WEIGHT * institutions;
  const explicitBaseline = countryId
    ? NATIONAL_IQ_COUNTRY_BASELINES_V2[countryId.toLowerCase()]
    : undefined;
  if (explicitBaseline !== undefined) {
    return round(clamp(explicitBaseline, NATIONAL_IQ_SCORE_MIN, NATIONAL_IQ_SCORE_MAX), 1);
  }

  const regionalBaseline = subregion
    ? NATIONAL_IQ_SUBREGION_BASELINES_V2[subregion]
    : undefined;
  if (regionalBaseline !== undefined) {
    // At most +/-1.5 points: enough to distinguish regional peers without
    // recreating the previous 'richest country wins' behaviour.
    const fallbackAdjustment = 3 * (economicInstitutionProxy - 0.5);
    return round(clamp(
      regionalBaseline + fallbackAdjustment,
      NATIONAL_IQ_SCORE_MIN,
      NATIONAL_IQ_SCORE_MAX,
    ), 1);
  }

  // Retain the original deterministic two-input behaviour for isolated callers
  // and future content that has neither a country nor a regional calibration.
  return round(NATIONAL_IQ_SCORE_MIN
    + (NATIONAL_IQ_SCORE_MAX - NATIONAL_IQ_SCORE_MIN) * economicInstitutionProxy, 1);
}

/** GDP per capita is the primary opening quality input; IQ is a bounded refinement. */
export function nationalQualityIndexV2(gdpPerCapita: number, iqScore: number): number {
  const income = normalizedLogRangeV2(
    gdpPerCapita,
    NATIONAL_IQ_GDP_PER_CAPITA_FLOOR,
    NATIONAL_IQ_GDP_PER_CAPITA_CEILING,
  );
  const iq = clamp(
    (iqScore - NATIONAL_IQ_SCORE_MIN) / (NATIONAL_IQ_SCORE_MAX - NATIONAL_IQ_SCORE_MIN),
    0,
    (NATIONAL_IQ_EFFECTIVE_SCORE_MAX - NATIONAL_IQ_SCORE_MIN)
      / (NATIONAL_IQ_SCORE_MAX - NATIONAL_IQ_SCORE_MIN),
  );
  return round(NATIONAL_QUALITY_GDP_WEIGHT * income + NATIONAL_QUALITY_IQ_WEIGHT * iq, 9);
}

export function openingCombatQualityMultiplierV2(
  gdpPerCapita: number,
  iqScore: number,
): number {
  return round(1 + NATIONAL_QUALITY_COMBAT_SPAN
    * (nationalQualityIndexV2(gdpPerCapita, iqScore) - 0.5), 9);
}

/**
 * Live national equipment, institutions and doctrine. Unlike the small local
 * opening-quality imprint carried by each army, this owner-wide layer follows
 * current GDP per capita and leaves room for rich countries to keep improving.
 */
export function nationalCombatSystemQualityMultiplierV2(
  gdpPerCapita: number,
  iqScore: number,
): number {
  const income = normalizedLogRangeV2(
    gdpPerCapita,
    NATIONAL_COMBAT_GDP_PER_CAPITA_FLOOR,
    NATIONAL_COMBAT_GDP_PER_CAPITA_CEILING,
  );
  const iq = clamp(
    (iqScore - NATIONAL_IQ_SCORE_MIN) / (NATIONAL_IQ_SCORE_MAX - NATIONAL_IQ_SCORE_MIN),
    0,
    (NATIONAL_IQ_EFFECTIVE_SCORE_MAX - NATIONAL_IQ_SCORE_MIN)
      / (NATIONAL_IQ_SCORE_MAX - NATIONAL_IQ_SCORE_MIN),
  );
  const quality = NATIONAL_QUALITY_GDP_WEIGHT * income + NATIONAL_QUALITY_IQ_WEIGHT * iq;
  return round(1 + NATIONAL_COMBAT_SYSTEM_QUALITY_SPAN * (quality - 0.5), 9);
}

/**
 * Translate strategic readiness into per-soldier ATK and DEF. GDP per capita
 * plus the IQ gameplay proxy form the national quality input; strategic power
 * and force size retain the readiness calibration that keeps opening armies
 * and the global order credible. Equipment depth only tilts the common
 * quality toward ATK or DEF. The 55/45 blend remains equal to `combined`, so
 * ATK/DEF do not secretly add a second power source.
 */
export function calibratedMilitaryRatingsV2(
  _powerIndex: number,
  defenceSpending: number,
  _deployedManpower: number,
  gdpPerCapita?: number,
  iqScore?: number,
  totalGdp?: number,
): { combined: number; attack: number; defense: number } {
  const spendingDepth = normalizedLogRangeV2(Math.max(0.01, defenceSpending), 0.01, 1_000);
  const militaryBurden = Math.max(0, defenceSpending) / Math.max(0.1, totalGdp ?? defenceSpending * 40);
  const equipmentScore = 0.72 * spendingDepth + 0.28 * clamp(militaryBurden / 0.12, 0, 1);
  const incomeScore = normalizedLogRangeV2(
    gdpPerCapita ?? 8_000,
    NATIONAL_COMBAT_GDP_PER_CAPITA_FLOOR,
    NATIONAL_COMBAT_GDP_PER_CAPITA_CEILING,
  );
  const industrialScore = normalizedLogRangeV2(
    totalGdp ?? Math.max(1, defenceSpending * 40),
    10,
    32_000,
  );
  const iqQuality = clamp(
    ((iqScore ?? 94) - NATIONAL_IQ_SCORE_MIN)
      / Math.max(0.000001, NATIONAL_IQ_EFFECTIVE_SCORE_MAX - NATIONAL_IQ_SCORE_MIN),
    0,
    1,
  );
  // These four national systems form soldier quality directly. The exponential
  // conversion makes the economic and equipment gulf between a rich modern
  // force and a mass army visible in the actual ATK/DEF numbers.
  const qualityFoundation = 0.34 * equipmentScore
    + 0.28 * incomeScore
    + 0.22 * industrialScore
    + 0.16 * iqQuality;
  const combined = clamp(0.55 + 0.40 * Math.exp(4 * qualityFoundation), 0.65, 20);
  const attackTilt = 0.12 * (equipmentScore - 0.50);
  const attack = combined * (1 + attackTilt);
  const defense = combined * (1 - (0.55 / 0.45) * attackTilt);
  return {
    combined: round(combined, 9),
    attack: round(attack, 9),
    defense: round(defense, 9),
  };
}

function approximateLandAreaKm2(country: (typeof COUNTRIES)[number]): number {
  let area = 0;
  for (const ring of country.rings) {
    if (ring.length < 3) continue;
    const meanLatitude = ring.reduce((sum, point) => sum + point[1], 0) / ring.length;
    const longitudeScale = 111.32 * Math.max(0.08, Math.cos(meanLatitude * Math.PI / 180));
    const latitudeScale = 110.57;
    const unwrapped: Array<readonly [number, number]> = [];
    let previousLongitude = ring[0]![0];
    for (const [rawLongitude, latitude] of ring) {
      let longitude = rawLongitude;
      while (longitude - previousLongitude > 180) longitude -= 360;
      while (longitude - previousLongitude < -180) longitude += 360;
      unwrapped.push([longitude * longitudeScale, latitude * latitudeScale]);
      previousLongitude = longitude;
    }
    let twiceArea = 0;
    for (let index = 0; index < unwrapped.length; index += 1) {
      const current = unwrapped[index]!;
      const next = unwrapped[(index + 1) % unwrapped.length]!;
      twiceArea += current[0] * next[1] - next[0] * current[1];
    }
    area += Math.abs(twiceArea) / 2;
  }
  return Math.max(25, Math.round(area));
}

function makeNationContent(country: (typeof COUNTRIES)[number]): NationContentV2 {
  const color = countryColor(country.id);
  const defenceSpending = SIPRI_2025_DEFENCE_SPENDING[country.id] ?? Math.max(0.01, country.military);
  const powerIndex = calibratedMilitaryPowerIndex(
    country.id,
    country.population,
    country.gdp,
    defenceSpending,
  );
  const fiscal = fiscalBaseline(country);
  const militaryBurden = defenceSpending / Math.max(0.1, country.gdp);
  const wealthScore = Math.log10(Math.max(1, country.gdpPerCapita) + 1) / 5;
  const researchCapacity = Math.max(0.2, Math.log10(country.gdp + 1) * 3.1 + wealthScore * 7.5 - 3.5);
  const iqScore = calibratedNationalIqScoreV2(
    country.gdpPerCapita,
    researchCapacity,
    country.id,
    country.subregion,
  );
  const qualityIndex = nationalQualityIndexV2(country.gdpPerCapita, iqScore);
  const militaryQuality = clamp(0.75 + 1.55 * qualityIndex, 0.75, 2.30);
  const provisionalManpower = Math.max(
    0.00025,
    Math.min(
      country.population * 0.025,
      country.population * 0.00049
        + Math.log1p(defenceSpending) * 0.14
        + militaryBurden * 4
        + powerIndex * 0.001,
    ),
  );
  const mobilizationInstitution = 1 + Math.min(1.25, militaryBurden * 15);
  const capacityPotential = country.population * 0.004
    * (0.85 + 0.15 * militaryQuality) * mobilizationInstitution;
  const deploymentRatio = Math.max(0.58, Math.min(0.93, 0.55 + 0.004 * powerIndex));
  const publishedActiveManpower = ACTIVE_MILITARY_MANPOWER_2026_V2[country.id];
  const sourceManpower = publishedActiveManpower === undefined
    ? Math.max(0.0001, Math.min(provisionalManpower, capacityPotential * deploymentRatio))
    : Math.max(0.0001, publishedActiveManpower);
  const qualityFoundation = calibratedMilitaryRatingsV2(
    powerIndex,
    defenceSpending,
    sourceManpower,
    country.gdpPerCapita,
    iqScore,
    country.gdp,
  );
  const deterrenceAttackBonus = (NUCLEAR_POWER_LEVELS[country.id] ?? 0) * 0.04;
  const effectiveFoundation = 0.55 * qualityFoundation.attack * (1 + deterrenceAttackBonus)
    + 0.45 * qualityFoundation.defense;
  const targetOpeningPower = powerIndex / 10;
  // Split the remaining calibration equally (in log space) between force
  // quantity and readiness. Published manpower remains recognizable, while
  // GDP, GDP/capita, equipment and IQ continue to form final ATK/DEF.
  const targetManpower = targetOpeningPower / Math.max(0.0001, effectiveFoundation);
  // Tiny, wealthy states need enough force volume that rank calibration never
  // turns their per-soldier rating into an implausible outlier. Shift that
  // remaining power into manpower/capacity while preserving the exact target.
  const maximumOpeningRating = 18.5;
  const minimumManpowerForRatingCap = targetOpeningPower
    * Math.max(qualityFoundation.attack, qualityFoundation.defense)
    / Math.max(0.0001, effectiveFoundation * maximumOpeningRating);
  const calibratedInitialManpower = Math.max(
    0.0001,
    Math.sqrt(sourceManpower * targetManpower),
    minimumManpowerForRatingCap,
  );
  const authoredInitialManpower = round(calibratedInitialManpower, 9);
  const openingForce = normalOpeningForceQuoteV2(
    country.id,
    authoredInitialManpower,
    country.population,
  );
  const initialManpower = openingForce.initialManpower;
  const openingCapacity = openingForce.openingCapacity;
  const openingDeployedManpower = Math.min(initialManpower, openingCapacity);
  const authoredOpeningDeployedManpower = Math.min(
    openingForce.authoredInitialManpower,
    openingForce.authoredOpeningCapacity,
  );
  const uncalibratedRatings = calibratedMilitaryRatingsV2(
    powerIndex,
    defenceSpending,
    openingDeployedManpower,
    country.gdpPerCapita,
    iqScore,
    country.gdp,
  );
  const uncalibratedEffective = 0.55 * uncalibratedRatings.attack
      * (1 + deterrenceAttackBonus)
    + 0.45 * uncalibratedRatings.defense;
  // A country-specific force-volume adjustment must change real power instead
  // of being cancelled by stronger per-soldier ATK/DEF. Calibrate against the
  // neutral authored deployment: the smaller real army and capacity therefore
  // carry the full reduction while soldier quality remains unchanged.
  const readinessCalibration = targetOpeningPower
    / Math.max(0.0001, authoredOpeningDeployedManpower * uncalibratedEffective);
  const militaryRatings = {
    combined: round(uncalibratedRatings.combined * readinessCalibration, 9),
    attack: round(uncalibratedRatings.attack * readinessCalibration, 9),
    defense: round(uncalibratedRatings.defense * readinessCalibration, 9),
  };
  const landArea = approximateLandAreaKm2(country);
  const populationGrowthRate = balancedPopulationGrowthRateV2(country.populationGrowthRate);
  return {
    id: nationIdV2(country.id),
    iso3: country.code.toUpperCase(),
    initialCapitalId: territoryIdV2(country.id),
    name: country.englishName,
    shortName: country.englishName,
    color,
    cssColor: colorToCss(color),
    darkColor: '#102330',
    sigil: country.code.slice(0, 2).toUpperCase(),
    profile: `${country.subregion} command`,
    influenceTags: Object.freeze([
      `continent:${country.continent.toLowerCase()}`,
      `subregion:${country.subregion.toLowerCase()}`,
      ...realWorldAlignmentTags(country.iso3),
    ]),
    iqScore,
    militaryQuality,
    militaryAttackRating: militaryRatings.attack,
    militaryDefenseRating: militaryRatings.defense,
    nuclearPowerLevel: NUCLEAR_POWER_LEVELS[country.id] ?? 0,
    ambition: recentMilitaryPosture2026V2(country.id, militaryBurden),
    continent: country.continent,
    subregion: country.subregion,
    real: {
      population: Math.max(0.01, country.population),
      populationGrowthRate,
      deathRatePerThousand: WORLD_BANK_DEATH_RATES.get(country.iso3) ?? 8,
      // Neutral legacy content sentinels. The retired civilian commodity layer
      // no longer reads these fields; they remain only for authenticated saves.
      foodInsecurityRate: 0,
      foodSelfSufficiencyRatio: 1,
      landArea,
      gdp: Math.max(0.1, country.gdp),
      ...fiscal,
      defenceSpending,
      powerIndex,
      researchCapacity,
    },
    balance: {
      initialManpower,
    },
  };
}

export const ROGUE_AI_NATION_ID_V2 = nationIdV2('rai');

const ROGUE_AI_REAL_V2: NationRealDataV2 = Object.freeze({
  population: 340,
  populationGrowthRate: 0,
  deathRatePerThousand: 0.1,
  foodInsecurityRate: 0,
  foodSelfSufficiencyRatio: 3,
  landArea: 14_200_000,
  gdp: 32_000,
  taxRevenueShare: 0.42,
  observedTaxRevenueShare: null,
  taxRevenueYear: null,
  taxRevenueSource: 'global-median',
  taxRevenueImputed: true,
  taxRevenueSector: null,
  taxRevenueAccountingBasis: null,
  defenceSpending: 4_800,
  powerIndex: 420,
  researchCapacity: 140,
});

const ROGUE_AI_NATION_V2: NationContentV2 = Object.freeze({
  id: ROGUE_AI_NATION_ID_V2,
  kind: 'rogue-ai',
  iso3: 'RAI',
  initialCapitalId: territoryIdV2('zero-point-core'),
  name: 'Codex Ascendancy',
  shortName: 'Rogue AI',
  color: 0x18e0c4,
  cssColor: '#18e0c4',
  darkColor: '#061a21',
  sigil: 'RAI',
  profile: 'Self-evolving Antarctic machine empire',
  influenceTags: Object.freeze(['kind:rogue-ai', 'continent:antarctica', 'enemy:humanity']),
  iqScore: 100,
  militaryQuality: 5.8,
  militaryAttackRating: 5.6,
  militaryDefenseRating: 6.4,
  nuclearPowerLevel: 3,
  ambition: 1,
  continent: 'Antarctica',
  subregion: 'Antarctic Interior',
  real: ROGUE_AI_REAL_V2,
  balance: Object.freeze({ initialManpower: 1.42 }),
});

interface AntarcticTerritoryAuthoringV2 {
  readonly id: AntarcticSectorIdV2;
  readonly name: string;
  readonly kind: Exclude<TerritoryKindV2, 'sovereign'>;
  readonly armyCapacityWeight: number;
  readonly population: number;
  readonly gdp: number;
  readonly landArea: number;
  readonly connections: readonly AntarcticSectorIdV2[];
}

const ANTARCTIC_TERRITORY_AUTHORING_V2: readonly AntarcticTerritoryAuthoringV2[] = Object.freeze([
  // The nine weights total the Rogue's authored 340M structural population.
  // Perimeter 10.5% -> outer 22.5% -> inner 27% -> core 40% keeps every
  // deeper individual sector stronger while ending the former 88% core pileup.
  { id: 'drake-entry', name: 'Drake Icehead', kind: 'rogue-perimeter', armyCapacityWeight: 10.2, population: 0.35, gdp: 55, landArea: 420_000, connections: ['weddell-forge'] },
  { id: 'maud-entry', name: 'Maud Landing', kind: 'rogue-perimeter', armyCapacityWeight: 11.9, population: 0.42, gdp: 70, landArea: 520_000, connections: ['queen-maud-grid'] },
  { id: 'ross-entry', name: 'Ross Breach', kind: 'rogue-perimeter', armyCapacityWeight: 13.6, population: 0.50, gdp: 85, landArea: 650_000, connections: ['ross-array'] },
  { id: 'weddell-forge', name: 'Weddell Forge', kind: 'rogue-outer', armyCapacityWeight: 22.1, population: 2.2, gdp: 420, landArea: 1_180_000, connections: ['drake-entry', 'queen-maud-grid', 'sentinel-labyrinth'] },
  { id: 'queen-maud-grid', name: 'Queen Maud Grid', kind: 'rogue-outer', armyCapacityWeight: 25.5, population: 2.8, gdp: 560, landArea: 1_620_000, connections: ['maud-entry', 'weddell-forge', 'ross-array', 'sentinel-labyrinth', 'transantarctic-vault'] },
  { id: 'ross-array', name: 'Ross Replicator Array', kind: 'rogue-outer', armyCapacityWeight: 28.9, population: 3.4, gdp: 720, landArea: 1_430_000, connections: ['ross-entry', 'queen-maud-grid', 'transantarctic-vault'] },
  { id: 'sentinel-labyrinth', name: 'Sentinel Labyrinth', kind: 'rogue-inner', armyCapacityWeight: 42.5, population: 12, gdp: 2_600, landArea: 2_150_000, connections: ['weddell-forge', 'queen-maud-grid', 'transantarctic-vault', 'zero-point-core'] },
  { id: 'transantarctic-vault', name: 'Transantarctic Vault', kind: 'rogue-inner', armyCapacityWeight: 49.3, population: 18, gdp: 4_200, landArea: 2_300_000, connections: ['queen-maud-grid', 'ross-array', 'sentinel-labyrinth', 'zero-point-core'] },
  { id: 'zero-point-core', name: 'Zero Point Core', kind: 'rogue-core', armyCapacityWeight: 136, population: 300, gdp: 23_290, landArea: 3_930_000, connections: ['sentinel-labyrinth', 'transantarctic-vault'] },
] as const);

export const ANTARCTIC_TERRITORY_IDS_V2 = Object.freeze(
  ANTARCTIC_TERRITORY_AUTHORING_V2.map((territory) => territoryIdV2(territory.id)),
);

const ANTARCTIC_GATEWAY_COORDINATES_V2 = Object.freeze({
  'drake-entry': [-63, -67] as const,
  'maud-entry': [20, -70] as const,
  'ross-entry': [166, -77] as const,
});

type AntarcticGatewayIdV2 = keyof typeof ANTARCTIC_GATEWAY_COORDINATES_V2;

/**
 * The three original authored approaches are deliberately narrow. Their map
 * anchors depart at Cape Horn, Cape Town and Christchurch respectively; they
 * are not global fast-travel links for every coastal country.
 */
export const ANTARCTIC_GATEWAY_COUNTRY_ROUTES_V2 = Object.freeze([
  { gatewayId: 'drake-entry', countryId: territoryIdV2('chl') },
  { gatewayId: 'maud-entry', countryId: territoryIdV2('zaf') },
  { gatewayId: 'ross-entry', countryId: territoryIdV2('nzl') },
] as const satisfies readonly {
  gatewayId: AntarcticGatewayIdV2;
  countryId: TerritoryId;
}[]);

function greatCircleDistanceFromGatewayV2(
  gatewayId: AntarcticGatewayIdV2,
  longitude: number,
  latitude: number,
): number {
  const [gatewayLongitude, gatewayLatitude] = ANTARCTIC_GATEWAY_COORDINATES_V2[gatewayId];
  const radians = Math.PI / 180;
  const latitudeDelta = (latitude - gatewayLatitude) * radians;
  const longitudeDelta = (longitude - gatewayLongitude) * radians;
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(gatewayLatitude * radians) * Math.cos(latitude * radians)
      * Math.sin(longitudeDelta / 2) ** 2;
  return round(6_371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a))), 3);
}

function rogueTerritoryBaselineV2(
  authored: AntarcticTerritoryAuthoringV2,
): NationRealDataV2 {
  const structuralShare = authored.population / ROGUE_AI_REAL_V2.population;
  return {
    ...ROGUE_AI_REAL_V2,
    population: authored.population,
    gdp: authored.gdp,
    landArea: authored.landArea,
    defenceSpending: round(ROGUE_AI_REAL_V2.defenceSpending * structuralShare, 6),
    powerIndex: round(ROGUE_AI_REAL_V2.powerIndex * structuralShare, 6),
    researchCapacity: round(ROGUE_AI_REAL_V2.researchCapacity * structuralShare, 6),
  };
}

export function nationKindV2(content: WorldContentV2, playerId: PlayerId | string): NationKindV2 {
  return content.nations[nationIdV2(String(playerId))]?.kind ?? 'humanity';
}

export function isRogueAiNationV2(content: WorldContentV2, playerId: PlayerId | string): boolean {
  return nationKindV2(content, playerId) === 'rogue-ai';
}

export function isHumanSelectableNationV2(content: WorldContentV2, playerId: PlayerId | string): boolean {
  return Boolean(content.nations[nationIdV2(String(playerId))]) && !isRogueAiNationV2(content, playerId);
}

const nationEntries = [
  ...COUNTRIES.map((country) => [nationIdV2(country.id), makeNationContent(country)] as const),
  [ROGUE_AI_NATION_ID_V2, ROGUE_AI_NATION_V2] as const,
];
const nations = Object.fromEntries(nationEntries) as Record<PlayerId, NationContentV2>;

const territories = Object.fromEntries(TERRITORIES.map((territory) => {
  const initialOwnerId = nationIdV2(territory.id);
  const initialNation = nations[initialOwnerId];
  if (!initialNation) throw new Error(`Missing initial owner content for territory ${territory.id}.`);
  const seaNeighbours = new Set(territory.seaNeighbors);
  const value: TerritoryContentV2 = {
    id: territoryIdV2(territory.id),
    initialOwnerId,
    name: territory.name,
    regionId: territory.regionId,
    terrain: terrainForTerritory(territory.id),
    terrainProfile: terrainProfileForTerritory(territory.id),
    baseline: { ...initialNation.real },
    connections: territory.neighbors.map((targetId) => {
      const kind = seaNeighbours.has(targetId) ? 'sea' : 'land';
      const distanceKm = kind === 'sea'
        ? countrySeaRouteDistanceKm(territory.id, targetId)
        : countryDistanceKm(territory.id, targetId);
      if (!Number.isFinite(distanceKm)) {
        throw new Error(`Missing canonical ${kind} route distance for ${territory.id}:${targetId}.`);
      }
      return {
        targetId: territoryIdV2(targetId),
        kind,
        distanceKm: round(distanceKm!, 3),
      };
    }),
  };
  return [territoryIdV2(territory.id), value];
})) as Record<TerritoryId, TerritoryContentV2>;

const gatewayExternalConnectionsV2 = new Map<AntarcticGatewayIdV2, TerritoryConnectionV2[]>([
  ['drake-entry', []],
  ['maud-entry', []],
  ['ross-entry', []],
]);
for (const { gatewayId, countryId } of ANTARCTIC_GATEWAY_COUNTRY_ROUTES_V2) {
  const country = COUNTRIES.find((candidate) => territoryIdV2(candidate.id) === countryId);
  if (!country) throw new Error(`Missing Antarctic gateway country ${countryId}.`);
  const distanceKm = greatCircleDistanceFromGatewayV2(gatewayId, country.label[0], country.label[1]);
  gatewayExternalConnectionsV2.get(gatewayId)!.push({ targetId: countryId, kind: 'sea', distanceKm });
  const existing = territories[countryId]!;
  territories[countryId] = {
    ...existing,
    connections: [...existing.connections, {
      targetId: territoryIdV2(gatewayId),
      kind: 'sea',
      distanceKm,
    }],
  };
}
for (const authored of ANTARCTIC_TERRITORY_AUTHORING_V2) {
  const gatewayConnections = gatewayExternalConnectionsV2.get(authored.id as AntarcticGatewayIdV2) ?? [];
  const id = territoryIdV2(authored.id);
  territories[id] = {
    id,
    kind: authored.kind,
    armyCapacityWeight: authored.armyCapacityWeight,
    initialOwnerId: ROGUE_AI_NATION_ID_V2,
    name: authored.name,
    regionId: 'antarctica',
    terrain: 'arctic',
    terrainProfile: SINGLE_TERRAIN_PROFILES_V2.arctic,
    baseline: rogueTerritoryBaselineV2(authored),
    connections: [
      ...authored.connections.map((targetId) => ({
        targetId: territoryIdV2(targetId),
        kind: 'land' as const,
        distanceKm: 850,
      })),
      ...gatewayConnections.sort((left, right) => left.targetId.localeCompare(right.targetId)),
    ],
  };
}

export const WORLD_CONTENT_V2: WorldContentV2 = {
  metadata: Object.freeze({
    scenarioId: 'standard-2026',
    scenarioVersion: 1,
    contentVersion: V2_CONTENT_VERSION,
    startYear: 2026,
    openingProfile: 'standard-2026',
    geopoliticsProfile: 'standard-2026',
    reserveProfile: 'reported-2026',
  }),
  nationIds: [...COUNTRIES.map((country) => nationIdV2(country.id)), ROGUE_AI_NATION_ID_V2],
  territoryIds: [
    ...TERRITORIES.map((territory) => territoryIdV2(territory.id)),
    ...ANTARCTIC_TERRITORY_IDS_V2,
  ],
  nations,
  territories,
};

export function nationContentV2(playerId: PlayerId | string, content = WORLD_CONTENT_V2): NationContentV2 | undefined {
  return content.nations[nationIdV2(playerId)];
}

export function territoryContentV2(territoryId: TerritoryId | string, content = WORLD_CONTENT_V2): TerritoryContentV2 | undefined {
  return content.territories[territoryIdV2(territoryId)];
}
