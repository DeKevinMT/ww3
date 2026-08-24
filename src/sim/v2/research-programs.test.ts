import { describe, expect, it } from 'vitest';
import {
  PASSIVE_RECRUITMENT_CAPACITY_RATE,
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
      'food-systems': ['food-production', 'food-storage'],
      'reserve-doctrine': ['reserve-training', 'reserve-mobilization'],
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

  it('recruits every baseline more slowly while smaller maximum armies fill sooner', () => {
    const state = createWorldStateV2(4_040_4);
    for (const id of [bel, ind]) {
      state.players[id].foodSecurity = 1;
      state.players[id].research.effectLevels.training = 0;
    }
    const small = selectArmyStrengthV2(state, WORLD_CONTENT_V2, bel);
    const large = selectArmyStrengthV2(state, WORLD_CONTENT_V2, ind);
    const smallPipeline = selectRecruitmentTrainingPipelineV2(state, WORLD_CONTENT_V2, bel);
    const largePipeline = selectRecruitmentTrainingPipelineV2(state, WORLD_CONTENT_V2, ind);

    expect(PASSIVE_RECRUITMENT_CAPACITY_RATE).toBe(0.00085);
    expect(small.capacity).toBeLessThan(large.capacity);
    expect(smallPipeline).toBeLessThan(small.capacity * 0.001);
    expect(largePipeline).toBeLessThan(large.capacity * 0.001);
    expect(small.capacity / smallPipeline).toBeLessThan(large.capacity / largePipeline);
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

  it('makes trained manpower slow to replace even during peacetime', () => {
    const state = createWorldStateV2(4_052);
    const territory = state.territories[belTerritory];
    territory.army.capacity = selectArmyCapacityTargetV2(state, WORLD_CONTENT_V2, bel);
    territory.army.manpower = territory.army.capacity * 0.50;
    const annualRecruitment = selectRecruitmentThroughputV2(state, WORLD_CONTENT_V2, bel) * 52;
    expect(annualRecruitment).toBeGreaterThan(0);
    expect(annualRecruitment).toBeLessThan(territory.army.capacity * 0.08);
  });

  it('starts partially staffed at the complete population-based cap', () => {
    const state = createWorldStateV2(406);
    const small = selectArmyStrengthV2(state, WORLD_CONTENT_V2, isl);
    const large = selectArmyStrengthV2(state, WORLD_CONTENT_V2, usa);
    expect(small.fillRatio).toBeCloseTo(
      initialArmyCapacityRatioV2(WORLD_CONTENT_V2, isl)
        / countryTraitFactorV2(isl, 'army-capacity'),
      3,
    );
    expect(large.fillRatio).toBeCloseTo(
      initialArmyCapacityRatioV2(WORLD_CONTENT_V2, usa)
        / countryTraitFactorV2(usa, 'army-capacity'),
      3,
    );
    expect(small.capacity).toBeCloseTo(small.capacityTarget, 6);
    expect(large.capacity).toBeCloseTo(large.capacityTarget, 6);
  });

  it('makes supply research improve a real route factor without exceeding one', () => {
    const state = createWorldStateV2(407);
    const base = supplyFactorV2(state, WORLD_CONTENT_V2, bel, belTerritory, false);
    state.players[bel].research.effectLevels.supply = 20;
    const improved = supplyFactorV2(state, WORLD_CONTENT_V2, bel, belTerritory, false);
    expect(improved).toBeGreaterThan(base);
    expect(improved).toBeLessThanOrEqual(1);
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

  it('funds food first and never invents an army-expansion budget after real upkeep', () => {
    const state = createWorldStateV2(409);
    for (const id of WORLD_CONTENT_V2.nationIds) {
      if (state.wars.some((war) => war.attackerId === id || war.defenderId === id)) continue;
      const strength = selectArmyStrengthV2(state, WORLD_CONTENT_V2, id);
      const finance = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, id);
      expect(strength.capacityTarget, String(id)).toBeCloseTo(strength.capacity, 6);
      if (finance.foodCoverage >= 0.98) {
        expect(
          finance.armyUpkeep * finance.mandatoryFundingRatio
          + finance.recruitment
          + finance.reserveTrainingCost
          + finance.standingOperations,
          String(id),
        ).toBeCloseTo(finance.military, 5);
      } else {
        expect(finance.foodProduction, String(id)).toBeGreaterThan(0);
      }
    }
  });

  it('fills an active-army shortage before training the national reserve pool', () => {
    const state = createWorldStateV2(410);
    const target = selectArmyCapacityTargetV2(state, WORLD_CONTENT_V2, bel);
    state.territories[belTerritory].army.capacity = target;
    state.territories[belTerritory].army.manpower = target * 0.50;
    state.players[bel].treasury = 100;
    state.players[bel].budget = { military: 90, research: 5, development: 5 };
    const reservesBefore = state.players[bel].trainedReserves;
    const before = { ...state.territories[belTerritory].army };
    const plans = createFinancePlansV2(state, WORLD_CONTENT_V2);
    expect(plans.get(bel)!.recruitment).toBeGreaterThan(0);
    processFinanceMilitaryV2(state, WORLD_CONTENT_V2, plans);
    expect(state.territories[belTerritory].army.capacity).toBe(before.capacity);
    expect(state.territories[belTerritory].army.manpower).toBeGreaterThan(before.manpower);
    expect(state.players[bel]).not.toHaveProperty('manpower');
    expect(state.players[bel].trainedReserves).toBe(reservesBefore);
  });

  it('exposes one canonical finance projection including operating and reserve flows', () => {
    const finance = selectWeeklyFinanceBreakdownV2(createWorldStateV2(411), WORLD_CONTENT_V2, bel);
    expect(Object.keys(finance).sort()).toEqual([
      'acceleratedDemobilization', 'acceleratedRecruitment', 'activeBudget', 'aiEfficiency', 'aiMode', 'annualEconomyGrowthRate', 'armyUpkeep', 'baseOperatingCost',
      'ceasefireIncome', 'ceasefirePayment', 'closingTreasury', 'condition', 'conditionFundingRatio', 'debtPremium', 'demobilizationCost', 'development',
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
