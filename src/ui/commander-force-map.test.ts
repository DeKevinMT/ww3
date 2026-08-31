import { describe, expect, it } from 'vitest';
import { synchronizeArmyCapacityV2 } from '../sim/v2/capacity';
import {
  normalizeCommanderForceRuntimeV2,
  reconcileCommanderTerritorialAccessV2,
} from '../sim/v2/commanderForce';
import { retireAbsorbedNationV2 } from '../sim/v2/integration';
import {
  nationIdV2,
  territoryIdV2,
  type CommanderForceInitializationV2,
} from '../sim/v2/types';
import { WorldEngineV2 } from '../sim/v2/WorldEngineV2';
import { createMapEngineAdapter, createMapSnapshot } from './WorldUIV2';

function apexInitialization(options: {
  integrity: number;
  maxIntegrity: number;
  rechargeBuffer?: number;
  attackMultiplier?: number;
  defenseMultiplier?: number;
  pulseAttack?: number;
  treasury?: number;
  annualOutput?: number;
  supplyStock?: number;
  capabilities?: CommanderForceInitializationV2['capabilities'];
}): CommanderForceInitializationV2 {
  return {
    shield: {
      integrity: options.integrity,
      maxIntegrity: options.maxIntegrity,
      rechargeBuffer: options.rechargeBuffer ?? 0,
      rechargeMultiplier: 1,
      pulseAttack: options.pulseAttack ?? 0.001,
    },
    attackMultiplier: options.attackMultiplier ?? 1.08,
    defenseMultiplier: options.defenseMultiplier ?? 1.08,
    treasury: options.treasury ?? 0,
    annualOutput: options.annualOutput ?? 0,
    supplyStock: options.supplyStock ?? 0,
    capabilities: options.capabilities,
  };
}

describe('EONSCAR neural-dome map snapshot', () => {
  it('projects Energy without merging EONSCAR into a territory army', () => {
    const engine = new WorldEngineV2(81_551);
    const belgium = nationIdV2('bel');
    expect(engine.chooseCountry(belgium)).toEqual({ accepted: true });
    expect(engine.initializeCommanderForce(belgium, apexInitialization({
      integrity: 0.018,
      maxIntegrity: 0.03,
      rechargeBuffer: 0.004,
      attackMultiplier: 1.048,
      defenseMultiplier: 1.052,
      treasury: 24,
      annualOutput: 7.5,
      supplyStock: 1.2,
    }))).toEqual({ accepted: true });

    const territoryManpower = engine.state.territories[territoryIdV2('bel')].army.manpower;
    const projected = createMapSnapshot(engine);

    expect(projected.commanderForces?.[belgium]).toMatchObject({
      playerId: belgium,
      role: 'apex',
      headquartersId: territoryIdV2('bel'),
      locationId: territoryIdV2('bel'),
      mission: 'standby',
      front: null,
      shield: {
        integrity: 0.018,
        maxIntegrity: 0.03,
        rechargeBuffer: 0.004,
        attackMultiplier: 1.048,
        defenseMultiplier: 1.052,
        pulseAttack: 0.001,
      },
      economy: { treasury: 0, annualOutput: 7.5, supplyStock: 1.2 },
      doctrineRuntime: {
        lancerSupportedAssaultCount: 0,
        secondaryProjection: null,
      },
      transit: null,
    });
    expect(engine.state.territories[territoryIdV2('bel')].army.manpower).toBe(territoryManpower);
  });

  it('projects one empire network without retired split placement or false Overdrive charge', () => {
    const engine = new WorldEngineV2(81_555);
    const belgium = nationIdV2('bel');
    expect(engine.chooseCountry(belgium)).toEqual({ accepted: true });
    expect(engine.initializeCommanderForce(belgium, apexInitialization({
      integrity: 0.0008,
      maxIntegrity: 0.0008,
      rechargeBuffer: 0.00008,
      attackMultiplier: 1.08,
      defenseMultiplier: 1.08,
      annualOutput: 0.015,
      supplyStock: 0.010,
      capabilities: { forceMultiplier: true },
    }))).toEqual({ accepted: true });

    const projected = createMapSnapshot(engine).commanderForces?.[belgium];
    const runtime = projected?.doctrineRuntime;
    expect(runtime).toEqual({
      lancerSupportedAssaultCount: 0,
      secondaryProjection: null,
    });
    expect(projected?.empireShield).toMatchObject({
      active: true,
      integrityPercent: 100,
      coverageTerritoryIds: [territoryIdV2('bel')],
      activeFrontTerritoryIds: [],
    });
    expect(projected).not.toHaveProperty('army');
  });

  it('projects ROGUE PRIME as a hostile polar sidecar instead of a human EONSCAR entry', () => {
    const engine = new WorldEngineV2(81_553);
    const belgium = nationIdV2('bel');
    expect(engine.chooseCountry(belgium)).toEqual({ accepted: true });
    const roguePrimeForce = normalizeCommanderForceRuntimeV2({
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
    });
    expect(roguePrimeForce).not.toBeNull();
    engine.state.polarEndgame.roguePrime = {
      status: 'guarding',
      force: roguePrimeForce,
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

  it('refreshes Energy changes without exposing manual movement state', () => {
    const engine = new WorldEngineV2(81_552);
    const belgium = nationIdV2('bel');
    expect(engine.chooseCountry(belgium)).toEqual({ accepted: true });
    expect(engine.initializeCommanderForce(belgium, apexInitialization({
      integrity: 0.012,
      maxIntegrity: 0.02,
      attackMultiplier: 1.042,
      defenseMultiplier: 1.046,
      treasury: 20,
      annualOutput: 6,
    }))).toEqual({ accepted: true });
    engine.state.commanderForces[belgium]!.shield.integrity = 0.006;

    const adapter = createMapEngineAdapter(engine, () => engine.globalRanking());
    adapter.refreshSnapshot?.();
    expect(adapter.state.commanderForces?.[belgium]).toMatchObject({
      mission: 'standby',
      shield: { integrity: 0.006, maxIntegrity: 0.02 },
      transit: null,
    });
  });

  it('anchors a legacy lost-Greenland save to the surviving empire without adding EONSCAR to its army', () => {
    const engine = new WorldEngineV2(81_554);
    const greenland = nationIdV2('grl');
    const guineaBissau = nationIdV2('gnb');
    const canada = nationIdV2('can');
    const grl = territoryIdV2('grl');
    const gnb = territoryIdV2('gnb');
    expect(engine.chooseCountry(greenland)).toEqual({ accepted: true });
    expect(engine.initializeCommanderForce(greenland, apexInitialization({
      integrity: 0.0008,
      maxIntegrity: 0.0008,
      rechargeBuffer: 0.00008,
      attackMultiplier: 1.08,
      defenseMultiplier: 1.08,
      annualOutput: 0.015,
      supplyStock: 0.010,
    }))).toEqual({ accepted: true });
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
      locationId: gnb,
      mission: 'standby',
      transit: null,
      shield: {
        integrity: 0.0008,
        maxIntegrity: 0.0008,
        rechargeBuffer: 0.00008,
        attackMultiplier: 1.08,
        defenseMultiplier: 1.08,
      },
    });
    expect(projected.territories[gnb]!.army).toEqual(nationalArmyBeforeExtraction);
    expect(projected.commanderForces![greenland]!.empireShield).toMatchObject({
      coverageTerritoryIds: [gnb],
      activeFrontTerritoryIds: [],
    });
  });
});
