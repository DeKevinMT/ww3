import { describe, expect, it } from 'vitest';
import { WorldEngineV2 } from './WorldEngineV2';
import { initializeCommanderForceV2 } from './commanderForce';
import { ROGUE_AI_NATION_ID_V2 } from './content';
import { ARCTIC_PROJECT_IDS_V2 } from './polarEndgame';
import { resolveScenarioV2 } from './scenarios';
import { invalidateTerritoryIndexV2 } from './selectors';
import {
  nationIdV2,
  territoryIdV2,
  type CommanderForceInitializationV2,
  type FrontOperationV2,
  type TerritoryId,
  type WarStateV2,
} from './types';
import { estimateLiveWarV2, forecastWarV2, resolveBattlePulseV2 } from './war';

const apexProfile: CommanderForceInitializationV2 = {
  shield: {
    integrity: 0.0009,
    maxIntegrity: 0.0009,
    rechargeBuffer: 0.00008,
    rechargeMultiplier: 1,
    pulseAttack: 0.001,
  },
  attackMultiplier: 1.12,
  defenseMultiplier: 1.14,
  treasury: 10,
  annualOutput: 2,
  supplyStock: 0.006,
  capabilities: { assaultSpecialist: true },
};

function campaignWithApex(seed: number): { engine: WorldEngineV2; playerId: ReturnType<typeof nationIdV2> } {
  const engine = new WorldEngineV2(seed);
  const playerId = nationIdV2('lux');
  expect(engine.chooseCountry(playerId)).toEqual({ accepted: true });
  expect(initializeCommanderForceV2(
    engine.state, engine.content, playerId, apexProfile,
  )).toEqual({ accepted: true });
  return { engine, playerId };
}

function completeNorthPoleThrough(
  engine: WorldEngineV2,
  playerId: ReturnType<typeof nationIdV2>,
  stage: 1 | 2 | 3 | 4,
): void {
  const semanticStages = [
    'polar-demography',
    'cryogenic-logistics',
    'strategic-mobilisation',
    'deep-ice-signals',
  ] as const;
  const endpoint = semanticStages[stage - 1]!;
  const projects = ARCTIC_PROJECT_IDS_V2.slice(
    0,
    ARCTIC_PROJECT_IDS_V2.indexOf(endpoint) + 1,
  );
  engine.state.polarEndgame.arcticPrograms[playerId] = {
    playerId,
    activeProject: null,
    completedProjects: projects,
  };
}

function prepareReadyApex(engine: WorldEngineV2, playerId: ReturnType<typeof nationIdV2>): void {
  const force = engine.state.commanderForces[playerId]!;
  force.shield.integrity = force.shield.maxIntegrity;
  force.economy.supplyStock = Math.max(force.economy.supplyStock, force.shield.maxIntegrity * 2);
}

function prepareRogueFront(
  engine: WorldEngineV2,
  playerId: ReturnType<typeof nationIdV2>,
  sourceId: TerritoryId,
  targetId: TerritoryId,
): void {
  engine.state.territories[sourceId]!.owner = playerId;
  engine.state.territories[targetId]!.owner = ROGUE_AI_NATION_ID_V2;
  const force = engine.state.commanderForces[playerId]!;
  force.locationId = sourceId;
  force.transit = null;
  force.front = null;
  force.mission = 'standby';
  prepareReadyApex(engine, playerId);
  invalidateTerritoryIndexV2(engine.state);
}

function resolveReadyApexSupportedBattle(
  engine: WorldEngineV2,
  playerId: ReturnType<typeof nationIdV2>,
  sourceId: TerritoryId,
  targetId: TerritoryId,
): ReturnType<typeof resolveBattlePulseV2> {
  const operation: FrontOperationV2 = {
    commanderId: playerId,
    sourceId,
    targetId,
    doctrine: 'pressure',
    access: 'land',
    startedTick: engine.state.tick,
    lastBattleTick: engine.state.tick,
    holdUntilTick: engine.state.tick + 12,
    momentum: 0,
  };
  const war: WarStateV2 = {
    id: `war-apex-parity-${sourceId}-${targetId}`,
    attackerId: playerId,
    defenderId: ROGUE_AI_NATION_ID_V2,
    startedTick: engine.state.tick,
    lastBattleTick: engine.state.tick,
    warScore: 0,
    battles: 0,
    attackerLosses: 0,
    defenderLosses: 0,
    lastPeaceOfferTick: -1_000_000,
    attackerOperations: [operation],
    defenderOperations: [],
  };
  engine.state.wars.push(war);
  const force = engine.state.commanderForces[playerId]!;
  force.locationId = sourceId;
  force.mission = 'assault-support';
  force.front = { warId: war.id, sourceId, targetId };
  return resolveBattlePulseV2(engine.state, engine.content, war, operation);
}

describe('EONSCAR-aware canonical war forecast', () => {
  it('raises the same canonical forecast used by target review when EONSCAR can stage legally', () => {
    const { engine, playerId } = campaignWithApex(31_001);
    const defenderId = nationIdV2('bel');
    const withoutApex = structuredClone(engine.state);
    delete withoutApex.commanderForces[playerId];

    const base = forecastWarV2(withoutApex, engine.content, playerId, defenderId);
    const supported = engine.warForecast(playerId, defenderId);
    expect(supported.sourceId).toBe(territoryIdV2('lux'));
    expect(supported.apexContribution).toMatchObject({
      status: 'ready',
      stagingTerritoryId: territoryIdV2('lux'),
      etaWeeks: 0,
    });
    expect(supported.apexContribution.power).toBe(0);
    expect(supported.apexContribution.effectivePower).toBe(0);
    expect(supported.apexContribution.attackMultiplier).toBeGreaterThan(1);
    expect(supported.apexContribution.defenseMultiplier).toBeGreaterThan(1);
    expect(supported.apexContribution.supportBonusPercent).toBeGreaterThan(0);
    expect(base.apexContribution.projectedPulseDamage).toBe(0);
    expect(supported.apexContribution.projectedPulseDamage).toBe(0);
    expect(supported.apexContribution.chanceDelta).toBeCloseTo(
      supported.winChance - base.winChance,
      8,
    );
    expect(supported.winChance).toBeGreaterThan(base.winChance);
  });

  it('uses the same national-army multipliers in prewar and live estimates', () => {
    const { engine, playerId } = campaignWithApex(31_008);
    const defenderId = nationIdV2('bel');
    const sourceId = territoryIdV2('lux');
    const targetId = territoryIdV2('bel');
    const nationalArmy = engine.state.territories[sourceId]!.army;
    nationalArmy.manpower *= 2;
    nationalArmy.capacity = Math.max(nationalArmy.capacity, nationalArmy.manpower);
    engine.state.players[playerId]!.trainedReserves *= 2;
    prepareReadyApex(engine, playerId);

    const prewar = forecastWarV2(engine.state, engine.content, playerId, defenderId);
    const blindPrewarState = structuredClone(engine.state);
    delete blindPrewarState.commanderForces[playerId];
    const blindPrewar = forecastWarV2(
      blindPrewarState, engine.content, playerId, defenderId,
    );
    expect(prewar.apexContribution.attackMultiplier).toBeGreaterThan(1);
    expect(prewar.apexContribution.defenseMultiplier).toBeGreaterThan(1);
    expect(prewar.winChance).toBeGreaterThan(blindPrewar.winChance);

    const operation: FrontOperationV2 = {
      commanderId: playerId,
      sourceId,
      targetId,
      doctrine: 'pressure',
      access: 'land',
      startedTick: engine.state.tick,
      lastBattleTick: engine.state.tick,
      holdUntilTick: engine.state.tick + 12,
      momentum: 0,
    };
    const war: WarStateV2 = {
      id: 'war-apex-live-outlook',
      attackerId: playerId,
      defenderId,
      startedTick: engine.state.tick,
      lastBattleTick: engine.state.tick,
      warScore: 0,
      battles: 0,
      attackerLosses: 0,
      defenderLosses: 0,
      lastPeaceOfferTick: -1_000_000,
      attackerOperations: [operation],
      defenderOperations: [],
    };
    engine.state.wars.push(war);
    const force = engine.state.commanderForces[playerId]!;
    force.locationId = sourceId;
    force.transit = null;
    force.mission = 'assault-support';
    force.front = { warId: war.id, sourceId, targetId };

    const supported = estimateLiveWarV2(
      engine.state, engine.content, war.id, playerId,
    )!;
    const blindState = structuredClone(engine.state);
    delete blindState.commanderForces[playerId];
    const blind = estimateLiveWarV2(
      blindState, engine.content, war.id, playerId,
    )!;

    expect(supported.projectedOwnLosses).toBeLessThan(blind.projectedOwnLosses);
    expect(supported.projectedEnemyLosses).toBeGreaterThan(blind.projectedEnemyLosses);
  });

  it('ignores retired location and commitment fields in the network forecast', () => {
    const { engine, playerId } = campaignWithApex(31_002);
    const defenderId = nationIdV2('bel');
    const force = engine.state.commanderForces[playerId]!;
    force.front = {
      warId: 'war-other-front',
      sourceId: territoryIdV2('lux'),
      targetId: territoryIdV2('bel'),
    };
    force.mission = 'assault-support';
    const committed = engine.warForecast(playerId, defenderId);
    expect(committed.apexContribution).toMatchObject({ status: 'ready', etaWeeks: 0 });
    expect(committed.apexContribution.effectivePower).toBe(0);
    expect(committed.apexContribution.attackMultiplier).toBeGreaterThan(1);
    expect(committed.apexContribution.chanceDelta).toBeGreaterThan(0);

    force.front = null;
    force.mission = 'standby';
    force.locationId = territoryIdV2('usa');
    const unreachable = engine.warForecast(playerId, defenderId);
    expect(unreachable.apexContribution.status).toBe('ready');
    expect(unreachable.apexContribution.effectivePower)
      .toBeCloseTo(committed.apexContribution.effectivePower, 9);
    expect(unreachable.apexContribution.chanceDelta)
      .toBeCloseTo(committed.apexContribution.chanceDelta, 9);
  });

  it('does not discount the global field for retired transit or supply state', () => {
    const { engine, playerId } = campaignWithApex(31_003);
    const defenderId = nationIdV2('bel');
    const ready = engine.warForecast(playerId, defenderId);
    const force = engine.state.commanderForces[playerId]!;
    force.transit = {
      path: [territoryIdV2('lux')],
      distanceKm: 0,
      departTick: engine.state.tick,
      arriveTick: engine.state.tick + 20,
    };
    force.economy.supplyStock = force.shield.integrity * 0.35;
    const delayed = engine.warForecast(playerId, defenderId);
    expect(delayed.apexContribution.status).toBe('ready');
    expect(delayed.apexContribution.etaWeeks).toBe(0);
    expect(delayed.apexContribution.supplyReadiness)
      .toBeCloseTo(ready.apexContribution.supplyReadiness, 9);
    expect(delayed.apexContribution.effectivePower)
      .toBeCloseTo(ready.apexContribution.effectivePower, 9);
    expect(delayed.apexContribution.chanceDelta)
      .toBeCloseTo(ready.apexContribution.chanceDelta, 9);
  });

  it('uses the identical contribution model in the Survival timeline', () => {
    const content = resolveScenarioV2({ mode: 'survival', seed: 31_004 }).content;
    const engine = new WorldEngineV2(31_004, content);
    const playerId = nationIdV2('lux');
    expect(engine.chooseCountry(playerId)).toEqual({ accepted: true });
    expect(initializeCommanderForceV2(
      engine.state, content, playerId, apexProfile,
    )).toEqual({ accepted: true });
    const forecast = engine.warForecast(playerId, nationIdV2('bel'));
    expect(forecast.apexContribution.status).toBe('ready');
    expect(forecast.apexContribution.attackMultiplier).toBeGreaterThan(1);
    expect(forecast.apexContribution.defenseMultiplier).toBeGreaterThan(1);
  });

  it('keeps North Pole Rogue countermeasures out of ordinary wars', () => {
    const { engine, playerId } = campaignWithApex(31_005);
    prepareReadyApex(engine, playerId);
    completeNorthPoleThrough(engine, playerId, 1);
    const stageOne = forecastWarV2(
      engine.state, engine.content, playerId, nationIdV2('bel'),
    );

    completeNorthPoleThrough(engine, playerId, 3);
    const stageThree = forecastWarV2(
      engine.state, engine.content, playerId, nationIdV2('bel'),
    );
    completeNorthPoleThrough(engine, playerId, 4);
    const stageFour = forecastWarV2(
      engine.state, engine.content, playerId, nationIdV2('bel'),
    );

    expect(stageThree.apexContribution).toEqual(stageOne.apexContribution);
    expect(stageFour.apexContribution).toEqual(stageThree.apexContribution);
    expect(stageThree.winChance).toBe(stageOne.winChance);
    expect(stageFour.winChance).toBe(stageThree.winChance);
  });

  it('uses the full Rogue countermeasure sequence in preview and live Army support', () => {
    const { engine, playerId } = campaignWithApex(31_006);
    const sourceId = territoryIdV2('lux');
    const targetId = territoryIdV2('bel');
    prepareRogueFront(engine, playerId, sourceId, targetId);
    completeNorthPoleThrough(engine, playerId, 1);
    const stageOne = forecastWarV2(
      engine.state, engine.content, playerId, ROGUE_AI_NATION_ID_V2,
    );

    completeNorthPoleThrough(engine, playerId, 2);
    const stageTwo = forecastWarV2(
      engine.state, engine.content, playerId, ROGUE_AI_NATION_ID_V2,
    );
    expect(stageTwo.apexContribution.projectedAttackPressure)
      .toBe(stageOne.apexContribution.projectedAttackPressure);
    expect(stageTwo.apexContribution.projectedDefenseShield)
      .toBeGreaterThan(stageOne.apexContribution.projectedDefenseShield);
    expect(stageTwo.apexContribution.power).toBe(0);
    expect(stageOne.apexContribution.power).toBe(0);
    expect(stageTwo.projectedAttackerLossRate).toBeLessThan(stageOne.projectedAttackerLossRate);

    completeNorthPoleThrough(engine, playerId, 3);
    const stageThree = forecastWarV2(
      engine.state, engine.content, playerId, ROGUE_AI_NATION_ID_V2,
    );
    expect(stageThree.apexContribution.projectedAttackPressure
      / stageTwo.apexContribution.projectedAttackPressure).toBeCloseTo(1.04, 6);
    expect(stageThree.apexContribution.projectedDefenseShield)
      .toBeGreaterThan(stageTwo.apexContribution.projectedDefenseShield);
    expect(stageThree.projectedDefenderLossRate).toBeGreaterThan(
      stageTwo.projectedDefenderLossRate,
    );

    const event = resolveReadyApexSupportedBattle(engine, playerId, sourceId, targetId);
    expect(event).toBeDefined();
    expect(event!.commanderAttackerPower)
      .toBeCloseTo(stageThree.apexContribution.projectedAttackPressure, 6);
    expect(event!.commanderAttackerPulseDamage)
      .toBeCloseTo(stageThree.apexContribution.projectedPulseDamage, 9);
    expect(event!.commanderAttackerPulseDamage).toBe(0);
  });

  it('uses the same final Antarctic operation multiplier in preview and battle', () => {
    const { engine, playerId } = campaignWithApex(31_007);
    const sourceId = territoryIdV2('drake-entry');
    const targetId = territoryIdV2('weddell-forge');
    prepareRogueFront(engine, playerId, sourceId, targetId);
    completeNorthPoleThrough(engine, playerId, 3);
    const stageThree = forecastWarV2(
      engine.state, engine.content, playerId, ROGUE_AI_NATION_ID_V2,
    );

    completeNorthPoleThrough(engine, playerId, 4);
    const stageFour = forecastWarV2(
      engine.state, engine.content, playerId, ROGUE_AI_NATION_ID_V2,
    );
    expect(stageFour.sourceId).toBe(sourceId);
    expect(stageFour.targetId).toBe(targetId);
    expect(stageFour.apexContribution.projectedAttackPressure
      / stageThree.apexContribution.projectedAttackPressure).toBeCloseTo(1.05, 5);
    expect(stageFour.apexContribution.projectedDefenseShield
      / stageThree.apexContribution.projectedDefenseShield).toBeCloseTo(1.05, 3);

    const event = resolveReadyApexSupportedBattle(engine, playerId, sourceId, targetId);
    expect(event).toBeDefined();
    expect(event!.commanderAttackerPower)
      .toBeCloseTo(stageFour.apexContribution.projectedAttackPressure, 6);
    expect(event!.commanderAttackerPulseDamage)
      .toBeCloseTo(stageFour.apexContribution.projectedPulseDamage, 9);
    expect(event!.commanderAttackerPulseDamage).toBe(0);
  });
});
