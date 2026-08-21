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
import { territoryIdV2 } from './types';

describe('V2 country-size integration calendar', () => {
  it('anchors Luxembourg at 12.5 years, Belgium near 25.5 and China near 170', () => {
    const years = (id: string) => territoryIntegrationDurationWeeksV2(
      WORLD_CONTENT_V2,
      territoryIdV2(id),
    ) / WEEKS_PER_YEAR;

    expect(years('lux')).toBe(12.5);
    expect(years('bel')).toBeGreaterThanOrEqual(25);
    expect(years('bel')).toBeLessThanOrEqual(26);
    expect(years('chn')).toBeGreaterThanOrEqual(165);
    expect(years('chn')).toBeLessThanOrEqual(175);
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
