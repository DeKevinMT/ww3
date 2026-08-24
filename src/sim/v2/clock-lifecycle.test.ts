import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorldEngineV2 } from './WorldEngineV2';
import { nationIdV2 } from './types';

describe('V2 clock lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps country selection pure and starts only under an explicit clock owner', () => {
    vi.useFakeTimers();
    const engine = new WorldEngineV2(73_001);

    expect(engine.chooseCountry(nationIdV2('grl'))).toEqual({ accepted: true });
    expect(engine.state.speed).toBe(1);
    expect(vi.getTimerCount()).toBe(0);

    engine.startClock();
    expect(vi.getTimerCount()).toBe(1);

    // Restarting replaces the existing interval instead of leaking a second one.
    engine.startClock();
    expect(vi.getTimerCount()).toBe(1);

    engine.stopClock();
    expect(vi.getTimerCount()).toBe(0);
  });
});
