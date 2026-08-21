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
  type MapSceneAdapter,
  type MapSelectionState,
  type MapWarState,
  type WorldMapEngineContract,
} from './bridge';
import { countryFlagAssetUrl } from '../../ui/countryFlags';

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

// Map labels are intentionally closer to cartographic tags than HUD cards:
// country first, one terse military line only when it is contextually useful.
const LABEL_NAME_SIZE = 10;
const LABEL_DETAIL_SIZE = 8;
const LABEL_TEXT_RESOLUTION = 2;
const LABEL_MIN_SCREEN_SCALE = 0.16;
const LABEL_MAX_SCREEN_SCALE = 1.20;
const LABEL_PADDING_X = 6;
const LABEL_COLLISION_GAP = 4;
const LABEL_SAFE_TOP = 80;
const LABEL_SAFE_BOTTOM = 8;
const FLAG_TEXTURE_PREFIX = 'nation-flag-';
const MAP_MIN_ZOOM = 0.78;
const MAP_MAX_ZOOM = 6.2;
// Natural Earth contains roughly 95k coastline vertices. Keeping sub-pixel
// bends adds a lot of Phaser hit-test/triangulation work without making the
// map more legible. A 0.20 world-pixel tolerance removes about 70% of those
// points while staying below 1.25 screen pixels even at maximum zoom.
const BORDER_SIMPLIFICATION_TOLERANCE = 0.2;

interface RenderPoint {
  x: number;
  y: number;
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

function flagTextureKey(nationId: string): string {
  return `${FLAG_TEXTURE_PREFIX}${nationId}`;
}

export class WorldMapScene extends Phaser.Scene implements MapSceneAdapter {
  private visuals = new Map<string, TerritoryVisual>();
  private selection: MapSelectionState = { legalTargetIds: [] };
  private engine?: WorldMapEngineContract;
  private frontGraphics?: Phaser.GameObjects.Graphics;
  private routeGraphics?: Phaser.GameObjects.Graphics;
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
  private humanCapitalId?: string;
  private warTerritoryIds = new Set<string>();
  private ownerTerritoryCounts = new Map<string, number>();
  private ownerLabelTerritoryIds = new Map<string, string>();
  private absorbedTerritoryIds = new Set<string>();
  private fillSignatures = new Map<string, string>();
  private labelSignatures = new Map<string, string>();
  private strategicScores = new Map<string, number>();
  private ownerRanks = new Map<string, number>();
  private topPowerOwnerIds = new Set<string>();
  private lastStrategicScoreTick = -Infinity;
  private lastTopologySignature = '';
  private lastOperationSignature = '';
  private lastLogisticsSignature = '';
  private activeBattleEffects = 0;
  private battleLabelRefresh?: Phaser.Time.TimerEvent;

  constructor() {
    super({ key: 'WorldMapScene' });
  }

  preload(): void {
    // Exactly one tiny texture per nation. Territories only swap a cached
    // texture on conquest; no flag is generated, fetched or decoded per frame.
    for (const country of COUNTRIES) {
      const url = countryFlagAssetUrl(country.id);
      if (url && !this.textures.exists(flagTextureKey(country.id))) {
        this.load.svg(flagTextureKey(country.id), url, { width: 64, height: 48 });
      }
    }
  }

  create(): void {
    this.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
    this.drawOcean();
    this.flagAtlas = this.textures.createCanvas('world-flag-atlas', MAP_WIDTH, MAP_HEIGHT);
    this.flagAtlasImage = this.add.image(0, 0, 'world-flag-atlas').setOrigin(0, 0).setDepth(0.4);
    this.routeGraphics = this.add.graphics().setDepth(-6);
    this.logisticsGraphics = this.add.graphics().setDepth(5.5);
    this.ownershipBoundaryGraphics = this.add.graphics().setDepth(2);
    this.frontGraphics = this.add.graphics().setDepth(6);
    this.buildOwnershipBoundarySegments();
    this.createCountries();
    this.redrawFlagAtlas();
    this.configureCamera();
    this.refreshZoomDetails();
    mapBridge.attach(this);
  }

  private drawOcean(): void {
    const sea = this.add.graphics().setDepth(-20);
    sea.fillGradientStyle(0x071521, 0x071521, 0x0a2432, 0x0a2432, 1);
    sea.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    sea.lineStyle(1, 0x4c94aa, 0.11);
    for (let longitude = -150; longitude <= 150; longitude += 30) {
      const top = projectWorldPoint(longitude, 84);
      const bottom = projectWorldPoint(longitude, -58);
      sea.lineBetween(top.x, top.y, bottom.x, bottom.y);
    }
    for (let latitude = -45; latitude <= 75; latitude += 15) {
      const left = projectWorldPoint(-180, latitude);
      const right = projectWorldPoint(180, latitude);
      sea.lineBetween(left.x, left.y, right.x, right.y);
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

  private drawOwnershipPerimeters(state: MapStateSnapshot): void {
    const graphics = this.ownershipBoundaryGraphics;
    if (!graphics) return;
    graphics.clear();
    const border: OwnershipBoundarySegment[] = [];
    const humanBorder: OwnershipBoundarySegment[] = [];
    for (const segment of this.ownershipBoundarySegments) {
      // Singleton segments are coastlines. Their filled silhouette already reads
      // against the ocean, so this layer only owns political land perimeters.
      if (segment.territoryIds.length === 1) continue;
      const owners = new Set(segment.territoryIds
        .map((territoryId) => state.territories[territoryId]?.ownerId)
        .filter((ownerId): ownerId is string => Boolean(ownerId)));
      if (owners.size === 0) continue;
      if (owners.size === 1) continue;
      if (owners.has(state.humanPlayerId)) humanBorder.push(segment);
      else border.push(segment);
    }
    const draw = (segmentsToDraw: readonly OwnershipBoundarySegment[], width: number, color: number, alpha: number) => {
      graphics.lineStyle(width, color, alpha);
      for (const segment of segmentsToDraw) this.drawWrappedLine(graphics, segment.x1, segment.y1, segment.x2, segment.y2);
    };
    draw(border, 1.15, 0xd4e7eb, 0.58);
    draw(humanBorder, 1.7, 0x8cf3ff, 0.88);
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
      });
    }
  }

  /**
   * Builds every current realm into one low-resolution world texture. An empire
   * receives exactly one stretched flag, clipped across all territory it owns.
   * The atlas is rebuilt only when ownership changes, leaving one cheap map draw
   * instead of 165 live flag images and geometry masks every frame.
   */
  private redrawFlagAtlas(state: MapStateSnapshot | undefined = this.mapState): void {
    const atlas = this.flagAtlas;
    if (!atlas) return;
    const context = atlas.context;
    context.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
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
    atlas.refresh();
  }

  private hoverCountry(countryId: string, pointer: Phaser.Input.Pointer): void {
    if (this.inputBlocked) return;
    const hoverChanged = this.hoveredId !== countryId;
    this.hoveredId = countryId;
    const visual = this.visuals.get(countryId);
    const territoryState = this.mapState?.territories[countryId];
    const mergedRegion = territoryState ? (this.ownerTerritoryCounts.get(territoryState.ownerId) ?? 1) > 1 : false;
    const absorbed = this.absorbedTerritoryIds.has(countryId);
    if (!mergedRegion) for (const part of visual?.parts ?? []) part.setStrokeStyle(1.35, 0xe8fbff, 0.92).setDepth(0.8);
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
    return { width, height };
  }

  private refreshZoomDetails(): void {
    const zoom = this.cameras.main.zoom;
    const camera = this.cameras.main;
    const humanId = this.mapState?.humanPlayerId;
    const movedIds = new Set((this.mapState?.logisticsMovements ?? [])
      .filter((movement) => movement.playerId === humanId)
      .flatMap((movement) => [movement.sourceId, movement.targetId]));
    const activeSourceIds = new Set((this.mapState?.wars ?? []).flatMap((war) => (
      sortedWarOperations(war)
        .filter((operation) => operation.commanderId === humanId)
        .map((operation) => operation.sourceId)
    )));
    const strongestHumanIds = new Set(Object.values(this.mapState?.territories ?? {})
      .filter((territory) => territory.ownerId === humanId)
      .sort((left, right) => right.army.power - left.army.power)
      .slice(0, 6).map((territory) => territory.id));
    const candidates: {
      territoryId: string;
      visual: TerritoryVisual;
      priority: number;
      required: boolean;
      strategic: boolean;
      showDetail: boolean;
    }[] = [];
    for (const [territoryId, visual] of this.visuals) {
      const localTerritory = this.mapState?.territories[territoryId];
      const showLocalForce = localTerritory?.ownerId === humanId
        && (zoom >= 1.45 || movedIds.has(territoryId) || activeSourceIds.has(territoryId) || strongestHumanIds.has(territoryId));
      const forceAnchor = TERRITORY_BY_ID[territoryId];
      if (showLocalForce && forceAnchor) {
        const forceScale = Phaser.Math.Clamp(1 / zoom, 0.24, 1.18);
        const barY = forceAnchor.y + 39 / zoom;
        visual.localForce.setPosition(forceAnchor.x, forceAnchor.y + 29 / zoom)
          .setScale(forceScale).setVisible(true)
          .setColor(movedIds.has(territoryId) ? '#e3fdff' : '#9eeaf4')
          .setAlpha(movedIds.has(territoryId) || activeSourceIds.has(territoryId) ? 1 : 0.76);
        visual.localForceBarBack.setPosition(forceAnchor.x - 17 * forceScale, barY)
          .setScale(forceScale).setVisible(true);
        visual.localForceBarFill.setPosition(forceAnchor.x - 17 * forceScale, barY)
          .setScale(forceScale).setVisible(true);
      } else {
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
      const ownerId = this.mapState?.territories[territoryId]?.ownerId;
      const topPower = Boolean(ownerId && this.topPowerOwnerIds.has(ownerId));
      const required = selected || hovered;
      const strategic = required || ownCapital || atWar || topPower;
      const absorbed = this.absorbedTerritoryIds.has(territoryId);
      visual.hud.setVisible(false);
      const anchor = TERRITORY_BY_ID[territoryId];
      if (anchor) visual.hud.setPosition(anchor.x, anchor.y);
      // A captured country becomes part of its owner's empire. Its former national
      // label never returns on the map; geographic identity remains in DOM intel.
      if (absorbed) continue;
      // Keep the strategic map quiet: only the player's empire, active
      // belligerents, the military top five, selection and hover receive a nameplate.
      // Zoom reveals geography, never a wall of labels.
      const eligible = strategic;
      if (!eligible) continue;
      const country = COUNTRY_BY_ID[territoryId];
      candidates.push({
        territoryId,
        visual,
        required,
        strategic,
        showDetail: required || atWar || zoom >= 1.55,
        priority: (target ? 110_000 : source ? 105_000 : hovered ? 100_000 : ownCapital ? 90_000 : atWar ? 80_000 : topPower ? 70_000 : 0)
          + (this.mapState ? this.strategicScores.get(this.mapState.territories[territoryId]?.ownerId ?? territoryId) ?? country?.powerIndex ?? 0 : country?.powerIndex ?? 0) * 10
          - (country?.labelRank ?? 5),
      });
    }

    // Persistent DOM chrome overlays the canvas. Reserve it in the same collision
    // pass so country text never sits underneath the header or command dock.
    const accepted: Phaser.Geom.Rectangle[] = [
      new Phaser.Geom.Rectangle(0, 0, camera.width, LABEL_SAFE_TOP),
      new Phaser.Geom.Rectangle(0, Math.max(0, camera.height - 76), Math.min(340, camera.width), 76),
    ];
    candidates.sort((left, right) => right.priority - left.priority || left.territoryId.localeCompare(right.territoryId));
    for (const { territoryId, visual, required, strategic, showDetail } of candidates) {
      // One compact badge system at every zoom. The overview shows names only;
      // military detail appears for interaction, active wars and closer zoom.
      const scale = Phaser.Math.Clamp(1 / zoom, LABEL_MIN_SCREEN_SCALE, LABEL_MAX_SCREEN_SCALE);
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
      const offsets = strategic
        ? [[0, 0], [0, -height - 4], [0, height + 4], [-width * 0.56, 0], [width * 0.56, 0]] as const
        : [[0, 0]] as const;
      let placement: { x: number; y: number; bounds: Phaser.Geom.Rectangle } | undefined;
      for (const [offsetX, offsetY] of offsets) {
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
        const bounds = new Phaser.Geom.Rectangle(
          centerX - width / 2,
          centerY - height / 2,
          width,
          height,
        );
        Phaser.Geom.Rectangle.Inflate(bounds, LABEL_COLLISION_GAP, LABEL_COLLISION_GAP);
        if (accepted.some((other) => Phaser.Geom.Intersects.RectangleToRectangle(bounds, other))) continue;
        placement = { x: centerX - anchorScreenX, y: centerY - anchorScreenY, bounds };
        break;
      }
      // The currently selected/hovered label is the only one allowed to win an
      // impossible collision; other labels cull cleanly instead of piling up.
      if (!placement && required) {
        const centerX = Phaser.Math.Clamp(anchorScreenX, width / 2 + LABEL_COLLISION_GAP, camera.width - width / 2 - LABEL_COLLISION_GAP);
        const centerY = Phaser.Math.Clamp(
          anchorScreenY,
          LABEL_SAFE_TOP + height / 2 + LABEL_COLLISION_GAP,
          camera.height - LABEL_SAFE_BOTTOM - height / 2 - LABEL_COLLISION_GAP,
        );
        const bounds = new Phaser.Geom.Rectangle(centerX - width / 2, centerY - height / 2, width, height);
        Phaser.Geom.Rectangle.Inflate(bounds, LABEL_COLLISION_GAP, LABEL_COLLISION_GAP);
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
      const owner = ownerId ? this.engine?.player(ownerId) : undefined;
      const own = ownerId === this.mapState?.humanPlayerId;
      const atWar = this.warTerritoryIds.has(territoryId);
      const accent = selected ? 0xffd36b : hovered ? 0xffffff : own ? 0x72efff : atWar ? 0xff746d : owner?.color ?? 0xa8c8d2;
      visual.panel.setFillStyle(0x04111b, selected || hovered ? 0.98 : 0.93);
      visual.panel.setStrokeStyle(selected || hovered ? 1.4 : 1, accent, selected || hovered ? 1 : 0.74);
      visual.detail.setColor(selected ? '#ffeaa8' : own ? '#b9f8ff' : atWar ? '#ffd0cc' : '#c6dce2');
    }
  }

  private clientPosition(pointer: Phaser.Input.Pointer): { x: number; y: number } {
    const event = pointer.event;
    if ('clientX' in event) return { x: event.clientX, y: event.clientY };
    const touch = event.touches[0] ?? event.changedTouches[0];
    return touch ? { x: touch.clientX, y: touch.clientY } : { x: pointer.x, y: pointer.y };
  }

  private configureCamera(): void {
    // Phaser anchors worlds smaller than the zoomed viewport to the top-left.
    // Manual constraints below keep that case centred while still preventing
    // an inset zoom from being dragged into empty space.
    this.cameras.main.removeBounds();
    this.input.on('wheel', (pointer: Phaser.Input.Pointer, _objects: unknown, _dx: number, deltaY: number) => {
      if (this.inputBlocked) return;
      const camera = this.cameras.main;
      const before = camera.getWorldPoint(pointer.x, pointer.y);
      const oldZoom = camera.zoom;
      const zoom = Phaser.Math.Clamp(oldZoom - deltaY * 0.00115, MAP_MIN_ZOOM, MAP_MAX_ZOOM);
      camera.setZoom(zoom);
      camera.scrollX = before.x - camera.width / 2 - (pointer.x - camera.width / 2) / zoom;
      camera.scrollY = before.y - camera.height / 2 - (pointer.y - camera.height / 2) / zoom;
      if (zoom < oldZoom) {
        const cursorScrollX = camera.scrollX;
        const cursorScrollY = camera.scrollY;
        const centeredScrollX = MAP_WIDTH / 2 - camera.width / 2;
        const centeredScrollY = MAP_HEIGHT / 2 - camera.height / 2;
        // Close zoom remains pointer-anchored. Near the complete world view the
        // camera progressively returns to the actual centre of the map.
        const centerPull = Phaser.Math.Clamp((1.22 - zoom) / (1.22 - MAP_MIN_ZOOM), 0, 1);
        camera.scrollX = Phaser.Math.Linear(cursorScrollX, centeredScrollX, centerPull);
        camera.scrollY = Phaser.Math.Linear(cursorScrollY, centeredScrollY, centerPull);
        if (zoom <= MAP_MIN_ZOOM + 0.005) {
          camera.scrollX = centeredScrollX;
          camera.scrollY = centeredScrollY;
        }
      }
      this.constrainCamera();
      this.refreshZoomDetails();
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.inputBlocked) return;
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
    const human = engine.player(humanId);
    const ownerSignature = `${humanId}|${TERRITORIES.map((territory) => state.territories[territory.id]?.ownerId ?? '').join(',')}`;
    if (ownerSignature !== this.flagAtlasOwnerSignature) {
      this.flagAtlasOwnerSignature = ownerSignature;
      this.redrawFlagAtlas(state);
    }
    const topologySignature = `${humanId}:${human?.capitalId ?? ''}|${ownerSignature}|${state.wars.map((war) => `${war.id}:${war.attackerId}:${war.defenderId}`).sort().join(',')}`;
    const topologyChanged = topologySignature !== this.lastTopologySignature;
    if (topologyChanged) {
      this.lastTopologySignature = topologySignature;
      this.humanOwnedIds = new Set(engine.territoriesOf(humanId).map((territory) => territory.id));
      this.ownerTerritoryCounts.clear();
      this.ownerLabelTerritoryIds.clear();
      this.absorbedTerritoryIds.clear();
      const territoryIdsByOwner = new Map<string, string[]>();
      for (const territoryState of Object.values(state.territories)) {
        this.ownerTerritoryCounts.set(territoryState.ownerId, (this.ownerTerritoryCounts.get(territoryState.ownerId) ?? 0) + 1);
        const ids = territoryIdsByOwner.get(territoryState.ownerId) ?? [];
        ids.push(territoryState.id);
        territoryIdsByOwner.set(territoryState.ownerId, ids);
      }
      for (const [ownerId, territoryIds] of territoryIdsByOwner) {
        const owner = engine.player(ownerId);
        const labelTerritoryId = owner && territoryIds.includes(owner.capitalId)
          ? owner.capitalId
          : [...territoryIds].sort((left, right) => (
            (COUNTRY_BY_ID[right]?.powerIndex ?? 0) - (COUNTRY_BY_ID[left]?.powerIndex ?? 0)
            || left.localeCompare(right)
          ))[0];
        if (labelTerritoryId) this.ownerLabelTerritoryIds.set(ownerId, labelTerritoryId);
      }
      this.humanCapitalId = this.ownerLabelTerritoryIds.get(humanId) ?? human?.capitalId;
      for (const territoryState of Object.values(state.territories)) {
        if ((this.ownerTerritoryCounts.get(territoryState.ownerId) ?? 0) > 1
          && territoryState.id !== this.ownerLabelTerritoryIds.get(territoryState.ownerId)) this.absorbedTerritoryIds.add(territoryState.id);
      }
      this.warTerritoryIds.clear();
      for (const war of state.wars) {
        for (const territory of TERRITORIES) {
          const ownerId = state.territories[territory.id]?.ownerId;
          if (ownerId === war.attackerId || ownerId === war.defenderId) this.warTerritoryIds.add(territory.id);
        }
      }
    }
    if (topologyChanged || state.tick - this.lastStrategicScoreTick >= 5) {
      const ranking = engine.globalRanking();
      this.strategicScores = new Map(ranking.map((entry) => [entry.player.id, entry.score]));
      this.ownerRanks = new Map(ranking.map((entry, index) => [entry.player.id, index + 1]));
      this.topPowerOwnerIds = new Set(ranking.slice(0, 5).map((entry) => entry.player.id));
      this.lastStrategicScoreTick = state.tick;
      this.refreshZoomDetails();
    }
    const operationSignature = [...state.wars].sort((left, right) => left.id.localeCompare(right.id))
      .map((war) => `${war.id}:${sortedWarOperations(war)
        .map((operation) => `${operation.commanderId}:${operation.sourceId}:${operation.targetId}:${operation.doctrine}:${Math.round((operation.supply ?? 1) * 10)}:${Math.round(operation.momentum)}`)
        .join('|')}`).join(';');
    const operationChanged = operationSignature !== this.lastOperationSignature;
    if (operationChanged) this.lastOperationSignature = operationSignature;
    const logisticsSignature = state.logisticsMovements.map((movement) => (
      `${movement.playerId}:${movement.sourceId}:${movement.targetId}:${movement.manpower.toFixed(6)}:${movement.veteranManpower.toFixed(6)}`
    )).join('|');
    const logisticsChanged = logisticsSignature !== this.lastLogisticsSignature;
    if (logisticsChanged) this.lastLogisticsSignature = logisticsSignature;
    const playerViews = new Map<string, ReturnType<WorldMapEngineContract['player']>>();
    const playerFor = (playerId: string) => {
      if (!playerViews.has(playerId)) playerViews.set(playerId, engine.player(playerId));
      return playerViews.get(playerId);
    };
    const empireArmies = new Map<string, {
      manpower: number;
      capacity: number;
      combatStrength: number;
      power: number;
      attackMass: number;
      defenseMass: number;
    }>();
    for (const territoryState of Object.values(state.territories)) {
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
      const fillSignature = [
        owner.id,
        owner.id === humanId ? 1 : 0,
      ].join(':');
      if (this.fillSignatures.get(territory.id) !== fillSignature) {
        this.fillSignatures.set(territory.id, fillSignature);
        // The flag is now the ownership colour. This neutral underlay is only a
        // fallback for entities without an ISO flag and improves text contrast.
        for (const part of visual.parts) part.setFillStyle(0x0d1a22, 0.18);
        visual.panel.setStrokeStyle(1, owner.id === humanId ? 0x77efff : 0xa8c8d2, 0.74);
      }
      // An absorbed territory never keeps its former country label. The current
      // realm name appears once, at its capital; every visible label uses the same
      // compact name + one consistent total-force badge. Veteran durability is
      // folded into this value by the UI bridge.
      const absorbed = this.absorbedTerritoryIds.has(territory.id);
      const ownerRank = this.ownerRanks.get(owner.id);
      const labelName = empireCapital
        ? `${compactCountryName(owner.name).toUpperCase()}${ownerRank ? `  #${ownerRank}` : ''}` : '';
      const armyLabel = absorbed ? ''
        : `${compactPower(displayedArmy.power)} · A ${displayedArmy.attack.toFixed(1)} · D ${displayedArmy.defense.toFixed(1)}`;
      const labelSignature = `${owner.id}:${empireSize}:${labelName}:${armyLabel}`;
      if (this.labelSignatures.get(territory.id) !== labelSignature) {
        this.labelSignatures.set(territory.id, labelSignature);
        visual.name.setText(labelName);
        visual.detail.setText(armyLabel);
        visual.name.setColor('#f4fbfc');
      }
      visual.localForce.setText(compactPower(territoryState.army.power));
      const localFill = Phaser.Math.Clamp(
        territoryState.army.manpower / Math.max(0.000001, territoryState.army.capacity), 0, 1,
      );
      visual.localForceBarFill.setSize(34 * localFill, 3).setFillStyle(
        localFill < 0.35 ? 0xef5b5b : localFill < 0.70 ? 0xe8b64a : 0x58d68d,
        0.92,
      );
    }
    if (topologyChanged || operationChanged) {
      this.drawLiveFronts(engine, state);
    }
    if (topologyChanged || operationChanged || logisticsChanged) this.drawLogistics(state);
    if (topologyChanged) {
      this.drawOwnershipPerimeters(state);
      this.setSelection(this.selection);
      this.refreshZoomDetails();
    }
  }

  private drawLiveFronts(engine: WorldMapEngineContract, state: MapStateSnapshot): void {
    const graphics = this.frontGraphics;
    if (!graphics) return;
    graphics.clear();
    const seen = new Set<string>();
    for (const territory of TERRITORIES) {
      const ownerId = state.territories[territory.id]?.ownerId;
      for (const neighborId of territory.neighbors) {
        const key = [territory.id, neighborId].sort().join(':');
        if (seen.has(key)) continue;
        seen.add(key);
        const neighborOwnerId = state.territories[neighborId]?.ownerId;
        const atWar = state.wars.some((war) => (
          (war.attackerId === ownerId && war.defenderId === neighborOwnerId)
          || (war.attackerId === neighborOwnerId && war.defenderId === ownerId)
        ));
        if (!ownerId || !neighborOwnerId || ownerId === neighborOwnerId || !atWar) continue;
        const neighbor = TERRITORY_BY_ID[neighborId];
        if (!neighbor) continue;
        graphics.lineStyle(0.75, 0xff8a79, 0.24);
        this.drawWrappedLine(graphics, territory.x, territory.y, neighbor.x, neighbor.y);
      }
    }
    for (const war of [...state.wars].sort((left, right) => left.id.localeCompare(right.id))) {
      for (const operation of sortedWarOperations(war)) {
        const source = TERRITORY_BY_ID[operation.sourceId];
        const target = TERRITORY_BY_ID[operation.targetId];
        const commander = engine.player(operation.commanderId);
        if (!source || !target || !commander) continue;
        const color = commander.isHuman ? 0x70ecff : commander.color;
        graphics.lineStyle(1.4, color, 0.045 + Math.max(0, operation.momentum) * 0.0008);
        this.drawWrappedLine(graphics, source.x, source.y, target.x, target.y);
        graphics.lineStyle(0.65, color, commander.isHuman ? 0.34 : 0.22);
        this.drawWrappedLine(graphics, source.x, source.y, target.x, target.y);
      }
    }
  }

  private drawLogistics(state: MapStateSnapshot): void {
    const graphics = this.logisticsGraphics;
    if (!graphics) return;
    graphics.clear();
    const humanMoves = state.logisticsMovements
      .filter((movement) => movement.playerId === state.humanPlayerId
        && movement.manpower > 0.000001)
      .sort((left, right) => right.manpower - left.manpower
        || right.veteranManpower - left.veteranManpower)
      .slice(0, 6);
    for (const movement of humanMoves) {
      const source = TERRITORY_BY_ID[movement.sourceId];
      const target = TERRITORY_BY_ID[movement.targetId];
      if (!source || !target) continue;
      const includesVeterans = movement.veteranManpower > 0.000001;
      const intensity = Phaser.Math.Clamp(movement.manpower * 12, 0.10, 0.48);
      const color = includesVeterans ? 0xffd56a : 0x75efff;
      graphics.lineStyle(includesVeterans ? 1.15 : 0.7 + intensity, color,
        includesVeterans ? 0.42 : 0.12 + intensity * 0.28);
      this.drawWrappedLine(graphics, source.x, source.y, target.x, target.y);
      if (Math.abs(source.x - target.x) < MAP_WIDTH / 2) {
        const x = source.x + (target.x - source.x) * 0.72;
        const y = source.y + (target.y - source.y) * 0.72;
        graphics.fillStyle(includesVeterans ? 0xffe6a0 : 0xbaf9ff, 0.40 + intensity * 0.65);
        if (includesVeterans) graphics.fillRect(x - 2, y - 2, 4, 4);
        else graphics.fillCircle(x, y, 1.2 + intensity * 1.8);
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

  setSelection(selection: MapSelectionState): void {
    this.selection = selection;
    const state = this.mapState;
    const humanId = state?.humanPlayerId;
    const legal = new Set(selection.legalTargetIds);
    for (const [territoryId, visual] of this.visuals) {
      const selected = territoryId === selection.sourceId;
      const target = territoryId === selection.targetId;
      const isLegal = legal.has(territoryId);
      const hovered = territoryId === this.hoveredId;
      const humanOwned = this.humanOwnedIds.has(territoryId);
      const territoryState = state?.territories[territoryId];
      const owner = territoryState ? this.engine?.player(territoryState.ownerId) : undefined;
      const empireSize = owner ? this.ownerTerritoryCounts.get(owner.id) ?? 1 : 1;
      const mergedRegion = empireSize > 1;
      for (const part of visual.parts) {
        const mergedFill = owner
          ? colorMix(owner.id === humanId ? colorMix(owner.color, 0x65efff, 0.22) : owner.color, 0x071521, owner.id === humanId ? 0.08 : 0.24)
          : 0xa9c5cd;
        if (mergedRegion) {
          // Territory polygons are implementation detail once a nation owns more
          // than one region. Never reveal the former national outline on hover.
          part.setStrokeStyle(0, mergedFill, 0).setDepth(0.8);
          part.setAlpha(legal.size > 0 && !selected && !target && !isLegal ? 0.62 : 1);
          continue;
        }
        const width = selected || target ? 1.85 : hovered ? 1.35 : humanOwned ? 1.3 : isLegal ? 1.1 : 0.7;
        const color = target ? 0xffd36b : selected || isLegal || humanOwned ? 0x8cf3ff : 0xa9c5cd;
        const alpha = selected || target ? 1 : hovered ? 0.98 : humanOwned ? 0.92 : isLegal ? 0.72 : 0.28;
        part.setStrokeStyle(width, color, alpha).setDepth(0.8);
        part.setAlpha(legal.size > 0 && !selected && !target && !isLegal ? 0.62 : 1);
      }
      visual.hud.setDepth(selected || target ? 14 : hovered ? 13 : humanOwned ? 12 : isLegal ? 11 : 8);
    }
    this.refreshZoomDetails();
  }

  setInputBlocked(blocked: boolean): void {
    if (this.inputBlocked === blocked) return;
    this.inputBlocked = blocked;
    this.pointerDown = undefined;
    this.dragged = false;
    if (!blocked || !this.hoveredId) return;
    this.hoveredId = undefined;
    mapBridge.onTerritoryHover?.(undefined, 0, 0);
    this.setSelection(this.selection);
  }

  focusAction(sourceId?: string, targetId?: string): void {
    const point = targetId ? TERRITORY_BY_ID[targetId] : sourceId ? TERRITORY_BY_ID[sourceId] : undefined;
    if (!point) return;
    const camera = this.cameras.main;
    const targetZoom = Math.max(camera.zoom, 1.45);
    this.tweens.add({
      targets: camera,
      // Phaser's scroll position is measured from the unzoomed camera centre.
      // Dividing the half-viewport by zoom shifts the target east/south.
      scrollX: point.x - camera.width / 2,
      scrollY: point.y - camera.height / 2,
      zoom: targetZoom,
      duration: 420,
      ease: 'Sine.easeInOut',
      onUpdate: () => this.refreshZoomDetails(),
      onComplete: () => this.refreshZoomDetails(),
    });
  }

  focusCountry(territoryId: string): void {
    const point = TERRITORY_BY_ID[territoryId];
    if (!point) return;
    const camera = this.cameras.main;
    // The country-selection handoff should feel like entering a command map,
    // not returning to the continent overview. Large countries remain freely
    // pannable and the player can always zoom back out afterwards.
    const targetZoom = 3.15;
    this.tweens.add({
      targets: camera,
      scrollX: point.x - camera.width / 2,
      scrollY: point.y - camera.height / 2,
      zoom: targetZoom,
      duration: 620,
      ease: 'Sine.easeInOut',
      onUpdate: () => this.refreshZoomDetails(),
      onComplete: () => this.refreshZoomDetails(),
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
    const mergedTarget = targetState ? (this.ownerTerritoryCounts.get(targetState.ownerId) ?? 1) > 1 : false;
    for (const part of target.parts.slice(0, 20)) {
      if (humanDefending && !mergedTarget && !result.conquered) part.setStrokeStyle(1.85, 0xff3f38, 1).setDepth(7);
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
      const controlX = sourcePoint.x + dx * 0.5 - dy / distance * arcHeight;
      const controlY = sourcePoint.y + dy * 0.5 + dx / distance * arcHeight;
      const drawRoute = (width: number, alpha: number) => {
        strike.lineStyle(width, operationColor, alpha);
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
      const sourcePulse = this.add.circle(sourcePoint.x, sourcePoint.y, 2.2, operationColor, 0.18)
        .setStrokeStyle(0.8, operationColor, 0.72).setDepth(19);
      this.tweens.add({ targets: sourcePulse, scale: 2.2, alpha: 0, duration: 380,
        ease: 'Sine.easeOut', onComplete: () => sourcePulse.destroy() });
      const projectile = this.add.container(sourcePoint.x, sourcePoint.y).setDepth(19)
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
          const impact = this.add.circle(targetPoint.x, targetPoint.y, result.conquered ? 3.2 : 2.4,
            operationColor, 0.10).setStrokeStyle(1, operationColor, 0.78).setDepth(19);
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
    this.tweens.add({
      targets: camera,
      scrollX: MAP_WIDTH / 2 - camera.width / 2,
      scrollY: MAP_HEIGHT / 2 - camera.height / 2,
      zoom: 1,
      duration: 420,
      ease: 'Sine.easeInOut',
      onUpdate: () => this.refreshZoomDetails(),
      onComplete: () => this.refreshZoomDetails(),
    });
  }
}
