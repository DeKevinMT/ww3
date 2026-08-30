import { describe, expect, it } from 'vitest';
import { WorldEngineV2 } from './WorldEngineV2';
import {
  applyCommanderCasualtiesV2,
  selectCommanderBattleSupportV2,
} from './commanderForce';
import {
  ANTARCTIC_GATEWAY_COUNTRY_ROUTES_V2,
  ANTARCTIC_TERRITORY_IDS_V2,
  ROGUE_AI_NATION_ID_V2,
} from './content';
import { assertInvariantsV2 } from './invariants';
import {
  ROGUE_PRIME_OUTSIDE_MAX_TICKS_V2,
  ROGUE_PRIME_OUTSIDE_MIN_TICKS_V2,
  ROGUE_PRIME_REBUILD_MAX_TICKS_V2,
  ROGUE_PRIME_REBUILD_MIN_TICKS_V2,
  ROGUE_PRIME_REPLACEMENT_PER_TICK_V2,
  ROGUE_PRIME_REPLACEMENT_SUPPLY_PER_MILLION_V2,
  ROGUE_PRIME_SORTIE_WARNING_MAX_TICKS_V2,
  ROGUE_PRIME_SORTIE_WARNING_MIN_TICKS_V2,
  processRoguePrimeV2,
  reconcileRoguePrimeV2,
} from './roguePrime';
import { resolveScenarioV2 } from './scenarios';
import { recordRoguePrimeCasualtiesV2, rogueWaveLossCreditV2 } from './survivalProvenance';
import {
  nationIdV2,
  territoryIdV2,
  type FrontOperationV2,
  type PlayerId,
  type TerritoryId,
  type WarStateV2,
} from './types';

function survival(seed: number): WorldEngineV2 {
  const resolved = resolveScenarioV2({ mode: 'survival', seed });
  return new WorldEngineV2(seed, resolved.content);
}

function operation(
  commanderId: PlayerId,
  sourceId: TerritoryId,
  targetId: TerritoryId,
  access: FrontOperationV2['access'] = 'naval',
): FrontOperationV2 {
  return {
    commanderId,
    sourceId,
    targetId,
    doctrine: 'pressure',
    access,
    startedTick: 0,
    lastBattleTick: 0,
    holdUntilTick: 0,
    momentum: 0,
  };
}

function war(
  engine: WorldEngineV2,
  attackerId: PlayerId,
  defenderId: PlayerId,
  attackerOperations: FrontOperationV2[],
): WarStateV2 {
  const value: WarStateV2 = {
    id: `war-${engine.state.nextWarId++}`,
    attackerId,
    defenderId,
    startedTick: 0,
    lastBattleTick: 0,
    warScore: 0,
    battles: 0,
    attackerLosses: 0,
    defenderLosses: 0,
    attackerCivilianLosses: 0,
    defenderCivilianLosses: 0,
    lastPeaceOfferTick: -1_000_000,
    revenge: null,
    attackerOperations,
    defenderOperations: [],
  };
  engine.state.wars.push(value);
  return value;
}

function openGatewayAndCreateFront(engine: WorldEngineV2): {
  route: (typeof ANTARCTIC_GATEWAY_COUNTRY_ROUTES_V2)[number];
  operation: FrontOperationV2;
  war: WarStateV2;
} {
  const gatewayId = engine.state.polarEndgame.gatewayBreachOrder[0]!;
  const route = ANTARCTIC_GATEWAY_COUNTRY_ROUTES_V2.find(
    (candidate) => candidate.gatewayId === gatewayId,
  )!;
  const breach = engine.state.polarEndgame.gatewayBreaches[gatewayId]!;
  breach.status = 'open';
  breach.breachStartedTick = 0;
  breach.opensTick = 1;
  breach.openedTick = 1;
  const targetOwner = engine.state.territories[route.countryId]!.owner;
  const front = operation(
    ROGUE_AI_NATION_ID_V2,
    territoryIdV2(route.gatewayId),
    route.countryId,
  );
  return {
    route,
    operation: front,
    war: war(engine, ROGUE_AI_NATION_ID_V2, targetOwner, [front]),
  };
}

describe('ROGUE PRIME', () => {
  it('is active on the ice in Survival but dormant in Campaign', () => {
    const late = survival(91_001);
    expect(late.state.polarEndgame.roguePrime.status).toBe('guarding');
    expect(late.state.polarEndgame.roguePrime.force?.locationId)
      .toBe(territoryIdV2('zero-point-core'));
    expect(ANTARCTIC_TERRITORY_IDS_V2).toContain(
      late.state.polarEndgame.roguePrime.force!.locationId,
    );

    const campaign = new WorldEngineV2(91_001);
    expect(campaign.state.polarEndgame.roguePrime).toMatchObject({
      status: 'dormant',
      force: null,
      nextSortieTick: null,
    });
    assertInvariantsV2(late.state, late.content);
    assertInvariantsV2(campaign.state, campaign.content);
  });

  it('cannot sortie through a sealed gateway and uses only its direct authored beachhead', () => {
    const engine = survival(91_002);
    engine.state.polarEndgame.roguePrime.nextSortieTick = 0;
    const gatewayId = engine.state.polarEndgame.gatewayBreachOrder[0]!;
    const route = ANTARCTIC_GATEWAY_COUNTRY_ROUTES_V2.find(
      (candidate) => candidate.gatewayId === gatewayId,
    )!;
    const targetOwner = engine.state.territories[route.countryId]!.owner;
    const front = operation(ROGUE_AI_NATION_ID_V2, territoryIdV2(gatewayId), route.countryId);
    war(engine, ROGUE_AI_NATION_ID_V2, targetOwner, [front]);

    processRoguePrimeV2(engine.state, engine.content);
    expect(engine.state.polarEndgame.roguePrime.status).toBe('guarding');

    const breach = engine.state.polarEndgame.gatewayBreaches[gatewayId]!;
    breach.status = 'open';
    breach.breachStartedTick = 0;
    breach.opensTick = 0;
    breach.openedTick = 0;
    processRoguePrimeV2(engine.state, engine.content);
    const prime = engine.state.polarEndgame.roguePrime;
    expect(prime.status).toBe('sortie');
    expect(prime.gatewayId).toBe(gatewayId);
    expect(prime.targetId).toBe(route.countryId);
    expect(prime.force!.transit?.path.every((id) => ANTARCTIC_TERRITORY_IDS_V2.includes(id)))
      .toBe(true);
    expect(prime.strikeTick! - prime.departTick!).toBeGreaterThanOrEqual(
      ROGUE_PRIME_SORTIE_WARNING_MIN_TICKS_V2,
    );
    expect(prime.strikeTick! - prime.departTick!).toBeLessThanOrEqual(
      ROGUE_PRIME_SORTIE_WARNING_MAX_TICKS_V2,
    );
    expect(prime.returnTick! - prime.strikeTick!).toBeGreaterThanOrEqual(
      ROGUE_PRIME_OUTSIDE_MIN_TICKS_V2,
    );
    expect(prime.returnTick! - prime.strikeTick!).toBeLessThanOrEqual(
      ROGUE_PRIME_OUTSIDE_MAX_TICKS_V2,
    );
    assertInvariantsV2(engine.state, engine.content);
  });

  it('joins only during its announced window and returns to Antarctica without a second hop', () => {
    const engine = survival(91_003);
    engine.state.tick = 60;
    engine.state.polarEndgame.roguePrime.nextSortieTick = 0;
    const front = openGatewayAndCreateFront(engine);
    processRoguePrimeV2(engine.state, engine.content);
    const prime = engine.state.polarEndgame.roguePrime;
    expect(selectCommanderBattleSupportV2(
      engine.state, front.war, front.operation, engine.content,
    ).attacker)
      .toBeNull();

    engine.state.tick = prime.strikeTick!;
    processRoguePrimeV2(engine.state, engine.content);
    expect(selectCommanderBattleSupportV2(
      engine.state, front.war, front.operation, engine.content,
    ).attacker)
      .toMatchObject({ playerId: ROGUE_AI_NATION_ID_V2 });

    engine.state.tick = prime.returnTick!;
    processRoguePrimeV2(engine.state, engine.content);
    expect(prime.status).toBe('guarding');
    expect(prime.force?.locationId).toBe(territoryIdV2(front.route.gatewayId));
    expect(prime.targetId).toBeNull();
    expect(prime.force?.front).toBeNull();
    expect(prime.nextSortieTick).toBeGreaterThan(engine.state.tick + 100);
  });

  it('defends the highest-depth reachable Antarctic front and never crosses captured ice', () => {
    const engine = survival(91_004);
    const human = nationIdV2('chl');
    expect(engine.chooseCountry(human)).toEqual({ accepted: true });
    expect(engine.initializeCommanderForce(human, {
      shield: {
        integrity: 0.0004,
        maxIntegrity: 0.0009,
        rechargeBuffer: 0.00008,
        pulseAttack: 0.001,
      },
      attackMultiplier: 1.12,
      defenseMultiplier: 1.18,
      treasury: 20,
      annualOutput: 4,
      supplyStock: 0.006,
    })).toEqual({ accepted: true });
    const prime = engine.state.polarEndgame.roguePrime;
    prime.nextSortieTick = engine.state.tick + 999;
    const core = territoryIdV2('zero-point-core');
    const inner = territoryIdV2('sentinel-labyrinth');
    engine.state.territories[inner]!.owner = human;
    const coreAttack = operation(human, inner, core, 'land');
    const coreWar = war(engine, human, ROGUE_AI_NATION_ID_V2, [coreAttack]);
    const apex = engine.state.commanderForces[human]!;
    apex.locationId = inner;
    apex.mission = 'assault-support';
    apex.front = { warId: coreWar.id, sourceId: inner, targetId: core };
    processRoguePrimeV2(engine.state, engine.content);
    expect(prime.force).toMatchObject({
      locationId: core,
      mission: 'defense',
      front: { warId: coreWar.id, sourceId: inner, targetId: core },
    });
    const opposed = selectCommanderBattleSupportV2(
      engine.state, coreWar, coreAttack, engine.content,
    );
    expect(opposed.attacker).toMatchObject({ playerId: human });
    expect(opposed.defender).toMatchObject({ playerId: ROGUE_AI_NATION_ID_V2 });
    const apexBefore = apex.shield.integrity;
    const primeBefore = prime.force!.shield.integrity;
    expect(applyCommanderCasualtiesV2(engine.state, human, 0.00002)).toBeGreaterThan(0);
    expect(applyCommanderCasualtiesV2(
      engine.state, ROGUE_AI_NATION_ID_V2, 0.00002,
    )).toBeGreaterThan(0);
    expect(apex.shield.integrity).toBeLessThan(apexBefore);
    expect(prime.force!.shield.integrity).toBeLessThan(primeBefore);

    engine.state.wars = [];
    prime.force!.locationId = territoryIdV2('drake-entry');
    prime.force!.mission = 'standby';
    prime.force!.front = null;
    engine.state.territories[territoryIdV2('weddell-forge')]!.owner = human;
    const blockedAttack = operation(human, inner, core, 'land');
    war(engine, human, ROGUE_AI_NATION_ID_V2, [blockedAttack]);
    processRoguePrimeV2(engine.state, engine.content);
    expect(prime.force!.transit).toBeNull();
    expect(prime.force!.locationId).toBe(territoryIdV2('drake-entry'));
  });

  it('rebuilds deterministically only at Zero Point and partial recovery spends real Energy reserves', () => {
    const engine = survival(91_005);
    const prime = engine.state.polarEndgame.roguePrime;
    const force = prime.force!;
    const rogue = engine.state.players[ROGUE_AI_NATION_ID_V2]!;
    force.shield.integrity -= 0.00005;
    const integrityBefore = force.shield.integrity;
    const supplyBefore = force.economy.supplyStock;
    const coreSupplyRefill = Math.min(
      0.0005,
      force.shield.maxIntegrity * 26 - supplyBefore,
    );
    const nationalReservesBefore = rogue.trainedReserves;
    const treasuryBefore = rogue.treasury;
    processRoguePrimeV2(engine.state, engine.content);
    expect(force.shield.integrity - integrityBefore).toBeCloseTo(
      ROGUE_PRIME_REPLACEMENT_PER_TICK_V2,
      9,
    );
    expect(force.economy.supplyStock).toBeCloseTo(
      supplyBefore + coreSupplyRefill
        - ROGUE_PRIME_REPLACEMENT_PER_TICK_V2
          * ROGUE_PRIME_REPLACEMENT_SUPPLY_PER_MILLION_V2,
      9,
    );
    expect(rogue.trainedReserves).toBe(nationalReservesBefore);
    expect(rogue.treasury).toBeLessThan(treasuryBefore);

    // PRIME is deliberately not covered by the human APEX narrative floor:
    // real combat can destroy it before Zero Point starts its rebuild timer.
    expect(applyCommanderCasualtiesV2(
      engine.state,
      ROGUE_AI_NATION_ID_V2,
      force.shield.integrity + 1,
    )).toBeGreaterThan(0);
    expect(force.shield.integrity).toBe(0);
    reconcileRoguePrimeV2(engine.state);
    expect(prime.status).toBe('rebuilding');
    expect(prime.rebuildReadyTick! - engine.state.tick).toBeGreaterThanOrEqual(
      ROGUE_PRIME_REBUILD_MIN_TICKS_V2,
    );
    expect(prime.rebuildReadyTick! - engine.state.tick).toBeLessThanOrEqual(
      ROGUE_PRIME_REBUILD_MAX_TICKS_V2,
    );
    const loaded = WorldEngineV2.fromSave(engine.save(), engine.content);
    expect(loaded.state.polarEndgame.roguePrime).toEqual(prime);
    expect(loaded.save()).toBe(engine.save());

    loaded.state.tick = loaded.state.polarEndgame.roguePrime.rebuildReadyTick!;
    processRoguePrimeV2(loaded.state, loaded.content);
    expect(loaded.state.polarEndgame.roguePrime.status).toBe('guarding');
    expect(loaded.state.polarEndgame.roguePrime.force?.locationId)
      .toBe(territoryIdV2('zero-point-core'));
  });

  it('is permanently removed with Zero Point and all losses are verified Antarctic credit', () => {
    const engine = survival(91_006);
    const human = nationIdV2('chl');
    expect(engine.chooseCountry(human)).toEqual({ accepted: true });
    const before = rogueWaveLossCreditV2(engine.state, human);
    const applied = applyCommanderCasualtiesV2(
      engine.state,
      ROGUE_AI_NATION_ID_V2,
      0.00004,
    );
    expect(recordRoguePrimeCasualtiesV2(engine.state, applied, human)).toBe(applied);
    expect(rogueWaveLossCreditV2(engine.state, human) - before).toBeCloseTo(applied, 9);

    engine.state.territories[territoryIdV2('zero-point-core')]!.owner = human;
    reconcileRoguePrimeV2(engine.state);
    expect(engine.state.polarEndgame.roguePrime).toMatchObject({
      status: 'destroyed',
      force: null,
      rebuildReadyTick: null,
    });
    engine.state.tick += 500;
    processRoguePrimeV2(engine.state, engine.content);
    expect(engine.state.polarEndgame.roguePrime.status).toBe('destroyed');
  });
});
