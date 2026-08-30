import { describe, expect, it } from 'vitest';
import { WorldEngineV2 } from './WorldEngineV2';
import {
  ANTARCTIC_GATEWAY_COUNTRY_ROUTES_V2,
  ANTARCTIC_TERRITORY_IDS_V2,
  ROGUE_AI_NATION_ID_V2,
} from './content';
import { synchronizeArmyCapacityV2 } from './capacity';
import { assertInvariantsV2 } from './invariants';
import { retireAbsorbedNationV2 } from './integration';
import { resolveScenarioV2 } from './scenarios';
import {
  ROGUE_AI_CORE_TERRITORY_ID_V2,
  SURVIVAL_FIRST_WAVE_DELAY_TICKS_V2,
  processRogueAiSurvivalV2,
} from './survival';
import {
  addRogueWaveManpowerV2,
  recordRogueWaveCasualtiesV2,
  rogueWaveLossCreditV2,
  rogueWaveManpowerAtV2,
  transferRogueWaveManpowerV2,
} from './survivalProvenance';
import {
  nationIdV2,
  territoryIdV2,
  type FrontOperationV2,
  type PlayerId,
  type TerritoryId,
  type WarStateV2,
} from './types';
import { resolveBattlePulseV2 } from './war';
import { invalidateTerritoryIndexV2 } from './selectors';
import {
  processAntarcticGatewayBreachesV2,
} from './antarcticGateways';

function survival(seed: number, flagship = 'arg'): WorldEngineV2 {
  const resolved = resolveScenarioV2({ mode: 'survival', seed });
  const engine = new WorldEngineV2(seed, resolved.content);
  expect(engine.chooseCountry(flagship)).toEqual({ accepted: true });
  expect(engine.formSurvivalEmpire(flagship, [])).toEqual({ accepted: true });
  engine.state.tick = SURVIVAL_FIRST_WAVE_DELAY_TICKS_V2;
  expect(processRogueAiSurvivalV2(engine.state, engine.content).waveStarted).toBe(1);
  return engine;
}

function operation(
  engine: WorldEngineV2,
  commanderId: string,
  sourceId: TerritoryId,
  targetId: TerritoryId,
): FrontOperationV2 {
  const connection = engine.content.territories[sourceId]!.connections
    .find((candidate) => candidate.targetId === targetId);
  expect(connection, `${sourceId} must connect to ${targetId}`).toBeDefined();
  return {
    commanderId: nationIdV2(commanderId),
    sourceId,
    targetId,
    doctrine: 'breakthrough',
    access: connection!.kind === 'sea' ? 'naval' : 'land',
    startedTick: engine.state.tick,
    lastBattleTick: engine.state.tick,
    holdUntilTick: engine.state.tick + 12,
    momentum: 1,
  };
}

function testWar(
  engine: WorldEngineV2,
  attackerId: PlayerId,
  defenderId: PlayerId,
): WarStateV2 {
  const war: WarStateV2 = {
    id: `war-${engine.state.nextWarId++}`,
    attackerId,
    defenderId,
    startedTick: engine.state.tick,
    lastBattleTick: engine.state.tick,
    warScore: 0,
    battles: 0,
    attackerLosses: 0,
    defenderLosses: 0,
    attackerCivilianLosses: 0,
    defenderCivilianLosses: 0,
    lastPeaceOfferTick: -1_000_000,
    revenge: null,
    attackerOperations: [],
    defenderOperations: [],
  };
  engine.state.wars.push(war);
  return war;
}

function transferSovereigntyForTest(
  engine: WorldEngineV2,
  territoryId: TerritoryId,
  ownerId: PlayerId,
): void {
  const formerOwnerId = engine.state.territories[territoryId]!.owner;
  const territory = engine.state.territories[territoryId]!;
  territory.owner = ownerId;
  territory.coreOwner = ownerId;
  territory.integration = 1;
  delete territory.integrationProgram;
  invalidateTerritoryIndexV2(engine.state);
  if (formerOwnerId !== ownerId) {
    expect(retireAbsorbedNationV2(
      engine.state,
      engine.content,
      formerOwnerId,
      ownerId,
      false,
    )).toBe(true);
  }
}

describe('Survival gateway and wave provenance', () => {
  it('keeps exactly the three original Cape Horn, Cape Town and Christchurch routes', () => {
    expect(ANTARCTIC_GATEWAY_COUNTRY_ROUTES_V2).toEqual([
      { gatewayId: 'drake-entry', countryId: territoryIdV2('chl') },
      { gatewayId: 'maud-entry', countryId: territoryIdV2('zaf') },
      { gatewayId: 'ross-entry', countryId: territoryIdV2('nzl') },
    ]);
    const expected = new Map(ANTARCTIC_GATEWAY_COUNTRY_ROUTES_V2.map((route) => [
      territoryIdV2(route.gatewayId), route.countryId,
    ]));
    const worldLinks: Array<[TerritoryId, TerritoryId]> = [];
    for (const gatewayId of ANTARCTIC_GATEWAY_COUNTRY_ROUTES_V2.map((route) => (
      territoryIdV2(route.gatewayId)
    ))) {
      const external = (engineContent().territories[gatewayId]?.connections ?? [])
        .filter((connection) => !ANTARCTIC_TERRITORY_IDS_V2.includes(connection.targetId));
      expect(external).toHaveLength(1);
      expect(external[0]).toMatchObject({
        targetId: expected.get(gatewayId),
        kind: 'sea',
      });
      worldLinks.push([gatewayId, external[0]!.targetId]);
    }
    for (const [gatewayId, countryId] of worldLinks) {
      const outward = engineContent().territories[gatewayId]!.connections
        .find((connection) => connection.targetId === countryId)!;
      const returnRoute = engineContent().territories[countryId]!.connections
        .find((connection) => connection.targetId === gatewayId);
      expect(returnRoute).toMatchObject({ kind: 'sea', distanceKm: outward.distanceKm });
    }
    const countriesWithDirectAntarcticAccess = Object.values(engineContent().territories)
      .filter((territory) => territory.kind === undefined || territory.kind === 'sovereign')
      .filter((territory) => territory.connections.some((connection) => (
        ANTARCTIC_TERRITORY_IDS_V2.includes(connection.targetId)
      )))
      .map((territory) => territory.id)
      .sort((left, right) => left.localeCompare(right));
    expect(countriesWithDirectAntarcticAccess).toEqual([
      territoryIdV2('chl'), territoryIdV2('nzl'), territoryIdV2('zaf'),
    ].sort((left, right) => left.localeCompare(right)));
  });

  it('awards zero verified losses for the weak starting occupation garrisons', () => {
    const engine = survival(61_001);
    const human = nationIdV2('arg');
    const sourceId = territoryIdV2('arg');
    const targetId = territoryIdV2('ury');
    const independentDefender = nationIdV2('ury');
    const war = testWar(engine, human, independentDefender);
    expect(rogueWaveManpowerAtV2(engine.state, targetId)).toBe(0);
    engine.state.territories[sourceId]!.army.manpower = 1;
    engine.state.territories[sourceId]!.army.baseAttack = 10;
    engine.state.territories[targetId]!.army.manpower = 0.02;
    const battle = resolveBattlePulseV2(
      engine.state,
      engine.content,
      war,
      operation(engine, human, sourceId, targetId),
    )!;
    expect(battle.regularDefenderLosses).toBeGreaterThan(0);
    expect(rogueWaveLossCreditV2(engine.state, human)).toBe(0);
  });

  it('lets the machine capture an unlocked player region and the player recapture it normally', () => {
    const resolved = resolveScenarioV2({ mode: 'survival', seed: 61_003 });
    const engine = new WorldEngineV2(61_003, resolved.content);
    const human = nationIdV2('bel');
    expect(engine.chooseCountry(human)).toEqual({ accepted: true });
    expect(engine.formSurvivalEmpire(human, [nationIdV2('lux')])).toEqual({ accepted: true });
    engine.state.tick = SURVIVAL_FIRST_WAVE_DELAY_TICKS_V2;
    processRogueAiSurvivalV2(engine.state, engine.content);
    const machineSourceId = territoryIdV2('nld');
    const contestedId = territoryIdV2('bel');
    const humanSourceId = territoryIdV2('lux');
    transferSovereigntyForTest(engine, machineSourceId, ROGUE_AI_NATION_ID_V2);
    const war = testWar(engine, ROGUE_AI_NATION_ID_V2, human);
    engine.state.territories[machineSourceId]!.army.manpower = 1;
    engine.state.territories[machineSourceId]!.army.baseAttack = 10;
    addRogueWaveManpowerV2(engine.state, machineSourceId, 1);
    engine.state.territories[contestedId]!.army.manpower = 0;
    engine.state.territories[humanSourceId]!.army.manpower = 1;
    const lost = resolveBattlePulseV2(
      engine.state,
      engine.content,
      war,
      operation(engine, ROGUE_AI_NATION_ID_V2, machineSourceId, contestedId),
    )!;
    expect(lost.conquered).toBe(true);
    expect(engine.state.territories[contestedId]!.owner).toBe(ROGUE_AI_NATION_ID_V2);
    expect(engine.state.territories[humanSourceId]!.owner).toBe(human);

    engine.state.territories[contestedId]!.army.manpower = 0;
    engine.state.territories[humanSourceId]!.army.baseAttack = 10;
    const recaptured = resolveBattlePulseV2(
      engine.state,
      engine.content,
      war,
      operation(engine, human, humanSourceId, contestedId),
    )!;
    expect(recaptured.conquered).toBe(true);
    expect(engine.state.territories[contestedId]!.owner).toBe(human);
  });

  it('preserves Antarctic wave identity through splitting, five physical hops and save/load', () => {
    const engine = survival(61_002);
    const human = nationIdV2('arg');
    const gatewayId = engine.state.polarEndgame.gatewayBreachOrder[0]!;
    const gatewayRoutes = {
      'drake-entry': [
        ROGUE_AI_CORE_TERRITORY_ID_V2,
        territoryIdV2('sentinel-labyrinth'),
        territoryIdV2('weddell-forge'),
        territoryIdV2('drake-entry'),
        territoryIdV2('chl'),
      ],
      'maud-entry': [
        ROGUE_AI_CORE_TERRITORY_ID_V2,
        territoryIdV2('sentinel-labyrinth'),
        territoryIdV2('queen-maud-grid'),
        territoryIdV2('maud-entry'),
        territoryIdV2('zaf'),
      ],
      'ross-entry': [
        ROGUE_AI_CORE_TERRITORY_ID_V2,
        territoryIdV2('transantarctic-vault'),
        territoryIdV2('ross-array'),
        territoryIdV2('ross-entry'),
        territoryIdV2('nzl'),
      ],
    } as const;
    const route = gatewayRoutes[gatewayId];
    const breach = engine.state.polarEndgame.gatewayBreaches[gatewayId]!;
    if (breach.status !== 'open') {
      engine.state.tick = breach.opensTick!;
      expect(processAntarcticGatewayBreachesV2(engine.state)).toEqual([gatewayId]);
    }
    expect(engine.state.polarEndgame.gatewayBreaches[gatewayId]!.status).toBe('open');
    const externalId = route[route.length - 1]!;
    transferSovereigntyForTest(engine, externalId, ROGUE_AI_NATION_ID_V2);
    const staged = rogueWaveManpowerAtV2(engine.state, ROGUE_AI_CORE_TERRITORY_ID_V2);
    expect(staged).toBeGreaterThan(0);
    const detached = staged / 2;
    for (let index = 1; index < route.length; index += 1) {
      const sourceId = route[index - 1]!;
      const targetId = route[index]!;
      expect(engine.content.territories[sourceId]!.connections
        .some((connection) => connection.targetId === targetId)).toBe(true);
      const source = engine.state.territories[sourceId]!;
      const target = engine.state.territories[targetId]!;
      const sourceBefore = source.army.manpower;
      source.army.manpower -= detached;
      target.army.manpower += detached;
      expect(transferRogueWaveManpowerV2(
        engine.state, sourceId, targetId, detached, sourceBefore,
      )).toBeCloseTo(detached, 9);
    }
    expect(rogueWaveManpowerAtV2(engine.state, ROGUE_AI_CORE_TERRITORY_ID_V2))
      .toBeCloseTo(staged - detached, 9);
    expect(rogueWaveManpowerAtV2(engine.state, externalId))
      .toBeCloseTo(detached, 9);
    synchronizeArmyCapacityV2(engine.state, engine.content);
    assertInvariantsV2(engine.state, engine.content);

    const reloaded = WorldEngineV2.fromSave(engine.save(), engine.content);
    expect(reloaded.canonicalHash()).toBe(engine.canonicalHash());
    expect(rogueWaveManpowerAtV2(reloaded.state, externalId))
      .toBeCloseTo(detached, 9);
    const casualty = detached / 4;
    const eligibleBefore = rogueWaveManpowerAtV2(reloaded.state, externalId);
    const defenderBefore = reloaded.state.territories[externalId]!.army.manpower;
    reloaded.state.territories[externalId]!.army.manpower -= casualty;
    expect(recordRogueWaveCasualtiesV2(
      reloaded.state,
      externalId,
      defenderBefore,
      casualty,
      human,
    )).toBeGreaterThan(0);
    expect(rogueWaveLossCreditV2(reloaded.state, human)).toBeGreaterThan(0);
    expect(rogueWaveLossCreditV2(reloaded.state, human))
      .toBeLessThanOrEqual(casualty);
    expect(rogueWaveManpowerAtV2(reloaded.state, externalId)).toBeLessThan(eligibleBefore);
  });
});

function engineContent() {
  return resolveScenarioV2({ mode: 'survival', seed: 61_000 }).content;
}
