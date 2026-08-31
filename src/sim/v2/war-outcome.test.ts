import { describe, expect, it } from 'vitest';
import { STALE_WAR_TICKS, WAR_MOBILIZATION_TICKS } from './balance';
import { createWorldStateV2 } from './bootstrap';
import { initializeCommanderForceV2 } from './commanderForce';
import { WORLD_CONTENT_V2 } from './content';
import { WorldEngineV2 } from './WorldEngineV2';
import { invalidateTerritoryIndexV2 } from './selectors';
import { enterPostBlackoutCampaignForTestV2 } from './testSupport';
import {
  nationIdV2,
  territoryIdV2,
  type BattleEventV2,
  type CommanderForceInitializationV2,
  type PlayerId,
  type WarOutcomeV2,
} from './types';
import { declareWarV2, recordApexWarBattleTelemetryV2 } from './war';

const id = (value: string) => value as PlayerId;

const TEST_APEX_PROFILE: CommanderForceInitializationV2 = {
  shield: {
    integrity: 0.0008,
    maxIntegrity: 0.0008,
    pulseAttack: 0.0008,
  },
  attackMultiplier: 1.10,
  defenseMultiplier: 1.10,
  treasury: 0,
  annualOutput: 0.015,
  supplyStock: 0.010,
};

describe('transient post-war outcomes', () => {
  it('emits one exact human report when both field armies are exhausted', () => {
    const state = createWorldStateV2(9_101, WORLD_CONTENT_V2);
    const humanId = id('bel');
    const opponentId = id('lux');
    state.humanPlayerId = humanId;
    state.humanPlayerIds = [humanId];
    expect(initializeCommanderForceV2(
      state, WORLD_CONTENT_V2, humanId, TEST_APEX_PROFILE,
    ).accepted).toBe(true);
    state.tick = 80;
    state.aiEscalation.lastWarStartTick = 1_000_000;
    state.wars = [{
      id: 'war-outcome-exhaustion',
      attackerId: humanId,
      defenderId: opponentId,
      startedTick: 20,
      lastBattleTick: 78,
      warScore: 4,
      battles: 10,
      attackerLosses: 0.012,
      defenderLosses: 0.021,
      attackerCivilianLosses: 0.004,
      defenderCivilianLosses: 0.009,
      lastPeaceOfferTick: -1_000_000,
      attackerOperations: [],
      defenderOperations: [],
    }];
    state.players[humanId].trainedReserves = 0;
    state.players[opponentId].trainedReserves = 0;
    for (const territory of Object.values(state.territories)) {
      if (territory.owner === humanId || territory.owner === opponentId) {
        territory.army.manpower = 0;
      }
    }
    const treasuryBefore = state.players[humanId].treasury;
    const engine = new WorldEngineV2(1, WORLD_CONTENT_V2, state);
    const beforeSnapshot = engine.militaryBaseSnapshot();
    const beforeStrength = engine.armyStrength(humanId);
    const beforeBase = beforeSnapshot.byNation.get(humanId)!;
    const beforeArmy = {
      manpower: beforeStrength.deployed,
      capacity: beforeStrength.capacity,
      baseAttack: beforeBase.attack,
      baseDefense: beforeBase.defense,
    };
    const expectedAttackBefore = engine.effectiveAttack(humanId, beforeArmy, beforeSnapshot);
    const expectedDefenseBefore = engine.effectiveDefense(humanId, beforeArmy, beforeSnapshot);
    const outcomes: WarOutcomeV2[] = [];
    engine.subscribe((_next, change) => {
      if (change.warOutcome) outcomes.push(change.warOutcome);
    });

    engine.step();

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({
      warId: 'war-outcome-exhaustion',
      endedTick: 81,
      humanId,
      opponentId,
      humanRole: 'attacker',
      result: 'stalemate',
      reason: 'Mutual army exhaustion ended the war without absorption.',
      battles: 10,
      warScore: 4,
      ownLosses: 0.012,
      enemyLosses: 0.021,
      ownCivilianLosses: 0.004,
      enemyCivilianLosses: 0.009,
      apexSupportedBattles: 0,
      apexPeakPower: 0,
      apexLosses: 0,
      apexSupplyDelivered: 0,
      apexSupplySpent: 0,
      survivingManpower: 0,
      territoriesGained: [],
      territoriesLost: [],
      treasuryBefore,
      treasuryAfter: engine.state.players[humanId].treasury,
      treasurySeized: 0,
      treasuryLost: 0,
    });
    expect(outcomes[0]).not.toHaveProperty('combatExperienceBefore');
    expect(outcomes[0]).not.toHaveProperty('combatExperienceAfter');
    expect(outcomes[0]).not.toHaveProperty('combatExperienceGained');
    expect(outcomes[0]!.effectiveAttackBefore).toBe(expectedAttackBefore);
    expect(outcomes[0]!.effectiveDefenseBefore).toBe(expectedDefenseBefore);
    const afterSnapshot = engine.militaryBaseSnapshot();
    const afterStrength = engine.armyStrength(humanId);
    const afterBase = afterSnapshot.byNation.get(humanId)!;
    const afterArmy = {
      manpower: afterStrength.deployed,
      capacity: afterStrength.capacity,
      baseAttack: afterBase.attack,
      baseDefense: afterBase.defense,
    };
    expect(outcomes[0]!.effectiveAttackAfter)
      .toBe(engine.effectiveAttack(humanId, afterArmy, afterSnapshot));
    expect(outcomes[0]!.effectiveDefenseAfter)
      .toBe(engine.effectiveDefense(humanId, afterArmy, afterSnapshot));
    expect(engine.state.wars.some((war) => war.id === 'war-outcome-exhaustion')).toBe(false);
  });

  it('records factual EONSCAR support from battle telemetry in the transient report', () => {
    const state = createWorldStateV2(9_102, WORLD_CONTENT_V2);
    const humanId = id('bel');
    const opponentId = id('lux');
    state.humanPlayerId = humanId;
    state.humanPlayerIds = [humanId];
    expect(initializeCommanderForceV2(
      state, WORLD_CONTENT_V2, humanId, TEST_APEX_PROFILE,
    ).accepted).toBe(true);
    state.tick = 80;
    state.aiEscalation.lastWarStartTick = 1_000_000;
    state.wars = [{
      id: 'war-outcome-apex',
      attackerId: humanId,
      defenderId: opponentId,
      startedTick: 20,
      lastBattleTick: state.tick - STALE_WAR_TICKS + 1,
      warScore: 8,
      battles: 2,
      attackerLosses: 0.008,
      defenderLosses: 0.016,
      lastPeaceOfferTick: -1_000_000,
      attackerOperations: [],
      defenderOperations: [],
    }];
    const engine = new WorldEngineV2(1, WORLD_CONTENT_V2, state);
    const battle = (overrides: Partial<BattleEventV2>): BattleEventV2 => ({
      warId: 'war-outcome-apex',
      source: 'bel' as BattleEventV2['source'],
      target: 'lux' as BattleEventV2['target'],
      attacker: humanId,
      defender: opponentId,
      sourceId: 'bel' as BattleEventV2['sourceId'],
      targetId: 'lux' as BattleEventV2['targetId'],
      attackerId: humanId,
      defenderId: opponentId,
      attackerLosses: 0.0035,
      defenderLosses: 0.008,
      regularAttackerLosses: 0.0035,
      regularDefenderLosses: 0.008,
      commanderAttackerId: humanId,
      commanderDefenderId: null,
      commanderAttackerLosses: 0.0005,
      commanderDefenderLosses: 0,
      commanderAttackerCounterpulseDamage: 0.00004,
      commanderAttackerSingularityPulse: true,
      commanderAttackerProjection: 'primary',
      commanderAttackerProjectionShare: 0.6,
      commanderAttackerPower: 0.058,
      commanderDefenderPower: 0,
      commanderAttackerSupplySpent: 0.004,
      commanderDefenderSupplySpent: 0,
      commanderAttackerSupplyDelivered: 0.0036,
      commanderDefenderSupplyDelivered: 0,
      attackerPopulationLoss: 0,
      defenderPopulationLoss: 0,
      populationLoss: 0,
      economyLoss: 0,
      capturedPopulation: 0,
      capturedEconomy: 0,
      treasurySeized: 0,
      conquered: false,
      terrain: 'plains',
      tactic: 'armored-breakthrough',
      phase: 'assault',
      attackerPower: 90,
      defenderPower: 40,
      operation: 'pressure',
      attackerSupply: 1,
      defenderSupply: 1,
      momentum: 0,
      supportingForces: 0,
      tick: 78,
      ...overrides,
    });
    recordApexWarBattleTelemetryV2(
      engine.state,
      engine.state.wars[0]!,
      battle({}),
    );
    recordApexWarBattleTelemetryV2(engine.state, engine.state.wars[0]!, battle({
      commanderAttackerPower: 0.062,
      commanderAttackerLosses: 0.00025,
      commanderAttackerCounterpulseDamage: 0.00001,
      commanderAttackerSingularityPulse: false,
      commanderAttackerProjection: 'secondary',
      commanderAttackerSupplySpent: 0.002,
      commanderAttackerSupplyDelivered: 0.0015,
    }));
    // The report must retain the conflict baseline rather than reinterpreting
    // integrity damage through whatever the current live capacity became.
    engine.state.commanderForces[humanId]!.shield.maxIntegrity = 0.002;
    const reloaded = WorldEngineV2.fromSave(engine.save(), WORLD_CONTENT_V2);
    expect(reloaded.state.wars[0]!.apexTelemetryByPlayer?.[humanId]).toEqual({
      supportedBattles: 2,
      peakPower: 62,
      maxIntegrity: 0.0008,
      integrityLosses: 0.00075,
      supplyDelivered: 0.0051,
      supplySpent: 0.006,
      singularityPulses: 1,
      mirrorCounterpulseDamage: 0.00005,
      twinProjectionBattles: 2,
    });
    const outcomes: WarOutcomeV2[] = [];
    reloaded.subscribe((_next, change) => {
      if (change.warOutcome) outcomes.push(change.warOutcome);
    });

    reloaded.step();

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({
      result: 'stalemate',
      reason: 'Conflict closed after 26 days without a legal battle front.',
      apexSupportedBattles: 2,
      apexPeakPower: 62,
      apexMaxIntegrity: 0.0008,
      apexLosses: 0.00075,
      apexSupplyDelivered: 0.0051,
      apexSupplySpent: 0.006,
      apexSingularityPulses: 1,
      apexMirrorCounterpulseDamage: 0.00005,
      apexTwinProjectionBattles: 2,
    });
    expect(reloaded.state.wars.some((war) => war.id === 'war-outcome-apex')).toBe(false);
  });

  it('keeps the active-war report baseline identical across save and reload', () => {
    const state = createWorldStateV2(9_103, WORLD_CONTENT_V2);
    const humanId = nationIdV2('bel');
    const opponentId = nationIdV2('nld');
    const humanTerritoryId = territoryIdV2('bel');
    const opponentTerritoryIds = [
      territoryIdV2('nld'),
      territoryIdV2('deu'),
      territoryIdV2('lux'),
    ];
    state.humanPlayerId = humanId;
    state.humanPlayerIds = [humanId];
    state.wars = [];
    state.offers = [];
    state.truces = [];
    enterPostBlackoutCampaignForTestV2(state);
    state.aiEscalation.lastWarStartTick = 1_000_000;
    state.players[humanId]!.treasury = 1_000_000;
    state.players[opponentId]!.trainedReserves = 0;
    for (const territoryId of opponentTerritoryIds.slice(1)) {
      const territory = state.territories[territoryId]!;
      territory.owner = opponentId;
      territory.coreOwner = opponentId;
      territory.integration = 1;
      delete territory.integrationProgram;
    }
    for (const territoryId of opponentTerritoryIds) {
      state.territories[territoryId]!.army.manpower = 0;
    }
    state.territories[humanTerritoryId]!.army = {
      ...state.territories[humanTerritoryId]!.army,
      manpower: 1,
      capacity: 1,
      baseAttack: 2,
      baseDefense: 2,
    };
    invalidateTerritoryIndexV2(state);
    expect(declareWarV2(
      state, WORLD_CONTENT_V2, humanId, opponentId,
    ).accepted).toBe(true);
    const declaredWar = state.wars.find((war) => (
      war.attackerId === humanId && war.defenderId === opponentId
    ))!;
    state.tick = declaredWar.startedTick + WAR_MOBILIZATION_TICKS - 1;

    const uninterrupted = new WorldEngineV2(1, WORLD_CONTENT_V2, state);
    const conquestBattles: BattleEventV2[] = [];
    uninterrupted.subscribe((_next, change) => {
      if (change.battle?.warId === declaredWar.id && change.battle.conquered) {
        conquestBattles.push(change.battle);
      }
    });
    uninterrupted.step();

    expect(conquestBattles).toHaveLength(1);
    expect(conquestBattles[0]!.targetId).toBe(territoryIdV2('nld'));
    const activeWar = uninterrupted.state.wars.find((war) => war.id === declaredWar.id)!;
    const baselineBeforeSave = structuredClone(
      activeWar.reportBaselineByPlayer?.[humanId],
    );
    expect(baselineBeforeSave).toMatchObject({
      ownedTerritoryIds: [humanTerritoryId],
      touchedTerritoryIds: [territoryIdV2('nld')],
      treasuryBefore: 1_000_000,
    });
    expect(baselineBeforeSave!.capacityBefore).toBeGreaterThan(0);

    const save = uninterrupted.save();
    const resumed = WorldEngineV2.fromSave(save, WORLD_CONTENT_V2);
    expect(resumed.save().canonicalStateHash).toBe(save.canonicalStateHash);
    expect(resumed.state.wars.find((war) => war.id === declaredWar.id)
      ?.reportBaselineByPlayer?.[humanId]).toEqual(baselineBeforeSave);

    const outcomes: WarOutcomeV2[] = [];
    for (const engine of [uninterrupted, resumed]) {
      engine.state.players[humanId]!.trainedReserves = 0;
      engine.state.players[opponentId]!.trainedReserves = 0;
      for (const territory of Object.values(engine.state.territories)) {
        if (territory.owner === humanId || territory.owner === opponentId) {
          territory.army.manpower = 0;
        }
      }
      engine.subscribe((_next, change) => {
        if (change.warOutcome?.warId === declaredWar.id) outcomes.push(change.warOutcome);
      });
      engine.step();
    }

    expect(outcomes).toHaveLength(2);
    expect(outcomes[1]).toEqual(outcomes[0]);
    expect(outcomes[0]).toMatchObject({
      result: 'territorial-gain',
      territoriesGained: [territoryIdV2('nld')],
      territoriesLost: [],
      treasuryBefore: 1_000_000,
      capacityBefore: baselineBeforeSave!.capacityBefore,
    });
  });
});
