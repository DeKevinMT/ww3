import Phaser from 'phaser';
import {
  COUNTRIES,
  COUNTRY_BY_ID,
  MAP_HEIGHT,
  MAP_WIDTH,
  TERRITORIES,
  TERRITORY_BY_ID,
  countrySeaRouteBendDirection,
  countrySeaRouteMapGeometry,
  isSeaConnection,
  projectWorldPoint,
  terrainProfileForTerritory,
} from '../data/worldMap';
import {
  TERRAIN_MAP_VISUAL_TUNING,
  terrainMapColor,
  terrainMapFillColor,
} from '../terrainPresentation';
import {
  mapCommanderRecoveryLifecycleActive,
  mapCommanderTransitProgress,
  mapBridge,
  mapTerritoryIsIntegrating,
  type MapBattleEvent,
  type MapCommanderForceState,
  type MapFrontOperation,
  type MapSceneAdapter,
  type MapSelectionState,
  type MapWarState,
  type WorldMapEngineContract,
} from './bridge';
import {
  countryFlagAsset,
  CUSTOM_FLAG_NATION_IDS,
  MAP_FLAG_TEXTURE_HEIGHT,
  MAP_FLAG_TEXTURE_WIDTH,
} from '../../ui/countryFlags';
import {
  BATTLE_EFFECT_COALESCE_WINDOW_MS,
  BATTLE_EFFECT_MAX_ACTIVE,
} from './battleEffectPresentation';
import {
  compactMapCombatPower,
  commanderShieldMapSupportPercent,
  forcePresentationSignature,
  mapCombatPowerLabel,
} from './forcePresentation';
import {
  combatPresentationDescriptor,
  combatRouteBendDirection,
  combatRouteSample,
  combatWorldUnits,
  resolveCombatPresentationAccess,
  sampleCombatRoute,
  type CombatAccessPresentation,
  type CombatRouteSample,
} from './combatPresentation';
import {
  groupFlagLandmasses,
  resolveCountryPresentationAnchor,
} from './countryPresentation';
import {
  hasDeepMapLabelSlot,
  mapCountryLabelDecision,
  PASSIVE_POWER_LABEL_LIMIT,
} from './mapLabelVisibility';
import {
  ANTARCTICA_ICE_SHELF,
  ANTARCTICA_MAP_SILHOUETTE,
  ANTARCTICA_SECTOR_PRESENTATIONS,
  projectAntarcticaMapPoint,
} from './mapGeographyPresentation';
import {
  selectGlobeVisibleLogisticsRoutes,
  type GlobeVisibleLogisticsRoute,
} from './three/globeLogisticsPresentation';
import {
  globeRogueTerritoryPresentation,
  globeTerritoryReadinessPresentation,
} from './three/globeTerritoryPresentation';
import {
  AUTHORED_NAVAL_GATEWAY_PRESENTATION_ROUTES,
  NAVAL_GATEWAY_PRESENTATION_STYLE,
  navalGatewayRouteEmphasized,
} from './navalGatewayPresentation';
import {
  APEX_INTELLIGENCE_FOG_STYLE,
  apexFogTerritoryPresentation,
  apexTerritoryMapClear,
  apexTerritoryHoverVisible,
  apexTerritoryIntelVisible,
  apexTerritoryNamecardVisible,
  apexTerritoryPoliticalIdentityVisible,
  selectApexIntelligenceVisibility,
  type ApexIntelligenceVisibility,
} from './apexIntelligenceFog';
import {
  ROGUE_PRIME_RENDER_ID,
  roguePrimeMapPresentation,
} from './roguePrimePresentation';
import {
  STRATEGIC_NEURAL_FIELD_STYLE,
  apexFieldPresentationActive,
  apexProjectionPresentations,
  apexShieldPresentation,
  createNeuralFieldPulseSample,
  neuralFieldCoverageGeometrySignature,
  neuralFieldModePresentation,
  neuralFieldRouteGeometrySignature,
  neuralFieldRouteSegment,
  resolveNeuralFieldPulseTarget,
  sampleNeuralFieldPulse,
  type NeuralFieldPulseResolution,
} from './neuralFieldPresentation';
import {
  createApexFogTransitionState,
  sampleApexFogVisualBlend,
} from './apexFogTransition';
import {
  mapOwnerPairKey,
  strategicBorderKind,
  strategicBorderThreatSignature,
} from './borderThreatPresentation';

interface TerritoryVisual {
  parts: Phaser.GameObjects.Polygon[];
  hud: Phaser.GameObjects.Container;
  panel: Phaser.GameObjects.Rectangle;
  name: Phaser.GameObjects.Text;
  detail: Phaser.GameObjects.Text;
  openingMobilisation: Phaser.GameObjects.Text;
  openingMobilisationBarBack: Phaser.GameObjects.Rectangle;
  openingMobilisationBarFill: Phaser.GameObjects.Rectangle;
  localForce: Phaser.GameObjects.Text;
  localForceBarBack: Phaser.GameObjects.Rectangle;
  localForceBarFill: Phaser.GameObjects.Rectangle;
  layoutDetailVisible?: boolean;
  layoutOpeningMobilisationVisible?: boolean;
  layoutCompactHeadquarters?: boolean;
  layoutWidth?: number;
  layoutHeight?: number;
  openingMobilisationActive: boolean;
  openingMobilisationRemaining: number;
  localForceText: string;
  localForceFill: number;
  localForceFillColor: number;
}

interface CommanderForceMapVisual {
  readonly role: 'apex' | 'rogue-prime';
  readonly container: Phaser.GameObjects.Container;
  readonly field: Phaser.GameObjects.Graphics;
  readonly signal: Phaser.GameObjects.Text;
  projection: 'primary' | 'secondary';
  moving: boolean;
  recovering: boolean;
  fieldOperational: boolean;
  fieldIntensity: number;
  combatActive: boolean;
  frontTargetId: string | null;
  coverageTerritoryId: string;
  coverageBoundaryWorldRadius: number;
}

interface CommanderForceMapEntry {
  readonly id: string;
  readonly role: 'apex' | 'rogue-prime';
  readonly force: MapCommanderForceState;
  readonly projection: 'primary' | 'secondary';
  readonly tether: boolean;
  readonly routePath: readonly string[];
  readonly routeProgress: number;
  readonly routeVisible: boolean;
  readonly moving: boolean;
  readonly recovering: boolean;
  readonly fieldOperational: boolean;
  readonly fieldIntensity: number;
  readonly combatActive: boolean;
}

interface AntarcticaReadinessVisual {
  readonly power: Phaser.GameObjects.Text;
  readonly barBack: Phaser.GameObjects.Rectangle;
  readonly barFill: Phaser.GameObjects.Rectangle;
}

interface AntarcticaTerritoryVisual {
  readonly parts: readonly Phaser.GameObjects.Polygon[];
}

interface OwnershipBoundarySegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  territoryIds: readonly string[];
}

type MapStateSnapshot = WorldMapEngineContract['state'];

const OPEN_ANTARCTICA_READINESS_PHASES = new Set([
  'warning', 'contact', 'counteroffensive', 'core-exposed', 'victory',
]);

function mapPresentationPoint(territoryId: string): { x: number; y: number } | undefined {
  const territory = TERRITORY_BY_ID[territoryId];
  if (territory) return territory;
  const sector = ANTARCTICA_SECTOR_PRESENTATIONS.find((entry) => entry.id === territoryId);
  if (!sector) return undefined;
  const [x, y] = projectAntarcticaMapPoint(sector.longitude, sector.latitude);
  return { x, y };
}

function commanderMapPresentationPoint(
  force: MapCommanderForceState,
  tick: number,
  itinerary: readonly string[] = force.transit?.path.length
    ? force.transit.path : [force.locationId],
  progress = mapCommanderTransitProgress(force, tick),
): RenderPoint | undefined {
  const points = itinerary.map(mapPresentationPoint);
  if (points.some((point) => !point)) return mapPresentationPoint(force.locationId);
  const route = points as RenderPoint[];
  if (route.length === 1) return route[0];
  const { segmentIndex, segmentProgress } = neuralFieldRouteSegment(progress, route.length);
  const start = route[segmentIndex]!;
  const end = route[segmentIndex + 1]!;
  let deltaX = end.x - start.x;
  if (Math.abs(deltaX) > MAP_WIDTH / 2) deltaX += deltaX > 0 ? -MAP_WIDTH : MAP_WIDTH;
  const wrappedX = (start.x + deltaX * segmentProgress + MAP_WIDTH) % MAP_WIDTH;
  return { x: wrappedX, y: Phaser.Math.Linear(start.y, end.y, segmentProgress) };
}

function compareFrontOperations(left: MapFrontOperation, right: MapFrontOperation): number {
  return left.commanderId.localeCompare(right.commanderId)
    || left.sourceId.localeCompare(right.sourceId)
    || left.targetId.localeCompare(right.targetId)
    || left.doctrine.localeCompare(right.doctrine);
}

function sortedWarOperations(war: MapWarState): MapFrontOperation[] {
  return [...war.attackerOperations, ...war.defenderOperations].sort(compareFrontOperations);
}

function stableTextFraction(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}

function colorMix(color: number, target: number, amount: number): number {
  const red = ((color >> 16) & 0xff) * (1 - amount) + ((target >> 16) & 0xff) * amount;
  const green = ((color >> 8) & 0xff) * (1 - amount) + ((target >> 8) & 0xff) * amount;
  const blue = (color & 0xff) * (1 - amount) + (target & 0xff) * amount;
  return (Math.round(red) << 16) | (Math.round(green) << 8) | Math.round(blue);
}

function compactManpower(millions: number): string {
  const value = Math.max(0, millions) * 1_000_000;
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
  return value.toFixed(2);
}

function compactCountryName(name: string): string {
  const commonNames: Record<string, string> = {
    'United States of America': 'United States',
    "People's Republic of China": 'China',
    'Democratic Republic of the Congo': 'DR Congo',
    'Republic of the Congo': 'Congo',
    'Central African Republic': 'Central African Rep.',
    'Bosnia and Herzegovina': 'Bosnia & Herzegovina',
    'Saint Vincent and the Grenadines': 'St Vincent & Grenadines',
  };
  const compact = commonNames[name] ?? name;
  return compact.length > 18 ? `${compact.slice(0, 17).trimEnd()}…` : compact;
}

function compactControllerName(name: string | undefined): string {
  const compact = name?.trim().replace(/\s+/g, ' ') || 'PLAYER';
  return compact.length > 12 ? `${compact.slice(0, 11).trimEnd()}…` : compact;
}

// Map labels are intentionally closer to cartographic tags than HUD cards:
// country first, one terse military line only when it is contextually useful.
const LABEL_NAME_SIZE = 11;
const LABEL_DETAIL_SIZE = 11;
const LABEL_TEXT_RESOLUTION = 2;
// MAP_MIN_ZOOM is 0.78, so 1.30 keeps authored 11px map copy at or above
// 11px on screen even at the widest flat-map overview.
const LABEL_MAX_SCREEN_SCALE = 1.30;
const LABEL_PADDING_X = 6;
const LABEL_COLLISION_GAP = 4;
const LABEL_SAFE_TOP = 80;
const LABEL_SAFE_BOTTOM = 8;
const FLAG_TEXTURE_PREFIX = 'nation-flag-';
const NEURAL_CONVERGENCE_MAP_PATH_POINTS = 28;
const FLAG_ATLAS_SCALE = 3;
const MAP_MIN_ZOOM = 0.78;
const MAP_MAX_ZOOM = 24;
const MAP_ZOOM_WHEEL_RATE = 0.00135;
const MAP_ZOOM_RESPONSE_MS = 82;
const MICROSTATE_FOCUS_SCREEN_SIZE = 110;
// Natural Earth contains roughly 95k coastline vertices. Keeping sub-pixel
// bends adds a lot of Phaser hit-test/triangulation work without making the
// map more legible. Deep microstate zoom needs a tighter tolerance so retained
// bends stay near one screen pixel even at the maximum camera scale.
const BORDER_SIMPLIFICATION_TOLERANCE = 0.05;

export const WORLD_MAP_BORDER_STYLE = Object.freeze({
  neutral: Object.freeze({ width: 0.82, color: 0x718b96, alpha: 0.46 }),
  threatened: Object.freeze({ width: 1.04, color: 0xef962e, alpha: 0.74 }),
  acute: Object.freeze({ width: 1.24, color: 0xff3f2f, alpha: 0.88 }),
  rogue: Object.freeze({ width: 1.02, color: 0xc22a6b, alpha: 0.68 }),
  activeWar: Object.freeze({ width: 1.34, color: 0xff4a3d, alpha: 0.92 }),
  // Compatibility aliases intentionally share the exact neutral grammar.
  internal: Object.freeze({ width: 0.82, color: 0x718b96, alpha: 0.46 }),
  integrating: Object.freeze({ width: 0.82, color: 0x718b96, alpha: 0.46 }),
  international: Object.freeze({ width: 0.82, color: 0x718b96, alpha: 0.46 }),
});

interface RenderPoint {
  x: number;
  y: number;
}

interface FrontRenderOperation {
  sourceId: string;
  targetId: string;
  source: RenderPoint;
  target: RenderPoint;
  color: number;
  isHuman: boolean;
  momentum: number;
  access: CombatAccessPresentation;
}

interface RenderRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

function distanceToSegmentSquared(point: RenderPoint, start: RenderPoint, end: RenderPoint): number {
  let x = start.x;
  let y = start.y;
  const dx = end.x - x;
  const dy = end.y - y;
  if (dx !== 0 || dy !== 0) {
    const position = Math.max(0, Math.min(1,
      ((point.x - x) * dx + (point.y - y) * dy) / (dx * dx + dy * dy),
    ));
    x += dx * position;
    y += dy * position;
  }
  const offsetX = point.x - x;
  const offsetY = point.y - y;
  return offsetX * offsetX + offsetY * offsetY;
}

function simplifyOpenPath(points: readonly RenderPoint[], toleranceSquared: number): RenderPoint[] {
  if (points.length <= 2) return [...points];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [startIndex, endIndex] = stack.pop()!;
    let furthestIndex = -1;
    let furthestDistance = toleranceSquared;
    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const distance = distanceToSegmentSquared(points[index]!, points[startIndex]!, points[endIndex]!);
      if (distance > furthestDistance) {
        furthestDistance = distance;
        furthestIndex = index;
      }
    }
    if (furthestIndex < 0) continue;
    keep[furthestIndex] = 1;
    stack.push([startIndex, furthestIndex], [furthestIndex, endIndex]);
  }
  return points.filter((_, index) => keep[index] === 1);
}

function simplifyRenderRing(ring: readonly (readonly [number, number])[]): RenderPoint[] {
  const projected = ring.map(([longitude, latitude]) => projectWorldPoint(longitude, latitude));
  if (projected.length > 1) {
    const first = projected[0]!;
    const last = projected[projected.length - 1]!;
    if (Math.abs(first.x - last.x) < 1e-7 && Math.abs(first.y - last.y) < 1e-7) projected.pop();
  }
  if (projected.length <= 4) return projected;

  // Split the closed ring at its furthest point so both halves retain their
  // silhouette. This avoids the usual closed-loop RDP start/end artefact.
  let splitIndex = 1;
  let splitDistance = -1;
  for (let index = 1; index < projected.length; index += 1) {
    const dx = projected[index]!.x - projected[0]!.x;
    const dy = projected[index]!.y - projected[0]!.y;
    const distance = dx * dx + dy * dy;
    if (distance > splitDistance) {
      splitDistance = distance;
      splitIndex = index;
    }
  }
  const toleranceSquared = BORDER_SIMPLIFICATION_TOLERANCE ** 2;
  const firstHalf = simplifyOpenPath(projected.slice(0, splitIndex + 1), toleranceSquared);
  const secondHalf = simplifyOpenPath([...projected.slice(splitIndex), projected[0]!], toleranceSquared);
  return [...firstHalf.slice(0, -1), ...secondHalf.slice(0, -1)];
}

const RENDER_RINGS = new Map(COUNTRIES.map((country) => [
  country.id,
  country.rings.map(simplifyRenderRing).filter((ring) => ring.length >= 3),
]));

/** Shared/precomputed silhouette data used by the one APEX/PRIME coverage layer. */
const NEURAL_FIELD_MAP_RINGS = new Map<string, readonly (readonly RenderPoint[])[]>([
  ...[...RENDER_RINGS.entries()],
  ...ANTARCTICA_SECTOR_PRESENTATIONS.map((sector) => [
    sector.id,
    sector.mapRings.map((ring) => ring.map(([x, y]) => ({ x, y }))),
  ] as const),
]);

function mapNeuralFieldBoundaryRadius(territoryId: string): number {
  const anchor = mapPresentationPoint(territoryId);
  const rings = NEURAL_FIELD_MAP_RINGS.get(territoryId) ?? [];
  if (!anchor || rings.length === 0) return 8;
  let maximum = 8;
  for (const ring of rings) {
    for (const point of ring) {
      maximum = Math.max(maximum, Math.hypot(
        wrappedXNear(point.x, anchor.x) - anchor.x,
        point.y - anchor.y,
      ));
    }
  }
  return Phaser.Math.Clamp(maximum * 0.72, 8, 82);
}

interface CountryRenderBounds {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

function wrappedXNear(x: number, anchorX: number): number {
  let result = x;
  while (result - anchorX > MAP_WIDTH / 2) result -= MAP_WIDTH;
  while (result - anchorX < -MAP_WIDTH / 2) result += MAP_WIDTH;
  return result;
}

function countryPresentationAnchor(countryId: string): RenderPoint | undefined {
  const fallback = TERRITORY_BY_ID[countryId];
  return fallback
    ? resolveCountryPresentationAnchor(countryId, fallback, projectWorldPoint)
    : undefined;
}

/**
 * Focus and deep-label decisions use the landmass cluster around the country's
 * label anchor. Remote islands therefore do not make mainland microstates look
 * artificially huge or force a world-scale camera framing.
 */
function countryRenderBounds(countryId: string): CountryRenderBounds | undefined {
  const anchor = countryPresentationAnchor(countryId);
  const rings = RENDER_RINGS.get(countryId) ?? [];
  if (!anchor || rings.length === 0) return undefined;
  const ringEntries = rings.map((ring) => {
    const points = ring.map((point) => ({ x: wrappedXNear(point.x, anchor.x), y: point.y }));
    const centerX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const centerY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    return { points, distance: Math.hypot(centerX - anchor.x, centerY - anchor.y) };
  });
  const nearestDistance = Math.min(...ringEntries.map((entry) => entry.distance));
  const localEntries = ringEntries.filter((entry) => entry.distance <= Math.max(180, nearestDistance + 24));
  const points = localEntries.flatMap((entry) => entry.points);
  if (points.length === 0) return undefined;
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  return {
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    width: Math.max(0.25, maxX - minX),
    height: Math.max(0.25, maxY - minY),
  };
}

const COUNTRY_RENDER_BOUNDS = new Map(COUNTRIES.flatMap((country) => {
  const bounds = countryRenderBounds(country.id);
  return bounds ? [[country.id, bounds] as const] : [];
}));

function flagTextureKey(nationId: string): string {
  return `${FLAG_TEXTURE_PREFIX}${nationId}`;
}

function labelPlacementOffsets(
  width: number,
  height: number,
  strategic: boolean,
  collisionProtected: boolean,
): RenderPoint[] {
  if (!strategic) return [{ x: 0, y: 0 }];
  const offsets: RenderPoint[] = [
    { x: 0, y: 0 },
    { x: 0, y: -height - 4 }, { x: 0, y: height + 4 },
    { x: -width * 0.56, y: 0 }, { x: width * 0.56, y: 0 },
    { x: -width * 0.56, y: -height - 4 }, { x: width * 0.56, y: -height - 4 },
    { x: -width * 0.56, y: height + 4 }, { x: width * 0.56, y: height + 4 },
    { x: 0, y: -2 * height - 8 }, { x: 0, y: 2 * height + 8 },
    { x: -width * 1.12, y: 0 }, { x: width * 1.12, y: 0 },
  ];
  if (!collisionProtected) return offsets;

  // Persistent strategic and active labels are not optional geography. Give
  // them a deterministic expanding search field so dense clusters can fan out
  // instead of losing a top-power, player, war or integration badge.
  const seen = new Set(offsets.map(({ x, y }) => `${Math.round(x)}:${Math.round(y)}`));
  const stepX = width + LABEL_COLLISION_GAP * 2;
  const stepY = height + LABEL_COLLISION_GAP * 2;
  const add = (x: number, y: number): void => {
    const key = `${Math.round(x)}:${Math.round(y)}`;
    if (seen.has(key)) return;
    seen.add(key);
    offsets.push({ x, y });
  };
  for (let ring = 1; ring <= 5; ring += 1) {
    for (let column = -ring; column <= ring; column += 1) {
      add(column * stepX, -ring * stepY);
      add(column * stepX, ring * stepY);
    }
    for (let row = -ring + 1; row < ring; row += 1) {
      add(-ring * stepX, row * stepY);
      add(ring * stepX, row * stepY);
    }
  }
  return offsets;
}

function rectanglesIntersect(left: RenderRectangle, right: RenderRectangle): boolean {
  return !(left.x + left.width < right.x
    || right.x + right.width < left.x
    || left.y + left.height < right.y
    || right.y + right.height < left.y);
}

function rectangleOverlapArea(left: RenderRectangle, right: RenderRectangle): number {
  const width = Math.max(0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
  const height = Math.max(0,
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
  return width * height;
}

export class WorldMapScene extends Phaser.Scene implements MapSceneAdapter {
  private visuals = new Map<string, TerritoryVisual>();
  private selection: MapSelectionState = { legalTargetIds: [] };
  private legalTargetIds = new Set<string>();
  private hintTargetIds = new Set<string>();
  private engine?: WorldMapEngineContract;
  private frontGraphics?: Phaser.GameObjects.Graphics;
  private operationGraphics?: Phaser.GameObjects.Graphics;
  private commanderRouteGraphics?: Phaser.GameObjects.Graphics;
  private commanderCoverageGraphics?: Phaser.GameObjects.Graphics;
  private neuralConvergenceGraphics?: Phaser.GameObjects.Graphics;
  private routeGraphics?: Phaser.GameObjects.Graphics;
  private graticuleGraphics?: Phaser.GameObjects.Graphics;
  private antarcticaLabel?: Phaser.GameObjects.Text;
  private logisticsGraphics?: Phaser.GameObjects.Graphics;
  private ownershipBoundaryGraphics?: Phaser.GameObjects.Graphics;
  private flagAtlas?: Phaser.Textures.CanvasTexture | null;
  private flagAtlasImage?: Phaser.GameObjects.Image;
  private intelligenceFogAtlas?: Phaser.Textures.CanvasTexture | null;
  private intelligenceFogImage?: Phaser.GameObjects.Image;
  private intelligenceFogNoiseCanvas?: HTMLCanvasElement;
  private readonly intelligenceFogTransition = createApexFogTransitionState();
  private intelligenceFogVisualBlend = 0;
  private intelligenceVisibility: ApexIntelligenceVisibility = {
    enabled: false,
    viewerId: '',
    chartedTerritoryIds: new Set(),
    clearTerritoryIds: new Set(),
    frontierTerritoryIds: new Set(),
    visibleTerritoryIds: new Set(),
    detectedRogueRouteKeys: new Set(),
    roguePrimeDetected: false,
    roguePrimeTrackedRemotely: false,
    detectedRoguePrimeTerritoryIds: new Set(),
    signature: '',
  };
  private flagAtlasOwnerSignature = '';
  private pointerDown?: { x: number; y: number; scrollX: number; scrollY: number };
  private dragged = false;
  private countryPointerHandled = false;
  private inputBlocked = false;
  private hoveredId?: string;
  private mapState?: MapStateSnapshot;
  private ownershipBoundarySegments: OwnershipBoundarySegment[] = [];
  private humanOwnedIds = new Set<string>();
  private humanOwnerIds = new Set<string>();
  private humanCapitalId?: string;
  private warTerritoryIds = new Set<string>();
  private activeFrontTerritoryIds = new Set<string>();
  private ownerTerritoryCounts = new Map<string, number>();
  private ownerLabelTerritoryIds = new Map<string, string>();
  private absorbedTerritoryIds = new Set<string>();
  private integratingTerritoryIds = new Set<string>();
  private fillSignatures = new Map<string, string>();
  private labelSignatures = new Map<string, string>();
  private strategicScores = new Map<string, number>();
  private ownerRanks = new Map<string, number>();
  private topPowerOwnerIds = new Set<string>();
  private ownerColors = new Map<string, number>();
  private movedTerritoryIds = new Set<string>();
  private activeHumanSourceIds = new Set<string>();
  private strongestHumanTerritoryIds = new Set<string>();
  private hostileOwnerPairs = new Set<string>();
  private neutralBoundarySegments: readonly OwnershipBoundarySegment[] = [];
  private threatenedBoundarySegments: readonly OwnershipBoundarySegment[] = [];
  private acuteBoundarySegments: readonly OwnershipBoundarySegment[] = [];
  private rogueBoundarySegments: readonly OwnershipBoundarySegment[] = [];
  private activeWarBoundarySegments: readonly OwnershipBoundarySegment[] = [];
  private frontRenderOperations: readonly FrontRenderOperation[] = [];
  private visibleLogisticsMovements: readonly GlobeVisibleLogisticsRoute[] = [];
  private readonly antarcticaTerritoryVisuals = new Map<string, AntarcticaTerritoryVisual>();
  private readonly antarcticaReadinessVisuals = new Map<string, AntarcticaReadinessVisual>();
  private readonly commanderForceVisuals = new Map<string, CommanderForceMapVisual>();
  private commanderCoverageEntries: readonly CommanderForceMapEntry[] = [];
  private commanderCoverageSignature = '';
  private commanderRouteSignature = '';
  private lastStrategicScoreTick = -Infinity;
  private lastTopologySignature = '';
  private lastOperationSignature = '';
  private lastLogisticsSignature = '';
  private lastForcePresentationSignature = '';
  private lastOpeningMobilisationSignature = '';
  private gatewayRoutePresentationSignature = '';
  private activeBattleEffects = 0;
  private readonly recentBattleEffectStarts = new Map<string, number>();
  private battleLabelRefresh?: Phaser.Time.TimerEvent;
  private combatAnimationElapsed = 0;
  private combatAnimationPhase = 0;
  private reducedCombatMotion = false;
  private readonly neuralPulseSample = createNeuralFieldPulseSample();
  private readonly neuralConvergencePathX = new Float32Array(NEURAL_CONVERGENCE_MAP_PATH_POINTS);
  private readonly neuralConvergencePathY = new Float32Array(NEURAL_CONVERGENCE_MAP_PATH_POINTS);
  private neuralPulseStartedAt = -Infinity;
  private neuralConvergencePointCount = 0;
  private neuralPulseVisualId?: string;
  private neuralPulseTargetId?: string;
  private neuralPulseAbility: NeuralFieldPulseResolution['ability'] = 'standard';
  private neuralPulseCounterpulseDamage = 0;
  private neuralPulseWasVisible = false;
  private zoomTarget = 1;
  private zoomAnchorScreen?: RenderPoint;
  private zoomAnchorWorld?: RenderPoint;

  constructor() {
    super({ key: 'WorldMapScene' });
  }

  preload(): void {
    // Exactly one sharp texture per nation. Territories only swap a cached
    // texture on conquest; no flag is generated, fetched or decoded per frame.
    const nationIds = new Set([
      ...COUNTRIES.map((country) => country.id),
      ...CUSTOM_FLAG_NATION_IDS,
    ]);
    for (const nationId of nationIds) {
      const asset = countryFlagAsset(nationId);
      if (!asset || this.textures.exists(flagTextureKey(nationId))) continue;
      if (asset.loader === 'svg') {
        this.load.svg(flagTextureKey(nationId), asset.url, {
          width: MAP_FLAG_TEXTURE_WIDTH,
          height: MAP_FLAG_TEXTURE_HEIGHT,
        });
      } else {
        this.load.image(flagTextureKey(nationId), asset.url);
      }
    }
  }

  create(): void {
    this.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
    this.cameras.main.setBackgroundColor('#081d29');
    this.drawOcean();
    this.flagAtlas = this.textures.createCanvas(
      'world-flag-atlas',
      MAP_WIDTH * FLAG_ATLAS_SCALE,
      MAP_HEIGHT * FLAG_ATLAS_SCALE,
    );
    this.flagAtlasImage = this.add.image(0, 0, 'world-flag-atlas')
      .setOrigin(0, 0)
      .setDisplaySize(MAP_WIDTH, MAP_HEIGHT)
      .setDepth(0.4);
    this.intelligenceFogAtlas = this.textures.createCanvas(
      'apex-intelligence-fog-atlas',
      MAP_WIDTH,
      MAP_HEIGHT,
    );
    this.intelligenceFogImage = this.add.image(0, 0, 'apex-intelligence-fog-atlas')
      .setOrigin(0, 0)
      .setDisplaySize(MAP_WIDTH, MAP_HEIGHT)
      .setDepth(1.4)
      .setVisible(false);
    this.intelligenceFogNoiseCanvas = this.createIntelligenceFogNoiseCanvas();
    this.routeGraphics = this.add.graphics().setDepth(-6);
    this.logisticsGraphics = this.add.graphics().setDepth(5.5);
    this.ownershipBoundaryGraphics = this.add.graphics().setDepth(2);
    this.frontGraphics = this.add.graphics().setDepth(6);
    this.operationGraphics = this.add.graphics().setDepth(6.2);
    // One immediate-mode layer paints complete supported-country silhouettes;
    // no polygon/node objects are created during sync or battle pulses.
    this.commanderCoverageGraphics = this.add.graphics().setDepth(6.35);
    this.commanderRouteGraphics = this.add.graphics().setDepth(9.2);
    // One reusable immediate-mode layer handles every finite APEX/PRIME
    // convergence pulse; battle ticks never create objects or particles.
    this.neuralConvergenceGraphics = this.add.graphics().setDepth(11.5);
    this.reducedCombatMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.buildOwnershipBoundarySegments();
    this.createCountries();
    this.createAntarcticaTerritories();
    this.createAntarcticaReadinessNodes();
    this.configureCamera();
    this.refreshZoomDetails();
    mapBridge.attach(this);
    // When the adapter is already present, attach() materialises the live atlas.
    // Only paint the neutral opening ownership when the engine has not attached yet.
    if (!this.mapState) this.redrawFlagAtlas();
  }

  private createIntelligenceFogNoiseCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 48;
    const context = canvas.getContext('2d');
    if (!context) return canvas;
    const image = context.createImageData(canvas.width, canvas.height);
    let seed = 0x41504558;
    for (let offset = 0; offset < image.data.length; offset += 4) {
      seed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      seed ^= seed + Math.imul(seed ^ (seed >>> 7), 61 | seed);
      const noise = ((seed ^ (seed >>> 14)) >>> 0) / 0xffff_ffff;
      image.data[offset] = 42;
      image.data[offset + 1] = 79;
      image.data[offset + 2] = 98;
      image.data[offset + 3] = Math.round(10 + noise * 36);
    }
    context.putImageData(image, 0, 0);
    return canvas;
  }

  /** One topology-cached 2D veil; borders stay above it at depth 2. */
  private redrawApexIntelligenceFog(): void {
    const atlas = this.intelligenceFogAtlas;
    const image = this.intelligenceFogImage;
    if (!atlas || !image) return;
    const context = atlas.context;
    context.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    image.setVisible(this.intelligenceVisibility.enabled)
      .setAlpha(this.intelligenceFogVisualBlend);
    if (!this.intelligenceVisibility.enabled) {
      atlas.refresh();
      return;
    }
    const noisePattern = this.intelligenceFogNoiseCanvas
      ? context.createPattern(this.intelligenceFogNoiseCanvas, 'repeat')
      : null;
    const drawRings = (
      rings: readonly (readonly RenderPoint[])[],
      territoryId: string,
      ownerId: string | undefined,
    ): void => {
      const presentation = apexFogTerritoryPresentation(
        this.intelligenceVisibility,
        territoryId,
        ownerId,
      );
      for (const ring of rings) {
        if (ring.length < 3) continue;
        context.beginPath();
        context.moveTo(ring[0]!.x, ring[0]!.y);
        for (let index = 1; index < ring.length; index += 1) {
          context.lineTo(ring[index]!.x, ring[index]!.y);
        }
        context.closePath();
        context.save();
        context.fillStyle = `#${presentation.fill.toString(16).padStart(6, '0')}`;
        context.globalAlpha = presentation.alpha;
        context.shadowColor = presentation.rogueOccupied
          ? 'rgba(92, 12, 54, 0.58)' : 'rgba(3, 16, 27, 0.78)';
        context.shadowBlur = APEX_INTELLIGENCE_FOG_STYLE.featherPixels;
        context.fill();
        context.restore();
        if (!noisePattern) continue;
        context.save();
        context.clip();
        context.globalAlpha = presentation.cloudAlpha;
        context.fillStyle = noisePattern;
        context.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
        context.restore();
      }
    };
    for (const country of COUNTRIES) {
      if (apexTerritoryMapClear(this.intelligenceVisibility, country.id)) continue;
      drawRings(
        RENDER_RINGS.get(country.id) ?? [],
        country.id,
        this.mapState?.territories[country.id]?.ownerId,
      );
    }
    for (const sector of ANTARCTICA_SECTOR_PRESENTATIONS) {
      if (apexTerritoryMapClear(this.intelligenceVisibility, sector.id)) continue;
      drawRings(
        sector.mapRings.map((ring) => ring.map(([x, y]) => ({ x, y }))),
        sector.id,
        this.mapState?.territories[sector.id]?.ownerId,
      );
    }
    atlas.refresh();
  }

  /** Acknowledgement activates intel limits and the one shared veil together. */
  private updateApexFogVisualBlend(nowMs: number): void {
    const engine = this.engine;
    const image = this.intelligenceFogImage;
    if (!engine || !image) return;
    this.intelligenceFogVisualBlend = sampleApexFogVisualBlend(
      this.intelligenceFogTransition,
      this.intelligenceVisibility.enabled,
      engine.viewerKnowledge?.communicationsBlackoutTick,
      engine.state.tick,
      nowMs,
      this.reducedCombatMotion,
      engine.viewerKnowledge?.communicationsBlackoutAnimateActivation === true,
    );
    image.setVisible(this.intelligenceVisibility.enabled)
      .setAlpha(this.intelligenceFogVisualBlend);
  }

  private drawOcean(): void {
    const backdrop = this.add.graphics().setDepth(-21);
    backdrop.fillStyle(0x081d29, 1);
    backdrop.fillRect(-MAP_WIDTH, -MAP_HEIGHT, MAP_WIDTH * 3, MAP_HEIGHT * 3);
    const sea = this.add.graphics().setDepth(-20);
    sea.fillGradientStyle(0x071521, 0x071521, 0x0a2432, 0x0a2432, 1);
    sea.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    this.graticuleGraphics = this.add.graphics().setDepth(-19);
    this.drawGraticule();
    this.drawAntarctica();
  }

  private drawAntarctica(): void {
    const points = ANTARCTICA_MAP_SILHOUETTE.flatMap(([x, y]) => [x, y]);
    this.add.polygon(0, 0, points, 0xc3dce0, 0.50)
      .setOrigin(0, 0)
      .setDepth(-18.5)
      .setStrokeStyle(1.25, 0xebf7f8, 0.58);
    const shelf = ANTARCTICA_ICE_SHELF.flatMap(([x, y]) => [x, y]);
    this.add.polygon(0, 0, shelf, 0xe3f1f3, 0.18)
      .setOrigin(0, 0)
      .setDepth(-18.35)
      .setStrokeStyle(0.75, 0xf3fbfc, 0.24);
    this.antarcticaLabel = this.add.text(MAP_WIDTH / 2, MAP_HEIGHT - 38, 'A N T A R C T I C A', {
      fontFamily: 'Inter, system-ui, sans-serif', fontSize: '10px', fontStyle: 'italic',
      color: '#d3e7ea', letterSpacing: 2.8,
    }).setOrigin(0.5).setDepth(-17).setAlpha(0.34).setResolution(LABEL_TEXT_RESOLUTION);
  }

  private refreshAntarcticaLabel(): void {
    const zoom = this.cameras.main.zoom;
    if (this.antarcticaLabel) {
      const fade = Phaser.Math.Clamp((1.95 - zoom) / 0.55, 0, 1);
      this.antarcticaLabel.setVisible(fade > 0).setAlpha(0.30 * fade)
        .setScale(Phaser.Math.Clamp(1 / Math.max(zoom, 0.01), 0.5, 1.1));
    }
  }

  private drawGraticule(): void {
    const grid = this.graticuleGraphics;
    if (!grid) return;
    grid.clear();
    grid.lineStyle(this.screenWorldSize(1), 0x4c94aa, 0.11);
    for (let longitude = -150; longitude <= 150; longitude += 30) {
      const top = projectWorldPoint(longitude, 84);
      const bottom = projectWorldPoint(longitude, -58);
      grid.lineBetween(top.x, top.y, bottom.x, bottom.y);
    }
    for (let latitude = -45; latitude <= 75; latitude += 15) {
      const left = projectWorldPoint(-180, latitude);
      const right = projectWorldPoint(180, latitude);
      grid.lineBetween(left.x, left.y, right.x, right.y);
    }
  }

  private buildOwnershipBoundarySegments(): void {
    const segments = new Map<string, {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      territoryIds: Set<string>;
    }>();
    const pointKey = (longitude: number, latitude: number) => `${Math.round(longitude * 100_000)},${Math.round(latitude * 100_000)}`;
    const presentations: readonly {
      readonly id: string;
      readonly rings: readonly (readonly (readonly [number, number])[])[];
    }[] = [
      ...COUNTRIES.map((country) => ({
        id: country.id,
        rings: country.rings.map((ring) => ring.map(([longitude, latitude]) => {
          const point = projectWorldPoint(longitude, latitude);
          return [point.x, point.y] as const;
        })),
      })),
      ...ANTARCTICA_SECTOR_PRESENTATIONS.map((sector) => ({
        id: sector.id,
        rings: sector.mapRings,
      })),
    ];
    for (const presentation of presentations) {
      for (const ring of presentation.rings) {
        for (let index = 0; index < ring.length; index += 1) {
          const start = ring[index]!;
          const end = ring[(index + 1) % ring.length]!;
          const startKey = pointKey(start[0], start[1]);
          const endKey = pointKey(end[0], end[1]);
          if (startKey === endKey) continue;
          const key = startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`;
          let segment = segments.get(key);
          if (!segment) {
            segment = { x1: start[0], y1: start[1], x2: end[0], y2: end[1], territoryIds: new Set() };
            segments.set(key, segment);
          }
          segment.territoryIds.add(presentation.id);
        }
      }
    }
    this.ownershipBoundarySegments = [...segments.values()]
      .filter((segment) => segment.territoryIds.size > 1)
      .map((segment) => ({
        x1: segment.x1,
        y1: segment.y1,
        x2: segment.x2,
        y2: segment.y2,
        territoryIds: [...segment.territoryIds],
      }));
  }

  private rebuildTopologyPresentation(state: MapStateSnapshot): void {
    const neutral: OwnershipBoundarySegment[] = [];
    const threatened: OwnershipBoundarySegment[] = [];
    const acute: OwnershipBoundarySegment[] = [];
    const rogue: OwnershipBoundarySegment[] = [];
    const activeWar: OwnershipBoundarySegment[] = [];
    this.hostileOwnerPairs = new Set(state.wars
      .filter((war) => (
        war.attackerId === state.humanPlayerId || war.defenderId === state.humanPlayerId
      ))
      .map((war) => mapOwnerPairKey(war.attackerId, war.defenderId)));
    for (const segment of this.ownershipBoundarySegments) {
      if (segment.territoryIds.length === 1) continue;
      neutral.push(segment);
      const kind = strategicBorderKind(
        segment.territoryIds,
        state.territories,
        state.humanPlayerId,
        this.hostileOwnerPairs,
      );
      if (kind === 'threatened') threatened.push(segment);
      else if (kind === 'acute') acute.push(segment);
      else if (kind === 'rogue') rogue.push(segment);
      else if (kind === 'active-war') activeWar.push(segment);
    }
    this.neutralBoundarySegments = neutral;
    this.threatenedBoundarySegments = threatened;
    this.acuteBoundarySegments = acute;
    this.rogueBoundarySegments = rogue;
    this.activeWarBoundarySegments = activeWar;
  }

  private drawOwnershipPerimeters(): void {
    const graphics = this.ownershipBoundaryGraphics;
    if (!graphics) return;
    graphics.clear();
    const draw = (segmentsToDraw: readonly OwnershipBoundarySegment[], width: number, color: number, alpha: number) => {
      graphics.lineStyle(this.screenWorldSize(width), color, alpha);
      for (const segment of segmentsToDraw) this.drawWrappedLine(graphics, segment.x1, segment.y1, segment.x2, segment.y2);
    };
    draw(this.neutralBoundarySegments, WORLD_MAP_BORDER_STYLE.neutral.width,
      WORLD_MAP_BORDER_STYLE.neutral.color, WORLD_MAP_BORDER_STYLE.neutral.alpha);
    draw(this.threatenedBoundarySegments, WORLD_MAP_BORDER_STYLE.threatened.width,
      WORLD_MAP_BORDER_STYLE.threatened.color, WORLD_MAP_BORDER_STYLE.threatened.alpha);
    draw(this.acuteBoundarySegments, WORLD_MAP_BORDER_STYLE.acute.width,
      WORLD_MAP_BORDER_STYLE.acute.color, WORLD_MAP_BORDER_STYLE.acute.alpha);
    draw(this.rogueBoundarySegments, WORLD_MAP_BORDER_STYLE.rogue.width,
      WORLD_MAP_BORDER_STYLE.rogue.color, WORLD_MAP_BORDER_STYLE.rogue.alpha);
    draw(this.activeWarBoundarySegments, WORLD_MAP_BORDER_STYLE.activeWar.width,
      WORLD_MAP_BORDER_STYLE.activeWar.color, WORLD_MAP_BORDER_STYLE.activeWar.alpha);
    const hintedBoundarySegments = this.ownershipBoundarySegments.filter((segment) => {
      const hintedCount = segment.territoryIds.reduce((count, territoryId) => (
        count + (this.hintTargetIds.has(territoryId) ? 1 : 0)
      ), 0);
      return hintedCount > 0 && (segment.territoryIds.length === 1
        || hintedCount < segment.territoryIds.length);
    });
    draw(hintedBoundarySegments, 0.85, 0x79e3ff, 0.30);
  }

  private createCountries(): void {
    for (const country of COUNTRIES) {
      const parts: Phaser.GameObjects.Polygon[] = [];
      for (const ring of RENDER_RINGS.get(country.id) ?? []) {
        const points = ring.flatMap((point) => [point.x, point.y]);
        if (points.length < 6) continue;
        const part = this.add.polygon(0, 0, points, 0x0d1a22, 0.18)
          .setOrigin(0, 0)
          .setDepth(0.8)
          .setStrokeStyle(0.75, 0xb8d0d7, 0.32);
        part.setInteractive(new Phaser.Geom.Polygon(points), Phaser.Geom.Polygon.Contains);
        part.input!.cursor = 'pointer';
        part.on('pointerover', (pointer: Phaser.Input.Pointer) => this.hoverCountry(country.id, pointer));
        part.on('pointermove', (pointer: Phaser.Input.Pointer) => this.hoverCountry(country.id, pointer));
        part.on('pointerout', () => this.unhoverCountry(country.id));
        part.on('pointerup', () => {
          this.countryPointerHandled = true;
          if (!this.inputBlocked && !this.dragged
            && apexTerritoryIntelVisible(this.intelligenceVisibility, country.id)) {
            mapBridge.onTerritoryClick?.(country.id);
          }
        });
        parts.push(part);
      }

      const territory = TERRITORY_BY_ID[country.id]!;
      const labelAnchor = countryPresentationAnchor(country.id) ?? territory;
      const hud = this.add.container(labelAnchor.x, labelAnchor.y).setDepth(8);
      const panel = this.add.rectangle(0, 0, 76, 24, 0x04111b, 0.95)
        .setStrokeStyle(1, 0xc4e1e8, 0.78);
      const name = this.add.text(0, 0, country.englishName.toUpperCase(), {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: `${LABEL_NAME_SIZE}px`, fontStyle: '700', color: '#ffffff', letterSpacing: 0.3, align: 'center',
      }).setOrigin(0.5).setStroke('#01070b', 3).setResolution(LABEL_TEXT_RESOLUTION);
      const detail = this.add.text(0, 8, country.code, {
        fontFamily: 'Inter, system-ui, sans-serif', fontSize: `${LABEL_DETAIL_SIZE}px`, fontStyle: '700', color: '#d9f5fa', letterSpacing: 0.25,
      }).setOrigin(0.5).setStroke('#01070b', 2.5).setResolution(LABEL_TEXT_RESOLUTION).setVisible(false);
      const openingMobilisation = this.add.text(0, 11, '', {
        fontFamily: 'Inter, system-ui, sans-serif', fontSize: '11px', fontStyle: '700', color: '#cbbfff', letterSpacing: 0.35,
      }).setOrigin(0.5).setStroke('#01070b', 2).setResolution(LABEL_TEXT_RESOLUTION).setVisible(false);
      const openingMobilisationBarBack = this.add.rectangle(0, 17, 48, 2, 0x182031, 0.96)
        .setOrigin(0, 0.5).setVisible(false);
      const openingMobilisationBarFill = this.add.rectangle(0, 17, 0, 2, 0xb5a7ff, 0.96)
        .setOrigin(0, 0.5).setVisible(false);
      const localForce = this.add.text(territory.x, territory.y, '', {
        fontFamily: 'Inter, system-ui, sans-serif', fontSize: '11px', fontStyle: '700', color: '#b9f8ff',
        backgroundColor: '#04111bd9', padding: { x: 4, y: 2 },
      }).setOrigin(0.5).setStroke('#01070b', 1.5).setResolution(LABEL_TEXT_RESOLUTION).setDepth(7).setVisible(false);
      const localForceBarBack = this.add.rectangle(territory.x, territory.y, 34, 3, 0x071016, 0.88)
        .setOrigin(0, 0.5).setDepth(7).setVisible(false);
      const localForceBarFill = this.add.rectangle(territory.x, territory.y, 34, 3, 0x58d68d, 0.92)
        .setOrigin(0, 0.5).setDepth(7.1).setVisible(false);
      hud.add([
        panel,
        name,
        detail,
        openingMobilisationBarBack,
        openingMobilisationBarFill,
        openingMobilisation,
      ]);
      hud.setInteractive(new Phaser.Geom.Rectangle(-70, -18, 140, 36), Phaser.Geom.Rectangle.Contains);
      hud.input!.cursor = 'pointer';
      hud.on('pointerover', (pointer: Phaser.Input.Pointer) => this.hoverCountry(country.id, pointer));
      hud.on('pointermove', (pointer: Phaser.Input.Pointer) => this.hoverCountry(country.id, pointer));
      hud.on('pointerout', () => this.unhoverCountry(country.id));
      hud.on('pointerup', () => {
        this.countryPointerHandled = true;
        if (!this.inputBlocked && !this.dragged
          && apexTerritoryIntelVisible(this.intelligenceVisibility, country.id)) {
          mapBridge.onTerritoryClick?.(country.id);
        }
      });
      this.visuals.set(country.id, {
        parts, hud, panel, name, detail,
        openingMobilisation, openingMobilisationBarBack, openingMobilisationBarFill,
        localForce, localForceBarBack, localForceBarFill,
        openingMobilisationActive: false, openingMobilisationRemaining: 0,
        localForceText: '', localForceFill: -1, localForceFillColor: -1,
      });
    }
  }

  private createAntarcticaTerritories(): void {
    for (const sector of ANTARCTICA_SECTOR_PRESENTATIONS) {
      const parts: Phaser.GameObjects.Polygon[] = [];
      for (const ring of sector.mapRings) {
        const points = ring.flatMap(([x, y]) => [x, y]);
        if (points.length < 6) continue;
        const part = this.add.polygon(0, 0, points, 0x4d8793, 0.06)
          .setOrigin(0, 0)
          .setDepth(0.8)
          .setStrokeStyle(0.85, 0xb8e5ea, 0.62)
          .setVisible(false);
        part.setInteractive(new Phaser.Geom.Polygon(points), Phaser.Geom.Polygon.Contains);
        part.input!.cursor = 'pointer';
        part.on('pointerover', (pointer: Phaser.Input.Pointer) => (
          this.hoverAntarcticaTerritory(sector.id, pointer)
        ));
        part.on('pointermove', (pointer: Phaser.Input.Pointer) => (
          this.hoverAntarcticaTerritory(sector.id, pointer)
        ));
        part.on('pointerout', () => this.unhoverAntarcticaTerritory(sector.id));
        part.on('pointerup', () => {
          this.countryPointerHandled = true;
          if (!this.inputBlocked && !this.dragged
            && apexTerritoryIntelVisible(this.intelligenceVisibility, sector.id)) {
            mapBridge.onPolarSectorClick?.(sector.id);
          }
        });
        parts.push(part);
      }
      this.antarcticaTerritoryVisuals.set(sector.id, { parts });
    }
  }

  private createAntarcticaReadinessNodes(): void {
    for (const sector of ANTARCTICA_SECTOR_PRESENTATIONS) {
      const [x, y] = projectAntarcticaMapPoint(sector.longitude, sector.latitude);
      const power = this.add.text(x, y - 8, '', {
        fontFamily: 'Inter, system-ui, sans-serif', fontSize: '11px', fontStyle: '700',
        color: '#ffd1cd', align: 'center', lineSpacing: 1,
      }).setOrigin(0.5).setStroke('#071116', 2)
        .setResolution(LABEL_TEXT_RESOLUTION).setDepth(7.2).setVisible(false);
      const barBack = this.add.rectangle(x - 11, y, 22, 3, 0x19090c, 0.94)
        .setOrigin(0, 0.5).setDepth(7).setVisible(false);
      const barFill = this.add.rectangle(x - 11, y, 22, 3, 0xff736d, 0.96)
        .setOrigin(0, 0.5).setDepth(7.1).setVisible(false);
      this.antarcticaReadinessVisuals.set(sector.id, { power, barBack, barFill });
    }
  }

  /**
   * Draws every land part of each stationary supported territory into one
   * shared Graphics layer. The low-density clipped-by-construction web keeps
   * the full silhouette readable without per-country/node display objects.
   */
  private drawCommanderTerritoryCoverage(
    entries: readonly CommanderForceMapEntry[] = this.commanderCoverageEntries,
    forceRedraw = false,
  ): void {
    const graphics = this.commanderCoverageGraphics;
    if (!graphics) return;
    this.commanderCoverageEntries = entries;
    const signature = neuralFieldCoverageGeometrySignature(entries);
    if (!forceRedraw && signature === this.commanderCoverageSignature) return;
    this.commanderCoverageSignature = signature;
    graphics.clear();
    graphics.setBlendMode(Phaser.BlendModes.ADD);
    let paintedParts = 0;
    let curvedArchCount = 0;
    for (const entry of entries) {
      const mode = neuralFieldModePresentation(
        entry.moving,
        entry.recovering,
        entry.fieldOperational,
      );
      if (!mode.fieldVisible) continue;
      const fieldIntensity = mode.intensity * entry.fieldIntensity;
      const style = entry.role === 'rogue-prime'
        ? STRATEGIC_NEURAL_FIELD_STYLE.roguePrime
        : STRATEGIC_NEURAL_FIELD_STYLE.apex;
      const rings = NEURAL_FIELD_MAP_RINGS.get(entry.force.locationId) ?? [];
      for (const ring of rings) {
        if (ring.length < 3) continue;
        graphics.fillStyle(
          style.fieldColor,
          Math.min(0.28, style.fieldOpacity * 1.28 * fieldIntensity),
        );
        graphics.beginPath();
        graphics.moveTo(ring[0]!.x, ring[0]!.y);
        for (let index = 1; index < ring.length; index += 1) {
          graphics.lineTo(ring[index]!.x, ring[index]!.y);
        }
        graphics.closePath();
        graphics.fillPath();

        // A compact deterministic mesh spans the whole part: boundary samples
        // connect through mid-nodes instead of drawing a point-local icon.
        let centerX = 0;
        let centerY = 0;
        for (const point of ring) {
          centerX += point.x;
          centerY += point.y;
        }
        centerX /= ring.length;
        centerY /= ring.length;
        const nodeCount = Phaser.Math.Clamp(Math.round(Math.sqrt(ring.length) * 1.45), 5, 18);
        const midNodes: RenderPoint[] = [];
        for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex += 1) {
          const boundary = ring[Math.floor(nodeIndex / nodeCount * ring.length)]!;
          midNodes.push({
            x: Phaser.Math.Linear(centerX, boundary.x, 0.64),
            y: Phaser.Math.Linear(centerY, boundary.y, 0.64),
          });
        }
        graphics.lineStyle(
          this.screenWorldSize(0.72),
          style.fieldColor,
          style.networkOpacity * 0.76 * fieldIntensity,
        );
        for (let nodeIndex = 0; nodeIndex < midNodes.length; nodeIndex += 1) {
          const node = midNodes[nodeIndex]!;
          const next = midNodes[(nodeIndex + 1) % midNodes.length]!;
          const skip = midNodes[(nodeIndex + 2) % midNodes.length]!;
          graphics.lineBetween(centerX, centerY, node.x, node.y);
          graphics.lineBetween(node.x, node.y, next.x, next.y);
          if (nodeIndex % 2 === 0) graphics.lineBetween(node.x, node.y, skip.x, skip.y);
        }
        // Screen-space quadratic ribs suggest the raised 3D shell in the flat
        // renderer without allocating one display object per territory/node.
        let extent = 0;
        for (const node of midNodes) {
          extent = Math.max(extent, Math.hypot(node.x - centerX, node.y - centerY));
        }
        const archLift = Phaser.Math.Clamp(
          extent * 0.24,
          this.screenWorldSize(3.5),
          this.screenWorldSize(17),
        );
        const archCount = Math.min(4, Math.floor(midNodes.length / 2));
        graphics.lineStyle(
          this.screenWorldSize(0.8),
          style.nodeColor,
          style.networkOpacity * 0.52 * fieldIntensity,
        );
        for (let archIndex = 0; archIndex < archCount; archIndex += 1) {
          const start = midNodes[archIndex]!;
          const end = midNodes[(archIndex + Math.floor(midNodes.length / 2)) % midNodes.length]!;
          let previousX = start.x;
          let previousY = start.y;
          for (let step = 1; step <= 6; step += 1) {
            const progress = step / 6;
            const inverse = 1 - progress;
            const x = inverse * inverse * start.x
              + 2 * inverse * progress * centerX + progress * progress * end.x;
            const y = inverse * inverse * start.y
              + 2 * inverse * progress * (centerY - archLift) + progress * progress * end.y;
            graphics.lineBetween(previousX, previousY, x, y);
            previousX = x;
            previousY = y;
          }
          curvedArchCount += 1;
        }
        const nodeSize = this.screenWorldSize(1.35);
        graphics.fillStyle(style.nodeColor, 0.90 * fieldIntensity);
        for (let nodeIndex = 0; nodeIndex < midNodes.length; nodeIndex += 1) {
          const node = midNodes[nodeIndex]!;
          const size = nodeIndex % 4 === 0 ? nodeSize * 1.34 : nodeSize;
          graphics.fillTriangle(node.x, node.y - size, node.x + size, node.y, node.x, node.y + size);
          graphics.fillTriangle(node.x, node.y - size, node.x - size, node.y, node.x, node.y + size);
        }
        graphics.fillTriangle(
          centerX, centerY - nodeSize * 1.7,
          centerX + nodeSize * 1.7, centerY,
          centerX, centerY + nodeSize * 1.7,
        );
        graphics.fillTriangle(
          centerX, centerY - nodeSize * 1.7,
          centerX - nodeSize * 1.7, centerY,
          centerX, centerY + nodeSize * 1.7,
        );

        graphics.lineStyle(
          this.screenWorldSize(1.25),
          style.nodeColor,
          0.86 * fieldIntensity,
        );
        graphics.beginPath();
        graphics.moveTo(ring[0]!.x, ring[0]!.y);
        for (let index = 1; index < ring.length; index += 1) {
          graphics.lineTo(ring[index]!.x, ring[index]!.y);
        }
        graphics.closePath();
        graphics.strokePath();
        paintedParts += 1;
      }
    }
    graphics.setVisible(paintedParts > 0).setAlpha(0.94);
    if (this.game?.canvas) {
      this.game.canvas.dataset.neuralFieldCount = String(
        entries.filter((entry) => neuralFieldModePresentation(
          entry.moving,
          entry.recovering,
          entry.fieldOperational,
        ).fieldVisible).length,
      );
      this.game.canvas.dataset.neuralFieldParts = String(paintedParts);
      this.game.canvas.dataset.neuralFieldCurvedArches = String(curvedArchCount);
      this.game.canvas.dataset.apexProjectionCount = String(
        Math.min(2, entries.filter((entry) => entry.role === 'apex').length),
      );
    }
  }

  /** Collapsed transit core only; no stationary sprite, disc, halo or bobbing. */
  private drawCommanderNeuralField(
    graphics: Phaser.GameObjects.Graphics,
    role: 'apex' | 'rogue-prime',
  ): void {
    const style = role === 'rogue-prime'
      ? STRATEGIC_NEURAL_FIELD_STYLE.roguePrime
      : STRATEGIC_NEURAL_FIELD_STYLE.apex;
    graphics.clear();
    graphics.fillStyle(style.fieldColor, style.fieldOpacity);
    graphics.fillTriangle(-28, 4, -17, -8, 0, -13);
    graphics.fillTriangle(-28, 4, 0, -13, 19, -8);
    graphics.fillTriangle(-28, 4, 19, -8, 27, 4);
    graphics.fillTriangle(-28, 4, 27, 4, 15, 12);
    graphics.fillTriangle(-28, 4, 15, 12, -12, 11);
    graphics.lineStyle(1.15, style.fieldColor, style.networkOpacity);
    graphics.lineBetween(-23, 3, -10, -5);
    graphics.lineBetween(-10, -5, 1, 1);
    graphics.lineBetween(1, 1, 15, -5);
    graphics.lineBetween(1, 1, 11, 8);
    graphics.lineBetween(1, 1, -12, 8);
    graphics.lineBetween(-12, 8, -23, 3);
    const nodes = [[-23, 3], [-10, -5], [1, 1], [15, -5], [11, 8], [-12, 8]] as const;
    for (const [x, y] of nodes) {
      const size = x === 1 ? 2.5 : 1.7;
      graphics.fillStyle(style.nodeColor, x === 1 ? 0.94 : 0.76);
      graphics.fillTriangle(x, y - size, x + size, y, x, y + size);
      graphics.fillTriangle(x, y - size, x - size, y, x, y + size);
    }
  }

  private createCommanderForceVisual(
    _playerId: string,
    role: 'apex' | 'rogue-prime',
  ): CommanderForceMapVisual {
    const container = this.add.container(0, 0).setDepth(10.5);
    const hostilePrime = role === 'rogue-prime';
    const field = this.add.graphics();
    this.drawCommanderNeuralField(field, role);
    const signal = this.add.text(0, 17, hostilePrime ? 'PRIME' : 'APEX', {
      fontFamily: 'Inter, system-ui, sans-serif', fontSize: '11px', fontStyle: '800',
      color: hostilePrime ? '#ff88c9' : '#9af5ff', letterSpacing: 0.45,
    }).setOrigin(0.5).setStroke('#020712', 2).setResolution(LABEL_TEXT_RESOLUTION);
    container.add([field, signal]);
    return {
      role,
      container,
      field,
      signal,
      projection: 'primary',
      moving: false,
      recovering: false,
      fieldOperational: true,
      fieldIntensity: 1,
      combatActive: false,
      frontTargetId: null,
      coverageTerritoryId: '',
      coverageBoundaryWorldRadius: 8,
    };
  }

  private syncCommanderForceVisuals(engine: WorldMapEngineContract): void {
    const forces = engine.state.commanderForces ?? {};
    const viewerForce = apexFieldPresentationActive(engine)
      ? forces[engine.state.humanPlayerId]
      : undefined;
    const primeState = engine.state.polarEndgame?.roguePrime;
    const primePresentation = roguePrimeMapPresentation(
      primeState,
      engine.state.tick,
      this.intelligenceVisibility,
    );
    const entries: CommanderForceMapEntry[] = [];
    if (viewerForce) {
      const recovering = mapCommanderRecoveryLifecycleActive(viewerForce);
      const projections = apexProjectionPresentations(viewerForce);
      for (const projection of projections) {
        const secondary = projection.projection === 'secondary';
        const projectionForce: MapCommanderForceState = secondary ? {
          ...viewerForce,
          locationId: projection.locationId,
          mission: viewerForce.doctrineRuntime?.secondaryProjection?.mission
            ?? 'defense',
          front: projection.frontTargetId,
          transit: null,
        } : viewerForce;
        entries.push({
          id: secondary
            ? `${engine.state.humanPlayerId}:twin`
            : engine.state.humanPlayerId,
          role: 'apex',
          force: projectionForce,
          projection: projection.projection,
          tether: secondary,
          routePath: secondary
            ? [viewerForce.locationId, projection.locationId]
            : viewerForce.transit?.path ?? [viewerForce.locationId],
          routeProgress: secondary
            ? 1 : mapCommanderTransitProgress(viewerForce, engine.state.tick),
          routeVisible: secondary || Boolean(viewerForce.transit),
          moving: secondary ? false : Boolean(viewerForce.transit),
          recovering,
          fieldOperational: true,
          fieldIntensity: projection.integrity * projection.combatShare,
          combatActive: Boolean(projection.frontTargetId),
        });
      }
    }
    if (primeState?.force && primePresentation.visible) entries.push({
      id: ROGUE_PRIME_RENDER_ID,
      role: 'rogue-prime',
      force: primeState.force,
      projection: 'primary',
      tether: false,
      routePath: primePresentation.routePath,
      routeProgress: primePresentation.routeProgress,
      routeVisible: primePresentation.routeVisible,
      moving: primePresentation.moving,
      recovering: primeState.status === 'rebuilding',
      fieldOperational: true,
      fieldIntensity: 1,
      combatActive: primePresentation.combatActive,
    });
    const livePlayerIds = new Set(entries.map((entry) => entry.id));
    for (const [playerId, visual] of this.commanderForceVisuals) {
      if (livePlayerIds.has(playerId)) continue;
      visual.container.destroy(true);
      this.commanderForceVisuals.delete(playerId);
    }
    for (const entry of entries) {
      const { id: playerId, role, force } = entry;
      const point = commanderMapPresentationPoint(
        force,
        engine.state.tick,
        entry.routePath,
        entry.routeProgress,
      );
      if (!point) continue;
      let visual = this.commanderForceVisuals.get(playerId);
      if (!visual) {
        visual = this.createCommanderForceVisual(playerId, role);
        this.commanderForceVisuals.set(playerId, visual);
      }
      visual.container.setPosition(point.x, point.y);
      visual.projection = entry.projection;
      visual.moving = entry.moving;
      visual.recovering = entry.recovering;
      visual.fieldOperational = entry.fieldOperational;
      visual.fieldIntensity = entry.fieldIntensity;
      visual.combatActive = entry.combatActive;
      visual.frontTargetId = force.front;
      if (visual.coverageTerritoryId !== force.locationId) {
        visual.coverageTerritoryId = force.locationId;
        visual.coverageBoundaryWorldRadius = mapNeuralFieldBoundaryRadius(force.locationId);
      }
      const mode = neuralFieldModePresentation(
        visual.moving,
        visual.recovering,
        visual.fieldOperational,
      );
      visual.field
        .setVisible(mode.signalNodeVisible)
        .setScale(0.18)
        .setAlpha(mode.intensity * visual.fieldIntensity);
      visual.signal.setVisible(false);
      visual.container.setVisible(mode.signalNodeVisible);
    }
    this.drawCommanderTerritoryCoverage(entries);
    this.drawCommanderRoutes(entries);
  }

  /** One shared Graphics object for the one viewer APEX path and detected PRIME lane. */
  private drawCommanderRoutes(
    entries: readonly CommanderForceMapEntry[],
    forceRedraw = false,
  ): void {
    const graphics = this.commanderRouteGraphics;
    if (!graphics) return;
    const signature = neuralFieldRouteGeometrySignature(entries);
    if (!forceRedraw && signature === this.commanderRouteSignature) return;
    this.commanderRouteSignature = signature;
    graphics.clear();
    for (const entry of entries) {
      if (!entry.routeVisible || entry.routePath.length < 2) continue;
      const hostilePrime = entry.role === 'rogue-prime';
      const twinTether = entry.tether;
      graphics.lineStyle(
        this.combatWorldSize(twinTether ? 0.82 : hostilePrime ? 1.2 : 1.35),
        hostilePrime
          ? STRATEGIC_NEURAL_FIELD_STYLE.roguePrime.fieldColor
          : STRATEGIC_NEURAL_FIELD_STYLE.apex.fieldColor,
        twinTether ? 0.34 : hostilePrime
          ? STRATEGIC_NEURAL_FIELD_STYLE.roguePrime.routeOpacity
          : STRATEGIC_NEURAL_FIELD_STYLE.apex.routeOpacity,
      );
      for (let legIndex = 0; legIndex < entry.routePath.length - 1; legIndex += 1) {
        const source = mapPresentationPoint(entry.routePath[legIndex]!);
        const target = mapPresentationPoint(entry.routePath[legIndex + 1]!);
        if (!source || !target) continue;
        let targetX = target.x;
        if (Math.abs(targetX - source.x) > MAP_WIDTH / 2) {
          targetX += targetX > source.x ? -MAP_WIDTH : MAP_WIDTH;
        }
        const access: CombatAccessPresentation = hostilePrime
          || isSeaConnection(entry.routePath[legIndex]!, entry.routePath[legIndex + 1]!)
          ? 'naval' : 'land';
        const samples = sampleCombatRoute(
          source,
          { x: targetX, y: target.y },
          access,
          hostilePrime ? 1 : countrySeaRouteBendDirection(
            entry.routePath[legIndex]!,
            entry.routePath[legIndex + 1]!,
          ),
          hostilePrime ? 28 : twinTether ? 32 : 20,
        );
        for (let index = 1; index < samples.length; index += 1) {
          if (index % (hostilePrime ? 5 : twinTether ? 6 : 4) >= (twinTether ? 1 : 2)) continue;
          this.drawWrappedLine(
            graphics,
            this.normalizedWorldX(samples[index - 1]!.x),
            samples[index - 1]!.y,
            this.normalizedWorldX(samples[index]!.x),
            samples[index]!.y,
          );
        }
      }
    }
  }

  private triggerNeuralFieldPulse(result: MapBattleEvent): NeuralFieldPulseResolution | undefined {
    let visual: CommanderForceMapVisual | undefined;
    let visualId: string | undefined;
    let resolution: NeuralFieldPulseResolution | undefined;
    for (const [candidateId, candidate] of this.commanderForceVisuals) {
      if (candidate.moving || !candidate.fieldOperational || !candidate.combatActive) continue;
      const controllers = candidate.role === 'rogue-prime'
        ? new Set([candidateId, 'rai', ROGUE_PRIME_RENDER_ID])
        : new Set([candidateId]);
      const candidateResolution = resolveNeuralFieldPulseTarget(
        result,
        controllers,
        candidate.frontTargetId,
      );
      if (!candidateResolution) continue;
      // Human APEX has no outgoing weapon. Its army modifier is represented by
      // the ordinary attack route; only incoming fire visibly hits the dome.
      if (candidate.role !== 'rogue-prime' && !candidateResolution.interceptsIncoming) continue;
      if (candidateResolution.projection
        && candidateResolution.projection !== candidate.projection) continue;
      if (candidate.coverageTerritoryId !== candidateResolution.fieldTerritoryId) continue;
      visual = candidate;
      visualId = candidateId;
      resolution = candidateResolution;
      if (candidateResolution.interceptsIncoming) break;
    }
    if (!visual || !visualId || !resolution) return undefined;
    if (!apexTerritoryIntelVisible(
      this.intelligenceVisibility, resolution.fieldTerritoryId,
    )) return undefined;
    const startId = resolution.routeSourceId;
    const targetId = resolution.routeTargetId;
    const start = mapPresentationPoint(startId);
    const target = mapPresentationPoint(targetId);
    if (!start || !target
      || !this.pointNearCamera(visual.container.x, visual.container.y)
      || !this.pointNearCamera(target.x, target.y)) return undefined;

    const access: CombatAccessPresentation = isSeaConnection(startId, targetId) ? 'naval' : 'land';
    const seaGeometry = access === 'naval'
      ? countrySeaRouteMapGeometry(startId, targetId)
      : undefined;
    const routeSource = seaGeometry?.source ?? start;
    let routeTargetX = seaGeometry?.target.x ?? target.x;
    if (Math.abs(routeTargetX - routeSource.x) > MAP_WIDTH / 2) {
      routeTargetX += routeTargetX > routeSource.x ? -MAP_WIDTH : MAP_WIDTH;
    }
    const routeTarget = { x: routeTargetX, y: seaGeometry?.target.y ?? target.y };
    const samples = sampleCombatRoute(
      routeSource,
      routeTarget,
      access,
      access === 'naval'
        ? countrySeaRouteBendDirection(startId, targetId)
        : combatRouteBendDirection(startId, targetId),
      NEURAL_CONVERGENCE_MAP_PATH_POINTS - 1,
    );
    this.neuralConvergencePointCount = Math.min(NEURAL_CONVERGENCE_MAP_PATH_POINTS, samples.length);
    for (let index = 0; index < this.neuralConvergencePointCount; index += 1) {
      this.neuralConvergencePathX[index] = samples[index]!.x;
      this.neuralConvergencePathY[index] = samples[index]!.y;
    }
    if (!resolution.interceptsIncoming) {
      this.neuralConvergencePathX[0] = visual.container.x;
      this.neuralConvergencePathY[0] = visual.container.y;
    } else {
      const last = this.neuralConvergencePointCount - 1;
      const previous = last - 1;
      const deltaX = this.neuralConvergencePathX[previous]!
        - this.neuralConvergencePathX[last]!;
      const deltaY = this.neuralConvergencePathY[previous]!
        - this.neuralConvergencePathY[last]!;
      const deltaLength = Math.hypot(deltaX, deltaY);
      if (deltaLength > 1e-8) {
        const boundary = Math.min(
          deltaLength * 0.82,
          visual.coverageBoundaryWorldRadius,
        );
        this.neuralConvergencePathX[last] = this.neuralConvergencePathX[last]!
          + deltaX / deltaLength * boundary;
        this.neuralConvergencePathY[last] = this.neuralConvergencePathY[last]!
          + deltaY / deltaLength * boundary;
      }
    }
    this.neuralPulseVisualId = visualId;
    this.neuralPulseTargetId = resolution.fieldTerritoryId;
    this.neuralPulseAbility = resolution.ability;
    this.neuralPulseCounterpulseDamage = resolution.counterpulseDamage;
    this.neuralPulseStartedAt = this.time.now;
    if (this.game?.canvas) {
      this.game.canvas.dataset.apexAbilityPulse = resolution.ability;
      this.game.canvas.dataset.apexCounterpulseDamage = String(resolution.counterpulseDamage);
    }
    return resolution;
  }

  private updateNeuralFieldPulsePresentation(time: number): void {
    sampleNeuralFieldPulse(
      time - this.neuralPulseStartedAt,
      this.reducedCombatMotion,
      this.neuralPulseSample,
    );
    const visual = this.neuralPulseVisualId
      ? this.commanderForceVisuals.get(this.neuralPulseVisualId)
      : undefined;
    const targetVisible = this.neuralPulseTargetId
      ? apexTerritoryIntelVisible(this.intelligenceVisibility, this.neuralPulseTargetId)
      : false;
    const valid = this.neuralPulseSample.active && visual
      && visual.fieldOperational && targetVisible && this.neuralConvergencePointCount >= 2;
    if (!valid || !visual) {
      if (this.neuralPulseWasVisible) this.neuralConvergenceGraphics?.clear();
      this.neuralPulseWasVisible = false;
      this.commanderCoverageGraphics?.setAlpha(0.94);
      for (const candidate of this.commanderForceVisuals.values()) {
        const mode = neuralFieldModePresentation(
          candidate.moving,
          candidate.recovering,
          candidate.fieldOperational,
        );
        candidate.field
          .setScale(0.18)
          .setAlpha(mode.intensity * candidate.fieldIntensity);
      }
      if (!this.neuralPulseSample.active) {
        this.neuralPulseStartedAt = -Infinity;
        this.neuralPulseVisualId = undefined;
        this.neuralPulseTargetId = undefined;
        this.neuralPulseAbility = 'standard';
        this.neuralPulseCounterpulseDamage = 0;
        this.neuralConvergencePointCount = 0;
      }
      return;
    }

    const shieldIntensity = visual.fieldIntensity;
    this.commanderCoverageGraphics?.setAlpha(
      0.94 + this.neuralPulseSample.fieldBoost * 0.06 * shieldIntensity,
    );
    const endpointIndex = this.neuralConvergencePointCount - 1;
    const endpointX = this.normalizedWorldX(this.neuralConvergencePathX[endpointIndex]!);
    const endpointY = this.neuralConvergencePathY[endpointIndex]!;
    const onScreen = this.pointNearCamera(visual.container.x, visual.container.y)
      && this.pointNearCamera(endpointX, endpointY);
    const graphics = this.neuralConvergenceGraphics;
    if (!graphics || !onScreen) {
      if (this.neuralPulseWasVisible) graphics?.clear();
      this.neuralPulseWasVisible = false;
      return;
    }

    this.neuralConvergencePathX[0] = visual.container.x;
    this.neuralConvergencePathY[0] = visual.container.y;
    graphics.clear();
    const style = visual.role === 'rogue-prime'
      ? STRATEGIC_NEURAL_FIELD_STYLE.roguePrime
      : STRATEGIC_NEURAL_FIELD_STYLE.apex;
    if (this.neuralPulseAbility !== 'mirror'
      && this.neuralPulseSample.convergenceOpacity > 0.01) {
      graphics.lineStyle(
        this.combatWorldSize(this.neuralPulseAbility === 'singularity' ? 1.85 : 1.15),
        style.fieldColor,
        (this.neuralPulseAbility === 'singularity' ? 0.92 : 0.68)
          * this.neuralPulseSample.convergenceOpacity * shieldIntensity,
      );
      this.drawNeuralConvergencePath(graphics);
    }
    if (this.neuralPulseAbility === 'singularity'
      && this.neuralPulseSample.singularityOpacity > 0.01) {
      const ringRadius = this.combatWorldSize(
        4.2 + this.neuralPulseSample.phase * 7.5,
      );
      graphics.lineStyle(
        this.combatWorldSize(1.05),
        style.nodeColor,
        0.72 * this.neuralPulseSample.singularityOpacity * shieldIntensity,
      );
      graphics.strokeCircle(visual.container.x, visual.container.y, ringRadius);
      graphics.strokeCircle(visual.container.x, visual.container.y, ringRadius * 0.64);
    }
    if (this.neuralPulseAbility === 'mirror'
      && this.neuralPulseCounterpulseDamage > 0
      && this.neuralPulseSample.returnOpacity > 0.01) {
      this.drawNeuralReturnPulse(graphics, style.nodeColor, shieldIntensity);
    }
    if (this.neuralPulseSample.contactOpacity > 0.01) {
      const flareSize = this.combatWorldSize(2.6)
        * (0.55 + 0.45 * shieldIntensity);
      graphics.fillStyle(
        style.nodeColor,
        0.78 * this.neuralPulseSample.contactOpacity * shieldIntensity,
      );
      graphics.fillTriangle(
        endpointX, endpointY - flareSize,
        endpointX + flareSize, endpointY,
        endpointX - flareSize, endpointY,
      );
      graphics.fillTriangle(
        endpointX, endpointY + flareSize,
        endpointX + flareSize, endpointY,
        endpointX - flareSize, endpointY,
      );
    }
    this.neuralPulseWasVisible = true;
  }

  private drawNeuralConvergencePath(graphics: Phaser.GameObjects.Graphics): void {
    for (let index = 1; index < this.neuralConvergencePointCount; index += 1) {
      if ((index + Math.floor(this.neuralPulseSample.phase * 12)) % 3 === 0) continue;
      this.drawWrappedLine(
        graphics,
        this.normalizedWorldX(this.neuralConvergencePathX[index - 1]!),
        this.neuralConvergencePathY[index - 1]!,
        this.normalizedWorldX(this.neuralConvergencePathX[index]!),
        this.neuralConvergencePathY[index]!,
      );
    }
  }

  /** One pooled cyan signal grows back from the intercept point to its source. */
  private drawNeuralReturnPulse(
    graphics: Phaser.GameObjects.Graphics,
    color: number,
    shieldIntensity: number,
  ): void {
    const progress = this.neuralPulseSample.returnProgress;
    const scaled = (1 - progress) * (this.neuralConvergencePointCount - 1);
    const firstIndex = Math.max(0, Math.floor(scaled));
    graphics.lineStyle(
      this.combatWorldSize(1.35),
      color,
      0.76 * this.neuralPulseSample.returnOpacity * shieldIntensity,
    );
    for (let index = this.neuralConvergencePointCount - 1; index > firstIndex; index -= 1) {
      this.drawWrappedLine(
        graphics,
        this.normalizedWorldX(this.neuralConvergencePathX[index]!),
        this.neuralConvergencePathY[index]!,
        this.normalizedWorldX(this.neuralConvergencePathX[index - 1]!),
        this.neuralConvergencePathY[index - 1]!,
      );
    }
    const nextIndex = Math.min(this.neuralConvergencePointCount - 1, firstIndex + 1);
    const local = scaled - firstIndex;
    const pulseX = Phaser.Math.Linear(
      this.neuralConvergencePathX[firstIndex]!,
      this.neuralConvergencePathX[nextIndex]!,
      local,
    );
    const pulseY = Phaser.Math.Linear(
      this.neuralConvergencePathY[firstIndex]!,
      this.neuralConvergencePathY[nextIndex]!,
      local,
    );
    const size = this.combatWorldSize(1.75);
    graphics.fillStyle(color, 0.9 * this.neuralPulseSample.returnOpacity * shieldIntensity);
    graphics.fillTriangle(pulseX, pulseY - size, pulseX + size, pulseY, pulseX, pulseY + size);
    graphics.fillTriangle(pulseX, pulseY - size, pulseX - size, pulseY, pulseX, pulseY + size);
  }

  /**
   * Builds every current realm into one high-resolution world texture. An empire
   * receives exactly one stretched flag, clipped across all territory it owns.
   * The atlas is rebuilt only when ownership or a visible integration-percent
   * step changes, leaving one cheap map draw instead of 165 live flag images
   * and geometry masks every frame.
   */
  private redrawFlagAtlas(state: MapStateSnapshot | undefined = this.mapState): void {
    const atlas = this.flagAtlas;
    if (!atlas) return;
    const context = atlas.context;
    context.clearRect(0, 0, MAP_WIDTH * FLAG_ATLAS_SCALE, MAP_HEIGHT * FLAG_ATLAS_SCALE);
    context.save();
    context.scale(FLAG_ATLAS_SCALE, FLAG_ATLAS_SCALE);
    type EmpireShape = {
      ownerId: string;
      anchorId: string;
      rings: { x: number; y: number }[][];
      antarctic: boolean;
    };
    const empires = new Map<string, EmpireShape>();
    for (const country of COUNTRIES) {
      const ownerId = state?.territories[country.id]?.ownerId ?? country.id;
      const projectionKey = ownerId;
      const shape = empires.get(projectionKey) ?? {
        ownerId,
        anchorId: ownerId,
        rings: [],
        antarctic: false,
      };
      for (const points of RENDER_RINGS.get(country.id) ?? []) {
        if (points.length < 3) continue;
        shape.rings.push(points);
      }
      empires.set(projectionKey, shape);
    }
    const antarcticaVisible = Boolean(
      state?.polarEndgame
        && OPEN_ANTARCTICA_READINESS_PHASES.has(state.polarEndgame.phase),
    );
    if (antarcticaVisible && state) {
      for (const sector of ANTARCTICA_SECTOR_PRESENTATIONS) {
        const territory = state.territories[sector.id];
        if (!territory) continue;
        if (!apexTerritoryPoliticalIdentityVisible(
          this.intelligenceVisibility,
          sector.id,
          territory.ownerId,
        )) continue;
        const projectionKey = `antarctica:${territory.ownerId}`;
        const shape = empires.get(projectionKey) ?? {
          ownerId: territory.ownerId,
          anchorId: sector.id,
          rings: [],
          antarctic: true,
        };
        for (const ring of sector.mapRings) {
          if (ring.length < 3) continue;
          shape.rings.push(ring.map(([x, y]) => ({ x, y })));
        }
        empires.set(projectionKey, shape);
      }
    }
    for (const shape of empires.values()) {
      const { ownerId } = shape;
      const flagCountryId = this.engine?.player(ownerId)?.flagCountryId ?? ownerId;
      if (shape.rings.length === 0 || !this.textures.exists(flagTextureKey(flagCountryId))) continue;
      const source = this.textures.get(flagTextureKey(flagCountryId)).getSourceImage() as CanvasImageSource;
      const ringCenters = shape.rings.map((ring) => ({
        ring,
        x: ring.reduce((sum, point) => sum + point.x, 0) / ring.length,
        y: ring.reduce((sum, point) => sum + point.y, 0) / ring.length,
      }));
      // Stretch once per nearby landmass. France's explicit mainland anchor
      // prevents its Atlantic island rings bridging Europe to overseas bounds.
      const groups = shape.antarctic ? [ringCenters] : groupFlagLandmasses(
        shape.anchorId,
        ringCenters,
        MAP_WIDTH,
        countryPresentationAnchor(shape.anchorId),
      );
      for (const group of groups) {
        let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
        for (const { ring } of group) for (const point of ring) {
          minX = Math.min(minX, point.x); minY = Math.min(minY, point.y);
          maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y);
        }
        context.save();
        if (shape.antarctic) {
          context.beginPath();
          context.moveTo(ANTARCTICA_MAP_SILHOUETTE[0]![0], ANTARCTICA_MAP_SILHOUETTE[0]![1]);
          for (const [x, y] of ANTARCTICA_MAP_SILHOUETTE.slice(1)) context.lineTo(x, y);
          context.closePath();
          context.clip();
        }
        context.beginPath();
        for (const { ring } of group) {
          context.moveTo(ring[0]!.x, ring[0]!.y);
          for (let index = 1; index < ring.length; index += 1) context.lineTo(ring[index]!.x, ring[index]!.y);
          context.closePath();
        }
        context.clip();
        context.globalAlpha = shape.antarctic
          ? ownerId === state?.humanPlayerId ? 0.56 : 0.40
          : ownerId === state?.humanPlayerId ? 0.72 : 0.46;
        context.filter = 'brightness(1.16) saturate(0.88)';
        context.drawImage(source, minX, minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY));
        context.restore();
      }
    }
    // A conquered country keeps a faint trace of its former flag while the
    // integration calendar is active. The trace fades monotonically and is
    // removed exactly when the territory becomes core homeland.
    for (const country of COUNTRIES) {
      const territory = state?.territories[country.id];
      if (!territory || territory.coreOwnerId === territory.ownerId
        || territory.integration >= 0.999999
        || !this.textures.exists(flagTextureKey(territory.coreOwnerId))) continue;
      const rings = RENDER_RINGS.get(country.id) ?? [];
      const points = rings.flat();
      if (points.length < 3) continue;
      const source = this.textures.get(flagTextureKey(territory.coreOwnerId)).getSourceImage() as CanvasImageSource;
      const minX = Math.min(...points.map((point) => point.x));
      const maxX = Math.max(...points.map((point) => point.x));
      const minY = Math.min(...points.map((point) => point.y));
      const maxY = Math.max(...points.map((point) => point.y));
      context.save();
      context.beginPath();
      for (const ring of rings) {
        if (ring.length < 3) continue;
        context.moveTo(ring[0]!.x, ring[0]!.y);
        for (let index = 1; index < ring.length; index += 1) context.lineTo(ring[index]!.x, ring[index]!.y);
        context.closePath();
      }
      context.clip();
      context.globalAlpha = 0.50 * (1 - Phaser.Math.Clamp(territory.integration, 0, 1));
      context.filter = 'brightness(0.92) saturate(0.72)';
      context.drawImage(source, minX, minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY));
      context.restore();
    }
    if (antarcticaVisible && state) {
      for (const sector of ANTARCTICA_SECTOR_PRESENTATIONS) {
        const territory = state.territories[sector.id];
        if (!territory || territory.coreOwnerId === territory.ownerId
          || territory.integration >= 0.999999
          || !this.textures.exists(flagTextureKey(territory.coreOwnerId))) continue;
        if (!apexTerritoryPoliticalIdentityVisible(
          this.intelligenceVisibility,
          sector.id,
          territory.ownerId,
        )) continue;
        const rings = sector.mapRings.map((ring) => ring.map(([x, y]) => ({ x, y })));
        const points = rings.flat();
        if (points.length < 3) continue;
        const source = this.textures.get(flagTextureKey(territory.coreOwnerId)).getSourceImage() as CanvasImageSource;
        const minX = Math.min(...points.map((point) => point.x));
        const maxX = Math.max(...points.map((point) => point.x));
        const minY = Math.min(...points.map((point) => point.y));
        const maxY = Math.max(...points.map((point) => point.y));
        context.save();
        context.beginPath();
        for (const ring of rings) {
          if (ring.length < 3) continue;
          context.moveTo(ring[0]!.x, ring[0]!.y);
          for (let index = 1; index < ring.length; index += 1) {
            context.lineTo(ring[index]!.x, ring[index]!.y);
          }
          context.closePath();
        }
        context.clip();
        context.globalAlpha = 0.46 * (1 - Phaser.Math.Clamp(territory.integration, 0, 1));
        context.filter = 'brightness(0.92) saturate(0.72)';
        context.drawImage(source, minX, minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY));
        context.restore();
      }
    }
    context.restore();
    atlas.refresh();
  }

  private hoverCountry(countryId: string, pointer: Phaser.Input.Pointer): void {
    if (this.inputBlocked
      || !apexTerritoryHoverVisible(this.intelligenceVisibility, countryId)) return;
    const hoverChanged = this.hoveredId !== countryId;
    this.hoveredId = countryId;
    const visual = this.visuals.get(countryId);
    const territoryState = this.mapState?.territories[countryId];
    const integrating = territoryState ? mapTerritoryIsIntegrating(territoryState) : false;
    const mergedRegion = territoryState
      ? (this.ownerTerritoryCounts.get(territoryState.ownerId) ?? 1) > 1 && !integrating
      : false;
    const absorbed = this.absorbedTerritoryIds.has(countryId);
    if (!mergedRegion) for (const part of visual?.parts ?? []) {
      part.setStrokeStyle(this.screenWorldSize(1.35), 0xe8fbff, 0.92).setDepth(0.8);
    }
    if (visual && !absorbed) visual.hud.setAlpha(1).setDepth(13);
    if (hoverChanged) this.refreshZoomDetails();
    const position = this.clientPosition(pointer);
    mapBridge.onTerritoryHover?.(countryId, position.x, position.y);
  }

  private hoverAntarcticaTerritory(
    territoryId: string,
    pointer: Phaser.Input.Pointer,
  ): void {
    if (this.inputBlocked
      || !apexTerritoryHoverVisible(this.intelligenceVisibility, territoryId)) return;
    const changed = this.hoveredId !== territoryId;
    this.hoveredId = territoryId;
    if (changed) {
      this.refreshAntarcticaTerritoryStyles();
      this.refreshZoomDetails();
    }
    const position = this.clientPosition(pointer);
    mapBridge.onTerritoryHover?.(territoryId, position.x, position.y);
  }

  private unhoverCountry(countryId: string): void {
    if (this.hoveredId !== countryId) return;
    this.hoveredId = undefined;
    mapBridge.onTerritoryHover?.(undefined, 0, 0);
    this.setSelection(this.selection);
  }

  private unhoverAntarcticaTerritory(territoryId: string): void {
    if (this.hoveredId !== territoryId) return;
    this.hoveredId = undefined;
    mapBridge.onTerritoryHover?.(undefined, 0, 0);
    this.refreshAntarcticaTerritoryStyles();
    this.refreshZoomDetails();
  }

  private layoutLabel(
    visual: TerritoryVisual,
    showDetail: boolean,
    compactHeadquarters = false,
  ): { width: number; height: number } {
    const showOpeningMobilisation = showDetail
      && visual.openingMobilisationActive
      && !compactHeadquarters;
    if (visual.layoutDetailVisible === showDetail
      && visual.layoutOpeningMobilisationVisible === showOpeningMobilisation
      && visual.layoutCompactHeadquarters === compactHeadquarters
      && visual.layoutWidth !== undefined && visual.layoutHeight !== undefined) {
      return { width: visual.layoutWidth, height: visual.layoutHeight };
    }
    visual.detail.setVisible(showDetail || compactHeadquarters);
    visual.openingMobilisation.setVisible(showOpeningMobilisation);
    visual.openingMobilisationBarBack.setVisible(showOpeningMobilisation || compactHeadquarters);
    visual.openingMobilisationBarFill.setVisible(showOpeningMobilisation || compactHeadquarters);
    if (compactHeadquarters) {
      const width = Phaser.Math.Clamp(
        visual.name.width + visual.detail.width + LABEL_PADDING_X * 3,
        70,
        84,
      );
      const trackWidth = Math.max(28, width - LABEL_PADDING_X * 2);
      visual.name.setOrigin(0, 0.5).setPosition(-width / 2 + LABEL_PADDING_X, -2);
      visual.detail.setOrigin(1, 0.5).setPosition(width / 2 - LABEL_PADDING_X, -2);
      visual.openingMobilisationBarBack.setPosition(-trackWidth / 2, 8).setSize(trackWidth, 2);
      visual.openingMobilisationBarFill.setPosition(-trackWidth / 2, 8)
        .setSize(trackWidth * visual.openingMobilisationRemaining, 2);
      visual.panel.setDisplaySize(width, 20);
      const hitArea = visual.hud.input?.hitArea;
      if (hitArea instanceof Phaser.Geom.Rectangle) hitArea.setTo(-width / 2, -10, width, 20);
      visual.layoutDetailVisible = true;
      visual.layoutOpeningMobilisationVisible = false;
      visual.layoutCompactHeadquarters = true;
      visual.layoutWidth = width;
      visual.layoutHeight = 20;
      return { width, height: 20 };
    }
    visual.name.setOrigin(0.5).setX(0);
    visual.detail.setOrigin(0.5).setX(0);
    visual.name.setY(showOpeningMobilisation ? -11 : showDetail ? -4.5 : 0);
    visual.detail.setY(showOpeningMobilisation ? -1 : 6);
    visual.openingMobilisation.setY(9);
    const width = Phaser.Math.Clamp(
      Math.max(
        visual.name.width,
        showDetail ? visual.detail.width : 0,
        showOpeningMobilisation ? visual.openingMobilisation.width : 0,
      ) + LABEL_PADDING_X * 2,
      44,
      showOpeningMobilisation ? 176 : 158,
    );
    const height = showOpeningMobilisation ? 43 : showDetail ? 27 : 17;
    visual.panel.setDisplaySize(width, height);
    if (showOpeningMobilisation) {
      const trackWidth = Math.max(28, width - LABEL_PADDING_X * 2);
      visual.openingMobilisationBarBack.setPosition(-trackWidth / 2, 17).setSize(trackWidth, 2);
      visual.openingMobilisationBarFill.setPosition(-trackWidth / 2, 17)
        .setSize(trackWidth * visual.openingMobilisationRemaining, 2);
    }
    const hitArea = visual.hud.input?.hitArea;
    if (hitArea instanceof Phaser.Geom.Rectangle) hitArea.setTo(-width / 2, -height / 2, width, height);
    visual.layoutDetailVisible = showDetail;
    visual.layoutOpeningMobilisationVisible = showOpeningMobilisation;
    visual.layoutCompactHeadquarters = false;
    visual.layoutWidth = width;
    visual.layoutHeight = height;
    return { width, height };
  }

  private refreshZoomDetails(): void {
    const zoom = this.cameras.main.zoom;
    this.drawAuthoredGatewayRoutes();
    this.drawCommanderTerritoryCoverage(this.commanderCoverageEntries, true);
    this.drawCommanderRoutes(this.commanderCoverageEntries, true);
    this.refreshAntarcticaLabel();
    const camera = this.cameras.main;
    const humanId = this.mapState?.humanPlayerId;
    const humanPlayerIds = this.mapState?.humanPlayerIds.length
      ? this.mapState.humanPlayerIds
      : humanId ? [humanId] : [];
    const movedIds = this.movedTerritoryIds;
    const activeSourceIds = this.activeHumanSourceIds;
    const apexForce = humanId && this.engine && apexFieldPresentationActive(this.engine)
      ? this.mapState?.commanderForces?.[humanId]
      : undefined;
    const apexSupportTerritoryId = apexForce && !apexForce.transit
      ? apexForce.locationId : undefined;
    const apexInboundTerritoryId = apexForce?.transit?.path.at(-1);
    const primeState = this.mapState?.polarEndgame?.roguePrime;
    const primePresentation = roguePrimeMapPresentation(
      primeState,
      this.mapState?.tick ?? 0,
      this.intelligenceVisibility,
    );
    const primeSupportTerritoryId = primeState?.force
      && primePresentation.visible && !primePresentation.moving
      ? primeState.force.locationId : undefined;
    const forceScale = Phaser.Math.Clamp(1 / zoom, 1 / MAP_MAX_ZOOM, LABEL_MAX_SCREEN_SCALE);
    const forceTextOffset = 29 / zoom;
    const forceBarOffset = 39 / zoom;
    for (const visual of this.commanderForceVisuals.values()) {
      visual.container.setScale(forceScale);
    }
    const candidates: {
      territoryId: string;
      visual: TerritoryVisual;
      priority: number;
      required: boolean;
      collisionProtected: boolean;
      ordinaryDeepLabel: boolean;
      showDetail: boolean;
      showLocalForce: boolean;
      compactHeadquarters: boolean;
    }[] = [];
    for (const [territoryId, visual] of this.visuals) {
      if (visual.localForce.visible || visual.localForceBarBack.visible || visual.localForceBarFill.visible) {
        visual.localForce.setVisible(false);
        visual.localForceBarBack.setVisible(false);
        visual.localForceBarFill.setVisible(false);
      }
      const localTerritory = this.mapState?.territories[territoryId];
      const ownerId = localTerritory?.ownerId;
      const topPower = Boolean(ownerId && this.topPowerOwnerIds.has(ownerId));
      const persistentTopPower = topPower
        && this.ownerLabelTerritoryIds.get(ownerId!) === territoryId;
      if (!apexTerritoryNamecardVisible(
        this.intelligenceVisibility,
        territoryId,
        ownerId,
        persistentTopPower,
      )) {
        visual.hud.setVisible(false);
        continue;
      }
      const source = territoryId === this.selection.sourceId;
      const target = territoryId === this.selection.targetId;
      const selected = source || target;
      const hovered = territoryId === this.hoveredId;
      const ownCapital = territoryId === this.humanCapitalId;
      const atWar = this.warTerritoryIds.has(territoryId);
      const frontTerritory = this.activeFrontTerritoryIds.has(territoryId);
      const apexSupport = territoryId === apexSupportTerritoryId;
      const apexInbound = territoryId === apexInboundTerritoryId;
      const apexSignal = apexSupport || apexInbound;
      const primeSupport = territoryId === primeSupportTerritoryId;
      const clearIntel = apexTerritoryMapClear(this.intelligenceVisibility, territoryId);
      const integrating = this.integratingTerritoryIds.has(territoryId);
      const persistentHuman = Boolean(ownerId && this.humanOwnerIds.has(ownerId)
        && this.ownerLabelTerritoryIds.get(ownerId) === territoryId);
      const landNeighborOwnerIds = (TERRITORY_BY_ID[territoryId]?.neighbors ?? [])
        .filter((neighborId) => !TERRITORY_BY_ID[territoryId]?.seaNeighbors.includes(neighborId))
        .flatMap((neighborId) => {
          const neighborOwnerId = this.mapState?.territories[neighborId]?.ownerId;
          return neighborOwnerId ? [neighborOwnerId] : [];
        });
      const rogueTerritory = globeRogueTerritoryPresentation(
        ownerId ?? '',
        humanPlayerIds,
        landNeighborOwnerIds,
        frontTerritory,
      );
      const required = selected || hovered;
      const bounds = COUNTRY_RENDER_BOUNDS.get(territoryId);
      const projectedSpan = bounds ? Math.max(bounds.width, bounds.height) * zoom : 0;
      const decision = mapCountryLabelDecision({
        hovered,
        selected,
        topPowerRealm: persistentTopPower,
        humanRealm: persistentHuman || ownCapital || apexSignal,
        warRealm: atWar,
        frontTerritory,
        integrating,
        openingMobilisation: visual.openingMobilisationActive,
        projectedSpan,
        zoom,
      });
      const absorbed = this.absorbedTerritoryIds.has(territoryId);
      visual.hud.setVisible(false);
      const anchor = countryPresentationAnchor(territoryId);
      if (anchor) visual.hud.setPosition(anchor.x, anchor.y);
      if (clearIntel && rogueTerritory.rogue && localTerritory) {
        const forceAnchor = TERRITORY_BY_ID[territoryId];
        if (forceAnchor) {
          const readiness = globeTerritoryReadinessPresentation(localTerritory.army);
          const barWidth = rogueTerritory.showPower ? 30 : 22;
          const barY = forceAnchor.y + (rogueTerritory.showPower ? 24 / zoom : 0);
          const fillColor = readiness.tone === 'critical' ? 0xff736d
            : readiness.tone === 'strained' ? 0xefbd68 : 0x74e4b0;
          visual.localForceBarBack
            .setPosition(forceAnchor.x - barWidth * forceScale / 2, barY)
            .setSize(barWidth, 3)
            .setScale(forceScale)
            .setFillStyle(0x21080c, 0.96)
            .setVisible(true);
          visual.localForceBarFill
            .setPosition(forceAnchor.x - barWidth * forceScale / 2, barY)
            .setSize(barWidth * readiness.fillRatio, 3)
            .setScale(forceScale)
            .setFillStyle(fillColor, 0.98)
            .setVisible(true);
          if (rogueTerritory.showPower) {
            visual.localForce
              .setPosition(forceAnchor.x, forceAnchor.y + 14 / zoom)
              .setScale(forceScale)
              .setColor('#ffaaa4')
              .setAlpha(1)
              .setVisible(true);
          }
        }
        continue;
      }
      // A captured country becomes part of its owner's empire. Its former national
      // label never returns on the map; geographic identity remains in DOM intel.
      if (absorbed && !apexSignal) continue;
      // At every ordinary zoom only top-power realms, human realms and live
      // gameplay state are persistent. Quiet countries are hover-only, with a
      // small collision-aware exception once the camera is genuinely deep.
      if (!decision.visible) continue;
      const country = COUNTRY_BY_ID[territoryId];
      candidates.push({
        territoryId,
        visual,
        required,
        collisionProtected: decision.collisionProtected,
        ordinaryDeepLabel: decision.ordinaryDeepLabel,
        showDetail: decision.showDetail || apexSignal || primeSupport,
        compactHeadquarters: ownCapital,
        showLocalForce: clearIntel && localTerritory?.ownerId === humanId
          && (required || movedIds.has(territoryId) || activeSourceIds.has(territoryId) || frontTerritory),
        priority: (target ? 110_000 : source ? 105_000 : hovered ? 100_000
          : apexSignal || primeSupport ? 99_000
            : persistentHuman ? (ownCapital ? 98_000 : 97_000)
            : visual.openingMobilisationActive ? 96_000
              : persistentTopPower ? 95_000 : frontTerritory ? 90_000
                : atWar ? 85_000 : integrating ? 80_000 : 50_000)
          + (decision.ordinaryDeepLabel ? Math.min(5_000, projectedSpan * 10) : 0)
          + (this.mapState ? this.strategicScores.get(this.mapState.territories[territoryId]?.ownerId ?? territoryId) ?? country?.powerIndex ?? 0 : country?.powerIndex ?? 0) * 10
          - (country?.labelRank ?? 5),
      });
    }

    this.refreshAntarcticaTerritoryStyles();
    this.refreshAntarcticaReadinessNodes(forceScale, zoom, humanPlayerIds);

    // Persistent DOM chrome overlays the canvas. Reserve it in the same collision
    // pass so country text never sits underneath the header or command dock.
    const accepted: RenderRectangle[] = [
      { x: 0, y: 0, width: camera.width, height: LABEL_SAFE_TOP },
      { x: 0, y: Math.max(0, camera.height - 76), width: Math.min(340, camera.width), height: 76 },
    ];
    for (const visual of this.commanderForceVisuals.values()) {
      if (!visual.container.visible) continue;
      const screenX = (visual.container.x - camera.scrollX - camera.width / 2) * zoom + camera.width / 2;
      const screenY = (visual.container.y - camera.scrollY - camera.height / 2) * zoom + camera.height / 2;
      if (screenX < -50 || screenY < -30 || screenX > camera.width + 50 || screenY > camera.height + 30) continue;
      accepted.push({ x: screenX - 31, y: screenY - 16, width: 62, height: 38 });
    }
    candidates.sort((left, right) => right.priority - left.priority || left.territoryId.localeCompare(right.territoryId));
    let visibleOrdinaryDeepLabels = 0;
    for (const {
      territoryId, visual, required, collisionProtected, ordinaryDeepLabel, showDetail,
      showLocalForce, compactHeadquarters,
    } of candidates) {
      if (ordinaryDeepLabel && !hasDeepMapLabelSlot(visibleOrdinaryDeepLabels)) continue;
      // One compact badge system at every zoom. The overview shows names only;
      // military detail appears only for interaction and active state.
      const scale = Phaser.Math.Clamp(1 / zoom, 1 / MAP_MAX_ZOOM, LABEL_MAX_SCREEN_SCALE);
      const screenScale = scale * zoom;
      const layout = this.layoutLabel(visual, showDetail, compactHeadquarters);
      const anchor = TERRITORY_BY_ID[territoryId];
      if (!anchor) continue;
      // Derive screen coordinates directly from camera scroll. Phaser updates
      // `worldView` during pre-render, which can lag one frame behind wheel zoom.
      const anchorScreenX = (anchor.x - camera.scrollX - camera.width / 2) * zoom + camera.width / 2;
      const anchorScreenY = (anchor.y - camera.scrollY - camera.height / 2) * zoom + camera.height / 2;
      if (!required && (
        anchorScreenX < -layout.width || anchorScreenY < -layout.height
        || anchorScreenX > camera.width + layout.width || anchorScreenY > camera.height + layout.height
      )) continue;
      const width = layout.width * screenScale;
      const height = layout.height * screenScale;
      const offsets = labelPlacementOffsets(width, height, true, collisionProtected);
      let placement: { x: number; y: number; bounds: RenderRectangle } | undefined;
      let leastOverlap: typeof placement;
      let leastOverlapScore = Number.POSITIVE_INFINITY;
      for (const { x: offsetX, y: offsetY } of offsets) {
        const centerX = Phaser.Math.Clamp(
          anchorScreenX + offsetX,
          width / 2 + LABEL_COLLISION_GAP,
          camera.width - width / 2 - LABEL_COLLISION_GAP,
        );
        const centerY = Phaser.Math.Clamp(
          anchorScreenY + offsetY,
          LABEL_SAFE_TOP + height / 2 + LABEL_COLLISION_GAP,
          camera.height - LABEL_SAFE_BOTTOM - height / 2 - LABEL_COLLISION_GAP,
        );
        const bounds = {
          x: centerX - width / 2 - LABEL_COLLISION_GAP,
          y: centerY - height / 2 - LABEL_COLLISION_GAP,
          width: width + LABEL_COLLISION_GAP * 2,
          height: height + LABEL_COLLISION_GAP * 2,
        };
        let collides = false;
        let overlap = 0;
        for (const other of accepted) {
          if (!rectanglesIntersect(bounds, other)) continue;
          collides = true;
          if (collisionProtected) overlap += rectangleOverlapArea(bounds, other);
        }
        if (collides) {
          if (collisionProtected) {
            const score = overlap * 1_000 + Math.hypot(offsetX, offsetY);
            if (score < leastOverlapScore) {
              leastOverlapScore = score;
              leastOverlap = { x: centerX - anchorScreenX, y: centerY - anchorScreenY, bounds };
            }
          }
          continue;
        }
        placement = { x: centerX - anchorScreenX, y: centerY - anchorScreenY, bounds };
        break;
      }
      // Interaction, top-power and active badges must remain visible.
      // The expanded search normally finds free space; least-overlap is only a
      // final guarantee for very small windows or unusually dense empires.
      if (!placement && collisionProtected) {
        placement = leastOverlap;
      }
      if (!placement && required) {
        const centerX = Phaser.Math.Clamp(anchorScreenX, width / 2 + LABEL_COLLISION_GAP, camera.width - width / 2 - LABEL_COLLISION_GAP);
        const centerY = Phaser.Math.Clamp(
          anchorScreenY,
          LABEL_SAFE_TOP + height / 2 + LABEL_COLLISION_GAP,
          camera.height - LABEL_SAFE_BOTTOM - height / 2 - LABEL_COLLISION_GAP,
        );
        const bounds = {
          x: centerX - width / 2 - LABEL_COLLISION_GAP,
          y: centerY - height / 2 - LABEL_COLLISION_GAP,
          width: width + LABEL_COLLISION_GAP * 2,
          height: height + LABEL_COLLISION_GAP * 2,
        };
        placement = { x: centerX - anchorScreenX, y: centerY - anchorScreenY, bounds };
      }
      if (!placement) continue;
      if (ordinaryDeepLabel) visibleOrdinaryDeepLabels += 1;
      accepted.push(placement.bounds);
      // Snap the final label anchor in screen space. Combined with 2x text
      // textures this prevents the soft, smeared look at fractional camera zoom.
      const snappedScreenX = Math.round(anchorScreenX + placement.x);
      const snappedScreenY = Math.round(anchorScreenY + placement.y);
      visual.hud.setPosition(
        camera.scrollX + camera.width / 2 + (snappedScreenX - camera.width / 2) / zoom,
        camera.scrollY + camera.height / 2 + (snappedScreenY - camera.height / 2) / zoom,
      );
      const selected = territoryId === this.selection.sourceId || territoryId === this.selection.targetId;
      const hovered = territoryId === this.hoveredId;
      visual.hud.setVisible(true).setScale(scale);
      visual.name.setVisible(true);
      const ownerId = this.mapState?.territories[territoryId]?.ownerId;
      const ownerColor = ownerId ? this.ownerColors.get(ownerId) : undefined;
      const own = ownerId === this.mapState?.humanPlayerId;
      const otherHuman = Boolean(ownerId && !own && this.humanOwnerIds.has(ownerId));
      const atWar = this.warTerritoryIds.has(territoryId);
      const accent = selected ? 0xffd36b : hovered ? 0xffffff : own ? 0x72efff
        : otherHuman ? 0xd6a7ff : atWar ? 0xff746d : ownerColor ?? 0xa8c8d2;
      visual.panel.setFillStyle(0x04111b, selected || hovered ? 0.98 : 0.93);
      visual.panel.setStrokeStyle(selected || hovered ? 1.4 : 1, accent, selected || hovered ? 1 : 0.74);
      visual.detail.setColor(selected ? '#ffeaa8' : own ? '#b9f8ff'
        : otherHuman ? '#ead5ff' : atWar ? '#ffd0cc' : '#c6dce2');
      if (showLocalForce) {
        const forceAnchor = TERRITORY_BY_ID[territoryId];
        if (forceAnchor) {
          const barY = forceAnchor.y + forceBarOffset;
          visual.localForce.setPosition(forceAnchor.x, forceAnchor.y + forceTextOffset)
            .setScale(forceScale).setVisible(true)
            .setColor(movedIds.has(territoryId) ? '#e3fdff' : '#9eeaf4')
            .setAlpha(movedIds.has(territoryId) || activeSourceIds.has(territoryId) ? 1 : 0.76);
          visual.localForceBarBack.setPosition(forceAnchor.x - 17 * forceScale, barY)
            .setScale(forceScale).setVisible(true);
          visual.localForceBarFill.setPosition(forceAnchor.x - 17 * forceScale, barY)
            .setScale(forceScale).setVisible(true);
        }
      }
    }
  }

  private refreshAntarcticaTerritoryStyles(): void {
    const state = this.mapState;
    const polarVisible = Boolean(
      state?.polarEndgame
        && OPEN_ANTARCTICA_READINESS_PHASES.has(state.polarEndgame.phase),
    );
    for (const sector of ANTARCTICA_SECTOR_PRESENTATIONS) {
      const visual = this.antarcticaTerritoryVisuals.get(sector.id);
      if (!visual) continue;
      const territory = state?.territories[sector.id];
      const visible = Boolean(territory) && (polarVisible || this.intelligenceVisibility.enabled);
      const selected = sector.id === this.selection.sourceId
        || sector.id === this.selection.targetId;
      const hovered = sector.id === this.hoveredId;
      const legal = this.legalTargetIds.has(sector.id);
      const status = state?.polarEndgame?.sectors[sector.id]?.status ?? 'hidden';
      const statusColor = status === 'contested' ? 0xff665e
        : status === 'secured' ? 0x72e1a3
          : status === 'available' ? 0x6adbe8 : 0xa9d5dc;
      const ownerColor = territory ? this.ownerColors.get(territory.ownerId) : undefined;
      const fillColor = colorMix(ownerColor ?? 0x4c8792, statusColor, status === 'hidden' ? 0.12 : 0.25);
      const neighboringOwners = territory ? sector.neighbors.flatMap((neighborId) => {
        const ownerId = state?.territories[neighborId]?.ownerId;
        return ownerId ? [ownerId] : [];
      }) : [];
      const activeWarBoundary = Boolean(territory && neighboringOwners.some((ownerId) => (
        ownerId !== territory.ownerId
        && this.hostileOwnerPairs.has(mapOwnerPairKey(ownerId, territory.ownerId))
      )));
      const rogueBoundary = Boolean(territory
        && (territory.ownerId === 'rai' || neighboringOwners.includes('rai')));
      const strokeColor = selected ? 0xffd36b : hovered ? 0xf4ffff
        : legal ? 0x83eff8 : activeWarBoundary ? WORLD_MAP_BORDER_STYLE.activeWar.color
          : rogueBoundary ? WORLD_MAP_BORDER_STYLE.rogue.color
            : WORLD_MAP_BORDER_STYLE.neutral.color;
      const strokeWidth = selected ? 1.9 : hovered ? 1.55 : legal ? 1.25
        : activeWarBoundary ? WORLD_MAP_BORDER_STYLE.activeWar.width
          : rogueBoundary ? WORLD_MAP_BORDER_STYLE.rogue.width
            : WORLD_MAP_BORDER_STYLE.neutral.width;
      const strokeAlpha = selected || hovered ? 1 : legal ? 0.90
        : activeWarBoundary ? WORLD_MAP_BORDER_STYLE.activeWar.alpha
          : rogueBoundary ? WORLD_MAP_BORDER_STYLE.rogue.alpha
            : WORLD_MAP_BORDER_STYLE.neutral.alpha;
      const fillAlpha = selected ? 0.18 : hovered ? 0.135
        : status === 'contested' ? 0.105 : 0.065;
      for (const part of visual.parts) {
        part.setVisible(visible)
          .setFillStyle(fillColor, fillAlpha)
          .setStrokeStyle(this.screenWorldSize(strokeWidth), strokeColor, strokeAlpha)
          .setAlpha(this.legalTargetIds.size > 0 && !selected && !legal ? 0.62 : 1)
          .setDepth(selected ? 1.15 : hovered ? 1.05 : 0.8);
      }
    }
  }

  private refreshAntarcticaReadinessNodes(
    forceScale: number,
    zoom: number,
    humanPlayerIds: readonly string[],
  ): void {
    const state = this.mapState;
    const humanId = state?.humanPlayerId;
    const apex = humanId && this.engine && apexFieldPresentationActive(this.engine)
      ? state?.commanderForces?.[humanId]
      : undefined;
    const apexShield = apexShieldPresentation(apex);
    const apexProjections = apexProjectionPresentations(apex);
    const primeState = state?.polarEndgame?.roguePrime;
    const primePresentation = roguePrimeMapPresentation(
      primeState,
      state?.tick ?? 0,
      this.intelligenceVisibility,
    );
    const primeSectorId = primeState?.force
      && primePresentation.visible && !primePresentation.moving
      ? primeState.force.locationId : undefined;
    const primeSupportPercent = primeState?.force
      ? commanderShieldMapSupportPercent(primeState.force.shield) : 0;
    const polarVisible = Boolean(
      state?.polarEndgame
        && OPEN_ANTARCTICA_READINESS_PHASES.has(state.polarEndgame.phase),
    );
    for (const sector of ANTARCTICA_SECTOR_PRESENTATIONS) {
      const visual = this.antarcticaReadinessVisuals.get(sector.id);
      if (!visual) continue;
      const territory = state?.territories[sector.id];
      const neighborOwnerIds = sector.neighbors.flatMap((neighborId) => {
        const neighborOwnerId = state?.territories[neighborId]?.ownerId;
        return neighborOwnerId ? [neighborOwnerId] : [];
      });
      const rogueTerritory = globeRogueTerritoryPresentation(
        territory?.ownerId ?? '',
        humanPlayerIds,
        neighborOwnerIds,
        this.activeFrontTerritoryIds.has(sector.id),
      );
      const interactive = polarVisible && Boolean(territory);
      const visible = interactive
        && Boolean(territory)
        && apexTerritoryIntelVisible(this.intelligenceVisibility, sector.id);
      const clearIntel = apexTerritoryMapClear(this.intelligenceVisibility, sector.id);
      const activeFront = this.activeFrontTerritoryIds.has(sector.id);
      const apexProjection = apexProjections.find((entry) => entry.locationId === sector.id);
      const apexSupport = Boolean(apexProjection);
      const primeSupport = sector.id === primeSectorId;
      const humanBorder = Boolean(territory && (
        territory.ownerId === 'rai'
          ? neighborOwnerIds.some((ownerId) => humanPlayerIds.includes(ownerId))
          : humanPlayerIds.includes(territory.ownerId) && neighborOwnerIds.includes('rai')
      ));
      const showPower = visible && (
        rogueTerritory.showPower || activeFront || humanBorder || apexSupport || primeSupport
      );
      visual.barBack.setVisible(visible && clearIntel);
      visual.barFill.setVisible(visible && clearIntel);
      visual.power.setVisible(showPower);
      if (!visible || !territory) continue;

      const [x, y] = projectAntarcticaMapPoint(sector.longitude, sector.latitude);
      const readiness = globeTerritoryReadinessPresentation(territory.army);
      const barWidth = showPower ? 30 : 22;
      const barY = y + (showPower ? 22 / zoom : 0);
      const fillColor = readiness.tone === 'critical' ? 0xff736d
        : readiness.tone === 'strained' ? 0xefbd68 : 0x74e4b0;
      visual.barBack
        .setPosition(x - barWidth * forceScale / 2, barY)
        .setSize(barWidth, 3)
        .setScale(forceScale)
        .setFillStyle(0x21080c, 0.96);
      visual.barFill
        .setPosition(x - barWidth * forceScale / 2, barY)
        .setSize(barWidth * readiness.fillRatio, 3)
        .setScale(forceScale)
        .setFillStyle(fillColor, 0.98);
      if (showPower) {
        const supportLabel = apexSupport
          ? `  ${apexProjection?.label ?? apexShield.label}`
          : primeSupport
            ? `  PRIME +${primeSupportPercent.toFixed(1)}%`
            : '';
        const accessibleLabel = `${sector.name}. National power ${compactMapCombatPower(territory.army.power)}.${apexSupport
          ? ` APEX neural shield at ${apexShield.percent}% Energy.`
          : primeSupport
            ? ` ROGUE PRIME amplifying the Antarctic army by ${primeSupportPercent.toFixed(1)}%.`
            : ''}`;
        visual.power
          .setText(`${sector.name.toUpperCase()}\n⚔ ${compactMapCombatPower(territory.army.power)}${supportLabel}`)
          .setPosition(x, y + 5 / zoom)
          .setScale(forceScale)
          .setName(accessibleLabel)
          .setData('accessibleLabel', accessibleLabel)
          .setColor(primeSupport ? '#ff91cc' : apexSupport ? '#a8f6ff' : '#ffd1cd');
      }
    }
  }

  private clientPosition(pointer: Phaser.Input.Pointer): { x: number; y: number } {
    const event = pointer.event;
    if ('clientX' in event) return { x: event.clientX, y: event.clientY };
    const touch = event.touches[0] ?? event.changedTouches[0];
    return touch ? { x: touch.clientX, y: touch.clientY } : { x: pointer.x, y: pointer.y };
  }

  private screenWorldSize(screenPixels: number): number {
    return screenPixels / Math.max(0.000001, this.cameras.main.zoom);
  }

  private combatWorldSize(cssPixels: number): number {
    const bounds = this.game.canvas.getBoundingClientRect();
    const camera = this.cameras.main;
    const displayScale = Math.min(
      bounds.width / Math.max(1, camera.width),
      bounds.height / Math.max(1, camera.height),
    );
    return combatWorldUnits(cssPixels, camera.zoom, displayScale);
  }

  private cancelWheelZoom(): void {
    this.zoomTarget = this.cameras.main.zoom;
    this.zoomAnchorScreen = undefined;
    this.zoomAnchorWorld = undefined;
  }

  private applyAnchoredZoom(zoom: number, zoomingOut: boolean): void {
    const camera = this.cameras.main;
    const screen = this.zoomAnchorScreen;
    const world = this.zoomAnchorWorld;
    if (!screen || !world) return;
    camera.setZoom(zoom);
    camera.scrollX = world.x - camera.width / 2 - (screen.x - camera.width / 2) / zoom;
    camera.scrollY = world.y - camera.height / 2 - (screen.y - camera.height / 2) / zoom;
    if (zoomingOut) {
      const centeredScrollX = MAP_WIDTH / 2 - camera.width / 2;
      const centeredScrollY = MAP_HEIGHT / 2 - camera.height / 2;
      // Close zoom remains pointer-anchored. Near the complete world view the
      // camera progressively returns to the actual centre of the map.
      const centerPull = Phaser.Math.Clamp((1.22 - zoom) / (1.22 - MAP_MIN_ZOOM), 0, 1);
      camera.scrollX = Phaser.Math.Linear(camera.scrollX, centeredScrollX, centerPull);
      camera.scrollY = Phaser.Math.Linear(camera.scrollY, centeredScrollY, centerPull);
      if (zoom <= MAP_MIN_ZOOM + 0.005) {
        camera.scrollX = centeredScrollX;
        camera.scrollY = centeredScrollY;
      }
    }
    this.constrainCamera();
  }

  private refreshCameraPresentation(): void {
    this.drawGraticule();
    if (this.mapState) {
      this.drawOwnershipPerimeters();
      this.drawLiveFronts();
      this.drawLogistics();
      if (this.engine) this.syncCommanderForceVisuals(this.engine);
    }
    this.setSelection(this.selection);
  }

  update(time: number, delta: number): void {
    this.updateApexFogVisualBlend(globalThis.performance.now());
    this.updateNeuralFieldPulsePresentation(time);
    if (!this.reducedCombatMotion && this.frontRenderOperations.length > 0) {
      this.combatAnimationElapsed += Math.max(0, Math.min(delta, 250));
      const cadence = this.frontRenderOperations.some((operation) => operation.access === 'land')
        ? combatPresentationDescriptor('land').animationCadenceMs
        : combatPresentationDescriptor('naval').animationCadenceMs;
      if (this.combatAnimationElapsed >= cadence) {
        this.combatAnimationPhase = (this.combatAnimationPhase + this.combatAnimationElapsed / 2_400) % 1;
        this.combatAnimationElapsed = 0;
        this.drawOperationRoutes(this.combatAnimationPhase);
      }
    }
    if (!this.zoomAnchorScreen || !this.zoomAnchorWorld) return;
    const camera = this.cameras.main;
    const difference = this.zoomTarget - camera.zoom;
    const epsilon = Math.max(0.0002, this.zoomTarget * 0.0002);
    const zoomingOut = difference < 0;
    if (Math.abs(difference) <= epsilon) {
      this.applyAnchoredZoom(this.zoomTarget, zoomingOut);
      this.refreshCameraPresentation();
      this.zoomAnchorScreen = undefined;
      this.zoomAnchorWorld = undefined;
      return;
    }
    const response = 1 - Math.exp(-Math.max(0, delta) / MAP_ZOOM_RESPONSE_MS);
    this.applyAnchoredZoom(camera.zoom + difference * response, zoomingOut);
    this.refreshCameraPresentation();
  }

  private configureCamera(): void {
    // Phaser anchors worlds smaller than the zoomed viewport to the top-left.
    // Manual constraints below keep that case centred while still preventing
    // an inset zoom from being dragged into empty space.
    this.cameras.main.removeBounds();
    this.input.on('wheel', (pointer: Phaser.Input.Pointer, _objects: unknown, _dx: number, deltaY: number) => {
      if (this.inputBlocked) return;
      const camera = this.cameras.main;
      const continuingWheelZoom = Boolean(this.zoomAnchorScreen && this.zoomAnchorWorld);
      this.tweens.killTweensOf(camera);
      const before = camera.getWorldPoint(pointer.x, pointer.y);
      this.zoomAnchorScreen = { x: pointer.x, y: pointer.y };
      this.zoomAnchorWorld = { x: before.x, y: before.y };
      const baseZoom = Phaser.Math.Clamp(continuingWheelZoom ? this.zoomTarget : camera.zoom, MAP_MIN_ZOOM, MAP_MAX_ZOOM);
      this.zoomTarget = Phaser.Math.Clamp(
        baseZoom * Math.exp(-deltaY * MAP_ZOOM_WHEEL_RATE),
        MAP_MIN_ZOOM,
        MAP_MAX_ZOOM,
      );
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.inputBlocked) return;
      this.cancelWheelZoom();
      this.dragged = false;
      this.countryPointerHandled = false;
      this.pointerDown = { x: pointer.x, y: pointer.y, scrollX: this.cameras.main.scrollX, scrollY: this.cameras.main.scrollY };
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.inputBlocked) return;
      if (!pointer.isDown || !this.pointerDown) return;
      const deltaX = pointer.x - this.pointerDown.x;
      const deltaY = pointer.y - this.pointerDown.y;
      if (Math.hypot(deltaX, deltaY) > 7) this.dragged = true;
      if (!this.dragged) return;
      this.cameras.main.scrollX = this.pointerDown.scrollX - deltaX / this.cameras.main.zoom;
      this.cameras.main.scrollY = this.pointerDown.scrollY - deltaY / this.cameras.main.zoom;
      this.constrainCamera();
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      this.pointerDown = undefined;
      if (this.inputBlocked) {
        this.dragged = false;
        return;
      }
      if (!this.dragged && !this.countryPointerHandled) this.pickNearbyCountry(pointer);
      this.refreshZoomDetails();
      this.time.delayedCall(20, () => {
        this.dragged = false;
        this.countryPointerHandled = false;
      });
    });
  }

  private constrainCamera(): void {
    const camera = this.cameras.main;
    const halfWorldViewWidth = camera.width / (2 * camera.zoom);
    const halfWorldViewHeight = camera.height / (2 * camera.zoom);
    const currentCenterX = camera.scrollX + camera.width / 2;
    const currentCenterY = camera.scrollY + camera.height / 2;
    const centerX = halfWorldViewWidth * 2 >= MAP_WIDTH
      ? MAP_WIDTH / 2
      : Phaser.Math.Clamp(currentCenterX, halfWorldViewWidth, MAP_WIDTH - halfWorldViewWidth);
    const centerY = halfWorldViewHeight * 2 >= MAP_HEIGHT
      ? MAP_HEIGHT / 2
      : Phaser.Math.Clamp(currentCenterY, halfWorldViewHeight, MAP_HEIGHT - halfWorldViewHeight);
    camera.scrollX = centerX - camera.width / 2;
    camera.scrollY = centerY - camera.height / 2;
  }

  /**
   * Tiny states can be only a few screen pixels wide. A bounded nearest-anchor
   * fallback makes them selectable without laying overlapping invisible
   * polygons across dense regions such as Benelux and the Balkans.
   */
  private pickNearbyCountry(pointer: Phaser.Input.Pointer): void {
    if (this.inputBlocked) return;
    const camera = this.cameras.main;
    const world = camera.getWorldPoint(pointer.x, pointer.y);
    const event = pointer.event;
    const touchLike = 'pointerType' in event && event.pointerType === 'touch';
    const radius = touchLike ? 30 : 21;
    let best: { id: string; distance: number } | undefined;
    for (const territory of TERRITORIES) {
      if (!apexTerritoryIntelVisible(this.intelligenceVisibility, territory.id)) continue;
      let dx = Math.abs(territory.x - world.x);
      dx = Math.min(dx, Math.abs(dx - MAP_WIDTH), Math.abs(dx + MAP_WIDTH));
      const distance = Math.hypot(dx, territory.y - world.y) * camera.zoom;
      if (distance > radius || (best && distance >= best.distance)) continue;
      best = { id: territory.id, distance };
    }
    if (best) mapBridge.onTerritoryClick?.(best.id);
  }

  sync(engine: WorldMapEngineContract): void {
    this.engine = engine;
    const state = engine.state;
    this.mapState = state;
    const intelligenceVisibility = selectApexIntelligenceVisibility(engine);
    const intelligenceChanged = intelligenceVisibility.signature
      !== this.intelligenceVisibility.signature;
    if (intelligenceChanged) {
      this.intelligenceVisibility = intelligenceVisibility;
      this.updateApexFogVisualBlend(globalThis.performance.now());
      this.redrawApexIntelligenceFog();
      for (const [territoryId, visual] of this.visuals) {
        const hoverVisible = apexTerritoryHoverVisible(this.intelligenceVisibility, territoryId);
        for (const part of visual.parts) if (part.input) part.input.enabled = hoverVisible;
        if (visual.hud.input) visual.hud.input.enabled = hoverVisible;
      }
      for (const [territoryId, visual] of this.antarcticaTerritoryVisuals) {
        const hoverVisible = apexTerritoryHoverVisible(this.intelligenceVisibility, territoryId);
        for (const part of visual.parts) if (part.input) part.input.enabled = hoverVisible;
      }
    }
    const humanId = state.humanPlayerId;
    this.humanOwnerIds = new Set(state.humanPlayerIds.length ? state.humanPlayerIds : [humanId]);
    const human = engine.player(humanId);
    const territoryStates = Object.values(state.territories);
    const playerViews = new Map<string, ReturnType<WorldMapEngineContract['player']>>();
    if (human) {
      playerViews.set(humanId, human);
      this.ownerColors.set(humanId, human.color);
    }
    const playerFor = (playerId: string) => {
      if (!playerViews.has(playerId)) {
        const player = engine.player(playerId);
        playerViews.set(playerId, player);
        if (player) this.ownerColors.set(playerId, player.color);
      }
      return playerViews.get(playerId);
    };
    const sortedWars = state.wars
      .filter((war) => war.attackerId === humanId || war.defenderId === humanId)
      .sort((left, right) => left.id.localeCompare(right.id));
    const activeViewerWarPairs = new Set(sortedWars.map((war) => (
      mapOwnerPairKey(war.attackerId, war.defenderId)
    )));
    const warOperations = sortedWars.map((war) => ({ war, operations: sortedWarOperations(war) }));
    const politicalTerritoryIds = [
      ...TERRITORIES.map((territory) => territory.id),
      ...ANTARCTICA_SECTOR_PRESENTATIONS.map((sector) => sector.id),
    ];
    const polarPhase = state.polarEndgame?.phase ?? 'dormant';
    const ownerSignature = `${humanId}|${polarPhase}|${politicalTerritoryIds.map((territoryId) => (
      state.territories[territoryId]?.ownerId ?? ''
    )).join(',')}`;
    const integrationSignature = politicalTerritoryIds.map((territoryId) => {
      const live = state.territories[territoryId];
      return `${live?.coreOwnerId ?? ''}:${Math.round((live?.integration ?? 1) * 100)}`;
    }).join(',');
    const realmFlagSignature = [...new Set(politicalTerritoryIds.map((territoryId) => (
      state.territories[territoryId]?.ownerId
    )).filter((ownerId): ownerId is string => Boolean(ownerId)))]
      .sort((left, right) => left.localeCompare(right))
      .map((ownerId) => `${ownerId}:${playerFor(ownerId)?.flagCountryId ?? ownerId}`)
      .join(',');
    const flagSignature = `${this.intelligenceVisibility.signature}|${ownerSignature}|flags:${realmFlagSignature}|${integrationSignature}`;
    if (flagSignature !== this.flagAtlasOwnerSignature) {
      this.flagAtlasOwnerSignature = flagSignature;
      this.redrawFlagAtlas(state);
    }
    const integrationTopology = TERRITORIES.map((territory) => {
      const live = state.territories[territory.id];
      return live && mapTerritoryIsIntegrating(live)
        ? `${territory.id}:${live.coreOwnerId}>${live.ownerId}` : '';
    }).filter(Boolean).join(',');
    const humanOwnerSignature = [...this.humanOwnerIds].sort().join(',');
    const borderThreatSignature = strategicBorderThreatSignature(
      this.ownershipBoundarySegments,
      state.territories,
      humanId,
      activeViewerWarPairs,
    );
    const topologySignature = `${humanId}:${human?.capitalId ?? ''}|humans:${humanOwnerSignature}|${ownerSignature}|${integrationTopology}|${sortedWars.map((war) => `${war.id}:${war.attackerId}:${war.defenderId}`).join(',')}|threats:${borderThreatSignature}`;
    const topologyChanged = topologySignature !== this.lastTopologySignature;
    if (topologyChanged) {
      this.lastTopologySignature = topologySignature;
      this.humanOwnedIds = new Set(territoryStates
        .filter((territory) => territory.ownerId === humanId)
        .map((territory) => territory.id));
      this.ownerTerritoryCounts.clear();
      this.ownerLabelTerritoryIds.clear();
      this.absorbedTerritoryIds.clear();
      this.integratingTerritoryIds.clear();
      const territoryIdsByOwner = new Map<string, string[]>();
      for (const territoryState of territoryStates) {
        this.ownerTerritoryCounts.set(territoryState.ownerId, (this.ownerTerritoryCounts.get(territoryState.ownerId) ?? 0) + 1);
        const ids = territoryIdsByOwner.get(territoryState.ownerId) ?? [];
        ids.push(territoryState.id);
        territoryIdsByOwner.set(territoryState.ownerId, ids);
      }
      for (const [ownerId, territoryIds] of territoryIdsByOwner) {
        const owner = playerFor(ownerId);
        const labelTerritoryId = owner && territoryIds.includes(owner.capitalId)
          ? owner.capitalId
          : [...territoryIds].sort((left, right) => (
            (COUNTRY_BY_ID[right]?.powerIndex ?? 0) - (COUNTRY_BY_ID[left]?.powerIndex ?? 0)
            || left.localeCompare(right)
          ))[0];
        if (labelTerritoryId) this.ownerLabelTerritoryIds.set(ownerId, labelTerritoryId);
      }
      this.humanCapitalId = this.ownerLabelTerritoryIds.get(humanId) ?? human?.capitalId;
      for (const territoryState of territoryStates) {
        const integrating = mapTerritoryIsIntegrating(territoryState);
        if (integrating) this.integratingTerritoryIds.add(territoryState.id);
        if (!integrating && (this.ownerTerritoryCounts.get(territoryState.ownerId) ?? 0) > 1
          && territoryState.id !== this.ownerLabelTerritoryIds.get(territoryState.ownerId)) this.absorbedTerritoryIds.add(territoryState.id);
      }
      this.warTerritoryIds.clear();
      for (const war of sortedWars) {
        for (const territoryId of politicalTerritoryIds) {
          const ownerId = state.territories[territoryId]?.ownerId;
          if (ownerId === war.attackerId || ownerId === war.defenderId) {
            this.warTerritoryIds.add(territoryId);
          }
        }
      }
      this.rebuildTopologyPresentation(state);
    }

    const movedTerritoryIds = new Set<string>();
    for (const movement of state.logisticsMovements) {
      if (movement.playerId !== humanId) continue;
      movedTerritoryIds.add(movement.sourceId);
      movedTerritoryIds.add(movement.targetId);
    }
    this.movedTerritoryIds = movedTerritoryIds;
    this.strongestHumanTerritoryIds = new Set(territoryStates
      .filter((territory) => territory.ownerId === humanId)
      .sort((left, right) => right.army.power - left.army.power)
      .slice(0, 6)
      .map((territory) => territory.id));

    const activeHumanSourceIds = new Set<string>();
    const activeFrontTerritoryIds = new Set<string>();
    const frontRenderOperations: FrontRenderOperation[] = [];
    for (const { operations } of warOperations) {
      for (const operation of operations) {
        activeFrontTerritoryIds.add(operation.sourceId);
        activeFrontTerritoryIds.add(operation.targetId);
        if (operation.commanderId === humanId) activeHumanSourceIds.add(operation.sourceId);
        const source = mapPresentationPoint(operation.sourceId);
        const target = mapPresentationPoint(operation.targetId);
        const commander = playerFor(operation.commanderId);
        if (!source || !target || !commander) continue;
        frontRenderOperations.push({
          sourceId: operation.sourceId,
          targetId: operation.targetId,
          source,
          target,
          color: commander.isHuman ? 0x70ecff : commander.color,
          isHuman: commander.isHuman,
          momentum: operation.momentum,
          access: resolveCombatPresentationAccess(
            operation.access,
            isSeaConnection(operation.sourceId, operation.targetId),
          ),
        });
      }
    }
    this.activeHumanSourceIds = activeHumanSourceIds;
    this.activeFrontTerritoryIds = activeFrontTerritoryIds;
    this.frontRenderOperations = frontRenderOperations;
    this.visibleLogisticsMovements = selectGlobeVisibleLogisticsRoutes(
      state.logisticsMovements,
      humanId,
      'rai',
      5,
    ).filter((movement) => (
      apexTerritoryIntelVisible(this.intelligenceVisibility, movement.sourceId)
      && apexTerritoryIntelVisible(this.intelligenceVisibility, movement.targetId)
      && (movement.allegiance !== 'rogue-ai'
        || this.intelligenceVisibility.detectedRogueRouteKeys.has(
          `${movement.sourceId}:${movement.targetId}`,
        ))
    ));
    const forceSignature = forcePresentationSignature({
      moved: movedTerritoryIds,
      active: activeHumanSourceIds,
      strongest: this.strongestHumanTerritoryIds,
    });
    const forcePresentationChanged = forceSignature !== this.lastForcePresentationSignature;
    if (forcePresentationChanged) this.lastForcePresentationSignature = forceSignature;
    const openingMobilisationSignature = Object.values(state.openingMobilisations)
      .sort((left, right) => left.playerId.localeCompare(right.playerId))
      .map((phase) => `${phase.playerId}:${phase.direction}:${Math.round(phase.remainingRatio * 100)}`)
      .join('|');
    const openingMobilisationChanged = openingMobilisationSignature
      !== this.lastOpeningMobilisationSignature;
    if (openingMobilisationChanged) {
      this.lastOpeningMobilisationSignature = openingMobilisationSignature;
    }

    const strategicPresentationChanged = topologyChanged || state.tick - this.lastStrategicScoreTick >= 5;
    if (strategicPresentationChanged) {
      const ranking = engine.globalRanking();
      this.strategicScores = new Map(ranking.map((entry) => [entry.player.id, entry.score]));
      this.ownerRanks = new Map(ranking.map((entry, index) => [entry.player.id, index + 1]));
      this.topPowerOwnerIds = new Set(
        ranking.slice(0, PASSIVE_POWER_LABEL_LIMIT).map((entry) => entry.player.id),
      );
      this.lastStrategicScoreTick = state.tick;
    }
    const operationSignature = warOperations
      .map(({ war, operations }) => `${war.id}:${operations
        .map((operation) => `${operation.commanderId}:${operation.sourceId}:${operation.targetId}:${operation.doctrine}:${operation.access ?? ''}:${Math.round((operation.supply ?? 1) * 10)}:${Math.round(operation.momentum)}`)
        .join('|')}`).join(';');
    const operationChanged = operationSignature !== this.lastOperationSignature;
    if (operationChanged) this.lastOperationSignature = operationSignature;
    const logisticsSignature = state.logisticsMovements.map((movement) => (
      `${movement.playerId}:${movement.sourceId}:${movement.targetId}:${movement.access ?? ''}:${movement.manpower.toFixed(6)}`
    )).join('|');
    const logisticsChanged = logisticsSignature !== this.lastLogisticsSignature;
    if (logisticsChanged) this.lastLogisticsSignature = logisticsSignature;
    const empireArmies = new Map<string, {
      manpower: number;
      capacity: number;
      combatStrength: number;
      power: number;
      attackMass: number;
      defenseMass: number;
    }>();
    for (const territoryState of territoryStates) {
      const total = empireArmies.get(territoryState.ownerId) ?? {
        manpower: 0, capacity: 0, combatStrength: 0, power: 0,
        attackMass: 0, defenseMass: 0,
      };
      total.manpower += territoryState.army.manpower;
      total.capacity += territoryState.army.capacity;
      total.combatStrength += territoryState.army.combatStrength;
      total.power += territoryState.army.power;
      total.attackMass += territoryState.army.attack * territoryState.army.power;
      total.defenseMass += territoryState.army.defense * territoryState.army.power;
      empireArmies.set(territoryState.ownerId, total);
    }
    const viewerApex = apexFieldPresentationActive(engine)
      ? state.commanderForces?.[humanId]
      : undefined;
    const apexShield = apexShieldPresentation(viewerApex);
    const apexProjections = apexProjectionPresentations(viewerApex);
    const apexInboundTerritoryId = viewerApex?.transit?.path.at(-1);
    const primeState = state.polarEndgame?.roguePrime;
    const primePresentation = roguePrimeMapPresentation(
      primeState,
      state.tick,
      this.intelligenceVisibility,
    );
    const primeSupportTerritoryId = primeState?.force
      && primePresentation.visible && !primePresentation.moving
      ? primeState.force.locationId : undefined;
    const primeSupportPercent = primeState?.force
      ? commanderShieldMapSupportPercent(primeState.force.shield) : 0;
    for (const territory of TERRITORIES) {
      const territoryState = state.territories[territory.id];
      const visual = this.visuals.get(territory.id);
      const owner = territoryState ? playerFor(territoryState.ownerId) : undefined;
      if (!territoryState || !visual || !owner) continue;
      const empireSize = this.ownerTerritoryCounts.get(owner.id) ?? 1;
      const empireCapital = territoryState.id === (this.ownerLabelTerritoryIds.get(owner.id) ?? owner.capitalId);
      const localHeadquarters = empireCapital && owner.id === humanId;
      const empireArmy = empireArmies.get(owner.id);
      const displayedArmy = empireCapital && empireArmy
        ? {
          ...empireArmy,
          attack: empireArmy.power > 0 ? empireArmy.attackMass / empireArmy.power : territoryState.army.attack,
          defense: empireArmy.power > 0 ? empireArmy.defenseMass / empireArmy.power : territoryState.army.defense,
        }
        : territoryState.army;
      const integrating = mapTerritoryIsIntegrating(territoryState);
      const integrationPercent = Math.round(Phaser.Math.Clamp(territoryState.integration, 0, 1) * 100);
      const openingPhase = owner.isHuman && empireCapital
        ? state.openingMobilisations[owner.id] : undefined;
      const openingPercent = openingPhase
        ? Math.round(Phaser.Math.Clamp(openingPhase.remainingRatio, 0, 1) * 100) : 0;
      const openingLabel = openingPhase
        ? `${openingPhase.direction === 'boost' ? 'OPENING BOOST' : 'OPENING LIMIT'} · ${openingPercent}% LEFT`
        : '';
      const terrainProfile = terrainProfileForTerritory(territory.id);
      const terrainFillColor = terrainMapFillColor(terrainProfile);
      const fillSignature = [
        owner.id,
        owner.id === humanId ? 'local-human' : owner.isHuman ? 'human' : 'ai',
        integrating ? integrationPercent : 'core',
        terrainProfile.map((entry) => `${entry.terrain}:${entry.share}`).join(','),
      ].join(':');
      if (this.fillSignatures.get(territory.id) !== fillSignature) {
        this.fillSignatures.set(territory.id, fillSignature);
        // Terrain is a visible cartographic layer, while integration retains
        // its own brighter amber state and therefore stays unambiguous.
        const integrationTint = 1 - Phaser.Math.Clamp(territoryState.integration, 0, 1);
        for (const part of visual.parts) part.setFillStyle(
          integrating ? 0x9a6a2d : terrainFillColor,
          integrating ? 0.055 + 0.065 * integrationTint : TERRAIN_MAP_VISUAL_TUNING.fillAlpha,
        );
        visual.panel.setStrokeStyle(
          1,
          integrating ? 0xf2c879 : owner.id === humanId ? 0x77efff : owner.isHuman ? 0xd6a7ff : 0xa8c8d2,
          integrating ? 0.82 : 0.74,
        );
      }
      // An absorbed territory never keeps its former country label. The current
      // realm name appears once, at its capital; every visible label uses the same
      // compact name + one consistent total-force badge.
      const absorbed = this.absorbedTerritoryIds.has(territory.id);
      const apexProjection = apexProjections.find((entry) => (
        entry.locationId === territory.id
          && (entry.projection === 'secondary' || !viewerApex?.transit)
      ));
      const apexNetworkFront = viewerApex?.empireShield?.fronts.find((front) => (
        front.friendlyTerritoryId === territory.id
      ));
      const apexFrontProjectionPercent = apexNetworkFront
        ? Math.round(apexNetworkFront.allocationShare * 1_000) / 10 : null;
      const apexSupport = Boolean(apexProjection || apexNetworkFront);
      const apexInbound = apexShield.visible && territory.id === apexInboundTerritoryId;
      const apexSignal = apexSupport || apexInbound;
      const primeSupport = territory.id === primeSupportTerritoryId;
      const ownerRank = this.ownerRanks.get(owner.id);
      const coreOwner = integrating ? playerFor(territoryState.coreOwnerId) : undefined;
      const originalName = coreOwner?.name ?? COUNTRY_BY_ID[territory.id]?.englishName ?? territory.id;
      const labelName = integrating
        ? compactCountryName(originalName).toUpperCase()
        : localHeadquarters
          ? '◆'
        : empireCapital
          ? `${compactCountryName(owner.name).toUpperCase()}${ownerRank ? `  #${ownerRank}` : ''}` : '';
      const controllerLabel = owner.id === humanId ? 'YOU'
        : owner.isHuman ? `PLAYER ${compactControllerName(owner.controllerName).toUpperCase()}` : '';
      const supportPowerLabel = apexSupport
        ? `  ${apexShield.label}${apexFrontProjectionPercent !== null
          ? ` · MESH ${apexFrontProjectionPercent}%` : ''}`
        : apexInbound
          ? `  ${apexShield.label} · INBOUND`
        : primeSupport
          ? `  PRIME +${primeSupportPercent.toFixed(1)}%`
          : '';
      const nationalArmyLabel = integrating ? `SIGNAL PURGE ${integrationPercent}%`
        : localHeadquarters ? `PWR ${compactMapCombatPower(displayedArmy.power)}`
        : absorbed && !apexSignal && !primeSupport ? ''
          : mapCombatPowerLabel(displayedArmy.power, owner.isHuman && empireCapital
            ? controllerLabel : '');
      const armyLabel = `${nationalArmyLabel}${supportPowerLabel}`;
      const labelSignature = `${owner.id}:${empireSize}:${owner.controllerName ?? ''}:${labelName}:${armyLabel}:${openingLabel}`;
      if (this.labelSignatures.get(territory.id) !== labelSignature) {
        this.labelSignatures.set(territory.id, labelSignature);
        visual.name.setText(labelName);
        visual.detail.setText(armyLabel);
        const supportAccessibleLabel = apexSupport
          ? `National power ${compactMapCombatPower(displayedArmy.power)}. APEX neural shield at ${apexShield.percent}% shared Energy.${apexFrontProjectionPercent !== null
            ? ` Theater Mesh allocates ${apexFrontProjectionPercent}% combat support to this front.` : ''}${apexProjection?.singularityCharged
              ? ' Overdrive shield cycle charged.' : ''}`
          : apexInbound
            ? `National power ${compactMapCombatPower(displayedArmy.power)}. ${apexShield.label} inbound; not yet protecting this territory.`
          : primeSupport
            ? `National power ${compactMapCombatPower(displayedArmy.power)}. ROGUE PRIME amplifying the Antarctic army by ${primeSupportPercent.toFixed(1)}%.`
            : `National power ${compactMapCombatPower(displayedArmy.power)}.`;
        visual.hud.setName(supportAccessibleLabel).setData('accessibleLabel', supportAccessibleLabel);
        visual.name.setFontSize(localHeadquarters ? 12 : LABEL_NAME_SIZE);
        visual.detail.setFontSize(localHeadquarters ? 12 : LABEL_DETAIL_SIZE);
        visual.openingMobilisation.setText(openingLabel);
        visual.name.setColor(owner.id === humanId ? '#e2fcff' : owner.isHuman ? '#f2e3ff' : '#f4fbfc');
        visual.layoutWidth = undefined;
        visual.layoutHeight = undefined;
      }
      const localFill = Phaser.Math.Clamp(
        territoryState.army.manpower / Math.max(0.000001, territoryState.army.capacity), 0, 1,
      );
      const localFillColor = localFill < 0.35 ? 0xef5b5b : localFill < 0.70 ? 0xe8b64a : 0x58d68d;
      visual.openingMobilisationActive = Boolean(openingPhase);
      visual.openingMobilisationRemaining = localHeadquarters
        ? localFill
        : openingPhase ? Phaser.Math.Clamp(openingPhase.remainingRatio, 0, 1) : 0;
      if (localHeadquarters) {
        visual.openingMobilisationBarFill.setFillStyle(localFillColor, 0.96);
        if (visual.layoutWidth !== undefined) {
          const trackWidth = Math.max(28, visual.layoutWidth - LABEL_PADDING_X * 2);
          visual.openingMobilisationBarFill.setSize(trackWidth * localFill, 2);
        }
      } else if (openingPhase) {
        const openingColor = openingPhase.direction === 'boost' ? 0x70dcc2 : 0xb5a7ff;
        visual.openingMobilisation.setColor(openingPhase.direction === 'boost' ? '#9aead5' : '#cbbfff');
        visual.openingMobilisationBarFill.setFillStyle(openingColor, 0.96);
        if (visual.layoutWidth !== undefined) {
          const trackWidth = Math.max(28, visual.layoutWidth - LABEL_PADDING_X * 2);
          visual.openingMobilisationBarFill.setSize(
            trackWidth * visual.openingMobilisationRemaining,
            2,
          );
        }
      }
      const localForceText = compactMapCombatPower(territoryState.army.power);
      if (visual.localForceText !== localForceText) {
        visual.localForceText = localForceText;
        visual.localForce.setText(localForceText);
      }
      if (visual.localForceFill !== localFill) {
        visual.localForceFill = localFill;
        visual.localForceBarFill.setSize(34 * localFill, 3);
      }
      if (visual.localForceFillColor !== localFillColor) {
        visual.localForceFillColor = localFillColor;
        visual.localForceBarFill.setFillStyle(localFillColor, 0.92);
      }
    }
    if (topologyChanged || operationChanged) {
      this.drawLiveFronts();
    }
    if (topologyChanged || operationChanged || logisticsChanged) this.drawLogistics();
    this.syncCommanderForceVisuals(engine);
    if (topologyChanged) {
      this.drawOwnershipPerimeters();
      this.setSelection(this.selection, false);
    }
    if (intelligenceChanged || topologyChanged || strategicPresentationChanged || forcePresentationChanged
      || openingMobilisationChanged || operationChanged) {
      this.refreshZoomDetails();
    }
    this.refreshAntarcticaTerritoryStyles();
    this.refreshAntarcticaReadinessNodes(
      Phaser.Math.Clamp(1 / this.cameras.main.zoom, 1 / MAP_MAX_ZOOM, 1.18),
      this.cameras.main.zoom,
      state.humanPlayerIds.length ? state.humanPlayerIds : [humanId],
    );
  }

  private drawLiveFronts(): void {
    const graphics = this.frontGraphics;
    if (!graphics) return;
    graphics.clear();
    const state = this.mapState;
    if (!state) return;
    // Land fronts sit on the real shared border. This turns warfare into a
    // readable contact line instead of drawing an abstract centre-to-centre ray.
    const hostileLandSegments = this.ownershipBoundarySegments.filter((segment) => {
      const owners = [...new Set(segment.territoryIds
        .map((territoryId) => state.territories[territoryId]?.ownerId)
        .filter((ownerId): ownerId is string => Boolean(ownerId)))];
      return owners.some((ownerId, index) => owners.slice(index + 1)
        .some((otherOwnerId) => this.hostileOwnerPairs.has(mapOwnerPairKey(ownerId, otherOwnerId))));
    });
    const drawBorderPass = (width: number, color: number, alpha: number): void => {
      graphics.lineStyle(this.combatWorldSize(width), color, alpha);
      for (const segment of hostileLandSegments) {
        this.drawWrappedLine(graphics, segment.x1, segment.y1, segment.x2, segment.y2);
      }
    };
    drawBorderPass(5.4, 0xff493f, 0.10);
    drawBorderPass(2.3, 0xff6a56, 0.54);
    drawBorderPass(0.72, 0xffd39a, 0.92);
    this.drawOperationRoutes(this.combatAnimationPhase);
  }

  private drawOperationRoutes(phase: number): void {
    const graphics = this.operationGraphics;
    if (!graphics) return;
    graphics.clear();
    for (const operation of this.frontRenderOperations) {
      const descriptor = combatPresentationDescriptor(operation.access);
      const seaGeometry = operation.access === 'naval'
        ? countrySeaRouteMapGeometry(operation.sourceId, operation.targetId)
        : undefined;
      const routeSource = seaGeometry?.source ?? operation.source;
      let targetX = seaGeometry?.target.x ?? operation.target.x;
      if (!seaGeometry && Math.abs(targetX - routeSource.x) > MAP_WIDTH / 2) {
        targetX += targetX > routeSource.x ? -MAP_WIDTH : MAP_WIDTH;
      }
      const routeKey = `${operation.sourceId}:${operation.targetId}`;
      const routeOffset = stableTextFraction(routeKey);
      const bendDirection = operation.access === 'naval'
        ? countrySeaRouteBendDirection(operation.sourceId, operation.targetId)
        : combatRouteBendDirection(operation.sourceId, operation.targetId);
      const samples = sampleCombatRoute(
        routeSource,
        { x: targetX, y: seaGeometry?.target.y ?? operation.target.y },
        operation.access,
        bendDirection,
        operation.access === 'naval' ? 34 : 22,
      );
      const momentum = Phaser.Math.Clamp((operation.momentum + 20) / 90, 0, 1);
      const glowAlpha = (operation.isHuman ? 0.20 : 0.13) + momentum * 0.07;
      const coreAlpha = (operation.isHuman ? 0.88 : 0.65) + momentum * 0.10;
      const animatedPhase = this.reducedCombatMotion ? routeOffset : (phase + routeOffset) % 1;
      this.strokeCombatRoute(
        graphics,
        samples,
        descriptor.glowWidth,
        descriptor.glowColor,
        glowAlpha,
        descriptor.routePattern,
        animatedPhase,
      );
      this.strokeCombatRoute(
        graphics,
        samples,
        descriptor.coreWidth,
        descriptor.coreColor,
        coreAlpha,
        descriptor.routePattern,
        animatedPhase,
      );
    }
  }

  private strokeCombatRoute(
    graphics: Phaser.GameObjects.Graphics,
    samples: readonly CombatRouteSample[],
    width: number,
    color: number,
    alpha: number,
    pattern: 'solid' | 'dashed',
    phase: number,
  ): void {
    graphics.lineStyle(this.combatWorldSize(width), color, alpha);
    const dashOffset = Math.floor(phase * 10);
    for (let index = 1; index < samples.length; index += 1) {
      if (pattern === 'dashed' && (index + dashOffset) % 5 >= 3) continue;
      const start = samples[index - 1]!;
      const end = samples[index]!;
      this.drawWrappedLine(
        graphics,
        this.normalizedWorldX(start.x),
        start.y,
        this.normalizedWorldX(end.x),
        end.y,
      );
    }
  }

  private normalizedWorldX(x: number): number {
    return (x % MAP_WIDTH + MAP_WIDTH) % MAP_WIDTH;
  }

  private drawLogistics(): void {
    const graphics = this.logisticsGraphics;
    if (!graphics) return;
    graphics.clear();
    for (const movement of this.visibleLogisticsMovements) {
      const source = mapPresentationPoint(movement.sourceId);
      const target = mapPresentationPoint(movement.targetId);
      if (!source || !target) continue;
      const rogueRoute = movement.allegiance === 'rogue-ai';
      const naval = movement.access === 'naval'
        || isSeaConnection(movement.sourceId, movement.targetId);
      const intensity = Phaser.Math.Clamp(movement.manpower * 12, 0.10, 0.48);
      graphics.lineStyle(
        this.screenWorldSize((naval ? 0.85 : 0.7) + intensity),
        rogueRoute ? 0xff5f57 : 0x75efff,
        (rogueRoute ? 0.20 : 0.12) + intensity * (rogueRoute ? 0.42 : 0.28),
      );
      this.drawWrappedLine(graphics, source.x, source.y, target.x, target.y);
      if (Math.abs(source.x - target.x) < MAP_WIDTH / 2) {
        const x = source.x + (target.x - source.x) * 0.72;
        const y = source.y + (target.y - source.y) * 0.72;
        const markerScale = this.screenWorldSize(1);
        graphics.fillStyle(rogueRoute ? 0xffaaa4 : 0xbaf9ff, 0.40 + intensity * 0.65);
        graphics.fillCircle(x, y, (1.2 + intensity * 1.8) * markerScale);
      }
    }
  }

  private drawWrappedLine(graphics: Phaser.GameObjects.Graphics, x1: number, y1: number, x2: number, y2: number): void {
    if (Math.abs(x1 - x2) < MAP_WIDTH / 2) {
      graphics.lineBetween(x1, y1, x2, y2);
      return;
    }
    const left = x1 < x2 ? { x: x1, y: y1 } : { x: x2, y: y2 };
    const right = x1 < x2 ? { x: x2, y: y2 } : { x: x1, y: y1 };
    const wrapDistance = left.x + (MAP_WIDTH - right.x);
    const edgeY = left.y + (right.y - left.y) * (left.x / Math.max(1, wrapDistance));
    graphics.lineBetween(left.x, left.y, 0, edgeY);
    graphics.lineBetween(MAP_WIDTH, edgeY, right.x, right.y);
  }

  private drawAuthoredGatewayRoutes(): void {
    const graphics = this.routeGraphics;
    if (!graphics) return;
    const zoom = this.cameras.main.zoom;
    const signature = [
      Math.round(zoom * 1_000),
      this.hoveredId ?? '',
      this.selection.sourceId ?? '',
      this.selection.targetId ?? '',
    ].join(':');
    if (signature === this.gatewayRoutePresentationSignature) return;
    this.gatewayRoutePresentationSignature = signature;
    graphics.clear();
    for (const route of AUTHORED_NAVAL_GATEWAY_PRESENTATION_ROUTES) {
      const emphasized = navalGatewayRouteEmphasized(
        route,
        this.hoveredId,
        this.selection.sourceId,
        this.selection.targetId,
      );
      graphics.lineStyle(
        this.screenWorldSize(emphasized
          ? NAVAL_GATEWAY_PRESENTATION_STYLE.emphasizedWidthPx
          : NAVAL_GATEWAY_PRESENTATION_STYLE.widthPx),
        emphasized
          ? NAVAL_GATEWAY_PRESENTATION_STYLE.emphasizedColor
          : NAVAL_GATEWAY_PRESENTATION_STYLE.color,
        emphasized ? 0.36 : NAVAL_GATEWAY_PRESENTATION_STYLE.opacity,
      );
      for (const [start, end] of route.dashedSegments) {
        // Canonical samples are unwrapped for dateline-safe curves. Three
        // copies remain one Phaser Graphics batch and only the visible copy is
        // rasterized by the camera.
        for (const shift of [-MAP_WIDTH, 0, MAP_WIDTH]) {
          graphics.lineBetween(start.x + shift, start.y, end.x + shift, end.y);
        }
      }
    }
  }

  setSelection(selection: MapSelectionState, refreshZoom = true): void {
    if (selection.legalTargetIds !== this.selection.legalTargetIds) {
      this.legalTargetIds = new Set(selection.legalTargetIds);
    }
    const nextHints = selection.hintTargetIds ?? [];
    const hintsChanged = nextHints.length !== this.hintTargetIds.size
      || nextHints.some((territoryId) => !this.hintTargetIds.has(territoryId));
    if (hintsChanged) this.hintTargetIds = new Set(nextHints);
    this.selection = selection;
    const state = this.mapState;
    const humanId = state?.humanPlayerId;
    const legal = this.legalTargetIds;
    for (const [territoryId, visual] of this.visuals) {
      const selected = territoryId === selection.sourceId;
      const target = territoryId === selection.targetId;
      const isLegal = legal.has(territoryId);
      const isHinted = this.hintTargetIds.has(territoryId);
      const hovered = territoryId === this.hoveredId;
      const humanOwned = this.humanOwnedIds.has(territoryId);
      const territoryState = state?.territories[territoryId];
      const ownerId = territoryState?.ownerId;
      const otherHumanOwned = Boolean(ownerId && ownerId !== humanId && this.humanOwnerIds.has(ownerId));
      const ownerColor = ownerId ? this.ownerColors.get(ownerId) : undefined;
      const empireSize = ownerId ? this.ownerTerritoryCounts.get(ownerId) ?? 1 : 1;
      const integrating = territoryState ? mapTerritoryIsIntegrating(territoryState) : false;
      const mergedRegion = empireSize > 1 && !integrating;
      const mergedFill = ownerId && ownerColor !== undefined
        ? colorMix(ownerId === humanId ? colorMix(ownerColor, 0x65efff, 0.22) : ownerColor, 0x071521, ownerId === humanId ? 0.08 : 0.24)
        : 0xa9c5cd;
      for (const part of visual.parts) {
        if (mergedRegion) {
          // Territory polygons are implementation detail once a nation owns more
          // than one region. Never reveal the former national outline on hover.
          part.setStrokeStyle(0, mergedFill, 0).setDepth(0.8);
          part.setAlpha(legal.size > 0 && !selected && !target && !isLegal ? 0.62 : 1);
          continue;
        }
        const width = selected || target ? 1.85 : hovered ? 1.45 : isLegal ? 1.1
          : WORLD_MAP_BORDER_STYLE.neutral.width;
        const color = target ? 0xffd36b : selected || isLegal ? 0x8cf3ff
          : hovered ? 0xb9d2db : WORLD_MAP_BORDER_STYLE.neutral.color;
        const alpha = selected || target ? 1 : hovered ? 0.98 : isLegal ? 0.76
          : WORLD_MAP_BORDER_STYLE.neutral.alpha;
        part.setStrokeStyle(this.screenWorldSize(width), color, alpha).setDepth(0.8);
        part.setAlpha(legal.size > 0 && !selected && !target && !isLegal ? 0.62 : 1);
      }
      visual.hud.setDepth(selected || target ? 14 : hovered ? 13 : humanOwned ? 12 : otherHumanOwned ? 11.5
        : isLegal ? 11 : isHinted ? 9 : 8);
    }
    this.refreshAntarcticaTerritoryStyles();
    if (hintsChanged) this.drawOwnershipPerimeters();
    this.drawAuthoredGatewayRoutes();
    if (refreshZoom) this.refreshZoomDetails();
  }

  setInputBlocked(blocked: boolean): void {
    if (this.inputBlocked === blocked) return;
    this.inputBlocked = blocked;
    if (blocked) this.cancelWheelZoom();
    this.pointerDown = undefined;
    this.dragged = false;
    if (!blocked || !this.hoveredId) return;
    this.hoveredId = undefined;
    mapBridge.onTerritoryHover?.(undefined, 0, 0);
    this.setSelection(this.selection);
  }

  private detailZoomFor(territoryId: string, minimum: number): number {
    const bounds = COUNTRY_RENDER_BOUNDS.get(territoryId);
    if (!bounds) return minimum;
    const largestDimension = Math.max(bounds.width, bounds.height);
    return Phaser.Math.Clamp(
      Math.max(minimum, MICROSTATE_FOCUS_SCREEN_SIZE / Math.max(0.25, largestDimension)),
      MAP_MIN_ZOOM,
      MAP_MAX_ZOOM,
    );
  }

  focusAction(sourceId?: string, targetId?: string): void {
    const territoryId = targetId ?? sourceId;
    const point = territoryId
      ? countryPresentationAnchor(territoryId) ?? mapPresentationPoint(territoryId)
      : undefined;
    if (!territoryId || !point) return;
    const camera = this.cameras.main;
    const targetZoom = Math.max(camera.zoom, this.detailZoomFor(territoryId, 1.45));
    this.cancelWheelZoom();
    this.tweens.killTweensOf(camera);
    this.zoomTarget = targetZoom;
    this.tweens.add({
      targets: camera,
      scrollX: point.x - camera.width / 2,
      scrollY: point.y - camera.height / 2,
      zoom: targetZoom,
      duration: 420,
      ease: 'Sine.easeInOut',
      onUpdate: () => this.refreshCameraPresentation(),
      onComplete: () => {
        this.zoomTarget = camera.zoom;
        this.refreshCameraPresentation();
      },
    });
  }

  focusCountry(territoryId: string): void {
    const point = mapPresentationPoint(territoryId);
    if (!point) return;
    const camera = this.cameras.main;
    // The country-selection handoff should feel like entering a command map,
    // not returning to the continent overview. Microstates receive enough
    // screen area to read their real outline; large countries stay restrained.
    const targetZoom = this.detailZoomFor(territoryId, 3.15);
    this.cancelWheelZoom();
    this.tweens.killTweensOf(camera);
    this.zoomTarget = targetZoom;
    this.tweens.add({
      targets: camera,
      scrollX: point.x - camera.width / 2,
      scrollY: point.y - camera.height / 2,
      zoom: targetZoom,
      duration: 620,
      ease: 'Sine.easeInOut',
      onUpdate: () => this.refreshCameraPresentation(),
      onComplete: () => {
        this.zoomTarget = camera.zoom;
        this.refreshCameraPresentation();
      },
    });
  }

  focusPolarRegion(region: 'arctic' | 'antarctica'): void {
    const camera = this.cameras.main;
    const point = region === 'antarctica'
      ? { x: MAP_WIDTH / 2, y: MAP_HEIGHT - 78 }
      : projectWorldPoint(20, 84);
    const targetZoom = region === 'antarctica' ? Math.max(camera.zoom, 1.18) : Math.max(camera.zoom, 1.3);
    this.cancelWheelZoom();
    this.tweens.killTweensOf(camera);
    this.zoomTarget = targetZoom;
    this.tweens.add({
      targets: camera,
      scrollX: point.x - camera.width / 2,
      scrollY: point.y - camera.height / 2,
      zoom: targetZoom,
      duration: 580,
      ease: 'Sine.easeInOut',
      onUpdate: () => this.refreshCameraPresentation(),
      onComplete: () => {
        this.zoomTarget = camera.zoom;
        this.refreshCameraPresentation();
      },
    });
  }

  focusPolarSector(sectorId: (typeof ANTARCTICA_SECTOR_PRESENTATIONS)[number]['id']): void {
    const point = mapPresentationPoint(sectorId);
    if (!point) return;
    const camera = this.cameras.main;
    const targetZoom = Math.max(camera.zoom, 3.2);
    this.cancelWheelZoom();
    this.tweens.killTweensOf(camera);
    this.zoomTarget = targetZoom;
    this.tweens.add({
      targets: camera,
      scrollX: point.x - camera.width / 2,
      scrollY: point.y - camera.height / 2,
      zoom: targetZoom,
      duration: 580,
      ease: 'Sine.easeInOut',
      onUpdate: () => this.refreshCameraPresentation(),
      onComplete: () => {
        this.zoomTarget = camera.zoom;
        this.refreshCameraPresentation();
      },
    });
  }

  territoryScreenPosition(territoryId: string): { x: number; y: number } | undefined {
    const point = mapPresentationPoint(territoryId);
    if (!point) return undefined;
    const camera = this.cameras.main;
    const canvasBounds = this.game.canvas.getBoundingClientRect();
    const x = (point.x - camera.scrollX - camera.width / 2) * camera.zoom + camera.width / 2;
    const y = (point.y - camera.scrollY - camera.height / 2) * camera.zoom + camera.height / 2;
    return {
      x: canvasBounds.left + x * canvasBounds.width / Math.max(1, camera.width),
      y: canvasBounds.top + y * canvasBounds.height / Math.max(1, camera.height),
    };
  }

  playBattle(result: MapBattleEvent): void {
    const neuralField = this.triggerNeuralFieldPulse(result);
    const target = this.visuals.get(result.targetId);
    if (!target) return;
    const targetPoint = TERRITORY_BY_ID[result.targetId];
    if (!targetPoint || !this.pointNearCamera(targetPoint.x, targetPoint.y)
      || this.activeBattleEffects >= BATTLE_EFFECT_MAX_ACTIVE) return;
    const effectKey = `${result.sourceId}>${result.targetId}`;
    const now = this.time.now;
    for (const [key, startedAt] of this.recentBattleEffectStarts) {
      if (now - startedAt >= BATTLE_EFFECT_COALESCE_WINDOW_MS) {
        this.recentBattleEffectStarts.delete(key);
      }
    }
    if (this.recentBattleEffectStarts.has(effectKey)) return;
    this.recentBattleEffectStarts.set(effectKey, now);
    this.activeBattleEffects += 1;
    const humanDefending = this.engine?.player(result.defenderId)?.isHuman === true;
    const hideTerritoryLabel = result.conquered || this.absorbedTerritoryIds.has(result.targetId);
    if (hideTerritoryLabel) target.hud.setVisible(false);
    else {
      target.hud.setVisible(true).setAlpha(1).setDepth(20);
      this.tweens.add({ targets: target.hud, alpha: { from: .58, to: 1 }, duration: 260, ease: 'Quad.easeOut' });
    }
    const targetState = this.mapState?.territories[result.targetId];
    const targetIntegrating = targetState ? mapTerritoryIsIntegrating(targetState) : false;
    const mergedTarget = targetState
      ? (this.ownerTerritoryCounts.get(targetState.ownerId) ?? 1) > 1 && !targetIntegrating
      : false;
    if (!neuralField?.interceptsIncoming) {
      const battleParts = target.parts.slice(0, 20);
      if (humanDefending && !mergedTarget && !result.conquered) {
        for (const part of battleParts) {
          part.setStrokeStyle(this.screenWorldSize(1.85), 0xff3f38, 1).setDepth(7);
        }
      }
      if (battleParts.length > 0) {
        // Phaser applies one authored alpha curve to an array of targets. One
        // tween replaces as many as twenty identical per-polygon allocations.
        this.tweens.add({
          targets: battleParts,
          alpha: { from: 0.25, to: 1 },
          duration: result.conquered ? 650 : 320,
          ease: 'Quad.easeOut',
        });
      }
    }
    const sourcePoint = TERRITORY_BY_ID[result.sourceId];
    const attacker = this.engine?.player(result.attackerId);
    if (sourcePoint && targetPoint) {
      const fieldVisual = neuralField?.interceptsIncoming
        ? [...this.commanderForceVisuals.values()].find((visual) => (
           visual.frontTargetId === neuralField.fieldTerritoryId
           && !visual.moving && visual.fieldOperational
        )) : undefined;
      this.playBattleRouteEffect(
        result,
        sourcePoint,
        targetPoint,
        humanDefending,
        attacker?.isHuman === true,
        attacker?.color,
        fieldVisual ? { x: fieldVisual.container.x, y: fieldVisual.container.y } : undefined,
      );
    } else {
      this.activeBattleEffects = Math.max(0, this.activeBattleEffects - 1);
    }
    if (!this.reducedCombatMotion && result.conquered && (attacker?.isHuman || humanDefending)) {
      this.cameras.main.shake(130, 0.0025);
    }
    this.battleLabelRefresh?.remove(false);
    this.battleLabelRefresh = this.time.delayedCall(720, () => {
      this.battleLabelRefresh = undefined;
      this.setSelection(this.selection);
    });
  }

  private playBattleRouteEffect(
    result: MapBattleEvent,
    sourcePoint: RenderPoint,
    targetPoint: RenderPoint,
    humanDefending: boolean,
    humanAttacking: boolean,
    actorColor?: number,
    interceptedAt?: RenderPoint,
  ): void {
    const access = resolveCombatPresentationAccess(
      undefined,
      isSeaConnection(result.sourceId, result.targetId),
    );
    const descriptor = combatPresentationDescriptor(access);
    const seaGeometry = access === 'naval'
      ? countrySeaRouteMapGeometry(result.sourceId, result.targetId)
      : undefined;
    const routeSource = seaGeometry?.source ?? sourcePoint;
    let adjustedTargetX = seaGeometry?.target.x ?? targetPoint.x;
    if (!seaGeometry && Math.abs(targetPoint.x - routeSource.x) > MAP_WIDTH / 2) {
      adjustedTargetX += targetPoint.x > routeSource.x ? -MAP_WIDTH : MAP_WIDTH;
    }
    const adjustedTarget = { x: adjustedTargetX, y: seaGeometry?.target.y ?? targetPoint.y };
    if (interceptedAt) {
      let fieldX = interceptedAt.x;
      if (Math.abs(fieldX - routeSource.x) > MAP_WIDTH / 2) {
        fieldX += fieldX > routeSource.x ? -MAP_WIDTH : MAP_WIDTH;
      }
      const fieldY = interceptedAt.y;
      const towardSourceX = routeSource.x - fieldX;
      const towardSourceY = routeSource.y - fieldY;
      const fieldDistance = Math.hypot(towardSourceX, towardSourceY);
      const boundary = Math.min(fieldDistance * 0.82, 22 / this.cameras.main.zoom);
      adjustedTarget.x = fieldX + towardSourceX / Math.max(1e-8, fieldDistance) * boundary;
      adjustedTarget.y = fieldY + towardSourceY / Math.max(1e-8, fieldDistance) * boundary;
    }
    const dx = adjustedTargetX - routeSource.x;
    const dy = adjustedTarget.y - routeSource.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const bendDirection = access === 'naval'
      ? countrySeaRouteBendDirection(result.sourceId, result.targetId)
      : combatRouteBendDirection(result.sourceId, result.targetId);
    const routeColor = result.conquered
      ? colorMix(descriptor.coreColor, 0x8fffc0, 0.38)
      : descriptor.coreColor;
    const effectScale = this.combatWorldSize(1);
    const sourcePulse = this.add.circle(routeSource.x, routeSource.y, 2.2 * effectScale, descriptor.glowColor, 0.16)
      .setStrokeStyle(0.8 * effectScale, routeColor, 0.82).setDepth(19);
    this.tweens.add({
      targets: sourcePulse,
      scale: access === 'naval' ? 2.8 : 2.2,
      alpha: 0,
      duration: this.reducedCombatMotion ? 180 : access === 'naval' ? 520 : 360,
      ease: 'Sine.easeOut',
      onComplete: () => sourcePulse.destroy(),
    });
    const projectile = this.createBattleMarker(
      access,
      routeSource,
      actorColor ?? (humanDefending ? 0xff6d63 : humanAttacking ? 0x70ecff : 0xff8a72),
      routeColor,
      effectScale,
    );
    projectile.setVisible(!this.reducedCombatMotion);
    const travel = { progress: 0 };
    const flightDuration = this.reducedCombatMotion ? 120 : Phaser.Math.Clamp(
      distance * (access === 'naval' ? 4.1 : 3.0),
      access === 'naval' ? 520 : 340,
      access === 'naval' ? 1_080 : 780,
    );
    this.tweens.add({
      targets: travel,
      progress: 1,
      duration: flightDuration,
      ease: access === 'naval' ? 'Sine.easeInOut' : 'Cubic.easeInOut',
      onUpdate: () => {
        const sample = combatRouteSample(routeSource, adjustedTarget, travel.progress, access, bendDirection);
        projectile.x = this.normalizedWorldX(sample.x);
        projectile.y = sample.y;
        projectile.rotation = Math.atan2(sample.tangentY, sample.tangentX);
        projectile.alpha = Math.sin(Math.PI * travel.progress) ** 0.28;
      },
      onComplete: () => {
        projectile.destroy();
        if (interceptedAt) {
          this.activeBattleEffects = Math.max(0, this.activeBattleEffects - 1);
          return;
        }
        this.playBattleImpact(
          access,
          targetPoint,
          routeColor,
          result.conquered,
          effectScale,
          () => {
            this.activeBattleEffects = Math.max(0, this.activeBattleEffects - 1);
          },
        );
      },
    });
  }

  private createBattleMarker(
    access: CombatAccessPresentation,
    source: RenderPoint,
    actorColor: number,
    routeColor: number,
    effectScale: number,
  ): Phaser.GameObjects.Container {
    const marker = this.add.container(source.x, source.y).setDepth(19).setScale(effectScale);
    if (access === 'naval') {
      const portWake = this.add.rectangle(-7, -1.7, 10, 0.55, routeColor, 0.48).setOrigin(0.5);
      const starboardWake = this.add.rectangle(-7, 1.7, 10, 0.55, routeColor, 0.48).setOrigin(0.5);
      const hull = this.add.triangle(1, 0, 5, 0, -4.5, -3.2, -4.5, 3.2,
        colorMix(actorColor, 0xd9f9ff, 0.48), 0.96);
      const bridge = this.add.circle(-0.7, 0, 1.25, 0xecfdff, 0.98);
      marker.add([portWake, starboardWake, hull, bridge]);
    } else {
      const groundGlow = this.add.circle(-1, 0, 5.2, 0xff5e52, 0.14);
      const top = this.add.rectangle(-1.2, 0, 7.6, 4.8,
        colorMix(actorColor, 0xffcf87, 0.42), 0.96).setOrigin(0.5);
      const upperTrack = this.add.rectangle(-2.2, -3.1, 8.5, 1.15, 0x2c1a18, 0.92).setOrigin(0.5);
      const lowerTrack = this.add.rectangle(-2.2, 3.1, 8.5, 1.15, 0x2c1a18, 0.92).setOrigin(0.5);
      const thrust = this.add.triangle(4.4, 0, 4.8, 0, -2.2, -3.1, -2.2, 3.1, routeColor, 0.98);
      marker.add([groundGlow, upperTrack, lowerTrack, top, thrust]);
    }
    return marker;
  }

  private playBattleImpact(
    access: CombatAccessPresentation,
    target: RenderPoint,
    color: number,
    conquered: boolean,
    effectScale: number,
    onComplete: () => void,
  ): void {
    const duration = this.reducedCombatMotion ? 220 : conquered ? 660 : 460;
    const ringCount = access === 'naval' ? 3 : 2;
    const ringDelay = this.reducedCombatMotion ? 0 : 55;
    for (let index = 0; index < ringCount; index += 1) {
      const ring = this.add.circle(
        target.x,
        target.y,
        (access === 'naval' ? 1.5 + index * 0.8 : 2.3 + index) * effectScale,
        access === 'naval' ? 0x85eaff : 0xff7159,
        index === 0 ? 0.12 : 0,
      ).setStrokeStyle((access === 'naval' ? 0.75 : 1.05) * effectScale, color, 0.88).setDepth(19);
      this.tweens.add({
        targets: ring,
        scaleX: (conquered ? 4.5 : 3.3) + index * 0.6,
        scaleY: access === 'naval' ? 1.8 + index * 0.28 : (conquered ? 4.5 : 3.3) + index * 0.6,
        alpha: 0,
        delay: index * ringDelay,
        duration,
        ease: 'Sine.easeOut',
        onComplete: () => ring.destroy(),
      });
    }
    const burst = this.add.graphics({ x: target.x, y: target.y }).setDepth(19);
    if (access === 'naval') {
      burst.lineStyle(0.85 * effectScale, 0xd9f9ff, 0.86);
      burst.lineBetween(-4 * effectScale, 0, -1.5 * effectScale, -7 * effectScale);
      burst.lineBetween(0, 0, 0, -9 * effectScale);
      burst.lineBetween(4 * effectScale, 0, 1.5 * effectScale, -7 * effectScale);
    } else {
      burst.lineStyle(1.0 * effectScale, 0xffddb0, 0.88);
      for (let index = 0; index < 8; index += 1) {
        const angle = index * Math.PI / 4;
        burst.lineBetween(
          Math.cos(angle) * 2.2 * effectScale,
          Math.sin(angle) * 2.2 * effectScale,
          Math.cos(angle) * 8.0 * effectScale,
          Math.sin(angle) * 8.0 * effectScale,
        );
      }
    }
    const burstDuration = this.reducedCombatMotion ? 180 : access === 'naval' ? 520 : 380;
    this.tweens.add({
      targets: burst,
      alpha: 0,
      scale: access === 'naval' ? { from: 0.8, to: 1.35 } : { from: 0.72, to: 1.28 },
      duration: burstDuration,
      ease: 'Quad.easeOut',
      onComplete: () => burst.destroy(),
    });
    // The active budget owns the whole route + impact lifetime. Releasing at
    // projectile arrival allowed four lingering impacts plus four new flights.
    this.time.delayedCall(
      Math.max(duration + (ringCount - 1) * ringDelay, burstDuration) + 16,
      onComplete,
    );
  }

  private pointNearCamera(x: number, y: number): boolean {
    const view = this.cameras.main.worldView;
    const padding = 90 / Math.max(0.78, this.cameras.main.zoom);
    const expanded = new Phaser.Geom.Rectangle(
      view.x - padding,
      view.y - padding,
      view.width + padding * 2,
      view.height + padding * 2,
    );
    return expanded.contains(x, y) || expanded.contains(x - MAP_WIDTH, y) || expanded.contains(x + MAP_WIDTH, y);
  }

  resetCamera(): void {
    const camera = this.cameras.main;
    this.cancelWheelZoom();
    this.tweens.killTweensOf(camera);
    this.zoomTarget = 1;
    this.tweens.add({
      targets: camera,
      scrollX: MAP_WIDTH / 2 - camera.width / 2,
      scrollY: MAP_HEIGHT / 2 - camera.height / 2,
      zoom: 1,
      duration: 420,
      ease: 'Sine.easeInOut',
      onUpdate: () => this.refreshCameraPresentation(),
      onComplete: () => {
        this.zoomTarget = camera.zoom;
        this.refreshCameraPresentation();
      },
    });
  }
}
