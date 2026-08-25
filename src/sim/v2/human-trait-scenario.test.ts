import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { synchronizeOpeningArmyHumanRosterV2 } from './nationState';
import { resolveScenarioV2 } from './scenarios';
import { selectRecruitmentThroughputV2, selectTotalManpowerV2 } from './selectors';
import { traitNationContextV2 } from './traitContext';
import {
  HUMAN_MILITARY_RANK_CURVE_EXPONENT_V2,
  HUMAN_STARTING_ARMY_MULTIPLIER_STRONGEST_V2,
  HUMAN_STARTING_ARMY_MULTIPLIER_WEAKEST_V2,
  HUMAN_TRAIT_MULTIPLIER_STRONGEST_V2,
  HUMAN_TRAIT_MULTIPLIER_WEAKEST_V2,
  humanCountryTraitMultiplierForContentV2,
  humanStartingArmyMultiplierForContentV2,
  openingMilitaryOrderForContentV2,
  openingMilitaryRankForContentV2,
} from './traits';
import type { PlayerId, WorldStateV2 } from './types';
import { WorldEngineV2 } from './WorldEngineV2';

function deployedV2(state: WorldStateV2, playerId: PlayerId): number {
  return selectTotalManpowerV2(state, playerId).deployed;
}

describe('scenario-aware human trait and opening-force curve', () => {
  it('keeps Standard ranking and exact 1x–2.5x / 0.5x–12x endpoints', () => {
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
    expect(HUMAN_TRAIT_MULTIPLIER_STRONGEST_V2).toBe(1);
    expect(HUMAN_TRAIT_MULTIPLIER_WEAKEST_V2).toBe(2.5);
    expect(HUMAN_MILITARY_RANK_CURVE_EXPONENT_V2).toBe(1);
    expect(HUMAN_STARTING_ARMY_MULTIPLIER_STRONGEST_V2).toBe(0.5);
    expect(HUMAN_STARTING_ARMY_MULTIPLIER_WEAKEST_V2).toBe(12);
    expect(HUMAN_STARTING_ARMY_MULTIPLIER_STRONGEST_V2).toBeLessThan(1);
  });

  it('separates the upper Standard tiers earlier on the rank curve', () => {
    const usaTrait = humanCountryTraitMultiplierForContentV2(WORLD_CONTENT_V2, 'usa');
    const chinaTrait = humanCountryTraitMultiplierForContentV2(WORLD_CONTENT_V2, 'chn');
    const ukTrait = humanCountryTraitMultiplierForContentV2(WORLD_CONTENT_V2, 'gbr');
    const italyTrait = humanCountryTraitMultiplierForContentV2(WORLD_CONTENT_V2, 'ita');
    expect(usaTrait).toBe(1);
    expect(chinaTrait).toBeCloseTo(1.009091, 6);
    expect(ukTrait).toBeCloseTo(1.063636, 6);
    expect(italyTrait).toBeCloseTo(1.081818, 6);
  });

  it('keeps army reductions to only the strongest few and accelerates help in the weak tail', () => {
    const order = openingMilitaryOrderForContentV2(WORLD_CONTENT_V2);
    const armyMultiplier = (playerId: PlayerId) => (
      humanStartingArmyMultiplierForContentV2(WORLD_CONTENT_V2, playerId)
    );
    expect(order.filter((playerId) => armyMultiplier(playerId) < 1))
      .toEqual(order.slice(0, 5));
    expect(armyMultiplier('usa' as PlayerId)).toBe(0.5);
    expect(armyMultiplier('chn' as PlayerId)).toBeGreaterThan(0.5);
    expect(armyMultiplier('gbr' as PlayerId)).toBeGreaterThan(1);
    expect(armyMultiplier('gbr' as PlayerId)).toBeLessThan(1.05);
    expect(armyMultiplier(order[Math.floor((order.length - 1) * 0.25)]!))
      .toBeCloseTo(1.1, 2);
    expect(armyMultiplier(order[Math.floor((order.length - 1) / 2)]!))
      .toBeCloseTo(1.5, 2);
    expect(armyMultiplier('lux' as PlayerId)).toBeGreaterThan(7.4);
    expect(armyMultiplier('lux' as PlayerId)).toBeLessThan(7.7);
    expect(armyMultiplier(order[Math.floor((order.length - 1) * 0.75)]!))
      .toBeCloseTo(9, 1);
    expect(armyMultiplier(order.at(-1)!)).toBe(12);
  });

  it('grants the opening surplus for free without reserves, cap, or replenishment', () => {
    const state = createWorldStateV2(84_004, WORLD_CONTENT_V2);
    const weakest = openingMilitaryOrderForContentV2(WORLD_CONTENT_V2).at(-1)!;
    const before = selectTotalManpowerV2(state, weakest);
    const treasuryBefore = state.players[weakest]!.treasury;
    const reservesBefore = state.players[weakest]!.trainedReserves;

    synchronizeOpeningArmyHumanRosterV2(state, WORLD_CONTENT_V2, [], [weakest]);

    const after = selectTotalManpowerV2(state, weakest);
    expect(after.deployed).toBeCloseTo(before.deployed * 12, 7);
    expect(after.capacity).toBeCloseTo(before.capacity, 12);
    expect(state.players[weakest]!.treasury).toBe(treasuryBefore);
    expect(state.players[weakest]!.trainedReserves).toBe(reservesBefore);
    expect(after.deployed).toBeGreaterThan(after.capacity);
    expect(selectRecruitmentThroughputV2(state, WORLD_CONTENT_V2, weakest)).toBe(0);
  });

  it('uses generated power ranking with deterministic country-id tie breaks', () => {
    const { content } = resolveScenarioV2({ mode: 'random-world', seed: 84_002 });
    const order = openingMilitaryOrderForContentV2(content);
    const expected = [...content.nationIds].sort((left, right) => (
      content.nations[right]!.real.powerIndex - content.nations[left]!.real.powerIndex
      || left.localeCompare(right)
    ));
    expect(order).toEqual(expected);
    expect(openingMilitaryRankForContentV2(content, order[0]!)).toBe(1);
    expect(openingMilitaryRankForContentV2(content, order.at(-1)!)).toBe(order.length);
    expect(humanCountryTraitMultiplierForContentV2(content, order[0]!)).toBe(1);
    expect(humanCountryTraitMultiplierForContentV2(content, order.at(-1)!)).toBe(2.5);
    expect(humanStartingArmyMultiplierForContentV2(content, order[0]!)).toBe(0.5);
    expect(humanStartingArmyMultiplierForContentV2(content, order.at(-1)!)).toBe(12);
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
      7,
    );
    expect(deployedV2(engine.state, weakest)).toBeCloseTo(
      weakestBase * humanStartingArmyMultiplierForContentV2(content, weakest),
      7,
    );
    expect(deployedV2(engine.state, untouchedAi)).toBeCloseTo(untouchedBase, 8);
    expect(deployedV2(engine.state, weakest))
      .toBeGreaterThan(selectTotalManpowerV2(engine.state, weakest).capacity);

    const repeatedStrongest = deployedV2(engine.state, strongest);
    const repeatedWeakest = deployedV2(engine.state, weakest);
    expect(engine.configureHumanPlayers([strongest, weakest], strongest)).toEqual({ accepted: true });
    expect(deployedV2(engine.state, strongest)).toBe(repeatedStrongest);
    expect(deployedV2(engine.state, weakest)).toBe(repeatedWeakest);

    expect(engine.configureHumanPlayers([strongest], strongest)).toEqual({ accepted: true });
    expect(deployedV2(engine.state, weakest)).toBeCloseTo(weakestBase, 7);
    expect(engine.configureHumanPlayers([weakest], weakest)).toEqual({ accepted: true });
    expect(deployedV2(engine.state, strongest)).toBeCloseTo(strongestBase, 7);
    expect(deployedV2(engine.state, weakest)).toBeCloseTo(repeatedWeakest, 7);

    const context = traitNationContextV2(engine.state, weakest);
    expect(context.humanTraitMultiplier)
      .toBeCloseTo(humanCountryTraitMultiplierForContentV2(content, weakest), 12);
  });
});
