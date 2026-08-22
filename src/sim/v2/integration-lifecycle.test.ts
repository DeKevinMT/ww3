import { describe, expect, it } from 'vitest';
import { CONQUEST_INITIAL_INTEGRATION_SHARE } from './balance';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import {
  advanceTerritoryIntegrationProgramsV2,
  beginTerritoryIntegrationV2,
  territoryIntegrationAnnualCostV2,
  territoryIntegrationDurationWeeksV2,
} from './integration';
import { nationIdV2, territoryIdV2 } from './types';

const belgium = nationIdV2('bel');
const luxembourg = nationIdV2('lux');
const netherlands = nationIdV2('nld');
const belgiumTerritory = territoryIdV2('bel');
const luxembourgTerritory = territoryIdV2('lux');

describe('V2 permanent territory integration lifecycle', () => {
  it('keeps the former core identity until the fixed calendar completes', () => {
    const state = createWorldStateV2(260822);
    const territory = state.territories[luxembourgTerritory];
    const duration = territoryIntegrationDurationWeeksV2(WORLD_CONTENT_V2, luxembourgTerritory);
    const routesBefore = WORLD_CONTENT_V2.territories[luxembourgTerritory].connections;
    state.players[luxembourg].combatExperience = 25;
    state.players[belgium].combatExperience = 4;
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

    for (let week = 1; week <= duration / 2; week += 1) {
      state.tick = week;
      expect(advanceTerritoryIntegrationProgramsV2(state, WORLD_CONTENT_V2)).toEqual([]);
    }
    expect(territory.integration).toBeCloseTo(0.55, 8);
    expect(territory.coreOwner).toBe(luxembourg);
    expect(state.players[belgium].combatExperience).toBe(4);

    for (let week = duration / 2 + 1; week <= duration; week += 1) {
      state.tick = week;
      const completions = advanceTerritoryIntegrationProgramsV2(state, WORLD_CONTENT_V2);
      expect(completions).toHaveLength(week === duration ? 1 : 0);
    }

    expect(territory.integration).toBe(1);
    expect(territory.coreOwner).toBe(belgium);
    expect(territory.integrationProgram).toBeUndefined();
    expect(state.players[belgium].combatExperience).toBe(25);
    expect(state.players[belgium].research.effectLevels.attack).toBe(3);
    expect(WORLD_CONTENT_V2.territories[luxembourgTerritory].connections).toBe(routesBefore);
    expect(state.events.at(-1)?.message).toContain('permanent core territory');
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
    state.players[luxembourg].combatExperience = 36;
    state.players[luxembourg].research.progress['advanced-weapons'] = 44;
    state.players[luxembourg].research.effectLevels.attack = 5;
    state.players[belgium].combatExperience = 16;
    state.players[belgium].research.breakthroughs['defensive-systems'] = 3;
    state.players[belgium].research.effectLevels.defense = 6;
    state.players[netherlands].combatExperience = 1;
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
    expect(state.players[netherlands].combatExperience).toBe(1);

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
    expect(state.players[netherlands].combatExperience).toBe(36);
    expect(state.players[netherlands].research.progress['advanced-weapons']).toBe(44);
    expect(state.players[netherlands].research.breakthroughs['defensive-systems']).toBe(3);
    expect(state.players[netherlands].research.effectLevels.attack).toBe(5);
    expect(state.players[netherlands].research.effectLevels.defense).toBe(6);
  });
});
