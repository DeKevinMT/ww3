import { describe, expect, it } from 'vitest';
import { COUNTRIES } from '../../data/worldMap';
import type {
  MapTerritoryState,
  WorldMapEngineContract,
} from '../bridge';
import {
  buildGlobeBorderPositions,
  globeBorderOwnershipSignature,
} from './globeBorders';

function engineWithOwner(ownerFor: (territoryId: string) => string): WorldMapEngineContract {
  const territories = Object.fromEntries(COUNTRIES.map((country) => {
    const ownerId = ownerFor(country.id);
    const territory: MapTerritoryState = {
      id: country.id,
      ownerId,
      coreOwnerId: ownerId,
      integration: 1,
      army: {
        manpower: 0,
        capacity: 0,
        combatStrength: 0,
        power: 0,
        attack: 0,
        defense: 0,
      },
    };
    return [country.id, territory];
  }));

  return {
    state: {
      tick: 0,
      humanPlayerId: '',
      humanPlayerIds: [],
      openingMobilisations: {},
      territories,
      wars: [],
      logisticsMovements: [],
    },
    player: () => undefined,
    territoriesOf: () => [],
    globalRanking: () => [],
    activeWarBetween: () => undefined,
  };
}

describe('globe border geometry', () => {
  it('deduplicates shared segments and places every endpoint just above the globe', () => {
    const radius = 5;
    const positions = buildGlobeBorderPositions(undefined, radius);
    const rawEdgeCount = COUNTRIES.reduce((countryTotal, country) => (
      countryTotal + country.rings.reduce((ringTotal, ring) => ringTotal + ring.length, 0)
    ), 0);

    expect(positions.length).toBeGreaterThan(0);
    expect(positions.length % 6).toBe(0);
    expect(positions.length / 6).toBeLessThan(rawEdgeCount);
    let minimumRadius = Number.POSITIVE_INFINITY;
    let maximumRadius = 0;
    for (let index = 0; index < positions.length; index += 3) {
      const length = Math.hypot(
        positions[index]!,
        positions[index + 1]!,
        positions[index + 2]!,
      );
      minimumRadius = Math.min(minimumRadius, length);
      maximumRadius = Math.max(maximumRadius, length);
    }
    expect(minimumRadius).toBeGreaterThan(radius * 1.00005);
    expect(maximumRadius).toBeLessThan(radius * 1.00011);
  });

  it('keeps canonical borders without an engine or when every country has a distinct owner', () => {
    const canonical = buildGlobeBorderPositions(undefined, 5);
    const distinctOwners = buildGlobeBorderPositions(engineWithOwner((id) => id), 5);
    expect(distinctOwners.length).toBe(canonical.length);
    expect([...distinctOwners.slice(0, 60)]).toEqual([...canonical.slice(0, 60)]);
  });

  it('removes only shared internal borders when territories have one owner', () => {
    const canonical = buildGlobeBorderPositions(undefined, 5);
    const unifiedWorld = buildGlobeBorderPositions(engineWithOwner(() => 'unified'), 5);

    expect(unifiedWorld.length).toBeGreaterThan(0);
    expect(unifiedWorld.length).toBeLessThan(canonical.length);
  });

  it('produces a stable ownership-only cache signature', () => {
    const first = engineWithOwner((id) => id);
    const second = engineWithOwner((id) => id);
    expect(globeBorderOwnershipSignature()).toBe('canonical');
    expect(globeBorderOwnershipSignature(first)).toBe(globeBorderOwnershipSignature(second));

    second.state.territories.bel!.ownerId = 'nld';
    expect(globeBorderOwnershipSignature(first)).not.toBe(globeBorderOwnershipSignature(second));
  });
});
