import { describe, expect, it } from 'vitest';
import { WorldEngineV2 } from './WorldEngineV2';
import { createWorldStateV2 } from './bootstrap';
import { synchronizeArmyCapacityV2 } from './capacity';
import { WORLD_CONTENT_V2 } from './content';
import {
  TERRITORY_INTEGRATION_REVOLUTION_CHANCE_V2,
  TERRITORY_INTEGRATION_REVOLUTION_WINDOW_END_V2,
  TERRITORY_INTEGRATION_REVOLUTION_WINDOW_START_V2,
  TERRITORY_REVOLUTION_LOCAL_ARMY_MAX_CAP_SHARE_V2,
  TERRITORY_REVOLUTION_LOCAL_ARMY_MIN_CAP_SHARE_V2,
  advanceTerritoryIntegrationProgramsV2,
  beginTerritoryIntegrationV2,
  processTerritoryIntegrationRevolutionsV2,
  territoryIntegrationRevolutionTickV2,
} from './integration';
import { assertInvariantsV2 } from './invariants';
import { canonicalStateHashV2, createSaveV2, loadSaveV2 } from './persistence';
import { sortedNationIdsV2 } from './selectors';
import { nationIdV2, territoryIdV2, type IntegrationProgramStateV2 } from './types';

const bel = nationIdV2('bel');
const lux = nationIdV2('lux');
const nld = nationIdV2('nld');
const luxTerritory = territoryIdV2('lux');
const belTerritory = territoryIdV2('bel');
const nldTerritory = territoryIdV2('nld');

function findDestinedSeed(program: IntegrationProgramStateV2): {
  seed: number;
  tick: number;
} {
  for (let seed = 1; seed <= 100_000; seed += 1) {
    const tick = territoryIntegrationRevolutionTickV2(
      { seed },
      luxTerritory,
      program,
    );
    if (tick !== undefined) return { seed, tick };
  }
  throw new Error('Expected at least one deterministic revolution seed.');
}

describe('V2 rare deterministic integration revolutions', () => {
  it('makes one stable two-percent program roll inside the 20–80 percent window', () => {
    const state = createWorldStateV2(71_001);
    beginTerritoryIntegrationV2(state, WORLD_CONTENT_V2, luxTerritory, bel);
    const program = state.territories[luxTerritory]!.integrationProgram!;
    const duration = program.completesTick - program.startedTick;
    let destined = 0;
    for (let seed = 1; seed <= 10_000; seed += 1) {
      const tick = territoryIntegrationRevolutionTickV2(
        { seed },
        luxTerritory,
        program,
      );
      expect(territoryIntegrationRevolutionTickV2(
        { seed },
        luxTerritory,
        program,
      )).toBe(tick);
      if (tick === undefined) continue;
      destined += 1;
      expect(tick).toBeGreaterThanOrEqual(
        program.startedTick + Math.ceil(
          duration * TERRITORY_INTEGRATION_REVOLUTION_WINDOW_START_V2,
        ),
      );
      expect(tick).toBeLessThanOrEqual(
        program.startedTick + Math.floor(
          duration * TERRITORY_INTEGRATION_REVOLUTION_WINDOW_END_V2,
        ),
      );
    }
    expect(TERRITORY_INTEGRATION_REVOLUTION_CHANCE_V2).toBe(0.02);
    expect(destined / 10_000).toBeGreaterThan(0.015);
    expect(destined / 10_000).toBeLessThan(0.025);
  });

  it('restores only the static 2026 owner after later fusion and creates no national resources or traits', () => {
    const state = createWorldStateV2(71_002);
    beginTerritoryIntegrationV2(state, WORLD_CONTENT_V2, luxTerritory, bel);
    state.tick = state.territories[luxTerritory]!.integrationProgram!.completesTick;
    advanceTerritoryIntegrationProgramsV2(state, WORLD_CONTENT_V2);
    expect(state.territories[luxTerritory]).toMatchObject({
      owner: bel,
      coreOwner: bel,
      integration: 1,
    });
    expect(state.players[lux]).toBeUndefined();

    beginTerritoryIntegrationV2(state, WORLD_CONTENT_V2, luxTerritory, nld);
    const program = state.territories[luxTerritory]!.integrationProgram!;
    expect(program).toMatchObject({
      fromOwnerId: bel,
      fromCoreOwnerId: bel,
      toOwnerId: nld,
    });
    const scheduled = findDestinedSeed(program);
    state.seed = scheduled.seed;
    state.players[nld]!.capitalId = luxTerritory;
    state.wars = [{
      id: 'revolution-operation-cleanup',
      attackerId: nld,
      defenderId: bel,
      startedTick: program.startedTick,
      lastBattleTick: program.startedTick,
      warScore: 0,
      battles: 0,
      attackerLosses: 0,
      defenderLosses: 0,
      attackerCivilianLosses: 0,
      defenderCivilianLosses: 0,
      lastPeaceOfferTick: -1,
      attackerOperations: [{
        commanderId: nld,
        sourceId: luxTerritory,
        targetId: belTerritory,
        doctrine: 'pressure',
        access: 'land',
        startedTick: program.startedTick,
        lastBattleTick: program.startedTick,
        holdUntilTick: program.startedTick + 12,
        momentum: 0,
      }],
      defenderOperations: [],
      revenge: null,
    }];
    const territory = state.territories[luxTerritory]!;
    const durableBefore = {
      population: territory.population,
      economy: territory.economy,
      condition: territory.condition,
    };
    state.tick = scheduled.tick;

    expect(processTerritoryIntegrationRevolutionsV2(
      state,
      WORLD_CONTENT_V2,
    )).toEqual([{
      territoryId: luxTerritory,
      displacedOwnerId: nld,
      restoredOwnerId: lux,
    }]);

    expect(territory).toMatchObject({
      owner: WORLD_CONTENT_V2.territories[luxTerritory]!.initialOwnerId,
      coreOwner: lux,
      integration: 1,
    });
    expect(territory.integrationProgram).toBeUndefined();
    expect({
      population: territory.population,
      economy: territory.economy,
      condition: territory.condition,
    }).toEqual(durableBefore);
    expect(territory.army.manpower).toBeGreaterThanOrEqual(
      territory.army.capacity * TERRITORY_REVOLUTION_LOCAL_ARMY_MIN_CAP_SHARE_V2 - 1e-8,
    );
    expect(territory.army.manpower).toBeLessThanOrEqual(
      territory.army.capacity * TERRITORY_REVOLUTION_LOCAL_ARMY_MAX_CAP_SHARE_V2 + 1e-8,
    );
    expect(territory.army.baseAttack).toBe(
      WORLD_CONTENT_V2.nations[lux]!.militaryAttackRating,
    );
    expect(territory.army.baseDefense).toBe(
      WORLD_CONTENT_V2.nations[lux]!.militaryDefenseRating,
    );
    const restored = state.players[lux]!;
    expect(restored).toBeDefined();
    expect(restored.treasury).toBe(0);
    expect(restored.foodStock).toBe(0);
    expect(restored.domesticFoodCapacity).toBe(0);
    expect(restored.trainedReserves).toBe(0);
    expect(Object.values(restored.research.progress).every((value) => value === 0)).toBe(true);
    expect(Object.values(restored.research.effectLevels).every((value) => value === 0)).toBe(true);
    expect(Object.values(restored.research.breakthroughs).every((value) => value === 0)).toBe(true);
    expect(Object.keys(restored).some((key) => /trait/i.test(key))).toBe(false);
    expect(sortedNationIdsV2(state)).toContain(lux);
    expect(state.players[nld]!.capitalId).toBe(nldTerritory);
    expect(state.wars[0]!.attackerOperations).toEqual([]);
    expect(state.events.at(-1)).toMatchObject({
      kind: 'critical',
      severity: 'critical',
      territoryId: luxTerritory,
      playerId: lux,
    });
    expect(state.events.at(-1)?.message).toMatch(/restored its sovereignty/i);
    expect(processTerritoryIntegrationRevolutionsV2(state, WORLD_CONTENT_V2)).toEqual([]);
    assertInvariantsV2(state, WORLD_CONTENT_V2);
  });

  it('reuses an original nation that still has a referenced backend identity', () => {
    const state = createWorldStateV2(71_005);
    state.players[lux]!.treasury = 7.25;
    state.players[lux]!.research.effectLevels.attack = 2;
    beginTerritoryIntegrationV2(state, WORLD_CONTENT_V2, luxTerritory, bel);
    const program = state.territories[luxTerritory]!.integrationProgram!;
    const scheduled = findDestinedSeed(program);
    state.seed = scheduled.seed;
    state.tick = scheduled.tick;

    processTerritoryIntegrationRevolutionsV2(state, WORLD_CONTENT_V2);

    expect(state.players[lux]!.treasury).toBe(7.25);
    expect(state.players[lux]!.research.effectLevels.attack).toBe(2);
    expect(state.territories[luxTerritory]!.owner).toBe(lux);
    assertInvariantsV2(state, WORLD_CONTENT_V2);
  });

  it('round-trips immediately before the trigger without changing the revolution outcome', () => {
    const uninterrupted = createWorldStateV2(71_003);
    beginTerritoryIntegrationV2(
      uninterrupted,
      WORLD_CONTENT_V2,
      luxTerritory,
      bel,
    );
    const program = uninterrupted.territories[luxTerritory]!.integrationProgram!;
    const scheduled = findDestinedSeed(program);
    uninterrupted.seed = scheduled.seed;
    uninterrupted.tick = scheduled.tick - 1;
    synchronizeArmyCapacityV2(uninterrupted, WORLD_CONTENT_V2);
    const resumed = loadSaveV2(
      createSaveV2(uninterrupted, WORLD_CONTENT_V2),
      WORLD_CONTENT_V2,
    );
    expect(uninterrupted.firstIntegrationDiscountUsedBy).toEqual([bel]);
    expect(resumed.firstIntegrationDiscountUsedBy).toEqual([bel]);

    uninterrupted.tick += 1;
    resumed.tick += 1;
    expect(processTerritoryIntegrationRevolutionsV2(
      uninterrupted,
      WORLD_CONTENT_V2,
    )).toEqual(processTerritoryIntegrationRevolutionsV2(
      resumed,
      WORLD_CONTENT_V2,
    ));
    const uninterruptedSave = createSaveV2(uninterrupted, WORLD_CONTENT_V2);
    const resumedSave = createSaveV2(resumed, WORLD_CONTENT_V2);
    expect(canonicalStateHashV2(resumedSave)).toBe(
      canonicalStateHashV2(uninterruptedSave),
    );
    expect(resumed.territories[luxTerritory]!.owner).toBe(lux);
    expect(uninterrupted.firstIntegrationDiscountUsedBy).toEqual([bel]);
    expect(resumed.firstIntegrationDiscountUsedBy).toEqual([bel]);
  });

  it('resolves and emits the revolution before the engine finance phase', () => {
    const state = createWorldStateV2(71_004);
    beginTerritoryIntegrationV2(state, WORLD_CONTENT_V2, luxTerritory, bel);
    const program = state.territories[luxTerritory]!.integrationProgram!;
    const scheduled = findDestinedSeed(program);
    state.seed = scheduled.seed;
    state.tick = scheduled.tick - 1;
    state.aiEscalation.lastWarStartTick = state.tick;
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const engine = new WorldEngineV2(state.seed, WORLD_CONTENT_V2, state);
    const changes: string[] = [];
    engine.subscribe((_nextState, change) => changes.push(change.reason));

    engine.step();

    expect(changes).toContain('revolution');
    expect(changes.indexOf('revolution')).toBeLessThan(changes.lastIndexOf('tick'));
    expect(engine.state.territories[luxTerritory]!.owner).toBe(lux);
    expect(engine.state.territories[luxTerritory]!.integrationProgram).toBeUndefined();
    const independenceWar = engine.state.wars.find((war) => (
      war.attackerId === lux && war.defenderId === bel
    ));
    expect(independenceWar).toBeDefined();
    expect(engine.state.wars.filter((war) => (
      (war.attackerId === lux && war.defenderId === bel)
        || (war.attackerId === bel && war.defenderId === lux)
    ))).toHaveLength(1);
    const rebelSurvivors = engine.state.territories[luxTerritory]!.army.manpower;
    expect(rebelSurvivors).toBeGreaterThan(0);
    expect(independenceWar!.attackerLosses
      / (engine.state.territories[luxTerritory]!.army.capacity
        * TERRITORY_REVOLUTION_LOCAL_ARMY_MIN_CAP_SHARE_V2)).toBeCloseTo(0.01, 5);
    assertInvariantsV2(engine.state, WORLD_CONTENT_V2);
  });

  it('keeps a destined integration revolution dormant during Earth unity', () => {
    const state = createWorldStateV2(71_006);
    beginTerritoryIntegrationV2(state, WORLD_CONTENT_V2, luxTerritory, bel);
    const program = state.territories[luxTerritory]!.integrationProgram!;
    const scheduled = findDestinedSeed(program);
    state.seed = scheduled.seed;
    state.tick = scheduled.tick;
    state.polarEndgame.phase = 'counteroffensive';
    state.polarEndgame.revealedBy = state.humanPlayerId;
    state.polarEndgame.warningTick = 0;
    state.polarEndgame.contactTick = 0;
    state.polarEndgame.earthDefenseMembers = [state.humanPlayerId];
    state.polarEndgame.nextCounteroffensiveTick = state.tick + 13;

    expect(processTerritoryIntegrationRevolutionsV2(
      state,
      WORLD_CONTENT_V2,
    )).toEqual([]);
    expect(state.territories[luxTerritory]).toMatchObject({
      owner: bel,
      coreOwner: lux,
      integrationProgram: program,
    });
    expect(state.wars).toEqual([]);
  });
});
