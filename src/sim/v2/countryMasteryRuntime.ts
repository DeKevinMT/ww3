import { round } from './balance';
import type { WorldContentV2 } from './content';
import { nationIdV2, type PlayerId, type TerritoryId, type WorldStateV2 } from './types';

/**
 * The campaign-frozen military slice of a country loadout. This deliberately
 * mirrors only the fields the simulation owns; meta progression remains the
 * authority that resolves levels and allocations into exact multipliers.
 */
export interface CountryMasteryRuntimeModifiersV2 {
  readonly armyCapacityMultiplier: number;
  readonly attackMultiplier: number;
  readonly defenseMultiplier: number;
  readonly recruitmentMultiplier: number;
  readonly reserveTrainingMultiplier: number;
  readonly landSupplyMultiplier: number;
  readonly landTransferThroughputMultiplier: number;
  readonly navalSupplyMultiplier: number;
  readonly navalTransferThroughputMultiplier: number;
  readonly navalTransferCostMultiplier: number;
  readonly recruitmentCostMultiplier: number;
  readonly standingOperatingCostMultiplier: number;
  readonly casualtyMultiplier: number;
}

/** Older frozen loadouts simply receive neutral values for newly added tracks. */
export type CountryMasteryRuntimeRegistrationV2 = Pick<
  CountryMasteryRuntimeModifiersV2,
  'armyCapacityMultiplier' | 'recruitmentMultiplier' | 'reserveTrainingMultiplier'
> & Partial<Omit<
  CountryMasteryRuntimeModifiersV2,
  'armyCapacityMultiplier' | 'recruitmentMultiplier' | 'reserveTrainingMultiplier'
>>;

export const NEUTRAL_COUNTRY_MASTERY_RUNTIME_MODIFIERS_V2
  : Readonly<CountryMasteryRuntimeModifiersV2> = Object.freeze({
    armyCapacityMultiplier: 1,
    attackMultiplier: 1,
    defenseMultiplier: 1,
    recruitmentMultiplier: 1,
    reserveTrainingMultiplier: 1,
    landSupplyMultiplier: 1,
    landTransferThroughputMultiplier: 1,
    navalSupplyMultiplier: 1,
    navalTransferThroughputMultiplier: 1,
    navalTransferCostMultiplier: 1,
    recruitmentCostMultiplier: 1,
    standingOperatingCostMultiplier: 1,
    casualtyMultiplier: 1,
  });

/**
 * Runtime-only by design. A campaign save freezes its loadouts in the account
 * campaign slot, while canonical WorldState remains deterministic and free of
 * account data. The app re-registers those frozen loadouts when mounting or
 * reconnecting an engine.
 */
const countryMasteryByContentV2 = new WeakMap<
  WorldContentV2,
  Map<PlayerId, Readonly<CountryMasteryRuntimeModifiersV2>>
>();

const canonicalMultiplierV2 = (value: number | undefined): number => round(
  typeof value === 'number' && Number.isFinite(value) ? Math.max(1, value) : 1,
  12,
);

const canonicalReductionMultiplierV2 = (value: number | undefined): number => round(
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0.01, Math.min(1, value)) : 1,
  12,
);

/** Idempotently installs or replaces one active empire member's frozen loadout. */
export function registerCountryMasteryRuntimeV2(
  content: WorldContentV2,
  countryId: string | PlayerId,
  modifiers: CountryMasteryRuntimeRegistrationV2,
): Readonly<CountryMasteryRuntimeModifiersV2> {
  const canonicalCountryId = nationIdV2(countryId);
  if (!content.nations[canonicalCountryId]) {
    throw new Error(`Cannot register Country Mastery for unknown nation ${countryId}.`);
  }
  const canonical = Object.freeze({
    armyCapacityMultiplier: canonicalMultiplierV2(modifiers.armyCapacityMultiplier),
    attackMultiplier: canonicalMultiplierV2(modifiers.attackMultiplier),
    defenseMultiplier: canonicalMultiplierV2(modifiers.defenseMultiplier),
    recruitmentMultiplier: canonicalMultiplierV2(modifiers.recruitmentMultiplier),
    reserveTrainingMultiplier: canonicalMultiplierV2(modifiers.reserveTrainingMultiplier),
    landSupplyMultiplier: canonicalMultiplierV2(modifiers.landSupplyMultiplier),
    landTransferThroughputMultiplier: canonicalMultiplierV2(
      modifiers.landTransferThroughputMultiplier,
    ),
    navalSupplyMultiplier: canonicalMultiplierV2(modifiers.navalSupplyMultiplier),
    navalTransferThroughputMultiplier: canonicalMultiplierV2(
      modifiers.navalTransferThroughputMultiplier,
    ),
    navalTransferCostMultiplier: canonicalReductionMultiplierV2(
      modifiers.navalTransferCostMultiplier,
    ),
    recruitmentCostMultiplier: canonicalReductionMultiplierV2(
      modifiers.recruitmentCostMultiplier,
    ),
    standingOperatingCostMultiplier: canonicalReductionMultiplierV2(
      modifiers.standingOperatingCostMultiplier,
    ),
    casualtyMultiplier: canonicalReductionMultiplierV2(modifiers.casualtyMultiplier),
  });
  let registry = countryMasteryByContentV2.get(content);
  if (!registry) {
    registry = new Map();
    countryMasteryByContentV2.set(content, registry);
  }
  registry.set(canonicalCountryId, canonical);
  return canonical;
}

/**
 * Clears the runtime boundary before a different campaign is mounted with the
 * same static Campaign content object. Omitting countryId starts a fresh engine
 * roster without mutating any save or profile.
 */
export function resetCountryMasteryRuntimeV2(
  content: WorldContentV2,
  countryId?: string | PlayerId,
): void {
  if (countryId === undefined) {
    countryMasteryByContentV2.delete(content);
    return;
  }
  const registry = countryMasteryByContentV2.get(content);
  registry?.delete(nationIdV2(countryId));
  if (registry?.size === 0) countryMasteryByContentV2.delete(content);
}

export function selectRegisteredCountryMasteryRuntimeV2(
  content: WorldContentV2,
  countryId: string | PlayerId,
): Readonly<CountryMasteryRuntimeModifiersV2> | undefined {
  return countryMasteryByContentV2.get(content)?.get(nationIdV2(countryId));
}

/**
 * An empire may use a member country's own mastery only while its current
 * owner is itself an explicitly registered active roster member. This prevents
 * an AI occupier from inheriting the player's account progression. Unregistered
 * conquered territory falls back to the flagship/current owner's mastery.
 */
export function selectTerritoryCountryMasteryRuntimeV2(
  content: WorldContentV2,
  territoryId: TerritoryId,
  currentOwnerId: PlayerId,
): Readonly<CountryMasteryRuntimeModifiersV2> {
  const registry = countryMasteryByContentV2.get(content);
  const ownerModifiers = registry?.get(currentOwnerId);
  if (!ownerModifiers) return NEUTRAL_COUNTRY_MASTERY_RUNTIME_MODIFIERS_V2;
  const originalOwnerId = content.territories[territoryId]?.initialOwnerId;
  return originalOwnerId !== undefined
    ? registry?.get(originalOwnerId) ?? ownerModifiers
    : ownerModifiers;
}

export interface CountryMasteryReplenishmentRuntimeV2 {
  readonly recruitmentMultiplier: number;
  readonly reserveTrainingMultiplier: number;
}

export interface CountryMasteryNationalRuntimeV2
  extends CountryMasteryReplenishmentRuntimeV2 {
  readonly attackMultiplier: number;
  readonly defenseMultiplier: number;
  readonly recruitmentCostMultiplier: number;
  readonly standingOperatingCostMultiplier: number;
}

/**
 * Exact integrated-population blend for a federation/Survival roster. It uses
 * the original member loadout per productive territory and the flagship
 * fallback for ordinary Campaign conquests. Callers provide productive IDs so
 * scorched Survival transit corridors never create training throughput.
 */
export function selectCountryMasteryNationalRuntimeV2(
  state: WorldStateV2,
  content: WorldContentV2,
  ownerId: PlayerId,
  productiveTerritoryIds: readonly TerritoryId[],
): Readonly<CountryMasteryNationalRuntimeV2> {
  const ownerModifiers = selectRegisteredCountryMasteryRuntimeV2(content, ownerId);
  if (!ownerModifiers) return NEUTRAL_COUNTRY_MASTERY_RUNTIME_MODIFIERS_V2;

  let totalWeight = 0;
  let recruitment = 0;
  let reserveTraining = 0;
  let attack = 0;
  let defense = 0;
  let recruitmentCost = 0;
  let standingOperatingCost = 0;
  for (const territoryId of productiveTerritoryIds) {
    const territory = state.territories[territoryId];
    if (!territory || territory.owner !== ownerId) continue;
    // This is the same live labor basis as the structural army-cap rule. It is
    // intentionally independent of mastery capacity itself, so Force points do
    // not silently re-weight the separate Mobilization track.
    const weight = Math.max(0, territory.population) * Math.max(0, Math.min(1, territory.integration));
    if (weight <= 0) continue;
    const modifiers = selectTerritoryCountryMasteryRuntimeV2(
      content,
      territoryId,
      ownerId,
    );
    totalWeight += weight;
    recruitment += modifiers.recruitmentMultiplier * weight;
    reserveTraining += modifiers.reserveTrainingMultiplier * weight;
    attack += modifiers.attackMultiplier * weight;
    defense += modifiers.defenseMultiplier * weight;
    recruitmentCost += modifiers.recruitmentCostMultiplier * weight;
    standingOperatingCost += modifiers.standingOperatingCostMultiplier * weight;
  }
  if (totalWeight <= 0) return ownerModifiers;
  return Object.freeze({
    recruitmentMultiplier: round(recruitment / totalWeight, 12),
    reserveTrainingMultiplier: round(reserveTraining / totalWeight, 12),
    attackMultiplier: round(attack / totalWeight, 12),
    defenseMultiplier: round(defense / totalWeight, 12),
    recruitmentCostMultiplier: round(recruitmentCost / totalWeight, 12),
    standingOperatingCostMultiplier: round(standingOperatingCost / totalWeight, 12),
  });
}

export function selectCountryMasteryReplenishmentRuntimeV2(
  state: WorldStateV2,
  content: WorldContentV2,
  ownerId: PlayerId,
  productiveTerritoryIds: readonly TerritoryId[],
): Readonly<CountryMasteryReplenishmentRuntimeV2> {
  const national = selectCountryMasteryNationalRuntimeV2(
    state,
    content,
    ownerId,
    productiveTerritoryIds,
  );
  return Object.freeze({
    recruitmentMultiplier: national.recruitmentMultiplier,
    reserveTrainingMultiplier: national.reserveTrainingMultiplier,
  });
}
