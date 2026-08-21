import { describe, expect, it } from 'vitest';
import {
  WAR_ACCESS_ASSAULT_MULTIPLIER,
  WAR_ACCESS_CASUALTY_MULTIPLIER,
  WAR_ACCESS_OPERATION_MULTIPLIER,
  WAR_ACCESS_SUPPLY_MULTIPLIER,
  WAR_MOBILIZATION_TICKS,
} from './balance';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import {
  invalidateTerritoryIndexV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import { nationIdV2, territoryIdV2 } from './types';
import { declareWarV2, processWarsV2, supplyFactorV2 } from './war';

const bel = nationIdV2('bel');
const deu = nationIdV2('deu');
const nld = nationIdV2('nld');
const gbr = nationIdV2('gbr');
const usa = nationIdV2('usa');
const belTerritory = territoryIdV2('bel');
const deuTerritory = territoryIdV2('deu');
const nldTerritory = territoryIdV2('nld');

describe('V2 multi-front and naval balance regressions', () => {
  it('opens and resolves every viable source-unique empire front in one combat round', () => {
    const state = createWorldStateV2(8_220_001);
    state.humanPlayerId = usa;
    state.wars = [];
    state.territories[deuTerritory].owner = bel;
    state.territories[deuTerritory].coreOwner = bel;
    state.territories[deuTerritory].integration = 1;
    delete state.territories[deuTerritory].integrationProgram;
    invalidateTerritoryIndexV2(state);

    for (const sourceId of [belTerritory, deuTerritory]) {
      state.territories[sourceId].condition = 1;
      state.territories[sourceId].army = {
        ...state.territories[sourceId].army,
        manpower: 1,
        capacity: 1,
        baseAttack: 1,
        baseDefense: 1,
      };
    }
    state.territories[nldTerritory].condition = 1;
    state.territories[nldTerritory].army = {
      ...state.territories[nldTerritory].army,
      manpower: 0.5,
      capacity: 0.5,
      baseAttack: 1,
      baseDefense: 1,
    };

    expect(declareWarV2(state, WORLD_CONTENT_V2, bel, nld).accepted).toBe(true);
    const activeWar = state.wars.find((war) => (
      war.attackerId === bel && war.defenderId === nld
    ))!;
    expect(activeWar.attackerOperations).toEqual([]);

    state.tick = activeWar.startedTick + WAR_MOBILIZATION_TICKS;
    const battles = processWarsV2(state, WORLD_CONTENT_V2)
      .filter((battle) => battle.warId === activeWar.id);
    const operationSources = activeWar.attackerOperations.map((operation) => operation.sourceId);
    const battleSources = battles.map((battle) => battle.sourceId);

    expect(operationSources).toHaveLength(2);
    expect(new Set(operationSources)).toEqual(new Set([belTerritory, deuTerritory]));
    expect(battles).toHaveLength(2);
    expect(new Set(battleSources)).toEqual(new Set([belTerritory, deuTerritory]));
    expect(new Set(battleSources).size).toBe(battles.length);
    expect(battles.every((battle) => battle.tick === state.tick)).toBe(true);
  });

  it('keeps naval lethality equal to land while applying only cost and supply friction', () => {
    expect(WAR_ACCESS_ASSAULT_MULTIPLIER.naval)
      .toBe(WAR_ACCESS_ASSAULT_MULTIPLIER.land);
    expect(WAR_ACCESS_CASUALTY_MULTIPLIER.naval)
      .toBe(WAR_ACCESS_CASUALTY_MULTIPLIER.land);
    expect(WAR_ACCESS_OPERATION_MULTIPLIER.naval
      / WAR_ACCESS_OPERATION_MULTIPLIER.land).toBeCloseTo(1.35, 10);
    expect(WAR_ACCESS_SUPPLY_MULTIPLIER.naval
      / WAR_ACCESS_SUPPLY_MULTIPLIER.land).toBeCloseTo(0.92, 10);

    const supplyState = createWorldStateV2(8_220_002);
    supplyState.territories[belTerritory].condition = 1;
    supplyState.players[bel].research.effectLevels.supply = 0;
    const landSupply = supplyFactorV2(
      supplyState, WORLD_CONTENT_V2, bel, belTerritory, 'land',
    );
    const navalSupply = supplyFactorV2(
      supplyState, WORLD_CONTENT_V2, bel, belTerritory, 'naval',
    );
    expect(navalSupply / landSupply).toBeCloseTo(0.92, 10);

    const landState = createWorldStateV2(8_220_003);
    const navalState = createWorldStateV2(8_220_003);
    landState.wars = [];
    navalState.wars = [];
    expect(declareWarV2(landState, WORLD_CONTENT_V2, bel, nld).accepted).toBe(true);
    expect(declareWarV2(navalState, WORLD_CONTENT_V2, bel, gbr).accepted).toBe(true);
    const landOperations = selectWeeklyFinanceBreakdownV2(
      landState, WORLD_CONTENT_V2, bel,
    ).warOperations;
    const navalOperations = selectWeeklyFinanceBreakdownV2(
      navalState, WORLD_CONTENT_V2, bel,
    ).warOperations;
    // Finance values are rounded before exposure, so allow only that final
    // presentation precision while the canonical multiplier above stays exact.
    expect(navalOperations / landOperations).toBeCloseTo(1.35, 5);
  });
});
