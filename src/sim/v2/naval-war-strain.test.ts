import { describe, expect, it } from 'vitest';
import { NAVAL_BATTLE_FATIGUE_MULTIPLIER } from './balance';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { selectTotalManpowerV2 } from './selectors';
import {
  nationIdV2,
  territoryIdV2,
  type FrontOperationV2,
  type WarStateV2,
} from './types';
import { resolveBattlePulseV2 } from './war';
import { summarizeWarStrainV2 } from './warStrain';

describe('naval War Strain relief', () => {
  it('makes one fresh naval front clearly lighter while one land front remains 14', () => {
    const score = (navalFronts: number) => summarizeWarStrainV2({
      activeWars: 1,
      activeFronts: 1,
      navalFronts,
      warFatigue: 0,
      armyFillRatio: 1,
      reserveFillRatio: 1,
    }).score;

    expect(score(0)).toBe(14);
    expect(score(1)).toBe(10);
    expect(score(1)).toBeLessThan(score(0));
  });

  it('applies the exact 0.65 multiplier to fatigue earned by a naval battle pulse', () => {
    const belgium = nationIdV2('bel');
    const netherlands = nationIdV2('nld');
    const belgiumTerritory = territoryIdV2('bel');
    const netherlandsTerritory = territoryIdV2('nld');
    const state = createWorldStateV2(72_065);
    state.tick = 2;
    state.wars = [];
    state.players[belgium]!.warFatigue = 0;
    state.players[netherlands]!.warFatigue = 0;
    state.territories[belgiumTerritory]!.condition = 1;
    state.territories[netherlandsTerritory]!.condition = 1;
    state.territories[belgiumTerritory]!.army.manpower = 0.10;
    state.territories[belgiumTerritory]!.army.capacity = 0.10;
    state.territories[netherlandsTerritory]!.army.manpower = 0.10;
    state.territories[netherlandsTerritory]!.army.capacity = 0.10;
    const operation: FrontOperationV2 = {
      commanderId: belgium,
      sourceId: belgiumTerritory,
      targetId: netherlandsTerritory,
      doctrine: 'pressure',
      access: 'naval',
      startedTick: 0,
      lastBattleTick: 0,
      holdUntilTick: 12,
      momentum: 0,
    };
    const war: WarStateV2 = {
      id: 'naval-fatigue-calibration',
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
    state.wars.push(war);
    const manpowerBefore = state.territories[belgiumTerritory]!.army.manpower;

    const battle = resolveBattlePulseV2(state, WORLD_CONTENT_V2, war, operation)!;
    const exactLoss = manpowerBefore - state.territories[belgiumTerritory]!.army.manpower;
    const attackerCapacity = selectTotalManpowerV2(state, belgium).capacity;

    expect(battle.conquered).toBe(false);
    expect(NAVAL_BATTLE_FATIGUE_MULTIPLIER).toBe(0.65);
    expect(state.players[belgium]!.warFatigue).toBeCloseTo(
      (0.08 + 4 * exactLoss / attackerCapacity) * NAVAL_BATTLE_FATIGUE_MULTIPLIER,
      6,
    );
  });
});
