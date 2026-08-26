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
  SEA_MAP_LABELS,
  seaLabelZoomPresentation,
} from './mapGeographyPresentation';

const stylesSource = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');

describe('map geography presentation', () => {
  it('covers the major strategic oceans and European seas with unique labels', () => {
    const names = new Set(SEA_MAP_LABELS.map((label) => label.name));
    for (const name of [
      'NORTH ATLANTIC OCEAN', 'NORTH PACIFIC OCEAN', 'INDIAN OCEAN',
      'NORTH SEA', 'NORWEGIAN SEA', 'BALTIC SEA', 'MEDITERRANEAN SEA', 'BLACK SEA',
    ]) expect(names.has(name)).toBe(true);
    expect(new Set(SEA_MAP_LABELS.map((label) => label.id)).size).toBe(SEA_MAP_LABELS.length);
  });

  it('keeps water labels subtle at overview and removes them before deep-map detail', () => {
    const northSea = SEA_MAP_LABELS.find((label) => label.id === 'north-sea')!;
    const overview = seaLabelZoomPresentation(northSea, 1);
    const fading = seaLabelZoomPresentation(northSea, northSea.maxZoom * 0.85);
    const deep = seaLabelZoomPresentation(northSea, northSea.maxZoom);
    expect(overview.visible).toBe(true);
    expect(overview.alpha).toBeGreaterThan(0);
    expect(overview.alpha).toBeLessThan(0.3);
    expect(fading.alpha).toBeLessThan(overview.alpha);
    expect(deep).toEqual(expect.objectContaining({ visible: false, alpha: 0 }));
  });

  it('renders a natural, visibly separated Antarctica as non-playable map-space geometry', () => {
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
      mapSceneSource.indexOf('  private createSeaLabels(): void'),
    );
    expect(antarcticaMethod).not.toContain('setInteractive');
  });

  it('reserves exactly three inactive future access corridors without creating territories', () => {
    expect(ANTARCTICA_ACCESS_ANCHORS).toHaveLength(3);
    expect(ANTARCTICA_ACCESS_ANCHORS.map((anchor) => anchor.id)).toEqual([
      'drake-passage', 'south-africa-corridor', 'australia-new-zealand-corridor',
    ]);
    expect(ANTARCTICA_ACCESS_ANCHORS.map((anchor) => anchor.corridor)).toEqual([
      'south-america', 'south-africa', 'australia-new-zealand',
    ]);
    expect(ANTARCTICA_ACCESS_ANCHORS.every((anchor) => !anchor.active)).toBe(true);
    expect(ANTARCTICA_ACCESS_ANCHORS.some((anchor) => (
      TERRITORIES.some((territory) => territory.id === anchor.id)
    ))).toBe(false);
  });

  it('wires sea labels below gameplay and fills FIT letterbox bands with ocean', () => {
    expect(mapSceneSource).toContain('this.createSeaLabels();');
    expect(mapSceneSource).toContain('.setDepth(-17)');
    expect(mapSceneSource).not.toContain("text.setInteractive");
    expect(mapSceneSource).toContain('backdrop.fillRect(-MAP_WIDTH, -MAP_HEIGHT, MAP_WIDTH * 3, MAP_HEIGHT * 3)');
    expect(stylesSource).toContain('background: linear-gradient(180deg, #071521 0%, #0a2432 100%)');
    const mobileCanvasWidth = 880;
    const expectedMobileCanvasHeight = mobileCanvasWidth * MAP_HEIGHT / MAP_WIDTH;
    expect(expectedMobileCanvasHeight).toBe(618.75);
    expect(stylesSource).toContain(`height: ${expectedMobileCanvasHeight}px !important`);
  });
});
