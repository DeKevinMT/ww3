import { describe, expect, it } from 'vitest';
import { ARMY_CAPACITY_STRUCTURAL_POPULATION_SHARE } from './balance';
import { createWorldStateV2 } from './bootstrap';
import { nationalArmyCapacityTargetV2, synchronizeArmyCapacityV2 } from './capacity';
import { WORLD_CONTENT_V2 } from './content';
import { assertInvariantsV2 } from './invariants';
import {
  projectFinanceManpowerPhaseV2,
  selectTerritoriesOfV2,
  selectTotalManpowerV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import { nationIdV2 } from './types';

const bel = nationIdV2('bel');

describe('population and research army cap', () => {
  it('uses integrated live population and force-capacity research', () => {
    const state = createWorldStateV2(8_101);
    state.players[bel].research.effectLevels['force-capacity'] = 17;
    for (const territory of selectTerritoriesOfV2(state, bel)) {
      territory.condition = 0.15;
      territory.integration = 0.10;
    }
    state.players[bel].treasury = -1_000;
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const integratedPopulation = selectTerritoriesOfV2(state, bel)
      .reduce((sum, territory) => sum + territory.population * territory.integration, 0);
    const expected = integratedPopulation * ARMY_CAPACITY_STRUCTURAL_POPULATION_SHARE * 1.17;
    expect(selectTotalManpowerV2(state, bel).capacity).toBeCloseTo(expected, 6);
    expect(nationalArmyCapacityTargetV2(state, WORLD_CONTENT_V2, bel)).toBeCloseTo(expected, 6);
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

  it('underfunding can demobilize personnel but never destroys army cap', () => {
    const state = createWorldStateV2(8_103);
    const territory = selectTerritoriesOfV2(state, bel)[0]!;
    territory.army.manpower = territory.army.capacity;
    territory.army.veteranManpower = territory.army.manpower * 0.20;
    territory.army.veteranExperience = 4;
    const finance = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, bel);
    const projection = projectFinanceManpowerPhaseV2(state, WORLD_CONTENT_V2, bel, {
      ...finance,
      mandatoryFundingRatio: 0,
    });
    expect(projection.deployedAfterDemobilization).toBeLessThan(projection.deployedBefore);
    expect(projection.territories.reduce((sum, army) => sum + army.capacity, 0))
      .toBeCloseTo(nationalArmyCapacityTargetV2(state, WORLD_CONTENT_V2, bel), 6);
    expect(projection.territories[0]!.veteranManpower)
      .toBeLessThanOrEqual(projection.territories[0]!.manpower);
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
      attackMassBefore + projection.recruited * local.militaryAttackRating, 6,
    );
    expect(projected.manpower * projected.baseDefense).toBeCloseTo(
      defenseMassBefore + projection.recruited * local.militaryDefenseRating, 6,
    );
  });
});
