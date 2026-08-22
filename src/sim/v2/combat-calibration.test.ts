import { describe, expect, it } from 'vitest';
import { nextRandom } from '../../game/random';
import {
  BATTLE_INTERVAL_TICKS,
  COMBAT_ROUTE_STRENGTH_RATIO,
  DEFENDER_COUNTERFIRE_MULTIPLIER,
  WAR_MOBILIZATION_TICKS,
} from './balance';
import { createWorldStateV2 } from './bootstrap';
import { synchronizeArmyCapacityV2 } from './capacity';
import { WORLD_CONTENT_V2 } from './content';
import { invalidateTerritoryIndexV2 } from './selectors';
import { nationIdV2, territoryIdV2, type FrontOperationV2, type WarStateV2, type WorldStateV2 } from './types';
import { WorldEngineV2 } from './WorldEngineV2';
import {
  civilianPopulationExposureV2,
  estimateLiveWarV2,
  forecastWarV2,
  processWarsV2,
  projectCombatExchangeV2,
  resolveBattlePulseV2,
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
  state.territories[belTerritory].condition = 1;
  state.territories[nldTerritory].condition = 1;
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
    weeks,
    attackerAlive: engine.territoriesOf(attackerId).length > 0,
    defenderAlive: engine.territoriesOf(defenderId).length > 0,
  };
}

describe('V2 coherent combat and forecast calibration', () => {
  it('uses the exact same projected exchange in the forecast and first live pulse', () => {
    const state = calibratedState();
    const projected = projectCombatExchangeV2(
      state, WORLD_CONTENT_V2, bel, nld, belTerritory, nldTerritory, 'land',
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
    const centralWeeks = Math.min(156, Math.max(4, BATTLE_INTERVAL_TICKS * decisivePulses));
    expect(forecast.estimatedWeeksMin).toBe(Math.max(2, Math.round(centralWeeks * 0.72)));
    expect(forecast.estimatedWeeksMax).toBe(Math.max(4, Math.round(centralWeeks * 1.35)));

    const rng = { rngState: state.rngState };
    const varianceA = 0.94 + nextRandom(rng) * 0.12;
    const varianceD = 0.94 + nextRandom(rng) * 0.12;
    const randomized = projectCombatExchangeV2(
      state, WORLD_CONTENT_V2, bel, nld, belTerritory, nldTerritory, 'land', varianceA, varianceD,
    )!;
    const event = resolveBattlePulseV2(state, WORLD_CONTENT_V2, war(state), operation())!;
    expect(event.attackerLosses).toBeCloseTo(randomized.attackerLosses, 6);
    expect(event.defenderLosses).toBeCloseTo(randomized.defenderLosses, 6);
  });

  it('lets every additional front soldier add damage without a pulse ceiling', () => {
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
    expect(two.defenderLosses).toBeCloseTo(one.defenderLosses * 2, 9);
    expect(two.defenderLossRate).toBeCloseTo(one.defenderLossRate * 2, 9);
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

  it('resolves two owned source armies as real fronts in the same battle round', () => {
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

    expect(battles).toHaveLength(2);
    expect(new Set(battles.map((battle) => battle.sourceId))).toEqual(
      new Set([belTerritory, deuTerritory]),
    );
    expect(battles.every((battle) => battle.tick === WAR_MOBILIZATION_TICKS)).toBe(true);
    expect(battles.every((battle) => battle.attackerLosses > 0)).toBe(true);
    expect(battles.every((battle) => battle.defenderLosses > 0)).toBe(true);
    expect(active.battles).toBe(2);
  });

  it('makes prepared defenders inflict extra attacker casualties and civilian harm remains defender-heavy', () => {
    const state = calibratedState(4_001_2);
    state.territories[belTerritory].army.manpower = 0.10;
    state.territories[belTerritory].army.capacity = 0.10;
    const projected = projectCombatExchangeV2(
      state, WORLD_CONTENT_V2, bel, nld, belTerritory, nldTerritory, 'land', 1, 1,
    )!;
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

  it('never inverts an overwhelming advantage or adds a synthetic wipe', () => {
    const state = calibratedState(4_002);
    state.territories[belTerritory].army.manpower = 1;
    state.territories[belTerritory].army.capacity = 1;
    state.territories[nldTerritory].army.manpower = 0.003;
    state.territories[nldTerritory].army.capacity = 0.10;
    const projected = projectCombatExchangeV2(
      state, WORLD_CONTENT_V2, bel, nld, belTerritory, nldTerritory, 'land', 1, 1,
    )!;
    expect(projected.defenderLosses).toBeGreaterThan(projected.attackerLosses);
    expect(projected.attackerLosses).toBeLessThan(0.05 * projected.defenderStrength);
    const event = resolveBattlePulseV2(state, WORLD_CONTENT_V2, war(state), operation())!;
    expect(event.defenderLosses).toBeGreaterThan(event.attackerLosses);
    expect(event.defenderLosses).toBeGreaterThan(0.003 * 0.90);
    expect(event.defenderLosses).toBeLessThan(0.003);
    expect(event.defenderLosses).toBeLessThanOrEqual(projected.defenderStrength);
    expect(state.territories[nldTerritory].army.manpower).toBeGreaterThan(0);
    expect(COMBAT_ROUTE_STRENGTH_RATIO).toBe(0.05);
  });

  it('does not add synthetic route casualties to a weak effective hit', () => {
    const state = calibratedState(4_002_1);
    state.territories[belTerritory].army.manpower = 1;
    state.territories[belTerritory].army.capacity = 1;
    // Keep the force at a meaningful 1,000-person scale, but make its opponent's
    // effective hit tiny even though the formation is below the route ratio.
    state.territories[belTerritory].army.baseAttack = 0.00001;
    state.territories[nldTerritory].army.manpower = 0.001;
    state.territories[nldTerritory].army.capacity = 0.001;
    const manpowerBefore = state.territories[nldTerritory].army.manpower;
    const event = resolveBattlePulseV2(state, WORLD_CONTENT_V2, war(state), operation())!;
    const canonicalLoss = manpowerBefore - state.territories[nldTerritory].army.manpower;

    expect(event.defenderLosses).toBe(0);
    expect(canonicalLoss).toBeGreaterThan(0);
    expect(canonicalLoss).toBeLessThan(manpowerBefore * 0.01);
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

  it('keeps a stronger China forecast and campaign from being padded by Indian replenishment', () => {
    const result = simulateWar(4_301, 'chn', 'chn', 'ind', 520);
    const midWar = result.engine.activeWarBetween('chn', 'ind');
    const indiaManpowerAtTenYears = result.engine.totalManpower('ind').deployed;
    const indiaReservesAtTenYears = result.engine.state.players[ind].trainedReserves;
    const indiaControlAtTenYears = result.engine.state.territories[territoryIdV2('ind')].control?.share ?? 0;
    let weeks = result.weeks;
    while (weeks < 572 && result.engine.activeWarBetween('chn', 'ind')) {
      result.engine.step();
      weeks += 1;
    }

    expect(result.forecast.winChance).toBeGreaterThan(50);
    expect(result.weeks).toBe(520);
    expect(result.defenderAlive).toBe(true);
    expect(midWar?.battles).toBeGreaterThan(250);
    expect(indiaManpowerAtTenYears).toBeGreaterThan(0);
    expect(indiaManpowerAtTenYears).toBeLessThan(result.defenderManpowerStart * 0.01);
    expect(indiaReservesAtTenYears).toBeLessThan(0.001);
    expect(indiaControlAtTenYears).toBeGreaterThan(0.90);
    expect(result.engine.activeWarBetween('chn', 'ind')).toBeUndefined();
    expect(result.engine.territoriesOf('ind')).toHaveLength(0);
    expect(weeks).toBeGreaterThan(520);
    expect(weeks).toBeLessThanOrEqual(572);
  }, 90_000);
});
