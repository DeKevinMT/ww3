import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import {
  invalidateTerritoryIndexV2,
  selectFoodDemandV2,
  selectFoodLandCapacityV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import { traitNationContextV2 } from './traitContext';
import { countryTraitFactorV2 } from './traits';
import { nationIdV2, territoryIdV2 } from './types';

const expectedRanges: Readonly<Record<string, readonly [number, number]>> = {
  usa: [1.10, 1.20],
  chn: [0.75, 0.85],
  ind: [0.98, 1.06],
  deu: [0.82, 0.90],
  bel: [0.50, 0.58],
  nld: [0.42, 0.50],
  sgp: [0.05, 0.12],
  jpn: [0.35, 0.41],
  sau: [0.15, 0.23],
  ukr: [2.40, 2.75],
  can: [1.50, 2.00],
  bra: [1.20, 1.50],
  aus: [2.30, 2.75],
  egy: [0.64, 0.72],
  nga: [0.87, 0.95],
  cod: [0.90, 0.98],
  psx: [0.40, 0.48],
};

describe('V2 FAOSTAT food self-sufficiency calibration', () => {
  it('covers every playable nation and preserves recognisable real-world reference ranges', () => {
    for (const playerId of WORLD_CONTENT_V2.nationIds) {
      const ratio = WORLD_CONTENT_V2.nations[playerId]!.real.foodSelfSufficiencyRatio;
      expect(Number.isFinite(ratio), String(playerId)).toBe(true);
      expect(ratio, String(playerId)).toBeGreaterThanOrEqual(0.001);
      expect(ratio, String(playerId)).toBeLessThanOrEqual(3);
    }
    for (const [countryId, [minimum, maximum]] of Object.entries(expectedRanges)) {
      const ratio = WORLD_CONTENT_V2.nations[nationIdV2(countryId)]!
        .real.foodSelfSufficiencyRatio;
      expect(ratio, countryId).toBeGreaterThanOrEqual(minimum);
      expect(ratio, countryId).toBeLessThanOrEqual(maximum);
    }
  });

  it('uses the reference ratio as opening domestic capacity before country traits', () => {
    const state = createWorldStateV2(9_301);
    for (const countryId of ['usa', 'chn', 'ind', 'deu', 'bel', 'nld', 'sgp', 'jpn', 'ukr', 'can', 'bra', 'aus']) {
      const playerId = nationIdV2(countryId);
      const reference = WORLD_CONTENT_V2.nations[playerId]!.real.foodSelfSufficiencyRatio;
      const demand = selectFoodDemandV2(state, playerId);
      const capacity = selectFoodLandCapacityV2(state, WORLD_CONTENT_V2, playerId);
      // FAOSTAT remains the immutable calibration anchor; the active country's
      // own food-production trait is a visible multiplier on live capacity.
      const traitFactor = countryTraitFactorV2(
        playerId,
        'food-production',
        traitNationContextV2(state, playerId),
      );
      expect(capacity / demand, countryId).toBeCloseTo(reference * traitFactor, 5);
      expect(state.players[playerId]!.domesticFoodCapacity / demand, countryId)
        .toBeCloseTo(reference * traitFactor, 5);
    }
    expect(countryTraitFactorV2(nationIdV2('ind'), 'food-production')).toBe(1.03);
    expect(state.players[nationIdV2('sgp')]!.domesticFoodCapacity
      / selectFoodDemandV2(state, nationIdV2('sgp'))).toBeLessThan(0.12);
  });

  it('weights conquered food systems by their integrated population', () => {
    const state = createWorldStateV2(9_302);
    const belgium = nationIdV2('bel');
    const netherlandsTerritory = territoryIdV2('nld');
    state.territories[netherlandsTerritory]!.owner = belgium;
    state.territories[netherlandsTerritory]!.integration = 0.40;
    invalidateTerritoryIndexV2(state);

    const belgianTerritory = state.territories[territoryIdV2('bel')]!;
    const dutchTerritory = state.territories[netherlandsTerritory]!;
    const belgianPopulation = belgianTerritory.population * belgianTerritory.integration;
    const dutchPopulation = dutchTerritory.population * dutchTerritory.integration;
    const expected = (
      belgianPopulation * WORLD_CONTENT_V2.nations[belgium]!.real.foodSelfSufficiencyRatio
      + dutchPopulation * WORLD_CONTENT_V2.nations[nationIdV2('nld')]!
        .real.foodSelfSufficiencyRatio
    ) / (belgianPopulation + dutchPopulation);
    const actual = selectFoodLandCapacityV2(state, WORLD_CONTENT_V2, belgium)
      / selectFoodDemandV2(state, belgium);
    expect(actual).toBeCloseTo(expected, 5);
  });

  it('imports for Singapore and exports the full funded Australian surplus only at full storage', () => {
    const state = createWorldStateV2(9_303);
    const singapore = nationIdV2('sgp');
    const australia = nationIdV2('aus');
    const singaporeFinance = selectWeeklyFinanceBreakdownV2(
      state,
      WORLD_CONTENT_V2,
      singapore,
    );
    expect(singaporeFinance.foodDomesticProduced / singaporeFinance.foodDemand)
      .toBeLessThan(0.12);
    expect(singaporeFinance.foodImported).toBeGreaterThan(0);

    const preview = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, australia);
    state.players[australia]!.foodStock = preview.foodStorageCapacity;
    const exporting = selectWeeklyFinanceBreakdownV2(state, WORLD_CONTENT_V2, australia);
    expect(exporting.foodDomesticProduced / exporting.foodDemand).toBeGreaterThan(2);
    expect(exporting.foodImported).toBe(0);
    expect(exporting.foodExported).toBeCloseTo(
      exporting.foodDomesticProduced - exporting.foodDemand,
      5,
    );
    expect(exporting.foodExportIncome).toBeGreaterThan(0);
    expect(exporting.foodStockChange).toBeCloseTo(0, 6);
  });
});
