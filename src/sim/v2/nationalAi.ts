import type {
  BudgetDomainV2,
  BudgetPolicyV2,
  NationalAiModeV2,
  NationalAiPlanV2,
  ResearchAllocationsV2,
  ResearchBranchV2,
} from './types';
import {
  AI_HEALTHY_ARMY_TARGET,
  FOOD_DEVELOPMENT_PAUSE_COVERAGE,
  FOOD_DEVELOPMENT_PAUSE_CRITICAL_RESERVE_WEEKS,
  FOOD_DEVELOPMENT_PAUSE_DRAIN_SHARE,
  FOOD_DEVELOPMENT_PAUSE_RESERVE_WEEKS,
  NATIONAL_AI_ALLOCATION_STEP_MAX,
  NATIONAL_AI_ALLOCATION_STEP_MIN,
  NATIONAL_AI_EFFICIENCY_PER_IQ_POINT,
  NATIONAL_AI_PEACE_FREE_CASHFLOW_SHARE_MAX,
  NATIONAL_AI_PEACE_FREE_CASHFLOW_SHARE_MIN,
  NATIONAL_AI_PEACE_RESERVE_WEEKS,
  NATIONAL_AI_RESERVE_IQ_MULTIPLIER_MAX,
  NATIONAL_AI_RESERVE_IQ_MULTIPLIER_MIN,
  NATIONAL_AI_WAR_BASE_RUNWAY_WEEKS,
  NATIONAL_AI_WAR_FREE_CASHFLOW_SHARE_MAX,
  NATIONAL_AI_WAR_FREE_CASHFLOW_SHARE_MIN,
  NATIONAL_AI_WAR_FRONT_RUNWAY_WEEKS,
  NATIONAL_IQ_SCORE_MAX,
  NATIONAL_IQ_SCORE_MIN,
  NATIONAL_IQ_SCORE_NEUTRAL,
  RESEARCH_BRANCHES,
} from './balance';

const DOMAINS: readonly BudgetDomainV2[] = ['military', 'research', 'development'];
const MIN_ACTIVE_SHARE = 10;
const MAX_ACTIVE_SHARE = 70;

export interface NationalAiInputsV2 {
  intent: BudgetPolicyV2;
  activeWars: number;
  fillRatio: number;
  averageCondition: number;
  researchGap: number;
  treasuryWeeks: number;
  /** Last week's actually supplied share of national food demand. */
  foodSecurity?: number;
  /** Live annual population change after food, condition and war pressure. */
  populationGrowthRate?: number;
  /** Current strategic food stock measured in weeks of national demand. */
  foodReserveWeeks?: number;
  /** National IQ is the sole skill input for the shared country AI. */
  iqScore: number;
}

export interface FoodDevelopmentRedirectInputsV2 {
  baseBudget: BudgetPolicyV2;
  plannedDevelopment: number;
  foodFundingGap: number;
  foodCoverage: number;
  foodReserveWeeks: number;
  foodStockChange: number;
  foodDemand: number;
  iqScore: number;
}

export interface FoodDevelopmentRedirectV2 {
  activeBudget: BudgetPolicyV2;
  development: number;
  transfer: number;
}

export interface NationalAiTreasuryPolicyV2 {
  /** Target liquid treasury measured in ordinary weekly tax revenue. */
  reserveWeeks: number;
  /** Share of otherwise discretionary weekly cash retained in the treasury. */
  freeCashflowShare: number;
}

function normalizePolicy(source: BudgetPolicyV2): BudgetPolicyV2 {
  const result: BudgetPolicyV2 = {
    military: Math.max(MIN_ACTIVE_SHARE, Math.min(MAX_ACTIVE_SHARE, Math.round(source.military))),
    research: Math.max(MIN_ACTIVE_SHARE, Math.min(MAX_ACTIVE_SHARE, Math.round(source.research))),
    development: Math.max(MIN_ACTIVE_SHARE, Math.min(MAX_ACTIVE_SHARE, Math.round(source.development))),
  };
  while (result.military + result.research + result.development !== 100) {
    const sum = result.military + result.research + result.development;
    const direction = sum < 100 ? 1 : -1;
    const candidate = [...DOMAINS]
      .filter((domain) => direction > 0 ? result[domain] < MAX_ACTIVE_SHARE : result[domain] > MIN_ACTIVE_SHARE)
      .sort((left, right) => direction > 0
        ? source[right] - source[left] || left.localeCompare(right)
        : result[right] - result[left] || left.localeCompare(right))[0];
    if (!candidate) break;
    result[candidate] += direction;
  }
  return result;
}

function boost(
  policy: BudgetPolicyV2,
  domain: BudgetDomainV2,
  requested: number,
  protectedMilitary = MIN_ACTIVE_SHARE,
): void {
  let remaining = Math.max(0, Math.min(Math.round(requested), MAX_ACTIVE_SHARE - policy[domain]));
  while (remaining > 0) {
    const donor = DOMAINS.filter((candidate) => {
      const protectedMinimum = candidate === 'military' ? protectedMilitary : MIN_ACTIVE_SHARE;
      return candidate !== domain && policy[candidate] > protectedMinimum;
    })
      .sort((left, right) => policy[right] - policy[left] || left.localeCompare(right))[0];
    if (!donor) break;
    policy[donor] -= 1;
    policy[domain] += 1;
    remaining -= 1;
  }
}

function normalizedIqV2(iqScore: number): number {
  return Math.max(0, Math.min(1,
    (iqScore - NATIONAL_IQ_SCORE_MIN) / (NATIONAL_IQ_SCORE_MAX - NATIONAL_IQ_SCORE_MIN),
  ));
}

/**
 * One modest execution multiplier shared by every country. National IQ is the
 * only skill input; selecting a country never changes its value.
 */
export function nationalAiEfficiencyV2(iqScore: number): number {
  const bounded = Math.max(NATIONAL_IQ_SCORE_MIN, Math.min(NATIONAL_IQ_SCORE_MAX, iqScore));
  return 1 + (bounded - NATIONAL_IQ_SCORE_NEUTRAL) * NATIONAL_AI_EFFICIENCY_PER_IQ_POINT;
}

/**
 * One shared, selection-independent treasury policy. Higher-IQ administrations
 * preserve a modestly deeper emergency buffer and retain free cash a little
 * more consistently; they never receive additional money or cheaper rules.
 */
export function nationalAiTreasuryPolicyV2(
  iqScore: number,
  activeWars: number,
  economyScale = 0,
): NationalAiTreasuryPolicyV2 {
  const decisionQuality = normalizedIqV2(iqScore);
  const reserveIqMultiplier = NATIONAL_AI_RESERVE_IQ_MULTIPLIER_MIN
    + (NATIONAL_AI_RESERVE_IQ_MULTIPLIER_MAX
      - NATIONAL_AI_RESERVE_IQ_MULTIPLIER_MIN) * decisionQuality;
  const atWar = activeWars > 0;
  const baseReserveWeeks = atWar
    ? NATIONAL_AI_WAR_BASE_RUNWAY_WEEKS
      + Math.max(0, activeWars) * NATIONAL_AI_WAR_FRONT_RUNWAY_WEEKS
    : NATIONAL_AI_PEACE_RESERVE_WEEKS;
  // Large economies still target slightly fewer weeks because each week is an
  // enormous absolute war chest. The damping is deliberately much smaller
  // than before so free cash remains a meaningful emergency reserve.
  const sizeMultiplier = atWar ? 1 : 1 - 0.15 * Math.max(0, Math.min(1, economyScale));
  const minimumFreeCashflow = atWar
    ? NATIONAL_AI_WAR_FREE_CASHFLOW_SHARE_MIN
    : NATIONAL_AI_PEACE_FREE_CASHFLOW_SHARE_MIN;
  const maximumFreeCashflow = atWar
    ? NATIONAL_AI_WAR_FREE_CASHFLOW_SHARE_MAX
    : NATIONAL_AI_PEACE_FREE_CASHFLOW_SHARE_MAX;
  return {
    reserveWeeks: baseReserveWeeks * reserveIqMultiplier * sizeMultiplier,
    freeCashflowShare: minimumFreeCashflow
      + (maximumFreeCashflow - minimumFreeCashflow) * decisionQuality,
  };
}

/**
 * Each eight-week review can move only a few percentage points. Higher-IQ
 * administrations react a little faster, but even the top score is capped.
 */
export function nationalAiAllocationStepLimitV2(iqScore: number): number {
  return Math.round(NATIONAL_AI_ALLOCATION_STEP_MIN
    + (NATIONAL_AI_ALLOCATION_STEP_MAX - NATIONAL_AI_ALLOCATION_STEP_MIN) * normalizedIqV2(iqScore));
}

function moveAllocationTowardTargetV2<K extends string>(
  current: Readonly<Record<K, number>>,
  target: Readonly<Record<K, number>>,
  keys: readonly K[],
  iqScore: number,
): Record<K, number> {
  const next = { ...current } as Record<K, number>;
  let remaining = nationalAiAllocationStepLimitV2(iqScore);
  while (remaining > 0) {
    const receiver = [...keys].filter((key) => next[key] < target[key])
      .sort((left, right) => target[right] - next[right] - (target[left] - next[left])
        || left.localeCompare(right))[0];
    const donor = [...keys].filter((key) => next[key] > target[key])
      .sort((left, right) => next[right] - target[right] - (next[left] - target[left])
        || left.localeCompare(right))[0];
    if (!receiver || !donor) break;
    next[receiver] += 1;
    next[donor] -= 1;
    remaining -= 1;
  }
  return next;
}

export function moveBudgetTowardTargetV2(
  current: BudgetPolicyV2,
  target: BudgetPolicyV2,
  iqScore: number,
): BudgetPolicyV2 {
  return moveAllocationTowardTargetV2(current, target, DOMAINS, iqScore) as BudgetPolicyV2;
}

export function moveResearchTowardTargetV2(
  current: ResearchAllocationsV2,
  target: ResearchAllocationsV2,
  iqScore: number,
): ResearchAllocationsV2 {
  return moveAllocationTowardTargetV2(
    current,
    target,
    RESEARCH_BRANCHES as readonly ResearchBranchV2[],
    iqScore,
  ) as ResearchAllocationsV2;
}

/**
 * Last-resort food funding, shared by every country. This does not rewrite the
 * stored policy or take money from research: it can only pause Development to
 * cover an immediate food gap, with a modest IQ-scaled response.
 */
export function redirectDevelopmentFundingToFoodV2(
  inputs: FoodDevelopmentRedirectInputsV2,
): FoodDevelopmentRedirectV2 {
  const plannedDevelopment = Math.max(0, inputs.plannedDevelopment);
  const fundingGap = Math.max(0, inputs.foodFundingGap);
  // Emergency food support ramps with the depth of the shortage. The former
  // boolean thresholds could move almost the entire Development line after a
  // tiny one-week coverage change, producing a visible cost cliff.
  const coverageStress = Math.max(0, Math.min(1,
    (FOOD_DEVELOPMENT_PAUSE_COVERAGE - inputs.foodCoverage)
      / Math.max(0.01, FOOD_DEVELOPMENT_PAUSE_COVERAGE - 0.40),
  ));
  const drainShare = Math.max(0, -inputs.foodStockChange)
    / Math.max(0.000001, inputs.foodDemand);
  const drainStress = Math.max(0, Math.min(1,
    (drainShare - FOOD_DEVELOPMENT_PAUSE_DRAIN_SHARE) / 0.20,
  ));
  const reserveStress = Math.max(0, Math.min(1,
    (FOOD_DEVELOPMENT_PAUSE_RESERVE_WEEKS - inputs.foodReserveWeeks)
      / Math.max(
        0.01,
        FOOD_DEVELOPMENT_PAUSE_RESERVE_WEEKS
          - FOOD_DEVELOPMENT_PAUSE_CRITICAL_RESERVE_WEEKS,
      ),
  )) * drainStress;
  const criticalReserveStress = Math.max(0, Math.min(1,
    (FOOD_DEVELOPMENT_PAUSE_CRITICAL_RESERVE_WEEKS - inputs.foodReserveWeeks)
      / Math.max(0.01, FOOD_DEVELOPMENT_PAUSE_CRITICAL_RESERVE_WEEKS),
  ));
  const urgency = Math.max(coverageStress, reserveStress, criticalReserveStress);
  const response = 0.75 + 0.25 * normalizedIqV2(inputs.iqScore);
  const transfer = fundingGap > 0.0000001
    ? Math.min(plannedDevelopment, fundingGap) * response * urgency
    : 0;
  const development = Math.max(0, plannedDevelopment - transfer);
  const developmentShare = plannedDevelopment > 0
    ? inputs.baseBudget.development * development / plannedDevelopment
    : 0;
  return {
    activeBudget: {
      ...inputs.baseBudget,
      development: developmentShare,
    },
    development,
    transfer,
  };
}

/**
 * Turns national conditions into a target plan. Every country runs this exact
 * planner; national IQ only affects execution efficiency and how many points
 * it can move toward the target at an eight-week review.
 */
export function optimizeNationalAiPlanV2(inputs: NationalAiInputsV2): NationalAiPlanV2 {
  const activeBudget = normalizePolicy(inputs.intent);
  let mode: NationalAiModeV2 = 'growth';
  let explanation = 'Following the national priorities through the shared AI planner.';
  const foodStress = Math.max(0, Math.min(1, (0.98 - (inputs.foodSecurity ?? 1)) / 0.58));
  const populationStress = Math.max(0, Math.min(1, -(inputs.populationGrowthRate ?? 0) / 0.02));
  const reserveStress = Math.max(0, Math.min(1, (2 - (inputs.foodReserveWeeks ?? 6)) / 2));
  const survivalStress = Math.max(foodStress, populationStress, reserveStress);
  const survivalEmergency = inputs.activeWars === 0
    && (foodStress > 0.02 || populationStress > 0 || reserveStress > 0 || inputs.treasuryWeeks < 0);

  if (inputs.activeWars > 0) {
    mode = 'war';
    const targetRunway = nationalAiTreasuryPolicyV2(
      inputs.iqScore,
      inputs.activeWars,
    ).reserveWeeks;
    explanation = inputs.treasuryWeeks < targetRunway
      ? 'Emergency war economy: protecting payroll and rebuilding cash runway.'
      : inputs.fillRatio < 0.58
        ? 'Protecting army payroll and replacing severe battlefield losses.'
        : 'Funding every live front while preserving essential growth.';
    boost(activeBudget, 'military', 16 + 8 * (inputs.activeWars - 1) + 14 * (1 - inputs.fillRatio), 38);
    if (inputs.treasuryWeeks < targetRunway) {
      // Development is the only finite-budget route that repairs the wartime
      // tax base; blindly pushing every last point into the army caused AI
      // countries to win a front and still bankrupt the nation.
      boost(activeBudget, 'development', 8 + 3 * inputs.activeWars, 50);
    }
    if (foodStress > 0.05 || populationStress > 0) {
      boost(activeBudget, 'development', 6 + 12 * survivalStress, 50);
      explanation = 'War economy: the army comes first while essential food and population systems stay funded.';
    }
  } else if (survivalEmergency) {
    mode = 'recovery';
    explanation = foodStress > 0.15 || reserveStress > 0.35
      ? 'Survival first: restoring food supply and reserves before expanding the army.'
      : populationStress > 0
        ? 'Population recovery: stabilizing food, health and living conditions before military growth.'
        : 'Debt recovery: protecting essential services and rebuilding a positive treasury.';
    boost(activeBudget, 'development', 18 + 30 * survivalStress);
    boost(activeBudget, 'research', 4 + 8 * Math.max(foodStress, populationStress));
    if (inputs.fillRatio < AI_HEALTHY_ARMY_TARGET - 0.005) {
      explanation += ' Existing forces stay mobilized; recruitment resumes as soon as the crisis permits.';
    }
  } else if (inputs.fillRatio < AI_HEALTHY_ARMY_TARGET - 0.005) {
    mode = 'rebuild';
    explanation = 'Training manpower gradually toward the full population-based army cap.';
    boost(activeBudget, 'military', 12 + 18 * (1 - inputs.fillRatio));
  } else if (inputs.averageCondition < 0.72 || inputs.treasuryWeeks < 2) {
    mode = 'recovery';
    explanation = 'Repairing territory and strengthening the revenue base.';
    boost(activeBudget, 'development', 10 + 16 * (1 - inputs.averageCondition));
  } else if (inputs.researchGap >= 4) {
    mode = 'catch-up';
    explanation = 'Closing the technology gap without abandoning the chosen route.';
    boost(activeBudget, 'research', Math.min(16, 6 + inputs.researchGap));
  }

  // Secondary corrections make the plan proactive without creating another
  // user-facing management layer.
  if (!survivalEmergency && inputs.fillRatio < AI_HEALTHY_ARMY_TARGET - 0.005) {
    boost(activeBudget, 'military', 5);
  }
  if (!survivalEmergency && inputs.averageCondition < 0.82) boost(activeBudget, 'development', 4);
  if (!survivalEmergency && inputs.researchGap >= 7) boost(activeBudget, 'research', 4);

  // Food crises redirect real, finite appropriations instead of granting free
  // supply. Development funds domestic capacity now; research funds the
  // economy/logistics portfolio that raises access and efficiency over time.
  if (foodStress > 0 && !survivalEmergency && inputs.activeWars === 0) {
    boost(activeBudget, 'development', 6 + 18 * foodStress);
    boost(activeBudget, 'research', 3 + 8 * foodStress);
  }

  return {
    mode,
    activeBudget,
    efficiency: nationalAiEfficiencyV2(inputs.iqScore),
    explanation,
  };
}
