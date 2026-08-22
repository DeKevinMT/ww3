import { describe, expect, it } from 'vitest';
import type { WarOutcomeV2 } from '../sim/v2/types';
import {
  beginWarOutcomePauseV2,
  enqueueWarOutcomeV2,
  finishWarOutcomePauseV2,
} from './warOutcomeQueue';

const outcome = (warId: string) => ({ warId } as WarOutcomeV2);

describe('post-war report queue', () => {
  it('keeps each completed war once and preserves report order', () => {
    const queue: WarOutcomeV2[] = [];

    expect(enqueueWarOutcomeV2(queue, outcome('war-2'))).toBe(true);
    expect(enqueueWarOutcomeV2(queue, outcome('war-1'))).toBe(true);
    expect(enqueueWarOutcomeV2(queue, outcome('war-2'))).toBe(false);

    expect(queue.map((item) => item.warId)).toEqual(['war-2', 'war-1']);
  });

  it('pauses once for a report queue and restores the prior speed after the final report', () => {
    expect(beginWarOutcomePauseV2(undefined, 2, true)).toEqual({
      resumeSpeed: 2,
      shouldPause: true,
    });
    expect(beginWarOutcomePauseV2(2, 0, false)).toEqual({
      resumeSpeed: 2,
      shouldPause: false,
    });
    expect(finishWarOutcomePauseV2(1, 2, false)).toEqual({
      resumeSpeed: 2,
      restoreSpeed: undefined,
    });
    expect(finishWarOutcomePauseV2(0, 2, false)).toEqual({
      resumeSpeed: undefined,
      restoreSpeed: 2,
    });
  });

  it('does not resume a finished campaign or invent movement from a prior pause', () => {
    expect(beginWarOutcomePauseV2(undefined, 0, true)).toEqual({
      resumeSpeed: 0,
      shouldPause: false,
    });
    expect(finishWarOutcomePauseV2(0, 1, true)).toEqual({
      resumeSpeed: undefined,
      restoreSpeed: undefined,
    });
  });
});
