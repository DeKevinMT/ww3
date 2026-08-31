import {
  CONQUEST_INITIAL_INTEGRATION_SHARE,
  INTEGRATION_ADMINISTRATION_ANNUAL_OUTPUT_SHARE,
  RESEARCH_BRANCH_EFFECTS,
  RESEARCH_BRANCHES,
  WEEKS_PER_YEAR,
  clamp,
  round,
} from './balance';
import {
  synchronizeArmyCapacityV2,
} from './capacity';
import {
  ROGUE_AI_NATION_ID_V2,
  territoryTerrainTypesV2,
  type WorldContentV2,
} from './content';
import { addWorldEventV2 } from './events';
import { isHumanPlayerV2, selectHumanPlayerIdsV2 } from './humanPlayers';
import {
  selectApexSignalPurgeFocusV2,
  selectApexSignalPurgeQueueV2,
} from './apexSignalPurgeFocus';
import { selectNorthPoleModifiersV2 } from './northPoleModifiers';
import {
  retirePolarNationReferencesV2,
} from './polarEndgame';
import { invalidateNationIndexV2, invalidateTerritoryIndexV2 } from './selectors';
import { composeTraitContextV2, traitNationContextV2 } from './traitContext';
import { countryTraitFactorV2, type TraitEvaluationContextV2 } from './traits';
import {
  territoryIdV2,
  type PlayerId,
  type TerritoryId,
  type WarAccessV2,
  type WorldStateV2,
} from './types';

interface SizeAxesV2 {
  population: number;
  economy: number;
  area: number;
}

const sizeBoundsCache = new WeakMap<WorldContentV2, { min: SizeAxesV2; max: SizeAxesV2 }>();

/**
 * Signal Purge is now a campaign-paced liberation project rather than a
 * multi-generation occupation. The immutable size curve runs from one year
 * for the smallest countries to six years for the single largest country.
 * APEX priority bandwidth then compresses that work to roughly four months up
 * to two years, while secondary network relays remain deliberately slower.
 */
const SMALL_COUNTRY_INTEGRATION_YEARS = 1;
const INTEGRATION_LINEAR_YEARS = 2;
const INTEGRATION_QUADRATIC_YEARS = 1.5;
const INTEGRATION_LARGE_COUNTRY_YEARS = 1.5;
/**
 * Compatibility ratio used only to authenticate and exercise schema-18 save
 * migration. New Signal Purge quotes use the direct curve above, not this
 * retired release multiplier.
 */
export const INTEGRATION_DURATION_MULTIPLIER_V2 = 0.82;
/** Voluntary defensive unions complete four times faster than conquest. */
export const FEDERATION_INTEGRATION_DURATION_FACTOR_V2 = 0.25;
/** Rogue-only Survival brainwashing: visible, bounded, and never instant. */
export const SURVIVAL_ROGUE_RAPID_ASSIMILATION_DURATION_FACTOR_V2 = 0.25;

/**
 * Administration price frozen from the territory's live output at conquest.
 * Later growth or war damage never changes this promised annual bill.
 */
export function territoryIntegrationAnnualCostV2(
  economyBillions: number,
): number {
  return round(Math.max(0, economyBillions)
    * INTEGRATION_ADMINISTRATION_ANNUAL_OUTPUT_SHARE, 9);
}

export function territoryIntegrationWeeklyCostV2(economyBillions: number): number {
  return round(territoryIntegrationAnnualCostV2(economyBillions) / WEEKS_PER_YEAR, 9);
}

function logarithmicSize(value: number): number {
  return Math.log1p(Math.max(0, value));
}

function sizeBoundsV2(content: WorldContentV2): { min: SizeAxesV2; max: SizeAxesV2 } {
  const cached = sizeBoundsCache.get(content);
  if (cached) return cached;
  const axes = content.territoryIds.map((id) => {
    const baseline = content.territories[id]?.baseline;
    return {
      population: logarithmicSize(baseline?.population ?? 0),
      economy: logarithmicSize(baseline?.gdp ?? 0),
      area: logarithmicSize(baseline?.landArea ?? 0),
    };
  });
  const bounds = {
    min: {
      population: Math.min(...axes.map((item) => item.population)),
      economy: Math.min(...axes.map((item) => item.economy)),
      area: Math.min(...axes.map((item) => item.area)),
    },
    max: {
      population: Math.max(...axes.map((item) => item.population)),
      economy: Math.max(...axes.map((item) => item.economy)),
      area: Math.max(...axes.map((item) => item.area)),
    },
  };
  sizeBoundsCache.set(content, bounds);
  return bounds;
}

function normalizeAxis(value: number, min: number, max: number): number {
  return max > min ? clamp((value - min) / (max - min), 0, 1) : 0;
}

/**
 * Immutable country size used by the integration calendar. Live war damage,
 * growth and ownership never shorten or lengthen a conquest after the fact.
 */
export function territoryIntegrationSizeV2(content: WorldContentV2, territoryId: TerritoryId): number {
  const baseline = content.territories[territoryId]?.baseline;
  if (!baseline) return 0;
  const bounds = sizeBoundsV2(content);
  const population = normalizeAxis(
    logarithmicSize(baseline.population), bounds.min.population, bounds.max.population,
  );
  const economy = normalizeAxis(
    logarithmicSize(baseline.gdp), bounds.min.economy, bounds.max.economy,
  );
  const area = normalizeAxis(
    logarithmicSize(baseline.landArea), bounds.min.area, bounds.max.area,
  );
  return round(0.50 * population + 0.30 * economy + 0.20 * area, 12);
}

export function territoryIntegrationDurationWeeksV2(
  content: WorldContentV2,
  territoryId: TerritoryId,
): number {
  // Quote directly from immutable baseline size. Once this whole-week value is
  // copied into an integration program, later balance changes, war damage and
  // save round-trips cannot move that program's promised completion week.
  const luxembourgId = territoryIdV2('lux');
  const luxembourgSize = content.territories[luxembourgId]
    ? territoryIntegrationSizeV2(content, luxembourgId) : 0;
  const size = territoryIntegrationSizeV2(content, territoryId);
  const relativeSize = clamp(
    (size - luxembourgSize) / Math.max(0.000001, 1 - luxembourgSize),
    0,
    1,
  );
  const years = SMALL_COUNTRY_INTEGRATION_YEARS
    + INTEGRATION_LINEAR_YEARS * relativeSize
    + INTEGRATION_QUADRATIC_YEARS * relativeSize ** 2
    + INTEGRATION_LARGE_COUNTRY_YEARS * relativeSize ** 4;
  return Math.round(years * WEEKS_PER_YEAR);
}

export function territoryIntegrationGainPerWeekV2(
  content: WorldContentV2,
  territoryId: TerritoryId,
): number {
  return (1 - CONQUEST_INITIAL_INTEGRATION_SHARE)
    / territoryIntegrationDurationWeeksV2(content, territoryId);
}

/** Canonical calendar-only integration step, shared by simulation and tests. */
export function advanceTerritoryIntegrationV2(
  content: WorldContentV2,
  territoryId: TerritoryId,
  currentShare: number,
  weeks = 1,
): number {
  return round(clamp(
    currentShare + territoryIntegrationGainPerWeekV2(content, territoryId) * Math.max(0, weeks),
    0,
    1,
  ), 12);
}

export interface IntegrationCompletionV2 {
  territoryId: TerritoryId;
  formerCoreOwnerId: PlayerId;
  ownerId: PlayerId;
}

/** Remote neural relays continue every purge without pretending APEX is physically present. */
export const APEX_SIGNAL_PURGE_RELAY_PERCENT_V2 = 50;
/** APEX priority bandwidth turns one calendar week into three weeks of purge work. */
export const APEX_SIGNAL_PURGE_ON_SITE_SPEED_V2 = 3;
/** A supplied live front contributes exactly one third of APEX's focused work rate. */
export const APEX_SIGNAL_PURGE_FRONT_SPEED_V2 = 1;
const APEX_SIGNAL_PURGE_RELAY_WINDOW_TICKS_V2 = 10;
const APEX_SIGNAL_PURGE_RELAY_PRODUCTIVE_TICKS_V2 = Math.round(
  APEX_SIGNAL_PURGE_RELAY_WINDOW_TICKS_V2
    * APEX_SIGNAL_PURGE_RELAY_PERCENT_V2 / 100,
);

export type ApexSignalPurgeModeV2 =
  | 'network-focus'
  /** Deprecated compatibility modes; the distributed network never emits these. */
  | 'on-site'
  | 'en-route'
  | 'relay'
  | 'front'
  | 'paused-front'
  | 'standard';

export interface ApexSignalPurgeStatusV2 {
  territoryId: TerritoryId;
  ownerId: PlayerId;
  mode: ApexSignalPurgeModeV2;
  label: string;
  focused: boolean;
  /** Calendar ETA under the present network/front state; absent only while front supply is lost. */
  projectedCompletesTick?: number;
  remainingWeeks?: number;
}

function apexSignalPurgeRelayOffsetV2(territoryId: TerritoryId): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < territoryId.length; index += 1) {
    hash = Math.imul(hash ^ territoryId.charCodeAt(index), 16_777_619) >>> 0;
  }
  return hash % APEX_SIGNAL_PURGE_RELAY_WINDOW_TICKS_V2;
}

/** Exactly 50 productive relay weeks in every 100-week span, with no RNG or save field. */
export function apexSignalPurgeRelayActiveV2(
  territoryId: TerritoryId,
  tick: number,
): boolean {
  const phase = ((Math.trunc(tick) + apexSignalPurgeRelayOffsetV2(territoryId))
    % APEX_SIGNAL_PURGE_RELAY_WINDOW_TICKS_V2
    + APEX_SIGNAL_PURGE_RELAY_WINDOW_TICKS_V2)
    % APEX_SIGNAL_PURGE_RELAY_WINDOW_TICKS_V2;
  return phase < APEX_SIGNAL_PURGE_RELAY_PRODUCTIVE_TICKS_V2;
}

function apexSignalPurgeNetworkStateV2(
  state: WorldStateV2,
  ownerId: PlayerId,
): {
  focused: boolean;
  legacyWithoutForce: boolean;
} {
  const force = state.commanderForces?.[ownerId];
  const ownerAtWar = state.wars.some((war) => (
    war.attackerId === ownerId || war.defenderId === ownerId
  ));
  const focused = Boolean(force
    && state.players[ownerId]
    && force.shield.integrity > 0.000000001
    && force.mission !== 'evacuate'
    && force.mission !== 'hq-training'
    // The distributed network always protects live wars first. A supplied
    // purge front keeps 1x work and remote nodes keep their relay cadence;
    // full 3x focus resumes automatically as soon as the Empire is at peace.
    && !ownerAtWar);
  return {
    focused,
    // Pre-APEX authenticated saves and focused simulation fixtures never had
    // a force. Keep their already-promised calendar unchanged.
    legacyWithoutForce: !force,
  };
}

interface ApexSignalPurgeFrontStateV2 {
  active: boolean;
  supplied: boolean;
}

/**
 * A front relay is earned only by a canonical operation that actually touches
 * this owner's territory, has local troops and belongs to a fed national
 * logistics network. Rear territory and unrelated AI operations never qualify.
 */
function apexSignalPurgeFrontStateV2(
  state: WorldStateV2,
  ownerId: PlayerId,
  territoryId: TerritoryId,
): ApexSignalPurgeFrontStateV2 {
  const territory = state.territories[territoryId];
  const owner = state.players[ownerId];
  if (!territory || territory.owner !== ownerId || !owner) {
    return { active: false, supplied: false };
  }
  let active = false;
  for (const war of state.wars) {
    const enemyId = war.attackerId === ownerId
      ? war.defenderId
      : war.defenderId === ownerId ? war.attackerId : undefined;
    if (!enemyId) continue;
    for (const operation of [...war.attackerOperations, ...war.defenderOperations]) {
      const sourceOwner = state.territories[operation.sourceId]?.owner;
      const targetOwner = state.territories[operation.targetId]?.owner;
      const friendlyTerritoryId = sourceOwner === ownerId && targetOwner === enemyId
        ? operation.sourceId
        : targetOwner === ownerId && sourceOwner === enemyId
          ? operation.targetId
          : undefined;
      if (friendlyTerritoryId !== territoryId) continue;
      active = true;
      if (territory.army.manpower > 0.000000001) {
        return { active: true, supplied: true };
      }
    }
  }
  return { active, supplied: false };
}

export { selectApexSignalPurgeFocusV2 } from './apexSignalPurgeFocus';

function relayCompletionTickV2(
  territoryId: TerritoryId,
  afterTick: number,
  productiveWeeks: number,
): number {
  if (productiveWeeks <= 0) return afterTick;
  // Whole relay windows are phase invariant and contain a fixed amount of
  // weeks. Skip them arithmetically so even a very large purge queue remains
  // cheap to project in the HUD.
  const wholeWindows = Math.floor(
    (productiveWeeks - 1) / APEX_SIGNAL_PURGE_RELAY_PRODUCTIVE_TICKS_V2,
  );
  let tick = afterTick + wholeWindows * APEX_SIGNAL_PURGE_RELAY_WINDOW_TICKS_V2;
  let completed = wholeWindows * APEX_SIGNAL_PURGE_RELAY_PRODUCTIVE_TICKS_V2;
  while (completed < productiveWeeks) {
    tick += 1;
    if (apexSignalPurgeRelayActiveV2(territoryId, tick)) completed += 1;
  }
  return tick;
}

function relayProductiveWeeksV2(
  territoryId: TerritoryId,
  afterTick: number,
  calendarWeeks: number,
): number {
  if (calendarWeeks <= 0) return 0;
  const wholeWindows = Math.floor(calendarWeeks / APEX_SIGNAL_PURGE_RELAY_WINDOW_TICKS_V2);
  let productiveWeeks = wholeWindows * APEX_SIGNAL_PURGE_RELAY_PRODUCTIVE_TICKS_V2;
  const remainderStart = afterTick
    + wholeWindows * APEX_SIGNAL_PURGE_RELAY_WINDOW_TICKS_V2;
  for (let offset = 1;
    offset <= calendarWeeks % APEX_SIGNAL_PURGE_RELAY_WINDOW_TICKS_V2;
    offset += 1) {
    if (apexSignalPurgeRelayActiveV2(territoryId, remainderStart + offset)) {
      productiveWeeks += 1;
    }
  }
  return productiveWeeks;
}

/**
 * Compact, truthful presentation model. The same work rates drive both the
 * live simulation and these ETAs: focused network bandwidth 3×, supplied fronts 1× and
 * remote neural relay 50%. Only a genuinely unsupplied live front has no ETA.
 */
export function selectApexSignalPurgeStatusesV2(
  state: WorldStateV2,
  content: WorldContentV2,
  ownerId: PlayerId,
): readonly ApexSignalPurgeStatusV2[] {
  const humanQueue = selectApexSignalPurgeQueueV2(state, content, ownerId);
  if (humanQueue.length === 0) {
    return content.territoryIds.flatMap((territoryId) => {
      const territory = state.territories[territoryId];
      const program = territory?.integrationProgram;
      if (!territory || !program || territory.owner !== ownerId || program.toOwnerId !== ownerId) {
        return [];
      }
      const projectedCompletesTick = Math.max(state.tick, program.completesTick);
      return [{
        territoryId,
        ownerId,
        mode: 'standard' as const,
        label: 'INTEGRATING',
        focused: false,
        projectedCompletesTick,
        remainingWeeks: Math.max(0, projectedCompletesTick - state.tick),
      }];
    });
  }

  return humanQueue.map((territoryId, index) => {
    const territory = state.territories[territoryId]!;
    const program = territory.integrationProgram!;
    const front = apexSignalPurgeFrontStateV2(state, ownerId, territoryId);
    // Old authenticated saves may contain a frozen 12-year promise. Cap its
    // remaining work to today's authored curve; the authoritative advance path
    // applies the same cap on its next tick.
    const productiveWeeks = Math.max(0, Math.min(
      program.completesTick - state.tick,
      territoryIntegrationDurationWeeksV2(content, territoryId),
    ));
    const focused = index === 0;
    const network = focused
      ? apexSignalPurgeNetworkStateV2(state, ownerId)
      : { focused: false, legacyWithoutForce: false };
    let mode: ApexSignalPurgeModeV2;
    let label: string;
    if (focused && network.focused) {
      mode = 'network-focus';
      label = `EONSCAR PRIORITY PURGE · ${APEX_SIGNAL_PURGE_ON_SITE_SPEED_V2}×`;
    } else if (front.supplied) {
      mode = 'front';
      label = `FRONT PURGE · ${APEX_SIGNAL_PURGE_FRONT_SPEED_V2}×`;
    } else if (front.active) {
      mode = 'paused-front';
      label = 'WAITING FOR FRONT SUPPLY';
    } else if (focused && network.legacyWithoutForce) {
      mode = 'standard';
      label = 'INTEGRATING';
    } else {
      mode = 'relay';
      label = `REMOTE RELAY ${APEX_SIGNAL_PURGE_RELAY_PERCENT_V2}%`;
    }

    let projectedCompletesTick: number | undefined;
    if (mode !== 'paused-front') {
      if (mode === 'network-focus') {
        projectedCompletesTick = state.tick
          + Math.ceil(productiveWeeks / APEX_SIGNAL_PURGE_ON_SITE_SPEED_V2);
      } else if (mode === 'standard' || mode === 'front') {
        projectedCompletesTick = state.tick + productiveWeeks;
      } else {
        projectedCompletesTick = relayCompletionTickV2(
          territoryId,
          state.tick,
          productiveWeeks,
        );
      }
    }
    return {
      territoryId,
      ownerId,
      mode,
      label,
      focused,
      projectedCompletesTick,
      remainingWeeks: projectedCompletesTick === undefined
        ? undefined : Math.max(0, projectedCompletesTick - state.tick),
    };
  });
}

/**
 * Narrative hand-off: callers key their exactly-once transmission to the
 * returned territory id. A result exists only after the distributed APEX
 * network has committed priority bandwidth and the full-speed purge is active.
 */
export function selectApexSignalPurgeArrivalV2(
  state: WorldStateV2,
  content: WorldContentV2,
  ownerId: PlayerId,
): ApexSignalPurgeStatusV2 | undefined {
  return selectApexSignalPurgeStatusesV2(state, content, ownerId)
    .find((status) => status.focused && status.mode === 'network-focus');
}

export function selectApexSignalPurgeStatusV2(
  state: WorldStateV2,
  content: WorldContentV2,
  territoryId: TerritoryId,
): ApexSignalPurgeStatusV2 | undefined {
  const ownerId = state.territories[territoryId]?.owner;
  if (!ownerId) return undefined;
  return selectApexSignalPurgeStatusesV2(state, content, ownerId)
    .find((status) => status.territoryId === territoryId);
}

export type TerritoryIntegrationCauseV2 = 'conquest' | 'federation';
export type TerritoryIntegrationAccessV2 = Exclude<WarAccessV2, 'none'>;

export interface TerritoryIntegrationQuoteOptionsV2 {
  readonly cause: TerritoryIntegrationCauseV2;
  readonly access?: TerritoryIntegrationAccessV2;
}

export interface TerritoryIntegrationQuoteV2 {
  readonly territoryId: TerritoryId;
  readonly newOwnerId: PlayerId;
  readonly cause: TerritoryIntegrationCauseV2;
  readonly access?: TerritoryIntegrationAccessV2;
  /** Derived before ownership changes, without adding any persisted schema. */
  readonly firstConquest: boolean;
  /** One-time human-seat discount; independent from country-trait first-conquest conditions. */
  readonly firstPlayerIntegrationDiscount: boolean;
  readonly durationWeeks: number;
  readonly annualCost: number;
}

type TerritoryIntegrationStartOptionsV2 =
  | TerritoryIntegrationAccessV2
  | { readonly access?: TerritoryIntegrationAccessV2 };

function ownedForeignOpeningHomelandV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): boolean {
  return content.territoryIds.some((ownedTerritoryId) => {
    const openingOwnerId = content.territories[ownedTerritoryId]?.initialOwnerId;
    return state.territories[ownedTerritoryId]?.owner === playerId
      && openingOwnerId !== undefined
      && openingOwnerId !== playerId;
  });
}

function integrationAccessV2(
  accessOrOptions?: TerritoryIntegrationStartOptionsV2,
): TerritoryIntegrationAccessV2 | undefined {
  return typeof accessOrOptions === 'string' ? accessOrOptions : accessOrOptions?.access;
}

/**
 * Quotes the immutable calendar and administration bill while the target still
 * has its old owner. Only the active leader (`newOwnerId`) contributes a trait;
 * a conquered or federating member can therefore never donate or stack traits.
 */
export function quoteTerritoryIntegrationV2(
  state: WorldStateV2,
  content: WorldContentV2,
  territoryId: TerritoryId,
  newOwnerId: PlayerId,
  options: TerritoryIntegrationQuoteOptionsV2 = { cause: 'conquest' },
): TerritoryIntegrationQuoteV2 {
  const territory = state.territories[territoryId];
  const definition = content.territories[territoryId];
  const sovereignRecapture = territory?.coreOwner === newOwnerId;
  const firstConquest = !sovereignRecapture && options.cause === 'conquest'
    && !ownedForeignOpeningHomelandV2(state, content, newOwnerId);
  const firstPlayerIntegrationDiscount = !sovereignRecapture
    && options.cause === 'conquest'
    && isHumanPlayerV2(state, newOwnerId)
    && !state.firstIntegrationDiscountUsedBy.includes(newOwnerId);
  // Runtime restores a country's own sovereign core immediately. Exposing the
  // same zero quote keeps War Command from promising a calendar or bill that
  // beginTerritoryIntegrationWithCauseV2 will never create.
  if (sovereignRecapture) {
    return {
      territoryId,
      newOwnerId,
      cause: options.cause,
      access: options.access,
      firstConquest: false,
      firstPlayerIntegrationDiscount: false,
      durationWeeks: 0,
      annualCost: 0,
    };
  }
  const atWar = state.wars.some((war) => (
    war.attackerId === newOwnerId || war.defenderId === newOwnerId
  ));
  const leader = state.players[newOwnerId];
  const context: TraitEvaluationContextV2 = composeTraitContextV2(
    traitNationContextV2(state, newOwnerId),
    {
    access: options.access,
    terrain: definition?.terrain,
    terrains: Object.freeze([...territoryTerrainTypesV2(content, territoryId)]),
    homeland: definition?.initialOwnerId === newOwnerId,
    firstConquest,
    atWar,
    treasury: leader?.treasury,
    foodSecurity: leader?.foodSecurity,
    },
  );
  const federationFactor = options.cause === 'federation'
    ? FEDERATION_INTEGRATION_DURATION_FACTOR_V2
    : 1;
  const rapidAssimilationFactor = options.cause === 'conquest'
    && content.metadata?.scenarioId === 'survival'
    && newOwnerId === ROGUE_AI_NATION_ID_V2
    ? SURVIVAL_ROGUE_RAPID_ASSIMILATION_DURATION_FACTOR_V2
    : 1;
  const durationFactor = countryTraitFactorV2(
    newOwnerId,
    'integration-duration',
    context,
  );
  const costFactor = countryTraitFactorV2(
    newOwnerId,
    'integration-cost',
    context,
  );
  // Cognitive Firewall is a run-local investigation benefit. Apply it while
  // quoting so the immutable completion tick records the exact calendar once;
  // later research or ownership changes cannot retroactively move that date.
  const signalPurgeDurationFactor = selectNorthPoleModifiersV2(
    state,
    newOwnerId,
  ).signalPurgeDurationMultiplier;
  return {
    territoryId,
    newOwnerId,
    cause: options.cause,
    access: options.access,
    firstConquest,
    firstPlayerIntegrationDiscount,
    durationWeeks: Math.max(1, Math.round(
      territoryIntegrationDurationWeeksV2(content, territoryId)
        * federationFactor
        * rapidAssimilationFactor
        * durationFactor
        * signalPurgeDurationFactor,
    )),
    annualCost: round(
      territoryIntegrationAnnualCostV2(territory?.economy ?? 0)
        * costFactor
        * (firstPlayerIntegrationDiscount ? 0.25 : 1),
      9,
    ),
  };
}

/**
 * Starts one immutable integration calendar. A sovereign-core recapture is the
 * only case that restores full access immediately.
 */
function beginTerritoryIntegrationWithCauseV2(
  state: WorldStateV2,
  content: WorldContentV2,
  territoryId: TerritoryId,
  newOwnerId: PlayerId,
  cause: TerritoryIntegrationCauseV2,
  access?: TerritoryIntegrationAccessV2,
): void {
  const territory = state.territories[territoryId];
  if (!territory) return;
  const formerOwnerId = territory.owner;
  if (territory.coreOwner === newOwnerId) {
    territory.owner = newOwnerId;
    territory.integration = 1;
    delete territory.integrationProgram;
    invalidateTerritoryIndexV2(state);
    synchronizeArmyCapacityV2(state, content);
    return;
  }
  const quote = quoteTerritoryIntegrationV2(
    state,
    content,
    territoryId,
    newOwnerId,
    { cause, access },
  );
  territory.owner = newOwnerId;
  territory.integration = CONQUEST_INITIAL_INTEGRATION_SHARE;
  territory.integrationProgram = {
    cause,
    fromOwnerId: formerOwnerId,
    fromCoreOwnerId: territory.coreOwner,
    toOwnerId: newOwnerId,
    startedTick: state.tick,
    completesTick: state.tick + quote.durationWeeks,
    annualCost: quote.annualCost,
  };
  if (quote.firstPlayerIntegrationDiscount) {
    state.firstIntegrationDiscountUsedBy = [
      ...state.firstIntegrationDiscountUsedBy,
      newOwnerId,
    ].sort((left, right) => left.localeCompare(right));
  }
  invalidateTerritoryIndexV2(state);
  synchronizeArmyCapacityV2(state, content);
}

export function beginTerritoryIntegrationV2(
  state: WorldStateV2,
  content: WorldContentV2,
  territoryId: TerritoryId,
  newOwnerId: PlayerId,
  accessOrOptions?: TerritoryIntegrationStartOptionsV2,
): void {
  beginTerritoryIntegrationWithCauseV2(
    state,
    content,
    territoryId,
    newOwnerId,
    'conquest',
    integrationAccessV2(accessOrOptions),
  );
}

/**
 * A coalition member retains every live local and national value while its
 * peaceful federation proceeds through the same visible core-fusion model.
 */
export function beginFederationTerritoryIntegrationV2(
  state: WorldStateV2,
  content: WorldContentV2,
  territoryId: TerritoryId,
  newOwnerId: PlayerId,
  accessOrOptions?: TerritoryIntegrationStartOptionsV2,
): void {
  beginTerritoryIntegrationWithCauseV2(
    state,
    content,
    territoryId,
    newOwnerId,
    'federation',
    integrationAccessV2(accessOrOptions),
  );
}

function nationStillHasBackendIdentityV2(
  state: WorldStateV2,
  playerId: PlayerId,
): boolean {
  return Object.values(state.territories).some((territory) => (
    territory.owner === playerId
      || territory.coreOwner === playerId
      || territory.integrationProgram?.fromOwnerId === playerId
      || territory.integrationProgram?.fromCoreOwnerId === playerId
      || territory.integrationProgram?.toOwnerId === playerId
  )) || state.wars.some((war) => war.attackerId === playerId || war.defenderId === playerId);
}

/**
 * Permanently folds a vanished sovereign into its successor. Territory-held
 * population, output, armies and capacity already belong to the owner, so only
 * genuinely national stores are transferred before the old backend record is
 * removed.
 */
export function retireAbsorbedNationV2(
  state: WorldStateV2,
  content: WorldContentV2,
  formerNationId: PlayerId,
  ownerId: PlayerId,
  mergeKnowledge = true,
): boolean {
  if (formerNationId === ownerId) return false;
  // A country that owns land, retains a core or remains referenced by any
  // unfinished integration is still a real institution and cannot retire yet.
  if (nationStillHasBackendIdentityV2(state, formerNationId)) return false;
  const former = state.players[formerNationId];
  const canonicalSuccessorId = absorbedNationSuccessorV2(
    state,
    content,
    formerNationId,
  ) ?? ownerId;
  const owner = state.players[canonicalSuccessorId] ?? state.players[ownerId];
  if (!former || !owner) return false;
  // Legacy expedition records are retired without recreating the removed
  // national reserve pool.
  retirePolarNationReferencesV2(state, formerNationId);
  // Survival conquests now use the same store and knowledge transfer as every
  // ordinary conquest; the retired zero-corridor registry grants no exception.
  owner.treasury = round(owner.treasury + former.treasury);
  former.treasury = 0;
  former.trainedReserves = 0;
  owner.trainedReserves = 0;
  if (mergeKnowledge) {
    for (const branch of RESEARCH_BRANCHES) {
      owner.research.progress[branch] = round(Math.max(
        owner.research.progress[branch],
        former.research.progress[branch],
      ));
      owner.research.breakthroughs[branch] = Math.max(
        owner.research.breakthroughs[branch],
        former.research.breakthroughs[branch],
      );
      for (const effect of RESEARCH_BRANCH_EFFECTS[branch]) {
        owner.research.effectLevels[effect] = Math.max(
          owner.research.effectLevels[effect],
          former.research.effectLevels[effect],
        );
      }
    }
  }
  state.aiEscalation.coalitionMembers = state.aiEscalation.coalitionMembers
    .filter((id) => id !== formerNationId);
  state.truces = state.truces.filter((truce) => (
    truce.leftId !== formerNationId && truce.rightId !== formerNationId
  ));
  state.offers = state.offers.filter((offer) => (
    offer.fromId !== formerNationId && offer.toId !== formerNationId
  ));
  state.ceasefireObligations = state.ceasefireObligations.filter((obligation) => (
    obligation.payerId !== formerNationId && obligation.payeeId !== formerNationId
  ));
  // Focused simulations and legacy callers may still replace only the primary
  // id. Canonicalise that effective roster before retirement decisions so a
  // stale bootstrap seat cannot masquerade as a second living human.
  const humanPlayerIds = [...selectHumanPlayerIdsV2(state)];
  state.humanPlayerIds = humanPlayerIds;
  // One defeated seat becomes a spectator without ending the shared campaign.
  // The legacy/global focus moves deterministically to another living human;
  // only the loss of every human-controlled country ends the room.
  if (isHumanPlayerV2(state, formerNationId)) {
    const livingHumanId = humanPlayerIds
      .filter((playerId) => playerId !== formerNationId && Boolean(state.players[playerId]))
      .sort((left, right) => left.localeCompare(right))[0];
    if (formerNationId === state.humanPlayerId && livingHumanId) {
      state.humanPlayerId = livingHumanId;
      state.aiEscalation.lastHumanTerritoryCount = Object.values(state.territories)
        .filter((territory) => territory.owner === livingHumanId).length;
      state.aiEscalation.lastHumanPower = 0;
    }
    if (!livingHumanId) {
      state.winnerId = owner === state.players[canonicalSuccessorId]
        ? canonicalSuccessorId : ownerId;
      state.gameOver = true;
      state.speed = 0;
    }
  }
  const persistentHumanApex = isHumanPlayerV2(state, formerNationId)
    ? state.commanderForces[formerNationId]
    : undefined;
  if (persistentHumanApex) {
    // APEX survives its country's terminal timeline as an inert narrator. It
    // owns no territory, contributes no front power and does not prevent the
    // ordinary national backend from retiring or the campaign from ending.
    persistentHumanApex.mission = 'standby';
    persistentHumanApex.orderSource = 'autonomous';
    persistentHumanApex.manualHoldUntilTick = 0;
    persistentHumanApex.front = null;
    persistentHumanApex.transit = null;
  } else {
    delete state.commanderForces[formerNationId];
  }
  delete state.players[formerNationId];
  invalidateNationIndexV2(state);
  return true;
}

/** Finds the present owner holding most of an absorbed country's home cores. */
export function absorbedNationSuccessorV2(
  state: WorldStateV2,
  content: WorldContentV2,
  formerNationId: PlayerId,
): PlayerId | undefined {
  const successors = new Map<PlayerId, number>();
  for (const territoryId of content.territoryIds) {
    if (content.territories[territoryId]?.initialOwnerId !== formerNationId) continue;
    const ownerId = state.territories[territoryId]?.owner;
    if (ownerId && ownerId !== formerNationId) {
      successors.set(ownerId, (successors.get(ownerId) ?? 0) + 1);
    }
  }
  return [...successors]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];
}

/**
 * Same-schema saves from before true backend fusion may contain already
 * absorbed nation records. Remove those zombies deterministically on load.
 */
export function retireDormantAbsorbedNationsV2(
  state: WorldStateV2,
  content: WorldContentV2,
): void {
  for (const formerNationId of (Object.keys(state.players) as PlayerId[])
    .sort((left, right) => left.localeCompare(right))) {
    if (nationStillHasBackendIdentityV2(state, formerNationId)) continue;
    const ownerId = absorbedNationSuccessorV2(state, content, formerNationId);
    // Knowledge uses maxima, so repeating this merge while normalising an old
    // save is idempotent and also preserves exiles that vanished before their
    // research had ever reached the successor.
    if (ownerId) retireAbsorbedNationV2(state, content, formerNationId, ownerId);
  }
}

/**
 * Advances every active program by one calendar week and performs the single
 * permanent core-identity transfer exactly on its promised completion tick.
 */
export function advanceTerritoryIntegrationProgramsV2(
  state: WorldStateV2,
  content: WorldContentV2,
): IntegrationCompletionV2[] {
  const completions: IntegrationCompletionV2[] = [];
  const humanFocusByOwner = new Map<PlayerId, TerritoryId>();
  for (const ownerId of selectHumanPlayerIdsV2(state)) {
    const focusId = selectApexSignalPurgeFocusV2(state, content, ownerId);
    if (focusId) humanFocusByOwner.set(ownerId, focusId);
  }

  for (const territoryId of content.territoryIds) {
    const territory = state.territories[territoryId];
    const program = territory?.integrationProgram;
    if (!territory || !program || state.tick <= program.startedTick) continue;
    if (isHumanPlayerV2(state, territory.owner) && program.toOwnerId === territory.owner) {
      const focused = humanFocusByOwner.get(territory.owner) === territoryId;
      const front = apexSignalPurgeFrontStateV2(
        state,
        territory.owner,
        territoryId,
      );
      // A same-schema save can carry the old multi-decade frozen endpoint.
      // Bound remaining work once, using the exact curve also used by the HUD,
      // without touching already-earned integration progress.
      program.completesTick = Math.min(
        program.completesTick,
        state.tick + territoryIntegrationDurationWeeksV2(content, territoryId),
      );
      const network = focused
        ? apexSignalPurgeNetworkStateV2(state, territory.owner)
        : { focused: false, legacyWithoutForce: false };
      const apexPriorityBoost = focused && network.focused;
      const frontWork = !apexPriorityBoost && front.supplied;
      const standardLegacyWork = focused
        && network.legacyWithoutForce
        && !front.active;
      const remoteRelayWork = !apexPriorityBoost
        && !frontWork
        && !standardLegacyWork
        && !front.active
        && apexSignalPurgeRelayActiveV2(territoryId, state.tick);
      const workRate = apexPriorityBoost
        ? APEX_SIGNAL_PURGE_ON_SITE_SPEED_V2
        : frontWork ? APEX_SIGNAL_PURGE_FRONT_SPEED_V2
          : standardLegacyWork || remoteRelayWork ? 1 : 0;
      if (workRate <= 0) {
        // A remote relay's inactive cadence week or an unsupplied live front
        // preserves remaining work. Other valid fronts continue independently.
        program.completesTick += 1;
        continue;
      }
      if (workRate > 1) {
        // The ordinary calendar step below supplies one unit of work. Pulling
        // the immutable endpoint forward supplies the remaining rate units
        // while preserving already-earned progress across travel, war and save.
        program.completesTick = Math.max(
          state.tick,
          program.completesTick - (workRate - 1),
        );
      }
    }
    if (state.tick < program.completesTick) {
      // This remaining-distance step preserves migrated progress while still
      // landing on the immutable endpoint without accumulated rounding drift.
      const remainingSteps = program.completesTick - state.tick + 1;
      territory.integration = round(clamp(
        territory.integration + (1 - territory.integration) / remainingSteps,
        CONQUEST_INITIAL_INTEGRATION_SHARE,
        1,
      ), 12);
      continue;
    }
    const formerCoreOwnerId = program.fromCoreOwnerId;
    const ownerId = territory.owner;
    const formerName = state.players[formerCoreOwnerId]?.empireName
      || content.nations[formerCoreOwnerId]?.shortName || formerCoreOwnerId;
    const ownerName = state.players[ownerId]?.empireName
      || content.nations[ownerId]?.shortName || ownerId;
    territory.integration = 1;
    territory.coreOwner = ownerId;
    delete territory.integrationProgram;
    for (const formerNationId of new Set([
      program.fromOwnerId,
      formerCoreOwnerId,
    ])) retireAbsorbedNationV2(state, content, formerNationId, ownerId);
    const rogueRapidAssimilation = content.metadata?.scenarioId === 'survival'
      && ownerId === ROGUE_AI_NATION_ID_V2;
    addWorldEventV2(
      state,
      'conquest',
      isHumanPlayerV2(state, ownerId) ? 'action' : 'info',
      isHumanPlayerV2(state, ownerId)
        ? `EONSCAR completed the Signal Purge in ${formerName}; it is now permanent core territory in liberated ${ownerName}.`
        : rogueRapidAssimilation
          ? `RAPID ASSIMILATION complete: ${formerName} is now a permanent Rogue-controlled core.`
          : `${formerName} completed integration into ${ownerName} and is now permanent core territory.`,
      territoryId,
      ownerId,
    );
    completions.push({ territoryId, formerCoreOwnerId, ownerId });
  }
  // The capacity model is owner-specific. Final core fusion can retire a
  // sovereign and change the live leader context, so persist the resulting
  // local caps before invariants, saves or multiplayer snapshots observe it.
  if (completions.length > 0) synchronizeArmyCapacityV2(state, content);
  return completions;
}
