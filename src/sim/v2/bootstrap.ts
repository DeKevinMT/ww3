import { normalizeSeed } from '../../game/random';
import {
  DEFAULT_RESEARCH_ALLOCATIONS_V2,
  DEFAULT_BUDGET_V2,
  EMPTY_RESEARCH_BREAKTHROUGHS,
  EMPTY_RESEARCH_EFFECT_LEVELS,
  EMPTY_RESEARCH_PROGRESS,
  FOOD_TARGET_WEEKS,
  V2_CONTENT_VERSION,
  V2_MAP_ID,
  V2_RULES_VERSION,
  clamp,
  round,
} from './balance';
import { WORLD_CONTENT_V2, type WorldContentV2 } from './content';
import { initialArmyCapacityRatioV2, initialTerritoryArmyCapacityV2 } from './capacity';
import { calculateFiscalCapacityV2 } from './fiscal';
import type {
  NationStateV2,
  PlayerId,
  TerritoryId,
  TerritoryStateV2,
  WorldStateV2,
} from './types';

function defaultHumanPlayerId(content: WorldContentV2): PlayerId {
  const belgium = content.nationIds.find((id) => String(id) === 'bel');
  if (belgium) return belgium;
  const unitedStates = content.nationIds.find((id) => String(id) === 'usa');
  if (unitedStates) return unitedStates;
  const fallback = content.nationIds[0];
  if (!fallback) throw new Error('V2 content needs at least one nation.');
  return fallback;
}

function createNationState(id: PlayerId, content: WorldContentV2): NationStateV2 {
  const definition = content.nations[id];
  if (!definition) throw new Error(`Missing V2 nation content for ${id}.`);
  const structuralPopulation = Math.max(0, definition.real.population);
  const structuralWealthPerPerson = structuralPopulation > 0
    ? definition.real.gdp / structuralPopulation : 0;
  const fiscalCapacity = calculateFiscalCapacityV2(
    structuralPopulation,
    structuralWealthPerPerson,
  );
  const weeklyRevenue = fiscalCapacity.weeklyTaxRevenue;
  // Small, wealthy states commonly hold a much deeper liquid buffer than two
  // tax weeks. Diminishing size scaling grants that identity without handing
  // another enormous absolute windfall to the largest economy in the world.
  const gdpPerCapita = fiscalCapacity.wealthPerPerson * 1_000;
  const wealthTier = clamp(Math.log2(Math.max(10_000, gdpPerCapita) / 10_000), 0, 4);
  const largeEconomyDamping = 1 / Math.sqrt(Math.max(1, definition.real.gdp / 500));
  const startingCashWeeks = clamp(2 + 2.25 * wealthTier * largeEconomyDamping, 2, 9);
  const initialFoodSecurity = clamp(1 - definition.real.foodInsecurityRate, 0.28, 0.995);
  const initialFoodBufferWeeks = FOOD_TARGET_WEEKS
    * clamp(1 - 4 * definition.real.foodInsecurityRate, 0.08, 1);
  return {
    empireName: '',
    treasury: round(Math.max(0.10, weeklyRevenue * startingCashWeeks), 3),
    foodStock: round(definition.real.population * initialFoodBufferWeeks),
    foodSecurity: round(initialFoodSecurity),
    budget: { ...DEFAULT_BUDGET_V2 },
    research: {
      allocations: { ...DEFAULT_RESEARCH_ALLOCATIONS_V2 },
      progress: { ...EMPTY_RESEARCH_PROGRESS },
      effectLevels: { ...EMPTY_RESEARCH_EFFECT_LEVELS },
      breakthroughs: { ...EMPTY_RESEARCH_BREAKTHROUGHS },
    },
    ceasefiresRequested: 0,
    manualActionUses: { rapidRecruitment: 0, researchSurge: 0, propaganda: 0 },
    rapidRecruitmentAvailableTick: 0,
    researchSurgeAvailableTick: 0,
    propagandaAvailableTick: 0,
    propagandaProgram: null,
    warFatigue: 0,
    combatExperience: 0,
    capitalId: definition.initialCapitalId,
  };
}

function createTerritoryState(id: TerritoryId, content: WorldContentV2): TerritoryStateV2 {
  const definition = content.territories[id];
  if (!definition) throw new Error(`Missing V2 territory content for ${id}.`);
  const origin = content.nations[definition.initialOwnerId];
  if (!origin) throw new Error(`Missing V2 nation content for ${definition.initialOwnerId}.`);
  const condition = clamp(
    0.66 + Math.log10(definition.baseline.gdp + 1) * 0.055 + definition.baseline.powerIndex / 1_200,
    0.62,
    0.96,
  );
  const capacity = initialTerritoryArmyCapacityV2(content, id);
  const openingFill = initialArmyCapacityRatioV2(content, definition.initialOwnerId);
  return {
    owner: definition.initialOwnerId,
    coreOwner: definition.initialOwnerId,
    population: definition.baseline.population,
    economy: definition.baseline.gdp,
    condition: round(condition, 6),
    integration: 1,
    army: {
      manpower: round(capacity * openingFill),
      capacity,
      baseAttack: origin.militaryAttackRating ?? origin.militaryQuality ?? 1,
      baseDefense: origin.militaryDefenseRating ?? origin.militaryQuality ?? 1,
    },
  };
}

/** 2026 scenario pressure begins as damaged states; interstate wars unfold during year one. */
function seedScenarioPressureV2(state: WorldStateV2, content: WorldContentV2): void {
  // Internal conflicts are national pressure, not fabricated interstate wars.
  // They begin with damaged forces, output and condition and remain visible in
  // the campaign report while the national AI works on recovery.
  const crises = [
    { nation: 'sdn', label: 'Sudan civil war', condition: 0.70, economy: 0.78, army: 0.72 },
    { nation: 'mmr', label: 'Myanmar conflict', condition: 0.78, economy: 0.84, army: 0.82 },
    { nation: 'yem', label: 'Yemen conflict', condition: 0.70, economy: 0.72, army: 0.78 },
    { nation: 'som', label: 'Somalia conflict', condition: 0.76, economy: 0.80, army: 0.82 },
    { nation: 'cod', label: 'Eastern DR Congo conflict', condition: 0.80, economy: 0.88, army: 0.85 },
  ] as const;
  for (const crisis of crises) {
    const nationId = content.nationIds.find((id) => String(id) === crisis.nation);
    if (!nationId) continue;
    for (const [territoryId, territory] of Object.entries(state.territories) as Array<[TerritoryId, TerritoryStateV2]>) {
      if (territory.owner !== nationId) continue;
      territory.condition = round(Math.max(0.15, territory.condition * crisis.condition));
      territory.economy = round(Math.max(0.10, territory.economy * crisis.economy));
      territory.army.manpower = round(Math.min(territory.army.capacity, territory.army.manpower * crisis.army));
      state.events.push({
        id: state.nextEventId++,
        tick: 0,
        kind: 'critical',
        severity: 'info',
        message: `${crisis.label} is degrading national condition and output.`,
        territoryId,
        playerId: nationId,
        unread: true,
      });
    }
  }
}

interface OpeningConflictV2 {
  tick: number;
  attackerId: PlayerId;
  defenderId: PlayerId;
  label: string;
}

const OPENING_CONFLICT_POOL = [
  ['rus', 'ukr', 'Russia–Ukraine escalation'],
  ['isr', 'psx', 'Israel–Palestine escalation'],
  ['pak', 'afg', 'Afghanistan–Pakistan border escalation'],
  ['arm', 'aze', 'Armenia–Azerbaijan escalation'],
  ['prk', 'kor', 'Korean peninsula escalation'],
  ['ind', 'pak', 'India–Pakistan escalation'],
  ['dza', 'mar', 'Algeria–Morocco escalation'],
  ['cod', 'rwa', 'Great Lakes escalation'],
  ['ven', 'guy', 'Venezuela–Guyana escalation'],
  ['srb', 'xkx', 'Serbia–Kosovo escalation'],
  ['tur', 'syr', 'Türkiye–Syria border escalation'],
  ['chn', 'twn', 'Taiwan Strait escalation'],
] as const;

function scenarioHash(seed: number, salt: number): number {
  let value = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  return value >>> 0;
}

function initiallyConnectedV2(content: WorldContentV2, leftId: PlayerId, rightId: PlayerId): boolean {
  return content.territoryIds.some((territoryId) => {
    const territory = content.territories[territoryId];
    if (territory?.initialOwnerId !== leftId) return false;
    return territory.connections.some((edge) => content.territories[edge.targetId]?.initialOwnerId === rightId);
  });
}

/** Three seed-varied regional crises are staged across the first campaign year, never on week zero. */
export function openingConflictScheduleV2(seed: number, content: WorldContentV2): OpeningConflictV2[] {
  const candidates = OPENING_CONFLICT_POOL.flatMap(([attacker, defender, label], index) => {
    const attackerId = content.nationIds.find((id) => String(id) === attacker);
    const defenderId = content.nationIds.find((id) => String(id) === defender);
    return attackerId && defenderId && initiallyConnectedV2(content, attackerId, defenderId)
      ? [{ attackerId, defenderId, label, score: scenarioHash(seed, index + 17) }] : [];
  }).sort((left, right) => left.score - right.score
    || left.attackerId.localeCompare(right.attackerId)
    || left.defenderId.localeCompare(right.defenderId));
  const selected: typeof candidates = [];
  const participants = new Set<PlayerId>();
  for (const candidate of candidates) {
    if (participants.has(candidate.attackerId) || participants.has(candidate.defenderId)) continue;
    selected.push(candidate);
    participants.add(candidate.attackerId);
    participants.add(candidate.defenderId);
    if (selected.length === 3) break;
  }
  const windows = [[6, 14], [20, 30], [38, 50]] as const;
  return selected.map((scenario, index) => {
    const [start, end] = windows[index]!;
    return {
      tick: start + scenarioHash(seed, index + 101) % (end - start + 1),
      attackerId: scenario.attackerId,
      defenderId: scenario.defenderId,
      label: scenario.label,
    };
  });
}

export function processOpeningConflictsV2(state: WorldStateV2, content: WorldContentV2): void {
  if (content !== WORLD_CONTENT_V2) return;
  const scenario = openingConflictScheduleV2(state.seed, content).find((entry) => entry.tick === state.tick);
  if (!scenario) return;
  if (!state.players[scenario.attackerId] || !state.players[scenario.defenderId]) return;
  const attackerAlive = Object.values(state.territories).some((territory) => territory.owner === scenario.attackerId);
  const defenderAlive = Object.values(state.territories).some((territory) => territory.owner === scenario.defenderId);
  if (!attackerAlive || !defenderAlive) return;
  if (state.wars.some((war) => (
    (war.attackerId === scenario.attackerId && war.defenderId === scenario.defenderId)
    || (war.attackerId === scenario.defenderId && war.defenderId === scenario.attackerId)
  ))) return;
  state.wars.push({
    id: `war-${state.nextWarId++}`,
    attackerId: scenario.attackerId,
    defenderId: scenario.defenderId,
    startedTick: state.tick,
    lastBattleTick: state.tick,
    warScore: 0,
    battles: 0,
    attackerLosses: 0,
    defenderLosses: 0,
    lastPeaceOfferTick: -1_000_000,
    attackerOperations: [],
    defenderOperations: [],
  });
  // This scenario opening also resets autonomous pacing, preventing ordinary
  // AI declarations from piling directly onto the staged first-year crisis.
  state.aiEscalation.lastWarStartTick = state.tick;
}

export function createWorldStateV2(
  seedInput = 1,
  content: WorldContentV2 = WORLD_CONTENT_V2,
): WorldStateV2 {
  const seed = normalizeSeed(seedInput);
  const humanPlayerId = defaultHumanPlayerId(content);
  const players = Object.fromEntries(content.nationIds.map((id) => [id, createNationState(id, content)])) as WorldStateV2['players'];
  const territories = Object.fromEntries(
    content.territoryIds.map((id) => [id, createTerritoryState(id, content)]),
  );
  const state: WorldStateV2 = {
    schemaVersion: 19,
    rulesVersion: V2_RULES_VERSION,
    contentVersion: V2_CONTENT_VERSION,
    mapId: V2_MAP_ID,
    seed,
    rngState: seed,
    tick: 0,
    actionSequence: 0,
    speed: 0,
    humanPlayerId,
    players,
    territories,
    wars: [],
    truces: [],
    ceasefireObligations: [],
    offers: [],
    events: [],
    aiEscalation: {
      lastWarStartTick: -1_000_000,
      lastFederationTick: -1_000_000,
      resistanceLevel: 0,
      globalThreat: 0,
      coalitionMembers: [],
      lastHumanTerritoryCount: Object.values(territories).filter((territory) => territory.owner === humanPlayerId).length,
      lastHumanPower: 0,
    },
    nextEventId: 1,
    nextWarId: 1,
    nextOfferId: 1,
    gameOver: false,
  };
  const name = content.nations[humanPlayerId]?.name ?? humanPlayerId;
  state.events.push({
    id: state.nextEventId++,
    tick: 0,
    kind: 'system',
    severity: 'action',
    message: `${content.nationIds.length} countries are ready. ${name} is selected by default.`,
    playerId: humanPlayerId,
    unread: true,
  });
  if (content === WORLD_CONTENT_V2) seedScenarioPressureV2(state, content);
  return state;
}
