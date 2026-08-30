import { describe, expect, it } from 'vitest';
import { round } from './balance';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { createSaveV2, loadSaveV2 } from './persistence';
import { ARCTIC_PROJECTS_V2 } from './polarEndgame';
import { selectNorthPoleModifiersV2 } from './northPoleModifiers';
import { selectRecruitmentTrainingPipelineV2 } from './selectors';

function completeRecoveryStage(
  state: ReturnType<typeof createWorldStateV2>,
): void {
  const playerId = state.humanPlayerId;
  state.polarEndgame.arcticPrograms[playerId] = {
    playerId,
    activeProject: null,
    completedProjects: ARCTIC_PROJECTS_V2
      .slice(0, ARCTIC_PROJECTS_V2.findIndex((project) => project.id === 'cryogenic-logistics') + 1)
      .map((project) => project.id),
  };
}

describe('North Pole recovery throughput stages', () => {
  it('applies one exact +2% multiplier to the canonical shared training pipeline', () => {
    const baseline = createWorldStateV2(72_101, WORLD_CONTENT_V2);
    const upgraded = structuredClone(baseline);
    completeRecoveryStage(upgraded);

    const playerId = baseline.humanPlayerId;
    const before = selectRecruitmentTrainingPipelineV2(
      baseline, WORLD_CONTENT_V2, playerId,
    );
    const after = selectRecruitmentTrainingPipelineV2(
      upgraded, WORLD_CONTENT_V2, playerId,
    );

    expect(before).toBeGreaterThan(0);
    expect(selectNorthPoleModifiersV2(upgraded, playerId).recoveryMultiplier).toBe(1.02);
    // Both projections are independently rounded to whole soldiers after the
    // multiplier is applied to their unrounded common baseline. Their visible
    // ratio can therefore differ by one soldier for Greenland's tiny pipeline.
    expect(Math.abs(after - round(before * 1.02))).toBeLessThanOrEqual(0.000001);
    expect(after / before).toBeCloseTo(1.02, 1);
    expect(after / before).not.toBeCloseTo(1.02 ** 2, 2);
  });

  it('preserves the exact completed recovery throughput across a canonical save round-trip', () => {
    const state = createWorldStateV2(72_102, WORLD_CONTENT_V2);
    completeRecoveryStage(state);
    const playerId = state.humanPlayerId;
    const beforeSave = selectRecruitmentTrainingPipelineV2(
      state, WORLD_CONTENT_V2, playerId,
    );

    const loaded = loadSaveV2(createSaveV2(state, WORLD_CONTENT_V2), WORLD_CONTENT_V2);
    const afterLoad = selectRecruitmentTrainingPipelineV2(
      loaded, WORLD_CONTENT_V2, playerId,
    );

    expect(loaded.polarEndgame.arcticPrograms[playerId]?.completedProjects)
      .toEqual(ARCTIC_PROJECTS_V2
        .slice(0, ARCTIC_PROJECTS_V2.findIndex((project) => project.id === 'cryogenic-logistics') + 1)
        .map((project) => project.id));
    expect(afterLoad).toBe(beforeSave);
  });
});
