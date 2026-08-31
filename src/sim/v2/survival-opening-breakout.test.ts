import { describe, expect, it } from 'vitest';
import { WorldEngineV2 } from './WorldEngineV2';
import { antarcticGatewayTerritoryIdV2 } from './antarcticGateways';
import { ANTARCTIC_TERRITORY_IDS_V2, ROGUE_AI_NATION_ID_V2 } from './content';
import { resolveScenarioV2 } from './scenarios';
import { territoryIdV2 } from './types';

const GATEWAY_COUNTRY = {
  'drake-entry': territoryIdV2('chl'),
  'maud-entry': territoryIdV2('zaf'),
  'ross-entry': territoryIdV2('nzl'),
} as const;

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
});
