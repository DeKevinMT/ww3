import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  COUNTRIES,
  MAP_HEIGHT,
  MAP_WIDTH,
  PLAYABLE_MAP_HEIGHT,
  TERRITORIES,
  projectWorldPoint,
} from '../data/worldMap';
import mapSceneSource from './WorldMapScene.ts?raw';
import {
  ANTARCTICA_ACCESS_ANCHORS,
  ANTARCTICA_COASTLINE,
  ANTARCTICA_ICE_SHELF,
  ANTARCTICA_MAP_SILHOUETTE,
  ANTARCTICA_POLITICAL_COASTLINE,
  ANTARCTICA_SECTOR_PRESENTATIONS,
  ARCTIC_RESEARCH_ZONE_ID,
  antarcticaSectorAtCoordinates,
} from './mapGeographyPresentation';

const stylesSource = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
const geographySource = readFileSync(new URL('./mapGeographyPresentation.ts', import.meta.url), 'utf8');
const globeSceneSource = readFileSync(new URL('./three/ThreeGlobeScene.ts', import.meta.url), 'utf8');
const globeTextureSource = readFileSync(new URL('./three/globeTexture.ts', import.meta.url), 'utf8');

function greatCircleCoordinate(
  start: readonly [number, number],
  end: readonly [number, number],
  progress: number,
): readonly [number, number] {
  const vector = ([longitude, latitude]: readonly [number, number]) => {
    const lon = longitude * Math.PI / 180;
    const lat = latitude * Math.PI / 180;
    return [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)] as const;
  };
  const a = vector(start);
  const b = vector(end);
  const angle = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
  const sinAngle = Math.sin(angle);
  const left = sinAngle < 1e-9 ? 1 - progress : Math.sin((1 - progress) * angle) / sinAngle;
  const right = sinAngle < 1e-9 ? progress : Math.sin(progress * angle) / sinAngle;
  const x = a[0] * left + b[0] * right;
  const y = a[1] * left + b[1] * right;
  const z = a[2] * left + b[2] * right;
  return [Math.atan2(z, x) * 180 / Math.PI, Math.atan2(y, Math.hypot(x, z)) * 180 / Math.PI];
}

function pointInRing(
  longitude: number,
  latitude: number,
  ring: readonly (readonly [number, number])[],
): boolean {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current, current += 1) {
    const [currentLon, currentLat] = ring[current]!;
    const [previousLon, previousLat] = ring[previous]!;
    if ((currentLat > latitude) === (previousLat > latitude)) continue;
    const crossingLongitude = (previousLon - currentLon) * (latitude - currentLat)
      / (previousLat - currentLat) + currentLon;
    if (longitude < crossingLongitude) inside = !inside;
  }
  return inside;
}

describe('map geography presentation', () => {
  it('has no ocean or sea name layer in either production map renderer', () => {
    for (const source of [geographySource, mapSceneSource, globeSceneSource]) {
      expect(source).not.toMatch(/SEA_MAP_LABELS|SeaMapLabel|seaLabelZoomPresentation/);
      expect(source).not.toMatch(/createSeaLabels|refreshSeaLabels|addSeaLabels/);
    }
    expect(mapSceneSource).not.toMatch(/NORTH ATLANTIC OCEAN|NORTH SEA|SOUTHERN OCEAN/);
    expect(globeSceneSource).not.toContain('globe-map__sea-label');
    expect(stylesSource).not.toContain('.globe-map__sea-label');
  });

  it('preserves the natural Antarctic ice base beneath its political territory layer', () => {
    expect(ANTARCTICA_COASTLINE.length).toBeGreaterThan(70);
    expect(ANTARCTICA_MAP_SILHOUETTE.length).toBe(ANTARCTICA_COASTLINE.length + 2);
    for (const [x, y] of ANTARCTICA_MAP_SILHOUETTE) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(MAP_WIDTH);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(MAP_HEIGHT);
    }
    expect(COUNTRIES.some((country) => country.id === 'ata' || country.name === 'Antarctica')).toBe(false);
    expect(MAP_HEIGHT).toBeGreaterThan(PLAYABLE_MAP_HEIGHT);
    const antarcticaNorthY = Math.min(...ANTARCTICA_MAP_SILHOUETTE.map((point) => point[1]));
    const playableSouthY = Math.max(...COUNTRIES.flatMap((country) => country.rings.flatMap((ring) => (
      ring.map(([longitude, latitude]) => projectWorldPoint(longitude, latitude).y)
    ))));
    expect(antarcticaNorthY - playableSouthY).toBeGreaterThan(70);
    expect(MAP_HEIGHT - antarcticaNorthY).toBeGreaterThan(95);
    expect(Math.max(...ANTARCTICA_COASTLINE.map((point) => point[1]))).toBeGreaterThan(-64);
    expect(Math.min(...ANTARCTICA_COASTLINE.map((point) => point[1]))).toBeLessThan(-85);
    expect(Math.min(...ANTARCTICA_ICE_SHELF.map((point) => point[1])))
      .toBeGreaterThan(antarcticaNorthY + 25);
    expect(mapSceneSource).toContain('this.drawAntarctica();');
    expect(mapSceneSource).toContain('.setDepth(-18.5)');
    expect(mapSceneSource).toContain('0xc3dce0');
    expect(mapSceneSource).toContain('0xe3f1f3');
    expect(mapSceneSource).toContain('A N T A R C T I C A');
    const antarcticaMethod = mapSceneSource.slice(
      mapSceneSource.indexOf('  private drawAntarctica(): void'),
      mapSceneSource.indexOf('  private refreshAntarcticaLabel(): void'),
    );
    expect(antarcticaMethod).not.toContain('setInteractive');
    expect(mapSceneSource).toContain('this.createAntarcticaTerritories();');
    expect(mapSceneSource).toContain('sector.mapRings');
    expect(mapSceneSource).toContain('setInteractive(new Phaser.Geom.Polygon(points)');
  });

  it('defines three open-sea Antarctica corridors without creating territories', () => {
    expect(ANTARCTICA_ACCESS_ANCHORS).toHaveLength(3);
    expect(ANTARCTICA_ACCESS_ANCHORS.map((anchor) => anchor.id)).toEqual([
      'drake-passage', 'south-africa-corridor', 'australia-new-zealand-corridor',
    ]);
    expect(ANTARCTICA_ACCESS_ANCHORS.map((anchor) => anchor.corridor)).toEqual([
      'south-america', 'south-africa', 'australia-new-zealand',
    ]);
    expect(ANTARCTICA_ACCESS_ANCHORS[0]?.origin).toEqual([-67.15, -56]);
    expect(ANTARCTICA_ACCESS_ANCHORS.map((anchor) => anchor.entrySectorId)).toEqual([
      'drake-entry', 'maud-entry', 'ross-entry',
    ]);
    expect(ANTARCTICA_ACCESS_ANCHORS.some((anchor) => (
      TERRITORIES.some((territory) => territory.id === anchor.id)
    ))).toBe(false);
  });

  it('keeps the complete Drake great-circle route clear of Chile and Argentina', () => {
    const drake = ANTARCTICA_ACCESS_ANCHORS[0]!;
    const southAmericanLand = COUNTRIES.filter((country) => (
      country.englishName === 'Chile' || country.englishName === 'Argentina'
    ));
    expect(southAmericanLand).toHaveLength(2);
    const intersections: Array<{ sample: number; country: string }> = [];
    for (let sample = 0; sample <= 200; sample += 1) {
      const [longitude, latitude] = greatCircleCoordinate(
        drake.origin,
        [drake.longitude, drake.latitude],
        sample / 200,
      );
      for (const country of southAmericanLand) {
        if (country.rings.some((ring) => pointInRing(longitude, latitude, ring))) {
          intersections.push({ sample, country: country.englishName });
        }
      }
    }
    expect(intersections).toEqual([]);
  });

  it('keeps all nine campaign sectors stable and analytically pickable', () => {
    expect(ANTARCTICA_SECTOR_PRESENTATIONS.map((sector) => sector.id)).toEqual([
      'drake-entry', 'maud-entry', 'ross-entry', 'weddell-forge',
      'queen-maud-grid', 'ross-array', 'sentinel-labyrinth',
      'transantarctic-vault', 'zero-point-core',
    ]);
    const visible = new Set(
      ANTARCTICA_SECTOR_PRESENTATIONS
        .filter((sector) => sector.id === 'drake-entry' || sector.id === 'zero-point-core')
        .map((sector) => sector.id),
    );
    expect(antarcticaSectorAtCoordinates(-58, -66, visible)).toBe('drake-entry');
    expect(antarcticaSectorAtCoordinates(0, -89, visible)).toBe('zero-point-core');
    expect(antarcticaSectorAtCoordinates(20, -70, visible)).toBeUndefined();
  });

  it('tessellates the complete ice silhouette into nine seam-safe country polygons', () => {
    expect(ANTARCTICA_POLITICAL_COASTLINE.length).toBeGreaterThan(150);
    expect(ANTARCTICA_POLITICAL_COASTLINE[0]?.[0]).toBe(-180);
    expect(ANTARCTICA_POLITICAL_COASTLINE.at(-1)?.[0]).toBe(180);
    expect(ANTARCTICA_SECTOR_PRESENTATIONS).toHaveLength(9);
    expect(ANTARCTICA_SECTOR_PRESENTATIONS.flatMap((sector) => sector.rings)).toHaveLength(11);

    const allVisible = new Set(ANTARCTICA_SECTOR_PRESENTATIONS.map((sector) => sector.id));
    for (const sector of ANTARCTICA_SECTOR_PRESENTATIONS) {
      expect(sector.rings.length).toBeGreaterThan(0);
      expect(sector.mapRings).toHaveLength(sector.rings.length);
      expect(antarcticaSectorAtCoordinates(
        sector.longitude,
        sector.latitude,
        allVisible,
      )).toBe(sector.id);
      for (const ring of sector.rings) {
        expect(ring.length).toBeGreaterThan(6);
        expect(ring.every(([longitude, latitude]) => (
          longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= -61
        ))).toBe(true);
      }
      for (const ring of sector.mapRings) {
        expect(ring.every(([x, y]) => (
          x >= 0 && x <= MAP_WIDTH && y >= 0 && y <= MAP_HEIGHT
        ))).toBe(true);
      }
    }

    const coastLatitude = (longitude: number): number => {
      const scaled = (longitude + 180) / 2;
      const left = Math.max(0, Math.min(
        ANTARCTICA_POLITICAL_COASTLINE.length - 1,
        Math.floor(scaled),
      ));
      const right = Math.min(ANTARCTICA_POLITICAL_COASTLINE.length - 1, left + 1);
      const progress = scaled - left;
      return ANTARCTICA_POLITICAL_COASTLINE[left]![1] * (1 - progress)
        + ANTARCTICA_POLITICAL_COASTLINE[right]![1] * progress;
    };
    for (let longitude = -177; longitude <= 177; longitude += 6) {
      const coast = coastLatitude(longitude);
      for (const depth of [0.08, 0.37, 0.67, 0.90]) {
        const latitude = coast + (-90 - coast) * depth;
        const containing = ANTARCTICA_SECTOR_PRESENTATIONS.filter((sector) => (
          sector.rings.some((ring) => pointInRing(longitude, latitude, ring))
        ));
        expect(containing, `${longitude},${latitude} must belong to exactly one sector`)
          .toHaveLength(1);
      }
    }
  });

  it('keeps the Arctic Research Zone outside canonical countries and territories', () => {
    expect(COUNTRIES.some((country) => country.id === ARCTIC_RESEARCH_ZONE_ID)).toBe(false);
    expect(TERRITORIES.some((territory) => territory.id === ARCTIC_RESEARCH_ZONE_ID)).toBe(false);
  });

  it('keeps the North Pole natural without a handmade white ice land overlay', () => {
    expect(geographySource).not.toContain('ARCTIC_ICE_COASTLINE');
    expect(globeTextureSource).not.toMatch(/drawArcticIce|traceArcticIce|#b9dde2/);
    expect(globeTextureSource).toContain('drawNaturalEarthBase(');
    expect(globeTextureSource).toContain('drawOcean(');
  });

  it('uses one universal North Pole signal site without country gateway ownership', () => {
    expect(geographySource).not.toMatch(/ARCTIC_RESEARCH_ACCESS|arcticResearchAccessTerritoriesForEmpire/);
    expect(globeSceneSource).not.toMatch(/OWN AN ARCTIC COUNTRY|GATEWAYS · CANADA/);
    expect(globeSceneSource).toContain('<strong>SIGNAL INVESTIGATION</strong>');
    expect(globeSceneSource).toContain('AVAILABLE TO EVERY COMMANDER');
    expect(globeSceneSource).toContain('new THREE.OctahedronGeometry(0.11, 1)');
  });

  it('fills FIT letterbox bands with ocean without creating water-name objects', () => {
    expect(mapSceneSource).not.toContain('this.createSeaLabels();');
    expect(mapSceneSource).not.toContain('private seaLabels');
    expect(mapSceneSource).toContain('backdrop.fillRect(-MAP_WIDTH, -MAP_HEIGHT, MAP_WIDTH * 3, MAP_HEIGHT * 3)');
    expect(stylesSource).toContain('background: linear-gradient(180deg, #071521 0%, #0a2432 100%)');
    const mobileCanvasWidth = 880;
    const expectedMobileCanvasHeight = mobileCanvasWidth * MAP_HEIGHT / MAP_WIDTH;
    expect(expectedMobileCanvasHeight).toBe(618.75);
    expect(stylesSource).toContain(`height: ${expectedMobileCanvasHeight}px !important`);
  });
});
