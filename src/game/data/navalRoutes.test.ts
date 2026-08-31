import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from '../../sim/v2/bootstrap';
import { WORLD_CONTENT_V2 } from '../../sim/v2/content';
import { selectWarAccessTypeV2 } from '../../sim/v2/selectors';
import { nationIdV2 } from '../../sim/v2/types';
import {
  AUTHORED_INTERCONTINENTAL_GATEWAY_POWER_CEILING,
  AUTHORED_INTERCONTINENTAL_SEA_GATEWAYS,
  COUNTRIES,
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
  it('authors a small deterministic intercontinental gateway set through weaker beachheads', () => {
    expect(AUTHORED_INTERCONTINENTAL_SEA_GATEWAYS).toEqual([
      ['grl', 'isl'],
      ['grl', 'gnb'],
      ['grl', 'mrt'],
      ['dom', 'guy'],
      ['gmb', 'guy'],
      ['grl', 'guy'],
      ['sle', 'sur'],
      ['mdg', 'tls'],
      ['pan', 'png'],
      ['slv', 'png'],
    ]);
    expect(AUTHORED_INTERCONTINENTAL_SEA_GATEWAYS.length).toBeLessThanOrEqual(10);
    const state = createWorldStateV2(5_713);
    for (const [leftId, rightId] of AUTHORED_INTERCONTINENTAL_SEA_GATEWAYS) {
      const left = COUNTRIES.find((country) => country.id === leftId)!;
      const right = COUNTRIES.find((country) => country.id === rightId)!;
      const distanceKm = countrySeaRouteDistanceKm(leftId, rightId)!;
      const route = countrySeaRouteMapGeometry(leftId, rightId)!;
      const reverseRoute = countrySeaRouteMapGeometry(rightId, leftId)!;
      const leftConnection = WORLD_CONTENT_V2.territories[leftId]!.connections
        .find((connection) => connection.targetId === rightId);
      const rightConnection = WORLD_CONTENT_V2.territories[rightId]!.connections
        .find((connection) => connection.targetId === leftId);

      expect(left.continent).not.toBe(right.continent);
      expect(left.powerIndex, leftId).toBeLessThanOrEqual(AUTHORED_INTERCONTINENTAL_GATEWAY_POWER_CEILING);
      expect(right.powerIndex, rightId).toBeLessThanOrEqual(AUTHORED_INTERCONTINENTAL_GATEWAY_POWER_CEILING);
      expect(isSeaConnection(leftId, rightId), `${leftId}:${rightId}`).toBe(true);
      expect(isSeaConnection(rightId, leftId), `${rightId}:${leftId}`).toBe(true);
      expect(isValidSeaRoute(leftId, rightId), `${leftId}:${rightId}`).toBe(true);
      expect(route).toBeDefined();
      expect(reverseRoute).toBeDefined();
      expect(countrySeaRouteDistanceKm(rightId, leftId)).toBeCloseTo(distanceKm, 10);
      expect(leftConnection).toMatchObject({ kind: 'sea' });
      expect(rightConnection).toMatchObject({ kind: 'sea' });
      expect(leftConnection?.distanceKm).toBeCloseTo(distanceKm, 3);
      expect(rightConnection?.distanceKm).toBeCloseTo(distanceKm, 3);
      expect(selectWarAccessTypeV2(
        state, WORLD_CONTENT_V2, nationIdV2(leftId), nationIdV2(rightId),
      )).toBe('naval');
      expect(selectWarAccessTypeV2(
        state, WORLD_CONTENT_V2, nationIdV2(rightId), nationIdV2(leftId),
      )).toBe('naval');
    }

    expect(countrySeaRouteDistanceKm('grl', 'gnb')).toBeGreaterThan(6_000);
    expect(countrySeaRouteDistanceKm('grl', 'mrt')).toBeGreaterThan(5_000);
    expect(TERRITORY_BY_ID.grl!.seaNeighbors).toEqual(expect.arrayContaining(['can', 'isl', 'gnb', 'mrt']));
    expect(TERRITORY_BY_ID.can!.seaNeighbors).toContain('grl');
  });

  it('gives Guyana three bounded weak-country sea routes without creating a major-power hub', () => {
    expect(TERRITORY_BY_ID.guy!.seaNeighbors).toEqual(['dom', 'gmb', 'grl']);
    expect(TERRITORY_BY_ID.dom!.seaNeighbors).toContain('guy');
    expect(TERRITORY_BY_ID.gmb!.seaNeighbors).toContain('guy');
    expect(TERRITORY_BY_ID.grl!.seaNeighbors).toContain('guy');

    expect(countrySeaRouteDistanceKm('guy', 'dom')).toBeGreaterThan(1_300);
    expect(countrySeaRouteDistanceKm('guy', 'dom')).toBeLessThan(3_500);
    const atlanticRouteDistances = ['gmb', 'grl'].map((neighborId) => (
      countrySeaRouteDistanceKm('guy', neighborId)!
    ));
    expect(Math.min(...atlanticRouteDistances)).toBeGreaterThan(3_000);
    expect(Math.max(...atlanticRouteDistances)).toBeLessThan(6_500);

    const weakOceanPath = ['guy', 'grl', 'gnb'] as const;
    expect(weakOceanPath.map((countryId) => (
      COUNTRIES.find((country) => country.id === countryId)!.continent
    ))).toEqual(['South America', 'North America', 'Africa']);
    expect(weakOceanPath.every((countryId) => (
      COUNTRIES.find((country) => country.id === countryId)!.powerIndex
        <= AUTHORED_INTERCONTINENTAL_GATEWAY_POWER_CEILING
    ))).toBe(true);
    for (let index = 1; index < weakOceanPath.length; index += 1) {
      expect(isSeaConnection(weakOceanPath[index - 1]!, weakOceanPath[index]!)).toBe(true);
    }

    expect(TERRITORY_BY_ID.guy!.seaNeighbors).not.toContain('usa');
    expect(TERRITORY_BY_ID.usa!.seaNeighbors).not.toContain('guy');

    const caribbeanPacificPath = ['guy', 'dom', 'pan', 'png'] as const;
    expect(caribbeanPacificPath.every((countryId) => (
      COUNTRIES.find((country) => country.id === countryId)!.powerIndex
        <= AUTHORED_INTERCONTINENTAL_GATEWAY_POWER_CEILING
    ))).toBe(true);
    for (let index = 1; index < caribbeanPacificPath.length; index += 1) {
      expect(isSeaConnection(
        caribbeanPacificPath[index - 1]!,
        caribbeanPacificPath[index]!,
      )).toBe(true);
    }
  });

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
    expect(STRATEGIC_SEA_ROUTE_PAIRS.length).toBeGreaterThan(100);
    expect(STRATEGIC_SEA_ROUTE_PAIRS.length).toBeLessThan(170);
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
    const netherlandsBritain = countrySeaRouteMapGeometry('nld', 'gbr')!;
    expectEndpointWithin(netherlandsBritain, 'source', [3, 8], [50, 54]);
    expectEndpointWithin(netherlandsBritain, 'target', [-9, 3], [49, 60]);

    const greenlandGuineaBissau = countrySeaRouteMapGeometry('grl', 'gnb')!;
    expectEndpointWithin(greenlandGuineaBissau, 'source', [-74, -12], [59, 84]);
    expectEndpointWithin(greenlandGuineaBissau, 'target', [-17, -13], [10, 13]);

    const madagascarTimor = countrySeaRouteMapGeometry('mdg', 'tls')!;
    expectEndpointWithin(madagascarTimor, 'source', [43, 51], [-26, -11]);
    expectEndpointWithin(madagascarTimor, 'target', [124, 128], [-10, -8]);

    const elSalvadorPapua = countrySeaRouteMapGeometry('slv', 'png')!;
    expectEndpointWithin(elSalvadorPapua, 'source', [-91, -87], [13, 15]);
    expectEndpointWithin(elSalvadorPapua, 'target', [140, 156], [-12, 0]);
  });

  it('keeps every non-authored route regional and major powers out of intercontinental gateways', () => {
    const gatewayKeys = new Set(AUTHORED_INTERCONTINENTAL_SEA_GATEWAYS.map((pair) => (
      [...pair].sort().join(':')
    )));
    for (const [leftId, rightId] of STRATEGIC_SEA_ROUTE_PAIRS) {
      const key = [leftId, rightId].sort().join(':');
      const left = COUNTRIES.find((country) => country.id === leftId)!;
      const right = COUNTRIES.find((country) => country.id === rightId)!;
      if (gatewayKeys.has(key)) continue;
      expect(left.continent, key).toBe(right.continent);
      expect(countrySeaRouteDistanceKm(leftId, rightId), key).toBeLessThan(6_000);
    }
    expect(AUTHORED_INTERCONTINENTAL_SEA_GATEWAYS.flat()).not.toEqual(
      expect.arrayContaining(['usa', 'chn', 'rus', 'ind']),
    );
    expect(TERRITORY_BY_ID.usa!.seaNeighbors.every((neighborId) => {
      const neighbor = COUNTRIES.find((country) => country.id === neighborId)!;
      return neighbor.continent === 'North America'
        && (countrySeaRouteDistanceKm('usa', neighborId) ?? Infinity) < 6_000;
    })).toBe(true);
    expect(isSeaConnection('usa', 'jpn')).toBe(false);
    expect(isSeaConnection('chl', 'nzl')).toBe(false);
  });

  it('keeps continents reachable while isolated coastal starts retain a local exit', () => {
    const visited = new Set<string>(['gnb']);
    const queue = ['gnb'];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const neighborId of TERRITORY_BY_ID[current]?.neighbors ?? []) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        queue.push(neighborId);
      }
    }
    const reachedContinents = new Set(COUNTRIES
      .filter((country) => visited.has(country.id))
      .map((country) => country.continent));
    expect(reachedContinents).toEqual(new Set(COUNTRIES.map((country) => country.continent)));

    const isolatedCoastalCountries = COUNTRIES.filter((country) => {
      if (LANDLOCKED_COUNTRY_IDS.has(country.id)) return false;
      const territory = TERRITORY_BY_ID[country.id]!;
      const landNeighbors = territory.neighbors.filter((neighborId) => !territory.seaNeighbors.includes(neighborId));
      return landNeighbors.length === 0;
    });
    expect(isolatedCoastalCountries.length).toBeGreaterThan(0);
    for (const country of isolatedCoastalCountries) {
      expect(TERRITORY_BY_ID[country.id]!.seaNeighbors.length, country.id).toBeGreaterThan(0);
    }
  });

  it('rejects landlocked endpoints and direct arcs blocked by third-party land', () => {
    expect(LANDLOCKED_COUNTRY_IDS.has('che')).toBe(true);
    expect(isValidSeaRoute('bel', 'che')).toBe(false);
    expect(isSeaConnection('bel', 'che')).toBe(false);
    expect(isValidSeaRoute('bel', 'ita')).toBe(false);
    expect(isSeaConnection('bel', 'ita')).toBe(false);
  });
});
