import type {
  CommanderFrontAssignmentV2,
  CommanderMissionV2,
  FrontOperationV2,
  PlayerId,
  TerritoryId,
  TerritoryStateV2,
  WarStateV2,
} from '../sim/v2/types';
import { selectCanonicalWarFrontV2 } from '../sim/v2/selectors';

export interface ApexFrontFocusPlanV2 {
  readonly allowed: boolean;
  readonly reason?: string;
  readonly mission?: CommanderMissionV2;
  readonly destinationId?: TerritoryId;
  readonly hostileTerritoryId?: TerritoryId;
  readonly front?: CommanderFrontAssignmentV2;
}

export interface ApexFrontPriorityInputV2 {
  readonly warId: string;
  readonly sourceId: TerritoryId;
  readonly targetId: TerritoryId;
  readonly access: FrontOperationV2['access'];
  readonly mission: Extract<CommanderMissionV2, 'assault-support' | 'defense'>;
  readonly ownPower: number;
  readonly enemyPower: number;
  readonly antarcticObjective: boolean;
}

/**
 * Resolves one exact active front to the friendly staging territory APEX may
 * legally receive as an order. The actual path remains canonical simulation
 * work, so this helper can never permit an enemy-border teleport.
 */
export function planApexFrontFocusV2(
  territories: Readonly<Record<TerritoryId, TerritoryStateV2>>,
  playerId: PlayerId,
  war: Pick<WarStateV2, 'id' | 'attackerOperations' | 'defenderOperations'>,
  sourceId: TerritoryId,
  targetId: TerritoryId,
): ApexFrontFocusPlanV2 {
  const canonical = selectCanonicalWarFrontV2(war);
  const operation = canonical?.sourceId === sourceId && canonical.targetId === targetId
    ? canonical : undefined;
  if (!operation) return { allowed: false, reason: 'That front is no longer active.' };

  const sourceOwned = territories[sourceId]?.owner === playerId;
  const targetOwned = territories[targetId]?.owner === playerId;
  if (sourceOwned === targetOwned) {
    return { allowed: false, reason: 'EONSCAR needs one friendly side of the selected front.' };
  }
  const mission = sourceOwned ? 'assault-support' : 'defense';
  return {
    allowed: true,
    mission,
    destinationId: sourceOwned ? sourceId : targetId,
    hostileTerritoryId: sourceOwned ? targetId : sourceId,
    front: { warId: war.id, sourceId, targetId },
  };
}

function finitePower(value: number): number {
  return Number.isFinite(value) ? Math.max(0.000_001, value) : 0.000_001;
}

export function apexFrontPriorityScoreV2(
  input: ApexFrontPriorityInputV2,
  mode: 'campaign' | 'survival',
): number {
  const ownPower = finitePower(input.ownPower);
  const enemyPower = finitePower(input.enemyPower);
  const pressure = input.mission === 'defense'
    ? Math.min(4, enemyPower / ownPower)
    : Math.min(4, ownPower / enemyPower);
  const urgency = input.mission === 'defense' ? 70 + pressure * 20 : 45 + pressure * 15;
  const landContinuity = input.access === 'land' ? (mode === 'survival' ? 24 : 10) : 0;
  const antarcticPriority = input.antarcticObjective ? 18 : 0;
  return urgency + landContinuity + antarcticPriority;
}

/** Stable ordering makes save/reconnect and multiplayer clients show the same fronts. */
export function rankApexFrontPrioritiesV2<T extends ApexFrontPriorityInputV2>(
  inputs: readonly T[],
  mode: 'campaign' | 'survival',
): T[] {
  return [...inputs].sort((left, right) => (
    apexFrontPriorityScoreV2(right, mode) - apexFrontPriorityScoreV2(left, mode)
      || left.warId.localeCompare(right.warId)
      || left.sourceId.localeCompare(right.sourceId)
      || left.targetId.localeCompare(right.targetId)
  ));
}
