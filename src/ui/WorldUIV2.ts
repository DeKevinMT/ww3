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
  type MapCommanderForceState,
  type MapOpeningMobilisationState,
  type MapPolarRegion,
  type MapTerritoryState,
  type WorldMapEngineContract,
} from '../game/map/bridge';
import { MapStatsRefreshCadence } from '../game/map/mapStatsCadence';
import { commanderForceMapCombatPower } from '../game/map/forcePresentation';
import { terrainPresentation } from '../game/terrainPresentation';
import {
  CONQUEST_CAPTURE_GUARD_TICKS,
  DEFENSE_RESEARCH_HALF_SATURATION,
  DEFENSE_RESEARCH_MAX_BONUS,
  diminishingResearchLevelV2,
  effectiveDefenseStatV2,
  NATIONAL_IQ_RESEARCH_HALF_SATURATION,
  NATIONAL_IQ_RESEARCH_MAX_BONUS,
  OPERATING_EFFICIENCY_RESEARCH_EFFECTIVE_CEILING,
  OPERATING_EFFICIENCY_RESEARCH_HALF_SATURATION,
  OPERATING_EFFICIENCY_RESEARCH_REDUCTION_PER_EFFECTIVE_LEVEL,
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
  commanderEliteComparisonForRatingsV2,
  selectApexLancerPulseStatusV2,
  selectApexTwinProjectionStatusV2,
  selectCommanderAutonomyStatusV2,
  selectCommanderFrontPrioritiesV2,
} from '../sim/v2/commanderForce';
import {
  initialNationArmyCapacityBenchmarkV2,
  openingArmyCapacityMultiplierV2,
  stateTerritoryArmyCapacityTargetV2,
  stateTerritoryArmySupportCeilingV2,
} from '../sim/v2/capacity';
import {
  quoteTerritoryIntegrationV2,
  selectApexSignalPurgeStatusesV2,
  type TerritoryIntegrationAccessV2,
  type TerritoryIntegrationQuoteV2,
} from '../sim/v2/integration';
import { openingStartingTreasuryV2 } from '../sim/v2/nationState';
import { selectNorthPoleModifiersV2 } from '../sim/v2/northPoleModifiers';
import {
  presentLogisticsReadinessV2,
  selectEmpireLogisticsReadinessV2,
  type EmpireLogisticsReadinessV2,
} from '../sim/v2/logisticsReadiness';
import { OPENING_ARMY_BONUS_DURATION_TICKS_V2 } from '../sim/v2/openingArmyBonus';
import { initialTrainedReserveManpowerV2 } from '../sim/v2/reserveForces';
import {
  ANTARCTIC_SECTORS_V2,
  ARCTIC_PROJECTS_V2,
  ROGUE_ATTENTION_LIBERATED_WORLD_SHARE_V2,
  ROGUE_ATTENTION_MIN_CAMPAIGN_TICK_V2,
} from '../sim/v2/polarEndgame';
import {
  CAMPAIGN_HUMAN_WAR_STORY_LOCK_REASON_V2,
  CAMPAIGN_WAR_LOCK_REASON_V2,
  campaignHumanWarsUnlockedV2,
  campaignProspectiveWarMobilizationTicksV2,
  campaignWarMobilizationTicksV2,
  campaignWarsUnlockedV2,
} from '../sim/v2/campaignPrologue';
import type { GameModeV2, ScenarioConfigV2 } from '../sim/v2/scenarios';
import {
  selectArmyStrengthV2,
  selectCanonicalWarFrontsV2,
  selectEffectiveAttackV2,
  selectEffectiveDefenseV2,
  selectNationViewV2,
  selectNationalEconomyV2,
  selectNationalIqViewV2,
  selectPopulationDynamicsV2,
  selectResearchEffectImpactV2,
  selectWarRouteDistanceKmV2,
  isSurvivalScorchedTransitTerritoryV2,
  type MilitaryBaseSnapshotV2,
  type PowerSnapshotV2,
} from '../sim/v2/selectors';
import type { OpeningCandidatePreviewSnapshotV2 } from '../sim/v2/WorldEngineV2';
import { territoryIdV2 } from '../sim/v2/types';
import {
  humanOpeningTrainedReserveTermsForContentV2,
  humanStartingArmyMultiplierForContentV2,
} from '../sim/v2/traits';
import { countryFlagHtml } from './countryFlags';
import { selectRogueLogisticsTelemetryV2 } from './antarcticaLogistics';
import { projectMapArmyV2 } from './mapArmyProjection';
import {
  beginWarOutcomePauseV2,
  enqueueWarOutcomeV2,
  finishWarOutcomePauseV2,
} from './warOutcomeQueue';
import {
  previewWarLogisticsV2,
  type WarLogisticsPreviewV2,
} from '../sim/v2/warLogisticsPreview';
import { selectCoopAllySupportPreviewV2 } from '../sim/v2/war';
import {
  captureDisclosureSessions,
  captureScrollSessions,
  drawerScrollSessionId,
  restoreDisclosureSessions,
  restoreScrollSessions,
} from './scrollSessions';
import {
  rankWarTargetRecommendationsV2,
  warTargetFusionValueBonusV2,
  warTargetRouteLabelV2,
  type AvailableWarTargetAccessV2,
} from './warTargetRecommendations';
import type {
  ArmyStateV2,
  ArmyStrengthV2,
  AllianceOfferV2,
  AllianceProposalStatusV2,
  ApexTransmissionChoiceV2,
  ApexTransmissionIdV2,
  ApexTransmissionV2,
  ApexForecastContributionV2,
  ArcticProjectIdV2,
  CommanderFrontAssignmentV2,
  CommanderMissionV2,
  CommanderOrderTermsV2,
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
  sameRegion: boolean;
  existingBeachhead: boolean;
  frontSupply: number;
  transferThroughput: number;
  stagingReadiness: number;
  preparationWeeks: number;
  etaWeeks: number;
  apexContribution: ApexForecastContributionV2;
  /** Frozen with the ranked recommendation so rendering never forecasts twice. */
  forecast: WarForecastV2;
};

type ArcticProjectDefinitionUIV2 = (typeof ARCTIC_PROJECTS_V2)[number];
type AntarcticSectorDefinitionUIV2 = (typeof ANTARCTIC_SECTORS_V2)[number];

interface ArcticProjectTermsUIV2 {
  readonly project: ArcticProjectDefinitionUIV2;
  readonly allowed: boolean;
  readonly reason?: string;
  readonly status: 'locked' | 'available' | 'active' | 'complete';
  readonly baseCost: number;
  readonly quotedCost: number;
  readonly cost: number;
  readonly baseDurationTicks: number;
  readonly researchSpeedDurationReduction: number;
  readonly quotedDurationTicks: number;
  readonly durationTicks: number;
  readonly startedTick?: number;
  readonly completesTick?: number;
  readonly progress: number;
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
  areAllied(leftId: string, rightId: string): boolean;
  allianceProposalStatus(fromId: string, targetId: string): AllianceProposalStatusV2;
  proposeAlliance(fromId: string, targetId: string): CommandOutcome;
  respondToAlliance(fromId: string, toId: string, accept: boolean): CommandOutcome;
  commanderOrderTerms(
    playerId: string,
    destinationId: string,
    mission: CommanderMissionV2,
    front: CommanderFrontAssignmentV2 | null,
  ): CommanderOrderTermsV2;
  issueCommanderOrder(
    playerId: string,
    destinationId: string,
    mission: CommanderMissionV2,
    front: CommanderFrontAssignmentV2 | null,
  ): CommandOutcome;
  arcticProjectTerms(playerId: string, projectId: ArcticProjectIdV2): ArcticProjectTermsUIV2;
  startArcticProject(playerId: string, projectId: ArcticProjectIdV2): CommandOutcome;
  acknowledgePolarWarning(playerId: string): CommandOutcome;
  apexTransmissions(playerId: string): readonly ApexTransmissionV2[];
  respondApexTransmission(
    playerId: string,
    transmissionId: ApexTransmissionIdV2,
    choice: ApexTransmissionChoiceV2,
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
  /** Ends one persistent solo campaign and hands settlement to the account layer. */
  onSurrenderRequested?: () => void;
  onCountryConfirmed?: (countryId: PlayerId) => void;
  onInitialMapSynchronized?: () => void;
  /** Global account unlocks. Omit to preserve the legacy/full multiplayer list. */
  availableCountryIds?: ReadonlySet<string>;
  /** Global country-mastery level keyed by canonical nation id. */
  countryMasteryLevels?: ReadonlyMap<string, number>;
  /** Account upgrades resolved for the nation picker; absent in legacy multiplayer. */
  countryLoadouts?: ReadonlyMap<string, NationAccountLoadoutPresentationV2>;
  onOpenNationArsenal?: (countryId: string) => void;
}

type PanelMode = 'war' | 'commander' | 'nation' | 'research' | 'economy' | 'ranking';
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
    effect: 'Grows the economy and makes later breakthroughs faster and cheaper.',
  },
  'food-systems': {
    label: 'Sustainment Systems', shortLabel: 'Sustainment',
    effect: 'Raises military supply readiness and field recovery.',
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
    'food-production': 'SUPPLY', 'food-storage': 'RECOVERY',
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
  if (/food/.test(key)) return { icon: 'MIL', tone: 'force' };
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
const COMPACT_NUMBER_FORMATTERS = new Map<number, Intl.NumberFormat>();

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
  let formatter = COMPACT_NUMBER_FORMATTERS.get(digits);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: digits });
    COMPACT_NUMBER_FORMATTERS.set(digits, formatter);
  }
  return `${value < 0 ? '−' : ''}${formatter.format(compact)}${unit?.suffix ?? ''}`;
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

export interface ArmyReadinessTopbarPresentationV2 {
  readonly percent: number;
  readonly value: string;
  readonly status: 'LOW' | 'BUILDING' | 'READY';
  readonly className: 'is-negative' | 'is-warn' | 'is-positive';
}

/** Compact, authoritative Empire army fill shown in the always-visible HUD. */
export function armyReadinessTopbarPresentationV2(
  deployed: number,
  capacity: number,
): ArmyReadinessTopbarPresentationV2 {
  const safeDeployed = Math.max(0, Number.isFinite(deployed) ? deployed : 0);
  const safeCapacity = Math.max(0, Number.isFinite(capacity) ? capacity : 0);
  const percent = Math.round(clamp(
    safeCapacity > 0 ? safeDeployed / safeCapacity : 0,
    0,
    1,
  ) * 100);
  if (percent >= 85) {
    return Object.freeze({ percent, value: `${percent}%`, status: 'READY', className: 'is-positive' });
  }
  if (percent >= 55) {
    return Object.freeze({ percent, value: `${percent}%`, status: 'BUILDING', className: 'is-warn' });
  }
  return Object.freeze({ percent, value: `${percent}%`, status: 'LOW', className: 'is-negative' });
}

export interface ApexShieldTopbarPresentationV2 {
  readonly operationalPower: number;
  readonly integrityPercent: number;
  readonly recovering: boolean;
}

/** Shield integrity is visible as energy, never mislabelled as deployed troops. */
export function apexShieldTopbarPresentationV2(
  power: number,
  integrity: number,
  maxIntegrity: number,
  mission: string,
): ApexShieldTopbarPresentationV2 {
  const safePower = Math.max(0, Number.isFinite(power) ? power : 0);
  const safeIntegrity = Math.max(0, Number.isFinite(integrity) ? integrity : 0);
  const safeMaxIntegrity = Math.max(0, Number.isFinite(maxIntegrity) ? maxIntegrity : 0);
  const recovering = mission === 'evacuate' || mission === 'hq-training';
  const integrityPercent = Math.round(clamp(
    safeMaxIntegrity > 0 ? safeIntegrity / safeMaxIntegrity : 0,
    0,
    1,
  ) * 100);
  return Object.freeze({
    operationalPower: recovering ? 0 : safePower,
    integrityPercent,
    recovering,
  });
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
    className: `top-metric--economy${balanceTone}`,
    value: cash(treasury),
    reserveFill,
    reserveFillClassName,
    trend: `${signedCash(weeklyNet)}/wk`,
    trendClassName: weeklyNet >= 0 ? 'is-positive' : 'is-negative',
    ariaLabel: `Current empire treasury ${cash(treasury)}; projected recurring net ${signedCash(weeklyNet)} per week`,
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
  if (estimate.confidence === 'low') {
    return estimate.outlook === 'enemy-collapse' ? 'Early advantage'
      : estimate.outlook === 'our-collapse' ? 'Early danger'
        : estimate.outlook === 'stalled' ? 'No clear edge'
          : 'Even opening';
  }
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

function worldDateLabel(tick: number, startYear = 2026): string {
  const start = Date.UTC(startYear, 7, 17);
  return WORLD_DATE_FORMATTER.format(new Date(start + tick * 7 * 24 * 60 * 60 * 1_000)).toUpperCase();
}

function armyReadinessLabel(army: ArmyStateV2): string {
  if (army.manpower <= 0) return 'DEFEATED';
  const fill = army.capacity > 0 ? army.manpower / army.capacity : 0;
  if (fill < 0.3) return 'CRITICAL';
  if (fill < 0.6) return 'THIN';
  if (fill < 0.85) return 'UNDERSTRENGTH';
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
  transitOnly = false,
): MapTerritoryState {
  return {
    id: territoryId,
    ownerId: territory.owner,
    coreOwnerId: territory.coreOwner,
    integration: territory.integration,
    integrationCompletesTick: territory.integrationProgram?.completesTick,
    transitOnly,
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
  availableCountryIds?: ReadonlySet<string>;
  countryMasteryLevels?: ReadonlyMap<string, number>;
  countryLoadouts?: ReadonlyMap<string, NationAccountLoadoutPresentationV2>;
}

export function integrationCompletionToastMessageV2(
  formerCoreName: string,
  ownerName: string,
  apexControlled: boolean,
): string {
  return apexControlled
    ? `${formerCoreName} signal purged · now permanent liberated ${ownerName} core territory`
    : `${formerCoreName} command network absorbed by ${ownerName} · consolidation complete`;
}

export interface NationAccountLoadoutPresentationV2 {
  openingArmyMultiplier: number;
  openingEconomyMultiplier: number;
  trainedReserveMultiplier: number;
  traitScale: number;
  attackMultiplier?: number;
  defenseMultiplier?: number;
  combatPowerMultiplier?: number;
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

/** Retired compatibility renderer. Country Traits no longer have active UI. */
export function renderCountryTraitPresentationV2(
  _playerId: PlayerId,
  _surface: CountryTraitPresentationSurfaceV2,
  _content: WorldContentV2 = WORLD_CONTENT_V2,
  _playerMultiplierOverride?: number,
): string {
  return '';
}

/** Retired compatibility renderer. Country Traits no longer appear in intel. */
export function renderCountryTraitIntelV2(
  _playerId: PlayerId,
  _humanControlled: boolean,
  _content: WorldContentV2 = WORLD_CONTENT_V2,
  _humanMultiplierOverride?: number,
): string {
  return '';
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
  // first-conquest prerequisite true once, exactly as runtime capture would, while the
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
  const isLobby = options.context === 'lobby';
  const claimed = options.claimedCountryIds ?? new Set<PlayerId>();
  const availableCountryIds = options.availableCountryIds;
  const accountManagedSolo = !isLobby && availableCountryIds !== undefined;
  const allNations = [...content.nationIds]
    .map((id) => content.nations[id])
    .filter((nation): nation is NonNullable<typeof nation> => (
      nation !== undefined
      && nation.kind !== 'rogue-ai'
      && opening.byNation.has(nation.id)
    ));
  const nations = allNations
    .filter((nation) => !isLobby || !availableCountryIds || availableCountryIds.has(nation.id))
    .sort((left, right) => {
      if (!isLobby && availableCountryIds) {
        const leftOwned = availableCountryIds.has(left.id);
        const rightOwned = availableCountryIds.has(right.id);
        if (leftOwned !== rightOwned) return leftOwned ? -1 : 1;
      }
      if (accountManagedSolo && (options.sort === 'power' || options.sort === 'military')) {
        const leftPower = (opening.byNation.get(left.id)?.combatPower ?? 0)
          * (options.countryLoadouts?.get(left.id)?.combatPowerMultiplier ?? 1);
        const rightPower = (opening.byNation.get(right.id)?.combatPower ?? 0)
          * (options.countryLoadouts?.get(right.id)?.combatPowerMultiplier ?? 1);
        if (leftPower !== rightPower) return rightPower - leftPower;
      }
      return compareIntroNationMetricsV2(left, right, options.sort, opening);
    });
  if (nations.length === 0) {
    const pickerClass = isLobby ? 'country-select country-select--lobby' : 'country-select modal-card';
    return {
      html: `<section class="${pickerClass}" data-nation-picker="${options.context}"><div class="country-select__empty" role="status"><div class="panel-kicker">APEX ACCOUNT</div><h1>No nations available</h1><p>Unlock a country in the Nation Arsenal before starting this campaign.</p></div></section>`,
      previewCountryId: options.previewCountryId,
      visibleCount: 0,
    };
  }
  const selectableIds = new Set(nations.map((nation) => nation.id));
  const desired = selectableIds.has(options.previewCountryId)
    ? content.nations[options.previewCountryId] : undefined;
  const selected = options.selectedCountryId
    && selectableIds.has(options.selectedCountryId)
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
  const accountLoadout = options.countryLoadouts?.get(preview.id);
  const previewAttack = previewMetrics.attack * (accountManagedSolo
    ? accountLoadout?.attackMultiplier ?? 1 : 1);
  const previewDefense = previewMetrics.defense * (accountManagedSolo
    ? accountLoadout?.defenseMultiplier ?? 1 : 1);
  const previewCombatPower = previewMetrics.combatPower * (accountManagedSolo
    ? accountLoadout?.combatPowerMultiplier ?? 1 : 1);
  const startingTreasury = openingStartingTreasuryV2(
    preview.id,
    content,
    !accountManagedSolo,
  ) * (accountManagedSolo ? accountLoadout?.openingEconomyMultiplier ?? 1 : 1);
  const startingArmyMultiplier = accountManagedSolo
    ? accountLoadout?.openingArmyMultiplier ?? 1
    : humanStartingArmyMultiplierForContentV2(content, preview.id);
  const startingArmy = army.deployed * startingArmyMultiplier;
  const startingArmyBonus = Math.max(0, startingArmy - army.deployed);
  const openingForceIsBoosted = startingArmyMultiplier > 1.000000001;
  const openingForceIsLimited = startingArmyMultiplier < 0.999999999;
  // The shared opening snapshot is deliberately neutral AI state. A human
  // seat below 1x scales its tick-zero trained cadre by the same opening
  // factor; positive Army multipliers use a separate bounded reserve curve,
  // never the full temporary Army multiplier.
  const neutralReserveCapacity = finance.trainedReserveCapacity;
  const playerNeutralReserveCapacity = neutralReserveCapacity;
  const playerReserveTerms = accountManagedSolo ? undefined
    : humanOpeningTrainedReserveTermsForContentV2(
      content,
      preview.id,
      previewState.trainedReserves,
      playerNeutralReserveCapacity,
      playerNeutralReserveCapacity * Math.min(1, startingArmyMultiplier),
    );
  const accountReserve = initialTrainedReserveManpowerV2(
    preview.id,
    initialNationArmyCapacityBenchmarkV2(content, preview.id),
    content,
  ) * (accountLoadout?.trainedReserveMultiplier ?? 1);
  const startingTrainedReserve = Math.round((accountManagedSolo
    ? accountReserve : playerReserveTerms!.trainedReserves) * 1e9) / 1e9;
  const startingArmyAdjustmentNote = openingForceIsBoosted
    ? accountManagedSolo
      ? `<small>+${people(startingArmyBonus)} FROM COUNTRY MASTERY</small>`
      : `<small>+${people(startingArmyBonus)} FULLY FREE · FADES OVER 30 YEARS</small>`
    : openingForceIsLimited
      ? '<small>OPENING LIMIT · FORCE CAPS UNLOCK TO 1× OVER 30 YEARS</small>'
      : '';
  const startingArmyTitle = openingForceIsBoosted
    ? accountManagedSolo
      ? 'Permanent military progression earned with this country.'
      : 'The player-only deployed surplus has no upkeep. It fades over thirty years and never refills; trained reserves use their separate bounded country curve, never the full Army multiplier.'
    : openingForceIsLimited
      ? `Opening limit: deployed Army and trained Reserve start at ×${format(startingArmyMultiplier, 2)}. Their Army and Reserve capacity limits unlock gradually to 1× over thirty years; new troops still require normal recruitment and training.`
      : 'Normal 1× opening Army and trained Reserve, with no player-only opening boost or limit.';
  const startingArmyClass = openingForceIsBoosted
    ? 'stat-player-army--boost'
    : openingForceIsLimited ? 'stat-player-army--limit' : 'stat-player-army--neutral';
  const neutralRelativeStats = introRelativeStatSourcesV2(previewMetrics);
  const neutralRelativePopulation = allNations
    .map((nation) => metrics.get(nation.id))
    .filter((entry): entry is IntroNationMetricsV2 => Boolean(entry))
    .map(introRelativeStatSourcesV2);
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
    ${relativeStat('attack', 'ATK', format(previewAttack, 2), 'stat-atk')}
    ${relativeStat('defense', 'DEF', format(previewDefense, 2), 'stat-def')}
    ${relativeStat('iq', 'IQ', format(previewMetrics.iqView.score, 1), 'stat-iq', '', iqTitle)}
    ${relativeStat('army', `PLAYER START ARMY · ×${format(startingArmyMultiplier, 2)}`, people(startingArmy), `stat-player-army ${startingArmyClass}`, startingArmyAdjustmentNote, startingArmyTitle)}
    ${relativeStat('reserve', 'TRAINED RESERVE', people(startingTrainedReserve), 'stat-trained-reserve')}
    ${relativeStat('population', 'POPULATION', population(economy.population))}
    ${relativeStat('economy', 'ECONOMY', cash(economy.output), 'stat-economy')}
    ${relativeStat('treasury', 'STARTING TREASURY', cash(startingTreasury), 'stat-treasury')}
    ${relativeStat('economicGrowth', 'ECONOMIC GROWTH', `${signed(finance.annualEconomyGrowthRate * 100, 2)}%`)}
    ${relativeStat('tax', 'TAX', `${format(economy.dynamicTaxRate * 100, 1)}%`, '', '', 'Automatic 10–20% rate from liberated GDP per baseline productive person.')}
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
    const neutralValue = metrics.get(nationId)?.[options.sort] ?? 0;
    const value = accountManagedSolo && (options.sort === 'power' || options.sort === 'military')
      ? neutralValue * (options.countryLoadouts?.get(nationId)?.combatPowerMultiplier ?? 1)
      : neutralValue;
    if (options.sort === 'manpower') return people(value);
    if (options.sort === 'economy' || options.sort === 'gdp-per-capita') return cash(value);
    if (options.sort === 'tax' || options.sort === 'aggressiveness') return `${format(value, 1)}%`;
    if (options.sort === 'population') return population(value);
    if (options.sort === 'growth' || options.sort === 'economic-growth') return `${value >= 0 ? '+' : ''}${format(value, 2)}%`;
    if (options.sort === 'attack' || options.sort === 'defense') return format(value, 2);
    if (options.sort === 'power' || options.sort === 'military') return compactNumber(value);
    return format(value, options.sort === 'iq' ? 1 : 0);
  };
  const masteryLevelFor = (nationId: PlayerId): number | undefined => {
    const level = options.countryMasteryLevels?.get(nationId);
    return Number.isFinite(level) ? Math.max(1, Math.floor(level!)) : undefined;
  };
  const previewMasteryLevel = masteryLevelFor(preview.id);
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
  const previewUnlocked = !availableCountryIds || availableCountryIds.has(preview.id);
  const primaryLabel = isLobby
    ? options.selectedCountryId === preview.id
      ? `✓ ${preview.name.toUpperCase()} SELECTED`
      : `SELECT ${preview.name.toUpperCase()}`
    : previewUnlocked ? `COMMAND ${preview.name.toUpperCase()}`
      : 'DEFEAT IN CAMPAIGN';
  const scenario = options.scenarioConfig;
  const scenarioMode = scenario?.mode ?? content.metadata?.scenarioId ?? 'standard-2026';
  const randomWorld = scenarioMode === 'random-world';
  const scenarioSeed = scenario?.seed ?? content.metadata?.generatedFromSeed;
  const startYear = content.metadata?.startYear ?? 2026;
  const scenarioButtonsDisabled = options.scenarioEditable ? '' : 'disabled aria-disabled="true"';
  const scenarioControls = scenario && (isLobby || (options.scenarioEditable && !accountManagedSolo)) ? `<div class="scenario-picker" role="group" aria-label="Game mode">
    <div class="scenario-picker__modes">
      <button class="${randomWorld ? '' : 'is-active'}" ${actionAttribute}="scenario-standard" ${scenarioButtonsDisabled}><b>CAMPAIGN</b><span>Authentic opening data</span></button>
      <button class="${randomWorld ? 'is-active' : ''}" ${actionAttribute}="scenario-random" ${scenarioButtonsDisabled}><b>ALTERNATIVE UNIVERSE</b><span>New balance every seed</span></button>
    </div>
    <div class="scenario-picker__seed"><span>${randomWorld ? 'UNIVERSE SEED' : 'SIMULATION SEED'}</span><strong>${scenarioSeed ?? '—'}</strong>${randomWorld && options.scenarioEditable ? `<button ${actionAttribute}="scenario-reroll" title="Generate another Alternative Universe">↻ REROLL</button>` : ''}</div>
  </div>` : '';
  const scenarioDescription = randomWorld
    ? 'Countries keep their geography, but specialized stats and rare outliers rebuild population, economy, military quality and strategic power from the seed.'
    : 'APEX projects its neural dome autonomously. You choose strategy and targets.';
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
    const masteryLevel = masteryLevelFor(nation.id);
    const unlocked = !availableCountryIds || availableCountryIds.has(nation.id);
    const masteryBadge = masteryLevel === undefined
      ? ''
      : `<b class="country-card__mastery">MASTERY LV ${masteryLevel}</b>`;
    const metric = !unlocked
      ? '<span class="country-card__account-lock"><b>LOCKED</b><em>DEFEAT IN CAMPAIGN</em></span>'
      : isClaimed
      ? `<span class="country-card__claimed"><b>CLAIMED</b><em>${escapeHtml(claimant ?? 'OTHER PLAYER')}</em></span>`
      : `<span><b>${displayMetric(nation.id)}</b><em>${sortLabels[options.sort]}</em></span>`;
    return `<button class="${nation.id === preview.id ? 'is-selected ' : ''}${isCurrent ? 'is-current ' : ''}${isClaimed ? 'is-claimed ' : ''}${unlocked ? 'is-account-owned' : 'is-account-locked'}" ${actionAttribute}="preview-country" data-country="${nation.id}" data-continent="${escapeHtml(nation.continent)}" data-country-name="${escapeHtml(nation.name.toLocaleLowerCase('en'))}" data-name="${escapeHtml(searchable)}" ${masteryLevel === undefined ? '' : `data-country-mastery-level="${masteryLevel}"`} aria-pressed="${nation.id === preview.id}" ${isClaimed ? 'disabled aria-disabled="true"' : ''} ${hidden ? 'hidden' : ''} style="--country:${nation.cssColor}"><i class="country-flag">${countryFlagHtml(nation.id, nation.sigil)}</i><div><strong>${escapeHtml(nation.name)}${isCurrent ? ' · YOUR CHOICE' : ''}</strong><small>${escapeHtml(nation.subregion)} · ${population(nation.real.population)} people</small><em>${cash(nation.real.gdp)} GDP · ${signed(nationEconomicGrowth, 2)}%/yr</em>${masteryBadge}</div>${metric}</button>`;
  }).join('');
  const countryCountLabel = availableCountryIds
    ? `${availableCountryIds.size} owned · ${nations.length} total` : `${nations.length} countries`;
  const previewMasteryLabel = previewMasteryLevel === undefined
    ? ''
    : ` · MASTERY LEVEL ${previewMasteryLevel}`;
  const html = `<section class="${pickerClass}" data-nation-picker="${options.context}" data-scenario="${scenarioMode}">
    <div class="country-select__head">
      <div><div class="panel-kicker">${isLobby ? 'MULTIPLAYER LOBBY · COUNTRY SEAT' : `NEW CAMPAIGN · ${randomWorld ? 'ALTERNATIVE UNIVERSE' : startYear}`}</div><h1>Choose your nation</h1><p>${isLobby ? 'Your choice is reserved for you and cannot be selected by another commander.' : scenarioDescription}</p></div>
      <div class="country-select__head-side">${scenarioControls}<div class="country-select__facts"><span><b>${countryCountLabel}</b></span><span><b>${isLobby ? '2–8' : 'ONE AI'}</b> ${isLobby ? 'players' : 'every country'}</span><span><b>${startYear}</b> start date</span><span><b>${randomWorld ? 'SEEDED' : 'LIVE'}</b> ${randomWorld ? 'world' : 'aggression'}</span></div></div>
    </div>
    <div class="country-select__tools"><label class="country-search"><span>⌕</span><input id="${searchId}" type="search" value="${escapeHtml(options.searchQuery)}" placeholder="Search countries…" autocomplete="off"></label><label class="country-sort"><span>SORT</span><select id="${sortId}" aria-label="Sort countries">${sortOptions}</select></label><div class="country-filters" role="group" aria-label="Filter countries by continent"><button class="${options.continent === 'ALL' ? 'is-active' : ''}" ${actionAttribute}="continent-filter" data-continent="ALL">ALL</button>${continents.map((continent) => `<button class="${options.continent === continent ? 'is-active' : ''}" ${actionAttribute}="continent-filter" data-continent="${escapeHtml(continent)}">${escapeHtml(continent.toUpperCase())}</button>`).join('')}<span>${visibleCount} shown</span></div></div>
    <div class="country-select__body"><div class="country-grid" data-scroll-session="${isLobby ? 'lobby' : 'intro'}:country-grid">${cards}</div><aside class="country-preview ${previewUnlocked ? 'is-account-owned' : 'is-account-locked'}" ${previewMasteryLevel === undefined ? '' : `data-country-mastery-level="${previewMasteryLevel}"`} style="--country:${preview.cssColor}"><div class="country-preview__identity"><i class="country-flag country-flag--large">${countryFlagHtml(preview.id, preview.sigil, true)}</i><div><span>BASE RANK #${previewMetrics.rank}${previewMasteryLabel}</span><h2 title="${escapeHtml(preview.name)}">${escapeHtml(previewState.shortName)}</h2><p>${escapeHtml(preview.subregion)}</p></div><b>${compactNumber(previewCombatPower)}<small>${accountManagedSolo && previewUnlocked ? 'MASTERED POWER' : 'MILITARY POWER'}</small></b></div>${!previewUnlocked ? `<section class="country-preview__unlock"><span>ACCOUNT LOCKED</span><strong>DEFEAT IN CAMPAIGN</strong><small>Defeat ${escapeHtml(preview.name)} in a standard Campaign war to unlock it permanently. Alternative Universe and Survival do not unlock nations.</small></section>` : ''}${renderPreviewStats()}<div class="country-preview__actions"><button class="primary-button country-preview__start" ${actionAttribute}="${isLobby ? 'select-country' : 'choose-country'}" data-country="${preview.id}" ${!isLobby && !previewUnlocked ? 'disabled' : ''}>${escapeHtml(primaryLabel)}</button>${!isLobby && accountManagedSolo ? `<button class="secondary-button country-preview__arsenal" data-action="open-nation-arsenal" data-country="${preview.id}">VIEW IN NATION ARSENAL</button>` : ''}${multiplayerButton}</div></aside></div>
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

function allWarOperations(war: WarStateV2): FrontOperationV2[] {
  return [...selectCanonicalWarFrontsV2(war)].sort(compareFrontOperations);
}

export function mapPolarEndgameSnapshotV2(
  state: WorldStateV2,
): NonNullable<WorldMapEngineContract['state']['polarEndgame']> {
  const polar = state.polarEndgame;
  const sectors = Object.fromEntries(Object.entries(polar.sectors).map(([sectorId, sector]) => {
    const territory = state.territories[territoryIdV2(sectorId)];
    const playerOwned = Boolean(territory && territory.owner !== 'rai');
    return [sectorId, {
      // Canonical hidden/available/contested progression remains authoritative.
      // Merely materialising the Rogue territory must not reveal it on the map.
      status: playerOwned ? 'secured' : sector.status,
      integrity: playerOwned ? 0 : clamp((territory?.army.manpower ?? 0)
        / Math.max(0.000001, territory?.army.capacity ?? 0), 0, 1) * 100,
      wave: sector.wave,
      discoveredTick: sector.discoveredTick ?? undefined,
      securedTick: sector.securedTick ?? undefined,
      securedBy: playerOwned ? territory?.owner : undefined,
    }];
  })) as NonNullable<WorldMapEngineContract['state']['polarEndgame']>['sectors'];
  return {
    phase: polar.phase,
    visualRevision: polar.visualRevision + state.actionSequence,
    sectors,
    roguePrime: {
      status: polar.roguePrime.status,
      force: polar.roguePrime.force
        ? mapCommanderForceSnapshotV2(
          'rogue-prime',
          polar.roguePrime.force,
          'zero-point-core',
          'rogue-prime',
        ) ?? null
        : null,
      sortieSequence: polar.roguePrime.sortieSequence,
      nextSortieTick: polar.roguePrime.nextSortieTick,
      gatewayId: polar.roguePrime.gatewayId,
      targetId: polar.roguePrime.targetId,
      departTick: polar.roguePrime.departTick,
      strikeTick: polar.roguePrime.strikeTick,
      returnTick: polar.roguePrime.returnTick,
      rebuildReadyTick: polar.roguePrime.rebuildReadyTick,
    },
  };
}

type CommanderForceMapSourceV2 = {
  readonly locationId?: unknown;
  readonly mission?: unknown;
  readonly front?: unknown;
  readonly army?: Partial<MapCommanderForceState['army']>;
  readonly economy?: Partial<MapCommanderForceState['economy']> & {
    readonly priorities?: unknown;
  };
  readonly doctrineRuntime?: {
    readonly lancerSupportedAssaultCount?: unknown;
    readonly secondaryProjection?: {
      readonly locationId?: unknown;
      readonly mission?: unknown;
      readonly front?: {
        readonly warId?: unknown;
        readonly sourceId?: unknown;
        readonly targetId?: unknown;
      } | null;
    } | null;
  };
  readonly transit?: {
    readonly path?: readonly unknown[];
    readonly departTick?: unknown;
    readonly arriveTick?: unknown;
  } | null;
};

function finiteCommanderMapNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function mapCommanderForceSnapshotV2(
  playerId: string,
  force: CommanderForceMapSourceV2,
  headquartersId: string,
  role: 'apex' | 'rogue-prime',
): MapCommanderForceState | undefined {
  const locationId = typeof force?.locationId === 'string' ? force.locationId : '';
  if (!locationId) return undefined;
  const path = force.transit?.path?.filter((entry): entry is string => (
    typeof entry === 'string' && entry.length > 0
  )) ?? [];
  const transit = force.transit && path.length > 1 ? {
    path,
    departTick: finiteCommanderMapNumber(force.transit.departTick),
    arriveTick: finiteCommanderMapNumber(force.transit.arriveTick),
  } : null;
  const army = force.army ?? {};
  const economy = force.economy ?? {};
  const doctrineRuntime = force.doctrineRuntime;
  const secondarySource = doctrineRuntime?.secondaryProjection;
  const secondaryFront = secondarySource?.front;
  const secondaryProjection: NonNullable<
    MapCommanderForceState['doctrineRuntime']
  >['secondaryProjection'] = secondarySource
    && typeof secondarySource.locationId === 'string'
    && (secondarySource.mission === 'assault-support'
      || secondarySource.mission === 'defense')
    && secondaryFront
    && typeof secondaryFront.warId === 'string'
    && typeof secondaryFront.sourceId === 'string'
    && typeof secondaryFront.targetId === 'string'
    ? {
        locationId: secondarySource.locationId,
        mission: secondarySource.mission,
        front: {
          warId: secondaryFront.warId,
          sourceId: secondaryFront.sourceId,
          targetId: secondaryFront.targetId,
        },
      }
    : null;
  return {
    playerId,
    role,
    headquartersId,
    locationId,
    mission: typeof force.mission === 'string' ? force.mission : 'standby',
    front: typeof force.front === 'string' ? force.front
      : force.front && typeof force.front === 'object'
        && 'targetId' in force.front && typeof force.front.targetId === 'string'
        ? force.front.targetId : null,
    army: {
      manpower: finiteCommanderMapNumber(army.manpower),
      capacity: finiteCommanderMapNumber(army.capacity),
      trainedReserves: finiteCommanderMapNumber(army.trainedReserves),
      baseAttack: finiteCommanderMapNumber(army.baseAttack),
      baseDefense: finiteCommanderMapNumber(army.baseDefense),
    },
    economy: {
      treasury: finiteCommanderMapNumber(economy.treasury),
      annualOutput: finiteCommanderMapNumber(economy.annualOutput),
      supplyStock: finiteCommanderMapNumber(economy.supplyStock),
    },
    ...(doctrineRuntime ? {
      doctrineRuntime: {
        lancerSupportedAssaultCount: clamp(
          Math.floor(finiteCommanderMapNumber(
            doctrineRuntime.lancerSupportedAssaultCount,
          )),
          0,
          2,
        ),
        secondaryProjection,
      },
    } : {}),
    transit,
  };
}

/** Keep the Three.js adapter independent from the richer mutable corps model. */
function mapCommanderForcesSnapshotV2(
  state: WorldStateV2,
  content: WorldContentV2,
): Readonly<Record<string, MapCommanderForceState>> {
  const source = (state as unknown as {
    readonly commanderForces?: Readonly<Record<string, CommanderForceMapSourceV2>>;
  }).commanderForces;
  if (!source) return {};
  return Object.fromEntries(Object.entries(source).flatMap(([playerId, force]) => {
    const projected = mapCommanderForceSnapshotV2(
      playerId,
      force,
      content.nations[playerId as PlayerId]?.initialCapitalId
        ?? (typeof force?.locationId === 'string' ? force.locationId : ''),
      'apex',
    );
    return projected ? [[playerId, projected] as const] : [];
  }));
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
    commanderForces: mapCommanderForcesSnapshotV2(source, engine.content),
    polarEndgame: mapPolarEndgameSnapshotV2(source),
  };
}

export interface MapViewerKnowledgeSourceV2 {
  /** Local account dossiers; intentionally absent from canonical WorldStateV2. */
  readonly chartedTerritoryIds?: () => Iterable<string>;
}

/**
 * The map renderer needs scenario identity and route topology, not the richer
 * authored military/economic content. Keeping this projection narrow prevents
 * renderer code from turning fog of war into a live-intelligence back door.
 */
export function mapWorldContentProjectionV2(
  content: WorldContentV2,
): NonNullable<WorldMapEngineContract['content']> {
  return Object.freeze({
    metadata: content.metadata?.scenarioId
      ? Object.freeze({ scenarioId: content.metadata.scenarioId }) : undefined,
    territories: Object.freeze(Object.fromEntries(Object.entries(content.territories)
      .map(([territoryId, territory]) => [territoryId, Object.freeze({
        connections: Object.freeze(territory.connections.map((connection) => Object.freeze({
          targetId: String(connection.targetId),
        }))),
      })]))),
  });
}

export function createMapEngineAdapter(
  engine: WorldEngineV2UIContract,
  ranking: () => RankingEntryV2[],
  controllerNames: ReadonlyMap<PlayerId, string> = new Map(),
  viewerKnowledgeSource: MapViewerKnowledgeSourceV2 = {},
): WorldMapEngineContract {
  const mapContent = mapWorldContentProjectionV2(engine.content);
  const blackoutAcknowledged = (playerId: PlayerId): boolean => {
    const briefing = engine.apexTransmissions(playerId).find((item) => (
      item.id === 'campaign-communications-blackout'
    ));
    // Authenticated legacy timelines may predate structured transmissions. A
    // stored blackout without that briefing is already a settled presentation.
    return briefing
      ? briefing.choice !== null
      : engine.state.polarEndgame.communicationsBlackoutTick !== null;
  };
  const blackoutAcknowledgedAtAdapterCreation = new Map<PlayerId, boolean>(
    engine.state.humanPlayerIds.map((playerId) => [
      playerId,
      blackoutAcknowledged(playerId),
    ]),
  );
  let snapshot: WorldMapEngineContract['state'] | undefined;
  let snapshotTick = -1;
  let snapshotActionSequence = -1;
  let snapshotHumanPlayerId = '';
  let snapshotHumanPlayerRoster = '';
  let snapshotCommanderRoster = '';
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
    const warTerritoryIds = new Set(sortedWars.flatMap((war) => (
      [...war.attackerOperations, ...war.defenderOperations]
        .flatMap((operation) => [operation.sourceId, operation.targetId])
    )));
    const refreshPlan = mapStatsCadence.resolve({
      tick: source.tick,
      territories: territoryEntries.map(([id, territory]) => ({
        id,
        ownerId: territory.owner,
        lifecycleKey: lifecycleKey(territory),
      })),
      warOwnerIds,
      warTerritoryIds,
    });
    const refreshTerritoryIds = new Set(refreshPlan.territoryIds);
    for (const ownerId of refreshPlan.aggregateOwnerIds) {
      const capitalId = engine.player(ownerId)?.capitalId;
      const representativeId = capitalId && canonical[capitalId]?.owner === ownerId
        ? capitalId
        : territoryEntries.find(([, territory]) => territory.owner === ownerId)?.[0];
      if (representativeId) refreshTerritoryIds.add(representativeId);
    }
    const refreshEntries = territoryEntries.filter(([id]) => (
      refreshTerritoryIds.has(id) || !armyByTerritory.has(id)
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
      territories[id] = mapTerritory(
        id,
        territory,
        army,
        isSurvivalScorchedTransitTerritoryV2(source, id as TerritoryId),
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
      commanderForces: mapCommanderForcesSnapshotV2(source, engine.content),
      polarEndgame: mapPolarEndgameSnapshotV2(source),
    };
  };
  const readSnapshot = (): WorldMapEngineContract['state'] => {
    if (!snapshot) throw new Error('Map renderer snapshot requested before sync.');
    return snapshot;
  };
  return {
    content: mapContent,
    get viewerKnowledge() {
      const chartedTerritoryIds = [...new Set(
        [...(viewerKnowledgeSource.chartedTerritoryIds?.() ?? [])]
          .filter((territoryId) => Boolean(engine.content.territories[territoryId as TerritoryId])),
      )].sort((left, right) => left.localeCompare(right));
      const polar = engine.state.polarEndgame as WorldStateV2['polarEndgame'] & {
        readonly communicationsBlackoutTick?: number | null;
      };
      const communicationsBlackoutTick = polar.communicationsBlackoutTick ?? null;
      const scenarioId = engine.content.metadata?.scenarioId;
      const viewerId = engine.viewerPlayerId ?? engine.state.humanPlayerId;
      const campaignBlackoutAcknowledged = communicationsBlackoutTick !== null
        && blackoutAcknowledged(viewerId);
      const legacyHumanWarHistory = engine.state.wars.some((war) => (
        war.attackerId === viewerId || war.defenderId === viewerId
      )) || engine.state.events.some((event) => (
        event.kind === 'war' && event.playerId === viewerId
      ));
      return Object.freeze({
        chartedTerritoryIds: Object.freeze(chartedTerritoryIds),
        communicationsBlackoutActive: scenarioId === 'survival'
          || (scenarioId === 'standard-2026' && campaignBlackoutAcknowledged),
        communicationsBlackoutTick,
        communicationsBlackoutAnimateActivation: scenarioId === 'standard-2026'
          && campaignBlackoutAcknowledged
          && blackoutAcknowledgedAtAdapterCreation.get(viewerId) !== true,
        apexFieldActivated: scenarioId !== 'standard-2026'
          || campaignHumanWarsUnlockedV2(engine.state, engine.content, viewerId)
          || legacyHumanWarHistory,
        // Derived for this adapter's viewer only. It is intentionally never
        // written into WorldStateV2 or a replicated multiplayer snapshot.
        roguePrimeTracking: selectNorthPoleModifiersV2(engine.state, viewerId).primeTracking,
      });
    },
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
      if (territoryIds.length === 0) return;
      mapStatsCadence.invalidateTerritories(territoryIds);
      mapStatsInvalidated = true;
    },
    refreshSnapshot: () => {
      const { tick, actionSequence } = engine.state;
      const humanPlayerId = engine.viewerPlayerId ?? engine.state.humanPlayerId;
      const humanPlayerRoster = [...engine.state.humanPlayerIds]
        .sort((left, right) => left.localeCompare(right)).join('|');
      const commanderRoster = Object.keys(engine.state.commanderForces ?? {})
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
        && snapshotCommanderRoster === commanderRoster
        && snapshotLifecycleSignature === lifecycleSignature
        && !mapStatsInvalidated) return;
      snapshot = materializeSnapshot();
      snapshotTick = tick;
      snapshotActionSequence = actionSequence;
      snapshotHumanPlayerId = humanPlayerId;
      snapshotHumanPlayerRoster = humanPlayerRoster;
      snapshotCommanderRoster = commanderRoster;
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
    || Boolean(state.commanderForces?.[playerId])
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
  private panelMode: PanelMode = 'war';
  private introOpen: boolean;
  private helpOpen = false;
  private soundOptionsOpen = false;
  private inboxOpen = false;
  private eventFeedOpen = false;
  private contextPanelOpen = false;
  private confirmWarTargetId?: PlayerId;
  private confirmSurrenderOpen = false;
  private surrenderResumeSpeed: WorldSpeedV2 = 1;
  private introPreviewCountryId: PlayerId;
  private introSearchQuery = '';
  private introContinent = 'ALL';
  private introSort: IntroSort = 'power';
  private introGridScrollTop = 0;
  private readonly introMetricsCache = new IntroOpeningMetricsCacheV2();
  private rankingCache?: RankingEntryV2[];
  private lastRankingCalculationAt = 0;
  private warTargetCache?: {
    humanId: PlayerId;
    tickBucket: number;
    actionSequence: number;
    warSignature: string;
    recommendations: WarTargetCandidate[];
  };
  private warLogisticsPreviewCacheEpoch = '';
  private readonly warLogisticsPreviewCache = new Map<string, WarLogisticsPreviewV2>();
  private unsubscribe?: () => void;
  private renderTimer?: number;
  private renderFrame?: number;
  private pendingMapSync = false;
  private initialMapLoaderPaintPending = false;
  private awaitingInitialMapSynchronization = false;
  private introSearchTimer?: number;
  private apexTransmissionRevealTimer?: number;
  private apexTransmissionRevealKey?: string;
  private apexTransmissionVisibleWords = 0;
  private apexTransmissionPendingResponseId?: ApexTransmissionIdV2;
  private apexTransmissionPauseKey?: string;
  private apexTransmissionResumeSpeed?: WorldSpeedV2;
  private readonly warOutcomeQueue: WarOutcomeV2[] = [];
  private warOutcomeResumeSpeed?: WorldSpeedV2;
  private suppressMapUntil = 0;
  private readonly uiPointerIds = new Set<number>();
  private readonly locallyReadEventIds = new Set<number>();
  private scrollSessions = new Map<string, number>();
  private disclosureSessions = new Map<string, boolean>();
  private scrollInteractionUntil = 0;
  private uiHoverBlocked = false;
  private readonly responsiveStyle: HTMLStyleElement;

  constructor(
    private readonly engine: WorldEngineV2UIContract,
    private readonly options: WorldUIV2Options = {},
  ) {
    const initialIntroMetrics = this.introMetricsCache.read(engine);
    const defaultPreviewId = initialIntroMetrics.ranking.find((entry) => (
      !options.availableCountryIds || options.availableCountryIds.has(entry.player.id)
    ))?.player.id ?? engine.content.nationIds[0];
    if (!defaultPreviewId) throw new Error('World UI requires at least one playable country.');
    const preferredPreviewId = options.initialPreviewCountryId
      && engine.content.nations[options.initialPreviewCountryId]
      ? options.initialPreviewCountryId
      : undefined;
    this.introPreviewCountryId = preferredPreviewId ?? defaultPreviewId;
    this.introOpen = options.introOpen ?? true;
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
      @media (max-width: 840px) {
        .world-ui-v2 .v2-topbar { grid-template-columns: minmax(125px,1fr) auto auto !important; }
        .world-ui-v2 .command-topbar .command-identity { display: flex !important; }
        .world-ui-v2 .command-topbar .top-actions { display: flex !important; }
        .world-ui-v2 .command-topbar .v2-metrics { position: absolute; top: 68px; right: 0; left: 0; height: 48px; padding: 4px; display: grid !important; grid-template-columns: repeat(5,minmax(136px,1fr)) !important; overflow-x: auto !important; overflow-y: hidden; border: 1px solid rgba(107,221,242,.12); border-radius: 9px; background: rgba(7,20,34,.94); }
        .world-ui-v2 .v2-metrics > * { min-height: 38px !important; }
        .world-ui-v2 .world-panel.command-drawer { top: 132px; }
        .world-ui-v2 .war-tracker { top: 132px; }
      }
      @media (prefers-reduced-motion: reduce) {
        .world-ui-v2 *, .world-ui-v2 *::before, .world-ui-v2 *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
      }
    `;
    document.head.append(this.responsiveStyle);
    if (engine.content.metadata?.scenarioId === 'random-world' && !preferredPreviewId) {
      this.introPreviewCountryId = initialIntroMetrics.ranking.find((entry) => (
        !options.availableCountryIds || options.availableCountryIds.has(entry.player.id)
      ))?.player.id
        ?? this.introPreviewCountryId;
    }
    this.rankingCache = initialIntroMetrics.ranking;
    this.lastRankingCalculationAt = performance.now();
    mapBridge.engine = createMapEngineAdapter(
      engine,
      () => this.ranking(),
      options.controllerNames,
      { chartedTerritoryIds: () => this.options.availableCountryIds ?? [] },
    );
    mapBridge.sync();
    mapBridge.onTerritoryClick = (territoryId) => {
      if (performance.now() >= this.suppressMapUntil) this.selectTerritory(territoryId as TerritoryId);
    };
    mapBridge.onPolarRegionClick = (region) => {
      if (performance.now() >= this.suppressMapUntil) this.selectPolarRegion(region);
    };
    mapBridge.onPolarSectorClick = (sectorId) => {
      if (performance.now() >= this.suppressMapUntil) {
        this.selectTerritory(territoryIdV2(sectorId));
        mapBridge.scene?.focusPolarSector?.(sectorId);
      }
    };
    mapBridge.onTerritoryHover = (territoryId, x, y) => this.showTooltip(territoryId as TerritoryId | undefined, x, y);
    this.unsubscribe = engine.subscribe((_state, change) => this.onStateChange(change));
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('pointerup', this.onWindowPointerRelease, true);
    window.addEventListener('pointercancel', this.onWindowPointerRelease, true);
    window.addEventListener('pointermove', this.onWindowPointerMove, true);
    this.hud.addEventListener('pointerdown', this.onHudPointerDown, true);
    this.hud.addEventListener('wheel', this.onHudScrollIntent, { capture: true, passive: true });
    this.hud.addEventListener('scroll', this.onHudScrollIntent, { capture: true, passive: true });
    this.syncApexTransmissionPause();
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
    if (this.apexTransmissionRevealTimer !== undefined) {
      window.clearTimeout(this.apexTransmissionRevealTimer);
    }
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('pointerup', this.onWindowPointerRelease, true);
    window.removeEventListener('pointercancel', this.onWindowPointerRelease, true);
    window.removeEventListener('pointermove', this.onWindowPointerMove, true);
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
      || Boolean(this.confirmWarTargetId)
      || this.confirmSurrenderOpen
      || this.warOutcomeQueue.length > 0
      || Boolean(this.pendingApexTransmission())
      || this.engine.state.gameOver;
    mapBridge.setInputBlocked(modalOpen || this.uiHoverBlocked || this.uiPointerIds.size > 0);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.pendingApexTransmission()) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    if (event.key === 'Escape' && this.confirmSurrenderOpen) {
      this.confirmSurrenderOpen = false;
      this.engine.setSpeed(this.surrenderResumeSpeed);
      this.render();
      return;
    }
    if (event.key === 'Escape' && this.soundOptionsOpen) {
      this.soundOptionsOpen = false;
      this.render();
      return;
    }
    if (this.introOpen || this.helpOpen || this.inboxOpen || this.confirmWarTargetId
      || this.confirmSurrenderOpen
      || this.warOutcomeQueue.length > 0) return;
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
        integrationCompletionToastMessageV2(
          formerCore.shortName,
          owner.shortName,
          this.engine.state.humanPlayerIds.includes(change.victorId),
        ),
        'conquest',
      );
    }
    if (change.battle) {
      mapBridge.scene?.playBattle(change.battle);
    }
    if (change.reason === 'conquest' || change.reason === 'nation-defeated'
      || change.reason === 'integration-complete') this.rankingCache = undefined;
    this.syncApexTransmissionPause();
    const highFrequency = change.reason === 'tick' || change.reason === 'battle' || change.reason === 'conquest';
    if (!highFrequency || change.reason === 'conquest') this.warTargetCache = undefined;
    if (!highFrequency) {
      this.rankingCache = undefined;
      this.scheduleRender(change.critical ? 0 : 90);
      return;
    }
    const atWar = this.humanWars().length > 0;
    this.scheduleRender(change.reason === 'conquest' ? 0 : (atWar ? 620 : 1_050));
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

  private totalCombatStrength(playerId: string): { deployed: number; capacity: number; power: number } {
    return {
      ...this.engine.totalManpower(playerId),
      power: this.engine.currentPower(playerId),
    };
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
      || this.warOutcomeQueue.length > 0) return;
    this.selectedTerritoryId = territoryId;
    this.clearPolarSelection();
    this.contextPanelOpen = true;
    this.updateMapSelection();
    this.render();
  }

  private selectPolarRegion(region: MapPolarRegion): void {
    if (this.introOpen || this.helpOpen || this.inboxOpen || this.confirmWarTargetId
      || this.warOutcomeQueue.length > 0) return;
    if (region === 'arctic') {
      this.selectedTerritoryId = undefined;
      this.clearPolarSelection();
      this.panelMode = 'research';
      this.contextPanelOpen = true;
      this.updateMapSelection();
      this.render();
      return;
    }
    this.selectedTerritoryId = undefined;
    this.selectedPolarRegion = region;
    this.contextPanelOpen = true;
    this.updateMapSelection();
    mapBridge.scene?.focusPolarRegion?.(region);
    this.render();
  }

  private clearPolarSelection(): void {
    this.selectedPolarRegion = undefined;
    mapBridge.scene?.clearPolarFocus?.();
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
    const definition = this.engine.content.territories[territoryId];
    if (!definition) return;
    const territory = this.engine.state.territories[territoryId];
    const owner = territory ? this.engine.player(territory.owner) : undefined;
    if (!territory || !owner) return;
    const integrating = territory.coreOwner !== territory.owner && territory.integration < 0.999999;
    const apexPurge = integrating && owner.isHuman
      ? selectApexSignalPurgeStatusesV2(
        this.engine.state,
        this.engine.content,
        owner.id,
      ).find((status) => status.territoryId === territoryId)
      : undefined;
    const integrationStatus = integrating
      ? `${owner.isHuman ? 'APEX ' : ''}SIGNAL PURGE ${format(territory.integration * 100)}%${apexPurge ? ` · ${apexPurge.label}` : ''}`
      : 'LIBERATED CORE';
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
      <div class="tooltip__grid"><article><span>LOCAL POWER</span><strong>${compactNumber(localPower)}</strong><small>${armyReadinessLabel(territory.army)}</small></article><article><span>ACTIVE ARMY</span><strong>${people(territory.army.manpower)}</strong><small>${people(localArmyCapacity)} local cap</small></article><article><span>COMBAT</span><strong>ATK ${format(attack, 1)} · DEF ${format(defense, 1)}</strong><small>${people(deploymentCeiling)} deployment max</small></article></div>
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

  private assignDisclosureSessionIds(): void {
    for (const [index, details] of [...this.hud.querySelectorAll<HTMLDetailsElement>('details')].entries()) {
      if (details.dataset.disclosureSession) continue;
      const summary = details.querySelector<HTMLElement>(':scope > summary');
      const authoredLabel = [...(summary?.childNodes ?? [])]
        .find((node) => node.nodeType === Node.TEXT_NODE)?.textContent?.trim();
      const label = authoredLabel || summary?.textContent?.trim() || `section-${index}`;
      const slug = label.toLocaleLowerCase('en')
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || `section-${index}`;
      const surface = details.closest<HTMLElement>('[data-scroll-session]')
        ?.dataset.scrollSession ?? 'hud';
      details.dataset.disclosureSession = `${surface}:${slug}`;
    }
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
    this.disclosureSessions = captureDisclosureSessions(
      this.hud.querySelectorAll<HTMLDetailsElement>('details[data-disclosure-session]'),
      this.disclosureSessions,
    );
    const introGrid = this.hud.querySelector<HTMLElement>('.country-grid');
    if (introGrid) this.introGridScrollTop = introGrid.scrollTop;
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
        this.assignDisclosureSessionIds();
        this.bindActions();
        restoreDisclosureSessions(
          this.hud.querySelectorAll<HTMLDetailsElement>('details[data-disclosure-session]'),
          this.disclosureSessions,
        );
        restoreScrollSessions(
          this.hud.querySelectorAll<HTMLElement>('[data-scroll-session]'),
          scrollSnapshot,
        );
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
    // This is the authoritative next-week recurring forecast.
    const displayedNet = finance.net;
    const army = humanOpening?.army ?? this.engine.armyStrength(human.id);
    const armyReadiness = armyReadinessTopbarPresentationV2(army.deployed, army.capacity);
    const combatPower = humanOpening?.combatPower ?? this.engine.currentPower(human.id);
    // Reuse the already calculated finance plan. Population dynamics otherwise
    // calculate a second full finance/power snapshot for the same render.
    const populationDynamics = humanOpening?.populationDynamics
      ?? this.engine.populationDynamics(human.id, finance.populationGrowth);
    const integratedPopulation = this.engine.controlledPopulation(human.id);
    const completedUpgrades = Object.values(human.research.breakthroughs).reduce((sum, value) => sum + value, 0);
    const ranking = introOpening?.ranking ?? this.ranking();
    const humanRank = Math.max(1, ranking.findIndex((entry) => entry.player.id === human.id) + 1);
    const unread = state.events.filter((event) => this.eventIsUnread(event) && isMajorWorldEvent(event)).length;
    const playerAlliancesVisible = this.options.scenarioConfig?.mode !== 'standard-2026';
    const activeAllianceOffer = viewer && playerAlliancesVisible
      ? state.allianceOffers.find((offer) => offer.toId === viewer.id)
      : undefined;
    const wars = this.humanWars();
    const warEstimates = new Map<string, LiveWarEstimateV2 | undefined>(wars.map((war) => (
      [war.id, this.engine.liveWarEstimate(war.id, human.id)]
    )));
    const apexForce = state.commanderForces?.[human.id];
    const apexRawPower = apexForce ? commanderForceMapCombatPower(apexForce.army) : 0;
    const apexPowerState = apexForce
      ? apexShieldTopbarPresentationV2(
          apexRawPower,
          apexForce.army.manpower,
          apexForce.army.capacity,
          apexForce.mission,
        )
      : { operationalPower: 0, integrityPercent: 0, recovering: false };
    const apexPower = apexPowerState.operationalPower;
    const combinedPower = combatPower + apexPower;
    const empirePowerShare = combinedPower > 0 ? combatPower / combinedPower : 1;
    const apexPowerShare = combinedPower > 0 ? apexPower / combinedPower : 0;
    const apexLancer = selectApexLancerPulseStatusV2(state, human.id);
    const apexTwin = selectApexTwinProjectionStatusV2(
      state, human.id, this.engine.content,
    );
    const apexCapstoneSummary = apexForce?.capabilities.assaultSpecialist
      ? ` · PULSE ${apexLancer.supportedAssaultCount}/3`
      : apexTwin.active
        ? ' · TWIN 60/60'
        : apexForce?.capabilities.defenseSpecialist ? ' · MIRROR' : '';
    const apexPowerSummary = (apexPowerState.recovering
      ? `SHIELD RECHARGING ${apexPowerState.integrityPercent}%`
      : `SHIELD ${apexPowerState.integrityPercent}%`) + apexCapstoneSummary;
    const apexStatus = selectCommanderAutonomyStatusV2(
      state, this.engine.content, human.id,
    );
    const apexDockStatus = apexStatus.state === 'absent'
      ? 'UNAVAILABLE'
      : apexStatus.state === 'moving'
        ? apexStatus.headline.replace(/^APEX\s+/, '')
        : apexStatus.state === 'rebuilding'
          ? 'RECOVERING'
          : apexStatus.state === 'supporting'
            ? 'SUPPORTING'
            : 'MONITORING';
    const logisticsReadiness = selectEmpireLogisticsReadinessV2(
      state,
      this.engine.content,
      human.id,
    );
    const logisticsDetail = logisticsReadiness.frontCount === 0
      ? 'IDLE'
      : `WEAK ${logisticsReadiness.weakest?.percent ?? logisticsReadiness.percent}% · ${logisticsReadiness.frontCount} ${logisticsReadiness.frontCount === 1 ? 'FRONT' : 'FRONTS'}`;
    const researchPortfolio = this.engine.researchPortfolio(human.id, finance);
    const nextTopbarResearch = nextResearchMilestone(researchPortfolio);
    const activePolarResearch = state.polarEndgame.arcticPrograms[human.id]?.activeProject;
    const activePolarDefinition = activePolarResearch
      ? ARCTIC_PROJECTS_V2.find((project) => project.id === activePolarResearch.projectId)
      : undefined;
    const activePolarTerms = activePolarResearch
      ? this.engine.arcticProjectTerms(human.id, activePolarResearch.projectId)
      : undefined;
    const topbarResearchProgress = activePolarTerms
      ? Math.round(clamp(activePolarTerms.progress, 0, 1) * 100)
      : nextTopbarResearch
        ? Math.round(clamp(nextTopbarResearch.progressRatio, 0, 1) * 100)
        : 100;
    const topbarResearchLabel = activePolarDefinition?.name
      ?? (nextTopbarResearch ? RESEARCH_META[nextTopbarResearch.branch].shortLabel : 'All programs complete');
    const warOutcome = this.warOutcomeQueue[0];
    const apexTransmission = !warOutcome ? this.pendingApexTransmission() : undefined;
    const commandOpen = this.contextPanelOpen && !this.selectedTerritoryId && !this.selectedPolarRegion;
    if (this.introOpen || this.helpOpen || this.inboxOpen || this.confirmWarTargetId
      || this.confirmSurrenderOpen
      || warOutcome || apexTransmission || state.gameOver) {
      this.tooltip.classList.remove('is-visible');
    }

    this.hud.innerHTML = `
      <header class="situation-topbar command-topbar glass-panel v2-topbar v2-interactive simple-topbar unified-topbar">
        <div class="coalition-chip command-identity" style="--coalition:${human.cssColor}">
          <span class="country-flag" aria-hidden="true">${countryFlagHtml(human.id, human.sigil, true)}</span><div class="coalition-chip__body"><small><time>${worldDateLabel(state.tick, this.engine.content.metadata?.startYear ?? 2026)}</time>${wars.length ? `<b class="topbar-war-alert">${wars.length === 1 ? 'WAR ACTIVE' : `${wars.length} WARS ACTIVE`}</b>` : ''}</small><div class="command-identity__line"><strong title="${escapeHtml(human.name)}">${escapeHtml(human.shortName)}</strong><button class="v2-rank-badge" data-action="ranking" aria-label="Open global military ranking; ${escapeHtml(human.name)} is military rank ${humanRank} of ${ranking.length} active countries">#${humanRank}/${ranking.length}</button></div></div>
        </div>
        <nav class="strategic-metrics v2-metrics simple-metrics topbar-status" aria-label="Command status">
          <button type="button" class="top-metric top-metric--economy" data-action="panel" data-panel="economy" title="Empire output, shared cash and annual growth; APEX income is included" aria-label="Open Economy. Empire output ${cash(economy.controlledOutput)}; shared treasury ${cash(human.treasury)}; projected net cashflow ${signedCash(annual(displayedNet))} per year including APEX income; annual growth ${signed(finance.annualEconomyGrowthRate * 100, 2)} percent"><span>ECONOMY</span><strong>${cash(economy.controlledOutput)}<i class="${finance.annualEconomyGrowthRate >= 0 ? 'is-positive' : 'is-negative'}">${signed(finance.annualEconomyGrowthRate * 100, 2)}%</i></strong><small><span>CASH ${cash(human.treasury)}</span><b class="${displayedNet >= 0 ? 'is-positive' : 'is-negative'}">${signedCash(annual(displayedNet))}/YR</b></small></button>
          <button type="button" class="top-metric top-metric--combined-power ${wars.length ? 'has-war' : ''}" data-action="panel" data-panel="war" title="Combined national power and the active APEX neural shield" aria-label="Open War. Available Combined Power ${compactNumber(combinedPower)}; Empire ${compactNumber(combatPower)}, ${Math.round(empirePowerShare * 100)} percent; ${apexPowerState.recovering ? `APEX shield recharging at ${apexPowerState.integrityPercent} percent and unavailable` : `APEX shield integrity ${apexPowerState.integrityPercent} percent, contributing ${compactNumber(apexPower)} power`}; army ready ${armyReadiness.percent} percent, ${armyReadiness.status.toLowerCase()}; trained reserves ${people(human.trainedReserves)}"><span>COMBINED POWER</span><strong>${compactNumber(combinedPower)}<i class="topbar-army-ready ${armyReadiness.className}">${armyReadiness.value} READY</i></strong><i class="topbar-power-share" role="img" aria-label="Empire ${Math.round(empirePowerShare * 100)} percent; ${apexPowerState.recovering ? `APEX shield recharging ${apexPowerState.integrityPercent} percent` : `APEX shield ${Math.round(apexPowerShare * 100)} percent of available power`}"><b style="width:${format(empirePowerShare * 100, 2)}%"></b><em style="width:${format(apexPowerShare * 100, 2)}%"></em></i><small>EMPIRE ${compactNumber(combatPower)} · ${apexPowerSummary} · ${people(human.trainedReserves)} RESERVE</small></button>
          <button type="button" class="top-metric top-metric--population" data-action="panel" data-panel="nation" title="Integrated population and annual change" aria-label="Open Nation. Integrated population ${format(integratedPopulation, 2)} million; annual change ${signed(populationDynamics.annualNetRate * 100, 2)} percent"><span>POPULATION</span><strong>${population(integratedPopulation)}<i class="${populationDynamics.annualNetRate >= 0 ? 'is-positive' : 'is-negative'}">${signed(populationDynamics.annualNetRate * 100, 2)}%</i></strong></button>
          <button type="button" class="top-metric top-metric--logistics is-${logisticsReadiness.status}" data-action="panel" data-panel="war" title="Military route readiness across active fronts" aria-label="Open War. Logistics Readiness ${logisticsReadiness.percent} percent, ${logisticsReadiness.statusLabel.toLowerCase()}. ${escapeHtml(logisticsDetail)}"><span>LOGISTICS</span><strong>${logisticsReadiness.percent}%<i>${logisticsReadiness.statusLabel}</i></strong><i class="topbar-progress-bar" role="progressbar" aria-label="Logistics readiness" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${logisticsReadiness.percent}"><b style="width:${logisticsReadiness.percent}%"></b></i></button>
          <button type="button" class="top-metric top-metric--research" data-action="panel" data-panel="research" title="Active research and progress" aria-label="Open Research. ${escapeHtml(topbarResearchLabel)}, ${topbarResearchProgress} percent complete"><span>RESEARCH</span><strong>${topbarResearchProgress}%</strong><i class="topbar-progress-bar" role="progressbar" aria-label="Research progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${topbarResearchProgress}"><b style="width:${topbarResearchProgress}%"></b></i><small>${escapeHtml(topbarResearchLabel)}</small></button>
        </nav>
        <div class="top-actions">
          ${this.options.onSurrenderRequested && !this.introOpen && !spectating && !state.gameOver
            ? '<button class="icon-button surrender-button" data-action="open-surrender" title="End timeline" aria-label="End timeline">⚑</button>'
            : ''}
          <button class="icon-button inbox-button ${unread ? 'has-alert' : ''}" data-action="inbox" title="Reports">⌁${unread ? `<i>${unread}</i>` : ''}</button>
          <button type="button" class="icon-button sound-options-button ${this.soundOptionsOpen ? 'is-active' : ''}" data-action="sound-options" aria-label="Sound options" aria-expanded="${this.soundOptionsOpen}" title="Sound options">♪</button>
          <button class="icon-button" data-action="camera-reset" title="Center map">⌖</button>
          <button class="icon-button" data-action="help" title="Help">?</button>
        </div>
      </header>

      ${this.soundOptionsOpen ? this.renderSoundOptions() : ''}

      ${!spectating ? `<nav class="command-dock glass-panel" aria-label="Command center">
        <button class="${commandOpen && this.panelMode === 'war' ? 'is-active' : ''} ${wars.length ? 'has-war' : ''}" data-action="panel" data-panel="war"><i>⚔</i><span><b>WAR</b><small>${wars.length ? `${wars.length} active` : 'Choose target'}</small></span></button>
        <button class="${commandOpen && this.panelMode === 'commander' ? 'is-active' : ''}" data-action="panel" data-panel="commander"><i>◆</i><span><b>APEX</b><small>AUTO · ${escapeHtml(apexDockStatus)}</small></span></button>
        <button class="${commandOpen && this.panelMode === 'nation' ? 'is-active' : ''}" data-action="panel" data-panel="nation"><i>◇</i><span><b>NATION</b><small>AI · ${escapeHtml(finance.aiMode)}</small></span></button>
        <button class="${commandOpen && this.panelMode === 'research' ? 'is-active' : ''}" data-action="panel" data-panel="research"><i>⌁</i><span><b>RESEARCH</b><small>${completedUpgrades} upgrades</small></span></button>
        <button class="${commandOpen && this.panelMode === 'economy' ? 'is-active' : ''} ${displayedNet < 0 ? 'is-negative' : ''}" data-action="panel" data-panel="economy"><i>$</i><span><b>ECONOMY</b><small>${signed(finance.annualEconomyGrowthRate * 100, 2)}%/yr</small></span></button>
      </nav>` : ''}
      ${!warOutcome && !spectating && !state.gameOver && !this.introOpen
        ? this.renderApexTransmissionOverlay(human) : ''}

      ${wars.length ? this.renderWarTracker(wars, finance, warEstimates) : ''}
      ${this.contextPanelOpen && !spectating ? this.renderContextPanel(human, economy, finance, populationDynamics, wars, logisticsReadiness, warEstimates) : ''}
      ${activeAllianceOffer ? this.renderAllianceOfferBanner(activeAllianceOffer) : ''}
      ${!warOutcome && introOpening ? this.renderIntro(introOpening) : ''}
      ${!warOutcome && !apexTransmission && this.helpOpen ? this.renderHelp() : ''}
      ${!warOutcome && !apexTransmission && this.inboxOpen ? this.renderInbox() : ''}
      ${!warOutcome && !apexTransmission && this.confirmWarTargetId ? this.renderWarConfirmation(this.confirmWarTargetId) : ''}
      ${!warOutcome && !apexTransmission && this.confirmSurrenderOpen ? this.renderSurrenderConfirmation(human) : ''}
      ${warOutcome ? this.renderWarOutcome(warOutcome) : ''}
      ${!warOutcome && state.gameOver ? this.renderGameOver() : ''}
      ${!warOutcome && !state.gameOver && !viewer ? this.renderSpectatorBanner(viewerId, human) : ''}
    `;
    this.assignDisclosureSessionIds();
    this.bindActions();
    restoreDisclosureSessions(
      this.hud.querySelectorAll<HTMLDetailsElement>('details[data-disclosure-session]'),
      this.disclosureSessions,
    );
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
    if (!this.confirmWarTargetId) this.updateMapSelection();
    this.syncMapInputBlock();
  }

  private renderContextPanel(
    human: NationViewV2,
    economy: NationalEconomyV2,
    finance: WeeklyFinanceBreakdownV2,
    populationDynamics: PopulationDynamicsV2,
    wars: WarStateV2[],
    logisticsReadiness: EmpireLogisticsReadinessV2,
    warEstimates: ReadonlyMap<string, LiveWarEstimateV2 | undefined>,
  ): string {
    const territory = this.selectedTerritoryId ? this.engine.state.territories[this.selectedTerritoryId] : undefined;
    if (territory && this.selectedTerritoryId) {
      return this.renderTerritoryPanel(this.selectedTerritoryId, territory, economy, finance);
    }
    if (this.selectedPolarRegion === 'arctic') return this.renderResearchPanel(human, finance);
    if (this.selectedPolarRegion === 'antarctica') return this.renderAntarcticaPanel(human);
    if (this.panelMode === 'ranking') return this.renderRankingPanel();
    if (this.panelMode === 'commander') return this.renderCommanderPanel(human);
    if (this.panelMode === 'economy') return this.renderEconomyPanel(human, economy, finance);
    if (this.panelMode === 'research') return this.renderResearchPanel(human, finance);
    if (this.panelMode === 'nation') {
      return this.renderNationPanel(human, economy, finance, populationDynamics);
    }
    return this.renderWarPanel(human, economy, finance, wars, logisticsReadiness, warEstimates);
  }

  private renderCommanderPanel(human: NationViewV2): string {
    const state = this.engine.state;
    const force = state.commanderForces?.[human.id];
    if (!force) {
      return `<aside class="world-panel command-drawer glass-panel commander-control is-unavailable"><button class="panel-close" data-action="close-panel" aria-label="Close APEX status">×</button><div class="drawer-heading"><div><span class="panel-kicker">LOYAL STRATEGIC INTELLIGENCE</span><h2>APEX</h2></div><strong>OFFLINE</strong></div><section class="commander-control__empty"><b>This legacy timeline has no APEX shield.</b><p>Start a new Campaign or Survival run to initialise its autonomous neural defence network.</p></section></aside>`;
    }

    const territoryName = (territoryId: TerritoryId): string => (
      this.engine.content.territories[territoryId]?.name ?? String(territoryId)
    );
    const missionLabels: Record<CommanderMissionV2, string> = {
      standby: 'Standing by',
      'assault-support': 'Assault support',
      defense: 'Front defence',
      'logistics-relief': 'Logistics relief',
      evacuate: 'Emergency evacuation',
      'hq-training': 'Shield recharging',
    };
    const transit = force.transit;
    const autonomy = selectCommanderAutonomyStatusV2(
      state, this.engine.content, human.id,
    );
    const destinationId = transit?.path[transit.path.length - 1] ?? force.locationId;
    const travelRemaining = transit ? Math.max(0, transit.arriveTick - state.tick) : 0;
    const activeFill = force.army.capacity > 0
      ? force.army.manpower / force.army.capacity * 100 : 0;
    const domePower = commanderForceMapCombatPower(force.army);
    const supplyReadiness = force.army.manpower > 0
      ? clamp(force.economy.supplyStock / Math.max(0.001, force.army.manpower * 4), 0, 1) * 100
      : 100;
    const shieldComparison = commanderEliteComparisonForRatingsV2(
      this.engine.content, force.army.baseAttack, force.army.baseDefense,
    );
    const finance = this.engine.weeklyFinanceBreakdown(human.id);

    const primaryFrontName = force.front
      ? `${territoryName(force.front.sourceId)} → ${territoryName(force.front.targetId)}`
      : 'No active support front';
    const lancer = selectApexLancerPulseStatusV2(state, human.id);
    const twin = selectApexTwinProjectionStatusV2(
      state, human.id, this.engine.content,
    );
    const twinFrontName = twin.secondaryProjection
      ? `${territoryName(twin.secondaryProjection.front.sourceId)} → ${territoryName(twin.secondaryProjection.front.targetId)}`
      : null;
    const frontName = twin.active && twinFrontName
      ? `${primaryFrontName} · TWIN ${twinFrontName}`
      : primaryFrontName;
    const capstoneLabels: string[] = [];
    if (force.capabilities.assaultSpecialist) {
      capstoneLabels.push(`SINGULARITY ${lancer.supportedAssaultCount}/3${lancer.nextPulseCharged ? ' · NEXT PULSE CHARGED' : ''}`);
    }
    if (force.capabilities.defenseSpecialist) {
      capstoneLabels.push('MIRROR MATRIX · 20% INTERCEPT RETURN');
    }
    if (force.capabilities.rapidResponse) {
      capstoneLabels.push(twin.active
        ? 'TWIN SPLIT · 60% + 60% · ONE SHARED SHIELD'
        : 'TWIN PROJECTION READY');
    }
    const capstoneSummary = capstoneLabels.join(' · ');
    const maxIntegrityRating = force.army.capacity > 0
      ? force.army.capacity / 0.0008 * 100 : 0;
    const recovering = autonomy.state === 'rebuilding'
      || force.mission === 'hq-training'
      || force.mission === 'evacuate';
    const location = transit
      ? `${territoryName(force.locationId)} → ${territoryName(destinationId)}`
      : territoryName(force.locationId);
    const networkStatus = recovering ? 'RECOVERING'
      : transit ? 'IN TRANSIT'
        : twin.active ? 'TWIN SPLIT'
          : force.front ? 'SUPPORTING' : 'MONITORING';
    return `<aside class="world-panel command-drawer glass-panel command-drawer--clean command-drawer--unified command-drawer--decision commander-control" data-scroll-session="${drawerScrollSessionId('commander')}">
      <button class="panel-close" data-action="close-panel" aria-label="Close APEX status">×</button>
      <div class="drawer-heading drawer-heading--single"><div><h2>APEX</h2></div><strong class="${recovering ? 'is-warning' : 'is-positive'}">AUTO · ${escapeHtml(networkStatus)}</strong></div>
      <section class="commander-control__hero ${recovering ? 'is-recovering' : ''}"><div class="commander-control__crest" aria-hidden="true">⌁<i></i></div><div><span>${escapeHtml(location.toUpperCase())}</span><strong>${compactNumber(domePower)} DOME POWER</strong><small>${transit ? `${compactWarTime(travelRemaining)} · ` : ''}${escapeHtml(autonomy.headline.replace(/^APEX\s+/, '') || missionLabels[force.mission])}${capstoneSummary ? ` · ${escapeHtml(capstoneSummary)}` : ''}</small></div></section>
      <section class="commander-control__metrics commander-control__metrics--decision" aria-label="APEX neural shield status"><article><span>SHIELD INTEGRITY</span><b>${format(activeFill, 0)}%</b><small>MAX INTEGRITY ${format(maxIntegrityRating, 0)}% · ${recovering ? 'Offline until fully charged' : 'Active neural dome'}</small></article><article class="is-elite"><span>DOME ATK / DEF</span><b>${format(shieldComparison.attack, 2)} / ${format(shieldComparison.defense, 2)}</b><small>${format(shieldComparison.attackRatio, 1)}× / ${format(shieldComparison.defenseRatio, 1)}× nation avg</small></article><article><span>ENERGY</span><b>${supplyReadiness >= 99.5 ? 'CHARGED' : `${format(supplyReadiness, 0)}%`}</b><small>Strike and interception reserve</small></article><article class="is-good"><span>EMPIRE CONTRIBUTION</span><b>+${cash(annual(finance.apexContribution))}/YR</b><small>Autonomous network output</small></article><article class="${force.front && !recovering ? 'is-power' : ''}"><span>NETWORK SUPPORT</span><b>${escapeHtml(networkStatus)}</b><small>${escapeHtml(recovering ? autonomy.reason : frontName)}</small></article></section>
    </aside>`;
  }

  /** The first unresolved briefing is canonical state; reveal timing is presentation-only. */
  private pendingApexTransmission(): ApexTransmissionV2 | undefined {
    const transmissions = this.engine.apexTransmissions(this.viewerPlayerId());
    if (this.apexTransmissionPendingResponseId) {
      const responding = transmissions.find((item) => (
        item.id === this.apexTransmissionPendingResponseId
      ));
      if (!responding || responding.choice !== null) {
        this.apexTransmissionPendingResponseId = undefined;
      }
    }
    const unresolved = transmissions.filter((item) => (
      item.choice === null && item.id !== this.apexTransmissionPendingResponseId
    ));
    return unresolved.find((item) => item.id === 'campaign-signal-anomaly') ?? unresolved[0];
  }

  /** A local APEX briefing is a real pause; multiplayer can never be globally blocked. */
  private syncApexTransmissionPause(): void {
    if (this.options.multiplayer) return;
    const pending = this.pendingApexTransmission();
    if (pending) {
      const key = `${pending.playerId}:${pending.id}:${pending.sentTick}`;
      if (this.apexTransmissionResumeSpeed === undefined) {
        this.apexTransmissionResumeSpeed = this.engine.state.speed === 0
          ? this.warOutcomeResumeSpeed ?? 0
          : this.engine.state.speed;
      }
      this.apexTransmissionPauseKey = key;
      if (this.engine.state.speed !== 0) this.engine.setSpeed(0);
      return;
    }
    if (this.apexTransmissionPauseKey === undefined) return;
    this.apexTransmissionPauseKey = undefined;
    const resumeSpeed = this.apexTransmissionResumeSpeed;
    this.apexTransmissionResumeSpeed = undefined;
    const anotherPauseOwnsTheClock = this.warOutcomeQueue.length > 0
      || this.confirmSurrenderOpen;
    if (resumeSpeed !== undefined
      && !anotherPauseOwnsTheClock
      && !this.engine.state.gameOver
      && this.engine.state.speed !== resumeSpeed) {
      this.engine.setSpeed(resumeSpeed);
    }
  }

  private transmissionRevealWords(transmission: ApexTransmissionV2): string[] {
    return transmission.body.trim().split(/\s+/).filter(Boolean);
  }

  private prepareApexTransmissionReveal(transmission: ApexTransmissionV2): {
    readonly key: string;
    readonly words: readonly string[];
    readonly complete: boolean;
  } {
    const key = `${transmission.playerId}:${transmission.id}:${transmission.sentTick}`;
    const words = this.transmissionRevealWords(transmission);
    if (this.apexTransmissionRevealKey !== key) {
      if (this.apexTransmissionRevealTimer !== undefined) {
        window.clearTimeout(this.apexTransmissionRevealTimer);
        this.apexTransmissionRevealTimer = undefined;
      }
      this.apexTransmissionRevealKey = key;
      const reducedMotion = typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.apexTransmissionVisibleWords = reducedMotion ? words.length : Math.min(1, words.length);
    }
    return {
      key,
      words,
      complete: this.apexTransmissionVisibleWords >= words.length,
    };
  }

  private updateApexTransmissionRevealDom(
    key: string,
    words: readonly string[],
  ): void {
    const panel = this.hud.querySelector<HTMLElement>('.apex-transmission-channel');
    if (!panel || panel.dataset.revealKey !== key) return;
    panel.querySelector<HTMLElement>('.apex-transmission__copy')!.textContent = words
      .slice(0, this.apexTransmissionVisibleWords).join(' ');
    const complete = this.apexTransmissionVisibleWords >= words.length;
    panel.classList.toggle('is-revealing', !complete);
    panel.querySelector<HTMLElement>('.apex-transmission__cursor')!.hidden = complete;
    const actions = panel.querySelector<HTMLElement>('.apex-transmission__actions')!;
    actions.hidden = !complete;
    if (complete && !panel.contains(document.activeElement)) {
      actions.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    }
  }

  private scheduleApexTransmissionReveal(): void {
    if (this.apexTransmissionRevealTimer !== undefined) return;
    const transmission = this.pendingApexTransmission();
    if (!transmission) return;
    const { key, words, complete } = this.prepareApexTransmissionReveal(transmission);
    if (complete) return;
    this.apexTransmissionRevealTimer = window.setTimeout(() => {
      this.apexTransmissionRevealTimer = undefined;
      if (this.apexTransmissionRevealKey !== key) return;
      // Long briefings advance in small word groups. This keeps the terminal-like
      // rhythm while avoiding dozens of unnecessary layout passes.
      const revealStep = words.length > 48 ? 3 : words.length > 24 ? 2 : 1;
      this.apexTransmissionVisibleWords = Math.min(
        words.length,
        this.apexTransmissionVisibleWords + revealStep,
      );
      this.updateApexTransmissionRevealDom(key, words);
      this.scheduleApexTransmissionReveal();
    }, 34);
  }

  private completeApexTransmissionReveal(): void {
    const transmission = this.pendingApexTransmission();
    if (!transmission) return;
    const { key, words } = this.prepareApexTransmissionReveal(transmission);
    if (this.apexTransmissionRevealTimer !== undefined) {
      window.clearTimeout(this.apexTransmissionRevealTimer);
      this.apexTransmissionRevealTimer = undefined;
    }
    this.apexTransmissionVisibleWords = words.length;
    this.updateApexTransmissionRevealDom(key, words);
  }

  private renderApexTransmissionOverlay(human: NationViewV2): string {
    const transmission = this.pendingApexTransmission();
    if (!transmission || transmission.playerId !== human.id) return '';
    const { key, words, complete } = this.prepareApexTransmissionReveal(transmission);
    const visibleCopy = words.slice(0, this.apexTransmissionVisibleWords).join(' ');
    const mandatory = transmission.action === 'north-pole-investigation';
    const firstStrike = transmission.action === 'first-strike-guidance';
    const context = mandatory
      ? 'TUTORIAL · REQUIRED TO CONTINUE'
      : firstStrike ? 'FIRST OPERATION READY' : 'SITUATION UPDATE';
    const objective = mandatory
      ? 'Start the required APEX analysis'
      : firstStrike
        ? 'Review and approve your first attack'
        : transmission.id === 'campaign-first-war-recovery'
          ? 'Research and choose your next target'
          : 'Read this APEX situation update';
    const action = mandatory
      ? `<button class="primary-button apex-transmission__required-action" data-action="respond-apex-transmission" data-transmission="${transmission.id}" data-choice="accept" aria-label="Required: start APEX analysis">START ANALYSIS <span aria-hidden="true">→</span></button>`
      : `<button class="primary-button" data-action="respond-apex-transmission" data-transmission="${transmission.id}" data-choice="acknowledge">${firstStrike ? 'SELECT FIRST TARGET' : 'ACKNOWLEDGE'}</button>`;
    return `<div class="apex-transmission-backdrop" data-action="complete-apex-transmission">
      <section class="apex-transmission-channel glass-panel${complete ? '' : ' is-revealing'}${mandatory ? ' is-required' : ''}" role="dialog" aria-modal="true" aria-labelledby="apex-transmission-title" aria-describedby="apex-transmission-full-copy" tabindex="-1" data-reveal-key="${escapeHtml(key)}">
        <div class="apex-transmission__signal" aria-hidden="true">
          <svg viewBox="0 0 160 96" focusable="false"><path d="M4 52h22l9-25 15 49 13-34 11 20 11-10h18l8-30 14 57 12-35 9 8h10"/><path d="M9 18l23 8 18-13 23 12 24-14 24 15 28-10"/><rect x="30" y="22" width="7" height="7" transform="rotate(45 33.5 25.5)"/><rect x="93" y="8" width="7" height="7" transform="rotate(45 96.5 11.5)"/><rect x="118" y="23" width="7" height="7" transform="rotate(45 121.5 26.5)"/></svg>
          <b>APEX</b><span>ALLIED STRATEGIC AI</span>
        </div>
        <div class="apex-transmission__message">
          <header><span>SECURE ALLIED CHANNEL · WEEK ${transmission.sentTick}</span><b><i></i> APEX LIVE</b></header>
          <small class="apex-transmission__context">${context}</small>
          <h2 id="apex-transmission-title">${escapeHtml(transmission.title)}</h2>
          <p class="apex-transmission__visible-copy" aria-hidden="true"><span class="apex-transmission__copy">${escapeHtml(visibleCopy)}</span><i class="apex-transmission__cursor"${complete ? ' hidden' : ''}>▋</i></p>
          <p id="apex-transmission-full-copy" class="apex-transmission__sr-copy">${escapeHtml(transmission.body)}</p>
          <footer class="apex-transmission__actions"${complete ? '' : ' hidden'}><div class="apex-transmission__objective"><span>${mandatory ? 'GAME PAUSED · REQUIRED' : 'CURRENT OBJECTIVE'}</span><strong>${escapeHtml(objective)}</strong></div>${action}</footer>
        </div>
      </section>
    </div>`;
  }

  private renderSoundOptions(): string {
    const mix = worldGameAudio.getAudioMix();
    const control = (channel: GameAudioChannel, label: string, detail: string): string => {
      const percent = Math.round(mix[channel] * 100);
      return `<label><span><b>${label}</b><small>${detail}</small></span><input type="range" min="0" max="100" step="1" value="${percent}" data-audio-channel="${channel}" aria-label="${label} volume" aria-valuetext="${percent} percent"><output>${percent}%</output></label>`;
    };
    return `<aside class="sound-options glass-panel" aria-labelledby="sound-options-title"><header><h2 id="sound-options-title">Sound</h2><button type="button" data-action="sound-options" aria-label="Close sound options">×</button></header>${control('music', 'Music', 'Ambient soundtrack')}${control('effects', 'Effects', 'Battles and impacts')}${control('voice', 'Voice', 'Radio command cues')}</aside>`;
  }

  private renderPolarResearchItem(human: NationViewV2): string {
    const polar = this.engine.state.polarEndgame;
    const program = polar.arcticPrograms[human.id];
    const completed = program?.completedProjects.length ?? 0;
    if (completed >= ARCTIC_PROJECTS_V2.length) return '';
    const entries = ARCTIC_PROJECTS_V2.map((project, index) => ({
      project,
      index,
      terms: this.engine.arcticProjectTerms(human.id, project.id),
    }));
    const focus = entries.find(({ terms }) => terms.status === 'active')
      ?? entries.find(({ terms }) => terms.status !== 'complete')
      ?? entries.at(-1);
    if (!focus) return '';
    const { project, index, terms } = focus;
    const progress = terms.status === 'complete' ? 100
      : Math.round(clamp(terms.progress, 0, 1) * 100);
    const remaining = terms.status === 'active'
      ? Math.max(0, (terms.completesTick ?? this.engine.state.tick) - this.engine.state.tick)
      : terms.durationTicks;
    const stage = index + 1;
    const effect = project.benefits.join(' · ');
    const canStart = terms.status === 'available' && terms.allowed;
    const status = terms.status === 'active' ? `${compactWarTime(remaining)} REMAINING`
      : terms.status === 'complete' ? 'PROGRAM COMPLETE'
        : terms.status === 'available' ? `${cash(terms.cost)} · ${compactWarTime(terms.durationTicks)}`
          : 'LOCKED';
    const action = terms.status === 'complete' ? ''
      : `<button class="${canStart ? 'primary-button' : 'ghost-button'}" data-action="start-arctic-project" data-project="${project.id}" ${canStart ? '' : 'disabled'} title="${escapeHtml(terms.reason ?? (terms.status === 'active' ? 'Analysis is already running.' : 'Complete the previous stage first.'))}">${terms.status === 'active' ? `${progress}% ACTIVE` : terms.status === 'available' ? `START ANALYSIS · ${cash(terms.cost)}` : 'PREVIOUS STAGE REQUIRED'}</button>`;
    return `<section class="research-next-card research-next-card--polar${completed === 0 && terms.status === 'available' ? ' is-highlighted' : ''}" style="--project:#55d8ef" aria-label="APEX signal analysis stage ${stage} of ${ARCTIC_PROJECTS_V2.length}: ${escapeHtml(project.name)}">
      <div><span>APEX SIGNAL ANALYSIS · STAGE ${stage}/${ARCTIC_PROJECTS_V2.length}</span><strong>${escapeHtml(project.name)}</strong><b>${escapeHtml(status)}</b></div>
      <i role="progressbar" aria-label="${escapeHtml(project.name)} progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><b style="width:${progress}%"></b></i>
      <strong class="research-next-effect">${escapeHtml(effect)}</strong>
      <small>${terms.status === 'active' ? `${progress}% complete · ${compactWarTime(remaining)} remaining` : terms.status === 'complete' ? 'Effects active.' : escapeHtml(terms.reason ?? `${cash(terms.cost)} · ${compactWarTime(terms.durationTicks)}`)}</small>
      ${action}
    </section>`;
  }

  private renderPolarCompletedEffects(human: NationViewV2): string {
    const completedIds = new Set(
      this.engine.state.polarEndgame.arcticPrograms[human.id]?.completedProjects ?? [],
    );
    if (completedIds.size === 0) return '';
    const modifiers = selectNorthPoleModifiersV2(this.engine.state, human.id);
    const effects: string[] = [];
    const addMultiplier = (label: string, multiplier: number): void => {
      const percent = (multiplier - 1) * 100;
      if (Math.abs(percent) > 0.0001) effects.push(`${label} +${format(percent, 2)}%`);
    };
    addMultiplier('Research', modifiers.researchOutputMultiplier);
    addMultiplier('Supply', modifiers.supplyThroughputMultiplier);
    const purgeSpeed = (1 - modifiers.signalPurgeDurationMultiplier) * 100;
    if (purgeSpeed > 0.0001) effects.push(`Signal Purge ${format(purgeSpeed, 0)}% faster`);
    addMultiplier('Recovery', modifiers.recoveryMultiplier);
    addMultiplier('Rogue ATK', modifiers.attackVsRogueMultiplier);
    addMultiplier('Rogue DEF', modifiers.defenseVsRogueMultiplier);
    addMultiplier('Antarctic supply', modifiers.antarcticSupplyMultiplier);
    addMultiplier('Antarctic power', modifiers.antarcticOperationMultiplier);
    if (modifiers.rogueWarningLeadTicks > 0) {
      effects.push(`Warning +${modifiers.rogueWarningLeadTicks} week`);
    }
    if (modifiers.primeTracking) effects.push('ROGUE PRIME tracking');
    return `<article class="research-effect-card research-effect-card--signal" aria-label="North Pole network, ${completedIds.size} of ${ARCTIC_PROJECTS_V2.length} stages complete"><i aria-hidden="true">⌁</i><div><span>NORTH POLE NETWORK · ${completedIds.size}/${ARCTIC_PROJECTS_V2.length}</span><strong>${escapeHtml(effects.join(' · '))}</strong></div><small>ACTIVE</small></article>`;
  }

  private renderAntarcticaGatewayCard(): string {
    const polar = this.engine.state.polarEndgame;
    const attention = polar.rogueAttention;
    const revealed = polar.warningTick !== null
      || !['disabled', 'dormant'].includes(attention.stage);
    const rogueId = this.engine.content.nationIds.find((id) => this.engine.content.nations[id]?.kind === 'rogue-ai');
    const machineTerritories = ANTARCTIC_SECTORS_V2.filter((sector) => (
      rogueId && this.engine.state.territories[territoryIdV2(sector.id)]?.owner === rogueId
    )).length;
    const share = format(attention.liberatedWorldShare * 100, 1);
    const timeGate = Math.max(0, ROGUE_ATTENTION_MIN_CAMPAIGN_TICK_V2 - this.engine.state.tick);
    const detail = attention.stage === 'dormant'
      ? `${share}% / ${format(ROGUE_ATTENTION_LIBERATED_WORLD_SHARE_V2 * 100, 0)}% world liberated · minimum time ${timeGate > 0 ? compactWarTime(timeGate) : 'met'}`
      : attention.stage === 'active'
        ? `${machineTerritories}/${ANTARCTIC_SECTORS_V2.length} Antarctic sectors held · wave ${polar.globalWave}`
        : `${attention.stage.replace('-', ' ').toUpperCase()} · ${attention.nextStageTick === null ? 'ETA pending' : `${compactWarTime(Math.max(0, attention.nextStageTick - this.engine.state.tick))} to escalation`}`;
    return `<section class="polar-gateway-card polar-gateway-card--antarctica ${revealed ? 'is-live' : 'is-locked'}" aria-label="Rogue AI attention and Antarctic gateway"><div><span>ROGUE ATTENTION · ${escapeHtml(attention.stage.toUpperCase())}</span><strong>${revealed ? 'ANTARCTIC ORIGIN' : 'SIGNAL ENCRYPTED'}</strong><small>${escapeHtml(detail)}</small></div><button class="secondary-button" data-action="open-polar-region" data-polar-region="antarctica">${revealed ? 'OPEN INTELLIGENCE' : 'VIEW ATTENTION'}</button></section>`;
  }

  private renderAntarcticaPanel(human: NationViewV2): string {
    const state = this.engine.state;
    const polar = state.polarEndgame;
    const attention = polar.rogueAttention;
    const intelligenceKnown = polar.warningTick !== null
      || !['disabled', 'dormant'].includes(attention.stage);
    if (!intelligenceKnown) {
      const share = attention.liberatedWorldShare * 100;
      const timeRemaining = Math.max(0, ROGUE_ATTENTION_MIN_CAMPAIGN_TICK_V2 - state.tick);
      return `<aside class="world-panel command-drawer glass-panel command-drawer--clean command-drawer--unified polar-command polar-command--antarctica is-locked" data-scroll-session="${drawerScrollSessionId('polar:antarctica')}"><button class="panel-close" data-action="close-panel" aria-label="Close Antarctica intelligence">×</button><div class="drawer-heading drawer-heading--compact drawer-heading--single"><div><h2>Rogue Attention</h2></div><strong>DORMANT</strong></div><section class="polar-hero polar-hero--locked"><div><span>CAMPAIGN BENCHMARK</span><strong>${format(share, 1)}% / ${format(ROGUE_ATTENTION_LIBERATED_WORLD_SHARE_V2 * 100, 0)}% world liberated</strong><small>Earliest response: ${timeRemaining > 0 ? `${compactWarTime(timeRemaining)} from now` : 'time requirement met'}. Both conditions start a 78-week buildup, never an instant attack.</small></div><b>${format(share, 0)}%</b></section></aside>`;
    }
    const rogueId = this.engine.content.nationIds.find((id) => (
      this.engine.content.nations[id]?.kind === 'rogue-ai'
    ));
    const rogue = rogueId ? this.engine.player(rogueId) : undefined;
    const antarcticIds = new Set(ANTARCTIC_SECTORS_V2.map((sector) => String(sector.id)));
    const rogueTerritories = rogueId
      ? (Object.entries(state.territories) as Array<[TerritoryId, TerritoryStateV2]>)
        .filter(([, territory]) => territory.owner === rogueId)
      : [];
    const occupiedWorld = rogueTerritories.filter(([id]) => !antarcticIds.has(String(id))).length;
    const activeWars = rogueId ? state.wars.filter((war) => (
      war.attackerId === rogueId || war.defenderId === rogueId
    )) : [];
    const rogueLogistics = rogueId ? selectRogueLogisticsTelemetryV2(
      state,
      this.engine.content,
      rogueId,
      this.engine.recentLogisticsMovements(),
    ) : undefined;
    const machineAntarctica = ANTARCTIC_SECTORS_V2.filter((sector) => (
      rogueId && state.territories[territoryIdV2(sector.id)]?.owner === rogueId
    )).length;
    const totalAntarcticArmy = ANTARCTIC_SECTORS_V2.reduce((sum, sector) => (
      sum + Math.max(0, state.territories[territoryIdV2(sector.id)]?.army.manpower ?? 0)
    ), 0);
    const nextWave = polar.nextCounteroffensiveTick === null
      ? 'HALTED' : compactWarTime(Math.max(0, polar.nextCounteroffensiveTick - state.tick));
    const attentionEta = attention.nextStageTick === null
      ? '—' : compactWarTime(Math.max(0, attention.nextStageTick - state.tick));
    const gatewayRows = polar.gatewayBreachOrder.map((gatewayId, index) => {
      const breach = polar.gatewayBreaches[gatewayId];
      const gatewayName = this.engine.content.territories[territoryIdV2(gatewayId)]?.name
        ?? gatewayId;
      const status = breach?.status ?? 'sealed';
      const eta = status === 'breaching' && breach?.opensTick !== null
        ? `${compactWarTime(Math.max(0, (breach?.opensTick ?? state.tick) - state.tick))} TO OPEN`
        : status === 'open' ? 'ROUTE OPEN' : 'NO ROUTE';
      return `<article class="polar-gateway-status is-${status}"><span>GATEWAY ${index + 1}</span><strong>${escapeHtml(gatewayName)}</strong><b>${status.toUpperCase()} · ${escapeHtml(eta)}</b></article>`;
    }).join('');
    const humanOwners = new Set(state.humanPlayerIds);
    const independentWorldNations = new Set((Object.entries(state.territories) as Array<[TerritoryId, TerritoryStateV2]>)
      .filter(([id, territory]) => !antarcticIds.has(String(id))
        && territory.owner !== rogueId && !humanOwners.has(territory.owner))
      .map(([, territory]) => territory.owner)).size;
    const regionLabels: Record<AntarcticSectorDefinitionUIV2['region'], string> = {
      gateway: 'PERIMETER STATES · WEAKEST',
      outer: 'OUTER MACHINE STATES',
      inner: 'INNER FORTRESS STATES',
      core: 'SOVEREIGN MACHINE CORE · STRONGEST',
    };
    const visibleRegions: readonly AntarcticSectorDefinitionUIV2['region'][] = [
      'gateway', 'outer', 'inner', 'core',
    ];
    const sectorGroups = visibleRegions.map((region) => {
      const sectors = ANTARCTIC_SECTORS_V2.filter((sector) => sector.region === region);
      const cards = sectors.map((sector) => {
        const territoryId = territoryIdV2(sector.id);
        const territory = state.territories[territoryId];
        if (!territory) return '';
        const owner = this.engine.player(territory.owner);
        const machineControlled = territory.owner === rogueId;
        const securedByPlayer = territory.owner === human.id;
        const power = this.engine.territoryPower(territoryId);
        const attack = owner ? this.engine.effectiveAttack(owner.id, territory.army) : 0;
        const defense = owner ? this.engine.effectiveDefense(owner.id, territory.army) : 0;
        const armyFill = territory.army.capacity > 0
          ? clamp(territory.army.manpower / territory.army.capacity, 0, 1) * 100 : 0;
        const status = machineControlled ? 'MACHINE CONTROL'
          : securedByPlayer ? 'SECURED BY YOU'
          : `CAPTURED BY ${owner?.shortName ?? territory.owner}`;
        return `<button class="rogue-state-card ${machineControlled ? 'is-machine' : 'is-secured'}${sector.region === 'core' ? ' is-core' : ''}" data-action="focus-event" data-territory="${sector.id}"><header><span>DEPTH ${sector.depth} · ${sector.region.toUpperCase()}</span><b>${escapeHtml(status)}</b></header><div><strong>${escapeHtml(sector.name)}</strong><small>${escapeHtml(sector.description)}</small></div><section><span><small>POWER</small><b>${compactNumber(power)}</b></span><span><small>ACTIVE ARMY</small><b>${people(territory.army.manpower)}</b></span><span><small>COMBAT</small><b>${format(attack, 1)} / ${format(defense, 1)}</b></span><span><small>ECONOMY</small><b>${cash(territory.economy)}</b></span></section><i role="progressbar" aria-label="Army readiness in ${escapeHtml(sector.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(armyFill)}"><b style="width:${armyFill}%"></b></i></button>`;
      }).join('');
      return `<section class="polar-sector-group rogue-state-group"><span class="section-label">${regionLabels[region]}</span><div class="rogue-state-list">${cards}</div></section>`;
    }).join('');
    const coreId = territoryIdV2('zero-point-core');
    const core = state.territories[coreId];
    const coreHeld = Boolean(core && core.owner === rogueId);
    const phaseLabel = polar.phase === 'victory' || !coreHeld
      ? 'CORE CAPTURED' : 'PERMANENT WAR';
    return `<aside class="world-panel command-drawer glass-panel command-drawer--clean command-drawer--unified polar-command polar-command--antarctica" data-scroll-session="${drawerScrollSessionId('polar:antarctica')}">
      <button class="panel-close" data-action="close-panel" aria-label="Close Rogue Empire intelligence">×</button>
      <div class="drawer-heading drawer-heading--compact drawer-heading--single"><div><h2>Codex Ascendancy</h2></div><strong class="${coreHeld ? 'is-negative' : 'is-positive'}">${escapeHtml(phaseLabel)}</strong></div>
      <section class="rogue-empire-hero"><div class="country-flag">${rogue ? countryFlagHtml(rogue.id, rogue.sigil, true) : '◆'}</div><div><span>ROGUE AI · EMPIRE</span><strong>${escapeHtml(rogue?.name ?? 'Codex Ascendancy')}</strong><small>Weak outer states protect a massively fortified core.</small></div></section>
      <section class="polar-campaign-overview" aria-label="Rogue empire status"><article><span>ROGUE ATTENTION</span><strong>${escapeHtml(attention.stage.replace('-', ' ').toUpperCase())}</strong><small>${format(attention.liberatedWorldShare * 100, 1)}% liberated · next stage ${attentionEta}</small></article><article><span>ANTARCTIC CONTROL</span><strong>${machineAntarctica}/${ANTARCTIC_SECTORS_V2.length}</strong><small>Sectors still held</small></article><article><span>NEXT WAVE</span><strong>${nextWave}</strong><small>Wave ${polar.globalWave} grows stronger</small></article><article><span>ACTIVE FRONTS</span><strong>${activeWars.length}</strong><small>${attention.stage === 'active' ? 'Permanent machine war' : 'Buildup only'}</small></article></section>
      <section class="polar-gateway-grid" aria-label="Antarctic gateway breach status">${gatewayRows}</section>
      <section class="polar-logistics-overview" aria-label="Live Rogue AI logistics"><article><span>TROOP MOVEMENTS · THIS WEEK</span><strong>${rogueLogistics?.movementCount ?? 0} MOVES · ${people(rogueLogistics?.movedManpower ?? 0)}</strong><small>Machine troops transferred</small></article><article><span>FROM ANTARCTICA</span><strong>${rogueLogistics?.antarcticMovementCount ?? 0} MOVES · ${people(rogueLogistics?.antarcticMovedManpower ?? 0)}</strong><small>Routes entering or crossing the ice</small></article><article><span>NAVAL ROUTES</span><strong>${rogueLogistics?.navalMovementCount ?? 0} MOVES · ${format(rogueLogistics?.navalMeanDistanceKm ?? 0, 0)} KM AVG</strong><small>${cash(rogueLogistics?.navalCost ?? 0)} paid · ${people(rogueLogistics?.navalMovedManpower ?? 0)} moved</small></article><article><span>FRONT SUPPLY</span><strong>${(rogueLogistics?.frontOperationCount ?? 0) > 0 ? `${format((rogueLogistics?.averageFrontSupply ?? 0) * 100, 1)}% AVG` : 'MOBILISING'}</strong><small>${(rogueLogistics?.frontOperationCount ?? 0) > 0 ? `${format((rogueLogistics?.weakestFrontSupply ?? 0) * 100, 1)}% weakest · ${rogueLogistics?.frontOperationCount ?? 0} routes` : 'No active machine route'}</small></article></section>
      <section class="polar-earth-grid"><article><span>MACHINE SPREAD</span><strong>${occupiedWorld} WORLD TERRITORIES</strong><small>Only countries physically captured by Antarctic-origin waves become zero-production transit nodes.</small></article><article><span>INDEPENDENT RESISTANCE</span><strong>${independentWorldNations} DAMAGED NATIONS</strong><small>They retain roughly 10% strength, keep national quality and fight until conquered.</small></article></section>
      <section class="polar-boss-card ${coreHeld ? 'is-sealed' : 'is-exposed'}"><div><span>ZERO-POINT CORE · SOVEREIGN CAPITAL</span><strong>${coreHeld ? 'THE STRONGEST MACHINE STATE' : 'CORE TAKEN · SURVIVAL WON'}</strong><small>${coreHeld ? `${compactNumber(core ? this.engine.territoryPower(coreId) : 0)} power · ${people(core?.army.manpower ?? 0)} active · capture this territory to end the invasion.` : 'The Codex Ascendancy can no longer generate invasion waves.'}</small></div></section>
      ${sectorGroups}
    </aside>`;
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
    const integrationPopulation = integratingTerritories
      .reduce((sum, territory) => sum + Math.max(0, territory.population), 0);
    const integrationProgress = integrationPopulation > 0
      ? integratingTerritories.reduce((sum, territory) => (
        sum + Math.max(0, territory.population) * territory.integration
      ), 0) / integrationPopulation
      : 1;
    const apexPurgeStatuses = selectApexSignalPurgeStatusesV2(
      state,
      this.engine.content,
      human.id,
    );
    const activeFrontPurges = apexPurgeStatuses
      .filter((status) => status.mode === 'front').length;
    const remotePurges = apexPurgeStatuses
      .filter((status) => status.mode === 'relay' || status.mode === 'en-route').length;
    const focusedPurge = apexPurgeStatuses.find((status) => status.focused);
    const nextIntegration = focusedPurge
      ? integratingTerritories.find((territory) => territory.id === focusedPurge.territoryId)
      : undefined;
    const integrationWeeks = focusedPurge?.remainingWeeks;
    const purgeState = focusedPurge?.label ?? 'COMPLETE';
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
    const nationPower = this.engine.currentPower(human.id);
    const purgePercent = fusionCompletion * 100;
    return `
      <aside class="world-panel command-drawer glass-panel nation-command command-drawer--clean command-drawer--unified command-drawer--decision" data-scroll-session="${drawerScrollSessionId('nation')}">
        <button class="panel-close" data-action="close-panel" aria-label="Close nation overview">×</button>
        <div class="drawer-heading drawer-heading--compact drawer-heading--single"><div><h2>${escapeHtml(human.name)}</h2></div><strong class="${integratingTerritories.length ? 'is-warn' : 'is-positive'}">${integratingTerritories.length ? `${integratingTerritories.length} PURGING` : 'ALL LIBERATED'}</strong></div>
        <section class="decision-stat-grid decision-stat-grid--nation" aria-label="Nation status">
          <article class="is-primary"><span>POWER</span><strong>${compactNumber(nationPower)}</strong><small>National combat power</small></article>
          <article><span>TERRITORIES</span><strong>${world.controlledTerritories}</strong><small>${format(world.controlledLandShare * 100, 2)}% mapped land</small></article>
          <article class="${integratingTerritories.length ? 'is-warn' : 'is-good'}"><span>APEX SIGNAL PURGE</span><strong>${format(purgePercent, 1)}%</strong><small>${nextIntegration ? `${escapeHtml(this.engine.content.territories[nextIntegration.id]?.name ?? nextIntegration.id)} · ${escapeHtml(purgeState)}${integrationWeeks === undefined ? '' : ` · ${compactWarTime(integrationWeeks)}`}` : 'Complete'}</small></article>
          <article><span>PEOPLE</span><strong>${population(economy.population)}</strong><small class="${populationDynamics.annualNetRate >= 0 ? 'is-positive' : 'is-negative'}">${signedPeople(annualPopulationChange)} / year</small></article>
        </section>

        <details class="decision-details" data-disclosure-session="drawer:nation:people"><summary>People <b>${populationShare.toFixed(2)}% world population</b></summary><div class="decision-details__body"><section class="nation-system-block nation-life-grid" aria-label="Population"><article class="nation-life-card nation-life-card--population"><div><span>DEMOGRAPHICS</span><strong class="${populationDynamics.annualNetRate >= 0 ? 'is-positive' : 'is-negative'}">${signedPeople(annualPopulationChange)} / year</strong></div><div class="nation-demographic-flow"><span><b>+${population(annualBirths)}</b>BIRTHS</span><i>−</i><span><b>−${population(annualDeaths)}</b>DEATHS</span>${populationDynamics.annualWarPenaltyRate > 0 ? `<i>−</i><span><b>−${population(economy.population * populationDynamics.annualWarPenaltyRate)}</b>WAR DRAG</span>` : ''}</div></article></section></div></details>

        <details class="decision-details" data-disclosure-session="drawer:nation:apex-purge"><summary>APEX purge &amp; national IQ <b>IQ ${format(iqFusion.score, 1)}</b></summary><div class="decision-details__body"><section class="nation-fusion-panel ${integratingTerritories.length ? 'is-active' : 'is-complete'}" aria-label="Empire liberation, APEX Signal Purge and national IQ fusion"><header><span>APEX SIGNAL PURGE</span><strong>IQ ${format(iqFusion.score, 1)}</strong></header><div class="nation-fusion-score"><span><small>NATIVE</small><b>${format(iqFusion.nativeBaseline, 1)}</b></span><i aria-hidden="true">&rarr;</i><span><small>FUSED</small><b>${format(iqFusion.fusedBaseline, 1)}</b></span><em class="${fusionTone}">${signed(iqFusion.fusionDelta, 1)} IQ</em></div><div class="nation-fusion-progress"><span><b>${format(purgePercent, 1)}% SIGNAL PURGED</b><small>${integratingTerritories.length ? `APEX focus · ${activeFrontPurges} front · ${remotePurges} remote · ${format(integrationProgress * 100, 1)}%` : 'Complete'}</small></span><i role="progressbar" aria-label="Empire signal purge" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${format(purgePercent, 1)}"><b style="width:${format(purgePercent, 2)}%"></b></i></div><div class="nation-fusion-origins" aria-label="Liberated population origins">${fusionOriginMix || '<span><b>NATIVE</b>100%</span>'}</div><footer><span>${format(iqFusion.foreignContributingShare * 100, 1)}% foreign influence${iqFusion.researchBonus > 0 ? ` · +${format(iqFusion.researchBonus, 1)} research IQ` : ''}</span><strong>${nextIntegration ? `${escapeHtml(this.engine.content.territories[nextIntegration.id]?.name ?? nextIntegration.id)} · ${escapeHtml(purgeState)}${integrationWeeks === undefined ? '' : ` · ${format(integrationWeeks / 52, 1)}Y`}` : 'ALL CORE'}</strong></footer></section></div></details>

        <details class="decision-details" data-disclosure-session="drawer:nation:systems"><summary>Nation systems <b>STABLE</b></summary><div class="decision-details__body"><section class="unified-stat-grid"><article><span>INTEGRATED PEOPLE</span><strong>${population(integratedPopulation)}</strong><small>${format(populationShare, 2)}% of world</small></article><article><span>NATIONAL AI</span><strong>${escapeHtml(finance.aiMode.toUpperCase())}</strong><small>${format(finance.aiEfficiency * 100, 1)}% efficiency</small></article></section></div></details>
      </aside>
    `;
  }
  private renderEconomyPanel(
    human: NationViewV2,
    economy: NationalEconomyV2,
    finance: WeeklyFinanceBreakdownV2,
  ): string {
    const totalIncome = finance.revenue + finance.apexContribution;
    const totalExpenses = finance.expenses;
    const growth = finance.annualEconomyGrowthRate;
    const incomeItems = [
      { label: 'TAX REVENUE', weekly: Math.max(0, finance.revenue), tone: 'tax', always: true },
      { label: 'APEX CONTRIBUTION', weekly: Math.max(0, finance.apexContribution), tone: 'apex', always: true },
    ];
    const incomeRows = incomeItems
      .filter((item) => item.always || item.weekly > 0.0000005)
      .map((item) => {
        const share = totalIncome > 0 ? item.weekly / totalIncome * 100 : 0;
        const boundedShare = Math.max(0, Math.min(100, share));
        const shareLabel = share > 0 && share < 0.1 ? '&lt;0.1%' : `${format(share, 1)}%`;
        return `<article class="economy-expense-breakdown__item economy-income-breakdown__item--${item.tone} ${item.weekly > 0 ? 'is-funded' : 'is-zero'}" aria-label="${item.label}: ${cash(annual(item.weekly))} per year, ${format(share, 1)} percent of total income"><div><span>${item.label}</span><strong>+${cash(annual(item.weekly))}<small>/year</small></strong><em>${shareLabel}</em></div><i aria-hidden="true"><b style="width:${boundedShare}%"></b></i></article>`;
      }).join('');
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
      { key: 'military', label: 'MILITARY', weekly: Math.max(0, finance.military), tone: 'military', always: true },
      { key: 'research', label: 'RESEARCH', weekly: Math.max(0, finance.research), tone: 'research', always: true },
      { key: 'development', label: 'DEVELOPMENT', weekly: Math.max(0, finance.development), tone: 'development', always: true },
      { key: 'integration', label: 'SIGNAL PURGE', weekly: Math.max(0, finance.integrationCost), tone: 'integration', always: false },
      { key: 'war', label: 'WAR OPERATIONS', weekly: Math.max(0, finance.warOperations), tone: 'war', always: false },
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
    const expenseFor = (...keys: string[]): number => expenseItems
      .filter((item) => keys.includes(item.key))
      .reduce((sum, item) => sum + item.weekly, 0);
    const compactLedger = [
      ['STATE', expenseFor('operations', 'development')],
      ['INTEGRATION', expenseFor('integration')],
      ['DEFENCE', expenseFor('military', 'war')],
      ['KNOWLEDGE & DEBT', expenseFor('research', 'debt')],
    ] as const;
    return `
      <aside class="world-panel command-drawer glass-panel economy-command economy-command--simple command-drawer--unified command-drawer--decision" data-scroll-session="${drawerScrollSessionId('economy')}">
        <button class="panel-close" data-action="close-panel" aria-label="Close economy">×</button>
        <div class="drawer-heading drawer-heading--compact drawer-heading--single economy-heading"><div><h2>Economy</h2></div><strong class="${finance.net >= 0 ? 'is-positive' : 'is-negative'}">${signedCash(annual(finance.net))} / YEAR</strong></div>

        <section class="finance-flow-summary" aria-label="Annual cashflow">
          <article class="is-income"><span>TOTAL INCOME</span><strong>+${cash(annual(totalIncome))}</strong><small>/ year</small></article>
          <i aria-hidden="true">−</i>
          <article class="is-expense"><span>TOTAL COSTS</span><strong>−${cash(annual(totalExpenses))}</strong><small>/ year</small></article>
          <i aria-hidden="true">=</i>
          <article class="${finance.net >= 0 ? 'is-income' : 'is-expense'}"><span>NET BALANCE</span><strong>${signedCash(annual(finance.net))}</strong><small>/ year</small></article>
        </section>

        <section class="decision-stat-grid decision-stat-grid--economy" aria-label="Economy status">
          <article class="${human.treasury >= 0 ? 'is-primary' : 'is-danger'}"><span>TREASURY</span><strong>${cash(human.treasury)}</strong><small>${human.treasury >= 0 ? 'Available cash' : 'Deficit'}</small></article>
          <article class="${reserveCoverage >= 1 ? 'is-good' : 'is-warn'}"><span>RESERVE</span><strong>${format(Math.max(0, reserveCoverage) * 100, 1)}%</strong><small>${cash(finance.reserveTarget)} target</small></article>
          <article><span>ECONOMY</span><strong>${cash(economy.controlledOutput)}</strong><small class="${growth >= 0 ? 'is-positive' : 'is-negative'}">${signed(growth * 100, 2)}% / year</small></article>
          <article><span>TAX</span><strong>${format(economy.taxRate * 100, 1)}%</strong><small>${cash(annual(finance.revenue))} / year</small></article>
        </section>
        ${finance.newBorrowing > 0 || human.treasury < 0 ? `<div class="simple-panel-alert is-debt"><b>DEBT FINANCING</b><span>${cash(finance.newBorrowing)} new borrowing this week · ${cash(annual(finance.debtPremium))}/year debt premium</span></div>` : ''}

        <section class="compact-ledger" aria-label="Annual categorized costs">${compactLedger.map(([label, weekly]) => `<article><span>${label}</span><strong>−${cash(annual(weekly))}<small>/year</small></strong></article>`).join('')}</section>

        <details class="decision-details" data-disclosure-session="drawer:economy:annual-ledger"><summary>Full annual ledger <b>${incomeItems.length} income · ${expenseItems.filter((item) => item.always || item.weekly > 0.0000005).length} cost lines</b></summary><div class="decision-details__body"><section class="economy-expense-breakdown economy-income-breakdown" aria-label="Annual income breakdown"><div class="economy-expense-breakdown__columns"><span>SOURCE</span><span>AMOUNT / YEAR</span><span>SHARE</span></div><div class="economy-expense-breakdown__items">${incomeRows}</div><footer><span>TOTAL INCOME</span><strong>+${cash(annual(totalIncome))}<small>/year</small></strong><b>${totalIncome > 0 ? '100%' : '0%'}</b></footer></section><section class="economy-expense-breakdown" aria-label="Annual expense breakdown"><div class="economy-expense-breakdown__columns"><span>CATEGORY</span><span>AMOUNT / YEAR</span><span>SHARE</span></div><div class="economy-expense-breakdown__items">${expenseRows}</div><footer><span>TOTAL COSTS</span><strong>−${cash(annual(totalExpenses))}<small>/year</small></strong><b>${totalExpenses > 0 ? '100%' : '0%'}</b></footer></section></div></details>
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
    const polarCompleted = this.engine.state.polarEndgame
      .arcticPrograms[human.id]?.completedProjects.length ?? 0;
    const totalCompleted = completed + polarCompleted;
    const polarCompletedEffects = this.renderPolarCompletedEffects(human);
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
    const nextRemaining = next ? Math.max(0, next.nextCost - next.progress) : 0;
    const nextEffects = next?.effects.map((effect) => (
      `${researchEffectLabel(effect.effect)} ${researchEffectTransitionV2(
        effect.effect,
        effect.level,
        1,
        effect.impactPerLevel,
        effectDisplayContext,
      )}`
    )).join(' · ') ?? 'No further effect';
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
      <aside class="world-panel command-drawer glass-panel progress-command research-command command-drawer--clean command-drawer--unified command-drawer--decision" data-scroll-session="${drawerScrollSessionId('research')}">
        <button class="panel-close" data-action="close-panel" aria-label="Close research">×</button>
        <div class="drawer-heading drawer-heading--compact drawer-heading--single"><div><h2>Research</h2></div><strong class="is-positive">${totalCompleted} COMPLETE</strong></div>

        ${this.renderPolarResearchItem(human)}

        <section class="research-next-card" style="--project:${next ? RESEARCH_COLORS[next.branch] : '#69e3a2'}" aria-label="Next research breakthrough">
          <div><span>NEXT BREAKTHROUGH</span><strong>${next ? escapeHtml(RESEARCH_META[next.branch].label) : 'ALL PROGRAMS COMPLETE'}</strong><b>${nextProgress}%</b></div>
          <i role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${nextProgress}"><b style="width:${nextProgress}%"></b></i>
          <strong class="research-next-effect">${escapeHtml(nextEffects)}</strong>
          <small>${next ? `${format(nextRemaining, 2)} R&D remaining · ${nextWeeks || 0} weeks · ${next.allocation}% focus` : 'Every useful research level has been completed.'}</small>
        </section>

        <section class="decision-stat-grid decision-stat-grid--research" aria-label="Research status">
          <article class="is-primary"><span>R&D / WEEK</span><strong>${format(portfolio.reduce((sum, branch) => sum + branch.weeklyProgress, 0), 2)}</strong><small>${cash(annual(finance.research))} funded / year</small></article>
          <article><span>CONVERSION</span><strong>×${format(nationalQuality?.researchConversion ?? 1, 2)}</strong><small>Live system output</small></article>
          <article><span>LIVE IQ</span><strong>${format(liveIq.score, 1)}</strong><small>${signed(liveIq.researchBonus, 1)} education</small></article>
          <article class="${finance.warResearchPenalty > 0 ? 'is-warn' : 'is-good'}"><span>THROUGHPUT</span><strong>${format((1 - finance.warResearchPenalty) * 100, 1)}%</strong><small>${finance.warResearchPenalty > 0 ? 'Reduced by active war' : 'No wartime disruption'}</small></article>
          <article><span>DETERRENCE</span><strong>${deterrence.level ? `TIER ${deterrence.level}` : `${nuclearProgress}%`}</strong><small>+${format(deterrence.attackBonus * 100)}% attack</small></article>
        </section>

        <details class="decision-details" data-disclosure-session="drawer:research:completed-effects"><summary>Completed effects <b>${totalCompleted} upgrades</b></summary><div class="decision-details__body"><section class="research-effects" aria-labelledby="research-effects-title"><header><span class="section-label" id="research-effects-title">ACTIVE EFFECTS</span></header><div class="upgrade-total-grid">${upgradeTotals}${polarCompletedEffects}${!upgradeTotals && !polarCompletedEffects ? '<div class="empty-state">No completed research effects yet.</div>' : ''}</div></section></div></details>
        <details class="decision-details" data-disclosure-session="drawer:research:programs"><summary>All research programs <b>${portfolio.filter((branch) => !branch.maxed).length} active</b></summary><div class="decision-details__body"><div class="progress-programs progress-programs--compact">${programs}</div></div></details>
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
  private renderWarPanel(
    human: NationViewV2,
    economy: NationalEconomyV2,
    finance: WeeklyFinanceBreakdownV2,
    wars: WarStateV2[],
    logisticsReadiness: EmpireLogisticsReadinessV2,
    warEstimates: ReadonlyMap<string, LiveWarEstimateV2 | undefined>,
  ): string {
    const army = this.engine.armyStrength(human.id);
    const warsUnlocked = campaignWarsUnlockedV2(this.engine.state, this.engine.content);
    const humanWarsUnlocked = campaignHumanWarsUnlockedV2(
      this.engine.state,
      this.engine.content,
      human.id,
    );
    const recommendations = humanWarsUnlocked
      ? this.warTargetRecommendations(human.id)
      : [];
    const apexOpeningBriefingKnown = this.engine.content.metadata?.scenarioId !== 'standard-2026'
      || this.engine.state.polarEndgame.apexNarrative.players[human.id]?.transmissions.some((item) => (
        item.id === 'campaign-signal-anomaly'
      )) === true;
    const currentPower = this.engine.currentPower(human.id);
    const apexStatus = selectCommanderAutonomyStatusV2(
      this.engine.state, this.engine.content, human.id,
    );
    const apexForce = this.engine.state.commanderForces?.[human.id];
    const apexRawPower = apexForce ? commanderForceMapCombatPower(apexForce.army) : 0;
    const apexShield = apexForce
      ? apexShieldTopbarPresentationV2(
          apexRawPower,
          apexForce.army.manpower,
          apexForce.army.capacity,
          apexForce.mission,
        )
      : { operationalPower: 0, integrityPercent: 0, recovering: false };
    const apexPower = apexShield.operationalPower;
    const combinedPower = currentPower + apexPower;
    const apexTwin = selectApexTwinProjectionStatusV2(
      this.engine.state,
      human.id,
      this.engine.content,
    );
    const logisticsSummary = logisticsReadiness.frontCount === 0
      ? 'Network ready'
      : `${logisticsReadiness.frontCount} ${logisticsReadiness.frontCount === 1 ? 'front' : 'fronts'} · weakest ${logisticsReadiness.weakest?.percent ?? logisticsReadiness.percent}%`;
    const primaryFrontRows = selectCommanderFrontPrioritiesV2(
      this.engine.state, this.engine.content, human.id,
    )
      .slice(0, 4)
      .map((candidate, index) => {
        const enemy = this.engine.player(
          this.engine.state.territories[candidate.hostileTerritoryId]!.owner,
        );
        const sourceName = this.engine.content.territories[candidate.front.sourceId]?.name
          ?? candidate.front.sourceId;
        const targetName = this.engine.content.territories[candidate.front.targetId]?.name
          ?? candidate.front.targetId;
        const ownLocalPower = this.engine.territoryPower(candidate.destinationId);
        const enemyLocalPower = this.engine.territoryPower(candidate.hostileTerritoryId);
        const twinSecondary = apexTwin.secondaryProjection?.front;
        const twinSecondaryAssigned = Boolean(apexTwin.active
          && twinSecondary
          && twinSecondary.warId === candidate.front.warId
          && twinSecondary.sourceId === candidate.front.sourceId
          && twinSecondary.targetId === candidate.front.targetId);
        const apexAssigned = candidate.assigned || twinSecondaryAssigned;
        const twinProjection = apexTwin.active && apexAssigned;
        const assignedApexPower = twinProjection
          ? apexPower * apexTwin.combatShare : apexPower;
        const apexDetail = apexAssigned
          ? apexStatus.state === 'moving'
            ? `SHIELD EN ROUTE · ETA ${compactWarTime(apexStatus.etaWeeks ?? candidate.travelTicks)} · ${apexShield.integrityPercent}% INTEGRITY`
            : twinProjection
              ? `TWIN ${candidate.assigned ? 'PRIMARY' : 'SECONDARY'} 60% · +${compactNumber(assignedApexPower)} POWER · SHARED SHIELD ${apexShield.integrityPercent}%`
              : `APEX SHIELD ${apexShield.integrityPercent}% · +${compactNumber(assignedApexPower)} POWER`
          : candidate.criticalDefense ? 'APEX PRIORITY · COLLAPSE RISK'
          : `AUTO PRIORITY ${index + 1} · +${format(candidate.marginalWinImpact, 1)}PP IMPACT`;
        return `<article class="war-primary-front${apexAssigned ? ' is-assigned' : ''}" style="--enemy:${enemy?.cssColor ?? '#ff8179'}"><div><span>${candidate.mission === 'assault-support' ? 'ATTACK' : 'DEFEND'} · ${escapeHtml(warAccessLabel(candidate.access))}</span><strong>${escapeHtml(sourceName)} → ${escapeHtml(targetName)}</strong><small>POWER ${compactNumber(ownLocalPower)} / ${compactNumber(enemyLocalPower)} · ${escapeHtml(apexDetail)}</small></div><button class="primary-button" data-action="focus-war" data-territory="${escapeHtml(candidate.hostileTerritoryId)}">FOCUS FRONT</button></article>`;
      }).join('');
    const targetIntel = humanWarsUnlocked
      ? `<section class="war-primary-targets"><header><strong>${primaryFrontRows ? 'New campaigns' : 'Best targets'}</strong><small>Power · chance · route · recurring cost</small></header><div class="war-intel-list war-intel-list--compact">${recommendations.length ? recommendations.map((candidate, index) => this.renderTargetRecommendation(
        candidate,
        index,
        candidate.declaration.access !== 'none'
          ? this.cachedWarLogisticsPreview(human.id, candidate.targetId) : undefined,
      )).join('') : '<div class="empty-state">No legal target is currently in land or naval range.</div>'}</div></section>`
      : warsUnlocked
        ? `<section class="war-command-lock" aria-label="APEX first-strike briefing pending"><span>INTELLIGENCE PENDING</span><strong>FIRST-STRIKE BRIEFING PENDING</strong><small>${escapeHtml(CAMPAIGN_HUMAN_WAR_STORY_LOCK_REASON_V2)}</small></section>`
        : apexOpeningBriefingKnown
        ? `<section class="war-command-lock" aria-label="Military intelligence locked"><span>INTELLIGENCE LOCKED</span><strong>SIGNAL TRIANGULATION REQUIRED</strong><small>${escapeHtml(CAMPAIGN_WAR_LOCK_REASON_V2)}</small><button class="secondary-button" data-action="panel" data-panel="research">OPEN RESEARCH</button></section>`
        : `<section class="war-command-lock war-command-lock--opening" aria-label="APEX initial scan in progress"><span>CALM</span><strong>INITIAL SCAN IN PROGRESS</strong><small>Review your readiness. APEX will contact you when verified intelligence is available.</small></section>`;
    return `
      <aside class="world-panel command-drawer glass-panel war-command command-drawer--clean command-drawer--unified command-drawer--decision" data-scroll-session="${drawerScrollSessionId('war')}">
        <button class="panel-close" data-action="close-panel" aria-label="Close war command">×</button>
        <div class="drawer-heading drawer-heading--compact drawer-heading--single"><div><h2>War</h2></div><strong class="${wars.length ? 'is-negative' : army.fillRatio >= 0.55 ? 'is-positive' : 'is-warn'}">${wars.length ? 'AT WAR' : army.fillRatio >= 0.55 ? 'READY' : 'REBUILDING'}</strong></div>
        <section class="decision-stat-grid decision-stat-grid--war" aria-label="Military status"><article class="is-primary"><span>TOTAL POWER</span><strong>${compactNumber(combinedPower)}</strong><small>${apexPower > 0 ? `Empire ${compactNumber(currentPower)} · APEX ${compactNumber(apexPower)}` : 'Empire combat power'}</small></article><article class="${army.fillRatio >= 0.55 ? 'is-good' : 'is-warn'}"><span>ARMY READY</span><strong>${format(army.fillRatio * 100, 0)}%</strong><small>${people(army.deployed)} active</small></article><article class="logistics-${logisticsReadiness.status}${logisticsReadiness.status === 'critical' ? ' is-danger' : logisticsReadiness.status === 'strained' ? ' is-warn' : ' is-good'}"><span>LOGISTICS</span><strong>${logisticsReadiness.percent}% ${logisticsReadiness.statusLabel}</strong><small>${escapeHtml(logisticsSummary)}</small></article><article class="${finance.warOperations > 0 ? 'is-warn' : ''}"><span>WAR COST</span><strong>${cash(annual(finance.warOperations))}</strong><small>/ year</small></article></section>
        ${primaryFrontRows ? `<section class="war-primary-fronts" aria-label="Priority active fronts"><header><strong>Priority fronts</strong><small>APEX deploys autonomously · click to focus</small></header>${primaryFrontRows}</section>` : ''}
        ${targetIntel}
        <details class="decision-details" data-disclosure-session="drawer:war:army"><summary>Army, ATK, DEF &amp; reserves</summary><div class="decision-details__body">${this.renderMilitaryCommandOverview(human, economy, finance)}</div></details>
        ${wars.length ? `<details class="decision-details" data-disclosure-session="drawer:war:campaigns"><summary>Active campaigns <b>${wars.length}</b></summary><div class="decision-details__body"><div class="war-cards">${wars.map((war) => this.renderWarCard(war, human.id, finance, logisticsReadiness, warEstimates.get(war.id), wars.length)).join('')}</div></div></details>` : ''}
        <details class="decision-details" data-disclosure-session="drawer:war:antarctic-access"><summary>Antarctic access</summary><div class="decision-details__body">${this.renderAntarcticaGatewayCard()}</div></details>
      </aside>
    `;
  }
  private warTargetRecommendations(humanId: PlayerId): WarTargetCandidate[] {
    const tickBucket = Math.floor(this.engine.state.tick / 6);
    const warSignature = this.engine.state.wars
      .map((war) => `${war.id}:${war.attackerId}:${war.defenderId}`)
      .sort().join('|');
    const cached = this.warTargetCache;
    if (cached?.humanId === humanId && cached.tickBucket === tickBucket
      && cached.actionSequence === this.engine.state.actionSequence
      && cached.warSignature === warSignature) {
      return cached.recommendations;
    }
    const candidates = this.connectedOpponentIds(humanId).flatMap((targetId): WarTargetCandidate[] => {
      const target = this.engine.player(targetId)!;
      const declaration = this.engine.warDeclarationStatus(humanId, targetId);
      if (!declaration.allowed || declaration.access === 'none') return [];
      const forecast = this.engine.warForecast(humanId, targetId);
      const chance = forecast.winChance;
      const economy = this.engine.nationalEconomy(targetId);
      const iq = selectNationalIqViewV2(this.engine.state, this.engine.content, targetId);
      const distanceKm = selectWarRouteDistanceKmV2(
        this.engine.state,
        this.engine.content,
        humanId,
        targetId,
      );
      const sourceId = forecast.sourceId;
      const targetTerritoryId = forecast.targetId;
      const sourceRegion = sourceId ? this.engine.content.territories[sourceId]?.regionId : undefined;
      const targetRegion = targetTerritoryId
        ? this.engine.content.territories[targetTerritoryId]?.regionId : undefined;
      const sameRegion = Boolean(sourceRegion && targetRegion && sourceRegion === targetRegion);
      const existingBeachhead = Boolean(targetRegion && this.engine.content.territoryIds.some((id) => (
        this.engine.content.territories[id]?.regionId === targetRegion
          && this.engine.state.territories[id]?.owner === humanId
      )));
      const sourceArmy = sourceId ? this.engine.state.territories[sourceId]?.army : undefined;
      const stagingReadiness = sourceArmy && sourceArmy.capacity > 0
        ? clamp(sourceArmy.manpower / sourceArmy.capacity, 0, 1) : 0;
      const preparationWeeks = declaration.access === 'naval'
        ? Math.max(4, Math.ceil((distanceKm ?? 2_500) / 1_200)) : 0;
      const mobilizationWeeks = campaignProspectiveWarMobilizationTicksV2(
        this.engine.state,
        this.engine.content,
        humanId,
        targetId,
      );
      return [{
        targetId,
        target,
        declaration,
        chance,
        access: declaration.access,
        gdpPerCapitaThousands: economy.wealthPerPerson,
        nationalIq: iq.score,
        distanceKm,
        sameRegion,
        existingBeachhead,
        frontSupply: forecast.attackerSupply,
        transferThroughput: declaration.access === 'land'
          ? clamp(forecast.attackerSupply, 0, 1)
          : clamp(forecast.attackerSupply * 0.75, 0, 0.85),
        stagingReadiness,
        preparationWeeks,
        etaWeeks: mobilizationWeeks < WAR_MOBILIZATION_TICKS
          ? mobilizationWeeks : preparationWeeks + mobilizationWeeks,
        apexContribution: forecast.apexContribution,
        forecast,
      }];
    });
    const recommendations = rankWarTargetRecommendationsV2(candidates).slice(0, 3);
    this.warTargetCache = {
      humanId,
      tickBucket,
      actionSequence: this.engine.state.actionSequence,
      warSignature,
      recommendations,
    };
    return recommendations;
  }

  private connectedOpponentIds(playerId: PlayerId): PlayerId[] {
    const stagingOwners = new Set<PlayerId>([playerId]);
    for (const humanId of this.engine.state.humanPlayerIds) stagingOwners.add(humanId);
    for (const candidateId of Object.keys(this.engine.state.players) as PlayerId[]) {
      if (this.engine.areAllied(playerId, candidateId)) stagingOwners.add(candidateId);
    }
    const connectedOwners = new Set<PlayerId>();
    for (const territoryId of this.engine.content.territoryIds) {
      const territory = this.engine.state.territories[territoryId];
      if (!territory || !stagingOwners.has(territory.owner)) continue;
      for (const connection of this.engine.content.territories[territoryId]?.connections ?? []) {
        const targetOwner = this.engine.state.territories[connection.targetId]?.owner;
        if (targetOwner && !stagingOwners.has(targetOwner)) connectedOwners.add(targetOwner);
      }
    }
    return this.ranking().map((entry) => entry.player.id)
      .filter((targetId) => connectedOwners.has(targetId));
  }

  private renderTargetRecommendation(
    candidate: WarTargetCandidate,
    index: number,
    logistics: WarLogisticsPreviewV2 | undefined,
  ): string {
    const battleForecast = candidate.forecast;
    const targetArmy = this.engine.armyStrength(candidate.targetId);
    const targetPower = this.engine.currentPower(candidate.targetId);
    const mapTarget = battleForecast.targetId ?? candidate.target.capitalId;
    const chanceTone = candidate.chance >= 65 ? 'is-positive' : candidate.chance >= 45 ? 'is-warn' : 'is-negative';
    const routeLabel = warTargetRouteLabelV2(candidate);
    const readiness = presentLogisticsReadinessV2(
      candidate.frontSupply,
      candidate.access,
      candidate.distanceKm ?? 0,
      candidate.stagingReadiness > 0.000001,
    );
    const fusionBonus = warTargetFusionValueBonusV2(candidate);
    const apex = candidate.apexContribution;
    const recurringCost = logistics?.additionalWeeklyWarOperations ?? 0;
    const apexLabel = apex.chanceDelta > 0
      ? `<small class="war-intel-card__apex"><b>WITH APEX ${format(candidate.chance, 1)}%</b> · +${format(apex.chanceDelta, 1)}pp · ETA ${apex.etaWeeks ?? 0}W</small>`
      : apex.status === 'committed' || apex.status === 'unreachable'
        ? `<small class="war-intel-card__apex is-muted">APEX ${apex.status.toUpperCase()} · ${escapeHtml(apex.reason)}</small>`
        : '';
    return `<article class="war-intel-card war-intel-card--compact logistics-${readiness.status}" style="--enemy:${candidate.target.cssColor}"><i class="country-flag">${countryFlagHtml(candidate.target.id, candidate.target.sigil)}</i><div><span>${index === 0 ? 'BEST TARGET' : `OPTION ${index + 1}`} · ${routeLabel}</span><strong>${escapeHtml(candidate.target.name)}</strong><small><b class="${chanceTone}">${format(candidate.chance, 1)}% WIN</b> · POWER ${compactNumber(targetPower)} · ${cash(annual(recurringCost))}/YR</small><small class="war-intel-card__logistics"><b>LOGISTICS ${readiness.percent}% ${readiness.statusLabel}</b> · ${escapeHtml(readiness.limitingReason)}</small>${apexLabel}<small class="war-intel-card__fusion">${people(targetArmy.deployed)} army · ${people(candidate.target.trainedReserves)} reserve · IQ gain ${signed(fusionBonus, 1)}</small></div><button data-action="quick-war" data-player="${candidate.targetId}" data-map-target="${mapTarget}" title="Review attack on ${escapeHtml(candidate.target.shortName)}"><span>REVIEW</span></button></article>`;
  }

  private renderWarCard(
    war: WarStateV2,
    humanId: PlayerId,
    finance: WeeklyFinanceBreakdownV2,
    empireLogistics: EmpireLogisticsReadinessV2,
    estimate: LiveWarEstimateV2 | undefined,
    humanWarCount: number,
  ): string {
    const enemyId = war.attackerId === humanId ? war.defenderId : war.attackerId;
    const enemy = this.engine.player(enemyId)!;
    const score = war.attackerId === humanId ? war.warScore : -war.warScore;
    const ownArmy = this.totalCombatStrength(humanId);
    const enemyArmy = this.totalCombatStrength(enemyId);
    const ownReserve = this.engine.state.players[humanId]?.trainedReserves ?? 0;
    const operations = allWarOperations(war);
    const accessKinds = new Set(operations.map((front) => front.access));
    const accessLabel = operations.length === 0 ? 'assigning fronts'
      : accessKinds.size > 1 ? 'mixed routes'
      : `${warAccessLabel(operations[0]!.access).toLowerCase()} route`;
    const warAge = this.engine.state.tick - war.startedTick;
    const mobilizationWeeks = Math.max(0, campaignWarMobilizationTicksV2(
      this.engine.state,
      this.engine.content,
      war,
    ) - warAge);
    const status = mobilizationWeeks > 0 ? `Mobilising · combat in ${mobilizationWeeks}w`
      : score >= 25 ? 'Advantage' : score <= -25 ? 'Under pressure' : 'Contested';
    const eta = estimate
      ? `${warTimeRange(estimate.estimatedWeeksMin, estimate.estimatedWeeksMax)} · ${warOutlookLabel(estimate)}`
      : 'Awaiting first battle';
    const perWarCost = annual(finance.warOperations / Math.max(1, humanWarCount));
    const frontLogistics = empireLogistics.fronts.find((front) => front.warId === war.id);
    const weakestLogistics = frontLogistics !== undefined
      && empireLogistics.weakest?.warId === war.id;
    const logisticsRoute = frontLogistics
      ? `${frontLogistics.routeLabel}${frontLogistics.distanceKm > 0 ? ` · ${format(frontLogistics.distanceKm, 0)} KM` : ''}`
      : 'ROUTE FORMING';
    const logisticsDetail = frontLogistics
      ? `${frontLogistics.percent}% ${frontLogistics.statusLabel} · ${frontLogistics.limitingReason}`
      : 'MOBILISING';
    return `<article class="war-card-compact ${weakestLogistics ? 'is-logistics-weakest' : ''}" style="--enemy:${enemy.cssColor}"><div class="war-card-compact__head"><i class="country-flag">${countryFlagHtml(enemy.id, enemy.sigil)}</i><div><strong>${escapeHtml(enemy.name)}</strong><small>Week ${warAge} · ${war.battles} battles · ${accessLabel}</small></div><b class="${score < 0 ? 'danger-text' : 'is-positive'}">${signed(score)}</b></div><div class="war-card-compact__state"><span>${escapeHtml(status)}</span><small>${cash(perWarCost)}/year</small></div><div class="war-card-compact__metrics"><span><small>ARMIES</small><b>${people(ownArmy.deployed)} / ${people(enemyArmy.deployed)}</b><small>RESERVE ${people(ownReserve)} / ${people(enemy.trainedReserves)}</small></span><span class="logistics-${frontLogistics?.status ?? 'ready'}"><small>${weakestLogistics ? 'WEAKEST LOGISTICS' : 'LOGISTICS'}</small><b>${escapeHtml(logisticsDetail)}</b><small>${escapeHtml(logisticsRoute)}${frontLogistics ? ` · NEXT BATTLE ${frontLogistics.nextBattleWeeks}W` : ''}</small></span><span><small>MILITARY LOST</small><b>−${people(estimate?.totalOwnLosses ?? 0)} / −${people(estimate?.totalEnemyLosses ?? 0)}</b></span><span><small>EST. END</small><b>${escapeHtml(eta)}</b></span></div></article>`;
  }

  private renderTerritoryPanel(
    territoryId: TerritoryId,
    territory: TerritoryStateV2,
    viewerEconomy: NationalEconomyV2,
    _viewerFinance: WeeklyFinanceBreakdownV2,
  ): string {
    const definition = this.engine.content.territories[territoryId]!;
    const owner = this.engine.player(territory.owner)!;
    const terrainProfile = territoryTerrainProfileV2(this.engine.content, territoryId);
    const terrainEffects = territoryTerrainEffectsV2(this.engine.content, territoryId);
    const humanId = this.viewerPlayerId();
    const isOwnTerritory = owner.id === humanId;
    const survivalTransitOnly = isSurvivalScorchedTransitTerritoryV2(
      this.engine.state,
      territoryId,
    );
    const ownerHumanControlled = this.engine.state.humanPlayerIds.includes(owner.id);
    const empireTerritories = this.engine.territoriesOf(owner.id);
    const economy = isOwnTerritory
      ? viewerEconomy : this.engine.nationalEconomy(owner.id);
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
    const access = declaration?.access ?? 'none';
    const integratingCore = !survivalTransitOnly && territory.coreOwner !== territory.owner
      ? this.engine.player(territory.coreOwner) : undefined;
    const apexPurgeStatus = territory.integrationProgram
      ? selectApexSignalPurgeStatusesV2(
        this.engine.state,
        this.engine.content,
        owner.id,
      ).find((status) => status.territoryId === territoryId)
      : undefined;
    const integrationWeeks = apexPurgeStatus?.remainingWeeks
      ?? (territory.integrationProgram && !owner.isHuman
        ? Math.max(0, territory.integrationProgram.completesTick - this.engine.state.tick)
        : undefined);
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
    const panelStatus = survivalTransitOnly ? 'SUPPLY CORRIDOR'
      : activeWar ? 'WAR LIVE'
      : territory.integrationProgram ? `${owner.isHuman ? 'APEX ' : ''}SIGNAL PURGE`
      : isOwnTerritory ? 'YOUR CORE' : 'FOREIGN TARGET';
    const integrationPayer = isOwnTerritory ? 'YOU PAY' : `${owner.shortName.toUpperCase()} PAYS`;
    const integrationPanel = survivalTransitOnly
      ? '<section class="territory-integration-card territory-integration-card--corridor" aria-label="Supply corridor, transit only"><div class="territory-integration-card__head"><span>SUPPLY CORRIDOR</span><strong>TRANSIT ONLY</strong></div><small>Transit control only · no local production or recruits.</small></section>'
      : territory.integrationProgram
      ? `<section class="territory-integration-card"><div class="territory-integration-card__head"><span>${owner.isHuman ? 'APEX ' : ''}SIGNAL PURGE · ${escapeHtml(integratingCore?.shortName ?? definition.name).toUpperCase()}</span><strong>${escapeHtml(apexPurgeStatus?.label ?? 'INTEGRATING')} · ${format(integrationPercent, 1)}%</strong></div><i role="progressbar" aria-label="Signal purge progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${format(integrationPercent, 1)}"><b style="width:${integrationPercent}%"></b></i><div class="territory-integration-card__metrics"><div><span>ETA</span><strong>${integrationWeeks === undefined ? 'WAITING FOR SUPPLY' : compactWarTime(integrationWeeks)}</strong></div><div><span>${escapeHtml(integrationPayer)}</span><strong class="is-negative">−${cash(territoryIntegrationAnnualCost)} / YEAR</strong></div></div><small>${cash(unlockedOutput)} active output · permanent ${escapeHtml(owner.shortName)} core at completion${guardWeeks > 0 ? ` · guard ${guardWeeks}w` : ''}</small></section>`
      : '';
    const blockedWarNote = !activeWar && declaration && !declaration.allowed
      ? `<div class="war-rule-note is-blocked"><b>WAR UNAVAILABLE</b><span>${escapeHtml(declaration.reason ?? 'Requirements are not met.')}</span></div>`
      : '';
    const ownerRank = Math.max(
      1,
      this.ranking().findIndex((entry) => entry.player.id === owner.id) + 1,
    );
    const territoryFront = activeWar ? allWarOperations(activeWar).find((operation) => {
      const sourceOwner = this.engine.state.territories[operation.sourceId]?.owner;
      const targetOwner = this.engine.state.territories[operation.targetId]?.owner;
      return sourceOwner === humanId && operation.targetId === territoryId
        || targetOwner === humanId && operation.sourceId === territoryId;
    }) : undefined;
    const territoryFrontAssignment: CommanderFrontAssignmentV2 | undefined = activeWar && territoryFront
      ? { warId: activeWar.id, sourceId: territoryFront.sourceId, targetId: territoryFront.targetId }
      : undefined;
    const territoryFrontMission: CommanderMissionV2 | undefined = territoryFront
      ? this.engine.state.territories[territoryFront.sourceId]?.owner === humanId
        ? 'assault-support' : 'defense'
      : undefined;
    const commanderForce = this.engine.state.commanderForces?.[humanId];
    const apexTwin = selectApexTwinProjectionStatusV2(
      this.engine.state,
      humanId,
      this.engine.content,
    );
    const commanderPrimaryAssignedHere = Boolean(territoryFrontAssignment && territoryFrontMission
      && commanderForce?.front?.warId === territoryFrontAssignment.warId
      && commanderForce.front.sourceId === territoryFrontAssignment.sourceId
      && commanderForce.front.targetId === territoryFrontAssignment.targetId
      && commanderForce.mission === territoryFrontMission);
    const twinSecondary = apexTwin.secondaryProjection;
    const commanderTwinAssignedHere = Boolean(apexTwin.active
      && territoryFrontAssignment
      && territoryFrontMission
      && twinSecondary?.front.warId === territoryFrontAssignment.warId
      && twinSecondary.front.sourceId === territoryFrontAssignment.sourceId
      && twinSecondary.front.targetId === territoryFrontAssignment.targetId
      && twinSecondary.mission === territoryFrontMission);
    const commanderAssignedHere = commanderPrimaryAssignedHere
      || commanderTwinAssignedHere;
    const activeWarButton = !activeWar ? '' : territoryFrontAssignment
      && territoryFrontMission
      ? `<button class="commander-front-quick${commanderAssignedHere ? ' is-assigned' : ''}" data-action="focus-war" data-territory="${escapeHtml(territoryId)}" title="APEX chooses the highest-impact reachable front automatically.">${commanderTwinAssignedHere ? 'TWIN 60% · SHARED SHIELD' : commanderAssignedHere ? 'APEX SUPPORTING' : 'FOCUS FRONT'}</button>`
      : '<button class="commander-front-quick" disabled>NO ACTIVE FRONT HERE</button>';
    const primaryWarAction = owner.id === humanId ? '' : `<section class="territory-target-command ${activeWar ? territoryFront ? 'is-active-front' : 'is-blocked' : !declaration?.allowed ? 'is-blocked' : ''}"><div class="territory-target-power"><span>COMBAT POWER</span><strong>${compactNumber(power)}</strong><small>#${ownerRank} GLOBAL MILITARY</small></div><div class="territory-target-systems"><span><small>ATTACK</small><b>${format(attack, 2)}</b></span><span><small>DEFENCE</small><b>${format(defense, 2)}</b></span><span><small>READY</small><b>${format(manpowerRatio * 100)}%</b></span></div><div class="territory-target-decision"><span>${activeWar ? territoryFront ? 'ACTIVE FRONT' : 'WAR ACTIVE · NO FRONT HERE' : declaration?.allowed ? `${warAccessLabel(access)} ATTACK ROUTE` : 'ATTACK UNAVAILABLE'}</span>${activeWar ? activeWarButton : `<button class="danger-button" data-action="quick-war" data-player="${owner.id}" ${declaration?.allowed ? '' : 'disabled'}>${declaration?.allowed ? 'REVIEW ATTACK' : 'WAR UNAVAILABLE'}</button>`}</div></section>${declaration?.warning ? `<div class="war-rule-note is-warning"><b>WEAK-ARMY WARNING</b><span>${escapeHtml(declaration.warning)}</span></div>` : ''}${blockedWarNote}`;
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
    const playerAlliancesVisible = this.options.scenarioConfig?.mode !== 'standard-2026';
    const playerAlliancePanel = !playerAlliancesVisible || !otherHumanPlayer ? '' : allied
      ? '<div class="war-rule-note is-alliance"><b>PLAYER ALLIANCE ACTIVE</b><span>Mutual non-aggression pact · war between both human countries is blocked.</span></div>'
      : allianceOffer?.toId === humanId
        ? `<div class="war-rule-note is-alliance"><b>ALLIANCE INVITATION · ${allianceWeeks}W LEFT</b><span>${escapeHtml(owner.shortName)} proposes a mutual non-aggression pact.</span></div><div class="territory-actions territory-actions--alliance"><button class="ghost-button" data-action="respond-alliance" data-from="${owner.id}" data-to="${humanId}" data-accept="false">DECLINE</button><button class="primary-button" data-action="respond-alliance" data-from="${owner.id}" data-to="${humanId}" data-accept="true">ACCEPT ALLIANCE</button></div>`
        : allianceOffer
          ? `<div class="war-rule-note is-alliance"><b>ALLIANCE INVITATION SENT · ${allianceWeeks}W LEFT</b><span>Waiting for ${escapeHtml(owner.shortName)} to accept or decline.</span></div>`
          : `<div class="territory-actions territory-actions--alliance"><button class="secondary-button" data-action="propose-alliance" data-player="${owner.id}" ${allianceStatus?.allowed ? '' : 'disabled'} title="${escapeHtml(allianceStatus?.reason ?? 'Offer a mutual non-aggression pact to this human player.')}">PROPOSE PLAYER ALLIANCE</button></div>`;
    const ownerIntel = isOwnTerritory ? '' : `
      <span class="section-label territory-section-label">OWNER INTEL</span>
      <section class="territory-owner-intel unified-stat-grid" aria-label="${escapeHtml(owner.name)} national intelligence">
        <article class="${manpowerRatio < 0.55 ? 'is-warn' : 'is-good'}"><span>ARMY</span><strong>${armyCapacityLabel(army.deployed, army.capacity)}</strong><small>${format(manpowerRatio * 100)}% · reserve ${people(owner.trainedReserves)}</small></article>
        <article><span>POWER</span><strong>${compactNumber(power)}</strong><small>Current combat power</small></article>
        <article><span>IQ</span><strong>${format(iq.score, 1)}</strong><small>National systems score</small></article>
        <article><span>ECONOMY</span><strong>${cash(economy.controlledOutput)}</strong><small>${cash(economy.wealthPerPerson / 1e6)} GDP / capita</small></article>
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
          <article><span>RESIDENTS</span><strong>${population(territory.population)}</strong><small>${survivalTransitOnly ? 'No local contribution' : territory.integrationProgram ? `${population(unlockedPopulation)} unlocked` : 'Resident population'}</small></article>
          <article class="is-economy"><span>LOCAL ECONOMY</span><strong>${cash(territory.economy)}</strong><small>${survivalTransitOnly ? 'No local production' : territory.integrationProgram ? `${cash(unlockedOutput)} unlocked` : 'Live local output'}</small></article>
          <article class="is-army"><span>LOCAL ARMY / MAX</span><strong>${people(territory.army.manpower)} / ${people(deploymentCeiling)}</strong><small>${format(localArmyRatio * 100)}% · local ${people(localArmyCapacity)} · support +${people(empireSupport)}</small></article>
        </section>

        ${integrationPanel}
        ${ownerIntel}
        <div class="territory-action-stack">
          ${playerAlliancePanel}
        </div>
      </aside>
    `;
  }
  private renderWarTracker(
    wars: WarStateV2[],
    finance: WeeklyFinanceBreakdownV2,
    warEstimates: ReadonlyMap<string, LiveWarEstimateV2 | undefined>,
  ): string {
    const humanId = this.viewerPlayerId();
    const own = this.totalCombatStrength(humanId);
    const commanderForce = this.engine.state.commanderForces?.[humanId];
    const commanderPower = commanderForce
      ? commanderForceMapCombatPower(commanderForce.army) : 0;
    const apexStatus = selectCommanderAutonomyStatusV2(
      this.engine.state, this.engine.content, humanId,
    );
    const apexTwin = selectApexTwinProjectionStatusV2(
      this.engine.state,
      humanId,
      this.engine.content,
    );
    const status = [
      `${wars.length} ${wars.length === 1 ? 'WAR' : 'WARS'}`,
      `${cash(annual(finance.warOperations))}/YR`,
    ].filter(Boolean).join(' · ');
    return `<aside class="war-tracker war-tracker--compact war-command-overlay glass-panel" aria-label="Active wars">
      <header class="war-tracker__title war-command-header"><span><i aria-hidden="true"></i> ACTIVE WARS</span><b>${escapeHtml(status)}</b></header>
      <div class="war-tracker__wars war-command-conflicts" data-scroll-session="tracker:wars">${wars.map((war) => {
      const enemyId = war.attackerId === humanId ? war.defenderId : war.attackerId;
      const enemy = this.engine.player(enemyId)!;
      const hostile = this.totalCombatStrength(enemyId);
      const operations = allWarOperations(war);
      const operation = operations[0];
      const estimate = warEstimates.get(war.id);
      const score = war.attackerId === humanId ? war.warScore : -war.warScore;
      const warAge = Math.max(0, this.engine.state.tick - war.startedTick);
      const source = operation ? this.engine.state.territories[operation.sourceId] : undefined;
      const target = operation ? this.engine.state.territories[operation.targetId] : undefined;
      const humanAttacks = source?.owner === humanId;
      const humanDefends = target?.owner === humanId;
      const hostileTerritoryId = operation
        ? humanAttacks ? operation.targetId : humanDefends ? operation.sourceId : operation.targetId
        : enemy.capitalId;
      const sourceName = operation
        ? this.engine.content.territories[operation.sourceId]?.name ?? operation.sourceId
        : undefined;
      const targetName = operation
        ? this.engine.content.territories[operation.targetId]?.name ?? operation.targetId
        : undefined;
      const route = operation
        ? `${humanAttacks ? 'ATTACK' : humanDefends ? 'DEFEND' : 'CONFLICT'} · ${warAccessLabel(operation.access)}`
        : 'MOBILISING';
      const frontName = sourceName && targetName ? `${sourceName} → ${targetName}` : 'Front forming';
      const outlook = estimate ? warOutlookLabel(estimate) : 'Awaiting first battle';
      const eta = estimate
        ? warTimeRange(estimate.estimatedWeeksMin, estimate.estimatedWeeksMax)
        : '';
      const ownLosses = estimate?.totalOwnLosses
        ?? (war.attackerId === humanId ? war.attackerLosses : war.defenderLosses);
      const enemyLosses = estimate?.totalEnemyLosses
        ?? (war.attackerId === humanId ? war.defenderLosses : war.attackerLosses);
      const hasLosses = ownLosses > 0 || enemyLosses > 0;
      const apexAssigned = commanderForce?.front?.warId === war.id
        || (apexTwin.active
          && apexTwin.secondaryProjection?.front.warId === war.id);
      const assignedCommanderPower = apexTwin.active && apexAssigned
        ? commanderPower * apexTwin.combatShare : commanderPower;
      const apexContributing = apexAssigned
        && apexStatus.state !== 'moving'
        && apexStatus.state !== 'rebuilding'
        && apexStatus.state !== 'absent';
      const combinedOwnPower = own.power + (apexContributing ? assignedCommanderPower : 0);
      const balance = clamp(
        combinedOwnPower / Math.max(0.000001, combinedOwnPower + hostile.power) * 100,
        0,
        100,
      );
      const apexReadout = !apexAssigned ? ''
        : apexStatus.state === 'moving'
          ? `APEX ETA ${Math.max(0, apexStatus.etaWeeks ?? 0)}W`
          : apexStatus.state === 'rebuilding'
            ? 'APEX RECOVERING'
            : apexTwin.active
              ? `APEX TWIN 60% · +${compactNumber(assignedCommanderPower)} · SHARED SHIELD`
              : `APEX +${compactNumber(assignedCommanderPower)}`;
      const allySupport = selectCoopAllySupportPreviewV2(
        this.engine.state,
        this.engine.content,
        war,
        humanId,
      );
      const allyReadout = allySupport
        ? `ALLY SUPPORT +${compactNumber(allySupport.power)}` : '';
      const outlookTone = estimate?.outlook === 'our-collapse' ? 'is-danger'
        : estimate?.outlook === 'enemy-collapse' ? 'is-positive' : 'is-neutral';
      return `<article class="war-command-conflict" style="--enemy:${escapeHtml(enemy.cssColor)}"><button type="button" data-action="focus-war" data-territory="${escapeHtml(hostileTerritoryId ?? '')}" aria-label="Focus war with ${escapeHtml(enemy.name)}. Your combined Power ${compactNumber(combinedOwnPower)}, enemy Power ${compactNumber(hostile.power)}">
        <header><i class="country-flag" aria-hidden="true">${countryFlagHtml(enemy.id, enemy.sigil)}</i><div><span>${escapeHtml(route)} · WEEK ${warAge}</span><strong>${escapeHtml(enemy.shortName)}</strong><small>${escapeHtml(frontName)}</small></div><b class="${outlookTone}">${escapeHtml(outlook)}</b></header>
        <section class="war-command-conflict__power" aria-label="Combined Power balance"><span><small>YOU</small><strong>${compactNumber(combinedOwnPower)}</strong></span><i role="progressbar" aria-label="Your share of combined Power" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${format(balance, 1)}"><b style="width:${balance}%"></b></i><span><small>ENEMY</small><strong>${compactNumber(hostile.power)}</strong></span></section>
        <footer><span>SCORE <b class="${score < 0 ? 'danger-text' : 'is-positive'}">${signed(score)}</b></span>${hasLosses ? `<span>LOSSES <b>−${people(ownLosses)} / −${people(enemyLosses)}</b></span>` : ''}${eta ? `<span>ETA <b>${escapeHtml(eta)}</b></span>` : ''}${allyReadout ? `<span class="is-positive">${escapeHtml(allyReadout)}</span>` : ''}${apexReadout ? `<span class="is-apex">${escapeHtml(apexReadout)}</span>` : ''}</footer>
      </button>
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

  private renderEventTicker(): string {
    const events = this.engine.state.events.filter(isMajorWorldEvent).slice(-8).reverse();
    const latest = events[0];
    return `<aside class="world-feed glass-panel ${this.eventFeedOpen ? 'is-open' : ''}"><button class="world-feed__head" data-action="toggle-feed"><span><b class="event-dot event-dot--${latest?.severity ?? 'info'}"></b> REPORT</span><strong>${latest ? escapeHtml(latest.message) : 'No reports'}</strong><i>${this.eventFeedOpen ? '×' : '↑'}</i></button><div class="world-feed__list">${events.map((event) => `<button data-action="focus-event" data-territory="${event.territoryId ?? ''}"><span>W${event.tick}</span><b class="event-dot event-dot--${event.severity}"></b><p>${escapeHtml(event.message)}</p></button>`).join('')}</div></aside>`;
  }

  private renderAllianceOfferBanner(offer: AllianceOfferV2): string {
    const from = this.engine.player(offer.fromId)!;
    const responseWeeks = Math.max(0, offer.expiresTick - this.engine.state.tick);
    return `<div class="decision-banner decision-banner--alliance glass-panel" style="--sender:${from.cssColor}" title="A player alliance is a mutual non-aggression pact; neither country can declare war on the other."><i class="country-flag">${countryFlagHtml(from.id, from.sigil)}</i><div><span>PLAYER ALLIANCE · ${responseWeeks}W LEFT</span><strong>${escapeHtml(from.shortName)} offers mutual non-aggression</strong></div><button class="ghost-button" data-action="respond-alliance" data-from="${from.id}" data-to="${offer.toId}" data-accept="false">DECLINE</button><button class="primary-button" data-action="respond-alliance" data-from="${from.id}" data-to="${offer.toId}" data-accept="true">ALLY</button></div>`;
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
      availableCountryIds: this.options.availableCountryIds,
      countryMasteryLevels: this.options.countryMasteryLevels,
      countryLoadouts: this.options.countryLoadouts,
    });
    this.introPreviewCountryId = picker.previewCountryId;
    return `<div class="modal-backdrop">${picker.html}</div>`;
  }

  private renderHelp(): string {
    const audioCredits = GAME_AUDIO_CREDITS.map((source) => `<li><a href="${escapeHtml(source.sourceUrl)}" target="_blank" rel="noreferrer">“${escapeHtml(source.title)}”</a> by ${escapeHtml(source.author)} · <a href="${escapeHtml(source.licenseUrl)}" target="_blank" rel="noreferrer">${escapeHtml(source.licenseLabel)}</a></li>`).join('');
    const campaignEveryNationForItself = this.options.scenarioConfig?.mode === 'standard-2026';
    return `<div class="modal-backdrop"><section class="modal-card world-help" data-scroll-session="modal:help" aria-labelledby="game-guide-title"><button class="modal-close" data-action="help" aria-label="Close game guide">×</button><header class="world-help__heading"><h2 id="game-guide-title">Field guide</h2><p>You choose expansion and targets. APEX projects an autonomous neural shield.</p></header><div class="world-help-grid">
      <article><i aria-hidden="true">◎</i><div><h3>Win and survive</h3><p>Become the final sovereign power, or unite Earth and destroy Antarctica's Zero-Point Core.</p></div></article>
      <article><i aria-hidden="true">HUD</i><div><h3>Core loop and HUD</h3><p>Read five top metrics, choose a target and let time, logistics and APEX execute.</p></div></article>
      <article><i aria-hidden="true">$</i><div><h3>Economy and treasury</h3><p>Output creates tax income; the shared treasury pays weekly commitments and APEX adds its own contribution.</p></div></article>
      <article><i aria-hidden="true">MIL</i><div><h3>Military, reserves and APEX</h3><p>APEX projects its dome to the reachable front where interception or offensive pulses have the greatest impact.</p></div></article>
      <article><i aria-hidden="true">⚔</i><div><h3>War and logistics</h3><p>Logistics Readiness is the exact supply reaching each front. Distance, route throughput and naval crossings lower it; long sea routes remain possible but difficult.</p></div></article>
      <article><i aria-hidden="true">AI</i><div><h3>APEX autonomy</h3><p>Shield Integrity is its HP. At 0% the dome collapses, recharges at a safe node and returns only at 100%.</p></div></article>
      <article><i aria-hidden="true">R&amp;D</i><div><h3>Research</h3><p>Ten programmes advance automatically, while Active Effects shows the real totals applied to your empire.</p></div></article>
      <article><i aria-hidden="true">◇</i><div><h3>Liberation and signal purge</h3><p>${campaignEveryNationForItself ? 'The machine signal shattered every alliance; each nation now fights for itself. ' : ''}Captured land starts partly usable while APEX purges the Rogue signal. A short post-war recovery window prevents immediate redeclaration.</p></div></article>
      <article><i aria-hidden="true">POL</i><div><h3>North Pole and Rogue Attention</h3><p>The staged North Pole investigation gradually improves APEX intel and preparation; it never awakens the Rogue. Time and world liberation determine when Antarctica begins to react.</p></div></article>
      <article><i aria-hidden="true">↔</i><div><h3>Controls and multiplayer</h3><p>Click territories, drag the globe, wheel or pinch to zoom, recenter with ⌖ and close drawers with Escape. Multiplayer orders are host-validated; absorbed commanders spectate.</p></div></article>
    </div><p class="help-tip"><b>Sound:</b> the ♪ button controls Music, Effects and Voice independently and stores choices on this device.</p><details class="world-help__credits" data-disclosure-session="modal:help:audio-credits"><summary>AUDIO CREDITS</summary><ul>${audioCredits}</ul></details></section></div>`;
  }

  private renderInbox(): string {
    const allEvents = this.engine.state.events.filter(isMajorWorldEvent).slice().reverse();
    const events = allEvents.filter((event) => !event.message.startsWith('APEX TRANSMISSION ·'));
    const transmissions = [...this.engine.apexTransmissions(this.viewerPlayerId())].reverse();
    const transmissionRows = transmissions.map((item) => {
      const response = item.action === 'north-pole-investigation'
        ? item.choice === 'accept'
          ? '<b class="apex-inbox-status is-accepted">OBJECTIVE COMPLETE</b>'
          : `<button class="primary-button" data-action="respond-apex-transmission" data-transmission="${item.id}" data-choice="accept">START ANALYSIS</button>`
        : item.action === 'first-strike-guidance' && item.choice === null
          ? `<button class="primary-button" data-action="respond-apex-transmission" data-transmission="${item.id}" data-choice="acknowledge">SELECT FIRST TARGET</button>`
        : item.choice === 'acknowledge'
          ? '<b class="apex-inbox-status">READ</b>'
          : `<button class="ghost-button" data-action="respond-apex-transmission" data-transmission="${item.id}" data-choice="acknowledge">ACKNOWLEDGE</button>`;
      const pendingClass = item.choice === null ? ' is-pending' : '';
      return `<article class="apex-inbox-row${pendingClass}"><i aria-hidden="true">◆</i><div><span>APEX · ALLIED AI · WEEK ${item.sentTick}</span><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body)}</p></div>${response}</article>`;
    }).join('');
    return `<div class="modal-backdrop modal-backdrop--soft"><section class="modal-card inbox-modal"><button class="modal-close" data-action="inbox">×</button><div class="panel-kicker">SITUATION INBOX</div><h2>Briefings &amp; world events</h2><div class="inbox-filters"><span>${allEvents.filter((event) => this.eventIsUnread(event)).length} unread</span><button data-action="mark-read">Mark all read</button></div><div class="inbox-list" data-scroll-session="modal:inbox">${transmissionRows ? `<section class="apex-inbox-history" aria-label="APEX transmission history"><header><div><span>APEX · ALLIED AI</span><strong>Briefing log</strong></div><small>NEWEST FIRST</small></header>${transmissionRows}</section>` : ''}${events.map((event) => `<button class="${this.eventIsUnread(event) ? 'is-unread' : ''}" data-action="focus-event" data-territory="${event.territoryId ?? ''}"><b class="event-dot event-dot--${event.severity}"></b><div><span>WEEK ${event.tick} · ${event.kind.toUpperCase()}</span><strong>${escapeHtml(event.message)}</strong></div></button>`).join('')}</div></section></div>`;
  }

  private renderWarConfirmation(targetId: PlayerId): string {
    const human = this.engine.player(this.viewerPlayerId())!;
    const target = this.engine.player(targetId)!;
    const humanFinance = this.engine.weeklyFinanceBreakdown(human.id);
    const cachedTarget = this.warTargetCache?.humanId === human.id
      && this.warTargetCache.actionSequence === this.engine.state.actionSequence
      && this.warTargetCache.tickBucket === Math.floor(this.engine.state.tick / 6)
      ? this.warTargetCache.recommendations.find((candidate) => candidate.targetId === target.id)
      : undefined;
    const forecast = cachedTarget?.forecast ?? this.engine.warForecast(human.id, target.id);
    const chance = forecast.winChance;
    const declaration = cachedTarget?.declaration
      ?? this.engine.warDeclarationStatus(human.id, target.id);
    const mobilizationWeeks = campaignProspectiveWarMobilizationTicksV2(
      this.engine.state,
      this.engine.content,
      human.id,
      target.id,
    );
    const militarySnapshot = this.engine.militaryBaseSnapshot();
    const ownPower = this.engine.currentPower(human.id, militarySnapshot);
    const targetPower = this.engine.currentPower(target.id, militarySnapshot);
    const targetRank = Math.max(
      1,
      this.ranking().findIndex((entry) => entry.player.id === target.id) + 1,
    );
    const outlook = forecast.outlook.toUpperCase();
    const logisticsPreview = forecast.access !== 'none'
      ? this.cachedWarLogisticsPreview(human.id, target.id)
      : undefined;
    const supportText = forecast.supportingForces > 0
      ? `${forecast.supportingForces} supporting arm${forecast.supportingForces === 1 ? 'y' : 'ies'}`
      : 'No supporting army';
    const chanceTone = chance >= 65 ? 'is-good' : chance >= 45 ? 'is-warn' : 'is-danger';
    const apexForecast = forecast.apexContribution;
    const apexIncluded = apexForecast.effectivePower > 0
      && (apexForecast.status === 'ready' || apexForecast.status === 'delayed');
    const apexPower = apexIncluded ? apexForecast.effectivePower : 0;
    const ownTotalPower = ownPower + apexPower;
    const powerRatio = targetPower > 0 ? ownTotalPower / targetPower : 99;
    const apexPowerLine = apexIncluded
      ? `<small class="review-apex-contribution"><b>EMPIRE ${compactNumber(ownPower)}</b> · INCLUDES +${compactNumber(apexPower)} APEX${apexForecast.etaWeeks && apexForecast.etaWeeks > 0 ? ` · ARRIVES W${apexForecast.etaWeeks}` : ''}</small>`
      : `<small class="review-apex-contribution is-unavailable"><b>APEX UNAVAILABLE</b> · ${escapeHtml(apexForecast.reason)}</small>`;
    const terrainLabel = forecast.terrain
      ? terrainPresentation(forecast.terrain).label.toUpperCase()
      : 'UNKNOWN';
    const navalLogistics = logisticsPreview?.access === 'naval';
    const addedWeeklyWarCost = logisticsPreview?.additionalWeeklyWarOperations ?? 0;
    const projectedAnnualCashflow = annual(humanFinance.net - addedWeeklyWarCost);
    const treasuryCoverWeeks = addedWeeklyWarCost > 0
      ? Math.floor(Math.max(0, human.treasury) / addedWeeklyWarCost)
      : 0;
    const routeDistance = navalLogistics
      ? logisticsPreview?.distanceKm === undefined ? 'DISTANCE UNKNOWN' : `${format(logisticsPreview.distanceKm)} KM`
      : forecast.access === 'land' ? 'DIRECT BORDER' : 'NO LEGAL ROUTE';
    const routeDetail = navalLogistics && logisticsPreview
      ? `+${format(Math.max(0, logisticsPreview.routeOperationMultiplier - 1) * 100, 0)}% sea distance cost`
      : forecast.access === 'land' ? `${terrainLabel} terrain` : 'Operation blocked';
    const reviewLogistics = presentLogisticsReadinessV2(
      forecast.attackerSupply,
      forecast.access === 'naval' ? 'naval' : 'land',
      logisticsPreview?.distanceKm ?? 0,
      forecast.attackerStrength > 0.000000001,
    );
    const costDetail = logisticsPreview
      ? `${cash(logisticsPreview.additionalWeeklyWarOperations)} / week`
      : '—';
    const annualCostDetail = logisticsPreview
      ? `${cash(annual(logisticsPreview.additionalWeeklyWarOperations))} / year`
      : 'No quote available';
    const criticalRisks: Array<{ label: string; detail: string }> = [];
    if (!declaration.allowed) {
      criticalRisks.push({ label: 'OPERATION BLOCKED', detail: declaration.reason ?? 'Attack requirements are not met.' });
    } else if (declaration.warning) {
      criticalRisks.push({ label: 'FORCE WARNING', detail: declaration.warning });
    }
    if (projectedAnnualCashflow < 0 && addedWeeklyWarCost > 0) {
      criticalRisks.push({
        label: 'DEFICIT AFTER START',
        detail: `${signedCash(projectedAnnualCashflow)} / year · ${compactWarTime(Math.min(treasuryCoverWeeks, 52_000))} added-cost cover`,
      });
    }
    if (reviewLogistics.status !== 'ready') {
      criticalRisks.push({
        label: 'LOW OPENING SUPPLY',
        detail: `${reviewLogistics.percent}% · ${reviewLogistics.limitingReason}`,
      });
    }
    if (navalLogistics && logisticsPreview && logisticsPreview.routeOperationMultiplier >= 1.75) {
      criticalRisks.push({
        label: 'LONG SEA CROSSING',
        detail: `${routeDistance} · slower reinforcement and higher recurring cost`,
      });
    }
    if (forecast.retaliationExpected) {
      criticalRisks.push({
        label: 'COUNTERATTACK POSSIBLE',
        detail: `${forecast.defenderTerritoryCount} enemy territories can keep this campaign active`,
      });
    }
    const riskReview = criticalRisks.length > 0
      ? `<section class="review-critical-risks" aria-label="Critical operation risks">${criticalRisks.slice(0, 3).map((risk) => `<article><b>${escapeHtml(risk.label)}</b><span>${escapeHtml(risk.detail)}</span></article>`).join('')}</section>`
      : '';
    return `<div class="modal-backdrop"><section class="modal-card war-confirm review-attack-modal command-modal--unified" data-scroll-session="modal:war-confirm:${escapeHtml(targetId)}" style="--target:${target.cssColor}">
      <header class="review-attack-head">
        <div class="country-flag review-attack-head__flag">${countryFlagHtml(target.id, target.sigil, true)}</div>
        <div><span>OPERATION REVIEW</span><h2>${escapeHtml(target.name)}</h2><small>#${targetRank} GLOBAL POWER · ${warAccessLabel(forecast.access)} ROUTE · ${terrainLabel}</small></div>
      </header>

      <section class="review-power-decision ${chanceTone}" aria-label="Power and win chance">
        <article class="review-power-side is-own"><span>YOUR TOTAL POWER</span><strong>${compactNumber(ownTotalPower)}</strong>${apexPowerLine}</article>
        <div class="review-win-chance"><span>WIN CHANCE</span><strong>${chance}%</strong><i><b style="width:${chance}%"></b></i><small>${escapeHtml(outlook)} · ×${format(powerRatio, 2)} power</small></div>
        <article class="review-power-side is-enemy"><span>ENEMY POWER</span><strong>${compactNumber(targetPower)}</strong><small>#${targetRank} global military</small></article>
      </section>

      <section class="review-operation-facts" aria-label="Operation route, supply, preparation and cost">
        <article class="${navalLogistics ? 'is-naval' : 'is-land'}"><span>${navalLogistics ? 'NAVAL ROUTE' : 'LAND ROUTE'}</span><strong>${routeDistance}</strong><small>${escapeHtml(routeDetail)}</small></article>
        <article class="${reviewLogistics.status === 'ready' ? 'is-ready' : 'is-risk'}"><span>LOGISTICS READINESS</span><strong>${reviewLogistics.percent}% ${reviewLogistics.statusLabel}</strong><small>${escapeHtml(reviewLogistics.limitingReason)}${forecast.supportingForces > 0 ? ` · ${supportText}` : ''}</small></article>
        <article><span>PREPARATION</span><strong>${mobilizationWeeks} WEEKS</strong><small>${warTimeRange(forecast.estimatedWeeksMin, forecast.estimatedWeeksMax)} expected campaign</small></article>
        <article class="is-cost"><span>OPERATION COST</span><strong>${costDetail}</strong><small>${annualCostDetail}</small></article>
      </section>

      <section class="review-combat-detail" aria-label="Exact combat detail">
        <article class="is-own"><span>YOUR FRONT SOLDIERS</span><strong>${people(forecast.attackerStrength)}</strong><small>ATK ${format(forecast.attackerAttack, 2)} · DEF ${format(forecast.attackerDefense, 2)} · reserve ${people(human.trainedReserves)}</small></article>
        <article class="is-enemy"><span>ENEMY FRONT SOLDIERS</span><strong>${people(forecast.defenderStrength)}</strong><small>ATK ${format(forecast.defenderAttack, 2)} · DEF ${format(forecast.defenderDefense, 2)} · reserve ${people(target.trainedReserves)}</small></article>
        <article class="is-exchange"><span>FIRST BATTLE ESTIMATE</span><strong><i>YOU −${people(forecast.projectedAttackerLosses)}</i><b>ENEMY −${people(forecast.projectedDefenderLosses)}</b></strong><small>Live forecast · terrain and position included</small></article>
      </section>

      ${riskReview}

      <footer class="review-action-footer"><button class="ghost-button" data-action="cancel-war" aria-label="Back without starting the operation">BACK</button><button class="danger-button" data-action="declare-war" ${declaration.allowed ? '' : `disabled title="${escapeHtml(declaration.reason ?? 'Attack requirements are not met.')}"`}>START OPERATION</button></footer>
    </section></div>`;
  }

  private cachedWarLogisticsPreview(
    attackerId: PlayerId,
    defenderId: PlayerId,
  ): WarLogisticsPreviewV2 {
    const epoch = `${this.engine.state.tick}:${this.engine.state.actionSequence}`;
    if (epoch !== this.warLogisticsPreviewCacheEpoch) {
      this.warLogisticsPreviewCacheEpoch = epoch;
      this.warLogisticsPreviewCache.clear();
    }
    const key = `${attackerId}:${defenderId}`;
    const cached = this.warLogisticsPreviewCache.get(key);
    if (cached) return cached;
    const preview = previewWarLogisticsV2(
      this.engine.state,
      this.engine.content,
      attackerId,
      defenderId,
    );
    // Three target cards plus one open review fit comfortably; keep a hard
    // bound so rapid map exploration cannot retain prior target projections.
    if (this.warLogisticsPreviewCache.size >= 6) this.warLogisticsPreviewCache.clear();
    this.warLogisticsPreviewCache.set(key, preview);
    return preview;
  }

  private renderSurrenderConfirmation(human: NationViewV2): string {
    const weeks = Math.max(0, this.engine.state.tick);
    const territories = this.engine.territoriesOf(human.id).length;
    return `<div class="modal-backdrop surrender-confirm-backdrop"><section class="modal-card surrender-confirm" role="dialog" aria-modal="true" aria-labelledby="surrender-title" style="--country:${human.cssColor}">
      <div class="surrender-confirm__sigil" aria-hidden="true">⚑</div>
      <div class="panel-kicker">END TIMELINE</div>
      <h2 id="surrender-title">End this future for ${escapeHtml(human.name)}?</h2>
      <p>APEX returns acquired intelligence to the origin point.</p>
      <div class="surrender-confirm__summary"><span><small>TIMELINE AGE</small><b>${weeks} weeks</b></span><span><small>TERRITORIES HELD</small><b>${territories}</b></span><span><small>REWARDS</small><b>FULL EARNED VALUE</b></span></div>
      <div class="war-rule-note is-warning"><b>PROGRESSION RETAINED</b><span>Nation Mastery XP and APEX XP use actual performance without a surrender penalty.</span><small>The final timeline report appears before you return to command.</small></div>
      <div class="panel-actions"><button class="ghost-button" data-action="cancel-surrender">KEEP PLAYING</button><button class="danger-button" data-action="confirm-surrender">END TIMELINE</button></div>
    </section></div>`;
  }

  private renderWarOutcome(outcome: WarOutcomeV2): string {
    const opponent = this.engine.player(outcome.opponentId);
    const resultLabels: Record<WarOutcomeV2['result'], string> = {
      victory: 'VICTORY',
      defeat: 'DEFEAT',
      'territorial-gain': 'TERRITORIAL GAIN',
      'territorial-loss': 'TERRITORIAL LOSS',
      stalemate: 'STALEMATE',
    };
    const gainedNames = outcome.territoriesGained.map((id) => this.engine.content.territories[id]?.name ?? id);
    const lostNames = outcome.territoriesLost.map((id) => this.engine.content.territories[id]?.name ?? id);
    const capturedTerritories = gainedNames.length
      ? `<span class="is-gained"><b>CAPTURED</b>${escapeHtml(gainedNames.join(', '))}</span>` : '';
    const lostTerritories = lostNames.length
      ? `<span class="is-lost"><b>LOST</b>${escapeHtml(lostNames.join(', '))}</span>` : '';
    const territoryDetail = capturedTerritories || lostTerritories
      ? `${capturedTerritories}${lostTerritories}`
      : '<span class="is-neutral"><b>BORDERS</b>No territory changed hands</span>';
    const cashDelta = outcome.treasuryAfter - outcome.treasuryBefore;
    const financeDetails = [
      outcome.treasurySeized > 0 ? `+${cash(outcome.treasurySeized)} seized` : '',
      outcome.treasuryLost > 0 ? `−${cash(outcome.treasuryLost)} lost` : '',
    ].filter(Boolean).join(' · ') || 'No direct war payment';
    const queueNote = this.warOutcomeQueue.length > 1
      ? `${this.warOutcomeQueue.length - 1} report${this.warOutcomeQueue.length === 2 ? '' : 's'} waiting`
      : 'Timeline updated';
    const opponentFlag = opponent
      ? `<i class="country-flag">${countryFlagHtml(opponent.id, opponent.sigil, true)}</i>` : '';
    const netTerritories = outcome.territoriesGained.length - outcome.territoriesLost.length;
    const netPopulation = outcome.gainedPopulation - outcome.lostPopulation;
    const netEconomy = outcome.gainedEconomy - outcome.lostEconomy;
    const duration = Math.max(0, outcome.endedTick - outcome.startedTick);
    const powerDelta = outcome.combatPowerAfter - outcome.combatPowerBefore;
    const powerDeltaClass = powerDelta > 0 ? 'is-positive' : powerDelta < 0 ? 'danger-text' : '';
    const signedPowerDelta = `${powerDelta > 0 ? '+' : powerDelta < 0 ? '−' : ''}${compactNumber(Math.abs(powerDelta))}`;
    const territoryDelta = `${netTerritories > 0 ? '+' : netTerritories < 0 ? '−' : ''}${Math.abs(netTerritories)}`;
    const populationDelta = `${netPopulation > 0 ? '+' : netPopulation < 0 ? '−' : ''}${population(Math.abs(netPopulation))}`;
    const economyDelta = `${netEconomy > 0 ? '+' : netEconomy < 0 ? '−' : ''}${cash(Math.abs(netEconomy))}`;
    const apexPresent = outcome.apexSupportedBattles > 0;
    const apexSupplyCoverage = outcome.apexSupplySpent > 0
      ? Math.min(100, Math.max(0, outcome.apexSupplyDelivered / outcome.apexSupplySpent * 100))
      : 100;
    const apexIntegrityDamage = (outcome.apexMaxIntegrity ?? 0) > 0
      ? Math.min(100, Math.max(0, outcome.apexLosses / outcome.apexMaxIntegrity! * 100))
      : 0;
    const apexIntegrityResult = apexIntegrityDamage >= 99.95
      ? '<span>SHIELD DEPLETED</span>'
      : `<span>SHIELD DAMAGE −${format(apexIntegrityDamage, 1)}%</span>`;
    const apexCapstoneDetail = [
      (outcome.apexSingularityPulses ?? 0) > 0
        ? `<span>SINGULARITY PULSE ×${outcome.apexSingularityPulses}</span>` : '',
      (outcome.apexMirrorCounterpulseDamage ?? 0) > 0
        ? `<span>MIRROR COUNTERPULSE −${people(outcome.apexMirrorCounterpulseDamage ?? 0)} HOSTILE</span>` : '',
      (outcome.apexTwinProjectionBattles ?? 0) > 0
        ? `<span>TWIN SPLIT ${outcome.apexTwinProjectionBattles} BATTLES · 60% + 60% SHARED SHIELD</span>` : '',
    ].filter(Boolean).join('');
    const apexDetail = apexPresent
      ? `<span>PEAK +${compactNumber(outcome.apexPeakPower)} DOME POWER</span>${apexIntegrityResult}${outcome.apexSupplySpent > 0 ? `<span>ENERGY ${format(apexSupplyCoverage, 0)}%</span>` : ''}${apexCapstoneDetail}`
      : '<span>SHIELD NOT PRESENT ON THIS FRONT</span>';
    const allySupportedBattles = outcome.allySupportedBattles ?? 0;
    const allySupportDetail = allySupportedBattles > 0
      ? `<small class="is-positive">ALLY SUPPORT +${compactNumber(outcome.allyPeakPower ?? 0)} POWER · CONTRIBUTOR LOSSES −${people(outcome.allyLosses ?? 0)}</small>`
      : '';
    const civilianLosses = (outcome.ownCivilianLosses ?? 0) + (outcome.enemyCivilianLosses ?? 0) > 0
      ? `<article><span>CIVILIAN LOSSES</span><strong>YOU −${people(outcome.ownCivilianLosses ?? 0)}</strong><small>ENEMY −${people(outcome.enemyCivilianLosses ?? 0)}</small></article>`
      : '';
    const reportId = `war-report-${outcome.warId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    return `<div class="modal-backdrop war-outcome-backdrop"><section class="modal-card war-outcome-modal war-outcome-modal--${outcome.result}" role="dialog" aria-modal="true" aria-labelledby="${escapeHtml(reportId)}-title" aria-describedby="${escapeHtml(reportId)}-reason" data-scroll-session="modal:war-outcome:${escapeHtml(outcome.warId)}" style="--outcome:${opponent?.cssColor ?? '#69d7ef'}">
      <header class="war-report__header">${opponentFlag}<div><span>WAR REPORT · WEEK ${outcome.endedTick}</span><h2 id="${escapeHtml(reportId)}-title">${escapeHtml(resultLabels[outcome.result])}</h2><p>${escapeHtml(opponent?.name ?? outcome.opponentId)}</p></div><div class="war-report__score"><small>FRONT SCORE</small><b>${signed(outcome.warScore)}</b></div></header>
      <section class="war-report__power" aria-label="Nation Power result"><div><span>NATION POWER</span><strong>${compactNumber(outcome.combatPowerBefore)}<i aria-hidden="true">→</i>${compactNumber(outcome.combatPowerAfter)}</strong><small class="${powerDeltaClass}">${signedPowerDelta}</small></div><dl><div><dt>DURATION</dt><dd>${duration} WEEKS</dd></div><div><dt>BATTLES</dt><dd>${outcome.battles}</dd></div></dl></section>
      <p class="war-report__reason" id="${escapeHtml(reportId)}-reason">${escapeHtml(outcome.reason)}</p>
      <div class="war-report__summary">
        <section class="war-report__card war-report__card--losses" aria-label="Military losses"><header><span>LOSSES</span><b>${people(outcome.survivingManpower)} ACTIVE</b></header><div><span><small>YOU</small><strong>−${people(outcome.ownLosses)}</strong></span><i aria-hidden="true"></i><span><small>ENEMY</small><strong>−${people(outcome.enemyLosses)}</strong></span></div>${allySupportDetail}</section>
        <section class="war-report__card war-report__card--territory" aria-label="Territory result"><header><span>TERRITORY</span><b class="${netTerritories > 0 ? 'is-positive' : netTerritories < 0 ? 'danger-text' : ''}">${territoryDelta} NET</b></header><div>${territoryDetail}</div></section>
        <section class="war-report__card war-report__card--apex ${apexPresent ? 'is-active' : ''}" aria-label="APEX shield contribution"><header><span>APEX SHIELD</span><b>${apexPresent ? `${outcome.apexSupportedBattles}/${outcome.battles} BATTLES` : 'NO DOME SUPPORT'}</b></header><div>${apexDetail}</div></section>
      </div>
      <details class="war-report__details" data-disclosure-session="modal:war-outcome:${escapeHtml(outcome.warId)}:full-breakdown"><summary>FULL BREAKDOWN</summary><div>
        <article><span>ATTACK RATING</span><strong>${format(outcome.effectiveAttackBefore, 2)} → ${format(outcome.effectiveAttackAfter, 2)}</strong><small>Before / after</small></article>
        <article><span>DEFENCE RATING</span><strong>${format(outcome.effectiveDefenseBefore, 2)} → ${format(outcome.effectiveDefenseAfter, 2)}</strong><small>Before / after</small></article>
        <article><span>ARMY LIMIT</span><strong>${people(outcome.capacityBefore)} → ${people(outcome.capacityAfter)}</strong><small>Active army limit</small></article>
        <article><span>TERRITORY PEOPLE</span><strong class="${netPopulation > 0 ? 'is-positive' : netPopulation < 0 ? 'danger-text' : ''}">${populationDelta}</strong><small>Net border change</small></article>
        <article><span>TERRITORY OUTPUT</span><strong class="${netEconomy > 0 ? 'is-positive' : netEconomy < 0 ? 'danger-text' : ''}">${economyDelta}</strong><small>Net annual output</small></article>
        <article><span>TREASURY</span><strong>${cash(outcome.treasuryBefore)} → ${cash(outcome.treasuryAfter)}</strong><small><em class="${cashDelta >= 0 ? 'is-positive' : 'danger-text'}">${signedCash(cashDelta)}</em> · ${escapeHtml(financeDetails)}</small></article>
        ${civilianLosses}
      </div></details>
      <footer class="war-report__actions"><small>${escapeHtml(queueNote)}</small><button class="primary-button" data-action="dismiss-war-outcome">${this.warOutcomeQueue.length > 1 ? 'NEXT REPORT' : 'CONTINUE'}</button></footer>
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
      const commanderName = commander?.name ?? commanderDefinition?.name ?? 'Humanity';
      const commanderColor = commander?.cssColor ?? commanderDefinition?.cssColor ?? '#69d7ef';
      const campaignWeeks = polar.contactTick === null || polar.victoryTick === null
        ? 0 : Math.max(0, polar.victoryTick - polar.contactTick);
      const rogueId = this.engine.content.nationIds.find((id) => (
        this.engine.content.nations[id]?.kind === 'rogue-ai'
      ));
      const liberatedAntarctica = ANTARCTIC_SECTORS_V2.filter((sector) => (
        !rogueId || state.territories[territoryIdV2(sector.id)]?.owner !== rogueId
      )).length;
      const machineTerritoriesRemaining = rogueId
        ? Object.values(state.territories).filter((territory) => territory.owner === rogueId).length
        : 0;
      return `<div class="modal-backdrop polar-victory-backdrop"><section class="modal-card victory-card polar-victory-card" style="--winner:${commanderColor}"><div class="victory-sigil" aria-hidden="true">◉</div><div class="panel-kicker">ZERO-POINT CORE CAPTURED · SURVIVAL COMPLETE</div><h1>Humanity survives.</h1><p>The strongest country of the Codex Ascendancy has fallen after ${campaignWeeks} weeks of permanent war. Its armies, economy and invasion-wave network are now offline.</p><div class="polar-victory-metrics"><span><small>ANTARCTIC STATES TAKEN</small><b>${liberatedAntarctica}/${ANTARCTIC_SECTORS_V2.length}</b></span><span><small>MACHINE TERRITORIES LEFT</small><b>${machineTerritoriesRemaining}</b></span><span><small>WAVES REACHED</small><b>${Math.max(1, polar.globalWave - 1)}</b></span></div><small>${escapeHtml(commanderName)} captured the real Zero-Point territory and ended the Rogue Empire.</small><button class="primary-button" data-action="new-game">Return to command</button></section></div>`;
    }
    const viewerId = this.viewerPlayerId();
    const absorbed = !state.players[viewerId];
    const formerName = this.engine.content.nations[viewerId]?.name ?? viewerId;
    const winnerId = state.winnerId ?? state.humanPlayerId;
    const winner = this.engine.player(winnerId);
    const winnerDefinition = this.engine.content.nations[winnerId];
    const winnerName = winner?.name ?? winnerDefinition?.name ?? 'Sovereign victor';
    const winnerColor = winner?.cssColor ?? winnerDefinition?.cssColor ?? '#69d7ef';
    const kicker = absorbed ? 'CAMPAIGN ENDED' : 'WORLD CAMPAIGN COMPLETE';
    const outcome = absorbed
      ? `${escapeHtml(formerName)} has been signal purged and liberated by ${escapeHtml(winnerName)}.`
      : `${escapeHtml(winnerName)} leads the final global military ranking.`;
    const winnerSigil = winner
      ? countryFlagHtml(winner.id, winner.sigil, true)
      : '<span aria-hidden="true">◎</span>';
    return `<div class="modal-backdrop"><section class="modal-card victory-card" style="--winner:${winnerColor}"><div class="victory-sigil country-flag">${winnerSigil}</div><div class="panel-kicker">${kicker}</div><h1>${escapeHtml(winnerName)}</h1><p>${outcome}</p><button class="primary-button" data-action="new-game">New campaign</button></section></div>`;
  }

  private renderSpectatorBanner(formerId: PlayerId, watched: NationViewV2): string {
    const formerName = this.engine.content.nations[formerId]?.name ?? formerId;
    return `<aside class="multiplayer-spectator glass-panel" role="status"><b>SPECTATOR</b><span>${escapeHtml(formerName)} has been liberated. The shared campaign continues; you are watching ${escapeHtml(watched.shortName)}.</span></aside>`;
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
                nation !== undefined
                && nation.kind !== 'rogue-ai'
                && opening.byNation.has(nation.id)
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
          case 'open-nation-arsenal': {
            const countryId = element.dataset.country;
            if (countryId) this.options.onOpenNationArsenal?.(countryId);
            break;
          }
          case 'choose-country': {
            const countryId = element.dataset.country as PlayerId;
            const definition = this.engine.content.nations[countryId];
            if (definition?.kind === 'rogue-ai'
              || (this.options.availableCountryIds
                && !this.options.availableCountryIds.has(countryId))) {
              this.toast('Defeat this nation in Campaign before starting with it.');
              break;
            }
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
          case 'open-surrender':
            this.helpOpen = false;
            this.inboxOpen = false;
            this.soundOptionsOpen = false;
            this.surrenderResumeSpeed = this.engine.state.speed === 0 ? 1 : this.engine.state.speed;
            this.confirmSurrenderOpen = true;
            this.engine.setSpeed(0);
            this.render();
            break;
          case 'cancel-surrender':
            this.confirmSurrenderOpen = false;
            this.engine.setSpeed(this.surrenderResumeSpeed);
            this.render();
            break;
          case 'confirm-surrender':
            this.confirmSurrenderOpen = false;
            this.options.onSurrenderRequested?.();
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
              if (pause.restoreSpeed !== undefined
                && !this.pendingApexTransmission()
                && this.engine.state.speed !== pause.restoreSpeed) {
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
          case 'respond-apex-transmission': {
            const transmissionId = element.dataset.transmission as ApexTransmissionIdV2 | undefined;
            const choice = element.dataset.choice as ApexTransmissionChoiceV2 | undefined;
            if (!transmissionId || choice !== 'accept' && choice !== 'acknowledge') break;
            const transmission = this.engine.apexTransmissions(this.viewerPlayerId())
              .find((item) => item.id === transmissionId);
            const result = this.engine.respondApexTransmission(
              this.viewerPlayerId(),
              transmissionId,
              choice,
            );
            if (!commandAccepted(result)) {
              this.toast(commandReason(result) ?? 'That APEX transmission is no longer actionable.');
              break;
            }
            this.apexTransmissionPendingResponseId = transmissionId;
            if (choice === 'accept') {
              this.inboxOpen = false;
              this.helpOpen = false;
              this.soundOptionsOpen = false;
              this.selectedTerritoryId = undefined;
              this.clearPolarSelection();
              this.panelMode = 'research';
              this.contextPanelOpen = true;
              this.updateMapSelection();
              this.toast('SIGNAL TRIANGULATION STARTED');
              this.render();
            } else if (transmission?.action === 'first-strike-guidance'
              && transmission.targetId
              && this.engine.state.territories[transmission.targetId]) {
              const targetOwner = this.engine.state.territories[transmission.targetId]!.owner;
              if (targetOwner === this.viewerPlayerId()
                || !this.engine.warDeclarationStatus(this.viewerPlayerId(), targetOwner).allowed) {
                this.toast('That first-strike window changed. Open War for the latest verified target.');
                this.panelMode = 'war';
                this.contextPanelOpen = true;
                this.render();
                break;
              }
              this.inboxOpen = false;
              this.helpOpen = false;
              this.soundOptionsOpen = false;
              this.selectedTerritoryId = transmission.targetId;
              this.clearPolarSelection();
              this.panelMode = 'war';
              this.contextPanelOpen = true;
              this.confirmWarTargetId = targetOwner;
              this.updateMapSelection();
              mapBridge.scene?.focusAction(undefined, transmission.targetId);
              this.render();
            } else {
              this.render();
            }
            break;
          }
          case 'complete-apex-transmission':
            this.completeApexTransmissionReveal();
            break;
          case 'start-arctic-project': {
            const projectId = element.dataset.project as ArcticProjectIdV2 | undefined;
            if (!projectId) break;
            const terms = this.engine.arcticProjectTerms(this.viewerPlayerId(), projectId);
            if (!terms.allowed) {
              this.toast(terms.reason ?? 'This signal stage is not available yet.');
              break;
            }
            const result = this.engine.startArcticProject(this.viewerPlayerId(), projectId);
            if (!commandAccepted(result)) {
              this.toast(commandReason(result) ?? 'The signal stage could not be started.');
              break;
            }
            this.toast('ROGUE SIGNAL STAGE STARTED');
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
    const apexModal = this.hud.querySelector<HTMLElement>('.apex-transmission-channel');
    if (apexModal) {
      const actions = apexModal.querySelector<HTMLElement>('.apex-transmission__actions');
      const focusable = actions?.hidden
        ? []
        : [...apexModal.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      if (!apexModal.contains(document.activeElement)) {
        (focusable[0] ?? apexModal).focus();
      }
      apexModal.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if ((event.key === 'Enter' || event.key === ' ')
          && apexModal.classList.contains('is-revealing')) {
          event.preventDefault();
          this.completeApexTransmissionReveal();
          return;
        }
        if (event.key !== 'Tab') return;
        if (focusable.length === 0) {
          event.preventDefault();
          apexModal.focus();
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
      this.scheduleApexTransmissionReveal();
    }
  }
}
