import { describe, expect, it } from 'vitest';
import {
  CONQUEST_INITIAL_INTEGRATION_SHARE,
  CONQUEST_INTEGRATION_MAX_YEARS,
  CONQUEST_INTEGRATION_MIN_YEARS,
  WEEKS_PER_YEAR,
} from './balance';
import { WORLD_CONTENT_V2 } from './content';
import {
  advanceTerritoryIntegrationV2,
  territoryIntegrationDurationWeeksV2,
} from './integration';
import { territoryIdV2 } from './types';

describe('V2 country-size integration calendar', () => {
  it('assigns every playable country a deterministic duration inside ten to twenty years', () => {
    const durations = WORLD_CONTENT_V2.territoryIds.map((territoryId) => (
      territoryIntegrationDurationWeeksV2(WORLD_CONTENT_V2, territoryId)
    ));
    expect(Math.min(...durations)).toBeGreaterThanOrEqual(
      CONQUEST_INTEGRATION_MIN_YEARS * WEEKS_PER_YEAR,
    );
    expect(Math.max(...durations)).toBeLessThanOrEqual(
      CONQUEST_INTEGRATION_MAX_YEARS * WEEKS_PER_YEAR,
    );
    expect(new Set(durations).size).toBeGreaterThan(50);
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
