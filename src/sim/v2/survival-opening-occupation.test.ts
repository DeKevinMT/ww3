import { describe, expect, it } from 'vitest';
import { WorldEngineV2 } from './WorldEngineV2';
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
  frontCapacitySupplyQuoteV2,
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

  it('routes an Antarctic wave above a former local cap without ordinary supply throttling', () => {
    const engine = formedGreenland(81_003);
    const war = engine.state.wars.find((candidate) => (
      candidate.attackerId === ROGUE_AI_NATION_ID_V2
    ))!;
    const frontierId = engine.content.territoryIds.find((territoryId) => (
      engine.state.territories[territoryId]?.owner === ROGUE_AI_NATION_ID_V2
        && engine.state.runProgression.scorchedWorldTerritoryIds.includes(territoryId)
        && (engine.content.territories[territoryId]?.connections ?? []).some((connection) => (
          engine.state.territories[connection.targetId]?.owner === war.defenderId
        ))
    ))!;
    const donorId = engine.content.territories[frontierId]!.connections
      .map((connection) => connection.targetId)
      .find((territoryId) => (
        engine.state.territories[territoryId]?.owner === ROGUE_AI_NATION_ID_V2
          && engine.state.runProgression.scorchedWorldTerritoryIds.includes(territoryId)
      ))!;
    expect(frontierId).toBeDefined();
    expect(donorId).toBeDefined();

    const frontier = engine.state.territories[frontierId]!;
    const donor = engine.state.territories[donorId]!;
    const formerLocalCap = frontier.army.capacity;
    const verifiedWave = Math.max(0.10, formerLocalCap * 100);
    donor.army.manpower = verifiedWave;
    addRogueWaveManpowerV2(engine.state, donorId, verifiedWave);
    engine.state.players[ROGUE_AI_NATION_ID_V2]!.treasury = 1_000_000;

    const movements = redistributeArmiesV2(engine.state, engine.content);
    const reinforcement = movements.find((movement) => (
      movement.playerId === ROGUE_AI_NATION_ID_V2
        && movement.sourceId === donorId
        && movement.targetId === frontierId
    ));
    expect(reinforcement).toBeDefined();
    expect(reinforcement!.manpower).toBeGreaterThan(formerLocalCap);
    expect(frontier.army.manpower).toBeGreaterThan(formerLocalCap);
    expect(rogueWaveManpowerAtV2(engine.state, frontierId)).toBeGreaterThan(0);
    expect(frontCapacitySupplyQuoteV2(engine.state, frontierId, 'land').readiness).toBe(1);
  });
});
