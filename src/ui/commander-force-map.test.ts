import { describe, expect, it } from 'vitest';
import { synchronizeArmyCapacityV2 } from '../sim/v2/capacity';
import { reconcileCommanderTerritorialAccessV2 } from '../sim/v2/commanderForce';
import { retireAbsorbedNationV2 } from '../sim/v2/integration';
import { nationIdV2, territoryIdV2 } from '../sim/v2/types';
import { WorldEngineV2 } from '../sim/v2/WorldEngineV2';
import { createMapEngineAdapter, createMapSnapshot } from './WorldUIV2';

describe('APEX neural-dome map snapshot', () => {
  it('projects the dome without merging Shield Integrity into a territory army', () => {
    const engine = new WorldEngineV2(81_551);
    const belgium = nationIdV2('bel');
    expect(engine.chooseCountry(belgium)).toEqual({ accepted: true });
    expect(engine.initializeCommanderForce(belgium, {
      manpower: 0.018,
      capacity: 0.03,
      trainedReserves: 0.004,
      baseAttack: 4.8,
      baseDefense: 5.2,
      treasury: 24,
      annualOutput: 7.5,
      supplyStock: 1.2,
    })).toEqual({ accepted: true });

    const territoryManpower = engine.state.territories[territoryIdV2('bel')].army.manpower;
    const projected = createMapSnapshot(engine);

    expect(projected.commanderForces?.[belgium]).toMatchObject({
      playerId: belgium,
      role: 'apex',
      headquartersId: territoryIdV2('bel'),
      locationId: territoryIdV2('bel'),
      mission: 'standby',
      front: null,
      army: { manpower: 0.018, capacity: 0.03, trainedReserves: 0.004 },
      economy: { treasury: 0, annualOutput: 7.5, supplyStock: 1.2 },
      doctrineRuntime: {
        lancerSupportedAssaultCount: 0,
        secondaryProjection: null,
      },
      transit: null,
    });
    expect(engine.state.territories[territoryIdV2('bel')].army.manpower).toBe(territoryManpower);
  });

  it('projects Twin placement without inventing charge for an unselected Lancer protocol', () => {
    const engine = new WorldEngineV2(81_555);
    const belgium = nationIdV2('bel');
    expect(engine.chooseCountry(belgium)).toEqual({ accepted: true });
    expect(engine.initializeCommanderForce(belgium, {
      manpower: 0.0008,
      capacity: 0.0008,
      trainedReserves: 0.00008,
      baseAttack: 125,
      baseDefense: 125,
      treasury: 0,
      annualOutput: 0.015,
      supplyStock: 0.010,
      capabilities: { rapidResponse: true },
    })).toEqual({ accepted: true });
    engine.state.commanderForces[belgium]!.doctrineRuntime = {
      lancerSupportedAssaultCount: 0,
      secondaryProjection: {
        locationId: territoryIdV2('lux'),
        mission: 'assault-support',
        front: {
          warId: 'war-twin-map',
          sourceId: territoryIdV2('lux'),
          targetId: territoryIdV2('deu'),
        },
        pairedPrimaryFront: {
          warId: 'war-primary-map',
          sourceId: territoryIdV2('bel'),
          targetId: territoryIdV2('nld'),
        },
      },
    };

    const runtime = createMapSnapshot(engine).commanderForces?.[belgium]
      ?.doctrineRuntime;
    expect(runtime).toEqual({
      lancerSupportedAssaultCount: 0,
      secondaryProjection: {
        locationId: territoryIdV2('lux'),
        mission: 'assault-support',
        front: {
          warId: 'war-twin-map',
          sourceId: territoryIdV2('lux'),
          targetId: territoryIdV2('deu'),
        },
      },
    });
    expect(runtime?.secondaryProjection).not.toHaveProperty('army');
    expect(runtime?.secondaryProjection).not.toHaveProperty('economy');
  });

  it('projects ROGUE PRIME as a hostile polar sidecar instead of a human APEX entry', () => {
    const engine = new WorldEngineV2(81_553);
    const belgium = nationIdV2('bel');
    expect(engine.chooseCountry(belgium)).toEqual({ accepted: true });
    engine.state.polarEndgame.roguePrime = {
      status: 'guarding',
      force: {
        army: { manpower: 0.0003, capacity: 0.0005, trainedReserves: 0, baseAttack: 70, baseDefense: 80 },
        economy: {
          treasury: 20,
          annualOutput: 0,
          supplyStock: 0.01,
          priorities: { training: 0, logistics: 100, development: 0 },
        },
        capabilities: {
          mobileHeadquarters: true,
          fieldHospital: false,
          rapidResponse: true,
          assaultSpecialist: true,
          defenseSpecialist: true,
          emergencyExtractionCharges: 0,
        },
        countryTraitScale: 0,
        locationId: territoryIdV2('zero-point-core'),
        mission: 'standby',
        orderSource: 'autonomous',
        manualHoldUntilTick: 0,
        front: null,
        transit: null,
      },
      sortieSequence: 0,
      nextSortieTick: 60,
      gatewayId: null,
      targetId: null,
      departTick: null,
      strikeTick: null,
      returnTick: null,
      rebuildReadyTick: null,
    };

    const projected = createMapSnapshot(engine);
    expect(projected.commanderForces?.['rogue-prime']).toBeUndefined();
    expect(projected.polarEndgame?.roguePrime).toMatchObject({
      status: 'guarding',
      force: {
        playerId: 'rogue-prime',
        role: 'rogue-prime',
        headquartersId: 'zero-point-core',
        locationId: 'zero-point-core',
      },
    });
  });

  it('refreshes a movement route and ETA after a manual order changes state', () => {
    const engine = new WorldEngineV2(81_552);
    const belgium = nationIdV2('bel');
    expect(engine.chooseCountry(belgium)).toEqual({ accepted: true });
    expect(engine.initializeCommanderForce(belgium, {
      manpower: 0.012,
      capacity: 0.02,
      baseAttack: 4.2,
      baseDefense: 4.6,
      treasury: 20,
      annualOutput: 6,
    })).toEqual({ accepted: true });
    engine.state.commanderForces[belgium]!.mission = 'logistics-relief';
    engine.state.commanderForces[belgium]!.transit = {
      path: [territoryIdV2('bel'), territoryIdV2('fra')],
      distanceKm: 300,
      departTick: 3,
      arriveTick: 7,
    };

    const adapter = createMapEngineAdapter(engine, () => engine.globalRanking());
    adapter.refreshSnapshot?.();
    expect(adapter.state.commanderForces?.[belgium]).toMatchObject({
      mission: 'logistics-relief',
      transit: {
        path: [territoryIdV2('bel'), territoryIdV2('fra')],
        departTick: 3,
        arriveTick: 7,
      },
    });
  });

  it('projects lost-Greenland extraction to the African destination without adding APEX to its army', () => {
    const engine = new WorldEngineV2(81_554);
    const greenland = nationIdV2('grl');
    const guineaBissau = nationIdV2('gnb');
    const canada = nationIdV2('can');
    const grl = territoryIdV2('grl');
    const gnb = territoryIdV2('gnb');
    expect(engine.chooseCountry(greenland)).toEqual({ accepted: true });
    expect(engine.initializeCommanderForce(greenland, {
      manpower: 0.0008,
      capacity: 0.0008,
      trainedReserves: 0.00008,
      baseAttack: 125,
      baseDefense: 125,
      treasury: 0,
      annualOutput: 0.015,
      supplyStock: 0.010,
    })).toEqual({ accepted: true });
    engine.state.territories[gnb]!.owner = greenland;
    engine.state.territories[gnb]!.coreOwner = greenland;
    engine.state.territories[gnb]!.integration = 1;
    engine.state.territories[gnb]!.integrationProgram = null;
    engine.state.players[greenland]!.capitalId = gnb;
    retireAbsorbedNationV2(engine.state, guineaBissau);
    engine.state.territories[grl]!.owner = canada;
    engine.state.territories[grl]!.coreOwner = canada;
    engine.state.territories[grl]!.integration = 1;
    engine.state.territories[grl]!.integrationProgram = null;
    synchronizeArmyCapacityV2(engine.state, engine.content);

    const nationalArmyBeforeExtraction = createMapSnapshot(engine).territories[gnb]!.army;
    expect(reconcileCommanderTerritorialAccessV2(
      engine.state, engine.content, greenland,
    )).toBe(true);
    const projected = createMapSnapshot(engine);

    expect(projected.commanderForces?.[greenland]).toMatchObject({
      locationId: grl,
      mission: 'evacuate',
      transit: { path: [grl, gnb] },
      army: { manpower: 0.0008, baseAttack: 125, baseDefense: 125 },
    });
    expect(projected.territories[gnb]!.army).toEqual(nationalArmyBeforeExtraction);
    expect(projected.commanderForces![greenland]!.transit!.arriveTick)
      .toBeGreaterThan(projected.tick);
  });
});
