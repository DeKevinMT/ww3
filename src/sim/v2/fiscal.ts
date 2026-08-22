import { round } from './balance';

/** The automatic country tax share always stays inside this visible range. */
export const MIN_NORMALIZED_TAX_RATE_V2 = 0.10;
export const MAX_NORMALIZED_TAX_RATE_V2 = 0.20;
/** At $75K fiscal reference wealth per person a country reaches the 20% end. */
export const FULL_STRENGTH_WEALTH_PER_PERSON_V2 = 75;
/** Stable GDP floor that keeps recovery finance alive after population loss. */
export const FISCAL_STABLE_ECONOMY_WEIGHT_V2 = 0.50;
/** Share of the tax base that follows live productive population. */
export const FISCAL_LIVE_POPULATION_WEIGHT_V2 = 0.50;

export interface FiscalCapacityV2 {
  /** Population-equivalent tax base, in millions of people. */
  effectivePopulation: number;
  /** Supplied reference wealth, in thousands of dollars per person. */
  wealthPerPerson: number;
  /** Automatic country rate from reference wealth; this is not a player policy. */
  dynamicTaxRate: number;
  /** Annual productive base, in billions. */
  taxableOutput: number;
  /** Weekly public income, in billions. */
  weeklyTaxRevenue: number;
}

export interface BlendedFiscalCapacityV2 {
  /** Real GDP unlocked by current integration, in billions. */
  integratedOutput: number;
  /** Live population unlocked by current integration, in millions. */
  productivePopulation: number;
  /** Immutable opening population unlocked by current integration. */
  referenceProductivePopulation: number;
  productivePopulationFactor: number;
  /** Display wealth based on live productive population. */
  wealthPerPerson: number;
  /** GDP per immutable reference person, used to set the automatic tax rate. */
  fiscalReferenceWealthPerPerson: number;
  dynamicTaxRate: number;
  taxableOutput: number;
  weeklyTaxRevenue: number;
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Baseline/reference fiscal calculation. It supplies the bounded automatic
 * rate and remains useful for immutable structural prices. Live runtime tax
 * uses `calculateBlendedFiscalCapacityV2`, which calls this helper for exactly
 * the same rate calibration.
 */
export function calculateFiscalCapacityV2(
  effectivePopulationMillions: number,
  wealthPerPersonThousands: number,
): FiscalCapacityV2 {
  const effectivePopulation = finiteNonNegative(effectivePopulationMillions);
  const wealthPerPerson = finiteNonNegative(wealthPerPersonThousands);
  const taxableOutput = effectivePopulation * wealthPerPerson;
  const strength = Math.min(1, wealthPerPerson / FULL_STRENGTH_WEALTH_PER_PERSON_V2);
  const dynamicTaxRate = round(
    MIN_NORMALIZED_TAX_RATE_V2
      + (MAX_NORMALIZED_TAX_RATE_V2 - MIN_NORMALIZED_TAX_RATE_V2) * strength,
    9,
  );
  return {
    effectivePopulation: round(effectivePopulation, 9),
    wealthPerPerson: round(wealthPerPerson, 9),
    dynamicTaxRate,
    taxableOutput: round(taxableOutput, 9),
    weeklyTaxRevenue: round(taxableOutput * dynamicTaxRate / 52, 9),
  };
}

/**
 * Canonical live tax identity. Real GDP stays independent from population,
 * while half of the taxable base follows live productive people. The rate is
 * derived from GDP per immutable reference person, so population cannot
 * algebraically cancel its own contribution or lower that rate as it grows.
 */
export function calculateBlendedFiscalCapacityV2(
  integratedOutputBillions: number,
  productivePopulationMillions: number,
  referenceProductivePopulationMillions: number,
): BlendedFiscalCapacityV2 {
  const integratedOutput = finiteNonNegative(integratedOutputBillions);
  const productivePopulation = finiteNonNegative(productivePopulationMillions);
  const referenceProductivePopulation = finiteNonNegative(referenceProductivePopulationMillions);
  const productivePopulationFactor = referenceProductivePopulation > 0
    ? productivePopulation / referenceProductivePopulation
    : 0;
  const wealthPerPerson = productivePopulation > 0
    ? integratedOutput / productivePopulation
    : 0;
  const fiscalReferenceWealthPerPerson = referenceProductivePopulation > 0
    ? integratedOutput / referenceProductivePopulation
    : 0;
  const referenceCapacity = calculateFiscalCapacityV2(
    referenceProductivePopulation,
    fiscalReferenceWealthPerPerson,
  );
  const taxableOutput = integratedOutput * (
    FISCAL_STABLE_ECONOMY_WEIGHT_V2
      + FISCAL_LIVE_POPULATION_WEIGHT_V2 * productivePopulationFactor
  );
  return {
    integratedOutput: round(integratedOutput, 9),
    productivePopulation: round(productivePopulation, 9),
    referenceProductivePopulation: round(referenceProductivePopulation, 9),
    productivePopulationFactor: round(productivePopulationFactor, 9),
    wealthPerPerson: round(wealthPerPerson, 9),
    fiscalReferenceWealthPerPerson: round(fiscalReferenceWealthPerPerson, 9),
    dynamicTaxRate: referenceCapacity.dynamicTaxRate,
    taxableOutput: round(taxableOutput, 9),
    weeklyTaxRevenue: round(taxableOutput * referenceCapacity.dynamicTaxRate / 52, 9),
  };
}
