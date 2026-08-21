import { describe, expect, it } from 'vitest';
import {
  campaignStrategicVariationV2,
  geopoliticalTargetGuidanceV2,
  strategicAlignmentScoreV2,
  strategicInterestScoreV2,
} from './geopolitics';
import { nationIdV2 } from './types';

describe('V2 soft geopolitical guidance', () => {
  it('guides Russia toward former Soviet space without creating a hard order', () => {
    expect(strategicInterestScoreV2(nationIdV2('rus'), nationIdV2('geo'))).toBeGreaterThan(0);
    expect(strategicInterestScoreV2(nationIdV2('rus'), nationIdV2('kaz'))).toBeGreaterThan(0);
    expect(strategicInterestScoreV2(nationIdV2('rus'), nationIdV2('bra'))).toBe(0);
    expect(geopoliticalTargetGuidanceV2(nationIdV2('rus'), nationIdV2('blr'))).toBeLessThan(0);
  });

  it('makes Taiwan Chinas strongest regional interest', () => {
    const china = nationIdV2('chn');
    const taiwan = strategicInterestScoreV2(china, nationIdV2('twn'));
    expect(taiwan).toBeGreaterThan(strategicInterestScoreV2(china, nationIdV2('vnm')));
    expect(taiwan).toBeGreaterThan(strategicInterestScoreV2(china, nationIdV2('jpn')));
  });

  it('targets the US Greenland interest at Greenland rather than Denmark', () => {
    expect(strategicInterestScoreV2(nationIdV2('usa'), nationIdV2('grl'))).toBeGreaterThan(15);
    expect(strategicInterestScoreV2(nationIdV2('usa'), nationIdV2('dnk'))).toBe(0);
  });

  it('keeps Korean tension and the North Korea-Russia alignment directional but soft', () => {
    expect(strategicInterestScoreV2(nationIdV2('prk'), nationIdV2('kor'))).toBeGreaterThan(20);
    expect(strategicInterestScoreV2(nationIdV2('kor'), nationIdV2('prk'))).toBeGreaterThan(15);
    expect(strategicAlignmentScoreV2(nationIdV2('prk'), nationIdV2('rus'))).toBeGreaterThan(10);
    expect(geopoliticalTargetGuidanceV2(nationIdV2('prk'), nationIdV2('rus'))).toBeLessThan(0);
  });

  it('varies strategic choices between campaigns but reproduces an identical seed', () => {
    const china = nationIdV2('chn');
    const taiwan = nationIdV2('twn');
    const repeated = campaignStrategicVariationV2(91, 104, china, taiwan);
    expect(campaignStrategicVariationV2(91, 104, china, taiwan)).toBe(repeated);
    const campaignValues = new Set(Array.from({ length: 12 }, (_, seed) => (
      campaignStrategicVariationV2(seed + 1, 104, china, taiwan).toFixed(4)
    )));
    expect(campaignValues.size).toBeGreaterThanOrEqual(10);
    expect([...campaignValues].some((value) => Number(value) < 0)).toBe(true);
    expect([...campaignValues].some((value) => Number(value) > 0)).toBe(true);
  });
});
