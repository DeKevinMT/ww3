import type { MapArmyState } from '../game/map/bridge';
import { round } from '../sim/v2/balance';
import type { MilitaryBaseSnapshotV2 } from '../sim/v2/selectors';
import type { ArmyStateV2, PlayerId, TerritoryId, TerritoryStateV2 } from '../sim/v2/types';

export interface MapArmyProjectionEngineV2 {
  effectiveAttack(playerId: string, army: ArmyStateV2, snapshot?: MilitaryBaseSnapshotV2): number;
  effectiveDefense(playerId: string, army: ArmyStateV2, snapshot?: MilitaryBaseSnapshotV2): number;
}

/** One local military projection shared by map badges and nameplates. */
export function projectMapArmyV2(
  engine: MapArmyProjectionEngineV2,
  territoryId: TerritoryId,
  territory: TerritoryStateV2,
  militaryBaseSnapshot?: MilitaryBaseSnapshotV2,
): MapArmyState {
  const attack = engine.effectiveAttack(
    territory.owner as PlayerId, territory.army, militaryBaseSnapshot,
  );
  const defense = engine.effectiveDefense(
    territory.owner as PlayerId, territory.army, militaryBaseSnapshot,
  );
  const quality = Math.max(0.000001, 0.55 * attack + 0.45 * defense);
  const combatStrength = round(Math.max(0, territory.army.manpower), 9);
  return {
    manpower: territory.army.manpower,
    capacity: territory.army.capacity,
    combatStrength,
    power: round(1_000 * combatStrength * quality),
    attack,
    defense,
  };
}
