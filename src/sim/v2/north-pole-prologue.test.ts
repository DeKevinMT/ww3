import { describe, expect, it } from 'vitest';
import { WorldEngineV2 } from './WorldEngineV2';
import { createWorldStateV2 } from './bootstrap';
import { synchronizeArmyCapacityV2 } from './capacity';
import {
  campaignCommunicationsBlackoutActiveV2,
  campaignWarsUnlockedV2,
} from './campaignPrologue';
import { WORLD_CONTENT_V2, isHumanSelectableNationV2 } from './content';
import { beginTerritoryIntegrationV2, quoteTerritoryIntegrationV2 } from './integration';
import { selectNorthPoleModifiersV2 } from './northPoleModifiers';
import { createSaveV2, loadSaveV2 } from './persistence';
import {
  ARCTIC_PROJECTS_V2,
  processArcticResearchV2,
  selectArcticProjectTermsV2,
  startArcticProjectV2,
} from './polarEndgame';
import { warDeclarationStatusV2 } from './war';
import { nationIdV2, territoryIdV2 } from './types';

function authoriseNorthPole(state: ReturnType<typeof createWorldStateV2>, playerId: ReturnType<typeof nationIdV2>): void {
  state.polarEndgame.apexNarrative.players[playerId] = {
    investigationAuthorized: true,
    transmissions: [],
  };
  state.players[playerId]!.treasury = 100_000;
}

describe('Campaign North Pole investigation', () => {
  it('spreads the exact North Pole modifiers across fourteen sequential stages without leakage', () => {
    const state = createWorldStateV2(12_300, WORLD_CONTENT_V2);
    const playerId = state.humanPlayerId;
    const complete = (completedProjects: typeof ARCTIC_PROJECTS_V2[number]['id'][]): void => {
      state.polarEndgame.arcticPrograms[playerId] = {
        playerId,
        activeProject: null,
        completedProjects,
      };
    };
    const through = (projectId: typeof ARCTIC_PROJECTS_V2[number]['id']) => (
      ARCTIC_PROJECTS_V2
        .slice(0, ARCTIC_PROJECTS_V2.findIndex((project) => project.id === projectId) + 1)
        .map((project) => project.id)
    );

    complete(['polar-demography']);
    expect(selectNorthPoleModifiersV2(state, playerId)).toMatchObject({
      researchOutputMultiplier: 1.001,
      supplyThroughputMultiplier: 1,
      rogueWarningLeadTicks: 1,
    });
    complete(through('baseline-calibration'));
    expect(selectNorthPoleModifiersV2(state, playerId).researchOutputMultiplier).toBe(1.0025);
    complete(through('anomaly-filtering'));
    expect(selectNorthPoleModifiersV2(state, playerId).supplyThroughputMultiplier).toBe(1.005);
    complete(through('cryogenic-logistics'));
    expect(selectNorthPoleModifiersV2(state, playerId)).toMatchObject({
      signalPurgeDurationMultiplier: 0.92,
      recoveryMultiplier: 1.02,
      attackVsRogueMultiplier: 1,
      defenseVsRogueMultiplier: 1.02,
    });
    complete(through('strategic-mobilisation'));
    expect(selectNorthPoleModifiersV2(state, playerId)).toMatchObject({
      attackVsRogueMultiplier: 1.04,
      defenseVsRogueMultiplier: 1.06,
    });
    complete(ARCTIC_PROJECTS_V2.map((project) => project.id));
    expect(selectNorthPoleModifiersV2(state, playerId)).toMatchObject({
      antarcticSupplyMultiplier: 1.08,
      antarcticOperationMultiplier: 1.05,
      primeTracking: true,
    });
    expect(ARCTIC_PROJECTS_V2.map((project) => project.benefits)).toEqual([
      ['+0.10% research output', '+1 day Rogue-route warning'],
      ['+0.15% research output'],
      ['+0.25% supply throughput'],
      ['+0.25% supply throughput'],
      ['2% faster Signal Purge'],
      ['2% faster Signal Purge'],
      ['+1% army recovery'],
      ['4% faster Signal Purge', '+1% army recovery', '+2% defense against Rogue AI'],
      ['+2% attack against Rogue AI'],
      ['+2% defense against Rogue AI'],
      ['+2% attack against Rogue AI', '+2% defense against Rogue AI'],
      ['+4% Antarctic supply'],
      ['+4% Antarctic supply', '+2.5% Antarctic operation power'],
      ['+2.5% Antarctic operation power', 'ROGUE PRIME tracking'],
    ]);
  });
  it('lets a new Campaign declare war immediately without waking the Rogue', () => {
    const engine = new WorldEngineV2(12_301, WORLD_CONTENT_V2);
    const humanId = engine.state.humanPlayerId;
    const targetId = WORLD_CONTENT_V2.nationIds.find((id) => (
      id !== humanId
      && WORLD_CONTENT_V2.nations[id]?.kind !== 'rogue-ai'
      && engine.warAccessType(humanId, id) !== 'none'
    ))!;

    expect(campaignWarsUnlockedV2(engine.state, engine.content)).toBe(true);
    expect(campaignCommunicationsBlackoutActiveV2(engine.state, engine.content)).toBe(false);
    expect(warDeclarationStatusV2(engine.state, engine.content, humanId, targetId))
      .toMatchObject({ allowed: true });

    engine.state.tick = 100;
    expect(engine.state.wars).toEqual([]);
    expect(engine.state.polarEndgame.rogueAttention.stage).toBe('dormant');
  });

  it('makes Stage I short and global, then flips the blackout exactly once without waking Rogue', () => {
    const state = createWorldStateV2(12_302, WORLD_CONTENT_V2);
    const playerId = state.humanPlayerId;
    const stageOne = ARCTIC_PROJECTS_V2[0]!;
    const terms = selectArcticProjectTermsV2(
      state,
      WORLD_CONTENT_V2,
      playerId,
      stageOne.id,
    );
    expect(terms).toMatchObject({ allowed: true, baseDurationTicks: 13, durationTicks: 13, cost: 0.01 });
    expect(startArcticProjectV2(state, WORLD_CONTENT_V2, playerId, stageOne.id))
      .toEqual({ accepted: true });
    state.tick = state.polarEndgame.arcticPrograms[playerId]!.activeProject!.completesTick;

    expect(processArcticResearchV2(state, WORLD_CONTENT_V2)).toHaveLength(1);
    expect(state.polarEndgame.communicationsBlackoutTick).toBe(state.tick);
    expect(campaignCommunicationsBlackoutActiveV2(state, WORLD_CONTENT_V2)).toBe(true);
    expect(campaignWarsUnlockedV2(state, WORLD_CONTENT_V2)).toBe(true);
    expect(state.polarEndgame.rogueAttention.stage).toBe('dormant');
    expect(state.polarEndgame.contactTick).toBeNull();

    const firstTick = state.polarEndgame.communicationsBlackoutTick;
    state.tick += 40;
    processArcticResearchV2(state, WORLD_CONTENT_V2);
    expect(state.polarEndgame.communicationsBlackoutTick).toBe(firstTick);
  });

  it('shortens an authenticated legacy Stage-I run from its original start without resetting it', () => {
    const state = createWorldStateV2(12_307, WORLD_CONTENT_V2);
    const playerId = state.humanPlayerId;
    state.tick = 10;
    expect(startArcticProjectV2(
      state, WORLD_CONTENT_V2, playerId, 'polar-demography',
    )).toEqual({ accepted: true });
    const legacy = state.polarEndgame.arcticPrograms[playerId]!.activeProject!;
    legacy.completesTick = legacy.startedTick + 20;
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);

    const loaded = loadSaveV2(createSaveV2(state, WORLD_CONTENT_V2), WORLD_CONTENT_V2);
    const loadedRun = loaded.polarEndgame.arcticPrograms[playerId]!.activeProject!;
    expect(loadedRun.startedTick).toBe(10);
    expect(selectArcticProjectTermsV2(
      loaded, WORLD_CONTENT_V2, playerId, 'polar-demography',
    )).toMatchObject({ durationTicks: 13, startedTick: 10, completesTick: 23 });

    loaded.tick = 22;
    expect(processArcticResearchV2(loaded, WORLD_CONTENT_V2)).toEqual([]);
    expect(loadedRun.completesTick).toBe(23);
    loaded.tick = 23;
    expect(processArcticResearchV2(loaded, WORLD_CONTENT_V2))
      .toEqual([expect.objectContaining({ kind: 'project-complete', projectId: 'polar-demography' })]);
  });

  it('lets every serious Campaign country begin mandatory $10M analysis at tick zero', () => {
    const state = createWorldStateV2(12_306, WORLD_CONTENT_V2);
    const stageOne = ARCTIC_PROJECTS_V2[0]!;
    const countries = WORLD_CONTENT_V2.nationIds.filter((playerId) => (
      isHumanSelectableNationV2(WORLD_CONTENT_V2, playerId)
    ));
    expect(countries.length).toBeGreaterThan(100);

    for (const playerId of countries) {
      state.humanPlayerId = playerId;
      state.humanPlayerIds = [playerId];
      const treasuryBefore = state.players[playerId]!.treasury;
      const terms = selectArcticProjectTermsV2(
        state,
        WORLD_CONTENT_V2,
        playerId,
        stageOne.id,
      );
      expect(treasuryBefore, String(playerId)).toBeGreaterThanOrEqual(0.01);
      expect(terms, String(playerId)).toMatchObject({
        allowed: true,
        cost: 0.01,
        durationTicks: 13,
      });
      expect(startArcticProjectV2(state, WORLD_CONTENT_V2, playerId, stageOne.id))
        .toEqual({ accepted: true });
      expect(state.players[playerId]!.treasury).toBeCloseTo(treasuryBefore - 0.01, 9);
      expect(state.players[playerId]!.treasury).toBeGreaterThanOrEqual(0);
    }
  });

  it('starts remote analysis from a landlocked weak country and preserves the exact run after save/load', () => {
    const engine = new WorldEngineV2(12_303, WORLD_CONTENT_V2);
    const centralAfricanRepublic = nationIdV2('caf');
    expect(engine.chooseCountry(centralAfricanRepublic)).toEqual({ accepted: true });
    authoriseNorthPole(engine.state, centralAfricanRepublic);

    const terms = selectArcticProjectTermsV2(
      engine.state,
      engine.content,
      centralAfricanRepublic,
      'polar-demography',
    );
    expect(terms.allowed).toBe(true);
    expect(startArcticProjectV2(
      engine.state,
      engine.content,
      centralAfricanRepublic,
      'polar-demography',
    )).toEqual({ accepted: true });

    const loaded = loadSaveV2(createSaveV2(engine.state, engine.content), engine.content);
    expect(loaded.polarEndgame.arcticPrograms[centralAfricanRepublic])
      .toEqual(engine.state.polarEndgame.arcticPrograms[centralAfricanRepublic]);
    expect(loaded.polarEndgame.communicationsBlackoutTick).toBeNull();
  });

  it('uses the same remote project rules for every multiplayer human seat', () => {
    const engine = new WorldEngineV2(12_304, WORLD_CONTENT_V2);
    const landlocked = nationIdV2('caf');
    const coast = nationIdV2('gnb');
    expect(engine.configureHumanPlayers([landlocked, coast], landlocked)).toEqual({ accepted: true });
    for (const playerId of [landlocked, coast]) {
      authoriseNorthPole(engine.state, playerId);
      expect(selectArcticProjectTermsV2(
        engine.state,
        engine.content,
        playerId,
        'polar-demography',
      )).toMatchObject({ allowed: true, cost: 0.01, durationTicks: 13 });
    }
  });

  it('applies Cognitive Firewall once to immutable Signal Purge quotes', () => {
    const state = createWorldStateV2(12_305, WORLD_CONTENT_V2);
    const playerId = state.humanPlayerId;
    const targetId = territoryIdV2('usa');
    const before = quoteTerritoryIntegrationV2(state, WORLD_CONTENT_V2, targetId, playerId);
    state.polarEndgame.arcticPrograms[playerId] = {
      playerId,
      activeProject: null,
      completedProjects: ARCTIC_PROJECTS_V2
        .slice(0, ARCTIC_PROJECTS_V2.findIndex((project) => project.id === 'cryogenic-logistics') + 1)
        .map((project) => project.id),
    };
    expect(selectNorthPoleModifiersV2(state, playerId).signalPurgeDurationMultiplier).toBe(0.92);
    const after = quoteTerritoryIntegrationV2(state, WORLD_CONTENT_V2, targetId, playerId);
    expect(after.durationWeeks).toBe(Math.max(1, Math.round(before.durationWeeks * 0.92)));

    beginTerritoryIntegrationV2(state, WORLD_CONTENT_V2, targetId, playerId);
    const completionTick = state.territories[targetId]!.integrationProgram!.completesTick;
    state.polarEndgame.arcticPrograms[playerId]!.completedProjects = [];
    expect(state.territories[targetId]!.integrationProgram!.completesTick).toBe(completionTick);
  });
});
