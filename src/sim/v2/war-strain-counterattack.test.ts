import { describe, expect, it } from 'vitest';
import {
  aiCounterattackCooldownV2,
  aiCounterattackPressureWithSuspicionV2,
  aiExpansionDeclarationChanceV2,
} from './ai';
import {
  CONQUEST_WAR_FATIGUE_MAX,
  CONQUEST_WAR_FATIGUE_MIN,
  PEACE_FATIGUE_RECOVERY_PER_WEEK,
} from './balance';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { createFinancePlansV2, processFinanceMilitaryV2 } from './economy';
import { invalidateTerritoryIndexV2 } from './selectors';
import {
  nationIdV2,
  territoryIdV2,
  type FrontOperationV2,
  type WarStateV2,
} from './types';
import { conquestWarFatigueShockV2, resolveBattlePulseV2 } from './war';
import {
  counterattackRiskForWarStrainV2,
  selectExpansionThreatSummaryV2,
  selectNeighborCounterattackRiskV2,
  selectWarStrainSummaryV2,
} from './warStrain';

describe('conquest war strain and neighbour counterattacks', () => {
  it('keeps the neighbour-risk curve monotone across guarded, high and critical thresholds', () => {
    const scores = [0, 39, 40, 50, 59, 60, 70, 79, 80, 90, 100];
    const risks = scores.map((score) => counterattackRiskForWarStrainV2(score, true));

    expect(risks[1]).toMatchObject({ level: 'none', pressure: 0 });
    expect(risks[2]).toMatchObject({ level: 'guarded' });
    expect(risks[5]).toMatchObject({ level: 'high', targetWarLimit: 2 });
    expect(risks[8]).toMatchObject({ level: 'critical', targetWarLimit: 3 });
    for (let index = 1; index < risks.length; index += 1) {
      expect(risks[index]!.pressure).toBeGreaterThanOrEqual(risks[index - 1]!.pressure);
      expect(risks[index]!.declarationChanceBonus)
        .toBeGreaterThanOrEqual(risks[index - 1]!.declarationChanceBonus);
    }
    expect(risks.at(-1)!.pressure).toBe(0.8);
    expect(risks.at(-1)!.declarationChanceBonus).toBeCloseTo(0.144, 9);
  });

  it('ignores military fatigue alone and reacts only to rapid expansion across a live border', () => {
    const state = createWorldStateV2(48_001, WORLD_CONTENT_V2);
    const belgium = nationIdV2('bel');
    const france = nationIdV2('fra');
    const japan = nationIdV2('jpn');
    const netherlands = nationIdV2('nld');
    const luxembourg = nationIdV2('lux');

    state.wars = [];
    state.players[belgium]!.warFatigue = 100;
    const exhausted = selectNeighborCounterattackRiskV2(
      state,
      WORLD_CONTENT_V2,
      france,
      belgium,
    );
    for (const conqueredId of [netherlands, luxembourg]) {
      const territory = state.territories[territoryIdV2(conqueredId)]!;
      territory.owner = belgium;
      territory.integration = 0.10;
      territory.integrationProgram = {
        fromOwnerId: conqueredId,
        fromCoreOwnerId: conqueredId,
        toOwnerId: belgium,
        startedTick: state.tick,
        completesTick: state.tick + 520,
        annualCost: 1,
        cause: 'conquest',
      };
    }
    invalidateTerritoryIndexV2(state);
    const rapidExpansion = selectNeighborCounterattackRiskV2(
      state,
      WORLD_CONTENT_V2,
      france,
      belgium,
    );
    const nonNeighbour = selectNeighborCounterattackRiskV2(
      state,
      WORLD_CONTENT_V2,
      japan,
      belgium,
    );

    expect(exhausted).toMatchObject({ isLandNeighbor: true, level: 'none', pressure: 0 });
    expect(selectExpansionThreatSummaryV2(state, WORLD_CONTENT_V2, belgium))
      .toMatchObject({ recentConquestCountries: 2 });
    expect(rapidExpansion.isLandNeighbor).toBe(true);
    expect(rapidExpansion.score).toBeGreaterThanOrEqual(40);
    expect(rapidExpansion.pressure).toBeGreaterThan(0);
    expect(nonNeighbour).toMatchObject({ isLandNeighbor: false, level: 'none', pressure: 0 });
    expect(nonNeighbour.priorityBonus).toBe(0);
    expect(nonNeighbour.declarationChanceBonus).toBe(0);
  });

  it('keeps the AI declaration propensity deterministic and progressively higher', () => {
    const input = {
      ratio: 1.2,
      expansionChance: 0.08,
      regionalEscalation: false,
      rivalInvaderCount: 0,
      globalWarLoad: 0.5,
    };
    const controlled = aiExpansionDeclarationChanceV2({
      ...input,
      neighborCounterattackPressure: 0,
    });
    const high = aiExpansionDeclarationChanceV2({
      ...input,
      neighborCounterattackPressure: 0.5,
    });
    const critical = aiExpansionDeclarationChanceV2({
      ...input,
      neighborCounterattackPressure: 1,
    });

    expect(aiExpansionDeclarationChanceV2({
      ...input,
      neighborCounterattackPressure: 0.5,
    })).toBe(high);
    expect(controlled).toBeLessThan(high);
    expect(high).toBeLessThan(critical);
    expect(critical).toBeLessThan(0.60);
  });

  it('lets suspicion amplify only an existing human-neighbour opening', () => {
    const strainOnly = aiCounterattackPressureWithSuspicionV2(0.50, 0, true);
    const combined = aiCounterattackPressureWithSuspicionV2(0.50, 100, true);
    expect(strainOnly).toBe(0.50);
    expect(combined).toBeCloseTo(0.60, 9);
    expect(aiCounterattackPressureWithSuspicionV2(0, 100, true)).toBe(0);
    expect(aiCounterattackPressureWithSuspicionV2(0.50, 100, false)).toBe(0.50);
    expect(aiCounterattackCooldownV2('critical', combined))
      .toBeLessThan(aiCounterattackCooldownV2('high', combined));
    expect(aiCounterattackCooldownV2('critical', combined)).toBeLessThanOrEqual(18);
  });

  it('adds a bounded size-scaled conquest shock to the actual attacker', () => {
    expect(conquestWarFatigueShockV2(0.001, 100)).toBeGreaterThanOrEqual(CONQUEST_WAR_FATIGUE_MIN);
    expect(conquestWarFatigueShockV2(100, 100)).toBe(CONQUEST_WAR_FATIGUE_MAX);
    expect(conquestWarFatigueShockV2(20, 100))
      .toBeGreaterThan(conquestWarFatigueShockV2(1, 100));

    const state = createWorldStateV2(48_002, WORLD_CONTENT_V2);
    const attacker = nationIdV2('bel');
    const defender = nationIdV2('lux');
    const sourceId = territoryIdV2('bel');
    const targetId = territoryIdV2('lux');
    const source = state.territories[sourceId]!;
    const target = state.territories[targetId]!;
    state.tick = 2;
    state.players[attacker]!.warFatigue = 0;
    source.army.manpower = Math.max(1, source.army.capacity);
    source.army.capacity = Math.max(1, source.army.capacity);
    target.army.manpower = 0;
    target.army.capacity = Math.max(1, target.army.capacity);
    const operation: FrontOperationV2 = {
      commanderId: attacker,
      sourceId,
      targetId,
      doctrine: 'breakthrough',
      access: 'land',
      startedTick: 0,
      lastBattleTick: 0,
      holdUntilTick: 8,
      momentum: 1,
    };
    const war: WarStateV2 = {
      id: 'war-conquest-strain',
      attackerId: attacker,
      defenderId: defender,
      startedTick: 0,
      lastBattleTick: 0,
      warScore: 0,
      battles: 0,
      attackerLosses: 0,
      defenderLosses: 0,
      lastPeaceOfferTick: -1_000_000,
      attackerOperations: [operation],
      defenderOperations: [],
    };
    state.wars = [war];
    const expectedShock = conquestWarFatigueShockV2(target.population, source.population);

    const battle = resolveBattlePulseV2(state, WORLD_CONTENT_V2, war, operation)!;

    expect(battle.conquered).toBe(true);
    expect(target.owner).toBe(attacker);
    expect(state.players[attacker]!.warFatigue).toBeGreaterThanOrEqual(expectedShock);
    expect(state.players[attacker]!.warFatigue).toBeLessThan(expectedShock + 0.25);
    expect(target.integrationProgram?.cause).toBe('conquest');
  });

  it('keeps conquest integration out of War Pressure while fatigue recovers in peacetime', () => {
    expect(PEACE_FATIGUE_RECOVERY_PER_WEEK).toBe(0.33);
    const state = createWorldStateV2(48_003, WORLD_CONTENT_V2);
    const belgium = nationIdV2('bel');
    const luxembourg = territoryIdV2('lux');
    const territory = state.territories[luxembourg]!;
    state.wars = [];
    territory.owner = belgium;
    territory.coreOwner = nationIdV2('lux');
    territory.integration = 0.10;
    territory.integrationProgram = {
      fromOwnerId: nationIdV2('lux'),
      fromCoreOwnerId: nationIdV2('lux'),
      toOwnerId: belgium,
      startedTick: 0,
      completesTick: 520,
      annualCost: 1,
      cause: 'conquest',
    };
    invalidateTerritoryIndexV2(state);
    state.players[belgium]!.warFatigue = 20;
    const initial = selectWarStrainSummaryV2(state, WORLD_CONTENT_V2, belgium).score;
    const fatigueBefore = state.players[belgium]!.warFatigue;

    const plans = createFinancePlansV2(state, WORLD_CONTENT_V2);
    processFinanceMilitaryV2(state, WORLD_CONTENT_V2, plans);
    state.tick += 1;

    expect(state.players[belgium]!.warFatigue)
      .toBeCloseTo(fatigueBefore - PEACE_FATIGUE_RECOVERY_PER_WEEK, 8);
    expect(selectWarStrainSummaryV2(state, WORLD_CONTENT_V2, belgium).score)
      .toBeLessThanOrEqual(initial);

    state.players[belgium]!.warFatigue = 0;
    const pressureScores = [0, 52, 104, 144].map((tick) => {
      state.tick = tick;
      return selectWarStrainSummaryV2(state, WORLD_CONTENT_V2, belgium).score;
    });
    expect(pressureScores).toEqual([0, 0, 0, 0]);
    state.tick = 0;
    expect(selectExpansionThreatSummaryV2(state, WORLD_CONTENT_V2, belgium))
      .toMatchObject({ recentConquestCountries: 1 });
  });
});
