import { describe, expect, it } from 'vitest';
import { WAR_MOBILIZATION_TICKS, WAR_REVENGE_WINDOW_TICKS } from './balance';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { invalidateTerritoryIndexV2 } from './selectors';
import { nationIdV2, territoryIdV2, type WorldStateV2 } from './types';
import { declareWarV2, processWarsV2 } from './war';

const bel = nationIdV2('bel');
const nld = nationIdV2('nld');
const deu = nationIdV2('deu');
const belTerritory = territoryIdV2('bel');
const nldTerritory = territoryIdV2('nld');
const deuTerritory = territoryIdV2('deu');

function conquerFirstTerritory(seed: number): { state: WorldStateV2; warId: string } {
  const state = createWorldStateV2(seed);
  state.wars = [];
  state.offers = [];
  state.truces = [];
  state.players[bel]!.treasury = 1_000_000;

  // Give the defender a second connected holding so losing the Netherlands is
  // a territorial defeat, not national elimination.
  state.territories[deuTerritory]!.owner = nld;
  state.territories[deuTerritory]!.coreOwner = nld;
  state.territories[deuTerritory]!.integration = 1;
  delete state.territories[deuTerritory]!.integrationProgram;
  for (const territoryId of [nldTerritory, deuTerritory]) {
    state.territories[territoryId]!.army.manpower = 0;
  }
  state.territories[belTerritory]!.army = {
    ...state.territories[belTerritory]!.army,
    manpower: 1,
    capacity: 1,
    baseAttack: 2,
    baseDefense: 2,
  };
  invalidateTerritoryIndexV2(state);

  expect(declareWarV2(state, WORLD_CONTENT_V2, bel, nld).accepted).toBe(true);
  const active = state.wars.find((war) => war.attackerId === bel && war.defenderId === nld)!;
  state.tick = active.startedTick + WAR_MOBILIZATION_TICKS;
  const firstRound = processWarsV2(state, WORLD_CONTENT_V2);

  expect(firstRound.some((battle) => battle.targetId === nldTerritory && battle.conquered)).toBe(true);
  expect(state.territories[nldTerritory]!.owner).toBe(bel);
  expect(state.wars.some((war) => war.id === active.id)).toBe(true);
  expect(active.revenge).toEqual({
    claimantId: nld,
    triggeredTick: state.tick,
    expiresTick: state.tick + WAR_REVENGE_WINDOW_TICKS,
  });
  return { state, warId: active.id };
}

describe('V2 bounded empire retaliation', () => {
  it('keeps the war active and gives the victim initiative toward one enemy core', () => {
    const { state, warId } = conquerFirstTerritory(8_230_100);

    // Remove the conqueror's remaining field army and restore one German army
    // for the Dutch empire. Germany borders both the captured Netherlands and
    // Belgium; retaliation must prefer Belgium's core over flipping the same
    // Dutch territory straight back.
    for (const territory of Object.values(state.territories)) {
      if (territory.owner === bel) territory.army.manpower = 0;
    }
    state.territories[deuTerritory]!.army = {
      ...state.territories[deuTerritory]!.army,
      manpower: 1,
      capacity: 1,
      baseAttack: 2,
      baseDefense: 2,
    };
    state.tick += 2;
    const retaliation = processWarsV2(state, WORLD_CONTENT_V2);

    expect(retaliation.some((battle) => (
      battle.warId === warId
        && battle.attackerId === nld
        && battle.targetId === belTerritory
        && battle.conquered
    ))).toBe(true);
    expect(state.wars.some((war) => war.id === warId)).toBe(false);
    expect(state.truces.some((truce) => (
      (truce.leftId === bel && truce.rightId === nld)
        || (truce.leftId === nld && truce.rightId === bel)
    ))).toBe(true);
  });

  it('ends the special phase at one fixed deadline without rearming revenge', () => {
    const { state, warId } = conquerFirstTerritory(8_230_101);
    const active = state.wars.find((war) => war.id === warId)!;
    state.tick = active.revenge!.expiresTick;

    processWarsV2(state, WORLD_CONTENT_V2);

    expect(state.wars.some((war) => war.id === warId)).toBe(false);
    expect(state.truces).toHaveLength(1);
  });
});
