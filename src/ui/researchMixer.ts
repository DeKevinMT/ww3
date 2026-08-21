import type { ResearchAllocationsV2, ResearchBranchV2 } from '../sim/v2/types';

export const RESEARCH_BRANCHES_V2: readonly ResearchBranchV2[] = [
  'population-recruitment',
  'military-industry',
  'advanced-weapons',
  'defensive-systems',
  'logistics-medicine',
  'economy-science',
];

export function sameResearchMix(left: ResearchAllocationsV2, right: ResearchAllocationsV2): boolean {
  return RESEARCH_BRANCHES_V2.every((branch) => left[branch] === right[branch]);
}

function emptyResearchMix(): ResearchAllocationsV2 {
  return {
    'population-recruitment': 0,
    'military-industry': 0,
    'advanced-weapons': 0,
    'defensive-systems': 0,
    'logistics-medicine': 0,
    'economy-science': 0,
  };
}

/**
 * Keeps the changed program at its requested integer percentage and distributes
 * the remainder proportionally over the other five. Largest-remainder rounding
 * makes the result deterministic and exactly 100 without rotating branch names.
 */
export function rebalanceResearchMix(
  current: ResearchAllocationsV2,
  changed: ResearchBranchV2,
  requested: number,
): ResearchAllocationsV2 {
  const desired = Math.max(0, Math.min(100, Math.round(requested)));
  if (current[changed] === desired
    && RESEARCH_BRANCHES_V2.reduce((sum, branch) => sum + current[branch], 0) === 100) {
    return { ...current };
  }

  const remaining = 100 - desired;
  const others = RESEARCH_BRANCHES_V2.filter((branch) => branch !== changed);
  const totalWeight = others.reduce((sum, branch) => sum + Math.max(0, current[branch]), 0);
  const shares = others.map((branch, index) => {
    const raw = totalWeight > 0
      ? remaining * Math.max(0, current[branch]) / totalWeight
      : remaining / others.length;
    const value = Math.floor(raw);
    return { branch, index, value, fraction: raw - value };
  });
  let unassigned = remaining - shares.reduce((sum, share) => sum + share.value, 0);
  for (const share of [...shares].sort((left, right) => right.fraction - left.fraction || left.index - right.index)) {
    if (unassigned <= 0) break;
    share.value += 1;
    unassigned -= 1;
  }

  const next = emptyResearchMix();
  next[changed] = desired;
  for (const share of shares) next[share.branch] = share.value;
  return next;
}
