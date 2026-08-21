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
import {
  initialManualActionCostV2,
  initialStructuralWeeklyRevenueV2,
  manualActionUseMultiplierV2,
} from './manualActions';
import {
  selectIsEliminatedV2,
} from './selectors';
import type { PlayerId, PropagandaTermsV2, WorldStateV2 } from './types';

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
    allowed: true,
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
  if (!nation || selectIsEliminatedV2(state, playerId)) {
    return { ...terms, allowed: false, reason: 'Nation has no gameplay agency.' };
  }
  if (playerId !== state.humanPlayerId) {
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
  return terms;
}

/** Apply one of exactly 52 equal instalments after the normal suspicion update. */
export function processPropagandaProgramsV2(state: WorldStateV2): void {
  const nation = state.players[state.humanPlayerId];
  const program = nation?.propagandaProgram;
  if (!nation || !program || state.tick <= program.startedTick) return;
  const reduction = state.tick >= program.endsTick
    ? program.totalSuspicionReduction
      - program.weeklySuspicionReduction * (PROPAGANDA_DURATION_TICKS - 1)
    : program.weeklySuspicionReduction;
  state.aiEscalation.globalThreat = round(clamp(
    state.aiEscalation.globalThreat - reduction,
    0,
    100,
  ));
  if (state.tick >= program.endsTick) nation.propagandaProgram = null;
}
