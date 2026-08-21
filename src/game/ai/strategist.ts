import { predictBattle } from '../combat';
import { REGIONS, TERRITORIES, TERRITORY_BY_ID, territoriesInRegion } from '../data/map';
import { UNIT_DEFINITIONS, countUnitTypes, stackValue } from '../data/units';
import { GameEngine } from '../engine';
import { nextRandom } from '../random';
import {
  controlsRegion,
  enemyNeighbors,
  findOwnedPath,
  isBorderTerritory,
  territoriesOwnedBy,
  unitCombatPower,
} from '../selectors';
import type { PlayerId, TerritoryId, UnitId, UnitType } from '../types';

export interface AiStep {
  kind: 'cards' | 'reinforce' | 'attack' | 'fortify' | 'phase';
  sourceId?: TerritoryId;
  targetId?: TerritoryId;
  message: string;
}

export type AiStepCallback = (step: AiStep) => Promise<void> | void;

function enemyPressure(engine: GameEngine, territoryId: TerritoryId): number {
  const state = engine.state;
  const ownerId = state.territories[territoryId]?.ownerId;
  return (TERRITORY_BY_ID[territoryId]?.neighbors ?? []).reduce((sum, neighborId) => {
    const neighbor = state.territories[neighborId];
    if (!neighbor || neighbor.ownerId === ownerId) return sum;
    return sum + unitCombatPower(neighbor.units);
  }, 0);
}

function regionOpportunity(engine: GameEngine, playerId: PlayerId, territoryId: TerritoryId): number {
  const definition = TERRITORY_BY_ID[territoryId];
  if (!definition) return 0;
  const regionTerritories = territoriesInRegion(definition.regionId);
  const owned = regionTerritories.filter((territory) => engine.state.territories[territory.id]?.ownerId === playerId).length;
  return (owned / regionTerritories.length) * 12;
}

function reinforcementTarget(engine: GameEngine, playerId: PlayerId): TerritoryId {
  const owned = territoriesOwnedBy(engine.state, playerId);
  let best = owned[0]!;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const territory of owned) {
    const stack = engine.state.territories[territory.id]!.units;
    const pressure = enemyPressure(engine, territory.id);
    const ownPower = unitCombatPower(stack);
    const border = isBorderTerritory(engine.state, territory.id) ? 14 : -8;
    const noise = nextRandom(engine.state) * 1.5;
    const score = border + pressure * 1.5 - ownPower * 0.35 + regionOpportunity(engine, playerId, territory.id) + noise;
    if (score > bestScore) {
      best = territory;
      bestScore = score;
    }
  }
  return best.id;
}

function chooseUnitType(engine: GameEngine, territoryId: TerritoryId): UnitType {
  const state = engine.state;
  const points = state.reinforcementPoints;
  const units = state.territories[territoryId]!.units;
  const counts = countUnitTypes(units);
  const roll = nextRandom(state);
  if (
    points >= UNIT_DEFINITIONS.artillery.cost &&
    counts.artillery < Math.max(1, counts.infantry + counts.armor) &&
    roll > 0.72
  ) return 'artillery';
  if (points >= UNIT_DEFINITIONS.armor.cost && roll > 0.34) return 'armor';
  return 'infantry';
}

interface AttackCandidate {
  sourceId: TerritoryId;
  targetId: TerritoryId;
  unitIds: UnitId[];
  score: number;
}

function completesRegion(engine: GameEngine, playerId: PlayerId, targetId: TerritoryId): boolean {
  const targetDefinition = TERRITORY_BY_ID[targetId];
  if (!targetDefinition) return false;
  return territoriesInRegion(targetDefinition.regionId).every((territory) => (
    territory.id === targetId || engine.state.territories[territory.id]?.ownerId === playerId
  ));
}

function findBestAttack(engine: GameEngine, playerId: PlayerId): AttackCandidate | undefined {
  let best: AttackCandidate | undefined;
  for (const sourceDefinition of territoriesOwnedBy(engine.state, playerId)) {
    const sourceState = engine.state.territories[sourceDefinition.id]!;
    if (sourceState.units.length <= 1) continue;
    const unitIds = engine.defaultMovableUnitIds(sourceDefinition.id);
    const attackers = sourceState.units.filter((unit) => unitIds.includes(unit.id));
    if (attackers.length === 0) continue;

    for (const targetId of enemyNeighbors(engine.state, sourceDefinition.id)) {
      const target = engine.state.territories[targetId]!;
      const prediction = predictBattle(attackers, target.units, 12);
      if (!prediction.willConquer) continue;

      const defender = engine.state.players.find((player) => player.id === target.ownerId)!;
      const targetRegion = TERRITORY_BY_ID[targetId]!.regionId;
      const completion = completesRegion(engine, playerId, targetId) ? 18 : 0;
      const breaksRegion = controlsRegion(engine.state, defender.id, targetRegion) ? 9 : 0;
      const losses = prediction.attackerValueBefore - prediction.attackerValueAfter;
      const destroyed = prediction.defenderValueBefore - prediction.defenderValueAfter;
      const exposure = enemyNeighbors(engine.state, targetId).length;
      const sourceExposure = enemyNeighbors(engine.state, sourceDefinition.id).length;
      const playerCountBonus = defender.eliminated ? 0 : (defender.cards.length >= 3 ? 4 : 0);
      const noise = nextRandom(engine.state) * 1.8;
      const score = 11 + completion + breaksRegion + destroyed * 1.4 - losses * 1.05
        - exposure * 1.5 - sourceExposure * 0.8 + playerCountBonus + noise;

      if (score > 3 && (!best || score > best.score)) {
        best = { sourceId: sourceDefinition.id, targetId, unitIds, score };
      }
    }
  }
  return best;
}

function findFortify(engine: GameEngine, playerId: PlayerId): { sourceId: TerritoryId; targetId: TerritoryId; unitIds: UnitId[] } | undefined {
  const owned = territoriesOwnedBy(engine.state, playerId);
  const borders = owned.filter((territory) => isBorderTerritory(engine.state, territory.id));
  const sources = owned
    .filter((territory) => engine.state.territories[territory.id]!.units.length > 1)
    .sort((left, right) => {
      const leftInterior = isBorderTerritory(engine.state, left.id) ? 0 : 1;
      const rightInterior = isBorderTerritory(engine.state, right.id) ? 0 : 1;
      return rightInterior - leftInterior
        || stackValue(engine.state.territories[right.id]!.units) - stackValue(engine.state.territories[left.id]!.units);
    });
  const targets = [...borders].sort((left, right) => {
    const leftNeed = enemyPressure(engine, left.id) - unitCombatPower(engine.state.territories[left.id]!.units);
    const rightNeed = enemyPressure(engine, right.id) - unitCombatPower(engine.state.territories[right.id]!.units);
    return rightNeed - leftNeed;
  });

  for (const target of targets) {
    for (const source of sources) {
      if (source.id === target.id) continue;
      if (!findOwnedPath(engine.state, playerId, source.id, target.id)) continue;
      const unitIds = engine.defaultMovableUnitIds(source.id);
      if (unitIds.length > 0) return { sourceId: source.id, targetId: target.id, unitIds };
    }
  }
  return undefined;
}

export async function executeAiTurn(
  engine: GameEngine,
  onStep: AiStepCallback = () => undefined,
): Promise<void> {
  const player = engine.activePlayer;
  if (player.isHuman || player.eliminated || engine.state.phase === 'gameover') return;
  const playerId = player.id;

  while (engine.canTrade(playerId) && engine.state.phase === 'reinforce') {
    const value = engine.tradeCards(playerId);
    await onStep({ kind: 'cards', message: `${player.name} wisselt kaarten in voor ${value ?? 0} punten.` });
  }

  while (engine.state.phase === 'reinforce' && engine.state.reinforcementPoints > 0) {
    const targetId = reinforcementTarget(engine, playerId);
    let type = chooseUnitType(engine, targetId);
    if (UNIT_DEFINITIONS[type].cost > engine.state.reinforcementPoints) type = 'infantry';
    engine.placeUnit(playerId, targetId, type);
    await onStep({
      kind: 'reinforce',
      targetId,
      message: `${player.name} versterkt ${TERRITORY_BY_ID[targetId]?.name} met ${UNIT_DEFINITIONS[type].name}.`,
    });
  }

  if (engine.state.phase === 'reinforce') {
    engine.advancePhase(playerId);
    await onStep({ kind: 'phase', message: `${player.name} zoekt een opening.` });
  }

  let attacks = 0;
  while (engine.state.phase === 'attack' && attacks < 16) {
    const candidate = findBestAttack(engine, playerId);
    if (!candidate) break;
    engine.attack(playerId, candidate.sourceId, candidate.targetId, candidate.unitIds, true);
    attacks += 1;
    await onStep({
      kind: 'attack',
      sourceId: candidate.sourceId,
      targetId: candidate.targetId,
      message: `${player.name}: ${TERRITORY_BY_ID[candidate.sourceId]?.name} → ${TERRITORY_BY_ID[candidate.targetId]?.name}.`,
    });
    if (engine.state.phase === 'gameover') return;
  }

  if (engine.state.phase === 'attack') {
    engine.advancePhase(playerId);
    await onStep({ kind: 'phase', message: `${player.name} consolideert de linies.` });
  }

  if (engine.state.phase === 'fortify') {
    const move = findFortify(engine, playerId);
    if (move) {
      engine.fortify(playerId, move.sourceId, move.targetId, move.unitIds);
      await onStep({
        kind: 'fortify',
        sourceId: move.sourceId,
        targetId: move.targetId,
        message: `${player.name} verplaatst reserves naar ${TERRITORY_BY_ID[move.targetId]?.name}.`,
      });
    }
    engine.advancePhase(playerId);
    await onStep({ kind: 'phase', message: `${player.name} beëindigt de beurt.` });
  }
}

export function evaluateBoard(engine: GameEngine, playerId: PlayerId): number {
  const territories = territoriesOwnedBy(engine.state, playerId);
  const regions = REGIONS.filter((region) => controlsRegion(engine.state, playerId, region.id));
  const army = territories.reduce((sum, territory) => sum + stackValue(engine.state.territories[territory.id]!.units), 0);
  const exposed = territories.filter((territory) => isBorderTerritory(engine.state, territory.id)).length;
  return territories.length * 5 + regions.reduce((sum, region) => sum + region.bonus * 3, 0) + army * 1.2 - exposed * 2;
}

export function aiInvariantSummary(engine: GameEngine): string[] {
  const errors: string[] = [];
  for (const territory of TERRITORIES) {
    const state = engine.state.territories[territory.id];
    if (!state) errors.push(`${territory.id}: ontbreekt`);
    else if (state.units.length < 1) errors.push(`${territory.id}: leeg`);
    else for (const unit of state.units) {
      const definition = UNIT_DEFINITIONS[unit.type];
      if (unit.hp <= 0 || unit.hp > definition.maxHp) errors.push(`${unit.id}: ongeldige HP`);
    }
  }
  const owners = new Set(engine.state.players.map((player) => player.id));
  for (const territory of Object.values(engine.state.territories)) {
    if (!owners.has(territory.ownerId)) errors.push(`${territory.id}: onbekende eigenaar`);
  }
  return errors;
}
