import { describe, expect, it } from 'vitest';
import type { ResearchAllocationsV2 } from '../sim/v2/types';
import { RESEARCH_BRANCHES_V2, rebalanceResearchMix } from './researchMixer';

const DEFAULT: ResearchAllocationsV2 = {
  'population-recruitment': 15,
  'military-industry': 20,
  'advanced-weapons': 15,
  'defensive-systems': 15,
  'logistics-medicine': 15,
  'economy-science': 20,
};

describe('rebalanceResearchMix', () => {
  it('keeps the named program attached to one keyboard step', () => {
    expect(rebalanceResearchMix(DEFAULT, 'population-recruitment', 16)).toEqual({
      'population-recruitment': 16,
      'military-industry': 20,
      'advanced-weapons': 15,
      'defensive-systems': 15,
      'logistics-medicine': 15,
      'economy-science': 19,
    });
  });

  it.each(RESEARCH_BRANCHES_V2)('changes %s and remains an exact integer 100%% mix', (branch) => {
    const next = rebalanceResearchMix(DEFAULT, branch, DEFAULT[branch] + 1);
    expect(next[branch]).toBe(DEFAULT[branch] + 1);
    expect(RESEARCH_BRANCHES_V2.reduce((sum, item) => sum + next[item], 0)).toBe(100);
    expect(RESEARCH_BRANCHES_V2.every((item) => Number.isInteger(next[item]) && next[item] >= 0)).toBe(true);
  });

  it('recovers deterministically after one program held all attention', () => {
    const concentrated = rebalanceResearchMix(DEFAULT, 'advanced-weapons', 100);
    const relaxed = rebalanceResearchMix(concentrated, 'advanced-weapons', 94);
    expect(relaxed['advanced-weapons']).toBe(94);
    expect(RESEARCH_BRANCHES_V2.reduce((sum, branch) => sum + relaxed[branch], 0)).toBe(100);
    expect(RESEARCH_BRANCHES_V2.filter((branch) => branch !== 'advanced-weapons').every((branch) => relaxed[branch] >= 1)).toBe(true);
  });
});
