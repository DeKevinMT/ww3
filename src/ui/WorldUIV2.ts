import { REGION_BY_ID } from '../game/data/worldMap';
import { mapBridge, type MapTerritoryState, type WorldMapEngineContract } from '../game/map/bridge';
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
import { WORLD_CONTENT_V2 } from '../sim/v2/content';
import {
  territoryIntegrationAnnualCostV2,
  territoryIntegrationDurationWeeksV2,
} from '../sim/v2/integration';
import {
  selectNationalIqViewV2,
  selectResearchEffectImpactV2,
  type MilitaryBaseSnapshotV2,
  type PowerSnapshotV2,
} from '../sim/v2/selectors';
import { countryFlagHtml } from './countryFlags';
import { summarizeFoodTradeV2 } from './foodTrade';
import { projectMapArmyV2 } from './mapArmyProjection';
import {
  beginWarOutcomePauseV2,
  enqueueWarOutcomeV2,
  finishWarOutcomePauseV2,
} from './warOutcomeQueue';
import { summarizeWarStrainV2 } from './warStrain';
import {
  captureScrollSessions,
  drawerScrollSessionId,
  restoreScrollSessions,
} from './scrollSessions';
import type {
  ArmyStateV2,
  ArmyStrengthV2,
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
};

/**
 * Narrow UI facade for WorldEngineV2. Keeping the UI on this contract makes the
 * simulation replaceable without leaking mutable internals into the DOM layer.
 */
export interface WorldEngineV2UIContract {
  readonly state: WorldStateV2;
  /** The local country being viewed. Differs from the canonical primary player in multiplayer. */
  readonly viewerPlayerId?: PlayerId;
  player(playerId: string): NationViewV2 | undefined;
  territoriesOf(playerId: string): readonly TerritoryViewV2[];
  subscribe(listener: (state: WorldStateV2, change: WorldChangeV2) => void): () => void;
  chooseCountry(countryId: string): CommandOutcome;
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
  nationalAiPlan(playerId: string): NationalAiPlanV2;
  globalResistance(): GlobalResistanceV2;
  globalRanking(powerSnapshot?: PowerSnapshotV2): RankingEntryV2[];
  militaryBaseSnapshot(): MilitaryBaseSnapshotV2;
  powerSnapshot(militaryBaseSnapshot?: MilitaryBaseSnapshotV2): PowerSnapshotV2;
  effectiveAttack(playerId: string, army: ArmyStateV2, snapshot?: MilitaryBaseSnapshotV2): number;
  effectiveDefense(playerId: string, army: ArmyStateV2, snapshot?: MilitaryBaseSnapshotV2): number;
  effectivePower(playerId: string, army: ArmyStateV2, snapshot?: MilitaryBaseSnapshotV2): number;
  territoryPower(territoryId: string): number;
  currentPower(playerId: string, snapshot?: MilitaryBaseSnapshotV2): number;
  conventionalPower(playerId: string): number;
  strategicScore(playerId: string): number;
  nuclearPower(playerId: string): NuclearPowerViewV2;
  researchPortfolio(playerId: string): readonly ResearchBranchProgressV2[];
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
  markAllEventsRead(): void;
  setSpeed(speed: WorldSpeedV2): void;
}

export interface WorldUIV2Options {
  introOpen?: boolean;
  multiplayer?: boolean;
  controllerNames?: ReadonlyMap<PlayerId, string>;
  onMultiplayerRequested?: () => void;
}

type PanelMode = 'war' | 'nation' | 'progress' | 'economy' | 'ranking';
export type IntroSort = 'power' | 'military' | 'attack' | 'defense' | 'iq' | 'manpower' | 'economy' | 'economic-growth' | 'tax' | 'population' | 'growth';

export const INTRO_SORT_OPTIONS: readonly { value: IntroSort; label: string }[] = [
  { value: 'power', label: 'Global rank' },
  { value: 'military', label: 'Military power' },
  { value: 'attack', label: 'Attack (ATK)' },
  { value: 'defense', label: 'Defense (DEF)' },
  { value: 'iq', label: 'IQ' },
  { value: 'manpower', label: 'Army manpower' },
  { value: 'economy', label: 'Economy' },
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

export function globalRankingDetail(combatPower: number, controlledOutput: number): string {
  return `COMBAT ${compactNumber(combatPower)} · ECONOMY ${cash(controlledOutput)}`;
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
    const { tick, actionSequence, humanPlayerId } = engine.state;
    if (this.cached
      && this.cached.tick === tick
      && this.cached.actionSequence === actionSequence
      && this.cached.humanPlayerId === humanPlayerId) return this.cached;

    const militaryBaseSnapshot = engine.militaryBaseSnapshot();
    const powerSnapshot = engine.powerSnapshot(militaryBaseSnapshot);
    const openingFinance = engine.openingCandidateFinancePlans(powerSnapshot);
    const ranking = engine.globalRanking(powerSnapshot);
    const rankByNation = new Map(ranking.map((entry, index) => [entry.player.id, index + 1]));
    const scoreByNation = new Map(ranking.map((entry) => [entry.player.id, entry.score]));
    const byNation = new Map<PlayerId, IntroNationMetricsV2>();

    for (const playerId of WORLD_CONTENT_V2.nationIds) {
      const player = engine.player(playerId);
      const finance = openingFinance.get(playerId);
      if (!player || !finance) continue;
      const army = engine.armyStrength(playerId);
      const armyState = nationalArmyState(engine, playerId, army, militaryBaseSnapshot);
      const combatPower = powerSnapshot.byNation.get(playerId) ?? 0;
      const economyView = engine.nationalEconomy(playerId);
      const iqView = selectNationalIqViewV2(engine.state, WORLD_CONTENT_V2, playerId);
      const populationDynamics = engine.populationDynamics(playerId, finance.populationGrowth);
      byNation.set(playerId, {
        player,
        army,
        combatPower,
        economyView,
        finance,
        populationDynamics,
        iqView,
        rank: rankByNation.get(playerId) ?? 999,
        power: scoreByNation.get(playerId) ?? 0,
        military: combatPower,
        attack: engine.effectiveAttack(playerId, armyState, militaryBaseSnapshot),
        defense: engine.effectiveDefense(playerId, armyState, militaryBaseSnapshot),
        iq: iqView.score,
        manpower: army.deployed,
        economy: economyView.output,
        'economic-growth': finance.annualEconomyGrowthRate * 100,
        tax: economyView.dynamicTaxRate * 100,
        population: economyView.population,
        growth: populationDynamics.annualNetRate * 100,
      });
    }

    this.cached = { tick, actionSequence, humanPlayerId, byNation, openingFinance, ranking };
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

export function createMapSnapshot(engine: WorldEngineV2UIContract): WorldMapEngineContract['state'] {
  const source = engine.state;
  const militaryBaseSnapshot = engine.militaryBaseSnapshot();
  const canonical = source.territories as unknown as Record<string, TerritoryStateV2>;
  const territoryEntries = Object.entries(canonical);
  const sortedWars = [...source.wars].sort((left, right) => left.id.localeCompare(right.id));
  const territories: Record<string, MapTerritoryState> = {};
  for (const [id, territory] of territoryEntries) {
    territories[id] = mapTerritory(
      id,
      territory,
      projectMapArmyV2(engine, id as TerritoryId, territory, militaryBaseSnapshot),
    );
  }
  return {
    tick: source.tick,
    humanPlayerId: engine.viewerPlayerId ?? source.humanPlayerId,
    humanPlayerIds: [...source.humanPlayerIds],
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
    refreshSnapshot: () => {
      const { tick, actionSequence } = engine.state;
      const humanPlayerId = engine.viewerPlayerId ?? engine.state.humanPlayerId;
      if (snapshot && snapshotTick === tick && snapshotActionSequence === actionSequence
        && snapshotHumanPlayerId === humanPlayerId) return;
      snapshot = createMapSnapshot(engine);
      snapshotTick = tick;
      snapshotActionSequence = actionSequence;
      snapshotHumanPlayerId = humanPlayerId;
    },
  };
}

export class WorldUIV2 {
  private readonly hud: HTMLElement;
  private readonly tooltip: HTMLElement;
  private readonly toastLayer: HTMLElement;
  private selectedTerritoryId?: TerritoryId;
  private panelMode: PanelMode = 'war';
  private introOpen: boolean;
  private helpOpen = false;
  private inboxOpen = false;
  private eventFeedOpen = false;
  private contextPanelOpen = false;
  private confirmWarTargetId?: PlayerId;
  private confirmCeasefireWarId?: string;
  private introPreviewCountryId: PlayerId = WORLD_CONTENT_V2.nationIds.find((id) => id === 'usa') ?? WORLD_CONTENT_V2.nationIds[0]!;
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
  private unsubscribe?: () => void;
  private renderTimer?: number;
  private renderFrame?: number;
  private pendingMapSync = false;
  private introSearchTimer?: number;
  private readonly warOutcomeQueue: WarOutcomeV2[] = [];
  private warOutcomeResumeSpeed?: WorldSpeedV2;
  private readonly conquestTransferTimers = new Set<number>();
  private suppressMapUntil = 0;
  private readonly uiPointerIds = new Set<number>();
  private readonly locallyReadEventIds = new Set<number>();
  private uiHoverBlocked = false;
  private readonly responsiveStyle: HTMLStyleElement;

  constructor(
    private readonly engine: WorldEngineV2UIContract,
    private readonly options: WorldUIV2Options = {},
  ) {
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
      .world-ui-v2 .v2-metrics::-webkit-scrollbar { display: none; }
      @media (max-width: 1120px) {
        .world-ui-v2 .v2-topbar { grid-template-columns: minmax(145px,190px) minmax(420px,1fr) auto !important; }
        .world-ui-v2 .v2-metrics span { display: none; }
        .world-ui-v2 .v2-metrics small { font-size: 9px !important; }
      }
      @media (max-width: 840px) {
        .world-ui-v2 .v2-topbar { grid-template-columns: minmax(125px,1fr) auto auto !important; }
        .world-ui-v2 .v2-metrics { position: absolute; top: 64px; right: 0; left: 0; height: 42px; padding: 4px; grid-template-columns: repeat(6,minmax(88px,1fr)) !important; border: 1px solid rgba(107,221,242,.12); border-radius: 9px; background: rgba(7,20,34,.94); }
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
    this.rankingCache = initialIntroMetrics.ranking;
    this.lastRankingCalculationAt = performance.now();
    mapBridge.engine = createMapEngineAdapter(engine, () => this.ranking(), options.controllerNames);
    mapBridge.sync();
    mapBridge.onTerritoryClick = (territoryId) => {
      if (performance.now() >= this.suppressMapUntil) this.selectTerritory(territoryId as TerritoryId);
    };
    mapBridge.onTerritoryHover = (territoryId, x, y) => this.showTooltip(territoryId as TerritoryId | undefined, x, y);
    this.unsubscribe = engine.subscribe((_state, change) => this.onStateChange(change));
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('pointerup', this.onWindowPointerRelease, true);
    window.addEventListener('pointercancel', this.onWindowPointerRelease, true);
    window.addEventListener('pointermove', this.onWindowPointerMove, true);
    this.hud.addEventListener('pointerdown', this.onHudPointerDown, true);
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
    for (const timer of this.conquestTransferTimers) window.clearTimeout(timer);
    this.conquestTransferTimers.clear();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('pointerup', this.onWindowPointerRelease, true);
    window.removeEventListener('pointercancel', this.onWindowPointerRelease, true);
    window.removeEventListener('pointermove', this.onWindowPointerMove, true);
    this.hud.removeEventListener('pointerdown', this.onHudPointerDown, true);
    this.uiPointerIds.clear();
    this.uiHoverBlocked = false;
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

  private syncMapInputBlock(): void {
    const modalOpen = this.introOpen || this.helpOpen || this.inboxOpen
      || Boolean(this.confirmWarTargetId) || Boolean(this.confirmCeasefireWarId)
      || this.warOutcomeQueue.length > 0
      || this.shouldPromptEmpireName() || this.engine.state.gameOver;
    mapBridge.setInputBlocked(modalOpen || this.uiHoverBlocked || this.uiPointerIds.size > 0);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.introOpen || this.helpOpen || this.inboxOpen || this.confirmWarTargetId || this.confirmCeasefireWarId || this.warOutcomeQueue.length > 0 || this.shouldPromptEmpireName()) return;
    if (event.key === 'Escape') {
      this.selectedTerritoryId = undefined;
      this.contextPanelOpen = false;
      this.updateMapSelection();
      this.render();
    }
  };

  private onStateChange(change: WorldChangeV2): void {
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
        ?? WORLD_CONTENT_V2.nations[change.defeatedId];
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
        if (this.pendingMapSync) mapBridge.sync();
        this.pendingMapSync = false;
        this.render();
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
    if (this.introOpen || this.helpOpen || this.inboxOpen || this.confirmWarTargetId || this.confirmCeasefireWarId || this.warOutcomeQueue.length > 0 || this.shouldPromptEmpireName()) return;
    this.selectedTerritoryId = territoryId;
    this.contextPanelOpen = true;
    this.updateMapSelection();
    this.render();
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
      for (const connection of WORLD_CONTENT_V2.territories[source.id]?.connections ?? []) {
        const owner = this.engine.state.territories[connection.targetId]?.owner;
        if (owner && owner !== humanId) candidateOwners.add(owner);
      }
    }
    const attackableOwners = new Set([...candidateOwners].filter((targetId) => (
      this.engine.warDeclarationStatus(humanId, targetId).allowed
    )));
    return WORLD_CONTENT_V2.territoryIds.filter((territoryId) => {
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
    const samePanel = this.contextPanelOpen && !this.selectedTerritoryId && this.panelMode === mode;
    this.selectedTerritoryId = undefined;
    this.updateMapSelection();
    this.panelMode = mode;
    this.contextPanelOpen = !samePanel;
    this.render();
  }

  private showTooltip(territoryId: TerritoryId | undefined, x: number, y: number): void {
    if (!territoryId) {
      this.tooltip.classList.remove('is-visible');
      return;
    }
    const territory = this.engine.state.territories[territoryId];
    const definition = WORLD_CONTENT_V2.territories[territoryId];
    const owner = territory ? this.engine.player(territory.owner) : undefined;
    if (!territory || !definition || !owner) return;
    const integration = territory.coreOwner !== territory.owner && territory.integration < 0.999999
      ? ` · INTEGRATION ${format(territory.integration * 100)}%` : '';
    const localHuman = owner.id === this.viewerPlayerId();
    const controllerName = this.options.controllerNames?.get(owner.id);
    const controller = owner.isHuman
      ? `<div class="tooltip__controller ${localHuman ? 'is-local' : ''}"><b>${localHuman ? 'YOU' : escapeHtml(controllerName ?? 'HUMAN PLAYER')}</b><span>${localHuman ? 'YOUR COUNTRY' : 'HUMAN CONTROLLED'}</span></div>`
      : '';
    this.tooltip.innerHTML = `
      <div class="tooltip__eyebrow">${escapeHtml(REGION_BY_ID[definition.regionId]?.name ?? definition.regionId)}</div>
      <strong>${escapeHtml(definition.name)}</strong>
      <span style="color:${owner.cssColor}">${escapeHtml(owner.name)}</span>
      ${controller}
      <div class="tooltip__stats">MANPOWER ${people(territory.army.manpower)} / ${people(territory.army.capacity)} · ATK ${format(this.engine.effectiveAttack(owner.id, territory.army), 2)} · DEF ${format(this.engine.effectiveDefense(owner.id, territory.army), 2)} · ${armyCondition(territory.army, territory.condition)}${integration}</div>
    `;
    this.tooltip.style.left = `${Math.min(window.innerWidth - 230, x + 16)}px`;
    this.tooltip.style.top = `${Math.min(window.innerHeight - 130, y + 14)}px`;
    this.tooltip.classList.add('is-visible');
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

  private render(): void {
    const introSearch = this.hud.querySelector<HTMLInputElement>('#country-search');
    const restoreIntroSearchFocus = introSearch === document.activeElement;
    const introSearchSelectionStart = introSearch?.selectionStart ?? this.introSearchQuery.length;
    const introSearchSelectionEnd = introSearch?.selectionEnd ?? introSearchSelectionStart;
    if (introSearch) this.introSearchQuery = introSearch.value;
    const scrollSnapshot = captureScrollSessions(
      this.hud.querySelectorAll<HTMLElement>('[data-scroll-session]'),
    );
    const introGrid = this.hud.querySelector<HTMLElement>('.country-grid');
    if (introGrid) this.introGridScrollTop = introGrid.scrollTop;
    const empireInput = this.hud.querySelector<HTMLInputElement>('#empire-name');
    const restoreEmpireFocus = empireInput === document.activeElement;
    if (empireInput) this.empireNameDraft = empireInput.value;

    const state = this.engine.state;
    const viewerId = this.viewerPlayerId();
    const viewer = this.engine.player(viewerId);
    const human = viewer ?? this.engine.player(state.humanPlayerId);
    const spectating = !viewer;
    if (!human) {
      if (state.gameOver && state.winnerId && this.engine.player(state.winnerId)) {
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
    // This is the authoritative next-week recurring forecast.
    const displayedNet = finance.net;
    const army = humanOpening?.army ?? this.engine.armyStrength(human.id);
    const combatPower = humanOpening?.combatPower ?? this.engine.currentPower(human.id);
    // Reuse the already calculated finance plan. Population dynamics otherwise
    // calculate a second full finance/power snapshot for the same render.
    const populationDynamics = humanOpening?.populationDynamics
      ?? this.engine.populationDynamics(human.id, finance.populationGrowth);
    const integratedPopulation = this.engine.controlledPopulation(human.id);
    const populationTrend = integratedPopulation
      * ((1 + populationDynamics.annualNetRate) ** (1 / 52) - 1);
    const annualFoodBalanceRate = annual(finance.foodBalance)
      / Math.max(0.000001, finance.foodStorageCapacity);
    const annualFoodBalancePercent = Math.abs(annualFoodBalanceRate * 100) < 0.005
      ? 0 : annualFoodBalanceRate * 100;
    const completedUpgrades = Object.values(human.research.breakthroughs).reduce((sum, value) => sum + value, 0);
    const ranking = introOpening?.ranking ?? this.ranking();
    const humanRank = Math.max(1, ranking.findIndex((entry) => entry.player.id === human.id) + 1);
    const unread = state.events.filter((event) => this.eventIsUnread(event) && isMajorWorldEvent(event)).length;
    const pendingOffers = viewer
      ? state.offers.filter((offer) => offer.toId === viewer.id && offer.status === 'pending')
      : [];
    const activeOffer = pendingOffers[0];
    const wars = this.humanWars();
    const warOutcome = this.warOutcomeQueue[0];
    const commandOpen = this.contextPanelOpen && !this.selectedTerritoryId;
    if (this.introOpen || this.helpOpen || this.inboxOpen || this.confirmWarTargetId || this.confirmCeasefireWarId || warOutcome || this.shouldPromptEmpireName() || state.gameOver) this.tooltip.classList.remove('is-visible');

    this.hud.innerHTML = `
      <header class="situation-topbar command-topbar glass-panel v2-topbar v2-interactive simple-topbar" style="grid-template-columns:minmax(190px,250px) minmax(520px,1fr) auto">
        <div class="coalition-chip command-identity" style="--coalition:${human.cssColor}">
          <span class="country-flag" aria-hidden="true">${countryFlagHtml(human.id, human.sigil, true)}</span><div class="coalition-chip__body"><small>${worldDateLabel(state.tick)} · AI ${escapeHtml(finance.aiMode.toUpperCase())}</small><div class="command-identity__line"><strong title="${escapeHtml(human.name)}">${escapeHtml(human.shortName)}</strong><button class="v2-rank-badge" data-action="ranking" aria-label="Open global ranking; ${escapeHtml(human.name)} is rank ${humanRank} of ${ranking.length} active countries">#${humanRank}/${ranking.length}</button></div></div>
        </div>
        <div class="strategic-metrics v2-metrics simple-metrics" style="display:grid;grid-template-columns:repeat(6,minmax(76px,1fr));gap:4px;overflow-x:auto">
          <div class="top-metric--economy" data-stat-target="economy" role="group" aria-label="Economy ${cash(economy.controlledOutput)}; annual growth ${signed(finance.annualEconomyGrowthRate * 100, 2)} percent"><span>ECONOMY</span><strong>${cash(economy.controlledOutput)}</strong><small class="weekly-delta ${finance.annualEconomyGrowthRate >= 0 ? 'is-positive' : 'is-negative'}">${signed(finance.annualEconomyGrowthRate * 100, 2)}%/year</small></div>
          <div role="group" aria-label="APEX national management mode ${escapeHtml(finance.aiMode)}"><span>APEX</span><strong>${escapeHtml(finance.aiMode.toUpperCase())}</strong><small>Reserves managed automatically</small></div>
          <div data-stat-target="people" role="group" title="Integrated people available to the empire; annual population change ${signed(populationDynamics.annualNetRate * 100, 2)}%" aria-label="Integrated population ${format(integratedPopulation, 2)} million; annual population change ${signed(populationDynamics.annualNetRate * 100, 2)} percent"><span>PEOPLE</span><strong>${population(integratedPopulation)}</strong><small class="weekly-delta ${populationTrend >= 0 ? 'is-positive' : 'is-negative'}">${signed(populationDynamics.annualNetRate * 100, 2)}%/year</small></div>
          <div data-stat-target="food" role="group" title="Annual food surplus or shortage as a share of storage capacity" aria-label="Food stock ${people(human.foodStock)} of ${people(finance.foodStorageCapacity)} capacity; annual food balance ${signed(annualFoodBalancePercent, 2)} percent of capacity"><span>FOOD</span><strong>${people(human.foodStock)} / ${people(finance.foodStorageCapacity)}</strong><small class="weekly-delta ${annualFoodBalancePercent >= 0 ? 'is-positive' : 'is-negative'}">${signed(annualFoodBalancePercent, 2)}%/year</small></div>
          <div class="top-metric--army" data-stat-target="army" role="group" title="Active army over capacity, followed by trained reserves over their one-army maximum." aria-label="Army ${people(army.deployed)} active of ${people(army.capacity)} capacity; trained reserves ${people(human.trainedReserves)} of ${people(finance.trainedReserveCapacity)}; combat power ${compactNumber(combatPower)}"><span>ARMY</span><strong>${armyCapacityLabel(army.deployed, army.capacity)}</strong><small>RES ${people(human.trainedReserves)} / ${people(finance.trainedReserveCapacity)} · PWR ${compactNumber(combatPower)}</small></div>
          <div class="top-metric--research" role="group" aria-label="Research ${completedUpgrades} completed upgrades; ${cash(annual(finance.research))} funded per year"><span>RESEARCH</span><strong>${completedUpgrades} upgrades</strong><small>${cash(annual(finance.research))}/yr funded</small></div>
        </div>
        <div class="top-actions">
          <button class="icon-button inbox-button ${unread ? 'has-alert' : ''}" data-action="inbox" title="Reports">⌁${unread ? `<i>${unread}</i>` : ''}</button>
          <button class="icon-button" data-action="camera-reset" title="Center map">⌖</button>
          <button class="icon-button" data-action="help" title="Help">?</button>
        </div>
      </header>

      ${!spectating ? `<nav class="command-dock glass-panel" aria-label="Command center">
        <button class="${commandOpen && this.panelMode === 'war' ? 'is-active' : ''} ${wars.length ? 'has-war' : ''}" data-action="panel" data-panel="war"><i>⚔</i><span><b>WAR</b><small>${wars.length ? `${wars.length} active` : 'Choose target'}</small></span></button>
        <button class="${commandOpen && this.panelMode === 'nation' ? 'is-active' : ''}" data-action="panel" data-panel="nation"><i>◇</i><span><b>NATION</b><small>AI · ${escapeHtml(finance.aiMode)}</small></span></button>
        <button class="${commandOpen && this.panelMode === 'progress' ? 'is-active' : ''}" data-action="panel" data-panel="progress"><i>⌁</i><span><b>PROGRESS</b><small>${completedUpgrades} upgrades</small></span></button>
        <button class="${commandOpen && this.panelMode === 'economy' ? 'is-active' : ''} ${displayedNet < 0 ? 'is-negative' : ''}" data-action="panel" data-panel="economy"><i>$</i><span><b>ECONOMY</b><small>${signed(finance.annualEconomyGrowthRate * 100, 2)}%/yr</small></span></button>
      </nav>` : ''}

      ${wars.length || human.warFatigue > 0 ? this.renderWarStrainMeter(human, wars, army, finance, true) : ''}
      ${wars.length ? this.renderWarTracker(wars) : ''}
      ${this.contextPanelOpen && !spectating ? this.renderContextPanel(human, economy, finance, populationDynamics) : ''}
      ${activeOffer ? this.renderOfferBanner(activeOffer) : ''}
      ${!warOutcome && introOpening ? this.renderIntro(introOpening) : ''}
      ${!warOutcome && this.helpOpen ? this.renderHelp() : ''}
      ${!warOutcome && this.inboxOpen ? this.renderInbox() : ''}
      ${!warOutcome && this.confirmWarTargetId ? this.renderWarConfirmation(this.confirmWarTargetId) : ''}
      ${!warOutcome && this.confirmCeasefireWarId ? this.renderCeasefireConfirmation(this.confirmCeasefireWarId) : ''}
      ${warOutcome ? this.renderWarOutcome(warOutcome) : ''}
      ${!warOutcome && this.shouldPromptEmpireName() && !this.helpOpen && !this.inboxOpen && !this.confirmWarTargetId && !this.confirmCeasefireWarId ? this.renderEmpireNamePrompt() : ''}
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
    if (territory && this.selectedTerritoryId) return this.renderTerritoryPanel(this.selectedTerritoryId, territory);
    if (this.panelMode === 'ranking') return this.renderRankingPanel();
    if (this.panelMode === 'economy') return this.renderEconomyPanel(human, economy, finance, populationDynamics);
    if (this.panelMode === 'progress') return this.renderProgressPanel();
    if (this.panelMode === 'nation') {
      return this.renderNationPanel(human, economy, finance, populationDynamics);
    }
    return this.renderWarPanel();
  }

  private renderNationPanel(
    human: NationViewV2,
    economy: NationalEconomyV2,
    finance: WeeklyFinanceBreakdownV2,
    populationDynamics: PopulationDynamicsV2,
  ): string {
    const iq = selectNationalIqViewV2(this.engine.state, WORLD_CONTENT_V2, human.id);
    const army = this.engine.armyStrength(human.id);
    const militarySnapshot = this.engine.militaryBaseSnapshot();
    const nationalArmy = nationalArmyState(this.engine, human.id, army, militarySnapshot);
    const attack = this.engine.effectiveAttack(human.id, nationalArmy, militarySnapshot);
    const defense = this.engine.effectiveDefense(human.id, nationalArmy, militarySnapshot);
    const combatQuality = 0.55 * attack + 0.45 * defense;
    const attackShare = combatQuality > 0 ? 100 * 0.55 * attack / combatQuality : 55;
    const defenseShare = 100 - attackShare;
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
    const displayedNet = finance.net;
    const resistance = this.engine.globalResistance();
    const coalitionNames = resistance.memberIds.slice(0, 6)
      .map((id) => this.engine.player(id)?.shortName).filter(Boolean);
    const completedUpgrades = Object.values(human.research.breakthroughs)
      .reduce((sum, value) => sum + value, 0);
    const integratedPopulation = this.engine.controlledPopulation(human.id);
    const cashStatus = human.treasury < 0 ? 'DEBT RECOVERY'
      : displayedNet >= 0 ? 'GROWING' : finance.mode === 'war' ? 'WAR SPEND' : 'REBALANCING';
    const activeTreaties = this.engine.state.truces
      .filter((truce) => truce.expiresTick > this.engine.state.tick
        && (truce.leftId === human.id || truce.rightId === human.id))
      .map((truce) => {
        const opponentId = truce.leftId === human.id ? truce.rightId : truce.leftId;
        const opponent = this.engine.player(opponentId);
        const obligation = this.engine.state.ceasefireObligations.find((candidate) => (
          candidate.expiresTick > this.engine.state.tick
          && ((candidate.payerId === human.id && candidate.payeeId === opponentId)
            || (candidate.payeeId === human.id && candidate.payerId === opponentId))
        ));
        const lockWeeks = Math.max(0, truce.expiresTick - this.engine.state.tick);
        const paymentWeeks = obligation ? Math.max(0, obligation.expiresTick - this.engine.state.tick) : 0;
        const cashFlow = obligation
          ? `${obligation.payerId === human.id ? '−' : '+'}${cash(annual(obligation.weeklyCost))}/yr · ${paymentWeeks} weeks left`
          : 'Payments complete';
        return `<span class="nation-reaction-detail ${obligation?.payeeId === human.id ? 'is-income' : ''}"><b>PEACE · ${escapeHtml(opponent?.shortName ?? opponentId)}</b>${cashFlow} · locked ${lockWeeks}w</span>`;
      }).join('');
    const reserveNet = finance.reserveTraining - finance.reserveDeployment;
    const reactionLabel = resistance.level ? 'CONTAINMENT ACTIVE'
      : resistance.members ? `${resistance.members}/5 COALITION BUILDING` : 'NO COALITION';
    const reactionDetail = resistance.members
      ? coalitionNames.map((name) => escapeHtml(name!)).join(' · ')
        + (resistance.members > coalitionNames.length ? ` · +${resistance.members - coalitionNames.length}` : '')
      : 'World powers are monitoring expansion.';
    return `
      <aside class="world-panel command-drawer glass-panel nation-command command-drawer--clean" data-scroll-session="${drawerScrollSessionId('nation')}">
        <button class="panel-close" data-action="close-panel" aria-label="Close nation overview">×</button>
        <div class="panel-kicker">NATION · COMPLETE OVERVIEW</div>
        <div class="drawer-heading drawer-heading--compact"><div><h2>${escapeHtml(human.name)}</h2><span>LIVE EMPIRE STATISTICS</span></div><strong class="${displayedNet >= 0 ? 'is-positive' : 'is-negative'}">${escapeHtml(cashStatus)}</strong></div>
        <section class="national-strength-summary">
          <div class="national-strength-head"><span>NATIONAL STRENGTH</span><strong>${compactNumber(currentPower)} POWER</strong></div>
          <div class="national-strength-grid">
            <article class="is-army" title="Active trained troops. Deployed manpower contributes directly to conventional power." aria-label="Active army ${people(army.deployed)}, ${format(army.fillRatio * 100)} percent of capacity"><span>ARMY</span><strong>${people(army.deployed)}</strong><small>${format(army.fillRatio * 100)}% of ${people(army.capacity)} cap</small></article>
            <article class="is-army" title="Trained reserve troops replace wartime losses after mobilisation; they add no power while inactive." aria-label="Trained reserve ${people(human.trainedReserves)} of ${people(finance.trainedReserveCapacity)} capacity"><span>TRAINED RESERVE</span><strong>${people(human.trainedReserves)} / ${people(finance.trainedReserveCapacity)}</strong><small class="${reserveNet >= 0 ? 'is-positive' : 'is-negative'}">${reserveNet >= 0 ? '+' : '−'}${people(Math.abs(reserveNet))} this week · ${cash(annual(finance.reserveTrainingCost))}/yr training</small></article>
            <article class="is-atk" title="Effective attack: inherited force quality, live GDP and IQ, Economy R&D, weapons research and nuclear deterrence." aria-label="Effective attack ${format(attack, 2)}"><span>ATK</span><strong>${format(attack, 2)}</strong><small>${format(attackShare, 1)}% combat mix</small></article>
            <article class="is-def" title="Effective defence: inherited force quality, live GDP and IQ, Economy R&D and defensive research, followed by diminishing returns above 1.0." aria-label="Effective defense ${format(defense, 2)}"><span>DEF</span><strong>${format(defense, 2)}</strong><small>${format(defenseShare, 1)}% combat mix · diminishing</small></article>
            <article class="is-iq" title="Live gameplay IQ. Education research adds to the opening baseline and improves research conversion, logistics and national systems." aria-label="Live IQ ${format(iq.score, 1)}, baseline ${format(iq.baselineScore, 1)}, research bonus ${signed(iq.researchBonus, 1)}"><span>IQ</span><strong>${format(iq.score, 1)}</strong><small>Base ${format(iq.baselineScore, 1)} · R&D ${signed(iq.researchBonus, 1)} · ×${format(nationalQuality?.researchConversion ?? 1, 2)} conversion</small></article>
            <article class="is-gdp" title="Live integrated GDP per capita. It modifies national combat systems independently of army size." aria-label="GDP per capita ${cash(economy.wealthPerPerson / 1e6)}"><span>GDP / CAPITA</span><strong>${cash(economy.wealthPerPerson / 1e6)}</strong><small>${signed((nationalQuality?.gdpSystemContribution ?? 0) * 100, 1)}% system quality</small></article>
            <article class="is-economy" title="Total economic output currently unlocked by territorial integration." aria-label="Controlled economy ${cash(economy.controlledOutput)}"><span>ECONOMY</span><strong>${cash(economy.controlledOutput)}</strong><small>Total controlled output</small></article>
          </div>
          <div class="power-contribution">
            <div class="power-contribution__head"><span>POWER CONTRIBUTION</span><small>ATK / DEF COMBAT MIX</small></div>
            <i class="power-contribution__bar"><b class="is-atk" style="width:${attackShare}%"></b><b class="is-def" style="width:${defenseShare}%"></b></i>
            <div class="power-contribution__shares"><b class="is-atk">ATK ${format(attackShare, 1)}% SHARE</b><b class="is-def">DEF ${format(defenseShare, 1)}% SHARE</b></div>
            <div class="power-modifier-label">POWER MODIFIERS</div>
            <div class="power-modifier-chips"><span title="GDP's separate contribution to the national combat-system multiplier">GDP ${signed((nationalQuality?.gdpSystemContribution ?? 0) * 100, 1)}%</span><span title="Live IQ's separate contribution to the national combat-system multiplier, including Education research">IQ ${signed((nationalQuality?.iqSystemContribution ?? 0) * 100, 1)}%</span><span title="Economy & Science research modernises both attack and defence">ECON R&D ${signed(((nationalQuality?.economyResearchMultiplier ?? 1) - 1) * 100, 1)}%</span><span title="Weapons research and nuclear deterrence after shared GDP, IQ and Economy R&D">ATK SYSTEMS ×${format(attackUpgradeMultiplier, 2)}</span><span title="Defensive research after shared GDP, IQ and Economy R&D, including the visible diminishing-returns curve">DEF RESULT ×${format(defenseResultMultiplier, 2)}</span></div>
          </div>
        </section>
        <span class="section-label">NATIONAL STATS</span>
        <section class="national-stats-grid">
          <article title="All residents in controlled territory; the smaller line is the population currently unlocked by integration." aria-label="Population ${population(economy.population)}, integrated ${population(integratedPopulation)}"><span>POPULATION</span><strong>${population(economy.population)}</strong><small>${population(integratedPopulation)} integrated</small></article>
          <article title="Final annual economic growth after investment, research, food conditions and war pressure." aria-label="Annual economy growth ${signed(finance.annualEconomyGrowthRate * 100, 2)} percent"><span>ECON GROWTH</span><strong class="${finance.annualEconomyGrowthRate >= 0 ? 'is-positive' : 'is-negative'}">${signed(finance.annualEconomyGrowthRate * 100, 2)}%/yr</strong><small>Live net growth</small></article>
          <article title="Estimated births minus deaths and wartime demographic pressure." aria-label="Annual population growth ${signed(populationDynamics.annualNetRate * 100, 2)} percent"><span>POP GROWTH</span><strong class="${populationDynamics.annualNetRate >= 0 ? 'is-positive' : 'is-negative'}">${signed(populationDynamics.annualNetRate * 100, 2)}%/yr</strong><small>Births · deaths · war pressure</small></article>
          <article title="Automatic tax rate and annual tax income. Revenue uses equal economic and live productive-population bases, plus administration efficiency." aria-label="Tax rate ${format(economy.taxRate * 100, 1)} percent, annual revenue ${cash(annual(finance.revenue))}"><span>TAX</span><strong>${format(economy.taxRate * 100, 1)}%</strong><small>${cash(annual(finance.revenue))}/yr income</small></article>
          <article title="Share of weekly food demand supplied, followed by food reserves and their storage limit." aria-label="Food coverage ${format(finance.foodCoverage * 100, 1)} percent, stock ${people(human.foodStock)} of ${people(finance.foodStorageCapacity)}"><span>FOOD SUPPLY</span><strong class="${finance.foodCoverage >= 0.98 ? 'is-positive' : 'is-negative'}">${format(finance.foodCoverage * 100, 1)}%</strong><small>${people(human.foodStock)} / ${people(finance.foodStorageCapacity)} stored</small></article>
          <article title="Cash available now and projected cash after the current week, including any borrowing." aria-label="Treasury ${cash(human.treasury)}, projected ${cash(finance.closingTreasury)}"><span>TREASURY</span><strong class="${human.treasury >= 0 ? 'is-positive' : 'is-negative'}">${cash(human.treasury)}</strong><small>${cash(finance.closingTreasury)} next week</small></article>
          <article title="Current annualised net cashflow after every income, operating cost, war cost and investment." aria-label="Annual balance ${signedCash(annual(finance.net))}"><span>ANNUAL BALANCE</span><strong class="${finance.net >= 0 ? 'is-positive' : 'is-negative'}">${signedCash(annual(finance.net))}</strong><small>All income and costs</small></article>
          <article title="Completed upgrades across all research programs and the current annual research budget." aria-label="Research ${completedUpgrades} completed upgrades, annual funding ${cash(annual(finance.research))}"><span>RESEARCH</span><strong>${completedUpgrades} UPGRADES</strong><small>${cash(annual(finance.research))}/yr funding</small></article>
        </section>
        <section class="nation-reaction-block">
          <div class="nation-reaction-head"><span>WORLD REACTION</span><strong>${escapeHtml(reactionLabel)}</strong></div>
          <div class="simple-suspicion"><span>SUSPICION</span><i><b style="width:${resistance.threat}%"></b></i><strong>${format(resistance.threat)}%</strong></div>
          <p>${reactionDetail}</p>
          ${activeTreaties ? `<div class="nation-reaction-details">${activeTreaties}</div>` : ''}
        </section>
      </aside>
    `;
  }

  private renderEconomyPanel(
    human: NationViewV2,
    economy: NationalEconomyV2,
    finance: WeeklyFinanceBreakdownV2,
    demographics: PopulationDynamicsV2,
  ): string {
    // Food exports are shown as a direct credit against Food below. Keeping
    // them out of this income total prevents the same receipt appearing twice.
    const totalIncome = finance.revenue + finance.ceasefireIncome;
    const growth = finance.annualEconomyGrowthRate;
    const integratedPopulation = this.engine.controlledPopulation(human.id);
    const integratedNaturalAnnualChange = integratedPopulation * demographics.annualNetRate;
    const foodSupplyRatio = finance.foodProduced / Math.max(0.01, finance.foodDemand);
    const additionalIncome = [
      finance.ceasefireIncome > 0 ? `${cash(annual(finance.ceasefireIncome))}/yr treaties` : '',
    ].filter(Boolean).join(' · ');
    const foodTrade = summarizeFoodTradeV2(finance.foodExported, finance.foodImported);
    const foodExpenseLabel = foodTrade.direction === 'export'
      ? 'FOOD · NET EXPORTS'
      : foodTrade.direction === 'import' ? 'FOOD · NET IMPORTS' : 'FOOD';
    const foodTradeCardClass = foodTrade.direction === 'export'
      ? 'is-good'
      : foodTrade.direction === 'import' ? 'is-warn' : '';
    const foodTradeValueClass = foodTrade.direction === 'export'
      ? 'is-positive'
      : foodTrade.direction === 'import' ? 'is-negative' : '';
    const foodTradeValue = foodTrade.direction === 'balanced'
      ? 'BALANCED'
      : `${people(foodTrade.annualVolume)}/year`;
    const foodTradeDetail = foodTrade.direction === 'export'
      ? `Exports exceed imports · ${cash(annual(finance.foodExportIncome))}/year credit`
      : foodTrade.direction === 'import'
        ? `Imports exceed exports by ${people(foodTrade.annualVolume)}/year`
        : 'No net food imports or exports this week';
    const developmentFoodPause = finance.foodDevelopmentTransfer > 0.0000005;
    const totalExpenses = Math.max(0, finance.expenses - finance.foodExportIncome);
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
      { key: 'food', label: foodExpenseLabel, weekly: Math.max(0, finance.foodProduction - finance.foodExportIncome), tone: 'food', always: true },
      // Ordinary military spending and live-front operations are deliberately
      // separate here; totalMilitaryCost would count war operations twice.
      { key: 'military', label: 'MILITARY', weekly: Math.max(0, finance.military), tone: 'military', always: true },
      { key: 'research', label: 'RESEARCH', weekly: Math.max(0, finance.research), tone: 'research', always: true },
      { key: 'development', label: developmentFoodPause ? 'DEVELOPMENT · FOOD PAUSE' : 'DEVELOPMENT', weekly: Math.max(0, finance.development), tone: 'development', always: true },
      { key: 'integration', label: 'INTEGRATION', weekly: Math.max(0, finance.integrationCost), tone: 'integration', always: false },
      { key: 'war', label: 'WAR OPERATIONS', weekly: Math.max(0, finance.warOperations), tone: 'war', always: false },
      { key: 'peace', label: 'PEACE PAYMENTS', weekly: Math.max(0, finance.ceasefirePayment), tone: 'peace', always: false },
      { key: 'debt', label: 'DEBT PREMIUM', weekly: Math.max(0, finance.debtPremium), tone: 'debt', always: false },
    ];
    // Finance values are rounded individually. Put any microscopic rounding
    // remainder into Development so the visible categories equal expenses.
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
        const annualAmount = cash(annual(item.weekly));
        return `<article class="economy-expense-breakdown__item economy-expense-breakdown__item--${item.tone} ${item.weekly > 0 ? 'is-funded' : 'is-zero'}" aria-label="${item.label}: ${annualAmount} per year, ${format(share, 1)} percent of total costs"><div><span>${item.label}</span><strong>${annualAmount}<small>/year</small></strong><em>${shareLabel}</em></div><i aria-hidden="true"><b style="width:${boundedShare}%"></b></i></article>`;
      })
      .join('');
    return `
      <aside class="world-panel command-drawer glass-panel economy-command economy-command--simple" data-scroll-session="${drawerScrollSessionId('economy')}">
        <button class="panel-close" data-action="close-panel" aria-label="Close economy">×</button>
        <div class="panel-kicker">ECONOMY · WEEK ${this.engine.state.tick}</div>
        <div class="drawer-heading economy-heading"><div><h2>${cash(economy.controlledOutput)}</h2><span>NATIONAL ECONOMY</span></div><strong class="${growth >= 0 ? 'is-positive' : 'is-negative'}">${signed(growth * 100, 2)}% / year</strong></div>

        <div class="simple-economy-grid">
          <article class="simple-economy-card simple-economy-card--treasury"><span>APEX BUDGET</span><strong>${escapeHtml(finance.aiMode.toUpperCase())}</strong><small>Cash reserves and emergency funding are automatic</small></article>
          <article class="simple-economy-card ${growth >= 0 ? 'is-good' : 'is-danger'}"><span>ECONOMY</span><strong>${cash(economy.controlledOutput)}</strong><small class="${growth >= 0 ? 'is-positive' : 'is-negative'}">${signed(growth * 100, 2)}%/year · ${cash(economy.wealthPerPerson / 1e6)}/person</small></article>
          <article class="simple-economy-card" title="Taxable output blends a stable half of integrated GDP with a half that follows live productive population (${format(economy.productivePopulationFactor * 100, 1)}% of its baseline)."><span>TOTAL INCOME</span><strong class="is-positive">+${cash(annual(totalIncome))}/year</strong><small>${cash(annual(finance.revenue))}/yr tax · ${format(economy.taxRate * 100, 1)}%${additionalIncome ? ` · ${additionalIncome}` : ''}<br>${taxIncomeBasisLabel()}</small></article>
          <article class="simple-economy-card"><span>TOTAL COSTS</span><strong class="is-negative">−${cash(annual(totalExpenses))}/year</strong><small>${finance.foodExportIncome > 0 ? `After ${cash(annual(finance.foodExportIncome))}/year food export credit` : finance.integrationCost > 0 ? `Includes ${cash(annual(finance.integrationCost))}/year integration` : 'Food, army, research, growth and wars'}</small></article>
          <article class="simple-economy-card" title="Conquered residents unlock gradually through integration"><span>INTEGRATED PEOPLE</span><strong>${population(integratedPopulation)}</strong><small class="${integratedNaturalAnnualChange >= 0 ? 'is-positive' : 'is-negative'}">${signedPeople(integratedNaturalAnnualChange)}/year natural</small></article>
          <article class="simple-economy-card"><span>FOOD</span><strong>${people(human.foodStock)} / ${people(finance.foodStorageCapacity)}</strong><small class="${finance.foodStockChange >= 0 ? 'is-positive' : 'is-negative'}">${format(foodSupplyRatio * 100, 1)}% weekly supply · ${signedPeople(annual(finance.foodStockChange))} stored/year</small>${developmentFoodPause ? `<small class="is-warn">Development redirected: ${cash(annual(finance.foodDevelopmentTransfer))}/year</small>` : ''}</article>
          <article class="simple-economy-card ${foodTradeCardClass}"><span>${foodTrade.label}</span><strong class="${foodTradeValueClass}">${foodTradeValue}</strong><small>${foodTradeDetail}</small></article>
        </div>

        <span class="section-label">EXPENSE BREAKDOWN · YEAR</span>
        <section class="economy-expense-breakdown" aria-label="Annual expense breakdown">
          <div class="economy-expense-breakdown__columns"><span>CATEGORY</span><span>AMOUNT / YEAR</span><span>SHARE</span></div>
          <div class="economy-expense-breakdown__items">${expenseRows}</div>
          <footer><span>TOTAL COSTS</span><strong>${cash(annual(totalExpenses))}<small>/year</small></strong><b>${totalExpenses > 0 ? '100%' : '0%'}</b></footer>
        </section>
      </aside>
    `;
  }

  private renderProgressPanel(): string {
    const human = this.engine.player(this.viewerPlayerId())!;
    const militarySnapshot = this.engine.militaryBaseSnapshot();
    const armyStrength = this.engine.armyStrength(human.id);
    const nationalArmy = nationalArmyState(this.engine, human.id, armyStrength, militarySnapshot);
    const nationalQuality = militarySnapshot.nationalQualityByNation.get(human.id);
    const liveIq = selectNationalIqViewV2(this.engine.state, WORLD_CONTENT_V2, human.id);
    const effectDisplayContext: ResearchEffectDisplayContextV2 = {
      researchConversion: nationalQuality?.researchConversion ?? 1,
      baseDefense: nationalArmy.baseDefense,
      combinedMultiplier: nationalQuality?.combinedMultiplier ?? 1,
      iqResearchBonus: liveIq.researchBonus,
    };
    const finance = this.engine.weeklyFinanceBreakdown(human.id);
    const portfolio = this.engine.researchPortfolio(human.id);
    const deterrence = this.engine.nuclearPower(human.id);
    const next = nextResearchMilestone(portfolio);
    const completed = portfolio.reduce((sum, branch) => sum + branch.breakthroughs, 0);
    const effectLevels = this.engine.state.players[human.id]!.research.effectLevels;
    const upgradeTotals = Object.entries(effectLevels)
      .filter(([, level]) => level > 0)
      .sort(([left], [right]) => researchEffectLabel(left).localeCompare(researchEffectLabel(right)))
      .map(([effect, level]) => {
        const typedEffect = effect as ResearchEffectV2;
        const impact = selectResearchEffectImpactV2(this.engine.state, WORLD_CONTENT_V2, human.id, typedEffect);
        const total = researchEffectTotal(typedEffect, level, impact, effectDisplayContext);
        return `<article><span>${escapeHtml(researchEffectLabel(effect))}</span><strong>${escapeHtml(total)}</strong><small>LV ${level}</small></article>`;
      })
      .join('');
    const nextProgress = next ? Math.round(clamp(next.progressRatio, 0, 1) * 100) : 100;
    const nuclearProgress = Math.round(deterrence.progressRatio * 100);
    const programs = portfolio.map((branch) => {
      const progress = branch.maxed ? 100 : Math.round(clamp(branch.progressRatio, 0, 1) * 100);
      const effects = branch.effects.map((effect) => `${researchEffectLabel(effect.effect)} LV ${effect.level}`).join(' · ');
      const harder = branch.maxed ? 'maximum useful level reached'
        : branch.nextCostIncreaseRatio > 1
        ? `${format((branch.nextCostIncreaseRatio - 1) * 100)}% harder after completion` : 'final level';
      const description = `${RESEARCH_META[branch.branch].label}: ${effects} · ${harder}`;
      return `<article class="progress-program progress-program--compact${branch.maxed ? ' is-maxed' : ''}" tabindex="0" aria-label="${escapeHtml(description)}" style="--project:${RESEARCH_COLORS[branch.branch]}" title="${escapeHtml(description)}"><div><span>${escapeHtml(RESEARCH_META[branch.branch].shortLabel)}</span><b>${branch.maxed ? 'MAX' : `${progress}%`}</b></div><strong>${branch.breakthroughs} upgrades · ${branch.maxed ? 'funding redirected' : `${branch.allocation}% focus`}</strong><i><b style="width:${progress}%"></b></i></article>`;
    }).join('');
    return `
      <aside class="world-panel command-drawer glass-panel progress-command command-drawer--clean" data-scroll-session="${drawerScrollSessionId('progress')}">
        <button class="panel-close" data-action="close-panel" aria-label="Close national progress">×</button>
        <div class="panel-kicker">PROGRESS · CONTINUOUS DEVELOPMENT</div>
        <div class="drawer-heading drawer-heading--compact"><div><h2>${completed} upgrades</h2><span>TEN PROGRAMS RUN AUTOMATICALLY</span></div><strong class="is-positive">${cash(annual(finance.research))}/YR</strong></div>
        <div class="simple-economy-grid simple-panel-grid progress-summary--clean">
          <article class="simple-economy-card"><span>TOTAL RESEARCH</span><strong>${completed} upgrades</strong><small>Across all ten programs</small></article>
          <article class="simple-economy-card"><span>FUNDING</span><strong>${cash(annual(finance.research))}/year</strong><small>Automatically divided by focus</small></article>
          <article class="simple-economy-card"><span>NEXT UPGRADE</span><strong>${next ? escapeHtml(RESEARCH_META[next.branch].shortLabel) : 'COMPLETE'}</strong><small>${nextProgress}% progress</small></article>
          <article class="simple-economy-card"><span>NUCLEAR</span><strong>${deterrence.level ? `Tier ${deterrence.level}` : `${nuclearProgress}%`}</strong><small>+${format(deterrence.attackBonus * 100)}% ATK</small></article>
        </div>
        ${finance.foodDevelopmentTransfer > 0 ? `<div class="simple-panel-alert is-food"><b>FOOD RESEARCH PRIORITY</b><span>Research stays funded while ${cash(annual(finance.foodDevelopmentTransfer))}/year moves from Development to food. APEX prioritizes logistics and supply research until the crisis passes.</span></div>` : ''}
        <span class="section-label">EMPIRE UPGRADES · ALREADY ACTIVE</span>
        <div class="upgrade-total-grid">${upgradeTotals || '<div class="empty-state">No completed upgrade effects yet.</div>'}</div>
        <span class="section-label">ALL PROGRAMS</span>
        <div class="progress-programs progress-programs--compact">${programs}</div>
      </aside>
    `;
  }

  private renderWarPanel(): string {
    const human = this.engine.player(this.viewerPlayerId())!;
    const army = this.engine.armyStrength(human.id);
    const militarySnapshot = this.engine.militaryBaseSnapshot();
    const nationalArmy = nationalArmyState(this.engine, human.id, army, militarySnapshot);
    const attack = this.engine.effectiveAttack(human.id, nationalArmy, militarySnapshot);
    const defense = this.engine.effectiveDefense(human.id, nationalArmy, militarySnapshot);
    const combatPower = this.engine.currentPower(human.id, militarySnapshot);
    const weakArmy = army.fillRatio < 0.55;
    const wars = this.humanWars();
    const finance = this.engine.weeklyFinanceBreakdown(human.id);
    const resistance = this.engine.globalResistance();
    const recommendations = this.warTargetRecommendations(human.id, resistance);
    const annualWarCost = annual(finance.warOperations);
    return `
      <aside class="world-panel command-drawer glass-panel war-command command-drawer--clean" data-scroll-session="${drawerScrollSessionId('war')}">
        <button class="panel-close" data-action="close-panel" aria-label="Close war command">×</button>
        <div class="panel-kicker">WAR COMMAND</div>
        <div class="drawer-heading drawer-heading--compact"><div><h2>${wars.length ? `${wars.length} active war${wars.length > 1 ? 's' : ''}` : 'Choose a target'}</h2><span>${wars.length ? `${cash(annualWarCost)}/year in operations` : 'Attackable countries are marked on the map'}</span></div><strong class="${wars.length ? 'is-negative' : 'is-positive'}">${wars.length ? 'LIVE' : 'READY'}</strong></div>
        <div class="simple-economy-grid simple-panel-grid war-summary-grid war-summary-grid--compact">
          <article class="simple-economy-card ${weakArmy ? 'is-warn' : 'is-good'}"><span>ARMY</span><strong>${armyCapacityLabel(army.deployed, army.capacity)}</strong><small>${format(army.fillRatio * 100)}% ready</small></article>
          <article class="simple-economy-card ${finance.trainedReservesAfter < finance.trainedReservesBefore ? 'is-warn' : 'is-good'}"><span>RESERVE</span><strong>${people(human.trainedReserves)} / ${people(finance.trainedReserveCapacity)}</strong><small>${finance.reserveDeployment > 0 ? `−${people(finance.reserveDeployment)} used this week` : `+${people(finance.reserveTraining)} trained this week`}</small></article>
          <article class="simple-economy-card"><span>POWER</span><strong>${compactNumber(combatPower)}</strong><small>ATK ${format(attack, 2)} · DEF ${format(defense, 2)}</small></article>
        </div>
        ${wars.length ? '<span class="section-label">ACTIVE WARS · STATUS & PEACE</span>' : ''}
        <div class="war-list war-list--compact">${wars.length ? wars.map((war) => this.renderWarCard(war, human.id, finance)).join('') : '<div class="empty-state">No active war. Select a marked country on the map or use a target below.</div>'}</div>
        <span class="section-label">BEST AVAILABLE TARGETS</span>
        <div class="war-intel-list war-intel-list--compact">${recommendations.length ? recommendations.map((candidate, index) => this.renderTargetRecommendation(candidate, index)).join('') : '<div class="empty-state">No legal target is currently in land or naval range.</div>'}</div>
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
    const candidates = this.connectedOpponentIds(humanId).map((targetId) => {
      const target = this.engine.player(targetId)!;
      const declaration = this.engine.warDeclarationStatus(humanId, targetId);
      const chance = this.winChance(humanId, targetId);
      return { targetId, target, declaration, chance };
    });
    const recommendations = candidates.filter((candidate) => candidate.declaration.allowed)
      .sort((left, right) => right.chance - left.chance
        || left.target.name.localeCompare(right.target.name)).slice(0, 3);
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
  }, index: number): string {
    const battleForecast = this.engine.warForecast(this.viewerPlayerId(), candidate.targetId);
    const targetArmy = this.engine.armyStrength(candidate.targetId);
    const mapTarget = battleForecast.targetId ?? candidate.target.capitalId;
    const chanceTone = candidate.chance >= 65 ? 'is-positive' : candidate.chance >= 45 ? 'is-warn' : 'is-negative';
    return `<article class="war-intel-card war-intel-card--compact" style="--enemy:${candidate.target.cssColor}"><i class="country-flag">${countryFlagHtml(candidate.target.id, candidate.target.sigil)}</i><div><span>${index === 0 ? 'BEST TARGET' : `OPTION ${index + 1}`} · ${warAccessLabel(candidate.declaration.access)}</span><strong>${escapeHtml(candidate.target.name)}</strong><small><b class="${chanceTone}">${format(candidate.chance, 1)}% WIN</b> · enemy army ${people(targetArmy.deployed)} · ${format(targetArmy.fillRatio * 100)}% ready</small></div><button data-action="quick-war" data-player="${candidate.targetId}" data-map-target="${mapTarget}" title="Review attack on ${escapeHtml(candidate.target.shortName)}"><span>REVIEW</span></button></article>`;
  }

  private renderWarCard(war: WarStateV2, humanId: PlayerId, finance: WeeklyFinanceBreakdownV2): string {
    const enemyId = war.attackerId === humanId ? war.defenderId : war.attackerId;
    const enemy = this.engine.player(enemyId)!;
    const score = war.attackerId === humanId ? war.warScore : -war.warScore;
    const ownArmy = this.totalCombatStrength(humanId);
    const enemyArmy = this.totalCombatStrength(enemyId);
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
    return `<article class="war-card-compact" style="--enemy:${enemy.cssColor}"><div class="war-card-compact__head"><i class="country-flag">${countryFlagHtml(enemy.id, enemy.sigil)}</i><div><strong>${escapeHtml(enemy.name)}</strong><small>Week ${warAge} · ${war.battles} battles · ${accessLabel}</small></div><b class="${score < 0 ? 'danger-text' : 'is-positive'}">${signed(score)}</b></div><div class="war-card-compact__state"><span>${escapeHtml(status)}</span><small>${cash(perWarCost)}/year</small></div><div class="war-card-compact__metrics"><span><small>ARMIES</small><b>${people(ownArmy.deployed)} / ${people(enemyArmy.deployed)}</b></span><span><small>MILITARY LOST</small><b>−${people(estimate?.totalOwnLosses ?? 0)} / −${people(estimate?.totalEnemyLosses ?? 0)}</b></span><span><small>EST. END</small><b>${escapeHtml(eta)}</b></span></div><div class="war-card-actions">${terms.allowed ? `<button class="secondary-button" data-action="peace-settlement" data-player="${enemy.id}" data-settlement="${suggested}">Offer reparations</button>` : ''}<button class="ghost-button" data-action="request-ceasefire" data-war="${war.id}" ${ceasefire.allowed ? '' : 'disabled'} title="${escapeHtml(ceasefire.reason ?? 'Peace requests use a 26-week retry cooldown.')}">${escapeHtml(peaceButton)}</button></div></article>`;
  }

  private renderPeaceOfferCard(offer: PeaceOfferV2): string {
    const from = this.engine.player(offer.fromId)!;
    const responseWeeks = Math.max(0, offer.expiresTick - this.engine.state.tick);
    const detail = offer.settlement === 'ceasefire'
      ? `${cash(annual(offer.weeklyCost ?? 0))}/year rate · ${cash((offer.weeklyCost ?? 0) * (offer.paymentWeeks ?? 52))} total · 104w war lock`
      : `${cash(offer.cashAmount ?? 0)} reparations`;
    return `<article style="--enemy:${from.cssColor}"><div><i class="country-flag">${countryFlagHtml(from.id, from.sigil)}</i><div><strong>${escapeHtml(from.name)} offers peace</strong><small>${escapeHtml(detail)} · ${responseWeeks}w to decide</small>${offer.settlement === 'ceasefire' ? '<small>Conquered territory remains with its current owner.</small>' : ''}</div></div><div class="territory-actions" style="position:static;margin:8px 0 0;padding:0;background:none;display:grid;grid-template-columns:1fr 1fr;gap:6px"><button class="ghost-button" data-action="respond-offer" data-offer="${offer.id}" data-accept="false">Continue war</button><button class="primary-button" data-action="respond-offer" data-offer="${offer.id}" data-accept="true">Accept treaty</button></div></article>`;
  }

  private renderTerritoryPanel(territoryId: TerritoryId, territory: TerritoryStateV2): string {
    const definition = WORLD_CONTENT_V2.territories[territoryId]!;
    const owner = this.engine.player(territory.owner)!;
    const humanId = this.viewerPlayerId();
    const isOwnTerritory = owner.id === humanId;
    const empireTerritories = this.engine.territoriesOf(owner.id);
    const economy = this.engine.nationalEconomy(owner.id);
    const finance = this.engine.weeklyFinanceBreakdown(owner.id);
    const integratedPopulation = this.engine.controlledPopulation(owner.id);
    const iq = selectNationalIqViewV2(this.engine.state, WORLD_CONTENT_V2, owner.id);
    const army = this.engine.armyStrength(owner.id);
    const militarySnapshot = this.engine.militaryBaseSnapshot();
    const nationalArmy = nationalArmyState(this.engine, owner.id, army, militarySnapshot);
    const manpowerRatio = army.capacity > 0 ? army.deployed / army.capacity : 0;
    const attack = this.engine.effectiveAttack(owner.id, nationalArmy, militarySnapshot);
    const defense = this.engine.effectiveDefense(owner.id, nationalArmy, militarySnapshot);
    const power = this.engine.currentPower(owner.id, militarySnapshot);
    const activeWar = owner.id !== humanId ? this.engine.activeWarBetween(humanId, owner.id) : undefined;
    const declaration = owner.id !== humanId ? this.engine.warDeclarationStatus(humanId, owner.id) : undefined;
    const foodDemand = Math.max(0.01, finance.foodDemand);
    const domesticFoodRatio = finance.foodDomesticProduced / foodDemand;
    const importedFoodRatio = finance.foodImported / foodDemand;
    const annualFoodExport = annual(finance.foodExported);
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
    const localArmyRatio = territory.army.capacity > 0
      ? territory.army.manpower / territory.army.capacity : 0;
    const unlockedPopulation = territory.population * territory.integration;
    const unlockedOutput = territory.economy * territory.integration;
    const panelStatus = activeWar ? 'ENEMY TERRITORY · WAR LIVE'
      : integrationWeeks > 0 ? `${isOwnTerritory ? 'YOUR' : 'FOREIGN'} TERRITORY · INTEGRATING`
      : isOwnTerritory ? 'YOUR CORE TERRITORY' : 'FOREIGN TARGET';
    const ownerSectionLabel = isOwnTerritory ? 'YOUR EMPIRE' : 'OWNER / EMPIRE';
    const integrationPayer = isOwnTerritory ? 'YOU PAY' : `${owner.shortName.toUpperCase()} PAYS`;
    const integrationPanel = integrationWeeks > 0
      ? `<section class="territory-integration-card"><div class="territory-integration-card__head"><span>INTEGRATING ${escapeHtml(integratingCore?.shortName ?? definition.name).toUpperCase()}</span><strong>${format(integrationPercent, 1)}%</strong></div><i role="progressbar" aria-label="Integration progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${format(integrationPercent, 1)}"><b style="width:${integrationPercent}%"></b></i><div class="territory-integration-card__metrics"><div><span>TIME LEFT</span><strong>${format(integrationYears, 1)} YEARS</strong></div><div><span>${escapeHtml(integrationPayer)}</span><strong class="is-negative">−${cash(territoryIntegrationAnnualCost)} / YEAR</strong></div></div><small>${cash(unlockedOutput)} of ${cash(territory.economy)} output unlocked · then permanent ${escapeHtml(owner.shortName)} core territory${guardWeeks > 0 ? ` · guard protected for ${guardWeeks} week${guardWeeks === 1 ? '' : 's'}` : ''}</small></section>`
      : '';
    const blockedWarNote = !activeWar && declaration && !declaration.allowed
      ? `<div class="war-rule-note is-blocked"><b>WAR UNAVAILABLE</b><span>${escapeHtml(declaration.reason ?? 'Requirements are not met.')}</span></div>`
      : '';
    return `
      <aside class="world-panel command-drawer glass-panel territory-inspector" data-scroll-session="${escapeHtml(drawerScrollSessionId(this.panelMode, territoryId))}">
        <button class="panel-close" data-action="clear-territory" aria-label="Close ${escapeHtml(definition.name)} details">×</button>
        <div class="panel-kicker territory-status-kicker">${escapeHtml(panelStatus)}</div>
        <div class="territory-heading territory-heading--clear"><div><h2>${escapeHtml(definition.name)}</h2><span style="color:${owner.cssColor}">Owned by ${escapeHtml(owner.name)} · ${empireTerritories.length} territor${empireTerritories.length === 1 ? 'y' : 'ies'}</span></div><i class="country-flag" style="--owner:${owner.cssColor}">${countryFlagHtml(owner.id, owner.sigil)}</i></div>
        <section class="national-strength-summary territory-owner-summary"><div class="national-strength-head"><span>${escapeHtml(ownerSectionLabel)} STRENGTH</span><strong>${compactNumber(power)} POWER</strong></div><div class="national-strength-grid"><article class="is-army"><span>ARMY</span><strong>${armyCapacityLabel(army.deployed, army.capacity)}</strong><small>${format(manpowerRatio * 100)}% ready</small></article><article class="is-atk"><span>ATK</span><strong>${format(attack, 2)}</strong><small>Effective attack</small></article><article class="is-def"><span>DEF</span><strong>${format(defense, 2)}</strong><small>Effective defence</small></article><article class="is-iq"><span>IQ</span><strong>${format(iq.score, 1)}</strong><small>National score</small></article><article class="is-gdp"><span>GDP / CAPITA</span><strong>${cash(economy.wealthPerPerson / 1e6)}</strong><small>Current wealth</small></article><article class="is-economy"><span>ECONOMY</span><strong>${cash(economy.controlledOutput)}</strong><small>${population(integratedPopulation)} integrated people</small></article></div></section>
        <section class="territory-food-status ${foodTone}"><div class="territory-food-status__head"><span>FOOD · OWNER TOTAL</span><strong>${people(owner.foodStock)} / ${people(finance.foodStorageCapacity)}</strong></div><div class="territory-food-status__grid"><span><b>${format(finance.foodCoverage * 100, 1)}%</b><small>FED</small></span><span><b>${format(domesticFoodRatio * 100, 1)}%</b><small>DOMESTIC</small></span><span><b>${format(importedFoodRatio * 100, 1)}%</b><small>IMPORTS</small></span></div><p class="${finance.foodStockChange >= 0 ? 'is-positive' : 'is-negative'}">${signedPeople(annual(finance.foodStockChange))} reserves / year${annualFoodExport > 0 ? ` · ${people(annualFoodExport)} exported / year` : ''}</p></section>
        <span class="section-label territory-section-label">SELECTED LAND</span>
        <div class="territory-land-grid"><article><span>RESIDENTS</span><strong>${population(territory.population)}</strong><small>${integrationWeeks > 0 ? `${population(unlockedPopulation)} unlocked for owner` : 'Resident population'}</small></article><article class="is-economy"><span>LOCAL ECONOMY</span><strong>${cash(territory.economy)}</strong><small>${integrationWeeks > 0 ? `${cash(unlockedOutput)} currently unlocked` : 'Live local output'}</small></article><article class="is-army"><span>LOCAL ARMY</span><strong>${people(territory.army.manpower)} / ${people(territory.army.capacity)}</strong><small>${format(localArmyRatio * 100)}% of local capacity</small></article><article class="is-condition"><span>CONDITION</span><strong>${format(territory.condition * 100)}%</strong><small>Land and infrastructure</small></article></div>
        ${integrationPanel}
        ${owner.id !== humanId ? `${declaration?.warning ? `<div class="war-rule-note is-warning"><b>WEAK-ARMY WARNING</b><span>${escapeHtml(declaration.warning)}</span></div>` : ''}${blockedWarNote}<div class="territory-actions territory-actions--single">${activeWar ? `<button class="danger-button" disabled>WAR ALREADY LIVE</button>` : `<button class="danger-button" data-action="quick-war" data-player="${owner.id}" ${declaration?.allowed ? '' : 'disabled'}>${declaration?.allowed ? `REVIEW ATTACK · ${warAccessLabel(access)}` : 'WAR UNAVAILABLE'}</button>`}</div>` : ''}
      </aside>
    `;
  }

  private winChance(attackerId: string, defenderId: string): number {
    return this.engine.warForecast(attackerId, defenderId).winChance;
  }

  private renderWarTracker(wars: WarStateV2[]): string {
    const humanId = this.viewerPlayerId();
    const finance = this.engine.weeklyFinanceBreakdown(humanId);
    const activeFronts = wars.reduce((sum, war) => sum + allWarOperations(war).length, 0);
    const status = `${wars.length} WAR${wars.length === 1 ? '' : 'S'} · ${activeFronts} FRONT${activeFronts === 1 ? '' : 'S'} · ${cash(annual(finance.warOperations))}/YR`;
    return `<aside class="war-tracker war-tracker--compact glass-panel"><div class="war-tracker__title"><span><i></i> WAR COMMAND</span><b>${status}</b></div><div class="war-tracker__wars" data-scroll-session="tracker:wars">${wars.map((war) => {
      const enemyId = war.attackerId === humanId ? war.defenderId : war.attackerId;
      const enemy = this.engine.player(enemyId)!;
      const own = this.totalCombatStrength(humanId);
      const hostile = this.totalCombatStrength(enemyId);
      const operations = warOperationsFor(war, humanId);
      const operation = operations[0];
      const warFrontCount = allWarOperations(war).length;
      const estimate = this.engine.liveWarEstimate(war.id, humanId);
      const focusId = operation?.targetId ?? estimate?.targetId ?? enemy.capitalId;
      const score = war.attackerId === humanId ? war.warScore : -war.warScore;
      const balance = clamp(own.deployed / Math.max(0.000001, own.deployed + hostile.deployed) * 100, 0, 100);
      const outlook = !estimate ? 'Awaiting combat'
        : `${warTimeRange(estimate.estimatedWeeksMin, estimate.estimatedWeeksMax)} · ${warOutlookLabel(estimate)}`;
      const route = operation ? warAccessLabel(operation.access) : 'MOBILISING';
      return `<article class="war-tracker__war"><button class="war-tracker__focus" data-action="focus-war" data-territory="${focusId}"><div class="war-tracker__enemy" style="--enemy:${enemy.cssColor}"><i class="country-flag">${countryFlagHtml(enemy.id, enemy.sigil)}</i><div><span>${route} · ${warFrontCount} FRONT${warFrontCount === 1 ? '' : 'S'}</span><strong>${escapeHtml(enemy.shortName)}</strong><small>Week ${this.engine.state.tick - war.startedTick} · ${war.battles} battles</small></div><b class="${score < 0 ? 'danger-text' : 'is-positive'}">${signed(score)}</b></div><div class="war-tracker__quick"><span><small>ARMY LEFT</small><b>${people(own.deployed)} / ${people(hostile.deployed)}</b></span><span><small>MILITARY LOST</small><b>−${people(estimate?.totalOwnLosses ?? 0)} / −${people(estimate?.totalEnemyLosses ?? 0)}</b></span><span><small>EST. END</small><b>${escapeHtml(outlook)}</b></span></div><i class="war-tracker__balance" role="progressbar" aria-label="Share of remaining deployed forces" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${format(balance, 1)}" style="--enemy:${enemy.cssColor}"><b style="width:${balance}%"></b></i></button></article>`;
    }).join('')}</div></aside>`;
  }

  private renderRankingPanel(): string {
    const humanId = this.viewerPlayerId();
    const ranking = this.ranking();
    const rank = ranking.findIndex((entry) => entry.player.id === humanId) + 1;
    return `<aside class="world-panel command-drawer glass-panel ranking-panel" data-scroll-session="${drawerScrollSessionId('ranking')}"><button class="panel-close" data-action="close-panel">×</button><div class="panel-kicker">GLOBAL RANKING · LIVE</div><h2>Your country is #${rank}</h2><p>Global score weighs combat power and economy equally.</p><div class="power-ranking">${ranking.map((entry, index) => {
      const metric = compactNumber(entry.score);
      const detail = globalRankingDetail(entry.combatPower, entry.economicOutput);
      const focusTerritoryId = this.rankingFocusTerritory(entry.player.id, entry.player.capitalId);
      return `<button type="button" class="power-ranking__row ${entry.player.id === humanId ? 'is-human' : ''} ${index === 0 ? 'is-leader' : ''}" data-action="focus-ranking-country" data-territory="${escapeHtml(focusTerritoryId ?? '')}" aria-label="Select ${escapeHtml(entry.player.name)} on the map, global rank ${index + 1}, score ${metric}, ${detail}" style="--power:${entry.player.cssColor}"><span>#${index + 1}</span><i class="country-flag">${countryFlagHtml(entry.player.id, entry.player.sigil)}</i><div><strong>${escapeHtml(entry.player.name)}</strong><small>${detail}</small></div><b title="Global score">${metric}</b></button>`;
    }).join('')}</div></aside>`;
  }

  private renderWarStrainMeter(
    human: NationViewV2,
    wars: WarStateV2[],
    army: ArmyStrengthV2,
    finance: WeeklyFinanceBreakdownV2,
    standalone = false,
  ): string {
    const activeFronts = wars.reduce((sum, war) => (
      sum + warOperationsFor(war, human.id).length
    ), 0);
    const reserveFillRatio = finance.trainedReserveCapacity > 0
      ? clamp(human.trainedReserves / finance.trainedReserveCapacity, 0, 1) : 1;
    const summary = summarizeWarStrainV2({
      activeWars: wars.length,
      activeFronts,
      warFatigue: human.warFatigue,
      armyFillRatio: army.fillRatio,
      reserveFillRatio,
    });
    const recoveryWeeks = Math.ceil(human.warFatigue / PEACE_FATIGUE_RECOVERY_PER_WEEK);
    const forceLine = wars.length
      ? `${activeFronts}F · ARMY ${format(army.fillRatio * 100)}% · RES ${format(reserveFillRatio * 100)}%`
      : `RECOVERY ~${recoveryWeeks}W`;
    const effectsLine = `GROWTH −${format(finance.warEconomyGrowthDrag * 100, 1)}pp · R&D −${format(finance.warResearchPenalty * 100, 1)}%`;
    return `<section class="war-strain-meter war-strain-meter--${summary.level}${standalone ? ' war-strain-meter--standalone glass-panel' : ''}" role="status" aria-label="War strain ${summary.score} out of 100, ${summary.label}" title="${escapeHtml(summary.guidance)}">
      <div class="war-strain-meter__head"><span>WAR STRAIN</span><strong>${summary.label}<b>${summary.score}</b></strong></div>
      <i class="war-strain-meter__track" role="progressbar" aria-label="War strain" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${summary.score}"><b style="width:${summary.score}%"></b></i>
      <div class="war-strain-meter__detail"><span>${escapeHtml(forceLine)}</span><b>${escapeHtml(effectsLine)}</b></div>
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
    const terms = offer.settlement === 'ceasefire'
      ? `PEACE TREATY · ${cash(annual(offer.weeklyCost ?? 0))}/YR · ${offer.paymentWeeks ?? 52}W PAY · 104W LOCK`
      : `REPARATIONS · ${cash(offer.cashAmount ?? 0)}`;
    return `<div class="decision-banner glass-panel" style="--sender:${from.cssColor}" title="Accepting ends the war; conquered territory keeps its current owner."><i class="country-flag">${countryFlagHtml(from.id, from.sigil)}</i><div><span>PEACE OFFER · ${responseWeeks}W LEFT</span><strong>${escapeHtml(from.shortName)} · ${terms}</strong></div><button class="ghost-button" data-action="respond-offer" data-offer="${offer.id}" data-accept="false">DECLINE</button><button class="primary-button" data-action="respond-offer" data-offer="${offer.id}" data-accept="true">ACCEPT</button></div>`;
  }

  private initialTerritoryCount(playerId: PlayerId): number {
    return WORLD_CONTENT_V2.territoryIds.filter((territoryId) => WORLD_CONTENT_V2.territories[territoryId]?.initialOwnerId === playerId).length;
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
    const allNations = [...WORLD_CONTENT_V2.nationIds]
      .map((id) => WORLD_CONTENT_V2.nations[id])
      .filter((nation): nation is NonNullable<typeof nation> => (
        nation !== undefined && opening.byNation.has(nation.id)
      ));
    const metrics = opening.byNation;
    const nations = allNations.sort((left, right) => (
      compareIntroNationMetricsV2(left, right, this.introSort, opening)
    ));
    const desiredPreview = WORLD_CONTENT_V2.nations[this.introPreviewCountryId];
    const preview = desiredPreview && metrics.has(desiredPreview.id) ? desiredPreview : nations[0]!;
    const previewMetrics = metrics.get(preview.id) ?? metrics.get(nations[0]!.id)!;
    const previewState = previewMetrics.player;
    const army = previewMetrics.army;
    const finance = previewMetrics.finance;
    const domesticFoodPercent = preview.real.foodSelfSufficiencyRatio * 100;
    const economy = previewMetrics.economyView;
    const populationDynamics = previewMetrics.populationDynamics;
    const attack = previewMetrics.attack;
    const defense = previewMetrics.defense;
    const iq = previewMetrics.iqView;
    const rank = previewMetrics.rank;
    const query = this.introSearchQuery.trim().toLocaleLowerCase('en');
    const continents = [...new Set(nations.map((nation) => nation.continent))].sort((left, right) => left.localeCompare(right, 'en'));
    const continentMatches = (continent: string) => this.introContinent === 'ALL' || continent === this.introContinent;
    const visibleCount = nations.filter((nation) => continentMatches(nation.continent)
      && (!query || `${nation.name} ${nation.sigil}`.toLowerCase().includes(query))).length;
    const sortLabels: Record<IntroSort, string> = {
      power: 'GLOBAL SCORE', military: 'MILITARY POWER', attack: 'ATK', defense: 'DEF', iq: 'IQ', manpower: 'ARMY', economy: 'ECONOMY', 'economic-growth': 'ECON GROWTH', tax: 'TAX', population: 'PEOPLE', growth: 'POP GROWTH',
    };
    const displayMetric = (nationId: PlayerId): string => {
      const value = metrics.get(nationId)?.[this.introSort] ?? 0;
      if (this.introSort === 'manpower') return people(value);
      if (this.introSort === 'economy') return cash(value);
      if (this.introSort === 'tax') return `${format(value, 1)}%`;
      if (this.introSort === 'population') return population(value);
      if (this.introSort === 'growth' || this.introSort === 'economic-growth') return `${value >= 0 ? '+' : ''}${format(value, 2)}%`;
      if (this.introSort === 'attack' || this.introSort === 'defense') return format(value, 2);
      if (this.introSort === 'power' || this.introSort === 'military') return compactNumber(value);
      return format(value, this.introSort === 'iq' ? 1 : 0);
    };
    const sortOptions = INTRO_SORT_OPTIONS.map(({ value, label }) => `<option value="${value}" ${this.introSort === value ? 'selected' : ''}>${label}</option>`).join('');
    const multiplayerButton = this.options.onMultiplayerRequested
      ? '<button class="secondary-button country-preview__multiplayer" data-action="open-multiplayer">PLAY WITH FRIENDS</button>'
      : '';
    return `<div class="modal-backdrop"><section class="country-select modal-card"><div class="country-select__head"><div><div class="panel-kicker">NEW CAMPAIGN · 2026</div><h1>Choose your nation</h1><p>APEX runs the country. You choose who to attack.</p></div><div class="country-select__facts"><span><b>${nations.length}</b> countries</span><span><b>ONE AI</b> every country</span><span><b>2026</b> start date</span><span><b>IQ</b> AI skill</span></div></div><div class="country-select__tools"><label class="country-search"><span>⌕</span><input id="country-search" type="search" value="${escapeHtml(this.introSearchQuery)}" placeholder="Search countries…" autocomplete="off"></label><label class="country-sort"><span>SORT</span><select id="country-sort" aria-label="Sort countries">${sortOptions}</select></label><div class="country-filters" role="group" aria-label="Filter countries by continent"><button class="${this.introContinent === 'ALL' ? 'is-active' : ''}" data-action="continent-filter" data-continent="ALL">ALL</button>${continents.map((continent) => `<button class="${this.introContinent === continent ? 'is-active' : ''}" data-action="continent-filter" data-continent="${escapeHtml(continent)}">${escapeHtml(continent.toUpperCase())}</button>`).join('')}<span>${visibleCount} shown</span></div></div><div class="country-select__body"><div class="country-grid">${nations.map((nation) => {
      const searchable = `${nation.name} ${nation.sigil}`.toLowerCase();
      const hidden = !continentMatches(nation.continent) || (query.length > 0 && !searchable.includes(query));
      const nationEconomicGrowth = metrics.get(nation.id)?.['economic-growth'] ?? 0;
      return `<button class="${nation.id === preview.id ? 'is-selected' : ''}" data-action="preview-country" data-country="${nation.id}" data-continent="${escapeHtml(nation.continent)}" data-country-name="${escapeHtml(nation.name.toLocaleLowerCase('en'))}" data-name="${escapeHtml(searchable)}" aria-pressed="${nation.id === preview.id}" ${hidden ? 'hidden' : ''} style="--country:${nation.cssColor}"><i class="country-flag">${countryFlagHtml(nation.id, nation.sigil)}</i><div><strong>${escapeHtml(nation.name)}</strong><small>${escapeHtml(nation.subregion)} · ${population(nation.real.population)} people</small><em>${cash(nation.real.gdp)} GDP · ${signed(nationEconomicGrowth, 2)}%/yr</em></div><span><b>${displayMetric(nation.id)}</b><em>${sortLabels[this.introSort]}</em></span></button>`;
    }).join('')}</div><aside class="country-preview" style="--country:${preview.cssColor}"><div class="country-preview__identity"><i class="country-flag country-flag--large">${countryFlagHtml(preview.id, preview.sigil, true)}</i><div><span>GLOBAL RANK #${rank}</span><h2 title="${escapeHtml(preview.name)}">${escapeHtml(previewState.shortName)}</h2><p>${escapeHtml(preview.subregion)}</p></div><b>${compactNumber(previewMetrics.power)}<small>GLOBAL SCORE</small></b></div><div class="country-preview__stats"><div class="stat-atk"><span>ATK</span><strong>${format(attack, 2)}</strong></div><div class="stat-def"><span>DEF</span><strong>${format(defense, 2)}</strong></div><div class="stat-iq" title="Calibrated from international learning outcomes, with a regional fallback"><span>IQ</span><strong>${format(iq.score, 1)}</strong></div><div><span>ARMY</span><strong>${armyCapacityLabel(army.deployed, army.capacityTarget)}</strong></div><div><span>TRAINED RESERVE</span><strong>${people(previewState.trainedReserves)} / ${people(army.capacity)}</strong></div><div><span>POPULATION</span><strong>${population(economy.population)}</strong></div><div class="stat-economy"><span>ECONOMY</span><strong>${cash(economy.output)}</strong></div><div><span>ECONOMIC GROWTH</span><strong class="${finance.annualEconomyGrowthRate >= 0 ? 'is-positive' : 'danger-text'}">${signed(finance.annualEconomyGrowthRate * 100, 2)}%</strong></div><div title="Automatic 10–20% rate from integrated GDP per baseline productive person; receipts blend 50% economy and 50% live productive people"><span>TAX</span><strong>${format(economy.dynamicTaxRate * 100, 1)}%</strong></div><div><span>POPULATION GROWTH</span><strong class="${populationDynamics.annualNetRate >= 0 ? 'is-positive' : 'danger-text'}">${populationDynamics.annualNetRate >= 0 ? '+' : ''}${format(populationDynamics.annualNetRate * 100, 2)}%</strong></div><div title="FAOSTAT calorie-based self-sufficiency reference, median 2021–2023"><span>DOMESTIC FOOD</span><strong class="${domesticFoodPercent >= 100 ? 'is-positive' : domesticFoodPercent < 75 ? 'danger-text' : ''}">${format(domesticFoodPercent)}%</strong></div></div><div class="country-preview__actions"><button class="primary-button country-preview__start" data-action="choose-country" data-country="${preview.id}">COMMAND ${escapeHtml(preview.name.toUpperCase())}</button>${multiplayerButton}</div></aside></div><footer><span>Domestic Food: FAOSTAT 2021–2023 · IQ: learning outcomes · Natural Earth · SIPRI 2025</span><strong>Sorted by ${escapeHtml(sortLabels[this.introSort].toLowerCase())}</strong></footer></section></div>`;
  }


  private renderHelp(): string {
    return `<div class="modal-backdrop"><section class="modal-card world-help" data-scroll-session="modal:help"><button class="modal-close" data-action="help">×</button><div class="panel-kicker">FRONTIER COMMAND · NATIONAL AI</div><h2>You choose conquest. APEX runs the nation.</h2><div class="help-grid world-help-grid"><article><span>⚔</span><h3>War</h3><p>Choose targets, compare the forecast and decide when to stop.</p></article><article><span>AI</span><h3>Nation</h3><p>Every country uses the same AI for cash, food, research and recruitment. IQ modestly affects its speed and efficiency.</p></article><article><span>↗</span><h3>Development</h3><p>APEX adjusts investment and research gradually as national needs change.</p></article></div><p class="help-tip"><b>World reaction:</b> fast conquest raises suspicion and can trigger defensive coalitions.</p></section></div>`;
  }

  private renderInbox(): string {
    const events = this.engine.state.events.filter(isMajorWorldEvent).slice().reverse();
    return `<div class="modal-backdrop modal-backdrop--soft"><section class="modal-card inbox-modal"><button class="modal-close" data-action="inbox">×</button><div class="panel-kicker">SITUATION INBOX</div><h2>World events</h2><div class="inbox-filters"><span>${events.filter((event) => this.eventIsUnread(event)).length} unread</span><button data-action="mark-read">Mark all read</button></div><div class="inbox-list" data-scroll-session="modal:inbox">${events.map((event) => `<button class="${this.eventIsUnread(event) ? 'is-unread' : ''}" data-action="focus-event" data-territory="${event.territoryId ?? ''}"><b class="event-dot event-dot--${event.severity}"></b><div><span>WEEK ${event.tick} · ${event.kind.toUpperCase()}</span><strong>${escapeHtml(event.message)}</strong></div></button>`).join('')}</div></section></div>`;
  }

  private renderWarConfirmation(targetId: PlayerId): string {
    const human = this.engine.player(this.viewerPlayerId())!;
    const target = this.engine.player(targetId)!;
    const army = this.engine.armyStrength(human.id);
    const forecast = this.engine.warForecast(human.id, target.id);
    const chance = forecast.winChance;
    const declaration = this.engine.warDeclarationStatus(human.id, target.id);
    const gains = this.engine.conquestForecast(human.id, target.id);
    const targetFinance = this.engine.weeklyFinanceBreakdown(target.id);
    const targetEconomy = this.engine.nationalEconomy(target.id);
    const targetIq = selectNationalIqViewV2(this.engine.state, WORLD_CONTENT_V2, target.id);
    const targetTerritoryIds = WORLD_CONTENT_V2.territoryIds.filter((territoryId) => (
      this.engine.state.territories[territoryId]?.owner === target.id
    ));
    const integrationWeeks = targetTerritoryIds.reduce((longest, territoryId) => Math.max(
      longest,
      territoryIntegrationDurationWeeksV2(WORLD_CONTENT_V2, territoryId),
    ), 0);
    const integrationYears = integrationWeeks / WEEKS_PER_YEAR;
    const integrationAnnualCost = territoryIntegrationAnnualCostV2(gains.retainedEconomy);
    const weakArmy = army.fillRatio < 0.55;
    const warning = declaration.warning ?? (weakArmy ? 'Your army has low deployed manpower for its population-based capacity.' : undefined);
    const outlook = forecast.outlook.toUpperCase();
    const concurrentCampaigns = this.humanWars().length + 1;
    const supportText = forecast.supportingForces > 0
      ? `${forecast.supportingForces} supporting arm${forecast.supportingForces === 1 ? 'y' : 'ies'}` : 'No supporting army';
    const chanceTone = chance >= 65 ? 'is-good' : chance >= 45 ? 'is-warn' : 'is-danger';
    const foodRisk = targetFinance.foodCoverage < 0.95
      ? `<div class="fusion-food-risk"><b>PEOPLE FED · ${format(targetFinance.foodCoverage * 100, 1)}%</b><span>${signedPeople(annual(targetFinance.foodStockChange))} reserves / year</span></div>`
      : '';
    return `<div class="modal-backdrop"><section class="modal-card war-confirm simple-war-confirm fusion-analysis" data-scroll-session="modal:war-confirm:${escapeHtml(targetId)}" style="--target:${target.cssColor}"><header class="fusion-analysis__head"><div class="war-confirm__sigil country-flag fusion-analysis__flag">${countryFlagHtml(target.id, target.sigil, true)}</div><div><div class="panel-kicker">WAR + FUSION ANALYSIS · ${outlook}</div><h2>Attack ${escapeHtml(target.name)}?</h2></div></header><section class="fusion-zone fusion-zone--chance"><span class="fusion-zone__label">WIN CHANCE</span><div class="simple-chance ${chanceTone}"><div><span>ESTIMATED VICTORY</span><strong>${chance}%</strong></div><i><b style="width:${chance}%"></b></i><small>${WAR_MOBILIZATION_TICKS} weeks to mobilise · campaign ${warTimeRange(forecast.estimatedWeeksMin, forecast.estimatedWeeksMax)} · ${concurrentCampaigns} active war${concurrentCampaigns === 1 ? '' : 's'} if started</small></div></section><section class="fusion-zone fusion-zone--military"><span class="fusion-zone__label">MILITARY COMPARISON</span><div class="fusion-military-grid"><article class="fusion-army-card is-own"><span>OUR ARMY</span><strong>${people(forecast.attackerStrength)}</strong><small class="war-stat-line"><em class="metric-atk">ATK ${format(forecast.attackerAttack, 2)}</em><em class="metric-def">DEF ${format(forecast.attackerDefense, 2)}</em><em>SUP ${format(forecast.attackerSupply * 100)}%</em></small><small>${supportText}</small></article><article class="fusion-army-card is-enemy"><span>ENEMY ARMY</span><strong>${people(forecast.defenderStrength)}</strong><small class="war-stat-line"><em class="metric-atk">ATK ${format(forecast.defenderAttack, 2)}</em><em class="metric-def">DEF ${format(forecast.defenderDefense, 2)}</em><em>SUP ${format(forecast.defenderSupply * 100)}%</em></small><small>Defensive position ×${format(forecast.defenderPositionMultiplier, 2)}</small></article></div><div class="fusion-first-battle"><span>FIRST BATTLE</span><b class="is-negative">YOU −${people(forecast.projectedAttackerLosses)}</b><b class="is-positive">ENEMY −${people(forecast.projectedDefenderLosses)}</b></div></section><section class="fusion-zone fusion-value-zone"><span class="fusion-zone__label">VALUE AFTER CONQUEST</span><div class="fusion-target-metrics"><article><span>GDP / CAPITA</span><strong>${cash(targetEconomy.wealthPerPerson / 1e6)}</strong></article><article><span>IQ</span><strong>${format(targetIq.score, 1)}</strong></article><article><span>CURRENT ECONOMY</span><strong>${cash(targetEconomy.controlledOutput)}</strong></article><article><span>POPULATION</span><strong>${population(targetEconomy.population)}</strong></article></div>${foodRisk}<div class="fusion-flow" aria-label="Conquest integration flow"><article class="fusion-flow__step is-now"><span>10% · NOW</span><strong>${cash(gains.initialIntegratedOutput)}</strong><small>~${population(gains.retainedPopulation * 0.10)} people usable</small></article><i class="fusion-flow__arrow" aria-hidden="true">→</i><article class="fusion-flow__step is-progress"><span>INTEGRATION</span><strong>~${format(integrationYears, integrationYears >= 100 ? 0 : 1)} YEARS</strong><small>−${cash(integrationAnnualCost)}/year until core</small></article><i class="fusion-flow__arrow" aria-hidden="true">→</i><article class="fusion-flow__step is-core"><span>100% · CORE / FUSION</span><strong>${cash(gains.retainedEconomy)}</strong><small>${population(gains.retainedPopulation)} people · ${gains.territoryCount} permanent core territor${gains.territoryCount === 1 ? 'y' : 'ies'}</small></article></div></section>${warning ? `<div class="war-rule-note is-warning"><b>RISK</b><span>${escapeHtml(warning)}</span></div>` : ''}${!declaration.allowed ? `<div class="war-rule-note is-blocked"><b>WAR CANNOT START</b><span>${escapeHtml(declaration.reason ?? 'Requirements are not met.')}</span></div>` : ''}<div class="panel-actions"><button class="ghost-button" data-action="cancel-war">Cancel</button><button class="danger-button" data-action="declare-war" ${declaration.allowed ? '' : 'disabled'}>${declaration.allowed ? 'START WAR' : escapeHtml((declaration.reason ?? 'WAR CANNOT START').toUpperCase())}</button></div></section></div>`;
  }

  private renderCeasefireConfirmation(warId: string): string {
    const humanId = this.viewerPlayerId();
    const war = this.engine.state.wars.find((candidate) => candidate.id === warId);
    if (!war) return '';
    const opponentId = war.attackerId === humanId ? war.defenderId : war.attackerId;
    const opponent = this.engine.player(opponentId)!;
    const terms = this.engine.ceasefireTerms(warId, humanId);
    return `<div class="modal-backdrop"><section class="modal-card ceasefire-confirm" style="--target:${opponent.cssColor}"><div class="panel-kicker">REQUEST PEACE TREATY</div><h2>Offer peace to ${escapeHtml(opponent.name)}?</h2><p>They may refuse. If accepted, neither country can restart this war during payments or for the following year.</p><div class="ceasefire-summary"><div><span>DIRECT PAYMENT</span><strong>${cash(annual(terms.weeklyCost))}/year</strong><small>${cash(terms.totalCost)} total over ${terms.paymentWeeks} weeks · repeat ×${format(terms.repeatMultiplier, 2)}</small></div><div><span>WAR LOCK</span><strong>${terms.truceTicks} WEEKS</strong><small>${terms.paymentWeeks}w payments + ${terms.postPaymentTruceTicks}w peace</small></div></div><div class="war-rule-note is-warning"><b>WITHDRAWAL IS FINAL</b><span>Fighting ends immediately. Already conquered territory remains with its current owner.</span><small>If refused or expired, another paid offer is available after 26 weeks.</small></div><div class="panel-actions"><button class="ghost-button" data-action="cancel-ceasefire">Continue war</button><button class="secondary-button" data-action="confirm-ceasefire" data-war="${warId}" ${terms.allowed ? '' : 'disabled'}>${terms.allowed ? `SEND TREATY · ${cash(annual(terms.weeklyCost))}/YR` : escapeHtml((terms.reason ?? 'UNAVAILABLE').toUpperCase())}</button></div></section></div>`;
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
    const gainedNames = outcome.territoriesGained.map((id) => WORLD_CONTENT_V2.territories[id]?.name ?? id);
    const lostNames = outcome.territoriesLost.map((id) => WORLD_CONTENT_V2.territories[id]?.name ?? id);
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
    const winner = this.engine.player(this.engine.state.winnerId ?? '')!;
    const viewerId = this.viewerPlayerId();
    const absorbed = !this.engine.state.players[viewerId];
    const formerName = WORLD_CONTENT_V2.nations[viewerId]?.name ?? viewerId;
    const kicker = absorbed ? 'CAMPAIGN ENDED' : 'WORLD CAMPAIGN COMPLETE';
    const outcome = absorbed
      ? `${escapeHtml(formerName)} has been fully integrated and absorbed by ${escapeHtml(winner.name)}.`
      : `${escapeHtml(winner.name)} leads the final global ranking.`;
    return `<div class="modal-backdrop"><section class="modal-card victory-card" style="--winner:${winner.cssColor}"><div class="victory-sigil country-flag">${countryFlagHtml(winner.id, winner.sigil, true)}</div><div class="panel-kicker">${kicker}</div><h1>${escapeHtml(winner.name)}</h1><p>${outcome}</p><button class="primary-button" data-action="new-game">New campaign</button></section></div>`;
  }

  private renderSpectatorBanner(formerId: PlayerId, watched: NationViewV2): string {
    const formerName = WORLD_CONTENT_V2.nations[formerId]?.name ?? formerId;
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
            const firstVisible = WORLD_CONTENT_V2.nationIds
              .map((id) => WORLD_CONTENT_V2.nations[id])
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
            this.introOpen = false;
            this.selectedTerritoryId = undefined;
            this.contextPanelOpen = false;
            this.updateMapSelection();
            mapBridge.scene?.focusCountry?.(countryId);
            this.render();
            break;
          }
          case 'open-multiplayer':
            this.options.onMultiplayerRequested?.();
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
          case 'close-panel':
          case 'clear-territory':
            this.selectedTerritoryId = undefined;
            this.contextPanelOpen = false;
            this.updateMapSelection();
            this.render();
            break;
          case 'camera-reset': mapBridge.scene?.resetCamera(); break;
          case 'help': this.helpOpen = !this.helpOpen; this.render(); break;
          case 'inbox': this.inboxOpen = !this.inboxOpen; this.render(); break;
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
            const result = this.engine.declareWar(this.viewerPlayerId(), this.confirmWarTargetId);
            if (!commandAccepted(result)) this.toast(commandReason(result) ?? 'War cannot be declared.');
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
          case 'new-game': window.location.reload(); break;
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
  }
}
