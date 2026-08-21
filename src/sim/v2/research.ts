import { randomInt } from '../../game/random';
import {
  RESEARCH_BRANCH_EFFECTS,
  RESEARCH_BRANCHES,
  researchFundingShareV2,
  round,
} from './balance';
import type { WorldContentV2 } from './content';
import { addWorldEventV2 } from './events';
import type { FinancePlansV2 } from './economy';
import {
  createPowerSnapshotV2,
  selectResearchCatchUpFactorV2,
  selectIsEliminatedV2,
  selectResearchBranchCostV2,
  selectResearchOutputV2,
  selectWeeklyFinanceBreakdownV2,
  sortedNationIdsV2,
  type PowerSnapshotV2,
} from './selectors';
import type { ResearchBranchV2, ResearchEffectV2, WorldStateV2 } from './types';

export function branchIsMaxedV2(state: WorldStateV2, playerId: keyof WorldStateV2['players'], branch: ResearchBranchV2): boolean {
  return !state.players[playerId] || !RESEARCH_BRANCH_EFFECTS[branch];
}

/** One seeded draw from an uncapped branch pool. */
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
  for (const playerId of playerIds) {
    if (selectIsEliminatedV2(state, playerId)) continue;
    const nation = state.players[playerId]!;
    const finance = financePlans?.get(playerId)
      ?? selectWeeklyFinanceBreakdownV2(state, content, playerId, powerSnapshot);
    const catchUp = selectResearchCatchUpFactorV2(state, content, playerId, powerSnapshot);
    // The simulation only needs each branch's funded progress. Building the
    // complete UI portfolio (effect cards, following costs and tooltips) for
    // every country every week was identical mathematically but needlessly
    // expensive in late-game worlds.
    const poolOutput = selectResearchOutputV2(state, content, playerId, finance, catchUp);
    let assignedOutput = 0;
    for (let branchIndex = 0; branchIndex < RESEARCH_BRANCHES.length; branchIndex += 1) {
      const branch = RESEARCH_BRANCHES[branchIndex]!;
      const outputShare = branchIndex === RESEARCH_BRANCHES.length - 1
        ? round(Math.max(0, poolOutput - assignedOutput), 9)
        : round(poolOutput * researchFundingShareV2(nation.research.allocations, branch), 9);
      assignedOutput = round(assignedOutput + outputShare, 9);
      if (branchIsMaxedV2(state, playerId, branch)) continue;
      nation.research.progress[branch] = round(nation.research.progress[branch] + outputShare);
      while (!branchIsMaxedV2(state, playerId, branch)) {
        const cost = selectResearchBranchCostV2(state, content, playerId, branch, powerSnapshot);
        if (cost <= 0 || nation.research.progress[branch] + 1e-9 < cost) break;
        const effect = drawResearchEffectV2(state, branch, nation.research.effectLevels);
        if (!effect) break;
        nation.research.progress[branch] = round(Math.max(0, nation.research.progress[branch] - cost));
        nation.research.effectLevels[effect] += 1;
        nation.research.breakthroughs[branch] += 1;
        addWorldEventV2(state, 'research', 'info', `${content.nations[playerId]?.name ?? playerId}: ${effect} +1%.`, undefined, playerId);
      }
    }
  }
}
