import { describe, expect, it } from 'vitest';
import type { WorldMapEngineContract } from './bridge';
import { selectRogueAntarcticFieldPresentation } from './rogueAntarcticFieldPresentation';

function engine(
  phase: 'dormant' | 'contact' | 'counteroffensive' | 'victory',
): WorldMapEngineContract {
  return {
    state: {
      tick: 0,
      humanPlayerId: 'human',
      humanPlayerIds: ['human'],
      openingMobilisations: {},
      territories: {
        usa: {
          id: 'usa',
          ownerId: 'rai',
          coreOwnerId: 'usa',
          integration: 1,
          army: { manpower: 1, capacity: 1, combatStrength: 1, power: 1, attack: 1, defense: 1 },
        },
      },
      wars: [],
      logisticsMovements: [],
      polarEndgame: {
        phase,
        visualRevision: 1,
        sectors: {
          'drake-entry': { status: 'available', integrity: 64, wave: 1 },
          'ross-entry': { status: 'secured', integrity: 0, wave: 1 },
          'zero-point-core': { status: 'contested', integrity: 100, wave: 3 },
        },
      },
    },
    player: () => undefined,
    territoriesOf: () => [],
    globalRanking: () => [],
    activeWarBetween: () => undefined,
  };
}

describe('Rogue Antarctic stronghold field', () => {
  it('covers only live machine Antarctic sectors and strengthens the core', () => {
    const field = selectRogueAntarcticFieldPresentation(engine('contact'));
    expect(field.active).toBe(true);
    expect(field.coverageTerritoryIds).toEqual(['drake-entry', 'zero-point-core']);
    expect(field.territories.find((territory) => territory.territoryId === 'drake-entry')?.intensity)
      .toBe(0.64);
    expect(field.territories.find((territory) => territory.core)?.intensity).toBe(1);
    expect(field.coverageTerritoryIds).not.toContain('usa');
  });

  it('stays hidden before awakening and vanishes after machine defeat', () => {
    expect(selectRogueAntarcticFieldPresentation(engine('dormant')).active).toBe(false);
    expect(selectRogueAntarcticFieldPresentation(engine('victory')).active).toBe(false);
  });

  it('quantizes strength so minor simulation noise cannot cause redraw churn', () => {
    const first = engine('counteroffensive');
    const second = engine('counteroffensive');
    first.state.polarEndgame!.sectors['drake-entry']!.integrity = 64.1;
    second.state.polarEndgame!.sectors['drake-entry']!.integrity = 63.7;
    expect(selectRogueAntarcticFieldPresentation(first).geometrySignature)
      .toBe(selectRogueAntarcticFieldPresentation(second).geometrySignature);
  });
});
