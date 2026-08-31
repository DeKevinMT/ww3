import { clamp, smoothstep } from './balance';
import {
  campaignHumanWarStoryReadyV2,
  campaignWarsUnlockedV2,
} from './campaignPrologue';
import type { WorldContentV2 } from './content';
import { selectHumanPlayerIdsV2 } from './humanPlayers';
import {
  createPowerSnapshotV2,
  selectIsEliminatedV2,
  selectTerritoriesOfV2,
  selectWarAccessTypeV2,
  selectWarRouteDistanceKmV2,
  type PowerSnapshotV2,
} from './selectors';
import type { PlayerId, WarAccessV2, WorldStateV2 } from './types';
import {
  EXPANSION_THREAT_CONQUEST_WINDOW_WEEKS_V2,
  selectExpansionThreatSummaryV2,
} from './expansionThreat';

export type LocalHostileThreatLevelV2 = 'calm' | 'watching' | 'likely' | 'imminent';

export interface LocalHostileThreatCandidateV2 {
  attackerId: PlayerId;
  score: number;
  level: LocalHostileThreatLevelV2;
  access: Exclude<WarAccessV2, 'none'>;
  distanceKm: number;
  powerRatio: number;
  reasons: readonly string[];
}

export interface LocalHostileThreatSummaryV2 {
  targetId: PlayerId;
  score: number;
  level: LocalHostileThreatLevelV2;
  label: string;
  topAttackerId: PlayerId | null;
  reasons: readonly string[];
  candidates: readonly LocalHostileThreatCandidateV2[];
}

function threatLevelV2(score: number): LocalHostileThreatLevelV2 {
  return score >= 76 ? 'imminent' : score >= 48 ? 'likely' : score >= 18 ? 'watching' : 'calm';
}

function threatLabelV2(level: LocalHostileThreatLevelV2): string {
  return level === 'imminent' ? 'IMMINENT LOCAL THREAT'
    : level === 'likely' ? 'LOCAL ATTACK LIKELY'
      : level === 'watching' ? 'BORDER WATCH'
        : 'LOCAL THREAT CALM';
}

function activeWarBetweenV2(state: WorldStateV2, leftId: PlayerId, rightId: PlayerId): boolean {
  return state.wars.some((war) => (
    (war.attackerId === leftId && war.defenderId === rightId)
      || (war.attackerId === rightId && war.defenderId === leftId)
  ));
}

function activeTruceBetweenV2(state: WorldStateV2, leftId: PlayerId, rightId: PlayerId): boolean {
  return state.truces.some((truce) => truce.expiresTick > state.tick && (
    (truce.leftId === leftId && truce.rightId === rightId)
      || (truce.leftId === rightId && truce.rightId === leftId)
  ));
}

function recentExpansionAtBorderV2(
  state: WorldStateV2,
  content: WorldContentV2,
  expandingId: PlayerId,
  neighbourId: PlayerId,
): boolean {
  return selectTerritoriesOfV2(state, expandingId).some((territory) => {
    const program = territory.integrationProgram;
    if (!program || program.toOwnerId !== expandingId || program.cause !== 'conquest'
      || state.tick - program.startedTick > EXPANSION_THREAT_CONQUEST_WINDOW_WEEKS_V2) return false;
    return (content.territories[territory.id]?.connections ?? []).some((connection) => (
      connection.kind === 'land'
        && state.territories[connection.targetId]?.owner === neighbourId
    ));
  });
}

function boxedStagnationWeeksV2(
  state: WorldStateV2,
  content: WorldContentV2,
  targetId: PlayerId,
  powers: PowerSnapshotV2,
): number {
  const humanIds = new Set(selectHumanPlayerIdsV2(state));
  if (!humanIds.has(targetId) || !campaignWarsUnlockedV2(state, content)
    || !campaignHumanWarStoryReadyV2(state, content, targetId)) return 0;
  const ownPower = Math.max(1, powers.byNation.get(targetId) ?? 0);
  const hasPlausibleExit = content.nationIds.some((candidateId) => {
    if (candidateId === targetId || selectIsEliminatedV2(state, candidateId)) return false;
    if (content.nations[candidateId]?.kind === 'rogue-ai') return false;
    const access = selectWarAccessTypeV2(state, content, targetId, candidateId);
    if (access === 'none') return false;
    const distanceKm = access === 'land'
      ? 0 : selectWarRouteDistanceKmV2(state, content, targetId, candidateId) ?? 20_000;
    const routeFeasible = access === 'land' || distanceKm <= 3_500;
    const opponentPower = Math.max(1, powers.byNation.get(candidateId) ?? 0);
    return routeFeasible && ownPower / opponentPower >= 0.78;
  });
  if (hasPlausibleExit) return 0;
  const blackoutTick = state.polarEndgame.communicationsBlackoutTick ?? state.tick;
  const lastConquestTick = Object.values(state.territories).reduce((latest, territory) => {
    const program = territory.integrationProgram;
    return territory.owner === targetId && program?.cause === 'conquest'
      ? Math.max(latest, program.startedTick) : latest;
  }, blackoutTick);
  return Math.max(0, state.tick - Math.max(blackoutTick, lastConquestTick));
}

/**
 * One opponent-to-target threat signal. It is deliberately local: direct land
 * contact dominates, short authored sea lanes remain possible, while a long
 * ocean route cannot become routine pressure merely because an empire is big.
 */
export function selectOpponentLocalHostileThreatV2(
  state: WorldStateV2,
  content: WorldContentV2,
  attackerId: PlayerId,
  targetId: PlayerId,
  powers: PowerSnapshotV2 = createPowerSnapshotV2(state, content),
  boxedWeeksOverride?: number,
): LocalHostileThreatCandidateV2 | undefined {
  if (attackerId === targetId || selectIsEliminatedV2(state, attackerId)
    || selectIsEliminatedV2(state, targetId)
    || content.nations[attackerId]?.kind === 'rogue-ai'
    || selectHumanPlayerIdsV2(state).includes(attackerId)) return undefined;
  if (!campaignWarsUnlockedV2(state, content)
    || !campaignHumanWarStoryReadyV2(state, content, targetId)) return undefined;
  const access = selectWarAccessTypeV2(state, content, attackerId, targetId);
  if (access === 'none') return undefined;
  const distanceKm = access === 'land'
    ? 0 : Math.max(0, selectWarRouteDistanceKmV2(state, content, attackerId, targetId) ?? 20_000);
  const alreadyAtWar = activeWarBetweenV2(state, attackerId, targetId);
  if (!alreadyAtWar && activeTruceBetweenV2(state, attackerId, targetId)) return undefined;

  const attackerPower = Math.max(0, powers.byNation.get(attackerId) ?? 0);
  const targetPower = Math.max(1, powers.byNation.get(targetId) ?? 0);
  const powerRatio = attackerPower / targetPower;
  if (alreadyAtWar) return {
    attackerId,
    score: 100,
    level: 'imminent',
    access,
    distanceKm,
    powerRatio,
    reasons: ['Active local war', access === 'land' ? 'Shared land front' : 'Prepared naval front'],
  };

  const attackerNation = content.nations[attackerId];
  const targetNation = content.nations[targetId];
  const sameSubregion = attackerNation?.subregion === targetNation?.subregion;
  const sameContinent = attackerNation?.continent === targetNation?.continent;
  const navalReach = access === 'naval'
    ? clamp(Math.exp(-distanceKm / 2_800), 0.035, 0.72) : 1;
  const routeBase = access === 'land' ? 30
    : 3 + 12 * navalReach + (sameSubregion ? 7 : sameContinent ? 3 : 0);
  const feasibility = 27 * smoothstep(0.30, 1.30, powerRatio);
  const expansion = selectExpansionThreatSummaryV2(state, content, targetId);
  const expansionPressure = navalReach * 0.16 * expansion.score;
  const atBorder = recentExpansionAtBorderV2(state, content, targetId, attackerId);
  const borderExpansionPressure = access === 'land' && atBorder ? 17 : 0;
  const boxedWeeks = boxedWeeksOverride
    ?? boxedStagnationWeeksV2(state, content, targetId, powers);
  const boxedPressure = access === 'land' ? 19 * smoothstep(52, 104, boxedWeeks) : 0;
  const score = Math.round(clamp(
    routeBase + navalReach * feasibility + expansionPressure
      + borderExpansionPressure + boxedPressure,
    0,
    100,
  ));
  const level = threatLevelV2(score);
  const reasons: string[] = [];
  if (access === 'land') reasons.push('Shared land border');
  else if (distanceKm <= 2_500) reasons.push(`Short naval route · ${Math.round(distanceKm)} km`);
  else reasons.push(`Long naval route limits pressure · ${Math.round(distanceKm)} km`);
  if (powerRatio >= 1.1) reasons.push(`Attacker power ${powerRatio.toFixed(1)}× yours`);
  else if (powerRatio < 0.65) reasons.push('Attacker currently lacks decisive power');
  if (atBorder) reasons.push('Your recent expansion reached this border');
  else if (expansionPressure >= 6) reasons.push('Your regional expansion raised hostility');
  if (boxedPressure > 0) reasons.push(`No viable local exit for ${Math.round(boxedWeeks)} days`);
  return {
    attackerId,
    score,
    level,
    access,
    distanceKm,
    powerRatio,
    reasons: reasons.slice(0, 3),
  };
}

/** Canonical HUD/AI summary for the strongest plausible local attacker. */
export function selectLocalHostileThreatV2(
  state: WorldStateV2,
  content: WorldContentV2,
  targetId: PlayerId,
  powers: PowerSnapshotV2 = createPowerSnapshotV2(state, content),
): LocalHostileThreatSummaryV2 {
  const boxedWeeks = boxedStagnationWeeksV2(state, content, targetId, powers);
  const candidates = content.nationIds.flatMap((attackerId) => {
    const candidate = selectOpponentLocalHostileThreatV2(
      state, content, attackerId, targetId, powers, boxedWeeks,
    );
    return candidate ? [candidate] : [];
  }).sort((left, right) => right.score - left.score
    || Number(left.access === 'naval') - Number(right.access === 'naval')
    || left.distanceKm - right.distanceKm
    || left.attackerId.localeCompare(right.attackerId));
  const top = candidates[0];
  const score = top?.score ?? 0;
  const level = threatLevelV2(score);
  return {
    targetId,
    score,
    level,
    label: threatLabelV2(level),
    topAttackerId: top?.attackerId ?? null,
    reasons: top?.reasons ?? (campaignWarsUnlockedV2(state, content)
      ? ['No plausible local attacker']
      : ['Military intelligence remains locked']),
    candidates,
  };
}
