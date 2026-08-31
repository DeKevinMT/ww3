import { describe, expect, it } from 'vitest';
import { planAiCommandsV2, selectDefensiveAidAssessmentV2 } from './ai';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { addWorldEventV2 } from './events';
import { processPropagandaProgramsV2, selectPropagandaTermsV2 } from './propaganda';
import { selectGlobalResistanceV2, updateGlobalResistanceV2 } from './resistance';
import { createPowerSnapshotV2, selectNationViewV2 } from './selectors';
import {
  nationIdV2,
  territoryIdV2,
  type PlayerId,
  type WorldStateV2,
} from './types';

function setHumanPlayers(state: WorldStateV2, playerIds: readonly PlayerId[]): void {
  state.humanPlayerId = playerIds[0]!;
  (state as WorldStateV2 & { humanPlayerIds: PlayerId[] }).humanPlayerIds = [...playerIds];
}

describe('multi-human simulation boundaries', () => {
  it('keeps obsolete global Suspicion out of every serious-mode military budget', () => {
    const lowSuspicion = createWorldStateV2(9_100, WORLD_CONTENT_V2);
    const host = nationIdV2('bel');
    const guest = nationIdV2('nld');
    const rival = nationIdV2('deu');
    setHumanPlayers(lowSuspicion, [host, guest]);
    lowSuspicion.tick = 104;
    lowSuspicion.aiEscalation.globalThreat = 0;
    for (const playerId of [host, guest, rival]) {
      lowSuspicion.players[playerId]!.budget = {
        military: 40,
        research: 30,
        development: 30,
      };
    }
    const highSuspicion = structuredClone(lowSuspicion);
    highSuspicion.aiEscalation.globalThreat = 100;

    const plannedMilitary = (state: WorldStateV2, playerId: PlayerId): number => {
      const command = planAiCommandsV2(state, WORLD_CONTENT_V2).find((candidate) => (
        candidate.type === 'set-budget-policy' && candidate.playerId === playerId
      ));
      return command?.type === 'set-budget-policy'
        ? command.budget.military
        : state.players[playerId]!.budget.military;
    };

    for (const human of [host, guest]) {
      expect(plannedMilitary(highSuspicion, human))
        .toBe(plannedMilitary(lowSuspicion, human));
    }
    expect(plannedMilitary(highSuspicion, rival))
      .toBe(plannedMilitary(lowSuspicion, rival));
  });

  it('keeps EONSCAR economy and research active without choosing a second human war or peace', () => {
    const state = createWorldStateV2(9_101, WORLD_CONTENT_V2);
    const primary = nationIdV2('bel');
    const secondHuman = nationIdV2('nld');
    const aiOpponent = nationIdV2('deu');
    setHumanPlayers(state, [primary, secondHuman]);
    state.tick = 96;
    state.players[secondHuman]!.warFatigue = 100;
    for (const territory of Object.values(state.territories)) {
      if (territory.owner === secondHuman) territory.army.manpower = territory.army.capacity * 0.2;
    }
    state.wars = [{
      id: 'war-secondary-human',
      attackerId: aiOpponent,
      defenderId: secondHuman,
      startedTick: 40,
      lastBattleTick: 96,
      warScore: -45,
      battles: 16,
      attackerLosses: 0.1,
      defenderLosses: 0.2,
      lastPeaceOfferTick: 90,
      attackerOperations: [],
      defenderOperations: [],
    }];
    state.offers = [];

    const commands = planAiCommandsV2(state, WORLD_CONTENT_V2);

    expect(commands.some((command) => (
      command.type === 'set-budget-policy' && command.playerId === secondHuman
    ))).toBe(true);
    expect(commands.some((command) => (
      command.type === 'set-research-allocations' && command.playerId === secondHuman
    ))).toBe(true);
    expect(commands.some((command) => (
      command.type === 'declare-war' && command.attackerId === secondHuman
    ))).toBe(false);
    expect(state.offers).toEqual([]);
  });

  it('never treats any human country as an autonomous defensive-aid actor', () => {
    const state = createWorldStateV2(9_102, WORLD_CONTENT_V2);
    const primary = nationIdV2('bel');
    const secondHuman = nationIdV2('nld');
    const attacker = nationIdV2('fra');
    setHumanPlayers(state, [primary, secondHuman]);
    state.tick = 80;
    const war = {
      id: 'war-aid-boundary',
      attackerId: attacker,
      defenderId: primary,
      startedTick: 40,
      lastBattleTick: 80,
      warScore: 20,
      battles: 12,
      attackerLosses: 0.02,
      defenderLosses: 0.08,
      lastPeaceOfferTick: -1_000_000,
      attackerOperations: [],
      defenderOperations: [],
    };

    expect(selectDefensiveAidAssessmentV2(
      state,
      WORLD_CONTENT_V2,
      secondHuman,
      war,
      'land',
      createPowerSnapshotV2(state, WORLD_CONTENT_V2),
    )).toBeUndefined();
  });

  it('retires propaganda for every human and clears legacy programs', () => {
    const state = createWorldStateV2(9_103, WORLD_CONTENT_V2);
    const primary = nationIdV2('bel');
    const secondHuman = nationIdV2('nld');
    setHumanPlayers(state, [primary, secondHuman]);
    state.players[primary]!.treasury = 1_000_000;
    state.players[secondHuman]!.treasury = 1_000_000;

    expect(selectPropagandaTermsV2(state, WORLD_CONTENT_V2, primary).allowed).toBe(false);
    expect(selectPropagandaTermsV2(state, WORLD_CONTENT_V2, secondHuman).allowed).toBe(false);

    for (const playerId of [primary, secondHuman]) {
      state.players[playerId]!.propagandaProgram = {
        startedTick: 0,
        endsTick: 52,
        totalSuspicionReduction: 15,
        weeklySuspicionReduction: 15 / 52,
      };
    }
    state.aiEscalation.globalThreat = 60;
    state.tick = 1;

    processPropagandaProgramsV2(state);

    expect(state.aiEscalation.globalThreat).toBe(60);
    expect(state.players[primary]!.propagandaProgram).toBeNull();
    expect(state.players[secondHuman]!.propagandaProgram).toBeNull();
  });

  it('marks every human nation and its relevant events as human-facing', () => {
    const state = createWorldStateV2(9_104, WORLD_CONTENT_V2);
    const primary = nationIdV2('bel');
    const secondHuman = nationIdV2('nld');
    const aiNation = nationIdV2('deu');
    setHumanPlayers(state, [primary, secondHuman]);

    expect(selectNationViewV2(state, WORLD_CONTENT_V2, primary)?.isHuman).toBe(true);
    expect(selectNationViewV2(state, WORLD_CONTENT_V2, secondHuman)?.isHuman).toBe(true);
    expect(selectNationViewV2(state, WORLD_CONTENT_V2, aiNation)?.isHuman).toBe(false);

    addWorldEventV2(state, 'system', 'action', 'Second human report', undefined, secondHuman);
    expect(state.events.at(-1)?.unread).toBe(true);
    addWorldEventV2(state, 'system', 'action', 'Second human territory report', territoryIdV2('nld'));
    expect(state.events.at(-1)?.unread).toBe(true);
    addWorldEventV2(state, 'system', 'action', 'AI-only report', undefined, aiNation);
    expect(state.events.at(-1)?.unread).toBe(false);
  });

  it('clears the complete legacy resistance roster in serious modes', () => {
    const state = createWorldStateV2(9_105, WORLD_CONTENT_V2);
    const primary = nationIdV2('bel');
    const secondHuman = nationIdV2('nld');
    const aiMember = nationIdV2('lux');
    setHumanPlayers(state, [primary, secondHuman]);
    state.tick = 1;
    state.aiEscalation.coalitionMembers = [secondHuman, aiMember];

    expect(selectGlobalResistanceV2(state, WORLD_CONTENT_V2).memberIds).toEqual([]);
    updateGlobalResistanceV2(
      state,
      WORLD_CONTENT_V2,
      createPowerSnapshotV2(state, WORLD_CONTENT_V2),
    );

    expect(state.aiEscalation.coalitionMembers).toEqual([]);
    expect(state.aiEscalation.globalThreat).toBe(0);
    expect(state.players[secondHuman]).toBeDefined();
    expect(state.territories[territoryIdV2('nld')]?.owner).toBe(secondHuman);
  });
});
