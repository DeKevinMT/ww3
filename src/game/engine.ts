import { findTradeSetIndices } from './cards';
import { resolveStackRound } from './combat';
import { TERRITORY_BY_ID } from './data/map';
import { UNIT_DEFINITIONS, unitValue } from './data/units';
import { findOwnedPath, reinforcementIncome, territoryCount } from './selectors';
import {
  createInitialState,
  createUnit,
  DEFAULT_PLAYERS,
  drawCard,
  performTradeIn,
  playerMustTrade,
} from './state';
import type {
  CombatRoundResult,
  GameState,
  PlayerConfig,
  PlayerId,
  StateChange,
  TerritoryId,
  UnitId,
  UnitInstance,
  UnitType,
} from './types';

type Listener = (state: GameState, change: StateChange) => void;

export class GameEngine {
  state: GameState;
  private listeners = new Set<Listener>();

  constructor(seed = Date.now(), players: readonly PlayerConfig[] = DEFAULT_PLAYERS) {
    this.state = createInitialState(seed, players);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state, { reason: 'initial' });
    return () => this.listeners.delete(listener);
  }

  private emit(change: StateChange): void {
    for (const listener of this.listeners) listener(this.state, change);
  }

  private log(kind: GameState['log'][number]['kind'], message: string): void {
    this.state.log.push({
      id: this.state.nextLogId++,
      turn: this.state.turn,
      kind,
      message,
    });
    if (this.state.log.length > 100) this.state.log.splice(0, this.state.log.length - 100);
  }

  get activePlayer() {
    return this.state.players[this.state.activePlayerIndex]!;
  }

  placeUnit(playerId: PlayerId, territoryId: TerritoryId, type: UnitType): boolean {
    const definition = UNIT_DEFINITIONS[type];
    const territory = this.state.territories[territoryId];
    if (
      this.state.phase !== 'reinforce' ||
      this.activePlayer.id !== playerId ||
      territory?.ownerId !== playerId ||
      this.state.reinforcementPoints < definition.cost
    ) return false;

    territory.units.push(createUnit(this.state, type));
    this.state.reinforcementPoints -= definition.cost;
    this.log('reinforce', `${this.activePlayer.name} plaatst ${definition.name} in ${TERRITORY_BY_ID[territoryId]?.name}.`);
    this.emit({ reason: 'reinforce' });
    return true;
  }

  repairUnit(playerId: PlayerId, territoryId: TerritoryId, unitId: UnitId): boolean {
    const territory = this.state.territories[territoryId];
    const unit = territory?.units.find((candidate) => candidate.id === unitId);
    if (
      this.state.phase !== 'reinforce' ||
      this.activePlayer.id !== playerId ||
      territory?.ownerId !== playerId ||
      !unit
    ) return false;
    const definition = UNIT_DEFINITIONS[unit.type];
    const missingHp = definition.maxHp - unit.hp;
    if (missingHp <= 0) return false;
    const cost = Math.max(1, Math.ceil((definition.cost * missingHp) / definition.maxHp));
    if (this.state.reinforcementPoints < cost) return false;
    unit.hp = definition.maxHp;
    this.state.reinforcementPoints -= cost;
    this.log('reinforce', `${definition.name} in ${TERRITORY_BY_ID[territoryId]?.name} is hersteld.`);
    this.emit({ reason: 'repair' });
    return true;
  }

  tradeCards(playerId: PlayerId): number | undefined {
    if (this.state.phase !== 'reinforce' || this.activePlayer.id !== playerId) return undefined;
    const value = performTradeIn(this.state, playerId);
    if (value) {
      this.log('cards', `${this.activePlayer.name} levert een kaartenset in voor ${value} versterkingspunten.`);
      this.emit({ reason: 'cards-traded' });
    }
    return value;
  }

  defaultMovableUnitIds(territoryId: TerritoryId): UnitId[] {
    const units = this.state.territories[territoryId]?.units ?? [];
    if (units.length <= 1) return [];
    const garrison = [...units].sort((left, right) => {
      const infantryBias = Number(right.type === 'infantry') - Number(left.type === 'infantry');
      if (infantryBias !== 0) return infantryBias;
      return unitValue(left) - unitValue(right);
    })[0]!;
    return units.filter((unit) => unit.id !== garrison.id).map((unit) => unit.id);
  }

  attack(
    playerId: PlayerId,
    sourceId: TerritoryId,
    targetId: TerritoryId,
    requestedUnitIds: readonly UnitId[],
    untilResolved = false,
  ): CombatRoundResult | undefined {
    const source = this.state.territories[sourceId];
    const target = this.state.territories[targetId];
    if (
      this.state.phase !== 'attack' ||
      this.activePlayer.id !== playerId ||
      source?.ownerId !== playerId ||
      !target || target.ownerId === playerId ||
      !TERRITORY_BY_ID[sourceId]?.neighbors.includes(targetId)
    ) return undefined;

    const uniqueIds = [...new Set(requestedUnitIds)];
    const selected = source.units.filter((unit) => uniqueIds.includes(unit.id));
    if (selected.length === 0 || source.units.length - selected.length < 1) return undefined;

    const defenderId = target.ownerId;
    const aggregate: CombatRoundResult = {
      sourceId,
      targetId,
      attackerId: playerId,
      defenderId,
      attackerDamageDealt: 0,
      defenderDamageDealt: 0,
      attackerLosses: [],
      defenderLosses: [],
      attackerDamageLines: [],
      defenderDamageLines: [],
      conquered: false,
      lastStand: false,
      rounds: 0,
    };

    let engagedIds = selected.map((unit) => unit.id);
    const maximumRounds = untilResolved ? 12 : 1;
    while (aggregate.rounds < maximumRounds && target.ownerId !== playerId) {
      const engaged = source.units.filter((unit) => engagedIds.includes(unit.id));
      if (engaged.length === 0 || target.units.length === 0) break;
      const unengaged = source.units.filter((unit) => !engagedIds.includes(unit.id));
      const round = resolveStackRound(engaged, target.units);

      aggregate.attackerDamageDealt += round.attackerDamageDealt;
      aggregate.defenderDamageDealt += round.defenderDamageDealt;
      aggregate.attackerLosses.push(...round.attackerLosses);
      aggregate.defenderLosses.push(...round.defenderLosses);
      aggregate.attackerDamageLines.push(...round.attackerDamageLines);
      aggregate.defenderDamageLines.push(...round.defenderDamageLines);
      aggregate.lastStand ||= round.lastStand;
      aggregate.rounds += 1;

      target.units = round.defenders;
      if (round.defenders.length === 0 && round.attackers.length > 0) {
        source.units = unengaged;
        target.units = round.attackers;
        target.ownerId = playerId;
        aggregate.conquered = true;
        this.state.conqueredThisTurn = true;
        this.log(
          'conquest',
          `${this.activePlayer.name} verovert ${TERRITORY_BY_ID[targetId]?.name} op ${this.state.players.find((player) => player.id === defenderId)?.name}.`,
        );
        this.handleElimination(defenderId, playerId);
        this.checkVictory();
        break;
      }

      source.units = [...unengaged, ...round.attackers];
      engagedIds = round.attackers.map((unit) => unit.id);
      if (round.attackers.length === 0) break;
    }

    if (!aggregate.conquered) {
      this.log(
        'combat',
        `${TERRITORY_BY_ID[sourceId]?.name} valt ${TERRITORY_BY_ID[targetId]?.name} aan: ${aggregate.attackerDamageDealt} schade uit, ${aggregate.defenderDamageDealt} schade terug.`,
      );
    }
    this.emit({ reason: aggregate.conquered ? 'conquest' : 'combat', combat: aggregate });
    return aggregate;
  }

  fortify(
    playerId: PlayerId,
    sourceId: TerritoryId,
    targetId: TerritoryId,
    requestedUnitIds: readonly UnitId[],
  ): boolean {
    const source = this.state.territories[sourceId];
    const target = this.state.territories[targetId];
    const uniqueIds = [...new Set(requestedUnitIds)];
    const selected = source?.units.filter((unit) => uniqueIds.includes(unit.id)) ?? [];
    if (
      this.state.phase !== 'fortify' ||
      this.state.fortifyUsed ||
      this.activePlayer.id !== playerId ||
      source?.ownerId !== playerId ||
      target?.ownerId !== playerId ||
      sourceId === targetId ||
      selected.length === 0 ||
      source.units.length - selected.length < 1 ||
      !findOwnedPath(this.state, playerId, sourceId, targetId)
    ) return false;

    const selectedSet = new Set(selected.map((unit) => unit.id));
    source.units = source.units.filter((unit) => !selectedSet.has(unit.id));
    target.units.push(...selected);
    this.state.fortifyUsed = true;
    this.log(
      'fortify',
      `${this.activePlayer.name} verplaatst ${selected.length} unit${selected.length === 1 ? '' : 's'} van ${TERRITORY_BY_ID[sourceId]?.name} naar ${TERRITORY_BY_ID[targetId]?.name}.`,
    );
    this.emit({ reason: 'fortify' });
    return true;
  }

  advancePhase(playerId: PlayerId): boolean {
    if (this.activePlayer.id !== playerId || this.state.phase === 'gameover') return false;
    if (this.state.phase === 'reinforce') {
      if (playerMustTrade(this.state, playerId) || this.state.reinforcementPoints > 0) return false;
      this.state.phase = 'attack';
      this.log('system', `${this.activePlayer.name} begint de aanvalsfase.`);
      this.emit({ reason: 'phase-attack' });
      return true;
    }
    if (this.state.phase === 'attack') {
      this.state.phase = 'fortify';
      this.log('system', `${this.activePlayer.name} begint de fortificatiefase.`);
      this.emit({ reason: 'phase-fortify' });
      return true;
    }
    if (this.state.phase === 'fortify') {
      this.endTurn();
      return true;
    }
    return false;
  }

  private handleElimination(defenderId: PlayerId, attackerId: PlayerId): void {
    if (territoryCount(this.state, defenderId) > 0) return;
    const defender = this.state.players.find((player) => player.id === defenderId);
    const attacker = this.state.players.find((player) => player.id === attackerId);
    if (!defender || !attacker || defender.eliminated) return;
    defender.eliminated = true;
    attacker.cards.push(...defender.cards.splice(0));
    this.log('conquest', `${defender.name} is uitgeschakeld. ${attacker.name} ontvangt alle gebiedskaarten.`);
  }

  private checkVictory(): void {
    const surviving = this.state.players.filter((player) => !player.eliminated && territoryCount(this.state, player.id) > 0);
    if (surviving.length !== 1) return;
    this.state.phase = 'gameover';
    this.state.winnerId = surviving[0]!.id;
    this.log('victory', `${surviving[0]!.name} beheerst de volledige wereld.`);
  }

  private endTurn(): void {
    const outgoing = this.activePlayer;
    if (this.state.conqueredThisTurn) {
      const card = drawCard(this.state, outgoing.id);
      if (card) this.log('cards', `${outgoing.name} ontvangt een gebiedskaart.`);
    }

    if (this.state.phase === 'gameover') {
      this.emit({ reason: 'gameover' });
      return;
    }

    let nextIndex = this.state.activePlayerIndex;
    do {
      nextIndex = (nextIndex + 1) % this.state.players.length;
    } while (this.state.players[nextIndex]?.eliminated);

    this.state.activePlayerIndex = nextIndex;
    this.state.turn += 1;
    this.state.phase = 'reinforce';
    this.state.conqueredThisTurn = false;
    this.state.fortifyUsed = false;
    this.state.reinforcementPoints = reinforcementIncome(this.state, this.activePlayer.id);
    this.log('system', `${this.activePlayer.name} is aan de beurt met ${this.state.reinforcementPoints} versterkingspunten.`);
    this.emit({ reason: 'turn-ended' });
  }

  canTrade(playerId: PlayerId): boolean {
    const player = this.state.players.find((candidate) => candidate.id === playerId);
    return Boolean(player && findTradeSetIndices(player.cards));
  }
}
