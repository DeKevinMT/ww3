import { describe, expect, it } from 'vitest';
import type { TerrainProfileEntry } from '../../data/terrainProfiles';
import { TERRAIN_PRESENTATION } from '../../terrainPresentation';
import { terrainTextureLayerPresentation } from './terrainTexturePresentation';

const profile = (...entries: Array<[TerrainProfileEntry['terrain'], number]>): TerrainProfileEntry[] => (
  entries.map(([terrain, share]) => ({ terrain, share }))
);

describe('terrain texture presentation', () => {
  it('blends the two largest terrains for the fill and uses the third for the border', () => {
    const layers = terrainTextureLayerPresentation(profile(
      ['coastal', 0.12],
      ['desert', 0.58],
      ['mountain', 0.30],
    ));

    expect(layers.tintColor).not.toBe(TERRAIN_PRESENTATION.desert.color);
    expect(layers.tintColor).not.toBe(TERRAIN_PRESENTATION.mountain.color);
    expect(layers.borderColor).toBe(TERRAIN_PRESENTATION.coastal.color);
  });

  it('makes a larger dominant share visibly stronger', () => {
    const moderate = terrainTextureLayerPresentation(profile(
      ['plains', 0.45], ['coastal', 0.30], ['urban', 0.25],
    ));
    const strong = terrainTextureLayerPresentation(profile(
      ['plains', 0.80], ['coastal', 0.12], ['urban', 0.08],
    ));

    expect(strong.tintAlpha).toBeGreaterThan(moderate.tintAlpha);
    expect(strong.tintAlpha - moderate.tintAlpha).toBeGreaterThan(0.005);
    expect(strong.tintAlpha).toBeLessThanOrEqual(0.055);
    expect(layersHaveNoSecondFlagTint(strong)).toBe(true);
  });

  it('makes a larger secondary share visibly stronger without overpowering gameplay cues', () => {
    const small = terrainTextureLayerPresentation(profile(
      ['desert', 0.80], ['mountain', 0.12], ['coastal', 0.08],
    ));
    const large = terrainTextureLayerPresentation(profile(
      ['desert', 0.55], ['mountain', 0.35], ['coastal', 0.10],
    ));

    expect(large.borderAlpha).toBeGreaterThan(small.borderAlpha);
    expect(large.borderAlpha).toBeLessThanOrEqual(0.88);
    expect(small.borderAlpha).toBeGreaterThanOrEqual(0.4);
  });

  it('lets the third terrain change the border without changing the top-two fill', () => {
    const jungleThird = terrainTextureLayerPresentation(profile(
      ['urban', 0.60], ['coastal', 0.25], ['jungle', 0.15],
    ));
    const arcticThird = terrainTextureLayerPresentation(profile(
      ['urban', 0.60], ['coastal', 0.25], ['arctic', 0.15],
    ));

    expect(arcticThird.tintColor).toBe(jungleThird.tintColor);
    expect(arcticThird.borderColor).not.toBe(jungleThird.borderColor);
    expect(jungleThird.borderColor).toBe(TERRAIN_PRESENTATION.jungle.color);
    expect(arcticThird.borderColor).toBe(TERRAIN_PRESENTATION.arctic.color);
  });

  it('gives mountain-heavy profiles a stronger but bounded terrain wash', () => {
    const plains = terrainTextureLayerPresentation(profile(
      ['plains', 0.60], ['coastal', 0.25], ['urban', 0.15],
    ));
    const mountain = terrainTextureLayerPresentation(profile(
      ['mountain', 0.60], ['coastal', 0.25], ['urban', 0.15],
    ));

    expect(mountain.tintAlpha).toBeGreaterThan(plains.tintAlpha);
    expect(mountain.tintAlpha).toBeLessThanOrEqual(0.055);
  });
});

function layersHaveNoSecondFlagTint(layers: ReturnType<typeof terrainTextureLayerPresentation>): boolean {
  return !('flagTintAlpha' in layers);
}
