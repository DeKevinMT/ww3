import { describe, expect, it } from 'vitest';
import { COUNTRIES } from '../../data/worldMap';
import { ANTARCTICA_SECTOR_PRESENTATIONS } from '../mapGeographyPresentation';
import type {
  MapTerritoryState,
  WorldMapEngineContract,
} from '../bridge';
import {
  buildGlobeBorderBuffer,
  buildGlobeBorderPositions,
  GLOBE_BORDER_COLORS,
  GLOBE_BORDER_VISUAL_INTENSITY,
  globeBorderOwnershipSignature,
} from './globeBorders';
import { lonLatToUnitXyz } from './globeMath';
import {
  GLOBE_SURFACE_CLEARANCE,
  globeOverlayRadius,
} from './globeSurfacePresentation';

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
  const lineRadius = globeOverlayRadius(radius);
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

function sharedEdgeColor(
  buffer: ReturnType<typeof buildGlobeBorderBuffer>,
  leftId: string,
  rightId: string,
  radius = 5,
): readonly [number, number, number] {
  const [start, end] = sharedShortEdge(leftId, rightId);
  const startPosition = scaledPosition(start, radius);
  const endPosition = scaledPosition(end, radius);
  for (let offset = 0; offset < buffer.positions.length; offset += 6) {
    const forward = matchesPosition(buffer.positions, offset, startPosition)
      && matchesPosition(buffer.positions, offset + 3, endPosition);
    const reverse = matchesPosition(buffer.positions, offset, endPosition)
      && matchesPosition(buffer.positions, offset + 3, startPosition);
    if (forward || reverse) return [
      buffer.colors[offset]!,
      buffer.colors[offset + 1]!,
      buffer.colors[offset + 2]!,
    ];
  }
  throw new Error(`Expected ${leftId}:${rightId} in the prepared border buffer.`);
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

function revealAntarctica(engine: WorldMapEngineContract, ownerId = 'rai'): void {
  for (const sector of ANTARCTICA_SECTOR_PRESENTATIONS) {
    engine.state.territories[sector.id] = {
      id: sector.id,
      ownerId,
      coreOwnerId: ownerId,
      integration: 1,
      army: {
        manpower: 1,
        capacity: 1,
        combatStrength: 1,
        power: 1,
        attack: 1,
        defense: 1,
      },
    };
  }
  engine.state.polarEndgame = {
    phase: 'contact',
    visualRevision: 1,
    sectors: Object.fromEntries(ANTARCTICA_SECTOR_PRESENTATIONS.map((sector) => [
      sector.id,
      { status: 'available', integrity: 100, wave: 1 },
    ])),
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
    expect(minimumRadius).toBeGreaterThan(radius);
    expect(minimumRadius).toBeCloseTo(radius + GLOBE_SURFACE_CLEARANCE, 5);
    expect(maximumRadius).toBeCloseTo(radius + GLOBE_SURFACE_CLEARANCE, 5);
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

  it('uses one neutral blue-grey for ordinary borders regardless of ownership', () => {
    const distinct = buildGlobeBorderBuffer(engineWithOwner((id) => id), 5);
    const unified = buildGlobeBorderBuffer(engineWithOwner(() => 'unified'), 5);
    const distinctColor = sharedEdgeColor(distinct, 'bel', 'nld');
    const unifiedColor = sharedEdgeColor(unified, 'bel', 'nld');
    expect(distinctColor).toEqual(unifiedColor);
    for (let channel = 0; channel < 3; channel += 1) {
      expect(distinctColor[channel]).toBeCloseTo(GLOBE_BORDER_COLORS.neutral[channel]!, 6);
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

  it('retains same-owner borders with the same neutral political grammar', () => {
    const international = buildGlobeBorderBuffer(engineWithOwner((id) => id), 5);
    const unifiedWorld = buildGlobeBorderBuffer(engineWithOwner(() => 'unified'), 5);
    const internationalColor = sharedEdgeColor(international, 'bel', 'nld');
    const internalColor = sharedEdgeColor(unifiedWorld, 'bel', 'nld');

    expect(unifiedWorld.positions.length).toBe(international.positions.length);
    expect(unifiedWorld.colors.length).toBe(unifiedWorld.positions.length);
    for (let channel = 0; channel < 3; channel += 1) {
      expect(internalColor[channel]).toBeCloseTo(internationalColor[channel]!, 6);
    }
    expect(GLOBE_BORDER_VISUAL_INTENSITY.internal).toBe(1);
  });

  it('does not turn transit or signal-purge lifecycle state into a colored border', () => {
    const unifiedEngine = engineWithOwner(() => 'unified');
    const internal = buildGlobeBorderBuffer(unifiedEngine, 5);
    unifiedEngine.state.territories.bel!.coreOwnerId = 'bel';
    unifiedEngine.state.territories.bel!.integration = 0.35;
    const integrating = buildGlobeBorderBuffer(unifiedEngine, 5);
    const internalColor = sharedEdgeColor(internal, 'bel', 'nld');
    const integratingColor = sharedEdgeColor(integrating, 'bel', 'nld');
    expect(integratingColor).toEqual(internalColor);
    unifiedEngine.state.territories.bel!.transitOnly = true;
    expect(sharedEdgeColor(buildGlobeBorderBuffer(unifiedEngine, 5), 'bel', 'nld'))
      .toEqual(internalColor);
  });

  it('marks Rogue boundaries magenta and lets an active viewer war win in red', () => {
    const engine = engineWithOwner((id) => id === 'bel' ? 'human' : id === 'nld' ? 'rai' : id);
    engine.state.humanPlayerId = 'human';
    const rogue = sharedEdgeColor(buildGlobeBorderBuffer(engine, 5), 'bel', 'nld');
    rogue.forEach((channel, index) => {
      expect(channel).toBeCloseTo(GLOBE_BORDER_COLORS.rogue[index]!, 6);
    });
    const beforeWarSignature = globeBorderOwnershipSignature(engine);
    engine.state.wars = [{
      id: 'war:human:rai', attackerId: 'human', defenderId: 'rai',
      attackerOperations: [], defenderOperations: [],
    }];
    const active = sharedEdgeColor(buildGlobeBorderBuffer(engine, 5), 'bel', 'nld');
    active.forEach((channel, index) => {
      expect(channel).toBeCloseTo(GLOBE_BORDER_COLORS.activeWar[index]!, 6);
    });
    expect(globeBorderOwnershipSignature(engine)).not.toBe(beforeWarSignature);
  });

  it('warns only the viewer frontier and escalates from amber to acute red', () => {
    const engine = engineWithOwner((id) => id === 'bel' ? 'human' : id === 'nld' ? 'enemy' : id);
    engine.state.humanPlayerId = 'human';
    engine.state.territories.bel!.army.power = 100;
    engine.state.territories.nld!.army.power = 140;
    const threatened = sharedEdgeColor(buildGlobeBorderBuffer(engine, 5), 'bel', 'nld');
    threatened.forEach((channel, index) => {
      expect(channel).toBeCloseTo(GLOBE_BORDER_COLORS.threatened[index]!, 6);
    });

    const threatenedSignature = globeBorderOwnershipSignature(engine);
    engine.state.territories.nld!.army.power = 190;
    const acute = sharedEdgeColor(buildGlobeBorderBuffer(engine, 5), 'bel', 'nld');
    acute.forEach((channel, index) => {
      expect(channel).toBeCloseTo(GLOBE_BORDER_COLORS.acute[index]!, 6);
    });
    expect(globeBorderOwnershipSignature(engine)).not.toBe(threatenedSignature);

    engine.state.territories.deu!.army.power = 1_000;
    const remote = sharedEdgeColor(buildGlobeBorderBuffer(engine, 5), 'deu', 'cze');
    remote.forEach((channel, index) => {
      expect(channel).toBeCloseTo(GLOBE_BORDER_COLORS.neutral[index]!, 6);
    });
  });

  it('keeps the position-only compatibility helper byte-identical', () => {
    const positions = buildGlobeBorderPositions(undefined, 5);
    const buffer = buildGlobeBorderBuffer(undefined, 5);
    expect([...positions.slice(0, 120)]).toEqual([...buffer.positions.slice(0, 120)]);
    expect(positions.length).toBe(buffer.positions.length);
  });

  it('keeps Antarctic political divisions visible beneath fog before and after contact', () => {
    const engine = engineWithOwner((id) => id);
    const dormant = buildGlobeBorderBuffer(engine, 5);
    revealAntarctica(engine);
    const revealed = buildGlobeBorderBuffer(engine, 5);

    expect(dormant.positions.length).toBe(revealed.positions.length);
    expect(revealed.colors.length).toBe(revealed.positions.length);

    const sameOwnerLength = revealed.positions.length;
    engine.state.territories['drake-entry']!.ownerId = 'human';
    engine.state.territories['drake-entry']!.coreOwnerId = 'rai';
    engine.state.territories['drake-entry']!.integration = 0.2;
    const conquered = buildGlobeBorderBuffer(engine, 5);
    expect(conquered.positions.length).toBe(sameOwnerLength);
  });

  it('keeps subdivided border chords above the flat surface with sub-pixel clearance', () => {
    const radius = 5;
    const { positions } = buildGlobeBorderBuffer(undefined, radius);
    let minimumSurfaceClearance = Number.POSITIVE_INFINITY;
    for (let offset = 0; offset < positions.length; offset += 6) {
      const midpointRadius = Math.hypot(
        (positions[offset]! + positions[offset + 3]!) * 0.5,
        (positions[offset + 1]! + positions[offset + 4]!) * 0.5,
        (positions[offset + 2]! + positions[offset + 5]!) * 0.5,
      );
      minimumSurfaceClearance = Math.min(
        minimumSurfaceClearance,
        midpointRadius - radius,
      );
    }
    expect(minimumSurfaceClearance).toBeGreaterThan(0.00015);
    expect(minimumSurfaceClearance).toBeLessThanOrEqual(GLOBE_SURFACE_CLEARANCE + 1e-6);
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
