import { nextRandom, randomInt } from '../../game/random';
import {
  BATTLE_INTERVAL_TICKS,
  ATTACKER_MILITARY_LOSS_MULTIPLIER,
  CAPTURE_MIN_CONTRIBUTION_SHARE,
  CEASEFIRE_PAYEE_WEEKLY_REVENUE_CAP_SHARE,
  CEASEFIRE_PAYMENT_WEEKS,
  CEASEFIRE_POST_PAYMENT_TRUCE_TICKS,
  CEASEFIRE_PAYER_WEEKLY_REVENUE_SHARE,
  CEASEFIRE_REPEAT_COST_MULTIPLIER,
  COMBAT_DAMAGE_EFFECTIVENESS,
  COMBAT_POWER_RATIO_EXPONENT,
  COMBAT_ROUTE_STRENGTH_RATIO,
  CONQUEST_CAPTURE_GUARD_MAX_TRANSFER_SHARE,
  CONQUEST_CAPTURE_GUARD_TICKS,
  CONQUEST_GUARD_MIN_TRANSFER_SHARE,
  DECISIVE_SURRENDER_MAX_DEFENDER_FILL,
  DECISIVE_SURRENDER_MIN_CUMULATIVE_LOSS_SHARE,
  DECISIVE_SURRENDER_MIN_FORCE_RATIO,
  DECISIVE_SURRENDER_MIN_FRONT_TICKS,
  DECISIVE_SURRENDER_MIN_MOMENTUM,
  ATTACKER_CIVILIAN_LOSS_DEFENDER_SHARE,
  ATTACKER_CIVILIAN_LOSS_INTENSITY,
  ATTACKER_CIVILIAN_LOSS_POPULATION_CAP,
  DEFENDER_CIVILIAN_LOSS_INTENSITY,
  DEFENDER_CIVILIAN_LOSS_POPULATION_CAP,
  DEFENDER_COUNTERFIRE_MULTIPLIER,
  DEFENDER_POSITION_MULTIPLIER,
  PEACE_OFFER_DURATION_TICKS,
  PEACE_REQUEST_COOLDOWN_TICKS,
  PEACE_REQUEST_MIN_WAR_AGE_TICKS,
  POST_WAR_TRANSITION_FATIGUE,
  NAVAL_BATTLE_FATIGUE_MULTIPLIER,
  STALE_WAR_TICKS,
  TERRAIN_DEFENSE_MODIFIER,
  TRUCE_TICKS,
  WAR_ACCESS_ASSAULT_MULTIPLIER,
  WAR_ACCESS_CASUALTY_MULTIPLIER,
  WAR_ACCESS_SUPPLY_MULTIPLIER,
  warAccessSupplyMultiplierV2,
  WAR_MOBILIZATION_TICKS,
  WAR_REVENGE_WINDOW_TICKS,
  clamp,
  diminishingResearchLevelV2,
  round,
  smoothstep,
} from './balance';
import { areAlliedV2 } from './alliances';
import type { WorldContentV2 } from './content';
import {
  nationalArmyCapacityTargetV2,
  stateTerritoryArmyCapacityTargetV2,
  stateTerritoryArmySupportCeilingV2,
} from './capacity';
import {
  mixArmyBaseQualityV2,
  resetEmptyArmyBaseQualityV2,
} from './armyQuality';
import { addWorldEventV2 } from './events';
import { isHumanPlayerV2 } from './humanPlayers';
import { beginTerritoryIntegrationV2 } from './integration';
import { resistanceCombatMultiplierV2 } from './resistance';
import {
  composeTraitContextV2,
  traitNationContextV2,
  traitOperationContextV2,
  traitTerritoryContextV2,
  traitWarContextV2,
} from './traitContext';
import { countryTraitFactorV2, type TraitEvaluationContextV2 } from './traits';
import { selectWarStrainSummaryV2 } from './warStrain';
import {
  createMilitaryBaseSnapshotV2,
  selectActiveWarBetweenV2,
  selectArmyCombatManpowerV2,
  selectCurrentPowerV2,
  selectEffectiveAttackV2,
  selectEffectiveDefenseV2,
  selectIsEliminatedV2,
  selectArmyStrengthV2,
  selectNationalIqViewV2,
  selectNationalEconomyV2,
  selectTerritoriesOfV2,
  selectTerritoryPowerV2,
  selectTerritoryRouteDistanceKmV2,
  selectTreasurySeizureShareV2,
  selectTerritoryWarAccessV2,
  selectTotalManpowerV2,
  selectWarAccessTypeV2,
  selectWarMobilizationCostV2,
  selectWarsOfV2,
  invalidateTerritoryIndexV2,
  sortedTerritoryIdsV2,
  type MilitaryBaseSnapshotV2,
} from './selectors';
import type {
  BattleEventV2,
  BattleTactic,
  CeasefireTermsV2,
  CommandResultV2,
  FrontOperationV2,
  LiveWarEstimateV2,
  LogisticsMovementV2,
  OperationDoctrineV2,
  PeaceProposalTermsV2,
  PeaceSettlementV2,
  PlayerId,
  TerritoryId,
  TruceStateV2,
  WarStateV2,
  WarDeclarationStatusV2,
  WarForecastV2,
  WorldStateV2,
} from './types';

export interface WarConclusionSettlementV2 {
  kind: PeaceSettlementV2;
  payerId?: PlayerId;
  payeeId?: PlayerId;
  amount?: number;
  weeklyCost?: number;
  paymentWeeks?: number;
}

/** Transient exact conclusion data collected by WorldEngineV2; never canonical state. */
export interface WarConclusionV2 {
  war: WarStateV2;
  endedTick: number;
  reason: string;
  settlement?: WarConclusionSettlementV2;
}

interface FrontCandidateV2 {
  sourceId: TerritoryId;
  targetId: TerritoryId;
  access: 'land' | 'naval';
  score: number;
  viable: boolean;
}

interface CaptureOutcomeV2 {
  conquered: boolean;
  capturedPopulation: number;
  capturedEconomy: number;
  treasurySeized: number;
  defeatedId?: PlayerId;
}

function armyCombatCapacityV2(state: WorldStateV2, playerId: PlayerId, army: WorldStateV2['territories'][TerritoryId]['army']): number {
  void state;
  void playerId;
  return Math.max(army.capacity, army.manpower);
}

function combatSideTraitContextV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  territoryId: TerritoryId,
  role: 'attacker' | 'defender',
  access: 'land' | 'naval',
): TraitEvaluationContextV2 {
  return composeTraitContextV2(
    traitNationContextV2(state, playerId),
    traitTerritoryContextV2(state, content, playerId, territoryId),
    { role, access },
  );
}

/** Applies only positive additions; recovery remains a separate output channel. */
function addWarFatigueGainV2(
  state: WorldStateV2,
  playerId: PlayerId,
  amount: number,
  context?: TraitEvaluationContextV2,
): void {
  if (!(amount > 0) || !state.players[playerId]) return;
  const factor = countryTraitFactorV2(
    playerId,
    'war-fatigue-gain',
    composeTraitContextV2(traitNationContextV2(state, playerId), context),
  );
  state.players[playerId]!.warFatigue = round(clamp(
    state.players[playerId]!.warFatigue + amount * factor,
    0,
    100,
  ));
}

export interface CombatExchangeProjectionV2 {
  attackerStrength: number;
  defenderStrength: number;
  attackerAttack: number;
  attackerDefense: number;
  defenderAttack: number;
  defenderDefense: number;
  attackerSupply: number;
  defenderSupply: number;
  supportingForces: number;
  attackPressure: number;
  defenseShield: number;
  counterPressure: number;
  attackerShield: number;
  attackRatio: number;
  counterRatio: number;
  attackerLossRate: number;
  defenderLossRate: number;
  attackerLosses: number;
  defenderLosses: number;
}

function nationalDefenseCoordinationV2(
  state: WorldStateV2,
  content: WorldContentV2,
  defenderId: PlayerId,
): {
  coordination: number;
  counterattack: number;
  casualty: number;
} {
  const coordination = selectNationalIqViewV2(state, content, defenderId).logisticsMultiplier;
  return {
    coordination,
    counterattack: coordination,
    casualty: 1 / coordination,
  };
}

const doctrineTactic: Record<OperationDoctrineV2, BattleTactic> = {
  pressure: 'combined-arms',
  breakthrough: 'armored-breakthrough',
  siege: 'siege',
  counteroffensive: 'counterattack',
  consolidation: 'hold-the-line',
};

function truceWeeksRemainingV2(state: WorldStateV2, leftId: PlayerId, rightId: PlayerId): number {
  return state.truces.reduce((weeks, truce) => (
    (truce.leftId === leftId && truce.rightId === rightId)
    || (truce.leftId === rightId && truce.rightId === leftId)
      ? Math.max(weeks, truce.expiresTick - state.tick) : weeks
  ), 0);
}

function activeCeasefireObligationWeeksV2(state: WorldStateV2, leftId: PlayerId, rightId: PlayerId): number {
  return state.ceasefireObligations.reduce((weeks, obligation) => (
    ((obligation.payerId === leftId && obligation.payeeId === rightId)
      || (obligation.payerId === rightId && obligation.payeeId === leftId))
      && obligation.expiresTick > state.tick
      ? Math.max(weeks, obligation.expiresTick - state.tick) : weeks
  ), 0);
}

/** Other powers already attacking the same target become theatre rivals. A
 * linked regional intervention may name one existing belligerent as the side
 * being helped; that ally is intentionally excluded. */
function competingInvaderIdsV2(
  state: WorldStateV2,
  attackerId: PlayerId,
  defenderId: PlayerId,
  escalatedFromWarId?: string,
): PlayerId[] {
  const linkedWar = escalatedFromWarId
    ? state.wars.find((war) => war.id === escalatedFromWarId) : undefined;
  const alliedId = linkedWar && (linkedWar.attackerId === defenderId || linkedWar.defenderId === defenderId)
    ? (linkedWar.attackerId === defenderId ? linkedWar.defenderId : linkedWar.attackerId)
    : undefined;
  return [...new Set(selectWarsOfV2(state, defenderId)
    .map((war) => war.attackerId === defenderId ? war.defenderId : war.attackerId)
    .filter((id) => id !== attackerId && id !== alliedId
      && !selectIsEliminatedV2(state, id)
      && !areAlliedV2(state, attackerId, id)
      && !selectActiveWarBetweenV2(state, attackerId, id)))]
    .sort((left, right) => left.localeCompare(right));
}

/**
 * Once a human empire is critically overextended, AI attackers may pressure it
 * in parallel instead of turning that opportunity into extra wars among one
 * another. Their target wars remain independent and still count normally
 * against every ordinary attacker and global cap in the planner.
 */
function declarationRivalInvaderIdsV2(
  state: WorldStateV2,
  content: WorldContentV2,
  attackerId: PlayerId,
  defenderId: PlayerId,
  escalatedFromWarId?: string,
): PlayerId[] {
  const rivals = competingInvaderIdsV2(
    state,
    attackerId,
    defenderId,
    escalatedFromWarId,
  );
  if (isHumanPlayerV2(state, attackerId) || !isHumanPlayerV2(state, defenderId)) {
    return rivals;
  }
  return selectWarStrainSummaryV2(state, content, defenderId).score >= 75
    ? []
    : rivals;
}

export function canDeclareWarV2(
  state: WorldStateV2,
  content: WorldContentV2,
  attackerId: PlayerId,
  defenderId: PlayerId,
  escalatedFromWarId?: string,
): boolean {
  return warDeclarationStatusV2(state, content, attackerId, defenderId, escalatedFromWarId).allowed;
}

export function warDeclarationStatusV2(
  state: WorldStateV2,
  content: WorldContentV2,
  attackerId: PlayerId,
  defenderId: PlayerId,
  escalatedFromWarId?: string,
): WarDeclarationStatusV2 {
  const access = selectWarAccessTypeV2(state, content, attackerId, defenderId);
  const mobilizationCost = access === 'none' ? Number.POSITIVE_INFINITY
    : selectWarMobilizationCostV2(state, content, attackerId, defenderId);
  const army = selectArmyStrengthV2(state, content, attackerId);
  const activeFronts = selectWarsOfV2(state, attackerId).length;
  const armyWarning = army.fillRatio < 0.55
    ? `Only ${Math.round(army.fillRatio * 100)}% of the population-based army cap is currently manned; war remains legal but high risk.`
    : undefined;
  const rivalInvaders = declarationRivalInvaderIdsV2(
    state,
    content,
    attackerId,
    defenderId,
    escalatedFromWarId,
  );
  const frontWarning = activeFronts > 0
    ? `Opening front ${activeFronts + 1}: manpower, supply and war funding will be shared across every active war.`
    : undefined;
  const rivalryWarning = rivalInvaders.length > 0
    ? `Contested invasion: entering also opens ${rivalInvaders.length} rival war${rivalInvaders.length === 1 ? '' : 's'} against the other invader${rivalInvaders.length === 1 ? '' : 's'}.`
    : undefined;
  const warning = [rivalryWarning, frontWarning, armyWarning].filter(Boolean).join(' ') || undefined;
  const status = (allowed: boolean, reason?: string): WarDeclarationStatusV2 => ({
    allowed, reason, warning, access, mobilizationCost,
  });
  const attacker = state.players[attackerId];
  if (!attacker || !state.players[defenderId] || attackerId === defenderId) return status(false, 'Invalid nation pair.');
  if (selectIsEliminatedV2(state, attackerId) || selectIsEliminatedV2(state, defenderId)) return status(false, 'An eliminated nation cannot fight.');
  if (attacker.treasury < 0) return status(false, 'Repay national debt before declaring a new war.');
  if (selectActiveWarBetweenV2(state, attackerId, defenderId)) return status(false, 'These nations are already at war.');
  if (areAlliedV2(state, attackerId, defenderId)) return status(false, 'Player allies cannot declare war on each other.');
  const truceWeeks = truceWeeksRemainingV2(state, attackerId, defenderId);
  if (truceWeeks > 0) return status(false, `Peace treaty active for ${truceWeeks} more weeks.`);
  // Defence in depth for legacy/corrupt saves: instalments alone also make a
  // new bilateral war illegal, even if their paired truce record is missing.
  const paymentWeeks = activeCeasefireObligationWeeksV2(state, attackerId, defenderId);
  if (paymentWeeks > 0) return status(false, `Peace-contract payments are active for ${paymentWeeks} more weeks.`);
  const treatyRival = rivalInvaders.find((rivalId) => truceWeeksRemainingV2(state, attackerId, rivalId) > 0
    || activeCeasefireObligationWeeksV2(state, attackerId, rivalId) > 0);
  if (treatyRival) return status(false, 'A peace treaty with an existing invader blocks entry into this contested war.');
  if (access === 'none') return status(false, 'No legal land or naval route.');
  return status(true);
}

export function declareWarV2(
  state: WorldStateV2,
  content: WorldContentV2,
  attackerId: PlayerId,
  defenderId: PlayerId,
  escalatedFromWarId?: string,
): CommandResultV2 {
  const linkedWar = escalatedFromWarId
    ? state.wars.find((war) => war.id === escalatedFromWarId) : undefined;
  const declaration = warDeclarationStatusV2(
    state,
    content,
    attackerId,
    defenderId,
    escalatedFromWarId,
  );
  if (!declaration.allowed) return {
    accepted: false,
    reason: declaration.reason ?? 'War is not legal or affordable.',
  };
  const rivalInvaders = declarationRivalInvaderIdsV2(
    state,
    content,
    attackerId,
    defenderId,
    escalatedFromWarId,
  );
  const openWar = (newAttackerId: PlayerId, newDefenderId: PlayerId): void => {
    state.allianceOffers = state.allianceOffers.filter((offer) => !(
      (offer.fromId === newAttackerId && offer.toId === newDefenderId)
      || (offer.fromId === newDefenderId && offer.toId === newAttackerId)
    ));
    state.wars.push({
      id: `war-${state.nextWarId++}`,
      attackerId: newAttackerId,
      defenderId: newDefenderId,
      startedTick: state.tick,
      lastBattleTick: state.tick,
      warScore: 0,
      battles: 0,
      attackerLosses: 0,
      defenderLosses: 0,
      attackerCivilianLosses: 0,
      defenderCivilianLosses: 0,
      lastPeaceOfferTick: -1_000_000,
      revenge: null,
      attackerOperations: [],
      defenderOperations: [],
    });
  };
  openWar(attackerId, defenderId);
  for (const rivalId of rivalInvaders) openWar(attackerId, rivalId);
  if (!isHumanPlayerV2(state, attackerId)) state.aiEscalation.lastWarStartTick = state.tick;
  const rivalryMessage = rivalInvaders.length > 0
    ? ` The contested invasion also opened war with ${rivalInvaders.map((id) => content.nations[id]?.shortName ?? id).join(', ')}.`
    : '';
  const message = (linkedWar
    ? `The war between ${content.nations[linkedWar.attackerId]?.shortName ?? linkedWar.attackerId} and ${content.nations[linkedWar.defenderId]?.shortName ?? linkedWar.defenderId} escalated as ${content.nations[attackerId]?.name ?? attackerId} intervened against ${content.nations[defenderId]?.name ?? defenderId}.`
    : `${content.nations[attackerId]?.name ?? attackerId} declared war on ${content.nations[defenderId]?.name ?? defenderId}.`) + rivalryMessage;
  addWorldEventV2(state, 'war', 'critical', message, undefined, attackerId);
  return { accepted: true };
}

function connectionKindV2(content: WorldContentV2, sourceId: TerritoryId, targetId: TerritoryId): 'land' | 'naval' | undefined {
  return selectTerritoryWarAccessV2(content, sourceId, targetId);
}

function supplyDistanceV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  sourceId: TerritoryId,
): { distance: number; connected: boolean } {
  const capitalId = state.players[playerId]?.capitalId;
  if (!capitalId || state.territories[capitalId]?.owner !== playerId) return { distance: 0, connected: false };
  if (capitalId === sourceId) return { distance: 0, connected: true };
  const queue: Array<{ id: TerritoryId; distance: number }> = [{ id: capitalId, distance: 0 }];
  const seen = new Set<TerritoryId>([capitalId]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of content.territories[current.id]?.connections ?? []) {
      if (seen.has(edge.targetId) || state.territories[edge.targetId]?.owner !== playerId) continue;
      if (edge.targetId === sourceId) return { distance: current.distance + 1, connected: true };
      seen.add(edge.targetId);
      queue.push({ id: edge.targetId, distance: current.distance + 1 });
    }
  }
  return { distance: 0, connected: false };
}

export function supplyFactorV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  sourceId: TerritoryId,
  access: boolean | 'land' | 'naval',
  targetId?: TerritoryId,
  contextOverride?: TraitEvaluationContextV2,
): number {
  const territory = state.territories[sourceId];
  if (!territory) return 0.25;
  const route = supplyDistanceV2(state, content, playerId, sourceId);
  const supplyResearch = 1 + 0.01 * (state.players[playerId]?.research.effectLevels.supply ?? 0);
  const mode = typeof access === 'boolean' ? (access ? 'naval' : 'land') : access;
  const routeDistance = mode === 'naval' && targetId
    ? selectTerritoryRouteDistanceKmV2(content, sourceId, targetId) : undefined;
  const traitContext = composeTraitContextV2(
    traitNationContextV2(state, playerId),
    traitTerritoryContextV2(state, content, playerId, sourceId),
    { access: mode },
    contextOverride,
  );
  // These traits reduce only the already-existing pressure term. They never
  // scale the rest of supply, so global routes and short routes keep the same
  // baseline and the result retains its canonical clamp.
  const landHopPressure = 0.035 * route.distance
    * countryTraitFactorV2(playerId, 'land-hop-pressure', traitContext);
  const rawAccessLogistics = warAccessSupplyMultiplierV2(mode, routeDistance);
  const navalDistancePressureFactor = countryTraitFactorV2(
    playerId,
    'naval-distance-pressure',
    traitContext,
  );
  const accessLogistics = mode === 'naval'
    ? WAR_ACCESS_SUPPLY_MULTIPLIER.naval
      - (WAR_ACCESS_SUPPLY_MULTIPLIER.naval - rawAccessLogistics)
        * navalDistancePressureFactor
    : rawAccessLogistics;
  const frontSupplyFactor = countryTraitFactorV2(playerId, 'front-supply', traitContext);
  return clamp((1 - landHopPressure) * (0.60 + 0.40 * territory.condition)
    * (route.connected ? 1 : 0.55) * accessLogistics
    * supplyResearch * frontSupplyFactor, 0.25, 1);
}

function supportCountV2(state: WorldStateV2, content: WorldContentV2, sourceId: TerritoryId, owner: PlayerId): number {
  const sourceStrength = selectArmyCombatManpowerV2(state, owner, state.territories[sourceId]!.army);
  return (content.territories[sourceId]?.connections ?? []).filter((edge) => {
    const territory = state.territories[edge.targetId];
    if (territory?.owner !== owner) return false;
    const deployed = selectArmyCombatManpowerV2(state, owner, territory.army);
    // Empty capacity is infrastructure, not a combat penalty. A neighbouring
    // army supports the front according to soldiers actually present.
    return deployed > 0 && deployed >= sourceStrength * 0.10;
  }).length;
}

/**
 * Canonical, side-effect-free projection for one combat pulse. Forecasts and
 * live resolution deliberately share this function so a displayed advantage
 * cannot turn into an inverted casualty percentage once the battle starts.
 */
export function projectCombatExchangeV2(
  state: WorldStateV2,
  content: WorldContentV2,
  attackerId: PlayerId,
  defenderId: PlayerId,
  sourceId: TerritoryId,
  targetId: TerritoryId,
  access: 'land' | 'naval',
  varianceA = 1,
  varianceD = 1,
  militaryBaseSnapshot: MilitaryBaseSnapshotV2 = createMilitaryBaseSnapshotV2(state, content),
): CombatExchangeProjectionV2 | undefined {
  const source = state.territories[sourceId];
  const target = state.territories[targetId];
  const terrain = content.territories[targetId]?.terrain;
  if (!source || !target || !terrain || source.owner !== attackerId || target.owner !== defenderId) return undefined;

  const attackerTraitContext = combatSideTraitContextV2(
    state, content, attackerId, sourceId, 'attacker', access,
  );
  const defenderTraitContext = combatSideTraitContextV2(
    state, content, defenderId, targetId, 'defender', access,
  );
  const attackerSupply = supplyFactorV2(
    state, content, attackerId, sourceId, access, targetId, attackerTraitContext,
  );
  // Defenders retain the existing local-land physical supply calculation, but
  // trait access sees the actual incoming front (land or naval).
  const defenderSupply = supplyFactorV2(
    state, content, defenderId, targetId, false, undefined, defenderTraitContext,
  );
  const supportingForces = supportCountV2(state, content, sourceId, attackerId);
  const supportModifier = 1 + Math.min(0.20, 0.05 * supportingForces);
  const resistance = resistanceCombatMultiplierV2(state, attackerId, defenderId);
  const defensiveCoordination = nationalDefenseCoordinationV2(state, content, defenderId);
  const attackerAttack = selectEffectiveAttackV2(
    state, content, attackerId, source.army, militaryBaseSnapshot,
  ) * countryTraitFactorV2(attackerId, 'attack', attackerTraitContext);
  const attackerDefense = selectEffectiveDefenseV2(
    state, content, attackerId, source.army, militaryBaseSnapshot,
  ) * countryTraitFactorV2(attackerId, 'defense', attackerTraitContext);
  const defenderAttack = selectEffectiveAttackV2(
    state, content, defenderId, target.army, militaryBaseSnapshot,
  ) * countryTraitFactorV2(defenderId, 'attack', defenderTraitContext);
  const defenderDefense = selectEffectiveDefenseV2(
    state, content, defenderId, target.army, militaryBaseSnapshot,
  ) * countryTraitFactorV2(defenderId, 'defense', defenderTraitContext);
  const attackerStrength = selectArmyCombatManpowerV2(state, attackerId, source.army);
  const defenderStrength = selectArmyCombatManpowerV2(state, defenderId, target.army);

  const attackPressure = attackerStrength * attackerAttack * (0.50 + 0.50 * source.condition)
    * attackerSupply * supportModifier * resistance.attacker * WAR_ACCESS_ASSAULT_MULTIPLIER[access];
  const defenseShield = defenderStrength * defenderDefense * DEFENDER_POSITION_MULTIPLIER
    * TERRAIN_DEFENSE_MODIFIER[terrain] * (0.65 + 0.35 * target.condition)
    * defenderSupply * resistance.defender * defensiveCoordination.coordination;
  const counterPressure = defenderStrength <= 0 ? 0 : defenderStrength * defenderAttack
    * (0.50 + 0.50 * target.condition) * defenderSupply * defensiveCoordination.counterattack
    * DEFENDER_COUNTERFIRE_MULTIPLIER;
  const attackerShield = attackerStrength * attackerDefense
    * (0.65 + 0.35 * source.condition) * attackerSupply;
  const attackRatio = attackerStrength <= 0 ? 0
    : attackPressure / Math.max(0.000001, defenseShield);
  const counterRatio = defenderStrength <= 0 ? 0
    : counterPressure / Math.max(0.000001, attackerShield);

  const attackerCasualtyLevel = state.players[attackerId]!.research.effectLevels['casualty-reduction'];
  const defenderCasualtyLevel = state.players[defenderId]!.research.effectLevels['casualty-reduction'];
  const attackerCasualtyModifier = (1 - 0.50 * attackerCasualtyLevel / (attackerCasualtyLevel + 30))
    * countryTraitFactorV2(attackerId, 'military-casualties', attackerTraitContext);
  const defenderCasualtyModifier = (1 - 0.50 * defenderCasualtyLevel / (defenderCasualtyLevel + 30))
    * defensiveCoordination.casualty
    * countryTraitFactorV2(defenderId, 'military-casualties', defenderTraitContext);
  // Every deployed soldier contributes to effective pressure. Damage is
  // derived directly from that pressure and opposing protection; there is no
  // per-pulse rate or capacity ceiling. Remaining headcount is the only bound.
  const requestedDefenderDamage = defenderStrength <= 0 ? 0
    : defenderStrength * COMBAT_DAMAGE_EFFECTIVENESS * Math.pow(
      Math.max(0, attackRatio), COMBAT_POWER_RATIO_EXPONENT,
    ) * varianceA * defenderCasualtyModifier;
  const requestedAttackerDamage = attackerStrength <= 0 || counterPressure <= 0 ? 0
    : attackerStrength * COMBAT_DAMAGE_EFFECTIVENESS * Math.pow(
      Math.max(0, counterRatio), COMBAT_POWER_RATIO_EXPONENT,
    ) * varianceD * WAR_ACCESS_CASUALTY_MULTIPLIER[access]
      * ATTACKER_MILITARY_LOSS_MULTIPLIER * attackerCasualtyModifier;
  const defenderLosses = Math.min(target.army.manpower, Math.max(0, requestedDefenderDamage));
  const attackerLosses = Math.min(source.army.manpower, Math.max(0, requestedAttackerDamage));
  const defenderLossRate = defenderStrength > 0 ? defenderLosses / defenderStrength : 0;
  const attackerLossRate = attackerStrength > 0 ? attackerLosses / attackerStrength : 0;

  return {
    attackerStrength,
    defenderStrength,
    attackerAttack,
    attackerDefense,
    defenderAttack,
    defenderDefense,
    attackerSupply,
    defenderSupply,
    supportingForces,
    attackPressure,
    defenseShield,
    counterPressure,
    attackerShield,
    attackRatio,
    counterRatio,
    attackerLossRate,
    defenderLossRate,
    attackerLosses,
    defenderLosses,
  };
}

function frontCandidatesV2(
  state: WorldStateV2,
  content: WorldContentV2,
  commanderId: PlayerId,
  enemyId: PlayerId,
  militaryBaseSnapshot: MilitaryBaseSnapshotV2 = createMilitaryBaseSnapshotV2(state, content),
): FrontCandidateV2[] {
  const capital = state.players[enemyId]?.capitalId;
  const candidates: FrontCandidateV2[] = [];
  const sources = selectTerritoriesOfV2(state, commanderId);
  const nationalStrength = Math.max(0.000001, nationalCombatManpowerV2(state, commanderId));
  const addCandidate = (source: (typeof sources)[number], targetId: TerritoryId, access: FrontCandidateV2['access']) => {
      const target = state.territories[targetId];
      if (!target || target.owner !== enemyId) return;
      const sourceStrength = selectArmyCombatManpowerV2(state, commanderId, source.army);
      const supply = supplyFactorV2(state, content, commanderId, source.id, access, targetId);
      const support = Math.min(4, supportCountV2(state, content, source.id, commanderId));
      const targetStrength = selectArmyCombatManpowerV2(state, enemyId, target.army);
      const targetCapacity = armyCombatCapacityV2(state, enemyId, target.army);
      const targetFill = targetStrength / Math.max(1e-9, targetCapacity);
      const economyValue = Math.log10(1 + target.economy);
      const capitalValue = capital === targetId ? 4 : 0;
      const powerRatio = selectTerritoryPowerV2(state, content, source.id, militaryBaseSnapshot)
        / Math.max(1, selectTerritoryPowerV2(state, content, targetId, militaryBaseSnapshot));
      const commitmentShare = sourceStrength / nationalStrength;
      // A source that would be routed on contact remains a legal last resort,
      // but can never outrank a locally viable front elsewhere in the empire.
      const viable = targetStrength <= 0.000001
        || sourceStrength > targetStrength * COMBAT_ROUTE_STRENGTH_RATIO;
      const accessPenalty = access === 'naval' ? 0.75 : 0;
      const score = 5 * supply + support + 4 * (1 - targetFill) + economyValue
        + capitalValue + 2 * clamp(powerRatio, 0, 2)
        + 4 * Math.sqrt(clamp(commitmentShare, 0, 1)) - accessPenalty;
      candidates.push({ sourceId: source.id, targetId, access, score, viable });
  };
  for (const source of sources) {
    if (selectArmyCombatManpowerV2(state, commanderId, source.army) <= 0) continue;
    for (const edge of content.territories[source.id]?.connections ?? []) {
      if (state.territories[edge.targetId]?.owner === enemyId) {
        addCandidate(source, edge.targetId, edge.kind === 'sea' ? 'naval' : 'land');
      }
    }
  }
  return candidates.sort((a, b) => Number(b.viable) - Number(a.viable)
    || b.score - a.score || a.sourceId.localeCompare(b.sourceId) || a.targetId.localeCompare(b.targetId));
}

function prospectiveFrontCountV2(state: WorldStateV2, playerId: PlayerId, opponentId: PlayerId): number {
  const active = selectWarsOfV2(state, playerId);
  return Math.max(1, active.length
    + (active.some((war) => war.attackerId === opponentId || war.defenderId === opponentId) ? 0 : 1));
}

/** Small forecast edge supplied by the real finite trained-reserve pool. */
export function strategicReserveReadinessMultiplierV2(
  trainedReserves: number,
  activeCapacity: number,
): number {
  const reserveRatio = activeCapacity > 0
    ? clamp(trainedReserves / activeCapacity, 0, 1) : 0;
  return 0.95 + 0.05 * reserveRatio;
}

/** Cheap strategic layer for the forecast: field allocation, slow reserves,
 * treasury runway and food security matter, but the live front remains the
 * main signal. It intentionally avoids the full weekly AI-finance planner so
 * hovering candidate countries stays fast. */
function strategicReadinessV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  opponentId: PlayerId,
  militaryBaseSnapshot: MilitaryBaseSnapshotV2 = createMilitaryBaseSnapshotV2(state, content),
): number {
  const capacity = nationalCombatCapacityV2(state, playerId);
  const economy = selectNationalEconomyV2(state, content, playerId);
  const treasuryRunway = clamp(state.players[playerId]!.treasury
    / Math.max(0.001, economy.weeklyRevenue), -2, 8);
  const funding = 0.85 + 0.15 * clamp((treasuryRunway + 2) / 10, 0, 1);
  const food = 0.85 + 0.15 * clamp(state.players[playerId]!.foodSecurity, 0, 1);
  // Reserve manpower trains slowly in wartime, so it is only a modest edge.
  const reinforcement = strategicReserveReadinessMultiplierV2(
    state.players[playerId]!.trainedReserves,
    capacity,
  );
  const fronts = prospectiveFrontCountV2(state, playerId, opponentId);
  const allocation = 1 / (1 + 0.55 * (fronts - 1));
  return Math.max(0.000001, selectCurrentPowerV2(state, content, playerId, militaryBaseSnapshot)
    * funding * food * reinforcement * allocation);
}

function pulsesUntilEliminatedV2(
  ownStrength: number,
  projectedLosses: number,
): number {
  const captureThreshold = 0.000000001;
  if (ownStrength <= captureThreshold) return 1;
  if (projectedLosses <= 0) return Number.POSITIVE_INFINITY;
  // With a power-ratio exponent of one, damage is primarily absolute opposing
  // pressure. Project the first-order number of equal exchanges to zero rather
  // than compounding the opening percentage loss toward an artificial tail.
  return Math.max(1, Math.ceil(ownStrength / projectedLosses));
}

export function forecastWarV2(
  state: WorldStateV2,
  content: WorldContentV2,
  attackerId: PlayerId,
  defenderId: PlayerId,
  militaryBaseSnapshot: MilitaryBaseSnapshotV2 = createMilitaryBaseSnapshotV2(state, content),
): WarForecastV2 {
  const access = selectWarAccessTypeV2(state, content, attackerId, defenderId);
  const candidate = frontCandidatesV2(
    state, content, attackerId, defenderId, militaryBaseSnapshot,
  )[0];
  const fallback = (winChance: number): WarForecastV2 => ({
    attackerId, defenderId, access, winChance,
    outlook: winChance >= 82 ? 'dominant' : winChance >= 64 ? 'favored'
      : winChance >= 42 ? 'contested' : winChance >= 22 ? 'risky' : 'desperate',
    attackerStrength: 0, defenderStrength: 0,
    defenderEmpireStrength: 0,
    defenderEmpireSupport: 0,
    defenderTerritoryCount: selectTerritoriesOfV2(state, defenderId).length,
    retaliationExpected: false,
    attackerAttack: 0, attackerDefense: 0, defenderAttack: 0, defenderDefense: 0,
    attackerSupply: 0, defenderSupply: 0,
    supportingForces: 0,
    defenderPositionMultiplier: DEFENDER_POSITION_MULTIPLIER,
    terrainDefenseMultiplier: 1,
    projectedAttackerLosses: 0, projectedDefenderLosses: 0,
    projectedAttackerLossRate: 0, projectedDefenderLossRate: 0,
    estimatedWeeksMin: 0, estimatedWeeksMax: 0,
  });
  if (!candidate || access === 'none') return fallback(0);
  const source = state.territories[candidate.sourceId]!;
  const target = state.territories[candidate.targetId]!;
  const terrain = content.territories[candidate.targetId]!.terrain;
  const attackerStrength = selectArmyCombatManpowerV2(state, attackerId, source.army);
  const defenderStrength = selectArmyCombatManpowerV2(state, defenderId, target.army);
  const projection = projectCombatExchangeV2(
    state, content, attackerId, defenderId,
    candidate.sourceId, candidate.targetId, candidate.access,
    1, 1, militaryBaseSnapshot,
  );
  if (!projection) return fallback(0);
  const terrainDefenseMultiplier = TERRAIN_DEFENSE_MODIFIER[terrain];
  const attritionEdge = projection.attackerLossRate <= 0
    ? (projection.defenderLossRate > 0 ? 20 : 1)
    : projection.defenderLossRate / projection.attackerLossRate;
  const strategicEdge = strategicReadinessV2(
    state, content, attackerId, defenderId, militaryBaseSnapshot,
  ) / strategicReadinessV2(
    state, content, defenderId, attackerId, militaryBaseSnapshot,
  );
  const defenderTerritories = selectTerritoriesOfV2(state, defenderId);
  const defenderTerritoryCount = defenderTerritories.length;
  const defenderEmpireStrength = nationalCombatManpowerV2(state, defenderId);
  const defenderEmpireSupport = defenderTerritories.reduce((sum, territory) => (
    sum + Math.max(0,
      stateTerritoryArmySupportCeilingV2(state, content, territory.id, defenderId)
      - stateTerritoryArmyCapacityTargetV2(state, content, territory.id, defenderId))
  ), 0);
  const retaliationExpected = defenderTerritoryCount > 1;
  // This is a campaign forecast, not merely the first border exchange. The
  // full national readiness now carries almost half the estimate, while a
  // multi-territory empire's reinforcement room and guaranteed bounded
  // retaliation add real campaign depth. A locally empty border can therefore
  // no longer produce an automatic 95% against an otherwise capable empire.
  const tacticalEdge = clamp(attritionEdge, 0.08, 8);
  const campaignDepth = Math.log2(Math.max(1, defenderTerritoryCount));
  const supportDepth = defenderEmpireSupport / Math.max(
    0.000001,
    defenderEmpireStrength + defenderEmpireSupport,
  );
  const defenderCampaignMultiplier = 1
    + 0.10 * campaignDepth
    + 0.08 * clamp(supportDepth, 0, 1)
    + (retaliationExpected ? 0.12 : 0);
  const combinedRatio = tacticalEdge ** 0.54
    * clamp(strategicEdge, 0.05, 20) ** 0.46
    / defenderCampaignMultiplier;
  // One decimal preserves real ATK/DEF movement that whole-percent rounding
  // can hide. Multi-territory campaigns retain extra uncertainty because the
  // attacker must survive the defender's one-shot retaliation opportunity.
  const maximumChance = retaliationExpected ? 92 : 95;
  const winChance = round(clamp(50 + Math.log(combinedRatio) * 24, 5, maximumChance), 1);
  const defeatPulses = pulsesUntilEliminatedV2(
    defenderStrength, projection.defenderLosses,
  );
  const retreatPulses = pulsesUntilEliminatedV2(
    attackerStrength, projection.attackerLosses,
  );
  const decisivePulses = Math.min(defeatPulses, retreatPulses);
  const centralWeeks = Number.isFinite(decisivePulses)
    ? clamp(BATTLE_INTERVAL_TICKS * decisivePulses, 4, 156) : 156;
  return {
    attackerId, defenderId, access: candidate.access,
    sourceId: candidate.sourceId, targetId: candidate.targetId, terrain,
    winChance,
    outlook: winChance >= 82 ? 'dominant' : winChance >= 64 ? 'favored'
      : winChance >= 42 ? 'contested' : winChance >= 22 ? 'risky' : 'desperate',
    attackerStrength: round(attackerStrength), defenderStrength: round(defenderStrength),
    defenderEmpireStrength: round(defenderEmpireStrength),
    defenderEmpireSupport: round(defenderEmpireSupport),
    defenderTerritoryCount,
    retaliationExpected,
    attackerAttack: round(projection.attackerAttack), attackerDefense: round(projection.attackerDefense),
    defenderAttack: round(projection.defenderAttack), defenderDefense: round(projection.defenderDefense),
    attackerSupply: round(projection.attackerSupply), defenderSupply: round(projection.defenderSupply),
    supportingForces: projection.supportingForces,
    defenderPositionMultiplier: DEFENDER_POSITION_MULTIPLIER,
    terrainDefenseMultiplier,
    projectedAttackerLosses: round(projection.attackerLosses),
    projectedDefenderLosses: round(projection.defenderLosses),
    projectedAttackerLossRate: round(projection.attackerLossRate),
    projectedDefenderLossRate: round(projection.defenderLossRate),
    estimatedWeeksMin: Math.max(2, Math.round(centralWeeks * 0.72)),
    estimatedWeeksMax: Math.max(4, Math.round(centralWeeks * 1.35)),
  };
}

/**
 * Estimate the remaining duration of an active war from the front that most
 * recently exchanged fire. Unlike the declaration forecast this is
 * perspective-aware, blends the exact next-pulse formula with observed war
 * losses. The deliberately wide range communicates uncertainty from future
 * recruitment, logistics and front changes without running the expensive
 * full finance planner during every HUD refresh.
 */
export function estimateLiveWarV2(
  state: WorldStateV2,
  content: WorldContentV2,
  warId: string,
  viewerId: PlayerId,
): LiveWarEstimateV2 | undefined {
  const war = state.wars.find((candidate) => candidate.id === warId);
  if (!war || (war.attackerId !== viewerId && war.defenderId !== viewerId)) return undefined;
  const enemyId = war.attackerId === viewerId ? war.defenderId : war.attackerId;
  const totalOwnLosses = viewerId === war.attackerId ? war.attackerLosses : war.defenderLosses;
  const totalEnemyLosses = viewerId === war.attackerId ? war.defenderLosses : war.attackerLosses;
  const operations = [...war.attackerOperations, ...war.defenderOperations]
    .filter((operation) => operationValidV2(
      state, content, operation, operation?.commanderId ?? viewerId,
      operation?.commanderId === war.attackerId ? war.defenderId : war.attackerId,
    ))
    .sort((left, right) => Number(right.lastBattleTick === war.lastBattleTick)
      - Number(left.lastBattleTick === war.lastBattleTick)
      || right.lastBattleTick - left.lastBattleTick
      || left.commanderId.localeCompare(right.commanderId));
  const operation = operations[0];
  const projection = operation ? projectCombatExchangeV2(
    state,
    content,
    operation.commanderId,
    operation.commanderId === war.attackerId ? war.defenderId : war.attackerId,
    operation.sourceId,
    operation.targetId,
    operation.access,
  ) : undefined;
  const fallback = forecastWarV2(state, content, viewerId, enemyId);
  const nextOwnLosses = projection
    ? operation!.commanderId === viewerId ? projection.attackerLosses : projection.defenderLosses
    : fallback.projectedAttackerLosses;
  const nextEnemyLosses = projection
    ? operation!.commanderId === viewerId ? projection.defenderLosses : projection.attackerLosses
    : fallback.projectedDefenderLosses;
  const historicalOwn = war.battles > 0 ? totalOwnLosses / war.battles : nextOwnLosses;
  const historicalEnemy = war.battles > 0 ? totalEnemyLosses / war.battles : nextEnemyLosses;
  const historyWeight = clamp(war.battles / 12, 0, 0.55);
  const projectedOwnLosses = round(nextOwnLosses * (1 - historyWeight) + historicalOwn * historyWeight);
  const projectedEnemyLosses = round(nextEnemyLosses * (1 - historyWeight) + historicalEnemy * historyWeight);

  const ownStrength = nationalCombatManpowerV2(state, viewerId);
  const enemyStrength = nationalCombatManpowerV2(state, enemyId);
  const ownErosion = Math.max(0, projectedOwnLosses);
  const enemyErosion = Math.max(0, projectedEnemyLosses);
  const ownCollapsePulses = ownErosion > 0 ? ownStrength / ownErosion : Number.POSITIVE_INFINITY;
  const enemyCollapsePulses = enemyErosion > 0 ? enemyStrength / enemyErosion : Number.POSITIVE_INFINITY;
  const finiteCollapse = Math.min(ownCollapsePulses, enemyCollapsePulses);
  const isStalled = !Number.isFinite(finiteCollapse) || finiteCollapse > 260;
  const closeRace = Number.isFinite(ownCollapsePulses) && Number.isFinite(enemyCollapsePulses)
    && Math.max(ownCollapsePulses, enemyCollapsePulses)
      / Math.max(0.000001, Math.min(ownCollapsePulses, enemyCollapsePulses)) < 1.25;
  const outlook: LiveWarEstimateV2['outlook'] = isStalled ? 'stalled'
    : closeRace ? 'contested'
    : enemyCollapsePulses < ownCollapsePulses ? 'enemy-collapse' : 'our-collapse';
  const losingId = outlook === 'enemy-collapse' ? enemyId
    : outlook === 'our-collapse' ? viewerId : undefined;
  const territoryTail = losingId
    ? Math.max(0, selectTerritoriesOfV2(state, losingId).length - 1) * BATTLE_INTERVAL_TICKS : 0;
  const mobilisation = Math.max(0, WAR_MOBILIZATION_TICKS - (state.tick - war.startedTick));
  const centralWeeks = isStalled ? 390
    : clamp(finiteCollapse * BATTLE_INTERVAL_TICKS + territoryTail + mobilisation, 4, 1_040);
  const confidence: LiveWarEstimateV2['confidence'] = war.battles >= 10 ? 'high'
    : war.battles >= 3 ? 'medium' : 'low';
  const spread = confidence === 'high' ? 0.24 : confidence === 'medium' ? 0.38 : 0.58;
  return {
    warId,
    viewerId,
    enemyId,
    sourceId: operation?.sourceId ?? fallback.sourceId,
    targetId: operation?.targetId ?? fallback.targetId,
    operationCommanderId: operation?.commanderId,
    projectedOwnLosses,
    projectedEnemyLosses,
    totalOwnLosses: round(totalOwnLosses),
    totalEnemyLosses: round(totalEnemyLosses),
    estimatedWeeksMin: Math.max(2, Math.round(centralWeeks * (1 - spread))),
    estimatedWeeksMax: Math.max(4, Math.round(Math.min(1_040, centralWeeks * (1 + spread)))),
    confidence,
    outlook,
  };
}

function operationValidV2(
  state: WorldStateV2,
  content: WorldContentV2,
  operation: FrontOperationV2 | undefined,
  commanderId: PlayerId,
  enemyId: PlayerId,
): operation is FrontOperationV2 {
  if (!operation) return false;
  const source = state.territories[operation.sourceId];
  const target = state.territories[operation.targetId];
  return Boolean(source && target && source.owner === commanderId && target.owner === enemyId
    && selectArmyCombatManpowerV2(state, commanderId, source.army) > 0
    && connectionKindV2(content, operation.sourceId, operation.targetId) === operation.access);
}

function clearInvalidWarOperationsV2(state: WorldStateV2, content: WorldContentV2): void {
  for (const activeWar of state.wars) {
    activeWar.attackerOperations = activeWar.attackerOperations.filter((operation) => (
      operationValidV2(state, content, operation, activeWar.attackerId, activeWar.defenderId)
    ));
    activeWar.defenderOperations = activeWar.defenderOperations.filter((operation) => (
      operationValidV2(state, content, operation, activeWar.defenderId, activeWar.attackerId)
    ));
  }
}

function createOperationV2(
  state: WorldStateV2,
  commanderId: PlayerId,
  enemyId: PlayerId,
  counteroffensive: boolean,
  candidate: FrontCandidateV2,
): FrontOperationV2 {
  const target = state.territories[candidate.targetId]!;
  const doctrine: OperationDoctrineV2 = counteroffensive ? 'counteroffensive'
    : selectArmyCombatManpowerV2(state, enemyId, target.army)
      <= armyCombatCapacityV2(state, enemyId, target.army) * 0.30 ? 'breakthrough'
      : target.condition < 0.55 ? 'siege' : 'pressure';
  return {
    commanderId,
    sourceId: candidate.sourceId,
    targetId: candidate.targetId,
    doctrine,
    access: candidate.access,
    startedTick: state.tick,
    lastBattleTick: state.tick,
    holdUntilTick: state.tick + 8 + randomInt(state, 9),
    momentum: 0,
  };
}

function ensureOperationsV2(
  state: WorldStateV2,
  content: WorldContentV2,
  war: WarStateV2,
  commanderId: PlayerId,
): FrontOperationV2[] {
  const enemyId = commanderId === war.attackerId ? war.defenderId : war.attackerId;
  const key = commanderId === war.attackerId ? 'attackerOperations' : 'defenderOperations';
  const baseCandidates = frontCandidatesV2(state, content, commanderId, enemyId);
  const revengeActive = war.revenge?.claimantId === commanderId
    && war.revenge.expiresTick > state.tick;
  const candidates = revengeActive
    ? baseCandidates.map((candidate, index) => ({ candidate, index }))
      .sort((left, right) => Number(
        state.territories[right.candidate.targetId]?.coreOwner === enemyId,
      ) - Number(state.territories[left.candidate.targetId]?.coreOwner === enemyId)
        || left.index - right.index)
      .map(({ candidate }) => candidate)
    : baseCandidates;
  const viable = candidates.filter((candidate) => candidate.viable);
  const pool = viable.length > 0 ? viable : candidates.slice(0, 1);
  const candidateBySource = new Map<TerritoryId, FrontCandidateV2>();
  for (const candidate of pool) {
    if (!candidateBySource.has(candidate.sourceId)) candidateBySource.set(candidate.sourceId, candidate);
  }
  const existingBySource = new Map(war[key]
    .filter((operation) => operationValidV2(state, content, operation, commanderId, enemyId))
    .map((operation) => [operation.sourceId, operation]));
  const operations = [...candidateBySource.values()]
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId)
      || left.targetId.localeCompare(right.targetId))
    .map((candidate) => {
      const existing = existingBySource.get(candidate.sourceId);
      if (existing && (state.tick < existing.holdUntilTick || existing.momentum >= -0.12)) {
        return existing;
      }
      return createOperationV2(
        state,
        commanderId,
        enemyId,
        commanderId === war.defenderId,
        candidate,
      );
    });
  war[key] = operations;
  return operations;
}

function chooseInitiativeOperationsV2(
  state: WorldStateV2,
  content: WorldContentV2,
  war: WarStateV2,
): FrontOperationV2[] {
  const attackerOperations = ensureOperationsV2(state, content, war, war.attackerId);
  const defenderOperations = ensureOperationsV2(state, content, war, war.defenderId);
  if (war.revenge && war.revenge.expiresTick > state.tick) {
    const claimantOperations = war.revenge.claimantId === war.attackerId
      ? attackerOperations : defenderOperations;
    // The victim gets one bounded campaign window with the initiative. A
    // recapture may open the route to an enemy core, but the opponent cannot
    // repeatedly flip that same border territory while retaliation is active.
    if (claimantOperations.length > 0) return claimantOperations;
  }
  if (attackerOperations.length === 0) return defenderOperations;
  if (defenderOperations.length === 0) return attackerOperations;
  const operationIsViable = (operation: FrontOperationV2): boolean => {
    const source = state.territories[operation.sourceId]!;
    const target = state.territories[operation.targetId]!;
    const sourceStrength = selectArmyCombatManpowerV2(state, operation.commanderId, source.army);
    const targetStrength = selectArmyCombatManpowerV2(state, target.owner, target.army);
    return targetStrength <= 0.000001
      || sourceStrength > targetStrength * COMBAT_ROUTE_STRENGTH_RATIO;
  };
  const attackerViable = attackerOperations.some(operationIsViable);
  const defenderViable = defenderOperations.some(operationIsViable);
  if (attackerViable !== defenderViable) return attackerViable ? attackerOperations : defenderOperations;
  const militaryBaseSnapshot = createMilitaryBaseSnapshotV2(state, content);
  const attackerPower = selectCurrentPowerV2(
    state, content, war.attackerId, militaryBaseSnapshot,
  );
  const defenderPower = selectCurrentPowerV2(
    state, content, war.defenderId, militaryBaseSnapshot,
  );
  if (defenderPower > attackerPower * 1.08) return defenderOperations;
  if (attackerPower > defenderPower * 1.08) return attackerOperations;
  return ((state.tick / BATTLE_INTERVAL_TICKS + Number(war.id.replace(/\D/g, ''))) % 2 === 0)
    ? attackerOperations : defenderOperations;
}

function moveCapitalAfterLossV2(state: WorldStateV2, formerOwner: PlayerId, lostId: TerritoryId): void {
  const nation = state.players[formerOwner];
  if (!nation || nation.capitalId !== lostId) return;
  const replacement = selectTerritoriesOfV2(state, formerOwner)
    .sort((a, b) => b.economy - a.economy || a.id.localeCompare(b.id))[0];
  if (replacement) nation.capitalId = replacement.id;
}

function captureTerritoryV2(
  state: WorldStateV2,
  content: WorldContentV2,
  sourceId: TerritoryId,
  targetId: TerritoryId,
  newOwner: PlayerId,
  access: 'land' | 'naval',
  decisiveVictory: boolean,
): CaptureOutcomeV2 {
  const source = state.territories[sourceId]!;
  const target = state.territories[targetId]!;
  const none: CaptureOutcomeV2 = { conquered: false, capturedPopulation: 0, capturedEconomy: 0, treasurySeized: 0 };
  if (!decisiveVictory
    || selectArmyCombatManpowerV2(state, target.owner, target.army) > 0.000000001
    || selectArmyCombatManpowerV2(state, newOwner, source.army) <= 0.000000001) return none;
  const oldOwner = target.owner;
  const attackerTraitContext = combatSideTraitContextV2(
    state, content, newOwner, sourceId, 'attacker', access,
  );
  const defenderTraitContext = combatSideTraitContextV2(
    state, content, oldOwner, targetId, 'defender', access,
  );
  // A decisive conquest transfers ownership immediately. The attacker keeps
  // its field army on the original side of the border; the new territory must
  // subsequently be reinforced through the deliberately slow logistics net.
  const sourceManpowerBefore = source.army.manpower;
  const sourceBaseAttack = source.army.baseAttack;
  const sourceBaseDefense = source.army.baseDefense;
  const requestedGuardForce = sourceManpowerBefore
    * CONQUEST_GUARD_MIN_TRANSFER_SHARE;
  beginTerritoryIntegrationV2(state, content, targetId, newOwner, access);
  invalidateTerritoryIndexV2(state);
  // Battle damage has already been committed above. Annexation preserves the
  // surviving people, production and infrastructure as latent potential;
  // administration initially unlocks ten percent and then integrates it.
  target.army.capacity = stateTerritoryArmyCapacityTargetV2(state, content, targetId, newOwner);
  const supportCeiling = stateTerritoryArmySupportCeilingV2(
    state, content, targetId, newOwner,
  );
  const minimumGuardForce = Math.min(requestedGuardForce, supportCeiling);
  const guardTransferBudget = sourceManpowerBefore
    * CONQUEST_CAPTURE_GUARD_MAX_TRANSFER_SHARE;
  const guardReinforcement = Math.min(
    Math.max(0, supportCeiling - minimumGuardForce),
    Math.max(0, guardTransferBudget - minimumGuardForce),
  );
  // Every defender is transferred from the surviving source formation. The
  // destination uses its local cap plus the scalable conquered-territory
  // empire allowance, while one capture can consume no more than 10% of the
  // source and therefore leaves at least 90% behind.
  const transferredManpower = Math.min(
    sourceManpowerBefore,
    supportCeiling,
    minimumGuardForce + guardReinforcement,
  );
  source.army.manpower = round(Math.max(0, sourceManpowerBefore - transferredManpower), 9);
  target.army.manpower = round(transferredManpower, 9);
  if (target.army.manpower > 0.000000001) {
    target.army.baseAttack = sourceBaseAttack;
    target.army.baseDefense = sourceBaseDefense;
  } else {
    resetEmptyArmyBaseQualityV2(target.army, content, targetId);
  }
  resetEmptyArmyBaseQualityV2(source.army, content, sourceId);
  moveCapitalAfterLossV2(state, oldOwner, targetId);
  addWarFatigueGainV2(state, oldOwner, 2, defenderTraitContext);
  addWarFatigueGainV2(state, newOwner, 0.5, attackerTraitContext);
  let treasurySeized = 0;
  if (selectIsEliminatedV2(state, oldOwner)) {
    // Forecast and resolution share the same defeated-owner replacement path.
    const treasurySeizureShare = selectTreasurySeizureShareV2(state, oldOwner);
    treasurySeized = round(
      Math.max(0, state.players[oldOwner]!.treasury) * treasurySeizureShare,
    );
    state.players[newOwner]!.treasury = round(state.players[newOwner]!.treasury + treasurySeized);
    state.players[oldOwner]!.treasury = 0;
    const foodSeized = round(state.players[oldOwner]!.foodStock * 0.20);
    state.players[newOwner]!.foodStock = round(state.players[newOwner]!.foodStock + foodSeized);
    state.players[oldOwner]!.foodStock = 0;
  }
  return {
    conquered: true,
    capturedPopulation: target.population,
    capturedEconomy: target.economy,
    treasurySeized,
    defeatedId: selectIsEliminatedV2(state, oldOwner) ? oldOwner : undefined,
  };
}

function applyCombatCasualtiesV2(
  _state: WorldStateV2,
  _ownerId: PlayerId,
  army: WorldStateV2['territories'][TerritoryId]['army'],
  requestedDamage: number,
): number {
  const manpowerBefore = Math.max(0, army.manpower);
  const casualties = Math.min(manpowerBefore, Math.max(0, requestedDamage));
  army.manpower = round(Math.max(0, manpowerBefore - casualties), 9);
  // Budget routing from the canonical state change at the same precision as
  // manpower. Six-decimal reporting could turn a real sub-millionth loss into
  // zero and incorrectly grant the routed tail a second full cap allowance.
  return round(Math.max(0, manpowerBefore - army.manpower), 9);
}

function nationalCombatManpowerV2(state: WorldStateV2, playerId: PlayerId): number {
  return selectTerritoriesOfV2(state, playerId).reduce((sum, territory) => (
    sum + selectArmyCombatManpowerV2(state, playerId, territory.army)
  ), 0);
}

function nationalCombatCapacityV2(state: WorldStateV2, playerId: PlayerId): number {
  return selectTerritoriesOfV2(state, playerId).reduce((sum, territory) => (
    sum + armyCombatCapacityV2(state, playerId, territory.army)
  ), 0);
}

/**
 * A battle only exposes a fraction of a very large population. This keeps
 * casualties visible in small and medium states without letting the same
 * pulse formula erase demographic giants in a handful of battles.
 */
export function civilianPopulationExposureV2(populationMillions: number): number {
  return clamp(1 / Math.sqrt(1 + Math.max(0, populationMillions) / 120), 0.30, 1);
}

export function resolveBattlePulseV2(
  state: WorldStateV2,
  content: WorldContentV2,
  war: WarStateV2,
  operation: FrontOperationV2,
): BattleEventV2 | undefined {
  const source = state.territories[operation.sourceId];
  const target = state.territories[operation.targetId];
  if (!source || !target) return undefined;
  const attackerId = source.owner;
  const defenderId = target.owner;
  if (attackerId === defenderId || operation.commanderId !== attackerId) return undefined;
  const attackerTraitContext = traitOperationContextV2(
    state, content, war, operation, attackerId,
  );
  const defenderTraitContext = traitOperationContextV2(
    state, content, war, operation, defenderId,
  );
  const varianceA = 0.94 + nextRandom(state) * 0.12;
  const varianceD = 0.94 + nextRandom(state) * 0.12;
  const projection = projectCombatExchangeV2(
    state, content, attackerId, defenderId,
    operation.sourceId, operation.targetId, operation.access,
    varianceA, varianceD,
  );
  if (!projection) return undefined;
  const {
    attackerSupply,
    defenderSupply,
    supportingForces,
    attackPressure,
    defenseShield,
    attackerStrength: sourceStrength,
    defenderStrength: targetStrength,
  } = projection;
  const sourceCapacity = Math.max(source.army.capacity, source.army.manpower);
  const targetCapacity = Math.max(target.army.capacity, target.army.manpower);
  const damageToDefender = applyCombatCasualtiesV2(state, defenderId, target.army,
    projection.defenderLosses);
  const damageToAttacker = applyCombatCasualtiesV2(state, attackerId, source.army,
    projection.attackerLosses);
  const terrain = content.territories[operation.targetId]!.terrain;
  const civilianRisk = terrain === 'urban' ? 1.35 : terrain === 'jungle' ? 1.12 : 1;
  const sourceTerrain = content.territories[operation.sourceId]!.terrain;
  const sourceCivilianRisk = sourceTerrain === 'urban' ? 1.20 : sourceTerrain === 'jungle' ? 1.08 : 1;
  const protectionLevel = state.players[defenderId]!.research.effectLevels['casualty-reduction'];
  const attackerProtectionLevel = state.players[attackerId]!.research.effectLevels['casualty-reduction'];
  const civilianProtection = 1 - 0.25 * protectionLevel / (protectionLevel + 30);
  const attackerCivilianProtection = 1 - 0.25 * attackerProtectionLevel / (attackerProtectionLevel + 30);
  const battleIntensity = damageToAttacker + damageToDefender;
  const defenderPopulationExposure = civilianPopulationExposureV2(target.population);
  const attackerPopulationExposure = civilianPopulationExposureV2(source.population);
  const requestedDefenderPopulationLoss = Math.min(
    target.population * DEFENDER_CIVILIAN_LOSS_POPULATION_CAP * defenderPopulationExposure,
    battleIntensity * DEFENDER_CIVILIAN_LOSS_INTENSITY
      * defenderPopulationExposure * civilianRisk * civilianProtection,
  );
  const requestedAttackerPopulationLoss = Math.min(
    source.population * ATTACKER_CIVILIAN_LOSS_POPULATION_CAP * attackerPopulationExposure,
    requestedDefenderPopulationLoss * ATTACKER_CIVILIAN_LOSS_DEFENDER_SHARE,
    battleIntensity * ATTACKER_CIVILIAN_LOSS_INTENSITY
      * attackerPopulationExposure * sourceCivilianRisk * attackerCivilianProtection,
  );
  const economyLoss = Math.min(target.economy * 0.00150, damageToDefender * 1.50 * civilianRisk);
  const sourcePopulationBefore = source.population;
  const targetPopulationBefore = target.population;
  source.population = round(Math.max(0.01, sourcePopulationBefore - requestedAttackerPopulationLoss));
  target.population = round(Math.max(0.01, targetPopulationBefore - requestedDefenderPopulationLoss));
  // Report and accumulate only the loss actually applied after the canonical
  // territory population floor, never the larger pre-clamp request.
  const attackerPopulationLoss = round(Math.max(0, sourcePopulationBefore - source.population));
  const defenderPopulationLoss = round(Math.max(0, targetPopulationBefore - target.population));
  const populationLoss = defenderPopulationLoss;
  target.economy = round(Math.max(0.10, target.economy - economyLoss));
  const sourceConditionLoss = 0.004
    + damageToAttacker / Math.max(0.000001, sourceCapacity) * 0.08;
  const targetConditionLoss = 0.005
    + damageToDefender / Math.max(0.000001, targetCapacity) * 0.10;
  source.condition = round(clamp(
    source.condition - sourceConditionLoss * countryTraitFactorV2(
      attackerId, 'condition-loss', attackerTraitContext,
    ),
    0.15,
    1,
  ));
  target.condition = round(clamp(
    target.condition - targetConditionLoss * countryTraitFactorV2(
      defenderId, 'condition-loss', defenderTraitContext,
    ),
    0.15,
    1,
  ));

  const defenderLossShare = damageToDefender / Math.max(1e-9, targetStrength);
  const attackerLossShare = damageToAttacker / Math.max(1e-9, sourceStrength);
  const damageEdge = (defenderLossShare - attackerLossShare)
    / Math.max(1e-9, defenderLossShare + attackerLossShare);
  const supplyEdge = attackerSupply - defenderSupply;
  const battlefieldDominance = attackPressure / Math.max(0.000001, attackPressure + defenseShield);
  const collapse = smoothstep(0.50, 0.98, battlefieldDominance);
  const pressure = clamp(0.60 * damageEdge + 0.20 * supplyEdge + 0.20 * collapse, -1, 1);
  const undefendedNation = targetStrength <= 0.000001
    && nationalCombatManpowerV2(state, defenderId) <= 0.000001;
  const leadingClaimant = undefendedNation ? capitulationVictorV2(state, defenderId) : undefined;
  const attackerFormal = attackerId === war.attackerId;
  const priorInflictedLosses = attackerFormal ? war.defenderLosses : war.attackerLosses;
  const contributionThreshold = Math.max(0.000001,
    targetCapacity * CAPTURE_MIN_CONTRIBUTION_SHARE);
  const earnedDecisiveClaim = targetStrength > 0
    && priorInflictedLosses + damageToDefender >= contributionThreshold;
  const sourceStrengthAfter = selectArmyCombatManpowerV2(state, attackerId, source.army);
  const targetStrengthAfter = selectArmyCombatManpowerV2(state, defenderId, target.army);
  const decisiveSurrender = targetStrengthAfter > 0.000000001
    && state.tick - operation.startedTick >= DECISIVE_SURRENDER_MIN_FRONT_TICKS
    && targetStrengthAfter / Math.max(0.000001, targetCapacity)
      <= DECISIVE_SURRENDER_MAX_DEFENDER_FILL
    && sourceStrengthAfter / Math.max(0.000001, targetStrengthAfter)
      >= DECISIVE_SURRENDER_MIN_FORCE_RATIO
    && priorInflictedLosses + damageToDefender
      >= targetCapacity * DECISIVE_SURRENDER_MIN_CUMULATIVE_LOSS_SHARE
    && operation.momentum >= DECISIVE_SURRENDER_MIN_MOMENTUM
    && pressure > 0;
  if (decisiveSurrender) {
    // The remaining formation lays down its arms; it is removed from active
    // manpower but is not rewritten as battle casualties. No ownership or
    // partial-control state changes before the decisive capture below.
    target.army.manpower = 0;
    resetEmptyArmyBaseQualityV2(target.army, content, operation.targetId);
  }
  // Empty local land is decided in one real battle pulse. If the whole nation
  // has already collapsed across simultaneous wars, its leading contributor
  // receives the claim deterministically instead of a late entrant.
  const earnedUnopposedClaim = targetStrength <= 0.000001
    && (!undefendedNation || leadingClaimant === attackerId);
  const capture = captureTerritoryV2(
    state,
    content,
    operation.sourceId,
    operation.targetId,
    attackerId,
    operation.access,
    earnedDecisiveClaim || earnedUnopposedClaim || decisiveSurrender,
  );
  const conquered = capture.conquered;
  for (const territoryId of [operation.sourceId, operation.targetId]) {
    const battleTerritory = state.territories[territoryId]!;
    const army = battleTerritory.army;
    army.capacity = stateTerritoryArmyCapacityTargetV2(
      state,
      content,
      territoryId,
      battleTerritory.owner,
    );
    army.manpower = round(Math.max(0, army.manpower), 9);
    resetEmptyArmyBaseQualityV2(army, content, territoryId);
  }
  if (conquered) {
    war.attackerOperations = [];
    war.defenderOperations = [];
    if (!capture.defeatedId && !war.revenge) {
      war.revenge = {
        claimantId: defenderId,
        triggeredTick: state.tick,
        expiresTick: state.tick + WAR_REVENGE_WINDOW_TICKS,
      };
      addWorldEventV2(
        state,
        'war',
        'action',
        `${content.nations[defenderId]?.name ?? defenderId} began a one-year retaliation campaign after losing ${content.territories[operation.targetId]?.name ?? operation.targetId}.`,
        operation.targetId,
        defenderId,
      );
    }
  }

  war.battles += 1;
  war.lastBattleTick = state.tick;
  operation.lastBattleTick = state.tick;
  operation.momentum = round(clamp(operation.momentum * 0.7 + pressure * 0.3, -1, 1));
  if (attackerFormal) {
    war.attackerLosses = round(war.attackerLosses + damageToAttacker);
    war.defenderLosses = round(war.defenderLosses + damageToDefender);
    war.attackerCivilianLosses = round(
      (war.attackerCivilianLosses ?? 0) + attackerPopulationLoss,
    );
    war.defenderCivilianLosses = round(
      (war.defenderCivilianLosses ?? 0) + defenderPopulationLoss,
    );
    war.warScore = round(war.warScore + damageToDefender - damageToAttacker + (conquered ? 15 : 0));
  } else {
    war.defenderLosses = round(war.defenderLosses + damageToAttacker);
    war.attackerLosses = round(war.attackerLosses + damageToDefender);
    war.defenderCivilianLosses = round(
      (war.defenderCivilianLosses ?? 0) + attackerPopulationLoss,
    );
    war.attackerCivilianLosses = round(
      (war.attackerCivilianLosses ?? 0) + defenderPopulationLoss,
    );
    war.warScore = round(war.warScore - (damageToDefender - damageToAttacker + (conquered ? 15 : 0)));
  }
  const attackerCapacity = selectTotalManpowerV2(state, attackerId).capacity;
  const defenderCapacity = selectTotalManpowerV2(state, defenderId).capacity;
  const battleFatigueMultiplier = operation.access === 'naval'
    ? NAVAL_BATTLE_FATIGUE_MULTIPLIER : 1;
  addWarFatigueGainV2(
    state,
    attackerId,
    (0.08 + 4 * damageToAttacker / Math.max(0.000001, attackerCapacity))
      * battleFatigueMultiplier,
    attackerTraitContext,
  );
  addWarFatigueGainV2(
    state,
    defenderId,
    (0.08 + 4 * damageToDefender / Math.max(0.000001, defenderCapacity))
      * battleFatigueMultiplier,
    defenderTraitContext,
  );

  const event: BattleEventV2 = {
    warId: war.id,
    source: operation.sourceId,
    target: operation.targetId,
    attacker: attackerId,
    defender: defenderId,
    sourceId: operation.sourceId,
    targetId: operation.targetId,
    attackerId,
    defenderId,
    attackerLosses: round(damageToAttacker),
    defenderLosses: round(damageToDefender),
    attackerPopulationLoss: round(attackerPopulationLoss),
    defenderPopulationLoss: round(defenderPopulationLoss),
    populationLoss: round(populationLoss),
    economyLoss: round(economyLoss),
    capturedPopulation: capture.capturedPopulation,
    capturedEconomy: capture.capturedEconomy,
    treasurySeized: capture.treasurySeized,
    conquered,
    terrain,
    tactic: doctrineTactic[operation.doctrine],
    phase: 'assault',
    attackerPower: round(attackPressure),
    defenderPower: round(defenseShield),
    operation: operation.doctrine,
    attackerSupply: round(attackerSupply),
    defenderSupply: round(defenderSupply),
    momentum: operation.momentum,
    supportingForces,
    tick: state.tick,
  };
  if (capture.defeatedId) {
    addWorldEventV2(
      state,
      'conquest',
      'critical',
      `${content.nations[attackerId]?.name ?? attackerId} defeated ${content.nations[capture.defeatedId]?.name ?? capture.defeatedId} and conquered its land.`,
      undefined,
      attackerId,
    );
  }
  // Tactical pulses and routine border captures are rendered live on the map.
  // The strategic World Events history is intentionally reserved for wars,
  // peace, federations, breakthroughs and complete national defeats.
  // One conquest can invalidate a source or target used by another simultaneous
  // war. Revalidate the whole active set before end-of-tick invariants run.
  clearInvalidWarOperationsV2(state, content);
  return event;
}

function addTruceV2(
  state: WorldStateV2,
  leftId: PlayerId,
  rightId: PlayerId,
  durationTicks = TRUCE_TICKS,
): void {
  const [left, right] = leftId < rightId ? [leftId, rightId] : [rightId, leftId];
  const existingExpiry = state.truces.find((candidate) => (
    candidate.leftId === left && candidate.rightId === right
  ))?.expiresTick ?? 0;
  const truce: TruceStateV2 = {
    leftId: left,
    rightId: right,
    expiresTick: Math.max(existingExpiry, state.tick + durationTicks),
  };
  state.truces = state.truces.filter((candidate) => !(candidate.leftId === left && candidate.rightId === right));
  state.truces.push(truce);
}

function endWarV2(
  state: WorldStateV2,
  war: WarStateV2,
  reason: string,
  truceTicks = TRUCE_TICKS,
  endedWars?: WarConclusionV2[],
  settlement?: WarConclusionSettlementV2,
): void {
  endedWars?.push({
    war: {
      ...war,
      attackerOperations: war.attackerOperations.map((operation) => ({ ...operation })),
      defenderOperations: war.defenderOperations.map((operation) => ({ ...operation })),
    },
    endedTick: state.tick,
    reason,
    ...(settlement ? { settlement: { ...settlement } } : {}),
  });
  const postWarTraitContexts = new Map<PlayerId, TraitEvaluationContextV2>(
    [war.attackerId, war.defenderId].map((playerId) => [
      playerId,
      composeTraitContextV2(
        traitNationContextV2(state, playerId),
        traitWarContextV2(war, playerId),
      ),
    ]),
  );
  state.wars = state.wars.filter((candidate) => candidate.id !== war.id);
  state.offers = state.offers.filter((offer) => offer.warId !== war.id);
  for (const playerId of [war.attackerId, war.defenderId]) {
    const stillAtWar = state.wars.some((candidate) => candidate.attackerId === playerId || candidate.defenderId === playerId);
    if (!stillAtWar && state.players[playerId]) {
      // Every completed campaign leaves another recovery load. The old floor
      // made the second and later conquest effectively free whenever the
      // first transition had not yet recovered.
      addWarFatigueGainV2(
        state,
        playerId,
        POST_WAR_TRANSITION_FATIGUE,
        postWarTraitContexts.get(playerId),
      );
    }
  }
  addTruceV2(state, war.attackerId, war.defenderId, truceTicks);
  const humanBelligerent = [war.attackerId, war.defenderId]
    .find((playerId) => isHumanPlayerV2(state, playerId));
  addWorldEventV2(
    state,
    'peace',
    'action',
    reason,
    undefined,
    humanBelligerent ?? state.humanPlayerId,
  );
}

export function ceasefireTermsV2(
  state: WorldStateV2,
  content: WorldContentV2,
  warId: string,
  requesterId: PlayerId,
): CeasefireTermsV2 {
  const war = state.wars.find((candidate) => candidate.id === warId);
  const base = {
    requesterId,
    weeklyCost: 0,
    paymentWeeks: CEASEFIRE_PAYMENT_WEEKS,
    totalCost: 0,
    repeatMultiplier: 1,
    cooldownRemaining: 0,
    truceTicks: CEASEFIRE_PAYMENT_WEEKS + CEASEFIRE_POST_PAYMENT_TRUCE_TICKS,
    postPaymentTruceTicks: CEASEFIRE_POST_PAYMENT_TRUCE_TICKS,
  };
  if (!war || (war.attackerId !== requesterId && war.defenderId !== requesterId)) {
    return { ...base, allowed: false, reason: 'No active war under your command.' };
  }
  const opponentId = war.attackerId === requesterId ? war.defenderId : war.attackerId;
  const warAge = Math.max(0, state.tick - war.startedTick);
  if (warAge < PEACE_REQUEST_MIN_WAR_AGE_TICKS) {
    return {
      ...base,
      allowed: false,
      reason: `A ceasefire can only be requested after ${PEACE_REQUEST_MIN_WAR_AGE_TICKS} weeks (${PEACE_REQUEST_MIN_WAR_AGE_TICKS - warAge} remaining).`,
      warId,
      opponentId,
    };
  }
  if (state.offers.some((offer) => offer.warId === war.id
    && offer.status === 'pending' && offer.expiresTick > state.tick)) {
    return { ...base, allowed: false, reason: 'A peace offer is already pending.', warId, opponentId };
  }
  const cooldownRemaining = war.lastPeaceOfferTick >= war.startedTick
    ? Math.max(0, war.lastPeaceOfferTick + PEACE_REQUEST_COOLDOWN_TICKS - state.tick)
    : 0;
  if (cooldownRemaining > 0) {
    return {
      ...base,
      allowed: false,
      reason: `Peace can be requested again in ${cooldownRemaining} weeks.`,
      warId,
      opponentId,
      cooldownRemaining,
    };
  }
  const weeklyRevenue = selectNationalEconomyV2(state, content, requesterId).weeklyRevenue;
  const opponentRevenue = selectNationalEconomyV2(state, content, opponentId).weeklyRevenue;
  const repeatMultiplier = CEASEFIRE_REPEAT_COST_MULTIPLIER
    ** state.players[requesterId]!.ceasefiresRequested;
  const balancedBase = Math.min(
    weeklyRevenue * CEASEFIRE_PAYER_WEEKLY_REVENUE_SHARE,
    opponentRevenue * CEASEFIRE_PAYEE_WEEKLY_REVENUE_CAP_SHARE,
  );
  const weeklyCost = round(Math.max(0.001,
    balancedBase * repeatMultiplier));
  return {
    ...base,
    allowed: true,
    warId,
    opponentId,
    weeklyCost,
    totalCost: round(weeklyCost * CEASEFIRE_PAYMENT_WEEKS),
    repeatMultiplier: round(repeatMultiplier),
  };
}

export function requestCeasefireV2(
  state: WorldStateV2,
  content: WorldContentV2,
  warId: string,
  requesterId: PlayerId,
): CommandResultV2 {
  const terms = ceasefireTermsV2(state, content, warId, requesterId);
  if (!terms.allowed || !terms.opponentId) return { accepted: false, reason: terms.reason };
  const war = state.wars.find((candidate) => candidate.id === warId)!;
  state.offers.push({
    id: `offer-${state.nextOfferId++}`,
    fromId: requesterId,
    toId: terms.opponentId,
    warId,
    settlement: 'ceasefire',
    createdTick: state.tick,
    expiresTick: state.tick + PEACE_OFFER_DURATION_TICKS,
    status: 'pending',
    weeklyCost: terms.weeklyCost,
    paymentWeeks: terms.paymentWeeks,
  });
  war.lastPeaceOfferTick = state.tick;
  return { accepted: true };
}

function capitulationVictorV2(state: WorldStateV2, defeatedId: PlayerId): PlayerId | undefined {
  return state.wars.filter((war) => war.attackerId === defeatedId || war.defenderId === defeatedId)
    .map((war) => {
      const defeatedIsAttacker = war.attackerId === defeatedId;
      const opponentId = defeatedIsAttacker ? war.defenderId : war.attackerId;
      const inflictedLosses = defeatedIsAttacker ? war.attackerLosses : war.defenderLosses;
      const opponentScore = defeatedIsAttacker ? -war.warScore : war.warScore;
      const opponentArmy = nationalCombatManpowerV2(state, opponentId);
      return { opponentId, score: inflictedLosses + Math.max(0, opponentScore) * 0.001 + war.battles * 0.000001, opponentArmy };
    })
    .filter((candidate) => candidate.opponentArmy > 0.000001)
    .sort((left, right) => right.score - left.score || left.opponentId.localeCompare(right.opponentId))[0]?.opponentId;
}

function endWarsForEliminatedNationV2(
  state: WorldStateV2,
  defeatedId: PlayerId,
  reason: string,
  endedWars?: WarConclusionV2[],
): void {
  const wars = state.wars.filter((war) => war.attackerId === defeatedId || war.defenderId === defeatedId);
  for (const war of wars) endWarV2(state, war, reason, TRUCE_TICKS, endedWars);
}

export function logisticsThroughputShareV2(
  deployedManpower: number,
  supplyLevel: number,
  iqLogisticsMultiplier = 1,
): number {
  // A fixed percentage lets giant empires teleport implausibly huge armies.
  // This power curve keeps absolute throughput growing with army size while
  // making the movable share diminish sharply as the empire army grows.
  const scale = (0.25 / Math.max(0.005, deployedManpower)) ** 0.32;
  const research = 1 + 0.015 * diminishingResearchLevelV2(supplyLevel);
  return clamp(
    0.035 * scale * research * clamp(iqLogisticsMultiplier, 0.90, 1.10),
    0.01,
    0.12,
  );
}

function captureGuardActiveV2(
  state: WorldStateV2,
  territoryId: TerritoryId,
): boolean {
  const territory = state.territories[territoryId];
  const program = territory?.integrationProgram;
  return Boolean(program
    && program.toOwnerId === territory.owner
    && state.tick >= program.startedTick
    && state.tick - program.startedTick < CONQUEST_CAPTURE_GUARD_TICKS);
}

export function redistributeArmiesV2(state: WorldStateV2, content: WorldContentV2): LogisticsMovementV2[] {
  const movements: LogisticsMovementV2[] = [];
  const recordMovement = (movement: LogisticsMovementV2): void => {
    const existing = movements.find((candidate) => candidate.playerId === movement.playerId
      && candidate.sourceId === movement.sourceId && candidate.targetId === movement.targetId);
    if (existing) {
      existing.manpower = round(existing.manpower + movement.manpower, 9);
      existing.capacity = round(existing.capacity + movement.capacity, 9);
    } else movements.push({ ...movement });
  };
  const nextHop = (component: ReadonlySet<TerritoryId>, sourceId: TerritoryId, targetId: TerritoryId): TerritoryId | undefined => {
    if (sourceId === targetId) return undefined;
    const queue: TerritoryId[] = [sourceId];
    const previous = new Map<TerritoryId, TerritoryId>();
    const visited = new Set<TerritoryId>([sourceId]);
    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbours = (content.territories[current]?.connections ?? [])
        .map((edge) => edge.targetId).filter((id) => component.has(id) && !visited.has(id))
        .sort((left, right) => left.localeCompare(right));
      for (const neighbour of neighbours) {
        visited.add(neighbour);
        previous.set(neighbour, current);
        if (neighbour === targetId) {
          let step = targetId;
          while (previous.get(step) && previous.get(step) !== sourceId) step = previous.get(step)!;
          return step;
        }
        queue.push(neighbour);
      }
    }
    return undefined;
  };
  const territoriesByOwner = new Map<PlayerId, TerritoryId[]>();
  for (const id of sortedTerritoryIdsV2(state)) {
    const owner = state.territories[id]!.owner;
    territoriesByOwner.set(owner, [...(territoriesByOwner.get(owner) ?? []), id]);
  }
  const allOwners = [...territoriesByOwner.keys()].sort((a, b) => a.localeCompare(b));
  for (const playerId of allOwners) {
    const ownedIds = territoriesByOwner.get(playerId) ?? [];
    // Nearly every country starts with one territory. It has nowhere to move
    // forces internally, so skip all route/threat work for that common case.
    if (ownedIds.length < 2) continue;
    // Imperial support is a national cap share. It is immutable throughout
    // this redistribution pass, so compute the world scan once per owner and
    // feed the result into every local ceiling query below.
    const empireArmyCapacity = nationalArmyCapacityTargetV2(state, content, playerId);
    const hostile = new Set(selectWarsOfV2(state, playerId).map((war) => war.attackerId === playerId ? war.defenderId : war.attackerId));
    const ownOperationSources = new Set<TerritoryId>();
    const threatenedTargets = new Set<TerritoryId>();
    for (const war of selectWarsOfV2(state, playerId)) {
      for (const operation of [...war.attackerOperations, ...war.defenderOperations]) {
        if (operation.commanderId === playerId && state.territories[operation.sourceId]?.owner === playerId) {
          ownOperationSources.add(operation.sourceId);
        } else if (state.territories[operation.targetId]?.owner === playerId) threatenedTargets.add(operation.targetId);
      }
    }
    const unvisited = new Set(ownedIds);
    const components: TerritoryId[][] = [];
    while (unvisited.size > 0) {
      const first = [...unvisited].sort((a, b) => a.localeCompare(b))[0]!;
      unvisited.delete(first);
      const component = [first];
      const queue = [first];
      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const edge of content.territories[current]?.connections ?? []) {
          if (!unvisited.has(edge.targetId) || state.territories[edge.targetId]?.owner !== playerId) continue;
          unvisited.delete(edge.targetId);
          component.push(edge.targetId);
          queue.push(edge.targetId);
        }
      }
      components.push(component.sort((a, b) => a.localeCompare(b)));
    }
    for (const ids of components) {
      if (ids.length < 2) continue;
      const componentSet = new Set(ids);
      const totalManpowerBefore = ids.reduce((sum, id) => sum + state.territories[id]!.army.manpower, 0);
      const weighted = ids.map((id) => {
        const territory = state.territories[id]!;
        const supportCeiling = stateTerritoryArmySupportCeilingV2(
          state,
          content,
          id,
          playerId,
          empireArmyCapacity,
        );
        const edges = content.territories[id]?.connections ?? [];
        const adjacentOwners = edges.map((edge) => state.territories[edge.targetId]?.owner).filter(Boolean) as PlayerId[];
        const activeBorder = adjacentOwners.some((owner) => hostile.has(owner));
        const peaceBorder = adjacentOwners.some((owner) => owner !== playerId && !hostile.has(owner));
        const attacked = threatenedTargets.has(id);
        const attackBase = ownOperationSources.has(id);
        const capital = state.players[playerId]?.capitalId === id;
        const weight = attacked ? 18 : attackBase ? 16 : activeBorder ? 12 : peaceBorder ? 6.5 : capital ? 1.5 : 0.2;
        const desiredFill = attacked ? 0.98 : attackBase ? 0.95 : activeBorder ? 0.88
          : peaceBorder ? 0.45 : capital ? 0.08 : 0.015;
        return {
          id,
          weight,
          desiredFill,
          desired: 0,
          warFront: attacked || attackBase || activeBorder,
          supportCeiling,
          hasOvershoot: territory.army.manpower > supportCeiling + 1e-9,
        };
      });
      const supportedOvershootBase = weighted.reduce((sum, item) => {
        if (!item.hasOvershoot) return sum;
        // Excess above two local caps becomes a slow logistics donor. The
        // ordinary throughput budget below moves it only when another owned
        // territory has support room; otherwise the excess remains in place.
        item.desired = item.supportCeiling;
        return sum + item.desired;
      }, 0);
      const flexible = weighted.filter((item) => !item.hasOvershoot);
      const distributableManpower = Math.max(0, totalManpowerBefore - supportedOvershootBase);
      const baseTotal = flexible.reduce((sum, item) => (
        sum + state.territories[item.id]!.army.capacity * item.desiredFill
      ), 0);
      if (distributableManpower <= baseTotal && baseTotal > 0) {
        for (const item of flexible) {
          item.desired = state.territories[item.id]!.army.capacity * item.desiredFill
            * distributableManpower / baseTotal;
        }
      } else {
        for (const item of flexible) {
          item.desired = state.territories[item.id]!.army.capacity * item.desiredFill;
        }
        let unallocated = Math.max(0, distributableManpower - baseTotal);
        // Water-fill remaining personnel toward the most important borders,
        // never past twice the local capacity. A pre-existing overshoot is
        // excluded as a receiver but its excess may supply this free room.
        for (let pass = 0; pass < flexible.length && unallocated > 1e-9; pass += 1) {
          const open = flexible.filter((item) => item.supportCeiling - item.desired > 1e-9);
          const score = open.reduce((sum, item) => (
            sum + item.weight * (item.supportCeiling - item.desired)
          ), 0);
          if (score <= 0) break;
          let assigned = 0;
          for (const item of open) {
            const room = item.supportCeiling - item.desired;
            const add = Math.min(room, unallocated * item.weight * room / score);
            item.desired += add;
            assigned += add;
          }
          if (assigned <= 1e-12) break;
          unallocated -= assigned;
        }
      }
      const supplyLevel = state.players[playerId]?.research.effectLevels.supply ?? 0;
      let remainingMove = totalManpowerBefore * logisticsThroughputShareV2(
        totalManpowerBefore,
        supplyLevel,
        selectNationalIqViewV2(state, content, playerId).logisticsMultiplier,
      );
      const outgoing = new Map(weighted.map((item) => [
        item.id,
        captureGuardActiveV2(state, item.id)
          ? 0
          : Math.max(0, state.territories[item.id]!.army.manpower - item.desired),
      ]));
      const receivers = [...weighted]
        .map((item) => ({ ...item, gap: item.desired - state.territories[item.id]!.army.manpower }))
        .filter((item) => item.gap > 1e-9)
        .sort((a, b) => b.weight - a.weight || b.gap - a.gap || a.id.localeCompare(b.id));
      for (const receiver of receivers) {
        let needed = receiver.gap;
        const donors = [...weighted].filter((item) => item.id !== receiver.id)
          .map((item) => ({ ...item, surplus: outgoing.get(item.id) ?? 0 }))
          .filter((item) => item.surplus > 1e-9)
          .sort((a, b) => b.surplus - a.surplus || a.id.localeCompare(b.id));
        for (const donor of donors) {
          if (needed <= 1e-9 || remainingMove <= 1e-9) break;
          const hop = nextHop(componentSet, donor.id, receiver.id);
          if (!hop) continue;
          const from = state.territories[donor.id]!;
          const to = state.territories[hop]!;
          const available = outgoing.get(donor.id) ?? 0;
          const destinationRoom = Math.max(
            0,
            stateTerritoryArmySupportCeilingV2(
              state,
              content,
              hop,
              playerId,
              empireArmyCapacity,
            ) - to.army.manpower,
          );
          const moveManpower = Math.min(needed, available, remainingMove, destinationRoom);
          if (moveManpower <= 1e-9) continue;
          const movedBaseQuality = {
            attack: from.army.baseAttack,
            defense: from.army.baseDefense,
          };
          from.army.manpower -= moveManpower;
          mixArmyBaseQualityV2(to.army, moveManpower, movedBaseQuality);
          to.army.manpower += moveManpower;
          outgoing.set(donor.id, Math.max(0, available - moveManpower));
          needed -= moveManpower;
          remainingMove -= moveManpower;
          recordMovement({
            playerId, sourceId: donor.id, targetId: hop,
            manpower: moveManpower, capacity: 0,
          });
        }
      }
      // Native capacity never moves and still defines the empire's total cap.
      // Existing soldiers may be stationed above a local cap through imperial
      // support, but this redistribution creates no personnel.
      for (const id of ids) {
        const army = state.territories[id]!.army;
        army.manpower = Math.max(0, army.manpower);
        resetEmptyArmyBaseQualityV2(army, content, id);
      }
    }
  }
  return movements.sort((left, right) => right.manpower - left.manpower
    || left.sourceId.localeCompare(right.sourceId)
    || left.targetId.localeCompare(right.targetId));
}

export function processWarsV2(
  state: WorldStateV2,
  content: WorldContentV2,
  logisticsMovements?: LogisticsMovementV2[],
  endedWars?: WarConclusionV2[],
): BattleEventV2[] {
  state.truces = state.truces.filter((truce) => truce.expiresTick > state.tick);
  state.offers.forEach((offer) => { if (offer.status === 'pending' && offer.expiresTick <= state.tick) offer.status = 'expired'; });
  const weeklyMovements = redistributeArmiesV2(state, content);
  if (logisticsMovements) logisticsMovements.push(...weeklyMovements);
  const battles: BattleEventV2[] = [];
  const usedSourceIds = new Set<TerritoryId>();
  for (const war of [...state.wars].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!state.wars.some((candidate) => candidate.id === war.id)) continue;
    if (selectIsEliminatedV2(state, war.attackerId)) {
      endWarsForEliminatedNationV2(state, war.attackerId, 'War ended after national elimination.', endedWars);
      continue;
    }
    if (selectIsEliminatedV2(state, war.defenderId)) {
      endWarsForEliminatedNationV2(state, war.defenderId, 'War ended after national elimination.', endedWars);
      continue;
    }
    if (war.revenge && state.tick >= war.revenge.expiresTick) {
      endWarV2(
        state,
        war,
        'The one-year retaliation window ended; both empires accepted a ceasefire.',
        TRUCE_TICKS,
        endedWars,
      );
      continue;
    }
    const attackerArmy = nationalCombatManpowerV2(state, war.attackerId);
    const defenderArmy = nationalCombatManpowerV2(state, war.defenderId);
    if (attackerArmy <= 0.000001 && defenderArmy <= 0.000001) {
      endWarV2(state, war, 'Mutual army exhaustion ended the war without absorption.', TRUCE_TICKS, endedWars);
      continue;
    }
    // Zero national manpower never hands over a multi-territory empire in one
    // global capitulation. The surviving army must win each connected territory
    // in successive battle pulses, so the campaign still advances by fronts.
    const legalFront = frontCandidatesV2(state, content, war.attackerId, war.defenderId).length > 0
      || frontCandidatesV2(state, content, war.defenderId, war.attackerId).length > 0;
    if (!legalFront || state.tick - war.lastBattleTick >= STALE_WAR_TICKS) {
      endWarV2(state, war, 'Automatic ceasefire after 26 weeks without a legal battle.', TRUCE_TICKS, endedWars);
      continue;
    }
    const warAge = state.tick - war.startedTick;
    if (warAge < WAR_MOBILIZATION_TICKS) continue;
    if ((warAge - WAR_MOBILIZATION_TICKS) % BATTLE_INTERVAL_TICKS !== 0) continue;
    const operations = chooseInitiativeOperationsV2(state, content, war);
    if (operations.length === 0) continue;
    let conquered = false;
    for (const operation of operations) {
      if (usedSourceIds.has(operation.sourceId)) continue;
      const enemyId = operation.commanderId === war.attackerId ? war.defenderId : war.attackerId;
      if (!operationValidV2(state, content, operation, operation.commanderId, enemyId)) continue;
      const battle = resolveBattlePulseV2(state, content, war, operation);
      if (!battle) continue;
      usedSourceIds.add(operation.sourceId);
      battles.push(battle);
      conquered ||= battle.conquered;
      // One declaration still resolves one territorial objective. Other
      // same-tick fronts stand down as soon as any one of them captures it.
      if (conquered) break;
    }
    const warBattles = battles.filter((battle) => battle.warId === war.id);
    if (warBattles.length > 0) {
      const attackerAfter = nationalCombatManpowerV2(state, war.attackerId);
      const defenderAfter = nationalCombatManpowerV2(state, war.defenderId);
      const conquestBattle = warBattles.find((battle) => battle.conquered);
      const revengeOpponentId = war.revenge?.claimantId === war.attackerId
        ? war.defenderId : war.attackerId;
      const revengeFulfilled = Boolean(war.revenge && conquestBattle
        && conquestBattle.attackerId === war.revenge.claimantId
        && state.territories[conquestBattle.targetId]?.coreOwner === revengeOpponentId);
      if (selectIsEliminatedV2(state, war.attackerId)) {
        endWarsForEliminatedNationV2(state, war.attackerId, 'War ended after national elimination.', endedWars);
      } else if (selectIsEliminatedV2(state, war.defenderId)) {
        endWarsForEliminatedNationV2(state, war.defenderId, 'War ended after national elimination.', endedWars);
      } else if (revengeFulfilled) {
        endWarV2(
          state,
          war,
          'Retaliation succeeded after one enemy core territory was conquered.',
          TRUCE_TICKS,
          endedWars,
        );
      } else if (conquered && !war.revenge) {
        // Defensive fallback for malformed legacy state. Canonical campaigns
        // always arm a single revenge window on the first non-terminal capture.
        endWarV2(state, war, 'War ended after one territory was conquered.', TRUCE_TICKS, endedWars);
      } else if (attackerAfter <= 0.000001 && defenderAfter <= 0.000001) {
        endWarV2(state, war, 'Mutual army exhaustion ended the war without absorption.', TRUCE_TICKS, endedWars);
      }
    }
  }
  return battles;
}

export function warStandingV2(state: WorldStateV2, content: WorldContentV2, war: WarStateV2, playerId: PlayerId): number {
  const enemyId = playerId === war.attackerId ? war.defenderId : war.attackerId;
  const signedScore = playerId === war.attackerId ? war.warScore : -war.warScore;
  const militaryBaseSnapshot = createMilitaryBaseSnapshotV2(state, content);
  return 25 * Math.log(Math.max(0.08,
    selectCurrentPowerV2(state, content, playerId, militaryBaseSnapshot)
      / Math.max(1, selectCurrentPowerV2(state, content, enemyId, militaryBaseSnapshot))))
    + signedScore * 0.70 - (state.players[playerId]!.warFatigue - state.players[enemyId]!.warFatigue) * 0.25;
}

export function peaceProposalTermsV2(
  state: WorldStateV2,
  content: WorldContentV2,
  warId: string,
  playerId: PlayerId,
): PeaceProposalTermsV2 {
  const war = state.wars.find((candidate) => candidate.id === warId);
  if (!war || (war.attackerId !== playerId && war.defenderId !== playerId)) return { allowed: false, reason: 'No active war.', strengthGap: 0 };
  const enemyId = playerId === war.attackerId ? war.defenderId : war.attackerId;
  const own = warStandingV2(state, content, war, playerId);
  const enemy = warStandingV2(state, content, war, enemyId);
  const gap = enemy - own;
  if (state.tick - war.startedTick < PEACE_REQUEST_MIN_WAR_AGE_TICKS) {
    return {
      allowed: false,
      reason: `Peace unlocks after ${PEACE_REQUEST_MIN_WAR_AGE_TICKS} weeks.`,
      warId,
      strengthGap: round(gap),
    };
  }
  if (war.battles < 10) return { allowed: false, reason: 'Ten battle pulses are required.', warId, strengthGap: round(gap) };
  if (state.offers.some((offer) => offer.warId === war.id
    && offer.status === 'pending' && offer.expiresTick > state.tick)) {
    return { allowed: false, reason: 'A peace offer is already pending.', warId, strengthGap: round(gap) };
  }
  const cooldownRemaining = war.lastPeaceOfferTick >= war.startedTick
    ? Math.max(0, war.lastPeaceOfferTick + PEACE_REQUEST_COOLDOWN_TICKS - state.tick)
    : 0;
  if (cooldownRemaining > 0) {
    return {
      allowed: false,
      reason: `Peace can be requested again in ${cooldownRemaining} weeks.`,
      warId,
      strengthGap: round(gap),
    };
  }
  if (gap < 10) return { allowed: false, reason: 'Only the weaker side may offer terms.', warId, strengthGap: round(gap) };
  const cash = Math.max(0.2, Math.min(state.players[playerId]!.treasury * 0.50,
    4 * selectNationalEconomyV2(state, content, enemyId).weeklyRevenue));
  return {
    allowed: true,
    warId,
    strengthGap: round(gap),
    suggestedSettlement: 'reparations',
    cashAmount: round(cash),
  };
}

export function proposePeaceSettlementV2(
  state: WorldStateV2,
  content: WorldContentV2,
  fromId: PlayerId,
  targetId: PlayerId,
  settlement: PeaceSettlementV2,
): CommandResultV2 {
  const war = selectActiveWarBetweenV2(state, fromId, targetId);
  if (!war) return { accepted: false, reason: 'No active war.' };
  const terms = peaceProposalTermsV2(state, content, war.id, fromId);
  if (!terms.allowed) return { accepted: false, reason: terms.reason };
  if (settlement === 'ceasefire') return requestCeasefireV2(state, content, war.id, fromId);
  if (state.offers.some((offer) => offer.warId === war.id && offer.status === 'pending')) return { accepted: false, reason: 'A peace offer is already pending.' };
  state.offers.push({
    id: `offer-${state.nextOfferId++}`,
    fromId,
    toId: targetId,
    warId: war.id,
    settlement,
    createdTick: state.tick,
    expiresTick: state.tick + PEACE_OFFER_DURATION_TICKS,
    status: 'pending',
    cashAmount: settlement === 'reparations' ? terms.cashAmount : undefined,
  });
  war.lastPeaceOfferTick = state.tick;
  return { accepted: true };
}

export function respondToOfferV2(
  state: WorldStateV2,
  _content: WorldContentV2,
  offerId: string,
  accept: boolean,
  endedWars?: WarConclusionV2[],
): CommandResultV2 {
  const offer = state.offers.find((candidate) => candidate.id === offerId && candidate.status === 'pending');
  if (!offer || offer.expiresTick <= state.tick) return { accepted: false, reason: 'Offer is unavailable.' };
  if (!accept) {
    offer.status = 'declined';
    return { accepted: true };
  }
  const war = state.wars.find((candidate) => candidate.id === offer.warId);
  if (!war) return { accepted: false, reason: 'War already ended.' };
  let treatyTruceTicks = TRUCE_TICKS;
  let peaceReason = `Peace accepted; a ${TRUCE_TICKS}-week truce begins.`;
  let settlement: WarConclusionSettlementV2 = { kind: offer.settlement };
  if (offer.settlement === 'ceasefire') {
    const weeklyCost = offer.weeklyCost ?? 0;
    const paymentWeeks = offer.paymentWeeks ?? CEASEFIRE_PAYMENT_WEEKS;
    state.ceasefireObligations.push({
      warId: war.id,
      payerId: offer.fromId,
      payeeId: offer.toId,
      weeklyCost,
      startsTick: state.tick,
      expiresTick: state.tick + paymentWeeks,
    });
    state.players[offer.fromId]!.ceasefiresRequested += 1;
    addWarFatigueGainV2(
      state,
      offer.fromId,
      2,
      composeTraitContextV2(
        traitNationContextV2(state, offer.fromId),
        traitWarContextV2(war, offer.fromId),
      ),
    );
    treatyTruceTicks = paymentWeeks + CEASEFIRE_POST_PAYMENT_TRUCE_TICKS;
    peaceReason = `Peace treaty accepted: ${paymentWeeks} weekly instalments and ${CEASEFIRE_POST_PAYMENT_TRUCE_TICKS} additional weeks of mutual peace.`;
    settlement = {
      kind: 'ceasefire',
      payerId: offer.fromId,
      payeeId: offer.toId,
      weeklyCost,
      paymentWeeks,
    };
  } else if (offer.settlement === 'reparations') {
    const amount = Math.min(offer.cashAmount ?? 0, Math.max(0, state.players[offer.fromId]!.treasury));
    state.players[offer.fromId]!.treasury = round(state.players[offer.fromId]!.treasury - amount);
    state.players[offer.toId]!.treasury = round(state.players[offer.toId]!.treasury + amount);
    settlement = {
      kind: 'reparations',
      payerId: offer.fromId,
      payeeId: offer.toId,
      amount,
    };
  }
  offer.status = 'accepted';
  endWarV2(state, war, peaceReason, treatyTruceTicks, endedWars, settlement);
  return { accepted: true };
}
