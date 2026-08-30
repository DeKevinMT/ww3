import { describe, expect, it } from 'vitest';
import { WorldEngineV2 } from './WorldEngineV2';
import { createWorldStateV2 } from './bootstrap';
import { initializeCommanderForceV2 } from './commanderForce';
import { WORLD_CONTENT_V2 } from './content';
import { beginTerritoryIntegrationV2 } from './integration';
import { createSaveV2, loadSaveV2 } from './persistence';
import { selectHumanEmpireDefeatWinnerV2 } from './humanPlayers';

function conqueredHumanState(seed: number) {
  const state = createWorldStateV2(seed, WORLD_CONTENT_V2);
  const humanId = state.humanPlayerId;
  const victorId = WORLD_CONTENT_V2.nationIds.find((id) => id !== humanId)!;
  expect(initializeCommanderForceV2(state, WORLD_CONTENT_V2, humanId, {
    manpower: 0.0008,
    capacity: 0.0008,
    trainedReserves: 0.00008,
    baseAttack: 125,
    baseDefense: 125,
    treasury: 0,
    annualOutput: 0.015,
    supplyStock: 0.010,
  }).accepted).toBe(true);
  for (const territoryId of WORLD_CONTENT_V2.territoryIds) {
    if (state.territories[territoryId]!.owner === humanId) {
      beginTerritoryIntegrationV2(state, WORLD_CONTENT_V2, territoryId, victorId);
    }
  }
  return { state, humanId, victorId };
}

describe('human territorial defeat', () => {
  it('ends the timeline when the last land is lost even while APEX still exists', () => {
    const { state, humanId, victorId } = conqueredHumanState(290_001);
    expect(state.commanderForces[humanId]).toBeDefined();
    expect(selectHumanEmpireDefeatWinnerV2(state)).toBe(victorId);

    const engine = new WorldEngineV2(state.seed, WORLD_CONTENT_V2, state);
    engine.step(1);

    expect(engine.state.gameOver).toBe(true);
    expect(engine.state.winnerId).toBe(victorId);
    expect(engine.state.speed).toBe(0);
    expect(engine.state.commanderForces[humanId]).toMatchObject({
      mission: 'standby',
      front: null,
      transit: null,
    });
    expect(engine.state.commanderForces[humanId]!.army.manpower).toBeGreaterThan(0);
  });

  it('does not end multiplayer while any human seat still controls land', () => {
    const { state, humanId } = conqueredHumanState(290_002);
    const secondHumanId = WORLD_CONTENT_V2.nationIds.find((id) => (
      id !== humanId && Object.values(state.territories).some((territory) => territory.owner === id)
    ))!;
    state.humanPlayerIds = [humanId, secondHumanId].sort((left, right) => left.localeCompare(right));
    expect(selectHumanEmpireDefeatWinnerV2(state)).toBeUndefined();
  });

  it('ends a landed empire when APEX is the only military force left', () => {
    const state = createWorldStateV2(290_004, WORLD_CONTENT_V2);
    const humanId = state.humanPlayerId;
    expect(initializeCommanderForceV2(state, WORLD_CONTENT_V2, humanId, {
      manpower: 0.0008,
      capacity: 0.0008,
      trainedReserves: 0.00008,
      baseAttack: 125,
      baseDefense: 125,
      treasury: 0,
      annualOutput: 0.015,
      supplyStock: 0.010,
    }).accepted).toBe(true);
    for (const territory of Object.values(state.territories)) {
      if (territory.owner === humanId) territory.army.manpower = 0;
    }
    state.players[humanId]!.trainedReserves = 0;

    const winnerId = selectHumanEmpireDefeatWinnerV2(state);
    expect(winnerId).toBeDefined();
    expect(winnerId).not.toBe(humanId);
    expect(state.commanderForces[humanId]!.army.manpower).toBeGreaterThan(0);

    const loaded = loadSaveV2(createSaveV2(state, WORLD_CONTENT_V2), WORLD_CONTENT_V2);
    expect(loaded.gameOver).toBe(true);
    expect(loaded.winnerId).toBe(winnerId);
    expect(loaded.commanderForces[humanId]!.army.manpower).toBeGreaterThan(0);
  });

  it('keeps the campaign alive when trained national reserves can still deploy', () => {
    const state = createWorldStateV2(290_005, WORLD_CONTENT_V2);
    const humanId = state.humanPlayerId;
    for (const territory of Object.values(state.territories)) {
      if (territory.owner === humanId) territory.army.manpower = 0;
    }
    state.players[humanId]!.trainedReserves = 0.000001;

    expect(selectHumanEmpireDefeatWinnerV2(state)).toBeUndefined();
  });

  it('reconstructs the same territorial defeat when an authenticated save is loaded', () => {
    const { state, humanId, victorId } = conqueredHumanState(290_003);
    // Active saves reconcile a stranded force before serialization; the
    // territorial defeat itself must still be reconstructed independently.
    delete state.commanderForces[humanId];
    const loaded = loadSaveV2(createSaveV2(state, WORLD_CONTENT_V2), WORLD_CONTENT_V2);

    expect(loaded.gameOver).toBe(true);
    expect(loaded.winnerId).toBe(victorId);
    expect(loaded.speed).toBe(0);
  });
});
