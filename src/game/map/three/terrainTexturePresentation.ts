import type { TerrainProfileEntry } from '../../data/terrainProfiles';
import { terrainPresentation } from '../../terrainPresentation';

const TERRAIN_TINT_SHARE_ALPHA = 0.36;
const TERRAIN_FLAG_TINT_SHARE_ALPHA = 0.62;
const TERRAIN_BORDER_BASE_ALPHA = 0.26;
const TERRAIN_BORDER_SHARE_ALPHA = 1.60;
const TERRAIN_BORDER_MAX_ALPHA = 0.96;

export interface TerrainTextureLayerPresentation {
  readonly tintColor: number;
  readonly tintAlpha: number;
  readonly flagTintAlpha: number;
  readonly borderColor: number;
  readonly borderAlpha: number;
}

const boundedShare = (share: number): number => Math.max(0, Math.min(1, share));

/**
 * The globe uses one fill hue and one border hue only. Their opacity is tied
 * directly to the corresponding terrain share, so percentages remain visible
 * without stacking several competing color washes over country flags.
 */
export function terrainTextureLayerPresentation(
  profile: readonly TerrainProfileEntry[],
): TerrainTextureLayerPresentation {
  const entries = profile
    .filter((entry) => entry.share > 0)
    .sort((left, right) => right.share - left.share);
  const dominant = entries[0] ?? { terrain: 'plains' as const, share: 1 };
  const secondary = entries[1] ?? dominant;

  return {
    tintColor: terrainPresentation(dominant.terrain).color,
    tintAlpha: boundedShare(dominant.share) * TERRAIN_TINT_SHARE_ALPHA,
    flagTintAlpha: boundedShare(dominant.share) * TERRAIN_FLAG_TINT_SHARE_ALPHA,
    borderColor: terrainPresentation(secondary.terrain).color,
    borderAlpha: Math.min(
      TERRAIN_BORDER_MAX_ALPHA,
      TERRAIN_BORDER_BASE_ALPHA + boundedShare(secondary.share) * TERRAIN_BORDER_SHARE_ALPHA,
    ),
  };
}
