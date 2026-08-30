/** The old night transition is retired; the remaining relevance veil is static and subtle. */
export const APEX_FOG_MESSAGE_HOLD_MS = 0;
export const APEX_FOG_FADE_DURATION_MS = 0;
export const APEX_FOG_REDUCED_MOTION_FADE_MS = 0;

/** Renderer-local compatibility state retained for both map implementations. */
export interface ApexFogTransitionState {
  observedBlackoutTick: number | null;
  startedAtMs: number;
  blend: number;
  fogEnabled: boolean;
  transitioning: boolean;
}

export function createApexFogTransitionState(): ApexFogTransitionState {
  return {
    observedBlackoutTick: null,
    startedAtMs: 0,
    blend: 0,
    fogEnabled: false,
    transitioning: false,
  };
}

/**
 * The renderer now switches only a very light relevance atlas. There is no
 * cloud/night animation, so acknowledgement can never obscure the globe or
 * keep a stale crossfade alive after a reconnect.
 */
export function sampleApexFogVisualBlend(
  state: ApexFogTransitionState,
  fogEnabled: boolean,
  blackoutTick: number | null | undefined,
  _simulationTick: number,
  nowMs: number,
  reducedMotion: boolean,
  animateActivation = false,
): number {
  const blend = fogEnabled ? 1 : 0;
  state.observedBlackoutTick = fogEnabled ? blackoutTick ?? null : null;
  state.startedAtMs = nowMs;
  state.blend = blend;
  state.fogEnabled = fogEnabled;
  state.transitioning = false;
  void reducedMotion;
  void animateActivation;
  return blend;
}
