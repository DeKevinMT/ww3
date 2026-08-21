import { describe, expect, it } from 'vitest';
import type { BudgetDomainV2, BudgetPolicyV2 } from '../sim/v2/types';
import { BUDGET_DOMAINS_V2, rebalanceBudgetMix } from './budgetMixer';

const DEFAULT: BudgetPolicyV2 = { military: 40, research: 25, development: 35 };

describe('rebalanceBudgetMix', () => {
  it('keeps Armed Forces bound to military after one keyboard step', () => {
    expect(rebalanceBudgetMix(DEFAULT, 'military', 41)).toEqual({
      military: 41,
      research: 25,
      development: 34,
    });
  });

  it.each(BUDGET_DOMAINS_V2)('changes only the requested value for %s and stays valid', (domain) => {
    const next = rebalanceBudgetMix(DEFAULT, domain, DEFAULT[domain] + 1);
    expect(next[domain]).toBe(DEFAULT[domain] + 1);
    expect(Object.values(next).reduce((sum, value) => sum + value, 0)).toBe(100);
    expect(Object.values(next).every((value) => Number.isInteger(value) && value >= 5 && value <= 90)).toBe(true);
  });

  it('preserves domain identity across a sequence of edits', () => {
    const edits: Array<[BudgetDomainV2, number]> = [
      ['military', 55],
      ['research', 30],
      ['development', 20],
    ];
    const next = edits.reduce((mix, [domain, value]) => rebalanceBudgetMix(mix, domain, value), DEFAULT);
    expect(next.development).toBe(20);
    expect(next.military + next.research + next.development).toBe(100);
  });
});
