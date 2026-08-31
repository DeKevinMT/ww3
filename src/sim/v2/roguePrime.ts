import { round } from './balance';
import {
  ANTARCTIC_GATEWAY_COUNTRY_ROUTES_V2,
  ANTARCTIC_TERRITORY_IDS_V2,
  ROGUE_AI_NATION_ID_V2,
  type WorldContentV2,
} from './content';
import {
  NEUTRAL_COMMANDER_EMPIRE_SUPPORT_V2,
  normalizeCommanderForceRuntimeV2,
  selectCommanderRouteV2,
} from './commanderForce';
import { addWorldEventV2 } from './events';
import { isAntarcticGatewayOpenV2 } from './antarcticGateways';
import type {
  AntarcticSectorIdV2,
  CommanderForceStateV2,
  FrontOperationV2,
  RoguePrimeStateV2,
  TerritoryId,
  WarStateV2,
  WorldStateV2,
} from './types';
import { territoryIdV2 } from './types';

export const ROGUE_PRIME_CORE_TERRITORY_ID_V2 = territoryIdV2('zero-point-core');
export const ROGUE_PRIME_INITIAL_SORTIE_DELAY_TICKS_V2 = 52;
export const ROGUE_PRIME_SORTIE_WARNING_MIN_TICKS_V2 = 4;
export const ROGUE_PRIME_SORTIE_WARNING_MAX_TICKS_V2 = 8;
export const ROGUE_PRIME_OUTSIDE_MIN_TICKS_V2 = 12;
export const ROGUE_PRIME_OUTSIDE_MAX_TICKS_V2 = 26;
export const ROGUE_PRIME_SORTIE_COOLDOWN_MIN_TICKS_V2 = 104;
export const ROGUE_PRIME_SORTIE_COOLDOWN_MAX_TICKS_V2 = 156;
export const ROGUE_PRIME_REBUILD_MIN_TICKS_V2 = 104;
export const ROGUE_PRIME_REBUILD_MAX_TICKS_V2 = 156;
export const ROGUE_PRIME_REBUILD_TREASURY_COST_V2 = 120;
export const ROGUE_PRIME_REPLACEMENT_PER_TICK_V2 = 0.000012;
export const ROGUE_PRIME_REPLACEMENT_COST_PER_MILLION_V2 = 3_000;
export const ROGUE_PRIME_REPLACEMENT_SUPPLY_PER_MILLION_V2 = 2;

const EPSILON = 0.000000001;
const antarcticTerritories = new Set<TerritoryId>(ANTARCTIC_TERRITORY_IDS_V2);

function deterministicPrimeValueV2(
  state: Pick<WorldStateV2, 'seed'>,
  sequence: number,
  salt: number,
  minimum: number,
  maximum: number,
): number {
  let hash = (state.seed ^ Math.imul(sequence + 1, 0x45d9f3b) ^ salt) >>> 0;
  hash = Math.imul(hash ^ hash >>> 16, 0x7feb352d) >>> 0;
  hash = Math.imul(hash ^ hash >>> 15, 0x846ca68b) >>> 0;
  hash = (hash ^ hash >>> 16) >>> 0;
  return minimum + hash % (maximum - minimum + 1);
}

function createPrimeForceV2(state: WorldStateV2): CommanderForceStateV2 {
  const wave = Math.max(1, Math.floor(state.polarEndgame.globalWave));
  const integrity = primeActiveTargetV2(state);
  const maxIntegrity = round(0.00052 + Math.min(0.00030, (wave - 1) * 0.00002), 9);
  return {
    shield: {
      integrity,
      maxIntegrity,
      rechargeBuffer: 0,
      rechargeMultiplier: 1,
      attackMultiplier: round(Math.min(1.35, 1.12 + (wave - 1) * 0.01), 9),
      defenseMultiplier: round(Math.min(1.40, 1.15 + (wave - 1) * 0.012), 9),
      pulseAttack: round(Math.min(0.008, 0.0015 + (wave - 1) * 0.00015), 9),
      pulseProjectionRetention: 0,
      pulseChargeBonusPerStep: 0,
      interceptEfficiency: 1,
      impactRecoveryShare: 0,
      defensivePulseMultiplier: 1,
    },
    economy: {
      treasury: 20,
      annualOutput: 0,
      supplyStock: round(integrity * 26, 9),
      priorities: { training: 0, logistics: 100, development: 0 },
    },
    capabilities: {
      mobileHeadquarters: true,
      fieldHospital: false,
      rapidResponse: false,
      forceMultiplier: false,
      assaultSpecialist: false,
      defenseSpecialist: false,
      emergencyExtractionCharges: 0,
    },
    empireSupport: {
      recruitmentMultiplier: 1,
      reserveTrainingMultiplier: 1,
      armyCasualtyMultiplier: 1,
      armyPeaceRecoveryMultiplier: 1,
      annualFoodOutput: 0,
      foodProductionMultiplier: 1,
      foodStorageMultiplier: 1,
      foodImportCostMultiplier: 1,
    },
    countryTraitScale: 0,
    locationId: ROGUE_PRIME_CORE_TERRITORY_ID_V2,
    mission: 'standby',
    orderSource: 'autonomous',
    manualHoldUntilTick: 0,
    front: null,
    transit: null,
  };
}

function primeActiveTargetV2(state: WorldStateV2): number {
  const wave = Math.max(1, Math.floor(state.polarEndgame.globalWave));
  return round(0.00026 + Math.min(0.00022, (wave - 1) * 0.000015), 9);
}

export function createInitialRoguePrimeStateV2(): RoguePrimeStateV2 {
  return {
    status: 'dormant',
    force: null,
    sortieSequence: 0,
    nextSortieTick: null,
    gatewayId: null,
    targetId: null,
    departTick: null,
    strikeTick: null,
    returnTick: null,
    rebuildReadyTick: null,
  };
}

export function cloneRoguePrimeStateV2(
  source: RoguePrimeStateV2 | undefined,
): RoguePrimeStateV2 {
  if (!source) return createInitialRoguePrimeStateV2();
  const force = source.force
    ? normalizeCommanderForceRuntimeV2(
        source.force,
        NEUTRAL_COMMANDER_EMPIRE_SUPPORT_V2,
      )
    : null;
  return {
    ...source,
    force,
  };
}

function clearSortieV2(prime: RoguePrimeStateV2): void {
  prime.gatewayId = null;
  prime.targetId = null;
  prime.departTick = null;
  prime.strikeTick = null;
  prime.returnTick = null;
  if (prime.force) {
    prime.force.mission = 'standby';
    prime.force.front = null;
    prime.force.transit = null;
  }
}

function spendAntarcticBuildResourcesV2(state: WorldStateV2, force: CommanderForceStateV2): boolean {
  const rogue = state.players[ROGUE_AI_NATION_ID_V2];
  if (!rogue || state.territories[ROGUE_PRIME_CORE_TERRITORY_ID_V2]?.owner
    !== ROGUE_AI_NATION_ID_V2) return false;
  if (rogue.treasury + EPSILON < ROGUE_PRIME_REBUILD_TREASURY_COST_V2) return false;
  rogue.treasury = round(rogue.treasury - ROGUE_PRIME_REBUILD_TREASURY_COST_V2, 9);
  return true;
}

/** Activates only after the canonical Rogue contact state exists. */
export function activateRoguePrimeV2(state: WorldStateV2): boolean {
  const prime = state.polarEndgame.roguePrime ??= createInitialRoguePrimeStateV2();
  if (prime.status !== 'dormant'
    || !['contact', 'counteroffensive', 'core-exposed'].includes(state.polarEndgame.phase)) return false;
  const force = createPrimeForceV2(state);
  if (!spendAntarcticBuildResourcesV2(state, force)) return false;
  prime.status = 'guarding';
  prime.force = force;
  prime.nextSortieTick = state.tick + ROGUE_PRIME_INITIAL_SORTIE_DELAY_TICKS_V2;
  prime.rebuildReadyTick = null;
  state.polarEndgame.visualRevision += 1;
  return true;
}

interface PrimeSortieCandidateV2 {
  war: WarStateV2;
  operation: FrontOperationV2;
  gatewayId: AntarcticSectorIdV2;
}

interface PrimeDefenseCandidateV2 {
  war: WarStateV2;
  operation: FrontOperationV2;
  priority: number;
}

function antarcticDefensePriorityV2(
  content: WorldContentV2,
  territoryId: TerritoryId,
): number {
  switch (content.territories[territoryId]?.kind) {
    case 'rogue-core': return 4;
    case 'rogue-inner': return 3;
    case 'rogue-outer': return 2;
    case 'rogue-perimeter': return 1;
    default: return 0;
  }
}

function primeDefenseCandidatesV2(
  state: WorldStateV2,
  content: WorldContentV2,
): PrimeDefenseCandidateV2[] {
  const candidates: PrimeDefenseCandidateV2[] = [];
  for (const war of state.wars) {
    for (const operation of [...war.attackerOperations, ...war.defenderOperations]) {
      if (operation.commanderId === ROGUE_AI_NATION_ID_V2
        || state.territories[operation.targetId]?.owner !== ROGUE_AI_NATION_ID_V2
        || !antarcticTerritories.has(operation.targetId)) continue;
      candidates.push({
        war,
        operation,
        priority: antarcticDefensePriorityV2(content, operation.targetId),
      });
    }
  }
  return candidates.sort((left, right) => right.priority - left.priority
    || left.operation.targetId.localeCompare(right.operation.targetId)
    || left.operation.sourceId.localeCompare(right.operation.sourceId)
    || left.war.id.localeCompare(right.war.id));
}

function primeDefenseFrontValidV2(state: WorldStateV2, force: CommanderForceStateV2): boolean {
  const front = force.front;
  if (!front || !antarcticTerritories.has(front.targetId)
    || state.territories[front.targetId]?.owner !== ROGUE_AI_NATION_ID_V2) return false;
  const war = state.wars.find((candidate) => candidate.id === front.warId);
  return Boolean(war && [...war.attackerOperations, ...war.defenderOperations].some((operation) => (
    operation.commanderId !== ROGUE_AI_NATION_ID_V2
      && operation.sourceId === front.sourceId
      && operation.targetId === front.targetId
  )));
}

function routePrimeToDefenseV2(
  state: WorldStateV2,
  content: WorldContentV2,
  candidate: PrimeDefenseCandidateV2,
): boolean {
  const force = state.polarEndgame.roguePrime.force;
  if (!force) return false;
  const route = selectCommanderRouteV2(
    state, content, ROGUE_AI_NATION_ID_V2, force.locationId, candidate.operation.targetId,
  );
  if (!route || route.path.some((territoryId) => !antarcticTerritories.has(territoryId))) return false;
  force.front = {
    warId: candidate.war.id,
    sourceId: candidate.operation.sourceId,
    targetId: candidate.operation.targetId,
  };
  if (route.path.length === 1) {
    force.locationId = candidate.operation.targetId;
    force.transit = null;
    force.mission = 'defense';
    return true;
  }
  const travelTicks = Math.max(1, Math.ceil(
    route.distanceKm / 1_200 + Math.max(0, route.path.length - 2) * 0.25,
  ));
  force.mission = 'standby';
  force.transit = {
    path: [...route.path],
    distanceKm: route.distanceKm,
    departTick: state.tick,
    arriveTick: state.tick + travelTicks,
  };
  return true;
}

function processPrimeAntarcticGuardV2(
  state: WorldStateV2,
  content: WorldContentV2,
): boolean {
  const force = state.polarEndgame.roguePrime.force;
  if (!force) return false;
  if (force.transit) {
    if (force.transit.path.some((territoryId) => (
      !antarcticTerritories.has(territoryId)
        || state.territories[territoryId]?.owner !== ROGUE_AI_NATION_ID_V2
    ))) {
      force.transit = null;
      force.front = null;
      force.mission = 'standby';
    } else if (state.tick >= force.transit.arriveTick) {
      force.locationId = force.transit.path.at(-1)!;
      force.transit = null;
      force.mission = primeDefenseFrontValidV2(state, force) ? 'defense' : 'standby';
      if (force.mission === 'standby') force.front = null;
    } else {
      return true;
    }
  }
  const candidates = primeDefenseCandidatesV2(state, content);
  const current = candidates.find((candidate) => force.front?.warId === candidate.war.id
    && force.front.sourceId === candidate.operation.sourceId
    && force.front.targetId === candidate.operation.targetId);
  const best = candidates[0];
  if (!best) {
    if (force.mission === 'defense') {
      force.mission = 'standby';
      force.front = null;
    }
    return false;
  }
  if (current === best && force.locationId === best.operation.targetId) {
    force.mission = 'defense';
    return true;
  }
  return routePrimeToDefenseV2(state, content, best);
}

function primeSortieCandidatesV2(state: WorldStateV2): PrimeSortieCandidateV2[] {
  const routeByPair = new Map(ANTARCTIC_GATEWAY_COUNTRY_ROUTES_V2.map((route) => [
    `${route.gatewayId}:${route.countryId}`,
    route.gatewayId as AntarcticSectorIdV2,
  ]));
  const candidates: PrimeSortieCandidateV2[] = [];
  for (const war of state.wars) {
    if (war.attackerId !== ROGUE_AI_NATION_ID_V2) continue;
    for (const operation of war.attackerOperations) {
      const gatewayId = routeByPair.get(`${operation.sourceId}:${operation.targetId}`);
      if (!gatewayId || !isAntarcticGatewayOpenV2(state, gatewayId)
        || operation.commanderId !== ROGUE_AI_NATION_ID_V2
        || state.territories[operation.sourceId]?.owner !== ROGUE_AI_NATION_ID_V2
        || state.territories[operation.targetId]?.owner === ROGUE_AI_NATION_ID_V2) continue;
      candidates.push({ war, operation, gatewayId });
    }
  }
  return candidates.sort((left, right) => {
    const leftHuman = Number(state.humanPlayerIds.includes(
      state.territories[left.operation.targetId]!.owner,
    ));
    const rightHuman = Number(state.humanPlayerIds.includes(
      state.territories[right.operation.targetId]!.owner,
    ));
    const leftArmy = state.territories[left.operation.targetId]?.army.manpower ?? 0;
    const rightArmy = state.territories[right.operation.targetId]?.army.manpower ?? 0;
    return rightHuman - leftHuman
      || leftArmy - rightArmy
      || left.operation.targetId.localeCompare(right.operation.targetId);
  });
}

function schedulePrimeSortieV2(
  state: WorldStateV2,
  content: WorldContentV2,
  candidate: PrimeSortieCandidateV2,
): boolean {
  const prime = state.polarEndgame.roguePrime;
  const force = prime.force;
  if (!force || prime.status !== 'guarding') return false;
  const gatewayTerritoryId = territoryIdV2(candidate.gatewayId);
  const route = selectCommanderRouteV2(
    state,
    content,
    ROGUE_AI_NATION_ID_V2,
    force.locationId,
    gatewayTerritoryId,
  );
  if (!route || route.path.some((territoryId) => !antarcticTerritories.has(territoryId))) return false;
  const warningTicks = deterministicPrimeValueV2(
    state,
    prime.sortieSequence,
    0x51f15e,
    ROGUE_PRIME_SORTIE_WARNING_MIN_TICKS_V2,
    ROGUE_PRIME_SORTIE_WARNING_MAX_TICKS_V2,
  );
  const outsideTicks = deterministicPrimeValueV2(
    state,
    prime.sortieSequence,
    0x0a11ce,
    ROGUE_PRIME_OUTSIDE_MIN_TICKS_V2,
    ROGUE_PRIME_OUTSIDE_MAX_TICKS_V2,
  );
  prime.status = 'sortie';
  prime.nextSortieTick = null;
  prime.gatewayId = candidate.gatewayId;
  prime.targetId = candidate.operation.targetId;
  prime.departTick = state.tick;
  prime.strikeTick = state.tick + warningTicks;
  prime.returnTick = state.tick + warningTicks + outsideTicks;
  force.mission = 'standby';
  force.front = {
    warId: candidate.war.id,
    sourceId: candidate.operation.sourceId,
    targetId: candidate.operation.targetId,
  };
  force.transit = route.path.length > 1 ? {
    path: [...route.path],
    distanceKm: route.distanceKm,
    departTick: state.tick,
    arriveTick: prime.strikeTick,
  } : null;
  state.polarEndgame.visualRevision += 1;
  addWorldEventV2(
    state,
    'polar',
    'critical',
    `ROGUE PRIME SORTIE: a rival machine intelligence is moving toward ${content.territories[candidate.operation.targetId]?.name ?? candidate.operation.targetId}. Impact in ${warningTicks} days; forced withdrawal follows within ${outsideTicks} days.`,
    gatewayTerritoryId,
    ROGUE_AI_NATION_ID_V2,
    { polarRegion: 'antarctica', polarSectorId: candidate.gatewayId },
  );
  return true;
}

function sortieFrontStillValidV2(state: WorldStateV2, prime: RoguePrimeStateV2): boolean {
  const force = prime.force;
  if (!force?.front || !prime.gatewayId || !prime.targetId
    || !isAntarcticGatewayOpenV2(state, prime.gatewayId)) return false;
  const route = ANTARCTIC_GATEWAY_COUNTRY_ROUTES_V2.find((candidate) => (
    candidate.gatewayId === prime.gatewayId && candidate.countryId === prime.targetId
  ));
  if (!route) return false;
  const war = state.wars.find((candidate) => candidate.id === force.front!.warId);
  return Boolean(war?.attackerOperations.some((operation) => (
    operation.commanderId === ROGUE_AI_NATION_ID_V2
      && operation.sourceId === force.front!.sourceId
      && operation.targetId === force.front!.targetId
  )));
}

function returnPrimeToAntarcticaV2(state: WorldStateV2): void {
  const prime = state.polarEndgame.roguePrime;
  const force = prime.force;
  if (!force) return;
  const gatewayId = prime.gatewayId ? territoryIdV2(prime.gatewayId) : force.locationId;
  force.locationId = state.territories[gatewayId]?.owner === ROGUE_AI_NATION_ID_V2
    ? gatewayId : ROGUE_PRIME_CORE_TERRITORY_ID_V2;
  prime.status = 'guarding';
  prime.sortieSequence += 1;
  prime.nextSortieTick = state.tick + deterministicPrimeValueV2(
    state,
    prime.sortieSequence,
    0xc001d0,
    ROGUE_PRIME_SORTIE_COOLDOWN_MIN_TICKS_V2,
    ROGUE_PRIME_SORTIE_COOLDOWN_MAX_TICKS_V2,
  );
  clearSortieV2(prime);
  state.polarEndgame.visualRevision += 1;
}

function refillPrimeFromCoreV2(
  state: WorldStateV2,
  content: WorldContentV2,
): void {
  const force = state.polarEndgame.roguePrime.force;
  const rogue = state.players[ROGUE_AI_NATION_ID_V2];
  if (!force || !rogue || !antarcticTerritories.has(force.locationId)
    || state.territories[force.locationId]?.owner !== ROGUE_AI_NATION_ID_V2
    || state.territories[ROGUE_PRIME_CORE_TERRITORY_ID_V2]?.owner !== ROGUE_AI_NATION_ID_V2
    || !selectCommanderRouteV2(
      state, content, ROGUE_AI_NATION_ID_V2,
      ROGUE_PRIME_CORE_TERRITORY_ID_V2, force.locationId,
    )) return;
  const capacity = force.shield.maxIntegrity * 26;
  const requested = Math.min(0.0005, Math.max(0, capacity - force.economy.supplyStock));
  const cost = requested * 20;
  if (requested <= EPSILON || rogue.treasury + EPSILON < cost) return;
  rogue.treasury = round(rogue.treasury - cost, 9);
  force.economy.supplyStock = round(force.economy.supplyStock + requested, 9);
}

function recoverPrimePersonnelAtCoreV2(state: WorldStateV2): void {
  const prime = state.polarEndgame.roguePrime;
  const force = prime.force;
  const rogue = state.players[ROGUE_AI_NATION_ID_V2];
  if (prime.status !== 'guarding' || !force || force.transit
    || force.locationId !== ROGUE_PRIME_CORE_TERRITORY_ID_V2
    || state.territories[ROGUE_PRIME_CORE_TERRITORY_ID_V2]?.owner !== ROGUE_AI_NATION_ID_V2
    || !rogue) return;
  const room = Math.max(0, Math.min(
    force.shield.maxIntegrity,
    primeActiveTargetV2(state),
  ) - force.shield.integrity);
  const requested = Math.min(ROGUE_PRIME_REPLACEMENT_PER_TICK_V2, room);
  const treasuryCost = requested * ROGUE_PRIME_REPLACEMENT_COST_PER_MILLION_V2;
  const supplyCost = requested * ROGUE_PRIME_REPLACEMENT_SUPPLY_PER_MILLION_V2;
  if (requested <= EPSILON || rogue.treasury + EPSILON < treasuryCost
    || force.economy.supplyStock + EPSILON < supplyCost) return;
  rogue.treasury = round(rogue.treasury - treasuryCost, 9);
  force.economy.supplyStock = round(force.economy.supplyStock - supplyCost, 9);
  force.shield.integrity = round(force.shield.integrity + requested, 9);
}

/** Pre-war lifecycle. A sortie can support one authored gateway front only. */
export function processRoguePrimeV2(state: WorldStateV2, content: WorldContentV2): void {
  const prime = state.polarEndgame.roguePrime ??= createInitialRoguePrimeStateV2();
  if (state.polarEndgame.phase === 'victory'
    || state.territories[ROGUE_PRIME_CORE_TERRITORY_ID_V2]?.owner !== ROGUE_AI_NATION_ID_V2) {
    prime.status = 'destroyed';
    prime.force = null;
    prime.nextSortieTick = null;
    prime.rebuildReadyTick = null;
    clearSortieV2(prime);
    return;
  }
  if (prime.status === 'dormant') {
    activateRoguePrimeV2(state);
    return;
  }
  if (prime.status === 'destroyed') return;
  if (prime.status === 'rebuilding') {
    if (prime.rebuildReadyTick === null || state.tick < prime.rebuildReadyTick) return;
    const force = createPrimeForceV2(state);
    if (!spendAntarcticBuildResourcesV2(state, force)) {
      prime.rebuildReadyTick = state.tick + 13;
      return;
    }
    prime.force = force;
    prime.status = 'guarding';
    prime.rebuildReadyTick = null;
    prime.nextSortieTick = state.tick + ROGUE_PRIME_INITIAL_SORTIE_DELAY_TICKS_V2;
    state.polarEndgame.visualRevision += 1;
    addWorldEventV2(
      state, 'polar', 'critical',
      'ROGUE PRIME REBUILT: Zero Point has restored the rival neural weapon. Its next sortie is still being prepared.',
      ROGUE_PRIME_CORE_TERRITORY_ID_V2,
      ROGUE_AI_NATION_ID_V2,
      { polarRegion: 'antarctica', polarSectorId: 'zero-point-core' },
    );
    return;
  }
  refillPrimeFromCoreV2(state, content);
  recoverPrimePersonnelAtCoreV2(state);
  if (prime.status === 'sortie') {
    if (prime.returnTick !== null && state.tick >= prime.returnTick) {
      returnPrimeToAntarcticaV2(state);
      return;
    }
    const force = prime.force;
    if (!force) return;
    if (prime.strikeTick !== null && state.tick >= prime.strikeTick) {
      force.transit = null;
      if (prime.gatewayId) force.locationId = territoryIdV2(prime.gatewayId);
      force.mission = sortieFrontStillValidV2(state, prime) ? 'assault-support' : 'standby';
      if (force.mission === 'standby') force.front = null;
    }
    return;
  }
  // Defending the ice always outranks an optional expedition. Core and inner
  // sectors are selected first, and the route is strictly RAI-owned Antarctica.
  if (processPrimeAntarcticGuardV2(state, content)) return;
  if (prime.nextSortieTick !== null && state.tick < prime.nextSortieTick) return;
  const candidate = primeSortieCandidatesV2(state)[0];
  if (candidate) schedulePrimeSortieV2(state, content, candidate);
}

/** Post-war lifecycle: defeat creates a long, deterministic Zero-Point rebuild window. */
export function reconcileRoguePrimeV2(state: WorldStateV2): void {
  const prime = state.polarEndgame.roguePrime ??= createInitialRoguePrimeStateV2();
  if (state.polarEndgame.phase === 'victory'
    || state.territories[ROGUE_PRIME_CORE_TERRITORY_ID_V2]?.owner !== ROGUE_AI_NATION_ID_V2) {
    prime.status = 'destroyed';
    prime.force = null;
    prime.nextSortieTick = null;
    prime.rebuildReadyTick = null;
    clearSortieV2(prime);
    return;
  }
  if (prime.force?.front) {
    const frontValid = prime.status === 'sortie'
      ? sortieFrontStillValidV2(state, prime)
      : primeDefenseFrontValidV2(state, prime.force);
    if (!frontValid) {
      prime.force.front = null;
      prime.force.mission = 'standby';
      if (prime.status !== 'sortie') prime.force.transit = null;
    }
  }
  if (prime.force
    && state.territories[prime.force.locationId]?.owner !== ROGUE_AI_NATION_ID_V2) {
    prime.force.locationId = ROGUE_PRIME_CORE_TERRITORY_ID_V2;
    prime.status = 'guarding';
    prime.sortieSequence += 1;
    prime.nextSortieTick = state.tick + ROGUE_PRIME_SORTIE_COOLDOWN_MIN_TICKS_V2;
    clearSortieV2(prime);
  }
  if (!prime.force || prime.force.shield.integrity > EPSILON) return;
  prime.force = null;
  prime.status = 'rebuilding';
  prime.nextSortieTick = null;
  prime.rebuildReadyTick = state.tick + deterministicPrimeValueV2(
    state,
    prime.sortieSequence,
    0x0b117d,
    ROGUE_PRIME_REBUILD_MIN_TICKS_V2,
    ROGUE_PRIME_REBUILD_MAX_TICKS_V2,
  );
  clearSortieV2(prime);
  state.polarEndgame.visualRevision += 1;
  addWorldEventV2(
    state, 'polar', 'critical',
    `ROGUE PRIME DOWN: Zero Point needs ${prime.rebuildReadyTick - state.tick} days to reconstruct its elite intelligence.`,
    ROGUE_PRIME_CORE_TERRITORY_ID_V2,
    ROGUE_AI_NATION_ID_V2,
    { polarRegion: 'antarctica', polarSectorId: 'zero-point-core' },
  );
}

export function roguePrimeForceAtBattleV2(
  state: WorldStateV2,
): CommanderForceStateV2 | undefined {
  const prime = state.polarEndgame.roguePrime;
  return prime?.status === 'sortie' || prime?.status === 'guarding'
    ? prime.force ?? undefined
    : undefined;
}
