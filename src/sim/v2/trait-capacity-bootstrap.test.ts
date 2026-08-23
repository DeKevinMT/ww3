import { describe, expect, it } from 'vitest';
import { clamp } from './balance';
import { createWorldStateV2 } from './bootstrap';
import {
  initialArmyCapacityRatioV2,
  initialTerritoryArmyCapacityV2,
  nationalArmyCapacityTargetV2,
  stateArmyCapacityTargetsV2,
  stateTerritoryArmyCapacityTargetV2,
  territoryArmyCapacityTargetV2,
} from './capacity';
import { WORLD_CONTENT_V2 } from './content';
import { calculateBlendedFiscalCapacityV2 } from './fiscal';
import { countryTraitFactorV2 } from './traits';
import { nationIdV2, territoryIdV2 } from './types';

describe('country trait opening economy and army capacity', () => {
  it('adds army-capacity room without granting free opening manpower', () => {
    const state = createWorldStateV2(91_001);
    const mexico = nationIdV2('mex');
    const mexicoTerritory = territoryIdV2('mex');
    const rawCapacity = initialTerritoryArmyCapacityV2(WORLD_CONTENT_V2, mexicoTerritory);
    const openingFill = initialArmyCapacityRatioV2(WORLD_CONTENT_V2, mexico);
    const army = state.territories[mexicoTerritory].army;

    expect(countryTraitFactorV2(mexico, 'army-capacity')).toBeCloseTo(1.06);
    expect(army.capacity).toBeCloseTo(rawCapacity * 1.06, 5);
    expect(army.manpower).toBeCloseTo(rawCapacity * openingFill, 5);
  });

  it('uses only the live empire leader trait after conquest or fusion', () => {
    const state = createWorldStateV2(91_002);
    const mexico = nationIdV2('mex');
    const venezuela = nationIdV2('ven');
    const capturedId = territoryIdV2('ven');
    const captured = state.territories[capturedId];
    captured.owner = mexico;
    captured.coreOwner = venezuela;
    captured.integration = 1;
    delete captured.integrationProgram;

    const rawCapacity = territoryArmyCapacityTargetV2(
      WORLD_CONTENT_V2,
      capturedId,
      mexico,
      captured.population,
      0,
      1,
    );
    expect(countryTraitFactorV2(venezuela, 'army-capacity')).toBeCloseTo(1.30);
    expect(stateTerritoryArmyCapacityTargetV2(
      state,
      WORLD_CONTENT_V2,
      capturedId,
      mexico,
    )).toBeCloseTo(rawCapacity * 1.06, 5);
  });

  it('keeps the national target equal to the sum of its trait-adjusted local targets', () => {
    const state = createWorldStateV2(91_003);
    const burundi = nationIdV2('bdi');
    const localTargets = stateArmyCapacityTargetsV2(state, WORLD_CONTENT_V2, burundi);
    const localSum = [...localTargets.values()].reduce((sum, value) => sum + value, 0);

    expect(countryTraitFactorV2(burundi, 'army-capacity')).toBeCloseTo(1.30);
    expect(nationalArmyCapacityTargetV2(state, WORLD_CONTENT_V2, burundi))
      .toBeCloseTo(localSum, 8);
  });

  it('applies starting-treasury once without storing a transferable trait', () => {
    const state = createWorldStateV2(91_004);
    const luxembourg = nationIdV2('lux');
    const definition = WORLD_CONTENT_V2.nations[luxembourg];
    const structuralPopulation = Math.max(0, definition.real.population);
    const fiscalCapacity = calculateBlendedFiscalCapacityV2(
      definition.real.gdp,
      structuralPopulation,
      structuralPopulation,
    );
    const gdpPerCapita = fiscalCapacity.wealthPerPerson * 1_000;
    const wealthTier = clamp(Math.log2(Math.max(10_000, gdpPerCapita) / 10_000), 0, 4);
    const largeEconomyDamping = 1 / Math.sqrt(Math.max(1, definition.real.gdp / 500));
    const startingCashWeeks = clamp(2 + 2.25 * wealthTier * largeEconomyDamping, 2, 9);
    const unmodifiedTreasury = Math.max(
      0.10,
      fiscalCapacity.weeklyTaxRevenue * startingCashWeeks,
    );

    expect(state.players[luxembourg].treasury).toBeCloseTo(unmodifiedTreasury * 1.75, 3);
    expect(state.players[luxembourg]).not.toHaveProperty('trait');
    expect(state.territories[territoryIdV2('lux')]).not.toHaveProperty('trait');
  });
});
