import { describe, expect, it } from 'vitest';
import {
  COUNTRIES,
  terrainProfileForTerritory,
} from '../../data/worldMap';
import type {
  MapTerritoryState,
  WorldMapEngineContract,
} from '../bridge';
import {
  buildGlobeBorderBuffer,
  buildGlobeBorderPositions,
  globeBorderOwnershipSignature,
} from './globeBorders';
import { lonLatToUnitXyz } from './globeMath';
import { terrainTextureLayerPresentation } from './terrainTexturePresentation';

type Coordinate = readonly [number, number];

function pointKey([longitude, latitude]: Coordinate): string {
  const wrappedLongitude = ((longitude + 180) % 360 + 360) % 360 - 180;
  return `${wrappedLongitude.toFixed(5)}:${latitude.toFixed(5)}`;
}

function edgeKey(start: Coordinate, end: Coordinate): string {
  const left = pointKey(start);
  const right = pointKey(end);
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

function sharedShortEdge(leftId: string, rightId: string): readonly [Coordinate, Coordinate] {
  const left = COUNTRIES.find((country) => country.id === leftId);
  const right = COUNTRIES.find((country) => country.id === rightId);
  if (!left || !right) throw new Error('Expected test countries are missing.');
  const rightEdges = new Set<string>();
  for (const ring of right.rings) {
    for (let index = 0; index < ring.length; index += 1) {
      const start = ring[index];
      const end = ring[(index + 1) % ring.length];
      if (start && end) rightEdges.add(edgeKey(start, end));
    }
  }
  for (const ring of left.rings) {
    for (let index = 0; index < ring.length; index += 1) {
      const start = ring[index];
      const end = ring[(index + 1) % ring.length];
      if (!start || !end || !rightEdges.has(edgeKey(start, end))) continue;
      const startPosition = lonLatToUnitXyz(start[0], start[1]);
      const endPosition = lonLatToUnitXyz(end[0], end[1]);
      const cosine = Math.max(-1, Math.min(1,
        startPosition.x * endPosition.x
          + startPosition.y * endPosition.y
          + startPosition.z * endPosition.z,
      ));
      if (Math.acos(cosine) <= 0.22 * Math.PI / 180) return [start, end];
    }
  }
  throw new Error(`No short shared edge found for ${leftId}:${rightId}.`);
}

function scaledPosition(coordinate: Coordinate, radius: number): readonly [number, number, number] {
  const point = lonLatToUnitXyz(coordinate[0], coordinate[1]);
  const lineRadius = radius * 1.00008;
  return [point.x * lineRadius, point.y * lineRadius, point.z * lineRadius];
}

function matchesPosition(
  positions: Float32Array,
  offset: number,
  expected: readonly [number, number, number],
): boolean {
  return Math.abs(positions[offset]! - expected[0]) < 1e-5
    && Math.abs(positions[offset + 1]! - expected[1]) < 1e-5
    && Math.abs(positions[offset + 2]! - expected[2]) < 1e-5;
}

function premultipliedTerrainBorderColor(territoryId: string): readonly [number, number, number] {
  const presentation = terrainTextureLayerPresentation(terrainProfileForTerritory(territoryId));
  return [
    ((presentation.borderColor >> 16) & 0xff) / 255 * presentation.borderAlpha,
    ((presentation.borderColor >> 8) & 0xff) / 255 * presentation.borderAlpha,
    (presentation.borderColor & 0xff) / 255 * presentation.borderAlpha,
  ];
}

function engineWithOwner(ownerFor: (territoryId: string) => string): WorldMapEngineContract {
  const territories = Object.fromEntries(COUNTRIES.map((country) => {
    const ownerId = ownerFor(country.id);
    const territory: MapTerritoryState = {
      id: country.id,
      ownerId,
      coreOwnerId: ownerId,
      integration: 1,
      army: {
        manpower: 0,
        capacity: 0,
        combatStrength: 0,
        power: 0,
        attack: 0,
        defense: 0,
      },
    };
    return [country.id, territory];
  }));

  return {
    state: {
      tick: 0,
      humanPlayerId: '',
      humanPlayerIds: [],
      openingMobilisations: {},
      territories,
      wars: [],
      logisticsMovements: [],
    },
    player: () => undefined,
    territoriesOf: () => [],
    globalRanking: () => [],
    activeWarBetween: () => undefined,
  };
}

describe('globe border geometry', () => {
  it('deduplicates shared segments and places every endpoint just above the globe', () => {
    const radius = 5;
    const { positions, colors } = buildGlobeBorderBuffer(undefined, radius);
    const rawEdgeCount = COUNTRIES.reduce((countryTotal, country) => (
      countryTotal + country.rings.reduce((ringTotal, ring) => ringTotal + ring.length, 0)
    ), 0);

    expect(positions.length).toBeGreaterThan(0);
    expect(positions.length % 6).toBe(0);
    expect(positions.length / 6).toBeLessThan(rawEdgeCount);
    expect(colors.length).toBe(positions.length);
    let minimumRadius = Number.POSITIVE_INFINITY;
    let maximumRadius = 0;
    for (let index = 0; index < positions.length; index += 3) {
      const length = Math.hypot(
        positions[index]!,
        positions[index + 1]!,
        positions[index + 2]!,
      );
      minimumRadius = Math.min(minimumRadius, length);
      maximumRadius = Math.max(maximumRadius, length);
    }
    expect(minimumRadius).toBeGreaterThan(radius * 1.00005);
    expect(maximumRadius).toBeLessThan(radius * 1.00011);
    let colorsAreBounded = true;
    let segmentEndpointsMatch = true;
    let minimumColor = 1;
    let maximumColor = 0;
    for (let offset = 0; offset < colors.length; offset += 6) {
      for (let channel = 0; channel < 3; channel += 1) {
        const startColor = colors[offset + channel]!;
        const endColor = colors[offset + channel + 3]!;
        colorsAreBounded &&= Number.isFinite(startColor) && startColor >= 0 && startColor <= 1;
        segmentEndpointsMatch &&= startColor === endColor;
        minimumColor = Math.min(minimumColor, startColor);
        maximumColor = Math.max(maximumColor, startColor);
      }
    }
    expect(colorsAreBounded).toBe(true);
    expect(segmentEndpointsMatch).toBe(true);
    expect(maximumColor).toBeGreaterThan(minimumColor);
  });

  it('bakes terrain percentage into per-vertex colors and averages a shared edge', () => {
    const radius = 5;
    const { positions, colors } = buildGlobeBorderBuffer(undefined, radius);
    const [start, end] = sharedShortEdge('bel', 'nld');
    const startPosition = scaledPosition(start, radius);
    const endPosition = scaledPosition(end, radius);
    let segmentOffset = -1;
    for (let offset = 0; offset < positions.length; offset += 6) {
      const forward = matchesPosition(positions, offset, startPosition)
        && matchesPosition(positions, offset + 3, endPosition);
      const reverse = matchesPosition(positions, offset, endPosition)
        && matchesPosition(positions, offset + 3, startPosition);
      if (forward || reverse) {
        segmentOffset = offset;
        break;
      }
    }
    expect(segmentOffset).toBeGreaterThanOrEqual(0);

    const belgium = premultipliedTerrainBorderColor('bel');
    const netherlands = premultipliedTerrainBorderColor('nld');
    const expected = belgium.map((channel, index) => (
      (channel + netherlands[index]!) / 2
    ));
    for (let channel = 0; channel < 3; channel += 1) {
      expect(colors[segmentOffset + channel]).toBeCloseTo(expected[channel]!, 6);
      expect(colors[segmentOffset + channel + 3]).toBeCloseTo(expected[channel]!, 6);
    }
  });

  it('keeps canonical borders without an engine or when every country has a distinct owner', () => {
    const canonical = buildGlobeBorderBuffer(undefined, 5);
    const distinctOwners = buildGlobeBorderBuffer(engineWithOwner((id) => id), 5);
    expect(distinctOwners.positions.length).toBe(canonical.positions.length);
    expect(distinctOwners.colors.length).toBe(canonical.colors.length);
    expect([...distinctOwners.positions.slice(0, 60)]).toEqual([...canonical.positions.slice(0, 60)]);
    expect([...distinctOwners.colors.slice(0, 60)]).toEqual([...canonical.colors.slice(0, 60)]);
  });

  it('removes only shared internal borders when territories have one owner', () => {
    const canonical = buildGlobeBorderBuffer(undefined, 5);
    const unifiedWorld = buildGlobeBorderBuffer(engineWithOwner(() => 'unified'), 5);

    expect(unifiedWorld.positions.length).toBeGreaterThan(0);
    expect(unifiedWorld.positions.length).toBeLessThan(canonical.positions.length);
    expect(unifiedWorld.colors.length).toBe(unifiedWorld.positions.length);
  });

  it('keeps the position-only compatibility helper byte-identical', () => {
    const positions = buildGlobeBorderPositions(undefined, 5);
    const buffer = buildGlobeBorderBuffer(undefined, 5);
    expect([...positions.slice(0, 120)]).toEqual([...buffer.positions.slice(0, 120)]);
    expect(positions.length).toBe(buffer.positions.length);
  });

  it('produces a stable ownership-only cache signature', () => {
    const first = engineWithOwner((id) => id);
    const second = engineWithOwner((id) => id);
    expect(globeBorderOwnershipSignature()).toBe('canonical');
    expect(globeBorderOwnershipSignature(first)).toBe(globeBorderOwnershipSignature(second));

    second.state.territories.bel!.ownerId = 'nld';
    expect(globeBorderOwnershipSignature(first)).not.toBe(globeBorderOwnershipSignature(second));
  });
});
