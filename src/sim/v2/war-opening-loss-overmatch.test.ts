import { describe, expect, it } from 'vitest';
import {
  WAR_DECLARATION_ATTACKER_LOSS_SHARE,
  round,
} from './balance';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import {
  invalidateTerritoryIndexV2,
  selectTotalManpowerV2,
} from './selectors';
import {
  nationIdV2,
  territoryIdV2,
  type FrontOperationV2,
} from './types';
import {
  declareWarV2,
  estimateLiveWarV2,
  projectCombatExchangeV2,
  resolveBattlePulseV2,
} from './war';
import { enterPostBlackoutCampaignForTestV2 } from './testSupport';

const belgium = nationIdV2('bel');
const netherlands = nationIdV2('nld');
const belgiumTerritory = territoryIdV2('bel');
const netherlandsTerritory = territoryIdV2('nld');
const luxembourgTerritory = territoryIdV2('lux');

function declarationFixture() {
  const state = createWorldStateV2(81_001);
  state.wars = [];
  state.truces = [];
  state.offers = [];
  enterPostBlackoutCampaignForTestV2(state);
  state.players[belgium]!.treasury = 1_000_000;
  state.territories[luxembourgTerritory]!.owner = belgium;
  state.territories[luxembourgTerritory]!.coreOwner = belgium;
  state.territories[luxembourgTerritory]!.integration = 1;
  delete state.territories[luxembourgTerritory]!.integrationProgram;
  invalidateTerritoryIndexV2(state);
  state.territories[belgiumTerritory]!.army = {
    ...state.territories[belgiumTerritory]!.army,
    manpower: 0.20,
    capacity: 0.31,
  };
  state.territories[luxembourgTerritory]!.army = {
    ...state.territories[luxembourgTerritory]!.army,
    manpower: 0.10,
    capacity: 0.22,
  };
  return state;
}

describe('V2 declaration loss and frontline-only combat', () => {
  it('charges exactly one percent across deployed attacker armies and records it immediately', () => {
    const state = declarationFixture();
    const belgiumCapacityBefore = state.territories[belgiumTerritory]!.army.capacity;
    const luxembourgCapacityBefore = state.territories[luxembourgTerritory]!.army.capacity;
    const defenderBefore = selectTotalManpowerV2(state, netherlands).deployed;
    const deployedBefore = selectTotalManpowerV2(state, belgium).deployed;

    expect(declareWarV2(state, WORLD_CONTENT_V2, belgium, netherlands).accepted).toBe(true);

    const war = state.wars.find((candidate) => (
      candidate.attackerId === belgium && candidate.defenderId === netherlands
    ))!;
    const expectedLoss = round(deployedBefore * WAR_DECLARATION_ATTACKER_LOSS_SHARE, 9);
    expect(expectedLoss).toBe(0.003);
    expect(selectTotalManpowerV2(state, belgium).deployed)
      .toBeCloseTo(deployedBefore - expectedLoss, 9);
    expect(state.territories[belgiumTerritory]!.army.manpower).toBeCloseTo(0.198, 9);
    expect(state.territories[luxembourgTerritory]!.army.manpower).toBeCloseTo(0.099, 9);
    expect(state.territories[belgiumTerritory]!.army.capacity).toBe(belgiumCapacityBefore);
    expect(state.territories[luxembourgTerritory]!.army.capacity).toBe(luxembourgCapacityBefore);
    expect(selectTotalManpowerV2(state, netherlands).deployed).toBe(defenderBefore);
    expect(war.attackerLosses).toBe(expectedLoss);
    expect(war.defenderLosses).toBe(0);
    expect(war.battles).toBe(0);
    expect(estimateLiveWarV2(state, WORLD_CONTENT_V2, war.id, belgium)!.totalOwnLosses)
      .toBe(expectedLoss);

    const afterFirstDeclaration = selectTotalManpowerV2(state, belgium).deployed;
    expect(declareWarV2(state, WORLD_CONTENT_V2, belgium, netherlands).accepted).toBe(false);
    expect(selectTotalManpowerV2(state, belgium).deployed).toBe(afterFirstDeclaration);
    expect(war.attackerLosses).toBe(expectedLoss);
  });

  it('does not charge any manpower when a declaration is rejected', () => {
    const state = declarationFixture();
    state.players[belgium]!.treasury = -0.001;
    const deployedBefore = selectTotalManpowerV2(state, belgium).deployed;

    expect(declareWarV2(state, WORLD_CONTENT_V2, belgium, netherlands).accepted).toBe(false);
    expect(selectTotalManpowerV2(state, belgium).deployed).toBe(deployedBefore);
    expect(state.wars).toHaveLength(0);
  });

  it('keeps the opening loss in the cumulative total when battle losses are added', () => {
    const state = declarationFixture();
    expect(declareWarV2(state, WORLD_CONTENT_V2, belgium, netherlands).accepted).toBe(true);
    const war = state.wars.find((candidate) => (
      candidate.attackerId === belgium && candidate.defenderId === netherlands
    ))!;
    const openingLoss = war.attackerLosses;
    const operation: FrontOperationV2 = {
      commanderId: belgium,
      sourceId: belgiumTerritory,
      targetId: netherlandsTerritory,
      doctrine: 'pressure',
      access: 'land',
      startedTick: state.tick,
      lastBattleTick: state.tick,
      holdUntilTick: state.tick + 12,
      momentum: 0,
    };
    war.attackerOperations = [operation];

    const battle = resolveBattlePulseV2(state, WORLD_CONTENT_V2, war, operation)!;

    expect(openingLoss).toBeGreaterThan(0);
    expect(war.attackerLosses).toBeCloseTo(openingLoss + battle.attackerLosses, 6);
    expect(war.attackerLosses).toBeGreaterThanOrEqual(openingLoss);
  });

  it('keeps remote armies out of the raw exchange while retaining their capacity ceiling', () => {
    const state = createWorldStateV2(81_101);
    state.wars = [];
    state.territories[belgiumTerritory]!.army = {
      ...state.territories[belgiumTerritory]!.army,
      manpower: 0.80,
      capacity: 0.80,
    };
    state.territories[netherlandsTerritory]!.army = {
      ...state.territories[netherlandsTerritory]!.army,
      manpower: 0.10,
      capacity: 0.10,
    };
    const remoteId = territoryIdV2('usa');
    state.territories[remoteId]!.owner = belgium;
    state.territories[remoteId]!.coreOwner = belgium;
    state.territories[remoteId]!.integration = 1;
    delete state.territories[remoteId]!.integrationProgram;
    state.territories[remoteId]!.army = {
      ...state.territories[remoteId]!.army,
      manpower: 0,
      capacity: 0,
      baseAttack: state.territories[belgiumTerritory]!.army.baseAttack,
      baseDefense: state.territories[belgiumTerritory]!.army.baseDefense,
    };
    invalidateTerritoryIndexV2(state);
    const project = (fixture: typeof state) => projectCombatExchangeV2(
      fixture,
      WORLD_CONTENT_V2,
      belgium,
      netherlands,
      belgiumTerritory,
      netherlandsTerritory,
      'land',
      1,
      1,
    )!;
    const localOnly = project(state);

    const withRearArmy = structuredClone(state);
    withRearArmy.territories[remoteId]!.army = {
      ...withRearArmy.territories[remoteId]!.army,
      manpower: 8,
      capacity: 8,
    };
    const reinforced = project(withRearArmy);

    expect(reinforced.rawAttackerLosses).toBeCloseTo(localOnly.rawAttackerLosses, 9);
    expect(reinforced.rawDefenderLosses).toBeCloseTo(localOnly.rawDefenderLosses, 9);
    expect(reinforced.attackPressure).toBeCloseTo(localOnly.attackPressure, 9);
    expect(reinforced.counterPressure).toBeCloseTo(localOnly.counterPressure, 9);
    expect(reinforced.attackerHitCap).toBeGreaterThan(localOnly.attackerHitCap);
  });
});
