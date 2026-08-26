import { describe, expect, it } from 'vitest';
import type { TerrainType } from '../types';
import {
  COUNTRY_TERRAIN_PROFILES,
  LANDLOCKED_COUNTRY_IDS,
  MAX_ACTIVE_TERRAIN_TYPES,
  terrainProfileDisplayPercentages,
} from './terrainProfiles';
import { COUNTRIES } from './worldMap';

const TERRAIN_TYPES = new Set<TerrainType>([
  'plains',
  'urban',
  'mountain',
  'desert',
  'jungle',
  'arctic',
  'coastal',
]);

describe('playable country terrain profile catalog', () => {
  it('covers exactly the 166 playable countries', () => {
    const catalogIds = Object.keys(COUNTRY_TERRAIN_PROFILES).sort();
    const playableIds = COUNTRIES.map((country) => country.id).sort();

    expect(catalogIds).toHaveLength(166);
    expect(playableIds).toHaveLength(166);
    expect(catalogIds).toEqual(playableIds);
  });

  it('uses valid, unique, dominant-first shares summing to one', () => {
    for (const [countryId, entries] of Object.entries(COUNTRY_TERRAIN_PROFILES)) {
      expect(entries.length, `${countryId} has no terrain entries`).toBeGreaterThan(0);
      expect(entries.length, `${countryId} exposes more than three active terrains`)
        .toBeLessThanOrEqual(MAX_ACTIVE_TERRAIN_TYPES);
      expect(new Set(entries.map((entry) => entry.terrain)).size,
        `${countryId} repeats a terrain`).toBe(entries.length);
      expect(entries.reduce((sum, entry) => sum + entry.share, 0),
        `${countryId} shares do not sum to one`).toBeCloseTo(1, 9);
      expect(terrainProfileDisplayPercentages(entries).reduce((sum, share) => sum + share, 0),
        `${countryId} displayed percentages do not sum to 100`).toBe(100);

      for (const [index, entry] of entries.entries()) {
        expect(TERRAIN_TYPES.has(entry.terrain),
          `${countryId} uses unknown terrain ${entry.terrain}`).toBe(true);
        expect(entry.share, `${countryId}/${entry.terrain} has a non-positive share`)
          .toBeGreaterThan(0);
        expect(entry.share, `${countryId}/${entry.terrain} exceeds one`)
          .toBeLessThanOrEqual(1);
        if (index > 0) {
          expect(entries[index - 1]!.share,
            `${countryId} is not in dominant-first order`).toBeGreaterThanOrEqual(entry.share);
        }
      }
    }
  });

  it('never assigns coastal terrain to a landlocked playable country', () => {
    expect(LANDLOCKED_COUNTRY_IDS.size).toBe(41);
    for (const countryId of LANDLOCKED_COUNTRY_IDS) {
      const profile = COUNTRY_TERRAIN_PROFILES[countryId];
      expect(profile, `${countryId} is missing from the terrain catalog`).toBeDefined();
      expect(profile!.some((entry) => entry.terrain === 'coastal'),
        `${countryId} is landlocked but has coastal terrain`).toBe(false);
    }
  });

  it('normalizes the three active China terrains without losing its coast', () => {
    expect(COUNTRY_TERRAIN_PROFILES.chn.map((entry) => entry.terrain))
      .toEqual(['plains', 'mountain', 'coastal']);
    expect(COUNTRY_TERRAIN_PROFILES.chn[0]!.share).toBeCloseTo(0.32 / 0.63, 12);
    expect(COUNTRY_TERRAIN_PROFILES.chn[1]!.share).toBeCloseTo(0.24 / 0.63, 12);
    expect(COUNTRY_TERRAIN_PROFILES.chn[2]!.share).toBeCloseTo(0.07 / 0.63, 12);
    expect(terrainProfileDisplayPercentages(COUNTRY_TERRAIN_PROFILES.chn))
      .toEqual([51, 38, 11]);
    expect(COUNTRY_TERRAIN_PROFILES.kaz).toEqual([
      { terrain: 'plains', share: 0.55 },
      { terrain: 'desert', share: 0.30 },
      { terrain: 'mountain', share: 0.15 },
    ]);
  });
});
