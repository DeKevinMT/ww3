import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AUTHORED_INTERCONTINENTAL_SEA_GATEWAYS } from '../data/worldMap';
import {
  AUTHORED_NAVAL_GATEWAY_PRESENTATION_ROUTES,
  NAVAL_GATEWAY_PRESENTATION_STYLE,
  NAVAL_GATEWAY_SAMPLE_SEGMENTS,
  navalGatewayRouteEmphasized,
} from './navalGatewayPresentation';

describe('authored naval gateway presentation', () => {
  it('precomputes only the exact authored intercontinental lanes', () => {
    expect(AUTHORED_NAVAL_GATEWAY_PRESENTATION_ROUTES.map((route) => (
      [route.leftId, route.rightId]
    ))).toEqual(AUTHORED_INTERCONTINENTAL_SEA_GATEWAYS);
    for (const route of AUTHORED_NAVAL_GATEWAY_PRESENTATION_ROUTES) {
      expect(route.mapSamples).toHaveLength(NAVAL_GATEWAY_SAMPLE_SEGMENTS + 1);
      expect(route.dashedSegments.length).toBeGreaterThan(0);
      expect(route.dashedSegments.length).toBeLessThan(NAVAL_GATEWAY_SAMPLE_SEGMENTS);
      expect(route.distanceKm).toBeGreaterThan(0);
    }
  });

  it('keeps the permanent overlay understated and emphasizes endpoint context only', () => {
    expect(NAVAL_GATEWAY_PRESENTATION_STYLE.opacity).toBeLessThanOrEqual(0.22);
    expect(NAVAL_GATEWAY_PRESENTATION_STYLE.widthPx).toBeLessThanOrEqual(0.75);
    const route = AUTHORED_NAVAL_GATEWAY_PRESENTATION_ROUTES[0]!;
    expect(navalGatewayRouteEmphasized(route, undefined, undefined, undefined)).toBe(false);
    expect(navalGatewayRouteEmphasized(route, route.leftId, undefined, undefined)).toBe(true);
    expect(navalGatewayRouteEmphasized(route, undefined, route.rightId, undefined)).toBe(true);
    expect(navalGatewayRouteEmphasized(route, undefined, undefined, 'unrelated')).toBe(false);
  });

  it('uses one shared static batch per renderer and never draws regional route clutter', () => {
    const flatSource = readFileSync(new URL('./WorldMapScene.ts', import.meta.url), 'utf8');
    const globeSource = readFileSync(new URL('./three/ThreeGlobeScene.ts', import.meta.url), 'utf8');
    expect(flatSource).toContain('AUTHORED_NAVAL_GATEWAY_PRESENTATION_ROUTES');
    expect(flatSource).toContain('private drawAuthoredGatewayRoutes(): void');
    expect(flatSource).toContain('this.routeGraphics = this.add.graphics().setDepth(-6)');
    expect(globeSource).toContain('new THREE.LineSegments(geometry, material)');
    expect(globeSource).toContain('authoredIntercontinentalGatewayBatch');
    expect(globeSource).not.toContain('STRATEGIC_SEA_ROUTE_PAIRS');
    expect(flatSource).not.toContain('STRATEGIC_SEA_ROUTE_PAIRS');
    expect(globeSource).not.toMatch(/AUTHORED_NAVAL_GATEWAY_PRESENTATION_ROUTES\.map\([^)]*new THREE\.Line/);
  });
});
