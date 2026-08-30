import { describe, expect, it, vi } from 'vitest';
import { WorldEngineV2 } from './WorldEngineV2';
import * as capacityV2 from './capacity';
import { synchronizeArmyCapacityV2 } from './capacity';
import { ANTARCTIC_TERRITORY_IDS_V2, ROGUE_AI_NATION_ID_V2 } from './content';
import { assertInvariantsV2 } from './invariants';
import { resolveScenarioV2 } from './scenarios';
import {
  enforceSurvivalScorchedWorldV2,
  markSurvivalScorchedTerritoryV2,
  selectSurvivalDawnlineLeaderIdV2,
} from './survivalEmpire';
import {
  nationIdV2,
  territoryIdV2,
} from './types';
import { supplyFactorV2, synchronizeWarFrontsV2 } from './war';
import { beginTerritoryIntegrationV2 } from './integration';
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
    expect(engine.chooseCountry(playerId)).toEqual({ accepted: true });
    expect(engine.formSurvivalEmpire(playerId, [])).toEqual({ accepted: true });
    const ruined = engine.state.territories[ruinedId]!;
    expect(ruined.owner).toBe(ROGUE_AI_NATION_ID_V2);
    expect(engine.state.players[nationIdV2('sen')]).toBeUndefined();
    expect(Object.entries(engine.state.territories).filter(([id, territory]) => (
      territory.owner === ROGUE_AI_NATION_ID_V2
        && !ANTARCTIC_TERRITORY_IDS_V2.includes(territoryIdV2(id))
    )).length).toBeGreaterThan(100);
    expect(ruined.economy).toBeLessThanOrEqual(baseline.economy * 0.025 + 1e-8);
    expect(ruined.population).toBeLessThanOrEqual(baseline.population * 0.12 + 1e-8);
    expect(engine.state.runProgression.scorchedWorldTerritoryIds).toContain(ruinedId);

    const treasuryBefore = engine.state.players[playerId]!.treasury;
    const economyBeforeRecapture = selectEconomicOutputLedgerV2(
      engine.state, engine.content, playerId,
    );
    const populationBeforeRecapture = selectControlledPopulationV2(engine.state, playerId);
    const recruitmentBeforeRecapture = selectRecruitmentBaseManpowerV2(engine.state, playerId);
    const researchBeforeRecapture = selectResearchOutputV2(
      engine.state, engine.content, playerId,
    );
    ruined.owner = playerId;
    ruined.coreOwner = playerId;
    ruined.integration = 0;
    delete ruined.integrationProgram;
    invalidateTerritoryIndexV2(engine.state);
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
    synchronizeWarFrontsV2(engine.state, engine.content);

    const saved = engine.save();
    const reloaded = WorldEngineV2.fromSave(saved, resolved.content);
    expect(reloaded.state.runProgression.scorchedWorldTerritoryIds)
      .toEqual(engine.state.runProgression.scorchedWorldTerritoryIds);
    expect(reloaded.state.territories[ruinedId]).toEqual(ruined);
    expect(reloaded.canonicalHash()).toBe(engine.canonicalHash());
    assertInvariantsV2(reloaded.state, reloaded.content);
  });

  it('keeps Dawnline remote and intact while distant countries are Rogue transit nodes', () => {
    const resolved = resolveScenarioV2({ mode: 'survival', seed: 72_103 });
    const engine = new WorldEngineV2(72_103, resolved.content);
    const usaId = territoryIdV2('usa');
    const normalUsEconomy = engine.state.territories[usaId]!.economy;
    const normalUsPower = engine.territoryPower(usaId);
    expect(engine.chooseCountry('gnb')).toEqual({ accepted: true });
    expect(engine.formSurvivalEmpire('gnb', [])).toEqual({ accepted: true });

    const survivalUs = engine.state.territories[usaId]!;
    expect(survivalUs.owner).toBe(ROGUE_AI_NATION_ID_V2);
    expect(survivalUs.economy / normalUsEconomy).toBeLessThanOrEqual(0.025);
    expect(engine.territoryPower(usaId) / normalUsPower).toBeLessThan(0.05);
    expect(engine.state.players[nationIdV2('usa')]).toBeUndefined();
    const dawnlineLeader = selectSurvivalDawnlineLeaderIdV2(engine.state)!;
    const dawnlineTerritories = engine.content.territoryIds.filter((territoryId) => (
      engine.state.territories[territoryId]?.owner === dawnlineLeader
    ));
    expect(dawnlineTerritories).toHaveLength(3);
    expect(dawnlineTerritories.every((territoryId) => (
      !(engine.content.territories[territoryId]?.connections ?? []).some((connection) => (
        engine.state.territories[connection.targetId]?.owner === nationIdV2('gnb')
      ))
    ))).toBe(true);
    const recruitmentBase = selectRecruitmentBaseManpowerV2(engine.state, dawnlineLeader);
    expect(recruitmentBase.capacity).toBeCloseTo(recruitmentBase.deployed, 9);

    const reloadedAtTickZero = WorldEngineV2.fromSave(engine.save(), resolved.content);
    const scorchedEconomy = reloadedAtTickZero.state.territories[usaId]!.economy;
    expect(reloadedAtTickZero.formSurvivalEmpire('gnb', [])).toMatchObject({
      accepted: false,
      reason: expect.stringContaining('already formed'),
    });
    expect(reloadedAtTickZero.state.territories[usaId]!.economy).toBe(scorchedEconomy);

    const dawnlineWar = engine.state.wars.find((war) => (
      war.attackerId === ROGUE_AI_NATION_ID_V2 && war.defenderId === dawnlineLeader
    ));
    expect(dawnlineWar).toBeDefined();
    expect([
      ...dawnlineWar!.attackerOperations,
      ...dawnlineWar!.defenderOperations,
    ]).toHaveLength(1);
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
    const registryBefore = [...engine.state.runProgression.scorchedWorldTerritoryIds];
    const captureIds = registryBefore.slice(0, 24);
    const capacitySync = vi.spyOn(capacityV2, 'synchronizeArmyCapacityV2');

    for (const territoryId of captureIds) {
      markSurvivalScorchedTerritoryV2(engine.state, engine.content, territoryId);
    }

    expect(capacitySync).not.toHaveBeenCalled();
    expect(engine.state.runProgression.scorchedWorldTerritoryIds).toEqual(registryBefore);
    expect(captureIds.every((territoryId) => (
      engine.state.territories[territoryId]?.integration === 0
        && engine.state.territories[territoryId]?.integrationProgram === undefined
    ))).toBe(true);
    capacitySync.mockRestore();
  });
});
