import { describe, expect, it } from 'vitest';
import { aiHumanAttackSuspicionFactorV2, planAiCommandsV2 } from './ai';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { invalidateTerritoryIndexV2 } from './selectors';
import { enterPostBlackoutCampaignForTestV2 } from './testSupport';
import { nationIdV2, territoryIdV2, type WarStateV2 } from './types';
import { selectExpansionThreatSummaryV2 } from './expansionThreat';

const belgium = nationIdV2('bel');
const recentConquests = [nationIdV2('nld'), nationIdV2('lux')];
const activeOpponents = [nationIdV2('prt'), nationIdV2('irl')];

function offensiveWar(index: number, tick: number): WarStateV2 {
  return {
    id: `war-expansion-pattern-${index}`,
    attackerId: belgium,
    defenderId: activeOpponents[index]!,
    startedTick: tick - 24 + index * 8,
    lastBattleTick: tick - 8,
    warScore: 0,
    battles: 6,
    attackerLosses: 0,
    defenderLosses: 0,
    lastPeaceOfferTick: -1_000_000,
    attackerOperations: [],
    defenderOperations: [],
  };
}

function rapidExpansionState(seed: number, suspicion: number) {
  const state = createWorldStateV2(seed, WORLD_CONTENT_V2);
  state.tick = 264;
  state.humanPlayerId = belgium;
  state.humanPlayerIds = [belgium];
  enterPostBlackoutCampaignForTestV2(state);
  state.wars = [offensiveWar(0, state.tick), offensiveWar(1, state.tick)];
  state.offers = [];
  state.truces = [];
  state.ceasefireObligations = [];
  state.aiEscalation.lastWarStartTick = state.tick - 20;
  state.aiEscalation.globalThreat = suspicion;
  for (const player of Object.values(state.players)) {
    player.treasury = 1_000_000;
    player.foodStock = 1_000_000;
    player.foodSecurity = 1;
  }
  state.players[belgium]!.warFatigue = 0;
  for (const conqueredId of recentConquests) {
    const territory = state.territories[territoryIdV2(conqueredId)]!;
    territory.owner = belgium;
    territory.integration = 0.10;
    territory.integrationProgram = {
      fromOwnerId: conqueredId,
      fromCoreOwnerId: conqueredId,
      toOwnerId: belgium,
      startedTick: state.tick - 8,
      completesTick: state.tick + 512,
      annualCost: 1,
      cause: 'conquest',
    };
  }
  invalidateTerritoryIndexV2(state);
  for (const territory of Object.values(state.territories)) {
    if (territory.owner === belgium) {
      territory.army.manpower = territory.army.capacity * 0.05;
    }
  }
  return state;
}

describe('live rapid-expansion response', () => {
  it('uses a convex Suspicion gate with an exact zero-war state', () => {
    const factors = [0, 10, 25, 50, 75, 100]
      .map((suspicion) => aiHumanAttackSuspicionFactorV2(suspicion));

    expect(factors[0]).toBe(0);
    for (let index = 1; index < factors.length; index += 1) {
      expect(factors[index]).toBeGreaterThan(factors[index - 1]!);
    }
    expect(factors[1]).toBeLessThan(0.05);
    expect(factors.at(-1)).toBeGreaterThan(1);
    expect(aiHumanAttackSuspicionFactorV2(80))
      .toBeGreaterThan(aiHumanAttackSuspicionFactorV2(75) * 1.25);
  });

  it('uses bounded local reactions and ignores the retired global Suspicion field', () => {
    let zeroSuspicionAttacks = 0;
    let highSuspicionAttacks = 0;
    let extremeSuspicionAttacks = 0;
    const samples = 24;
    for (let index = 0; index < samples; index += 1) {
      const safe = rapidExpansionState(55_100 + index, 0);
      const expansion = selectExpansionThreatSummaryV2(safe, WORLD_CONTENT_V2, belgium);
      expect(expansion).toMatchObject({
        activeOffensiveWars: 2,
        recentConquestCountries: 2,
      });
      expect(expansion.score).toBeGreaterThanOrEqual(80);
      zeroSuspicionAttacks += planAiCommandsV2(safe, WORLD_CONTENT_V2)
        .filter((command) => command.type === 'declare-war'
          && command.defenderId === belgium).length;

      const exposed = rapidExpansionState(55_100 + index, 80);
      const declarations = planAiCommandsV2(exposed, WORLD_CONTENT_V2)
        .filter((command) => command.type === 'declare-war');
      expect(declarations.every((command) => command.type === 'declare-war'
        && command.defenderId === belgium)).toBe(true);
      highSuspicionAttacks += declarations.length;

      const extreme = rapidExpansionState(55_100 + index, 100);
      extremeSuspicionAttacks += planAiCommandsV2(extreme, WORLD_CONTENT_V2)
        .filter((command) => command.type === 'declare-war'
          && command.defenderId === belgium).length;
    }

    expect(zeroSuspicionAttacks).toBeGreaterThan(0);
    expect(zeroSuspicionAttacks).toBeLessThan(samples);
    expect(highSuspicionAttacks).toBe(zeroSuspicionAttacks);
    expect(highSuspicionAttacks).toBeLessThan(samples);
    expect(extremeSuspicionAttacks).toBe(highSuspicionAttacks);
  }, 30_000);
});
