import { describe, expect, it } from 'vitest';
import {
  RESEARCH_BRANCHES,
  RESEARCH_COST_GROWTH,
} from './balance';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { createFinancePlansV2 } from './economy';
import { assertInvariantsV2 } from './invariants';
import { processResearchV2 } from './research';
import { RESEARCH_CATEGORIES } from './researchDirections';
import {
  selectResearchBranchCostV2,
  selectResearchBranchMaxedV2,
  selectResearchOutputV2,
  selectResearchPortfolioV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import { WorldEngineV2 } from './WorldEngineV2';
import {
  nationIdV2,
  type ResearchAllocationsV2,
  type ResearchBranchV2,
} from './types';

const bel = nationIdV2('bel');

const CONCENTRATED: ResearchAllocationsV2 = {
  'population-recruitment': 0,
  'military-industry': 0,
  'advanced-weapons': 100,
  'defensive-systems': 0,
  'logistics-medicine': 0,
  'economy-science': 0,
  'food-systems': 0,
  'reserve-doctrine': 0,
  'public-administration': 0,
  'education-intelligence': 0,
};

describe('V2 ten-program Development portfolio', () => {
  it('funds one active direction in every category and preserves inactive branches', () => {
    const state = createWorldStateV2(501);
    state.players[bel].treasury = 100;
    state.players[bel].research.allocations = { ...CONCENTRATED };
    const portfolio = selectResearchPortfolioV2(state, WORLD_CONTENT_V2, bel);
    expect(portfolio).toHaveLength(10);
    const activeBranches = new Set(RESEARCH_CATEGORIES.map((category) => (
      state.players[bel].research.categoryDirections[category].branch
    )));
    expect(activeBranches.size).toBe(5);
    for (const branch of portfolio.filter((item) => activeBranches.has(item.branch))) {
      expect(branch.fundingShare).toBe(0.16);
      expect(branch.weeklyProgress).toBeGreaterThan(0);
    }
    for (const branch of portfolio.filter((item) => !activeBranches.has(item.branch))) {
      expect(branch.fundingShare).toBe(0);
      expect(branch.weeklyProgress).toBe(0);
    }
    processResearchV2(state, WORLD_CONTENT_V2, createFinancePlansV2(state, WORLD_CONTENT_V2));
    for (const branch of activeBranches) {
      expect(state.players[bel].research.progress[branch]).toBeGreaterThan(0);
    }
    for (const branch of RESEARCH_BRANCHES.filter((branch) => !activeBranches.has(branch))) {
      expect(state.players[bel].research.progress[branch]).toBe(0);
    }
  });

  it('queues one exact-100 allocation atomically and rejects malformed mixes without mutation', () => {
    const invalidEngine = new WorldEngineV2(502);
    const before = structuredClone(invalidEngine.state.players[bel].research.allocations);
    const missing = { ...CONCENTRATED } as Partial<ResearchAllocationsV2>;
    delete missing['economy-science'];
    expect(invalidEngine.setResearchAllocations(bel, missing as ResearchAllocationsV2).accepted).toBe(false);
    expect(invalidEngine.setResearchAllocations(bel, { ...CONCENTRATED, 'advanced-weapons': 99 }).accepted).toBe(false);
    expect(invalidEngine.setResearchAllocations(bel, {
      ...CONCENTRATED, 'advanced-weapons': 99.5, 'economy-science': 0.5,
    }).accepted).toBe(false);
    expect(invalidEngine.state.players[bel].research.allocations).toEqual(before);
    expect(() => invalidEngine.save()).not.toThrow();

    const engine = new WorldEngineV2(503);
    const canonicalBefore = structuredClone(engine.state.players[bel].research.allocations);
    const queued = { ...CONCENTRATED };
    expect(engine.setResearchAllocations(bel, queued)).toEqual({ accepted: true });
    expect(engine.state.players[bel].research.allocations).toEqual(canonicalBefore);
    queued['advanced-weapons'] = 0;
    queued['economy-science'] = 100;
    engine.step();
    expect(engine.state.players[bel].research.allocations).toEqual(CONCENTRATED);
    assertInvariantsV2(engine.state, WORLD_CONTENT_V2);
  });

  it('rejects malformed canonical allocations and per-branch progress through invariants', () => {
    const badMix = createWorldStateV2(508);
    badMix.players[bel].research.allocations['economy-science'] -= 1;
    expect(() => assertInvariantsV2(badMix, WORLD_CONTENT_V2)).toThrow(/research allocations/i);

    const badProgress = createWorldStateV2(509);
    badProgress.players[bel].research.progress['logistics-medicine'] = -0.01;
    expect(() => assertInvariantsV2(badProgress, WORLD_CONTENT_V2)).toThrow(/logistics-medicine progress/i);

    const longRunningResearch = createWorldStateV2(510);
    longRunningResearch.players[bel].research.breakthroughs['advanced-weapons'] = 41;
    longRunningResearch.players[bel].research.effectLevels.attack = 21;
    longRunningResearch.players[bel].research.effectLevels['reinforcement-efficiency'] = 20;
    expect(() => assertInvariantsV2(longRunningResearch, WORLD_CONTENT_V2)).not.toThrow();
  });

  it('raises the next same-branch requirement monotonically, including an efficiency completion', () => {
    const state = createWorldStateV2(504);
    const base = selectResearchBranchCostV2(state, WORLD_CONTENT_V2, bel, 'economy-science');
    state.players[bel].research.breakthroughs['economy-science'] = 1;
    const next = selectResearchBranchCostV2(state, WORLD_CONTENT_V2, bel, 'economy-science');
    expect(next).toBeCloseTo(base * 2 * RESEARCH_COST_GROWTH, 5);
    state.players[bel].research.effectLevels['research-efficiency'] = 1;
    const afterEfficiency = selectResearchBranchCostV2(state, WORLD_CONTENT_V2, bel, 'economy-science');
    expect(afterEfficiency).toBeGreaterThan(base);
    const row = selectResearchPortfolioV2(state, WORLD_CONTENT_V2, bel)
      .find((branch) => branch.branch === 'economy-science')!;
    expect(row.followingCost / row.nextCost).toBeCloseTo(row.nextCostIncreaseRatio, 8);
    expect(row.nextCostIncreaseRatio).toBeGreaterThan(1);
  });

  it('commits eighty percent of the Research pot across categories while legacy allocations change nothing', () => {
    const state = createWorldStateV2(505);
    state.players[bel].treasury = 100;
    const finance = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, bel);
    const defaultPortfolio = selectResearchPortfolioV2(state, WORLD_CONTENT_V2, bel, finance);
    const poolOutput = selectResearchOutputV2(state, WORLD_CONTENT_V2, bel, finance);
    expect(defaultPortfolio.reduce((sum, branch) => sum + branch.fundingShare, 0)).toBeCloseTo(0.8, 9);
    expect(defaultPortfolio.reduce((sum, branch) => sum + branch.weeklyFunding, 0)).toBeCloseTo(finance.research * 0.8, 8);
    expect(defaultPortfolio.reduce((sum, branch) => sum + branch.weeklyProgress, 0)).toBeCloseTo(poolOutput * 0.8, 8);

    state.players[bel].research.allocations = { ...CONCENTRATED };
    const concentratedFinance = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, bel);
    const concentrated = selectResearchPortfolioV2(state, WORLD_CONTENT_V2, bel, concentratedFinance);
    expect(concentrated.reduce((sum, branch) => sum + branch.weeklyFunding, 0)).toBeCloseTo(concentratedFinance.research * 0.8, 8);
    expect(concentrated.find((branch) => branch.branch === 'advanced-weapons')?.fundingShare).toBe(0.16);
    expect(concentratedFinance.expenses).toBe(finance.expenses);
    expect(concentratedFinance.research).toBe(finance.research);
  });

  it('never pauses the portfolio and automatically consumes completion-ready progress', () => {
    const active = createWorldStateV2(512);
    active.players[bel].treasury = 100;
    const activeFinance = selectWeeklyFinanceBreakdownV2(active, WORLD_CONTENT_V2, bel);
    expect(activeFinance.research).toBeGreaterThan(0);

    const choiceReady = structuredClone(active);
    choiceReady.players[bel].research.progress['advanced-weapons'] = selectResearchBranchCostV2(
      choiceReady, WORLD_CONTENT_V2, bel, 'advanced-weapons',
    );
    const choiceReadyFinance = selectWeeklyFinanceBreakdownV2(
      choiceReady, WORLD_CONTENT_V2, bel,
    );
    const choiceReadyPortfolio = selectResearchPortfolioV2(
      choiceReady, WORLD_CONTENT_V2, bel, choiceReadyFinance,
    );
    expect(choiceReadyFinance.research).toBe(activeFinance.research);
    expect(choiceReadyPortfolio.reduce((sum, branch) => sum + branch.fundingShare, 0))
      .toBeCloseTo(0.8, 9);
    const attackBefore = choiceReady.players[bel].research.effectLevels.attack;
    processResearchV2(
      choiceReady,
      WORLD_CONTENT_V2,
      createFinancePlansV2(choiceReady, WORLD_CONTENT_V2),
    );
    expect(choiceReady.players[bel].research.effectLevels.attack).toBe(attackBefore + 1);
    expect(choiceReady.players[bel].research.progress['advanced-weapons']).toBeGreaterThan(0);
  });

  it('is deterministic under identical category-direction commands and seeded ticks', () => {
    const left = new WorldEngineV2(506);
    const right = new WorldEngineV2(506);
    expect(left.setResearchDirection(bel, 'combat', 'defensive-systems', 'defense'))
      .toEqual(right.setResearchDirection(bel, 'combat', 'defensive-systems', 'defense'));
    for (let tick = 0; tick < 12; tick += 1) {
      left.step();
      right.step();
      expect(left.canonicalHash()).toBe(right.canonicalHash());
    }
  }, 15_000);

  it('applies a completed effect automatically and immediately starts the next level', () => {
    const state = createWorldStateV2(507);
    const cost = selectResearchBranchCostV2(
      state, WORLD_CONTENT_V2, bel, 'advanced-weapons',
    );
    state.players[bel].research.progress['advanced-weapons'] = cost;
    processResearchV2(state, WORLD_CONTENT_V2, createFinancePlansV2(state, WORLD_CONTENT_V2));
    expect(state.players[bel].research.effectLevels.attack).toBe(1);
    expect(state.players[bel].research.breakthroughs['advanced-weapons']).toBe(1);
    expect(state.players[bel].research.progress['advanced-weapons']).toBeGreaterThan(0);
    expect(state.events.some((event) => /automatic research continues/i.test(event.message)))
      .toBe(true);
  });

  it('preserves progress across category switches and rejects cross-category directions', () => {
    const engine = new WorldEngineV2(511);
    expect(engine.setResearchDirection(
      bel, 'combat', 'forged-program' as ResearchBranchV2, 'attack',
    ).accepted)
      .toBe(false);
    engine.step();
    const preserved = engine.state.players[bel].research.progress['advanced-weapons'];
    expect(preserved).toBeGreaterThan(0);

    expect(engine.setResearchDirection(
      bel, 'combat', 'defensive-systems', 'defense',
    )).toEqual({ accepted: true });
    engine.step();
    expect(engine.state.players[bel].research.progress['advanced-weapons']).toBe(preserved);
    expect(engine.state.players[bel].research.progress['defensive-systems']).toBeGreaterThan(0);
    expect(engine.setResearchDirection(
      bel, 'people', 'advanced-weapons', 'attack',
    ).accepted).toBe(false);

    expect(engine.setResearchDirection(
      bel, 'combat', 'advanced-weapons', 'attack',
    )).toEqual({ accepted: true });
    engine.step();
    const cost = selectResearchBranchCostV2(
      engine.state, WORLD_CONTENT_V2, bel, 'advanced-weapons',
    );
    engine.state.players[bel].research.progress['advanced-weapons'] = cost;
    engine.step();
    expect(engine.state.players[bel].research.effectLevels.attack).toBe(1);
    expect(engine.state.players[bel].research.breakthroughs['advanced-weapons']).toBe(1);
    expect(engine.state.players[bel].research.progress['advanced-weapons']).toBeGreaterThan(0);
    expect(engine.state.events.some((event) => /automatic research continues/i.test(event.message)))
      .toBe(true);
  });

  it('synchronizes a Capacity breakthrough before same-tick invariants run', () => {
    const engine = new WorldEngineV2(513);
    const nation = engine.state.players[bel];
    expect(engine.setResearchDirection(
      bel, 'army', 'military-industry', 'force-capacity',
    )).toEqual({ accepted: true });
    engine.step();
    nation.research.progress['military-industry'] = selectResearchBranchCostV2(
      engine.state, WORLD_CONTENT_V2, bel, 'military-industry',
    );
    const levelBefore = nation.research.effectLevels['force-capacity'];

    expect(() => engine.step()).not.toThrow();
    expect(nation.research.effectLevels['force-capacity']).toBe(levelBefore + 1);
    assertInvariantsV2(engine.state, WORLD_CONTENT_V2);
  });

  it('falls back within a mastered category while the other four keep running', () => {
    const highIqContent = {
      ...WORLD_CONTENT_V2,
      nations: {
        ...WORLD_CONTENT_V2.nations,
        [bel]: { ...WORLD_CONTENT_V2.nations[bel]!, iqScore: 108 },
      },
    };
    const engine = new WorldEngineV2(514, highIqContent);
    const nation = engine.state.players[bel];
    expect(selectResearchBranchMaxedV2(
      engine.state, highIqContent, bel, 'education-intelligence',
    )).toBe(false);

    let firstMaxLevel = 1;
    for (; firstMaxLevel < 100; firstMaxLevel += 1) {
      nation.research.effectLevels['iq-increase'] = firstMaxLevel;
      if (selectResearchBranchMaxedV2(
        engine.state, highIqContent, bel, 'education-intelligence',
      )) break;
    }
    expect(firstMaxLevel).toBeLessThan(100);
    nation.research.effectLevels['iq-increase'] = firstMaxLevel - 1;
    expect(selectResearchBranchMaxedV2(
      engine.state, highIqContent, bel, 'education-intelligence',
    )).toBe(false);

    expect(engine.setResearchDirection(
      bel, 'people', 'education-intelligence', 'iq-increase',
    )).toEqual({ accepted: true });
    engine.step();
    nation.research.progress['education-intelligence'] = selectResearchBranchCostV2(
      engine.state, highIqContent, bel, 'education-intelligence',
    );
    engine.step();

    expect(selectResearchBranchMaxedV2(
      engine.state, highIqContent, bel, 'education-intelligence',
    )).toBe(true);
    expect(nation.research.activeProgram).toBeNull();
    expect(nation.research.categoryDirections.people.branch).toBe('population-recruitment');
    expect(nation.research.progress['advanced-weapons']).toBeGreaterThan(0);
    assertInvariantsV2(engine.state, highIqContent);
  });
});
