import { clamp, round } from './balance';
import { resetEmptyArmyBaseQualityV2 } from './armyQuality';
import type { WorldContentV2 } from './content';
import type { ArmyStateV2, PlayerId, TerritoryId, WorldStateV2 } from './types';

/** Every player-only opening army/cap adjustment returns to neutral over 1,560 daily ticks. */
export const OPENING_ARMY_BONUS_DURATION_TICKS_V2 = 1_560;

const MANPOWER_PRECISION_V2 = 9;
const MANPOWER_EPSILON_V2 = 0.000000001;

interface OwnedArmyV2 {
  territoryId: TerritoryId;
  army: ArmyStateV2;
}

function sortedOwnedArmiesV2(
  state: WorldStateV2,
  ownerId: PlayerId,
): OwnedArmyV2[] {
  return (Object.keys(state.territories) as TerritoryId[])
    .sort((left, right) => left.localeCompare(right))
    .filter((territoryId) => state.territories[territoryId]?.owner === ownerId)
    .map((territoryId) => ({
      territoryId,
      army: state.territories[territoryId]!.army,
    }));
}

function deployedManpowerV2(armies: readonly OwnedArmyV2[]): number {
  return round(armies.reduce(
    (sum, { army }) => sum + Math.max(0, army.manpower),
    0,
  ), MANPOWER_PRECISION_V2);
}

/** Visible surviving temporary opening manpower for one nation. */
export function selectOpeningArmyBonusRemainingV2(
  state: WorldStateV2,
  playerId: PlayerId,
): number {
  const remaining = state.players[playerId]?.openingArmyBonus?.remainingManpower;
  return round(
    Number.isFinite(remaining) ? Math.max(0, remaining ?? 0) : 0,
    MANPOWER_PRECISION_V2,
  );
}

/**
 * Accounts an already-applied national manpower loss against temporary troops
 * first. This changes metadata only: the combat/demobilisation caller remains
 * responsible for removing the physical army manpower exactly once.
 */
export function consumeOpeningArmyBonusLossV2(
  state: WorldStateV2,
  ownerId: PlayerId,
  manpowerLoss: number,
): number {
  const nation = state.players[ownerId];
  const bonus = nation?.openingArmyBonus;
  if (!nation || !bonus || !Number.isFinite(manpowerLoss) || manpowerLoss <= 0) return 0;

  const remaining = selectOpeningArmyBonusRemainingV2(state, ownerId);
  const consumed = round(Math.min(remaining, manpowerLoss), MANPOWER_PRECISION_V2);
  const nextRemaining = round(Math.max(0, remaining - consumed), MANPOWER_PRECISION_V2);
  if (nextRemaining <= MANPOWER_EPSILON_V2) {
    nation.openingArmyBonus = null;
  } else {
    bonus.remainingManpower = nextRemaining;
  }
  return consumed;
}

/**
 * Keeps temporary metadata bounded by manpower the nation still physically
 * owns. Returns the reconciled remaining amount.
 */
export function reconcileOpeningArmyBonusV2(
  state: WorldStateV2,
  ownerId: PlayerId,
): number {
  const nation = state.players[ownerId];
  const bonus = nation?.openingArmyBonus;
  if (!nation || !bonus) return 0;

  const deployed = deployedManpowerV2(sortedOwnedArmiesV2(state, ownerId));
  const remaining = round(
    Math.min(selectOpeningArmyBonusRemainingV2(state, ownerId), deployed),
    MANPOWER_PRECISION_V2,
  );
  if (remaining <= MANPOWER_EPSILON_V2) {
    nation.openingArmyBonus = null;
    return 0;
  }
  bonus.remainingManpower = remaining;
  return remaining;
}

/**
 * Removes national manpower proportionally. Sorted territory order makes ties
 * deterministic; the largest formation absorbs only the rounding remainder.
 */
function removeOwnedManpowerProportionallyV2(
  state: WorldStateV2,
  content: WorldContentV2,
  ownerId: PlayerId,
  requestedRemoval: number,
): number {
  const armies = sortedOwnedArmiesV2(state, ownerId)
    .filter(({ army }) => army.manpower > MANPOWER_EPSILON_V2);
  const deployedBefore = deployedManpowerV2(armies);
  const removal = round(
    Math.min(deployedBefore, Math.max(0, requestedRemoval)),
    MANPOWER_PRECISION_V2,
  );
  if (deployedBefore <= MANPOWER_EPSILON_V2 || removal <= 0 || armies.length === 0) return 0;

  const deployedAfterTarget = round(
    Math.max(0, deployedBefore - removal),
    MANPOWER_PRECISION_V2,
  );
  const retainedShare = deployedAfterTarget / deployedBefore;
  const anchor = armies.reduce((largest, entry) => (
    entry.army.manpower > largest.army.manpower ? entry : largest
  ));

  let otherDeployedAfter = 0;
  for (const entry of armies) {
    if (entry === anchor) continue;
    entry.army.manpower = round(
      Math.max(0, entry.army.manpower * retainedShare),
      MANPOWER_PRECISION_V2,
    );
    otherDeployedAfter += entry.army.manpower;
    resetEmptyArmyBaseQualityV2(entry.army, content, entry.territoryId);
  }
  anchor.army.manpower = round(clamp(
    deployedAfterTarget - otherDeployedAfter,
    0,
    anchor.army.manpower,
  ), MANPOWER_PRECISION_V2);
  resetEmptyArmyBaseQualityV2(anchor.army, content, anchor.territoryId);

  const deployedAfter = deployedManpowerV2(armies);
  return round(Math.max(0, deployedBefore - deployedAfter), MANPOWER_PRECISION_V2);
}

/**
 * Applies the linear thirty-year entitlement cap to every active opening bonus.
 * Earlier casualties lower `remainingManpower`, so calendar decay waits until
 * the descending entitlement drops below those surviving temporary troops.
 * Returns the physical manpower retired during this tick.
 */
export function processOpeningArmyBonusDecayV2(
  state: WorldStateV2,
  content: WorldContentV2,
): number {
  let totalRetired = 0;
  const playerIds = (Object.keys(state.players) as PlayerId[])
    .sort((left, right) => left.localeCompare(right));

  for (const playerId of playerIds) {
    const currentRemaining = reconcileOpeningArmyBonusV2(state, playerId);
    const bonus = state.players[playerId]?.openingArmyBonus;
    if (!bonus || currentRemaining <= 0) continue;

    const remainingTicks = clamp(
      bonus.expiresTick - state.tick,
      0,
      OPENING_ARMY_BONUS_DURATION_TICKS_V2,
    );
    const initialManpower = Number.isFinite(bonus.initialManpower)
      ? Math.max(0, bonus.initialManpower)
      : 0;
    const scheduledRemaining = round(
      initialManpower * remainingTicks / OPENING_ARMY_BONUS_DURATION_TICKS_V2,
      MANPOWER_PRECISION_V2,
    );
    const requestedRetirement = round(
      Math.max(0, currentRemaining - scheduledRemaining),
      MANPOWER_PRECISION_V2,
    );
    if (requestedRetirement <= 0) continue;

    const retired = removeOwnedManpowerProportionallyV2(
      state,
      content,
      playerId,
      requestedRetirement,
    );
    consumeOpeningArmyBonusLossV2(state, playerId, retired);
    totalRetired += retired;

    // Covers rounding and ownership changes without ever increasing the pool.
    reconcileOpeningArmyBonusV2(state, playerId);
  }

  return round(totalRetired, MANPOWER_PRECISION_V2);
}
