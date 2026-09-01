import { randomInt } from '../../game/random';
import {
  RESEARCH_BRANCH_EFFECTS,
  round,
} from './balance';
import { synchronizeArmyCapacityV2 } from './capacity';
import type { WorldContentV2 } from './content';
import { addWorldEventV2 } from './events';
import type { FinancePlansV2 } from './economy';
import { isHumanPlayerV2 } from './humanPlayers';
import {
  createPowerSnapshotV2,
  selectResearchCatchUpFactorV2,
  selectResearchBranchMaxedV2,
  selectIsEliminatedV2,
  selectResearchBranchCostV2,
  selectResearchFundingSharesV2,
  selectResearchOutputV2,
  selectWeeklyFinanceBreakdownV2,
  sortedNationIdsV2,
  type PowerSnapshotV2,
} from './selectors';
import {
  RESEARCH_CATEGORIES,
  RESEARCH_CATEGORY_DIRECTIONS,
} from './researchDirections';
import { applyResearchProgressTraitV2 } from './traitResearch';
import { traitNationContextV2 } from './traitContext';
import { isNationOperationalV2 } from './survival';
import type { ResearchBranchV2, ResearchEffectV2, WorldStateV2 } from './types';

export function branchIsMaxedV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: keyof WorldStateV2['players'],
  branch: ResearchBranchV2,
): boolean {
  return selectResearchBranchMaxedV2(state, content, playerId, branch);
}

/** Canonical branch/effect membership check shared by command-edge validation. */
export function researchEffectBelongsToBranchV2(
  branch: ResearchBranchV2,
  effect: ResearchEffectV2,
): boolean {
  return (RESEARCH_BRANCH_EFFECTS[branch] as readonly ResearchEffectV2[] | undefined)
    ?.includes(effect) ?? false;
}

/** Legacy seeded suggestion helper. Live research never applies this automatically. */
export function drawResearchEffectV2(
  state: Pick<WorldStateV2, 'rngState'>,
  branch: ResearchBranchV2,
  _levels: Readonly<Record<ResearchEffectV2, number>>,
): ResearchEffectV2 | undefined {
  const pool = RESEARCH_BRANCH_EFFECTS[branch];
  return pool[randomInt(state, pool.length)];
}

export function processResearchV2(
  state: WorldStateV2,
  content: WorldContentV2,
  financePlans?: FinancePlansV2,
  powerSnapshot: PowerSnapshotV2 = createPowerSnapshotV2(state, content),
): void {
  const playerIds = sortedNationIdsV2(state);
  let capacityChanged = false;
  for (const playerId of playerIds) {
    if (selectIsEliminatedV2(state, playerId)
      || !isNationOperationalV2(state, content, playerId)) continue;
    const nation = state.players[playerId]!;
    const finance = financePlans?.get(playerId)
      ?? selectWeeklyFinanceBreakdownV2(state, content, playerId, powerSnapshot);
    // Research uses one stable national trait view throughout this nation's
    // weekly projection. Rebuilding it per branch repeatedly rescanned wars.
    const nationTraitContext = traitNationContextV2(state, playerId);
    const catchUp = selectResearchCatchUpFactorV2(
      state,
      content,
      playerId,
      powerSnapshot,
      nationTraitContext,
    );
    // The simulation only needs each branch's funded progress. Building the
    // complete UI portfolio (effect cards, following costs and tooltips) for
    // every country every week was identical mathematically but needlessly
    // expensive in late-game worlds.
    const poolOutput = selectResearchOutputV2(
      state,
      content,
      playerId,
      finance,
      catchUp,
      nationTraitContext,
      powerSnapshot,
    );
    const fundingShares = selectResearchFundingSharesV2(
      state, content, playerId, powerSnapshot,
    );
    for (const category of RESEARCH_CATEGORIES) {
      let direction = nation.research.categoryDirections[category];
      if (selectResearchBranchMaxedV2(state, content, playerId, direction.branch)) {
        const fallback = RESEARCH_CATEGORY_DIRECTIONS[category].find((candidate) => (
          !selectResearchBranchMaxedV2(state, content, playerId, candidate.branch)
        ));
        if (!fallback) continue;
        direction = { ...fallback };
        nation.research.categoryDirections[category] = direction;
      }
      const branch = direction.branch;
      const fundingShare = fundingShares[branch];
      if (fundingShare <= 0) continue;
      const weeklyProgress = applyResearchProgressTraitV2(
        playerId,
        branch,
        poolOutput * fundingShare,
        nationTraitContext,
      );
      let carriedProgress = round(Math.max(0, nation.research.progress[branch]) + weeklyProgress);
      for (let completion = 0; completion < 8; completion += 1) {
        const cost = selectResearchBranchCostV2(
          state, content, playerId, branch, powerSnapshot,
        );
        if (cost <= 0 || carriedProgress + 1e-9 < cost) {
          nation.research.progress[branch] = cost <= 0 ? 0 : carriedProgress;
          break;
        }
        carriedProgress = round(Math.max(0, carriedProgress - cost));
        nation.research.effectLevels[direction.effect] += 1;
        nation.research.breakthroughs[branch] += 1;
        capacityChanged ||= direction.effect === 'force-capacity';
        addWorldEventV2(
          state,
          'research',
          isHumanPlayerV2(state, playerId) ? 'action' : 'info',
          `${content.nations[playerId]?.name ?? playerId}: ${category.toUpperCase()} · ${direction.effect.replaceAll('-', ' ')} level ${nation.research.effectLevels[direction.effect]} online — automatic research continues.`,
          undefined,
          playerId,
        );
        if (selectResearchBranchMaxedV2(state, content, playerId, branch)) {
          nation.research.progress[branch] = 0;
          const fallback = RESEARCH_CATEGORY_DIRECTIONS[category].find((candidate) => (
            !selectResearchBranchMaxedV2(state, content, playerId, candidate.branch)
          ));
          if (fallback) nation.research.categoryDirections[category] = { ...fallback };
          break;
        }
        nation.research.progress[branch] = carriedProgress;
      }
    }
  }
  if (capacityChanged) synchronizeArmyCapacityV2(state, content);
}
