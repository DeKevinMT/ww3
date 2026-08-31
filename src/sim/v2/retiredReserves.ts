import { round } from './balance';
import type { WorldStateV2 } from './types';

/**
 * Trained reserves were retired as an active gameplay system. The persisted
 * number and the two research effect keys remain in the schema solely so old
 * authenticated saves and multiplayer snapshots keep their canonical shape.
 */
export const RETIRED_TRAINED_RESERVES_V2 = 0;

/**
 * Preserve investment from older saves exactly once: training research now
 * improves direct peacetime recruitment, while mobilisation research improves
 * the field-force ceiling. The compatibility keys and pool are then neutral.
 */
export function normalizeRetiredReserveCompatibilityV2(state: WorldStateV2): void {
  for (const nation of Object.values(state.players)) {
    const levels = nation.research.effectLevels;
    const legacyTraining = Number.isFinite(levels['reserve-training'])
      ? Math.max(0, levels['reserve-training']) : 0;
    const legacyMobilization = Number.isFinite(levels['reserve-mobilization'])
      ? Math.max(0, levels['reserve-mobilization']) : 0;
    if (legacyTraining > 0 || legacyMobilization > 0) {
      levels.training = round(Math.max(0, levels.training) + legacyTraining, 9);
      levels['force-capacity'] = round(
        Math.max(0, levels['force-capacity']) + legacyMobilization,
        9,
      );
      levels['reserve-training'] = 0;
      levels['reserve-mobilization'] = 0;
    }
    nation.trainedReserves = RETIRED_TRAINED_RESERVES_V2;
  }
}
