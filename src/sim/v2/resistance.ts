import {
  DEFENSIVE_FEDERATION_COOLDOWN_TICKS,
  DEFENSIVE_FEDERATION_THREAT,
  RESEARCH_BRANCHES,
  RESEARCH_BRANCH_EFFECTS,
  TRUCE_TICKS,
  clamp,
  round,
} from './balance';
import type { WorldContentV2 } from './content';
import { synchronizeArmyCapacityV2 } from './capacity';
import { addWorldEventV2 } from './events';
import {
  createPowerSnapshotV2,
  invalidateTerritoryIndexV2,
  selectCurrentPowerV2,
  selectTerritoriesOfV2,
  type PowerSnapshotV2,
} from './selectors';
import type { GlobalResistanceV2, PlayerId, WorldStateV2 } from './types';

const COALITION_FORMATION_MEMBERS = 5;
const UNITED_THREAT = 78;
const COALITION_JOIN_THRESHOLD = 72;
const COALITION_RECRUITMENT_MIN_TICK = 156;
const COALITION_RECRUITMENT_INTERVAL = 52;

interface OwnerTopologyV2 {
  signature: string;
  living: PlayerId[];
  adjacency: Map<PlayerId, Set<PlayerId>>;
}

const ownerTopologyCacheV2 = new WeakMap<WorldStateV2, OwnerTopologyV2>();

function ownerTopologyV2(state: WorldStateV2, content: WorldContentV2): OwnerTopologyV2 {
  const signature = content.territoryIds.map((id) => state.territories[id]?.owner ?? '').join('|');
  const cached = ownerTopologyCacheV2.get(state);
  if (cached?.signature === signature) return cached;
  const livingSet = new Set<PlayerId>();
  const adjacency = new Map<PlayerId, Set<PlayerId>>();
  for (const territoryId of content.territoryIds) {
    const owner = state.territories[territoryId]?.owner;
    if (!owner) continue;
    livingSet.add(owner);
    const neighbors = adjacency.get(owner) ?? new Set<PlayerId>();
    for (const edge of content.territories[territoryId]?.connections ?? []) {
      const neighbor = state.territories[edge.targetId]?.owner;
      if (neighbor && neighbor !== owner) neighbors.add(neighbor);
    }
    adjacency.set(owner, neighbors);
  }
  const result = {
    signature,
    living: [...livingSet].sort((left, right) => left.localeCompare(right)),
    adjacency,
  };
  ownerTopologyCacheV2.set(state, result);
  return result;
}

function humanTerritoryCountV2(state: WorldStateV2): number {
  return selectTerritoriesOfV2(state, state.humanPlayerId).length;
}

function sharedAffinityV2(content: WorldContentV2, candidateId: PlayerId, memberIds: ReadonlySet<PlayerId>): number {
  const candidate = content.nations[candidateId];
  if (!candidate || memberIds.size === 0) return 0;
  let best = 0;
  for (const memberId of memberIds) {
    const member = content.nations[memberId];
    if (!member) continue;
    const shared = candidate.influenceTags.filter((tag) => member.influenceTags.includes(tag));
    const blocAffinity = shared.some((tag) => tag.startsWith('bloc:')) ? 12 : 0;
    const regionalAffinity = shared.some((tag) => tag.startsWith('subregion:')) ? 4
      : shared.some((tag) => tag.startsWith('continent:')) ? 2 : 0;
    best = Math.max(best, blocAffinity + regionalAffinity);
  }
  return best;
}

function liveMilitaryRankV2(state: WorldStateV2, powers: PowerSnapshotV2, playerId: PlayerId): number {
  const ownPower = powers.byNation.get(playerId) ?? 0;
  return 1 + [...powers.byNation.entries()].filter(([id, power]) => (
    id !== playerId && power > ownPower && selectTerritoriesOfV2(state, id).length > 0
  )).length;
}

function liveRankThreatScaleV2(rank: number): number {
  return rank <= 5 ? 1.55 : rank <= 10 ? 1.35 : rank <= 25 ? 1.10 : rank <= 50 ? 0.88 : 0.72;
}

function updateThreatV2(state: WorldStateV2, content: WorldContentV2, powers: PowerSnapshotV2): void {
  const territoryCount = humanTerritoryCountV2(state);
  const territoryGain = Math.max(0, territoryCount - state.aiEscalation.lastHumanTerritoryCount);
  const initialTerritories = content.territoryIds.filter((territoryId) => (
    content.territories[territoryId]?.initialOwnerId === state.humanPlayerId
  )).length;
  const previousExpansion = Math.max(0, state.aiEscalation.lastHumanTerritoryCount - initialTerritories);
  const startingPowerIndex = content.nations[state.humanPlayerId]?.real.powerIndex ?? 50;
  const militaryRank = liveMilitaryRankV2(state, powers, state.humanPlayerId);
  const aggressorScale = clamp(
    (0.35 + 1.15 * Math.pow(startingPowerIndex / 100, 1.35) + previousExpansion * 0.08)
      * liveRankThreatScaleV2(militaryRank),
    0.35,
    2.25,
  );
  let conquestThreat = 0;
  for (let gain = 0; gain < territoryGain; gain += 1) {
    conquestThreat += 4 + Math.min(8, (previousExpansion + gain) * 2);
  }
  const power = selectCurrentPowerV2(state, content, state.humanPlayerId);
  const powerGrowth = state.aiEscalation.lastHumanPower > 0
    ? Math.max(0, power / Math.max(1, state.aiEscalation.lastHumanPower) - 1) : 0;
  const offensiveWars = state.wars.filter((war) => war.attackerId === state.humanPlayerId).length;
  let threat = state.aiEscalation.globalThreat
    + conquestThreat * aggressorScale
    + Math.min(0.60, powerGrowth * 6) * aggressorScale
    + offensiveWars * 0.05 * aggressorScale;
  if (territoryGain === 0 && offensiveWars === 0) threat -= 0.12;
  state.aiEscalation.globalThreat = round(clamp(threat, 0, 100));
  state.aiEscalation.lastHumanTerritoryCount = territoryCount;
  state.aiEscalation.lastHumanPower = power;
}

function recruitCoalitionMembersV2(
  state: WorldStateV2,
  content: WorldContentV2,
  topology: OwnerTopologyV2,
): PlayerId[] {
  // Diplomatic alignment takes years. Recruitment cannot start before year
  // three and at most one country commits per year.
  if (state.tick < COALITION_RECRUITMENT_MIN_TICK
    || state.tick % COALITION_RECRUITMENT_INTERVAL !== 0) return [];
  const living = new Set(topology.living);
  living.delete(state.humanPlayerId);
  const members = new Set(state.aiEscalation.coalitionMembers.filter((id) => living.has(id)));
  const atWarWithHuman = new Set<PlayerId>();
  for (const war of state.wars) {
    if (war.attackerId === state.humanPlayerId) atWarWithHuman.add(war.defenderId);
    if (war.defenderId === state.humanPlayerId) atWarWithHuman.add(war.attackerId);
  }
  const adjacency = topology.adjacency;
  const humanNation = content.nations[state.humanPlayerId];
  const candidate = [...living]
    .filter((candidateId) => !members.has(candidateId))
    .map((candidateId) => {
      const definition = content.nations[candidateId];
      const adjacent = adjacency.get(candidateId)?.has(state.humanPlayerId) ?? false;
      const adjacentMember = [...members].some((memberId) => adjacency.get(candidateId)?.has(memberId));
      const sameSubregion = definition?.subregion === humanNation?.subregion;
      const sameContinent = definition?.continent === humanNation?.continent;
      const score = state.aiEscalation.globalThreat
        + (adjacent ? 16 : 0)
        + (adjacentMember ? 8 : 0)
        + (sameSubregion ? 8 : sameContinent ? 2 : 0)
        + sharedAffinityV2(content, candidateId, members)
        + (atWarWithHuman.has(candidateId) ? 12 : 0);
      return { candidateId, score };
    })
    .filter((entry) => entry.score >= COALITION_JOIN_THRESHOLD)
    .sort((left, right) => right.score - left.score || left.candidateId.localeCompare(right.candidateId))[0];
  const added: PlayerId[] = [];
  if (candidate) {
    members.add(candidate.candidateId);
    added.push(candidate.candidateId);
  }
  state.aiEscalation.coalitionMembers = [...members].sort((a, b) => a.localeCompare(b));
  return added;
}

function endCoalitionInternalWarsV2(state: WorldStateV2): number {
  const members = new Set(state.aiEscalation.coalitionMembers);
  const internalWars = state.wars.filter((war) => members.has(war.attackerId) && members.has(war.defenderId));
  if (internalWars.length === 0) return 0;
  const ids = new Set(internalWars.map((war) => war.id));
  for (const war of internalWars) {
    const [leftId, rightId] = war.attackerId < war.defenderId
      ? [war.attackerId, war.defenderId] : [war.defenderId, war.attackerId];
    state.truces = state.truces.filter((truce) => !(truce.leftId === leftId && truce.rightId === rightId));
    state.truces.push({ leftId, rightId, expiresTick: state.tick + TRUCE_TICKS });
  }
  state.wars = state.wars.filter((war) => !ids.has(war.id));
  state.offers = state.offers.filter((offer) => !ids.has(offer.warId));
  return internalWars.length;
}

function federationNameV2(content: WorldContentV2, leaderId: PlayerId): string {
  const continent = content.nations[leaderId]?.continent ?? 'Regional';
  const adjective: Record<string, string> = {
    Africa: 'African', Asia: 'Asian', Europe: 'European', Oceania: 'Oceanian',
    'North America': 'North American', 'South America': 'South American',
  };
  return `${adjective[continent] ?? continent} Defense Federation`;
}

export function isDefensiveFederationV2(state: WorldStateV2, playerId: PlayerId): boolean {
  return state.players[playerId]?.empireName.endsWith('Defense Federation') ?? false;
}

export interface DefensiveFederationPolicyV2 {
  threshold: number;
  cooldown: number;
  maxParticipants: number;
  memberPowerCeiling: number;
  federationPowerCeiling: number;
  maxFederationTerritories: number;
}

/** Strong starting powers, late campaigns and repeated conquest provoke faster, larger unions. */
export function selectDefensiveFederationPolicyV2(
  state: WorldStateV2,
  content: WorldContentV2,
  powers: PowerSnapshotV2 = createPowerSnapshotV2(state, content),
): DefensiveFederationPolicyV2 {
  const humanId = state.humanPlayerId;
  const startingPower = content.nations[humanId]?.real.powerIndex ?? 50;
  const liveRank = liveMilitaryRankV2(state, powers, humanId);
  const liveMajorPower = liveRank <= 5 ? 1 : liveRank <= 10 ? 0.72 : liveRank <= 25 ? 0.35 : 0;
  const majorPower = Math.max(clamp((startingPower - 60) / 40, 0, 1), liveMajorPower);
  const lateGame = clamp((state.tick - 260) / 780, 0, 1);
  const initialTerritories = content.territoryIds.filter((id) => content.territories[id]?.initialOwnerId === humanId).length;
  const conquests = Math.max(0, humanTerritoryCountV2(state) - initialTerritories);
  const expansion = clamp((conquests - 2) / 8, 0, 1);
  return {
    threshold: round(clamp(
      DEFENSIVE_FEDERATION_THREAT - 10 * majorPower - 6 * lateGame - 5 * expansion,
      64,
      DEFENSIVE_FEDERATION_THREAT,
    )),
    cooldown: Math.round(clamp(
      DEFENSIVE_FEDERATION_COOLDOWN_TICKS - 52 * majorPower - 52 * lateGame - 52 * expansion,
      208,
      DEFENSIVE_FEDERATION_COOLDOWN_TICKS,
    )),
    maxParticipants: Math.round(clamp(
      4 + Math.floor(2 * majorPower) + Math.floor(2 * lateGame) + Math.floor(2 * expansion),
      4,
      9,
    )),
    memberPowerCeiling: clamp(0.75 + 0.10 * majorPower + 0.08 * lateGame + 0.07 * expansion, 0.75, 1.00),
    federationPowerCeiling: clamp(1.10 + 0.20 * majorPower + 0.15 * lateGame + 0.15 * expansion, 1.10, 1.60),
    maxFederationTerritories: Math.round(clamp(
      10 + 7 * majorPower + 9 * lateGame + 10 * expansion,
      10,
      36,
    )),
  };
}

function absorbFederationMemberV2(
  state: WorldStateV2,
  leaderId: PlayerId,
  memberId: PlayerId,
): void {
  const leader = state.players[leaderId]!;
  const member = state.players[memberId]!;
  for (const territory of Object.values(state.territories)) {
    if (territory.owner !== memberId) continue;
    territory.owner = leaderId;
    territory.integration = 1;
    delete territory.control;
  }
  leader.treasury = round(leader.treasury + member.treasury);
  leader.foodStock = round(leader.foodStock + member.foodStock);
  member.treasury = 0;
  member.foodStock = 0;
  member.warFatigue = 100;
  for (const branch of RESEARCH_BRANCHES) {
    leader.research.progress[branch] = round(Math.max(
      leader.research.progress[branch], member.research.progress[branch],
    ));
    leader.research.breakthroughs[branch] = Math.max(
      leader.research.breakthroughs[branch], member.research.breakthroughs[branch],
    );
    for (const effect of RESEARCH_BRANCH_EFFECTS[branch]) {
      leader.research.effectLevels[effect] = Math.max(
        leader.research.effectLevels[effect], member.research.effectLevels[effect],
      );
    }
  }
}

/**
 * A rapid nearby expansion can make two or three small coalition members
 * permanently federate. This is an actual state merger, not another alliance
 * modifier: one owner, one treasury and one army command remain afterward.
 */
function maybeFormDefensiveFederationV2(
  state: WorldStateV2,
  content: WorldContentV2,
  topology: OwnerTopologyV2,
  powers: PowerSnapshotV2,
): boolean {
  const policy = selectDefensiveFederationPolicyV2(state, content, powers);
  if (state.aiEscalation.globalThreat < policy.threshold
    || state.tick - state.aiEscalation.lastFederationTick < policy.cooldown) return false;
  const humanId = state.humanPlayerId;
  const adjacency = topology.adjacency;
  const humanPower = Math.max(1, powers.byNation.get(humanId) ?? 0);
  const living = new Set(topology.living);
  const candidates = state.aiEscalation.coalitionMembers.filter((id) => (
    living.has(id)
    && id !== humanId
    && selectTerritoriesOfV2(state, id).length <= (isDefensiveFederationV2(state, id) ? policy.maxFederationTerritories : 3)
    && !state.wars.some((war) => war.attackerId === id || war.defenderId === id)
    && (powers.byNation.get(id) ?? 0) <= humanPower
      * (isDefensiveFederationV2(state, id) ? policy.federationPowerCeiling : policy.memberPowerCeiling)
  ));
  const candidateSet = new Set(candidates);
  const anchors = candidates.filter((id) => adjacency.get(id)?.has(humanId))
    .sort((left, right) => Number(isDefensiveFederationV2(state, right)) - Number(isDefensiveFederationV2(state, left))
      || (powers.byNation.get(left) ?? 0)
      - (powers.byNation.get(right) ?? 0) || left.localeCompare(right));

  for (const anchor of anchors) {
    const cluster: PlayerId[] = [anchor];
    const queued = [anchor];
    // A federation begins as a two-country union and can absorb only one new
    // member on each later cooldown. It never appears as an instant superstate.
    while (queued.length > 0 && cluster.length < 2) {
      const current = queued.shift()!;
      const linked = [...(adjacency.get(current) ?? [])]
        .filter((id) => candidateSet.has(id) && !cluster.includes(id))
        .filter((id) => {
          const affinity = sharedAffinityV2(content, id, new Set(cluster));
          // Once a federation exists, contiguous countries from the same
          // continent may join even without an identical formal bloc tag.
          return affinity >= 4 || (cluster.some((memberId) => isDefensiveFederationV2(state, memberId)) && affinity >= 2);
        })
        .sort((left, right) => Number(isDefensiveFederationV2(state, right)) - Number(isDefensiveFederationV2(state, left))
          || (powers.byNation.get(left) ?? 0)
          - (powers.byNation.get(right) ?? 0) || left.localeCompare(right));
      for (const id of linked) {
        cluster.push(id);
        queued.push(id);
        if (cluster.length >= 2) break;
      }
    }
    if (cluster.length < 2) continue;
    const existingFederation = cluster.find((id) => isDefensiveFederationV2(state, id));
    const leaderId = existingFederation ?? [...cluster].sort((left, right) => (powers.byNation.get(right) ?? 0)
      - (powers.byNation.get(left) ?? 0) || left.localeCompare(right))[0]!;
    const growing = isDefensiveFederationV2(state, leaderId);
    const absorbed = cluster.filter((id) => id !== leaderId);
    for (const memberId of absorbed) absorbFederationMemberV2(state, leaderId, memberId);
    invalidateTerritoryIndexV2(state);
    synchronizeArmyCapacityV2(state, content);
    if (!state.players[leaderId]!.empireName) {
      state.players[leaderId]!.empireName = federationNameV2(content, leaderId);
    }
    const absorbedSet = new Set(absorbed);
    state.aiEscalation.coalitionMembers = [...new Set(state.aiEscalation.coalitionMembers
      .filter((id) => !absorbedSet.has(id)).concat(leaderId))].sort((a, b) => a.localeCompare(b));
    state.truces = state.truces.filter((truce) => !absorbedSet.has(truce.leftId) && !absorbedSet.has(truce.rightId));
    state.offers = state.offers.filter((offer) => !absorbedSet.has(offer.fromId) && !absorbedSet.has(offer.toId));
    // A bilateral treaty ends when either sovereign signatory is permanently
    // absorbed. It is never inherited as free income or ownerless debt.
    state.ceasefireObligations = state.ceasefireObligations.filter((obligation) => (
      !absorbedSet.has(obligation.payerId) && !absorbedSet.has(obligation.payeeId)
    ));
    state.aiEscalation.lastFederationTick = state.tick;
    const formerNames = (growing ? absorbed : cluster).map((id) => content.nations[id]?.shortName ?? id).join(', ');
    const federationTerritories = selectTerritoriesOfV2(state, leaderId).length;
    addWorldEventV2(state, 'critical', 'critical',
      growing
        ? `${formerNames} joined the ${state.players[leaderId]!.empireName}; the federation now spans ${federationTerritories} territories.`
        : `${formerNames} permanently merged into the ${state.players[leaderId]!.empireName} to resist rapid expansion.`,
      undefined, humanId);
    return true;
  }
  return false;
}

/**
 * AI expansion can provoke the same slow, physical state mergers as human
 * expansion. This never grants a hidden combat modifier and shares the global
 * federation cooldown, so containment remains visible and gradual.
 */
function maybeFormAiDefensiveFederationV2(
  state: WorldStateV2,
  content: WorldContentV2,
  topology: OwnerTopologyV2,
  powers: PowerSnapshotV2,
): boolean {
  if (state.tick < 520 || state.tick % 52 !== 0
    || state.tick - state.aiEscalation.lastFederationTick < DEFENSIVE_FEDERATION_COOLDOWN_TICKS) return false;
  const living = new Set(topology.living);
  const initialTerritoryCount = (playerId: PlayerId) => content.territoryIds.filter((id) => (
    content.territories[id]?.initialOwnerId === playerId
  )).length;
  const aggressor = topology.living
    .filter((id) => id !== state.humanPlayerId && !isDefensiveFederationV2(state, id))
    .map((id) => {
      const owned = selectTerritoriesOfV2(state, id).length;
      const conquests = Math.max(0, owned - initialTerritoryCount(id));
      const rank = liveMilitaryRankV2(state, powers, id);
      const offensiveWars = state.wars.filter((war) => war.attackerId === id).length;
      const majorScale = rank <= 5 ? 2.2 : rank <= 10 ? 1.7 : rank <= 25 ? 1.25 : 1;
      return { id, conquests, rank, score: conquests * majorScale + offensiveWars * 0.8 };
    })
    .filter((entry) => entry.conquests >= (entry.rank <= 5 ? 1 : 2) && entry.score >= 2.2)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))[0];
  if (!aggressor) return false;

  const aggressorPower = Math.max(1, powers.byNation.get(aggressor.id) ?? 0);
  const adjacency = topology.adjacency;
  const eligible = topology.living.filter((id) => (
    id !== state.humanPlayerId && id !== aggressor.id && living.has(id)
    && selectTerritoriesOfV2(state, id).length <= (isDefensiveFederationV2(state, id) ? 8 : 3)
    && !state.wars.some((war) => war.attackerId === id || war.defenderId === id)
    && (powers.byNation.get(id) ?? 0) <= aggressorPower * (isDefensiveFederationV2(state, id) ? 0.65 : 0.38)
  ));
  const eligibleSet = new Set(eligible);
  const anchors = eligible.filter((id) => adjacency.get(id)?.has(aggressor.id))
    .sort((left, right) => Number(isDefensiveFederationV2(state, right)) - Number(isDefensiveFederationV2(state, left))
      || (powers.byNation.get(right) ?? 0) - (powers.byNation.get(left) ?? 0)
      || left.localeCompare(right));
  for (const anchor of anchors) {
    const partner = [...(adjacency.get(anchor) ?? [])]
      .filter((id) => eligibleSet.has(id) && id !== anchor)
      .filter((id) => sharedAffinityV2(content, id, new Set([anchor])) >= 2)
      .filter((id) => (powers.byNation.get(id) ?? 0) + (powers.byNation.get(anchor) ?? 0) <= aggressorPower * 0.72)
      .sort((left, right) => (powers.byNation.get(right) ?? 0) - (powers.byNation.get(left) ?? 0)
        || left.localeCompare(right))[0];
    if (!partner) continue;
    const leaderId = isDefensiveFederationV2(state, anchor) ? anchor
      : isDefensiveFederationV2(state, partner) ? partner
        : (powers.byNation.get(anchor) ?? 0) >= (powers.byNation.get(partner) ?? 0) ? anchor : partner;
    const memberId = leaderId === anchor ? partner : anchor;
    const growing = isDefensiveFederationV2(state, leaderId);
    absorbFederationMemberV2(state, leaderId, memberId);
    invalidateTerritoryIndexV2(state);
    synchronizeArmyCapacityV2(state, content);
    if (!state.players[leaderId]!.empireName) state.players[leaderId]!.empireName = federationNameV2(content, leaderId);
    state.truces = state.truces.filter((truce) => truce.leftId !== memberId && truce.rightId !== memberId);
    state.offers = state.offers.filter((offer) => offer.fromId !== memberId && offer.toId !== memberId);
    state.ceasefireObligations = state.ceasefireObligations.filter((obligation) => (
      obligation.payerId !== memberId && obligation.payeeId !== memberId
    ));
    state.aiEscalation.lastFederationTick = state.tick;
    const aggressorName = content.nations[aggressor.id]?.shortName ?? aggressor.id;
    const memberName = content.nations[memberId]?.shortName ?? memberId;
    addWorldEventV2(state, 'critical', 'critical', growing
      ? `${memberName} joined the ${state.players[leaderId]!.empireName} as ${aggressorName}'s expansion raised regional alarm.`
      : `${content.nations[leaderId]?.shortName ?? leaderId} and ${memberName} merged into the ${state.players[leaderId]!.empireName} to contain ${aggressorName}.`);
    return true;
  }
  return false;
}

export function selectGlobalResistanceV2(state: WorldStateV2): GlobalResistanceV2 {
  const level = state.aiEscalation.resistanceLevel;
  const threat = state.aiEscalation.globalThreat;
  const memberIds = [...state.aiEscalation.coalitionMembers];
  const defenseBonus = level === 2
    ? clamp(0.14 + threat * 0.001 + memberIds.length * 0.001, 0.18, 0.28)
    : level === 1 ? clamp(0.05 + threat * 0.001 + memberIds.length * 0.003, 0.06, 0.16) : 0;
  return {
    level,
    threat,
    members: memberIds.length,
    memberIds,
    defenseBonus: round(defenseBonus),
    offensiveBonus: round(defenseBonus * 0.45),
  };
}

/** Expansion, rapid power growth and offensive wars create suspicion; blocs and proximity decide who cooperates. */
export function updateGlobalResistanceV2(
  state: WorldStateV2,
  content: WorldContentV2,
  powers: PowerSnapshotV2 = createPowerSnapshotV2(state, content),
): 0 | 1 | 2 | undefined {
  updateThreatV2(state, content, powers);
  const previousLevel = state.aiEscalation.resistanceLevel;
  const topology = ownerTopologyV2(state, content);
  const added = recruitCoalitionMembersV2(state, content, topology);
  const livingOpponents = Math.max(1, topology.living.filter((id) => id !== state.humanPlayerId).length);
  const unitedMembers = Math.max(8, Math.ceil(livingOpponents * 0.20));
  const desired: 0 | 1 | 2 = state.aiEscalation.globalThreat >= UNITED_THREAT
    && state.aiEscalation.coalitionMembers.length >= unitedMembers ? 2
    : state.aiEscalation.coalitionMembers.length >= COALITION_FORMATION_MEMBERS ? 1 : 0;
  state.aiEscalation.resistanceLevel = Math.max(previousLevel, desired) as 0 | 1 | 2;
  const endedWars = endCoalitionInternalWarsV2(state);
  const humanFederationFormed = maybeFormDefensiveFederationV2(state, content, topology, powers);
  const aiFederationFormed = !humanFederationFormed
    && maybeFormAiDefensiveFederationV2(state, content, topology, powers);
  const federationFormed = humanFederationFormed || aiFederationFormed;
  const human = content.nations[state.humanPlayerId]?.name ?? state.humanPlayerId;

  if (state.aiEscalation.resistanceLevel > previousLevel) {
    const message = state.aiEscalation.resistanceLevel === 2
      ? `The anti-${human} network has accelerated permanent federation plans.`
      : `${state.aiEscalation.coalitionMembers.length} threatened countries formed a containment coalition against ${human}.`;
    addWorldEventV2(state, 'critical', 'critical', message, undefined, state.humanPlayerId);
    return state.aiEscalation.resistanceLevel;
  }
  if (added.length > 0 && previousLevel > 0) {
    const names = added.slice(0, 3).map((id) => content.nations[id]?.shortName ?? id).join(', ');
    addWorldEventV2(state, 'system', 'action', `${names}${added.length > 3 ? ` and ${added.length - 3} more` : ''} joined the containment coalition${endedWars ? `; ${endedWars} internal war${endedWars === 1 ? '' : 's'} ended` : ''}.`);
  }
  return federationFormed ? Math.max(1, state.aiEscalation.resistanceLevel) as 1 | 2 : undefined;
}

export function resistanceCombatMultiplierV2(
  state: WorldStateV2,
  attackerId: PlayerId,
  defenderId: PlayerId,
): { attacker: number; defender: number } {
  const resistance = selectGlobalResistanceV2(state);
  if (resistance.level === 0) return { attacker: 1, defender: 1 };
  const members = new Set(resistance.memberIds);
  return {
    // Loose members share defensive intelligence but never gain a magical
    // combined attack. Only a permanently merged federation can project its
    // consolidated command bonus against the player.
    attacker: members.has(attackerId) && isDefensiveFederationV2(state, attackerId)
      && defenderId === state.humanPlayerId
      ? 1 + resistance.offensiveBonus : 1,
    defender: members.has(defenderId) && attackerId === state.humanPlayerId
      ? 1 + resistance.defenseBonus : 1,
  };
}
