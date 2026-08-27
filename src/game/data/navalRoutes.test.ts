import { describe, expect, it } from 'vitest';
import { WORLD_CONTENT_V2 } from '../../sim/v2/content';
import {
  LANDLOCKED_COUNTRY_IDS,
  STRATEGIC_SEA_ROUTE_PAIRS,
  TERRITORY_BY_ID,
  countrySeaRouteBendDirection,
  countrySeaRouteDistanceKm,
  countrySeaRouteMapGeometry,
  isSeaConnection,
  isValidSeaRoute,
  worldPointCoordinates,
} from './worldMap';

function expectEndpointWithin(
  route: NonNullable<ReturnType<typeof countrySeaRouteMapGeometry>>,
  endpoint: 'source' | 'target',
  longitude: readonly [number, number],
  latitude: readonly [number, number],
): void {
  const [unwrappedLongitude, actualLatitude] = worldPointCoordinates(route[endpoint]);
  const actualLongitude = ((unwrappedLongitude + 180) % 360 + 360) % 360 - 180;
  expect(actualLongitude).toBeGreaterThanOrEqual(longitude[0]);
  expect(actualLongitude).toBeLessThanOrEqual(longitude[1]);
  expect(actualLatitude).toBeGreaterThanOrEqual(latitude[0]);
  expect(actualLatitude).toBeLessThanOrEqual(latitude[1]);
}

describe('canonical naval routes', () => {
  it('keeps credible Belgian sea access without cutting across Europe', () => {
    const belgianRoutes = TERRITORY_BY_ID.bel!.seaNeighbors;
    expect(belgianRoutes).toContain('gbr');
    expect(belgianRoutes).toContain('dnk');
    expect(belgianRoutes.length).toBeGreaterThanOrEqual(3);
    expect(belgianRoutes).not.toContain('slv');
    expect(isSeaConnection('bel', 'slv')).toBe(false);
    expect(isValidSeaRoute('bel', 'slv')).toBe(false);
  });

  it('only generates symmetric, land-clear routes for coastal countries', () => {
    expect(STRATEGIC_SEA_ROUTE_PAIRS.length).toBeGreaterThan(225);
    for (const [leftId, rightId] of STRATEGIC_SEA_ROUTE_PAIRS) {
      expect(LANDLOCKED_COUNTRY_IDS.has(leftId), `${leftId}:${rightId}`).toBe(false);
      expect(LANDLOCKED_COUNTRY_IDS.has(rightId), `${leftId}:${rightId}`).toBe(false);
      expect(isValidSeaRoute(leftId, rightId), `${leftId}:${rightId}`).toBe(true);
      expect(TERRITORY_BY_ID[leftId]!.seaNeighbors, `${leftId}:${rightId}`).toContain(rightId);
      expect(TERRITORY_BY_ID[rightId]!.seaNeighbors, `${rightId}:${leftId}`).toContain(leftId);
      expect(countrySeaRouteDistanceKm(leftId, rightId)).toBeCloseTo(
        countrySeaRouteDistanceKm(rightId, leftId)!,
        10,
      );
      expect(countrySeaRouteBendDirection(leftId, rightId)).toBe(
        -countrySeaRouteBendDirection(rightId, leftId),
      );
      expect(countrySeaRouteMapGeometry(leftId, rightId)).toBeDefined();
    }
  });

  it('uses the curved canonical route distance in both gameplay directions', () => {
    for (const [leftId, rightId] of STRATEGIC_SEA_ROUTE_PAIRS) {
      const expectedDistance = countrySeaRouteDistanceKm(leftId, rightId)!;
      const leftConnection = WORLD_CONTENT_V2.territories[leftId]!.connections
        .find((connection) => connection.targetId === rightId);
      const rightConnection = WORLD_CONTENT_V2.territories[rightId]!.connections
        .find((connection) => connection.targetId === leftId);
      expect(leftConnection?.kind, `${leftId}:${rightId}`).toBe('sea');
      expect(rightConnection?.kind, `${rightId}:${leftId}`).toBe('sea');
      expect(leftConnection?.distanceKm).toBeCloseTo(expectedDistance, 3);
      expect(rightConnection?.distanceKm).toBeCloseTo(expectedDistance, 3);
    }
  });

  it('anchors routes on each canonical country principal landmass', () => {
    const franceCanada = countrySeaRouteMapGeometry('fra', 'can')!;
    expectEndpointWithin(franceCanada, 'source', [-6, 11], [41, 52]);

    const netherlandsBritain = countrySeaRouteMapGeometry('nld', 'gbr')!;
    expectEndpointWithin(netherlandsBritain, 'source', [3, 8], [50, 54]);
    expectEndpointWithin(netherlandsBritain, 'target', [-9, 3], [49, 60]);

    const unitedStatesJapan = countrySeaRouteMapGeometry('usa', 'jpn')!;
    // Mainland bounds exclude Alaska, Hawaii and other overseas islands.
    expectEndpointWithin(unitedStatesJapan, 'source', [-126, -66], [24, 50]);
    expectEndpointWithin(unitedStatesJapan, 'target', [129, 143], [30, 43]);

    const chileNewZealand = countrySeaRouteMapGeometry('chl', 'nzl')!;
    // Easter Island is near -109 degrees; the route must leave continental Chile.
    expectEndpointWithin(chileNewZealand, 'source', [-77, -65], [-57, -17]);
    expectEndpointWithin(chileNewZealand, 'target', [165, 179], [-48, -34]);
  });

  it('retains valid long-haul Pacific crossings without forcing arcs through land', () => {
    expect(isSeaConnection('usa', 'jpn')).toBe(true);
    expect(isValidSeaRoute('usa', 'jpn')).toBe(true);
    expect(countrySeaRouteMapGeometry('usa', 'jpn')).toBeDefined();
    expect(isSeaConnection('chl', 'nzl')).toBe(true);
    expect(isValidSeaRoute('chl', 'nzl')).toBe(true);
    expect(countrySeaRouteMapGeometry('chl', 'nzl')).toBeDefined();
    // The principal Australia-to-USA quadratic arc intersects Papua New Guinea;
    // it stays invalid instead of silently drawing a fleet through that landmass.
    expect(isValidSeaRoute('usa', 'aus')).toBe(false);
    expect(isSeaConnection('usa', 'aus')).toBe(false);
    expect(countrySeaRouteDistanceKm('usa', 'jpn')).toBeGreaterThan(6_000);
  });

  it('gives several coastal powers deterministic non-curated global reach', () => {
    for (const countryId of ['bra', 'chl', 'jpn', 'sen', 'zaf']) {
      const longRangeNeighbors = TERRITORY_BY_ID[countryId]!.seaNeighbors.filter((neighborId) => (
        (countrySeaRouteDistanceKm(countryId, neighborId) ?? 0) >= 6_000
      ));
      expect(longRangeNeighbors.length, countryId).toBeGreaterThan(0);
    }

    const degrees = Object.values(TERRITORY_BY_ID)
      .filter((territory) => !LANDLOCKED_COUNTRY_IDS.has(territory.id))
      .map((territory) => territory.seaNeighbors.length);
    expect(degrees.reduce((total, value) => total + value, 0) / degrees.length).toBeGreaterThan(5);
    expect(Math.max(...degrees)).toBeLessThan(40);
  });

  it('rejects landlocked endpoints and direct arcs blocked by third-party land', () => {
    expect(LANDLOCKED_COUNTRY_IDS.has('che')).toBe(true);
    expect(isValidSeaRoute('bel', 'che')).toBe(false);
    expect(isSeaConnection('bel', 'che')).toBe(false);
    expect(isValidSeaRoute('bel', 'ita')).toBe(false);
    expect(isSeaConnection('bel', 'ita')).toBe(false);
  });
});
