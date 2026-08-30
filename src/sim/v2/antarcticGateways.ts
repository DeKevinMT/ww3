import { ANTARCTIC_GATEWAY_COUNTRY_ROUTES_V2 } from './content';
import type {
  AntarcticGatewayBreachStateV2,
  AntarcticSectorIdV2,
  TerritoryId,
  WorldStateV2,
} from './types';
import { territoryIdV2 } from './types';

export const ANTARCTIC_GATEWAY_IDS_V2 = Object.freeze([
  'drake-entry',
  'maud-entry',
  'ross-entry',
] as const satisfies readonly AntarcticSectorIdV2[]);

export const SURVIVAL_FIRST_GATEWAY_BREACH_TICKS_V2 = 6;
export const CAMPAIGN_FIRST_GATEWAY_BREACH_TICKS_V2 = 13;
export const LATER_GATEWAY_BREACH_TICKS_V2 = 13;

/** The gateway-sector ids deliberately share their authored string with a
 * real territory. Keep the brand conversion in one typed boundary instead of
 * scattering casts through combat, events and presentation code. */
export function antarcticGatewayTerritoryIdV2(
  gatewayId: AntarcticSectorIdV2,
): TerritoryId {
  return territoryIdV2(gatewayId);
}

function seededGatewayHashV2(seed: number, gatewayId: AntarcticSectorIdV2): number {
  let hash = (seed ^ 0x9e3779b9) >>> 0;
  for (let index = 0; index < gatewayId.length; index += 1) {
    hash = Math.imul(hash ^ gatewayId.charCodeAt(index), 0x45d9f3b) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d) >>> 0;
  hash ^= hash >>> 15;
  return hash >>> 0;
}

/** Stable random-looking permutation: same seed, save, host and reconnect. */
export function deterministicAntarcticGatewayOrderV2(
  seed: number,
): AntarcticSectorIdV2[] {
  return [...ANTARCTIC_GATEWAY_IDS_V2].sort((left, right) => (
    seededGatewayHashV2(seed, left) - seededGatewayHashV2(seed, right)
      || left.localeCompare(right)
  ));
}

function freshBreachV2(gatewayId: AntarcticSectorIdV2): AntarcticGatewayBreachStateV2 {
  return {
    gatewayId,
    status: 'sealed',
    breachStartedTick: null,
    opensTick: null,
    openedTick: null,
  };
}

export function initializeAntarcticGatewayBreachesV2(
  state: WorldStateV2,
  firstBreachDelayTicks: number,
): void {
  prepareAntarcticGatewayBreachesV2(state);
  const anyStarted = ANTARCTIC_GATEWAY_IDS_V2.some((gatewayId) => (
    state.polarEndgame.gatewayBreaches[gatewayId]?.status !== 'sealed'
  ));
  if (anyStarted) return;
  scheduleAntarcticGatewayBreachV2(
    state,
    0,
    Math.max(1, Math.floor(firstBreachDelayTicks)),
  );
}

/** Reveals the seeded order while keeping all physical routes sealed. */
export function prepareAntarcticGatewayBreachesV2(state: WorldStateV2): void {
  const canonicalOrder = deterministicAntarcticGatewayOrderV2(state.seed);
  const existingOrder = state.polarEndgame.gatewayBreachOrder;
  const validExisting = existingOrder.length === ANTARCTIC_GATEWAY_IDS_V2.length
    && ANTARCTIC_GATEWAY_IDS_V2.every((gatewayId) => existingOrder.includes(gatewayId));
  if (!validExisting) state.polarEndgame.gatewayBreachOrder = canonicalOrder;
  for (const gatewayId of ANTARCTIC_GATEWAY_IDS_V2) {
    state.polarEndgame.gatewayBreaches[gatewayId] ??= freshBreachV2(gatewayId);
  }
}

/** Starts exactly one breach; a second cannot overwrite the active ETA. */
export function scheduleAntarcticGatewayBreachV2(
  state: WorldStateV2,
  orderIndex: number,
  durationTicks = LATER_GATEWAY_BREACH_TICKS_V2,
): AntarcticSectorIdV2 | null {
  if (Object.values(state.polarEndgame.gatewayBreaches)
    .some((breach) => breach?.status === 'breaching')) return null;
  const gatewayId = state.polarEndgame.gatewayBreachOrder[orderIndex];
  if (!gatewayId) return null;
  const breach = state.polarEndgame.gatewayBreaches[gatewayId] ?? freshBreachV2(gatewayId);
  state.polarEndgame.gatewayBreaches[gatewayId] = breach;
  if (breach.status !== 'sealed') return null;
  breach.status = 'breaching';
  breach.breachStartedTick = state.tick;
  breach.opensTick = state.tick + Math.max(1, Math.floor(durationTicks));
  breach.openedTick = null;
  state.polarEndgame.visualRevision += 1;
  return gatewayId;
}

/** Completes at most the currently prepared breach. Open gateways never close. */
export function processAntarcticGatewayBreachesV2(
  state: WorldStateV2,
): AntarcticSectorIdV2[] {
  const opened: AntarcticSectorIdV2[] = [];
  for (const gatewayId of state.polarEndgame.gatewayBreachOrder) {
    const breach = state.polarEndgame.gatewayBreaches[gatewayId];
    if (!breach || breach.status !== 'breaching' || breach.opensTick === null
      || breach.opensTick > state.tick) continue;
    breach.status = 'open';
    breach.openedTick = state.tick;
    opened.push(gatewayId);
    state.polarEndgame.visualRevision += 1;
  }
  return opened;
}

export function antarcticGatewayBreachStateV2(
  state: Pick<WorldStateV2, 'polarEndgame'>,
  gatewayId: AntarcticSectorIdV2,
): AntarcticGatewayBreachStateV2 | undefined {
  return state.polarEndgame.gatewayBreaches[gatewayId];
}

export function isAntarcticGatewayOpenV2(
  state: Pick<WorldStateV2, 'polarEndgame'>,
  gatewayId: AntarcticSectorIdV2,
): boolean {
  return state.polarEndgame.gatewayBreaches[gatewayId]?.status === 'open';
}

export function antarcticGatewayForConnectionV2(
  sourceId: TerritoryId,
  targetId: TerritoryId,
): AntarcticSectorIdV2 | null {
  for (const route of ANTARCTIC_GATEWAY_COUNTRY_ROUTES_V2) {
    const gatewayId = territoryIdV2(route.gatewayId);
    if ((sourceId === gatewayId && targetId === route.countryId)
      || (sourceId === route.countryId && targetId === gatewayId)) {
      return route.gatewayId as AntarcticSectorIdV2;
    }
  }
  return null;
}

/** Normal edges are unchanged; authored Antarctic sea edges obey breach state. */
export function isWorldConnectionOpenV2(
  state: Pick<WorldStateV2, 'polarEndgame'>,
  sourceId: TerritoryId,
  targetId: TerritoryId,
): boolean {
  const gatewayId = antarcticGatewayForConnectionV2(sourceId, targetId);
  return gatewayId === null || isAntarcticGatewayOpenV2(state, gatewayId);
}
