import { describe, expect, it } from 'vitest';
import {
  COUNTRY_TERRAIN_PROFILES,
  LANDLOCKED_COUNTRY_IDS,
} from '../../game/data/terrainProfiles';
import { validateMap } from '../../game/data/worldMap';
import { createWorldStateV2 } from './bootstrap';
import {
  ECONOMY_ANNUAL_GROWTH_MAX,
  ECONOMY_ANNUAL_GROWTH_MIN,
  TERRAIN_DEFENSE_MODIFIER,
  TERRAIN_ECONOMY_GROWTH_ADJUSTMENT,
  WAR_ACCESS_SUPPLY_MULTIPLIER,
  clamp,
} from './balance';
import {
  territoryTerrainDefenseMultiplierV2,
  territoryTerrainProfileV2,
  WORLD_CONTENT_V2,
} from './content';
import { processDevelopmentPhaseV2 } from './economy';
import { selectWeeklyFinanceBreakdownV2 } from './selectors';
import { traitTerritoryContextV2 } from './traitContext';
import { countryTraitFactorV2 } from './traits';
import { nationIdV2, territoryIdV2 } from './types';
import { supplyFactorV2 } from './war';

describe('multi-terrain runtime', () => {
  it('keeps map validation strict, including the landlocked coastal rule', () => {
    expect(validateMap()).toEqual([]);
    for (const countryId of LANDLOCKED_COUNTRY_IDS) {
      expect(COUNTRY_TERRAIN_PROFILES[countryId]
        ?.some((entry) => entry.terrain === 'coastal')).toBe(false);
    }
  });

  it('uses the complete normalized active profile for physical defender terrain', () => {
    const china = territoryIdV2('chn');
    const profile = territoryTerrainProfileV2(WORLD_CONTENT_V2, china);
    const expected = profile.reduce((sum, entry) => (
      sum + entry.share * TERRAIN_DEFENSE_MODIFIER[entry.terrain]
    ), 0);

    expect(profile.map((entry) => entry.terrain)).toEqual(['plains', 'mountain', 'coastal']);
    expect(profile).toHaveLength(3);
    expect(profile.reduce((sum, entry) => sum + entry.share, 0)).toBeCloseTo(1, 12);
    expect(territoryTerrainDefenseMultiplierV2(WORLD_CONTENT_V2, china))
      .toBeCloseTo(expected, 12);
  });

  it('keeps retired country terrain traits neutral on secondary terrain', () => {
    const state = createWorldStateV2(90_201);
    const chile = nationIdV2('chl');
    const territory = territoryIdV2('chl');
    const context = traitTerritoryContextV2(
      state,
      WORLD_CONTENT_V2,
      chile,
      territory,
    );

    expect(context.terrain).toBe('mountain');
    expect(context.terrains).toContain('coastal');
    expect(countryTraitFactorV2(chile, 'defense', context)).toBe(1);
  });

  it('keeps Kazakhstan landlocked and free of coastal terrain', () => {
    expect(territoryTerrainProfileV2(WORLD_CONTENT_V2, territoryIdV2('kaz'))).toEqual([
      { terrain: 'plains', share: 0.55 },
      { terrain: 'desert', share: 0.30 },
      { terrain: 'mountain', share: 0.15 },
    ]);
    expect(WORLD_CONTENT_V2.territories[territoryIdV2('kaz')]!.connections
      .some((connection) => connection.kind === 'sea')).toBe(false);
  });

  it('keeps the naval supply penalty visible after a strong route reaches its cap', () => {
    const state = createWorldStateV2(90_202);
    const belgium = nationIdV2('bel');
    const territory = territoryIdV2('bel');
    state.players[belgium]!.research.effectLevels.supply = 100;

    const landSupply = supplyFactorV2(
      state, WORLD_CONTENT_V2, belgium, territory, 'land',
    );
    const navalSupply = supplyFactorV2(
      state, WORLD_CONTENT_V2, belgium, territory, 'naval',
    );

    expect(landSupply).toBe(1);
    expect(navalSupply / landSupply).toBeCloseTo(
      WAR_ACCESS_SUPPLY_MULTIPLIER.naval / WAR_ACCESS_SUPPLY_MULTIPLIER.land,
      10,
    );
  });

  it('projects weighted terrain growth inside the national cap and applies it once', () => {
    const state = createWorldStateV2(90_203);
    const belgium = nationIdV2('bel');
    const territoryId = territoryIdV2('bel');
    const territory = state.territories[territoryId]!;
    const terrainAdjustment = territoryTerrainProfileV2(WORLD_CONTENT_V2, territoryId)
      .reduce((sum, entry) => (
        sum + entry.share * TERRAIN_ECONOMY_GROWTH_ADJUSTMENT[entry.terrain]
      ), 0);
    const finance = selectWeeklyFinanceBreakdownV2(
      state,
      WORLD_CONTENT_V2,
      belgium,
      undefined,
      { military: 30, research: 20, development: 50 },
    );
    const expectedAnnual = clamp(
      finance.economyBaseGrowthRate
        + finance.economyInvestmentGrowthRate
        + finance.economyResearchGrowthRate
        + finance.economyFoodGrowthRate
        + terrainAdjustment
        - finance.warEconomyGrowthDrag,
      ECONOMY_ANNUAL_GROWTH_MIN,
      ECONOMY_ANNUAL_GROWTH_MAX,
    );

    // The visible breakdown components and final rate are each rounded to six
    // decimals, so rebuilding the final from its displayed parts may differ by
    // one output unit.
    expect(Math.abs(finance.annualEconomyGrowthRate - expectedAnnual))
      .toBeLessThanOrEqual(0.0000011);
    expect(finance.annualEconomyGrowthRate).toBeGreaterThanOrEqual(ECONOMY_ANNUAL_GROWTH_MIN);
    expect(finance.annualEconomyGrowthRate).toBeLessThanOrEqual(ECONOMY_ANNUAL_GROWTH_MAX);

    const economyBefore = territory.economy;
    processDevelopmentPhaseV2(
      state,
      WORLD_CONTENT_V2,
      new Map([[belgium, finance]]),
    );
    const appliedAnnual = (state.territories[territoryId]!.economy / economyBefore) ** 52 - 1;
    expect(appliedAnnual).toBeCloseTo(finance.annualEconomyGrowthRate, 7);
  });
});
