import { describe, expect, it } from 'vitest';
import {
  LOADING_TIPS_V1,
  loadingTipAudienceForModeV1,
  selectLoadingTipV1,
  type LoadingTipAudience,
} from './loadingTips';

describe('loading tips', () => {
  it('keeps a substantial unique pool for every loading context', () => {
    expect(new Set(LOADING_TIPS_V1.map((tip) => tip.id)).size).toBe(LOADING_TIPS_V1.length);
    expect(LOADING_TIPS_V1.length).toBeGreaterThanOrEqual(30);
    for (const audience of ['boot', 'campaign', 'survival', 'alternative-universe'] as const) {
      expect(LOADING_TIPS_V1.filter((tip) => tip.audiences.includes(audience)).length)
        .toBeGreaterThanOrEqual(15);
    }
  });

  it('maps scenario modes to player-facing tip audiences', () => {
    expect(loadingTipAudienceForModeV1('standard-2026')).toBe('campaign');
    expect(loadingTipAudienceForModeV1('survival')).toBe('survival');
    expect(loadingTipAudienceForModeV1('random-world')).toBe('alternative-universe');
  });

  it('describes the normal simulation step as one day', () => {
    const cadence = LOADING_TIPS_V1.find((tip) => tip.id === 'week');
    expect(cadence?.text).toContain('one day');
    expect(cadence?.text).not.toContain('one week');
  });

  it('never immediately repeats a tip when another option exists', () => {
    const audiences: readonly LoadingTipAudience[] = [
      'boot', 'campaign', 'survival', 'alternative-universe',
    ];
    for (const audience of audiences) {
      const first = selectLoadingTipV1(audience, undefined, 0);
      const next = selectLoadingTipV1(audience, first.id, 0);
      expect(next.id).not.toBe(first.id);
    }
  });

  it('clamps unusual random sources safely', () => {
    expect(selectLoadingTipV1('boot', undefined, -10)).toBeDefined();
    expect(selectLoadingTipV1('boot', undefined, 10)).toBeDefined();
    expect(selectLoadingTipV1('boot', undefined, Number.NaN)).toBeDefined();
  });
});
