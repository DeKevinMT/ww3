import type { BudgetDomainV2, BudgetPolicyV2 } from '../sim/v2/types';

export const BUDGET_DOMAINS_V2: readonly BudgetDomainV2[] = ['military', 'research', 'development'];

export function sameBudgetMix(left: BudgetPolicyV2, right: BudgetPolicyV2): boolean {
  return BUDGET_DOMAINS_V2.every((domain) => left[domain] === right[domain]);
}

/**
 * Changes exactly one named allocation and proportionally rebalances the two
 * remaining domains above their 5% floors. The returned object always keeps
 * the public domain names and sums to exactly 100.
 */
export function rebalanceBudgetMix(
  current: BudgetPolicyV2,
  changed: BudgetDomainV2,
  requested: number,
): BudgetPolicyV2 {
  const desired = Math.max(5, Math.min(90, Math.round(requested)));
  const others = BUDGET_DOMAINS_V2.filter((domain) => domain !== changed);
  const firstOther = others[0]!;
  const secondOther = others[1]!;
  const remaining = 100 - desired;
  const firstFlexible = Math.max(0, current[firstOther] - 5);
  const secondFlexible = Math.max(0, current[secondOther] - 5);
  const flexibleTotal = firstFlexible + secondFlexible;
  const distributable = remaining - 10;
  const first = Math.max(5, Math.min(
    remaining - 5,
    5 + (flexibleTotal > 0
      ? Math.round(distributable * firstFlexible / flexibleTotal)
      : Math.floor(distributable / 2)),
  ));

  return {
    military: changed === 'military' ? desired : firstOther === 'military' ? first : remaining - first,
    research: changed === 'research' ? desired : firstOther === 'research' ? first : remaining - first,
    development: changed === 'development' ? desired : firstOther === 'development' ? first : remaining - first,
  };
}
