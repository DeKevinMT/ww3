import { describe, expect, it } from 'vitest';
import {
  WAR_ACCESS_ASSAULT_MULTIPLIER,
  WAR_ACCESS_COST_MULTIPLIER,
  WAR_ACCESS_SUPPLY_MULTIPLIER,
  WAR_MOBILIZATION_TICKS,
} from './balance';
import { createWorldStateV2, openingConflictScheduleV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { STRATEGIC_SEA_ROUTE_PAIRS } from '../../game/data/worldMap';
import { assertInvariantsV2 } from './invariants';
import { selectWarAccessTypeV2, selectWarMobilizationCostV2 } from './selectors';
import { nationIdV2 } from './types';
import { declareWarV2, processWarsV2, supplyFactorV2 } from './war';
import { WorldEngineV2 } from './WorldEngineV2';

const bel = nationIdV2('bel');
const nld = nationIdV2('nld');
const gbr = nationIdV2('gbr');
const che = nationIdV2('che');
const chn = nationIdV2('chn');

describe('2026 conflicts and strategic naval warfare', () => {
  it('spreads three seed-varied opening conflicts across year one while crises damage countries immediately', () => {
    const state = createWorldStateV2(2026);
    expect(state.wars).toHaveLength(0);
    const schedule = openingConflictScheduleV2(2026, WORLD_CONTENT_V2);
    expect(schedule).toHaveLength(3);
    expect(schedule.map((entry) => entry.tick)).toEqual([...schedule.map((entry) => entry.tick)].sort((a, b) => a - b));
    expect(schedule[0]!.tick).toBeGreaterThanOrEqual(6);
    expect(schedule[2]!.tick).toBeLessThanOrEqual(50);
    expect(new Set(schedule.flatMap((entry) => [entry.attackerId, entry.defenderId])).size).toBe(6);
    expect(openingConflictScheduleV2(2027, WORLD_CONTENT_V2).map((entry) => `${entry.attackerId}:${entry.defenderId}`))
      .not.toEqual(schedule.map((entry) => `${entry.attackerId}:${entry.defenderId}`));

    const engine = new WorldEngineV2(2026);
    const seenStarts = new Map<string, number>();
    for (let week = 1; week <= 50; week += 1) {
      engine.step();
      for (const war of engine.state.wars) seenStarts.set(war.id, war.startedTick);
    }
    expect([...seenStarts.values()].sort((a, b) => a - b)).toEqual(schedule.map((entry) => entry.tick));

    const reports = state.events.map((event) => event.message);
    expect(reports.some((message) => message.includes('Sudan civil war'))).toBe(true);
    expect(reports.some((message) => message.includes('Myanmar conflict'))).toBe(true);
    expect(reports.some((message) => message.includes('Yemen conflict'))).toBe(true);
    expect(reports.some((message) => message.includes('Somalia conflict'))).toBe(true);
    expect(reports.some((message) => message.includes('Eastern DR Congo conflict'))).toBe(true);
    expect(state.territories[nationIdV2('sdn')]!.condition).toBeLessThan(0.70);
    assertInvariantsV2(state, WORLD_CONTENT_V2);
  }, 10_000);

  it('removes air attacks while keeping a broad naval network with free declarations', () => {
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
    expect(WAR_ACCESS_SUPPLY_MULTIPLIER.land).toBeGreaterThan(WAR_ACCESS_SUPPLY_MULTIPLIER.naval);
    expect(WAR_ACCESS_ASSAULT_MULTIPLIER.naval).toBe(WAR_ACCESS_ASSAULT_MULTIPLIER.land);
    expect(STRATEGIC_SEA_ROUTE_PAIRS.length).toBeGreaterThan(250);
  });

  it('creates a live naval front with weaker supply and a real battle pulse', () => {
    const state = createWorldStateV2(91);
    state.wars = [];
    state.players[bel]!.treasury = 10_000;
    const capital = state.players[bel]!.capitalId;
    const landSupply = supplyFactorV2(state, WORLD_CONTENT_V2, bel, capital, 'land');
    const navalSupply = supplyFactorV2(state, WORLD_CONTENT_V2, bel, capital, 'naval');
    expect(navalSupply).toBeLessThan(landSupply);
    expect(declareWarV2(state, WORLD_CONTENT_V2, bel, gbr).accepted).toBe(true);
    state.tick = WAR_MOBILIZATION_TICKS;
    const battles = processWarsV2(state, WORLD_CONTENT_V2);
    expect(battles).toHaveLength(1);
    expect(state.wars[0]?.attackerOperations[0]?.access).toBe('naval');
    // National research and local condition can still make an attacker better
    // supplied than its opponent. The identical-source comparison above proves
    // the route penalty; the live pulse confirms that it stays deliberately mild.
    expect(battles[0]!.attackerSupply).toBeGreaterThan(0.90);
    expect(battles[0]!.attackerSupply).toBeLessThanOrEqual(1);
    assertInvariantsV2(state, WORLD_CONTENT_V2);
  });
});
