import { describe, expect, it } from 'vitest';
import {
  APEX_FOG_FADE_DURATION_MS,
  APEX_FOG_MESSAGE_HOLD_MS,
  APEX_FOG_REDUCED_MOTION_FADE_MS,
  createApexFogTransitionState,
  sampleApexFogVisualBlend,
} from './apexFogTransition';
import worldMapSceneSource from './WorldMapScene.ts?raw';
import threeGlobeSceneSource from './three/ThreeGlobeScene.ts?raw';

describe('APEX light relevance veil activation', () => {
  it('retires every hold and fade duration', () => {
    expect(APEX_FOG_MESSAGE_HOLD_MS).toBe(0);
    expect(APEX_FOG_FADE_DURATION_MS).toBe(0);
    expect(APEX_FOG_REDUCED_MOTION_FADE_MS).toBe(0);
  });

  it('starts with no relevance veil and no transition', () => {
    expect(createApexFogTransitionState()).toEqual({
      observedBlackoutTick: null,
      startedAtMs: 0,
      blend: 0,
      fogEnabled: false,
      transitioning: false,
    });
  });

  it('keeps Campaign fully clear before the blackout acknowledgement', () => {
    const state = createApexFogTransitionState();
    expect(sampleApexFogVisualBlend(state, false, null, 20, 0, false)).toBe(0);
    expect(sampleApexFogVisualBlend(state, false, 20, 40, 60_000, false, true)).toBe(0);
    expect(state).toMatchObject({
      observedBlackoutTick: null,
      blend: 0,
      fogEnabled: false,
      transitioning: false,
    });
  });

  it('activates the light atlas immediately after acknowledgement without a night fade', () => {
    const state = createApexFogTransitionState();
    expect(sampleApexFogVisualBlend(state, true, 20, 21, 100, false, true)).toBe(1);
    expect(state).toMatchObject({
      observedBlackoutTick: 20,
      startedAtMs: 100,
      blend: 1,
      fogEnabled: true,
      transitioning: false,
    });
    expect(sampleApexFogVisualBlend(state, true, 20, 80, 100_000, false)).toBe(1);
    expect(state.transitioning).toBe(false);
  });

  it('uses the same immediate light state for reduced motion and reconnects', () => {
    const reduced = createApexFogTransitionState();
    const reconnected = createApexFogTransitionState();
    expect(sampleApexFogVisualBlend(reduced, true, 20, 21, 0, true, true)).toBe(1);
    expect(sampleApexFogVisualBlend(reconnected, true, 20, 400, 50_000, false)).toBe(1);
    expect(reduced.transitioning).toBe(false);
    expect(reconnected.transitioning).toBe(false);
  });

  it('enables Survival immediately and clears cleanly outside intel-limited modes', () => {
    const state = createApexFogTransitionState();
    expect(sampleApexFogVisualBlend(state, true, null, 1, 0, false)).toBe(1);
    expect(state).toMatchObject({ fogEnabled: true, blend: 1, transitioning: false });
    expect(sampleApexFogVisualBlend(state, false, null, 1, 1, false)).toBe(0);
    expect(state).toMatchObject({
      observedBlackoutTick: null,
      fogEnabled: false,
      blend: 0,
      transitioning: false,
    });
  });

  it('retains the pooled 2D/3D adapter contract without opening a crossfade', () => {
    expect(worldMapSceneSource).toContain('sampleApexFogVisualBlend(');
    expect(worldMapSceneSource).toContain('.setAlpha(this.intelligenceFogVisualBlend)');
    expect(threeGlobeSceneSource).toContain('sampleApexFogVisualBlend(');
    expect(threeGlobeSceneSource.match(/sharedApexFogClearCrossfade/g)).toHaveLength(1);
    expect(threeGlobeSceneSource).toContain('this.intelligenceFogTransition.transitioning');
    expect(worldMapSceneSource).toContain('communicationsBlackoutAnimateActivation');
    expect(threeGlobeSceneSource).toContain('communicationsBlackoutAnimateActivation');
  });
});
