import { describe, expect, it } from 'vitest';
import {
  RESEARCH_BRANCHES,
  RESEARCH_SURGE_COOLDOWN_TICKS,
  RESEARCH_SURGE_PROGRESS_WEEKS,
  round,
} from './balance';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import {
  invalidateTerritoryIndexV2,
  selectResearchPortfolioV2,
  selectResearchSurgeTermsV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import { WorldEngineV2 } from './WorldEngineV2';
import {
  nationIdV2,
  territoryIdV2,
  type ResearchBranchV2,
} from './types';

const bel = nationIdV2('bel');
const lux = nationIdV2('lux');
const luxTerritory = territoryIdV2('lux');
const targetBranch: ResearchBranchV2 = 'defensive-systems';
function belgiumState(seed: number) {
  const state = createWorldStateV2(seed, WORLD_CONTENT_V2);
  state.humanPlayerId = bel;
  state.wars = [];
  state.players[bel].research.categoryDirections.combat = {
    branch: targetBranch,
    effect: 'defense',
  };
  return state;
}

describe('targeted Research Surge', () => {
  it('advances exactly the selected program by 52 funded weeks and uses structural revenue', () => {
    const state = belgiumState(2_401);
    const portfolio = selectResearchPortfolioV2(state, WORLD_CONTENT_V2, bel);
    const selected = portfolio.find((program) => program.branch === targetBranch)!;
    const terms = selectResearchSurgeTermsV2(state, WORLD_CONTENT_V2, bel, targetBranch);
    expect(terms.targetBranch).toBe(targetBranch);
    expect(terms.progressWeeks).toBe(RESEARCH_SURGE_PROGRESS_WEEKS);
    expect(terms.progressWeeks).toBe(52);
    expect(terms.progressAdded).toBe(round(Math.min(
      selected.nextCost - selected.progress,
      selected.weeklyProgress * 52,
    )));
    expect(terms.empireScale).toBeGreaterThanOrEqual(1);
    expect(terms.cost).toBe(terms.baseCost);
  });

  it('does not reprice from conquest or war damage and rises only after successful uses', () => {
    const state = belgiumState(2_402);
    const baseline = selectResearchSurgeTermsV2(state, WORLD_CONTENT_V2, bel, targetBranch);

    state.territories[luxTerritory].owner = bel;
    state.territories[luxTerritory].integration = 1;
    invalidateTerritoryIndexV2(state);
    const expanded = selectResearchSurgeTermsV2(state, WORLD_CONTENT_V2, bel, targetBranch);
    expect(expanded.empireScale).toBeGreaterThan(1);
    expect(expanded.cost).toBe(baseline.cost);

    state.wars.push({
      id: 'surge-war', attackerId: bel, defenderId: lux,
      startedTick: 0, lastBattleTick: 0, warScore: 0, battles: 0,
      attackerLosses: 0, defenderLosses: 0, lastPeaceOfferTick: -1_000_000,
      attackerOperations: [], defenderOperations: [],
    });
    const damaged = selectResearchSurgeTermsV2(state, WORLD_CONTENT_V2, bel, targetBranch);
    expect(damaged.cost).toBeCloseTo(expanded.cost, 6);
    expect(damaged.progressAdded).toBeLessThan(expanded.progressAdded);
    state.players[bel].manualActionUses.researchSurge = 1;
    expect(selectResearchSurgeTermsV2(state, WORLD_CONTENT_V2, bel, targetBranch).cost).toBeGreaterThan(damaged.cost);
  });

  it('queues the chosen category, advances no other category, and starts a 208-day cooldown', () => {
    const surgeState = belgiumState(2_404);
    surgeState.players[bel].treasury = 1_000_000;
    const controlState = structuredClone(surgeState);
    const engine = new WorldEngineV2(2_404, WORLD_CONTENT_V2, surgeState);
    const control = new WorldEngineV2(2_404, WORLD_CONTENT_V2, controlState);
    const terms = engine.researchSurgeTerms(bel, targetBranch);
    const treasuryBefore = engine.state.players[bel].treasury;
    const controlResearchSpending = selectWeeklyFinanceBreakdownV2(
      control.state, WORLD_CONTENT_V2, bel,
    ).research;
    expect(controlResearchSpending).toBeGreaterThan(0);

    expect(engine.researchSurge(bel, targetBranch)).toEqual({ accepted: true });
    expect(engine.state.players[bel].research.progress[targetBranch]).toBe(0);
    expect(engine.state.players[bel].treasury).toBe(treasuryBefore);

    engine.step();
    control.step();

    for (const branch of RESEARCH_BRANCHES) {
      const surgeProgress = engine.state.players[bel].research.progress[branch];
      const controlProgress = control.state.players[bel].research.progress[branch];
      if (branch === targetBranch) {
        const surgeBreakthroughs = engine.state.players[bel].research.breakthroughs[branch];
        const controlBreakthroughs = control.state.players[bel].research.breakthroughs[branch];
        expect(surgeProgress > controlProgress || surgeBreakthroughs > controlBreakthroughs)
          .toBe(true);
      } else expect(surgeProgress).toBe(controlProgress);
    }
    expect(engine.state.players[bel].manualActionUses.researchSurge).toBe(1);
    expect(engine.state.players[bel].researchSurgeAvailableTick).toBe(RESEARCH_SURGE_COOLDOWN_TICKS);
    expect(engine.state.players[bel].researchSurgeAvailableTick).toBe(208);
    expect(selectWeeklyFinanceBreakdownV2(
      engine.state, WORLD_CONTENT_V2, bel,
    ).research).toBeGreaterThan(0);
    const netSurgeCost = control.state.players[bel].treasury
      - engine.state.players[bel].treasury;
    expect(netSurgeCost).toBeCloseTo(terms.cost, 5);
  });

  it('rejects inactive programs and auto-completes a surge clamped exactly to cost', () => {
    const state = belgiumState(2_406);
    state.players[bel].treasury = 1_000_000;
    expect(selectResearchSurgeTermsV2(
      state, WORLD_CONTENT_V2, bel, 'advanced-weapons',
    ).reason).toMatch(/active category direction/i);

    const row = selectResearchPortfolioV2(state, WORLD_CONTENT_V2, bel)
      .find((program) => program.branch === targetBranch)!;
    state.players[bel].research.progress[targetBranch] = row.nextCost - 0.001;
    const terms = selectResearchSurgeTermsV2(state, WORLD_CONTENT_V2, bel, targetBranch);
    expect(terms.allowed).toBe(true);
    expect(terms.progressAdded).toBeCloseTo(0.001, 9);

    const engine = new WorldEngineV2(2_406, WORLD_CONTENT_V2, state);
    expect(engine.researchSurge(bel, targetBranch)).toEqual({ accepted: true });
    engine.step();
    expect(engine.state.players[bel].research.effectLevels.defense).toBe(1);
    expect(engine.state.players[bel].research.progress[targetBranch]).toBeGreaterThan(0);
    expect(engine.researchSurgeTerms(bel, targetBranch).allowed).toBe(false);
    expect(engine.researchSurgeTerms(bel, targetBranch).reason).toMatch(/returns in/i);
  });

  it('rejects the retired choice command in the Surge pre-tick window', () => {
    const state = belgiumState(2_407);
    state.players[bel].treasury = 1_000_000;
    const row = selectResearchPortfolioV2(state, WORLD_CONTENT_V2, bel)
      .find((program) => program.branch === targetBranch)!;
    state.players[bel].research.progress[targetBranch] = row.nextCost - 0.001;
    const engine = new WorldEngineV2(2_407, WORLD_CONTENT_V2, state);
    let exploitResult: ReturnType<WorldEngineV2['submitCommand']> | undefined;

    engine.subscribe((_nextState, change) => {
      if (change.reason !== 'research-surge') return;
      exploitResult = engine.submitCommand({
        type: 'choose-research-breakthrough',
        playerId: bel,
        branch: targetBranch,
        effect: 'casualty-reduction',
      });
    });

    expect(engine.researchSurge(bel, targetBranch)).toEqual({ accepted: true });
    engine.step();

    expect(exploitResult).toEqual({
      accepted: false,
      reason: 'Post-completion research choices were retired; set a research direction instead.',
    });
    expect(engine.state.players[bel].research.effectLevels['casualty-reduction']).toBe(0);
    expect(engine.state.players[bel].research.effectLevels.defense).toBe(1);
    expect(engine.state.players[bel].research.breakthroughs[targetBranch]).toBe(1);
  });

  it('rejects a runtime target that is not one of the ten existing programs', () => {
    const state = belgiumState(2_405);
    const invalid = selectResearchSurgeTermsV2(
      state,
      WORLD_CONTENT_V2,
      bel,
      'nonexistent-program' as ResearchBranchV2,
    );
    expect(invalid.allowed).toBe(false);
    expect(invalid.reason).toMatch(/unavailable/i);
    expect(invalid.progressAdded).toBe(0);
  });

});
