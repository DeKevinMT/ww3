import { TERRITORY_BY_ID } from '../data/worldMap';
import { ANTARCTICA_SECTOR_PRESENTATION_BY_ID } from './mapGeographyPresentation';
import type { MapPolarSectorId, WorldMapEngineContract } from './bridge';

export const APEX_INTELLIGENCE_FOG_STYLE = Object.freeze({
  hiddenFill: 0x061522,
  /** A light relevance veil: the authored terrain and flags remain readable. */
  hiddenAlpha: 0.12,
  chartedAlpha: 0.07,
  rogueHiddenFill: 0x2b0a20,
  rogueHiddenAlpha: 0.16,
  rogueChartedAlpha: 0.10,
  /** Dormant Antarctica stays ordinary visible ice; only ownership intel is withheld. */
  dormantRogueAntarcticFill: 0x071722,
  dormantRogueAntarcticAlpha: 0,
  dormantRogueAntarcticCloudAlpha: 0,
  frontierAlpha: 0,
  rogueFrontierAlpha: 0,
  frontierCloudAlpha: 0,
  rogueCloudAlpha: 0,
  cloudTint: 0x24485b,
  cloudAlpha: 0,
  chartedCloudAlpha: 0,
  chartedCloudMaskAlpha: 0,
  featherPixels: 3,
  reducedMotionDrift: 0,
  cloudDriftPerSecond: 0,
});

export interface ApexFogTerritoryPresentation {
  readonly obscured: boolean;
  readonly frontier: boolean;
  readonly charted: boolean;
  readonly rogueOccupied: boolean;
  readonly dormantRogueAntarctic: boolean;
  readonly fill: number;
  readonly alpha: number;
  readonly cloudAlpha: number;
}

function fogTerritoryPresentationV2(input: {
  readonly obscured: boolean;
  readonly frontier: boolean;
  readonly charted: boolean;
  readonly rogueOccupied: boolean;
  readonly dormantRogueAntarctic: boolean;
}): ApexFogTerritoryPresentation {
  const {
    obscured,
    frontier,
    charted,
    rogueOccupied,
    dormantRogueAntarctic,
  } = input;
  return {
    obscured,
    frontier,
    charted,
    rogueOccupied,
    dormantRogueAntarctic,
    fill: dormantRogueAntarctic
      ? APEX_INTELLIGENCE_FOG_STYLE.dormantRogueAntarcticFill
      : rogueOccupied
      ? APEX_INTELLIGENCE_FOG_STYLE.rogueHiddenFill
      : APEX_INTELLIGENCE_FOG_STYLE.hiddenFill,
    alpha: !obscured ? 0 : dormantRogueAntarctic
      ? APEX_INTELLIGENCE_FOG_STYLE.dormantRogueAntarcticAlpha
      : rogueOccupied
      ? frontier
        ? APEX_INTELLIGENCE_FOG_STYLE.rogueFrontierAlpha
        : charted
        ? APEX_INTELLIGENCE_FOG_STYLE.rogueChartedAlpha
        : APEX_INTELLIGENCE_FOG_STYLE.rogueHiddenAlpha
      : frontier
        ? APEX_INTELLIGENCE_FOG_STYLE.frontierAlpha
        : charted
        ? APEX_INTELLIGENCE_FOG_STYLE.chartedAlpha
        : APEX_INTELLIGENCE_FOG_STYLE.hiddenAlpha,
    cloudAlpha: !obscured ? 0 : dormantRogueAntarctic
      ? APEX_INTELLIGENCE_FOG_STYLE.dormantRogueAntarcticCloudAlpha
      : rogueOccupied
      ? frontier
        ? APEX_INTELLIGENCE_FOG_STYLE.frontierCloudAlpha
        : APEX_INTELLIGENCE_FOG_STYLE.rogueCloudAlpha
      : frontier
        ? APEX_INTELLIGENCE_FOG_STYLE.frontierCloudAlpha
        : charted
        ? APEX_INTELLIGENCE_FOG_STYLE.chartedCloudAlpha
        : APEX_INTELLIGENCE_FOG_STYLE.cloudAlpha,
  };
}

/**
 * Shared 2D/3D relevance-veil policy. It may tint distant territory, but it
 * never controls which live country information the player can inspect.
 */
export function apexFogTerritoryPresentation(
  visibility: ApexIntelligenceVisibility,
  territoryId: string,
  ownerId: string | undefined,
): ApexFogTerritoryPresentation {
  const clear = apexTerritoryMapClear(visibility, territoryId);
  const frontier = visibility.enabled && visibility.frontierTerritoryIds.has(territoryId);
  const obscured = !clear;
  const charted = obscured && !frontier && apexTerritoryCharted(visibility, territoryId);
  const rogueOccupied = obscured && ownerId === 'rai';
  const dormantRogueAntarctic = rogueOccupied
    && ANTARCTICA_SECTOR_PRESENTATION_BY_ID.has(territoryId as MapPolarSectorId)
    && !visibility.rogueAntarcticaAwake;
  return fogTerritoryPresentationV2({
    obscured,
    frontier,
    charted,
    rogueOccupied,
    dormantRogueAntarctic,
  });
}

/**
 * Stable presentation baked into the expensive political globe atlas.
 *
 * Fronts, convoys and APEX travel are animated by dedicated scene overlays.
 * Letting those weekly signals clear patches in the baked atlas forced a full
 * 6K repaint and GPU upload almost every Survival tick. The atlas therefore
 * carries only the durable relevance veil: own land is clear, distant land is
 * lightly tinted and account-known land is softened. Dormant Antarctica stays
 * ordinary ice and is never part of this veil. Transient overlays remain live.
 */
export function apexPoliticalAtlasFogTerritoryPresentation(
  visibility: ApexIntelligenceVisibility,
  territoryId: string,
  ownerId: string | undefined,
): ApexFogTerritoryPresentation {
  const obscured = visibility.enabled && ownerId !== visibility.viewerId;
  const charted = obscured && visibility.chartedTerritoryIds.has(territoryId);
  const rogueOccupied = obscured && ownerId === 'rai';
  const dormantRogueAntarctic = rogueOccupied
    && ANTARCTICA_SECTOR_PRESENTATION_BY_ID.has(territoryId as MapPolarSectorId)
    && !visibility.rogueAntarcticaAwake;
  return fogTerritoryPresentationV2({
    obscured,
    frontier: false,
    charted,
    rogueOccupied,
    dormantRogueAntarctic,
  });
}

export interface ApexIntelligenceVisibility {
  readonly enabled: boolean;
  readonly viewerId: string;
  /** Physical machine activity has made Antarctica readable as ordinary hostile land. */
  readonly rogueAntarcticaAwake?: boolean;
  /** Account-known territory used only to soften its presentation tint. */
  readonly chartedTerritoryIds: ReadonlySet<string>;
  /** Visually untinted political surface: the viewer's realm and APEX path. */
  readonly clearTerritoryIds: ReadonlySet<string>;
  /** Target/front ring that receives the clearest distant presentation. */
  readonly frontierTerritoryIds: ReadonlySet<string>;
  /** Clear + frontier union retained for presentation and threat detection. */
  readonly visibleTerritoryIds: ReadonlySet<string>;
  readonly detectedRogueRouteKeys: ReadonlySet<string>;
  /** Prime itself may render only after its route is detected. */
  readonly roguePrimeDetected: boolean;
  /** Stage-IV remote track: Prime may render while terrain remains obscured. */
  readonly roguePrimeTrackedRemotely: boolean;
  readonly detectedRoguePrimeTerritoryIds: ReadonlySet<string>;
  readonly signature: string;
}

/**
 * Political identity is presentation data, not exact live intelligence. The
 * authored country/empire flag therefore remains visible beneath the light
 * relevance veil in every mode. Dormant Rogue Antarctica is the sole authored
 * exception: its owner identity stays withheld until mobilisation, without fog.
 */
export function apexTerritoryPoliticalIdentityVisible(
  visibility: ApexIntelligenceVisibility,
  territoryId: string,
  ownerId: string | undefined,
): boolean {
  return !apexFogTerritoryPresentation(
    visibility,
    territoryId,
    ownerId,
  ).dormantRogueAntarctic;
}

/**
 * Exact-intel territories keep their tactical labels. Outside that ring only
 * the shared top-power cohort receives one quiet, non-detailed namecard.
 */
export function apexTerritoryNamecardVisible(
  visibility: ApexIntelligenceVisibility,
  territoryId: string,
  ownerId: string | undefined,
  topPowerRealm: boolean,
): boolean {
  return apexTerritoryPoliticalIdentityVisible(visibility, territoryId, ownerId)
    && (
      !visibility.enabled
      || visibility.clearTerritoryIds.has(territoryId)
      || visibility.frontierTerritoryIds.has(territoryId)
      || topPowerRealm
    );
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

function strategicNeighbors(engine: WorldMapEngineContract, territoryId: string): readonly string[] {
  const contentConnections = engine.content?.territories?.[territoryId]?.connections;
  if (contentConnections) return contentConnections.map((connection) => connection.targetId);
  const ordinary = TERRITORY_BY_ID[territoryId]?.neighbors;
  if (ordinary) return ordinary;
  return ANTARCTICA_SECTOR_PRESENTATION_BY_ID.get(territoryId as MapPolarSectorId)?.neighbors ?? [];
}

const AWAKE_ROGUE_ATTENTION_STAGES = new Set([
  'mobilising',
  'breach-imminent',
  'active',
]);

/** Legacy snapshots fall back to their physical polar phase. */
function rogueAntarcticaAwake(engine: WorldMapEngineContract): boolean {
  const scenarioId = engine.content?.metadata?.scenarioId;
  if (scenarioId === 'survival' || scenarioId === 'random-world') return true;
  const polar = engine.state.polarEndgame;
  const stage = polar?.rogueAttention?.stage;
  if (stage) return AWAKE_ROGUE_ATTENTION_STAGES.has(stage);
  return polar !== undefined && [
    'contact',
    'counteroffensive',
    'core-exposed',
    'victory',
  ].includes(polar.phase);
}

export function apexIntelligenceFogEnabled(engine: WorldMapEngineContract): boolean {
  const scenarioId = engine.content?.metadata?.scenarioId;
  if (scenarioId === 'random-world') return false;
  if (scenarioId === 'survival') return true;
  if (scenarioId === 'standard-2026') {
    return engine.viewerKnowledge?.communicationsBlackoutActive === true;
  }
  return false;
}

/**
 * Stable cache key: ownership/topology, wars, relevant Rogue routes, APEX path
 * and polar intel only. Weekly army/economy ticks deliberately cannot repaint
 * either renderer's fog atlas.
 */
export function apexIntelligenceVisibilitySignature(engine: WorldMapEngineContract): string {
  const viewerId = engine.state.humanPlayerId ?? '';
  const ownership = Object.entries(engine.state.territories)
    .map(([territoryId, territory]) => `${territoryId}:${territory.ownerId}`)
    .sort().join(',');
  const strategicTopology = Object.entries(engine.content?.territories ?? {})
    .map(([territoryId, territory]) => (
      `${territoryId}>${territory.connections.map((connection) => connection.targetId).sort().join(',')}`
    )).sort().join('|');
  const wars = engine.state.wars.map((war) => [
    war.id,
    war.attackerId,
    war.defenderId,
    ...war.attackerOperations.flatMap((operation) => [operation.sourceId, operation.targetId]),
    ...war.defenderOperations.flatMap((operation) => [operation.sourceId, operation.targetId]),
  ].join(':')).sort().join('|');
  const rogueRoutes = engine.state.logisticsMovements
    .filter((movement) => movement.playerId === 'rai')
    .map((movement) => `${movement.sourceId}:${movement.targetId}`)
    .sort().join(',');
  const apex = engine.state.commanderForces?.[viewerId];
  const apexPath = apex
    ? `${apex.headquartersId}:${apex.locationId}:${apex.transit?.path.join('>') ?? ''}`
    : '';
  const viewerKnowledge = engine.viewerKnowledge;
  const polar = engine.state.polarEndgame;
  const prime = engine.state.polarEndgame?.roguePrime;
  return [
    'light-relevance-veil-v2',
    engine.content?.metadata?.scenarioId ?? 'legacy',
    viewerId,
    ownership,
    strategicTopology,
    wars,
    rogueRoutes,
    apexPath,
    sortedUnique(viewerKnowledge?.chartedTerritoryIds ?? []).join(','),
    sortedUnique(viewerKnowledge?.detectedTerritoryIds ?? []).join(','),
    viewerKnowledge?.roguePrimeTracking === true ? 'prime-tracked' : 'prime-untracked',
    viewerKnowledge?.communicationsBlackoutActive === true ? 'blackout' : 'clear',
    polar?.rogueAttention?.stage ?? polar?.phase ?? 'no-polar-state',
    prime?.status ?? 'no-prime',
    prime?.force?.locationId ?? '',
    prime?.force?.transit?.path.join('>') ?? '',
  ].join('|');
}

/**
 * Cache key for pixels baked into the political globe atlas. It intentionally
 * excludes wars, logistics routes, APEX/Prime travel and strategic topology:
 * those are transient scene overlays and must never trigger a 6K atlas upload.
 */
export function apexIntelligenceAtlasSignature(engine: WorldMapEngineContract): string {
  const viewerId = engine.state.humanPlayerId ?? '';
  const viewerKnowledge = engine.viewerKnowledge;
  return [
    'stable-political-veil-v1',
    engine.content?.metadata?.scenarioId ?? 'legacy',
    viewerId,
    apexIntelligenceFogEnabled(engine) ? 'veil-on' : 'veil-off',
    sortedUnique(viewerKnowledge?.chartedTerritoryIds ?? []).join(','),
    rogueAntarcticaAwake(engine) ? 'antarctica-awake' : 'antarctica-dormant',
  ].join('|');
}

export function selectApexIntelligenceVisibility(
  engine: WorldMapEngineContract,
): ApexIntelligenceVisibility {
  const viewerId = engine.state.humanPlayerId ?? '';
  const signature = apexIntelligenceVisibilitySignature(engine);
  const allTerritoryIds = Object.keys(engine.state.territories);
  const rogueAntarcticaIsAwake = rogueAntarcticaAwake(engine);
  if (!apexIntelligenceFogEnabled(engine) || !viewerId) {
    return {
      enabled: false,
      viewerId,
      rogueAntarcticaAwake: rogueAntarcticaIsAwake,
      chartedTerritoryIds: new Set(),
      clearTerritoryIds: new Set(allTerritoryIds),
      frontierTerritoryIds: new Set(),
      visibleTerritoryIds: new Set(allTerritoryIds),
      detectedRogueRouteKeys: new Set(),
      roguePrimeDetected: Boolean(engine.state.polarEndgame?.roguePrime?.force),
      roguePrimeTrackedRemotely: false,
      detectedRoguePrimeTerritoryIds: new Set(),
      signature,
    };
  }

  const clear = new Set<string>();
  const frontier = new Set<string>();
  const visible = new Set<string>();
  const addClear = (territoryId: string): void => {
    clear.add(territoryId);
    frontier.delete(territoryId);
    visible.add(territoryId);
  };
  const addFrontier = (territoryId: string): void => {
    if (!clear.has(territoryId)) frontier.add(territoryId);
    visible.add(territoryId);
  };
  const charted = new Set(sortedUnique(
    (engine.viewerKnowledge?.chartedTerritoryIds ?? [])
      .filter((territoryId) => Boolean(engine.state.territories[territoryId])),
  ));
  const ownTerritoryIds: string[] = [];
  for (const [territoryId, territory] of Object.entries(engine.state.territories)) {
    if (territory.ownerId !== viewerId) continue;
    addClear(territoryId);
    ownTerritoryIds.push(territoryId);
  }
  for (const territoryId of ownTerritoryIds) {
    for (const neighborId of strategicNeighbors(engine, territoryId)) addFrontier(neighborId);
  }

  for (const war of engine.state.wars) {
    if (war.attackerId !== viewerId && war.defenderId !== viewerId) continue;
    const opponentId = war.attackerId === viewerId ? war.defenderId : war.attackerId;
    const opponentCapitalId = engine.player(opponentId)?.capitalId;
    if (opponentCapitalId) addFrontier(opponentCapitalId);
    for (const operation of [...war.attackerOperations, ...war.defenderOperations]) {
      addFrontier(operation.sourceId);
      addFrontier(operation.targetId);
    }
  }

  const apex = engine.state.commanderForces?.[viewerId];
  if (apex) {
    addClear(apex.headquartersId);
    addClear(apex.locationId);
    for (const territoryId of apex.transit?.path ?? []) addClear(territoryId);
  }

  for (const territoryId of engine.viewerKnowledge?.detectedTerritoryIds ?? []) {
    if (engine.state.territories[territoryId]) addFrontier(territoryId);
  }

  const detectedRogueRouteKeys = new Set<string>();
  // Resolve transit detection after the own/one-hop/front ring exists. An
  // approaching route reveals its origin as well as its already-detected end.
  for (const movement of engine.state.logisticsMovements) {
    if (movement.playerId !== 'rai') continue;
    if (!visible.has(movement.targetId)
      && engine.state.territories[movement.targetId]?.ownerId !== viewerId) continue;
    addFrontier(movement.sourceId);
    addFrontier(movement.targetId);
    detectedRogueRouteKeys.add(`${movement.sourceId}:${movement.targetId}`);
  }

  const prime = engine.state.polarEndgame?.roguePrime;
  const primeTerritoryIds = sortedUnique([
    prime?.force?.locationId,
    ...(prime?.force?.transit?.path ?? []),
    prime?.gatewayId,
    prime?.targetId,
  ].filter((territoryId): territoryId is string => Boolean(
    territoryId && engine.state.territories[territoryId],
  )));
  // Detection is evaluated against the already-known ring. Only then is the
  // whole authored sortie path revealed, ensuring an approaching threat moves
  // in from the distance instead of popping onto its target.
  const roguePrimeInExactIntel = Boolean(
    prime?.force && primeTerritoryIds.some((territoryId) => visible.has(territoryId)),
  );
  const roguePrimeTrackedRemotely = Boolean(
    prime?.force && engine.viewerKnowledge?.roguePrimeTracking === true,
  );
  const roguePrimeDetected = roguePrimeInExactIntel || roguePrimeTrackedRemotely;
  const detectedRoguePrimeTerritoryIds = roguePrimeInExactIntel
    ? new Set(primeTerritoryIds) : new Set<string>();
  // Remote Stage-IV tracking reveals the force and its route, not the live
  // military/economic state of the countries underneath it.
  if (roguePrimeInExactIntel) {
    for (const territoryId of primeTerritoryIds) addFrontier(territoryId);
  }

  return {
    enabled: true,
    viewerId,
    rogueAntarcticaAwake: rogueAntarcticaIsAwake,
    chartedTerritoryIds: new Set(sortedUnique(charted)),
    clearTerritoryIds: new Set(sortedUnique(clear)),
    frontierTerritoryIds: new Set(sortedUnique(frontier)),
    visibleTerritoryIds: new Set(sortedUnique(visible)),
    detectedRogueRouteKeys,
    roguePrimeDetected,
    roguePrimeTrackedRemotely,
    detectedRoguePrimeTerritoryIds,
    signature,
  };
}

/** True when an account-known country is still under the visual distance tint. */
export function apexTerritoryCharted(
  visibility: Pick<ApexIntelligenceVisibility, 'enabled' | 'chartedTerritoryIds' | 'visibleTerritoryIds'>,
  territoryId: string,
): boolean {
  return visibility.enabled
    && !visibility.visibleTerritoryIds.has(territoryId)
    && visibility.chartedTerritoryIds.has(territoryId);
}

/**
 * Information visibility is no longer coupled to strategic reach. Every
 * ordinary territory can be inspected; real access and declaration rules are
 * still enforced by the simulation when the player chooses an action.
 */
export function apexTerritoryHoverVisible(
  _visibility: Pick<ApexIntelligenceVisibility, 'enabled' | 'chartedTerritoryIds' | 'visibleTerritoryIds'>,
  _territoryId: string,
): boolean {
  return true;
}

export function apexTerritoryIntelVisible(
  _visibility: Pick<ApexIntelligenceVisibility, 'enabled' | 'visibleTerritoryIds'>,
  _territoryId: string,
): boolean {
  return true;
}

/** Political surface is clear only for owned or physically APEX-held land. */
export function apexTerritoryMapClear(
  visibility: Pick<ApexIntelligenceVisibility, 'enabled' | 'clearTerritoryIds'>,
  territoryId: string,
): boolean {
  return !visibility.enabled || visibility.clearTerritoryIds.has(territoryId);
}
