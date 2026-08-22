import { describe, expect, it } from 'vitest';
import { CONQUEST_INITIAL_INTEGRATION_SHARE } from './balance';
import { createWorldStateV2 } from './bootstrap';
import {
  stateTerritoryArmyCapacityTargetV2,
  synchronizeArmyCapacityV2,
} from './capacity';
import { WORLD_CONTENT_V2 } from './content';
import {
  advanceTerritoryIntegrationProgramsV2,
  beginTerritoryIntegrationV2,
  territoryIntegrationAnnualCostV2,
  territoryIntegrationDurationWeeksV2,
} from './integration';
import { createSaveV2, loadSaveV2 } from './persistence';
import { nationIdV2, territoryIdV2 } from './types';

const belgium = nationIdV2('bel');
const luxembourg = nationIdV2('lux');
const netherlands = nationIdV2('nld');
const belgiumTerritory = territoryIdV2('bel');
const luxembourgTerritory = territoryIdV2('lux');

function conservedWorldTotals(state: ReturnType<typeof createWorldStateV2>) {
  const territoryTotals = Object.values(state.territories).reduce((totals, territory) => ({
    population: totals.population + territory.population,
    economy: totals.economy + territory.economy,
    manpower: totals.manpower + territory.army.manpower,
  }), { population: 0, economy: 0, manpower: 0 });
  return {
    ...territoryTotals,
    trainedReserves: Object.values(state.players)
      .reduce((sum, nation) => sum + nation.trainedReserves, 0),
  };
}

describe('V2 permanent territory integration lifecycle', () => {
  it('keeps the former core identity until the fixed calendar completes', () => {
    const state = createWorldStateV2(260822);
    const territory = state.territories[luxembourgTerritory];
    const duration = territoryIntegrationDurationWeeksV2(WORLD_CONTENT_V2, luxembourgTerritory);
    const routesBefore = WORLD_CONTENT_V2.territories[luxembourgTerritory].connections;
    state.players[belgium].trainedReserves = 1.234567;
    state.players[luxembourg].trainedReserves = 2.345678;
    const combinedReservesBefore = state.players[belgium].trainedReserves
      + state.players[luxembourg].trainedReserves;
    const worldTotalsBefore = conservedWorldTotals(state);
    const durableTerritoryStatsBefore = {
      population: territory.population,
      economy: territory.economy,
      condition: territory.condition,
      manpower: territory.army.manpower,
      baseAttack: territory.army.baseAttack,
      baseDefense: territory.army.baseDefense,
    };
    state.players[luxembourg].research.effectLevels.attack = 3;
    state.players[belgium].research.effectLevels.attack = 1;

    beginTerritoryIntegrationV2(state, WORLD_CONTENT_V2, luxembourgTerritory, belgium);

    expect(territory.owner).toBe(belgium);
    expect(territory.coreOwner).toBe(luxembourg);
    expect(territory.integration).toBe(CONQUEST_INITIAL_INTEGRATION_SHARE);
    expect(territory.integrationProgram).toEqual({
      fromOwnerId: luxembourg,
      fromCoreOwnerId: luxembourg,
      toOwnerId: belgium,
      startedTick: 0,
      completesTick: duration,
      annualCost: territoryIntegrationAnnualCostV2(territory.economy),
    });

    const halfwayWeek = Math.floor(duration / 2);
    for (let week = 1; week <= halfwayWeek; week += 1) {
      state.tick = week;
      expect(advanceTerritoryIntegrationProgramsV2(state, WORLD_CONTENT_V2)).toEqual([]);
    }
    expect(territory.integration).toBeCloseTo(
      CONQUEST_INITIAL_INTEGRATION_SHARE
        + (1 - CONQUEST_INITIAL_INTEGRATION_SHARE) * halfwayWeek / duration,
      10,
    );
    expect(territory.coreOwner).toBe(luxembourg);

    for (let week = halfwayWeek + 1; week <= duration; week += 1) {
      state.tick = week;
      const completions = advanceTerritoryIntegrationProgramsV2(state, WORLD_CONTENT_V2);
      expect(completions).toHaveLength(week === duration ? 1 : 0);
    }

    expect(territory.integration).toBe(1);
    expect(territory.coreOwner).toBe(belgium);
    expect(territory.integrationProgram).toBeUndefined();
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    expect(territory.army.capacity).toBeCloseTo(
      stateTerritoryArmyCapacityTargetV2(
        state,
        WORLD_CONTENT_V2,
        luxembourgTerritory,
        belgium,
      ),
      9,
    );
    expect({
      population: territory.population,
      economy: territory.economy,
      condition: territory.condition,
      manpower: territory.army.manpower,
      baseAttack: territory.army.baseAttack,
      baseDefense: territory.army.baseDefense,
    }).toEqual(durableTerritoryStatsBefore);
    const worldTotalsAfter = conservedWorldTotals(state);
    expect({ ...worldTotalsAfter, trainedReserves: worldTotalsBefore.trainedReserves })
      .toEqual(worldTotalsBefore);
    expect(worldTotalsAfter.trainedReserves).toBeCloseTo(worldTotalsBefore.trainedReserves, 6);
    expect(state.players[belgium].trainedReserves).toBeCloseTo(combinedReservesBefore, 6);
    expect(state.players[luxembourg].trainedReserves).toBe(0);
    expect(state.players[belgium].research.effectLevels.attack).toBe(3);
    // The map snapshot is a direct projection of these canonical fields. Once
    // owner and core owner match, no former flag, integration boundary or old
    // country label remains eligible for rendering.
    const mapTerritory = {
      ownerId: territory.owner,
      coreOwnerId: territory.coreOwner,
      integration: territory.integration,
      integrationCompletesTick: territory.integrationProgram?.completesTick,
    };
    expect(mapTerritory).toEqual({
      ownerId: belgium,
      coreOwnerId: belgium,
      integration: 1,
      integrationCompletesTick: undefined,
    });
    expect(mapTerritory.coreOwnerId !== mapTerritory.ownerId
      && mapTerritory.integration < 0.999999).toBe(false);
    expect(Object.values(state.territories).some((candidate) => (
      candidate.owner === luxembourg || candidate.coreOwner === luxembourg
    ))).toBe(false);
    // The dormant nation record stays deterministic, but no territory or map
    // identity can still treat it as a living country.
    expect(state.players[luxembourg]).toBeDefined();
    expect(WORLD_CONTENT_V2.territories[luxembourgTerritory].connections).toBe(routesBefore);
    expect(state.events.at(-1)?.message).toContain('permanent core territory');

    const reloaded = loadSaveV2(createSaveV2(state, WORLD_CONTENT_V2), WORLD_CONTENT_V2);
    const reloadedTerritory = reloaded.territories[luxembourgTerritory];
    expect(reloadedTerritory.owner).toBe(belgium);
    expect(reloadedTerritory.coreOwner).toBe(belgium);
    expect(reloadedTerritory.integration).toBe(1);
    expect(reloadedTerritory.integrationProgram).toBeUndefined();
    expect(Object.values(reloaded.territories).some((candidate) => (
      candidate.owner === luxembourg || candidate.coreOwner === luxembourg
    ))).toBe(false);
  });

  it('waits for the final former-core reference before merging durable knowledge', () => {
    const state = createWorldStateV2(260826);
    const luxembourgState = state.territories[luxembourgTerritory];
    const belgiumState = state.territories[belgiumTerritory];
    state.players[luxembourg].research.effectLevels.attack = 9;
    state.players[netherlands].research.effectLevels.attack = 1;
    state.players[luxembourg].trainedReserves = 1.25;
    state.players[netherlands].trainedReserves = 0.5;

    beginTerritoryIntegrationV2(state, WORLD_CONTENT_V2, luxembourgTerritory, netherlands);
    // Model a second territory that still carries the same former national
    // core. Its later completion keeps the old identity alive after the first.
    belgiumState.coreOwner = luxembourg;
    beginTerritoryIntegrationV2(state, WORLD_CONTENT_V2, belgiumTerritory, netherlands);
    luxembourgState.integrationProgram!.completesTick = 10;
    belgiumState.integrationProgram!.completesTick = 20;

    state.tick = 10;
    expect(advanceTerritoryIntegrationProgramsV2(state, WORLD_CONTENT_V2)).toEqual([{
      territoryId: luxembourgTerritory,
      formerCoreOwnerId: luxembourg,
      ownerId: netherlands,
    }]);
    expect(luxembourgState.coreOwner).toBe(netherlands);
    expect(belgiumState.coreOwner).toBe(luxembourg);
    expect(state.players[netherlands].research.effectLevels.attack).toBe(1);
    expect(state.players[netherlands].trainedReserves).toBe(0.5);
    expect(state.players[luxembourg].trainedReserves).toBe(1.25);

    state.tick = 20;
    expect(advanceTerritoryIntegrationProgramsV2(state, WORLD_CONTENT_V2)).toEqual([{
      territoryId: belgiumTerritory,
      formerCoreOwnerId: luxembourg,
      ownerId: netherlands,
    }]);
    expect(Object.values(state.territories).some((territory) => (
      territory.owner === luxembourg || territory.coreOwner === luxembourg
    ))).toBe(false);
    expect(state.players[netherlands].research.effectLevels.attack).toBe(9);
    expect(state.players[netherlands].trainedReserves).toBe(1.75);
    expect(state.players[luxembourg].trainedReserves).toBe(0);
  });

  it('restores full core status immediately when the sovereign core recaptures its land', () => {
    const state = createWorldStateV2(260823);
    const territory = state.territories[luxembourgTerritory];
    beginTerritoryIntegrationV2(state, WORLD_CONTENT_V2, luxembourgTerritory, belgium);
    state.tick = 200;
    advanceTerritoryIntegrationProgramsV2(state, WORLD_CONTENT_V2);

    beginTerritoryIntegrationV2(state, WORLD_CONTENT_V2, luxembourgTerritory, luxembourg);

    expect(territory.owner).toBe(luxembourg);
    expect(territory.coreOwner).toBe(luxembourg);
    expect(territory.integration).toBe(1);
    expect(territory.integrationProgram).toBeUndefined();
  });

  it('resets a partial occupation when a third empire takes control', () => {
    const state = createWorldStateV2(260824);
    const territory = state.territories[luxembourgTerritory];
    const duration = territoryIntegrationDurationWeeksV2(WORLD_CONTENT_V2, luxembourgTerritory);
    beginTerritoryIntegrationV2(state, WORLD_CONTENT_V2, luxembourgTerritory, belgium);
    for (let week = 1; week <= 100; week += 1) {
      state.tick = week;
      advanceTerritoryIntegrationProgramsV2(state, WORLD_CONTENT_V2);
    }
    expect(territory.integration).toBeGreaterThan(CONQUEST_INITIAL_INTEGRATION_SHARE);

    beginTerritoryIntegrationV2(state, WORLD_CONTENT_V2, luxembourgTerritory, netherlands);

    expect(territory.owner).toBe(netherlands);
    expect(territory.coreOwner).toBe(luxembourg);
    expect(territory.integration).toBe(CONQUEST_INITIAL_INTEGRATION_SHARE);
    expect(territory.integrationProgram).toEqual({
      fromOwnerId: belgium,
      fromCoreOwnerId: luxembourg,
      toOwnerId: netherlands,
      startedTick: 100,
      completesTick: 100 + duration,
      annualCost: territoryIntegrationAnnualCostV2(territory.economy),
    });
  });

  it('merges both an eliminated exiled sovereign and the absorbed former core', () => {
    const state = createWorldStateV2(260825);
    const luxembourgDuration = territoryIntegrationDurationWeeksV2(
      WORLD_CONTENT_V2,
      luxembourgTerritory,
    );
    state.players[luxembourg].research.progress['advanced-weapons'] = 44;
    state.players[luxembourg].research.effectLevels.attack = 5;
    state.players[belgium].research.breakthroughs['defensive-systems'] = 3;
    state.players[belgium].research.effectLevels.defense = 6;
    state.players[netherlands].research.progress['advanced-weapons'] = 2;
    state.players[netherlands].research.effectLevels.attack = 1;
    state.players[netherlands].research.effectLevels.defense = 1;

    // Luxembourg first becomes an exiled empire by taking Belgium, then loses
    // its own sovereign core while it still survives on the Belgian core.
    beginTerritoryIntegrationV2(state, WORLD_CONTENT_V2, belgiumTerritory, luxembourg);
    beginTerritoryIntegrationV2(state, WORLD_CONTENT_V2, luxembourgTerritory, netherlands);
    state.tick = luxembourgDuration;
    advanceTerritoryIntegrationProgramsV2(state, WORLD_CONTENT_V2);

    expect(state.territories[luxembourgTerritory].coreOwner).toBe(netherlands);
    expect(state.territories[belgiumTerritory].owner).toBe(luxembourg);

    // Capturing the exile's last territory records Luxembourg as the displaced
    // sovereign and Belgium as the underlying core identity.
    beginTerritoryIntegrationV2(state, WORLD_CONTENT_V2, belgiumTerritory, netherlands);
    const finalProgram = state.territories[belgiumTerritory].integrationProgram!;
    expect(finalProgram).toMatchObject({
      fromOwnerId: luxembourg,
      fromCoreOwnerId: belgium,
      toOwnerId: netherlands,
    });
    state.tick = finalProgram.completesTick;
    advanceTerritoryIntegrationProgramsV2(state, WORLD_CONTENT_V2);

    expect(Object.values(state.territories).some((territory) => territory.owner === luxembourg)).toBe(false);
    expect(Object.values(state.territories).some((territory) => territory.owner === belgium)).toBe(false);
    expect(state.players[netherlands].research.progress['advanced-weapons']).toBe(44);
    expect(state.players[netherlands].research.breakthroughs['defensive-systems']).toBe(3);
    expect(state.players[netherlands].research.effectLevels.attack).toBe(5);
    expect(state.players[netherlands].research.effectLevels.defense).toBe(6);
  });
});
