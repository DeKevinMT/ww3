import { describe, expect, it } from 'vitest';
import { WorldEngineV2 } from './WorldEngineV2';
import { processAntarcticGatewayBreachesV2 } from './antarcticGateways';
import { localFormationCapitulationThresholdV2 } from './balance';
import { ROGUE_AI_NATION_ID_V2 } from './content';
import { assertInvariantsV2 } from './invariants';
import { resolveScenarioV2 } from './scenarios';
import {
  selectSurvivalDawnlineLeaderIdV2,
  survivalDawnlineNationIdsV2,
} from './survivalEmpire';
import {
  SURVIVAL_DAWNLINE_ACCORD_NAME_V2,
  SURVIVAL_ORDINARY_AI_CAPACITY_FACTOR_V2,
  isSurvivalOrdinaryAiNationV2,
} from './survivalOrdinaryAi';
import {
  addRogueWaveManpowerV2,
  recordRogueWaveCasualtiesV2,
  rogueWaveLossCreditV2,
  rogueWaveManpowerAtV2,
} from './survivalProvenance';
import { nationIdV2, type TerritoryId } from './types';
import {
  processWarsV2,
  redistributeArmiesV2,
  synchronizeWarFrontsV2,
} from './war';

function formedGreenland(seed: number): WorldEngineV2 {
  const { content } = resolveScenarioV2({ mode: 'survival', seed });
  const engine = new WorldEngineV2(seed, content);
  expect(engine.chooseCountry('grl')).toEqual({ accepted: true });
  expect(engine.formSurvivalEmpire('grl', [])).toEqual({ accepted: true });
  return engine;
}

describe('Survival occupied-world opening', () => {
  it('keeps one remote Dawnline faction and consolidates every other country', () => {
    const engine = formedGreenland(81_001);
    const human = nationIdV2('grl');
    const dawnlineLeader = selectSurvivalDawnlineLeaderIdV2(engine.state)!;
    expect(engine.state.players[dawnlineLeader]!.empireName)
      .toBe(SURVIVAL_DAWNLINE_ACCORD_NAME_V2);
    const dawnlineTerritories = engine.content.territoryIds.filter((territoryId) => (
      engine.state.territories[territoryId]?.owner === dawnlineLeader
    ));
    expect(dawnlineTerritories).toHaveLength(3);
    expect(dawnlineTerritories.every((territoryId) => (
      !(engine.content.territories[territoryId]?.connections ?? []).some((connection) => (
        engine.state.territories[connection.targetId]?.owner === human
      ))
    ))).toBe(true);

    const occupied: TerritoryId[] = [];
    for (const territoryId of engine.content.territoryIds) {
      if ((engine.content.territories[territoryId]?.kind ?? 'sovereign') !== 'sovereign') continue;
      const territory = engine.state.territories[territoryId]!;
      if (territory.owner === human || territory.owner === dawnlineLeader) continue;
      expect(territory.owner).toBe(ROGUE_AI_NATION_ID_V2);
      expect(engine.state.runProgression.scorchedWorldTerritoryIds).toContain(territoryId);
      expect(rogueWaveManpowerAtV2(engine.state, territoryId)).toBe(0);
      expect(territory.army.manpower)
        .toBeLessThanOrEqual(Math.max(0.000005, territory.army.capacity * 0.002) + 1e-9);
      occupied.push(territoryId);
    }
    expect(occupied.length).toBeGreaterThan(100);
    expect(Object.keys(engine.state.players)).toHaveLength(3);
    const directRogueBorders = engine.content.territoryIds.filter((territoryId) => (
      engine.state.territories[territoryId]?.owner === ROGUE_AI_NATION_ID_V2
        && (engine.content.territories[territoryId]?.connections ?? []).some((connection) => (
          engine.state.territories[connection.targetId]?.owner === human
        ))
    ));
    expect(directRogueBorders.length).toBeGreaterThanOrEqual(2);

    const placeholderId = occupied.find((territoryId) => (
      engine.state.territories[territoryId]!.army.manpower > 0
    ))!;
    const placeholder = engine.state.territories[placeholderId]!.army.manpower;
    expect(recordRogueWaveCasualtiesV2(
      engine.state,
      placeholderId,
      placeholder,
      placeholder,
      human,
    )).toBe(0);
    expect(rogueWaveLossCreditV2(engine.state, human)).toBe(0);
    assertInvariantsV2(engine.state, engine.content);
  });

  it('opens one permanent war with two direct fronts and restores a missing axis', () => {
    const engine = formedGreenland(81_002);
    const machineWars = engine.state.wars.filter((war) => (
      war.attackerId === ROGUE_AI_NATION_ID_V2
    ));
    expect(machineWars).toHaveLength(2);
    const humanWar = machineWars.find((war) => war.defenderId === nationIdV2('grl'))!;
    const dawnlineWar = machineWars.find((war) => (
      war.defenderId === selectSurvivalDawnlineLeaderIdV2(engine.state)
    ))!;
    expect(humanWar.attackerOperations).toHaveLength(2);
    expect(new Set(humanWar.attackerOperations.map((operation) => operation.sourceId)).size)
      .toBe(2);
    expect([
      ...dawnlineWar.attackerOperations,
      ...dawnlineWar.defenderOperations,
    ]).toHaveLength(1);

    const removed = humanWar.attackerOperations[0]!;
    humanWar.attackerOperations = humanWar.attackerOperations.slice(1);
    synchronizeWarFrontsV2(engine.state, engine.content);
    expect(humanWar.attackerOperations).toHaveLength(2);
    expect(humanWar.attackerOperations.some((operation) => (
      operation.sourceId === removed.sourceId && operation.targetId === removed.targetId
    ))).toBe(true);
  });

  it('reverses a spent machine axis and captures its empty corridor through the live scheduler', () => {
    const engine = formedGreenland(81_005);
    const human = nationIdV2('grl');
    const war = engine.state.wars.find((candidate) => (
      candidate.attackerId === ROGUE_AI_NATION_ID_V2
        && candidate.defenderId === human
    ))!;
    const spentAxis = war.attackerOperations[0]!;
    const untouchedAxis = war.attackerOperations[1]!;
    const spentTerritory = engine.state.territories[spentAxis.sourceId]!;
    spentTerritory.army.manpower = 0;
    spentAxis.lastBattleTick = spentAxis.startedTick + 1;
    war.battles = 1;

    synchronizeWarFrontsV2(engine.state, engine.content);
    expect(war.defenderOperations).toEqual([
      expect.objectContaining({
        commanderId: human,
        sourceId: spentAxis.targetId,
        targetId: spentAxis.sourceId,
        doctrine: 'counteroffensive',
      }),
    ]);
    expect(war.attackerOperations).toEqual([
      expect.objectContaining({
        sourceId: untouchedAxis.sourceId,
        targetId: untouchedAxis.targetId,
      }),
    ]);
    assertInvariantsV2(engine.state, engine.content);

    let captured = false;
    for (let week = 0; week < 20 && !captured; week += 1) {
      engine.state.tick += 1;
      captured = processWarsV2(engine.state, engine.content).some((battle) => (
        battle.conquered && battle.targetId === spentAxis.sourceId
      ));
    }
    expect(captured).toBe(true);
    expect(engine.state.territories[spentAxis.sourceId]!.owner).toBe(human);
    expect(engine.state.wars.map((candidate) => candidate.id)).toContain(war.id);
    assertInvariantsV2(engine.state, engine.content);
  });

  it('does not reverse a machine axis that still fields more than one percent', () => {
    const engine = formedGreenland(81_006);
    const human = nationIdV2('grl');
    const war = engine.state.wars.find((candidate) => (
      candidate.attackerId === ROGUE_AI_NATION_ID_V2
        && candidate.defenderId === human
    ))!;
    const activeAxis = war.attackerOperations[0]!;
    const activeTerritory = engine.state.territories[activeAxis.sourceId]!;
    activeTerritory.army.manpower = localFormationCapitulationThresholdV2(
      activeTerritory.army.capacity,
    ) + 1e-9;
    activeAxis.lastBattleTick = activeAxis.startedTick + 1;
    war.battles = 1;

    synchronizeWarFrontsV2(engine.state, engine.content);
    expect(war.defenderOperations).toHaveLength(0);
    expect(war.attackerOperations.some((operation) => (
      operation.sourceId === activeAxis.sourceId && operation.targetId === activeAxis.targetId
    ))).toBe(true);
    assertInvariantsV2(engine.state, engine.content);
  });

  it('treats exactly one percent as a spent machine axis', () => {
    const engine = formedGreenland(81_007);
    const human = nationIdV2('grl');
    const war = engine.state.wars.find((candidate) => (
      candidate.attackerId === ROGUE_AI_NATION_ID_V2
        && candidate.defenderId === human
    ))!;
    const spentAxis = war.attackerOperations[0]!;
    const spentTerritory = engine.state.territories[spentAxis.sourceId]!;
    spentTerritory.army.manpower = spentTerritory.army.capacity * 0.01;
    spentAxis.lastBattleTick = spentAxis.startedTick + 1;
    war.battles = 1;

    synchronizeWarFrontsV2(engine.state, engine.content);
    expect(war.defenderOperations).toContainEqual(expect.objectContaining({
      commanderId: human,
      sourceId: spentAxis.targetId,
      targetId: spentAxis.sourceId,
    }));
    assertInvariantsV2(engine.state, engine.content);
  });

  it('does not consume random draws while rejecting duplicate counter axes', () => {
    const engine = formedGreenland(81_008);
    const human = nationIdV2('grl');
    const war = engine.state.wars.find((candidate) => (
      candidate.attackerId === ROGUE_AI_NATION_ID_V2
        && candidate.defenderId === human
    ))!;
    expect(new Set(war.attackerOperations.map((operation) => operation.targetId)).size).toBe(1);
    for (const operation of war.attackerOperations) {
      engine.state.territories[operation.sourceId]!.army.manpower = 0;
      operation.lastBattleTick = operation.startedTick + 1;
    }
    war.battles = 1;
    engine.state.wars = [war];

    synchronizeWarFrontsV2(engine.state, engine.content);
    expect(war.defenderOperations).toHaveLength(1);
    const rngAfterSelection = engine.state.rngState;
    synchronizeWarFrontsV2(engine.state, engine.content);
    expect(engine.state.rngState).toBe(rngAfterSelection);
    assertInvariantsV2(engine.state, engine.content);
  });

  it('unifies three pristine national armies into one bounded Dawnline war', () => {
    const seed = 81_004;
    const { content } = resolveScenarioV2({ mode: 'survival', seed });
    const engine = new WorldEngineV2(seed, content);
    expect(engine.chooseCountry('grl')).toEqual({ accepted: true });
    const human = nationIdV2('grl');
    const members = survivalDawnlineNationIdsV2(
      engine.state,
      content,
      new Set([human]),
    );
    expect(members).toHaveLength(3);
    const opening = new Map(members.map((memberId) => {
      const territoryId = content.territoryIds.find((id) => (
        engine.state.territories[id]?.owner === memberId
      ))!;
      const territory = engine.state.territories[territoryId]!;
      return [territoryId, {
        economy: territory.economy,
        population: territory.population,
        reducedCapacity: territory.army.capacity,
      }];
    }));

    expect(engine.formSurvivalEmpire('grl', [])).toEqual({ accepted: true });
    const leaderId = selectSurvivalDawnlineLeaderIdV2(engine.state)!;
    for (const [territoryId, before] of opening) {
      const territory = engine.state.territories[territoryId]!;
      expect(territory.owner).toBe(leaderId);
      expect(territory.economy).toBeCloseTo(before.economy, 9);
      expect(territory.population).toBeCloseTo(before.population, 9);
      expect(territory.army.capacity)
        .toBeGreaterThan(before.reducedCapacity / SURVIVAL_ORDINARY_AI_CAPACITY_FACTOR_V2 * 0.90);
      expect(territory.army.manpower).toBeCloseTo(territory.army.capacity, 9);
    }
    expect(isSurvivalOrdinaryAiNationV2(engine.state, content, leaderId)).toBe(false);
    expect(engine.state.wars.filter((war) => (
      war.attackerId === ROGUE_AI_NATION_ID_V2 && war.defenderId === leaderId
    ))).toHaveLength(1);
    expect(engine.state.wars.filter((war) => (
      war.attackerId === ROGUE_AI_NATION_ID_V2
    ))).toHaveLength(2);
  });

  it('delivers a material Antarctic wave to a live front through the occupied-world relay', () => {
    const engine = formedGreenland(81_003);
    const gatewayId = engine.state.polarEndgame.gatewayBreachOrder[0]!;
    const gateway = engine.state.polarEndgame.gatewayBreaches[gatewayId]!;
    engine.state.tick = gateway.opensTick!;
    expect(processAntarcticGatewayBreachesV2(engine.state)).toEqual([gatewayId]);
    const coreId = engine.state.players[ROGUE_AI_NATION_ID_V2]!.capitalId;
    const verifiedWave = 0.006;
    engine.state.polarEndgame.rogueWaveManpowerByTerritory = {};
    addRogueWaveManpowerV2(engine.state, coreId, verifiedWave);
    engine.state.players[ROGUE_AI_NATION_ID_V2]!.treasury = 1_000_000;

    const opponents = new Set(engine.state.wars
      .filter((war) => war.attackerId === ROGUE_AI_NATION_ID_V2)
      .map((war) => war.defenderId));
    const liveFrontWave = (): number => engine.content.territoryIds
      .filter((territoryId) => (
        engine.state.territories[territoryId]?.owner === ROGUE_AI_NATION_ID_V2
          && (engine.content.territories[territoryId]?.connections ?? [])
            .some((connection) => opponents.has(
              engine.state.territories[connection.targetId]?.owner ?? ROGUE_AI_NATION_ID_V2,
            ))
      ))
      .reduce((sum, territoryId) => sum + rogueWaveManpowerAtV2(
        engine.state,
        territoryId,
      ), 0);
    let firstArrivalWeek: number | null = null;
    for (let week = 1; week <= 52; week += 1) {
      engine.state.tick += 1;
      redistributeArmiesV2(engine.state, engine.content);
      if (firstArrivalWeek === null && liveFrontWave() > 1e-9) firstArrivalWeek = week;
    }
    const totalVerified = Object.values(
      engine.state.polarEndgame.rogueWaveManpowerByTerritory,
    ).reduce((sum, manpower) => sum + (manpower ?? 0), 0);
    expect(firstArrivalWeek).not.toBeNull();
    expect(liveFrontWave()).toBeGreaterThanOrEqual(verifiedWave * 0.25);
    expect(totalVerified).toBeCloseTo(verifiedWave, 9);
  });
});
