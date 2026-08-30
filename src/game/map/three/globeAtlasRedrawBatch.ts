/**
 * A Survival breakout can hand several countries to the Rogue empire in a
 * short burst. Each ownership change alters the bounds of its continuous flag
 * projection, so the safe renderer path is a complete political-atlas bake.
 * Waiting for a brief quiet window collapses that burst into one bake/upload;
 * borders, labels and readiness bars remain live because they are independent
 * scene layers.
 */
export const REALM_EXPANSION_ATLAS_SETTLE_MS = 1_500;
export const REALM_EXPANSION_ATLAS_MAX_LATENCY_MS = 6_000;

export class GlobeAtlasTrailingRedrawBatch {
  private settleTimer?: ReturnType<typeof globalThis.setTimeout>;
  private maximumLatencyTimer?: ReturnType<typeof globalThis.setTimeout>;
  private pendingRedraw?: () => void;

  constructor(
    private readonly settleMs = REALM_EXPANSION_ATLAS_SETTLE_MS,
    private readonly maximumLatencyMs = REALM_EXPANSION_ATLAS_MAX_LATENCY_MS,
  ) {}

  schedule(redraw: () => void): void {
    this.pendingRedraw = redraw;
    if (this.settleTimer !== undefined) globalThis.clearTimeout(this.settleTimer);
    this.settleTimer = globalThis.setTimeout(() => {
      this.flush();
    }, this.settleMs);
    // A never-ending conquest chain may keep resetting the quiet-window timer.
    // The fixed maximum latency guarantees the flag atlas still catches up.
    if (this.maximumLatencyTimer === undefined) {
      this.maximumLatencyTimer = globalThis.setTimeout(() => {
        this.flush();
      }, Math.max(this.settleMs, this.maximumLatencyMs));
    }
  }

  cancel(): void {
    if (this.settleTimer !== undefined) globalThis.clearTimeout(this.settleTimer);
    if (this.maximumLatencyTimer !== undefined) {
      globalThis.clearTimeout(this.maximumLatencyTimer);
    }
    this.settleTimer = undefined;
    this.maximumLatencyTimer = undefined;
    this.pendingRedraw = undefined;
  }

  get pending(): boolean {
    return this.pendingRedraw !== undefined;
  }

  private flush(): void {
    const redraw = this.pendingRedraw;
    this.cancel();
    redraw?.();
  }
}
