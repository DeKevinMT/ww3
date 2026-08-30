import { describe, expect, it } from 'vitest';
import {
  STALE_WAR_TICKS,
  TRUCE_TICKS,
  WAR_CAMPAIGN_MAX_TICKS,
  WAR_CAPTURE_CONSOLIDATION_TICKS,
  WAR_MOBILIZATION_TICKS,
  WAR_REVENGE_WINDOW_TICKS,
} from './balance';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { invalidateTerritoryIndexV2 } from './selectors';
import { nationIdV2, territoryIdV2, type WorldStateV2 } from './types';
import { declareWarV2, hasLegalWarFrontV2, processWarsV2 } from './war';
import { enterPostBlackoutCampaignForTestV2 } from './testSupport';

const bel = nationIdV2('bel');
const nld = nationIdV2('nld');
const deu = nationIdV2('deu');
const belTerritory = territoryIdV2('bel');
const nldTerritory = territoryIdV2('nld');
const deuTerritory = territoryIdV2('deu');
const luxTerritory = territoryIdV2('lux');
const defenderTerritories = [nldTerritory, deuTerritory, luxTerritory] as const;

function conquerFirstTerritory(seed: number): { state: WorldStateV2; warId: string } {
  const state = createWorldStateV2(seed);
  state.wars = [];
  state.offers = [];
  state.truces = [];
  enterPostBlackoutCampaignForTestV2(state);
  state.players[bel]!.treasury = 1_000_000;

  // Three connected holdings produce a two-territory formal attacker goal.
  for (const territoryId of [deuTerritory, luxTerritory]) {
    state.territories[territoryId]!.owner = nld;
    state.territories[territoryId]!.coreOwner = nld;
    state.territories[territoryId]!.integration = 1;
    delete state.territories[territoryId]!.integrationProgram;
  }
  for (const territoryId of defenderTerritories) {
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

  expect(firstRound.filter((battle) => battle.conquered)).toHaveLength(1);
  expect(defenderTerritories.filter((id) => state.territories[id]!.owner === nld)).toHaveLength(2);
  expect(state.wars.some((war) => war.id === active.id)).toBe(true);
  expect(active.revenge).toEqual({
    claimantId: nld,
    triggeredTick: state.tick,
    expiresTick: state.tick + WAR_REVENGE_WINDOW_TICKS,
  });
  expect(active.campaign).toEqual({
    attackerObjective: 2,
    defenderObjective: 1,
    attackerCaptures: 1,
    defenderCaptures: 0,
    consolidationUntilTick: state.tick + WAR_CAPTURE_CONSOLIDATION_TICKS,
    expiresTick: active.startedTick + WAR_CAMPAIGN_MAX_TICKS,
  });
  return { state, warId: active.id };
}

describe('V2 bounded multi-territory campaigns', () => {
  it('pauses after one capture, then lets a dominant attacker complete a two-territory objective', () => {
    const { state, warId } = conquerFirstTerritory(8_230_100);
    state.tick += 2;
    expect(processWarsV2(state, WORLD_CONTENT_V2)).toEqual([]);
    expect(state.wars.some((war) => war.id === warId)).toBe(true);

    state.tick += WAR_CAPTURE_CONSOLIDATION_TICKS - 2;
    const continuation = processWarsV2(state, WORLD_CONTENT_V2);
    expect(continuation.some((battle) => battle.attackerId === bel && battle.conquered)).toBe(true);
    expect(state.wars.some((war) => war.id === warId)).toBe(false);
    expect(defenderTerritories.filter((id) => state.territories[id]!.owner === nld)).toHaveLength(1);
    expect(state.truces.some((truce) => (
      (truce.leftId === bel && truce.rightId === nld)
        || (truce.leftId === nld && truce.rightId === bel)
    ))).toBe(true);
  });

  it('lets one successful defender capture end the counteroffensive without flip spam', () => {
    const { state, warId } = conquerFirstTerritory(8_230_101);
    const active = state.wars.find((war) => war.id === warId)!;
    for (const territory of Object.values(state.territories)) {
      if (territory.owner === bel) territory.army.manpower = 0;
      if (territory.owner === nld) {
        territory.army.manpower = territory.army.capacity;
        territory.army.baseAttack = 2;
        territory.army.baseDefense = 2;
      }
    }
    state.tick = active.campaign!.consolidationUntilTick;
    const counteroffensive = processWarsV2(state, WORLD_CONTENT_V2);

    expect(counteroffensive.some((battle) => battle.attackerId === nld && battle.conquered)).toBe(true);
    expect(state.wars.some((war) => war.id === warId)).toBe(false);
  });

  it('closes a stale campaign through the no-legal-battle rule', () => {
    const { state, warId } = conquerFirstTerritory(8_230_102);
    const active = state.wars.find((war) => war.id === warId)!;
    state.tick = active.lastBattleTick + STALE_WAR_TICKS;

    processWarsV2(state, WORLD_CONTENT_V2);

    expect(state.wars.some((war) => war.id === warId)).toBe(false);
    expect(state.truces).toHaveLength(1);
    expect(state.events.at(-1)?.message).toContain('without a legal battle front');
  });

  it('ends an ordinary legal front exactly at the five-year campaign boundary', () => {
    const state = createWorldStateV2(8_230_103);
    state.wars = [];
    state.offers = [];
    state.truces = [];
    enterPostBlackoutCampaignForTestV2(state);
    state.players[bel]!.treasury = 1_000_000;
    expect(declareWarV2(state, WORLD_CONTENT_V2, bel, nld).accepted).toBe(true);
    const active = state.wars.find((war) => war.attackerId === bel && war.defenderId === nld)!;
    expect(WAR_CAMPAIGN_MAX_TICKS).toBe(260);
    expect(active.campaign!.expiresTick - active.startedTick).toBe(WAR_CAMPAIGN_MAX_TICKS);

    state.tick = active.campaign!.expiresTick;
    active.lastBattleTick = state.tick - 1;
    expect(hasLegalWarFrontV2(state, WORLD_CONTENT_V2, bel, nld)
      || hasLegalWarFrontV2(state, WORLD_CONTENT_V2, nld, bel)).toBe(true);

    processWarsV2(state, WORLD_CONTENT_V2);

    expect(state.wars.some((war) => war.id === active.id)).toBe(false);
    expect(state.truces).toEqual([{
      leftId: bel,
      rightId: nld,
      expiresTick: state.tick + TRUCE_TICKS,
    }]);
    expect(state.events.at(-1)?.message).toContain('five-year campaign window ended');
  });
});
