import { describe, expect, it } from 'vitest';
import { WorldEngineV2 } from './WorldEngineV2';
import {
  ANTARCTIC_TERRITORY_IDS_V2,
  ROGUE_AI_NATION_ID_V2,
  type WorldContentV2,
} from './content';
import { resolveScenarioV2 } from './scenarios';
import { selectSurvivalDawnlineLeaderIdV2 } from './survivalEmpire';
import {
  registerCountryMasteryRuntimeV2,
  resetCountryMasteryRuntimeV2,
  selectTerritoryCountryMasteryRuntimeV2,
} from './countryMasteryRuntime';
import {
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import {
  SURVIVAL_BASE_PACKET_ARMY_CAPACITY_FACTOR_V2,
  SURVIVAL_ORDINARY_AI_REINFORCEMENT_FACTOR_V2,
  isSurvivalOrdinaryAiNationV2,
  survivalBasePacketTerritoryCapacityFactorV2,
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

describe('ordinary Survival AI parity', () => {
  it('keeps ordinary sovereigns full-strength beside fused Arctic Base Packets', () => {
    const seed = 70_080;
    const resolved = resolveScenarioV2({ mode: 'survival', seed });
    const engine = new WorldEngineV2(seed, resolved.content);
    const greenland = nationIdV2('grl');
    const germany = nationIdV2('deu');
    const germanyTerritory = territoryIdV2('deu');
    const netherlandsTerritory = territoryIdV2('nld');
    const basePacketTerritoryId = territoryIdV2('can');
    const antarcticTerritory = ANTARCTIC_TERRITORY_IDS_V2[0]!;

    expect(engine.chooseCountry(greenland)).toEqual({ accepted: true });
    const basePacketBefore = structuredClone(engine.state.territories[basePacketTerritoryId]!);
    const unlockedMemberManpower = engine.state.territories[netherlandsTerritory]!.army.manpower;
    const germanConnectionsBefore = resolved.content.territories[germanyTerritory]!.connections;

    const fullControl = new WorldEngineV2(seed, resolved.content);
    expect(fullControl.chooseCountry(greenland)).toEqual({ accepted: true });
    expect(fullControl.formSurvivalEmpire(greenland, ['nld', 'can']))
      .toEqual({ accepted: true });

    expect(engine.formSurvivalEmpire(greenland, ['nld'])).toEqual({ accepted: true });

    const ordinary = engine.state.territories[germanyTerritory]!;
    expect(selectSurvivalDawnlineLeaderIdV2(engine.state)).toBeUndefined();
    expect(engine.state.players[germany]).toBeDefined();
    expect(ordinary.owner).toBe(germany);
    expect(ordinary.coreOwner).toBe(germany);
    expect(ordinary.integration).toBe(1);
    expect(ordinary.army.manpower).toBeCloseTo(ordinary.army.capacity, 9);
    expect(isSurvivalOrdinaryAiNationV2(engine.state, resolved.content, germany)).toBe(true);
    expect(isSurvivalOrdinaryAiNationV2(engine.state, resolved.content, greenland)).toBe(false);
    expect(isSurvivalOrdinaryAiNationV2(
      engine.state,
      resolved.content,
      ROGUE_AI_NATION_ID_V2,
    )).toBe(false);
    expect(survivalOrdinaryAiTerritoryCapacityFactorV2(
      engine.state,
      resolved.content,
      basePacketTerritoryId,
      greenland,
    )).toBe(1);
    expect(survivalBasePacketTerritoryCapacityFactorV2(
      engine.state,
      resolved.content,
      basePacketTerritoryId,
      greenland,
    )).toBe(SURVIVAL_BASE_PACKET_ARMY_CAPACITY_FACTOR_V2);
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
    expect(engine.state.territories[netherlandsTerritory]!.survivalBasePacket).toBeUndefined();
    expect(engine.state.territories[basePacketTerritoryId]).toMatchObject({
      owner: greenland,
      coreOwner: greenland,
      integration: 1,
      survivalBasePacket: true,
    });
    expect(engine.state.territories[basePacketTerritoryId]!.economy)
      .toBeCloseTo(basePacketBefore.economy, 9);
    expect(engine.state.territories[basePacketTerritoryId]!.population)
      .toBeCloseTo(basePacketBefore.population, 9);
    expect(engine.state.territories[basePacketTerritoryId]!.army.capacity)
      .toBeCloseTo(
        fullControl.state.territories[basePacketTerritoryId]!.army.capacity
          * SURVIVAL_BASE_PACKET_ARMY_CAPACITY_FACTOR_V2,
        5,
      );
    expect(engine.state.territories[basePacketTerritoryId]!.army.manpower)
      .toBeCloseTo(engine.state.territories[basePacketTerritoryId]!.army.capacity, 9);
    expect(resolved.content.territoryIds.filter((territoryId) => (
      engine.state.territories[territoryId]?.owner === ROGUE_AI_NATION_ID_V2
        && !ANTARCTIC_TERRITORY_IDS_V2.includes(territoryId)
    ))).toEqual([]);
    expect(resolved.content.territories[germanyTerritory]!.connections)
      .toBe(germanConnectionsBefore);
  });

  it('suppresses locked-country Mastery while retaining it for a full unlocked member', () => {
    const seed = 70_083;
    const { content } = resolveScenarioV2({ mode: 'survival', seed });
    const usa = nationIdV2('usa');
    const belgium = nationIdV2('bel');
    registerCountryMasteryRuntimeV2(content, belgium, {
      armyCapacityMultiplier: 1,
      recruitmentMultiplier: 1,
      reserveTrainingMultiplier: 1,
    });
    registerCountryMasteryRuntimeV2(content, usa, {
      armyCapacityMultiplier: 2,
      recruitmentMultiplier: 2,
      reserveTrainingMultiplier: 1,
    });
    try {
      const base = new WorldEngineV2(seed, content);
      const full = new WorldEngineV2(seed, content);
      expect(base.chooseCountry(belgium)).toEqual({ accepted: true });
      expect(full.chooseCountry(belgium)).toEqual({ accepted: true });
      expect(base.formSurvivalEmpire(belgium, [])).toEqual({ accepted: true });
      expect(full.formSurvivalEmpire(belgium, [usa])).toEqual({ accepted: true });

      const usaTerritoryId = territoryIdV2('usa');
      expect(base.state.territories[usaTerritoryId]!.survivalBasePacket).toBe(true);
      expect(full.state.territories[usaTerritoryId]!.survivalBasePacket).toBeUndefined();
      expect(selectTerritoryCountryMasteryRuntimeV2(
        content,
        usaTerritoryId,
        belgium,
        base.state,
      ).armyCapacityMultiplier).toBe(1);
      expect(selectTerritoryCountryMasteryRuntimeV2(
        content,
        usaTerritoryId,
        belgium,
        full.state,
      ).armyCapacityMultiplier).toBe(2);
      expect(base.state.territories[usaTerritoryId]!.army.capacity).toBeCloseTo(
        full.state.territories[usaTerritoryId]!.army.capacity * 0.25,
        5,
      );
    } finally {
      resetCountryMasteryRuntimeV2(content);
    }
  });

  it('keeps active rebuilding symmetric while reserve compatibility stays neutral', () => {
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
    expect(ordinaryPlan.reserveTraining).toBe(0);
    expect(normalPlan.reserveTraining).toBe(0);
  });

  it('never mobilises a retired reserve pool during Survival wars', () => {
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

    expect(ordinaryPlan.reserveDeployment).toBe(0);
    expect(normalPlan.reserveDeployment).toBe(0);
    expect(ordinaryPlan.trainedReservesAfter).toBe(0);
    expect(normalPlan.trainedReservesAfter).toBe(0);
  });
});
