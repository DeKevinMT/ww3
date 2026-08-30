import { nextRandom, normalizeSeed } from '../../game/random';
import {
  ARMY_CAPACITY_INITIAL_FORCE_FLOOR,
  ARMY_CAPACITY_STRUCTURAL_POPULATION_SHARE,
  NATIONAL_IQ_SCORE_MAX,
  NATIONAL_IQ_SCORE_MIN,
  V2_CONTENT_VERSION,
  clamp,
  round,
} from './balance';
import {
  WORLD_CONTENT_V2,
  calibratedMilitaryRatingsV2,
  calibratedNationalIqScoreV2,
  isRogueAiNationV2,
  nationalQualityIndexV2,
  type NationContentV2,
  type NationRealDataV2,
  type TerritoryContentV2,
  type WorldContentV2,
} from './content';
import type { PlayerId, TerritoryId } from './types';

/**
 * Increment this only when the Random World generation algorithm changes.
 * Saves and multiplayer lobbies can pair this value with the seed to rebuild
 * exactly the same immutable opening content.
 */
export const RANDOM_WORLD_GENERATOR_VERSION_V2 = 2;
export const LEGACY_RANDOM_WORLD_GENERATOR_VERSION_V2 = 1;

const randomizableNationIdsV2 = (): PlayerId[] => WORLD_CONTENT_V2.nationIds
  .filter((id) => !isRogueAiNationV2(WORLD_CONTENT_V2, id));

type RandomWorldSpecializationLaneV2 =
  | 'population'
  | 'wealth'
  | 'science'
  | 'governance'
  | 'food'
  | 'military'
  | 'demography'
  | 'doctrine';

type RandomWorldSpecializationV2 = Record<RandomWorldSpecializationLaneV2, number>;

const RANDOM_WORLD_SPECIALIZATION_LANES_V2: readonly RandomWorldSpecializationLaneV2[] = [
  'population',
  'wealth',
  'science',
  'governance',
  'food',
  'military',
  'demography',
  'doctrine',
];
const RANDOM_WORLD_EXTREME_SPECIALISTS_PER_LANE_V2 = 4;
const RANDOM_WORLD_SPECIALIZATION_WEAKNESS_FACTOR_V2 = 0.70;
const RANDOM_WORLD_DOCTRINE_TILT_MAX_V2 = 0.30;

export function randomWorldContentVersionV2(
  seedInput: number,
  generatorVersion = RANDOM_WORLD_GENERATOR_VERSION_V2,
): string {
  return `random-world-v${generatorVersion}@${V2_CONTENT_VERSION}:seed-${normalizeSeed(seedInput)}`;
}

interface RandomWorldLatentProfileV2 {
  populationWeight: number;
  development: number;
  institutions: number;
  agriculture: number;
  militarism: number;
  demographyNoise: number;
  foodNoise: number;
  specialization: RandomWorldSpecializationV2;
}

interface RandomWorldDraftV2 {
  id: PlayerId;
  base: NationContentV2;
  profile: RandomWorldLatentProfileV2;
  population: number;
  gdp: number;
  researchCapacity: number;
  defenceSpending: number;
  iqScore: number;
  militaryQuality: number;
  sourceManpower: number;
  powerIndex: number;
  nuclearPowerLevel: number;
}

interface RandomStateV2 {
  rngState: number;
}

function mixedGeneratorSeedV2(seedInput: number, generatorVersion: number): number {
  let value = normalizeSeed(seedInput) ^ Math.imul(generatorVersion, 0x9e3779b1);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return normalizeSeed(value >>> 0);
}

/** A bounded bell curve avoids seeds that create non-playable statistical outliers. */
function boundedBellV2(random: RandomStateV2): number {
  return (
    nextRandom(random)
    + nextRandom(random)
    + nextRandom(random)
    + nextRandom(random)
    - 2
  ) / 2;
}

function emptySpecializationV2(): RandomWorldSpecializationV2 {
  return {
    population: 0,
    wealth: 0,
    science: 0,
    governance: 0,
    food: 0,
    military: 0,
    demography: 0,
    doctrine: 0,
  };
}

/**
 * Gives every country one independent strength and one different weakness.
 * A balanced deck guarantees four rare extreme specialists in every lane,
 * while the existing global normalizers keep total population, GDP, research
 * and opening military power unchanged.
 */
function randomWorldSpecializationsV2(
  random: RandomStateV2,
  ids: readonly PlayerId[],
): Map<PlayerId, RandomWorldSpecializationV2> {
  const shuffled = [...ids];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(nextRandom(random) * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
  }
  const extremeCount = RANDOM_WORLD_SPECIALIZATION_LANES_V2.length
    * RANDOM_WORLD_EXTREME_SPECIALISTS_PER_LANE_V2;
  const result = new Map<PlayerId, RandomWorldSpecializationV2>();
  for (let index = 0; index < shuffled.length; index += 1) {
    const primaryIndex = index % RANDOM_WORLD_SPECIALIZATION_LANES_V2.length;
    const weaknessOffset = 1 + Math.floor(
      nextRandom(random) * (RANDOM_WORLD_SPECIALIZATION_LANES_V2.length - 1),
    );
    const weaknessIndex = (
      primaryIndex + weaknessOffset
    ) % RANDOM_WORLD_SPECIALIZATION_LANES_V2.length;
    const intensity = index < extremeCount
      ? 0.85 + 0.15 * nextRandom(random)
      : 0.25 + 0.35 * nextRandom(random);
    const specialization = emptySpecializationV2();
    specialization[RANDOM_WORLD_SPECIALIZATION_LANES_V2[primaryIndex]!] = intensity;
    specialization[RANDOM_WORLD_SPECIALIZATION_LANES_V2[weaknessIndex]!]
      = -RANDOM_WORLD_SPECIALIZATION_WEAKNESS_FACTOR_V2 * intensity;
    result.set(shuffled[index]!, specialization);
  }
  return result;
}

function totalV2(values: Iterable<number>): number {
  let result = 0;
  for (const value of values) result += value;
  return result;
}

/**
 * Scale positive weights to an exact global total while respecting safe
 * per-country limits. Limits are resolved iteratively, so a clamped outlier
 * cannot make the rest of the world miss the requested total.
 */
function normalizeWeightsV2(
  ids: readonly PlayerId[],
  weights: ReadonlyMap<PlayerId, number>,
  targetTotal: number,
  minimumFor: (id: PlayerId) => number,
  maximumFor: (id: PlayerId) => number,
): Map<PlayerId, number> {
  const result = new Map<PlayerId, number>();
  const active = new Set(ids);
  let remainingTarget = targetTotal;

  while (active.size > 0) {
    const activeWeight = totalV2([...active].map((id) => Math.max(0.000000001, weights.get(id) ?? 0)));
    const scale = remainingTarget / Math.max(0.000000001, activeWeight);
    let clampedAny = false;

    for (const id of [...active]) {
      const projected = Math.max(0.000000001, weights.get(id) ?? 0) * scale;
      const minimum = minimumFor(id);
      const maximum = Math.max(minimum, maximumFor(id));
      if (projected < minimum || projected > maximum) {
        const value = clamp(projected, minimum, maximum);
        result.set(id, value);
        remainingTarget -= value;
        active.delete(id);
        clampedAny = true;
      }
    }

    if (!clampedAny) {
      for (const id of active) {
        result.set(id, Math.max(0.000000001, weights.get(id) ?? 0) * scale);
      }
      active.clear();
    }
  }

  return result;
}

function randomLatentProfilesV2(
  random: RandomStateV2,
  generatorVersion: number,
): Map<PlayerId, RandomWorldLatentProfileV2> {
  const result = new Map<PlayerId, RandomWorldLatentProfileV2>();
  const ids = randomizableNationIdsV2().sort((left, right) => left.localeCompare(right));
  for (const id of ids) {
    const base = WORLD_CONTENT_V2.nations[id]!;
    const densityPosition = nextRandom(random);
    const density = Math.exp(
      Math.log(4) + densityPosition * (Math.log(1_100) - Math.log(4)),
    );
    const habitability = Math.exp(0.95 * boundedBellV2(random));
    const developmentSeed = nextRandom(random);
    const development = clamp(
      0.72 * developmentSeed + 0.18 * densityPosition + 0.10 * nextRandom(random),
      0,
      1,
    );
    const institutions = clamp(
      0.58 * development + 0.42 * nextRandom(random) + 0.10 * boundedBellV2(random),
      0,
      1,
    );
    const agriculture = clamp(
      0.58 * nextRandom(random) + 0.24 * institutions + 0.18 * (1 - densityPosition),
      0,
      1,
    );
    result.set(id, {
      populationWeight: Math.max(
        0.000001,
        base.real.landArea * density * habitability / 1_000_000,
      ),
      development,
      institutions,
      agriculture,
      militarism: clamp(
        0.72 * nextRandom(random) + 0.18 * (1 - institutions) + 0.10 * nextRandom(random),
        0,
        1,
      ),
      demographyNoise: boundedBellV2(random),
      foodNoise: boundedBellV2(random),
      specialization: emptySpecializationV2(),
    });
  }
  if (generatorVersion >= 2) {
    const specializations = randomWorldSpecializationsV2(random, ids);
    for (const id of ids) {
      const profile = result.get(id)!;
      profile.specialization = specializations.get(id)!;
      profile.populationWeight *= Math.exp(
        0.75 * profile.specialization.population,
      );
    }
  }
  return result;
}

function powerIndexByGeneratedRankV2(drafts: readonly RandomWorldDraftV2[]): Map<PlayerId, number> {
  const ranked = [...drafts].sort((left, right) => {
    const leftRatings = calibratedMilitaryRatingsV2(
      0,
      left.defenceSpending,
      left.sourceManpower,
      left.gdp / Math.max(0.000001, left.population) * 1_000,
      left.iqScore,
      left.gdp,
    );
    const rightRatings = calibratedMilitaryRatingsV2(
      0,
      right.defenceSpending,
      right.sourceManpower,
      right.gdp / Math.max(0.000001, right.population) * 1_000,
      right.iqScore,
      right.gdp,
    );
    const leftStrength = left.sourceManpower
      * (0.55 * leftRatings.attack + 0.45 * leftRatings.defense)
      * (1 + 0.08 * Math.log1p(left.researchCapacity));
    const rightStrength = right.sourceManpower
      * (0.55 * rightRatings.attack + 0.45 * rightRatings.defense)
      * (1 + 0.08 * Math.log1p(right.researchCapacity));
    return rightStrength - leftStrength || left.id.localeCompare(right.id);
  });
  return new Map(ranked.map((draft, index) => [
    draft.id,
    round(100 / (1 + 0.14 * index) ** 1.35, 9),
  ]));
}

function nuclearTierByGeneratedPowerV2(drafts: readonly RandomWorldDraftV2[]): Map<PlayerId, number> {
  const ranked = [...drafts].sort((left, right) => (
    right.powerIndex - left.powerIndex || left.id.localeCompare(right.id)
  ));
  return new Map(ranked.map((draft, index) => [
    draft.id,
    index < 2 ? 3 : index < 5 ? 2 : index < 9 ? 1 : 0,
  ]));
}

function calibratedOpeningMilitaryV2(draft: RandomWorldDraftV2): {
  initialManpower: number;
  attack: number;
  defense: number;
} {
  const gdpPerCapita = draft.gdp / Math.max(0.000001, draft.population) * 1_000;
  const foundation = calibratedMilitaryRatingsV2(
    draft.powerIndex,
    draft.defenceSpending,
    draft.sourceManpower,
    gdpPerCapita,
    draft.iqScore,
    draft.gdp,
  );
  const doctrineTilt = RANDOM_WORLD_DOCTRINE_TILT_MAX_V2
    * draft.profile.specialization.doctrine;
  const foundationAttack = foundation.attack * (1 + doctrineTilt);
  const foundationDefense = foundation.defense * (1 - doctrineTilt);
  const deterrenceAttackBonus = draft.nuclearPowerLevel * 0.04;
  const effectiveFoundation = 0.55 * foundationAttack * (1 + deterrenceAttackBonus)
    + 0.45 * foundationDefense;
  const targetOpeningPower = draft.powerIndex / 10;
  const targetManpower = targetOpeningPower / Math.max(0.0001, effectiveFoundation);
  const maximumOpeningRating = 18.5;
  const minimumManpowerForRatingCap = targetOpeningPower
    * Math.max(foundationAttack, foundationDefense)
    / Math.max(0.0001, effectiveFoundation * maximumOpeningRating);
  const initialManpower = round(Math.max(
    0.0001,
    Math.sqrt(draft.sourceManpower * targetManpower),
    minimumManpowerForRatingCap,
  ), 9);
  const openingCapacity = Math.max(
    0.0001,
    draft.population * ARMY_CAPACITY_STRUCTURAL_POPULATION_SHARE,
    initialManpower * ARMY_CAPACITY_INITIAL_FORCE_FLOOR,
  );
  const openingDeployedManpower = Math.min(initialManpower, openingCapacity);
  const ratings = calibratedMilitaryRatingsV2(
    draft.powerIndex,
    draft.defenceSpending,
    openingDeployedManpower,
    gdpPerCapita,
    draft.iqScore,
    draft.gdp,
  );
  const tiltedAttack = ratings.attack * (1 + doctrineTilt);
  const tiltedDefense = ratings.defense * (1 - doctrineTilt);
  const effectiveRatings = 0.55 * tiltedAttack * (1 + deterrenceAttackBonus)
    + 0.45 * tiltedDefense;
  const readinessCalibration = targetOpeningPower
    / Math.max(0.0001, openingDeployedManpower * effectiveRatings);
  return {
    initialManpower,
    attack: round(tiltedAttack * readinessCalibration, 9),
    defense: round(tiltedDefense * readinessCalibration, 9),
  };
}

function createRandomNationV2(draft: RandomWorldDraftV2): NationContentV2 {
  const profile = draft.profile;
  const specialization = profile.specialization;
  const gdpPerCapita = draft.gdp / Math.max(0.000001, draft.population) * 1_000;
  const military = calibratedOpeningMilitaryV2(draft);
  const baseFoodInsecurityRate = 0.19
      - 0.105 * profile.development
      - 0.075 * profile.institutions
      + 0.025 * profile.foodNoise;
  const foodInsecurityRate = round(clamp(
    baseFoodInsecurityRate - 0.04 * specialization.food,
    0.005,
    0.24,
  ), 9);
  const density = draft.population * 1_000_000 / Math.max(25, draft.base.real.landArea);
  const lowDensityBenefit = clamp(
    1 - Math.log(Math.max(4, density) / 4) / Math.log(1_100 / 4),
    0,
    1,
  );
  const real: NationRealDataV2 = Object.freeze({
    population: round(draft.population, 9),
    populationGrowthRate: round(clamp(
      2.45
        - 2.35 * profile.development
        + 0.35 * profile.demographyNoise
        + 0.90 * specialization.demography,
      -0.75,
      3.25,
    ), 9),
    deathRatePerThousand: round(clamp(
      14.5
        - 7.5 * profile.development
        - 2.0 * profile.institutions
        + 1.2 * profile.demographyNoise,
      3.5,
      18,
    ), 9),
    foodInsecurityRate,
    foodSelfSufficiencyRatio: round(clamp(
      0.38
        + 1.25 * profile.agriculture
        + 0.70 * lowDensityBenefit
        + 0.08 * profile.foodNoise
        + 0.65 * specialization.food,
      0.30,
      2.60,
    ), 9),
    landArea: draft.base.real.landArea,
    gdp: round(draft.gdp, 9),
    taxRevenueShare: round(clamp(
      0.12 + 0.22 * profile.institutions + 0.03 * profile.development
        + 0.08 * specialization.governance,
      0.10,
      0.38,
    ), 9),
    observedTaxRevenueShare: null,
    taxRevenueYear: null,
    taxRevenueSource: 'global-median',
    taxRevenueImputed: true,
    taxRevenueSector: null,
    taxRevenueAccountingBasis: null,
    defenceSpending: round(draft.defenceSpending, 9),
    powerIndex: draft.powerIndex,
    researchCapacity: round(draft.researchCapacity, 9),
  });

  return Object.freeze({
    ...draft.base,
    influenceTags: Object.freeze([
      `continent:${draft.base.continent.toLowerCase()}`,
      `subregion:${draft.base.subregion.toLowerCase()}`,
    ]),
    iqScore: draft.iqScore,
    militaryQuality: draft.militaryQuality,
    militaryAttackRating: military.attack,
    militaryDefenseRating: military.defense,
    nuclearPowerLevel: draft.nuclearPowerLevel,
    ambition: round(clamp(
      0.20 + 0.58 * profile.militarism + 0.08 * (1 - profile.institutions)
        + 0.10 * specialization.military - 0.04 * specialization.governance,
      0.20,
      0.86,
    ), 9),
    real,
    balance: Object.freeze({ initialManpower: military.initialManpower }),
  });
}

function createRandomDraftsV2(
  random: RandomStateV2,
  generatorVersion: number,
): RandomWorldDraftV2[] {
  const ids = randomizableNationIdsV2().sort((left, right) => left.localeCompare(right));
  const profiles = randomLatentProfilesV2(random, generatorVersion);
  const populationTarget = totalV2(
    ids.map((id) => WORLD_CONTENT_V2.nations[id]!.real.population),
  );
  const populationWeights = new Map(ids.map((id) => [id, profiles.get(id)!.populationWeight]));
  const populations = normalizeWeightsV2(
    ids,
    populationWeights,
    populationTarget,
    () => 0.025,
    () => 1_450,
  );

  const gdpWeights = new Map(ids.map((id) => {
    const profile = profiles.get(id)!;
    const perCapita = Math.exp(
      Math.log(800)
        + profile.development * (Math.log(110_000) - Math.log(800))
        + 0.30 * boundedBellV2(random)
        + 1.10 * profile.specialization.wealth,
    );
    return [id, populations.get(id)! * perCapita / 1_000] as const;
  }));
  const gdpTarget = totalV2(
    ids.map((id) => WORLD_CONTENT_V2.nations[id]!.real.gdp),
  );
  const gdps = normalizeWeightsV2(
    ids,
    gdpWeights,
    gdpTarget,
    (id) => Math.max(0.10, populations.get(id)! * 0.60),
    (id) => populations.get(id)! * 150,
  );

  const researchWeights = new Map(ids.map((id) => {
    const profile = profiles.get(id)!;
    const gdp = gdps.get(id)!;
    const population = populations.get(id)!;
    const gdpPerCapita = gdp / Math.max(0.000001, population) * 1_000;
    const value = 0.2
      + 2.7 * Math.log10(gdp + 1)
      + 7.5 * profile.institutions
      + 3.0 * clamp(Math.log10(Math.max(800, gdpPerCapita) / 800), 0, 2.3);
    return [
      id,
      Math.max(0.2, value) * Math.exp(1.25 * profile.specialization.science),
    ] as const;
  }));
  const researchTarget = totalV2(
    ids.map((id) => WORLD_CONTENT_V2.nations[id]!.real.researchCapacity),
  );
  const research = normalizeWeightsV2(
    ids,
    researchWeights,
    researchTarget,
    () => 0.2,
    () => 45,
  );

  const drafts = ids.map((id): RandomWorldDraftV2 => {
    const base = WORLD_CONTENT_V2.nations[id]!;
    const profile = profiles.get(id)!;
    const population = populations.get(id)!;
    const gdp = gdps.get(id)!;
    const gdpPerCapita = gdp / Math.max(0.000001, population) * 1_000;
    const researchCapacity = research.get(id)!;
    const baseIqScore = calibratedNationalIqScoreV2(gdpPerCapita, researchCapacity);
    const iqScore = profile.specialization.science === 0
      ? baseIqScore
      : round(clamp(
        baseIqScore + 7 * profile.specialization.science,
        NATIONAL_IQ_SCORE_MIN,
        NATIONAL_IQ_SCORE_MAX,
      ), 1);
    const militaryQuality = round(clamp(
      0.75 + 1.55 * nationalQualityIndexV2(gdpPerCapita, iqScore),
      0.75,
      2.30,
    ), 9);
    const militaryBurden = clamp(
      (0.008 + 0.060 * profile.militarism ** 1.55 + 0.008 * (1 - profile.institutions))
        * Math.exp(0.95 * profile.specialization.military),
      0.008,
      0.08,
    );
    const defenceSpending = Math.max(0.000001, gdp * militaryBurden);
    const professionalForceShare = clamp(
      (0.00045
        + 0.0065 * profile.militarism ** 1.35 * (0.75 + 0.50 * profile.institutions))
        * Math.exp(0.80 * profile.specialization.military),
      0.00035,
      0.012,
    );
    return {
      id,
      base,
      profile,
      population,
      gdp,
      researchCapacity,
      defenceSpending,
      iqScore,
      militaryQuality,
      sourceManpower: round(Math.max(0.0001, population * professionalForceShare), 9),
      powerIndex: 0,
      nuclearPowerLevel: 0,
    };
  });

  const powerIndexes = powerIndexByGeneratedRankV2(drafts);
  for (const draft of drafts) draft.powerIndex = powerIndexes.get(draft.id)!;
  const nuclearTiers = nuclearTierByGeneratedPowerV2(drafts);
  for (const draft of drafts) draft.nuclearPowerLevel = nuclearTiers.get(draft.id)!;
  return drafts;
}

/**
 * Build one complete Random World while retaining only geographic and visual
 * identity from the canonical map. The function has no cache and never
 * mutates or returns mutable references from WORLD_CONTENT_V2.
 */
export function createRandomWorldContentV2(
  seedInput: number,
  generatorVersion = RANDOM_WORLD_GENERATOR_VERSION_V2,
): WorldContentV2 {
  if (generatorVersion !== LEGACY_RANDOM_WORLD_GENERATOR_VERSION_V2
    && generatorVersion !== RANDOM_WORLD_GENERATOR_VERSION_V2) {
    throw new Error(`Unsupported Alternative Universe generator version ${generatorVersion}.`);
  }
  const random: RandomStateV2 = {
    rngState: mixedGeneratorSeedV2(seedInput, generatorVersion),
  };
  const drafts = createRandomDraftsV2(random, generatorVersion);
  const nations = Object.fromEntries([
    ...drafts.map((draft) => [draft.id, createRandomNationV2(draft)] as const),
    ...WORLD_CONTENT_V2.nationIds
      .filter((id) => isRogueAiNationV2(WORLD_CONTENT_V2, id))
      .map((id) => [id, WORLD_CONTENT_V2.nations[id]!] as const),
  ]) as Record<PlayerId, NationContentV2>;
  const territories = Object.fromEntries(WORLD_CONTENT_V2.territoryIds.map((id) => {
    const base = WORLD_CONTENT_V2.territories[id]!;
    const owner = nations[base.initialOwnerId];
    if (!owner) throw new Error(`Alternative Universe is missing initial owner ${base.initialOwnerId}.`);
    const value: TerritoryContentV2 = Object.freeze({
      ...base,
      // Antarctica remains the same authored survival empire in every mode;
      // only ordinary human-world countries are regenerated from the seed.
      baseline: Object.freeze(isRogueAiNationV2(WORLD_CONTENT_V2, base.initialOwnerId)
        ? { ...base.baseline }
        : { ...owner.real }),
      connections: Object.freeze(base.connections.map((connection) => Object.freeze({ ...connection }))),
    });
    return [id, value] as const;
  })) as Record<TerritoryId, TerritoryContentV2>;

  return Object.freeze({
    metadata: Object.freeze({
      scenarioId: 'random-world',
      scenarioVersion: generatorVersion,
      contentVersion: randomWorldContentVersionV2(seedInput, generatorVersion),
      generatedFromSeed: normalizeSeed(seedInput),
      startYear: 2026,
      openingProfile: 'none',
      geopoliticsProfile: 'neutral',
      reserveProfile: 'generated',
    }),
    nationIds: Object.freeze([...WORLD_CONTENT_V2.nationIds]),
    territoryIds: Object.freeze([...WORLD_CONTENT_V2.territoryIds]),
    nations: Object.freeze(nations),
    territories: Object.freeze(territories),
  });
}
