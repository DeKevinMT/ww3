import type { TerrainProfileEntry } from '../../data/terrainProfiles';
import { terrainPresentation } from '../../terrainPresentation';

const TERRAIN_TINT_TOP_TWO_ALPHA = 0.04;
const TERRAIN_TINT_MOUNTAIN_ALPHA = 0.015;
const TERRAIN_TINT_MAX_ALPHA = 0.055;
const TERRAIN_SURFACE_NIGHT_COLOR = 0x07151c;
const TERRAIN_SURFACE_NIGHT_MIX = 0.12;
const TERRAIN_BORDER_BASE_ALPHA = 0.26;
const TERRAIN_BORDER_SHARE_ALPHA = 1.75;
const TERRAIN_BORDER_MOUNTAIN_ALPHA = 0.14;
const TERRAIN_BORDER_MAX_ALPHA = 0.88;

export interface TerrainTextureLayerPresentation {
  readonly tintColor: number;
  readonly tintAlpha: number;
  readonly borderColor: number;
  readonly borderAlpha: number;
}

const boundedShare = (share: number): number => Math.max(0, Math.min(1, share));

function blendedColor(
  firstColor: number,
  secondColor: number,
  firstWeight: number,
  secondWeight: number,
): number {
  const total = Math.max(0.000001, firstWeight + secondWeight);
  const channel = (shift: number) => Math.round(
    (((firstColor >> shift) & 0xff) * firstWeight
      + ((secondColor >> shift) & 0xff) * secondWeight) / total,
  );
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/**
 * The globe uses one blended fill hue and one border hue only. The fill mixes
 * the two dominant physical terrains; the third terrain owns the border. A
 * bounded mountain emphasis keeps rugged countries readable without adding
 * another texture or draw call.
 */
export function terrainTextureLayerPresentation(
  profile: readonly TerrainProfileEntry[],
): TerrainTextureLayerPresentation {
  const entries = profile
    .filter((entry) => entry.share > 0)
    .sort((left, right) => right.share - left.share);
  const dominant = entries[0] ?? { terrain: 'plains' as const, share: 1 };
  const secondary = entries[1] ?? dominant;
  const tertiary = entries[2] ?? secondary;
  const mountainShare = boundedShare(
    entries.find((entry) => entry.terrain === 'mountain')?.share ?? 0,
  );
  const dominantWeight = boundedShare(dominant.share)
    * (dominant.terrain === 'mountain' ? 1.35 : 1);
  const secondaryWeight = entries[1]
    ? boundedShare(secondary.share) * (secondary.terrain === 'mountain' ? 1.35 : 1)
    : 0;
  const topTwoShare = boundedShare(
    boundedShare(dominant.share) + (entries[1] ? boundedShare(secondary.share) : 0),
  );

  const topTwoColor = blendedColor(
      terrainPresentation(dominant.terrain).color,
      terrainPresentation(secondary.terrain).color,
      dominantWeight,
      secondaryWeight,
  );

  return {
    tintColor: blendedColor(
      topTwoColor,
      TERRAIN_SURFACE_NIGHT_COLOR,
      1 - TERRAIN_SURFACE_NIGHT_MIX,
      TERRAIN_SURFACE_NIGHT_MIX,
    ),
    tintAlpha: Math.min(
      TERRAIN_TINT_MAX_ALPHA,
      topTwoShare * TERRAIN_TINT_TOP_TWO_ALPHA
        + mountainShare * TERRAIN_TINT_MOUNTAIN_ALPHA,
    ),
    borderColor: terrainPresentation(tertiary.terrain).color,
    borderAlpha: Math.min(
      TERRAIN_BORDER_MAX_ALPHA,
      TERRAIN_BORDER_BASE_ALPHA + boundedShare(tertiary.share) * TERRAIN_BORDER_SHARE_ALPHA
        + (tertiary.terrain === 'mountain' ? TERRAIN_BORDER_MOUNTAIN_ALPHA : 0),
    ),
  };
}
