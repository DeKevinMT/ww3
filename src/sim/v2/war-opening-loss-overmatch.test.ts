import { describe, expect, it } from 'vitest';
import {
  ATTACKER_CONCENTRATION_EXPOSURE_MAX_BONUS,
  ATTACKER_CONCENTRATION_EXPOSURE_MAX_RATIO,
  ATTACKER_CONCENTRATION_EXPOSURE_START_RATIO,
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
  attackerConcentrationExposureMultiplierV2,
  declareWarV2,
  estimateLiveWarV2,
  projectCombatExchangeV2,
  resolveBattlePulseV2,
} from './war';
import { enterPostBlackoutCampaignForTestV2 } from './testSupport';

const belgium = nationIdV2('bel');
const netherlands = nationIdV2('nld');
const china = nationIdV2('chn');
const india = nationIdV2('ind');
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

function projectedExchange(
  attackerManpower: number,
  defenderManpower: number,
) {
  const state = createWorldStateV2(81_101);
  state.wars = [];
  state.territories[belgiumTerritory]!.army = {
    ...state.territories[belgiumTerritory]!.army,
    manpower: attackerManpower,
    capacity: attackerManpower,
  };
  state.territories[netherlandsTerritory]!.army = {
    ...state.territories[netherlandsTerritory]!.army,
    manpower: defenderManpower,
    capacity: Math.max(0.10, defenderManpower),
  };
  return projectCombatExchangeV2(
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
}

describe('V2 declaration loss and extreme-overmatch exposure', () => {
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

  it('activates only for true local-and-national overmatch and stays bounded', () => {
    expect(ATTACKER_CONCENTRATION_EXPOSURE_START_RATIO).toBe(3);
    expect(ATTACKER_CONCENTRATION_EXPOSURE_MAX_RATIO).toBe(8);
    expect(ATTACKER_CONCENTRATION_EXPOSURE_MAX_BONUS).toBe(5);
    expect(attackerConcentrationExposureMultiplierV2(1, 1, 1, 1)).toBe(1);
    expect(attackerConcentrationExposureMultiplierV2(3, 1, 3, 1)).toBe(1);
    expect(attackerConcentrationExposureMultiplierV2(8, 1, 8, 1)).toBe(6);
    expect(attackerConcentrationExposureMultiplierV2(80, 1, 80, 1)).toBe(6);
    expect(attackerConcentrationExposureMultiplierV2(8, 1, 8, 8)).toBe(1);
    expect(attackerConcentrationExposureMultiplierV2(8, 0, 8, 1)).toBe(1);
  });

  it('keeps the live China-India peer baseline outside the exposure rule', () => {
    const state = createWorldStateV2(81_102);
    const chinaStrength = selectTotalManpowerV2(state, china).deployed;
    const indiaStrength = selectTotalManpowerV2(state, india).deployed;
    expect(attackerConcentrationExposureMultiplierV2(
      chinaStrength,
      indiaStrength,
      chinaStrength,
      indiaStrength,
    )).toBe(1);
  });

  it('raises real counter-fire in giant-vs-small battles without changing ordinary exchanges', () => {
    const equal = projectedExchange(0.10, 0.10);
    const threshold = projectedExchange(0.30, 0.10);
    const extreme = projectedExchange(0.80, 0.10);
    const collapsed = projectedExchange(0.80, 0);

    expect(threshold.attackerLosses).toBeCloseTo(equal.attackerLosses, 9);
    expect(extreme.attackerLosses).toBeCloseTo(threshold.attackerLosses * 6, 9);
    expect(extreme.attackerLosses).toBeGreaterThan(threshold.attackerLosses * 5.5);
    expect(collapsed.attackerLosses).toBe(0);
  });
});
