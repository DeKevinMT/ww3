/**
 * Renderer-only contracts. The map intentionally deals in plain string IDs at
 * the static world-data boundary and never imports simulation implementation.
 */
export interface MapArmyState {
  manpower: number;
  capacity: number;
  /**
   * Effective local deployment ceiling, including the bounded share of empire
   * support available to this territory. Falls back to capacity for legacy
   * snapshots and non-V2 render adapters.
   */
  deploymentCapacity?: number;
  /** Deployed soldiers available to the local force, in millions. */
  combatStrength: number;
  /** Exact local Combat Power, including deployed strength and per-soldier quality. */
  power: number;
  attack: number;
  defense: number;
}

export interface MapTerritoryState {
  id: string;
  ownerId: string;
  /** Political homeland identity retained while a conquest is integrating. */
  coreOwnerId: string;
  /** Share of local population, output and military capacity unlocked for the owner. */
  integration: number;
  /** Fixed calendar endpoint for an active integration program. */
  integrationCompletesTick?: number;
  /** Survival land that is held only as a logistics corridor, never integrated. */
  transitOnly?: boolean;
  army: MapArmyState;
}

export function mapTerritoryIsIntegrating(
  territory: Pick<MapTerritoryState, 'ownerId' | 'coreOwnerId' | 'integration' | 'transitOnly'>,
): boolean {
  return territory.transitOnly !== true
    && territory.coreOwnerId !== territory.ownerId
    && territory.integration < 0.999999;
}

/** Renderer-only projection of the human 20-year opening Army + cap curve. */
export interface MapOpeningMobilisationState {
  playerId: string;
  /** Share of the temporary opening effect still active: 1 at start, 0 at expiry. */
  remainingRatio: number;
  initialMultiplier: number;
  currentMultiplier: number;
  remainingTicks: number;
  direction: 'boost' | 'limit';
}

export interface MapNationView {
  id: string;
  name: string;
  color: number;
  cssColor: string;
  sigil: string;
  capitalId: string;
  isHuman: boolean;
  /** Account-wide world flag used for this human empire; defaults to `id`. */
  flagCountryId?: string;
  /** Multiplayer display name; omitted for AI nations and legacy saves. */
  controllerName?: string;
}

export interface MapFrontOperation {
  commanderId: string;
  sourceId: string;
  targetId: string;
  doctrine: string;
  /** Land contact or a naval sea lane. Optional only for legacy snapshots. */
  access?: 'land' | 'naval';
  momentum: number;
  supply?: number;
}

export interface MapWarState {
  id: string;
  attackerId: string;
  defenderId: string;
  attackerOperations: readonly MapFrontOperation[];
  defenderOperations: readonly MapFrontOperation[];
}

export interface MapBattleEvent {
  sourceId: string;
  targetId: string;
  attackerId: string;
  defenderId: string;
  attackerLosses?: number;
  defenderLosses?: number;
  /** Effective committed attack power; optional for legacy renderer events. */
  attackerPower?: number;
  /** Explicit canonical APEX participants. Missing only on legacy battle events. */
  commanderAttackerId?: string | null;
  commanderDefenderId?: string | null;
  /** Explicit APEX ability provenance; renderers must never infer these from deltas. */
  commanderAttackerSingularityPulse?: boolean;
  commanderAttackerCounterpulseDamage?: number;
  commanderDefenderCounterpulseDamage?: number;
  commanderAttackerProjection?: 'primary' | 'secondary' | null;
  commanderDefenderProjection?: 'primary' | 'secondary' | null;
  commanderAttackerProjectionShare?: number;
  commanderDefenderProjectionShare?: number;
  conquered: boolean;
  operation: string;
}

export interface MapLogisticsMovement {
  playerId: string;
  sourceId: string;
  targetId: string;
  manpower: number;
  capacity: number;
  /** Exact route kind when supplied by V2; omitted only by legacy adapters. */
  access?: 'land' | 'naval';
}

/**
 * Render-only view of a player's non-territorial APEX neural dome. The
 * simulation owns integrity, energy, combat and autonomy; the map only needs
 * enough information to place its field, draw its itinerary and explain state.
 */
export interface MapCommanderForceState {
  readonly playerId: string;
  /** Explicit visual identity; legacy projections may omit it and render as APEX. */
  readonly role?: 'apex' | 'rogue-prime';
  readonly headquartersId: string;
  readonly locationId: string;
  readonly mission: string;
  readonly front: string | null;
  readonly shield: {
    readonly integrity: number;
    readonly maxIntegrity: number;
    readonly rechargeBuffer: number;
    readonly rechargeMultiplier: number;
    readonly attackMultiplier: number;
    readonly defenseMultiplier: number;
    readonly pulseAttack: number;
  };
  readonly economy: {
    readonly treasury: number;
    readonly annualOutput: number;
    readonly supplyStock: number;
  };
  readonly transit: {
    readonly path: readonly string[];
    readonly departTick: number;
    readonly arriveTick: number;
  } | null;
  /** Canonical distributed-network projection; absent on legacy adapters. */
  readonly empireShield?: {
    readonly active: boolean;
    readonly operationalState: 'operational' | 'recharging' | 'unavailable';
    readonly integrityCurrent: number;
    readonly integrityMax: number;
    readonly integrityPercent: number;
    readonly attackMultiplier: number;
    readonly defenseMultiplier: number;
    readonly pulseAttack: number;
    readonly supportBonusPercent: number;
    readonly coverageTerritoryIds: readonly string[];
    readonly activeFrontTerritoryIds: readonly string[];
    readonly fronts: readonly {
      readonly warId: string;
      readonly sourceId: string;
      readonly targetId: string;
      readonly friendlyTerritoryId: string;
      readonly hostileTerritoryId: string;
      readonly mission: 'assault-support' | 'defense';
      readonly allocationShare: number;
    }[];
  };
  /** Retired location-bound NEXUS sidecar, read only while migrating old saves. */
  readonly doctrineRuntime?: {
    readonly lancerSupportedAssaultCount: number;
    readonly secondaryProjection: {
      readonly locationId: string;
      readonly mission: 'assault-support' | 'defense';
      readonly front: {
        readonly warId: string;
        readonly sourceId: string;
        readonly targetId: string;
      };
    } | null;
  };
}

/**
 * Canonical renderer view of the APEX recovery lifecycle. The simulation keeps
 * an extracted force in one of these missions until its complete operational
 * readiness gate is satisfied, so renderers must not infer availability from a
 * partially refilled integrity buffer.
 */
export function mapCommanderRecoveryLifecycleActive(
  force: Pick<MapCommanderForceState, 'mission'>,
): boolean {
  return force.mission === 'evacuate' || force.mission === 'hq-training';
}

export function mapCommanderTransitProgress(
  force: Pick<MapCommanderForceState, 'transit'>,
  tick: number,
): number {
  const transit = force.transit;
  if (!transit) return 1;
  const duration = Math.max(1, transit.arriveTick - transit.departTick);
  return Math.max(0, Math.min(1, (tick - transit.departTick) / duration));
}

export function mapCommanderTransitEta(
  force: Pick<MapCommanderForceState, 'transit'>,
  tick: number,
): number {
  return force.transit ? Math.max(0, Math.ceil(force.transit.arriveTick - tick)) : 0;
}

export type MapPolarRegion = 'arctic' | 'antarctica';

export type MapPolarEndgamePhase =
  | 'dormant'
  | 'arctic-research'
  | 'warning'
  | 'contact'
  | 'counteroffensive'
  | 'core-exposed'
  | 'victory';

export type MapPolarSectorId =
  | 'drake-entry'
  | 'maud-entry'
  | 'ross-entry'
  | 'weddell-forge'
  | 'queen-maud-grid'
  | 'ross-array'
  | 'sentinel-labyrinth'
  | 'transantarctic-vault'
  | 'zero-point-core';

export type MapPolarSectorStatus = 'hidden' | 'available' | 'contested' | 'secured';

export type MapRogueAttentionStage =
  | 'disabled'
  | 'dormant'
  | 'observing'
  | 'mobilising'
  | 'breach-imminent'
  | 'active';

export interface MapPolarSectorState {
  readonly status: MapPolarSectorStatus;
  readonly integrity: number;
  readonly wave: number;
  readonly discoveredTick?: number;
  readonly securedTick?: number;
  readonly securedBy?: string;
}

/**
 * Small render-facing projection of the canonical polar campaign. Additional
 * simulation fields can be present without coupling the Three.js adapter to
 * research, combat or persistence implementation details.
 */
export interface MapPolarEndgameSnapshot {
  readonly phase: MapPolarEndgamePhase;
  readonly visualRevision: number;
  readonly sectors: Readonly<Partial<Record<MapPolarSectorId, MapPolarSectorState>>>;
  /** Optional on legacy adapters; Survival is treated as awake without it. */
  readonly rogueAttention?: { readonly stage: MapRogueAttentionStage };
  readonly expeditions?: readonly {
    readonly playerId: string;
    readonly sectorId: MapPolarSectorId;
    readonly manpower: number;
    readonly initialManpower: number;
  }[];
  /** Hostile elite sidecar; never mixed into the human-only commander roster. */
  readonly roguePrime?: MapRoguePrimeState;
}

export type MapRoguePrimeStatus =
  | 'dormant'
  | 'guarding'
  | 'sortie'
  | 'rebuilding'
  | 'destroyed';

export interface MapRoguePrimeState {
  readonly status: MapRoguePrimeStatus;
  readonly force: MapCommanderForceState | null;
  readonly sortieSequence: number;
  readonly nextSortieTick: number | null;
  readonly gatewayId: MapPolarSectorId | null;
  readonly targetId: string | null;
  readonly departTick: number | null;
  readonly strikeTick: number | null;
  readonly returnTick: number | null;
  readonly rebuildReadyTick: number | null;
}

/**
 * Viewer-local map knowledge. This projection is deliberately outside the
 * canonical simulation snapshot: account dossiers may differ per client and
 * must never enter saves, deterministic hashes or multiplayer replication.
 */
export interface MapViewerKnowledge {
  /** Static account dossiers. These are not permission to read live world state. */
  readonly chartedTerritoryIds: readonly string[];
  /** Canonical Campaign Stage-I state projected for the local viewer. */
  readonly communicationsBlackoutActive?: boolean;
  readonly communicationsBlackoutTick?: number | null;
  /**
   * True only when this renderer was already alive before the viewer confirmed
   * the blackout briefing. Loaded/reconnected timelines start settled instead
   * of replaying the presentation transition.
   */
  readonly communicationsBlackoutAnimateActivation?: boolean;
  /**
   * Viewer-specific narrative gate for the autonomous APEX field. Campaign
   * keeps the shield invisible through the peaceful prologue; other modes
   * expose it immediately. This is presentation knowledge, never save state.
   */
  readonly apexFieldActivated?: boolean;
  /**
   * Viewer-local Stage-IV APEX capability. This may reveal ROGUE PRIME and
   * its authored sortie line, but never promotes the underlying terrain to
   * exact live intelligence.
   */
  readonly roguePrimeTracking?: boolean;
  /** Optional viewer-specific detections; never derive these from another human seat. */
  readonly detectedTerritoryIds?: readonly string[];
}

export interface WorldMapEngineContract {
  /** Optional scenario metadata exposed by V2; legacy adapters default to serious fog rules. */
  readonly content?: {
    readonly metadata?: { readonly scenarioId?: string };
    readonly territories?: Readonly<Record<string, {
      readonly connections: readonly { readonly targetId: string }[];
    }>>;
  };
  /** Render-local knowledge; absent on legacy adapters. */
  readonly viewerKnowledge?: MapViewerKnowledge;
  readonly state: {
    tick: number;
    humanPlayerId: string;
    humanPlayerIds: readonly string[];
    /** Human players only; absent entries have no active opening phase. */
    openingMobilisations: Readonly<Record<string, MapOpeningMobilisationState>>;
    territories: Record<string, MapTerritoryState>;
    wars: readonly MapWarState[];
    logisticsMovements: readonly MapLogisticsMovement[];
    /** Optional while a legacy save is being migrated. */
    commanderForces?: Readonly<Record<string, MapCommanderForceState>>;
    /** Optional until a legacy save or adapter has materialised polar state. */
    polarEndgame?: MapPolarEndgameSnapshot;
  };
  player(playerId: string): MapNationView | undefined;
  territoriesOf(playerId: string): MapTerritoryState[];
  globalRanking(): readonly { player: MapNationView; score: number }[];
  totalManpower?(playerId: string): { deployed: number; capacity: number };
  activeWarBetween(leftId: string, rightId: string): unknown;
  /** Materialise one stable renderer snapshot immediately before a scene sync. */
  refreshSnapshot?(): void;
  /** Bypass the peaceful map-stat cadence for the owners of these territories. */
  invalidateMapStats?(territoryIds: readonly string[]): void;
}

export interface MapSelectionState {
  sourceId?: string;
  targetId?: string;
  legalTargetIds: readonly string[];
  /** Quiet strategic hints; unlike legalTargetIds these never dim the rest of the map. */
  hintTargetIds?: readonly string[];
}

export interface MapSceneAdapter {
  sync(engine: WorldMapEngineContract): void;
  setSelection(selection: MapSelectionState): void;
  setInputBlocked?(blocked: boolean): void;
  focusAction(sourceId?: string, targetId?: string): void;
  focusCountry?(territoryId: string): void;
  focusCommanderForce?(playerId: string): void;
  focusPolarRegion?(region: MapPolarRegion): void;
  focusPolarSector?(sectorId: MapPolarSectorId): void;
  clearPolarFocus?(): void;
  territoryScreenPosition?(territoryId: string): { x: number; y: number } | undefined;
  playBattle(result: MapBattleEvent): void;
  resetCamera(): void;
}

class MapBridge {
  engine?: WorldMapEngineContract;
  scene?: MapSceneAdapter;
  selection: MapSelectionState = { legalTargetIds: [] };
  onTerritoryClick?: (territoryId: string) => void;
  onTerritoryHover?: (territoryId: string | undefined, clientX: number, clientY: number) => void;
  onPolarRegionClick?: (region: MapPolarRegion) => void;
  onPolarSectorClick?: (sectorId: MapPolarSectorId) => void;
  private inputBlocked = false;

  attach(scene: MapSceneAdapter): void {
    this.scene = scene;
    if (this.engine) {
      this.engine.refreshSnapshot?.();
      scene.sync(this.engine);
    }
    scene.setSelection(this.selection);
    scene.setInputBlocked?.(this.inputBlocked);
  }

  sync(): void {
    if (this.engine && this.scene) {
      this.engine.refreshSnapshot?.();
      this.scene.sync(this.engine);
    }
  }

  setSelection(selection: MapSelectionState): void {
    const focusChanged = selection.sourceId !== this.selection.sourceId
      || selection.targetId !== this.selection.targetId;
    this.selection = selection;
    if (focusChanged && this.engine?.invalidateMapStats && this.scene) {
      const focusedTerritoryIds = [selection.sourceId, selection.targetId]
        .filter((territoryId): territoryId is string => Boolean(territoryId));
      if (focusedTerritoryIds.length > 0) {
        this.engine.invalidateMapStats(focusedTerritoryIds);
        this.engine.refreshSnapshot?.();
        this.scene.sync(this.engine);
      }
    }
    this.scene?.setSelection(selection);
  }

  setInputBlocked(blocked: boolean): void {
    this.inputBlocked = blocked;
    this.scene?.setInputBlocked?.(blocked);
  }
}

export const mapBridge = new MapBridge();
