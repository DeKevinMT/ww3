import { describe, expect, it } from 'vitest';
import {
  AI_DEFENSIVE_AID_COOLDOWN,
  AI_GLOBAL_WAR_COOLDOWN,
  AI_REGIONAL_ESCALATION_COOLDOWN,
  aiActiveWarCapV2,
} from './balance';
import {
  AI_EXPANSION_ROLLS_PER_DECISION,
  aiConcurrentWarLimitV2,
  aiTargetWarLimitV2,
} from './ai';

describe('quiet but active AI war pacing', () => {
  it('uses one ordinary expansion roll and a yearly global cadence', () => {
    expect(AI_EXPANSION_ROLLS_PER_DECISION).toBe(1);
    expect(AI_GLOBAL_WAR_COOLDOWN).toBe(52);
    expect(AI_REGIONAL_ESCALATION_COOLDOWN).toBe(52);
    expect(AI_DEFENSIVE_AID_COOLDOWN).toBe(26);
  });

  it('keeps ordinary countries on one front and mature great powers on at most two', () => {
    expect(aiConcurrentWarLimitV2(0.59, 1_000)).toBe(1);
    expect(aiConcurrentWarLimitV2(0.60, 259)).toBe(1);
    expect(aiConcurrentWarLimitV2(0.60, 260)).toBe(2);
    expect(aiConcurrentWarLimitV2(1, 10_000)).toBe(2);
  });

  it('reserves dogpiles for explicit intervention and keeps the world cap small', () => {
    expect(aiTargetWarLimitV2(false, false)).toBe(1);
    expect(aiTargetWarLimitV2(true, false)).toBe(2);
    expect(aiTargetWarLimitV2(true, true)).toBe(4);
    expect(aiActiveWarCapV2(235, 0)).toBe(4);
    expect(aiActiveWarCapV2(235, 520)).toBe(4);
    expect(aiActiveWarCapV2(70, 0)).toBe(2);
  });
});
