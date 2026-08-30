import type { MapPolarSectorId, WorldMapEngineContract } from './bridge';
import { ANTARCTICA_SECTOR_PRESENTATIONS } from './mapGeographyPresentation';

export interface RogueAntarcticFieldTerritoryPresentation {
  readonly territoryId: MapPolarSectorId;
  readonly intensity: number;
  readonly core: boolean;
}

export interface RogueAntarcticFieldPresentation {
  readonly active: boolean;
  readonly territories: readonly RogueAntarcticFieldTerritoryPresentation[];
  readonly coverageTerritoryIds: readonly MapPolarSectorId[];
  readonly geometrySignature: string;
}

const INACTIVE_ROGUE_ANTARCTIC_FIELD: RogueAntarcticFieldPresentation = Object.freeze({
  active: false,
  territories: Object.freeze([]),
  coverageTerritoryIds: Object.freeze([]),
  geometrySignature: 'rogue-antarctic-field:off',
});

/**
 * Renderer-only machine stronghold field. It can cover authored Antarctic
 * sectors and the core, never occupied countries elsewhere in the world.
 */
export function selectRogueAntarcticFieldPresentation(
  engine: WorldMapEngineContract,
): RogueAntarcticFieldPresentation {
  const polar = engine.state.polarEndgame;
  if (!polar || polar.phase === 'dormant' || polar.phase === 'arctic-research'
    || polar.phase === 'victory') return INACTIVE_ROGUE_ANTARCTIC_FIELD;

  const territories = ANTARCTICA_SECTOR_PRESENTATIONS.flatMap((definition) => {
    const sector = polar.sectors[definition.id];
    if (!sector || sector.status === 'secured' || sector.integrity <= 0) return [];
    return [{
      territoryId: definition.id,
      intensity: Math.max(0.18, Math.min(1, sector.integrity / 100)),
      core: definition.id === 'zero-point-core',
    }];
  });
  if (territories.length === 0) return INACTIVE_ROGUE_ANTARCTIC_FIELD;
  const coverageTerritoryIds = territories.map((territory) => territory.territoryId);
  return {
    active: true,
    territories,
    coverageTerritoryIds,
    geometrySignature: [
      'rogue-antarctic-field',
      ...territories.map((territory) => (
        `${territory.territoryId}:i${Math.round(territory.intensity * 10)}`
      )),
    ].join('|'),
  };
}
