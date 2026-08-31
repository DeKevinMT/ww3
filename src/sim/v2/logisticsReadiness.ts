import { BATTLE_INTERVAL_TICKS, clamp, round } from './balance';
import type { WorldContentV2 } from './content';
import {
  armyCapacitySupplyBudgetV2,
  armyCapacitySupplyLabelV2,
  armyCapacitySupplyShareV2,
} from './logistics';
import { supplyFactorV2 } from './war';
import { selectTerritoryRouteDistanceKmV2 } from './selectors';
import type {
  FrontOperationV2,
  PlayerId,
  TerritoryId,
  WarAccessV2,
  WorldStateV2,
} from './types';

export type LogisticsReadinessStatusV2 = 'idle' | 'ready' | 'strained' | 'critical';

export const LOGISTICS_READY_THRESHOLD_V2 = 0.72;
export const LOGISTICS_STRAINED_THRESHOLD_V2 = 0.50;

export interface LogisticsReadinessPresentationV2 {
  readonly factor: number;
  readonly percent: number;
  readonly status: LogisticsReadinessStatusV2;
  readonly statusLabel: 'READY' | 'STRAINED' | 'CRITICAL' | 'NO WAR';
  readonly limitingReason: string;
}

export interface FrontLogisticsReadinessV2 extends LogisticsReadinessPresentationV2 {
  /** Exact canonical combat supply before an empty source is classified as unavailable. */
  readonly supplyFactor: number;
  readonly warId: string;
  readonly sourceId: TerritoryId;
  readonly targetId: TerritoryId;
  readonly access: Exclude<WarAccessV2, 'none'>;
  readonly routeLabel: 'LAND ROUTE' | 'NAVAL ROUTE';
  readonly capacityShare: number;
  readonly capacityBudget: number;
  readonly ruleLabel: '10% CAP / ATTACK' | '5% CAP / ATTACK · NAVAL';
  readonly distanceKm: number;
  readonly nextBattleWeeks: number;
  readonly weight: number;
}

export interface EmpireLogisticsReadinessV2 extends LogisticsReadinessPresentationV2 {
  readonly frontCount: number;
  readonly weakest: FrontLogisticsReadinessV2 | null;
  readonly fronts: readonly FrontLogisticsReadinessV2[];
}

export function logisticsReadinessStatusV2(factor: number): LogisticsReadinessStatusV2 {
  const bounded = clamp(factor, 0, 1);
  if (bounded >= LOGISTICS_READY_THRESHOLD_V2) return 'ready';
  if (bounded >= LOGISTICS_STRAINED_THRESHOLD_V2) return 'strained';
  return 'critical';
}

export function presentLogisticsReadinessV2(
  factor: number,
  access: Exclude<WarAccessV2, 'none'> = 'land',
  distanceKm = 0,
  hasSupportingArmy = true,
): LogisticsReadinessPresentationV2 {
  const bounded = hasSupportingArmy ? clamp(factor, 0, 1) : 0;
  const status = logisticsReadinessStatusV2(bounded);
  let limitingReason = access === 'naval' ? '5% Army Capacity per attack' : '10% Army Capacity per attack';
  if (!hasSupportingArmy) limitingReason = 'No army available';
  else if (status === 'critical') limitingReason = 'Front demand mostly unfunded';
  else if (status === 'strained') limitingReason = 'Front demand partly supplied';
  return {
    factor: round(bounded, 6),
    percent: Math.round(bounded * 100),
    status,
    statusLabel: status === 'ready' ? 'READY' : status === 'strained' ? 'STRAINED' : 'CRITICAL',
    limitingReason,
  };
}

function operationReadinessV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  warId: string,
  operation: FrontOperationV2,
): FrontLogisticsReadinessV2 {
  const factor = supplyFactorV2(
    state,
    content,
    playerId,
    operation.sourceId,
    operation.access,
    operation.targetId,
  );
  const sourceManpower = Math.max(0, state.territories[operation.sourceId]?.army.manpower ?? 0);
  const sourceCapacity = Math.max(
    sourceManpower,
    state.territories[operation.sourceId]?.army.capacity ?? 0,
  );
  const distanceKm = round(selectTerritoryRouteDistanceKmV2(
    content,
    operation.sourceId,
    operation.targetId,
  ) ?? 0, 3);
  const presentation = presentLogisticsReadinessV2(
    factor,
    operation.access,
    distanceKm,
    sourceManpower > 0.000000001,
  );
  return {
    ...presentation,
    supplyFactor: round(factor, 6),
    warId,
    sourceId: operation.sourceId,
    targetId: operation.targetId,
    access: operation.access,
    routeLabel: operation.access === 'naval' ? 'NAVAL ROUTE' : 'LAND ROUTE',
    capacityShare: armyCapacitySupplyShareV2(operation.access),
    capacityBudget: armyCapacitySupplyBudgetV2(sourceCapacity, operation.access),
    ruleLabel: armyCapacitySupplyLabelV2(operation.access),
    distanceKm,
    nextBattleWeeks: Math.max(0, operation.lastBattleTick + BATTLE_INTERVAL_TICKS - state.tick),
    weight: Math.max(0.01, armyCapacitySupplyBudgetV2(sourceCapacity, operation.access)),
  };
}

/**
 * Canonical player-facing logistics view. Every active-front factor is read
 * from the same `supplyFactorV2` used by combat; this module only adds stable
 * labels, weighting and concise limiting reasons.
 */
export function selectEmpireLogisticsReadinessV2(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
): EmpireLogisticsReadinessV2 {
  const fronts = state.wars.flatMap((war) => {
    const operations = war.attackerId === playerId
      ? war.attackerOperations
      : war.defenderId === playerId ? war.defenderOperations : [];
    return operations
      .filter((operation) => operation.commanderId === playerId)
      .map((operation) => operationReadinessV2(state, content, playerId, war.id, operation));
  }).sort((left, right) => left.factor - right.factor
    || left.warId.localeCompare(right.warId)
    || left.targetId.localeCompare(right.targetId));
  if (fronts.length === 0) {
    return {
      factor: 0,
      percent: 0,
      status: 'idle',
      statusLabel: 'NO WAR',
      limitingReason: 'No active war supply demand',
      frontCount: 0,
      weakest: null,
      fronts,
    };
  }
  const totalWeight = fronts.reduce((sum, front) => sum + front.weight, 0);
  const factor = fronts.reduce((sum, front) => sum + front.factor * front.weight, 0)
    / Math.max(0.000001, totalWeight);
  return {
    ...presentLogisticsReadinessV2(factor),
    limitingReason: fronts[0]!.limitingReason,
    frontCount: fronts.length,
    weakest: fronts[0]!,
    fronts,
  };
}
