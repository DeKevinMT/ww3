import {
  COUNTRIES,
  COUNTRY_BY_ID,
  terrainProfileForTerritory,
  type CountryRecord,
} from '../../data/worldMap';
import { countryFlagAssetUrl } from '../../../ui/countryFlags';
import {
  ANTARCTICA_COASTLINE,
  ARCTIC_ICE_COASTLINE,
} from '../mapGeographyPresentation';
import type {
  MapSelectionState,
  WorldMapEngineContract,
} from '../bridge';
import {
  terrainTextureLayerPresentation,
  type TerrainTextureLayerPresentation,
} from './terrainTexturePresentation';

export const GLOBE_TEXTURE_WIDTH = 3072;
export const GLOBE_TEXTURE_HEIGHT = 1536;
const HIGH_DETAIL_GLOBE_TEXTURE_WIDTH = 4096;
const HIGH_DETAIL_GLOBE_TEXTURE_HEIGHT = 2048;
const HIGH_DETAIL_MIN_VIEWPORT_WIDTH = 900;
const DETAIL_TEXTURE_WIDTH = 2048;
const DETAIL_TEXTURE_HEIGHT = 1536;
const DETAIL_FLAG_WIDTH = 1024;
const DETAIL_FLAG_HEIGHT = 768;
const DETAIL_FLAG_CACHE_LIMIT = 24;
const PICK_TEXTURE_WIDTH = 2048;
const PICK_TEXTURE_HEIGHT = 1024;
const ANTARCTICA_PICK_ID = 0xff_ff_ff;
const ARCTIC_PICK_ID = 0xff_ff_fe;

export type GlobePickResult =
  | { kind: 'country'; territoryId: string }
  | { kind: 'antarctica' }
  | { kind: 'arctic' }
  | undefined;

type Coordinate = readonly [number, number];

interface PreparedRing {
  points: readonly Coordinate[];
  minimumLongitude: number;
  maximumLongitude: number;
  minimumLatitude: number;
  maximumLatitude: number;
}

interface PreparedCountry {
  country: CountryRecord;
  rings: readonly PreparedRing[];
  pickId: number;
}

interface TextureSnapshot {
  engine?: WorldMapEngineContract;
  selection: MapSelectionState;
}

export interface GlobeDetailView {
  longitude: number;
  latitude: number;
  longitudeSpan: number;
  latitudeSpan: number;
}

interface DetailRenderWindow {
  minimumLongitude: number;
  maximumLongitude: number;
  minimumLatitude: number;
  maximumLatitude: number;
}

const colorCss = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

function colorMix(left: number, right: number, amount: number): number {
  const red = ((left >> 16) & 0xff) * (1 - amount) + ((right >> 16) & 0xff) * amount;
  const green = ((left >> 8) & 0xff) * (1 - amount) + ((right >> 8) & 0xff) * amount;
  const blue = (left & 0xff) * (1 - amount) + (right & 0xff) * amount;
  return (Math.round(red) << 16) | (Math.round(green) << 8) | Math.round(blue);
}

function drawDominantTerrainTint(
  context: CanvasRenderingContext2D,
  country: PreparedCountry,
  terrainLayers: TerrainTextureLayerPresentation,
  width: number,
  height: number,
  dimmed: boolean,
): void {
  context.save();
  tracePreparedCountry(context, country, width, height);
  context.fillStyle = colorCss(terrainLayers.tintColor);
  context.globalAlpha = terrainLayers.tintAlpha * (dimmed ? 0.46 : 1);
  context.fill('evenodd');
  context.restore();
}

function unwrapRing(ring: readonly Coordinate[]): Coordinate[] {
  const first = ring[0];
  if (!first) return [];
  const result: Coordinate[] = [[first[0], first[1]]];
  let previous = first[0];
  let offset = 0;
  for (const [longitude, latitude] of ring.slice(1)) {
    const initial = longitude + offset;
    if (initial - previous > 180) offset -= 360;
    else if (initial - previous < -180) offset += 360;
    const unwrappedLongitude = longitude + offset;
    result.push([unwrappedLongitude, latitude]);
    previous = unwrappedLongitude;
  }
  return result;
}

function prepareRing(ring: readonly Coordinate[]): PreparedRing | undefined {
  const points = unwrapRing(ring);
  if (points.length < 3) return undefined;
  return {
    points,
    minimumLongitude: Math.min(...points.map(([longitude]) => longitude)),
    maximumLongitude: Math.max(...points.map(([longitude]) => longitude)),
    minimumLatitude: Math.min(...points.map(([, latitude]) => latitude)),
    maximumLatitude: Math.max(...points.map(([, latitude]) => latitude)),
  };
}

const PREPARED_COUNTRIES: readonly PreparedCountry[] = COUNTRIES.map((country, index) => ({
  country,
  pickId: index + 1,
  rings: country.rings.flatMap((ring) => {
    const prepared = prepareRing(ring);
    return prepared ? [prepared] : [];
  }),
}));

function borderPointKey([longitude, latitude]: Coordinate): string {
  const wrappedLongitude = ((longitude + 180) % 360 + 360) % 360 - 180;
  return `${wrappedLongitude.toFixed(5)}:${latitude.toFixed(5)}`;
}

function borderEdgeKey(start: Coordinate, end: Coordinate): string {
  const left = borderPointKey(start);
  const right = borderPointKey(end);
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

/** Canonical shared edges let conquered neighbours read as one realm. */
const BORDER_EDGE_COUNTRIES = new Map<string, string[]>();
for (const country of COUNTRIES) {
  for (const ring of country.rings) {
    for (let index = 0; index < ring.length; index += 1) {
      const start = ring[index];
      const end = ring[(index + 1) % ring.length];
      if (!start || !end || borderPointKey(start) === borderPointKey(end)) continue;
      const key = borderEdgeKey(start, end);
      const owners = BORDER_EDGE_COUNTRIES.get(key) ?? [];
      owners.push(country.id);
      BORDER_EDGE_COUNTRIES.set(key, owners);
    }
  }
}

const COUNTRY_BY_PICK_ID = new Map(PREPARED_COUNTRIES.map((country) => [
  country.pickId,
  country.country.id,
]));

function countryIntersectsWindow(
  country: PreparedCountry,
  window: DetailRenderWindow,
): boolean {
  return country.rings.some((ring) => {
    if (ring.maximumLatitude < window.minimumLatitude
      || ring.minimumLatitude > window.maximumLatitude) return false;
    return [-360, 0, 360].some((shift) => (
      ring.maximumLongitude + shift >= window.minimumLongitude
        && ring.minimumLongitude + shift <= window.maximumLongitude
    ));
  });
}

/**
 * A globe's south pole collapses the full bottom edge of an equirectangular
 * texture into one point. The source outline faithfully doubles back around
 * peninsulas and bays for the flat map, which would self-intersect when that
 * outline is closed against the pole. Build a longitude-ordered outer coast
 * for the globe only, preserving the northernmost coastline in each narrow
 * slice. The canonical flat-map silhouette remains untouched.
 */
const ANTARCTICA_GLOBE_COASTLINE: readonly Coordinate[] = (() => {
  const binWidth = 2;
  const outerCoastByBin = new Map<number, Coordinate>();
  for (const point of ANTARCTICA_COASTLINE) {
    const bin = Math.min(179, Math.max(0, Math.floor((point[0] + 180) / binWidth)));
    const existing = outerCoastByBin.get(bin);
    if (!existing || point[1] > existing[1]) outerCoastByBin.set(bin, point);
  }
  const anchors = [...outerCoastByBin.values()].sort((left, right) => left[0] - right[0]);
  if (anchors[0]?.[0] !== -180) anchors.unshift([-180, -84.71]);
  if (anchors.at(-1)?.[0] !== 180) anchors.push([180, -84.71]);

  const rawLatitudes: number[] = [];
  let anchorIndex = 0;
  for (let longitude = -180; longitude < 180; longitude += 1) {
    while (anchorIndex < anchors.length - 2 && anchors[anchorIndex + 1]![0] < longitude) {
      anchorIndex += 1;
    }
    const start = anchors[anchorIndex]!;
    const end = anchors[anchorIndex + 1]!;
    const progress = Math.max(0, Math.min(1, (longitude - start[0]) / Math.max(0.001, end[0] - start[0])));
    const eased = progress * progress * (3 - 2 * progress);
    rawLatitudes.push(start[1] + (end[1] - start[1]) * eased);
  }

  // Smooth narrow radial spikes introduced by the pole projection while
  // keeping the Peninsula and the major Ross/Weddell Sea sweeps legible.
  let latitudes = rawLatitudes;
  for (let pass = 0; pass < 3; pass += 1) {
    latitudes = latitudes.map((_, index) => {
      let total = 0;
      let weightTotal = 0;
      for (let offset = -4; offset <= 4; offset += 1) {
        const weight = 5 - Math.abs(offset);
        const wrappedIndex = (index + offset + rawLatitudes.length) % rawLatitudes.length;
        total += latitudes[wrappedIndex]! * weight;
        weightTotal += weight;
      }
      return total / weightTotal;
    });
  }

  const coastline: Coordinate[] = latitudes.map((latitude, index) => [
    index - 180,
    Math.max(-79.5, Math.min(-62.5, latitude)),
  ] as const);
  coastline.push([180, coastline[0]![1]]);
  return coastline;
})();

const texturePoint = (
  longitude: number,
  latitude: number,
  width: number,
  height: number,
): readonly [number, number] => [
  ((longitude + 180) / 360) * width,
  ((90 - latitude) / 180) * height,
];

function tracePreparedRing(
  context: CanvasRenderingContext2D,
  ring: PreparedRing,
  longitudeShift: number,
  width: number,
  height: number,
): void {
  ring.points.forEach(([longitude, latitude], index) => {
    const [x, y] = texturePoint(longitude + longitudeShift, latitude, width, height);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
}

function tracePreparedCountry(
  context: CanvasRenderingContext2D,
  country: PreparedCountry,
  width: number,
  height: number,
): void {
  context.beginPath();
  for (const ring of country.rings) {
    for (const shift of [-360, 0, 360]) tracePreparedRing(context, ring, shift, width, height);
  }
}

function traceCountryRealmBorder(
  context: CanvasRenderingContext2D,
  country: PreparedCountry,
  engine: WorldMapEngineContract | undefined,
  width: number,
  height: number,
): void {
  const currentOwnerId = engine?.state.territories[country.country.id]?.ownerId;
  context.beginPath();
  for (const ring of country.rings) {
    for (let index = 0; index < ring.points.length; index += 1) {
      const start = ring.points[index];
      const end = ring.points[(index + 1) % ring.points.length];
      if (!start || !end || borderPointKey(start) === borderPointKey(end)) continue;
      const neighbours = BORDER_EDGE_COUNTRIES.get(borderEdgeKey(start, end)) ?? [];
      const internalRealmEdge = Boolean(currentOwnerId && neighbours.length > 1
        && neighbours.every((territoryId) => (
          engine?.state.territories[territoryId]?.ownerId === currentOwnerId
        )));
      if (internalRealmEdge) continue;
      for (const shift of [-360, 0, 360]) {
        const [startX, startY] = texturePoint(start[0] + shift, start[1], width, height);
        const [endX, endY] = texturePoint(end[0] + shift, end[1], width, height);
        context.moveTo(startX, startY);
        context.lineTo(endX, endY);
      }
    }
  }
}

function traceAntarctica(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  context.beginPath();
  ANTARCTICA_GLOBE_COASTLINE.forEach(([longitude, latitude], index) => {
    const [x, y] = texturePoint(longitude, latitude, width, height);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  const [southEastX, southY] = texturePoint(180, -90, width, height);
  const [southWestX] = texturePoint(-180, -90, width, height);
  context.lineTo(southEastX, southY);
  context.lineTo(southWestX, southY);
  context.closePath();
}

function traceArcticIce(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  context.beginPath();
  ARCTIC_ICE_COASTLINE.forEach(([longitude, latitude], index) => {
    const [x, y] = texturePoint(longitude, latitude, width, height);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  const [northEastX, northY] = texturePoint(180, 90, width, height);
  const [northWestX] = texturePoint(-180, 90, width, height);
  context.lineTo(northEastX, northY);
  context.lineTo(northWestX, northY);
  context.closePath();
}

function drawOceanCurrent(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  points: readonly [number, number, number, number, number, number, number, number],
): void {
  context.beginPath();
  context.moveTo(points[0] * width, points[1] * height);
  context.bezierCurveTo(
    points[2] * width,
    points[3] * height,
    points[4] * width,
    points[5] * height,
    points[6] * width,
    points[7] * height,
  );
  context.stroke();
}

function drawOcean(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const ocean = context.createLinearGradient(0, 0, 0, height);
  ocean.addColorStop(0, '#0a2d46');
  ocean.addColorStop(0.22, '#07314c');
  ocean.addColorStop(0.48, '#05243a');
  ocean.addColorStop(0.72, '#041a2c');
  ocean.addColorStop(1, '#020b16');
  context.fillStyle = ocean;
  context.fillRect(0, 0, width, height);

  const atlanticDepth = context.createRadialGradient(
    width * 0.36, height * 0.51, 0,
    width * 0.36, height * 0.51, width * 0.31,
  );
  atlanticDepth.addColorStop(0, 'rgba(11, 68, 103, 0.30)');
  atlanticDepth.addColorStop(0.58, 'rgba(6, 42, 67, 0.15)');
  atlanticDepth.addColorStop(1, 'rgba(2, 15, 27, 0)');
  context.fillStyle = atlanticDepth;
  context.fillRect(0, 0, width, height);

  const pacificDepth = context.createRadialGradient(
    width * 0.76, height * 0.48, 0,
    width * 0.76, height * 0.48, width * 0.38,
  );
  pacificDepth.addColorStop(0, 'rgba(7, 57, 92, 0.27)');
  pacificDepth.addColorStop(0.62, 'rgba(4, 35, 61, 0.13)');
  pacificDepth.addColorStop(1, 'rgba(1, 12, 24, 0)');
  context.fillStyle = pacificDepth;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = 'rgba(101, 205, 229, 0.036)';
  context.lineWidth = Math.max(0.6, width / 3600);
  for (let longitude = -150; longitude <= 150; longitude += 30) {
    const [x] = texturePoint(longitude, 0, width, height);
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let latitude = -60; latitude <= 60; latitude += 20) {
    const [, y] = texturePoint(0, latitude, width, height);
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  context.save();
  context.strokeStyle = 'rgba(82, 194, 226, 0.038)';
  context.lineWidth = Math.max(2.2, width / 780);
  context.lineCap = 'round';
  drawOceanCurrent(context, width, height, [0.02, 0.34, 0.14, 0.26, 0.27, 0.23, 0.43, 0.31]);
  drawOceanCurrent(context, width, height, [0.51, 0.35, 0.64, 0.24, 0.82, 0.24, 0.98, 0.34]);
  drawOceanCurrent(context, width, height, [0.05, 0.66, 0.17, 0.74, 0.31, 0.76, 0.45, 0.68]);
  drawOceanCurrent(context, width, height, [0.45, 0.65, 0.57, 0.72, 0.70, 0.73, 0.84, 0.65]);
  drawOceanCurrent(context, width, height, [0.00, 0.82, 0.30, 0.79, 0.69, 0.86, 1.00, 0.82]);
  context.restore();
}

function drawArcticIce(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  traceArcticIce(context, width, height);
  const ice = context.createLinearGradient(0, 0, 0, height * 0.18);
  ice.addColorStop(0, '#b9dde2');
  ice.addColorStop(0.48, '#8db8c3');
  ice.addColorStop(1, '#527e8b');
  context.fillStyle = ice;
  context.fill();

  context.save();
  traceArcticIce(context, width, height);
  context.clip();
  context.lineWidth = Math.max(0.7, width / 4200);
  context.strokeStyle = 'rgba(235, 253, 255, 0.18)';
  const iceDepth = height * 0.115;
  for (let x = -width * 0.03; x <= width * 1.03; x += width / 28) {
    context.beginPath();
    for (let step = 0; step <= 8; step += 1) {
      const y = step / 8 * iceDepth;
      const drift = Math.sin(step * 1.37 + x / width * 17) * width * 0.0035;
      if (step === 0) context.moveTo(x + drift, y);
      else context.lineTo(x + drift, y);
    }
    context.stroke();
  }
  context.strokeStyle = 'rgba(30, 83, 99, 0.10)';
  for (let y = height * 0.025; y < iceDepth; y += Math.max(9, height / 125)) {
    context.beginPath();
    context.moveTo(0, y);
    context.bezierCurveTo(width * 0.28, y - 5, width * 0.72, y + 6, width, y - 2);
    context.stroke();
  }
  context.restore();

  traceArcticIce(context, width, height);
  context.strokeStyle = 'rgba(220, 251, 255, 0.76)';
  context.lineWidth = Math.max(1.1, width / 2500);
  context.stroke();
}

function drawAntarctica(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  traceAntarctica(context, width, height);
  const ice = context.createLinearGradient(0, height * 0.84, 0, height);
  ice.addColorStop(0, '#7ca8b7');
  ice.addColorStop(0.36, '#b8d9df');
  ice.addColorStop(1, '#d9f1f4');
  context.fillStyle = ice;
  context.fill();
  context.save();
  traceAntarctica(context, width, height);
  context.clip();
  context.strokeStyle = 'rgba(239, 254, 255, 0.19)';
  context.lineWidth = 2;
  for (let y = height * 0.84; y < height; y += 13) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y + 18);
    context.stroke();
  }
  context.restore();
  traceAntarctica(context, width, height);
  context.strokeStyle = 'rgba(220, 251, 255, 0.94)';
  context.lineWidth = 2.8;
  context.stroke();
}

function drawFlagIntoRing(
  context: CanvasRenderingContext2D,
  ring: PreparedRing,
  image: HTMLImageElement,
  longitudeShift: number,
  width: number,
  height: number,
  alpha: number,
): void {
  const [left, top] = texturePoint(
    ring.minimumLongitude + longitudeShift,
    ring.maximumLatitude,
    width,
    height,
  );
  const [right, bottom] = texturePoint(
    ring.maximumLongitude + longitudeShift,
    ring.minimumLatitude,
    width,
    height,
  );
  const drawWidth = Math.max(1, right - left);
  const drawHeight = Math.max(1, bottom - top);
  context.save();
  context.beginPath();
  tracePreparedRing(context, ring, longitudeShift, width, height);
  context.clip();
  context.globalAlpha = alpha;
  context.filter = 'brightness(1.13) saturate(0.88)';
  context.drawImage(image, left, top, drawWidth, drawHeight);
  context.restore();
}

function stableSelectionSignature(selection: MapSelectionState): string {
  return [
    selection.sourceId ?? '',
    selection.targetId ?? '',
    [...selection.legalTargetIds].sort().join(','),
  ].join('|');
}

/**
 * Dynamic political canvas and immutable colour-picking canvas for the globe.
 * The class only redraws when ownership, integration, humans or legal targets
 * change; weekly simulation snapshots therefore do not upload a new texture.
 */
export class GlobePoliticalTexture {
  readonly canvas: HTMLCanvasElement;
  /**
   * A small camera-local atlas, rendered from the original SVG flags and 50m
   * country vectors. It adds close-up detail without allocating an 8K texture
   * for the entire planet.
   */
  readonly detailCanvas: HTMLCanvasElement;
  private readonly textureWidth: number;
  private readonly textureHeight: number;
  private readonly context: CanvasRenderingContext2D;
  private readonly detailContext: CanvasRenderingContext2D;
  private readonly pickCanvas: HTMLCanvasElement;
  private readonly pickContext: CanvasRenderingContext2D;
  private readonly flagImages = new Map<string, HTMLImageElement>();
  private readonly detailFlagImages = new Map<string, HTMLImageElement>();
  private readonly detailFlagLoads = new Set<string>();
  private snapshot: TextureSnapshot = { selection: { legalTargetIds: [] } };
  private signature = '';
  private selectionSignature = '';
  private redrawTimer?: number;
  private detailView?: GlobeDetailView;

  constructor(
    private readonly onTextureUpdated: () => void,
    private readonly onDetailTextureUpdated: () => void = () => undefined,
  ) {
    const highDetail = window.innerWidth >= HIGH_DETAIL_MIN_VIEWPORT_WIDTH
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(pointer: fine)').matches;
    this.textureWidth = highDetail ? HIGH_DETAIL_GLOBE_TEXTURE_WIDTH : GLOBE_TEXTURE_WIDTH;
    this.textureHeight = highDetail ? HIGH_DETAIL_GLOBE_TEXTURE_HEIGHT : GLOBE_TEXTURE_HEIGHT;

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.textureWidth;
    this.canvas.height = this.textureHeight;
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('The globe political texture could not be created.');
    this.context = context;
    this.context.imageSmoothingEnabled = true;
    this.context.imageSmoothingQuality = 'high';
    this.context.lineJoin = 'round';
    this.context.lineCap = 'round';

    this.detailCanvas = document.createElement('canvas');
    this.detailCanvas.width = DETAIL_TEXTURE_WIDTH;
    this.detailCanvas.height = DETAIL_TEXTURE_HEIGHT;
    const detailContext = this.detailCanvas.getContext('2d', { alpha: true });
    if (!detailContext) throw new Error('The globe detail texture could not be created.');
    this.detailContext = detailContext;
    this.detailContext.imageSmoothingEnabled = true;
    this.detailContext.imageSmoothingQuality = 'high';
    this.detailContext.lineJoin = 'round';
    this.detailContext.lineCap = 'round';

    this.pickCanvas = document.createElement('canvas');
    this.pickCanvas.width = PICK_TEXTURE_WIDTH;
    this.pickCanvas.height = PICK_TEXTURE_HEIGHT;
    const pickContext = this.pickCanvas.getContext('2d', { willReadFrequently: true });
    if (!pickContext) throw new Error('The globe picking texture could not be created.');
    this.pickContext = pickContext;
    this.pickContext.imageSmoothingEnabled = true;
    this.pickContext.imageSmoothingQuality = 'high';
    this.pickContext.lineJoin = 'round';
    this.pickContext.lineCap = 'round';
    this.drawPickTexture();
    this.redraw();
  }

  setDetailView(view?: GlobeDetailView): void {
    if (!view) {
      if (!this.detailView) return;
      this.detailView = undefined;
      this.detailContext.clearRect(0, 0, DETAIL_TEXTURE_WIDTH, DETAIL_TEXTURE_HEIGHT);
      this.onDetailTextureUpdated();
      return;
    }
    this.detailView = {
      longitude: ((view.longitude + 180) % 360 + 360) % 360 - 180,
      latitude: Math.max(-82, Math.min(82, view.latitude)),
      longitudeSpan: Math.max(8, Math.min(120, view.longitudeSpan)),
      latitudeSpan: Math.max(6, Math.min(90, view.latitudeSpan)),
    };
    this.ensureDetailFlags(this.detailView);
    this.redrawDetail();
  }

  sync(engine: WorldMapEngineContract, selection: MapSelectionState): void {
    this.snapshot = { engine, selection };
    const territorySignature = COUNTRIES.map((country) => {
      const territory = engine.state.territories[country.id];
      return territory
        ? `${territory.ownerId}:${territory.coreOwnerId}:${Math.round(territory.integration * 100)}`
        : '';
    }).join(',');
    const humanSignature = [...engine.state.humanPlayerIds].sort().join(',');
    this.selectionSignature = stableSelectionSignature(selection);
    const signature = `${humanSignature}|${territorySignature}|${this.selectionSignature}`;
    if (signature === this.signature) return;
    this.signature = signature;
    this.ensureSnapshotFlags();
    if (this.detailView) this.ensureDetailFlags(this.detailView);
    this.redraw();
  }

  setSelection(selection: MapSelectionState): void {
    this.snapshot = { ...this.snapshot, selection };
    const nextSelection = stableSelectionSignature(selection);
    if (nextSelection === this.selectionSignature) return;
    this.selectionSignature = nextSelection;
    // Full signature is recalculated by the next engine sync; force this
    // presentation-only redraw immediately so target selection feels direct.
    this.signature = '';
    this.redraw();
  }

  pick(uvX: number, uvY: number): GlobePickResult {
    const x = Math.min(PICK_TEXTURE_WIDTH - 1, Math.max(0, Math.floor(uvX * PICK_TEXTURE_WIDTH)));
    const y = Math.min(PICK_TEXTURE_HEIGHT - 1, Math.max(0, Math.floor((1 - uvY) * PICK_TEXTURE_HEIGHT)));
    const pixel = this.pickContext.getImageData(x, y, 1, 1).data;
    const pickId = pixel[0]! + (pixel[1]! << 8) + (pixel[2]! << 16);
    if (pickId === ANTARCTICA_PICK_ID) return { kind: 'antarctica' };
    if (pickId === ARCTIC_PICK_ID) return { kind: 'arctic' };
    const territoryId = COUNTRY_BY_PICK_ID.get(pickId);
    return territoryId ? { kind: 'country', territoryId } : undefined;
  }

  private drawPickTexture(): void {
    this.pickContext.clearRect(0, 0, PICK_TEXTURE_WIDTH, PICK_TEXTURE_HEIGHT);
    // The Arctic is sea ice rather than a country. Paint its neutral pick layer
    // first so northern land polygons retain their normal country hit targets.
    traceArcticIce(this.pickContext, PICK_TEXTURE_WIDTH, PICK_TEXTURE_HEIGHT);
    this.pickContext.fillStyle = 'rgb(254, 255, 255)';
    this.pickContext.fill();
    for (const country of PREPARED_COUNTRIES) {
      tracePreparedCountry(this.pickContext, country, PICK_TEXTURE_WIDTH, PICK_TEXTURE_HEIGHT);
      const pickId = country.pickId;
      this.pickContext.fillStyle = `rgb(${pickId & 0xff}, ${(pickId >> 8) & 0xff}, ${(pickId >> 16) & 0xff})`;
      this.pickContext.fill('evenodd');
    }
    traceAntarctica(this.pickContext, PICK_TEXTURE_WIDTH, PICK_TEXTURE_HEIGHT);
    this.pickContext.fillStyle = 'rgb(255, 255, 255)';
    this.pickContext.fill();
  }

  private ensureSnapshotFlags(): void {
    const engine = this.snapshot.engine;
    if (!engine) return;
    const nationIds = new Set<string>();
    for (const country of COUNTRIES) {
      const territory = engine.state.territories[country.id];
      if (!territory) continue;
      nationIds.add(territory.ownerId);
      if (territory.coreOwnerId !== territory.ownerId) nationIds.add(territory.coreOwnerId);
    }
    for (const nationId of nationIds) this.loadFlag(nationId);
  }

  private loadFlag(nationId: string): void {
    if (this.flagImages.has(nationId)) return;
    const url = countryFlagAssetUrl(nationId);
    if (!url) return;
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => this.queueRedraw();
    image.src = url;
    this.flagImages.set(nationId, image);
  }

  private ensureDetailFlags(view: GlobeDetailView): void {
    const engine = this.snapshot.engine;
    if (!engine) return;
    const window: DetailRenderWindow = {
      minimumLongitude: view.longitude - view.longitudeSpan / 2,
      maximumLongitude: view.longitude + view.longitudeSpan / 2,
      minimumLatitude: view.latitude - view.latitudeSpan / 2,
      maximumLatitude: view.latitude + view.latitudeSpan / 2,
    };
    const nationIds = new Set<string>();
    for (const prepared of PREPARED_COUNTRIES) {
      if (!countryIntersectsWindow(prepared, window)) continue;
      const territory = engine.state.territories[prepared.country.id];
      if (!territory) continue;
      nationIds.add(territory.ownerId);
      if (territory.coreOwnerId !== territory.ownerId) nationIds.add(territory.coreOwnerId);
    }
    for (const nationId of nationIds) {
      const cached = this.detailFlagImages.get(nationId);
      if (cached) {
        // Map insertion order doubles as a tiny LRU, keeping repeated regional
        // exploration hot without retaining high-resolution flags worldwide.
        this.detailFlagImages.delete(nationId);
        this.detailFlagImages.set(nationId, cached);
      } else this.loadDetailFlag(nationId);
    }
  }

  private loadDetailFlag(nationId: string): void {
    if (this.detailFlagLoads.has(nationId) || this.detailFlagImages.has(nationId)) return;
    const url = countryFlagAssetUrl(nationId);
    if (!url) return;
    this.detailFlagLoads.add(nationId);
    void fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`Flag request failed with ${response.status}.`);
        return response.text();
      })
      .then((source) => new Promise<HTMLImageElement>((resolve, reject) => {
        const sizedSource = source.replace(
          /<svg\b/,
          `<svg width="${DETAIL_FLAG_WIDTH}" height="${DETAIL_FLAG_HEIGHT}"`,
        );
        const objectUrl = URL.createObjectURL(new Blob([sizedSource], { type: 'image/svg+xml' }));
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => {
          URL.revokeObjectURL(objectUrl);
          resolve(image);
        };
        image.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error(`High-resolution flag decode failed for ${nationId}.`));
        };
        image.src = objectUrl;
      }))
      .then((image) => {
        while (this.detailFlagImages.size >= DETAIL_FLAG_CACHE_LIMIT) {
          const oldest = this.detailFlagImages.keys().next().value as string | undefined;
          if (!oldest) break;
          this.detailFlagImages.delete(oldest);
        }
        this.detailFlagImages.set(nationId, image);
        if (this.detailView) this.redrawDetail();
      })
      .catch(() => undefined)
      .finally(() => this.detailFlagLoads.delete(nationId));
  }

  private queueRedraw(): void {
    if (this.redrawTimer !== undefined) return;
    // Flags arrive in a burst. Batch their decodes so a 3K political texture
    // is not rebuilt once per SVG during the opening screen.
    this.redrawTimer = window.setTimeout(() => {
      this.redrawTimer = undefined;
      this.redraw();
    }, 90);
  }

  private drawCountries(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    renderWindow?: DetailRenderWindow,
    useDetailFlags = false,
  ): void {
    const { engine, selection } = this.snapshot;
    const legalTargets = new Set(selection.legalTargetIds);
    const legalMode = legalTargets.size > 0;

    for (const prepared of PREPARED_COUNTRIES) {
      if (renderWindow && !countryIntersectsWindow(prepared, renderWindow)) continue;
      const country = prepared.country;
      const territory = engine?.state.territories[country.id];
      const owner = territory ? engine?.player(territory.ownerId) : undefined;
      const terrainProfile = terrainProfileForTerritory(country.id);
      const terrainLayers = terrainTextureLayerPresentation(terrainProfile);
      const regionalFill = COUNTRY_BY_ID[country.id]?.regionId === 'heartlands'
        ? 0x466071 : 0x294959;
      const ownerColor = owner?.color ?? regionalFill;
      const politicalFill = colorMix(regionalFill, ownerColor, owner ? 0.30 : 0.08);
      const selected = selection.sourceId === country.id || selection.targetId === country.id;
      const legal = legalTargets.has(country.id);
      const dimmed = legalMode && !selected && !legal;
      const integrating = Boolean(territory
        && territory.coreOwnerId !== territory.ownerId
        && territory.integration < 0.999999);

      tracePreparedCountry(context, prepared, width, height);
      context.fillStyle = colorCss(politicalFill);
      context.globalAlpha = dimmed ? 0.42 : 1;
      context.fill('evenodd');
      context.globalAlpha = 1;

      const flag = territory
        ? (useDetailFlags ? this.detailFlagImages.get(territory.ownerId) : undefined)
          ?? this.flagImages.get(territory.ownerId)
        : undefined;
      if (flag?.complete && flag.naturalWidth > 0) {
        const flagAlpha = dimmed ? 0.20 : owner?.isHuman ? 0.72 : 0.47;
        for (const ring of prepared.rings) {
          for (const shift of [-360, 0, 360]) {
            drawFlagIntoRing(
              context,
              ring,
              flag,
              shift,
              width,
              height,
              flagAlpha,
            );
          }
        }
      }

      if (territory && integrating) {
        const coreFlag = (useDetailFlags ? this.detailFlagImages.get(territory.coreOwnerId) : undefined)
          ?? this.flagImages.get(territory.coreOwnerId);
        if (coreFlag?.complete && coreFlag.naturalWidth > 0) {
          const alpha = 0.50 * Math.max(0, 1 - territory.integration);
          for (const ring of prepared.rings) {
            for (const shift of [-360, 0, 360]) {
              drawFlagIntoRing(
                context,
                ring,
                coreFlag,
                shift,
                width,
                height,
                alpha,
              );
            }
          }
        }
      }

      drawDominantTerrainTint(
        context,
        prepared,
        terrainLayers,
        width,
        height,
        dimmed,
      );

      if (integrating || selected || legal) {
        tracePreparedCountry(context, prepared, width, height);
      } else {
        traceCountryRealmBorder(
          context,
          prepared,
          engine,
          width,
          height,
        );
      }
      const hasGameplayBorder = integrating || selected || legal;
      context.strokeStyle = integrating ? 'rgba(244, 201, 106, 0.96)'
        : selected ? 'rgba(255, 226, 145, 1)'
          : legal ? 'rgba(108, 239, 221, 0.96)'
            : colorCss(terrainLayers.borderColor);
      context.globalAlpha = dimmed ? 0.34
        : hasGameplayBorder ? 0.88
          : terrainLayers.borderAlpha;
      context.lineWidth = integrating || selected ? 3.4 : legal ? 2.8 : owner?.isHuman ? 2.2 : 1.25;
      context.stroke();
      context.globalAlpha = 1;
    }
  }

  private redrawDetail(): void {
    const view = this.detailView;
    this.detailContext.clearRect(0, 0, DETAIL_TEXTURE_WIDTH, DETAIL_TEXTURE_HEIGHT);
    if (!view) {
      this.onDetailTextureUpdated();
      return;
    }

    const window: DetailRenderWindow = {
      minimumLongitude: view.longitude - view.longitudeSpan / 2,
      maximumLongitude: view.longitude + view.longitudeSpan / 2,
      minimumLatitude: view.latitude - view.latitudeSpan / 2,
      maximumLatitude: view.latitude + view.latitudeSpan / 2,
    };
    const virtualWidth = DETAIL_TEXTURE_WIDTH * 360 / view.longitudeSpan;
    const virtualHeight = DETAIL_TEXTURE_HEIGHT * 180 / view.latitudeSpan;
    const translateX = -((window.minimumLongitude + 180) / 360) * virtualWidth;
    const translateY = -((90 - window.maximumLatitude) / 180) * virtualHeight;

    this.detailContext.save();
    // Transparent padding plus the shader edge feather prevents a hard atlas
    // seam while the camera moves inside the cached high-detail window.
    this.detailContext.beginPath();
    this.detailContext.rect(3, 3, DETAIL_TEXTURE_WIDTH - 6, DETAIL_TEXTURE_HEIGHT - 6);
    this.detailContext.clip();
    this.detailContext.translate(translateX, translateY);
    this.drawCountries(this.detailContext, virtualWidth, virtualHeight, window, true);
    this.detailContext.restore();
    this.onDetailTextureUpdated();
  }

  private redraw(): void {
    drawOcean(this.context, this.textureWidth, this.textureHeight);
    // Ice occupies the ocean beneath the canonical country layer, ensuring
    // Greenland, Canada, Russia, Norway and the other high-Arctic lands win.
    drawArcticIce(this.context, this.textureWidth, this.textureHeight);
    this.drawCountries(this.context, this.textureWidth, this.textureHeight);

    drawAntarctica(this.context, this.textureWidth, this.textureHeight);
    this.onTextureUpdated();
    if (this.detailView) this.redrawDetail();
  }
}
