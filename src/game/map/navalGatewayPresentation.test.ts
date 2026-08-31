import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AUTHORED_INTERCONTINENTAL_SEA_GATEWAYS } from '../data/worldMap';
import {
  AUTHORED_NAVAL_GATEWAY_PRESENTATION_ROUTES,
  NAVAL_GATEWAY_PRESENTATION_STYLE,
  NAVAL_GATEWAY_SAMPLE_SEGMENTS,
  navalGatewayRouteActivity,
  navalGatewayRouteEmphasized,
  resolveNavalGatewayRoutePresentation,
  type NavalGatewayRouteStrategicState,
} from './navalGatewayPresentation';

function strategicState(
  route: (typeof AUTHORED_NAVAL_GATEWAY_PRESENTATION_ROUTES)[number],
  options: {
    readonly tick?: number;
    readonly leftOwner?: string;
    readonly rightOwner?: string;
    readonly rogueMovement?: boolean;
    readonly rogueOperation?: boolean;
  } = {},
): NavalGatewayRouteStrategicState {
  const operation = {
    commanderId: 'rai',
    sourceId: route.leftId,
    targetId: route.rightId,
    access: 'naval' as const,
  };
  return {
    tick: options.tick ?? 0,
    territories: {
      [route.leftId]: { ownerId: options.leftOwner ?? route.leftId },
      [route.rightId]: { ownerId: options.rightOwner ?? route.rightId },
    },
    wars: options.rogueOperation ? [{
      attackerId: 'rai',
      defenderId: 'bel',
      attackerOperations: [operation],
      defenderOperations: [],
    }] : [],
    logisticsMovements: options.rogueMovement ? [{
      playerId: 'rai',
      sourceId: route.rightId,
      targetId: route.leftId,
      access: 'naval',
    }] : [],
  };
}

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
    expect(NAVAL_GATEWAY_PRESENTATION_STYLE.opacity).toBeLessThan(0.20);
    expect(NAVAL_GATEWAY_PRESENTATION_STYLE.widthPx).toBeLessThan(0.70);
    expect(NAVAL_GATEWAY_PRESENTATION_STYLE.glowOpacity)
      .toBeLessThan(NAVAL_GATEWAY_PRESENTATION_STYLE.opacity);
    expect(NAVAL_GATEWAY_PRESENTATION_STYLE.glowWidthPx)
      .toBeGreaterThan(NAVAL_GATEWAY_PRESENTATION_STYLE.widthPx);
    expect(NAVAL_GATEWAY_PRESENTATION_STYLE.emphasizedOpacity).toBeLessThanOrEqual(0.30);
    const route = AUTHORED_NAVAL_GATEWAY_PRESENTATION_ROUTES[0]!;
    expect(navalGatewayRouteEmphasized(route, undefined, undefined, undefined)).toBe(false);
    expect(navalGatewayRouteEmphasized(route, route.leftId, undefined, undefined)).toBe(true);
    expect(navalGatewayRouteEmphasized(route, undefined, route.rightId, undefined)).toBe(true);
    expect(navalGatewayRouteEmphasized(route, undefined, undefined, 'unrelated')).toBe(false);
  });

  it('projects endpoint control and exact Rogue naval activity without tinting unrelated routes', () => {
    const route = AUTHORED_NAVAL_GATEWAY_PRESENTATION_ROUTES[0]!;
    expect(navalGatewayRouteActivity(route, strategicState(route))).toBe('standard');
    expect(navalGatewayRouteActivity(route, strategicState(route, {
      rightOwner: 'rai',
    }))).toBe('rogue');
    expect(navalGatewayRouteActivity(route, strategicState(route, {
      rogueMovement: true,
    }))).toBe('rogue-active');
    expect(navalGatewayRouteActivity(route, strategicState(route, {
      rogueOperation: true,
    }))).toBe('rogue-active');

    const unrelated: NavalGatewayRouteStrategicState = {
      ...strategicState(route),
      wars: [{
        attackerId: 'rai',
        defenderId: 'bel',
        attackerOperations: [{
          commanderId: 'rai', sourceId: 'unrelated-a', targetId: 'unrelated-b', access: 'naval',
        }],
        defenderOperations: [],
      }],
    };
    expect(navalGatewayRouteActivity(route, unrelated)).toBe('standard');
  });

  it('keeps Rogue red muted, selection calm, and the active pulse snapshot-deterministic', () => {
    const route = AUTHORED_NAVAL_GATEWAY_PRESENTATION_ROUTES[0]!;
    const rogue = resolveNavalGatewayRoutePresentation(
      route, strategicState(route, { leftOwner: 'rai' }), undefined, undefined, undefined,
    );
    const selected = resolveNavalGatewayRoutePresentation(
      route, strategicState(route, { leftOwner: 'rai' }), undefined, route.leftId, undefined,
    );
    const activeState = strategicState(route, { tick: 3, rogueMovement: true });
    const active = resolveNavalGatewayRoutePresentation(
      route, activeState, undefined, undefined, undefined,
    );

    expect(rogue).toMatchObject({
      activity: 'rogue',
      color: NAVAL_GATEWAY_PRESENTATION_STYLE.rogueColor,
    });
    expect(selected).toMatchObject({
      activity: 'rogue',
      emphasized: true,
      color: NAVAL_GATEWAY_PRESENTATION_STYLE.rogueEmphasizedColor,
    });
    expect(selected.opacity).toBeGreaterThan(rogue.opacity);
    expect(selected.opacity).toBeLessThanOrEqual(0.30);
    expect(active.activity).toBe('rogue-active');
    expect(active.opacity).toBeLessThanOrEqual(0.27);
    expect(resolveNavalGatewayRoutePresentation(
      route, activeState, undefined, undefined, undefined,
    )).toEqual(active);
  });

  it('uses bounded shared route batches in both renderers and never draws regional clutter', () => {
    const flatSource = readFileSync(new URL('./WorldMapScene.ts', import.meta.url), 'utf8');
    const globeSource = readFileSync(new URL('./three/ThreeGlobeScene.ts', import.meta.url), 'utf8');
    expect(flatSource).toContain('AUTHORED_NAVAL_GATEWAY_PRESENTATION_ROUTES');
    expect(flatSource).toContain('private drawAuthoredGatewayRoutes(): void');
    expect(flatSource).toContain('this.routeGraphics = this.add.graphics().setDepth(-6)');
    expect(flatSource).toContain('presentation.glowWidthPx');
    expect(globeSource).toContain('new LineSegments2(geometry, material)');
    expect(globeSource).toContain('authoredIntercontinentalGatewayBatch');
    expect(globeSource).toContain('group.userData.drawCalls = 2');
    expect(globeSource).toContain('this.updateAuthoredGatewayRouteEmphasis()');
    expect(globeSource).not.toContain('STRATEGIC_SEA_ROUTE_PAIRS');
    expect(flatSource).not.toContain('STRATEGIC_SEA_ROUTE_PAIRS');
    expect(globeSource).not.toMatch(/AUTHORED_NAVAL_GATEWAY_PRESENTATION_ROUTES\.map\([^)]*new LineSegments2/);
  });
});
