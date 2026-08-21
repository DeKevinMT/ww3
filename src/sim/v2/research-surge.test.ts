import { describe, expect, it } from 'vitest';
import { RESEARCH_SURGE_PROGRESS_WEEKS } from './balance';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import {
  invalidateTerritoryIndexV2,
  selectNationalEconomyV2,
  selectResearchSurgeTermsV2,
} from './selectors';
import { nationIdV2, territoryIdV2 } from './types';

const bel = nationIdV2('bel');
const lux = nationIdV2('lux');
const luxTerritory = territoryIdV2('lux');

function belgiumState(seed: number) {
  const state = createWorldStateV2(seed, WORLD_CONTENT_V2);
  state.humanPlayerId = bel;
  state.wars = [];
  return state;
}

describe('simple APEX research surge', () => {
  it('advances every active program by twelve weeks and uses structural revenue', () => {
    const state = belgiumState(2_401);
    const terms = selectResearchSurgeTermsV2(state, WORLD_CONTENT_V2, bel);
    expect(terms.progressWeeks).toBe(RESEARCH_SURGE_PROGRESS_WEEKS);
    expect(terms.progressAdded).toBeGreaterThan(0);
    expect(terms.empireScale).toBeGreaterThanOrEqual(1);
    expect(terms.cost).toBe(terms.baseCost);
  });

  it('does not reprice from conquest or war damage and rises only after successful uses', () => {
    const state = belgiumState(2_402);
    const baseline = selectResearchSurgeTermsV2(state, WORLD_CONTENT_V2, bel);

    state.territories[luxTerritory].owner = bel;
    state.territories[luxTerritory].integration = 1;
    invalidateTerritoryIndexV2(state);
    const expanded = selectResearchSurgeTermsV2(state, WORLD_CONTENT_V2, bel);
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
    const damaged = selectResearchSurgeTermsV2(state, WORLD_CONTENT_V2, bel);
    expect(damaged.cost).toBeCloseTo(expanded.cost, 6);
    expect(damaged.progressAdded).toBeLessThan(expanded.progressAdded);
    state.players[bel].manualActionUses.researchSurge = 1;
    expect(selectResearchSurgeTermsV2(state, WORLD_CONTENT_V2, bel).cost).toBeGreaterThan(damaged.cost);
  });

  it('does not charge more merely because veteran combat power increased', () => {
    const state = belgiumState(2_403);
    const before = selectResearchSurgeTermsV2(state, WORLD_CONTENT_V2, bel);
    const capital = state.territories[state.players[bel].capitalId]!;
    capital.army.veteranManpower = capital.army.manpower;
    capital.army.veteranExperience = 100;
    const after = selectResearchSurgeTermsV2(state, WORLD_CONTENT_V2, bel);
    expect(after.cost).toBeCloseTo(before.cost, 6);
  });
});
