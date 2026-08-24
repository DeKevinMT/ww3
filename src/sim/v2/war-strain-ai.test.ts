import { describe, expect, it } from 'vitest';
import { planAiCommandsV2 } from './ai';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { nationIdV2, type WorldStateV2 } from './types';
import { declareWarV2 } from './war';

function strainedHumanTargetState(seed: number, fatigue: number): WorldStateV2 {
  const state = createWorldStateV2(seed, WORLD_CONTENT_V2);
  const human = nationIdV2('bel');
  const existingOpponent = nationIdV2('lux');
  const opportunist = nationIdV2('fra');
  state.humanPlayerId = human;
  state.humanPlayerIds = [human];
  state.tick = 184;
  state.aiEscalation.lastWarStartTick = -1_000_000;
  state.wars = [{
    id: 'war-human-existing',
    attackerId: human,
    defenderId: existingOpponent,
    startedTick: 132,
    lastBattleTick: 184,
    warScore: 0,
    battles: 8,
    attackerLosses: 0,
    defenderLosses: 0,
    lastPeaceOfferTick: -1_000_000,
    attackerOperations: [],
    defenderOperations: [],
  }];
  for (const [playerId, player] of Object.entries(state.players)) {
    player.treasury = playerId === opportunist ? 100_000 : -100_000;
  }
  state.players[human]!.warFatigue = fatigue;
  state.players[human]!.trainedReserves = 0;
  for (const territory of Object.values(state.territories)) {
    if (territory.owner === human) territory.army.manpower = territory.army.capacity * 0.05;
  }
  return state;
}

describe('AI response to human war strain', () => {
  it('can exploit a critical human second front while the same low-strain target remains protected', () => {
    let strainedDeclarations = 0;
    let lowStrainDeclarations = 0;
    for (let seed = 15_000; seed < 15_024; seed += 1) {
      const strained = strainedHumanTargetState(seed, 100);
      const lowStrain = strainedHumanTargetState(seed, 0);
      const targetsHuman = (state: WorldStateV2) => planAiCommandsV2(state, WORLD_CONTENT_V2)
        .some((command) => command.type === 'declare-war'
          && command.defenderId === state.humanPlayerId);
      if (targetsHuman(strained)) strainedDeclarations += 1;
      if (targetsHuman(lowStrain)) lowStrainDeclarations += 1;
    }

    expect(lowStrainDeclarations).toBe(0);
    expect(strainedDeclarations).toBeGreaterThan(0);
  }, 15_000);

  it('opens an independent pressure war without creating uncounted rival wars', () => {
    const state = strainedHumanTargetState(15_009, 100);
    const human = state.humanPlayerId;
    const opportunist = nationIdV2('fra');
    const existingOpponent = nationIdV2('lux');
    const before = state.wars.length;

    expect(declareWarV2(state, WORLD_CONTENT_V2, opportunist, human).accepted).toBe(true);
    expect(state.wars).toHaveLength(before + 1);
    expect(state.wars.some((war) => (
      (war.attackerId === opportunist && war.defenderId === human)
        || (war.attackerId === human && war.defenderId === opportunist)
    ))).toBe(true);
    expect(state.wars.some((war) => (
      (war.attackerId === opportunist && war.defenderId === existingOpponent)
        || (war.attackerId === existingOpponent && war.defenderId === opportunist)
    ))).toBe(false);
  });
});
