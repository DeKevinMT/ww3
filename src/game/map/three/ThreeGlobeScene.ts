import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import {
  COUNTRIES,
  COUNTRY_BY_ID,
  TERRITORY_BY_ID,
  countrySeaRouteBendDirection,
  countrySeaRouteMapGeometry,
  isSeaConnection,
  worldPointCoordinates,
} from '../../data/worldMap';
import {
  mapCommanderRecoveryLifecycleActive,
  mapCommanderTransitProgress,
  mapBridge,
  type MapBattleEvent,
  type MapCommanderForceState,
  type MapPolarEndgamePhase,
  type MapPolarRegion,
  type MapPolarSectorId,
  type MapPolarSectorStatus,
  type MapSceneAdapter,
  type MapSelectionState,
  type WorldMapEngineContract,
} from '../bridge';
import {
  ANTARCTICA_ACCESS_ANCHORS,
  ANTARCTICA_SECTOR_PRESENTATION_BY_ID,
  ANTARCTICA_SECTOR_PRESENTATIONS,
  SEA_MAP_LABELS,
  antarcticaSectorAtCoordinates,
} from '../mapGeographyPresentation';
import {
  compactMapCombatPower,
  commanderForceMapCombatPower,
} from '../forcePresentation';
import { resolveCountryPresentationAnchor } from '../countryPresentation';
import { PASSIVE_POWER_LABEL_LIMIT } from '../mapLabelVisibility';
import { sampleCombatRoute, type CombatAccessPresentation } from '../combatPresentation';
import {
  BATTLE_EFFECT_COALESCE_WINDOW_MS,
  BATTLE_EFFECT_MAX_ACTIVE,
  battleEffectScale,
  battleProjectileScale,
  battleTerritoryWaveRadiusDegrees,
} from '../battleEffectPresentation';
import {
  createGlobeBattleTerritoryWave,
  GlobeBattleProjectilePool,
  GlobeBattleWaveResourceCache,
  orientGlobeBattleProjectile,
  type GlobeBattleProjectile,
  type GlobeBattleTerritoryWave,
} from './globeBattleEffects';
import { GlobePoliticalTexture, type GlobePickResult } from './globeTexture';
import { globePolarPresentationSignature } from './globePolarPresentation';
import {
  countryAngularRadiusDegrees,
  isMicrostatePickCandidate,
  nearestMicrostateScreenPick,
  type ProjectedMicrostatePickAnchor,
} from './globePicking';
import { selectGlobeVisibleLogisticsRoutes } from './globeLogisticsPresentation';
import {
  globeRogueTerritoryPresentation,
  globeTerritoryReadinessPresentation,
  globeTerritorySupplyNodePresentation,
} from './globeTerritoryPresentation';
import {
  AUTHORED_NAVAL_GATEWAY_PRESENTATION_ROUTES,
  NAVAL_GATEWAY_PRESENTATION_STYLE,
  navalGatewayRouteEmphasized,
} from '../navalGatewayPresentation';
import {
  APEX_INTELLIGENCE_FOG_STYLE,
  apexTerritoryMapClear,
  apexTerritoryHoverVisible,
  apexTerritoryIntelVisible,
  apexTerritoryNamecardVisible,
  selectApexIntelligenceVisibility,
  type ApexIntelligenceVisibility,
} from '../apexIntelligenceFog';
import {
  ROGUE_PRIME_RENDER_ID,
  roguePrimeMapPresentation,
} from '../roguePrimePresentation';
import {
  STRATEGIC_NEURAL_FIELD_STYLE,
  apexFieldPresentationActive,
  apexProjectionPresentations,
  apexShieldPresentation,
  createNeuralFieldPulseSample,
  neuralDomeShellElevation,
  neuralDomeSpokeElevation,
  neuralFieldCoverageGeometrySignature,
  neuralFieldModePresentation,
  neuralFieldPulseDurationMs,
  resolveNeuralFieldPulseTarget,
  sampleNeuralFieldPulse,
  type NeuralFieldPulseResolution,
} from '../neuralFieldPresentation';
import {
  createApexFogTransitionState,
  sampleApexFogVisualBlend,
} from '../apexFogTransition';
import { buildGlobeBorderBuffer, globeBorderOwnershipSignature } from './globeBorders';
import {
  GLOBE_SPHERE_HEIGHT_SEGMENTS,
  GLOBE_SPHERE_WIDTH_SEGMENTS,
} from './globeSurfacePresentation';
import {
  globeRotateSpeedForDistance,
  isFrontSideVisible,
  lonLatToUnitXyz,
  ndcToCssPoint,
  unitXyzToLonLat,
} from './globeMath';

const GLOBE_RADIUS = 5;
const DEFAULT_CAMERA_DISTANCE = 14.5;
// The flat globe leaves enough safe room for a closer inspection view while a
// wider overview exposes the complete empire and celestial backdrop.
const MIN_CAMERA_DISTANCE = 6.6;
const MAX_CAMERA_DISTANCE = 20;
const ACTIVE_RENDER_INTERVAL_MS = 1000 / 60;
const IDLE_RENDER_INTERVAL_MS = 1000 / 20;
const CAMERA_ACTIVITY_HOLD_MS = 280;
const DRAG_THRESHOLD = 7;
const FRONT_VISIBILITY_DOT = 0.045;
const ANTARCTICA_OVERVIEW_DISTANCE = 14.5;
const BORDER_CLOSE_PRESENTATION_DISTANCE = 11.15;
const BORDER_LINEWIDTH_FAR = 0.95;
const BORDER_LINEWIDTH_CLOSE = 1.20;
const COUNTRY_LABEL_FULL_SCALE_DISTANCE = 9.4;
const COUNTRY_LABEL_MIN_SCALE_DISTANCE = 16.75;
// Strategic tags never shrink below their authored 11px text size. Collision
// culling, rather than tiny typography, keeps the overview readable.
const COUNTRY_LABEL_FAR_SCALE = 1;
const COMMANDER_MARKER_FORWARD = new THREE.Vector3(0, 0, 1);
const NEURAL_FIELD_SCREEN_WIDTH_PX = 58;
const NEURAL_CONVERGENCE_PATH_POINT_COUNT = 40;
const NEURAL_FIELD_ATLAS_MAX_WIDTH = 3_072;
const NEURAL_FIELD_COVERAGE_OPACITY = 0.90;
const NEURAL_DOME_BASE_RADIUS = GLOBE_RADIUS * 1.007;
const NEURAL_DOME_MAX_LINE_SEGMENTS = 10_000;
const NEURAL_DOME_MAX_NODES = 2_048;
const NEURAL_DOME_SPOKE_STEPS = 3;
// Only the collapsed transit core uses this radius. Stationary APEX/PRIME
// presence is painted across the complete supported territory silhouette.
const COMMANDER_MARKER_RADIUS = GLOBE_RADIUS * 1.008;
const OPEN_ANTARCTICA_PHASES = new Set<MapPolarEndgamePhase>([
  'warning', 'contact', 'counteroffensive', 'core-exposed', 'victory',
]);
const POLAR_SECTOR_COLORS: Readonly<Record<MapPolarSectorStatus, number>> = {
  hidden: 0x132b38,
  available: 0x66eaff,
  contested: 0xff665e,
  secured: 0x76efa5,
};

/** Nameplates use the canonical compact formatter, trimmed to one decimal. */
function compactNameplateCombatPower(power: number): string {
  return compactMapCombatPower(power).replace(/^(\d+\.\d)\d([KMBT]?)$/, '$1$2');
}

/** Keep country tags at a legible screen-space size at every globe distance. */
function countryLabelScaleForDistance(cameraDistance: number): number {
  const progress = THREE.MathUtils.smoothstep(
    cameraDistance,
    COUNTRY_LABEL_FULL_SCALE_DISTANCE,
    COUNTRY_LABEL_MIN_SCALE_DISTANCE,
  );
  return THREE.MathUtils.lerp(1, COUNTRY_LABEL_FAR_SCALE, progress);
}

type LabelKind = 'country' | 'sea' | 'access';
type ScenePickResult = GlobePickResult | {
  kind: 'antarctica-sector';
  sectorId: MapPolarSectorId;
};

interface GlobeLabel {
  id: string;
  kind: LabelKind;
  longitude: number;
  latitude: number;
  worldPosition: THREE.Vector3;
  element: HTMLDivElement;
  detailElement?: HTMLElement;
  persistent: boolean;
  priority: number;
  width: number;
  height: number;
  className?: string;
  markup?: string;
  displayed?: boolean;
  detailDisplayed?: boolean;
  selected?: boolean;
  transform?: string;
}

interface CameraFlight {
  startedAt: number;
  duration: number;
  fromDirection: THREE.Vector3;
  toDirection: THREE.Vector3;
  fromDistance: number;
  toDistance: number;
}

interface BattleEffect {
  key: string;
  group: THREE.Group;
  route: THREE.Line<THREE.BufferGeometry, THREE.LineDashedMaterial>;
  projectile?: GlobeBattleProjectile;
  impactWave?: GlobeBattleTerritoryWave;
  projectileScale: number;
  path: readonly THREE.Vector3[];
  startedAt: number;
  duration: number;
}

interface AnimatedRouteMaterial {
  material: THREE.LineBasicMaterial | THREE.LineDashedMaterial;
  baseOpacity: number;
  phase: number;
  flowSpeed?: number;
  dashOffsetUniform?: { value: number };
}

interface PolarCorridorVisual {
  line: THREE.Line<THREE.BufferGeometry, THREE.LineDashedMaterial>;
  beaconMaterial: THREE.MeshBasicMaterial;
  label: HTMLDivElement;
  animation: AnimatedRouteMaterial;
  baseColor: number;
  entrySectorId: Extract<MapPolarSectorId, 'drake-entry' | 'maud-entry' | 'ross-entry'>;
}

interface CommanderForceVisual {
  readonly playerId: string;
  readonly role: 'apex' | 'rogue-prime';
  readonly marker: THREE.Group;
  readonly fieldMesh: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>;
  readonly network: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  readonly nodes: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  readonly routeGroup: THREE.Group;
  projection: 'primary' | 'secondary';
  readonly worldPosition: THREE.Vector3;
  readonly moveFrom: THREE.Vector3;
  readonly moveTo: THREE.Vector3;
  routeAnimation?: AnimatedRouteMaterial;
  routePointSignature: string;
  routePoints: THREE.Vector3[];
  pathSignature: string;
  moveStartedAt: number;
  moveDuration: number;
  inTransit: boolean;
  recovering: boolean;
  fieldOperational: boolean;
  fieldIntensity: number;
  combatActive: boolean;
  frontTargetId: string | null;
  coverageTerritoryId: string;
  coverageBoundaryWorldRadius: number;
  domeAngularRadiusRadians: number;
  domeHeight: number;
}

interface CommanderForceRenderEntry {
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
  readonly etaTicks: number;
}

interface ScreenProjection {
  clientX: number;
  clientY: number;
  localX: number;
  localY: number;
  ndcX: number;
  ndcY: number;
}

interface PointerSample {
  clientX: number;
  clientY: number;
  pointerType: string;
}

interface MicrostatePickAnchor {
  territoryId: string;
  worldPosition: THREE.Vector3;
  angularRadiusDegrees: number;
}

function globeSelectionStateSignature(selection: MapSelectionState): string {
  return [
    selection.targetId ?? '',
    selection.sourceId ?? '',
    selection.legalTargetIds.join(','),
    (selection.hintTargetIds ?? []).join(','),
  ].join('|');
}

const COUNTRY_BY_ID_MAP = new Map(COUNTRIES.map((country) => [country.id, country]));

function compactCountryName(name: string): string {
  const commonNames: Readonly<Record<string, string>> = {
    'United States of America': 'United States',
    "People's Republic of China": 'China',
    'Democratic Republic of the Congo': 'DR Congo',
    'Republic of the Congo': 'Congo',
    'Central African Republic': 'Central African Rep.',
  };
  const compact = commonNames[name] ?? name;
  return compact.length > 21 ? `${compact.slice(0, 20).trimEnd()}…` : compact;
}

function compactControllerName(name: string | undefined): string {
  const compact = name?.trim().replace(/\s+/g, ' ') || 'PLAYER';
  return compact.length > 13 ? `${compact.slice(0, 12).trimEnd()}…` : compact;
}

function easeInOutCubic(value: number): number {
  return value < 0.5 ? 4 * value * value * value : 1 - ((-2 * value + 2) ** 3) / 2;
}

/** Stable spherical interpolation, including nearly antipodal camera moves. */
function slerpDirection(from: THREE.Vector3, to: THREE.Vector3, progress: number): THREE.Vector3 {
  const start = from.clone().normalize();
  const end = to.clone().normalize();
  const dot = THREE.MathUtils.clamp(start.dot(end), -1, 1);
  if (dot > 0.9995) return start.lerp(end, progress).normalize();
  let axis = new THREE.Vector3().crossVectors(start, end);
  if (axis.lengthSq() < 1e-8) {
    const fallback = Math.abs(start.y) < 0.82
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
    axis.crossVectors(start, fallback);
  }
  axis.normalize();
  return start.applyAxisAngle(axis, Math.acos(dot) * progress).normalize();
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child: THREE.Object3D) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const material = mesh.material;
    const disposeMaterial = (entry: THREE.Material): void => {
      if (entry.userData.sharedApexUnitMaterial) return;
      entry.dispose();
    };
    if (Array.isArray(material)) material.forEach(disposeMaterial);
    else if (material) disposeMaterial(material);
  });
}

function vectorFor(longitude: number, latitude: number, radius = 1): THREE.Vector3 {
  const point = lonLatToUnitXyz(longitude, latitude);
  return new THREE.Vector3(point.x, point.y, point.z).multiplyScalar(radius);
}

function presentationAnchor(territoryId: string): readonly [number, number] | undefined {
  const country = COUNTRY_BY_ID_MAP.get(territoryId);
  if (country) {
    const point = resolveCountryPresentationAnchor(
      country.id,
      { x: country.label[0], y: country.label[1] },
      (longitude, latitude) => ({ x: longitude, y: latitude }),
    );
    return [point.x, point.y] as const;
  }
  const sector = ANTARCTICA_SECTOR_PRESENTATION_BY_ID.get(territoryId as MapPolarSectorId);
  return sector ? [sector.longitude, sector.latitude] as const : undefined;
}

interface GlobeTerritoryLabelDefinition {
  readonly id: string;
  readonly englishName: string;
  readonly labelRank: number;
  readonly powerIndex: number;
  readonly neighborIds: readonly string[];
  readonly polar: boolean;
  readonly anchor: readonly [number, number];
}

const GLOBE_TERRITORY_LABEL_DEFINITIONS: readonly GlobeTerritoryLabelDefinition[] = [
  ...COUNTRIES.map((country) => ({
    id: country.id,
    englishName: country.englishName,
    labelRank: country.labelRank,
    powerIndex: country.powerIndex,
    // A strategic sea lane is not a shared land border. Naval contact still
    // expands a node through the active-front signal below.
    neighborIds: (TERRITORY_BY_ID[country.id]?.neighbors ?? []).filter((neighborId) => (
      !TERRITORY_BY_ID[country.id]?.seaNeighbors.includes(neighborId)
    )),
    polar: false,
    anchor: presentationAnchor(country.id) ?? country.label,
  })),
  ...ANTARCTICA_SECTOR_PRESENTATIONS.map((sector, index) => ({
    id: sector.id,
    englishName: sector.name,
    labelRank: 8 + index,
    powerIndex: sector.id === 'zero-point-core' ? 420 : 0,
    neighborIds: sector.neighbors,
    polar: true,
    anchor: [sector.longitude, sector.latitude] as const,
  })),
] as const;

const GLOBE_TERRITORY_LABEL_BY_ID = new Map(
  GLOBE_TERRITORY_LABEL_DEFINITIONS.map((territory) => [territory.id, territory] as const),
);

function createSunGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (context) {
    const glow = context.createRadialGradient(128, 128, 0, 128, 128, 128);
    glow.addColorStop(0, 'rgba(255, 250, 222, 1)');
    glow.addColorStop(0.055, 'rgba(255, 226, 145, 0.98)');
    glow.addColorStop(0.13, 'rgba(255, 171, 78, 0.58)');
    glow.addColorStop(0.36, 'rgba(225, 82, 34, 0.13)');
    glow.addColorStop(1, 'rgba(30, 66, 105, 0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, 256, 256);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createApexFogCloudTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context) {
    const image = context.createImageData(canvas.width, canvas.height);
    for (let index = 0; index < image.data.length; index += 4) {
      const pixel = index / 4;
      const x = pixel % canvas.width;
      const y = Math.floor(pixel / canvas.width);
      const broad = Math.sin(x * 0.081) * Math.cos(y * 0.117) * 0.5 + 0.5;
      const seed = (Math.imul(pixel + 211, 2_246_822_519) >>> 0) / 4_294_967_296;
      const alpha = Math.round(24 + (broad * 0.68 + seed * 0.32) * 82);
      image.data[index] = 126;
      image.data[index + 1] = 164;
      image.data[index + 2] = 180;
      image.data[index + 3] = alpha;
    }
    context.putImageData(image, 0, 0);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.4, 1.2);
  return texture;
}

/**
 * Build the small-country hit-proxy set once. Larger countries always use
 * exact political-texture polygon picking.
 */
const MICROSTATE_PICK_ANCHORS: readonly MicrostatePickAnchor[] = COUNTRIES.flatMap((country) => {
  const anchor = presentationAnchor(country.id);
  if (!anchor) return [];
  const angularRadiusDegrees = countryAngularRadiusDegrees(anchor, country.rings);
  if (!isMicrostatePickCandidate(angularRadiusDegrees)) return [];
  return [{
    territoryId: country.id,
    worldPosition: vectorFor(anchor[0], anchor[1], GLOBE_RADIUS * 1.025),
    angularRadiusDegrees,
  }];
});

/**
 * Focus the principal landmass instead of calibrating every country around a
 * continental power. Belgium-sized countries land close to the surface while
 * the USA, China and Russia retain a wide regional overview. Detached islands
 * and overseas territories cannot force their homeland focus farther out.
 */
function countryFocusDistance(
  country: (typeof COUNTRIES)[number],
  anchor: readonly [number, number],
): number {
  const center = vectorFor(anchor[0], anchor[1]).normalize();
  const ringDistances = country.rings
    .filter((ring) => ring.length >= 3)
    .map((ring) => {
      const angularDistances = ring.map(([longitude, latitude]) => Math.acos(
        THREE.MathUtils.clamp(center.dot(vectorFor(longitude, latitude).normalize()), -1, 1),
      ));
      return {
        nearest: Math.min(...angularDistances),
        radius: Math.max(...angularDistances),
      };
    })
    .sort((left, right) => left.nearest - right.nearest);
  const radiusDegrees = THREE.MathUtils.radToDeg(ringDistances[0]?.radius ?? 0);
  return THREE.MathUtils.clamp(6.8 + radiusDegrees * 0.38, 6.9, 17.2);
}

function greatCirclePath(
  start: THREE.Vector3,
  end: THREE.Vector3,
  lift = 0.075,
  segments = 64,
): THREE.Vector3[] {
  const startDirection = start.clone().normalize();
  const endDirection = end.clone().normalize();
  const dot = THREE.MathUtils.clamp(startDirection.dot(endDirection), -1, 1);
  const angle = Math.acos(dot);
  const cross = new THREE.Vector3().crossVectors(startDirection, endDirection);
  if (cross.lengthSq() < 1e-8) cross.set(0, 1, 0).cross(startDirection);
  cross.normalize();
  const points: THREE.Vector3[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const progress = index / segments;
    const direction = startDirection.clone().applyAxisAngle(cross, angle * progress);
    const elevation = 1.024 + Math.sin(Math.PI * progress) * lift;
    points.push(direction.multiplyScalar(GLOBE_RADIUS * elevation));
  }
  return points;
}

function routeBetween(
  sourceId: string,
  targetId: string,
  lift: number,
  access: CombatAccessPresentation,
): THREE.Vector3[] | undefined {
  if (access === 'naval') {
    const seaGeometry = countrySeaRouteMapGeometry(sourceId, targetId);
    if (seaGeometry) {
      let targetX = seaGeometry.target.x;
      if (Math.abs(targetX - seaGeometry.source.x) > 640) {
        targetX += targetX > seaGeometry.source.x ? -1280 : 1280;
      }
      const samples = sampleCombatRoute(
        seaGeometry.source,
        { x: targetX, y: seaGeometry.target.y },
        'naval',
        countrySeaRouteBendDirection(sourceId, targetId),
        48,
      );
      return samples.map((sample, index) => {
        const [longitude, latitude] = worldPointCoordinates(sample);
        const progress = index / Math.max(1, samples.length - 1);
        return vectorFor(
          longitude,
          latitude,
          GLOBE_RADIUS * (1.027 + Math.sin(Math.PI * progress) * lift),
        );
      });
    }
  }
  const source = presentationAnchor(sourceId);
  const target = presentationAnchor(targetId);
  if (!source || !target) return undefined;
  return greatCirclePath(
    vectorFor(source[0], source[1], GLOBE_RADIUS * 1.006),
    vectorFor(target[0], target[1], GLOBE_RADIUS * 1.006),
    lift,
  );
}

function commanderRoutePoints(
  force: MapCommanderForceState,
  itinerary: readonly string[] = force.transit?.path ?? [force.locationId],
): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (let index = 0; index < itinerary.length - 1; index += 1) {
    const sourceId = itinerary[index]!;
    const targetId = itinerary[index + 1]!;
    const naval = isSeaConnection(sourceId, targetId);
    const leg = routeBetween(sourceId, targetId, naval ? 0.105 : 0.075, naval ? 'naval' : 'land');
    if (!leg) continue;
    points.push(...(points.length > 0 ? leg.slice(1) : leg));
  }
  if (points.length > 0) return points;
  const anchor = presentationAnchor(force.locationId) ?? presentationAnchor(force.headquartersId);
  return anchor ? [vectorFor(anchor[0], anchor[1], COMMANDER_MARKER_RADIUS)] : [];
}

function commanderPointAlongRoute(points: readonly THREE.Vector3[], progress: number): THREE.Vector3 | undefined {
  if (points.length === 0) return undefined;
  if (points.length === 1) return points[0]!.clone().normalize().multiplyScalar(COMMANDER_MARKER_RADIUS);
  let totalDistance = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    totalDistance += points[index]!.distanceTo(points[index + 1]!);
  }
  const targetDistance = THREE.MathUtils.clamp(progress, 0, 1) * totalDistance;
  let covered = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const legDistance = points[index]!.distanceTo(points[index + 1]!);
    if (covered + legDistance >= targetDistance || index === points.length - 2) {
      const localProgress = legDistance <= 1e-8 ? 0 : (targetDistance - covered) / legDistance;
      return new THREE.Vector3().lerpVectors(points[index]!, points[index + 1]!, localProgress)
        .normalize().multiplyScalar(COMMANDER_MARKER_RADIUS);
    }
    covered += legDistance;
  }
  return points.at(-1)!.clone().normalize().multiplyScalar(COMMANDER_MARKER_RADIUS);
}

/** Stops incoming fire at a shallow field boundary, never inside the land texture. */
function clipGlobeRouteToNeuralField(
  path: THREE.Vector3[],
  shellPoint: THREE.Vector3,
): void {
  if (path.length < 2) return;
  // Red route, pooled projectile and cyan/magenta contact pulse all consume
  // this same elevated endpoint. No hidden marker scale participates.
  path[path.length - 1]!.copy(shellPoint);
}

/** One irregular territory-aligned footprint, deliberately not a disc/ring. */
function createStrategicNeuralFieldGeometry(): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.98, 0.12);
  shape.lineTo(-0.58, -0.62);
  shape.lineTo(0.02, -0.84);
  shape.lineTo(0.76, -0.48);
  shape.lineTo(0.96, 0.18);
  shape.lineTo(0.48, 0.72);
  shape.lineTo(-0.42, 0.68);
  shape.closePath();
  return new THREE.ShapeGeometry(shape, 1);
}

type NeuralFieldCoordinate = readonly [number, number];

interface PreparedNeuralFieldRing {
  readonly points: readonly NeuralFieldCoordinate[];
  readonly minimumLongitude: number;
  readonly maximumLongitude: number;
  readonly minimumLatitude: number;
  readonly maximumLatitude: number;
  readonly longitudeShifts: readonly number[];
  readonly visualArea: number;
}

const PREPARED_NEURAL_FIELD_RINGS = new Map<string, readonly PreparedNeuralFieldRing[]>();

function neuralFieldTerritoryRings(
  territoryId: string,
): readonly (readonly NeuralFieldCoordinate[])[] {
  const country = COUNTRY_BY_ID_MAP.get(territoryId);
  if (country) return country.rings;
  return ANTARCTICA_SECTOR_PRESENTATION_BY_ID
    .get(territoryId as MapPolarSectorId)?.rings ?? [];
}

function prepareNeuralFieldRing(
  source: readonly NeuralFieldCoordinate[],
): PreparedNeuralFieldRing | undefined {
  const first = source[0];
  if (!first || source.length < 3) return undefined;
  const points: NeuralFieldCoordinate[] = [[first[0], first[1]]];
  let previousLongitude = first[0];
  let offset = 0;
  for (let index = 1; index < source.length; index += 1) {
    const [longitude, latitude] = source[index]!;
    const candidate = longitude + offset;
    if (candidate - previousLongitude > 180) offset -= 360;
    else if (candidate - previousLongitude < -180) offset += 360;
    const unwrappedLongitude = longitude + offset;
    points.push([unwrappedLongitude, latitude]);
    previousLongitude = unwrappedLongitude;
  }
  const last = points.at(-1);
  if (last && points.length > 3
    && Math.abs(last[0] - points[0]![0]) < 1e-7
    && Math.abs(last[1] - points[0]![1]) < 1e-7) points.pop();
  if (points.length < 3) return undefined;
  const longitudes = points.map(([longitude]) => longitude);
  const latitudes = points.map(([, latitude]) => latitude);
  const minimumLongitude = Math.min(...longitudes);
  const maximumLongitude = Math.max(...longitudes);
  const minimumLatitude = Math.min(...latitudes);
  const maximumLatitude = Math.max(...latitudes);
  let doubledArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index]!;
    const end = points[(index + 1) % points.length]!;
    doubledArea += start[0] * end[1] - end[0] * start[1];
  }
  const middleLatitude = (minimumLatitude + maximumLatitude) * 0.5 * Math.PI / 180;
  return {
    points,
    minimumLongitude,
    maximumLongitude,
    minimumLatitude,
    maximumLatitude,
    longitudeShifts: [-360, 0, 360].filter((shift) => (
      maximumLongitude + shift >= -180 && minimumLongitude + shift <= 180
    )),
    visualArea: Math.abs(doubledArea) * 0.5 * Math.max(0.12, Math.cos(middleLatitude)),
  };
}

function preparedNeuralFieldRings(territoryId: string): readonly PreparedNeuralFieldRing[] {
  const cached = PREPARED_NEURAL_FIELD_RINGS.get(territoryId);
  if (cached) return cached;
  const prepared = neuralFieldTerritoryRings(territoryId)
    .map(prepareNeuralFieldRing)
    .filter((ring): ring is PreparedNeuralFieldRing => Boolean(ring));
  PREPARED_NEURAL_FIELD_RINGS.set(territoryId, prepared);
  return prepared;
}

function neuralFieldTexturePoint(
  longitude: number,
  latitude: number,
  width: number,
  height: number,
): readonly [number, number] {
  return [
    ((longitude + 180) / 360) * width,
    ((90 - latitude) / 180) * height,
  ];
}

function traceNeuralFieldRing(
  context: CanvasRenderingContext2D,
  ring: PreparedNeuralFieldRing,
  longitudeShift: number,
  width: number,
  height: number,
): void {
  context.beginPath();
  for (let index = 0; index < ring.points.length; index += 1) {
    const [longitude, latitude] = ring.points[index]!;
    const [x, y] = neuralFieldTexturePoint(
      longitude + longitudeShift,
      latitude,
      width,
      height,
    );
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
}

function neuralFieldCssColor(color: number, alpha: number): string {
  return `rgba(${(color >> 16) & 0xff},${(color >> 8) & 0xff},${color & 0xff},${alpha})`;
}

/**
 * Paints one exact territory silhouette, including every detached land part,
 * into the single shared globe overlay. The clipped lattice evokes a shallow
 * network dome without allocating meshes for countries or nodes.
 */
function drawTerritoryWideNeuralField(
  context: CanvasRenderingContext2D,
  territoryId: string,
  role: 'apex' | 'rogue-prime',
  intensity: number,
  width: number,
  height: number,
): number {
  const style = role === 'rogue-prime'
    ? STRATEGIC_NEURAL_FIELD_STYLE.roguePrime
    : STRATEGIC_NEURAL_FIELD_STYLE.apex;
  const rings = preparedNeuralFieldRings(territoryId);
  let paintedParts = 0;
  for (const ring of rings) {
    for (const shift of ring.longitudeShifts) {
      const [left, top] = neuralFieldTexturePoint(
        ring.minimumLongitude + shift,
        ring.maximumLatitude,
        width,
        height,
      );
      const [right, bottom] = neuralFieldTexturePoint(
        ring.maximumLongitude + shift,
        ring.minimumLatitude,
        width,
        height,
      );
      const spanX = Math.max(2, right - left);
      const spanY = Math.max(2, bottom - top);
      const maximumSpan = Math.max(spanX, spanY);
      traceNeuralFieldRing(context, ring, shift, width, height);
      context.save();
      context.globalCompositeOperation = 'source-over';
      context.shadowColor = neuralFieldCssColor(style.fieldColor, 0.36 * intensity);
      context.shadowBlur = Math.max(2.5, Math.min(8, maximumSpan * 0.09));
      context.fillStyle = neuralFieldCssColor(
        style.fieldColor,
        Math.min(0.12, style.fieldOpacity * 0.62 * intensity),
      );
      context.fill();
      context.clip();

      const centerX = (left + right) * 0.5;
      const centerY = (top + bottom) * 0.5;
      const glow = context.createRadialGradient(
        centerX,
        centerY,
        0,
        centerX,
        centerY,
        Math.max(4, maximumSpan * 0.66),
      );
      glow.addColorStop(0, neuralFieldCssColor(style.nodeColor, 0.07 * intensity));
      glow.addColorStop(1, neuralFieldCssColor(style.fieldColor, 0));
      context.fillStyle = glow;
      context.fillRect(left - 4, top - 4, spanX + 8, spanY + 8);

      context.globalCompositeOperation = 'lighter';
      context.shadowBlur = 0;
      context.strokeStyle = neuralFieldCssColor(
        style.fieldColor,
        Math.min(0.34, style.networkOpacity * 0.30 * intensity),
      );
      context.lineWidth = maximumSpan < 14 ? 1.15 : 0.72;
      const latticeCount = Math.max(4, Math.min(15, Math.round(maximumSpan / 34) + 4));
      const latticeReach = spanX + spanY;
      for (let index = 0; index <= latticeCount; index += 1) {
        const offset = index / latticeCount * latticeReach - spanY;
        context.beginPath();
        context.moveTo(left + offset, bottom);
        context.lineTo(left + offset + spanY, top);
        context.stroke();
        context.beginPath();
        context.moveTo(right - offset, bottom);
        context.lineTo(right - offset - spanY, top);
        context.stroke();
      }
      context.lineWidth = maximumSpan < 14 ? 0.95 : 0.54;
      const horizontalCount = Math.max(2, Math.min(7, Math.round(spanY / 30) + 2));
      for (let index = 1; index <= horizontalCount; index += 1) {
        const y = top + index / (horizontalCount + 1) * spanY;
        context.beginPath();
        context.moveTo(left, y);
        context.quadraticCurveTo(centerX, y - spanY * 0.12, right, y);
        context.stroke();
      }

      const nodeCount = Math.max(5, Math.min(26, Math.round(Math.sqrt(spanX * spanY) / 9)));
      context.fillStyle = neuralFieldCssColor(style.nodeColor, 0.42 * intensity);
      for (let index = 0; index < nodeCount; index += 1) {
        const u = ((index * 37 + 19) % 101) / 100;
        const v = ((index * 61 + 11) % 97) / 96;
        const radius = maximumSpan < 14 ? 1.15 : index % 5 === 0 ? 1.35 : 0.85;
        context.beginPath();
        context.arc(left + u * spanX, top + v * spanY, radius, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();

      traceNeuralFieldRing(context, ring, shift, width, height);
      context.save();
      context.globalCompositeOperation = 'lighter';
      context.strokeStyle = neuralFieldCssColor(style.nodeColor, 0.54 * intensity);
      context.lineWidth = maximumSpan < 14 ? 1.7 : 1.15;
      context.shadowColor = neuralFieldCssColor(style.fieldColor, 0.82 * intensity);
      context.shadowBlur = maximumSpan < 14 ? 3.5 : 5.5;
      context.stroke();
      context.restore();
      paintedParts += 1;
    }
  }
  return paintedParts;
}

interface NeuralDomeMetrics {
  readonly angularRadiusRadians: number;
  readonly domeHeight: number;
  readonly boundaryWorldRadius: number;
}

interface TerritoryNeuralDomeGeometry {
  readonly linePositions: readonly number[];
  readonly nodePositions: readonly number[];
  readonly groundAnchorCount: number;
  readonly elevatedVertexCount: number;
}

/** Immutable on-demand geometry; recovery/color changes only rewrite the pooled buffers. */
const TERRITORY_NEURAL_DOME_GEOMETRY_CACHE = new Map<
  string,
  TerritoryNeuralDomeGeometry
>();

function neuralFieldDomeMetrics(territoryId: string): NeuralDomeMetrics {
  const anchor = presentationAnchor(territoryId);
  const principalRing = [...preparedNeuralFieldRings(territoryId)]
    .sort((left, right) => right.visualArea - left.visualArea)[0];
  if (!anchor || !principalRing) {
    return { angularRadiusRadians: THREE.MathUtils.degToRad(0.65), domeHeight: 0.065, boundaryWorldRadius: 0.055 };
  }
  const anchorDirection = vectorFor(anchor[0], anchor[1], 1);
  let angularRadiusRadians = 0;
  for (const [longitude, latitude] of principalRing.points) {
    angularRadiusRadians = Math.max(
      angularRadiusRadians,
      Math.acos(THREE.MathUtils.clamp(
        anchorDirection.dot(vectorFor(longitude, latitude, 1)),
        -1,
        1,
      )),
    );
  }
  angularRadiusRadians = THREE.MathUtils.clamp(
    angularRadiusRadians,
    THREE.MathUtils.degToRad(0.35),
    THREE.MathUtils.degToRad(8),
  );
  const domeHeight = THREE.MathUtils.clamp(
    GLOBE_RADIUS * angularRadiusRadians * 0.52,
    0.065,
    0.42,
  );
  return {
    angularRadiusRadians,
    domeHeight,
    boundaryWorldRadius: THREE.MathUtils.clamp(
      GLOBE_RADIUS * angularRadiusRadians * 0.72,
      0.055,
      0.46,
    ),
  };
}

function pushDomeVector(target: number[], point: THREE.Vector3): void {
  target.push(point.x, point.y, point.z);
}

function pushDomeSegment(target: number[], start: THREE.Vector3, end: THREE.Vector3): void {
  pushDomeVector(target, start);
  pushDomeVector(target, end);
}

function sampledDomeBoundary(
  ring: PreparedNeuralFieldRing,
  sampleCount: number,
): THREE.Vector3[] {
  const result: THREE.Vector3[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const coordinate = ring.points[Math.floor(index / sampleCount * ring.points.length)]!;
    result.push(vectorFor(coordinate[0], coordinate[1], 1));
  }
  return result;
}

/**
 * Builds bounded true-3D cap ribs. Every land part receives ground-boundary
 * anchors; the largest parts also receive elevated spokes, cross-ribs and
 * nodes. Geometry is rebuilt only on canonical force placement changes.
 */
function buildTerritoryNeuralDomeGeometry(territoryId: string): TerritoryNeuralDomeGeometry {
  const linePositions: number[] = [];
  const nodePositions: number[] = [];
  let groundAnchorCount = 0;
  let elevatedVertexCount = 0;
  const rings = [...preparedNeuralFieldRings(territoryId)]
    .sort((left, right) => right.visualArea - left.visualArea);
  const principalArea = rings[0]?.visualArea ?? 0;
  const capRings = new Set(rings
    .filter((ring) => ring.visualArea >= principalArea * 0.0015)
    .slice(0, 18));

  for (const ring of rings) {
    const boundaryCount = THREE.MathUtils.clamp(
      Math.round(Math.sqrt(ring.points.length) * 1.35),
      4,
      18,
    );
    const boundary = sampledDomeBoundary(ring, boundaryCount);
    for (let index = 0; index < boundary.length; index += 1) {
      const start = boundary[index]!.clone().multiplyScalar(NEURAL_DOME_BASE_RADIUS);
      const end = boundary[(index + 1) % boundary.length]!
        .clone().multiplyScalar(NEURAL_DOME_BASE_RADIUS);
      pushDomeSegment(linePositions, start, end);
      groundAnchorCount += 1;
    }
    if (!capRings.has(ring)) continue;

    const centreDirection = boundary.reduce(
      (sum, point) => sum.add(point),
      new THREE.Vector3(),
    ).normalize();
    let angularExtent = 0;
    for (const point of boundary) {
      angularExtent = Math.max(
        angularExtent,
        Math.acos(THREE.MathUtils.clamp(centreDirection.dot(point), -1, 1)),
      );
    }
    const domeHeight = THREE.MathUtils.clamp(
      GLOBE_RADIUS * angularExtent * 0.52,
      0.055,
      0.42,
    );
    const tierPoints: THREE.Vector3[][] = Array.from(
      { length: NEURAL_DOME_SPOKE_STEPS },
      () => [],
    );
    for (let boundaryIndex = 0; boundaryIndex < boundary.length; boundaryIndex += 1) {
      const boundaryDirection = boundary[boundaryIndex]!;
      let previous = boundaryDirection.clone().multiplyScalar(NEURAL_DOME_BASE_RADIUS);
      if (boundaryIndex % 2 === 0) pushDomeVector(nodePositions, previous);
      for (let step = 1; step <= NEURAL_DOME_SPOKE_STEPS; step += 1) {
        const progress = step / NEURAL_DOME_SPOKE_STEPS;
        const direction = slerpDirection(boundaryDirection, centreDirection, progress);
        const point = direction.multiplyScalar(
          NEURAL_DOME_BASE_RADIUS + neuralDomeSpokeElevation(domeHeight, progress),
        );
        pushDomeSegment(linePositions, previous, point);
        tierPoints[step - 1]!.push(point);
        if (step < NEURAL_DOME_SPOKE_STEPS) pushDomeVector(nodePositions, point);
        elevatedVertexCount += 1;
        previous = point;
      }
    }
    // Two lateral rings create the visible curved shell instead of a bundle
    // of spokes converging into a flat marker.
    for (let tierIndex = 0; tierIndex < NEURAL_DOME_SPOKE_STEPS - 1; tierIndex += 1) {
      const tier = tierPoints[tierIndex]!;
      for (let index = 0; index < tier.length; index += 1) {
        pushDomeSegment(linePositions, tier[index]!, tier[(index + 1) % tier.length]!);
        if (index % 2 === 0 && tier.length > 6) {
          pushDomeSegment(linePositions, tier[index]!, tier[(index + 2) % tier.length]!);
        }
      }
    }
    pushDomeVector(
      nodePositions,
      centreDirection.multiplyScalar(NEURAL_DOME_BASE_RADIUS + domeHeight),
    );
  }
  return { linePositions, nodePositions, groundAnchorCount, elevatedVertexCount };
}

function preparedTerritoryNeuralDomeGeometry(
  territoryId: string,
): TerritoryNeuralDomeGeometry {
  const cached = TERRITORY_NEURAL_DOME_GEOMETRY_CACHE.get(territoryId);
  if (cached) return cached;
  const geometry = buildTerritoryNeuralDomeGeometry(territoryId);
  TERRITORY_NEURAL_DOME_GEOMETRY_CACHE.set(territoryId, geometry);
  return geometry;
}

function neuralFieldDomeShellPoint(
  sourceId: string,
  targetId: string,
  metrics: NeuralDomeMetrics,
): THREE.Vector3 | undefined {
  const source = presentationAnchor(sourceId);
  const target = presentationAnchor(targetId);
  if (!source || !target) return undefined;
  const sourceDirection = vectorFor(source[0], source[1], 1);
  const targetDirection = vectorFor(target[0], target[1], 1);
  const routeAngle = Math.acos(THREE.MathUtils.clamp(
    sourceDirection.dot(targetDirection),
    -1,
    1,
  ));
  if (routeAngle <= 1e-7) return targetDirection.multiplyScalar(
    NEURAL_DOME_BASE_RADIUS + metrics.domeHeight,
  );
  const interceptAngle = Math.min(
    metrics.angularRadiusRadians * 0.74,
    routeAngle * 0.82,
  );
  const direction = slerpDirection(
    targetDirection,
    sourceDirection,
    interceptAngle / routeAngle,
  );
  const shellElevation = neuralDomeShellElevation(
    metrics.domeHeight,
    interceptAngle / metrics.angularRadiusRadians,
  );
  return direction.multiplyScalar(NEURAL_DOME_BASE_RADIUS + shellElevation);
}

export class ThreeGlobeScene implements MapSceneAdapter {
  private readonly host: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(41, 1, 0.1, 180);
  private readonly controls: OrbitControls;
  private readonly globeGroup = new THREE.Group();
  private readonly routeGroup = new THREE.Group();
  private readonly commanderGroup = new THREE.Group();
  private readonly polarGroup = new THREE.Group();
  private readonly labelLayer: HTMLDivElement;
  private readonly antarcticaCard: HTMLDivElement;
  private readonly arcticCard: HTMLDivElement;
  private readonly globeTexture: GlobePoliticalTexture;
  private readonly politicalTexture: THREE.CanvasTexture;
  private readonly intelligenceFogMaskTexture: THREE.CanvasTexture;
  private readonly intelligenceFogCloudTexture: THREE.CanvasTexture;
  private readonly intelligenceFogCloudLayer: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly intelligenceFogClearCanvas: HTMLCanvasElement;
  private readonly intelligenceFogClearTexture: THREE.CanvasTexture;
  private readonly intelligenceFogClearMaterial: THREE.MeshStandardMaterial;
  private readonly intelligenceFogClearLayer: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  private readonly intelligenceFogTransition = createApexFogTransitionState();
  private intelligenceFogVisualBlend = 0;
  private intelligenceFogClearSnapshotReady = false;
  private readonly neuralFieldCoverageCanvas: HTMLCanvasElement;
  private readonly neuralFieldCoverageTexture: THREE.CanvasTexture;
  private readonly neuralFieldCoverageMaterial: THREE.MeshBasicMaterial;
  private readonly neuralFieldCoverageLayer: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private neuralFieldCoverageSignature = '';
  private readonly neuralDomeLinePositions = new Float32Array(
    NEURAL_DOME_MAX_LINE_SEGMENTS * 2 * 3,
  );
  private readonly neuralDomeLineColors = new Float32Array(
    NEURAL_DOME_MAX_LINE_SEGMENTS * 2 * 3,
  );
  private readonly neuralDomeNodePositions = new Float32Array(NEURAL_DOME_MAX_NODES * 3);
  private readonly neuralDomeNodeColors = new Float32Array(NEURAL_DOME_MAX_NODES * 3);
  private readonly neuralDomeLineGeometry = new THREE.BufferGeometry();
  private readonly neuralDomeNodeGeometry = new THREE.BufferGeometry();
  private readonly neuralDomeLineMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.78,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  private readonly neuralDomeNodeMaterial = new THREE.PointsMaterial({
    vertexColors: true,
    size: 2.35,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.92,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  private readonly neuralDomeLines = new THREE.LineSegments(
    this.neuralDomeLineGeometry,
    this.neuralDomeLineMaterial,
  );
  private readonly neuralDomeNodes = new THREE.Points(
    this.neuralDomeNodeGeometry,
    this.neuralDomeNodeMaterial,
  );
  private readonly neuralFieldGeometry = createStrategicNeuralFieldGeometry();
  private readonly neuralNetworkGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.82, 0.08, 0.014), new THREE.Vector3(-0.36, -0.38, 0.014),
    new THREE.Vector3(-0.36, -0.38, 0.014), new THREE.Vector3(0.02, 0.02, 0.014),
    new THREE.Vector3(0.02, 0.02, 0.014), new THREE.Vector3(0.54, -0.34, 0.014),
    new THREE.Vector3(0.02, 0.02, 0.014), new THREE.Vector3(0.46, 0.46, 0.014),
    new THREE.Vector3(0.02, 0.02, 0.014), new THREE.Vector3(-0.42, 0.44, 0.014),
    new THREE.Vector3(-0.42, 0.44, 0.014), new THREE.Vector3(-0.82, 0.08, 0.014),
  ]);
  private readonly neuralNodeGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.82, 0.08, 0.022),
    new THREE.Vector3(-0.36, -0.38, 0.022),
    new THREE.Vector3(0.02, 0.02, 0.022),
    new THREE.Vector3(0.54, -0.34, 0.022),
    new THREE.Vector3(0.46, 0.46, 0.022),
    new THREE.Vector3(-0.42, 0.44, 0.022),
  ]);
  private readonly apexFieldMaterial = new THREE.MeshBasicMaterial({
    color: STRATEGIC_NEURAL_FIELD_STYLE.apex.fieldColor,
    transparent: true,
    opacity: STRATEGIC_NEURAL_FIELD_STYLE.apex.fieldOpacity,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  private readonly primeFieldMaterial = new THREE.MeshBasicMaterial({
    color: STRATEGIC_NEURAL_FIELD_STYLE.roguePrime.fieldColor,
    transparent: true,
    opacity: STRATEGIC_NEURAL_FIELD_STYLE.roguePrime.fieldOpacity,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  private readonly apexNetworkMaterial = new THREE.LineBasicMaterial({
    color: STRATEGIC_NEURAL_FIELD_STYLE.apex.fieldColor,
    transparent: true,
    opacity: STRATEGIC_NEURAL_FIELD_STYLE.apex.networkOpacity,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly primeNetworkMaterial = new THREE.LineBasicMaterial({
    color: STRATEGIC_NEURAL_FIELD_STYLE.roguePrime.fieldColor,
    transparent: true,
    opacity: STRATEGIC_NEURAL_FIELD_STYLE.roguePrime.networkOpacity,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly apexNodeMaterial = new THREE.PointsMaterial({
    color: STRATEGIC_NEURAL_FIELD_STYLE.apex.nodeColor,
    size: 2.2,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly primeNodeMaterial = new THREE.PointsMaterial({
    color: STRATEGIC_NEURAL_FIELD_STYLE.roguePrime.nodeColor,
    size: 2.2,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly neuralConvergencePositions = new Float32Array(
    NEURAL_CONVERGENCE_PATH_POINT_COUNT * 3,
  );
  private readonly neuralConvergencePositionAttribute = new THREE.BufferAttribute(
    this.neuralConvergencePositions,
    3,
  ).setUsage(THREE.DynamicDrawUsage);
  private readonly neuralConvergenceGeometry = new THREE.BufferGeometry();
  private readonly neuralConvergenceMaterial = new THREE.LineBasicMaterial({
    color: STRATEGIC_NEURAL_FIELD_STYLE.apex.fieldColor,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly neuralConvergenceLine = new THREE.Line(
    this.neuralConvergenceGeometry,
    this.neuralConvergenceMaterial,
  );
  private readonly neuralContactMaterial = new THREE.MeshBasicMaterial({
    color: STRATEGIC_NEURAL_FIELD_STYLE.apex.nodeColor,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly neuralContact = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.035, 0),
    this.neuralContactMaterial,
  );
  private readonly neuralPulseSample = createNeuralFieldPulseSample();
  private readonly neuralConvergencePathSample = new THREE.Vector3();
  private neuralPulseStartedAt = -Infinity;
  private neuralConvergencePointCount = 0;
  private neuralPulseVisualId?: string;
  private neuralPulseTargetId?: string;
  private neuralPulseInterceptsIncoming = false;
  private neuralPulseAbility: NeuralFieldPulseResolution['ability'] = 'standard';
  private neuralPulseCounterpulseDamage = 0;
  private readonly globe: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  private readonly borderDetail: LineSegments2;
  private readonly gatewayRoutes: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private readonly gatewayRouteVertexRouteIndexes: number[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly pickSphere = new THREE.Sphere(new THREE.Vector3(), GLOBE_RADIUS);
  private readonly pickPoint = new THREE.Vector3();
  private readonly projectionPoint = new THREE.Vector3();
  private readonly commanderMarkerNormal = new THREE.Vector3();
  private readonly resizeObserver: ResizeObserver;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  readonly firstFrameReady: Promise<void>;
  private resolveFirstFrame?: () => void;
  private readonly nextFrameResolvers = new Set<() => void>();
  private readonly labels = new Map<string, GlobeLabel>();
  private readonly animatedRouteMaterials: AnimatedRouteMaterial[] = [];
  private readonly polarMaterials: AnimatedRouteMaterial[] = [];
  private readonly polarCorridors: PolarCorridorVisual[] = [];
  private readonly commanderForces = new Map<string, CommanderForceVisual>();
  private readonly visiblePolarSectorIds = new Set<MapPolarSectorId>();
  private readonly battleEffects: BattleEffect[] = [];
  private readonly battleProjectilePool = new GlobeBattleProjectilePool(
    this.reducedMotion ? 0 : BATTLE_EFFECT_MAX_ACTIVE,
  );
  private readonly battleWaveResourceCache = new GlobeBattleWaveResourceCache();
  private readonly backdropTextures: THREE.Texture[] = [];
  private readonly onBeforeUnload = (): void => this.destroy();
  private engine?: WorldMapEngineContract;
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
  private selection: MapSelectionState = { legalTargetIds: [] };
  private inputBlocked = false;
  private hoveredTerritoryId?: string;
  private hoveredPolarSectorId?: MapPolarSectorId;
  private hoveredPolarRegion?: MapPolarRegion;
  private focusedPolarRegion?: MapPolarRegion;
  private focusedPolarSectorId?: MapPolarSectorId;
  private pointerDown = false;
  private pointerDownX = 0;
  private pointerDownY = 0;
  private pointerTravel = 0;
  private pendingHoverSample?: PointerSample;
  private hoverFrameRequest = 0;
  private cameraFlight?: CameraFlight;
  private cameraActivityUntil = 0;
  private frameRequest = 0;
  private lastRenderAt = 0;
  private routeSignature = '';
  private gatewayRouteEmphasisSignature = '';
  private borderOwnershipSignature = '';
  private borderClosePresentation = false;
  private polarVisualSignature = '';
  private countryLabelSignature = '';
  private selectionSignature = '';
  private polarHoverPosition?: { x: number; y: number };
  private microstatePickProjectionCache?: {
    cameraPosition: THREE.Vector3;
    viewportLeft: number;
    viewportTop: number;
    viewportWidth: number;
    viewportHeight: number;
    anchors: readonly ProjectedMicrostatePickAnchor[];
  };
  private readonly lastLabelCameraPosition = new THREE.Vector3(1e9, 1e9, 1e9);
  private labelsDirty = true;
  private polarCardsDirty = true;
  private renderWidth = 0;
  private renderHeight = 0;
  private renderPixelRatio = 0;
  private destroyed = false;

  constructor() {
    this.firstFrameReady = new Promise<void>((resolve) => {
      this.resolveFirstFrame = resolve;
    });
    const host = document.querySelector<HTMLElement>('#game-canvas');
    if (!host) throw new Error('The map host #game-canvas is missing.');
    this.host = host;
    this.host.classList.add('globe-map');

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.domElement.className = 'globe-map__canvas';
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.setClearColor(0x020914, 1);
    this.host.append(this.renderer.domElement);

    this.labelLayer = document.createElement('div');
    this.labelLayer.className = 'globe-map__labels';
    this.labelLayer.setAttribute('aria-hidden', 'true');
    this.host.append(this.labelLayer);

    this.antarcticaCard = document.createElement('div');
    this.antarcticaCard.className = 'globe-map__polar-card globe-map__polar-card--antarctica';
    this.antarcticaCard.innerHTML = [
      '<small>POLAR SIGNAL · DORMANT</small>',
      '<strong>ANTARCTIC SECRETS</strong>',
      '<span>3 sealed access corridors</span>',
    ].join('');
    this.host.append(this.antarcticaCard);

    this.arcticCard = document.createElement('div');
    this.arcticCard.className = 'globe-map__polar-card globe-map__polar-card--arctic';
    this.arcticCard.innerHTML = [
      '<small>NORTH POLE · ROGUE SIGNAL</small>',
      '<strong>SIGNAL INVESTIGATION</strong>',
      '<span>Universal command site · no territory requirement</span>',
      '<b class="is-accessible">AVAILABLE TO EVERY COMMANDER</b>',
    ].join('');
    this.host.append(this.arcticCard);

    this.scene.background = new THREE.Color(0x020914);
    this.scene.fog = new THREE.FogExp2(0x020914, 0.012);
    this.camera.position.set(0.45, 1.1, DEFAULT_CAMERA_DISTANCE);
    this.camera.lookAt(0, 0, 0);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.11;
    this.controls.target.set(0, 0, 0);
    this.controls.enablePan = false;
    this.controls.minDistance = MIN_CAMERA_DISTANCE;
    this.controls.maxDistance = MAX_CAMERA_DISTANCE;
    this.controls.rotateSpeed = globeRotateSpeedForDistance(
      this.camera.position.length(),
      MIN_CAMERA_DISTANCE,
      MAX_CAMERA_DISTANCE,
    );
    this.controls.zoomSpeed = 0.9;
    this.controls.zoomToCursor = false;
    this.controls.autoRotate = false;
    this.controls.addEventListener('change', this.onControlsChange);
    this.controls.update();

    let livePoliticalTexture: THREE.CanvasTexture | undefined;
    let liveIntelligenceFogMaskTexture: THREE.CanvasTexture | undefined;
    this.globeTexture = new GlobePoliticalTexture(() => {
      if (livePoliticalTexture) livePoliticalTexture.needsUpdate = true;
      if (liveIntelligenceFogMaskTexture) liveIntelligenceFogMaskTexture.needsUpdate = true;
    }, this.renderer.capabilities.maxTextureSize);
    this.politicalTexture = livePoliticalTexture = new THREE.CanvasTexture(this.globeTexture.canvas);
    this.host.dataset.globeAtlas = String(this.globeTexture.canvas.width)
      + 'x' + String(this.globeTexture.canvas.height);
    this.host.dataset.globeMaxTextureSize = String(this.renderer.capabilities.maxTextureSize);
    this.politicalTexture.colorSpace = THREE.SRGBColorSpace;
    // The fixed high-resolution atlas already contains all close-range detail.
    // Linear filtering removes pixel stair-steps on flags and terrain detail
    // without switching textures or doing any extra work while zooming.
    this.politicalTexture.magFilter = THREE.LinearFilter;
    this.politicalTexture.minFilter = THREE.LinearFilter;
    this.politicalTexture.generateMipmaps = false;
    this.politicalTexture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.intelligenceFogMaskTexture = liveIntelligenceFogMaskTexture = new THREE.CanvasTexture(
      this.globeTexture.intelligenceFogMaskCanvas,
    );
    this.intelligenceFogMaskTexture.minFilter = THREE.LinearFilter;
    this.intelligenceFogMaskTexture.magFilter = THREE.LinearFilter;
    this.intelligenceFogMaskTexture.generateMipmaps = false;
    this.intelligenceFogCloudTexture = createApexFogCloudTexture();
    for (const material of [
      this.apexFieldMaterial,
      this.primeFieldMaterial,
      this.apexNetworkMaterial,
      this.primeNetworkMaterial,
      this.apexNodeMaterial,
      this.primeNodeMaterial,
    ]) material.userData.sharedApexUnitMaterial = true;

    // One bounded line buffer and one bounded node buffer render every active
    // true-3D neural cap. They are rewritten only when force placement changes.
    this.neuralDomeLineGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.neuralDomeLinePositions, 3)
        .setUsage(THREE.DynamicDrawUsage),
    );
    this.neuralDomeLineGeometry.setAttribute(
      'color',
      new THREE.BufferAttribute(this.neuralDomeLineColors, 3)
        .setUsage(THREE.DynamicDrawUsage),
    );
    this.neuralDomeNodeGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.neuralDomeNodePositions, 3)
        .setUsage(THREE.DynamicDrawUsage),
    );
    this.neuralDomeNodeGeometry.setAttribute(
      'color',
      new THREE.BufferAttribute(this.neuralDomeNodeColors, 3)
        .setUsage(THREE.DynamicDrawUsage),
    );
    this.neuralDomeLineGeometry.setDrawRange(0, 0);
    this.neuralDomeNodeGeometry.setDrawRange(0, 0);
    this.neuralDomeLines.visible = false;
    this.neuralDomeNodes.visible = false;
    this.neuralDomeLines.frustumCulled = false;
    this.neuralDomeNodes.frustumCulled = false;
    this.neuralDomeLines.renderOrder = 10.2;
    this.neuralDomeNodes.renderOrder = 10.3;
    this.neuralDomeLines.userData.pooledTerritoryNeuralDome = true;
    this.neuralDomeNodes.userData.pooledTerritoryNeuralDomeNodes = true;

    // One pooled convergence line + contact node. Canonical battle events only
    // rewrite this fixed buffer; no particles or attack objects are allocated.
    this.neuralConvergenceGeometry.setAttribute(
      'position',
      this.neuralConvergencePositionAttribute,
    );
    this.neuralConvergenceGeometry.setDrawRange(0, 0);
    this.neuralConvergenceLine.visible = false;
    this.neuralConvergenceLine.frustumCulled = false;
    this.neuralConvergenceLine.renderOrder = 12;
    this.neuralConvergenceLine.userData.pooledNeuralConvergence = true;
    this.neuralContact.visible = false;
    this.neuralContact.renderOrder = 12.1;
    this.neuralContact.userData.pooledNeuralContact = true;
    this.commanderGroup.add(
      this.neuralDomeLines,
      this.neuralDomeNodes,
      this.neuralConvergenceLine,
      this.neuralContact,
    );

    const globeMaterial = new THREE.MeshStandardMaterial({
      map: this.politicalTexture,
      roughness: 0.94,
      metalness: 0.01,
      emissive: new THREE.Color(0x03121b),
      emissiveIntensity: 0.10,
    });
    // A moderately denser single sphere keeps coastlines stable at the fixed
    // close-range camera limit. It remains one mesh and one draw call; no
    // geometry, texture or material is swapped while zooming.
    this.globe = new THREE.Mesh(new THREE.SphereGeometry(
      GLOBE_RADIUS,
      GLOBE_SPHERE_WIDTH_SEGMENTS,
      GLOBE_SPHERE_HEIGHT_SEGMENTS,
    ), globeMaterial);
    // One transparent political-size atlas carries both autonomous neural
    // fields. It is repainted only when a force changes territory/mode, so a
    // complete country dome remains one WebGL draw call rather than one mesh
    // per land part, line or node.
    this.neuralFieldCoverageCanvas = document.createElement('canvas');
    this.neuralFieldCoverageCanvas.width = Math.min(
      NEURAL_FIELD_ATLAS_MAX_WIDTH,
      this.globeTexture.canvas.width,
    );
    this.neuralFieldCoverageCanvas.height = Math.round(
      this.neuralFieldCoverageCanvas.width / 2,
    );
    this.neuralFieldCoverageTexture = new THREE.CanvasTexture(
      this.neuralFieldCoverageCanvas,
    );
    this.neuralFieldCoverageTexture.colorSpace = THREE.SRGBColorSpace;
    this.neuralFieldCoverageTexture.minFilter = THREE.LinearFilter;
    this.neuralFieldCoverageTexture.magFilter = THREE.LinearFilter;
    this.neuralFieldCoverageTexture.generateMipmaps = false;
    this.neuralFieldCoverageTexture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.neuralFieldCoverageMaterial = new THREE.MeshBasicMaterial({
      map: this.neuralFieldCoverageTexture,
      transparent: true,
      opacity: NEURAL_FIELD_COVERAGE_OPACITY,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.neuralFieldCoverageLayer = new THREE.Mesh(
      this.globe.geometry,
      this.neuralFieldCoverageMaterial,
    );
    this.neuralFieldCoverageLayer.scale.setScalar(1.0062);
    this.neuralFieldCoverageLayer.renderOrder = 8.35;
    this.neuralFieldCoverageLayer.visible = false;
    this.neuralFieldCoverageLayer.userData.sharedTerritoryNeuralFieldLayer = true;
    this.host.dataset.neuralFieldCoverage = 'shared-territory-atlas';
    // One reusable clear-atlas snapshot masks the already-dark canonical
    // texture during the short transmission hold and crossfade. It is a
    // single temporary draw call, never a territory mesh or per-frame copy.
    this.intelligenceFogClearCanvas = document.createElement('canvas');
    this.intelligenceFogClearCanvas.width = Math.min(2_048, this.globeTexture.canvas.width);
    this.intelligenceFogClearCanvas.height = Math.round(
      this.intelligenceFogClearCanvas.width / 2,
    );
    this.intelligenceFogClearTexture = new THREE.CanvasTexture(
      this.intelligenceFogClearCanvas,
    );
    this.intelligenceFogClearTexture.colorSpace = THREE.SRGBColorSpace;
    this.intelligenceFogClearTexture.minFilter = THREE.LinearFilter;
    this.intelligenceFogClearTexture.magFilter = THREE.LinearFilter;
    this.intelligenceFogClearTexture.generateMipmaps = false;
    this.intelligenceFogClearMaterial = new THREE.MeshStandardMaterial({
      map: this.intelligenceFogClearTexture,
      roughness: 0.94,
      metalness: 0.01,
      emissive: new THREE.Color(0x03121b),
      emissiveIntensity: 0.10,
      transparent: true,
      opacity: 0,
      depthTest: true,
      depthWrite: false,
    });
    this.intelligenceFogClearLayer = new THREE.Mesh(
      this.globe.geometry,
      this.intelligenceFogClearMaterial,
    );
    this.intelligenceFogClearLayer.scale.setScalar(1.00035);
    this.intelligenceFogClearLayer.visible = false;
    this.intelligenceFogClearLayer.renderOrder = 0.35;
    this.intelligenceFogClearLayer.userData.sharedApexFogClearCrossfade = true;
    this.intelligenceFogCloudLayer = new THREE.Mesh(
      this.globe.geometry,
      new THREE.MeshBasicMaterial({
        map: this.intelligenceFogCloudTexture,
        alphaMap: this.intelligenceFogMaskTexture,
        color: APEX_INTELLIGENCE_FOG_STYLE.cloudTint,
        transparent: true,
        opacity: APEX_INTELLIGENCE_FOG_STYLE.cloudAlpha,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.intelligenceFogCloudLayer.scale.setScalar(1.0045);
    this.intelligenceFogCloudLayer.renderOrder = 0.5;
    this.intelligenceFogCloudLayer.userData.sharedApexFogCloudLayer = true;
    this.borderDetail = this.createGlobeBorderDetail(mapBridge.engine);
    this.borderOwnershipSignature = globeBorderOwnershipSignature(mapBridge.engine);
    this.gatewayRoutes = this.createAuthoredGatewayRoutes();
    this.globeGroup.add(
      this.globe,
      this.intelligenceFogClearLayer,
      this.intelligenceFogCloudLayer,
      this.neuralFieldCoverageLayer,
      this.borderDetail,
      this.gatewayRoutes,
      this.routeGroup,
      this.commanderGroup,
      this.polarGroup,
    );
    this.scene.add(this.globeGroup);

    this.addLighting();
    this.addAtmosphere();
    this.addStars();
    this.addCelestialBackdrop();
    this.addSeaLabels();
    this.addAntarcticaPresentation();
    this.addArcticPresentation();
    this.bindInput();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.resize();
    window.addEventListener('beforeunload', this.onBeforeUnload, { once: true });
    mapBridge.attach(this);
    this.frameRequest = window.requestAnimationFrame(this.renderFrame);
  }

  sync(engine: WorldMapEngineContract): void {
    this.engine = engine;
    const intelligenceVisibility = selectApexIntelligenceVisibility(engine);
    const nowMs = globalThis.performance.now();
    const wasFogEnabled = this.intelligenceVisibility.enabled;
    const initialBlend = sampleApexFogVisualBlend(
      this.intelligenceFogTransition,
      intelligenceVisibility.enabled,
      engine.viewerKnowledge?.communicationsBlackoutTick,
      engine.state.tick,
      nowMs,
      this.reducedMotion,
      engine.viewerKnowledge?.communicationsBlackoutAnimateActivation === true,
    );
    if (!wasFogEnabled
      && intelligenceVisibility.enabled
      && this.intelligenceFogTransition.transitioning
      && initialBlend === 0) {
      this.captureApexFogClearAtlas();
    }
    if (intelligenceVisibility.signature !== this.intelligenceVisibility.signature) {
      this.intelligenceVisibility = intelligenceVisibility;
      this.microstatePickProjectionCache = undefined;
      this.labelsDirty = true;
      this.polarCardsDirty = true;
    }
    this.updateApexFogVisualBlend(nowMs);
    this.globeTexture.sync(engine, this.selection);
    this.updateGlobeBorderDetail(engine);
    this.updatePolarVisuals(engine);
    this.updateCommanderForces(engine);
    const labelSignature = this.buildCountryLabelSignature(engine);
    if (labelSignature !== this.countryLabelSignature) {
      this.countryLabelSignature = labelSignature;
      this.rebuildCountryLabels();
    }
    this.rebuildRoutes();
  }

  private captureApexFogClearAtlas(): void {
    const context = this.intelligenceFogClearCanvas.getContext('2d');
    if (!context) {
      this.intelligenceFogClearSnapshotReady = false;
      return;
    }
    context.clearRect(
      0,
      0,
      this.intelligenceFogClearCanvas.width,
      this.intelligenceFogClearCanvas.height,
    );
    context.drawImage(
      this.globeTexture.canvas,
      0,
      0,
      this.intelligenceFogClearCanvas.width,
      this.intelligenceFogClearCanvas.height,
    );
    this.intelligenceFogClearTexture.needsUpdate = true;
    this.intelligenceFogClearSnapshotReady = true;
  }

  /** Acknowledgement activates visibility limits; shared layers crossfade. */
  private updateApexFogVisualBlend(nowMs: number): void {
    const engine = this.engine;
    if (!engine) return;
    this.intelligenceFogVisualBlend = sampleApexFogVisualBlend(
      this.intelligenceFogTransition,
      this.intelligenceVisibility.enabled,
      engine.viewerKnowledge?.communicationsBlackoutTick,
      engine.state.tick,
      nowMs,
      this.reducedMotion,
      engine.viewerKnowledge?.communicationsBlackoutAnimateActivation === true,
    );
    const blend = this.intelligenceFogVisualBlend;
    this.intelligenceFogCloudLayer.visible = this.intelligenceVisibility.enabled && blend > 0;
    this.intelligenceFogCloudLayer.material.opacity = APEX_INTELLIGENCE_FOG_STYLE.cloudAlpha * blend;
    this.intelligenceFogClearMaterial.opacity = 1 - blend;
    this.intelligenceFogClearLayer.visible = this.intelligenceFogClearSnapshotReady
      && this.intelligenceFogTransition.transitioning
      && blend < 1;
    if (!this.intelligenceFogTransition.transitioning && blend >= 1) {
      this.intelligenceFogClearSnapshotReady = false;
      this.intelligenceFogClearLayer.visible = false;
    }
  }

  setSelection(selection: MapSelectionState): void {
    const signature = globeSelectionStateSignature(selection);
    if (signature === this.selectionSignature) return;
    this.selectionSignature = signature;
    this.selection = selection;
    this.clearPolarFocus();
    if (this.engine) this.globeTexture.sync(this.engine, selection);
    else this.globeTexture.setSelection(selection);
    this.updateAuthoredGatewayRouteEmphasis();
  }

  setInputBlocked(blocked: boolean): void {
    this.inputBlocked = blocked;
    this.controls.enabled = !blocked && !this.cameraFlight;
    if (blocked) {
      this.pointerDown = false;
      this.clearHover();
    }
  }

  focusAction(sourceId?: string, targetId?: string): void {
    const source = sourceId ? presentationAnchor(sourceId) : undefined;
    const target = targetId ? presentationAnchor(targetId) : undefined;
    if (!source && !target) return;
    // The established command UI expects the target to stay central behind
    // its review panel; source is only a fallback when no target exists.
    const anchor = target ?? source!;
    const direction = vectorFor(anchor[0], anchor[1]);
    this.startCameraFlight(direction, Math.min(this.camera.position.length(), 9.15), 520);
  }

  focusCountry(territoryId: string): void {
    const anchor = presentationAnchor(territoryId);
    if (!anchor) return;
    const country = COUNTRY_BY_ID_MAP.get(territoryId);
    this.startCameraFlight(
      vectorFor(anchor[0], anchor[1]),
      country ? countryFocusDistance(country, anchor) : DEFAULT_CAMERA_DISTANCE,
      this.reducedMotion ? 180 : 620,
    );
  }

  focusCommanderForce(playerId: string): void {
    const visual = this.commanderForces.get(playerId);
    if (!visual) return;
    this.startCameraFlight(
      visual.worldPosition.clone().normalize(),
      Math.min(this.camera.position.length(), 8.4),
      this.reducedMotion ? 180 : 560,
    );
  }

  territoryScreenPosition(territoryId: string): { x: number; y: number } | undefined {
    const anchor = presentationAnchor(territoryId);
    if (!anchor) return undefined;
    const projection = this.projectCoordinates(anchor[0], anchor[1]);
    return projection ? { x: projection.clientX, y: projection.clientY } : undefined;
  }

  playBattle(result: MapBattleEvent): void {
    const now = performance.now();
    const neuralField = this.triggerNeuralFieldPulse(result, now);
    const effectKey = `${result.sourceId}>${result.targetId}`;
    if (this.battleEffects.length >= BATTLE_EFFECT_MAX_ACTIVE
      || this.battleEffects.some((effect) => (
        effect.key === effectKey
        && now - effect.startedAt < BATTLE_EFFECT_COALESCE_WINDOW_MS
      ))) return;
    const path = routeBetween(
      result.sourceId,
      result.targetId,
      isSeaConnection(result.sourceId, result.targetId) ? 0.13 : 0.075,
      isSeaConnection(result.sourceId, result.targetId) ? 'naval' : 'land',
    );
    if (!path) return;
    if (neuralField?.interceptsIncoming) {
      const field = [...this.commanderForces.values()].find((visual) => (
        visual.coverageTerritoryId === neuralField.fieldTerritoryId
        && !visual.inTransit && visual.fieldOperational
      ));
      const shellPoint = field ? neuralFieldDomeShellPoint(
        result.sourceId,
        result.targetId,
        {
          angularRadiusRadians: field.domeAngularRadiusRadians,
          domeHeight: field.domeHeight,
          boundaryWorldRadius: field.coverageBoundaryWorldRadius,
        },
      ) : undefined;
      if (shellPoint) clipGlobeRouteToNeuralField(path, shellPoint);
    }
    const impactDirection = path[path.length - 1]!.clone().normalize();
    const cameraDirection = this.camera.position.clone().normalize();
    // Backside battles cannot be seen and would otherwise force the globe into
    // its active 60 fps cadence for the full effect lifetime.
    if (impactDirection.dot(cameraDirection) < -0.08) return;

    const group = new THREE.Group();
    const naval = isSeaConnection(result.sourceId, result.targetId);
    const color = result.conquered ? 0xffd36f : naval ? 0x62dfff : 0xff725f;
    const effectScale = battleEffectScale(result);
    const projectileScale = battleProjectileScale(effectScale);
    const routeMaterial = new THREE.LineDashedMaterial({
      color,
      transparent: true,
      opacity: this.reducedMotion ? 0.72 : 0.46,
      dashSize: naval ? 0.105 : 0.085,
      gapSize: naval ? 0.065 : 0.052,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const route = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(path),
      routeMaterial,
    );
    route.computeLineDistances();
    route.geometry.setDrawRange(0, this.reducedMotion ? path.length : 2);
    group.add(route);

    const projectile = this.reducedMotion
      ? undefined
      : this.battleProjectilePool.acquire(color, result.conquered);
    if (projectile) {
      projectile.group.position.copy(path[0]!);
      projectile.group.scale.setScalar(projectileScale);
      orientGlobeBattleProjectile(projectile.group, path[0]!, path[1] ?? path[0]!);
      group.add(projectile.group);
    }
    const targetCountry = neuralField?.interceptsIncoming
      ? undefined : COUNTRY_BY_ID_MAP.get(result.targetId);
    const targetAnchor = presentationAnchor(result.targetId);
    const waveRadiusDegrees = targetCountry && targetAnchor
      ? battleTerritoryWaveRadiusDegrees(targetAnchor, targetCountry.rings)
      : 0.8;
    const impactWave = !this.reducedMotion && targetCountry
      ? createGlobeBattleTerritoryWave(
        targetCountry,
        impactDirection,
        GLOBE_RADIUS,
        THREE.MathUtils.degToRad(waveRadiusDegrees),
        this.battleWaveResourceCache,
      )
      : undefined;
    if (impactWave) group.add(impactWave.mesh);
    this.globeGroup.add(group);
    this.battleEffects.push({
      key: effectKey,
      group,
      route,
      projectile,
      impactWave,
      projectileScale,
      path,
      startedAt: now,
      duration: this.reducedMotion ? 460 : 1_260 + Math.min(360, waveRadiusDegrees * 5),
    });
  }

  resetCamera(): void {
    this.clearPolarFocus();
    this.controls.target.set(0, 0, 0);
    this.startCameraFlight(new THREE.Vector3(0.035, 0.085, 1).normalize(), DEFAULT_CAMERA_DISTANCE, 520);
  }

  /** Resolves only after a subsequent WebGL frame has actually been drawn. */
  waitForNextFrame(): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    return new Promise<void>((resolve) => this.nextFrameResolvers.add(resolve));
  }

  /** Resolves when all relevant flags have settled into the baked map atlas. */
  waitForMapReady(): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    return this.globeTexture.waitForReady();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const resolve of this.nextFrameResolvers) resolve();
    this.nextFrameResolvers.clear();
    window.cancelAnimationFrame(this.frameRequest);
    window.cancelAnimationFrame(this.hoverFrameRequest);
    window.removeEventListener('beforeunload', this.onBeforeUnload);
    this.resizeObserver.disconnect();
    this.controls.removeEventListener('change', this.onControlsChange);
    this.controls.dispose();
    this.unbindInput();
    for (const effect of this.battleEffects) this.disposeBattleEffect(effect);
    this.battleEffects.length = 0;
    this.battleWaveResourceCache.dispose();
    this.battleProjectilePool.dispose();
    this.globeTexture.destroy();
    disposeObject(this.scene);
    this.neuralFieldGeometry.dispose();
    this.neuralNetworkGeometry.dispose();
    this.neuralNodeGeometry.dispose();
    this.apexFieldMaterial.dispose();
    this.primeFieldMaterial.dispose();
    this.apexNetworkMaterial.dispose();
    this.primeNetworkMaterial.dispose();
    this.apexNodeMaterial.dispose();
    this.primeNodeMaterial.dispose();
    this.neuralFieldCoverageTexture.dispose();
    this.neuralFieldCoverageMaterial.dispose();
    this.politicalTexture.dispose();
    this.intelligenceFogMaskTexture.dispose();
    this.intelligenceFogCloudTexture.dispose();
    this.intelligenceFogClearTexture.dispose();
    this.intelligenceFogClearMaterial.dispose();
    for (const texture of this.backdropTextures) texture.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labelLayer.remove();
    this.antarcticaCard.remove();
    this.arcticCard.remove();
    this.host.classList.remove('globe-map');
  }

  private disposeBattleEffect(effect: BattleEffect): void {
    this.globeGroup.remove(effect.group);
    if (effect.projectile) this.battleProjectilePool.release(effect.projectile);
    effect.impactWave?.dispose();
    disposeObject(effect.group);
  }

  private addLighting(): void {
    const hemisphere = new THREE.HemisphereLight(0xa7dcf0, 0x08131c, 0.58);
    const ambient = new THREE.AmbientLight(0x6f8e9f, 0.20);
    this.scene.add(hemisphere, ambient, this.camera);

    // Camera-local lights keep the entire visible hemisphere readable while
    // retaining a gentle upper-right key and cool opposite rim for depth.
    const key = new THREE.DirectionalLight(0xfff2d2, 2.72);
    key.position.set(5.2, 4.1, 3.4);
    key.target.position.set(0, 0, -4.5);
    const rim = new THREE.DirectionalLight(0x4d9bc7, 0.32);
    rim.position.set(-4.2, 1.1, 1.8);
    rim.target.position.set(0, 0, -4.5);
    this.camera.add(key, key.target, rim, rim.target);

    // Keep the polar endgame landmass readable when the camera crosses into
    // the southern hemisphere. This is presentation-only lighting; it does
    // not alter terrain, combat, ownership or any simulation value.
    const polarFill = new THREE.DirectionalLight(0xbfe8f0, 0.26);
    polarFill.position.set(-2, -9, 4);
    this.scene.add(polarFill);
  }

  private addAtmosphere(): void {
    const atmosphereMaterial = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float facing = abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)));
          float rim = pow(max(0.0, 1.0 - facing), 3.25);
          gl_FragColor = vec4(0.10, 0.55, 0.91, rim * 0.46);
        }
      `,
    });
    this.globeGroup.add(new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS * 1.032, 80, 52),
      atmosphereMaterial,
    ));
  }

  private addStars(): void {
    let seed = 0x2f6e2b1;
    const random = (): number => {
      seed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      seed ^= seed + Math.imul(seed ^ (seed >>> 7), 61 | seed);
      return ((seed ^ (seed >>> 14)) >>> 0) / 4_294_967_296;
    };
    const positions = new Float32Array(1350 * 3);
    const colors = new Float32Array(1350 * 3);
    for (let index = 0; index < 1350; index += 1) {
      const direction = new THREE.Vector3(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1).normalize();
      direction.multiplyScalar(30 + random() * 80);
      positions[index * 3] = direction.x;
      positions[index * 3 + 1] = direction.y;
      positions[index * 3 + 2] = direction.z;
      const temperature = random();
      const color = new THREE.Color(
        temperature < 0.07 ? 0xffd3a1 : temperature < 0.28 ? 0xf2f4ff : 0x9ed9f5,
      );
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.scene.add(new THREE.Points(geometry, new THREE.PointsMaterial({
      vertexColors: true,
      size: 0.042,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      fog: false,
    })));
  }

  private addCelestialBackdrop(): void {
    const sunTexture = createSunGlowTexture();
    this.backdropTextures.push(sunTexture);
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sunTexture,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      fog: false,
      toneMapped: false,
    }));
    sun.position.set(11.5, 5.2, -46);
    sun.scale.set(13.5, 13.5, 1);
    sun.renderOrder = -10;
    this.camera.add(sun);
  }

  private addSeaLabels(): void {
    for (const sea of SEA_MAP_LABELS) {
      // The flat map's authored Southern Ocean screen point has an ordinary
      // geographic equivalent on the globe.
      const longitude = sea.mapPosition && sea.id === 'southern-ocean' ? 0 : sea.longitude;
      const latitude = sea.mapPosition && sea.id === 'southern-ocean' ? -58 : sea.latitude;
      const element = document.createElement('div');
      element.className = `globe-map__sea-label globe-map__sea-label--${sea.kind}`;
      element.textContent = sea.name;
      if (sea.rotation) element.style.setProperty('--label-rotation', `${sea.rotation}deg`);
      this.labelLayer.append(element);
      this.labels.set(`sea:${sea.id}`, {
        id: `sea:${sea.id}`,
        kind: 'sea',
        longitude,
        latitude,
        worldPosition: vectorFor(longitude, latitude, GLOBE_RADIUS * 1.025),
        element,
        persistent: true,
        priority: sea.kind === 'ocean' ? 80 : 90,
        width: sea.kind === 'ocean' ? 190 : 120,
        height: 16,
      });
    }
  }

  /** One immutable dashed buffer for the exact authored world gateways. */
  private createAuthoredGatewayRoutes(): THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> {
    const positions: number[] = [];
    const colors: number[] = [];
    const baseColor = new THREE.Color(NAVAL_GATEWAY_PRESENTATION_STYLE.color);
    AUTHORED_NAVAL_GATEWAY_PRESENTATION_ROUTES.forEach((route, routeIndex) => {
      for (const [start, end] of route.dashedSegments) {
        for (const point of [start, end]) {
          const [longitude, latitude] = worldPointCoordinates(point);
          const position = vectorFor(longitude, latitude, GLOBE_RADIUS * 1.018);
          positions.push(position.x, position.y, position.z);
          colors.push(baseColor.r, baseColor.g, baseColor.b);
          this.gatewayRouteVertexRouteIndexes.push(routeIndex);
        }
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();
    const material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: NAVAL_GATEWAY_PRESENTATION_STYLE.opacity,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    });
    const lines = new THREE.LineSegments(geometry, material);
    lines.frustumCulled = false;
    lines.renderOrder = 1;
    lines.userData.authoredIntercontinentalGatewayBatch = true;
    lines.userData.drawCalls = 1;
    return lines;
  }

  private updateAuthoredGatewayRouteEmphasis(): void {
    const signature = [
      this.hoveredTerritoryId ?? '',
      this.selection.sourceId ?? '',
      this.selection.targetId ?? '',
    ].join(':');
    if (signature === this.gatewayRouteEmphasisSignature) return;
    this.gatewayRouteEmphasisSignature = signature;
    const colors = this.gatewayRoutes.geometry.getAttribute('color') as THREE.BufferAttribute;
    const baseColor = new THREE.Color(NAVAL_GATEWAY_PRESENTATION_STYLE.color);
    const emphasizedColor = new THREE.Color(NAVAL_GATEWAY_PRESENTATION_STYLE.emphasizedColor);
    const emphasizedRoutes = AUTHORED_NAVAL_GATEWAY_PRESENTATION_ROUTES.map((route) => (
      navalGatewayRouteEmphasized(
        route,
        this.hoveredTerritoryId,
        this.selection.sourceId,
        this.selection.targetId,
      )
    ));
    for (let index = 0; index < this.gatewayRouteVertexRouteIndexes.length; index += 1) {
      const color = emphasizedRoutes[this.gatewayRouteVertexRouteIndexes[index]!] ? emphasizedColor : baseColor;
      colors.setXYZ(index, color.r, color.g, color.b);
    }
    colors.needsUpdate = true;
  }

  /** One screen-space draw call reuses the already-loaded Natural Earth edges. */
  private createGlobeBorderDetail(
    engine?: WorldMapEngineContract,
  ): LineSegments2 {
    const buffer = buildGlobeBorderBuffer(engine, GLOBE_RADIUS);
    const geometry = new LineSegmentsGeometry()
      .setPositions(buffer.positions)
      .setColors(buffer.colors);
    const material = new LineMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      depthTest: true,
      depthWrite: false,
      worldUnits: false,
      alphaToCoverage: true,
      resolution: new THREE.Vector2(
        Math.max(1, this.renderWidth * this.renderPixelRatio),
        Math.max(1, this.renderHeight * this.renderPixelRatio),
      ),
    });
    material.linewidth = BORDER_LINEWIDTH_FAR;
    material.toneMapped = false;
    const detail = new LineSegments2(geometry, material);
    detail.frustumCulled = false;
    detail.renderOrder = 2;
    return detail;
  }

  private updateGlobeBorderDetail(engine: WorldMapEngineContract): void {
    const signature = globeBorderOwnershipSignature(engine);
    if (signature === this.borderOwnershipSignature) return;
    this.borderOwnershipSignature = signature;
    const buffer = buildGlobeBorderBuffer(engine, GLOBE_RADIUS);
    const position = this.borderDetail.geometry.getAttribute('instanceStart') as THREE.InterleavedBufferAttribute;
    const color = this.borderDetail.geometry.getAttribute('instanceColorStart') as THREE.InterleavedBufferAttribute;
    if (position.data.array.length === buffer.positions.length
      && color.data.array.length === buffer.colors.length) {
      (position.data.array as Float32Array).set(buffer.positions);
      (color.data.array as Float32Array).set(buffer.colors);
      position.data.needsUpdate = true;
      color.data.needsUpdate = true;
    } else {
      this.borderDetail.geometry.setPositions(buffer.positions);
      this.borderDetail.geometry.setColors(buffer.colors);
    }
    this.borderDetail.geometry.computeBoundingSphere();
  }

  private updateGlobeBorderPresentation(cameraDistance: number): void {
    const close = cameraDistance <= BORDER_CLOSE_PRESENTATION_DISTANCE;
    if (close === this.borderClosePresentation) return;
    this.borderClosePresentation = close;
    this.borderDetail.material.linewidth = close ? BORDER_LINEWIDTH_CLOSE : BORDER_LINEWIDTH_FAR;
    this.borderDetail.material.opacity = close ? 0.94 : 0.7;
  }

  private addAntarcticaPresentation(): void {
    const colors = [0x66eaff, 0xffc76b, 0xb68cff];
    ANTARCTICA_ACCESS_ANCHORS.forEach((anchor, index) => {
      const path = greatCirclePath(
        vectorFor(anchor.origin[0], anchor.origin[1], GLOBE_RADIUS * 1.008),
        vectorFor(anchor.longitude, anchor.latitude, GLOBE_RADIUS * 1.01),
        0.12,
        56,
      );
      const material = new THREE.LineDashedMaterial({
        color: colors[index]!,
        transparent: true,
        opacity: 0.22,
        dashSize: 0.12,
        gapSize: 0.105,
        depthWrite: false,
      });
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(path), material);
      line.computeLineDistances();
      this.polarGroup.add(line);
      const animation = { material, baseOpacity: 0.22, phase: index * 1.8 };
      this.polarMaterials.push(animation);

      const beaconMaterial = new THREE.MeshBasicMaterial({
        color: colors[index]!,
        transparent: true,
        opacity: 0.74,
        depthWrite: false,
      });
      const beacon = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.085, 1),
        beaconMaterial,
      );
      beacon.position.copy(vectorFor(anchor.longitude, anchor.latitude, GLOBE_RADIUS * 1.022));
      this.polarGroup.add(beacon);

      const element = document.createElement('div');
      element.className = 'globe-map__access-label';
      element.innerHTML = `<strong>SEALED</strong><span>${anchor.corridor.replaceAll('-', ' ')}</span>`;
      this.labelLayer.append(element);
      this.labels.set(`access:${anchor.id}`, {
        id: `access:${anchor.id}`,
        kind: 'access',
        longitude: anchor.longitude,
        latitude: anchor.latitude,
        worldPosition: vectorFor(anchor.longitude, anchor.latitude, GLOBE_RADIUS * 1.025),
        element,
        persistent: true,
        priority: 20 + index,
        width: 118,
        height: 34,
      });
      this.polarCorridors.push({
        line,
        beaconMaterial,
        label: element,
        animation,
        baseColor: colors[index]!,
        entrySectorId: anchor.entrySectorId,
      });
    });

    const pole = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.15, 1),
      new THREE.MeshBasicMaterial({
        color: 0x84edff,
        transparent: true,
        opacity: 0.68,
        depthWrite: false,
      }),
    );
    pole.position.copy(vectorFor(0, -88.5, GLOBE_RADIUS * 1.025));
    this.polarGroup.add(pole);
  }

  /** State-driven polar changes update the political atlas, labels and three routes. */
  private updatePolarVisuals(engine: WorldMapEngineContract): void {
    const polar = engine.state.polarEndgame;
    const signature = globePolarPresentationSignature(polar);
    if (signature === this.polarVisualSignature) return;
    this.polarVisualSignature = signature;
    const corridorsOpen = polar ? OPEN_ANTARCTICA_PHASES.has(polar.phase) : false;
    const legacyPresentation = !polar;

    for (const corridor of this.polarCorridors) {
      const sectorStatus = polar?.sectors[corridor.entrySectorId]?.status ?? 'hidden';
      const color = sectorStatus === 'contested' ? POLAR_SECTOR_COLORS.contested
        : sectorStatus === 'secured' ? POLAR_SECTOR_COLORS.secured
          : corridor.baseColor;
      corridor.line.visible = legacyPresentation || corridorsOpen;
      corridor.line.material.color.setHex(color);
      corridor.beaconMaterial.color.setHex(color);
      corridor.animation.baseOpacity = corridorsOpen ? 0.34 : 0.12;
      corridor.line.material.opacity = corridor.animation.baseOpacity;
      corridor.beaconMaterial.opacity = corridorsOpen ? 0.88 : 0.46;
      corridor.label.innerHTML = `<strong>${corridorsOpen ? 'OPEN' : 'SEALED'}</strong><span>${corridor.entrySectorId.replaceAll('-', ' ')}</span>`;
    }

    this.visiblePolarSectorIds.clear();
    if (corridorsOpen) {
      for (const sector of ANTARCTICA_SECTOR_PRESENTATIONS) {
        this.visiblePolarSectorIds.add(sector.id);
      }
    }

    const securedCount = polar
      ? Object.values(polar.sectors).filter((sector) => sector?.status === 'secured').length
      : 0;
    const phaseLabel = polar?.phase.replaceAll('-', ' ').toUpperCase() ?? 'DORMANT';
    this.antarcticaCard.innerHTML = [
      `<small>POLAR SIGNAL · ${phaseLabel}</small>`,
      `<strong>${corridorsOpen ? 'ANTARCTIC FRONT' : 'ANTARCTIC SECRETS'}</strong>`,
      `<span>${corridorsOpen ? `${securedCount}/9 sectors secured` : '3 sealed access corridors'}</span>`,
    ].join('');
    this.labelsDirty = true;
    this.polarCardsDirty = true;
  }

  private addArcticPresentation(): void {
    const beacon = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.11, 1),
      new THREE.MeshBasicMaterial({
        color: 0xcaf7ff,
        transparent: true,
        opacity: 0.46,
        depthWrite: false,
      }),
    );
    beacon.position.copy(vectorFor(20, 88.5, GLOBE_RADIUS * 1.02));
    this.polarGroup.add(beacon);
  }

  private rebuildCountryLabels(): void {
    if (!this.engine) return;
    const nextCountryLabelKeys = new Set<string>();

    const { state } = this.engine;
    const viewerApex = apexFieldPresentationActive(this.engine)
      ? state.commanderForces?.[state.humanPlayerId]
      : undefined;
    const viewerApexShield = apexShieldPresentation(viewerApex);
    const viewerApexOperational = viewerApexShield.visible;
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
    const polarTerritoriesVisible = OPEN_ANTARCTICA_PHASES.has(
      state.polarEndgame?.phase ?? 'dormant',
    );
    const labelDefinitions = GLOBE_TERRITORY_LABEL_DEFINITIONS.filter((territory) => (
      !territory.polar || polarTerritoriesVisible
    ));
    const humanPlayerIds = state.humanPlayerIds.length > 0
      ? state.humanPlayerIds
      : [state.humanPlayerId];
    const territoriesByOwner = new Map<string, string[]>();
    for (const definition of labelDefinitions) {
      const territory = state.territories[definition.id];
      if (!territory) continue;
      const territories = territoriesByOwner.get(territory.ownerId) ?? [];
      territories.push(definition.id);
      territoriesByOwner.set(territory.ownerId, territories);
    }
    const ownerLabelTerritory = new Map<string, string>();
    for (const [ownerId, territoryIds] of territoriesByOwner) {
      const owner = this.engine.player(ownerId);
      const capital = owner && territoryIds.includes(owner.capitalId)
        ? owner.capitalId
        : [...territoryIds].sort((left, right) => (
          (GLOBE_TERRITORY_LABEL_BY_ID.get(right)?.powerIndex ?? 0)
            - (GLOBE_TERRITORY_LABEL_BY_ID.get(left)?.powerIndex ?? 0)
          || left.localeCompare(right)
        ))[0];
      if (capital) ownerLabelTerritory.set(ownerId, capital);
    }

    const ranking = this.engine.globalRanking();
    const rankByOwner = new Map(ranking.map((entry, index) => [entry.player.id, index + 1]));
    const topPowerOwners = new Set(
      ranking.slice(0, PASSIVE_POWER_LABEL_LIMIT).map((entry) => entry.player.id),
    );
    const viewerWars = state.wars.filter((war) => (
      war.attackerId === state.humanPlayerId || war.defenderId === state.humanPlayerId
    ));
    const warOwners = new Set(viewerWars.flatMap((war) => [war.attackerId, war.defenderId]));
    const frontTerritories = new Set(viewerWars.flatMap((war) => [
      ...war.attackerOperations.flatMap((operation) => [operation.sourceId, operation.targetId]),
      ...war.defenderOperations.flatMap((operation) => [operation.sourceId, operation.targetId]),
    ]));
    const empirePower = new Map<string, number>();
    for (const territory of Object.values(state.territories)) {
      empirePower.set(territory.ownerId, (empirePower.get(territory.ownerId) ?? 0) + territory.army.power);
    }

    for (const definition of labelDefinitions) {
      const territory = state.territories[definition.id];
      if (!territory) continue;
      const exactIntel = apexTerritoryIntelVisible(this.intelligenceVisibility, definition.id);
      const clearIntel = apexTerritoryMapClear(this.intelligenceVisibility, definition.id);
      const frontierIntel = this.intelligenceVisibility.enabled && !clearIntel;
      const apexProjection = apexProjections.find((entry) => (
        entry.locationId === definition.id
          && (entry.projection === 'secondary' || !viewerApex?.transit)
      ));
      const apexSupport = viewerApexOperational && Boolean(apexProjection);
      const apexInbound = viewerApexOperational && definition.id === apexInboundTerritoryId;
      const apexSignal = apexSupport || apexInbound;
      const primeSignal = definition.id === primeSupportTerritoryId;
      const owner = this.engine.player(territory.ownerId);
      if (!owner) continue;
      const empireCapital = ownerLabelTerritory.get(owner.id) === definition.id;
      const localHeadquarters = empireCapital && owner.id === state.humanPlayerId;
      const topPowerRealm = empireCapital && topPowerOwners.has(owner.id);
      if (!apexTerritoryNamecardVisible(
        this.intelligenceVisibility,
        definition.id,
        owner.id,
        topPowerRealm,
      )) continue;
      const remotePassive = !exactIntel;
      const integrating = territory.transitOnly !== true
        && territory.coreOwnerId !== territory.ownerId && territory.integration < 0.999999;
      const opening = empireCapital ? state.openingMobilisations[owner.id] : undefined;
      const absorbed = !integrating
        && !empireCapital
        && (territoriesByOwner.get(owner.id)?.length ?? 0) > 1;
      const neighborOwnerIds = definition.neighborIds.flatMap((neighborId) => {
        const neighborOwnerId = state.territories[neighborId]?.ownerId;
        return neighborOwnerId ? [neighborOwnerId] : [];
      });
      const rogueTerritory = globeRogueTerritoryPresentation(
        owner.id,
        humanPlayerIds,
        neighborOwnerIds,
        frontTerritories.has(definition.id),
      );
      const supplyNode = globeTerritorySupplyNodePresentation(
        owner.id,
        state.humanPlayerId,
        empireCapital,
        integrating,
      );
      const compactSupplyNode = supplyNode.compact;
      const persistent = remotePassive
        || rogueTerritory.persistent
        || supplyNode.persistent
        || apexSignal
        || primeSignal
        || frontTerritories.has(definition.id)
        || (empireCapital && (owner.isHuman || topPowerOwners.has(owner.id) || warOwners.has(owner.id) || Boolean(opening)));
      const rank = rankByOwner.get(owner.id);
      const originalOwner = integrating ? this.engine.player(territory.coreOwnerId) : undefined;
      // Once integration is complete, the old nation ceases to exist on the
      // strategic map for rivals. Player-owned supply nodes remain compact and
      // persistent so their local readiness can always be followed. Rogue
      // occupation is the exception: each machine-held territory remains a
      // local readiness node, even after its former state is fully absorbed.
      if (absorbed && !compactSupplyNode && !rogueTerritory.rogue
        && !apexSignal && !primeSignal) continue;
      const name = integrating
        ? originalOwner?.name ?? definition.englishName
        : rogueTerritory.rogue ? definition.englishName
          : empireCapital ? owner.name : definition.englishName;
      const controllerLabel = owner.id === state.humanPlayerId ? 'YOU'
        : owner.isHuman ? `PLAYER ${compactControllerName(owner.controllerName).toUpperCase()}` : '';
      const integratingPercent = Math.round(territory.integration * 100);
      const integratingLocalPower = integrating
        ? compactNameplateCombatPower(territory.army.power)
        : '';
      const detail = remotePassive
        ? ''
        : frontierIntel
        ? `⚔ ${compactMapCombatPower(territory.army.power)}`
        : rogueTerritory.showPower
        ? `⚔ ${compactMapCombatPower(territory.army.power)}`
        : rogueTerritory.compact
          ? ''
        : integrating
        ? compactSupplyNode
          ? `PURGE ${integratingPercent}% · ${integratingLocalPower}`
          : `PURGE ${integratingPercent}% · LOCAL ${integratingLocalPower}`
        : compactSupplyNode
          ? compactNameplateCombatPower(territory.army.power)
        : empireCapital
          ? `${controllerLabel ? `${controllerLabel} · ` : ''}⚔ ${compactMapCombatPower(empirePower.get(owner.id) ?? territory.army.power)}`
          : `⚔ ${compactMapCombatPower(territory.army.power)}`;
      const openingText = !remotePassive && opening
        ? `${opening.direction === 'boost' ? 'OPENING BOOST' : 'OPENING LIMIT'} · ${Math.round(opening.remainingRatio * 100)}% LEFT`
        : '';
      const readiness = globeTerritoryReadinessPresentation(territory.army);
      const readinessVisible = clearIntel && (rogueTerritory.rogue
        || persistent
        || owner.id === state.humanPlayerId
        || warOwners.has(owner.id));
      const readinessMarkup = readinessVisible ? [
        `<div class="globe-map__territory-readiness is-${readiness.tone}" role="img" aria-label="Local force readiness">`,
        `<i style="--readiness-fill:${Math.round(readiness.fillRatio * 1000) / 10}%"></i>`,
        `<b style="--readiness-local:${Math.round(readiness.localCapacityRatio * 1000) / 10}%"></b>`,
        '</div>',
      ].join('') : '';
      const primePower = primeState?.force
        ? commanderForceMapCombatPower(primeState.force.army) : 0;
      const signalBadge = apexSupport
        ? `<i class="globe-map__ai-signal is-apex${apexProjection?.split ? ' is-split' : ''}${apexProjection?.singularityCharged ? ' is-charged' : ''}" aria-label="APEX neural shield at ${viewerApexShield.percent}% shared integrity${apexProjection?.split ? '; twin projection at 60% combat intensity' : ''}${apexProjection?.singularityCharged ? '; Singularity Pulse charged' : ''}">${apexProjection?.label ?? viewerApexShield.label}</i>`
        : apexInbound
          ? `<i class="globe-map__ai-signal is-apex is-inbound" aria-label="${viewerApexShield.label} inbound; not yet protecting this territory">${viewerApexShield.label} · INBOUND</i>`
        : primeSignal
          ? `<i class="globe-map__ai-signal is-prime" aria-label="ROGUE PRIME supporting with ${compactMapCombatPower(primePower)} power">+${compactMapCombatPower(primePower)} PRIME</i>`
          : '';
      const key = `country:${definition.id}`;
      const existingLabel = this.labels.get(key);
      const element = existingLabel?.kind === 'country'
        ? existingLabel.element
        : document.createElement('div');
      const readinessPercent = Math.round(readiness.fillRatio * 100);
      const baseSemanticTitle = remotePassive
        ? `${definition.englishName} · Global power rank #${rank ?? '—'} · Live intelligence unavailable`
        : frontierIntel
        ? `${definition.englishName} · Partial APEX intel · Local power ${compactMapCombatPower(territory.army.power)}`
        : rogueTerritory.rogue
        ? `${definition.englishName} · Rogue AI readiness ${readinessPercent}%${rogueTerritory.showPower ? ` · Local power ${compactMapCombatPower(territory.army.power)}` : ''}`
        : localHeadquarters
          ? `${owner.name} headquarters · Empire power ${compactMapCombatPower(empirePower.get(owner.id) ?? territory.army.power)} · ${readinessPercent}% readiness`
        : integrating
        ? `Signal purge ${integratingPercent}% · Local power ${compactMapCombatPower(territory.army.power)}`
        : compactSupplyNode
          ? `Local power ${compactMapCombatPower(territory.army.power)}`
          : '';
      const signalSemantic = apexSupport
        ? `APEX neural shield at ${viewerApexShield.percent}% shared integrity${apexProjection?.split ? ' with a 60% twin projection' : ''}${apexProjection?.singularityCharged ? '; Singularity Pulse charged' : ''}`
        : apexInbound
          ? `${viewerApexShield.label} inbound; not yet protecting this territory`
        : primeSignal
          ? `ROGUE PRIME supporting with ${compactMapCombatPower(primePower)} power`
          : '';
      const semanticTitle = [baseSemanticTitle, signalSemantic].filter(Boolean).join(' · ');
      if (element.title !== semanticTitle) element.title = semanticTitle;
      if (semanticTitle) element.setAttribute('aria-label', semanticTitle);
      else element.removeAttribute('aria-label');
      const className = [
        'globe-map__country-label',
        owner.id === state.humanPlayerId ? 'is-human is-local-human'
          : owner.isHuman ? 'is-human is-other-human' : '',
        localHeadquarters ? 'is-home-capital' : '',
        integrating && !compactSupplyNode ? 'is-integrating' : '',
        compactSupplyNode ? 'is-local-absorbed' : '',
        definition.polar ? 'is-antarctic' : '',
        rogueTerritory.rogue ? 'is-rogue' : '',
        rogueTerritory.compact ? 'is-rogue-compact' : '',
        rogueTerritory.showPower ? 'is-rogue-threat' : '',
        apexSignal ? 'has-apex-signal' : '',
        apexInbound ? 'has-apex-inbound' : '',
        primeSignal ? 'has-prime-signal' : '',
        remotePassive ? 'is-intel-veiled' : '',
        frontTerritories.has(definition.id)
          || (!rogueTerritory.rogue && warOwners.has(owner.id)) ? 'is-active' : '',
        readinessVisible ? 'has-readiness' : '',
        !remotePassive && opening ? `has-opening is-opening-${opening.direction}` : '',
      ].filter(Boolean).join(' ');
      const markup = remotePassive
        ? `<strong>${compactCountryName(name).toUpperCase()}${rank ? ` <em>#${rank}</em>` : ''}</strong>`
        : rogueTerritory.compact && !signalBadge
        ? readinessMarkup
        : localHeadquarters
          ? [
            `<strong><i class="globe-map__hq-mark" aria-hidden="true"></i><em>PWR ${compactNameplateCombatPower(empirePower.get(owner.id) ?? territory.army.power)}</em></strong>`,
            signalBadge,
            readinessMarkup,
          ].join('')
        : [
        compactSupplyNode
          ? ''
          : `<strong>${compactCountryName(name).toUpperCase()}${empireCapital && rank ? ` <em>#${rank}</em>` : ''}</strong>`,
        detail || signalBadge ? `<span>${detail}${signalBadge}</span>` : '',
        readinessMarkup,
        openingText ? `<small>${openingText}</small>` : '',
      ].join('');
      if (existingLabel?.className !== className) element.className = className;
      if (existingLabel?.markup !== markup) element.innerHTML = markup;
      if (!existingLabel || existingLabel.kind !== 'country') this.labelLayer.append(element);
      nextCountryLabelKeys.add(key);
      const anchor = definition.anchor;
      const markupChanged = existingLabel?.markup !== markup;
      this.labels.set(key, {
        id: definition.id,
        kind: 'country',
        longitude: anchor[0],
        latitude: anchor[1],
        worldPosition: existingLabel?.kind === 'country'
          ? existingLabel.worldPosition
          : vectorFor(anchor[0], anchor[1], GLOBE_RADIUS * 1.025),
        element,
        detailElement: markupChanged
          ? element.querySelector<HTMLElement>('span') ?? undefined
          : existingLabel?.detailElement,
        persistent,
        priority: rogueTerritory.showPower ? 1
          : compactSupplyNode ? 2
          : integrating ? 3
          : frontTerritories.has(definition.id) ? 3
            : owner.isHuman ? 4
              : topPowerOwners.has(owner.id) ? 10 + (rank ?? PASSIVE_POWER_LABEL_LIMIT)
                : rogueTerritory.compact ? 48 + definition.labelRank
                  : 55 + definition.labelRank,
        width: remotePassive ? 122
          : signalBadge ? localHeadquarters ? 78 : 122
          : rogueTerritory.compact ? 30
          : localHeadquarters ? 70
          : opening ? 154 : compactSupplyNode ? integrating ? 92 : 72 : integrating ? 112 : 122,
        height: remotePassive ? 26
          : rogueTerritory.compact ? 8 : localHeadquarters ? signalBadge ? 43 : 25
          : opening ? 58 : readinessVisible ? 43 : 36,
        className,
        markup,
        displayed: existingLabel?.displayed,
        detailDisplayed: markupChanged ? undefined : existingLabel?.detailDisplayed,
        selected: existingLabel?.className === className ? existingLabel.selected : undefined,
        transform: existingLabel?.transform,
      });
    }

    for (const [key, label] of this.labels) {
      if (!key.startsWith('country:') || nextCountryLabelKeys.has(key)) continue;
      label.element.remove();
      this.labels.delete(key);
    }
    this.labelsDirty = true;
  }

  private buildCountryLabelSignature(engine: WorldMapEngineContract): string {
    const polarTerritoriesVisible = OPEN_ANTARCTICA_PHASES.has(
      engine.state.polarEndgame?.phase ?? 'dormant',
    );
    const territorySignature = GLOBE_TERRITORY_LABEL_DEFINITIONS
      .filter((definition) => !definition.polar || polarTerritoriesVisible)
      .map((definition) => {
      const territory = engine.state.territories[definition.id];
      const readiness = territory
        ? globeTerritoryReadinessPresentation(territory.army)
        : undefined;
      const localPower = territory && (
        territory.ownerId === 'rai' || territory.coreOwnerId !== territory.ownerId
      ) ? compactNameplateCombatPower(territory.army.power) : '';
      return territory
        ? `${territory.ownerId}:${territory.coreOwnerId}:${Math.round(territory.integration * 100)}:${Math.round(readiness!.fillRatio * 20)}:${Math.round(readiness!.localCapacityRatio * 20)}:${localPower}`
        : '';
      }).join(',');
    const powerByOwner = new Map<string, number>();
    for (const territory of Object.values(engine.state.territories)) {
      powerByOwner.set(
        territory.ownerId,
        (powerByOwner.get(territory.ownerId) ?? 0) + territory.army.power,
      );
    }
    const powerSignature = [...powerByOwner]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([ownerId, power]) => `${ownerId}:${compactMapCombatPower(power)}`)
      .join(',');
    const controllerSignature = [...powerByOwner.keys()]
      .sort((left, right) => left.localeCompare(right))
      .map((ownerId) => {
        const owner = engine.player(ownerId);
        return `${ownerId}:${owner?.name ?? ''}:${owner?.isHuman ? 1 : 0}:${owner?.controllerName ?? ''}`;
      })
      .join(',');
    const openingSignature = Object.values(engine.state.openingMobilisations)
      .sort((left, right) => left.playerId.localeCompare(right.playerId))
      .map((phase) => `${phase.playerId}:${phase.direction}:${Math.round(phase.remainingRatio * 100)}`)
      .join(',');
    const rankingSignature = engine.globalRanking().slice(0, PASSIVE_POWER_LABEL_LIMIT)
      .map((entry) => entry.player.id)
      .join(',');
    const warSignature = engine.state.wars.map((war) => [
      war.id,
      war.attackerId,
      war.defenderId,
      ...war.attackerOperations.flatMap((operation) => [operation.sourceId, operation.targetId]),
      ...war.defenderOperations.flatMap((operation) => [operation.sourceId, operation.targetId]),
    ].join(':')).join('|');
    const apex = apexFieldPresentationActive(engine)
      ? engine.state.commanderForces?.[engine.state.humanPlayerId]
      : undefined;
    const apexShield = apexShieldPresentation(apex);
    const prime = engine.state.polarEndgame?.roguePrime;
    const fieldSignature = [
      apex?.locationId ?? '',
      apex?.mission ?? '',
      apex?.transit?.path.join('>') ?? '',
      apexShield.visible ? apexShield.label : 'shield-offline',
      apex?.doctrineRuntime?.lancerSupportedAssaultCount ?? 0,
      apex?.doctrineRuntime?.secondaryProjection?.locationId ?? '',
      apex?.doctrineRuntime?.secondaryProjection?.front.targetId ?? '',
      prime?.status ?? '',
      prime?.force?.locationId ?? '',
      prime?.force?.transit?.path.join('>') ?? '',
      prime?.force
        ? compactMapCombatPower(commanderForceMapCombatPower(prime.force.army)) : '',
    ].join(':');
    return `${this.intelligenceVisibility.signature}|${engine.state.humanPlayerId}|${territorySignature}|${powerSignature}|${controllerSignature}|${openingSignature}|${rankingSignature}|${warSignature}|${fieldSignature}`;
  }

  private rebuildRoutes(): void {
    if (!this.engine) return;
    const operations = this.engine.state.wars
      .filter((war) => (
        war.attackerId === this.engine!.state.humanPlayerId
        || war.defenderId === this.engine!.state.humanPlayerId
      ))
      .flatMap((war) => [
      ...war.attackerOperations,
      ...war.defenderOperations,
      ])
      .filter((operation) => (
        apexTerritoryIntelVisible(this.intelligenceVisibility, operation.sourceId)
        && apexTerritoryIntelVisible(this.intelligenceVisibility, operation.targetId)
      ))
      .sort((left, right) => (
      left.commanderId.localeCompare(right.commanderId)
      || left.sourceId.localeCompare(right.sourceId)
      || left.targetId.localeCompare(right.targetId)
    ));
    const logistics = selectGlobeVisibleLogisticsRoutes(
      this.engine.state.logisticsMovements,
      this.engine.state.humanPlayerId,
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
    const signature = [
      ...operations.map((operation) => `${operation.commanderId}:${operation.sourceId}:${operation.targetId}:${operation.access ?? ''}`),
      ...logistics.map((movement) => `l:${movement.allegiance}:${movement.access ?? ''}:${movement.sourceId}:${movement.targetId}`),
    ].join('|');
    if (signature === this.routeSignature) return;
    this.routeSignature = signature;
    disposeObject(this.routeGroup);
    this.routeGroup.clear();
    this.animatedRouteMaterials.length = 0;

    operations.forEach((operation, index) => {
      const naval = operation.access === 'naval' || isSeaConnection(operation.sourceId, operation.targetId);
      const path = routeBetween(
        operation.sourceId,
        operation.targetId,
        naval ? 0.075 : 0.055,
        naval ? 'naval' : 'land',
      );
      const commander = this.engine?.player(operation.commanderId);
      if (!path || !commander) return;
      const material = naval
        ? new THREE.LineDashedMaterial({
          color: commander.isHuman ? 0x5fe6ff : 0x4faac8,
          transparent: true,
          opacity: 0.68,
          dashSize: 0.14,
          gapSize: 0.09,
          depthWrite: false,
        })
        : new THREE.LineBasicMaterial({
          color: commander.isHuman ? 0xffba5f : commander.color,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
        });
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(path), material);
      if (material instanceof THREE.LineDashedMaterial) line.computeLineDistances();
      this.routeGroup.add(line);
      this.animatedRouteMaterials.push({ material, baseOpacity: material.opacity, phase: index * 0.8 });
    });

    logistics.forEach((movement, index) => {
      const movementAccess = movement.access
        ?? (isSeaConnection(movement.sourceId, movement.targetId) ? 'naval' : 'land');
      const path = routeBetween(movement.sourceId, movement.targetId, 0.065, movementAccess);
      if (!path) return;
      const rogueRoute = movement.allegiance === 'rogue-ai';
      const material = new THREE.LineDashedMaterial({
        color: rogueRoute ? 0xff5f57 : 0x86f0ff,
        transparent: true,
        opacity: rogueRoute ? 0.66 : 0.54,
        dashSize: rogueRoute ? 0.075 : 0.065,
        gapSize: rogueRoute ? 0.06 : 0.075,
        depthWrite: false,
      });
      const dashOffsetUniform = { value: 0 };
      material.onBeforeCompile = (shader) => {
        shader.uniforms.routeDashOffset = dashOffsetUniform;
        shader.fragmentShader = shader.fragmentShader
          .replace(
            'uniform float totalSize;',
            'uniform float totalSize;\nuniform float routeDashOffset;',
          )
          .replace(
            'mod( vLineDistance, totalSize )',
            'mod( vLineDistance + routeDashOffset, totalSize )',
          );
      };
      material.customProgramCacheKey = () => 'ww3-flowing-route-dash-v1';
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(path), material);
      line.computeLineDistances();
      this.routeGroup.add(line);
      this.animatedRouteMaterials.push({
        material,
        baseOpacity: rogueRoute ? 0.66 : 0.54,
        phase: 1.2 + index,
        flowSpeed: rogueRoute ? 0.31 : 0.24,
        dashOffsetUniform,
      });
    });
  }

  private triggerNeuralFieldPulse(
    result: MapBattleEvent,
    now: number,
  ): NeuralFieldPulseResolution | undefined {
    let visual: CommanderForceVisual | undefined;
    let visualId: string | undefined;
    let resolution: NeuralFieldPulseResolution | undefined;
    for (const [candidateId, candidate] of this.commanderForces) {
      if (candidate.inTransit || !candidate.fieldOperational || !candidate.combatActive) continue;
      const controllers = candidate.role === 'rogue-prime'
        ? new Set([candidateId, 'rai', ROGUE_PRIME_RENDER_ID])
        : new Set([candidateId]);
      const candidateResolution = resolveNeuralFieldPulseTarget(
        result,
        controllers,
        candidate.frontTargetId,
      );
      if (!candidateResolution) continue;
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
    const naval = isSeaConnection(startId, targetId);
    const path = routeBetween(startId, targetId, naval ? 0.075 : 0.045, naval ? 'naval' : 'land');
    if (!path || path.length < 2) return undefined;
    if (resolution.interceptsIncoming) {
      const shellPoint = neuralFieldDomeShellPoint(startId, targetId, {
        angularRadiusRadians: visual.domeAngularRadiusRadians,
        domeHeight: visual.domeHeight,
        boundaryWorldRadius: visual.coverageBoundaryWorldRadius,
      });
      if (!shellPoint) return undefined;
      clipGlobeRouteToNeuralField(path, shellPoint);
    }

    this.neuralConvergencePointCount = Math.min(
      NEURAL_CONVERGENCE_PATH_POINT_COUNT,
      path.length,
    );
    for (let index = 0; index < this.neuralConvergencePointCount; index += 1) {
      const pathProgress = index / Math.max(1, this.neuralConvergencePointCount - 1)
        * (path.length - 1);
      const pathIndex = Math.floor(pathProgress);
      const nextPathIndex = Math.min(path.length - 1, pathIndex + 1);
      this.neuralConvergencePathSample.lerpVectors(
        path[pathIndex]!,
        path[nextPathIndex]!,
        pathProgress - pathIndex,
      );
      const offset = index * 3;
      this.neuralConvergencePositions[offset] = this.neuralConvergencePathSample.x;
      this.neuralConvergencePositions[offset + 1] = this.neuralConvergencePathSample.y;
      this.neuralConvergencePositions[offset + 2] = this.neuralConvergencePathSample.z;
    }
    if (!resolution.interceptsIncoming) {
      this.neuralConvergencePositions[0] = visual.worldPosition.x;
      this.neuralConvergencePositions[1] = visual.worldPosition.y;
      this.neuralConvergencePositions[2] = visual.worldPosition.z;
    }
    this.neuralConvergencePositionAttribute.needsUpdate = true;
    this.neuralConvergenceGeometry.setDrawRange(0, this.neuralConvergencePointCount);
    if (!this.neuralConvergencePathFrontVisible()) {
      this.neuralConvergencePointCount = 0;
      this.neuralConvergenceGeometry.setDrawRange(0, 0);
      return undefined;
    }
    const style = visual.role === 'rogue-prime'
      ? STRATEGIC_NEURAL_FIELD_STYLE.roguePrime
      : STRATEGIC_NEURAL_FIELD_STYLE.apex;
    this.neuralConvergenceMaterial.color.setHex(style.fieldColor);
    this.neuralContactMaterial.color.setHex(style.nodeColor);
    this.neuralPulseVisualId = visualId;
    this.neuralPulseTargetId = resolution.fieldTerritoryId;
    this.neuralPulseInterceptsIncoming = resolution.interceptsIncoming;
    this.neuralPulseAbility = resolution.ability;
    this.neuralPulseCounterpulseDamage = resolution.counterpulseDamage;
    this.neuralPulseStartedAt = now;
    this.host.dataset.apexAbilityPulse = resolution.ability;
    this.host.dataset.apexCounterpulseDamage = String(resolution.counterpulseDamage);
    this.cameraActivityUntil = Math.max(
      this.cameraActivityUntil,
      now + neuralFieldPulseDurationMs(this.reducedMotion),
    );
    return resolution;
  }

  private neuralConvergencePathFrontVisible(): boolean {
    const cameraLength = this.camera.position.length();
    if (cameraLength <= 1e-8 || this.neuralConvergencePointCount < 2) return false;
    for (let index = 0; index < this.neuralConvergencePointCount; index += 1) {
      const offset = index * 3;
      const x = this.neuralConvergencePositions[offset]!;
      const y = this.neuralConvergencePositions[offset + 1]!;
      const z = this.neuralConvergencePositions[offset + 2]!;
      const pointLength = Math.hypot(x, y, z);
      if (pointLength <= 1e-8) return false;
      const facing = (
        x * this.camera.position.x
        + y * this.camera.position.y
        + z * this.camera.position.z
      ) / (pointLength * cameraLength);
      if (facing < FRONT_VISIBILITY_DOT) return false;
    }
    return true;
  }

  private rebuildTerritoryNeuralDomes(
    entries: readonly CommanderForceRenderEntry[],
  ): void {
    let lineVertexCount = 0;
    let nodeCount = 0;
    let groundAnchorCount = 0;
    let elevatedVertexCount = 0;
    for (const entry of entries) {
      const mode = neuralFieldModePresentation(
        entry.moving,
        entry.recovering,
        entry.fieldOperational,
      );
      if (!mode.fieldVisible) continue;
      const dome = preparedTerritoryNeuralDomeGeometry(entry.force.locationId);
      const style = entry.role === 'rogue-prime'
        ? STRATEGIC_NEURAL_FIELD_STYLE.roguePrime
        : STRATEGIC_NEURAL_FIELD_STYLE.apex;
      const color = new THREE.Color(style.fieldColor).multiplyScalar(
        (mode.recoveryField ? 0.46 : 1) * entry.fieldIntensity,
      );
      const availableLineVertices = NEURAL_DOME_MAX_LINE_SEGMENTS * 2 - lineVertexCount;
      const requestedLineVertices = Math.floor(dome.linePositions.length / 3);
      const copiedLineVertices = Math.min(
        requestedLineVertices - requestedLineVertices % 2,
        availableLineVertices - availableLineVertices % 2,
      );
      for (let index = 0; index < copiedLineVertices; index += 1) {
        const sourceOffset = index * 3;
        const targetOffset = (lineVertexCount + index) * 3;
        this.neuralDomeLinePositions[targetOffset] = dome.linePositions[sourceOffset]!;
        this.neuralDomeLinePositions[targetOffset + 1] = dome.linePositions[sourceOffset + 1]!;
        this.neuralDomeLinePositions[targetOffset + 2] = dome.linePositions[sourceOffset + 2]!;
        this.neuralDomeLineColors[targetOffset] = color.r;
        this.neuralDomeLineColors[targetOffset + 1] = color.g;
        this.neuralDomeLineColors[targetOffset + 2] = color.b;
      }
      lineVertexCount += copiedLineVertices;

      const availableNodes = NEURAL_DOME_MAX_NODES - nodeCount;
      const copiedNodes = Math.min(
        Math.floor(dome.nodePositions.length / 3),
        availableNodes,
      );
      const nodeColor = new THREE.Color(style.nodeColor).multiplyScalar(
        (mode.recoveryField ? 0.46 : 1) * entry.fieldIntensity,
      );
      for (let index = 0; index < copiedNodes; index += 1) {
        const sourceOffset = index * 3;
        const targetOffset = (nodeCount + index) * 3;
        this.neuralDomeNodePositions[targetOffset] = dome.nodePositions[sourceOffset]!;
        this.neuralDomeNodePositions[targetOffset + 1] = dome.nodePositions[sourceOffset + 1]!;
        this.neuralDomeNodePositions[targetOffset + 2] = dome.nodePositions[sourceOffset + 2]!;
        this.neuralDomeNodeColors[targetOffset] = nodeColor.r;
        this.neuralDomeNodeColors[targetOffset + 1] = nodeColor.g;
        this.neuralDomeNodeColors[targetOffset + 2] = nodeColor.b;
      }
      nodeCount += copiedNodes;
      groundAnchorCount += dome.groundAnchorCount;
      elevatedVertexCount += dome.elevatedVertexCount;
    }
    for (const attributeName of ['position', 'color'] as const) {
      this.neuralDomeLineGeometry.getAttribute(attributeName).needsUpdate = true;
      this.neuralDomeNodeGeometry.getAttribute(attributeName).needsUpdate = true;
    }
    this.neuralDomeLineGeometry.setDrawRange(0, lineVertexCount);
    this.neuralDomeNodeGeometry.setDrawRange(0, nodeCount);
    this.neuralDomeLines.visible = lineVertexCount > 0;
    this.neuralDomeNodes.visible = nodeCount > 0;
    this.host.dataset.neuralDomeGroundAnchors = String(groundAnchorCount);
    this.host.dataset.neuralDomeElevatedVertices = String(elevatedVertexCount);
    this.host.dataset.neuralDomeDrawCalls = lineVertexCount > 0 ? '2' : '0';
  }

  /**
   * Rebuilds the one shared coverage atlas only when canonical force placement
   * changes. Every ring/land part of the supported territory is painted; the
   * per-frame animation path only adjusts the shared material opacity.
   */
  private syncTerritoryNeuralFieldCoverage(
    entries: readonly CommanderForceRenderEntry[],
  ): void {
    const signature = neuralFieldCoverageGeometrySignature(entries);
    if (signature === this.neuralFieldCoverageSignature) return;
    this.neuralFieldCoverageSignature = signature;
    this.rebuildTerritoryNeuralDomes(entries);
    const canvas = this.neuralFieldCoverageCanvas;
    const context = canvas.getContext('2d');
    if (!context) {
      this.neuralFieldCoverageLayer.visible = false;
      return;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    let paintedParts = 0;
    let fieldCount = 0;
    for (const entry of entries) {
      const mode = neuralFieldModePresentation(
        entry.moving,
        entry.recovering,
        entry.fieldOperational,
      );
      if (!mode.fieldVisible) continue;
      paintedParts += drawTerritoryWideNeuralField(
        context,
        entry.force.locationId,
        entry.role,
        mode.intensity * entry.fieldIntensity,
        canvas.width,
        canvas.height,
      );
      fieldCount += 1;
    }
    this.neuralFieldCoverageTexture.needsUpdate = true;
    this.neuralFieldCoverageLayer.visible = paintedParts > 0;
    this.host.dataset.neuralFieldCount = String(fieldCount);
    this.host.dataset.neuralFieldParts = String(paintedParts);
  }

  private createCommanderMarker(
    playerId: string,
    role: 'apex' | 'rogue-prime',
  ): {
    marker: THREE.Group;
    fieldMesh: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>;
    network: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
    nodes: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  } {
    const marker = new THREE.Group();
    marker.userData.commanderForcePlayerId = playerId;
    const hostilePrime = role === 'rogue-prime';
    const fieldMesh = new THREE.Mesh(
      this.neuralFieldGeometry,
      hostilePrime ? this.primeFieldMaterial : this.apexFieldMaterial,
    );
    const network = new THREE.LineSegments(
      this.neuralNetworkGeometry,
      hostilePrime ? this.primeNetworkMaterial : this.apexNetworkMaterial,
    );
    const nodes = new THREE.Points(
      this.neuralNodeGeometry,
      hostilePrime ? this.primeNodeMaterial : this.apexNodeMaterial,
    );
    fieldMesh.scale.y = 0.54;
    network.scale.y = 0.54;
    nodes.scale.y = 0.54;
    for (const child of [fieldMesh, network, nodes]) {
      child.userData.commanderForcePlayerId = playerId;
      child.renderOrder = 9;
    }
    marker.add(fieldMesh, network, nodes);
    return { marker, fieldMesh, network, nodes };
  }

  private removeCommanderForceVisual(visual: CommanderForceVisual): void {
    this.commanderGroup.remove(visual.marker, visual.routeGroup);
    visual.marker.clear();
    disposeObject(visual.routeGroup);
    this.commanderForces.delete(visual.playerId);
  }

  private rebuildCommanderRoute(
    visual: CommanderForceVisual,
    routeVisible: boolean,
    points: THREE.Vector3[],
    tether = false,
  ): void {
    disposeObject(visual.routeGroup);
    visual.routeGroup.clear();
    visual.routeAnimation = undefined;
    if (!routeVisible || points.length < 2) return;
    const hostilePrime = visual.role === 'rogue-prime';
    const material = new THREE.LineDashedMaterial({
      color: hostilePrime
        ? STRATEGIC_NEURAL_FIELD_STYLE.roguePrime.fieldColor
        : STRATEGIC_NEURAL_FIELD_STYLE.apex.fieldColor,
      transparent: true,
      opacity: hostilePrime
        ? STRATEGIC_NEURAL_FIELD_STYLE.roguePrime.routeOpacity
        : tether ? 0.34 : STRATEGIC_NEURAL_FIELD_STYLE.apex.routeOpacity,
      dashSize: hostilePrime ? 0.075 : tether ? 0.055 : 0.09,
      gapSize: hostilePrime ? 0.09 : tether ? 0.11 : 0.065,
      depthWrite: false,
      toneMapped: false,
    });
    const dashOffsetUniform = { value: 0 };
    material.onBeforeCompile = (shader) => {
      shader.uniforms.routeDashOffset = dashOffsetUniform;
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'uniform float totalSize;',
          'uniform float totalSize;\nuniform float routeDashOffset;',
        )
        .replace(
          'mod( vLineDistance, totalSize )',
          'mod( vLineDistance + routeDashOffset, totalSize )',
        );
    };
    material.customProgramCacheKey = () => 'ww3-canonical-neural-route-dash-v1';
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
    line.computeLineDistances();
    line.renderOrder = 7;
    visual.routeGroup.add(line);
    visual.routeAnimation = {
      material,
      baseOpacity: material.opacity,
      phase: 0,
      dashOffsetUniform,
    };
  }

  private updateCommanderForces(engine: WorldMapEngineContract): void {
    const forces = engine.state.commanderForces ?? {};
    // APEX intelligence is seat-local in multiplayer. Rendering another
    // commander's mobile force or route would disclose exact remote intel.
    const viewerForce = apexFieldPresentationActive(engine)
      ? forces[engine.state.humanPlayerId]
      : undefined;
    const primeState = engine.state.polarEndgame?.roguePrime;
    const primePresentation = roguePrimeMapPresentation(
      primeState,
      engine.state.tick,
      this.intelligenceVisibility,
    );
    const entries: CommanderForceRenderEntry[] = [];
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
          etaTicks: secondary ? 0 : viewerForce.transit
            ? Math.max(0, Math.ceil(viewerForce.transit.arriveTick - engine.state.tick)) : 0,
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
      // PRIME has its own rebuild presentation; APEX extraction must never
      // suppress or otherwise alter the hostile field lifecycle.
      fieldOperational: true,
      fieldIntensity: 1,
      combatActive: primePresentation.combatActive,
      etaTicks: primePresentation.etaTicks,
    });
    const livePlayerIds = new Set(entries.map((entry) => entry.id));
    for (const visual of [...this.commanderForces.values()]) {
      if (!livePlayerIds.has(visual.playerId)) this.removeCommanderForceVisual(visual);
    }

    const now = performance.now();
    for (const entry of entries) {
      const { id: playerId, role, force } = entry;
      let visual = this.commanderForces.get(playerId);
      const routePointSignature = `${force.locationId}|${entry.routePath.join('>')}`;
      const routePoints = visual?.routePointSignature === routePointSignature
        ? visual.routePoints
        : commanderRoutePoints(force, entry.routePath);
      const desired = commanderPointAlongRoute(
        routePoints,
        entry.routeProgress,
      );
      if (!desired) continue;
      if (!visual) {
        const { marker, fieldMesh, network, nodes } = this.createCommanderMarker(playerId, role);
        const routeGroup = new THREE.Group();
        const domeMetrics = neuralFieldDomeMetrics(force.locationId);
        visual = {
          playerId,
          role,
          marker,
          fieldMesh,
          network,
          nodes,
          routeGroup,
          projection: entry.projection,
          worldPosition: desired.clone(),
          moveFrom: desired.clone(),
          moveTo: desired.clone(),
          routePointSignature,
          routePoints,
          pathSignature: '',
          moveStartedAt: now,
          moveDuration: 0,
          inTransit: entry.moving,
          recovering: entry.recovering,
          fieldOperational: entry.fieldOperational,
          fieldIntensity: entry.fieldIntensity,
          combatActive: entry.combatActive,
          frontTargetId: force.front,
          coverageTerritoryId: force.locationId,
          coverageBoundaryWorldRadius: domeMetrics.boundaryWorldRadius,
          domeAngularRadiusRadians: domeMetrics.angularRadiusRadians,
          domeHeight: domeMetrics.domeHeight,
        };
        marker.position.copy(desired);
        this.commanderForces.set(playerId, visual);
        this.commanderGroup.add(routeGroup, marker);
      } else {
        if (visual.routePointSignature !== routePointSignature) {
          visual.routePointSignature = routePointSignature;
          visual.routePoints = routePoints;
        }
        this.animateCommanderForceVisual(visual, now);
        if (visual.moveTo.distanceToSquared(desired) > 1e-8) {
          visual.moveFrom.copy(visual.worldPosition);
          visual.moveTo.copy(desired);
          visual.moveStartedAt = now;
          visual.moveDuration = this.reducedMotion ? 0 : 520;
        }
      }

      visual.inTransit = entry.moving;
      visual.projection = entry.projection;
      visual.recovering = entry.recovering;
      visual.fieldOperational = entry.fieldOperational;
      visual.fieldIntensity = entry.fieldIntensity;
      visual.combatActive = entry.combatActive;
      visual.frontTargetId = force.front;
      if (visual.coverageTerritoryId !== force.locationId) {
        visual.coverageTerritoryId = force.locationId;
        const domeMetrics = neuralFieldDomeMetrics(force.locationId);
        visual.coverageBoundaryWorldRadius = domeMetrics.boundaryWorldRadius;
        visual.domeAngularRadiusRadians = domeMetrics.angularRadiusRadians;
        visual.domeHeight = domeMetrics.domeHeight;
      }
      const mode = neuralFieldModePresentation(
        visual.inTransit,
        visual.recovering,
        visual.fieldOperational,
      );
      // The point-local object is now only the collapsed in-transit signal
      // core. Stationary/recovery presence is the full territory atlas above.
      visual.fieldMesh.visible = false;
      visual.network.visible = false;
      visual.nodes.visible = mode.signalNodeVisible;

      const pathSignature = entry.routeVisible
        ? `${role}:${entry.tether ? 'tether:' : ''}${entry.routePath.join('>')}` : '';
      if (visual.pathSignature !== pathSignature) {
        visual.pathSignature = pathSignature;
        this.rebuildCommanderRoute(visual, entry.routeVisible, routePoints, entry.tether);
      }
      if (visual.routeAnimation?.dashOffsetUniform
        && visual.routeAnimation.material instanceof THREE.LineDashedMaterial) {
        const { material, dashOffsetUniform } = visual.routeAnimation;
        const dashCycle = material.dashSize + material.gapSize;
        const canonicalPhase = entry.routeProgress
          * Math.max(1, entry.routePath.length - 1) * dashCycle * 5;
        dashOffsetUniform.value = -(canonicalPhase % dashCycle);
      }

    }
    this.syncTerritoryNeuralFieldCoverage(entries);
    this.host.dataset.apexProjectionCount = String(
      Math.min(2, entries.filter((entry) => entry.role === 'apex').length),
    );
  }

  private animateCommanderForceVisual(visual: CommanderForceVisual, now: number): boolean {
    const progress = visual.moveDuration <= 0 ? 1 : THREE.MathUtils.clamp(
      (now - visual.moveStartedAt) / visual.moveDuration,
      0,
      1,
    );
    visual.worldPosition.lerpVectors(visual.moveFrom, visual.moveTo, easeInOutCubic(progress));
    visual.marker.position.copy(visual.worldPosition);
    this.commanderMarkerNormal.copy(visual.worldPosition).normalize();
    visual.marker.quaternion.setFromUnitVectors(COMMANDER_MARKER_FORWARD, this.commanderMarkerNormal);
    const cameraDistance = this.camera.position.distanceTo(visual.worldPosition);
    const visibleWorldHeight = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)
      * cameraDistance;
    const viewportHeight = Math.max(1, this.renderHeight || this.host.clientHeight);
    const pixelConstantWorldWidth = NEURAL_FIELD_SCREEN_WIDTH_PX
      * visibleWorldHeight / viewportHeight;
    const modeScale = visual.inTransit ? 0.18 : visual.recovering ? 0.76 : 1;
    visual.marker.scale.setScalar(pixelConstantWorldWidth * 0.5 * modeScale);
    if (progress >= 1) visual.moveDuration = 0;
    return progress < 1;
  }

  private animateCommanderForces(now: number): boolean {
    sampleNeuralFieldPulse(
      now - this.neuralPulseStartedAt,
      this.reducedMotion,
      this.neuralPulseSample,
    );
    let active = this.neuralPulseSample.active;
    for (const visual of this.commanderForces.values()) {
      active = this.animateCommanderForceVisual(visual, now) || active;
    }
    this.updateNeuralFieldPulseEffect();
    if (active) this.labelsDirty = true;
    return active;
  }

  private updateNeuralFieldPulseEffect(): void {
    const visual = this.neuralPulseVisualId
      ? this.commanderForces.get(this.neuralPulseVisualId)
      : undefined;
    const targetVisible = this.neuralPulseTargetId
      ? apexTerritoryIntelVisible(this.intelligenceVisibility, this.neuralPulseTargetId)
      : false;
    const fieldUnavailable = Boolean(visual && !visual.fieldOperational);
    if (!this.neuralPulseSample.active || !visual || fieldUnavailable || !targetVisible
      || this.neuralConvergencePointCount < 2) {
      this.neuralConvergenceLine.visible = false;
      this.neuralContact.visible = false;
      this.neuralConvergenceMaterial.opacity = 0;
      this.neuralContactMaterial.opacity = 0;
      this.neuralFieldCoverageMaterial.opacity = NEURAL_FIELD_COVERAGE_OPACITY;
      this.neuralDomeLineMaterial.opacity = 0.78;
      this.neuralDomeNodeMaterial.opacity = 0.92;
      if (visual) {
        visual.fieldMesh.scale.set(1, 0.54, 1);
        visual.network.scale.set(1, 0.54, 1);
        visual.nodes.scale.set(1, 0.54, 1);
      }
      if (!this.neuralPulseSample.active || fieldUnavailable) {
        this.neuralPulseStartedAt = -Infinity;
        this.neuralPulseVisualId = undefined;
        this.neuralPulseTargetId = undefined;
        this.neuralPulseInterceptsIncoming = false;
        this.neuralPulseAbility = 'standard';
        this.neuralPulseCounterpulseDamage = 0;
        this.neuralConvergencePointCount = 0;
        this.neuralConvergenceGeometry.setDrawRange(0, 0);
      }
      return;
    }

    const shieldIntensity = visual.fieldIntensity;
    const fieldScale = 1 - (1 - this.neuralPulseSample.fieldScale) * shieldIntensity;
    // The complete territory atlas reacts as one protective network. The
    // small signal core remains reserved for canonical transit.
    this.neuralFieldCoverageMaterial.opacity = Math.min(
      1,
      NEURAL_FIELD_COVERAGE_OPACITY
        + this.neuralPulseSample.fieldBoost
          * (this.neuralPulseAbility === 'singularity' ? 0.18 : 0.10)
          * shieldIntensity,
    );
    this.neuralDomeLineMaterial.opacity = Math.min(
      0.94,
      0.78 + this.neuralPulseSample.fieldBoost * 0.16 * shieldIntensity,
    );
    this.neuralDomeNodeMaterial.opacity = Math.min(
      1,
      0.92 + this.neuralPulseSample.fieldBoost * 0.08 * shieldIntensity,
    );
    visual.fieldMesh.scale.set(fieldScale, 0.54 * fieldScale, 1);
    visual.network.scale.set(fieldScale, 0.54 * fieldScale, 1);
    visual.nodes.scale.set(fieldScale, 0.54 * fieldScale, 1);
    if (!this.neuralPulseInterceptsIncoming) {
      this.neuralConvergencePositions[0] = visual.marker.position.x;
      this.neuralConvergencePositions[1] = visual.marker.position.y;
      this.neuralConvergencePositions[2] = visual.marker.position.z;
    }
    this.neuralConvergencePositionAttribute.needsUpdate = true;
    const frontVisible = this.neuralConvergencePathFrontVisible();
    const mirrorReturn = this.neuralPulseAbility === 'mirror'
      && this.neuralPulseCounterpulseDamage > 0;
    if (mirrorReturn) {
      const returnStart = Math.max(0, Math.floor(
        (1 - this.neuralPulseSample.returnProgress)
          * (this.neuralConvergencePointCount - 1),
      ));
      this.neuralConvergenceGeometry.setDrawRange(
        returnStart,
        this.neuralConvergencePointCount - returnStart,
      );
    } else {
      this.neuralConvergenceGeometry.setDrawRange(0, this.neuralConvergencePointCount);
    }
    const convergenceOpacity = mirrorReturn
      ? this.neuralPulseSample.returnOpacity
      : this.neuralPulseSample.convergenceOpacity;
    this.neuralConvergenceMaterial.opacity = frontVisible
      ? (this.neuralPulseAbility === 'singularity' ? 0.94 : mirrorReturn ? 0.78 : 0.66)
        * convergenceOpacity * shieldIntensity : 0;
    this.neuralConvergenceLine.visible = frontVisible
      && this.neuralConvergenceMaterial.opacity > 0.01;

    const endpointOffset = (this.neuralConvergencePointCount - 1) * 3;
    if (mirrorReturn) {
      const reverseScaled = (1 - this.neuralPulseSample.returnProgress)
        * (this.neuralConvergencePointCount - 1);
      const reverseIndex = Math.max(0, Math.floor(reverseScaled));
      const reverseNext = Math.min(this.neuralConvergencePointCount - 1, reverseIndex + 1);
      const reverseLocal = reverseScaled - reverseIndex;
      const reverseOffset = reverseIndex * 3;
      const reverseNextOffset = reverseNext * 3;
      this.neuralContact.position.set(
        THREE.MathUtils.lerp(
          this.neuralConvergencePositions[reverseOffset]!,
          this.neuralConvergencePositions[reverseNextOffset]!,
          reverseLocal,
        ),
        THREE.MathUtils.lerp(
          this.neuralConvergencePositions[reverseOffset + 1]!,
          this.neuralConvergencePositions[reverseNextOffset + 1]!,
          reverseLocal,
        ),
        THREE.MathUtils.lerp(
          this.neuralConvergencePositions[reverseOffset + 2]!,
          this.neuralConvergencePositions[reverseNextOffset + 2]!,
          reverseLocal,
        ),
      );
    } else {
      this.neuralContact.position.set(
        this.neuralConvergencePositions[endpointOffset]!,
        this.neuralConvergencePositions[endpointOffset + 1]!,
        this.neuralConvergencePositions[endpointOffset + 2]!,
      );
    }
    const contactOpacity = mirrorReturn
      ? this.neuralPulseSample.returnOpacity
      : this.neuralPulseSample.contactOpacity;
    this.neuralContactMaterial.opacity = frontVisible
      ? (this.neuralPulseAbility === 'singularity' ? 0.96 : 0.78)
        * contactOpacity * shieldIntensity : 0;
    this.neuralContact.visible = frontVisible
      && this.neuralContactMaterial.opacity > 0.01;
    this.neuralContact.scale.setScalar(
      (0.75 + this.neuralPulseSample.fieldBoost * 0.35)
        * (this.neuralPulseAbility === 'singularity' ? 1.7 : 1)
        * (0.55 + 0.45 * shieldIntensity),
    );
  }

  private bindInput(): void {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerCancel);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
  }

  private unbindInput(): void {
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerCancel);
    canvas.removeEventListener('pointerleave', this.onPointerLeave);
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.inputBlocked || event.button !== 0) return;
    this.pointerDown = true;
    this.pointerDownX = event.clientX;
    this.pointerDownY = event.clientY;
    this.pointerTravel = 0;
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (this.inputBlocked) return;
    if (this.pointerDown) {
      this.pointerTravel = Math.max(
        this.pointerTravel,
        Math.hypot(event.clientX - this.pointerDownX, event.clientY - this.pointerDownY),
      );
      if (this.pointerTravel > DRAG_THRESHOLD) {
        this.clearHover();
      }
      return;
    }
    this.pendingHoverSample = {
      clientX: event.clientX,
      clientY: event.clientY,
      pointerType: event.pointerType,
    };
    if (!this.hoverFrameRequest) {
      this.hoverFrameRequest = window.requestAnimationFrame(this.flushPendingHover);
    }
  };

  private readonly flushPendingHover = (): void => {
    this.hoverFrameRequest = 0;
    const sample = this.pendingHoverSample;
    this.pendingHoverSample = undefined;
    if (!sample || this.inputBlocked || this.pointerDown) return;
    const pick = this.pickAtPoint(sample, true, 'hover');
    this.applyHover(pick, sample.clientX, sample.clientY);
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (!this.pointerDown) return;
    this.pointerDown = false;
    if (this.inputBlocked || this.pointerTravel > DRAG_THRESHOLD) return;
    const pick = this.pickAtEvent(event);
    if (pick?.kind === 'antarctica-sector') {
      this.focusPolarSector(pick.sectorId);
      if (mapBridge.onPolarSectorClick) mapBridge.onPolarSectorClick(pick.sectorId);
      else mapBridge.onPolarRegionClick?.('antarctica');
    } else if (pick?.kind === 'country') {
      this.clearPolarFocus();
      mapBridge.onTerritoryClick?.(pick.territoryId);
    } else if (pick?.kind === 'arctic' || pick?.kind === 'antarctica') {
      this.focusPolarRegion(pick.kind);
      mapBridge.onPolarRegionClick?.(pick.kind);
    }
  };

  private readonly onPointerCancel = (): void => {
    this.pointerDown = false;
    this.pendingHoverSample = undefined;
    this.clearHover();
  };

  private readonly onPointerLeave = (): void => {
    this.pointerDown = false;
    this.pendingHoverSample = undefined;
    this.clearHover();
  };

  private pickAtEvent(event: PointerEvent): ScenePickResult {
    return this.pickAtPoint(event, true);
  }

  private pickAtPoint(
    event: PointerSample,
    allowMicrostateHitProxy = false,
    intelligenceMode: 'command' | 'hover' = 'command',
  ): ScenePickResult {
    const uv = this.globeUvAtPoint(event);
    if (!uv) return undefined;
    const exactPick = this.globeTexture.pick(uv.x, uv.y);
    if (exactPick?.kind === 'antarctica' && this.visiblePolarSectorIds.size > 0) {
      const sectorId = antarcticaSectorAtCoordinates(
        uv.x * 360 - 180,
        uv.y * 180 - 90,
        this.visiblePolarSectorIds,
      );
      if (sectorId) return this.intelligenceFilteredPick(
        { kind: 'antarctica-sector', sectorId },
        intelligenceMode,
      );
    }
    if (exactPick || !allowMicrostateHitProxy) {
      return this.intelligenceFilteredPick(exactPick, intelligenceMode);
    }
    return this.intelligenceFilteredPick(this.nearestMicrostateCountryPick(event), intelligenceMode);
  }

  private intelligenceFilteredPick(
    pick: ScenePickResult,
    mode: 'command' | 'hover' = 'command',
  ): ScenePickResult {
    const territoryAllowed = (territoryId: string): boolean => mode === 'hover'
      ? apexTerritoryHoverVisible(this.intelligenceVisibility, territoryId)
      : apexTerritoryIntelVisible(this.intelligenceVisibility, territoryId);
    if (pick?.kind === 'country'
      && !territoryAllowed(pick.territoryId)) {
      return undefined;
    }
    if (pick?.kind === 'antarctica-sector'
      && !territoryAllowed(pick.sectorId)) {
      return { kind: 'antarctica' };
    }
    return pick;
  }

  private globeUvAtPoint(event: PointerSample): { x: number; y: number } | undefined {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return undefined;
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersection = this.raycaster.ray.intersectSphere(this.pickSphere, this.pickPoint);
    if (!intersection) return undefined;
    const coordinates = unitXyzToLonLat(intersection);
    return {
      x: (coordinates.longitude + 180) / 360,
      y: (coordinates.latitude + 90) / 180,
    };
  }

  private nearestMicrostateCountryPick(event: PointerSample): GlobePickResult {
    const viewport = this.host.getBoundingClientRect();
    const territoryId = nearestMicrostateScreenPick(
      this.projectedMicrostatePickAnchors(viewport),
      {
        clientX: event.clientX,
        clientY: event.clientY,
        pointerType: event.pointerType,
        cameraDistance: this.camera.position.length(),
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
      },
    );
    return territoryId ? { kind: 'country', territoryId } : undefined;
  }

  private applyHover(pick: ScenePickResult, clientX: number, clientY: number): void {
    pick = this.intelligenceFilteredPick(pick, 'hover');
    const territoryId = pick?.kind === 'country' ? pick.territoryId : undefined;
    const polarSectorId = pick?.kind === 'antarctica-sector' ? pick.sectorId : undefined;
    const polarRegion = pick?.kind === 'antarctica-sector' ? 'antarctica'
      : pick?.kind === 'arctic' || pick?.kind === 'antarctica' ? pick.kind : undefined;
    const changed = territoryId !== this.hoveredTerritoryId
      || polarSectorId !== this.hoveredPolarSectorId
      || polarRegion !== this.hoveredPolarRegion;
    this.hoveredTerritoryId = territoryId;
    this.hoveredPolarSectorId = polarSectorId;
    this.hoveredPolarRegion = polarRegion;
    this.renderer.domElement.style.cursor = pick ? 'pointer' : '';
    if (polarRegion) {
      const rect = this.host.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      if (this.polarHoverPosition) {
        this.polarHoverPosition.x = x;
        this.polarHoverPosition.y = y;
      } else this.polarHoverPosition = { x, y };
      this.polarCardsDirty = true;
    } else if (this.polarHoverPosition) {
      this.polarHoverPosition = undefined;
      this.polarCardsDirty = true;
    }
    if (changed) {
      this.labelsDirty = true;
      this.polarCardsDirty = true;
      this.updateAuthoredGatewayRouteEmphasis();
    }
    if (territoryId || polarSectorId) {
      mapBridge.onTerritoryHover?.(territoryId ?? polarSectorId, clientX, clientY);
    }
    else if (changed) mapBridge.onTerritoryHover?.(undefined, 0, 0);
  }

  private clearHover(): void {
    if (!this.hoveredTerritoryId
      && !this.hoveredPolarSectorId && !this.hoveredPolarRegion) return;
    this.hoveredTerritoryId = undefined;
    this.hoveredPolarSectorId = undefined;
    this.hoveredPolarRegion = undefined;
    this.polarHoverPosition = undefined;
    this.renderer.domElement.style.cursor = '';
    this.labelsDirty = true;
    this.polarCardsDirty = true;
    this.updateAuthoredGatewayRouteEmphasis();
    mapBridge.onTerritoryHover?.(undefined, 0, 0);
  }

  private startCameraFlight(direction: THREE.Vector3, distance: number, duration: number): void {
    this.controls.target.set(0, 0, 0);
    const currentDirection = this.camera.position.clone().normalize();
    this.cameraFlight = {
      startedAt: performance.now(),
      duration,
      fromDirection: currentDirection,
      toDirection: direction.clone().normalize(),
      fromDistance: this.camera.position.length(),
      toDistance: THREE.MathUtils.clamp(distance, MIN_CAMERA_DISTANCE, MAX_CAMERA_DISTANCE),
    };
    this.controls.enabled = false;
  }

  private projectedMicrostatePickAnchors(
    viewport: DOMRect,
  ): readonly ProjectedMicrostatePickAnchor[] {
    const cached = this.microstatePickProjectionCache;
    if (cached
      && cached.cameraPosition.distanceToSquared(this.camera.position) < 1e-8
      && cached.viewportLeft === viewport.left
      && cached.viewportTop === viewport.top
      && cached.viewportWidth === viewport.width
      && cached.viewportHeight === viewport.height) return cached.anchors;

    const anchors: ProjectedMicrostatePickAnchor[] = [];
    for (const anchor of MICROSTATE_PICK_ANCHORS) {
      if (!apexTerritoryIntelVisible(this.intelligenceVisibility, anchor.territoryId)) continue;
      const screen = this.projectWorldPosition(anchor.worldPosition, viewport);
      if (!screen) continue;
      anchors.push({
        territoryId: anchor.territoryId,
        clientX: screen.clientX,
        clientY: screen.clientY,
        angularRadiusDegrees: anchor.angularRadiusDegrees,
        frontFacing: true,
      });
    }
    this.microstatePickProjectionCache = {
      cameraPosition: this.camera.position.clone(),
      viewportLeft: viewport.left,
      viewportTop: viewport.top,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      anchors,
    };
    return anchors;
  }

  private projectCoordinates(
    longitude: number,
    latitude: number,
    viewport = this.host.getBoundingClientRect(),
  ): ScreenProjection | undefined {
    return this.projectWorldPosition(
      vectorFor(longitude, latitude, GLOBE_RADIUS * 1.025),
      viewport,
    );
  }

  focusPolarRegion(region: MapPolarRegion): void {
    this.focusedPolarRegion = region;
    this.focusedPolarSectorId = undefined;
    this.labelsDirty = true;
    this.polarCardsDirty = true;
    const direction = region === 'antarctica'
      ? new THREE.Vector3(0, -1, 0)
      : vectorFor(20, 86);
    const distance = region === 'antarctica' ? ANTARCTICA_OVERVIEW_DISTANCE : 7.75;
    this.startCameraFlight(direction, distance, this.reducedMotion ? 180 : 650);
  }

  focusPolarSector(sectorId: MapPolarSectorId): void {
    const sector = ANTARCTICA_SECTOR_PRESENTATION_BY_ID.get(sectorId);
    if (!sector) return;
    this.focusedPolarRegion = 'antarctica';
    this.focusedPolarSectorId = sectorId;
    this.labelsDirty = true;
    this.polarCardsDirty = true;
    this.startCameraFlight(
      vectorFor(sector.longitude, sector.latitude),
      sector.focusDistance,
      this.reducedMotion ? 180 : 580,
    );
  }

  clearPolarFocus(): void {
    if (!this.focusedPolarRegion && !this.focusedPolarSectorId) return;
    this.focusedPolarRegion = undefined;
    this.focusedPolarSectorId = undefined;
    this.labelsDirty = true;
    this.polarCardsDirty = true;
  }

  private projectWorldPosition(
    worldPosition: THREE.Vector3,
    viewport: DOMRect,
  ): ScreenProjection | undefined {
    if (!isFrontSideVisible(worldPosition, this.camera.position, FRONT_VISIBILITY_DOT)) return undefined;
    const ndc = this.projectionPoint.copy(worldPosition).project(this.camera);
    if (ndc.z < -1 || ndc.z > 1 || Math.abs(ndc.x) > 1.08 || Math.abs(ndc.y) > 1.08) return undefined;
    const client = ndcToCssPoint(ndc, viewport);
    return {
      clientX: client.x,
      clientY: client.y,
      localX: client.x - viewport.left,
      localY: client.y - viewport.top,
      ndcX: ndc.x,
      ndcY: ndc.y,
    };
  }

  private setLabelDisplayed(label: GlobeLabel, displayed: boolean): void {
    if (label.displayed === displayed) return;
    label.displayed = displayed;
    label.element.style.display = displayed ? 'block' : 'none';
  }

  private setLabelTransform(label: GlobeLabel, transform: string): void {
    if (label.transform === transform) return;
    label.transform = transform;
    label.element.style.transform = transform;
  }

  private updateLabels(): void {
    const cameraChanged = this.camera.position.distanceToSquared(this.lastLabelCameraPosition) >= 1e-8;
    if (!this.labelsDirty && !cameraChanged) {
      if (!this.polarCardsDirty) return;
      const viewport = this.host.getBoundingClientRect();
      this.updatePolarCardPosition('antarctica', this.antarcticaCard, viewport);
      this.updatePolarCardPosition('arctic', this.arcticCard, viewport);
      this.polarCardsDirty = false;
      return;
    }
    this.labelsDirty = false;
    this.polarCardsDirty = false;
    this.lastLabelCameraPosition.copy(this.camera.position);
    const viewport = this.host.getBoundingClientRect();
    const countryLabelScale = countryLabelScaleForDistance(this.camera.position.length());
    const candidates: Array<{ label: GlobeLabel; screen: ScreenProjection; selected: boolean }> = [];
    for (const label of this.labels.values()) {
      const selected = label.kind === 'country' && (
          label.id === this.selection.sourceId
          || label.id === this.selection.targetId
          || label.id === this.hoveredTerritoryId
          || label.id === this.hoveredPolarSectorId
          || label.id === this.focusedPolarSectorId
        );
      if (label.kind === 'country' && !label.persistent && !selected) {
        this.setLabelDisplayed(label, false);
        continue;
      }
      const screen = this.projectWorldPosition(label.worldPosition, viewport);
      if (!screen) {
        this.setLabelDisplayed(label, false);
        continue;
      }
      if (label.kind === 'sea') {
        const visible = this.camera.position.length() >= 7.05
          && this.focusedPolarRegion !== 'antarctica';
        this.setLabelDisplayed(label, visible);
        if (visible) {
          this.setLabelTransform(label, `translate3d(${screen.localX}px, ${screen.localY}px, 0) translate(-50%, -50%) rotate(var(--label-rotation, 0deg))`);
        }
        continue;
      }
      if (label.kind === 'access') {
        const visible = this.hoveredPolarRegion === 'antarctica'
          || this.focusedPolarRegion === 'antarctica';
        this.setLabelDisplayed(label, visible);
        if (visible) {
          this.setLabelTransform(label, `translate3d(${screen.localX}px, ${screen.localY}px, 0) translate(-50%, -112%)`);
        }
        continue;
      }
      candidates.push({ label, screen, selected });
    }

    candidates.sort((left, right) => (
      Number(right.selected) - Number(left.selected)
      || left.label.priority - right.label.priority
    ));
    const occupied: Array<{ left: number; right: number; top: number; bottom: number }> = [];
    for (const candidate of candidates) {
      const { label, screen, selected } = candidate;
      const detailDisplayed = selected || label.persistent;
      if (label.detailElement && label.detailDisplayed !== detailDisplayed) {
        label.detailDisplayed = detailDisplayed;
        label.detailElement.style.display = detailDisplayed ? '' : 'none';
      }
      if (label.selected !== selected) {
        label.selected = selected;
        label.element.classList.toggle('is-selected', selected);
      }
      this.setLabelDisplayed(label, true);
      const width = label.width * countryLabelScale;
      const height = label.height * countryLabelScale;
      let localY = screen.localY;
      let rectangle = {
        left: screen.localX - width / 2,
        right: screen.localX + width / 2,
        top: localY - height / 2,
        bottom: localY + height / 2,
      };
      const collisionRectangle = (): typeof rectangle => rectangle;
      let attempts = 0;
      while (occupied.some((entry) => !(
        collisionRectangle().right + 4 < entry.left || collisionRectangle().left - 4 > entry.right
        || collisionRectangle().bottom + 3 < entry.top || collisionRectangle().top - 3 > entry.bottom
      )) && attempts < (label.persistent || selected ? 6 : 1)) {
        attempts += 1;
        localY += (attempts % 2 === 1 ? -1 : 1) * (height + 5) * Math.ceil(attempts / 2);
        rectangle = {
          left: screen.localX - width / 2,
          right: screen.localX + width / 2,
          top: localY - height / 2,
          bottom: localY + height / 2,
        };
      }
      occupied.push(collisionRectangle());
      this.setLabelTransform(
        label,
        `translate3d(${screen.localX}px, ${localY}px, 0) translate(-50%, -50%) scale(${countryLabelScale.toFixed(3)})`,
      );
    }

    this.updatePolarCardPosition('antarctica', this.antarcticaCard, viewport);
    this.updatePolarCardPosition('arctic', this.arcticCard, viewport);
  }

  private updatePolarCardPosition(
    region: MapPolarRegion,
    card: HTMLDivElement,
    viewport: DOMRect,
  ): void {
    const focused = this.focusedPolarRegion === region;
    const hovered = this.hoveredPolarRegion === region;
    const focusedSector = this.focusedPolarSectorId
      ? ANTARCTICA_SECTOR_PRESENTATION_BY_ID.get(this.focusedPolarSectorId)
      : undefined;
    const projection = focused
      ? region === 'arctic'
        ? this.projectCoordinates(20, 86, viewport)
        : focusedSector
          ? this.projectCoordinates(focusedSector.longitude, focusedSector.latitude, viewport)
          : this.projectCoordinates(0, -89, viewport)
      : undefined;
    const cardPosition = hovered ? this.polarHoverPosition
      : projection ? { x: projection.localX, y: projection.localY }
        : undefined;
    const showCard = Boolean(cardPosition && (hovered || focused));
    card.classList.toggle('is-visible', showCard);
    if (cardPosition) {
      card.style.setProperty('--polar-x', `${cardPosition.x}px`);
      card.style.setProperty('--polar-y', `${cardPosition.y}px`);
    }
  }

  private updateCameraFlight(now: number): void {
    const flight = this.cameraFlight;
    if (!flight) return;
    const rawProgress = THREE.MathUtils.clamp((now - flight.startedAt) / Math.max(1, flight.duration), 0, 1);
    const progress = easeInOutCubic(rawProgress);
    const direction = slerpDirection(flight.fromDirection, flight.toDirection, progress);
    const distance = THREE.MathUtils.lerp(flight.fromDistance, flight.toDistance, progress);
    this.controls.target.set(0, 0, 0);
    this.camera.position.copy(direction.multiplyScalar(distance));
    this.camera.lookAt(0, 0, 0);
    if (rawProgress >= 1) {
      this.cameraFlight = undefined;
      this.controls.enabled = !this.inputBlocked;
      this.controls.update();
    }
  }

  private readonly onControlsChange = (): void => {
    this.cameraActivityUntil = performance.now() + CAMERA_ACTIVITY_HOLD_MS;
    this.labelsDirty = true;
  };

  private updateBattleEffects(now: number): void {
    for (let index = this.battleEffects.length - 1; index >= 0; index -= 1) {
      const effect = this.battleEffects[index]!;
      const progress = (now - effect.startedAt) / effect.duration;
      if (progress >= 1) {
        this.disposeBattleEffect(effect);
        this.battleEffects.splice(index, 1);
        continue;
      }
      const travelProgress = THREE.MathUtils.smoothstep(progress, 0, 0.58);
      const visibleRoutePoints = Math.max(2, Math.ceil(
        2 + travelProgress * Math.max(0, effect.path.length - 2),
      ));
      if (!this.reducedMotion) effect.route.geometry.setDrawRange(0, visibleRoutePoints);
      const routeFade = 1 - THREE.MathUtils.smoothstep(progress, 0.60, 0.94);
      effect.route.material.opacity = (this.reducedMotion ? 0.72 : 0.46) * routeFade;

      if (effect.projectile) {
        const projectile = effect.projectile.group;
        const pathProgress = THREE.MathUtils.clamp(travelProgress, 0, 0.9999);
        const scaled = pathProgress * (effect.path.length - 1);
        const pathIndex = Math.floor(scaled);
        const localProgress = scaled - pathIndex;
        projectile.position.lerpVectors(
          effect.path[pathIndex]!,
          effect.path[Math.min(effect.path.length - 1, pathIndex + 1)]!,
          localProgress,
        );
        const nextPathIndex = Math.min(effect.path.length - 1, pathIndex + 1);
        orientGlobeBattleProjectile(
          projectile,
          effect.path[pathIndex]!,
          effect.path[nextPathIndex]!,
        );
        const projectileFade = 1 - THREE.MathUtils.smoothstep(progress, 0.54, 0.64);
        const pulse = 0.985 + Math.sin(progress * Math.PI * 8) * 0.025;
        projectile.scale.setScalar(effect.projectileScale * pulse);
        projectile.visible = projectileFade > 0.01;
        const [trailMaterial, bodyMaterial, coreMaterial] = effect.projectile.materials;
        if (trailMaterial) trailMaterial.opacity = 0.11 * projectileFade;
        if (bodyMaterial) bodyMaterial.opacity = 0.52 * projectileFade;
        if (coreMaterial) coreMaterial.opacity = 0.68 * projectileFade;
      }

      const impactProgress = THREE.MathUtils.clamp((progress - 0.54) / 0.46, 0, 1);
      if (effect.impactWave) {
        effect.impactWave.progressUniform.value = THREE.MathUtils.smoothstep(
          impactProgress,
          0,
          1,
        );
      }
    }
  }

  private animateRoutes(now: number): void {
    if (this.reducedMotion) return;
    const seconds = now / 1000;
    for (const route of this.animatedRouteMaterials) {
      const pulseSpeed = route.flowSpeed ?? 2.1;
      route.material.opacity = route.baseOpacity * (0.82 + Math.sin(seconds * pulseSpeed + route.phase) * 0.18);
      if (route.flowSpeed && route.dashOffsetUniform
        && route.material instanceof THREE.LineDashedMaterial) {
        // Three's line distance grows from source to target. Moving the dash
        // phase negatively therefore carries the visible flow in that same
        // direction. Keep the value inside one dash cycle so long sessions do
        // not accumulate a needlessly large floating-point offset.
        const dashCycle = route.material.dashSize + route.material.gapSize;
        route.dashOffsetUniform.value = -(
          (seconds * route.flowSpeed + route.phase) % dashCycle
        );
      }
    }
    const polarActive = this.hoveredPolarRegion === 'antarctica'
      || this.focusedPolarRegion === 'antarctica';
    for (const route of this.polarMaterials) {
      route.material.opacity = route.baseOpacity
        * (polarActive ? 2.1 : 1)
        * (0.86 + Math.sin(seconds * 1.45 + route.phase) * 0.14);
    }
  }

  private resize(): void {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    const sizeChanged = width !== this.renderWidth || height !== this.renderHeight;
    const pixelRatioChanged = pixelRatio !== this.renderPixelRatio;
    if (!sizeChanged && !pixelRatioChanged) return;
    this.renderWidth = width;
    this.renderHeight = height;
    this.renderPixelRatio = pixelRatio;
    if (pixelRatioChanged) this.renderer.setPixelRatio(pixelRatio);
    this.borderDetail.material.resolution.set(width * pixelRatio, height * pixelRatio);
    if (sizeChanged) {
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.labelsDirty = true;
      this.polarCardsDirty = true;
    }
  }

  private updateIntelligenceFogCloudDrift(now: number): void {
    if (this.reducedMotion
      || !this.intelligenceVisibility.enabled
      || this.intelligenceFogVisualBlend <= 0) return;
    const seconds = now / 1000;
    this.intelligenceFogCloudTexture.offset.x = (
      seconds * APEX_INTELLIGENCE_FOG_STYLE.cloudDriftPerSecond
    ) % 1;
    this.intelligenceFogCloudTexture.offset.y = (
      seconds * APEX_INTELLIGENCE_FOG_STYLE.cloudDriftPerSecond * 0.37
    ) % 1;
  }

  private readonly renderFrame = (now: number): void => {
    if (this.destroyed) return;
    this.frameRequest = window.requestAnimationFrame(this.renderFrame);
    const cameraActive = Boolean(this.cameraFlight) || now < this.cameraActivityUntil;
    let commanderMotionPending = false;
    for (const visual of this.commanderForces.values()) {
      if (visual.moveDuration <= 0) continue;
      commanderMotionPending = true;
      break;
    }
    const presentationActive = this.battleEffects.length > 0
      || commanderMotionPending
      || this.intelligenceFogTransition.transitioning;
    const renderInterval = cameraActive || presentationActive
      ? ACTIVE_RENDER_INTERVAL_MS
      : IDLE_RENDER_INTERVAL_MS;
    const elapsed = now - this.lastRenderAt;
    if (document.hidden || elapsed < renderInterval) return;
    // Preserve the fractional remainder so high-refresh displays average the
    // requested cadence instead of dropping to an uneven divisor of 120/144Hz.
    this.lastRenderAt = now - (elapsed % renderInterval);
    this.updateCameraFlight(now);
    this.controls.rotateSpeed = globeRotateSpeedForDistance(
      this.camera.position.length(),
      MIN_CAMERA_DISTANCE,
      MAX_CAMERA_DISTANCE,
    );
    if (!this.cameraFlight) this.controls.update();
    this.updateGlobeBorderPresentation(this.camera.position.length());
    this.updateBattleEffects(now);
    this.animateCommanderForces(now);
    this.animateRoutes(now);
    this.updateApexFogVisualBlend(now);
    this.updateIntelligenceFogCloudDrift(now);
    this.updateLabels();
    this.renderer.render(this.scene, this.camera);
    if (this.nextFrameResolvers.size > 0) {
      const resolvers = [...this.nextFrameResolvers];
      this.nextFrameResolvers.clear();
      for (const resolve of resolvers) resolve();
    }
    if (this.resolveFirstFrame) {
      const resolve = this.resolveFirstFrame;
      this.resolveFirstFrame = undefined;
      resolve();
    }
  };
}
