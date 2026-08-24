export type CombatAccessPresentation = 'land' | 'naval';

export interface CombatRoutePoint {
  x: number;
  y: number;
}

export interface CombatRouteSample extends CombatRoutePoint {
  tangentX: number;
  tangentY: number;
}

export interface CombatPresentationDescriptor {
  access: CombatAccessPresentation;
  routeShape: 'ground-thrust' | 'sea-arc';
  routePattern: 'solid' | 'dashed';
  marker: 'armored-chevron' | 'fleet';
  impact: 'ground-shock' | 'sea-splash';
  coreColor: number;
  glowColor: number;
  markerColor: number;
  glowWidth: number;
  coreWidth: number;
  animationCadenceMs: number;
}

const COMBAT_PRESENTATIONS: Readonly<Record<CombatAccessPresentation, CombatPresentationDescriptor>> = Object.freeze({
  land: Object.freeze({
    access: 'land',
    routeShape: 'ground-thrust',
    routePattern: 'solid',
    marker: 'armored-chevron',
    impact: 'ground-shock',
    coreColor: 0xffb45f,
    glowColor: 0xff5e52,
    markerColor: 0xffe2a3,
    glowWidth: 4.8,
    coreWidth: 1.15,
    animationCadenceMs: 130,
  }),
  naval: Object.freeze({
    access: 'naval',
    routeShape: 'sea-arc',
    routePattern: 'dashed',
    marker: 'fleet',
    impact: 'sea-splash',
    coreColor: 0x55d8ff,
    glowColor: 0x277fcb,
    markerColor: 0xd9f9ff,
    glowWidth: 3.2,
    coreWidth: 0.9,
    animationCadenceMs: 160,
  }),
});

/**
 * Renderer-side access resolution. V2 snapshots carry access explicitly, while
 * legacy/partial map snapshots can still fall back to the canonical edge kind.
 */
export function resolveCombatPresentationAccess(
  declaredAccess: string | undefined,
  seaConnection: boolean,
): CombatAccessPresentation {
  if (declaredAccess === 'naval') return 'naval';
  if (declaredAccess === 'land') return 'land';
  return seaConnection ? 'naval' : 'land';
}

export function combatPresentationDescriptor(
  access: CombatAccessPresentation,
): CombatPresentationDescriptor {
  return COMBAT_PRESENTATIONS[access];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/**
 * Deterministic point and tangent on a battle route. Land thrusts stay almost
 * direct; sea lanes bow visibly away from the ground-front visual language.
 * The caller may pass an unwrapped target x-coordinate for dateline routes.
 */
export function combatRouteSample(
  source: CombatRoutePoint,
  target: CombatRoutePoint,
  progress: number,
  access: CombatAccessPresentation,
  bendDirection = 1,
): CombatRouteSample {
  const t = clamp(progress, 0, 1);
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const bendMagnitude = access === 'naval'
    ? clamp(distance * 0.19, 12, 52)
    : clamp(distance * 0.025, 0, 6);
  const bend = bendMagnitude * (bendDirection < 0 ? -1 : 1);
  const controlX = source.x + dx * 0.5 - dy / distance * bend;
  const controlY = source.y + dy * 0.5 + dx / distance * bend;
  const inverse = 1 - t;
  return {
    x: inverse * inverse * source.x + 2 * inverse * t * controlX + t * t * target.x,
    y: inverse * inverse * source.y + 2 * inverse * t * controlY + t * t * target.y,
    tangentX: 2 * inverse * (controlX - source.x) + 2 * t * (target.x - controlX),
    tangentY: 2 * inverse * (controlY - source.y) + 2 * t * (target.y - controlY),
  };
}

export function sampleCombatRoute(
  source: CombatRoutePoint,
  target: CombatRoutePoint,
  access: CombatAccessPresentation,
  bendDirection = 1,
  segmentCount = 28,
): readonly CombatRouteSample[] {
  const segments = Math.max(4, Math.round(segmentCount));
  return Array.from({ length: segments + 1 }, (_, index) => (
    combatRouteSample(source, target, index / segments, access, bendDirection)
  ));
}

/** Moving-route progress stays away from labels at either endpoint. */
export function combatMarkerProgress(access: CombatAccessPresentation, phase: number): number {
  const normalized = ((phase % 1) + 1) % 1;
  return access === 'naval'
    ? 0.20 + normalized * 0.60
    : 0.42 + normalized * 0.34;
}

/** Convert a desired CSS-pixel combat stroke into map world units. */
export function combatWorldUnits(
  cssPixels: number,
  cameraZoom: number,
  canvasDisplayScale: number,
): number {
  const zoom = Math.max(0.000001, cameraZoom);
  const displayScale = clamp(canvasDisplayScale, 0.20, 3);
  return Math.max(0, cssPixels) / (zoom * displayScale);
}
