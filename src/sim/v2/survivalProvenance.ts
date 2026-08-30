import { round } from './balance';
import { ROGUE_AI_NATION_ID_V2 } from './content';
import type { PlayerId, TerritoryId, WorldStateV2 } from './types';

const EPSILON = 0.000000001;

function rogueInvasionState(
  state: Pick<WorldStateV2, 'contentVersion' | 'polarEndgame'>,
): boolean {
  return state.contentVersion.startsWith('survival-v')
    || state.polarEndgame.phase === 'contact'
    || state.polarEndgame.phase === 'counteroffensive'
    || state.polarEndgame.phase === 'core-exposed';
}

function writeWaveManpowerV2(
  state: WorldStateV2,
  territoryId: TerritoryId,
  manpower: number,
): void {
  const territory = state.territories[territoryId];
  const canonical = territory?.owner === ROGUE_AI_NATION_ID_V2
    ? round(Math.min(Math.max(0, manpower), Math.max(0, territory.army.manpower)), 9)
    : 0;
  if (canonical > EPSILON) {
    state.polarEndgame.rogueWaveManpowerByTerritory[territoryId] = canonical;
  } else {
    delete state.polarEndgame.rogueWaveManpowerByTerritory[territoryId];
  }
}

/** Eligible personnel currently present at one territory, clamped to the live army. */
export function rogueWaveManpowerAtV2(
  state: WorldStateV2,
  territoryId: TerritoryId,
): number {
  if (!rogueInvasionState(state)) return 0;
  const territory = state.territories[territoryId];
  if (!territory || territory.owner !== ROGUE_AI_NATION_ID_V2) return 0;
  return round(Math.min(
    Math.max(0, state.polarEndgame.rogueWaveManpowerByTerritory[territoryId] ?? 0),
    Math.max(0, territory.army.manpower),
  ), 9);
}

/** Marks only newly staged Zero-Point wave personnel as reward eligible. */
export function addRogueWaveManpowerV2(
  state: WorldStateV2,
  territoryId: TerritoryId,
  manpower: number,
): void {
  if (!rogueInvasionState(state) || !Number.isFinite(manpower) || manpower <= 0) return;
  writeWaveManpowerV2(
    state,
    territoryId,
    rogueWaveManpowerAtV2(state, territoryId) + manpower,
  );
}

/**
 * Carries wave identity with an ordinary one-hop transfer. Outbound wave
 * personnel move first, so a staged wave remains a visible coherent convoy
 * instead of being diluted into the enormous pre-existing core garrison.
 */
export function transferRogueWaveManpowerV2(
  state: WorldStateV2,
  sourceId: TerritoryId,
  targetId: TerritoryId,
  movedManpower: number,
  sourceManpowerBefore = state.territories[sourceId]?.army.manpower ?? 0,
): number {
  if (!rogueInvasionState(state) || !Number.isFinite(movedManpower) || movedManpower <= 0) return 0;
  const source = state.territories[sourceId];
  const target = state.territories[targetId];
  if (!source || !target || source.owner !== ROGUE_AI_NATION_ID_V2
    || target.owner !== ROGUE_AI_NATION_ID_V2) return 0;
  const eligibleAtSource = round(Math.min(
    Math.max(0, state.polarEndgame.rogueWaveManpowerByTerritory[sourceId] ?? 0),
    Math.max(0, sourceManpowerBefore),
  ), 9);
  const transferred = round(Math.min(eligibleAtSource, movedManpower), 9);
  if (transferred <= EPSILON) return 0;
  writeWaveManpowerV2(state, sourceId, eligibleAtSource - transferred);
  writeWaveManpowerV2(
    state,
    targetId,
    rogueWaveManpowerAtV2(state, targetId) + transferred,
  );
  return transferred;
}

/** Generic non-combat shrinkage removes the same share of eligible personnel. */
export function reconcileRogueWaveManpowerAfterChangeV2(
  state: WorldStateV2,
  territoryId: TerritoryId,
  manpowerBefore: number,
): void {
  const eligibleBefore = Math.min(
    Math.max(0, state.polarEndgame.rogueWaveManpowerByTerritory[territoryId] ?? 0),
    Math.max(0, manpowerBefore),
  );
  const manpowerAfter = Math.max(0, state.territories[territoryId]?.army.manpower ?? 0);
  if (eligibleBefore <= EPSILON) {
    delete state.polarEndgame.rogueWaveManpowerByTerritory[territoryId];
    return;
  }
  if (manpowerAfter + EPSILON >= manpowerBefore) {
    writeWaveManpowerV2(state, territoryId, eligibleBefore);
    return;
  }
  const survivingShare = manpowerBefore > EPSILON ? manpowerAfter / manpowerBefore : 0;
  writeWaveManpowerV2(state, territoryId, eligibleBefore * survivingShare);
}

/**
 * Removes the proportional eligible share of actual regular-army casualties
 * and credits it only to the human who inflicted those losses.
 */
export function recordRogueWaveCasualtiesV2(
  state: WorldStateV2,
  territoryId: TerritoryId,
  manpowerBefore: number,
  casualties: number,
  creditedPlayerId: PlayerId,
): number {
  if (!rogueInvasionState(state) || !Number.isFinite(casualties) || casualties <= 0) return 0;
  const eligibleBefore = Math.min(
    Math.max(0, state.polarEndgame.rogueWaveManpowerByTerritory[territoryId] ?? 0),
    Math.max(0, manpowerBefore),
  );
  if (eligibleBefore <= EPSILON || manpowerBefore <= EPSILON) return 0;
  const eligibleLoss = round(Math.min(
    eligibleBefore,
    casualties * eligibleBefore / manpowerBefore,
  ), 9);
  writeWaveManpowerV2(state, territoryId, eligibleBefore - eligibleLoss);
  // Provenance must shrink for every real casualty. Credit is narrower: only
  // a human opponent can turn those verified machine losses into progression.
  if (eligibleLoss > EPSILON && state.humanPlayerIds.includes(creditedPlayerId)) {
    state.polarEndgame.rogueWaveLossCreditByPlayer[creditedPlayerId] = round(
      (state.polarEndgame.rogueWaveLossCreditByPlayer[creditedPlayerId] ?? 0)
        + eligibleLoss,
      9,
    );
  }
  return state.humanPlayerIds.includes(creditedPlayerId) ? eligibleLoss : 0;
}

/** Removes provenance when a formation surrenders or leaves machine control. */
export function clearRogueWaveManpowerV2(
  state: WorldStateV2,
  territoryId: TerritoryId,
): void {
  delete state.polarEndgame.rogueWaveManpowerByTerritory[territoryId];
}

export function rogueWaveLossCreditV2(
  state: WorldStateV2,
  playerId: PlayerId,
): number {
  return round(Math.max(
    0,
    state.polarEndgame.rogueWaveLossCreditByPlayer?.[playerId] ?? 0,
  ), 9);
}

/** PRIME is itself verified Antarctic-origin force, without placeholder share. */
export function recordRoguePrimeCasualtiesV2(
  state: WorldStateV2,
  casualties: number,
  creditedPlayerId: PlayerId,
): number {
  if (!rogueInvasionState(state) || !Number.isFinite(casualties) || casualties <= 0
    || !state.humanPlayerIds.includes(creditedPlayerId)) return 0;
  const eligibleLoss = round(casualties, 9);
  state.polarEndgame.rogueWaveLossCreditByPlayer[creditedPlayerId] = round(
    (state.polarEndgame.rogueWaveLossCreditByPlayer[creditedPlayerId] ?? 0)
      + eligibleLoss,
    9,
  );
  return eligibleLoss;
}
