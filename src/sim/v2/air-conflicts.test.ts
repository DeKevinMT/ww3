import { describe, expect, it } from 'vitest';
import {
  WAR_ACCESS_ASSAULT_MULTIPLIER,
  WAR_ACCESS_COST_MULTIPLIER,
  WAR_MOBILIZATION_TICKS,
} from './balance';
import {
  createWorldStateV2,
  openingConflictScheduleV2,
  processOpeningConflictsV2,
} from './bootstrap';
import { synchronizeArmyCapacityV2 } from './capacity';
import { WORLD_CONTENT_V2 } from './content';
import { STRATEGIC_SEA_ROUTE_PAIRS } from '../../game/data/worldMap';
import { assertInvariantsV2 } from './invariants';
import {
  LAND_ARMY_CAPACITY_SUPPLY_SHARE_V2,
  NAVAL_ARMY_CAPACITY_SUPPLY_SHARE_V2,
} from './logistics';
import {
  selectCanonicalWarFrontV2,
  selectWarAccessTypeV2,
  selectWarMobilizationCostV2,
} from './selectors';
import { nationIdV2 } from './types';
import {
  declareWarV2,
  frontCapacitySupplyQuoteV2,
  processWarsV2,
} from './war';

const bel = nationIdV2('bel');
const nld = nationIdV2('nld');
const gbr = nationIdV2('gbr');
const che = nationIdV2('che');
const chn = nationIdV2('chn');

describe('2026 conflicts and strategic naval warfare', () => {
  it('keeps the retired proof-conflict schedule deterministic without dispatching it', () => {
    const state = createWorldStateV2(2026);
    const schedule = openingConflictScheduleV2(2026, WORLD_CONTENT_V2);
    expect(schedule).toHaveLength(1);
    expect(schedule[0]!.tick).toBeGreaterThanOrEqual(6);
    expect(schedule[0]!.tick).toBeLessThanOrEqual(8);
    expect(openingConflictScheduleV2(2027, WORLD_CONTENT_V2)
      .map((entry) => `${entry.attackerId}:${entry.defenderId}`))
      .not.toEqual(schedule.map((entry) => `${entry.attackerId}:${entry.defenderId}`));

    state.tick = schedule[0]!.tick + 100;
    expect(processOpeningConflictsV2(state, WORLD_CONTENT_V2)).toBe(false);
    expect(state.wars).toEqual([]);
    expect(state.aiEscalation.openingConflictsStarted).toBe(0);
    expect(state.events.some((event) => event.message.startsWith('MANIPULATED CONFLICT ·')))
      .toBe(false);
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    assertInvariantsV2(state, WORLD_CONTENT_V2);
  });

  it('removes air attacks while keeping a bounded regional naval network with free declarations', () => {
    const state = createWorldStateV2(77);
    state.wars = [];
    expect(selectWarAccessTypeV2(state, WORLD_CONTENT_V2, bel, nld)).toBe('land');
    expect(selectWarAccessTypeV2(state, WORLD_CONTENT_V2, bel, gbr)).toBe('naval');
    expect(selectWarAccessTypeV2(state, WORLD_CONTENT_V2, bel, che)).toBe('none');
    expect(selectWarAccessTypeV2(state, WORLD_CONTENT_V2, bel, chn)).toBe('none');
    const navalCost = selectWarMobilizationCostV2(state, WORLD_CONTENT_V2, bel, gbr);
    const landCost = selectWarMobilizationCostV2(state, WORLD_CONTENT_V2, bel, nld);
    expect(navalCost).toBe(0);
    expect(landCost).toBe(0);
    expect(WAR_ACCESS_COST_MULTIPLIER.naval).toBeGreaterThan(WAR_ACCESS_COST_MULTIPLIER.land);
    expect(LAND_ARMY_CAPACITY_SUPPLY_SHARE_V2).toBe(0.10);
    expect(NAVAL_ARMY_CAPACITY_SUPPLY_SHARE_V2).toBe(0.05);
    expect(WAR_ACCESS_ASSAULT_MULTIPLIER.naval).toBe(WAR_ACCESS_ASSAULT_MULTIPLIER.land);
    expect(STRATEGIC_SEA_ROUTE_PAIRS.length).toBeGreaterThan(100);
    expect(STRATEGIC_SEA_ROUTE_PAIRS.length).toBeLessThan(170);
  });

  it('creates a live naval front with half the field budget and a real battle pulse', () => {
    const state = createWorldStateV2(91);
    state.wars = [];
    state.players[bel]!.treasury = 10_000;
    const capital = state.players[bel]!.capitalId;
    const landQuote = frontCapacitySupplyQuoteV2(state, capital, 'land');
    const navalQuote = frontCapacitySupplyQuoteV2(state, capital, 'naval');
    expect(landQuote.readiness).toBe(1);
    expect(navalQuote.readiness).toBe(1);
    expect(navalQuote.capacityBudget).toBeCloseTo(landQuote.capacityBudget * 0.5, 9);
    expect(declareWarV2(state, WORLD_CONTENT_V2, bel, gbr).accepted).toBe(true);
    state.tick = WAR_MOBILIZATION_TICKS;
    const battles = processWarsV2(state, WORLD_CONTENT_V2);
    expect(battles).toHaveLength(1);
    expect(state.wars[0] && selectCanonicalWarFrontV2(state.wars[0])?.access).toBe('naval');
    expect(battles[0]!.attackerSupply).toBe(navalQuote.readiness);
    assertInvariantsV2(state, WORLD_CONTENT_V2);
  });
});
