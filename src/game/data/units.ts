import type { UnitDefinition, UnitInstance, UnitType } from '../types';

export const UNIT_ORDER: readonly UnitType[] = ['infantry', 'armor', 'artillery'];

export const UNIT_DEFINITIONS: Record<UnitType, UnitDefinition> = {
  infantry: {
    id: 'infantry',
    name: 'Infantry',
    shortName: 'INF',
    icon: '◆',
    cost: 1,
    maxHp: 3,
    attack: 2,
    defense: 1,
    casualtyPriority: 1,
    description: 'Reliable garrison and protective front-line unit.',
  },
  armor: {
    id: 'armor',
    name: 'Armour',
    shortName: 'ARM',
    icon: '⬢',
    cost: 3,
    maxHp: 6,
    attack: 4,
    defense: 2,
    casualtyPriority: 2,
    description: 'Durable breakthrough unit, strongest on open terrain.',
  },
  artillery: {
    id: 'artillery',
    name: 'Artillery',
    shortName: 'ART',
    icon: '✦',
    cost: 2,
    maxHp: 2,
    attack: 4,
    defense: 0,
    casualtyPriority: 3,
    description: 'Heavy opening firepower, but needs protection.',
  },
};

export function maxHp(unit: UnitInstance): number {
  return UNIT_DEFINITIONS[unit.type].maxHp;
}

export function unitValue(unit: UnitInstance): number {
  const definition = UNIT_DEFINITIONS[unit.type];
  return definition.cost * (0.3 + 0.7 * (unit.hp / definition.maxHp));
}

export function stackValue(units: readonly UnitInstance[]): number {
  return units.reduce((sum, unit) => sum + unitValue(unit), 0);
}

export function stackHp(units: readonly UnitInstance[]): { current: number; max: number } {
  return units.reduce(
    (total, unit) => ({
      current: total.current + unit.hp,
      max: total.max + maxHp(unit),
    }),
    { current: 0, max: 0 },
  );
}

export function countUnitTypes(units: readonly UnitInstance[]): Record<UnitType, number> {
  const result: Record<UnitType, number> = { infantry: 0, armor: 0, artillery: 0 };
  for (const unit of units) result[unit.type] += 1;
  return result;
}
