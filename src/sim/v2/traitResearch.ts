import { round } from './balance';
import { countryTraitFactorV2 } from './traits';
import type { PlayerId, ResearchBranchV2 } from './types';

/**
 * Pure branch-level research projection shared by the weekly simulation and
 * any selector/UI forecast. The lookup deliberately accepts exactly one
 * active country id: conquered cores and absorbed empire members are not
 * inputs and therefore cannot contribute or stack their former traits.
 */
export function applyResearchProgressTraitV2(
  activePlayerId: PlayerId | string,
  researchBranch: ResearchBranchV2,
  baseProgress: number,
): number {
  if (!Number.isFinite(baseProgress) || baseProgress <= 0) return 0;
  return round(baseProgress * countryTraitFactorV2(
    activePlayerId,
    'research-progress',
    { researchBranch },
  ), 9);
}
