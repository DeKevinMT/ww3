import { describe, expect, it } from 'vitest';
import { PEACE_FATIGUE_RECOVERY_PER_WEEK, clamp, round } from './balance';
import { createWorldStateV2 } from './bootstrap';
import {
  WORLD_CONTENT_V2,
  type WorldContentV2,
} from './content';
import {
  createFinancePlansV2,
  processFinanceMilitaryV2,
} from './economy';
import { invalidateTerritoryIndexV2 } from './selectors';
import { traitNationContextV2, traitTerritoryFrontAccessV2 } from './traitContext';
import { countryTraitFactorV2 } from './traits';
import {
  nationIdV2,
  territoryIdV2,
  type FrontOperationV2,
  type PlayerId,
  type TerritoryId,
  type WarAccessV2,
  type WarStateV2,
  type WeeklyFinanceBreakdownV2,
  type WorldStateV2,
} from './types';

function subsetContent(...countryIds: readonly string[]): WorldContentV2 {
  const nationIds = countryIds.map(nationIdV2);
  const territoryIds = countryIds.map(territoryIdV2);
  const territorySet = new Set<TerritoryId>(territoryIds);
  const nations = Object.fromEntries(nationIds.map((id) => (
    [id, WORLD_CONTENT_V2.nations[id]]
  ))) as WorldContentV2['nations'];
  const territories = Object.fromEntries(territoryIds.map((id) => {
    const definition = WORLD_CONTENT_V2.territories[id]!;
    return [id, {
      ...definition,
      connections: definition.connections.filter((connection) => (
        territorySet.has(connection.targetId)
      )),
    }];
  })) as WorldContentV2['territories'];
  return { nationIds, territoryIds, nations, territories };
}

function operation(
  commanderId: PlayerId,
  sourceId: TerritoryId,
  targetId: TerritoryId,
  access: Exclude<WarAccessV2, 'none'>,
): FrontOperationV2 {
  return {
    commanderId,
    sourceId,
    targetId,
    doctrine: 'pressure',
    access,
    startedTick: 0,
    lastBattleTick: 0,
    holdUntilTick: 0,
    momentum: 0,
  };
}

function war(
  attackerId: PlayerId,
  defenderId: PlayerId,
  attackerOperations: FrontOperationV2[] = [],
  defenderOperations: FrontOperationV2[] = [],
): WarStateV2 {
  return {
    id: 'trait-recovery-war',
    attackerId,
    defenderId,
    startedTick: 0,
    lastBattleTick: 0,
    warScore: 0,
    battles: 0,
    attackerLosses: 0,
    defenderLosses: 0,
    lastPeaceOfferTick: -1,
    attackerOperations,
    defenderOperations,
  };
}

function expectedConditionAfterWeek(
  state: WorldStateV2,
  territoryId: TerritoryId,
  finance: WeeklyFinanceBreakdownV2,
  atWar: boolean,
  traitFactor: number,
): number {
  const territory = state.territories[territoryId]!;
  const reconstructionReadiness = territory.coreOwner !== territory.owner
    ? 0.18 + 0.82 * clamp(territory.integration, 0, 1)
    : 1;
  const conditionGain = 0.006 * finance.conditionFundingRatio * finance.aiEfficiency
    * (atWar ? 0.35 : 1) * reconstructionReadiness * traitFactor;
  return round(clamp(territory.condition + conditionGain, 0.15, 1));
}

describe('V2 country-trait recovery hooks', () => {
  it('applies Sudan condition recovery only while the current condition is below 80%', () => {
    const content = subsetContent('sdn', 'bel');
    const sudan = nationIdV2('sdn');
    const sudanTerritory = territoryIdV2('sdn');

    const damaged = createWorldStateV2(82_001, content);
    damaged.territories[sudanTerritory]!.condition = 0.799;
    const damagedPlans = createFinancePlansV2(damaged, content);
    const damagedFinance = damagedPlans.get(sudan)!;
    expect(damagedFinance.conditionFundingRatio).toBeGreaterThan(0);
    const damagedExpected = expectedConditionAfterWeek(
      damaged, sudanTerritory, damagedFinance, false, 1.30,
    );
    processFinanceMilitaryV2(damaged, content, damagedPlans);
    expect(damaged.territories[sudanTerritory]!.condition).toBe(damagedExpected);

    const threshold = createWorldStateV2(82_002, content);
    threshold.territories[sudanTerritory]!.condition = 0.8;
    const thresholdPlans = createFinancePlansV2(threshold, content);
    const thresholdFinance = thresholdPlans.get(sudan)!;
    const thresholdExpected = expectedConditionAfterWeek(
      threshold, sudanTerritory, thresholdFinance, false, 1,
    );
    processFinanceMilitaryV2(threshold, content, thresholdPlans);
    expect(threshold.territories[sudanTerritory]!.condition).toBe(thresholdExpected);
  });

  it('gives New Zealand recovery only on its own live naval territory', () => {
    const content = subsetContent('nzl', 'png', 'aus');
    const newZealand = nationIdV2('nzl');
    const papuaNewGuinea = nationIdV2('png');
    const australia = nationIdV2('aus');
    const newZealandTerritory = territoryIdV2('nzl');
    const papuaNewGuineaTerritory = territoryIdV2('png');
    const australiaTerritory = territoryIdV2('aus');
    const state = createWorldStateV2(82_003, content);

    state.territories[papuaNewGuineaTerritory]!.owner = newZealand;
    state.territories[papuaNewGuineaTerritory]!.coreOwner = newZealand;
    state.territories[papuaNewGuineaTerritory]!.integration = 1;
    state.territories[newZealandTerritory]!.condition = 0.5;
    state.territories[papuaNewGuineaTerritory]!.condition = 0.5;
    invalidateTerritoryIndexV2(state);

    state.wars = [war(
      newZealand,
      australia,
      [
        operation(newZealand, newZealandTerritory, australiaTerritory, 'naval'),
        operation(newZealand, papuaNewGuineaTerritory, australiaTerritory, 'land'),
        // A stale front from the absorbed country must not activate its successor.
        operation(papuaNewGuinea, papuaNewGuineaTerritory, australiaTerritory, 'naval'),
      ],
      [
        // Nor may an opponent's naval operation targeting the territory leak in.
        operation(australia, australiaTerritory, papuaNewGuineaTerritory, 'naval'),
      ],
    )];

    expect(traitTerritoryFrontAccessV2(
      state, newZealand, newZealandTerritory,
    )).toBe('naval');
    expect(traitTerritoryFrontAccessV2(
      state, newZealand, papuaNewGuineaTerritory,
    )).toBe('land');

    const plans = createFinancePlansV2(state, content);
    const finance = plans.get(newZealand)!;
    const navalRecoveryFactor = countryTraitFactorV2(
      newZealand,
      'condition-recovery',
      { ...traitNationContextV2(state, newZealand), access: 'naval' },
    );
    const navalExpected = expectedConditionAfterWeek(
      state, newZealandTerritory, finance, true, navalRecoveryFactor,
    );
    const landExpected = expectedConditionAfterWeek(
      state, papuaNewGuineaTerritory, finance, true, 1,
    );
    processFinanceMilitaryV2(state, content, plans);

    expect(state.territories[newZealandTerritory]!.condition).toBe(navalExpected);
    expect(state.territories[papuaNewGuineaTerritory]!.condition).toBe(landExpected);
    expect(navalExpected).toBeGreaterThan(landExpected);
  });

  it('scales only the existing peacetime war-fatigue decrement', () => {
    const content = subsetContent('esp', 'bel');
    const spain = nationIdV2('esp');
    const belgium = nationIdV2('bel');
    const peaceful = createWorldStateV2(82_004, content);
    peaceful.players[spain]!.warFatigue = 10;
    peaceful.players[belgium]!.warFatigue = 10;
    const peacefulPlans = createFinancePlansV2(peaceful, content);
    processFinanceMilitaryV2(peaceful, content, peacefulPlans);

    expect(peaceful.players[spain]!.warFatigue).toBe(round(
      10 - PEACE_FATIGUE_RECOVERY_PER_WEEK * 1.08,
    ));
    expect(peaceful.players[belgium]!.warFatigue).toBe(round(
      10 - PEACE_FATIGUE_RECOVERY_PER_WEEK,
    ));

    const activeWar = createWorldStateV2(82_005, content);
    activeWar.players[spain]!.warFatigue = 10;
    activeWar.wars = [war(spain, belgium)];
    const activePlans = createFinancePlansV2(activeWar, content);
    processFinanceMilitaryV2(activeWar, content, activePlans);
    expect(activeWar.players[spain]!.warFatigue).toBe(10);
  });

  it('uses only the live owner trait before and after foreign-core fusion', () => {
    const content = subsetContent('sdn', 'bel');
    const sudan = nationIdV2('sdn');
    const belgium = nationIdV2('bel');
    const sudanTerritory = territoryIdV2('sdn');
    const belgiumTerritory = territoryIdV2('bel');

    const occupied = createWorldStateV2(82_006, content);
    occupied.territories[sudanTerritory]!.owner = belgium;
    occupied.territories[sudanTerritory]!.coreOwner = sudan;
    occupied.territories[sudanTerritory]!.integration = 0.5;
    occupied.territories[sudanTerritory]!.condition = 0.5;
    invalidateTerritoryIndexV2(occupied);
    const occupiedPlans = createFinancePlansV2(occupied, content);
    const occupiedFinance = occupiedPlans.get(belgium)!;
    const occupiedExpected = expectedConditionAfterWeek(
      occupied, sudanTerritory, occupiedFinance, false, 1,
    );
    processFinanceMilitaryV2(occupied, content, occupiedPlans);
    expect(occupied.territories[sudanTerritory]!.condition).toBe(occupiedExpected);

    const fused = createWorldStateV2(82_007, content);
    fused.territories[sudanTerritory]!.owner = belgium;
    fused.territories[sudanTerritory]!.coreOwner = belgium;
    fused.territories[sudanTerritory]!.integration = 1;
    fused.territories[sudanTerritory]!.condition = 0.5;
    invalidateTerritoryIndexV2(fused);
    const fusedPlans = createFinancePlansV2(fused, content);
    const fusedFinance = fusedPlans.get(belgium)!;
    const fusedExpected = expectedConditionAfterWeek(
      fused, sudanTerritory, fusedFinance, false, 1,
    );
    processFinanceMilitaryV2(fused, content, fusedPlans);
    expect(fused.territories[sudanTerritory]!.condition).toBe(fusedExpected);

    const sudaneseOwner = createWorldStateV2(82_008, content);
    sudaneseOwner.territories[belgiumTerritory]!.owner = sudan;
    sudaneseOwner.territories[belgiumTerritory]!.coreOwner = belgium;
    sudaneseOwner.territories[belgiumTerritory]!.integration = 0.5;
    sudaneseOwner.territories[belgiumTerritory]!.condition = 0.5;
    invalidateTerritoryIndexV2(sudaneseOwner);
    const sudanesePlans = createFinancePlansV2(sudaneseOwner, content);
    const sudaneseFinance = sudanesePlans.get(sudan)!;
    const sudaneseExpected = expectedConditionAfterWeek(
      sudaneseOwner, belgiumTerritory, sudaneseFinance, false, 1.30,
    );
    processFinanceMilitaryV2(sudaneseOwner, content, sudanesePlans);
    expect(sudaneseOwner.territories[belgiumTerritory]!.condition).toBe(sudaneseExpected);
  });
});
