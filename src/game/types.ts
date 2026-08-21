export type PlayerId = string;
export type TerritoryId = string;
export type RegionId = string;
export type UnitId = string;

export type Phase = 'reinforce' | 'attack' | 'fortify' | 'gameover';
export type UnitType = 'infantry' | 'armor' | 'artillery';
export type TerrainType = 'plains' | 'urban' | 'mountain' | 'desert' | 'jungle' | 'arctic' | 'coastal';
export type BattleTactic = 'combined-arms' | 'armored-breakthrough' | 'artillery-barrage' | 'encirclement' | 'hold-the-line' | 'counterattack'
  | 'shock-offensive' | 'attrition' | 'siege';
export type CardSymbol = UnitType;

export interface UnitDefinition {
  id: UnitType;
  name: string;
  shortName: string;
  icon: string;
  cost: number;
  maxHp: number;
  attack: number;
  defense: number;
  casualtyPriority: number;
  description: string;
}

export interface UnitInstance {
  id: UnitId;
  type: UnitType;
  hp: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface TerritoryDefinition {
  id: TerritoryId;
  name: string;
  regionId: RegionId;
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  shapeSeed: number;
  neighbors: readonly TerritoryId[];
  seaNeighbors: readonly TerritoryId[];
}

export interface TerritoryState {
  id: TerritoryId;
  ownerId: PlayerId;
  units: UnitInstance[];
}

export interface RegionDefinition {
  id: RegionId;
  name: string;
  bonus: number;
  color: number;
  hull: readonly Point[];
}

export interface TerritoryCard {
  id: string;
  territoryId: TerritoryId;
  symbol: CardSymbol;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  color: number;
  cssColor: string;
  darkColor: string;
  sigil: string;
  influences: readonly string[];
  profile: string;
  isHuman: boolean;
  eliminated: boolean;
  cards: TerritoryCard[];
}

export interface LogEntry {
  id: number;
  turn: number;
  kind: 'system' | 'reinforce' | 'combat' | 'conquest' | 'cards' | 'fortify' | 'victory';
  message: string;
}

export interface GameState {
  seed: number;
  rngState: number;
  turn: number;
  activePlayerIndex: number;
  phase: Phase;
  reinforcementPoints: number;
  players: PlayerState[];
  territories: Record<TerritoryId, TerritoryState>;
  deck: TerritoryCard[];
  discard: TerritoryCard[];
  tradeInCount: number;
  conqueredThisTurn: boolean;
  fortifyUsed: boolean;
  winnerId?: PlayerId;
  nextUnitId: number;
  nextLogId: number;
  log: LogEntry[];
}

export interface DamageLine {
  unitId: UnitId;
  unitType: UnitType;
  damage: number;
  hpBefore: number;
  hpAfter: number;
  destroyed: boolean;
}

export interface CombatRoundResult {
  sourceId: TerritoryId;
  targetId: TerritoryId;
  attackerId: PlayerId;
  defenderId: PlayerId;
  attackerDamageDealt: number;
  defenderDamageDealt: number;
  attackerLosses: UnitInstance[];
  defenderLosses: UnitInstance[];
  attackerDamageLines: DamageLine[];
  defenderDamageLines: DamageLine[];
  conquered: boolean;
  lastStand: boolean;
  rounds: number;
}

export interface BattlePrediction {
  willConquer: boolean;
  rounds: number;
  attackerValueBefore: number;
  attackerValueAfter: number;
  defenderValueBefore: number;
  defenderValueAfter: number;
  attackerSurvivors: UnitInstance[];
  defenderSurvivors: UnitInstance[];
}

export interface PlayerConfig {
  id: PlayerId;
  name: string;
  color: number;
  cssColor: string;
  darkColor: string;
  sigil: string;
  influences: readonly string[];
  profile: string;
  isHuman: boolean;
}

export interface StateChange {
  reason: string;
  combat?: CombatRoundResult;
}
