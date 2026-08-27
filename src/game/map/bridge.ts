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
  /** Exact local Combat Power, including condition and per-soldier quality. */
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
  army: MapArmyState;
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
  conquered: boolean;
  operation: string;
}

export interface MapLogisticsMovement {
  playerId: string;
  sourceId: string;
  targetId: string;
  manpower: number;
  capacity: number;
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
  readonly expeditions?: readonly {
    readonly playerId: string;
    readonly sectorId: MapPolarSectorId;
    readonly manpower: number;
    readonly initialManpower: number;
  }[];
}

export interface WorldMapEngineContract {
  readonly state: {
    tick: number;
    humanPlayerId: string;
    humanPlayerIds: readonly string[];
    /** Human players only; absent entries have no active opening phase. */
    openingMobilisations: Readonly<Record<string, MapOpeningMobilisationState>>;
    territories: Record<string, MapTerritoryState>;
    wars: readonly MapWarState[];
    logisticsMovements: readonly MapLogisticsMovement[];
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
