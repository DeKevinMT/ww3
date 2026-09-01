import { describe, expect, it } from 'vitest';
import {
  RESEARCH_BRANCH_EFFECTS,
  RESEARCH_CATEGORY_OUTPUT_SHARE,
  round,
} from './balance';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { createFinancePlansV2 } from './economy';
import { processResearchV2 } from './research';
import {
  RESEARCH_CATEGORIES,
  RESEARCH_CATEGORY_DIRECTIONS,
  researchCategoryForDirectionV2,
  researchDirectionIsValidV2,
} from './researchDirections';
import {
  selectResearchBranchCostV2,
  selectResearchDriversV2,
  selectResearchFundingSharesV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import { nationIdV2, type WorldStateV2 } from './types';
import { WorldEngineV2 } from './WorldEngineV2';

const belgium = nationIdV2('bel');

function fundedState(seed: number): WorldStateV2 {
  const state = createWorldStateV2(seed);
  state.players[belgium].treasury = 100;
  return state;
}

function processOneWeek(state: WorldStateV2): void {
  processResearchV2(
    state,
    WORLD_CONTENT_V2,
    createFinancePlansV2(state, WORLD_CONTENT_V2),
  );
}

describe('parallel research categories', () => {
  it('exposes exactly five categories with exactly three valid directions each', () => {
    expect(RESEARCH_CATEGORIES).toHaveLength(5);
    expect(new Set(RESEARCH_CATEGORIES).size).toBe(5);
    expect(Object.keys(RESEARCH_CATEGORY_DIRECTIONS).sort())
      .toEqual([...RESEARCH_CATEGORIES].sort());

    const uniqueDirections = new Set<string>();
    for (const category of RESEARCH_CATEGORIES) {
      const directions = RESEARCH_CATEGORY_DIRECTIONS[category];
      expect(directions).toHaveLength(3);
      for (const direction of directions) {
        expect(researchDirectionIsValidV2(category, direction)).toBe(true);
        expect(researchCategoryForDirectionV2(direction.branch, direction.effect)).toBe(category);
        expect(RESEARCH_BRANCH_EFFECTS[direction.branch]).toContain(direction.effect);
        uniqueDirections.add(`${direction.branch}:${direction.effect}`);
      }
    }
    expect(uniqueDirections.size).toBe(15);
  });

  it('runs all five categories concurrently at exactly sixteen percent each', () => {
    const state = fundedState(92_001);
    const nation = state.players[belgium];
    const activeBranches = RESEARCH_CATEGORIES.map((category) => (
      nation.research.categoryDirections[category].branch
    ));
    expect(new Set(activeBranches).size).toBe(5);

    const fundingShares = selectResearchFundingSharesV2(
      state, WORLD_CONTENT_V2, belgium,
    );
    expect(RESEARCH_CATEGORY_OUTPUT_SHARE).toBe(0.16);
    for (const branch of activeBranches) expect(fundingShares[branch]).toBe(0.16);
    expect(Object.values(fundingShares).reduce((sum, share) => sum + share, 0)).toBe(0.8);

    const progressBefore = Object.fromEntries(activeBranches.map((branch) => [
      branch, nation.research.progress[branch],
    ]));
    processOneWeek(state);
    for (const branch of activeBranches) {
      expect(nation.research.progress[branch]).toBeGreaterThan(progressBefore[branch]!);
    }
  });

  it('auto-completes a level while preserving its direction and overflow', () => {
    const baseline = fundedState(92_002);
    const state = structuredClone(baseline);
    const category = 'combat' as const;
    const nation = state.players[belgium];
    const directionBefore = { ...nation.research.categoryDirections[category] };
    const branch = directionBefore.branch;

    processOneWeek(baseline);
    const weeklyProgress = baseline.players[belgium].research.progress[branch];
    expect(weeklyProgress).toBeGreaterThan(0);

    const cost = selectResearchBranchCostV2(state, WORLD_CONTENT_V2, belgium, branch);
    const expectedOverflow = weeklyProgress / 2;
    nation.research.progress[branch] = cost - expectedOverflow;
    const breakthroughsBefore = nation.research.breakthroughs[branch];
    const effectLevelBefore = nation.research.effectLevels[directionBefore.effect];

    processOneWeek(state);

    expect(nation.research.categoryDirections[category]).toEqual(directionBefore);
    expect(nation.research.breakthroughs[branch]).toBe(breakthroughsBefore + 1);
    expect(nation.research.effectLevels[directionBefore.effect]).toBe(effectLevelBefore + 1);
    expect(nation.research.progress[branch]).toBeGreaterThan(0);
    expect(nation.research.progress[branch]).toBe(round(expectedOverflow));
  });

  it('changes one category direction without disturbing the other four', () => {
    const engine = new WorldEngineV2(92_003);
    const before = structuredClone(engine.state.players[belgium].research.categoryDirections);
    const replacement = RESEARCH_CATEGORY_DIRECTIONS.combat[1];

    expect(engine.setResearchDirection(
      belgium,
      'combat',
      replacement.branch,
      replacement.effect,
    )).toEqual({ accepted: true });
    engine.step();

    const after = engine.state.players[belgium].research.categoryDirections;
    expect(after.combat).toEqual(replacement);
    for (const category of RESEARCH_CATEGORIES.filter((entry) => entry !== 'combat')) {
      expect(after[category]).toEqual(before[category]);
    }
  });

  it('quotes economy and IQ research drivers without overstating expansion', () => {
    const state = fundedState(92_004);
    const finance = selectWeeklyFinanceBreakdownV2(
      state, WORLD_CONTENT_V2, belgium,
    );
    const drivers = selectResearchDriversV2(
      state, WORLD_CONTENT_V2, belgium, finance,
    );
    expect(drivers.currentOutput).toBeGreaterThan(0);
    expect(drivers.economyExpansionShare).toBe(0.25);
    expect(drivers.economyExpansionOutputGain).toBeGreaterThan(0);
    expect(drivers.economyExpansionOutputGain).toBeLessThan(0.25);
    expect(drivers.iqStepPoints).toBeGreaterThanOrEqual(0);
    expect(drivers.iqStepOutputGain).toBeGreaterThanOrEqual(0);

    const unfunded = selectResearchDriversV2(
      state,
      WORLD_CONTENT_V2,
      belgium,
      { ...finance, research: 0 },
    );
    expect(unfunded.currentOutput).toBe(0);
    expect(unfunded.economyExpansionOutputGain).toBe(0);

    const overfunded = selectResearchDriversV2(
      state,
      WORLD_CONTENT_V2,
      belgium,
      { ...finance, research: finance.revenue * 10 },
    );
    expect(overfunded.fundingRatio).toBe(1.25);

    state.players[belgium].research.effectLevels['iq-increase'] = 1_000_000;
    const ceilingContent = {
      ...WORLD_CONTENT_V2,
      nations: {
        ...WORLD_CONTENT_V2.nations,
        [belgium]: { ...WORLD_CONTENT_V2.nations[belgium]!, iqScore: 110 },
      },
    };
    const cappedIq = selectResearchDriversV2(
      state, ceilingContent, belgium,
    );
    expect(cappedIq.iqStepPoints).toBe(0);
    expect(cappedIq.iqStepOutputGain).toBe(0);
  });
});
