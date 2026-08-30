import { describe, expect, it } from 'vitest';
import worldMapSceneSource from './WorldMapScene.ts?raw';

describe('flat-map political hierarchy', () => {
  it('uses one neutral border grammar across owners and internal empires', () => {
    expect(worldMapSceneSource).toContain(
      'neutral: Object.freeze({ width: 0.82, color: 0x718b96, alpha: 0.46 })',
    );
    expect(worldMapSceneSource).toContain(
      'internal: Object.freeze({ width: 0.82, color: 0x718b96, alpha: 0.46 })',
    );
    expect(worldMapSceneSource).toContain(
      'international: Object.freeze({ width: 0.82, color: 0x718b96, alpha: 0.46 })',
    );
    const perimeter = worldMapSceneSource.slice(
      worldMapSceneSource.indexOf('private drawOwnershipPerimeters'),
      worldMapSceneSource.indexOf('private createCountries'),
    );
    expect(perimeter).toContain('this.neutralBoundarySegments');
    expect(perimeter).not.toContain('this.humanBoundarySegments');
    expect(perimeter).not.toContain('0x8cf3ff');
    expect(perimeter).not.toContain('0xd6a7ff');
  });

  it('overlays machine magenta, then active-war red as the final exception', () => {
    const perimeter = worldMapSceneSource.slice(
      worldMapSceneSource.indexOf('private drawOwnershipPerimeters'),
      worldMapSceneSource.indexOf('private createCountries'),
    );
    const neutral = perimeter.indexOf('this.neutralBoundarySegments');
    const rogue = perimeter.indexOf('this.rogueBoundarySegments');
    const active = perimeter.indexOf('this.activeWarBoundarySegments');
    expect(neutral).toBeGreaterThan(0);
    expect(rogue).toBeGreaterThan(neutral);
    expect(active).toBeGreaterThan(rogue);
    expect(worldMapSceneSource).toContain(
      'rogue: Object.freeze({ width: 1.02, color: 0xc22a6b, alpha: 0.68 })',
    );
    expect(worldMapSceneSource).toContain(
      'activeWar: Object.freeze({ width: 1.34, color: 0xff4a3d, alpha: 0.92 })',
    );
  });

  it('applies the same hierarchy to Antarctic country polygons', () => {
    const antarcticStyle = worldMapSceneSource.slice(
      worldMapSceneSource.indexOf('private refreshAntarcticaTerritoryStyles'),
      worldMapSceneSource.indexOf('private refreshAntarcticaReadinessNodes'),
    );
    expect(antarcticStyle).toContain('activeWarBoundary');
    expect(antarcticStyle).toContain('rogueBoundary');
    expect(antarcticStyle).toContain('WORLD_MAP_BORDER_STYLE.neutral');
    expect(antarcticStyle).not.toContain('WORLD_MAP_BORDER_STYLE.integrating');
    expect(antarcticStyle).toContain('polarVisible || this.intelligenceVisibility.enabled');
  });

  it('does not add a separate Arctic ownership tint to the flat political map', () => {
    expect(worldMapSceneSource).not.toMatch(/ARCTIC_RESEARCH_ACCESS|arcticResearchAccessTerritoriesForEmpire/);
    expect(worldMapSceneSource).not.toMatch(/ARCTIC_(?:COUNTRY_)?(?:FILL|TINT)|drawArcticCountry/i);
  });
});
