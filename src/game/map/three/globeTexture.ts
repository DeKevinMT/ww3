import {
  COUNTRIES,
  COUNTRY_BY_ID,
  terrainProfileForTerritory,
  type CountryRecord,
} from '../../data/worldMap';
import { countryFlagAssetUrl } from '../../../ui/countryFlags';
import naturalEarthTextureUrl from '../assets/earth-natural-no-cloud-4096.webp?url';
import {
  ANTARCTICA_COASTLINE,
  ANTARCTICA_SECTOR_PRESENTATIONS,
} from '../mapGeographyPresentation';
import type {
  MapPolarSectorStatus,
  MapSelectionState,
  WorldMapEngineContract,
} from '../bridge';
import {
  terrainTextureLayerPresentation,
  type TerrainTextureLayerPresentation,
} from './terrainTexturePresentation';
import { globeFlagOverlayAlpha } from './globeNaturalBasePresentation';
import {
  APEX_INTELLIGENCE_FOG_STYLE,
  apexIntelligenceAtlasSignature,
  apexPoliticalAtlasFogTerritoryPresentation,
  apexTerritoryPoliticalIdentityVisible,
  selectApexIntelligenceVisibility,
} from '../apexIntelligenceFog';
import { GlobeAtlasTrailingRedrawBatch } from './globeAtlasRedrawBatch';

export const GLOBE_TEXTURE_WIDTH = 3072;
export const GLOBE_TEXTURE_HEIGHT = 1536;
// Desktop uses one fixed, higher-resolution atlas from lobby through maximum
// zoom. This improves small-country coastlines without introducing a separate
// close-zoom texture, redraw path or additional globe pass.
const HIGH_DETAIL_GLOBE_TEXTURE_WIDTH = 4096;
const HIGH_DETAIL_GLOBE_TEXTURE_HEIGHT = 2048;
const HIGH_DETAIL_MIN_VIEWPORT_WIDTH = 900;
// Wide desktop GPUs can spend part of the relief savings on genuine political
// detail. This is still the same one-time atlas and one globe texture: small
// SVG flags receive 50% more linear resolution without a zoom-time redraw.
const ULTRA_DETAIL_GLOBE_TEXTURE_WIDTH = 6144;
const ULTRA_DETAIL_GLOBE_TEXTURE_HEIGHT = 3072;
const ULTRA_DETAIL_MIN_VIEWPORT_WIDTH = 1200;
const PICK_TEXTURE_WIDTH = 2048;
const PICK_TEXTURE_HEIGHT = 1024;
const ANTARCTICA_PICK_ID = 0xff_ff_ff;
const ARCTIC_PICK_ID = 0xff_ff_fe;
const COUNTRY_PICK_COLOR_STEP = 0x9e_37_79;
const OPEN_ANTARCTICA_POLITICAL_PHASES = new Set([
  'warning', 'contact', 'counteroffensive', 'core-exposed', 'victory',
]);

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
  principalRing?: PreparedRing;
  flagRings: readonly PreparedRing[];
  pickId: number;
  terrainLayers: TerrainTextureLayerPresentation;
}

interface PreparedAntarcticaSector {
  readonly id: (typeof ANTARCTICA_SECTOR_PRESENTATIONS)[number]['id'];
  readonly rings: readonly PreparedRing[];
}

interface TextureSnapshot {
  engine?: WorldMapEngineContract;
  selection: MapSelectionState;
}

export type GlobeFlagRingPolicy = 'all-territory' | 'principal-only';

export function globeFlagRingPolicy(countryId: string): GlobeFlagRingPolicy {
  return countryId === 'fra' || countryId === 'prt' || countryId === 'nld' || countryId === 'chl'
    ? 'principal-only'
    : 'all-territory';
}

export interface GlobeFlagTerritoryState {
  readonly ownerId: string;
  readonly coreOwnerId: string;
  readonly integration: number;
  readonly transitOnly?: boolean;
}

export function globeTerritoryIsIntegrating(territory: GlobeFlagTerritoryState): boolean {
  return territory.transitOnly !== true
    && territory.coreOwnerId !== territory.ownerId
    && territory.integration < 1;
}

export function globeTerritoryFlagOwnerId(territory: GlobeFlagTerritoryState): string {
  return globeTerritoryIsIntegrating(territory) ? territory.coreOwnerId : territory.ownerId;
}

/** Resolves political ownership separately from the account-selected flag art. */
export function globeTerritoryFlagCountryId(
  engine: WorldMapEngineContract,
  territory: GlobeFlagTerritoryState,
): string {
  const ownerId = globeTerritoryFlagOwnerId(territory);
  return engine.player(ownerId)?.flagCountryId ?? ownerId;
}

export function globeFlagProjectionKey(
  territoryId: string,
  territory: GlobeFlagTerritoryState,
): string {
  if (globeTerritoryIsIntegrating(territory)) return `integrating:${territoryId}`;
  // Every sovereign owner, including the Rogue AI, receives one continuous
  // realm projection. Disconnected landmasses are still bounded by the atlas
  // renderer, but adjacent machine possessions now read as one actual empire.
  return `realm:${territory.ownerId}`;
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
  const terrainProfile = terrainProfileForTerritory(country.id);
  const flagRings = globeFlagRingPolicy(country.id) === 'principal-only'
    ? principalRing ? [principalRing] : []
    : rings;
  return {
    country,
    rings,
    principalRing,
    flagRings,
    pickId: globeCountryPickId(index),
    terrainLayers: terrainTextureLayerPresentation(terrainProfile),
  };
});

const COUNTRY_BY_PICK_ID = new Map(PREPARED_COUNTRIES.map((country) => [
  country.pickId,
  country,
]));

const PREPARED_ANTARCTICA_SECTORS: readonly PreparedAntarcticaSector[] = (
  ANTARCTICA_SECTOR_PRESENTATIONS.map((sector) => ({
    id: sector.id,
    rings: sector.rings.flatMap((ring) => {
      const prepared = prepareRing(ring);
      return prepared ? [prepared] : [];
    }),
  }))
);

const PREPARED_ANTARCTICA_SECTOR_BY_ID = new Map(
  PREPARED_ANTARCTICA_SECTORS.map((sector) => [sector.id, sector] as const),
);

/**
 * A globe's south pole collapses the full bottom edge of an equirectangular
 * texture into one point. The source outline faithfully doubles back around
 * peninsulas and bays for the flat map, which would self-intersect when that
 * outline is closed against the pole. Build a longitude-ordered outer coast
 * for the globe only, preserving the northernmost coastline in each narrow
 * slice. The canonical flat-map silhouette remains untouched.
 */
export const ANTARCTICA_GLOBE_COASTLINE: readonly Coordinate[] = (() => {
  const binWidth = 1;
  const binCount = Math.ceil(360 / binWidth);
  const outerCoastByBin = new Map<number, Coordinate>();
  for (const point of ANTARCTICA_COASTLINE) {
    const bin = Math.min(binCount - 1, Math.max(0, Math.floor((point[0] + 180) / binWidth)));
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
  for (let pass = 0; pass < 1; pass += 1) {
    latitudes = latitudes.map((_, index) => {
      let total = 0;
      let weightTotal = 0;
      for (let offset = -2; offset <= 2; offset += 1) {
        const weight = 3 - Math.abs(offset);
        const wrappedIndex = (index + offset + rawLatitudes.length) % rawLatitudes.length;
        total += latitudes[wrappedIndex]! * weight;
        weightTotal += weight;
      }
      return total / weightTotal;
    });
  }

  const coastline: Coordinate[] = latitudes.map((latitude, index) => [
    index - 180,
    Math.max(-87.5, Math.min(-61.5, latitude)),
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

/** Small functional hit area for the physical North Pole signal marker only. */
function traceNorthPoleResearchSite(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const [x, y] = texturePoint(0, 88.6, width, height);
  context.beginPath();
  context.ellipse(
    x,
    y,
    Math.max(3, width * 5 / 360),
    Math.max(3, height * 2.4 / 180),
    0,
    0,
    Math.PI * 2,
  );
  context.closePath();
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

  // Deterministic facets add close-range ice relief only when the atlas bakes.
  for (let index = 0; index < 72; index += 1) {
    const seed = (Math.imul(index + 17, 2_654_435_761) >>> 0) / 4_294_967_296;
    const longitude = -178 + ((index * 71) % 356);
    const latitude = -65 - seed * 22;
    const longitudeSpan = 5 + ((index * 11) % 15);
    const latitudeSpan = 0.7 + ((index * 7) % 9) * 0.18;
    const [left, top] = texturePoint(longitude, latitude, width, height);
    const [right] = texturePoint(longitude + longitudeSpan, latitude, width, height);
    const [, bottom] = texturePoint(longitude, latitude - latitudeSpan, width, height);
    context.beginPath();
    context.moveTo(left, top);
    context.lineTo(right, top + (index % 3 - 1) * height * 0.0015);
    context.lineTo(right - width * 0.004, bottom);
    context.lineTo(left + width * 0.002, bottom + height * 0.001);
    context.closePath();
    context.fillStyle = index % 2 === 0
      ? 'rgba(244, 255, 255, 0.045)'
      : 'rgba(51, 111, 133, 0.035)';
    context.fill();
  }

  // Crooked glacier flow converges on the pole instead of forming latitude rings.
  context.lineCap = 'round';
  context.lineWidth = Math.max(0.75, width / 5200);
  context.strokeStyle = 'rgba(239, 254, 255, 0.23)';
  for (let longitude = -174; longitude <= 174; longitude += 12) {
    const [startX, startY] = texturePoint(longitude, -63, width, height);
    const [endX, endY] = texturePoint(longitude + Math.sin(longitude * 0.17) * 7, -89.2, width, height);
    const [controlOneX, controlOneY] = texturePoint(longitude + Math.sin(longitude) * 5, -72, width, height);
    const [controlTwoX, controlTwoY] = texturePoint(longitude - Math.cos(longitude * 0.11) * 8, -82, width, height);
    context.beginPath();
    context.moveTo(startX, startY);
    context.bezierCurveTo(controlOneX, controlOneY, controlTwoX, controlTwoY, endX, endY);
    context.stroke();
  }

  context.lineWidth = Math.max(0.65, width / 6200);
  context.strokeStyle = 'rgba(39, 98, 119, 0.16)';
  for (let index = 0; index < 38; index += 1) {
    const longitude = -172 + ((index * 53) % 344);
    const latitude = -67 - ((index * 7) % 18);
    const [startX, startY] = texturePoint(longitude, latitude, width, height);
    const [endX, endY] = texturePoint(longitude + 10 + (index % 5) * 3, latitude - 1.2, width, height);
    context.beginPath();
    context.moveTo(startX, startY);
    context.bezierCurveTo(
      startX + width * 0.012, startY - height * 0.004,
      endX - width * 0.009, endY + height * 0.005,
      endX, endY,
    );
    context.stroke();
  }
  context.restore();

  traceAntarctica(context, width, height);
  context.strokeStyle = 'rgba(22, 75, 94, 0.42)';
  context.lineWidth = Math.max(3, width / 1450);
  context.stroke();
  traceAntarctica(context, width, height);
  context.strokeStyle = 'rgba(220, 251, 255, 0.94)';
  context.lineWidth = Math.max(1.4, width / 3200);
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

function naturalBaseImageReady(image: HTMLImageElement | undefined): image is HTMLImageElement {
  return Boolean(image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
}

function drawNaturalEarthBase(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement | undefined,
  width: number,
  height: number,
): boolean {
  if (!naturalBaseImageReady(image)) return false;
  context.save();
  context.globalAlpha = 1;
  context.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight, 0, 0, width, height);
  context.restore();
  return true;
}

function restoreNaturalEarthBaseIntoRings(
  context: CanvasRenderingContext2D,
  rings: readonly PreparedRing[],
  image: HTMLImageElement,
  width: number,
  height: number,
): void {
  const bounds = preparedRingsTextureBounds(rings, width, height);
  if (!bounds) return;
  const left = Math.max(0, Math.floor(bounds.left));
  const top = Math.max(0, Math.floor(bounds.top));
  const right = Math.min(width, Math.ceil(bounds.right));
  const bottom = Math.min(height, Math.ceil(bounds.bottom));
  const drawWidth = Math.max(1, right - left);
  const drawHeight = Math.max(1, bottom - top);
  context.save();
  tracePreparedRings(context, rings, width, height);
  context.clip('evenodd');
  context.globalAlpha = 1;
  context.drawImage(
    image,
    left / width * image.naturalWidth,
    top / height * image.naturalHeight,
    drawWidth / width * image.naturalWidth,
    drawHeight / height * image.naturalHeight,
    left,
    top,
    drawWidth,
    drawHeight,
  );
  context.restore();
}

function drawPreparedTerrainWash(
  context: CanvasRenderingContext2D,
  prepared: PreparedCountry,
  width: number,
  height: number,
): void {
  context.save();
  tracePreparedCountry(context, prepared, width, height);
  context.fillStyle = colorCss(prepared.terrainLayers.tintColor);
  context.globalAlpha = prepared.terrainLayers.tintAlpha;
  context.fill('evenodd');
  context.restore();
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

function antarcticaPoliticalVisible(engine: WorldMapEngineContract | undefined): boolean {
  const phase = engine?.state.polarEndgame?.phase;
  return Boolean(phase && OPEN_ANTARCTICA_POLITICAL_PHASES.has(phase));
}

function antarcticaSurfaceSignature(engine: WorldMapEngineContract): string {
  const polar = engine.state.polarEndgame;
  if (!polar || !antarcticaPoliticalVisible(engine)) return polar?.phase ?? 'dormant';
  return `${polar.phase}:${ANTARCTICA_SECTOR_PRESENTATIONS.map((sector) => (
    polar.sectors[sector.id]?.status ?? 'hidden'
  )).join(',')}`;
}

export function globeTextureSelectionSignature(selection: MapSelectionState): string {
  return [
    selection.sourceId ?? '',
    selection.targetId ?? '',
    [...selection.legalTargetIds].sort().join(','),
  ].join('|');
}

export function globePoliticalStateSignature(engine: WorldMapEngineContract): string {
  const paintedTerritoryIds = [
    ...COUNTRIES.map((country) => country.id),
    ...(antarcticaPoliticalVisible(engine)
      ? ANTARCTICA_SECTOR_PRESENTATIONS.map((sector) => sector.id)
      : []),
  ];
  const territorySignature = paintedTerritoryIds.map((territoryId) => {
    const territory = engine.state.territories[territoryId];
    return territory
      ? `${territory.ownerId}:${territory.coreOwnerId}:${globeTerritoryIsIntegrating(territory) ? 'integrating' : 'core'}`
      : '';
  }).join(',');
  const humanSignature = [...engine.state.humanPlayerIds].sort().map((playerId) => (
    `${playerId}:${engine.player(playerId)?.flagCountryId ?? playerId}`
  )).join(',');
  const realmFlagSignature = [...new Set(paintedTerritoryIds.map((territoryId) => {
    const territory = engine.state.territories[territoryId];
    return territory ? globeTerritoryFlagOwnerId(territory) : undefined;
  }).filter((playerId): playerId is string => Boolean(playerId)))]
    .sort((left, right) => left.localeCompare(right))
    .map((playerId) => `${playerId}:${engine.player(playerId)?.flagCountryId ?? playerId}`)
    .join(',');
  return `${humanSignature}|flags:${realmFlagSignature}|${antarcticaSurfaceSignature(engine)}|${apexIntelligenceAtlasSignature(engine)}|${territorySignature}`;
}

export interface GlobePoliticalPaintState {
  readonly ownerId: string;
  readonly coreOwnerId: string;
  readonly integrating: boolean;
  readonly flagOwnerId: string;
  readonly transitOnly: boolean;
}

export interface GlobePoliticalPaintSnapshot {
  readonly humanSignature: string;
  readonly surfaceSignature: string;
  readonly territories: Readonly<Record<string, GlobePoliticalPaintState>>;
}

export type GlobePoliticalAtlasUpdate =
  | { readonly kind: 'none' }
  | { readonly kind: 'full' }
  | { readonly kind: 'realm-expansion'; readonly territoryIds: readonly string[] }
  | { readonly kind: 'capture'; readonly territoryIds: readonly string[] };

export function captureGlobePoliticalPaintSnapshot(
  engine: WorldMapEngineContract,
): GlobePoliticalPaintSnapshot {
  const territories: Record<string, GlobePoliticalPaintState> = {};
  const paintedTerritoryIds = [
    ...COUNTRIES.map((country) => country.id),
    ...(antarcticaPoliticalVisible(engine)
      ? ANTARCTICA_SECTOR_PRESENTATIONS.map((sector) => sector.id)
      : []),
  ];
  for (const territoryId of paintedTerritoryIds) {
    const territory = engine.state.territories[territoryId];
    if (!territory) continue;
    territories[territoryId] = {
      ownerId: territory.ownerId,
      coreOwnerId: territory.coreOwnerId,
      integrating: globeTerritoryIsIntegrating(territory),
      flagOwnerId: globeTerritoryFlagOwnerId(territory),
      transitOnly: territory.transitOnly === true,
    };
  }
  return {
    humanSignature: [...new Set([
      ...engine.state.humanPlayerIds,
      ...Object.values(territories).map((territory) => territory.flagOwnerId),
    ])].sort().map((playerId) => (
      `${playerId}:${engine.player(playerId)?.flagCountryId ?? playerId}`
    )).join(','),
    surfaceSignature: `${antarcticaSurfaceSignature(engine)}|${apexIntelligenceAtlasSignature(engine)}`,
    territories,
  };
}

/**
 * Only a fresh conquest can be repainted as one isolated territory. Realm
 * merges, integration completion, ownership transfers and human-seat changes can alter
 * shared projections or borders elsewhere and therefore retain the safe full
 * atlas path.
 */
export function classifyGlobePoliticalAtlasUpdate(
  previous: GlobePoliticalPaintSnapshot | undefined,
  next: GlobePoliticalPaintSnapshot,
): GlobePoliticalAtlasUpdate {
  if (!previous
    || previous.humanSignature !== next.humanSignature
    || previous.surfaceSignature !== next.surfaceSignature) return { kind: 'full' };
  const beforeIds = Object.keys(previous.territories);
  const afterIds = Object.keys(next.territories);
  if (beforeIds.length !== afterIds.length
    || beforeIds.some((territoryId) => !(territoryId in next.territories))) {
    return { kind: 'full' };
  }

  const capturedTerritoryIds: string[] = [];
  const realmExpansionTerritoryIds: string[] = [];
  for (const territoryId of afterIds) {
    const before = previous.territories[territoryId];
    const after = next.territories[territoryId];
    if (!before || !after) return { kind: 'full' };
    if (before.ownerId === after.ownerId
      && before.coreOwnerId === after.coreOwnerId
      && before.integrating === after.integrating
      && before.flagOwnerId === after.flagOwnerId
      && before.transitOnly === after.transitOnly) continue;

    const isIsolatedCapture = before.ownerId === before.coreOwnerId
      && !before.integrating
      && after.ownerId !== after.coreOwnerId
      && after.integrating
      && after.coreOwnerId === before.coreOwnerId
      && before.flagOwnerId === before.coreOwnerId
      && after.flagOwnerId === after.coreOwnerId;
    if (isIsolatedCapture) {
      capturedTerritoryIds.push(territoryId);
      continue;
    }
    const isTransitRealmExpansion = before.ownerId === before.coreOwnerId
      && before.coreOwnerId === after.coreOwnerId
      && !before.integrating
      && !before.transitOnly
      && after.ownerId !== after.coreOwnerId
      && !after.integrating
      && after.transitOnly
      && before.flagOwnerId === before.coreOwnerId
      && after.flagOwnerId === after.ownerId;
    if (!isTransitRealmExpansion) return { kind: 'full' };
    realmExpansionTerritoryIds.push(territoryId);
  }

  if (capturedTerritoryIds.length > 0 && realmExpansionTerritoryIds.length > 0) {
    return { kind: 'full' };
  }
  if (realmExpansionTerritoryIds.length > 0) return {
    kind: 'realm-expansion',
    territoryIds: realmExpansionTerritoryIds,
  };
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
  /** Shared low-resolution alpha mask consumed by the globe's one cloud shell. */
  readonly intelligenceFogMaskCanvas: HTMLCanvasElement;
  private readonly textureWidth: number;
  private readonly textureHeight: number;
  private readonly context: CanvasRenderingContext2D;
  private readonly intelligenceFogMaskContext: CanvasRenderingContext2D;
  private readonly intelligenceFogNoiseCanvas: HTMLCanvasElement;
  private readonly pickCanvas: HTMLCanvasElement;
  private readonly pickContext: CanvasRenderingContext2D;
  private pickPixels = new Uint8ClampedArray();
  private readonly flagImages = new Map<string, HTMLImageElement>();
  private readonly pendingFlagLoads = new Set<string>();
  private naturalBaseImage?: HTMLImageElement;
  private naturalBaseSettled = false;
  private mapReadyPromise: Promise<void> = Promise.resolve();
  private resolveMapReady?: () => void;
  private snapshot: TextureSnapshot = { selection: { legalTargetIds: [] } };
  private politicalSignature = '';
  private paintedPoliticalState?: GlobePoliticalPaintSnapshot;
  private redrawTimer?: number;
  private readonly realmExpansionRedrawBatch = new GlobeAtlasTrailingRedrawBatch();
  private textureUploadFrame?: number;
  private textureUploadTimer?: number;

  constructor(
    private readonly onTextureUpdated: () => void,
    maximumTextureSize = ULTRA_DETAIL_GLOBE_TEXTURE_WIDTH,
  ) {
    const finePointer = typeof window.matchMedia === 'function'
      && window.matchMedia('(pointer: fine)').matches;
    const ultraDetail = finePointer
      && window.innerWidth >= ULTRA_DETAIL_MIN_VIEWPORT_WIDTH
      && maximumTextureSize >= ULTRA_DETAIL_GLOBE_TEXTURE_WIDTH;
    const highDetail = finePointer && window.innerWidth >= HIGH_DETAIL_MIN_VIEWPORT_WIDTH;
    const preferredWidth = ultraDetail
      ? ULTRA_DETAIL_GLOBE_TEXTURE_WIDTH
      : highDetail ? HIGH_DETAIL_GLOBE_TEXTURE_WIDTH : GLOBE_TEXTURE_WIDTH;
    const preferredHeight = ultraDetail
      ? ULTRA_DETAIL_GLOBE_TEXTURE_HEIGHT
      : highDetail ? HIGH_DETAIL_GLOBE_TEXTURE_HEIGHT : GLOBE_TEXTURE_HEIGHT;
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

    this.intelligenceFogMaskCanvas = document.createElement('canvas');
    this.intelligenceFogMaskCanvas.width = 1024;
    this.intelligenceFogMaskCanvas.height = 512;
    const intelligenceFogMaskContext = this.intelligenceFogMaskCanvas.getContext('2d');
    if (!intelligenceFogMaskContext) throw new Error('The APEX intelligence mask could not be created.');
    this.intelligenceFogMaskContext = intelligenceFogMaskContext;
    this.intelligenceFogMaskContext.imageSmoothingEnabled = true;
    this.intelligenceFogMaskContext.imageSmoothingQuality = 'high';

    this.intelligenceFogNoiseCanvas = document.createElement('canvas');
    this.intelligenceFogNoiseCanvas.width = 128;
    this.intelligenceFogNoiseCanvas.height = 64;
    const fogNoise = this.intelligenceFogNoiseCanvas.getContext('2d');
    if (!fogNoise) throw new Error('The APEX intelligence noise texture could not be created.');
    const noiseImage = fogNoise.createImageData(128, 64);
    for (let index = 0; index < noiseImage.data.length; index += 4) {
      const seed = (Math.imul(index / 4 + 97, 2_654_435_761) >>> 0) / 4_294_967_296;
      const value = Math.round(54 + seed * 76);
      noiseImage.data[index] = value;
      noiseImage.data[index + 1] = value + 12;
      noiseImage.data[index + 2] = value + 20;
      noiseImage.data[index + 3] = Math.round(35 + seed * 70);
    }
    fogNoise.putImageData(noiseImage, 0, 0);

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
    this.loadNaturalBase();
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
    if (update.kind === 'realm-expansion') {
      this.queueRealmExpansionRedraw();
      return;
    }
    if (update.kind === 'capture'
      && this.redrawTimer === undefined
      && this.drawCapturedTerritories(update.territoryIds)) {
      this.queueTextureUpload();
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

  destroy(): void {
    if (this.redrawTimer !== undefined) window.clearTimeout(this.redrawTimer);
    this.realmExpansionRedrawBatch.cancel();
    if (this.textureUploadFrame !== undefined) window.cancelAnimationFrame(this.textureUploadFrame);
    if (this.textureUploadTimer !== undefined) window.clearTimeout(this.textureUploadTimer);
    if (this.naturalBaseImage) {
      this.naturalBaseImage.onload = null;
      this.naturalBaseImage.onerror = null;
    }
    this.resolveMapReady?.();
    this.resolveMapReady = undefined;
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
    // Only the physical North Pole research site has a neutral hit target.
    // Real northern land polygons retain their normal country hit targets.
    traceNorthPoleResearchSite(this.pickContext, PICK_TEXTURE_WIDTH, PICK_TEXTURE_HEIGHT);
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
    const intelligence = selectApexIntelligenceVisibility(engine);
    const nationIds = new Set<string>();
    const paintedTerritoryIds = [
      ...COUNTRIES.map((country) => country.id),
      ...(antarcticaPoliticalVisible(engine)
        ? ANTARCTICA_SECTOR_PRESENTATIONS.map((sector) => sector.id)
        : []),
    ];
    for (const territoryId of paintedTerritoryIds) {
      const territory = engine.state.territories[territoryId];
      if (!territory) continue;
      if (!apexTerritoryPoliticalIdentityVisible(
        intelligence,
        territoryId,
        territory.ownerId,
      )) continue;
      nationIds.add(globeTerritoryFlagCountryId(engine, territory));
      // Preload the conquering owner's flag while integration is ongoing so
      // the lifecycle-completion redraw can switch flags without a blank frame.
      nationIds.add(engine.player(territory.ownerId)?.flagCountryId ?? territory.ownerId);
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

  private loadNaturalBase(): void {
    this.markMapReadinessPending();
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => this.finishNaturalBaseLoad(true);
    image.onerror = () => this.finishNaturalBaseLoad(false);
    image.src = naturalEarthTextureUrl;
    this.naturalBaseImage = image;
  }

  private finishNaturalBaseLoad(succeeded: boolean): void {
    if (this.naturalBaseSettled) return;
    this.naturalBaseSettled = true;
    if (!succeeded) this.naturalBaseImage = undefined;
    this.queueRedraw();
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
    if (!this.naturalBaseSettled
      || this.pendingFlagLoads.size > 0
      || this.redrawTimer !== undefined
      || this.realmExpansionRedrawBatch.pending
      || this.textureUploadFrame !== undefined
      || this.textureUploadTimer !== undefined) return;
    const resolve = this.resolveMapReady;
    if (!resolve) return;
    this.resolveMapReady = undefined;
    resolve();
  }

  private queueRedraw(): void {
    this.realmExpansionRedrawBatch.cancel();
    if (this.redrawTimer !== undefined) return;
    // Flags arrive in a burst. Batch their decodes so the political texture
    // is not rebuilt once per SVG during the opening screen.
    this.redrawTimer = window.setTimeout(() => {
      this.redrawTimer = undefined;
      // A political sync can discover another relevant flag during this short
      // debounce. Its completion will schedule the one final atlas batch.
      if (!this.naturalBaseSettled || this.pendingFlagLoads.size > 0) return;
      try {
        this.redraw();
      } finally {
        this.resolveMapReadinessAfterBatch();
      }
    }, 90);
  }

  /**
   * A transit-only Survival capture changes the Rogue realm's continuous flag
   * bounds and therefore cannot use the isolated-country paint path. Keep its
   * live border/nameplate update, but wait until the short capture burst
   * settles before doing the one expensive safe atlas bake and GPU upload.
   */
  private queueRealmExpansionRedraw(): void {
    this.realmExpansionRedrawBatch.schedule(() => {
      if (!this.naturalBaseSettled || this.pendingFlagLoads.size > 0) {
        this.queueRedraw();
        return;
      }
      try {
        this.redraw();
      } finally {
        this.resolveMapReadinessAfterBatch();
      }
    });
  }

  /** Coalesce full-canvas GPU uploads after the outcome/UI frame has painted. */
  private queueTextureUpload(): void {
    if (this.textureUploadFrame !== undefined || this.textureUploadTimer !== undefined) return;
    this.textureUploadFrame = window.requestAnimationFrame(() => {
      this.textureUploadFrame = undefined;
      this.textureUploadTimer = window.setTimeout(() => {
        this.textureUploadTimer = undefined;
        this.onTextureUpdated();
        this.resolveMapReadinessAfterBatch();
      }, 0);
    });
  }

  /** Repaints only newly captured polygons; all shared-realm changes use redraw(). */
  private drawCapturedTerritories(territoryIds: readonly string[]): boolean {
    const { engine } = this.snapshot;
    const naturalBase = this.naturalBaseImage;
    if (!engine || !naturalBaseImageReady(naturalBase)) return false;
    const preparedTerritories: PreparedCountry[] = [];
    for (const territoryId of territoryIds) {
      const prepared = PREPARED_COUNTRIES.find(
        (candidate) => candidate.country.id === territoryId,
      );
      const territory = engine.state.territories[territoryId];
      if (!prepared || !territory || !globeTerritoryIsIntegrating(territory)) return false;
      const flag = this.flagImages.get(globeTerritoryFlagCountryId(engine, territory));
      if (!flag?.complete || flag.naturalWidth <= 0) return false;
      preparedTerritories.push(prepared);
    }

    const context = this.context;
    const width = this.textureWidth;
    const height = this.textureHeight;
    for (const prepared of preparedTerritories) {
      const country = prepared.country;
      const territory = engine.state.territories[country.id]!;
      restoreNaturalEarthBaseIntoRings(
        context,
        prepared.rings,
        naturalBase,
        width,
        height,
      );
      drawPreparedTerrainWash(context, prepared, width, height);

      const flagOwnerId = globeTerritoryFlagOwnerId(territory);
      const flagCountryId = globeTerritoryFlagCountryId(engine, territory);
      const flag = this.flagImages.get(flagCountryId)!;
      const flagOwner = engine.player(flagOwnerId);
      drawFlagIntoProjection(
        context,
        prepared.flagRings,
        flag,
        width,
        height,
        globeFlagOverlayAlpha(Boolean(flagOwner?.isHuman), true),
      );
      drawIntegrationOverlay(context, prepared.flagRings, width, height);

    }
    return true;
  }

  private drawCountries(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    naturalBaseReady: boolean,
  ): void {
    const { engine } = this.snapshot;

    // Geography is the stable base. Gameplay terrain adds one restrained wash
    // before transparent political identity; there is no second
    // post-flag tint to muddy the source raster.
    for (const prepared of PREPARED_COUNTRIES) {
      const country = prepared.country;
      const territory = engine?.state.territories[country.id];
      const owner = territory ? engine?.player(territory.ownerId) : undefined;
      if (naturalBaseReady) drawPreparedTerrainWash(context, prepared, width, height);
      else {
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
    }

    // Completed territories of one owner share one clip and one continuous
    // flag projection. Integrating territories deliberately keep a unique
    // projection key because they still show their original/core flag.
    const flagProjections = new Map<string, {
      flagOwnerId: string;
      flagCountryId: string;
      rings: PreparedRing[];
      integrating: boolean;
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
            flagCountryId: globeTerritoryFlagCountryId(engine, territory),
            rings: [...prepared.flagRings],
            integrating: globeTerritoryIsIntegrating(territory),
          });
        }
      }
    }

    for (const projection of flagProjections.values()) {
      const flag = this.flagImages.get(projection.flagCountryId);
      if (!flag?.complete || flag.naturalWidth <= 0) continue;
      const flagOwner = engine?.player(projection.flagOwnerId);
      const flagAlpha = globeFlagOverlayAlpha(
        Boolean(flagOwner?.isHuman),
        projection.integrating,
      );
      drawFlagIntoProjection(
        context,
        projection.rings,
        flag,
        width,
        height,
        flagAlpha,
      );
    }

    // Integration remains a fixed lifecycle cue, never a percentage-driven
    // weekly animation or redraw.
    for (const prepared of PREPARED_COUNTRIES) {
      const territory = engine?.state.territories[prepared.country.id];
      if (territory && globeTerritoryIsIntegrating(territory)) {
        drawIntegrationOverlay(context, prepared.flagRings, width, height);
      }

      // Every real northern island remains part of its country. The old Arctic
      // gateway treatment repainted detached rings as white ice here, obscuring
      // owner colour and continuous empire flag projection.
    }

    // Political borders are intentionally absent from this atlas. The globe's
    // one screen-space LineSegments2 layer owns coastlines, realm hiding and
    // integration perimeters without a divergent baked duplicate.
  }

  /**
   * Paints the nine real Antarctic territories over, never instead of, the
   * existing ice imagery. One owner flag is projected continuously across its
   * Antarctic holdings while every sector retains its own gameplay polygon.
   */
  private drawAntarcticTerritories(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): void {
    const { engine } = this.snapshot;
    if (!engine || !antarcticaPoliticalVisible(engine)) return;
    const intelligence = selectApexIntelligenceVisibility(engine);

    context.save();
    traceAntarctica(context, width, height);
    context.clip();

    const projections = new Map<string, {
      flagOwnerId: string;
      flagCountryId: string;
      rings: PreparedRing[];
      integrating: boolean;
    }>();
    for (const prepared of PREPARED_ANTARCTICA_SECTORS) {
      const territory = engine.state.territories[prepared.id];
      if (!territory || prepared.rings.length === 0) continue;
      if (!apexTerritoryPoliticalIdentityVisible(
        intelligence,
        prepared.id,
        territory.ownerId,
      )) continue;
      const owner = engine.player(territory.ownerId);
      tracePreparedRings(context, prepared.rings, width, height);
      context.fillStyle = colorCss(owner?.color ?? 0x3d7f8d);
      context.globalAlpha = owner?.isHuman ? 0.10 : 0.075;
      context.fill('evenodd');

      const projectionKey = `antarctica:${globeFlagProjectionKey(prepared.id, territory)}`;
      const existing = projections.get(projectionKey);
      if (existing) existing.rings.push(...prepared.rings);
      else {
        projections.set(projectionKey, {
          flagOwnerId: globeTerritoryFlagOwnerId(territory),
          flagCountryId: globeTerritoryFlagCountryId(engine, territory),
          rings: [...prepared.rings],
          integrating: globeTerritoryIsIntegrating(territory),
        });
      }
    }

    context.globalAlpha = 1;
    for (const projection of projections.values()) {
      const flag = this.flagImages.get(projection.flagCountryId);
      if (!flag?.complete || flag.naturalWidth <= 0) continue;
      const owner = engine.player(projection.flagOwnerId);
      drawFlagIntoProjection(
        context,
        projection.rings,
        flag,
        width,
        height,
        globeFlagOverlayAlpha(Boolean(owner?.isHuman), projection.integrating) * 0.78,
      );
    }

    const statusColor: Readonly<Record<MapPolarSectorStatus, number>> = {
      hidden: 0x88a8af,
      available: 0x5de6f2,
      contested: 0xff655d,
      secured: 0x67e49d,
    };
    const statusAlpha: Readonly<Record<MapPolarSectorStatus, number>> = {
      hidden: 0.018,
      available: 0.045,
      contested: 0.115,
      secured: 0.065,
    };
    for (const prepared of PREPARED_ANTARCTICA_SECTORS) {
      const territory = engine.state.territories[prepared.id];
      if (!territory) continue;
      if (!apexTerritoryPoliticalIdentityVisible(
        intelligence,
        prepared.id,
        territory.ownerId,
      )) continue;
      const status = engine.state.polarEndgame?.sectors[prepared.id]?.status ?? 'hidden';
      tracePreparedRings(context, prepared.rings, width, height);
      context.fillStyle = colorCss(statusColor[status]);
      context.globalAlpha = statusAlpha[status];
      context.fill('evenodd');
      if (globeTerritoryIsIntegrating(territory)) {
        context.globalAlpha = 1;
        drawIntegrationOverlay(context, prepared.rings, width, height);
      }
    }
    context.restore();
  }

  /**
   * One topology-cached mask darkens unknown territory inside the political
   * atlas and feeds the separate shared cloud shell. Nothing here runs per
   * frame and no country receives its own material or mesh.
   */
  private drawApexIntelligenceFog(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): void {
    const mask = this.intelligenceFogMaskContext;
    const maskWidth = this.intelligenceFogMaskCanvas.width;
    const maskHeight = this.intelligenceFogMaskCanvas.height;
    mask.clearRect(0, 0, maskWidth, maskHeight);
    const { engine } = this.snapshot;
    if (!engine) return;
    const visibility = selectApexIntelligenceVisibility(engine);
    if (!visibility.enabled) return;

    // Antarctica never receives the intelligence mask. Before awakening it is
    // ordinary unmarked ice; after awakening the political atlas and crimson
    // stronghold field reveal the machine state directly, without black fog.
    const atlasTerritories: readonly {
      readonly rings: readonly PreparedRing[];
      readonly territoryId: string;
      readonly ownerId: string | undefined;
    }[] = PREPARED_COUNTRIES.map((prepared) => ({
      rings: prepared.rings,
      territoryId: prepared.country.id,
      ownerId: engine.state.territories[prepared.country.id]?.ownerId,
    }));
    const noisePattern = context.createPattern(this.intelligenceFogNoiseCanvas, 'repeat');
    for (const { rings, territoryId, ownerId } of atlasTerritories) {
      const presentation = apexPoliticalAtlasFogTerritoryPresentation(
        visibility,
        territoryId,
        ownerId,
      );
      if (!presentation.obscured) continue;
      tracePreparedRings(mask, rings, maskWidth, maskHeight);
      mask.save();
      mask.filter = 'blur(1.6px)';
      mask.fillStyle = `rgba(255, 255, 255, ${presentation.charted
        ? APEX_INTELLIGENCE_FOG_STYLE.chartedCloudMaskAlpha : 1})`;
      mask.fill('evenodd');
      mask.restore();

      tracePreparedRings(context, rings, width, height);
      context.save();
      context.fillStyle = colorCss(presentation.fill);
      context.globalAlpha = presentation.alpha;
      context.shadowColor = presentation.rogueOccupied
        ? 'rgba(96, 10, 53, 0.56)' : 'rgba(4, 19, 32, 0.72)';
      context.shadowBlur = Math.max(3, APEX_INTELLIGENCE_FOG_STYLE.featherPixels * width / 3072);
      context.fill('evenodd');
      context.restore();

      if (noisePattern) {
        tracePreparedRings(context, rings, width, height);
        context.save();
        context.clip('evenodd');
        context.globalAlpha = presentation.cloudAlpha;
        context.fillStyle = noisePattern;
        context.fillRect(0, 0, width, height);
        context.restore();
      }
    }
  }

  private redraw(): void {
    const naturalBaseReady = drawNaturalEarthBase(
      this.context,
      this.naturalBaseImage,
      this.textureWidth,
      this.textureHeight,
    );
    if (!naturalBaseReady) {
      drawOcean(this.context, this.textureWidth, this.textureHeight);
    }
    this.drawCountries(
      this.context,
      this.textureWidth,
      this.textureHeight,
      naturalBaseReady,
    );
    if (!naturalBaseReady) {
      drawAntarctica(this.context, this.textureWidth, this.textureHeight);
    }
    this.drawAntarcticTerritories(
      this.context,
      this.textureWidth,
      this.textureHeight,
    );
    this.drawApexIntelligenceFog(
      this.context,
      this.textureWidth,
      this.textureHeight,
    );
    this.queueTextureUpload();
    const { engine } = this.snapshot;
    if (engine) this.paintedPoliticalState = captureGlobePoliticalPaintSnapshot(engine);
  }
}
