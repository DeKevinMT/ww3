import {
  COUNTRIES,
  TERRITORIES,
  colorToCss,
  countryDistanceKm,
  countryColor,
  terrainForTerritory,
} from '../../game/data/worldMap';
import rawDeathRateData from '../../assets/wb_death_rate.json?raw';
import rawFoodSelfSufficiencyData from '../../assets/fao_food_self_sufficiency.json?raw';
import rawTaxRevenueData from '../../assets/imf_tax_revenue.json?raw';
import {
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
  clamp,
  round,
} from './balance';
import {
  nationIdV2,
  territoryIdV2,
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

export interface NationContentV2 {
  id: PlayerId;
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
  initialOwnerId: PlayerId;
  name: string;
  regionId: string;
  terrain: TerrainType;
  baseline: NationRealDataV2;
  connections: readonly TerritoryConnectionV2[];
}

export interface WorldContentV2 {
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

interface FaoFoodSelfSufficiencyAsset {
  ratios?: Record<string, number>;
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

const FAO_FOOD_SELF_SUFFICIENCY = (() => {
  const parsed = JSON.parse(rawFoodSelfSufficiencyData) as FaoFoodSelfSufficiencyAsset;
  return new Map(Object.entries(parsed.ratios ?? {}).flatMap(([countryId, ratio]) => (
    Number.isFinite(ratio)
      ? [[countryId.toLowerCase(), Number(ratio)] as const]
      : []
  )));
})();

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
 * 2025/26 crisis calibration. Nigeria uses FAO's projected 34.7M people in
 * acute food insecurity against the current 237.5M population baseline.
 * Other entries are conservative game abstractions for active severe crises;
 * they describe food access, not agricultural potential alone.
 */
const FOOD_INSECURITY_OVERRIDES: Readonly<Record<string, number>> = {
  nga: 0.146,
  sdn: 0.45,
  sds: 0.55,
  yem: 0.40,
  psx: 0.72,
  hti: 0.45,
  mli: 0.25,
  afg: 0.33,
  cod: 0.22,
  som: 0.45,
  eth: 0.18,
  ner: 0.20,
  tcd: 0.22,
  bfa: 0.16,
  caf: 0.40,
  syr: 0.35,
  mmr: 0.18,
  ukr: 0.09,
};

function initialFoodInsecurityRate(country: (typeof COUNTRIES)[number]): number {
  const explicit = FOOD_INSECURITY_OVERRIDES[country.id];
  if (explicit !== undefined) return explicit;
  const poverty = Math.max(0, Math.min(1, (8_000 - country.gdpPerCapita) / 8_000));
  const rapidGrowth = Math.max(0, Math.min(1, (country.populationGrowthRate - 1) / 2.5));
  return Math.max(0.005, Math.min(0.20, 0.005 + 0.10 * poverty + 0.06 * rapidGrowth));
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
  population: number,
  gdp: number,
  defenceSpending: number,
): number {
  const spendingScore = Math.log10(defenceSpending + 1) / Math.log10(955);
  const economyScore = Math.log10(gdp + 1) / Math.log10(31_000);
  const populationScore = Math.log10(population + 1) / Math.log10(1_500);
  return Math.max(4, Math.min(100,
    100 * (0.62 * spendingScore + 0.23 * economyScore + 0.15 * populationScore),
  ));
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
 * and the global order credible. Spending per soldier only tilts the common
 * quality toward ATK or DEF. The 55/45 blend remains equal to `combined`, so
 * ATK/DEF do not secretly add a second power source.
 */
export function calibratedMilitaryRatingsV2(
  powerIndex: number,
  defenceSpending: number,
  deployedManpower: number,
  gdpPerCapita?: number,
  iqScore?: number,
): { combined: number; attack: number; defense: number } {
  const manpower = Math.max(0.0001, deployedManpower);
  const combatQualityMultiplier = gdpPerCapita === undefined || iqScore === undefined
    ? 1 : openingCombatQualityMultiplierV2(gdpPerCapita, iqScore);
  const combined = clamp(powerIndex / (100 * manpower) * combatQualityMultiplier, 0.35, 14);
  const equipmentPerSoldier = Math.max(0, defenceSpending) / manpower;
  const equipmentScore = clamp(Math.log10(equipmentPerSoldier + 1) / Math.log10(2_500), 0, 1);
  const attackTilt = 0.10 * (equipmentScore - 0.50);
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
  const powerIndex = calibratedMilitaryPowerIndex(country.population, country.gdp, defenceSpending);
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
  const initialManpower = Math.max(0.0001, Math.min(provisionalManpower, capacityPotential * deploymentRatio));
  const openingDeployedManpower = Math.min(
    initialManpower,
    Math.max(0.0001, country.population * ARMY_CAPACITY_STRUCTURAL_POPULATION_SHARE),
  );
  const militaryRatings = calibratedMilitaryRatingsV2(
    powerIndex,
    defenceSpending,
    openingDeployedManpower,
    country.gdpPerCapita,
    iqScore,
  );
  const landArea = approximateLandAreaKm2(country);
  const foodInsecurityRate = initialFoodInsecurityRate(country);
  const foodSelfSufficiencyRatio = FAO_FOOD_SELF_SUFFICIENCY.get(country.id);
  if (!Number.isFinite(foodSelfSufficiencyRatio)) {
    throw new Error(`Missing FAOSTAT food self-sufficiency baseline for playable country ${country.id}.`);
  }
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
    ambition: Math.max(0, Math.min(1, 0.45 + ((country.id.charCodeAt(0) * 17 + country.id.charCodeAt(country.id.length - 1)) % 51) / 100)),
    continent: country.continent,
    subregion: country.subregion,
    real: {
      population: Math.max(0.01, country.population),
      populationGrowthRate,
      deathRatePerThousand: WORLD_BANK_DEATH_RATES.get(country.iso3) ?? 8,
      foodInsecurityRate,
      foodSelfSufficiencyRatio: clamp(foodSelfSufficiencyRatio!, 0.001, 3),
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

const nationEntries = COUNTRIES.map((country) => [nationIdV2(country.id), makeNationContent(country)] as const);
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
    baseline: { ...initialNation.real },
    connections: territory.neighbors.map((targetId) => ({
      targetId: territoryIdV2(targetId),
      kind: seaNeighbours.has(targetId) ? 'sea' : 'land',
      distanceKm: round(countryDistanceKm(territory.id, targetId), 3),
    })),
  };
  return [territoryIdV2(territory.id), value];
})) as Record<TerritoryId, TerritoryContentV2>;

export const WORLD_CONTENT_V2: WorldContentV2 = {
  nationIds: COUNTRIES.map((country) => nationIdV2(country.id)),
  territoryIds: TERRITORIES.map((territory) => territoryIdV2(territory.id)),
  nations,
  territories,
};

export function nationContentV2(playerId: PlayerId | string, content = WORLD_CONTENT_V2): NationContentV2 | undefined {
  return content.nations[nationIdV2(playerId)];
}

export function territoryContentV2(territoryId: TerritoryId | string, content = WORLD_CONTENT_V2): TerritoryContentV2 | undefined {
  return content.territories[territoryIdV2(territoryId)];
}
