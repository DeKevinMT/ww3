import { describe, expect, it } from 'vitest';
import { planAiCommandsV2 } from './ai';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { invalidateTerritoryIndexV2 } from './selectors';
import { enterPostBlackoutCampaignForTestV2 } from './testSupport';
import {
  nationIdV2,
  territoryIdV2,
  type WarStateV2,
  type WorldStateV2,
} from './types';
import { declareWarV2 } from './war';
import { selectExpansionThreatSummaryV2 } from './expansionThreat';

const activeOpponents = [nationIdV2('prt'), nationIdV2('irl')];
const recentConquests = [nationIdV2('nld'), nationIdV2('lux')];

function offensiveWar(index: number, human: ReturnType<typeof nationIdV2>, tick: number): WarStateV2 {
  return {
    id: `war-human-expansion-${index}`,
    attackerId: human,
    defenderId: activeOpponents[index]!,
    startedTick: tick - 52 + index * 8,
    lastBattleTick: tick,
    warScore: 0,
    battles: 8,
    attackerLosses: 0,
    defenderLosses: 0,
    lastPeaceOfferTick: -1_000_000,
    attackerOperations: [],
    defenderOperations: [],
  };
}

function strainedHumanTargetState(seed: number, suspicion: number): WorldStateV2 {
  const state = createWorldStateV2(seed, WORLD_CONTENT_V2);
  const human = nationIdV2('bel');
  const opportunist = nationIdV2('fra');
  state.humanPlayerId = human;
  state.humanPlayerIds = [human];
  state.tick = 184;
  enterPostBlackoutCampaignForTestV2(state);
  state.aiEscalation.lastWarStartTick = state.tick - 20;
  state.aiEscalation.globalThreat = suspicion;
  state.wars = activeOpponents.map((_, index) => offensiveWar(index, human, state.tick));
  for (const [playerId, player] of Object.entries(state.players)) {
    player.treasury = playerId === opportunist ? 100_000 : -100_000;
  }
  state.players[human]!.warFatigue = 100;
  state.players[human]!.trainedReserves = 0;
  for (const conqueredId of recentConquests) {
    const territory = state.territories[territoryIdV2(conqueredId)]!;
    territory.owner = human;
    territory.integration = 0.10;
    territory.integrationProgram = {
      fromOwnerId: conqueredId,
      fromCoreOwnerId: conqueredId,
      toOwnerId: human,
      startedTick: state.tick - 8,
      completesTick: state.tick + 512,
      annualCost: 1,
      cause: 'conquest',
    };
  }
  invalidateTerritoryIndexV2(state);
  for (const territory of Object.values(state.territories)) {
    if (territory.owner === human) territory.army.manpower = territory.army.capacity * 0.05;
  }
  return state;
}

describe('AI response to human Expansion Threat', () => {
  it('uses the same critical local expansion opening regardless of retired Suspicion', () => {
    let exposedDeclarations = 0;
    let protectedDeclarations = 0;
    for (let seed = 15_000; seed < 15_024; seed += 1) {
      const exposed = strainedHumanTargetState(seed, 100);
      const protectedState = strainedHumanTargetState(seed, 0);
      expect(selectExpansionThreatSummaryV2(exposed, WORLD_CONTENT_V2, exposed.humanPlayerId).score)
        .toBeGreaterThanOrEqual(80);
      const targetsHuman = (state: WorldStateV2) => planAiCommandsV2(state, WORLD_CONTENT_V2)
        .some((command) => command.type === 'declare-war'
          && command.defenderId === state.humanPlayerId);
      if (targetsHuman(exposed)) exposedDeclarations += 1;
      if (targetsHuman(protectedState)) protectedDeclarations += 1;
    }

    expect(protectedDeclarations).toBeGreaterThan(0);
    expect(exposedDeclarations).toBe(protectedDeclarations);
  }, 15_000);

  it('opens an independent pressure war without creating uncounted rival wars', () => {
    const state = strainedHumanTargetState(15_009, 100);
    const human = state.humanPlayerId;
    const opportunist = nationIdV2('fra');
    const existingOpponent = activeOpponents[0]!;
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
