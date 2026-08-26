import { describe, expect, it } from 'vitest';
import type { TerrainProfileEntry } from './data/terrainProfiles';
import {
  TERRAIN_MAP_VISUAL_TUNING,
  TERRAIN_PRESENTATION,
  terrainMapColor,
  terrainMapFillColor,
} from './terrainPresentation';

const profile = (...entries: Array<[TerrainProfileEntry['terrain'], number]>): TerrainProfileEntry[] => (
  entries.map(([terrain, share]) => ({ terrain, share }))
);

function channel(color: number, shift: number): number {
  return (color >> shift) & 0xff;
}

describe('terrain map presentation', () => {
  it('keeps the stronger map wash below tactical-highlight intensity', () => {
    expect(TERRAIN_MAP_VISUAL_TUNING).toEqual({
      weightedProfileBlend: 0.50,
      nightMix: 0.20,
      fillAlpha: 0.48,
      borderWidth: 1.0,
      borderAlpha: 0.88,
    });
    expect(TERRAIN_MAP_VISUAL_TUNING.fillAlpha).toBeLessThan(0.6);
    expect(TERRAIN_MAP_VISUAL_TUNING.borderWidth).toBeLessThan(1.1);
    expect(TERRAIN_MAP_VISUAL_TUNING.borderAlpha).toBeLessThan(0.92);
  });

  it('preserves a terrain identity while secondary terrain visibly influences the hue', () => {
    const desert = profile(['desert', 1]);
    const desertCoast = profile(['desert', 0.6], ['coastal', 0.4]);

    expect(terrainMapColor(desert)).toBe(TERRAIN_PRESENTATION.desert.color);
    expect(terrainMapColor(desertCoast)).not.toBe(TERRAIN_PRESENTATION.desert.color);
    expect(channel(terrainMapColor(desertCoast), 0))
      .toBeGreaterThan(channel(TERRAIN_PRESENTATION.desert.color, 0));
  });

  it('darkens the terrain fill without flattening different terrain palettes', () => {
    const desertFill = terrainMapFillColor(profile(['desert', 1]));
    const arcticFill = terrainMapFillColor(profile(['arctic', 1]));

    expect(desertFill).not.toBe(arcticFill);
    expect(channel(desertFill, 16)).toBeGreaterThan(channel(arcticFill, 16));
    expect(channel(arcticFill, 8)).toBeGreaterThan(channel(desertFill, 8));
  });
});
