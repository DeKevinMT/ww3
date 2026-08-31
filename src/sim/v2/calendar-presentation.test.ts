import { describe, expect, it } from 'vitest';
import {
  calendarAnnualGrowthRateV2,
  calendarAnnualLossRateV2,
  V2_CALENDAR_DAYS_PER_TICK,
  V2_CALENDAR_DAYS_PER_YEAR,
  WEEKS_PER_YEAR,
} from './balance';

describe('daily calendar presentation', () => {
  it('keeps tick pacing unchanged while annualizing legacy 52-tick growth over 365 days', () => {
    const legacyRate = 0.01;
    const calendarTicks = V2_CALENDAR_DAYS_PER_YEAR / V2_CALENDAR_DAYS_PER_TICK;

    expect(calendarAnnualGrowthRateV2(legacyRate)).toBeCloseTo(
      (1 + legacyRate) ** (calendarTicks / WEEKS_PER_YEAR) - 1,
      12,
    );
    expect(calendarAnnualGrowthRateV2(legacyRate)).toBeGreaterThan(legacyRate);
  });

  it('annualizes attrition as bounded compounded loss', () => {
    const legacyLoss = 0.01;
    const calendarTicks = V2_CALENDAR_DAYS_PER_YEAR / V2_CALENDAR_DAYS_PER_TICK;

    expect(calendarAnnualLossRateV2(legacyLoss)).toBeCloseTo(
      1 - (1 - legacyLoss) ** (calendarTicks / WEEKS_PER_YEAR),
      12,
    );
    expect(calendarAnnualLossRateV2(Number.NaN)).toBe(0);
  });
});
