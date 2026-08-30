import { describe, expect, it, vi } from 'vitest';
import { WorldEngineV2 } from './WorldEngineV2';
import * as capacityV2 from './capacity';
import { synchronizeArmyCapacityV2 } from './capacity';
import { ANTARCTIC_TERRITORY_IDS_V2, ROGUE_AI_NATION_ID_V2 } from './content';
import { assertInvariantsV2 } from './invariants';
import { resolveScenarioV2 } from './scenarios';
import {
  SURVIVAL_OCCUPATION_ECONOMY_FACTOR_V2,
  SURVIVAL_OCCUPATION_MANPOWER_FACTOR_V2,
  SURVIVAL_OCCUPATION_POPULATION_FACTOR_V2,
  enforceSurvivalScorchedWorldV2,
  markSurvivalScorchedTerritoryV2,
} from './survivalEmpire';
import {
  nationIdV2,
  territoryIdV2,
  type FrontOperationV2,
  type WarStateV2,
} from './types';
import { resolveBattlePulseV2, supplyFactorV2 } from './war';
import { beginTerritoryIntegrationV2, retireAbsorbedNationV2 } from './integration';
import {
  invalidateTerritoryIndexV2,
  projectFinanceManpowerPhaseV2,
  selectControlledPopulationV2,
  selectEconomicOutputLedgerV2,
  selectRecruitmentBaseManpowerV2,
  selectResearchOutputV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';

describe('Survival scorched-world occupation', () => {
  it('keeps occupied and recaptured world countries poor without breaking their supply corridor', () => {
    const resolved = resolveScenarioV2({ mode: 'survival', seed: 72_101 });
    const engine = new WorldEngineV2(72_101, resolved.content);
    const playerId = nationIdV2('gnb');
    const ruinedId = territoryIdV2('sen');
    const baseline = structuredClone(engine.state.territories[ruinedId]!);
    const nationBaseline = structuredClone(engine.state.players[nationIdV2('sen')]!);
    expect(engine.chooseCountry(playerId)).toEqual({ accepted: true });
    expect(engine.formSurvivalEmpire(playerId, [])).toEqual({ accepted: true });
    const ruined = engine.state.territories[ruinedId]!;
    expect(ruined.owner).toBe(nationIdV2('sen'));
    expect(engine.state.players[nationIdV2('sen')]).toBeDefined();
    expect(engine.state.players[nationIdV2('sen')]!.treasury).toBeCloseTo(
      nationBaseline.treasury * SURVIVAL_OCCUPATION_ECONOMY_FACTOR_V2,
      8,
    );
    expect(Object.entries(engine.state.territories).filter(([id, territory]) => (
      territory.owner === ROGUE_AI_NATION_ID_V2
        && !ANTARCTIC_TERRITORY_IDS_V2.includes(territoryIdV2(id))
    ))).toHaveLength(0);
    expect(ruined.economy).toBeCloseTo(
      Math.max(0.10, baseline.economy * SURVIVAL_OCCUPATION_ECONOMY_FACTOR_V2), 8,
    );
    expect(ruined.population).toBeCloseTo(
      Math.max(0.01, baseline.population * SURVIVAL_OCCUPATION_POPULATION_FACTOR_V2), 8,
    );
    expect(ruined.army.manpower).toBeCloseTo(
      baseline.army.manpower * SURVIVAL_OCCUPATION_MANPOWER_FACTOR_V2, 8,
    );
    expect(engine.state.runProgression.scorchedWorldTerritoryIds).not.toContain(ruinedId);

    const treasuryBefore = engine.state.players[playerId]!.treasury;
    const economyBeforeRecapture = selectEconomicOutputLedgerV2(
      engine.state, engine.content, playerId,
    );
    const populationBeforeRecapture = selectControlledPopulationV2(engine.state, playerId);
    const recruitmentBeforeRecapture = selectRecruitmentBaseManpowerV2(engine.state, playerId);
    const researchBeforeRecapture = selectResearchOutputV2(
      engine.state, engine.content, playerId,
    );
    beginTerritoryIntegrationV2(
      engine.state, engine.content, ruinedId, ROGUE_AI_NATION_ID_V2, 'land',
    );
    markSurvivalScorchedTerritoryV2(engine.state, engine.content, ruinedId);
    engine.state.players[nationIdV2('sen')]!.treasury = 0;
    engine.state.players[nationIdV2('sen')]!.foodStock = 0;
    engine.state.players[nationIdV2('sen')]!.trainedReserves = 0;
    expect(engine.state.runProgression.scorchedWorldTerritoryIds).toContain(ruinedId);
    beginTerritoryIntegrationV2(
      engine.state, engine.content, ruinedId, playerId, 'land',
    );
    expect(retireAbsorbedNationV2(
      engine.state, engine.content, nationIdV2('sen'), playerId, false,
    )).toBe(true);
    ruined.economy = baseline.economy;
    ruined.population = baseline.population;
    enforceSurvivalScorchedWorldV2(engine.state, engine.content);
    expect(ruined.economy).toBeLessThanOrEqual(baseline.economy * 0.025 + 1e-8);
    expect(ruined.population).toBeLessThanOrEqual(baseline.population * 0.12 + 1e-8);
    expect(ruined).not.toHaveProperty('condition');
    expect(ruined.integration).toBe(0);
    expect(ruined.integrationProgram).toBeUndefined();
    expect(engine.state.players[playerId]!.treasury).toBe(treasuryBefore);
    expect(selectEconomicOutputLedgerV2(engine.state, engine.content, playerId))
      .toEqual(economyBeforeRecapture);
    expect(selectControlledPopulationV2(engine.state, playerId))
      .toBe(populationBeforeRecapture);
    expect(selectRecruitmentBaseManpowerV2(engine.state, playerId))
      .toEqual(recruitmentBeforeRecapture);
    expect(selectWeeklyFinanceBreakdownV2(engine.state, engine.content, playerId).integrationCost)
      .toBe(0);
    expect(selectResearchOutputV2(engine.state, engine.content, playerId))
      .toBeLessThanOrEqual(researchBeforeRecapture);
    expect(supplyFactorV2(
      engine.state, engine.content, playerId, ruinedId, 'land', territoryIdV2('gin'),
    )).toBeGreaterThanOrEqual(0.25);
    synchronizeArmyCapacityV2(engine.state, engine.content);

    const saved = engine.save();
    const reloaded = WorldEngineV2.fromSave(saved, resolved.content);
    expect(reloaded.state.runProgression.scorchedWorldTerritoryIds)
      .toEqual(engine.state.runProgression.scorchedWorldTerritoryIds);
    expect(reloaded.state.territories[ruinedId]).toEqual(ruined);
    expect(reloaded.canonicalHash()).toBe(engine.canonicalHash());
    assertInvariantsV2(reloaded.state, reloaded.content);
  });

  it('keeps independent countries at 20% military scale while preserving quality and war agency', () => {
    const resolved = resolveScenarioV2({ mode: 'survival', seed: 72_103 });
    const engine = new WorldEngineV2(72_103, resolved.content);
    const usaId = territoryIdV2('usa');
    const canadaId = territoryIdV2('can');
    const senegalId = territoryIdV2('sen');
    const normalUsEconomy = engine.state.territories[usaId]!.economy;
    const normalUsPower = engine.territoryPower(usaId);
    expect(engine.chooseCountry('gnb')).toEqual({ accepted: true });
    expect(engine.formSurvivalEmpire('gnb', [])).toEqual({ accepted: true });

    const survivalUs = engine.state.territories[usaId]!;
    expect(survivalUs.owner).toBe(nationIdV2('usa'));
    expect(survivalUs.economy / normalUsEconomy).toBeCloseTo(0.50, 8);
    expect(engine.territoryPower(usaId) / normalUsPower).toBeGreaterThan(0.15);
    expect(engine.territoryPower(usaId) / normalUsPower).toBeLessThan(0.25);
    expect(engine.territoryPower(usaId)).toBeGreaterThan(engine.territoryPower(senegalId));
    const recruitmentBase = selectRecruitmentBaseManpowerV2(engine.state, nationIdV2('usa'));
    expect(recruitmentBase.capacity).toBeGreaterThan(recruitmentBase.deployed);

    const reloadedAtTickZero = WorldEngineV2.fromSave(engine.save(), resolved.content);
    const halfEconomy = reloadedAtTickZero.state.territories[usaId]!.economy;
    expect(reloadedAtTickZero.formSurvivalEmpire('gnb', [])).toMatchObject({
      accepted: false,
      reason: expect.stringContaining('already formed'),
    });
    expect(reloadedAtTickZero.state.territories[usaId]!.economy).toBe(halfEconomy);

    const connection = engine.content.territories[usaId]!.connections
      .find((candidate) => candidate.targetId === canadaId);
    expect(connection).toBeDefined();
    const operation: FrontOperationV2 = {
      commanderId: nationIdV2('usa'),
      sourceId: usaId,
      targetId: canadaId,
      doctrine: 'breakthrough',
      access: connection!.kind === 'sea' ? 'naval' : 'land',
      startedTick: engine.state.tick,
      lastBattleTick: engine.state.tick,
      holdUntilTick: engine.state.tick + 12,
      momentum: 1,
    };
    const war: WarStateV2 = {
      id: `war-${engine.state.nextWarId++}`,
      attackerId: nationIdV2('usa'),
      defenderId: nationIdV2('can'),
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
      attackerOperations: [operation],
      defenderOperations: [],
    };
    engine.state.wars.push(war);
    const attack = resolveBattlePulseV2(engine.state, engine.content, war, operation);
    expect(attack).not.toBeNull();
    expect((attack?.regularAttackerLosses ?? 0) + (attack?.regularDefenderLosses ?? 0))
      .toBeGreaterThan(0);
    expect(engine.state.wars).toContain(war);
  });

  it('turns a captured world country into a zero-production transit node', () => {
    const resolved = resolveScenarioV2({ mode: 'survival', seed: 72_102 });
    const engine = new WorldEngineV2(72_102, resolved.content);
    expect(engine.chooseCountry('gnb')).toEqual({ accepted: true });
    expect(engine.formSurvivalEmpire('gnb', [])).toEqual({ accepted: true });
    const routeId = territoryIdV2('chl');
    const route = engine.state.territories[routeId]!;
    route.owner = ROGUE_AI_NATION_ID_V2;
    route.coreOwner = ROGUE_AI_NATION_ID_V2;
    route.integration = 1;
    delete route.integrationProgram;
    route.army.manpower = 0;
    markSurvivalScorchedTerritoryV2(engine.state, engine.content, routeId);
    invalidateTerritoryIndexV2(engine.state);
    synchronizeArmyCapacityV2(engine.state, engine.content);

    const ledgerBefore = selectEconomicOutputLedgerV2(
      engine.state, engine.content, ROGUE_AI_NATION_ID_V2,
    );
    route.economy = 1_000_000;
    route.population = 1_000;
    const ledgerAfter = selectEconomicOutputLedgerV2(
      engine.state, engine.content, ROGUE_AI_NATION_ID_V2,
    );
    expect(ledgerAfter.integratedOutput).toBe(ledgerBefore.integratedOutput);
    expect(ledgerAfter.productivePopulation).toBe(ledgerBefore.productivePopulation);
    const recruitmentBase = selectRecruitmentBaseManpowerV2(
      engine.state, ROGUE_AI_NATION_ID_V2,
    );
    expect(recruitmentBase.capacity).toBe(
      ANTARCTIC_TERRITORY_IDS_V2.reduce((sum, territoryId) => (
        sum + engine.state.territories[territoryId]!.army.capacity
      ), 0),
    );
    const finance = selectWeeklyFinanceBreakdownV2(
      engine.state, engine.content, ROGUE_AI_NATION_ID_V2,
    );
    const projection = projectFinanceManpowerPhaseV2(
      engine.state, engine.content, ROGUE_AI_NATION_ID_V2, finance,
    );
    expect(projection.territories.map((territory) => territory.id))
      .toEqual(expect.arrayContaining(ANTARCTIC_TERRITORY_IDS_V2));
    expect(projection.territories.some((territory) => territory.id === routeId)).toBe(false);
    expect(route.army.manpower).toBe(0);
  });

  it('skips Signal Purge for Survival world corridors while Campaign integration is unchanged', () => {
    const resolved = resolveScenarioV2({ mode: 'survival', seed: 72_104 });
    const survival = new WorldEngineV2(72_104, resolved.content);
    expect(survival.chooseCountry('gnb')).toEqual({ accepted: true });
    expect(survival.formSurvivalEmpire('gnb', [])).toEqual({ accepted: true });
    const corridorId = territoryIdV2('sen');
    const corridor = survival.state.territories[corridorId]!;
    corridor.owner = ROGUE_AI_NATION_ID_V2;
    markSurvivalScorchedTerritoryV2(survival.state, survival.content, corridorId);
    beginTerritoryIntegrationV2(
      survival.state, survival.content, corridorId, nationIdV2('gnb'), 'land',
    );
    expect(corridor).toMatchObject({ owner: nationIdV2('gnb'), integration: 0 });
    expect(corridor.integrationProgram).toBeUndefined();

    const campaign = new WorldEngineV2(72_105);
    const campaignTerritory = campaign.state.territories[corridorId]!;
    beginTerritoryIntegrationV2(
      campaign.state, campaign.content, corridorId, nationIdV2('gnb'), 'land',
    );
    expect(campaignTerritory.integration).toBeGreaterThan(0);
    expect(campaignTerritory.integration).toBeLessThan(1);
    expect(campaignTerritory.integrationProgram).toBeDefined();
  });

  it('handles a burst of corridor captures without a global capacity rebuild per territory', () => {
    const resolved = resolveScenarioV2({ mode: 'survival', seed: 72_106 });
    const engine = new WorldEngineV2(72_106, resolved.content);
    expect(engine.chooseCountry('gnb')).toEqual({ accepted: true });
    expect(engine.formSurvivalEmpire('gnb', [])).toEqual({ accepted: true });
    const captureIds = engine.content.territoryIds.filter((territoryId) => (
      !ANTARCTIC_TERRITORY_IDS_V2.includes(territoryId)
        && engine.state.territories[territoryId]?.owner !== nationIdV2('gnb')
    )).slice(0, 24);
    const capacitySync = vi.spyOn(capacityV2, 'synchronizeArmyCapacityV2');

    for (const territoryId of captureIds) {
      beginTerritoryIntegrationV2(
        engine.state, engine.content, territoryId, ROGUE_AI_NATION_ID_V2, 'land',
      );
      markSurvivalScorchedTerritoryV2(engine.state, engine.content, territoryId);
    }

    expect(capacitySync).not.toHaveBeenCalled();
    expect(engine.state.runProgression.scorchedWorldTerritoryIds).toHaveLength(captureIds.length);
    expect(captureIds.every((territoryId) => (
      engine.state.territories[territoryId]?.integration === 0
        && engine.state.territories[territoryId]?.integrationProgram === undefined
    ))).toBe(true);
    capacitySync.mockRestore();
  });
});
