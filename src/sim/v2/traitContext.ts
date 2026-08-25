import type { WorldContentV2 } from './content';
import { isHumanPlayerV2 } from './humanPlayers';
import type {
  TraitEvaluationContextV2,
  TraitWarRoleV2,
} from './traits';
import { humanCountryTraitMultiplierForContentVersionV2 } from './traits';
import type {
  FrontOperationV2,
  PlayerId,
  TerritoryId,
  WarAccessV2,
  WarStateV2,
  WorldStateV2,
} from './types';

/**
 * Resolved together so territory-based hooks cannot accidentally look a trait
 * up through `coreOwner` or immutable opening ownership. The live owner is the
 * only country whose trait may affect a currently controlled territory.
 */
export interface TerritoryOwnerTraitContextV2 {
  readonly playerId: PlayerId;
  readonly context: TraitEvaluationContextV2;
}

const allWarOperationsV2 = (war: WarStateV2): readonly FrontOperationV2[] => (
  [...war.attackerOperations, ...war.defenderOperations]
);

const playerIsInWarV2 = (war: WarStateV2, activePlayerId: PlayerId): boolean => (
  war.attackerId === activePlayerId
  || war.defenderId === activePlayerId
  || allWarOperationsV2(war).some((operation) => operation.commanderId === activePlayerId)
);

/** Front scope belongs to the active country's war side, never its opponent's. */
const playerWarOperationsV2 = (
  war: WarStateV2,
  activePlayerId: PlayerId,
): readonly FrontOperationV2[] => {
  if (war.attackerId === activePlayerId) return war.attackerOperations;
  if (war.defenderId === activePlayerId) return war.defenderOperations;
  return allWarOperationsV2(war)
    .filter((operation) => operation.commanderId === activePlayerId);
};

const frontFlagsV2 = (operations: readonly FrontOperationV2[]): Pick<
  TraitEvaluationContextV2,
  'hasLandFront' | 'bothFronts'
> => {
  const hasLandFront = operations.some((operation) => operation.access === 'land');
  const hasNavalFront = operations.some((operation) => operation.access === 'naval');
  return Object.freeze({
    hasLandFront,
    bothFronts: hasLandFront && hasNavalFront,
  });
};

const singleAccessV2 = (operations: readonly FrontOperationV2[]): WarAccessV2 | undefined => {
  const accesses = new Set(operations.map((operation) => operation.access));
  return accesses.size === 1 ? accesses.values().next().value : undefined;
};

/**
 * Combines partial hook projections without mutating them. Undefined fields do
 * not erase an earlier, concrete value; later concrete values intentionally
 * win (for example, operation role overrides formal war role).
 */
export function composeTraitContextV2(
  ...contexts: readonly (TraitEvaluationContextV2 | undefined)[]
): TraitEvaluationContextV2 {
  const result: Record<string, unknown> = {};
  for (const context of contexts) {
    if (!context) continue;
    for (const [key, value] of Object.entries(context)) {
      if (value !== undefined) result[key] = value;
    }
  }
  return Object.freeze(result) as TraitEvaluationContextV2;
}

/** Immutable opening identity. Integration and empire fusion cannot change it. */
export function isTraitHomelandV2(
  content: WorldContentV2,
  activePlayerId: PlayerId,
  territoryId: TerritoryId,
): boolean {
  return content.territories[territoryId]?.initialOwnerId === activePlayerId;
}

/**
 * Raw national trait inputs read directly from canonical state. Front flags
 * are derived only from currently stored live operations on that country's
 * own side. A supporting operation commander counts as being at war even when
 * it is not a formal belligerent, but sees only operations it commands.
 */
export function traitNationContextV2(
  state: WorldStateV2,
  activePlayerId: PlayerId,
): TraitEvaluationContextV2 {
  const player = state.players[activePlayerId];
  const relevantWars = state.wars.filter((war) => playerIsInWarV2(war, activePlayerId));
  const liveOperations = relevantWars.flatMap((war) => (
    playerWarOperationsV2(war, activePlayerId)
  ));
  const humanControlled = isHumanPlayerV2(state, activePlayerId);
  return Object.freeze({
    humanControlled,
    humanTraitMultiplier: humanControlled
      ? humanCountryTraitMultiplierForContentVersionV2(activePlayerId, state.contentVersion)
      : undefined,
    atWar: relevantWars.length > 0,
    treasury: player?.treasury,
    foodSecurity: player?.foodSecurity,
    ...frontFlagsV2(liveOperations),
  });
}

/**
 * Local territory inputs for one explicitly supplied active country. Homeland
 * never follows `owner`, `coreOwner`, integration progress or empire name.
 */
export function traitTerritoryContextV2(
  state: WorldStateV2,
  content: WorldContentV2,
  activePlayerId: PlayerId,
  territoryId: TerritoryId,
): TraitEvaluationContextV2 {
  return Object.freeze({
    terrain: content.territories[territoryId]?.terrain,
    condition: state.territories[territoryId]?.condition,
    homeland: isTraitHomelandV2(content, activePlayerId, territoryId),
  });
}

/**
 * Local front access for territory-wide effects such as condition recovery.
 * Only an operation commanded by the live owner on that owner's own war side
 * can qualify. This deliberately ignores an opponent targeting the territory
 * and stale operations left behind by an absorbed commander. When both access
 * types touch the same territory, naval wins so a naval-scoped clause remains
 * active on that genuinely naval front.
 */
export function traitTerritoryFrontAccessV2(
  state: WorldStateV2,
  activePlayerId: PlayerId,
  territoryId: TerritoryId,
): Exclude<WarAccessV2, 'none'> | undefined {
  let hasLandAccess = false;
  let hasNavalAccess = false;
  for (const war of state.wars) {
    for (const operation of playerWarOperationsV2(war, activePlayerId)) {
      if (operation.commanderId !== activePlayerId
        || state.territories[operation.sourceId]?.owner !== activePlayerId
        || (operation.sourceId !== territoryId && operation.targetId !== territoryId)) continue;
      if (operation.access === 'naval') hasNavalAccess = true;
      if (operation.access === 'land') hasLandAccess = true;
    }
  }
  if (hasNavalAccess) return 'naval';
  if (hasLandAccess) return 'land';
  return undefined;
}

/**
 * Strategic context for one war. Formal belligerent role is useful outside a
 * battle pulse; `traitOperationContextV2` replaces it with the actual local
 * attacker/defender role during an operation.
 */
export function traitWarContextV2(
  war: WarStateV2,
  activePlayerId: PlayerId,
): TraitEvaluationContextV2 {
  const relevant = playerIsInWarV2(war, activePlayerId);
  const operations = relevant ? playerWarOperationsV2(war, activePlayerId) : [];
  let role: TraitWarRoleV2 | undefined;
  if (war.attackerId === activePlayerId
    || war.attackerOperations.some((operation) => operation.commanderId === activePlayerId)) {
    role = 'attacker';
  } else if (war.defenderId === activePlayerId
    || war.defenderOperations.some((operation) => operation.commanderId === activePlayerId)) {
    role = 'defender';
  }
  return Object.freeze({
    atWar: relevant,
    role,
    access: singleAccessV2(operations),
    ...frontFlagsV2(operations),
  });
}

/**
 * Complete operation context for the supplied actor. The operation commander
 * is the local attacker even during a counteroffensive; the live target owner
 * is the local defender. Terrain, condition and homeland are taken from that
 * actor's source or target respectively.
 */
export function traitOperationContextV2(
  state: WorldStateV2,
  content: WorldContentV2,
  war: WarStateV2,
  operation: FrontOperationV2,
  activePlayerId: PlayerId,
): TraitEvaluationContextV2 {
  const localRole: TraitWarRoleV2 | undefined = operation.commanderId === activePlayerId
    ? 'attacker'
    : state.territories[operation.targetId]?.owner === activePlayerId
      ? 'defender'
      : undefined;
  const relevantTerritoryId = localRole === 'attacker'
    ? operation.sourceId
    : localRole === 'defender'
      ? operation.targetId
      : undefined;

  return composeTraitContextV2(
    traitNationContextV2(state, activePlayerId),
    traitWarContextV2(war, activePlayerId),
    relevantTerritoryId
      ? traitTerritoryContextV2(state, content, activePlayerId, relevantTerritoryId)
      : undefined,
    localRole ? { atWar: true, role: localRole, access: operation.access } : undefined,
  );
}

/**
 * Safe entry point for territory-wide channels: lookup identity is always the
 * live active owner, while local homeland still uses immutable opening data.
 */
export function traitContextForTerritoryOwnerV2(
  state: WorldStateV2,
  content: WorldContentV2,
  territoryId: TerritoryId,
): TerritoryOwnerTraitContextV2 | undefined {
  const playerId = state.territories[territoryId]?.owner;
  if (!playerId) return undefined;
  return Object.freeze({
    playerId,
    context: composeTraitContextV2(
      traitNationContextV2(state, playerId),
      traitTerritoryContextV2(state, content, playerId, territoryId),
    ),
  });
}
