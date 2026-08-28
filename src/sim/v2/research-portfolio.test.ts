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
import {
  selectResearchBranchCostV2,
  selectResearchOutputV2,
  selectResearchPortfolioV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import { WorldEngineV2 } from './WorldEngineV2';
import { nationIdV2, type ResearchAllocationsV2, type WorldStateV2 } from './types';

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

function totalBreakthroughs(state: WorldStateV2): number {
  return Object.values(state.players[bel].research.breakthroughs).reduce((sum, value) => sum + value, 0);
}

describe('V2 ten-program Development portfolio', () => {
  it('keeps all unfinished programs active, including branches with 0% extra allocation', () => {
    const state = createWorldStateV2(501);
    state.players[bel].treasury = 100;
    state.players[bel].research.allocations = { ...CONCENTRATED };
    const portfolio = selectResearchPortfolioV2(state, WORLD_CONTENT_V2, bel);
    expect(portfolio).toHaveLength(10);
    expect(portfolio.find((branch) => branch.branch === 'advanced-weapons')?.fundingShare).toBeCloseTo(0.73, 9);
    for (const branch of portfolio.filter((item) => item.branch !== 'advanced-weapons')) {
      expect(branch.allocation).toBe(0);
      expect(branch.fundingShare).toBeCloseTo(0.03, 9);
      expect(branch.weeklyProgress).toBeGreaterThan(0);
    }
    processResearchV2(state, WORLD_CONTENT_V2, createFinancePlansV2(state, WORLD_CONTENT_V2));
    for (const branch of RESEARCH_BRANCHES) expect(state.players[bel].research.progress[branch]).toBeGreaterThan(0);
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

  it('divides one committed Research pot once without changing finance expenses', () => {
    const state = createWorldStateV2(505);
    state.players[bel].treasury = 100;
    const finance = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, bel);
    const defaultPortfolio = selectResearchPortfolioV2(state, WORLD_CONTENT_V2, bel, finance);
    const poolOutput = selectResearchOutputV2(state, WORLD_CONTENT_V2, bel, finance);
    expect(defaultPortfolio.reduce((sum, branch) => sum + branch.fundingShare, 0)).toBeCloseTo(1, 9);
    expect(defaultPortfolio.reduce((sum, branch) => sum + branch.weeklyFunding, 0)).toBeCloseTo(finance.research, 8);
    expect(defaultPortfolio.reduce((sum, branch) => sum + branch.weeklyProgress, 0)).toBeCloseTo(poolOutput, 8);

    state.players[bel].research.allocations = { ...CONCENTRATED };
    const concentratedFinance = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, bel);
    const concentrated = selectResearchPortfolioV2(state, WORLD_CONTENT_V2, bel, concentratedFinance);
    expect(concentrated.reduce((sum, branch) => sum + branch.weeklyFunding, 0)).toBeCloseTo(concentratedFinance.research, 8);
    expect(concentratedFinance.expenses).toBe(finance.expenses);
    expect(concentratedFinance.research).toBe(finance.research);
  });

  it('is deterministic under identical allocation commands and seeded ticks', () => {
    const left = new WorldEngineV2(506);
    const right = new WorldEngineV2(506);
    expect(left.setResearchAllocations(bel, CONCENTRATED)).toEqual(right.setResearchAllocations(bel, CONCENTRATED));
    for (let tick = 0; tick < 12; tick += 1) {
      left.step();
      right.step();
      expect(left.canonicalHash()).toBe(right.canonicalHash());
    }
  }, 15_000);

  it('keeps Belgium progress visible on a one- and five-year peaceful calibration', () => {
    const state = createWorldStateV2(507);
    let firstCompletion: number | undefined;
    let at52 = 0;
    for (let week = 1; week <= 260; week += 1) {
      processResearchV2(state, WORLD_CONTENT_V2, createFinancePlansV2(state, WORLD_CONTENT_V2));
      const completed = totalBreakthroughs(state);
      if (completed > 0 && firstCompletion === undefined) firstCompletion = week;
      if (week === 52) at52 = completed;
    }
    const at260 = totalBreakthroughs(state);
    expect(firstCompletion).toBeDefined();
    expect(firstCompletion).toBeGreaterThanOrEqual(30);
    expect(firstCompletion).toBeLessThanOrEqual(140);
    expect(at52).toBeLessThanOrEqual(1);
    // The shared IQ-scaled planner keeps progress visible without restoring a
    // selected-country research acceleration.
    expect(at260).toBeGreaterThanOrEqual(2);
    expect(at260).toBeLessThanOrEqual(6);
  }, 60_000);
});
