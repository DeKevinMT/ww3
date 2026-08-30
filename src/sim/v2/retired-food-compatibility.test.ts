import { describe, expect, it } from 'vitest';
import {
  RETIRED_FOOD_COMPATIBILITY_V2,
  normalizeRetiredFoodCompatibilityV2,
} from './retiredFood';
import type { WorldStateV2 } from './types';

describe('retired Food compatibility', () => {
  it('remaps paid legacy research once and neutralizes every retained sentinel', () => {
    const state = {
      players: {
        bel: {
          research: {
            effectLevels: {
              supply: 4,
              recovery: 5,
              'food-production': 2.5,
              'food-storage': 3,
            },
          },
          foodStock: 99,
          domesticFoodCapacity: 88,
          foodSecurity: 0.2,
        },
      },
      commanderForces: {
        bel: {
          empireSupport: {
            recruitmentMultiplier: 1.22,
            reserveTrainingMultiplier: 1.31,
            annualFoodOutput: 0.9,
            foodProductionMultiplier: 1.4,
            foodStorageMultiplier: 1.5,
            foodImportCostMultiplier: 0.8,
          },
        },
      },
    } as unknown as WorldStateV2;

    normalizeRetiredFoodCompatibilityV2(state);

    expect(state.players.bel!.research.effectLevels).toMatchObject({
      supply: 6.5,
      recovery: 8,
      'food-production': 0,
      'food-storage': 0,
    });
    expect(state.players.bel).toMatchObject({
      foodStock: RETIRED_FOOD_COMPATIBILITY_V2.stock,
      domesticFoodCapacity: RETIRED_FOOD_COMPATIBILITY_V2.domesticCapacity,
      foodSecurity: RETIRED_FOOD_COMPATIBILITY_V2.security,
    });
    expect(state.commanderForces.bel!.empireSupport).toEqual({
      recruitmentMultiplier: 1.22,
      reserveTrainingMultiplier: 1.31,
      annualFoodOutput: 0,
      foodProductionMultiplier: 1,
      foodStorageMultiplier: 1,
      foodImportCostMultiplier: 1,
    });

    const once = structuredClone(state);
    normalizeRetiredFoodCompatibilityV2(state);
    expect(state).toEqual(once);
  });
});
