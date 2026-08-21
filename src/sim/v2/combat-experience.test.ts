import { describe, expect, it } from 'vitest';
import { WorldEngineV2 } from './WorldEngineV2';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import {
  selectArmyCombatManpowerV2,
  selectCombatExperienceV2,
  selectEffectiveAttackV2,
  selectEffectiveDefenseV2,
} from './selectors';
import { nationIdV2, territoryIdV2, type WarStateV2 } from './types';
import { processWarsV2 } from './war';

const bel = nationIdV2('bel');
const nld = nationIdV2('nld');
const belTerritory = territoryIdV2('bel');
const nldTerritory = territoryIdV2('nld');

function concludedWar(battles: number): ReturnType<typeof createWorldStateV2> {
  const state = createWorldStateV2(8_001 + battles);
  state.tick = 20;
  state.territories[belTerritory].army.manpower = 0;
  state.territories[nldTerritory].army.manpower = 0;
  const war: WarStateV2 = {
    id: 'war-experience',
    attackerId: bel,
    defenderId: nld,
    startedTick: 0,
    lastBattleTick: 19,
    warScore: 0,
    battles,
    attackerLosses: battles > 0 ? 0.01 : 0,
    defenderLosses: battles > 0 ? 0.01 : 0,
    lastPeaceOfferTick: -1_000_000,
    attackerOperations: [],
    defenderOperations: [],
  };
  state.wars = [war];
  processWarsV2(state, WORLD_CONTENT_V2);
  return state;
}

describe('empire-wide Combat Experience', () => {
  it('starts every country at zero and country selection grants no underdog bonus', () => {
    const engine = new WorldEngineV2(8_010);
    expect(engine.chooseCountry('lux').accepted).toBe(true);
    engine.stopClock();
    expect(engine.combatExperience('lux')).toEqual({
      experience: 0,
      score: 0,
      attackMultiplier: 1,
      defenseMultiplier: 1,
      casualtyMultiplier: 1,
    });
    expect(Object.values(engine.state.players).every((nation) => nation.combatExperience === 0)).toBe(true);
    expect(Object.values(engine.state.territories).every((territory) => (
      !('veteranManpower' in territory.army) && !('veteranExperience' in territory.army)
    ))).toBe(true);
  });

  it('uses bounded square-root modifiers with diminishing returns', () => {
    const state = createWorldStateV2(8_011);
    state.players[bel].combatExperience = 1;
    const one = selectCombatExperienceV2(state, bel);
    state.players[bel].combatExperience = 4;
    const four = selectCombatExperienceV2(state, bel);
    state.players[bel].combatExperience = 400;
    const capped = selectCombatExperienceV2(state, bel);
    state.players[bel].combatExperience = 40_000;
    const farBeyondCap = selectCombatExperienceV2(state, bel);

    expect(one.score).toBe(1);
    expect(four.score).toBe(2);
    expect(four.attackMultiplier - 1).toBeCloseTo(2 * (one.attackMultiplier - 1), 9);
    expect(capped.attackMultiplier).toBe(1.20);
    expect(capped.defenseMultiplier).toBe(1.20);
    expect(capped.casualtyMultiplier).toBe(0.85);
    expect(farBeyondCap).toMatchObject({
      attackMultiplier: 1.20,
      defenseMultiplier: 1.20,
      casualtyMultiplier: 0.85,
    });
  });

  it('improves quality and casualty resistance without inventing manpower', () => {
    const state = createWorldStateV2(8_012);
    const army = state.territories[belTerritory].army;
    const manpowerBefore = army.manpower;
    const attackBefore = selectEffectiveAttackV2(state, WORLD_CONTENT_V2, bel, army);
    const defenseBefore = selectEffectiveDefenseV2(state, WORLD_CONTENT_V2, bel, army);
    state.players[bel].combatExperience = 25;

    expect(selectArmyCombatManpowerV2(state, bel, army)).toBe(manpowerBefore);
    expect(selectEffectiveAttackV2(state, WORLD_CONTENT_V2, bel, army) / attackBefore).toBeCloseTo(1.05, 7);
    expect(selectEffectiveDefenseV2(state, WORLD_CONTENT_V2, bel, army) / defenseBefore).toBeCloseTo(1.05, 7);
    expect(selectCombatExperienceV2(state, bel).casualtyMultiplier).toBeCloseTo(0.9625, 8);
  });

  it('awards both belligerents once only when a concluded war contained combat', () => {
    const peaceful = concludedWar(0);
    expect(peaceful.players[bel].combatExperience).toBe(0);
    expect(peaceful.players[nld].combatExperience).toBe(0);

    const fought = concludedWar(1);
    const belgianAward = fought.players[bel].combatExperience;
    const dutchAward = fought.players[nld].combatExperience;
    expect(belgianAward).toBeGreaterThan(0);
    expect(dutchAward).toBeGreaterThan(0);
    expect(fought.wars).toHaveLength(0);
    processWarsV2(fought, WORLD_CONTENT_V2);
    expect(fought.players[bel].combatExperience).toBe(belgianAward);
    expect(fought.players[nld].combatExperience).toBe(dutchAward);
  });

  it('round-trips the national value without restoring retired veteran fields', () => {
    const engine = new WorldEngineV2(8_013);
    engine.state.players[bel].combatExperience = 7.25;
    const resumed = WorldEngineV2.fromSave(engine.save());
    expect(resumed.combatExperience(bel)).toEqual(engine.combatExperience(bel));
    expect(resumed.state.players[bel].combatExperience).toBe(7.25);
    expect(resumed.state.territories[belTerritory].army).not.toHaveProperty('veteranManpower');
  });
});
