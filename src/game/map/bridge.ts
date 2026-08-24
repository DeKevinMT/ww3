/**
 * Renderer-only contracts. The map intentionally deals in plain string IDs at
 * the static world-data boundary and never imports simulation implementation.
 */
export interface MapArmyState {
  manpower: number;
  capacity: number;
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

export interface WorldMapEngineContract {
  readonly state: {
    tick: number;
    humanPlayerId: string;
    humanPlayerIds: readonly string[];
    territories: Record<string, MapTerritoryState>;
    wars: readonly MapWarState[];
    logisticsMovements: readonly MapLogisticsMovement[];
  };
  player(playerId: string): MapNationView | undefined;
  territoriesOf(playerId: string): MapTerritoryState[];
  globalRanking(): readonly { player: MapNationView; score: number }[];
  totalManpower?(playerId: string): { deployed: number; capacity: number };
  activeWarBetween(leftId: string, rightId: string): unknown;
  /** Materialise one stable renderer snapshot immediately before a scene sync. */
  refreshSnapshot?(): void;
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
    this.selection = selection;
    this.scene?.setSelection(selection);
  }

  setInputBlocked(blocked: boolean): void {
    this.inputBlocked = blocked;
    this.scene?.setInputBlocked?.(blocked);
  }
}

export const mapBridge = new MapBridge();
