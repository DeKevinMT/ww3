import type { MapArmyState } from '../game/map/bridge';
import type { ArmyStateV2, PlayerId, TerritoryId, TerritoryStateV2 } from '../sim/v2/types';

export interface MapArmyProjectionEngineV2 {
  effectiveAttack(playerId: string, army: ArmyStateV2): number;
  effectiveDefense(playerId: string, army: ArmyStateV2): number;
  effectivePower(playerId: string, army: ArmyStateV2): number;
  territoryPower(territoryId: string): number;
}

/** One local military projection shared by map badges and nameplates. */
export function projectMapArmyV2(
  engine: MapArmyProjectionEngineV2,
  territoryId: TerritoryId,
  territory: TerritoryStateV2,
): MapArmyState {
  const attack = engine.effectiveAttack(territory.owner as PlayerId, territory.army);
  const defense = engine.effectiveDefense(territory.owner as PlayerId, territory.army);
  const quality = Math.max(0.000001, 0.55 * attack + 0.45 * defense);
  return {
    manpower: territory.army.manpower,
    capacity: territory.army.capacity,
    combatStrength: engine.effectivePower(territory.owner, territory.army) / (1_000 * quality),
    power: engine.territoryPower(territoryId),
    attack,
    defense,
  };
}
