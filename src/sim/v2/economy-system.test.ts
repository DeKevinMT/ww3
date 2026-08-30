import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { optimizeNationalAiPlanV2 } from './nationalAi';
import {
  invalidateTerritoryIndexV2,
  selectNationalEconomyV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import { nationIdV2, territoryIdV2 } from './types';

describe('V2 simple dynamic economy and survival AI', () => {
  it('turns real productive investment into a visible dynamic annual growth rate', () => {
    const state = createWorldStateV2(52_001);
    const belgium = nationIdV2('bel');
    const lowInvestment = selectWeeklyFinanceBreakdownV2(
      state, WORLD_CONTENT_V2, belgium, undefined, { military: 70, research: 20, development: 10 },
    );
    const highInvestment = selectWeeklyFinanceBreakdownV2(
      state, WORLD_CONTENT_V2, belgium, undefined, { military: 10, research: 20, development: 70 },
    );

    expect(highInvestment.economyGrowth).toBeGreaterThan(lowInvestment.economyGrowth);
    expect(highInvestment.economyInvestmentGrowthRate)
      .toBeGreaterThan(lowInvestment.economyInvestmentGrowthRate);
    expect(highInvestment.annualEconomyGrowthRate)
      .toBeGreaterThan(lowInvestment.annualEconomyGrowthRate);
    expect(highInvestment.annualEconomyGrowthRate).toBeLessThanOrEqual(0.045);
  });

  it('makes a war year visibly weaker than the same peacetime economy', () => {
    const peace = createWorldStateV2(52_004);
    const war = structuredClone(peace);
    const belgium = nationIdV2('bel');
    const netherlands = nationIdV2('nld');
    war.wars.push({
      id: 'growth-war', attackerId: belgium, defenderId: netherlands,
      startedTick: 0, lastBattleTick: 0, warScore: 0, battles: 0,
      attackerLosses: 0, defenderLosses: 0, lastPeaceOfferTick: -1,
      attackerOperations: [], defenderOperations: [],
    });
    const peacePlan = selectWeeklyFinanceBreakdownV2(peace, WORLD_CONTENT_V2, belgium);
    const warPlan = selectWeeklyFinanceBreakdownV2(war, WORLD_CONTENT_V2, belgium);
    expect(warPlan.annualEconomyGrowthRate)
      .toBeLessThan(peacePlan.annualEconomyGrowthRate - 0.01);
  });

  it('makes infrastructure collapse reduce growth while legacy commodity fields stay inert', () => {
    const healthy = createWorldStateV2(52_002);
    const crisis = structuredClone(healthy);
    const neutralCrisis = structuredClone(healthy);
    const belgium = nationIdV2('bel');
    const territory = crisis.territories[territoryIdV2('bel')]!;
    neutralCrisis.territories[territoryIdV2('bel')]!.economy *= 0.10;
    crisis.players[belgium]!.foodStock = 0;
    crisis.players[belgium]!.foodSecurity = 0.20;
    territory.economy *= 0.10;

    const healthyPlan = selectWeeklyFinanceBreakdownV2(healthy, WORLD_CONTENT_V2, belgium);
    const crisisPlan = selectWeeklyFinanceBreakdownV2(crisis, WORLD_CONTENT_V2, belgium);
    const neutralCrisisPlan = selectWeeklyFinanceBreakdownV2(
      neutralCrisis, WORLD_CONTENT_V2, belgium,
    );
    expect(crisisPlan.foodProduction).toBe(0);
    expect(crisisPlan.foodCoverage).toBe(1);
    expect(crisisPlan.annualEconomyGrowthRate).toBe(neutralCrisisPlan.annualEconomyGrowthRate);
    expect(crisisPlan.annualEconomyGrowthRate).toBeLessThan(healthyPlan.annualEconomyGrowthRate);
  });

  it('makes rich and poor population fusions change the national mix differently', () => {
    const belgium = nationIdV2('bel');
    const baseState = createWorldStateV2(52_003);
    const base = selectNationalEconomyV2(baseState, WORLD_CONTENT_V2, belgium);

    const richState = createWorldStateV2(52_003);
    richState.territories[territoryIdV2('lux')]!.owner = belgium;
    invalidateTerritoryIndexV2(richState);
    const rich = selectNationalEconomyV2(richState, WORLD_CONTENT_V2, belgium);

    const populousPoorState = createWorldStateV2(52_003);
    populousPoorState.territories[territoryIdV2('nga')]!.owner = belgium;
    invalidateTerritoryIndexV2(populousPoorState);
    const populousPoor = selectNationalEconomyV2(populousPoorState, WORLD_CONTENT_V2, belgium);

    expect(rich.population).toBeGreaterThan(base.population);
    expect(rich.wealthPerPerson).toBeGreaterThan(base.wealthPerPerson);
    expect(populousPoor.population).toBeGreaterThan(rich.population);
    expect(populousPoor.wealthPerPerson).toBeLessThan(base.wealthPerPerson);
    expect(populousPoor.controlledOutput).toBeGreaterThan(base.controlledOutput);
  });

  it('puts survival first in peace and military first only during war', () => {
    const common = {
      intent: { military: 35, research: 15, development: 50 } as const,
      fillRatio: 0.45,
      researchGap: 5,
      treasuryWeeks: -1,
      populationGrowthRate: -0.01,
      iqScore: 100,
    };
    const peace = optimizeNationalAiPlanV2({ ...common, activeWars: 0 });
    const war = optimizeNationalAiPlanV2({ ...common, activeWars: 1 });

    expect(peace.mode).toBe('recovery');
    expect(peace.activeBudget.development).toBeGreaterThan(peace.activeBudget.military);
    expect(peace.explanation).toMatch(/recovery|population|treasury|debt/i);
    expect(war.mode).toBe('war');
    expect(war.activeBudget.military).toBeGreaterThan(war.activeBudget.development);
  });
});
