import type {
  MapRoguePrimeState,
} from './bridge';
import type { ApexIntelligenceVisibility } from './apexIntelligenceFog';

export const ROGUE_PRIME_RENDER_ID = 'rogue-prime';
export const ROGUE_PRIME_BEACHHEAD_ROUTE_LIMIT = 0.42;

export interface RoguePrimeMapPresentation {
  readonly visible: boolean;
  readonly routePath: readonly string[];
  /** Progress along routePath. Prime never travels deeper than the beachhead limit. */
  readonly routeProgress: number;
  readonly routeVisible: boolean;
  readonly etaTicks: number;
  readonly moving: boolean;
  readonly combatActive: boolean;
}

function finiteTick(value: number | null): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function clampedProgress(tick: number, start: number, end: number): number {
  return Math.max(0, Math.min(1, (tick - start) / Math.max(1, end - start)));
}

function primeIntelDetected(
  _prime: MapRoguePrimeState,
  visibility: ApexIntelligenceVisibility,
): boolean {
  if (!visibility.enabled) return true;
  return visibility.roguePrimeDetected;
}

/**
 * Shared 2D/3D view of the hostile elite force. The sim remains authoritative:
 * this only caps the sortie sprite at the gateway beachhead so the map never
 * claims PRIME is deep inside a target country while combat is still staged on
 * the gateway front.
 */
export function roguePrimeMapPresentation(
  prime: MapRoguePrimeState | undefined,
  tick: number,
  visibility: ApexIntelligenceVisibility,
): RoguePrimeMapPresentation {
  const renderable = Boolean(
    prime?.force && (prime.status === 'guarding' || prime.status === 'sortie'),
  );
  if (!prime?.force || !renderable || !primeIntelDetected(prime, visibility)) {
    return {
      visible: false,
      routePath: [],
      routeProgress: 0,
      routeVisible: false,
      etaTicks: 0,
      moving: false,
      combatActive: false,
    };
  }

  const force = prime.force;
  const strikeTick = finiteTick(prime.strikeTick);
  const returnTick = finiteTick(prime.returnTick);
  if (prime.status === 'sortie' && strikeTick !== undefined && tick < strikeTick) {
    const path = force.transit?.path?.length
      ? force.transit.path
      : [force.locationId, prime.gatewayId].filter((id): id is string => Boolean(id));
    const departTick = finiteTick(prime.departTick) ?? force.transit?.departTick ?? tick;
    return {
      visible: true,
      routePath: path,
      routeProgress: clampedProgress(tick, departTick, strikeTick),
      routeVisible: path.length > 1,
      etaTicks: Math.max(0, Math.ceil(strikeTick - tick)),
      moving: path.length > 1,
      combatActive: false,
    };
  }

  if (prime.status === 'sortie' && prime.gatewayId && prime.targetId
    && strikeTick !== undefined && returnTick !== undefined && tick < returnTick) {
    const outsideProgress = clampedProgress(tick, strikeTick, returnTick);
    // A restrained out-and-back sortie: reach the direct beachhead halfway,
    // then visibly withdraw. Never render a second hop or the country interior.
    const beachheadProgress = (1 - Math.abs(outsideProgress * 2 - 1))
      * ROGUE_PRIME_BEACHHEAD_ROUTE_LIMIT;
    return {
      visible: true,
      routePath: [prime.gatewayId, prime.targetId],
      routeProgress: beachheadProgress,
      routeVisible: true,
      etaTicks: Math.max(0, Math.ceil(returnTick - tick)),
      moving: true,
      combatActive: true,
    };
  }

  return {
    visible: true,
    routePath: [force.locationId],
    routeProgress: 0,
    routeVisible: false,
    etaTicks: prime.nextSortieTick === null
      ? 0 : Math.max(0, Math.ceil(prime.nextSortieTick - tick)),
    moving: false,
    combatActive: Boolean(force.front),
  };
}
