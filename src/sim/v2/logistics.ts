import { clamp, round } from './balance';
import type { WarAccessV2 } from './types';

/**
 * The entire logistics contract in two numbers. Every weekly land connection
 * and every land battle can move/field twenty percent of the source country's
 * local Army Capacity. Sea routes carry exactly half that amount.
 */
export const LAND_ARMY_CAPACITY_SUPPLY_SHARE_V2 = 0.20;
export const NAVAL_ARMY_CAPACITY_SUPPLY_SHARE_V2 = 0.10;

/** Logistics is intentionally cheap and never becomes a movement gate. */
export const LAND_LOGISTICS_COST_PER_MILLION_V2 = 0.0005;
export const NAVAL_LOGISTICS_COST_PER_MILLION_V2 = 0.001;

export interface ArmyCapacitySupplyQuoteV2 {
  readonly access: Exclude<WarAccessV2, 'none'>;
  /** Share of the source Army Capacity available for this hop/attack. */
  readonly capacityShare: number;
  /** Nominal manpower this hop/attack can carry. */
  readonly capacityBudget: number;
  /** Manpower currently available inside that nominal budget. */
  readonly delivered: number;
  /** 0..1: 100% means the complete capacity budget can be delivered. */
  readonly readiness: number;
  readonly costPerMillion: number;
}

export function armyCapacitySupplyShareV2(
  access: Exclude<WarAccessV2, 'none'>,
): number {
  return access === 'naval'
    ? NAVAL_ARMY_CAPACITY_SUPPLY_SHARE_V2
    : LAND_ARMY_CAPACITY_SUPPLY_SHARE_V2;
}

export function armyCapacitySupplyBudgetV2(
  armyCapacity: number,
  access: Exclude<WarAccessV2, 'none'>,
): number {
  return round(
    Math.max(0, Number.isFinite(armyCapacity) ? armyCapacity : 0)
      * armyCapacitySupplyShareV2(access),
    9,
  );
}

/**
 * Canonical supply quote shared by redistribution, live combat, forecasts and
 * the HUD. No distance, treasury or hidden willingness factor can disagree
 * with this result.
 */
export function quoteArmyCapacitySupplyV2(
  armyCapacity: number,
  availableManpower: number,
  access: Exclude<WarAccessV2, 'none'>,
): ArmyCapacitySupplyQuoteV2 {
  const capacityBudget = armyCapacitySupplyBudgetV2(armyCapacity, access);
  const available = Math.max(
    0,
    Number.isFinite(availableManpower) ? availableManpower : 0,
  );
  const delivered = round(Math.min(capacityBudget, available), 9);
  return Object.freeze({
    access,
    capacityShare: armyCapacitySupplyShareV2(access),
    capacityBudget,
    delivered,
    readiness: round(
      capacityBudget > 0 ? clamp(delivered / capacityBudget, 0, 1) : 0,
      9,
    ),
    costPerMillion: access === 'naval'
      ? NAVAL_LOGISTICS_COST_PER_MILLION_V2
      : LAND_LOGISTICS_COST_PER_MILLION_V2,
  });
}

export function armyCapacitySupplyLabelV2(
  access: Exclude<WarAccessV2, 'none'>,
): '20% CAP / ATTACK' | '10% CAP / ATTACK · NAVAL' {
  return access === 'naval' ? '10% CAP / ATTACK · NAVAL' : '20% CAP / ATTACK';
}
