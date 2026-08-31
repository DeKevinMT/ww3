import { clamp, round } from './balance';
import {
  ANTARCTIC_TERRITORY_IDS_V2,
  ROGUE_AI_NATION_ID_V2,
  isRogueAiNationV2,
  type WorldContentV2,
} from './content';
import { addWorldEventV2 } from './events';
import {
  ANTARCTIC_GATEWAY_IDS_V2,
  CAMPAIGN_FIRST_GATEWAY_BREACH_TICKS_V2,
  LATER_GATEWAY_BREACH_TICKS_V2,
  antarcticGatewayTerritoryIdV2,
  initializeAntarcticGatewayBreachesV2,
  isWorldConnectionOpenV2,
  processAntarcticGatewayBreachesV2,
  scheduleAntarcticGatewayBreachV2,
  isAntarcticGatewayOpenV2,
} from './antarcticGateways';
import {
  addRogueWaveManpowerV2,
  rogueWaveManpowerAtV2,
  transferRogueWaveManpowerV2,
} from './survivalProvenance';
import { isSurvivalDawnlineNationV2 } from './survivalOrdinaryAi';
import { activateRoguePrimeV2 } from './roguePrime';
import type {
  PlayerId,
  ResearchEffectV2,
  TerritoryId,
  WarStateV2,
  WorldStateV2,
} from './types';
import { territoryIdV2 } from './types';

/** One authored Rogue mobilisation every simulation year, in every mode. */
export const ROGUE_ANNUAL_WAVE_INTERVAL_TICKS_V2 = 52;
/** Survival manufactures this extra share from wave one; Campaign retains its transfer ramp. */
export const ROGUE_ANNUAL_WAVE_ACTIVE_ARMY_SHARE_V2 = 0.05;
/** Campaign compatibility step; Survival ignores the wave-number ramp. */
export const ROGUE_ANNUAL_WAVE_ACTIVE_ARMY_SHARE_STEP_V2 = 0.01;
/** Hard readability/performance ceiling after the first world foothold. */
export const SURVIVAL_MAX_CONCURRENT_ROGUE_FRONTS_V2 = 3;
export const ROGUE_AI_CORE_TERRITORY_ID_V2 = territoryIdV2('zero-point-core');
export const SURVIVAL_WAR_PRESSURE_BASELINE_V2 = 4;
export const SURVIVAL_WAR_PRESSURE_CAP_V2 = 45;
export const SURVIVAL_QUIET_PRESSURE_RELIEF_V2 = 0.03;
export const SURVIVAL_WAVE_PRESSURE_RELIEF_V2 = 1.50;
export const SURVIVAL_RECAPTURE_PRESSURE_RELIEF_V2 = 2;
/** Weakened Survival states capitulate once a real Antarctic column has
 * destroyed most of the force they actually started the timeline with. */
/** Real machine columns apply steady pressure once they physically reach a front. */
export const SURVIVAL_ROGUE_ASSAULT_MULTIPLIER_V2 = 1.5;
export const SURVIVAL_ROGUE_FRONT_PROTECTION_MULTIPLIER_V2 = 1.25;
/** A concentrated gateway breach force, deliberately not a global machine buff. */
export const SURVIVAL_ROGUE_GATEWAY_BREAKOUT_ASSAULT_MULTIPLIER_V2 = 3.5;
export const SURVIVAL_ROGUE_GATEWAY_BREAKOUT_PROTECTION_MULTIPLIER_V2 = 1.75;

const ROGUE_AI_MINIMUM_RESEARCH_V2: Readonly<Partial<Record<ResearchEffectV2, number>>> = Object.freeze({
  attack: 5,
  defense: 7,
  'casualty-reduction': 5,
  recovery: 8,
  supply: 10,
  'force-capacity': 9,
  'research-speed': 8,
  'research-efficiency': 8,
  'economy-growth': 5,
  'tax-efficiency': 6,
  'operating-efficiency': 10,
  training: 10,
});

export interface SurvivalWaveResultV2 {
  readonly activated: boolean;
  readonly waveStarted: number | null;
  readonly targets: readonly PlayerId[];
  readonly victory: boolean;
}

/** Save-stable scenario identity; no UI or commander-profile state is needed. */
export function isSurvivalStateV2(
  state: Pick<WorldStateV2, 'contentVersion'>,
): boolean {
  return state.contentVersion.startsWith('survival-v');
}

/** The machine conflict is one continuous Survival war, not a peace campaign. */
export function isPermanentRogueWarV2(
  state: Pick<WorldStateV2, 'contentVersion'>,
  war: Pick<WarStateV2, 'attackerId' | 'defenderId'>,
): boolean {
  return isSurvivalStateV2(state)
    && (war.attackerId === ROGUE_AI_NATION_ID_V2
      || war.defenderId === ROGUE_AI_NATION_ID_V2);
}

/**
 * Survival pressure is earned by actual field losses and undersupply. The
 * tiny pulse prevents completely free fighting, while the hard cap keeps an
 * endless mode playable instead of converging on Campaign's exhaustion wall.
 */
export function survivalBattlePressureGainV2(
  casualtyShare: number,
  supplyAvailability: number,
): number {
  const losses = clamp(Number.isFinite(casualtyShare) ? casualtyShare : 0, 0, 0.25);
  const shortage = clamp(1 - (Number.isFinite(supplyAvailability) ? supplyAvailability : 0), 0, 0.75);
  return round(clamp(
    0.012 + 2.40 * losses + 0.16 * Math.pow(shortage, 1.25),
    0,
    0.75,
  ));
}

export function adjustSurvivalWarPressureV2(
  state: WorldStateV2,
  playerId: PlayerId,
  delta: number,
): void {
  const player = state.players[playerId];
  if (!player || !isSurvivalStateV2(state) || !Number.isFinite(delta)) return;
  player.warFatigue = round(clamp(
    player.warFatigue + delta,
    SURVIVAL_WAR_PRESSURE_BASELINE_V2,
    SURVIVAL_WAR_PRESSURE_CAP_V2,
  ));
}

function activeRogueWarOpponentsV2(state: WorldStateV2): PlayerId[] {
  const opponents = new Set<PlayerId>();
  for (const war of state.wars) {
    if (!isPermanentRogueWarV2(state, war)) continue;
    const opponentId = war.attackerId === ROGUE_AI_NATION_ID_V2
      ? war.defenderId : war.attackerId;
    if (state.players[opponentId]) opponents.add(opponentId);
  }
  return [...opponents].sort((left, right) => left.localeCompare(right));
}

function normalizeSurvivalWarPressureV2(state: WorldStateV2): void {
  const currentBattleByParticipant = new Map<PlayerId, boolean>();
  for (const war of state.wars) {
    if (!isPermanentRogueWarV2(state, war)) continue;
    for (const participantId of [war.attackerId, war.defenderId]) {
      currentBattleByParticipant.set(
        participantId,
        (currentBattleByParticipant.get(participantId) ?? false) || war.lastBattleTick >= state.tick,
      );
    }
  }
  for (const [participantId, foughtThisTick] of currentBattleByParticipant) {
    adjustSurvivalWarPressureV2(
      state,
      participantId,
      foughtThisTick ? 0 : -SURVIVAL_QUIET_PRESSURE_RELIEF_V2,
    );
  }
}

function rogueOwnedTerritoryIdsV2(state: WorldStateV2): TerritoryId[] {
  return (Object.entries(state.territories) as Array<[TerritoryId, WorldStateV2['territories'][TerritoryId]]>)
    .filter(([, territory]) => territory.owner === ROGUE_AI_NATION_ID_V2)
    .map(([territoryId]) => territoryId)
    .sort((left, right) => left.localeCompare(right));
}

export function rogueAiSurvivalActiveV2(state: Pick<WorldStateV2, 'polarEndgame'>): boolean {
  return state.polarEndgame.phase === 'contact'
    || state.polarEndgame.phase === 'counteroffensive'
    || state.polarEndgame.phase === 'core-exposed';
}

export function rogueAiIsHostileToV2(
  content: WorldContentV2,
  playerId: PlayerId,
): boolean {
  return Boolean(content.nations[playerId]) && !isRogueAiNationV2(content, playerId);
}

export function isNationOperationalV2(
  state: Pick<WorldStateV2, 'polarEndgame'>,
  content: WorldContentV2,
  playerId: PlayerId,
): boolean {
  return !isRogueAiNationV2(content, playerId) || rogueAiSurvivalActiveV2(state);
}

/**
 * Gives the machine state its authored operating doctrine without inventing a
 * second combat/economy system. Every bonus is represented by the same budget,
 * treasury and research fields consumed for ordinary nations; authored waves
 * remain the explicit external wartime-personnel exception.
 */
export function primeRogueAiNationV2(state: WorldStateV2, content: WorldContentV2): void {
  const rogue = state.players[ROGUE_AI_NATION_ID_V2];
  if (!rogue || !isRogueAiNationV2(content, ROGUE_AI_NATION_ID_V2)) return;
  rogue.budget = { military: 65, research: 20, development: 15 };
  // Final Survival deployment derives a finite multi-year war chest from the
  // calibrated live army and actual operating budget; no arbitrary cash floor.
  rogue.treasury = round(Math.max(0, rogue.treasury), 3);
  rogue.trainedReserves = 0;
  for (const [effect, minimum] of Object.entries(ROGUE_AI_MINIMUM_RESEARCH_V2) as Array<[
    ResearchEffectV2,
    number,
  ]>) {
    rogue.research.effectLevels[effect] = Math.max(
      rogue.research.effectLevels[effect],
      minimum,
    );
  }
}

export function activateRogueAiSurvivalV2(
  state: WorldStateV2,
  content: WorldContentV2,
  revealedBy: PlayerId | null,
  immediate = false,
): boolean {
  if (rogueAiSurvivalActiveV2(state) || state.polarEndgame.phase === 'victory') return false;
  if (!state.players[ROGUE_AI_NATION_ID_V2]
    || !content.nations[ROGUE_AI_NATION_ID_V2]
    || rogueOwnedTerritoryIdsV2(state).length === 0) return false;
  primeRogueAiNationV2(state, content);
  state.polarEndgame.phase = 'contact';
  state.polarEndgame.revealedBy = revealedBy;
  state.polarEndgame.warningTick ??= state.tick;
  state.polarEndgame.contactTick = state.tick;
  state.polarEndgame.victoryTick = null;
  state.polarEndgame.victoryCommanderId = null;
  state.polarEndgame.globalWave = 1;
  state.polarEndgame.nextCounteroffensiveTick = state.tick
    + ROGUE_ANNUAL_WAVE_INTERVAL_TICKS_V2;
  state.polarEndgame.earthDefenseMembers = (Object.keys(state.players) as PlayerId[])
    .filter((playerId) => rogueAiIsHostileToV2(content, playerId))
    .sort((left, right) => left.localeCompare(right));
  state.polarEndgame.expeditions = [];
  state.polarEndgame.rogueAttention = {
    stage: 'active',
    liberatedWorldShare: state.polarEndgame.rogueAttention?.liberatedWorldShare ?? 0,
    benchmarkMetTick: state.polarEndgame.rogueAttention?.benchmarkMetTick ?? state.tick,
    nextStageTick: null,
    activatedTick: state.tick,
  };
  initializeAntarcticGatewayBreachesV2(
    state,
    immediate
      ? 1
      : CAMPAIGN_FIRST_GATEWAY_BREACH_TICKS_V2,
  );
  // Survival is already the terminal invasion timeline: its three physical
  // exits are operational from the opening. Campaign still reveals them one
  // by one, preserving the slower awakening arc there.
  if (immediate && isSurvivalStateV2(state)) {
    for (const gatewayId of ANTARCTIC_GATEWAY_IDS_V2) {
      const breach = state.polarEndgame.gatewayBreaches[gatewayId];
      if (!breach) continue;
      breach.status = 'open';
      breach.breachStartedTick ??= state.tick;
      breach.opensTick = state.tick;
      breach.openedTick = state.tick;
    }
  }
  activateRoguePrimeV2(state);
  state.polarEndgame.visualRevision += 1;
  addWorldEventV2(
    state,
    'polar',
    'critical',
    immediate
      ? 'SURVIVAL PROTOCOL: EONSCAR detects the Codex Ascendancy beneath Antarctica. All three machine gateways are already active.'
      : 'EONSCAR ORIGIN LOCK: the Codex Ascendancy is active beneath Antarctica. All three gateways are sealed; one breach is forming.',
    undefined,
    revealedBy ?? undefined,
    { polarRegion: 'antarctica' },
  );
  return true;
}

export function initializeSurvivalScenarioV2(
  state: WorldStateV2,
  content: WorldContentV2,
): void {
  primeRogueAiNationV2(state, content);
  if (content.metadata?.scenarioId === 'survival') {
    activateRogueAiSurvivalV2(state, content, state.humanPlayerId, true);
  }
}

function relationMatchesV2(
  leftId: PlayerId,
  rightId: PlayerId,
  targetId: PlayerId,
): boolean {
  return (leftId === ROGUE_AI_NATION_ID_V2 && rightId === targetId)
    || (rightId === ROGUE_AI_NATION_ID_V2 && leftId === targetId);
}

function clearRogueWarBlocksV2(state: WorldStateV2, targetId: PlayerId): void {
  state.truces = state.truces.filter((truce) => !relationMatchesV2(truce.leftId, truce.rightId, targetId));
  state.ceasefireObligations = [];
  state.offers = [];
  state.alliances = state.alliances.filter((alliance) => !relationMatchesV2(alliance.leftId, alliance.rightId, targetId));
  state.allianceOffers = state.allianceOffers.filter((offer) => !relationMatchesV2(offer.fromId, offer.toId, targetId));
}

function activeRogueWarWithV2(state: WorldStateV2, targetId: PlayerId): boolean {
  return state.wars.some((war) => relationMatchesV2(war.attackerId, war.defenderId, targetId));
}

export interface RogueTargetAccessV2 {
  targetId: PlayerId;
  access: 'land' | 'naval';
}

export function accessibleRogueTargetsV2(
  state: WorldStateV2,
  content: WorldContentV2,
): RogueTargetAccessV2[] {
  const targets = new Map<PlayerId, 'land' | 'naval'>();
  for (const sourceId of rogueOwnedTerritoryIdsV2(state)) {
    // Every opening source is a real Antarctic territory. Later captured world
    // countries join this same physical graph; no remote occupation is spawned.
    if ((state.territories[sourceId]?.army.manpower ?? 0) <= 1e-9) continue;
    for (const connection of content.territories[sourceId]?.connections ?? []) {
      if (!isWorldConnectionOpenV2(state, sourceId, connection.targetId)) continue;
      const ownerId = state.territories[connection.targetId]?.owner;
      if (!ownerId || !rogueAiIsHostileToV2(content, ownerId)) continue;
      if (!state.players[ownerId] || activeRogueWarWithV2(state, ownerId)) continue;
      const access = connection.kind === 'land' ? 'land' : 'naval';
      if (access === 'land' || !targets.has(ownerId)) targets.set(ownerId, access);
    }
  }
  const candidates = [...targets].map(([targetId, access]) => ({ targetId, access }));
  // Prefer a human seat, then the Arctic Dawnline if either actually borders
  // the machine; otherwise a sovereign gateway country is the physical target.
  return candidates.sort((left, right) => (
    Number(state.humanPlayerIds.includes(right.targetId))
      - Number(state.humanPlayerIds.includes(left.targetId))
      || Number(isSurvivalDawnlineNationV2(state, right.targetId))
        - Number(isSurvivalDawnlineNationV2(state, left.targetId))
      || Number(left.access === 'naval') - Number(right.access === 'naval')
      || left.targetId.localeCompare(right.targetId)
  ));
}

function waveHashV2(seed: number, wave: number, playerId: PlayerId): number {
  let hash = (seed ^ Math.imul(wave + 1, 0x9e3779b1)) >>> 0;
  for (let index = 0; index < playerId.length; index += 1) {
    hash = Math.imul(hash ^ playerId.charCodeAt(index), 0x45d9f3b) >>> 0;
  }
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function openRogueWarV2(state: WorldStateV2, targetId: PlayerId): WarStateV2 {
  clearRogueWarBlocksV2(state, targetId);
  const war: WarStateV2 = {
    id: `war-${state.nextWarId++}`,
    attackerId: ROGUE_AI_NATION_ID_V2,
    defenderId: targetId,
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
  };
  state.wars.push(war);
  return war;
}

/** Live deployed Rogue manpower, including manufactured Survival wave survivors. */
export function rogueActiveArmyManpowerV2(state: WorldStateV2): number {
  return round(Object.values(state.territories).reduce((sum, territory) => (
    territory.owner === ROGUE_AI_NATION_ID_V2
      ? sum + Math.max(0, territory.army.manpower)
      : sum
  ), 0), 9);
}

/** Campaign compatibility curve: 1%, 2%, then up to the permanent 5% cap. */
export function rogueAnnualWaveActiveArmyShareV2(wave: number): number {
  const canonicalWave = Math.max(1, Math.floor(Number.isFinite(wave) ? wave : 1));
  return Math.min(
    ROGUE_ANNUAL_WAVE_ACTIVE_ARMY_SHARE_V2,
    canonicalWave * ROGUE_ANNUAL_WAVE_ACTIVE_ARMY_SHARE_STEP_V2,
  );
}

/** Survival manufactures the full bounded 5% reinforcement from its first annual wave. */
export function rogueAnnualWaveActiveArmyShareForStateV2(
  state: Pick<WorldStateV2, 'contentVersion'>,
  wave: number,
): number {
  return isSurvivalStateV2(state)
    ? ROGUE_ANNUAL_WAVE_ACTIVE_ARMY_SHARE_V2
    : rogueAnnualWaveActiveArmyShareV2(wave);
}

export function rogueAnnualWaveManpowerV2(state: WorldStateV2): number {
  return round(
    rogueActiveArmyManpowerV2(state)
      * rogueAnnualWaveActiveArmyShareForStateV2(
        state,
        state.polarEndgame.globalWave,
      ),
    9,
  );
}

/**
 * The first convoy remains one readable approaching threat. Once the machine
 * has a real world foothold, successive waves fan out through nearby land
 * borders much sooner, while a hard ceiling prevents a global war explosion.
 */
export function survivalRogueFrontCapV2(
  wave: number,
  hasWorldFoothold: boolean,
): number {
  if (!hasWorldFoothold) return 1;
  const canonicalWave = Math.max(1, Math.floor(Number.isFinite(wave) ? wave : 1));
  return Math.min(
    SURVIVAL_MAX_CONCURRENT_ROGUE_FRONTS_V2,
    2 + Math.floor(Math.max(0, canonicalWave - 1) / 2),
  );
}

function rogueHasWorldFootholdV2(
  state: WorldStateV2,
  content: WorldContentV2,
): boolean {
  return Object.entries(state.territories).some(([territoryId, territory]) => (
    territory.owner === ROGUE_AI_NATION_ID_V2
      && (content.territories[territoryId as TerritoryId]?.kind ?? 'sovereign') === 'sovereign'
  ));
}

function openReachableRogueFrontsV2(
  state: WorldStateV2,
  content: WorldContentV2,
  wave: number,
): PlayerId[] {
  const activeTargets = activeRogueWarOpponentsV2(state);
  const capacity = survivalRogueFrontCapV2(
    wave,
    rogueHasWorldFootholdV2(state, content),
  );
  if (activeTargets.length >= capacity) return [];
  const humanIds = new Set(state.humanPlayerIds);
  const candidates = accessibleRogueTargetsV2(state, content)
    .sort((left, right) => Number(humanIds.has(right.targetId))
      - Number(humanIds.has(left.targetId))
      || Number(isSurvivalDawnlineNationV2(state, right.targetId))
        - Number(isSurvivalDawnlineNationV2(state, left.targetId))
      || waveHashV2(state.seed, wave, left.targetId)
        - waveHashV2(state.seed, wave, right.targetId)
      || left.targetId.localeCompare(right.targetId));
  const newTargets = candidates
    .slice(0, Math.max(0, capacity - activeTargets.length));
  for (const target of newTargets) openRogueWarV2(state, target.targetId);
  return newTargets.map((target) => target.targetId);
}

/**
 * Launches one annual reinforcement. Survival manufactures new, verified
 * Antarctic-origin personnel equal to 5% of the live army at launch and
 * stages them evenly at the three physical gateways. Existing formations are
 * never deducted. The provenance ledger itself is the dedicated expedition
 * allowance: ordinary capacity recalculation preserves trained over-cap
 * personnel, while weekly logistics still has to route them into the world.
 * Campaign keeps its older transfer-only compatibility behaviour.
 */
function mobilizeAnnualRogueWaveV2(state: WorldStateV2): number {
  const rogue = state.players[ROGUE_AI_NATION_ID_V2];
  if (!rogue) return 0;
  const waveManpower = rogueAnnualWaveManpowerV2(state);
  if (waveManpower <= 0) return 0;
  rogue.trainedReserves = 0;
  const openGatewayIds = state.polarEndgame.gatewayBreachOrder
    .filter((gatewayId) => isAntarcticGatewayOpenV2(state, gatewayId))
    .map(antarcticGatewayTerritoryIdV2);
  const destinations = openGatewayIds.length > 0
    ? openGatewayIds
    : [ROGUE_AI_CORE_TERRITORY_ID_V2];
  if (isSurvivalStateV2(state)) {
    let manufactured = 0;
    for (let index = 0; index < destinations.length; index += 1) {
      const destinationId = destinations[index]!;
      const destination = state.territories[destinationId];
      if (!destination || destination.owner !== ROGUE_AI_NATION_ID_V2) continue;
      const added = index === destinations.length - 1
        ? round(waveManpower - manufactured, 9)
        : round(waveManpower / destinations.length, 9);
      if (added <= 0) continue;
      destination.army.manpower = round(destination.army.manpower + added, 9);
      addRogueWaveManpowerV2(state, destinationId, added);
      manufactured = round(manufactured + added, 9);
    }
    return manufactured;
  }
  const sourceIds = [...ANTARCTIC_TERRITORY_IDS_V2]
    .filter((territoryId) => !destinations.includes(territoryId))
    .sort((left, right) => {
      const kindRank = (territoryId: TerritoryId): number => {
        if (territoryId === ROGUE_AI_CORE_TERRITORY_ID_V2) return 0;
        const kind = territoryId.includes('sentinel') || territoryId.includes('vault')
          ? 'inner' : territoryId.includes('entry') ? 'perimeter' : 'outer';
        return kind === 'inner' ? 1 : kind === 'outer' ? 2 : 3;
      };
      return kindRank(left) - kindRank(right) || left.localeCompare(right);
    });
  let committed = 0;
  for (let index = 0; index < destinations.length; index += 1) {
    const destinationId = destinations[index]!;
    const destination = state.territories[destinationId];
    if (!destination || destination.owner !== ROGUE_AI_NATION_ID_V2) continue;
    const equalShare = index === destinations.length - 1
      ? waveManpower - committed
      : round(waveManpower / destinations.length, 9);
    let remainingShare = equalShare;
    for (const sourceId of sourceIds) {
      if (remainingShare <= 1e-9) break;
      const source = state.territories[sourceId];
      if (!source || source.owner !== ROGUE_AI_NATION_ID_V2) continue;
      const sourceBefore = Math.max(0, source.army.manpower);
      const moved = Math.min(remainingShare, sourceBefore);
      if (moved <= 0) continue;
      source.army.manpower = round(source.army.manpower - moved, 9);
      destination.army.manpower = round(destination.army.manpower + moved, 9);
      const alreadyVerified = transferRogueWaveManpowerV2(
        state,
        sourceId,
        destinationId,
        moved,
        sourceBefore,
      );
      addRogueWaveManpowerV2(state, destinationId, moved - alreadyVerified);
      committed = round(committed + moved, 9);
      remainingShare = Math.max(0, remainingShare - moved);
    }
  }
  return committed;
}

function rogueWaveCommitmentLabelV2(state: WorldStateV2, committed: number): string {
  const liveArmy = rogueActiveArmyManpowerV2(state);
  const launchArmy = isSurvivalStateV2(state)
    ? Math.max(0, liveArmy - committed) : liveArmy;
  const actualShare = launchArmy > 0 ? committed / launchArmy : 0;
  const sharePercent = Math.round(actualShare * 1_000) / 10;
  return `${sharePercent}% of the live machine army (${Math.round(committed * 1_000_000)} newly manufactured units)`;
}

function finishSurvivalVictoryV2(state: WorldStateV2): boolean {
  const coreOwner = state.territories[ROGUE_AI_CORE_TERRITORY_ID_V2]?.owner;
  if (!coreOwner || coreOwner === ROGUE_AI_NATION_ID_V2) return false;
  // Keep the legacy polar envelope internally coherent for old saves and
  // multiplayer hashes. The territory owner is authoritative in the new
  // system; this record is compatibility metadata, not a second battle model.
  const coreRecord = state.polarEndgame.sectors['zero-point-core'];
  if (coreRecord) {
    coreRecord.status = 'secured';
    coreRecord.integrity = 0;
    coreRecord.discoveredTick ??= state.tick;
    coreRecord.securedTick = state.tick;
    coreRecord.securedBy = coreOwner;
  }
  state.polarEndgame.phase = 'victory';
  state.polarEndgame.victoryTick = state.tick;
  state.polarEndgame.victoryCommanderId = coreOwner;
  state.polarEndgame.nextCounteroffensiveTick = null;
  state.polarEndgame.bossPhase = 3;
  state.polarEndgame.bossIntegrity = 0;
  state.polarEndgame.visualRevision += 1;
  addWorldEventV2(
    state,
    'polar',
    'critical',
    'ZERO POINT CAPTURED: the Rogue AI core has gone silent. Humanity survives the machine invasion.',
    ROGUE_AI_CORE_TERRITORY_ID_V2,
    coreOwner,
    { polarRegion: 'antarctica', polarSectorId: 'zero-point-core' },
  );
  return true;
}

export function processRogueAiSurvivalV2(
  state: WorldStateV2,
  content: WorldContentV2,
): SurvivalWaveResultV2 {
  if (finishSurvivalVictoryV2(state)) {
    return { activated: true, waveStarted: null, targets: [], victory: true };
  }
  if (!rogueAiSurvivalActiveV2(state)) {
    return { activated: false, waveStarted: null, targets: [], victory: false };
  }
  for (const gatewayId of processAntarcticGatewayBreachesV2(state)) {
    const gatewayTerritoryId = antarcticGatewayTerritoryIdV2(gatewayId);
    addWorldEventV2(
      state,
      'polar',
      'critical',
      `${content.territories[gatewayTerritoryId]?.name ?? gatewayId} BREACH OPEN: the first machine convoys can now enter the world supply network.`,
      gatewayTerritoryId,
      ROGUE_AI_NATION_ID_V2,
      { polarRegion: 'antarctica', polarSectorId: gatewayId },
    );
  }
  normalizeSurvivalWarPressureV2(state);
  const dueTick = state.polarEndgame.nextCounteroffensiveTick;
  if (dueTick === null || dueTick > state.tick) {
    const opened = openReachableRogueFrontsV2(
      state,
      content,
      Math.max(1, Math.floor(state.polarEndgame.globalWave)),
    );
    if (opened.length > 0) {
      state.polarEndgame.visualRevision += 1;
      addWorldEventV2(
        state,
        'polar',
        'critical',
        `MACHINE OFFENSIVE: Antarctic forces opened ${opened.length} physical front${opened.length === 1 ? '' : 's'} against ${opened.map((targetId) => content.nations[targetId]?.shortName ?? targetId).join(', ')} through the active gateways.`,
        undefined,
        ROGUE_AI_NATION_ID_V2,
        { polarRegion: 'antarctica' },
      );
    }
    return { activated: true, waveStarted: null, targets: opened, victory: false };
  }
  const wave = Math.max(1, Math.floor(state.polarEndgame.globalWave));
  const breachIndex = !isSurvivalStateV2(state) && wave === 3 ? 1
    : !isSurvivalStateV2(state) && wave === 5 ? 2 : -1;
  if (breachIndex >= 0) {
    const gatewayId = scheduleAntarcticGatewayBreachV2(
      state,
      breachIndex,
      LATER_GATEWAY_BREACH_TICKS_V2,
    );
    if (gatewayId) {
      const gatewayTerritoryId = antarcticGatewayTerritoryIdV2(gatewayId);
      addWorldEventV2(
        state,
        'polar',
        'critical',
        `${content.territories[gatewayTerritoryId]?.name ?? gatewayId} BREACHING: route opens in ${LATER_GATEWAY_BREACH_TICKS_V2} weeks.`,
        gatewayTerritoryId,
        ROGUE_AI_NATION_ID_V2,
        { polarRegion: 'antarctica', polarSectorId: gatewayId },
      );
    }
  }
  const stagedManpower = mobilizeAnnualRogueWaveV2(state);
  const humanIds = new Set(state.humanPlayerIds);
  const activeTargets = activeRogueWarOpponentsV2(state);
  const candidates = accessibleRogueTargetsV2(state, content)
    .sort((left, right) => Number(humanIds.has(right.targetId)) - Number(humanIds.has(left.targetId))
      || Number(isSurvivalDawnlineNationV2(state, right.targetId))
        - Number(isSurvivalDawnlineNationV2(state, left.targetId))
      || waveHashV2(state.seed, wave, left.targetId) - waveHashV2(state.seed, wave, right.targetId)
      || left.targetId.localeCompare(right.targetId));
  const hasWorldFoothold = rogueHasWorldFootholdV2(state, content);
  // The opening is one readable, approaching threat. Later gateways may be
  // visible already, but they do not steal the convoy from the first breach
  // until the machine has actually established a world foothold. Expansion
  // can fan out gradually afterwards as stronger waves arrive.
  const targetCount = survivalRogueFrontCapV2(wave, hasWorldFoothold);
  const newTargets = candidates.slice(0, Math.max(0, targetCount - activeTargets.length))
    .map((candidate) => candidate.targetId);
  const targets = [...activeTargets, ...newTargets]
    .filter((targetId, index, all) => all.indexOf(targetId) === index)
    .sort((left, right) => left.localeCompare(right));
  const interval = ROGUE_ANNUAL_WAVE_INTERVAL_TICKS_V2;
  if (targets.length === 0) {
    // The convoy is still a real wave and must not be restaged every four
    // weeks. It leaves Zero Point now; its first war is declared only after
    // provenance physically reaches a gateway/front on a later review.
    state.polarEndgame.globalWave = wave + 1;
    state.polarEndgame.nextCounteroffensiveTick = state.tick + interval;
    state.polarEndgame.visualRevision += 1;
    addWorldEventV2(
      state,
      'polar',
      'action',
      `ROGUE WAVE ${wave}: ${rogueWaveCommitmentLabelV2(state, stagedManpower)} staged through the open Antarctic gateways. No world front is in range yet.`,
      undefined,
      ROGUE_AI_NATION_ID_V2,
      { polarRegion: 'antarctica' },
    );
    return { activated: true, waveStarted: wave, targets: [], victory: false };
  }
  for (const targetId of newTargets) openRogueWarV2(state, targetId);
  if (wave > 1) {
    for (const targetId of targets) {
      adjustSurvivalWarPressureV2(state, targetId, -SURVIVAL_WAVE_PRESSURE_RELIEF_V2);
    }
  }
  state.polarEndgame.globalWave = wave + 1;
  state.polarEndgame.nextCounteroffensiveTick = state.tick + interval;
  state.polarEndgame.visualRevision += 1;
  addWorldEventV2(
    state,
    'polar',
    wave >= 4 ? 'critical' : 'action',
    `ROGUE WAVE ${wave}: ${rogueWaveCommitmentLabelV2(state, stagedManpower)} staged through the open Antarctic gateways toward ${targets.length} permanent front${targets.length === 1 ? '' : 's'} against ${targets.map((id) => content.nations[id]?.shortName ?? id).join(', ')}${newTargets.length > 0 ? `, opening ${newTargets.length} new theatre${newTargets.length === 1 ? '' : 's'}` : ''}.`,
    undefined,
    ROGUE_AI_NATION_ID_V2,
    { polarRegion: 'antarctica' },
  );
  return { activated: true, waveStarted: wave, targets, victory: false };
}
