import { describe, expect, it } from 'vitest';
import { addWorldEventV2 } from './events';
import { TRUCE_TICKS } from './balance';
import { createWorldStateV2 } from './bootstrap';
import { synchronizeArmyCapacityV2 } from './capacity';
import { WORLD_CONTENT_V2 } from './content';
import {
  APEX_POST_WAR_RECOVERY_DELAY_TICKS_V2,
  processApexNarrativeV2,
  respondToApexTransmissionV2,
  selectApexTransmissionsV2,
} from './apexNarrative';
import { loadSaveV2, serializeSaveV2 } from './persistence';
import { resolveScenarioV2 } from './scenarios';
import {
  nationIdV2,
  territoryIdV2,
  type ApexTransmissionV2,
  type PlayerId,
  type WarStateV2,
  type WorldStateV2,
} from './types';

const france = nationIdV2('fra');

function resolvedTransmission(
  playerId: PlayerId,
  id: ApexTransmissionV2['id'],
  sentTick: number,
  action: ApexTransmissionV2['action'] = null,
  targetId: ApexTransmissionV2['targetId'] = null,
): ApexTransmissionV2 {
  return {
    id,
    playerId,
    sentTick,
    title: id,
    body: `${id} briefing`,
    action,
    targetId: targetId ?? (action === 'first-strike-guidance' ? territoryIdV2('fra') : null),
    choice: action === 'north-pole-investigation' ? 'accept' : 'acknowledge',
    resolvedTick: sentTick,
  };
}

function seedResolvedEarlyCampaignStory(state: WorldStateV2): PlayerId {
  const playerId = state.humanPlayerId;
  state.polarEndgame.apexNarrative.players[playerId] = {
    investigationAuthorized: true,
    transmissions: [
      resolvedTransmission(playerId, 'campaign-signal-anomaly', 6, 'north-pole-investigation'),
      resolvedTransmission(playerId, 'campaign-communications-blackout', 9),
      resolvedTransmission(playerId, 'campaign-ai-defeat-pattern', 12),
      resolvedTransmission(playerId, 'campaign-first-strike-guidance', 15, 'first-strike-guidance'),
      resolvedTransmission(playerId, 'campaign-first-conquest', 18, null, territoryIdV2('fra')),
    ],
  };
  return playerId;
}

function liveWar(state: WorldStateV2, playerId: PlayerId): WarStateV2 {
  return {
    id: `war-${state.nextWarId++}`,
    attackerId: playerId,
    defenderId: france,
    startedTick: state.tick,
    lastBattleTick: state.tick,
    warScore: 0,
    battles: 1,
    attackerLosses: 0.01,
    defenderLosses: 0.02,
    lastPeaceOfferTick: -1_000_000,
    attackerOperations: [],
    defenderOperations: [],
  };
}

function concludeHumanWar(
  state: WorldStateV2,
  playerId: PlayerId,
  tick: number,
): void {
  state.tick = tick;
  state.wars = state.wars.filter((war) => (
    war.attackerId !== playerId && war.defenderId !== playerId
  ));
  const [leftId, rightId] = [playerId, france].sort() as [PlayerId, PlayerId];
  state.truces = state.truces.filter((truce) => (
    truce.leftId !== leftId || truce.rightId !== rightId
  ));
  state.truces.push({ leftId, rightId, expiresTick: tick + TRUCE_TICKS });
  addWorldEventV2(
    state,
    'peace',
    'action',
    'The first campaign concluded.',
    undefined,
    playerId,
  );
}

describe('APEX post-war recovery transmission', () => {
  it('waits for the first war to end and for three fully quiet weeks', () => {
    const state = createWorldStateV2(89_201, WORLD_CONTENT_V2);
    const playerId = seedResolvedEarlyCampaignStory(state);
    state.tick = 18;
    state.wars.push(liveWar(state, playerId));

    state.tick = 30;
    expect(processApexNarrativeV2(state, WORLD_CONTENT_V2)).toBe(0);
    expect(selectApexTransmissionsV2(state, playerId)
      .some((item) => item.id === 'campaign-first-war-recovery')).toBe(false);

    concludeHumanWar(state, playerId, 31);
    state.tick = 31 + APEX_POST_WAR_RECOVERY_DELAY_TICKS_V2 - 1;
    expect(processApexNarrativeV2(state, WORLD_CONTENT_V2)).toBe(0);
    state.tick += 1;
    expect(processApexNarrativeV2(state, WORLD_CONTENT_V2)).toBe(1);

    const recovery = selectApexTransmissionsV2(state, playerId).at(-1)!;
    expect(recovery).toMatchObject({
      id: 'campaign-first-war-recovery',
      title: 'Recovery window',
      action: null,
      choice: null,
      sentTick: 34,
    });
    expect(recovery.body).toContain('automatically rebuilding its active army and front logistics');
    expect(recovery.body).toContain('Use this quiet window for Research and your next strategy');
    expect(processApexNarrativeV2(state, WORLD_CONTENT_V2)).toBe(0);
  });

  it('never interrupts a new war and restarts the quiet delay after it ends', () => {
    const state = createWorldStateV2(89_202, WORLD_CONTENT_V2);
    const playerId = seedResolvedEarlyCampaignStory(state);
    concludeHumanWar(state, playerId, 20);
    state.tick = 22;
    state.wars.push(liveWar(state, playerId));

    state.tick = 30;
    expect(processApexNarrativeV2(state, WORLD_CONTENT_V2)).toBe(0);
    concludeHumanWar(state, playerId, 31);
    state.tick = 33;
    expect(processApexNarrativeV2(state, WORLD_CONTENT_V2)).toBe(0);
    state.tick = 34;
    expect(processApexNarrativeV2(state, WORLD_CONTENT_V2)).toBe(1);
    expect(selectApexTransmissionsV2(state, playerId).at(-1)?.id)
      .toBe('campaign-first-war-recovery');
  });

  it('persists acknowledgement and never replays after an authenticated load', () => {
    const state = createWorldStateV2(89_203, WORLD_CONTENT_V2);
    const playerId = seedResolvedEarlyCampaignStory(state);
    concludeHumanWar(state, playerId, 20);
    state.tick = 23;
    expect(processApexNarrativeV2(state, WORLD_CONTENT_V2)).toBe(1);
    expect(respondToApexTransmissionV2(
      state,
      playerId,
      'campaign-first-war-recovery',
      'acknowledge',
    )).toEqual({ accepted: true });

    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const serialized = serializeSaveV2(state, WORLD_CONTENT_V2);
    const loaded = loadSaveV2(serialized, WORLD_CONTENT_V2);
    expect(processApexNarrativeV2(loaded, WORLD_CONTENT_V2)).toBe(0);
    expect(selectApexTransmissionsV2(loaded, playerId)
      .filter((item) => item.id === 'campaign-first-war-recovery')).toHaveLength(1);
    expect(serializeSaveV2(loaded, WORLD_CONTENT_V2)).toBe(serialized);
  });

  it('preserves the three-week recovery clock when reconnect drops transient event copy', () => {
    const state = createWorldStateV2(89_205, WORLD_CONTENT_V2);
    const playerId = seedResolvedEarlyCampaignStory(state);
    concludeHumanWar(state, playerId, 20);
    state.tick = 21;
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const loaded = loadSaveV2(serializeSaveV2(state, WORLD_CONTENT_V2), WORLD_CONTENT_V2);
    expect(loaded.events).toEqual([]);
    loaded.tick = 22;
    expect(processApexNarrativeV2(loaded, WORLD_CONTENT_V2)).toBe(0);
    loaded.tick = 23;
    expect(processApexNarrativeV2(loaded, WORLD_CONTENT_V2)).toBe(1);
    expect(selectApexTransmissionsV2(loaded, playerId).at(-1)?.id)
      .toBe('campaign-first-war-recovery');
  });

  it('stays out of Survival and Alternative Universe', () => {
    for (const mode of ['survival', 'random-world'] as const) {
      const content = resolveScenarioV2({ mode, seed: 89_204 }).content;
      const state = createWorldStateV2(89_204, content);
      const playerId = seedResolvedEarlyCampaignStory(state);
      concludeHumanWar(state, playerId, 20);
      state.tick = 100;
      processApexNarrativeV2(state, content);
      expect(selectApexTransmissionsV2(state, playerId)
        .some((item) => item.id === 'campaign-first-war-recovery')).toBe(false);
    }
  });
});
