import { normalizeSeed } from '../../game/random';
import {
  V2_MAP_ID,
  V2_RULES_VERSION,
  round,
} from './balance';
import {
  WORLD_CONTENT_V2,
  isHumanSelectableNationV2,
  type WorldContentV2,
} from './content';
import {
  initialArmyCapacityRatioV2,
  initialTerritoryArmyCapacityV2,
  synchronizeArmyCapacityV2,
} from './capacity';
import { createNationStateV2, synchronizeOpeningArmyHumanRosterV2 } from './nationState';
import {
  CAMPAIGN_AI_VS_AI_POST_BLACKOUT_GRACE_TICKS_V2,
  campaignBlackoutBriefingAcknowledgedV2,
  campaignWarsUnlockedV2,
} from './campaignPrologue';
import { campaignTutorialBypassedV2 } from './campaignTutorial';
import { addWorldEventV2 } from './events';
import { createInitialPolarEndgameV2 } from './polarEndgame';
import { createInitialRunProgressionV2 } from './runProgression';
import { contentVersionForWorldContentV2 } from './scenarios';
import { initializeSurvivalScenarioV2 } from './survival';
import { normalizeRetiredFoodCompatibilityV2 } from './retiredFood';
import { countryTraitFactorV2, registerTraitContentV2 } from './traits';
import { invalidateTerritoryIndexV2 } from './selectors';
import type {
  PlayerId,
  TerritoryId,
  TerritoryStateV2,
  WorldStateV2,
} from './types';

/** Compatibility export: default campaigns now preserve the neutral 2026 opening force. */
export const BELGIUM_OPENING_MANPOWER_MULTIPLIER_V2 = 1;

function defaultHumanPlayerId(content: WorldContentV2): PlayerId {
  const selectableIds = content.nationIds.filter((id) => isHumanSelectableNationV2(content, id));
  const belgium = selectableIds.find((id) => String(id) === 'bel');
  if (belgium) return belgium;
  const unitedStates = selectableIds.find((id) => String(id) === 'usa');
  if (unitedStates) return unitedStates;
  const fallback = selectableIds[0];
  if (!fallback) throw new Error('V2 content needs at least one nation.');
  return fallback;
}

function createTerritoryState(id: TerritoryId, content: WorldContentV2): TerritoryStateV2 {
  const definition = content.territories[id];
  if (!definition) throw new Error(`Missing V2 territory content for ${id}.`);
  const origin = content.nations[definition.initialOwnerId];
  if (!origin) throw new Error(`Missing V2 nation content for ${definition.initialOwnerId}.`);
  const unmodifiedCapacity = initialTerritoryArmyCapacityV2(content, id);
  const capacity = round(unmodifiedCapacity
    * countryTraitFactorV2(definition.initialOwnerId, 'army-capacity'));
  const isSovereignCountry = (definition.kind ?? 'sovereign') === 'sovereign';
  const openingFill = isSovereignCountry
    ? 1
    : initialArmyCapacityRatioV2(content, definition.initialOwnerId);
  return {
    owner: definition.initialOwnerId,
    coreOwner: definition.initialOwnerId,
    population: definition.baseline.population,
    economy: definition.baseline.gdp,
    integration: 1,
    army: {
      // Countries enter fully ready. Antarctic machine infrastructure retains
      // authored staging room for the separate, provenance-tracked wave flow.
      manpower: round(Math.min(capacity, unmodifiedCapacity * openingFill)),
      capacity,
      baseAttack: origin.militaryAttackRating ?? origin.militaryQuality ?? 1,
      baseDefense: origin.militaryDefenseRating ?? origin.militaryQuality ?? 1,
    },
  };
}

/** 2026 scenario pressure begins as damaged states; interstate wars unfold during year one. */
function seedScenarioPressureV2(state: WorldStateV2, content: WorldContentV2): void {
  // Internal conflicts are national pressure, not fabricated interstate wars.
  // They begin with damaged forces and output and remain visible in the
  // campaign report while the national AI works on stabilisation.
  const crises = [
    { nation: 'sdn', label: 'Sudan civil war', economy: 0.78 },
    { nation: 'mmr', label: 'Myanmar conflict', economy: 0.84 },
    { nation: 'yem', label: 'Yemen conflict', economy: 0.72 },
    { nation: 'som', label: 'Somalia conflict', economy: 0.80 },
    { nation: 'cod', label: 'Eastern DR Congo conflict', economy: 0.88 },
  ] as const;
  for (const crisis of crises) {
    const nationId = content.nationIds.find((id) => String(id) === crisis.nation);
    if (!nationId) continue;
    for (const [territoryId, territory] of Object.entries(state.territories) as Array<[TerritoryId, TerritoryStateV2]>) {
      if (territory.owner !== nationId) continue;
      territory.economy = round(Math.max(0.10, territory.economy * crisis.economy));
      state.events.push({
        id: state.nextEventId++,
        tick: 0,
        kind: 'critical',
        severity: 'info',
        message: `${crisis.label} is disrupting national output.`,
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

/**
 * One seed-varied regional crisis proves the Rogue manipulation before APEX
 * opens the player's first strike. Further AI wars use the paced national AI;
 * the tutorial never floods the map with a scripted conflict sequence.
 */
export function openingConflictScheduleV2(seed: number, content: WorldContentV2): OpeningConflictV2[] {
  if (content.metadata?.scenarioId !== 'standard-2026') return [];
  const candidates = OPENING_CONFLICT_POOL.flatMap(([attacker, defender, label], index) => {
    const attackerId = content.nationIds.find((id) => String(id) === attacker);
    const defenderId = content.nationIds.find((id) => String(id) === defender);
    return attackerId && defenderId && initiallyConnectedV2(content, attackerId, defenderId)
      ? [{ attackerId, defenderId, label, score: scenarioHash(seed, index + 17) }] : [];
  }).sort((left, right) => left.score - right.score
    || left.attackerId.localeCompare(right.attackerId)
    || left.defenderId.localeCompare(right.defenderId));
  const selected = candidates.slice(0, 1);
  // Stage I already provides the calm opening. The proof conflict arrives in
  // a narrow seed-varied window, never on the same week as the intelligence
  // collapse and never after another long silent half-year.
  const windows = [[
    CAMPAIGN_AI_VS_AI_POST_BLACKOUT_GRACE_TICKS_V2,
    CAMPAIGN_AI_VS_AI_POST_BLACKOUT_GRACE_TICKS_V2 + 2,
  ]] as const;
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

const OPENING_CONFLICT_EVENT_PREFIX_V2 = 'MANIPULATED CONFLICT ·';

export function processOpeningConflictsV2(state: WorldStateV2, content: WorldContentV2): boolean {
  if (content.metadata?.scenarioId !== 'standard-2026') return false;
  if (state.humanPlayerIds.length > 0 && state.humanPlayerIds.every((playerId) => (
    campaignTutorialBypassedV2(state, content, playerId)
  ))) return false;
  if (!campaignWarsUnlockedV2(state, content)) return false;
  if (!campaignBlackoutBriefingAcknowledgedV2(state, content)) return false;
  // Stage-I completion starts the world's seeded conflict cadence. Scheduling
  // from that save-stable blackout tick prevents both missed early conflicts
  // and an implausible pile-up on the exact week communications collapse.
  // Authenticated legacy saves that already contain war history keep tick zero
  // as their origin and therefore continue their established timeline.
  const conflictOriginTick = state.polarEndgame.communicationsBlackoutTick ?? 0;
  const schedule = openingConflictScheduleV2(state.seed, content);
  const dueCount = schedule.filter((entry) => conflictOriginTick + entry.tick <= state.tick).length;
  const startedCount = state.aiEscalation.openingConflictsStarted;
  if (dueCount <= startedCount) return false;

  const alive = new Set(Object.values(state.territories).map((territory) => territory.owner));
  const validPair = (attackerId: PlayerId, defenderId: PlayerId): boolean => (
    attackerId !== defenderId
      && Boolean(state.players[attackerId] && state.players[defenderId])
      && !state.humanPlayerIds.includes(attackerId)
      && !state.humanPlayerIds.includes(defenderId)
      && content.nations[attackerId]?.kind !== 'rogue-ai'
      && content.nations[defenderId]?.kind !== 'rogue-ai'
      && alive.has(attackerId) && alive.has(defenderId)
      && state.players[attackerId]!.treasury >= 0
      && initiallyConnectedV2(content, attackerId, defenderId)
      && !state.wars.some((war) => (
        war.attackerId === attackerId || war.defenderId === attackerId
          || war.attackerId === defenderId || war.defenderId === defenderId
      ))
  );
  const preferred = schedule[Math.min(startedCount, schedule.length - 1)];
  const fallback = content.nationIds.flatMap((attackerId) => (
    content.nationIds.map((defenderId) => ({
      attackerId,
      defenderId,
      label: 'Regional command fracture',
      score: scenarioHash(
        state.seed,
        1_000 + startedCount * 313
          + content.nationIds.indexOf(attackerId) * content.nationIds.length
          + content.nationIds.indexOf(defenderId),
      ),
    }))
  )).filter((candidate) => validPair(candidate.attackerId, candidate.defenderId))
    .sort((left, right) => left.score - right.score
      || left.attackerId.localeCompare(right.attackerId)
      || left.defenderId.localeCompare(right.defenderId))[0];
  const scenario = preferred && validPair(preferred.attackerId, preferred.defenderId)
    ? preferred : fallback;
  // If an extreme world state has no valid pair, retry deterministically next
  // week instead of permanently losing this narrative beat.
  if (!scenario) return false;
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
  state.aiEscalation.openingConflictsStarted = startedCount + 1;
  const attackerName = content.nations[scenario.attackerId]?.shortName ?? scenario.attackerId;
  const defenderName = content.nations[scenario.defenderId]?.shortName ?? scenario.defenderId;
  addWorldEventV2(
    state,
    'war',
    'critical',
    `${OPENING_CONFLICT_EVENT_PREFIX_V2} ${attackerName} attacked ${defenderName}. ${scenario.label}.`,
  );
  return true;
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
    commanderForces: {},
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
      openingConflictsStarted: 0,
      lastFederationTick: -1_000_000,
      resistanceLevel: 0,
      globalThreat: 0,
      coalitionMembers: [],
      lastHumanTerritoryCount: Object.values(territories).filter((territory) => territory.owner === humanPlayerId).length,
      lastHumanPower: 0,
    },
    polarEndgame: createInitialPolarEndgameV2(),
    runProgression: createInitialRunProgressionV2(content),
    nextEventId: 1,
    nextWarId: 1,
    nextOfferId: 1,
    gameOver: false,
  };
  initializeSurvivalScenarioV2(state, content);
  state.runProgression.players[humanPlayerId] = {
    activeOffer: null,
    queuedMilestones: [],
    triggeredMilestoneIds: [],
    picks: [],
    stacks: {},
    recapturedScorchedTerritoryIds: [],
  };
  const name = content.nations[humanPlayerId]?.name ?? humanPlayerId;
  state.events.push({
    id: state.nextEventId++,
    tick: 0,
    kind: 'system',
    severity: 'action',
    message: `${content.nationIds.filter((id) => isHumanSelectableNationV2(content, id)).length} countries are ready. ${name} is selected by default.`,
    playerId: humanPlayerId,
    unread: true,
  });
  if (content.metadata?.openingProfile === 'standard-2026') seedScenarioPressureV2(state, content);
  synchronizeOpeningArmyHumanRosterV2(state, content, [], [humanPlayerId]);
  normalizeRetiredFoodCompatibilityV2(state);
  // Territory shells are built before the human roster exists. Bring the
  // selected opening country's capacity trait onto the same live-context path
  // used after every later lobby roster change.
  synchronizeArmyCapacityV2(state, content);
  for (const [territoryId, territory] of Object.entries(state.territories) as Array<[
    TerritoryId,
    TerritoryStateV2,
  ]>) {
    if ((content.territories[territoryId]?.kind ?? 'sovereign') === 'sovereign') {
      territory.army.manpower = territory.army.capacity;
    }
  }
  // Storage selection builds an ephemeral ownership index. A freshly created
  // state is intentionally returned with that cache cold so callers may still
  // prepare fixtures/scenarios before the first derived selection.
  invalidateTerritoryIndexV2(state);
  return state;
}
