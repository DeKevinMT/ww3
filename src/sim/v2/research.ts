import { randomInt } from '../../game/random';
import {
  RESEARCH_BRANCH_EFFECTS,
  round,
} from './balance';
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
  selectResearchFundableActiveProgramV2,
  selectResearchOutputV2,
  selectWeeklyFinanceBreakdownV2,
  sortedNationIdsV2,
  type PowerSnapshotV2,
} from './selectors';
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
  for (const playerId of playerIds) {
    if (selectIsEliminatedV2(state, playerId)
      || !isNationOperationalV2(state, content, playerId)) continue;
    const nation = state.players[playerId]!;
    const branch = selectResearchFundableActiveProgramV2(
      state,
      content,
      playerId,
      powerSnapshot,
    );
    if (!branch) continue;
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
    const cost = selectResearchBranchCostV2(
      state,
      content,
      playerId,
      branch,
      powerSnapshot,
    );
    if (cost <= 0) continue;
    const current = Math.max(0, nation.research.progress[branch]);
    if (current + 1e-9 >= cost) {
      nation.research.progress[branch] = cost;
      continue;
    }
    const weeklyProgress = applyResearchProgressTraitV2(
      playerId,
      branch,
      poolOutput,
      nationTraitContext,
    );
    const next = Math.min(cost, round(current + weeklyProgress));
    nation.research.progress[branch] = next;
    if (next + 1e-9 >= cost) {
      addWorldEventV2(
        state,
        'research',
        isHumanPlayerV2(state, playerId) ? 'action' : 'info',
        `${content.nations[playerId]?.name ?? playerId}: ${branch.replaceAll('-', ' ')} breakthrough ready — choose one upgrade.`,
        undefined,
        playerId,
      );
    }
  }
}
