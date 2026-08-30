import {
  COUNTRIES,
  COUNTRY_BY_ID,
  REGIONS,
  TERRITORIES,
  TERRITORY_BY_ID,
  colorToCss,
  countryColor,
  isSeaConnection,
  terrainForTerritory,
  territoriesInRegion,
} from '../game/data/worldMap';
import { nextRandom, normalizeSeed } from '../game/random';
import {
  IMPROVEMENT_LABELS,
  MANAGEMENT_UPGRADE_BY_ID,
  MANAGEMENT_UPGRADES,
  RESEARCH_BY_ID,
  RESEARCH_PROJECTS,
  TREASURY_UPGRADE_BY_ID,
  treasuryUpgradeCost,
} from './data/research';
import type {
  BattleEvent,
  BattleTactic,
  BudgetPolicy,
  ForceState,
  FrontOperationState,
  MilitaryStance,
  ManagementUpgradeId,
  OperationDoctrine,
  PlayerId,
  RelationState,
  PlayerPerk,
  SimPlayerState,
  SimTerritoryState,
  StrategicUpgradeId,
  TerritoryId,
  WarState,
  WeeklyFinanceBreakdown,
  WorldChange,
  WorldSpeed,
  WorldState,
} from './types';

type Listener = (state: WorldState, change: WorldChange) => void;

const TICK_DURATION_MS = 1_000;
const MAX_CATCH_UP_TICKS = 8;
const START_DATE_UTC = Date.UTC(2026, 7, 17);
export const DEFENSIVE_POSITION_BONUS = 1.25;
export const PEACETIME_RESERVE_TARGET = 5;

export const BUDGET_PRESETS: Record<string, { name: string; description: string; policy: BudgetPolicy }> = {
  balanced: {
    name: 'Balanced strategy',
    description: 'A sustainable mix of income, armed forces and research.',
    policy: { economy: 35, military: 35, research: 30, diplomacy: 0 },
  },
  growth: {
    name: 'Economic surge',
    description: 'Faster development with less military spending.',
    policy: { economy: 55, military: 20, research: 20, diplomacy: 5 },
  },
  defense: {
    name: 'War economy',
    description: 'More recruitment and force capacity, with slower research and weaker revenue growth.',
    policy: { economy: 25, military: 60, research: 15, diplomacy: 0 },
  },
  research: {
    name: 'Innovation economy',
    description: 'Faster automated research, but lower mobilisation and military growth.',
    policy: { economy: 30, military: 20, research: 50, diplomacy: 0 },
  },
  diplomacy: {
    name: 'International influence',
    description: 'Trade and mediation take priority.',
    policy: { economy: 30, military: 20, research: 15, diplomacy: 35 },
  },
};

const DEFAULT_HUMAN_COUNTRY = COUNTRY_BY_ID.bel ? 'bel' : COUNTRY_BY_ID.usa ? 'usa' : COUNTRIES[0]!.id;
const NUCLEAR_STATES = new Set(['usa', 'rus', 'chn', 'fra', 'gbr', 'ind', 'pak', 'prk', 'isr']);
const MILITARY_CASUALTIES_PER_HP = 0.0022;
const TRAINING_COST_PER_MILLION = 50;
const PUBLIC_REVENUE_SHARE = 0.4;
const NAVAL_MOBILIZATION_MULTIPLIER = 1.85;

function initialTrainedManpower(country: (typeof COUNTRIES)[number]): number {
  const activeAndReserve = country.population * 0.0016
    + Math.sqrt(Math.max(0.01, country.military)) * 0.04
    + country.powerIndex * 0.0015;
  return Math.max(0.012, Math.min(country.population * 0.025, activeAndReserve));
}

const STANDARD_PERK: PlayerPerk = {
  id: 'standard-command',
  name: 'Standard Command',
  description: 'Country selection does not change military effectiveness.',
  attackBonus: 0,
  defenseBonus: 0,
  recoveryBonus: 0,
  capacityBonus: 0,
};

export function playerPerkForCountry(_countryId: TerritoryId): PlayerPerk {
  return { ...STANDARD_PERK };
}

function forceFromCountry(country: (typeof COUNTRIES)[number], fortification: number): ForceState {
  const budgetFactor = Math.log10(Math.max(0.08, country.military) + 1);
  const populationFactor = Math.log10(Math.max(0.2, country.population) + 1);
  const nuclearBonus = NUCLEAR_STATES.has(country.id) ? 18 : 0;
  const maxHp = Math.round(88 + budgetFactor * 78 + populationFactor * 35 + nuclearBonus);
  return {
    hp: maxHp,
    maxHp,
    attack: 9 + budgetFactor * 10.8 + populationFactor * 2.6 + nuclearBonus * 0.14,
    defense: 11 + budgetFactor * 7.2 + populationFactor * 3.8 + fortification * 2.2,
    readiness: Math.min(1, 0.62 + budgetFactor * 0.1 + country.powerIndex / 420),
    recovery: Math.max(0.22, maxHp * (0.0016 + budgetFactor * 0.00065)),
  };
}

export function forcePower(force: ForceState): number {
  const health = force.maxHp > 0 ? force.hp / force.maxHp : 0;
  return (force.hp * 0.12 + force.attack * 2.5 + force.defense * 1.9) * (0.45 + health * 0.55) * (0.72 + force.readiness * 0.28);
}

function relationKey(leftId: PlayerId, rightId: PlayerId): string {
  return [leftId, rightId].sort().join('::');
}

function clonePolicy(policy: BudgetPolicy): BudgetPolicy {
  return { ...policy };
}

function deterministicHash(value: string, seed: number): number {
  let hash = (2_166_136_261 ^ seed) >>> 0;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619) >>> 0;
  return hash;
}

function baseRelation(leftId: PlayerId, rightId: PlayerId, seed: number): number {
  const left = COUNTRY_BY_ID[leftId];
  const right = COUNTRY_BY_ID[rightId];
  const hash = deterministicHash(relationKey(leftId, rightId), seed);
  const sharesBorder = Boolean(TERRITORY_BY_ID[leftId]?.neighbors.includes(rightId));
  if (sharesBorder && hash % 100 < 9) return -34 - (hash % 15);
  const geographicWarmth = left?.continent === right?.continent ? 5 : 0;
  return Math.max(-22, Math.min(24, geographicWarmth + ((hash >>> 8) % 25) - 12));
}

function makeRelationState(leftId: PlayerId, rightId: PlayerId, seed: number): RelationState {
  const score = baseRelation(leftId, rightId, seed);
  return {
    id: relationKey(leftId, rightId),
    leftId,
    rightId,
    score,
    trust: Math.max(5, 45 + score / 2),
    status: score <= -25 ? 'tension' : 'peace',
    treaties: [],
    grievances: score < 0 ? Math.abs(score) * 0.3 : 0,
    truceUntilTick: 0,
    lastActionTick: 0,
  };
}

function makePlayer(country: (typeof COUNTRIES)[number], seed: number): SimPlayerState {
  const researchIds = ['resilient-grids', 'integrated-logistics', 'federated-ai', 'diplomatic-analytics'];
  const color = countryColor(country.id);
  const cssColor = colorToCss(color);
  const stability = Math.max(48, Math.min(88, 48 + Math.log10(country.gdpPerCapita + 1) * 8));
  const militaryWeight = country.gdp > 0 ? country.military / country.gdp : 0.02;
  return {
    id: country.id,
    name: country.englishName,
    shortName: country.englishName,
    color,
    cssColor,
    darkColor: '#102330',
    sigil: country.code.slice(0, 2),
    influences: [country.subregion, country.type],
    profile: `${country.englishName} starts with ${country.population.toFixed(country.population < 10 ? 1 : 0)} million people, an economy of roughly $${country.gdp.toFixed(0)} billion and a current power index of ${country.powerIndex.toFixed(0)}.`,
    isHuman: country.id === DEFAULT_HUMAN_COUNTRY,
    capitalId: country.id,
    eliminated: false,
    treasury: 0,
    annualIncome: 0,
    industry: 0,
    science: 0,
    influence: Math.max(12, Math.min(90, 18 + country.powerIndex * 0.68)),
    manpower: initialTrainedManpower(country),
    stability,
    warExhaustion: 0,
    recoverySurgeUntilTick: 0,
    budget: militaryWeight > 0.035 ? clonePolicy(BUDGET_PRESETS.defense!.policy) : clonePolicy(BUDGET_PRESETS.balanced!.policy),
    funds: {
      development: 0,
      military: 0,
      research: 0,
      diplomacy: 0,
    },
    stance: country.powerIndex >= 70 ? 'assertive' : country.powerIndex < 25 ? 'defensive' : 'balanced',
    research: {
      activeId: researchIds[deterministicHash(country.id, seed) % researchIds.length]!,
      progress: 0,
      completed: [],
      discoveries: Object.fromEntries(researchIds.map((id) => [id, 0])),
    },
    upgrades: { demographics: 0, weapons: 0, 'defence-systems': 0, logistics: 0, mobilization: 0 },
    improvements: {
      attack: 0, defense: 0, recovery: 0, training: 0, 'manpower-capacity': 0,
      'research-speed': 0, 'research-cost': 0, 'population-growth': 0,
      revenue: 0, upkeep: 0, industry: 0,
    },
    managementLevels: Object.fromEntries(MANAGEMENT_UPGRADES.map((upgrade) => [upgrade.id, 0])) as SimPlayerState['managementLevels'],
    management: {
      research: { progress: 0, target: 0, paidCost: 0, startedTick: 0 },
      finance: { progress: 0, target: 0, paidCost: 0, startedTick: 0 },
      war: { progress: 0, target: 0, paidCost: 0, startedTick: 0 },
    },
    perk: { ...STANDARD_PERK },
  };
}

function createWorld(seedInput: number): WorldState {
  const seed = normalizeSeed(seedInput);
  const state: WorldState = {
    schemaVersion: 13,
    rulesVersion: 'adaptive-national-finance-2026.13',
    mapId: 'natural-earth-countries-2026',
    seed,
    rngState: seed,
    tick: 0,
    speed: 0,
    humanPlayerId: DEFAULT_HUMAN_COUNTRY,
    players: COUNTRIES.map((country) => makePlayer(country, seed)),
    territories: {},
    relations: {},
    wars: [],
    offers: [],
    events: [],
    nextUnitId: 1,
    nextEventId: 1,
    nextWarId: 1,
    nextOfferId: 1,
    gameOver: false,
  };

  TERRITORIES.forEach((territory) => {
    const country = COUNTRY_BY_ID[territory.id]!;
    const player = state.players.find((candidate) => candidate.id === territory.id)!;
    const economy = Math.max(1.5, Math.min(38, Math.log10(country.gdp + 1) * 8.2));
    const industry = Math.max(1, Math.min(30, Math.log10(country.gdp + 1) * 5.2 + Math.log10(country.population + 1) * 1.8));
    const research = Math.max(0.8, Math.min(26, Math.log10(country.gdp + 1) * 3.4 + Math.log10(country.gdpPerCapita + 1) * 1.7 - 4));
    const fortification = country.powerIndex >= 70 ? 2 : country.powerIndex >= 42 ? 1 : 0;
    state.territories[territory.id] = {
      id: territory.id,
      ownerId: territory.id,
      force: forceFromCountry(country, fortification),
      economy,
      industry,
      research,
      infrastructure: Math.max(1, Math.min(7, Math.round(Math.log10(country.gdpPerCapita + 1) * 1.45))),
      population: Math.max(0.01, country.population),
      stability: player.stability,
      fortification,
      capital: true,
    };
  });

  const seededPairs = new Set<string>();
  for (const territory of TERRITORIES) {
    for (const neighbourId of territory.neighbors) {
      const key = relationKey(territory.id, neighbourId);
      if (territory.id === neighbourId || seededPairs.has(key)) continue;
      seededPairs.add(key);
      state.relations[key] = makeRelationState(territory.id, neighbourId, seed);
    }
  }
  return state;
}

export class WorldEngine {
  state: WorldState;
  private readonly listeners = new Set<Listener>();
  private readonly playersById = new Map<PlayerId, SimPlayerState>();
  private readonly financePlans = new Map<PlayerId, WeeklyFinanceBreakdown>();
  private readonly recoveryPlans = new Map<PlayerId, Array<{ territory: SimTerritoryState; restored: number; cost: number }>>();
  private readonly reinforcementPlans = new Map<PlayerId, { target: SimTerritoryState; growth: number } | undefined>();
  private accumulator = 0;
  private lastFrameTime = 0;
  private animationFrame?: number;

  constructor(seed = Date.now()) {
    this.state = createWorld(seed);
    for (const player of this.state.players) this.playersById.set(player.id, player);
    this.recomputePlayerMetrics();
    for (const player of this.state.players) player.treasury = this.startingTreasury(player.id);
    this.addEvent('system', 'info', `${COUNTRIES.length} countries and territories are loaded. Choose your country to begin the war simulation.`);
  }

  chooseCountry(countryId: TerritoryId): boolean {
    const country = this.player(countryId);
    if (!country || this.state.tick > 0) return false;
    for (const player of this.state.players) {
      player.isHuman = player.id === countryId;
      player.perk = { ...STANDARD_PERK };
    }
    // Every player starts from a sustainable neutral strategy, regardless of the
    // AI doctrine the country had before it was selected (notably Russia).
    country.budget = clonePolicy(BUDGET_PRESETS.balanced!.policy);
    country.treasury = this.startingTreasury(countryId);
    this.state.humanPlayerId = countryId;
    this.state.speed = 0;
    this.addEvent('system', 'action', `You take command of ${country.name}. Every other country remains autonomous.`, countryId, countryId);
    this.emit({ reason: 'country-selected' });
    return true;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state, { reason: 'initial' });
    return () => this.listeners.delete(listener);
  }

  private emit(change: WorldChange): void {
    for (const listener of this.listeners) listener(this.state, change);
  }

  startClock(): void {
    if (this.animationFrame !== undefined) return;
    const frame = (now: number) => {
      if (this.lastFrameTime === 0) this.lastFrameTime = now;
      const delta = Math.min(250, now - this.lastFrameTime);
      this.lastFrameTime = now;
      if (this.state.speed > 0 && !document.hidden && !this.state.gameOver) {
        this.accumulator += delta * this.state.speed;
        let steps = 0;
        while (this.accumulator >= TICK_DURATION_MS && steps < MAX_CATCH_UP_TICKS && this.state.speed > 0) {
          this.stepOneTick();
          this.accumulator -= TICK_DURATION_MS;
          steps += 1;
        }
        if (steps === MAX_CATCH_UP_TICKS) this.accumulator = 0;
      }
      this.animationFrame = window.requestAnimationFrame(frame);
    };
    this.animationFrame = window.requestAnimationFrame(frame);
  }

  stopClock(): void {
    if (this.animationFrame !== undefined) window.cancelAnimationFrame(this.animationFrame);
    this.animationFrame = undefined;
    this.lastFrameTime = 0;
  }

  setSpeed(speed: WorldSpeed): void {
    this.state.speed = speed;
    this.accumulator = 0;
    this.emit({ reason: 'speed' });
  }

  step(count = 1): void {
    for (let index = 0; index < count; index += 1) this.stepOneTick();
  }

  stepOneTick(): void {
    if (this.state.gameOver) return;
    this.state.tick += 1;
    this.recoveryPlans.clear();
    this.reinforcementPlans.clear();
    const controlledPopulations = this.controlledPopulationTotals();
    const territoriesByOwner = this.territoriesByOwner();
    const activeWarCounts = this.activeWarCounts();
    for (const player of this.state.players) {
      if (player.eliminated) continue;
      const existingPlan = this.financePlans.get(player.id);
      const atWar = (activeWarCounts.get(player.id) ?? 0) > 0;
      const planWasAtWar = existingPlan?.mode === 'war' || existingPlan?.mode === 'insolvent';
      const needsNewPlan = player.isHuman || this.state.tick % 4 === 0 || !existingPlan || atWar !== planWasAtWar;
      if (needsNewPlan) this.financePlans.set(player.id, this.calculateWeeklyFinanceBreakdown(
        player.id,
        controlledPopulations,
        territoriesByOwner,
        activeWarCounts,
      ));
    }
    this.processEconomy();
    this.processResearch();
    this.processManagementProjects();
    this.processPassiveRecovery();
    if (this.state.tick % 4 === 0) {
      this.processReinforcement();
      this.processDevelopment();
    }
    if (this.state.tick % 2 === 0) {
      this.processMobilization();
      this.processWars();
    }
    if (this.state.tick % 8 === 0) {
      this.processRelations();
      this.runAiDirectors();
    }
    if (this.state.tick % 13 === 0) this.processWarClosures();
    this.recomputePlayerMetrics();
    this.checkVictory();
    this.pruneHistory();
    this.emit({ reason: 'tick' });
  }

  setBudgetPreset(playerId: PlayerId, presetId: string): boolean {
    const player = this.player(playerId);
    const preset = BUDGET_PRESETS[presetId];
    if (!player || !preset) return false;
    player.budget = clonePolicy(preset.policy);
    this.addEvent('economy', 'info', `${player.shortName} adopts ${preset.name}.`, undefined, playerId);
    this.emit({ reason: 'policy' });
    return true;
  }

  setStance(playerId: PlayerId, stance: MilitaryStance): boolean {
    const player = this.player(playerId);
    if (!player) return false;
    player.stance = stance;
    const labels: Record<MilitaryStance, string> = { defensive: 'defensive', balanced: 'balanced', assertive: 'aggressive' };
    this.addEvent('system', 'info', `${player.shortName} changes its military posture to ${labels[stance]}.`, undefined, playerId);
    this.emit({ reason: 'stance' });
    return true;
  }

  selectResearch(playerId: PlayerId, projectId: string): boolean {
    const player = this.player(playerId);
    if (!player || !RESEARCH_BY_ID[projectId] || player.research.completed.includes(projectId)) return false;
    player.research.activeId = projectId;
    player.research.progress = 0;
    this.addEvent('research', 'info', `${player.shortName} start ${RESEARCH_BY_ID[projectId]!.name}.`, undefined, playerId);
    this.emit({ reason: 'research-selected' });
    return true;
  }

  strategicUpgradeCost(playerId: PlayerId, upgradeId: StrategicUpgradeId): number | undefined {
    const player = this.player(playerId);
    const upgrade = TREASURY_UPGRADE_BY_ID[upgradeId];
    if (!player || !upgrade) return undefined;
    return treasuryUpgradeCost(upgrade, player.upgrades[upgradeId]);
  }

  purchaseStrategicUpgrade(playerId: PlayerId, upgradeId: StrategicUpgradeId): boolean {
    const player = this.player(playerId);
    const upgrade = TREASURY_UPGRADE_BY_ID[upgradeId];
    if (!player || !upgrade || player.eliminated) return false;
    const level = player.upgrades[upgradeId];
    if (level >= upgrade.maxLevel) return false;
    const cost = treasuryUpgradeCost(upgrade, level);
    if (player.treasury < cost) return false;
    player.treasury -= cost;
    player.upgrades[upgradeId] += 1;
    this.addEvent('research', 'action', `${player.shortName} funds ${upgrade.name} level ${level + 1} for $${cost.toFixed(1)}B.`, undefined, playerId);
    this.emit({ reason: 'treasury-research' });
    return true;
  }

  managementUpgradeCost(playerId: PlayerId, upgradeId: ManagementUpgradeId): number | undefined {
    const player = this.player(playerId);
    const upgrade = MANAGEMENT_UPGRADE_BY_ID[upgradeId];
    if (!player || !upgrade || player.eliminated) return undefined;
    const level = player.managementLevels[upgradeId];
    const population = this.controlledPopulation(playerId);
    const territoryCount = this.territoriesOf(playerId).length;
    const nationalScale = Math.max(0.68, Math.min(1.8,
      0.62 + Math.sqrt(Math.max(0, population)) * 0.022 + this.strategicScore(playerId) / 760 + territoryCount * 0.025));
    const researchEfficiency = upgrade.domain === 'research'
      ? Math.max(0.72, 1 - player.improvements['research-cost'] * 0.01)
      : 1;
    return Math.round(upgrade.baseCost * upgrade.costGrowth ** level * nationalScale * researchEfficiency * 10) / 10;
  }

  managementUpgradeDuration(playerId: PlayerId, upgradeId: ManagementUpgradeId): number | undefined {
    const player = this.player(playerId);
    const upgrade = MANAGEMENT_UPGRADE_BY_ID[upgradeId];
    if (!player || !upgrade || player.eliminated) return undefined;
    const level = player.managementLevels[upgradeId];
    return Math.round(upgrade.baseDuration * (1 + level * upgrade.durationGrowth));
  }

  startManagementUpgrade(playerId: PlayerId, upgradeId: ManagementUpgradeId): boolean {
    const player = this.player(playerId);
    const upgrade = MANAGEMENT_UPGRADE_BY_ID[upgradeId];
    if (!player || !upgrade || player.eliminated) return false;
    const level = player.managementLevels[upgradeId];
    const project = player.management[upgrade.domain];
    if (project.activeId || level >= upgrade.maxLevel) return false;
    const cost = this.managementUpgradeCost(playerId, upgradeId);
    const duration = this.managementUpgradeDuration(playerId, upgradeId);
    if (cost === undefined || duration === undefined || player.treasury < cost) return false;
    player.treasury -= cost;
    player.management[upgrade.domain] = {
      activeId: upgradeId,
      progress: 0,
      target: duration,
      paidCost: cost,
      startedTick: this.state.tick,
    };
    this.addEvent(upgrade.domain === 'war' ? 'war' : upgrade.domain === 'finance' ? 'economy' : 'research', 'action',
      `${player.shortName} begins ${upgrade.name}: $${cost.toFixed(1)}B committed over ${duration} weeks.`, undefined, playerId);
    this.emit({ reason: 'management-upgrade' });
    return true;
  }

  improveRelations(fromId: PlayerId, targetId: PlayerId): boolean {
    const from = this.player(fromId);
    const target = this.player(targetId);
    const relation = this.relation(fromId, targetId);
    if (!from || !target || !relation || relation.status === 'war' || from.influence < 8) return false;
    from.influence -= 8;
    relation.score = Math.min(100, relation.score + 9);
    relation.trust = Math.min(100, relation.trust + 5);
    relation.lastActionTick = this.state.tick;
    if (relation.status === 'tension' && relation.score > -20) relation.status = 'peace';
    this.addEvent('diplomacy', 'info', `${from.shortName} opent een dialoog met ${target.shortName}. Relaties verbeteren.`, undefined, targetId);
    this.emit({ reason: 'diplomacy' });
    return true;
  }

  declareWar(attackerId: PlayerId, defenderId: PlayerId): boolean {
    const attacker = this.player(attackerId);
    const defender = this.player(defenderId);
    const relation = this.relation(attackerId, defenderId);
    if (!attacker || !defender || !relation || !this.canDeclareWar(attackerId, defenderId)) return false;
    const mobilizationCost = this.warMobilizationCost(attackerId, defenderId);
    if (attacker.treasury < mobilizationCost) return false;
    attacker.treasury -= mobilizationCost;

    relation.status = 'war';
    relation.score = Math.min(relation.score, -70);
    relation.treaties = [];
    relation.lastActionTick = this.state.tick;
    const war: WarState = {
      id: `war-${this.state.nextWarId++}`,
      attackerId,
      defenderId,
      startedTick: this.state.tick,
      warScore: 0,
      attackerLosses: 0,
      defenderLosses: 0,
      attackerMilitaryLoss: 0,
      defenderMilitaryLoss: 0,
      lastBattleTick: this.state.tick,
      battles: 0,
      attackerPopulationLoss: 0,
      defenderPopulationLoss: 0,
      economicDamage: 0,
      lastPeaceOfferTick: -999,
    };
    this.state.wars.push(war);
    attacker.stability = Math.max(20, attacker.stability - 3);
    defender.stability = Math.max(20, defender.stability - 2);
    const message = `War declared: ${attacker.name} against ${defender.name}. Mobilisation costs $${mobilizationCost.toFixed(1)}B; front-line forces deploy automatically.`;
    this.addEvent('war', 'critical', message, undefined, attackerId);
    this.emit({ reason: 'war-declared', critical: true });
    return true;
  }

  canDeclareWar(attackerId: PlayerId, defenderId: PlayerId): boolean {
    const attacker = this.player(attackerId);
    const defender = this.player(defenderId);
    const relation = this.relation(attackerId, defenderId);
    return Boolean(
      attacker && defender && relation && attackerId !== defenderId && !attacker.eliminated && !defender.eliminated
      && relation.status !== 'war'
      && relation.truceUntilTick <= this.state.tick && this.sharesBorder(attackerId, defenderId)
    );
  }

  markAllEventsRead(): void {
    for (const event of this.state.events) event.unread = false;
    this.emit({ reason: 'events-read' });
  }

  player(playerId: PlayerId): SimPlayerState | undefined {
    return this.playersById.get(playerId);
  }

  relation(leftId: PlayerId, rightId: PlayerId): RelationState | undefined {
    if (leftId === rightId || !COUNTRY_BY_ID[leftId] || !COUNTRY_BY_ID[rightId]) return undefined;
    const key = relationKey(leftId, rightId);
    this.state.relations[key] ??= makeRelationState(leftId, rightId, this.state.seed);
    return this.state.relations[key];
  }

  territoriesOf(playerId: PlayerId): SimTerritoryState[] {
    return Object.values(this.state.territories).filter((territory) => territory.ownerId === playerId);
  }

  controlledPopulation(playerId: PlayerId): number {
    return this.controlledPopulationTotals().get(playerId) ?? 0;
  }

  weeklyPopulationTrend(playerId: PlayerId): number {
    const player = this.player(playerId);
    if (!player || player.eliminated) return 0;
    return this.territoriesOf(playerId).reduce((sum, territory) => {
      const nationalRate = (COUNTRY_BY_ID[territory.id]?.populationGrowthRate ?? 0.8) / 100;
      const levels = player.improvements['population-growth'];
      const smartTrend = nationalRate < 0 ? nationalRate * Math.max(0.5, 1 - levels * 0.01) : nationalRate * (1 + levels * 0.01);
      const annualRate = Math.max(-0.04, Math.min(0.07, smartTrend + player.upgrades.demographics * 0.00025));
      return sum + territory.population * (Math.pow(Math.max(0.5, 1 + annualRate), 1 / 52) - 1);
    }, 0);
  }

  weeklyManpowerTrend(playerId: PlayerId): number {
    const player = this.player(playerId);
    if (!player || player.eliminated) return 0;
    return Math.min(Math.max(0, this.manpowerCapacity(playerId) - player.manpower), this.manpowerTrainingRate(playerId));
  }

  manpowerCapacity(playerId: PlayerId): number {
    const player = this.player(playerId);
    if (!player || player.eliminated) return 0;
    const population = this.controlledPopulation(playerId);
    const defenceBase = this.territoriesOf(playerId).reduce((sum, territory) => (
      sum + (COUNTRY_BY_ID[territory.id]?.military ?? 0)
    ), 0);
    const budgetScale = 0.75 + player.budget.military * 0.01;
    const mobilizationScale = (1 + player.upgrades.mobilization * 0.04) * (1 + player.improvements['manpower-capacity'] * 0.01);
    return Math.max(0.012, (population * 0.003 + Math.sqrt(Math.max(0.01, defenceBase)) * 0.06)
      * budgetScale * mobilizationScale);
  }

  manpowerTrainingRate(playerId: PlayerId): number {
    const player = this.player(playerId);
    if (!player || player.eliminated) return 0;
    const population = this.controlledPopulation(playerId);
    const budgetScale = 0.35 + player.budget.military * 0.014;
    const mobilizationScale = (1 + player.upgrades.mobilization * 0.08) * (1 + player.improvements.training * 0.01);
    return Math.max(0.00005, (population * 0.000012 + player.industry * 0.000006)
      * budgetScale * mobilizationScale);
  }

  weeklyMilitaryUpkeep(playerId: PlayerId): number {
    const player = this.player(playerId);
    if (!player || player.eliminated) return 0;
    const forceCapacity = this.territoriesOf(playerId).reduce((sum, territory) => sum + territory.force.maxHp, 0);
    const activeWars = this.state.wars.filter((war) => war.attackerId === playerId || war.defenderId === playerId).length;
    const annualSalaries = player.manpower * 3.2;
    const annualForceMaintenance = forceCapacity * 0.0025;
    const annualWarOperations = activeWars > 0 ? forceCapacity * 0.0045 * Math.min(2.2, 1 + (activeWars - 1) * 0.35) : 0;
    const efficiency = Math.max(0.75, 1 - player.improvements.upkeep * 0.01);
    return (annualSalaries + annualForceMaintenance + annualWarOperations) / 52 * efficiency;
  }

  weeklyPublicRevenue(playerId: PlayerId): number {
    const player = this.player(playerId);
    if (!player || player.eliminated) return 0;
    const economicDirection = player.isHuman ? 1 : 0.85 + player.budget.economy * (0.15 / 35);
    const revenueUpgrade = 1 + player.improvements.revenue * 0.01;
    return player.annualIncome / 52 * PUBLIC_REVENUE_SHARE * economicDirection * revenueUpgrade;
  }

  weeklyResearchInvestment(playerId: PlayerId): number {
    const player = this.player(playerId);
    if (!player || player.eliminated) return 0;
    const baseCost = this.weeklyPublicRevenue(playerId) * 0.055 + player.science * 0.0003;
    const efficiency = Math.max(0.72, 1 - player.improvements['research-cost'] * 0.01);
    return Math.max(0.006, baseCost * efficiency);
  }

  startingTreasury(playerId: PlayerId): number {
    const player = this.player(playerId);
    if (!player || player.eliminated) return 0;
    const targets = this.borderingPlayers(playerId);
    const cheapestOpening = targets.reduce((lowest, target) => {
      const cost = this.warMobilizationCost(playerId, target.id);
      return Number.isFinite(cost) ? Math.min(lowest, cost) : lowest;
    }, Number.POSITIVE_INFINITY);
    const mobilisationBase = Number.isFinite(cheapestOpening) ? cheapestOpening : 0.8;
    const operatingReserve = this.weeklyMilitaryUpkeep(playerId) * 2.5;
    return Math.round(Math.max(0.8, Math.min(18, mobilisationBase * 1.18 + operatingReserve)) * 10) / 10;
  }

  researchProjectCost(playerId: PlayerId, projectId: string): number | undefined {
    const player = this.player(playerId);
    const project = RESEARCH_BY_ID[projectId];
    if (!player || !project || player.eliminated) return undefined;
    const population = this.controlledPopulation(playerId);
    const territoryCount = this.territoriesOf(playerId).length;
    const nationalScale = Math.max(0.42, Math.min(1.75,
      0.34
      + Math.sqrt(Math.max(0, population)) * 0.024
      + this.strategicScore(playerId) / 620
      + territoryCount * 0.035));
    const discoveries = Object.values(player.research.discoveries).reduce((sum, level) => sum + level, 0);
    const progressionScale = Math.pow(1.16, discoveries);
    const efficiency = Math.max(0.72, 1 - player.improvements['research-cost'] * 0.01);
    return Math.round(project.cost * nationalScale * progressionScale * efficiency * 10) / 10;
  }

  weeklyNetCashflow(playerId: PlayerId): number {
    const breakdown = this.weeklyFinanceBreakdown(playerId);
    return breakdown.net;
  }

  weeklyFinanceBreakdown(playerId: PlayerId): WeeklyFinanceBreakdown {
    return this.financePlans.get(playerId) ?? this.calculateWeeklyFinanceBreakdown(playerId);
  }

  private calculateWeeklyFinanceBreakdown(
    playerId: PlayerId,
    controlledPopulations = this.controlledPopulationTotals(),
    territoriesByOwner = this.territoriesByOwner(),
    activeWarCounts = this.activeWarCounts(),
  ): WeeklyFinanceBreakdown {
    const player = this.player(playerId);
    const empty: WeeklyFinanceBreakdown = {
      revenue: 0, payroll: 0, maintenance: 0, warOperations: 0, research: 0, training: 0, recovery: 0, forceExpansion: 0,
      expenses: 0, net: 0, requestedPayroll: 0, requestedMaintenance: 0, requestedWarOperations: 0, requestedResearch: 0,
      requestedTraining: 0, requestedRecovery: 0, requestedForceExpansion: 0, requestedExpenses: 0, savings: 0,
      reserveTarget: PEACETIME_RESERVE_TARGET, mode: 'normal',
    };
    if (!player || player.eliminated) return empty;
    const territories = territoriesByOwner.get(playerId) ?? [];
    const forceCapacity = territories.reduce((sum, territory) => sum + territory.force.maxHp, 0);
    const activeWars = activeWarCounts.get(playerId) ?? 0;
    const efficiency = Math.max(0.75, 1 - player.improvements.upkeep * 0.01);
    const requestedPayroll = player.manpower * 3.2 / 52 * efficiency;
    const requestedMaintenance = forceCapacity * 0.0025 / 52 * efficiency;
    const requestedWarOperations = (activeWars > 0 ? forceCapacity * 0.0045 * Math.min(2.2, 1 + (activeWars - 1) * 0.35) : 0) / 52 * efficiency;
    const population = controlledPopulations.get(playerId) ?? 0;
    const defenceBase = territories.reduce((sum, territory) => sum + (COUNTRY_BY_ID[territory.id]?.military ?? 0), 0);
    const militaryBudgetScale = 0.75 + player.budget.military * 0.01;
    const mobilizationScale = (1 + player.upgrades.mobilization * 0.04) * (1 + player.improvements['manpower-capacity'] * 0.01);
    const manpowerCap = Math.max(0.012, (population * 0.003 + Math.sqrt(Math.max(0.01, defenceBase)) * 0.06)
      * militaryBudgetScale * mobilizationScale);
    const trainingBudgetScale = 0.35 + player.budget.military * 0.014;
    const trainingUpgradeScale = (1 + player.upgrades.mobilization * 0.08) * (1 + player.improvements.training * 0.01);
    const trainingCapacity = Math.max(0.00005, (population * 0.000012 + player.industry * 0.000006)
      * trainingBudgetScale * trainingUpgradeScale);
    const requestedTraining = Math.min(Math.max(0, manpowerCap - player.manpower), trainingCapacity) * TRAINING_COST_PER_MILLION;
    const requestedRecovery = this.recoveryRequests(playerId, territories, activeWars > 0).reduce((sum, request) => sum + request.cost, 0);
    const requestedForceExpansion = this.state.tick % 4 === 0 ? (this.reinforcementRequest(playerId, territories)?.growth ?? 0) * 0.48 : 0;
    const revenue = this.weeklyPublicRevenue(playerId);
    const requestedResearch = this.weeklyResearchInvestment(playerId);
    const requestedExpenses = requestedPayroll + requestedMaintenance + requestedWarOperations + requestedResearch
      + requestedTraining + requestedRecovery + requestedForceExpansion;
    const allocation = {
      payroll: requestedPayroll,
      maintenance: requestedMaintenance,
      warOperations: requestedWarOperations,
      research: requestedResearch,
      training: requestedTraining,
      recovery: requestedRecovery,
      forceExpansion: requestedForceExpansion,
    };
    const atWar = activeWars > 0;
    const reserveGap = Math.max(0, PEACETIME_RESERVE_TARGET - player.treasury);
    const weeklyReserveDraw = Math.max(0, player.treasury - PEACETIME_RESERVE_TARGET) / 26;
    const weeklyRebuild = reserveGap > 0 ? Math.min(revenue * 0.18, reserveGap / 26) : 0;
    const spendingCap = atWar
      ? Math.max(0, player.treasury + revenue)
      : Math.max(0, revenue + weeklyReserveDraw - weeklyRebuild);
    let requiredSavings = Math.max(0, requestedExpenses - spendingCap);
    const cut = (key: keyof typeof allocation, minimumFraction: number): void => {
      if (requiredSavings <= 0) return;
      const minimum = ({
        payroll: requestedPayroll,
        maintenance: requestedMaintenance,
        warOperations: requestedWarOperations,
        research: requestedResearch,
        training: requestedTraining,
        recovery: requestedRecovery,
        forceExpansion: requestedForceExpansion,
      })[key] * minimumFraction;
      const available = Math.max(0, allocation[key] - minimum);
      const saving = Math.min(requiredSavings, available);
      allocation[key] -= saving;
      requiredSavings -= saving;
    };
    if (!player.isHuman && requiredSavings > 0) {
      // Hundreds of autonomous countries use the same real spending ceiling but
      // rebalance proportionally; the player's finance director uses the more
      // detailed priority ladder below. This keeps world simulation inexpensive.
      const fundingRatio = requestedExpenses > 0 ? Math.max(0, Math.min(1, spendingCap / requestedExpenses)) : 1;
      allocation.payroll *= fundingRatio;
      allocation.maintenance *= fundingRatio;
      allocation.warOperations *= fundingRatio;
      allocation.research *= fundingRatio;
      allocation.training *= fundingRatio;
      allocation.recovery *= fundingRatio;
      allocation.forceExpansion *= fundingRatio;
      requiredSavings = 0;
    } else if (atWar) {
      cut('research', 0);
      cut('forceExpansion', 0);
      cut('training', 0.1);
      cut('recovery', 0.25);
      cut('maintenance', 0.45);
      cut('payroll', 0.55);
      cut('warOperations', 0.6);
    } else {
      // Peace-time finance directors protect cash by trimming new commitments
      // first, then temporarily running a leaner defence establishment. Research
      // and recovery retain minimum funding instead of silently stopping.
      cut('forceExpansion', 0);
      cut('training', 0.15);
      cut('maintenance', 0.55);
      cut('recovery', 0.3);
      cut('research', 0.25);
      cut('payroll', 0.78);
    }
    let expenses = Object.values(allocation).reduce((sum, value) => sum + value, 0);
    if (requiredSavings > 0 && expenses > 0) {
      const insolvencyScale = Math.max(0, Math.min(1, spendingCap / expenses));
      for (const key of Object.keys(allocation) as Array<keyof typeof allocation>) allocation[key] *= insolvencyScale;
      expenses = Object.values(allocation).reduce((sum, value) => sum + value, 0);
    }
    const savings = Math.max(0, requestedExpenses - expenses);
    const mode = atWar
      ? (expenses + 0.0001 < requestedExpenses ? 'insolvent' : 'war')
      : player.treasury < PEACETIME_RESERVE_TARGET
        ? 'rebuilding'
        : savings > 0.0001 ? 'conserving' : 'normal';
    return {
      revenue,
      ...allocation,
      expenses,
      net: revenue - expenses,
      requestedPayroll,
      requestedMaintenance,
      requestedWarOperations,
      requestedResearch,
      requestedTraining,
      requestedRecovery,
      requestedForceExpansion,
      requestedExpenses,
      savings,
      reserveTarget: PEACETIME_RESERVE_TARGET,
      mode,
    };
  }

  warAccessType(attackerId: PlayerId, defenderId: PlayerId): 'land' | 'naval' | 'none' {
    let navalAccess = false;
    for (const territory of this.territoriesOf(attackerId)) {
      for (const neighborId of TERRITORY_BY_ID[territory.id]?.neighbors ?? []) {
        if (this.state.territories[neighborId]?.ownerId !== defenderId) continue;
        if (!isSeaConnection(territory.id, neighborId)) return 'land';
        navalAccess = true;
      }
    }
    return navalAccess ? 'naval' : 'none';
  }

  warMobilizationCost(attackerId: PlayerId, defenderId: PlayerId): number {
    const attacker = this.player(attackerId);
    const defender = this.player(defenderId);
    if (!attacker || !defender) return Number.POSITIVE_INFINITY;
    const accessType = this.warAccessType(attackerId, defenderId);
    if (accessType === 'none') return Number.POSITIVE_INFINITY;
    const enemyTerritories = this.territoriesOf(defenderId);
    const targetMilitaryPower = this.militaryPower(defenderId);
    const targetPopulation = this.controlledPopulation(defenderId);
    const targetEconomicMass = enemyTerritories.reduce((sum, territory) => sum + territory.economy, 0);
    // Mobilisation is sized to the campaign objective. Invading a populous,
    // wealthy military power requires a much larger initial reserve than a small
    // island state, while large attackers still pay a modest deployment overhead.
    const objectiveCost = 0.35
      + enemyTerritories.length * 0.28
      + targetMilitaryPower * 0.024
      + Math.sqrt(Math.max(0, targetPopulation)) * 0.045
      + targetEconomicMass * 0.025;
    const deploymentOverhead = this.militaryPower(attackerId) * 0.0025;
    const baseCost = Math.max(0.6, Math.min(32, objectiveCost + deploymentOverhead));
    const logisticsMultiplier = accessType === 'naval' ? NAVAL_MOBILIZATION_MULTIPLIER : 1;
    return Math.round(Math.min(48, baseCost * logisticsMultiplier) * 10) / 10;
  }

  private controlledPopulationTotals(): Map<PlayerId, number> {
    const totals = new Map<PlayerId, number>();
    for (const territory of Object.values(this.state.territories)) {
      const foreignShare = territory.foreignControl?.share ?? 0;
      totals.set(territory.ownerId, (totals.get(territory.ownerId) ?? 0) + territory.population * (1 - foreignShare));
      if (territory.foreignControl) {
        const controllerId = territory.foreignControl.controllerId;
        totals.set(controllerId, (totals.get(controllerId) ?? 0) + territory.population * foreignShare);
      }
    }
    return totals;
  }

  private territoriesByOwner(): Map<PlayerId, SimTerritoryState[]> {
    const territories = new Map<PlayerId, SimTerritoryState[]>();
    for (const territory of Object.values(this.state.territories)) {
      const owned = territories.get(territory.ownerId);
      if (owned) owned.push(territory);
      else territories.set(territory.ownerId, [territory]);
    }
    return territories;
  }

  private activeWarCounts(): Map<PlayerId, number> {
    const counts = new Map<PlayerId, number>();
    for (const war of this.state.wars) {
      counts.set(war.attackerId, (counts.get(war.attackerId) ?? 0) + 1);
      counts.set(war.defenderId, (counts.get(war.defenderId) ?? 0) + 1);
    }
    return counts;
  }

  activeWarBetween(leftId: PlayerId, rightId: PlayerId): WarState | undefined {
    return this.state.wars.find((war) => (
      (war.attackerId === leftId && war.defenderId === rightId)
      || (war.attackerId === rightId && war.defenderId === leftId)
    ));
  }

  warOperation(warId: string, commanderId: PlayerId): FrontOperationState | undefined {
    const war = this.state.wars.find((candidate) => candidate.id === warId);
    if (!war) return undefined;
    return commanderId === war.attackerId ? war.attackerOperation
      : commanderId === war.defenderId ? war.defenderOperation : undefined;
  }

  date(): Date {
    return new Date(START_DATE_UTC + this.state.tick * 7 * 24 * 60 * 60 * 1000);
  }

  strategicScore(playerId: PlayerId): number {
    const player = this.player(playerId);
    if (!player) return 0;
    const territories = this.territoriesOf(playerId);
    const economy = territories.reduce((sum, territory) => sum + territory.economy, 0);
    const army = territories.reduce((sum, territory) => sum + forcePower(territory.force), 0);
    const population = this.controlledPopulation(playerId);
    return territories.length * 8 + economy * 0.72 + army * 1.4 + player.science * 0.28
      + Math.sqrt(population) * 2.4 + player.manpower * 1.8 + player.stability * 0.16;
  }

  globalRanking(): Array<{ player: SimPlayerState; score: number }> {
    return this.state.players
      .filter((player) => !player.eliminated)
      .map((player) => ({ player, score: this.strategicScore(player.id) }))
      .sort((left, right) => right.score - left.score || left.player.name.localeCompare(right.player.name, 'en'));
  }

  private financePlanForTick(playerId: PlayerId): WeeklyFinanceBreakdown {
    return this.financePlans.get(playerId) ?? this.calculateWeeklyFinanceBreakdown(playerId);
  }

  private payFromTreasury(player: SimPlayerState, amount: number): number {
    const paid = Math.min(Math.max(0, player.treasury), Math.max(0, amount));
    player.treasury = Math.max(0, player.treasury - paid);
    return paid;
  }

  private processEconomy(): void {
    for (const player of this.state.players) {
      if (player.eliminated) continue;
      const finance = this.financePlanForTick(player.id);
      player.treasury += finance.revenue;
      const requestedCore = finance.requestedPayroll + finance.requestedMaintenance + finance.requestedWarOperations;
      const fundedCore = this.payFromTreasury(player, finance.payroll + finance.maintenance + finance.warOperations);
      const coreFundingRatio = requestedCore > 0 ? Math.min(1, fundedCore / requestedCore) : 1;
      if (coreFundingRatio < 0.999) {
        const readinessPenalty = Math.min(0.025, (1 - coreFundingRatio) * 0.014);
        for (const territory of this.territoriesOf(player.id)) territory.force.readiness = Math.max(0.28, territory.force.readiness - readinessPenalty);
        if (coreFundingRatio < 0.62) player.stability = Math.max(20, player.stability - readinessPenalty * 0.22);
      }
      const influenceModifier = 1 + (player.research.discoveries['diplomatic-analytics'] ?? 0) * 0.01;
      player.influence = Math.min(100, player.influence + 0.025 * influenceModifier);
    }
    for (const territory of Object.values(this.state.territories)) {
      const owner = this.player(territory.ownerId);
      const nationalRate = (COUNTRY_BY_ID[territory.id]?.populationGrowthRate ?? 0.8) / 100;
      const demographicLevels = owner?.improvements['population-growth'] ?? 0;
      const smartTrend = nationalRate < 0
        ? nationalRate * Math.max(0.5, 1 - demographicLevels * 0.01)
        : nationalRate * (1 + demographicLevels * 0.01);
      const annualRate = Math.max(-0.04, Math.min(0.07, smartTrend + (owner?.upgrades.demographics ?? 0) * 0.00025));
      territory.population *= Math.pow(Math.max(0.5, 1 + annualRate), 1 / 52);
    }
    for (const player of this.state.players) {
      if (player.eliminated) continue;
      const finance = this.financePlanForTick(player.id);
      const trainingPayment = this.payFromTreasury(player, finance.training);
      player.manpower += trainingPayment / TRAINING_COST_PER_MILLION;
      player.warExhaustion = Math.max(0, player.warExhaustion - (this.isAtWar(player.id) ? 0 : 0.08));
    }
  }

  private processResearch(): void {
    for (const player of this.state.players) {
      if (player.eliminated) continue;
      const project = RESEARCH_BY_ID[player.research.activeId];
      if (!project) continue;
      const effectiveCost = this.researchProjectCost(player.id, project.id) ?? project.cost;
      const requestedInvestment = this.weeklyResearchInvestment(player.id);
      const paidInvestment = this.payFromTreasury(player, this.financePlanForTick(player.id).research);
      const fundingRatio = requestedInvestment > 0 ? paidInvestment / requestedInvestment : 1;
      const discoveryBonus = 1 + (player.research.discoveries['federated-ai'] ?? 0) * 0.01;
      const laboratoryBonus = 1 + player.improvements['research-speed'] * 0.01;
      const scienceProgress = 0.07 + Math.sqrt(Math.max(0, player.science)) * 0.025;
      player.research.progress += scienceProgress * discoveryBonus * laboratoryBonus * fundingRatio;
      if (player.research.progress >= effectiveCost) {
        player.research.discoveries[project.id] = (player.research.discoveries[project.id] ?? 0) + 1;
        if (!player.research.completed.includes(project.id)) player.research.completed.push(project.id);
        player.research.progress = Math.max(0, player.research.progress - effectiveCost);
        const candidates = RESEARCH_PROJECTS.filter((candidate) => candidate.id !== project.id);
        const next = candidates[Math.floor(nextRandom(this.state) * candidates.length)] ?? RESEARCH_PROJECTS[0];
        if (next) player.research.activeId = next.id;
        this.addEvent('research', player.isHuman ? 'action' : 'info', `${player.name} makes a passive breakthrough in ${project.name}: ${project.effect}.`, undefined, player.id);
      }
    }
  }

  private processManagementProjects(): void {
    for (const player of this.state.players) {
      if (player.eliminated) continue;
      for (const domain of ['research', 'finance', 'war'] as const) {
        const project = player.management[domain];
        if (!project.activeId) continue;
        const upgrade = MANAGEMENT_UPGRADE_BY_ID[project.activeId];
        if (!upgrade) continue;
        const researchSpeed = domain === 'research'
          ? (1 + player.improvements['research-speed'] * 0.01) * (1 + (player.research.discoveries['federated-ai'] ?? 0) * 0.01)
          : 1;
        const domainSpeed = domain === 'finance'
          ? 1 + player.improvements.industry * 0.005
          : domain === 'war' && this.isAtWar(player.id) ? 0.92 : 1;
        project.progress += researchSpeed * domainSpeed;
        if (project.progress < project.target) continue;
        const improvement = upgrade.fixedImprovement
          ?? upgrade.randomPool?.[Math.floor(nextRandom(this.state) * upgrade.randomPool.length)];
        player.managementLevels[upgrade.id] += 1;
        if (improvement) player.improvements[improvement] += 1;
        player.management[domain] = { progress: 0, target: 0, paidCost: 0, startedTick: 0 };
        const effect = improvement ? IMPROVEMENT_LABELS[improvement] : upgrade.outcome;
        this.addEvent(domain === 'war' ? 'war' : domain === 'finance' ? 'economy' : 'research', 'action',
          `${player.shortName} completes ${upgrade.name}: ${effect}.`, undefined, player.id);
      }
    }
  }

  private recoveryRequests(
    playerId: PlayerId,
    owned = this.territoriesOf(playerId),
    atWar = this.isAtWar(playerId),
  ): Array<{ territory: SimTerritoryState; restored: number; cost: number }> {
    const cached = this.recoveryPlans.get(playerId);
    if (cached) return cached;
    const player = this.player(playerId);
    if (!player || player.eliminated) return [];
    const warModifier = atWar ? 0.42 : 1;
    const research = 1 + (player.research.discoveries['integrated-logistics'] ?? 0) * 0.01;
    const logistics = (1 + player.upgrades.logistics * 0.06) * (1 + player.improvements.recovery * 0.01);
    const reconstruction = !atWar && this.state.tick < player.recoverySurgeUntilTick ? 1.4 : 1;
    const recoveryScale = research * logistics * reconstruction * warModifier;
    const requests = owned.flatMap((territory) => {
      const missing = Math.max(0, territory.force.maxHp - territory.force.hp);
      if (missing <= 0) return [];
      const occupationModifier = territory.annexedAtTick !== undefined && this.state.tick - territory.annexedAtTick < 52 ? 0.18 : 1;
      const restored = Math.min(missing, territory.force.recovery * recoveryScale * occupationModifier);
      return restored > 0 ? [{ territory, restored, cost: restored * 0.12 }] : [];
    });
    this.recoveryPlans.set(playerId, requests);
    return requests;
  }

  private processPassiveRecovery(): void {
    for (const player of this.state.players) {
      if (player.eliminated) continue;
      const finance = this.financePlanForTick(player.id);
      const maintenanceRatio = finance.requestedMaintenance > 0 ? finance.maintenance / finance.requestedMaintenance : 1;
      const readinessGain = (this.isAtWar(player.id) ? 0.0015 : 0.004) * (0.2 + Math.min(1, maintenanceRatio) * 0.8);
      for (const territory of this.territoriesOf(player.id)) territory.force.readiness = Math.min(1, territory.force.readiness + readinessGain);
      const requests = this.recoveryRequests(player.id);
      const requestedCost = requests.reduce((sum, request) => sum + request.cost, 0);
      const recoveryPayment = this.payFromTreasury(player, Math.min(finance.recovery, requestedCost));
      const fundingRatio = requestedCost > 0 ? Math.min(1, recoveryPayment / requestedCost) : 0;
      for (const request of requests) request.territory.force.hp = Math.min(
        request.territory.force.maxHp,
        request.territory.force.hp + request.restored * fundingRatio,
      );
    }
  }

  private processReinforcement(): void {
    for (const player of this.state.players) {
      if (player.eliminated) continue;
      const request = this.reinforcementRequest(player.id);
      if (!request || player.manpower < 0.005) continue;
      const expansionPayment = this.payFromTreasury(player, this.financePlanForTick(player.id).forceExpansion);
      const affordable = Math.min(request.growth, expansionPayment / 0.48, player.manpower / MILITARY_CASUALTIES_PER_HP);
      if (affordable <= 0.05) continue;
      const target = request.target;
      const previousCapacity = target.force.maxHp;
      const ratio = affordable / Math.max(1, previousCapacity);
      target.force.maxHp += affordable;
      target.force.hp = Math.min(target.force.maxHp, target.force.hp + affordable * 0.32);
      target.force.attack += target.force.attack * ratio * 0.36;
      target.force.defense += target.force.defense * ratio * 0.42;
      target.force.recovery += affordable * 0.0018;
      target.force.readiness = Math.max(0.35, target.force.readiness - ratio * 0.08);
      player.manpower -= affordable * MILITARY_CASUALTIES_PER_HP;
    }
  }

  private reinforcementRequest(playerId: PlayerId, owned = this.territoriesOf(playerId)): { target: SimTerritoryState; growth: number } | undefined {
    if (this.reinforcementPlans.has(playerId)) return this.reinforcementPlans.get(playerId);
    const player = this.player(playerId);
    if (!player || player.eliminated || player.manpower < 0.005) return undefined;
    const target = this.recruitmentTarget(player.id, owned);
    if (!target) {
      this.reinforcementPlans.set(playerId, undefined);
      return undefined;
    }
    const baselineCapacity = owned.reduce((sum, territory) => {
      const country = COUNTRY_BY_ID[territory.id];
      return sum + (country ? forceFromCountry(country, territory.fortification).maxHp : territory.force.maxHp);
    }, 0);
    const budgetScale = 0.72 + player.budget.military * 0.008;
    const mobilizationScale = 1 + player.upgrades.mobilization * 0.04;
    const desiredCapacity = baselineCapacity * budgetScale * mobilizationScale;
    const currentCapacity = owned.reduce((sum, territory) => sum + territory.force.maxHp, 0);
    const gap = desiredCapacity - currentCapacity;
    if (gap <= 0.25) {
      this.reinforcementPlans.set(playerId, undefined);
      return undefined;
    }
    const growth = Math.min(gap, Math.max(0.45, target.force.maxHp * 0.0075), player.manpower / MILITARY_CASUALTIES_PER_HP);
    const request = growth > 0.05 ? { target, growth } : undefined;
    this.reinforcementPlans.set(playerId, request);
    return request;
  }

  private processDevelopment(): void {
    for (const player of this.state.players) {
      if (player.eliminated) continue;
      if (player.isHuman) continue;
      const finance = this.financePlanForTick(player.id);
      if (this.isAtWar(player.id) || finance.mode !== 'normal') continue;
      const candidates = this.territoriesOf(player.id).sort((left, right) => (
        left.infrastructure - right.infrastructure || left.economy - right.economy || left.id.localeCompare(right.id)
      ));
      const target = candidates[0];
      if (!target) continue;
      const cost = 15 + target.infrastructure * 6;
      if (player.treasury - cost < PEACETIME_RESERVE_TARGET || target.infrastructure >= 7) continue;
      player.treasury = Math.max(0, player.treasury - cost);
      target.infrastructure += 1;
      target.economy += 1.1;
      target.industry += 0.5;
      target.stability = Math.min(100, target.stability + 1);
      if (player.isHuman) this.addEvent('economy', 'info', `Infrastructure project completed in ${TERRITORY_BY_ID[target.id]?.name}.`, target.id, player.id);
    }
  }

  private processRelations(): void {
    const borderPairs = this.currentBorderPairs();
    for (const relation of Object.values(this.state.relations)) {
      relation.treaties = [];
      if (relation.status === 'war') continue;
      const grievancePressure = relation.grievances * 0.018;
      const unregulatedBorder = borderPairs.has(relation.id);
      const borderPressure = unregulatedBorder ? (relation.score < 0 ? 0.16 : 0.06) : 0;
      relation.score = Math.max(-100, Math.min(100, relation.score - grievancePressure - borderPressure));
      relation.grievances = Math.max(0, relation.grievances - 0.15);
      if (relation.status === 'truce' && relation.truceUntilTick <= this.state.tick) relation.status = relation.score < -25 ? 'tension' : 'peace';
      else if (relation.status === 'peace' && relation.score < -25) relation.status = 'tension';
      else if (relation.status === 'tension' && relation.score > -16) relation.status = 'peace';
    }

    this.state.offers = [];
  }

  private runAiDirectors(): void {
    const aiPlayers = this.state.players.filter((player) => !player.isHuman && !player.eliminated).sort((left, right) => left.id.localeCompare(right.id));
    const warCandidates: Array<{
      attacker: SimPlayerState;
      target: SimPlayerState;
      relation: RelationState;
      strengthRatio: number;
      naval: boolean;
      priority: number;
    }> = [];
    for (const player of aiPlayers) {
      const atWar = this.isAtWar(player.id);
      const borderRelations = this.borderingPlayers(player.id)
        .map((target) => ({ target, relation: this.relation(player.id, target.id)! }))
        .sort((left, right) => left.relation.score - right.relation.score || left.target.id.localeCompare(right.target.id));
      const mostHostile = borderRelations[0];
      if (atWar) {
        player.stance = player.warExhaustion > 55 ? 'defensive' : 'assertive';
        player.budget = clonePolicy(BUDGET_PRESETS.defense!.policy);
      } else if (mostHostile?.relation.score !== undefined && mostHostile.relation.score < -28) {
        player.stance = 'assertive';
        player.budget = clonePolicy(BUDGET_PRESETS.defense!.policy);
      } else if (player.research.completed.length < 2 && player.science > 40) {
        player.stance = 'balanced';
        player.budget = clonePolicy(BUDGET_PRESETS.research!.policy);
      } else {
        player.stance = 'balanced';
        player.budget = clonePolicy(BUDGET_PRESETS.growth!.policy);
      }

      if (atWar || this.state.tick < 52) continue;
      for (const { target, relation } of borderRelations) {
        if (!this.canDeclareWar(player.id, target.id) || this.isAtWar(target.id)) continue;
        const accessType = this.warAccessType(player.id, target.id);
        const naval = accessType === 'naval';
        const strengthRatio = this.militaryPower(player.id) / Math.max(1, this.militaryPower(target.id));
        const minimumStrength = naval ? 1.18 : 1.03;
        const mobilizationCost = this.warMobilizationCost(player.id, target.id);
        const deliberateEscalation = relation.score <= -38 && relation.grievances >= 8
          && strengthRatio > minimumStrength && player.stability > 50 && player.warExhaustion < 24
          && this.state.tick - relation.lastActionTick >= 44
          && player.treasury >= mobilizationCost;
        if (!deliberateEscalation || relation.truceUntilTick > this.state.tick) continue;
        warCandidates.push({
          attacker: player,
          target,
          relation,
          strengthRatio,
          naval,
          priority: -relation.score + relation.grievances * 0.6 + (strengthRatio - 1) * 28 - (naval ? 5 : 0),
        });
      }
    }

    const latestWarTick = Math.max(
      -1_000,
      ...this.state.wars.map((war) => war.startedTick),
      ...this.state.events.filter((event) => event.kind === 'war').map((event) => event.tick),
    );
    const activeWarCap = Math.max(4, Math.ceil(this.state.players.filter((player) => !player.eliminated).length / 40));
    if (this.state.tick - latestWarTick < 32 || this.state.wars.length >= activeWarCap || warCandidates.length === 0) return;
    warCandidates.sort((left, right) => right.priority - left.priority
      || left.attacker.id.localeCompare(right.attacker.id)
      || left.target.id.localeCompare(right.target.id));
    const candidate = warCandidates[0]!;
    const warChance = Math.min(0.46, 0.24 + Math.max(0, -candidate.relation.score - 38) * 0.01
      + Math.max(0, candidate.strengthRatio - 1.1) * 0.06 - (candidate.naval ? 0.03 : 0));
    if (nextRandom(this.state) < warChance) this.declareWar(candidate.attacker.id, candidate.target.id);
  }

  private processMobilization(): void {
    const activePlayers = this.state.players.filter((player) => !player.eliminated).sort((left, right) => left.id.localeCompare(right.id));
    for (const player of activePlayers) {
      const playerId = player.id;
      const borders = this.territoriesOf(playerId).filter((territory) => (
        (TERRITORY_BY_ID[territory.id]?.neighbors ?? []).some((neighborId) => this.state.territories[neighborId]?.ownerId !== playerId)
      )).map((territory) => {
        const threat = this.borderThreat(territory.id);
        const activeFront = (TERRITORY_BY_ID[territory.id]?.neighbors ?? []).some((neighborId) => {
          const ownerId = this.state.territories[neighborId]?.ownerId;
          return Boolean(ownerId && ownerId !== playerId && this.activeWarBetween(playerId, ownerId));
        });
        const newlyOccupied = territory.annexedAtTick !== undefined && this.state.tick - territory.annexedAtTick < 26;
        const occupiedByEnemy = territory.foreignControl?.controllerId !== undefined;
        const priority = threat * 1.22 - this.effectivePower(playerId, territory.force)
          + (activeFront ? 28 : 0) + (newlyOccupied && activeFront ? 34 : 0)
          + (occupiedByEnemy ? 26 : 0) + (territory.capital && activeFront ? 18 : 0);
        return { territory, threat, activeFront, newlyOccupied, priority };
      })
        .sort((left, right) => (
          right.priority - left.priority
          || left.territory.id.localeCompare(right.territory.id)
        ));
      const targetEntry = borders.find(({ territory, threat, activeFront, newlyOccupied }) => (
        this.effectivePower(playerId, territory.force) < threat * (activeFront ? 1.34 : 1.1)
        || (newlyOccupied && activeFront && territory.force.hp / Math.max(1, territory.force.maxHp) < 0.72)
      ));
      const target = targetEntry?.territory;
      if (!target) continue;

      const reserves = this.territoriesOf(playerId).filter((territory) => {
        if (territory.id === target.id || territory.force.maxHp < 34 || territory.force.hp / territory.force.maxHp < 0.48) return false;
        const localThreat = this.borderThreat(territory.id);
        const sourcePower = this.effectivePower(playerId, territory.force);
        const targetPower = this.effectivePower(playerId, target.force);
        const sourceOnActiveFront = (TERRITORY_BY_ID[territory.id]?.neighbors ?? []).some((neighborId) => {
          const ownerId = this.state.territories[neighborId]?.ownerId;
          return Boolean(ownerId && ownerId !== playerId && this.activeWarBetween(playerId, ownerId));
        });
        const localSafety = sourceOnActiveFront ? Math.max(28, localThreat * 0.42) : Math.max(24, localThreat * 0.8);
        return sourcePower > Math.max(localSafety, targetPower * 1.35);
      })
        .map((territory) => ({ territory, path: this.ownedPath(playerId, territory.id, target.id) }))
        .filter((candidate): candidate is { territory: SimTerritoryState; path: TerritoryId[] } => Boolean(candidate.path?.[1]))
        .sort((left, right) => (
          left.path.length - right.path.length
          || this.effectivePower(playerId, right.territory.force) - this.effectivePower(playerId, left.territory.force)
          || left.territory.id.localeCompare(right.territory.id)
        ));
      const reserve = reserves[0];
      if (!reserve) continue;
      const nextTerritory = this.state.territories[reserve.path[1]!];
      if (!nextTerritory || nextTerritory.ownerId !== playerId) continue;
      const urgentFront = Boolean(targetEntry.activeFront && (targetEntry.newlyOccupied
        || target.force.hp / Math.max(1, target.force.maxHp) < 0.52));
      this.transferForce(reserve.territory, nextTerritory, urgentFront ? 0.095 : 0.055);
    }
  }

  private transferForce(source: SimTerritoryState, target: SimTerritoryState, fraction: number): void {
    const movableCapacity = Math.max(0, source.force.maxHp - 28);
    const movedCapacity = Math.min(movableCapacity, source.force.maxHp * fraction);
    if (movedCapacity < 0.5) return;
    const ratio = movedCapacity / source.force.maxHp;
    const movedHp = Math.min(Math.max(0, source.force.hp - 10), source.force.hp * ratio);
    const movedAttack = source.force.attack * ratio;
    const movedDefense = source.force.defense * ratio;
    const movedRecovery = source.force.recovery * ratio;
    source.force.maxHp -= movedCapacity;
    source.force.hp -= movedHp;
    source.force.attack -= movedAttack;
    source.force.defense -= movedDefense;
    source.force.recovery -= movedRecovery;
    const combinedCapacity = target.force.maxHp + movedCapacity;
    target.force.readiness = (target.force.readiness * target.force.maxHp + source.force.readiness * movedCapacity) / combinedCapacity;
    target.force.maxHp = combinedCapacity;
    target.force.hp = Math.min(target.force.maxHp, target.force.hp + movedHp);
    target.force.attack += movedAttack;
    target.force.defense += movedDefense;
    target.force.recovery += movedRecovery;
  }

  private borderThreat(territoryId: TerritoryId): number {
    const territory = this.state.territories[territoryId];
    if (!territory) return 0;
    return (TERRITORY_BY_ID[territoryId]?.neighbors ?? []).reduce((sum, neighbourId) => {
      const neighbour = this.state.territories[neighbourId];
      if (!neighbour || neighbour.ownerId === territory.ownerId) return sum;
      const relation = this.relation(territory.ownerId, neighbour.ownerId);
      const atWar = Boolean(this.activeWarBetween(territory.ownerId, neighbour.ownerId));
      const hostility = atWar ? 2.8
        : relation?.status === 'tension' ? 1.15 + Math.max(0, -(relation.score + 20)) * 0.018
          : relation && relation.score < 0 ? 0.38 + Math.abs(relation.score) * 0.01 : 0.16;
      const navalExposure = isSeaConnection(territoryId, neighbourId) ? (atWar ? 0.82 : 0.35) : 1;
      return sum + forcePower(neighbour.force) * hostility * navalExposure;
    }, 0);
  }

  private processWars(): void {
    for (const war of [...this.state.wars]) {
      const attacker = this.player(war.attackerId);
      const defender = this.player(war.defenderId);
      if (!attacker || !defender || attacker.eliminated || defender.eliminated) continue;
      const attackerOperation = this.ensureFrontOperation(war, attacker.id, defender.id);
      const defenderOperation = this.ensureFrontOperation(war, defender.id, attacker.id);
      if (!attackerOperation && !defenderOperation) continue;
      const attackerInitiative = attackerOperation
        ? attackerOperation.supply * 32 + attackerOperation.momentum + Math.max(-18, Math.min(18, war.warScore * 0.18)) + nextRandom(this.state) * 14
        : -Infinity;
      const defenderInitiative = defenderOperation
        ? defenderOperation.supply * 32 + defenderOperation.momentum + Math.max(-18, Math.min(18, -war.warScore * 0.18)) + nextRandom(this.state) * 14
        : -Infinity;
      // The country that declares war owns the opening initiative. Afterwards,
      // supply, momentum and battlefield pressure decide who acts.
      const operation = war.battles === 0 && attackerOperation
        ? attackerOperation : attackerInitiative >= defenderInitiative ? attackerOperation : defenderOperation;
      if (!operation) continue;
      const defensiveId = operation.commanderId === attacker.id ? defender.id : attacker.id;
      this.resolveBattlePulse(war, operation.commanderId, defensiveId, operation.sourceId, operation.targetId, operation);
    }
  }

  private ensureFrontOperation(war: WarState, attackerId: PlayerId, defenderId: PlayerId): FrontOperationState | undefined {
    const key = attackerId === war.attackerId ? 'attackerOperation' : 'defenderOperation';
    const current = war[key];
    if (current && this.operationRemainsViable(current, attackerId, defenderId)) {
      const support = this.frontSupport(attackerId, current.sourceId, current.targetId);
      current.supply = this.frontSupply(attackerId, current.sourceId, isSeaConnection(current.sourceId, current.targetId));
      current.supportingForces = support.count;
      return current;
    }
    const failedObjective = current && current.momentum < -4 ? current.targetId : undefined;
    const next = this.findFrontOperation(attackerId, defenderId, failedObjective);
    war[key] = next;
    return next;
  }

  private operationRemainsViable(operation: FrontOperationState, attackerId: PlayerId, defenderId: PlayerId): boolean {
    const source = this.state.territories[operation.sourceId];
    const target = this.state.territories[operation.targetId];
    if (!source || !target || source.ownerId !== attackerId || target.ownerId !== defenderId) return false;
    if (!(TERRITORY_BY_ID[source.id]?.neighbors ?? []).includes(target.id)) return false;
    const sourceHealth = source.force.hp / Math.max(1, source.force.maxHp);
    const freshSource = source.annexedAtTick !== undefined && this.state.tick - source.annexedAtTick < 14;
    return this.state.tick < operation.expiresTick && operation.momentum > -20
      && sourceHealth >= (freshSource ? 0.58 : 0.3) && source.force.readiness >= 0.3;
  }

  private findFrontOperation(attackerId: PlayerId, defenderId: PlayerId, failedObjective?: TerritoryId): FrontOperationState | undefined {
    const attacker = this.player(attackerId);
    if (!attacker) return undefined;
    let best: { sourceId: TerritoryId; targetId: TerritoryId; doctrine: OperationDoctrine; supply: number; supportingForces: number; score: number } | undefined;
    for (const source of this.territoriesOf(attackerId)) {
      const sourceHealth = source.force.hp / Math.max(1, source.force.maxHp);
      const freshSource = source.annexedAtTick !== undefined && this.state.tick - source.annexedAtTick < 14;
      if (source.force.maxHp <= 0 || sourceHealth < (freshSource ? 0.58 : 0.3) || source.force.readiness < 0.3) continue;
      for (const targetId of TERRITORY_BY_ID[source.id]?.neighbors ?? []) {
        const target = this.state.territories[targetId];
        if (!target || target.ownerId !== defenderId) continue;
        const naval = isSeaConnection(source.id, targetId);
        const navalModifier = naval ? 0.82 : 1;
        const supply = this.frontSupply(attackerId, source.id, naval);
        const support = this.frontSupport(attackerId, source.id, targetId);
        const sourcePower = (this.effectivePower(attackerId, source.force) + support.power) * 0.68 * navalModifier * supply;
        const targetPower = this.effectivePower(defenderId, target.force) * DEFENSIVE_POSITION_BONUS;
        const ratio = sourcePower / Math.max(1, targetPower);
        const minimumRatio = attacker.isHuman ? 0.22 : 0.3;
        if (ratio < minimumRatio) continue;
        const targetHealth = target.force.hp / Math.max(1, target.force.maxHp);
        const targetDepth = this.ownedPath(defenderId, target.id, this.player(defenderId)?.capitalId ?? target.id)?.length ?? 12;
        const recentlyCaptured = target.annexedAtTick !== undefined && this.state.tick - target.annexedAtTick < 26;
        const sourceExposure = Math.max(0, this.borderThreat(source.id) - this.effectivePower(attackerId, source.force));
        const continuity = target.foreignControl?.controllerId === attackerId ? target.foreignControl.share * 26 : 0;
        const strategicValue = target.economy * 0.18 + target.industry * 0.9 + target.infrastructure * 1.35
          + (target.capital ? 42 : 0) + Math.max(0, 16 - targetDepth * 2);
        const vulnerability = (1 - targetHealth) * 24 + (1 - target.force.readiness) * 8;
        const doctrine = this.selectOperationDoctrine(attackerId, defenderId, source, target, sourcePower, targetPower, recentlyCaptured);
        const score = Math.log(Math.max(0.08, ratio)) * 22 + strategicValue + vulnerability + continuity
          + support.count * 5 + supply * 18 + (recentlyCaptured ? 18 : 0)
          - sourceExposure * 0.055 - (naval ? 6 : 0) - (freshSource ? 20 : 0)
          - (failedObjective === targetId ? 22 : 0);
        if (!best || score > best.score) best = { sourceId: source.id, targetId, doctrine, supply, supportingForces: support.count, score };
      }
    }
    if (!best) return undefined;
    return {
      commanderId: attackerId,
      sourceId: best.sourceId,
      targetId: best.targetId,
      doctrine: best.doctrine,
      startedTick: this.state.tick,
      expiresTick: this.state.tick + 12 + Math.floor(nextRandom(this.state) * 10),
      momentum: 0,
      supply: best.supply,
      supportingForces: best.supportingForces,
    };
  }

  private selectOperationDoctrine(
    attackerId: PlayerId,
    defenderId: PlayerId,
    source: SimTerritoryState,
    target: SimTerritoryState,
    sourcePower: number,
    targetPower: number,
    recentlyCaptured: boolean,
  ): OperationDoctrine {
    const terrain = terrainForTerritory(target.id);
    if (recentlyCaptured) return 'counteroffensive';
    if (target.capital || target.fortification >= 2 || terrain === 'urban' || terrain === 'mountain') return 'siege';
    if (source.annexedAtTick !== undefined && this.state.tick - source.annexedAtTick < 26) return 'consolidation';
    if (sourcePower > targetPower * 1.18 && (terrain === 'plains' || terrain === 'desert' || terrain === 'coastal')) return 'breakthrough';
    return 'pressure';
  }

  private frontSupport(attackerId: PlayerId, sourceId: TerritoryId, targetId: TerritoryId): { count: number; power: number } {
    const supporters = (TERRITORY_BY_ID[targetId]?.neighbors ?? [])
      .filter((territoryId) => territoryId !== sourceId)
      .map((territoryId) => this.state.territories[territoryId])
      .filter((territory): territory is SimTerritoryState => Boolean(
        territory && territory.ownerId === attackerId
        && territory.force.hp / Math.max(1, territory.force.maxHp) >= 0.38,
      ));
    return {
      count: supporters.length,
      power: supporters.reduce((sum, territory) => sum + this.effectivePower(attackerId, territory.force) * 0.24, 0),
    };
  }

  private frontSupply(playerId: PlayerId, territoryId: TerritoryId, naval: boolean): number {
    const player = this.player(playerId);
    const territory = this.state.territories[territoryId];
    if (!player || !territory || territory.ownerId !== playerId) return 0.25;
    const path = this.ownedPath(playerId, player.capitalId, territoryId);
    const distance = path ? Math.max(0, path.length - 1) : 12;
    const pathInfrastructure = path?.reduce((sum, id) => sum + (this.state.territories[id]?.infrastructure ?? 1), 0) ?? territory.infrastructure;
    const averageInfrastructure = pathInfrastructure / Math.max(1, path?.length ?? 1);
    const freshPenalty = territory.annexedAtTick !== undefined && this.state.tick - territory.annexedAtTick < 26 ? 0.82 : 1;
    const occupationPenalty = territory.foreignControl ? Math.max(0.62, 1 - territory.foreignControl.share * 0.42) : 1;
    const connected = path ? 1 : 0.58;
    return Math.max(0.25, Math.min(1.12,
      (0.78 + averageInfrastructure * 0.045 - distance * 0.025)
      * (0.72 + territory.force.readiness * 0.28) * freshPenalty * occupationPenalty * connected * (naval ? 0.82 : 1),
    ));
  }

  private selectBattleTactic(
    attackerId: PlayerId,
    defenderId: PlayerId,
    source: ForceState,
    target: ForceState,
    targetId: TerritoryId,
    operation: FrontOperationState,
  ): BattleTactic {
    const terrain = terrainForTerritory(targetId);
    const attacker = this.player(attackerId);
    const defender = this.player(defenderId);
    if (operation.doctrine === 'counteroffensive') return 'counterattack';
    if (operation.doctrine === 'siege') return 'siege';
    if (operation.doctrine === 'breakthrough') {
      return forcePower(source) > forcePower(target) * 1.38 ? 'encirclement' : 'shock-offensive';
    }
    if (operation.doctrine === 'consolidation') return 'attrition';
    if (defender?.stance === 'defensive' && (terrain === 'urban' || terrain === 'mountain')) return 'hold-the-line';
    if (attacker?.stance === 'defensive') return 'counterattack';
    if (target.defense > source.attack * 1.08 || targetId === defender?.capitalId) return 'siege';
    if (source.attack > target.defense * 1.2 && (terrain === 'plains' || terrain === 'desert')) return 'shock-offensive';
    if (forcePower(source) > forcePower(target) * 1.35) return 'encirclement';
    return 'attrition';
  }

  private advanceForeignControl(
    war: WarState,
    target: SimTerritoryState,
    controllerId: PlayerId,
    sourceId: TerritoryId,
    targetId: TerritoryId,
    damage: number,
    defenderDamage: number,
    attackerPower: number,
    defenderPower: number,
    attackerSupply: number,
    defenderSupply: number,
  ): { gained: number; share: number } {
    if (target.ownerId === controllerId) return { gained: 0, share: 0 };
    const sourcePoint = TERRITORY_BY_ID[sourceId];
    const targetPoint = TERRITORY_BY_ID[targetId];
    let dx = (sourcePoint?.x ?? 0) - (targetPoint?.x ?? 0);
    if (Math.abs(dx) > 640) dx *= -1;
    const dy = (sourcePoint?.y ?? 0) - (targetPoint?.y ?? 0);
    const axis: 'horizontal' | 'vertical' = Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical';
    const fromEdge: 'start' | 'end' = (axis === 'horizontal' ? dx : dy) < 0 ? 'start' : 'end';
    const existing = target.foreignControl?.controllerId === controllerId ? target.foreignControl : undefined;
    const previousShare = existing?.share ?? 0;
    const performance = damage / Math.max(0.12, defenderDamage);
    const supplyBalance = attackerSupply / Math.max(0.25, defenderSupply);
    if (target.force.hp > 0 && performance * Math.sqrt(supplyBalance) < 1.02) {
      const retreat = existing
        ? Math.min(previousShare, Math.min(0.026, (1.02 - performance * Math.sqrt(supplyBalance)) * 0.018
          + defenderDamage / Math.max(45, target.force.maxHp) * 0.16))
        : 0;
      const share = Math.max(0, previousShare - retreat);
      if (existing && share > 0.006) target.foreignControl = { ...existing, share };
      else if (existing) target.foreignControl = undefined;
      return { gained: -retreat, share };
    }
    const duration = Math.max(0, this.state.tick - war.startedTick);
    const timeGate = Math.max(0, Math.min(1, (duration - 4) / 78));
    const defenderCollapse = 1 - target.force.hp / Math.max(1, target.force.maxHp);
    const collapseGate = defenderCollapse * Math.max(0.15, Math.min(1, duration / 52));
    const phaseRate = 0.22 + Math.pow(timeGate, 1.35) * 0.78;
    const operationalEdge = Math.max(0.35, Math.min(1.45, performance * Math.sqrt(supplyBalance)));
    const rawAdvance = damage / Math.max(30, target.force.maxHp) * 0.72 * operationalEdge
      + (attackerPower * attackerSupply > defenderPower * defenderSupply ? 0.004 : 0.0008);
    const advance = Math.min(0.035, rawAdvance) * phaseRate;
    // A front can take footholds early, but broad territorial control only becomes
    // possible after sustained attrition and a genuine collapse of the defender.
    const phaseCap = Math.min(0.94, 0.08
      + Math.pow(timeGate, 1.6) * 0.45
      + Math.pow(collapseGate, 1.5) * 0.42);
    const share = Math.min(phaseCap, previousShare + advance);
    target.foreignControl = {
      controllerId,
      share,
      axis: existing?.axis ?? axis,
      fromEdge: existing?.fromEdge ?? fromEdge,
      establishedTick: existing?.establishedTick ?? this.state.tick,
    };
    return { gained: share - previousShare, share };
  }

  private resolveBattlePulse(
    war: WarState,
    attackerId: PlayerId,
    defenderId: PlayerId,
    sourceId: TerritoryId,
    targetId: TerritoryId,
    operation: FrontOperationState,
  ): void {
    const source = this.state.territories[sourceId];
    const target = this.state.territories[targetId];
    if (!source || !target || source.ownerId !== attackerId || target.ownerId !== defenderId) return;
    const terrain = terrainForTerritory(targetId);
    const tactic = this.selectBattleTactic(attackerId, defenderId, source.force, target.force, targetId, operation);
    const navalModifier = isSeaConnection(sourceId, targetId) ? 0.82 : 1;
    const support = this.frontSupport(attackerId, sourceId, targetId);
    const attackerSupply = this.frontSupply(attackerId, sourceId, navalModifier < 1);
    const defenderSupply = this.frontSupply(defenderId, targetId, false);
    operation.supply = attackerSupply;
    operation.supportingForces = support.count;
    const attackerPower = (this.effectivePower(attackerId, source.force) + support.power) * 0.68 * navalModifier * attackerSupply;
    const defenderPower = this.effectivePower(defenderId, target.force) * DEFENSIVE_POSITION_BONUS * defenderSupply;
    const terrainDefense: Record<ReturnType<typeof terrainForTerritory>, number> = {
      plains: 1, desert: 1.03, coastal: 1.07, urban: 1.2, mountain: 1.26, jungle: 1.16, arctic: 1.13,
    };
    const attackTactic = tactic === 'shock-offensive' ? 1.2 : tactic === 'encirclement' ? 1.15 : tactic === 'siege' ? 1.11
      : tactic === 'counterattack' ? 1.08 : 1.02;
    const counterTactic = tactic === 'siege' ? 0.82 : tactic === 'shock-offensive' ? 1.1 : tactic === 'hold-the-line' ? 1.12 : 1;
    const defenderTactic = tactic === 'hold-the-line' ? 1.2 : 1;
    const attackerHealth = source.force.hp / Math.max(1, source.force.maxHp);
    const defenderHealth = target.force.hp / Math.max(1, target.force.maxHp);
    const supportModifier = 1 + Math.min(0.22, support.count * 0.07);
    const attackVariance = 0.92 + nextRandom(this.state) * 0.16;
    const defenseVariance = 0.92 + nextRandom(this.state) * 0.16;
    const attackerAttack = this.effectiveAttack(attackerId, source.force) * 0.68 * navalModifier
      * (0.42 + attackerHealth * 0.58) * source.force.readiness * (0.64 + attackerSupply * 0.36) * supportModifier;
    const defenderAttack = this.effectiveAttack(defenderId, target.force) * (0.08 + defenderHealth * 0.92)
      * target.force.readiness * (0.7 + defenderSupply * 0.3);
    const defenderDefense = this.effectiveDefense(defenderId, target.force) * DEFENSIVE_POSITION_BONUS * terrainDefense[terrain]
      * defenderTactic * (1 + target.fortification * 0.06) * (0.7 + defenderSupply * 0.3);
    const attackerDefense = this.effectiveDefense(attackerId, source.force) * 0.68 * (0.72 + attackerSupply * 0.28);
    const attackerDamage = Math.max(0.18, attackerAttack * 0.31 * attackTactic * attackVariance * (78 / (78 + defenderDefense)));
    const defenderDamage = target.force.hp <= 0 ? 0.06 : Math.max(0.16, defenderAttack * 0.23 * counterTactic * defenseVariance * (78 / (78 + attackerDefense)));
    target.force.hp = Math.max(0, target.force.hp - attackerDamage);
    source.force.hp = Math.max(0, source.force.hp - defenderDamage);
    source.force.readiness = Math.max(0.28, source.force.readiness - 0.0025 - defenderDamage / Math.max(80, source.force.maxHp) * 0.014);
    target.force.readiness = Math.max(0.25, target.force.readiness - 0.002 - attackerDamage / Math.max(80, target.force.maxHp) * 0.012);
    const attacker = this.player(attackerId)!;
    const defender = this.player(defenderId)!;
    const attackerCasualtyModifier = tactic === 'shock-offensive' ? 1.14 : tactic === 'siege' ? 0.88 : 1;
    const defenderCasualtyModifier = tactic === 'encirclement' ? 1.18 : tactic === 'siege' ? 1.08 : 1;
    const attackerMilitaryLoss = Math.min(attacker.manpower, defenderDamage * MILITARY_CASUALTIES_PER_HP * attackerCasualtyModifier);
    const defenderMilitaryLoss = Math.min(defender.manpower, attackerDamage * MILITARY_CASUALTIES_PER_HP * defenderCasualtyModifier);
    attacker.manpower = Math.max(0, attacker.manpower - attackerMilitaryLoss);
    defender.manpower = Math.max(0, defender.manpower - defenderMilitaryLoss);
    const civilianRisk = (terrain === 'urban' ? 1.45 : terrain === 'jungle' ? 1.15 : 1) * (tactic === 'siege' ? 1.35 : 1);
    const attackerPopulationLoss = Math.min(source.population * 0.00045, defenderDamage * 0.00032);
    const defenderPopulationLoss = Math.min(target.population * 0.0007, attackerDamage * 0.00048 * civilianRisk);
    const economicDamage = Math.min(target.economy * 0.0015, attackerDamage * 0.0045 * civilianRisk);
    source.population = Math.max(0.01, source.population - attackerPopulationLoss);
    target.population = Math.max(0.01, target.population - defenderPopulationLoss);
    target.economy = Math.max(1, target.economy - economicDamage);
    target.stability = Math.max(8, target.stability - 0.015 - attackerDamage * 0.008);
    const control = this.advanceForeignControl(
      war, target, attackerId, sourceId, targetId, attackerDamage, defenderDamage,
      attackerPower, defenderPower, attackerSupply, defenderSupply,
    );
    const battleBalance = (attackerDamage - defenderDamage) / Math.max(0.5, attackerDamage + defenderDamage) * 12
      + control.gained * 180;
    operation.momentum = Math.max(-30, Math.min(30, operation.momentum * 0.7 + battleBalance));
    if (operation.momentum < -8) operation.expiresTick = Math.min(operation.expiresTick, this.state.tick + 2);
    let conquered = false;
    const capturedCapital = target.capital;
    // HP is the actual military contest. Once the defending regional army is
    // destroyed, that country/region falls; a multi-region empire continues with
    // its surviving regional forces.
    if (target.force.hp <= 0 && source.force.hp > Math.max(8, source.force.maxHp * 0.1)) {
      conquered = true;
      const occupationCapacity = Math.max(20, Math.min(target.force.maxHp * 0.34, source.force.maxHp * 0.28));
      const capacityRatio = Math.min(0.28, occupationCapacity / Math.max(1, source.force.maxHp));
      const occupationHp = Math.max(6, Math.min(occupationCapacity * 0.32, source.force.hp * 0.16));
      const occupationAttack = Math.max(2, source.force.attack * capacityRatio);
      const occupationDefense = Math.max(2, source.force.defense * capacityRatio);
      const occupationRecovery = Math.max(0.08, source.force.recovery * capacityRatio);
      source.force.maxHp = Math.max(12, source.force.maxHp - occupationCapacity);
      source.force.hp = Math.min(source.force.maxHp, Math.max(6, source.force.hp - occupationHp));
      source.force.attack = Math.max(2, source.force.attack - occupationAttack);
      source.force.defense = Math.max(2, source.force.defense - occupationDefense);
      source.force.recovery = Math.max(0.06, source.force.recovery - occupationRecovery);
      target.force = {
        hp: occupationHp,
        maxHp: occupationCapacity,
        attack: occupationAttack,
        defense: occupationDefense,
        readiness: 0.4,
        recovery: occupationRecovery,
      };
      target.ownerId = attackerId;
      target.foreignControl = undefined;
      target.annexedAtTick = this.state.tick;
      target.stability = Math.max(18, target.stability - 24);
      target.fortification = Math.max(0, target.fortification - 1);
      const occupier = this.player(attackerId);
      if (occupier) {
        occupier.treasury += Math.min(18, target.economy * 0.28);
        occupier.stability = Math.max(20, occupier.stability - 0.8);
      }
      this.relocateCapitalIfNeeded(defenderId, targetId);
    }

    const attackerIsOriginal = attackerId === war.attackerId;
    const territoryValue = target.economy * 0.35 + (capturedCapital ? 10 : 0);
    const scoreDelta = conquered ? 7 + territoryValue : 0.12 * (attackerDamage - defenderDamage);
    war.warScore += attackerIsOriginal ? scoreDelta : -scoreDelta;
    war.attackerLosses += attackerIsOriginal ? defenderDamage : attackerDamage;
    war.defenderLosses += attackerIsOriginal ? attackerDamage : defenderDamage;
    war.attackerMilitaryLoss += attackerIsOriginal ? attackerMilitaryLoss : defenderMilitaryLoss;
    war.defenderMilitaryLoss += attackerIsOriginal ? defenderMilitaryLoss : attackerMilitaryLoss;
    war.attackerPopulationLoss += attackerIsOriginal ? attackerPopulationLoss : defenderPopulationLoss;
    war.defenderPopulationLoss += attackerIsOriginal ? defenderPopulationLoss : attackerPopulationLoss;
    war.economicDamage += economicDamage;
    war.lastBattleTick = this.state.tick;
    war.battles += 1;
    attacker.warExhaustion = Math.min(100, attacker.warExhaustion + defenderDamage / Math.max(8, source.force.maxHp) * 5 + 0.08);
    defender.warExhaustion = Math.min(100, defender.warExhaustion + attackerDamage / Math.max(8, target.force.maxHp) * 6 + (conquered ? 1.4 : 0.08));

    const battleEvent: BattleEvent = {
      warId: war.id,
      sourceId,
      targetId,
      attackerId,
      defenderId,
      attackerDamageDealt: attackerDamage,
      defenderDamageDealt: defenderDamage,
      attackerLosses: defenderDamage,
      defenderLosses: attackerDamage,
      attackerMilitaryLoss,
      defenderMilitaryLoss,
      attackerPopulationLoss,
      defenderPopulationLoss,
      economicDamage,
      controlGained: control.gained,
      foreignControlShare: conquered ? 1 : control.share,
      conquered,
      terrain,
      tactic,
      phase: tactic === 'siege' ? 'bombardment'
        : tactic === 'shock-offensive' || tactic === 'encirclement' ? 'breakthrough'
          : tactic === 'counterattack' ? 'counterattack' : 'assault',
      attackerPower,
      defenderPower,
      operation: operation.doctrine,
      attackerSupply,
      defenderSupply,
      momentum: operation.momentum,
      supportingForces: support.count,
      tick: this.state.tick,
    };
    const defenderEliminated = conquered && this.territoriesOf(defenderId).length === 0;
    const message = conquered
      ? defenderEliminated
        ? `${attacker.shortName} annexes ${TERRITORY_BY_ID[targetId]?.name}; ${defender.shortName} is absorbed into its empire.`
        : `${attacker.shortName} captures ${TERRITORY_BY_ID[targetId]?.name} from ${defender.shortName}.`
      : `${operation.doctrine.replaceAll('-', ' ')} at ${TERRITORY_BY_ID[targetId]?.name}: ${attackerDamage.toFixed(1)} / ${defenderDamage.toFixed(1)} HP; ${control.gained > 0.002 ? `front advances ${Math.round(control.gained * 100)}%` : control.gained < -0.002 ? `front retreats ${Math.round(Math.abs(control.gained) * 100)}%` : 'front holds'}.`;
    const humanRelevant = attacker.isHuman || defender.isHuman;
    if (conquered || (humanRelevant && (war.battles % 4 === 0 || Math.abs(control.gained) >= 0.008))
      || (!humanRelevant && (war.battles % 12 === 0 || Math.abs(control.gained) >= 0.015))) {
      this.addEvent(conquered ? 'conquest' : 'battle', conquered ? 'action' : 'info', message, targetId, attackerId);
    }
    this.checkElimination(defenderId);
    this.emit({ reason: conquered ? 'conquest' : 'battle', battle: battleEvent, critical: conquered && (attacker.isHuman || defender.isHuman) });
  }

  private processWarClosures(): void {
    for (const war of [...this.state.wars]) {
      const duration = this.state.tick - war.startedTick;
      const attackerHp = coalitionHp(this.state, war.attackerId).current;
      const defenderHp = coalitionHp(this.state, war.defenderId).current;
      if (attackerHp <= 0.000001 && defenderHp <= 0.000001) {
        this.endWar(war, 'Mutual military exhaustion ended the conflict.');
        continue;
      }
      const staleFront = this.state.tick - war.lastBattleTick >= 48;
      const disconnectedFront = !this.sharesBorder(war.attackerId, war.defenderId);
      if ((staleFront || disconnectedFront) && duration >= 52) {
        this.endWar(war, disconnectedFront
          ? 'Conflict closed after the opposing fronts lost all legal contact.'
          : 'Conflict closed after a prolonged period without a legal battle front.');
      }
    }
  }

  private endWar(war: WarState, reason: string): void {
    this.state.wars = this.state.wars.filter((candidate) => candidate.id !== war.id);
    this.state.offers = this.state.offers.filter((offer) => !(
      (offer.fromId === war.attackerId && offer.toId === war.defenderId)
      || (offer.fromId === war.defenderId && offer.toId === war.attackerId)
    ));
    const relation = this.relation(war.attackerId, war.defenderId);
    if (relation) {
      relation.status = 'truce';
      relation.truceUntilTick = this.state.tick + 26;
      relation.lastActionTick = this.state.tick;
      relation.grievances += 18;
    }
    for (const playerId of [war.attackerId, war.defenderId]) {
      const player = this.player(playerId);
      if (!player) continue;
      player.warExhaustion *= 0.65;
      player.recoverySurgeUntilTick = Math.max(player.recoverySurgeUntilTick, this.state.tick + 26);
    }
    this.addEvent('war', 'action', `${this.player(war.attackerId)?.shortName} and ${this.player(war.defenderId)?.shortName}: ${reason}`);
  }

  private sharesBorder(leftId: PlayerId, rightId: PlayerId): boolean {
    return this.territoriesOf(leftId).some((territory) => (
      TERRITORY_BY_ID[territory.id]?.neighbors.some((neighborId) => this.state.territories[neighborId]?.ownerId === rightId)
    ));
  }

  private ownedPath(playerId: PlayerId, startId: TerritoryId, targetId: TerritoryId): TerritoryId[] | undefined {
    const queue: TerritoryId[] = [startId];
    const previous = new Map<TerritoryId, TerritoryId | undefined>([[startId, undefined]]);
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === targetId) break;
      for (const neighborId of TERRITORY_BY_ID[current]?.neighbors ?? []) {
        if (previous.has(neighborId) || this.state.territories[neighborId]?.ownerId !== playerId) continue;
        previous.set(neighborId, current);
        queue.push(neighborId);
      }
    }
    if (!previous.has(targetId)) return undefined;
    const path: TerritoryId[] = [];
    let current: TerritoryId | undefined = targetId;
    while (current !== undefined) {
      path.push(current);
      current = previous.get(current);
    }
    return path.reverse();
  }

  private borderingPlayers(playerId: PlayerId): SimPlayerState[] {
    const ownerIds = new Set<PlayerId>();
    for (const territory of this.territoriesOf(playerId)) {
      for (const neighborId of TERRITORY_BY_ID[territory.id]?.neighbors ?? []) {
        const ownerId = this.state.territories[neighborId]?.ownerId;
        if (ownerId && ownerId !== playerId) ownerIds.add(ownerId);
      }
    }
    return [...ownerIds].map((ownerId) => this.player(ownerId)).filter((player): player is SimPlayerState => Boolean(player && !player.eliminated));
  }

  private currentBorderPairs(): Set<string> {
    const pairs = new Set<string>();
    for (const territory of TERRITORIES) {
      const ownerId = this.state.territories[territory.id]?.ownerId;
      if (!ownerId) continue;
      for (const neighborId of territory.neighbors) {
        const neighborOwnerId = this.state.territories[neighborId]?.ownerId;
        if (neighborOwnerId && neighborOwnerId !== ownerId) pairs.add(relationKey(ownerId, neighborOwnerId));
      }
    }
    return pairs;
  }

  private isAtWar(playerId: PlayerId): boolean {
    return this.state.wars.some((war) => war.attackerId === playerId || war.defenderId === playerId);
  }

  effectiveAttack(playerId: PlayerId, force: ForceState): number {
    const player = this.player(playerId);
    const weapons = (player?.upgrades.weapons ?? 0) * 0.03;
    const improvement = (player?.improvements.attack ?? 0) * 0.01;
    return force.attack * (1 + weapons + improvement);
  }

  effectiveDefense(playerId: PlayerId, force: ForceState): number {
    const player = this.player(playerId);
    const defenceSystems = (player?.upgrades['defence-systems'] ?? 0) * 0.03;
    const improvement = (player?.improvements.defense ?? 0) * 0.01;
    return force.defense * (1 + defenceSystems + improvement);
  }

  effectiveRecovery(playerId: PlayerId, force: ForceState): number {
    const player = this.player(playerId);
    const research = 1 + (player?.research.discoveries['integrated-logistics'] ?? 0) * 0.01;
    const logistics = (1 + (player?.upgrades.logistics ?? 0) * 0.06) * (1 + (player?.improvements.recovery ?? 0) * 0.01);
    const reconstruction = player && !this.isAtWar(playerId) && this.state.tick < player.recoverySurgeUntilTick ? 1.4 : 1;
    return force.recovery * research * logistics * reconstruction;
  }

  effectivePower(playerId: PlayerId, force: ForceState): number {
    const health = force.maxHp > 0 ? force.hp / force.maxHp : 0;
    return (force.hp * 0.12 + this.effectiveAttack(playerId, force) * 2.5 + this.effectiveDefense(playerId, force) * 1.9)
      * (0.45 + health * 0.55) * (0.72 + force.readiness * 0.28);
  }

  private militaryPower(playerId: PlayerId): number {
    return this.territoriesOf(playerId).reduce((sum, territory) => sum + this.effectivePower(playerId, territory.force), 0);
  }

  private recruitmentTarget(playerId: PlayerId, territories = this.territoriesOf(playerId)): SimTerritoryState | undefined {
    const owned = territories.filter((territory) => (
      territory.annexedAtTick === undefined || this.state.tick - territory.annexedAtTick >= 26
    ));
    return [...owned].sort((left, right) => {
      const leftHostile = this.hostileNeighborPower(left.id);
      const rightHostile = this.hostileNeighborPower(right.id);
      const leftThreat = leftHostile * 2.2 + this.enemyNeighborPower(left.id) * 0.12 - forcePower(left.force) + (left.capital ? 8 : 0);
      const rightThreat = rightHostile * 2.2 + this.enemyNeighborPower(right.id) * 0.12 - forcePower(right.force) + (right.capital ? 8 : 0);
      return rightThreat - leftThreat || left.id.localeCompare(right.id);
    })[0];
  }

  private hostileNeighborPower(territoryId: TerritoryId): number {
    const territory = this.state.territories[territoryId];
    if (!territory) return 0;
    return (TERRITORY_BY_ID[territoryId]?.neighbors ?? []).reduce((sum, neighborId) => {
      const neighbor = this.state.territories[neighborId];
      return sum + (neighbor && neighbor.ownerId !== territory.ownerId && this.activeWarBetween(territory.ownerId, neighbor.ownerId)
        ? forcePower(neighbor.force) * (isSeaConnection(territoryId, neighborId) ? 0.82 : 1) : 0);
    }, 0);
  }

  private enemyNeighborPower(territoryId: TerritoryId): number {
    const territory = this.state.territories[territoryId];
    if (!territory) return 0;
    return (TERRITORY_BY_ID[territoryId]?.neighbors ?? []).reduce((sum, neighborId) => {
      const neighbor = this.state.territories[neighborId];
      return sum + (neighbor && neighbor.ownerId !== territory.ownerId
        ? forcePower(neighbor.force) * (isSeaConnection(territoryId, neighborId) ? 0.35 : 1) : 0);
    }, 0);
  }

  private relocateCapitalIfNeeded(playerId: PlayerId, capturedId: TerritoryId): void {
    const player = this.player(playerId);
    if (!player || player.capitalId !== capturedId) return;
    const remaining = this.territoriesOf(playerId).filter((territory) => territory.id !== capturedId);
    const next = [...remaining].sort((left, right) => right.economy + right.industry - (left.economy + left.industry))[0];
    this.state.territories[capturedId]!.capital = false;
    if (next) {
      next.capital = true;
      player.capitalId = next.id;
      this.addEvent('critical', 'critical', `${player.name} moves its national command centre to ${TERRITORY_BY_ID[next.id]?.name}.`, next.id, player.id);
    }
  }

  private checkElimination(playerId: PlayerId): void {
    const player = this.player(playerId);
    if (!player || this.territoriesOf(playerId).length > 0) return;
    player.eliminated = true;
    for (const territory of Object.values(this.state.territories)) {
      if (territory.foreignControl?.controllerId === playerId) territory.foreignControl = undefined;
    }
    this.addEvent('critical', 'critical', `${player.name} has lost all territory and ceases to exist.`, undefined, playerId);
    for (const relation of Object.values(this.state.relations)) {
      if (relation.leftId === playerId || relation.rightId === playerId) relation.treaties = [];
    }
    for (const offer of this.state.offers) {
      if (offer.status === 'pending' && (offer.fromId === playerId || offer.toId === playerId)) offer.status = 'expired';
    }
    for (const war of [...this.state.wars]) {
      if (war.attackerId === playerId || war.defenderId === playerId) this.endWar(war, 'One country has lost all of its territory.');
    }
  }

  private recomputePlayerMetrics(): void {
    const economyTotals = new Map<PlayerId, number>();
    const industryTotals = new Map<PlayerId, number>();
    const scienceTotals = new Map<PlayerId, number>();
    const ownedCounts = new Map<PlayerId, number>();
    for (const territory of Object.values(this.state.territories)) {
      const foreignShare = territory.foreignControl?.share ?? 0;
      const ownerId = territory.ownerId;
      const baseEconomy = territory.economy * (0.72 + territory.infrastructure * 0.065) * (territory.stability / 100);
      ownedCounts.set(ownerId, (ownedCounts.get(ownerId) ?? 0) + 1);
      economyTotals.set(ownerId, (economyTotals.get(ownerId) ?? 0) + baseEconomy * (1 - foreignShare));
      industryTotals.set(ownerId, (industryTotals.get(ownerId) ?? 0) + territory.industry * (1 - foreignShare));
      scienceTotals.set(ownerId, (scienceTotals.get(ownerId) ?? 0) + territory.research * (1 - foreignShare));
      if (territory.foreignControl) {
        const controllerId = territory.foreignControl.controllerId;
        economyTotals.set(controllerId, (economyTotals.get(controllerId) ?? 0) + baseEconomy * foreignShare * 0.62);
        industryTotals.set(controllerId, (industryTotals.get(controllerId) ?? 0) + territory.industry * foreignShare * 0.48);
        scienceTotals.set(controllerId, (scienceTotals.get(controllerId) ?? 0) + territory.research * foreignShare * 0.35);
      }
    }
    for (const player of this.state.players) {
      const gridModifier = 1 + (player.research.discoveries['resilient-grids'] ?? 0) * 0.01;
      const warModifier = this.isAtWar(player.id) ? 0.88 : 1;
      player.annualIncome = (economyTotals.get(player.id) ?? 0) * gridModifier * warModifier;
      player.industry = (industryTotals.get(player.id) ?? 0) * (1 + player.improvements.industry * 0.01);
      player.science = scienceTotals.get(player.id) ?? 0;
      if ((ownedCounts.get(player.id) ?? 0) === 0) player.eliminated = true;
    }
  }

  private checkVictory(): void {
    const surviving = this.state.players.filter((player) => !player.eliminated);
    if (surviving.length === 1) {
      const winner = surviving[0]!;
      this.state.winnerId = winner.id;
      this.state.gameOver = true;
      this.state.speed = 0;
      this.addEvent('critical', 'critical', `${winner.name} has conquered the entire world map. The campaign is complete.`, undefined, winner.id);
    }
  }

  private addEvent(
    kind: WorldState['events'][number]['kind'],
    severity: WorldState['events'][number]['severity'],
    message: string,
    territoryId?: TerritoryId,
    playerId?: PlayerId,
  ): void {
    const humanOwnsTerritory = territoryId ? this.state.territories[territoryId]?.ownerId === this.state.humanPlayerId : false;
    const humanRelevant = playerId === this.state.humanPlayerId || humanOwnsTerritory;
    this.state.events.push({
      id: this.state.nextEventId++,
      tick: this.state.tick,
      kind,
      severity,
      message,
      territoryId,
      playerId,
      unread: severity !== 'info' && humanRelevant,
    });
  }

  private pruneHistory(): void {
    if (this.state.events.length > 220) this.state.events.splice(0, this.state.events.length - 220);
    if (this.state.offers.length > 80) this.state.offers.splice(0, this.state.offers.length - 80);
  }
}

export function worldDateLabel(engine: WorldEngine): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(engine.date())
    .toUpperCase();
}

export function worldInvariantErrors(state: WorldState): string[] {
  const errors: string[] = [];
  const players = new Set(state.players.map((player) => player.id));
  for (const territory of TERRITORIES) {
    const value = state.territories[territory.id];
    if (!value) errors.push(`${territory.id}: ontbreekt`);
    else {
      if (!players.has(value.ownerId)) errors.push(`${territory.id}: onbekende eigenaar`);
      for (const amount of [value.economy, value.industry, value.research, value.infrastructure, value.population, value.stability, value.fortification]) {
      if (!Number.isFinite(amount) || amount < 0) errors.push(`${territory.id}: invalid territory value`);
      }
      const forceValues = [value.force.hp, value.force.maxHp, value.force.attack, value.force.defense, value.force.readiness, value.force.recovery];
      if (forceValues.some((amount) => !Number.isFinite(amount) || amount < 0)) errors.push(`${territory.id}: invalid force value`);
      if (value.force.maxHp <= 0 || value.force.hp > value.force.maxHp) errors.push(`${territory.id}: invalid force HP`);
      if (value.force.readiness > 1) errors.push(`${territory.id}: readiness above maximum`);
      if (value.foreignControl) {
        if (!players.has(value.foreignControl.controllerId) || value.foreignControl.controllerId === value.ownerId) errors.push(`${territory.id}: invalid foreign controller`);
        if (!Number.isFinite(value.foreignControl.share) || value.foreignControl.share <= 0 || value.foreignControl.share >= 1) errors.push(`${territory.id}: invalid foreign control share`);
      }
    }
  }
  for (const player of state.players) {
    const owned = Object.values(state.territories).filter((territory) => territory.ownerId === player.id);
    const capitals = owned.filter((territory) => territory.capital);
    if (!player.eliminated && (capitals.length !== 1 || capitals[0]?.id !== player.capitalId)) errors.push(`${player.id}: ongeldige hoofdstad`);
    if (player.eliminated && owned.length > 0) errors.push(`${player.id}: eliminated while owning territory`);
    const budgetTotal = Object.values(player.budget).reduce((sum, value) => sum + value, 0);
    if (budgetTotal !== 100) errors.push(`${player.id}: budget is ${budgetTotal}`);
    for (const [upgradeId, level] of Object.entries(player.upgrades)) {
      const maximum = TREASURY_UPGRADE_BY_ID[upgradeId as StrategicUpgradeId]?.maxLevel ?? 0;
      if (!Number.isInteger(level) || level < 0 || level > maximum) errors.push(`${player.id}: invalid ${upgradeId} upgrade level`);
    }
    for (const [upgradeId, level] of Object.entries(player.managementLevels)) {
      const maximum = MANAGEMENT_UPGRADE_BY_ID[upgradeId as ManagementUpgradeId]?.maxLevel ?? 0;
      if (!Number.isInteger(level) || level < 0 || level > maximum) errors.push(`${player.id}: invalid ${upgradeId} management level`);
    }
    for (const [improvementId, level] of Object.entries(player.improvements)) {
      if (!Number.isInteger(level) || level < 0) errors.push(`${player.id}: invalid ${improvementId} improvement`);
    }
    for (const [domain, project] of Object.entries(player.management)) {
      if (project.activeId && MANAGEMENT_UPGRADE_BY_ID[project.activeId]?.domain !== domain) errors.push(`${player.id}: invalid ${domain} project`);
      if (![project.progress, project.target, project.paidCost, project.startedTick].every((value) => Number.isFinite(value) && value >= 0)) errors.push(`${player.id}: invalid ${domain} project progress`);
      if (project.activeId && (project.target <= 0 || project.progress >= project.target + 2)) errors.push(`${player.id}: invalid ${domain} project target`);
    }
    for (const value of [player.treasury, player.annualIncome, player.manpower, player.stability, player.influence, player.warExhaustion, player.recoverySurgeUntilTick, ...Object.values(player.funds)]) {
      if (!Number.isFinite(value) || value < 0) errors.push(`${player.id}: ongeldige resource`);
    }
    if (player.stability > 100 || player.influence > 100 || player.warExhaustion > 100) errors.push(`${player.id}: resource boven maximum`);
  }
  const warPairs = new Set<string>();
  for (const war of state.wars) {
    const pair = relationKey(war.attackerId, war.defenderId);
    if (warPairs.has(pair)) errors.push(`${pair}: duplicate war`);
    warPairs.add(pair);
    if (state.relations[pair]?.status !== 'war') errors.push(`${pair}: war and relation status differ`);
    const warNumbers = [war.attackerLosses, war.defenderLosses, war.attackerMilitaryLoss, war.defenderMilitaryLoss,
      war.attackerPopulationLoss, war.defenderPopulationLoss, war.economicDamage];
    if (warNumbers.some((value) => !Number.isFinite(value) || value < 0)) errors.push(`${war.id}: invalid losses`);
    if (!Number.isFinite(war.lastPeaceOfferTick)) errors.push(`${war.id}: invalid peace offer tick`);
    for (const operation of [war.attackerOperation, war.defenderOperation]) {
      if (!operation) continue;
      if (operation.commanderId !== war.attackerId && operation.commanderId !== war.defenderId) errors.push(`${war.id}: invalid operation commander`);
      if (!state.territories[operation.sourceId] || !state.territories[operation.targetId]) errors.push(`${war.id}: invalid operation territory`);
      if (![operation.startedTick, operation.expiresTick, operation.momentum, operation.supply, operation.supportingForces]
        .every((value) => Number.isFinite(value))) errors.push(`${war.id}: invalid operation value`);
      if (operation.supply < 0.2 || operation.supply > 1.2 || operation.supportingForces < 0) errors.push(`${war.id}: invalid operation logistics`);
    }
  }
  for (const relation of Object.values(state.relations)) {
    if (relation.status === 'war' && !warPairs.has(relation.id)) errors.push(`${relation.id}: war relation without war`);
    const eliminatedParty = state.players.some((player) => player.eliminated && (player.id === relation.leftId || player.id === relation.rightId));
    if (eliminatedParty && relation.treaties.length > 0) errors.push(`${relation.id}: treaty involving an eliminated country`);
  }
  for (const offer of state.offers) {
    const eliminatedParty = state.players.some((player) => player.eliminated && (player.id === offer.fromId || player.id === offer.toId));
    if (eliminatedParty && offer.status === 'pending') errors.push(`${offer.id}: pending offer involving an eliminated country`);
    if (offer.cashAmount !== undefined && (!Number.isFinite(offer.cashAmount) || offer.cashAmount < 0)) errors.push(`${offer.id}: invalid reparations`);
    if (offer.controlShare !== undefined && (!Number.isFinite(offer.controlShare) || offer.controlShare <= 0 || offer.controlShare >= 1)) errors.push(`${offer.id}: invalid territorial settlement`);
  }
  return errors;
}

export function regionController(state: WorldState, regionId: string): PlayerId | undefined {
  const territories = territoriesInRegion(regionId);
  const owner = state.territories[territories[0]?.id ?? '']?.ownerId;
  return owner && territories.every((territory) => state.territories[territory.id]?.ownerId === owner) ? owner : undefined;
}

export function coalitionRegionCount(state: WorldState, playerId: PlayerId): number {
  return REGIONS.filter((region) => regionController(state, region.id) === playerId).length;
}

export function coalitionHp(state: WorldState, playerId: PlayerId): { current: number; max: number } {
  return Object.values(state.territories)
    .filter((territory) => territory.ownerId === playerId)
    .reduce((total, territory) => {
      return { current: total.current + territory.force.hp, max: total.max + territory.force.maxHp };
    }, { current: 0, max: 0 });
}
