import { UNIT_DEFINITIONS, stackValue } from './data/units';
import type { BattlePrediction, BattleTactic, DamageLine, TerrainType, UnitInstance } from './types';

export interface CombatContext {
  terrain: TerrainType;
  tactic: BattleTactic;
  fortification?: number;
}

export interface ResolvedStackRound {
  attackers: UnitInstance[];
  defenders: UnitInstance[];
  attackerLosses: UnitInstance[];
  defenderLosses: UnitInstance[];
  attackerDamageLines: DamageLine[];
  defenderDamageLines: DamageLine[];
  attackerDamageDealt: number;
  defenderDamageDealt: number;
  lastStand: boolean;
}

interface Formation {
  front: UnitInstance[];
  support?: UnitInstance;
}

interface Hit {
  sourceId: string;
  targetId: string;
  damage: number;
}

function cloneUnits(units: readonly UnitInstance[]): UnitInstance[] {
  return units.map((unit) => ({ ...unit }));
}

function stableUnitSort(left: UnitInstance, right: UnitInstance): number {
  return UNIT_DEFINITIONS[right.type].defense - UNIT_DEFINITIONS[left.type].defense
    || right.hp - left.hp
    || UNIT_DEFINITIONS[right.type].attack - UNIT_DEFINITIONS[left.type].attack
    || left.id.localeCompare(right.id);
}

export function buildFormation(units: readonly UnitInstance[]): Formation {
  const ranked = cloneUnits(units).sort(stableUnitSort);
  const front = ranked.slice(0, 2);
  const remaining = ranked.slice(2).sort((left, right) => (
    UNIT_DEFINITIONS[right.type].attack - UNIT_DEFINITIONS[left.type].attack
    || right.hp - left.hp
    || left.id.localeCompare(right.id)
  ));
  return { front, support: remaining[0] };
}

function livingFormation(formation: Formation, livingUnits: readonly UnitInstance[]): Formation {
  const livingById = new Map(livingUnits.map((unit) => [unit.id, unit]));
  return {
    front: formation.front.map((unit) => livingById.get(unit.id)).filter((unit): unit is UnitInstance => Boolean(unit)),
    support: formation.support ? livingById.get(formation.support.id) : undefined,
  };
}

function pickLowestHp(units: readonly UnitInstance[]): UnitInstance | undefined {
  return [...units].sort((left, right) => left.hp - right.hp || left.id.localeCompare(right.id))[0];
}

function terrainAttackBonus(unit: UnitInstance, side: 'attacker' | 'defender', context?: CombatContext): number {
  if (!context) return 0;
  let bonus = 0;
  if (context.terrain === 'desert' && unit.type === 'armor') bonus += 1;
  if (context.terrain === 'coastal' && unit.type === 'artillery') bonus += 1;
  if ((context.terrain === 'mountain' || context.terrain === 'jungle') && unit.type === 'armor') bonus -= 1;
  if (context.terrain === 'arctic' && side === 'attacker' && unit.type !== 'infantry') bonus -= 1;
  if (side === 'attacker' && context.tactic === 'armored-breakthrough' && unit.type === 'armor') bonus += 2;
  if (side === 'attacker' && context.tactic === 'artillery-barrage' && unit.type === 'artillery') bonus += 2;
  if (side === 'attacker' && context.tactic === 'encirclement') bonus += 1;
  if (side === 'defender' && context.tactic === 'counterattack') bonus += 1;
  return bonus;
}

function terrainDefenseBonus(unit: UnitInstance, side: 'attacker' | 'defender', context?: CombatContext): number {
  if (!context || side !== 'defender') return 0;
  let bonus = Math.min(2, Math.max(0, context.fortification ?? 0));
  if ((context.terrain === 'urban' || context.terrain === 'mountain' || context.terrain === 'jungle') && unit.type === 'infantry') bonus += 1;
  if (context.tactic === 'hold-the-line') bonus += 1;
  return bonus;
}

function hit(
  source: UnitInstance,
  target: UnitInstance | undefined,
  sourceSide: 'attacker' | 'defender',
  context?: CombatContext,
): Hit | undefined {
  if (!target) return undefined;
  const targetSide = sourceSide === 'attacker' ? 'defender' : 'attacker';
  return {
    sourceId: source.id,
    targetId: target.id,
    damage: Math.max(1,
      UNIT_DEFINITIONS[source.type].attack + terrainAttackBonus(source, sourceSide, context)
      - UNIT_DEFINITIONS[target.type].defense - terrainDefenseBonus(target, targetSide, context),
    ),
  };
}

function createSalvo(
  formation: Formation,
  enemyFormation: Formation,
  side: 'attacker' | 'defender',
  context?: CombatContext,
): Hit[] {
  const hits: (Hit | undefined)[] = [];
  const firstTarget = enemyFormation.front[0] ?? enemyFormation.support;
  const secondTarget = enemyFormation.front[1] ?? firstTarget;
  if (formation.front[0]) hits.push(hit(formation.front[0], firstTarget, side, context));
  if (formation.front[1]) hits.push(hit(formation.front[1], secondTarget, side, context));
  if (formation.support) {
    hits.push(hit(formation.support, pickLowestHp(enemyFormation.front) ?? enemyFormation.support, side, context));
  }
  return hits.filter((candidate): candidate is Hit => Boolean(candidate));
}

function applySalvo(units: readonly UnitInstance[], hits: readonly Hit[]) {
  const survivors = cloneUnits(units);
  const byId = new Map(survivors.map((unit) => [unit.id, unit]));
  const originalHp = new Map(survivors.map((unit) => [unit.id, unit.hp]));
  const damageByTarget = new Map<string, number>();
  for (const shot of hits) {
    damageByTarget.set(shot.targetId, (damageByTarget.get(shot.targetId) ?? 0) + shot.damage);
  }

  const lines: DamageLine[] = [];
  let applied = 0;
  for (const [targetId, damage] of damageByTarget) {
    const unit = byId.get(targetId);
    if (!unit) continue;
    const actualDamage = Math.min(unit.hp, damage);
    unit.hp -= actualDamage;
    applied += actualDamage;
    lines.push({
      unitId: unit.id,
      unitType: unit.type,
      damage: actualDamage,
      hpBefore: originalHp.get(unit.id)!,
      hpAfter: unit.hp,
      destroyed: unit.hp <= 0,
    });
  }

  const losses = survivors.filter((unit) => unit.hp <= 0).map((unit) => ({ ...unit, hp: originalHp.get(unit.id)! }));
  return {
    survivors: survivors.filter((unit) => unit.hp > 0),
    losses,
    lines,
    applied,
  };
}

export function resolveStackRound(
  attackerInput: readonly UnitInstance[],
  defenderInput: readonly UnitInstance[],
  context?: CombatContext,
): ResolvedStackRound {
  const attackers = cloneUnits(attackerInput);
  const defenders = cloneUnits(defenderInput);
  const attackerFormation = buildFormation(attackers);
  const defenderFormation = buildFormation(defenders);

  // Defender fires first: a deterministic equivalent of classic defender advantage.
  const defenderSalvo = createSalvo(defenderFormation, attackerFormation, 'defender', context);
  const damagedAttackers = applySalvo(attackers, defenderSalvo);

  let damagedDefenders = {
    survivors: defenders,
    losses: [] as UnitInstance[],
    lines: [] as DamageLine[],
    applied: 0,
  };
  if (damagedAttackers.survivors.length > 0) {
    const survivingActiveAttackers = livingFormation(attackerFormation, damagedAttackers.survivors);
    const attackerSalvo = createSalvo(survivingActiveAttackers, defenderFormation, 'attacker', context);
    damagedDefenders = applySalvo(defenders, attackerSalvo);
  }

  return {
    attackers: damagedAttackers.survivors,
    defenders: damagedDefenders.survivors,
    attackerLosses: damagedAttackers.losses,
    defenderLosses: damagedDefenders.losses,
    attackerDamageLines: damagedDefenders.lines,
    defenderDamageLines: damagedAttackers.lines,
    attackerDamageDealt: damagedDefenders.applied,
    defenderDamageDealt: damagedAttackers.applied,
    lastStand: false,
  };
}

export function predictBattle(
  attackerInput: readonly UnitInstance[],
  defenderInput: readonly UnitInstance[],
  maximumRounds = 12,
  context?: CombatContext,
): BattlePrediction {
  let attackers = cloneUnits(attackerInput);
  let defenders = cloneUnits(defenderInput);
  const attackerValueBefore = stackValue(attackers);
  const defenderValueBefore = stackValue(defenders);
  let rounds = 0;

  while (attackers.length > 0 && defenders.length > 0 && rounds < maximumRounds) {
    const result = resolveStackRound(attackers, defenders, context);
    attackers = result.attackers;
    defenders = result.defenders;
    rounds += 1;
  }

  return {
    willConquer: defenders.length === 0 && attackers.length > 0,
    rounds,
    attackerValueBefore,
    attackerValueAfter: stackValue(attackers),
    defenderValueBefore,
    defenderValueAfter: stackValue(defenders),
    attackerSurvivors: attackers,
    defenderSurvivors: defenders,
  };
}
