import { CEASEFIRE_PAYMENT_WEEKS, PROPAGANDA_DURATION_TICKS, RESEARCH_BRANCHES } from './balance';
import type { WorldContentV2 } from './content';
import { stateTerritoryArmyCapacityTargetV2 } from './capacity';
import { isHumanPlayerV2 } from './humanPlayers';
import {
  finiteStateNumbersV2,
  relationKeyV2,
  selectArmyCombatManpowerV2,
  selectTerritoriesOfV2,
  selectTerritoryWarAccessV2,
} from './selectors';
import type { PlayerId, TerritoryId, WorldStateV2 } from './types';

const NATION_KEYS = ['budget', 'capitalId', 'ceasefiresRequested', 'domesticFoodCapacity', 'empireName', 'foodSecurity', 'foodStock', 'manualActionUses', 'propagandaAvailableTick', 'propagandaProgram', 'rapidRecruitmentAvailableTick', 'research', 'researchSurgeAvailableTick', 'trainedReserves', 'treasury', 'warFatigue'];
const TERRITORY_KEYS = ['army', 'condition', 'coreOwner', 'economy', 'integration', 'integrationProgram', 'owner', 'population'];
const RESEARCH_KEYS = ['allocations', 'breakthroughs', 'effectLevels', 'progress'];
const BUDGET_KEYS = ['development', 'military', 'research'];
const MANUAL_ACTION_USE_KEYS = ['propaganda', 'rapidRecruitment', 'researchSurge'];
const EFFECT_KEYS = [
  'attack',
  'casualty-reduction',
  'defense',
  'economy-growth',
  'food-production',
  'food-storage',
  'force-capacity',
  'iq-increase',
  'operating-efficiency',
  'population-growth',
  'recovery',
  'reinforcement-efficiency',
  'reserve-mobilization',
  'reserve-training',
  'research-efficiency',
  'research-speed',
  'supply',
  'tax-efficiency',
  'training',
];
const BREAKTHROUGH_KEYS = [
  'advanced-weapons',
  'defensive-systems',
  'education-intelligence',
  'economy-science',
  'food-systems',
  'logistics-medicine',
  'military-industry',
  'population-recruitment',
  'public-administration',
  'reserve-doctrine',
];
const ARMY_KEYS = ['baseAttack', 'baseDefense', 'capacity', 'manpower'];
const PROPAGANDA_PROGRAM_KEYS = ['endsTick', 'startedTick', 'totalSuspicionReduction', 'weeklySuspicionReduction'];
const INTEGRATION_PROGRAM_KEYS = ['annualCost', 'completesTick', 'fromCoreOwnerId', 'fromOwnerId', 'startedTick', 'toOwnerId'];
const WAR_KEYS = ['attackerCivilianLosses', 'attackerId', 'attackerLosses', 'attackerOperations', 'battles', 'defenderCivilianLosses', 'defenderId', 'defenderLosses', 'defenderOperations', 'id', 'lastBattleTick', 'lastPeaceOfferTick', 'startedTick', 'warScore'];
const OPERATION_KEYS = ['access', 'commanderId', 'doctrine', 'holdUntilTick', 'lastBattleTick', 'momentum', 'sourceId', 'startedTick', 'targetId'];
const TRUCE_KEYS = ['expiresTick', 'leftId', 'rightId'];
const CEASEFIRE_OBLIGATION_KEYS = ['expiresTick', 'payeeId', 'payerId', 'startsTick', 'warId', 'weeklyCost'];
const OFFER_KEYS = ['cashAmount', 'createdTick', 'expiresTick', 'fromId', 'id', 'paymentWeeks', 'settlement', 'status', 'toId', 'warId', 'weeklyCost'];
const AI_ESCALATION_KEYS = ['coalitionMembers', 'globalThreat', 'lastFederationTick', 'lastHumanPower', 'lastHumanTerritoryCount', 'lastWarStartTick', 'resistanceLevel'];
const OPTIONAL_CANONICAL_KEYS = ['integrationProgram'] as const;
const allowedKeySetCache = new WeakMap<readonly string[], ReadonlySet<string>>();

function allowedKeySet(allowed: readonly string[]): ReadonlySet<string> {
  let keys = allowedKeySetCache.get(allowed);
  if (!keys) {
    keys = new Set(allowed);
    allowedKeySetCache.set(allowed, keys);
  }
  return keys;
}

function exactKeys(value: object, allowed: readonly string[]): boolean {
  const actual = Object.keys(value);
  const allowedSet = allowedKeySet(allowed);
  let expectedCount = allowed.length;
  for (const key of OPTIONAL_CANONICAL_KEYS) {
    if (allowedSet.has(key) && !(key in value)) expectedCount -= 1;
  }
  return actual.length === expectedCount && actual.every((key) => allowedSet.has(key));
}

function hasOnlyKeys(value: object, allowed: readonly string[]): boolean {
  const allowedSet = allowedKeySet(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
}

export function invariantErrorsV2(state: WorldStateV2, content: WorldContentV2): string[] {
  const errors: string[] = [];
  if (state.schemaVersion !== 21) errors.push('Canonical state must use schema version 21.');
  if (!finiteStateNumbersV2(state)) errors.push('Canonical state contains a non-finite number.');
  const playerIds = Object.keys(state.players) as PlayerId[];
  const territoryIds = Object.keys(state.territories) as TerritoryId[];
  const humanPlayerIds = state.humanPlayerIds;
  if (!Array.isArray(humanPlayerIds)
    || humanPlayerIds.length < 1 || humanPlayerIds.length > 8
    || !humanPlayerIds.includes(state.humanPlayerId)
    || new Set(humanPlayerIds).size !== humanPlayerIds.length
    || humanPlayerIds.some((id) => !content.nations[id])
    || humanPlayerIds.join('|') !== [...humanPlayerIds].sort((left, right) => left.localeCompare(right)).join('|')) {
    errors.push('Human player roster is invalid.');
  }
  if (!exactKeys(state.aiEscalation, AI_ESCALATION_KEYS)
    || ![0, 1, 2].includes(state.aiEscalation.resistanceLevel)
    || ![state.aiEscalation.lastWarStartTick, state.aiEscalation.lastFederationTick, state.aiEscalation.globalThreat, state.aiEscalation.lastHumanPower, state.aiEscalation.lastHumanTerritoryCount].every(Number.isFinite)
    || state.aiEscalation.globalThreat < 0 || state.aiEscalation.globalThreat > 100
    || !Number.isInteger(state.aiEscalation.lastHumanTerritoryCount) || state.aiEscalation.lastHumanTerritoryCount < 0) errors.push('AI escalation state is invalid.');
  const coalitionMembers = state.aiEscalation.coalitionMembers;
  if ([...new Set(coalitionMembers)].length !== coalitionMembers.length
    || coalitionMembers.some((id) => isHumanPlayerV2(state, id) || !state.players[id])
    || coalitionMembers.join('|') !== [...coalitionMembers].sort((a, b) => a.localeCompare(b)).join('|')) {
    errors.push('AI coalition membership is invalid.');
  }
  const humanNationExists = Boolean(state.players[state.humanPlayerId]);
  if (!humanNationExists && (!state.gameOver || !state.winnerId || !state.players[state.winnerId])) {
    errors.push('Human nation state is missing outside a completed absorption defeat.');
  }
  for (const id of content.territoryIds) if (!state.territories[id]) errors.push(`Missing territory state: ${id}.`);
  for (const id of playerIds) {
    const nation = state.players[id]!;
    if (!content.nations[id]) errors.push(`Unknown nation state: ${id}.`);
    if (!exactKeys(nation, NATION_KEYS)) errors.push(`Nation ${id} has non-canonical keys.`);
    if (nation.propagandaProgram) {
      const program = nation.propagandaProgram;
      if (!isHumanPlayerV2(state, id)
        || !exactKeys(program, PROPAGANDA_PROGRAM_KEYS)
        || ![program.startedTick, program.endsTick, program.totalSuspicionReduction, program.weeklySuspicionReduction].every(Number.isFinite)
        || !Number.isInteger(program.startedTick) || !Number.isInteger(program.endsTick)
        || program.startedTick < 0 || program.endsTick - program.startedTick !== PROPAGANDA_DURATION_TICKS
        || program.endsTick <= state.tick || program.totalSuspicionReduction <= 0 || program.weeklySuspicionReduction <= 0
        || Math.abs(program.weeklySuspicionReduction * PROPAGANDA_DURATION_TICKS - program.totalSuspicionReduction) > 0.0001
        || nation.propagandaAvailableTick < program.endsTick) {
        errors.push(`Nation ${id} has an invalid propaganda program.`);
      }
    }
    if (!exactKeys(nation.research, RESEARCH_KEYS)) errors.push(`Nation ${id} research has non-canonical keys.`);
    if (!exactKeys(nation.budget, BUDGET_KEYS)) errors.push(`Nation ${id} budget has non-canonical keys.`);
    if (!exactKeys(nation.manualActionUses, MANUAL_ACTION_USE_KEYS)
      || !Object.values(nation.manualActionUses).every((value) => Number.isInteger(value) && value >= 0)) {
      errors.push(`Nation ${id} has invalid manual action uses.`);
    }
    if (!exactKeys(nation.research.effectLevels, EFFECT_KEYS)) errors.push(`Nation ${id} effect levels have non-canonical keys.`);
    if (!exactKeys(nation.research.breakthroughs, BREAKTHROUGH_KEYS)) errors.push(`Nation ${id} breakthroughs have non-canonical keys.`);
    if (!exactKeys(nation.research.allocations, BREAKTHROUGH_KEYS)) errors.push(`Nation ${id} research allocations have non-canonical keys.`);
    if (!exactKeys(nation.research.progress, BREAKTHROUGH_KEYS)) errors.push(`Nation ${id} research progress has non-canonical keys.`);
    const budget = nation.budget;
    if (![budget.military, budget.research, budget.development].every((value) => Number.isInteger(value) && value >= 5 && value <= 90)
      || budget.military + budget.research + budget.development !== 100) errors.push(`Nation ${id} has an invalid budget.`);
    if (nation.empireName.length > 36 || /[<>\r\n]/.test(nation.empireName)) errors.push(`Nation ${id} has an invalid empire name.`);
    if (!Number.isFinite(nation.treasury)
      || !Number.isFinite(nation.domesticFoodCapacity) || nation.domesticFoodCapacity < 0
      || !Number.isFinite(nation.trainedReserves) || nation.trainedReserves < 0
      || nation.foodStock < 0 || nation.foodSecurity < 0 || nation.foodSecurity > 1
      || !Number.isInteger(nation.ceasefiresRequested) || nation.ceasefiresRequested < 0
      || !Number.isInteger(nation.rapidRecruitmentAvailableTick) || nation.rapidRecruitmentAvailableTick < 0
      || !Number.isInteger(nation.researchSurgeAvailableTick) || nation.researchSurgeAvailableTick < 0
      || !Number.isInteger(nation.propagandaAvailableTick) || nation.propagandaAvailableTick < 0
      || nation.warFatigue < 0 || nation.warFatigue > 100) {
      errors.push(`Nation ${id} has an invalid scalar.`);
    }
    if (!RESEARCH_BRANCHES.every((branch) => Number.isInteger(nation.research.allocations[branch])
      && nation.research.allocations[branch] >= 0 && nation.research.allocations[branch] <= 100)
      || RESEARCH_BRANCHES.reduce((sum, branch) => sum + nation.research.allocations[branch], 0) !== 100) {
      errors.push(`Nation ${id} has invalid research allocations.`);
    }
    for (const effect of EFFECT_KEYS) {
      const level = nation.research.effectLevels[effect as keyof typeof nation.research.effectLevels];
      if (!Number.isInteger(level) || level < 0) errors.push(`Nation ${id} has invalid ${effect} research.`);
    }
    for (const branch of RESEARCH_BRANCHES) {
      const breakthroughs = nation.research.breakthroughs[branch];
      if (!Number.isInteger(breakthroughs) || breakthroughs < 0) errors.push(`Nation ${id} has invalid ${branch} breakthroughs.`);
      if (!Number.isFinite(nation.research.progress[branch]) || nation.research.progress[branch] < 0) errors.push(`Nation ${id} has invalid ${branch} progress.`);
    }
    const owned = selectTerritoriesOfV2(state, id);
    if (owned.length > 0 && state.territories[nation.capitalId]?.owner !== id) errors.push(`Living nation ${id} does not own its capital.`);
  }
  for (const id of territoryIds) {
    const territory = state.territories[id]!;
    if (!content.territories[id]) errors.push(`Unknown territory state: ${id}.`);
    if (!exactKeys(territory, TERRITORY_KEYS)) errors.push(`Territory ${id} has non-canonical keys.`);
    if (!exactKeys(territory.army, ARMY_KEYS)) errors.push(`Territory ${id} army has non-canonical keys.`);
    if (!state.players[territory.owner]) errors.push(`Territory ${id} has an unknown owner.`);
    if (!state.players[territory.coreOwner]) errors.push(`Territory ${id} has an unknown core owner.`);
    const expectedCapacity = stateTerritoryArmyCapacityTargetV2(state, content, id, territory.owner);
    if (territory.population < 0.01 || territory.economy < 0.10 || territory.condition < 0.15 || territory.condition > 1
      || territory.integration < 0 || territory.integration > 1
      || territory.army.capacity < 0 || territory.army.manpower < 0
      || !Number.isFinite(territory.army.baseAttack) || territory.army.baseAttack <= 0 || territory.army.baseAttack > 20
      || !Number.isFinite(territory.army.baseDefense) || territory.army.baseDefense <= 0 || territory.army.baseDefense > 20
      || Math.abs(territory.army.capacity - expectedCapacity) > 0.000001) errors.push(`Territory ${id} has invalid canonical values.`);
    const program = territory.integrationProgram;
    if (program) {
      if (!exactKeys(program, INTEGRATION_PROGRAM_KEYS)
        || !state.players[program.fromOwnerId]
        || !state.players[program.fromCoreOwnerId] || !state.players[program.toOwnerId]
        || program.fromOwnerId === program.toOwnerId
        || program.fromCoreOwnerId === program.toOwnerId
        || program.fromCoreOwnerId !== territory.coreOwner
        || program.toOwnerId !== territory.owner
        || !Number.isFinite(program.annualCost) || program.annualCost <= 0
        || !Number.isInteger(program.startedTick) || !Number.isInteger(program.completesTick)
        || program.startedTick < 0 || program.completesTick <= program.startedTick
        || program.completesTick <= state.tick || territory.integration >= 1) {
        errors.push(`Territory ${id} has an invalid integration program.`);
      }
    } else if (territory.coreOwner !== territory.owner || territory.integration !== 1) {
      errors.push(`Territory ${id} has unfinished integration without a program.`);
    }
  }
  const referencedNations = new Set<PlayerId>();
  for (const humanId of humanPlayerIds) if (state.players[humanId]) referencedNations.add(humanId);
  for (const territory of Object.values(state.territories)) {
    referencedNations.add(territory.owner);
    referencedNations.add(territory.coreOwner);
    if (territory.integrationProgram) {
      referencedNations.add(territory.integrationProgram.fromOwnerId);
      referencedNations.add(territory.integrationProgram.fromCoreOwnerId);
      referencedNations.add(territory.integrationProgram.toOwnerId);
    }
  }
  for (const war of state.wars) {
    referencedNations.add(war.attackerId);
    referencedNations.add(war.defenderId);
  }
  for (const truce of state.truces) {
    referencedNations.add(truce.leftId);
    referencedNations.add(truce.rightId);
  }
  for (const offer of state.offers) {
    referencedNations.add(offer.fromId);
    referencedNations.add(offer.toId);
  }
  for (const obligation of state.ceasefireObligations) {
    referencedNations.add(obligation.payerId);
    referencedNations.add(obligation.payeeId);
  }
  for (const memberId of state.aiEscalation.coalitionMembers) referencedNations.add(memberId);
  for (const id of referencedNations) {
    if (!state.players[id]) errors.push(`Missing referenced nation state: ${id}.`);
  }
  const warPairs = new Set<string>();
  for (const war of state.wars) {
    if (!hasOnlyKeys(war, WAR_KEYS)) errors.push(`War ${war.id} has non-canonical keys.`);
    if (!state.players[war.attackerId] || !state.players[war.defenderId] || war.attackerId === war.defenderId) errors.push(`War ${war.id} has invalid parties.`);
    const numericWarState = [
      war.startedTick,
      war.lastBattleTick,
      war.warScore,
      war.battles,
      war.attackerLosses,
      war.defenderLosses,
      war.attackerCivilianLosses ?? 0,
      war.defenderCivilianLosses ?? 0,
      war.lastPeaceOfferTick,
    ];
    if (!numericWarState.every(Number.isFinite)
      || (war.attackerCivilianLosses ?? 0) < 0
      || (war.defenderCivilianLosses ?? 0) < 0) {
      errors.push(`War ${war.id} has invalid numeric state.`);
    }
    const key = relationKeyV2(war.attackerId, war.defenderId);
    if (warPairs.has(key)) errors.push(`Duplicate active war: ${key}.`);
    warPairs.add(key);
    if (state.truces.some((truce) => relationKeyV2(truce.leftId, truce.rightId) === key)) errors.push(`War and truce overlap: ${key}.`);
    if (!Array.isArray(war.attackerOperations) || !Array.isArray(war.defenderOperations)) {
      errors.push(`War ${war.id} has invalid operation lists.`);
      continue;
    }
    const usedSources = new Set<TerritoryId>();
    for (const [commanderId, opponentId, operations] of [
      [war.attackerId, war.defenderId, war.attackerOperations],
      [war.defenderId, war.attackerId, war.defenderOperations],
    ] as const) {
      const signature = operations.map((operation) => `${operation.sourceId}:${operation.targetId}`).join('|');
      const sortedSignature = [...operations]
        .sort((left, right) => left.sourceId.localeCompare(right.sourceId) || left.targetId.localeCompare(right.targetId))
        .map((operation) => `${operation.sourceId}:${operation.targetId}`).join('|');
      if (signature !== sortedSignature) errors.push(`War ${war.id} operations are not stably sorted.`);
      for (const operation of operations) {
        if (!exactKeys(operation, OPERATION_KEYS)) errors.push(`War ${war.id} operation has non-canonical keys.`);
        const source = state.territories[operation.sourceId];
        const target = state.territories[operation.targetId];
        if (usedSources.has(operation.sourceId)) errors.push(`War ${war.id} reuses an army source across fronts.`);
        usedSources.add(operation.sourceId);
        if (!source || !target || operation.commanderId !== commanderId
          || source.owner !== commanderId
          || selectArmyCombatManpowerV2(state, commanderId, source.army) <= 0
          || target.owner !== opponentId) errors.push(`War ${war.id} has an invalid operation.`);
        if (selectTerritoryWarAccessV2(content, operation.sourceId, operation.targetId) !== operation.access) {
          errors.push(`War ${war.id} operation has no legal route.`);
        }
      }
    }
  }
  for (const truce of state.truces) {
    if (!exactKeys(truce, TRUCE_KEYS)) errors.push('Truce has non-canonical keys.');
    if (!state.players[truce.leftId] || !state.players[truce.rightId] || truce.leftId === truce.rightId || !Number.isFinite(truce.expiresTick)) errors.push('Truce has invalid references or values.');
  }
  for (const obligation of state.ceasefireObligations) {
    if (!exactKeys(obligation, CEASEFIRE_OBLIGATION_KEYS)) errors.push('Ceasefire obligation has non-canonical keys.');
    if (!state.players[obligation.payerId] || !state.players[obligation.payeeId]
      || obligation.payerId === obligation.payeeId || !obligation.warId
      || ![obligation.weeklyCost, obligation.startsTick, obligation.expiresTick].every(Number.isFinite)
      || obligation.weeklyCost < 0 || obligation.expiresTick <= obligation.startsTick) {
      errors.push('Ceasefire obligation has invalid references or values.');
    }
  }
  for (const offer of state.offers) {
    if (!hasOnlyKeys(offer, OFFER_KEYS)) errors.push(`Offer ${offer.id} has non-canonical keys.`);
    if (!state.players[offer.fromId] || !state.players[offer.toId] || !state.wars.some((war) => war.id === offer.warId)) errors.push(`Offer ${offer.id} has invalid references.`);
    if (![offer.createdTick, offer.expiresTick, offer.cashAmount ?? 0, offer.weeklyCost ?? 0, offer.paymentWeeks ?? 0].every(Number.isFinite)
      || (offer.settlement === 'ceasefire' && (!(offer.weeklyCost! > 0) || offer.paymentWeeks !== CEASEFIRE_PAYMENT_WEEKS))) {
      errors.push(`Offer ${offer.id} has invalid numeric state.`);
    }
  }
  return errors;
}

export function assertInvariantsV2(state: WorldStateV2, content: WorldContentV2): void {
  const errors = invariantErrorsV2(state, content);
  if (errors.length > 0) throw new Error(`V2 invariant failure:\n${errors.join('\n')}`);
}
