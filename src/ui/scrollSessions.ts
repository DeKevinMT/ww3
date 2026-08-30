export interface ScrollSessionTarget {
  readonly dataset: { readonly scrollSession?: string };
  scrollTop: number;
  readonly scrollHeight?: number;
  readonly clientHeight?: number;
}

export type ScrollSessionSnapshot = ReadonlyMap<string, number>;

export interface DisclosureSessionTarget {
  readonly dataset: { readonly disclosureSession?: string };
  open: boolean;
}

export type DisclosureSessionSnapshot = ReadonlyMap<string, boolean>;

function validScrollTop(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function scrollLimit(target: ScrollSessionTarget): number | undefined {
  if (!Number.isFinite(target.scrollHeight) || !Number.isFinite(target.clientHeight)) return undefined;
  return Math.max(0, target.scrollHeight! - target.clientHeight!);
}

const BOTTOM_ANCHOR_SCROLL_TOP = Number.MAX_SAFE_INTEGER;
const BOTTOM_ANCHOR_TOLERANCE_PX = 3;

/**
 * Merge the scrollable surfaces in the current DOM into the known sessions.
 * That keeps weekly rerenders stable and lets an isolated drawer or modal
 * resume after temporarily switching to another surface.
 */
export function captureScrollSessions(
  targets: Iterable<ScrollSessionTarget>,
  previous: ScrollSessionSnapshot = new Map(),
): Map<string, number> {
  const snapshot = new Map<string, number>(previous);
  for (const target of targets) {
    const session = target.dataset.scrollSession;
    if (!session) continue;
    const top = validScrollTop(target.scrollTop);
    const limit = scrollLimit(target);
    snapshot.set(
      session,
      limit !== undefined && limit > 0 && limit - top <= BOTTOM_ANCHOR_TOLERANCE_PX
        ? BOTTOM_ANCHOR_SCROLL_TOP
        : top,
    );
  }
  return snapshot;
}

export function restoreScrollSessions(
  targets: Iterable<ScrollSessionTarget>,
  snapshot: ScrollSessionSnapshot,
): void {
  for (const target of targets) {
    const session = target.dataset.scrollSession;
    if (!session || !snapshot.has(session)) continue;
    const saved = validScrollTop(snapshot.get(session)!);
    const limit = scrollLimit(target);
    target.scrollTop = limit === undefined ? saved : Math.min(saved, limit);
  }
}

/**
 * Keep every drawer in an isolated session. A new tab starts at its own top,
 * while switching back to an already visited tab can restore that tab's own
 * position instead of inheriting the offset from another surface.
 */
export function drawerScrollSessionId(panelMode: string, territoryId?: string): string {
  if (territoryId) return `drawer:territory:${territoryId}`;
  return `drawer:${panelMode}`;
}

/**
 * Preserve explicit disclosure choices independently from live simulation
 * renders. A weekly tick may update the values inside a drawer, but it must
 * never collapse a section the player is currently reading.
 */
export function captureDisclosureSessions(
  targets: Iterable<DisclosureSessionTarget>,
  previous: DisclosureSessionSnapshot = new Map(),
): Map<string, boolean> {
  const snapshot = new Map(previous);
  for (const target of targets) {
    const session = target.dataset.disclosureSession;
    if (session) snapshot.set(session, target.open);
  }
  return snapshot;
}

export function restoreDisclosureSessions(
  targets: Iterable<DisclosureSessionTarget>,
  snapshot: DisclosureSessionSnapshot,
): void {
  for (const target of targets) {
    const session = target.dataset.disclosureSession;
    if (session && snapshot.has(session)) target.open = snapshot.get(session)!;
  }
}
