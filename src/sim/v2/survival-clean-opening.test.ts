import { describe, expect, it } from 'vitest';
import { WorldEngineV2 } from './WorldEngineV2';
import { ANTARCTIC_GATEWAY_IDS_V2 } from './antarcticGateways';
import {
  ANTARCTIC_TERRITORY_IDS_V2,
  ROGUE_AI_NATION_ID_V2,
} from './content';
import { resolveScenarioV2 } from './scenarios';
import {
  SURVIVAL_ROGUE_RAPID_ASSIMILATION_DURATION_FACTOR_V2,
  quoteTerritoryIntegrationV2,
} from './integration';
import {
  selectCurrentPowerV2,
  selectTotalManpowerV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import { rogueAiSurvivalActiveV2 } from './survival';
import {
  SURVIVAL_ROGUE_WAR_CHEST_YEARS_V2,
  SURVIVAL_DAWNLINE_ARCTIC_NATION_IDS_V2,
  selectSurvivalDawnlineLeaderIdV2,
} from './survivalEmpire';
import { isSurvivalDawnlineNationV2 } from './survivalOrdinaryAi';
import { nationIdV2, territoryIdV2 } from './types';
import {
  declareWarV2,
  resolveBattlePulseV2,
  selectSurvivalCounteroffensiveTargetV2,
  selectSurvivalCounteroffensiveTargetsV2,
  synchronizeWarFrontsV2,
  warDeclarationStatusV2,
} from './war';

function survival(seed = 91_001, flagship = 'bel'): WorldEngineV2 {
  const resolved = resolveScenarioV2({ mode: 'survival', seed });
  const engine = new WorldEngineV2(seed, resolved.content);
  expect(engine.chooseCountry(flagship)).toEqual({ accepted: true });
  expect(engine.formSurvivalEmpire(flagship, [])).toEqual({ accepted: true });
  return engine;
}

describe('Survival clean world opening', () => {
  it('keeps Rogue in Antarctica, forms only the explicit Arctic Dawnline and preserves the world', () => {
    const engine = survival();
    const standardContent = resolveScenarioV2({ mode: 'standard-2026', seed: 91_001 }).content;
    const standard = new WorldEngineV2(91_001, standardContent);
    const antarctica = new Set(ANTARCTIC_TERRITORY_IDS_V2);
    const rogueOwned = engine.content.territoryIds.filter((territoryId) => (
      engine.state.territories[territoryId]?.owner === ROGUE_AI_NATION_ID_V2
    ));
    expect(new Set(rogueOwned)).toEqual(antarctica);
    expect(engine.state.runProgression.scorchedWorldTerritoryIds).toEqual([]);

    const dawnlineLeader = selectSurvivalDawnlineLeaderIdV2(engine.state)!;
    expect(dawnlineLeader).toBe(nationIdV2('grl'));
    expect(isSurvivalDawnlineNationV2(engine.state, dawnlineLeader)).toBe(true);
    const dawnlineMembers = new Set(SURVIVAL_DAWNLINE_ARCTIC_NATION_IDS_V2);
    for (const territoryId of engine.content.territoryIds) {
      const definition = engine.content.territories[territoryId]!;
      if ((definition.kind ?? 'sovereign') !== 'sovereign') continue;
      const territory = engine.state.territories[territoryId]!;
      const expectedOwner = dawnlineMembers.has(definition.initialOwnerId as never)
        ? dawnlineLeader : definition.initialOwnerId;
      expect(territory.owner, territoryId).toBe(expectedOwner);
      expect(territory.coreOwner, territoryId).toBe(expectedOwner);
      expect(territory.population, territoryId)
        .toBe(standard.state.territories[territoryId]!.population);
      expect(territory.economy, territoryId)
        .toBe(standard.state.territories[territoryId]!.economy);
      expect(territory.integration, territoryId).toBe(1);
      expect(territory.integrationProgram, territoryId).toBeUndefined();
    }
  });

  it('starts every non-Rogue sovereign at exactly 100% of live capacity', () => {
    const engine = survival(91_002);
    const human = engine.state.territories[territoryIdV2('bel')]!;
    const ordinary = engine.state.territories[territoryIdV2('nld')]!;
    const dawnline = engine.state.territories[territoryIdV2('usa')]!;
    expect(human.army.manpower).toBeCloseTo(human.army.capacity, 9);
    expect(ordinary.army.manpower).toBeCloseTo(ordinary.army.capacity, 9);
    expect(dawnline.army.manpower).toBeCloseTo(dawnline.army.capacity, 9);

    const standardContent = resolveScenarioV2({ mode: 'standard-2026', seed: 91_002 }).content;
    const standard = new WorldEngineV2(91_002, standardContent);
    expect(ordinary.population).toBe(standard.state.territories[territoryIdV2('nld')]!.population);
    expect(ordinary.economy).toBe(standard.state.territories[territoryIdV2('nld')]!.economy);
    expect(ordinary.army.capacity)
      .toBeCloseTo(standard.state.territories[territoryIdV2('nld')]!.army.capacity, 9);
  });

  it('lets a funded ordinary country recruit normally after peacetime losses', () => {
    const engine = survival(91_003);
    const ordinary = nationIdV2('nld');
    engine.state.players[ordinary]!.treasury = 1_000_000;
    engine.state.players[ordinary]!.budget = { military: 80, research: 10, development: 10 };
    const territory = engine.state.territories[territoryIdV2('nld')]!;
    territory.army.manpower *= 0.5;
    const before = selectTotalManpowerV2(engine.state, ordinary).deployed;
    engine.step(12);
    expect(selectTotalManpowerV2(engine.state, ordinary).deployed).toBeGreaterThan(before);
  });

  it('blocks ordinary AI declarations against humans but keeps human declarations normal', () => {
    const engine = survival(91_004);
    const human = nationIdV2('bel');
    const ordinary = nationIdV2('nld');
    expect(warDeclarationStatusV2(engine.state, engine.content, ordinary, human)).toMatchObject({
      allowed: false,
      reason: 'Ordinary countries do not initiate wars against human commands in Survival.',
    });
    expect(warDeclarationStatusV2(engine.state, engine.content, human, ordinary).allowed).toBe(true);
    const dawnline = selectSurvivalDawnlineLeaderIdV2(engine.state)!;
    expect(warDeclarationStatusV2(engine.state, engine.content, human, dawnline)).toMatchObject({
      allowed: false,
      reason: 'The Arctic Dawnline Accord is a protected human ally.',
    });
    expect(warDeclarationStatusV2(engine.state, engine.content, dawnline, ordinary)).toMatchObject({
      allowed: false,
      reason: 'Dawnline engages only the Rogue AI in Survival.',
    });
  });

  it('opens all three gateways and an immediate legal Rogue front from Antarctica', () => {
    const engine = survival(91_005);
    expect(rogueAiSurvivalActiveV2(engine.state)).toBe(true);
    expect(ANTARCTIC_GATEWAY_IDS_V2.every((gatewayId) => (
      engine.state.polarEndgame.gatewayBreaches[gatewayId]?.status === 'open'
    ))).toBe(true);
    const war = engine.state.wars.find((candidate) => (
      candidate.attackerId === ROGUE_AI_NATION_ID_V2
    ));
    expect(war).toBeDefined();
    expect(war!.attackerOperations).toHaveLength(1);
    const operation = war!.attackerOperations[0]!;
    expect(ANTARCTIC_TERRITORY_IDS_V2).toContain(operation.sourceId);
    expect(engine.content.territories[operation.targetId]?.kind ?? 'sovereign').toBe('sovereign');
    expect(engine.state.territories[operation.targetId]!.owner).toBe(war!.defenderId);

    engine.step(4);
    expect(war!.battles).toBeGreaterThan(0);
    expect(war!.lastBattleTick).toBeGreaterThanOrEqual(2);
    expect(war!.lastBattleTick).toBeLessThanOrEqual(4);
  });

  it('canonicalizes a human first strike into the permanent Rogue attack orientation', () => {
    const resolved = resolveScenarioV2({ mode: 'survival', seed: 91_010 });
    const engine = new WorldEngineV2(91_010, resolved.content);
    const human = nationIdV2('chl');
    expect(engine.chooseCountry(human)).toEqual({ accepted: true });
    const manpowerBefore = selectTotalManpowerV2(engine.state, human).deployed;

    expect(declareWarV2(
      engine.state,
      engine.content,
      human,
      ROGUE_AI_NATION_ID_V2,
    )).toEqual({ accepted: true });
    const war = engine.state.wars.find((candidate) => (
      candidate.attackerId === ROGUE_AI_NATION_ID_V2
        && candidate.defenderId === human
    ));
    expect(war).toBeDefined();
    expect(war!.attackerLosses).toBe(0);
    expect(war!.defenderLosses).toBeGreaterThan(0);
    expect(selectTotalManpowerV2(engine.state, human).deployed).toBeLessThan(manpowerBefore);

    synchronizeWarFrontsV2(engine.state, engine.content);
    const targets = selectSurvivalCounteroffensiveTargetsV2(
      engine.state,
      engine.content,
      human,
    );
    expect(targets.length).toBeGreaterThan(0);
    const exactTarget = targets[0]!;
    expect(selectSurvivalCounteroffensiveTargetV2(
      engine.state,
      engine.content,
      human,
      exactTarget.targetId,
    )).toEqual({ accepted: true });
    expect(war!.attackerOperations.length + war!.defenderOperations.length)
      .toBeLessThanOrEqual(2);
    expect(selectSurvivalCounteroffensiveTargetsV2(
      engine.state,
      engine.content,
      human,
    ).find((candidate) => candidate.targetId === exactTarget.targetId)?.active).toBe(true);
  });

  it('preserves a conquered world country as a normal integrated-resource conquest', () => {
    const engine = survival(91_006);
    const war = engine.state.wars.find((candidate) => (
      candidate.attackerId === ROGUE_AI_NATION_ID_V2
        && candidate.attackerOperations.length > 0
    ))!;
    const operation = war.attackerOperations[0]!;
    const source = engine.state.territories[operation.sourceId]!;
    const target = engine.state.territories[operation.targetId]!;
    const populationBefore = target.population;
    const economyBefore = target.economy;
    const normalContent = {
      ...engine.content,
      metadata: { ...engine.content.metadata, scenarioId: 'standard-2026' as const },
    } as typeof engine.content;
    const normalQuote = quoteTerritoryIntegrationV2(
      engine.state, normalContent, operation.targetId, ROGUE_AI_NATION_ID_V2,
    );
    const rapidQuote = quoteTerritoryIntegrationV2(
      engine.state, engine.content, operation.targetId, ROGUE_AI_NATION_ID_V2,
    );
    expect(rapidQuote.durationWeeks).toBe(Math.max(1, Math.round(
      normalQuote.durationWeeks * SURVIVAL_ROGUE_RAPID_ASSIMILATION_DURATION_FACTOR_V2,
    )));
    expect(rapidQuote.durationWeeks).toBeLessThan(normalQuote.durationWeeks);
    source.army.manpower = Math.max(source.army.manpower, 1);
    source.army.baseAttack = 100;
    target.army.manpower = 0;
    operation.momentum = 1;
    operation.startedTick = engine.state.tick - 52;
    operation.lastBattleTick = engine.state.tick;
    operation.holdUntilTick = engine.state.tick + 8;
    const battle = resolveBattlePulseV2(engine.state, engine.content, war, operation);
    expect(battle?.conquered).toBe(true);
    expect(target.owner).toBe(ROGUE_AI_NATION_ID_V2);
    expect(target.population).toBe(populationBefore);
    expect(target.economy).toBe(economyBefore);
    expect(target.integrationProgram).toBeDefined();
    expect(target.integrationProgram!.completesTick - target.integrationProgram!.startedTick)
      .toBe(rapidQuote.durationWeeks);
    expect(engine.state.runProgression.scorchedWorldTerritoryIds).not.toContain(operation.targetId);
  });

  it('calibrates real Antarctic opening power to about 1.20× the full Dawnline bloc', () => {
    const engine = survival(91_007);
    const dawnline = selectSurvivalDawnlineLeaderIdV2(engine.state)!;
    const roguePower = selectCurrentPowerV2(
      engine.state,
      engine.content,
      ROGUE_AI_NATION_ID_V2,
    );
    const dawnlinePower = selectCurrentPowerV2(engine.state, engine.content, dawnline);
    expect(roguePower / dawnlinePower).toBeGreaterThanOrEqual(1.17);
    expect(roguePower / dawnlinePower).toBeLessThanOrEqual(1.24);
  });

  it('funds a finite dynamic Rogue war chest with at least five years left after year one', () => {
    const engine = survival(91_011);
    const rogue = engine.state.players[ROGUE_AI_NATION_ID_V2]!;
    const finance = selectWeeklyFinanceBreakdownV2(
      engine.state,
      engine.content,
      ROGUE_AI_NATION_ID_V2,
    );
    const annualBasis = Math.max(
      finance.revenue,
      finance.baseOperatingCost + finance.integrationCost + finance.totalMilitaryCost,
      0.001,
    ) * 52;
    expect(rogue.treasury).toBeGreaterThanOrEqual(
      annualBasis * SURVIVAL_ROGUE_WAR_CHEST_YEARS_V2 - 0.001,
    );
    expect(Number.isFinite(rogue.treasury)).toBe(true);

    engine.step(52);
    const after = selectWeeklyFinanceBreakdownV2(
      engine.state,
      engine.content,
      ROGUE_AI_NATION_ID_V2,
    );
    const annualBasisAfter = Math.max(
      after.revenue,
      after.baseOperatingCost + after.integrationCost + after.totalMilitaryCost,
      0.001,
    ) * 52;
    expect(rogue.treasury).toBeGreaterThan(0);
    expect(rogue.treasury / annualBasisAfter).toBeGreaterThanOrEqual(5);
  });

  it('uses Greenland as founder-controller unless Greenland is a human command', () => {
    const founded = survival(91_008, 'bel');
    expect(selectSurvivalDawnlineLeaderIdV2(founded.state)).toBe(nationIdV2('grl'));

    const greenland = survival(91_009, 'grl');
    const coordinator = selectSurvivalDawnlineLeaderIdV2(greenland.state)!;
    expect(coordinator).toBe(nationIdV2('usa'));
    expect(greenland.state.territories[territoryIdV2('grl')]!.owner).toBe(nationIdV2('grl'));
    expect(greenland.state.alliances.some((alliance) => (
      new Set([alliance.leftId, alliance.rightId]).has(nationIdV2('grl'))
        && new Set([alliance.leftId, alliance.rightId]).has(coordinator)
    ))).toBe(true);
    expect(greenland.state.events.some((event) => (
      event.message.includes('Greenland-founded Arctic Dawnline')
    ))).toBe(true);
  });
});
