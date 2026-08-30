import type { WorldContentV2 } from './content';
import { isHumanPlayerV2 } from './humanPlayers';
import type { PlayerId, TerritoryId, WorldStateV2 } from './types';

function accessibilityRankV2(
  state: WorldStateV2,
  content: WorldContentV2,
  ownerId: PlayerId,
  territoryId: TerritoryId,
): number {
  const connections = content.territories[territoryId]?.connections ?? [];
  if (connections.some((connection) => (
    connection.kind === 'land' && state.territories[connection.targetId]?.owner === ownerId
  ))) return 0;
  if (connections.some((connection) => state.territories[connection.targetId]?.owner === ownerId)) {
    return 1;
  }
  return 2;
}

/** Stable APEX work queue shared by simulation and distributed-network priority. */
export function selectApexSignalPurgeQueueV2(
  state: WorldStateV2,
  content: WorldContentV2,
  ownerId: PlayerId,
): TerritoryId[] {
  if (!isHumanPlayerV2(state, ownerId)) return [];
  return content.territoryIds.filter((territoryId) => {
    const territory = state.territories[territoryId];
    return territory?.owner === ownerId
      && territory.integrationProgram?.toOwnerId === ownerId
      && !(content.metadata?.scenarioId === 'survival'
        && state.runProgression.scorchedWorldTerritoryIds.includes(territoryId));
  }).sort((leftId, rightId) => {
    const left = state.territories[leftId]!;
    const right = state.territories[rightId]!;
    const progressOrder = right.integration - left.integration;
    if (Math.abs(progressOrder) > 1e-12) return progressOrder;
    const leftRemaining = Math.max(
      0,
      (left.integrationProgram?.completesTick ?? state.tick) - state.tick,
    );
    const rightRemaining = Math.max(
      0,
      (right.integrationProgram?.completesTick ?? state.tick) - state.tick,
    );
    return leftRemaining - rightRemaining
      || accessibilityRankV2(state, content, ownerId, leftId)
        - accessibilityRankV2(state, content, ownerId, rightId)
      || leftId.localeCompare(rightId);
  });
}

/** The single territory receiving APEX priority purge bandwidth. */
export function selectApexSignalPurgeFocusV2(
  state: WorldStateV2,
  content: WorldContentV2,
  ownerId: PlayerId,
): TerritoryId | undefined {
  return selectApexSignalPurgeQueueV2(state, content, ownerId)[0];
}
