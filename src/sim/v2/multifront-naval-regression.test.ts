import { describe, expect, it } from 'vitest';
import {
  WAR_ACCESS_ASSAULT_MULTIPLIER,
  WAR_ACCESS_CASUALTY_MULTIPLIER,
  WAR_ACCESS_OPERATION_MULTIPLIER,
  WAR_ACCESS_SUPPLY_MULTIPLIER,
  WAR_MOBILIZATION_TICKS,
  warAccessOperationMultiplierV2,
  warAccessSupplyMultiplierV2,
} from './balance';
import { createWorldStateV2 } from './bootstrap';
import {
  territoryTerrainOperationCostMultiplierV2,
  territoryTerrainSupplyMultiplierV2,
  WORLD_CONTENT_V2,
} from './content';
import {
  invalidateTerritoryIndexV2,
  selectWarRouteDistanceKmV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import {
  composeTraitContextV2,
  traitNationContextV2,
  traitTerritoryContextV2,
} from './traitContext';
import { countryTraitFactorV2 } from './traits';
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
const gbrTerritory = territoryIdV2('gbr');

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

  it('puts naval risk mainly in cost while keeping the combat-supply penalty light', () => {
    expect(WAR_ACCESS_ASSAULT_MULTIPLIER.naval)
      .toBe(WAR_ACCESS_ASSAULT_MULTIPLIER.land);
    expect(WAR_ACCESS_CASUALTY_MULTIPLIER.naval)
      .toBe(WAR_ACCESS_CASUALTY_MULTIPLIER.land);
    expect(WAR_ACCESS_OPERATION_MULTIPLIER.naval
      / WAR_ACCESS_OPERATION_MULTIPLIER.land).toBeCloseTo(1.35, 10);
    expect(WAR_ACCESS_SUPPLY_MULTIPLIER.naval
      / WAR_ACCESS_SUPPLY_MULTIPLIER.land).toBeCloseTo(0.98, 10);
    expect(WAR_ACCESS_OPERATION_MULTIPLIER.naval - 1)
      .toBeGreaterThan((1 - WAR_ACCESS_SUPPLY_MULTIPLIER.naval) * 10);

    const supplyState = createWorldStateV2(8_220_002);
    supplyState.territories[belTerritory].condition = 1;
    supplyState.players[bel].research.effectLevels.supply = 0;
    const landSupply = supplyFactorV2(
      supplyState, WORLD_CONTENT_V2, bel, belTerritory, 'land',
    );
    const navalSupply = supplyFactorV2(
      supplyState, WORLD_CONTENT_V2, bel, belTerritory, 'naval',
    );
    expect(navalSupply / landSupply).toBeCloseTo(0.98, 10);

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
    const navalDistance = selectWarRouteDistanceKmV2(
      navalState, WORLD_CONTENT_V2, bel, gbr,
    );
    const expectedOperationRatio = (
      warAccessOperationMultiplierV2('naval', navalDistance)
        * territoryTerrainOperationCostMultiplierV2(WORLD_CONTENT_V2, gbrTerritory)
    ) / (
      warAccessOperationMultiplierV2('land')
        * territoryTerrainOperationCostMultiplierV2(WORLD_CONTENT_V2, nldTerritory)
    );
    // Finance values are rounded before exposure, so allow only that final
    // presentation precision while access and target terrain remain exact.
    expect(navalOperations / landOperations).toBeCloseTo(expectedOperationRatio, 5);
  });

  it('lets distant sea lanes reach much farther while scaling cost and supply with distance', () => {
    const farRoute = Object.values(WORLD_CONTENT_V2.territories)
      .flatMap((territory) => territory.connections
        .filter((connection) => connection.kind === 'sea')
        .map((connection) => ({
          sourceId: territory.id,
          targetId: connection.targetId,
          distanceKm: connection.distanceKm ?? 0,
        })))
      .sort((left, right) => right.distanceKm - left.distanceKm)[0];
    expect(farRoute).toBeDefined();
    expect(farRoute!.distanceKm).toBeGreaterThan(6_000);
    const distantOperationCost = warAccessOperationMultiplierV2('naval', farRoute!.distanceKm);
    const distantCombatSupply = warAccessSupplyMultiplierV2('naval', farRoute!.distanceKm);
    expect(distantOperationCost).toBeGreaterThan(WAR_ACCESS_OPERATION_MULTIPLIER.naval);
    expect(distantCombatSupply).toBeLessThan(WAR_ACCESS_SUPPLY_MULTIPLIER.naval);
    expect(distantCombatSupply).toBeGreaterThanOrEqual(0.90);
    expect(distantOperationCost - 1).toBeGreaterThan((1 - distantCombatSupply) * 5);

    const state = createWorldStateV2(8_220_004);
    const sourceOwner = state.territories[farRoute!.sourceId]!.owner;
    state.territories[farRoute!.sourceId]!.condition = 1;
    state.players[sourceOwner]!.research.effectLevels.supply = 0;
    expect(state.players[sourceOwner]!.capitalId).toBe(farRoute!.sourceId);
    const localSupply = supplyFactorV2(
      state, WORLD_CONTENT_V2, sourceOwner, farRoute!.sourceId, 'land',
    );
    const distantNavalSupply = supplyFactorV2(
      state,
      WORLD_CONTENT_V2,
      sourceOwner,
      farRoute!.sourceId,
      'naval',
      farRoute!.targetId,
    );

    const commonTraitContext = composeTraitContextV2(
      traitNationContextV2(state, sourceOwner),
      traitTerritoryContextV2(state, WORLD_CONTENT_V2, sourceOwner, farRoute!.sourceId),
    );
    const localTraitContext = composeTraitContextV2(commonTraitContext, { access: 'land' });
    const navalTraitContext = composeTraitContextV2(commonTraitContext, { access: 'naval' });
    const rawDistantNavalSupply = warAccessSupplyMultiplierV2(
      'naval', farRoute!.distanceKm,
    );
    const navalDistancePressureFactor = countryTraitFactorV2(
      sourceOwner, 'naval-distance-pressure', navalTraitContext,
    );
    const traitAwareNavalAccess = WAR_ACCESS_SUPPLY_MULTIPLIER.naval
      - (WAR_ACCESS_SUPPLY_MULTIPLIER.naval - rawDistantNavalSupply)
        * navalDistancePressureFactor;
    const boundSupply = (value: number): number => Math.max(0.25, Math.min(1, value));
    const localTerrainSupply = territoryTerrainSupplyMultiplierV2(
      WORLD_CONTENT_V2, farRoute!.sourceId,
    );
    const navalTerrainSupply = territoryTerrainSupplyMultiplierV2(
      WORLD_CONTENT_V2, farRoute!.targetId,
    );
    const expectedLocalSupply = boundSupply(
      boundSupply(countryTraitFactorV2(sourceOwner, 'front-supply', localTraitContext)
        * localTerrainSupply) * WAR_ACCESS_SUPPLY_MULTIPLIER.land,
    );
    const expectedDistantNavalSupply = boundSupply(
      boundSupply(countryTraitFactorV2(sourceOwner, 'front-supply', navalTraitContext)
        * navalTerrainSupply) * traitAwareNavalAccess,
    );
    // The distance curve remains canonical, while the live route owner's
    // access-scoped trait is intentionally layered onto its actual supply.
    expect(distantNavalSupply / localSupply)
      .toBeCloseTo(expectedDistantNavalSupply / expectedLocalSupply, 8);
  });
});
