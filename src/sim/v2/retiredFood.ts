import { round } from './balance';
import type { WorldStateV2 } from './types';

/**
 * Food was retired as a gameplay system in V2.76. These three nation fields
 * remain only so authenticated older saves keep their canonical shape. They
 * are normalized at every world boundary and must never affect simulation or
 * presentation code.
 */
export const RETIRED_FOOD_COMPATIBILITY_V2 = Object.freeze({
  stock: 0,
  domesticCapacity: 0,
  security: 1,
});

/**
 * Converts paid legacy Food Systems research into useful military sustainment
 * exactly once, then neutralizes every retained compatibility sentinel.
 */
export function normalizeRetiredFoodCompatibilityV2(state: WorldStateV2): void {
  for (const nation of Object.values(state.players)) {
    const levels = nation.research.effectLevels;
    const legacyProduction = Number.isFinite(levels['food-production'])
      ? Math.max(0, levels['food-production']) : 0;
    const legacyStorage = Number.isFinite(levels['food-storage'])
      ? Math.max(0, levels['food-storage']) : 0;
    if (legacyProduction > 0 || legacyStorage > 0) {
      levels.supply = round(Math.max(0, levels.supply) + legacyProduction, 9);
      levels.recovery = round(Math.max(0, levels.recovery) + legacyStorage, 9);
      levels['food-production'] = 0;
      levels['food-storage'] = 0;
    }
    nation.foodStock = RETIRED_FOOD_COMPATIBILITY_V2.stock;
    nation.domesticFoodCapacity = RETIRED_FOOD_COMPATIBILITY_V2.domesticCapacity;
    nation.foodSecurity = RETIRED_FOOD_COMPATIBILITY_V2.security;
  }

  for (const force of Object.values(state.commanderForces ?? {})) {
    if (!force?.empireSupport) continue;
    force.empireSupport.annualFoodOutput = 0;
    force.empireSupport.foodProductionMultiplier = 1;
    force.empireSupport.foodStorageMultiplier = 1;
    force.empireSupport.foodImportCostMultiplier = 1;
  }
}
