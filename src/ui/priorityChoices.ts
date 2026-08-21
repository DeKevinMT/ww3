import type {
  BudgetDomainV2,
  BudgetPolicyV2,
  ResearchAllocationsV2,
  ResearchBranchV2,
} from '../sim/v2/types';

export const FINANCE_DOMAINS_V2: readonly BudgetDomainV2[] = ['military', 'research', 'development'];

export const DEVELOPMENT_BRANCHES_V2: readonly ResearchBranchV2[] = [
  'population-recruitment',
  'military-industry',
  'advanced-weapons',
  'defensive-systems',
  'logistics-medicine',
  'economy-science',
];

export interface PriorityPair<T extends string> {
  lead: T;
  support: T;
}

export const FINANCE_PRIORITY_SHARES = { lead: 50, support: 35, maintain: 15 } as const;
export const DEVELOPMENT_PRIORITY_SHARES = { lead: 60, support: 40 } as const;

function distinctPair<T extends string>(choices: readonly T[], lead: T, support: T): PriorityPair<T> {
  if (lead !== support) return { lead, support };
  return { lead, support: choices.find((choice) => choice !== lead) ?? support };
}

export function deriveFinancePriorities(policy: BudgetPolicyV2): PriorityPair<BudgetDomainV2> {
  const ranked = [...FINANCE_DOMAINS_V2].sort((left, right) => (
    policy[right] - policy[left] || FINANCE_DOMAINS_V2.indexOf(left) - FINANCE_DOMAINS_V2.indexOf(right)
  ));
  return { lead: ranked[0]!, support: ranked[1]! };
}

export function financePolicyFromPriorities(
  lead: BudgetDomainV2,
  support: BudgetDomainV2,
): BudgetPolicyV2 {
  const pair = distinctPair(FINANCE_DOMAINS_V2, lead, support);
  const maintain = FINANCE_DOMAINS_V2.find((domain) => domain !== pair.lead && domain !== pair.support)!;
  const policy = { military: 0, research: 0, development: 0 };
  policy[pair.lead] = FINANCE_PRIORITY_SHARES.lead;
  policy[pair.support] = FINANCE_PRIORITY_SHARES.support;
  policy[maintain] = FINANCE_PRIORITY_SHARES.maintain;
  return policy;
}

export function deriveDevelopmentPriorities(
  allocations: ResearchAllocationsV2,
): PriorityPair<ResearchBranchV2> {
  const ranked = [...DEVELOPMENT_BRANCHES_V2].sort((left, right) => (
    allocations[right] - allocations[left]
    || DEVELOPMENT_BRANCHES_V2.indexOf(left) - DEVELOPMENT_BRANCHES_V2.indexOf(right)
  ));
  return { lead: ranked[0]!, support: ranked[1]! };
}

export function developmentPolicyFromPriorities(
  lead: ResearchBranchV2,
  support: ResearchBranchV2,
): ResearchAllocationsV2 {
  const pair = distinctPair(DEVELOPMENT_BRANCHES_V2, lead, support);
  return Object.fromEntries(DEVELOPMENT_BRANCHES_V2.map((branch) => [
    branch,
    branch === pair.lead ? DEVELOPMENT_PRIORITY_SHARES.lead
      : branch === pair.support ? DEVELOPMENT_PRIORITY_SHARES.support : 0,
  ])) as ResearchAllocationsV2;
}

/** Selecting the other occupied slot swaps the two roles instead of rejecting the click. */
export function updatePriorityPair<T extends string>(
  pair: PriorityPair<T>,
  role: keyof PriorityPair<T>,
  choice: T,
): PriorityPair<T> {
  if (role === 'lead') return choice === pair.support
    ? { lead: pair.support, support: pair.lead }
    : { lead: choice, support: pair.support };
  return choice === pair.lead
    ? { lead: pair.support, support: pair.lead }
    : { lead: pair.lead, support: choice };
}
