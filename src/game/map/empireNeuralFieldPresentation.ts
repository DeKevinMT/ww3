import { isSeaConnection } from '../data/worldMap';
import {
  mapTerritoryIsIntegrating,
  type MapCommanderForceState,
  type WorldMapEngineContract,
} from './bridge';
import {
  apexFieldPresentationActive,
  apexShieldPresentation,
} from './neuralFieldPresentation';

export const APEX_EMPIRE_NETWORK_MAX_EDGES = 384;

export interface ApexEmpireNetworkEdge {
  readonly sourceId: string;
  readonly targetId: string;
}

export interface ApexEmpireFieldPresentation {
  readonly active: boolean;
  readonly integrity: number;
  readonly percent: number;
  /** Every fully purged territory in the local human empire. */
  readonly coverageTerritoryIds: readonly string[];
  /** Friendly territories carrying a live offensive or defensive front. */
  readonly activeFrontTerritoryIds: readonly string[];
  /** Land links joining nearby shield caps; naval continuity uses the gateway overlay. */
  readonly networkEdges: readonly ApexEmpireNetworkEdge[];
  /** Stable, quantized rebuild key; tick/progress and numerical noise are excluded. */
  readonly geometrySignature: string;
}

const INACTIVE_APEX_EMPIRE_FIELD: ApexEmpireFieldPresentation = Object.freeze({
  active: false,
  integrity: 0,
  percent: 0,
  coverageTerritoryIds: Object.freeze([]),
  activeFrontTerritoryIds: Object.freeze([]),
  networkEdges: Object.freeze([]),
  geometrySignature: 'apex-empire-field:off',
});

function canonicalEdgeKey(sourceId: string, targetId: string): string {
  return sourceId < targetId
    ? `${sourceId}>${targetId}`
    : `${targetId}>${sourceId}`;
}

/**
 * Produces one viewer-local APEX field for the entire empire. APEX has no map
 * location here: fronts only concentrate the shared network and every visual
 * reads from one integrity pool. The result is rebuilt during map sync, never
 * from the animation frame.
 */
export function selectApexEmpireFieldPresentation(
  engine: WorldMapEngineContract,
  force: MapCommanderForceState | undefined = engine.state.commanderForces?.[
    engine.state.humanPlayerId
  ],
): ApexEmpireFieldPresentation {
  const legacyShield = apexShieldPresentation(force);
  const canonicalShield = force?.empireShield;
  const canonicalIntegrity = canonicalShield
    ? canonicalShield.integrityMax > 0
      ? canonicalShield.integrityCurrent / canonicalShield.integrityMax
      : canonicalShield.integrityPercent / 100
    : legacyShield.integrity;
  const integrity = Math.max(0, Math.min(1, canonicalIntegrity));
  const percent = canonicalShield
    ? Math.max(0, Math.min(100, Math.round(canonicalShield.integrityPercent)))
    : legacyShield.percent;
  const visible = canonicalShield
    ? canonicalShield.active && integrity > 0
    : legacyShield.visible;
  if (!force || !visible || !apexFieldPresentationActive(engine)) {
    return INACTIVE_APEX_EMPIRE_FIELD;
  }

  const viewerId = engine.state.humanPlayerId;
  const proposedCoverageTerritoryIds = canonicalShield
    ? [...new Set(canonicalShield.coverageTerritoryIds)].sort()
    : Object.values(engine.state.territories)
      .filter((territory) => territory.ownerId === viewerId)
      .map((territory) => territory.id)
      .sort();
  // The network is an earned visual layer, not an occupation overlay. A newly
  // captured country remains outside the cyan shell until Signal Purge reaches
  // canonical completion; the next map sync then joins it without a new mesh.
  const coverageTerritoryIds = proposedCoverageTerritoryIds.filter((territoryId) => {
    const territory = engine.state.territories[territoryId];
    return territory?.ownerId === viewerId
      && !mapTerritoryIsIntegrating(territory);
  });
  if (coverageTerritoryIds.length === 0) return INACTIVE_APEX_EMPIRE_FIELD;

  const coverage = new Set(coverageTerritoryIds);
  const activeFronts = new Set<string>(
    canonicalShield?.activeFrontTerritoryIds.filter((territoryId) => coverage.has(territoryId)),
  );
  if (!canonicalShield) {
    for (const war of engine.state.wars) {
      if (war.attackerId !== viewerId && war.defenderId !== viewerId) continue;
      for (const operation of [...war.attackerOperations, ...war.defenderOperations]) {
        if (coverage.has(operation.sourceId)) activeFronts.add(operation.sourceId);
        if (coverage.has(operation.targetId)) activeFronts.add(operation.targetId);
      }
    }
    // Legacy adapters can still predate the first materialised operation.
    if (force.front && coverage.has(force.locationId)) activeFronts.add(force.locationId);
    const secondary = force.doctrineRuntime?.secondaryProjection;
    if (secondary?.front.targetId && coverage.has(secondary.locationId)) {
      activeFronts.add(secondary.locationId);
    }
  }
  const activeFrontTerritoryIds = [...activeFronts].sort();

  const networkEdges: ApexEmpireNetworkEdge[] = [];
  const seenEdges = new Set<string>();
  for (const sourceId of coverageTerritoryIds) {
    const connections = engine.content?.territories?.[sourceId]?.connections ?? [];
    for (const connection of connections) {
      if (!coverage.has(connection.targetId)) continue;
      // Intercontinental sea links already have a dedicated dashed gateway
      // overlay. Reusing them here would stack a bright shield tether over the
      // cooler cartographic route and make one naval relationship read twice.
      if (isSeaConnection(sourceId, connection.targetId)) continue;
      const key = canonicalEdgeKey(sourceId, connection.targetId);
      if (seenEdges.has(key)) continue;
      seenEdges.add(key);
      const [left, right] = key.split('>') as [string, string];
      networkEdges.push({ sourceId: left, targetId: right });
      if (networkEdges.length >= APEX_EMPIRE_NETWORK_MAX_EDGES) break;
    }
    if (networkEdges.length >= APEX_EMPIRE_NETWORK_MAX_EDGES) break;
  }
  networkEdges.sort((left, right) => (
    left.sourceId.localeCompare(right.sourceId)
      || left.targetId.localeCompare(right.targetId)
  ));

  // Integrity is deliberately quantized for geometry/color uploads. The one
  // shared material handles pulse animation without rebuilding this topology.
  const integrityBand = Math.round(integrity * 20);
  return {
    active: true,
    integrity,
    percent,
    coverageTerritoryIds,
    activeFrontTerritoryIds,
    networkEdges,
    geometrySignature: [
      'apex-empire-field',
      `i${integrityBand}`,
      coverageTerritoryIds.join(','),
      `front:${activeFrontTerritoryIds.join(',')}`,
    ].join('|'),
  };
}
