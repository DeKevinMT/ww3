import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { MapTerritoryState } from './bridge';
import {
  mapOwnerPairKey,
  strategicBorderKind,
  strategicBorderThreatSignature,
} from './borderThreatPresentation';

function territory(id: string, ownerId: string, power: number): MapTerritoryState {
  return {
    id,
    ownerId,
    coreOwnerId: ownerId,
    integration: 1,
    army: { manpower: power, capacity: power, combatStrength: power, power, attack: 1, defense: 1 },
  };
}

describe('owned frontier danger presentation', () => {
  it('warns only the affected viewer frontier from canonical adjacent power', () => {
    const territories = {
      home: territory('home', 'human', 100),
      threat: territory('threat', 'enemy', 140),
      remote: territory('remote', 'other', 300),
    };
    expect(strategicBorderKind(['home', 'threat'], territories, 'human', new Set()))
      .toBe('threatened');
    expect(strategicBorderKind(['threat', 'remote'], territories, 'human', new Set()))
      .toBe('neutral');
    territories.threat.army.power = 190;
    expect(strategicBorderKind(['home', 'threat'], territories, 'human', new Set()))
      .toBe('acute');
  });

  it('lets active war red and Rogue magenta override adjacent-power warnings', () => {
    const territories = {
      home: territory('home', 'human', 100),
      threat: territory('threat', 'enemy', 220),
    };
    expect(strategicBorderKind(
      ['home', 'threat'], territories, 'human', new Set([mapOwnerPairKey('human', 'enemy')]),
    )).toBe('active-war');
    territories.threat.ownerId = 'rai';
    territories.threat.coreOwnerId = 'rai';
    expect(strategicBorderKind(['home', 'threat'], territories, 'human', new Set()))
      .toBe('rogue');
  });

  it('invalidates only when a frontier crosses a warning tier', () => {
    const territories = {
      home: territory('home', 'human', 100),
      threat: territory('threat', 'enemy', 124),
    };
    const edges = [{ territoryIds: ['home', 'threat'] }];
    const calm = strategicBorderThreatSignature(edges, territories, 'human', new Set());
    territories.threat.army.power = 130;
    const warned = strategicBorderThreatSignature(edges, territories, 'human', new Set());
    territories.threat.army.power = 150;
    expect(strategicBorderThreatSignature(edges, territories, 'human', new Set())).toBe(warned);
    expect(warned).not.toBe(calm);
  });

  it('uses the same segment-only classifier and warning grammar in 2D and 3D', () => {
    const map2d = readFileSync(new URL('./WorldMapScene.ts', import.meta.url), 'utf8');
    const globe3d = readFileSync(new URL('./three/globeBorders.ts', import.meta.url), 'utf8');
    expect(map2d).toContain('strategicBorderKind(');
    expect(map2d).toContain('this.threatenedBoundarySegments');
    expect(map2d).toContain('this.acuteBoundarySegments');
    expect(map2d).toContain('draw(this.threatenedBoundarySegments');
    expect(map2d).toContain('draw(this.acuteBoundarySegments');
    expect(globe3d).toContain('strategicBorderKind(');
    expect(globe3d).toContain('GLOBE_BORDER_COLORS.threatened');
    expect(globe3d).toContain('GLOBE_BORDER_COLORS.acute');
  });
});
