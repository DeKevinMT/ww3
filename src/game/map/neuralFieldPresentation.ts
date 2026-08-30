import {
  mapCommanderRecoveryLifecycleActive,
  type MapCommanderForceState,
  type WorldMapEngineContract,
} from './bridge';

export type StrategicNeuralFieldRole = 'apex' | 'rogue-prime';

export interface NeuralFieldCoverageSignatureEntry {
  readonly id: string;
  readonly role: StrategicNeuralFieldRole;
  readonly force: { readonly locationId: string };
  readonly moving: boolean;
  readonly recovering: boolean;
  /** False only while the viewer's APEX recovery lifecycle owns the force. */
  readonly fieldOperational?: boolean;
  /** Quantized in the cache key; does not change dome topology. */
  readonly fieldIntensity?: number;
}

export interface NeuralFieldRouteSignatureEntry {
  readonly id: string;
  readonly role: StrategicNeuralFieldRole;
  readonly routePath: readonly string[];
  readonly routeVisible: boolean;
}

export const NEURAL_FIELD_PULSE_DURATION_MS = 720;
export const NEURAL_FIELD_PULSE_REDUCED_MOTION_MS = 260;
export const APEX_TWIN_PROJECTION_COMBAT_SHARE = 0.6;

export const STRATEGIC_NEURAL_FIELD_STYLE = Object.freeze({
  apex: Object.freeze({
    fieldColor: 0x52e9ff,
    nodeColor: 0xd9fbff,
    fieldOpacity: 0.14,
    networkOpacity: 0.72,
    routeOpacity: 0.58,
  }),
  roguePrime: Object.freeze({
    fieldColor: 0xd92c83,
    nodeColor: 0xff8ed0,
    fieldOpacity: 0.17,
    networkOpacity: 0.76,
    routeOpacity: 0.62,
  }),
});

/**
 * Canonical render-cache key for the territory-spanning field. Fronts,
 * simulation tick and transit progress deliberately do not participate. APEX
 * integrity is quantized to 5% bands so combat damage can visibly weaken the
 * shield without rebuilding pooled buffers for numerical noise.
 */
export function neuralFieldCoverageGeometrySignature(
  entries: readonly NeuralFieldCoverageSignatureEntry[],
): string {
  return entries.map((entry) => {
    const mode = entry.moving ? 'transit'
      : entry.fieldOperational === false ? 'offline'
        : entry.recovering ? 'recovery' : 'support';
    const intensityBand = mode === 'support' || mode === 'recovery'
      ? Math.round(Math.max(0, Math.min(1, entry.fieldIntensity ?? 1)) * 20)
      : 0;
    return [
      entry.id,
      entry.role,
      entry.force.locationId,
      mode,
      `i${intensityBand}`,
    ].join(':');
  }).sort().join('|');
}

export interface ApexShieldPresentation {
  /** Canonical active-strength compatibility ratio, clamped to 0–1. */
  readonly integrity: number;
  readonly percent: number;
  /** False at zero and throughout evacuate/HQ recovery, irrespective of survivors. */
  readonly visible: boolean;
  /** Empty while unavailable so territory surfaces cannot imply protection. */
  readonly label: string;
}

/**
 * Map-only APEX identity: active manpower is shield integrity, never a troop or
 * army count. The recovery mission is the hysteresis gate, so a 0.0001 survivor
 * cannot flash the shield back before canonical operational release.
 */
export function apexShieldPresentation(
  force: Pick<MapCommanderForceState, 'mission' | 'army'> | undefined,
): ApexShieldPresentation {
  const capacityValue = force?.army.capacity ?? 0;
  const activeValue = force?.army.manpower ?? 0;
  const capacity = Number.isFinite(capacityValue) ? Math.max(0, capacityValue) : 0;
  const active = Number.isFinite(activeValue) ? Math.max(0, activeValue) : 0;
  const integrity = capacity > 0 ? Math.max(0, Math.min(1, active / capacity)) : 0;
  const percent = Math.round(integrity * 100);
  const visible = Boolean(
    force && integrity > 0 && !mapCommanderRecoveryLifecycleActive(force),
  );
  return {
    integrity,
    percent,
    visible,
    label: visible ? `APEX ${percent}%` : '',
  };
}

export interface ApexProjectionPresentation {
  readonly projection: 'primary' | 'secondary';
  readonly locationId: string;
  readonly frontTargetId: string | null;
  /** Combat/visual share; integrity always remains the one shared percentage. */
  readonly combatShare: number;
  readonly integrity: number;
  readonly percent: number;
  readonly split: boolean;
  readonly singularityCharged: boolean;
  readonly label: string;
}

/**
 * Builds at most two distinct APEX dome placements from one shared force. The
 * secondary record never carries army/economy state, so presentation cannot
 * accidentally imply a cloned shield pool or create a third projection.
 */
export function apexProjectionPresentations(
  force: MapCommanderForceState | undefined,
): readonly ApexProjectionPresentation[] {
  const shield = apexShieldPresentation(force);
  if (!force || !shield.visible) return [];
  const secondary = force.doctrineRuntime?.secondaryProjection;
  const split = Boolean(
    secondary?.locationId
      && secondary.locationId !== force.locationId,
  );
  const combatShare = split ? APEX_TWIN_PROJECTION_COMBAT_SHARE : 1;
  const singularityCharged = force.doctrineRuntime?.lancerSupportedAssaultCount === 2;
  const label = `APEX ${shield.percent}%${split ? ' · SPLIT' : ''}${singularityCharged ? ' · ◆' : ''}`;
  const primary: ApexProjectionPresentation = Object.freeze({
    projection: 'primary',
    locationId: force.locationId,
    frontTargetId: force.front,
    combatShare,
    integrity: shield.integrity,
    percent: shield.percent,
    split,
    singularityCharged,
    label,
  });
  if (!split || !secondary) return Object.freeze([primary]);
  return Object.freeze([
    primary,
    Object.freeze({
      projection: 'secondary' as const,
      locationId: secondary.locationId,
      frontTargetId: secondary.front.targetId,
      combatShare,
      integrity: shield.integrity,
      percent: shield.percent,
      split: true,
      singularityCharged,
      label,
    }),
  ]);
}

/** Geometry-only key for the flat-map transit lanes. Progress moves the signal
 * along an already-authored lane and therefore cannot trigger a route rebuild.
 */
export function neuralFieldRouteGeometrySignature(
  entries: readonly NeuralFieldRouteSignatureEntry[],
): string {
  return entries.filter((entry) => entry.routeVisible).map((entry) => [
    entry.id,
    entry.role,
    entry.routePath.join('>'),
  ].join(':')).sort().join('|');
}

export interface NeuralFieldBattleEvent {
  readonly sourceId: string;
  readonly targetId: string;
  readonly commanderAttackerId?: string | null;
  readonly commanderDefenderId?: string | null;
  readonly commanderAttackerSingularityPulse?: boolean;
  readonly commanderAttackerCounterpulseDamage?: number;
  readonly commanderDefenderCounterpulseDamage?: number;
  readonly commanderAttackerProjection?: 'primary' | 'secondary' | null;
  readonly commanderDefenderProjection?: 'primary' | 'secondary' | null;
}

export interface NeuralFieldPulseSample {
  active: boolean;
  phase: number;
  fieldScale: number;
  fieldBoost: number;
  convergenceOpacity: number;
  contactOpacity: number;
  /** Restrained Mirror Matrix signal travelling back from dome to attacker. */
  returnProgress: number;
  returnOpacity: number;
  /** Extra authored energy ring for an explicitly activated Singularity Pulse. */
  singularityOpacity: number;
}

export interface NeuralFieldPulseResolution {
  /** Territory whose surface carries the supporting digital field. */
  readonly fieldTerritoryId: string;
  readonly routeSourceId: string;
  readonly routeTargetId: string;
  /** Incoming fire terminates at the field boundary instead of on the land fill. */
  readonly interceptsIncoming: boolean;
  readonly ability: 'standard' | 'singularity' | 'mirror';
  readonly counterpulseDamage: number;
  readonly projection: 'primary' | 'secondary' | null;
}

export function createNeuralFieldPulseSample(): NeuralFieldPulseSample {
  return {
    active: false,
    phase: 0,
    fieldScale: 1,
    fieldBoost: 0,
    convergenceOpacity: 0,
    contactOpacity: 0,
    returnProgress: 0,
    returnOpacity: 0,
    singularityOpacity: 0,
  };
}

export function neuralFieldPulseDurationMs(reducedMotion: boolean): number {
  return reducedMotion
    ? NEURAL_FIELD_PULSE_REDUCED_MOTION_MS
    : NEURAL_FIELD_PULSE_DURATION_MS;
}

/**
 * A convergence pulse exists only when the canonical battle explicitly names
 * the force supporting that exact front. It cannot be manufactured by idle,
 * transit or unrelated battles.
 */
export function resolveNeuralFieldPulseTarget(
  event: NeuralFieldBattleEvent,
  controllerIds: ReadonlySet<string>,
  assignedFrontTargetId: string | null,
): NeuralFieldPulseResolution | undefined {
  if (!assignedFrontTargetId || assignedFrontTargetId !== event.targetId) return undefined;
  // Defender support lives on the attacked territory and catches the incoming
  // battle route before it reaches the political surface.
  if (event.commanderDefenderId && controllerIds.has(event.commanderDefenderId)) {
    return {
      fieldTerritoryId: event.targetId,
      routeSourceId: event.sourceId,
      routeTargetId: event.targetId,
      interceptsIncoming: true,
      ability: (event.commanderDefenderCounterpulseDamage ?? 0) > 0
        ? 'mirror' : 'standard',
      counterpulseDamage: Math.max(0, event.commanderDefenderCounterpulseDamage ?? 0),
      projection: event.commanderDefenderProjection ?? null,
    };
  }
  // Attacker support originates at the friendly source field and converges on
  // the hostile front. It must never be presented as a field on enemy land.
  if (event.commanderAttackerId && controllerIds.has(event.commanderAttackerId)) {
    return {
      fieldTerritoryId: event.sourceId,
      routeSourceId: event.sourceId,
      routeTargetId: event.targetId,
      interceptsIncoming: false,
      ability: event.commanderAttackerSingularityPulse
        ? 'singularity'
        : (event.commanderAttackerCounterpulseDamage ?? 0) > 0 ? 'mirror' : 'standard',
      counterpulseDamage: Math.max(0, event.commanderAttackerCounterpulseDamage ?? 0),
      projection: event.commanderAttackerProjection ?? null,
    };
  }
  return undefined;
}

export interface NeuralFieldRouteSegment {
  readonly segmentIndex: number;
  readonly segmentProgress: number;
}

/**
 * Deterministic canonical multi-hop sampling. The same tick progress always
 * resolves to the same leg after pause, reload or multiplayer reconnect.
 */
export function neuralFieldRouteSegment(
  progress: number,
  waypointCount: number,
): NeuralFieldRouteSegment {
  const segmentCount = Math.max(1, Math.floor(waypointCount) - 1);
  const clamped = Math.max(0, Math.min(1, progress));
  const routeProgress = clamped * segmentCount;
  const segmentIndex = Math.min(segmentCount - 1, Math.floor(routeProgress));
  return {
    segmentIndex,
    segmentProgress: segmentIndex === segmentCount - 1 && clamped === 1
      ? 1 : routeProgress - segmentIndex,
  };
}

function smoothstep(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

/** Allocation-free deterministic digital-field pulse. */
export function sampleNeuralFieldPulse(
  elapsedMs: number,
  reducedMotion: boolean,
  output: NeuralFieldPulseSample,
): NeuralFieldPulseSample {
  const duration = neuralFieldPulseDurationMs(reducedMotion);
  const phase = Math.max(0, Math.min(1, elapsedMs / duration));
  const active = elapsedMs >= 0 && elapsedMs < duration;
  output.active = active;
  output.phase = phase;
  if (!active) {
    output.fieldScale = 1;
    output.fieldBoost = 0;
    output.convergenceOpacity = 0;
    output.contactOpacity = 0;
    output.returnProgress = 0;
    output.returnOpacity = 0;
    output.singularityOpacity = 0;
    return output;
  }

  const gather = smoothstep(phase / 0.24) * (1 - smoothstep((phase - 0.62) / 0.28));
  const convergeIn = smoothstep((phase - 0.12) / 0.12);
  const convergeOut = 1 - smoothstep((phase - 0.54) / 0.16);
  const contactAge = Math.max(0, (phase - 0.34) / 0.34);
  output.fieldScale = 1 - gather * 0.08;
  output.fieldBoost = gather;
  output.convergenceOpacity = convergeIn * convergeOut;
  output.contactOpacity = contactAge > 0 ? 1 - smoothstep(contactAge) : 0;
  const returnAge = Math.max(0, (phase - 0.40) / 0.46);
  output.returnProgress = smoothstep(returnAge);
  output.returnOpacity = returnAge > 0
    ? smoothstep(returnAge / 0.18) * (1 - smoothstep((returnAge - 0.72) / 0.28))
    : 0;
  output.singularityOpacity = smoothstep(phase / 0.16)
    * (1 - smoothstep((phase - 0.68) / 0.25));
  return output;
}

export interface NeuralFieldModePresentation {
  readonly fieldVisible: boolean;
  readonly routeVisible: boolean;
  readonly signalNodeVisible: boolean;
  readonly recoveryField: boolean;
  readonly intensity: number;
}

export function neuralFieldModePresentation(
  inTransit: boolean,
  recovering = false,
  fieldOperational = true,
): NeuralFieldModePresentation {
  if (inTransit) return {
    fieldVisible: false,
    routeVisible: true,
    signalNodeVisible: true,
    recoveryField: false,
    intensity: 0.82,
  };
  if (!fieldOperational) return {
    fieldVisible: false,
    routeVisible: false,
    signalNodeVisible: false,
    recoveryField: false,
    intensity: 0,
  };
  return {
    fieldVisible: true,
    routeVisible: false,
    signalNodeVisible: false,
    recoveryField: recovering,
    intensity: recovering ? 0.38 : 1,
  };
}

/** Height of a spoke rising from the border foot (0) to the cap crown (1). */
export function neuralDomeSpokeElevation(
  domeHeight: number,
  progress: number,
): number {
  const clamped = Math.max(0, Math.min(1, progress));
  return Math.max(0, domeHeight) * Math.sin(clamped * Math.PI * 0.5);
}

/** Outer shell height at an angular distance from the cap centre. */
export function neuralDomeShellElevation(
  domeHeight: number,
  normalizedAngularDistance: number,
): number {
  const clamped = Math.max(0, Math.min(1, normalizedAngularDistance));
  return Math.max(0, domeHeight) * Math.cos(clamped * Math.PI * 0.5);
}

/**
 * One presentation gate shared by the atlas, true dome, map badges and battle
 * interception. The V2 adapter projects the canonical viewer transmission;
 * an unidentified legacy adapter can only opt in once that human is at war.
 */
export function apexFieldPresentationActive(
  engine: Pick<WorldMapEngineContract, 'content' | 'viewerKnowledge' | 'state'>,
): boolean {
  if (engine.content?.metadata?.scenarioId !== 'standard-2026') return true;
  if (engine.viewerKnowledge?.apexFieldActivated !== undefined) {
    return engine.viewerKnowledge.apexFieldActivated;
  }
  const viewerId = engine.state.humanPlayerId;
  return engine.state.wars.some((war) => (
    war.attackerId === viewerId || war.defenderId === viewerId
  ));
}
