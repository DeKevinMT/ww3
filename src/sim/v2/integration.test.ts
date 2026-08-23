import { describe, expect, it } from 'vitest';
import {
  CONQUEST_INITIAL_INTEGRATION_SHARE,
  WEEKS_PER_YEAR,
} from './balance';
import { WORLD_CONTENT_V2 } from './content';
import {
  advanceTerritoryIntegrationV2,
  INTEGRATION_DURATION_MULTIPLIER_V2,
  territoryIntegrationDurationWeeksV2,
  territoryIntegrationSizeV2,
} from './integration';
import { territoryIdV2, type TerritoryId } from './types';

function previousCalendarDurationWeeks(territoryId: TerritoryId): number {
  const luxembourgSize = territoryIntegrationSizeV2(
    WORLD_CONTENT_V2,
    territoryIdV2('lux'),
  );
  const size = territoryIntegrationSizeV2(WORLD_CONTENT_V2, territoryId);
  const relativeSize = Math.max(0, Math.min(1,
    (size - luxembourgSize) / Math.max(0.000001, 1 - luxembourgSize),
  ));
  return Math.round((12.5
    + 25 * relativeSize
    + 50 * relativeSize ** 2
    + 100 * relativeSize ** 4) * WEEKS_PER_YEAR);
}

describe('V2 country-size integration calendar', () => {
  it('uses exactly 1.02x the original calendar after another 15% speed-up', () => {
    expect(INTEGRATION_DURATION_MULTIPLIER_V2).toBe(1.02);
    for (const territoryId of WORLD_CONTENT_V2.territoryIds) {
      expect(territoryIntegrationDurationWeeksV2(WORLD_CONTENT_V2, territoryId)).toBe(
        Math.round(previousCalendarDurationWeeks(territoryId) * 1.02),
      );
    }
  });

  it('anchors Luxembourg near 12.8 years, Belgium near 26 and China near 173', () => {
    const years = (id: string) => territoryIntegrationDurationWeeksV2(
      WORLD_CONTENT_V2,
      territoryIdV2(id),
    ) / WEEKS_PER_YEAR;

    expect(years('lux')).toBeGreaterThanOrEqual(12.7);
    expect(years('lux')).toBeLessThanOrEqual(12.9);
    expect(years('bel')).toBeGreaterThanOrEqual(25.5);
    expect(years('bel')).toBeLessThanOrEqual(27);
    expect(years('chn')).toBeGreaterThanOrEqual(168);
    expect(years('chn')).toBeLessThanOrEqual(180);
  });

  it('never gives a larger country-size score a shorter calendar', () => {
    const ordered = WORLD_CONTENT_V2.territoryIds
      .map((territoryId) => ({
        territoryId,
        size: territoryIntegrationSizeV2(WORLD_CONTENT_V2, territoryId),
        duration: territoryIntegrationDurationWeeksV2(WORLD_CONTENT_V2, territoryId),
      }))
      .sort((left, right) => left.size - right.size || left.territoryId.localeCompare(right.territoryId));

    for (let index = 1; index < ordered.length; index += 1) {
      expect(ordered[index]!.duration).toBeGreaterThanOrEqual(ordered[index - 1]!.duration);
    }
    expect(new Set(ordered.map((entry) => entry.duration)).size).toBeGreaterThan(50);
  });

  it('unlocks smoothly from ten percent to one hundred percent on the promised calendar', () => {
    for (const territoryId of [territoryIdV2('lux'), territoryIdV2('grl'), territoryIdV2('chn')]) {
      const duration = territoryIntegrationDurationWeeksV2(WORLD_CONTENT_V2, territoryId);
      const halfway = advanceTerritoryIntegrationV2(
        WORLD_CONTENT_V2,
        territoryId,
        CONQUEST_INITIAL_INTEGRATION_SHARE,
        duration / 2,
      );
      const complete = advanceTerritoryIntegrationV2(
        WORLD_CONTENT_V2,
        territoryId,
        CONQUEST_INITIAL_INTEGRATION_SHARE,
        duration,
      );
      expect(halfway).toBeCloseTo(0.55, 10);
      expect(complete).toBe(1);
      expect(advanceTerritoryIntegrationV2(WORLD_CONTENT_V2, territoryId, complete)).toBe(1);
    }
  });

  it('takes larger countries longer than compact countries', () => {
    expect(territoryIntegrationDurationWeeksV2(WORLD_CONTENT_V2, territoryIdV2('chn')))
      .toBeGreaterThan(territoryIntegrationDurationWeeksV2(WORLD_CONTENT_V2, territoryIdV2('lux')));
  });
});
