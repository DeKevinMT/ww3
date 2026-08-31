import { describe, expect, it } from 'vitest';
import { WorldEngineV2 } from './WorldEngineV2';
import { antarcticGatewayTerritoryIdV2 } from './antarcticGateways';
import { ANTARCTIC_TERRITORY_IDS_V2, ROGUE_AI_NATION_ID_V2 } from './content';
import { resolveScenarioV2 } from './scenarios';
import {
  ROGUE_ANNUAL_WAVE_INTERVAL_TICKS_V2,
  processRogueAiSurvivalV2,
} from './survival';
import { territoryIdV2 } from './types';

const GATEWAY_COUNTRY = {
  'drake-entry': territoryIdV2('chl'),
  'maud-entry': territoryIdV2('zaf'),
  'ross-entry': territoryIdV2('nzl'),
} as const;

const UNTOUCHED_OPENING_CASES = [
  [1_002, 'drake-entry'],
  [1_001, 'maud-entry'],
  [1_000, 'ross-entry'],
] as const;

describe('Survival opening machine breakout', () => {
  it.each(Object.entries(GATEWAY_COUNTRY))(
    'opens %s onto an intact sovereign world while a real Antarctic assault begins',
    (gatewayId, gatewayCountryId) => {
      const seed = 92_000 + Object.keys(GATEWAY_COUNTRY).indexOf(gatewayId);
      const resolved = resolveScenarioV2({ mode: 'survival', seed });
      const engine = new WorldEngineV2(seed, resolved.content);
      expect(engine.chooseCountry('grl')).toEqual({ accepted: true });
      expect(engine.formSurvivalEmpire('grl', [])).toEqual({ accepted: true });

      const typedGatewayId = gatewayId as keyof typeof GATEWAY_COUNTRY;
      const gatewayTerritoryId = antarcticGatewayTerritoryIdV2(typedGatewayId);
      expect(engine.state.polarEndgame.gatewayBreaches[typedGatewayId]?.status).toBe('open');
      expect(engine.state.territories[gatewayTerritoryId]!.owner)
        .toBe(ROGUE_AI_NATION_ID_V2);
      expect(engine.state.territories[gatewayCountryId]!.owner).toBe(gatewayCountryId);
      expect(resolved.content.territories[gatewayTerritoryId]!.connections)
        .toContainEqual(expect.objectContaining({ targetId: gatewayCountryId }));

      const war = engine.state.wars.find((candidate) => (
        candidate.attackerId === ROGUE_AI_NATION_ID_V2
      ));
      expect(war).toBeDefined();
      expect(war!.attackerOperations).toHaveLength(1);
      expect(ANTARCTIC_TERRITORY_IDS_V2)
        .toContain(war!.attackerOperations[0]!.sourceId);
      expect(engine.state.territories[war!.attackerOperations[0]!.targetId]!.owner)
        .toBe(war!.defenderId);

      engine.step(4);
      expect(war!.battles).toBeGreaterThan(0);
      expect(war!.lastBattleTick).toBeGreaterThanOrEqual(2);
      expect(war!.lastBattleTick).toBeLessThanOrEqual(4);
    },
  );

  it.each(UNTOUCHED_OPENING_CASES)(
    'wins the first conquest in an untouched three-gateway opening for seed %i via %s',
    (seed, gatewayId) => {
      const resolved = resolveScenarioV2({ mode: 'survival', seed });
      const engine = new WorldEngineV2(seed, resolved.content);
      expect(engine.chooseCountry('bel')).toEqual({ accepted: true });
      expect(engine.formSurvivalEmpire('bel', [])).toEqual({ accepted: true });

      for (const candidateId of Object.keys(GATEWAY_COUNTRY) as Array<keyof typeof GATEWAY_COUNTRY>) {
        expect(engine.state.polarEndgame.gatewayBreaches[candidateId]?.status).toBe('open');
        expect(engine.state.territories[antarcticGatewayTerritoryIdV2(candidateId)]!.army.manpower)
          .toBeGreaterThan(0);
      }

      const gatewayCountryId = GATEWAY_COUNTRY[gatewayId];
      expect(engine.state.wars).toContainEqual(expect.objectContaining({
        attackerId: ROGUE_AI_NATION_ID_V2,
        defenderId: gatewayCountryId,
      }));

      let lostAntarcticGround = false;
      let firstConquest: { attackerId: string; targetId: string } | null = null;
      engine.subscribe((_state, change) => {
        if (!change.battle?.conquered) return;
        firstConquest ??= {
          attackerId: change.battle.attackerId,
          targetId: change.battle.targetId,
        };
        if (change.battle.attackerId !== ROGUE_AI_NATION_ID_V2
          && ANTARCTIC_TERRITORY_IDS_V2.includes(change.battle.targetId)) {
          lostAntarcticGround = true;
        }
      });
      while (engine.state.tick < ROGUE_ANNUAL_WAVE_INTERVAL_TICKS_V2
        && firstConquest === null) {
        engine.step(1);
        lostAntarcticGround ||= ANTARCTIC_TERRITORY_IDS_V2.some((territoryId) => (
          engine.state.territories[territoryId]!.owner !== ROGUE_AI_NATION_ID_V2
        ));
      }

      expect(lostAntarcticGround).toBe(false);
      expect(firstConquest).toEqual({
        attackerId: ROGUE_AI_NATION_ID_V2,
        targetId: gatewayCountryId,
      });
      expect(engine.state.territories[gatewayCountryId]!.owner).toBe(ROGUE_AI_NATION_ID_V2);
      expect(engine.state.tick).toBeLessThan(ROGUE_ANNUAL_WAVE_INTERVAL_TICKS_V2);
    },
    30_000,
  );

  it.each(Object.entries(GATEWAY_COUNTRY))(
    'gives %s enough opening force to conquer its first sovereign before wave one',
    (gatewayId, gatewayCountryId) => {
      const seed = 93_000 + Object.keys(GATEWAY_COUNTRY).indexOf(gatewayId);
      const resolved = resolveScenarioV2({ mode: 'survival', seed });
      const engine = new WorldEngineV2(seed, resolved.content);
      expect(engine.chooseCountry('bel')).toEqual({ accepted: true });
      expect(engine.formSurvivalEmpire('bel', [])).toEqual({ accepted: true });

      const typedGatewayId = gatewayId as keyof typeof GATEWAY_COUNTRY;
      const gatewayTerritoryId = antarcticGatewayTerritoryIdV2(typedGatewayId);
      engine.state.wars = [];
      for (const candidateId of Object.keys(GATEWAY_COUNTRY) as Array<keyof typeof GATEWAY_COUNTRY>) {
        if (candidateId === typedGatewayId) continue;
        engine.state.territories[antarcticGatewayTerritoryIdV2(candidateId)]!.army.manpower = 0;
      }
      expect(processRogueAiSurvivalV2(engine.state, engine.content).targets)
        .toEqual([gatewayCountryId]);
      expect(engine.state.wars).toContainEqual(expect.objectContaining({
        attackerId: ROGUE_AI_NATION_ID_V2,
        defenderId: gatewayCountryId,
      }));

      let lostAntarcticGround = false;
      let firstBattleAttackerId: string | null = null;
      let firstConquestAttackerId: string | null = null;
      let firstConquestTargetId: string | null = null;
      engine.subscribe((_state, change) => {
        if (!change.battle) return;
        firstBattleAttackerId ??= change.battle.attackerId;
        if (change.battle.conquered && firstConquestAttackerId === null) {
          firstConquestAttackerId = change.battle.attackerId;
          firstConquestTargetId = change.battle.targetId;
        }
      });
      while (engine.state.tick < ROGUE_ANNUAL_WAVE_INTERVAL_TICKS_V2
        && engine.state.territories[gatewayCountryId]!.owner !== ROGUE_AI_NATION_ID_V2) {
        engine.step(1);
        lostAntarcticGround ||= ANTARCTIC_TERRITORY_IDS_V2.some((territoryId) => (
          engine.state.territories[territoryId]!.owner !== ROGUE_AI_NATION_ID_V2
        ));
      }
      expect(lostAntarcticGround).toBe(false);
      expect(firstBattleAttackerId).toBe(ROGUE_AI_NATION_ID_V2);
      expect(firstConquestAttackerId).toBe(ROGUE_AI_NATION_ID_V2);
      expect(firstConquestTargetId).toBe(gatewayCountryId);
      expect(engine.state.territories[gatewayTerritoryId]!.owner).toBe(ROGUE_AI_NATION_ID_V2);
      expect(engine.state.territories[gatewayCountryId]!.owner).toBe(ROGUE_AI_NATION_ID_V2);
      expect(engine.state.tick).toBeLessThan(ROGUE_ANNUAL_WAVE_INTERVAL_TICKS_V2);
    },
    30_000,
  );
});
