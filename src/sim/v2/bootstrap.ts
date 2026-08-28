import { normalizeSeed } from '../../game/random';
import {
  FOOD_OPENING_RESERVE_MIN_WEEKS,
  V2_MAP_ID,
  V2_RULES_VERSION,
  clamp,
  round,
} from './balance';
import { WORLD_CONTENT_V2, type WorldContentV2 } from './content';
import {
  initialArmyCapacityRatioV2,
  initialTerritoryArmyCapacityV2,
  synchronizeArmyCapacityV2,
} from './capacity';
import { createNationStateV2, synchronizeOpeningArmyHumanRosterV2 } from './nationState';
import { createInitialPolarEndgameV2 } from './polarEndgame';
import { contentVersionForWorldContentV2 } from './scenarios';
import { countryTraitFactorV2, registerTraitContentV2 } from './traits';
import {
  invalidateTerritoryIndexV2,
  selectFoodDemandV2,
  selectFoodDomesticCapacityTargetV2,
  selectFoodStorageCapacityV2,
} from './selectors';
import type {
  PlayerId,
  TerritoryId,
  TerritoryStateV2,
  WorldStateV2,
} from './types';

/** Belgium begins with a modest ordinary-force head start, independent of human underdog scaling. */
export const BELGIUM_OPENING_MANPOWER_MULTIPLIER_V2 = 1.20;

function defaultHumanPlayerId(content: WorldContentV2): PlayerId {
  const belgium = content.nationIds.find((id) => String(id) === 'bel');
  if (belgium) return belgium;
  const unitedStates = content.nationIds.find((id) => String(id) === 'usa');
  if (unitedStates) return unitedStates;
  const fallback = content.nationIds[0];
  if (!fallback) throw new Error('V2 content needs at least one nation.');
  return fallback;
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
  const unmodifiedCapacity = initialTerritoryArmyCapacityV2(content, id);
  const capacity = round(unmodifiedCapacity
    * countryTraitFactorV2(definition.initialOwnerId, 'army-capacity'));
  const openingFill = initialArmyCapacityRatioV2(content, definition.initialOwnerId);
  const openingManpowerMultiplier = String(definition.initialOwnerId) === 'bel'
    ? BELGIUM_OPENING_MANPOWER_MULTIPLIER_V2
    : 1;
  return {
    owner: definition.initialOwnerId,
    coreOwner: definition.initialOwnerId,
    population: definition.baseline.population,
    economy: definition.baseline.gdp,
    condition: round(condition, 6),
    integration: 1,
    army: {
      // Capacity traits create future room, not a free opening army.
      manpower: round(Math.min(
        capacity,
        unmodifiedCapacity * openingFill * openingManpowerMultiplier,
      )),
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
  if (content.metadata?.openingProfile !== 'standard-2026') return [];
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
  if (content.metadata?.openingProfile !== 'standard-2026') return;
  const scenario = openingConflictScheduleV2(state.seed, content).find((entry) => entry.tick === state.tick);
  if (!scenario) return;
  if (!state.players[scenario.attackerId] || !state.players[scenario.defenderId]) return;
  // Seeded opening crises are AI-vs-AI scenario events and must never issue a
  // declaration on behalf of, or directly against, a country controlled by a
  // human. Autonomous AI declarations use the live Suspicion curve instead.
  if (state.humanPlayerIds.includes(scenario.attackerId)
    || state.humanPlayerIds.includes(scenario.defenderId)) return;
  if (state.players[scenario.attackerId]!.treasury < 0) return;
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
    attackerCivilianLosses: 0,
    defenderCivilianLosses: 0,
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
  registerTraitContentV2(content);
  const seed = normalizeSeed(seedInput);
  const humanPlayerId = defaultHumanPlayerId(content);
  const players = Object.fromEntries(content.nationIds.map((id) => [
    id,
    createNationStateV2(id, content, id === humanPlayerId),
  ])) as WorldStateV2['players'];
  const territories = Object.fromEntries(
    content.territoryIds.map((id) => [id, createTerritoryState(id, content)]),
  );
  const state: WorldStateV2 = {
    schemaVersion: 22,
    rulesVersion: V2_RULES_VERSION,
    contentVersion: contentVersionForWorldContentV2(content),
    mapId: V2_MAP_ID,
    seed,
    rngState: seed,
    tick: 0,
    actionSequence: 0,
    speed: 0,
    humanPlayerId,
    humanPlayerIds: [humanPlayerId],
    firstIntegrationDiscountUsedBy: [],
    players,
    territories,
    wars: [],
    truces: [],
    ceasefireObligations: [],
    offers: [],
    alliances: [],
    allianceOffers: [],
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
    polarEndgame: createInitialPolarEndgameV2(),
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
  if (content.metadata?.openingProfile === 'standard-2026') seedScenarioPressureV2(state, content);
  synchronizeOpeningArmyHumanRosterV2(state, content, [], [humanPlayerId]);
  // Opening buffers are population-based, but storage is derived from the
  // live economy, infrastructure and land. Never begin with food that the
  // current country could not physically store.
  for (const playerId of content.nationIds) {
    state.players[playerId]!.domesticFoodCapacity = round(
      selectFoodDomesticCapacityTargetV2(state, content, playerId),
      9,
    );
    const storageCapacity = selectFoodStorageCapacityV2(state, content, playerId);
    const openingReserveFloor = selectFoodDemandV2(state, playerId)
      * FOOD_OPENING_RESERVE_MIN_WEEKS;
    state.players[playerId]!.foodStock = round(Math.min(
      storageCapacity,
      Math.max(state.players[playerId]!.foodStock, openingReserveFloor),
    ));
  }
  // Territory shells are built before the human roster exists. Bring the
  // selected opening country's capacity trait onto the same live-context path
  // used after every later lobby roster change.
  synchronizeArmyCapacityV2(state, content);
  // Storage selection builds an ephemeral ownership index. A freshly created
  // state is intentionally returned with that cache cold so callers may still
  // prepare fixtures/scenarios before the first derived selection.
  invalidateTerritoryIndexV2(state);
  return state;
}
