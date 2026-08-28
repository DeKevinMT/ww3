import { describe, expect, it } from 'vitest';
import {
  GLOBE_FLAG_OVERLAY_ALPHA,
  GLOBE_NATURAL_BASE_SOURCE_HEIGHT,
  GLOBE_NATURAL_BASE_SOURCE_WIDTH,
  globeFlagOverlayAlpha,
} from './globeNaturalBasePresentation';

describe('globe natural base presentation', () => {
  it('keeps one exact 2:1 close-range source', () => {
    expect(GLOBE_NATURAL_BASE_SOURCE_WIDTH).toBe(4096);
    expect(GLOBE_NATURAL_BASE_SOURCE_HEIGHT).toBe(2048);
    expect(GLOBE_NATURAL_BASE_SOURCE_WIDTH / GLOBE_NATURAL_BASE_SOURCE_HEIGHT).toBe(2);
  });

  it('keeps geography visible under every crisp flag state', () => {
    expect(GLOBE_FLAG_OVERLAY_ALPHA).toEqual({
      regular: 0.50,
      human: 0.60,
      integrating: 0.38,
    });
    expect(globeFlagOverlayAlpha(false, false)).toBe(0.50);
    expect(globeFlagOverlayAlpha(true, false)).toBe(0.60);
    expect(globeFlagOverlayAlpha(true, true)).toBe(0.38);
    expect(GLOBE_FLAG_OVERLAY_ALPHA.integrating)
      .toBeLessThan(GLOBE_FLAG_OVERLAY_ALPHA.regular);
    expect(GLOBE_FLAG_OVERLAY_ALPHA.human).toBeLessThanOrEqual(0.6);
  });
});
