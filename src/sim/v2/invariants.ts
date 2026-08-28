import {
  ALLIANCE_OFFER_DURATION_TICKS,
  CEASEFIRE_PAYMENT_WEEKS,
  PROPAGANDA_DURATION_TICKS,
  RESEARCH_BRANCHES,
  V2_MAP_ID,
  V2_RULES_VERSION,
  WAR_CAMPAIGN_MAX_TICKS,
  WAR_REVENGE_WINDOW_TICKS,
} from './balance';
import type { WorldContentV2 } from './content';
import { stateTerritoryArmyCapacityTargetV2 } from './capacity';
import { isHumanPlayerV2 } from './humanPlayers';
import { OPENING_ARMY_BONUS_DURATION_TICKS_V2 } from './openingArmyBonus';
import {
  ANTARCTIC_SECTOR_IDS_V2,
  ARCTIC_PROJECT_IDS_V2,
} from './polarEndgame';
import { contentVersionForWorldContentV2 } from './scenarios';
import {
  finiteStateNumbersV2,
  relationKeyV2,
  selectArmyCombatManpowerV2,
  selectIsEliminatedV2,
  selectTerritoriesOfV2,
  selectTerritoryWarAccessV2,
} from './selectors';
import type { PlayerId, TerritoryId, WorldStateV2 } from './types';

const NATION_KEYS = ['budget', 'capitalId', 'ceasefiresRequested', 'domesticFoodCapacity', 'empireName', 'foodSecurity', 'foodStock', 'manualActionUses', 'openingArmyBonus', 'propagandaAvailableTick', 'propagandaProgram', 'rapidRecruitmentAvailableTick', 'research', 'researchSurgeAvailableTick', 'trainedReserves', 'treasury', 'warFatigue'];
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
const OPENING_ARMY_BONUS_KEYS = ['expiresTick', 'initialManpower', 'remainingManpower', 'startedTick'];
const INTEGRATION_PROGRAM_KEYS = ['annualCost', 'cause', 'completesTick', 'fromCoreOwnerId', 'fromOwnerId', 'startedTick', 'toOwnerId'];
const WAR_KEYS = ['attackerCivilianLosses', 'attackerId', 'attackerLosses', 'attackerOperations', 'battles', 'campaign', 'defenderCivilianLosses', 'defenderId', 'defenderLosses', 'defenderOperations', 'id', 'lastBattleTick', 'lastPeaceOfferTick', 'revenge', 'startedTick', 'warScore'];
const WAR_REVENGE_KEYS = ['claimantId', 'expiresTick', 'triggeredTick'];
const WAR_CAMPAIGN_KEYS = ['attackerCaptures', 'attackerObjective', 'consolidationUntilTick', 'defenderCaptures', 'defenderObjective', 'expiresTick'];
const OPERATION_KEYS = ['access', 'commanderId', 'doctrine', 'holdUntilTick', 'lastBattleTick', 'momentum', 'sourceId', 'startedTick', 'targetId'];
const TRUCE_KEYS = ['expiresTick', 'leftId', 'rightId'];
const CEASEFIRE_OBLIGATION_KEYS = ['expiresTick', 'payeeId', 'payerId', 'startsTick', 'warId', 'weeklyCost'];
const OFFER_KEYS = ['cashAmount', 'createdTick', 'expiresTick', 'fromId', 'id', 'paymentWeeks', 'settlement', 'status', 'toId', 'warId', 'weeklyCost'];
const ALLIANCE_KEYS = ['formedTick', 'leftId', 'rightId'];
const ALLIANCE_OFFER_KEYS = ['createdTick', 'expiresTick', 'fromId', 'toId'];
const AI_ESCALATION_KEYS = ['coalitionMembers', 'globalThreat', 'lastFederationTick', 'lastHumanPower', 'lastHumanTerritoryCount', 'lastWarStartTick', 'resistanceLevel'];
const POLAR_ENDGAME_KEYS = ['arcticPrograms', 'bossIntegrity', 'bossPhase', 'contactTick', 'earthDefenseMembers', 'expeditions', 'globalWave', 'nextCounteroffensiveTick', 'nextExpeditionId', 'phase', 'revealedBy', 'sectors', 'suspicionReliefEarned', 'victoryCommanderId', 'victoryTick', 'visualRevision', 'warningAcknowledgedBy', 'warningTick'];
const ARCTIC_PROGRESS_KEYS = ['activeProject', 'completedProjects', 'playerId'];
const ARCTIC_RUN_KEYS = ['completesTick', 'costPaid', 'playerId', 'projectId', 'startedTick'];
const ANTARCTIC_SECTOR_KEYS = ['discoveredTick', 'integrity', 'securedBy', 'securedTick', 'status', 'wave'];
const ANTARCTIC_EXPEDITION_KEYS = ['damageDealt', 'id', 'initialManpower', 'lastPulseTick', 'manpower', 'playerId', 'sectorId', 'startedTick'];
const OPTIONAL_CANONICAL_KEYS = ['cause', 'integrationProgram'] as const;
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
  if (state.schemaVersion !== 22) errors.push('Canonical state must use schema version 22.');
  if (state.rulesVersion !== V2_RULES_VERSION) errors.push('Canonical state has an incompatible rules version.');
  if (state.contentVersion !== contentVersionForWorldContentV2(content)) {
    errors.push('Canonical state does not match the supplied scenario content version.');
  }
  if (content.metadata?.generatedFromSeed !== undefined
    && state.seed !== content.metadata.generatedFromSeed) {
    errors.push('Canonical state seed does not match the generated scenario seed.');
  }
  if (state.mapId !== V2_MAP_ID) errors.push('Canonical state has an incompatible map id.');
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
  const firstIntegrationDiscountUsedBy = state.firstIntegrationDiscountUsedBy;
  if (!Array.isArray(firstIntegrationDiscountUsedBy)
    || new Set(firstIntegrationDiscountUsedBy).size !== firstIntegrationDiscountUsedBy.length
    || firstIntegrationDiscountUsedBy.some((id) => !humanPlayerIds.includes(id))
    || firstIntegrationDiscountUsedBy.join('|') !== [...firstIntegrationDiscountUsedBy]
      .sort((left, right) => left.localeCompare(right)).join('|')) {
    errors.push('First player integration discount ledger is invalid.');
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
  const polar = state.polarEndgame;
  const polarPhases = ['dormant', 'arctic-research', 'warning', 'contact', 'counteroffensive', 'core-exposed', 'victory'];
  if (!polar || !exactKeys(polar, POLAR_ENDGAME_KEYS)
    || !polarPhases.includes(polar.phase)
    || ![polar.globalWave, polar.bossPhase, polar.bossIntegrity, polar.suspicionReliefEarned, polar.visualRevision, polar.nextExpeditionId]
      .every(Number.isFinite)
    || !Number.isInteger(polar.globalWave) || polar.globalWave < 1
    || !Number.isInteger(polar.bossPhase) || polar.bossPhase < 0 || polar.bossPhase > 3
    || polar.bossIntegrity < 0 || polar.bossIntegrity > 100
    || polar.suspicionReliefEarned < 0
    || !Number.isInteger(polar.visualRevision) || polar.visualRevision < 0
    || !Number.isInteger(polar.nextExpeditionId) || polar.nextExpeditionId < 1
    || polar.revealedBy !== null && !content.nations[polar.revealedBy]
    || polar.victoryCommanderId !== null && !content.nations[polar.victoryCommanderId]
    || polar.phase !== 'victory' && polar.victoryCommanderId !== null
    || ![polar.warningTick, polar.contactTick, polar.victoryTick, polar.nextCounteroffensiveTick]
      .every((value) => value === null || Number.isInteger(value) && value >= 0 && value <= state.tick + 52)
    || (polar.phase === 'dormant' || polar.phase === 'arctic-research') && polar.warningTick !== null
    || !['dormant', 'arctic-research'].includes(polar.phase) && polar.warningTick === null
    || ['contact', 'counteroffensive', 'core-exposed', 'victory'].includes(polar.phase) && polar.contactTick === null
    || polar.phase === 'victory' && polar.victoryTick === null) {
    errors.push('Polar endgame state is invalid.');
  }
  if (polar) {
    if (new Set(polar.warningAcknowledgedBy).size !== polar.warningAcknowledgedBy.length
      || polar.warningAcknowledgedBy.some((id) => !state.humanPlayerIds.includes(id))
      || polar.warningAcknowledgedBy.join('|') !== [...polar.warningAcknowledgedBy]
        .sort((left, right) => left.localeCompare(right)).join('|')) {
      errors.push('Polar warning acknowledgement ledger is invalid.');
    }
    for (const [rawPlayerId, progress] of Object.entries(polar.arcticPrograms)) {
      const playerId = rawPlayerId as PlayerId;
      if (!progress || !exactKeys(progress, ARCTIC_PROGRESS_KEYS)
        || progress.playerId !== playerId || !state.humanPlayerIds.includes(playerId)
        || new Set(progress.completedProjects).size !== progress.completedProjects.length
        || progress.completedProjects.some((id) => !ARCTIC_PROJECT_IDS_V2.includes(id))
        || progress.completedProjects.join('|') !== [...progress.completedProjects]
          .sort((left, right) => ARCTIC_PROJECT_IDS_V2.indexOf(left) - ARCTIC_PROJECT_IDS_V2.indexOf(right)).join('|')) {
        errors.push(`Arctic research program ${rawPlayerId} is invalid.`);
        continue;
      }
      const run = progress.activeProject;
      if (run && (!exactKeys(run, ARCTIC_RUN_KEYS)
        || run.playerId !== playerId || !ARCTIC_PROJECT_IDS_V2.includes(run.projectId)
        || progress.completedProjects.includes(run.projectId)
        || ![run.startedTick, run.completesTick, run.costPaid].every(Number.isFinite)
        || !Number.isInteger(run.startedTick) || !Number.isInteger(run.completesTick)
        || run.startedTick < 0 || run.startedTick > state.tick || run.completesTick <= state.tick
        || run.completesTick <= run.startedTick || run.costPaid <= 0)) {
        errors.push(`Arctic research run ${rawPlayerId} is invalid.`);
      }
    }
    const sectorKeys = Object.keys(polar.sectors).sort();
    if (sectorKeys.length !== ANTARCTIC_SECTOR_IDS_V2.length
      || sectorKeys.some((id, index) => id !== [...ANTARCTIC_SECTOR_IDS_V2].sort()[index])) {
      errors.push('Antarctic sector record is incomplete.');
    }
    for (const sectorId of ANTARCTIC_SECTOR_IDS_V2) {
      const sector = polar.sectors[sectorId];
      if (!sector || !exactKeys(sector, ANTARCTIC_SECTOR_KEYS)
        || !['hidden', 'available', 'contested', 'secured'].includes(sector.status)
        || !Number.isFinite(sector.integrity) || sector.integrity < 0 || sector.integrity > 100
        || !Number.isInteger(sector.wave) || sector.wave < 1
        || ![sector.discoveredTick, sector.securedTick]
          .every((value) => value === null || Number.isInteger(value) && value >= 0 && value <= state.tick)
        || sector.securedBy !== null && !content.nations[sector.securedBy]
        || sector.status === 'secured' && (sector.integrity !== 0 || sector.securedTick === null)
        || sector.status === 'hidden' && sector.discoveredTick !== null) {
        errors.push(`Antarctic sector ${sectorId} is invalid.`);
      }
    }
    if (polar.phase === 'victory'
      && polar.victoryCommanderId !== polar.sectors['zero-point-core']?.securedBy) {
      errors.push('Polar victory commander does not match the final core strike.');
    }
    const expeditionIds = new Set<number>();
    for (const expedition of polar.expeditions) {
      expeditionIds.add(expedition.id);
      if (!exactKeys(expedition, ANTARCTIC_EXPEDITION_KEYS)
        || !Number.isInteger(expedition.id) || expedition.id < 1
        || !state.players[expedition.playerId]
        || !ANTARCTIC_SECTOR_IDS_V2.includes(expedition.sectorId)
        || polar.sectors[expedition.sectorId]?.status !== 'contested'
        || ![expedition.manpower, expedition.initialManpower, expedition.startedTick, expedition.lastPulseTick, expedition.damageDealt].every(Number.isFinite)
        || expedition.manpower <= 0 || expedition.initialManpower < expedition.manpower
        || expedition.startedTick < 0 || expedition.startedTick > expedition.lastPulseTick || expedition.lastPulseTick > state.tick
        || expedition.damageDealt < 0) {
        errors.push(`Antarctic expedition ${expedition.id} is invalid.`);
      }
    }
    if (expeditionIds.size !== polar.expeditions.length
      || polar.expeditions.some((expedition, index) => index > 0 && polar.expeditions[index - 1]!.id >= expedition.id)
      || polar.expeditions.some((expedition) => expedition.id >= polar.nextExpeditionId)) {
      errors.push('Antarctic expedition ordering is invalid.');
    }
    if (new Set(polar.earthDefenseMembers).size !== polar.earthDefenseMembers.length
      || polar.earthDefenseMembers.some((id) => !state.players[id])
      || polar.earthDefenseMembers.join('|') !== [...polar.earthDefenseMembers]
        .sort((left, right) => left.localeCompare(right)).join('|')) {
      errors.push('Earth defense membership is invalid.');
    }
  }
  const humanNationExists = Boolean(state.players[state.humanPlayerId]);
  if (!humanNationExists && (!state.gameOver || !state.winnerId || !state.players[state.winnerId])) {
    errors.push('Human nation state is missing outside a completed absorption defeat.');
  }
  for (const id of content.territoryIds) if (!state.territories[id]) errors.push(`Missing territory state: ${id}.`);
  for (const id of playerIds) {
    const nation = state.players[id]!;
    const owned = selectTerritoriesOfV2(state, id);
    if (!content.nations[id]) errors.push(`Unknown nation state: ${id}.`);
    if (!exactKeys(nation, NATION_KEYS)) errors.push(`Nation ${id} has non-canonical keys.`);
    if (nation.openingArmyBonus) {
      const bonus = nation.openingArmyBonus;
      const deployed = owned.reduce((sum, territory) => sum + territory.army.manpower, 0);
      if (!exactKeys(bonus, OPENING_ARMY_BONUS_KEYS)
        || ![bonus.initialManpower, bonus.remainingManpower, bonus.startedTick, bonus.expiresTick].every(Number.isFinite)
        || !Number.isInteger(bonus.startedTick) || !Number.isInteger(bonus.expiresTick)
        || bonus.startedTick < 0 || state.tick < bonus.startedTick
        || bonus.expiresTick - bonus.startedTick !== OPENING_ARMY_BONUS_DURATION_TICKS_V2
        || bonus.initialManpower <= 0 || bonus.remainingManpower <= 0
        || bonus.remainingManpower > bonus.initialManpower + 0.000000001
        || bonus.remainingManpower > deployed + 0.000000001) {
        errors.push(`Nation ${id} has an invalid temporary opening army bonus.`);
      }
    }
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
        || (program.cause !== undefined
          && program.cause !== 'conquest' && program.cause !== 'federation')
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
  for (const alliance of state.alliances) {
    referencedNations.add(alliance.leftId);
    referencedNations.add(alliance.rightId);
  }
  for (const offer of state.allianceOffers) {
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
    const revenge = war.revenge as unknown;
    if (revenge !== undefined && revenge !== null) {
      if (typeof revenge !== 'object' || Array.isArray(revenge)) {
        errors.push(`War ${war.id} has invalid revenge state.`);
      } else {
        const claim = revenge as NonNullable<typeof war.revenge>;
        if (!exactKeys(claim, WAR_REVENGE_KEYS)
          || (claim.claimantId !== war.attackerId && claim.claimantId !== war.defenderId)
          || !Number.isInteger(claim.triggeredTick) || !Number.isInteger(claim.expiresTick)
          || claim.triggeredTick < war.startedTick || claim.triggeredTick > state.tick
          || claim.expiresTick - claim.triggeredTick !== WAR_REVENGE_WINDOW_TICKS
          || claim.expiresTick <= state.tick) {
          errors.push(`War ${war.id} has invalid revenge state.`);
        }
      }
    }
    const campaign = war.campaign as unknown;
    if (campaign !== undefined) {
      if (!campaign || typeof campaign !== 'object' || Array.isArray(campaign)) {
        errors.push(`War ${war.id} has invalid campaign state.`);
      } else {
        const objective = campaign as NonNullable<typeof war.campaign>;
        const integerValues = [
          objective.attackerObjective,
          objective.defenderObjective,
          objective.attackerCaptures,
          objective.defenderCaptures,
          objective.consolidationUntilTick,
          objective.expiresTick,
        ];
        if (!exactKeys(objective, WAR_CAMPAIGN_KEYS)
          || !integerValues.every(Number.isInteger)
          || objective.attackerObjective < 1 || objective.attackerObjective > 3
          || objective.defenderObjective !== 1
          || objective.attackerCaptures < 0 || objective.defenderCaptures < 0
          || objective.consolidationUntilTick < war.startedTick
          || objective.consolidationUntilTick > objective.expiresTick
          || objective.expiresTick - war.startedTick !== WAR_CAMPAIGN_MAX_TICKS) {
          errors.push(`War ${war.id} has invalid campaign state.`);
        }
      }
    }
    const key = relationKeyV2(war.attackerId, war.defenderId);
    if (warPairs.has(key)) errors.push(`Duplicate active war: ${key}.`);
    warPairs.add(key);
    if (state.truces.some((truce) => relationKeyV2(truce.leftId, truce.rightId) === key)) errors.push(`War and truce overlap: ${key}.`);
    if (state.alliances.some((alliance) => relationKeyV2(alliance.leftId, alliance.rightId) === key)) {
      errors.push(`War and alliance overlap: ${key}.`);
    }
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
  const alliancePairs = new Set<string>();
  const allianceSignature = state.alliances.map((alliance) => `${alliance.leftId}:${alliance.rightId}`).join('|');
  const sortedAllianceSignature = [...state.alliances]
    .sort((left, right) => left.leftId.localeCompare(right.leftId) || left.rightId.localeCompare(right.rightId))
    .map((alliance) => `${alliance.leftId}:${alliance.rightId}`).join('|');
  if (allianceSignature !== sortedAllianceSignature) errors.push('Alliances are not stably sorted.');
  for (const alliance of state.alliances) {
    const key = relationKeyV2(alliance.leftId, alliance.rightId);
    if (!exactKeys(alliance, ALLIANCE_KEYS)
      || alliance.leftId.localeCompare(alliance.rightId) >= 0
      || !isHumanPlayerV2(state, alliance.leftId) || !isHumanPlayerV2(state, alliance.rightId)
      || !state.players[alliance.leftId] || !state.players[alliance.rightId]
      || selectIsEliminatedV2(state, alliance.leftId) || selectIsEliminatedV2(state, alliance.rightId)
      || !Number.isInteger(alliance.formedTick) || alliance.formedTick < 0 || alliance.formedTick > state.tick
      || warPairs.has(key)) {
      errors.push(`Alliance ${key} is invalid.`);
    }
    if (alliancePairs.has(key)) errors.push(`Duplicate alliance: ${key}.`);
    alliancePairs.add(key);
  }
  const offerPairs = new Set<string>();
  const offerSignature = state.allianceOffers.map((offer) => `${offer.fromId}:${offer.toId}`).join('|');
  const sortedOfferSignature = [...state.allianceOffers]
    .sort((left, right) => left.fromId.localeCompare(right.fromId) || left.toId.localeCompare(right.toId))
    .map((offer) => `${offer.fromId}:${offer.toId}`).join('|');
  if (offerSignature !== sortedOfferSignature) errors.push('Alliance invitations are not stably sorted.');
  for (const offer of state.allianceOffers) {
    const key = relationKeyV2(offer.fromId, offer.toId);
    if (!exactKeys(offer, ALLIANCE_OFFER_KEYS)
      || offer.fromId === offer.toId
      || !isHumanPlayerV2(state, offer.fromId) || !isHumanPlayerV2(state, offer.toId)
      || !state.players[offer.fromId] || !state.players[offer.toId]
      || selectIsEliminatedV2(state, offer.fromId) || selectIsEliminatedV2(state, offer.toId)
      || !Number.isInteger(offer.createdTick) || !Number.isInteger(offer.expiresTick)
      || offer.createdTick < 0 || offer.createdTick > state.tick
      || offer.expiresTick - offer.createdTick !== ALLIANCE_OFFER_DURATION_TICKS
      || offer.expiresTick <= state.tick
      || alliancePairs.has(key) || warPairs.has(key)) {
      errors.push(`Alliance invitation ${offer.fromId}->${offer.toId} is invalid.`);
    }
    if (offerPairs.has(key)) errors.push(`Duplicate alliance invitation: ${key}.`);
    offerPairs.add(key);
  }
  return errors;
}

export function assertInvariantsV2(state: WorldStateV2, content: WorldContentV2): void {
  const errors = invariantErrorsV2(state, content);
  if (errors.length > 0) throw new Error(`V2 invariant failure:\n${errors.join('\n')}`);
}
