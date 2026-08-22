/**
 * A queued surge may wait for cash or cooldown, but it must not remain pending
 * after its selected program becomes permanently unavailable.
 */
export function terminalResearchSurgeRequestReasonV2(reason?: string): string | undefined {
  if (!reason) return undefined;
  const normalized = reason.toLocaleLowerCase('en');
  return normalized.includes('cannot advance') || normalized.includes('program is unavailable')
    ? reason
    : undefined;
}
