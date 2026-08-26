import { describe, expect, it } from 'vitest';
import { EXTREME_CRISIS_DEMOBILIZATION_RATE } from './balance';
import { createWorldStateV2 } from './bootstrap';
import {
  CONQUERED_TERRITORY_EMPIRE_COMBAT_CAP_SHARE_V2,
  INTEGRATED_CORE_EMPIRE_COMBAT_CAP_SHARE_V2,
  INTEGRATED_FOREIGN_TERRITORY_EMPIRE_COMBAT_CAP_SHARE_V2,
  ORIGINAL_HOMELAND_EMPIRE_COMBAT_CAP_SHARE_V2,
  foreignTerritoryEmpireCombatCapShareV2,
  nationalArmyCapacityAtOneXOpeningV2,
  nationalArmyCapacityTargetV2,
  stateTerritoryArmyCapacityTargetV2,
  stateTerritoryArmySupportCeilingV2,
  synchronizeArmyCapacityV2,
} from './capacity';
import { WORLD_CONTENT_V2 } from './content';
import { territoryIntegrationAnnualCostV2 } from './integration';
import { assertInvariantsV2 } from './invariants';
import {
  projectFinanceManpowerPhaseV2,
  selectTerritoriesOfV2,
  selectTotalManpowerV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import { nationIdV2, territoryIdV2 } from './types';

const bel = nationIdV2('bel');
const lux = nationIdV2('lux');
const luxTerritory = territoryIdV2('lux');
const deuTerritory = territoryIdV2('deu');

describe('population and research army cap', () => {
  it('uses integrated live population and force-capacity research', () => {
    const state = createWorldStateV2(8_101);
    state.players[bel].research.effectLevels['force-capacity'] = 17;
    state.territories[luxTerritory].owner = bel;
    state.territories[luxTerritory].coreOwner = lux;
    state.territories[luxTerritory].integration = 0.10;
    state.territories[luxTerritory].integrationProgram = {
      fromOwnerId: lux,
      fromCoreOwnerId: lux,
      toOwnerId: bel,
      startedTick: state.tick,
      completesTick: state.tick + 52,
      annualCost: territoryIntegrationAnnualCostV2(state.territories[luxTerritory].economy),
    };
    state.players[bel].treasury = -1_000;
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const expected = selectTerritoriesOfV2(state, bel).reduce((sum, territory) => (
      sum + stateTerritoryArmyCapacityTargetV2(
        state, WORLD_CONTENT_V2, territory.id, bel,
      )
    ), 0);
    expect(selectTotalManpowerV2(state, bel).capacity).toBeCloseTo(expected, 5);
    expect(nationalArmyCapacityTargetV2(state, WORLD_CONTENT_V2, bel)).toBeCloseTo(expected, 5);
    assertInvariantsV2(state, WORLD_CONTENT_V2);
  });

  it('restores the cap automatically after stale or crisis-era values', () => {
    const state = createWorldStateV2(8_102);
    const territories = selectTerritoriesOfV2(state, bel);
    const expected = nationalArmyCapacityTargetV2(state, WORLD_CONTENT_V2, bel);
    for (const territory of territories) territory.army.capacity *= 0.05;
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    expect(selectTotalManpowerV2(state, bel).capacity).toBeCloseTo(expected, 6);

    for (const territory of territories) state.territories[territory.id].population *= 1.10;
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    expect(selectTotalManpowerV2(state, bel).capacity)
      .toBeCloseTo(nationalArmyCapacityTargetV2(state, WORLD_CONTENT_V2, bel), 8);

    state.players[bel].research.effectLevels['force-capacity'] = 10;
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    expect(selectTotalManpowerV2(state, bel).capacity)
      .toBeCloseTo(nationalArmyCapacityTargetV2(state, WORLD_CONTENT_V2, bel), 8);
    assertInvariantsV2(state, WORLD_CONTENT_V2);
  });

  it('does not demobilize for ordinary underfunding or clamp trained personnel to capacity', () => {
    const state = createWorldStateV2(8_103);
    const territory = selectTerritoriesOfV2(state, bel)[0]!;
    territory.army.manpower = territory.army.capacity;
    const trainedBefore = territory.army.manpower;
    state.territories[territory.id].population *= 0.10;
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    expect(territory.army.capacity).toBeLessThan(trainedBefore);
    expect(territory.army.manpower).toBe(trainedBefore);
    const finance = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, bel);
    const projection = projectFinanceManpowerPhaseV2(state, WORLD_CONTENT_V2, bel, {
      ...finance,
      mandatoryFundingRatio: 0,
      acceleratedDemobilization: 0,
    });
    expect(projection.deployedAfterDemobilization).toBe(projection.deployedBefore);
    expect(projection.territories.reduce((sum, army) => sum + army.capacity, 0))
      .toBeCloseTo(nationalArmyCapacityTargetV2(state, WORLD_CONTENT_V2, bel), 6);
  });

  it('caps an explicit extreme-crisis force reduction at 0.05% per week', () => {
    const state = createWorldStateV2(8_105);
    const territory = selectTerritoriesOfV2(state, bel)[0]!;
    territory.army.manpower = territory.army.capacity;
    const finance = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, bel);
    const projection = projectFinanceManpowerPhaseV2(state, WORLD_CONTENT_V2, bel, {
      ...finance,
      mandatoryFundingRatio: 0,
      acceleratedDemobilization: territory.army.manpower,
    });
    expect(projection.demobilized).toBeCloseTo(
      projection.deployedBefore * EXTREME_CRISIS_DEMOBILIZATION_RATE,
      6,
    );
  });

  it('never recruits new personnel above a territory combat deployment ceiling', () => {
    const state = createWorldStateV2(8_106);
    const supported = state.territories[territoryIdV2('bel')]!;
    const reserve = state.territories[deuTerritory]!;
    reserve.owner = bel;
    reserve.coreOwner = bel;
    reserve.integration = 1;
    delete reserve.integrationProgram;
    reserve.army.manpower = 0;
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    supported.army.manpower = stateTerritoryArmySupportCeilingV2(
      state, WORLD_CONTENT_V2, territoryIdV2('bel'), bel,
    );
    const supportedBefore = supported.army.manpower;
    const finance = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, bel);
    const projection = projectFinanceManpowerPhaseV2(state, WORLD_CONTENT_V2, bel, {
      ...finance,
      acceleratedDemobilization: 0,
      passiveRecruitment: 1_000_000,
      acceleratedRecruitment: 1_000_000,
    });
    const supportedAfter = projection.territories.find((army) => army.id === territoryIdV2('bel'))!;

    expect(projection.recruited).toBeGreaterThan(0);
    expect(supportedAfter.manpower).toBeCloseTo(supportedBefore, 6);
    for (const projected of projection.territories) {
      expect(projected.manpower).toBeLessThanOrEqual(
        stateTerritoryArmySupportCeilingV2(state, WORLD_CONTENT_V2, projected.id, bel) + 1e-9,
      );
    }
  });

  it('declines foreign empire support from 10 to 5 percent while homeland remains unchanged', () => {
    expect(CONQUERED_TERRITORY_EMPIRE_COMBAT_CAP_SHARE_V2).toBe(0.10);
    expect(INTEGRATED_CORE_EMPIRE_COMBAT_CAP_SHARE_V2).toBe(0.03);
    expect(INTEGRATED_FOREIGN_TERRITORY_EMPIRE_COMBAT_CAP_SHARE_V2).toBe(0.05);
    expect(ORIGINAL_HOMELAND_EMPIRE_COMBAT_CAP_SHARE_V2).toBe(0.03);
    expect(foreignTerritoryEmpireCombatCapShareV2(0.10)).toBe(0.10);
    expect(foreignTerritoryEmpireCombatCapShareV2(0.55)).toBe(0.075);
    expect(foreignTerritoryEmpireCombatCapShareV2(1)).toBe(0.05);
    expect(foreignTerritoryEmpireCombatCapShareV2(-1)).toBe(0.10);
    expect(foreignTerritoryEmpireCombatCapShareV2(2)).toBe(0.05);
    const state = createWorldStateV2(8_107);
    const capturedId = territoryIdV2('nld');
    const captured = state.territories[capturedId]!;
    captured.owner = bel;
    captured.integration = 0.10;
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);

    const nationalCap = nationalArmyCapacityTargetV2(state, WORLD_CONTENT_V2, bel);
    const nationalCapAtOneXOpening = nationalArmyCapacityAtOneXOpeningV2(
      state, WORLD_CONTENT_V2, bel,
    );
    const occupiedLocalCap = stateTerritoryArmyCapacityTargetV2(
      state, WORLD_CONTENT_V2, capturedId, bel,
    );
    const visibleArmyCap = selectTotalManpowerV2(state, bel).capacity;
    expect(stateTerritoryArmySupportCeilingV2(state, WORLD_CONTENT_V2, capturedId, bel))
      .toBeCloseTo(
        occupiedLocalCap
          + nationalCapAtOneXOpening * CONQUERED_TERRITORY_EMPIRE_COMBAT_CAP_SHARE_V2,
        8,
      );
    expect(selectTotalManpowerV2(state, bel).capacity).toBe(visibleArmyCap);

    captured.integration = 0.55;
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const midpointNationalCapAtOneXOpening = nationalArmyCapacityAtOneXOpeningV2(
      state, WORLD_CONTENT_V2, bel,
    );
    const midpointLocalCap = stateTerritoryArmyCapacityTargetV2(
      state, WORLD_CONTENT_V2, capturedId, bel,
    );
    expect(stateTerritoryArmySupportCeilingV2(state, WORLD_CONTENT_V2, capturedId, bel))
      .toBeCloseTo(midpointLocalCap + midpointNationalCapAtOneXOpening * 0.075, 8);

    captured.integration = 1;
    captured.coreOwner = bel;
    delete captured.integrationProgram;
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const integratedNationalCap = nationalArmyCapacityTargetV2(
      state, WORLD_CONTENT_V2, bel,
    );
    const integratedNationalCapAtOneXOpening = nationalArmyCapacityAtOneXOpeningV2(
      state, WORLD_CONTENT_V2, bel,
    );
    const integratedLocalCap = stateTerritoryArmyCapacityTargetV2(
      state, WORLD_CONTENT_V2, capturedId, bel,
    );
    expect(stateTerritoryArmySupportCeilingV2(state, WORLD_CONTENT_V2, capturedId, bel))
      .toBeCloseTo(
        integratedLocalCap
          + integratedNationalCapAtOneXOpening
            * INTEGRATED_FOREIGN_TERRITORY_EMPIRE_COMBAT_CAP_SHARE_V2,
        8,
      );
    const homeId = territoryIdV2('bel');
    expect(stateTerritoryArmySupportCeilingV2(state, WORLD_CONTENT_V2, homeId, bel))
      .toBeCloseTo(
        stateTerritoryArmyCapacityTargetV2(state, WORLD_CONTENT_V2, homeId, bel)
          + integratedNationalCap * ORIGINAL_HOMELAND_EMPIRE_COMBAT_CAP_SHARE_V2,
        8,
      );
    expect(selectTotalManpowerV2(state, bel).capacity).toBeCloseTo(integratedNationalCap, 8);
  });

  it('adds normal recruits with the original military quality of their territory', () => {
    const state = createWorldStateV2(8_104);
    const territory = selectTerritoriesOfV2(state, bel)[0]!;
    territory.army.manpower = territory.army.capacity * 0.50;
    territory.army.baseAttack = 10;
    territory.army.baseDefense = 9;
    const attackMassBefore = territory.army.manpower * territory.army.baseAttack;
    const defenseMassBefore = territory.army.manpower * territory.army.baseDefense;
    const finance = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, bel);
    const projection = projectFinanceManpowerPhaseV2(state, WORLD_CONTENT_V2, bel, {
      ...finance,
      mandatoryFundingRatio: 1,
      recruitment: 1_000_000,
    });
    const projected = projection.territories[0]!;
    const local = WORLD_CONTENT_V2.nations[bel];
    expect(projection.recruited).toBeGreaterThan(0);
    expect(projected.manpower * projected.baseAttack).toBeCloseTo(
      attackMassBefore + projection.recruited * local.militaryAttackRating, 4,
    );
    expect(projected.manpower * projected.baseDefense).toBeCloseTo(
      defenseMassBefore + projection.recruited * local.militaryDefenseRating, 4,
    );
  });
});
