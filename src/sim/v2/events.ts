import type {
  PlayerId,
  TerritoryId,
  WorldEventKindV2,
  WorldStateV2,
} from './types';

export function addWorldEventV2(
  state: WorldStateV2,
  kind: WorldEventKindV2,
  severity: 'info' | 'action' | 'critical',
  message: string,
  territoryId?: TerritoryId,
  playerId?: PlayerId,
): void {
  const humanOwnsTerritory = territoryId
    ? state.territories[territoryId]?.owner === state.humanPlayerId
    : false;
  state.events.push({
    id: state.nextEventId++,
    tick: state.tick,
    kind,
    severity,
    message,
    territoryId,
    playerId,
    unread: severity !== 'info' && (playerId === state.humanPlayerId || humanOwnsTerritory),
  });
}

export function pruneWorldHistoryV2(state: WorldStateV2): void {
  if (state.events.length > 240) state.events.splice(0, state.events.length - 240);
  if (state.offers.length > 80) state.offers.splice(0, state.offers.length - 80);
}
