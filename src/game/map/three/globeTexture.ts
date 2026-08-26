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
// Desktop uses one fixed, higher-resolution atlas from lobby through maximum
// zoom. This improves small-country coastlines without introducing a separate
// close-zoom texture, redraw path or additional globe pass.
const HIGH_DETAIL_GLOBE_TEXTURE_WIDTH = 7168;
const HIGH_DETAIL_GLOBE_TEXTURE_HEIGHT = 3584;
const HIGH_DETAIL_MIN_VIEWPORT_WIDTH = 900;
const PICK_TEXTURE_WIDTH = 2048;
const PICK_TEXTURE_HEIGHT = 1024;
const ANTARCTICA_PICK_ID = 0xff_ff_ff;
const ARCTIC_PICK_ID = 0xff_ff_fe;
const COUNTRY_PICK_COLOR_STEP = 0x9e_37_79;

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
  longitudeShifts: readonly number[];
  visualArea: number;
}

interface PreparedCountry {
  country: CountryRecord;
  rings: readonly PreparedRing[];
  flagRings: readonly PreparedRing[];
  iceRings: readonly PreparedRing[];
  pickId: number;
  terrainLayers: TerrainTextureLayerPresentation;
}

interface TextureSnapshot {
  engine?: WorldMapEngineContract;
  selection: MapSelectionState;
}

export type GlobeFlagRingPolicy = 'all-non-ice' | 'principal-only';

export function globeFlagRingPolicy(countryId: string): GlobeFlagRingPolicy {
  return countryId === 'fra' || countryId === 'prt' || countryId === 'nld' || countryId === 'chl'
    ? 'principal-only'
    : 'all-non-ice';
}

export interface GlobeFlagTerritoryState {
  readonly ownerId: string;
  readonly coreOwnerId: string;
  readonly integration: number;
}

export function globeTerritoryIsIntegrating(territory: GlobeFlagTerritoryState): boolean {
  return territory.coreOwnerId !== territory.ownerId && territory.integration < 1;
}

export function globeTerritoryFlagOwnerId(territory: GlobeFlagTerritoryState): string {
  return globeTerritoryIsIntegrating(territory) ? territory.coreOwnerId : territory.ownerId;
}

export function globeFlagProjectionKey(
  territoryId: string,
  territory: GlobeFlagTerritoryState,
): string {
  return globeTerritoryIsIntegrating(territory)
    ? `integrating:${territoryId}`
    : `realm:${territory.ownerId}`;
}

/**
 * Widely spaced exact colours keep antialiased border pixels from decoding as
 * a completely unrelated country. The odd multiplier permutes 24-bit colour
 * space, so every practical country index receives a unique pick code.
 */
export function globeCountryPickId(index: number): number {
  const pickId = (((Math.max(0, Math.floor(index)) + 1) * COUNTRY_PICK_COLOR_STEP) >>> 0)
    & 0xff_ff_ff;
  if (pickId === 0 || pickId === ANTARCTICA_PICK_ID || pickId === ARCTIC_PICK_ID) {
    return pickId ^ 0x00_ff_00;
  }
  return pickId;
}

const colorCss = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

function colorMix(left: number, right: number, amount: number): number {
  const red = ((left >> 16) & 0xff) * (1 - amount) + ((right >> 16) & 0xff) * amount;
  const green = ((left >> 8) & 0xff) * (1 - amount) + ((right >> 8) & 0xff) * amount;
  const blue = (left & 0xff) * (1 - amount) + (right & 0xff) * amount;
  return (Math.round(red) << 16) | (Math.round(green) << 8) | Math.round(blue);
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
  const minimumLongitude = Math.min(...points.map(([longitude]) => longitude));
  const maximumLongitude = Math.max(...points.map(([longitude]) => longitude));
  const minimumLatitude = Math.min(...points.map(([, latitude]) => latitude));
  const maximumLatitude = Math.max(...points.map(([, latitude]) => latitude));
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

function pointInPreparedRing(
  longitude: number,
  latitude: number,
  ring: PreparedRing,
  longitudeShift: number,
): boolean {
  if (longitude < ring.minimumLongitude + longitudeShift
    || longitude > ring.maximumLongitude + longitudeShift
    || latitude < ring.minimumLatitude
    || latitude > ring.maximumLatitude) return false;
  let inside = false;
  for (let index = 0, previous = ring.points.length - 1; index < ring.points.length; previous = index, index += 1) {
    const currentPoint = ring.points[index]!;
    const previousPoint = ring.points[previous]!;
    const currentX = currentPoint[0] + longitudeShift;
    const previousX = previousPoint[0] + longitudeShift;
    const currentY = currentPoint[1];
    const previousY = previousPoint[1];
    const crossesLatitude = (currentY > latitude) !== (previousY > latitude);
    if (crossesLatitude
      && longitude < ((previousX - currentX) * (latitude - currentY))
        / (previousY - currentY) + currentX) inside = !inside;
  }
  return inside;
}

function preparedCountryContains(
  country: PreparedCountry,
  longitude: number,
  latitude: number,
): boolean {
  let inside = false;
  for (const ring of country.rings) {
    for (const shift of ring.longitudeShifts) {
      if (pointInPreparedRing(longitude, latitude, ring, shift)) inside = !inside;
    }
  }
  return inside;
}

const PREPARED_COUNTRIES: readonly PreparedCountry[] = COUNTRIES.map((country, index) => {
  const rings = country.rings.flatMap((ring) => {
    const prepared = prepareRing(ring);
    return prepared ? [prepared] : [];
  });
  const byImportance = [...rings].sort((left, right) => right.visualArea - left.visualArea);
  const principalRing = byImportance[0];
  const iceRings = rings.filter((ring) => (
    ring !== principalRing && ring.maximumLatitude >= 72
  ));
  const iceRingSet = new Set(iceRings);
  const flagRings = globeFlagRingPolicy(country.id) === 'principal-only'
    ? principalRing ? [principalRing] : []
    : rings.filter((ring) => !iceRingSet.has(ring));
  return {
    country,
    rings,
    flagRings,
    iceRings,
    pickId: globeCountryPickId(index),
    terrainLayers: terrainTextureLayerPresentation(terrainProfileForTerritory(country.id)),
  };
});

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
  country,
]));

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
  tracePreparedRings(context, country.rings, width, height);
}

function tracePreparedRings(
  context: CanvasRenderingContext2D,
  rings: readonly PreparedRing[],
  width: number,
  height: number,
): void {
  context.beginPath();
  for (const ring of rings) {
    for (const shift of ring.longitudeShifts) tracePreparedRing(context, ring, shift, width, height);
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
    for (const shift of ring.longitudeShifts) {
      let tracingVisibleRun = false;
      for (let index = 0; index < ring.points.length; index += 1) {
        const start = ring.points[index];
        const end = ring.points[(index + 1) % ring.points.length];
        if (!start || !end || borderPointKey(start) === borderPointKey(end)) continue;
        const neighbours = BORDER_EDGE_COUNTRIES.get(borderEdgeKey(start, end)) ?? [];
        const internalRealmEdge = Boolean(currentOwnerId && neighbours.length > 1
          && neighbours.every((territoryId) => (
            engine?.state.territories[territoryId]?.ownerId === currentOwnerId
          )));
        if (internalRealmEdge) {
          tracingVisibleRun = false;
          continue;
        }
        const [startX, startY] = texturePoint(start[0] + shift, start[1], width, height);
        const [endX, endY] = texturePoint(end[0] + shift, end[1], width, height);
        // Keep consecutive Natural Earth edges in one canvas subpath. Drawing
        // every source segment as a separate round-capped line made close-up
        // borders look like a soft chain of overlapping dots even though the
        // underlying 1:50m geometry was already detailed enough.
        if (!tracingVisibleRun) context.moveTo(startX, startY);
        context.lineTo(endX, endY);
        tracingVisibleRun = true;
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

interface PreparedTextureBounds {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

function preparedRingsTextureBounds(
  rings: readonly PreparedRing[],
  width: number,
  height: number,
): PreparedTextureBounds | undefined {
  let left = width;
  let right = 0;
  let top = height;
  let bottom = 0;
  let hasVisibleRing = false;

  for (const ring of rings) {
    for (const shift of ring.longitudeShifts) {
      const [ringLeft, ringTop] = texturePoint(
        ring.minimumLongitude + shift,
        ring.maximumLatitude,
        width,
        height,
      );
      const [ringRight, ringBottom] = texturePoint(
        ring.maximumLongitude + shift,
        ring.minimumLatitude,
        width,
        height,
      );
      const visibleLeft = Math.max(0, ringLeft);
      const visibleRight = Math.min(width, ringRight);
      if (visibleRight <= visibleLeft || ringBottom <= 0 || ringTop >= height) continue;
      left = Math.min(left, visibleLeft);
      right = Math.max(right, visibleRight);
      top = Math.min(top, Math.max(0, ringTop));
      bottom = Math.max(bottom, Math.min(height, ringBottom));
      hasVisibleRing = true;
    }
  }
  return hasVisibleRing ? { left, right, top, bottom } : undefined;
}

function drawFlagIntoProjection(
  context: CanvasRenderingContext2D,
  rings: readonly PreparedRing[],
  image: HTMLImageElement,
  width: number,
  height: number,
  alpha: number,
): void {
  const bounds = preparedRingsTextureBounds(rings, width, height);
  if (!bounds) return;

  // Snap the single destination rectangle outwards to whole atlas pixels. The
  // source remains the original SVG and high-quality interpolation stays on,
  // but fractional destination edges no longer soften the complete flag.
  const drawLeft = Math.floor(bounds.left);
  const drawTop = Math.floor(bounds.top);
  const drawRight = Math.ceil(bounds.right);
  const drawBottom = Math.ceil(bounds.bottom);

  context.save();
  context.beginPath();
  for (const ring of rings) {
    for (const shift of ring.longitudeShifts) {
      tracePreparedRing(context, ring, shift, width, height);
    }
  }
  context.clip('evenodd');
  context.globalAlpha = alpha;
  context.drawImage(
    image,
    drawLeft,
    drawTop,
    Math.max(1, drawRight - drawLeft),
    Math.max(1, drawBottom - drawTop),
  );
  context.restore();
}

function drawIntegrationOverlay(
  context: CanvasRenderingContext2D,
  rings: readonly PreparedRing[],
  width: number,
  height: number,
): void {
  const bounds = preparedRingsTextureBounds(rings, width, height);
  if (!bounds) return;

  context.save();
  tracePreparedRings(context, rings, width, height);
  context.clip('evenodd');

  const fade = context.createLinearGradient(bounds.left, bounds.top, bounds.right, bounds.bottom);
  fade.addColorStop(0, 'rgba(255, 226, 154, 0.19)');
  fade.addColorStop(0.55, 'rgba(244, 201, 106, 0.07)');
  fade.addColorStop(1, 'rgba(219, 163, 65, 0.16)');
  context.fillStyle = fade;
  context.fillRect(
    bounds.left,
    bounds.top,
    Math.max(1, bounds.right - bounds.left),
    Math.max(1, bounds.bottom - bounds.top),
  );

  const diagonalSpan = Math.max(1, bounds.bottom - bounds.top);
  const spacing = Math.max(8, width / 520);
  context.beginPath();
  for (let x = bounds.left - diagonalSpan; x <= bounds.right; x += spacing) {
    context.moveTo(x, bounds.bottom);
    context.lineTo(x + diagonalSpan, bounds.top);
  }
  context.strokeStyle = 'rgba(255, 225, 150, 0.26)';
  context.lineWidth = Math.max(0.55, width / 9600);
  context.stroke();
  context.restore();
}

export function globeTextureSelectionSignature(selection: MapSelectionState): string {
  return [
    selection.sourceId ?? '',
    selection.targetId ?? '',
    [...selection.legalTargetIds].sort().join(','),
  ].join('|');
}

export function globePoliticalStateSignature(engine: WorldMapEngineContract): string {
  const territorySignature = COUNTRIES.map((country) => {
    const territory = engine.state.territories[country.id];
    return territory
      ? `${territory.ownerId}:${territory.coreOwnerId}:${globeTerritoryIsIntegrating(territory) ? 'integrating' : 'core'}`
      : '';
  }).join(',');
  const humanSignature = [...engine.state.humanPlayerIds].sort().join(',');
  return `${humanSignature}|${territorySignature}`;
}

export interface GlobePoliticalPaintState {
  readonly ownerId: string;
  readonly coreOwnerId: string;
  readonly integrating: boolean;
  readonly flagOwnerId: string;
}

export interface GlobePoliticalPaintSnapshot {
  readonly humanSignature: string;
  readonly territories: Readonly<Record<string, GlobePoliticalPaintState>>;
}

export type GlobePoliticalAtlasUpdate =
  | { readonly kind: 'none' }
  | { readonly kind: 'full' }
  | { readonly kind: 'capture'; readonly territoryIds: readonly string[] };

export function captureGlobePoliticalPaintSnapshot(
  engine: WorldMapEngineContract,
): GlobePoliticalPaintSnapshot {
  const territories: Record<string, GlobePoliticalPaintState> = {};
  for (const country of COUNTRIES) {
    const territory = engine.state.territories[country.id];
    if (!territory) continue;
    territories[country.id] = {
      ownerId: territory.ownerId,
      coreOwnerId: territory.coreOwnerId,
      integrating: globeTerritoryIsIntegrating(territory),
      flagOwnerId: globeTerritoryFlagOwnerId(territory),
    };
  }
  return {
    humanSignature: [...engine.state.humanPlayerIds].sort().join(','),
    territories,
  };
}

/**
 * Only a fresh conquest can be repainted as one isolated territory. Realm
 * merges, integration completion, revolutions and human-seat changes can alter
 * shared projections or borders elsewhere and therefore retain the safe full
 * atlas path.
 */
export function classifyGlobePoliticalAtlasUpdate(
  previous: GlobePoliticalPaintSnapshot | undefined,
  next: GlobePoliticalPaintSnapshot,
): GlobePoliticalAtlasUpdate {
  if (!previous || previous.humanSignature !== next.humanSignature) return { kind: 'full' };
  const beforeIds = Object.keys(previous.territories);
  const afterIds = Object.keys(next.territories);
  if (beforeIds.length !== afterIds.length
    || beforeIds.some((territoryId) => !(territoryId in next.territories))) {
    return { kind: 'full' };
  }

  const capturedTerritoryIds: string[] = [];
  for (const territoryId of afterIds) {
    const before = previous.territories[territoryId];
    const after = next.territories[territoryId];
    if (!before || !after) return { kind: 'full' };
    if (before.ownerId === after.ownerId
      && before.coreOwnerId === after.coreOwnerId
      && before.integrating === after.integrating
      && before.flagOwnerId === after.flagOwnerId) continue;

    const isIsolatedCapture = before.ownerId === before.coreOwnerId
      && !before.integrating
      && after.ownerId !== after.coreOwnerId
      && after.integrating
      && after.coreOwnerId === before.coreOwnerId
      && before.flagOwnerId === before.coreOwnerId
      && after.flagOwnerId === after.coreOwnerId;
    if (!isIsolatedCapture) return { kind: 'full' };
    capturedTerritoryIds.push(territoryId);
  }

  return capturedTerritoryIds.length > 0
    ? { kind: 'capture', territoryIds: capturedTerritoryIds }
    : { kind: 'none' };
}

/**
 * Dynamic political canvas and immutable colour-picking canvas for the globe.
 * The class only redraws when ownership, integration lifecycle or human-player
 * state changes; weekly simulation and UI-selection snapshots do not upload it.
 */
export class GlobePoliticalTexture {
  readonly canvas: HTMLCanvasElement;
  private readonly textureWidth: number;
  private readonly textureHeight: number;
  private readonly context: CanvasRenderingContext2D;
  private readonly pickCanvas: HTMLCanvasElement;
  private readonly pickContext: CanvasRenderingContext2D;
  private pickPixels = new Uint8ClampedArray();
  private readonly flagImages = new Map<string, HTMLImageElement>();
  private readonly pendingFlagLoads = new Set<string>();
  private mapReadyPromise: Promise<void> = Promise.resolve();
  private resolveMapReady?: () => void;
  private snapshot: TextureSnapshot = { selection: { legalTargetIds: [] } };
  private politicalSignature = '';
  private paintedPoliticalState?: GlobePoliticalPaintSnapshot;
  private redrawTimer?: number;

  constructor(
    private readonly onTextureUpdated: () => void,
    maximumTextureSize = HIGH_DETAIL_GLOBE_TEXTURE_WIDTH,
  ) {
    const highDetail = window.innerWidth >= HIGH_DETAIL_MIN_VIEWPORT_WIDTH
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(pointer: fine)').matches;
    const preferredWidth = highDetail
      ? HIGH_DETAIL_GLOBE_TEXTURE_WIDTH
      : GLOBE_TEXTURE_WIDTH;
    const preferredHeight = highDetail
      ? HIGH_DETAIL_GLOBE_TEXTURE_HEIGHT
      : GLOBE_TEXTURE_HEIGHT;
    // Select one immutable atlas at construction time and keep it for every
    // zoom level. Respecting the actual GPU cap here also prevents Three.js
    // from silently resizing the canvas during upload, which would otherwise
    // soften the political texture a second time.
    this.textureWidth = Math.max(
      1024,
      Math.min(preferredWidth, Math.floor(maximumTextureSize / 2) * 2),
    );
    this.textureHeight = Math.min(
      preferredHeight,
      Math.floor(this.textureWidth / 2),
    );

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

  sync(engine: WorldMapEngineContract, selection: MapSelectionState): void {
    this.snapshot = { engine, selection };
    const nextPoliticalSignature = globePoliticalStateSignature(engine);
    const politicalChanged = nextPoliticalSignature !== this.politicalSignature;
    if (!politicalChanged) return;
    this.politicalSignature = nextPoliticalSignature;
    this.ensureSnapshotFlags();
    const nextPoliticalState = captureGlobePoliticalPaintSnapshot(engine);
    const update = classifyGlobePoliticalAtlasUpdate(
      this.paintedPoliticalState,
      nextPoliticalState,
    );
    if (update.kind === 'none') {
      this.paintedPoliticalState = nextPoliticalState;
      return;
    }
    if (update.kind === 'capture'
      && this.redrawTimer === undefined
      && this.pendingFlagLoads.size === 0
      && this.drawCapturedTerritories(update.territoryIds)) {
      this.onTextureUpdated();
      this.paintedPoliticalState = nextPoliticalState;
      return;
    }
    // Preserve the immediate first map paint for the loading screen. Later
    // complex political changes are batched so the outcome modal can paint
    // before the expensive safe fallback upload.
    if (!this.paintedPoliticalState) this.redraw();
    else this.queueRedraw();
  }

  /** Resolves after every relevant flag has settled and its final batch was baked. */
  waitForReady(): Promise<void> {
    return this.mapReadyPromise;
  }

  setSelection(selection: MapSelectionState): void {
    this.snapshot = { ...this.snapshot, selection };
  }

  pick(uvX: number, uvY: number): GlobePickResult {
    const x = Math.min(PICK_TEXTURE_WIDTH - 1, Math.max(0, Math.floor(uvX * PICK_TEXTURE_WIDTH)));
    const y = Math.min(PICK_TEXTURE_HEIGHT - 1, Math.max(0, Math.floor((1 - uvY) * PICK_TEXTURE_HEIGHT)));
    const pixelOffset = (y * PICK_TEXTURE_WIDTH + x) * 4;
    if (this.pickPixels[pixelOffset + 3]! < 250) return undefined;
    const pickId = this.pickPixels[pixelOffset]!
      + (this.pickPixels[pixelOffset + 1]! << 8)
      + (this.pickPixels[pixelOffset + 2]! << 16);
    if (pickId === ANTARCTICA_PICK_ID) return { kind: 'antarctica' };
    if (pickId === ARCTIC_PICK_ID) return { kind: 'arctic' };
    const country = COUNTRY_BY_PICK_ID.get(pickId);
    if (!country) return undefined;
    const longitude = uvX * 360 - 180;
    const latitude = uvY * 180 - 90;
    return preparedCountryContains(country, longitude, latitude)
      ? { kind: 'country', territoryId: country.country.id }
      : undefined;
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
    // Country geometry never changes. Reading the complete pick map once avoids
    // a synchronous canvas readback on every pointer movement over the globe.
    this.pickPixels = new Uint8ClampedArray(this.pickContext.getImageData(
      0,
      0,
      PICK_TEXTURE_WIDTH,
      PICK_TEXTURE_HEIGHT,
    ).data);
    this.pickCanvas.width = 1;
    this.pickCanvas.height = 1;
  }

  private ensureSnapshotFlags(): void {
    const engine = this.snapshot.engine;
    if (!engine) return;
    const nationIds = new Set<string>();
    for (const country of COUNTRIES) {
      const territory = engine.state.territories[country.id];
      if (!territory) continue;
      nationIds.add(globeTerritoryFlagOwnerId(territory));
      // Preload the conquering owner's flag while integration is ongoing so
      // the lifecycle-completion redraw can switch flags without a blank frame.
      nationIds.add(territory.ownerId);
    }
    for (const nationId of nationIds) this.loadFlag(nationId);
  }

  private loadFlag(nationId: string): void {
    if (this.flagImages.has(nationId)) return;
    const url = countryFlagAssetUrl(nationId);
    if (!url) return;
    this.markMapReadinessPending();
    this.pendingFlagLoads.add(nationId);
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => this.finishFlagLoad(nationId);
    image.onerror = () => this.finishFlagLoad(nationId);
    image.src = url;
    this.flagImages.set(nationId, image);
  }

  private markMapReadinessPending(): void {
    if (this.resolveMapReady) return;
    this.mapReadyPromise = new Promise<void>((resolve) => {
      this.resolveMapReady = resolve;
    });
  }

  private finishFlagLoad(nationId: string): void {
    if (!this.pendingFlagLoads.delete(nationId)) return;
    // Success and failure are both settled states. The final redraw either
    // includes the decoded flag or deliberately preserves the fallback fill.
    if (this.pendingFlagLoads.size === 0) this.queueRedraw();
  }

  private resolveMapReadinessAfterBatch(): void {
    if (this.pendingFlagLoads.size > 0 || this.redrawTimer !== undefined) return;
    const resolve = this.resolveMapReady;
    if (!resolve) return;
    this.resolveMapReady = undefined;
    resolve();
  }

  private queueRedraw(): void {
    if (this.redrawTimer !== undefined) return;
    // Flags arrive in a burst. Batch their decodes so the political texture
    // is not rebuilt once per SVG during the opening screen.
    this.redrawTimer = window.setTimeout(() => {
      this.redrawTimer = undefined;
      // A political sync can discover another relevant flag during this short
      // debounce. Its completion will schedule the one final atlas batch.
      if (this.pendingFlagLoads.size > 0) return;
      try {
        this.redraw();
      } finally {
        this.resolveMapReadinessAfterBatch();
      }
    }, 90);
  }

  /** Repaints only newly captured polygons; all shared-realm changes use redraw(). */
  private drawCapturedTerritories(territoryIds: readonly string[]): boolean {
    const { engine } = this.snapshot;
    if (!engine) return false;
    const preparedTerritories: PreparedCountry[] = [];
    for (const territoryId of territoryIds) {
      const prepared = PREPARED_COUNTRIES.find(
        (candidate) => candidate.country.id === territoryId,
      );
      const territory = engine.state.territories[territoryId];
      if (!prepared || !territory || !globeTerritoryIsIntegrating(territory)) return false;
      const flag = this.flagImages.get(globeTerritoryFlagOwnerId(territory));
      if (!flag?.complete || flag.naturalWidth <= 0) return false;
      preparedTerritories.push(prepared);
    }

    const context = this.context;
    const width = this.textureWidth;
    const height = this.textureHeight;
    for (const prepared of preparedTerritories) {
      const country = prepared.country;
      const territory = engine.state.territories[country.id]!;
      const owner = engine.player(territory.ownerId);
      const terrainLayers = prepared.terrainLayers;
      const regionalFill = COUNTRY_BY_ID[country.id]?.regionId === 'heartlands'
        ? 0x466071 : 0x294959;
      const ownerColor = owner?.color ?? regionalFill;
      const politicalBase = colorMix(regionalFill, ownerColor, owner ? 0.30 : 0.08);
      const politicalFill = colorMix(
        politicalBase,
        terrainLayers.tintColor,
        terrainLayers.tintAlpha,
      );

      context.globalAlpha = 1;
      tracePreparedCountry(context, prepared, width, height);
      context.fillStyle = colorCss(politicalFill);
      context.fill('evenodd');

      const flagOwnerId = globeTerritoryFlagOwnerId(territory);
      const flag = this.flagImages.get(flagOwnerId)!;
      const flagOwner = engine.player(flagOwnerId);
      drawFlagIntoProjection(
        context,
        prepared.flagRings,
        flag,
        width,
        height,
        flagOwner?.isHuman ? 1 : 0.97,
      );

      context.save();
      tracePreparedRings(context, prepared.flagRings, width, height);
      context.fillStyle = colorCss(terrainLayers.tintColor);
      context.globalAlpha = terrainLayers.flagTintAlpha;
      context.fill('evenodd');
      context.restore();
      drawIntegrationOverlay(context, prepared.flagRings, width, height);

      context.fillStyle = 'rgba(218, 239, 242, 0.96)';
      for (const ring of prepared.iceRings) {
        for (const shift of ring.longitudeShifts) {
          context.beginPath();
          tracePreparedRing(context, ring, shift, width, height);
          context.fill();
        }
      }

      tracePreparedCountry(context, prepared, width, height);
      context.strokeStyle = 'rgba(244, 201, 106, 0.96)';
      context.globalAlpha = 0.94;
      context.lineWidth = 1.7 * (width / GLOBE_TEXTURE_WIDTH);
      context.stroke();
      context.globalAlpha = 1;
    }
    return true;
  }

  private drawCountries(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): void {
    const { engine } = this.snapshot;

    // First bake the stable political/terrain base for every territory.
    for (const prepared of PREPARED_COUNTRIES) {
      const country = prepared.country;
      const territory = engine?.state.territories[country.id];
      const owner = territory ? engine?.player(territory.ownerId) : undefined;
      const terrainLayers = prepared.terrainLayers;
      const regionalFill = COUNTRY_BY_ID[country.id]?.regionId === 'heartlands'
        ? 0x466071 : 0x294959;
      const ownerColor = owner?.color ?? regionalFill;
      const politicalBase = colorMix(regionalFill, ownerColor, owner ? 0.30 : 0.08);
      const politicalFill = colorMix(
        politicalBase,
        terrainLayers.tintColor,
        terrainLayers.tintAlpha,
      );

      tracePreparedCountry(context, prepared, width, height);
      context.fillStyle = colorCss(politicalFill);
      context.fill('evenodd');
    }

    // Completed territories of one owner share one clip and one continuous
    // flag projection. Integrating territories deliberately keep a unique
    // projection key because they still show their original/core flag.
    const flagProjections = new Map<string, {
      flagOwnerId: string;
      rings: PreparedRing[];
    }>();
    if (engine) {
      for (const prepared of PREPARED_COUNTRIES) {
        const territory = engine.state.territories[prepared.country.id];
        if (!territory) continue;
        const projectionKey = globeFlagProjectionKey(prepared.country.id, territory);
        const existing = flagProjections.get(projectionKey);
        if (existing) existing.rings.push(...prepared.flagRings);
        else {
          flagProjections.set(projectionKey, {
            flagOwnerId: globeTerritoryFlagOwnerId(territory),
            rings: [...prepared.flagRings],
          });
        }
      }
    }

    const paintedFlagProjections = new Set<string>();
    for (const [projectionKey, projection] of flagProjections) {
      const flag = this.flagImages.get(projection.flagOwnerId);
      if (!flag?.complete || flag.naturalWidth <= 0) continue;
      const flagOwner = engine?.player(projection.flagOwnerId);
      // Terrain is composited explicitly after the flag. Keeping the flag
      // itself opaque preserves its fine SVG edges instead of blending those
      // edges with the muted regional fallback underneath.
      const flagAlpha = flagOwner?.isHuman ? 1 : 0.97;
      drawFlagIntoProjection(
        context,
        projection.rings,
        flag,
        width,
        height,
        flagAlpha,
      );
      paintedFlagProjections.add(projectionKey);
    }

    // Terrain remains local to each territory even though completed realms
    // share a single flag. Integration presentation is a fixed lifecycle cue,
    // never a percentage-driven weekly animation or redraw.
    for (const prepared of PREPARED_COUNTRIES) {
      const territory = engine?.state.territories[prepared.country.id];
      const projectionKey = territory
        ? globeFlagProjectionKey(prepared.country.id, territory)
        : undefined;
      if (projectionKey && paintedFlagProjections.has(projectionKey)) {
        context.save();
        tracePreparedRings(context, prepared.flagRings, width, height);
        context.fillStyle = colorCss(prepared.terrainLayers.tintColor);
        context.globalAlpha = prepared.terrainLayers.flagTintAlpha;
        context.fill('evenodd');
        context.restore();
      }

      if (territory && globeTerritoryIsIntegrating(territory)) {
        drawIntegrationOverlay(context, prepared.flagRings, width, height);
      }

      // Detached high-Arctic islands remain neutral ice after every country
      // layer, so they never inherit flag or terrain colour fragments.
      context.fillStyle = 'rgba(218, 239, 242, 0.96)';
      for (const ring of prepared.iceRings) {
        for (const shift of ring.longitudeShifts) {
          context.beginPath();
          tracePreparedRing(context, ring, shift, width, height);
          context.fill();
        }
      }
    }

    // Finally bake one outer realm border per completed territory section.
    // Shared owner edges are omitted; integrating territory edges stay gold.
    for (const prepared of PREPARED_COUNTRIES) {
      const territory = engine?.state.territories[prepared.country.id];
      const owner = territory ? engine?.player(territory.ownerId) : undefined;
      const integrating = Boolean(territory && globeTerritoryIsIntegrating(territory));
      if (integrating) {
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
      context.strokeStyle = integrating ? 'rgba(244, 201, 106, 0.96)'
        : colorCss(prepared.terrainLayers.borderColor);
      const borderScale = width / GLOBE_TEXTURE_WIDTH;
      const terrainBorderWidth = (integrating ? 0.88 : owner?.isHuman ? 0.9 : 0.72)
        * borderScale;
      context.globalAlpha = integrating
        ? 0.94
        : Math.min(0.94, prepared.terrainLayers.borderAlpha * 1.14);
      context.lineWidth = terrainBorderWidth;
      context.stroke();
      context.globalAlpha = 1;
    }
  }

  private redraw(): void {
    drawOcean(this.context, this.textureWidth, this.textureHeight);
    // Ice occupies the ocean beneath the canonical country layer, ensuring
    // Greenland, Canada, Russia, Norway and the other high-Arctic lands win.
    drawArcticIce(this.context, this.textureWidth, this.textureHeight);
    this.drawCountries(this.context, this.textureWidth, this.textureHeight);

    drawAntarctica(this.context, this.textureWidth, this.textureHeight);
    this.onTextureUpdated();
    const { engine } = this.snapshot;
    if (engine) this.paintedPoliticalState = captureGlobePoliticalPaintSnapshot(engine);
  }
}
