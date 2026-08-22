import {
  AI_DECISION_INTERVAL,
  AI_DEFENSIVE_AID_AGGRESSOR_RATIO,
  AI_DEFENSIVE_AID_COOLDOWN,
  AI_DEFENSIVE_AID_MIN_AGE,
  AI_DEFENSIVE_AID_MIN_BATTLES,
  AI_FIRST_WAR_TICK,
  AI_GLOBAL_WAR_COOLDOWN,
  AI_MAJOR_POWER_AVOIDANCE_TICKS,
  AI_REGIONAL_ESCALATION_COOLDOWN,
  AI_REGIONAL_ESCALATION_EXTRA_WAR_CAP,
  AI_REGIONAL_ESCALATION_MIN_AGE,
  AI_REGIONAL_ESCALATION_MIN_BATTLES,
  aiActiveWarCapV2,
  PEACE_REQUEST_MIN_WAR_AGE_TICKS,
  RESEARCH_BRANCHES,
  RIVAL_AI_RESEARCH_REVIEW_TICKS,
  SUPER_AI_RESEARCH_REVIEW_TICKS,
  clamp,
} from './balance';
import { nextRandom } from '../../game/random';
import type { WorldContentV2 } from './content';
import {
  campaignStrategicVariationV2,
  geopoliticalTargetGuidanceV2,
  strategicAlignmentScoreV2,
} from './geopolitics';
import {
  createPowerSnapshotV2,
  selectArmyStrengthV2,
  selectControlledPopulationV2,
  selectFoodDemandV2,
  selectIsEliminatedV2,
  selectNationalEconomyV2,
  selectNuclearPowerV2,
  selectPopulationDynamicsV2,
  selectRapidRecruitmentTermsV2,
  selectResearchPortfolioV2,
  selectResearchSurgeTermsV2,
  selectTerritoriesOfV2,
  selectTotalManpowerV2,
  selectWarAccessTypeV2,
  selectWarMobilizationCostV2,
  selectWarsOfV2,
  sortedNationIdsV2,
  type PowerSnapshotV2,
} from './selectors';
import { isDefensiveFederationV2, selectGlobalResistanceV2 } from './resistance';
import { forecastWarV2, peaceProposalTermsV2 } from './war';

/**
 * Soft strategic deterrence between nuclear powers. It is strongest between
 * near peers and early in the campaign, but never acts as a declaration gate.
 */
export function nuclearRivalryPenaltyV2(
  attackerLevel: number,
  targetLevel: number,
  tick: number,
  powerRatio: number,
): number {
  if (attackerLevel <= 0 || targetLevel <= 0) return 0;
  const parity = clamp(1 - Math.abs(Math.log2(Math.max(0.125, powerRatio))) / 3, 0, 1);
  const earlyCaution = 6 * clamp((520 - tick) / 520, 0, 1);
  const mutualDeterrence = 4 + 3 * Math.min(attackerLevel, targetLevel) + earlyCaution;
  return mutualDeterrence * (0.45 + 0.55 * parity);
}
import type {
  BudgetPolicyV2,
  PlayerId,
  ResearchAllocationsV2,
  ResearchBranchV2,
  WarAccessV2,
  WarStateV2,
  WorldCommandV2,
  WorldStateV2,
} from './types';

interface RegionalEscalationCandidateV2 {
  linkedWarId: string;
  priority: number;
  defensiveAid: boolean;
  interventionChance: number;
}

/**
 * One ordinary expansion roll per eight-week review keeps an open global
 * window from turning into dozens of stacked probability checks. Defensive
 * aid is exceptional and does not consume this roll.
 */
export const AI_EXPANSION_ROLLS_PER_DECISION = 1;

/** Pick the strongest AI priority only from programs that can still advance. */
export function selectAiResearchSurgeTargetV2(
  allocations: ResearchAllocationsV2,
  breakthroughs: Readonly<Record<ResearchBranchV2, number>>,
  availableBranches: readonly ResearchBranchV2[],
): ResearchBranchV2 | undefined {
  return [...availableBranches].sort((left, right) => (
    allocations[right] - allocations[left]
      || breakthroughs[left] - breakthroughs[right]
      || left.localeCompare(right)
  ))[0];
}

/** Ordinary countries fight one war at a time; mature great powers may sustain two. */
export function aiConcurrentWarLimitV2(majorPowerDrive: number, tick: number): number {
  return majorPowerDrive >= 0.60 && tick >= 260 ? 2 : 1;
}

/**
 * Normal expansion only targets a country at peace. An explicit regional
 * intervention may create a second front, while emergency aid to the human
 * defender retains its wider but still bounded coalition window.
 */
export function aiTargetWarLimitV2(regionalEscalation: boolean, defensiveAid: boolean): number {
  return defensiveAid ? 4 : regionalEscalation ? 2 : 1;
}

function accessibleOwnersV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): Array<{ targetId: PlayerId; access: Exclude<WarAccessV2, 'none'> }> {
  return sortedNationIdsV2(state).map((targetId) => ({
    targetId,
    access: targetId === playerId ? 'none' as const : selectWarAccessTypeV2(state, content, playerId, targetId),
  })).filter((candidate): candidate is { targetId: PlayerId; access: Exclude<WarAccessV2, 'none'> } => (
    candidate.access !== 'none'
  ));
}

function interventionAffinityV2(content: WorldContentV2, leftId: PlayerId, rightId: PlayerId): number {
  const left = content.nations[leftId];
  const right = content.nations[rightId];
  if (!left || !right) return 0;
  const shared = left.influenceTags.filter((tag) => right.influenceTags.includes(tag));
  return (shared.some((tag) => tag.startsWith('bloc:')) ? 10 : 0)
    + (left.subregion === right.subregion ? 4 : left.continent === right.continent ? 1 : 0)
    + strategicAlignmentScoreV2(leftId, rightId);
}

/**
 * Finds a regional crisis around the proposed target. Normal AI-vs-AI wars
 * retain the opportunistic escalation model. A separate, tightly bounded
 * exception lets a neighbour aid the human defender against a much stronger
 * aggressor; human offensives remain excluded so this cannot create a dogpile.
 */
function regionalEscalationCandidateV2(
  state: WorldStateV2,
  content: WorldContentV2,
  supporterId: PlayerId,
  targetId: PlayerId,
  access: Exclude<WarAccessV2, 'none'>,
  supporterWars: readonly WarStateV2[],
  warsByTarget: ReadonlyMap<PlayerId, readonly WarStateV2[]>,
  powerSnapshot: PowerSnapshotV2,
): RegionalEscalationCandidateV2 | undefined {
  if (supporterId === state.humanPlayerId || targetId === state.humanPlayerId) return undefined;
  const candidates = (warsByTarget.get(targetId) ?? []).filter((war) => (
    war.attackerId !== supporterId && war.defenderId !== supporterId
  )).map((war) => {
    const partnerId = war.attackerId === targetId ? war.defenderId : war.attackerId;
    if (supporterWars.some((candidate) => (
      candidate.attackerId === partnerId || candidate.defenderId === partnerId
    ))) return undefined;
    const partnerAffinity = interventionAffinityV2(content, supporterId, partnerId);
    const targetAffinity = interventionAffinityV2(content, supporterId, targetId);
    const alignmentEdge = partnerAffinity - targetAffinity;
    const defensiveAid = war.defenderId === state.humanPlayerId
      && partnerId === state.humanPlayerId
      && war.attackerId === targetId;
    const aggressorPower = powerSnapshot.byNation.get(targetId) ?? 0;
    const defenderPower = powerSnapshot.byNation.get(partnerId) ?? 0;
    const aggressorRatio = aggressorPower / Math.max(1, defenderPower);
    const neighboursDefender = selectWarAccessTypeV2(
      state,
      content,
      supporterId,
      partnerId,
    ) === 'land';
    if (defensiveAid) {
      if (!neighboursDefender || aggressorRatio < AI_DEFENSIVE_AID_AGGRESSOR_RATIO
        || alignmentEdge < -2) return undefined;
      const priority = 34
        + Math.min(20, (state.tick - war.startedTick - AI_DEFENSIVE_AID_MIN_AGE) * 0.45)
        + Math.min(16, war.battles)
        + Math.max(0, alignmentEdge) * 1.4
        + Math.min(18, (aggressorRatio - AI_DEFENSIVE_AID_AGGRESSOR_RATIO) * 8)
        - (access === 'naval' ? 2 : 0);
      const interventionChance = clamp(0.16
        + Math.min(0.16, Math.max(0, alignmentEdge) * 0.015)
        + Math.min(0.16, Math.max(0, aggressorRatio - AI_DEFENSIVE_AID_AGGRESSOR_RATIO) * 0.08)
        + (access === 'land' ? 0.06 : 0), 0.12, 0.54);
      return { linkedWarId: war.id, priority, defensiveAid: true, interventionChance };
    }
    const targetScore = war.attackerId === targetId ? war.warScore : -war.warScore;
    const alignedIntervention = alignmentEdge >= 4;
    const majorSupporter = (content.nations[supporterId]?.real.powerIndex ?? 0) >= 65;
    const landOpportunist = access === 'land'
      && (!majorSupporter || state.tick >= 78)
      && (targetScore <= -6 || war.battles >= 12);
    if (!alignedIntervention && !landOpportunist) return undefined;
    const age = state.tick - war.startedTick;
    const priority = 24
      + Math.min(20, (age - AI_REGIONAL_ESCALATION_MIN_AGE) * 0.35)
      + Math.min(18, war.battles * 0.8)
      + Math.max(0, alignmentEdge) * 1.6
      + (alignedIntervention ? Math.max(0, targetScore) * 0.25 : Math.max(0, -targetScore) * 0.15)
      - (access === 'naval' ? 2 : 0);
    return { linkedWarId: war.id, priority, defensiveAid: false, interventionChance: 0 };
  }).filter((candidate): candidate is RegionalEscalationCandidateV2 => Boolean(candidate));
  return candidates.sort((left, right) => right.priority - left.priority
    || left.linkedWarId.localeCompare(right.linkedWarId))[0];
}

function regionalWarsByTargetV2(state: WorldStateV2): ReadonlyMap<PlayerId, readonly WarStateV2[]> {
  const result = new Map<PlayerId, WarStateV2[]>();
  for (const war of state.wars) {
    if (war.attackerId === state.humanPlayerId || state.tick - war.lastBattleTick > 12) continue;
    const humanDefense = war.defenderId === state.humanPlayerId;
    if (state.tick - war.startedTick < (humanDefense ? AI_DEFENSIVE_AID_MIN_AGE : AI_REGIONAL_ESCALATION_MIN_AGE)
      || war.battles < (humanDefense ? AI_DEFENSIVE_AID_MIN_BATTLES : AI_REGIONAL_ESCALATION_MIN_BATTLES)) continue;
    if (humanDefense) {
      result.set(war.attackerId, [...(result.get(war.attackerId) ?? []), war]);
      continue;
    }
    result.set(war.attackerId, [...(result.get(war.attackerId) ?? []), war]);
    result.set(war.defenderId, [...(result.get(war.defenderId) ?? []), war]);
  }
  return result;
}

function budgetCommands(playerId: PlayerId, current: BudgetPolicyV2, target: BudgetPolicyV2): WorldCommandV2[] {
  return current.military === target.military && current.research === target.research && current.development === target.development
    ? [] : [{ type: 'set-budget-policy', playerId, budget: target }];
}

function weightedBudgetPolicyV2(scores: Readonly<BudgetPolicyV2>): BudgetPolicyV2 {
  const baseline = 10;
  const domains = ['military', 'research', 'development'] as const;
  const distributable = 100 - baseline * domains.length;
  const total = domains.reduce((sum, domain) => sum + Math.max(0.05, scores[domain]), 0);
  const exact = domains.map((domain, index) => {
    const share = Math.max(0.05, scores[domain]) / total * distributable;
    return { domain, index, value: baseline + Math.floor(share), remainder: share - Math.floor(share) };
  });
  let remaining = 100 - exact.reduce((sum, item) => sum + item.value, 0);
  for (const item of [...exact].sort((left, right) => right.remainder - left.remainder || left.index - right.index)) {
    if (remaining-- <= 0) break;
    item.value += 1;
  }
  return Object.fromEntries(exact.map((item) => [item.domain, item.value])) as unknown as BudgetPolicyV2;
}

function aiBudgetTargetV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  leaderResearch: number,
): BudgetPolicyV2 {
  const wars = selectWarsOfV2(state, playerId);
  const player = state.players[playerId]!;
  const foodStress = clamp((0.98 - state.players[playerId]!.foodSecurity) / 0.58, 0, 1);
  const army = selectArmyStrengthV2(state, content, playerId);
  const territories = selectTerritoriesOfV2(state, playerId);
  const condition = territories.length > 0
    ? territories.reduce((sum, territory) => sum + territory.condition, 0) / territories.length : 0;
  const economy = selectNationalEconomyV2(state, content, playerId);
  const treasuryWeeks = player.treasury / Math.max(0.01, economy.weeklyRevenue);
  const ownResearch = Object.values(player.research.breakthroughs).reduce((a, b) => a + b, 0);
  const nation = content.nations[playerId]!;
  const researchStrength = clamp(nation.real.researchCapacity / 30, 0, 1);
  // Conquered residents only become usable national capacity as integration
  // advances. AI planning must use that same population share as taxation,
  // army capacity and strategic power instead of gaining every resident on
  // the capture tick.
  const controlledPopulation = Math.max(0.05, selectControlledPopulationV2(state, playerId));
  const poverty = clamp((20 - economy.controlledOutput / controlledPopulation) / 18, 0, 1);
  const debtStress = clamp(-treasuryWeeks / 8, 0, 1);
  const researchGap = clamp((leaderResearch - ownResearch) / 10, 0, 1);
  const populationDecline = clamp(
    -selectPopulationDynamicsV2(state, content, playerId, 0).annualNetRate / 0.02,
    0,
    1,
  );
  const foodReserveWeeks = player.foodStock / Math.max(0.01, selectFoodDemandV2(state, playerId));
  const reserveStress = clamp((2 - foodReserveWeeks) / 2, 0, 1);
  const survivalStress = Math.max(foodStress, populationDecline, reserveStress, debtStress);
  if (wars.length === 0 && survivalStress > 0.02) {
    return weightedBudgetPolicyV2({
      military: 0.40 + 0.30 * (1 - army.fillRatio),
      research: 0.80 + 0.85 * researchGap + 0.90 * foodStress,
      development: 2.80 + 3.20 * survivalStress + 1.20 * (1 - condition) + 0.80 * poverty,
    });
  }
  return weightedBudgetPolicyV2({
    military: 1.15 + wars.length * 1.25 + 1.65 * (1 - army.fillRatio)
      + 0.45 * nation.ambition,
    research: 0.85 + 1.30 * researchGap + 0.80 * researchStrength
      + 0.65 * foodStress,
    development: 1.10 + 1.65 * foodStress + 1.10 * (1 - condition)
      + 1.25 * debtStress + 0.85 * poverty + (wars.length === 0 ? 0.35 : 0),
  });
}

function sameResearchAllocationsV2(left: ResearchAllocationsV2, right: ResearchAllocationsV2): boolean {
  return RESEARCH_BRANCHES.every((branch) => left[branch] === right[branch]);
}

function weightedResearchAllocationsV2(scores: Readonly<Record<ResearchBranchV2, number>>): ResearchAllocationsV2 {
  const baseline = 5;
  const distributable = 100 - baseline * RESEARCH_BRANCHES.length;
  const totalScore = RESEARCH_BRANCHES.reduce((sum, branch) => sum + Math.max(0.01, scores[branch]), 0);
  const exact = RESEARCH_BRANCHES.map((branch, index) => {
    const share = Math.max(0.01, scores[branch]) / totalScore * distributable;
    return { branch, index, value: baseline + Math.floor(share), remainder: share - Math.floor(share) };
  });
  let remaining = 100 - exact.reduce((sum, item) => sum + item.value, 0);
  for (const item of [...exact].sort((left, right) => right.remainder - left.remainder || left.index - right.index)) {
    if (remaining <= 0) break;
    item.value += 1;
    remaining -= 1;
  }
  return Object.fromEntries(exact.map((item) => [item.branch, item.value])) as ResearchAllocationsV2;
}

export function selectAiResearchAllocationsV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  powers: PowerSnapshotV2,
): ResearchAllocationsV2 {
  const activeWars = selectWarsOfV2(state, playerId);
  const nation = content.nations[playerId]!;
  const player = state.players[playerId]!;
  const army = selectArmyStrengthV2(state, content, playerId);
  const economy = selectNationalEconomyV2(state, content, playerId);
  const territories = selectTerritoriesOfV2(state, playerId);
  const averageCondition = territories.length > 0
    ? territories.reduce((sum, territory) => sum + territory.condition, 0) / territories.length : 0;
  const ownPower = powers.byNation.get(playerId) ?? 0;
  const enemyPower = activeWars.reduce((sum, war) => {
    const enemyId = war.attackerId === playerId ? war.defenderId : war.attackerId;
    return sum + (powers.byNation.get(enemyId) ?? 0);
  }, 0);
  const ownResearch = Object.values(player.research.breakthroughs).reduce((a, b) => a + b, 0);
  const leaderResearch = powers.leaderBreakthroughs;
  const population = Math.max(0.05, selectControlledPopulationV2(state, playerId));
  const outputPerPerson = economy.controlledOutput / population;
  const smallPopulation = clamp(Math.log(80 / population) / Math.log(80), 0, 1);
  const populationDecline = clamp(
    -selectPopulationDynamicsV2(state, content, playerId, 0).annualNetRate / 0.02,
    0,
    1,
  );
  const poverty = clamp((45 - outputPerPerson) / 40, 0, 1);
  const wealth = clamp((outputPerPerson - 18) / 65, 0, 1);
  const fillGap = clamp((0.90 - army.fillRatio) / 0.65, 0, 1);
  const damage = clamp((0.92 - averageCondition) / 0.65, 0, 1);
  const warPressure = activeWars.length === 0 ? 0 : clamp(enemyPower / Math.max(1, ownPower), 0.35, 2.5) / 2.5;
  const operations = activeWars.flatMap((war) => (
    war.attackerId === playerId ? war.attackerOperations : war.defenderOperations
  ));
  const liveFrontCount = operations.length > 0 ? operations.length : activeWars.length;
  const multipleFronts = clamp((liveFrontCount - 1) / 2, 0, 1);
  const overseasFronts = operations.filter((operation) => operation.access === 'naval').length;
  const researchGap = clamp((leaderResearch - ownResearch) / 12, 0, 1);
  const lowQuality = clamp((1.55 - nation.militaryQuality) / 0.85, 0, 1);
  const elitePotential = clamp((nation.real.researchCapacity - 8) / 22, 0, 1);
  const ambition = clamp(nation.ambition, 0, 1);
  const fatigue = clamp(player.warFatigue / 70, 0, 1);
  const foodStress = clamp((0.98 - player.foodSecurity) / 0.58, 0, 1);
  const foodReserveWeeks = player.foodStock / Math.max(0.01, selectFoodDemandV2(state, playerId));
  const foodReserveStress = clamp((2 - foodReserveWeeks) / 2, 0, 1);
  const foodRecoveryStress = Math.max(foodStress, foodReserveStress);
  const deterrence = selectNuclearPowerV2(state, content, playerId);
  const deterrenceResearchValue = deterrence.level === 0
    ? wealth * elitePotential : deterrence.maxed ? 0 : 0.25 * elitePotential;

  const scores: Record<ResearchBranchV2, number> = {
    'population-recruitment': Math.max(0.10, 0.75 + 2.4 * fillGap + 1.0 * smallPopulation
      + 1.25 * populationDecline + 0.35 * warPressure - 2.50 * foodRecoveryStress),
    'military-industry': 0.80 + 0.95 * fillGap + 0.55 * activeWars.length
      + 0.40 * ambition,
    'advanced-weapons': 0.80 + 0.85 * wealth + 0.70 * elitePotential + 0.70 * lowQuality
      + 0.65 * deterrenceResearchValue
      + (activeWars.length > 0 ? 1.0 * (1 - warPressure) : 0.35 * ambition),
    'defensive-systems': 0.75 + 2.0 * warPressure + 0.75 * damage + 0.45 * fatigue + 0.40 * multipleFronts,
    'logistics-medicine': 0.80 + 1.15 * activeWars.length + 1.15 * multipleFronts + 1.0 * damage
      + 0.45 * overseasFronts + 0.45 * fillGap + 7.0 * foodRecoveryStress,
    'economy-science': 0.95 + 2.15 * poverty + 1.35 * researchGap + (activeWars.length === 0 ? 0.65 : 0)
      + 0.45 * (1 - elitePotential) + 5.0 * foodRecoveryStress,
  };
  for (const branch of RESEARCH_BRANCHES) {
    // Repeating the same branch becomes exponentially harder in the research
    // system; this matching penalty makes the planner diversify before a path
    // turns into an obviously wasteful default.
    scores[branch] /= 1.10 ** player.research.breakthroughs[branch];
  }
  return weightedResearchAllocationsV2(scores);
}

export function planAiCommandsV2(state: WorldStateV2, content: WorldContentV2): WorldCommandV2[] {
  if (state.tick === 0 || state.tick % AI_DECISION_INTERVAL !== 0 || state.gameOver) return [];
  const commands: WorldCommandV2[] = [];
  const living = sortedNationIdsV2(state).filter((id) => !selectIsEliminatedV2(state, id));
  const powerSnapshot = createPowerSnapshotV2(state, content);
  // Rotate strategic initiative so every country gets credible expansion
  // windows instead of alphabetically early nations consuming the war slot.
  const initiativeOffset = living.length > 0
    ? (Math.floor(state.tick / AI_DECISION_INTERVAL) + state.seed) % living.length : 0;
  const rotatingOrder = [...living.slice(initiativeOffset), ...living.slice(0, initiativeOffset)];
  const rotatingInitiative = rotatingOrder.filter((id) => id !== state.humanPlayerId).slice(0, 16);
  const persistentMajorPowers = [...living].filter((id) => id !== state.humanPlayerId)
    .sort((left, right) => (content.nations[right]?.real.powerIndex ?? 0)
      - (content.nations[left]?.real.powerIndex ?? 0) || left.localeCompare(right))
    .slice(0, 8);
  const majorInitiativeOffset = persistentMajorPowers.length > 0
    // Major-only windows occur every other global window. Advance two places
    // each time so one viable power cannot repeatedly sit directly behind an
    // ineligible leader and consume every reserved declaration.
    ? Math.floor(state.tick / AI_GLOBAL_WAR_COOLDOWN) % persistentMajorPowers.length
    : 0;
  const rotatingMajorPowers = [
    ...persistentMajorPowers.slice(majorInitiativeOffset),
    ...persistentMajorPowers.slice(0, majorInitiativeOffset),
  ];
  // Reserve every other global expansion window for the powers able to reshape
  // a region. Previously a rotating minor almost always consumed the single
  // declaration slot before a major power was evaluated, making the top states
  // appear inert despite having suitable goals, cash and military strength.
  const majorPowerWindow = Math.floor(state.tick / AI_GLOBAL_WAR_COOLDOWN) % 2 === 0;
  const planningOrder = majorPowerWindow
    ? [...rotatingMajorPowers, ...rotatingOrder.filter((id) => !persistentMajorPowers.includes(id))]
    : rotatingOrder;
  const warInitiative = new Set<PlayerId>([...rotatingInitiative, ...persistentMajorPowers]);
  const activeWarCap = aiActiveWarCapV2(living.length, state.tick);
  const escalationWarCap = activeWarCap + AI_REGIONAL_ESCALATION_EXTRA_WAR_CAP;
  const resistance = selectGlobalResistanceV2(state);
  const regionalWarsByTarget = regionalWarsByTargetV2(state);
  const defensiveAidSupporters = new Set<PlayerId>();
  for (const war of state.wars) {
    if (war.defenderId !== state.humanPlayerId || war.attackerId === state.humanPlayerId) continue;
    for (const supporterId of living) {
      if (supporterId === war.attackerId || supporterId === war.defenderId) continue;
      if (selectWarAccessTypeV2(state, content, supporterId, war.defenderId) === 'land') {
        defensiveAidSupporters.add(supporterId);
      }
    }
  }
  let warPlanned = false;
  let expansionRollsUsed = 0;
  for (const playerId of planningOrder) {
    const player = state.players[playerId]!;
    commands.push(...budgetCommands(playerId, player.budget, aiBudgetTargetV2(
      state,
      content,
      playerId,
      powerSnapshot.leaderBreakthroughs,
    )));
    const researchReviewTicks = playerId === state.humanPlayerId
      ? SUPER_AI_RESEARCH_REVIEW_TICKS : RIVAL_AI_RESEARCH_REVIEW_TICKS;
    if (state.tick % researchReviewTicks === 0) {
      const allocations = selectAiResearchAllocationsV2(state, content, playerId, powerSnapshot);
      if (!sameResearchAllocationsV2(player.research.allocations, allocations)) {
        commands.push({ type: 'set-research-allocations', playerId, allocations });
      }
    }
    if (playerId !== state.humanPlayerId) {
      const army = selectArmyStrengthV2(state, content, playerId);
      const wars = selectWarsOfV2(state, playerId);
      const incomingOffer = state.offers.filter((offer) => (
        offer.toId === playerId && offer.status === 'pending' && offer.expiresTick > state.tick
      )).sort((left, right) => left.createdTick - right.createdTick || left.id.localeCompare(right.id))[0];
      if (incomingOffer) {
        const requesterPower = powerSnapshot.byNation.get(incomingOffer.fromId) ?? 0;
        const ownPower = powerSnapshot.byNation.get(playerId) ?? 0;
        const confidence = clamp(ownPower / Math.max(1, requesterPower) - 1, 0, 1);
        const ambition = clamp(content.nations[playerId]?.ambition ?? 0, 0, 1);
        const multiFrontPressure = clamp((wars.length - 1) / 2, 0, 1);
        const acceptChance = clamp(0.82
          - 0.18 * ambition
          - 0.18 * confidence
          + 0.16 * (player.warFatigue / 100)
          + 0.08 * multiFrontPressure, 0.48, 0.92);
        commands.push({
          type: 'respond-to-offer',
          offerId: incomingOffer.id,
          accept: nextRandom(state) < acceptChance,
        });
        continue;
      }
      // Peace is a strategic decision after a sustained campaign, never a
      // reaction re-rolled alongside routine battle pulses.
      const peaceCandidate = wars.filter((war) => (
        state.tick - war.startedTick >= PEACE_REQUEST_MIN_WAR_AGE_TICKS
      )).map((war) => ({
        war,
        terms: peaceProposalTermsV2(state, content, war.id, playerId),
      })).filter((candidate) => candidate.terms.allowed)
        .sort((left, right) => right.terms.strengthGap - left.terms.strengthGap
          || left.war.id.localeCompare(right.war.id))[0];
      if (peaceCandidate) {
        const pressure = clamp(
          0.08 + peaceCandidate.terms.strengthGap / 120
            + player.warFatigue / 220 + Math.max(0, 0.35 - army.fillRatio),
          0.10,
          0.62,
        );
        if (nextRandom(state) < pressure) {
          commands.push({ type: 'request-ceasefire', warId: peaceCandidate.war.id, requesterId: playerId });
          continue;
        }
      }
      const terms = selectRapidRecruitmentTermsV2(state, content, playerId);
      const economy = selectNationalEconomyV2(state, content, playerId);
      const defending = wars.some((war) => war.defenderId === playerId);
      const hostilePower = wars.reduce((sum, war) => {
        const enemyId = war.attackerId === playerId ? war.defenderId : war.attackerId;
        return sum + (powerSnapshot.byNation.get(enemyId) ?? 0);
      }, 0);
      const ownPower = powerSnapshot.byNation.get(playerId) ?? 0;
      const severeNeed = terms.atWar
        ? defending && army.fillRatio < 0.20 && hostilePower > ownPower * 1.10
        : army.fillRatio < 0.28;
      const cashAfter = player.treasury - terms.cost;
      const safeRunway = terms.atWar ? 3 : 2;
      const rareChance = terms.atWar ? 0.06 : 0.025;
      if (terms.allowed && severeNeed
        && cashAfter >= economy.weeklyRevenue * safeRunway
        && nextRandom(state) < rareChance) {
        commands.push({ type: 'rapid-recruitment', playerId });
      }
      // Rival planners can use the same costly accelerator as the player,
      // but only from a large peacetime surplus and for a real technology gap.
      const researchGap = Math.max(0, powerSnapshot.leaderBreakthroughs
        - Object.values(player.research.breakthroughs).reduce((sum, value) => sum + value, 0));
      if (state.tick % RIVAL_AI_RESEARCH_REVIEW_TICKS === 0
        && wars.length === 0 && researchGap >= 5
        && warInitiative.has(playerId)
        && player.researchSurgeAvailableTick <= state.tick
        && player.treasury >= economy.weeklyRevenue * 10) {
        // A surge is program-specific: follow the nation's strongest current
        // research priority, then favour the least-developed branch on ties.
        const availableBranches = selectResearchPortfolioV2(state, content, playerId)
          .filter((program) => !program.maxed)
          .map((program) => program.branch);
        const targetBranch = selectAiResearchSurgeTargetV2(
          player.research.allocations,
          player.research.breakthroughs,
          availableBranches,
        );
        if (targetBranch) {
          const researchSurge = selectResearchSurgeTermsV2(state, content, playerId, targetBranch);
          if (researchSurge.allowed
            && player.treasury - researchSurge.cost >= economy.weeklyRevenue * 8
            && nextRandom(state) < clamp(0.015 + researchGap * 0.002, 0.015, 0.045)) {
            commands.push({ type: 'research-surge', playerId, targetBranch });
          }
        }
      }
    }
    if (playerId === state.humanPlayerId) continue;
    // Emergency neighbours review aid independently of the rotating expansion
    // initiative. This preserves rare defensive help without increasing the
    // frequency of ordinary wars.
    if (!warInitiative.has(playerId) && !defensiveAidSupporters.has(playerId)) continue;
    const coalitionMember = resistance.memberIds.includes(playerId);
    const federation = isDefensiveFederationV2(state, playerId);
    const nation = content.nations[playerId]!;
    const expansionAmbition = clamp(nation.ambition, 0, 1);
    const majorPowerDrive = clamp((nation.real.powerIndex - 35) / 65, 0, 1);
    const ownWars = selectWarsOfV2(state, playerId);
    const ownWarLimit = aiConcurrentWarLimitV2(majorPowerDrive, state.tick);
    const weeksSinceGlobalStart = state.tick - state.aiEscalation.lastWarStartTick;
    const normalWindowOpen = state.wars.length < activeWarCap
      && weeksSinceGlobalStart >= AI_GLOBAL_WAR_COOLDOWN;
    const escalationWindowOpen = regionalWarsByTarget.size > 0
      && state.wars.length < escalationWarCap
      && weeksSinceGlobalStart >= AI_DEFENSIVE_AID_COOLDOWN;
    if (warPlanned || state.tick < AI_FIRST_WAR_TICK || state.wars.length >= escalationWarCap
      || (!normalWindowOpen && !escalationWindowOpen)
      || ownWars.length >= ownWarLimit || player.warFatigue >= Math.max(9, 18 - ownWars.length * 5)) continue;
    const ownPower = (powerSnapshot.byNation.get(playerId) ?? 0) / (1 + ownWars.length * 0.65);
    const ownEconomy = selectNationalEconomyV2(state, content, playerId);
    const treasuryWeeks = player.treasury / Math.max(0.01, ownEconomy.weeklyRevenue);
    const foodReserveWeeks = player.foodStock / Math.max(0.01, selectFoodDemandV2(state, playerId));
    const populationTrend = selectPopulationDynamicsV2(state, content, playerId, 0).annualNetRate;
    const survivalBlocksExpansion = player.foodSecurity < 0.92 || foodReserveWeeks < 0.75
      || populationTrend < -0.005 || player.treasury < 0;
    const candidates = accessibleOwnersV2(state, content, playerId).filter(({ targetId }) => (
      !selectIsEliminatedV2(state, targetId)
      // A loose containment network is diplomatic preparation, not an
      // automatic pile-on. Its members neither attack one another nor open a
      // new player front; they wait to fuse into a real federation first.
      && !(coalitionMember && resistance.memberIds.includes(targetId))
      && !(coalitionMember && !federation && targetId === state.humanPlayerId)
    )).map(({ targetId, access }) => {
      const regionalEscalation = (!coalitionMember || federation)
        && !resistance.memberIds.includes(targetId)
        ? regionalEscalationCandidateV2(
          state, content, playerId, targetId, access, ownWars, regionalWarsByTarget,
          powerSnapshot,
        ) : undefined;
      const targetWarRecords = selectWarsOfV2(state, targetId);
      const targetWars = targetWarRecords.length;
      const linkedWar = regionalEscalation
        ? state.wars.find((war) => war.id === regionalEscalation.linkedWarId) : undefined;
      const interventionAlly = linkedWar && (linkedWar.attackerId === targetId || linkedWar.defenderId === targetId)
        ? (linkedWar.attackerId === targetId ? linkedWar.defenderId : linkedWar.attackerId)
        : undefined;
      const rivalInvaderIds = [...new Set(targetWarRecords
        .map((war) => war.attackerId === targetId ? war.defenderId : war.attackerId)
        .filter((id) => id !== playerId && id !== interventionAlly
          && !ownWars.some((war) => war.attackerId === id || war.defenderId === id)))];
      const rivalPower = rivalInvaderIds.reduce((sum, id) => sum + (powerSnapshot.byNation.get(id) ?? 0), 0);
      // A country already under attack is not discounted as a free prize: a
      // new invader must be able to survive both the target and rival armies.
      const targetPower = (powerSnapshot.byNation.get(targetId) ?? 0) + rivalPower;
      const ratio = ownPower / Math.max(1, targetPower);
      const targetEconomy = selectNationalEconomyV2(state, content, targetId);
      const targetNation = content.nations[targetId]!;
      const nuclearDeterrence = nuclearRivalryPenaltyV2(
        selectNuclearPowerV2(state, content, playerId).level,
        selectNuclearPowerV2(state, content, targetId).level,
        state.tick,
        ratio,
      );
      const targetAlignment = Math.max(0, strategicAlignmentScoreV2(playerId, targetId));
      const targetMajorPower = clamp((targetNation.real.powerIndex - 45) / 55, 0, 1);
      const greatPowerAvoidance = clamp(
        (AI_MAJOR_POWER_AVOIDANCE_TICKS - state.tick) / AI_MAJOR_POWER_AVOIDANCE_TICKS,
        0,
        1,
      );
      const majorPeerWarRisk = (42 + 30 * greatPowerAvoidance)
        * majorPowerDrive * targetMajorPower;
      const regionalFit = nation.subregion === targetNation.subregion ? 1
        : nation.continent === targetNation.continent ? 0.45 : 0;
      const geopoliticalGuidance = geopoliticalTargetGuidanceV2(playerId, targetId);
      const campaignVariation = campaignStrategicVariationV2(
        state.seed, state.tick, playerId, targetId,
      );
      const expansionPriority = 8 * expansionAmbition + 10 * majorPowerDrive
        + 10 * regionalFit + (access === 'land' ? 5 : 0)
        + geopoliticalGuidance + campaignVariation;
      const cost = selectWarMobilizationCostV2(state, content, playerId, targetId);
      const costWeeks = cost / Math.max(0.01, ownEconomy.weeklyRevenue);
      // A rational AI never spends its final payroll reserve on mobilisation.
      // Coalition emergencies accept a smaller cushion; ordinary expansion must
      // retain a growing runway for every war the country is already financing.
      const federationCounteroffensive = federation && targetId === state.humanPlayerId && resistance.level > 0;
      const requiredRunway = federationCounteroffensive
        ? 2 + ownWars.length * 2
        : Math.max(3, 4 + ownWars.length * 4 - 1.5 * majorPowerDrive + (access === 'naval' ? 0.5 : 0));
      const remainingRunway = treasuryWeeks - costWeeks;
      const coalitionFactor = federationCounteroffensive ? 1 + resistance.offensiveBonus : 1;
      const effectiveRatio = ratio * coalitionFactor;
      return {
        targetId,
        access,
        ratio: effectiveRatio,
        priority: 42 * Math.log(Math.max(0.15, effectiveRatio))
          + 5 * Math.log10(1 + targetEconomy.controlledOutput)
          + 0.35 * state.players[targetId]!.warFatigue
          - 9 * ownWars.length
          + expansionPriority
          + (federationCounteroffensive ? 46 * resistance.level : 0)
          + (regionalEscalation?.priority ?? 0)
          - majorPeerWarRisk
          - nuclearDeterrence
          - 30 * rivalInvaderIds.length
          - 12 * Math.log2(1 + rivalPower / Math.max(1, ownPower))
          - 1.5 * targetWars * targetAlignment
          - 2.5 * costWeeks - 3 * Math.max(0, requiredRunway + 2 - remainingRunway)
          - (access === 'naval' ? 2 : 0),
        cost,
        remainingRunway,
        requiredRunway,
        regionalEscalation,
        targetWars,
        rivalInvaderCount: rivalInvaderIds.length,
        prospectiveFronts: 1 + rivalInvaderIds.length,
        expansionChance: 0.03 * expansionAmbition + 0.03 * majorPowerDrive + 0.02 * regionalFit
          + 0.0015 * Math.max(0, geopoliticalGuidance),
      };
    }).filter((candidate) => !ownWars.some((war) => (
      (war.attackerId === playerId && war.defenderId === candidate.targetId)
      || (war.attackerId === candidate.targetId && war.defenderId === playerId)
    ))
      && !state.truces.some((truce) => truce.expiresTick > state.tick && (
        (truce.leftId === playerId && truce.rightId === candidate.targetId)
        || (truce.leftId === candidate.targetId && truce.rightId === playerId)
      ))
      && state.wars.length < (candidate.regionalEscalation ? escalationWarCap : activeWarCap)
      && state.tick - state.aiEscalation.lastWarStartTick >= (candidate.regionalEscalation
        ? candidate.regionalEscalation.defensiveAid
          ? AI_DEFENSIVE_AID_COOLDOWN : AI_REGIONAL_ESCALATION_COOLDOWN
        : AI_GLOBAL_WAR_COOLDOWN)
      && candidate.targetWars < aiTargetWarLimitV2(
        Boolean(candidate.regionalEscalation),
        candidate.regionalEscalation?.defensiveAid === true,
      )
      // Survival crises block optional expansion. Emergency aid to a neighbour
      // already under attack remains the sole exception and immediately puts
      // the helper into the ordinary wartime budget path.
      && (!survivalBlocksExpansion || candidate.regionalEscalation?.defensiveAid === true)
      && ownWars.length + candidate.prospectiveFronts <= ownWarLimit
      && candidate.ratio >= (candidate.regionalEscalation
        ? candidate.regionalEscalation.defensiveAid
          ? (candidate.access === 'land' ? 0.10 : 0.14)
          : (candidate.access === 'land' ? 0.72 : 0.78)
        : federation && candidate.targetId === state.humanPlayerId && resistance.level > 0
        ? (candidate.access === 'land' ? 0.98 : 1.05)
        : (candidate.access === 'land' ? 1.03 : 1.10)
          + 0.30 * candidate.rivalInvaderCount
          + (state.tick < AI_MAJOR_POWER_AVOIDANCE_TICKS
            ? 0.30 * majorPowerDrive * clamp(((content.nations[candidate.targetId]?.real.powerIndex ?? 0) - 45) / 55, 0, 1)
            : 0))
      && player.treasury >= candidate.cost
      && candidate.remainingRunway >= candidate.requiredRunway)
      .sort((a, b) => b.priority - a.priority || a.targetId.localeCompare(b.targetId));
    const forecastedCandidates = candidates.slice(0, 8).map((candidate) => {
      const forecast = forecastWarV2(state, content, playerId, candidate.targetId);
      const lossTrade = forecast.projectedAttackerLosses > 0
        ? forecast.projectedDefenderLosses / forecast.projectedAttackerLosses : 3;
      return {
        ...candidate,
        forecast,
        priority: candidate.priority + (forecast.winChance - 50) * 1.15
          + 5 * Math.log(Math.max(0.25, lossTrade)),
      };
    }).filter((candidate) => {
      // Aid supports an existing defender and need not win alone. Expansion
      // still rejects desperate openings; the exact forecast mainly ranks the
      // viable targets instead of paralysing every cautious country.
      const minimumChance = candidate.regionalEscalation?.defensiveAid ? 0
        : candidate.regionalEscalation ? 20
          : 30 + ownWars.length * 6 + candidate.rivalInvaderCount * 12 + (candidate.access === 'naval' ? 1 : 0);
      return candidate.forecast.winChance >= minimumChance;
    }).sort((left, right) => right.priority - left.priority || left.targetId.localeCompare(right.targetId));
    const candidate = forecastedCandidates[0];
    if (!candidate) continue;
    const defensiveAid = candidate.regionalEscalation?.defensiveAid === true;
    if (!defensiveAid && expansionRollsUsed >= AI_EXPANSION_ROLLS_PER_DECISION) continue;
    if (!defensiveAid) expansionRollsUsed += 1;
    const federationCounteroffensive = federation && candidate.targetId === state.humanPlayerId;
    const baseChance = candidate.regionalEscalation?.defensiveAid
      ? candidate.regionalEscalation.interventionChance
      : clamp(0.30 + 0.15 * Math.max(0, candidate.ratio - 1)
      + (federationCounteroffensive ? 0.06 * resistance.level : 0)
      + candidate.expansionChance
      + (candidate.regionalEscalation ? 0.10 : 0), 0.24, candidate.regionalEscalation ? 0.76 : 0.68);
    const chance = candidate.rivalInvaderCount > 0 && !candidate.regionalEscalation
      ? Math.min(0.14, baseChance * 0.20)
      : baseChance;
    if (nextRandom(state) >= chance) continue;
    commands.push({
      type: 'declare-war',
      attackerId: playerId,
      defenderId: candidate.targetId,
      escalatedFromWarId: candidate.regionalEscalation?.linkedWarId,
    });
    warPlanned = true;
  }
  return commands;
}
