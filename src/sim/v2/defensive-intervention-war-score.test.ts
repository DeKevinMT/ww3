import { describe, expect, it } from 'vitest';
import {
  defensiveInterventionPowerEstimateV2,
  selectDefensiveAidAssessmentV2,
} from './ai';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2, type WorldContentV2 } from './content';
import type { PowerSnapshotV2 } from './selectors';
import { enterPostBlackoutCampaignForTestV2 } from './testSupport';
import {
  nationIdV2,
  territoryIdV2,
  type FrontOperationV2,
  type PlayerId,
  type WarStateV2,
  type WorldStateV2,
} from './types';
import {
  battleWarScoreSwingV2,
  declareWarV2,
  resolveBattlePulseV2,
  warDeclarationStatusV2,
} from './war';

const aggressor = nationIdV2('deu');
const protectedDefender = nationIdV2('bel');
const supporter = nationIdV2('nld');

function activeWar(
  state: WorldStateV2,
  attackerId = aggressor,
  defenderId = protectedDefender,
  id = 'war-aggression',
): WarStateV2 {
  return {
    id,
    attackerId,
    defenderId,
    startedTick: state.tick - 45,
    lastBattleTick: state.tick,
    warScore: 8,
    battles: 12,
    attackerLosses: 0.02,
    defenderLosses: 0.05,
    attackerCivilianLosses: 0,
    defenderCivilianLosses: 0,
    lastPeaceOfferTick: -1_000_000,
    attackerOperations: [],
    defenderOperations: [],
    revenge: null,
  };
}

function interventionState(seed = 51_001): { state: WorldStateV2; war: WarStateV2 } {
  const state = createWorldStateV2(seed);
  state.tick = 120;
  state.wars = [];
  state.truces = [];
  state.ceasefireObligations = [];
  state.alliances = state.alliances.filter((alliance) => !(
    alliance.memberIds.includes(supporter) && alliance.memberIds.includes(aggressor)
  ));
  for (const id of [aggressor, protectedDefender, supporter]) {
    state.players[id]!.treasury = 1_000_000;
  }
  const war = activeWar(state);
  state.wars.push(war);
  return { state, war };
}

function powerSnapshot(
  aggressorPower: number,
  defenderPower: number,
  supporterPower: number,
): PowerSnapshotV2 {
  return {
    byNation: new Map<PlayerId, number>([
      [aggressor, aggressorPower],
      [protectedDefender, defenderPower],
      [supporter, supporterPower],
    ]),
    leaderPower: Math.max(aggressorPower, defenderPower, supporterPower),
    leaderBreakthroughs: 0,
  };
}

function contentWithIq(playerId: PlayerId, iqScore: number): WorldContentV2 {
  return {
    ...WORLD_CONTENT_V2,
    nations: {
      ...WORLD_CONTENT_V2.nations,
      [playerId]: { ...WORLD_CONTENT_V2.nations[playerId]!, iqScore },
    },
  };
}

function pair(state: WorldStateV2, left: PlayerId, right: PlayerId): boolean {
  return state.wars.some((war) => (
    (war.attackerId === left && war.defenderId === right)
      || (war.attackerId === right && war.defenderId === left)
  ));
}

describe('independent defensive interventions', () => {
  it('lets a human rescue a defender by fighting only the original aggressor', () => {
    const { state } = interventionState();
    state.humanPlayerId = supporter;
    state.humanPlayerIds = [supporter];
    enterPostBlackoutCampaignForTestV2(state);

    const preview = warDeclarationStatusV2(
      state,
      WORLD_CONTENT_V2,
      supporter,
      aggressor,
    );
    expect(preview.allowed).toBe(true);
    expect(preview.warning).toMatch(/defensive intervention/i);
    expect(preview.warning).toMatch(/fight Germany only/i);

    expect(declareWarV2(
      state,
      WORLD_CONTENT_V2,
      supporter,
      aggressor,
    ).accepted).toBe(true);
    expect(pair(state, aggressor, protectedDefender)).toBe(true);
    expect(pair(state, supporter, aggressor)).toBe(true);
    expect(pair(state, supporter, protectedDefender)).toBe(false);
    expect(state.wars).toHaveLength(2);
    expect(state.events.some((event) => /independent defensive intervention/i.test(event.message)
      && /without entering a war against/i.test(event.message))).toBe(true);
  });

  it('ignores the linked-war hint in Campaign, stays bilateral, and honours its target truce', () => {
    const { state, war } = interventionState(51_002);
    expect(declareWarV2(
      state,
      WORLD_CONTENT_V2,
      supporter,
      aggressor,
      war.id,
    ).accepted).toBe(true);
    expect(pair(state, supporter, aggressor)).toBe(true);
    expect(pair(state, supporter, protectedDefender)).toBe(false);
    expect(state.wars).toHaveLength(2);

    const blocked = interventionState(51_003).state;
    blocked.truces.push({
      leftId: supporter,
      rightId: aggressor,
      expiresTick: blocked.tick + 20,
    });
    expect(warDeclarationStatusV2(
      blocked,
      WORLD_CONTENT_V2,
      supporter,
      aggressor,
      blocked.wars[0]!.id,
    )).toMatchObject({ allowed: false });
  });
});

describe('bounded AI intelligence for combined defensive power', () => {
  it('recognises a jointly viable defence even when the supporter is too weak alone', () => {
    const { state, war } = interventionState(52_001);
    const lower = powerSnapshot(100, 25, 55);
    const stronger = powerSnapshot(100, 40, 85);
    expect((lower.byNation.get(supporter) ?? 0) / (lower.byNation.get(aggressor) ?? 1))
      .toBeLessThan(1);

    const assessment = selectDefensiveAidAssessmentV2(
      state,
      WORLD_CONTENT_V2,
      supporter,
      war,
      'land',
      lower,
    );
    const strongerAssessment = selectDefensiveAidAssessmentV2(
      state,
      WORLD_CONTENT_V2,
      supporter,
      war,
      'land',
      stronger,
    );
    expect(assessment).toBeDefined();
    expect(strongerAssessment).toBeDefined();
    expect(strongerAssessment!.priority).toBeGreaterThan(assessment!.priority);
    expect(strongerAssessment!.interventionChance).toBeGreaterThan(assessment!.interventionChance);
    expect(strongerAssessment!.interventionChance).toBeLessThan(1);
  });

  it('can aid a defender against a human aggressor without automating a human supporter', () => {
    const { state, war } = interventionState(52_002);
    state.humanPlayerId = aggressor;
    state.humanPlayerIds = [aggressor];
    const snapshot = powerSnapshot(100, 35, 70);
    expect(selectDefensiveAidAssessmentV2(
      state, WORLD_CONTENT_V2, supporter, war, 'land', snapshot,
    )).toBeDefined();

    state.humanPlayerIds = [aggressor, supporter];
    expect(selectDefensiveAidAssessmentV2(
      state, WORLD_CONTENT_V2, supporter, war, 'land', snapshot,
    )).toBeUndefined();
  });

  it('uses deterministic seeded error, with tighter bounds for stronger intelligence', () => {
    const { state, war } = interventionState(52_003);
    const snapshot = powerSnapshot(100, 30, 65);
    const lowContent = contentWithIq(supporter, 80);
    const highContent = contentWithIq(supporter, 108);
    const low = defensiveInterventionPowerEstimateV2(
      state, lowContent, supporter, war, snapshot,
    );
    const repeated = defensiveInterventionPowerEstimateV2(
      state, lowContent, supporter, war, snapshot,
    );
    const high = defensiveInterventionPowerEstimateV2(
      state, highContent, supporter, war, snapshot,
    );
    expect(repeated).toEqual(low);
    expect(Math.abs(low.intelligenceError)).toBeLessThanOrEqual(low.intelligenceErrorBound);
    expect(high.intelligenceErrorBound).toBeLessThan(low.intelligenceErrorBound);
    expect(Math.abs(high.intelligenceError)).toBeLessThan(Math.abs(low.intelligenceError));

    const estimates = new Set(Array.from({ length: 10 }, (_, index) => {
      const seeded = interventionState(52_100 + index);
      return defensiveInterventionPowerEstimateV2(
        seeded.state,
        lowContent,
        supporter,
        seeded.war,
        snapshot,
      ).estimatedCombinedPowerRatio.toFixed(6);
    }));
    expect(estimates.size).toBeGreaterThan(2);
  });

  it('never lets bounded estimation turn a hopeless combined fight into emergency aid', () => {
    for (let seed = 52_200; seed < 52_224; seed += 1) {
      const { state, war } = interventionState(seed);
      expect(selectDefensiveAidAssessmentV2(
        state,
        contentWithIq(supporter, 80),
        supporter,
        war,
        'land',
        powerSnapshot(100, 10, 10),
      )).toBeUndefined();
    }
  });
});

describe('relative battle war score', () => {
  it('is scale independent, near zero for equal exchanges, and visible for asymmetric losses', () => {
    const small = battleWarScoreSwingV2({
      attackerLosses: 0.005,
      defenderLosses: 0.020,
      attackerStrength: 0.10,
      defenderStrength: 0.10,
      momentum: 0.35,
      conquered: false,
    });
    const large = battleWarScoreSwingV2({
      attackerLosses: 0.5,
      defenderLosses: 2,
      attackerStrength: 10,
      defenderStrength: 10,
      momentum: 0.35,
      conquered: false,
    });
    const peer = battleWarScoreSwingV2({
      attackerLosses: 0.01,
      defenderLosses: 0.01,
      attackerStrength: 0.20,
      defenderStrength: 0.20,
      momentum: 0,
      conquered: false,
    });
    expect(large).toBe(small);
    expect(small).toBeGreaterThan(1);
    expect(peer).toBe(0);
    expect(Math.round(small * 3)).not.toBe(0);
  });

  it('gives territory conquest a clear strategic swing on top of the battle result', () => {
    const exchange = {
      attackerLosses: 0.01,
      defenderLosses: 0.02,
      attackerStrength: 0.20,
      defenderStrength: 0.20,
      momentum: 0.2,
    };
    const field = battleWarScoreSwingV2({ ...exchange, conquered: false });
    const conquest = battleWarScoreSwingV2({ ...exchange, conquered: true });
    expect(conquest - field).toBe(20);
  });

  it('writes a visible score change into the active war after a real battle pulse', () => {
    const { state, war } = interventionState(53_001);
    const sourceId = territoryIdV2('deu');
    const targetId = territoryIdV2('bel');
    state.territories[sourceId]!.army.manpower = 0.40;
    state.territories[sourceId]!.army.capacity = 0.40;
    state.territories[targetId]!.army.manpower = 0.20;
    state.territories[targetId]!.army.capacity = 0.20;
    const operation: FrontOperationV2 = {
      commanderId: aggressor,
      sourceId,
      targetId,
      doctrine: 'pressure',
      access: 'land',
      startedTick: state.tick - 8,
      lastBattleTick: state.tick - 2,
      holdUntilTick: state.tick + 12,
      momentum: 0,
    };
    war.attackerOperations = [operation];
    const scoreBefore = war.warScore;
    expect(resolveBattlePulseV2(
      state,
      WORLD_CONTENT_V2,
      war,
      operation,
    )).toBeDefined();
    expect(Math.abs(war.warScore - scoreBefore)).toBeGreaterThanOrEqual(0.5);
  });
});
