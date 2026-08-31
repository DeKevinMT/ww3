import { describe, expect, it } from 'vitest';
import { WorldEngineV2 } from './WorldEngineV2';
import { ANTARCTIC_TERRITORY_IDS_V2, ROGUE_AI_NATION_ID_V2 } from './content';
import { assertInvariantsV2 } from './invariants';
import { resolveScenarioV2 } from './scenarios';
import {
  SURVIVAL_MAX_CONCURRENT_ROGUE_FRONTS_V2,
  processRogueAiSurvivalV2,
} from './survival';
import {
  SURVIVAL_DAWNLINE_ARCTIC_NATION_IDS_V2,
  selectSurvivalDawnlineLeaderIdV2,
} from './survivalEmpire';
import { isSurvivalDawnlineNationV2 } from './survivalOrdinaryAi';
import { nationIdV2 } from './types';
import { invalidateTerritoryIndexV2 } from './selectors';
import {
  selectSurvivalCounteroffensiveTargetV2,
  selectSurvivalCounteroffensiveTargetsV2,
  synchronizeWarFrontsV2,
} from './war';

function formedPacificFront(seed: number): WorldEngineV2 {
  const { content } = resolveScenarioV2({ mode: 'survival', seed });
  const engine = new WorldEngineV2(seed, content);
  expect(engine.chooseCountry('usa')).toEqual({ accepted: true });
  expect(engine.formSurvivalEmpire('usa', ['chl'])).toEqual({ accepted: true });
  return engine;
}

describe('Survival physical opening and push-pull pacing', () => {
  it('keeps the sovereign world intact while forming only the explicit Arctic Dawnline', () => {
    const engine = formedPacificFront(81_001);
    const human = nationIdV2('usa');
    const dawnline = selectSurvivalDawnlineLeaderIdV2(engine.state)!;
    expect(dawnline).toBe(nationIdV2('grl'));
    expect(engine.content.territoryIds.filter((territoryId) => (
      engine.state.territories[territoryId]?.owner === ROGUE_AI_NATION_ID_V2
    ))).toEqual(expect.arrayContaining(ANTARCTIC_TERRITORY_IDS_V2));
    expect(engine.content.territoryIds.filter((territoryId) => (
      engine.state.territories[territoryId]?.owner === ROGUE_AI_NATION_ID_V2
        && !ANTARCTIC_TERRITORY_IDS_V2.includes(territoryId)
    ))).toEqual([]);
    expect(engine.state.runProgression.scorchedWorldTerritoryIds).toEqual([]);

    const dawnlineTerritories = engine.content.territoryIds.filter((territoryId) => (
      engine.state.territories[territoryId]?.owner === dawnline
    ));
    expect(dawnlineTerritories).toHaveLength(
      SURVIVAL_DAWNLINE_ARCTIC_NATION_IDS_V2.length - 1,
    );
    expect(isSurvivalDawnlineNationV2(engine.state, dawnline)).toBe(true);
    expect(engine.state.territories.chl!.owner).toBe(human);
    for (const territory of Object.values(engine.state.territories)) {
      if (territory.owner === ROGUE_AI_NATION_ID_V2) continue;
      expect(territory.army.manpower).toBeCloseTo(territory.army.capacity, 9);
    }
    assertInvariantsV2(engine.state, engine.content);
  });

  it('keeps an exact human counteroffensive legal without gifting away the reinforced perimeter', () => {
    const engine = formedPacificFront(81_002);
    const human = nationIdV2('usa');
    const war = engine.state.wars.find((candidate) => (
      candidate.attackerId === ROGUE_AI_NATION_ID_V2
        && candidate.defenderId === human
    ));
    expect(war).toBeDefined();
    const targets = selectSurvivalCounteroffensiveTargetsV2(
      engine.state,
      engine.content,
      human,
    );
    expect(targets.length).toBeGreaterThan(0);
    const chosen = targets[0]!;
    expect(selectSurvivalCounteroffensiveTargetV2(
      engine.state,
      engine.content,
      human,
      chosen.targetId,
    )).toEqual({ accepted: true });

    synchronizeWarFrontsV2(engine.state, engine.content);
    expect(war!.attackerOperations.length + war!.defenderOperations.length)
      .toBeLessThanOrEqual(2);
    expect(war!.defenderOperations).toContainEqual(expect.objectContaining({
      commanderId: human,
      sourceId: chosen.sourceId,
      targetId: chosen.targetId,
    }));
    const humanConquests = new Set<string>();
    let battles = 0;
    engine.subscribe((_state, change) => {
      if (change.battle) battles += 1;
      if (change.battle?.conquered && change.battle.attackerId === human) {
        humanConquests.add(change.battle.targetId);
      }
    });
    engine.step(26);
    expect(battles).toBeGreaterThan(0);
    expect(humanConquests).toEqual(new Set());
    for (const territoryId of ANTARCTIC_TERRITORY_IDS_V2) {
      expect(engine.state.territories[territoryId]!.owner).toBe(ROGUE_AI_NATION_ID_V2);
    }
    expect(engine.state.territories.chl!.owner).toBe(human);
    for (const operation of [...war!.attackerOperations, ...war!.defenderOperations]) {
      expect(engine.state.territories[operation.sourceId]!.army.manpower).toBeGreaterThan(0);
    }
    assertInvariantsV2(engine.state, engine.content);
  }, 15_000);

  it('sustains deterministic battles and territorial movement for three years', () => {
    const engine = formedPacificFront(81_003);
    const human = nationIdV2('usa');
    const dawnline = selectSurvivalDawnlineLeaderIdV2(engine.state)!;
    const initialOwners = new Map(engine.content.territoryIds.map((territoryId) => [
      territoryId,
      engine.state.territories[territoryId]!.owner,
    ]));
    let battles = 0;
    let conquests = 0;
    let rogueSovereignConquests = 0;
    const conqueredTerritories = new Set<string>();
    let firstBattleTick: number | null = null;
    let firstConquestTick: number | null = null;
    let sawHumanPressure = false;
    let maxRogueWars = 0;
    let priorWave = engine.state.polarEndgame.globalWave;
    const waveLaunchTicks: number[] = [];
    engine.subscribe((_state, change) => {
      if (!change.battle) return;
      battles += 1;
      firstBattleTick ??= change.battle.tick;
      if (change.battle.conquered) {
        conquests += 1;
        conqueredTerritories.add(change.battle.targetId);
        firstConquestTick ??= change.battle.tick;
        if (change.battle.attackerId === ROGUE_AI_NATION_ID_V2
          && (engine.content.territories[change.battle.targetId]?.kind ?? 'sovereign') === 'sovereign') {
          rogueSovereignConquests += 1;
        }
      }
    });

    for (let week = 0; week < 156; week += 1) {
      engine.step(1);
      if (engine.state.polarEndgame.globalWave > priorWave) {
        waveLaunchTicks.push(engine.state.tick);
        priorWave = engine.state.polarEndgame.globalWave;
      }
      const rogueWars = engine.state.wars.filter((war) => (
        war.attackerId === ROGUE_AI_NATION_ID_V2
      ));
      maxRogueWars = Math.max(maxRogueWars, rogueWars.length);
      sawHumanPressure ||= rogueWars.some((war) => war.defenderId === human);
      for (const war of rogueWars) {
        for (const operation of war.attackerOperations) {
          expect(engine.state.territories[operation.sourceId]!.army.manpower)
            .toBeGreaterThan(0);
        }
      }
    }

    const changedSovereignTerritories = engine.content.territoryIds.filter((territoryId) => (
      (engine.content.territories[territoryId]?.kind ?? 'sovereign') === 'sovereign'
        && engine.state.territories[territoryId]!.owner !== initialOwners.get(territoryId)
    ));
    expect(battles).toBeGreaterThan(12);
    expect(conquests).toBeGreaterThan(0);
    expect(rogueSovereignConquests).toBeGreaterThan(0);
    expect(firstBattleTick).not.toBeNull();
    expect(firstBattleTick!).toBeLessThanOrEqual(4);
    expect(firstConquestTick).not.toBeNull();
    expect(waveLaunchTicks).toEqual([52, 104, 156]);
    expect(conqueredTerritories.size).toBeGreaterThan(0);
    expect(sawHumanPressure).toBe(true);
    expect(Object.values(engine.state.territories).some((territory) => (
      territory.owner === human
    ))).toBe(true);
    expect(Object.values(engine.state.territories).some((territory) => (
      territory.owner === dawnline
    ))).toBe(true);
    expect(maxRogueWars).toBeLessThanOrEqual(SURVIVAL_MAX_CONCURRENT_ROGUE_FRONTS_V2);
    for (const war of engine.state.wars.filter((candidate) => (
      candidate.attackerId === ROGUE_AI_NATION_ID_V2
    ))) {
      for (const operation of war.attackerOperations) {
        expect(engine.state.territories[operation.sourceId]!.army.manpower).toBeGreaterThan(0);
      }
    }
    assertInvariantsV2(engine.state, engine.content);
  }, 15_000);

  it('opens a real Dawnline front as soon as physical Rogue expansion reaches it', () => {
    const engine = formedPacificFront(81_004);
    const dawnline = selectSurvivalDawnlineLeaderIdV2(engine.state)!;
    const dawnlineTerritoryId = engine.content.territoryIds.find((territoryId) => (
      engine.state.territories[territoryId]?.owner === dawnline
        && (engine.content.territories[territoryId]?.connections ?? []).some((connection) => {
          const owner = engine.state.territories[connection.targetId]?.owner;
          return owner && owner !== dawnline
            && !engine.state.humanPlayerIds.includes(owner)
            && owner !== ROGUE_AI_NATION_ID_V2;
        })
    ))!;
    const beachheadId = engine.content.territories[dawnlineTerritoryId]!.connections
      .map((connection) => connection.targetId)
      .find((territoryId) => {
        const owner = engine.state.territories[territoryId]?.owner;
        return owner && owner !== dawnline
          && !engine.state.humanPlayerIds.includes(owner)
          && owner !== ROGUE_AI_NATION_ID_V2;
      })!;
    const beachhead = engine.state.territories[beachheadId]!;
    beachhead.owner = ROGUE_AI_NATION_ID_V2;
    beachhead.coreOwner = ROGUE_AI_NATION_ID_V2;
    beachhead.integration = 1;
    delete beachhead.integrationProgram;
    beachhead.army.manpower = Math.max(beachhead.army.manpower, 0.01);
    engine.state.wars = [];
    invalidateTerritoryIndexV2(engine.state);

    expect(processRogueAiSurvivalV2(engine.state, engine.content).targets)
      .toContain(dawnline);
    synchronizeWarFrontsV2(engine.state, engine.content);
    const war = engine.state.wars.find((candidate) => (
      candidate.attackerId === ROGUE_AI_NATION_ID_V2
        && candidate.defenderId === dawnline
    ));
    expect(war).toBeDefined();
    expect(war!.attackerOperations).toContainEqual(expect.objectContaining({
      sourceId: beachheadId,
      targetId: dawnlineTerritoryId,
    }));
  });
});
