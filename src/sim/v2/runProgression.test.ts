import { describe, expect, it } from 'vitest';
import { WorldEngineV2 } from './WorldEngineV2';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { canonicalStateHashV2, createSaveV2, loadSaveV2 } from './persistence';
import {
  chooseRunUpgradeV2,
  processRunProgressionMilestonesV2,
  runProgressionModeForContentV2,
  selectRunBuildSummaryV2,
  selectRunDraftV2,
  selectRunModifiersV2,
} from './runProgression';
import { resolveScenarioV2 } from './scenarios';

describe('retired timeline adaptation cards', () => {
  it('keeps the compatibility envelope disabled and never creates milestone offers', () => {
    for (const mode of ['standard-2026', 'survival', 'random-world'] as const) {
      const content = mode === 'standard-2026'
        ? WORLD_CONTENT_V2
        : resolveScenarioV2({ mode, seed: 73 }).content;
      const state = createWorldStateV2(73, content);
      state.tick = 1_000;
      state.polarEndgame.globalWave = 20;
      expect(runProgressionModeForContentV2(content)).toBe('disabled');
      expect(processRunProgressionMilestonesV2(state, content)).toBe(0);
      expect(selectRunDraftV2(state, state.humanPlayerId)).toBeNull();
      expect(state.runProgression.players[state.humanPlayerId]?.activeOffer).toBeNull();
    }
  });

  it('makes old card stacks exactly neutral and rejects legacy card commands', () => {
    const state = createWorldStateV2(74, WORLD_CONTENT_V2);
    const playerId = state.humanPlayerId;
    state.runProgression.players[playerId]!.stacks = {
      'combined-arms': 3,
      'field-hospitals': 3,
      'corps-shock-doctrine': 3,
    };
    expect(selectRunModifiersV2(state, playerId)).toEqual({
      nationalAttackMultiplier: 1,
      nationalDefenseMultiplier: 1,
      nationalCapacityMultiplier: 1,
      recruitmentMultiplier: 1,
      regularCasualtyMultiplier: 1,
      taxRevenueMultiplier: 1,
      navalSupplyMultiplier: 1,
      landSupplyMultiplier: 1,
      navalTransferThroughputMultiplier: 1,
      landTransferThroughputMultiplier: 1,
      navalTransferCostMultiplier: 1,
      frontSupplyFloorBonus: 0,
      commanderAttackBonus: 0,
      commanderDefenseBonus: 0,
      commanderSupplyMultiplier: 1,
    });
    expect(chooseRunUpgradeV2(state, playerId, 'legacy-offer', 'combined-arms'))
      .toMatchObject({ accepted: false, reason: expect.stringContaining('retired') });
  });

  it('scrubs pending legacy choices and stacks on load without losing scorched routing state', () => {
    const content = resolveScenarioV2({ mode: 'survival', seed: 75 }).content;
    const state = createWorldStateV2(75, content);
    const playerId = state.humanPlayerId;
    const save = createSaveV2(state, content) as any;
    save.runProgression.mode = 'survival';
    save.runProgression.nextOfferSequence = 8;
    save.runProgression.players[playerId] = {
      activeOffer: {
        id: 'run-draft:7:legacy', playerId, milestoneId: 'legacy',
        milestoneLabel: 'LEGACY CHOICE', milestoneKind: 'survival-wave',
        createdTick: 0,
        optionIds: ['combined-arms', 'continental-rail', 'field-hospitals'],
      },
      queuedMilestones: [],
      triggeredMilestoneIds: ['legacy'],
      picks: [],
      stacks: { 'combined-arms': 2 },
      recapturedScorchedTerritoryIds: [],
    };
    save.canonicalStateHash = canonicalStateHashV2(save);

    const loaded = loadSaveV2(save, content);
    expect(loaded.runProgression.mode).toBe('disabled');
    expect(loaded.runProgression.players[playerId]).toMatchObject({
      activeOffer: null,
      queuedMilestones: [],
      triggeredMilestoneIds: [],
      picks: [],
      stacks: {},
    });
    expect(loaded.runProgression.scorchedWorldTerritoryIds)
      .toEqual(state.runProgression.scorchedWorldTerritoryIds);
  });

  it('keeps the engine compatibility model empty and non-blocking', () => {
    const engine = new WorldEngineV2(76, WORLD_CONTENT_V2);
    const playerId = engine.state.humanPlayerId;
    expect(engine.runDraft(playerId)).toBeNull();
    expect(selectRunBuildSummaryV2(engine.state, playerId)).toMatchObject({
      mode: 'disabled', choicesMade: 0, queuedChoices: 0, pickedCards: [],
    });
    expect(engine.chooseRunUpgrade(playerId, 'old', 'combined-arms'))
      .toMatchObject({ accepted: false });
  });
});
