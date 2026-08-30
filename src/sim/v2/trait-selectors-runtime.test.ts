import { describe, expect, it } from 'vitest';
import {
  FOOD_MAX_STOCK_WEEKS,
  RESEARCH_CATCH_UP_FULL_GAP,
  WAR_FATIGUE_OPERATION_COST_MAX_BONUS,
  warAccessOperationMultiplierV2,
} from './balance';
import { createWorldStateV2 } from './bootstrap';
import {
  WORLD_CONTENT_V2,
  type NationContentV2,
  type TerritoryContentV2,
  type WorldContentV2,
} from './content';
import {
  createPowerSnapshotV2,
  invalidateTerritoryIndexV2,
  selectBaseOperatingCostShareV2,
  selectConquestForecastV2,
  selectFoodAccessCeilingV2,
  selectFoodDemandV2,
  selectFoodLandCapacityV2,
  selectFoodStorageCapacityV2,
  selectPopulationDynamicsV2,
  selectRecruitmentThroughputV2,
  selectRecruitmentTrainingPipelineV2,
  selectRecruitmentUnitCostV2,
  selectResearchCatchUpFactorV2,
  selectResearchOutputV2,
  selectResearchPortfolioV2,
  selectTaxEfficiencyMultiplierV2,
  selectTotalManpowerV2,
  selectTrainedReserveCapacityV2,
  selectTreasurySeizureShareV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import { countryTraitFactorV2 } from './traits';
import {
  nationIdV2,
  territoryIdV2,
  type NationStateV2,
  type PlayerId,
  type TerritoryId,
  type WorldStateV2,
} from './types';

interface IdentityFixtureV2 {
  traitId: PlayerId;
  traitState: WorldStateV2;
  traitContent: WorldContentV2;
  neutralId: PlayerId;
  neutralState: WorldStateV2;
  neutralContent: WorldContentV2;
}

function remapToNeutralIdentityV2(
  state: WorldStateV2,
  content: WorldContentV2,
  sourceId: PlayerId,
  neutralId: PlayerId,
): WorldContentV2 {
  const players = state.players as unknown as Record<string, NationStateV2>;
  players[neutralId] = players[sourceId]!;
  delete players[sourceId];
  for (const territory of Object.values(state.territories)) {
    if (territory.owner === sourceId) territory.owner = neutralId;
    if (territory.coreOwner === sourceId) territory.coreOwner = neutralId;
  }
  if (state.humanPlayerId === sourceId) state.humanPlayerId = neutralId;
  state.humanPlayerIds = state.humanPlayerIds.map((id) => (
    id === sourceId ? neutralId : id
  ));

  const nations = { ...content.nations } as unknown as Record<string, NationContentV2>;
  nations[neutralId] = { ...nations[sourceId]!, id: neutralId };
  delete nations[sourceId];
  const territories = Object.fromEntries(Object.entries(content.territories).map(([id, territory]) => [
    id,
    territory.initialOwnerId === sourceId
      ? { ...territory, initialOwnerId: neutralId }
      : territory,
  ])) as unknown as Record<string, TerritoryContentV2>;
  return {
    ...content,
    nationIds: content.nationIds.map((id) => id === sourceId ? neutralId : id),
    nations: nations as WorldContentV2['nations'],
    territories: territories as WorldContentV2['territories'],
  };
}

function identityFixtureV2(country: string, seed: number): IdentityFixtureV2 {
  const traitId = nationIdV2(country);
  const neutralId = nationIdV2(`neutral-${country}`);
  const traitState = createWorldStateV2(seed);
  const neutralState = createWorldStateV2(seed);
  const neutralContent = remapToNeutralIdentityV2(
    neutralState,
    WORLD_CONTENT_V2,
    traitId,
    neutralId,
  );
  return {
    traitId,
    traitState,
    traitContent: WORLD_CONTENT_V2,
    neutralId,
    neutralState,
    neutralContent,
  };
}

function configureBothV2(
  fixture: IdentityFixtureV2,
  configure: (state: WorldStateV2, playerId: PlayerId, content: WorldContentV2) => void,
): void {
  configure(fixture.traitState, fixture.traitId, fixture.traitContent);
  configure(fixture.neutralState, fixture.neutralId, fixture.neutralContent);
}

function setArmyFillV2(state: WorldStateV2, playerId: PlayerId, ratio: number): void {
  for (const territory of Object.values(state.territories)) {
    if (territory.owner === playerId) territory.army.manpower = territory.army.capacity * ratio;
  }
}

function firstOwnedTerritoryV2(state: WorldStateV2, playerId: PlayerId): TerritoryId {
  const owned = Object.entries(state.territories).find(([, territory]) => territory.owner === playerId);
  if (owned) return territoryIdV2(owned[0]);
  // Some canonical micro-polygons are represented through a shared map body.
  // A synthetic operation test only needs one identical live source on both
  // sides of the neutral-identity comparison.
  const fallbackEntry = Object.entries(state.territories)[0];
  if (!fallbackEntry) throw new Error(`Missing operation source for ${playerId}.`);
  const [fallbackId, fallback] = fallbackEntry;
  fallback.owner = playerId;
  fallback.coreOwner = playerId;
  invalidateTerritoryIndexV2(state);
  return territoryIdV2(fallbackId);
}

function addOperationWarV2(
  state: WorldStateV2,
  playerId: PlayerId,
  opponentId: PlayerId,
  accesses: readonly ('land' | 'naval')[],
): { sourceId: TerritoryId; targetId: TerritoryId } {
  const sourceId = firstOwnedTerritoryV2(state, playerId);
  const targetId = firstOwnedTerritoryV2(state, opponentId);
  state.wars = [{
    id: `trait-war-${playerId}`,
    attackerId: playerId,
    defenderId: opponentId,
    startedTick: 0,
    lastBattleTick: 0,
    warScore: 0,
    battles: 0,
    attackerLosses: 0,
    defenderLosses: 0,
    lastPeaceOfferTick: -1,
    attackerOperations: accesses.map((access, index) => ({
      commanderId: playerId,
      sourceId,
      targetId,
      doctrine: 'pressure',
      access,
      startedTick: index,
      lastBattleTick: 0,
      holdUntilTick: 0,
      momentum: 0,
    })),
    defenderOperations: [],
  }];
  return { sourceId, targetId };
}

function withSeaRouteV2(
  content: WorldContentV2,
  sourceId: TerritoryId,
  targetId: TerritoryId,
  distanceKm: number,
): WorldContentV2 {
  const territories = { ...content.territories } as unknown as Record<string, TerritoryContentV2>;
  const source = territories[sourceId]!;
  territories[sourceId] = {
    ...source,
    connections: [
      ...source.connections.filter((connection) => connection.targetId !== targetId),
      { targetId, kind: 'sea', distanceKm },
    ],
  };
  return { ...content, territories: territories as WorldContentV2['territories'] };
}

describe('retired country-trait selector runtime', () => {
  it('keeps fiscal selectors neutral and cannot inherit an annexed country trait', () => {
    const belgium = identityFixtureV2('bel', 82_001);
    expect(selectTaxEfficiencyMultiplierV2(belgium.traitState, belgium.traitId)
      / selectTaxEfficiencyMultiplierV2(belgium.neutralState, belgium.neutralId))
      .toBeCloseTo(countryTraitFactorV2(belgium.traitId, 'tax-efficiency', {
        humanControlled: true,
      }), 8);
    expect(selectBaseOperatingCostShareV2(belgium.traitState, belgium.traitId)
      / selectBaseOperatingCostShareV2(belgium.neutralState, belgium.neutralId))
      .toBeCloseTo(countryTraitFactorV2(belgium.traitId, 'base-operating-cost', {
        humanControlled: true,
      }), 8);

    const fusionState = createWorldStateV2(82_002);
    const netherlands = nationIdV2('nld');
    const belgianId = nationIdV2('bel');
    for (const territory of Object.values(fusionState.territories)) {
      if (territory.owner === belgianId) territory.owner = netherlands;
    }
    invalidateTerritoryIndexV2(fusionState);
    expect(selectTaxEfficiencyMultiplierV2(fusionState, netherlands)).toBe(1);
  });

  it('keeps recruitment cost, throughput and reserve capacity neutral', () => {
    const china = identityFixtureV2('chn', 82_010);
    expect(selectRecruitmentUnitCostV2(china.traitState, china.traitId, china.traitContent)
      / selectRecruitmentUnitCostV2(china.neutralState, china.neutralId, china.neutralContent))
      .toBeCloseTo(countryTraitFactorV2(china.traitId, 'recruitment-cost'), 5);

    const venezuela = identityFixtureV2('ven', 82_011);
    expect(selectRecruitmentTrainingPipelineV2(
      venezuela.traitState, venezuela.traitContent, venezuela.traitId,
    ) / selectRecruitmentTrainingPipelineV2(
      venezuela.neutralState, venezuela.neutralContent, venezuela.neutralId,
    )).toBeCloseTo(countryTraitFactorV2(venezuela.traitId, 'recruitment-throughput'), 2);

    const guatemala = identityFixtureV2('gtm', 82_013);
    expect(selectTrainedReserveCapacityV2(guatemala.traitState, guatemala.traitId)
      / selectTrainedReserveCapacityV2(guatemala.neutralState, guatemala.neutralId))
      .toBeCloseTo(countryTraitFactorV2(guatemala.traitId, 'reserve-capacity'), 5);

    const india = identityFixtureV2('ind', 82_014);
    configureBothV2(india, (state, playerId) => setArmyFillV2(state, playerId, 0));
    const peacefulTrait = selectRecruitmentThroughputV2(
      india.traitState, india.traitContent, india.traitId,
    );
    const peacefulNeutral = selectRecruitmentThroughputV2(
      india.neutralState, india.neutralContent, india.neutralId,
    );
    expect(peacefulTrait / peacefulNeutral)
      .toBeCloseTo(countryTraitFactorV2(india.traitId, 'passive-recruitment', { atWar: false }), 3);
    addOperationWarV2(india.traitState, india.traitId, nationIdV2('nld'), ['land']);
    addOperationWarV2(india.neutralState, india.neutralId, nationIdV2('nld'), ['land']);
    expect(selectRecruitmentThroughputV2(
      india.traitState, india.traitContent, india.traitId,
    )).toBeCloseTo(selectRecruitmentThroughputV2(
      india.neutralState, india.neutralContent, india.neutralId,
    ), 5);
  });

  it('keeps reserve training, deployment and accelerated recruitment neutral', () => {
    const guatemala = identityFixtureV2('gtm', 82_020);
    configureBothV2(guatemala, (state, playerId) => {
      state.players[playerId]!.treasury = 1_000_000;
      state.players[playerId]!.foodSecurity = 1;
      state.players[playerId]!.trainedReserves = 0;
      state.players[playerId]!.budget = { military: 100, research: 0, development: 0 };
      setArmyFillV2(state, playerId, 1);
    });
    const gtmTrait = selectWeeklyFinanceBreakdownV2(
      guatemala.traitState, guatemala.traitContent, guatemala.traitId,
    );
    const gtmNeutral = selectWeeklyFinanceBreakdownV2(
      guatemala.neutralState, guatemala.neutralContent, guatemala.neutralId,
    );
    const gtmPipelineRatio = selectRecruitmentTrainingPipelineV2(
      guatemala.traitState, guatemala.traitContent, guatemala.traitId,
    ) / selectRecruitmentTrainingPipelineV2(
      guatemala.neutralState, guatemala.neutralContent, guatemala.neutralId,
    );
    expect(gtmTrait.reserveTraining / gtmNeutral.reserveTraining)
      .toBeCloseTo(
        gtmPipelineRatio * countryTraitFactorV2(guatemala.traitId, 'reserve-training'),
        2,
      );

    const korea = identityFixtureV2('kor', 82_021);
    configureBothV2(korea, (state, playerId) => {
      state.players[playerId]!.treasury = 1_000_000;
      state.players[playerId]!.foodSecurity = 1;
      state.players[playerId]!.budget = { military: 100, research: 0, development: 0 };
      setArmyFillV2(state, playerId, 0.40);
    });
    const korTrait = selectWeeklyFinanceBreakdownV2(korea.traitState, korea.traitContent, korea.traitId);
    const korNeutral = selectWeeklyFinanceBreakdownV2(
      korea.neutralState, korea.neutralContent, korea.neutralId,
    );
    // The paid readiness curve is retired; both identities therefore expose
    // the same neutral zero rather than an undefined 0 / 0 ratio.
    expect(korTrait.acceleratedRecruitment).toBe(0);
    expect(korNeutral.acceleratedRecruitment).toBe(0);
    expect(countryTraitFactorV2(korea.traitId, 'accelerated-recruitment')).toBe(1);

    const cuba = identityFixtureV2('cub', 82_022);
    configureBothV2(cuba, (state, playerId) => {
      state.players[playerId]!.treasury = 1_000_000;
      state.players[playerId]!.foodSecurity = 1;
      state.players[playerId]!.trainedReserves = 1_000_000;
      state.players[playerId]!.budget = { military: 100, research: 0, development: 0 };
      setArmyFillV2(state, playerId, 0.40);
      addOperationWarV2(state, playerId, nationIdV2('nld'), ['land']);
    });
    const cubTrait = selectWeeklyFinanceBreakdownV2(cuba.traitState, cuba.traitContent, cuba.traitId);
    const cubNeutral = selectWeeklyFinanceBreakdownV2(
      cuba.neutralState, cuba.neutralContent, cuba.neutralId,
    );
    expect(cubTrait.reserveDeployment / cubNeutral.reserveDeployment)
      .toBeCloseTo(countryTraitFactorV2(cuba.traitId, 'reserve-deployment-throughput'), 3);
  });

  it('keeps development and demographic selectors neutral', () => {
    const dominicanRepublic = identityFixtureV2('dom', 82_030);
    configureBothV2(dominicanRepublic, (state, playerId) => {
      state.players[playerId]!.treasury = 1_000_000;
      state.players[playerId]!.foodSecurity = 1;
      state.players[playerId]!.budget = { military: 0, research: 0, development: 100 };
    });
    const domTrait = selectWeeklyFinanceBreakdownV2(
      dominicanRepublic.traitState, dominicanRepublic.traitContent, dominicanRepublic.traitId,
    );
    const domNeutral = selectWeeklyFinanceBreakdownV2(
      dominicanRepublic.neutralState, dominicanRepublic.neutralContent, dominicanRepublic.neutralId,
    );
    expect(domTrait.economyInvestmentGrowthRate / domNeutral.economyInvestmentGrowthRate)
      .toBeCloseTo(countryTraitFactorV2(dominicanRepublic.traitId,
        'development-economy-growth', { atWar: false }), 3);
    expect(domTrait.economyBaseGrowthRate).toBe(domNeutral.economyBaseGrowthRate);

    const india = identityFixtureV2('ind', 82_031);
    const traitUnfunded = selectPopulationDynamicsV2(
      india.traitState, india.traitContent, india.traitId, 0,
    );
    const traitFunded = selectPopulationDynamicsV2(
      india.traitState, india.traitContent, india.traitId, 10_000,
    );
    const neutralUnfunded = selectPopulationDynamicsV2(
      india.neutralState, india.neutralContent, india.neutralId, 0,
    );
    const neutralFunded = selectPopulationDynamicsV2(
      india.neutralState, india.neutralContent, india.neutralId, 10_000,
    );
    expect((traitFunded.annualBirthRate - traitUnfunded.annualBirthRate)
      / (neutralFunded.annualBirthRate - neutralUnfunded.annualBirthRate))
      .toBeCloseTo(countryTraitFactorV2(india.traitId, 'population-growth-funding'), 4);
  });

  it('keeps research output, catch-up and branch progress neutral', () => {
    const estonia = identityFixtureV2('est', 82_040);
    const sharedFinance = selectWeeklyFinanceBreakdownV2(
      estonia.neutralState, estonia.neutralContent, estonia.neutralId,
    );
    expect(selectResearchOutputV2(
      estonia.traitState, estonia.traitContent, estonia.traitId, sharedFinance, 1,
    ) / selectResearchOutputV2(
      estonia.neutralState, estonia.neutralContent, estonia.neutralId, sharedFinance, 1,
    )).toBeCloseTo(countryTraitFactorV2(estonia.traitId, 'research-output'), 5);

    const catchUpEstonia = identityFixtureV2('est', 82_041);
    const traitCatchUp = selectResearchCatchUpFactorV2(
      catchUpEstonia.traitState,
      catchUpEstonia.traitContent,
      catchUpEstonia.traitId,
      { byNation: new Map(), leaderPower: 1, leaderBreakthroughs: RESEARCH_CATCH_UP_FULL_GAP },
    );
    const neutralCatchUp = selectResearchCatchUpFactorV2(
      catchUpEstonia.neutralState,
      catchUpEstonia.neutralContent,
      catchUpEstonia.neutralId,
      { byNation: new Map(), leaderPower: 1, leaderBreakthroughs: RESEARCH_CATCH_UP_FULL_GAP },
    );
    expect((traitCatchUp - 1) / (neutralCatchUp - 1))
      .toBeCloseTo(countryTraitFactorV2(catchUpEstonia.traitId,
        'research-catch-up-bonus'), 5);

    const china = identityFixtureV2('chn', 82_042);
    const finance = selectWeeklyFinanceBreakdownV2(
      china.neutralState, china.neutralContent, china.neutralId,
    );
    const traitPortfolio = selectResearchPortfolioV2(
      china.traitState,
      china.traitContent,
      china.traitId,
      finance,
      createPowerSnapshotV2(china.traitState, china.traitContent),
      1,
    );
    const neutralPortfolio = selectResearchPortfolioV2(
      china.neutralState,
      china.neutralContent,
      china.neutralId,
      finance,
      createPowerSnapshotV2(china.neutralState, china.neutralContent),
      1,
    );
    const traitIndustry = traitPortfolio.find((entry) => entry.branch === 'military-industry')!;
    const neutralIndustry = neutralPortfolio.find((entry) => entry.branch === 'military-industry')!;
    expect(traitIndustry.weeklyProgress / neutralIndustry.weeklyProgress)
      .toBeCloseTo(countryTraitFactorV2(china.traitId, 'research-progress', {
        researchBranch: 'military-industry',
      }), 5);
  });

  it('keeps food capacity, costs, storage, access and export income neutral', () => {
    const argentina = identityFixtureV2('arg', 82_050);
    expect(selectFoodLandCapacityV2(
      argentina.traitState, argentina.traitContent, argentina.traitId,
    ) / selectFoodLandCapacityV2(
      argentina.neutralState, argentina.neutralContent, argentina.neutralId,
    )).toBeCloseTo(countryTraitFactorV2(argentina.traitId, 'food-production'), 5);

    const honduras = identityFixtureV2('hnd', 82_051);
    configureBothV2(honduras, (state, playerId) => {
      state.players[playerId]!.treasury = 1_000_000_000;
      state.players[playerId]!.foodStock = 0;
      state.players[playerId]!.foodSecurity = 0;
      state.players[playerId]!.domesticFoodCapacity = 0;
    });
    const hndTrait = selectWeeklyFinanceBreakdownV2(honduras.traitState, honduras.traitContent, honduras.traitId);
    const hndNeutral = selectWeeklyFinanceBreakdownV2(
      honduras.neutralState, honduras.neutralContent, honduras.neutralId,
    );
    expect(hndTrait.foodProduction).toBe(0);
    expect(hndTrait.foodProduction).toBe(hndNeutral.foodProduction);
    expect(hndTrait.foodImported).toBe(0);
    expect(hndTrait.foodImported).toBe(hndNeutral.foodImported);

    const venezuela = identityFixtureV2('ven', 82_052);
    configureBothV2(venezuela, (state, playerId) => {
      state.players[playerId]!.treasury = 1_000_000_000;
      state.players[playerId]!.foodStock = 0;
      state.players[playerId]!.foodSecurity = 0;
      state.players[playerId]!.domesticFoodCapacity = 1_000_000;
    });
    const venTrait = selectWeeklyFinanceBreakdownV2(
      venezuela.traitState, venezuela.traitContent, venezuela.traitId,
    );
    const venNeutral = selectWeeklyFinanceBreakdownV2(
      venezuela.neutralState, venezuela.neutralContent, venezuela.neutralId,
    );
    expect(venTrait.foodProduction).toBe(0);
    expect(venTrait.foodProduction).toBe(venNeutral.foodProduction);

    const mongolia = identityFixtureV2('mng', 82_053);
    const mngDemand = selectFoodDemandV2(mongolia.traitState, mongolia.traitId);
    const mngTraitStorage = selectFoodStorageCapacityV2(
      mongolia.traitState, mongolia.traitContent, mongolia.traitId,
    );
    const mngNeutralStorage = selectFoodStorageCapacityV2(
      mongolia.neutralState, mongolia.neutralContent, mongolia.neutralId,
    );
    // Mongolia's reworked identity no longer carries a generic food-storage bonus.
    expect(mngTraitStorage).toBeCloseTo(mngNeutralStorage, 9);
    expect(mngTraitStorage).toBeLessThanOrEqual(mngDemand * FOOD_MAX_STOCK_WEEKS + 0.000001);

    const palestine = identityFixtureV2('psx', 82_054);
    expect(selectFoodAccessCeilingV2(
      palestine.traitState, palestine.traitContent, palestine.traitId,
    )).toBe(selectFoodAccessCeilingV2(
      palestine.neutralState, palestine.neutralContent, palestine.neutralId,
    ));

    const ghana = identityFixtureV2('gha', 82_055);
    configureBothV2(ghana, (state, playerId, content) => {
      state.players[playerId]!.treasury = 1_000_000_000;
      state.players[playerId]!.foodSecurity = 0;
      const demand = selectFoodDemandV2(state, playerId);
      state.players[playerId]!.research.effectLevels['food-production'] = 100;
      for (const [territoryId, territory] of Object.entries(state.territories)) {
        if (territory.owner !== playerId) continue;
        territory.economy = (content.territories[territoryIdV2(territoryId)]?.baseline.gdp ?? territory.economy) * 1.5;
      }
      state.players[playerId]!.domesticFoodCapacity = demand * 3;
      state.players[playerId]!.foodStock = selectFoodStorageCapacityV2(
        state, content, playerId, demand,
      );
    });
    const ghaTrait = selectWeeklyFinanceBreakdownV2(ghana.traitState, ghana.traitContent, ghana.traitId);
    const ghaNeutral = selectWeeklyFinanceBreakdownV2(
      ghana.neutralState, ghana.neutralContent, ghana.neutralId,
    );
    expect(ghaTrait.foodExported).toBe(0);
    expect(ghaTrait.foodExported).toBe(ghaNeutral.foodExported);
    expect(ghaTrait.foodExportIncome).toBe(0);
    expect(ghaTrait.foodExportIncome).toBe(ghaNeutral.foodExportIncome);
  });

  it('keeps operation, naval-distance, fatigue and food-logistics layers neutral', () => {
    const cameroon = identityFixtureV2('cmr', 82_060);
    configureBothV2(cameroon, (state, playerId) => {
      state.players[playerId]!.treasury = 1_000_000;
      state.players[playerId]!.warFatigue = 0;
      addOperationWarV2(state, playerId, nationIdV2('nld'), ['land', 'naval']);
    });
    const cmrTrait = selectWeeklyFinanceBreakdownV2(cameroon.traitState, cameroon.traitContent, cameroon.traitId);
    const cmrNeutral = selectWeeklyFinanceBreakdownV2(
      cameroon.neutralState, cameroon.neutralContent, cameroon.neutralId,
    );
    expect(cmrTrait.warOperations / cmrNeutral.warOperations)
      .toBeCloseTo(countryTraitFactorV2(cameroon.traitId, 'operation-cost', {
        bothFronts: true,
      }), 4);

    const denmark = identityFixtureV2('dnk', 82_061);
    const traitRoute = addOperationWarV2(
      denmark.traitState, denmark.traitId, nationIdV2('nld'), ['naval'],
    );
    const neutralRoute = addOperationWarV2(
      denmark.neutralState, denmark.neutralId, nationIdV2('nld'), ['naval'],
    );
    denmark.traitContent = withSeaRouteV2(
      denmark.traitContent, traitRoute.sourceId, traitRoute.targetId, 9_000,
    );
    denmark.neutralContent = withSeaRouteV2(
      denmark.neutralContent, neutralRoute.sourceId, neutralRoute.targetId, 9_000,
    );
    const dnkTrait = selectWeeklyFinanceBreakdownV2(denmark.traitState, denmark.traitContent, denmark.traitId);
    const dnkNeutral = selectWeeklyFinanceBreakdownV2(
      denmark.neutralState, denmark.neutralContent, denmark.neutralId,
    );
    const denmarkDistanceFactor = countryTraitFactorV2(
      denmark.traitId, 'naval-distance-pressure', { access: 'naval' },
    );
    const denmarkRouteLoad = warAccessOperationMultiplierV2('naval', 9_000);
    const denmarkAccessLoad = warAccessOperationMultiplierV2('naval');
    expect(dnkTrait.warOperations / dnkNeutral.warOperations)
      .toBeCloseTo((denmarkAccessLoad
        + (denmarkRouteLoad - denmarkAccessLoad) * denmarkDistanceFactor)
          / denmarkRouteLoad, 4);
    const traitBaseDemand = selectFoodDemandV2(denmark.traitState, denmark.traitId);
    const neutralBaseDemand = selectFoodDemandV2(denmark.neutralState, denmark.neutralId);
    expect((dnkTrait.foodDemand - traitBaseDemand) / (dnkNeutral.foodDemand - neutralBaseDemand))
      .toBeCloseTo(countryTraitFactorV2(denmark.traitId, 'food-logistics-pressure', {
        access: 'naval',
      }), 5);

    const italy = identityFixtureV2('ita', 82_062);
    configureBothV2(italy, (state, playerId) => {
      state.players[playerId]!.warFatigue = 100;
      addOperationWarV2(state, playerId, nationIdV2('nld'), ['land']);
    });
    const itaTrait = selectWeeklyFinanceBreakdownV2(italy.traitState, italy.traitContent, italy.traitId);
    const itaNeutral = selectWeeklyFinanceBreakdownV2(
      italy.neutralState, italy.neutralContent, italy.neutralId,
    );
    const italyFatigueFactor = countryTraitFactorV2(
      italy.traitId, 'war-fatigue-operation-surcharge', { atWar: true },
    );
    expect(itaTrait.warOperations / itaNeutral.warOperations)
      .toBeCloseTo(
        (1 + WAR_FATIGUE_OPERATION_COST_MAX_BONUS * italyFatigueFactor)
          / (1 + WAR_FATIGUE_OPERATION_COST_MAX_BONUS),
        5,
      );
  });

  it('keeps Switzerland on the standard neutral treasury-seizure rule', () => {
    const state = createWorldStateV2(82_070);
    const switzerland = nationIdV2('che');
    const france = nationIdV2('fra');
    state.players[switzerland]!.treasury = 1_000;
    expect(selectTreasurySeizureShareV2(state, switzerland)).toBe(0.25);
    expect(selectTreasurySeizureShareV2(state, france)).toBe(0.25);
    expect(selectConquestForecastV2(
      state, WORLD_CONTENT_V2, france, switzerland,
    ).maxTreasurySeized).toBe(250);
  });
});
