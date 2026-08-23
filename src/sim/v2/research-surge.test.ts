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
} from './selectors';
import { WorldEngineV2 } from './WorldEngineV2';
import {
  nationIdV2,
  territoryIdV2,
  type ResearchAllocationsV2,
  type ResearchBranchV2,
} from './types';

const bel = nationIdV2('bel');
const lux = nationIdV2('lux');
const luxTerritory = territoryIdV2('lux');
const targetBranch: ResearchBranchV2 = 'defensive-systems';
const focusedAllocations: ResearchAllocationsV2 = {
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

function belgiumState(seed: number) {
  const state = createWorldStateV2(seed, WORLD_CONTENT_V2);
  state.humanPlayerId = bel;
  state.wars = [];
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
    expect(terms.progressAdded).toBe(round(selected.weeklyProgress * 52));
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

    for (const territory of Object.values(state.territories)) {
      if (territory.owner === bel) territory.condition = 0.15;
    }
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

  it('queues the chosen program, advances no other program, and starts a 208-week cooldown', () => {
    const surgeState = belgiumState(2_404);
    surgeState.players[bel].treasury = 1_000_000;
    surgeState.players[bel].research.allocations = { ...focusedAllocations };
    const controlState = structuredClone(surgeState);
    const engine = new WorldEngineV2(2_404, WORLD_CONTENT_V2, surgeState);
    const control = new WorldEngineV2(2_404, WORLD_CONTENT_V2, controlState);
    const terms = engine.researchSurgeTerms(bel, targetBranch);
    const treasuryBefore = engine.state.players[bel].treasury;

    expect(engine.researchSurge(bel, targetBranch)).toEqual({ accepted: true });
    expect(engine.state.players[bel].research.progress[targetBranch]).toBe(0);
    expect(engine.state.players[bel].treasury).toBe(treasuryBefore);

    engine.step();
    control.step();

    for (const branch of RESEARCH_BRANCHES) {
      const surgeProgress = engine.state.players[bel].research.progress[branch];
      const controlProgress = control.state.players[bel].research.progress[branch];
      expect(surgeProgress - controlProgress).toBeCloseTo(
        branch === targetBranch ? terms.progressAdded : 0,
        8,
      );
    }
    expect(engine.state.players[bel].manualActionUses.researchSurge).toBe(1);
    expect(engine.state.players[bel].researchSurgeAvailableTick).toBe(RESEARCH_SURGE_COOLDOWN_TICKS);
    expect(engine.state.players[bel].researchSurgeAvailableTick).toBe(208);
    expect(engine.state.players[bel].treasury).toBeCloseTo(
      control.state.players[bel].treasury - terms.cost,
      6,
    );
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
