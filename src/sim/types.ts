import type {
  PlayerId,
  RegionId,
  TerritoryId,
  UnitId,
  UnitInstance,
  UnitType,
  TerrainType,
  BattleTactic,
} from '../game/types';

export type { PlayerId, RegionId, TerritoryId, UnitId, UnitInstance, UnitType, TerrainType, BattleTactic };

export type WorldSpeed = 0 | 1 | 2;
export type WorldLens = 'political' | 'diplomacy' | 'economy' | 'research' | 'military';
export type MilitaryStance = 'defensive' | 'balanced' | 'assertive';
export type StrategicUpgradeId = 'demographics' | 'weapons' | 'defence-systems' | 'logistics' | 'mobilization';
export type ManagementDomain = 'research' | 'finance' | 'war';
export type ManagementUpgradeId =
  | 'lab-network' | 'grant-efficiency' | 'military-research' | 'defence-research' | 'science-research' | 'population-research'
  | 'tax-modernization' | 'procurement-reform' | 'industrial-capacity'
  | 'offensive-command' | 'defensive-command' | 'field-logistics' | 'training-command';
export type ImprovementId =
  | 'attack' | 'defense' | 'recovery' | 'training' | 'manpower-capacity'
  | 'research-speed' | 'research-cost' | 'population-growth'
  | 'revenue' | 'upkeep' | 'industry';
export type RelationStatus = 'peace' | 'tension' | 'war' | 'truce';
export type TreatyType = 'ceasefire';
export type PeaceSettlementType = 'reparations' | 'territory';
export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'expired';
export type OperationDoctrine = 'breakthrough' | 'siege' | 'counteroffensive' | 'pressure' | 'consolidation';

export interface BudgetPolicy {
  economy: number;
  military: number;
  research: number;
  diplomacy: number;
}

export type FinanceMode = 'normal' | 'conserving' | 'rebuilding' | 'war' | 'insolvent';

export interface WeeklyFinanceBreakdown {
  revenue: number;
  payroll: number;
  maintenance: number;
  warOperations: number;
  research: number;
  training: number;
  recovery: number;
  forceExpansion: number;
  expenses: number;
  net: number;
  requestedPayroll: number;
  requestedMaintenance: number;
  requestedWarOperations: number;
  requestedResearch: number;
  requestedTraining: number;
  requestedRecovery: number;
  requestedForceExpansion: number;
  requestedExpenses: number;
  savings: number;
  reserveTarget: number;
  mode: FinanceMode;
}

export interface ResourceFunds {
  development: number;
  military: number;
  research: number;
  diplomacy: number;
}

export interface ResearchState {
  activeId: string;
  progress: number;
  completed: string[];
  discoveries: Record<string, number>;
}

export type StrategicUpgradeLevels = Record<StrategicUpgradeId, number>;
export type ImprovementLevels = Record<ImprovementId, number>;
export type ManagementUpgradeLevels = Record<ManagementUpgradeId, number>;

export interface ManagementProjectState {
  activeId?: ManagementUpgradeId;
  progress: number;
  target: number;
  paidCost: number;
  startedTick: number;
}

export type ManagementProjects = Record<ManagementDomain, ManagementProjectState>;

export interface PlayerPerk {
  id: 'standard-command' | 'asymmetric-ascendancy' | 'phoenix-doctrine';
  name: string;
  description: string;
  attackBonus: number;
  defenseBonus: number;
  recoveryBonus: number;
  capacityBonus: number;
  conquestGrowth: number;
}

export interface ForceState {
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  readiness: number;
  recovery: number;
  experience: number;
}

export interface SimPlayerState {
  id: PlayerId;
  name: string;
  shortName: string;
  color: number;
  cssColor: string;
  darkColor: string;
  sigil: string;
  influences: readonly string[];
  profile: string;
  isHuman: boolean;
  eliminated: boolean;
  treasury: number;
  annualIncome: number;
  industry: number;
  science: number;
  influence: number;
  manpower: number;
  stability: number;
  warExhaustion: number;
  recoverySurgeUntilTick: number;
  budget: BudgetPolicy;
  funds: ResourceFunds;
  stance: MilitaryStance;
  research: ResearchState;
  upgrades: StrategicUpgradeLevels;
  improvements: ImprovementLevels;
  managementLevels: ManagementUpgradeLevels;
  management: ManagementProjects;
  capitalId: TerritoryId;
  perk: PlayerPerk;
  combatExperience: number;
}

export interface SimTerritoryState {
  id: TerritoryId;
  ownerId: PlayerId;
  force: ForceState;
  economy: number;
  industry: number;
  research: number;
  infrastructure: number;
  population: number;
  stability: number;
  fortification: number;
  capital: boolean;
  annexedAtTick?: number;
  foreignControl?: {
    controllerId: PlayerId;
    share: number;
    axis: 'horizontal' | 'vertical';
    fromEdge: 'start' | 'end';
    establishedTick: number;
  };
}

export interface RelationState {
  id: string;
  leftId: PlayerId;
  rightId: PlayerId;
  score: number;
  trust: number;
  status: RelationStatus;
  treaties: TreatyType[];
  grievances: number;
  truceUntilTick: number;
  lastActionTick: number;
}

export interface WarState {
  id: string;
  attackerId: PlayerId;
  defenderId: PlayerId;
  startedTick: number;
  warScore: number;
  attackerLosses: number;
  defenderLosses: number;
  attackerMilitaryLoss: number;
  defenderMilitaryLoss: number;
  lastBattleTick: number;
  battles: number;
  attackerPopulationLoss: number;
  defenderPopulationLoss: number;
  economicDamage: number;
  lastPeaceOfferTick: number;
  attackerOperation?: FrontOperationState;
  defenderOperation?: FrontOperationState;
}

export interface FrontOperationState {
  commanderId: PlayerId;
  sourceId: TerritoryId;
  targetId: TerritoryId;
  doctrine: OperationDoctrine;
  startedTick: number;
  expiresTick: number;
  momentum: number;
  supply: number;
  supportingForces: number;
}

export interface DiplomaticOffer {
  id: string;
  fromId: PlayerId;
  toId: PlayerId;
  type: TreatyType;
  createdTick: number;
  expiresTick: number;
  status: OfferStatus;
  note: string;
  settlement?: PeaceSettlementType;
  cashAmount?: number;
  territoryId?: TerritoryId;
  controlShare?: number;
  strengthGap?: number;
}

export interface WorldEvent {
  id: number;
  tick: number;
  kind: 'system' | 'economy' | 'research' | 'diplomacy' | 'tension' | 'war' | 'battle' | 'conquest' | 'peace' | 'critical';
  severity: 'info' | 'action' | 'critical';
  message: string;
  territoryId?: TerritoryId;
  playerId?: PlayerId;
  unread: boolean;
}

export interface BattleEvent {
  warId: string;
  sourceId: TerritoryId;
  targetId: TerritoryId;
  attackerId: PlayerId;
  defenderId: PlayerId;
  attackerDamageDealt: number;
  defenderDamageDealt: number;
  attackerLosses: number;
  defenderLosses: number;
  attackerMilitaryLoss: number;
  defenderMilitaryLoss: number;
  attackerPopulationLoss: number;
  defenderPopulationLoss: number;
  economicDamage: number;
  controlGained: number;
  foreignControlShare: number;
  conquered: boolean;
  terrain: TerrainType;
  tactic: BattleTactic;
  phase: 'bombardment' | 'breakthrough' | 'assault' | 'counterattack';
  attackerPower: number;
  defenderPower: number;
  operation: OperationDoctrine;
  attackerSupply: number;
  defenderSupply: number;
  momentum: number;
  supportingForces: number;
  tick: number;
}

export interface WorldState {
  schemaVersion: number;
  rulesVersion: string;
  mapId: string;
  seed: number;
  rngState: number;
  tick: number;
  speed: WorldSpeed;
  humanPlayerId: PlayerId;
  players: SimPlayerState[];
  territories: Record<TerritoryId, SimTerritoryState>;
  relations: Record<string, RelationState>;
  wars: WarState[];
  offers: DiplomaticOffer[];
  events: WorldEvent[];
  nextUnitId: number;
  nextEventId: number;
  nextWarId: number;
  nextOfferId: number;
  winnerId?: PlayerId;
  gameOver: boolean;
}

export interface ResearchDefinition {
  id: string;
  name: string;
  field: string;
  cost: number;
  description: string;
  effect: string;
  color: string;
}

export interface WorldChange {
  reason: string;
  battle?: BattleEvent;
  critical?: boolean;
}

export interface SimPlayerConfig {
  id: PlayerId;
  name: string;
  shortName: string;
  color: number;
  cssColor: string;
  darkColor: string;
  sigil: string;
  influences: readonly string[];
  profile: string;
  isHuman: boolean;
  capitalId: TerritoryId;
}
