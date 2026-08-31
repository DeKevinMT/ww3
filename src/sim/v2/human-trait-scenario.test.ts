import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { synchronizeArmyCapacityV2 } from './capacity';
import {
  isHumanSelectableNationV2,
  normalOpeningManpowerMultiplierV2,
  WORLD_CONTENT_V2,
} from './content';
import { synchronizeOpeningArmyHumanRosterV2 } from './nationState';
import { OPENING_ARMY_BONUS_DURATION_TICKS_V2 } from './openingArmyBonus';
import { resolveScenarioV2 } from './scenarios';
import { selectTotalManpowerV2 } from './selectors';
import { traitNationContextV2 } from './traitContext';
import {
  HUMAN_BROAD_UNDERDOG_ARMY_MULTIPLIER_ENDPOINT_V2,
  HUMAN_BROAD_UNDERDOG_COUNT_V2,
  HUMAN_EXTREME_UNDERDOG_COUNT_V2,
  HUMAN_MILITARY_RANK_CURVE_EXPONENT_V2,
  HUMAN_STARTING_ARMY_BASE_CURVE_WEAKEST_MULTIPLIER_V2,
  HUMAN_STARTING_ARMY_MULTIPLIER_STRONGEST_V2,
  HUMAN_STARTING_ARMY_MULTIPLIER_WEAKEST_V2,
  HUMAN_TRAIT_MULTIPLIER_STRONGEST_V2,
  HUMAN_TRAIT_MULTIPLIER_WEAKEST_V2,
  humanCountryTraitMultiplierForContentV2,
  humanOpeningReserveMultiplierForContentV2,
  humanOpeningTrainedReserveTermsForContentV2,
  humanStartingArmyBaseCurveMultiplierForContentV2,
  humanStartingArmyMultiplierForContentV2,
  openingMilitaryOrderForContentV2,
  openingMilitaryRankForContentV2,
} from './traits';
import type { PlayerId, WorldStateV2 } from './types';
import { WorldEngineV2 } from './WorldEngineV2';

function deployedV2(state: WorldStateV2, playerId: PlayerId): number {
  return selectTotalManpowerV2(state, playerId).deployed;
}

describe('scenario-aware retired trait and opening-force curve', () => {
  it('keeps old country-specific opening roster gifts disabled for every seat', () => {
    expect(normalOpeningManpowerMultiplierV2('bel')).toBe(1);
    expect(normalOpeningManpowerMultiplierV2('nld')).toBe(1);
  });

  it('keeps Standard ranking, neutral traits and the separate 0.05x–50x force curve', () => {
    const order = openingMilitaryOrderForContentV2(WORLD_CONTENT_V2);
    const strongest = order[0]!;
    const weakest = order.at(-1)!;
    expect(strongest).toBe('usa');
    expect(weakest).toBe('grl');
    expect(humanCountryTraitMultiplierForContentV2(WORLD_CONTENT_V2, strongest))
      .toBeCloseTo(HUMAN_TRAIT_MULTIPLIER_STRONGEST_V2, 12);
    expect(humanCountryTraitMultiplierForContentV2(WORLD_CONTENT_V2, weakest))
      .toBeCloseTo(HUMAN_TRAIT_MULTIPLIER_WEAKEST_V2, 12);
    expect(humanStartingArmyMultiplierForContentV2(WORLD_CONTENT_V2, strongest))
      .toBeCloseTo(HUMAN_STARTING_ARMY_MULTIPLIER_STRONGEST_V2, 12);
    expect(humanStartingArmyMultiplierForContentV2(WORLD_CONTENT_V2, weakest))
      .toBeCloseTo(HUMAN_STARTING_ARMY_MULTIPLIER_WEAKEST_V2, 12);
    expect(HUMAN_TRAIT_MULTIPLIER_STRONGEST_V2).toBe(0);
    expect(HUMAN_TRAIT_MULTIPLIER_WEAKEST_V2).toBe(0);
    expect(HUMAN_MILITARY_RANK_CURVE_EXPONENT_V2).toBe(1);
    expect(HUMAN_STARTING_ARMY_MULTIPLIER_STRONGEST_V2).toBe(0.05);
    expect(HUMAN_STARTING_ARMY_BASE_CURVE_WEAKEST_MULTIPLIER_V2).toBe(15);
    expect(HUMAN_STARTING_ARMY_MULTIPLIER_WEAKEST_V2).toBe(50);
    expect(HUMAN_STARTING_ARMY_MULTIPLIER_STRONGEST_V2).toBeLessThan(1);
  });

  it('keeps every archived country-trait multiplier at zero', () => {
    const usaTrait = humanCountryTraitMultiplierForContentV2(WORLD_CONTENT_V2, 'usa');
    const chinaTrait = humanCountryTraitMultiplierForContentV2(WORLD_CONTENT_V2, 'chn');
    const ukTrait = humanCountryTraitMultiplierForContentV2(WORLD_CONTENT_V2, 'gbr');
    const italyTrait = humanCountryTraitMultiplierForContentV2(WORLD_CONTENT_V2, 'ita');
    expect([usaTrait, chinaTrait, ukTrait, italyTrait]).toEqual([0, 0, 0, 0]);
  });

  it('keeps the top-15 great-power restraint, then accelerates player help through the underdog ranks', () => {
    const order = openingMilitaryOrderForContentV2(WORLD_CONTENT_V2);
    const armyMultiplier = (playerId: PlayerId) => (
      humanStartingArmyMultiplierForContentV2(WORLD_CONTENT_V2, playerId)
    );
    const multipliers = order.map(armyMultiplier);
    expect(order.filter((playerId) => armyMultiplier(playerId) < 1))
      .toEqual(order.slice(0, 15));
    expect(armyMultiplier('usa' as PlayerId)).toBe(0.05);
    expect(armyMultiplier('chn' as PlayerId)).toBeGreaterThan(0.05);
    expect(armyMultiplier('chn' as PlayerId)).toBeLessThan(1);
    expect(armyMultiplier('gbr' as PlayerId)).toBeCloseTo(0.417872, 6);
    expect(armyMultiplier('ita' as PlayerId)).toBeCloseTo(0.589594, 6);
    for (let index = 1; index < multipliers.length; index += 1) {
      expect(multipliers[index]).toBeGreaterThanOrEqual(multipliers[index - 1]!);
    }
    expect(armyMultiplier(order[14]!)).toBeLessThan(1);
    expect(armyMultiplier(order[15]!)).toBeGreaterThanOrEqual(1);
    expect(openingMilitaryRankForContentV2(WORLD_CONTENT_V2, 'bel')).toBe(61);
    expect(armyMultiplier('aze' as PlayerId)).toBeCloseTo(1.953018, 6);
    expect(armyMultiplier('bel' as PlayerId)).toBeCloseTo(1.975982, 6);
    expect(armyMultiplier('bgr' as PlayerId)).toBeCloseTo(1.998292, 6);
    expect(armyMultiplier(order[Math.floor((order.length - 1) / 2)]!))
      .toBeGreaterThan(3);
    expect(armyMultiplier('lux' as PlayerId)).toBeGreaterThan(8);
    expect(armyMultiplier('lux' as PlayerId)).toBeLessThan(10);
    expect(armyMultiplier(order[Math.floor((order.length - 1) * 0.75)]!))
      .toBeCloseTo(9.4, 1);
    expect(armyMultiplier(order.at(-1)!)).toBe(50);
  });

  it('keeps traits neutral while army help still changes after rank 15', () => {
    const order = openingMilitaryOrderForContentV2(WORLD_CONTENT_V2);
    const rank15 = order[14]!;
    const rank16 = order[15]!;
    expect(humanCountryTraitMultiplierForContentV2(WORLD_CONTENT_V2, rank15))
      .toBe(0);
    expect(humanCountryTraitMultiplierForContentV2(WORLD_CONTENT_V2, rank16))
      .toBe(0);
    expect(humanStartingArmyMultiplierForContentV2(WORLD_CONTENT_V2, rank15)).toBeLessThan(1);
    expect(humanStartingArmyMultiplierForContentV2(WORLD_CONTENT_V2, rank16)).toBeGreaterThan(1);
  });

  it.each([
    ['Standard', WORLD_CONTENT_V2],
    ['Alternative', resolveScenarioV2({ mode: 'random-world', seed: 84_102 }).content],
  ] as const)('applies the two-stage weakest-25 army overlay in %s', (_name, content) => {
    const order = openingMilitaryOrderForContentV2(content);
    const count = order.length;
    const finalQuote = (index: number) => (
      humanStartingArmyMultiplierForContentV2(content, order[index]!)
    );
    const baseQuote = (index: number) => (
      humanStartingArmyBaseCurveMultiplierForContentV2(content, order[index]!)
    );
    const rank26FromWeakestIndex = count - HUMAN_BROAD_UNDERDOG_COUNT_V2 - 1;
    const rank25FromWeakestIndex = rank26FromWeakestIndex + 1;
    const rank11FromWeakestIndex = count - HUMAN_EXTREME_UNDERDOG_COUNT_V2 - 1;
    const rank10FromWeakestIndex = rank11FromWeakestIndex + 1;

    for (let index = 0; index <= rank26FromWeakestIndex; index += 1) {
      expect(finalQuote(index)).toBe(baseQuote(index));
    }
    expect(finalQuote(rank25FromWeakestIndex))
      .toBeGreaterThan(baseQuote(rank25FromWeakestIndex));
    expect(finalQuote(rank11FromWeakestIndex))
      .toBe(HUMAN_BROAD_UNDERDOG_ARMY_MULTIPLIER_ENDPOINT_V2);
    expect(finalQuote(rank10FromWeakestIndex))
      .toBeGreaterThan(HUMAN_BROAD_UNDERDOG_ARMY_MULTIPLIER_ENDPOINT_V2);
    expect(finalQuote(count - 1)).toBe(HUMAN_STARTING_ARMY_MULTIPLIER_WEAKEST_V2);

    const quotes = order.map((_, index) => finalQuote(index));
    for (let index = 1; index < quotes.length; index += 1) {
      expect(quotes[index]).toBeGreaterThanOrEqual(quotes[index - 1]!);
    }
  });

  it.each([
    ['Standard', WORLD_CONTENT_V2],
    ['Alternative', resolveScenarioV2({ mode: 'random-world', seed: 84_103 }).content],
  ] as const)('keeps opening reserve compatibility neutral for immutable %s rank', (_name, content) => {
    const order = openingMilitaryOrderForContentV2(content);
    const strongest = order[0]!;
    const weakest = order.at(-1)!;
    const eleventhWeakest = order.at(-11)!;
    const tenthWeakest = order.at(-10)!;

    expect(humanOpeningReserveMultiplierForContentV2(content, strongest)).toBe(1);
    expect(humanOpeningReserveMultiplierForContentV2(content, tenthWeakest)).toBe(1);
    expect(humanOpeningReserveMultiplierForContentV2(content, eleventhWeakest)).toBe(1);
    expect(humanOpeningReserveMultiplierForContentV2(content, weakest)).toBe(1);

    const weakestTerms = humanOpeningTrainedReserveTermsForContentV2(
      content, weakest, 0, 100, 100,
    );
    expect(weakestTerms).toMatchObject({
      canonicalReserves: 0,
      neutralReserveCapacity: 0,
      liveReserveCapacity: 0,
      reserveMultiplier: 1,
      minimumBaseReserves: 0,
      effectiveBaseReserves: 0,
      trainedReserves: 0,
    });
    expect(humanOpeningTrainedReserveTermsForContentV2(
      content, weakest, 0, 100, 8,
    ).trainedReserves).toBe(0);
    expect(humanOpeningTrainedReserveTermsForContentV2(
      content, weakest, 0, 100, 100, false,
    )).toMatchObject({
      reserveMultiplier: 1,
      minimumBaseReserves: 0,
      effectiveBaseReserves: 0,
      trainedReserves: 0,
    });
  });

  it('grants the opening surplus without treasury or reserves and scales capacity with it', () => {
    const engine = new WorldEngineV2(84_004, WORLD_CONTENT_V2);
    const state = engine.state;
    const weakest = openingMilitaryOrderForContentV2(WORLD_CONTENT_V2).at(-1)!;
    const before = selectTotalManpowerV2(state, weakest);
    const treasuryBefore = state.players[weakest]!.treasury;
    const reservesBefore = state.players[weakest]!.trainedReserves;

    expect(engine.configureHumanPlayers([weakest], weakest)).toEqual({ accepted: true });

    const after = selectTotalManpowerV2(state, weakest);
    const oneXState = structuredClone(state);
    oneXState.tick = OPENING_ARMY_BONUS_DURATION_TICKS_V2;
    synchronizeArmyCapacityV2(oneXState, WORLD_CONTENT_V2);
    const oneXCapacity = selectTotalManpowerV2(oneXState, weakest).capacity;
    expect(after.deployed).toBeCloseTo(before.deployed * 50, 7);
    // Each displayed national capacity is rounded independently. Compare the
    // boosted value after removing its multiplier so that one rounding quantum
    // does not masquerade as a failure of the 15x invariant.
    expect(after.capacity / HUMAN_STARTING_ARMY_MULTIPLIER_WEAKEST_V2)
      .toBeCloseTo(oneXCapacity, 6);
    expect(state.players[weakest]!.treasury).toBe(treasuryBefore);
    expect(state.players[weakest]!.trainedReserves).toBe(reservesBefore);
  });

  it('uses generated power ranking with deterministic country-id tie breaks', () => {
    const { content } = resolveScenarioV2({ mode: 'random-world', seed: 84_002 });
    const order = openingMilitaryOrderForContentV2(content);
    const expected = content.nationIds
      .filter((id) => isHumanSelectableNationV2(content, id))
      .sort((left, right) => (
      content.nations[right]!.real.powerIndex - content.nations[left]!.real.powerIndex
      || left.localeCompare(right)
      ));
    expect(order).toEqual(expected);
    expect(openingMilitaryRankForContentV2(content, order[0]!)).toBe(1);
    expect(openingMilitaryRankForContentV2(content, order.at(-1)!)).toBe(order.length);
    expect(humanCountryTraitMultiplierForContentV2(content, order[0]!)).toBe(0);
    expect(humanCountryTraitMultiplierForContentV2(content, order.at(-1)!)).toBe(0);
    expect(humanStartingArmyMultiplierForContentV2(content, order[0]!)).toBe(0.05);
    expect(humanStartingArmyMultiplierForContentV2(content, order.at(-1)!)).toBe(50);
  });

  it('switches and repeats multiplayer opening seats without stacking any factor', () => {
    const { content } = resolveScenarioV2({ mode: 'random-world', seed: 84_003 });
    const order = openingMilitaryOrderForContentV2(content);
    const strongest = order[0]!;
    const weakest = order.at(-1)!;
    const ordinary = createWorldStateV2(84_003, content);
    synchronizeOpeningArmyHumanRosterV2(
      ordinary,
      content,
      ordinary.humanPlayerIds,
      [],
    );
    const strongestBase = deployedV2(ordinary, strongest);
    const weakestBase = deployedV2(ordinary, weakest);
    const untouchedAi = order.find((id) => id !== strongest && id !== weakest
      && id !== ordinary.humanPlayerId)!;
    const untouchedBase = deployedV2(ordinary, untouchedAi);

    const engine = new WorldEngineV2(84_003, content);
    expect(engine.configureHumanPlayers([strongest, weakest], strongest)).toEqual({ accepted: true });
    expect(deployedV2(engine.state, strongest)).toBeCloseTo(
      strongestBase * humanStartingArmyMultiplierForContentV2(content, strongest),
      6,
    );
    expect(deployedV2(engine.state, weakest)).toBeCloseTo(
      weakestBase * humanStartingArmyMultiplierForContentV2(content, weakest),
      6,
    );
    expect(deployedV2(engine.state, untouchedAi)).toBeCloseTo(untouchedBase, 8);
    const repeatedStrongest = deployedV2(engine.state, strongest);
    const repeatedWeakest = deployedV2(engine.state, weakest);
    const oneXState = structuredClone(engine.state);
    oneXState.tick = OPENING_ARMY_BONUS_DURATION_TICKS_V2;
    synchronizeArmyCapacityV2(oneXState, content);
    expect(selectTotalManpowerV2(engine.state, strongest).capacity).toBeCloseTo(
      selectTotalManpowerV2(oneXState, strongest).capacity
        * humanStartingArmyMultiplierForContentV2(content, strongest),
      6,
    );
    expect(selectTotalManpowerV2(engine.state, weakest).capacity).toBeCloseTo(
      selectTotalManpowerV2(oneXState, weakest).capacity
        * humanStartingArmyMultiplierForContentV2(content, weakest),
      6,
    );
    expect(engine.configureHumanPlayers([strongest, weakest], strongest)).toEqual({ accepted: true });
    expect(deployedV2(engine.state, strongest)).toBe(repeatedStrongest);
    expect(deployedV2(engine.state, weakest)).toBe(repeatedWeakest);

    expect(engine.configureHumanPlayers([strongest], strongest)).toEqual({ accepted: true });
    expect(deployedV2(engine.state, weakest)).toBeCloseTo(weakestBase, 6);
    expect(engine.configureHumanPlayers([weakest], weakest)).toEqual({ accepted: true });
    expect(deployedV2(engine.state, strongest)).toBeCloseTo(strongestBase, 6);
    expect(deployedV2(engine.state, weakest)).toBeCloseTo(repeatedWeakest, 6);

    const context = traitNationContextV2(engine.state, weakest);
    expect(context.humanTraitMultiplier)
      .toBeCloseTo(humanCountryTraitMultiplierForContentV2(content, weakest), 6);
  });
});
