import { describe, expect, it } from 'vitest';
import {
  BATTLE_INTERVAL_TICKS,
  combatDefenseEffectV2,
  effectiveDefenseStatV2,
  RAPID_RECRUITMENT_COOLDOWN_TICKS,
  RAPID_RECRUITMENT_COST_MULTIPLIER,
  WAR_ACCESS_COST_MULTIPLIER,
  WAR_MOBILIZATION_TICKS,
  WAR_MOBILIZATION_COST_FACTOR,
  WAR_REVENGE_WINDOW_TICKS,
} from './balance';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { synchronizeArmyCapacityV2 } from './capacity';
import { assertInvariantsV2 } from './invariants';
import { OPENING_ARMY_BONUS_DURATION_TICKS_V2 } from './openingArmyBonus';
import {
  selectArmyStrengthV2,
  selectCatchUpFactorV2,
  selectCurrentPowerV2,
  selectEffectiveDefenseV2,
  selectTotalManpowerV2,
} from './selectors';
import { nationIdV2, territoryIdV2, type FrontOperationV2, type WarStateV2, type WorldStateV2 } from './types';
import { processWarsV2, resolveBattlePulseV2 } from './war';
import { WorldEngineV2 } from './WorldEngineV2';

const bel = nationIdV2('bel');
const nld = nationIdV2('nld');
const lux = nationIdV2('lux');
const isl = nationIdV2('isl');
const gbr = nationIdV2('gbr');
const usa = nationIdV2('usa');
const can = nationIdV2('can');
const belTerritory = territoryIdV2('bel');
const nldTerritory = territoryIdV2('nld');
const luxTerritory = territoryIdV2('lux');

function activeWar(state: WorldStateV2, attackerId = bel, defenderId = nld): WarStateV2 {
  const war: WarStateV2 = {
    id: 'war-manpower', attackerId, defenderId, startedTick: 0, lastBattleTick: 0,
    warScore: 0, battles: 0, attackerLosses: 0, defenderLosses: 0, lastPeaceOfferTick: -1_000_000,
    attackerOperations: [], defenderOperations: [],
  };
  state.wars = [war];
  return war;
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

function equalPulse(
  seed: number,
  mutate?: (state: WorldStateV2) => void,
) {
  const state = createWorldStateV2(seed);
  state.tick = 2;
  state.territories[belTerritory].army = {
    ...state.territories[belTerritory].army,
    manpower: 0.10, capacity: 0.10,
  };
  state.territories[nldTerritory].army = {
    ...state.territories[nldTerritory].army,
    manpower: 0.10, capacity: 0.10,
  };
  state.territories[belTerritory].condition = 1;
  state.territories[nldTerritory].condition = 1;
  mutate?.(state);
  return resolveBattlePulseV2(state, WORLD_CONTENT_V2, activeWar(state), operation())!;
}

describe('V2 one-source manpower combat', () => {
  it('stores army manpower only on territories and derives national totals/views', () => {
    const state = createWorldStateV2(301);
    expect(state.schemaVersion).toBe(22);
    expect(state.players[bel]).not.toHaveProperty('manpower');
    expect(Object.keys(state.territories[belTerritory].army).sort()).toEqual([
      'baseAttack', 'baseDefense', 'capacity', 'manpower',
    ]);
    const total = selectTotalManpowerV2(state, bel);
    expect(total.deployed).toBeCloseTo(state.territories[belTerritory].army.manpower, 6);
    expect(total.capacity).toBeCloseTo(state.territories[belTerritory].army.capacity, 6);
    const engine = new WorldEngineV2(301);
    expect(engine.player(bel)?.manpower).toBe(engine.totalManpower(bel).deployed);
    expect(engine.player(bel)?.capacity).toBe(engine.totalManpower(bel).capacity);
  });

  it('makes the explicit defender position bonus produce a real equal-force advantage', () => {
    const event = equalPulse(302);
    expect(event.defenderLosses).toBeLessThan(event.attackerLosses);
  });

  it('uses all four directional ATK/DEF effects in casualty resolution', () => {
    const baseline = equalPulse(303);
    const attackerAttack = equalPulse(303, (state) => { state.players[bel].research.effectLevels.attack = 1; });
    const attackerDefense = equalPulse(303, (state) => { state.players[bel].research.effectLevels.defense = 1; });
    const defenderAttack = equalPulse(303, (state) => { state.players[nld].research.effectLevels.attack = 1; });
    const defenderDefense = equalPulse(303, (state) => { state.players[nld].research.effectLevels.defense = 1; });
    expect(attackerAttack.defenderLosses).toBeGreaterThan(baseline.defenderLosses);
    expect(attackerDefense.attackerLosses).toBeLessThan(baseline.attackerLosses);
    expect(defenderAttack.attackerLosses).toBeGreaterThan(baseline.attackerLosses);
    expect(defenderDefense.defenderLosses).toBeLessThan(baseline.defenderLosses);
  });

  it('keeps the whole displayed DEF stat fully linear', () => {
    expect(effectiveDefenseStatV2(0.70)).toBeCloseTo(0.70, 9);
    expect(effectiveDefenseStatV2(1)).toBe(1);
    expect(effectiveDefenseStatV2(2)).toBe(2);
    expect(effectiveDefenseStatV2(4)).toBe(4);
    expect(effectiveDefenseStatV2(100)).toBe(100);
  });

  it('lowers combat DEF while preserving parity and flattening extreme advantages', () => {
    expect(combatDefenseEffectV2(1, 1)).toBeCloseTo(0.75, 9);
    expect(combatDefenseEffectV2(2, 2)).toBeCloseTo(1.5, 9);
    expect(combatDefenseEffectV2(0.8, 1)).toBeCloseTo(0.60, 9);

    const atParity = combatDefenseEffectV2(1, 1);
    const twiceAttack = combatDefenseEffectV2(2, 1);
    const fiveTimesAttack = combatDefenseEffectV2(5, 1);
    const tenTimesAttack = combatDefenseEffectV2(10, 1);
    expect(atParity).toBeLessThan(1);
    expect(twiceAttack).toBeGreaterThan(atParity);
    expect(fiveTimesAttack).toBeGreaterThan(twiceAttack);
    expect(tenTimesAttack).toBeGreaterThan(fiveTimesAttack);
    expect(twiceAttack).toBeLessThan(2 * 0.75);
    expect(tenTimesAttack).toBeLessThan(10 * 0.75 * 0.75);
    expect((fiveTimesAttack - twiceAttack) / 3).toBeGreaterThan(
      (tenTimesAttack - fiveTimesAttack) / 5,
    );
  });

  it('keeps every DEF research upgrade useful without suppressing the displayed stat', () => {
    const state = createWorldStateV2(3031);
    const base = selectEffectiveDefenseV2(state, WORLD_CONTENT_V2, bel, state.territories[belTerritory].army);
    const normalized: number[] = [];
    for (const level of [0, 5, 10, 20]) {
      state.players[bel].research.effectLevels.defense = level;
      normalized.push(selectEffectiveDefenseV2(
        state, WORLD_CONTENT_V2, bel, state.territories[belTerritory].army,
      ) / base);
    }
    expect(normalized[0]).toBeCloseTo(1, 5);
    expect(normalized[1]).toBeGreaterThan(normalized[0]!);
    expect(normalized[2]).toBeGreaterThan(normalized[1]!);
    expect(normalized[3]).toBeGreaterThan(normalized[2]!);
    expect(normalized[2]! - normalized[1]!).toBeGreaterThan(0);
    expect(normalized[3]! - normalized[2]!).toBeGreaterThan(0);
  });

  it('lets a four-to-one field advantage inflict more absolute losses despite the position bonus', () => {
    const event = equalPulse(3032, (state) => {
      state.territories[belTerritory].army = {
        ...state.territories[belTerritory].army,
        manpower: 0.40, capacity: 0.40,
      };
    });
    expect(event.defenderLosses).toBeGreaterThan(event.attackerLosses);
  });

  it('applies casualty reduction directly to deployed manpower and civilian losses', () => {
    const baseline = equalPulse(304);
    const casualtyProtected = equalPulse(304, (state) => {
      state.players[nld].research.effectLevels['casualty-reduction'] = 25;
    });
    expect(casualtyProtected.defenderLosses).toBeLessThan(baseline.defenderLosses);
    expect(casualtyProtected.defenderLosses).toBeGreaterThan(baseline.defenderLosses * 0.70);
    expect(casualtyProtected.populationLoss).toBeLessThan(baseline.populationLoss);
  });

  it('bases equally matched pulse damage on the troops actually present', () => {
    const full = equalPulse(3052);
    const half = equalPulse(3052, (state) => {
      state.territories[belTerritory].army.manpower *= 0.5;
      state.territories[nldTerritory].army.manpower *= 0.5;
    });
    expect(half.attackerLosses * 2).toBeCloseTo(full.attackerLosses, 5);
    expect(half.defenderLosses * 2).toBeCloseTo(full.defenderLosses, 5);
  });

  it('clears an operation immediately when its source army is exhausted by the pulse', () => {
    const state = createWorldStateV2(3051);
    state.tick = 2;
    state.territories[belTerritory].army = {
      ...state.territories[belTerritory].army,
      manpower: 0.000001, capacity: 0.10,
    };
    state.territories[nldTerritory].army = {
      ...state.territories[nldTerritory].army,
      manpower: 0.10, capacity: 0.10,
    };
    const war = activeWar(state);
    const front = operation();
    war.attackerOperations = [front];
    resolveBattlePulseV2(state, WORLD_CONTENT_V2, war, front);
    expect(state.territories[belTerritory].army.manpower).toBe(0);
    expect(war.attackerOperations).toHaveLength(0);
  });

  it('keeps a living empire at war for one bounded retaliation window after a conquest', () => {
    const state = createWorldStateV2(306);
    state.territories[luxTerritory].owner = nld;
    state.territories[luxTerritory].coreOwner = nld;
    state.territories[luxTerritory].integration = 1;
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    state.territories[nldTerritory].army.manpower = 0;
    state.territories[luxTerritory].army.manpower = 0;
    const beforeVictor = selectTotalManpowerV2(state, bel);
    const beforeTreasury = state.players[nld].treasury;
    const victorTreasury = state.players[bel].treasury;
    activeWar(state);
    state.tick = WAR_MOBILIZATION_TICKS;
    processWarsV2(state, WORLD_CONTENT_V2);
    expect([nldTerritory, luxTerritory].filter((id) => state.territories[id].owner === bel)).toHaveLength(1);
    expect([nldTerritory, luxTerritory].filter((id) => state.territories[id].owner === nld)).toHaveLength(1);
    expect(state.wars).toHaveLength(1);
    expect(state.wars[0]!.revenge).toEqual({
      claimantId: nld,
      triggeredTick: WAR_MOBILIZATION_TICKS,
      expiresTick: WAR_MOBILIZATION_TICKS + WAR_REVENGE_WINDOW_TICKS,
    });
    expect(state.players[bel].treasury).toBeCloseTo(victorTreasury, 6);
    expect(selectTotalManpowerV2(state, bel).deployed).toBe(beforeVictor.deployed);
    expect(state.players[nld].treasury).toBe(beforeTreasury);
    assertInvariantsV2(state, WORLD_CONTENT_V2);
  });

  it('uses deterministic ceasefire instead of mutual absorption when both armies are zero', () => {
    const state = createWorldStateV2(307);
    state.territories[belTerritory].army.manpower = 0;
    state.territories[nldTerritory].army.manpower = 0;
    activeWar(state);
    processWarsV2(state, WORLD_CONTENT_V2);
    expect(state.wars).toHaveLength(0);
    expect(state.territories[belTerritory].owner).toBe(bel);
    expect(state.territories[nldTerritory].owner).toBe(nld);
    expect(state.truces).toHaveLength(1);
  });

  it('allows a deliberately underfilled small army to declare immediately when legal and funded', () => {
    const engine = new WorldEngineV2(308);
    expect(engine.chooseCountry(isl)).toEqual({ accepted: true });
    engine.stopClock();
    for (const territory of engine.territoriesOf(isl)) territory.army.manpower = territory.army.capacity * 0.10;
    engine.state.players[isl].treasury = 100;
    const status = engine.warDeclarationStatus(isl, gbr);
    expect(status.allowed).toBe(true);
    expect(status.warning).toMatch(/manned/i);
    expect(status).not.toHaveProperty('readiness');
    expect(engine.declareWar(isl, gbr).accepted).toBe(true);
    engine.step();
    expect(engine.activeWarBetween(isl, gbr)).toBeDefined();
  });

  it('makes declarations free without making army strength a gate', () => {
    const engine = new WorldEngineV2(311);
    const landCost = engine.warMobilizationCost(usa, can);
    expect(engine.warAccessType(usa, can)).toBe('land');
    expect(landCost).toBe(0);
    const navalCost = engine.warMobilizationCost(isl, gbr);
    expect(engine.warAccessType(isl, gbr)).toBe('naval');
    expect(navalCost).toBe(0);
  });

  it('reports a negative net manpower trend when war losses exceed recruitment', () => {
    const engine = new WorldEngineV2(309);
    engine.state.tick = 10;
    const war = activeWar(engine.state);
    war.attackerLosses = 0.20;
    expect(engine.weeklyManpowerTrend(bel)).toBeLessThan(0);
  });

  it('offers a bounded surge with a fixed opening quote that rises only after use', () => {
    const engine = new WorldEngineV2(3091);
    for (const territory of engine.territoriesOf(bel)) territory.army.manpower = territory.army.capacity * 0.40;
    engine.state.players[bel].treasury = 10_000;
    const peace = engine.rapidRecruitmentTerms(bel);
    expect(peace.allowed).toBe(true);
    expect(peace.atWar).toBe(false);
    expect(peace.amount).toBeCloseTo(peace.capacity * 0.05, 6);
    expect(peace.deployedAfter).toBeLessThanOrEqual(peace.capacity);
    expect(peace.cost).toBeCloseTo(peace.amount * peace.costPerMillion, 6);
    expect(RAPID_RECRUITMENT_COST_MULTIPLIER).toBe(400);
    expect(peace.qualityMultiplier).toBeGreaterThan(1);
    expect(peace.qualityCostMultiplier).toBeGreaterThan(1);

    activeWar(engine.state);
    const war = engine.rapidRecruitmentTerms(bel);
    expect(war.atWar).toBe(true);
    expect(war.allowed).toBe(false);
    expect(war.reason).toMatch(/war.*reserve/i);
    expect(war.cost).toBe(peace.cost);
    const treasuryBeforeRejectedAction = engine.state.players[bel].treasury;
    expect(engine.rapidRecruitment(bel).accepted).toBe(false);
    expect(engine.state.players[bel].treasury).toBe(treasuryBeforeRejectedAction);
    expect(engine.state.players[bel].manualActionUses.rapidRecruitment).toBe(0);
    engine.state.players[bel].manualActionUses.rapidRecruitment = 1;
    expect(engine.rapidRecruitmentTerms(bel).cost).toBeGreaterThan(peace.cost);
  });

  it('rejects a queued peacetime surge if war starts before the action is applied', () => {
    const engine = new WorldEngineV2(30_911);
    const control = new WorldEngineV2(30_911);
    for (const candidate of [engine, control]) {
      for (const territory of candidate.territoriesOf(bel)) {
        territory.army.manpower = territory.army.capacity * 0.40;
      }
      candidate.state.players[bel].treasury = 10_000;
    }

    expect(engine.rapidRecruitment(bel).accepted).toBe(true);
    activeWar(engine.state);
    activeWar(control.state);
    engine.step();
    control.step();

    expect(engine.state.players[bel].manualActionUses.rapidRecruitment).toBe(0);
    expect(engine.state.players[bel].rapidRecruitmentAvailableTick).toBe(0);
    expect(engine.state.players[bel].treasury).toBe(control.state.players[bel].treasury);
    expect(engine.state.players[bel].trainedReserves).toBe(control.state.players[bel].trainedReserves);
    expect(engine.totalManpower(bel)).toEqual(control.totalManpower(bel));
  });

  it('prices emergency recruitment by batch size and ATK/DEF quality instead of national income', () => {
    const belgium = new WorldEngineV2(3_091);
    const china = new WorldEngineV2(3_091);
    for (const territory of belgium.territoriesOf(bel)) territory.army.manpower = territory.army.capacity * 0.40;
    for (const territory of china.territoriesOf(nationIdV2('chn'))) territory.army.manpower = territory.army.capacity * 0.40;
    belgium.state.players[bel].treasury = 100_000;
    china.state.players[nationIdV2('chn')].treasury = 100_000;

    const smallBatch = belgium.rapidRecruitmentTerms(bel);
    const largeBatch = china.rapidRecruitmentTerms('chn');
    expect(largeBatch.amount).toBeGreaterThan(smallBatch.amount * 10);
    expect(largeBatch.costPerMillion).not.toBe(smallBatch.costPerMillion);
    expect(smallBatch.cost / smallBatch.amount).toBeCloseTo(smallBatch.costPerMillion, 3);
    expect(largeBatch.cost / largeBatch.amount).toBeCloseTo(largeBatch.costPerMillion, 3);
  });

  it('charges and distributes rapid recruitment without ever increasing army capacity', () => {
    const engine = new WorldEngineV2(3092);
    engine.chooseCountry(bel);
    const capacityTarget = engine.armyStrength(bel).capacityTarget;
    for (const territory of engine.territoriesOf(bel)) {
      territory.army.capacity = capacityTarget;
      territory.army.manpower = territory.army.capacity * 0.25;
    }
    engine.state.players[bel].openingArmyBonus = null;
    engine.state.players[bel].treasury = 1_000_000;
    const treasuryBefore = engine.state.players[bel].treasury;
    const before = engine.totalManpower(bel);
    const localArmy = engine.territoriesOf(bel)[0]!.army;
    localArmy.baseAttack = 10;
    localArmy.baseDefense = 9;
    const attackMassBefore = localArmy.manpower * localArmy.baseAttack;
    const defenseMassBefore = localArmy.manpower * localArmy.baseDefense;
    const terms = engine.rapidRecruitmentTerms(bel);
    expect(engine.rapidRecruitment(bel).accepted).toBe(true);
    engine.step();
    const after = engine.totalManpower(bel);
    // The weekly population phase may move the derived cap by a few people;
    // rapid recruitment itself must not create a material capacity upgrade.
    expect(after.capacity).toBeCloseTo(before.capacity, 4);
    expect(after.deployed).toBeGreaterThanOrEqual(before.deployed + terms.amount - 0.000001);
    expect(after.deployed).toBeLessThanOrEqual(after.capacity);
    const recruited = after.deployed - before.deployed;
    expect(localArmy.manpower * localArmy.baseAttack).toBeCloseTo(
      attackMassBefore + recruited * WORLD_CONTENT_V2.nations[bel].militaryAttackRating, 5,
    );
    expect(localArmy.manpower * localArmy.baseDefense).toBeCloseTo(
      defenseMassBefore + recruited * WORLD_CONTENT_V2.nations[bel].militaryDefenseRating, 5,
    );
    expect(engine.state.players[bel].treasury).toBeLessThan(treasuryBefore);
    const cooldown = engine.rapidRecruitmentTerms(bel);
    expect(cooldown.allowed).toBe(false);
    expect(cooldown.cooldownRemaining).toBe(RAPID_RECRUITMENT_COOLDOWN_TICKS - 1);
    expect(cooldown.reason).toMatch(/weeks/i);
    assertInvariantsV2(engine.state, WORLD_CONTENT_V2);
  });

  it('keeps rapid recruitment manpower-only above 95% readiness', () => {
    const engine = new WorldEngineV2(3093);
    engine.chooseCountry(bel);
    // This is a generic paid-recruitment test, so observe it after the
    // temporary player opening force and cap curve have fully expired.
    engine.state.tick = OPENING_ARMY_BONUS_DURATION_TICKS_V2;
    engine.state.players[bel].openingArmyBonus = null;
    synchronizeArmyCapacityV2(engine.state, WORLD_CONTENT_V2);
    for (const territory of engine.territoriesOf(bel)) {
      territory.army.manpower = territory.army.capacity * 0.96;
    }
    engine.state.players[bel].treasury = 100_000;
    const before = engine.totalManpower(bel);
    const terms = engine.rapidRecruitmentTerms(bel);
    expect(terms.allowed).toBe(true);
    expect(terms.amount).toBeCloseTo(before.capacity - before.deployed, 6);
    expect(terms.deployedAfter).toBeCloseTo(before.capacity, 6);
    expect(terms.cost).toBeCloseTo(terms.amount * terms.costPerMillion, 6);
    expect(engine.rapidRecruitment(bel).accepted).toBe(true);
    engine.step();
    const after = engine.totalManpower(bel);
    // Only the live population/research formula may move capacity this week.
    expect(after.capacity).toBeCloseTo(before.capacity, 4);
    expect(after.deployed).toBeGreaterThanOrEqual(before.deployed + terms.amount - 0.000001);
    expect(after.deployed).toBeLessThanOrEqual(after.capacity);
    assertInvariantsV2(engine.state, WORLD_CONTENT_V2);
  });

  it('keeps the dimensionless power scale useful for ratios and small-country catch-up', () => {
    const state = createWorldStateV2(310);
    const belPower = selectCurrentPowerV2(state, WORLD_CONTENT_V2, bel);
    const nldPower = selectCurrentPowerV2(state, WORLD_CONTENT_V2, nld);
    expect(belPower).toBeGreaterThan(1);
    expect(nldPower).toBeGreaterThan(1);
    expect(belPower / nldPower).toBeGreaterThan(0.2);
    expect(belPower / nldPower).toBeLessThan(5);
    expect(selectCatchUpFactorV2(state, WORLD_CONTENT_V2, isl)).toBeGreaterThan(1);
    const icelandFill = selectArmyStrengthV2(state, WORLD_CONTENT_V2, isl).fillRatio;
    expect(icelandFill).toBeGreaterThan(0.7);
    expect(icelandFill).toBeLessThan(1);
  });
});
