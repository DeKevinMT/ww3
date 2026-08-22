export interface ScrollSessionTarget {
  readonly dataset: { readonly scrollSession?: string };
  scrollTop: number;
}

export type ScrollSessionSnapshot = ReadonlyMap<string, number>;

function validScrollTop(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Capture only the scrollable surfaces that exist in the current DOM. Keeping
 * this snapshot render-local makes a closed and later reopened panel a new
 * session, while a live rerender can restore the surface it just replaced.
 */
export function captureScrollSessions(
  targets: Iterable<ScrollSessionTarget>,
): Map<string, number> {
  const snapshot = new Map<string, number>();
  for (const target of targets) {
    const session = target.dataset.scrollSession;
    if (session) snapshot.set(session, validScrollTop(target.scrollTop));
  }
  return snapshot;
}

export function restoreScrollSessions(
  targets: Iterable<ScrollSessionTarget>,
  snapshot: ScrollSessionSnapshot,
): void {
  for (const target of targets) {
    const session = target.dataset.scrollSession;
    if (session) target.scrollTop = snapshot.get(session) ?? 0;
  }
}

/** Command-dock modes are subtabs of one drawer; ranking and territories are separate panels. */
export function drawerScrollSessionId(panelMode: string, territoryId?: string): string {
  if (territoryId) return `drawer:territory:${territoryId}`;
  return panelMode === 'ranking' ? 'drawer:ranking' : 'drawer:command';
}
