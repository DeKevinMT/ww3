import type { WarOutcomeV2, WorldSpeedV2 } from '../sim/v2/types';

/** Queue every completed human war exactly once until its report is dismissed. */
export function enqueueWarOutcomeV2(
  queue: WarOutcomeV2[],
  outcome: WarOutcomeV2,
): boolean {
  if (queue.some((candidate) => candidate.warId === outcome.warId)) return false;
  queue.push(outcome);
  return true;
}

export function beginWarOutcomePauseV2(
  storedResumeSpeed: WorldSpeedV2 | undefined,
  currentSpeed: WorldSpeedV2,
  firstQueuedReport: boolean,
): { resumeSpeed: WorldSpeedV2 | undefined; shouldPause: boolean } {
  if (!firstQueuedReport || storedResumeSpeed !== undefined) {
    return { resumeSpeed: storedResumeSpeed, shouldPause: false };
  }
  return { resumeSpeed: currentSpeed, shouldPause: currentSpeed !== 0 };
}

export function finishWarOutcomePauseV2(
  remainingReports: number,
  storedResumeSpeed: WorldSpeedV2 | undefined,
  gameOver: boolean,
): { resumeSpeed: WorldSpeedV2 | undefined; restoreSpeed: WorldSpeedV2 | undefined } {
  if (remainingReports > 0) {
    return { resumeSpeed: storedResumeSpeed, restoreSpeed: undefined };
  }
  return {
    resumeSpeed: undefined,
    restoreSpeed: gameOver ? undefined : storedResumeSpeed,
  };
}
