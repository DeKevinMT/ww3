import { round } from './balance';

export interface VeteranCohortV2 {
  manpower: number;
  /** Equivalent XP whose combat-bonus score is sqrt(XP). */
  experience: number;
}

/** The one linear quantity used whenever veteran groups are combined. */
export function veteranBonusScoreV2(experience: number): number {
  return Math.sqrt(Number.isFinite(experience) ? Math.max(0, experience) : 0);
}

/**
 * Combines veteran cohorts without manufacturing bonus power. Their sqrt-XP
 * scores are manpower-weighted, then squared back into the canonical
 * equivalent-XP field used by existing schema-14 saves.
 */
export function equivalentVeteranExperienceV2(cohorts: readonly VeteranCohortV2[]): number {
  let manpower = 0;
  let bonusScoreMass = 0;
  for (const cohort of cohorts) {
    const cohortManpower = Number.isFinite(cohort.manpower) ? Math.max(0, cohort.manpower) : 0;
    if (cohortManpower <= 0) continue;
    manpower += cohortManpower;
    bonusScoreMass += cohortManpower * veteranBonusScoreV2(cohort.experience);
  }
  if (manpower <= 0) return 0;
  const averageBonusScore = bonusScoreMass / manpower;
  return round(averageBonusScore * averageBonusScore, 9);
}

/** Rank is derived presentation only and therefore needs no save field. */
export function veteranRankV2(manpower: number, equivalentExperience: number): number {
  if (!Number.isFinite(manpower) || manpower <= 0) return 0;
  return Math.floor(veteranBonusScoreV2(equivalentExperience)) + 1;
}
