import { describe, expect, it } from 'vitest';
import { round } from './balance';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { synchronizeOpeningArmyHumanRosterV2 } from './nationState';
import {
  consumeOpeningArmyBonusLossV2,
  OPENING_ARMY_BONUS_DURATION_TICKS_V2,
  processOpeningArmyBonusDecayV2,
  selectOpeningArmyBonusRemainingV2,
} from './openingArmyBonus';
import {
  canonicalStateHashV2,
  createSaveV2,
  loadSaveV2,
} from './persistence';
import {
  selectRecruitmentThroughputV2,
  selectTotalManpowerV2,
} from './selectors';
import {
  humanStartingArmyMultiplierForContentV2,
} from './traits';
import { nationIdV2, type PlayerId, type WorldStateV2 } from './types';
import { WorldEngineV2 } from './WorldEngineV2';

const bel = nationIdV2('bel');
const grl = nationIdV2('grl');
const usa = nationIdV2('usa');

function deployedV2(state: WorldStateV2, playerId: PlayerId): number {
  return selectTotalManpowerV2(state, playerId).deployed;
}

function createOpeningEngineV2(seed: number, playerId = grl): WorldEngineV2 {
  const engine = new WorldEngineV2(seed, WORLD_CONTENT_V2);
  const configured = engine.configureHumanPlayers([playerId], playerId);
  if (!configured.accepted) throw new Error(configured.reason);
  return engine;
}

/** Applies a physical national loss; the production accounting helper is called separately. */
function removePhysicalManpowerV2(
  state: WorldStateV2,
  playerId: PlayerId,
  requestedLoss: number,
): number {
  let outstanding = Math.max(0, requestedLoss);
  let removed = 0;
  for (const territoryId of Object.keys(state.territories).sort()) {
    const territory = state.territories[territoryId]!;
    if (territory.owner !== playerId || outstanding <= 0) continue;
    const loss = Math.min(territory.army.manpower, outstanding);
    territory.army.manpower = round(territory.army.manpower - loss, 9);
    outstanding = round(outstanding - loss, 9);
    removed = round(removed + loss, 9);
  }
  return removed;
}

describe('temporary human opening-army bonus', () => {
  it('tracks only the free surplus above 1x while the sub-1x USA opening has no pool', () => {
    const weakState = createWorldStateV2(86_001, WORLD_CONTENT_V2);
    const weakBefore = selectTotalManpowerV2(weakState, grl);
    const weakTreasuryBefore = weakState.players[grl]!.treasury;
    const weakReservesBefore = weakState.players[grl]!.trainedReserves;

    synchronizeOpeningArmyHumanRosterV2(
      weakState,
      WORLD_CONTENT_V2,
      [bel],
      [grl],
    );

    const weakAfter = selectTotalManpowerV2(weakState, grl);
    const weakMultiplier = humanStartingArmyMultiplierForContentV2(WORLD_CONTENT_V2, grl);
    const weakBonus = weakState.players[grl]!.openingArmyBonus;
    expect(weakMultiplier).toBe(12);
    expect(weakAfter.deployed).toBeCloseTo(weakBefore.deployed * weakMultiplier, 7);
    expect(weakAfter.capacity).toBeCloseTo(weakBefore.capacity, 12);
    expect(weakState.players[grl]!.treasury).toBe(weakTreasuryBefore);
    expect(weakState.players[grl]!.trainedReserves).toBe(weakReservesBefore);
    expect(weakBonus).not.toBeNull();
    expect(weakBonus!.initialManpower).toBeCloseTo(
      weakAfter.deployed - weakBefore.deployed,
      8,
    );
    expect(weakBonus!.remainingManpower).toBe(weakBonus!.initialManpower);
    expect(weakBonus!.startedTick).toBe(0);
    expect(weakBonus!.expiresTick).toBe(OPENING_ARMY_BONUS_DURATION_TICKS_V2);

    const strongState = createWorldStateV2(86_002, WORLD_CONTENT_V2);
    const usaBefore = deployedV2(strongState, usa);
    synchronizeOpeningArmyHumanRosterV2(
      strongState,
      WORLD_CONTENT_V2,
      [bel],
      [usa],
    );
    expect(humanStartingArmyMultiplierForContentV2(WORLD_CONTENT_V2, usa)).toBe(0.5);
    expect(deployedV2(strongState, usa)).toBeCloseTo(usaBefore * 0.5, 7);
    expect(strongState.players[usa]!.openingArmyBonus).toBeNull();
  });

  it('retires an untouched opening surplus linearly: half at week 260 and none at week 520', () => {
    const engine = createOpeningEngineV2(86_003);
    const state = engine.state;
    const initial = state.players[grl]!.openingArmyBonus!.initialManpower;
    const ordinaryArmy = deployedV2(state, grl) - initial;

    state.tick = OPENING_ARMY_BONUS_DURATION_TICKS_V2 / 2;
    expect(processOpeningArmyBonusDecayV2(state, WORLD_CONTENT_V2))
      .toBeCloseTo(initial / 2, 7);
    expect(selectOpeningArmyBonusRemainingV2(state, grl)).toBeCloseTo(initial / 2, 7);
    expect(deployedV2(state, grl)).toBeCloseTo(ordinaryArmy + initial / 2, 7);

    state.tick = OPENING_ARMY_BONUS_DURATION_TICKS_V2;
    expect(processOpeningArmyBonusDecayV2(state, WORLD_CONTENT_V2))
      .toBeCloseTo(initial / 2, 7);
    expect(state.players[grl]!.openingArmyBonus).toBeNull();
    expect(deployedV2(state, grl)).toBeCloseTo(ordinaryArmy, 7);
  });

  it('consumes early physical casualties first and does not decay them twice before the calendar catches up', () => {
    const engine = createOpeningEngineV2(86_004);
    const state = engine.state;
    const initial = state.players[grl]!.openingArmyBonus!.initialManpower;
    const earlyLoss = round(initial / 2, 9);
    const beforeCasualty = deployedV2(state, grl);

    expect(removePhysicalManpowerV2(state, grl, earlyLoss)).toBeCloseTo(earlyLoss, 9);
    expect(consumeOpeningArmyBonusLossV2(state, grl, earlyLoss)).toBeCloseTo(earlyLoss, 9);
    const afterCasualty = deployedV2(state, grl);
    expect(afterCasualty).toBeCloseTo(beforeCasualty - earlyLoss, 8);
    expect(selectOpeningArmyBonusRemainingV2(state, grl)).toBeCloseTo(initial / 2, 8);

    state.tick = OPENING_ARMY_BONUS_DURATION_TICKS_V2 / 2 - 1;
    expect(processOpeningArmyBonusDecayV2(state, WORLD_CONTENT_V2)).toBe(0);
    expect(deployedV2(state, grl)).toBeCloseTo(afterCasualty, 9);

    state.tick += 1;
    expect(processOpeningArmyBonusDecayV2(state, WORLD_CONTENT_V2)).toBe(0);
    expect(deployedV2(state, grl)).toBeCloseTo(afterCasualty, 9);

    state.tick += 1;
    const firstCalendarRetirement = processOpeningArmyBonusDecayV2(state, WORLD_CONTENT_V2);
    expect(firstCalendarRetirement).toBeGreaterThan(0);
    expect(deployedV2(state, grl)).toBeCloseTo(
      afterCasualty - firstCalendarRetirement,
      6,
    );
  });

  it('allows ordinary recruitment after the temporary pool is lost without recreating that pool', () => {
    const engine = createOpeningEngineV2(86_005);
    const state = engine.state;
    const initial = state.players[grl]!.openingArmyBonus!.initialManpower;

    expect(removePhysicalManpowerV2(state, grl, initial)).toBeCloseTo(initial, 8);
    expect(consumeOpeningArmyBonusLossV2(state, grl, initial)).toBeCloseTo(initial, 8);
    expect(state.players[grl]!.openingArmyBonus).toBeNull();
    expect(selectRecruitmentThroughputV2(state, WORLD_CONTENT_V2, grl)).toBeGreaterThan(0);

    const beforeRecruitment = deployedV2(state, grl);
    state.aiEscalation.lastWarStartTick = state.tick;
    engine.step();
    expect(deployedV2(state, grl)).toBeGreaterThan(beforeRecruitment);
    expect(state.players[grl]!.openingArmyBonus).toBeNull();
  });

  it('round-trips week-137 metadata and stays hash-identical on subsequent deterministic steps', () => {
    const uninterrupted = createOpeningEngineV2(86_006);
    uninterrupted.state.tick = 137;
    processOpeningArmyBonusDecayV2(uninterrupted.state, WORLD_CONTENT_V2);
    const beforeSave = structuredClone(uninterrupted.state.players[grl]!.openingArmyBonus);
    expect(beforeSave).not.toBeNull();
    expect(beforeSave!.remainingManpower).toBeCloseTo(
      beforeSave!.initialManpower * (OPENING_ARMY_BONUS_DURATION_TICKS_V2 - 137)
        / OPENING_ARMY_BONUS_DURATION_TICKS_V2,
      8,
    );

    const resumed = WorldEngineV2.fromSave(uninterrupted.save(), WORLD_CONTENT_V2);
    expect(resumed.state.players[grl]!.openingArmyBonus).toEqual(beforeSave);
    expect(resumed.canonicalHash()).toBe(uninterrupted.canonicalHash());

    for (let offset = 1; offset <= 3; offset += 1) {
      uninterrupted.step();
      resumed.step();
      expect(resumed.canonicalHash(), `post-load hash +${offset}`)
        .toBe(uninterrupted.canonicalHash());
    }
  }, 30_000);

  it('reconstructs v2.61 tick-zero tracking without multiplying its already-boosted army again', () => {
    const engine = createOpeningEngineV2(86_007);
    const boostedBeforeSave = deployedV2(engine.state, grl);
    const multiplier = humanStartingArmyMultiplierForContentV2(WORLD_CONTENT_V2, grl);
    const legacy = structuredClone(
      createSaveV2(engine.state, WORLD_CONTENT_V2),
    ) as Record<string, any>;
    legacy.rulesVersion = 'frontier-command-v2.61-random-world';
    for (const nation of Object.values(legacy.players) as Array<Record<string, any>>) {
      delete nation.openingArmyBonus;
    }
    legacy.canonicalStateHash = canonicalStateHashV2(legacy);

    const loaded = loadSaveV2(legacy as never, WORLD_CONTENT_V2);
    const reconstructed = loaded.players[grl]!.openingArmyBonus;
    expect(deployedV2(loaded, grl)).toBeCloseTo(boostedBeforeSave, 9);
    expect(reconstructed).not.toBeNull();
    expect(reconstructed!.initialManpower).toBeCloseTo(
      boostedBeforeSave - boostedBeforeSave / multiplier,
      8,
    );
    expect(reconstructed!.remainingManpower).toBe(reconstructed!.initialManpower);
    expect(reconstructed!.startedTick).toBe(0);
    expect(reconstructed!.expiresTick).toBe(OPENING_ARMY_BONUS_DURATION_TICKS_V2);
  });
});
