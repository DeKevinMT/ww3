import { describe, expect, it } from 'vitest';
import { createWorldStateV2, openingConflictScheduleV2 } from './bootstrap';
import {
  processCampaignFirstStrikeGuidanceV2,
  selectCampaignFirstStrikeTargetV2,
} from './campaignFirstStrike';
import { synchronizeArmyCapacityV2 } from './capacity';
import {
  CAMPAIGN_FIRST_STRIKE_MOBILIZATION_TICKS_V2,
  CAMPAIGN_HUMAN_WAR_STORY_LOCK_REASON_V2,
  campaignHumanWarsUnlockedV2,
} from './campaignPrologue';
import { WORLD_CONTENT_V2 } from './content';
import {
  APEX_FIRST_AI_WAR_OBSERVATION_TICKS_V2,
  APEX_FIRST_TRANSMISSION_TICK_V2,
  APEX_TUTORIAL_TRANSMISSION_MIN_SPACING_TICKS_V2,
  processApexNarrativeV2,
  respondToApexTransmissionV2,
} from './apexNarrative';
import { processArcticResearchV2, startArcticProjectV2 } from './polarEndgame';
import { addWorldEventV2 } from './events';
import { createSaveV2, loadSaveV2 } from './persistence';
import { nationIdV2 } from './types';
import { warDeclarationStatusV2 } from './war';
import { WorldEngineV2 } from './WorldEngineV2';

function startManipulatedWar(state: ReturnType<typeof createWorldStateV2>): void {
  const [attackerId, defenderId] = WORLD_CONTENT_V2.nationIds.filter((id) => (
    !state.humanPlayerIds.includes(id) && WORLD_CONTENT_V2.nations[id]?.kind !== 'rogue-ai'
  ));
  state.wars.push({
    id: `war-${state.nextWarId++}`,
    attackerId: attackerId!,
    defenderId: defenderId!,
    startedTick: state.tick,
    lastBattleTick: state.tick,
    warScore: 0,
    battles: 0,
    attackerLosses: 0,
    defenderLosses: 0,
    attackerCivilianLosses: 0,
    defenderCivilianLosses: 0,
    lastPeaceOfferTick: -1_000_000,
    attackerOperations: [],
    defenderOperations: [],
  });
}

function finishSignalTriangulation(seed: number) {
  const state = createWorldStateV2(seed, WORLD_CONTENT_V2);
  const playerId = state.humanPlayerId;
  state.tick = APEX_FIRST_TRANSMISSION_TICK_V2;
  expect(processApexNarrativeV2(state, WORLD_CONTENT_V2)).toBe(1);
  expect(respondToApexTransmissionV2(
    state, playerId, 'campaign-signal-anomaly', 'accept',
  )).toEqual({ accepted: true });
  state.players[playerId]!.treasury = 10;
  expect(startArcticProjectV2(
    state, WORLD_CONTENT_V2, playerId, 'polar-demography',
  )).toEqual({ accepted: true });
  const completesTick = state.polarEndgame.arcticPrograms[playerId]!
    .activeProject!.completesTick;
  state.tick = completesTick;
  expect(processArcticResearchV2(state, WORLD_CONTENT_V2)).toEqual([
    { kind: 'project-complete', playerId, projectId: 'polar-demography' },
  ]);
  expect(state.polarEndgame.communicationsBlackoutTick).toBe(completesTick);
  return { state, playerId };
}

describe('post-blackout EONSCAR first-strike guidance', () => {
  it('runs the authoritative beginner chronology in order without message bursts', () => {
    const engine = new WorldEngineV2(84_100);
    const playerId = engine.state.humanPlayerId;
    const proofWarDelay = openingConflictScheduleV2(engine.state.seed, engine.content)[0]!.tick;
    engine.step(APEX_FIRST_TRANSMISSION_TICK_V2);
    expect(engine.apexTransmissions(playerId).map((item) => item.id))
      .toEqual(['campaign-signal-anomaly']);
    expect(engine.respondApexTransmission(
      playerId, 'campaign-signal-anomaly', 'accept',
    )).toEqual({ accepted: true });
    engine.step();
    const completesTick = engine.state.polarEndgame.arcticPrograms[playerId]!
      .activeProject!.completesTick;
    expect(completesTick).toBe(19);
    engine.step(completesTick - engine.state.tick);
    expect(engine.apexTransmissions(playerId).map((item) => item.id))
      .toEqual(['campaign-signal-anomaly', 'campaign-communications-blackout']);
    expect(engine.respondApexTransmission(
      playerId, 'campaign-communications-blackout', 'acknowledge',
    )).toEqual({ accepted: true });
    engine.step();

    while (!engine.apexTransmissions(playerId).some((item) => (
      item.id === 'campaign-ai-defeat-pattern'
    )) && engine.state.tick < completesTick + 80) engine.step();
    const pattern = engine.apexTransmissions(playerId)
      .find((item) => item.id === 'campaign-ai-defeat-pattern');
    expect(pattern).toBeDefined();
    const firstAiWarTick = engine.state.wars
      .filter((war) => !engine.state.humanPlayerIds.includes(war.attackerId)
        && !engine.state.humanPlayerIds.includes(war.defenderId))
      .map((war) => war.startedTick)
      .sort((left, right) => left - right)[0];
    expect(firstAiWarTick).toBe(completesTick + proofWarDelay);
    expect(pattern!.sentTick).toBe(firstAiWarTick! + APEX_FIRST_AI_WAR_OBSERVATION_TICKS_V2);
    expect(engine.apexTransmissions(playerId).filter((item) => item.choice === null))
      .toHaveLength(1);
    expect(engine.respondApexTransmission(
      playerId, 'campaign-ai-defeat-pattern', 'acknowledge',
    )).toEqual({ accepted: true });
    engine.step();
    while (!engine.apexTransmissions(playerId).some((item) => (
      item.id === 'campaign-first-strike-guidance'
    )) && engine.state.tick < pattern!.sentTick + 10) engine.step();
    expect(engine.apexTransmissions(playerId).map((item) => item.id)).toEqual([
      'campaign-signal-anomaly',
      'campaign-communications-blackout',
      'campaign-ai-defeat-pattern',
      'campaign-first-strike-guidance',
    ]);
    expect(engine.apexTransmissions(playerId).filter((item) => item.choice === null))
      .toHaveLength(1);
    const guidance = engine.apexTransmissions(playerId)
      .find((item) => item.id === 'campaign-first-strike-guidance')!;
    expect(guidance.sentTick)
      .toBe(pattern!.sentTick + APEX_TUTORIAL_TRANSMISSION_MIN_SPACING_TICKS_V2);
    expect(guidance.sentTick).toBe(37);
    expect(engine.respondApexTransmission(
      playerId, 'campaign-first-strike-guidance', 'acknowledge',
    )).toEqual({ accepted: true });
    // Informational acknowledgements commit on the next authoritative tick;
    // the solo overlay resumes into that boundary instead of mutating mid-tick.
    engine.step();
    expect(campaignHumanWarsUnlockedV2(engine.state, engine.content, playerId)).toBe(true);

    const defenderId = engine.state.territories[guidance.targetId!]!.owner;
    let firstContactTick: number | undefined;
    engine.subscribe((_state, change) => {
      if (change.reason === 'battle' && change.battle
        && change.battle.warId === engine.state.wars.find((war) => (
          war.attackerId === playerId && war.defenderId === defenderId
        ))?.id) firstContactTick ??= change.battle.tick;
    });
    expect(engine.declareWar(playerId, defenderId)).toEqual({ accepted: true });
    while (firstContactTick === undefined && engine.state.tick < guidance.sentTick + 10) engine.step();
    expect(firstContactTick).toBe(
      guidance.sentTick + 1 + CAMPAIGN_FIRST_STRIKE_MOBILIZATION_TICKS_V2,
    );
  }, 15_000);

  it('selects the canonical nearby viable target and never auto-declares war', () => {
    const { state, playerId } = finishSignalTriangulation(84_101);
    expect(selectCampaignFirstStrikeTargetV2(
      state, WORLD_CONTENT_V2, playerId,
    )).toBeUndefined();
    expect(processApexNarrativeV2(state, WORLD_CONTENT_V2)).toBe(1);
    expect(processCampaignFirstStrikeGuidanceV2(state, WORLD_CONTENT_V2)).toBe(0);
    expect(respondToApexTransmissionV2(
      state, playerId, 'campaign-communications-blackout', 'acknowledge',
    )).toEqual({ accepted: true });
    state.tick += APEX_TUTORIAL_TRANSMISSION_MIN_SPACING_TICKS_V2;
    startManipulatedWar(state);
    const firstWarTick = state.tick;
    expect(processApexNarrativeV2(state, WORLD_CONTENT_V2)).toBe(0);
    state.tick += APEX_FIRST_AI_WAR_OBSERVATION_TICKS_V2 - 1;
    expect(processApexNarrativeV2(state, WORLD_CONTENT_V2)).toBe(0);
    state.tick += 1;
    expect(processApexNarrativeV2(state, WORLD_CONTENT_V2)).toBe(1);
    expect(respondToApexTransmissionV2(
      state, playerId, 'campaign-ai-defeat-pattern', 'acknowledge',
    )).toEqual({ accepted: true });
    const target = selectCampaignFirstStrikeTargetV2(
      state, WORLD_CONTENT_V2, playerId,
    );
    expect(target).toMatchObject({ access: 'land' });
    expect(target!.chance).toBeGreaterThanOrEqual(35);
    expect(state.territories[target!.sourceTerritoryId]!.owner).toBe(playerId);
    expect(state.territories[target!.objectiveTerritoryId]!.owner).toBe(target!.opponentId);
    expect(warDeclarationStatusV2(
      state, WORLD_CONTENT_V2, playerId, target!.opponentId,
    )).toMatchObject({ allowed: false, reason: CAMPAIGN_HUMAN_WAR_STORY_LOCK_REASON_V2 });
    expect(warDeclarationStatusV2(
      state, WORLD_CONTENT_V2, target!.opponentId, playerId,
    )).toMatchObject({ allowed: false, reason: CAMPAIGN_HUMAN_WAR_STORY_LOCK_REASON_V2 });
    state.tick += APEX_TUTORIAL_TRANSMISSION_MIN_SPACING_TICKS_V2 - 1;
    expect(processCampaignFirstStrikeGuidanceV2(state, WORLD_CONTENT_V2)).toBe(0);
    state.tick += 1;
    expect(processCampaignFirstStrikeGuidanceV2(state, WORLD_CONTENT_V2)).toBe(1);
    expect(state.wars).toHaveLength(1);
    expect(state.wars.some((war) => (
      war.attackerId === playerId || war.defenderId === playerId
    ))).toBe(false);

    expect(state.polarEndgame.apexNarrative.players[playerId]!.transmissions
      .map((item) => item.id)).toEqual([
      'campaign-signal-anomaly',
      'campaign-communications-blackout',
      'campaign-ai-defeat-pattern',
      'campaign-first-strike-guidance',
    ]);

    const transmission = state.polarEndgame.apexNarrative.players[playerId]!
      .transmissions.find((item) => item.id === 'campaign-first-strike-guidance');
    expect(transmission).toMatchObject({
      action: 'first-strike-guidance',
      targetId: target!.objectiveTerritoryId,
      choice: null,
      sentTick: state.tick,
    });
    const explanation = state.polarEndgame.apexNarrative.players[playerId]!
      .transmissions.find((item) => item.id === 'campaign-ai-defeat-pattern')!;
    expect(firstWarTick).toBeLessThan(explanation.sentTick);
    expect(explanation.sentTick).toBeLessThan(transmission!.sentTick);
    expect(transmission?.body).toContain(`${Math.round(target!.chance)}% projected success`);
    expect(campaignHumanWarsUnlockedV2(state, WORLD_CONTENT_V2, playerId)).toBe(false);
    expect(respondToApexTransmissionV2(
      state, playerId, 'campaign-first-strike-guidance', 'acknowledge',
    )).toEqual({ accepted: true });
    expect(campaignHumanWarsUnlockedV2(state, WORLD_CONTENT_V2, playerId)).toBe(true);
  });

  it('persists each multiplayer seat target exactly and cannot replay after reconnect', () => {
    const { state, playerId } = finishSignalTriangulation(84_102);
    const secondPlayer = nationIdV2('nld');
    state.humanPlayerIds = [playerId, secondPlayer]
      .sort((left, right) => left.localeCompare(right));

    processApexNarrativeV2(state, WORLD_CONTENT_V2);
    for (const humanId of state.humanPlayerIds) {
      const progress = state.polarEndgame.apexNarrative.players[humanId] ??= {
        investigationAuthorized: true,
        transmissions: [],
      };
      if (!progress.transmissions.some((item) => item.id === 'campaign-signal-anomaly')) {
        progress.transmissions.push({
          id: 'campaign-signal-anomaly', playerId: humanId,
          sentTick: APEX_FIRST_TRANSMISSION_TICK_V2,
          title: 'A signal beneath the ice', body: 'Fixture.',
          action: 'north-pole-investigation', targetId: null, choice: 'accept',
          resolvedTick: APEX_FIRST_TRANSMISSION_TICK_V2,
        });
      }
      const anomaly = progress.transmissions.find((item) => item.id === 'campaign-signal-anomaly');
      if (anomaly) {
        anomaly.choice = 'accept';
        anomaly.resolvedTick ??= state.tick;
      }
      const blackout = progress.transmissions.find((item) => (
        item.id === 'campaign-communications-blackout'
      ));
      if (blackout) {
        blackout.choice = 'acknowledge';
        blackout.resolvedTick = state.tick;
      }
    }
    state.tick += APEX_TUTORIAL_TRANSMISSION_MIN_SPACING_TICKS_V2;
    processApexNarrativeV2(state, WORLD_CONTENT_V2);
    for (const humanId of state.humanPlayerIds) {
      const blackout = state.polarEndgame.apexNarrative.players[humanId]!.transmissions
        .find((item) => item.id === 'campaign-communications-blackout');
      expect(blackout).toBeDefined();
      blackout!.choice = 'acknowledge';
      blackout!.resolvedTick = state.tick;
    }
    state.tick += APEX_TUTORIAL_TRANSMISSION_MIN_SPACING_TICKS_V2;
    startManipulatedWar(state);
    state.tick += APEX_FIRST_AI_WAR_OBSERVATION_TICKS_V2;
    expect(processApexNarrativeV2(state, WORLD_CONTENT_V2)).toBe(2);
    for (const humanId of state.humanPlayerIds) {
      expect(respondToApexTransmissionV2(
        state, humanId, 'campaign-ai-defeat-pattern', 'acknowledge',
      )).toEqual({ accepted: true });
    }
    state.tick += APEX_TUTORIAL_TRANSMISSION_MIN_SPACING_TICKS_V2;
    expect(processCampaignFirstStrikeGuidanceV2(state, WORLD_CONTENT_V2)).toBe(2);
    for (const humanId of state.humanPlayerIds) {
      const transmission = state.polarEndgame.apexNarrative.players[humanId]!
        .transmissions.find((item) => item.id === 'campaign-first-strike-guidance');
      expect(transmission?.playerId).toBe(humanId);
      expect(transmission?.targetId).not.toBeNull();
      expect(state.territories[transmission!.targetId!]!.owner).not.toBe(humanId);
    }

    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const loaded = loadSaveV2(createSaveV2(state, WORLD_CONTENT_V2), WORLD_CONTENT_V2);
    expect(loaded.polarEndgame.apexNarrative).toEqual(state.polarEndgame.apexNarrative);
    expect(processCampaignFirstStrikeGuidanceV2(loaded, WORLD_CONTENT_V2)).toBe(0);
  });

  it('preserves the two-week observation window across reconnect without replay or backlog', () => {
    const { state, playerId } = finishSignalTriangulation(84_103);
    expect(processApexNarrativeV2(state, WORLD_CONTENT_V2)).toBe(1);
    expect(respondToApexTransmissionV2(
      state, playerId, 'campaign-communications-blackout', 'acknowledge',
    )).toEqual({ accepted: true });
    state.tick += APEX_TUTORIAL_TRANSMISSION_MIN_SPACING_TICKS_V2;
    startManipulatedWar(state);
    const warTick = state.tick;
    expect(processApexNarrativeV2(state, WORLD_CONTENT_V2)).toBe(0);

    state.tick += 1;
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const loaded = loadSaveV2(createSaveV2(state, WORLD_CONTENT_V2), WORLD_CONTENT_V2);
    expect(processApexNarrativeV2(loaded, WORLD_CONTENT_V2)).toBe(0);
    loaded.tick += 1;
    expect(processApexNarrativeV2(loaded, WORLD_CONTENT_V2)).toBe(1);
    expect(loaded.polarEndgame.apexNarrative.players[playerId]!.transmissions
      .find((item) => item.id === 'campaign-ai-defeat-pattern'))
      .toMatchObject({ sentTick: warTick + APEX_FIRST_AI_WAR_OBSERVATION_TICKS_V2 });
    expect(processApexNarrativeV2(loaded, WORLD_CONTENT_V2)).toBe(0);
  });

  it('still explains a short proof conflict that ended just before reconnect', () => {
    const { state, playerId } = finishSignalTriangulation(84_105);
    expect(processApexNarrativeV2(state, WORLD_CONTENT_V2)).toBe(1);
    expect(respondToApexTransmissionV2(
      state, playerId, 'campaign-communications-blackout', 'acknowledge',
    )).toEqual({ accepted: true });
    state.tick += APEX_TUTORIAL_TRANSMISSION_MIN_SPACING_TICKS_V2;
    const conflictTick = state.tick;
    addWorldEventV2(
      state,
      'war',
      'critical',
      'MANIPULATED CONFLICT · Belgium attacked Netherlands. Regional command fracture.',
    );
    state.aiEscalation.lastWarStartTick = conflictTick;
    state.tick += APEX_FIRST_AI_WAR_OBSERVATION_TICKS_V2 - 1;
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const loaded = loadSaveV2(createSaveV2(state, WORLD_CONTENT_V2), WORLD_CONTENT_V2);
    expect(loaded.events).toEqual([]);
    expect(loaded.aiEscalation.lastWarStartTick).toBe(conflictTick);
    expect(loaded.polarEndgame.apexNarrative.players[playerId]!.transmissions.at(-1))
      .toMatchObject({ id: 'campaign-communications-blackout', choice: 'acknowledge' });
    expect(processApexNarrativeV2(loaded, WORLD_CONTENT_V2)).toBe(0);
    let dispatchedTick: number | undefined;
    for (let offset = 0; offset < 10 && dispatchedTick === undefined; offset += 1) {
      loaded.tick += 1;
      if (processApexNarrativeV2(loaded, WORLD_CONTENT_V2) === 1) dispatchedTick = loaded.tick;
    }
    expect(dispatchedTick).toBe(conflictTick + APEX_FIRST_AI_WAR_OBSERVATION_TICKS_V2);
    expect(loaded.polarEndgame.apexNarrative.players[playerId]!.transmissions.at(-1))
      .toMatchObject({
        id: 'campaign-ai-defeat-pattern',
        sentTick: conflictTick + APEX_FIRST_AI_WAR_OBSERVATION_TICKS_V2,
      });
    expect(loaded.polarEndgame.apexNarrative.players[playerId]!.transmissions.at(-1)?.body)
      .toContain('countries in the conflict you just saw');
  });

  it('ignores an historic pre-blackout AI war when looking for the first manipulated conflict', () => {
    const { state, playerId } = finishSignalTriangulation(84_104);
    expect(processApexNarrativeV2(state, WORLD_CONTENT_V2)).toBe(1);
    expect(respondToApexTransmissionV2(
      state, playerId, 'campaign-communications-blackout', 'acknowledge',
    )).toEqual({ accepted: true });
    startManipulatedWar(state);
    state.wars[0]!.startedTick = state.polarEndgame.communicationsBlackoutTick! - 1;
    state.tick += 20;
    expect(processApexNarrativeV2(state, WORLD_CONTENT_V2)).toBe(0);
    expect(state.polarEndgame.apexNarrative.players[playerId]!.transmissions
      .some((item) => item.id === 'campaign-ai-defeat-pattern')).toBe(false);
  });
});
