import { describe, expect, it } from 'vitest';
import worldMapSceneSource from '../game/map/WorldMapScene.ts?raw';
import {
  countryFlagAsset,
  countryFlagAssetUrl,
  countryFlagHtml,
  CUSTOM_FLAG_NATION_IDS,
  DAWNLINE_ACCORD_FLAG_NATION_ID,
} from './countryFlags';

describe('country flag assets', () => {
  it('resolves the Rogue AI nation to its bundled raster flag', () => {
    const asset = countryFlagAsset('rai');
    expect(asset).toBeDefined();
    expect(asset?.loader).toBe('image');
    expect(asset?.url).toContain('rogue-ai-flag.png');
    expect(countryFlagAssetUrl('rai')).toBe(asset?.url);
    expect(CUSTOM_FLAG_NATION_IDS).toContain('rai');
  });

  it('uses the custom flag in DOM presentation and retains normal/fallback flags', () => {
    expect(countryFlagHtml('rai', 'AI', true)).toContain('<img src=');
    expect(countryFlagHtml('rai', 'AI', true)).toContain('loading="eager"');
    expect(countryFlagAsset('bel')?.loader).toBe('svg');
    expect(countryFlagHtml('unknown', '◇')).toBe(
      '<span class="country-flag__fallback">◇</span>',
    );
  });

  it('gives Dawnline one bundled alliance flag distinct from human and Rogue identities', () => {
    const asset = countryFlagAsset(DAWNLINE_ACCORD_FLAG_NATION_ID);
    expect(asset?.loader).toBe('svg');
    expect(asset?.url).toContain('dawnline-accord-flag.svg');
    expect(asset?.url).not.toBe(countryFlagAssetUrl('rai'));
    expect(CUSTOM_FLAG_NATION_IDS).toContain(DAWNLINE_ACCORD_FLAG_NATION_ID);
    expect(countryFlagHtml(DAWNLINE_ACCORD_FLAG_NATION_ID, 'DAWN', true))
      .toContain('<img src=');
  });

  it('preloads custom raster flags with the correct Phaser loader', () => {
    expect(worldMapSceneSource).toContain('...CUSTOM_FLAG_NATION_IDS');
    expect(worldMapSceneSource).toContain("if (asset.loader === 'svg')");
    expect(worldMapSceneSource).toContain('this.load.image(flagTextureKey(nationId), asset.url);');
    expect(worldMapSceneSource).toContain('player(ownerId)?.flagCountryId ?? ownerId');
  });
});
