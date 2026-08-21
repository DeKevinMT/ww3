import type { CardSymbol, GameState, PlayerId, TerritoryCard } from './types';

export function tradeInValue(tradeInCount: number): number {
  const sequence = [4, 6, 8, 10, 12, 15];
  return sequence[tradeInCount] ?? 20 + (tradeInCount - sequence.length) * 5;
}

export function findTradeSetIndices(cards: readonly TerritoryCard[]): [number, number, number] | undefined {
  const bySymbol: Record<CardSymbol, number[]> = { infantry: [], armor: [], artillery: [] };
  cards.forEach((card, index) => bySymbol[card.symbol].push(index));

  for (const symbol of Object.keys(bySymbol) as CardSymbol[]) {
    const indices = bySymbol[symbol];
    if (indices.length >= 3) return [indices[0]!, indices[1]!, indices[2]!];
  }

  if (bySymbol.infantry.length && bySymbol.armor.length && bySymbol.artillery.length) {
    return [bySymbol.infantry[0]!, bySymbol.armor[0]!, bySymbol.artillery[0]!];
  }
  return undefined;
}

export function hasTradeSet(state: GameState, playerId: PlayerId): boolean {
  const player = state.players.find((candidate) => candidate.id === playerId);
  return Boolean(player && findTradeSetIndices(player.cards));
}
