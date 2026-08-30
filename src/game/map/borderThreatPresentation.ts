import type { MapTerritoryState } from './bridge';

export type StrategicBorderKind =
  | 'neutral'
  | 'threatened'
  | 'acute'
  | 'rogue'
  | 'active-war';

export const STRATEGIC_BORDER_THREAT_RATIO = Object.freeze({
  threatened: 1.25,
  acute: 1.8,
});

export function mapOwnerPairKey(leftId: string, rightId: string): string {
  return leftId < rightId ? `${leftId}:${rightId}` : `${rightId}:${leftId}`;
}

/**
 * Classifies one real shared frontier. Only the viewer's own boundary can gain
 * a strength warning; remote countries never expose their local force ratio.
 * Rogue ownership keeps its machine-magenta grammar until an active war makes
 * the shared contact line unambiguously red.
 */
export function strategicBorderKind(
  territoryIds: readonly string[],
  territories: Readonly<Record<string, MapTerritoryState>>,
  viewerId: string,
  activeWarPairs: ReadonlySet<string>,
): StrategicBorderKind {
  const territoryStates = territoryIds
    .map((territoryId) => territories[territoryId])
    .filter((territory): territory is MapTerritoryState => Boolean(territory));
  const owners = [...new Set(territoryStates.map((territory) => territory.ownerId))];
  const activeHostile = owners.some((ownerId, index) => owners.slice(index + 1)
    .some((otherOwnerId) => activeWarPairs.has(mapOwnerPairKey(ownerId, otherOwnerId))));
  if (activeHostile) return 'active-war';
  if (owners.includes('rai')) return 'rogue';
  if (!viewerId || owners.length < 2 || !owners.includes(viewerId)) return 'neutral';

  const ownPower = territoryStates.reduce((strongest, territory) => (
    territory.ownerId === viewerId ? Math.max(strongest, territory.army.power) : strongest
  ), 0);
  const hostilePower = territoryStates.reduce((strongest, territory) => (
    territory.ownerId !== viewerId ? Math.max(strongest, territory.army.power) : strongest
  ), 0);
  if (hostilePower <= 0) return 'neutral';
  const ratio = hostilePower / Math.max(0.000001, ownPower);
  if (ratio >= STRATEGIC_BORDER_THREAT_RATIO.acute) return 'acute';
  if (ratio >= STRATEGIC_BORDER_THREAT_RATIO.threatened) return 'threatened';
  return 'neutral';
}

/** A bounded category-only key: weekly stat drift cannot trigger redraws. */
export function strategicBorderThreatSignature(
  edges: readonly { readonly territoryIds: readonly string[] }[],
  territories: Readonly<Record<string, MapTerritoryState>>,
  viewerId: string,
  activeWarPairs: ReadonlySet<string>,
): string {
  const warned: string[] = [];
  for (let index = 0; index < edges.length; index += 1) {
    const kind = strategicBorderKind(
      edges[index]!.territoryIds, territories, viewerId, activeWarPairs,
    );
    if (kind === 'threatened' || kind === 'acute') warned.push(`${index}:${kind}`);
  }
  return warned.join(',');
}
