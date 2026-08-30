import { describe, expect, it } from 'vitest';
import { WorldEngineV2 } from './WorldEngineV2';
import { autonomousAiVsAiWarCapV2 } from './ai';
import { TRUCE_TICKS } from './balance';
import {
  createWorldStateV2,
  openingConflictScheduleV2,
  processOpeningConflictsV2,
} from './bootstrap';
import { ROGUE_AI_NATION_ID_V2 } from './content';
import { createSaveV2, loadSaveV2 } from './persistence';
import { resolveScenarioV2 } from './scenarios';
import { reconcileSurvivalRogueFocusWarsV2 } from './survivalRogueFocus';
import { nationIdV2, type PeaceOfferV2, type WarStateV2 } from './types';

function testWarV2(
  id: string,
  attackerId: ReturnType<typeof nationIdV2>,
  defenderId: ReturnType<typeof nationIdV2>,
): WarStateV2 {
  return {
    id,
    attackerId,
    defenderId,
    startedTick: 0,
    lastBattleTick: 0,
    warScore: 0,
    battles: 0,
    attackerLosses: 0,
    defenderLosses: 0,
    attackerCivilianLosses: 0,
    defenderCivilianLosses: 0,
    lastPeaceOfferTick: -1_000_000,
    attackerOperations: [],
    defenderOperations: [],
    revenge: null,
  };
}

function testOfferV2(war: WarStateV2): PeaceOfferV2 {
  return {
    id: `offer-${war.id}`,
    fromId: war.attackerId,
    toId: war.defenderId,
    warId: war.id,
    settlement: 'reparations',
    createdTick: 0,
    expiresTick: 1_000,
    status: 'pending',
    cashAmount: 1,
  };
}

function createSurvivalTestWorldV2(seed: number) {
  const { content } = resolveScenarioV2({ mode: 'survival', seed });
  return { content, state: createWorldStateV2(seed, content) };
}

describe('Survival anti-Rogue focus', () => {
  it('never runs the Campaign opening-conflict schedule despite sharing its opening profile', () => {
    const { content, state } = createSurvivalTestWorldV2(92_001);
    expect(content.metadata).toMatchObject({
      scenarioId: 'survival',
      openingProfile: 'standard-2026',
    });
    expect(openingConflictScheduleV2(state.seed, content)).toEqual([]);

    state.tick = 1_000;
    const wars = state.wars;
    const events = state.events;
    expect(processOpeningConflictsV2(state, content)).toBe(false);
    expect(state.wars).toBe(wars);
    expect(state.events).toBe(events);
    expect(state.aiEscalation.openingConflictsStarted).toBe(0);
  });

  it('closes only background AI wars in one aggregate focus action and then stays allocation-free', () => {
    const { content, state } = createSurvivalTestWorldV2(92_002);
    state.tick = 24;
    const humanWar = testWarV2('war-human', state.humanPlayerId, nationIdV2('isl'));
    const rogueWar = testWarV2('war-rogue', ROGUE_AI_NATION_ID_V2, nationIdV2('arg'));
    const backgroundWars = [
      testWarV2('war-ai-1', nationIdV2('nld'), nationIdV2('deu')),
      testWarV2('war-ai-2', nationIdV2('fra'), nationIdV2('lux')),
    ];
    state.wars = [backgroundWars[0]!, humanWar, rogueWar, backgroundWars[1]!];
    state.offers = state.wars.map(testOfferV2);
    state.ceasefireObligations = state.wars.map((war) => ({
      warId: war.id,
      payerId: war.attackerId,
      payeeId: war.defenderId,
      weeklyCost: 1,
      startsTick: 0,
      expiresTick: 100,
    }));
    const eventCount = state.events.length;

    expect(reconcileSurvivalRogueFocusWarsV2(state, content)).toBe(2);
    expect(state.wars).toEqual([humanWar, rogueWar]);
    expect(state.offers).toEqual([]);
    expect(state.ceasefireObligations).toEqual([]);
    expect(state.truces).toEqual(expect.arrayContaining(backgroundWars.map((war) => ({
      leftId: war.attackerId < war.defenderId ? war.attackerId : war.defenderId,
      rightId: war.attackerId < war.defenderId ? war.defenderId : war.attackerId,
      expiresTick: state.tick + TRUCE_TICKS,
    }))));
    expect(state.events).toHaveLength(eventCount + 1);
    expect(state.events.at(-1)?.message).toContain('2 background AI campaigns');
    expect(autonomousAiVsAiWarCapV2(state, content, 190)).toBe(0);

    const stableReferences = {
      wars: state.wars,
      offers: state.offers,
      obligations: state.ceasefireObligations,
      truces: state.truces,
      events: state.events,
    };
    expect(reconcileSurvivalRogueFocusWarsV2(state, content)).toBe(0);
    expect(state.wars).toBe(stableReferences.wars);
    expect(state.offers).toBe(stableReferences.offers);
    expect(state.ceasefireObligations).toBe(stableReferences.obligations);
    expect(state.truces).toBe(stableReferences.truces);
    expect(state.events).toBe(stableReferences.events);
    expect(state.events).toHaveLength(eventCount + 1);
  });

  it('runs the reconciliation before the next Survival simulation pulse without event spam', () => {
    const { content } = resolveScenarioV2({ mode: 'survival', seed: 92_004 });
    const engine = new WorldEngineV2(92_004, content);
    engine.state.wars = [
      testWarV2('war-ai-tick', nationIdV2('nld'), nationIdV2('deu')),
    ];

    engine.step();
    expect(engine.state.wars.some((war) => war.id === 'war-ai-tick')).toBe(false);
    const focusEvents = () => engine.state.events.filter((event) => (
      event.message.startsWith('SURVIVAL FOCUS:')
    ));
    expect(focusEvents()).toHaveLength(1);

    engine.step();
    expect(focusEvents()).toHaveLength(1);
  });

  it('reconciles a stale Survival save once and persists the result idempotently', () => {
    const { content, state } = createSurvivalTestWorldV2(92_003);
    const backgroundWar = testWarV2('war-ai-save', nationIdV2('nld'), nationIdV2('deu'));
    const humanWar = testWarV2('war-human-save', state.humanPlayerId, nationIdV2('isl'));
    const rogueWar = testWarV2('war-rogue-save', ROGUE_AI_NATION_ID_V2, nationIdV2('arg'));
    state.wars = [backgroundWar, humanWar, rogueWar];
    const loaded = loadSaveV2(createSaveV2(state, content), content);
    expect(loaded.wars.map((war) => war.id)).toEqual(['war-human-save', 'war-rogue-save']);
    expect(loaded.offers).toEqual([]);
    expect(loaded.events).toHaveLength(1);
    expect(loaded.events.at(-1)?.message).toContain('1 background AI campaign');
    expect(reconcileSurvivalRogueFocusWarsV2(loaded, content)).toBe(0);
    expect(loaded.events).toHaveLength(1);

    const reloaded = loadSaveV2(createSaveV2(loaded, content), content);
    expect(reloaded.wars.map((war) => war.id)).toEqual(['war-human-save', 'war-rogue-save']);
    expect(reloaded.truces).toContainEqual({
      leftId: nationIdV2('deu'),
      rightId: nationIdV2('nld'),
      expiresTick: TRUCE_TICKS,
    });
  });
});
