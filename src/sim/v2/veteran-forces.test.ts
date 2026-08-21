import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { assertInvariantsV2 } from './invariants';
import {
  selectArmyCombatManpowerV2,
  selectArmyVeteranForcesV2,
  selectEffectiveAttackV2,
  selectEffectiveDefenseV2,
  selectVeteranForcesV2,
  selectVeteranMultipliersV2,
} from './selectors';
import { nationIdV2, territoryIdV2, type FrontOperationV2, type WarStateV2 } from './types';
import {
  equivalentVeteranExperienceV2,
  veteranBonusScoreV2,
  veteranRankV2,
} from './veterans';
import { processWarsV2, resolveBattlePulseV2 } from './war';

const bel = nationIdV2('bel');
const nld = nationIdV2('nld');
const belTerritory = territoryIdV2('bel');
const nldTerritory = territoryIdV2('nld');

function war(): WarStateV2 {
  return {
    id: 'veteran-war', attackerId: bel, defenderId: nld, startedTick: 0, lastBattleTick: 0,
    warScore: 0, battles: 0, attackerLosses: 0, defenderLosses: 0, lastPeaceOfferTick: -1,
    attackerOperations: [], defenderOperations: [],
  };
}

function operation(): FrontOperationV2 {
  return {
    commanderId: bel, sourceId: belTerritory, targetId: nldTerritory,
    doctrine: 'pressure', access: 'land', startedTick: 0, lastBattleTick: 0,
    holdUntilTick: 12, momentum: 0,
  };
}

describe('persistent Veteran Forces', () => {
  it('starts with no separate veteran currency or bonus', () => {
    const state = createWorldStateV2(8_001);
    expect(selectVeteranForcesV2(state, bel)).toEqual({
      manpower: 0,
      experience: 0,
      rank: 0,
      hpMultiplier: 1,
      attackMultiplier: 1,
      defenseMultiplier: 1,
    });
    expect(Object.keys(state.territories[belTerritory].army).sort()).toEqual([
      'baseAttack', 'baseDefense', 'capacity', 'manpower', 'veteranExperience', 'veteranManpower',
    ]);
  });

  it('uses modest uncapped square-root bonuses with diminishing returns', () => {
    const one = selectVeteranMultipliersV2(1);
    const four = selectVeteranMultipliersV2(4);
    const hundred = selectVeteranMultipliersV2(100);
    expect(four.hpMultiplier - 1).toBeCloseTo(2 * (one.hpMultiplier - 1), 8);
    expect(hundred.hpMultiplier).toBeGreaterThan(four.hpMultiplier);
    expect(hundred.attackMultiplier).toBeGreaterThan(four.attackMultiplier);
    expect(one.hpMultiplier - 1).toBeGreaterThan(one.attackMultiplier - 1);
    expect(one.attackMultiplier).toBe(one.defenseMultiplier);
  });

  it('merges the bonus score exactly and does not give a tiny rookie cohort elite XP', () => {
    const eliteManpower = 0.999;
    const rookieManpower = 0.001;
    const eliteExperience = 30_000;
    const rookieExperience = 0.20;
    const expectedScore = (
      eliteManpower * veteranBonusScoreV2(eliteExperience)
        + rookieManpower * veteranBonusScoreV2(rookieExperience)
    ) / (eliteManpower + rookieManpower);
    const equivalentExperience = equivalentVeteranExperienceV2([
      { manpower: eliteManpower, experience: eliteExperience },
      { manpower: rookieManpower, experience: rookieExperience },
    ]);

    expect(veteranBonusScoreV2(equivalentExperience)).toBeCloseTo(expectedScore, 9);
    expect(equivalentExperience).toBeLessThan(eliteExperience);
    expect(equivalentExperience).not.toBeCloseTo(
      (eliteManpower * eliteExperience + rookieManpower * eliteExperience)
        / (eliteManpower + rookieManpower),
      3,
    );
  });

  it('waits until the full war ends before promoting its survivors', () => {
    const state = createWorldStateV2(8_002);
    const attacker = state.territories[belTerritory].army;
    const defender = state.territories[nldTerritory].army;
    const activeWar = war();
    const result = resolveBattlePulseV2(state, WORLD_CONTENT_V2, activeWar, operation());
    expect(result).toBeDefined();
    expect(attacker.veteranManpower).toBe(0);
    expect(defender.veteranManpower).toBe(0);
    expect(attacker.veteranExperience).toBe(0);
    expect(defender.veteranExperience).toBe(0);

    state.wars = [activeWar];
    state.tick = activeWar.lastBattleTick + 26;
    processWarsV2(state, WORLD_CONTENT_V2);
    expect(state.wars).toHaveLength(0);
    expect(attacker.veteranManpower).toBeGreaterThan(0);
    expect(defender.veteranManpower).toBeGreaterThan(0);
    expect(attacker.veteranManpower).toBeLessThanOrEqual(attacker.manpower);
    expect(defender.veteranManpower).toBeLessThanOrEqual(defender.manpower);
    expect(attacker.veteranExperience).toBeGreaterThan(0);
    expect(defender.veteranExperience).toBeGreaterThan(0);
    expect(selectArmyVeteranForcesV2(attacker).rank).toBe(1);
    expect(selectArmyVeteranForcesV2(defender).rank).toBe(1);
    expect(veteranRankV2(attacker.veteranManpower, attacker.veteranExperience)).toBe(1);
    assertInvariantsV2(state, WORLD_CONTENT_V2);
  });

  it('adds veteran durability plus small ATK/DEF bonuses without adding headcount', () => {
    const state = createWorldStateV2(8_003);
    const army = state.territories[belTerritory].army;
    army.manpower = Math.min(army.capacity, 0.05);
    army.veteranManpower = army.manpower;
    army.veteranExperience = 25;
    const veterans = selectArmyVeteranForcesV2(army);
    expect(selectArmyCombatManpowerV2(state, bel, army)).toBeCloseTo(
      army.manpower * veterans.hpMultiplier,
      8,
    );
    const regular = { ...army, veteranManpower: 0, veteranExperience: 0 };
    expect(selectEffectiveAttackV2(state, WORLD_CONTENT_V2, bel, army))
      .toBeGreaterThan(selectEffectiveAttackV2(state, WORLD_CONTENT_V2, bel, regular));
    expect(selectEffectiveDefenseV2(state, WORLD_CONTENT_V2, bel, army))
      .toBeGreaterThan(selectEffectiveDefenseV2(state, WORLD_CONTENT_V2, bel, regular));
    expect(army.manpower).toBeLessThanOrEqual(army.capacity);
  });

  it('does not increase experience during a combat pulse and merges war rookies by bonus score', () => {
    const state = createWorldStateV2(8_004);
    const army = state.territories[belTerritory].army;
    army.veteranManpower = army.manpower * 0.25;
    army.veteranExperience = 4;
    const activeWar = war();
    resolveBattlePulseV2(state, WORLD_CONTENT_V2, activeWar, operation());
    expect(army.veteranExperience).toBe(4);

    const veteransBeforeAward = army.veteranManpower;
    state.wars = [activeWar];
    state.tick = activeWar.lastBattleTick + 26;
    processWarsV2(state, WORLD_CONTENT_V2);
    expect(army.veteranManpower).toBeGreaterThan(veteransBeforeAward);
    expect(army.veteranExperience).toBeGreaterThan(0);
    // Existing survivors advance, but Rank-1 promotions do not inherit XP 4;
    // their lower score can truthfully reduce the cohort's equivalent XP.
    expect(army.veteranExperience).toBeLessThan(4);
  });
});
