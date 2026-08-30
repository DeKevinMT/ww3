import { describe, expect, it } from 'vitest';
import { WorldEngineV2 } from './WorldEngineV2';
import {
  antarcticGatewayTerritoryIdV2,
  deterministicAntarcticGatewayOrderV2,
} from './antarcticGateways';
import { ANTARCTIC_TERRITORY_IDS_V2, ROGUE_AI_NATION_ID_V2 } from './content';
import {
  nationalArmyCapacityAtOneXOpeningV2,
  nationalArmyCapacityTargetV2,
  stateTerritoryArmySupportCeilingV2,
} from './capacity';
import { resolveScenarioV2 } from './scenarios';
import { territoryIdV2 } from './types';

const GATEWAY_COUNTRY = {
  'drake-entry': territoryIdV2('chl'),
  'maud-entry': territoryIdV2('zaf'),
  'ross-entry': territoryIdV2('nzl'),
} as const;

function seedForFirstGateway(gatewayId: keyof typeof GATEWAY_COUNTRY): number {
  for (let seed = 1; seed <= 10_000; seed += 1) {
    if (deterministicAntarcticGatewayOrderV2(seed)[0] === gatewayId) return seed;
  }
  throw new Error(`No deterministic seed found for ${gatewayId}.`);
}

describe('Survival opening machine breakout', () => {
  it.each(Object.keys(GATEWAY_COUNTRY) as Array<keyof typeof GATEWAY_COUNTRY>)(
    'turns a real %s convoy into a world foothold before the opening stalls',
    (gatewayId) => {
      const seed = seedForFirstGateway(gatewayId);
      const resolved = resolveScenarioV2({ mode: 'survival', seed });
      const engine = new WorldEngineV2(seed, resolved.content);
      expect(engine.chooseCountry('grl')).toEqual({ accepted: true });
      expect(engine.formSurvivalEmpire('grl', [])).toEqual({ accepted: true });

      const gatewayTerritoryId = antarcticGatewayTerritoryIdV2(gatewayId);
      const gatewayCountryId = GATEWAY_COUNTRY[gatewayId];
      const openingCountryOwner = engine.state.territories[gatewayCountryId]!.owner;
      let capturedTick: number | null = null;
      for (let week = 0; week < 208 && !engine.state.gameOver; week += 1) {
        engine.step(1);
        if (engine.state.territories[gatewayCountryId]!.owner === ROGUE_AI_NATION_ID_V2) {
          capturedTick = engine.state.tick;
          break;
        }
      }

      expect(engine.state.polarEndgame.gatewayBreaches[gatewayId]?.status).toBe('open');
      expect(engine.state.territories[gatewayTerritoryId]!.owner).toBe(ROGUE_AI_NATION_ID_V2);
      expect(openingCountryOwner).not.toBe(ROGUE_AI_NATION_ID_V2);
      const machineWar = engine.state.wars.find((war) => (
        war.attackerId === ROGUE_AI_NATION_ID_V2 && war.defenderId === openingCountryOwner
      ));
      const diagnostic = JSON.stringify({
        tick: engine.state.tick,
        wave: engine.state.polarEndgame.globalWave,
        gatewayArmy: engine.state.territories[gatewayTerritoryId]!.army.manpower,
        gatewayWave: engine.state.polarEndgame.rogueWaveManpowerByTerritory[gatewayTerritoryId],
        gatewayKind: resolved.content.territories[gatewayTerritoryId]!.kind,
        gatewayConnections: resolved.content.territories[gatewayTerritoryId]!.connections.map((edge) => ({
          targetId: edge.targetId,
          kind: edge.kind,
          open: engine.state.polarEndgame.gatewayBreaches[gatewayId]?.status === 'open',
        })),
        gatewayBaseSupport: stateTerritoryArmySupportCeilingV2(
          engine.state,
          resolved.content,
          gatewayTerritoryId,
          ROGUE_AI_NATION_ID_V2,
          nationalArmyCapacityTargetV2(engine.state, resolved.content, ROGUE_AI_NATION_ID_V2),
          nationalArmyCapacityAtOneXOpeningV2(engine.state, resolved.content, ROGUE_AI_NATION_ID_V2),
        ),
        countryArmy: engine.state.territories[gatewayCountryId]!.army.manpower,
        countryCapacity: engine.state.territories[gatewayCountryId]!.army.capacity,
        antarcticWave: ANTARCTIC_TERRITORY_IDS_V2
          .map((territoryId) => ({
            territoryId,
            army: engine.state.territories[territoryId]!.army.manpower,
            wave: engine.state.polarEndgame.rogueWaveManpowerByTerritory[territoryId] ?? 0,
          }))
          .filter((entry) => entry.wave > 1e-9),
        recentRogueLogistics: engine.recentLogisticsMovements()
          .filter((movement) => movement.playerId === ROGUE_AI_NATION_ID_V2),
        war: machineWar && {
          battles: machineWar.battles,
          score: machineWar.warScore,
          attackerLosses: machineWar.attackerLosses,
          defenderLosses: machineWar.defenderLosses,
          operations: machineWar.attackerOperations.length,
          attackerOperations: machineWar.attackerOperations,
          defenderOperations: machineWar.defenderOperations,
        },
      });
      expect(capturedTick, `${gatewayId} must establish a visible world foothold within four years: ${diagnostic}`)
        .not.toBeNull();
      expect(capturedTick!).toBeLessThanOrEqual(208);
      expect(engine.state.territories[territoryIdV2('grl')]!.owner).toBe(engine.state.humanPlayerId);
    },
    30_000,
  );
});
