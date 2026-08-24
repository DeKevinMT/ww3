export interface MatchmakingQueueEntry {
  readonly clientId: string;
  readonly rulesVersion: string;
  readonly queuedAt: number;
}

/**
 * Deterministic FIFO seed grouping. Two compatible players open a lobby;
 * later compatible queue entries can join it until the host starts.
 */
export function formMatchmakingGroups<T extends MatchmakingQueueEntry>(
  entries: readonly T[],
): readonly (readonly T[])[] {
  const cohorts = new Map<string, T[]>();
  for (const entry of entries) {
    const key = entry.rulesVersion;
    const cohort = cohorts.get(key) ?? [];
    cohort.push(entry);
    cohorts.set(key, cohort);
  }
  const groups: T[][] = [];
  for (const cohort of cohorts.values()) {
    cohort.sort((left, right) => left.queuedAt - right.queuedAt || left.clientId.localeCompare(right.clientId));
    while (cohort.length >= 2) groups.push(cohort.splice(0, 2));
  }
  return groups.sort((left, right) => (
    (left[0]?.queuedAt ?? 0) - (right[0]?.queuedAt ?? 0)
      || (left[0]?.clientId ?? '').localeCompare(right[0]?.clientId ?? '')
  ));
}
