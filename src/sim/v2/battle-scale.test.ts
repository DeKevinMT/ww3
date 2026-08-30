import { describe, expect, it } from 'vitest';
import {
  BATTLE_INTERVAL_TICKS,
  COMBAT_DAMAGE_EFFECTIVENESS,
  WAR_MOBILIZATION_TICKS,
} from './balance';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { enterPostBlackoutCampaignForTestV2 } from './testSupport';
import {
  projectCombatExchangeV2,
  resolveBattlePulseV2,
} from './war';
import {
  nationIdV2,
  territoryIdV2,
  type FrontOperationV2,
  type WarStateV2,
  type WorldStateV2,
} from './types';
import { WorldEngineV2 } from './WorldEngineV2';

const belgium = nationIdV2('bel');
const netherlands = nationIdV2('nld');
const belgiumTerritory = territoryIdV2('bel');
const netherlandsTerritory = territoryIdV2('nld');

function peerState(seed: number, manpower: number): WorldStateV2 {
  const state = createWorldStateV2(seed);
  state.tick = WAR_MOBILIZATION_TICKS;
  state.wars = [];
  state.territories[belgiumTerritory]!.army = {
    ...state.territories[belgiumTerritory]!.army,
    manpower,
    capacity: manpower,
  };
  state.territories[netherlandsTerritory]!.army = {
    ...state.territories[netherlandsTerritory]!.army,
    manpower,
    capacity: manpower,
  };
  return state;
}

function peerWar(state: WorldStateV2): { war: WarStateV2; operation: FrontOperationV2 } {
  const operation: FrontOperationV2 = {
    commanderId: belgium,
    sourceId: belgiumTerritory,
    targetId: netherlandsTerritory,
    doctrine: 'pressure',
    access: 'land',
    startedTick: WAR_MOBILIZATION_TICKS,
    lastBattleTick: 0,
    holdUntilTick: WAR_MOBILIZATION_TICKS + 12,
    momentum: 0,
  };
  const war: WarStateV2 = {
    id: `battle-scale-${state.randomState}`,
    attackerId: belgium,
    defenderId: netherlands,
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
  return { war, operation };
}

function pulsesUntilOnePeerBreaks(seed: number, manpower: number): number {
  const state = peerState(seed, manpower);
  const { war, operation } = peerWar(state);
  let pulses = 0;
  while (pulses < 100) {
    const attacker = state.territories[belgiumTerritory]!.army.manpower;
    const defender = state.territories[netherlandsTerritory]!.army.manpower;
    if (attacker <= 0 || defender <= 0) break;
    state.tick = WAR_MOBILIZATION_TICKS + pulses * BATTLE_INTERVAL_TICKS;
    resolveBattlePulseV2(state, WORLD_CONTENT_V2, war, operation);
    pulses += 1;
  }
  return pulses;
}

describe('larger, supply-bound V2 field battles', () => {
  it('commits a visible but bounded share of two supplied peer armies', () => {
    const state = peerState(9_120_001, 0.10);
    const land = projectCombatExchangeV2(
      state,
      WORLD_CONTENT_V2,
      belgium,
      netherlands,
      belgiumTerritory,
      netherlandsTerritory,
      'land',
      1,
      1,
    )!;

    expect(COMBAT_DAMAGE_EFFECTIVENESS).toBe(0.0125);
    expect(land.attackerStrength).toBeCloseTo(0.10, 9);
    expect(land.defenderStrength).toBeCloseTo(0.10, 9);
    expect(land.attackerLossRate).toBeGreaterThan(0.01);
    expect(land.defenderLossRate).toBeGreaterThan(0.01);
    expect(land.attackerLossRate).toBeLessThan(0.04);
    expect(land.defenderLossRate).toBeLessThan(0.04);
    expect(land.attackerLosses).toBeLessThan(land.attackerStrength);
    expect(land.defenderLosses).toBeLessThan(land.defenderStrength);
  });

  it('reports full readiness for both fully funded land and naval attacks', () => {
    const state = peerState(9_120_002, 0.10);
    const land = projectCombatExchangeV2(
      state, WORLD_CONTENT_V2, belgium, netherlands,
      belgiumTerritory, netherlandsTerritory, 'land', 1, 1,
    )!;
    const naval = projectCombatExchangeV2(
      state, WORLD_CONTENT_V2, belgium, netherlands,
      belgiumTerritory, netherlandsTerritory, 'naval', 1, 1,
    )!;

    expect(naval.attackerSupply).toBe(1);
    expect(land.attackerSupply).toBe(1);
    expect(naval.defenderLosses).toBeCloseTo(land.defenderLosses, 9);
    expect(naval.defenderLosses).toBeGreaterThan(0);
  });

  it('resolves both full peer battles and depleted peer battles well before five years', () => {
    const fullStrengthPulses = pulsesUntilOnePeerBreaks(9_120_003, 0.10);
    const depletedPulses = pulsesUntilOnePeerBreaks(9_120_003, 0.008);
    const fullStrengthWeeks = WAR_MOBILIZATION_TICKS
      + fullStrengthPulses * BATTLE_INTERVAL_TICKS;
    const depletedWeeks = WAR_MOBILIZATION_TICKS
      + depletedPulses * BATTLE_INTERVAL_TICKS;

    expect(fullStrengthPulses).toBeGreaterThan(20);
    expect(depletedPulses).toBeGreaterThan(20);
    // A force below one complete 8%-capacity supply package fights less
    // efficiently, but both fixtures must still resolve far before five years.
    expect(fullStrengthWeeks).toBeLessThanOrEqual(130);
    expect(depletedWeeks).toBeLessThanOrEqual(130);
    expect(depletedPulses).not.toBe(fullStrengthPulses);
  });

  it('outpaces normal wartime recovery in the authoritative weekly simulation', () => {
    const engine = new WorldEngineV2(9_120_004);
    expect(engine.chooseCountry(belgium).accepted).toBe(true);
    enterPostBlackoutCampaignForTestV2(engine.state);
    engine.state.wars = [];
    engine.state.offers = [];
    engine.state.truces = [];
    engine.state.aiEscalation.lastWarStartTick = 1_000_000;
    delete engine.state.commanderForces[belgium];
    for (const [countryId, territoryId] of [
      [belgium, belgiumTerritory],
      [netherlands, netherlandsTerritory],
    ] as const) {
      engine.state.territories[territoryId]!.army.manpower = 0.04;
      engine.state.territories[territoryId]!.army.capacity = 0.04;
      engine.state.players[countryId]!.trainedReserves = 0;
      engine.state.players[countryId]!.openingArmyBonus = null;
      engine.state.players[countryId]!.treasury = 1_000;
      engine.state.players[countryId]!.foodStock = 10;
      engine.state.players[countryId]!.foodSecurity = 1;
    }
    expect(engine.declareWar(belgium, netherlands).accepted).toBe(true);

    // Player commands commit on the next authoritative tick.
    engine.step();
    let weeks = 1;
    expect(engine.activeWarBetween(belgium, netherlands)).toBeDefined();
    let firstBattleLossShare = 0;
    while (weeks < 208 && engine.activeWarBetween(belgium, netherlands)) {
      const attackerBefore = engine.state.territories[belgiumTerritory]!.army.manpower;
      const battlesBefore = engine.activeWarBetween(belgium, netherlands)!.battles;
      engine.step();
      weeks += 1;
      const active = engine.activeWarBetween(belgium, netherlands);
      if (firstBattleLossShare === 0 && (active?.battles ?? 1) > battlesBefore) {
        firstBattleLossShare = (
          attackerBefore - engine.state.territories[belgiumTerritory]!.army.manpower
        ) / attackerBefore;
      }
    }

    expect(firstBattleLossShare).toBeGreaterThan(0.005);
    expect(firstBattleLossShare).toBeLessThan(0.05);
    expect(engine.activeWarBetween(belgium, netherlands)).toBeUndefined();
    expect(weeks).toBeGreaterThan(40);
    expect(weeks).toBeLessThan(208);
  }, 15_000);
});
