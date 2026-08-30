import {
  mapTerritoryIsIntegrating,
  type WorldMapEngineContract,
} from './bridge';

export interface GlobeSignalPurgeTerritoryPresentation {
  readonly territoryId: string;
  /** Canonical simulation progress. The renderer may only interpolate towards it. */
  readonly progress: number;
  readonly percent: number;
}

export interface GlobeSignalPurgePresentation {
  readonly active: boolean;
  readonly territories: readonly GlobeSignalPurgeTerritoryPresentation[];
  /** Stable while only weekly purge progress changes. */
  readonly topologySignature: string;
}

const INACTIVE_GLOBE_SIGNAL_PURGE_PRESENTATION: GlobeSignalPurgePresentation = Object.freeze({
  active: false,
  territories: Object.freeze([]),
  topologySignature: 'signal-purge:off',
});

/**
 * Projects only the local commander's active Signal Purges. Survival transit
 * corridors and already-purged territory deliberately never enter this view.
 * The topology key excludes progress so the WebGL graph survives weekly ticks.
 */
export function selectGlobeSignalPurgePresentation(
  engine: WorldMapEngineContract,
): GlobeSignalPurgePresentation {
  const viewerId = engine.state.humanPlayerId;
  const territories = Object.values(engine.state.territories)
    .filter((territory) => (
      territory.ownerId === viewerId
      && mapTerritoryIsIntegrating(territory)
    ))
    .map((territory) => {
      const progress = Math.max(0, Math.min(1, territory.integration));
      return {
        territoryId: territory.id,
        progress,
        percent: Math.round(progress * 100),
      };
    })
    .sort((left, right) => left.territoryId.localeCompare(right.territoryId));
  if (territories.length === 0) return INACTIVE_GLOBE_SIGNAL_PURGE_PRESENTATION;
  return {
    active: true,
    territories,
    topologySignature: `signal-purge:${territories.map((territory) => territory.territoryId).join(',')}`,
  };
}
