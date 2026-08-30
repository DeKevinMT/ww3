import {
  AUTHORED_INTERCONTINENTAL_SEA_GATEWAYS,
  countrySeaRouteDistanceKm,
  countrySeaRouteMapGeometry,
} from '../data/worldMap';
import type { TerritoryId } from '../types';
import { sampleCombatRoute, type CombatRoutePoint } from './combatPresentation';

export const NAVAL_GATEWAY_PRESENTATION_STYLE = Object.freeze({
  color: 0x527f8e,
  emphasizedColor: 0x9bd8e6,
  opacity: 0.20,
  widthPx: 0.70,
  emphasizedWidthPx: 0.92,
});

export const NAVAL_GATEWAY_SAMPLE_SEGMENTS = 48;

export interface AuthoredNavalGatewayPresentationRoute {
  readonly id: string;
  readonly leftId: TerritoryId;
  readonly rightId: TerritoryId;
  readonly distanceKm: number;
  readonly mapSamples: readonly CombatRoutePoint[];
  readonly dashedSegments: readonly (readonly [CombatRoutePoint, CombatRoutePoint])[];
}

function gatewayId(leftId: TerritoryId, rightId: TerritoryId): string {
  return [leftId, rightId].sort().join(':');
}

function buildGatewayRoute(
  leftId: TerritoryId,
  rightId: TerritoryId,
): AuthoredNavalGatewayPresentationRoute | undefined {
  const geometry = countrySeaRouteMapGeometry(leftId, rightId);
  const distanceKm = countrySeaRouteDistanceKm(leftId, rightId);
  if (!geometry || distanceKm === undefined) return undefined;
  const mapSamples = sampleCombatRoute(
    geometry.source,
    geometry.target,
    'naval',
    geometry.bendDirection,
    NAVAL_GATEWAY_SAMPLE_SEGMENTS,
  );
  const dashedSegments: Array<readonly [CombatRoutePoint, CombatRoutePoint]> = [];
  for (let index = 0; index < mapSamples.length - 1; index += 1) {
    // Two short cartographic strokes followed by one gap. Dashes are baked
    // once and shared by both renderers; no animation or per-route mesh work.
    if (index % 3 === 2) continue;
    dashedSegments.push([mapSamples[index]!, mapSamples[index + 1]!] as const);
  }
  return Object.freeze({
    id: gatewayId(leftId, rightId),
    leftId,
    rightId,
    distanceKm,
    mapSamples: Object.freeze(mapSamples.map((point) => Object.freeze({ x: point.x, y: point.y }))),
    dashedSegments: Object.freeze(dashedSegments.map(([start, end]) => Object.freeze([
      Object.freeze({ x: start.x, y: start.y }),
      Object.freeze({ x: end.x, y: end.y }),
    ] as const))),
  });
}

export const AUTHORED_NAVAL_GATEWAY_PRESENTATION_ROUTES: readonly (
  AuthoredNavalGatewayPresentationRoute
)[] = Object.freeze(AUTHORED_INTERCONTINENTAL_SEA_GATEWAYS
  .map(([leftId, rightId]) => buildGatewayRoute(leftId, rightId))
  .filter((route): route is AuthoredNavalGatewayPresentationRoute => Boolean(route)));

export function navalGatewayRouteEmphasized(
  route: Pick<AuthoredNavalGatewayPresentationRoute, 'leftId' | 'rightId'>,
  hoveredTerritoryId: string | undefined,
  sourceId: string | undefined,
  targetId: string | undefined,
): boolean {
  return route.leftId === hoveredTerritoryId || route.rightId === hoveredTerritoryId
    || route.leftId === sourceId || route.rightId === sourceId
    || route.leftId === targetId || route.rightId === targetId;
}
