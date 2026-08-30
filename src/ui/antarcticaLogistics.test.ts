import { describe, expect, it } from 'vitest';
import { WorldEngineV2 } from '../sim/v2/WorldEngineV2';
import { ROGUE_AI_NATION_ID_V2 } from '../sim/v2/content';
import { resolveScenarioV2 } from '../sim/v2/scenarios';
import { invalidateTerritoryIndexV2 } from '../sim/v2/selectors';
import {
  nationIdV2,
  territoryIdV2,
  type LogisticsMovementV2,
} from '../sim/v2/types';
import { supplyFactorV2 } from '../sim/v2/war';
import { selectRogueLogisticsTelemetryV2 } from './antarcticaLogistics';

describe('Rogue Antarctica logistics telemetry', () => {
  it('projects live front supply and exact charged movement telemetry without save state', () => {
    const resolved = resolveScenarioV2({ mode: 'survival', seed: 5_042 });
    const engine = new WorldEngineV2(5_042, resolved.content);
    const botswana = nationIdV2('bwa');
    const southAfrica = territoryIdV2('zaf');
    const botswanaTerritory = territoryIdV2('bwa');
    const maud = territoryIdV2('maud-entry');
    const queenMaud = territoryIdV2('queen-maud-grid');
    expect(engine.chooseCountry(botswana)).toEqual({ accepted: true });
    expect(engine.formSurvivalEmpire(botswana, [])).toEqual({ accepted: true });
    // Telemetry describes an already-established post-gateway front. Fresh
    // Survival runs deliberately have no immediate war: the first physical
    // Antarctic column must breach and capture its gateway country first.
    engine.state.territories[southAfrica]!.owner = ROGUE_AI_NATION_ID_V2;
    invalidateTerritoryIndexV2(engine.state);
    engine.state.wars.push({
      id: 'war-rogue-south-africa-front',
      attackerId: ROGUE_AI_NATION_ID_V2,
      defenderId: botswana,
      startedTick: engine.state.tick,
      lastBattleTick: engine.state.tick,
      warScore: 0,
      battles: 0,
      attackerLosses: 0,
      defenderLosses: 0,
      lastPeaceOfferTick: -1,
      attackerOperations: [{
        commanderId: ROGUE_AI_NATION_ID_V2,
        sourceId: southAfrica,
        targetId: botswanaTerritory,
        doctrine: 'breakthrough',
        access: 'land',
        startedTick: engine.state.tick,
        lastBattleTick: engine.state.tick,
        holdUntilTick: engine.state.tick + 12,
        momentum: 0,
      }],
      defenderOperations: [],
    });
    const seaDistance = engine.content.territories[southAfrica]!.connections
      .find((connection) => connection.targetId === maud)!.distanceKm!;
    const movements: LogisticsMovementV2[] = [{
      playerId: ROGUE_AI_NATION_ID_V2,
      sourceId: southAfrica,
      targetId: maud,
      manpower: 0.12,
      capacity: 0,
      access: 'naval',
      distanceKm: seaDistance,
      interiorDistanceKm: 100,
      interiorOperationMultiplier: 1.05,
      logisticsCost: 0.032,
    }, {
      playerId: ROGUE_AI_NATION_ID_V2,
      sourceId: maud,
      targetId: queenMaud,
      manpower: 0.08,
      capacity: 0,
      access: 'land',
      distanceKm: 0,
      interiorDistanceKm: 100,
      interiorOperationMultiplier: 1.05,
      logisticsCost: 0,
    }, {
      playerId: botswana,
      sourceId: botswanaTerritory,
      targetId: maud,
      manpower: 0.01,
      capacity: 0,
      access: 'naval',
      distanceKm: 12_000,
      interiorDistanceKm: 50,
      interiorOperationMultiplier: 1,
      logisticsCost: 1,
    }];
    const telemetry = selectRogueLogisticsTelemetryV2(
      engine.state,
      engine.content,
      ROGUE_AI_NATION_ID_V2,
      movements,
    );
    expect(telemetry).toMatchObject({
      movementCount: 2,
      movedManpower: 0.20,
      antarcticMovementCount: 2,
      antarcticMovedManpower: 0.20,
      navalMovementCount: 1,
      navalMovedManpower: 0.12,
      navalCost: 0.032,
      navalMeanDistanceKm: seaDistance,
      frontOperationCount: 2,
    });
    const expectedSupply = supplyFactorV2(
      engine.state,
      engine.content,
      ROGUE_AI_NATION_ID_V2,
      southAfrica,
      'land',
      botswanaTerritory,
    );
    expect(telemetry.averageFrontSupply).toBeCloseTo(expectedSupply, 9);
    expect(telemetry.weakestFrontSupply).toBeCloseTo(expectedSupply, 9);
  });
});
