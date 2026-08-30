import { describe, expect, it } from 'vitest';
import {
  CONQUEST_INITIAL_INTEGRATION_SHARE,
  WEEKS_PER_YEAR,
} from './balance';
import { WORLD_CONTENT_V2 } from './content';
import {
  advanceTerritoryIntegrationV2,
  territoryIntegrationDurationWeeksV2,
  territoryIntegrationSizeV2,
} from './integration';
import { territoryIdV2, type TerritoryId } from './types';

function relativeIntegrationSize(territoryId: TerritoryId): number {
  const luxembourgSize = territoryIntegrationSizeV2(
    WORLD_CONTENT_V2,
    territoryIdV2('lux'),
  );
  const size = territoryIntegrationSizeV2(WORLD_CONTENT_V2, territoryId);
  return Math.max(0, Math.min(1,
    (size - luxembourgSize) / Math.max(0.000001, 1 - luxembourgSize),
  ));
}

describe('V2 country-size integration calendar', () => {
  it('quotes the exact one-to-six-year Signal Purge curve from immutable size', () => {
    for (const territoryId of WORLD_CONTENT_V2.territoryIds) {
      const relativeSize = relativeIntegrationSize(territoryId);
      expect(territoryIntegrationDurationWeeksV2(WORLD_CONTENT_V2, territoryId)).toBe(
        Math.round((1
          + 2 * relativeSize
          + 1.5 * relativeSize ** 2
          + 1.5 * relativeSize ** 4) * WEEKS_PER_YEAR),
      );
    }
  });

  it('keeps small targets quick, mid-sized targets meaningful and the largest projects long', () => {
    const entries = WORLD_CONTENT_V2.territoryIds.map((territoryId) => ({
      territoryId,
      relativeSize: relativeIntegrationSize(territoryId),
      years: territoryIntegrationDurationWeeksV2(WORLD_CONTENT_V2, territoryId)
        / WEEKS_PER_YEAR,
    }));
    const smallest = entries.reduce((left, right) => left.years <= right.years ? left : right);
    const middle = entries.reduce((closest, candidate) => (
      Math.abs(candidate.relativeSize - 0.5) < Math.abs(closest.relativeSize - 0.5)
        ? candidate : closest
    ));
    const largest = entries.reduce((left, right) => left.years >= right.years ? left : right);

    expect(smallest.years).toBeGreaterThanOrEqual(1);
    expect(smallest.years).toBeLessThanOrEqual(1.1);
    expect(middle.relativeSize).toBeCloseTo(0.5, 1);
    expect(middle.years).toBeGreaterThanOrEqual(2);
    expect(middle.years).toBeLessThanOrEqual(4);
    expect(largest.years).toBeGreaterThanOrEqual(5.5);
    expect(largest.years).toBeLessThanOrEqual(6);

    for (const starterTarget of ['lux', 'gnb', 'gmb']) {
      const target = entries.find((entry) => entry.territoryId === territoryIdV2(starterTarget));
      expect(target?.years).toBeGreaterThanOrEqual(1);
      expect(target?.years).toBeLessThanOrEqual(1.8);
    }
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
