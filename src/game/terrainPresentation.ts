import type { TerrainType } from './types';
import type { TerrainProfileEntry } from './data/terrainProfiles';

export interface TerrainPresentation {
  readonly label: string;
  readonly glyph: string;
  readonly color: number;
  readonly cssColor: string;
}

/**
 * Cartographic terrain tuning for the world map.
 *
 * The fill is deliberately stronger than the original quiet wash, while
 * remaining below the brighter human, selection, war and integration cues.
 */
export const TERRAIN_MAP_VISUAL_TUNING = Object.freeze({
  weightedProfileBlend: 0.50,
  nightMix: 0.20,
  fillAlpha: 0.48,
  borderWidth: 1.0,
  borderAlpha: 0.88,
});

const TERRAIN_MAP_NIGHT_COLOR = 0x071521;

/** Quiet cartographic colors shared by the map tint and contextual UI. */
export const TERRAIN_PRESENTATION: Readonly<Record<TerrainType, TerrainPresentation>> = Object.freeze({
  plains: Object.freeze({ label: 'Plains', glyph: '≋', color: 0x9bc67b, cssColor: '#9bc67b' }),
  urban: Object.freeze({ label: 'Urban', glyph: '▦', color: 0x9fb8c6, cssColor: '#9fb8c6' }),
  mountain: Object.freeze({ label: 'Mountain', glyph: '▲', color: 0xb5a9c8, cssColor: '#b5a9c8' }),
  desert: Object.freeze({ label: 'Desert', glyph: '◌', color: 0xd6ad68, cssColor: '#d6ad68' }),
  jungle: Object.freeze({ label: 'Jungle', glyph: '◆', color: 0x63b083, cssColor: '#63b083' }),
  arctic: Object.freeze({ label: 'Arctic', glyph: '✦', color: 0xa9e3ed, cssColor: '#a9e3ed' }),
  coastal: Object.freeze({ label: 'Coastal', glyph: '≈', color: 0x64b4d4, cssColor: '#64b4d4' }),
});

export function terrainPresentation(type: TerrainType): TerrainPresentation {
  return TERRAIN_PRESENTATION[type];
}

/** Weighted map color for a multi-terrain country profile. */
export function terrainProfileColor(profile: readonly TerrainProfileEntry[]): number {
  if (profile.length === 0) return TERRAIN_PRESENTATION.plains.color;
  let red = 0;
  let green = 0;
  let blue = 0;
  let total = 0;
  for (const entry of profile) {
    const color = terrainPresentation(entry.terrain).color;
    red += ((color >> 16) & 0xff) * entry.share;
    green += ((color >> 8) & 0xff) * entry.share;
    blue += (color & 0xff) * entry.share;
    total += entry.share;
  }
  const divisor = Math.max(0.000001, total);
  return (Math.round(red / divisor) << 16)
    | (Math.round(green / divisor) << 8)
    | Math.round(blue / divisor);
}

export function terrainProfileCssColor(profile: readonly TerrainProfileEntry[]): string {
  return `#${terrainProfileColor(profile).toString(16).padStart(6, '0')}`;
}

function mixColor(color: number, target: number, amount: number): number {
  const red = ((color >> 16) & 0xff) * (1 - amount) + ((target >> 16) & 0xff) * amount;
  const green = ((color >> 8) & 0xff) * (1 - amount) + ((target >> 8) & 0xff) * amount;
  const blue = (color & 0xff) * (1 - amount) + (target & 0xff) * amount;
  return (Math.round(red) << 16) | (Math.round(green) << 8) | Math.round(blue);
}

/** Strong but still restrained terrain hue used for ordinary country borders. */
export function terrainMapColor(profile: readonly TerrainProfileEntry[]): number {
  const dominant = terrainPresentation(profile[0]?.terrain ?? 'plains').color;
  return mixColor(dominant, terrainProfileColor(profile), TERRAIN_MAP_VISUAL_TUNING.weightedProfileBlend);
}

/** Darkened terrain fill used below labels and tactical overlays. */
export function terrainMapFillColor(profile: readonly TerrainProfileEntry[]): number {
  return mixColor(terrainMapColor(profile), TERRAIN_MAP_NIGHT_COLOR, TERRAIN_MAP_VISUAL_TUNING.nightMix);
}
