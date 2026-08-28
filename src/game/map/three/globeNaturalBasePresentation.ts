export const GLOBE_NATURAL_BASE_SOURCE_WIDTH = 4096;
export const GLOBE_NATURAL_BASE_SOURCE_HEIGHT = 2048;

export const GLOBE_FLAG_OVERLAY_ALPHA = Object.freeze({
  regular: 0.50,
  human: 0.60,
  integrating: 0.38,
});

/**
 * Flags remain a readable political cue without replacing physical geography.
 * Integrating land deliberately keeps its original flag a little quieter than
 * completed realms; the fixed gold integration treatment supplies lifecycle
 * state without another atlas redraw.
 */
export function globeFlagOverlayAlpha(
  isHuman: boolean,
  integrating: boolean,
): number {
  if (integrating) return GLOBE_FLAG_OVERLAY_ALPHA.integrating;
  return isHuman ? GLOBE_FLAG_OVERLAY_ALPHA.human : GLOBE_FLAG_OVERLAY_ALPHA.regular;
}
