import { MAP_WIDTH, REGION_BY_ID, TERRITORY_BY_ID } from '../game/data/worldMap';
import { mapBridge, type MapForeignControlState, type MapTerritoryState, type WorldMapEngineContract } from '../game/map/bridge';
import {
  RAPID_RECRUITMENT_COOLDOWN_TICKS,
  diminishingResearchLevelV2,
  UNDERDOG_VETERAN_MAX_EXPERIENCE,
  PEACE_REQUEST_MIN_WAR_AGE_TICKS,
  WAR_MOBILIZATION_TICKS,
} from '../sim/v2/balance';
import { WORLD_CONTENT_V2 } from '../sim/v2/content';
import { territoryIntegrationGainPerWeekV2 } from '../sim/v2/integration';
import { underdogVeteranTermsV2 } from '../sim/v2/WorldEngineV2';
import { selectResearchEffectImpactV2, type MilitaryBaseSnapshotV2 } from '../sim/v2/selectors';
import { veteranRankV2 } from '../sim/v2/veterans';
import { countryFlagHtml } from './countryFlags';
import { projectMapArmyV2 } from './mapArmyProjection';
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
  PropagandaTermsV2,
  RapidRecruitmentTermsV2,
  RankingEntryV2,
  ResearchBranchV2,
  ResearchEffectV2,
  ResearchBranchProgressV2,
  ResearchSurgeTermsV2,
  TerritoryId,
  TerritoryStateV2,
  WarAccessV2,
  WarDeclarationStatusV2,
  WarForecastV2,
  WarOutcomeV2,
  WarStateV2,
  WeeklyFinanceBreakdownV2,
  WeeklyManpowerProjectionV2,
  VeteranForcesViewV2,
  WorldChangeV2,
  WorldEventV2,
  WorldStateV2,
} from '../sim/v2/types';

type CommandOutcome = boolean | CommandResultV2 | void;
type ManualRequest = 'rapidRecruitment' | 'researchSurge' | 'propaganda';
type PendingManualRequest = { useCount: number; queuedAtTick?: number };
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
  player(playerId: string): NationViewV2 | undefined;
  territoriesOf(playerId: string): readonly unknown[];
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
  totalVeterans(playerId: string): VeteranForcesViewV2;
  recentLogisticsMovements(): readonly LogisticsMovementV2[];
  rapidRecruitmentTerms(playerId: string): RapidRecruitmentTermsV2;
  rapidRecruitment(playerId: string): CommandOutcome;
  armyStrength(playerId: string): ArmyStrengthV2;
  weeklyFinanceBreakdown(playerId: string): WeeklyFinanceBreakdownV2;
  weeklyNetCashflow(playerId: string): number;
  nationalAiPlan(playerId: string): NationalAiPlanV2;
  globalResistance(): GlobalResistanceV2;
  globalRanking(): RankingEntryV2[];
  militaryBaseSnapshot(): MilitaryBaseSnapshotV2;
  effectiveAttack(playerId: string, army: ArmyStateV2, snapshot?: MilitaryBaseSnapshotV2): number;
  effectiveDefense(playerId: string, army: ArmyStateV2, snapshot?: MilitaryBaseSnapshotV2): number;
  effectivePower(playerId: string, army: ArmyStateV2, snapshot?: MilitaryBaseSnapshotV2): number;
  territoryPower(territoryId: string): number;
  currentPower(playerId: string): number;
  conventionalPower(playerId: string): number;
  nuclearPower(playerId: string): NuclearPowerViewV2;
  researchPortfolio(playerId: string): readonly ResearchBranchProgressV2[];
  researchSurgeTerms(playerId: string): ResearchSurgeTermsV2;
  researchSurge(playerId: string): CommandOutcome;
  propagandaTerms(playerId: string): PropagandaTermsV2;
  launchPropaganda(playerId: string): CommandOutcome;
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
}

type PanelMode = 'war' | 'nation' | 'progress' | 'economy' | 'ranking';
type IntroSort = 'power' | 'attack' | 'defense' | 'manpower' | 'economy' | 'tax' | 'population' | 'growth';

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
    effect: 'Raises ATK and accelerates territorial control after battle pressure.',
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
};

const RESEARCH_COLORS: Record<ResearchBranchV2, string> = {
  'population-recruitment': '#69e3a2',
  'military-industry': '#f0bd68',
  'advanced-weapons': '#ff8179',
  'defensive-systems': '#6bddf2',
  'logistics-medicine': '#70aef5',
  'economy-science': '#b59cff',
};

function researchEffectLabel(effect: string): string {
  return ({
    'population-growth': 'POP GROWTH', training: 'TRAINING', 'force-capacity': 'CAPACITY',
    'reinforcement-efficiency': 'RECRUIT COST', attack: 'ATK', control: 'CONTROL',
    defense: 'DEF', 'casualty-reduction': 'PROTECTION', recovery: 'RECOVERY', supply: 'SUPPLY',
    'economy-growth': 'ECONOMY', 'research-speed': 'R&D SPEED', 'research-efficiency': 'R&D COST',
  } as Record<string, string>)[effect] ?? effect.toUpperCase();
}

function researchEffectTotal(effect: ResearchEffectV2, level: number, impact = 1): string {
  const percent = (value: number, suffix = '') => `${value >= 0 ? '+' : '−'}${format(Math.abs(value), 1)}%${suffix}`;
  if (effect === 'defense') return percent(20 * level / (level + 20), ' DEF');
  if (effect === 'casualty-reduction') return percent(-50 * level / (level + 30), ' losses');
  if (effect === 'recovery') return percent(-20 * level / (level + 46.67), ' deaths');
  if (effect === 'training') return percent(2 * diminishingResearchLevelV2(level, 30, 20), ' speed');
  if (effect === 'reinforcement-efficiency') return percent(-diminishingResearchLevelV2(level), ' cost');
  if (effect === 'research-efficiency') return percent(-diminishingResearchLevelV2(level), ' R&D cost');
  if (effect === 'economy-growth') return percent(0.06 * level * impact, '/yr growth');
  if (effect === 'population-growth') return percent(0.5 * level * impact, ' base growth');
  if (effect === 'force-capacity') return percent(level, ' capacity');
  if (effect === 'attack') return percent(level, ' ATK');
  if (effect === 'control') return percent(level, ' occupation');
  if (effect === 'supply') return percent(level, ' supply');
  if (effect === 'research-speed') return percent(level, ' R&D speed');
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
  return access === 'naval' ? 'NAVAL WAR' : access === 'land' ? 'LAND WAR' : 'NO ROUTE';
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

function mapControl(
  territoryId: string,
  territory: TerritoryStateV2,
  sourceTerritoryId?: string,
): MapForeignControlState | undefined {
  if (!territory.control || territory.control.controller === territory.owner) return undefined;
  const source = sourceTerritoryId ? TERRITORY_BY_ID[sourceTerritoryId] : undefined;
  const target = TERRITORY_BY_ID[territoryId];
  let axis: MapForeignControlState['axis'] = 'horizontal';
  let fromEdge: MapForeignControlState['fromEdge'] = 'start';
  if (source && target) {
    let dx = target.x - source.x;
    if (Math.abs(dx) > MAP_WIDTH / 2) dx += dx > 0 ? -MAP_WIDTH : MAP_WIDTH;
    const dy = target.y - source.y;
    axis = Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical';
    fromEdge = axis === 'horizontal' ? (dx >= 0 ? 'start' : 'end') : (dy >= 0 ? 'start' : 'end');
  }
  return {
    controllerId: territory.control.controller,
    share: territory.control.share,
    axis,
    fromEdge,
  };
}

function mapTerritory(
  territoryId: string,
  territory: TerritoryStateV2,
  army: MapTerritoryState['army'],
  controlSourceId?: string,
): MapTerritoryState {
  return {
    id: territoryId,
    ownerId: territory.owner,
    army,
    foreignControl: mapControl(territoryId, territory, controlSourceId),
  };
}

function nationalArmyState(
  engine: WorldEngineV2UIContract,
  playerId: PlayerId,
  strength = engine.armyStrength(playerId),
): ArmyStateV2 {
  const quality = engine.militaryBaseSnapshot().byNation.get(playerId) ?? { attack: 1, defense: 1 };
  return {
    manpower: strength.deployed,
    capacity: strength.capacity,
    baseAttack: quality.attack,
    baseDefense: quality.defense,
    veteranManpower: strength.veterans.manpower,
    veteranExperience: strength.veterans.experience,
  };
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

function createMapSnapshot(engine: WorldEngineV2UIContract): WorldMapEngineContract['state'] {
  const source = engine.state;
  const canonical = source.territories as unknown as Record<string, TerritoryStateV2>;
  const ownedTerritoriesByNation = new Map<PlayerId, string[]>();
  for (const [territoryId, territory] of Object.entries(canonical)) {
    const owned = ownedTerritoriesByNation.get(territory.owner) ?? [];
    owned.push(territoryId);
    ownedTerritoriesByNation.set(territory.owner, owned);
  }
  const controlSourceByTerritory = new Map<string, string>();
  for (const war of [...source.wars].sort((left, right) => left.id.localeCompare(right.id))) {
    for (const operation of allWarOperations(war)) {
      const target = canonical[operation.targetId];
      if (target?.control?.controller === operation.commanderId
        && !controlSourceByTerritory.has(operation.targetId)) {
        controlSourceByTerritory.set(operation.targetId, operation.sourceId);
      }
    }
  }
  for (const [territoryId, territory] of Object.entries(canonical)) {
    const controller = territory.control?.controller;
    if (!controller || controller === territory.owner || controlSourceByTerritory.has(territoryId)) continue;
    const connectedSource = WORLD_CONTENT_V2.territories[territoryId as TerritoryId]?.connections
      .map((connection) => ({ id: connection.targetId, kind: connection.kind }))
      .filter((candidate) => canonical[candidate.id]?.owner === controller)
      .sort((left, right) => (left.kind === 'land' ? 0 : 1) - (right.kind === 'land' ? 0 : 1) || left.id.localeCompare(right.id))[0]?.id;
    if (connectedSource) {
      controlSourceByTerritory.set(territoryId, connectedSource);
      continue;
    }
    const targetPoint = TERRITORY_BY_ID[territoryId];
    const nearestSource = (ownedTerritoriesByNation.get(controller) ?? [])
      .map((id) => ({ id, point: TERRITORY_BY_ID[id] }))
      .filter((candidate): candidate is { id: string; point: NonNullable<typeof candidate.point> } => Boolean(candidate.point && targetPoint))
      .sort((left, right) => {
        const distance = (point: NonNullable<typeof left.point>) => {
          let dx = Math.abs(point.x - targetPoint!.x);
          dx = Math.min(dx, MAP_WIDTH - dx);
          return dx * dx + (point.y - targetPoint!.y) ** 2;
        };
        return distance(left.point) - distance(right.point) || left.id.localeCompare(right.id);
      })[0]?.id;
    if (nearestSource) controlSourceByTerritory.set(territoryId, nearestSource);
  }
  return {
    tick: source.tick,
    humanPlayerId: source.humanPlayerId,
    territories: Object.fromEntries(Object.entries(canonical).map(([id, territory]) => {
      const army = projectMapArmyV2(engine, id as TerritoryId, territory);
      return [id, mapTerritory(
        id,
        territory,
        army,
        controlSourceByTerritory.get(id),
      )];
    })),
    wars: [...source.wars].sort((left, right) => left.id.localeCompare(right.id)).map((war) => ({
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

function createMapEngineAdapter(
  engine: WorldEngineV2UIContract,
  ranking: () => RankingEntryV2[],
): WorldMapEngineContract {
  let snapshot: WorldMapEngineContract['state'] | undefined;
  const readSnapshot = (): WorldMapEngineContract['state'] => {
    if (!snapshot) throw new Error('Map renderer snapshot requested before sync.');
    return snapshot;
  };
  return {
    get state() {
      return readSnapshot();
    },
    player: (playerId) => engine.player(playerId),
    territoriesOf: (playerId) => {
      return Object.values(readSnapshot().territories).filter((territory) => territory.ownerId === playerId);
    },
    globalRanking: ranking,
    totalManpower: (playerId) => engine.totalManpower(playerId),
    activeWarBetween: (leftId, rightId) => engine.activeWarBetween(leftId, rightId),
    refreshSnapshot: () => {
      snapshot = createMapSnapshot(engine);
    },
  };
}

export class WorldUIV2 {
  private readonly hud: HTMLElement;
  private readonly tooltip: HTMLElement;
  private readonly toastLayer: HTMLElement;
  private selectedTerritoryId?: TerritoryId;
  private panelMode: PanelMode = 'war';
  private gameExplainerOpen = true;
  private introOpen = true;
  private activationBriefingOpen = false;
  private activationBaselineRank?: number;
  private helpOpen = false;
  private inboxOpen = false;
  private eventFeedOpen = false;
  private contextPanelOpen = false;
  private confirmWarTargetId?: PlayerId;
  private confirmCeasefireWarId?: string;
  private confirmResearchSurge = false;
  private confirmPropaganda = false;
  private introPreviewCountryId: PlayerId = WORLD_CONTENT_V2.nationIds.find((id) => id === 'usa') ?? WORLD_CONTENT_V2.nationIds[0]!;
  private introSearchQuery = '';
  private introContinent = 'ALL';
  private introSort: IntroSort = 'power';
  private introGridScrollTop = 0;
  private warConfirmScrollTop = 0;
  private inboxScrollTop = 0;
  private helpScrollTop = 0;
  private empireNameDraft = '';
  private empireNameSubmitted = false;
  private readonly panelScrollTops = new Map<string, number>();
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
  private battleTimer?: number;
  private latestBattle?: BattleEventV2;
  private readonly warOutcomeQueue: WarOutcomeV2[] = [];
  private readonly manualRequests = new Map<ManualRequest, PendingManualRequest>();
  private readonly conquestTransferTimers = new Set<number>();
  private suppressMapUntil = 0;
  private readonly uiPointerIds = new Set<number>();
  private uiHoverBlocked = false;
  private readonly responsiveStyle: HTMLStyleElement;

  constructor(private readonly engine: WorldEngineV2UIContract) {
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
    mapBridge.engine = createMapEngineAdapter(engine, () => this.ranking());
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

  destroy(): void {
    this.unsubscribe?.();
    if (this.renderTimer !== undefined) window.clearTimeout(this.renderTimer);
    if (this.renderFrame !== undefined) window.cancelAnimationFrame(this.renderFrame);
    if (this.introSearchTimer !== undefined) window.clearTimeout(this.introSearchTimer);
    if (this.battleTimer !== undefined) window.clearTimeout(this.battleTimer);
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
    const modalOpen = this.gameExplainerOpen || this.introOpen || this.activationBriefingOpen || this.helpOpen || this.inboxOpen
      || Boolean(this.confirmWarTargetId) || Boolean(this.confirmCeasefireWarId)
      || this.confirmResearchSurge || this.confirmPropaganda
      || this.warOutcomeQueue.length > 0
      || this.shouldPromptEmpireName() || this.engine.state.gameOver;
    mapBridge.setInputBlocked(modalOpen || this.uiHoverBlocked || this.uiPointerIds.size > 0);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.gameExplainerOpen || this.introOpen || this.activationBriefingOpen || this.helpOpen || this.inboxOpen || this.confirmWarTargetId || this.confirmCeasefireWarId || this.confirmResearchSurge || this.confirmPropaganda || this.warOutcomeQueue.length > 0 || this.shouldPromptEmpireName()) return;
    if (event.key === 'Escape') {
      this.selectedTerritoryId = undefined;
      this.contextPanelOpen = false;
      this.updateMapSelection();
      this.render();
    }
  };

  private onStateChange(change: WorldChangeV2): void {
    if (change.reason === 'tick') this.processManualRequests();
    if (change.warOutcome) {
      this.latestBattle = undefined;
      if (this.battleTimer !== undefined) window.clearTimeout(this.battleTimer);
      this.battleTimer = undefined;
      const outcome = change.warOutcome;
      this.toast(`${outcome.result.replaceAll('-', ' ').toUpperCase()} · war concluded`,
        outcome.result === 'victory' || outcome.result === 'territorial-gain' ? 'conquest' : 'war');
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
    if (change.battle) {
      const humanId = this.engine.state.humanPlayerId;
      const humanBattle = change.battle.attackerId === humanId || change.battle.defenderId === humanId;
      if (humanBattle) this.latestBattle = change.battle;
      mapBridge.scene?.playBattle(change.battle);
      if (change.battle.conquered && change.battle.attackerId === humanId) {
        const battle = change.battle;
        const timer = window.setTimeout(() => {
          this.conquestTransferTimers.delete(timer);
          this.playConquestTransfer(battle);
        }, 420);
        this.conquestTransferTimers.add(timer);
      }
      if (humanBattle) {
        if (this.battleTimer !== undefined) window.clearTimeout(this.battleTimer);
        this.battleTimer = window.setTimeout(() => {
          this.latestBattle = undefined;
          this.battleTimer = undefined;
          this.scheduleRender(0, false);
        }, 8_000);
      }
    }
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

  private requestManualAction(action: ManualRequest): void {
    const humanId = this.engine.state.humanPlayerId;
    const useCount = action === 'rapidRecruitment'
      ? this.engine.rapidRecruitmentTerms(humanId).useCount
      : action === 'researchSurge'
        ? this.engine.researchSurgeTerms(humanId).useCount
        : this.engine.propagandaTerms(humanId).useCount;
    this.manualRequests.set(action, { useCount });
    this.toast('Request sent. APEX is reserving the required budget.');
  }

  private processManualRequests(): void {
    const humanId = this.engine.state.humanPlayerId;
    for (const [action, request] of [...this.manualRequests]) {
      const terms = action === 'rapidRecruitment'
        ? this.engine.rapidRecruitmentTerms(humanId)
        : action === 'researchSurge'
          ? this.engine.researchSurgeTerms(humanId)
          : this.engine.propagandaTerms(humanId);
      if (terms.useCount > request.useCount) {
        this.manualRequests.delete(action);
        this.toast('APEX completed your request.');
        continue;
      }
      if (request.queuedAtTick !== undefined && this.engine.state.tick <= request.queuedAtTick) continue;
      request.queuedAtTick = undefined;
      if (!terms.allowed) continue;
      const result = action === 'rapidRecruitment'
        ? this.engine.rapidRecruitment(humanId)
        : action === 'researchSurge'
          ? this.engine.researchSurge(humanId)
          : this.engine.launchPropaganda(humanId);
      if (commandAccepted(result)) request.queuedAtTick = this.engine.state.tick;
    }
  }

  private manualRequestStatus(action: ManualRequest, cost: number, cooldown = 0): string {
    if (this.manualRequests.has(action)) {
      if (cooldown > 0) return `REQUESTED · earliest in ${cooldown}w`;
      const human = this.engine.player(this.engine.state.humanPlayerId);
      const net = this.engine.weeklyNetCashflow(this.engine.state.humanPlayerId);
      const shortfall = Math.max(0, cost - (human?.treasury ?? 0));
      if (shortfall <= 0) return 'REQUESTED · executing next update';
      if (net > 0) return `REQUESTED · about ${Math.max(1, Math.ceil(shortfall / net))}w`;
      return 'REQUESTED · APEX rebalancing';
    }
    return cooldown > 0 ? `AVAILABLE IN ${cooldown}W` : 'REQUEST FROM APEX';
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
    const humanId = this.engine.state.humanPlayerId;
    return this.engine.state.wars.filter((war) => war.attackerId === humanId || war.defenderId === humanId);
  }

  private totalCombatStrength(playerId: string): { deployed: number; capacity: number } {
    return this.engine.totalManpower(playerId);
  }

  private selectTerritory(territoryId: TerritoryId): void {
    if (this.gameExplainerOpen || this.introOpen || this.activationBriefingOpen || this.helpOpen || this.inboxOpen || this.confirmWarTargetId || this.confirmCeasefireWarId || this.confirmResearchSurge || this.confirmPropaganda || this.warOutcomeQueue.length > 0 || this.shouldPromptEmpireName()) return;
    this.selectedTerritoryId = territoryId;
    this.contextPanelOpen = true;
    this.updateMapSelection();
    this.render();
  }

  private updateMapSelection(): void {
    mapBridge.setSelection({
      sourceId: this.selectedTerritoryId,
      legalTargetIds: [],
    });
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
    const integration = territory.integration < 0.999999
      ? ` · INTEGRATION ${format(territory.integration * 100)}%` : '';
    this.tooltip.innerHTML = `
      <div class="tooltip__eyebrow">${escapeHtml(REGION_BY_ID[definition.regionId]?.name ?? definition.regionId)}</div>
      <strong>${escapeHtml(definition.name)}</strong>
      <span style="color:${owner.cssColor}">${escapeHtml(owner.name)}</span>
      <div class="tooltip__stats">MANPOWER ${people(territory.army.manpower)} / ${people(territory.army.capacity)} · ATK ${format(this.engine.effectiveAttack(owner.id, territory.army), 2)} · DEF ${format(this.engine.effectiveDefense(owner.id, territory.army), 2)} · ${armyCondition(territory.army, territory.condition)}${integration}</div>
    `;
    this.tooltip.style.left = `${Math.min(window.innerWidth - 230, x + 16)}px`;
    this.tooltip.style.top = `${Math.min(window.innerHeight - 130, y + 14)}px`;
    this.tooltip.classList.add('is-visible');
  }

  private toast(message: string, tone: 'default' | 'war' | 'conquest' = 'default'): void {
    const element = document.createElement('div');
    element.className = `toast toast--${tone}`;
    element.textContent = message;
    this.toastLayer.append(element);
    window.setTimeout(() => element.classList.add('toast--show'), 15);
    window.setTimeout(() => {
      element.classList.remove('toast--show');
      window.setTimeout(() => element.remove(), 220);
    }, 2_200);
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
      { target: 'food', label: `+${format(unlockedShare * 100)}% FOOD ACCESS`, tone: 'food' },
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
    const openDrawer = this.hud.querySelector<HTMLElement>('.command-drawer[data-scroll-key]');
    if (openDrawer?.dataset.scrollKey) this.panelScrollTops.set(openDrawer.dataset.scrollKey, openDrawer.scrollTop);
    const introGrid = this.hud.querySelector<HTMLElement>('.country-grid');
    if (introGrid) this.introGridScrollTop = introGrid.scrollTop;
    const warConfirm = this.hud.querySelector<HTMLElement>('.war-confirm');
    if (warConfirm) this.warConfirmScrollTop = warConfirm.scrollTop;
    const inboxList = this.hud.querySelector<HTMLElement>('.inbox-list');
    if (inboxList) this.inboxScrollTop = inboxList.scrollTop;
    const help = this.hud.querySelector<HTMLElement>('.world-help');
    if (help) this.helpScrollTop = help.scrollTop;
    const empireInput = this.hud.querySelector<HTMLInputElement>('#empire-name');
    const restoreEmpireFocus = empireInput === document.activeElement;
    if (empireInput) this.empireNameDraft = empireInput.value;

    const state = this.engine.state;
    const human = this.engine.player(state.humanPlayerId);
    if (!human) return;
    const economy = this.engine.nationalEconomy(human.id);
    const finance = this.engine.weeklyFinanceBreakdown(human.id);
    // This is the authoritative next-week recurring forecast.
    const displayedNet = finance.net;
    const army = this.engine.armyStrength(human.id);
    const veterans = this.engine.totalVeterans(human.id);
    const combatPower = this.engine.currentPower(human.id);
    // Reuse the already calculated finance plan. Population dynamics otherwise
    // calculate a second full finance/power snapshot for the same render.
    const populationDynamics = this.engine.populationDynamics(human.id, finance.populationGrowth);
    const populationTrend = populationDynamics.weeklyNet;
    const annualNet = annual(displayedNet);
    const annualPopulationTrend = annual(populationTrend);
    const annualFoodStockChange = annual(finance.foodStockChange);
    const completedUpgrades = Object.values(human.research.breakthroughs).reduce((sum, value) => sum + value, 0);
    const ranking = this.ranking();
    const humanRank = Math.max(1, ranking.findIndex((entry) => entry.player.id === human.id) + 1);
    const unread = state.events.filter((event) => event.unread && isMajorWorldEvent(event)).length;
    const pendingOffers = state.offers.filter((offer) => offer.toId === human.id && offer.status === 'pending');
    const activeOffer = pendingOffers[0];
    const wars = this.humanWars();
    const warOutcome = this.warOutcomeQueue[0];
    const commandOpen = this.contextPanelOpen && !this.selectedTerritoryId;
    if (this.gameExplainerOpen || this.introOpen || this.activationBriefingOpen || this.helpOpen || this.inboxOpen || this.confirmWarTargetId || this.confirmCeasefireWarId || this.confirmResearchSurge || this.confirmPropaganda || warOutcome || this.shouldPromptEmpireName() || state.gameOver) this.tooltip.classList.remove('is-visible');

    this.hud.innerHTML = `
      <header class="situation-topbar command-topbar glass-panel v2-topbar v2-interactive simple-topbar" style="grid-template-columns:minmax(190px,250px) minmax(520px,1fr) auto">
        <div class="coalition-chip command-identity" style="--coalition:${human.cssColor}">
          <span class="country-flag" aria-hidden="true">${countryFlagHtml(human.id, human.sigil, true)}</span><div class="coalition-chip__body"><small>${worldDateLabel(state.tick)} · AI ${escapeHtml(finance.aiMode.toUpperCase())}</small><div class="command-identity__line"><strong title="${escapeHtml(human.name)}">${escapeHtml(human.shortName)}</strong><button class="v2-rank-badge" data-action="ranking" aria-label="Open world ranking; ${escapeHtml(human.name)} is rank ${humanRank}">#${humanRank}</button></div></div>
        </div>
        <div class="strategic-metrics v2-metrics simple-metrics" style="display:grid;grid-template-columns:repeat(6,minmax(76px,1fr));gap:4px;overflow-x:auto">
          <div class="top-metric--economy" data-stat-target="economy" role="group" aria-label="Economy ${cash(economy.controlledOutput)}; annual growth ${signed(finance.annualEconomyGrowthRate * 100, 2)} percent"><span>ECONOMY</span><strong>${cash(economy.controlledOutput)}</strong><small class="weekly-delta ${finance.annualEconomyGrowthRate >= 0 ? 'is-positive' : 'is-negative'}">${signed(finance.annualEconomyGrowthRate * 100, 2)}%/year</small></div>
          <div role="group" aria-label="APEX national management mode ${escapeHtml(finance.aiMode)}"><span>APEX</span><strong>${escapeHtml(finance.aiMode.toUpperCase())}</strong><small>Reserves managed automatically</small></div>
          <div data-stat-target="people" role="group" title="Net annual population change ${signed(populationDynamics.annualNetRate * 100, 2)}%" aria-label="Population ${format(economy.population, 2)} million; annual trend ${signedPeople(annualPopulationTrend)}"><span>PEOPLE</span><strong>${population(economy.population)}</strong><small class="weekly-delta ${populationTrend >= 0 ? 'is-positive' : 'is-negative'}">${signedPeople(annualPopulationTrend)}/yr</small></div>
          <div data-stat-target="food" role="group" aria-label="Food stock ${people(human.foodStock)} of ${people(finance.foodStorageCapacity)} capacity; annualized stock change ${signedPeople(annualFoodStockChange)}"><span>FOOD</span><strong>${people(human.foodStock)} / ${people(finance.foodStorageCapacity)}</strong><small class="weekly-delta ${finance.foodStockChange >= 0 ? 'is-positive' : 'is-negative'}">${signedPeople(annualFoodStockChange)}/yr</small></div>
          <div class="top-metric--army" data-stat-target="army" role="group" title="Combat power includes the veteran bonus. Veterans are already included in deployed manpower." aria-label="Army ${people(army.deployed)} active of ${people(army.capacity)} capacity; combat power ${compactNumber(combatPower)}; veterans ${people(veterans.manpower)} at average rank ${veterans.rank}"><span>ARMY</span><strong>${people(army.deployed)} / ${people(army.capacity)}</strong><small>${format(army.fillRatio * 100)}% · PWR ${compactNumber(combatPower)} · VET ${people(veterans.manpower)} R${veterans.rank}</small></div>
          <div class="top-metric--research" role="group" aria-label="Research ${completedUpgrades} completed upgrades; ${cash(annual(finance.research))} funded per year"><span>RESEARCH</span><strong>${completedUpgrades} upgrades</strong><small>${cash(annual(finance.research))}/yr funded</small></div>
        </div>
        <div class="top-actions">
          <button class="icon-button inbox-button ${unread ? 'has-alert' : ''}" data-action="inbox" title="Reports">⌁${unread ? `<i>${unread}</i>` : ''}</button>
          <button class="icon-button" data-action="camera-reset" title="Center map">⌖</button>
          <button class="icon-button" data-action="help" title="Help">?</button>
        </div>
      </header>

      <nav class="command-dock glass-panel" aria-label="Command center">
        <button class="${commandOpen && this.panelMode === 'war' ? 'is-active' : ''} ${wars.length ? 'has-war' : ''}" data-action="panel" data-panel="war"><i>⚔</i><span><b>WAR</b><small>${wars.length ? `${wars.length} active` : 'Choose target'}</small></span></button>
        <button class="${commandOpen && this.panelMode === 'nation' ? 'is-active' : ''}" data-action="panel" data-panel="nation"><i>◇</i><span><b>NATION</b><small>AI · ${escapeHtml(finance.aiMode)}</small></span></button>
        <button class="${commandOpen && this.panelMode === 'progress' ? 'is-active' : ''}" data-action="panel" data-panel="progress"><i>⌁</i><span><b>PROGRESS</b><small>${completedUpgrades} upgrades</small></span></button>
        <button class="${commandOpen && this.panelMode === 'economy' ? 'is-active' : ''} ${displayedNet < 0 ? 'is-negative' : ''}" data-action="panel" data-panel="economy"><i>$</i><span><b>ECONOMY</b><small>${signed(finance.annualEconomyGrowthRate * 100, 2)}%/yr</small></span></button>
      </nav>

      ${wars.length ? this.renderWarTracker(wars) : ''}
      ${this.contextPanelOpen ? this.renderContextPanel(human, economy, finance, populationDynamics) : ''}
      ${activeOffer ? this.renderOfferBanner(activeOffer) : ''}
      ${!warOutcome && this.gameExplainerOpen ? this.renderGameExplainer() : !warOutcome && this.introOpen ? this.renderIntro() : ''}
      ${!warOutcome && this.activationBriefingOpen ? this.renderActivationBriefing() : ''}
      ${!warOutcome && this.helpOpen ? this.renderHelp() : ''}
      ${!warOutcome && this.inboxOpen ? this.renderInbox() : ''}
      ${!warOutcome && this.confirmWarTargetId ? this.renderWarConfirmation(this.confirmWarTargetId) : ''}
      ${!warOutcome && this.confirmCeasefireWarId ? this.renderCeasefireConfirmation(this.confirmCeasefireWarId) : ''}
      ${!warOutcome && this.confirmResearchSurge ? this.renderResearchSurgeConfirmation() : ''}
      ${!warOutcome && this.confirmPropaganda ? this.renderPropagandaConfirmation() : ''}
      ${warOutcome ? this.renderWarOutcome(warOutcome) : ''}
      ${!warOutcome && this.shouldPromptEmpireName() && !this.helpOpen && !this.inboxOpen && !this.confirmWarTargetId && !this.confirmCeasefireWarId && !this.confirmResearchSurge && !this.confirmPropaganda ? this.renderEmpireNamePrompt() : ''}
      ${!warOutcome && state.gameOver ? this.renderGameOver() : ''}
    `;
    this.bindActions();
    const nextDrawer = this.hud.querySelector<HTMLElement>('.command-drawer[data-scroll-key]');
    if (nextDrawer?.dataset.scrollKey) nextDrawer.scrollTop = this.panelScrollTops.get(nextDrawer.dataset.scrollKey) ?? 0;
    const nextIntroGrid = this.hud.querySelector<HTMLElement>('.country-grid');
    if (nextIntroGrid) nextIntroGrid.scrollTop = this.introGridScrollTop;
    const nextWarConfirm = this.hud.querySelector<HTMLElement>('.war-confirm');
    if (nextWarConfirm) nextWarConfirm.scrollTop = this.warConfirmScrollTop;
    const nextInboxList = this.hud.querySelector<HTMLElement>('.inbox-list');
    if (nextInboxList) nextInboxList.scrollTop = this.inboxScrollTop;
    const nextHelp = this.hud.querySelector<HTMLElement>('.world-help');
    if (nextHelp) nextHelp.scrollTop = this.helpScrollTop;
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
    if (this.panelMode === 'nation') return this.renderNationPanel();
    return this.renderWarPanel();
  }

  private renderNationPanel(): string {
    const human = this.engine.player(this.engine.state.humanPlayerId)!;
    const finance = this.engine.weeklyFinanceBreakdown(human.id);
    const aiPlan = this.engine.nationalAiPlan(human.id);
    const army = this.engine.armyStrength(human.id);
    const displayedNet = finance.net;
    const resistance = this.engine.globalResistance();
    const propaganda = this.engine.propagandaTerms(human.id);
    const coalitionNames = resistance.memberIds.slice(0, 6)
      .map((id) => this.engine.player(id)?.shortName).filter(Boolean);
    const portfolio = this.engine.researchPortfolio(human.id);
    const allocations = human.research.allocations;
    const primary = [...portfolio].sort((left, right) => allocations[right.branch] - allocations[left.branch])[0];
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
    const armyAction = army.fillRatio < 0.92
      ? `Training toward ${people(army.capacity)} capacity`
      : army.veterans.manpower > 0
        ? `${people(army.veterans.manpower)} veterans keep their experience`
        : 'Maintaining full strength';
    const moneyAction = finance.foodCoverage < 0.95
      ? `Food emergency ${cash(annual(finance.foodProduction))}/yr · Logistics R&D ${allocations['logistics-medicine']}%`
      : finance.mode === 'war'
      ? `Army ${cash(annual(finance.totalMilitaryCost))}/yr · R&D ${cash(annual(finance.research))}/yr`
      : `R&D ${cash(annual(finance.research))}/yr · growth ${cash(annual(finance.development))}/yr`;
    const researchName = primary ? RESEARCH_META[primary.branch].label : 'All programs complete';
    const researchShare = primary ? allocations[primary.branch] : 0;
    const reactionLabel = resistance.level ? 'CONTAINMENT ACTIVE'
      : resistance.members ? `${resistance.members}/5 COALITION BUILDING` : 'NO COALITION';
    const reactionDetail = resistance.members
      ? coalitionNames.map((name) => escapeHtml(name!)).join(' · ')
        + (resistance.members > coalitionNames.length ? ` · +${resistance.members - coalitionNames.length}` : '')
      : 'World powers are monitoring expansion.';
    return `
      <aside class="world-panel command-drawer glass-panel nation-command command-drawer--clean" data-scroll-key="nation">
        <button class="panel-close" data-action="close-panel" aria-label="Close nation overview">×</button>
        <div class="panel-kicker">NATION · APEX AUTOPILOT</div>
        <div class="drawer-heading drawer-heading--compact" title="${escapeHtml(aiPlan.explanation)}"><div><h2>${escapeHtml(aiPlan.mode.toUpperCase())}</h2><span>AI EFFICIENCY ×${format(aiPlan.efficiency, 2)}</span></div><strong class="${displayedNet >= 0 ? 'is-positive' : 'is-negative'}">${escapeHtml(cashStatus)}</strong></div>
        <section class="nation-reaction-block">
          <div class="nation-reaction-head"><span>WORLD REACTION</span><strong>${escapeHtml(reactionLabel)}</strong></div>
          <div class="simple-suspicion"><span>SUSPICION</span><i><b style="width:${resistance.threat}%"></b></i><strong>${format(resistance.threat)}%</strong></div>
          <p>${reactionDetail}</p>
          ${activeTreaties ? `<div class="nation-reaction-details">${activeTreaties}</div>` : ''}
          ${this.renderPropagandaCard(propaganda)}
        </section>
        <span class="section-label">WHAT APEX IS DOING</span>
        <div class="ai-simple-actions">
          <article title="Allocation chosen by APEX"><i>1</i><div><span>SPENDING</span><strong>${escapeHtml(moneyAction)}</strong></div><b>${escapeHtml(finance.aiMode.toUpperCase())}</b></article>
          <article><i>2</i><div><span>ARMY</span><strong>${escapeHtml(armyAction)}</strong></div><b>${format(army.fillRatio * 100)}%</b></article>
          <article title="${escapeHtml(primary ? RESEARCH_META[primary.branch].effect : 'All development complete')}"><i>3</i><div><span>DEVELOPMENT</span><strong>${escapeHtml(researchName)}</strong></div><b>${researchShare}% focus</b></article>
        </div>
      </aside>
    `;
  }

  private renderEconomyPanel(
    human: NationViewV2,
    economy: NationalEconomyV2,
    finance: WeeklyFinanceBreakdownV2,
    demographics: PopulationDynamicsV2,
  ): string {
    const totalIncome = finance.revenue + finance.ceasefireIncome;
    const growth = finance.annualEconomyGrowthRate;
    const foodSupplyRatio = finance.foodProduced / Math.max(0.01, finance.foodDemand);
    const treatyNote = finance.ceasefireIncome > 0
      ? ` · includes ${cash(annual(finance.ceasefireIncome))}/yr treaty income` : '';
    return `
      <aside class="world-panel command-drawer glass-panel economy-command economy-command--simple" data-scroll-key="economy">
        <button class="panel-close" data-action="close-panel" aria-label="Close economy">×</button>
        <div class="panel-kicker">ECONOMY · WEEK ${this.engine.state.tick}</div>
        <div class="drawer-heading economy-heading"><div><h2>${cash(economy.controlledOutput)}</h2><span>NATIONAL ECONOMY</span></div><strong class="${growth >= 0 ? 'is-positive' : 'is-negative'}">${signed(growth * 100, 2)}% / year</strong></div>

        <div class="simple-economy-grid">
          <article class="simple-economy-card simple-economy-card--treasury"><span>APEX BUDGET</span><strong>${escapeHtml(finance.aiMode.toUpperCase())}</strong><small>Cash reserves and emergency funding are automatic</small></article>
          <article class="simple-economy-card ${growth >= 0 ? 'is-good' : 'is-danger'}"><span>ECONOMY</span><strong>${cash(economy.controlledOutput)}</strong><small class="${growth >= 0 ? 'is-positive' : 'is-negative'}">${signed(growth * 100, 2)}%/year · ${cash(economy.wealthPerPerson / 1e6)}/person</small></article>
          <article class="simple-economy-card"><span>TAX INCOME · ${format(economy.taxRate * 100, 1)}%</span><strong class="is-positive">+${cash(annual(totalIncome))}/year</strong><small>Automatic national rate${treatyNote}</small></article>
          <article class="simple-economy-card"><span>TOTAL COSTS</span><strong class="is-negative">−${cash(annual(finance.expenses))}/year</strong><small>Food, army, research, growth and wars</small></article>
          <article class="simple-economy-card"><span>PEOPLE</span><strong>${population(economy.population)}</strong><small class="${demographics.weeklyNet >= 0 ? 'is-positive' : 'is-negative'}">${signedPeople(annual(demographics.weeklyNet))}/year</small></article>
          <article class="simple-economy-card"><span>FOOD</span><strong>${people(human.foodStock)} / ${people(finance.foodStorageCapacity)}</strong><small class="${finance.foodStockChange >= 0 ? 'is-positive' : 'is-negative'}">${format(foodSupplyRatio * 100, 1)}% incoming · ${signedPeople(annual(finance.foodStockChange))} stored/year</small></article>
        </div>

        <span class="section-label">WHY THESE NUMBERS MOVE</span>
        <div class="simple-finance-formulas">
          <div><span>GROWTH</span><code>Base ${signed(finance.economyBaseGrowthRate * 100, 2)}% · investment ${signed(finance.economyInvestmentGrowthRate * 100, 2)}% · research ${signed(finance.economyResearchGrowthRate * 100, 2)}% · food ${signed(finance.economyFoodGrowthRate * 100, 2)}% · war −${format(finance.warEconomyGrowthDrag * 100, 2)}%</code><strong class="${growth >= 0 ? 'is-positive' : 'is-negative'}">${signed(growth * 100, 2)}% / year</strong></div>
          <div><span>FOOD MIX · YEAR</span><code>${people(annual(finance.foodDomesticProduced))} domestic · ${people(annual(finance.foodImported))} imported · ${people(annual(finance.foodDemand))} needed</code><strong>${format(finance.foodCoverage * 100, 1)}% fed</strong></div>
        </div>
      </aside>
    `;
  }

  private renderProgressPanel(): string {
    const human = this.engine.player(this.engine.state.humanPlayerId)!;
    const finance = this.engine.weeklyFinanceBreakdown(human.id);
    const portfolio = this.engine.researchPortfolio(human.id);
    const deterrence = this.engine.nuclearPower(human.id);
    const surge = this.engine.researchSurgeTerms(human.id);
    const next = nextResearchMilestone(portfolio);
    const completed = portfolio.reduce((sum, branch) => sum + branch.breakthroughs, 0);
    const effectLevels = this.engine.state.players[human.id]!.research.effectLevels;
    const upgradeTotals = Object.entries(effectLevels)
      .filter(([, level]) => level > 0)
      .sort(([left], [right]) => researchEffectLabel(left).localeCompare(researchEffectLabel(right)))
      .map(([effect, level]) => {
        const typedEffect = effect as ResearchEffectV2;
        const impact = selectResearchEffectImpactV2(this.engine.state, WORLD_CONTENT_V2, human.id, typedEffect);
        return `<article><span>${escapeHtml(researchEffectLabel(effect))}</span><strong>${escapeHtml(researchEffectTotal(typedEffect, level, impact))}</strong><small>LV ${level}</small></article>`;
      })
      .join('');
    const nextProgress = next ? Math.round(clamp(next.progressRatio, 0, 1) * 100) : 100;
    const nuclearProgress = Math.round(deterrence.progressRatio * 100);
    const programs = portfolio.map((branch) => {
      const progress = Math.round(clamp(branch.progressRatio, 0, 1) * 100);
      const effects = branch.effects.map((effect) => `${researchEffectLabel(effect.effect)} LV ${effect.level}`).join(' · ');
      const harder = branch.nextCostIncreaseRatio > 1
        ? `${format((branch.nextCostIncreaseRatio - 1) * 100)}% harder after completion` : 'final level';
      return `<article class="progress-program progress-program--compact" style="--project:${RESEARCH_COLORS[branch.branch]}" title="${escapeHtml(`${effects} · ${harder}`)}"><div><span>${escapeHtml(RESEARCH_META[branch.branch].shortLabel)}</span><b>${progress}%</b></div><strong>${branch.breakthroughs} upgrades · ${branch.allocation}% focus</strong><i><b style="width:${progress}%"></b></i></article>`;
    }).join('');
    return `
      <aside class="world-panel command-drawer glass-panel progress-command command-drawer--clean" data-scroll-key="progress">
        <button class="panel-close" data-action="close-panel" aria-label="Close national progress">×</button>
        <div class="panel-kicker">PROGRESS · CONTINUOUS DEVELOPMENT</div>
        <div class="drawer-heading drawer-heading--compact"><div><h2>${completed} upgrades</h2><span>SIX PROGRAMS RUN AUTOMATICALLY</span></div><strong class="is-positive">${cash(annual(finance.research))}/YR</strong></div>
        <div class="simple-economy-grid simple-panel-grid progress-summary--clean">
          <article class="simple-economy-card"><span>TOTAL RESEARCH</span><strong>${completed} upgrades</strong><small>Across all six programs</small></article>
          <article class="simple-economy-card"><span>FUNDING</span><strong>${cash(annual(finance.research))}/year</strong><small>Automatically divided by focus</small></article>
          <article class="simple-economy-card"><span>NEXT UPGRADE</span><strong>${next ? escapeHtml(RESEARCH_META[next.branch].shortLabel) : 'COMPLETE'}</strong><small>${nextProgress}% progress</small></article>
          <article class="simple-economy-card"><span>NUCLEAR</span><strong>${deterrence.level ? `Tier ${deterrence.level}` : `${nuclearProgress}%`}</strong><small>+${format(deterrence.attackBonus * 100)}% ATK</small></article>
        </div>
        <span class="section-label">EMPIRE UPGRADES · ALREADY ACTIVE</span>
        <div class="upgrade-total-grid">${upgradeTotals || '<div class="empty-state">No completed upgrade effects yet.</div>'}</div>
        <div class="research-surge-card research-surge-card--clean"><div><span>RESEARCH SURGE</span><strong>+${surge.progressWeeks} weeks to every program</strong><small>APEX reserves the money and executes when ready</small></div><button class="secondary-button" data-action="open-research-surge" ${this.manualRequests.has('researchSurge') ? 'disabled' : ''}>${this.manualRequestStatus('researchSurge', surge.cost, surge.cooldownRemaining)}</button></div>
        <span class="section-label">ALL PROGRAMS</span>
        <div class="progress-programs progress-programs--compact">${programs}</div>
      </aside>
    `;
  }

  private renderWarPanel(): string {
    const human = this.engine.player(this.engine.state.humanPlayerId)!;
    const army = this.engine.armyStrength(human.id);
    const nationalArmy = nationalArmyState(this.engine, human.id, army);
    const attack = this.engine.effectiveAttack(human.id, nationalArmy);
    const defense = this.engine.effectiveDefense(human.id, nationalArmy);
    const combatPower = this.engine.currentPower(human.id);
    const manpowerProjection = this.engine.weeklyManpowerProjection(human.id);
    const manpowerTrend = manpowerProjection.net;
    const weakArmy = army.fillRatio < 0.55;
    const wars = this.humanWars();
    const defensiveWars = wars.filter((war) => war.defenderId === human.id).length;
    const offers = this.engine.state.offers.filter((offer) => offer.toId === human.id && offer.status === 'pending');
    const finance = this.engine.weeklyFinanceBreakdown(human.id);
    const rapidRecruitment = this.engine.rapidRecruitmentTerms(human.id);
    const resistance = this.engine.globalResistance();
    const recommendations = this.warTargetRecommendations(human.id, resistance);
    return `
      <aside class="world-panel command-drawer glass-panel war-command command-drawer--clean" data-scroll-key="war">
        <button class="panel-close" data-action="close-panel" aria-label="Close war command">×</button>
        <div class="panel-kicker">WAR · HIGH COMMAND</div>
        <div class="drawer-heading drawer-heading--compact"><div><h2>${wars.length ? `${wars.length} active war${wars.length > 1 ? 's' : ''}` : 'Ready for orders'}</h2><span>APEX COMMANDS EVERY FRONT</span></div><strong class="${wars.length ? 'is-negative' : 'is-positive'}">${wars.length ? 'AT WAR' : 'READY'}</strong></div>
        <div class="simple-economy-grid simple-panel-grid war-summary-grid">
          <article class="simple-economy-card"><span>COMBAT POWER</span><strong>${compactNumber(combatPower)}</strong><small>ATK ${format(attack, 2)} · DEF ${format(defense, 2)}</small></article>
          <article class="simple-economy-card ${weakArmy ? 'is-warn' : 'is-good'}"><span>ARMY</span><strong>${people(army.deployed)} / ${people(army.capacity)}</strong><small>${format(army.fillRatio * 100)}% ready · ${people(army.veterans.manpower)} veterans R${army.veterans.rank}</small></article>
          <article class="simple-economy-card"><span>ANNUAL CHANGE</span><strong class="${manpowerTrend >= 0 ? 'is-positive' : 'is-negative'}">${manpowerTrend >= 0 ? '+' : '−'}${people(Math.abs(annual(manpowerTrend)))}</strong><small>${cash(annual(finance.armyUpkeep + finance.warOperations))}/year army + fronts</small></article>
          <article class="simple-economy-card"><span>TRAINING PIPELINE</span><strong>+${people(annual(finance.passiveRecruitment))}/year</strong><small>${finance.acceleratedRecruitment > 0 ? `AI fast-track +${people(annual(finance.acceleratedRecruitment))}/yr · ${cash(annual(finance.recruitmentAccelerationCost))}/yr` : finance.acceleratedDemobilization > 0 ? `Paid drawdown −${people(annual(finance.acceleratedDemobilization))}/yr` : 'Steady training · Training research improves speed'}</small></article>
        </div>
        ${defensiveWars ? `<div class="simple-panel-alert is-defense"><b>APEX DEFENCE</b><span>Stronger coordination and fewer casualties on ${defensiveWars} defensive front${defensiveWars === 1 ? '' : 's'}.</span></div>` : ''}
        <div class="rapid-recruitment-card rapid-recruitment-card--clean ${rapidRecruitment.atWar ? 'is-war' : ''}"><div><span>${rapidRecruitment.atWar ? 'WARTIME REINFORCEMENT' : 'RAPID RECRUITMENT'}</span><strong>+${people(rapidRecruitment.amount)} when approved</strong><small>APEX saves the required budget; cooldown remains ${RAPID_RECRUITMENT_COOLDOWN_TICKS} weeks after execution</small></div><button class="${rapidRecruitment.atWar ? 'danger-button' : 'primary-button'}" data-action="rapid-recruitment" ${this.manualRequests.has('rapidRecruitment') ? 'disabled' : ''}>${this.manualRequestStatus('rapidRecruitment', rapidRecruitment.cost, rapidRecruitment.cooldownRemaining)}</button></div>
        ${offers.length ? `<span class="section-label">LIVE PEACE OFFERS</span><div class="war-list">${offers.map((offer) => this.renderPeaceOfferCard(offer)).join('')}</div>` : ''}
        ${wars.length ? '<span class="section-label">LIVE WARS</span>' : ''}
        <div class="war-list">${wars.length ? wars.map((war) => this.renderWarCard(war, human.id, finance)).join('') : '<div class="empty-state">No active war. Pick a target below or click a country on the map.</div>'}</div>
        <span class="section-label">IN RANGE · TOP 3 BY WIN CHANCE</span>
        <div class="war-intel-list">${recommendations.length ? recommendations.map((candidate, index) => this.renderTargetRecommendation(candidate, index)).join('') : '<div class="empty-state">No legal target in land or naval range. Check truces and access.</div>'}</div>
      </aside>
    `;
  }

  private renderPropagandaCard(terms: PropagandaTermsV2): string {
    const active = terms.activeRemainingTicks > 0;
    const completed = active ? terms.activeProgress : 0;
    if (active) {
      return `<div class="propaganda-card is-active"><div><span>PROPAGANDA CAMPAIGN</span><strong>−${format(terms.weeklySuspicionReduction, 2)} suspicion / week</strong><small>${terms.activeRemainingTicks}w left · gradual influence campaign</small><i><b style="width:${format(completed * 100, 1)}%"></b></i></div><button disabled>ACTIVE</button></div>`;
    }
    return `<div class="propaganda-card"><div><span>PROPAGANDA CAMPAIGN</span><strong>Reduce suspicion by ${format(terms.totalSuspicionReduction)} over ${terms.durationTicks}w</strong><small>APEX reserves funding and launches it when ready</small></div><button class="secondary-button" data-action="open-propaganda" ${this.manualRequests.has('propaganda') ? 'disabled' : ''}>${this.manualRequestStatus('propaganda', terms.cost, terms.cooldownRemainingTicks)}</button></div>`;
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
    const forecast = this.engine.conquestForecast(this.engine.state.humanPlayerId, candidate.targetId);
    const targetFinance = this.engine.weeklyFinanceBreakdown(candidate.targetId);
    const targetEconomy = this.engine.nationalEconomy(candidate.targetId);
    const foodTrend = annual(targetFinance.foodStockChange);
    return `<article class="war-intel-card" style="--enemy:${candidate.target.cssColor}"><i class="country-flag">${countryFlagHtml(candidate.target.id, candidate.target.sigil)}</i><div><span>${index === 0 ? 'BEST TARGET' : `OPTION ${index + 1}`} · ${warAccessLabel(candidate.declaration.access)}</span><strong>${escapeHtml(candidate.target.name)}</strong><small><b>${candidate.chance}% win</b> · FOOD ${format(targetFinance.foodCoverage * 100)}% (${signedPeople(foodTrend)}/yr) · GDP ${cash(targetEconomy.controlledOutput)} · POP ${population(targetEconomy.population)}</small><small>Potential gain: ${forecast.territoryCount} territor${forecast.territoryCount === 1 ? 'y' : 'ies'} · ~${cash(forecast.initialOccupationOutput)} initial output</small></div><button data-action="quick-war" data-player="${candidate.targetId}">ATTACK</button></article>`;
  }

  private renderWarCard(war: WarStateV2, humanId: PlayerId, finance: WeeklyFinanceBreakdownV2): string {
    const enemyId = war.attackerId === humanId ? war.defenderId : war.attackerId;
    const enemy = this.engine.player(enemyId)!;
    const score = war.attackerId === humanId ? war.warScore : -war.warScore;
    const ownArmy = this.totalCombatStrength(humanId);
    const enemyArmy = this.totalCombatStrength(enemyId);
    const operations = warOperationsFor(war, humanId);
    const operation = operations[0];
    const hostileFrontCount = warOperationsFor(war, enemyId).length;
    const terms = this.engine.peaceProposalTerms(war.id, humanId);
    const ceasefire = this.engine.ceasefireTerms(war.id, humanId);
    const suggested = terms.suggestedSettlement ?? 'reparations';
    const targets = [...new Set(operations.map((front) => (
      WORLD_CONTENT_V2.territories[front.targetId]?.name
    )).filter((name): name is string => Boolean(name)))];
    const targetDetail = targets.length > 0
      ? `${targets.length === 1 ? 'Priority' : 'Objectives'}: ${targets.slice(0, 3).map(escapeHtml).join(', ')}${targets.length > 3 ? ` +${targets.length - 3}` : ''}`
      : 'High command is evaluating the line';
    const frontForces = operations.map((front) => this.engine.state.territories[front.sourceId]?.army)
      .filter((army): army is ArmyStateV2 => Boolean(army));
    const frontStrength = frontForces.reduce((sum, army) => {
      const attack = this.engine.effectiveAttack(humanId, army);
      const defense = this.engine.effectiveDefense(humanId, army);
      const quality = Math.max(0.000001, 0.55 * attack + 0.45 * defense);
      return sum + this.engine.effectivePower(humanId, army) / (1_000 * quality);
    }, 0);
    const frontVeterans = frontForces.reduce((sum, army) => sum + army.veteranManpower, 0);
    const averageMomentum = operations.length > 0
      ? operations.reduce((sum, front) => sum + front.momentum, 0) / operations.length : 0;
    const frontDetail = operations.length > 0
      ? `Committed ${people(frontStrength)} across ${operations.length} front${operations.length === 1 ? '' : 's'} · ${people(frontVeterans)} veterans`
      : 'Front force pending';
    const accessKinds = new Set(operations.map((front) => front.access));
    const frontLabel = operations.length === 1
      ? `LIVE ${warAccessLabel(operation!.access)} FRONT`
      : operations.length > 1
        ? `LIVE ${operations.length} ${accessKinds.size === 1 ? `${warAccessLabel(operation!.access)} ` : ''}FRONTS`
        : 'APEX REALLOCATING';
    const warAge = this.engine.state.tick - war.startedTick;
    const mobilizationWeeks = Math.max(0, WAR_MOBILIZATION_TICKS - warAge);
    const pulse = this.latestBattle?.warId === war.id ? this.latestBattle : undefined;
    const humanAttacked = pulse?.attackerId === humanId;
    const estimate = this.engine.liveWarEstimate(war.id, humanId);
    const shownOwnLoss = pulse
      ? humanAttacked ? pulse.attackerLosses : pulse.defenderLosses
      : estimate?.projectedOwnLosses ?? 0;
    const shownEnemyLoss = pulse
      ? humanAttacked ? pulse.defenderLosses : pulse.attackerLosses
      : estimate?.projectedEnemyLosses ?? 0;
    const pulseReport = estimate ? `<div class="war-pulse-report"><span>${pulse ? `LAST COMBAT PULSE · WEEK ${pulse.tick}` : 'PROJECTED NEXT BATTLE'}</span><strong>YOU −${people(shownOwnLoss)} · ENEMY −${people(shownEnemyLoss)}</strong><small>Total combat damage: you −${people(estimate.totalOwnLosses)}, enemy −${people(estimate.totalEnemyLosses)} · war ETA ${warTimeRange(estimate.estimatedWeeksMin, estimate.estimatedWeeksMax)} (${estimate.confidence} confidence).</small></div>` : '';
    const peaceWait = Math.max(0, PEACE_REQUEST_MIN_WAR_AGE_TICKS - warAge);
    const peaceButton = ceasefire.allowed
      ? `REQUEST PEACE · ${cash(annual(ceasefire.weeklyCost))}/YR`
      : peaceWait > 0 ? `PEACE IN ${peaceWait}W`
      : /used|already|pending/i.test(ceasefire.reason ?? '') ? 'REQUEST ALREADY USED'
      : 'PEACE UNAVAILABLE';
    return `<article style="--enemy:${enemy.cssColor}"><div><i class="country-flag">${countryFlagHtml(enemy.id, enemy.sigil)}</i><div><strong>${escapeHtml(enemy.name)}</strong><small>Week ${warAge} · ${war.battles} battles · ${operations.length} own / ${hostileFrontCount} hostile fronts</small></div><b class="${score < 0 ? 'danger-text' : ''}">${signed(score)}</b></div><span>${mobilizationWeeks > 0 ? `Mobilising at the border · first assault in ${mobilizationWeeks}w` : 'Campaign live'} · war cost ${cash(annual(finance.warOperations / Math.max(1, this.humanWars().length)))}/year</span>${pulseReport}<div class="war-list__operation"><b>${mobilizationWeeks > 0 ? 'BORDER MOBILISATION' : frontLabel}</b><strong>${mobilizationWeeks > 0 ? 'APEX is concentrating forces before contact' : targetDetail}</strong><small>${frontDetail} · national ${people(ownArmy.deployed)} · enemy ${people(enemyArmy.deployed)}${operations.length > 0 ? ` · avg momentum ${signed(averageMomentum)}` : ''}</small></div><div class="war-card-actions">${terms.allowed ? `<button class="secondary-button" data-action="peace-settlement" data-player="${enemy.id}" data-settlement="${suggested}">Offer ${suggested === 'control' ? 'land' : 'reparations'}</button>` : ''}<button class="ghost-button" data-action="request-ceasefire" data-war="${war.id}" ${ceasefire.allowed ? '' : 'disabled'} title="${escapeHtml(ceasefire.reason ?? 'Only one peace request is allowed per war.')}">${escapeHtml(peaceButton)}</button></div></article>`;
  }

  private renderPeaceOfferCard(offer: PeaceOfferV2): string {
    const from = this.engine.player(offer.fromId)!;
    const responseWeeks = Math.max(0, offer.expiresTick - this.engine.state.tick);
    const detail = offer.settlement === 'ceasefire'
      ? `${cash(annual(offer.weeklyCost ?? 0))}/year rate · ${cash((offer.weeklyCost ?? 0) * (offer.paymentWeeks ?? 52))} total · 104w war lock`
      : offer.settlement === 'control'
      ? WORLD_CONTENT_V2.territories[offer.territoryId ?? '' as TerritoryId]?.name ?? 'border territory'
      : `${cash(offer.cashAmount ?? 0)} reparations`;
    return `<article style="--enemy:${from.cssColor}"><div><i class="country-flag">${countryFlagHtml(from.id, from.sigil)}</i><div><strong>${escapeHtml(from.name)} offers peace</strong><small>${escapeHtml(detail)} · ${responseWeeks}w to decide</small>${offer.settlement === 'ceasefire' ? '<small>Accepting withdraws all unfinished occupation; conquered land stays yours.</small>' : ''}</div></div><div class="territory-actions" style="position:static;margin:8px 0 0;padding:0;background:none;display:grid;grid-template-columns:1fr 1fr;gap:6px"><button class="ghost-button" data-action="respond-offer" data-offer="${offer.id}" data-accept="false">Continue war</button><button class="primary-button" data-action="respond-offer" data-offer="${offer.id}" data-accept="true">Accept treaty</button></div></article>`;
  }

  private renderTerritoryPanel(territoryId: TerritoryId, territory: TerritoryStateV2): string {
    const definition = WORLD_CONTENT_V2.territories[territoryId]!;
    const owner = this.engine.player(territory.owner)!;
    const humanId = this.engine.state.humanPlayerId;
    const empireTerritories = this.engine.territoriesOf(owner.id);
    const economy = this.engine.nationalEconomy(owner.id);
    const finance = this.engine.weeklyFinanceBreakdown(owner.id);
    const demographics = this.engine.populationDynamics(owner.id);
    const army = this.engine.armyStrength(owner.id);
    const nationalArmy = nationalArmyState(this.engine, owner.id, army);
    const manpowerRatio = army.capacity > 0 ? army.deployed / army.capacity : 0;
    const attack = this.engine.effectiveAttack(owner.id, nationalArmy);
    const defense = this.engine.effectiveDefense(owner.id, nationalArmy);
    const power = this.engine.currentPower(owner.id);
    const activeWar = owner.id !== humanId ? this.engine.activeWarBetween(humanId, owner.id) : undefined;
    const declaration = owner.id !== humanId ? this.engine.warDeclarationStatus(humanId, owner.id) : undefined;
    const foodSupplyRatio = finance.foodProduced / Math.max(0.01, finance.foodDemand);
    const access = declaration?.access ?? 'none';
    const controller = territory.control ? this.engine.player(territory.control.controller) : undefined;
    const integrationGain = territoryIntegrationGainPerWeekV2(WORLD_CONTENT_V2, territoryId);
    const integrationWeeks = territory.integration < 0.999999 && integrationGain > 0
      ? Math.ceil((1 - territory.integration) / integrationGain) : 0;
    const integrationYears = integrationWeeks / 52;
    const integrationPanel = integrationWeeks > 0
      ? `<div class="simple-selected-land"><b>INTEGRATION · ${format(territory.integration * 100, 1)}%</b><span>${format(integrationYears, 1)} years remaining · ${cash(territory.economy * territory.integration)} of ${cash(territory.economy)} output · ${population(territory.population * territory.integration)} of ${population(territory.population)} capacity unlocked</span></div>`
      : '';
    return `
      <aside class="world-panel command-drawer glass-panel territory-inspector" data-scroll-key="territory:${territoryId}">
        <button class="panel-close" data-action="clear-territory">×</button>
        <div class="panel-kicker">EMPIRE TOTAL · ${empireTerritories.length} TERRITOR${empireTerritories.length === 1 ? 'Y' : 'IES'}</div>
        <div class="territory-heading"><div><h2>${escapeHtml(owner.name)}</h2><span style="color:${owner.cssColor}">Selected: ${escapeHtml(definition.name)} · ${escapeHtml(definition.terrain)}</span></div><i class="country-flag" style="--owner:${owner.cssColor}">${countryFlagHtml(owner.id, owner.sigil)}</i></div>
        ${controller && territory.control ? `<div class="foreign-control-alert" style="--controller:${controller.cssColor}"><strong>${format(territory.control.share * 100)}% UNDER ${escapeHtml(controller.shortName).toUpperCase()} CONTROL</strong><i><b style="width:${territory.control.share * 100}%"></b></i></div>` : ''}
        <div class="territory-kpis simple-country-kpis"><div><span>PEOPLE</span><strong>${population(economy.population)}</strong><small class="${demographics.weeklyNet >= 0 ? 'is-positive' : 'is-negative'}">${signedPeople(annual(demographics.weeklyNet))} / year</small></div><div><span>ECONOMY</span><strong>${cash(economy.controlledOutput)}</strong><small class="${finance.annualEconomyGrowthRate >= 0 ? 'is-positive' : 'is-negative'}">${signed(finance.annualEconomyGrowthRate * 100, 2)}% / year</small></div><div><span>CASH</span><strong>${cash(owner.treasury)}</strong><small class="${finance.net >= 0 ? 'is-positive' : 'is-negative'}">${signedCash(annual(finance.net))} / year</small></div><div><span>POWER</span><strong>${compactNumber(power)}</strong><small>${empireTerritories.length} territor${empireTerritories.length === 1 ? 'y' : 'ies'}</small></div></div>
        <div class="simple-selected-land"><b>FOOD · ${people(owner.foodStock)} / ${people(finance.foodStorageCapacity)}</b><span class="${finance.foodStockChange >= 0 ? 'is-positive' : 'is-negative'}">${format(foodSupplyRatio * 100, 1)}% incoming · ${signedPeople(annual(finance.foodStockChange))} stored / year</span></div>
        <div class="simple-selected-land"><b>AUTO TAX · ${format(economy.dynamicTaxRate * 100, 1)}%</b><span>${cash(annual(economy.weeklyRevenue))} income · ${cash(annual(finance.expenses))} costs / year</span></div>
        <div class="simple-country-force"><div><span>ARMY · ${armyCondition(nationalArmy)}</span><strong>${format(manpowerRatio * 100)}%</strong></div><i><b style="width:${manpowerRatio * 100}%;background:${manpowerRatio < 0.3 ? '#ff655f' : owner.cssColor}"></b></i><small>${people(army.deployed)} soldiers · ${people(army.veterans.manpower)} veterans · ATK ${format(attack, 2)} · DEF ${format(defense, 2)}</small></div>
        <div class="simple-selected-land"><b>${escapeHtml(definition.name)}</b><span>${people(territory.army.manpower)} local army · ${format(territory.condition * 100)}% condition</span></div>
        ${integrationPanel}
        ${owner.id !== humanId ? `${declaration?.warning ? `<div class="war-rule-note is-warning"><b>WEAK-ARMY WARNING</b><span>${escapeHtml(declaration.warning)}</span></div>` : ''}<div class="territory-actions">${activeWar ? `<button class="danger-button" disabled>WAR ALREADY LIVE</button>` : `<button class="danger-button" data-action="quick-war" data-player="${owner.id}" ${declaration?.allowed ? '' : 'disabled'}>${declaration?.allowed ? `ATTACK ONE LAND · ${warAccessLabel(access)}` : escapeHtml((declaration?.reason ?? 'WAR NOT LEGAL').toUpperCase())}</button>`}</div>` : ''}
      </aside>
    `;
  }

  private winChance(attackerId: string, defenderId: string): number {
    return this.engine.warForecast(attackerId, defenderId).winChance;
  }

  private renderWarTracker(wars: WarStateV2[]): string {
    const humanId = this.engine.state.humanPlayerId;
    const resistance = this.engine.globalResistance();
    const finance = this.engine.weeklyFinanceBreakdown(humanId);
    const activeFronts = wars.reduce((sum, war) => sum + allWarOperations(war).length, 0);
    const status = `${resistance.level ? `R${resistance.level}` : `${wars.length} WAR${wars.length === 1 ? '' : 'S'} · ${activeFronts} FRONT${activeFronts === 1 ? '' : 'S'}`} · −${format(finance.warEconomicPenalty * 100, 1)}% OUTPUT`;
    return `<aside class="war-tracker glass-panel"><div class="war-tracker__title"><span><i></i> SUPER-AI WAR COMMAND</span><b>${status}</b></div><div class="war-tracker__wars">${wars.map((war) => {
      const enemyId = war.attackerId === humanId ? war.defenderId : war.attackerId;
      const enemy = this.engine.player(enemyId)!;
      const own = this.totalCombatStrength(humanId);
      const hostile = this.totalCombatStrength(enemyId);
      const operations = warOperationsFor(war, humanId);
      const operation = operations[0];
      const warFrontCount = allWarOperations(war).length;
      const estimate = this.engine.liveWarEstimate(war.id, humanId);
      const focusId = operation?.targetId ?? estimate?.targetId ?? enemy.capitalId;
      const ownRatio = own.capacity ? clamp(own.deployed / own.capacity * 100, 0, 100) : 0;
      const hostileRatio = hostile.capacity ? clamp(hostile.deployed / hostile.capacity * 100, 0, 100) : 0;
      const pulse = this.latestBattle?.warId === war.id ? this.latestBattle : undefined;
      const humanAttacked = pulse?.attackerId === humanId;
      const shownOwnLoss = pulse
        ? humanAttacked ? pulse.attackerLosses : pulse.defenderLosses
        : estimate?.projectedOwnLosses ?? 0;
      const shownEnemyLoss = pulse
        ? humanAttacked ? pulse.defenderLosses : pulse.attackerLosses
        : estimate?.projectedEnemyLosses ?? 0;
      const combatIntel = estimate ? `<div class="war-tracker__intel"><div><span>${pulse ? 'LAST BATTLE DAMAGE' : 'NEXT BATTLE EST.'}</span><strong><em>YOU −${people(shownOwnLoss)}</em><b>ENEMY −${people(shownEnemyLoss)}</b></strong><small>TOTAL LOST · ${people(estimate.totalOwnLosses)} vs ${people(estimate.totalEnemyLosses)}</small></div><div class="war-tracker__eta"><span>ESTIMATED WAR END</span><strong>${warTimeRange(estimate.estimatedWeeksMin, estimate.estimatedWeeksMax)}</strong><small>${warOutlookLabel(estimate)} · ${estimate.confidence.toUpperCase()} CONF.</small></div></div>` : '';
      return `<article class="war-tracker__war"><button class="war-tracker__focus" data-action="focus-war" data-territory="${focusId}"><div class="war-tracker__enemy" style="--enemy:${enemy.cssColor}"><i class="country-flag">${countryFlagHtml(enemy.id, enemy.sigil)}</i><div><span>${pulse ? `${warFrontCount} FRONT${warFrontCount === 1 ? '' : 'S'} ENGAGED` : warFrontCount > 0 ? `${warFrontCount} LIVE FRONT${warFrontCount === 1 ? '' : 'S'}` : 'LIVE WAR'}</span><strong>${escapeHtml(enemy.shortName)}</strong><small>Week ${this.engine.state.tick - war.startedTick} · ${war.battles} battles</small></div><b>${signed(war.attackerId === humanId ? war.warScore : -war.warScore)}</b></div><div class="war-tracker__health"><div><span>OUR ARMY READY · ${format(ownRatio)}%</span><strong>${people(own.deployed)}/${people(own.capacity)}</strong><i role="progressbar" aria-label="Our army readiness" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${format(ownRatio)}"><b style="width:${ownRatio}%;background:linear-gradient(90deg,#38a883,#69e3a2)"></b></i></div><em>LIVE</em><div><span>ENEMY READY · ${format(hostileRatio)}%</span><strong>${people(hostile.deployed)}/${people(hostile.capacity)}</strong><i role="progressbar" aria-label="Enemy army readiness" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${format(hostileRatio)}"><b style="width:${hostileRatio}%;background:${enemy.cssColor}"></b></i></div></div>${combatIntel}</button></article>`;
    }).join('')}</div></aside>`;
  }

  private renderRankingPanel(): string {
    const humanId = this.engine.state.humanPlayerId;
    const ranking = this.ranking();
    const rank = ranking.findIndex((entry) => entry.player.id === humanId) + 1;
    return `<aside class="world-panel command-drawer glass-panel ranking-panel" data-scroll-key="ranking"><button class="panel-close" data-action="close-panel">×</button><div class="panel-kicker">MILITARY POWER · LIVE</div><h2>Your country is #${rank}</h2><p>Combat Power leads. Economy and territory add only limited resilience.</p><div class="power-ranking">${ranking.map((entry, index) => `<div class="${entry.player.id === humanId ? 'is-human' : ''} ${index === 0 ? 'is-leader' : ''}" style="--power:${entry.player.cssColor}"><span>#${index + 1}</span><i class="country-flag">${countryFlagHtml(entry.player.id, entry.player.sigil)}</i><div><strong>${escapeHtml(entry.player.name)}</strong><small>power ${compactNumber(this.engine.currentPower(entry.player.id))} · strength ${people(this.totalCombatStrength(entry.player.id).deployed)}</small></div><b>${compactNumber(entry.score)}</b></div>`).join('')}</div></aside>`;
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
      : offer.settlement === 'control'
      ? `TERRITORY · ${escapeHtml(WORLD_CONTENT_V2.territories[offer.territoryId ?? '' as TerritoryId]?.name ?? 'BORDER REGION')}`
      : `REPARATIONS · ${cash(offer.cashAmount ?? 0)}`;
    return `<div class="decision-banner glass-panel" style="--sender:${from.cssColor}"><i class="country-flag">${countryFlagHtml(from.id, from.sigil)}</i><div><span>LIVE PEACE OFFER · ${terms} · ${responseWeeks}W LEFT</span><strong>${escapeHtml(from.name)} offers payment; unfinished occupation is abandoned.</strong></div><button class="ghost-button" data-action="respond-offer" data-offer="${offer.id}" data-accept="false">Continue war</button><button class="primary-button" data-action="respond-offer" data-offer="${offer.id}" data-accept="true">Accept treaty</button></div>`;
  }

  private initialTerritoryCount(playerId: PlayerId): number {
    return WORLD_CONTENT_V2.territoryIds.filter((territoryId) => WORLD_CONTENT_V2.territories[territoryId]?.initialOwnerId === playerId).length;
  }

  private shouldPromptEmpireName(): boolean {
    if (this.introOpen || this.empireNameSubmitted || this.engine.state.gameOver) return false;
    const human = this.engine.player(this.engine.state.humanPlayerId);
    return Boolean(human && !human.empireName
      && this.engine.territoriesOf(human.id).length > this.initialTerritoryCount(human.id));
  }

  private renderEmpireNamePrompt(): string {
    const human = this.engine.player(this.engine.state.humanPlayerId)!;
    if (!this.empireNameDraft.trim()) this.empireNameDraft = human.name;
    return `<div class="modal-backdrop modal-backdrop--soft"><section class="modal-card empire-name-modal" style="--country:${human.cssColor}"><i class="country-flag">${countryFlagHtml(human.id, human.sigil, true)}</i><div class="panel-kicker">FIRST CONQUEST COMPLETE</div><h2>Name your empire</h2><p>Your country has crossed its original borders. This name now represents every absorbed territory.</p><label><span>EMPIRE NAME</span><input id="empire-name" maxlength="36" value="${escapeHtml(this.empireNameDraft)}" placeholder="e.g. The Benelux Dominion" autocomplete="off"></label><small>3–36 characters · you can keep the current national identity in the name</small><button class="primary-button" data-action="name-empire">ESTABLISH EMPIRE</button></section></div>`;
  }

  private introSortValue(playerId: PlayerId): number {
    if (this.introSort === 'power') return this.engine.currentPower(playerId);
    if (this.introSort === 'manpower') return this.engine.totalManpower(playerId).deployed;
    if (this.introSort === 'growth') {
      const capitalId = this.engine.player(playerId)?.capitalId;
      return capitalId ? WORLD_CONTENT_V2.territories[capitalId]?.baseline.populationGrowthRate ?? 0 : 0;
    }
    const economy = this.engine.nationalEconomy(playerId);
    if (this.introSort === 'economy') return economy.output;
    if (this.introSort === 'population') return economy.population;
    const army = this.engine.armyStrength(playerId);
    const state = nationalArmyState(this.engine, playerId, army);
    return this.introSort === 'attack'
      ? this.engine.effectiveAttack(playerId, state)
      : this.engine.effectiveDefense(playerId, state);
  }

  private renderIntro(): string {
    const allNations = [...WORLD_CONTENT_V2.nationIds]
      .map((id) => WORLD_CONTENT_V2.nations[id])
      .filter((nation): nation is NonNullable<typeof nation> => Boolean(nation));
    const baselineOrder = [...allNations].sort((left, right) => (
      this.engine.conventionalPower(right.id) - this.engine.conventionalPower(left.id)
        || left.id.localeCompare(right.id)
    ));
    const initialMilitaryRanking = new Map(baselineOrder.map((nation, index) => [nation.id, index + 1]));
    const metrics = new Map(allNations.map((nation) => {
      const nationArmy = this.engine.armyStrength(nation.id);
      const armyState = nationalArmyState(this.engine, nation.id, nationArmy);
      const economy = this.engine.nationalEconomy(nation.id);
      const populationGrowth = WORLD_CONTENT_V2.territories[this.engine.player(nation.id)!.capitalId]
        ?.baseline.populationGrowthRate ?? 0;
      return [nation.id, {
        power: this.engine.conventionalPower(nation.id),
        attack: this.engine.effectiveAttack(nation.id, armyState),
        defense: this.engine.effectiveDefense(nation.id, armyState),
        manpower: nationArmy.deployed,
        economy: economy.output,
        tax: economy.dynamicTaxRate * 100,
        population: economy.population,
        growth: populationGrowth,
      }] as const;
    }));
    const nations = allNations.sort((left, right) => {
      if (this.introSort === 'power') {
        return (initialMilitaryRanking.get(left.id) ?? 999) - (initialMilitaryRanking.get(right.id) ?? 999)
          || left.name.localeCompare(right.name, 'en');
      }
      return (metrics.get(right.id)?.[this.introSort] ?? 0) - (metrics.get(left.id)?.[this.introSort] ?? 0)
        || left.name.localeCompare(right.name, 'en');
    });
    const preview = WORLD_CONTENT_V2.nations[this.introPreviewCountryId] ?? nations[0]!;
    const previewState = this.engine.player(preview.id)!;
    const army = this.engine.armyStrength(preview.id);
    const finance = this.engine.weeklyFinanceBreakdown(preview.id);
    const economy = this.engine.nationalEconomy(preview.id);
    const populationDynamics = this.engine.populationDynamics(preview.id);
    const previewArmy = nationalArmyState(this.engine, preview.id, army);
    const attack = this.engine.effectiveAttack(preview.id, previewArmy);
    const defense = this.engine.effectiveDefense(preview.id, previewArmy);
    const rank = initialMilitaryRanking.get(preview.id) ?? nations.findIndex((nation) => nation.id === preview.id) + 1;
    const openingElite = underdogVeteranTermsV2(rank, nations.length);
    const query = this.introSearchQuery.trim().toLocaleLowerCase('en');
    const continents = [...new Set(nations.map((nation) => nation.continent))].sort((left, right) => left.localeCompare(right, 'en'));
    const continentMatches = (continent: string) => this.introContinent === 'ALL' || continent === this.introContinent;
    const visibleCount = nations.filter((nation) => continentMatches(nation.continent)
      && (!query || `${nation.name} ${nation.sigil}`.toLowerCase().includes(query))).length;
    const sortLabels: Record<IntroSort, string> = {
      power: 'POWER', attack: 'ATK', defense: 'DEF', manpower: 'ARMY', economy: 'ECONOMY', tax: 'AUTO TAX', population: 'PEOPLE', growth: 'GROWTH',
    };
    const displayMetric = (nationId: PlayerId): string => {
      const value = metrics.get(nationId)?.[this.introSort] ?? 0;
      if (this.introSort === 'manpower') return people(value);
      if (this.introSort === 'economy') return cash(value);
      if (this.introSort === 'tax') return `${format(value, 1)}%`;
      if (this.introSort === 'population') return population(value);
      if (this.introSort === 'growth') return `${value >= 0 ? '+' : ''}${format(value, 2)}%`;
      return format(value, this.introSort === 'attack' || this.introSort === 'defense' ? 2 : 0);
    };
    return `<div class="modal-backdrop"><section class="country-select modal-card"><div class="country-select__head"><div><div class="panel-kicker">NEW CAMPAIGN · 2026</div><h1>Choose your nation</h1><p>APEX runs the country. You choose who to attack.</p></div><div class="country-select__facts"><span><b>${nations.length}</b> countries</span><span><b>APEX</b> Super AI</span><span><b>Elite</b> rank-scaled opening</span><span><b>Dynamic</b> world</span></div></div><div class="country-select__tools"><label class="country-search"><span>⌕</span><input id="country-search" type="search" value="${escapeHtml(this.introSearchQuery)}" placeholder="Search countries…" autocomplete="off"></label><label class="country-sort"><span>SORT</span><select id="country-sort" aria-label="Sort countries"><option value="power" ${this.introSort === 'power' ? 'selected' : ''}>Military rank</option><option value="attack" ${this.introSort === 'attack' ? 'selected' : ''}>ATK</option><option value="defense" ${this.introSort === 'defense' ? 'selected' : ''}>DEF</option><option value="manpower" ${this.introSort === 'manpower' ? 'selected' : ''}>Manpower</option><option value="economy" ${this.introSort === 'economy' ? 'selected' : ''}>Economy</option><option value="tax" ${this.introSort === 'tax' ? 'selected' : ''}>Automatic tax rate</option><option value="population" ${this.introSort === 'population' ? 'selected' : ''}>Population</option><option value="growth" ${this.introSort === 'growth' ? 'selected' : ''}>Population growth</option></select></label><div class="country-filters" role="group" aria-label="Filter countries by continent"><button class="${this.introContinent === 'ALL' ? 'is-active' : ''}" data-action="continent-filter" data-continent="ALL">ALL</button>${continents.map((continent) => `<button class="${this.introContinent === continent ? 'is-active' : ''}" data-action="continent-filter" data-continent="${escapeHtml(continent)}">${escapeHtml(continent.toUpperCase())}</button>`).join('')}<span>${visibleCount} shown</span></div></div><div class="country-select__body"><div class="country-grid">${nations.map((nation) => {
      const searchable = `${nation.name} ${nation.sigil}`.toLowerCase();
      const hidden = !continentMatches(nation.continent) || (query.length > 0 && !searchable.includes(query));
      return `<button class="${nation.id === preview.id ? 'is-selected' : ''}" data-action="preview-country" data-country="${nation.id}" data-continent="${escapeHtml(nation.continent)}" data-country-name="${escapeHtml(nation.name.toLocaleLowerCase('en'))}" data-name="${escapeHtml(searchable)}" aria-pressed="${nation.id === preview.id}" ${hidden ? 'hidden' : ''} style="--country:${nation.cssColor}"><i class="country-flag">${countryFlagHtml(nation.id, nation.sigil)}</i><div><strong>${escapeHtml(nation.name)}</strong><small>${escapeHtml(nation.subregion)} · ${population(nation.real.population)} people</small><em>${cash(nation.real.gdp)} GDP</em></div><span><b>${displayMetric(nation.id)}</b><em>${sortLabels[this.introSort]}</em></span></button>`;
    }).join('')}</div><aside class="country-preview" style="--country:${preview.cssColor}"><div class="country-preview__identity"><i class="country-flag country-flag--large">${countryFlagHtml(preview.id, preview.sigil, true)}</i><div><span>REAL-WORLD MILITARY BASELINE #${rank}</span><h2 title="${escapeHtml(preview.name)}">${escapeHtml(previewState.shortName)}</h2><p>${escapeHtml(preview.subregion)}</p></div><b>${compactNumber(this.engine.conventionalPower(preview.id))}<small>BASE POWER</small></b></div><div class="country-preview__stats"><div><span>ATK / SOLDIER</span><strong>${format(attack, 2)}</strong></div><div><span>DEF / SOLDIER</span><strong>${format(defense, 2)}</strong></div><div><span>DEPLOYED MANPOWER</span><strong>${people(army.deployed)}</strong></div><div><span>MAX MANPOWER</span><strong>${people(army.capacityTarget)}</strong></div><div><span>PLAYER ELITE START</span><strong>${openingElite.veteranShare > 0 ? `${format(openingElite.veteranShare * 100)}% · AVERAGE RANK ${veteranRankV2(1, openingElite.veteranExperience)} · XP ${compactNumber(openingElite.veteranExperience)}` : 'NONE · TOP 20'}</strong></div><div><span>POPULATION</span><strong>${population(economy.population)}</strong></div><div><span>ECONOMY</span><strong>${cash(economy.output)}</strong></div><div title="Automatic normalized percentage calculated from current wealth per person"><span>AUTO TAX RATE</span><strong>${format(economy.dynamicTaxRate * 100, 1)}%</strong></div><div><span>NET POP. GROWTH</span><strong class="${populationDynamics.annualNetRate >= 0 ? 'is-positive' : 'danger-text'}">${populationDynamics.annualNetRate >= 0 ? '+' : ''}${format(populationDynamics.annualNetRate * 100, 2)}%</strong></div><div><span>FOOD COVERAGE</span><strong class="${finance.foodCoverage >= 0.95 ? 'is-positive' : 'danger-text'}">${format(finance.foodCoverage * 100)}%</strong></div></div><button class="primary-button country-preview__start" data-action="choose-country" data-country="${preview.id}">COMMAND ${escapeHtml(preview.name.toUpperCase())}</button></aside></div><footer><span>Dynamic economy: current population × wealth/person · Natural Earth · SIPRI 2025</span><strong>Sorted by ${escapeHtml(sortLabels[this.introSort].toLowerCase())}</strong></footer></section></div>`;
  }

  private renderActivationBriefing(): string {
    const human = this.engine.player(this.engine.state.humanPlayerId)!;
    const economy = this.engine.nationalEconomy(human.id);
    const army = this.engine.armyStrength(human.id);
    const finance = this.engine.weeklyFinanceBreakdown(human.id);
    const aiPlan = this.engine.nationalAiPlan(human.id);
    const veterans = this.engine.totalVeterans(human.id);
    const deterrence = this.engine.nuclearPower(human.id);
    const ranking = this.engine.globalRanking();
    const militaryRank = ranking.findIndex((entry) => entry.player.id === human.id) + 1;
    const livingIds = ranking.map((entry) => entry.player.id);
    const baselineRank = this.activationBaselineRank ?? [...livingIds].sort((left, right) => (
      (WORLD_CONTENT_V2.nations[right]?.real.powerIndex ?? 0)
        - (WORLD_CONTENT_V2.nations[left]?.real.powerIndex ?? 0)
        || left.localeCompare(right)
    )).indexOf(human.id) + 1;
    const economyRank = [...livingIds].sort((left, right) => (
      this.engine.nationalEconomy(right).controlledOutput - this.engine.nationalEconomy(left).controlledOutput
    )).indexOf(human.id) + 1;
    const manpowerRank = [...livingIds].sort((left, right) => (
      this.engine.totalManpower(right).deployed - this.engine.totalManpower(left).deployed
    )).indexOf(human.id) + 1;
    const cashRunway = human.treasury > 0 ? human.treasury / Math.max(0.01, economy.weeklyRevenue) : 0;
    const foodWeeks = human.foodStock / Math.max(0.01, finance.foodDemand);
    const viableTargets = this.connectedOpponentIds(human.id).map((targetId) => ({
      target: this.engine.player(targetId)!,
      chance: this.winChance(human.id, targetId),
      status: this.engine.warDeclarationStatus(human.id, targetId),
    })).filter((candidate) => candidate.status.allowed)
      .sort((left, right) => right.chance - left.chance || left.target.id.localeCompare(right.target.id));
    const bestTarget = viableTargets[0];
    const strengths = [
      `Starting army #${baselineRank}; live military power is #${militaryRank}`,
      economyRank <= 30 ? `Economic depth ranked #${economyRank}` : `Compact economy ranked #${economyRank}`,
      deterrence.level ? `Nuclear Power Tier ${deterrence.level}: +${format(deterrence.attackBonus * 100)}% ATK`
        : veterans.manpower > 0 ? `Elite core: ${people(veterans.manpower)} veterans · average rank ${veterans.rank} · XP ${compactNumber(veterans.experience)}` : 'Veterans grow only after soldiers survive a full war',
    ];
    const risks = [
      army.fillRatio < 0.70 ? `Army only ${format(army.fillRatio * 100)}% filled` : `Manpower reserve ranked #${manpowerRank}`,
      finance.foodCoverage < 0.95 ? `Food covers only ${format(finance.foodCoverage * 100)}% of demand` : `Food reserve: ${format(foodWeeks, 1)} weeks`,
      human.treasury < 0 ? `Debt: ${cash(human.treasury)}` : `Cash runway: ${format(cashRunway, 1)} revenue weeks`,
    ];
    const opening = army.fillRatio < 0.72
      ? 'Rebuild manpower first; a premature war risks losing the opening campaign.'
      : finance.foodCoverage < 0.92
        ? 'Stabilize food access before expansion; war would deepen the shortage.'
        : bestTarget
          ? `Best opening target: ${bestTarget.target.shortName} · ${bestTarget.chance}% opening-front outlook.`
          : 'No safe legal target yet; APEX will build cash, research and army strength.';
    const targetDetail = bestTarget
      ? `${bestTarget.status.access.toUpperCase()} route · ${cash(bestTarget.status.mobilizationCost)} mobilisation`
      : aiPlan.explanation;
    return `<div class="modal-backdrop modal-backdrop--soft"><section class="modal-card ai-activation" style="--country:${human.cssColor}"><div class="ai-activation__head"><i class="country-flag">${countryFlagHtml(human.id, human.sigil, true)}</i><div><div class="panel-kicker">APEX COUNTRY ANALYSIS</div><h2>${escapeHtml(human.name)} is ready.</h2><p>I manage reserves, food, research and every front. You decide when—and whom—we attack.</p></div></div><div class="ai-activation__scan"><span>LIVE MILITARY <b>#${militaryRank}</b></span><span>REAL BASELINE <b>#${baselineRank}</b></span><span>COMBAT POWER <b>${compactNumber(this.engine.currentPower(human.id))}</b></span><span>ARMY READY <b>${format(army.fillRatio * 100)}%</b></span><span>FOOD <b>${format(finance.foodCoverage * 100)}%</b></span><span>APEX MODE <b>${escapeHtml(finance.aiMode.toUpperCase())}</b></span></div><div class="ai-activation__assessment"><article><span>OUR ADVANTAGES</span>${strengths.map((item) => `<p>+ ${escapeHtml(item)}</p>`).join('')}</article><article><span>IMMEDIATE RISKS</span>${risks.map((item) => `<p>− ${escapeHtml(item)}</p>`).join('')}</article></div><div class="ai-activation__plan"><span>OPENING PLAN · ${escapeHtml(aiPlan.mode.toUpperCase())}</span><strong>${escapeHtml(opening)}</strong><small>${escapeHtml(targetDetail)}</small></div><button class="primary-button" data-action="dismiss-activation">ENTER COMMAND</button></section></div>`;
  }

  private renderHelp(): string {
    return `<div class="modal-backdrop"><section class="modal-card world-help"><button class="modal-close" data-action="help">×</button><div class="panel-kicker">FRONTIER COMMAND · SUPER AI</div><h2>You choose conquest. APEX runs the nation.</h2><div class="help-grid world-help-grid"><article><span>⚔</span><h3>War</h3><p>Choose targets, compare the forecast and decide when to stop.</p></article><article><span>AI</span><h3>Nation</h3><p>APEX automatically manages cash, food, research and recruitment.</p></article><article><span>◎</span><h3>Veterans</h3><p>Low-ranked player starts receive a rank-scaled elite core, up to 80% at ${format(UNDERDOG_VETERAN_MAX_EXPERIENCE, 0)} XP. Casualties can destroy it; later growth comes only from surviving a completed war.</p></article></div><p class="help-tip"><b>World reaction:</b> fast conquest raises suspicion and can trigger defensive coalitions.</p></section></div>`;
  }

  private renderInbox(): string {
    const events = this.engine.state.events.filter(isMajorWorldEvent).slice().reverse();
    return `<div class="modal-backdrop modal-backdrop--soft"><section class="modal-card inbox-modal"><button class="modal-close" data-action="inbox">×</button><div class="panel-kicker">SITUATION INBOX</div><h2>World events</h2><div class="inbox-filters"><span>${events.filter((event) => event.unread).length} unread</span><button data-action="mark-read">Mark all read</button></div><div class="inbox-list">${events.map((event) => `<button class="${event.unread ? 'is-unread' : ''}" data-action="focus-event" data-territory="${event.territoryId ?? ''}"><b class="event-dot event-dot--${event.severity}"></b><div><span>WEEK ${event.tick} · ${event.kind.toUpperCase()}</span><strong>${escapeHtml(event.message)}</strong></div></button>`).join('')}</div></section></div>`;
  }

  private renderWarConfirmation(targetId: PlayerId): string {
    const human = this.engine.player(this.engine.state.humanPlayerId)!;
    const target = this.engine.player(targetId)!;
    const army = this.engine.armyStrength(human.id);
    const forecast = this.engine.warForecast(human.id, target.id);
    const chance = forecast.winChance;
    const declaration = this.engine.warDeclarationStatus(human.id, target.id);
    const access = forecast.access === 'none' ? declaration.access : forecast.access;
    const gains = this.engine.conquestForecast(human.id, target.id);
    const targetFinance = this.engine.weeklyFinanceBreakdown(target.id);
    const targetEconomy = this.engine.nationalEconomy(target.id);
    const weakArmy = army.fillRatio < 0.55;
    const warning = declaration.warning ?? (weakArmy ? 'Your army has low deployed manpower for its population-based capacity.' : undefined);
    const accessNote = access === 'naval' ? 'Naval landing · expedition penalty' : 'Land campaign · best logistics';
    const sourceName = forecast.sourceId ? WORLD_CONTENT_V2.territories[forecast.sourceId]?.name : undefined;
    const targetName = forecast.targetId ? WORLD_CONTENT_V2.territories[forecast.targetId]?.name : undefined;
    const outlook = forecast.outlook.toUpperCase();
    const attackerComposition = `${people(forecast.attackerRegulars)} regulars + ${people(forecast.attackerVeterans)} veterans (average rank ${veteranRankV2(forecast.attackerVeterans, forecast.attackerVeteranExperience)} · XP ${compactNumber(forecast.attackerVeteranExperience)})`;
    const defenderComposition = `${people(forecast.defenderRegulars)} regulars + ${people(forecast.defenderVeterans)} veterans (average rank ${veteranRankV2(forecast.defenderVeterans, forecast.defenderVeteranExperience)} · XP ${compactNumber(forecast.defenderVeteranExperience)})`;
    const concurrentCampaigns = this.humanWars().length + 1;
    const supportText = forecast.supportingForces > 0
      ? ` · ${forecast.supportingForces} supporting front${forecast.supportingForces === 1 ? '' : 's'}` : '';
    return `<div class="modal-backdrop"><section class="modal-card war-confirm simple-war-confirm" style="--target:${target.cssColor}"><div class="war-confirm__sigil country-flag">${countryFlagHtml(target.id, target.sigil, true)}</div><div class="panel-kicker">APEX OPENING-FRONT FORECAST · ${outlook}</div><h2>Attack ${escapeHtml(target.name)}?</h2><p>${escapeHtml(sourceName ?? human.shortName)} → ${escapeHtml(targetName ?? target.shortName)} · ${accessNote}</p><div class="simple-chance"><div><span>OPENING OUTLOOK</span><strong>${chance}%</strong></div><i><b style="width:${chance}%"></b></i><small>Opening front may break in ${forecast.estimatedWeeksMin}–${forecast.estimatedWeeksMax} weeks. The full war may take longer.</small></div><div class="simple-war-decision-grid"><article><span>OUR FRONT</span><strong>${people(forecast.attackerStrength)}</strong><small>${attackerComposition} · ATK ${format(forecast.attackerAttack, 2)} · DEF ${format(forecast.attackerDefense, 2)} · SUP ${format(forecast.attackerSupply * 100)}%</small></article><article><span>ENEMY FRONT</span><strong>${people(forecast.defenderStrength)}</strong><small>${defenderComposition} · ATK ${format(forecast.defenderAttack, 2)} · DEF ${format(forecast.defenderDefense, 2)} · SUP ${format(forecast.defenderSupply * 100)}%</small></article><article><span>TARGET FOOD</span><strong>${format(targetFinance.foodCoverage * 100, 1)}% fed</strong><small>${people(target.foodStock)} / ${people(targetFinance.foodStorageCapacity)} stored · ${people(annual(targetFinance.foodDomesticProduced))} domestic/year · ${signedPeople(annual(targetFinance.foodStockChange))}/year stock</small></article><article><span>TARGET ECONOMY</span><strong>${cash(targetEconomy.controlledOutput)}</strong><small>${signed(targetFinance.annualEconomyGrowthRate * 100, 2)}% growth/year · ${population(targetEconomy.population)} people</small></article><article><span>WAR DECLARATION</span><strong>FREE</strong><small>Annual operating costs appear in the War tab</small></article><article><span>OCCUPATION OUTPUT</span><strong>${cash(gains.initialOccupationOutput)}</strong><small>10% unlocked immediately</small></article></div><div class="combat-exchange-preview"><span>PROJECTED NEXT BATTLE · 2 WEEKS</span><strong>YOU −${people(forecast.projectedAttackerLosses)} · ENEMY −${people(forecast.projectedDefenderLosses)}</strong><small>Combat-strength loss includes veteran durability.</small></div><div class="combat-modifier-line">DEFENDER ×${format(forecast.defenderPositionMultiplier, 2)} POSITION · ${escapeHtml((forecast.terrain ?? 'plains').toUpperCase())} ×${format(forecast.terrainDefenseMultiplier, 2)}${supportText} · ${concurrentCampaigns} active campaign${concurrentCampaigns === 1 ? '' : 's'}</div>${warning ? `<div class="war-rule-note is-warning"><b>RISK</b><span>${escapeHtml(warning)}</span></div>` : ''}${!declaration.allowed ? `<div class="war-rule-note is-blocked"><b>WAR CANNOT START</b><span>${escapeHtml(declaration.reason ?? 'Legal or access requirements are not met.')}</span></div>` : ''}<div class="simple-victory-gain"><b>IF WE WIN</b><span>~${gains.territoryCount} territor${gains.territoryCount === 1 ? 'y' : 'ies'} · ~${population(gains.retainedPopulation)} residents · ~${cash(gains.initialOccupationOutput)} output now</span><small>Population capacity, economy, food and army capacity start at 10%; the rest unlocks gradually over 10–20 years by country size. Enemy troops are never inherited.</small></div><div class="panel-actions"><button class="ghost-button" data-action="cancel-war">Cancel</button><button class="danger-button" data-action="declare-war" ${declaration.allowed ? '' : 'disabled'}>${declaration.allowed ? 'START WAR' : escapeHtml((declaration.reason ?? 'WAR CANNOT START').toUpperCase())}</button></div></section></div>`;
  }

  private renderCeasefireConfirmation(warId: string): string {
    const humanId = this.engine.state.humanPlayerId;
    const war = this.engine.state.wars.find((candidate) => candidate.id === warId);
    if (!war) return '';
    const opponentId = war.attackerId === humanId ? war.defenderId : war.attackerId;
    const opponent = this.engine.player(opponentId)!;
    const terms = this.engine.ceasefireTerms(warId, humanId);
    return `<div class="modal-backdrop"><section class="modal-card ceasefire-confirm" style="--target:${opponent.cssColor}"><div class="panel-kicker">REQUEST PEACE TREATY</div><h2>Offer peace to ${escapeHtml(opponent.name)}?</h2><p>They may refuse. If accepted, neither country can restart this war during payments or for the following year.</p><div class="ceasefire-summary"><div><span>DIRECT PAYMENT</span><strong>${cash(annual(terms.weeklyCost))}/year</strong><small>${cash(terms.totalCost)} total over ${terms.paymentWeeks} weeks · repeat ×${format(terms.repeatMultiplier, 2)}</small></div><div><span>WAR LOCK</span><strong>${terms.truceTicks} WEEKS</strong><small>${terms.paymentWeeks}w payments + ${terms.postPaymentTruceTicks}w peace</small></div></div><div class="war-rule-note is-warning"><b>WITHDRAWAL IS FINAL</b><span>All unfinished occupation between both countries is abandoned. Already conquered territory remains with its current owner.</span><small>Only one request is allowed per war.</small></div><div class="panel-actions"><button class="ghost-button" data-action="cancel-ceasefire">Continue war</button><button class="secondary-button" data-action="confirm-ceasefire" data-war="${warId}" ${terms.allowed ? '' : 'disabled'}>${terms.allowed ? `SEND TREATY · ${cash(annual(terms.weeklyCost))}/YR` : escapeHtml((terms.reason ?? 'UNAVAILABLE').toUpperCase())}</button></div></section></div>`;
  }

  private renderResearchSurgeConfirmation(): string {
    const human = this.engine.player(this.engine.state.humanPlayerId)!;
    const terms = this.engine.researchSurgeTerms(human.id);
    const pressure = this.engine.weeklyFinanceBreakdown(human.id).warResearchPenalty;
    return `<div class="modal-backdrop modal-backdrop--soft"><section class="modal-card research-surge-confirm" style="--country:${human.cssColor}"><div class="panel-kicker">APEX CLASSIFIED COMMAND</div><h2>Request accelerated research?</h2><p>APEX will reserve budget and execute the surge automatically when it is ready.</p><div class="research-surge-summary"><article><span>ALL ACTIVE PROGRAMS</span><strong>+${terms.progressWeeks} WEEKS</strong><small>${format(terms.progressAdded, 1)} total research progress</small></article><article><span>COOLDOWN</span><strong>52 WEEKS</strong><small>Starts after execution</small></article><article><span>APEX STATUS</span><strong>${terms.cooldownRemaining ? `${terms.cooldownRemaining}W WAIT` : 'BUDGETING'}</strong><small>National reserves stay under AI control</small></article></div>${pressure > 0 ? `<div class="war-rule-note is-warning"><b>WARTIME DISRUPTION</b><span>Current war pressure weakens research progress. Peacetime is more efficient.</span></div>` : `<div class="war-rule-note"><b>PEACETIME WINDOW</b><span>Stable laboratories convert the full surge into national research.</span></div>`}<div class="panel-actions"><button class="ghost-button" data-action="cancel-research-surge">Cancel</button><button class="secondary-button" data-action="confirm-research-surge">SEND REQUEST</button></div></section></div>`;
  }

  private renderPropagandaConfirmation(): string {
    const human = this.engine.player(this.engine.state.humanPlayerId)!;
    const terms = this.engine.propagandaTerms(human.id);
    const resistance = this.engine.globalResistance();
    const projectedThreat = Math.max(0, resistance.threat - terms.totalSuspicionReduction);
    return `<div class="modal-backdrop modal-backdrop--soft"><section class="modal-card propaganda-confirm" style="--country:${human.cssColor}"><div class="panel-kicker">APEX INFLUENCE OPERATION</div><h2>Request a global propaganda campaign?</h2><p>APEX will reserve budget and launch this gradual operation when it is ready.</p><div class="propaganda-confirm__summary"><article><span>CAMPAIGN</span><strong>${terms.durationTicks} WEEKS</strong><small>−${format(terms.weeklySuspicionReduction, 2)} suspicion each week</small></article><article><span>FULL EFFECT</span><strong>${format(resistance.threat)}% → ~${format(projectedThreat)}%</strong><small>Up to −${format(terms.totalSuspicionReduction)} total suspicion</small></article><article><span>APEX STATUS</span><strong>${terms.cooldownRemainingTicks ? `${terms.cooldownRemainingTicks}W WAIT` : 'BUDGETING'}</strong><small>National reserves stay under AI control</small></article></div><div class="war-rule-note is-warning"><b>NO INSTANT EFFECT</b><span>Expansion and new wars can still create suspicion while the campaign is running.</span></div><div class="panel-actions"><button class="ghost-button" data-action="cancel-propaganda">Cancel</button><button class="secondary-button" data-action="confirm-propaganda">SEND REQUEST</button></div></section></div>`;
  }

  private renderGameExplainer(): string {
    return `<div class="modal-backdrop campaign-intro-backdrop"><section class="modal-card campaign-intro"><div class="campaign-intro__mark">APEX</div><div class="panel-kicker">FRONTIER COMMAND · 2026</div><h1>Build an empire. Conquer the world.</h1><p class="campaign-intro__lead">Choose any nation. Your Super AI runs the country; you decide where its power goes next.</p><div class="campaign-intro__rules"><article><span>01</span><div><h2>You command the wars</h2><p>Pick targets, compare the forecast, attack—or negotiate a ceasefire.</p></div></article><article><span>02</span><div><h2>APEX runs the nation</h2><p>Cash, food, research, recruitment and every active front are optimized automatically.</p></div></article><article><span>03</span><div><h2>War has a real price</h2><p>Fighting drains manpower, money, population growth and the economy. Peace is when you rebuild.</p></div></article></div><div class="campaign-intro__loop"><b>CONQUER</b><i>→</i><b>INTEGRATE</b><i>→</i><b>ADVANCE</b><span>Conquests unlock 10% immediately and integrate over 10–20 years. Rival powers expand too, and prolonged aggression can unite the world against you.</span></div><button class="primary-button campaign-intro__start" data-action="open-nation-select">CHOOSE YOUR NATION</button></section></div>`;
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
    const veteranGain = outcome.veteransPromoted > 0
      ? `+${people(outcome.veteransPromoted)} promoted` : 'No new promotions';
    const veteranRankBefore = veteranRankV2(outcome.veteranManpowerBefore, outcome.veteranExperienceBefore);
    const veteranRankAfter = veteranRankV2(outcome.veteranManpowerAfter, outcome.veteranExperienceAfter);
    const queueNote = this.warOutcomeQueue.length > 1
      ? `${this.warOutcomeQueue.length - 1} more war report${this.warOutcomeQueue.length === 2 ? '' : 's'} waiting`
      : 'The campaign is fully recorded';
    const opponentFlag = opponent
      ? `<i class="country-flag">${countryFlagHtml(opponent.id, opponent.sigil, true)}</i>` : '';
    return `<div class="modal-backdrop war-outcome-backdrop"><section class="modal-card war-outcome-modal war-outcome-modal--${outcome.result}" style="--outcome:${opponent?.cssColor ?? '#69d7ef'}">
      <div class="war-outcome-head">${opponentFlag}<div><div class="panel-kicker">POST-WAR REPORT · WEEK ${outcome.endedTick}</div><h2>${escapeHtml(resultLabels[outcome.result])}</h2><p>${escapeHtml(opponent?.name ?? outcome.opponentId)} · ${outcome.endedTick - outcome.startedTick} weeks · ${outcome.battles} battles</p></div><b>${signed(outcome.warScore)}</b></div>
      <div class="war-outcome-reason">${escapeHtml(outcome.reason)}</div>
      <div class="war-outcome-grid">
        <article class="war-outcome-card war-outcome-card--wide"><span>LAND</span><strong>${outcome.territoriesGained.length ? `+${outcome.territoriesGained.length}` : '0'} / ${outcome.territoriesLost.length ? `−${outcome.territoriesLost.length}` : '0'} territories</strong><small>${escapeHtml(territoryDetail)}</small></article>
        <article class="war-outcome-card"><span>POPULATION</span><strong class="${outcome.gainedPopulation >= outcome.lostPopulation ? 'is-positive' : 'danger-text'}">+${population(outcome.gainedPopulation)} / −${population(outcome.lostPopulation)}</strong><small>Population currently held in gained and lost land</small></article>
        <article class="war-outcome-card"><span>ECONOMY</span><strong class="${outcome.gainedEconomy >= outcome.lostEconomy ? 'is-positive' : 'danger-text'}">+${cash(outcome.gainedEconomy)} / −${cash(outcome.lostEconomy)}</strong><small>Current output of gained and lost land</small></article>
        <article class="war-outcome-card war-outcome-card--wide"><span>TREASURY & TREATY</span><strong>${cash(outcome.treasuryBefore)} → ${cash(outcome.treasuryAfter)} <em class="${cashDelta >= 0 ? 'is-positive' : 'danger-text'}">${signedCash(cashDelta)}</em></strong><small>${escapeHtml(financeDetails)}</small></article>
        <article class="war-outcome-card"><span>ARMY SURVIVORS</span><strong>${people(outcome.survivingManpower)}</strong><small>We lost ${people(outcome.ownLosses)} · enemy lost ${people(outcome.enemyLosses)}</small></article>
        <article class="war-outcome-card"><span>VETERAN FORCES</span><strong>${people(outcome.veteranManpowerBefore)} → ${people(outcome.veteranManpowerAfter)}</strong><small>${veteranGain} · average rank ${veteranRankBefore} → ${veteranRankAfter} · XP ${compactNumber(outcome.veteranExperienceBefore)} → ${compactNumber(outcome.veteranExperienceAfter)}</small></article>
        <article class="war-outcome-card"><span>COMBAT POWER</span><strong>${compactNumber(outcome.combatPowerBefore)} → ${compactNumber(outcome.combatPowerAfter)}</strong><small>Live troops, veterans, condition and army quality included</small></article>
        <article class="war-outcome-card"><span>MAX MANPOWER</span><strong>${people(outcome.capacityBefore)} → ${people(outcome.capacityAfter)}</strong><small>Population and force-capacity research only</small></article>
        <article class="war-outcome-card war-outcome-card--wide war-outcome-quality"><span>ARMY QUALITY MIX</span><div><strong>ATK ${format(outcome.baseAttackBefore, 2)} → ${format(outcome.baseAttackAfter, 2)}</strong><strong>DEF ${format(outcome.baseDefenseBefore, 2)} → ${format(outcome.baseDefenseAfter, 2)}</strong></div><small>Manpower-weighted average of surviving deployed armies. Existing soldiers keep their quality; movement and local recruitment blend it.</small></article>
      </div>
      <div class="war-outcome-actions"><small>${escapeHtml(queueNote)}</small><button class="primary-button" data-action="dismiss-war-outcome">${this.warOutcomeQueue.length > 1 ? 'NEXT REPORT' : 'CONTINUE'}</button></div>
    </section></div>`;
  }

  private renderGameOver(): string {
    const winner = this.engine.player(this.engine.state.winnerId ?? '')!;
    return `<div class="modal-backdrop"><section class="modal-card victory-card" style="--winner:${winner.cssColor}"><div class="victory-sigil country-flag">${countryFlagHtml(winner.id, winner.sigil, true)}</div><div class="panel-kicker">WORLD CAMPAIGN COMPLETE</div><h1>${escapeHtml(winner.name)}</h1><p>leads the final world ranking.</p><button class="primary-button" data-action="new-game">New campaign</button></section></div>`;
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
          case 'open-nation-select':
            this.gameExplainerOpen = false;
            this.render();
            break;
          case 'continent-filter': {
            this.introContinent = element.dataset.continent ?? 'ALL';
            this.introGridScrollTop = 0;
            const firstVisible = WORLD_CONTENT_V2.nationIds
              .map((id) => WORLD_CONTENT_V2.nations[id])
              .filter((nation): nation is NonNullable<typeof nation> => Boolean(nation))
              .filter((nation) => this.introContinent === 'ALL' || nation.continent === this.introContinent)
              .sort((left, right) => this.introSortValue(right.id) - this.introSortValue(left.id)
                || left.name.localeCompare(right.name, 'en'))[0];
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
            // Capture the unboosted ranking before chooseCountry applies the
            // one-time underdog elite. The activation card can then compare the
            // real starting baseline with the boosted live rank honestly.
            this.activationBaselineRank = [...WORLD_CONTENT_V2.nationIds].sort((left, right) => (
              this.engine.conventionalPower(right) - this.engine.conventionalPower(left)
                || left.localeCompare(right)
            )).indexOf(countryId) + 1;
            const result = this.engine.chooseCountry(countryId);
            if (!commandAccepted(result)) {
              this.activationBaselineRank = undefined;
              this.toast(commandReason(result) ?? 'This country cannot be selected now.');
              break;
            }
            this.introOpen = false;
            this.activationBriefingOpen = true;
            this.selectedTerritoryId = undefined;
            this.contextPanelOpen = false;
            this.updateMapSelection();
            mapBridge.scene?.focusCountry?.(countryId);
            this.render();
            break;
          }
          case 'dismiss-activation': this.activationBriefingOpen = false; this.render(); break;
          case 'dismiss-war-outcome':
            this.warOutcomeQueue.shift();
            this.render();
            break;
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
          case 'mark-read': this.engine.markAllEventsRead(); break;
          case 'toggle-feed': this.eventFeedOpen = !this.eventFeedOpen; this.render(); break;
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
          case 'quick-war':
            this.warConfirmScrollTop = 0;
            this.confirmWarTargetId = element.dataset.player as PlayerId;
            this.render();
            break;
          case 'cancel-war': this.confirmWarTargetId = undefined; this.warConfirmScrollTop = 0; this.render(); break;
          case 'declare-war': {
            if (!this.confirmWarTargetId) break;
            const result = this.engine.declareWar(this.engine.state.humanPlayerId, this.confirmWarTargetId);
            if (!commandAccepted(result)) this.toast(commandReason(result) ?? 'War cannot be declared.');
            this.confirmWarTargetId = undefined;
            this.warConfirmScrollTop = 0;
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
          case 'open-research-surge':
            this.confirmResearchSurge = true;
            this.render();
            break;
          case 'cancel-research-surge':
            this.confirmResearchSurge = false;
            this.render();
            break;
          case 'confirm-research-surge': {
            this.requestManualAction('researchSurge');
            this.confirmResearchSurge = false;
            this.render();
            break;
          }
          case 'open-propaganda':
            this.confirmPropaganda = true;
            this.render();
            break;
          case 'cancel-propaganda':
            this.confirmPropaganda = false;
            this.render();
            break;
          case 'confirm-propaganda': {
            this.requestManualAction('propaganda');
            this.confirmPropaganda = false;
            this.render();
            break;
          }
          case 'rapid-recruitment': {
            this.requestManualAction('rapidRecruitment');
            this.render();
            break;
          }
          case 'confirm-ceasefire': {
            const warId = element.dataset.war ?? this.confirmCeasefireWarId;
            if (!warId) break;
            const result = this.engine.requestCeasefire(warId, this.engine.state.humanPlayerId);
            if (!commandAccepted(result)) this.toast(commandReason(result) ?? 'Ceasefire is unavailable.');
            else this.toast('Peace offer sent. The enemy will decide whether to accept it.');
            this.confirmCeasefireWarId = undefined;
            this.render();
            break;
          }
          case 'peace-settlement': {
            const result = this.engine.proposePeaceSettlement(
              this.engine.state.humanPlayerId,
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
            const result = this.engine.setEmpireName(this.engine.state.humanPlayerId, name);
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
    const empireName = this.hud.querySelector<HTMLInputElement>('#empire-name');
    empireName?.addEventListener('input', () => { this.empireNameDraft = empireName.value; });
    empireName?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.hud.querySelector<HTMLElement>('[data-action="name-empire"]')?.click();
    });
  }
}
