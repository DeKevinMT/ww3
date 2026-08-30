import {
  PROPAGANDA_COOLDOWN_TICKS,
  PROPAGANDA_COST_REVENUE_WEEKS,
  PROPAGANDA_DURATION_TICKS,
  PROPAGANDA_MIN_COST_BILLIONS,
  PROPAGANDA_POPULATION_LOG_SCALE,
  PROPAGANDA_TERRITORY_LOG_SCALE,
  PROPAGANDA_TOTAL_SUSPICION_REDUCTION,
  clamp,
  round,
} from './balance';
import type { WorldContentV2 } from './content';
import { isHumanPlayerV2 } from './humanPlayers';
import {
  initialManualActionCostV2,
  initialStructuralWeeklyRevenueV2,
  manualActionUseMultiplierV2,
} from './manualActions';
import {
  selectIsEliminatedV2,
} from './selectors';
import type { PlayerId, PropagandaTermsV2, WorldStateV2 } from './types';

export const PROPAGANDA_RETIRED_REASON_V2
  = 'Propaganda was retired; hostility is now local to each opponent.';

/**
 * Pure authoritative quote. Cost follows the empire's structural weekly tax
 * take, not its temporarily depressed wartime cashflow, so war cannot be used
 * to obtain a cheap campaign.
 */
export function selectPropagandaTermsV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): PropagandaTermsV2 {
  const nation = state.players[playerId];
  const openingQuote = initialManualActionCostV2(content, playerId, 'propaganda');
  const structuralWeeklyTaxRevenue = initialStructuralWeeklyRevenueV2(content, playerId);
  const empireScale = openingQuote.openingScale;
  const useCount = nation?.manualActionUses.propaganda ?? 0;
  const useMultiplier = manualActionUseMultiplierV2('propaganda', useCount);
  const cost = round(openingQuote.baseCost * useMultiplier, 3);
  const activeRemainingTicks = nation?.propagandaProgram
    ? Math.max(0, nation.propagandaProgram.endsTick - state.tick)
    : 0;
  const cooldownRemainingTicks = nation
    ? Math.max(0, nation.propagandaAvailableTick - state.tick)
    : 0;
  const activeProgress = nation?.propagandaProgram
    ? clamp(
      (state.tick - nation.propagandaProgram.startedTick)
        / Math.max(1, nation.propagandaProgram.endsTick - nation.propagandaProgram.startedTick),
      0,
      1,
    )
    : 0;
  const terms: PropagandaTermsV2 = {
    allowed: false,
    playerId,
    cost,
    baseCost: openingQuote.baseCost,
    useCount,
    useMultiplier,
    structuralWeeklyTaxRevenue,
    empireScale,
    durationTicks: PROPAGANDA_DURATION_TICKS,
    cooldownTicks: PROPAGANDA_COOLDOWN_TICKS,
    cooldownRemainingTicks,
    activeRemainingTicks,
    activeProgress: round(activeProgress),
    totalSuspicionReduction: PROPAGANDA_TOTAL_SUSPICION_REDUCTION,
    weeklySuspicionReduction: round(PROPAGANDA_TOTAL_SUSPICION_REDUCTION / PROPAGANDA_DURATION_TICKS),
  };
  // Compatibility quote only. Old clients and queued commands receive one
  // deterministic rejection; no treasury, cooldown or political state moves.
  if (nation && !selectIsEliminatedV2(state, playerId) && isHumanPlayerV2(state, playerId)) {
    return { ...terms, reason: PROPAGANDA_RETIRED_REASON_V2 };
  }
  if (!nation || selectIsEliminatedV2(state, playerId)) {
    return { ...terms, allowed: false, reason: 'Nation has no gameplay agency.' };
  }
  if (!isHumanPlayerV2(state, playerId)) {
    return { ...terms, allowed: false, reason: 'Propaganda is a manual player program.' };
  }
  if (nation.propagandaProgram) {
    return { ...terms, allowed: false, reason: `${activeRemainingTicks} weeks remain in the active campaign.` };
  }
  if (cooldownRemainingTicks > 0) {
    return { ...terms, allowed: false, reason: `Propaganda is available again in ${cooldownRemainingTicks} weeks.` };
  }
  if (!(nation.treasury > 0) || nation.treasury + 0.000_001 < cost) {
    return { ...terms, allowed: false, reason: `Requires ${cost.toFixed(2)}B positive cash.` };
  }
  return { ...terms, reason: PROPAGANDA_RETIRED_REASON_V2 };
}

/** Normalize obsolete active campaigns without producing any political effect. */
export function processPropagandaProgramsV2(state: WorldStateV2): void {
  for (const nation of Object.values(state.players)) nation.propagandaProgram = null;
}
