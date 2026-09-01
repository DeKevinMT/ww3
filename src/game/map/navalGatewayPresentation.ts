import {
  AUTHORED_INTERCONTINENTAL_SEA_GATEWAYS,
  countrySeaRouteDistanceKm,
  countrySeaRouteMapGeometry,
} from '../data/worldMap';
import type { TerritoryId } from '../types';
import { sampleCombatRoute, type CombatRoutePoint } from './combatPresentation';

export const NAVAL_GATEWAY_PRESENTATION_STYLE = Object.freeze({
  color: 0x6b9fac,
  emphasizedColor: 0xa8dce7,
  rogueColor: 0x955653,
  rogueActiveColor: 0xb9615b,
  roguePulseColor: 0xcd7a70,
  rogueEmphasizedColor: 0xd28a80,
  opacity: 0.18,
  emphasizedOpacity: 0.29,
  rogueOpacity: 0.19,
  rogueActiveOpacity: 0.23,
  activePulseOpacity: 0.035,
  widthPx: 0.64,
  emphasizedWidthPx: 0.80,
  glowWidthPx: 1.55,
  emphasizedGlowWidthPx: 1.72,
  glowOpacity: 0.055,
  emphasizedGlowOpacity: 0.085,
  rogueGlowOpacity: 0.05,
  rogueActiveGlowOpacity: 0.075,
  activePulseGlowOpacity: 0.025,
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

export type NavalGatewayRouteActivity = 'standard' | 'rogue' | 'rogue-active';

export interface NavalGatewayRouteStrategicState {
  readonly tick: number;
  readonly territories: Readonly<Record<string, { readonly ownerId: string } | undefined>>;
  readonly wars: readonly {
    readonly attackerId: string;
    readonly defenderId: string;
    readonly attackerOperations: readonly {
      readonly commanderId: string;
      readonly sourceId: string;
      readonly targetId: string;
      readonly access?: 'land' | 'naval';
    }[];
    readonly defenderOperations: readonly {
      readonly commanderId: string;
      readonly sourceId: string;
      readonly targetId: string;
      readonly access?: 'land' | 'naval';
    }[];
  }[];
  readonly logisticsMovements: readonly {
    readonly playerId: string;
    readonly sourceId: string;
    readonly targetId: string;
    readonly access?: 'land' | 'naval';
  }[];
}

export interface NavalGatewayRoutePresentationDescriptor {
  readonly activity: NavalGatewayRouteActivity;
  readonly emphasized: boolean;
  /** Fixed four-step triangle wave; identical snapshots always render identically. */
  readonly activePulse: number;
  readonly color: number;
  readonly opacity: number;
  readonly widthPx: number;
  readonly glowColor: number;
  readonly glowOpacity: number;
  readonly glowWidthPx: number;
}

function gatewayId(leftId: TerritoryId, rightId: TerritoryId): string {
  return [leftId, rightId].sort().join(':');
}

function routeMatches(
  route: Pick<AuthoredNavalGatewayPresentationRoute, 'leftId' | 'rightId'>,
  sourceId: string,
  targetId: string,
): boolean {
  return (route.leftId === sourceId && route.rightId === targetId)
    || (route.leftId === targetId && route.rightId === sourceId);
}

function mixColor(left: number, right: number, amount: number): number {
  const mixChannel = (shift: number) => Math.round(
    ((left >> shift) & 0xff) * (1 - amount) + ((right >> shift) & 0xff) * amount,
  );
  return (mixChannel(16) << 16) | (mixChannel(8) << 8) | mixChannel(0);
}

function stableRoutePhase(route: Pick<AuthoredNavalGatewayPresentationRoute, 'id'>): number {
  let hash = 0;
  for (let index = 0; index < route.id.length; index += 1) {
    hash = (hash * 31 + route.id.charCodeAt(index)) >>> 0;
  }
  return hash % 8;
}

function activeRoutePulse(
  route: Pick<AuthoredNavalGatewayPresentationRoute, 'id'>,
  tick: number,
): number {
  const step = ((Math.max(0, Math.floor(tick)) + stableRoutePhase(route)) % 8 + 8) % 8;
  return step <= 4 ? step / 4 : (8 - step) / 4;
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

export function navalGatewayRouteActivity(
  route: Pick<AuthoredNavalGatewayPresentationRoute, 'leftId' | 'rightId'>,
  state: NavalGatewayRouteStrategicState | undefined,
  roguePlayerId = 'rai',
): NavalGatewayRouteActivity {
  if (!state) return 'standard';
  const activeRogueMovement = state.logisticsMovements.some((movement) => (
    movement.playerId === roguePlayerId
      && movement.access !== 'land'
      && routeMatches(route, movement.sourceId, movement.targetId)
  ));
  const activeRogueOperation = state.wars.some((war) => (
    (war.attackerId === roguePlayerId || war.defenderId === roguePlayerId)
      && (war.attackerOperations.some((operation) => (
        operation.access !== 'land'
          && routeMatches(route, operation.sourceId, operation.targetId)
      )) || war.defenderOperations.some((operation) => (
        operation.access !== 'land'
          && routeMatches(route, operation.sourceId, operation.targetId)
      )))
  ));
  if (activeRogueMovement || activeRogueOperation) return 'rogue-active';
  return state.territories[route.leftId]?.ownerId === roguePlayerId
    || state.territories[route.rightId]?.ownerId === roguePlayerId
    ? 'rogue'
    : 'standard';
}

export function resolveNavalGatewayRoutePresentation(
  route: AuthoredNavalGatewayPresentationRoute,
  state: NavalGatewayRouteStrategicState | undefined,
  hoveredTerritoryId: string | undefined,
  sourceId: string | undefined,
  targetId: string | undefined,
): NavalGatewayRoutePresentationDescriptor {
  const activity = navalGatewayRouteActivity(route, state);
  const emphasized = navalGatewayRouteEmphasized(
    route, hoveredTerritoryId, sourceId, targetId,
  );
  const activePulse = activity === 'rogue-active'
    ? activeRoutePulse(route, state?.tick ?? 0)
    : 0;
  const color = emphasized
    ? activity === 'standard'
      ? NAVAL_GATEWAY_PRESENTATION_STYLE.emphasizedColor
      : NAVAL_GATEWAY_PRESENTATION_STYLE.rogueEmphasizedColor
    : activity === 'standard'
      ? NAVAL_GATEWAY_PRESENTATION_STYLE.color
      : activity === 'rogue'
        ? NAVAL_GATEWAY_PRESENTATION_STYLE.rogueColor
        : mixColor(
          NAVAL_GATEWAY_PRESENTATION_STYLE.rogueActiveColor,
          NAVAL_GATEWAY_PRESENTATION_STYLE.roguePulseColor,
          activePulse,
        );
  const opacity = emphasized
    ? NAVAL_GATEWAY_PRESENTATION_STYLE.emphasizedOpacity
    : activity === 'standard'
      ? NAVAL_GATEWAY_PRESENTATION_STYLE.opacity
      : activity === 'rogue'
        ? NAVAL_GATEWAY_PRESENTATION_STYLE.rogueOpacity
        : NAVAL_GATEWAY_PRESENTATION_STYLE.rogueActiveOpacity
          + NAVAL_GATEWAY_PRESENTATION_STYLE.activePulseOpacity * activePulse;
  const glowOpacity = emphasized
    ? NAVAL_GATEWAY_PRESENTATION_STYLE.emphasizedGlowOpacity
    : activity === 'standard'
      ? NAVAL_GATEWAY_PRESENTATION_STYLE.glowOpacity
      : activity === 'rogue'
        ? NAVAL_GATEWAY_PRESENTATION_STYLE.rogueGlowOpacity
        : NAVAL_GATEWAY_PRESENTATION_STYLE.rogueActiveGlowOpacity
          + NAVAL_GATEWAY_PRESENTATION_STYLE.activePulseGlowOpacity * activePulse;
  return {
    activity,
    emphasized,
    activePulse,
    color,
    opacity,
    widthPx: emphasized
      ? NAVAL_GATEWAY_PRESENTATION_STYLE.emphasizedWidthPx
      : NAVAL_GATEWAY_PRESENTATION_STYLE.widthPx,
    glowColor: color,
    glowOpacity,
    glowWidthPx: emphasized
      ? NAVAL_GATEWAY_PRESENTATION_STYLE.emphasizedGlowWidthPx
      : NAVAL_GATEWAY_PRESENTATION_STYLE.glowWidthPx,
  };
}
