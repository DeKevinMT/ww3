import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { synchronizeArmyCapacityV2 } from './capacity';
import { WORLD_CONTENT_V2 } from './content';
import {
  advanceTerritoryIntegrationProgramsV2,
  beginTerritoryIntegrationV2,
} from './integration';
import {
  canonicalStateHashV2,
  createSaveV2,
  loadSaveV2,
} from './persistence';
import { nationIdV2, territoryIdV2 } from './types';

const belgium = nationIdV2('bel');
const luxembourg = nationIdV2('lux');
const luxembourgTerritory = territoryIdV2('lux');

function createActivePurge(seed: number) {
  const state = createWorldStateV2(seed, WORLD_CONTENT_V2);
  beginTerritoryIntegrationV2(
    state,
    WORLD_CONTENT_V2,
    luxembourgTerritory,
    belgium,
    'land',
  );
  state.players[belgium]!.warFatigue = 100;
  return state;
}

function advanceThroughTick(
  state: ReturnType<typeof createWorldStateV2>,
  finalTick: number,
): void {
  while (state.tick < finalTick) {
    state.tick += 1;
    advanceTerritoryIntegrationProgramsV2(state, WORLD_CONTENT_V2);
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
  }
}

describe('stable Signal Purge', () => {
  it('never rolls back ownership at any point in the calendar, even at maximum fatigue', () => {
    for (let seed = 1; seed <= 32; seed += 1) {
      const state = createActivePurge(seed);
      const program = state.territories[luxembourgTerritory]!.integrationProgram!;
      let previousIntegration = state.territories[luxembourgTerritory]!.integration;

      while (state.tick + 1 < program.completesTick) {
        state.tick += 1;
        expect(advanceTerritoryIntegrationProgramsV2(state, WORLD_CONTENT_V2)).toEqual([]);
        synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
        const territory = state.territories[luxembourgTerritory]!;
        expect(territory.owner).toBe(belgium);
        expect(territory.coreOwner).toBe(luxembourg);
        expect(territory.integrationProgram).toBeDefined();
        expect(territory.integration).toBeGreaterThan(previousIntegration);
        previousIntegration = territory.integration;
      }

      state.tick = program.completesTick;
      expect(advanceTerritoryIntegrationProgramsV2(state, WORLD_CONTENT_V2))
        .toEqual([{ territoryId: luxembourgTerritory, formerCoreOwnerId: luxembourg, ownerId: belgium }]);
      expect(state.territories[luxembourgTerritory]).toMatchObject({
        owner: belgium,
        coreOwner: belgium,
        integration: 1,
      });
      expect(state.territories[luxembourgTerritory]!.integrationProgram).toBeUndefined();
    }
  });

  it('stores no hidden rollback schedule and resumes the same progress after save/load', () => {
    const uninterrupted = createActivePurge(97_101);
    const program = uninterrupted.territories[luxembourgTerritory]!.integrationProgram!;
    expect(Object.keys(program).some((key) => /revolt|revolution|uprising|secession/i.test(key)))
      .toBe(false);

    const midpoint = program.startedTick
      + Math.floor((program.completesTick - program.startedTick) / 2);
    advanceThroughTick(uninterrupted, midpoint);
    const resumed = loadSaveV2(
      createSaveV2(uninterrupted, WORLD_CONTENT_V2),
      WORLD_CONTENT_V2,
    );

    expect(resumed.territories[luxembourgTerritory]).toEqual(
      uninterrupted.territories[luxembourgTerritory],
    );
    advanceThroughTick(uninterrupted, program.completesTick);
    advanceThroughTick(resumed, program.completesTick);

    expect(resumed.territories[luxembourgTerritory]).toEqual(
      uninterrupted.territories[luxembourgTerritory],
    );
    expect(canonicalStateHashV2(createSaveV2(resumed, WORLD_CONTENT_V2)))
      .toBe(canonicalStateHashV2(createSaveV2(uninterrupted, WORLD_CONTENT_V2)));
  });
});
