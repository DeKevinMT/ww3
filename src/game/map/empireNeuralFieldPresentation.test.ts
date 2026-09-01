import { describe, expect, it } from 'vitest';
import type {
  MapCommanderForceState,
  MapTerritoryState,
  WorldMapEngineContract,
} from './bridge';
import { selectApexEmpireFieldPresentation } from './empireNeuralFieldPresentation';

function territory(id: string, ownerId: string): MapTerritoryState {
  return {
    id,
    ownerId,
    coreOwnerId: ownerId,
    integration: 1,
    army: {
      manpower: 1,
      capacity: 1,
      combatStrength: 1,
      power: 1,
      attack: 1,
      defense: 1,
    },
  };
}

function apex(integrity = 100): MapCommanderForceState {
  return {
    playerId: 'human',
    headquartersId: 'grl',
    locationId: 'grl',
    mission: 'defense',
    front: 'can',
    shield: {
      integrity,
      maxIntegrity: 100,
      rechargeBuffer: 0,
      rechargeMultiplier: 1,
      attackMultiplier: 1.1,
      defenseMultiplier: 1.1,
      pulseAttack: 1,
    },
    economy: { treasury: 0, annualOutput: 0, supplyStock: 0 },
    transit: null,
  };
}

function engine(force = apex()): WorldMapEngineContract {
  const territories = {
    grl: territory('grl', 'human'),
    isl: territory('isl', 'human'),
    can: territory('can', 'enemy'),
    usa: territory('usa', 'enemy'),
  };
  return {
    content: {
      metadata: { scenarioId: 'survival' },
      territories: {
        grl: { connections: [{ targetId: 'isl' }, { targetId: 'can' }] },
        isl: { connections: [{ targetId: 'grl' }] },
        can: { connections: [{ targetId: 'grl' }, { targetId: 'usa' }] },
      },
    },
    viewerKnowledge: { chartedTerritoryIds: [], apexFieldActivated: true },
    state: {
      tick: 2,
      humanPlayerId: 'human',
      humanPlayerIds: ['human'],
      openingMobilisations: {},
      territories,
      wars: [{
        id: 'war',
        attackerId: 'human',
        defenderId: 'enemy',
        attackerOperations: [{
          commanderId: 'human',
          sourceId: 'grl',
          targetId: 'can',
          doctrine: 'balanced',
          momentum: 0,
        }],
        defenderOperations: [],
      }],
      logisticsMovements: [],
      commanderForces: { human: force },
    },
    player: () => undefined,
    territoriesOf: (playerId) => Object.values(territories)
      .filter((entry) => entry.ownerId === playerId),
    globalRanking: () => [],
    activeWarBetween: () => undefined,
  };
}

describe('empire-wide EONSCAR field presentation', () => {
  it('covers the complete owned empire while concentrating at friendly fronts', () => {
    const presentation = selectApexEmpireFieldPresentation(engine());
    expect(presentation.active).toBe(true);
    expect(presentation.coverageTerritoryIds).toEqual(['grl', 'isl']);
    expect(presentation.activeFrontTerritoryIds).toEqual(['grl']);
    expect(presentation.networkEdges).toEqual([]);
    expect(presentation.percent).toBe(100);
  });

  it('keeps land continuity but leaves sea-distance continuity to naval gateways', () => {
    const world = engine();
    world.state.territories.can!.ownerId = 'human';
    world.state.territories.can!.coreOwnerId = 'human';
    world.state.territories.usa!.ownerId = 'human';
    world.state.territories.usa!.coreOwnerId = 'human';

    const presentation = selectApexEmpireFieldPresentation(world);
    expect(presentation.coverageTerritoryIds).toEqual(['can', 'grl', 'isl', 'usa']);
    expect(presentation.networkEdges).toEqual([{ sourceId: 'can', targetId: 'usa' }]);
  });

  it('shares one integrity pool and ignores sub-five-percent geometry noise', () => {
    const full = selectApexEmpireFieldPresentation(engine(apex(100)));
    const lightlyDamaged = selectApexEmpireFieldPresentation(engine(apex(98)));
    const damaged = selectApexEmpireFieldPresentation(engine(apex(72)));
    expect(lightlyDamaged.geometrySignature).toBe(full.geometrySignature);
    expect(damaged.geometrySignature).not.toBe(full.geometrySignature);
    expect(damaged.percent).toBe(72);
  });

  it('prefers the canonical distributed bridge contract over legacy location state', () => {
    const force: MapCommanderForceState = {
      ...apex(87),
      locationId: 'can',
      transit: { path: ['can', 'usa'], departTick: 1, arriveTick: 10 },
      empireShield: {
        active: true,
        operationalState: 'operational',
        integrityCurrent: 42,
        integrityMax: 100,
        integrityPercent: 42,
        attackMultiplier: 1.09,
        defenseMultiplier: 1.11,
        pulseAttack: 1,
        supportBonusPercent: 10,
        coverageTerritoryIds: ['isl', 'grl'],
        activeFrontTerritoryIds: ['isl'],
        fronts: [],
      },
    };
    const presentation = selectApexEmpireFieldPresentation(engine(force));
    expect(presentation.coverageTerritoryIds).toEqual(['grl', 'isl']);
    expect(presentation.activeFrontTerritoryIds).toEqual(['isl']);
    expect(presentation.integrity).toBe(0.42);
    expect(presentation.percent).toBe(42);
  });

  it('adds conquered territory coverage only after Signal Purge is complete', () => {
    const force: MapCommanderForceState = {
      ...apex(),
      empireShield: {
        active: true,
        operationalState: 'operational',
        integrityCurrent: 100,
        integrityMax: 100,
        integrityPercent: 100,
        attackMultiplier: 1.09,
        defenseMultiplier: 1.11,
        pulseAttack: 1,
        supportBonusPercent: 10,
        coverageTerritoryIds: ['grl', 'isl'],
        activeFrontTerritoryIds: [],
        fronts: [],
      },
    };
    const world = engine(force);
    world.state.territories.isl!.coreOwnerId = 'enemy';
    world.state.territories.isl!.integration = 0.99;
    expect(selectApexEmpireFieldPresentation(world).coverageTerritoryIds).toEqual(['grl']);

    world.state.territories.isl!.integration = 1;
    expect(selectApexEmpireFieldPresentation(world).coverageTerritoryIds).toEqual(['grl', 'isl']);
  });

  it('has no location-bound fallback before activation or after depletion', () => {
    const base = engine();
    const prologue: WorldMapEngineContract = {
      ...base,
      content: {
        ...base.content,
        metadata: { scenarioId: 'standard-2026' },
        territories: base.content?.territories ?? {},
      },
      viewerKnowledge: { chartedTerritoryIds: [], apexFieldActivated: false },
    };
    expect(selectApexEmpireFieldPresentation(prologue).active).toBe(false);
    expect(selectApexEmpireFieldPresentation(engine(apex(0))).coverageTerritoryIds).toEqual([]);
  });
});
