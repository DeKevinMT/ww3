import { describe, expect, it } from 'vitest';
import {
  ATTACKER_CIVILIAN_LOSS_POPULATION_CAP,
  DEFENDER_CIVILIAN_LOSS_POPULATION_CAP,
  WAR_MOBILIZATION_TICKS,
} from './balance';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { invariantErrorsV2 } from './invariants';
import { canonicalStateHashV2, createSaveV2, loadSaveV2 } from './persistence';
import {
  selectNationalEconomyV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import {
  nationIdV2,
  territoryIdV2,
  type FrontOperationV2,
  type WarStateV2,
  type WorldStateV2,
} from './types';
import {
  civilianPopulationExposureV2,
  processWarsV2,
  resolveBattlePulseV2,
} from './war';

const belgium = nationIdV2('bel');
const netherlands = nationIdV2('nld');
const belgiumTerritory = territoryIdV2('bel');
const netherlandsTerritory = territoryIdV2('nld');

function battleFixture(seed: number, forceScale = 1): {
  state: WorldStateV2;
  war: WarStateV2;
  operation: FrontOperationV2;
} {
  const state = createWorldStateV2(seed);
  state.tick = WAR_MOBILIZATION_TICKS;
  state.wars = [];
  state.truces = [];
  state.territories[belgiumTerritory].condition = 1;
  state.territories[netherlandsTerritory].condition = 1;
  state.territories[belgiumTerritory].army = {
    ...state.territories[belgiumTerritory].army,
    manpower: 0.20 * forceScale,
    capacity: 0.20 * forceScale,
  };
  state.territories[netherlandsTerritory].army = {
    ...state.territories[netherlandsTerritory].army,
    manpower: 0.10 * forceScale,
    capacity: 0.10 * forceScale,
  };
  const operation: FrontOperationV2 = {
    commanderId: belgium,
    sourceId: belgiumTerritory,
    targetId: netherlandsTerritory,
    doctrine: 'pressure',
    access: 'land',
    startedTick: 0,
    lastBattleTick: 0,
    holdUntilTick: 12,
    momentum: 0,
  };
  const war: WarStateV2 = {
    id: 'war-civilian-collateral',
    attackerId: belgium,
    defenderId: netherlands,
    startedTick: 0,
    lastBattleTick: 0,
    warScore: 0,
    battles: 0,
    attackerLosses: 0,
    defenderLosses: 0,
    attackerCivilianLosses: 0,
    defenderCivilianLosses: 0,
    lastPeaceOfferTick: -1_000_000,
    attackerOperations: [operation],
    defenderOperations: [],
  };
  state.wars.push(war);
  return { state, war, operation };
}

describe('V2 battle collateral population damage', () => {
  it('applies local civilian losses once and exposes them to live economy and finance selectors', () => {
    const { state, war, operation } = battleFixture(7_701);
    const sourceBefore = state.territories[belgiumTerritory].population;
    const targetBefore = state.territories[netherlandsTerritory].population;
    const economyBefore = selectNationalEconomyV2(state, WORLD_CONTENT_V2, netherlands);
    const financeBefore = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, netherlands);

    const event = resolveBattlePulseV2(state, WORLD_CONTENT_V2, war, operation)!;
    const economyAfter = selectNationalEconomyV2(state, WORLD_CONTENT_V2, netherlands);
    const financeAfter = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, netherlands);

    expect(event.attackerPopulationLoss).toBeGreaterThan(0);
    expect(event.defenderPopulationLoss).toBeGreaterThan(0);
    expect(state.territories[belgiumTerritory].population)
      .toBeCloseTo(sourceBefore - event.attackerPopulationLoss, 6);
    expect(state.territories[netherlandsTerritory].population)
      .toBeCloseTo(targetBefore - event.defenderPopulationLoss, 6);
    expect(war.attackerCivilianLosses).toBe(event.attackerPopulationLoss);
    expect(war.defenderCivilianLosses).toBe(event.defenderPopulationLoss);
    expect(economyAfter.population).toBeLessThan(economyBefore.population);
    expect(financeAfter.foodDemand).toBeLessThan(financeBefore.foodDemand);
  });

  it('causes no civilian loss before an actual battle pulse', () => {
    const { state, war } = battleFixture(7_702);
    state.tick = WAR_MOBILIZATION_TICKS - 1;
    const sourceBefore = state.territories[belgiumTerritory].population;
    const targetBefore = state.territories[netherlandsTerritory].population;

    expect(processWarsV2(state, WORLD_CONTENT_V2)).toEqual([]);
    expect(state.territories[belgiumTerritory].population).toBe(sourceBefore);
    expect(state.territories[netherlandsTerritory].population).toBe(targetBefore);
    expect(war.attackerCivilianLosses).toBe(0);
    expect(war.defenderCivilianLosses).toBe(0);
  });

  it('is deterministic for the same seed and canonical battle state', () => {
    const left = battleFixture(7_703);
    const right = battleFixture(7_703);

    const leftEvent = resolveBattlePulseV2(
      left.state, WORLD_CONTENT_V2, left.war, left.operation,
    );
    const rightEvent = resolveBattlePulseV2(
      right.state, WORLD_CONTENT_V2, right.war, right.operation,
    );

    expect(leftEvent).toEqual(rightEvent);
    expect(left.state.territories[belgiumTerritory].population)
      .toBe(right.state.territories[belgiumTerritory].population);
    expect(left.state.territories[netherlandsTerritory].population)
      .toBe(right.state.territories[netherlandsTerritory].population);
    expect(left.war.attackerCivilianLosses).toBe(right.war.attackerCivilianLosses);
    expect(left.war.defenderCivilianLosses).toBe(right.war.defenderCivilianLosses);
  });

  it('accumulates losses against the formal war sides when initiative reverses', () => {
    const { state, war, operation } = battleFixture(7_703_1);
    const assault = resolveBattlePulseV2(state, WORLD_CONTENT_V2, war, operation)!;
    const counteroffensive: FrontOperationV2 = {
      ...operation,
      commanderId: netherlands,
      sourceId: netherlandsTerritory,
      targetId: belgiumTerritory,
      doctrine: 'counteroffensive',
    };
    state.tick += 2;
    const counter = resolveBattlePulseV2(
      state, WORLD_CONTENT_V2, war, counteroffensive,
    )!;

    expect(war.attackerCivilianLosses).toBeCloseTo(
      assault.attackerPopulationLoss + counter.defenderPopulationLoss, 6,
    );
    expect(war.defenderCivilianLosses).toBeCloseTo(
      assault.defenderPopulationLoss + counter.attackerPopulationLoss, 6,
    );
  });

  it('scales with combat intensity while respecting per-pulse population caps', () => {
    const small = battleFixture(7_704, 0.10);
    const large = battleFixture(7_704, 1);
    const smallEvent = resolveBattlePulseV2(
      small.state, WORLD_CONTENT_V2, small.war, small.operation,
    )!;
    const sourcePopulation = large.state.territories[belgiumTerritory].population;
    const targetPopulation = large.state.territories[netherlandsTerritory].population;
    const largeEvent = resolveBattlePulseV2(
      large.state, WORLD_CONTENT_V2, large.war, large.operation,
    )!;

    expect(largeEvent.attackerLosses + largeEvent.defenderLosses)
      .toBeGreaterThan(smallEvent.attackerLosses + smallEvent.defenderLosses);
    expect(largeEvent.defenderPopulationLoss).toBeGreaterThan(smallEvent.defenderPopulationLoss);
    expect(largeEvent.attackerPopulationLoss).toBeGreaterThan(smallEvent.attackerPopulationLoss);
    expect(largeEvent.defenderPopulationLoss).toBeLessThanOrEqual(
      targetPopulation * DEFENDER_CIVILIAN_LOSS_POPULATION_CAP
        * civilianPopulationExposureV2(targetPopulation) + 0.000001,
    );
    expect(largeEvent.attackerPopulationLoss).toBeLessThanOrEqual(
      sourcePopulation * ATTACKER_CIVILIAN_LOSS_POPULATION_CAP
        * civilianPopulationExposureV2(sourcePopulation) + 0.000001,
    );
  });

  it('never crosses the territory population floor or over-reports clamped losses', () => {
    const { state, war, operation } = battleFixture(7_705, 5);
    state.territories[belgiumTerritory].population = 0.010001;
    state.territories[netherlandsTerritory].population = 0.010001;
    const sourceBefore = state.territories[belgiumTerritory].population;
    const targetBefore = state.territories[netherlandsTerritory].population;

    const event = resolveBattlePulseV2(state, WORLD_CONTENT_V2, war, operation)!;

    expect(state.territories[belgiumTerritory].population).toBeGreaterThanOrEqual(0.01);
    expect(state.territories[netherlandsTerritory].population).toBeGreaterThanOrEqual(0.01);
    expect(event.attackerPopulationLoss).toBeCloseTo(
      sourceBefore - state.territories[belgiumTerritory].population, 6,
    );
    expect(event.defenderPopulationLoss).toBeCloseTo(
      targetBefore - state.territories[netherlandsTerritory].population, 6,
    );
    expect(war.attackerCivilianLosses).toBe(event.attackerPopulationLoss);
    expect(war.defenderCivilianLosses).toBe(event.defenderPopulationLoss);
  });

  it('normalizes authenticated same-schema saves that predate cumulative tracking', () => {
    const state = createWorldStateV2(7_706);
    state.wars = [{
      id: 'war-pre-cumulative-civilians',
      attackerId: belgium,
      defenderId: netherlands,
      startedTick: 0,
      lastBattleTick: 0,
      warScore: 0,
      battles: 0,
      attackerLosses: 0,
      defenderLosses: 0,
      lastPeaceOfferTick: -1_000_000,
      attackerOperations: [],
      defenderOperations: [],
    }];
    const oldSave = structuredClone(createSaveV2(state, WORLD_CONTENT_V2)) as Record<string, any>;
    delete oldSave.wars[0].attackerCivilianLosses;
    delete oldSave.wars[0].defenderCivilianLosses;
    oldSave.canonicalStateHash = canonicalStateHashV2(oldSave);

    const loaded = loadSaveV2(oldSave as never, WORLD_CONTENT_V2);

    expect(loaded.wars[0]!.attackerCivilianLosses).toBe(0);
    expect(loaded.wars[0]!.defenderCivilianLosses).toBe(0);
    expect(invariantErrorsV2(loaded, WORLD_CONTENT_V2)).toEqual([]);
    expect(createSaveV2(loaded, WORLD_CONTENT_V2).wars[0]).toMatchObject({
      attackerCivilianLosses: 0,
      defenderCivilianLosses: 0,
    });
  });
});
