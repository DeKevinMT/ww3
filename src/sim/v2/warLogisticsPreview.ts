import {
  navalRouteDistancePressureV2,
  warAccessOperationMultiplierV2,
  warAccessSupplyMultiplierV2,
} from './balance';
import type { WorldContentV2 } from './content';
import {
  selectWarRouteDistanceKmV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import type { PlayerId, WarAccessV2, WorldStateV2 } from './types';
import { declareWarV2, warDeclarationStatusV2 } from './war';

export interface WarLogisticsPreviewV2 {
  readonly access: WarAccessV2;
  readonly distanceKm?: number;
  /** The declaration itself is currently free; live operations remain recurring. */
  readonly mobilizationCost: number;
  /** Canonical distance-only load before terrain and country-trait adjustments. */
  readonly routeOperationMultiplier: number;
  /** Canonical distance-only supply factor before terrain and country-trait adjustments. */
  readonly routeSupplyMultiplier: number;
  readonly routeDistancePressure: number;
  readonly currentWeeklyWarOperations: number;
  readonly projectedWeeklyWarOperations: number;
  /** Exact first-week delta after applying the declaration to an isolated state copy. */
  readonly additionalWeeklyWarOperations: number;
  readonly campaignsBefore: number;
  readonly campaignsAfter: number;
}

/**
 * Pure, mutation-safe campaign quote used by the attack review. It runs the
 * real declaration and finance paths against a disposable state copy so UI
 * costs cannot drift away from traits, terrain, distance or multi-front rules.
 */
export function previewWarLogisticsV2(
  state: WorldStateV2,
  content: WorldContentV2,
  attackerId: PlayerId,
  defenderId: PlayerId,
): WarLogisticsPreviewV2 {
  const declaration = warDeclarationStatusV2(state, content, attackerId, defenderId);
  const access = declaration.access;
  const distanceKm = access === 'naval'
    ? selectWarRouteDistanceKmV2(state, content, attackerId, defenderId)
    : undefined;
  const currentFinance = selectWeeklyFinanceBreakdownV2(state, content, attackerId);
  const campaignsBefore = state.wars.filter((war) => (
    war.attackerId === attackerId || war.defenderId === attackerId
  )).length;
  let projectedWeeklyWarOperations = currentFinance.warOperations;
  let campaignsAfter = campaignsBefore;

  if (declaration.allowed) {
    const projectedState = structuredClone(state);
    const result = declareWarV2(projectedState, content, attackerId, defenderId);
    if (result.accepted) {
      projectedWeeklyWarOperations = selectWeeklyFinanceBreakdownV2(
        projectedState,
        content,
        attackerId,
      ).warOperations;
      campaignsAfter = projectedState.wars.filter((war) => (
        war.attackerId === attackerId || war.defenderId === attackerId
      )).length;
    }
  }

  const modeledAccess = access === 'none' ? 'land' : access;
  return Object.freeze({
    access,
    distanceKm,
    mobilizationCost: declaration.mobilizationCost,
    routeOperationMultiplier: warAccessOperationMultiplierV2(modeledAccess, distanceKm),
    routeSupplyMultiplier: warAccessSupplyMultiplierV2(modeledAccess, distanceKm),
    routeDistancePressure: access === 'naval' ? navalRouteDistancePressureV2(distanceKm) : 0,
    currentWeeklyWarOperations: currentFinance.warOperations,
    projectedWeeklyWarOperations,
    additionalWeeklyWarOperations: Math.max(
      0,
      projectedWeeklyWarOperations - currentFinance.warOperations,
    ),
    campaignsBefore,
    campaignsAfter,
  });
}
