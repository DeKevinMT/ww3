import { describe, expect, it } from 'vitest';
import {
  createCommanderProfileV1,
  resolveCommanderForceInitializationV1,
  resolveCountryLoadoutV1,
} from '../../meta/commanderProfile';
import {
  BATTLE_INTERVAL_TICKS,
  WAR_MOBILIZATION_TICKS,
} from './balance';
import { WorldEngineV2 } from './WorldEngineV2';
import { selectCampaignFirstStrikeTargetV2 } from './campaignFirstStrike';
import {
  CAMPAIGN_FIRST_STRIKE_MOBILIZATION_TICKS_V2,
  CAMPAIGN_FIRST_STRIKE_BATTLE_INTERVAL_TICKS_V2,
  campaignProspectiveWarBattleIntervalTicksV2,
  campaignProspectiveWarMobilizationTicksV2,
  campaignWarBattleIntervalTicksV2,
  campaignWarMobilizationTicksV2,
} from './campaignPrologue';
import { WORLD_CONTENT_V2 } from './content';
import { selectWarRouteDistanceKmV2 } from './selectors';
import { nationIdV2, type PlayerId } from './types';

const GREENLAND = nationIdV2('grl');
const GUIDED_TARGET = nationIdV2('gnb');
const CURRENT_BEST_TARGET = nationIdV2('guy');
const BELGIUM = nationIdV2('bel');
const NETHERLANDS = nationIdV2('nld');

function greenlandEngine(seed: number): WorldEngineV2 {
  const engine = new WorldEngineV2(seed, WORLD_CONTENT_V2);
  expect(engine.configureHumanPlayers([GREENLAND], GREENLAND)).toEqual({ accepted: true });
  const profile = createCommanderProfileV1(1, `greenland-opening-${seed}`);
  const loadout = resolveCountryLoadoutV1(profile, GREENLAND);
  expect(engine.initializeCommanderForce(
    GREENLAND,
    resolveCommanderForceInitializationV1(loadout),
  )).toEqual({ accepted: true });
  engine.state.polarEndgame.communicationsBlackoutTick = 0;
  engine.state.polarEndgame.apexNarrative.players[GREENLAND] = {
    investigationAuthorized: true,
    transmissions: [{
      id: 'campaign-first-strike-guidance',
      playerId: GREENLAND,
      sentTick: 0,
      title: 'Opening corridor',
      body: 'Fixture.',
      action: 'first-strike-guidance',
      targetId: GUIDED_TARGET,
      choice: 'acknowledge',
      resolvedTick: 0,
    }],
  };
  return engine;
}

function battlesAgainst(engine: WorldEngineV2, defenderId: PlayerId): number {
  return engine.state.wars.find((war) => (
    war.attackerId === GREENLAND && war.defenderId === defenderId
  ))?.battles ?? 0;
}

describe('Greenland first campaign war cadence', () => {
  it('guides the real APEX opening toward the safest reachable beachhead with honest logistics', () => {
    const engine = greenlandEngine(84_105);
    engine.state.polarEndgame.apexNarrative.players[GREENLAND]!.transmissions.unshift({
      id: 'campaign-ai-defeat-pattern',
      playerId: GREENLAND,
      sentTick: 0,
      title: 'Manipulation confirmed',
      body: 'Fixture.',
      action: null,
      targetId: null,
      choice: 'acknowledge',
      resolvedTick: 0,
    });
    const target = selectCampaignFirstStrikeTargetV2(
      engine.state,
      WORLD_CONTENT_V2,
      GREENLAND,
    );
    const distanceKm = selectWarRouteDistanceKmV2(
      engine.state,
      WORLD_CONTENT_V2,
      GREENLAND,
      CURRENT_BEST_TARGET,
    )!;

    expect(target).toMatchObject({
      opponentId: CURRENT_BEST_TARGET,
      access: 'naval',
      etaWeeks: CAMPAIGN_FIRST_STRIKE_MOBILIZATION_TICKS_V2,
    });
    expect(distanceKm).toBeGreaterThan(3_000);
    expect(target!.frontSupply).toBe(1);
    expect(target!.transferThroughput).toBe(0.5);
    expect(target!.preparationWeeks).toBeGreaterThan(0);
  });

  it('uses the normal war clock while APEX reaches the guided front before its first pulse', () => {
    const engine = greenlandEngine(84_106);
    const battles: Array<{ tick: number; apexId: PlayerId | null }> = [];
    engine.subscribe((_state, change) => {
      if (change.reason === 'battle' && change.battle) {
        battles.push({
          tick: change.battle.tick,
          apexId: change.battle.commanderAttackerId,
        });
      }
    });

    expect(campaignProspectiveWarMobilizationTicksV2(
      engine.state, WORLD_CONTENT_V2, GREENLAND, GUIDED_TARGET,
    )).toBe(CAMPAIGN_FIRST_STRIKE_MOBILIZATION_TICKS_V2);
    expect(campaignProspectiveWarBattleIntervalTicksV2(
      engine.state, WORLD_CONTENT_V2, GREENLAND, GUIDED_TARGET,
    )).toBe(CAMPAIGN_FIRST_STRIKE_BATTLE_INTERVAL_TICKS_V2);
    expect(engine.declareWar(GREENLAND, GUIDED_TARGET)).toEqual({ accepted: true });
    engine.step(CAMPAIGN_FIRST_STRIKE_MOBILIZATION_TICKS_V2 - 1);
    expect(battlesAgainst(engine, GUIDED_TARGET)).toBe(0);
    engine.step();

    const war = engine.state.wars.find((candidate) => (
      candidate.attackerId === GREENLAND && candidate.defenderId === GUIDED_TARGET
    ))!;
    expect(campaignWarMobilizationTicksV2(engine.state, WORLD_CONTENT_V2, war))
      .toBe(CAMPAIGN_FIRST_STRIKE_MOBILIZATION_TICKS_V2);
    expect(campaignWarBattleIntervalTicksV2(engine.state, WORLD_CONTENT_V2, war))
      .toBe(CAMPAIGN_FIRST_STRIKE_BATTLE_INTERVAL_TICKS_V2);
    expect(war.battles).toBe(1);
    expect(battles[0]).toEqual({
      tick: CAMPAIGN_FIRST_STRIKE_MOBILIZATION_TICKS_V2,
      apexId: GREENLAND,
    });
  });

  it('keeps every non-guided long-distance naval war on the normal clock', () => {
    const engine = greenlandEngine(84_107);
    const mauritania = nationIdV2('mrt');
    const distanceKm = selectWarRouteDistanceKmV2(
      engine.state,
      WORLD_CONTENT_V2,
      GREENLAND,
      mauritania,
    )!;
    expect(distanceKm).toBeGreaterThan(5_000);
    expect(campaignProspectiveWarMobilizationTicksV2(
      engine.state, WORLD_CONTENT_V2, GREENLAND, mauritania,
    )).toBe(WAR_MOBILIZATION_TICKS);
    expect(campaignProspectiveWarBattleIntervalTicksV2(
      engine.state, WORLD_CONTENT_V2, GREENLAND, mauritania,
    )).toBe(BATTLE_INTERVAL_TICKS);

    expect(engine.declareWar(GREENLAND, mauritania)).toEqual({ accepted: true });
    engine.step(WAR_MOBILIZATION_TICKS - 1);
    expect(battlesAgainst(engine, mauritania)).toBe(0);
    engine.step();
    expect(battlesAgainst(engine, mauritania)).toBe(1);
  });

  it('preserves the normal opening-war clock exactly across reconnect', () => {
    const engine = greenlandEngine(84_108);
    expect(engine.declareWar(GREENLAND, GUIDED_TARGET)).toEqual({ accepted: true });
    engine.step(CAMPAIGN_FIRST_STRIKE_MOBILIZATION_TICKS_V2 - 2);
    const restored = WorldEngineV2.fromSave(engine.save(), WORLD_CONTENT_V2);

    expect(restored.canonicalHash()).toBe(engine.canonicalHash());
    restored.step(1);
    expect(battlesAgainst(restored, GUIDED_TARGET)).toBe(0);
    restored.step(1);
    expect(battlesAgainst(restored, GUIDED_TARGET)).toBe(1);
  });

  it('lets the deterministic guided Greenland campaign resolve on natural combat pacing', () => {
    const engine = greenlandEngine(84_109);
    const outcomes: Array<{ startedTick: number; endedTick: number }> = [];
    engine.subscribe((_state, change) => {
      if (change.warOutcome) outcomes.push(change.warOutcome);
    });
    expect(engine.declareWar(GREENLAND, GUIDED_TARGET)).toEqual({ accepted: true });
    for (let week = 0; week < 260 && outcomes.length === 0; week += 1) engine.step();
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]!.startedTick).toBe(0);
    expect(outcomes[0]!.endedTick).toBeGreaterThan(
      CAMPAIGN_FIRST_STRIKE_MOBILIZATION_TICKS_V2
        + CAMPAIGN_FIRST_STRIKE_BATTLE_INTERVAL_TICKS_V2,
    );
  });

  it('gives a non-Greenland start the same standard guided contact clock', () => {
    const engine = new WorldEngineV2(84_110, WORLD_CONTENT_V2);
    expect(engine.configureHumanPlayers([BELGIUM], BELGIUM)).toEqual({ accepted: true });
    const profile = createCommanderProfileV1(1, 'belgium-opening');
    const loadout = resolveCountryLoadoutV1(profile, BELGIUM);
    expect(engine.initializeCommanderForce(
      BELGIUM,
      resolveCommanderForceInitializationV1(loadout),
    )).toEqual({ accepted: true });
    engine.state.polarEndgame.communicationsBlackoutTick = 0;
    engine.state.polarEndgame.apexNarrative.players[BELGIUM] = {
      investigationAuthorized: true,
      transmissions: [{
        id: 'campaign-first-strike-guidance',
        playerId: BELGIUM,
        sentTick: 0,
        title: 'Opening corridor',
        body: 'Fixture.',
        action: 'first-strike-guidance',
        targetId: NETHERLANDS,
        choice: 'acknowledge',
        resolvedTick: 0,
      }],
    };

    expect(campaignProspectiveWarMobilizationTicksV2(
      engine.state, WORLD_CONTENT_V2, BELGIUM, NETHERLANDS,
    )).toBe(CAMPAIGN_FIRST_STRIKE_MOBILIZATION_TICKS_V2);
    expect(campaignProspectiveWarBattleIntervalTicksV2(
      engine.state, WORLD_CONTENT_V2, BELGIUM, NETHERLANDS,
    )).toBe(CAMPAIGN_FIRST_STRIKE_BATTLE_INTERVAL_TICKS_V2);
    expect(engine.declareWar(BELGIUM, NETHERLANDS)).toEqual({ accepted: true });
    engine.step(CAMPAIGN_FIRST_STRIKE_MOBILIZATION_TICKS_V2 - 1);
    expect(engine.state.wars.find((war) => war.attackerId === BELGIUM)?.battles).toBe(0);
    engine.step();
    expect(engine.state.wars.find((war) => war.attackerId === BELGIUM)?.battles).toBe(1);
  });
});
