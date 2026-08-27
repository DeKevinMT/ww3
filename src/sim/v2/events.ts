import type {
  PlayerId,
  TerritoryId,
  WorldEventKindV2,
  WorldEventV2,
  WorldStateV2,
} from './types';
import { selectHumanPlayerIdsV2 } from './humanPlayers';

export function addWorldEventV2(
  state: WorldStateV2,
  kind: WorldEventKindV2,
  severity: 'info' | 'action' | 'critical',
  message: string,
  territoryId?: TerritoryId,
  playerId?: PlayerId,
  metadata?: Pick<WorldEventV2, 'polarRegion' | 'polarSectorId'>,
): void {
  const humanPlayerIds = new Set(selectHumanPlayerIdsV2(state));
  const territoryOwner = territoryId ? state.territories[territoryId]?.owner : undefined;
  const humanOwnsTerritory = Boolean(territoryOwner && humanPlayerIds.has(territoryOwner));
  state.events.push({
    id: state.nextEventId++,
    tick: state.tick,
    kind,
    severity,
    message,
    territoryId,
    playerId,
    ...metadata,
    unread: severity !== 'info'
      && (Boolean(playerId && humanPlayerIds.has(playerId)) || humanOwnsTerritory),
  });
}

export function pruneWorldHistoryV2(state: WorldStateV2): void {
  if (state.events.length > 240) state.events.splice(0, state.events.length - 240);
  if (state.offers.length > 80) state.offers.splice(0, state.offers.length - 80);
}
