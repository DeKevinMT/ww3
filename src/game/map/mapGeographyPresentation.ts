import { MAP_HEIGHT, MAP_WIDTH } from '../data/worldMap';
import type { MapPolarSectorId } from './bridge';

export type SeaLabelKind = 'ocean' | 'sea';

export interface SeaMapLabel {
  id: string;
  name: string;
  longitude: number;
  latitude: number;
  kind: SeaLabelKind;
  /** Degrees; a restrained slant follows the local coastline. */
  rotation?: number;
  /** Smaller regional labels disappear sooner as the camera moves in. */
  maxZoom: number;
  /** Direct map position for geography outside the playable latitude crop. */
  mapPosition?: readonly [number, number];
}

/**
 * Authored water labels deliberately stay independent from countries and sea
 * lanes. They are orientation marks only, so gameplay topology can change
 * without moving or promoting this low-contrast cartographic layer.
 */
export const SEA_MAP_LABELS: readonly SeaMapLabel[] = [
  { id: 'north-atlantic', name: 'NORTH ATLANTIC OCEAN', longitude: -34, latitude: 34, kind: 'ocean', rotation: -8, maxZoom: 2.15 },
  { id: 'south-atlantic', name: 'SOUTH ATLANTIC OCEAN', longitude: -18, latitude: -31, kind: 'ocean', rotation: -4, maxZoom: 1.85 },
  { id: 'north-pacific-west', name: 'NORTH PACIFIC OCEAN', longitude: 162, latitude: 25, kind: 'ocean', rotation: 7, maxZoom: 1.85 },
  { id: 'north-pacific-east', name: 'NORTH PACIFIC OCEAN', longitude: -147, latitude: 28, kind: 'ocean', rotation: -7, maxZoom: 1.85 },
  { id: 'south-pacific', name: 'SOUTH PACIFIC OCEAN', longitude: -126, latitude: -27, kind: 'ocean', rotation: 5, maxZoom: 1.75 },
  { id: 'indian-ocean', name: 'INDIAN OCEAN', longitude: 79, latitude: -25, kind: 'ocean', rotation: -5, maxZoom: 2.05 },
  { id: 'arctic-ocean', name: 'ARCTIC OCEAN', longitude: 2, latitude: 78, kind: 'ocean', maxZoom: 1.7 },
  { id: 'southern-ocean', name: 'SOUTHERN OCEAN', longitude: 0, latitude: -58, kind: 'ocean', maxZoom: 1.65, mapPosition: [640, 753] },

  { id: 'north-sea', name: 'NORTH SEA', longitude: 3.5, latitude: 56.5, kind: 'sea', maxZoom: 4.2 },
  { id: 'norwegian-sea', name: 'NORWEGIAN SEA', longitude: 2, latitude: 67, kind: 'sea', rotation: -11, maxZoom: 3.25 },
  { id: 'baltic-sea', name: 'BALTIC SEA', longitude: 19, latitude: 58, kind: 'sea', rotation: 17, maxZoom: 4.15 },
  { id: 'mediterranean-sea', name: 'MEDITERRANEAN SEA', longitude: 17, latitude: 34.5, kind: 'sea', maxZoom: 3.3 },
  { id: 'black-sea', name: 'BLACK SEA', longitude: 35, latitude: 43.2, kind: 'sea', maxZoom: 4.05 },
  { id: 'caribbean-sea', name: 'CARIBBEAN SEA', longitude: -75, latitude: 15, kind: 'sea', rotation: -5, maxZoom: 3.2 },
  { id: 'gulf-of-mexico', name: 'GULF OF MEXICO', longitude: -90, latitude: 24.5, kind: 'sea', maxZoom: 3.25 },
  { id: 'bering-sea', name: 'BERING SEA', longitude: -172, latitude: 57, kind: 'sea', rotation: 7, maxZoom: 2.85 },
  { id: 'red-sea', name: 'RED SEA', longitude: 39, latitude: 20, kind: 'sea', rotation: 54, maxZoom: 4.15 },
  { id: 'arabian-sea', name: 'ARABIAN SEA', longitude: 64, latitude: 15, kind: 'sea', rotation: -8, maxZoom: 3.1 },
  { id: 'bay-of-bengal', name: 'BAY OF BENGAL', longitude: 88, latitude: 13, kind: 'sea', rotation: 10, maxZoom: 3.1 },
  { id: 'south-china-sea', name: 'SOUTH CHINA SEA', longitude: 114, latitude: 12, kind: 'sea', rotation: -10, maxZoom: 3.35 },
  { id: 'east-china-sea', name: 'EAST CHINA SEA', longitude: 126, latitude: 29, kind: 'sea', rotation: -18, maxZoom: 3.45 },
  { id: 'sea-of-japan', name: 'SEA OF JAPAN', longitude: 135, latitude: 40, kind: 'sea', rotation: -23, maxZoom: 3.6 },
  { id: 'persian-gulf', name: 'PERSIAN GULF', longitude: 51, latitude: 26, kind: 'sea', rotation: -18, maxZoom: 4.2 },
] as const;

export interface SeaLabelZoomPresentation {
  visible: boolean;
  alpha: number;
  scale: number;
}

/** Keeps labels screen-sized, then fades them before deep-zoom country detail. */
export function seaLabelZoomPresentation(
  label: SeaMapLabel,
  zoom: number,
): SeaLabelZoomPresentation {
  const safeZoom = Math.max(0.01, zoom);
  const fadeStart = label.maxZoom * 0.68;
  const fadeRange = Math.max(0.01, label.maxZoom - fadeStart);
  const fade = Math.max(0, Math.min(1, (label.maxZoom - safeZoom) / fadeRange));
  const baseAlpha = label.kind === 'ocean' ? 0.19 : 0.25;
  return {
    visible: safeZoom < label.maxZoom,
    alpha: baseAlpha * fade,
    scale: Math.min(1.10, Math.max(0.42, 1 / safeZoom)),
  };
}

/**
 * Simplified from Natural Earth 1:110m. The irregular bays, Ross Sea sweep and
 * Antarctic Peninsula deliberately survive simplification so the neutral
 * background reads as a continent rather than a decorative zig-zag shelf.
 */
export const ANTARCTICA_COASTLINE: readonly (readonly [number, number])[] = [
  [-180, -84.71], [-172.89, -84.06], [-148.53, -85.61], [-152.67, -82.45],
  [-146.42, -80.34], [-158.37, -76.89], [-146.10, -76.48], [-137.51, -74.73],
  [-125.40, -74.52], [-113.30, -74.03], [-102.02, -75.13], [-101.61, -72.81],
  [-90.09, -73.32], [-80.30, -73.13], [-72.83, -73.40], [-68.94, -73.01],
  [-67.37, -72.48], [-68.23, -70.46], [-68.45, -69.33], [-67.58, -68.54],
  [-66.70, -66.58], [-64.57, -65.60], [-63.63, -64.90], [-59.89, -63.96],
  [-57.81, -63.27], [-57.60, -63.86], [-61.30, -64.54], [-62.65, -65.48],
  [-62.12, -66.19], [-65.51, -67.58], [-64.78, -68.68], [-63.20, -69.23],
  [-61.51, -71.09], [-61.00, -72.77], [-60.83, -73.70], [-64.35, -75.26],
  [-68.45, -76.01], [-70.60, -76.63], [-76.93, -77.10], [-73.66, -77.91],
  [-76.50, -78.12], [-76.63, -79.89], [-71.44, -80.69], [-68.19, -81.32],
  [-58.71, -82.85], [-55.36, -82.57], [-36.27, -81.12], [-35.64, -79.46],
  [-26.16, -76.36], [-15.41, -74.11], [-9.10, -71.32], [-0.66, -71.23],
  [8.49, -70.15], [17.03, -69.91], [27.09, -70.46], [35.30, -69.01],
  [44.11, -68.27], [51.79, -66.25], [59.94, -67.41], [68.89, -67.93],
  [67.95, -71.85], [74.49, -69.78], [82.05, -67.37], [89.67, -67.15],
  [98.68, -67.11], [107.16, -66.95], [115.60, -66.70], [125.16, -66.72],
  [134.76, -66.21], [140.81, -66.82], [150.13, -68.56], [159.67, -69.99],
  [170.50, -71.40], [165.64, -74.77], [166.60, -78.32], [161.63, -81.69],
  [175.99, -84.16], [180, -84.71],
] as const;

const ANTARCTICA_SOUTHERN_OCEAN_EDGE_Y = 790;
const ANTARCTICA_POLAR_DEPTH = MAP_HEIGHT - ANTARCTICA_SOUTHERN_OCEAN_EDGE_Y - 5;

export function projectAntarcticaMapPoint(
  longitude: number,
  latitude: number,
): readonly [number, number] {
  const x = (Math.max(-180, Math.min(180, longitude)) + 180) / 360 * MAP_WIDTH;
  const normalizedSouth = Math.max(0, Math.min(1, (-60 - latitude) / 30));
  return [x, ANTARCTICA_SOUTHERN_OCEAN_EDGE_Y + normalizedSouth * ANTARCTICA_POLAR_DEPTH] as const;
}

export const ANTARCTICA_MAP_SILHOUETTE: readonly (readonly [number, number])[] = [
  ...ANTARCTICA_COASTLINE.map(([longitude, latitude]) => (
    projectAntarcticaMapPoint(longitude, latitude)
  )),
  [MAP_WIDTH, MAP_HEIGHT],
  [0, MAP_HEIGHT],
];

/** A restrained interior plane gives the neutral continent an ice-shelf read. */
export const ANTARCTICA_ICE_SHELF: readonly (readonly [number, number])[] = [
  [0, 873], [116, 860], [238, 869], [356, 841], [480, 852], [604, 833],
  [724, 847], [850, 837], [978, 854], [1094, 841], [1186, 858], [MAP_WIDTH, 846],
  [MAP_WIDTH, MAP_HEIGHT], [0, MAP_HEIGHT],
] as const;

export type AntarcticaAccessCorridor = 'south-america' | 'south-africa' | 'australia-new-zealand';

export interface AntarcticaAccessAnchor {
  id: 'drake-passage' | 'south-africa-corridor' | 'australia-new-zealand-corridor';
  corridor: AntarcticaAccessCorridor;
  /** Seaward departure point; routes must never start on a country polygon. */
  origin: readonly [number, number];
  longitude: number;
  latitude: number;
  mapPosition: readonly [number, number];
  entrySectorId: Extract<MapPolarSectorId, 'drake-entry' | 'maud-entry' | 'ross-entry'>;
}

/** The three authored approaches, including a Drake origin clear of Chile. */
export const ANTARCTICA_ACCESS_ANCHORS: readonly AntarcticaAccessAnchor[] = [
  { id: 'drake-passage', corridor: 'south-america', origin: [-67.15, -56.0], longitude: -58, latitude: -66, mapPosition: projectAntarcticaMapPoint(-58, -66), entrySectorId: 'drake-entry' },
  { id: 'south-africa-corridor', corridor: 'south-africa', origin: [18.4, -33.9], longitude: 20, latitude: -70, mapPosition: projectAntarcticaMapPoint(20, -70), entrySectorId: 'maud-entry' },
  { id: 'australia-new-zealand-corridor', corridor: 'australia-new-zealand', origin: [172.6, -43.5], longitude: 155, latitude: -72, mapPosition: projectAntarcticaMapPoint(155, -72), entrySectorId: 'ross-entry' },
] as const;
type AntarcticaCoordinate = readonly [number, number];

/**
 * Longitude-ordered political coast used by both renderers. The source coast
 * remains the visual silhouette; this restrained simplification exists so the
 * nine gameplay territories meet that silhouette without self-intersecting at
 * the South Pole in an equirectangular atlas.
 */
export const ANTARCTICA_POLITICAL_COASTLINE: readonly AntarcticaCoordinate[] = (() => {
  const binWidth = 2;
  const binCount = Math.ceil(360 / binWidth);
  const outerCoastByBin = new Map<number, AntarcticaCoordinate>();
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
  for (let longitude = -180; longitude <= 180; longitude += binWidth) {
    while (anchorIndex < anchors.length - 2 && anchors[anchorIndex + 1]![0] < longitude) {
      anchorIndex += 1;
    }
    const start = anchors[anchorIndex]!;
    const end = anchors[Math.min(anchors.length - 1, anchorIndex + 1)]!;
    const progress = Math.max(0, Math.min(
      1,
      (longitude - start[0]) / Math.max(0.001, end[0] - start[0]),
    ));
    const eased = progress * progress * (3 - 2 * progress);
    rawLatitudes.push(start[1] + (end[1] - start[1]) * eased);
  }

  const smoothedLatitudes = rawLatitudes.map((rawLatitude, index) => {
    let total = 0;
    let weightTotal = 0;
    for (let offset = -2; offset <= 2; offset += 1) {
      const sample = Math.max(0, Math.min(rawLatitudes.length - 1, index + offset));
      const weight = 3 - Math.abs(offset);
      total += rawLatitudes[sample]! * weight;
      weightTotal += weight;
    }
    // Preserve real coastal projections such as the Antarctic Peninsula. A
    // smoothing pass may soften narrow bays, but must never erase the most
    // northerly land that makes the source silhouette recognisable.
    return Math.max(rawLatitude, total / weightTotal);
  });
  return smoothedLatitudes.map((latitude, index) => [
    -180 + index * binWidth,
    Math.max(-87.5, Math.min(-61.5, latitude)),
  ] as const);
})();

function antarcticaCoastLatitude(longitude: number): number {
  const normalized = Math.max(-180, Math.min(180, longitude));
  const scaled = (normalized + 180) / 2;
  const leftIndex = Math.max(0, Math.min(
    ANTARCTICA_POLITICAL_COASTLINE.length - 1,
    Math.floor(scaled),
  ));
  const rightIndex = Math.min(ANTARCTICA_POLITICAL_COASTLINE.length - 1, leftIndex + 1);
  const progress = scaled - leftIndex;
  return ANTARCTICA_POLITICAL_COASTLINE[leftIndex]![1] * (1 - progress)
    + ANTARCTICA_POLITICAL_COASTLINE[rightIndex]![1] * progress;
}

const ANTARCTICA_DEPTH_BOUNDARIES = [0, 0.245, 0.545, 0.785, 1] as const;

function antarcticaBoundaryDepth(boundary: number, longitude: number): number {
  const base = ANTARCTICA_DEPTH_BOUNDARIES[boundary] ?? 0;
  if (boundary === 0 || boundary === ANTARCTICA_DEPTH_BOUNDARIES.length - 1) return base;
  const radians = longitude * Math.PI / 180;
  const wobble = Math.sin(radians * (boundary + 1) + boundary * 0.83) * 0.014
    + Math.sin(radians * 3 - boundary * 0.47) * 0.007;
  return Math.max(0.04, Math.min(0.96, base + wobble));
}

function antarcticaLatitudeAtBoundary(longitude: number, boundary: number): number {
  const coast = antarcticaCoastLatitude(longitude);
  const depth = antarcticaBoundaryDepth(boundary, longitude);
  return coast + (-90 - coast) * depth;
}

function splitAntarcticaLongitudeRange(
  start: number,
  end: number,
): readonly (readonly [number, number])[] {
  const ranges: Array<readonly [number, number]> = [];
  let cursor = start;
  while (cursor < end - 1e-8) {
    const wrap = Math.floor((cursor + 180) / 360);
    const seam = 180 + wrap * 360;
    const rangeEnd = Math.min(end, seam);
    ranges.push([cursor - wrap * 360, rangeEnd - wrap * 360]);
    cursor = rangeEnd;
  }
  return ranges;
}

function sampleAntarcticaBoundary(
  start: number,
  end: number,
  boundary: number,
  reverse = false,
): AntarcticaCoordinate[] {
  const span = Math.max(0, end - start);
  const steps = Math.max(1, Math.ceil(span / 2));
  const points = Array.from({ length: steps + 1 }, (_, index) => {
    const progress = index / steps;
    const longitude = start + span * progress;
    return [longitude, antarcticaLatitudeAtBoundary(longitude, boundary)] as const;
  });
  return reverse ? points.reverse() : points;
}

function antarcticaBandRings(
  longitudeStart: number,
  longitudeEnd: number,
  outerBoundary: number,
  innerBoundary: number,
): readonly (readonly AntarcticaCoordinate[])[] {
  return splitAntarcticaLongitudeRange(longitudeStart, longitudeEnd).map(([start, end]) => [
    ...sampleAntarcticaBoundary(start, end, outerBoundary),
    ...sampleAntarcticaBoundary(start, end, innerBoundary, true),
  ] as const);
}

function projectAntarcticaSectorRings(
  rings: readonly (readonly AntarcticaCoordinate[])[],
): readonly (readonly (readonly [number, number])[])[] {
  return rings.map((ring) => ring.map(([longitude, latitude]) => (
    projectAntarcticaMapPoint(longitude, latitude)
  )));
}

export interface AntarcticaSectorPresentation {
  readonly id: MapPolarSectorId;
  readonly name: string;
  readonly longitude: number;
  readonly latitude: number;
  /** One or two seam-safe country polygons clipped to the authored ice coast. */
  readonly rings: readonly (readonly AntarcticaCoordinate[])[];
  /** The exact same territory geometry in the Phaser map projection. */
  readonly mapRings: readonly (readonly (readonly [number, number])[])[];
  /** Authored strategic adjacency, used only for local border presentation. */
  readonly neighbors: readonly MapPolarSectorId[];
  readonly focusDistance: number;
}

type AntarcticaSectorAuthoring = Omit<AntarcticaSectorPresentation, 'rings' | 'mapRings'> & {
  readonly longitudeRange: readonly [number, number];
  readonly outerBoundary: number;
  readonly innerBoundary: number;
};

const ANTARCTICA_SECTOR_AUTHORING: readonly AntarcticaSectorAuthoring[] = [
  { id: 'drake-entry', name: 'Drake Beachhead', longitude: -58, latitude: -69, longitudeRange: [-120, -18], outerBoundary: 0, innerBoundary: 1, neighbors: ['weddell-forge'], focusDistance: 8.7 },
  { id: 'maud-entry', name: 'Maud Beachhead', longitude: 20, latitude: -73, longitudeRange: [-18, 92], outerBoundary: 0, innerBoundary: 1, neighbors: ['queen-maud-grid'], focusDistance: 8.7 },
  { id: 'ross-entry', name: 'Ross Beachhead', longitude: 155, latitude: -74, longitudeRange: [92, 240], outerBoundary: 0, innerBoundary: 1, neighbors: ['ross-array'], focusDistance: 8.7 },
  { id: 'weddell-forge', name: 'Weddell Forge', longitude: -48, latitude: -82, longitudeRange: [-120, -5], outerBoundary: 1, innerBoundary: 2, neighbors: ['drake-entry', 'queen-maud-grid', 'sentinel-labyrinth'], focusDistance: 8.35 },
  { id: 'queen-maud-grid', name: 'Queen Maud Grid', longitude: 42, latitude: -80, longitudeRange: [-5, 105], outerBoundary: 1, innerBoundary: 2, neighbors: ['maud-entry', 'weddell-forge', 'ross-array', 'sentinel-labyrinth', 'transantarctic-vault'], focusDistance: 8.35 },
  { id: 'ross-array', name: 'Ross Array', longitude: 148, latitude: -81, longitudeRange: [105, 240], outerBoundary: 1, innerBoundary: 2, neighbors: ['ross-entry', 'queen-maud-grid', 'transantarctic-vault'], focusDistance: 8.35 },
  { id: 'sentinel-labyrinth', name: 'Sentinel Labyrinth', longitude: -91, latitude: -85, longitudeRange: [-180, 0], outerBoundary: 2, innerBoundary: 3, neighbors: ['weddell-forge', 'queen-maud-grid', 'transantarctic-vault', 'zero-point-core'], focusDistance: 8.05 },
  { id: 'transantarctic-vault', name: 'Transantarctic Vault', longitude: 78, latitude: -85, longitudeRange: [0, 180], outerBoundary: 2, innerBoundary: 3, neighbors: ['queen-maud-grid', 'ross-array', 'sentinel-labyrinth', 'zero-point-core'], focusDistance: 8.05 },
  { id: 'zero-point-core', name: 'Zero Point Core', longitude: 0, latitude: -89, longitudeRange: [-180, 180], outerBoundary: 3, innerBoundary: 4, neighbors: ['sentinel-labyrinth', 'transantarctic-vault'], focusDistance: 7.8 },
] as const;
/** Nine immutable country-like polygons cover the full Antarctic silhouette. */
export const ANTARCTICA_SECTOR_PRESENTATIONS: readonly AntarcticaSectorPresentation[] = (
  ANTARCTICA_SECTOR_AUTHORING.map((sector) => {
    const rings = antarcticaBandRings(
      sector.longitudeRange[0],
      sector.longitudeRange[1],
      sector.outerBoundary,
      sector.innerBoundary,
    );
    return Object.freeze({
      id: sector.id,
      name: sector.name,
      longitude: sector.longitude,
      latitude: (
        antarcticaLatitudeAtBoundary(sector.longitude, sector.outerBoundary)
          + antarcticaLatitudeAtBoundary(sector.longitude, sector.innerBoundary)
      ) / 2,
      neighbors: sector.neighbors,
      focusDistance: sector.focusDistance,
      rings,
      mapRings: projectAntarcticaSectorRings(rings),
    });
  })
);

export const ANTARCTICA_SECTOR_PRESENTATION_BY_ID: ReadonlyMap<MapPolarSectorId, AntarcticaSectorPresentation> = new Map(
  ANTARCTICA_SECTOR_PRESENTATIONS.map((sector) => [sector.id, sector] as const),
);

function pointInAntarcticaSectorRing(
  longitude: number,
  latitude: number,
  ring: readonly AntarcticaCoordinate[],
): boolean {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current, current += 1) {
    const [currentLongitude, currentLatitude] = ring[current]!;
    const [previousLongitude, previousLatitude] = ring[previous]!;
    if ((currentLatitude > latitude) === (previousLatitude > latitude)) continue;
    const crossingLongitude = (previousLongitude - currentLongitude)
      * (latitude - currentLatitude) / (previousLatitude - currentLatitude)
      + currentLongitude;
    if (longitude < crossingLongitude) inside = !inside;
  }
  return inside;
}

/** Finds the exact visible political polygon with one bounded nine-sector pass. */
export function antarcticaSectorAtCoordinates(
  longitude: number,
  latitude: number,
  visibleSectorIds: ReadonlySet<MapPolarSectorId>,
): MapPolarSectorId | undefined {
  const normalizedLongitude = ((longitude + 180) % 360 + 360) % 360 - 180;
  for (const sector of ANTARCTICA_SECTOR_PRESENTATIONS) {
    if (!visibleSectorIds.has(sector.id)) continue;
    if (sector.rings.some((ring) => pointInAntarcticaSectorRing(
      normalizedLongitude,
      latitude,
      ring,
    ))) return sector.id;
  }
  return undefined;
}

/**
 * A renderer-only identity for the neutral polar research site. It deliberately
 * is not a country or territory ID, so it cannot enter ownership, war, victory
 * or integration state before the future Arctic Secrets system exists.
 */
export const ARCTIC_RESEARCH_ZONE_ID = 'arctic-research-zone' as const;
