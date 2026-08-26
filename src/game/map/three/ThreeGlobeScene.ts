import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  COUNTRIES,
  COUNTRY_BY_ID,
  countrySeaRouteBendDirection,
  countrySeaRouteMapGeometry,
  isSeaConnection,
  worldPointCoordinates,
} from '../../data/worldMap';
import {
  mapBridge,
  type MapBattleEvent,
  type MapSceneAdapter,
  type MapSelectionState,
  type WorldMapEngineContract,
} from '../bridge';
import {
  ANTARCTICA_ACCESS_ANCHORS,
  SEA_MAP_LABELS,
  arcticResearchAccessTerritoriesForEmpire,
} from '../mapGeographyPresentation';
import { compactMapCombatPower } from '../forcePresentation';
import { resolveCountryPresentationAnchor } from '../countryPresentation';
import { sampleCombatRoute, type CombatAccessPresentation } from '../combatPresentation';
import {
  GlobePoliticalTexture,
  type GlobePickResult,
} from './globeTexture';
import {
  countryAngularRadiusDegrees,
  isMicrostatePickCandidate,
  nearestMicrostateScreenPick,
  type ProjectedMicrostatePickAnchor,
} from './globePicking';
import { groupGlobeLogisticsMovements } from './globeLogisticsPresentation';
import { globeTerritoryReadinessPresentation } from './globeTerritoryPresentation';
import {
  globeRotateSpeedForDistance,
  isFrontSideVisible,
  lonLatToUnitXyz,
  ndcToCssPoint,
  unitXyzToLonLat,
} from './globeMath';

const GLOBE_RADIUS = 5;
const DEFAULT_CAMERA_DISTANCE = 14.5;
const MIN_CAMERA_DISTANCE = 7.2;
const MAX_CAMERA_DISTANCE = 16.75;
const ACTIVE_RENDER_INTERVAL_MS = 1000 / 60;
const IDLE_RENDER_INTERVAL_MS = 1000 / 20;
const CAMERA_ACTIVITY_HOLD_MS = 280;
const DRAG_THRESHOLD = 7;
const FRONT_VISIBILITY_DOT = 0.045;
const BATTLE_IMPACT_INNER_RADIUS = 0.034;
const BATTLE_IMPACT_OUTER_RADIUS = 0.062;
const BATTLE_IMPACT_SCALE = 2.15;

type LabelKind = 'country' | 'sea' | 'access';
type PolarRegion = 'arctic' | 'antarctica';

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
  group: THREE.Group;
  route: THREE.Line<THREE.BufferGeometry, THREE.LineDashedMaterial>;
  projectile?: THREE.Group;
  projectileMaterials: readonly THREE.MeshBasicMaterial[];
  impactRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  impactFlash: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
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
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material?.dispose?.();
  });
}

function vectorFor(longitude: number, latitude: number, radius = 1): THREE.Vector3 {
  const point = lonLatToUnitXyz(longitude, latitude);
  return new THREE.Vector3(point.x, point.y, point.z).multiplyScalar(radius);
}

function presentationAnchor(territoryId: string): readonly [number, number] | undefined {
  const country = COUNTRY_BY_ID_MAP.get(territoryId);
  if (!country) return undefined;
  const point = resolveCountryPresentationAnchor(
    country.id,
    { x: country.label[0], y: country.label[1] },
    (longitude, latitude) => ({ x: longitude, y: latitude }),
  );
  return [point.x, point.y] as const;
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
    const elevation = 1 + Math.sin(Math.PI * progress) * lift;
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
          GLOBE_RADIUS * (1.008 + Math.sin(Math.PI * progress) * lift),
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

export class ThreeGlobeScene implements MapSceneAdapter {
  private readonly host: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(41, 1, 0.1, 180);
  private readonly controls: OrbitControls;
  private readonly globeGroup = new THREE.Group();
  private readonly routeGroup = new THREE.Group();
  private readonly polarGroup = new THREE.Group();
  private readonly labelLayer: HTMLDivElement;
  private readonly antarcticaCard: HTMLDivElement;
  private readonly arcticCard: HTMLDivElement;
  private readonly arcticAccessLabel: HTMLElement;
  private readonly globeTexture: GlobePoliticalTexture;
  private readonly politicalTexture: THREE.CanvasTexture;
  private readonly globe: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly pickSphere = new THREE.Sphere(new THREE.Vector3(), GLOBE_RADIUS);
  private readonly pickPoint = new THREE.Vector3();
  private readonly projectionPoint = new THREE.Vector3();
  private readonly resizeObserver: ResizeObserver;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  readonly firstFrameReady: Promise<void>;
  private resolveFirstFrame?: () => void;
  private readonly nextFrameResolvers = new Set<() => void>();
  private readonly labels = new Map<string, GlobeLabel>();
  private readonly animatedRouteMaterials: AnimatedRouteMaterial[] = [];
  private readonly polarMaterials: AnimatedRouteMaterial[] = [];
  private readonly battleEffects: BattleEffect[] = [];
  private readonly onBeforeUnload = (): void => this.destroy();
  private engine?: WorldMapEngineContract;
  private selection: MapSelectionState = { legalTargetIds: [] };
  private inputBlocked = false;
  private hoveredTerritoryId?: string;
  private hoveredPolarRegion?: PolarRegion;
  private focusedPolarRegion?: PolarRegion;
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
    this.renderer.toneMappingExposure = 1.06;
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
      '<small>NEUTRAL TERRITORY · RESEARCH RESERVED</small>',
      '<strong>ARCTIC RESEARCH ZONE</strong>',
      '<span>GATEWAYS · CANADA · FINLAND · GREENLAND · ICELAND · NORWAY · RUSSIA · SWEDEN · USA</span>',
      '<b class="is-locked" data-role="arctic-access">NO ACCESS · OWN AN ARCTIC COUNTRY</b>',
    ].join('');
    const arcticAccessLabel = this.arcticCard.querySelector<HTMLElement>('[data-role="arctic-access"]');
    if (!arcticAccessLabel) throw new Error('The Arctic access label could not be created.');
    this.arcticAccessLabel = arcticAccessLabel;
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
    this.globeTexture = new GlobePoliticalTexture(() => {
      if (livePoliticalTexture) livePoliticalTexture.needsUpdate = true;
    }, this.renderer.capabilities.maxTextureSize);
    this.politicalTexture = livePoliticalTexture = new THREE.CanvasTexture(this.globeTexture.canvas);
    this.host.dataset.globeAtlas = String(this.globeTexture.canvas.width)
      + 'x' + String(this.globeTexture.canvas.height);
    this.host.dataset.globeMaxTextureSize = String(this.renderer.capabilities.maxTextureSize);
    this.politicalTexture.colorSpace = THREE.SRGBColorSpace;
    // The fixed high-resolution atlas already contains all close-range detail.
    // Linear filtering removes pixel stair-steps on flags and baked borders
    // without switching textures or doing any extra work while zooming.
    this.politicalTexture.magFilter = THREE.LinearFilter;
    this.politicalTexture.minFilter = THREE.LinearFilter;
    this.politicalTexture.generateMipmaps = false;
    this.politicalTexture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();

    const globeMaterial = new THREE.MeshStandardMaterial({
      map: this.politicalTexture,
      roughness: 0.91,
      metalness: 0.025,
      emissive: new THREE.Color(0x03121b),
      emissiveIntensity: 0.28,
    });
    // A moderately denser single sphere keeps coastlines stable at the fixed
    // close-range camera limit. It remains one mesh and one draw call; no
    // geometry, texture or material is swapped while zooming.
    this.globe = new THREE.Mesh(new THREE.SphereGeometry(GLOBE_RADIUS, 256, 160), globeMaterial);
    this.globeGroup.add(
      this.globe,
      this.routeGroup,
      this.polarGroup,
    );
    this.scene.add(this.globeGroup);

    this.addLighting();
    this.addAtmosphere();
    this.addStars();
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
    this.updateArcticAccessCard(engine);
    this.globeTexture.sync(engine, this.selection);
    const labelSignature = this.buildCountryLabelSignature(engine);
    if (labelSignature !== this.countryLabelSignature) {
      this.countryLabelSignature = labelSignature;
      this.rebuildCountryLabels();
    }
    this.rebuildRoutes();
  }

  setSelection(selection: MapSelectionState): void {
    const signature = globeSelectionStateSignature(selection);
    if (signature === this.selectionSignature) return;
    this.selectionSignature = signature;
    this.selection = selection;
    this.focusedPolarRegion = undefined;
    this.labelsDirty = true;
    if (this.engine) this.globeTexture.sync(this.engine, selection);
    else this.globeTexture.setSelection(selection);
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

  territoryScreenPosition(territoryId: string): { x: number; y: number } | undefined {
    const anchor = presentationAnchor(territoryId);
    if (!anchor) return undefined;
    const projection = this.projectCoordinates(anchor[0], anchor[1]);
    return projection ? { x: projection.clientX, y: projection.clientY } : undefined;
  }

  playBattle(result: MapBattleEvent): void {
    if (this.battleEffects.length >= 4) return;
    const path = routeBetween(
      result.sourceId,
      result.targetId,
      isSeaConnection(result.sourceId, result.targetId) ? 0.13 : 0.075,
      isSeaConnection(result.sourceId, result.targetId) ? 'naval' : 'land',
    );
    if (!path) return;

    const group = new THREE.Group();
    const naval = isSeaConnection(result.sourceId, result.targetId);
    const color = result.conquered ? 0xffd36f : naval ? 0x62dfff : 0xff725f;
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

    const projectileMaterials: THREE.MeshBasicMaterial[] = [];
    let projectile: THREE.Group | undefined;
    if (!this.reducedMotion) {
      projectile = new THREE.Group();
      const haloMaterial = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.24,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const coreMaterial = new THREE.MeshBasicMaterial({
        color: result.conquered ? 0xfff0ad : 0xffffff,
        transparent: true,
        opacity: 0.96,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      projectileMaterials.push(haloMaterial, coreMaterial);
      projectile.add(
        new THREE.Mesh(new THREE.SphereGeometry(0.046, 10, 6), haloMaterial),
        new THREE.Mesh(new THREE.SphereGeometry(0.019, 10, 6), coreMaterial),
      );
      projectile.position.copy(path[0]!);
      group.add(projectile);
    }
    const impactRing = new THREE.Mesh(
      new THREE.RingGeometry(BATTLE_IMPACT_INNER_RADIUS, BATTLE_IMPACT_OUTER_RADIUS, 24),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    impactRing.position.copy(path[path.length - 1]!);
    impactRing.lookAt(impactRing.position.clone().multiplyScalar(2));
    const impactFlash = new THREE.Mesh(
      new THREE.SphereGeometry(0.031, 12, 7),
      new THREE.MeshBasicMaterial({
        color: result.conquered ? 0xffefae : color,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    impactFlash.position.copy(path[path.length - 1]!);
    group.add(impactRing, impactFlash);
    this.globeGroup.add(group);
    this.battleEffects.push({
      group,
      route,
      projectile,
      projectileMaterials,
      impactRing,
      impactFlash,
      path,
      startedAt: performance.now(),
      duration: this.reducedMotion ? 560 : 980,
    });
  }

  resetCamera(): void {
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
    disposeObject(this.scene);
    this.politicalTexture.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labelLayer.remove();
    this.antarcticaCard.remove();
    this.arcticCard.remove();
    this.host.classList.remove('globe-map');
  }

  private addLighting(): void {
    const hemisphere = new THREE.HemisphereLight(0xbcefff, 0x1a2d3d, 1.15);
    const ambient = new THREE.AmbientLight(0x7f9fb2, 0.55);
    this.scene.add(hemisphere, ambient, this.camera);

    // Camera-local lights keep the entire visible hemisphere readable while
    // retaining a gentle upper-right key and cool opposite rim for depth.
    const key = new THREE.DirectionalLight(0xf2fcff, 2.35);
    key.position.set(5.2, 4.1, 3.4);
    key.target.position.set(0, 0, -4.5);
    const rim = new THREE.DirectionalLight(0x5aa7d4, 0.62);
    rim.position.set(-4.2, 1.1, 1.8);
    rim.target.position.set(0, 0, -4.5);
    this.camera.add(key, key.target, rim, rim.target);

    // Keep the polar endgame landmass readable when the camera crosses into
    // the southern hemisphere. This is presentation-only lighting; it does
    // not alter terrain, combat, ownership or any simulation value.
    const polarFill = new THREE.DirectionalLight(0xcff8ff, 0.55);
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
          float rim = pow(max(0.0, 0.74 - dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.1);
          gl_FragColor = vec4(0.15, 0.70, 0.96, rim * 0.58);
        }
      `,
    });
    this.globeGroup.add(new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS * 1.055, 80, 52),
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
    for (let index = 0; index < 1350; index += 1) {
      const direction = new THREE.Vector3(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1).normalize();
      direction.multiplyScalar(30 + random() * 80);
      positions[index * 3] = direction.x;
      positions[index * 3 + 1] = direction.y;
      positions[index * 3 + 2] = direction.z;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.scene.add(new THREE.Points(geometry, new THREE.PointsMaterial({
      color: 0xb9ecff,
      size: 0.042,
      transparent: true,
      opacity: 0.64,
      depthWrite: false,
    })));
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

  private addAntarcticaPresentation(): void {
    const corridorOrigins: Readonly<Record<string, readonly [number, number]>> = {
      'drake-passage': [-70.9, -53.2],
      'south-africa-corridor': [18.4, -33.9],
      'australia-new-zealand-corridor': [172.6, -43.5],
    };
    const colors = [0x66eaff, 0xffc76b, 0xb68cff];
    ANTARCTICA_ACCESS_ANCHORS.forEach((anchor, index) => {
      const origin = corridorOrigins[anchor.id];
      if (!origin) return;
      const path = greatCirclePath(
        vectorFor(origin[0], origin[1], GLOBE_RADIUS * 1.008),
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
      this.polarMaterials.push({ material, baseOpacity: 0.22, phase: index * 1.8 });

      const beacon = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.085, 1),
        new THREE.MeshBasicMaterial({
          color: colors[index]!,
          transparent: true,
          opacity: 0.74,
          depthWrite: false,
        }),
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

  private updateArcticAccessCard(engine: WorldMapEngineContract): void {
    const humanPlayerId = engine.state.humanPlayerId;
    const occupiedBorderTerritories = humanPlayerId
      ? [...arcticResearchAccessTerritoriesForEmpire(engine.state.territories, humanPlayerId)]
      : [];
    const accessNames = occupiedBorderTerritories.map((territoryId) => (
      compactCountryName(COUNTRY_BY_ID_MAP.get(territoryId)?.englishName ?? territoryId).toUpperCase()
    ));
    const hasAccess = accessNames.length > 0;
    this.arcticAccessLabel.textContent = hasAccess
      ? `YOUR ACCESS · ${accessNames.join(' · ')}`
      : 'NO ACCESS · OWN AN ARCTIC COUNTRY';
    this.arcticAccessLabel.classList.toggle('is-accessible', hasAccess);
    this.arcticAccessLabel.classList.toggle('is-locked', !hasAccess);
  }

  private rebuildCountryLabels(): void {
    if (!this.engine) return;
    const nextCountryLabelKeys = new Set<string>();

    const { state } = this.engine;
    const territoriesByOwner = new Map<string, string[]>();
    for (const country of COUNTRIES) {
      const territory = state.territories[country.id];
      if (!territory) continue;
      const territories = territoriesByOwner.get(territory.ownerId) ?? [];
      territories.push(country.id);
      territoriesByOwner.set(territory.ownerId, territories);
    }
    const ownerLabelTerritory = new Map<string, string>();
    for (const [ownerId, territoryIds] of territoriesByOwner) {
      const owner = this.engine.player(ownerId);
      const capital = owner && territoryIds.includes(owner.capitalId)
        ? owner.capitalId
        : [...territoryIds].sort((left, right) => (
          (COUNTRY_BY_ID[right]?.powerIndex ?? 0) - (COUNTRY_BY_ID[left]?.powerIndex ?? 0)
          || left.localeCompare(right)
        ))[0];
      if (capital) ownerLabelTerritory.set(ownerId, capital);
    }

    const ranking = this.engine.globalRanking();
    const rankByOwner = new Map(ranking.map((entry, index) => [entry.player.id, index + 1]));
    const topTenOwners = new Set(ranking.slice(0, 10).map((entry) => entry.player.id));
    const warOwners = new Set(state.wars.flatMap((war) => [war.attackerId, war.defenderId]));
    const frontTerritories = new Set(state.wars.flatMap((war) => [
      ...war.attackerOperations.flatMap((operation) => [operation.sourceId, operation.targetId]),
      ...war.defenderOperations.flatMap((operation) => [operation.sourceId, operation.targetId]),
    ]));
    const empirePower = new Map<string, number>();
    for (const territory of Object.values(state.territories)) {
      empirePower.set(territory.ownerId, (empirePower.get(territory.ownerId) ?? 0) + territory.army.power);
    }

    for (const country of COUNTRIES) {
      const territory = state.territories[country.id];
      if (!territory) continue;
      const owner = this.engine.player(territory.ownerId);
      if (!owner) continue;
      const empireCapital = ownerLabelTerritory.get(owner.id) === country.id;
      const integrating = territory.coreOwnerId !== territory.ownerId && territory.integration < 0.999999;
      const opening = empireCapital ? state.openingMobilisations[owner.id] : undefined;
      const persistent = (integrating && owner.isHuman)
        || frontTerritories.has(country.id)
        || (empireCapital && (owner.isHuman || topTenOwners.has(owner.id) || warOwners.has(owner.id) || Boolean(opening)));
      const rank = rankByOwner.get(owner.id);
      const originalOwner = integrating ? this.engine.player(territory.coreOwnerId) : undefined;
      const absorbed = !integrating
        && !empireCapital
        && (territoriesByOwner.get(owner.id)?.length ?? 0) > 1;
      // Once integration is complete, the old nation ceases to exist on the
      // strategic map. The selected-land panel remains the source of local
      // territory detail, matching the established renderer.
      if (absorbed && owner.id !== state.humanPlayerId) continue;
      const name = integrating
        ? originalOwner?.name ?? country.englishName
        : empireCapital ? owner.name : country.englishName;
      const controllerLabel = owner.id === state.humanPlayerId ? 'YOU'
        : owner.isHuman ? `PLAYER ${compactControllerName(owner.controllerName).toUpperCase()}` : '';
      const detail = integrating
        ? `INTEGRATING ${Math.round(territory.integration * 100)}%`
        : empireCapital
          ? `${controllerLabel ? `${controllerLabel} · ` : ''}⚔ ${compactMapCombatPower(empirePower.get(owner.id) ?? territory.army.power)}`
          : `⚔ ${compactMapCombatPower(territory.army.power)}`;
      const openingText = opening
        ? `${opening.direction === 'boost' ? 'OPENING BOOST' : 'OPENING LIMIT'} · ${Math.round(opening.remainingRatio * 100)}% LEFT`
        : '';
      const readiness = globeTerritoryReadinessPresentation(territory.army);
      const readinessVisible = persistent
        || owner.id === state.humanPlayerId
        || warOwners.has(owner.id);
      const readinessMarkup = [
        `<div class="globe-map__territory-readiness is-${readiness.tone}" role="img" aria-label="Local force readiness">`,
        `<i style="--readiness-fill:${Math.round(readiness.fillRatio * 1000) / 10}%"></i>`,
        `<b style="--readiness-local:${Math.round(readiness.localCapacityRatio * 1000) / 10}%"></b>`,
        '</div>',
      ].join('');
      const key = `country:${country.id}`;
      const existingLabel = this.labels.get(key);
      const element = existingLabel?.kind === 'country'
        ? existingLabel.element
        : document.createElement('div');
      const className = [
        'globe-map__country-label',
        owner.id === state.humanPlayerId ? 'is-human is-local-human'
          : owner.isHuman ? 'is-human is-other-human' : '',
        integrating ? 'is-integrating' : '',
        warOwners.has(owner.id) || frontTerritories.has(country.id) ? 'is-active' : '',
        readinessVisible ? 'has-readiness' : '',
        opening ? `has-opening is-opening-${opening.direction}` : '',
      ].filter(Boolean).join(' ');
      const markup = [
        `<strong>${compactCountryName(name).toUpperCase()}${empireCapital && rank ? ` <em>#${rank}</em>` : ''}</strong>`,
        `<span>${detail}</span>`,
        readinessMarkup,
        openingText ? `<small>${openingText}</small>` : '',
      ].join('');
      if (existingLabel?.className !== className) element.className = className;
      if (existingLabel?.markup !== markup) element.innerHTML = markup;
      if (!existingLabel || existingLabel.kind !== 'country') this.labelLayer.append(element);
      nextCountryLabelKeys.add(key);
      const anchor = presentationAnchor(country.id) ?? country.label;
      const markupChanged = existingLabel?.markup !== markup;
      this.labels.set(key, {
        id: country.id,
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
        priority: integrating ? 2
          : frontTerritories.has(country.id) ? 3
            : owner.isHuman ? 4
              : topTenOwners.has(owner.id) ? 10 + (rank ?? 10)
                : 55 + country.labelRank,
        width: opening ? 154 : 122,
        height: opening ? 58 : readinessVisible ? 43 : 36,
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
    const territorySignature = COUNTRIES.map((country) => {
      const territory = engine.state.territories[country.id];
      const readiness = territory
        ? globeTerritoryReadinessPresentation(territory.army)
        : undefined;
      return territory
        ? `${territory.ownerId}:${territory.coreOwnerId}:${Math.round(territory.integration * 100)}:${Math.round(readiness!.fillRatio * 20)}:${Math.round(readiness!.localCapacityRatio * 20)}`
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
    const rankingSignature = engine.globalRanking().slice(0, 10)
      .map((entry) => entry.player.id)
      .join(',');
    const warSignature = engine.state.wars.map((war) => [
      war.id,
      war.attackerId,
      war.defenderId,
      ...war.attackerOperations.flatMap((operation) => [operation.sourceId, operation.targetId]),
      ...war.defenderOperations.flatMap((operation) => [operation.sourceId, operation.targetId]),
    ].join(':')).join('|');
    return `${territorySignature}|${powerSignature}|${controllerSignature}|${openingSignature}|${rankingSignature}|${warSignature}`;
  }

  private rebuildRoutes(): void {
    if (!this.engine) return;
    const operations = this.engine.state.wars.flatMap((war) => [
      ...war.attackerOperations,
      ...war.defenderOperations,
    ]).sort((left, right) => (
      left.commanderId.localeCompare(right.commanderId)
      || left.sourceId.localeCompare(right.sourceId)
      || left.targetId.localeCompare(right.targetId)
    ));
    const logistics = groupGlobeLogisticsMovements(
      this.engine.state.logisticsMovements,
      this.engine.state.humanPlayerId,
      6,
    );
    const signature = [
      ...operations.map((operation) => `${operation.commanderId}:${operation.sourceId}:${operation.targetId}:${operation.access ?? ''}:${Math.round(operation.momentum)}`),
      ...logistics.map((movement) => `l:${movement.sourceId}:${movement.targetId}`),
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
      const movementAccess = isSeaConnection(movement.sourceId, movement.targetId) ? 'naval' : 'land';
      const path = routeBetween(movement.sourceId, movement.targetId, 0.065, movementAccess);
      if (!path) return;
      const material = new THREE.LineDashedMaterial({
        color: 0x86f0ff,
        transparent: true,
        opacity: 0.54,
        dashSize: 0.065,
        gapSize: 0.075,
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
        baseOpacity: 0.54,
        phase: 1.2 + index,
        flowSpeed: 0.24,
        dashOffsetUniform,
      });
    });
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
    const pick = this.pickAtPoint(sample, true);
    this.applyHover(pick, sample.clientX, sample.clientY);
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (!this.pointerDown) return;
    this.pointerDown = false;
    if (this.inputBlocked || this.pointerTravel > DRAG_THRESHOLD) return;
    const pick = this.pickAtEvent(event);
    if (pick?.kind === 'country') {
      this.focusedPolarRegion = undefined;
      mapBridge.onTerritoryClick?.(pick.territoryId);
    } else if (pick?.kind === 'arctic' || pick?.kind === 'antarctica') {
      this.focusedPolarRegion = pick.kind;
      this.focusPolarRegion(pick.kind);
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

  private pickAtEvent(event: PointerEvent): GlobePickResult {
    return this.pickAtPoint(event, true);
  }

  private pickAtPoint(event: PointerSample, allowMicrostateHitProxy = false): GlobePickResult {
    const uv = this.globeUvAtPoint(event);
    if (!uv) return undefined;
    const exactPick = this.globeTexture.pick(uv.x, uv.y);
    if (exactPick || !allowMicrostateHitProxy) return exactPick;
    return this.nearestMicrostateCountryPick(event);
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

  private applyHover(pick: GlobePickResult, clientX: number, clientY: number): void {
    const territoryId = pick?.kind === 'country' ? pick.territoryId : undefined;
    const polarRegion = pick?.kind === 'arctic' || pick?.kind === 'antarctica'
      ? pick.kind
      : undefined;
    const changed = territoryId !== this.hoveredTerritoryId || polarRegion !== this.hoveredPolarRegion;
    this.hoveredTerritoryId = territoryId;
    this.hoveredPolarRegion = polarRegion;
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
    }
    if (territoryId) mapBridge.onTerritoryHover?.(territoryId, clientX, clientY);
    else if (changed) mapBridge.onTerritoryHover?.(undefined, 0, 0);
  }

  private clearHover(): void {
    if (!this.hoveredTerritoryId && !this.hoveredPolarRegion) return;
    this.hoveredTerritoryId = undefined;
    this.hoveredPolarRegion = undefined;
    this.polarHoverPosition = undefined;
    this.labelsDirty = true;
    this.polarCardsDirty = true;
    mapBridge.onTerritoryHover?.(undefined, 0, 0);
  }

  private focusPolarRegion(region: PolarRegion): void {
    const latitude = region === 'arctic' ? 84 : -76;
    this.startCameraFlight(vectorFor(20, latitude), 7.55, this.reducedMotion ? 180 : 650);
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
    const candidates: Array<{ label: GlobeLabel; screen: ScreenProjection; selected: boolean }> = [];
    for (const label of this.labels.values()) {
      const selected = label.kind === 'country' && (
        label.id === this.selection.sourceId
        || label.id === this.selection.targetId
        || label.id === this.hoveredTerritoryId
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
      const width = label.width;
      const height = label.height;
      let localY = screen.localY;
      let rectangle = {
        left: screen.localX - width / 2,
        right: screen.localX + width / 2,
        top: localY - height / 2,
        bottom: localY + height / 2,
      };
      let attempts = 0;
      while (occupied.some((entry) => !(
        rectangle.right + 4 < entry.left || rectangle.left - 4 > entry.right
        || rectangle.bottom + 3 < entry.top || rectangle.top - 3 > entry.bottom
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
      occupied.push(rectangle);
      this.setLabelTransform(label, `translate3d(${screen.localX}px, ${localY}px, 0) translate(-50%, -50%)`);
    }

    this.updatePolarCardPosition('antarctica', this.antarcticaCard, viewport);
    this.updatePolarCardPosition('arctic', this.arcticCard, viewport);
  }

  private updatePolarCardPosition(
    region: PolarRegion,
    card: HTMLDivElement,
    viewport: DOMRect,
  ): void {
    const focused = this.focusedPolarRegion === region;
    const hovered = this.hoveredPolarRegion === region;
    const projection = focused
      ? region === 'arctic'
        ? this.projectCoordinates(20, 84, viewport)
        : [
          this.projectCoordinates(20, -76, viewport),
          this.projectCoordinates(-63, -68, viewport),
          this.projectCoordinates(145, -72, viewport),
        ].find((candidate) => Boolean(candidate))
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
        this.globeGroup.remove(effect.group);
        disposeObject(effect.group);
        this.battleEffects.splice(index, 1);
        continue;
      }
      const travelProgress = THREE.MathUtils.smoothstep(progress, 0, 0.68);
      const visibleRoutePoints = Math.max(2, Math.ceil(
        2 + travelProgress * Math.max(0, effect.path.length - 2),
      ));
      if (!this.reducedMotion) effect.route.geometry.setDrawRange(0, visibleRoutePoints);
      const routeFade = 1 - THREE.MathUtils.smoothstep(progress, 0.68, 1);
      effect.route.material.opacity = (this.reducedMotion ? 0.72 : 0.46) * routeFade;

      if (effect.projectile) {
        const pathProgress = THREE.MathUtils.clamp(travelProgress, 0, 0.9999);
        const scaled = pathProgress * (effect.path.length - 1);
        const pathIndex = Math.floor(scaled);
        const localProgress = scaled - pathIndex;
        effect.projectile.position.lerpVectors(
          effect.path[pathIndex]!,
          effect.path[Math.min(effect.path.length - 1, pathIndex + 1)]!,
          localProgress,
        );
        const projectileFade = 1 - THREE.MathUtils.smoothstep(progress, 0.62, 0.76);
        const pulse = 0.96 + Math.sin(progress * Math.PI * 8) * 0.07;
        effect.projectile.scale.setScalar(pulse);
        effect.projectile.visible = projectileFade > 0.01;
        const [haloMaterial, coreMaterial] = effect.projectileMaterials;
        if (haloMaterial) haloMaterial.opacity = 0.24 * projectileFade;
        if (coreMaterial) coreMaterial.opacity = 0.96 * projectileFade;
      }

      const impactProgress = THREE.MathUtils.clamp((progress - 0.62) / 0.38, 0, 1);
      const impactEnvelope = Math.sin(impactProgress * Math.PI);
      effect.impactRing.scale.setScalar(0.62 + impactProgress * BATTLE_IMPACT_SCALE);
      effect.impactRing.material.opacity = impactEnvelope * 0.88;
      effect.impactFlash.scale.setScalar(0.72 + impactProgress * 1.18);
      effect.impactFlash.material.opacity = Math.min(1, impactProgress * 5)
        * (1 - impactProgress) * 0.78;
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
    if (sizeChanged) {
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.labelsDirty = true;
      this.polarCardsDirty = true;
    }
  }

  private readonly renderFrame = (now: number): void => {
    if (this.destroyed) return;
    this.frameRequest = window.requestAnimationFrame(this.renderFrame);
    const cameraActive = Boolean(this.cameraFlight) || now < this.cameraActivityUntil;
    const presentationActive = this.battleEffects.length > 0
      || this.hoveredPolarRegion !== undefined
      || this.focusedPolarRegion !== undefined;
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
    this.updateBattleEffects(now);
    this.animateRoutes(now);
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
