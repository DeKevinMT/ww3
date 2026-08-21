import { round } from './balance';

/** The automatic country tax share always stays inside this visible range. */
export const MIN_NORMALIZED_TAX_RATE_V2 = 0.10;
export const MAX_NORMALIZED_TAX_RATE_V2 = 0.20;
/** At $75K live wealth per person a country reaches the 20% end of the range. */
export const FULL_STRENGTH_WEALTH_PER_PERSON_V2 = 75;

export interface FiscalCapacityV2 {
  /** Population-equivalent tax base, in millions of people. */
  effectivePopulation: number;
  /** Current productive wealth, in thousands of dollars per person. */
  wealthPerPerson: number;
  /** Automatic country rate from live wealth per person; this is not a player policy. */
  dynamicTaxRate: number;
  /** Annual productive base, in billions. */
  taxableOutput: number;
  /** Weekly public income, in billions. */
  weeklyTaxRevenue: number;
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Canonical V2 tax identity used by bootstrap, runtime and structural prices.
 * The one visible country adjustment is linear: wealthier countries move from
 * 10% toward 20%. No condition, war or integration modifier is hidden
 * inside the rate.
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
