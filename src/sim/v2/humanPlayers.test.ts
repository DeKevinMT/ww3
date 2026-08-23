import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { isHumanPlayerV2, selectHumanPlayerIdsV2 } from './humanPlayers';
import { nationIdV2 } from './types';

describe('human player helpers', () => {
  it('falls back to the primary country for legacy solo state', () => {
    const state = createWorldStateV2(41, WORLD_CONTENT_V2);
    delete (state as typeof state & { humanPlayerIds?: unknown }).humanPlayerIds;

    expect(selectHumanPlayerIdsV2(state)).toEqual([state.humanPlayerId]);
    expect(isHumanPlayerV2(state, state.humanPlayerId)).toBe(true);
  });

  it('deduplicates and sorts a configured multiplayer roster', () => {
    const state = createWorldStateV2(42, WORLD_CONTENT_V2);
    const belgium = nationIdV2('bel');
    const canada = nationIdV2('can');
    state.humanPlayerId = belgium;
    (state as typeof state & { humanPlayerIds: typeof state.humanPlayerId[] }).humanPlayerIds = [canada, belgium, canada];

    expect(selectHumanPlayerIdsV2(state)).toEqual([belgium, canada]);
    expect(isHumanPlayerV2(state, canada)).toBe(true);
  });

  it('treats a replaced primary id as a focused solo state', () => {
    const state = createWorldStateV2(43, WORLD_CONTENT_V2);
    const formerPrimary = state.humanPlayerId;
    const canada = nationIdV2('can');
    (state as typeof state & { humanPlayerIds: typeof state.humanPlayerId[] }).humanPlayerIds = [formerPrimary];
    state.humanPlayerId = canada;

    expect(selectHumanPlayerIdsV2(state)).toEqual([canada]);
    expect(isHumanPlayerV2(state, formerPrimary)).toBe(false);
  });

  it('keeps an absorbed multiplayer seat in the human spectator roster', () => {
    const state = createWorldStateV2(44, WORLD_CONTENT_V2);
    const belgium = nationIdV2('bel');
    const canada = nationIdV2('can');
    state.humanPlayerId = belgium;
    state.humanPlayerIds = [belgium, canada];
    delete state.players[canada];

    expect(selectHumanPlayerIdsV2(state)).toEqual([belgium, canada]);
    expect(isHumanPlayerV2(state, canada)).toBe(true);
  });
});
