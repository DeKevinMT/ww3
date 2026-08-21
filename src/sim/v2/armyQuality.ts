import { round } from './balance';
import type { WorldContentV2 } from './content';
import type { ArmyStateV2, PlayerId, TerritoryId } from './types';

export interface ArmyBaseQualityV2 {
  attack: number;
  defense: number;
}

export function nationArmyBaseQualityV2(
  content: WorldContentV2,
  playerId: PlayerId,
): ArmyBaseQualityV2 {
  const nation = content.nations[playerId];
  return {
    attack: nation?.militaryAttackRating ?? nation?.militaryQuality ?? 1,
    defense: nation?.militaryDefenseRating ?? nation?.militaryQuality ?? 1,
  };
}

/** Local recruits always inherit the original military profile of their land. */
export function localArmyBaseQualityV2(
  content: WorldContentV2,
  territoryId: TerritoryId,
): ArmyBaseQualityV2 {
  const initialOwnerId = content.territories[territoryId]?.initialOwnerId;
  return initialOwnerId
    ? nationArmyBaseQualityV2(content, initialOwnerId)
    : { attack: 1, defense: 1 };
}

/** Mix incoming soldiers into one canonical manpower-weighted army average. */
export function mixArmyBaseQualityV2(
  army: Pick<ArmyStateV2, 'manpower' | 'baseAttack' | 'baseDefense'>,
  incomingManpower: number,
  incoming: ArmyBaseQualityV2,
): void {
  const added = Math.max(0, incomingManpower);
  if (added <= 0) return;
  const existing = Math.max(0, army.manpower);
  const total = existing + added;
  army.baseAttack = round((existing * army.baseAttack + added * incoming.attack) / total, 9);
  army.baseDefense = round((existing * army.baseDefense + added * incoming.defense) / total, 9);
}

/** Add soldiers without exceeding local capacity, returning the actual addition. */
export function addArmyManpowerWithQualityV2(
  army: ArmyStateV2,
  requestedManpower: number,
  incoming: ArmyBaseQualityV2,
): number {
  const added = Math.min(
    Math.max(0, requestedManpower),
    Math.max(0, army.capacity - army.manpower),
  );
  if (added <= 0) return 0;
  mixArmyBaseQualityV2(army, added, incoming);
  army.manpower = round(army.manpower + added, 9);
  return added;
}

/** An empty garrison is ready to recruit from its local population again. */
export function resetEmptyArmyBaseQualityV2(
  army: ArmyStateV2,
  content: WorldContentV2,
  territoryId: TerritoryId,
): void {
  if (army.manpower > 0.000000001) return;
  const local = localArmyBaseQualityV2(content, territoryId);
  army.manpower = 0;
  army.baseAttack = local.attack;
  army.baseDefense = local.defense;
}
