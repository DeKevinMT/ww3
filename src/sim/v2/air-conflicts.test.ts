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
import { addWorldEventV2, pruneWorldHistoryV2 } from './events';
import { STRATEGIC_SEA_ROUTE_PAIRS } from '../../game/data/worldMap';
import { assertInvariantsV2 } from './invariants';
import {
  LAND_ARMY_CAPACITY_SUPPLY_SHARE_V2,
  NAVAL_ARMY_CAPACITY_SUPPLY_SHARE_V2,
} from './logistics';
import { canonicalStateHashV2, createSaveV2, loadSaveV2 } from './persistence';
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
import { WorldEngineV2 } from './WorldEngineV2';
import {
  acknowledgeCampaignBlackoutForTestV2,
  enterPostBlackoutCampaignForTestV2,
} from './testSupport';

const bel = nationIdV2('bel');
const nld = nationIdV2('nld');
const gbr = nationIdV2('gbr');
const che = nationIdV2('che');
const chn = nationIdV2('chn');

describe('2026 conflicts and strategic naval warfare', () => {
  it('stages one seed-varied proof-of-manipulation war after the blackout', () => {
    const state = createWorldStateV2(2026);
    expect(state.wars).toHaveLength(0);
    const schedule = openingConflictScheduleV2(2026, WORLD_CONTENT_V2);
    expect(schedule).toHaveLength(1);
    expect(schedule.map((entry) => entry.tick)).toEqual([...schedule.map((entry) => entry.tick)].sort((a, b) => a - b));
    expect(schedule[0]!.tick).toBeGreaterThanOrEqual(6);
    expect(schedule[0]!.tick).toBeLessThanOrEqual(8);
    expect(new Set(schedule.flatMap((entry) => [entry.attackerId, entry.defenderId])).size).toBe(2);
    expect(openingConflictScheduleV2(2027, WORLD_CONTENT_V2).map((entry) => `${entry.attackerId}:${entry.defenderId}`))
      .not.toEqual(schedule.map((entry) => `${entry.attackerId}:${entry.defenderId}`));

    const engine = new WorldEngineV2(2026);
    for (let week = 0; week < 20; week += 1) engine.step();
    expect(engine.state.wars).toHaveLength(0);
    const blackoutTick = engine.state.tick;
    acknowledgeCampaignBlackoutForTestV2(engine.state);
    const seenStarts = new Map<string, number>();
    for (let week = 1; week <= 94; week += 1) {
      engine.step();
      for (const war of engine.state.wars) seenStarts.set(war.id, war.startedTick);
    }
    expect([...seenStarts.values()].sort((a, b) => a - b)).toEqual(
      schedule.map((entry) => blackoutTick + entry.tick),
    );

    const reports = state.events.map((event) => event.message);
    expect(reports.some((message) => message.includes('Sudan civil war'))).toBe(true);
    expect(reports.some((message) => message.includes('Myanmar conflict'))).toBe(true);
    expect(reports.some((message) => message.includes('Yemen conflict'))).toBe(true);
    expect(reports.some((message) => message.includes('Somalia conflict'))).toBe(true);
    expect(reports.some((message) => message.includes('Eastern DR Congo conflict'))).toBe(true);
    expect(state.territories[nationIdV2('sdn')]).not.toHaveProperty('condition');
    assertInvariantsV2(state, WORLD_CONTENT_V2);
  }, 20_000);

  it('falls back deterministically when the scheduled attacker cannot fund the conflict', () => {
    const blockedState = createWorldStateV2(2026);
    const blockedScenario = openingConflictScheduleV2(blockedState.seed, WORLD_CONTENT_V2)[0]!;
    blockedState.tick = blockedScenario.tick;
    acknowledgeCampaignBlackoutForTestV2(blockedState);
    blockedState.polarEndgame.communicationsBlackoutTick = 0;
    synchronizeArmyCapacityV2(blockedState, WORLD_CONTENT_V2);
    blockedState.players[blockedScenario.attackerId]!.treasury = -0.001;
    expect(processOpeningConflictsV2(blockedState, WORLD_CONTENT_V2)).toBe(true);
    expect(blockedState.wars).toHaveLength(1);
    expect(blockedState.wars[0]?.attackerId).not.toBe(blockedScenario.attackerId);
    expect(blockedState.events.at(-1)?.message).toContain('MANIPULATED CONFLICT');

    const solventState = createWorldStateV2(2026);
    const solventScenario = openingConflictScheduleV2(solventState.seed, WORLD_CONTENT_V2)[0]!;
    solventState.tick = solventScenario.tick;
    acknowledgeCampaignBlackoutForTestV2(solventState);
    solventState.polarEndgame.communicationsBlackoutTick = 0;
    synchronizeArmyCapacityV2(solventState, WORLD_CONTENT_V2);
    solventState.players[solventScenario.attackerId]!.treasury = 0;

    expect(processOpeningConflictsV2(solventState, WORLD_CONTENT_V2)).toBe(true);

    expect(solventState.wars).toHaveLength(1);
    expect(solventState.wars[0]).toMatchObject({
      attackerId: solventScenario.attackerId,
      defenderId: solventScenario.defenderId,
      startedTick: solventScenario.tick,
    });
    expect(solventState.aiEscalation.lastWarStartTick).toBe(solventScenario.tick);
    assertInvariantsV2(solventState, WORLD_CONTENT_V2);
  });

  it('never replays the scripted opening conflict after its event report is pruned', () => {
    const state = createWorldStateV2(2026);
    const scenario = openingConflictScheduleV2(state.seed, WORLD_CONTENT_V2)[0]!;
    state.tick = scenario.tick;
    acknowledgeCampaignBlackoutForTestV2(state);
    state.polarEndgame.communicationsBlackoutTick = 0;

    expect(processOpeningConflictsV2(state, WORLD_CONTENT_V2)).toBe(true);
    expect(state.aiEscalation.openingConflictsStarted).toBe(1);

    for (let index = 0; index < 300; index += 1) {
      addWorldEventV2(state, 'system', 'info', `Archived world update ${index}.`);
    }
    pruneWorldHistoryV2(state);
    expect(state.events.some((event) => event.message.startsWith('MANIPULATED CONFLICT ·')))
      .toBe(false);

    state.wars = [];
    state.tick += 1;
    expect(processOpeningConflictsV2(state, WORLD_CONTENT_V2)).toBe(false);
    expect(state.wars).toHaveLength(0);

    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const reconnected = loadSaveV2(createSaveV2(state, WORLD_CONTENT_V2), WORLD_CONTENT_V2);
    expect(reconnected.aiEscalation.openingConflictsStarted).toBe(1);
    expect(processOpeningConflictsV2(reconnected, WORLD_CONTENT_V2)).toBe(false);
    expect(reconnected.wars).toHaveLength(0);
  });

  it('infers the durable opening-conflict marker for authenticated pre-marker saves', () => {
    const state = createWorldStateV2(2026);
    const scenario = openingConflictScheduleV2(state.seed, WORLD_CONTENT_V2)[0]!;
    state.tick = scenario.tick;
    acknowledgeCampaignBlackoutForTestV2(state);
    state.polarEndgame.communicationsBlackoutTick = 0;
    expect(processOpeningConflictsV2(state, WORLD_CONTENT_V2)).toBe(true);

    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const legacy = structuredClone(createSaveV2(state, WORLD_CONTENT_V2)) as unknown as Record<string, any>;
    delete legacy.aiEscalation.openingConflictsStarted;
    legacy.canonicalStateHash = canonicalStateHashV2(legacy);

    const loaded = loadSaveV2(legacy as never, WORLD_CONTENT_V2);
    expect(loaded.aiEscalation.openingConflictsStarted).toBe(1);
    loaded.wars = [];
    loaded.tick += 1;
    expect(processOpeningConflictsV2(loaded, WORLD_CONTENT_V2)).toBe(false);
    expect(loaded.wars).toHaveLength(0);
  });

  it('never lets a scripted AI-only opening conflict control or target a human seat', () => {
    for (const protectedSide of ['attackerId', 'defenderId'] as const) {
      const state = createWorldStateV2(2026);
      const scenario = openingConflictScheduleV2(state.seed, WORLD_CONTENT_V2)[0]!;
      state.tick = scenario.tick;
      state.humanPlayerId = scenario[protectedSide];
      state.humanPlayerIds = [scenario[protectedSide]];
      acknowledgeCampaignBlackoutForTestV2(state);
      state.polarEndgame.communicationsBlackoutTick = 0;

      expect(processOpeningConflictsV2(state, WORLD_CONTENT_V2)).toBe(true);

      expect(state.wars).toHaveLength(1);
      expect(state.wars[0]?.attackerId).not.toBe(state.humanPlayerId);
      expect(state.wars[0]?.defenderId).not.toBe(state.humanPlayerId);
    }
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
    expect(LAND_ARMY_CAPACITY_SUPPLY_SHARE_V2).toBe(0.08);
    expect(NAVAL_ARMY_CAPACITY_SUPPLY_SHARE_V2).toBe(0.04);
    expect(WAR_ACCESS_ASSAULT_MULTIPLIER.naval).toBe(WAR_ACCESS_ASSAULT_MULTIPLIER.land);
    expect(STRATEGIC_SEA_ROUTE_PAIRS.length).toBeGreaterThan(100);
    expect(STRATEGIC_SEA_ROUTE_PAIRS.length).toBeLessThan(170);
  });

  it('creates a live naval front with half the field budget and a real battle pulse', () => {
    const state = createWorldStateV2(91);
    state.wars = [];
    enterPostBlackoutCampaignForTestV2(state);
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
    // Readiness is fulfilment of the smaller naval budget, not a hidden
    // distance or research penalty layered over the battle.
    expect(battles[0]!.attackerSupply).toBe(navalQuote.readiness);
    assertInvariantsV2(state, WORLD_CONTENT_V2);
  });
});
