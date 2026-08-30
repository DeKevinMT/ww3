import { describe, expect, it } from 'vitest';
import { createCampaignLifecycleSnapshotV1 } from '../../meta/campaignLifecycle';
import type { StoredCampaignV1 } from '../../meta/commanderStorage';
import { planAiCommandsV2 } from './ai';
import { WorldEngineV2 } from './WorldEngineV2';
import {
  ANTARCTIC_TERRITORY_IDS_V2,
  ROGUE_AI_NATION_ID_V2,
  WORLD_CONTENT_V2,
} from './content';
import { resolveScenarioV2 } from './scenarios';
import {
  ROGUE_AI_CORE_TERRITORY_ID_V2,
  SURVIVAL_FIRST_WAVE_DELAY_TICKS_V2,
  SURVIVAL_WAR_PRESSURE_BASELINE_V2,
  SURVIVAL_WAR_PRESSURE_CAP_V2,
  activateRogueAiSurvivalV2,
  processRogueAiSurvivalV2,
  survivalBattlePressureGainV2,
  survivalWaveStagingManpowerV2,
} from './survival';
import { rogueWaveManpowerAtV2 } from './survivalProvenance';
import { assertInvariantsV2 } from './invariants';
import { canonicalStateHashV2 } from './persistence';
import { nationIdV2, territoryIdV2 } from './types';
import {
  SURVIVAL_SCORCHED_ECONOMY_CEILING_FACTOR_V2,
  selectSurvivalDawnlineLeaderIdV2,
} from './survivalEmpire';
import {
  selectRecruitmentTrainingPipelineV2,
  selectWarPressureV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import { OPENING_MILITARY_ORDER_V2 } from './traits';
import {
  processWarsV2,
  frontCapacitySupplyQuoteV2,
  projectCombatExchangeV2,
  redistributeArmiesV2,
  resolveBattlePulseV2,
} from './war';
import type { FrontOperationV2, LogisticsMovementV2 } from './types';
import type { PlayerId, WarStateV2 } from './types';
import { invalidateTerritoryIndexV2 } from './selectors';

function addTestRogueWar(engine: WorldEngineV2, defenderId: PlayerId): WarStateV2 {
  const war: WarStateV2 = {
    id: `war-${engine.state.nextWarId++}`,
    attackerId: ROGUE_AI_NATION_ID_V2,
    defenderId,
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
  };
  engine.state.wars.push(war);
  return war;
}

describe('Survival Rogue AI empire', () => {
  it('boots one real Rogue nation with nine weak-to-core normal territories', () => {
    const engine = new WorldEngineV2(501);
    expect(WORLD_CONTENT_V2.nations[ROGUE_AI_NATION_ID_V2]).toMatchObject({
      kind: 'rogue-ai',
      initialCapitalId: ROGUE_AI_CORE_TERRITORY_ID_V2,
    });
    expect(ANTARCTIC_TERRITORY_IDS_V2).toHaveLength(9);
    for (const territoryId of ANTARCTIC_TERRITORY_IDS_V2) {
      expect(engine.state.territories[territoryId]).toMatchObject({
        owner: ROGUE_AI_NATION_ID_V2,
        coreOwner: ROGUE_AI_NATION_ID_V2,
      });
    }
    expect(engine.state.territories[ROGUE_AI_CORE_TERRITORY_ID_V2]!.army.manpower)
      .toBeGreaterThan(engine.state.territories[territoryIdV2('drake-entry')]!.army.manpower * 100);
  });

  it('starts active at week zero in Survival and cannot be selected by a human', () => {
    const resolved = resolveScenarioV2({ mode: 'survival', seed: 502 });
    const engine = new WorldEngineV2(502, resolved.content);
    expect(engine.state.polarEndgame).toMatchObject({
      phase: 'contact',
      contactTick: 0,
      warningTick: 0,
      globalWave: 1,
      nextCounteroffensiveTick: SURVIVAL_FIRST_WAVE_DELAY_TICKS_V2,
    });
    expect(engine.chooseCountry('rai')).toEqual({
      accepted: false,
      reason: 'The Rogue AI is an enemy empire and cannot be selected.',
    });
    expect(engine.chooseCountry('bel')).toEqual({ accepted: true });
    expect(engine.state.polarEndgame.phase).toBe('contact');
  });

  it('forms all valid unlocked countries into one fully integrated flagship empire', () => {
    const resolved = resolveScenarioV2({ mode: 'survival', seed: 5_025 });
    const engine = new WorldEngineV2(5_025, resolved.content);
    const belgium = nationIdV2('bel');
    const netherlands = nationIdV2('nld');
    const luxembourg = nationIdV2('lux');
    const germany = nationIdV2('deu');
    const memberTerritories = [territoryIdV2('nld'), territoryIdV2('lux')];
    expect(engine.chooseCountry(belgium)).toEqual({ accepted: true });
    const flagshipCapital = engine.state.players[belgium]!.capitalId;
    const flagshipResearch = structuredClone(engine.state.players[belgium]!.research);
    const rosterAttackKnowledge = flagshipResearch.effectLevels.attack + 2;
    engine.state.players[netherlands]!.research.effectLevels.attack = rosterAttackKnowledge;
    const initialTreasury = [belgium, netherlands, luxembourg].reduce(
      (sum, id) => sum + engine.state.players[id]!.treasury,
      0,
    );
    const territoryBaselines = Object.fromEntries(memberTerritories.map((territoryId) => [
      territoryId,
      {
        economy: engine.state.territories[territoryId]!.economy,
        manpower: engine.state.territories[territoryId]!.army.manpower,
      },
    ]));
    const germanyBaseline = structuredClone(engine.state.territories[territoryIdV2('deu')]);

    expect(engine.formSurvivalEmpire('bel', ['lux', 'rai', 'unknown', 'nld', 'lux']))
      .toEqual({ accepted: true });

    expect(engine.state.humanPlayerId).toBe(belgium);
    expect(engine.state.humanPlayerIds).toEqual([belgium]);
    expect(engine.state.players[belgium]!.capitalId).toBe(flagshipCapital);
    expect(engine.state.players[netherlands]).toBeUndefined();
    expect(engine.state.players[luxembourg]).toBeUndefined();
    expect(engine.state.players[ROGUE_AI_NATION_ID_V2]).toBeDefined();
    expect(engine.state.players[germany]).toBeUndefined();
    expect(engine.state.territories[territoryIdV2('deu')]).toMatchObject({
      owner: ROGUE_AI_NATION_ID_V2,
      coreOwner: ROGUE_AI_NATION_ID_V2,
      integration: 0,
    });
    expect(engine.state.territories[territoryIdV2('deu')]).not.toHaveProperty('condition');
    expect(engine.state.territories[territoryIdV2('deu')]!.economy).toBeCloseTo(
      Math.max(0.10, germanyBaseline!.economy * SURVIVAL_SCORCHED_ECONOMY_CEILING_FACTOR_V2),
      8,
    );
    expect(engine.state.territories[territoryIdV2('deu')]!.army.manpower)
      .toBeLessThanOrEqual(Math.max(
        0.000005,
        engine.state.territories[territoryIdV2('deu')]!.army.capacity * 0.002,
      ) + 1e-9);
    for (const territoryId of memberTerritories) {
      expect(engine.state.territories[territoryId]).toMatchObject({
        owner: belgium,
        coreOwner: belgium,
        integration: 1,
      });
      expect(engine.state.territories[territoryId]!.integrationProgram).toBeUndefined();
      expect(engine.state.territories[territoryId]!.economy)
        .toBe(territoryBaselines[territoryId]!.economy);
      expect(engine.state.territories[territoryId]!.army.manpower)
        .toBe(territoryBaselines[territoryId]!.manpower);
    }
    expect(engine.state.players[belgium]!.treasury).toBeCloseTo(initialTreasury, 8);
    expect(engine.state.players[belgium]!.research.effectLevels.attack).toBe(rosterAttackKnowledge);
    expect(engine.state.players[belgium]!.research.effectLevels.defense)
      .toBe(flagshipResearch.effectLevels.defense);
    expect(engine.state.polarEndgame.earthDefenseMembers).not.toContain(netherlands);
    expect(engine.state.polarEndgame.earthDefenseMembers).not.toContain(luxembourg);
    const antarcticRogueTerritories = ANTARCTIC_TERRITORY_IDS_V2
      .map((territoryId) => engine.state.territories[territoryId]!);
    const rogueWorldTerritories = Object.entries(engine.state.territories)
      .filter(([territoryId, territory]) => (
        territory.owner === ROGUE_AI_NATION_ID_V2
          && !ANTARCTIC_TERRITORY_IDS_V2.includes(territoryIdV2(territoryId))
      ))
      .map(([, territory]) => territory);
    expect(rogueWorldTerritories.length).toBeGreaterThan(100);
    expect(engine.state.runProgression.scorchedWorldTerritoryIds).toContain(territoryIdV2('deu'));
    expect(antarcticRogueTerritories.reduce((sum, territory) => sum + territory.army.manpower, 0))
      .toBeGreaterThan(0);
    assertInvariantsV2(engine.state, engine.content);

    const hash = engine.canonicalHash();
    const reloaded = WorldEngineV2.fromSave(engine.save());
    expect(reloaded.canonicalHash()).toBe(hash);
    expect(reloaded.state.territories[territoryIdV2('nld')]!.owner).toBe(belgium);
    expect(reloaded.state.players[netherlands]).toBeUndefined();
    expect(reloaded.state.players[germany]).toBeUndefined();
  });

  it('moves every new account unlock from a weakened independent nation into the full-strength human empire', () => {
    const resolved = resolveScenarioV2({ mode: 'survival', seed: 5_025_1 });
    const locked = new WorldEngineV2(5_025_1, resolved.content);
    const unlocked = new WorldEngineV2(5_025_1, resolved.content);
    const belgium = nationIdV2('bel');
    const netherlands = nationIdV2('nld');
    const dutchTerritoryIds = resolved.content.territoryIds.filter((territoryId) => (
      locked.state.territories[territoryId]?.owner === netherlands
    ));
    const baselines = Object.fromEntries(dutchTerritoryIds.map((territoryId) => [
      territoryId,
      structuredClone(locked.state.territories[territoryId]),
    ]));
    expect(locked.chooseCountry(belgium)).toEqual({ accepted: true });
    expect(unlocked.chooseCountry(belgium)).toEqual({ accepted: true });
    expect(locked.formSurvivalEmpire(belgium, [])).toEqual({ accepted: true });
    expect(unlocked.formSurvivalEmpire(belgium, [netherlands])).toEqual({ accepted: true });

    for (const territoryId of dutchTerritoryIds) {
      expect(locked.state.territories[territoryId]).toMatchObject({
        owner: ROGUE_AI_NATION_ID_V2,
        coreOwner: ROGUE_AI_NATION_ID_V2,
        integration: 0,
      });
      expect(locked.state.territories[territoryId]!.economy)
        .toBeLessThanOrEqual(baselines[territoryId]!.economy * 0.025 + 1e-8);
      expect(unlocked.state.territories[territoryId]).toMatchObject({
        owner: belgium,
        coreOwner: belgium,
        integration: 1,
        economy: baselines[territoryId]!.economy,
      });
      expect(unlocked.state.territories[territoryId]!.army.manpower)
        .toBe(baselines[territoryId]!.army.manpower);
    }
    const lockedRogueCount = Object.values(locked.state.territories)
      .filter((territory) => territory.owner === ROGUE_AI_NATION_ID_V2).length;
    const unlockedRogueCount = Object.values(unlocked.state.territories)
      .filter((territory) => territory.owner === ROGUE_AI_NATION_ID_V2).length;
    expect(lockedRogueCount).toBeGreaterThan(ANTARCTIC_TERRITORY_IDS_V2.length + 100);
    expect(unlockedRogueCount).toBeGreaterThan(ANTARCTIC_TERRITORY_IDS_V2.length + 100);
    expect(locked.state.players[netherlands]).toBeUndefined();
    expect(unlocked.state.players[netherlands]).toBeUndefined();
    assertInvariantsV2(locked.state, locked.content);
    assertInvariantsV2(unlocked.state, unlocked.content);

    const replay = new WorldEngineV2(5_025_1, resolved.content);
    expect(replay.chooseCountry(belgium)).toEqual({ accepted: true });
    expect(replay.formSurvivalEmpire(belgium, [netherlands])).toEqual({ accepted: true });
    expect(replay.canonicalHash()).toBe(unlocked.canonicalHash());
  });

  it('forms Survival rosters deterministically and rejects formation outside tick zero Survival', () => {
    const resolved = resolveScenarioV2({ mode: 'survival', seed: 5_026 });
    const left = new WorldEngineV2(5_026, resolved.content);
    const right = new WorldEngineV2(5_026, resolved.content);
    expect(left.chooseCountry('bel')).toEqual({ accepted: true });
    expect(right.chooseCountry('bel')).toEqual({ accepted: true });
    expect(left.formSurvivalEmpire('bel', ['nld', 'lux'])).toEqual({ accepted: true });
    expect(right.formSurvivalEmpire('bel', ['lux', 'nld'])).toEqual({ accepted: true });
    expect(left.canonicalHash()).toBe(right.canonicalHash());

    const campaign = new WorldEngineV2(5_026);
    expect(campaign.formSurvivalEmpire('bel', ['nld'])).toEqual({
      accepted: false,
      reason: 'A unified starting empire is exclusive to Survival.',
    });
    left.step(1);
    expect(left.formSurvivalEmpire('bel', ['deu'])).toEqual({
      accepted: false,
      reason: 'The Survival empire must be formed before week one.',
    });
  });

  it('keeps a fresh three-weakest-country empire alive through the opening waves with viable recaptures', () => {
    const seed = 50_420;
    const resolved = resolveScenarioV2({ mode: 'survival', seed });
    const weakestUnlockedIds = OPENING_MILITARY_ORDER_V2.slice(-3);
    const flagshipId = weakestUnlockedIds.at(-1)!;
    const engine = new WorldEngineV2(seed, resolved.content);
    expect(engine.chooseCountry(flagshipId)).toEqual({ accepted: true });
    expect(engine.formSurvivalEmpire(flagshipId, weakestUnlockedIds)).toEqual({ accepted: true });

    const openingHumanTerritories = Object.values(engine.state.territories)
      .filter((territory) => territory.owner === flagshipId);
    const openingHumanManpower = openingHumanTerritories.reduce(
      (sum, territory) => sum + territory.army.manpower,
      0,
    );
    expect(openingHumanTerritories).toHaveLength(weakestUnlockedIds.length);

    const availableFronts = Object.entries(engine.state.territories).flatMap(([
      sourceKey,
      source,
    ]) => {
      if (source.owner !== flagshipId) return [];
      const sourceId = territoryIdV2(sourceKey);
      return (engine.content.territories[sourceId]?.connections ?? []).flatMap((connection) => {
        const defenderId = engine.state.territories[connection.targetId]?.owner;
        if (!defenderId || defenderId === flagshipId) return [];
        const projection = projectCombatExchangeV2(
          engine.state,
          engine.content,
          flagshipId,
          defenderId,
          sourceId,
          connection.targetId,
          connection.kind === 'sea' ? 'naval' : 'land',
          1,
          1,
        );
        return projection ? [{
          sourceId,
          targetId: connection.targetId,
          kind: engine.content.territories[connection.targetId]?.kind ?? 'sovereign',
          projection,
        }] : [];
      });
    });
    const bestWorldRecapture = availableFronts
      .filter((front) => front.kind === 'sovereign')
      .sort((left, right) => right.projection.attackRatio - left.projection.attackRatio)[0];
    const bestAntarcticLanding = availableFronts
      .filter((front) => front.kind === 'rogue-perimeter')
      .sort((left, right) => right.projection.attackRatio - left.projection.attackRatio)[0];
    expect(bestWorldRecapture, 'the fresh empire needs an immediately reachable weakened neighbour')
      .toBeDefined();
    expect(bestWorldRecapture!.projection.attackerSupply).toBeGreaterThanOrEqual(0.25);
    expect(bestWorldRecapture!.projection.attackRatio).toBeGreaterThan(1);
    expect(bestWorldRecapture!.projection.defenderLossRate)
      .toBeGreaterThan(bestWorldRecapture!.projection.attackerLossRate);
    // Antarctica is reachable only through the three authored gateway nations;
    // a disconnected starter roster must first reclaim a route through Earth.
    expect(bestAntarcticLanding).toBeUndefined();

    // No operations are assigned by the player. The opening force must survive
    // the first two real wave launches without erasing the intended meta climb.
    engine.step(70);
    const survivingHumanTerritories = Object.values(engine.state.territories)
      .filter((territory) => territory.owner === flagshipId);
    const survivingHumanManpower = survivingHumanTerritories.reduce(
      (sum, territory) => sum + territory.army.manpower,
      0,
    );
    expect(engine.state.gameOver).toBe(false);
    expect(engine.state.polarEndgame.globalWave).toBeGreaterThanOrEqual(3);
    expect(survivingHumanTerritories.length).toBeGreaterThanOrEqual(openingHumanTerritories.length);
    expect(survivingHumanManpower).toBeGreaterThan(openingHumanManpower * 0.60);
    assertInvariantsV2(engine.state, engine.content);
  }, 30_000);

  it('keeps the hidden empire inert for 200+ Campaign weeks, then enables normal wave wars after contact', () => {
    const engine = new WorldEngineV2(5021);
    const rogueBefore = structuredClone(engine.state.players[ROGUE_AI_NATION_ID_V2]);
    const territoriesBefore = Object.fromEntries(ANTARCTIC_TERRITORY_IDS_V2.map((id) => [
      id,
      structuredClone(engine.state.territories[id]),
    ]));
    engine.step(208);
    expect(engine.state.players[ROGUE_AI_NATION_ID_V2]).toEqual(rogueBefore);
    for (const territoryId of ANTARCTIC_TERRITORY_IDS_V2) {
      expect(engine.state.territories[territoryId]).toEqual(territoriesBefore[territoryId]);
    }
    expect(engine.state.wars.some((war) => (
      war.attackerId === ROGUE_AI_NATION_ID_V2 || war.defenderId === ROGUE_AI_NATION_ID_V2
    ))).toBe(false);
    expect(engine.canDeclareWar('bel', 'rai')).toBe(false);

    expect(activateRogueAiSurvivalV2(
      engine.state,
      engine.content,
      nationIdV2('bel'),
    )).toBe(true);
    engine.step(80);
    expect(engine.state.wars.some((war) => war.attackerId === ROGUE_AI_NATION_ID_V2)).toBe(true);
  }, 30_000);

  it('blocks ordinary AI offensives against human Survival seats', () => {
    const resolved = resolveScenarioV2({ mode: 'survival', seed: 5_042 });
    const engine = new WorldEngineV2(5_042, resolved.content);
    const belgium = nationIdV2('bel');
    expect(engine.chooseCountry(belgium)).toEqual({ accepted: true });
    expect(engine.formSurvivalEmpire(belgium, [])).toEqual({ accepted: true });
    engine.state.tick = 104;
    engine.state.aiEscalation.lastWarStartTick = -1_000_000;
    for (const nation of Object.values(engine.state.players)) {
      nation.treasury = Math.max(nation.treasury, 1_000_000);
      nation.foodStock = Math.max(nation.foodStock, 1_000_000);
      nation.foodSecurity = 1;
    }

    const declarations = planAiCommandsV2(engine.state, engine.content)
      .filter((command) => command.type === 'declare-war');

    expect(declarations.some((command) => (
      command.type === 'declare-war'
        && command.defenderId === belgium
        && command.attackerId !== ROGUE_AI_NATION_ID_V2
    ))).toBe(false);
  });

  it('retires legacy AI-on-human Survival wars but preserves human offensives', () => {
    const resolved = resolveScenarioV2({ mode: 'survival', seed: 5_043 });
    const engine = new WorldEngineV2(5_043, resolved.content);
    const belgium = nationIdV2('bel');
    const dawnline = selectSurvivalDawnlineLeaderIdV2(engine.state)!;
    expect(engine.chooseCountry(belgium)).toEqual({ accepted: true });
    expect(engine.formSurvivalEmpire(belgium, [])).toEqual({ accepted: true });
    const save = JSON.parse(engine.save()) as Record<string, any>;
    const war = (id: string, attackerId: PlayerId, defenderId: PlayerId): WarStateV2 => ({
      id,
      attackerId,
      defenderId,
      startedTick: 0,
      lastBattleTick: 0,
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
    save.wars = [
      war('war-legacy-ai-offensive', dawnline, belgium),
      war('war-human-offensive', belgium, ROGUE_AI_NATION_ID_V2),
    ];
    save.canonicalStateHash = canonicalStateHashV2(save);

    const reloaded = WorldEngineV2.fromSave(JSON.stringify(save), resolved.content);

    expect(reloaded.state.wars.map((candidate) => candidate.id))
      .toEqual(['war-human-offensive']);
  });

  it('reinforces one permanent normal-system war with progressively stronger waves', () => {
    const resolved = resolveScenarioV2({ mode: 'survival', seed: 503 });
    const engine = new WorldEngineV2(503, resolved.content);
    expect(engine.chooseCountry('bel')).toEqual({ accepted: true });
    expect(engine.formSurvivalEmpire('bel', [])).toEqual({ accepted: true });
    engine.state.tick = SURVIVAL_FIRST_WAVE_DELAY_TICKS_V2;
    const core = engine.state.territories[ROGUE_AI_CORE_TERRITORY_ID_V2]!;
    const firstCoreManpowerBefore = core.army.manpower;
    const firstReservesBefore = engine.state.players[ROGUE_AI_NATION_ID_V2]!.trainedReserves;
    const first = processRogueAiSurvivalV2(engine.state, engine.content);
    expect(first.waveStarted).toBe(1);
    const firstStagedManpower = core.army.manpower - firstCoreManpowerBefore;
    expect(firstStagedManpower).toBeGreaterThan(0);
    expect(firstStagedManpower).toBeCloseTo(survivalWaveStagingManpowerV2(1), 8);
    expect(engine.state.players[ROGUE_AI_NATION_ID_V2]!.trainedReserves)
      .toBeCloseTo(firstReservesBefore, 8);
    expect(engine.state.wars.filter((war) => war.attackerId === ROGUE_AI_NATION_ID_V2))
      .toHaveLength(2);
    engine.state.wars = [];
    const permanentWar = addTestRogueWar(engine, nationIdV2('bel'));
    const permanentWarId = permanentWar.id;
    const wartimeFinance = selectWeeklyFinanceBreakdownV2(
      engine.state,
      engine.content,
      ROGUE_AI_NATION_ID_V2,
    );
    expect(selectRecruitmentTrainingPipelineV2(
      engine.state,
      engine.content,
      ROGUE_AI_NATION_ID_V2,
    )).toBe(0);
    expect(wartimeFinance.passiveRecruitment).toBe(0);
    expect(wartimeFinance.acceleratedRecruitment).toBe(0);
    expect(wartimeFinance.reserveTraining).toBe(0);
    expect(wartimeFinance.reserveTrainingCost).toBe(0);
    engine.state.players[nationIdV2('bel')]!.warFatigue = 30;
    permanentWar.lastBattleTick = engine.state.tick - 1;
    engine.state.polarEndgame.globalWave = 4;
    engine.state.polarEndgame.nextCounteroffensiveTick = engine.state.tick;
    const fourthCoreManpowerBefore = core.army.manpower;
    const fourth = processRogueAiSurvivalV2(engine.state, engine.content);
    expect(fourth.waveStarted).toBe(4);
    expect(core.army.manpower - fourthCoreManpowerBefore).toBeGreaterThan(firstStagedManpower);
    expect(core.army.manpower - fourthCoreManpowerBefore)
      .toBeCloseTo(survivalWaveStagingManpowerV2(4), 8);
    expect(fourth.targets).toContain(nationIdV2('bel'));
    expect(engine.state.wars.filter((war) => war.attackerId === ROGUE_AI_NATION_ID_V2).length)
      .toBeGreaterThanOrEqual(2);
    expect(engine.state.wars.filter((war) => war.attackerId === ROGUE_AI_NATION_ID_V2).length)
      .toBeLessThanOrEqual(3);
    expect(engine.state.wars.some((war) => war.id === permanentWarId)).toBe(true);
    expect(engine.state.players[nationIdV2('bel')]!.warFatigue).toBeLessThan(30);
    expect(engine.state.players[ROGUE_AI_NATION_ID_V2]!.research.effectLevels.supply)
      .toBeGreaterThanOrEqual(13);
  });

  it('moves a launched wave through visible one-hop logistics before its first battle', () => {
    const resolved = resolveScenarioV2({ mode: 'survival', seed: 5_034 });
    const engine = new WorldEngineV2(5_034, resolved.content);
    const weakestUnlockedIds = OPENING_MILITARY_ORDER_V2.slice(-3);
    const flagshipId = weakestUnlockedIds.at(-1)!;
    expect(engine.chooseCountry(flagshipId)).toEqual({ accepted: true });
    expect(engine.formSurvivalEmpire(flagshipId, weakestUnlockedIds)).toEqual({ accepted: true });
    engine.state.tick = SURVIVAL_FIRST_WAVE_DELAY_TICKS_V2;
    expect(processRogueAiSurvivalV2(engine.state, engine.content).waveStarted).toBe(1);
    expect(rogueWaveManpowerAtV2(engine.state, ROGUE_AI_CORE_TERRITORY_ID_V2))
      .toBeGreaterThan(0);

    let firstAntarcticHopTick: number | undefined;
    let firstBattleTick: number | undefined;
    let sawVerifiedWaveHop = false;
    const observedRogueMovements: LogisticsMovementV2[] = [];
    for (let week = 0; week < 12; week += 1) {
      engine.step(1);
      const movements = engine.recentLogisticsMovements()
        .filter((movement) => movement.playerId === ROGUE_AI_NATION_ID_V2);
      observedRogueMovements.push(...movements);
      if (firstAntarcticHopTick === undefined && movements.some((movement) => (
        engine.content.territories[movement.sourceId]?.kind !== undefined
          && engine.content.territories[movement.sourceId]?.kind !== 'sovereign'
      ))) firstAntarcticHopTick = engine.state.tick;
      if (movements.some((movement) => (
        engine.content.territories[movement.sourceId]?.kind !== undefined
          && engine.content.territories[movement.sourceId]?.kind !== 'sovereign'
          && rogueWaveManpowerAtV2(engine.state, movement.targetId) > 0
      ))) sawVerifiedWaveHop = true;
      if (firstBattleTick === undefined && engine.state.wars.some((war) => war.battles > 0)) {
        firstBattleTick = engine.state.tick;
      }
    }

    const depthTransitions = new Set(observedRogueMovements.flatMap((movement) => {
      const sourceKind = engine.content.territories[movement.sourceId]?.kind ?? 'sovereign';
      const targetKind = engine.content.territories[movement.targetId]?.kind ?? 'sovereign';
      return sourceKind === 'sovereign' ? [] : [`${sourceKind}->${targetKind}`];
    }));
    expect(
      firstAntarcticHopTick,
      `wave staging must enter visible Antarctic logistics: ${[...depthTransitions].join(', ')}`,
    ).toBeDefined();
    expect(firstBattleTick, 'the permanent war must eventually reach combat').toBeDefined();
    expect(firstAntarcticHopTick!).toBeLessThan(firstBattleTick!);
    expect(sawVerifiedWaveHop).toBe(true);
    expect(depthTransitions.size).toBeGreaterThanOrEqual(1);
    expect(observedRogueMovements.length).toBeGreaterThan(0);
    for (const movement of observedRogueMovements) {
      expect(engine.content.territories[movement.sourceId]?.connections
        .some((connection) => connection.targetId === movement.targetId)).toBe(true);
    }
  }, 30_000);

  it('uses bounded loss, shortage and territory-driven pressure without elapsed-war inflation', () => {
    expect(survivalBattlePressureGainV2(0.08, 0.30))
      .toBeGreaterThan(survivalBattlePressureGainV2(0.01, 0.95));
    const resolved = resolveScenarioV2({ mode: 'survival', seed: 5_031 });
    const engine = new WorldEngineV2(5_031, resolved.content);
    const belgium = nationIdV2('bel');
    const netherlands = nationIdV2('nld');
    expect(engine.chooseCountry(belgium)).toEqual({ accepted: true });
    expect(engine.formSurvivalEmpire(belgium, [netherlands])).toEqual({ accepted: true });
    engine.state.tick = SURVIVAL_FIRST_WAVE_DELAY_TICKS_V2;
    expect(processRogueAiSurvivalV2(engine.state, engine.content).waveStarted).toBe(1);
    const war = addTestRogueWar(engine, belgium);

    engine.state.players[belgium]!.warFatigue = 100;
    engine.state.polarEndgame.nextCounteroffensiveTick = null;
    processRogueAiSurvivalV2(engine.state, engine.content);
    expect(engine.state.players[belgium]!.warFatigue).toBe(SURVIVAL_WAR_PRESSURE_CAP_V2);
    engine.state.players[belgium]!.warFatigue = 0;
    war.lastBattleTick = engine.state.tick - 1;
    processRogueAiSurvivalV2(engine.state, engine.content);
    expect(engine.state.players[belgium]!.warFatigue).toBe(SURVIVAL_WAR_PRESSURE_BASELINE_V2);

    engine.state.players[belgium]!.warFatigue = 16;
    war.lastBattleTick = engine.state.tick;
    const pressureNow = selectWarPressureV2(engine.state, belgium);
    engine.state.tick += 2_000;

    const dutch = engine.state.territories[territoryIdV2('nld')]!;
    dutch.owner = ROGUE_AI_NATION_ID_V2;
    const occupiedPressure = selectWarPressureV2(engine.state, belgium);
    expect(occupiedPressure.outputPenalty).toBeGreaterThan(pressureNow.outputPenalty);
    dutch.owner = belgium;
    expect(selectWarPressureV2(engine.state, belgium)).toEqual(pressureNow);
  });

  it('never expires or closes as a stale front in the permanent machine war', () => {
    const resolved = resolveScenarioV2({ mode: 'survival', seed: 5_032 });
    const engine = new WorldEngineV2(5_032, resolved.content);
    const belgium = nationIdV2('bel');
    expect(engine.chooseCountry(belgium)).toEqual({ accepted: true });
    expect(engine.formSurvivalEmpire(belgium, [])).toEqual({ accepted: true });
    engine.state.tick = SURVIVAL_FIRST_WAVE_DELAY_TICKS_V2;
    processRogueAiSurvivalV2(engine.state, engine.content);
    const war = addTestRogueWar(engine, belgium);
    for (const territory of Object.values(engine.state.territories)) territory.army.manpower = 0;
    war.lastBattleTick = 0;
    engine.state.tick = war.startedTick + 2_000;
    processWarsV2(engine.state, engine.content);
    expect(engine.state.wars.map((candidate) => candidate.id)).toContain(war.id);
    expect(engine.state.offers).toEqual([]);
  });

  it('relieves bounded pressure when humanity recaptures a machine-held territory', () => {
    const resolved = resolveScenarioV2({ mode: 'survival', seed: 5_033 });
    const engine = new WorldEngineV2(5_033, resolved.content);
    const belgium = nationIdV2('bel');
    const sourceId = territoryIdV2('bel');
    const targetId = territoryIdV2('nld');
    expect(engine.chooseCountry(belgium)).toEqual({ accepted: true });
    expect(engine.formSurvivalEmpire(belgium, [])).toEqual({ accepted: true });
    engine.state.tick = SURVIVAL_FIRST_WAVE_DELAY_TICKS_V2;
    processRogueAiSurvivalV2(engine.state, engine.content);
    const war = addTestRogueWar(engine, belgium);
    const target = engine.state.territories[targetId]!;
    target.owner = ROGUE_AI_NATION_ID_V2;
    target.coreOwner = ROGUE_AI_NATION_ID_V2;
    target.integration = 1;
    delete target.integrationProgram;
    invalidateTerritoryIndexV2(engine.state);
    target.army.manpower = 0;
    engine.state.players[belgium]!.warFatigue = 20;
    const connection = engine.content.territories[sourceId]!.connections
      .find((candidate) => candidate.targetId === targetId)!;
    const operation: FrontOperationV2 = {
      commanderId: belgium,
      sourceId,
      targetId,
      doctrine: 'breakthrough',
      access: connection.kind === 'sea' ? 'naval' : 'land',
      startedTick: 0,
      lastBattleTick: 0,
      holdUntilTick: engine.state.tick + 12,
      momentum: 1,
    };
    const battle = resolveBattlePulseV2(engine.state, engine.content, war, operation)!;
    expect(battle.conquered).toBe(true);
    expect(engine.state.territories[targetId]!.owner).toBe(belgium);
    expect(engine.state.players[belgium]!.warFatigue).toBeLessThan(20);
    expect(engine.state.players[belgium]!.warFatigue)
      .toBeGreaterThanOrEqual(SURVIVAL_WAR_PRESSURE_BASELINE_V2);
  });

  it('makes the Rogue AI permanently hostile and ends Survival when the real core is conquered', () => {
    const resolved = resolveScenarioV2({ mode: 'survival', seed: 504 });
    const engine = new WorldEngineV2(504, resolved.content);
    const belgium = nationIdV2('bel');
    const core = engine.state.territories[ROGUE_AI_CORE_TERRITORY_ID_V2]!;
    core.owner = belgium;
    core.coreOwner = belgium;
    core.integration = 1;
    const result = processRogueAiSurvivalV2(engine.state, engine.content);
    expect(result.victory).toBe(true);
    expect(engine.state.polarEndgame).toMatchObject({
      phase: 'victory',
      victoryCommanderId: belgium,
      victoryTick: 0,
    });
  });

  it('uses the original Cape Town access, supplies a real naval landing, survives another wave and takes the core', () => {
    const resolved = resolveScenarioV2({ mode: 'survival', seed: 5_041 });
    const engine = new WorldEngineV2(5_041, resolved.content);
    const southAfrica = nationIdV2('zaf');
    expect(engine.chooseCountry(southAfrica)).toEqual({ accepted: true });
    expect(engine.formSurvivalEmpire(southAfrica, [])).toEqual({ accepted: true });
    for (const gatewayId of engine.state.polarEndgame.gatewayBreachOrder) {
      const breach = engine.state.polarEndgame.gatewayBreaches[gatewayId]!;
      breach.status = 'open';
      breach.breachStartedTick = 0;
      breach.opensTick = 1;
      breach.openedTick = 1;
    }
    engine.state.tick = SURVIVAL_FIRST_WAVE_DELAY_TICKS_V2;
    expect(processRogueAiSurvivalV2(engine.state, engine.content).waveStarted).toBe(1);
    const war = engine.state.wars.find((candidate) => (
      candidate.attackerId === ROGUE_AI_NATION_ID_V2
        && candidate.defenderId === southAfrica
    ))!;
    expect(war).toBeDefined();

    const route = [
      territoryIdV2('zaf'),
      territoryIdV2('maud-entry'),
      territoryIdV2('queen-maud-grid'),
      territoryIdV2('sentinel-labyrinth'),
      ROGUE_AI_CORE_TERRITORY_ID_V2,
    ];
    let navalSupply = 0;
    let actualNavalMovement = false;
    for (let index = 1; index < route.length; index += 1) {
      const sourceId = route[index - 1]!;
      const targetId = route[index]!;
      const connection = engine.content.territories[sourceId]!.connections
        .find((candidate) => candidate.targetId === targetId);
      expect(connection, `${sourceId} must connect to ${targetId}`).toBeDefined();
      engine.state.territories[sourceId]!.army.manpower = 5;
      engine.state.territories[sourceId]!.army.baseAttack = 10;
      engine.state.territories[targetId]!.army.manpower = 0;
      const operation: FrontOperationV2 = {
        commanderId: southAfrica,
        sourceId,
        targetId,
        doctrine: 'breakthrough',
        access: connection!.kind === 'sea' ? 'naval' : 'land',
        startedTick: engine.state.tick,
        lastBattleTick: engine.state.tick,
        holdUntilTick: engine.state.tick + 12,
        momentum: 1,
      };
      const projection = projectCombatExchangeV2(
        engine.state,
        engine.content,
        southAfrica,
        ROGUE_AI_NATION_ID_V2,
        sourceId,
        targetId,
        operation.access,
        1,
        1,
      );
      expect(projection, `${sourceId} -> ${targetId} must have a live supply projection`)
        .toBeDefined();
      if (targetId === territoryIdV2('maud-entry')) {
        expect(operation.access).toBe('naval');
        navalSupply = projection!.attackerSupply;
        const navalQuote = frontCapacitySupplyQuoteV2(
          engine.state, sourceId, 'naval',
        );
        const landQuote = frontCapacitySupplyQuoteV2(
          engine.state, sourceId, 'land',
        );
        expect(navalSupply).toBe(navalQuote.readiness);
        expect(navalSupply).toBe(1);
        expect(navalQuote.capacityBudget).toBeCloseTo(landQuote.capacityBudget * 0.5, 9);
      }
      const battle = resolveBattlePulseV2(engine.state, engine.content, war, operation);
      expect(battle, `${targetId} should resolve through ordinary combat`).toBeDefined();
      expect(battle!.conquered, `${targetId} should be conquerable`).toBe(true);
      expect(engine.state.territories[targetId]!.owner).toBe(southAfrica);

      if (targetId === territoryIdV2('maud-entry')) {
        // Let the ordinary capture guard expire, then prove the exact same
        // owned naval edge carries paid, one-hop army logistics into the ice.
        engine.state.tick += 14;
        engine.state.players[southAfrica]!.treasury = 1_000_000;
        const cape = engine.state.territories[territoryIdV2('zaf')]!;
        const landing = engine.state.territories[targetId]!;
        cape.army.manpower = Math.max(5, cape.army.capacity * 4);
        landing.army.manpower = 0;
        war.defenderOperations = [{
          commanderId: southAfrica,
          sourceId: targetId,
          targetId: territoryIdV2('queen-maud-grid'),
          doctrine: 'breakthrough',
          access: 'land',
          startedTick: engine.state.tick,
          lastBattleTick: engine.state.tick,
          holdUntilTick: engine.state.tick + 12,
          momentum: 0,
        }];
        const movements = redistributeArmiesV2(engine.state, engine.content);
        const lift = movements.find((movement) => (
          movement.playerId === southAfrica
            && movement.targetId === targetId
            && movement.access === 'naval'
        ));
        expect(lift, 'captured Maud Landing must receive real naval logistics').toBeDefined();
        expect(lift!.manpower).toBeGreaterThan(0);
        expect(lift!.distanceKm).toBeGreaterThan(0);
        expect(lift!.logisticsCost).toBeGreaterThan(0);
        actualNavalMovement = true;
      }

      if (targetId === territoryIdV2('sentinel-labyrinth')) {
        const warIdsBefore = engine.state.wars.map((candidate) => candidate.id);
        const waveBefore = engine.state.polarEndgame.globalWave;
        engine.state.polarEndgame.nextCounteroffensiveTick = engine.state.tick;
        const wave = processRogueAiSurvivalV2(engine.state, engine.content);
        expect(wave.waveStarted).toBe(waveBefore);
        expect(engine.state.polarEndgame.globalWave).toBe(waveBefore + 1);
        expect(engine.state.wars.map((candidate) => candidate.id)).toEqual(warIdsBefore);
      }
    }

    expect(navalSupply).toBeGreaterThan(0);
    expect(actualNavalMovement).toBe(true);
    engine.step(1);
    expect(engine.state.polarEndgame).toMatchObject({
      phase: 'victory',
      victoryCommanderId: southAfrica,
      nextCounteroffensiveTick: null,
    });
    expect(engine.state.polarEndgame.sectors['zero-point-core']).toMatchObject({
      status: 'secured',
      integrity: 0,
      securedBy: southAfrica,
    });
    expect(engine.state).toMatchObject({
      gameOver: true,
      winnerId: southAfrica,
      speed: 0,
    });
    const settlement = createCampaignLifecycleSnapshotV1({
      source: engine,
      campaign: {
        campaignId: 'survival-core-victory',
        countryId: southAfrica,
        scenario: { mode: 'survival', version: 1, seed: 5_041 },
        rewardEligible: true,
        baseline: {
          startingTerritoryIds: [territoryIdV2('zaf')],
          startingMilitaryLosses: 0,
          startingTick: 0,
        },
      } as StoredCampaignV1,
    });
    expect(settlement).toMatchObject({
      outcome: 'victory',
      settlementId: 'survival-core-victory:victory',
      rewardEligible: true,
    });
    expect(settlement!.reward.masteryXp).toBeGreaterThan(0);
    expect(settlement!.reward.commanderXp).toBeGreaterThan(0);
    assertInvariantsV2(engine.state, engine.content);
    const terminalHash = engine.canonicalHash();
    engine.step(1);
    expect(engine.canonicalHash()).toBe(terminalHash);
  });
});
