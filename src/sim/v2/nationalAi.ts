import type {
  BudgetDomainV2,
  BudgetPolicyV2,
  NationalAiModeV2,
  NationalAiPlanV2,
} from './types';
import {
  AI_CRISIS_DEFENSIVE_ARMY_FLOOR,
  AI_HEALTHY_ARMY_TARGET,
  AI_PEACE_DEFENSIVE_ARMY_FLOOR,
  AI_SEVERE_DEBT_REVENUE_WEEKS,
  SUPER_AI_EFFICIENCY,
  SUPER_AI_RESPONSIVENESS,
  SUPER_AI_WAR_BASE_RUNWAY_WEEKS,
  SUPER_AI_WAR_FRONT_RUNWAY_WEEKS,
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
  superAi: boolean;
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

export function nationalAiEfficiencyV2(superAi: boolean): number {
  return superAi ? SUPER_AI_EFFICIENCY : 1;
}

/**
 * Turns national conditions into a live weekly plan. The selected country's
 * APEX intelligence reacts more decisively while obeying the same treasury,
 * manpower and research rules as every rival.
 */
export function optimizeNationalAiPlanV2(inputs: NationalAiInputsV2): NationalAiPlanV2 {
  const activeBudget = normalizePolicy(inputs.intent);
  const responsiveness = inputs.superAi ? SUPER_AI_RESPONSIVENESS : 1;
  let mode: NationalAiModeV2 = 'growth';
  let explanation = 'Compounding the selected national priorities.';
  const foodStress = Math.max(0, Math.min(1, (0.98 - (inputs.foodSecurity ?? 1)) / 0.58));
  const populationStress = Math.max(0, Math.min(1, -(inputs.populationGrowthRate ?? 0) / 0.02));
  const reserveStress = Math.max(0, Math.min(1, (2 - (inputs.foodReserveWeeks ?? 6)) / 2));
  const survivalStress = Math.max(foodStress, populationStress, reserveStress);
  const survivalEmergency = inputs.activeWars === 0
    && (foodStress > 0.02 || populationStress > 0 || reserveStress > 0 || inputs.treasuryWeeks < 0);
  const severeSurvivalEmergency = inputs.activeWars === 0 && (
    (inputs.foodSecurity ?? 1) < 0.65
    || (inputs.foodReserveWeeks ?? 6) < 0.5
    || inputs.treasuryWeeks < -AI_SEVERE_DEBT_REVENUE_WEEKS
  );
  const defensiveFloor = severeSurvivalEmergency
    ? AI_CRISIS_DEFENSIVE_ARMY_FLOOR : AI_PEACE_DEFENSIVE_ARMY_FLOOR;

  if (inputs.activeWars > 0) {
    mode = 'war';
    const targetRunway = inputs.superAi
      ? SUPER_AI_WAR_BASE_RUNWAY_WEEKS + inputs.activeWars * SUPER_AI_WAR_FRONT_RUNWAY_WEEKS
      : 3 + inputs.activeWars * 1.5;
    explanation = inputs.treasuryWeeks < targetRunway
      ? 'Emergency war economy: protecting payroll and rebuilding cash runway.'
      : inputs.fillRatio < 0.58
        ? 'Protecting army payroll and replacing severe battlefield losses.'
        : 'Funding every live front while preserving essential growth.';
    boost(activeBudget, 'military', (16 + 8 * (inputs.activeWars - 1) + 14 * (1 - inputs.fillRatio)) * responsiveness, 38);
    if (inputs.treasuryWeeks < targetRunway) {
      // Development is the only finite-budget route that repairs the wartime
      // tax base; blindly pushing every last point into the army caused AI
      // countries to win a front and still bankrupt the nation.
      boost(activeBudget, 'development', (8 + 3 * inputs.activeWars) * responsiveness, 50);
    }
    if (foodStress > 0.05 || populationStress > 0) {
      boost(activeBudget, 'development', (6 + 12 * survivalStress) * responsiveness, 50);
      explanation = 'War economy: the army comes first while essential food and population systems stay funded.';
    }
  } else if (survivalEmergency) {
    mode = 'recovery';
    explanation = foodStress > 0.15 || reserveStress > 0.35
      ? 'Survival first: restoring food supply and reserves before expanding the army.'
      : populationStress > 0
        ? 'Population recovery: stabilizing food, health and living conditions before military growth.'
        : 'Debt recovery: protecting essential services and rebuilding a positive treasury.';
    boost(activeBudget, 'development', (18 + 30 * survivalStress) * responsiveness);
    boost(activeBudget, 'research', (4 + 8 * Math.max(foodStress, populationStress)) * responsiveness);
    if (inputs.fillRatio < defensiveFloor) {
      boost(activeBudget, 'military', (10 + 24 * (defensiveFloor - inputs.fillRatio)) * responsiveness);
      explanation += ` Defensive forces are rebuilding toward ${Math.round(defensiveFloor * 100)}% readiness.`;
    }
  } else if (inputs.fillRatio < AI_HEALTHY_ARMY_TARGET - 0.005) {
    mode = 'rebuild';
    explanation = 'Training manpower gradually toward the full population-based army cap.';
    boost(activeBudget, 'military', (12 + 18 * (1 - inputs.fillRatio)) * responsiveness);
  } else if (inputs.averageCondition < 0.72 || inputs.treasuryWeeks < 2) {
    mode = 'recovery';
    explanation = 'Repairing territory and strengthening the revenue base.';
    boost(activeBudget, 'development', (10 + 16 * (1 - inputs.averageCondition)) * responsiveness);
  } else if (inputs.researchGap >= 4) {
    mode = 'catch-up';
    explanation = 'Closing the technology gap without abandoning the chosen route.';
    boost(activeBudget, 'research', Math.min(16, 6 + inputs.researchGap) * responsiveness);
  }

  // Secondary corrections make the plan proactive without creating another
  // user-facing management layer.
  if (!survivalEmergency && inputs.fillRatio < AI_HEALTHY_ARMY_TARGET - 0.005) {
    boost(activeBudget, 'military', 5 * responsiveness);
  }
  if (!survivalEmergency && inputs.averageCondition < 0.82) boost(activeBudget, 'development', 4 * responsiveness);
  if (!survivalEmergency && inputs.researchGap >= 7) boost(activeBudget, 'research', 4 * responsiveness);

  // Food crises redirect real, finite appropriations instead of granting free
  // supply. Development funds domestic capacity now; research funds the
  // economy/logistics portfolio that raises access and efficiency over time.
  if (foodStress > 0 && !survivalEmergency && inputs.activeWars === 0) {
    boost(activeBudget, 'development', (6 + 18 * foodStress) * responsiveness);
    boost(activeBudget, 'research', (3 + 8 * foodStress) * responsiveness);
  }

  return {
    mode,
    activeBudget,
    efficiency: nationalAiEfficiencyV2(inputs.superAi),
    explanation,
  };
}
