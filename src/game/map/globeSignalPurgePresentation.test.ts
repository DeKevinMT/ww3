import { describe, expect, it } from 'vitest';
import type { MapTerritoryState, WorldMapEngineContract } from './bridge';
import { selectGlobeSignalPurgePresentation } from './globeSignalPurgePresentation';

function territory(
  id: string,
  ownerId: string,
  coreOwnerId: string,
  integration: number,
  transitOnly = false,
): MapTerritoryState {
  return {
    id,
    ownerId,
    coreOwnerId,
    integration,
    transitOnly,
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

function engine(): WorldMapEngineContract {
  const territories: Record<string, MapTerritoryState> = {
    grl: territory('grl', 'human', 'human', 1),
    gnb: territory('gnb', 'human', 'enemy', 0.32),
    sen: territory('sen', 'human', 'enemy', 0.74),
    can: territory('can', 'enemy', 'enemy', 1),
    usa: territory('usa', 'human', 'enemy', 0.15, true),
  };
  return {
    state: {
      tick: 4,
      humanPlayerId: 'human',
      humanPlayerIds: ['human'],
      openingMobilisations: {},
      territories,
      wars: [],
      logisticsMovements: [],
    },
    player: () => undefined,
    territoriesOf: (playerId) => Object.values(territories)
      .filter((entry) => entry.ownerId === playerId),
    globalRanking: () => [],
    activeWarBetween: () => undefined,
  };
}

describe('globe Signal Purge presentation', () => {
  it('shows only local unfinished purges and excludes Survival supply corridors', () => {
    const presentation = selectGlobeSignalPurgePresentation(engine());
    expect(presentation.active).toBe(true);
    expect(presentation.territories).toEqual([
      { territoryId: 'gnb', progress: 0.32, percent: 32 },
      { territoryId: 'sen', progress: 0.74, percent: 74 },
    ]);
  });

  it('keeps topology stable while canonical weekly progress advances', () => {
    const world = engine();
    const before = selectGlobeSignalPurgePresentation(world);
    world.state.territories.gnb!.integration = 0.39;
    const after = selectGlobeSignalPurgePresentation(world);
    expect(after.topologySignature).toBe(before.topologySignature);
    expect(after.territories[0]!.progress).toBe(0.39);
  });

  it('rebuilds topology only when the active territory set changes', () => {
    const world = engine();
    const before = selectGlobeSignalPurgePresentation(world);
    world.state.territories.gnb!.integration = 1;
    const after = selectGlobeSignalPurgePresentation(world);
    expect(after.topologySignature).not.toBe(before.topologySignature);
    expect(after.territories.map((entry) => entry.territoryId)).toEqual(['sen']);
  });
});

