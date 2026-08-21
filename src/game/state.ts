import { findTradeSetIndices, tradeInValue } from './cards';
import { TERRITORIES } from './data/map';
import { UNIT_DEFINITIONS } from './data/units';
import { normalizeSeed, randomInt, shuffleInPlace } from './random';
import { reinforcementIncome } from './selectors';
import type {
  GameState,
  PlayerConfig,
  PlayerId,
  TerritoryCard,
  TerritoryId,
  UnitInstance,
  UnitType,
} from './types';

export const DEFAULT_PLAYERS: readonly PlayerConfig[] = [
  {
    id: 'human', name: 'Northstar Alliantie', color: 0x48c9f1, cssColor: '#48c9f1', darkColor: '#123f5a', sigil: 'N',
    influences: ['christendemocratisch', 'seculier-institutioneel'],
    profile: 'Een maritieme veiligheidscoalitie met christendemocratische tradities, sterke burgerinstituties en een pluralistische grondwet.',
    isHuman: true,
  },
  {
    id: 'orion', name: 'Meridiaanpact', color: 0xff6f6a, cssColor: '#ff6f6a', darkColor: '#5e292f', sigil: 'M',
    influences: ['islamitisch-cultureel', 'handelsfederalistisch'],
    profile: 'Een netwerk van republieken, monarchieën en handelssteden waarin islamitische cultuur, regionale autonomie en economische samenwerking samenkomen.',
    isHuman: false,
  },
  {
    id: 'solari', name: 'Pacific Forum', color: 0xf5c451, cssColor: '#f5c451', darkColor: '#5b4316', sigil: 'P',
    influences: ['boeddhistisch-confuciaans', 'seculier-maritiem'],
    profile: 'Een pragmatisch maritiem forum met boeddhistische en confuciaanse invloeden, technocratische planning en sterke lokale tradities.',
    isHuman: false,
  },
  {
    id: 'veyra', name: 'Horizon Coalitie', color: 0xa98cff, cssColor: '#a98cff', darkColor: '#3c2d67', sigil: 'H',
    influences: ['christelijk-islamitisch pluralisme', 'dharmisch & inheems'],
    profile: 'Een brede zuidelijke coalitie waarin christelijke, islamitische, dharmische en inheemse gemeenschappen macht delen via regionale raden.',
    isHuman: false,
  },
];

export function createUnit(state: GameState, type: UnitType, hp?: number): UnitInstance {
  const unit: UnitInstance = {
    id: `u${state.nextUnitId}`,
    type,
    hp: hp ?? UNIT_DEFINITIONS[type].maxHp,
  };
  state.nextUnitId += 1;
  return unit;
}

function makeDeck(): TerritoryCard[] {
  const symbols: UnitType[] = ['infantry', 'armor', 'artillery'];
  return TERRITORIES.map((territory, index) => ({
    id: `card-${territory.id}`,
    territoryId: territory.id,
    symbol: symbols[index % symbols.length]!,
  }));
}

function addLog(state: GameState, message: string): void {
  state.log.push({ id: state.nextLogId++, turn: state.turn, kind: 'system', message });
}

export function createInitialState(
  seed = Date.now(),
  configs: readonly PlayerConfig[] = DEFAULT_PLAYERS,
): GameState {
  if (configs.length < 2) throw new Error('Minstens twee spelers zijn vereist.');
  const rngState = normalizeSeed(seed);
  const state: GameState = {
    seed: rngState,
    rngState,
    turn: 1,
    activePlayerIndex: 0,
    phase: 'reinforce',
    reinforcementPoints: 0,
    players: configs.map((config) => ({ ...config, eliminated: false, cards: [] })),
    territories: {},
    deck: [],
    discard: [],
    tradeInCount: 0,
    conqueredThisTurn: false,
    fortifyUsed: false,
    nextUnitId: 1,
    nextLogId: 1,
    log: [],
  };

  const territoryIds = shuffleInPlace(state, TERRITORIES.map((territory) => territory.id));
  territoryIds.forEach((territoryId, index) => {
    const player = state.players[index % state.players.length]!;
    state.territories[territoryId] = {
      id: territoryId,
      ownerId: player.id,
      units: [createUnit(state, 'infantry')],
    };
  });

  const initialRoster: readonly UnitType[] = [
    'infantry', 'infantry', 'infantry', 'infantry',
    'armor', 'armor', 'artillery', 'artillery',
  ];
  for (const player of state.players) {
    const owned = TERRITORIES.filter((territory) => state.territories[territory.id]?.ownerId === player.id);
    initialRoster.forEach((type) => {
      const target = owned[randomInt(state, owned.length)]!;
      state.territories[target.id]!.units.push(createUnit(state, type));
    });
  }

  state.deck = shuffleInPlace(state, makeDeck());
  state.reinforcementPoints = reinforcementIncome(state, state.players[0]!.id);
  addLog(state, 'De wereld is verdeeld. Jouw versterkingsfase begint.');
  return state;
}

export function drawCard(state: GameState, playerId: PlayerId): TerritoryCard | undefined {
  if (state.deck.length === 0 && state.discard.length > 0) {
    state.deck = shuffleInPlace(state, state.discard.splice(0));
  }
  const card = state.deck.pop();
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (card && player) player.cards.push(card);
  return card;
}

export function performTradeIn(state: GameState, playerId: PlayerId): number | undefined {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) return undefined;
  const indices = findTradeSetIndices(player.cards);
  if (!indices) return undefined;

  const cards = [...indices]
    .sort((left, right) => right - left)
    .map((index) => player.cards.splice(index, 1)[0]!)
    .reverse();
  state.discard.push(...cards);

  const value = tradeInValue(state.tradeInCount);
  state.tradeInCount += 1;
  state.reinforcementPoints += value;

  const territoryBonusCard = cards.find(
    (card) => state.territories[card.territoryId]?.ownerId === playerId,
  );
  if (territoryBonusCard) {
    state.territories[territoryBonusCard.territoryId]!.units.push(createUnit(state, 'infantry'));
  }
  return value;
}

export function playerMustTrade(state: GameState, playerId: PlayerId): boolean {
  const player = state.players.find((candidate) => candidate.id === playerId);
  return Boolean(player && player.cards.length >= 5 && findTradeSetIndices(player.cards));
}

export function territoryOwner(state: GameState, territoryId: TerritoryId): PlayerId | undefined {
  return state.territories[territoryId]?.ownerId;
}
