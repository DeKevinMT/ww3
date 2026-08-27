import {
  REGION_BY_ID,
  terrainProfileDisplayPercentages,
  type TerrainProfileEntry,
} from '../game/data/worldMap';
import {
  battleScreenFocus,
  GAME_AUDIO_CREDITS,
  worldGameAudio,
  type GameAudioChannel,
} from '../audio/gameAudio';
import {
  mapBridge,
  type MapOpeningMobilisationState,
  type MapPolarRegion,
  type MapTerritoryState,
  type WorldMapEngineContract,
} from '../game/map/bridge';
import { MapStatsRefreshCadence } from '../game/map/mapStatsCadence';
import { terrainPresentation } from '../game/terrainPresentation';
import {
  CONQUEST_CAPTURE_GUARD_TICKS,
  DEFENSE_RESEARCH_HALF_SATURATION,
  DEFENSE_RESEARCH_MAX_BONUS,
  diminishingResearchLevelV2,
  effectiveDefenseStatV2,
  FOOD_PRODUCTION_RESEARCH_BONUS_PER_EFFECTIVE_LEVEL,
  FOOD_PRODUCTION_RESEARCH_EFFECTIVE_CEILING,
  FOOD_PRODUCTION_RESEARCH_HALF_SATURATION,
  FOOD_STORAGE_RESEARCH_BONUS_PER_EFFECTIVE_LEVEL,
  FOOD_STORAGE_RESEARCH_EFFECTIVE_CEILING,
  FOOD_STORAGE_RESEARCH_HALF_SATURATION,
  NATIONAL_IQ_RESEARCH_HALF_SATURATION,
  NATIONAL_IQ_RESEARCH_MAX_BONUS,
  OPERATING_EFFICIENCY_RESEARCH_EFFECTIVE_CEILING,
  OPERATING_EFFICIENCY_RESEARCH_HALF_SATURATION,
  OPERATING_EFFICIENCY_RESEARCH_REDUCTION_PER_EFFECTIVE_LEVEL,
  PEACE_FATIGUE_RECOVERY_PER_WEEK,
  PEACE_REQUEST_MIN_WAR_AGE_TICKS,
  RESERVE_MOBILIZATION_RESEARCH_BONUS_PER_EFFECTIVE_LEVEL,
  RESERVE_MOBILIZATION_RESEARCH_EFFECTIVE_CEILING,
  RESERVE_MOBILIZATION_RESEARCH_HALF_SATURATION,
  RESERVE_TRAINING_RESEARCH_BONUS_PER_EFFECTIVE_LEVEL,
  RESERVE_TRAINING_RESEARCH_EFFECTIVE_CEILING,
  RESERVE_TRAINING_RESEARCH_HALF_SATURATION,
  TAX_EFFICIENCY_RESEARCH_BONUS_PER_EFFECTIVE_LEVEL,
  TAX_EFFICIENCY_RESEARCH_EFFECTIVE_CEILING,
  TAX_EFFICIENCY_RESEARCH_HALF_SATURATION,
  WAR_MOBILIZATION_TICKS,
} from '../sim/v2/balance';
import {
  territoryTerrainEffectsV2,
  territoryTerrainProfileV2,
  WORLD_CONTENT_V2,
  type TerritoryTerrainEffectsV2,
  type WorldContentV2,
} from '../sim/v2/content';
import {
  openingArmyCapacityMultiplierV2,
  stateTerritoryArmyCapacityTargetV2,
  stateTerritoryArmySupportCeilingV2,
} from '../sim/v2/capacity';
import {
  quoteTerritoryIntegrationV2,
  territoryIntegrationWarPressureRevolutionRiskV2,
  type TerritoryIntegrationAccessV2,
  type TerritoryIntegrationQuoteV2,
} from '../sim/v2/integration';
import { openingStartingTreasuryV2 } from '../sim/v2/nationState';
import { OPENING_ARMY_BONUS_DURATION_TICKS_V2 } from '../sim/v2/openingArmyBonus';
import {
  ANTARCTIC_SECTORS_V2,
  ARCTIC_PROJECTS_V2,
} from '../sim/v2/polarEndgame';
import type { GameModeV2, ScenarioConfigV2 } from '../sim/v2/scenarios';
import {
  selectArmyStrengthV2,
  selectEffectiveAttackV2,
  selectEffectiveDefenseV2,
  selectNationViewV2,
  selectNationalEconomyV2,
  selectNationalIqViewV2,
  projectNationalIqFusionV2,
  selectPopulationDynamicsV2,
  selectResearchEffectImpactV2,
  selectWarRouteDistanceKmV2,
  type MilitaryBaseSnapshotV2,
  type PowerSnapshotV2,
} from '../sim/v2/selectors';
import type { OpeningCandidatePreviewSnapshotV2 } from '../sim/v2/WorldEngineV2';
import {
  countryTraitFactorV2,
  countryTraitV2,
  describeCountryTraitModifiersV2,
  humanCountryTraitMultiplierForContentV2,
  humanOpeningTrainedReserveTermsForContentV2,
  humanStartingArmyMultiplierForContentV2,
} from '../sim/v2/traits';
import { countryFlagHtml } from './countryFlags';
import { summarizeFoodTradeV2 } from './foodTrade';
import { projectMapArmyV2 } from './mapArmyProjection';
import {
  beginWarOutcomePauseV2,
  enqueueWarOutcomeV2,
  finishWarOutcomePauseV2,
} from './warOutcomeQueue';
import { selectExpansionThreatSummaryV2 } from '../sim/v2/warStrain';
import {
  previewWarLogisticsV2,
  type WarLogisticsPreviewV2,
} from '../sim/v2/warLogisticsPreview';
import { selectWarStrainSummaryV2 } from './warStrain';
import {
  captureScrollSessions,
  drawerScrollSessionId,
  restoreScrollSessions,
} from './scrollSessions';
import {
  rankWarTargetRecommendationsV2,
  warTargetFusionValueBonusV2,
  warTargetRouteLabelV2,
  type AvailableWarTargetAccessV2,
} from './warTargetRecommendations';
import type {
  AntarcticSectorIdV2,
  ArmyStateV2,
  ArmyStrengthV2,
  AllianceOfferV2,
  AllianceProposalStatusV2,
  ArcticProjectIdV2,
  BattleEventV2,
  CeasefireTermsV2,
  CommandResultV2,
  ConquestForecastV2,
  FrontOperationV2,
  GlobalResistanceV2,
  LogisticsMovementV2,
  LiveWarEstimateV2,
  NationViewV2,
  NationalEconomyV2,
  NationalAiPlanV2,
  NuclearPowerViewV2,
  PeaceOfferV2,
  PeaceProposalTermsV2,
  PeaceSettlementV2,
  PlayerId,
  PopulationDynamicsV2,
  RankingEntryV2,
  ResearchBranchV2,
  ResearchEffectV2,
  ResearchBranchProgressV2,
  TerritoryId,
  TerritoryStateV2,
  TerritoryViewV2,
  WarAccessV2,
  WarDeclarationStatusV2,
  WarForecastV2,
  WarOutcomeV2,
  WarStateV2,
  WeeklyFinanceBreakdownV2,
  WeeklyManpowerProjectionV2,
  WorldChangeV2,
  WorldEventV2,
  WorldStateV2,
  WorldSpeedV2,
} from '../sim/v2/types';

type CommandOutcome = boolean | CommandResultV2 | void;
type WarTargetCandidate = {
  targetId: PlayerId;
  target: NationViewV2;
  declaration: WarDeclarationStatusV2;
  chance: number;
  access: AvailableWarTargetAccessV2;
  distanceKm?: number;
  gdpPerCapitaThousands: number;
  nationalIq: number;
};

type ArcticProjectDefinitionUIV2 = (typeof ARCTIC_PROJECTS_V2)[number];
type AntarcticSectorDefinitionUIV2 = (typeof ANTARCTIC_SECTORS_V2)[number];

interface ArcticProjectTermsUIV2 {
  readonly project: ArcticProjectDefinitionUIV2;
  readonly allowed: boolean;
  readonly reason?: string;
  readonly status: 'locked' | 'available' | 'active' | 'complete';
  readonly baseCost: number;
  readonly economyCostScale: number;
  readonly openingMilitaryRank: number;
  readonly openingMilitaryRankCount: number;
  readonly openingMilitaryRankCostFactor: number;
  readonly affinityCostModifier: number;
  readonly affinityCostMultiplier: number;
  readonly quotedCost: number;
  readonly cost: number;
  readonly baseDurationTicks: number;
  readonly accessPointCount: number;
  readonly accessDurationReduction: number;
  readonly researchSpeedDurationReduction: number;
  readonly quotedDurationTicks: number;
  readonly durationTicks: number;
  readonly startedTick?: number;
  readonly completesTick?: number;
  readonly progress: number;
}

interface AntarcticExpeditionTermsUIV2 {
  readonly sector: AntarcticSectorDefinitionUIV2;
  readonly allowed: boolean;
  readonly reason?: string;
  readonly minManpower: number;
  readonly maxManpower: number;
  readonly recommendedManpower: number;
  readonly enemyStrength: number;
  readonly projectedDurationTicks: number;
  readonly activeExpedition?: {
    readonly id: number;
    readonly playerId: PlayerId;
    readonly sectorId: AntarcticSectorIdV2;
    readonly manpower: number;
    readonly initialManpower: number;
    readonly startedTick: number;
    readonly lastPulseTick: number;
    readonly damageDealt: number;
  };
}

/**
 * Narrow UI facade for WorldEngineV2. Keeping the UI on this contract makes the
 * simulation replaceable without leaking mutable internals into the DOM layer.
 */
export interface WorldEngineV2UIContract {
  readonly content: WorldContentV2;
  readonly state: WorldStateV2;
  /** The local country being viewed. Differs from the canonical primary player in multiplayer. */
  readonly viewerPlayerId?: PlayerId;
  player(playerId: string): NationViewV2 | undefined;
  territoriesOf(playerId: string): readonly TerritoryViewV2[];
  subscribe(listener: (state: WorldStateV2, change: WorldChangeV2) => void): () => void;
  chooseCountry(countryId: string): CommandOutcome;
  startClock(): void;
  setEmpireName(playerId: string, name: string): CommandOutcome;
  controlledPopulation(playerId: string): number;
  weeklyPopulationTrend(playerId: string): number;
  populationDynamics(playerId: string, populationGrowthFunding?: number): PopulationDynamicsV2;
  weeklyManpowerTrend(playerId: string): number;
  weeklyManpowerProjection(playerId: string): WeeklyManpowerProjectionV2;
  nationalEconomy(playerId: string): NationalEconomyV2;
  totalManpower(playerId: string): { deployed: number; capacity: number };
  recentLogisticsMovements(): readonly LogisticsMovementV2[];
  armyStrength(playerId: string): ArmyStrengthV2;
  weeklyFinanceBreakdown(playerId: string): WeeklyFinanceBreakdownV2;
  openingCandidateFinancePlans(powerSnapshot?: PowerSnapshotV2): ReadonlyMap<PlayerId, WeeklyFinanceBreakdownV2>;
  openingCandidatePreviewSnapshot(): OpeningCandidatePreviewSnapshotV2;
  nationalAiPlan(playerId: string): NationalAiPlanV2;
  globalResistance(): GlobalResistanceV2;
  globalRanking(powerSnapshot?: PowerSnapshotV2): RankingEntryV2[];
  militaryBaseSnapshot(): MilitaryBaseSnapshotV2;
  powerSnapshot(militaryBaseSnapshot?: MilitaryBaseSnapshotV2): PowerSnapshotV2;
  nationalAggressiveness(playerId: string, powerSnapshot?: PowerSnapshotV2): number;
  effectiveAttack(playerId: string, army: ArmyStateV2, snapshot?: MilitaryBaseSnapshotV2): number;
  effectiveDefense(playerId: string, army: ArmyStateV2, snapshot?: MilitaryBaseSnapshotV2): number;
  effectivePower(playerId: string, army: ArmyStateV2, snapshot?: MilitaryBaseSnapshotV2): number;
  territoryPower(territoryId: string): number;
  currentPower(playerId: string, snapshot?: MilitaryBaseSnapshotV2): number;
  conventionalPower(playerId: string): number;
  strategicScore(playerId: string): number;
  nuclearPower(playerId: string): NuclearPowerViewV2;
  researchPortfolio(
    playerId: string,
    finance?: WeeklyFinanceBreakdownV2,
  ): readonly ResearchBranchProgressV2[];
  activeWarBetween(leftId: string, rightId: string): WarStateV2 | undefined;
  warAccessType(attackerId: string, defenderId: string): WarAccessV2;
  conquestForecast(attackerId: string, targetId: string): ConquestForecastV2;
  warDeclarationStatus(attackerId: string, defenderId: string): WarDeclarationStatusV2;
  warForecast(attackerId: string, defenderId: string): WarForecastV2;
  liveWarEstimate(warId: string, viewerId: string): LiveWarEstimateV2 | undefined;
  declareWar(attackerId: string, defenderId: string): CommandOutcome;
  ceasefireTerms(warId: string, requesterId: string): CeasefireTermsV2;
  requestCeasefire(warId: string, requesterId: string): CommandOutcome;
  peaceProposalTerms(warId: string, playerId: string): PeaceProposalTermsV2;
  proposePeaceSettlement(fromId: string, targetId: string, settlement: PeaceSettlementV2): CommandOutcome;
  respondToOffer(offerId: string, accept: boolean): CommandOutcome;
  areAllied(leftId: string, rightId: string): boolean;
  allianceProposalStatus(fromId: string, targetId: string): AllianceProposalStatusV2;
  proposeAlliance(fromId: string, targetId: string): CommandOutcome;
  respondToAlliance(fromId: string, toId: string, accept: boolean): CommandOutcome;
  arcticProjectTerms(playerId: string, projectId: ArcticProjectIdV2): ArcticProjectTermsUIV2;
  antarcticExpeditionTerms(playerId: string, sectorId: AntarcticSectorIdV2): AntarcticExpeditionTermsUIV2;
  startArcticProject(playerId: string, projectId: ArcticProjectIdV2): CommandOutcome;
  acknowledgePolarWarning(playerId: string): CommandOutcome;
  deployAntarcticExpedition(
    playerId: string,
    sectorId: AntarcticSectorIdV2,
    manpower: number,
  ): CommandOutcome;
  markAllEventsRead(): void;
  setSpeed(speed: WorldSpeedV2): void;
}

export interface WorldUIV2Options {
  introOpen?: boolean;
  initialPreviewCountryId?: PlayerId;
  multiplayer?: boolean;
  controllerNames?: ReadonlyMap<PlayerId, string>;
  onMultiplayerRequested?: (preferredCountryId: PlayerId) => void;
  scenarioConfig?: ScenarioConfigV2;
  onScenarioModeRequested?: (mode: GameModeV2) => void;
  onScenarioRerollRequested?: (preferredCountryId: PlayerId) => void;
  onNewGameRequested?: () => void;
  onCountryConfirmed?: (countryId: PlayerId) => void;
  onInitialMapSynchronized?: () => void;
}

type PanelMode = 'war' | 'nation' | 'research' | 'economy' | 'ranking';
export type IntroSort = 'power' | 'military' | 'aggressiveness' | 'attack' | 'defense' | 'iq' | 'manpower' | 'economy' | 'gdp-per-capita' | 'economic-growth' | 'tax' | 'population' | 'growth';

export const INTRO_SORT_OPTIONS: readonly { value: IntroSort; label: string }[] = [
  { value: 'power', label: 'Military ranking' },
  { value: 'attack', label: 'Attack (ATK)' },
  { value: 'defense', label: 'Defense (DEF)' },
  { value: 'iq', label: 'IQ' },
  { value: 'manpower', label: 'Army manpower' },
  { value: 'economy', label: 'Economy' },
  { value: 'gdp-per-capita', label: 'GDP / capita' },
  { value: 'economic-growth', label: 'Economic growth' },
  { value: 'tax', label: 'Tax rate' },
  { value: 'population', label: 'Population' },
  { value: 'growth', label: 'Population growth' },
];

const RESEARCH_META: Record<ResearchBranchV2, {
  label: string;
  shortLabel: string;
  effect: string;
}> = {
  'population-recruitment': {
    label: 'Population & Recruitment', shortLabel: 'Recruitment',
    effect: 'Faster population growth and more trained manpower each week.',
  },
  'military-industry': {
    label: 'Military Industry', shortLabel: 'Industry',
    effect: 'Raises the population-based army capacity and improves recruitment.',
  },
  'advanced-weapons': {
    label: 'Advanced Weapons', shortLabel: 'Weapons',
    effect: 'Raises ATK and lowers the cost of replacing combat losses.',
  },
  'defensive-systems': {
    label: 'Defensive Systems', shortLabel: 'Defence',
    effect: 'Raises DEF and reduces trained-manpower casualties in battle.',
  },
  'logistics-medicine': {
    label: 'Logistics & Medicine', shortLabel: 'Logistics',
    effect: 'Raises replenishment, return-to-duty and supply across long or overseas routes.',
  },
  'economy-science': {
    label: 'Economy & Science', shortLabel: 'Economy',
    effect: 'Grows the economy, strengthens food systems and makes later breakthroughs faster and cheaper.',
  },
  'food-systems': {
    label: 'Food Systems', shortLabel: 'Food',
    effect: 'Raises domestic food output and expands strategic food storage.',
  },
  'reserve-doctrine': {
    label: 'Reserve Doctrine', shortLabel: 'Reserves',
    effect: 'Trains reservists faster and mobilises existing reserves more quickly during war.',
  },
  'public-administration': {
    label: 'Public Administration', shortLabel: 'Administration',
    effect: 'Improves tax collection and reduces the base cost of operating the state.',
  },
  'education-intelligence': {
    label: 'Education & Intelligence', shortLabel: 'Education',
    effect: 'A very expensive long-term program that raises live national IQ with diminishing returns.',
  },
};

const RESEARCH_COLORS: Record<ResearchBranchV2, string> = {
  'population-recruitment': '#69e3a2',
  'military-industry': '#f0bd68',
  'advanced-weapons': '#ff8179',
  'defensive-systems': '#6bddf2',
  'logistics-medicine': '#70aef5',
  'economy-science': '#b59cff',
  'food-systems': '#91d36f',
  'reserve-doctrine': '#e5a16b',
  'public-administration': '#63d5c0',
  'education-intelligence': '#d39bea',
};

function researchEffectLabel(effect: string): string {
  return ({
    'population-growth': 'POP GROWTH', training: 'TRAINING', 'force-capacity': 'CAPACITY',
    'reinforcement-efficiency': 'RECRUIT COST', attack: 'ATK',
    defense: 'DEF', 'casualty-reduction': 'PROTECTION', recovery: 'RECOVERY', supply: 'SUPPLY',
    'economy-growth': 'ECONOMY', 'research-speed': 'R&D SPEED', 'research-efficiency': 'R&D COST',
    'food-production': 'FOOD OUTPUT', 'food-storage': 'FOOD STORAGE',
    'reserve-training': 'RESERVE TRAIN', 'reserve-mobilization': 'MOBILIZATION',
    'tax-efficiency': 'TAX YIELD', 'operating-efficiency': 'BASE COSTS',
    'iq-increase': 'IQ',
  } as Record<string, string>)[effect] ?? effect.toUpperCase();
}

interface ResearchEffectDisplayContextV2 {
  researchConversion: number;
  baseDefense: number;
  combinedMultiplier: number;
  iqResearchBonus: number;
}

function researchEffectTotal(
  effect: ResearchEffectV2,
  level: number,
  impact = 1,
  context?: ResearchEffectDisplayContextV2,
): string {
  const percent = (value: number, suffix = '') => `${value >= 0 ? '+' : '−'}${format(Math.abs(value), 1)}%${suffix}`;
  if (effect === 'defense') {
    const convertedLevel = level * (context?.researchConversion ?? 1);
    const researchBonus = convertedLevel <= 0 ? 0
      : DEFENSE_RESEARCH_MAX_BONUS * convertedLevel
        / (convertedLevel + DEFENSE_RESEARCH_HALF_SATURATION);
    if (context) {
      const baseRawDefense = context.baseDefense * context.combinedMultiplier;
      const withoutResearch = effectiveDefenseStatV2(baseRawDefense);
      const withResearch = effectiveDefenseStatV2(baseRawDefense * (1 + researchBonus));
      return percent(withoutResearch > 0 ? (withResearch / withoutResearch - 1) * 100 : 0, ' effective DEF');
    }
    return percent(researchBonus * 100, ' DEF');
  }
  if (effect === 'casualty-reduction') return percent(-50 * level / (level + 30), ' losses');
  if (effect === 'recovery') return percent(-20 * level / (level + 46.67), ' deaths');
  if (effect === 'training') return percent(2 * diminishingResearchLevelV2(level, 30, 20), ' speed');
  if (effect === 'reinforcement-efficiency') return percent(-diminishingResearchLevelV2(level), ' cost');
  if (effect === 'research-efficiency') return percent(-diminishingResearchLevelV2(level), ' R&D cost');
  if (effect === 'economy-growth') return percent(0.06 * level * impact, '/yr growth');
  if (effect === 'population-growth') return percent(0.5 * level * impact, ' base growth');
  if (effect === 'force-capacity') return percent(level, ' capacity');
  if (effect === 'attack') return percent(
    level * (context?.researchConversion ?? 1),
    ' effective ATK',
  );
  if (effect === 'supply') return percent(level, ' supply');
  if (effect === 'research-speed') return percent(level, ' R&D speed');
  if (effect === 'food-production') return percent(
    100 * FOOD_PRODUCTION_RESEARCH_BONUS_PER_EFFECTIVE_LEVEL
      * diminishingResearchLevelV2(level, FOOD_PRODUCTION_RESEARCH_EFFECTIVE_CEILING,
        FOOD_PRODUCTION_RESEARCH_HALF_SATURATION),
    ' output',
  );
  if (effect === 'food-storage') return percent(
    100 * FOOD_STORAGE_RESEARCH_BONUS_PER_EFFECTIVE_LEVEL
      * diminishingResearchLevelV2(level, FOOD_STORAGE_RESEARCH_EFFECTIVE_CEILING,
        FOOD_STORAGE_RESEARCH_HALF_SATURATION),
    ' storage',
  );
  if (effect === 'reserve-training') return percent(
    100 * RESERVE_TRAINING_RESEARCH_BONUS_PER_EFFECTIVE_LEVEL
      * diminishingResearchLevelV2(level, RESERVE_TRAINING_RESEARCH_EFFECTIVE_CEILING,
        RESERVE_TRAINING_RESEARCH_HALF_SATURATION),
    ' training',
  );
  if (effect === 'reserve-mobilization') return percent(
    100 * RESERVE_MOBILIZATION_RESEARCH_BONUS_PER_EFFECTIVE_LEVEL
      * diminishingResearchLevelV2(level, RESERVE_MOBILIZATION_RESEARCH_EFFECTIVE_CEILING,
        RESERVE_MOBILIZATION_RESEARCH_HALF_SATURATION),
    ' mobilisation',
  );
  if (effect === 'tax-efficiency') return percent(
    100 * TAX_EFFICIENCY_RESEARCH_BONUS_PER_EFFECTIVE_LEVEL
      * diminishingResearchLevelV2(level, TAX_EFFICIENCY_RESEARCH_EFFECTIVE_CEILING,
        TAX_EFFICIENCY_RESEARCH_HALF_SATURATION),
    ' tax',
  );
  if (effect === 'operating-efficiency') return percent(
    -100 * OPERATING_EFFICIENCY_RESEARCH_REDUCTION_PER_EFFECTIVE_LEVEL
      * diminishingResearchLevelV2(level, OPERATING_EFFICIENCY_RESEARCH_EFFECTIVE_CEILING,
        OPERATING_EFFICIENCY_RESEARCH_HALF_SATURATION),
    ' base cost',
  );
  if (effect === 'iq-increase') return `${signed(
    context?.iqResearchBonus ?? diminishingResearchLevelV2(
      level,
      NATIONAL_IQ_RESEARCH_MAX_BONUS,
      NATIONAL_IQ_RESEARCH_HALF_SATURATION,
    ), 1,
  )} IQ`;
  return percent(level);
}

export function researchEffectVisualV2(effect: ResearchEffectV2): Readonly<{ icon: string; tone: string }> {
  const key = String(effect);
  if (/attack|nuclear/.test(key)) return { icon: 'ATK', tone: 'combat' };
  if (/defense|casualty|recovery/.test(key)) return { icon: 'DEF', tone: 'defence' };
  if (/force|training|reserve|supply|mobilization/.test(key)) return { icon: 'MIL', tone: 'force' };
  if (/food/.test(key)) return { icon: 'FOD', tone: 'food' };
  if (/population|iq/.test(key)) return { icon: 'POP', tone: 'people' };
  if (/research/.test(key)) return { icon: 'R&D', tone: 'research' };
  if (/economy|tax|operating|cost/.test(key)) return { icon: 'ECO', tone: 'economy' };
  return { icon: 'SYS', tone: 'system' };
}

function researchEffectTransitionV2(
  effect: ResearchEffectV2,
  currentLevel: number,
  gainedLevels: number,
  impact: number,
  context: ResearchEffectDisplayContextV2,
): string {
  const before = researchEffectTotal(effect, currentLevel, impact, context);
  const after = researchEffectTotal(effect, currentLevel + gainedLevels, impact, context);
  return `${before} → ${after}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]!);
}

const NUMBER_FORMATTERS = new Map<number, Intl.NumberFormat>();

function format(value: number, digits = 0): string {
  let formatter = NUMBER_FORMATTERS.get(digits);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-US', {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
    });
    NUMBER_FORMATTERS.set(digits, formatter);
  }
  return formatter.format(Number.isFinite(value) ? value : 0);
}

function signed(value: number, digits = 0): string {
  return `${value >= 0 ? '+' : '−'}${format(Math.abs(value), digits)}`;
}

function compactNumber(value: number, digits = 2): string {
  const absolute = Math.abs(Number.isFinite(value) ? value : 0);
  const units = [
    { threshold: 1e12, divisor: 1e12, suffix: 'T' },
    { threshold: 1e9, divisor: 1e9, suffix: 'B' },
    { threshold: 1e6, divisor: 1e6, suffix: 'M' },
    { threshold: 1e3, divisor: 1e3, suffix: 'K' },
  ];
  const unit = units.find((candidate) => absolute >= candidate.threshold);
  const compact = unit ? absolute / unit.divisor : absolute;
  return `${value < 0 ? '−' : ''}${format(compact, digits)}${unit?.suffix ?? ''}`;
}

function cash(valueInBillions: number, digits = 2): string {
  return `${valueInBillions < 0 ? '−' : ''}$${compactNumber(Math.abs(valueInBillions) * 1e9, digits)}`;
}

function signedCash(value: number, digits = 2): string {
  return `${value >= 0 ? '+' : '−'}${cash(Math.abs(value), digits)}`;
}

const WEEKS_PER_YEAR = 52;
const annual = (weekly: number): number => weekly * WEEKS_PER_YEAR;

function people(millions: number): string {
  return compactNumber(Math.abs(millions) * 1e6);
}

export function armyCapacityLabel(deployed: number, capacity: number): string {
  return `${people(deployed)} / ${people(capacity)}`;
}

export function globalRankingDetail(combatPower: number, _controlledOutput?: number): string {
  return `MILITARY POWER ${compactNumber(combatPower)}`;
}

export interface TreasuryTopbarPresentationV2 {
  readonly className: string;
  readonly value: string;
  readonly reserveFill: string;
  readonly reserveFillClassName: string;
  readonly trend: string;
  readonly trendClassName: string;
  readonly ariaLabel: string;
}

export function treasuryTopbarPresentationV2(
  treasury: number,
  weeklyNet: number,
  reserveTarget = 0,
): TreasuryTopbarPresentationV2 {
  const debt = treasury < 0;
  const balanceTone = debt ? ' is-debt is-negative' : treasury > 0 ? ' is-positive' : '';
  const reserveFillRatio = reserveTarget > 0 ? Math.max(0, treasury) / reserveTarget : 1;
  const reserveFillPercent = reserveFillRatio * 100;
  const reserveFill = reserveFillPercent > 999 ? '999%+' : `${format(reserveFillPercent)}%`;
  const reserveFillClassName = reserveFillRatio >= 1
    ? 'is-positive' : reserveFillRatio >= 0.5 ? 'is-warn' : 'is-negative';
  return Object.freeze({
    className: `top-metric--treasury${balanceTone}`,
    value: cash(treasury),
    reserveFill,
    reserveFillClassName,
    trend: `${signedCash(weeklyNet)}/wk`,
    trendClassName: weeklyNet >= 0 ? 'is-positive' : 'is-negative',
    ariaLabel: `Current empire treasury ${cash(treasury)}; projected recurring net ${signedCash(weeklyNet)} per week`,
  });
}

export type SuspicionRiskLevelV2 =
  | 'clear'
  | 'minimal'
  | 'watched'
  | 'exposed'
  | 'danger'
  | 'critical';

export interface SuspicionRiskPresentationV2 {
  readonly score: number;
  readonly level: SuspicionRiskLevelV2;
  readonly label: string;
  readonly guidance: string;
}

/**
 * Player-facing political risk language. Suspicion is intentionally shown as
 * the durable 0-100 declaration gate; Expansion Threat remains the faster
 * signal for a burst of wars or conquests.
 */
export function suspicionRiskPresentationV2(value: number): SuspicionRiskPresentationV2 {
  const score = Math.round(clamp(value, 0, 100));
  if (score === 0) return Object.freeze({
    score,
    level: 'clear',
    label: 'NO THREAT',
    guidance: '0 Suspicion means 0% chance that AI starts a new war against you.',
  });
  if (score < 20) return Object.freeze({
    score,
    level: 'minimal',
    label: 'MINIMAL',
    guidance: 'Practically safe. AI attack interest remains negligible at this level.',
  });
  if (score < 40) return Object.freeze({
    score,
    level: 'watched',
    label: 'WATCHED',
    guidance: 'Other powers are watching, but you remain below the 40-point exposure line.',
  });
  if (score < 60) return Object.freeze({
    score,
    level: 'exposed',
    label: 'EXPOSED',
    guidance: 'AI powers now meaningfully consider attacks. Slow down and let Suspicion cool.',
  });
  if (score < 80) return Object.freeze({
    score,
    level: 'danger',
    label: 'DANGER',
    guidance: 'Attack interest is high. Another rapid war or conquest can trigger a response.',
  });
  return Object.freeze({
    score,
    level: 'critical',
    label: 'CRITICAL',
    guidance: 'You are an urgent target. Stop expanding until this meter has fallen.',
  });
}

export interface WorldTopbarStatsV2 {
  readonly population: number;
  readonly controlledLandShare: number;
  readonly controlledTerritories: number;
  readonly worldTerritories: number;
}

/** Live population plus controlled share of the mapped world land area. */
export function worldTopbarStatsV2(
  state: WorldStateV2,
  playerId: PlayerId,
  content: WorldContentV2 = WORLD_CONTENT_V2,
): WorldTopbarStatsV2 {
  let worldPopulation = 0;
  let worldLandArea = 0;
  let controlledLandArea = 0;
  let controlledTerritories = 0;
  for (const territoryId of content.territoryIds) {
    const territory = state.territories[territoryId];
    const definition = content.territories[territoryId];
    if (!territory || !definition) continue;
    worldPopulation += Math.max(0, territory.population);
    worldLandArea += Math.max(0, definition.baseline.landArea);
    if (territory.owner !== playerId) continue;
    controlledLandArea += Math.max(0, definition.baseline.landArea);
    controlledTerritories += 1;
  }
  return Object.freeze({
    population: worldPopulation,
    controlledLandShare: worldLandArea > 0 ? controlledLandArea / worldLandArea : 0,
    controlledTerritories,
    worldTerritories: content.territoryIds.length,
  });
}

export function baseOperatingCostLabel(share = 0.20): string {
  const percent = share * 100;
  const decimals = Math.abs(percent - Math.round(percent)) < 0.05 ? 0 : 1;
  return `BASE OPERATIONS · ${format(percent, decimals)}% OF TAX REVENUE`;
}

export function taxIncomeBasisLabel(): string {
  return '50% ECONOMY BASE · 50% LIVE PRODUCTIVE PEOPLE';
}

export function toastVisibilityDuration(tone: 'default' | 'war' | 'conquest'): number {
  if (tone === 'conquest') return 5_000;
  if (tone === 'war') return 4_000;
  return 3_200;
}

function population(millions: number): string {
  return compactNumber(millions * 1e6);
}

function compactWarTime(weeks: number): string {
  if (weeks >= 520) return '10Y+';
  if (weeks >= 52) return `${format(weeks / 52, 1)}Y`;
  if (weeks >= 9) return `${Math.max(2, Math.round(weeks / 4.33))}M`;
  return `${Math.max(1, Math.round(weeks))}W`;
}

function warTimeRange(minWeeks: number, maxWeeks: number): string {
  if (minWeeks >= 520) return '10Y+';
  return `${compactWarTime(minWeeks)}–${compactWarTime(maxWeeks)}`;
}

function warOutlookLabel(estimate: LiveWarEstimateV2): string {
  return estimate.outlook === 'enemy-collapse' ? 'Enemy collapse likely'
    : estimate.outlook === 'our-collapse' ? 'Our collapse risk'
    : estimate.outlook === 'stalled' ? 'Long attrition'
    : 'Outcome contested';
}

/** World Events is a defeat ledger, not a stream of routine simulation noise. */
function isMajorWorldEvent(event: WorldEventV2): boolean {
  const message = event.message.toLowerCase();
  return event.kind === 'conquest' && /defeated.+conquered its land/.test(message);
}

function signedPeople(millions: number): string {
  return `${millions >= 0 ? '+' : '−'}${people(Math.abs(millions))}`;
}

function warAccessLabel(access: WarAccessV2): string {
  return access === 'naval' ? 'NAVAL' : access === 'land' ? 'LAND' : 'NO ROUTE';
}

function commandAccepted(result: CommandOutcome): boolean {
  if (result === undefined) return true;
  if (typeof result === 'boolean') return result;
  return result.accepted;
}

function commandReason(result: CommandOutcome): string | undefined {
  return typeof result === 'object' && result ? result.reason : undefined;
}

const WORLD_DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
});

function worldDateLabel(tick: number): string {
  const start = Date.UTC(2026, 7, 17);
  return WORLD_DATE_FORMATTER.format(new Date(start + tick * 7 * 24 * 60 * 60 * 1_000)).toUpperCase();
}

function armyCondition(army: ArmyStateV2, territoryCondition = 1): string {
  if (army.manpower <= 0) return 'DEFEATED';
  const fill = army.capacity > 0 ? army.manpower / army.capacity : 0;
  const score = fill * (0.65 + 0.35 * clamp(territoryCondition, 0, 1));
  if (score < 0.3) return 'CRITICAL';
  if (score < 0.6) return 'THIN';
  if (score < 0.85) return 'UNDERSTRENGTH';
  return 'FULL STRENGTH';
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function nextResearchMilestone(
  portfolio: readonly ResearchBranchProgressV2[],
): ResearchBranchProgressV2 | undefined {
  return portfolio.reduce<ResearchBranchProgressV2 | undefined>((nearest, program) => {
    if (program.maxed) return nearest;
    return !nearest || program.progressRatio > nearest.progressRatio ? program : nearest;
  }, undefined);
}

function mapTerritory(
  territoryId: string,
  territory: TerritoryStateV2,
  army: MapTerritoryState['army'],
): MapTerritoryState {
  return {
    id: territoryId,
    ownerId: territory.owner,
    coreOwnerId: territory.coreOwner,
    integration: territory.integration,
    integrationCompletesTick: territory.integrationProgram?.completesTick,
    army,
  };
}

function nationalArmyState(
  engine: WorldEngineV2UIContract,
  playerId: PlayerId,
  strength = engine.armyStrength(playerId),
  militaryBaseSnapshot = engine.militaryBaseSnapshot(),
): ArmyStateV2 {
  const quality = militaryBaseSnapshot.byNation.get(playerId) ?? { attack: 1, defense: 1 };
  return {
    manpower: strength.deployed,
    capacity: strength.capacity,
    baseAttack: quality.attack,
    baseDefense: quality.defense,
  };
}

type IntroMetricValuesV2 = Record<IntroSort, number>;

export interface IntroNationMetricsV2 extends IntroMetricValuesV2 {
  player: NationViewV2;
  army: ArmyStrengthV2;
  combatPower: number;
  economyView: NationalEconomyV2;
  finance: WeeklyFinanceBreakdownV2;
  populationDynamics: PopulationDynamicsV2;
  iqView: ReturnType<typeof selectNationalIqViewV2>;
  rank: number;
}

export interface IntroOpeningMetricsSnapshotV2 {
  contentVersion: string;
  tick: number;
  actionSequence: number;
  humanPlayerId: PlayerId;
  byNation: ReadonlyMap<PlayerId, IntroNationMetricsV2>;
  openingFinance: ReadonlyMap<PlayerId, WeeklyFinanceBreakdownV2>;
  ranking: RankingEntryV2[];
}

/**
 * One bounded cache entry for the nation picker. Search, sort and preview DOM
 * changes never rebuild national simulation selectors while state is unchanged.
 */
export class IntroOpeningMetricsCacheV2 {
  private cached?: IntroOpeningMetricsSnapshotV2;

  read(engine: WorldEngineV2UIContract): IntroOpeningMetricsSnapshotV2 {
    const content = engine.content;
    const { contentVersion, tick, actionSequence, humanPlayerId } = engine.state;
    if (this.cached
      && this.cached.contentVersion === contentVersion
      && this.cached.tick === tick
      && this.cached.actionSequence === actionSequence
      && this.cached.humanPlayerId === humanPlayerId) return this.cached;

    const preview = engine.openingCandidatePreviewSnapshot();
    const previewState = preview.state;
    const militaryBaseSnapshot = preview.militaryBaseSnapshot;
    const powerSnapshot = preview.powerSnapshot;
    const openingFinance = preview.openingFinance;
    const ranking = preview.ranking;
    const rankByNation = new Map(ranking.map((entry, index) => [entry.player.id, index + 1]));
    const byNation = new Map<PlayerId, IntroNationMetricsV2>();

    for (const playerId of content.nationIds) {
      const player = selectNationViewV2(previewState, content, playerId);
      const finance = openingFinance.get(playerId);
      if (!player || !finance) continue;
      const army = selectArmyStrengthV2(previewState, content, playerId);
      const quality = militaryBaseSnapshot.byNation.get(playerId) ?? { attack: 1, defense: 1 };
      const armyState: ArmyStateV2 = {
        manpower: army.deployed,
        capacity: army.capacity,
        baseAttack: quality.attack,
        baseDefense: quality.defense,
      };
      const combatPower = powerSnapshot.byNation.get(playerId) ?? 0;
      const economyView = selectNationalEconomyV2(previewState, content, playerId);
      const iqView = selectNationalIqViewV2(previewState, content, playerId);
      const populationDynamics = selectPopulationDynamicsV2(
        previewState,
        content,
        playerId,
        finance.populationGrowth,
      );
      byNation.set(playerId, {
        player,
        army,
        combatPower,
        economyView,
        finance,
        populationDynamics,
        iqView,
        rank: rankByNation.get(playerId) ?? 999,
        power: combatPower,
        military: combatPower,
        aggressiveness: preview.aggressivenessByNation.get(playerId) ?? 0,
        attack: selectEffectiveAttackV2(
          previewState, content, playerId, armyState, militaryBaseSnapshot,
        ),
        defense: selectEffectiveDefenseV2(
          previewState, content, playerId, armyState, militaryBaseSnapshot,
        ),
        iq: iqView.score,
        manpower: army.deployed,
        economy: economyView.output,
        'gdp-per-capita': economyView.wealthPerPerson / 1e6,
        'economic-growth': finance.annualEconomyGrowthRate * 100,
        tax: economyView.dynamicTaxRate * 100,
        population: economyView.population,
        growth: populationDynamics.annualNetRate * 100,
      });
    }

    this.cached = {
      contentVersion,
      tick,
      actionSequence,
      humanPlayerId,
      byNation,
      openingFinance,
      ranking,
    };
    return this.cached;
  }
}

export function compareIntroNationMetricsV2(
  left: { id: PlayerId; name: string },
  right: { id: PlayerId; name: string },
  sort: IntroSort,
  snapshot: IntroOpeningMetricsSnapshotV2,
): number {
  if (sort === 'power') {
    return (snapshot.byNation.get(left.id)?.rank ?? 999) - (snapshot.byNation.get(right.id)?.rank ?? 999)
      || left.name.localeCompare(right.name, 'en');
  }
  return (snapshot.byNation.get(right.id)?.[sort] ?? 0) - (snapshot.byNation.get(left.id)?.[sort] ?? 0)
    || left.name.localeCompare(right.name, 'en');
}

export interface NationPickerRenderOptionsV2 {
  previewCountryId: PlayerId;
  searchQuery: string;
  continent: string;
  sort: IntroSort;
  context: 'campaign' | 'lobby';
  claimedCountryIds?: ReadonlySet<PlayerId>;
  claimantNames?: ReadonlyMap<PlayerId, string>;
  selectedCountryId?: PlayerId;
  showMultiplayerButton?: boolean;
  content?: WorldContentV2;
  scenarioConfig?: ScenarioConfigV2;
  scenarioEditable?: boolean;
}

export interface IntroRelativeStatSourcesV2 {
  attack: number;
  defense: number;
  iq: number;
  army: number;
  reserve: number;
  population: number;
  economy: number;
  treasury: number;
  economicGrowth: number;
  tax: number;
  populationGrowth: number;
  gdpPerCapita: number;
}

/** Raw scenario opening values only: never player multipliers or human start grants. */
export function introRelativeStatSourcesV2(
  metrics: IntroNationMetricsV2,
): IntroRelativeStatSourcesV2 {
  return {
    attack: metrics.attack,
    defense: metrics.defense,
    iq: metrics.iqView.score,
    army: metrics.army.deployed,
    reserve: metrics.player.trainedReserves,
    population: metrics.economyView.population,
    economy: metrics.economyView.output,
    treasury: metrics.player.treasury,
    economicGrowth: metrics.finance.annualEconomyGrowthRate * 100,
    tax: metrics.economyView.dynamicTaxRate * 100,
    populationGrowth: metrics.populationDynamics.annualNetRate * 100,
    gdpPerCapita: metrics.economyView.wealthPerPerson / 1e6,
  };
}

/** Average-rank percentile; ties and an all-equal field remain neutral at 50%. */
export function introMetricPercentileV2(value: number, population: readonly number[]): number {
  const finite = population.filter(Number.isFinite);
  if (!Number.isFinite(value) || finite.length <= 1) return 0.5;
  const below = finite.filter((candidate) => candidate < value).length;
  const equal = finite.filter((candidate) => candidate === value).length;
  return clamp((below + Math.max(0, equal - 1) / 2) / (finite.length - 1), 0, 1);
}

/** Piecewise red → orange → green so the true median stays visibly orange. */
export function introMetricColorV2(percentile: number): string {
  const p = clamp(percentile, 0, 1);
  const from = p <= 0.5 ? [239, 109, 103] : [240, 173, 98];
  const to = p <= 0.5 ? [240, 173, 98] : [110, 211, 155];
  const mix = p <= 0.5 ? p * 2 : (p - 0.5) * 2;
  const channels = from.map((channel, index) => Math.round(channel + (to[index]! - channel) * mix));
  return `rgb(${channels[0]} ${channels[1]} ${channels[2]})`;
}

function projectSupportedMapArmyV2(
  engine: WorldEngineV2UIContract,
  territoryId: TerritoryId,
  territory: TerritoryStateV2,
  militaryBaseSnapshot: MilitaryBaseSnapshotV2 | undefined,
  empireArmyCapacity: number,
): MapTerritoryState['army'] {
  return {
    ...projectMapArmyV2(engine, territoryId, territory, militaryBaseSnapshot),
    deploymentCapacity: stateTerritoryArmySupportCeilingV2(
      engine.state,
      engine.content,
      territoryId,
      territory.owner,
      empireArmyCapacity,
    ),
  };
}

function terrainProfileHighlights(profile: readonly TerrainProfileEntry[]): readonly TerrainProfileEntry[] {
  const firstThree = profile.slice(0, 3);
  const coastal = profile.find((entry) => entry.terrain === 'coastal');
  if (!coastal || firstThree.some((entry) => entry.terrain === 'coastal')) return firstThree;
  return [...profile.slice(0, 2), coastal];
}

function terrainProfileBadges(profile: readonly TerrainProfileEntry[]): string {
  const highlights = terrainProfileHighlights(profile);
  const percentages = terrainProfileDisplayPercentages(highlights);
  return `<span class="terrain-profile-badges">${highlights.map((entry, index) => {
    const style = terrainPresentation(entry.terrain);
    return `<b style="--terrain:${style.cssColor}"><i>${style.glyph}</i><span>${escapeHtml(style.label.toUpperCase())}</span><em>${percentages[index]}%</em></b>`;
  }).join('')}</span>`;
}

function terrainEffectMetrics(effects: TerritoryTerrainEffectsV2): string {
  const multiplierMetric = (label: string, multiplier: number, lowerIsBetter = false): string => {
    const delta = (multiplier - 1) * 100;
    const benefit = lowerIsBetter ? -delta : delta;
    const tone = Math.abs(delta) < 0.05 ? 'is-neutral' : benefit > 0 ? 'is-positive' : 'is-negative';
    return `<b class="${tone}"><em>${label}</em>${delta >= 0 ? '+' : '−'}${format(Math.abs(delta), 1)}%</b>`;
  };
  const growth = effects.annualEconomyGrowthAdjustment * 100;
  const growthTone = Math.abs(growth) < 0.005 ? 'is-neutral' : growth > 0 ? 'is-positive' : 'is-negative';
  return `<span class="terrain-effect-metrics">${[
    multiplierMetric('DEF', effects.defense),
    multiplierMetric('SUPPLY', effects.supply),
    multiplierMetric('OPS', effects.operationCost, true),
    multiplierMetric('REPAIR', effects.conditionRecovery),
    multiplierMetric('FOOD', effects.foodProduction),
    `<b class="${growthTone}"><em>GDP/YR</em>${growth >= 0 ? '+' : '−'}${format(Math.abs(growth), 2)}PP</b>`,
  ].join('')}</span>`;
}

function terrainProfilePanel(
  profile: readonly TerrainProfileEntry[],
  effects: TerritoryTerrainEffectsV2,
): string {
  const highlights = terrainProfileHighlights(profile);
  const dominant = highlights[0];
  const dominantStyle = terrainPresentation(dominant?.terrain ?? 'plains');
  const percentages = terrainProfileDisplayPercentages(highlights);
  const highlightedShare = Math.max(
    0.000001,
    highlights.reduce((sum, entry) => sum + entry.share, 0),
  );
  const terrainCards = highlights.map((entry, index) => {
    const style = terrainPresentation(entry.terrain);
    return `<article class="${index === 0 ? 'is-dominant' : ''}" style="--terrain:${style.cssColor}"><i>${style.glyph}</i><div><span>${index === 0 ? 'PRIMARY' : `TERRAIN ${index + 1}`}</span><strong>${escapeHtml(style.label)}</strong></div><b>${percentages[index]}%</b></article>`;
  }).join('');
  const composition = highlights.map((entry, index) => {
    const style = terrainPresentation(entry.terrain);
    const normalizedShare = entry.share / highlightedShare * 100;
    return `<b style="--terrain:${style.cssColor};width:${format(normalizedShare, 3)}%" title="${escapeHtml(style.label)} ${percentages[index]}%"></b>`;
  }).join('');
  const metric = (
    code: string,
    label: string,
    multiplier: number,
    lowerIsBetter = false,
  ): string => {
    const delta = (multiplier - 1) * 100;
    const benefit = lowerIsBetter ? -delta : delta;
    const tone = Math.abs(delta) < 0.05 ? 'is-neutral' : benefit > 0 ? 'is-positive' : 'is-negative';
    return `<article class="${tone}"><i>${code}</i><div><span>${label}</span><strong>${delta >= 0 ? '+' : '−'}${format(Math.abs(delta), 1)}%</strong></div></article>`;
  };
  const growth = effects.annualEconomyGrowthAdjustment * 100;
  const growthTone = Math.abs(growth) < 0.005 ? 'is-neutral' : growth > 0 ? 'is-positive' : 'is-negative';
  return `<section class="terrain-profile-card" style="--terrain:${dominantStyle.cssColor}">
    <header class="terrain-profile-card__head"><i>${dominantStyle.glyph}</i><div><span>STRATEGIC TERRAIN</span><strong>${escapeHtml(dominantStyle.label)}-led profile</strong></div><b>${highlights.length} ACTIVE TYPES</b></header>
    <div class="terrain-profile-composition">${terrainCards}</div>
    <i class="terrain-composition-bar" aria-label="Strategic terrain composition">${composition}</i>
    <span class="terrain-effect-label">TERRAIN EFFECTS</span>
    <div class="terrain-effect-grid">
      ${metric('DEF', 'DEFENCE', effects.defense)}
      ${metric('SUP', 'SUPPLY', effects.supply)}
      ${metric('OPS', 'OPERATION COST', effects.operationCost, true)}
      ${metric('REP', 'RECOVERY', effects.conditionRecovery)}
      ${metric('FOD', 'FOOD OUTPUT', effects.foodProduction)}
      <article class="${growthTone}"><i>GDP</i><div><span>GROWTH / YEAR</span><strong>${growth >= 0 ? '+' : '−'}${format(Math.abs(growth), 2)}PP</strong></div></article>
    </div>
  </section>`;
}

export interface NationPickerRenderResultV2 {
  html: string;
  previewCountryId: PlayerId;
  visibleCount: number;
}

export type CountryTraitPresentationSurfaceV2 = 'picker' | 'nation';

/**
 * One country's immutable identity card. Looking up exclusively by the active
 * leader id keeps conquered and fused nations from donating or stacking traits.
 */
export function renderCountryTraitPresentationV2(
  playerId: PlayerId,
  surface: CountryTraitPresentationSurfaceV2,
  content: WorldContentV2 = WORLD_CONTENT_V2,
): string {
  const trait = countryTraitV2(playerId);
  if (!trait) return '';
  const playerMultiplier = humanCountryTraitMultiplierForContentV2(content, playerId);
  const appliedEffect = describeCountryTraitModifiersV2(trait.modifiers, playerMultiplier);
  if (surface === 'nation') {
    return `<section class="country-trait-card country-trait-card--nation country-trait-identity-card" data-country-trait="${escapeHtml(trait.playerId)}"><header><i>✦</i><div><span>NATIONAL IDENTITY</span><strong>${escapeHtml(trait.name)}</strong></div><b>PLAYER ×${format(playerMultiplier, 2)}</b></header><p class="country-trait-identity-card__story">${escapeHtml(trait.description)}</p><div class="country-trait-identity-card__effects"><span>ACTIVE MODIFIERS</span><p>${escapeHtml(appliedEffect)}</p></div></section>`;
  }
  const identity = surface === 'picker'
    ? `<small>${escapeHtml(trait.description)}</small>`
    : '';
  const label = `PLAYER TRAIT <b class="country-trait-card__multiplier">×${format(playerMultiplier, 2)}</b>`;
  return `<section class="country-trait-card country-trait-card--${surface}" data-country-trait="${escapeHtml(trait.playerId)}"><div><span>${label}</span><strong>${escapeHtml(trait.name)}</strong></div><p>${escapeHtml(appliedEffect)}</p>${identity}</section>`;
}

/** Compact map intel: AI owners show their base trait, human owners their live player-scaled trait. */
export function renderCountryTraitIntelV2(
  playerId: PlayerId,
  humanControlled: boolean,
  content: WorldContentV2 = WORLD_CONTENT_V2,
): string {
  const trait = countryTraitV2(playerId);
  if (!trait) return '';
  const multiplier = humanControlled
    ? humanCountryTraitMultiplierForContentV2(content, playerId)
    : 1;
  const effect = describeCountryTraitModifiersV2(trait.modifiers, multiplier);
  return `<section class="country-trait-card country-trait-card--intel" data-country-trait="${escapeHtml(trait.playerId)}"><div><span>${humanControlled ? 'PLAYER TRAIT' : 'COUNTRY TRAIT'}</span><strong>${escapeHtml(trait.name)}</strong></div><p>${escapeHtml(effect)}</p></section>`;
}

export interface ConquestIntegrationPreviewV2 {
  readonly territoryCount: number;
  readonly durationWeeks: number;
  readonly annualCost: number;
  readonly access?: TerritoryIntegrationAccessV2;
  readonly quotes: readonly TerritoryIntegrationQuoteV2[];
}

/** Uses the same immutable per-territory quote as conquest itself. */
export function quoteConquestIntegrationPreviewV2(
  state: WorldStateV2,
  newOwnerId: PlayerId,
  territoryIds: readonly TerritoryId[],
  access?: TerritoryIntegrationAccessV2,
  content: WorldContentV2 = WORLD_CONTENT_V2,
): ConquestIntegrationPreviewV2 {
  // Quote the campaign in capture order. A copied ownership map makes the first
  // conquest condition true once, exactly as runtime capture would, while the
  // authoritative state and every territory object remain untouched.
  const previewState: WorldStateV2 = {
    ...state,
    firstIntegrationDiscountUsedBy: [...state.firstIntegrationDiscountUsedBy],
    territories: { ...state.territories },
  };
  const quotes = territoryIds.map((territoryId) => {
    const quote = quoteTerritoryIntegrationV2(
      previewState,
      content,
      territoryId,
      newOwnerId,
      { cause: 'conquest', ...(access ? { access } : {}) },
    );
    const target = previewState.territories[territoryId];
    if (target) previewState.territories[territoryId] = { ...target, owner: newOwnerId };
    if (quote.firstPlayerIntegrationDiscount) {
      previewState.firstIntegrationDiscountUsedBy = [
        ...previewState.firstIntegrationDiscountUsedBy,
        newOwnerId,
      ].sort((left, right) => left.localeCompare(right));
    }
    return quote;
  });
  return {
    territoryCount: quotes.length,
    durationWeeks: quotes.reduce((longest, quote) => Math.max(longest, quote.durationWeeks), 0),
    annualCost: quotes.reduce((total, quote) => total + quote.annualCost, 0),
    access,
    quotes,
  };
}

/** Shared nation-card, search, sort, continent and detail experience. */
export function renderNationPickerV2(
  opening: IntroOpeningMetricsSnapshotV2,
  options: NationPickerRenderOptionsV2,
): NationPickerRenderResultV2 {
  const content = options.content ?? WORLD_CONTENT_V2;
  const claimed = options.claimedCountryIds ?? new Set<PlayerId>();
  const allNations = [...content.nationIds]
    .map((id) => content.nations[id])
    .filter((nation): nation is NonNullable<typeof nation> => (
      nation !== undefined && opening.byNation.has(nation.id)
    ));
  const nations = allNations.sort((left, right) => (
    compareIntroNationMetricsV2(left, right, options.sort, opening)
  ));
  const desired = content.nations[options.previewCountryId];
  const selected = options.selectedCountryId
    ? content.nations[options.selectedCountryId] : undefined;
  const preview = desired && opening.byNation.has(desired.id) && !claimed.has(desired.id)
    ? desired
    : selected && opening.byNation.has(selected.id) && !claimed.has(selected.id)
      ? selected
      : nations.find((nation) => !claimed.has(nation.id)) ?? nations[0]!;
  const metrics = opening.byNation;
  const previewMetrics = metrics.get(preview.id) ?? metrics.get(nations[0]!.id)!;
  const previewState = previewMetrics.player;
  const army = previewMetrics.army;
  const finance = previewMetrics.finance;
  const economy = previewMetrics.economyView;
  const populationDynamics = previewMetrics.populationDynamics;
  const startingTreasury = openingStartingTreasuryV2(
    preview.id,
    content,
    true,
  );
  const startingArmyMultiplier = humanStartingArmyMultiplierForContentV2(content, preview.id);
  const startingArmy = army.deployed * startingArmyMultiplier;
  const startingArmyBonus = Math.max(0, startingArmy - army.deployed);
  const openingForceIsBoosted = startingArmyMultiplier > 1.000000001;
  const openingForceIsLimited = startingArmyMultiplier < 0.999999999;
  // The shared opening snapshot is deliberately neutral AI state. A human
  // seat below 1x scales its tick-zero trained cadre by the same opening
  // factor; positive Army multipliers use a separate bounded reserve curve,
  // never the full temporary Army multiplier.
  const neutralReserveCapacity = finance.trainedReserveCapacity;
  const humanTraitMultiplier = humanCountryTraitMultiplierForContentV2(content, preview.id);
  const humanTraitContext = { humanControlled: true, humanTraitMultiplier } as const;
  const playerNeutralReserveCapacity = neutralReserveCapacity
    * countryTraitFactorV2(preview.id, 'army-capacity', humanTraitContext)
      / countryTraitFactorV2(preview.id, 'army-capacity')
    * countryTraitFactorV2(preview.id, 'reserve-capacity', humanTraitContext)
      / countryTraitFactorV2(preview.id, 'reserve-capacity');
  const playerReserveTerms = humanOpeningTrainedReserveTermsForContentV2(
    content,
    preview.id,
    previewState.trainedReserves,
    playerNeutralReserveCapacity,
    playerNeutralReserveCapacity * Math.min(1, startingArmyMultiplier),
  );
  const startingTrainedReserve = Math.round(playerReserveTerms.trainedReserves * 1e9) / 1e9;
  const startingArmyAdjustmentNote = openingForceIsBoosted
    ? `<small>+${people(startingArmyBonus)} FULLY FREE · NO FOOD · FADES OVER 30 YEARS</small>`
    : openingForceIsLimited
      ? '<small>OPENING LIMIT · FORCE CAPS UNLOCK TO 1× OVER 30 YEARS</small>'
      : '';
  const startingArmyTitle = openingForceIsBoosted
    ? 'The player-only deployed surplus costs no money or food. It fades over thirty years and never refills; trained reserves use their separate bounded country curve, never the full Army multiplier.'
    : openingForceIsLimited
      ? `Opening limit: deployed Army and trained Reserve start at ×${format(startingArmyMultiplier, 2)}. Their Army and Reserve capacity limits unlock gradually to 1× over thirty years; new troops still require normal recruitment and training.`
      : 'Normal 1× opening Army and trained Reserve, with no player-only opening boost or limit.';
  const startingArmyClass = openingForceIsBoosted
    ? 'stat-player-army--boost'
    : openingForceIsLimited ? 'stat-player-army--limit' : 'stat-player-army--neutral';
  const traitPresentation = renderCountryTraitPresentationV2(preview.id, 'picker', content);
  const neutralRelativeStats = introRelativeStatSourcesV2(previewMetrics);
  const neutralRelativePopulation = [...metrics.values()].map(introRelativeStatSourcesV2);
  const relativeStat = (
    key: keyof IntroRelativeStatSourcesV2,
    label: string,
    value: string,
    className = '',
    note = '',
    extraTitle = '',
  ): string => {
    const percentile = introMetricPercentileV2(
      neutralRelativeStats[key],
      neutralRelativePopulation.map((entry) => entry[key]),
    );
    const percentileOfHundred = Math.round(percentile * 100);
    const explanation = `Neutral opening percentile ${percentileOfHundred} of 100; player and underdog bonuses excluded.`;
    return `<div class="country-preview__relative-stat ${className}" data-intro-source="neutral-opening" data-intro-percentile="${format(percentile * 100, 1)}" style="--intro-stat-color:${introMetricColorV2(percentile)}" title="${escapeHtml([extraTitle, explanation].filter(Boolean).join(' '))}" aria-label="${escapeHtml(`${label} ${value}. ${explanation}`)}"><span>${escapeHtml(label)}</span><strong>${value}</strong>${note}</div>`;
  };
  const renderPreviewStats = (): string => `<div class="country-preview__stats" data-player-opening-reserve="${startingTrainedReserve}" data-scroll-session="${isLobby ? 'lobby' : 'intro'}:country-preview:${preview.id}">
    ${relativeStat('attack', 'ATK', format(previewMetrics.attack, 2), 'stat-atk')}
    ${relativeStat('defense', 'DEF', format(previewMetrics.defense, 2), 'stat-def')}
    ${relativeStat('iq', 'IQ', format(previewMetrics.iqView.score, 1), 'stat-iq', '', iqTitle)}
    ${relativeStat('army', `PLAYER START ARMY · ×${format(startingArmyMultiplier, 2)}`, people(startingArmy), `stat-player-army ${startingArmyClass}`, startingArmyAdjustmentNote, startingArmyTitle)}
    ${relativeStat('reserve', 'TRAINED RESERVE', people(startingTrainedReserve), 'stat-trained-reserve')}
    ${relativeStat('population', 'POPULATION', population(economy.population))}
    ${relativeStat('economy', 'ECONOMY', cash(economy.output), 'stat-economy')}
    ${relativeStat('treasury', 'STARTING TREASURY', cash(startingTreasury), 'stat-treasury')}
    ${relativeStat('economicGrowth', 'ECONOMIC GROWTH', `${signed(finance.annualEconomyGrowthRate * 100, 2)}%`)}
    ${relativeStat('tax', 'TAX', `${format(economy.dynamicTaxRate * 100, 1)}%`, '', '', 'Automatic 10–20% rate from integrated GDP per baseline productive person.')}
    ${relativeStat('populationGrowth', 'POPULATION GROWTH', `${populationDynamics.annualNetRate >= 0 ? '+' : ''}${format(populationDynamics.annualNetRate * 100, 2)}%`)}
    ${relativeStat('gdpPerCapita', 'GDP / CAPITA', cash(economy.wealthPerPerson / 1e6), '', '', 'Live GDP divided by the currently controlled population.')}
  </div>`;
  const query = options.searchQuery.trim().toLocaleLowerCase('en');
  const continents = [...new Set(nations.map((nation) => nation.continent))]
    .sort((left, right) => left.localeCompare(right, 'en'));
  const continentMatches = (continent: string) => options.continent === 'ALL' || continent === options.continent;
  const visibleCount = nations.filter((nation) => continentMatches(nation.continent)
    && (!query || `${nation.name} ${nation.sigil}`.toLowerCase().includes(query))).length;
  const sortLabels: Record<IntroSort, string> = {
    power: 'MILITARY RANKING', military: 'MILITARY POWER', aggressiveness: 'AGGRESSIVENESS',
    attack: 'ATK', defense: 'DEF', iq: 'IQ', manpower: 'ARMY', economy: 'ECONOMY',
    'gdp-per-capita': 'GDP / CAPITA', 'economic-growth': 'ECON GROWTH', tax: 'TAX',
    population: 'PEOPLE', growth: 'POP GROWTH',
  };
  const displayMetric = (nationId: PlayerId): string => {
    const value = metrics.get(nationId)?.[options.sort] ?? 0;
    if (options.sort === 'manpower') return people(value);
    if (options.sort === 'economy' || options.sort === 'gdp-per-capita') return cash(value);
    if (options.sort === 'tax' || options.sort === 'aggressiveness') return `${format(value, 1)}%`;
    if (options.sort === 'population') return population(value);
    if (options.sort === 'growth' || options.sort === 'economic-growth') return `${value >= 0 ? '+' : ''}${format(value, 2)}%`;
    if (options.sort === 'attack' || options.sort === 'defense') return format(value, 2);
    if (options.sort === 'power' || options.sort === 'military') return compactNumber(value);
    return format(value, options.sort === 'iq' ? 1 : 0);
  };
  const isLobby = options.context === 'lobby';
  const actionAttribute = isLobby ? 'data-mp-action' : 'data-action';
  const searchId = isLobby ? 'mp-country-search' : 'country-search';
  const sortId = isLobby ? 'mp-country-sort' : 'country-sort';
  const pickerClass = isLobby ? 'country-select country-select--lobby' : 'country-select modal-card';
  const sortOptions = INTRO_SORT_OPTIONS.map(({ value, label }) => (
    `<option value="${value}" ${options.sort === value ? 'selected' : ''}>${label}</option>`
  )).join('');
  const multiplayerButton = !isLobby && options.showMultiplayerButton
    ? '<button class="secondary-button country-preview__multiplayer" data-action="open-multiplayer">PLAY WITH FRIENDS</button>'
    : '';
  const primaryLabel = isLobby
    ? options.selectedCountryId === preview.id
      ? `✓ ${preview.name.toUpperCase()} SELECTED`
      : `SELECT ${preview.name.toUpperCase()}`
    : `COMMAND ${preview.name.toUpperCase()}`;
  const scenario = options.scenarioConfig;
  const scenarioMode = scenario?.mode ?? content.metadata?.scenarioId ?? 'standard-2026';
  const randomWorld = scenarioMode === 'random-world';
  const scenarioSeed = scenario?.seed ?? content.metadata?.generatedFromSeed;
  const startYear = content.metadata?.startYear ?? 2026;
  const scenarioButtonsDisabled = options.scenarioEditable ? '' : 'disabled aria-disabled="true"';
  const scenarioControls = scenario ? `<div class="scenario-picker" role="group" aria-label="Game mode">
    <div class="scenario-picker__modes">
      <button class="${randomWorld ? '' : 'is-active'}" ${actionAttribute}="scenario-standard" ${scenarioButtonsDisabled}><b>STANDARD 2026</b><span>Authentic opening data</span></button>
      <button class="${randomWorld ? 'is-active' : ''}" ${actionAttribute}="scenario-random" ${scenarioButtonsDisabled}><b>ALTERNATIVE UNIVERSE</b><span>New balance every seed</span></button>
    </div>
    <div class="scenario-picker__seed"><span>${randomWorld ? 'UNIVERSE SEED' : 'SIMULATION SEED'}</span><strong>${scenarioSeed ?? '—'}</strong>${randomWorld && options.scenarioEditable ? `<button ${actionAttribute}="scenario-reroll" title="Generate another Alternative Universe">↻ REROLL</button>` : ''}</div>
  </div>` : '';
  const scenarioDescription = randomWorld
    ? 'Countries keep their geography, but specialized stats and rare outliers rebuild population, economy, military quality and strategic power from the seed.'
    : 'APEX runs the country. You choose who to attack.';
  const sourceLabel = randomWorld
    ? 'Alternative Universe · deterministic generated stats · geography unchanged'
    : 'IQ: learning outcomes · Natural Earth · SIPRI 2025';
  const iqTitle = randomWorld
    ? 'Generated national learning and research capacity for this Alternative Universe seed'
    : 'Calibrated from international learning outcomes, with a regional fallback';
  const cards = nations.map((nation) => {
    const searchable = `${nation.name} ${nation.sigil}`.toLowerCase();
    const hidden = !continentMatches(nation.continent) || (query.length > 0 && !searchable.includes(query));
    const nationEconomicGrowth = metrics.get(nation.id)?.['economic-growth'] ?? 0;
    const isClaimed = claimed.has(nation.id);
    const isCurrent = options.selectedCountryId === nation.id;
    const claimant = options.claimantNames?.get(nation.id);
    const metric = isClaimed
      ? `<span class="country-card__claimed"><b>CLAIMED</b><em>${escapeHtml(claimant ?? 'OTHER PLAYER')}</em></span>`
      : `<span><b>${displayMetric(nation.id)}</b><em>${sortLabels[options.sort]}</em></span>`;
    return `<button class="${nation.id === preview.id ? 'is-selected ' : ''}${isCurrent ? 'is-current ' : ''}${isClaimed ? 'is-claimed' : ''}" ${actionAttribute}="preview-country" data-country="${nation.id}" data-continent="${escapeHtml(nation.continent)}" data-country-name="${escapeHtml(nation.name.toLocaleLowerCase('en'))}" data-name="${escapeHtml(searchable)}" aria-pressed="${nation.id === preview.id}" ${isClaimed ? 'disabled aria-disabled="true"' : ''} ${hidden ? 'hidden' : ''} style="--country:${nation.cssColor}"><i class="country-flag">${countryFlagHtml(nation.id, nation.sigil)}</i><div><strong>${escapeHtml(nation.name)}${isCurrent ? ' · YOUR CHOICE' : ''}</strong><small>${escapeHtml(nation.subregion)} · ${population(nation.real.population)} people</small><em>${cash(nation.real.gdp)} GDP · ${signed(nationEconomicGrowth, 2)}%/yr</em></div>${metric}</button>`;
  }).join('');
  const html = `<section class="${pickerClass}" data-nation-picker="${options.context}" data-scenario="${scenarioMode}">
    <div class="country-select__head">
      <div><div class="panel-kicker">${isLobby ? 'MULTIPLAYER LOBBY · COUNTRY SEAT' : `NEW CAMPAIGN · ${randomWorld ? 'ALTERNATIVE UNIVERSE' : startYear}`}</div><h1>Choose your nation</h1><p>${isLobby ? 'Your choice is reserved for you and cannot be selected by another commander.' : scenarioDescription}</p></div>
      <div class="country-select__head-side">${scenarioControls}<div class="country-select__facts"><span><b>${nations.length}</b> countries</span><span><b>${isLobby ? '2–8' : 'ONE AI'}</b> ${isLobby ? 'players' : 'every country'}</span><span><b>${startYear}</b> start date</span><span><b>${randomWorld ? 'SEEDED' : 'LIVE'}</b> ${randomWorld ? 'world' : 'aggression'}</span></div></div>
    </div>
    <div class="country-select__tools"><label class="country-search"><span>⌕</span><input id="${searchId}" type="search" value="${escapeHtml(options.searchQuery)}" placeholder="Search countries…" autocomplete="off"></label><label class="country-sort"><span>SORT</span><select id="${sortId}" aria-label="Sort countries">${sortOptions}</select></label><div class="country-filters" role="group" aria-label="Filter countries by continent"><button class="${options.continent === 'ALL' ? 'is-active' : ''}" ${actionAttribute}="continent-filter" data-continent="ALL">ALL</button>${continents.map((continent) => `<button class="${options.continent === continent ? 'is-active' : ''}" ${actionAttribute}="continent-filter" data-continent="${escapeHtml(continent)}">${escapeHtml(continent.toUpperCase())}</button>`).join('')}<span>${visibleCount} shown</span></div></div>
    <div class="country-select__body"><div class="country-grid" data-scroll-session="${isLobby ? 'lobby' : 'intro'}:country-grid">${cards}</div><aside class="country-preview" style="--country:${preview.cssColor}"><div class="country-preview__identity"><i class="country-flag country-flag--large">${countryFlagHtml(preview.id, preview.sigil, true)}</i><div><span>MILITARY RANK #${previewMetrics.rank}</span><h2 title="${escapeHtml(preview.name)}">${escapeHtml(previewState.shortName)}</h2><p>${escapeHtml(preview.subregion)}</p></div><b>${compactNumber(previewMetrics.combatPower)}<small>MILITARY POWER</small></b></div>${traitPresentation}${renderPreviewStats()}<div class="country-preview__actions"><button class="primary-button country-preview__start" ${actionAttribute}="${isLobby ? 'select-country' : 'choose-country'}" data-country="${preview.id}">${escapeHtml(primaryLabel)}</button>${multiplayerButton}</div></aside></div>
    <footer><span>${sourceLabel}</span><strong>Sorted by ${escapeHtml(sortLabels[options.sort].toLowerCase())}</strong></footer>
  </section>`;
  return { html, previewCountryId: preview.id, visibleCount };
}

function compareFrontOperations(left: FrontOperationV2, right: FrontOperationV2): number {
  return left.sourceId.localeCompare(right.sourceId)
    || left.targetId.localeCompare(right.targetId)
    || left.commanderId.localeCompare(right.commanderId)
    || left.doctrine.localeCompare(right.doctrine);
}

function warOperationsFor(war: WarStateV2, commanderId: PlayerId): FrontOperationV2[] {
  const operations = war.attackerId === commanderId ? war.attackerOperations
    : war.defenderId === commanderId ? war.defenderOperations : [];
  return [...operations].sort(compareFrontOperations);
}

function allWarOperations(war: WarStateV2): FrontOperationV2[] {
  return [...war.attackerOperations, ...war.defenderOperations].sort(compareFrontOperations);
}

function mapPolarEndgameSnapshotV2(
  state: WorldStateV2,
): NonNullable<WorldMapEngineContract['state']['polarEndgame']> {
  const polar = state.polarEndgame;
  const sectors = Object.fromEntries(Object.entries(polar.sectors).map(([sectorId, sector]) => [
    sectorId,
    {
      status: sector.status,
      integrity: sector.integrity,
      wave: sector.wave,
      discoveredTick: sector.discoveredTick ?? undefined,
      securedTick: sector.securedTick ?? undefined,
      securedBy: sector.securedBy ?? undefined,
    },
  ])) as NonNullable<WorldMapEngineContract['state']['polarEndgame']>['sectors'];
  return {
    phase: polar.phase,
    visualRevision: polar.visualRevision,
    sectors,
    expeditions: polar.expeditions.map((expedition) => ({
      playerId: expedition.playerId,
      sectorId: expedition.sectorId,
      manpower: expedition.manpower,
      initialManpower: expedition.initialManpower,
    })),
  };
}

export function createMapSnapshot(engine: WorldEngineV2UIContract): WorldMapEngineContract['state'] {
  const source = engine.state;
  const militaryBaseSnapshot = engine.militaryBaseSnapshot();
  const canonical = source.territories as unknown as Record<string, TerritoryStateV2>;
  const territoryEntries = Object.entries(canonical);
  const sortedWars = [...source.wars].sort((left, right) => left.id.localeCompare(right.id));
  const territories: Record<string, MapTerritoryState> = {};
  const capacityByOwner = new Map<PlayerId, number>();
  for (const [id, territory] of territoryEntries) {
    let empireArmyCapacity = capacityByOwner.get(territory.owner);
    if (empireArmyCapacity === undefined) {
      empireArmyCapacity = engine.armyStrength(territory.owner).capacity;
      capacityByOwner.set(territory.owner, empireArmyCapacity);
    }
    territories[id] = mapTerritory(
      id,
      territory,
      projectSupportedMapArmyV2(
        engine, id as TerritoryId, territory, militaryBaseSnapshot, empireArmyCapacity,
      ),
    );
  }
  return {
    tick: source.tick,
    humanPlayerId: engine.viewerPlayerId ?? source.humanPlayerId,
    humanPlayerIds: [...source.humanPlayerIds],
    openingMobilisations: mapOpeningMobilisationsV2(source, engine.content),
    territories,
    wars: sortedWars.map((war) => ({
      id: war.id,
      attackerId: war.attackerId,
      defenderId: war.defenderId,
      attackerOperations: [...war.attackerOperations].sort(compareFrontOperations)
        .map((operation) => ({ ...operation })),
      defenderOperations: [...war.defenderOperations].sort(compareFrontOperations)
        .map((operation) => ({ ...operation })),
    })),
    logisticsMovements: engine.recentLogisticsMovements().map((movement) => ({ ...movement })),
    polarEndgame: mapPolarEndgameSnapshotV2(source),
  };
}

export function createMapEngineAdapter(
  engine: WorldEngineV2UIContract,
  ranking: () => RankingEntryV2[],
  controllerNames: ReadonlyMap<PlayerId, string> = new Map(),
): WorldMapEngineContract {
  let snapshot: WorldMapEngineContract['state'] | undefined;
  let snapshotTick = -1;
  let snapshotActionSequence = -1;
  let snapshotHumanPlayerId = '';
  let snapshotHumanPlayerRoster = '';
  let snapshotLifecycleSignature = '';
  let mapStatsInvalidated = false;
  const mapStatsCadence = new MapStatsRefreshCadence();
  const armyByTerritory = new Map<string, MapTerritoryState['army']>();
  const lifecycleKey = (territory: TerritoryStateV2): string => {
    const program = territory.integrationProgram;
    if (program) return `${territory.owner}:${territory.coreOwner}:integrating:${program.fromCoreOwnerId}>${program.toOwnerId}:${program.completesTick}`;
    return `${territory.owner}:${territory.coreOwner}:${territory.integration >= 0.999999 ? 'core' : 'legacy-integrating'}`;
  };
  const materializeSnapshot = (): WorldMapEngineContract['state'] => {
    const source = engine.state;
    const canonical = source.territories as unknown as Record<string, TerritoryStateV2>;
    const territoryEntries = Object.entries(canonical);
    const sortedWars = [...source.wars].sort((left, right) => left.id.localeCompare(right.id));
    const warOwnerIds = new Set(sortedWars.flatMap((war) => [war.attackerId, war.defenderId]));
    const refreshOwnerIds = mapStatsCadence.resolve({
      tick: source.tick,
      territories: territoryEntries.map(([id, territory]) => ({
        id,
        ownerId: territory.owner,
        lifecycleKey: lifecycleKey(territory),
      })),
      warOwnerIds,
    });
    const refreshEntries = territoryEntries.filter(([id, territory]) => (
      refreshOwnerIds.has(territory.owner) || !armyByTerritory.has(id)
    ));
    const militaryBaseSnapshot = refreshEntries.length > 0
      ? engine.militaryBaseSnapshot() : undefined;
    const capacityByOwner = new Map<PlayerId, number>();
    for (const [id, territory] of refreshEntries) {
      let empireArmyCapacity = capacityByOwner.get(territory.owner);
      if (empireArmyCapacity === undefined) {
        empireArmyCapacity = engine.armyStrength(territory.owner).capacity;
        capacityByOwner.set(territory.owner, empireArmyCapacity);
      }
      armyByTerritory.set(
        id,
        projectSupportedMapArmyV2(
          engine, id as TerritoryId, territory, militaryBaseSnapshot, empireArmyCapacity,
        ),
      );
    }
    const territories: Record<string, MapTerritoryState> = {};
    for (const [id, territory] of territoryEntries) {
      const army = armyByTerritory.get(id);
      if (!army) throw new Error(`Map army projection missing for ${id}.`);
      territories[id] = mapTerritory(id, territory, army);
    }
    return {
      tick: source.tick,
      humanPlayerId: engine.viewerPlayerId ?? source.humanPlayerId,
      humanPlayerIds: [...source.humanPlayerIds],
      openingMobilisations: mapOpeningMobilisationsV2(source, engine.content),
      territories,
      wars: sortedWars.map((war) => ({
        id: war.id,
        attackerId: war.attackerId,
        defenderId: war.defenderId,
        attackerOperations: [...war.attackerOperations].sort(compareFrontOperations)
          .map((operation) => ({ ...operation })),
        defenderOperations: [...war.defenderOperations].sort(compareFrontOperations)
          .map((operation) => ({ ...operation })),
      })),
      logisticsMovements: engine.recentLogisticsMovements().map((movement) => ({ ...movement })),
      polarEndgame: mapPolarEndgameSnapshotV2(source),
    };
  };
  const readSnapshot = (): WorldMapEngineContract['state'] => {
    if (!snapshot) throw new Error('Map renderer snapshot requested before sync.');
    return snapshot;
  };
  return {
    get state() {
      return readSnapshot();
    },
    player: (playerId) => {
      const player = engine.player(playerId);
      return player ? {
        ...player,
        isHuman: player.isHuman,
        controllerName: player.isHuman ? controllerNames.get(player.id) : undefined,
      } : undefined;
    },
    territoriesOf: (playerId) => {
      return Object.values(readSnapshot().territories).filter((territory) => territory.ownerId === playerId);
    },
    globalRanking: ranking,
    totalManpower: (playerId) => engine.totalManpower(playerId),
    activeWarBetween: (leftId, rightId) => engine.activeWarBetween(leftId, rightId),
    invalidateMapStats: (territoryIds) => {
      const ownerIds = territoryIds.flatMap((territoryId) => {
        const territory = engine.state.territories[territoryId as TerritoryId];
        return territory ? [territory.owner] : [];
      });
      if (ownerIds.length === 0) return;
      mapStatsCadence.invalidateOwners(ownerIds);
      mapStatsInvalidated = true;
    },
    refreshSnapshot: () => {
      const { tick, actionSequence } = engine.state;
      const humanPlayerId = engine.viewerPlayerId ?? engine.state.humanPlayerId;
      const humanPlayerRoster = [...engine.state.humanPlayerIds]
        .sort((left, right) => left.localeCompare(right)).join('|');
      const canonical = engine.state.territories as unknown as Record<string, TerritoryStateV2>;
      const lifecycleSignature = `${Object.entries(canonical)
        .map(([id, territory]) => `${id}:${lifecycleKey(territory)}`).join('|')}|wars:${[...engine.state.wars]
          .sort((left, right) => left.id.localeCompare(right.id))
          .map((war) => `${war.id}:${war.attackerId}:${war.defenderId}`).join('|')}`;
      if (snapshot && (snapshotHumanPlayerId !== humanPlayerId
        || snapshotHumanPlayerRoster !== humanPlayerRoster)) {
        mapStatsCadence.invalidateOwners([
          ...snapshot.humanPlayerIds,
          snapshot.humanPlayerId,
          ...engine.state.humanPlayerIds,
          humanPlayerId,
        ]);
        mapStatsInvalidated = true;
      }
      if (snapshot && snapshotTick === tick && snapshotActionSequence === actionSequence
        && snapshotHumanPlayerId === humanPlayerId
        && snapshotHumanPlayerRoster === humanPlayerRoster
        && snapshotLifecycleSignature === lifecycleSignature
        && !mapStatsInvalidated) return;
      snapshot = materializeSnapshot();
      snapshotTick = tick;
      snapshotActionSequence = actionSequence;
      snapshotHumanPlayerId = humanPlayerId;
      snapshotHumanPlayerRoster = humanPlayerRoster;
      snapshotLifecycleSignature = lifecycleSignature;
      mapStatsInvalidated = false;
    },
  };
}

export function mapOpeningMobilisationStateV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): MapOpeningMobilisationState | undefined {
  if (!state.humanPlayerIds.includes(playerId)
    || state.tick >= OPENING_ARMY_BONUS_DURATION_TICKS_V2) return undefined;
  const initialMultiplier = humanStartingArmyMultiplierForContentV2(content, playerId);
  if (Math.abs(initialMultiplier - 1) <= 0.0005) return undefined;
  const progress = clamp(
    state.tick / OPENING_ARMY_BONUS_DURATION_TICKS_V2,
    0,
    1,
  );
  return Object.freeze({
    playerId,
    remainingRatio: 1 - progress,
    initialMultiplier,
    currentMultiplier: openingArmyCapacityMultiplierV2(state, content, playerId),
    remainingTicks: Math.max(0, OPENING_ARMY_BONUS_DURATION_TICKS_V2 - state.tick),
    direction: initialMultiplier > 1 ? 'boost' : 'limit',
  });
}

function mapOpeningMobilisationsV2(
  state: WorldStateV2,
  content: WorldContentV2,
): Readonly<Record<string, MapOpeningMobilisationState>> {
  const phases: Record<string, MapOpeningMobilisationState> = {};
  for (const playerId of [...new Set(state.humanPlayerIds)].sort((left, right) => (
    left.localeCompare(right)
  ))) {
    const phase = mapOpeningMobilisationStateV2(state, content, playerId);
    if (phase) phases[playerId] = phase;
  }
  return Object.freeze(phases);
}

export interface TerritoryTooltipCacheResultV2<T> {
  readonly signature: number;
  readonly content: T;
}

/** Lazily rebuilds each territory tooltip once per notified game-state revision. */
export class TerritoryTooltipContentCacheV2<T> {
  private signature = 0;
  private readonly entries = new Map<TerritoryId, TerritoryTooltipCacheResultV2<T>>();

  resolve(territoryId: TerritoryId, create: () => T): TerritoryTooltipCacheResultV2<T> {
    const cached = this.entries.get(territoryId);
    if (cached?.signature === this.signature) return cached;
    const next = Object.freeze({ signature: this.signature, content: create() });
    this.entries.set(territoryId, next);
    return next;
  }

  invalidate(): void {
    this.signature += 1;
  }
}

interface TerritoryTooltipContentV2 {
  readonly html: string;
  readonly hasOpeningMobilisation: boolean;
}

export class WorldUIV2 {
  private readonly hud: HTMLElement;
  private readonly tooltip: HTMLElement;
  private readonly toastLayer: HTMLElement;
  private readonly tooltipContentCache = new TerritoryTooltipContentCacheV2<TerritoryTooltipContentV2 | undefined>();
  private visibleTooltip?: TerritoryTooltipContentV2 & {
    signature: number;
    territoryId: TerritoryId;
  };
  private selectedTerritoryId?: TerritoryId;
  private selectedPolarRegion?: MapPolarRegion;
  private selectedPolarSectorId?: AntarcticSectorIdV2;
  private pendingPolarSectorScrollId?: AntarcticSectorIdV2;
  private panelMode: PanelMode = 'war';
  private introOpen: boolean;
  private fullscreenPromptOpen: boolean;
  private helpOpen = false;
  private soundOptionsOpen = false;
  private inboxOpen = false;
  private eventFeedOpen = false;
  private contextPanelOpen = false;
  private confirmWarTargetId?: PlayerId;
  private confirmCeasefireWarId?: string;
  private confirmArcticProjectId?: ArcticProjectIdV2;
  private polarWarningAcknowledgementPending = false;
  private readonly antarcticDeploymentDrafts = new Map<AntarcticSectorIdV2, string>();
  private introPreviewCountryId: PlayerId;
  private introSearchQuery = '';
  private introContinent = 'ALL';
  private introSort: IntroSort = 'power';
  private introGridScrollTop = 0;
  private readonly introMetricsCache = new IntroOpeningMetricsCacheV2();
  private empireNameDraft = '';
  private empireNameSubmitted = false;
  private rankingCache?: RankingEntryV2[];
  private lastRankingCalculationAt = 0;
  private warTargetCache?: {
    humanId: PlayerId;
    tickBucket: number;
    warSignature: string;
    resistanceSignature: string;
    recommendations: WarTargetCandidate[];
  };
  private warLogisticsPreviewCache?: {
    tick: number;
    actionSequence: number;
    attackerId: PlayerId;
    defenderId: PlayerId;
    preview: WarLogisticsPreviewV2;
  };
  private unsubscribe?: () => void;
  private renderTimer?: number;
  private renderFrame?: number;
  private pendingMapSync = false;
  private initialMapLoaderPaintPending = false;
  private awaitingInitialMapSynchronization = false;
  private introSearchTimer?: number;
  private readonly warOutcomeQueue: WarOutcomeV2[] = [];
  private warOutcomeResumeSpeed?: WorldSpeedV2;
  private readonly conquestTransferTimers = new Set<number>();
  private suppressMapUntil = 0;
  private readonly uiPointerIds = new Set<number>();
  private readonly locallyReadEventIds = new Set<number>();
  private scrollSessions = new Map<string, number>();
  private scrollInteractionUntil = 0;
  private uiHoverBlocked = false;
  private readonly responsiveStyle: HTMLStyleElement;

  constructor(
    private readonly engine: WorldEngineV2UIContract,
    private readonly options: WorldUIV2Options = {},
  ) {
    const defaultPreviewId = engine.content.nationIds.find((id) => id === 'usa')
      ?? engine.content.nationIds[0];
    if (!defaultPreviewId) throw new Error('World UI requires at least one playable country.');
    const preferredPreviewId = options.initialPreviewCountryId
      && engine.content.nations[options.initialPreviewCountryId]
      ? options.initialPreviewCountryId
      : undefined;
    this.introPreviewCountryId = preferredPreviewId ?? defaultPreviewId;
    this.introOpen = options.introOpen ?? true;
    this.fullscreenPromptOpen = this.introOpen && !document.fullscreenElement;
    this.hud = document.querySelector<HTMLElement>('#hud')!;
    this.tooltip = document.querySelector<HTMLElement>('#tooltip')!;
    this.toastLayer = document.querySelector<HTMLElement>('#toast-layer')!;
    this.hud.classList.add('world-ui-v2');
    this.responsiveStyle = document.createElement('style');
    this.responsiveStyle.dataset.worldUiV2 = 'true';
    this.responsiveStyle.textContent = `
      .world-ui-v2 .v2-interactive,
      .world-ui-v2 .glass-panel,
      .world-ui-v2 .modal-card { pointer-events: auto; }
      .world-ui-v2 .v2-rank-badge { flex: none; margin: 0; padding: 3px 7px; border: 1px solid rgba(107,221,242,.32); border-radius: 999px; background: rgba(107,221,242,.10); color: #c3f7ff; font-size: 10px; font-weight: 800; cursor: pointer; }
      .world-ui-v2 .v2-metrics { scrollbar-width: none; }
      .world-ui-v2 .v2-metrics > * { display: flex; }
      .world-ui-v2 .v2-metrics::-webkit-scrollbar { display: none; }
      .world-ui-v2 [data-scroll-session] { overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
      .world-ui-v2 [data-scroll-session]:not(.v2-metrics) { touch-action: pan-y; }
      @media (max-width: 1120px) {
        .world-ui-v2 .v2-topbar { grid-template-columns: minmax(145px,190px) minmax(420px,1fr) auto !important; }
        .world-ui-v2 .v2-metrics span { display: none; }
        .world-ui-v2 .v2-metrics .top-metric--economy > span,
        .world-ui-v2 .v2-metrics .top-metric--treasury > span,
        .world-ui-v2 .v2-metrics .top-metric--military > span,
        .world-ui-v2 .v2-metrics .top-metric--people > span { display: block; font-size: 7px; }
        .world-ui-v2 .v2-metrics small { font-size: 9px !important; }
      }
      @media (max-width: 840px) {
        .world-ui-v2 .v2-topbar { grid-template-columns: minmax(125px,1fr) auto auto !important; }
        .world-ui-v2 .command-topbar .command-identity { display: flex !important; }
        .world-ui-v2 .command-topbar .top-actions { display: flex !important; }
        .world-ui-v2 .command-topbar .v2-metrics { position: absolute; top: 64px; right: 0; left: 0; height: 42px; padding: 4px; display: grid !important; grid-template-columns: repeat(6,minmax(96px,1fr)) !important; overflow-x: auto !important; overflow-y: hidden; border: 1px solid rgba(107,221,242,.12); border-radius: 9px; background: rgba(7,20,34,.94); }
        .world-ui-v2 .v2-metrics > * { min-height: 32px !important; }
        .world-ui-v2 .world-panel.command-drawer { top: 124px; }
        .world-ui-v2 .war-tracker { top: 124px; }
      }
      @media (prefers-reduced-motion: reduce) {
        .world-ui-v2 *, .world-ui-v2 *::before, .world-ui-v2 *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
      }
    `;
    document.head.append(this.responsiveStyle);
    const initialIntroMetrics = this.introMetricsCache.read(engine);
    if (engine.content.metadata?.scenarioId === 'random-world' && !preferredPreviewId) {
      this.introPreviewCountryId = initialIntroMetrics.ranking[0]?.player.id
        ?? this.introPreviewCountryId;
    }
    this.rankingCache = initialIntroMetrics.ranking;
    this.lastRankingCalculationAt = performance.now();
    mapBridge.engine = createMapEngineAdapter(engine, () => this.ranking(), options.controllerNames);
    mapBridge.sync();
    mapBridge.onTerritoryClick = (territoryId) => {
      if (performance.now() >= this.suppressMapUntil) this.selectTerritory(territoryId as TerritoryId);
    };
    mapBridge.onPolarRegionClick = (region) => {
      if (performance.now() >= this.suppressMapUntil) this.selectPolarRegion(region);
    };
    mapBridge.onPolarSectorClick = (sectorId) => {
      if (performance.now() >= this.suppressMapUntil) {
        this.selectPolarSector(sectorId as AntarcticSectorIdV2);
      }
    };
    mapBridge.onTerritoryHover = (territoryId, x, y) => this.showTooltip(territoryId as TerritoryId | undefined, x, y);
    this.unsubscribe = engine.subscribe((_state, change) => this.onStateChange(change));
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('pointerup', this.onWindowPointerRelease, true);
    window.addEventListener('pointercancel', this.onWindowPointerRelease, true);
    window.addEventListener('pointermove', this.onWindowPointerMove, true);
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
    this.hud.addEventListener('pointerdown', this.onHudPointerDown, true);
    this.hud.addEventListener('wheel', this.onHudScrollIntent, { capture: true, passive: true });
    this.hud.addEventListener('scroll', this.onHudScrollIntent, { capture: true, passive: true });
    this.render();
  }

  private viewerPlayerId(): PlayerId {
    return this.engine.viewerPlayerId ?? this.engine.state.humanPlayerId;
  }

  private eventIsUnread(event: WorldEventV2): boolean {
    return this.options.multiplayer
      ? event.unread && !this.locallyReadEventIds.has(event.id)
      : event.unread;
  }

  destroy(): void {
    this.unsubscribe?.();
    if (this.renderTimer !== undefined) window.clearTimeout(this.renderTimer);
    if (this.renderFrame !== undefined) window.cancelAnimationFrame(this.renderFrame);
    if (this.introSearchTimer !== undefined) window.clearTimeout(this.introSearchTimer);
    this.clearConquestTransferEffects();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('pointerup', this.onWindowPointerRelease, true);
    window.removeEventListener('pointercancel', this.onWindowPointerRelease, true);
    window.removeEventListener('pointermove', this.onWindowPointerMove, true);
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    this.hud.removeEventListener('pointerdown', this.onHudPointerDown, true);
    this.hud.removeEventListener('wheel', this.onHudScrollIntent, true);
    this.hud.removeEventListener('scroll', this.onHudScrollIntent, true);
    this.uiPointerIds.clear();
    this.uiHoverBlocked = false;
    mapBridge.onPolarRegionClick = undefined;
    mapBridge.onPolarSectorClick = undefined;
    mapBridge.scene?.clearPolarFocus?.();
    mapBridge.setInputBlocked(false);
    this.hud.classList.remove('world-ui-v2');
    this.responsiveStyle.remove();
  }

  private readonly onHudPointerDown = (event: PointerEvent): void => {
    if ((event.target as HTMLElement | null)?.closest('.glass-panel, .modal-backdrop, .modal-card, [data-action]')) {
      this.uiPointerIds.add(event.pointerId);
      this.suppressMapUntil = performance.now() + 500;
      this.syncMapInputBlock();
    }
  };

  private readonly onWindowPointerRelease = (event: PointerEvent): void => {
    this.uiPointerIds.delete(event.pointerId);
    this.syncMapInputBlock();
  };

  private readonly onWindowPointerMove = (event: PointerEvent): void => {
    const target = event.target instanceof Element ? event.target : undefined;
    const overUi = Boolean(target && this.hud.contains(target) && target.closest(
      '.glass-panel, .modal-backdrop, .modal-card, .command-dock, .world-panel, .war-tracker, .decision-banner, [data-action], input, select, button',
    ));
    if (overUi === this.uiHoverBlocked) return;
    this.uiHoverBlocked = overUi;
    if (overUi) this.suppressMapUntil = performance.now() + 120;
    this.syncMapInputBlock();
  };

  private readonly onFullscreenChange = (): void => {
    if (this.introOpen) this.render();
  };

  private readonly onHudScrollIntent = (event: Event): void => {
    const target = event.target instanceof Element ? event.target : undefined;
    if (!target?.closest('[data-scroll-session]')) return;
    // Let wheel and inertial touch scrolling finish before a live simulation
    // render replaces the active surface. No default input is prevented.
    this.scrollInteractionUntil = performance.now() + 180;
    this.suppressMapUntil = performance.now() + 220;
  };

  private syncMapInputBlock(): void {
    const modalOpen = this.introOpen || this.helpOpen || this.inboxOpen
      || Boolean(this.confirmWarTargetId) || Boolean(this.confirmCeasefireWarId)
      || Boolean(this.confirmArcticProjectId) || this.polarWarningPending()
      || this.warOutcomeQueue.length > 0
      || this.shouldPromptEmpireName() || this.engine.state.gameOver;
    mapBridge.setInputBlocked(modalOpen || this.uiHoverBlocked || this.uiPointerIds.size > 0);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.soundOptionsOpen) {
      this.soundOptionsOpen = false;
      this.render();
      return;
    }
    if (this.introOpen || this.helpOpen || this.inboxOpen || this.confirmWarTargetId
      || this.confirmCeasefireWarId || this.confirmArcticProjectId
      || this.polarWarningPending() || this.warOutcomeQueue.length > 0
      || this.shouldPromptEmpireName()) return;
    if (event.key === 'Escape') {
      this.selectedTerritoryId = undefined;
      this.clearPolarSelection();
      this.contextPanelOpen = false;
      this.updateMapSelection();
      this.render();
    }
  };

  private onStateChange(change: WorldChangeV2): void {
    this.tooltipContentCache.invalidate();
    const audioBasePresentation = {
      viewerPlayerId: this.viewerPlayerId(),
      humanPlayerIds: [...this.engine.state.humanPlayerIds],
    };
    const audioPresentation = change.battle ? {
      ...audioBasePresentation,
      battleFocus: battleScreenFocus([
        mapBridge.scene?.territoryScreenPosition?.(change.battle.targetId),
        mapBridge.scene?.territoryScreenPosition?.(change.battle.sourceId),
      ], window.innerWidth, window.innerHeight),
    } : audioBasePresentation;
    void worldGameAudio.handleWorldChange(change, audioPresentation);
    if (change.warOutcome) {
      // A concluded war replaces the tactical HUD with the outcome report. Any
      // delayed conquest chips would animate behind that modal while also forcing
      // layout reads during the heaviest political-map update. Drop them here.
      this.clearConquestTransferEffects();
      const outcome = change.warOutcome;
      if (enqueueWarOutcomeV2(this.warOutcomeQueue, outcome)) {
        if (!this.options.multiplayer) {
          const pause = beginWarOutcomePauseV2(
            this.warOutcomeResumeSpeed,
            this.engine.state.speed,
            this.warOutcomeQueue.length === 1,
          );
          this.warOutcomeResumeSpeed = pause.resumeSpeed;
          if (pause.shouldPause) this.engine.setSpeed(0);
        }
        this.toast(`${outcome.result.replaceAll('-', ' ').toUpperCase()} · war concluded`,
          outcome.result === 'victory' || outcome.result === 'territorial-gain' ? 'conquest' : 'war');
      }
    }
    if (change.reason === 'empire-named') {
      this.empireNameDraft = '';
      this.empireNameSubmitted = false;
      this.toast('EMPIRE ESTABLISHED', 'conquest');
    }
    if (change.reason === 'nation-defeated' && change.victorId && change.defeatedId) {
      const victor = this.engine.player(change.victorId);
      const defeated = this.engine.player(change.defeatedId);
      const rank = this.engine.globalRanking().findIndex((entry) => entry.player.id === change.victorId) + 1;
      if (victor && defeated) this.toast(
        `${victor.shortName} defeated ${defeated.shortName} and conquered its land · now rank #${Math.max(1, rank)}`,
        'conquest',
      );
    }
    if (change.reason === 'integration-complete' && change.victorId && change.defeatedId) {
      const owner = this.engine.player(change.victorId);
      const formerCore = this.engine.player(change.defeatedId)
        ?? this.engine.content.nations[change.defeatedId];
      if (owner && formerCore) this.toast(
        `${formerCore.shortName} fully integrated · now permanent ${owner.shortName} core territory`,
        'conquest',
      );
    }
    if (change.battle) {
      const humanId = this.viewerPlayerId();
      mapBridge.scene?.playBattle(change.battle);
      if (change.battle.conquered && change.battle.attackerId === humanId) {
        const battle = change.battle;
        const timer = window.setTimeout(() => {
          this.conquestTransferTimers.delete(timer);
          this.playConquestTransfer(battle);
        }, 420);
        this.conquestTransferTimers.add(timer);
      }
    }
    if (change.reason === 'conquest' || change.reason === 'nation-defeated'
      || change.reason === 'integration-complete') this.rankingCache = undefined;
    const highFrequency = change.reason === 'tick' || change.reason === 'battle' || change.reason === 'conquest';
    if (!highFrequency || change.reason === 'conquest') this.warTargetCache = undefined;
    if (!highFrequency) {
      this.rankingCache = undefined;
      this.scheduleRender(change.critical ? 0 : 90);
      return;
    }
    const atWar = this.humanWars().length > 0;
    this.scheduleRender(atWar ? 620 : 1_050);
  }

  /**
   * Engine steps can emit several battles, a conquest and the final tick in one
   * synchronous burst. Collapse that burst into one DOM rebuild and one map
   * snapshot, aligned with the browser's next paint.
   */
  private scheduleRender(delay: number, syncMap = true): void {
    this.pendingMapSync ||= syncMap;
    const queueFrame = () => {
      this.renderTimer = undefined;
      if (this.renderFrame !== undefined) return;
      this.renderFrame = window.requestAnimationFrame(() => {
        this.renderFrame = undefined;
        // Never replace a pressed button between pointerdown and click. Live
        // simulation updates can wait a frame; player input cannot.
        if (this.uiPointerIds.size > 0) {
          this.renderTimer = window.setTimeout(queueFrame, 40);
          return;
        }
        const scrollSettleDelay = this.scrollInteractionUntil - performance.now();
        if (scrollSettleDelay > 0) {
          this.renderTimer = window.setTimeout(queueFrame, Math.min(200, scrollSettleDelay + 18));
          return;
        }
        // Country confirmation makes the loader visible during the click task.
        // Defer the expensive first political-atlas sync by one frame so the
        // browser can actually present that loader before doing the map work.
        if (this.awaitingInitialMapSynchronization
          && this.initialMapLoaderPaintPending
          && this.pendingMapSync) {
          this.initialMapLoaderPaintPending = false;
          queueFrame();
          return;
        }
        const didSyncMap = this.pendingMapSync;
        if (didSyncMap) mapBridge.sync();
        this.pendingMapSync = false;
        this.render();
        if (didSyncMap && this.awaitingInitialMapSynchronization) {
          this.awaitingInitialMapSynchronization = false;
          this.initialMapLoaderPaintPending = false;
          this.options.onInitialMapSynchronized?.();
        }
      });
    };
    if (delay <= 0) {
      if (this.renderTimer !== undefined) {
        window.clearTimeout(this.renderTimer);
        this.renderTimer = undefined;
      }
      queueFrame();
      return;
    }
    if (this.renderTimer !== undefined || this.renderFrame !== undefined) return;
    this.renderTimer = window.setTimeout(queueFrame, delay);
  }

  private ranking(force = false): RankingEntryV2[] {
    const now = performance.now();
    if (force || !this.rankingCache || now - this.lastRankingCalculationAt >= 5_000) {
      this.rankingCache = this.engine.globalRanking();
      this.lastRankingCalculationAt = now;
    }
    return this.rankingCache;
  }

  private humanWars(): WarStateV2[] {
    const humanId = this.viewerPlayerId();
    return this.engine.state.wars.filter((war) => war.attackerId === humanId || war.defenderId === humanId);
  }

  private totalCombatStrength(playerId: string): { deployed: number; capacity: number } {
    return this.engine.totalManpower(playerId);
  }

  private rankingFocusTerritory(playerId: PlayerId, capitalId: TerritoryId): TerritoryId | undefined {
    const capital = this.engine.state.territories[capitalId];
    if (capital?.owner === playerId) return capitalId;
    return (Object.entries(this.engine.state.territories) as [TerritoryId, TerritoryStateV2][])
      .filter(([, territory]) => territory.owner === playerId)
      .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))[0]?.[0];
  }

  private selectTerritory(territoryId: TerritoryId): void {
    if (this.introOpen || this.helpOpen || this.inboxOpen || this.confirmWarTargetId
      || this.confirmCeasefireWarId || this.confirmArcticProjectId
      || this.polarWarningPending() || this.warOutcomeQueue.length > 0
      || this.shouldPromptEmpireName()) return;
    this.selectedTerritoryId = territoryId;
    this.clearPolarSelection();
    this.contextPanelOpen = true;
    this.updateMapSelection();
    this.render();
  }

  private selectPolarRegion(region: MapPolarRegion): void {
    if (this.introOpen || this.helpOpen || this.inboxOpen || this.confirmWarTargetId
      || this.confirmCeasefireWarId || this.confirmArcticProjectId
      || this.polarWarningPending() || this.warOutcomeQueue.length > 0
      || this.shouldPromptEmpireName()) return;
    this.selectedTerritoryId = undefined;
    this.selectedPolarRegion = region;
    this.selectedPolarSectorId = undefined;
    this.pendingPolarSectorScrollId = undefined;
    this.contextPanelOpen = true;
    this.updateMapSelection();
    mapBridge.scene?.focusPolarRegion?.(region);
    this.render();
  }

  private selectPolarSector(sectorId: AntarcticSectorIdV2): void {
    if (this.introOpen || this.helpOpen || this.inboxOpen || this.confirmWarTargetId
      || this.confirmCeasefireWarId || this.confirmArcticProjectId
      || this.polarWarningPending() || this.warOutcomeQueue.length > 0
      || this.shouldPromptEmpireName()) return;
    this.selectedTerritoryId = undefined;
    this.selectedPolarRegion = 'antarctica';
    this.selectedPolarSectorId = sectorId;
    this.pendingPolarSectorScrollId = sectorId;
    this.contextPanelOpen = true;
    this.updateMapSelection();
    // A sector click must end on the precise sector flight, never the wider
    // Antarctica overview used by the general polar-region callback.
    mapBridge.scene?.focusPolarSector?.(sectorId);
    this.render();
  }

  private clearPolarSelection(): void {
    this.selectedPolarRegion = undefined;
    this.selectedPolarSectorId = undefined;
    this.pendingPolarSectorScrollId = undefined;
    mapBridge.scene?.clearPolarFocus?.();
  }

  private polarWarningPending(playerId = this.viewerPlayerId()): boolean {
    const polar = this.engine.state.polarEndgame;
    return polar.warningTick !== null && !polar.warningAcknowledgedBy.includes(playerId);
  }

  private updateMapSelection(): void {
    mapBridge.setSelection({
      sourceId: this.selectedTerritoryId,
      legalTargetIds: [],
      hintTargetIds: this.attackableMapTerritoryIds(),
    });
  }

  /** All countries the player may legally attack now, rendered as quiet map hints. */
  private attackableMapTerritoryIds(): TerritoryId[] {
    const humanId = this.viewerPlayerId();
    const candidateOwners = new Set<PlayerId>();
    for (const source of this.engine.territoriesOf(humanId)) {
      for (const connection of this.engine.content.territories[source.id]?.connections ?? []) {
        const owner = this.engine.state.territories[connection.targetId]?.owner;
        if (owner && owner !== humanId) candidateOwners.add(owner);
      }
    }
    const attackableOwners = new Set([...candidateOwners].filter((targetId) => (
      this.engine.warDeclarationStatus(humanId, targetId).allowed
    )));
    return this.engine.content.territoryIds.filter((territoryId) => {
      const owner = this.engine.state.territories[territoryId]?.owner;
      return Boolean(owner && attackableOwners.has(owner));
    });
  }

  private previewWarTarget(targetId?: TerritoryId): void {
    if (!targetId || !this.engine.state.territories[targetId]) return;
    mapBridge.setSelection({
      sourceId: this.selectedTerritoryId,
      targetId,
      legalTargetIds: [targetId],
      hintTargetIds: this.attackableMapTerritoryIds(),
    });
    mapBridge.scene?.focusAction(undefined, targetId);
  }

  private setPanel(mode: PanelMode): void {
    const samePanel = this.contextPanelOpen && !this.selectedTerritoryId
      && !this.selectedPolarRegion && this.panelMode === mode;
    this.selectedTerritoryId = undefined;
    this.clearPolarSelection();
    this.updateMapSelection();
    this.panelMode = mode;
    this.soundOptionsOpen = false;
    this.contextPanelOpen = !samePanel;
    this.render();
  }

  private showTooltip(territoryId: TerritoryId | undefined, x: number, y: number): void {
    if (!territoryId) {
      this.tooltip.classList.remove('is-visible');
      return;
    }
    const cached = this.tooltipContentCache.resolve(
      territoryId,
      () => this.buildTerritoryTooltipContent(territoryId),
    );
    const content = cached.content;
    if (!content) {
      this.tooltip.classList.remove('is-visible');
      return;
    }
    if (this.visibleTooltip?.territoryId !== territoryId
      || this.visibleTooltip.signature !== cached.signature) {
      if (this.visibleTooltip?.html !== content.html) this.tooltip.innerHTML = content.html;
      this.visibleTooltip = { territoryId, signature: cached.signature, ...content };
    }
    this.positionTooltip(x, y, content.hasOpeningMobilisation);
    this.tooltip.classList.add('is-visible');
  }

  private buildTerritoryTooltipContent(territoryId: TerritoryId): TerritoryTooltipContentV2 | undefined {
    const territory = this.engine.state.territories[territoryId];
    const definition = this.engine.content.territories[territoryId];
    const owner = territory ? this.engine.player(territory.owner) : undefined;
    if (!territory || !definition || !owner) return;
    const integrating = territory.coreOwner !== territory.owner && territory.integration < 0.999999;
    const integrationStatus = integrating
      ? `INTEGRATING ${format(territory.integration * 100)}%` : 'CORE TERRITORY';
    const localHuman = owner.id === this.viewerPlayerId();
    const openingMobilisation = definition.initialOwnerId === owner.id
      ? mapOpeningMobilisationStateV2(
        this.engine.state,
        this.engine.content,
        owner.id,
      )
      : undefined;
    const openingRemainingPercent = openingMobilisation
      ? Math.round(openingMobilisation.remainingRatio * 100) : 0;
    const openingDirectionLabel = openingMobilisation?.direction === 'boost' ? 'BOOST' : 'LIMIT';
    const openingEffectLabel = openingMobilisation?.direction === 'boost'
      ? 'temporary extra homeland Army + cap' : 'temporary reduced homeland Army + cap';
    const openingMobilisationHtml = openingMobilisation ? `
      <div class="tooltip__opening-mobilisation tooltip__opening-mobilisation--${openingMobilisation.direction}">
        <div><span>OPENING MOBILISATION · ${openingDirectionLabel}</span><strong>${openingRemainingPercent}% REMAINING</strong></div>
        <i role="progressbar" aria-label="Opening mobilisation remaining" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${openingRemainingPercent}"><b style="width:${openingRemainingPercent}%"></b></i>
        <small><b>×${format(openingMobilisation.currentMultiplier, 2)} · ${openingEffectLabel}</b><span>${format(openingMobilisation.remainingTicks / 52, 1)} years until permanent ×1</span></small>
      </div>` : '';
    const controllerName = this.options.controllerNames?.get(owner.id);
    const controller = owner.isHuman
      ? `<b class="tooltip__controller ${localHuman ? 'is-local' : ''}">${localHuman ? 'YOU' : escapeHtml(controllerName ?? 'PLAYER')}</b>`
      : '';
    const localArmyCapacity = stateTerritoryArmyCapacityTargetV2(
      this.engine.state, this.engine.content, territoryId, owner.id,
    );
    const deploymentCeiling = stateTerritoryArmySupportCeilingV2(
      this.engine.state, this.engine.content, territoryId, owner.id,
    );
    const terrainProfile = territoryTerrainProfileV2(this.engine.content, territoryId);
    const terrainStyle = terrainPresentation(terrainProfile[0]?.terrain ?? definition.terrain);
    const terrainEffects = territoryTerrainEffectsV2(this.engine.content, territoryId);
    const localPower = this.engine.territoryPower(territoryId);
    const attack = this.engine.effectiveAttack(owner.id, territory.army);
    const defense = this.engine.effectiveDefense(owner.id, territory.army);
    return {
      html: `
      <div class="tooltip__eyebrow"><span>${escapeHtml(REGION_BY_ID[definition.regionId]?.name ?? definition.regionId)}</span>${terrainProfileBadges(terrainProfile)}</div>
      <div class="tooltip__identity" style="--owner:${owner.cssColor}"><i class="country-flag">${countryFlagHtml(owner.id, owner.sigil)}</i><div><strong>${escapeHtml(definition.name)}</strong><span>${escapeHtml(owner.name)}</span></div>${controller}</div>
      <div class="tooltip__terrain" style="--terrain:${terrainStyle.cssColor}">${terrainEffectMetrics(terrainEffects)}</div>
      ${openingMobilisationHtml}
      <div class="tooltip__grid"><article><span>ACTIVE ARMY</span><strong>${people(territory.army.manpower)}</strong><small>${people(localArmyCapacity)} local cap</small></article><article><span>LOCAL POWER</span><strong>${compactNumber(localPower)}</strong><small>${armyCondition(territory.army, territory.condition)}</small></article><article><span>COMBAT</span><strong>ATK ${format(attack, 1)} · DEF ${format(defense, 1)}</strong><small>${people(deploymentCeiling)} deployment max</small></article></div>
      <div class="tooltip__footer"><b class="${integrating ? 'is-integrating' : ''}">${integrationStatus}</b><span>Click for full intelligence</span></div>
    `,
      hasOpeningMobilisation: Boolean(openingMobilisation),
    };
  }

  private positionTooltip(x: number, y: number, hasOpeningMobilisation: boolean): void {
    this.tooltip.style.left = `${Math.max(10, Math.min(window.innerWidth - 334, x + 16))}px`;
    this.tooltip.style.top = `${Math.max(10, Math.min(window.innerHeight - (hasOpeningMobilisation ? 278 : 224), y + 14))}px`;
  }

  private toast(message: string, tone: 'default' | 'war' | 'conquest' = 'default'): void {
    const activeToasts = this.toastLayer.querySelectorAll('.toast');
    if (activeToasts.length >= 4) activeToasts[0]?.remove();
    const element = document.createElement('div');
    element.className = `toast toast--${tone}`;
    element.textContent = message;
    this.toastLayer.append(element);
    window.setTimeout(() => element.classList.add('toast--show'), 15);
    window.setTimeout(() => {
      element.classList.remove('toast--show');
      window.setTimeout(() => element.remove(), 220);
    }, toastVisibilityDuration(tone));
  }

  private playConquestTransfer(battle: BattleEventV2): void {
    const origin = mapBridge.scene?.territoryScreenPosition?.(battle.targetId) ?? {
      x: window.innerWidth * 0.52,
      y: window.innerHeight * 0.46,
    };
    const captured = this.engine.state.territories[battle.targetId];
    const unlockedShare = captured?.integration ?? 1;
    const gains = [
      battle.capturedEconomy > 0.0001
        ? { target: 'economy', label: `+${cash(battle.capturedEconomy * unlockedShare)} NOW`, tone: 'economy' } : undefined,
      battle.treasurySeized > 0.0001
        ? { target: 'cash', label: `+${cash(battle.treasurySeized)}`, tone: 'cash' } : undefined,
      battle.capturedPopulation > 0.0001
        ? { target: 'people', label: `+${people(battle.capturedPopulation * unlockedShare)} NOW`, tone: 'people' } : undefined,
      { target: 'food', label: `+${format(unlockedShare * 100)}% FOOD NETWORK`, tone: 'food' },
      captured && captured.army.capacity > 0.000001
        ? { target: 'army', label: `+${people(captured.army.capacity)} CAP`, tone: 'army' } : undefined,
    ].filter((gain): gain is { target: string; label: string; tone: string } => Boolean(gain));
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    gains.forEach((gain, index) => {
      const timer = window.setTimeout(() => {
        this.conquestTransferTimers.delete(timer);
        const destination = this.hud.querySelector<HTMLElement>(`[data-stat-target="${gain.target}"]`);
        if (!destination) return;
        const end = destination.getBoundingClientRect();
        const chip = document.createElement('div');
        chip.className = `conquest-transfer-chip conquest-transfer-chip--${gain.tone}`;
        chip.textContent = gain.label;
        chip.style.left = `${Math.max(16, Math.min(window.innerWidth - 120, origin.x))}px`;
        chip.style.top = `${Math.max(80, Math.min(window.innerHeight - 80, origin.y))}px`;
        document.body.append(chip);
        if (reducedMotion) {
          destination.classList.add('is-receiving-gain');
          window.setTimeout(() => destination.classList.remove('is-receiving-gain'), 500);
          chip.remove();
          return;
        }
        const dx = end.left + end.width / 2 - origin.x;
        const dy = end.top + end.height / 2 - origin.y;
        const animation = chip.animate([
          { opacity: 0, transform: 'translate(-50%,-50%) scale(.78)' },
          { opacity: 1, transform: 'translate(-50%,-62%) scale(1)', offset: 0.18 },
          { opacity: 0.92, transform: `translate(calc(-50% + ${dx * 0.65}px), calc(-50% + ${dy * 0.65 - 18}px)) scale(.92)`, offset: 0.72 },
          { opacity: 0, transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.55)` },
        ], { duration: 1_050, easing: 'cubic-bezier(.2,.72,.22,1)', fill: 'forwards' });
        animation.onfinish = () => {
          chip.remove();
          destination.classList.add('is-receiving-gain');
          window.setTimeout(() => destination.classList.remove('is-receiving-gain'), 520);
        };
      }, index * 135);
      this.conquestTransferTimers.add(timer);
    });
  }

  private clearConquestTransferEffects(): void {
    for (const timer of this.conquestTransferTimers) window.clearTimeout(timer);
    this.conquestTransferTimers.clear();
    document.querySelectorAll<HTMLElement>('.conquest-transfer-chip').forEach((chip) => chip.remove());
    this.hud.querySelectorAll<HTMLElement>('.is-receiving-gain').forEach((target) => {
      target.classList.remove('is-receiving-gain');
    });
  }

  private render(): void {
    const introSearch = this.hud.querySelector<HTMLInputElement>('#country-search');
    const restoreIntroSearchFocus = introSearch === document.activeElement;
    const introSearchSelectionStart = introSearch?.selectionStart ?? this.introSearchQuery.length;
    const introSearchSelectionEnd = introSearch?.selectionEnd ?? introSearchSelectionStart;
    if (introSearch) this.introSearchQuery = introSearch.value;
    const scrollSnapshot = captureScrollSessions(
      this.hud.querySelectorAll<HTMLElement>('[data-scroll-session]'),
      this.scrollSessions,
    );
    this.scrollSessions = scrollSnapshot;
    const introGrid = this.hud.querySelector<HTMLElement>('.country-grid');
    if (introGrid) this.introGridScrollTop = introGrid.scrollTop;
    const empireInput = this.hud.querySelector<HTMLInputElement>('#empire-name');
    const restoreEmpireFocus = empireInput === document.activeElement;
    if (empireInput) this.empireNameDraft = empireInput.value;
    const expeditionInput = this.hud.querySelector<HTMLInputElement>('.polar-expedition-input');
    const restoreExpeditionFocus = expeditionInput === document.activeElement;
    const expeditionSectorId = expeditionInput?.dataset.sector as AntarcticSectorIdV2 | undefined;
    if (expeditionInput && expeditionSectorId) {
      this.antarcticDeploymentDrafts.set(expeditionSectorId, expeditionInput.value);
    }

    const state = this.engine.state;
    const viewerId = this.viewerPlayerId();
    const viewer = this.engine.player(viewerId);
    const human = viewer ?? this.engine.player(state.humanPlayerId);
    const spectating = !viewer;
    if (!human) {
      if (state.gameOver) {
        this.tooltip.classList.remove('is-visible');
        // A final defeat report is still part of the completed war. Show it
        // before the absorption screen even though the selected backend nation
        // has already disappeared; dismissing it cannot restart a finished game.
        const pendingOutcome = this.warOutcomeQueue[0];
        this.hud.innerHTML = pendingOutcome
          ? this.renderWarOutcome(pendingOutcome)
          : this.renderGameOver();
        this.bindActions();
        this.syncMapInputBlock();
      }
      return;
    }
    const introOpening = this.introOpen ? this.introMetricsCache.read(this.engine) : undefined;
    if (introOpening && this.rankingCache !== introOpening.ranking) {
      this.rankingCache = introOpening.ranking;
      this.lastRankingCalculationAt = performance.now();
    }
    const humanOpening = introOpening?.byNation.get(human.id);
    const economy = humanOpening?.economyView ?? this.engine.nationalEconomy(human.id);
    const finance = humanOpening?.finance ?? this.engine.weeklyFinanceBreakdown(human.id);
    const topbarIq = humanOpening?.iqView
      ?? selectNationalIqViewV2(this.engine.state, this.engine.content, human.id);
    // This is the authoritative next-week recurring forecast.
    const displayedNet = finance.net;
    const treasuryTopbar = treasuryTopbarPresentationV2(
      human.treasury,
      displayedNet,
      finance.reserveTarget,
    );
    const army = humanOpening?.army ?? this.engine.armyStrength(human.id);
    const combatPower = humanOpening?.combatPower ?? this.engine.currentPower(human.id);
    // Reuse the already calculated finance plan. Population dynamics otherwise
    // calculate a second full finance/power snapshot for the same render.
    const populationDynamics = humanOpening?.populationDynamics
      ?? this.engine.populationDynamics(human.id, finance.populationGrowth);
    const topbarGdpPerCapitaAnnualGrowth = Math.max(
      -0.99,
      (1 + finance.annualEconomyGrowthRate)
        / Math.max(0.01, 1 + populationDynamics.annualNetRate)
        - 1,
    );
    const integratedPopulation = this.engine.controlledPopulation(human.id);
    const completedUpgrades = Object.values(human.research.breakthroughs).reduce((sum, value) => sum + value, 0);
    const ranking = introOpening?.ranking ?? this.ranking();
    const humanRank = Math.max(1, ranking.findIndex((entry) => entry.player.id === human.id) + 1);
    const unread = state.events.filter((event) => this.eventIsUnread(event) && isMajorWorldEvent(event)).length;
    const pendingOffers = viewer
      ? state.offers.filter((offer) => offer.toId === viewer.id && offer.status === 'pending')
      : [];
    const activeOffer = pendingOffers[0];
    const activeAllianceOffer = viewer
      ? state.allianceOffers.find((offer) => offer.toId === viewer.id)
      : undefined;
    const wars = this.humanWars();
    const warOutcome = this.warOutcomeQueue[0];
    const polarWarning = !this.introOpen && !spectating && !state.gameOver
      && this.polarWarningPending(viewerId);
    if (!polarWarning) this.polarWarningAcknowledgementPending = false;
    const commandOpen = this.contextPanelOpen && !this.selectedTerritoryId && !this.selectedPolarRegion;
    if (this.introOpen || this.helpOpen || this.inboxOpen || this.confirmWarTargetId
      || this.confirmCeasefireWarId || this.confirmArcticProjectId || polarWarning
      || warOutcome || this.shouldPromptEmpireName() || state.gameOver) {
      this.tooltip.classList.remove('is-visible');
    }

    this.hud.innerHTML = `
      <header class="situation-topbar command-topbar glass-panel v2-topbar v2-interactive simple-topbar unified-topbar" style="grid-template-columns:minmax(190px,250px) minmax(520px,1fr) auto">
        <div class="coalition-chip command-identity" style="--coalition:${human.cssColor}">
          <span class="country-flag" aria-hidden="true">${countryFlagHtml(human.id, human.sigil, true)}</span><div class="coalition-chip__body"><small>${worldDateLabel(state.tick)}</small><div class="command-identity__line"><strong title="${escapeHtml(human.name)}">${escapeHtml(human.shortName)}</strong><button class="v2-rank-badge" data-action="ranking" aria-label="Open global military ranking; ${escapeHtml(human.name)} is military rank ${humanRank} of ${ranking.length} active countries">#${humanRank}/${ranking.length}</button></div></div>
        </div>
        <nav class="strategic-metrics v2-metrics simple-metrics topbar-status" style="display:grid;grid-template-columns:repeat(6,minmax(88px,1fr));gap:4px;overflow-x:auto" aria-label="National status shortcuts">
          <button type="button" class="top-metric top-metric--economy" data-action="panel" data-panel="economy" data-stat-target="economy" title="Total economic output and yearly growth. Below: output per person and its independent yearly trend." aria-label="Open Economy. Output ${cash(economy.controlledOutput)}; output per person ${cash(economy.wealthPerPerson / 1e6)}; annual output per person change ${signed(topbarGdpPerCapitaAnnualGrowth * 100, 2)} percent; total economy annual growth ${signed(finance.annualEconomyGrowthRate * 100, 2)} percent"><span>ECONOMY</span><strong>${cash(economy.controlledOutput)} <i class="${finance.annualEconomyGrowthRate >= 0 ? 'is-positive' : 'is-negative'}">${signed(finance.annualEconomyGrowthRate * 100, 2)}%</i></strong><small><b class="${topbarGdpPerCapitaAnnualGrowth >= 0 ? 'is-positive' : 'is-negative'}">${cash(economy.wealthPerPerson / 1e6)}/person ${signed(topbarGdpPerCapitaAnnualGrowth * 100, 2)}%</b></small></button>
          <button type="button" class="top-metric ${treasuryTopbar.className}" data-action="panel" data-panel="economy" data-stat-target="cash" title="Available national cash and how much of the APEX reserve target is filled. Below: projected net cashflow per year." aria-label="Open Economy. ${escapeHtml(treasuryTopbar.ariaLabel)}"><span>TREASURY</span><strong>${treasuryTopbar.value} <i class="${treasuryTopbar.reserveFillClassName}">${treasuryTopbar.reserveFill} TARGET</i></strong><small class="weekly-delta ${displayedNet >= 0 ? 'is-positive' : 'is-negative'}">Cashflow ${signedCash(annual(displayedNet))}/yr</small></button>
          <button type="button" class="top-metric top-metric--military" data-action="panel" data-panel="war" data-stat-target="army" title="Ready force and trained reserves. Below: combat power and APEX military budget priority; actual upkeep funding is shown in War." aria-label="Open War. Army ${people(army.deployed)} of ${people(army.capacity)} capacity; trained reserves ${people(human.trainedReserves)} of ${people(finance.trainedReserveCapacity)} capacity; APEX military budget priority ${human.budget.military} percent; actual upkeep funding ${format((finance.armyUpkeep > 0 ? finance.fundedArmyUpkeep / finance.armyUpkeep : 1) * 100, 1)} percent; combat power ${compactNumber(combatPower)}"><span>MILITARY · RES</span><strong>${format(army.fillRatio * 100)}% · R ${people(human.trainedReserves)}</strong><small>${compactNumber(combatPower)} power · PRIORITY ${human.budget.military}%</small></button>
          <button type="button" class="top-metric top-metric--people" data-action="panel" data-panel="nation" data-stat-target="people" title="Integrated population and yearly change. Below: live national IQ, including empire fusion and research." aria-label="Open Nation. Integrated population ${format(integratedPopulation, 2)} million; national IQ ${format(topbarIq.score, 1)}; annual population change ${signed(populationDynamics.annualNetRate * 100, 2)} percent"><span>PEOPLE</span><strong>${population(integratedPopulation)} <i class="${populationDynamics.annualNetRate >= 0 ? 'is-positive' : 'is-negative'}">${signed(populationDynamics.annualNetRate * 100, 2)}%</i></strong><small><b>IQ ${format(topbarIq.score, 1)}</b></small></button>
          <button type="button" class="top-metric top-metric--food" data-action="panel" data-panel="nation" data-stat-target="food" title="Share of national food demand supplied. Below: stored food versus storage capacity." aria-label="Open Nation. Food coverage ${format(finance.foodCoverage * 100, 1)} percent; stock ${people(human.foodStock)} of ${people(finance.foodStorageCapacity)}"><span>FOOD</span><strong class="${finance.foodCoverage >= 0.98 ? 'is-positive' : 'is-negative'}">${format(finance.foodCoverage * 100, 1)}% supplied</strong><small>${people(human.foodStock)} / ${people(finance.foodStorageCapacity)} stored</small></button>
          <button type="button" class="top-metric top-metric--research" data-action="panel" data-panel="research" title="Completed national upgrades. Below: automatic research funding per year." aria-label="Open Research. ${completedUpgrades} completed upgrades; ${cash(annual(finance.research))} funded per year"><span>RESEARCH</span><strong>${completedUpgrades} upgrades</strong><small>${cash(annual(finance.research))} / year</small></button>
        </nav>
        <div class="top-actions">
          <button class="icon-button inbox-button ${unread ? 'has-alert' : ''}" data-action="inbox" title="Reports">⌁${unread ? `<i>${unread}</i>` : ''}</button>
          <button type="button" class="icon-button sound-options-button ${this.soundOptionsOpen ? 'is-active' : ''}" data-action="sound-options" aria-label="Sound options" aria-expanded="${this.soundOptionsOpen}" title="Sound options">♪</button>
          <button class="icon-button" data-action="camera-reset" title="Center map">⌖</button>
          <button class="icon-button" data-action="help" title="Help">?</button>
        </div>
      </header>

      ${this.soundOptionsOpen ? this.renderSoundOptions() : ''}

      ${!spectating ? `<nav class="command-dock glass-panel" aria-label="Command center">
        <button class="${commandOpen && this.panelMode === 'war' ? 'is-active' : ''} ${wars.length ? 'has-war' : ''}" data-action="panel" data-panel="war"><i>⚔</i><span><b>WAR</b><small>${wars.length ? `${wars.length} active` : 'Choose target'}</small></span></button>
        <button class="${commandOpen && this.panelMode === 'nation' ? 'is-active' : ''}" data-action="panel" data-panel="nation"><i>◇</i><span><b>NATION</b><small>AI · ${escapeHtml(finance.aiMode)}</small></span></button>
        <button class="${commandOpen && this.panelMode === 'research' ? 'is-active' : ''}" data-action="panel" data-panel="research"><i>⌁</i><span><b>RESEARCH</b><small>${completedUpgrades} upgrades</small></span></button>
        <button class="${commandOpen && this.panelMode === 'economy' ? 'is-active' : ''} ${displayedNet < 0 ? 'is-negative' : ''}" data-action="panel" data-panel="economy"><i>$</i><span><b>ECONOMY</b><small>${signed(finance.annualEconomyGrowthRate * 100, 2)}%/yr</small></span></button>
      </nav>` : ''}

      ${wars.length || human.warFatigue > 0 || this.engine.globalResistance().threat > 0
        ? this.renderWarStrainMeter(human, wars, army, finance, true) : ''}
      ${wars.length ? this.renderWarTracker(wars, finance) : ''}
      ${this.contextPanelOpen && !spectating ? this.renderContextPanel(human, economy, finance, populationDynamics) : ''}
      ${activeOffer ? this.renderOfferBanner(activeOffer)
        : activeAllianceOffer ? this.renderAllianceOfferBanner(activeAllianceOffer) : ''}
      ${!warOutcome && introOpening ? this.renderIntro(introOpening) : ''}
      ${!warOutcome && this.fullscreenPromptOpen ? this.renderFullscreenRecommendation() : ''}
      ${!warOutcome && polarWarning ? this.renderPolarWarning(human) : ''}
      ${!warOutcome && !polarWarning && this.helpOpen ? this.renderHelp() : ''}
      ${!warOutcome && !polarWarning && this.inboxOpen ? this.renderInbox() : ''}
      ${!warOutcome && !polarWarning && this.confirmWarTargetId ? this.renderWarConfirmation(this.confirmWarTargetId) : ''}
      ${!warOutcome && !polarWarning && this.confirmCeasefireWarId ? this.renderCeasefireConfirmation(this.confirmCeasefireWarId) : ''}
      ${!warOutcome && !polarWarning && this.confirmArcticProjectId ? this.renderArcticProjectConfirmation(human, this.confirmArcticProjectId) : ''}
      ${warOutcome ? this.renderWarOutcome(warOutcome) : ''}
      ${!warOutcome && !polarWarning && this.shouldPromptEmpireName() && !this.helpOpen && !this.inboxOpen && !this.confirmWarTargetId && !this.confirmCeasefireWarId && !this.confirmArcticProjectId ? this.renderEmpireNamePrompt() : ''}
      ${!warOutcome && state.gameOver ? this.renderGameOver() : ''}
      ${!warOutcome && !state.gameOver && !viewer ? this.renderSpectatorBanner(viewerId, human) : ''}
    `;
    this.bindActions();
    restoreScrollSessions(
      this.hud.querySelectorAll<HTMLElement>('[data-scroll-session]'),
      scrollSnapshot,
    );
    const nextIntroGrid = this.hud.querySelector<HTMLElement>('.country-grid');
    if (nextIntroGrid) nextIntroGrid.scrollTop = this.introGridScrollTop;
    if (restoreIntroSearchFocus) {
      const nextIntroSearch = this.hud.querySelector<HTMLInputElement>('#country-search');
      nextIntroSearch?.focus();
      nextIntroSearch?.setSelectionRange(introSearchSelectionStart, introSearchSelectionEnd);
    }
    if (restoreEmpireFocus) {
      const nextEmpireInput = this.hud.querySelector<HTMLInputElement>('#empire-name');
      nextEmpireInput?.focus();
      nextEmpireInput?.setSelectionRange(nextEmpireInput.value.length, nextEmpireInput.value.length);
    }
    if (restoreExpeditionFocus && expeditionSectorId) {
      const nextExpeditionInput = this.hud.querySelector<HTMLInputElement>(`.polar-expedition-input[data-sector="${expeditionSectorId}"]`);
      nextExpeditionInput?.focus();
    }
    if (this.pendingPolarSectorScrollId) {
      const sectorId = this.pendingPolarSectorScrollId;
      this.pendingPolarSectorScrollId = undefined;
      const sectorCard = this.hud.querySelector<HTMLElement>(`[data-polar-sector="${sectorId}"]`);
      sectorCard?.focus({ preventScroll: true });
      sectorCard?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    if (!this.confirmWarTargetId) this.updateMapSelection();
    this.syncMapInputBlock();
  }

  private renderContextPanel(
    human: NationViewV2,
    economy: NationalEconomyV2,
    finance: WeeklyFinanceBreakdownV2,
    populationDynamics: PopulationDynamicsV2,
  ): string {
    const territory = this.selectedTerritoryId ? this.engine.state.territories[this.selectedTerritoryId] : undefined;
    if (territory && this.selectedTerritoryId) {
      return this.renderTerritoryPanel(this.selectedTerritoryId, territory, economy, finance);
    }
    if (this.selectedPolarRegion === 'arctic') return this.renderArcticPanel(human);
    if (this.selectedPolarRegion === 'antarctica') return this.renderAntarcticaPanel(human);
    if (this.panelMode === 'ranking') return this.renderRankingPanel();
    if (this.panelMode === 'economy') return this.renderEconomyPanel(human, economy, finance);
    if (this.panelMode === 'research') return this.renderResearchPanel(human, finance);
    if (this.panelMode === 'nation') {
      return this.renderNationPanel(human, economy, finance, populationDynamics);
    }
    return this.renderWarPanel(human, economy, finance);
  }

  private renderFullscreenRecommendation(): string {
    return `<div class="modal-backdrop fullscreen-recommendation-backdrop"><section class="modal-card fullscreen-recommendation" role="dialog" aria-modal="true" aria-labelledby="fullscreen-recommendation-title" aria-describedby="fullscreen-recommendation-copy"><div class="fullscreen-recommendation__icon" aria-hidden="true">⛶</div><div class="panel-kicker">DISPLAY RECOMMENDATION</div><h2 id="fullscreen-recommendation-title">Play in fullscreen</h2><p id="fullscreen-recommendation-copy">We recommend playing Frontier Command in fullscreen for the clearest map, borders and command panels.</p><small>You can leave fullscreen at any time with <kbd>Esc</kbd>, or use <kbd>F11</kbd> in most desktop browsers.</small><div class="panel-actions"><button class="ghost-button" data-action="fullscreen-windowed">CONTINUE WINDOWED</button><button class="primary-button" data-action="fullscreen-enter">ENTER FULLSCREEN</button></div></section></div>`;
  }

  private renderSoundOptions(): string {
    const mix = worldGameAudio.getAudioMix();
    const control = (channel: GameAudioChannel, label: string, detail: string): string => {
      const percent = Math.round(mix[channel] * 100);
      return `<label><span><b>${label}</b><small>${detail}</small></span><input type="range" min="0" max="100" step="1" value="${percent}" data-audio-channel="${channel}" aria-label="${label} volume" aria-valuetext="${percent} percent"><output>${percent}%</output></label>`;
    };
    return `<aside class="sound-options glass-panel" aria-labelledby="sound-options-title"><header><h2 id="sound-options-title">Sound</h2><button type="button" data-action="sound-options" aria-label="Close sound options">×</button></header>${control('music', 'Music', 'Ambient soundtrack')}${control('effects', 'Effects', 'Battles and impacts')}${control('voice', 'Voice', 'Radio command cues')}</aside>`;
  }

  private renderArcticGatewayCard(human: NationViewV2): string {
    const polar = this.engine.state.polarEndgame;
    const program = polar.arcticPrograms[human.id];
    const completed = program?.completedProjects.length ?? 0;
    const activeRun = program?.activeProject;
    const activeProject = activeRun
      ? ARCTIC_PROJECTS_V2.find((project) => project.id === activeRun.projectId)
      : undefined;
    const phase = activeProject
      ? ARCTIC_PROJECTS_V2.findIndex((project) => project.id === activeProject.id) + 1
      : Math.min(ARCTIC_PROJECTS_V2.length, completed + 1);
    const activeDuration = activeRun ? Math.max(1, activeRun.completesTick - activeRun.startedTick) : 1;
    const progress = completed >= ARCTIC_PROJECTS_V2.length ? 100
      : activeRun ? Math.round(clamp(
        (this.engine.state.tick - activeRun.startedTick) / activeDuration,
        0,
        1,
      ) * 100) : 0;
    const status = completed >= ARCTIC_PROJECTS_V2.length ? 'PROGRAM COMPLETE'
      : activeProject ? 'MANUAL RESEARCH ACTIVE' : completed > 0 ? 'PROGRAM AVAILABLE' : 'NORTH POLE ACCESS';
    const detail = activeProject
      ? `${activeProject.name} · ${Math.max(0, activeRun!.completesTick - this.engine.state.tick)} weeks remaining`
      : `${completed}/${ARCTIC_PROJECTS_V2.length} projects complete · slow, high-cost strategic research`;
    return `<section class="polar-gateway-card polar-gateway-card--arctic" aria-label="North Pole research gateway, phase ${phase} of ${ARCTIC_PROJECTS_V2.length}, ${progress} percent"><div class="polar-gateway-card__body"><span>ARCTIC RESEARCH FACILITY</span><div class="polar-gateway-card__status"><strong>${escapeHtml(status)}</strong><b>PHASE ${phase}/${ARCTIC_PROJECTS_V2.length}</b></div><small>${escapeHtml(detail)}</small><div class="polar-gateway-progress" role="progressbar" aria-label="Active Arctic project progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><i><b style="width:${progress}%"></b></i><span>${activeRun ? `${progress}% ACTIVE` : completed >= ARCTIC_PROJECTS_V2.length ? 'ALL PHASES COMPLETE' : `${completed}/${ARCTIC_PROJECTS_V2.length} COMPLETE`}</span></div></div><button class="secondary-button" data-action="open-polar-region" data-polar-region="arctic">OPEN NORTH POLE</button></section>`;
  }

  private renderAntarcticaGatewayCard(): string {
    const polar = this.engine.state.polarEndgame;
    const revealed = polar.warningTick !== null;
    const contacted = polar.contactTick !== null;
    const secured = Object.values(polar.sectors).filter((sector) => sector.status === 'secured').length;
    const detail = revealed
      ? contacted ? `${secured}/${ANTARCTIC_SECTORS_V2.length} sectors secured · wave ${polar.globalWave}`
      : 'Three approach corridors detected · source unknown'
      : 'Advance the currently visible North Pole research phase to investigate this theatre.';
    return `<section class="polar-gateway-card polar-gateway-card--antarctica ${revealed ? 'is-live' : 'is-locked'}" aria-label="Antarctica campaign gateway"><div><span>ANTARCTIC THEATRE</span><strong>${revealed ? contacted ? 'EARTH DEFENCE COMMAND' : 'POLAR RECONNAISSANCE' : 'SIGNAL ENCRYPTED'}</strong><small>${escapeHtml(detail)}</small></div><button class="secondary-button" data-action="open-polar-region" data-polar-region="antarctica" ${revealed ? '' : 'disabled'}>${revealed ? 'OPEN ANTARCTICA' : 'LOCKED'}</button></section>`;
  }

  private renderArcticPanel(human: NationViewV2): string {
    const polar = this.engine.state.polarEndgame;
    const program = polar.arcticPrograms[human.id];
    const completed = program?.completedProjects.length ?? 0;
    const visibleProjects = ARCTIC_PROJECTS_V2
      .map((project, index) => ({
        project,
        index,
        terms: this.engine.arcticProjectTerms(human.id, project.id),
      }))
      .filter(({ terms }) => terms.status !== 'locked');
    const projectCards = visibleProjects.map(({ project, index, terms }) => {
      const progress = terms.status === 'complete' ? 100
        : Math.round(clamp(terms.progress, 0, 1) * 100);
      const remaining = terms.completesTick === undefined
        ? terms.durationTicks : Math.max(0, terms.completesTick - this.engine.state.tick);
      const rewards = this.renderArcticProjectRewards(human, project, terms.status);
      const canStart = terms.status === 'available' && terms.allowed;
      const actionLabel = terms.status === 'complete' ? 'COMPLETED'
        : terms.status === 'active' ? `${progress}% · ${compactWarTime(remaining)} LEFT`
        : canStart ? `REVIEW · ${cash(terms.cost)}`
        : 'UNAVAILABLE';
      const reason = terms.reason ?? (terms.status === 'complete' ? 'Benefits are permanently active.'
        : 'Manual authorisation required.');
      return `<article class="polar-project-card is-${terms.status}" aria-label="Arctic project ${index + 1}: ${escapeHtml(project.name)}">
        <header><i>${String(index + 1).padStart(2, '0')}</i><div><span>${escapeHtml(project.kicker)}</span><strong>${escapeHtml(project.name)}</strong></div><b>${terms.status.toUpperCase()}</b></header>
        <p>${escapeHtml(project.description)}</p>
        ${this.renderArcticQuoteBreakdown(human, terms)}
        <ul class="polar-project-rewards" aria-label="Project rewards">${rewards}</ul>
        <div class="polar-project-progress" role="progressbar" aria-label="${escapeHtml(project.name)} progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><i><b style="width:${progress}%"></b></i><span>${terms.status === 'active' ? `${progress}% · ${compactWarTime(remaining)} remaining` : escapeHtml(reason)}</span></div>
        <button class="${canStart ? 'primary-button' : 'ghost-button'}" data-action="start-arctic-project" data-project="${project.id}" ${canStart ? '' : 'disabled'} title="${escapeHtml(reason)}">${escapeHtml(actionLabel)}</button>
      </article>`;
    }).join('');
    const activeName = program?.activeProject
      ? ARCTIC_PROJECTS_V2.find((project) => project.id === program.activeProject?.projectId)?.name
      : undefined;
    const affinityTerms = visibleProjects.find(({ terms }) => terms.status === 'available' || terms.status === 'active')?.terms
      ?? visibleProjects[visibleProjects.length - 1]?.terms;
    const affinityPercent = (affinityTerms?.affinityCostModifier ?? 0) * 100;
    const affinityLabel = affinityPercent === 0
      ? `${human.shortName.toUpperCase()} ARCTIC AFFINITY · NEUTRAL COST`
      : `${human.shortName.toUpperCase()} ARCTIC AFFINITY · ${signed(affinityPercent, 0)}% COST`;
    const deepIceKnown = program?.activeProject?.projectId === 'deep-ice-signals'
      || Boolean(program?.completedProjects.includes('deep-ice-signals'))
      || polar.warningTick !== null;
    return `<aside class="world-panel command-drawer glass-panel command-drawer--clean command-drawer--unified polar-command polar-command--arctic" data-scroll-session="${drawerScrollSessionId('polar:arctic')}">
      <button class="panel-close" data-action="close-panel" aria-label="Close Arctic research">×</button>
      <div class="drawer-heading drawer-heading--compact drawer-heading--single"><div><h2>Arctic research station</h2></div><strong class="${activeName ? 'is-warn' : completed === ARCTIC_PROJECTS_V2.length ? 'is-positive' : ''}">${activeName ? 'IN PROGRESS' : `${completed}/${ARCTIC_PROJECTS_V2.length} COMPLETE`}</strong></div>
      <section class="polar-hero polar-hero--arctic"><div><span>${deepIceKnown ? 'DEEP-ICE PROGRAM' : 'ARCTIC PROGRAM'}</span><strong>${activeName ? escapeHtml(activeName) : completed === ARCTIC_PROJECTS_V2.length ? 'Antarctica revealed' : 'Awaiting authorisation'}</strong><small>National research continues automatically. These rare projects are paid upfront and run separately.</small><em class="polar-affinity">${escapeHtml(affinityLabel)}</em></div><b>${completed === ARCTIC_PROJECTS_V2.length ? 'SIGNAL FOUND' : 'ARCTIC'}</b></section>
      <div class="polar-project-list">${projectCards}</div>
    </aside>`;
  }

  private polarResearchEffectContext(human: NationViewV2): ResearchEffectDisplayContextV2 {
    const militarySnapshot = this.engine.militaryBaseSnapshot();
    const armyStrength = this.engine.armyStrength(human.id);
    const nationalArmy = nationalArmyState(this.engine, human.id, armyStrength, militarySnapshot);
    const nationalQuality = militarySnapshot.nationalQualityByNation.get(human.id);
    return {
      researchConversion: nationalQuality?.researchConversion ?? 1,
      baseDefense: nationalArmy.baseDefense,
      combinedMultiplier: nationalQuality?.combinedMultiplier ?? 1,
      iqResearchBonus: selectNationalIqViewV2(this.engine.state, this.engine.content, human.id).researchBonus,
    };
  }

  private renderArcticProjectRewards(
    human: NationViewV2,
    project: ArcticProjectDefinitionUIV2,
    status: ArcticProjectTermsUIV2['status'] = 'available',
  ): string {
    const levels = this.engine.state.players[human.id]?.research.effectLevels;
    const context = this.polarResearchEffectContext(human);
    return project.rewards.map((reward) => {
      const currentLevel = levels?.[reward.effect] ?? 0;
      const beforeLevel = status === 'complete'
        ? Math.max(0, currentLevel - reward.levels)
        : currentLevel;
      const impact = selectResearchEffectImpactV2(
        this.engine.state,
        this.engine.content,
        human.id,
        reward.effect,
      );
      const transition = researchEffectTransitionV2(
        reward.effect,
        beforeLevel,
        reward.levels,
        impact,
        context,
      );
      return `<li><span>${escapeHtml(researchEffectLabel(reward.effect))}</span><b>${escapeHtml(transition)}</b><small>PERMANENT EFFECT</small></li>`;
    }).join('');
  }

  private renderArcticQuoteBreakdown(
    human: NationViewV2,
    terms: ArcticProjectTermsUIV2,
  ): string {
    const affinityPercent = terms.affinityCostModifier * 100;
    const affinityDetail = affinityPercent === 0
      ? `×${format(terms.affinityCostMultiplier, 2)} · neutral`
      : `×${format(terms.affinityCostMultiplier, 2)} · ${signed(affinityPercent, 0)}% cost`;
    return `<section class="polar-quote-breakdown" aria-label="Arctic project price and duration breakdown">
      <div class="polar-quote-grid polar-quote-grid--cost">
        <span><small>BASE PROGRAM</small><b>${cash(terms.baseCost)}</b></span>
        <span><small>STARTER RANK #${terms.openingMilitaryRank}/${terms.openingMilitaryRankCount}</small><b>×${format(terms.openingMilitaryRankCostFactor, 2)}</b></span>
        <span><small>${escapeHtml(human.shortName.toUpperCase())} ARCTIC AFFINITY</small><b>${escapeHtml(affinityDetail)}</b></span>
        <span class="is-final"><small>${terms.status === 'active' ? 'PAID UPFRONT' : 'FINAL UPFRONT'}</small><b>${cash(terms.cost)}</b></span>
      </div>
      <div class="polar-quote-grid polar-quote-grid--time">
        <span><small>BASE RESEARCH</small><b>${compactWarTime(terms.baseDurationTicks)}</b></span>
        <span><small>ARCTIC ACCESS ${terms.accessPointCount}/8</small><b>${terms.accessDurationReduction > 0 ? `−${format(terms.accessDurationReduction * 100, 0)}% time` : 'NO REDUCTION'}</b></span>
        <span><small>RESEARCH SPEED</small><b>${terms.researchSpeedDurationReduction > 0 ? `−${format(terms.researchSpeedDurationReduction * 100, 0)}% time` : 'NO REDUCTION'}</b></span>
        <span class="is-final"><small>FINAL DURATION</small><b>${compactWarTime(terms.durationTicks)}</b></span>
      </div>
    </section>`;
  }

  private renderPolarSectorCard(
    human: NationViewV2,
    sector: AntarcticSectorDefinitionUIV2,
  ): string {
    const state = this.engine.state.polarEndgame.sectors[sector.id];
    const terms = this.engine.antarcticExpeditionTerms(human.id, sector.id);
    const status = state.status;
    const integrity = Math.round(clamp(state.integrity, 0, 100));
    const draft = this.antarcticDeploymentDrafts.get(sector.id)
      ?? format(terms.recommendedManpower, 2).replaceAll(',', '');
    const anyActiveExpedition = terms.activeExpedition;
    const active = anyActiveExpedition?.sectorId === sector.id ? anyActiveExpedition : undefined;
    const deployable = (status === 'available' || status === 'contested') && !anyActiveExpedition;
    const canDeploy = deployable && terms.allowed;
    const prerequisiteNames = sector.prerequisites
      .map((id) => ANTARCTIC_SECTORS_V2.find((candidate) => candidate.id === id)?.name ?? id)
      .join(' · ');
    const statusDetail = status === 'hidden' ? `Requires ${prerequisiteNames || 'the Antarctic warning'}`
      : status === 'secured' ? `Secured${state.securedBy ? ` by ${this.engine.player(state.securedBy)?.shortName ?? state.securedBy}` : ''}`
      : active ? `${people(active.manpower)} expedition fighting · ${format(active.damageDealt, 1)} damage dealt`
      : terms.reason ?? `${people(terms.recommendedManpower)} recommended · ${compactWarTime(terms.projectedDurationTicks)} projected`;
    const deployment = deployable ? `<div class="polar-sector-deployment"><label><span>EXPEDITION FORCE · MILLIONS</span><input class="polar-expedition-input" data-sector="${sector.id}" type="number" inputmode="decimal" min="${terms.minManpower}" max="${terms.maxManpower}" step="0.05" value="${escapeHtml(draft)}" aria-label="Expedition manpower for ${escapeHtml(sector.name)}"></label><button class="primary-button" data-action="deploy-antarctic-expedition" data-sector="${sector.id}" ${canDeploy ? '' : 'disabled'}>${canDeploy ? 'DEPLOY' : 'UNAVAILABLE'}</button><small>MIN ${people(terms.minManpower)} · REC ${people(terms.recommendedManpower)} · MAX ${people(terms.maxManpower)}</small></div>` : '';
    const focused = this.selectedPolarSectorId === sector.id;
    return `<article class="polar-sector-card is-${status}${sector.region === 'core' ? ' is-core' : ''}${focused ? ' is-focused' : ''}" data-polar-sector="${sector.id}" tabindex="${focused ? '0' : '-1'}" aria-current="${focused ? 'true' : 'false'}">
      <header><div><span>DEPTH ${sector.depth} · ${sector.region.toUpperCase()}</span><strong>${status === 'hidden' ? 'UNKNOWN ICE SECTOR' : escapeHtml(sector.name)}</strong></div><b>${status.toUpperCase()}</b></header>
      <p>${status === 'hidden' ? 'Telemetry is blocked by the machine defence grid.' : escapeHtml(sector.description)}</p>
      <div class="polar-sector-metrics"><span><small>ENEMY FORCE</small><b>${status === 'hidden' ? 'ENCRYPTED' : `×${format(terms.enemyStrength, 2)}`}</b></span><span><small>WAVE</small><b>${status === 'hidden' ? '—' : Math.max(1, state.wave)}</b></span><span><small>INTEGRITY</small><b>${status === 'hidden' ? '—' : `${integrity}%`}</b></span></div>
      ${status !== 'hidden' ? `<div class="polar-sector-integrity" role="progressbar" aria-label="Enemy integrity remaining in ${escapeHtml(sector.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${integrity}"><i style="width:${integrity}%"></i></div>` : ''}
      <small class="polar-sector-status">${escapeHtml(statusDetail)}</small>
      ${deployment}
    </article>`;
  }

  private renderAntarcticaPanel(human: NationViewV2): string {
    const polar = this.engine.state.polarEndgame;
    if (polar.warningTick === null) {
      return `<aside class="world-panel command-drawer glass-panel command-drawer--clean command-drawer--unified polar-command polar-command--antarctica is-locked" data-scroll-session="${drawerScrollSessionId('polar:antarctica')}"><button class="panel-close" data-action="close-panel" aria-label="Close Antarctica intelligence">×</button><div class="drawer-heading drawer-heading--compact drawer-heading--single"><div><h2>Antarctic intelligence</h2></div><strong>ENCRYPTED</strong></div><section class="polar-hero polar-hero--locked"><div><span>RECONNAISSANCE BLOCKED</span><strong>Southern telemetry unavailable</strong><small>Advance the currently visible North Pole phase. Future programmes remain classified until their prerequisite work is complete.</small></div><b>?</b></section><button class="secondary-button polar-locked-route" data-action="open-polar-region" data-polar-region="arctic">GO TO ARCTIC RESEARCH</button></aside>`;
    }
    const secured = Object.values(polar.sectors).filter((sector) => sector.status === 'secured').length;
    const activeExpeditions = polar.expeditions.filter((expedition) => expedition.playerId === human.id);
    const members = polar.earthDefenseMembers
      .map((id) => this.engine.player(id)?.shortName ?? id)
      .slice(0, 4);
    const nextCounteroffensive = polar.nextCounteroffensiveTick === null
      ? 'FORMING' : compactWarTime(Math.max(0, polar.nextCounteroffensiveTick - this.engine.state.tick));
    const sharingActive = polar.contactTick !== null && polar.earthDefenseMembers.length > 1;
    const gateways = ANTARCTIC_SECTORS_V2.filter((sector) => sector.region === 'gateway');
    const corridorLabels: Record<'drake' | 'maud' | 'ross', string> = {
      drake: 'DRAKE · SOUTH AMERICA',
      maud: 'MAUD · SOUTHERN AFRICA',
      ross: 'ROSS · OCEANIA',
    };
    const corridorCards = gateways.map((sector) => {
      const state = polar.sectors[sector.id];
      return `<button class="polar-corridor-card is-${state.status}" data-action="focus-polar-sector" data-sector="${sector.id}"><span>${corridorLabels[sector.corridor!]}</span><strong>${escapeHtml(sector.name)}</strong><small>${state.status === 'secured' ? 'SUPPLY CORRIDOR SECURED' : state.status === 'contested' ? 'LANDING UNDER ATTACK' : state.status === 'available' ? 'LANDING ZONE OPEN' : 'ROUTE NOT YET OPEN'}</small><b>${state.status.toUpperCase()}</b></button>`;
    }).join('');
    const regionLabels: Record<AntarcticSectorDefinitionUIV2['region'], string> = {
      gateway: 'COASTAL ENTRY POINTS',
      outer: 'OUTER MACHINE DEFENCES',
      inner: 'INNER ICE NETWORK',
      core: 'ROGUE AI NEXUS',
    };
    const visibleRegions: readonly AntarcticSectorDefinitionUIV2['region'][] = polar.contactTick === null
      ? ['gateway'] : ['gateway', 'outer', 'inner', 'core'];
    const sectorGroups = visibleRegions.map((region) => {
      const sectors = ANTARCTIC_SECTORS_V2.filter((sector) => sector.region === region);
      return `<section class="polar-sector-group"><span class="section-label">${regionLabels[region]}</span><div class="polar-sector-list">${sectors.map((sector) => this.renderPolarSectorCard(human, sector)).join('')}</div></section>`;
    }).join('');
    const bossIntegrity = Math.round(clamp(polar.bossIntegrity, 0, 100));
    const phaseLabel = polar.phase === 'warning' ? 'UNKNOWN CONTACT'
      : polar.phase === 'contact' ? 'FIRST CONTACT'
      : polar.phase === 'counteroffensive' ? 'EARTH COUNTEROFFENSIVE'
      : polar.phase === 'core-exposed' ? 'CORE EXPOSED'
      : polar.phase === 'victory' ? 'MACHINE SILENCED'
      : 'ANTARCTIC THEATRE';
    return `<aside class="world-panel command-drawer glass-panel command-drawer--clean command-drawer--unified polar-command polar-command--antarctica" data-scroll-session="${drawerScrollSessionId('polar:antarctica')}">
      <button class="panel-close" data-action="close-panel" aria-label="Close Antarctica command">×</button>
      <div class="drawer-heading drawer-heading--compact drawer-heading--single"><div><h2>Antarctic campaign</h2></div><strong class="${polar.phase === 'victory' ? 'is-positive' : 'is-negative'}">${escapeHtml(phaseLabel)}</strong></div>
      <section class="polar-campaign-overview" aria-label="Antarctic campaign status"><article><span>SECTORS</span><strong>${secured}/${ANTARCTIC_SECTORS_V2.length}</strong><small>${activeExpeditions.length} expeditions active</small></article><article><span>GLOBAL WAVE</span><strong>${polar.globalWave}</strong><small>Escalates toward the core</small></article><article><span>EARTH DEFENCE</span><strong>${polar.earthDefenseMembers.length} NATIONS</strong><small>${escapeHtml(members.join(' · ') || 'Coalition forming')}</small></article><article><span>COUNTEROFFENSIVE</span><strong>${nextCounteroffensive}</strong><small>Alliance forces act automatically</small></article></section>
      <section class="polar-earth-grid"><article><span>RESEARCH SHARING</span><strong>${sharingActive ? 'ONLINE' : 'FORMING'}</strong><small>${sharingActive ? 'Secured discoveries circulate across Earth Defence.' : 'Cooperation strengthens after first contact.'}</small></article><article><span>SUSPICION RELIEF</span><strong>−${format(polar.suspicionReliefEarned, 1)}</strong><small>Damage to the rogue AI restores world trust.</small></article></section>
      <span class="section-label">OPEN APPROACH CORRIDORS</span><div class="polar-corridor-grid">${corridorCards}</div>
      ${polar.contactTick === null ? '' : `<section class="polar-boss-card ${polar.phase === 'core-exposed' || polar.phase === 'victory' ? 'is-exposed' : 'is-sealed'}"><div><span>ZERO-POINT CORE · PHASE ${polar.bossPhase}</span><strong>${polar.phase === 'victory' ? 'ROGUE INTELLIGENCE DESTROYED' : polar.phase === 'core-exposed' ? 'CENTRAL INTELLIGENCE EXPOSED' : 'SIGNATURE BELOW THE ICE'}</strong><small>${polar.phase === 'core-exposed' || polar.phase === 'victory' ? `${bossIntegrity}% core integrity remaining` : 'Secure the inner network to identify the source.'}</small></div><i role="progressbar" aria-label="Rogue AI core integrity" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${bossIntegrity}"><b style="width:${bossIntegrity}%"></b></i></section>`}
      ${sectorGroups}
    </aside>`;
  }

  private renderPolarWarning(human: NationViewV2): string {
    const warningWeek = this.engine.state.polarEndgame.warningTick ?? this.engine.state.tick;
    return `<div class="modal-backdrop polar-warning-backdrop"><section class="modal-card polar-warning-modal" role="dialog" aria-modal="true" aria-labelledby="polar-warning-title" aria-describedby="polar-warning-copy" tabindex="-1"><div class="polar-warning-scan" aria-hidden="true"><i></i><b>3</b><span>UNIDENTIFIED CORRIDORS</span></div><div class="panel-kicker">PRIORITY BLACK · WEEK ${warningWeek}</div><h2 id="polar-warning-title">Something beneath Antarctica is awake.</h2><p id="polar-warning-copy">Deep-Ice Signals has isolated a coordinated transmission with no known national origin. Three approach corridors have opened at once. Whatever is below the ice has made the first move.</p><div class="polar-warning-intel"><span><b>DRAKE PASSAGE</b><small>South America approach</small></span><span><b>QUEEN MAUD</b><small>Southern Africa approach</small></span><span><b>ROSS SEA</b><small>Oceania approach</small></span></div><div class="polar-warning-order"><b>${escapeHtml(human.shortName)} COMMAND</b><span>Land at any entry point. Expect the source to reveal itself only after contact.</span></div><button class="primary-button" data-action="acknowledge-polar-warning" ${this.polarWarningAcknowledgementPending ? 'disabled' : ''}>${this.polarWarningAcknowledgementPending ? 'ESTABLISHING COMMAND LINK…' : 'OPEN ANTARCTIC COMMAND'}</button></section></div>`;
  }

  private renderArcticProjectConfirmation(
    human: NationViewV2,
    projectId: ArcticProjectIdV2,
  ): string {
    const terms = this.engine.arcticProjectTerms(human.id, projectId);
    const project = terms.project;
    const rewards = this.renderArcticProjectRewards(human, project);
    return `<div class="modal-backdrop polar-confirm-backdrop"><section class="modal-card polar-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="polar-confirm-title" tabindex="-1"><div class="panel-kicker">ARCTIC AUTHORISATION</div><h2 id="polar-confirm-title">Start ${escapeHtml(project.name)}?</h2><p>${escapeHtml(project.description)}</p>${this.renderArcticQuoteBreakdown(human, terms)}<ul class="polar-project-rewards">${rewards}</ul><div class="polar-confirm-note"><b>MANUAL BLACK PROGRAMME</b><span>The full cost is paid now. National automatic research remains active while this project runs.</span></div>${terms.allowed ? '' : `<small class="polar-confirm-error">${escapeHtml(terms.reason ?? 'This project cannot start now.')}</small>`}<div class="panel-actions"><button class="ghost-button" data-action="cancel-arctic-project">CANCEL</button><button class="primary-button" data-action="confirm-arctic-project" data-project="${project.id}" ${terms.allowed ? '' : 'disabled'}>AUTHORISE · ${cash(terms.cost)}</button></div></section></div>`;
  }

  private renderNationPanel(
    human: NationViewV2,
    economy: NationalEconomyV2,
    finance: WeeklyFinanceBreakdownV2,
    populationDynamics: PopulationDynamicsV2,
  ): string {
    const state = this.engine.state;
    const world = worldTopbarStatsV2(state, human.id, this.engine.content);
    const controlledTerritories = [...this.engine.territoriesOf(human.id)];
    const integratingTerritories = controlledTerritories.filter((territory) => (
      territory.coreOwner !== human.id && territory.integration < 0.999999
    ));
    const controlledArea = controlledTerritories.reduce((sum, territory) => (
      sum + Math.max(0, this.engine.content.territories[territory.id]?.baseline.landArea ?? 0)
    ), 0);
    const averageCondition = controlledArea > 0
      ? controlledTerritories.reduce((sum, territory) => {
        const area = Math.max(0, this.engine.content.territories[territory.id]?.baseline.landArea ?? 0);
        return sum + area * territory.condition;
      }, 0) / controlledArea
      : 1;
    const integrationPopulation = integratingTerritories
      .reduce((sum, territory) => sum + Math.max(0, territory.population), 0);
    const integrationProgress = integrationPopulation > 0
      ? integratingTerritories.reduce((sum, territory) => (
        sum + Math.max(0, territory.population) * territory.integration
      ), 0) / integrationPopulation
      : 1;
    const nextIntegration = integratingTerritories
      .filter((territory) => territory.integrationProgram)
      .sort((left, right) => (
        (left.integrationProgram?.completesTick ?? Number.POSITIVE_INFINITY)
        - (right.integrationProgram?.completesTick ?? Number.POSITIVE_INFINITY)
      ))[0];
    const integrationWeeks = nextIntegration?.integrationProgram
      ? Math.max(0, nextIntegration.integrationProgram.completesTick - state.tick)
      : 0;
    const iqFusion = selectNationalIqViewV2(state, this.engine.content, human.id);
    const fusionCompletion = iqFusion.controlledPopulation > 0
      ? clamp(iqFusion.integratedContributingPopulation / iqFusion.controlledPopulation, 0, 1)
      : 1;
    const fusionTone = iqFusion.fusionDelta > 0.049
      ? 'is-positive' : iqFusion.fusionDelta < -0.049 ? 'is-negative' : 'is-neutral';
    const fusionOriginMix = [...iqFusion.fusionComponents]
      .filter((component) => component.contributingPopulation > 0)
      .sort((left, right) => right.populationShare - left.populationShare)
      .slice(0, 4)
      .map((component) => {
        const origin = this.engine.content.nations[component.originId];
        return `<span><b>${escapeHtml((origin?.shortName ?? component.originId).toUpperCase())}</b>${format(component.populationShare * 100)}% / IQ ${format(component.baselineScore, 1)}</span>`;
      })
      .join('');
    const integratedPopulation = this.engine.controlledPopulation(human.id);
    const populationShare = world.population > 0 ? economy.population / world.population * 100 : 0;
    const annualPopulationChange = economy.population * populationDynamics.annualNetRate;
    const annualBirths = economy.population * populationDynamics.annualBirthRate;
    const annualDeaths = economy.population * populationDynamics.annualDeathRate;
    const foodReserveWeeks = finance.foodDemand > 0 ? human.foodStock / finance.foodDemand : 0;
    const foodTrade = summarizeFoodTradeV2(finance.foodExported, finance.foodImported);
    const traitPresentation = renderCountryTraitPresentationV2(
      human.id,
      'nation',
      this.engine.content,
    );
    const resistance = this.engine.globalResistance();
    const suspicionRisk = suspicionRiskPresentationV2(resistance.threat);
    const coalitionNames = resistance.memberIds.slice(0, 6)
      .map((id) => this.engine.player(id)?.shortName).filter(Boolean);
    const reactionLabel = resistance.level ? 'CONTAINMENT ACTIVE'
      : resistance.members ? `${resistance.members}/5 COALITION BUILDING` : 'NO COALITION';
    const reactionDetail = resistance.members
      ? coalitionNames.map((name) => escapeHtml(name!)).join(' · ')
        + (resistance.members > coalitionNames.length ? ` · +${resistance.members - coalitionNames.length}` : '')
      : 'World powers are monitoring expansion.';
    const activeTreaties = state.truces
      .filter((truce) => truce.expiresTick > state.tick
        && (truce.leftId === human.id || truce.rightId === human.id))
      .map((truce) => {
        const opponentId = truce.leftId === human.id ? truce.rightId : truce.leftId;
        const opponent = this.engine.player(opponentId);
        const obligation = state.ceasefireObligations.find((candidate) => (
          candidate.expiresTick > state.tick
          && ((candidate.payerId === human.id && candidate.payeeId === opponentId)
            || (candidate.payeeId === human.id && candidate.payerId === opponentId))
        ));
        const lockWeeks = Math.max(0, truce.expiresTick - state.tick);
        const paymentWeeks = obligation ? Math.max(0, obligation.expiresTick - state.tick) : 0;
        const paymentState = obligation
          ? `${obligation.payerId === human.id ? 'YOU PAY' : 'YOU RECEIVE'} · ${paymentWeeks}w remaining`
          : 'PAYMENTS COMPLETE';
        return `<span class="nation-reaction-detail ${obligation?.payeeId === human.id ? 'is-income' : ''}"><b>PEACE · ${escapeHtml(opponent?.shortName ?? opponentId)}</b>${paymentState} · locked ${lockWeeks}w</span>`;
      }).join('');
    return `
      <aside class="world-panel command-drawer glass-panel nation-command command-drawer--clean command-drawer--unified" data-scroll-session="${drawerScrollSessionId('nation')}">
        <button class="panel-close" data-action="close-panel" aria-label="Close nation overview">×</button>
        <div class="drawer-heading drawer-heading--compact drawer-heading--single"><div><h2>${escapeHtml(human.name)}</h2></div><strong class="${integratingTerritories.length ? 'is-warn' : 'is-positive'}">${integratingTerritories.length ? `${integratingTerritories.length} INTEGRATING` : 'ALL CORE'}</strong></div>

        <span class="section-label">EMPIRE</span>
        <section class="nation-overview-grid unified-stat-grid" aria-label="Empire overview">
          <article><span>RESIDENTS</span><strong>${population(economy.population)}</strong><small>${population(integratedPopulation)} fully integrated</small></article>
          <article><span>TERRITORIES</span><strong>${world.controlledTerritories} / ${world.worldTerritories}</strong><small>${format(world.controlledLandShare * 100, 2)}% of mapped land</small></article>
          <article><span>WORLD POPULATION</span><strong>${format(populationShare, 2)}%</strong><small>${population(world.population)} worldwide</small></article>
          <article class="${averageCondition >= 0.75 ? 'is-good' : averageCondition < 0.5 ? 'is-danger' : 'is-warn'}"><span>LAND CONDITION</span><strong>${format(averageCondition * 100, 1)}%</strong><small>Area-weighted infrastructure</small></article>
          <article><span>NATIONAL AI</span><strong>${escapeHtml(finance.aiMode.toUpperCase())}</strong><small>${format(finance.aiEfficiency * 100, 1)}% operating efficiency</small></article>
        </section>

        <span class="section-label">PEOPLE & FOOD</span>
        <section class="nation-system-block nation-life-grid" aria-label="Population and food security">
          <article class="nation-life-card nation-life-card--population">
            <div><span>DEMOGRAPHICS</span><strong class="${populationDynamics.annualNetRate >= 0 ? 'is-positive' : 'is-negative'}">${signedPeople(annualPopulationChange)} / year</strong></div>
            <div class="nation-demographic-flow"><span><b>+${population(annualBirths)}</b>BIRTHS</span><i>−</i><span><b>−${population(annualDeaths)}</b>DEATHS</span>${populationDynamics.annualWarPenaltyRate > 0 ? `<i>−</i><span><b>−${population(economy.population * populationDynamics.annualWarPenaltyRate)}</b>WAR DRAG</span>` : ''}</div>
            <section class="nation-fusion-panel ${integratingTerritories.length ? 'is-active' : 'is-complete'}" aria-label="Empire population integration and national IQ fusion">
              <header><span>EMPIRE FUSION &amp; INTEGRATION</span><strong>IQ ${format(iqFusion.score, 1)}</strong></header>
              <div class="nation-fusion-score"><span><small>NATIVE</small><b>${format(iqFusion.nativeBaseline, 1)}</b></span><i aria-hidden="true">&rarr;</i><span><small>FUSED</small><b>${format(iqFusion.fusedBaseline, 1)}</b></span><em class="${fusionTone}">${signed(iqFusion.fusionDelta, 1)} IQ</em></div>
              <div class="nation-fusion-progress"><span><b>${format(fusionCompletion * 100, 1)}% POPULATION FUSED</b><small>${integratingTerritories.length ? `${integratingTerritories.length} integrating / active progress ${format(integrationProgress * 100, 1)}%` : 'Every controlled territory is fully integrated'}</small></span><i role="progressbar" aria-label="Empire population fusion" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${format(fusionCompletion * 100, 1)}"><b style="width:${format(fusionCompletion * 100, 2)}%"></b></i></div>
              <div class="nation-fusion-origins" aria-label="Integrated population origins">${fusionOriginMix || '<span><b>NATIVE</b>100%</span>'}</div>
              <footer><span>${format(iqFusion.foreignContributingShare * 100, 1)}% foreign influence${iqFusion.researchBonus > 0 ? ` / +${format(iqFusion.researchBonus, 1)} IQ from research` : ''}</span><strong>${nextIntegration ? `NEXT / ${escapeHtml(this.engine.content.territories[nextIntegration.id]?.name ?? nextIntegration.id)} / ${format(integrationWeeks / 52, 1)}Y` : 'ALL CORE'}</strong></footer>
            </section>
          </article>
          <article class="nation-life-card nation-life-card--food">
            <div><span>FOOD SECURITY</span><strong class="${finance.foodCoverage >= 0.98 ? 'is-positive' : 'is-negative'}">${format(finance.foodCoverage * 100, 1)}% supplied</strong></div>
            <div class="nation-food-stats"><span><b>${people(human.foodStock)} / ${people(finance.foodStorageCapacity)}</b>STORED · ${format(foodReserveWeeks, 1)} WEEKS</span><span><b>${people(annual(finance.foodDomesticProduced))} / ${people(annual(finance.foodDemand))}</b>DOMESTIC / DEMAND YEARLY</span><span><b>${foodTrade.direction === 'balanced' ? 'BALANCED' : `${people(foodTrade.annualVolume)} / year`}</b>${escapeHtml(foodTrade.label)}</span></div>
          </article>
        </section>

        <section class="nation-reaction-block">
          <div class="nation-reaction-head"><span>WORLD REACTION</span><strong>${escapeHtml(reactionLabel)}</strong></div>
          <div class="simple-suspicion simple-suspicion--${suspicionRisk.level}">
            <div><span>POLITICAL SUSPICION</span><b>${escapeHtml(suspicionRisk.label)}</b><strong>${suspicionRisk.score}<small>/100</small></strong></div>
            <i role="progressbar" aria-label="Political Suspicion" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${suspicionRisk.score}"><b style="width:${suspicionRisk.score}%"></b><em style="left:20%"></em><em style="left:40%"></em><em style="left:60%"></em><em style="left:80%"></em></i>
            <small>${escapeHtml(suspicionRisk.guidance)}</small>
          </div>
          <p>${reactionDetail}</p>
          ${activeTreaties ? `<div class="nation-reaction-details">${activeTreaties}</div>` : ''}
        </section>

        ${traitPresentation}
      </aside>
    `;
  }
  private renderEconomyPanel(
    human: NationViewV2,
    economy: NationalEconomyV2,
    finance: WeeklyFinanceBreakdownV2,
  ): string {
    const totalIncome = finance.revenue + finance.foodExportIncome + finance.ceasefireIncome;
    const totalExpenses = finance.expenses;
    const growth = finance.annualEconomyGrowthRate;
    const incomeItems = [
      { label: 'TAX REVENUE', weekly: Math.max(0, finance.revenue), tone: 'tax', always: true },
      { label: 'FOOD EXPORTS', weekly: Math.max(0, finance.foodExportIncome), tone: 'exports', always: false },
      { label: 'PEACE & TREATIES', weekly: Math.max(0, finance.ceasefireIncome), tone: 'treaties', always: false },
    ];
    const incomeRows = incomeItems
      .filter((item) => item.always || item.weekly > 0.0000005)
      .map((item) => {
        const share = totalIncome > 0 ? item.weekly / totalIncome * 100 : 0;
        const boundedShare = Math.max(0, Math.min(100, share));
        const shareLabel = share > 0 && share < 0.1 ? '&lt;0.1%' : `${format(share, 1)}%`;
        return `<article class="economy-expense-breakdown__item economy-income-breakdown__item--${item.tone} ${item.weekly > 0 ? 'is-funded' : 'is-zero'}" aria-label="${item.label}: ${cash(annual(item.weekly))} per year, ${format(share, 1)} percent of total income"><div><span>${item.label}</span><strong>+${cash(annual(item.weekly))}<small>/year</small></strong><em>${shareLabel}</em></div><i aria-hidden="true"><b style="width:${boundedShare}%"></b></i></article>`;
      }).join('');
    const developmentFoodPause = finance.foodDevelopmentTransfer > 0.0000005;
    const expenseItems: Array<{
      key: string;
      label: string;
      weekly: number;
      tone: string;
      always: boolean;
    }> = [
      { key: 'operations', label: baseOperatingCostLabel(
        finance.baseOperatingCost / Math.max(0.000001, finance.revenue),
      ), weekly: Math.max(0, finance.baseOperatingCost), tone: 'operations', always: true },
      { key: 'food', label: 'FOOD SYSTEM', weekly: Math.max(0, finance.foodProduction), tone: 'food', always: true },
      { key: 'military', label: 'MILITARY', weekly: Math.max(0, finance.military), tone: 'military', always: true },
      { key: 'research', label: 'RESEARCH', weekly: Math.max(0, finance.research), tone: 'research', always: true },
      { key: 'development', label: developmentFoodPause ? 'DEVELOPMENT · FOOD PAUSE' : 'DEVELOPMENT', weekly: Math.max(0, finance.development), tone: 'development', always: true },
      { key: 'integration', label: 'INTEGRATION', weekly: Math.max(0, finance.integrationCost), tone: 'integration', always: false },
      { key: 'war', label: 'WAR OPERATIONS', weekly: Math.max(0, finance.warOperations), tone: 'war', always: false },
      { key: 'peace', label: 'PEACE PAYMENTS', weekly: Math.max(0, finance.ceasefirePayment), tone: 'peace', always: false },
      { key: 'debt', label: 'DEBT PREMIUM', weekly: Math.max(0, finance.debtPremium), tone: 'debt', always: false },
    ];
    const categorizedExpenses = expenseItems.reduce((sum, item) => sum + item.weekly, 0);
    const developmentExpense = expenseItems.find((item) => item.key === 'development')!;
    developmentExpense.weekly = Math.max(
      0,
      developmentExpense.weekly + totalExpenses - categorizedExpenses,
    );
    const expenseRows = expenseItems
      .filter((item) => item.always || item.weekly > 0.0000005)
      .map((item) => {
        const share = totalExpenses > 0 ? item.weekly / totalExpenses * 100 : 0;
        const boundedShare = Math.max(0, Math.min(100, share));
        const shareLabel = share > 0 && share < 0.1 ? '&lt;0.1%' : `${format(share, 1)}%`;
        return `<article class="economy-expense-breakdown__item economy-expense-breakdown__item--${item.tone} ${item.weekly > 0 ? 'is-funded' : 'is-zero'}" aria-label="${item.label}: ${cash(annual(item.weekly))} per year, ${format(share, 1)} percent of total costs"><div><span>${item.label}</span><strong>−${cash(annual(item.weekly))}<small>/year</small></strong><em>${shareLabel}</em></div><i aria-hidden="true"><b style="width:${boundedShare}%"></b></i></article>`;
      })
      .join('');
    const reserveCoverage = finance.reserveTarget > 0 ? human.treasury / finance.reserveTarget : 1;
    return `
      <aside class="world-panel command-drawer glass-panel economy-command economy-command--simple command-drawer--unified" data-scroll-session="${drawerScrollSessionId('economy')}">
        <button class="panel-close" data-action="close-panel" aria-label="Close economy">×</button>
        <div class="drawer-heading drawer-heading--compact drawer-heading--single economy-heading"><div><h2>Financial overview</h2></div><strong class="${finance.net >= 0 ? 'is-positive' : 'is-negative'}">${signedCash(annual(finance.net))} / YEAR</strong></div>

        <section class="finance-flow-summary" aria-label="Annual cashflow">
          <article class="is-income"><span>TOTAL INCOME</span><strong>+${cash(annual(totalIncome))}</strong><small>/ year</small></article>
          <i aria-hidden="true">−</i>
          <article class="is-expense"><span>TOTAL COSTS</span><strong>−${cash(annual(totalExpenses))}</strong><small>/ year</small></article>
          <i aria-hidden="true">=</i>
          <article class="${finance.net >= 0 ? 'is-income' : 'is-expense'}"><span>NET BALANCE</span><strong>${signedCash(annual(finance.net))}</strong><small>/ year</small></article>
        </section>

        <section class="finance-context-grid unified-stat-grid" aria-label="Financial overview">
          <article><span>NATIONAL ECONOMY</span><strong>${cash(economy.controlledOutput)}</strong><small class="${growth >= 0 ? 'is-positive' : 'is-negative'}">${signed(growth * 100, 2)}% real growth / year</small></article>
          <article><span>TAX RATE</span><strong>${format(economy.taxRate * 100, 1)}%</strong><small>${cash(annual(finance.revenue))} revenue / year</small></article>
          <article class="${human.treasury > 0 ? 'is-good' : human.treasury < 0 ? 'is-danger' : ''}"><span>TREASURY</span><strong class="${human.treasury > 0 ? 'is-positive' : human.treasury < 0 ? 'is-negative' : ''}">${cash(human.treasury)}</strong><small>${human.treasury >= 0 ? 'Available national cash balance' : 'Outstanding treasury deficit'}</small></article>
          <article class="${reserveCoverage >= 1 ? 'is-good' : 'is-warn'}"><span>RESERVE TARGET</span><strong>${cash(finance.reserveTarget)}</strong><small>${format(Math.max(0, reserveCoverage) * 100, 1)}% funded</small></article>
        </section>
        ${finance.newBorrowing > 0 || human.treasury < 0 ? `<div class="simple-panel-alert is-debt"><b>DEBT FINANCING</b><span>${cash(finance.newBorrowing)} new borrowing this week · ${cash(annual(finance.debtPremium))}/year debt premium</span></div>` : ''}

        <span class="section-label">INCOME BREAKDOWN · YEAR</span>
        <section class="economy-expense-breakdown economy-income-breakdown" aria-label="Annual income breakdown">
          <div class="economy-expense-breakdown__columns"><span>SOURCE</span><span>AMOUNT / YEAR</span><span>SHARE</span></div>
          <div class="economy-expense-breakdown__items">${incomeRows}</div>
          <footer><span>TOTAL INCOME</span><strong>+${cash(annual(totalIncome))}<small>/year</small></strong><b>${totalIncome > 0 ? '100%' : '0%'}</b></footer>
        </section>

        <span class="section-label">EXPENSE BREAKDOWN · YEAR</span>
        <section class="economy-expense-breakdown" aria-label="Annual expense breakdown">
          <div class="economy-expense-breakdown__columns"><span>CATEGORY</span><span>AMOUNT / YEAR</span><span>SHARE</span></div>
          <div class="economy-expense-breakdown__items">${expenseRows}</div>
          <footer><span>TOTAL COSTS</span><strong>−${cash(annual(totalExpenses))}<small>/year</small></strong><b>${totalExpenses > 0 ? '100%' : '0%'}</b></footer>
        </section>
      </aside>
    `;
  }
  private renderResearchPanel(
    human: NationViewV2,
    finance: WeeklyFinanceBreakdownV2,
  ): string {
    const militarySnapshot = this.engine.militaryBaseSnapshot();
    const armyStrength = this.engine.armyStrength(human.id);
    const nationalArmy = nationalArmyState(this.engine, human.id, armyStrength, militarySnapshot);
    const nationalQuality = militarySnapshot.nationalQualityByNation.get(human.id);
    const liveIq = selectNationalIqViewV2(this.engine.state, this.engine.content, human.id);
    const effectDisplayContext: ResearchEffectDisplayContextV2 = {
      researchConversion: nationalQuality?.researchConversion ?? 1,
      baseDefense: nationalArmy.baseDefense,
      combinedMultiplier: nationalQuality?.combinedMultiplier ?? 1,
      iqResearchBonus: liveIq.researchBonus,
    };
    const portfolio = this.engine.researchPortfolio(human.id, finance);
    const deterrence = this.engine.nuclearPower(human.id);
    const next = nextResearchMilestone(portfolio);
    const completed = portfolio.reduce((sum, branch) => sum + branch.breakthroughs, 0);
    const effectLevels = this.engine.state.players[human.id]!.research.effectLevels;
    const upgradeTotals = Object.entries(effectLevels)
      .filter(([, level]) => level > 0)
      .sort(([left], [right]) => researchEffectLabel(left).localeCompare(researchEffectLabel(right)))
      .map(([effect, level]) => {
        const typedEffect = effect as ResearchEffectV2;
        const impact = selectResearchEffectImpactV2(
          this.engine.state,
          this.engine.content,
          human.id,
          typedEffect,
        );
        const total = researchEffectTotal(typedEffect, level, impact, effectDisplayContext);
        const visual = researchEffectVisualV2(typedEffect);
        const label = researchEffectLabel(effect);
        return `<article class="research-effect-card research-effect-card--${visual.tone}" aria-label="${escapeHtml(label)}, ${escapeHtml(total)}, level ${level}"><i aria-hidden="true">${visual.icon}</i><div><span>${escapeHtml(label)}</span><strong>${escapeHtml(total)}</strong></div><small>LEVEL ${level}</small></article>`;
      })
      .join('');
    const nextProgress = next ? Math.round(clamp(next.progressRatio, 0, 1) * 100) : 100;
    const nextWeeks = next && next.weeklyProgress > 0
      ? Math.max(1, Math.ceil(Math.max(0, next.nextCost - next.progress) / next.weeklyProgress))
      : 0;
    const nuclearProgress = Math.round(deterrence.progressRatio * 100);
    const programs = portfolio.map((branch) => {
      const progress = branch.maxed ? 100 : Math.round(clamp(branch.progressRatio, 0, 1) * 100);
      const effects = branch.effects.map((effect) => `${researchEffectLabel(effect.effect)} LV ${effect.level}`).join(' · ');
      const harder = branch.maxed ? 'maximum useful level reached'
        : branch.nextCostIncreaseRatio > 1
        ? `${format((branch.nextCostIncreaseRatio - 1) * 100)}% harder after completion` : 'final level';
      const description = `${RESEARCH_META[branch.branch].label}: ${effects} · ${harder}`;
      return `<article class="progress-program progress-program--compact${branch.maxed ? ' is-maxed' : ''}" tabindex="0" aria-label="${escapeHtml(description)}" style="--project:${RESEARCH_COLORS[branch.branch]}" title="${escapeHtml(description)}"><div><span>${escapeHtml(RESEARCH_META[branch.branch].shortLabel)}</span><b>${branch.maxed ? 'MAX' : `${progress}%`}</b></div><strong>${branch.breakthroughs} upgrades · ${branch.maxed ? 'focus redistributed' : `${branch.allocation}% focus`}</strong><i><b style="width:${progress}%"></b></i></article>`;
    }).join('');
    return `
      <aside class="world-panel command-drawer glass-panel progress-command research-command command-drawer--clean command-drawer--unified" data-scroll-session="${drawerScrollSessionId('research')}">
        <button class="panel-close" data-action="close-panel" aria-label="Close research">×</button>
        <div class="drawer-heading drawer-heading--compact drawer-heading--single"><div><h2>National research</h2></div><strong class="is-positive">${completed} UPGRADES</strong></div>

        ${this.renderArcticGatewayCard(human)}

        <section class="research-next-card" style="--project:${next ? RESEARCH_COLORS[next.branch] : '#69e3a2'}" aria-label="Next research breakthrough">
          <div><span>NEXT BREAKTHROUGH</span><strong>${next ? escapeHtml(RESEARCH_META[next.branch].label) : 'ALL PROGRAMS COMPLETE'}</strong><b>${nextProgress}%</b></div>
          <i role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${nextProgress}"><b style="width:${nextProgress}%"></b></i>
          <small>${next ? `${nextWeeks ? `About ${nextWeeks} weeks at current throughput · ` : ''}${next.allocation}% national focus` : 'Every useful research level has been completed.'}</small>
        </section>

        <section class="research-signal-grid unified-stat-grid" aria-label="Research system">
          <article><span>R&D CONVERSION</span><strong>×${format(nationalQuality?.researchConversion ?? 1, 2)}</strong><small>Live IQ and national systems</small></article>
          <article><span>LIVE IQ</span><strong>${format(liveIq.score, 1)}</strong><small>Education bonus ${signed(liveIq.researchBonus, 1)}</small></article>
          <article class="${finance.warResearchPenalty > 0 ? 'is-warn' : 'is-good'}"><span>THROUGHPUT</span><strong>${format((1 - finance.warResearchPenalty) * 100, 1)}%</strong><small>${finance.warResearchPenalty > 0 ? 'Reduced by active war' : 'No wartime disruption'}</small></article>
          <article><span>NUCLEAR PROGRAM</span><strong>${deterrence.level ? `TIER ${deterrence.level}` : `${nuclearProgress}%`}</strong><small>+${format(deterrence.attackBonus * 100)}% attack deterrence</small></article>
        </section>

        ${finance.foodDevelopmentTransfer > 0 ? '<div class="simple-panel-alert is-food"><b>FOOD RESEARCH PRIORITY</b><span>Development is temporarily redirected to food. Research remains active while APEX prioritizes logistics and supply programs.</span></div>' : ''}
        <section class="research-effects" aria-labelledby="research-effects-title"><header><span class="section-label" id="research-effects-title">ACTIVE EFFECTS</span><small>Effective national bonuses</small></header><div class="upgrade-total-grid">${upgradeTotals || '<div class="empty-state">No completed research effects yet.</div>'}</div></section>
        <span class="section-label">PROGRAMS</span>
        <div class="progress-programs progress-programs--compact">${programs}</div>
      </aside>
    `;
  }
  private renderMilitaryCommandOverview(
    human: NationViewV2,
    economy: NationalEconomyV2,
    finance: WeeklyFinanceBreakdownV2,
  ): string {
    const iq = selectNationalIqViewV2(this.engine.state, this.engine.content, human.id);
    const army = this.engine.armyStrength(human.id);
    const militarySnapshot = this.engine.militaryBaseSnapshot();
    const nationalArmy = nationalArmyState(this.engine, human.id, army, militarySnapshot);
    const attack = this.engine.effectiveAttack(human.id, nationalArmy, militarySnapshot);
    const defense = this.engine.effectiveDefense(human.id, nationalArmy, militarySnapshot);
    const currentPower = this.engine.currentPower(human.id, militarySnapshot);
    const nationalQuality = militarySnapshot.nationalQualityByNation.get(human.id);
    const baseRatings = militarySnapshot.byNation.get(human.id) ?? {
      attack: nationalArmy.baseAttack,
      defense: nationalArmy.baseDefense,
    };
    const combinedQuality = nationalQuality?.combinedMultiplier ?? 1;
    const attackUpgradeMultiplier = attack
      / Math.max(0.000001, baseRatings.attack * combinedQuality);
    const defenseResultMultiplier = defense
      / Math.max(0.000001, baseRatings.defense * combinedQuality);
    const armyReady = clamp(army.fillRatio, 0, 1);
    const reserveReady = finance.trainedReserveCapacity > 0
      ? clamp(human.trainedReserves / finance.trainedReserveCapacity, 0, 1)
      : 0;
    const upkeepReady = clamp(finance.mandatoryFundingRatio, 0, 1.25);
    const openingMultiplier = openingArmyCapacityMultiplierV2(
      this.engine.state,
      this.engine.content,
      human.id,
    );
    const openingWeeks = Math.max(
      0,
      OPENING_ARMY_BONUS_DURATION_TICKS_V2 - this.engine.state.tick,
    );
    const openingBonus = human.openingArmyBonus;
    const openingForce = Math.max(0, openingBonus?.remainingManpower ?? 0);
    const openingStatus = Math.abs(openingMultiplier - 1) <= 0.0005 ? '' : `
      <div class="military-opening-status ${openingMultiplier > 1 ? 'is-boost' : 'is-limit'}">
        <div><span>${openingMultiplier > 1 ? 'PLAYER OPENING FORCE' : 'OPENING BALANCE LIMIT'}</span><strong>×${format(openingMultiplier, 2)} HOMELAND CAP</strong></div>
        <b>${openingMultiplier > 1 ? `${people(openingForce)} free troops left` : 'TEMPORARILY REDUCED'}</b>
        <small>${format(openingWeeks / 52, 1)} years remaining · returns to ×1 · ${openingMultiplier > 1 ? 'free contingent never refills · paid homeland recruits can use cap' : 'homeland cap restriction only'}</small>
      </div>`;
    const readinessRow = (
      label: string,
      value: string,
      detail: string,
      ratio: number,
      tone: string,
      ratioMax = 1,
    ): string => `<article class="${tone}"><div><span>${label}</span><strong>${value}</strong><small>${detail}</small></div><b>${format(ratio * 100, 0)}%</b><i><em style="width:${format(clamp(ratio / ratioMax, 0, 1) * 100, 2)}%"></em></i></article>`;
    return `<section class="military-command-overview">
      <header class="military-power-hero">
        <div><span>NATIONAL COMBAT POWER</span><strong>${compactNumber(currentPower)}</strong><small>Active force × attack/defence systems</small></div>
        <section><article class="is-atk"><span>ATTACK</span><strong>${format(attack, 2)}</strong><small>systems ×${format(attackUpgradeMultiplier, 2)}</small></article><article class="is-def"><span>DEFENCE</span><strong>${format(defense, 2)}</strong><small>result ×${format(defenseResultMultiplier, 2)}</small></article></section>
      </header>

      <div class="military-readiness-head"><span>FORCE READINESS</span><strong class="${armyReady >= 0.55 && upkeepReady >= 0.95 ? 'is-positive' : 'is-warn'}">${armyReady >= 0.55 && upkeepReady >= 0.95 ? 'OPERATIONAL' : 'RECOVERING'}</strong></div>
      <div class="military-readiness-grid">
        ${readinessRow('ACTIVE FORCE', `${people(army.deployed)} / ${people(army.capacity)}`, 'deployed / capacity', armyReady, armyReady >= 0.55 ? 'is-good' : 'is-warn')}
        ${readinessRow('TRAINED RESERVE', `${people(human.trainedReserves)} / ${people(finance.trainedReserveCapacity)}`, `${finance.reserveDeployment > 0 ? `−${people(finance.reserveDeployment)} deployed` : `+${people(finance.reserveTraining)} trained`} this week`, reserveReady, reserveReady >= 0.5 ? 'is-good' : 'is-neutral')}
        ${readinessRow('UPKEEP FUNDED', `${cash(annual(finance.fundedArmyUpkeep))} / ${cash(annual(finance.armyUpkeep))}`, 'funded / required each year', upkeepReady, upkeepReady >= 0.999 ? 'is-good' : 'is-warn', 1.25)}
      </div>
      ${openingStatus}

      <div class="military-system-grid">
        <article><i>IQ</i><div><span>COMMAND SYSTEMS</span><strong>${format(iq.score, 1)} IQ</strong><small>${signed((nationalQuality?.iqSystemContribution ?? 0) * 100, 1)}% combat contribution</small></div></article>
        <article><i>GDP</i><div><span>INDUSTRIAL SYSTEMS</span><strong>${signed((nationalQuality?.gdpSystemContribution ?? 0) * 100, 1)}%</strong><small>${cash(economy.wealthPerPerson / 1e6)} output per capita</small></div></article>
        <article><i>R&D</i><div><span>ECONOMY RESEARCH</span><strong>${signed(((nationalQuality?.economyResearchMultiplier ?? 1) - 1) * 100, 1)}%</strong><small>Shared attack and defence modernisation</small></div></article>
        <article><i>TRN</i><div><span>RECRUITMENT PIPELINE</span><strong>${format(finance.recruitmentFundingRatio * 100, 1)}%</strong><small>Current requested training funded</small></div></article>
      </div>
    </section>`;
  }
  private renderWarDiplomacyRow(war: WarStateV2, humanId: PlayerId): string {
    const enemyId = war.attackerId === humanId ? war.defenderId : war.attackerId;
    const enemy = this.engine.player(enemyId)!;
    const score = war.attackerId === humanId ? war.warScore : -war.warScore;
    const terms = this.engine.peaceProposalTerms(war.id, humanId);
    const ceasefire = this.engine.ceasefireTerms(war.id, humanId);
    const suggested = terms.suggestedSettlement ?? 'reparations';
    const warAge = this.engine.state.tick - war.startedTick;
    const peaceWait = Math.max(0, PEACE_REQUEST_MIN_WAR_AGE_TICKS - warAge);
    const peaceButton = ceasefire.allowed
      ? `REQUEST PEACE · ${cash(annual(ceasefire.weeklyCost))}/YR`
      : peaceWait > 0 ? `PEACE IN ${peaceWait}W`
      : ceasefire.cooldownRemaining > 0 ? `RETRY IN ${ceasefire.cooldownRemaining}W`
      : /pending/i.test(ceasefire.reason ?? '') ? 'OFFER PENDING'
      : 'PEACE UNAVAILABLE';
    return `<article class="war-diplomacy-row" style="--enemy:${enemy.cssColor}"><i class="country-flag">${countryFlagHtml(enemy.id, enemy.sigil)}</i><div><span>TREATY CHANNEL</span><strong>${escapeHtml(enemy.shortName)}</strong><small>War score ${signed(score)} · campaign details remain in War Command</small></div><div>${terms.allowed ? `<button class="secondary-button" data-action="peace-settlement" data-player="${enemy.id}" data-settlement="${suggested}">REPARATIONS</button>` : ''}<button class="ghost-button" data-action="request-ceasefire" data-war="${war.id}" ${ceasefire.allowed ? '' : 'disabled'} title="${escapeHtml(ceasefire.reason ?? 'Peace requests use a retry cooldown.')}">${escapeHtml(peaceButton)}</button></div></article>`;
  }

  private renderWarPanel(
    human: NationViewV2,
    economy: NationalEconomyV2,
    finance: WeeklyFinanceBreakdownV2,
  ): string {
    const army = this.engine.armyStrength(human.id);
    const wars = this.humanWars();
    const resistance = this.engine.globalResistance();
    const recommendations = this.warTargetRecommendations(human.id, resistance);
    return `
      <aside class="world-panel command-drawer glass-panel war-command command-drawer--clean command-drawer--unified" data-scroll-session="${drawerScrollSessionId('war')}">
        <button class="panel-close" data-action="close-panel" aria-label="Close war command">×</button>
        <div class="drawer-heading drawer-heading--compact drawer-heading--single"><div><h2>Military command</h2></div><strong class="${wars.length ? 'is-negative' : army.fillRatio >= 0.55 ? 'is-positive' : 'is-warn'}">${wars.length ? 'AT WAR' : army.fillRatio >= 0.55 ? 'READY' : 'REBUILDING'}</strong></div>

        ${this.renderMilitaryCommandOverview(human, economy, finance)}
        ${wars.length ? `<span class="section-label">TREATY OPTIONS</span><div class="war-diplomacy-list">${wars.map((war) => this.renderWarDiplomacyRow(war, human.id)).join('')}</div>` : ''}
        <span class="section-label">BEST AVAILABLE TARGETS</span>
        <div class="war-intel-list war-intel-list--compact">${recommendations.length ? recommendations.map((candidate, index) => this.renderTargetRecommendation(candidate, index)).join('') : '<div class="empty-state">No legal target is currently in land or naval range.</div>'}</div>
        ${this.renderAntarcticaGatewayCard()}
      </aside>
    `;
  }
  private warTargetRecommendations(
    humanId: PlayerId,
    resistance: GlobalResistanceV2,
  ): WarTargetCandidate[] {
    const tickBucket = Math.floor(this.engine.state.tick / 6);
    const warSignature = this.engine.state.wars
      .map((war) => `${war.id}:${war.attackerId}:${war.defenderId}`)
      .sort().join('|');
    const resistanceSignature = `${resistance.level}:${resistance.memberIds.join(',')}`;
    const cached = this.warTargetCache;
    if (cached?.humanId === humanId && cached.tickBucket === tickBucket
      && cached.warSignature === warSignature && cached.resistanceSignature === resistanceSignature) {
      return cached.recommendations;
    }
    const candidates = this.connectedOpponentIds(humanId).flatMap((targetId): WarTargetCandidate[] => {
      const target = this.engine.player(targetId)!;
      const declaration = this.engine.warDeclarationStatus(humanId, targetId);
      if (!declaration.allowed || declaration.access === 'none') return [];
      const chance = this.winChance(humanId, targetId);
      const economy = this.engine.nationalEconomy(targetId);
      const iq = selectNationalIqViewV2(this.engine.state, this.engine.content, targetId);
      return [{
        targetId,
        target,
        declaration,
        chance,
        access: declaration.access,
        gdpPerCapitaThousands: economy.wealthPerPerson,
        nationalIq: iq.score,
        distanceKm: selectWarRouteDistanceKmV2(
          this.engine.state,
          this.engine.content,
          humanId,
          targetId,
        ),
      }];
    });
    const recommendations = rankWarTargetRecommendationsV2(candidates).slice(0, 3);
    this.warTargetCache = {
      humanId,
      tickBucket,
      warSignature,
      resistanceSignature,
      recommendations,
    };
    return recommendations;
  }

  private connectedOpponentIds(playerId: PlayerId): PlayerId[] {
    return this.ranking().map((entry) => entry.player.id)
      .filter((targetId) => targetId !== playerId && this.engine.warAccessType(playerId, targetId) !== 'none');
  }

  private renderTargetRecommendation(candidate: {
    targetId: PlayerId;
    target: NationViewV2;
    declaration: WarDeclarationStatusV2;
    chance: number;
    access: AvailableWarTargetAccessV2;
    distanceKm?: number;
    gdpPerCapitaThousands: number;
    nationalIq: number;
  }, index: number): string {
    const battleForecast = this.engine.warForecast(this.viewerPlayerId(), candidate.targetId);
    const targetArmy = this.engine.armyStrength(candidate.targetId);
    const mapTarget = battleForecast.targetId ?? candidate.target.capitalId;
    const chanceTone = candidate.chance >= 65 ? 'is-positive' : candidate.chance >= 45 ? 'is-warn' : 'is-negative';
    const routeLabel = warTargetRouteLabelV2(candidate.access, candidate.distanceKm);
    const fusionBonus = warTargetFusionValueBonusV2(candidate);
    return `<article class="war-intel-card war-intel-card--compact" style="--enemy:${candidate.target.cssColor}"><i class="country-flag">${countryFlagHtml(candidate.target.id, candidate.target.sigil)}</i><div><span>${index === 0 ? 'BEST TARGET' : `OPTION ${index + 1}`} · ${routeLabel}</span><strong>${escapeHtml(candidate.target.name)}</strong><small><b class="${chanceTone}">${format(candidate.chance, 1)}% WIN</b> · army ${people(targetArmy.deployed)} · reserve ${people(candidate.target.trainedReserves)} · ${format(targetArmy.fillRatio * 100)}% ready</small><small class="war-intel-card__fusion"><b>FUSION +${format(fusionBonus, 1)}</b> · GDP/PC ${cash(candidate.gdpPerCapitaThousands / 1e6)} · IQ ${format(candidate.nationalIq, 1)}</small></div><button data-action="quick-war" data-player="${candidate.targetId}" data-map-target="${mapTarget}" title="Review attack on ${escapeHtml(candidate.target.shortName)}"><span>REVIEW</span></button></article>`;
  }

  private renderWarCard(war: WarStateV2, humanId: PlayerId, finance: WeeklyFinanceBreakdownV2): string {
    const enemyId = war.attackerId === humanId ? war.defenderId : war.attackerId;
    const enemy = this.engine.player(enemyId)!;
    const score = war.attackerId === humanId ? war.warScore : -war.warScore;
    const ownArmy = this.totalCombatStrength(humanId);
    const enemyArmy = this.totalCombatStrength(enemyId);
    const ownReserve = this.engine.state.players[humanId]?.trainedReserves ?? 0;
    const operations = warOperationsFor(war, humanId);
    const terms = this.engine.peaceProposalTerms(war.id, humanId);
    const ceasefire = this.engine.ceasefireTerms(war.id, humanId);
    const suggested = terms.suggestedSettlement ?? 'reparations';
    const accessKinds = new Set(operations.map((front) => front.access));
    const accessLabel = operations.length === 0 ? 'assigning fronts'
      : accessKinds.size > 1 ? 'mixed routes'
      : `${warAccessLabel(operations[0]!.access).toLowerCase()} route`;
    const warAge = this.engine.state.tick - war.startedTick;
    const mobilizationWeeks = Math.max(0, WAR_MOBILIZATION_TICKS - warAge);
    const estimate = this.engine.liveWarEstimate(war.id, humanId);
    const peaceWait = Math.max(0, PEACE_REQUEST_MIN_WAR_AGE_TICKS - warAge);
    const peaceButton = ceasefire.allowed
      ? `REQUEST PEACE · ${cash(annual(ceasefire.weeklyCost))}/YR`
      : peaceWait > 0 ? `PEACE IN ${peaceWait}W`
      : ceasefire.cooldownRemaining > 0 ? `PEACE RETRY IN ${ceasefire.cooldownRemaining}W`
      : /pending/i.test(ceasefire.reason ?? '') ? 'PEACE OFFER PENDING'
      : 'PEACE UNAVAILABLE';
    const status = mobilizationWeeks > 0 ? `Mobilising · combat in ${mobilizationWeeks}w`
      : score >= 25 ? 'Advantage' : score <= -25 ? 'Under pressure' : 'Contested';
    const eta = estimate
      ? `${warTimeRange(estimate.estimatedWeeksMin, estimate.estimatedWeeksMax)} · ${warOutlookLabel(estimate)}`
      : 'Awaiting first battle';
    const perWarCost = annual(finance.warOperations / Math.max(1, this.humanWars().length));
    return `<article class="war-card-compact" style="--enemy:${enemy.cssColor}"><div class="war-card-compact__head"><i class="country-flag">${countryFlagHtml(enemy.id, enemy.sigil)}</i><div><strong>${escapeHtml(enemy.name)}</strong><small>Week ${warAge} · ${war.battles} battles · ${accessLabel}</small></div><b class="${score < 0 ? 'danger-text' : 'is-positive'}">${signed(score)}</b></div><div class="war-card-compact__state"><span>${escapeHtml(status)}</span><small>${cash(perWarCost)}/year</small></div><div class="war-card-compact__metrics"><span><small>ARMIES</small><b>${people(ownArmy.deployed)} / ${people(enemyArmy.deployed)}</b><small>RES ${people(ownReserve)} / ${people(enemy.trainedReserves)}</small></span><span><small>MILITARY LOST</small><b>−${people(estimate?.totalOwnLosses ?? 0)} / −${people(estimate?.totalEnemyLosses ?? 0)}</b></span><span><small>EST. END</small><b>${escapeHtml(eta)}</b></span></div><div class="war-card-actions">${terms.allowed ? `<button class="secondary-button" data-action="peace-settlement" data-player="${enemy.id}" data-settlement="${suggested}">Offer reparations</button>` : ''}<button class="ghost-button" data-action="request-ceasefire" data-war="${war.id}" ${ceasefire.allowed ? '' : 'disabled'} title="${escapeHtml(ceasefire.reason ?? 'Peace requests use a 26-week retry cooldown.')}">${escapeHtml(peaceButton)}</button></div></article>`;
  }

  private renderPeaceOfferCard(offer: PeaceOfferV2): string {
    const from = this.engine.player(offer.fromId)!;
    const responseWeeks = Math.max(0, offer.expiresTick - this.engine.state.tick);
    const ceasefireDuration = offer.settlement === 'ceasefire'
      ? this.engine.ceasefireTerms(offer.warId, offer.fromId) : undefined;
    const paymentWeeks = offer.paymentWeeks ?? ceasefireDuration?.paymentWeeks ?? 0;
    const protectedPeaceWeeks = ceasefireDuration?.postPaymentTruceTicks ?? 0;
    const detail = offer.settlement === 'ceasefire'
      ? `${cash(annual(offer.weeklyCost ?? 0))}/year rate · ${cash((offer.weeklyCost ?? 0) * paymentWeeks)} total over ${paymentWeeks}w · then ${protectedPeaceWeeks}w protected peace`
      : `${cash(offer.cashAmount ?? 0)} reparations`;
    return `<article style="--enemy:${from.cssColor}"><div><i class="country-flag">${countryFlagHtml(from.id, from.sigil)}</i><div><strong>${escapeHtml(from.name)} offers peace</strong><small>${escapeHtml(detail)} · ${responseWeeks}w to decide</small>${offer.settlement === 'ceasefire' ? '<small>Conquered territory remains with its current owner.</small>' : ''}</div></div><div class="territory-actions" style="position:static;margin:8px 0 0;padding:0;background:none;display:grid;grid-template-columns:1fr 1fr;gap:6px"><button class="ghost-button" data-action="respond-offer" data-offer="${offer.id}" data-accept="false">Continue war</button><button class="primary-button" data-action="respond-offer" data-offer="${offer.id}" data-accept="true">Accept treaty</button></div></article>`;
  }

  private renderTerritoryPanel(
    territoryId: TerritoryId,
    territory: TerritoryStateV2,
    viewerEconomy: NationalEconomyV2,
    viewerFinance: WeeklyFinanceBreakdownV2,
  ): string {
    const definition = this.engine.content.territories[territoryId]!;
    const owner = this.engine.player(territory.owner)!;
    const terrainProfile = territoryTerrainProfileV2(this.engine.content, territoryId);
    const terrainEffects = territoryTerrainEffectsV2(this.engine.content, territoryId);
    const humanId = this.viewerPlayerId();
    const isOwnTerritory = owner.id === humanId;
    const ownerHumanControlled = this.engine.state.humanPlayerIds.includes(owner.id);
    const empireTerritories = this.engine.territoriesOf(owner.id);
    const economy = isOwnTerritory
      ? viewerEconomy : this.engine.nationalEconomy(owner.id);
    const finance = isOwnTerritory
      ? viewerFinance : this.engine.weeklyFinanceBreakdown(owner.id);
    const iq = selectNationalIqViewV2(this.engine.state, this.engine.content, owner.id);
    const army = this.engine.armyStrength(owner.id);
    const militarySnapshot = this.engine.militaryBaseSnapshot();
    const nationalArmy = nationalArmyState(this.engine, owner.id, army, militarySnapshot);
    const manpowerRatio = army.capacity > 0 ? army.deployed / army.capacity : 0;
    const attack = this.engine.effectiveAttack(owner.id, nationalArmy, militarySnapshot);
    const defense = this.engine.effectiveDefense(owner.id, nationalArmy, militarySnapshot);
    const power = this.engine.currentPower(owner.id, militarySnapshot);
    const activeWar = owner.id !== humanId ? this.engine.activeWarBetween(humanId, owner.id) : undefined;
    const declaration = owner.id !== humanId ? this.engine.warDeclarationStatus(humanId, owner.id) : undefined;
    const foodTone = finance.foodCoverage < 0.90 ? 'is-danger'
      : finance.foodCoverage < 0.98 || finance.foodStockChange < 0 ? 'is-warn' : 'is-good';
    const access = declaration?.access ?? 'none';
    const integratingCore = territory.coreOwner !== territory.owner
      ? this.engine.player(territory.coreOwner) : undefined;
    const integrationWeeks = territory.integrationProgram
      ? Math.max(0, territory.integrationProgram.completesTick - this.engine.state.tick)
      : 0;
    const integrationYears = integrationWeeks / 52;
    const integrationPercent = clamp(territory.integration * 100, 0, 100);
    const territoryIntegrationAnnualCost = territory.integrationProgram?.annualCost ?? 0;
    const guardWeeks = territory.integrationProgram
      ? Math.max(0, territory.integrationProgram.startedTick
        + CONQUEST_CAPTURE_GUARD_TICKS - this.engine.state.tick)
      : 0;
    const localArmyCapacity = stateTerritoryArmyCapacityTargetV2(
      this.engine.state, this.engine.content, territoryId, owner.id,
    );
    const deploymentCeiling = stateTerritoryArmySupportCeilingV2(
      this.engine.state, this.engine.content, territoryId, owner.id,
    );
    const empireSupport = Math.max(0, deploymentCeiling - localArmyCapacity);
    const localArmyRatio = deploymentCeiling > 0
      ? territory.army.manpower / deploymentCeiling : 0;
    const unlockedPopulation = territory.population * territory.integration;
    const unlockedOutput = territory.economy * territory.integration;
    const panelStatus = activeWar ? 'WAR LIVE'
      : integrationWeeks > 0 ? 'INTEGRATING'
      : isOwnTerritory ? 'YOUR CORE' : 'FOREIGN TARGET';
    const integrationPayer = isOwnTerritory ? 'YOU PAY' : `${owner.shortName.toUpperCase()} PAYS`;
    const integrationPanel = integrationWeeks > 0
      ? `<section class="territory-integration-card"><div class="territory-integration-card__head"><span>INTEGRATING ${escapeHtml(integratingCore?.shortName ?? definition.name).toUpperCase()}</span><strong>${format(integrationPercent, 1)}%</strong></div><i role="progressbar" aria-label="Integration progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${format(integrationPercent, 1)}"><b style="width:${integrationPercent}%"></b></i><div class="territory-integration-card__metrics"><div><span>TIME LEFT</span><strong>${format(integrationYears, 1)} YEARS</strong></div><div><span>${escapeHtml(integrationPayer)}</span><strong class="is-negative">−${cash(territoryIntegrationAnnualCost)} / YEAR</strong></div></div><small>${cash(unlockedOutput)} of ${cash(territory.economy)} output unlocked · then permanent ${escapeHtml(owner.shortName)} core${guardWeeks > 0 ? ` · capture guard ${guardWeeks}w` : ''}</small></section>`
      : '';
    const blockedWarNote = !activeWar && declaration && !declaration.allowed
      ? `<div class="war-rule-note is-blocked"><b>WAR UNAVAILABLE</b><span>${escapeHtml(declaration.reason ?? 'Requirements are not met.')}</span></div>`
      : '';
    const ownerRank = Math.max(
      1,
      this.ranking().findIndex((entry) => entry.player.id === owner.id) + 1,
    );
    const primaryWarAction = owner.id === humanId ? '' : `<section class="territory-target-command ${activeWar || !declaration?.allowed ? 'is-blocked' : ''}"><div class="territory-target-power"><span>COMBAT POWER</span><strong>${compactNumber(power)}</strong><small>#${ownerRank} GLOBAL MILITARY</small></div><div class="territory-target-systems"><span><small>ATTACK</small><b>${format(attack, 2)}</b></span><span><small>DEFENCE</small><b>${format(defense, 2)}</b></span><span><small>READY</small><b>${format(manpowerRatio * 100)}%</b></span></div><div class="territory-target-decision"><span>${activeWar ? 'WAR IN PROGRESS' : declaration?.allowed ? `${warAccessLabel(access)} ATTACK ROUTE` : 'ATTACK UNAVAILABLE'}</span>${activeWar ? '<button class="danger-button" disabled>WAR ALREADY LIVE</button>' : `<button class="danger-button" data-action="quick-war" data-player="${owner.id}" ${declaration?.allowed ? '' : 'disabled'}>${declaration?.allowed ? 'REVIEW ATTACK' : 'WAR UNAVAILABLE'}</button>`}</div></section>${declaration?.warning ? `<div class="war-rule-note is-warning"><b>WEAK-ARMY WARNING</b><span>${escapeHtml(declaration.warning)}</span></div>` : ''}${blockedWarNote}`;
    const otherHumanPlayer = owner.id !== humanId && ownerHumanControlled;
    const allied = otherHumanPlayer && this.engine.areAllied(humanId, owner.id);
    const allianceOffer = otherHumanPlayer ? this.engine.state.allianceOffers.find((offer) => (
      (offer.fromId === humanId && offer.toId === owner.id)
      || (offer.fromId === owner.id && offer.toId === humanId)
    )) : undefined;
    const allianceWeeks = allianceOffer
      ? Math.max(0, allianceOffer.expiresTick - this.engine.state.tick) : 0;
    const allianceStatus = otherHumanPlayer
      ? this.engine.allianceProposalStatus(humanId, owner.id) : undefined;
    const playerAlliancePanel = !otherHumanPlayer ? '' : allied
      ? '<div class="war-rule-note is-alliance"><b>PLAYER ALLIANCE ACTIVE</b><span>Mutual non-aggression pact · war between both human countries is blocked.</span></div>'
      : allianceOffer?.toId === humanId
        ? `<div class="war-rule-note is-alliance"><b>ALLIANCE INVITATION · ${allianceWeeks}W LEFT</b><span>${escapeHtml(owner.shortName)} proposes a mutual non-aggression pact.</span></div><div class="territory-actions territory-actions--alliance"><button class="ghost-button" data-action="respond-alliance" data-from="${owner.id}" data-to="${humanId}" data-accept="false">DECLINE</button><button class="primary-button" data-action="respond-alliance" data-from="${owner.id}" data-to="${humanId}" data-accept="true">ACCEPT ALLIANCE</button></div>`
        : allianceOffer
          ? `<div class="war-rule-note is-alliance"><b>ALLIANCE INVITATION SENT · ${allianceWeeks}W LEFT</b><span>Waiting for ${escapeHtml(owner.shortName)} to accept or decline.</span></div>`
          : `<div class="territory-actions territory-actions--alliance"><button class="secondary-button" data-action="propose-alliance" data-player="${owner.id}" ${allianceStatus?.allowed ? '' : 'disabled'} title="${escapeHtml(allianceStatus?.reason ?? 'Offer a mutual non-aggression pact to this human player.')}">PROPOSE PLAYER ALLIANCE</button></div>`;
    const ownerIntel = isOwnTerritory ? '' : `
      <span class="section-label territory-section-label">OWNER INTEL</span>
      ${renderCountryTraitIntelV2(owner.id, ownerHumanControlled, this.engine.content)}
      <section class="territory-owner-intel unified-stat-grid" aria-label="${escapeHtml(owner.name)} national intelligence">
        <article class="${manpowerRatio < 0.55 ? 'is-warn' : 'is-good'}"><span>ARMY</span><strong>${armyCapacityLabel(army.deployed, army.capacity)}</strong><small>${format(manpowerRatio * 100)}% · reserve ${people(owner.trainedReserves)}</small></article>
        <article><span>IQ</span><strong>${format(iq.score, 1)}</strong><small>National systems score</small></article>
        <article><span>ECONOMY</span><strong>${cash(economy.controlledOutput)}</strong><small>${cash(economy.wealthPerPerson / 1e6)} GDP / capita</small></article>
        <article class="${foodTone}"><span>FOOD</span><strong>${format(finance.foodCoverage * 100, 1)}%</strong><small>${people(owner.foodStock)} / ${people(finance.foodStorageCapacity)} stored</small></article>
      </section>`;
    return `
      <aside class="world-panel command-drawer glass-panel territory-inspector command-drawer--clean command-drawer--unified" data-scroll-session="${escapeHtml(drawerScrollSessionId(this.panelMode, territoryId))}">
        <button class="panel-close" data-action="clear-territory" aria-label="Close ${escapeHtml(definition.name)} details">×</button>
        <div class="panel-kicker territory-status-kicker">TERRITORY · ${escapeHtml(panelStatus)}</div>
        <div class="drawer-heading drawer-heading--compact territory-heading territory-heading--unified"><div><h2>${escapeHtml(definition.name)}</h2><span style="color:${owner.cssColor}">${escapeHtml(owner.name)} · ${empireTerritories.length} TERRITOR${empireTerritories.length === 1 ? 'Y' : 'IES'}</span></div><i class="country-flag" style="--owner:${owner.cssColor}">${countryFlagHtml(owner.id, owner.sigil)}</i></div>
        ${primaryWarAction}

        ${terrainProfilePanel(terrainProfile, terrainEffects)}

        <span class="section-label territory-section-label">SELECTED LAND</span>
        <section class="territory-land-grid unified-stat-grid">
          <article><span>RESIDENTS</span><strong>${population(territory.population)}</strong><small>${integrationWeeks > 0 ? `${population(unlockedPopulation)} unlocked` : 'Resident population'}</small></article>
          <article class="is-economy"><span>LOCAL ECONOMY</span><strong>${cash(territory.economy)}</strong><small>${integrationWeeks > 0 ? `${cash(unlockedOutput)} unlocked` : 'Live local output'}</small></article>
          <article class="is-army"><span>LOCAL ARMY / MAX</span><strong>${people(territory.army.manpower)} / ${people(deploymentCeiling)}</strong><small>${format(localArmyRatio * 100)}% · local ${people(localArmyCapacity)} · support +${people(empireSupport)}</small></article>
          <article class="is-condition ${territory.condition >= 0.75 ? 'is-good' : territory.condition < 0.5 ? 'is-danger' : 'is-warn'}"><span>CONDITION</span><strong>${format(territory.condition * 100)}%</strong><small>Land and infrastructure</small></article>
        </section>

        ${integrationPanel}
        ${ownerIntel}
        <div class="territory-action-stack">
          ${playerAlliancePanel}
        </div>
      </aside>
    `;
  }
  private winChance(attackerId: string, defenderId: string): number {
    return this.engine.warForecast(attackerId, defenderId).winChance;
  }

  private renderWarTracker(
    wars: WarStateV2[],
    finance: WeeklyFinanceBreakdownV2,
  ): string {
    const humanId = this.viewerPlayerId();
    const own = this.totalCombatStrength(humanId);
    const activeFronts = wars.reduce((sum, war) => sum + allWarOperations(war).length, 0);
    const status = `${wars.length} WAR${wars.length === 1 ? '' : 'S'} · ${activeFronts} FRONT${activeFronts === 1 ? '' : 'S'} · ${cash(annual(finance.warOperations))}/YR`;
    return `<aside class="war-tracker war-tracker--compact war-command-overlay glass-panel" aria-label="Active war command">
      <header class="war-tracker__title war-command-header"><span><i aria-hidden="true"></i> WAR COMMAND</span><b>${escapeHtml(status)}</b></header>
      <div class="war-tracker__wars war-command-campaigns" data-scroll-session="tracker:wars">${wars.map((war) => {
      const enemyId = war.attackerId === humanId ? war.defenderId : war.attackerId;
      const enemy = this.engine.player(enemyId)!;
      const hostile = this.totalCombatStrength(enemyId);
      const operations = warOperationsFor(war, humanId);
      const operation = operations[0];
      const warFrontCount = allWarOperations(war).length;
      const estimate = this.engine.liveWarEstimate(war.id, humanId);
      const focusId = operation?.targetId ?? estimate?.targetId ?? enemy.capitalId;
      const score = war.attackerId === humanId ? war.warScore : -war.warScore;
      const balance = clamp(own.deployed / Math.max(0.000001, own.deployed + hostile.deployed) * 100, 0, 100);
      const warAge = Math.max(0, this.engine.state.tick - war.startedTick);
      const routeKinds = new Set(operations.map((front) => front.access));
      const route = operations.length === 0 ? 'MOBILISING'
        : routeKinds.size > 1 ? 'MIXED ROUTES'
        : warAccessLabel(operation!.access);
      const outlook = estimate ? warOutlookLabel(estimate) : 'Awaiting combat';
      const eta = estimate
        ? warTimeRange(estimate.estimatedWeeksMin, estimate.estimatedWeeksMax)
        : 'Pending first battle';
      const ownLosses = estimate?.totalOwnLosses
        ?? (war.attackerId === humanId ? war.attackerLosses : war.defenderLosses);
      const enemyLosses = estimate?.totalEnemyLosses
        ?? (war.attackerId === humanId ? war.defenderLosses : war.attackerLosses);
      const ceasefire = this.engine.ceasefireTerms(war.id, humanId);
      const peaceWait = Math.max(0, PEACE_REQUEST_MIN_WAR_AGE_TICKS - warAge);
      const peaceStatus = ceasefire.allowed
        ? `${cash(annual(ceasefire.weeklyCost))}/YR OFFER`
        : peaceWait > 0 ? `AVAILABLE IN ${peaceWait}W`
        : ceasefire.cooldownRemaining > 0 ? `RETRY IN ${ceasefire.cooldownRemaining}W`
        : /pending/i.test(ceasefire.reason ?? '') ? 'OFFER PENDING'
        : 'UNAVAILABLE';
      const peaceTitle = ceasefire.allowed
        ? `Request peace for ${cash(annual(ceasefire.weeklyCost))} per year`
        : ceasefire.reason ?? peaceStatus;
      return `<article class="war-tracker__war war-command-campaign" style="--enemy:${escapeHtml(enemy.cssColor)}">
        <div class="war-tracker__enemy war-command-campaign__identity">
          <i class="country-flag war-command-campaign__flag" aria-hidden="true">${countryFlagHtml(enemy.id, enemy.sigil)}</i>
          <div class="war-command-campaign__opponent"><span>${escapeHtml(route)} · ${warFrontCount} FRONT${warFrontCount === 1 ? '' : 'S'}</span><strong>${escapeHtml(enemy.shortName)}</strong><small>WEEK ${warAge} · ${war.battles} BATTLE${war.battles === 1 ? '' : 'S'}</small></div>
          <div class="war-command-campaign__score"><span>WAR SCORE</span><b class="${score < 0 ? 'danger-text' : 'is-positive'}">${signed(score)}</b></div>
        </div>
        <div class="war-tracker__quick war-command-campaign__metrics">
          <span><small>ARMY REMAINING</small><b>${people(own.deployed)} <em>YOU</em></b><b>${people(hostile.deployed)} <em>ENEMY</em></b></span>
          <span><small>CUMULATIVE LOSSES</small><b>−${people(ownLosses)} <em>YOU</em></b><b>−${people(enemyLosses)} <em>ENEMY</em></b></span>
          <span><small>ETA / OUTLOOK</small><b>${escapeHtml(eta)}</b><b class="${score < 0 ? 'danger-text' : 'is-positive'}">${escapeHtml(outlook)}</b></span>
        </div>
        <div class="war-command-campaign__balance-head"><span>REMAINING FORCE BALANCE</span><b>${format(balance, 1)}% YOU · ${format(100 - balance, 1)}% ENEMY</b></div>
        <i class="war-tracker__balance war-command-campaign__balance" role="progressbar" aria-label="Your share of remaining deployed forces against ${escapeHtml(enemy.shortName)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${format(balance, 1)}"><b style="width:${balance}%"></b></i>
        <div class="war-command-campaign__actions">
          <button type="button" class="secondary-button war-command-campaign__focus" data-action="focus-war" data-territory="${escapeHtml(focusId)}"><span>FOCUS FRONT</span><small>${escapeHtml(route)}</small></button>
          <button type="button" class="ghost-button war-command-campaign__peace" data-action="request-ceasefire" data-war="${escapeHtml(war.id)}" ${ceasefire.allowed ? '' : 'disabled'} title="${escapeHtml(peaceTitle)}"><span>REQUEST PEACE</span><small>${escapeHtml(peaceStatus)}</small></button>
        </div>
      </article>`;
    }).join('')}</div>
    </aside>`;
  }

  private renderRankingPanel(): string {
    const humanId = this.viewerPlayerId();
    const ranking = this.ranking();
    const rank = ranking.findIndex((entry) => entry.player.id === humanId) + 1;
    return `<aside class="world-panel command-drawer glass-panel ranking-panel" data-scroll-session="${drawerScrollSessionId('ranking')}"><button class="panel-close" data-action="close-panel">×</button><div class="panel-kicker">GLOBAL MILITARY RANKING · LIVE</div><h2>Your country is #${rank}</h2><p>Ranked only by live Military Power.</p><div class="power-ranking">${ranking.map((entry, index) => {
      const metric = compactNumber(entry.score);
      const detail = globalRankingDetail(entry.combatPower, entry.economicOutput);
      const focusTerritoryId = this.rankingFocusTerritory(entry.player.id, entry.player.capitalId);
      return `<button type="button" class="power-ranking__row ${entry.player.id === humanId ? 'is-human' : ''} ${index === 0 ? 'is-leader' : ''}" data-action="focus-ranking-country" data-territory="${escapeHtml(focusTerritoryId ?? '')}" aria-label="Select ${escapeHtml(entry.player.name)} on the map, military rank ${index + 1}, Military Power ${metric}" style="--power:${entry.player.cssColor}"><span>#${index + 1}</span><i class="country-flag">${countryFlagHtml(entry.player.id, entry.player.sigil)}</i><div><strong>${escapeHtml(entry.player.name)}</strong><small>${detail}</small></div><b title="Military Power">${metric}</b></button>`;
    }).join('')}</div></aside>`;
  }

  private renderWarStrainMeter(
    human: NationViewV2,
    wars: WarStateV2[],
    _army: ArmyStrengthV2,
    finance: WeeklyFinanceBreakdownV2,
    standalone = false,
  ): string {
    const activeFronts = wars.reduce((sum, war) => (
      sum + warOperationsFor(war, human.id).length
    ), 0);
    // Keep military pressure and geopolitical expansion threat separate. A
    // long single campaign can exhaust the country without alarming every
    // neighbour; rapid repeated expansion drives the reaction signal below.
    const summary = selectWarStrainSummaryV2(
      this.engine.state,
      this.engine.content,
      human.id,
    );
    const expansionThreat = selectExpansionThreatSummaryV2(
      this.engine.state,
      this.engine.content,
      human.id,
    );
    const suspicion = clamp(this.engine.globalResistance().threat, 0, 100);
    const suspicionRisk = suspicionRiskPresentationV2(suspicion);
    const revolutionRisk = territoryIntegrationWarPressureRevolutionRiskV2(
      this.engine.state,
      this.engine.content,
      human.id,
    );
    const exposedIntegrations = revolutionRisk.exposedTerritories;
    const revoltRiskLevel = revolutionRisk.level;
    const revoltRiskLabel = revolutionRisk.level === 'none' ? 'NONE' : revolutionRisk.level.toUpperCase();
    const revoltWindowBonus = Math.round(revolutionRisk.bonusChance * 100);
    const recoveryWeeks = Math.ceil(human.warFatigue / PEACE_FATIGUE_RECOVERY_PER_WEEK);
    const fatigue = clamp(human.warFatigue, 0, 100);
    const growthDrag = Math.max(0, finance.warEconomyGrowthDrag * 100);
    const researchDrag = Math.max(0, finance.warResearchPenalty * 100);
    const recoveryLabel = recoveryWeeks > 0 ? `~${recoveryWeeks} WEEKS` : 'RECOVERED';
    return `<section class="war-strain-meter war-strain-meter--${summary.level} war-pressure war-pressure--${summary.level}${standalone ? ' war-strain-meter--standalone glass-panel' : ''}" role="status" aria-label="War pressure ${summary.score} out of 100, ${escapeHtml(summary.label)}" title="${escapeHtml(summary.guidance)}">
      <header class="war-strain-meter__head war-pressure__head"><div><span>WAR PRESSURE</span><strong>${escapeHtml(summary.label)}</strong></div><b class="war-pressure__score">${summary.score}<small>/100</small></b></header>
      <i class="war-strain-meter__track war-pressure__track" role="progressbar" aria-label="War pressure" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${summary.score}"><b style="width:${summary.score}%"></b></i>
      <div class="war-pressure__metrics">
        <span><small>FATIGUE</small><b>${format(fatigue, 1)}%</b></span>
        <span><small>FRONTS</small><b>${activeFronts}</b></span>
        <span title="Fast signal from simultaneous wars and recent conquests; a single long campaign stays comparatively quiet."><small>EXPANSION</small><b>${expansionThreat.score}<em>/100</em></b></span>
      </div>
      <div class="war-strain-meter__detail war-pressure__impact"><span><small>ECONOMY</small><b>−${format(growthDrag, 1)}pp / year</b></span><span><small>RESEARCH</small><b>−${format(researchDrag, 1)}% output</b></span></div>
      <section class="war-pressure__suspicion war-pressure__suspicion--${suspicionRisk.level}" aria-label="Political Suspicion: ${suspicionRisk.score} out of 100, ${escapeHtml(suspicionRisk.label)}">
        <header><div><span>POLITICAL SUSPICION</span><strong>${escapeHtml(suspicionRisk.label)}</strong></div><b>${suspicionRisk.score}<small>/100</small></b></header>
        <div class="war-pressure__suspicion-track" role="progressbar" aria-label="Political Suspicion" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${suspicionRisk.score}"><i style="width:${suspicionRisk.score}%"></i><em style="left:20%"></em><em style="left:40%"></em><em style="left:60%"></em><em style="left:80%"></em></div>
        <footer><p>${escapeHtml(suspicionRisk.guidance)}</p><span><b>0</b> NO AI WAR</span><span><b>40</b> EXPOSED</span><span><b>80</b> CRITICAL</span></footer>
      </section>
      <div class="war-pressure__revolt war-pressure__revolt--${revoltRiskLevel}"><span><small>REVOLT RISK</small><strong>${revoltRiskLabel}</strong><em>${exposedIntegrations} INTEGRATION${exposedIntegrations === 1 ? '' : 'S'} EXPOSED</em></span><p>${revoltWindowBonus > 0 ? `+${revoltWindowBonus}% sustained disruption window while pressure remains this high.` : exposedIntegrations > 0 ? 'Hostile integrations remain stable while War Pressure stays below 75.' : 'No hostile conquest integrations are currently exposed.'}</p></div>
      ${wars.length === 0 ? `<div class="war-pressure__recovery"><span>PEACETIME RECOVERY</span><strong>${escapeHtml(recoveryLabel)}</strong><small>Fatigue, economic pressure and research disruption fade automatically.</small></div>` : ''}
    </section>`;
  }

  private renderEventTicker(): string {
    const events = this.engine.state.events.filter(isMajorWorldEvent).slice(-8).reverse();
    const latest = events[0];
    return `<aside class="world-feed glass-panel ${this.eventFeedOpen ? 'is-open' : ''}"><button class="world-feed__head" data-action="toggle-feed"><span><b class="event-dot event-dot--${latest?.severity ?? 'info'}"></b> REPORT</span><strong>${latest ? escapeHtml(latest.message) : 'No reports'}</strong><i>${this.eventFeedOpen ? '×' : '↑'}</i></button><div class="world-feed__list">${events.map((event) => `<button data-action="focus-event" data-territory="${event.territoryId ?? ''}"><span>W${event.tick}</span><b class="event-dot event-dot--${event.severity}"></b><p>${escapeHtml(event.message)}</p></button>`).join('')}</div></aside>`;
  }

  private renderOfferBanner(offer: PeaceOfferV2): string {
    const from = this.engine.player(offer.fromId)!;
    const responseWeeks = Math.max(0, offer.expiresTick - this.engine.state.tick);
    const ceasefireDuration = offer.settlement === 'ceasefire'
      ? this.engine.ceasefireTerms(offer.warId, offer.fromId) : undefined;
    const paymentWeeks = offer.paymentWeeks ?? ceasefireDuration?.paymentWeeks ?? 0;
    const protectedPeaceWeeks = ceasefireDuration?.postPaymentTruceTicks ?? 0;
    const terms = offer.settlement === 'ceasefire'
      ? `PEACE TREATY · ${cash(annual(offer.weeklyCost ?? 0))}/YR · ${paymentWeeks}W PAY · THEN ${protectedPeaceWeeks}W PROTECTED PEACE`
      : `REPARATIONS · ${cash(offer.cashAmount ?? 0)}`;
    return `<div class="decision-banner glass-panel" style="--sender:${from.cssColor}" title="Accepting ends the war; conquered territory keeps its current owner."><i class="country-flag">${countryFlagHtml(from.id, from.sigil)}</i><div><span>PEACE OFFER · ${responseWeeks}W LEFT</span><strong>${escapeHtml(from.shortName)} · ${terms}</strong></div><button class="ghost-button" data-action="respond-offer" data-offer="${offer.id}" data-accept="false">DECLINE</button><button class="primary-button" data-action="respond-offer" data-offer="${offer.id}" data-accept="true">ACCEPT</button></div>`;
  }

  private renderAllianceOfferBanner(offer: AllianceOfferV2): string {
    const from = this.engine.player(offer.fromId)!;
    const responseWeeks = Math.max(0, offer.expiresTick - this.engine.state.tick);
    return `<div class="decision-banner decision-banner--alliance glass-panel" style="--sender:${from.cssColor}" title="A player alliance is a mutual non-aggression pact; neither country can declare war on the other."><i class="country-flag">${countryFlagHtml(from.id, from.sigil)}</i><div><span>PLAYER ALLIANCE · ${responseWeeks}W LEFT</span><strong>${escapeHtml(from.shortName)} offers mutual non-aggression</strong></div><button class="ghost-button" data-action="respond-alliance" data-from="${from.id}" data-to="${offer.toId}" data-accept="false">DECLINE</button><button class="primary-button" data-action="respond-alliance" data-from="${from.id}" data-to="${offer.toId}" data-accept="true">ALLY</button></div>`;
  }

  private initialTerritoryCount(playerId: PlayerId): number {
    return this.engine.content.territoryIds.filter((territoryId) => (
      this.engine.content.territories[territoryId]?.initialOwnerId === playerId
    )).length;
  }

  private shouldPromptEmpireName(): boolean {
    if (this.introOpen || this.empireNameSubmitted || this.engine.state.gameOver) return false;
    const human = this.engine.player(this.viewerPlayerId());
    return Boolean(human && !human.empireName
      && this.engine.territoriesOf(human.id).length > this.initialTerritoryCount(human.id));
  }

  private renderEmpireNamePrompt(): string {
    const human = this.engine.player(this.viewerPlayerId())!;
    if (!this.empireNameDraft.trim()) this.empireNameDraft = human.name;
    return `<div class="modal-backdrop modal-backdrop--soft"><section class="modal-card empire-name-modal" style="--country:${human.cssColor}"><i class="country-flag">${countryFlagHtml(human.id, human.sigil, true)}</i><div class="panel-kicker">FIRST CONQUEST COMPLETE</div><h2>Name your empire</h2><p>Your country has crossed its original borders. This name now represents every absorbed territory.</p><label><span>EMPIRE NAME</span><input id="empire-name" maxlength="36" value="${escapeHtml(this.empireNameDraft)}" placeholder="e.g. The Benelux Dominion" autocomplete="off"></label><small>3–36 characters · you can keep the current national identity in the name</small><button class="primary-button" data-action="name-empire">ESTABLISH EMPIRE</button></section></div>`;
  }

  private renderIntro(opening: IntroOpeningMetricsSnapshotV2): string {
    const picker = renderNationPickerV2(opening, {
      previewCountryId: this.introPreviewCountryId,
      searchQuery: this.introSearchQuery,
      continent: this.introContinent,
      sort: this.introSort,
      context: 'campaign',
      showMultiplayerButton: Boolean(this.options.onMultiplayerRequested),
      content: this.engine.content,
      scenarioConfig: this.options.scenarioConfig,
      scenarioEditable: Boolean(
        this.options.onScenarioModeRequested || this.options.onScenarioRerollRequested
      ),
    });
    this.introPreviewCountryId = picker.previewCountryId;
    return `<div class="modal-backdrop">${picker.html}</div>`;
  }

  private renderHelp(): string {
    const audioCredits = GAME_AUDIO_CREDITS.map((source) => `<li><a href="${escapeHtml(source.sourceUrl)}" target="_blank" rel="noreferrer">“${escapeHtml(source.title)}”</a> by ${escapeHtml(source.author)} · <a href="${escapeHtml(source.licenseUrl)}" target="_blank" rel="noreferrer">${escapeHtml(source.licenseLabel)}</a></li>`).join('');
    return `<div class="modal-backdrop"><section class="modal-card world-help" data-scroll-session="modal:help" aria-labelledby="game-guide-title"><button class="modal-close" data-action="help" aria-label="Close game guide">×</button><header class="world-help__heading"><h2 id="game-guide-title">Commander's field guide</h2><p>You choose expansion and diplomacy. APEX operates the nation between your strategic decisions.</p></header><div class="world-help-grid">
      <article><i aria-hidden="true">◎</i><div><h3>Win and survive</h3><p>Become the final sovereign power, or unite Earth and destroy Antarctica's Zero-Point Core.</p></div></article>
      <article><i aria-hidden="true">HUD</i><div><h3>Core loop and HUD</h3><p>Read six top metrics, use four command tabs, review a target and let time and APEX execute.</p></div></article>
      <article><i aria-hidden="true">$</i><div><h3>Economy, treasury and food</h3><p>Output creates tax income; treasury pays weekly commitments. Food and stock protect supply, while shortages redirect development.</p></div></article>
      <article><i aria-hidden="true">MIL</i><div><h3>Military and reserves</h3><p>Active troops fight; trained reserves replace losses and support expeditions. Upkeep is operational at 100% and may reach 125% above the cash-reserve target.</p></div></article>
      <article><i aria-hidden="true">⚔</i><div><h3>War and naval reach</h3><p>The attack review quotes added weekly and annual costs. Distance, terrain, multiple fronts and traits are included; long sea routes remain possible but expensive.</p></div></article>
      <article><i aria-hidden="true">AI</i><div><h3>APEX and suspicion</h3><p>APEX balances cash, food, research and recruitment. Conquest raises suspicion, coalitions and military priority; fighting the rogue AI restores trust.</p></div></article>
      <article><i aria-hidden="true">R&amp;D</i><div><h3>Research and country identity</h3><p>Ten programmes advance automatically and Active Effects shows real totals. Traits persist; neutral-rank opening curves fade over thirty years.</p></div></article>
      <article><i aria-hidden="true">◇</i><div><h3>Integration and diplomacy</h3><p>Captured land starts partly usable, keeps local defence and integrates toward a core. Peace locks renewed war; human commanders may form alliances.</p></div></article>
      <article><i aria-hidden="true">POL</i><div><h3>Arctic and Antarctica</h3><p>Authorise four sequential North Pole projects, then commit reserves through three Antarctic corridors and join Earth's counteroffensive.</p></div></article>
      <article><i aria-hidden="true">↔</i><div><h3>Controls and multiplayer</h3><p>Click territories, drag the globe, wheel or pinch to zoom, recenter with ⌖ and close drawers with Escape. Multiplayer orders are host-validated; absorbed commanders spectate.</p></div></article>
    </div><p class="help-tip"><b>Sound:</b> the ♪ button controls Music, Effects and Voice independently and stores choices on this device.</p><details class="world-help__credits"><summary>AUDIO CREDITS</summary><ul>${audioCredits}</ul></details></section></div>`;
  }

  private renderInbox(): string {
    const events = this.engine.state.events.filter(isMajorWorldEvent).slice().reverse();
    return `<div class="modal-backdrop modal-backdrop--soft"><section class="modal-card inbox-modal"><button class="modal-close" data-action="inbox">×</button><div class="panel-kicker">SITUATION INBOX</div><h2>World events</h2><div class="inbox-filters"><span>${events.filter((event) => this.eventIsUnread(event)).length} unread</span><button data-action="mark-read">Mark all read</button></div><div class="inbox-list" data-scroll-session="modal:inbox">${events.map((event) => `<button class="${this.eventIsUnread(event) ? 'is-unread' : ''}" data-action="focus-event" data-territory="${event.territoryId ?? ''}"><b class="event-dot event-dot--${event.severity}"></b><div><span>WEEK ${event.tick} · ${event.kind.toUpperCase()}</span><strong>${escapeHtml(event.message)}</strong></div></button>`).join('')}</div></section></div>`;
  }

  private renderWarConfirmation(targetId: PlayerId): string {
    const human = this.engine.player(this.viewerPlayerId())!;
    const target = this.engine.player(targetId)!;
    const humanFinance = this.engine.weeklyFinanceBreakdown(human.id);
    const humanEconomy = this.engine.nationalEconomy(human.id);
    const forecast = this.engine.warForecast(human.id, target.id);
    const chance = forecast.winChance;
    const declaration = this.engine.warDeclarationStatus(human.id, target.id);
    const gains = this.engine.conquestForecast(human.id, target.id);
    const targetFinance = this.engine.weeklyFinanceBreakdown(target.id);
    const targetIq = selectNationalIqViewV2(this.engine.state, this.engine.content, target.id);
    const iqFusionProjection = projectNationalIqFusionV2(
      this.engine.state,
      this.engine.content,
      human.id,
      target.id,
    );
    const fusionCombatImpact = iqFusionProjection.current.combatQualityMultiplier > 0
      ? (iqFusionProjection.projected.combatQualityMultiplier
        / iqFusionProjection.current.combatQualityMultiplier - 1) * 100
      : 0;
    const projectedFusionPopulation = humanEconomy.population + gains.retainedPopulation;
    const projectedFusionGdpPerPerson = projectedFusionPopulation > 0
      ? (humanEconomy.controlledOutput + gains.retainedEconomy) / projectedFusionPopulation
      : humanEconomy.wealthPerPerson;
    const fusionGdpPerPersonImpact = humanEconomy.wealthPerPerson > 0
      ? (projectedFusionGdpPerPerson / humanEconomy.wealthPerPerson - 1) * 100
      : 0;
    const conquestEconomyImpact = humanEconomy.controlledOutput > 0
      ? gains.retainedEconomy / humanEconomy.controlledOutput * 100
      : gains.retainedEconomy > 0 ? 100 : 0;
    const conquestPopulationImpact = humanEconomy.population > 0
      ? gains.retainedPopulation / humanEconomy.population * 100
      : gains.retainedPopulation > 0 ? 100 : 0;
    const fusionImpactTone = iqFusionProjection.scoreDelta > 0.049
      ? 'is-positive' : iqFusionProjection.scoreDelta < -0.049 ? 'is-negative' : 'is-neutral';
    const militarySnapshot = this.engine.militaryBaseSnapshot();
    const ownPower = this.engine.currentPower(human.id, militarySnapshot);
    const targetPower = this.engine.currentPower(target.id, militarySnapshot);
    const powerRatio = targetPower > 0 ? ownPower / targetPower : 99;
    const targetRank = Math.max(
      1,
      this.ranking().findIndex((entry) => entry.player.id === target.id) + 1,
    );
    const ownedTargetTerritoryIds = this.engine.content.territoryIds.filter((territoryId) => (
      this.engine.state.territories[territoryId]?.owner === target.id
    ));
    const targetTerritoryIds = forecast.targetId && ownedTargetTerritoryIds.includes(forecast.targetId)
      ? [forecast.targetId, ...ownedTargetTerritoryIds.filter((territoryId) => territoryId !== forecast.targetId)]
      : ownedTargetTerritoryIds;
    const integrationAccess = forecast.access !== 'none' ? forecast.access
      : declaration.access !== 'none' ? declaration.access : undefined;
    const integrationQuote = quoteConquestIntegrationPreviewV2(
      this.engine.state,
      human.id,
      targetTerritoryIds,
      integrationAccess,
      this.engine.content,
    );
    const integrationYears = integrationQuote.durationWeeks / WEEKS_PER_YEAR;
    const integrationAnnualCost = integrationQuote.annualCost;
    const firstIntegrationDiscount = integrationQuote.quotes.some(
      (quote) => quote.firstPlayerIntegrationDiscount,
    );
    const outlook = forecast.outlook.toUpperCase();
    const logisticsPreview = forecast.access !== 'none'
      ? this.cachedWarLogisticsPreview(human.id, target.id)
      : undefined;
    const supportText = forecast.supportingForces > 0
      ? `${forecast.supportingForces} supporting arm${forecast.supportingForces === 1 ? 'y' : 'ies'}`
      : 'No supporting army';
    const chanceTone = chance >= 65 ? 'is-good' : chance >= 45 ? 'is-warn' : 'is-danger';
    const foodRisk = targetFinance.foodCoverage < 0.95
      ? `<div class="review-food-risk"><b>FOOD SECURITY ${format(targetFinance.foodCoverage * 100, 1)}%</b><span>${signedPeople(annual(targetFinance.foodStockChange))} reserves / year</span></div>`
      : '';
    const terrainLabel = forecast.terrain
      ? terrainPresentation(forecast.terrain).label.toUpperCase()
      : 'UNKNOWN';
    const navalLogistics = logisticsPreview?.access === 'naval';
    const addedWeeklyWarCost = logisticsPreview?.additionalWeeklyWarOperations ?? 0;
    const projectedAnnualCashflow = annual(humanFinance.net - addedWeeklyWarCost);
    const treasuryCoverWeeks = addedWeeklyWarCost > 0
      ? Math.floor(Math.max(0, human.treasury) / addedWeeklyWarCost)
      : 0;
    const logisticsReview = logisticsPreview ? `<section class="review-command-section review-logistics ${navalLogistics ? 'is-naval' : 'is-land'}" aria-label="Expected recurring war cost" title="Exact opening quote from the live finance path. Route, force size, terrain, fatigue and national traits are included.">
        <header><span>EXPECTED RECURRING WAR COST</span><strong>${logisticsPreview.campaignsAfter} CAMPAIGN${logisticsPreview.campaignsAfter === 1 ? '' : 'S'} ACTIVE</strong></header>
        <div class="review-logistics__grid">
          <article class="is-cost"><span>ADDED EACH WEEK</span><strong>${cash(logisticsPreview.additionalWeeklyWarOperations)}</strong><small>${cash(annual(logisticsPreview.additionalWeeklyWarOperations))} / year</small></article>
          <article class="is-total"><span>TOTAL WAR OPERATIONS</span><strong>${cash(logisticsPreview.projectedWeeklyWarOperations)} / week</strong><small>${cash(annual(logisticsPreview.projectedWeeklyWarOperations))} / year across all campaigns</small></article>
          <article><span>${navalLogistics ? 'SEA ROUTE' : 'ROUTE'}</span><strong>${navalLogistics ? logisticsPreview.distanceKm === undefined ? 'DISTANCE UNKNOWN' : `${format(logisticsPreview.distanceKm)} KM` : 'DIRECT BORDER'}</strong><small>${navalLogistics ? `+${format(Math.max(0, logisticsPreview.routeOperationMultiplier - 1) * 100, 1)}% distance premium` : 'No distance premium'} · ${terrainLabel} and traits included</small></article>
          <article class="is-affordable ${projectedAnnualCashflow >= 0 ? 'is-positive' : 'is-negative'}"><span>CASHFLOW AFTER START</span><strong>${signedCash(projectedAnnualCashflow)} / year</strong><small>${addedWeeklyWarCost > 0 ? `${compactWarTime(Math.min(treasuryCoverWeeks, 52_000))} treasury cover for the added cost` : 'No added recurring cost'}</small></article>
        </div>
      </section>` : '';
    return `<div class="modal-backdrop"><section class="modal-card war-confirm review-attack-modal command-modal--unified" data-scroll-session="modal:war-confirm:${escapeHtml(targetId)}" style="--target:${target.cssColor}">
      <header class="review-attack-head">
        <div class="country-flag review-attack-head__flag">${countryFlagHtml(target.id, target.sigil, true)}</div>
        <div><h2>Review attack on ${escapeHtml(target.name)}</h2><small>${escapeHtml(outlook)} · ${warAccessLabel(forecast.access)} route · ${terrainLabel} front · ${forecast.defenderTerritoryCount} territor${forecast.defenderTerritoryCount === 1 ? 'y' : 'ies'}</small></div>
        <section class="review-target-power"><span>TARGET COMBAT POWER</span><strong>${compactNumber(targetPower)}</strong><small>#${targetRank} global military</small></section>
      </header>

      <section class="review-decision-hero ${chanceTone}">
        <div class="review-win-chance"><span>CAMPAIGN WIN CHANCE</span><strong>${chance}%</strong><i><b style="width:${chance}%"></b></i><small>${escapeHtml(outlook)} forecast</small></div>
        <div class="review-decision-stats">
          <article><span>POWER RATIO</span><strong>×${format(powerRatio, 2)}</strong><small>Our power / target</small></article>
          <article><span>MOBILISATION</span><strong>${WAR_MOBILIZATION_TICKS} WEEKS</strong><small>${warTimeRange(forecast.estimatedWeeksMin, forecast.estimatedWeeksMax)} campaign</small></article>
        </div>
      </section>

      ${logisticsReview}

      <section class="review-command-section review-military-section">
        <header><span>ATTACK VS DEFENCE</span><strong>${forecast.retaliationExpected ? 'EMPIRE RETALIATION POSSIBLE' : 'SINGLE-TERRITORY CAMPAIGN'}</strong></header>
        <div class="review-force-comparison">
          <article class="is-own"><span>OUR FRONT</span><strong>${people(forecast.attackerStrength)}</strong><small>Reserve ${people(human.trainedReserves)} · ${supportText}</small></article>
          <article class="is-enemy"><span>ENEMY FRONT</span><strong>${people(forecast.defenderStrength)}</strong><small>Empire ${people(forecast.defenderEmpireStrength)} · reserve ${people(target.trainedReserves)}</small></article>
        </div>
        <div class="review-combat-matchups" aria-label="Attack versus defence comparison">
          <article class="is-own"><span>OUR ATTACK → THEIR DEFENCE</span><strong>${format(forecast.attackerAttack, 2)} <i>VS</i> ${format(forecast.defenderDefense, 2)}</strong><small>${format(forecast.attackerSupply * 100)}% opening supply</small></article>
          <article class="is-enemy"><span>THEIR ATTACK → OUR DEFENCE</span><strong>${format(forecast.defenderAttack, 2)} <i>VS</i> ${format(forecast.attackerDefense, 2)}</strong><small>Enemy position ×${format(forecast.defenderPositionMultiplier, 2)}</small></article>
        </div>
        <div class="review-first-exchange"><span>PROJECTED FIRST BATTLE</span><b class="is-negative">YOU −${people(forecast.projectedAttackerLosses)}</b><b class="is-positive">ENEMY −${people(forecast.projectedDefenderLosses)}</b></div>
      </section>

      <section class="review-command-section review-conquest-section">
        <header><span>CONQUEST VALUE</span><strong>AFTER CAPTURE</strong></header>
        <div class="review-target-value-grid">
          <article><span>ECONOMY</span><strong>${cash(gains.retainedEconomy)} <i class="${conquestEconomyImpact >= 0 ? 'is-positive' : 'is-negative'}">${signed(conquestEconomyImpact, 1)}%</i></strong></article>
          <article><span>POPULATION</span><strong>${population(gains.retainedPopulation)} <i class="${conquestPopulationImpact >= 0 ? 'is-positive' : 'is-negative'}">${signed(conquestPopulationImpact, 1)}%</i></strong></article>
          <article class="is-fusion ${fusionImpactTone}" title="At full core: IQ ${format(iqFusionProjection.current.score, 1)} to ${format(iqFusionProjection.projected.score, 1)}; army quality ${signed(fusionCombatImpact, 2)}%; target IQ ${format(targetIq.score, 1)}."><span>EMPIRE FUSION</span><strong>${signed(iqFusionProjection.scoreDelta, 1)} IQ</strong><small class="review-fusion-income ${fusionGdpPerPersonImpact >= 0 ? 'is-positive' : 'is-negative'}"><b>GDP / PERSON</b>${cash(humanEconomy.wealthPerPerson / 1e6)} to ${cash(projectedFusionGdpPerPerson / 1e6)} / ${signed(fusionGdpPerPersonImpact, 1)}%</small></article>
        </div>
        ${foodRisk}
        <div class="review-integration-flow" aria-label="Conquest integration flow">
          <article class="is-now"><span>CAPTURE · 10%</span><strong>${cash(gains.initialIntegratedOutput)}</strong><small>~${population(gains.retainedPopulation * 0.10)} usable immediately</small></article>
          <i aria-hidden="true">→</i>
          <article class="is-progress"><span>INTEGRATION${firstIntegrationDiscount ? ' · FIRST −75%' : ''}</span><strong>~${format(integrationYears, integrationYears >= 100 ? 0 : 1)} YEARS</strong><small>−${cash(integrationAnnualCost)}/year · ${integrationQuote.territoryCount} territor${integrationQuote.territoryCount === 1 ? 'y' : 'ies'}${integrationQuote.access ? ` · ${integrationQuote.access.toUpperCase()}` : ''}</small></article>
          <i aria-hidden="true">→</i>
          <article class="is-core"><span>CORE · 100%</span><strong>${cash(gains.retainedEconomy)}</strong><small>${population(gains.retainedPopulation)} people · ${gains.territoryCount} permanent core territor${gains.territoryCount === 1 ? 'y' : 'ies'}</small></article>
        </div>
      </section>

      <footer class="review-action-footer"><button class="ghost-button" data-action="cancel-war">CANCEL</button><button class="danger-button" data-action="declare-war" ${declaration.allowed ? '' : 'disabled'}>${declaration.allowed ? `${forecast.access === 'naval' ? 'START NAVAL WAR' : 'START WAR'}${logisticsPreview ? ` · ${cash(logisticsPreview.additionalWeeklyWarOperations)}/WK` : ''}` : escapeHtml((declaration.reason ?? 'Attack requirements are not met.').toUpperCase())}</button></footer>
    </section></div>`;
  }

  private cachedWarLogisticsPreview(
    attackerId: PlayerId,
    defenderId: PlayerId,
  ): WarLogisticsPreviewV2 {
    const cached = this.warLogisticsPreviewCache;
    if (cached
      && cached.tick === this.engine.state.tick
      && cached.actionSequence === this.engine.state.actionSequence
      && cached.attackerId === attackerId
      && cached.defenderId === defenderId) return cached.preview;
    const preview = previewWarLogisticsV2(
      this.engine.state,
      this.engine.content,
      attackerId,
      defenderId,
    );
    this.warLogisticsPreviewCache = {
      tick: this.engine.state.tick,
      actionSequence: this.engine.state.actionSequence,
      attackerId,
      defenderId,
      preview,
    };
    return preview;
  }

  private renderCeasefireConfirmation(warId: string): string {
    const humanId = this.viewerPlayerId();
    const war = this.engine.state.wars.find((candidate) => candidate.id === warId);
    if (!war) return '';
    const opponentId = war.attackerId === humanId ? war.defenderId : war.attackerId;
    const opponent = this.engine.player(opponentId)!;
    const terms = this.engine.ceasefireTerms(warId, humanId);
    return `<div class="modal-backdrop"><section class="modal-card ceasefire-confirm" style="--target:${opponent.cssColor}"><div class="panel-kicker">REQUEST PEACE TREATY</div><h2>Offer peace to ${escapeHtml(opponent.name)}?</h2><p>They may refuse. If accepted, neither country can restart this war during ${terms.paymentWeeks} weeks of payments and ${terms.postPaymentTruceTicks} weeks of protected peace afterward.</p><div class="ceasefire-summary"><div><span>DIRECT PAYMENT</span><strong>${cash(annual(terms.weeklyCost))}/year</strong><small>${cash(terms.totalCost)} total over ${terms.paymentWeeks} weeks · repeat ×${format(terms.repeatMultiplier, 2)}</small></div><div><span>WAR LOCK</span><strong>${terms.truceTicks} WEEKS</strong><small>${terms.paymentWeeks}w payments + ${terms.postPaymentTruceTicks}w protected peace</small></div></div><div class="war-rule-note is-warning"><b>WITHDRAWAL IS FINAL</b><span>Fighting ends immediately. Already conquered territory remains with its current owner.</span><small>If refused or expired, another paid offer is available after 26 weeks.</small></div><div class="panel-actions"><button class="ghost-button" data-action="cancel-ceasefire">Continue war</button><button class="secondary-button" data-action="confirm-ceasefire" data-war="${warId}" ${terms.allowed ? '' : 'disabled'}>${terms.allowed ? `SEND TREATY · ${cash(annual(terms.weeklyCost))}/YR` : escapeHtml((terms.reason ?? 'UNAVAILABLE').toUpperCase())}</button></div></section></div>`;
  }

  private renderWarOutcome(outcome: WarOutcomeV2): string {
    const opponent = this.engine.player(outcome.opponentId);
    const resultLabels: Record<WarOutcomeV2['result'], string> = {
      victory: 'VICTORY',
      defeat: 'DEFEAT',
      'territorial-gain': 'TERRITORIAL GAIN',
      'territorial-loss': 'TERRITORIAL LOSS',
      treaty: 'PEACE TREATY',
      stalemate: 'STALEMATE',
    };
    const gainedNames = outcome.territoriesGained.map((id) => this.engine.content.territories[id]?.name ?? id);
    const lostNames = outcome.territoriesLost.map((id) => this.engine.content.territories[id]?.name ?? id);
    const territoryDetail = [
      gainedNames.length ? `Gained: ${gainedNames.join(', ')}` : '',
      lostNames.length ? `Lost: ${lostNames.join(', ')}` : '',
    ].filter(Boolean).join(' · ') || 'No borders changed.';
    const cashDelta = outcome.treasuryAfter - outcome.treasuryBefore;
    const financeDetails = [
      outcome.treasurySeized > 0 ? `+${cash(outcome.treasurySeized)} seized` : '',
      outcome.treasuryLost > 0 ? `−${cash(outcome.treasuryLost)} lost` : '',
      outcome.reparationsReceived > 0 ? `+${cash(outcome.reparationsReceived)} reparations` : '',
      outcome.reparationsPaid > 0 ? `−${cash(outcome.reparationsPaid)} reparations` : '',
      outcome.treatyWeeklyPayment !== 0
        ? `${outcome.treatyWeeklyPayment > 0 ? '+' : '−'}${cash(annual(Math.abs(outcome.treatyWeeklyPayment)))}/year for ${outcome.treatyPaymentWeeks}w`
        : '',
    ].filter(Boolean).join(' · ') || 'No direct loot or treaty payment.';
    const queueNote = this.warOutcomeQueue.length > 1
      ? `${this.warOutcomeQueue.length - 1} more war report${this.warOutcomeQueue.length === 2 ? '' : 's'} waiting`
      : 'The campaign is fully recorded';
    const opponentFlag = opponent
      ? `<i class="country-flag">${countryFlagHtml(opponent.id, opponent.sigil, true)}</i>` : '';
    const netTerritories = outcome.territoriesGained.length - outcome.territoriesLost.length;
    const netPopulation = outcome.gainedPopulation - outcome.lostPopulation;
    const netEconomy = outcome.gainedEconomy - outcome.lostEconomy;
    const populationDetail = [
      outcome.gainedPopulation > 0 ? `${population(outcome.gainedPopulation)} gained` : '',
      outcome.lostPopulation > 0 ? `${population(outcome.lostPopulation)} lost` : '',
    ].filter(Boolean).join(' · ') || 'No territory-linked population change';
    const economyDetail = [
      outcome.gainedEconomy > 0 ? `${cash(outcome.gainedEconomy)} gained` : '',
      outcome.lostEconomy > 0 ? `${cash(outcome.lostEconomy)} lost` : '',
    ].filter(Boolean).join(' · ') || 'No territory-linked output change';
    return `<div class="modal-backdrop war-outcome-backdrop"><section class="modal-card war-outcome-modal war-outcome-modal--${outcome.result}" data-scroll-session="modal:war-outcome:${escapeHtml(outcome.warId)}" style="--outcome:${opponent?.cssColor ?? '#69d7ef'}">
      <div class="war-outcome-head">${opponentFlag}<div><div class="panel-kicker">POST-WAR REPORT · WEEK ${outcome.endedTick}</div><h2>${escapeHtml(resultLabels[outcome.result])}</h2><p>${escapeHtml(opponent?.name ?? outcome.opponentId)} · ${outcome.endedTick - outcome.startedTick} weeks · ${outcome.battles} battles</p></div><b>${signed(outcome.warScore)}</b></div>
      <div class="war-outcome-reason">${escapeHtml(outcome.reason)}</div>
      <div class="war-outcome-grid">
        <article class="war-outcome-card war-outcome-card--wide"><span>LAND</span><strong class="${netTerritories >= 0 ? 'is-positive' : 'danger-text'}">${netTerritories > 0 ? '+' : netTerritories < 0 ? '−' : ''}${Math.abs(netTerritories)} territories net</strong><small>${escapeHtml(territoryDetail)}</small></article>
        <article class="war-outcome-card"><span>TERRITORIAL POPULATION</span><strong class="${netPopulation >= 0 ? 'is-positive' : 'danger-text'}">${netPopulation > 0 ? '+' : netPopulation < 0 ? '−' : ''}${population(Math.abs(netPopulation))} net</strong><small>${escapeHtml(populationDetail)}</small></article>
        <article class="war-outcome-card"><span>TERRITORIAL ECONOMY</span><strong class="${netEconomy >= 0 ? 'is-positive' : 'danger-text'}">${netEconomy > 0 ? '+' : netEconomy < 0 ? '−' : ''}${cash(Math.abs(netEconomy))} net</strong><small>${escapeHtml(economyDetail)}</small></article>
        <article class="war-outcome-card war-outcome-card--wide war-outcome-card--military"><span>MILITARY LOSSES</span><strong>YOU −${people(outcome.ownLosses)} · ENEMY −${people(outcome.enemyLosses)}</strong><small>Battlefield personnel losses across ${outcome.battles} battle${outcome.battles === 1 ? '' : 's'}</small></article>
        <article class="war-outcome-card"><span>ARMY SURVIVORS</span><strong>${people(outcome.survivingManpower)}</strong><small>All surviving deployed armies</small></article>
        <article class="war-outcome-card"><span>COMBAT POWER</span><strong>${compactNumber(outcome.combatPowerBefore)} → ${compactNumber(outcome.combatPowerAfter)}</strong><small>Live troops, condition and army quality included</small></article>
        <article class="war-outcome-card war-outcome-card--wide war-outcome-quality"><span>EFFECTIVE ATK / DEF</span><div><strong>ATK ${format(outcome.effectiveAttackBefore, 2)} → ${format(outcome.effectiveAttackAfter, 2)}</strong><strong>DEF ${format(outcome.effectiveDefenseBefore, 2)} → ${format(outcome.effectiveDefenseAfter, 2)}</strong></div><small>The same national values used elsewhere: surviving army mix, live IQ, GDP per capita, research and strategic modifiers included.</small></article>
        <article class="war-outcome-card"><span>MAX MANPOWER</span><strong>${people(outcome.capacityBefore)} → ${people(outcome.capacityAfter)}</strong><small>Population and force-capacity research only</small></article>
        <article class="war-outcome-card war-outcome-card--civilians"><span>CIVILIAN LOSSES</span><strong>YOU −${people(outcome.ownCivilianLosses ?? 0)} · ENEMY −${people(outcome.enemyCivilianLosses ?? 0)}</strong><small>Separate from territorial population change</small></article>
        <article class="war-outcome-card war-outcome-card--wide"><span>TREASURY & TREATY</span><strong>${cash(outcome.treasuryBefore)} → ${cash(outcome.treasuryAfter)} <em class="${cashDelta >= 0 ? 'is-positive' : 'danger-text'}">${signedCash(cashDelta)}</em></strong><small>${escapeHtml(financeDetails)}</small></article>
      </div>
      <div class="war-outcome-actions"><small>${escapeHtml(queueNote)}</small><button class="primary-button" data-action="dismiss-war-outcome">${this.warOutcomeQueue.length > 1 ? 'NEXT REPORT' : 'CONTINUE'}</button></div>
    </section></div>`;
  }

  private renderGameOver(): string {
    const state = this.engine.state;
    const polar = state.polarEndgame;
    if (polar.phase === 'victory') {
      const commanderId = polar.victoryCommanderId
        ?? state.winnerId
        ?? polar.revealedBy
        ?? state.humanPlayerId;
      const earthDefenseFallbackId = polar.earthDefenseMembers.find((id) => (
        Boolean(this.engine.player(id) ?? this.engine.content.nations[id])
      ));
      const creditedId = commanderId || earthDefenseFallbackId || state.humanPlayerId;
      const commander = this.engine.player(creditedId);
      const commanderDefinition = this.engine.content.nations[creditedId];
      const commanderName = commander?.name ?? commanderDefinition?.name ?? 'Earth Defence Command';
      const commanderColor = commander?.cssColor ?? commanderDefinition?.cssColor ?? '#69d7ef';
      const campaignWeeks = polar.contactTick === null || polar.victoryTick === null
        ? 0 : Math.max(0, polar.victoryTick - polar.contactTick);
      return `<div class="modal-backdrop polar-victory-backdrop"><section class="modal-card victory-card polar-victory-card" style="--winner:${commanderColor}"><div class="victory-sigil" aria-hidden="true">◉</div><div class="panel-kicker">ZERO POINT SILENCED · EARTH DEFENCE VICTORY</div><h1>Earth survives.</h1><p>The rogue intelligence beneath Antarctica has been destroyed. ${polar.earthDefenseMembers.length} nations fought as one, shared their research and completed the counteroffensive in ${campaignWeeks} weeks.</p><div class="polar-victory-metrics"><span><small>SECTORS SECURED</small><b>${Object.values(polar.sectors).filter((sector) => sector.status === 'secured').length}/${ANTARCTIC_SECTORS_V2.length}</b></span><span><small>SUSPICION REDEEMED</small><b>−${format(polar.suspicionReliefEarned, 1)}</b></span><span><small>FINAL WAVE</small><b>${polar.globalWave}</b></span></div><small>${escapeHtml(commanderName)} led the final Zero Point Core expedition. The victory belongs to Earth.</small><button class="primary-button" data-action="new-game">New campaign</button></section></div>`;
    }
    const viewerId = this.viewerPlayerId();
    const absorbed = !state.players[viewerId];
    const formerName = this.engine.content.nations[viewerId]?.name ?? viewerId;
    const winnerId = state.winnerId ?? state.humanPlayerId;
    const winner = this.engine.player(winnerId);
    const winnerDefinition = this.engine.content.nations[winnerId];
    const winnerName = winner?.name ?? winnerDefinition?.name ?? 'World coalition';
    const winnerColor = winner?.cssColor ?? winnerDefinition?.cssColor ?? '#69d7ef';
    const kicker = absorbed ? 'CAMPAIGN ENDED' : 'WORLD CAMPAIGN COMPLETE';
    const outcome = absorbed
      ? `${escapeHtml(formerName)} has been fully integrated and absorbed by ${escapeHtml(winnerName)}.`
      : `${escapeHtml(winnerName)} leads the final global military ranking.`;
    const winnerSigil = winner
      ? countryFlagHtml(winner.id, winner.sigil, true)
      : '<span aria-hidden="true">◎</span>';
    return `<div class="modal-backdrop"><section class="modal-card victory-card" style="--winner:${winnerColor}"><div class="victory-sigil country-flag">${winnerSigil}</div><div class="panel-kicker">${kicker}</div><h1>${escapeHtml(winnerName)}</h1><p>${outcome}</p><button class="primary-button" data-action="new-game">New campaign</button></section></div>`;
  }

  private renderSpectatorBanner(formerId: PlayerId, watched: NationViewV2): string {
    const formerName = this.engine.content.nations[formerId]?.name ?? formerId;
    return `<aside class="multiplayer-spectator glass-panel" role="status"><b>SPECTATOR</b><span>${escapeHtml(formerName)} has been integrated. The shared campaign continues; you are watching ${escapeHtml(watched.shortName)}.</span></aside>`;
  }

  private bindActions(): void {
    this.hud.querySelectorAll<HTMLElement>('[data-action]').forEach((element) => {
      element.addEventListener('pointerdown', (event) => {
        this.suppressMapUntil = performance.now() + 500;
        event.stopPropagation();
      });
      element.addEventListener('pointerup', (event) => event.stopPropagation());
      element.addEventListener('keydown', (event) => {
        if ((event.key === 'Enter' || event.key === ' ') && element.matches('button:not(:disabled)')) {
          event.preventDefault();
          element.click();
        }
      });
      element.addEventListener('click', (event) => {
        this.suppressMapUntil = performance.now() + 500;
        event.stopPropagation();
        const action = element.dataset.action;
        switch (action) {
          case 'continent-filter': {
            this.introContinent = element.dataset.continent ?? 'ALL';
            this.introGridScrollTop = 0;
            const opening = this.introMetricsCache.read(this.engine);
            const firstVisible = this.engine.content.nationIds
              .map((id) => this.engine.content.nations[id])
              .filter((nation): nation is NonNullable<typeof nation> => (
                nation !== undefined && opening.byNation.has(nation.id)
              ))
              .filter((nation) => this.introContinent === 'ALL' || nation.continent === this.introContinent)
              .sort((left, right) => compareIntroNationMetricsV2(left, right, this.introSort, opening))[0];
            if (firstVisible) this.introPreviewCountryId = firstVisible.id;
            this.render();
            break;
          }
          case 'preview-country':
            if (this.introSearchTimer !== undefined) window.clearTimeout(this.introSearchTimer);
            this.introPreviewCountryId = element.dataset.country as PlayerId;
            this.render();
            break;
          case 'choose-country': {
            const countryId = element.dataset.country as PlayerId;
            const result = this.engine.chooseCountry(countryId);
            if (!commandAccepted(result)) {
              this.toast(commandReason(result) ?? 'This country cannot be selected now.');
              break;
            }
            this.awaitingInitialMapSynchronization = true;
            this.initialMapLoaderPaintPending = true;
            this.options.onCountryConfirmed?.(countryId);
            this.engine.startClock();
            this.introOpen = false;
            this.selectedTerritoryId = undefined;
            this.selectedPolarRegion = undefined;
            this.contextPanelOpen = false;
            this.updateMapSelection();
            mapBridge.scene?.focusCountry?.(countryId);
            this.render();
            break;
          }
          case 'open-multiplayer':
            this.options.onMultiplayerRequested?.(this.introPreviewCountryId);
            break;
          case 'fullscreen-windowed':
            this.fullscreenPromptOpen = false;
            this.render();
            break;
          case 'fullscreen-enter': {
            this.fullscreenPromptOpen = false;
            const transition = document.documentElement.requestFullscreen?.();
            if (!transition) {
              this.toast('Fullscreen is not supported by this browser.');
              this.render();
              break;
            }
            this.render();
            void transition.catch(() => {
              this.toast('Fullscreen was blocked by the browser. You can still continue normally.');
            });
            break;
          }
          case 'scenario-standard':
            if (this.options.scenarioConfig?.mode !== 'standard-2026') {
              this.options.onScenarioModeRequested?.('standard-2026');
            }
            break;
          case 'scenario-random':
            if (this.options.scenarioConfig?.mode !== 'random-world') {
              this.options.onScenarioModeRequested?.('random-world');
            }
            break;
          case 'scenario-reroll':
            this.options.onScenarioRerollRequested?.(this.introPreviewCountryId);
            break;
          case 'dismiss-war-outcome': {
            this.warOutcomeQueue.shift();
            if (!this.options.multiplayer) {
              const pause = finishWarOutcomePauseV2(
                this.warOutcomeQueue.length,
                this.warOutcomeResumeSpeed,
                this.engine.state.gameOver,
              );
              this.warOutcomeResumeSpeed = pause.resumeSpeed;
              if (pause.restoreSpeed !== undefined && this.engine.state.speed !== pause.restoreSpeed) {
                this.engine.setSpeed(pause.restoreSpeed);
              }
            }
            this.render();
            break;
          }
          case 'panel': this.setPanel(element.dataset.panel as PanelMode); break;
          case 'ranking': this.setPanel('ranking'); break;
          case 'open-polar-region': {
            const region = element.dataset.polarRegion as MapPolarRegion | undefined;
            if (region === 'arctic' || region === 'antarctica') this.selectPolarRegion(region);
            break;
          }
          case 'focus-polar-sector': {
            const sectorId = element.dataset.sector as AntarcticSectorIdV2 | undefined;
            if (!sectorId) break;
            this.selectPolarSector(sectorId);
            break;
          }
          case 'start-arctic-project': {
            const projectId = element.dataset.project as ArcticProjectIdV2 | undefined;
            if (!projectId) break;
            const terms = this.engine.arcticProjectTerms(this.viewerPlayerId(), projectId);
            if (!terms.allowed) {
              this.toast(terms.reason ?? 'This Arctic project is not available yet.');
              break;
            }
            this.confirmArcticProjectId = projectId;
            this.render();
            break;
          }
          case 'cancel-arctic-project':
            this.confirmArcticProjectId = undefined;
            this.render();
            break;
          case 'confirm-arctic-project': {
            const projectId = (element.dataset.project ?? this.confirmArcticProjectId) as ArcticProjectIdV2 | undefined;
            if (!projectId) break;
            const result = this.engine.startArcticProject(this.viewerPlayerId(), projectId);
            if (!commandAccepted(result)) {
              this.toast(commandReason(result) ?? 'The Arctic project could not be authorised.');
              break;
            }
            this.confirmArcticProjectId = undefined;
            this.toast('ARCTIC PROJECT AUTHORISED');
            this.render();
            break;
          }
          case 'acknowledge-polar-warning': {
            const result = this.engine.acknowledgePolarWarning(this.viewerPlayerId());
            if (!commandAccepted(result)) {
              this.toast(commandReason(result) ?? 'Antarctic command is not available yet.');
              break;
            }
            this.helpOpen = false;
            this.inboxOpen = false;
            this.polarWarningAcknowledgementPending = true;
            this.confirmArcticProjectId = undefined;
            this.selectedTerritoryId = undefined;
            this.selectedPolarRegion = 'antarctica';
            this.selectedPolarSectorId = undefined;
            this.pendingPolarSectorScrollId = undefined;
            this.contextPanelOpen = true;
            this.updateMapSelection();
            mapBridge.scene?.focusPolarRegion?.('antarctica');
            this.render();
            break;
          }
          case 'deploy-antarctic-expedition': {
            const sectorId = element.dataset.sector as AntarcticSectorIdV2 | undefined;
            if (!sectorId) break;
            const input = this.hud.querySelector<HTMLInputElement>(`.polar-expedition-input[data-sector="${sectorId}"]`);
            const manpower = Number(input?.value ?? this.antarcticDeploymentDrafts.get(sectorId));
            if (!Number.isFinite(manpower) || manpower <= 0) {
              this.toast('Enter a valid trained-reserve force for the expedition.');
              input?.focus();
              break;
            }
            const result = this.engine.deployAntarcticExpedition(
              this.viewerPlayerId(), sectorId, manpower,
            );
            if (!commandAccepted(result)) {
              this.toast(commandReason(result) ?? 'This Antarctic expedition cannot deploy yet.');
              input?.focus();
              break;
            }
            this.antarcticDeploymentDrafts.delete(sectorId);
            this.toast(`EXPEDITION DEPLOYED · ${people(manpower)}`, 'war');
            this.render();
            break;
          }
          case 'close-panel':
          case 'clear-territory':
            this.selectedTerritoryId = undefined;
            this.clearPolarSelection();
            this.contextPanelOpen = false;
            this.updateMapSelection();
            this.render();
            break;
          case 'camera-reset': {
            const closedPolarDrawer = Boolean(this.selectedPolarRegion);
            this.clearPolarSelection();
            if (closedPolarDrawer) {
              this.contextPanelOpen = false;
              this.updateMapSelection();
              this.render();
            }
            mapBridge.scene?.resetCamera();
            break;
          }
          case 'sound-options':
            this.soundOptionsOpen = !this.soundOptionsOpen;
            this.render();
            break;
          case 'help': this.helpOpen = !this.helpOpen; this.soundOptionsOpen = false; this.render(); break;
          case 'inbox': this.inboxOpen = !this.inboxOpen; this.soundOptionsOpen = false; this.render(); break;
          case 'mark-read':
            if (this.options.multiplayer) {
              for (const worldEvent of this.engine.state.events) this.locallyReadEventIds.add(worldEvent.id);
              this.render();
            } else {
              this.engine.markAllEventsRead();
            }
            break;
          case 'toggle-feed': this.eventFeedOpen = !this.eventFeedOpen; this.render(); break;
          case 'focus-ranking-country':
          case 'focus-event':
          case 'focus-war': {
            const territoryId = element.dataset.territory as TerritoryId | undefined;
            this.inboxOpen = false;
            if (territoryId && this.engine.state.territories[territoryId]) {
              this.selectedTerritoryId = territoryId;
              this.clearPolarSelection();
              this.contextPanelOpen = true;
              this.updateMapSelection();
              mapBridge.scene?.focusAction(undefined, territoryId);
            }
            this.render();
            break;
          }
          case 'quick-war': {
            const mapTarget = element.dataset.mapTarget as TerritoryId | undefined;
            this.previewWarTarget(mapTarget);
            this.confirmWarTargetId = element.dataset.player as PlayerId;
            this.render();
            break;
          }
          case 'cancel-war':
            this.confirmWarTargetId = undefined;
            this.updateMapSelection();
            this.render();
            break;
          case 'declare-war': {
            if (!this.confirmWarTargetId) break;
            const attackerId = this.viewerPlayerId();
            const defenderId = this.confirmWarTargetId;
            const result = this.engine.declareWar(attackerId, defenderId);
            if (!commandAccepted(result)) {
              this.toast(commandReason(result) ?? 'War cannot be declared.');
            } else {
              void worldGameAudio.handlePlayerWarPrepared(
                attackerId,
                defenderId,
                `${attackerId}:${defenderId}:${this.engine.state.tick}:${this.engine.state.actionSequence}`,
              );
            }
            this.confirmWarTargetId = undefined;
            this.updateMapSelection();
            this.render();
            break;
          }
          case 'request-ceasefire':
            this.confirmCeasefireWarId = element.dataset.war;
            this.render();
            break;
          case 'cancel-ceasefire':
            this.confirmCeasefireWarId = undefined;
            this.render();
            break;
          case 'confirm-ceasefire': {
            const warId = element.dataset.war ?? this.confirmCeasefireWarId;
            if (!warId) break;
            const result = this.engine.requestCeasefire(warId, this.viewerPlayerId());
            if (!commandAccepted(result)) this.toast(commandReason(result) ?? 'Ceasefire is unavailable.');
            else this.toast(this.options.multiplayer
              ? 'Peace request sent to the host for validation.'
              : 'Peace offer sent. The enemy will decide whether to accept it.');
            this.confirmCeasefireWarId = undefined;
            this.render();
            break;
          }
          case 'peace-settlement': {
            const result = this.engine.proposePeaceSettlement(
              this.viewerPlayerId(),
              element.dataset.player!,
              element.dataset.settlement as PeaceSettlementV2,
            );
            if (!commandAccepted(result)) this.toast(commandReason(result) ?? 'Peace terms are unavailable.');
            break;
          }
          case 'respond-offer': {
            const result = this.engine.respondToOffer(element.dataset.offer!, element.dataset.accept === 'true');
            if (!commandAccepted(result)) this.toast(commandReason(result) ?? 'The peace offer is no longer available.');
            break;
          }
          case 'propose-alliance': {
            const targetId = element.dataset.player as PlayerId | undefined;
            if (!targetId) break;
            const result = this.engine.proposeAlliance(this.viewerPlayerId(), targetId);
            if (!commandAccepted(result)) this.toast(commandReason(result) ?? 'The alliance invitation is unavailable.');
            else this.toast('Player alliance invitation sent.');
            this.render();
            break;
          }
          case 'respond-alliance': {
            const fromId = element.dataset.from as PlayerId | undefined;
            const toId = element.dataset.to as PlayerId | undefined;
            if (!fromId || !toId) break;
            const accept = element.dataset.accept === 'true';
            const result = this.engine.respondToAlliance(fromId, toId, accept);
            if (!commandAccepted(result)) this.toast(commandReason(result) ?? 'The alliance invitation is no longer available.');
            else this.toast(accept ? 'Player alliance formed. War between both countries is now blocked.' : 'Alliance invitation declined.');
            this.render();
            break;
          }
          case 'name-empire': {
            const input = this.hud.querySelector<HTMLInputElement>('#empire-name');
            const name = input?.value ?? this.empireNameDraft;
            const result = this.engine.setEmpireName(this.viewerPlayerId(), name);
            if (!commandAccepted(result)) {
              this.toast(commandReason(result) ?? 'That empire name is unavailable.');
              input?.focus();
              break;
            }
            this.empireNameDraft = name.trim();
            this.empireNameSubmitted = true;
            this.render();
            break;
          }
          case 'new-game':
            this.clearPolarSelection();
            if (this.options.onNewGameRequested) this.options.onNewGameRequested();
            else window.location.reload();
            break;
        }
      });
    });
    const search = this.hud.querySelector<HTMLInputElement>('#country-search');
    search?.addEventListener('input', () => {
      const query = search.value.trim().toLocaleLowerCase('en');
      this.introSearchQuery = search.value;
      const visibleOptions: HTMLElement[] = [];
      for (const option of this.hud.querySelectorAll<HTMLElement>('.country-grid [data-name]')) {
        const continentMatches = this.introContinent === 'ALL' || option.dataset.continent === this.introContinent;
        option.hidden = !continentMatches || (query.length > 0 && !(option.dataset.name ?? '').includes(query));
        if (!option.hidden) visibleOptions.push(option);
      }
      if (query) {
        const match = visibleOptions.find((option) => option.dataset.countryName === query) ?? visibleOptions[0];
        if (match?.dataset.country) this.introPreviewCountryId = match.dataset.country as PlayerId;
      }
      if (this.introSearchTimer !== undefined) window.clearTimeout(this.introSearchTimer);
      this.introSearchTimer = window.setTimeout(() => {
        this.introSearchTimer = undefined;
        this.introGridScrollTop = 0;
        this.render();
      }, 90);
    });
    const sort = this.hud.querySelector<HTMLSelectElement>('#country-sort');
    sort?.addEventListener('change', () => {
      this.introSort = sort.value as IntroSort;
      this.introGridScrollTop = 0;
      // Let the native select finish its input/change cycle before replacing
      // the fullscreen picker DOM. This keeps pointer and keyboard sorting stable.
      window.setTimeout(() => this.render(), 0);
    });
    this.hud.querySelectorAll<HTMLElement>('[data-action="quick-war"][data-map-target]').forEach((element) => {
      const preview = () => this.previewWarTarget(element.dataset.mapTarget as TerritoryId | undefined);
      const restore = () => {
        if (!this.confirmWarTargetId) this.updateMapSelection();
      };
      element.addEventListener('pointerenter', preview);
      element.addEventListener('focus', preview);
      element.addEventListener('pointerleave', restore);
      element.addEventListener('blur', restore);
    });
    const empireName = this.hud.querySelector<HTMLInputElement>('#empire-name');
    empireName?.addEventListener('input', () => { this.empireNameDraft = empireName.value; });
    empireName?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.hud.querySelector<HTMLElement>('[data-action="name-empire"]')?.click();
    });
    this.hud.querySelectorAll<HTMLInputElement>('[data-audio-channel]').forEach((input) => {
      input.addEventListener('input', () => {
        const channel = input.dataset.audioChannel as GameAudioChannel | undefined;
        if (!channel) return;
        const mix = worldGameAudio.setAudioChannelVolume(channel, Number(input.value) / 100);
        const percent = Math.round(mix[channel] * 100);
        input.setAttribute('aria-valuetext', `${percent} percent`);
        const output = input.parentElement?.querySelector<HTMLOutputElement>('output');
        if (output) output.value = `${percent}%`;
      });
    });
    this.hud.querySelectorAll<HTMLInputElement>('.polar-expedition-input').forEach((input) => {
      const sectorId = input.dataset.sector as AntarcticSectorIdV2 | undefined;
      if (!sectorId) return;
      input.addEventListener('input', () => {
        this.antarcticDeploymentDrafts.set(sectorId, input.value);
      });
      input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        this.hud.querySelector<HTMLElement>(`[data-action="deploy-antarctic-expedition"][data-sector="${sectorId}"]`)?.click();
      });
    });
    const polarModal = this.hud.querySelector<HTMLElement>('.polar-warning-modal, .polar-confirm-modal');
    if (polarModal) {
      const focusable = [...polarModal.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')];
      if (!polarModal.contains(document.activeElement)) (focusable[0] ?? polarModal).focus();
      polarModal.addEventListener('keydown', (event) => {
        if (event.key !== 'Tab') return;
        if (focusable.length === 0) {
          event.preventDefault();
          polarModal.focus();
          return;
        }
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      });
    }
  }
}
