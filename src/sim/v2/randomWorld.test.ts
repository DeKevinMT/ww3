import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import {
  isRogueAiNationV2,
  WORLD_CONTENT_V2,
  type WorldContentV2,
} from './content';
import { assertInvariantsV2 } from './invariants';
import {
  RANDOM_WORLD_GENERATOR_VERSION_V2,
  createRandomWorldContentV2,
} from './randomWorld';

function sumByNationV2(
  content: WorldContentV2,
  select: (id: (typeof content.nationIds)[number]) => number,
): number {
  return content.nationIds.reduce((sum, id) => sum + select(id), 0);
}

function correlationV2(left: readonly number[], right: readonly number[]): number {
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index]! - leftMean;
    const rightDelta = right[index]! - rightMean;
    covariance += leftDelta * rightDelta;
    leftVariance += leftDelta ** 2;
    rightVariance += rightDelta ** 2;
  }
  return covariance / Math.sqrt(leftVariance * rightVariance);
}

describe('Alternative Universe content generation', () => {
  it('is deterministic by seed and generator version while different seeds diverge', () => {
    const first = createRandomWorldContentV2(81_337, RANDOM_WORLD_GENERATOR_VERSION_V2);
    const repeated = createRandomWorldContentV2(81_337, RANDOM_WORLD_GENERATOR_VERSION_V2);
    const different = createRandomWorldContentV2(81_338, RANDOM_WORLD_GENERATOR_VERSION_V2);

    expect(repeated).toEqual(first);
    expect(repeated).not.toBe(first);
    expect(different.nationIds.map((id) => different.nations[id]!.real.population))
      .not.toEqual(first.nationIds.map((id) => first.nations[id]!.real.population));
    expect(() => createRandomWorldContentV2(1, RANDOM_WORLD_GENERATOR_VERSION_V2 + 1))
      .toThrow(/Unsupported Alternative Universe generator version/);
  });

  it('retains map and visual identity without mutating or sharing mutable base records', () => {
    const originalSnapshot = JSON.stringify(WORLD_CONTENT_V2);
    const generated = createRandomWorldContentV2(44_021);
    expect(generated.nationIds).toEqual(WORLD_CONTENT_V2.nationIds);
    expect(generated.territoryIds).toEqual(WORLD_CONTENT_V2.territoryIds);
    for (const id of generated.nationIds) {
      const base = WORLD_CONTENT_V2.nations[id]!;
      const random = generated.nations[id]!;
      if (isRogueAiNationV2(generated, id)) expect(random).toBe(base);
      else expect(random).not.toBe(base);
      expect(random).toMatchObject({
        id: base.id,
        iso3: base.iso3,
        initialCapitalId: base.initialCapitalId,
        name: base.name,
        shortName: base.shortName,
        color: base.color,
        cssColor: base.cssColor,
        sigil: base.sigil,
        continent: base.continent,
        subregion: base.subregion,
      });
      expect(random.real.landArea).toBe(base.real.landArea);
      expect(random.influenceTags.every((tag) => !tag.startsWith('bloc:'))).toBe(true);
    }
    for (const id of generated.territoryIds) {
      const base = WORLD_CONTENT_V2.territories[id]!;
      const random = generated.territories[id]!;
      expect(random).not.toBe(base);
      expect(random).toMatchObject({
        id: base.id,
        initialOwnerId: base.initialOwnerId,
        name: base.name,
        regionId: base.regionId,
        terrain: base.terrain,
      });
      expect(random.connections).toEqual(base.connections);
      expect(random.connections).not.toBe(base.connections);
      expect(random.baseline).toEqual(
        isRogueAiNationV2(generated, random.initialOwnerId)
          ? base.baseline
          : generated.nations[random.initialOwnerId]!.real,
      );
      expect(random.baseline).not.toBe(generated.nations[random.initialOwnerId]!.real);
    }
    expect(JSON.stringify(WORLD_CONTENT_V2)).toBe(originalSnapshot);
  });

  it('creates coherent, bounded profiles and preserves reasonable global totals', () => {
    const generated = createRandomWorldContentV2(72_909);
    const basePopulation = sumByNationV2(
      WORLD_CONTENT_V2,
      (id) => WORLD_CONTENT_V2.nations[id]!.real.population,
    );
    const randomPopulation = sumByNationV2(
      generated,
      (id) => generated.nations[id]!.real.population,
    );
    const baseGdp = sumByNationV2(
      WORLD_CONTENT_V2,
      (id) => WORLD_CONTENT_V2.nations[id]!.real.gdp,
    );
    const randomGdp = sumByNationV2(
      generated,
      (id) => generated.nations[id]!.real.gdp,
    );
    const baseResearch = sumByNationV2(
      WORLD_CONTENT_V2,
      (id) => WORLD_CONTENT_V2.nations[id]!.real.researchCapacity,
    );
    const randomResearch = sumByNationV2(
      generated,
      (id) => generated.nations[id]!.real.researchCapacity,
    );
    const basePower = sumByNationV2(
      WORLD_CONTENT_V2,
      (id) => WORLD_CONTENT_V2.nations[id]!.real.powerIndex,
    );
    const randomPower = sumByNationV2(
      generated,
      (id) => generated.nations[id]!.real.powerIndex,
    );

    expect(randomPopulation / basePopulation).toBeCloseTo(1, 8);
    expect(randomGdp / baseGdp).toBeCloseTo(1, 8);
    expect(randomResearch / baseResearch).toBeCloseTo(1, 8);
    expect(randomPower / basePower).toBeGreaterThan(0.75);
    expect(randomPower / basePower).toBeLessThan(1.25);

    for (const id of generated.nationIds) {
      if (isRogueAiNationV2(generated, id)) continue;
      const nation = generated.nations[id]!;
      const perCapita = nation.real.gdp / nation.real.population * 1_000;
      const defenceBurden = nation.real.defenceSpending / nation.real.gdp;
      expect(nation.real.population).toBeGreaterThanOrEqual(0.025);
      expect(perCapita).toBeGreaterThanOrEqual(599.999);
      expect(perCapita).toBeLessThanOrEqual(150_000.001);
      expect(defenceBurden).toBeGreaterThanOrEqual(0.007999);
      expect(defenceBurden).toBeLessThanOrEqual(0.080001);
      expect(nation.balance.initialManpower).toBeGreaterThan(0);
      expect(nation.real.powerIndex).toBeGreaterThan(0);
      expect(nation.real.powerIndex).toBeLessThanOrEqual(100);
      expect(nation.real.foodInsecurityRate).toBeGreaterThanOrEqual(0.005);
      expect(nation.real.foodSelfSufficiencyRatio).toBeGreaterThanOrEqual(0.30);
      expect(nation.real.foodSelfSufficiencyRatio).toBeLessThanOrEqual(2.60);
      expect(Number.isFinite(nation.militaryAttackRating)).toBe(true);
      expect(Number.isFinite(nation.militaryDefenseRating)).toBe(true);
    }

    const logAreas = generated.nationIds.map((id) => Math.log(generated.nations[id]!.real.landArea));
    const logPopulations = generated.nationIds.map((id) => Math.log(generated.nations[id]!.real.population));
    expect(correlationV2(logAreas, logPopulations)).toBeGreaterThan(0.55);

    const state = createWorldStateV2(72_909, generated);
    expect(() => assertInvariantsV2(state, generated)).not.toThrow();
  });

  it('assigns deterrence to generated great powers and has no fixed country leader', () => {
    const generated = createRandomWorldContentV2(99_005);
    const ranked = generated.nationIds
      .filter((id) => !isRogueAiNationV2(generated, id))
      .sort((left, right) => (
      generated.nations[right]!.real.powerIndex - generated.nations[left]!.real.powerIndex
        || left.localeCompare(right)
      ));
    expect(ranked.slice(0, 2).every((id) => generated.nations[id]!.nuclearPowerLevel === 3)).toBe(true);
    expect(ranked.slice(2, 5).every((id) => generated.nations[id]!.nuclearPowerLevel === 2)).toBe(true);
    expect(ranked.slice(5, 9).every((id) => generated.nations[id]!.nuclearPowerLevel === 1)).toBe(true);
    expect(ranked.slice(9).every((id) => generated.nations[id]!.nuclearPowerLevel === 0)).toBe(true);

    const leaders = Array.from({ length: 20 }, (_, index) => {
      const world = createRandomWorldContentV2(20_000 + index);
      return world.nationIds
        .filter((id) => !isRogueAiNationV2(world, id))
        .sort((left, right) => (
        world.nations[right]!.real.powerIndex - world.nations[left]!.real.powerIndex
          || left.localeCompare(right)
        ))[0]!;
    });
    expect(new Set(leaders).size).toBeGreaterThanOrEqual(5);
    expect(leaders.some((id) => String(id) !== 'usa')).toBe(true);
  });
});
