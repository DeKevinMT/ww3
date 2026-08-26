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
} from './worldMap';

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
});
