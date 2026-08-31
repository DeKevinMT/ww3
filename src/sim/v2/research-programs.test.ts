import { describe, expect, it } from 'vitest';
import {
  PASSIVE_RECRUITMENT_CAPACITY_RATE,
  PEACE_ARMY_REFILL_CAPACITY_RATE_V2,
  PEACE_READINESS_RECOVERY_MAX_MULTIPLIER,
  RESEARCH_BRANCHES,
  RESEARCH_BRANCH_EFFECTS,
} from './balance';
import { createWorldStateV2 } from './bootstrap';
import { initialArmyCapacityRatioV2 } from './capacity';
import { WORLD_CONTENT_V2 } from './content';
import { createFinancePlansV2, processFinanceMilitaryV2 } from './economy';
import { drawResearchEffectV2 } from './research';
import {
  selectArmyCapacityTargetV2,
  selectArmyStrengthV2,
  invalidateTerritoryIndexV2,
  peacetimeRecruitmentReadinessMultiplierV2,
  selectRecruitmentThroughputV2,
  selectRecruitmentTrainingPipelineV2,
  selectRecruitmentUnitCostV2,
  selectResearchBranchCostV2,
  selectResearchEffectImpactV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import { nationIdV2, territoryIdV2 } from './types';
import { supplyFactorV2 } from './war';
import { countryTraitFactorV2 } from './traits';

const bel = nationIdV2('bel');
const isl = nationIdV2('isl');
const rus = nationIdV2('rus');
const usa = nationIdV2('usa');
const chn = nationIdV2('chn');
const ind = nationIdV2('ind');
const belTerritory = territoryIdV2('bel');

describe('V2 integrated research programs and army economy', () => {
  it('defines exactly the ten programs and keeps drawing +1 effects beyond former caps', () => {
    expect(RESEARCH_BRANCHES).toEqual([
      'population-recruitment',
      'military-industry',
      'advanced-weapons',
      'defensive-systems',
      'logistics-medicine',
      'economy-science',
      'food-systems',
      'reserve-doctrine',
      'public-administration',
      'education-intelligence',
    ]);
    expect(RESEARCH_BRANCH_EFFECTS).toEqual({
      'population-recruitment': ['population-growth', 'training'],
      'military-industry': ['force-capacity', 'reinforcement-efficiency'],
      'advanced-weapons': ['attack', 'reinforcement-efficiency'],
      'defensive-systems': ['defense', 'casualty-reduction'],
      'logistics-medicine': ['recovery', 'supply'],
      'economy-science': ['economy-growth', 'research-speed', 'research-efficiency'],
      'food-systems': ['supply', 'recovery'],
      'reserve-doctrine': ['training', 'force-capacity'],
      'public-administration': ['tax-efficiency', 'operating-efficiency'],
      'education-intelligence': ['iq-increase'],
    });
    const levels = createWorldStateV2(401).players[bel].research.effectLevels;
    const left = { rngState: 12345 };
    const right = { rngState: 12345 };
    expect(drawResearchEffectV2(left, 'economy-science', levels))
      .toBe(drawResearchEffectV2(right, 'economy-science', levels));
    levels['economy-growth'] = 200;
    levels['research-speed'] = 200;
    levels['research-efficiency'] = 200;
    expect(RESEARCH_BRANCH_EFFECTS['economy-science'])
      .toContain(drawResearchEffectV2({ rngState: 5 }, 'economy-science', levels));
  });

  it('gives demographic and economic breakthroughs country-specific diminishing returns', () => {
    const state = createWorldStateV2(2026);
    const luxembourg = nationIdV2('lux');
    const india = nationIdV2('ind');
    const burundi = nationIdV2('bdi');
    const luxPopulationImpact = selectResearchEffectImpactV2(
      state, WORLD_CONTENT_V2, luxembourg, 'population-growth',
    );
    const indiaPopulationImpact = selectResearchEffectImpactV2(
      state, WORLD_CONTENT_V2, india, 'population-growth',
    );
    const poorEconomyImpact = selectResearchEffectImpactV2(
      state, WORLD_CONTENT_V2, burundi, 'economy-growth',
    );
    const richEconomyImpact = selectResearchEffectImpactV2(
      state, WORLD_CONTENT_V2, luxembourg, 'economy-growth',
    );

    expect(luxPopulationImpact).toBeGreaterThan(indiaPopulationImpact * 4);
    expect(poorEconomyImpact).toBeGreaterThan(richEconomyImpact * 3);
    expect(luxPopulationImpact).toBeLessThanOrEqual(2.4);
    expect(poorEconomyImpact).toBeLessThanOrEqual(2.4);
  });

  it('lets research efficiency reduce future exponential RP costs by at most 20%', () => {
    const state = createWorldStateV2(402);
    const base = selectResearchBranchCostV2(state, WORLD_CONTENT_V2, bel, 'economy-science');
    state.players[bel].research.effectLevels['research-efficiency'] = 20;
    expect(selectResearchBranchCostV2(state, WORLD_CONTENT_V2, bel, 'economy-science')).toBeCloseTo(base * 0.80, 5);
  });

  it('makes reinforcement efficiency lower recruitment unit costs', () => {
    const state = createWorldStateV2(403);
    const recruitmentCost = selectRecruitmentUnitCostV2(state, bel);
    state.players[bel].research.effectLevels['reinforcement-efficiency'] = 20;
    expect(selectRecruitmentUnitCostV2(state, bel)).toBeCloseTo(recruitmentCost * 0.80, 6);
  });

  it('uses a slow passive pipeline improved specifically by Training research', () => {
    const state = createWorldStateV2(404);
    state.territories[belTerritory].army.manpower = 0;
    const base = selectRecruitmentThroughputV2(state, WORLD_CONTENT_V2, bel);
    state.players[bel].research.effectLevels.training = 25;
    const trained = selectRecruitmentThroughputV2(state, WORLD_CONTENT_V2, bel);
    state.players[bel].research.effectLevels.recovery = 25;
    expect(trained).toBeGreaterThan(base);
    expect(selectRecruitmentThroughputV2(state, WORLD_CONTENT_V2, bel)).toBe(trained);
  });

  it('uses one capacity-proportional field refill rate for small and large armies', () => {
    const state = createWorldStateV2(4_040_4);
    for (const id of [bel, ind]) {
      state.players[id].research.effectLevels.training = 0;
    }
    const small = selectArmyStrengthV2(state, WORLD_CONTENT_V2, bel);
    const large = selectArmyStrengthV2(state, WORLD_CONTENT_V2, ind);
    const smallPipeline = selectRecruitmentTrainingPipelineV2(state, WORLD_CONTENT_V2, bel);
    const largePipeline = selectRecruitmentTrainingPipelineV2(state, WORLD_CONTENT_V2, ind);

    expect(PASSIVE_RECRUITMENT_CAPACITY_RATE).toBe(0.00135);
    expect(PEACE_ARMY_REFILL_CAPACITY_RATE_V2).toBe(0.01);
    expect(small.capacity).toBeLessThan(large.capacity);
    expect(smallPipeline / small.capacity).toBeCloseTo(0.01, 4);
    expect(largePipeline / large.capacity).toBeCloseTo(0.01, 4);
  });

  it('uses one smooth peacetime recovery curve from empty to full readiness', () => {
    expect(peacetimeRecruitmentReadinessMultiplierV2(0, 1, false))
      .toBe(PEACE_READINESS_RECOVERY_MAX_MULTIPLIER);
    expect(peacetimeRecruitmentReadinessMultiplierV2(0.02, 1, false))
      .toBeGreaterThan(4.5);
    expect(peacetimeRecruitmentReadinessMultiplierV2(0.50, 1, false))
      .toBeCloseTo(1.5, 6);
    expect(peacetimeRecruitmentReadinessMultiplierV2(0.80, 1, false))
      .toBeCloseTo(1.032, 6);
    expect(peacetimeRecruitmentReadinessMultiplierV2(1, 1, false)).toBe(1);
    expect(peacetimeRecruitmentReadinessMultiplierV2(0.02, 1, true)).toBe(1);
  });

  it('keeps high-quality ATK/DEF recruitment more expensive on a bounded curve', () => {
    const state = createWorldStateV2(4_041);
    const eliteCost = selectRecruitmentUnitCostV2(state, usa);
    const massArmyCost = selectRecruitmentUnitCostV2(state, ind);
    expect(eliteCost).toBeGreaterThan(massArmyCost);
    expect(eliteCost).toBeLessThan(massArmyCost * 2.5);
  });

  it('uses current population directly for capacity potential', () => {
    const state = createWorldStateV2(405);
    const before = selectArmyCapacityTargetV2(state, WORLD_CONTENT_V2, bel);
    state.territories[belTerritory].population *= 2;
    const after = selectArmyCapacityTargetV2(state, WORLD_CONTENT_V2, bel);
    expect(after).toBeCloseTo(before * 2, 5);
  });

  it('keeps populous-country army caps tied to realistic standing forces', () => {
    const state = createWorldStateV2(4_051);
    const china = selectArmyCapacityTargetV2(state, WORLD_CONTENT_V2, chn);
    const india = selectArmyCapacityTargetV2(state, WORLD_CONTENT_V2, ind);
    const america = selectArmyCapacityTargetV2(state, WORLD_CONTENT_V2, usa);
    expect(china).toBeLessThan(2.5);
    expect(india).toBeLessThan(2.5);
    expect(america).toBeLessThan(2.5);
    expect(china).toBeGreaterThan(america * 1.30);
    expect(india).toBeGreaterThan(china * 0.95);
    expect(china / WORLD_CONTENT_V2.nations[chn].real.population).toBeLessThan(0.002);
    expect(india / WORLD_CONTENT_V2.nations[ind].real.population).toBeLessThan(0.002);
    expect(WORLD_CONTENT_V2.nations[usa].militaryQuality)
      .toBeGreaterThan(WORLD_CONTENT_V2.nations[chn].militaryQuality);
    expect(WORLD_CONTENT_V2.nations[chn].militaryQuality)
      .toBeGreaterThan(WORLD_CONTENT_V2.nations[ind].militaryQuality);
  });

  it('makes peacetime manpower recovery visible but still bounded', () => {
    const state = createWorldStateV2(4_052);
    const territory = state.territories[belTerritory];
    territory.army.capacity = selectArmyCapacityTargetV2(state, WORLD_CONTENT_V2, bel);
    territory.army.manpower = territory.army.capacity * 0.50;
    const annualRecruitment = selectRecruitmentThroughputV2(state, WORLD_CONTENT_V2, bel) * 52;
    expect(annualRecruitment / territory.army.capacity).toBeCloseTo(0.52, 3);
  });

  it('starts fully staffed at the complete effective cap', () => {
    const state = createWorldStateV2(406);
    const small = selectArmyStrengthV2(state, WORLD_CONTENT_V2, isl);
    const large = selectArmyStrengthV2(state, WORLD_CONTENT_V2, usa);
    expect(initialArmyCapacityRatioV2(WORLD_CONTENT_V2, isl)).toBe(1);
    expect(initialArmyCapacityRatioV2(WORLD_CONTENT_V2, usa)).toBe(1);
    expect(countryTraitFactorV2(isl, 'army-capacity')).toBe(1);
    expect(countryTraitFactorV2(usa, 'army-capacity')).toBe(1);
    expect(small.fillRatio).toBe(1);
    expect(large.fillRatio).toBe(1);
    expect(small.capacity).toBeCloseTo(small.capacityTarget, 6);
    expect(large.capacity).toBeCloseTo(large.capacityTarget, 6);
  });

  it('keeps supply research out of the fixed Army Capacity route budget', () => {
    const state = createWorldStateV2(407);
    const routeTerritory = territoryIdV2('lux');
    state.territories[routeTerritory].owner = bel;
    state.territories[routeTerritory].coreOwner = bel;
    state.territories[routeTerritory].integration = 1;
    state.territories[routeTerritory].army.manpower *= 0.50;
    invalidateTerritoryIndexV2(state);
    const base = supplyFactorV2(state, WORLD_CONTENT_V2, bel, routeTerritory, false);
    state.players[bel].research.effectLevels.supply = 20;
    const improved = supplyFactorV2(state, WORLD_CONTENT_V2, bel, routeTerritory, false);
    expect(improved).toBe(base);
    expect(improved).toBe(1);
  });

  it('anchors initial upkeep to real defence spending and charges advanced weapons', () => {
    const state = createWorldStateV2(408);
    const baseBel = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, bel);
    const baseIsl = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, isl);
    const baseRus = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, rus);
    const baseUsa = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, usa);
    const realWeeklyDefence = WORLD_CONTENT_V2.nations[bel].real.defenceSpending / 52;
    expect(baseBel.armyUpkeep).toBeGreaterThan(realWeeklyDefence * 0.80);
    expect(baseBel.armyUpkeep).toBeLessThan(realWeeklyDefence * 1.20);
    expect(baseUsa.armyUpkeep).toBeGreaterThan(baseIsl.armyUpkeep * 20);
    expect(baseRus.armyUpkeep).toBeGreaterThan(baseIsl.armyUpkeep * 10);
    state.players[bel].research.effectLevels.attack = 20;
    const advanced = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, bel);
    expect(advanced.armyUpkeep).toBeGreaterThan(baseBel.armyUpkeep);
    expect(advanced.fundedArmyUpkeep).toBeGreaterThan(baseBel.fundedArmyUpkeep);
    expect(advanced.military).toBeGreaterThanOrEqual(baseBel.military);
    expect(advanced.net).toBe(baseBel.net);
  });

  it('never invents an army-expansion budget after real upkeep', () => {
    const state = createWorldStateV2(409);
    for (const id of WORLD_CONTENT_V2.nationIds) {
      if (state.wars.some((war) => war.attackerId === id || war.defenderId === id)) continue;
      const strength = selectArmyStrengthV2(state, WORLD_CONTENT_V2, id);
      const finance = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, id);
      expect(strength.capacityTarget, String(id)).toBeCloseTo(strength.capacity, 6);
      expect(
        finance.armyUpkeep * finance.mandatoryFundingRatio
        + finance.recruitment
        + finance.reserveTrainingCost
        + finance.standingOperations,
        String(id),
      ).toBeCloseTo(finance.military, 3);
    }
  });

  it('fills an active-army shortage directly without creating a reserve pool', () => {
    const state = createWorldStateV2(410);
    const target = selectArmyCapacityTargetV2(state, WORLD_CONTENT_V2, bel);
    state.territories[belTerritory].army.capacity = target;
    state.territories[belTerritory].army.manpower = target * 0.50;
    state.players[bel].treasury = 100;
    state.players[bel].budget = { military: 90, research: 5, development: 5 };
    const reservesBefore = state.players[bel].trainedReserves;
    const before = { ...state.territories[belTerritory].army };
    const plans = createFinancePlansV2(state, WORLD_CONTENT_V2);
    expect(plans.get(bel)!.passiveRecruitment).toBeGreaterThan(0);
    expect(plans.get(bel)!.acceleratedRecruitment).toBe(0);
    expect(plans.get(bel)!.recruitment).toBe(0);
    expect(plans.get(bel)!.reserveTraining).toBe(0);
    processFinanceMilitaryV2(state, WORLD_CONTENT_V2, plans);
    expect(state.territories[belTerritory].army.capacity).toBe(before.capacity);
    expect(state.territories[belTerritory].army.manpower).toBeGreaterThan(before.manpower);
    expect(state.players[bel]).not.toHaveProperty('manpower');
    expect(state.players[bel].trainedReserves).toBe(reservesBefore);
  });

  it('exposes one canonical finance projection including operating and reserve flows', () => {
    const finance = selectWeeklyFinanceBreakdownV2(createWorldStateV2(411), WORLD_CONTENT_V2, bel);
    expect(Object.keys(finance).sort()).toEqual([
      'acceleratedDemobilization', 'acceleratedRecruitment', 'activeBudget', 'aiEfficiency', 'aiMode', 'annualEconomyGrowthRate', 'apexContribution', 'apexFoodContribution', 'armyUpkeep', 'baseOperatingCost',
      'ceasefireIncome', 'ceasefirePayment', 'closingTreasury', 'debtPremium', 'demobilizationCost', 'development',
      'economyBaseGrowthRate', 'economyFoodGrowthRate', 'economyGrowth', 'economyInvestmentGrowthRate', 'economyResearchGrowthRate', 'excessCashInvestment', 'expenses',
      'foodAccessCeiling', 'foodBalance', 'foodConsumed', 'foodCoverage', 'foodDemand', 'foodDevelopmentTransfer', 'foodDomesticProduced', 'foodExportIncome', 'foodExported', 'foodImported', 'foodLandCapacity', 'foodProduced',
      'foodProduction', 'foodStockChange', 'foodStorageCapacity', 'foodTargetStock', 'fundedArmyUpkeep',
      'integrationCost', 'mandatoryFundingRatio', 'military', 'mode', 'net', 'newBorrowing', 'passiveRecruitment', 'populationGrowth', 'recruitment',
      'recruitmentAccelerationCost', 'recruitmentFundingRatio', 'research', 'reserveDeployment', 'reserveTarget', 'reserveTraining', 'reserveTrainingCost', 'revenue', 'standingOperations', 'totalMilitaryCost',
      'trainedReserveCapacity', 'trainedReservesAfter', 'trainedReservesBefore',
      'warEconomicPenalty', 'warEconomyGrowthDrag', 'warOperations', 'warPopulationDrag', 'warResearchPenalty',
    ]);
  });
});
