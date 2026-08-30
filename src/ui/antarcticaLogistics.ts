import { round } from '../sim/v2/balance';
import type { WorldContentV2 } from '../sim/v2/content';
import type {
  LogisticsMovementV2,
  PlayerId,
  WorldStateV2,
} from '../sim/v2/types';
import { selectCanonicalWarFrontsV2 } from '../sim/v2/selectors';
import { supplyFactorV2 } from '../sim/v2/war';

export interface RogueLogisticsTelemetryV2 {
  readonly movementCount: number;
  readonly movedManpower: number;
  readonly antarcticMovementCount: number;
  readonly antarcticMovedManpower: number;
  readonly navalMovementCount: number;
  readonly navalMovedManpower: number;
  readonly navalCost: number;
  readonly navalMeanDistanceKm: number;
  readonly frontOperationCount: number;
  readonly averageFrontSupply: number;
  readonly weakestFrontSupply: number;
}

/**
 * Read-only, one-week telemetry for the Rogue Empire panel. Every value comes
 * from either the live war operations or the exact movements already charged
 * by the simulation; nothing here creates a parallel logistics state.
 */
export function selectRogueLogisticsTelemetryV2(
  state: WorldStateV2,
  content: WorldContentV2,
  rogueId: PlayerId,
  movements: readonly LogisticsMovementV2[],
): RogueLogisticsTelemetryV2 {
  const rogueMovements = movements.filter((movement) => movement.playerId === rogueId);
  const antarcticMovements = rogueMovements.filter((movement) => (
    content.territories[movement.sourceId]?.regionId === 'antarctica'
      || content.territories[movement.targetId]?.regionId === 'antarctica'
  ));
  const navalMovements = rogueMovements.filter((movement) => movement.access === 'naval');
  const movedManpower = rogueMovements.reduce(
    (sum, movement) => sum + Math.max(0, movement.manpower),
    0,
  );
  const navalMovedManpower = navalMovements.reduce(
    (sum, movement) => sum + Math.max(0, movement.manpower),
    0,
  );
  const navalDistanceWeight = navalMovedManpower > 0
    ? navalMovedManpower : navalMovements.length;
  const navalMeanDistanceKm = navalDistanceWeight > 0
    ? navalMovements.reduce((sum, movement) => (
      sum + Math.max(0, movement.distanceKm)
        * (navalMovedManpower > 0 ? Math.max(0, movement.manpower) : 1)
    ), 0) / navalDistanceWeight
    : 0;
  const operations = state.wars.flatMap((war) => (
    [...selectCanonicalWarFrontsV2(war)]
  )).filter((operation) => (
    operation.commanderId === rogueId
      && state.territories[operation.sourceId]?.owner === rogueId
      && state.territories[operation.targetId]?.owner !== rogueId
  ));
  const supply = operations.map((operation) => supplyFactorV2(
    state,
    content,
    rogueId,
    operation.sourceId,
    operation.access,
    operation.targetId,
  ));
  return Object.freeze({
    movementCount: rogueMovements.length,
    movedManpower: round(movedManpower, 9),
    antarcticMovementCount: antarcticMovements.length,
    antarcticMovedManpower: round(antarcticMovements.reduce(
      (sum, movement) => sum + Math.max(0, movement.manpower),
      0,
    ), 9),
    navalMovementCount: navalMovements.length,
    navalMovedManpower: round(navalMovedManpower, 9),
    navalCost: round(navalMovements.reduce(
      (sum, movement) => sum + Math.max(0, movement.logisticsCost),
      0,
    ), 9),
    navalMeanDistanceKm: round(navalMeanDistanceKm, 3),
    frontOperationCount: operations.length,
    averageFrontSupply: round(
      supply.length > 0 ? supply.reduce((sum, value) => sum + value, 0) / supply.length : 0,
      9,
    ),
    weakestFrontSupply: round(supply.length > 0 ? Math.min(...supply) : 0, 9),
  });
}
