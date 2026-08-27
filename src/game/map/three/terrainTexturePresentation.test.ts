import { describe, expect, it } from 'vitest';
import type { TerrainProfileEntry } from '../../data/terrainProfiles';
import { TERRAIN_PRESENTATION } from '../../terrainPresentation';
import { terrainTextureLayerPresentation } from './terrainTexturePresentation';

const profile = (...entries: Array<[TerrainProfileEntry['terrain'], number]>): TerrainProfileEntry[] => (
  entries.map(([terrain, share]) => ({ terrain, share }))
);

describe('terrain texture presentation', () => {
  it('uses only the largest terrain for the fill and the second largest for the border', () => {
    const layers = terrainTextureLayerPresentation(profile(
      ['coastal', 0.12],
      ['desert', 0.58],
      ['mountain', 0.30],
    ));

    expect(layers.tintColor).toBe(TERRAIN_PRESENTATION.desert.color);
    expect(layers.borderColor).toBe(TERRAIN_PRESENTATION.mountain.color);
  });

  it('makes a larger dominant share visibly stronger', () => {
    const moderate = terrainTextureLayerPresentation(profile(
      ['plains', 0.45], ['coastal', 0.30], ['urban', 0.25],
    ));
    const strong = terrainTextureLayerPresentation(profile(
      ['plains', 0.80], ['coastal', 0.12], ['urban', 0.08],
    ));

    expect(strong.tintAlpha).toBeGreaterThan(moderate.tintAlpha);
    expect(strong.tintAlpha - moderate.tintAlpha).toBeGreaterThan(0.06);
    expect(strong.flagTintAlpha).toBeGreaterThan(moderate.flagTintAlpha);
    expect(moderate.flagTintAlpha).toBeCloseTo(0.279, 6);
    expect(strong.flagTintAlpha).toBeCloseTo(0.496, 6);
    expect(strong.flagTintAlpha).toBeLessThanOrEqual(0.62);
  });

  it('makes a larger secondary share visibly stronger without overpowering gameplay cues', () => {
    const small = terrainTextureLayerPresentation(profile(
      ['desert', 0.80], ['mountain', 0.12], ['coastal', 0.08],
    ));
    const large = terrainTextureLayerPresentation(profile(
      ['desert', 0.55], ['mountain', 0.35], ['coastal', 0.10],
    ));

    expect(large.borderAlpha).toBeGreaterThan(small.borderAlpha);
    expect(large.borderAlpha).toBeLessThanOrEqual(0.96);
    expect(small.borderAlpha).toBeGreaterThanOrEqual(0.4);
  });

  it('does not let the third terrain change either map color', () => {
    const jungleThird = terrainTextureLayerPresentation(profile(
      ['urban', 0.60], ['coastal', 0.25], ['jungle', 0.15],
    ));
    const arcticThird = terrainTextureLayerPresentation(profile(
      ['urban', 0.60], ['coastal', 0.25], ['arctic', 0.15],
    ));

    expect(arcticThird.tintColor).toBe(jungleThird.tintColor);
    expect(arcticThird.borderColor).toBe(jungleThird.borderColor);
  });
});
