import type {
  ResearchBranchV2,
  ResearchCategoryV2,
  ResearchDirectionV2,
  ResearchDirectionsV2,
  ResearchEffectV2,
} from './types';

export const RESEARCH_CATEGORIES: readonly ResearchCategoryV2[] = [
  'people',
  'army',
  'combat',
  'sustainment',
  'state',
];

/**
 * Five parallel lanes, each with three authored strategic directions. Stable
 * branch/effect ids keep existing progress, completed levels and commands
 * compatible while the category layer supplies the new portfolio model.
 */
export const RESEARCH_CATEGORY_DIRECTIONS: Readonly<Record<
  ResearchCategoryV2,
  readonly [ResearchDirectionV2, ResearchDirectionV2, ResearchDirectionV2]
>> = Object.freeze({
  people: [
    { branch: 'population-recruitment', effect: 'population-growth' },
    { branch: 'education-intelligence', effect: 'iq-increase' },
    { branch: 'population-recruitment', effect: 'research-speed' },
  ],
  army: [
    { branch: 'reserve-doctrine', effect: 'training' },
    { branch: 'military-industry', effect: 'force-capacity' },
    { branch: 'military-industry', effect: 'reinforcement-efficiency' },
  ],
  combat: [
    { branch: 'advanced-weapons', effect: 'attack' },
    { branch: 'defensive-systems', effect: 'defense' },
    { branch: 'defensive-systems', effect: 'casualty-reduction' },
  ],
  sustainment: [
    { branch: 'logistics-medicine', effect: 'recovery' },
    { branch: 'food-systems', effect: 'supply' },
    { branch: 'food-systems', effect: 'operating-efficiency' },
  ],
  state: [
    { branch: 'economy-science', effect: 'economy-growth' },
    { branch: 'economy-science', effect: 'research-efficiency' },
    { branch: 'public-administration', effect: 'tax-efficiency' },
  ],
});

export function createDefaultResearchDirectionsV2(): ResearchDirectionsV2 {
  return Object.fromEntries(RESEARCH_CATEGORIES.map((category) => [
    category,
    { ...RESEARCH_CATEGORY_DIRECTIONS[category][0] },
  ])) as ResearchDirectionsV2;
}

export function researchCategoryForDirectionV2(
  branch: ResearchBranchV2,
  effect: ResearchEffectV2,
): ResearchCategoryV2 | undefined {
  return RESEARCH_CATEGORIES.find((category) => (
    RESEARCH_CATEGORY_DIRECTIONS[category].some((direction) => (
      direction.branch === branch && direction.effect === effect
    ))
  ));
}

export function researchCategoryForBranchV2(
  branch: ResearchBranchV2,
): ResearchCategoryV2 | undefined {
  return RESEARCH_CATEGORIES.find((category) => (
    RESEARCH_CATEGORY_DIRECTIONS[category].some((direction) => direction.branch === branch)
  ));
}

export function defaultResearchDirectionForBranchV2(
  branch: ResearchBranchV2,
): ResearchDirectionV2 | undefined {
  for (const category of RESEARCH_CATEGORIES) {
    const direction = RESEARCH_CATEGORY_DIRECTIONS[category]
      .find((candidate) => candidate.branch === branch);
    if (direction) return { ...direction };
  }
  return undefined;
}

export function researchDirectionIsValidV2(
  category: ResearchCategoryV2,
  direction: ResearchDirectionV2,
): boolean {
  return RESEARCH_CATEGORY_DIRECTIONS[category].some((candidate) => (
    candidate.branch === direction.branch && candidate.effect === direction.effect
  ));
}

export function cloneResearchDirectionsV2(
  directions: ResearchDirectionsV2,
): ResearchDirectionsV2 {
  return Object.fromEntries(RESEARCH_CATEGORIES.map((category) => [
    category,
    { ...directions[category] },
  ])) as ResearchDirectionsV2;
}
