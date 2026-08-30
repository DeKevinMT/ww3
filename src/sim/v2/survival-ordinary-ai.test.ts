import { describe, expect, it } from 'vitest';
import { WorldEngineV2 } from './WorldEngineV2';
import {
  ANTARCTIC_TERRITORY_IDS_V2,
  ROGUE_AI_NATION_ID_V2,
  type WorldContentV2,
} from './content';
import { resolveScenarioV2 } from './scenarios';
import {
  selectSurvivalDawnlineLeaderIdV2,
  survivalDawnlineNationIdsV2,
} from './survivalEmpire';
import {
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import {
  SURVIVAL_ORDINARY_AI_CAPACITY_FACTOR_V2,
  SURVIVAL_ORDINARY_AI_REINFORCEMENT_FACTOR_V2,
  isSurvivalOrdinaryAiNationV2,
  survivalOrdinaryAiReinforcementFactorV2,
  survivalOrdinaryAiTerritoryCapacityFactorV2,
} from './survivalOrdinaryAi';
import { nationIdV2, territoryIdV2 } from './types';

function createUnformedSurvival(seed = 70_081): {
  engine: WorldEngineV2;
  content: WorldContentV2;
} {
  const resolved = resolveScenarioV2({ mode: 'survival', seed });
  const engine = new WorldEngineV2(seed, resolved.content);
  expect(engine.chooseCountry('grl')).toEqual({ accepted: true });
  return { engine, content: resolved.content };
}

describe('ordinary Survival AI weakening', () => {
  it('keeps Dawnline pristine while every ordinary world country becomes machine transit', () => {
    const seed = 70_080;
    const resolved = resolveScenarioV2({ mode: 'survival', seed });
    const engine = new WorldEngineV2(seed, resolved.content);
    const greenland = nationIdV2('grl');
    const germany = nationIdV2('deu');
    const germanyTerritory = territoryIdV2('deu');
    const netherlandsTerritory = territoryIdV2('nld');
    const antarcticTerritory = ANTARCTIC_TERRITORY_IDS_V2[0]!;

    expect(engine.chooseCountry(greenland)).toEqual({ accepted: true });
    const dawnlineMembers = survivalDawnlineNationIdsV2(
      engine.state,
      resolved.content,
      new Set([greenland]),
    );
    const dawnlineTerritoryId = resolved.content.territoryIds.find((territoryId) => (
      engine.state.territories[territoryId]?.owner === dawnlineMembers[0]
    ))!;
    const dawnlineBefore = structuredClone(engine.state.territories[dawnlineTerritoryId]!);
    const unlockedMemberManpower = engine.state.territories[netherlandsTerritory]!.army.manpower;
    const rogueManpowerBefore = ANTARCTIC_TERRITORY_IDS_V2.reduce((sum, territoryId) => (
      sum + engine.state.territories[territoryId]!.army.manpower
    ), 0);
    const germanConnectionsBefore = resolved.content.territories[germanyTerritory]!.connections;

    expect(engine.formSurvivalEmpire(greenland, ['nld'])).toEqual({ accepted: true });

    const damaged = engine.state.territories[germanyTerritory]!;
    const dawnlineLeader = selectSurvivalDawnlineLeaderIdV2(engine.state)!;
    expect(engine.state.players[germany]).toBeUndefined();
    expect(damaged.owner).toBe(ROGUE_AI_NATION_ID_V2);
    expect(isSurvivalOrdinaryAiNationV2(engine.state, resolved.content, dawnlineLeader)).toBe(false);
    expect(isSurvivalOrdinaryAiNationV2(engine.state, resolved.content, greenland)).toBe(false);
    expect(isSurvivalOrdinaryAiNationV2(
      engine.state,
      resolved.content,
      ROGUE_AI_NATION_ID_V2,
    )).toBe(false);
    expect(survivalOrdinaryAiTerritoryCapacityFactorV2(
      engine.state,
      resolved.content,
      dawnlineTerritoryId,
      dawnlineLeader,
    )).toBe(1);
    expect(survivalOrdinaryAiTerritoryCapacityFactorV2(
      engine.state,
      resolved.content,
      antarcticTerritory,
      ROGUE_AI_NATION_ID_V2,
    )).toBe(1);
    expect(engine.state.territories[netherlandsTerritory]).toMatchObject({
      owner: greenland,
      coreOwner: greenland,
      integration: 1,
    });
    expect(engine.state.territories[netherlandsTerritory]!.army.manpower)
      .toBe(unlockedMemberManpower);
    expect(survivalOrdinaryAiTerritoryCapacityFactorV2(
      engine.state,
      resolved.content,
      netherlandsTerritory,
      greenland,
    )).toBe(1);
    expect(engine.state.territories[dawnlineTerritoryId]!.owner).toBe(dawnlineLeader);
    expect(engine.state.territories[dawnlineTerritoryId]!.economy)
      .toBeCloseTo(dawnlineBefore.economy, 9);
    expect(engine.state.territories[dawnlineTerritoryId]!.army.capacity)
      .toBeGreaterThan(dawnlineBefore.army.capacity / SURVIVAL_ORDINARY_AI_CAPACITY_FACTOR_V2 * 0.90);
    expect(engine.state.territories[dawnlineTerritoryId]!.army.manpower)
      .toBeCloseTo(engine.state.territories[dawnlineTerritoryId]!.army.capacity, 9);
    expect(ANTARCTIC_TERRITORY_IDS_V2.reduce((sum, territoryId) => (
      sum + engine.state.territories[territoryId]!.army.manpower
    ), 0)).toBeCloseTo(rogueManpowerBefore, 8);
    expect(resolved.content.territories[germanyTerritory]!.connections)
      .toBe(germanConnectionsBefore);
  });

  it('keeps active rebuilding symmetric while ordinary reserve training stays weak', () => {
    const { engine, content } = createUnformedSurvival();
    const germany = nationIdV2('can');
    const germanyTerritory = territoryIdV2('can');
    const greenland = nationIdV2('grl');
    const territory = engine.state.territories[germanyTerritory]!;
    territory.army.manpower = 0;
    engine.state.players[germany]!.trainedReserves = 0;
    engine.state.players[germany]!.treasury = 1_000_000;
    engine.state.players[germany]!.budget = {
      military: 100,
      research: 0,
      development: 0,
    };

    const ordinaryPlan = selectWeeklyFinanceBreakdownV2(engine.state, content, germany);
    const controlContent: WorldContentV2 = {
      ...content,
      metadata: {
        ...content.metadata!,
        scenarioId: 'standard-2026',
      },
    };
    const normalPlan = selectWeeklyFinanceBreakdownV2(engine.state, controlContent, germany);
    const ordinaryActiveRecovery = ordinaryPlan.passiveRecruitment
      + ordinaryPlan.acceleratedRecruitment;
    const normalActiveRecovery = normalPlan.passiveRecruitment
      + normalPlan.acceleratedRecruitment;

    expect(survivalOrdinaryAiReinforcementFactorV2(engine.state, content, germany))
      .toBe(SURVIVAL_ORDINARY_AI_REINFORCEMENT_FACTOR_V2);
    expect(survivalOrdinaryAiReinforcementFactorV2(engine.state, content, greenland)).toBe(1);
    expect(survivalOrdinaryAiReinforcementFactorV2(
      engine.state,
      content,
      ROGUE_AI_NATION_ID_V2,
    )).toBe(1);
    expect(survivalOrdinaryAiReinforcementFactorV2(
      engine.state,
      controlContent,
      germany,
    )).toBe(1);
    expect(ordinaryActiveRecovery).toBeGreaterThan(0);
    expect(normalActiveRecovery).toBeCloseTo(ordinaryActiveRecovery, 9);
    expect(ordinaryPlan.reserveTraining).toBeLessThanOrEqual(normalPlan.reserveTraining * 0.11);
  });

  it('applies the same limit to wartime reserve mobilisation', () => {
    const { engine, content } = createUnformedSurvival(70_082);
    const germany = nationIdV2('can');
    const france = nationIdV2('grl');
    const germanyTerritory = territoryIdV2('can');
    const territory = engine.state.territories[germanyTerritory]!;
    territory.army.manpower = territory.army.capacity * 0.20;
    engine.state.wars.push({
      id: `war-${engine.state.nextWarId++}`,
      attackerId: germany,
      defenderId: france,
      startedTick: engine.state.tick,
      lastBattleTick: engine.state.tick,
      warScore: 0,
      battles: 0,
      attackerLosses: 0,
      defenderLosses: 0,
      attackerCivilianLosses: 0,
      defenderCivilianLosses: 0,
      lastPeaceOfferTick: -1_000_000,
      revenge: null,
      attackerOperations: [],
      defenderOperations: [],
    });
    territory.army.manpower = 0;
    engine.state.players[germany]!.trainedReserves = territory.army.capacity;
    engine.state.players[germany]!.treasury = 1_000_000;
    engine.state.players[germany]!.budget = {
      military: 100,
      research: 0,
      development: 0,
    };
    const ordinaryPlan = selectWeeklyFinanceBreakdownV2(engine.state, content, germany);
    const controlContent: WorldContentV2 = {
      ...content,
      metadata: {
        ...content.metadata!,
        scenarioId: 'standard-2026',
      },
    };
    const normalPlan = selectWeeklyFinanceBreakdownV2(engine.state, controlContent, germany);

    expect(ordinaryPlan.reserveDeployment).toBeGreaterThan(0);
    expect(normalPlan.reserveDeployment).toBeGreaterThan(ordinaryPlan.reserveDeployment);
    expect(ordinaryPlan.reserveDeployment / normalPlan.reserveDeployment)
      .toBeLessThanOrEqual(SURVIVAL_ORDINARY_AI_REINFORCEMENT_FACTOR_V2 + 0.01);
  });
});
