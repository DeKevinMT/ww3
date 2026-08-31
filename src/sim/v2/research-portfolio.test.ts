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
  type WorldStateV2,
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

function totalBreakthroughs(state: WorldStateV2): number {
  return Object.values(state.players[bel].research.breakthroughs).reduce((sum, value) => sum + value, 0);
}

describe('V2 ten-program Development portfolio', () => {
  it('funds only the active program and preserves every paused branch', () => {
    const state = createWorldStateV2(501);
    state.players[bel].treasury = 100;
    state.players[bel].research.allocations = { ...CONCENTRATED };
    state.players[bel].research.activeProgram = 'advanced-weapons';
    const portfolio = selectResearchPortfolioV2(state, WORLD_CONTENT_V2, bel);
    expect(portfolio).toHaveLength(10);
    const active = portfolio.find((branch) => branch.branch === 'advanced-weapons')!;
    expect(active.fundingShare).toBe(1);
    expect(active.weeklyProgress).toBeGreaterThan(0);
    for (const branch of portfolio.filter((item) => item.branch !== 'advanced-weapons')) {
      expect(branch.allocation).toBe(0);
      expect(branch.fundingShare).toBe(0);
      expect(branch.weeklyProgress).toBe(0);
    }
    processResearchV2(state, WORLD_CONTENT_V2, createFinancePlansV2(state, WORLD_CONTENT_V2));
    expect(state.players[bel].research.progress['advanced-weapons']).toBeGreaterThan(0);
    for (const branch of RESEARCH_BRANCHES.filter((branch) => branch !== 'advanced-weapons')) {
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

  it('commits the full Research pot to focus while legacy allocations change nothing', () => {
    const state = createWorldStateV2(505);
    state.players[bel].treasury = 100;
    state.players[bel].research.activeProgram = 'advanced-weapons';
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
    expect(concentrated.find((branch) => branch.branch === 'advanced-weapons')?.fundingShare).toBe(1);
    expect(concentratedFinance.expenses).toBe(finance.expenses);
    expect(concentratedFinance.research).toBe(finance.research);
  });

  it('keeps paused and choice-ready R&D funding in the treasury', () => {
    const active = createWorldStateV2(512);
    active.players[bel].treasury = 100;
    active.players[bel].research.activeProgram = 'advanced-weapons';
    const activeFinance = selectWeeklyFinanceBreakdownV2(active, WORLD_CONTENT_V2, bel);
    expect(activeFinance.research).toBeGreaterThan(0);

    const paused = structuredClone(active);
    paused.players[bel].research.activeProgram = null;
    const pausedFinance = selectWeeklyFinanceBreakdownV2(paused, WORLD_CONTENT_V2, bel);
    const pausedPortfolio = selectResearchPortfolioV2(
      paused, WORLD_CONTENT_V2, bel, pausedFinance,
    );
    expect(pausedFinance.research).toBe(0);
    expect(pausedFinance.closingTreasury - activeFinance.closingTreasury)
      .toBeCloseTo(activeFinance.research, 8);
    expect(pausedPortfolio.reduce((sum, branch) => sum + branch.weeklyFunding, 0)).toBe(0);
    expect(pausedPortfolio.reduce((sum, branch) => sum + branch.weeklyProgress, 0)).toBe(0);

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
    expect(choiceReadyFinance.research).toBe(0);
    expect(choiceReadyFinance.closingTreasury - activeFinance.closingTreasury)
      .toBeCloseTo(activeFinance.research, 8);
    expect(choiceReadyPortfolio.reduce((sum, branch) => sum + branch.weeklyFunding, 0)).toBe(0);
    expect(choiceReadyPortfolio.reduce((sum, branch) => sum + branch.weeklyProgress, 0)).toBe(0);
  });

  it('is deterministic under identical focus commands and seeded ticks', () => {
    const left = new WorldEngineV2(506);
    const right = new WorldEngineV2(506);
    expect(left.setResearchFocus(bel, 'advanced-weapons'))
      .toEqual(right.setResearchFocus(bel, 'advanced-weapons'));
    for (let tick = 0; tick < 12; tick += 1) {
      left.step();
      right.step();
      expect(left.canonicalHash()).toBe(right.canonicalHash());
    }
  }, 15_000);

  it('stops exactly at the current cost until a player chooses an effect', () => {
    const state = createWorldStateV2(507);
    state.players[bel].research.activeProgram = 'advanced-weapons';
    const cost = selectResearchBranchCostV2(
      state, WORLD_CONTENT_V2, bel, 'advanced-weapons',
    );
    let firstReady: number | undefined;
    for (let week = 1; week <= 260; week += 1) {
      processResearchV2(state, WORLD_CONTENT_V2, createFinancePlansV2(state, WORLD_CONTENT_V2));
      if (state.players[bel].research.progress['advanced-weapons'] === cost
        && firstReady === undefined) firstReady = week;
    }
    expect(firstReady).toBeDefined();
    expect(state.players[bel].research.progress['advanced-weapons']).toBe(cost);
    expect(totalBreakthroughs(state)).toBe(0);
    expect(state.events.some((event) => /breakthrough ready/i.test(event.message))).toBe(true);
  }, 60_000);

  it('preserves progress across focus switches and validates the selected breakthrough', () => {
    const engine = new WorldEngineV2(511);
    expect(engine.setResearchFocus(bel, 'forged-program' as ResearchBranchV2).accepted)
      .toBe(false);
    expect(engine.setResearchFocus(bel, 'advanced-weapons')).toEqual({ accepted: true });
    engine.step();
    const preserved = engine.state.players[bel].research.progress['advanced-weapons'];
    expect(preserved).toBeGreaterThan(0);

    expect(engine.setResearchFocus(bel, 'defensive-systems')).toEqual({ accepted: true });
    engine.step();
    expect(engine.state.players[bel].research.progress['advanced-weapons']).toBe(preserved);
    expect(engine.state.players[bel].research.progress['defensive-systems']).toBeGreaterThan(0);

    const cost = selectResearchBranchCostV2(
      engine.state, WORLD_CONTENT_V2, bel, 'advanced-weapons',
    );
    engine.state.players[bel].research.progress['advanced-weapons'] = cost;
    expect(engine.chooseResearchBreakthrough(bel, 'advanced-weapons', 'defense').accepted)
      .toBe(false);
    expect(engine.chooseResearchBreakthrough(bel, 'advanced-weapons', 'attack'))
      .toEqual({ accepted: true });
    engine.step();
    expect(engine.state.players[bel].research.effectLevels.attack).toBe(1);
    expect(engine.state.players[bel].research.breakthroughs['advanced-weapons']).toBe(1);
    expect(engine.state.players[bel].research.progress['advanced-weapons']).toBe(0);
    expect(engine.state.events.some((event) => /attack breakthrough selected/i.test(event.message)))
      .toBe(true);
  });

  it('synchronizes a Capacity breakthrough before same-tick invariants run', () => {
    const engine = new WorldEngineV2(513);
    const nation = engine.state.players[bel];
    nation.research.activeProgram = 'military-industry';
    nation.research.progress['military-industry'] = selectResearchBranchCostV2(
      engine.state, WORLD_CONTENT_V2, bel, 'military-industry',
    );
    const levelBefore = nation.research.effectLevels['force-capacity'];

    expect(engine.chooseResearchBreakthrough(
      bel, 'military-industry', 'force-capacity',
    )).toEqual({ accepted: true });
    expect(() => engine.step()).not.toThrow();
    expect(nation.research.effectLevels['force-capacity']).toBe(levelBefore + 1);
    assertInvariantsV2(engine.state, WORLD_CONTENT_V2);
  });

  it('keeps another active focus running when a non-active branch becomes maxed', () => {
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

    nation.research.activeProgram = 'advanced-weapons';
    nation.research.progress['education-intelligence'] = selectResearchBranchCostV2(
      engine.state, highIqContent, bel, 'education-intelligence',
    );
    expect(engine.chooseResearchBreakthrough(
      bel, 'education-intelligence', 'iq-increase',
    )).toEqual({ accepted: true });
    engine.step();

    expect(selectResearchBranchMaxedV2(
      engine.state, highIqContent, bel, 'education-intelligence',
    )).toBe(true);
    expect(nation.research.activeProgram).toBe('advanced-weapons');
    expect(nation.research.progress['advanced-weapons']).toBeGreaterThan(0);
    assertInvariantsV2(engine.state, highIqContent);
  });
});
