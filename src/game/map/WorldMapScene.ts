import Phaser from 'phaser';
import {
  COUNTRIES,
  COUNTRY_BY_ID,
  MAP_HEIGHT,
  MAP_WIDTH,
  TERRITORIES,
  TERRITORY_BY_ID,
  projectWorldPoint,
} from '../data/worldMap';
import {
  mapBridge,
  type MapBattleEvent,
  type MapFrontOperation,
  type MapLogisticsMovement,
  type MapSceneAdapter,
  type MapSelectionState,
  type MapWarState,
  type WorldMapEngineContract,
} from './bridge';
import {
  countryFlagAssetUrl,
  MAP_FLAG_TEXTURE_HEIGHT,
  MAP_FLAG_TEXTURE_WIDTH,
} from '../../ui/countryFlags';
import { forcePresentationSignature } from './forcePresentation';

interface TerritoryVisual {
  parts: Phaser.GameObjects.Polygon[];
  hud: Phaser.GameObjects.Container;
  panel: Phaser.GameObjects.Rectangle;
  name: Phaser.GameObjects.Text;
  detail: Phaser.GameObjects.Text;
  localForce: Phaser.GameObjects.Text;
  localForceBarBack: Phaser.GameObjects.Rectangle;
  localForceBarFill: Phaser.GameObjects.Rectangle;
  minLabelZoom: number;
  layoutDetailVisible?: boolean;
  layoutWidth?: number;
  layoutHeight?: number;
  localForceText: string;
  localForceFill: number;
  localForceFillColor: number;
}

interface OwnershipBoundarySegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  territoryIds: readonly string[];
}

type MapStateSnapshot = WorldMapEngineContract['state'];

function compareFrontOperations(left: MapFrontOperation, right: MapFrontOperation): number {
  return left.commanderId.localeCompare(right.commanderId)
    || left.sourceId.localeCompare(right.sourceId)
    || left.targetId.localeCompare(right.targetId)
    || left.doctrine.localeCompare(right.doctrine);
}

function sortedWarOperations(war: MapWarState): MapFrontOperation[] {
  return [...war.attackerOperations, ...war.defenderOperations].sort(compareFrontOperations);
}

function ownerPairKey(leftId: string, rightId: string): string {
  return leftId < rightId ? `${leftId}:${rightId}` : `${rightId}:${leftId}`;
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

function compactPower(power: number): string {
  const value = Math.max(0, power);
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
const LABEL_NAME_SIZE = 10;
const LABEL_DETAIL_SIZE = 8;
const LABEL_TEXT_RESOLUTION = 2;
const LABEL_MAX_SCREEN_SCALE = 1.20;
const LABEL_PADDING_X = 6;
const LABEL_COLLISION_GAP = 4;
const LABEL_SAFE_TOP = 80;
const LABEL_SAFE_BOTTOM = 8;
const FLAG_TEXTURE_PREFIX = 'nation-flag-';
const FLAG_ATLAS_SCALE = 3;
const MAP_MIN_ZOOM = 0.78;
const MAP_MAX_ZOOM = 24;
const MAP_ZOOM_WHEEL_RATE = 0.00135;
const MAP_ZOOM_RESPONSE_MS = 82;
const MICROSTATE_FOCUS_SCREEN_SIZE = 110;
const DEEP_LABEL_MIN_ZOOM = 3;
const DEEP_LABEL_MIN_SCREEN_SPAN = 16;
// Natural Earth contains roughly 95k coastline vertices. Keeping sub-pixel
// bends adds a lot of Phaser hit-test/triangulation work without making the
// map more legible. Deep microstate zoom needs a tighter tolerance so retained
// bends stay near one screen pixel even at the maximum camera scale.
const BORDER_SIMPLIFICATION_TOLERANCE = 0.05;

interface RenderPoint {
  x: number;
  y: number;
}

interface TerritoryConnection {
  sourceId: string;
  targetId: string;
  source: RenderPoint;
  target: RenderPoint;
}

interface FrontRenderOperation {
  source: RenderPoint;
  target: RenderPoint;
  color: number;
  isHuman: boolean;
  momentum: number;
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

/**
 * Focus and deep-label decisions use the landmass cluster around the country's
 * label anchor. Remote islands therefore do not make mainland microstates look
 * artificially huge or force a world-scale camera framing.
 */
function countryRenderBounds(countryId: string): CountryRenderBounds | undefined {
  const anchor = TERRITORY_BY_ID[countryId];
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

const TERRITORY_CONNECTIONS: readonly TerritoryConnection[] = (() => {
  const connections: TerritoryConnection[] = [];
  const seen = new Set<string>();
  for (const territory of TERRITORIES) {
    for (const neighborId of territory.neighbors) {
      const key = territory.id < neighborId
        ? `${territory.id}:${neighborId}` : `${neighborId}:${territory.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const neighbor = TERRITORY_BY_ID[neighborId];
      if (!neighbor) continue;
      connections.push({
        sourceId: territory.id,
        targetId: neighborId,
        source: territory,
        target: neighbor,
      });
    }
  }
  return connections;
})();

function flagTextureKey(nationId: string): string {
  return `${FLAG_TEXTURE_PREFIX}${nationId}`;
}

function labelPlacementOffsets(
  width: number,
  height: number,
  strategic: boolean,
  persistentTopPower: boolean,
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
  if (!persistentTopPower) return offsets;

  // The global top ten is part of the overview, not optional geography. Give
  // those labels a deterministic expanding search field so dense European and
  // Asian clusters can fan out instead of losing the lower-ranked badge.
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
  private routeGraphics?: Phaser.GameObjects.Graphics;
  private graticuleGraphics?: Phaser.GameObjects.Graphics;
  private logisticsGraphics?: Phaser.GameObjects.Graphics;
  private ownershipBoundaryGraphics?: Phaser.GameObjects.Graphics;
  private flagAtlas?: Phaser.Textures.CanvasTexture | null;
  private flagAtlasImage?: Phaser.GameObjects.Image;
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
  private ordinaryBoundarySegments: readonly OwnershipBoundarySegment[] = [];
  private humanBoundarySegments: readonly OwnershipBoundarySegment[] = [];
  private otherHumanBoundarySegments: readonly OwnershipBoundarySegment[] = [];
  private integrationBoundarySegments: readonly OwnershipBoundarySegment[] = [];
  private frontRenderOperations: readonly FrontRenderOperation[] = [];
  private humanLogisticsMovements: readonly MapLogisticsMovement[] = [];
  private lastStrategicScoreTick = -Infinity;
  private lastTopologySignature = '';
  private lastOperationSignature = '';
  private lastLogisticsSignature = '';
  private lastForcePresentationSignature = '';
  private activeBattleEffects = 0;
  private battleLabelRefresh?: Phaser.Time.TimerEvent;
  private zoomTarget = 1;
  private zoomAnchorScreen?: RenderPoint;
  private zoomAnchorWorld?: RenderPoint;

  constructor() {
    super({ key: 'WorldMapScene' });
  }

  preload(): void {
    // Exactly one sharp texture per nation. Territories only swap a cached
    // texture on conquest; no flag is generated, fetched or decoded per frame.
    for (const country of COUNTRIES) {
      const url = countryFlagAssetUrl(country.id);
      if (url && !this.textures.exists(flagTextureKey(country.id))) {
        this.load.svg(flagTextureKey(country.id), url, {
          width: MAP_FLAG_TEXTURE_WIDTH,
          height: MAP_FLAG_TEXTURE_HEIGHT,
        });
      }
    }
  }

  create(): void {
    this.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
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
    this.routeGraphics = this.add.graphics().setDepth(-6);
    this.logisticsGraphics = this.add.graphics().setDepth(5.5);
    this.ownershipBoundaryGraphics = this.add.graphics().setDepth(2);
    this.frontGraphics = this.add.graphics().setDepth(6);
    this.buildOwnershipBoundarySegments();
    this.createCountries();
    this.configureCamera();
    this.refreshZoomDetails();
    mapBridge.attach(this);
    // When the adapter is already present, attach() materialises the live atlas.
    // Only paint the neutral opening ownership when the engine has not attached yet.
    if (!this.mapState) this.redrawFlagAtlas();
  }

  private drawOcean(): void {
    const sea = this.add.graphics().setDepth(-20);
    sea.fillGradientStyle(0x071521, 0x071521, 0x0a2432, 0x0a2432, 1);
    sea.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    this.graticuleGraphics = this.add.graphics().setDepth(-19);
    this.drawGraticule();
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
    for (const country of COUNTRIES) {
      for (const ring of country.rings) {
        for (let index = 0; index < ring.length; index += 1) {
          const start = ring[index]!;
          const end = ring[(index + 1) % ring.length]!;
          const startKey = pointKey(start[0], start[1]);
          const endKey = pointKey(end[0], end[1]);
          if (startKey === endKey) continue;
          const key = startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`;
          let segment = segments.get(key);
          if (!segment) {
            const startPoint = projectWorldPoint(start[0], start[1]);
            const endPoint = projectWorldPoint(end[0], end[1]);
            segment = { x1: startPoint.x, y1: startPoint.y, x2: endPoint.x, y2: endPoint.y, territoryIds: new Set() };
            segments.set(key, segment);
          }
          segment.territoryIds.add(country.id);
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
    const ordinary: OwnershipBoundarySegment[] = [];
    const human: OwnershipBoundarySegment[] = [];
    const otherHuman: OwnershipBoundarySegment[] = [];
    const integration: OwnershipBoundarySegment[] = [];
    for (const segment of this.ownershipBoundarySegments) {
      if (segment.territoryIds.length === 1) continue;
      let firstOwnerId: string | undefined;
      let multipleOwners = false;
      let touchesLocalHuman = false;
      let touchesOtherHuman = false;
      let integrating = false;
      for (const territoryId of segment.territoryIds) {
        const ownerId = state.territories[territoryId]?.ownerId;
        if (!ownerId) continue;
        if (!firstOwnerId) firstOwnerId = ownerId;
        else if (ownerId !== firstOwnerId) multipleOwners = true;
        if (ownerId === state.humanPlayerId) touchesLocalHuman = true;
        else if (this.humanOwnerIds.has(ownerId)) touchesOtherHuman = true;
        if (this.integratingTerritoryIds.has(territoryId)) integrating = true;
      }
      if (!firstOwnerId) continue;
      if (!multipleOwners && integrating) integration.push(segment);
      else if (multipleOwners) {
        if (touchesLocalHuman) human.push(segment);
        else if (touchesOtherHuman) otherHuman.push(segment);
        else ordinary.push(segment);
      }
    }
    this.ordinaryBoundarySegments = ordinary;
    this.humanBoundarySegments = human;
    this.otherHumanBoundarySegments = otherHuman;
    this.integrationBoundarySegments = integration;
    this.hostileOwnerPairs = new Set(state.wars.map((war) => (
      ownerPairKey(war.attackerId, war.defenderId)
    )));
  }

  private drawOwnershipPerimeters(): void {
    const graphics = this.ownershipBoundaryGraphics;
    if (!graphics) return;
    graphics.clear();
    const draw = (segmentsToDraw: readonly OwnershipBoundarySegment[], width: number, color: number, alpha: number) => {
      graphics.lineStyle(this.screenWorldSize(width), color, alpha);
      for (const segment of segmentsToDraw) this.drawWrappedLine(graphics, segment.x1, segment.y1, segment.x2, segment.y2);
    };
    draw(this.ordinaryBoundarySegments, 1.15, 0xd4e7eb, 0.58);
    draw(this.otherHumanBoundarySegments, 1.55, 0xd6a7ff, 0.82);
    draw(this.humanBoundarySegments, 1.7, 0x8cf3ff, 0.88);
    draw(this.integrationBoundarySegments, 0.85, 0xf2c879, 0.42);
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
          if (!this.inputBlocked && !this.dragged) mapBridge.onTerritoryClick?.(country.id);
        });
        parts.push(part);
      }

      const territory = TERRITORY_BY_ID[country.id]!;
      const hud = this.add.container(territory.x, territory.y).setDepth(8);
      const panel = this.add.rectangle(0, 0, 76, 24, 0x04111b, 0.95)
        .setStrokeStyle(1, 0xc4e1e8, 0.78);
      const name = this.add.text(0, 0, country.englishName.toUpperCase(), {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: `${LABEL_NAME_SIZE}px`, fontStyle: '700', color: '#ffffff', letterSpacing: 0.3, align: 'center',
      }).setOrigin(0.5).setStroke('#01070b', 3).setResolution(LABEL_TEXT_RESOLUTION);
      const detail = this.add.text(0, 8, country.code, {
        fontFamily: 'Inter, system-ui, sans-serif', fontSize: `${LABEL_DETAIL_SIZE}px`, fontStyle: '600', color: '#c6dce2', letterSpacing: 0.25,
      }).setOrigin(0.5).setStroke('#01070b', 2.5).setResolution(LABEL_TEXT_RESOLUTION).setVisible(false);
      const localForce = this.add.text(territory.x, territory.y, '', {
        fontFamily: 'Inter, system-ui, sans-serif', fontSize: '10px', fontStyle: '700', color: '#b9f8ff',
        backgroundColor: '#04111bd9', padding: { x: 4, y: 2 },
      }).setOrigin(0.5).setStroke('#01070b', 1.5).setResolution(LABEL_TEXT_RESOLUTION).setDepth(7).setVisible(false);
      const localForceBarBack = this.add.rectangle(territory.x, territory.y, 34, 3, 0x071016, 0.88)
        .setOrigin(0, 0.5).setDepth(7).setVisible(false);
      const localForceBarFill = this.add.rectangle(territory.x, territory.y, 34, 3, 0x58d68d, 0.92)
        .setOrigin(0, 0.5).setDepth(7.1).setVisible(false);
      hud.add([panel, name, detail]);
      hud.setInteractive(new Phaser.Geom.Rectangle(-70, -18, 140, 36), Phaser.Geom.Rectangle.Contains);
      hud.input!.cursor = 'pointer';
      hud.on('pointerover', (pointer: Phaser.Input.Pointer) => this.hoverCountry(country.id, pointer));
      hud.on('pointermove', (pointer: Phaser.Input.Pointer) => this.hoverCountry(country.id, pointer));
      hud.on('pointerout', () => this.unhoverCountry(country.id));
      hud.on('pointerup', () => {
        this.countryPointerHandled = true;
        if (!this.inputBlocked && !this.dragged) mapBridge.onTerritoryClick?.(country.id);
      });
      const baseLabelZoom = country.powerIndex >= 72 || country.labelRank <= 1 ? 0.78
        : country.powerIndex >= 58 || country.labelRank <= 2 ? 0.92
          : country.powerIndex >= 43 || country.labelRank <= 3 ? 1.12
            : country.powerIndex >= 28 || country.labelRank <= 4 ? 1.46 : 1.88;
      // Dense subregions rely primarily on screen-space collision culling; this
      // small deterministic delay stops every micro-label competing at once.
      const minLabelZoom = baseLabelZoom + (country.regionId === 'heartlands' ? 0.08 : country.subregion === 'Caribbean' ? 0.12 : 0);
      this.visuals.set(country.id, {
        parts, hud, panel, name, detail, localForce, localForceBarBack, localForceBarFill, minLabelZoom,
        localForceText: '', localForceFill: -1, localForceFillColor: -1,
      });
    }
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
    type EmpireShape = { rings: { x: number; y: number }[][] };
    const empires = new Map<string, EmpireShape>();
    for (const country of COUNTRIES) {
      const ownerId = state?.territories[country.id]?.ownerId ?? country.id;
      const shape = empires.get(ownerId) ?? { rings: [] };
      for (const points of RENDER_RINGS.get(country.id) ?? []) {
        if (points.length < 3) continue;
        shape.rings.push(points);
      }
      empires.set(ownerId, shape);
    }
    for (const [ownerId, shape] of empires) {
      if (shape.rings.length === 0 || !this.textures.exists(flagTextureKey(ownerId))) continue;
      const source = this.textures.get(flagTextureKey(ownerId)).getSourceImage() as CanvasImageSource;
      const ringCenters = shape.rings.map((ring) => ({
        ring,
        x: ring.reduce((sum, point) => sum + point.x, 0) / ring.length,
        y: ring.reduce((sum, point) => sum + point.y, 0) / ring.length,
      }));
      // Group nearby landmasses before stretching the flag. Remote French and
      // Dutch possessions can no longer enlarge the European projection box.
      const groups: typeof ringCenters[] = [];
      for (const entry of ringCenters) {
        const linked = groups.filter((group) => group.some((candidate) => {
          const dx = Math.min(Math.abs(candidate.x - entry.x), MAP_WIDTH - Math.abs(candidate.x - entry.x));
          return Math.hypot(dx, candidate.y - entry.y) <= 260;
        }));
        if (linked.length === 0) groups.push([entry]);
        else {
          linked[0]!.push(entry);
          for (const extra of linked.slice(1)) {
            linked[0]!.push(...extra);
            groups.splice(groups.indexOf(extra), 1);
          }
        }
      }
      for (const group of groups) {
        let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
        for (const { ring } of group) for (const point of ring) {
          minX = Math.min(minX, point.x); minY = Math.min(minY, point.y);
          maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y);
        }
        context.save();
        context.beginPath();
        for (const { ring } of group) {
          context.moveTo(ring[0]!.x, ring[0]!.y);
          for (let index = 1; index < ring.length; index += 1) context.lineTo(ring[index]!.x, ring[index]!.y);
          context.closePath();
        }
        context.clip();
        context.globalAlpha = ownerId === state?.humanPlayerId ? 0.72 : 0.46;
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
    context.restore();
    atlas.refresh();
  }

  private hoverCountry(countryId: string, pointer: Phaser.Input.Pointer): void {
    if (this.inputBlocked) return;
    const hoverChanged = this.hoveredId !== countryId;
    this.hoveredId = countryId;
    const visual = this.visuals.get(countryId);
    const territoryState = this.mapState?.territories[countryId];
    const integrating = territoryState
      ? territoryState.coreOwnerId !== territoryState.ownerId && territoryState.integration < 0.999999
      : false;
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

  private unhoverCountry(countryId: string): void {
    if (this.hoveredId !== countryId) return;
    this.hoveredId = undefined;
    mapBridge.onTerritoryHover?.(undefined, 0, 0);
    this.setSelection(this.selection);
  }

  private layoutLabel(visual: TerritoryVisual, showDetail: boolean): { width: number; height: number } {
    if (visual.layoutDetailVisible === showDetail
      && visual.layoutWidth !== undefined && visual.layoutHeight !== undefined) {
      return { width: visual.layoutWidth, height: visual.layoutHeight };
    }
    visual.detail.setVisible(showDetail);
    visual.name.setY(showDetail ? -4.5 : 0);
    visual.detail.setY(6);
    const width = Phaser.Math.Clamp(
      Math.max(visual.name.width, showDetail ? visual.detail.width : 0) + LABEL_PADDING_X * 2,
      44,
      158,
    );
    const height = showDetail ? 27 : 17;
    visual.panel.setDisplaySize(width, height);
    const hitArea = visual.hud.input?.hitArea;
    if (hitArea instanceof Phaser.Geom.Rectangle) hitArea.setTo(-width / 2, -height / 2, width, height);
    visual.layoutDetailVisible = showDetail;
    visual.layoutWidth = width;
    visual.layoutHeight = height;
    return { width, height };
  }

  private refreshZoomDetails(): void {
    const zoom = this.cameras.main.zoom;
    const camera = this.cameras.main;
    const humanId = this.mapState?.humanPlayerId;
    const movedIds = this.movedTerritoryIds;
    const activeSourceIds = this.activeHumanSourceIds;
    const strongestHumanIds = this.strongestHumanTerritoryIds;
    const forceScale = Phaser.Math.Clamp(1 / zoom, 1 / MAP_MAX_ZOOM, 1.18);
    const forceTextOffset = 29 / zoom;
    const forceBarOffset = 39 / zoom;
    const candidates: {
      territoryId: string;
      visual: TerritoryVisual;
      priority: number;
      required: boolean;
      strategic: boolean;
      persistentTopPower: boolean;
      persistentHuman: boolean;
      showDetail: boolean;
    }[] = [];
    for (const [territoryId, visual] of this.visuals) {
      const localTerritory = this.mapState?.territories[territoryId];
      const showLocalForce = localTerritory?.ownerId === humanId
        && (zoom >= 1.45 || movedIds.has(territoryId) || activeSourceIds.has(territoryId) || strongestHumanIds.has(territoryId));
      const forceAnchor = TERRITORY_BY_ID[territoryId];
      if (showLocalForce && forceAnchor) {
        const barY = forceAnchor.y + forceBarOffset;
        visual.localForce.setPosition(forceAnchor.x, forceAnchor.y + forceTextOffset)
          .setScale(forceScale).setVisible(true)
          .setColor(movedIds.has(territoryId) ? '#e3fdff' : '#9eeaf4')
          .setAlpha(movedIds.has(territoryId) || activeSourceIds.has(territoryId) ? 1 : 0.76);
        visual.localForceBarBack.setPosition(forceAnchor.x - 17 * forceScale, barY)
          .setScale(forceScale).setVisible(true);
        visual.localForceBarFill.setPosition(forceAnchor.x - 17 * forceScale, barY)
          .setScale(forceScale).setVisible(true);
      } else if (visual.localForce.visible || visual.localForceBarBack.visible || visual.localForceBarFill.visible) {
        visual.localForce.setVisible(false);
        visual.localForceBarBack.setVisible(false);
        visual.localForceBarFill.setVisible(false);
      }
      const source = territoryId === this.selection.sourceId;
      const target = territoryId === this.selection.targetId;
      const selected = source || target;
      const hovered = territoryId === this.hoveredId;
      const ownCapital = territoryId === this.humanCapitalId;
      const atWar = this.warTerritoryIds.has(territoryId);
      const integrating = this.integratingTerritoryIds.has(territoryId);
      const ownerId = this.mapState?.territories[territoryId]?.ownerId;
      const topPower = Boolean(ownerId && this.topPowerOwnerIds.has(ownerId));
      const persistentTopPower = topPower
        && this.ownerLabelTerritoryIds.get(ownerId!) === territoryId;
      const persistentHuman = Boolean(ownerId && this.humanOwnerIds.has(ownerId)
        && this.ownerLabelTerritoryIds.get(ownerId) === territoryId);
      const required = selected || hovered;
      const strategic = required || persistentHuman || ownCapital || atWar || integrating || topPower;
      const bounds = COUNTRY_RENDER_BOUNDS.get(territoryId);
      const projectedSpan = bounds ? Math.max(bounds.width, bounds.height) * zoom : 0;
      const deepGeography = zoom >= Math.max(DEEP_LABEL_MIN_ZOOM, visual.minLabelZoom * 1.75)
        && projectedSpan >= DEEP_LABEL_MIN_SCREEN_SPAN;
      const absorbed = this.absorbedTerritoryIds.has(territoryId);
      visual.hud.setVisible(false);
      const anchor = TERRITORY_BY_ID[territoryId];
      if (anchor) visual.hud.setPosition(anchor.x, anchor.y);
      // A captured country becomes part of its owner's empire. Its former national
      // label never returns on the map; geographic identity remains in DOM intel.
      if (absorbed) continue;
      // The overview stays strategic: the player's empire, active belligerents,
      // military top ten, selection and hover receive a nameplate. At close
      // range, countries whose shape is genuinely legible may join the same
      // collision pass, making Luxembourg-sized states discoverable.
      const eligible = strategic || deepGeography;
      if (!eligible) continue;
      const country = COUNTRY_BY_ID[territoryId];
      candidates.push({
        territoryId,
        visual,
        required,
        strategic: strategic || deepGeography,
        persistentTopPower,
        persistentHuman,
        showDetail: required || persistentHuman || atWar || integrating || (topPower && zoom >= 1.55)
          || (deepGeography && projectedSpan >= 48),
        priority: (target ? 110_000 : source ? 105_000 : hovered ? 100_000 : persistentHuman ? (ownCapital ? 98_000 : 97_000) : persistentTopPower ? 95_000 : ownCapital ? 90_000 : atWar ? 80_000 : integrating ? 75_000 : topPower ? 70_000 : deepGeography ? 50_000 : 0)
          + (deepGeography ? Math.min(5_000, projectedSpan * 10) : 0)
          + (this.mapState ? this.strategicScores.get(this.mapState.territories[territoryId]?.ownerId ?? territoryId) ?? country?.powerIndex ?? 0 : country?.powerIndex ?? 0) * 10
          - (country?.labelRank ?? 5),
      });
    }

    // Persistent DOM chrome overlays the canvas. Reserve it in the same collision
    // pass so country text never sits underneath the header or command dock.
    const accepted: RenderRectangle[] = [
      { x: 0, y: 0, width: camera.width, height: LABEL_SAFE_TOP },
      { x: 0, y: Math.max(0, camera.height - 76), width: Math.min(340, camera.width), height: 76 },
    ];
    candidates.sort((left, right) => right.priority - left.priority || left.territoryId.localeCompare(right.territoryId));
    for (const {
      territoryId, visual, required, strategic, persistentTopPower, persistentHuman, showDetail,
    } of candidates) {
      // One compact badge system at every zoom. The overview shows names only;
      // military detail appears for interaction, active wars and closer zoom.
      const scale = Phaser.Math.Clamp(1 / zoom, 1 / MAP_MAX_ZOOM, LABEL_MAX_SCREEN_SCALE);
      const screenScale = scale * zoom;
      const layout = this.layoutLabel(visual, showDetail);
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
      const offsets = labelPlacementOffsets(width, height, strategic, persistentTopPower);
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
          if (required || persistentTopPower || persistentHuman) overlap += rectangleOverlapArea(bounds, other);
        }
        if (collides) {
          if (required || persistentTopPower || persistentHuman) {
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
      // Selection/hover and each on-screen top-ten badge must remain visible.
      // The expanded search normally finds free space; least-overlap is only a
      // final guarantee for very small windows or unusually dense empires.
      if (!placement && (required || persistentTopPower || persistentHuman)) {
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
    }
    this.setSelection(this.selection);
  }

  update(_time: number, delta: number): void {
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
    const sortedWars = [...state.wars].sort((left, right) => left.id.localeCompare(right.id));
    const warOperations = sortedWars.map((war) => ({ war, operations: sortedWarOperations(war) }));
    const ownerSignature = `${humanId}|${TERRITORIES.map((territory) => state.territories[territory.id]?.ownerId ?? '').join(',')}`;
    const integrationSignature = TERRITORIES.map((territory) => {
      const live = state.territories[territory.id];
      return `${live?.coreOwnerId ?? ''}:${Math.round((live?.integration ?? 1) * 100)}`;
    }).join(',');
    const flagSignature = `${ownerSignature}|${integrationSignature}`;
    if (flagSignature !== this.flagAtlasOwnerSignature) {
      this.flagAtlasOwnerSignature = flagSignature;
      this.redrawFlagAtlas(state);
    }
    const integrationTopology = TERRITORIES.map((territory) => {
      const live = state.territories[territory.id];
      return live && live.coreOwnerId !== live.ownerId && live.integration < 0.999999
        ? `${territory.id}:${live.coreOwnerId}>${live.ownerId}` : '';
    }).filter(Boolean).join(',');
    const humanOwnerSignature = [...this.humanOwnerIds].sort().join(',');
    const topologySignature = `${humanId}:${human?.capitalId ?? ''}|humans:${humanOwnerSignature}|${ownerSignature}|${integrationTopology}|${sortedWars.map((war) => `${war.id}:${war.attackerId}:${war.defenderId}`).join(',')}`;
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
        const integrating = territoryState.coreOwnerId !== territoryState.ownerId
          && territoryState.integration < 0.999999;
        if (integrating) this.integratingTerritoryIds.add(territoryState.id);
        if (!integrating && (this.ownerTerritoryCounts.get(territoryState.ownerId) ?? 0) > 1
          && territoryState.id !== this.ownerLabelTerritoryIds.get(territoryState.ownerId)) this.absorbedTerritoryIds.add(territoryState.id);
      }
      this.warTerritoryIds.clear();
      for (const war of sortedWars) {
        for (const territory of TERRITORIES) {
          const ownerId = state.territories[territory.id]?.ownerId;
          if (ownerId === war.attackerId || ownerId === war.defenderId) this.warTerritoryIds.add(territory.id);
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
    const frontRenderOperations: FrontRenderOperation[] = [];
    for (const { operations } of warOperations) {
      for (const operation of operations) {
        if (operation.commanderId === humanId) activeHumanSourceIds.add(operation.sourceId);
        const source = TERRITORY_BY_ID[operation.sourceId];
        const target = TERRITORY_BY_ID[operation.targetId];
        const commander = playerFor(operation.commanderId);
        if (!source || !target || !commander) continue;
        frontRenderOperations.push({
          source,
          target,
          color: commander.isHuman ? 0x70ecff : commander.color,
          isHuman: commander.isHuman,
          momentum: operation.momentum,
        });
      }
    }
    this.activeHumanSourceIds = activeHumanSourceIds;
    this.frontRenderOperations = frontRenderOperations;
    this.humanLogisticsMovements = state.logisticsMovements
      .filter((movement) => movement.playerId === humanId && movement.manpower > 0.000001)
      .sort((left, right) => right.manpower - left.manpower)
      .slice(0, 6);
    const forceSignature = forcePresentationSignature({
      moved: movedTerritoryIds,
      active: activeHumanSourceIds,
      strongest: this.strongestHumanTerritoryIds,
    });
    const forcePresentationChanged = forceSignature !== this.lastForcePresentationSignature;
    if (forcePresentationChanged) this.lastForcePresentationSignature = forceSignature;

    const strategicPresentationChanged = topologyChanged || state.tick - this.lastStrategicScoreTick >= 5;
    if (strategicPresentationChanged) {
      const ranking = engine.globalRanking();
      this.strategicScores = new Map(ranking.map((entry) => [entry.player.id, entry.score]));
      this.ownerRanks = new Map(ranking.map((entry, index) => [entry.player.id, index + 1]));
      this.topPowerOwnerIds = new Set(ranking.slice(0, 10).map((entry) => entry.player.id));
      this.lastStrategicScoreTick = state.tick;
    }
    const operationSignature = warOperations
      .map(({ war, operations }) => `${war.id}:${operations
        .map((operation) => `${operation.commanderId}:${operation.sourceId}:${operation.targetId}:${operation.doctrine}:${Math.round((operation.supply ?? 1) * 10)}:${Math.round(operation.momentum)}`)
        .join('|')}`).join(';');
    const operationChanged = operationSignature !== this.lastOperationSignature;
    if (operationChanged) this.lastOperationSignature = operationSignature;
    const logisticsSignature = state.logisticsMovements.map((movement) => (
      `${movement.playerId}:${movement.sourceId}:${movement.targetId}:${movement.manpower.toFixed(6)}`
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
    for (const territory of TERRITORIES) {
      const territoryState = state.territories[territory.id];
      const visual = this.visuals.get(territory.id);
      const owner = territoryState ? playerFor(territoryState.ownerId) : undefined;
      if (!territoryState || !visual || !owner) continue;
      const empireSize = this.ownerTerritoryCounts.get(owner.id) ?? 1;
      const empireCapital = territoryState.id === (this.ownerLabelTerritoryIds.get(owner.id) ?? owner.capitalId);
      const empireArmy = empireArmies.get(owner.id);
      const displayedArmy = empireCapital && empireArmy
        ? {
          ...empireArmy,
          attack: empireArmy.power > 0 ? empireArmy.attackMass / empireArmy.power : territoryState.army.attack,
          defense: empireArmy.power > 0 ? empireArmy.defenseMass / empireArmy.power : territoryState.army.defense,
        }
        : territoryState.army;
      const integrating = territoryState.coreOwnerId !== territoryState.ownerId
        && territoryState.integration < 0.999999;
      const integrationPercent = Math.round(Phaser.Math.Clamp(territoryState.integration, 0, 1) * 100);
      const fillSignature = [
        owner.id,
        owner.id === humanId ? 'local-human' : owner.isHuman ? 'human' : 'ai',
        integrating ? integrationPercent : 'core',
      ].join(':');
      if (this.fillSignatures.get(territory.id) !== fillSignature) {
        this.fillSignatures.set(territory.id, fillSignature);
        // The flag is now the ownership colour. This neutral underlay is only a
        // fallback for entities without an ISO flag and improves text contrast.
        const integrationTint = 1 - Phaser.Math.Clamp(territoryState.integration, 0, 1);
        for (const part of visual.parts) part.setFillStyle(
          integrating ? 0x9a6a2d : 0x0d1a22,
          integrating ? 0.055 + 0.065 * integrationTint : 0.18,
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
      const ownerRank = this.ownerRanks.get(owner.id);
      const coreOwner = integrating ? playerFor(territoryState.coreOwnerId) : undefined;
      const originalName = coreOwner?.name ?? COUNTRY_BY_ID[territory.id]?.englishName ?? territory.id;
      const labelName = integrating
        ? compactCountryName(originalName).toUpperCase()
        : empireCapital
          ? `${compactCountryName(owner.name).toUpperCase()}${ownerRank ? `  #${ownerRank}` : ''}` : '';
      const controllerLabel = owner.id === humanId ? 'YOU'
        : owner.isHuman ? `PLAYER ${compactControllerName(owner.controllerName).toUpperCase()}` : '';
      const armyLabel = integrating ? `INTEGRATING ${integrationPercent}%`
        : absorbed ? ''
          : owner.isHuman && empireCapital
            ? `${controllerLabel} · ${compactPower(displayedArmy.power)} PWR`
            : `${compactPower(displayedArmy.power)} · A ${displayedArmy.attack.toFixed(1)} · D ${displayedArmy.defense.toFixed(1)}`;
      const labelSignature = `${owner.id}:${empireSize}:${owner.controllerName ?? ''}:${labelName}:${armyLabel}`;
      if (this.labelSignatures.get(territory.id) !== labelSignature) {
        this.labelSignatures.set(territory.id, labelSignature);
        visual.name.setText(labelName);
        visual.detail.setText(armyLabel);
        visual.name.setColor(owner.id === humanId ? '#e2fcff' : owner.isHuman ? '#f2e3ff' : '#f4fbfc');
        visual.layoutWidth = undefined;
        visual.layoutHeight = undefined;
      }
      const localForceText = compactPower(territoryState.army.power);
      if (visual.localForceText !== localForceText) {
        visual.localForceText = localForceText;
        visual.localForce.setText(localForceText);
      }
      const localFill = Phaser.Math.Clamp(
        territoryState.army.manpower / Math.max(0.000001, territoryState.army.capacity), 0, 1,
      );
      const localFillColor = localFill < 0.35 ? 0xef5b5b : localFill < 0.70 ? 0xe8b64a : 0x58d68d;
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
    if (topologyChanged) {
      this.drawOwnershipPerimeters();
      this.setSelection(this.selection, false);
    }
    if (topologyChanged || strategicPresentationChanged || forcePresentationChanged) {
      this.refreshZoomDetails();
    }
  }

  private drawLiveFronts(): void {
    const graphics = this.frontGraphics;
    if (!graphics) return;
    graphics.clear();
    const state = this.mapState;
    if (!state) return;
    graphics.lineStyle(this.screenWorldSize(0.75), 0xff8a79, 0.24);
    for (const connection of TERRITORY_CONNECTIONS) {
      const ownerId = state.territories[connection.sourceId]?.ownerId;
      const neighborOwnerId = state.territories[connection.targetId]?.ownerId;
      if (!ownerId || !neighborOwnerId || ownerId === neighborOwnerId
        || !this.hostileOwnerPairs.has(ownerPairKey(ownerId, neighborOwnerId))) continue;
      this.drawWrappedLine(
        graphics,
        connection.source.x,
        connection.source.y,
        connection.target.x,
        connection.target.y,
      );
    }
    for (const operation of this.frontRenderOperations) {
      graphics.lineStyle(
        this.screenWorldSize(1.4),
        operation.color,
        0.045 + Math.max(0, operation.momentum) * 0.0008,
      );
      this.drawWrappedLine(graphics, operation.source.x, operation.source.y, operation.target.x, operation.target.y);
      graphics.lineStyle(this.screenWorldSize(0.65), operation.color, operation.isHuman ? 0.34 : 0.22);
      this.drawWrappedLine(graphics, operation.source.x, operation.source.y, operation.target.x, operation.target.y);
    }
  }

  private drawLogistics(): void {
    const graphics = this.logisticsGraphics;
    if (!graphics) return;
    graphics.clear();
    for (const movement of this.humanLogisticsMovements) {
      const source = TERRITORY_BY_ID[movement.sourceId];
      const target = TERRITORY_BY_ID[movement.targetId];
      if (!source || !target) continue;
      const intensity = Phaser.Math.Clamp(movement.manpower * 12, 0.10, 0.48);
      graphics.lineStyle(this.screenWorldSize(0.7 + intensity), 0x75efff,
        0.12 + intensity * 0.28);
      this.drawWrappedLine(graphics, source.x, source.y, target.x, target.y);
      if (Math.abs(source.x - target.x) < MAP_WIDTH / 2) {
        const x = source.x + (target.x - source.x) * 0.72;
        const y = source.y + (target.y - source.y) * 0.72;
        const markerScale = this.screenWorldSize(1);
        graphics.fillStyle(0xbaf9ff, 0.40 + intensity * 0.65);
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
      const integrating = territoryState
        ? territoryState.coreOwnerId !== territoryState.ownerId && territoryState.integration < 0.999999
        : false;
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
        const width = selected || target ? 1.85 : hovered ? 1.35 : humanOwned ? 1.3 : otherHumanOwned ? 1.15
          : isLegal ? 1.1 : integrating ? 0.9 : 0.7;
        const color = target ? 0xffd36b : selected || isLegal || humanOwned
          ? 0x8cf3ff : otherHumanOwned ? 0xd6a7ff : integrating ? 0xf2c879 : 0xa9c5cd;
        const alpha = selected || target ? 1 : hovered ? 0.98 : humanOwned ? 0.92 : otherHumanOwned ? 0.84
          : isLegal ? 0.72 : integrating ? 0.56 : 0.28;
        part.setStrokeStyle(this.screenWorldSize(width), color, alpha).setDepth(0.8);
        part.setAlpha(legal.size > 0 && !selected && !target && !isLegal ? 0.62 : 1);
      }
      visual.hud.setDepth(selected || target ? 14 : hovered ? 13 : humanOwned ? 12 : otherHumanOwned ? 11.5
        : isLegal ? 11 : isHinted ? 9 : 8);
    }
    if (hintsChanged) this.drawOwnershipPerimeters();
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
    const point = territoryId ? TERRITORY_BY_ID[territoryId] : undefined;
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
    const point = TERRITORY_BY_ID[territoryId];
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

  territoryScreenPosition(territoryId: string): { x: number; y: number } | undefined {
    const point = TERRITORY_BY_ID[territoryId];
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
    const target = this.visuals.get(result.targetId);
    if (!target) return;
    const targetPoint = TERRITORY_BY_ID[result.targetId];
    if (!targetPoint || !this.pointNearCamera(targetPoint.x, targetPoint.y) || this.activeBattleEffects >= 4) return;
    this.activeBattleEffects += 1;
    const humanDefending = this.engine?.player(result.defenderId)?.isHuman === true;
    const hideTerritoryLabel = result.conquered || this.absorbedTerritoryIds.has(result.targetId);
    if (hideTerritoryLabel) target.hud.setVisible(false);
    else {
      target.hud.setVisible(true).setAlpha(1).setDepth(20);
      this.tweens.add({ targets: target.hud, alpha: { from: .58, to: 1 }, duration: 260, ease: 'Quad.easeOut' });
    }
    const targetState = this.mapState?.territories[result.targetId];
    const targetIntegrating = targetState
      ? targetState.coreOwnerId !== targetState.ownerId && targetState.integration < 0.999999
      : false;
    const mergedTarget = targetState
      ? (this.ownerTerritoryCounts.get(targetState.ownerId) ?? 1) > 1 && !targetIntegrating
      : false;
    for (const part of target.parts.slice(0, 20)) {
      if (humanDefending && !mergedTarget && !result.conquered) {
        part.setStrokeStyle(this.screenWorldSize(1.85), 0xff3f38, 1).setDepth(7);
      }
      this.tweens.add({ targets: part, alpha: { from: 0.25, to: 1 }, duration: result.conquered ? 650 : 320, ease: 'Quad.easeOut' });
    }
    const sourcePoint = TERRITORY_BY_ID[result.sourceId];
    const attacker = this.engine?.player(result.attackerId);
    if (sourcePoint && targetPoint) {
      const strike = this.add.graphics().setDepth(18);
      const operationColor = result.conquered ? 0x8fffc0
        : humanDefending ? 0xff6d63 : attacker?.isHuman ? 0x70ecff : attacker?.color ?? 0xff8a72;
      let adjustedTargetX = targetPoint.x;
      if (Math.abs(targetPoint.x - sourcePoint.x) > MAP_WIDTH / 2) {
        adjustedTargetX += targetPoint.x > sourcePoint.x ? -MAP_WIDTH : MAP_WIDTH;
      }
      const dx = adjustedTargetX - sourcePoint.x;
      const dy = targetPoint.y - sourcePoint.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const wrapped = Math.abs(targetPoint.x - sourcePoint.x) > MAP_WIDTH / 2;
      const arcDirection = String(result.sourceId) < String(result.targetId) ? 1 : -1;
      const arcHeight = wrapped ? 0 : Phaser.Math.Clamp(distance * 0.14, 7, 34) * arcDirection;
      const effectScale = this.screenWorldSize(1);
      const controlX = sourcePoint.x + dx * 0.5 - dy / distance * arcHeight;
      const controlY = sourcePoint.y + dy * 0.5 + dx / distance * arcHeight;
      const drawRoute = (width: number, alpha: number) => {
        strike.lineStyle(width * effectScale, operationColor, alpha);
        if (wrapped) this.drawWrappedLine(strike, sourcePoint.x, sourcePoint.y, targetPoint.x, targetPoint.y);
        else {
          const curve = new Phaser.Curves.QuadraticBezier(
            new Phaser.Math.Vector2(sourcePoint.x, sourcePoint.y),
            new Phaser.Math.Vector2(controlX, controlY),
            new Phaser.Math.Vector2(adjustedTargetX, targetPoint.y),
          );
          strike.strokePoints(curve.getPoints(28), false, false);
        }
      };
      drawRoute(2.4, result.conquered ? 0.17 : 0.10);
      drawRoute(0.85, result.conquered ? 0.78 : 0.58);
      const sourcePulse = this.add.circle(sourcePoint.x, sourcePoint.y, 2.2 * effectScale, operationColor, 0.18)
        .setStrokeStyle(0.8 * effectScale, operationColor, 0.72).setDepth(19);
      this.tweens.add({ targets: sourcePulse, scale: 2.2, alpha: 0, duration: 380,
        ease: 'Sine.easeOut', onComplete: () => sourcePulse.destroy() });
      const projectile = this.add.container(sourcePoint.x, sourcePoint.y).setDepth(19).setScale(effectScale)
        .setRotation(Math.atan2(dy, dx));
      const glow = this.add.circle(-3, 0, 3.2, operationColor, 0.16);
      const tail = this.add.rectangle(-5, 0, 9, 0.75, operationColor, 0.52).setOrigin(0.5);
      const core = this.add.circle(0, 0, 1.35, 0xf5ffff, 0.98);
      projectile.add([glow, tail, core]);
      const travel = { progress: 0 };
      const flightDuration = Phaser.Math.Clamp(distance * 3.4, 380, 900);
      this.tweens.add({
        targets: travel,
        progress: 1,
        duration: flightDuration,
        ease: 'Sine.easeInOut',
        onUpdate: () => {
          const t = travel.progress;
          const inv = 1 - t;
          const rawX = wrapped ? sourcePoint.x + dx * t
            : inv * inv * sourcePoint.x + 2 * inv * t * controlX + t * t * adjustedTargetX;
          const rawY = wrapped ? sourcePoint.y + dy * t
            : inv * inv * sourcePoint.y + 2 * inv * t * controlY + t * t * targetPoint.y;
          const tangentX = wrapped ? dx : 2 * inv * (controlX - sourcePoint.x) + 2 * t * (adjustedTargetX - controlX);
          const tangentY = wrapped ? dy : 2 * inv * (controlY - sourcePoint.y) + 2 * t * (targetPoint.y - controlY);
          projectile.x = (rawX % MAP_WIDTH + MAP_WIDTH) % MAP_WIDTH;
          projectile.y = rawY;
          projectile.rotation = Math.atan2(tangentY, tangentX);
          projectile.alpha = Math.sin(Math.PI * t) ** 0.28;
        },
        onComplete: () => {
          projectile.destroy();
          const impact = this.add.circle(targetPoint.x, targetPoint.y,
            (result.conquered ? 3.2 : 2.4) * effectScale,
            operationColor, 0.10).setStrokeStyle(effectScale, operationColor, 0.78).setDepth(19);
          this.tweens.add({ targets: impact, scale: result.conquered ? 4.2 : 3.1, alpha: 0,
            duration: result.conquered ? 620 : 420, ease: 'Sine.easeOut', onComplete: () => impact.destroy() });
        },
      });
      this.tweens.add({
        targets: strike,
        alpha: 0,
        delay: Math.max(0, flightDuration - 180),
        duration: result.conquered ? 700 : 460,
        ease: 'Quad.easeOut',
        onComplete: () => {
          strike.destroy();
          this.activeBattleEffects = Math.max(0, this.activeBattleEffects - 1);
        },
      });
    } else {
      this.activeBattleEffects = Math.max(0, this.activeBattleEffects - 1);
    }
    if (result.conquered && (attacker?.isHuman || humanDefending)) this.cameras.main.shake(130, 0.0025);
    this.battleLabelRefresh?.remove(false);
    this.battleLabelRefresh = this.time.delayedCall(720, () => {
      this.battleLabelRefresh = undefined;
      this.setSelection(this.selection);
    });
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
