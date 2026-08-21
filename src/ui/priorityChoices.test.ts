import { describe, expect, it } from 'vitest';
import {
  DEVELOPMENT_BRANCHES_V2,
  deriveDevelopmentPriorities,
  deriveFinancePriorities,
  developmentPolicyFromPriorities,
  financePolicyFromPriorities,
  updatePriorityPair,
} from './priorityChoices';

describe('simple country priority choices', () => {
  it('maps two finance choices to one transparent 50/35/15 policy', () => {
    const policy = financePolicyFromPriorities('development', 'military');
    expect(policy).toEqual({ military: 35, research: 15, development: 50 });
    expect(deriveFinancePriorities(policy)).toEqual({ lead: 'development', support: 'military' });
  });

  it('maps two Development choices to 60/40 extra attention while all other branches stay baseline-only', () => {
    const policy = developmentPolicyFromPriorities('advanced-weapons', 'logistics-medicine');
    expect(policy['advanced-weapons']).toBe(60);
    expect(policy['logistics-medicine']).toBe(40);
    expect(DEVELOPMENT_BRANCHES_V2.filter((branch) => !['advanced-weapons', 'logistics-medicine'].includes(branch))
      .every((branch) => policy[branch] === 0)).toBe(true);
    expect(Object.values(policy).reduce((sum, value) => sum + value, 0)).toBe(100);
    expect(deriveDevelopmentPriorities(policy)).toEqual({ lead: 'advanced-weapons', support: 'logistics-medicine' });
  });

  it('swaps occupied priority slots instead of producing duplicate choices', () => {
    const pair = { lead: 'economy-science', support: 'military-industry' } as const;
    expect(updatePriorityPair(pair, 'lead', 'military-industry')).toEqual({
      lead: 'military-industry', support: 'economy-science',
    });
    expect(updatePriorityPair(pair, 'support', 'economy-science')).toEqual({
      lead: 'military-industry', support: 'economy-science',
    });
  });
});
