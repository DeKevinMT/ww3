import {
  DEFENSIVE_FEDERATION_COOLDOWN_TICKS,
  DEFENSIVE_FEDERATION_THREAT,
  TRUCE_TICKS,
  clamp,
  round,
} from './balance';
import type { WorldContentV2 } from './content';
import { synchronizeArmyCapacityV2 } from './capacity';
import { addWorldEventV2 } from './events';
import { selectHumanPlayerIdsV2 } from './humanPlayers';
import {
  beginFederationTerritoryIntegrationV2,
  retireAbsorbedNationV2,
} from './integration';
import {
  createPowerSnapshotV2,
  invalidateTerritoryIndexV2,
  selectNationalAggressivenessV2,
  selectTerritoriesOfV2,
  type PowerSnapshotV2,
} from './selectors';
import type { GlobalResistanceV2, PlayerId, TerritoryId, WorldStateV2 } from './types';

const COALITION_FORMATION_MEMBERS = 5;
const UNITED_THREAT = 78;
const COALITION_JOIN_THRESHOLD = 72;
const COALITION_RECRUITMENT_MIN_TICK = 156;
const COALITION_RECRUITMENT_INTERVAL = 52;
const FEDERATION_FORMATION_INTERVAL = 104;
const AI_FEDERATION_FORMATION_MIN_TICK = 832;
export const SUSPICION_OFFENSIVE_WAR_CLUSTER_WINDOW_TICKS_V2 = 26;
/** A peaceful reputation heals by roughly 1.3 Suspicion points per year. */
export const SUSPICION_PEACEFUL_DECAY_PER_WEEK_V2 = 0.025;
/** Modest shared acceleration for every positive source of political Suspicion. */
export const POLITICAL_SUSPICION_GAIN_MULTIPLIER_V2 = 1.15;

export function scalePoliticalSuspicionGainV2(rawGain: number): number {
  if (!Number.isFinite(rawGain) || rawGain <= 0) return 0;
  return round(rawGain * POLITICAL_SUSPICION_GAIN_MULTIPLIER_V2, 9);
}

export interface HumanOffensiveWarSuspicionPressureV2 {
  activeWars: number;
  weeklyGain: number;
  declarationSpike: number;
}

/**
 * One controlled offensive adds only a modest weekly signal. Extra simultaneous
 * wars compound nonlinearly, while a second or third declaration inside six
 * months creates a one-time diplomatic shock. `startedTick` is sufficient, so
 * this remains save-stable without another persisted cooldown or ledger.
 */
export function humanOffensiveWarSuspicionPressureV2(
  state: WorldStateV2,
  playerId: PlayerId = state.humanPlayerId,
): HumanOffensiveWarSuspicionPressureV2 {
  const offensiveWars = state.wars
    .filter((war) => war.attackerId === playerId)
    .sort((left, right) => left.startedTick - right.startedTick
      || left.id.localeCompare(right.id));
  const activeWars = offensiveWars.length;
  const weeklyGain = activeWars <= 0 ? 0 : round(
    0.04 * activeWars + 0.16 * Math.pow(Math.max(0, activeWars - 1), 1.55),
    9,
  );
  let declarationSpike = 0;
  for (let index = 0; index < offensiveWars.length; index += 1) {
    const war = offensiveWars[index]!;
    const age = state.tick - war.startedTick;
    // Declarations are applied before the canonical weekly tick increments;
    // age one is therefore their single post-start resistance update.
    if (age !== 1) continue;
    const clusteredEarlierWars = offensiveWars.slice(0, index).filter((earlier) => (
      war.startedTick - earlier.startedTick
        <= SUSPICION_OFFENSIVE_WAR_CLUSTER_WINDOW_TICKS_V2
    )).length;
    if (clusteredEarlierWars > 0) {
      declarationSpike += Math.pow(clusteredEarlierWars, 1.35);
    }
  }
  return {
    activeWars,
    weeklyGain,
    declarationSpike: round(declarationSpike, 9),
  };
}

export function coalitionWillingnessV2(aggressivenessPercent: number): number {
  return round((1 - clamp(aggressivenessPercent / 100, 0, 1)) ** 1.8);
}

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
  // The caller already built this exact post-war snapshot. Reusing it avoids
  // rebuilding every nation's military and power view a second time each week.
  const power = powers.byNation.get(state.humanPlayerId) ?? 0;
  const powerGrowth = state.aiEscalation.lastHumanPower > 0
    ? Math.max(0, power / Math.max(1, state.aiEscalation.lastHumanPower) - 1) : 0;
  const offensivePressure = humanOffensiveWarSuspicionPressureV2(
    state,
    state.humanPlayerId,
  );
  const positiveSuspicionGain = scalePoliticalSuspicionGainV2(
    conquestThreat * aggressorScale
      + Math.min(0.60, powerGrowth * 6) * aggressorScale
      + (offensivePressure.weeklyGain + offensivePressure.declarationSpike)
        * aggressorScale,
  );
  let threat = state.aiEscalation.globalThreat + positiveSuspicionGain;
  if (territoryGain === 0 && offensivePressure.activeWars === 0) {
    threat -= SUSPICION_PEACEFUL_DECAY_PER_WEEK_V2;
  }
  state.aiEscalation.globalThreat = round(clamp(threat, 0, 100));
  state.aiEscalation.lastHumanTerritoryCount = territoryCount;
  state.aiEscalation.lastHumanPower = power;
}

function recruitCoalitionMembersV2(
  state: WorldStateV2,
  content: WorldContentV2,
  topology: OwnerTopologyV2,
  powers: PowerSnapshotV2,
): PlayerId[] {
  const humanPlayerIds = new Set(selectHumanPlayerIdsV2(state));
  const living = new Set(topology.living);
  for (const playerId of humanPlayerIds) living.delete(playerId);
  const members = new Set(state.aiEscalation.coalitionMembers.filter((id) => living.has(id)));
  // Old or externally assembled state can still contain a newly claimed
  // human country. Remove it immediately, even between annual recruitment
  // windows, before any federation path consumes coalition membership.
  state.aiEscalation.coalitionMembers = [...members].sort((a, b) => a.localeCompare(b));
  // Diplomatic alignment takes years. Recruitment cannot start before year
  // three and at most one country commits per year.
  if (state.tick < COALITION_RECRUITMENT_MIN_TICK
    || state.tick % COALITION_RECRUITMENT_INTERVAL !== 0) return [];
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
      const aggressiveness = selectNationalAggressivenessV2(
        state, content, candidateId, powers,
      );
      const willingness = coalitionWillingnessV2(aggressiveness);
      const situationalPressure = (adjacent ? 16 : 0)
        + (adjacentMember ? 8 : 0)
        + (sameSubregion ? 8 : sameContinent ? 2 : 0)
        + sharedAffinityV2(content, candidateId, members)
        + (atWarWithHuman.has(candidateId) ? 12 : 0);
      // Defensive cooperation is a low-aggression strategy. Even overwhelming
      // global pressure rarely persuades a highly aggressive country, while a
      // cautious neighbour can cross the threshold materially earlier.
      const score = state.aiEscalation.globalThreat * (0.55 + 0.45 * willingness)
        + situationalPressure * (0.35 + 0.65 * willingness)
        + 18 * willingness - 25 * (aggressiveness / 100);
      return { candidateId, score, aggressiveness };
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

/**
 * Founding countries permanently determine a federation's visible name.
 * The suffix deliberately stays compatible with existing save detection.
 */
export function defensiveFederationNameV2(
  content: WorldContentV2,
  founderIds: readonly PlayerId[],
): string {
  const founders = [...new Set(founderIds)].sort((left, right) => left.localeCompare(right));
  const signature = founders.join('|') || 'regional';
  let hash = 2_166_136_261;
  for (let index = 0; index < signature.length; index += 1) {
    hash = Math.imul(hash ^ signature.charCodeAt(index), 16_777_619) >>> 0;
  }
  // The canonical empire-name limit is 36 characters. ISO3 founder tokens
  // keep every pair visibly unique while leaving room for a varied identity
  // and the compatibility-sensitive `Defense Federation` suffix.
  const identities = ['Shield', 'Sovereign', 'Mutual', 'Frontier', 'Guardian', 'Concord'] as const;
  const identity = identities[hash % identities.length]!;
  const founderNames = founders.slice(0, 2)
    .map((id) => (content.nations[id]?.iso3 ?? String(id)).toUpperCase().slice(0, 3))
    .join('–');
  return `${founderNames || 'REG'} ${identity} Defense Federation`;
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
      DEFENSIVE_FEDERATION_THREAT - 6 * majorPower - 3 * lateGame - 3 * expansion,
      75,
      DEFENSIVE_FEDERATION_THREAT,
    )),
    cooldown: Math.round(clamp(
      DEFENSIVE_FEDERATION_COOLDOWN_TICKS - 52 * majorPower - 26 * lateGame - 26 * expansion,
      312,
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

export function absorbFederationMemberV2(
  state: WorldStateV2,
  content: WorldContentV2,
  leaderId: PlayerId,
  memberId: PlayerId,
): void {
  // Ownership changes when the voluntary union starts, but every local army,
  // resident, economic value and condition remains untouched. National cash,
  // food, reserves and knowledge stay on the member record until its final
  // core finishes the accelerated integration and are then transferred by the
  // same exactly-once retirement path as conquest.
  const joiningTerritories = Object.entries(state.territories)
    .filter(([, territory]) => territory.owner === memberId)
    .map(([territoryId]) => territoryId as TerritoryId)
    .sort((left, right) => left.localeCompare(right));
  for (const territoryId of joiningTerritories) {
    beginFederationTerritoryIntegrationV2(
      state,
      content,
      territoryId,
      leaderId,
    );
  }
  // Usually the unfinished peaceful programs keep the member identity alive.
  // An exiled member can instead return only the leader's own cores, which
  // complete immediately; retire that now-empty record without waiting for a
  // save/load normalization pass.
  retireAbsorbedNationV2(state, content, memberId, leaderId);
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
    || state.tick % FEDERATION_FORMATION_INTERVAL !== 0
    || state.tick - state.aiEscalation.lastFederationTick < policy.cooldown) return false;
  const humanId = state.humanPlayerId;
  const adjacency = topology.adjacency;
  const humanPower = Math.max(1, powers.byNation.get(humanId) ?? 0);
  const living = new Set(topology.living);
  const humanPlayerIds = new Set(selectHumanPlayerIdsV2(state));
  const candidates = state.aiEscalation.coalitionMembers.filter((id) => (
    living.has(id)
    && !humanPlayerIds.has(id)
    && selectTerritoriesOfV2(state, id).length <= (isDefensiveFederationV2(state, id) ? policy.maxFederationTerritories : 3)
    && !state.wars.some((war) => war.attackerId === id || war.defenderId === id)
    && (isDefensiveFederationV2(state, id)
      || selectNationalAggressivenessV2(state, content, id, powers) < 75)
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
    for (const memberId of absorbed) absorbFederationMemberV2(state, content, leaderId, memberId);
    invalidateTerritoryIndexV2(state);
    synchronizeArmyCapacityV2(state, content);
    if (!growing) state.players[leaderId]!.empireName = defensiveFederationNameV2(content, cluster);
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
        ? `${formerNames} began accelerated integration into the ${state.players[leaderId]!.empireName}; the federation now spans ${federationTerritories} territories.`
        : `${formerNames} began accelerated integration into the ${state.players[leaderId]!.empireName} to resist rapid expansion.`,
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
  if (state.tick < AI_FEDERATION_FORMATION_MIN_TICK || state.tick % FEDERATION_FORMATION_INTERVAL !== 0
    || state.tick - state.aiEscalation.lastFederationTick < DEFENSIVE_FEDERATION_COOLDOWN_TICKS) return false;
  const living = new Set(topology.living);
  const humanPlayerIds = new Set(selectHumanPlayerIdsV2(state));
  const initialTerritoryCount = (playerId: PlayerId) => content.territoryIds.filter((id) => (
    content.territories[id]?.initialOwnerId === playerId
  )).length;
  const aggressor = topology.living
    .filter((id) => !humanPlayerIds.has(id) && !isDefensiveFederationV2(state, id))
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
    !humanPlayerIds.has(id) && id !== aggressor.id && living.has(id)
    && selectTerritoriesOfV2(state, id).length <= (isDefensiveFederationV2(state, id) ? 8 : 3)
    && !state.wars.some((war) => war.attackerId === id || war.defenderId === id)
    && (isDefensiveFederationV2(state, id)
      || selectNationalAggressivenessV2(state, content, id, powers) < 75)
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
    absorbFederationMemberV2(state, content, leaderId, memberId);
    invalidateTerritoryIndexV2(state);
    synchronizeArmyCapacityV2(state, content);
    if (!growing) state.players[leaderId]!.empireName = defensiveFederationNameV2(content, [leaderId, memberId]);
    state.truces = state.truces.filter((truce) => truce.leftId !== memberId && truce.rightId !== memberId);
    state.offers = state.offers.filter((offer) => offer.fromId !== memberId && offer.toId !== memberId);
    state.ceasefireObligations = state.ceasefireObligations.filter((obligation) => (
      obligation.payerId !== memberId && obligation.payeeId !== memberId
    ));
    state.aiEscalation.lastFederationTick = state.tick;
    const aggressorName = content.nations[aggressor.id]?.shortName ?? aggressor.id;
    const memberName = content.nations[memberId]?.shortName ?? memberId;
    addWorldEventV2(state, 'critical', 'critical', growing
      ? `${memberName} began accelerated integration into the ${state.players[leaderId]!.empireName} as ${aggressorName}'s expansion raised regional alarm.`
      : `${content.nations[leaderId]?.shortName ?? leaderId} and ${memberName} began accelerated federation integration to contain ${aggressorName}.`);
    return true;
  }
  return false;
}

export function selectGlobalResistanceV2(state: WorldStateV2): GlobalResistanceV2 {
  const level = state.aiEscalation.resistanceLevel;
  const threat = state.aiEscalation.globalThreat;
  const humanPlayerIds = new Set(selectHumanPlayerIdsV2(state));
  const memberIds = state.aiEscalation.coalitionMembers
    .filter((playerId) => !humanPlayerIds.has(playerId));
  return {
    level,
    threat,
    members: memberIds.length,
    memberIds,
    // Compatibility fields stay explicit, but containment grants no hidden
    // selected-opponent combat multiplier. Federations fight with their real
    // merged armies, economy, research and IQ-scaled common AI only.
    defenseBonus: 0,
    offensiveBonus: 0,
  };
}

/** Expansion, rapid power growth and offensive wars create suspicion; blocs and proximity decide who cooperates. */
export function updateGlobalResistanceV2(
  state: WorldStateV2,
  content: WorldContentV2,
  powers: PowerSnapshotV2 = createPowerSnapshotV2(state, content),
): 0 | 1 | 2 | undefined {
  updateThreatV2(state, content, powers);
  if (state.polarEndgame.phase === 'contact'
    || state.polarEndgame.phase === 'counteroffensive'
    || state.polarEndgame.phase === 'core-exposed'
    || state.polarEndgame.phase === 'victory') {
    state.aiEscalation.coalitionMembers = [];
    state.aiEscalation.resistanceLevel = 0;
    return undefined;
  }
  const previousLevel = state.aiEscalation.resistanceLevel;
  const topology = ownerTopologyV2(state, content);
  const added = recruitCoalitionMembersV2(state, content, topology, powers);
  const humanPlayerIds = new Set(selectHumanPlayerIdsV2(state));
  const livingOpponents = Math.max(1, topology.living.filter((id) => !humanPlayerIds.has(id)).length);
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
  _state: WorldStateV2,
  _attackerId: PlayerId,
  _defenderId: PlayerId,
): { attacker: number; defender: number } {
  return { attacker: 1, defender: 1 };
}
