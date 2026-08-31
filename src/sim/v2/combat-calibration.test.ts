import { describe, expect, it } from 'vitest';
import { nextRandom } from '../../game/random';
import {
  battleDamageMeanV2,
  battleDamageVarianceV2,
  BATTLE_INTERVAL_TICKS,
  ATTACKER_MILITARY_LOSS_MULTIPLIER,
  COMBAT_DAMAGE_EFFECTIVENESS,
  COMBAT_POWER_RATIO_EXPONENT,
  COMBAT_ROUTE_STRENGTH_RATIO,
  DEFENDER_COUNTERFIRE_MULTIPLIER,
  WAR_ACCESS_CASUALTY_MULTIPLIER,
  WAR_CAMPAIGN_MAX_TICKS,
  WAR_MOBILIZATION_TICKS,
} from './balance';
import { createWorldStateV2 } from './bootstrap';
import { synchronizeArmyCapacityV2 } from './capacity';
import {
  APEX_FRONTLINE_SHIELD_INTERCEPT_SHARE_V2,
  APEX_SHIELD_MAX_ENERGY_LOSS_SHARE_PER_HIT_V2,
  allocateApexFrontlineDamageV2,
} from './commanderForce';
import { ROGUE_AI_NATION_ID_V2, WORLD_CONTENT_V2 } from './content';
import { invalidateTerritoryIndexV2 } from './selectors';
import { enterPostBlackoutCampaignForTestV2 } from './testSupport';
import { humanStartingArmyMultiplierV2 } from './traits';
import { nationIdV2, territoryIdV2, type FrontOperationV2, type WarStateV2, type WorldStateV2 } from './types';
import { WorldEngineV2 } from './WorldEngineV2';
import {
  civilianPopulationExposureV2,
  estimateLiveWarV2,
  forecastWarV2,
  processWarsV2,
  projectCombatExchangeV2,
  resolveBattlePulseV2,
  strategicReserveReadinessMultiplierV2,
} from './war';

const bel = nationIdV2('bel');
const nld = nationIdV2('nld');
const deu = nationIdV2('deu');
const lux = nationIdV2('lux');
const usa = nationIdV2('usa');
const chn = nationIdV2('chn');
const ind = nationIdV2('ind');
const belTerritory = territoryIdV2('bel');
const nldTerritory = territoryIdV2('nld');
const deuTerritory = territoryIdV2('deu');

function war(state: WorldStateV2, attackerId = bel, defenderId = nld, id = 'war-calibration'): WarStateV2 {
  const active: WarStateV2 = {
    id,
    attackerId,
    defenderId,
    startedTick: 0,
    lastBattleTick: 0,
    warScore: 0,
    battles: 0,
    attackerLosses: 0,
    defenderLosses: 0,
    lastPeaceOfferTick: -1_000_000,
    attackerOperations: [],
    defenderOperations: [],
  };
  state.wars.push(active);
  return active;
}

function operation(): FrontOperationV2 {
  return {
    commanderId: bel,
    sourceId: belTerritory,
    targetId: nldTerritory,
    doctrine: 'pressure',
    access: 'land',
    startedTick: 0,
    lastBattleTick: 0,
    holdUntilTick: 12,
    momentum: 0,
  };
}

function calibratedState(seed = 4_001): WorldStateV2 {
  const state = createWorldStateV2(seed);
  state.tick = 2;
  state.wars = [];
  state.territories[belTerritory].army = {
    ...state.territories[belTerritory].army,
    manpower: 0.20, capacity: 0.20,
  };
  state.territories[nldTerritory].army = {
    ...state.territories[nldTerritory].army,
    manpower: 0.10, capacity: 0.10,
  };
  return state;
}

function isolatedEngine(seed: number, humanId: string): WorldEngineV2 {
  const engine = new WorldEngineV2(seed);
  expect(engine.chooseCountry(humanId).accepted).toBe(true);
  // These fixtures calibrate post-prologue combat, not the peaceful opening.
  // Unlock the fixture explicitly without weakening the production war gate.
  enterPostBlackoutCampaignForTestV2(engine.state);
  engine.state.wars = [];
  engine.state.offers = [];
  engine.state.truces = [];
  engine.state.aiEscalation.lastWarStartTick = 1_000_000;
  engine.state.players[nationIdV2(humanId)].treasury = 1_000_000;
  return engine;
}

function simulateWar(seed: number, humanId: string, attackerId: string, defenderId: string, maximumWeeks: number) {
  const engine = isolatedEngine(seed, humanId);
  const forecast = engine.warForecast(attackerId, defenderId);
  const defenderManpowerStart = engine.totalManpower(defenderId).deployed;
  const defenderReservesStart = engine.state.players[nationIdV2(defenderId)].trainedReserves;
  expect(engine.declareWar(attackerId, defenderId).accepted).toBe(true);
  engine.step();
  let weeks = 1;
  while (weeks < maximumWeeks && engine.activeWarBetween(attackerId, defenderId)) {
    engine.step();
    weeks += 1;
  }
  return {
    engine,
    forecast,
    defenderManpowerStart,
    defenderReservesStart,
    weeks,
    attackerAlive: engine.territoriesOf(attackerId).length > 0,
    defenderAlive: engine.territoriesOf(defenderId).length > 0,
  };
}

describe('V2 coherent combat and forecast calibration', () => {
  it('caps APEX interception at 75% of the post-DEF hit before applying its Energy budget', () => {
    const allocation = allocateApexFrontlineDamageV2({
      requestedDamage: 0.03,
      nationalManpower: 0.1,
      apex: {
        shieldActive: true,
        integrity: 0.05,
        maxIntegrity: 0.10,
      },
    });

    expect(APEX_FRONTLINE_SHIELD_INTERCEPT_SHARE_V2).toBe(0.75);
    expect(APEX_SHIELD_MAX_ENERGY_LOSS_SHARE_PER_HIT_V2).toBe(0.20);
    // The 75% share requests 0.0225, then the 20% Energy budget binds at 0.02.
    expect(allocation.interceptedDamage).toBeCloseTo(0.02, 9);
    expect(allocation.durabilityMultiplier).toBe(1);
    expect(allocation.apexLosses).toBeCloseTo(0.02, 9);
    expect(allocation.nationalLosses).toBeCloseTo(0.01, 9);
    expect(allocation.nationalLosses + allocation.interceptedDamage)
      .toBeCloseTo(0.03, 9);
  });

  it('spends the remaining Energy when it is below the per-hit shield budget', () => {
    const allocation = allocateApexFrontlineDamageV2({
      requestedDamage: 0.02,
      nationalManpower: 0.1,
      apex: {
        shieldActive: true,
        integrity: 0.004,
        maxIntegrity: 0.10,
      },
    });

    expect(allocation.apexLosses).toBeCloseTo(0.004, 9);
    expect(allocation.interceptedDamage).toBeCloseTo(0.004, 9);
    expect(allocation.nationalLosses).toBeCloseTo(0.016, 9);
    expect(allocation.nationalLosses + allocation.interceptedDamage)
      .toBeCloseTo(0.02, 9);
  });

  it('does not let an empty or unprotected national formation use shield Energy', () => {
    expect(allocateApexFrontlineDamageV2({
      requestedDamage: 0.02,
      nationalManpower: 0,
      apex: {
        shieldActive: true,
        integrity: 0.05,
        maxIntegrity: 0.10,
      },
    })).toMatchObject({
      nationalLosses: 0,
      apexLosses: 0,
      interceptedDamage: 0,
    });
    expect(allocateApexFrontlineDamageV2({
      requestedDamage: 0.02,
      nationalManpower: 0.1,
      apex: {
        shieldActive: false,
        integrity: 0.05,
        maxIntegrity: 0.10,
      },
    })).toMatchObject({
      nationalLosses: 0.02,
      apexLosses: 0,
      interceptedDamage: 0,
    });
  });

  it('leaves the full hit with the national army when no APEX supports the front', () => {
    expect(allocateApexFrontlineDamageV2({
      requestedDamage: 0.001,
      nationalManpower: 0.1,
    })).toMatchObject({
      nationalLosses: 0.001,
      apexLosses: 0,
      allyLosses: 0,
      interceptedDamage: 0,
    });
  });

  it('keeps the retired reserve pool neutral in strategic forecasts', () => {
    expect(strategicReserveReadinessMultiplierV2(0, 10)).toBeCloseTo(1, 9);
    expect(strategicReserveReadinessMultiplierV2(5, 10)).toBeCloseTo(1, 9);
    expect(strategicReserveReadinessMultiplierV2(10, 10)).toBeCloseTo(1, 9);
    expect(strategicReserveReadinessMultiplierV2(50, 10)).toBeCloseTo(1, 9);
    expect(strategicReserveReadinessMultiplierV2(10, 0)).toBeCloseTo(1, 9);
  });

  it('rolls wider battle damage and escalates bounded intensity over the first war year', () => {
    expect(battleDamageVarianceV2(0, 0)).toBeCloseTo(0.80, 9);
    expect(battleDamageVarianceV2(0.5, 0)).toBeCloseTo(1.05, 9);
    expect(battleDamageVarianceV2(1, 0)).toBeCloseTo(1.30, 9);
    expect(battleDamageVarianceV2(0, 26)).toBeCloseTo(0.85, 9);
    expect(battleDamageVarianceV2(0.5, 26)).toBeCloseTo(1.10, 9);
    expect(battleDamageVarianceV2(1, 26)).toBeCloseTo(1.35, 9);
    expect(battleDamageVarianceV2(0, 52)).toBeCloseTo(0.90, 9);
    expect(battleDamageVarianceV2(0.5, 52)).toBeCloseTo(1.15, 9);
    expect(battleDamageVarianceV2(1, 52)).toBeCloseTo(1.40, 9);
    expect(battleDamageVarianceV2(0.5, 26)).toBeGreaterThan(
      battleDamageVarianceV2(0.5, 0),
    );
    expect(battleDamageVarianceV2(0.5, 52)).toBeGreaterThan(1);

    const early = calibratedState(4_001_01);
    const earlyBattle = resolveBattlePulseV2(
      early,
      WORLD_CONTENT_V2,
      war(early),
      operation(),
    )!;
    const late = calibratedState(4_001_01);
    late.tick = WAR_MOBILIZATION_TICKS + 52;
    const lateBattle = resolveBattlePulseV2(
      late,
      WORLD_CONTENT_V2,
      war(late),
      operation(),
    )!;
    expect(lateBattle.attackerLosses).toBeGreaterThan(earlyBattle.attackerLosses);
    expect(lateBattle.defenderLosses).toBeGreaterThan(earlyBattle.defenderLosses);
  });

  it('uses the exact same projected exchange in the forecast and first live pulse', () => {
    const state = calibratedState();
    const expectedOpeningDamage = battleDamageMeanV2(0);
    const projected = projectCombatExchangeV2(
      state, WORLD_CONTENT_V2, bel, nld, belTerritory, nldTerritory, 'land',
      expectedOpeningDamage, expectedOpeningDamage,
    )!;
    const forecast = forecastWarV2(state, WORLD_CONTENT_V2, bel, nld);
    expect(forecast.projectedAttackerLosses).toBeCloseTo(projected.attackerLosses, 6);
    expect(forecast.projectedDefenderLosses).toBeCloseTo(projected.defenderLosses, 6);
    expect(forecast.projectedAttackerLossRate).toBeCloseTo(projected.attackerLossRate, 6);
    expect(forecast.projectedDefenderLossRate).toBeCloseTo(projected.defenderLossRate, 6);
    const decisivePulses = Math.min(
      Math.ceil(projected.attackerStrength / projected.attackerLosses),
      Math.ceil(projected.defenderStrength / projected.defenderLosses),
    );
    const centralWeeks = Math.min(
      WAR_CAMPAIGN_MAX_TICKS,
      Math.max(4, BATTLE_INTERVAL_TICKS * decisivePulses),
    );
    expect(forecast.estimatedWeeksMin).toBe(Math.max(2, Math.round(centralWeeks * 0.72)));
    expect(forecast.estimatedWeeksMax).toBe(Math.max(4, Math.round(centralWeeks * 1.35)));

    const rng = { rngState: state.rngState };
    const varianceA = battleDamageVarianceV2(nextRandom(rng), 0);
    const varianceD = battleDamageVarianceV2(nextRandom(rng), 0);
    const randomized = projectCombatExchangeV2(
      state, WORLD_CONTENT_V2, bel, nld, belTerritory, nldTerritory, 'land', varianceA, varianceD,
    )!;
    const event = resolveBattlePulseV2(state, WORLD_CONTENT_V2, war(state), operation())!;
    expect(event.attackerLosses).toBeCloseTo(randomized.attackerLosses, 6);
    expect(event.defenderLosses).toBeCloseTo(randomized.defenderLosses, 6);
  });

  it('lets a slow forecast extend beyond the retired three-year ceiling', () => {
    const state = calibratedState(4_001_001);
    for (const territoryId of [belTerritory, nldTerritory]) {
      state.territories[territoryId]!.army.baseAttack = 1;
      state.territories[territoryId]!.army.baseDefense = 5;
    }
    const expectedOpeningDamage = battleDamageMeanV2(0);
    const projection = projectCombatExchangeV2(
      state, WORLD_CONTENT_V2, bel, nld, belTerritory, nldTerritory, 'land',
      expectedOpeningDamage, expectedOpeningDamage,
    )!;
    const decisivePulses = Math.min(
      Math.ceil(projection.attackerStrength / projection.attackerLosses),
      Math.ceil(projection.defenderStrength / projection.defenderLosses),
    );
    const projectedWeeks = BATTLE_INTERVAL_TICKS * decisivePulses;
    const retiredThreeYearCeiling = 3 * 52;
    expect(projectedWeeks).toBeGreaterThan(retiredThreeYearCeiling);
    expect(projectedWeeks).toBeLessThan(WAR_CAMPAIGN_MAX_TICKS);

    const forecast = forecastWarV2(state, WORLD_CONTENT_V2, bel, nld);
    expect(forecast.estimatedWeeksMax).toBe(Math.round(projectedWeeks * 1.35));
    expect(forecast.estimatedWeeksMax)
      .toBeGreaterThan(Math.round(retiredThreeYearCeiling * 1.35));
  });

  it('keeps extreme national and Rogue DEF finite so real attacks always make progress', () => {
    const projectAgainstDefense = (
      defenderId: typeof nld | typeof ROGUE_AI_NATION_ID_V2,
      baseDefense: number,
    ) => {
      const state = calibratedState(4_001_002);
      state.territories[belTerritory].army.baseAttack = 1;
      state.territories[belTerritory].army.baseDefense = 1;
      state.territories[nldTerritory].owner = defenderId;
      state.territories[nldTerritory].army.baseAttack = 1;
      state.territories[nldTerritory].army.baseDefense = baseDefense;
      invalidateTerritoryIndexV2(state);
      return projectCombatExchangeV2(
        state,
        WORLD_CONTENT_V2,
        bel,
        defenderId,
        belTerritory,
        nldTerritory,
        'land',
        1,
        1,
      )!;
    };

    const ordinaryBaseline = projectAgainstDefense(nld, 1);
    const rogueBaseline = projectAgainstDefense(ROGUE_AI_NATION_ID_V2, 1);
    const ordinary = projectAgainstDefense(nld, 1_000_000);
    const rogue = projectAgainstDefense(ROGUE_AI_NATION_ID_V2, 1_000_000);

    expect(ordinary.defenderDefense).toBeGreaterThan(100_000);
    expect(rogue.defenderDefense).toBeGreaterThan(100_000);
    expect(ordinary.defenderLossRate).toBeGreaterThan(0.001);
    expect(rogue.defenderLossRate).toBeGreaterThan(0.001);
    expect(ordinary.defenderLossRate).toBeGreaterThan(
      ordinaryBaseline.defenderLossRate * 0.24,
    );
    expect(rogue.defenderLossRate).toBeGreaterThan(
      rogueBaseline.defenderLossRate * 0.24,
    );
    expect(ordinary.attackRatio).toBeGreaterThan(0);
    expect(rogue.attackRatio).toBeGreaterThan(0);
  });

  it('scales with additional frontier soldiers until the shared Empire hit cap binds', () => {
    const projection = (attackerManpower: number) => {
      const state = calibratedState(4_001_001);
      state.territories[belTerritory].army.manpower = attackerManpower;
      state.territories[belTerritory].army.capacity = attackerManpower;
      state.territories[nldTerritory].army.manpower = 0.10;
      state.territories[nldTerritory].army.capacity = 0.10;
      return projectCombatExchangeV2(
        state, WORLD_CONTENT_V2, bel, nld, belTerritory, nldTerritory, 'land', 1, 1,
      )!;
    };
    const one = projection(0.20);
    const two = projection(0.40);
    const overwhelming = projection(2);
    expect(two.rawDefenderLosses).toBeCloseTo(one.rawDefenderLosses * 2, 9);
    expect(two.defenderLosses).toBeCloseTo(one.defenderLosses * 2, 9);
    expect(two.defenderLossRate).toBeCloseTo(one.defenderLossRate * 2, 9);
    expect(overwhelming.rawDefenderLosses).toBeGreaterThan(overwhelming.defenderHitCap);
    expect(overwhelming.defenderLosses).toBeCloseTo(overwhelming.defenderHitCap, 9);
  });

  it('reports perspective-aware live damage and a bounded remaining-war estimate', () => {
    const state = calibratedState(4_001_01);
    const active = war(state);
    active.attackerOperations = [operation()];
    active.lastBattleTick = state.tick;
    active.attackerOperations[0]!.lastBattleTick = state.tick;
    active.battles = 4;
    active.attackerLosses = 0.012;
    active.defenderLosses = 0.031;
    const attackerView = estimateLiveWarV2(state, WORLD_CONTENT_V2, active.id, bel)!;
    const defenderView = estimateLiveWarV2(state, WORLD_CONTENT_V2, active.id, nld)!;
    expect(attackerView.totalOwnLosses).toBeCloseTo(0.012, 6);
    expect(attackerView.totalEnemyLosses).toBeCloseTo(0.031, 6);
    expect(defenderView.totalOwnLosses).toBe(attackerView.totalEnemyLosses);
    expect(defenderView.totalEnemyLosses).toBe(attackerView.totalOwnLosses);
    expect(attackerView.projectedOwnLosses).toBeGreaterThanOrEqual(0);
    expect(attackerView.projectedEnemyLosses).toBeGreaterThan(0);
    expect(attackerView.estimatedWeeksMin).toBeGreaterThan(0);
    expect(attackerView.estimatedWeeksMax).toBeGreaterThanOrEqual(attackerView.estimatedWeeksMin);
    expect(attackerView.confidence).toBe('medium');
  });

  it('mobilises for eight weeks, then keeps the normal two-week battle cadence', () => {
    const state = calibratedState(4_001_1);
    state.tick = 0;
    war(state);
    expect(WAR_MOBILIZATION_TICKS).toBe(8);
    expect(BATTLE_INTERVAL_TICKS).toBe(2);
    for (let week = 0; week < WAR_MOBILIZATION_TICKS; week += 1) {
      state.tick = week;
      expect(processWarsV2(state, WORLD_CONTENT_V2)).toHaveLength(0);
      expect(state.wars[0]!.battles).toBe(0);
    }
    state.tick = WAR_MOBILIZATION_TICKS;
    expect(processWarsV2(state, WORLD_CONTENT_V2)).toHaveLength(1);
    expect(state.wars[0]!.battles).toBe(1);

    state.tick += BATTLE_INTERVAL_TICKS - 1;
    expect(processWarsV2(state, WORLD_CONTENT_V2)).toHaveLength(0);
    expect(state.wars[0]!.battles).toBe(1);

    state.tick += 1;
    expect(processWarsV2(state, WORLD_CONTENT_V2)).toHaveLength(1);
    expect(state.wars[0]!.battles).toBe(2);
  });

  it('collapses multiple owned border armies into one bilateral front per battle round', () => {
    const state = createWorldStateV2(4_001_11);
    state.wars = [];
    state.tick = WAR_MOBILIZATION_TICKS;
    state.territories[deuTerritory].owner = bel;
    state.territories[deuTerritory].coreOwner = bel;
    state.territories[deuTerritory].integration = 1;
    delete state.territories[deuTerritory].integrationProgram;
    invalidateTerritoryIndexV2(state);
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    for (const sourceId of [belTerritory, deuTerritory]) {
      const army = state.territories[sourceId].army;
      army.manpower = army.capacity * 0.90;
    }
    state.territories[nldTerritory].army.manpower = state.territories[nldTerritory].army.capacity;
    const active = war(state, bel, nld, 'war-two-live-fronts');
    active.attackerOperations = [
      operation(),
      { ...operation(), sourceId: deuTerritory },
    ];

    const battles = processWarsV2(state, WORLD_CONTENT_V2);

    expect(battles).toHaveLength(1);
    expect([belTerritory, deuTerritory]).toContain(battles[0]!.sourceId);
    expect(battles.every((battle) => battle.tick === WAR_MOBILIZATION_TICKS)).toBe(true);
    expect(battles.every((battle) => battle.attackerLosses > 0)).toBe(true);
    expect(battles.every((battle) => battle.defenderLosses > 0)).toBe(true);
    expect(active.battles).toBe(1);
    expect(active.attackerOperations.length + active.defenderOperations.length).toBe(1);
  });

  it('makes prepared defenders inflict extra attacker casualties and civilian harm remains defender-heavy', () => {
    const state = calibratedState(4_001_2);
    state.territories[belTerritory].army.manpower = 0.10;
    state.territories[belTerritory].army.capacity = 0.10;
    const projected = projectCombatExchangeV2(
      state, WORLD_CONTENT_V2, bel, nld, belTerritory, nldTerritory, 'land', 1, 1,
    )!;
    const casualtyLevel = state.players[bel]!.research.effectLevels['casualty-reduction'];
    const expectedAttackerLosses = projected.attackerStrength * COMBAT_DAMAGE_EFFECTIVENESS
      * Math.pow(projected.counterRatio, COMBAT_POWER_RATIO_EXPONENT)
      * WAR_ACCESS_CASUALTY_MULTIPLIER.land * ATTACKER_MILITARY_LOSS_MULTIPLIER
      * (1 - 0.50 * casualtyLevel / (casualtyLevel + 30));
    expect(ATTACKER_MILITARY_LOSS_MULTIPLIER).toBe(1.08);
    expect(projected.attackerLosses).toBeCloseTo(expectedAttackerLosses, 9);
    expect(DEFENDER_COUNTERFIRE_MULTIPLIER).toBeGreaterThan(1);
    expect(projected.attackerLossRate).toBeGreaterThan(projected.defenderLossRate);
    const event = resolveBattlePulseV2(state, WORLD_CONTENT_V2, war(state), operation())!;
    expect(event.attackerPopulationLoss).toBeGreaterThan(0);
    expect(event.defenderPopulationLoss).toBeGreaterThan(event.attackerPopulationLoss);
    expect(event.defenderPopulationLoss / event.attackerPopulationLoss).toBeGreaterThanOrEqual(1.5);
    expect(event.defenderPopulationLoss / event.attackerPopulationLoss).toBeLessThanOrEqual(2);
    expect(event.defenderPopulationLoss).toBeGreaterThan(
      (event.attackerLosses + event.defenderLosses) * 0.25,
    );
    expect(event.populationLoss).toBe(event.defenderPopulationLoss);
  });

  it('dampens the casualty share for demographic giants without hiding civilian losses', () => {
    const belgiumExposure = civilianPopulationExposureV2(12);
    const chinaExposure = civilianPopulationExposureV2(1_400);
    expect(chinaExposure).toBeLessThan(belgiumExposure);
    expect(chinaExposure).toBeGreaterThanOrEqual(0.30);
    expect(7 * 0.002 * chinaExposure).toBeLessThan(0.005);
  });

  it('never inverts an overwhelming advantage or exceeds the real formation', () => {
    const state = calibratedState(4_002);
    // The bounded DEF curve makes larger versions of this fixture a legitimate
    // calculated wipe. A still-overwhelming 50:1 force stays below that natural
    // boundary so this case continues to detect synthetic route damage.
    state.territories[belTerritory].army.manpower = 0.15;
    state.territories[belTerritory].army.capacity = 0.15;
    state.territories[nldTerritory].army.manpower = 0.003;
    state.territories[nldTerritory].army.capacity = 0.10;
    const projected = projectCombatExchangeV2(
      state, WORLD_CONTENT_V2, bel, nld, belTerritory, nldTerritory, 'land', 1, 1,
    )!;
    expect(projected.defenderLosses).toBeGreaterThan(projected.attackerLosses);
    // The larger field-battle calibration leaves bounded counterfire below
    // 18% of the tiny defending formation; it remains decisively one-sided
    // without inventing route or wipe casualties.
    expect(projected.attackerLosses).toBeLessThan(0.18 * projected.defenderStrength);
    const event = resolveBattlePulseV2(state, WORLD_CONTENT_V2, war(state), operation())!;
    expect(event.defenderLosses).toBeGreaterThan(event.attackerLosses);
    expect(event.defenderLosses).toBeGreaterThan(0);
    expect(event.defenderLosses).toBeLessThanOrEqual(0.003);
    expect(event.defenderLosses).toBeLessThanOrEqual(projected.defenderStrength);
    expect(state.territories[nldTerritory].army.manpower).toBeGreaterThanOrEqual(0);
    expect(COMBAT_ROUTE_STRENGTH_RATIO).toBe(0.05);
  });

  it('does not add synthetic route casualties to a weak effective hit', () => {
    const state = calibratedState(4_002_1);
    state.territories[belTerritory].army.manpower = 1;
    state.territories[belTerritory].army.capacity = 1;
    // Keep the force at a meaningful 1,000-person scale, but make its opponent's
    // effective hit tiny even though the formation is below the route ratio.
    state.territories[belTerritory].army.baseAttack = 0.000001;
    state.territories[nldTerritory].army.manpower = 0.001;
    state.territories[nldTerritory].army.capacity = 0.001;
    const manpowerBefore = state.territories[nldTerritory].army.manpower;
    const event = resolveBattlePulseV2(state, WORLD_CONTENT_V2, war(state), operation())!;
    const canonicalLoss = manpowerBefore - state.territories[nldTerritory].army.manpower;

    expect(event.defenderLosses).toBeGreaterThan(0);
    expect(event.defenderLosses).toBeCloseTo(canonicalLoss, 6);
    expect(canonicalLoss).toBeGreaterThan(0);
    expect(canonicalLoss).toBeLessThan(manpowerBefore * COMBAT_ROUTE_STRENGTH_RATIO);
    expect(state.territories[nldTerritory].army.manpower).toBeGreaterThan(0);
  });

  it('moves forecast probability in all four ATK/DEF directions', () => {
    const chance = (mutate?: (state: WorldStateV2) => void) => {
      const state = calibratedState(4_003);
      mutate?.(state);
      return forecastWarV2(state, WORLD_CONTENT_V2, bel, nld).winChance;
    };
    const baseline = chance();
    expect(chance((state) => { state.players[bel].research.effectLevels.attack = 20; })).toBeGreaterThan(baseline);
    expect(chance((state) => { state.players[bel].research.effectLevels.defense = 20; })).toBeGreaterThan(baseline);
    expect(chance((state) => { state.players[nld].research.effectLevels.attack = 20; })).toBeLessThan(baseline);
    expect(chance((state) => { state.players[nld].research.effectLevels.defense = 20; })).toBeLessThan(baseline);
  });

  it('prices extra fronts, debt and food stress into strategic win probability', () => {
    const healthy = calibratedState(4_004);
    const baseline = forecastWarV2(healthy, WORLD_CONTENT_V2, bel, nld).winChance;
    const strained = calibratedState(4_004);
    strained.players[bel].treasury = -100;
    strained.players[bel].foodSecurity = 0.25;
    war(strained, bel, deu, 'war-second-front');
    expect(forecastWarV2(strained, WORLD_CONTENT_V2, bel, nld).winChance).toBeLessThan(baseline);
  });

  it('prices the full defending empire, support room and retaliation into conquest odds', () => {
    const shallow = calibratedState(4_004_1);
    shallow.territories[nldTerritory].army.manpower = 0.000001;
    const shallowForecast = forecastWarV2(shallow, WORLD_CONTENT_V2, bel, nld);

    const empire = calibratedState(4_004_1);
    empire.territories[nldTerritory].army.manpower = 0.000001;
    empire.territories[deuTerritory].owner = nld;
    empire.territories[deuTerritory].coreOwner = deu;
    empire.territories[deuTerritory].integration = 0.35;
    invalidateTerritoryIndexV2(empire);
    synchronizeArmyCapacityV2(empire, WORLD_CONTENT_V2);
    empire.territories[deuTerritory].army.manpower = empire.territories[deuTerritory].army.capacity;
    const empireForecast = forecastWarV2(empire, WORLD_CONTENT_V2, bel, nld);

    expect(empireForecast.defenderTerritoryCount).toBe(2);
    expect(empireForecast.defenderEmpireStrength).toBeGreaterThan(empireForecast.defenderStrength);
    expect(empireForecast.defenderEmpireSupport).toBeGreaterThan(0);
    expect(empireForecast.retaliationExpected).toBe(true);
    expect(empireForecast.winChance).toBeLessThan(shallowForecast.winChance);
    expect(empireForecast.winChance).toBeLessThanOrEqual(92);
  });

  it('chooses a viable committed border army instead of locking onto a peripheral crumb', () => {
    const state = calibratedState(4_005);
    state.territories[deuTerritory].owner = bel;
    state.territories[deuTerritory].coreOwner = bel;
    state.territories[deuTerritory].integration = 1;
    delete state.territories[deuTerritory].integrationProgram;
    state.territories[deuTerritory].army = {
      ...state.territories[deuTerritory].army,
      manpower: 0.60, capacity: 0.60,
    };
    state.territories[belTerritory].army = {
      ...state.territories[belTerritory].army,
      manpower: 0.001, capacity: 0.20,
    };
    state.territories[nldTerritory].army = {
      ...state.territories[nldTerritory].army,
      manpower: 0.10, capacity: 0.10,
    };
    invalidateTerritoryIndexV2(state);
    const forecast = forecastWarV2(state, WORLD_CONTENT_V2, bel, nld);
    expect(forecast.sourceId).toBe(deuTerritory);
    expect(forecast.attackerStrength).toBeCloseTo(0.60, 6);
  });

  it('calibrates dominant and desperate forecast buckets against repeated deterministic campaigns', () => {
    for (const seed of [4_101, 4_102, 4_103]) {
      const dominant = simulateWar(seed, 'deu', 'deu', 'lux', 156);
      expect(dominant.forecast.winChance).toBeGreaterThanOrEqual(70);
      expect(dominant.defenderAlive).toBe(false);
      expect(dominant.weeks).toBeLessThanOrEqual(dominant.forecast.estimatedWeeksMax + 52);
    }
    for (const seed of [4_201, 4_202]) {
      const desperate = simulateWar(seed, 'mex', 'mex', 'usa', 208);
      expect(desperate.forecast.winChance).toBeLessThanOrEqual(25);
      expect(desperate.attackerAlive && !desperate.defenderAlive).toBe(false);
    }
  }, 60_000);

  it('drains Indian reserves before China’s disadvantaged opening ends without conquering India', () => {
    const result = simulateWar(4_301, 'chn', 'chn', 'ind', 80);
    const indiaManpowerAtResolution = result.engine.totalManpower('ind').deployed;
    const indiaReservesAtResolution = result.engine.state.players[ind].trainedReserves;
    const indiaOwnerAtResolution = result.engine.state.territories[territoryIdV2('ind')].owner;

    // China sits near the strongest-country floor, so this is now a deliberately
    // desperate human opening rather than a near-even matchup.
    expect(humanStartingArmyMultiplierV2(chn)).toBeGreaterThan(0);
    expect(humanStartingArmyMultiplierV2(chn)).toBeLessThan(0.25);
    expect(result.forecast.winChance).toBe(5);
    expect(result.weeks).toBeLessThanOrEqual(80);
    expect(result.defenderAlive).toBe(true);
    expect(result.engine.activeWarBetween('chn', 'ind')).toBeUndefined();
    expect(indiaManpowerAtResolution).toBeGreaterThan(0);
    expect(result.defenderReservesStart).toBe(0);
    expect(indiaReservesAtResolution).toBe(0);
    expect(indiaManpowerAtResolution + indiaReservesAtResolution).toBeLessThan(
      result.defenderManpowerStart + result.defenderReservesStart,
    );
    expect(indiaOwnerAtResolution).toBe(ind);
    expect(result.engine.territoriesOf('ind').length).toBeGreaterThanOrEqual(1);
  }, 120_000);
});
