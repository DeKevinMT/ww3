import { MAP_HEIGHT, MAP_WIDTH } from '../data/worldMap';

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
  longitude: number;
  latitude: number;
  mapPosition: readonly [number, number];
  active: false;
}

/** Stable dormant hooks for a future Antarctica mode; no routes use them yet. */
export const ANTARCTICA_ACCESS_ANCHORS: readonly AntarcticaAccessAnchor[] = [
  { id: 'drake-passage', corridor: 'south-america', longitude: -63, latitude: -63, mapPosition: projectAntarcticaMapPoint(-63, -63), active: false },
  { id: 'south-africa-corridor', corridor: 'south-africa', longitude: 20, latitude: -70, mapPosition: projectAntarcticaMapPoint(20, -70), active: false },
  { id: 'australia-new-zealand-corridor', corridor: 'australia-new-zealand', longitude: 145, latitude: -68, mapPosition: projectAntarcticaMapPoint(145, -68), active: false },
] as const;
