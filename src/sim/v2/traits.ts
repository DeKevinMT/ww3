import type {
  PlayerId,
  ResearchBranchV2,
  TerrainType,
  WarAccessV2,
} from './types';
import {
  OPENING_MILITARY_ORDER_2026_V2,
  WORLD_CONTENT_V2,
  type WorldContentV2,
} from './content';

/** Existing V2 outputs that a country trait is allowed to scale. */
export const TRAIT_MODIFIER_KEYS_V2 = [
  'operation-cost',
  'front-supply',
  'defense',
  'attack',
  'army-capacity',
  'passive-recruitment',
  'accelerated-recruitment',
  'recruitment-throughput',
  'recruitment-cost',
  'rapid-recruitment-cost',
  'reserve-training',
  'reserve-capacity',
  'reserve-deployment-throughput',
  'military-casualties',
  'army-upkeep',
  'condition-recovery',
  'condition-loss',
  'tax-efficiency',
  'base-operating-cost',
  'development-economy-growth',
  'population-growth',
  'population-growth-funding',
  'national-iq',
  'research-output',
  'research-progress',
  'research-catch-up-bonus',
  'food-production',
  'food-production-cost',
  'food-import-cost',
  'food-storage-capacity',
  'food-export-income',
  'food-logistics-pressure',
  'food-access-vulnerability',
  'integration-duration',
  'integration-cost',
  'naval-distance-pressure',
  'land-hop-pressure',
  'war-fatigue-operation-surcharge',
  'war-fatigue-gain',
  'war-fatigue-recovery',
  'starting-treasury',
  'treasury-seizure',
] as const;

export type TraitModifierKeyV2 = typeof TRAIT_MODIFIER_KEYS_V2[number];
export type TraitWarRoleV2 = 'attacker' | 'defender';

/**
 * All fields are projections of state or of the operation currently being
 * evaluated. Nothing here is persisted. `terrain` means the relevant source,
 * target or owned territory for the result channel being queried. `homeland`
 * means immutable opening ownership (`initialOwnerId === active playerId`), not
 * a territory made core later through integration.
 */
export interface TraitEvaluationContextV2 {
  /** Human seats amplify this same trait; they never add a second trait. */
  readonly humanControlled?: boolean;
  /** Scenario-aware runtime override; omitted contexts retain Standard 2026 compatibility. */
  readonly humanTraitMultiplier?: number;
  readonly atWar?: boolean;
  readonly role?: TraitWarRoleV2;
  readonly access?: WarAccessV2;
  readonly terrain?: TerrainType;
  readonly homeland?: boolean;
  readonly foodSecurity?: number;
  readonly treasury?: number;
  readonly condition?: number;
  readonly firstConquest?: boolean;
  readonly bothFronts?: boolean;
  readonly hasLandFront?: boolean;
  readonly researchBranch?: ResearchBranchV2;
}

export interface TraitModifierScopeV2 {
  readonly atWar?: boolean;
  readonly role?: TraitWarRoleV2;
  readonly access?: Exclude<WarAccessV2, 'none'>;
  readonly terrain?: TerrainType;
  readonly homeland?: boolean;
  readonly foodSecurityAtLeast?: number;
  readonly foodSecurityBelow?: number;
  readonly treasuryAtLeast?: number;
  readonly conditionBelow?: number;
  readonly firstConquest?: boolean;
  readonly bothFronts?: boolean;
  readonly hasLandFront?: boolean;
  readonly researchBranches?: readonly ResearchBranchV2[];
}

/** Records a catalog clause that replaces an existing constant rather than scaling an open-ended value. */
export interface TraitReplacementV2 {
  readonly from: number;
  readonly to: number;
  readonly unit: 'share';
}

export interface CountryTraitModifierV2 {
  readonly key: TraitModifierKeyV2;
  /** Signed catalog percentage: +10 means +10%, -20 means -20%. */
  readonly percentage: number;
  readonly factor: number;
  readonly scope?: TraitModifierScopeV2;
  readonly replacement?: TraitReplacementV2;
}

export interface CountryTraitV2 {
  readonly playerId: PlayerId;
  readonly countryName: string;
  readonly name: string;
  /** English effect text generated from the exact immutable modifiers below. */
  readonly effect: string;
  /** English play-identity text. */
  readonly description: string;
  /** Audited opening limitation that at least one modifier directly improves. */
  readonly openingWeakness: TraitOpeningWeaknessV2;
  /** Runtime-guarded to one, two or three immutable entries. */
  readonly modifiers: readonly CountryTraitModifierV2[];
}

export type TraitOpeningWeaknessV2 =
  | 'force-capacity'
  | 'combat-survivability'
  | 'operational-reach'
  | 'fiscal-resilience'
  | 'food-security'
  | 'research-gap'
  | 'integration-burden'
  | 'demographic-growth'
  | 'war-endurance';

const TRAIT_OPENING_WEAKNESS_BY_KEY_V2: Readonly<Record<TraitModifierKeyV2, TraitOpeningWeaknessV2>> = Object.freeze({
  'operation-cost': 'operational-reach',
  'front-supply': 'operational-reach',
  defense: 'combat-survivability',
  attack: 'combat-survivability',
  'army-capacity': 'force-capacity',
  'passive-recruitment': 'force-capacity',
  'accelerated-recruitment': 'force-capacity',
  'recruitment-throughput': 'force-capacity',
  'recruitment-cost': 'force-capacity',
  'rapid-recruitment-cost': 'force-capacity',
  'reserve-training': 'force-capacity',
  'reserve-capacity': 'force-capacity',
  'reserve-deployment-throughput': 'force-capacity',
  'military-casualties': 'combat-survivability',
  'army-upkeep': 'fiscal-resilience',
  'condition-recovery': 'combat-survivability',
  'condition-loss': 'combat-survivability',
  'tax-efficiency': 'fiscal-resilience',
  'base-operating-cost': 'fiscal-resilience',
  'development-economy-growth': 'fiscal-resilience',
  'population-growth': 'demographic-growth',
  'population-growth-funding': 'demographic-growth',
  'national-iq': 'research-gap',
  'research-output': 'research-gap',
  'research-progress': 'research-gap',
  'research-catch-up-bonus': 'research-gap',
  'food-production': 'food-security',
  'food-production-cost': 'food-security',
  'food-import-cost': 'food-security',
  'food-storage-capacity': 'food-security',
  'food-export-income': 'food-security',
  'food-logistics-pressure': 'food-security',
  'food-access-vulnerability': 'food-security',
  'integration-duration': 'integration-burden',
  'integration-cost': 'integration-burden',
  'naval-distance-pressure': 'operational-reach',
  'land-hop-pressure': 'operational-reach',
  'war-fatigue-operation-surcharge': 'war-endurance',
  'war-fatigue-gain': 'war-endurance',
  'war-fatigue-recovery': 'war-endurance',
  'starting-treasury': 'fiscal-resilience',
  'treasury-seizure': 'fiscal-resilience',
});

/** Immutable pure-2026 conventional military order, strongest to weakest. */
export const OPENING_MILITARY_ORDER_V2: readonly PlayerId[]
  = OPENING_MILITARY_ORDER_2026_V2;

const openingMilitaryRankByPlayerIdV2 = Object.freeze(Object.fromEntries(
  OPENING_MILITARY_ORDER_V2.map((playerId, index) => [playerId, index + 1]),
) as Readonly<Record<string, number>>);

export const HUMAN_TRAIT_MULTIPLIER_STRONGEST_V2 = 1;
export const HUMAN_TRAIT_MULTIPLIER_WEAKEST_V2 = 2.5;
export const HUMAN_STARTING_ARMY_MULTIPLIER_STRONGEST_V2 = 0.5;
export const HUMAN_STARTING_ARMY_MULTIPLIER_WEAKEST_V2 = 12;
export const HUMAN_MILITARY_RANK_CURVE_EXPONENT_V2 = 1;
export const ABSOLUTE_UNDERDOG_ARMY_CAP_COUNT_V2 = 24;

const HUMAN_STARTING_ARMY_CURVE_V2 = Object.freeze([
  { rankShare: 0, multiplier: HUMAN_STARTING_ARMY_MULTIPLIER_STRONGEST_V2 },
  { rankShare: 0.03, multiplier: 1 },
  { rankShare: 0.25, multiplier: 1.10 },
  { rankShare: 0.50, multiplier: 1.50 },
  { rankShare: 0.55, multiplier: 2 },
  { rankShare: 0.65, multiplier: 7.50 },
  { rankShare: 0.75, multiplier: 9 },
  { rankShare: 0.90, multiplier: 11 },
  { rankShare: 1, multiplier: HUMAN_STARTING_ARMY_MULTIPLIER_WEAKEST_V2 },
]);

const openingMilitaryOrderCacheV2 = new WeakMap<WorldContentV2, readonly PlayerId[]>();
const openingMilitaryRankRegistryV2 = new Map<string, ReadonlyMap<PlayerId, number>>();

const rankMapForOrderV2 = (order: readonly PlayerId[]): ReadonlyMap<PlayerId, number> => (
  new Map(order.map((playerId, index) => [playerId, index + 1]))
);

openingMilitaryRankRegistryV2.set(
  WORLD_CONTENT_V2.metadata!.contentVersion,
  rankMapForOrderV2(OPENING_MILITARY_ORDER_V2),
);

/** Standard keeps its authored ranking; generated scenarios rank their generated power. */
export function openingMilitaryOrderForContentV2(content: WorldContentV2): readonly PlayerId[] {
  if (content.metadata?.scenarioId === 'standard-2026') return OPENING_MILITARY_ORDER_V2;
  const cached = openingMilitaryOrderCacheV2.get(content);
  if (cached) return cached;
  const order = Object.freeze([...content.nationIds].sort((left, right) => (
    (content.nations[right]?.real.powerIndex ?? 0)
      - (content.nations[left]?.real.powerIndex ?? 0)
    || left.localeCompare(right)
  )));
  openingMilitaryOrderCacheV2.set(content, order);
  return order;
}

export function openingMilitaryRankForContentV2(
  content: WorldContentV2,
  playerId: PlayerId | string,
): number | undefined {
  const id = String(playerId) as PlayerId;
  const order = openingMilitaryOrderForContentV2(content);
  const index = order.indexOf(id);
  return index < 0 ? undefined : index + 1;
}

/** Registers only canonical scenario content, never ad-hoc fixture worlds. */
export function registerTraitContentV2(content: WorldContentV2): void {
  const version = content.metadata?.contentVersion;
  if (!version) return;
  const ranks = rankMapForOrderV2(openingMilitaryOrderForContentV2(content));
  const existing = openingMilitaryRankRegistryV2.get(version);
  if (existing) {
    const order = content.nationIds;
    if (order.some((id) => existing.get(id) !== ranks.get(id))) {
      throw new Error(`Trait rank registry collision for content version ${version}.`);
    }
    return;
  }
  openingMilitaryRankRegistryV2.set(version, ranks);
}

const absoluteUnderdogArmyCapIdsV2 = new Set<PlayerId>(
  OPENING_MILITARY_ORDER_V2.slice(-ABSOLUTE_UNDERDOG_ARMY_CAP_COUNT_V2),
);

export const openingMilitaryRankV2 = (playerId: PlayerId | string): number | undefined => (
  openingMilitaryRankByPlayerIdV2[String(playerId)]
);

function humanMilitaryRankCurveV2(
  playerId: PlayerId | string,
  order: readonly PlayerId[],
): number {
  const index = order.indexOf(String(playerId) as PlayerId);
  const rank = index < 0 ? undefined : index + 1;
  if (!rank) return 0;
  const span = Math.max(1, order.length - 1);
  const normalizedRank = (rank - 1) / span;
  // Trait and opening-army help use different endpoints, but share a linear
  // rank factor. This separates the upper tiers early enough for countries
  // such as the UK and Italy to differ visibly from the USA and China.
  return normalizedRank ** HUMAN_MILITARY_RANK_CURVE_EXPONENT_V2;
}

function humanStartingArmyMultiplierFromRankFactorV2(rankFactor: number): number {
  for (let index = 1; index < HUMAN_STARTING_ARMY_CURVE_V2.length; index += 1) {
    const left = HUMAN_STARTING_ARMY_CURVE_V2[index - 1]!;
    const right = HUMAN_STARTING_ARMY_CURVE_V2[index]!;
    if (rankFactor > right.rankShare) continue;
    const progress = Math.max(0, Math.min(1,
      (rankFactor - left.rankShare) / Math.max(0.000001, right.rankShare - left.rankShare),
    ));
    const eased = progress * progress * (3 - 2 * progress);
    return left.multiplier + (right.multiplier - left.multiplier) * eased;
  }
  return HUMAN_STARTING_ARMY_MULTIPLIER_WEAKEST_V2;
}

/**
 * Smooth, deterministic human boost based only on immutable opening military
 * rank. It scales each signed modifier away from neutral; it is never stored
 * as or combined with another country trait.
 */
export function humanCountryTraitMultiplierV2(playerId: PlayerId | string): number {
  const smoothRank = humanMilitaryRankCurveV2(playerId, OPENING_MILITARY_ORDER_V2);
  return HUMAN_TRAIT_MULTIPLIER_STRONGEST_V2
    + (HUMAN_TRAIT_MULTIPLIER_WEAKEST_V2 - HUMAN_TRAIT_MULTIPLIER_STRONGEST_V2) * smoothRank;
}

/** Opening-only deployed-force help for a human seat; AI countries stay at 1x. */
export function humanStartingArmyMultiplierV2(playerId: PlayerId | string): number {
  const smoothRank = humanMilitaryRankCurveV2(playerId, OPENING_MILITARY_ORDER_V2);
  return humanStartingArmyMultiplierFromRankFactorV2(smoothRank);
}

export function humanCountryTraitMultiplierForContentV2(
  content: WorldContentV2,
  playerId: PlayerId | string,
): number {
  const smoothRank = humanMilitaryRankCurveV2(
    playerId,
    openingMilitaryOrderForContentV2(content),
  );
  return HUMAN_TRAIT_MULTIPLIER_STRONGEST_V2
    + (HUMAN_TRAIT_MULTIPLIER_WEAKEST_V2 - HUMAN_TRAIT_MULTIPLIER_STRONGEST_V2) * smoothRank;
}

export function humanStartingArmyMultiplierForContentV2(
  content: WorldContentV2,
  playerId: PlayerId | string,
): number {
  const smoothRank = humanMilitaryRankCurveV2(
    playerId,
    openingMilitaryOrderForContentV2(content),
  );
  return humanStartingArmyMultiplierFromRankFactorV2(smoothRank);
}

export function humanCountryTraitMultiplierForContentVersionV2(
  playerId: PlayerId | string,
  contentVersion: string,
): number {
  const ranks = openingMilitaryRankRegistryV2.get(contentVersion);
  // Legacy saves predate scenario-specific rankings. Their country ids still
  // use the authored Standard order, so falling back preserves their exact
  // controller trait semantics while current Random worlds remain registered
  // under their seed-bearing content identity.
  if (!ranks) return humanCountryTraitMultiplierV2(playerId);
  const rank = ranks.get(String(playerId) as PlayerId);
  if (!rank) return HUMAN_TRAIT_MULTIPLIER_STRONGEST_V2;
  const normalizedRank = (rank - 1) / Math.max(1, ranks.size - 1);
  const smoothRank = normalizedRank ** HUMAN_MILITARY_RANK_CURVE_EXPONENT_V2;
  return HUMAN_TRAIT_MULTIPLIER_STRONGEST_V2
    + (HUMAN_TRAIT_MULTIPLIER_WEAKEST_V2 - HUMAN_TRAIT_MULTIPLIER_STRONGEST_V2) * smoothRank;
}

type ModifierTupleV2 =
  | readonly [CountryTraitModifierV2]
  | readonly [CountryTraitModifierV2, CountryTraitModifierV2]
  | readonly [CountryTraitModifierV2, CountryTraitModifierV2, CountryTraitModifierV2];

const freezeScope = (scope?: TraitModifierScopeV2): TraitModifierScopeV2 | undefined => {
  if (!scope) return undefined;
  // Country identity follows the empire. Terrain and immutable 2026 homeland
  // are not gameplay conditions; broader effects are value-normalized down.
  const { homeland: _homeland, terrain: _terrain, ...portableScope } = scope;
  const frozen = {
    ...portableScope,
    researchBranches: scope.researchBranches
      ? Object.freeze([...scope.researchBranches])
      : undefined,
  };
  return Object.values(frozen).every((value) => value === undefined)
    ? undefined
    : Object.freeze(frozen);
};

const modifier = (
  key: TraitModifierKeyV2,
  percentage: number,
  scope?: TraitModifierScopeV2,
  replacement?: TraitReplacementV2,
): CountryTraitModifierV2 => Object.freeze({
  key,
  percentage,
  factor: 1 + percentage / 100,
  scope: freezeScope(scope),
  replacement: replacement ? Object.freeze({ ...replacement }) : undefined,
});

const TRAIT_MODIFIER_LABELS_V2: Readonly<Record<TraitModifierKeyV2, string>> = Object.freeze({
  'operation-cost': 'operation cost',
  'front-supply': 'front supply',
  defense: 'defense',
  attack: 'attack',
  'army-capacity': 'army capacity',
  'passive-recruitment': 'passive recruitment',
  'accelerated-recruitment': 'accelerated recruitment',
  'recruitment-throughput': 'recruitment throughput',
  'recruitment-cost': 'recruitment cost',
  'rapid-recruitment-cost': 'rapid recruitment cost',
  'reserve-training': 'reserve training',
  'reserve-capacity': 'trained reserve capacity',
  'reserve-deployment-throughput': 'reserve deployment throughput',
  'military-casualties': 'military casualties',
  'army-upkeep': 'army upkeep',
  'condition-recovery': 'condition recovery',
  'condition-loss': 'condition loss from combat',
  'tax-efficiency': 'tax revenue',
  'base-operating-cost': 'base operating cost',
  'development-economy-growth': 'development-driven economy growth',
  'population-growth': 'population growth',
  'population-growth-funding': 'funded population-growth effect',
  'national-iq': 'IQ',
  'research-output': 'research output',
  'research-progress': 'research progress',
  'research-catch-up-bonus': 'research catch-up bonus',
  'food-production': 'domestic food production',
  'food-production-cost': 'food production cost',
  'food-import-cost': 'food import cost',
  'food-storage-capacity': 'food storage capacity',
  'food-export-income': 'food export income',
  'food-logistics-pressure': 'food used by military logistics',
  'food-access-vulnerability': 'food-access problems',
  'integration-duration': 'integration duration',
  'integration-cost': 'integration cost',
  'naval-distance-pressure': 'naval distance penalty',
  'land-hop-pressure': 'long land-route penalty',
  'war-fatigue-operation-surcharge': 'war-fatigue operation cost penalty',
  'war-fatigue-gain': 'war-fatigue gain',
  'war-fatigue-recovery': 'war-fatigue recovery',
  'starting-treasury': 'starting treasury',
  'treasury-seizure': 'treasury lost when eliminated',
});

const traitNumberTextV2 = (value: number): string => {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
};

const percentageTextV2 = (percentage: number): string => {
  const value = traitNumberTextV2(Math.abs(percentage));
  return `${percentage < 0 ? '−' : '+'}${value}%`;
};

const modifierScopeTextV2 = (scope?: TraitModifierScopeV2): string => {
  if (!scope) return '';
  const conditions: string[] = [];
  if (scope.atWar !== undefined) conditions.push(scope.atWar ? 'while at war' : 'while at peace');
  if (scope.role !== undefined) conditions.push(scope.role === 'attacker' ? 'when attacking' : 'when defending');
  if (scope.access !== undefined) conditions.push(`on ${scope.access} fronts`);
  if (scope.terrain !== undefined) conditions.push(`in ${scope.terrain} terrain`);
  if (scope.homeland !== undefined) conditions.push(scope.homeland
    ? 'in original homeland territory'
    : 'outside original homeland territory');
  if (scope.foodSecurityAtLeast !== undefined) conditions.push(`while food security is at least ${scope.foodSecurityAtLeast * 100}%`);
  if (scope.foodSecurityBelow !== undefined) conditions.push(`while food security is below ${scope.foodSecurityBelow * 100}%`);
  if (scope.treasuryAtLeast !== undefined) conditions.push(`while treasury is at least ${scope.treasuryAtLeast}`);
  if (scope.conditionBelow !== undefined) conditions.push(`while territory condition is below ${scope.conditionBelow * 100}%`);
  if (scope.firstConquest !== undefined) conditions.push(scope.firstConquest ? 'for the first conquest' : 'after the first conquest');
  if (scope.bothFronts !== undefined) conditions.push(scope.bothFronts
    ? 'while both land and naval fronts are active'
    : 'unless both land and naval fronts are active');
  if (scope.hasLandFront !== undefined) conditions.push(scope.hasLandFront
    ? 'while a land front is active'
    : 'while no land front is active');
  if (scope.researchBranches !== undefined) conditions.push(`in ${scope.researchBranches.join(' and ')}`);
  return conditions.length ? ` ${conditions.join(' ')}` : '';
};

/** Mechanical English text: percentages and conditions cannot drift from runtime data. */
export const describeCountryTraitModifiersV2 = (
  modifiers: readonly CountryTraitModifierV2[],
  signedDistanceMultiplier = 1,
): string => modifiers.map((entry) => {
  const rawScaledPercentage = entry.percentage * signedDistanceMultiplier;
  if (entry.replacement) {
    const scaledReplacement = Math.max(0, entry.replacement.from
      + (entry.replacement.to - entry.replacement.from) * signedDistanceMultiplier);
    const scaledPercentage = entry.replacement.from > 0
      ? (scaledReplacement / entry.replacement.from - 1) * 100
      : rawScaledPercentage;
    return `${percentageTextV2(scaledPercentage)} ${TRAIT_MODIFIER_LABELS_V2[entry.key]} (${traitNumberTextV2(scaledReplacement * 100)}% instead of ${traitNumberTextV2(entry.replacement.from * 100)}%)${modifierScopeTextV2(entry.scope)}`;
  }
  // A large underdog multiplier must never imply negative duration, distance,
  // losses or costs. These floors mirror the runtime hard minimum factors.
  const reductionFloor = entry.key === 'military-casualties' ? -65
    : entry.key === 'integration-duration' ? -75
      : entry.key === 'naval-distance-pressure' || entry.key === 'land-hop-pressure' ? -80
        : -90;
  const scaledPercentage = entry.key === 'national-iq'
    ? Math.min(15, rawScaledPercentage)
    : Math.max(reductionFloor, rawScaledPercentage);
  return `${percentageTextV2(scaledPercentage)} ${TRAIT_MODIFIER_LABELS_V2[entry.key]}${modifierScopeTextV2(entry.scope)}`;
}).join('; ') + '.';

/**
 * Every AI country receives the same approximate base-trait value. Percentages
 * are deliberately not interchangeable: direct combat, force capacity and
 * compounding systems consume much more of the budget than food or storage.
 * Human underdog scaling is applied later and does not alter this base budget.
 */
export const BASE_COUNTRY_TRAIT_VALUE_BUDGET_V2 = 26;
const GREENLAND_TRAIT_VALUE_BUDGET_V2 = 20;
const FIXED_REPLACEMENT_VALUE_BUDGET_V2 = 4;

const TRAIT_VALUE_WEIGHT_BY_KEY_V2: Readonly<Record<TraitModifierKeyV2, number>> = Object.freeze({
  'operation-cost': 1.2,
  'front-supply': 1.1,
  // Broad defense is available on every relevant battle and compounds with
  // casualty mitigation, so it consumes more identity budget than attack.
  defense: 2.1,
  attack: 1.8,
  'army-capacity': 1.8,
  'passive-recruitment': 1.3,
  'accelerated-recruitment': 1.25,
  'recruitment-throughput': 1.3,
  'recruitment-cost': 1.2,
  'rapid-recruitment-cost': 1.1,
  'reserve-training': 0.9,
  'reserve-capacity': 1.1,
  'reserve-deployment-throughput': 1.1,
  'military-casualties': 1.7,
  'army-upkeep': 1.3,
  'condition-recovery': 0.8,
  'condition-loss': 1,
  'tax-efficiency': 1.25,
  'base-operating-cost': 1.25,
  'development-economy-growth': 1.1,
  'population-growth': 1.5,
  'population-growth-funding': 1.4,
  // IQ feeds combat quality, growth, research and logistics simultaneously.
  'national-iq': 8,
  'research-output': 1.4,
  'research-progress': 1.3,
  'research-catch-up-bonus': 0.9,
  'food-production': 0.45,
  'food-production-cost': 0.6,
  'food-import-cost': 0.5,
  'food-storage-capacity': 0.35,
  'food-export-income': 0.6,
  'food-logistics-pressure': 0.65,
  'food-access-vulnerability': 0.7,
  'integration-duration': 0.8,
  'integration-cost': 0.9,
  'naval-distance-pressure': 0.55,
  'land-hop-pressure': 0.65,
  'war-fatigue-operation-surcharge': 0.65,
  'war-fatigue-gain': 1,
  'war-fatigue-recovery': 0.8,
  'starting-treasury': 0.4,
  'treasury-seizure': 0.1,
});

const traitScopeAvailabilityV2 = (scope?: TraitModifierScopeV2): number => {
  if (!scope) return 1;
  let availability = 1;
  if (scope.atWar !== undefined) availability *= 0.8;
  if (scope.role !== undefined) availability *= 0.75;
  if (scope.access !== undefined) availability *= 0.8;
  if (scope.terrain !== undefined) availability *= 0.65;
  if (scope.homeland !== undefined) availability *= 0.7;
  if (scope.foodSecurityAtLeast !== undefined || scope.foodSecurityBelow !== undefined) availability *= 0.45;
  if (scope.treasuryAtLeast !== undefined) availability *= 0.85;
  if (scope.conditionBelow !== undefined) availability *= 0.45;
  if (scope.firstConquest !== undefined) availability *= 0.25;
  if (scope.bothFronts !== undefined) availability *= 0.35;
  if (scope.hasLandFront !== undefined) availability *= 0.55;
  if (scope.researchBranches !== undefined) availability *= scope.researchBranches.length > 1 ? 0.65 : 0.45;
  return Math.max(0.3, availability);
};

const traitModifierBaseValueV2 = (entry: CountryTraitModifierV2): number => (
  entry.replacement
    ? FIXED_REPLACEMENT_VALUE_BUDGET_V2
    : Math.abs(entry.percentage)
      * TRAIT_VALUE_WEIGHT_BY_KEY_V2[entry.key]
      * traitScopeAvailabilityV2(entry.scope)
);

export const countryTraitBaseValueScoreV2 = (
  entry: Pick<CountryTraitV2, 'modifiers'>,
): number => entry.modifiers.reduce((sum, modifierEntry) => (
  sum + traitModifierBaseValueV2(modifierEntry)
), 0);

const baseTraitPercentageBoundsV2 = (key: TraitModifierKeyV2): readonly [number, number] => {
  if (key === 'military-casualties') return [-20, 0];
  if (key === 'naval-distance-pressure') return [-45, 0];
  if (key === 'treasury-seizure') return [-60, 0];
  if (key === 'starting-treasury') return [0, 75];
  if (key === 'national-iq') return [0, 1.25];
  return [-30, 30];
};

export const MICROSTATE_GROWTH_KEYS_V2 = new Set<TraitModifierKeyV2>([
  'army-capacity', 'passive-recruitment', 'accelerated-recruitment',
  'recruitment-throughput', 'reserve-training', 'reserve-capacity',
  'reserve-deployment-throughput', 'tax-efficiency',
  'development-economy-growth', 'population-growth', 'research-output',
  'research-progress', 'research-catch-up-bonus', 'national-iq',
]);

const MICROSTATE_REPLACEMENT_PRIORITY_V2: readonly TraitModifierKeyV2[] = Object.freeze([
  'operation-cost', 'base-operating-cost', 'starting-treasury',
  'food-import-cost', 'food-storage-capacity', 'condition-recovery',
  'integration-cost', 'naval-distance-pressure',
]);

/**
 * Flat trait DEF is intentionally retired. It was passive, hard to read in a
 * forecast and too easy to compound with the normal GDP/IQ defense model.
 * Each former slot becomes an unconditional growth or mobilisation tool that
 * preserves the country's broad identity while creating an active route to
 * more power.
 */
const replaceDirectDefenseTraitsV2 = (
  playerId: string,
  sourceModifiers: ModifierTupleV2,
): ModifierTupleV2 => {
  if (!sourceModifiers.some((entry) => entry.key === 'defense')) return sourceModifiers;
  const keys = new Set(sourceModifiers
    .filter((entry) => entry.key !== 'defense')
    .map((entry) => entry.key));
  const rank = openingMilitaryRankV2(playerId) ?? OPENING_MILITARY_ORDER_V2.length;
  const isMicrostate = (WORLD_CONTENT_V2.nations[playerId as PlayerId]?.real.population ?? Infinity) < 3;
  const hasAny = (...candidates: TraitModifierKeyV2[]): boolean => (
    candidates.some((candidate) => keys.has(candidate))
  );
  const candidates = absoluteUnderdogArmyCapIdsV2.has(playerId as PlayerId) || isMicrostate
    ? ['army-capacity', 'recruitment-throughput', 'passive-recruitment'] as const
    : hasAny('military-casualties', 'condition-loss', 'condition-recovery')
      ? ['reserve-deployment-throughput', 'recruitment-throughput', 'army-capacity'] as const
      : hasAny('front-supply', 'operation-cost', 'naval-distance-pressure', 'land-hop-pressure')
        ? ['reserve-capacity', 'recruitment-throughput', 'integration-duration'] as const
        : hasAny('food-production', 'food-import-cost', 'food-storage-capacity')
          ? ['population-growth', 'reserve-training', 'army-capacity'] as const
          : hasAny('tax-efficiency', 'development-economy-growth', 'research-output', 'research-progress')
            ? ['research-output', 'passive-recruitment', 'reserve-training'] as const
            : rank > 115
              ? ['army-capacity', 'recruitment-throughput', 'passive-recruitment'] as const
              : rank > 45
                ? ['recruitment-throughput', 'reserve-capacity', 'passive-recruitment'] as const
                : ['reserve-deployment-throughput', 'research-output', 'recruitment-throughput'] as const;
  const next = sourceModifiers.map((entry) => {
    if (entry.key !== 'defense') return entry;
    const replacementKey = candidates.find((candidate) => !keys.has(candidate))
      ?? 'recruitment-throughput';
    keys.add(replacementKey);
    return modifier(replacementKey, Math.abs(entry.percentage));
  });
  // Montenegro's original naval discount was passive and duplicated Eritrea's
  // full post-DEF package. Keep its fortress identity, but turn the last slot
  // into continuing force growth instead of cheaper operations.
  if (playerId === 'mne') {
    const operationIndex = next.findIndex((entry) => entry.key === 'operation-cost');
    if (operationIndex >= 0) next[operationIndex] = modifier('passive-recruitment', 12);
  }
  // Suriname keeps the survival slot but pairs it with demographic growth;
  // otherwise its post-DEF mechanics would be identical to Papua New Guinea.
  if (playerId === 'sur') {
    const foodIndex = next.findIndex((entry) => entry.key === 'food-production');
    if (foodIndex >= 0) next[foodIndex] = modifier('population-growth', 6);
  }
  return Object.freeze(next) as ModifierTupleV2;
};

const ABSOLUTE_UNDERDOG_REPLACEMENT_PRIORITY_V2: readonly TraitModifierKeyV2[] = Object.freeze([
  'starting-treasury', 'base-operating-cost', 'operation-cost',
  'food-storage-capacity', 'food-import-cost', 'food-production',
  'food-production-cost', 'condition-recovery',
  'integration-cost', 'development-economy-growth', 'defense',
]);

/** The weakest opening militaries all retain a permanent route to force growth. */
const ensureAbsoluteUnderdogArmyCapacityV2 = (
  playerId: string,
  modifiers: ModifierTupleV2,
): ModifierTupleV2 => {
  if (!absoluteUnderdogArmyCapIdsV2.has(playerId as PlayerId)
    || modifiers.some((entry) => entry.key === 'army-capacity')) return modifiers;
  const priorityKey = ABSOLUTE_UNDERDOG_REPLACEMENT_PRIORITY_V2.find((key) => (
    modifiers.some((entry) => entry.key === key)
  ));
  const replaceIndex = priorityKey
    ? modifiers.findIndex((entry) => entry.key === priorityKey)
    : modifiers.length - 1;
  const next = [...modifiers];
  next[replaceIndex] = modifier('army-capacity', 12);
  return Object.freeze(next) as ModifierTupleV2;
};

/**
 * A microstate trait must contain a genuine route to more national strength.
 * Its other modifiers retain the country's identity, while one passive cost
 * discount is replaced when the original design had no compounding engine.
 */
const ensureMicrostateGrowthEngineV2 = (
  playerId: string,
  modifiers: ModifierTupleV2,
): ModifierTupleV2 => {
  const nation = WORLD_CONTENT_V2.nations[playerId as PlayerId];
  if (!nation || nation.real.population >= 3
    || modifiers.some((entry) => MICROSTATE_GROWTH_KEYS_V2.has(entry.key))) return modifiers;
  const keys = new Set(modifiers.map((entry) => entry.key));
  const growthModifier = keys.has('defense') || keys.has('military-casualties')
    ? modifier('army-capacity', 18)
    : keys.has('front-supply') || keys.has('naval-distance-pressure')
      ? modifier('recruitment-throughput', 20)
      : keys.has('food-production') || keys.has('food-import-cost')
        ? modifier('population-growth', 8)
        : keys.has('tax-efficiency') || keys.has('research-output')
          ? modifier('development-economy-growth', 18)
          : modifier('passive-recruitment', 20);
  const priorityKey = MICROSTATE_REPLACEMENT_PRIORITY_V2.find((key) => (
    modifiers.some((entry) => entry.key === key)
  ));
  const redundantDefenseIndex = keys.has('defense') && keys.has('military-casualties')
    ? modifiers.findIndex((entry) => entry.key === 'defense')
    : -1;
  const replaceIndex = priorityKey
    ? modifiers.findIndex((entry) => entry.key === priorityKey)
    : redundantDefenseIndex;
  const next = [...modifiers];
  next[replaceIndex >= 0 ? replaceIndex : next.length - 1] = growthModifier;
  return Object.freeze(next) as ModifierTupleV2;
};

const balancedTraitModifiersV2 = (
  playerId: string,
  sourceModifiers: ModifierTupleV2,
): ModifierTupleV2 => {
  const modifiers = ensureMicrostateGrowthEngineV2(
    playerId,
    ensureAbsoluteUnderdogArmyCapacityV2(
      playerId,
      replaceDirectDefenseTraitsV2(playerId, sourceModifiers),
    ),
  );
  const fixedBudget = modifiers.reduce((sum, entry) => (
    sum + (entry.replacement ? FIXED_REPLACEMENT_VALUE_BUDGET_V2 : 0)
  ), 0);
  const scalableValue = modifiers.reduce((sum, entry) => (
    sum + (entry.replacement ? 0 : traitModifierBaseValueV2(entry))
  ), 0);
  const traitBudget = playerId === 'grl'
    ? GREENLAND_TRAIT_VALUE_BUDGET_V2 : BASE_COUNTRY_TRAIT_VALUE_BUDGET_V2;
  const targetScalableValue = Math.max(1, traitBudget - fixedBudget);
  const scale = scalableValue > 0 ? targetScalableValue / scalableValue : 1;
  const percentages = modifiers.map((entry) => {
    if (entry.replacement) return entry.percentage;
    const [minimum, maximum] = baseTraitPercentageBoundsV2(entry.key);
    return Math.min(maximum, Math.max(minimum, entry.percentage * scale));
  });

  // When a high-value channel such as IQ reaches its safety cap, distribute
  // the unused identity budget over the remaining uncapped channels. This
  // keeps the AI baselines equally valuable without widening any hard cap.
  for (let pass = 0; pass < 4; pass += 1) {
    const currentValue = modifiers.reduce((sum, entry, index) => (
      sum + (entry.replacement
        ? 0
        : Math.abs(percentages[index]!)
          * TRAIT_VALUE_WEIGHT_BY_KEY_V2[entry.key]
          * traitScopeAvailabilityV2(entry.scope))
    ), 0);
    const remainingValue = targetScalableValue - currentValue;
    if (remainingValue <= 0.001) break;
    const eligible = modifiers.map((entry, index) => {
      if (entry.replacement) return false;
      const [minimum, maximum] = baseTraitPercentageBoundsV2(entry.key);
      const percentage = percentages[index]!;
      return percentage < 0 ? percentage > minimum : percentage < maximum;
    });
    const eligibleValue = modifiers.reduce((sum, entry, index) => (
      eligible[index]
        ? sum + Math.abs(percentages[index]!)
          * TRAIT_VALUE_WEIGHT_BY_KEY_V2[entry.key]
          * traitScopeAvailabilityV2(entry.scope)
        : sum
    ), 0);
    if (eligibleValue <= 0) break;
    const redistributionScale = 1 + remainingValue / eligibleValue;
    modifiers.forEach((entry, index) => {
      if (!eligible[index]) return;
      const [minimum, maximum] = baseTraitPercentageBoundsV2(entry.key);
      percentages[index] = Math.min(
        maximum,
        Math.max(minimum, percentages[index]! * redistributionScale),
      );
    });
  }

  return Object.freeze(modifiers.map((entry, index) => {
    if (entry.replacement) return entry;
    const balancedPercentage = Math.round(percentages[index]! * 100) / 100;
    return modifier(entry.key, balancedPercentage, entry.scope);
  })) as ModifierTupleV2;
};

const trait = (
  playerId: string,
  _countryName: string,
  _name: string,
  _effect: string,
  _description: string,
  modifiers: ModifierTupleV2,
): CountryTraitV2 => {
  if (modifiers.length > 3) {
    throw new Error(`Country trait ${playerId} must contain one to three modifiers.`);
  }
  const balancedModifiers = balancedTraitModifiersV2(playerId, modifiers);
  const english = ENGLISH_TRAIT_COPY_V2[playerId];
  const countryName = WORLD_CONTENT_V2.nations[playerId as PlayerId]?.name;
  if (!english || !countryName) throw new Error(`Missing English country trait copy for ${playerId}.`);
  return Object.freeze({
    playerId: playerId as PlayerId,
    countryName,
    name: english.name,
    effect: describeCountryTraitModifiersV2(balancedModifiers),
    description: english.description,
    openingWeakness: TRAIT_OPENING_WEAKNESS_BY_KEY_V2[balancedModifiers[0].key],
    modifiers: balancedModifiers,
  });
};

const CORE = Object.freeze({ homeland: true });
const DEF_CORE = Object.freeze({ role: 'defender', homeland: true } as const);
const PEACE = Object.freeze({ atWar: false });
const WAR = Object.freeze({ atWar: true });
const LAND = Object.freeze({ access: 'land' } as const);
const NAVAL = Object.freeze({ access: 'naval' } as const);

interface EnglishTraitCopyV2 {
  readonly name: string;
  readonly description: string;
}

/** Player-facing English identity copy; mechanics are rendered from modifiers. */
const ENGLISH_TRAIT_COPY_V2: Readonly<Record<string, EnglishTraitCopyV2>> = Object.freeze({
  usa: { name: 'Global Projection', description: 'Offsets the cost and supply burden of projecting a globally deployable military across oceans.' },
  can: { name: 'Northern Supply Lines', description: 'Offsets long overseas routes with reliable supply and general defense.' },
  mex: { name: 'Federal Depth', description: 'Turns a large population into sustainable force capacity without over-amplifying a strong start.' },
  cub: { name: 'Island Mobilization', description: 'Offsets island isolation with portable defense, faster reserve deployment and cheaper naval operations.' },
  dom: { name: 'Caribbean Growth Hub', description: 'Offsets limited opening scale through peaceful economic and population growth.' },
  hti: { name: 'Unbroken Republic', description: 'Turns severe food stress into exceptional defensive survival and recovery.' },
  jam: { name: 'Blue Mountain Network', description: 'Offsets a small opening base with durable defense and a strong peacetime research path.' },
  blz: { name: 'Jungle Bridgehead', description: 'Gives an extreme underdog lower losses in every battle, a fortified base and a first route to expansion.' },
  cri: { name: 'Civil Mobilization', description: 'Offsets the lack of a standing military advantage by converting civil development into wartime mobilization.' },
  slv: { name: 'Compressed Front', description: 'Makes defended territory easier to hold and rapidly reinforce during war.' },
  gtm: { name: 'Highland Muster', description: 'Offsets limited active forces by building deep reserves behind defensible lines.' },
  hnd: { name: 'Two-Ocean Line', description: 'Offsets two-coast logistics and food-import costs during naval expansion.' },
  nic: { name: 'Lakes and Jungle Line', description: 'Offsets lower military scale by exhausting stronger attackers and recovering quickly.' },
  pan: { name: 'Interoceanic Link', description: 'Offsets a narrow land base through efficient finance and very affordable naval campaigns.' },
  grl: { name: 'Arctic Mass Mobilization', description: 'Transforms the smallest opening army into a recruitable force while reduced upkeep keeps growth economically possible.' },

  arg: { name: 'Pampas Mobilization', description: 'Offsets force-capacity limits with a larger regular army supported by food production.' },
  bol: { name: 'Altiplano Fort', description: 'Offsets landlocked vulnerability with defensive positions that can exhaust stronger neighbors.' },
  bra: { name: 'Continental Reserve', description: 'Addresses the reserve and demographic demands of a very large country with bounded scalable bonuses.' },
  chl: { name: 'Long Coastal Command', description: 'Offsets long borders with cheaper naval operations and general defense.' },
  col: { name: 'Andes-Jungle Offensive', description: 'Offsets difficult internal geography with stronger land attacks and front supply.' },
  ecu: { name: 'Equatorial Interior Lines', description: 'Offsets limited scale through reliable land logistics and defensible territory.' },
  guy: { name: 'Frontier Economy', description: 'Turns a tiny opening economy into lasting revenue, development and defensible growth.' },
  pry: { name: 'Heartland Entrenchment', description: 'Offsets landlocked isolation with durable defense and affordable continental operations.' },
  per: { name: 'High Andes Logistics', description: 'Offsets regional distance with general defense, reliable supply and lower land-operation costs.' },
  sur: { name: 'Rainforest Refuge', description: 'Gives an extreme underdog broad defensive survival and food security until expansion becomes possible.' },
  ury: { name: 'Citizen Reserve', description: 'Offsets small scale with efficient revenue, trained reserves and affordable upkeep.' },
  ven: { name: 'Orinoco Mobilization', description: 'Offsets weak conversion of population into fielded power through capacity, recruitment and cheaper food production.' },

  aus: { name: 'Oceanic Reach', description: 'Offsets geographic isolation with a bounded naval cost and supply specialization.' },
  nzl: { name: 'Expeditionary Cohesion', description: 'Offsets a small expeditionary force by limiting losses and accelerating recovery on naval fronts.' },
  png: { name: 'Melanesian Depth', description: 'Offsets archipelago vulnerability with scalable forces and stronger defense.' },

  alb: { name: 'Adriatic Gateway', description: 'Offsets a small opening base with affordable naval expansion, supply and faster integration.' },
  bel: { name: 'European Switchboard', description: 'Offsets limited territory through fiscal efficiency and general defense.' },
  bih: { name: 'Layered Fortress', description: 'Offsets low opening power with exceptional defensive survival and reduced battle damage.' },
  bgr: { name: 'Black Sea Corridor', description: 'Offsets supply and food exposure with self-sufficiency, two-route logistics and defensive research.' },
  dnk: { name: 'Danish Straits', description: 'Offsets reliance on nearby sea routes by reducing distance and food-logistics pressure.' },
  deu: { name: 'European Logistics Hub', description: 'Turns industrial knowledge and Germany’s central position into rapid reinforcement of allied land fronts.' },
  est: { name: 'Digital Leap State', description: 'Offsets a very small opening base through research output, catch-up and lower operating costs.' },
  fin: { name: 'Total National Defense', description: 'Offsets limited manpower through reserves, lower losses and stronger defense.' },
  fra: { name: 'Strategic Autonomy', description: 'Offsets the technology, naval and integration costs of independent great-power operations.' },
  grc: { name: 'Aegean Link', description: 'Offsets fragmented island routes through naval supply and cheaper operations and food imports.' },
  hun: { name: 'Danube Interior Line', description: 'Offsets the lack of sea access with efficient land campaigns and integration.' },
  irl: { name: 'Atlantic Knowledge Base', description: 'Offsets isolation and limited military scale through safe scientific and fiscal development.' },
  isl: { name: 'North Atlantic Link', description: 'Offsets extreme isolation and tiny opening power with affordable reach and defense on every owned front.' },
  ita: { name: 'Mediterranean Depth', description: 'Offsets the strain of several long naval fronts through lower logistics and fatigue pressure.' },
  kos: { name: 'Accelerated State Building', description: 'Offsets a very small economy through efficient administration and rapid recovery.' },
  hrv: { name: 'Adriatic Coastal Belt', description: 'Offsets limited scale with general defense, supply and naval operations.' },
  lva: { name: 'Baltic Supply Line', description: 'Offsets a small population with deep stocks, trainable reserves and general defense.' },
  ltu: { name: 'Baltic Mobilization', description: 'Offsets limited manpower by turning population and reserves into deployable land forces faster.' },
  lux: { name: 'Capital Mobilization', description: 'Turns exceptional finance into revenue and permanent room for a much larger army.' },
  mda: { name: 'Fertile Reserve', description: 'Offsets economic and military fragility with food security, storage and trained reserves.' },
  mne: { name: 'Mountain Fortress by the Sea', description: 'Offsets one of the weakest conventional starts through hard defense and scalable force capacity.' },
  nld: { name: 'Delta Economy', description: 'Offsets import and maritime exposure through storage and lower food and naval costs.' },
  mkd: { name: 'Balkan Crossroads', description: 'Offsets a small landlocked base with exceptionally efficient land expansion.' },
  nor: { name: 'Long-Coast Logistics', description: 'Offsets long sea distances and battle damage across an extended front.' },
  ukr: { name: 'Deep Mobilization', description: 'Offsets a damaged front through reserve deployment, cheaper recruitment and lower wartime condition loss.' },
  aut: { name: 'Alpine Junction', description: 'Offsets a landlocked position with general defense, land supply and efficient integration.' },
  pol: { name: 'Eastern Depth', description: 'Offsets exposure to land attacks with bounded reserve, defense and capacity gains.' },
  prt: { name: 'Atlantic Forward Base', description: 'Offsets distance from expansion targets with cheaper naval campaigns and faster integration.' },
  rou: { name: 'Carpathian Arc', description: 'Offsets border exposure through food production, reserves and land defense.' },
  rus: { name: 'Continental Depth', description: 'Offsets immense distances and prolonged-war pressure with scalable logistics and endurance.' },
  srb: { name: 'Central Interior Line', description: 'Offsets a fully continental position through supply, land defense and rapid reserve response.' },
  svn: { name: 'Alpine-Adriatic Link', description: 'Offsets small scale with recovery, two-route supply and economic growth.' },
  svk: { name: 'Industrial Heartland', description: 'Offsets limited force scale with lower upkeep, military-industry research and more army capacity.' },
  esp: { name: 'Iberian Expeditionary Base', description: 'Turns Atlantic and Mediterranean access into affordable, well-supplied naval deployments.' },
  cze: { name: 'Precision Industry', description: 'Offsets limited mass through affordable recruitment, military-industry research and recovery.' },
  gbr: { name: 'Global Connections', description: 'Offsets worldwide naval distances with a restrained reach and supply bonus.' },
  blr: { name: 'Domestic Recovery Base', description: 'Offsets continental exposure through recovery, army capacity and land supply.' },
  swe: { name: 'Dual Use', description: 'Offsets reserve needs through logistics research, training and general defense.' },
  che: { name: 'Alpine Redoubt', description: 'Offsets a small landlocked base through general defense, fiscal efficiency and defeat insurance.' },

  dza: { name: 'Saharan Depth', description: 'Offsets route and food-import exposure with a restrained broad bonus.' },
  ago: { name: 'Atlantic Reconstruction', description: 'Offsets damaged territory and coastal expansion costs through recovery and cheaper integration.' },
  ben: { name: 'Corridor Administration', description: 'Offsets a small corridor base through supply, efficient taxation and faster integration.' },
  bwa: { name: 'Kalahari Mobilization', description: 'Turns a stable interior base into lasting force capacity, lower state costs and recovery.' },
  bfa: { name: 'Sahel Interior Line', description: 'Offsets limited active power with trained reserves, land supply and durable defense.' },
  bdi: { name: 'Compact Defensive Core', description: 'Offsets a small opening army by converting dense population into capacity, recruitment and defense.' },
  caf: { name: 'Forest Redoubt', description: 'Offsets structural fragility with stronger survival and land-front supply.' },
  cog: { name: 'Green River Corridor', description: 'Offsets difficult rainforest expansion with supply, faster integration and recovery.' },
  cod: { name: 'Continental Rainforest Depth', description: 'Offsets administrative scale through defense, capacity and cheaper integration.' },
  dji: { name: 'Strait Junction', description: 'Offsets a minute army and remote targets with maximum naval reach and efficient taxation.' },
  egy: { name: 'Suez Artery', description: 'Turns Egypt’s strategic junction into reliable supply for both land and naval campaigns.' },
  gnq: { name: 'Gulf Enclave', description: 'Offsets a tiny enclave base with permanent force capacity, defense and naval supply.' },
  eri: { name: 'Red Sea Redoubt', description: 'Offsets one of the weakest African starts with defensive survival and scalable force capacity.' },
  eth: { name: 'Highland Core', description: 'Offsets land-front and food pressure with resilient continental defense.' },
  gab: { name: 'Green Cash Flow', description: 'Offsets a small economy through efficient revenue, lower battle damage and deeper food storage.' },
  gmb: { name: 'River Gateway', description: 'Offsets a minute corridor start with maximum supply, lower state costs and fast land integration.' },
  gha: { name: 'Gulf Trade Junction', description: 'Offsets fiscal and maritime costs by monetizing food surpluses and sea routes.' },
  gin: { name: 'Headwaters', description: 'Offsets food, route and recovery pressure during regional campaigns.' },
  gnb: { name: 'Coastal Archipelago', description: 'Offsets an extremely vulnerable start with maximum food storage and naval logistics.' },
  civ: { name: 'West African Growth Hub', description: 'Offsets expansion costs through revenue, development growth and cheaper integration.' },
  cmr: { name: 'Dual Access', description: 'Offsets split continental and maritime access by rewarding coordinated two-front logistics.' },
  ken: { name: 'East African Link', description: 'Offsets coast-to-interior expansion costs with flexible supply, integration and growth.' },
  lso: { name: 'Maloti Redoubt', description: 'Offsets an import-dependent microstate start with stronger survival and cheaper food imports.' },
  lbr: { name: 'Atlantic Restart', description: 'Offsets fragile territory and limited land options through recovery and affordable naval growth.' },
  lby: { name: 'Desert Reserve', description: 'Offsets supply and import dependence through reserves, cheaper food and route support.' },
  mdg: { name: 'Island Redoubt', description: 'Offsets extreme isolation through naval reach, durable defense and food storage.' },
  mwi: { name: 'Lake-Country Stores', description: 'Offsets food and recovery fragility through maximum production and storage.' },
  mli: { name: 'Sahel Route', description: 'Offsets a landlocked position through specialized, affordable land expansion.' },
  mar: { name: 'Two-Seas Gateway', description: 'Offsets route exposure with a restrained naval and defense package.' },
  mrt: { name: 'Saharan Coast', description: 'Offsets a vulnerable coastal base with durable defense, flexible supply and deep stocks.' },
  moz: { name: 'Long Coastal Corridor', description: 'Offsets widely separated coastal operations through distance relief, supply and recovery.' },
  nam: { name: 'Extended Supply Line', description: 'Offsets low mass and long distances with cheap, reliable logistics and food imports.' },
  ner: { name: 'Inland Supply State', description: 'Offsets a weak opening force by accumulating land supply, food stocks and trained reserves.' },
  nga: { name: 'Federal Scale', description: 'Offsets the logistics and integration burden of a large state with bounded scale efficiencies.' },
  uga: { name: 'Lakes Junction', description: 'Offsets landlocked pressure through supply, reserves and domestic food production.' },
  rwa: { name: 'Dense Administrative Core', description: 'Offsets a small opening base with exceptional administration and integration speed.' },
  sen: { name: 'Atlantic Gateway', description: 'Offsets food-import and route costs with affordable regional and Atlantic access.' },
  sle: { name: 'Recovery Coast', description: 'Offsets a fragile economy through rapid recovery, lower state costs and food storage.' },
  sdn: { name: 'Nile Recovery', description: 'Offsets a damaged opening state with condition-triggered reconstruction and peacetime fatigue recovery.' },
  som: { name: 'Horn Coast', description: 'Offsets a weak opening economy and food base through strong coastal logistics.' },
  swz: { name: 'Compact Administration', description: 'Offsets minute military scale through efficient state finance and additional recruitable army capacity.' },
  tza: { name: 'Coast and Hinterland', description: 'Offsets broad regional supply and integration needs with a balanced growth package.' },
  tgo: { name: 'Narrow Corridor', description: 'Offsets narrow territory through supply, quick integration and lower operating costs.' },
  tcd: { name: 'Inland Junction', description: 'Offsets landlocked operations and mapped rainforest damage through supply and lower campaign costs.' },
  tun: { name: 'Compact Mediterranean Core', description: 'Offsets a compact base with efficient administration, naval operations and defense.' },
  zmb: { name: 'Central Economic Network', description: 'Offsets army affordability and land supply through faster development growth.' },
  zwe: { name: 'Recovery Engine', description: 'Offsets damaged production, revenue and territory through broad domestic recovery.' },
  zaf: { name: 'Two-Ocean Reach', description: 'Offsets two-ocean distance and technology pressure with a restrained maritime-research bonus.' },
  sds: { name: 'White Nile Reserve', description: 'Offsets a damaged young state through food production, recovery and land supply.' },

  afg: { name: 'Hindu Kush Endurance', description: 'Offsets fragile forces through stronger defense, lower losses and wartime replacement.' },
  arm: { name: 'Highland Redoubt', description: 'Offsets low opening power and exposed borders through stronger defense, lower losses and research.' },
  aze: { name: 'Caspian Armed Forces', description: 'Offsets upkeep and route pressure with focused weapons research and supply.' },
  bhr: { name: 'Island Buffer', description: 'Offsets microstate scale and import dependence through lower food and army costs plus defense.' },
  bgd: { name: 'Delta Resilience', description: 'Offsets dense-population food stress through production, storage and crisis recovery.' },
  btn: { name: 'Himalayan Balance', description: 'Offsets an almost nonexistent offensive base with stronger defense, reserve training and scalable force capacity.' },
  brn: { name: 'Sultanate Buffer', description: 'Offsets the weakest Asian opening force through technology, very low upkeep and defense.' },
  khm: { name: 'Mekong Rice Bowl', description: 'Offsets food, recovery and defensive exposure during gradual regional growth.' },
  cyp: { name: 'Eastern Mediterranean Redoubt', description: 'Offsets a small island force through naval supply, lower attacking losses and food storage.' },
  phl: { name: 'Island Chain', description: 'Offsets a fragmented archipelago through naval supply, cheaper operations and attack.' },
  geo: { name: 'Caucasus Gateway', description: 'Offsets exposed borders and limited forces through stronger survival and land supply.' },
  ind: { name: 'Self-Reliant Mass', description: 'Turns demographic scale and domestic military industry into sustainable long-term force growth.' },
  idn: { name: 'Archipelago Command', description: 'Turns the world’s largest archipelago into a coherent reserve-backed naval operating area.' },
  irq: { name: 'Mesopotamian Recovery', description: 'Offsets the damage and fatigue of costly continental wars through recovery and land supply.' },
  irn: { name: 'Plateau Logistics', description: 'Offsets broad borders and technology demands with restrained defense, supply and weapons research.' },
  isr: { name: 'Reservist State', description: 'Offsets a small population through replacement, lower defensive losses and defensive research.' },
  jpn: { name: 'Integrated Island Defense', description: 'Turns national IQ, defensive-systems research and interception readiness into a coherent shield.' },
  yem: { name: 'Yemeni Endurance', description: 'Offsets a damaged state, import pressure and defensive vulnerability with a credible recovery path.' },
  jor: { name: 'Desert Corridor', description: 'Offsets import dependence and food stress through affordable supply and resilient administration.' },
  kaz: { name: 'Steppe Depth', description: 'Offsets great distances and limited force density through capacity, land supply and storage.' },
  kgz: { name: 'Tien Shan Reserve', description: 'Offsets a small landlocked base through general defense, cheap recruitment and recovery.' },
  kwt: { name: 'Deep Treasury', description: 'Offsets an extremely small military base through low upkeep, affordable imports and funded research.' },
  lao: { name: 'Mekong Interior Line', description: 'Offsets a landlocked position through durable defense, food and land supply.' },
  lbn: { name: 'Levantine Reconstruction', description: 'Offsets fiscal, import and defensive vulnerability through funded research and defense.' },
  mys: { name: 'Strait of Malacca', description: 'Offsets import, research and sea-route pressure with a small complete logistics package.' },
  mng: { name: 'Endless Steppe', description: 'Offsets sparse population and immense distances with army capacity, land supply and storage.' },
  mmr: { name: 'Irrawaddy Recovery', description: 'Offsets a damaged state through peacetime recovery, land logistics and food production.' },
  npl: { name: 'Himalayan Bastion', description: 'Offsets limited power with stronger defense, lower losses and peacetime recovery.' },
  prk: { name: 'Entrenched Mobilization', description: 'Offsets the cost of a large standing army with upkeep relief, defense and wartime recruitment.' },
  uzb: { name: 'Silk Road Logistics', description: 'Offsets a landlocked force through supply, cheaper recruitment and economic development.' },
  omn: { name: 'Monsoon Route', description: 'Offsets small-state isolation with unusually sustainable naval links and food storage.' },
  tls: { name: 'Young Island State', description: 'Offsets one of the weakest starts with scalable forces, recovery and general defense.' },
  pak: { name: 'Strategic Depth', description: 'Offsets land-front supply, replacement and defensive-research pressure with restrained gains.' },
  psx: { name: 'Steadfastness', description: 'Offsets severe survival and food-access pressure without creating an offensive advantage.' },
  qat: { name: 'Compact Wealth Buffer', description: 'Offsets a tiny force through affordable upkeep, funded research and defense.' },
  sau: { name: 'Desert Connections', description: 'Offsets land logistics, food imports and war fatigue with a subtle major-power package.' },
  sgp: { name: 'City-State Without Margin', description: 'Offsets one-city scale through technology, low upkeep and defense.' },
  lka: { name: 'Indian Ocean Anchor', description: 'Offsets island isolation with naval supply, food storage and economy-science research.' },
  syr: { name: 'Levantine Defensive Belt', description: 'Offsets damaged territory through stronger survival and wartime recovery.' },
  tjk: { name: 'Pamir Reserve', description: 'Offsets low force density through stronger defense, passive recruitment and food storage.' },
  twn: { name: 'Silicon Shield', description: 'Offsets island exposure and recruitment costs with a restrained technology and defense package.' },
  tha: { name: 'Chao Phraya Base', description: 'Offsets food, growth and defensive pressure with a balanced domestic package.' },
  tur: { name: 'Anatolian Interior Lines', description: 'Offsets two-continent land operations with a small supply, cost and attack advantage.' },
  tkm: { name: 'Karakum Reserve', description: 'Offsets landlocked supply and fixed costs through storage and affordable buildup.' },
  are: { name: 'Federal Hub', description: 'Offsets small-state force and route pressure through funded research, low upkeep and flexible supply.' },
  vnm: { name: 'Delta Defense', description: 'Offsets invasion risk without further increasing an already strong offensive start.' },
  chn: { name: 'Integrated Production Chain', description: 'Turns industrial scale into joint logistics, rapid mobilization and continuous military modernization.' },
  kor: { name: 'Rapid Industrial Cycle', description: 'Turns national IQ and industrial speed into fast replacement behind a hardened defense.' },
});

/** Canonical, save-free trait content. Order follows the V1 catalog. */
export const COUNTRY_TRAITS_V2: readonly CountryTraitV2[] = Object.freeze([
  // Noord-Amerika
  trait('usa', 'Verenigde Staten', 'Wereldwijde Projectie', '−6% wekelijkse operatiekosten en +4% supply voor oorlogen met naval access.', 'Kleine, wereldwijde specialisatie voor het sterkste startland.', [
    modifier('operation-cost', -6, NAVAL), modifier('front-supply', 4, NAVAL),
  ]),
  trait('can', 'Canada', 'Noordelijke Aanvoerlijnen', '+10% supply op naval fronts en +10% DEF wanneer het eigen kerngebied arctic terrain heeft.', 'Veilige noordelijke verdediger met betrouwbare overzeese logistiek.', [
    modifier('front-supply', 10, NAVAL), modifier('defense', 10, { terrain: 'arctic', homeland: true }),
  ]),
  trait('mex', 'Mexico', 'Federale Diepte', '+6% legercapaciteit; +5% passieve rekrutering zolang food security minstens 95% is.', 'Zet bevolking om in een duurzame landmacht zonder een topstart verder te laten ontsporen.', [
    modifier('army-capacity', 6), modifier('passive-recruitment', 5, { foodSecurityAtLeast: 0.95 }),
  ]),
  trait('cub', 'Cuba', 'Eilandmobilisatie', '+16% DEF in het eigen core territory; +12% reserve deployment throughput; −10% naval operation cost.', 'Compacte eilandvesting die reserves snel inzet.', [
    modifier('defense', 16, CORE), modifier('reserve-deployment-throughput', 12), modifier('operation-cost', -10, NAVAL),
  ]),
  trait('dom', 'Dominicaanse Republiek', 'Caribische Groeipool', '+15% development-driven economy growth en +12% population growth zolang het land niet in oorlog is.', 'Eerst opbouwen, daarna vanuit een sterkere demografische basis uitbreiden.', [
    modifier('development-economy-growth', 15, PEACE), modifier('population-growth', 12, PEACE),
  ]),
  trait('hti', 'Haïti', 'Ongebroken Republiek', 'Wanneer food security lager is dan 80%: +30% DEF, −20% military casualties en +30% condition recovery.', 'Een crisisland dat juist onder maximale druk moeilijk te breken is.', [
    modifier('defense', 30, { foodSecurityBelow: 0.8 }), modifier('military-casualties', -20, { foodSecurityBelow: 0.8 }), modifier('condition-recovery', 30, { foodSecurityBelow: 0.8 }),
  ]),
  trait('jam', 'Jamaica', 'Blue Mountain Netwerk', '+30% DEF in het eigen core territory; +25% research output zolang het land vrede heeft.', 'Een verdedigbare kennisstart met een sterke vredesfase.', [
    modifier('defense', 30, CORE), modifier('research-output', 25, PEACE),
  ]),
  trait('blz', 'Belize', 'Junglebruggenhoofd', '+30% DEF in het eigen core territory; −20% military casualties bij verdediging; −30% integration duration voor de eerste verovering.', 'Extreme underdog met één harde vesting en een echte eerste expansiekans.', [
    modifier('defense', 18, CORE), modifier('military-casualties', -12), modifier('integration-duration', -18, { firstConquest: true }),
  ]),
  trait('cri', 'Costa Rica', 'Civiele Mobilisatie', 'In vrede: +30% development-driven economy growth en +30% research output. In oorlog: +30% recruitment throughput.', 'Civiele ontwikkeling schakelt bij gevaar om naar snelle mobilisatie.', [
    modifier('development-economy-growth', 30, PEACE), modifier('research-output', 30, PEACE), modifier('recruitment-throughput', 30, WAR),
  ]),
  trait('slv', 'El Salvador', 'Gecomprimeerd Front', '+30% DEF in het eigen core territory en +30% recruitment throughput zolang er een actieve oorlog is.', 'Klein grondgebied maakt verdediging en snelle aanvulling uitzonderlijk efficiënt.', [
    modifier('defense', 30, CORE), modifier('recruitment-throughput', 30, WAR),
  ]),
  trait('gtm', 'Guatemala', 'Hooglandmuster', '+26% DEF in het eigen core territory; +22% reserve training en +18% reserve capacity.', 'Bouwt in vrede een diepe reserve voor kernverdediging.', [
    modifier('defense', 26, CORE), modifier('reserve-training', 22), modifier('reserve-capacity', 18),
  ]),
  trait('hnd', 'Honduras', 'Twee-Oceanenlijn', '+25% naval-front supply; −24% naval operation cost; −20% food import cost.', 'Betaalbare zee-expansie en voedseltoevoer aan twee kusten.', [
    modifier('front-supply', 25, NAVAL), modifier('operation-cost', -24, NAVAL), modifier('food-import-cost', -20),
  ]),
  trait('nic', 'Nicaragua', 'Meren-en-Junglelinie', '+30% DEF in het eigen core territory; −20% military casualties bij verdediging; +20% recovery.', 'Slijt sterkere aanvallers uit en herstelt daarna sneller.', [
    modifier('defense', 30, CORE), modifier('military-casualties', -20, { role: 'defender' }), modifier('condition-recovery', 20),
  ]),
  trait('pan', 'Panama', 'Interoceanische Schakel', '−30% naval operation cost; +30% tax efficiency zolang er geen land-front actief is.', 'Rijkere vredesbasis en zeer betaalbare maritieme campagnes.', [
    modifier('operation-cost', -30, NAVAL), modifier('tax-efficiency', 30, { hasLandFront: false }),
  ]),
  trait('grl', 'Groenland', 'Arctisch Reduit', '+30% DEF in het eigen core arctic territory; −30% army upkeep; −30% rapid recruitment cost.', 'De zwakste start wordt een taaie, betaalbare arctische challenge run zonder gratis leger.', [
    modifier('army-capacity', 112.5), modifier('recruitment-throughput', 17.5), modifier('army-upkeep', -8.75),
  ]),

  // Zuid-Amerika
  trait('arg', 'Argentinië', 'Pampamobilisatie', '+12% legercapaciteit en +10% food production.', 'Combineert landbouwbasis met een grotere reguliere landmacht.', [
    modifier('army-capacity', 12), modifier('food-production', 10),
  ]),
  trait('bol', 'Bolivia', 'Altiplanofort', '+30% DEF in het eigen core territory; −20% military casualties bij verdediging daar.', 'Landlocked kernvesting die sterkere buren kan uitputten.', [
    modifier('defense', 30, CORE), modifier('military-casualties', -20, DEF_CORE),
  ]),
  trait('bra', 'Brazilië', 'Continentale Reserve', '+5% reserve capacity en +5% reserve training; +3% population growth.', 'Bescheiden maar breed schaalbare bonus voor een al sterke reus.', [
    modifier('reserve-capacity', 5), modifier('reserve-training', 5), modifier('population-growth', 3),
  ]),
  trait('chl', 'Chili', 'Lange Kustcommandolijn', '−18% naval operation cost; +16% DEF in coastal terrain.', 'Flexibel langs de kust, maar niet algemeen sterker.', [
    modifier('operation-cost', -18, NAVAL), modifier('defense', 16, { terrain: 'coastal' }),
  ]),
  trait('col', 'Colombia', 'Andes-Jungleoffensief', '+15% ATK op land fronts; +12% land-front supply.', 'Regionale macht die haar binnenlandse verbindingen offensief benut.', [
    modifier('attack', 15, LAND), modifier('front-supply', 12, LAND),
  ]),
  trait('ecu', 'Ecuador', 'Equatoriale Binnenlijnen', '+22% land-front supply; +20% DEF in het eigen core territory.', 'Korte, betrouwbare logistiek vanuit een verdedigbare kern.', [
    modifier('front-supply', 22, LAND), modifier('defense', 20, CORE),
  ]),
  trait('guy', 'Guyana', 'Frontiereconomie', '+30% tax efficiency; +30% DEF in het eigen core territory; +30% starting treasury.', 'Zeer klein land met liquide middelen en een verdedigbare ontwikkelingsbasis.', [
    modifier('tax-efficiency', 18), modifier('defense', 18, CORE), modifier('development-economy-growth', 14),
  ]),
  trait('pry', 'Paraguay', 'Hartlandverschansing', '+30% DEF in het eigen core territory; −25% land operation cost.', 'Goedkope continentale oorlogvoering vanuit een taaie landlocked kern.', [
    modifier('defense', 30, CORE), modifier('operation-cost', -25, LAND),
  ]),
  trait('per', 'Peru', 'Hoge-Andeslogistiek', '+24% DEF in het eigen core territory; +18% land-front supply; −15% land operation cost.', 'Sterke kernpositie met betaalbare regionale campagnes.', [
    modifier('defense', 24, CORE), modifier('front-supply', 18, LAND), modifier('operation-cost', -15, LAND),
  ]),
  trait('sur', 'Suriname', 'Regenwoudschuilplaats', '+30% DEF in het eigen core territory; −20% military casualties bij verdediging; +30% food production.', 'Extreme underdog die kan overleven tot een kans op expansie ontstaat.', [
    modifier('defense', 18, { role: 'defender' }), modifier('military-casualties', -12, { role: 'defender' }), modifier('food-production', 18),
  ]),
  trait('ury', 'Uruguay', 'Burgerreserve', '+26% tax efficiency; +24% reserve training; −18% army upkeep.', 'Kleine, efficiënte staat die een betaalbare reservemacht onderhoudt.', [
    modifier('tax-efficiency', 26), modifier('reserve-training', 24), modifier('army-upkeep', -18),
  ]),
  trait('ven', 'Venezuela', 'Orinocomobilisatie', '+30% legercapaciteit; +25% recruitment throughput; −18% food production cost.', 'Zet een relatief grote bevolking sneller om in inzetbare macht.', [
    modifier('army-capacity', 30), modifier('recruitment-throughput', 25), modifier('food-production-cost', -18),
  ]),

  // Indo-Pacific
  trait('aus', 'Australië', 'Oceanisch Bereik', '−7% naval operation cost en +5% naval-front supply.', 'Kleine maritieme specialisatie voor een sterke, afgelegen start.', [
    modifier('operation-cost', -7, NAVAL), modifier('front-supply', 5, NAVAL),
  ]),
  trait('nzl', 'Nieuw-Zeeland', 'Expeditionaire Cohesie', '−20% military casualties en +18% recovery op naval fronts.', 'Kleine expeditiemacht die verliezen beperkt en snel herstelt.', [
    modifier('military-casualties', -20, NAVAL), modifier('condition-recovery', 18, NAVAL),
  ]),
  trait('png', 'Papoea-Nieuw-Guinea', 'Melanesische Diepte', '+30% DEF en −20% military casualties bij verdediging van coastal homeland; +30% food production.', 'Voedselzekere eiland-underdog die invasies door haar archipel kan laten vastlopen.', [
    modifier('defense', 30, { role: 'defender', terrain: 'coastal', homeland: true }), modifier('food-production', 30), modifier('military-casualties', -20, { role: 'defender', terrain: 'coastal', homeland: true }),
  ]),

  // Europa
  trait('alb', 'Albanië', 'Adriatische Poort', '−30% wekelijkse kosten van naval operations; +22% naval-front supply; −25% integration duration voor veroverd coastal terrain.', 'Snelle maritieme expansie vanuit een kleine basis.', [
    modifier('operation-cost', -30, NAVAL), modifier('front-supply', 22, NAVAL), modifier('integration-duration', -25, { terrain: 'coastal' }),
  ]),
  trait('bel', 'België', 'Europese Schakelkamer', '+7% tax efficiency; −8% base operating cost; +8% DEF in urban terrain.', 'Compacte, efficiënte economische vesting.', [
    modifier('tax-efficiency', 7), modifier('base-operating-cost', -8), modifier('defense', 8, { terrain: 'urban' }),
  ]),
  trait('bih', 'Bosnië en Herzegovina', 'Gelaagde Vesting', '+30% DEF in het eigen core territory; −20% military casualties en −30% condition loss bij verdediging daar.', 'Zeer moeilijk vroeg uit te schakelen.', [
    modifier('defense', 30, CORE), modifier('military-casualties', -20, DEF_CORE), modifier('condition-loss', -30, DEF_CORE),
  ]),
  trait('bgr', 'Bulgarije', 'Zwarte-Zeecorridor', '+20% domestic food production; +10% supply op land en naval fronts; +18% wekelijkse research progress in defensive-systems.', 'Zelfvoorzienende verdediger met twee logistieke assen.', [
    modifier('food-production', 20), modifier('front-supply', 10), modifier('research-progress', 18, { researchBranches: ['defensive-systems'] }),
  ]),
  trait('dnk', 'Denemarken', 'Deense Zeestraten', 'Bestaande afstandsdruk op zeeroutes −20%; +8% naval-front supply; −12% food logistics pressure van naval operations.', 'Voordelige controle van nabijgelegen zeeroutes.', [
    modifier('naval-distance-pressure', -20, NAVAL), modifier('front-supply', 8, NAVAL), modifier('food-logistics-pressure', -12, NAVAL),
  ]),
  trait('deu', 'Duitsland', 'Industriële Samenhang', '+4% research progress in military-industry en economy-science; −4% base operating cost.', 'Kleine maar brede efficiëntiebonus voor de sterkste Europese start.', [
    modifier('national-iq', 1), modifier('front-supply', 6, LAND), modifier('reserve-deployment-throughput', 5),
  ]),
  trait('est', 'Estland', 'Digitale Sprongstaat', '+30% research output; −25% base operating cost; +20% op de bestaande research catch-up bonus.', 'Kleine start die via technologie snel kan inhalen.', [
    modifier('research-output', 30), modifier('base-operating-cost', -25), modifier('research-catch-up-bonus', 20),
  ]),
  trait('fin', 'Finland', 'Totale Landsverdediging', '+16% DEF en −10% military casualties bij verdediging in arctic terrain; +12% reserve deployment throughput.', 'Reservisten en terrein maken invasies kostbaar.', [
    modifier('defense', 16, { role: 'defender', terrain: 'arctic' }), modifier('military-casualties', -10, { role: 'defender', terrain: 'arctic' }), modifier('reserve-deployment-throughput', 12),
  ]),
  trait('fra', 'Frankrijk', 'Strategische Autonomie', '+5% research progress in advanced-weapons; −4% naval operation cost; −4% integration cost.', 'Bescheiden zelfstandigheid op technologie, zee en expansie.', [
    modifier('research-progress', 5, { researchBranches: ['advanced-weapons'] }), modifier('operation-cost', -4, NAVAL), modifier('integration-cost', -4),
  ]),
  trait('grc', 'Griekenland', 'Egeïsche Schakel', '+14% naval-front supply; −12% naval operation cost; −10% food import cost.', 'Eilandroutes blijven betaalbaar en bevoorraad.', [
    modifier('front-supply', 14, NAVAL), modifier('operation-cost', -12, NAVAL), modifier('food-import-cost', -10),
  ]),
  trait('hun', 'Hongarije', 'Donau-Binnenlijn', '−14% land operation cost; +12% land-front supply; −10% integration duration voor landverbonden veroveringen.', 'Efficiënte continentale expansie zonder zeetoegang.', [
    modifier('operation-cost', -14, LAND), modifier('front-supply', 12, LAND), modifier('integration-duration', -10, LAND),
  ]),
  trait('irl', 'Ierland', 'Atlantische Kennisbasis', '+15% research progress in economy-science; +10% tax efficiency; +15% condition recovery buiten oorlog.', 'Veilige economische en wetenschappelijke opbouw.', [
    modifier('research-progress', 15, { researchBranches: ['economy-science'] }), modifier('tax-efficiency', 10), modifier('condition-recovery', 15, PEACE),
  ]),
  trait('isl', 'IJsland', 'Noord-Atlantische Schakel', 'Bestaande afstandsdruk op zeeroutes −45%; −30% naval operation cost; +30% DEF in arctic terrain.', 'Sterke compensatie voor de kleinste geïsoleerde Europese start.', [
    modifier('naval-distance-pressure', -25, NAVAL), modifier('operation-cost', -18, NAVAL), modifier('defense', 18, { role: 'defender' }),
  ]),
  trait('ita', 'Italië', 'Mediterrane Diepte', '−5% logistics pressure van naval fronts; −10% van alleen de war-fatigue operation surcharge; +5% condition recovery.', 'Kan meerdere langdurige zeefronten iets beter dragen.', [
    modifier('food-logistics-pressure', -5, NAVAL), modifier('war-fatigue-operation-surcharge', -10), modifier('condition-recovery', 5),
  ]),
  trait('kos', 'Kosovo', 'Versnelde Staatsopbouw', '+30% tax efficiency; −30% base operating cost; +30% condition recovery.', 'Bouwt vanuit een zeer kleine economie snel een functionerende staat.', [
    modifier('tax-efficiency', 30), modifier('base-operating-cost', -30), modifier('condition-recovery', 30),
  ]),
  trait('hrv', 'Kroatië', 'Adriatische Kustgordel', '−20% naval operation cost; +20% DEF in coastal terrain; +12% naval-front supply.', 'Sterke regionale kustmacht.', [
    modifier('operation-cost', -20, NAVAL), modifier('defense', 20, { terrain: 'coastal' }), modifier('front-supply', 12, NAVAL),
  ]),
  trait('lva', 'Letland', 'Baltische Voorraadlijn', '+30% food storage capacity; +28% reserve training; +22% DEF in arctic terrain.', 'Kleine staat met diepe voorraden en mobiliseerbare reserves.', [
    modifier('food-storage-capacity', 30), modifier('reserve-training', 28), modifier('defense', 22, { terrain: 'arctic' }),
  ]),
  trait('ltu', 'Litouwen', 'Baltische Mobilisatie', '+25% passive recruitment; +22% reserve deployment throughput; +15% land-front supply.', 'Zet beperkte bevolking snel om in inzetbare legers.', [
    modifier('passive-recruitment', 25), modifier('reserve-deployment-throughput', 22), modifier('front-supply', 15, LAND),
  ]),
  trait('lux', 'Luxemburg', 'Kapitaalbuffer', '+75% starting treasury; +22% tax efficiency; −28% army upkeep.', 'Een minuscuul leger gedragen door uitzonderlijk diepe financiën.', [
    modifier('army-capacity', 14), modifier('tax-efficiency', 22), modifier('development-economy-growth', 12),
  ]),
  trait('mda', 'Moldavië', 'Vruchtbare Reserve', '+30% domestic food production; +30% food storage capacity; +25% reserve training.', 'Voedselzekerheid financiert langdurige mobilisatie.', [
    modifier('food-production', 30), modifier('food-storage-capacity', 30), modifier('reserve-training', 25),
  ]),
  trait('mne', 'Montenegro', 'Bergvesting aan Zee', '+30% DEF in het eigen core territory; −20% military casualties bij verdediging daar; −30% naval operation cost.', 'Zeer sterke overlevingsbonus voor Europa’s zwakste conventionele start.', [
    modifier('defense', 20, CORE), modifier('military-casualties', -12, DEF_CORE), modifier('operation-cost', -18, NAVAL),
  ]),
  trait('nld', 'Nederland', 'Delta-economie', '+8% food storage capacity; −6% food import cost; −6% naval operation cost.', 'Kleine, beheerste bonus rond import, opslag en zeehandel.', [
    modifier('food-storage-capacity', 8), modifier('food-import-cost', -6), modifier('operation-cost', -6, NAVAL),
  ]),
  trait('mkd', 'Noord-Macedonië', 'Balkan-kruispunt', '−28% land operation cost; +25% land-front supply; −30% integration duration voor landverbonden veroveringen.', 'Zeer sterke regionale sneeuwbal via landroutes.', [
    modifier('operation-cost', -28, LAND), modifier('front-supply', 25, LAND), modifier('integration-duration', -30, LAND),
  ]),
  trait('nor', 'Noorwegen', 'Lange Kustlogistiek', 'Bestaande afstandsdruk op zeeroutes −35%; −10% naval operation cost; −12% condition loss door gevechten in arctic terrain.', 'Lange afstanden en noordelijk terrein worden beheersbaar.', [
    modifier('naval-distance-pressure', -35, NAVAL), modifier('operation-cost', -10, NAVAL), modifier('condition-loss', -12, { terrain: 'arctic' }),
  ]),
  trait('ukr', 'Oekraïne', 'Diepe Mobilisatie', '+12% reserve deployment throughput; −10% recruitment cost; −10% condition loss door gevechten tijdens oorlog.', 'Grote reserves houden een beschadigd front langer operationeel.', [
    modifier('reserve-deployment-throughput', 12), modifier('recruitment-cost', -10), modifier('condition-loss', -10, WAR),
  ]),
  trait('aut', 'Oostenrijk', 'Alpenknooppunt', '+16% DEF in mountain terrain; +10% land-front supply; −10% integration cost.', 'Verdedigt doorgangen en bestuurt landexpansie efficiënt.', [
    modifier('defense', 16, { terrain: 'mountain' }), modifier('front-supply', 10, LAND), modifier('integration-cost', -10),
  ]),
  trait('pol', 'Polen', 'Oostelijke Diepte', '+8% reserve training; +6% DEF tegen landaanvallen; +5% legercapaciteit.', 'Bescheiden massaverdediging voor een al sterke start.', [
    modifier('reserve-training', 8), modifier('defense', 6, { role: 'defender', access: 'land' }), modifier('army-capacity', 5),
  ]),
  trait('prt', 'Portugal', 'Atlantische Uitvalsbasis', '−15% naval operation cost; bestaande afstandsdruk op zeeroutes −25%; −10% integration duration voor veroverd coastal terrain.', 'Gericht op langeafstandsexpedities en kustveroveringen.', [
    modifier('operation-cost', -15, NAVAL), modifier('naval-distance-pressure', -25, NAVAL), modifier('integration-duration', -10, { terrain: 'coastal' }),
  ]),
  trait('rou', 'Roemenië', 'Karpatenboog', '+10% domestic food production; +10% reserve training; +10% DEF tegen landaanvallen.', 'Evenwicht tussen landbouw, reserves en grensverdediging.', [
    modifier('food-production', 10), modifier('reserve-training', 10), modifier('defense', 10, { role: 'defender', access: 'land' }),
  ]),
  trait('rus', 'Rusland', 'Continentale Diepte', 'Bestaande land-hopdruk in de supplyberekening −10%; +5% trained reserve capacity; −4% war fatigue gain.', 'Kleine bonus op schaal en uithoudingsvermogen voor een grootmacht.', [
    modifier('land-hop-pressure', -10, LAND), modifier('reserve-capacity', 5), modifier('war-fatigue-gain', -4),
  ]),
  trait('srb', 'Servië', 'Centrale Binnenlinie', '+18% land-front supply; +18% DEF tegen landaanvallen; +18% reserve deployment throughput.', 'Sterke maar volledig continentale reactiemacht.', [
    modifier('front-supply', 18, LAND), modifier('defense', 18, { role: 'defender', access: 'land' }), modifier('reserve-deployment-throughput', 18),
  ]),
  trait('svn', 'Slovenië', 'Alpen-Adriatische Schakel', '+25% condition recovery; +15% supply op land en naval fronts; +15% development-driven economy growth.', 'Kleine staat die snel herstelt en beide routetypen benut.', [
    modifier('condition-recovery', 25), modifier('front-supply', 15), modifier('development-economy-growth', 15),
  ]),
  trait('svk', 'Slowakije', 'Industrieel Binnenland', '−18% army upkeep; +20% research progress in military-industry; +12% legercapaciteit.', 'Bouwt goedkoop een groter landleger op.', [
    modifier('army-upkeep', -18), modifier('research-progress', 20, { researchBranches: ['military-industry'] }), modifier('army-capacity', 12),
  ]),
  trait('esp', 'Spanje', 'Iberische Ruimte', '+5% naval-front supply; +5% food storage capacity; +8% peacetime war-fatigue recovery.', 'Bescheiden strategische ademruimte voor een grote start.', [
    modifier('front-supply', 5, NAVAL), modifier('operation-cost', -4, NAVAL), modifier('naval-distance-pressure', -5, NAVAL),
  ]),
  trait('cze', 'Tsjechië', 'Precisie-industrie', '−12% recruitment cost; +12% research progress in military-industry; +8% condition recovery.', 'Efficiënte, betaalbare legeropbouw zonder massabonus.', [
    modifier('recruitment-cost', -12), modifier('research-progress', 12, { researchBranches: ['military-industry'] }), modifier('condition-recovery', 8),
  ]),
  trait('gbr', 'Verenigd Koninkrijk', 'Wereldwijde Verbindingen', 'Bestaande afstandsdruk op zeeroutes −15%; −4% naval operation cost; +3% naval-front supply.', 'Kleine wereldwijde zeebonus voor een topmacht.', [
    modifier('naval-distance-pressure', -15, NAVAL), modifier('operation-cost', -4, NAVAL), modifier('front-supply', 3, NAVAL),
  ]),
  trait('blr', 'Wit-Rusland', 'Binnenlandse Herstelbasis', '+20% condition recovery; +15% legercapaciteit; +18% land-front supply.', 'Herstelt en concentreert snel grote landstrijdkrachten.', [
    modifier('condition-recovery', 20), modifier('army-capacity', 15), modifier('front-supply', 18, LAND),
  ]),
  trait('swe', 'Zweden', 'Dubbel Gebruik', '+10% research progress in logistics-medicine; +10% reserve training; +8% DEF in arctic terrain.', 'Civiele capaciteit ondersteunt logistiek én landsverdediging.', [
    modifier('research-progress', 10, { researchBranches: ['logistics-medicine'] }), modifier('reserve-training', 10), modifier('defense', 8, { terrain: 'arctic' }),
  ]),
  trait('che', 'Zwitserland', 'Alpenredoute', '+12% DEF in mountain terrain; −5% base operating cost; bij uitschakeling wordt 10% in plaats van 25% van de treasury buitgemaakt.', 'Bescheiden structurele efficiëntie met een unieke nederlaagverzekering.', [
    modifier('defense', 12, { terrain: 'mountain' }), modifier('base-operating-cost', -5), modifier('treasury-seizure', -60, undefined, { from: 0.25, to: 0.10, unit: 'share' }),
  ]),

  // Afrika
  trait('dza', 'Algerije', 'Sahara-Diepte', '+5% DEF in desert terrain; +4% supply op land en naval fronts; −4% food import cost.', 'Kleine brede bonus voor een van Afrika’s sterkste starts.', [
    modifier('defense', 5, { terrain: 'desert' }), modifier('front-supply', 4), modifier('food-import-cost', -4),
  ]),
  trait('ago', 'Angola', 'Atlantische Wederopbouw', '+12% condition recovery; −10% integration cost; −10% naval operation cost.', 'Herstel en beheerste expansie langs de kust.', [
    modifier('condition-recovery', 12), modifier('integration-cost', -10), modifier('operation-cost', -10, NAVAL),
  ]),
  trait('ben', 'Benin', 'Corridorbestuur', '+18% supply op land en naval fronts; +18% tax efficiency; −18% integration duration.', 'Maakt een kleine corridorstaat tot efficiënte regionale veroveraar.', [
    modifier('front-supply', 18), modifier('tax-efficiency', 18), modifier('integration-duration', -18),
  ]),
  trait('bwa', 'Botswana', 'Kasbuffer van de Kalahari', '+50% starting treasury; −25% base operating cost; +25% condition recovery.', 'Financieel geduld compenseert de zeer kleine strijdmacht.', [
    modifier('army-capacity', 14), modifier('base-operating-cost', -25), modifier('condition-recovery', 25),
  ]),
  trait('bfa', 'Burkina Faso', 'Sahel-Binnenlinie', '+22% reserve training; +20% land-front supply; +18% DEF in het eigen core territory.', 'Landmacht die vanuit reserves een compacte kern verdedigt.', [
    modifier('reserve-training', 22), modifier('front-supply', 20, LAND), modifier('defense', 18, CORE),
  ]),
  trait('bdi', 'Burundi', 'Compacte Verdedigingskern', '+30% legercapaciteit; +30% DEF in het eigen core territory; +30% passive recruitment.', 'Zet een kleine, dichtbevolkte start sneller om in militaire massa.', [
    modifier('army-capacity', 30), modifier('defense', 30, CORE), modifier('passive-recruitment', 30),
  ]),
  trait('caf', 'Centraal-Afrikaanse Republiek', 'Bosredoute', '+30% DEF en −20% military casualties bij verdediging in jungle terrain; +30% land-front supply.', 'Zeer sterke overlevingsbonus voor een extreem zwakke start.', [
    modifier('defense', 30, { role: 'defender', terrain: 'jungle' }), modifier('military-casualties', -20, { role: 'defender', terrain: 'jungle' }), modifier('front-supply', 30, LAND),
  ]),
  trait('cog', 'Republiek Congo', 'Groene Riviercorridor', '+25% land-front supply vanuit jungle terrain; −25% integration duration voor veroverd jungle terrain; +22% condition recovery daar.', 'Bouwt een aaneengesloten regenwoudrijk op.', [
    modifier('front-supply', 25, { access: 'land', terrain: 'jungle' }), modifier('integration-duration', -25, { terrain: 'jungle' }), modifier('condition-recovery', 22, { terrain: 'jungle' }),
  ]),
  trait('cod', 'Democratische Republiek Congo', 'Continentale Regenwouddiepte', '+12% DEF in jungle terrain; +12% legercapaciteit; −12% integration cost.', 'Benut omvang en terrein zonder een buitensporige massabonus.', [
    modifier('defense', 12, { terrain: 'jungle' }), modifier('army-capacity', 12), modifier('integration-cost', -12),
  ]),
  trait('dji', 'Djibouti', 'Zeestraatknooppunt', '−30% naval operation cost; bestaande afstandsdruk op zeeroutes −40%; +30% tax efficiency.', 'Extreme maritieme hefboom voor een minuscuul land.', [
    modifier('operation-cost', -18, NAVAL), modifier('naval-distance-pressure', -25, NAVAL), modifier('tax-efficiency', 18),
  ]),
  trait('egy', 'Egypte', 'Nijlslagader', '+5% food storage capacity; +5% supply vanuit desert terrain; −4% base operating cost.', 'Bescheiden logistieke samenhang voor een Afrikaanse grootmacht.', [
    modifier('front-supply', 4, LAND), modifier('front-supply', 3, NAVAL), modifier('operation-cost', -3, NAVAL),
  ]),
  trait('gnq', 'Equatoriaal-Guinea', 'Golfenclave', '+60% starting treasury; +30% DEF in jungle terrain; +25% naval-front supply.', 'Kleine enclave die tijd en bereik koopt met liquide middelen.', [
    modifier('army-capacity', 14), modifier('defense', 18, { terrain: 'jungle' }), modifier('front-supply', 15, NAVAL),
  ]),
  trait('eri', 'Eritrea', 'Rode-Zeeredoute', '+30% DEF en −20% military casualties bij verdediging in het eigen core territory; −30% naval operation cost.', 'Maximale compensatie voor Afrika’s zwakste strategische start.', [
    modifier('defense', 20, DEF_CORE), modifier('military-casualties', -12, DEF_CORE), modifier('operation-cost', -18, NAVAL),
  ]),
  trait('eth', 'Ethiopië', 'Hooglandkern', '+12% DEF in het eigen core territory; +10% land-front supply; +10% domestic food production.', 'Weerbare continentale kern zonder foutieve mountain-afhankelijkheid.', [
    modifier('defense', 12, CORE), modifier('front-supply', 10, LAND), modifier('food-production', 10),
  ]),
  trait('gab', 'Gabon', 'Groene Kasstroom', '+25% tax efficiency; −25% condition loss door gevechten in jungle terrain; +25% food storage capacity.', 'Kleine economie die inkomsten omzet in langdurige overleving.', [
    modifier('tax-efficiency', 25), modifier('condition-loss', -25, { terrain: 'jungle' }), modifier('food-storage-capacity', 25),
  ]),
  trait('gmb', 'Gambia', 'Rivierpoort', '+30% supply op land en naval fronts; −30% integration duration voor landverbonden veroveringen; −30% base operating cost.', 'Zeer kleine start die snel langs nabije corridors kan groeien.', [
    modifier('front-supply', 18), modifier('integration-duration', -18, LAND), modifier('base-operating-cost', -18),
  ]),
  trait('gha', 'Ghana', 'Golfhandelsknooppunt', '+12% food export income; −10% base operating cost; −10% naval operation cost.', 'Economische kustmacht die overschotten en zeewegen benut.', [
    modifier('food-export-income', 12), modifier('base-operating-cost', -10), modifier('operation-cost', -10, NAVAL),
  ]),
  trait('gin', 'Guinee', 'Brongebieden', '+22% domestic food production; +18% land-front supply; +18% condition recovery.', 'Stabiele binnenlandse groei ondersteunt regionale campagnes.', [
    modifier('food-production', 22), modifier('front-supply', 18, LAND), modifier('condition-recovery', 18),
  ]),
  trait('gnb', 'Guinee-Bissau', 'Kustarchipel', '+30% food storage capacity; +30% naval-front supply; −30% naval operation cost.', 'Sterke voedsel- en zeebonus voor een uiterst kwetsbare start.', [
    modifier('food-storage-capacity', 18), modifier('front-supply', 18, NAVAL), modifier('operation-cost', -18, NAVAL),
  ]),
  trait('civ', 'Ivoorkust', 'West-Afrikaanse Groeipool', '+10% tax efficiency; +10% development-driven economy growth; −10% integration cost.', 'Economische expansie met beheersbare bestuurlijke lasten.', [
    modifier('tax-efficiency', 10), modifier('development-economy-growth', 10), modifier('integration-cost', -10),
  ]),
  trait('cmr', 'Kameroen', 'Dubbele Toegang', '+15% supply op land en naval fronts; +15% DEF in jungle terrain; −15% totale operation cost wanneer zowel land- als naval fronts actief zijn.', 'Beloont bewust combineren van continentale en maritieme fronten.', [
    modifier('front-supply', 15), modifier('defense', 15, { terrain: 'jungle' }), modifier('operation-cost', -15, { bothFronts: true }),
  ]),
  trait('ken', 'Kenia', 'Oost-Afrikaanse Schakel', '+10% supply op land en naval fronts; −10% integration duration; +8% development-driven economy growth.', 'Flexibele regionale verbinding tussen kust en binnenland.', [
    modifier('front-supply', 10), modifier('integration-duration', -10), modifier('development-economy-growth', 8),
  ]),
  trait('lso', 'Lesotho', 'Maloti-redoute', '+30% DEF en −20% military casualties bij verdediging in mountain terrain; −30% food import cost.', 'Een bijna onneembare maar importafhankelijke dwergstart.', [
    modifier('defense', 20, { role: 'defender', terrain: 'mountain' }), modifier('military-casualties', -12, { role: 'defender', terrain: 'mountain' }), modifier('food-import-cost', -18),
  ]),
  trait('lbr', 'Liberia', 'Atlantische Herstart', '+30% condition recovery; −30% naval operation cost; +25% naval-front supply.', 'Herstelt snel en zoekt betaalbare groei over zee.', [
    modifier('condition-recovery', 30), modifier('operation-cost', -30, NAVAL), modifier('front-supply', 25, NAVAL),
  ]),
  trait('lby', 'Libië', 'Woestijnreserve', '+25% starting treasury; −18% food import cost; +18% supply vanuit desert terrain.', 'Financiële reserves houden een importafhankelijke woestijnmacht draaiend.', [
    modifier('reserve-capacity', 12), modifier('food-import-cost', -18), modifier('front-supply', 18, { terrain: 'desert' }),
  ]),
  trait('mdg', 'Madagaskar', 'Eilandredoute', 'Bestaande afstandsdruk op zeeroutes −40%; +25% DEF in het eigen core territory; +25% food storage capacity.', 'Isolatie wordt een verdedigbaar vertrekpunt voor zee-expansie.', [
    modifier('naval-distance-pressure', -40, NAVAL), modifier('defense', 25, CORE), modifier('food-storage-capacity', 25),
  ]),
  trait('mwi', 'Malawi', 'Meerlandvoorraden', '+30% domestic food production; +30% food storage capacity; +20% condition recovery.', 'Overleeft via voedselbuffers en gestage binnenlandse opbouw.', [
    modifier('food-production', 30), modifier('food-storage-capacity', 30), modifier('condition-recovery', 20),
  ]),
  trait('mli', 'Mali', 'Sahelroute', '−18% land operation cost; +20% land-front supply; −15% integration duration voor landverbonden veroveringen.', 'Gespecialiseerde, betaalbare landexpansie.', [
    modifier('operation-cost', -18, LAND), modifier('front-supply', 20, LAND), modifier('integration-duration', -15, LAND),
  ]),
  trait('mar', 'Marokko', 'Twee-Zeënpoort', '−6% naval operation cost; +5% naval-front supply; +6% DEF in desert terrain.', 'Bescheiden kust- en woestijnbonus voor een sterke start.', [
    modifier('operation-cost', -6, NAVAL), modifier('front-supply', 5, NAVAL), modifier('defense', 6, { terrain: 'desert' }),
  ]),
  trait('mrt', 'Mauritanië', 'Kust van de Sahara', '+22% DEF in het eigen core territory; +22% supply op land en naval fronts; +25% food storage capacity.', 'Verbindt een kwetsbare kustbasis met diepe voorraden.', [
    modifier('defense', 22, CORE), modifier('front-supply', 22), modifier('food-storage-capacity', 25),
  ]),
  trait('moz', 'Mozambique', 'Lange Kustcorridor', 'Bestaande afstandsdruk op zeeroutes −30%; +18% naval-front supply; +18% condition recovery.', 'Maakt ver uit elkaar liggende kustoperaties haalbaar.', [
    modifier('naval-distance-pressure', -30, NAVAL), modifier('front-supply', 18, NAVAL), modifier('condition-recovery', 18),
  ]),
  trait('nam', 'Namibië', 'Uitgestrekte Aanvoerlijn', '+25% supply op land en naval fronts; −20% operation cost; −20% food import cost.', 'Compenseert geringe massa met goedkope, betrouwbare logistiek.', [
    modifier('front-supply', 25), modifier('operation-cost', -20), modifier('food-import-cost', -20),
  ]),
  trait('ner', 'Niger', 'Binnenlandse Voorraadstaat', '+22% land-front supply; +25% food storage capacity; +20% reserve training.', 'Bouwt eerst voorraden en reserves voor een latere landcampagne.', [
    modifier('front-supply', 22, LAND), modifier('food-storage-capacity', 25), modifier('reserve-training', 20),
  ]),
  trait('nga', 'Nigeria', 'Federale Schaal', '+5% legercapaciteit; −5% food logistics pressure van actieve operaties; −5% integration cost.', 'Kleine schaalvoordelen voor een van Afrika’s sterkste staten.', [
    modifier('army-capacity', 5), modifier('food-logistics-pressure', -5), modifier('integration-cost', -5),
  ]),
  trait('uga', 'Oeganda', 'Merenknooppunt', '+15% land-front supply; +15% reserve training; +12% domestic food production.', 'Een gebalanceerde reserve- en logistieke landmacht.', [
    modifier('front-supply', 15, LAND), modifier('reserve-training', 15), modifier('food-production', 12),
  ]),
  trait('rwa', 'Rwanda', 'Dichte Bestuurskern', '−25% base operating cost; +25% tax efficiency; −25% integration duration.', 'Zeer efficiënte administratie geeft een kleine start groeitempo.', [
    modifier('base-operating-cost', -25), modifier('tax-efficiency', 25), modifier('integration-duration', -25),
  ]),
  trait('sen', 'Senegal', 'Atlantische Toegangspoort', '+15% supply op land en naval fronts; −18% naval operation cost; −12% food import cost.', 'Betaalbare toegang tot zowel regionale als Atlantische routes.', [
    modifier('front-supply', 15), modifier('operation-cost', -18, NAVAL), modifier('food-import-cost', -12),
  ]),
  trait('sle', 'Sierra Leone', 'Herstelkust', '+30% condition recovery; −25% base operating cost; +30% food storage capacity.', 'Sterke herstelcyclus voor een fragiele economie.', [
    modifier('condition-recovery', 30), modifier('base-operating-cost', -25), modifier('food-storage-capacity', 30),
  ]),
  trait('sdn', 'Soedan', 'Nijlherstel', 'Wanneer condition lager is dan 80%: +30% condition recovery en +20% development-driven economy growth; +20% peacetime war-fatigue recovery.', 'Gericht herstel van de bestaande beschadigde openingsstaat.', [
    modifier('condition-recovery', 30, { conditionBelow: 0.8 }), modifier('development-economy-growth', 20, { conditionBelow: 0.8 }), modifier('war-fatigue-recovery', 20, PEACE),
  ]),
  trait('som', 'Somalië', 'Hoornkust', '−28% naval operation cost; +22% naval-front supply; −25% food import cost.', 'Een zwakke start met sterke kustlogistiek en betaalbare bevoorrading.', [
    modifier('operation-cost', -28, NAVAL), modifier('front-supply', 22, NAVAL), modifier('food-import-cost', -25),
  ]),
  trait('swz', 'Eswatini', 'Compact Bestuur', '−30% base operating cost; +30% tax efficiency; +30% reserve training.', 'Een minuscuul land dat efficiënt geld en personeel concentreert.', [
    modifier('base-operating-cost', -18), modifier('tax-efficiency', 18), modifier('army-capacity', 18),
  ]),
  trait('tza', 'Tanzania', 'Kust en Achterland', '+10% domestic food production; +12% supply op land en naval fronts; −10% integration duration.', 'Brede maar gematigde regionale groeibonus.', [
    modifier('food-production', 10), modifier('front-supply', 12), modifier('integration-duration', -10),
  ]),
  trait('tgo', 'Togo', 'Smalle Corridor', '+20% supply op land en naval fronts; −25% integration duration; −20% base operating cost.', 'Snelle bestuurlijke uitbreiding langs korte verbindingslijnen.', [
    modifier('front-supply', 20), modifier('integration-duration', -25), modifier('base-operating-cost', -20),
  ]),
  trait('tcd', 'Tsjaad', 'Binnenlandsknooppunt', '−20% land operation cost; +22% land-front supply; −20% condition loss door gevechten in jungle terrain.', 'Sterke operationele bonus rond de huidige Middle-Africa-terreinmapping.', [
    modifier('operation-cost', -20, LAND), modifier('front-supply', 22, LAND), modifier('condition-loss', -20, { terrain: 'jungle' }),
  ]),
  trait('tun', 'Tunesië', 'Compacte Middellandse-Zeekern', '−12% base operating cost; −12% naval operation cost; +12% DEF in desert terrain.', 'Efficiënte compacte staat met kust- en woestijnopties.', [
    modifier('base-operating-cost', -12), modifier('operation-cost', -12, NAVAL), modifier('defense', 12, { terrain: 'desert' }),
  ]),
  trait('zmb', 'Zambia', 'Centraal Economisch Netwerk', '+18% development-driven economy growth; +18% land-front supply; −15% army upkeep.', 'Betaalbare landmacht gevoed door snellere economische opbouw.', [
    modifier('development-economy-growth', 18), modifier('front-supply', 18, LAND), modifier('army-upkeep', -15),
  ]),
  trait('zwe', 'Zimbabwe', 'Herstelmotor', '+20% condition recovery; +15% tax efficiency; +18% domestic food production.', 'Herstelt tegelijk productie, staatsinkomen en territoriale condition.', [
    modifier('condition-recovery', 20), modifier('tax-efficiency', 15), modifier('food-production', 18),
  ]),
  trait('zaf', 'Zuid-Afrika', 'Twee-Oceanenbereik', 'Bestaande afstandsdruk op zeeroutes −10%; −4% naval operation cost; +4% research output.', 'Kleine maritiem-technologische bonus voor Afrika’s sterkste start.', [
    modifier('naval-distance-pressure', -10, NAVAL), modifier('operation-cost', -4, NAVAL), modifier('research-output', 4),
  ]),
  trait('sds', 'Zuid-Soedan', 'Witte-Nijlreserve', '+25% domestic food production; +30% condition recovery; +20% land-front supply.', 'Voedsel en herstel maken een beschadigde jonge start levensvatbaar.', [
    modifier('food-production', 25), modifier('condition-recovery', 30), modifier('front-supply', 20, LAND),
  ]),

  // Azië
  trait('afg', 'Afghanistan', 'Hindoekoes-volharding', '+24% DEF en −12% military casualties bij verdediging van mountain homeland; +7% recruitment throughput tijdens oorlog.', 'Een taaie bergverdediger die verliezen langzaam kan aanvullen.', [
    modifier('defense', 24, { role: 'defender', terrain: 'mountain', homeland: true }), modifier('military-casualties', -12, { role: 'defender', terrain: 'mountain', homeland: true }), modifier('recruitment-throughput', 7, WAR),
  ]),
  trait('arm', 'Armenië', 'Hooglandredoute', '+30% DEF en −20% military casualties bij verdediging van mountain homeland; +10% research progress in defensive-systems.', 'Extreme lokale veiligheid, maar geen offensieve schaalbonus.', [
    modifier('defense', 30, { role: 'defender', terrain: 'mountain', homeland: true }), modifier('military-casualties', -20, { role: 'defender', terrain: 'mountain', homeland: true }), modifier('research-progress', 10, { researchBranches: ['defensive-systems'] }),
  ]),
  trait('aze', 'Azerbeidzjan', 'Kaspische Krijgsmacht', '+6% research progress in advanced-weapons; −5% army upkeep; +6% land-front supply vanuit desert terrain.', 'Een betaalbare, technologisch gerichte regionale strijdmacht.', [
    modifier('research-progress', 6, { researchBranches: ['advanced-weapons'] }), modifier('army-upkeep', -5), modifier('front-supply', 6, { access: 'land', terrain: 'desert' }),
  ]),
  trait('bhr', 'Bahrein', 'Eilandbuffer', '−18% food import cost; −12% army upkeep; +14% DEF in desert homeland.', 'Een microstaat die importafhankelijkheid en legerkosten kan dragen.', [
    modifier('food-import-cost', -18), modifier('army-upkeep', -12), modifier('defense', 14, { terrain: 'desert', homeland: true }),
  ]),
  trait('bgd', 'Bangladesh', 'Deltaveerkracht', '+4% domestic food production; +3% food storage capacity; +7% condition recovery wanneer food security lager is dan 90%.', 'De dichtbevolkte delta herstelt juist onder voedselstress.', [
    modifier('food-production', 4), modifier('food-storage-capacity', 3), modifier('condition-recovery', 7, { foodSecurityBelow: 0.9 }),
  ]),
  trait('btn', 'Bhutan', 'Himalayaans Evenwicht', '+30% DEF en −20% military casualties bij verdediging van mountain homeland; +24% food storage capacity.', 'Een bijna onneembare, zelfredzame microstaat zonder aanvalskracht.', [
    modifier('defense', 20, { role: 'defender', terrain: 'mountain', homeland: true }), modifier('reserve-training', 12), modifier('food-storage-capacity', 18),
  ]),
  trait('brn', 'Brunei', 'Sultanaatsbuffer', '+21% research output zolang treasury niet negatief is; −10% army upkeep; +30% DEF in jungle homeland.', 'De zwakste Aziatische start zet financiële rust om in technologie en overleving.', [
    modifier('research-output', 18, { treasuryAtLeast: 0 }), modifier('army-upkeep', -15), modifier('defense', 18, { terrain: 'jungle', homeland: true }),
  ]),
  trait('khm', 'Cambodja', 'Mekong-rijstkom', '+8% domestic food production; +8% condition recovery buiten oorlog; +12% DEF in jungle homeland.', 'Voedsel en herstel vormen de basis voor langzame regionale groei.', [
    modifier('food-production', 8), modifier('condition-recovery', 8, PEACE), modifier('defense', 12, { terrain: 'jungle', homeland: true }),
  ]),
  trait('cyp', 'Cyprus', 'Oost-Mediterrane Redoute', '+24% naval-front supply; −18% eigen military casualties bij aanvallen met naval access; +15% food storage capacity.', 'Een kleine eilandstaat die zeefronten opvallend goed overleeft.', [
    modifier('front-supply', 16, NAVAL), modifier('military-casualties', -12, { role: 'attacker', access: 'naval' }), modifier('food-storage-capacity', 12),
  ]),
  trait('phl', 'Filipijnen', 'Eilandenketen', '+7% naval-front supply; −5% naval operation cost; +4% ATK op naval fronts.', 'Verspreide eilanden worden een bruikbaar offensief netwerk.', [
    modifier('front-supply', 7, NAVAL), modifier('operation-cost', -5, NAVAL), modifier('attack', 4, NAVAL),
  ]),
  trait('geo', 'Georgië', 'Kaukasuspoort', '+30% DEF en −20% military casualties bij verdediging van mountain homeland; +24% land-front supply.', 'Zeer sterke bergverdediging met betrouwbare continentale aanvoer.', [
    modifier('defense', 30, { role: 'defender', terrain: 'mountain', homeland: true }), modifier('military-casualties', -20, { role: 'defender', terrain: 'mountain', homeland: true }), modifier('front-supply', 24, LAND),
  ]),
  trait('ind', 'India', 'Demografische Diepte', '+3% domestic food production; +2% van de gefinancierde population-growth component; +2% passive recruitment.', 'Een kleine, brede bonus op India’s al enorme menselijke basis.', [
    modifier('army-capacity', 3), modifier('passive-recruitment', 3), modifier('research-progress', 3, { researchBranches: ['military-industry'] }),
  ]),
  trait('idn', 'Indonesië', 'Archipelcommando', '+5% naval-front supply; +7% DEF in jungle homeland; +4% food storage capacity.', 'Bescheiden samenhang voor een al krachtige eilandenstaat.', [
    modifier('front-supply', 5, NAVAL), modifier('operation-cost', -4, NAVAL), modifier('reserve-capacity', 4),
  ]),
  trait('irq', 'Irak', 'Mesopotamisch Herstel', '+6% condition recovery buiten oorlog; +6% land-front supply vanuit desert terrain; +5% peacetime war-fatigue recovery.', 'Herstelt sneller tussen kostbare continentale oorlogen.', [
    modifier('condition-recovery', 6, PEACE), modifier('front-supply', 6, { access: 'land', terrain: 'desert' }), modifier('war-fatigue-recovery', 5, PEACE),
  ]),
  trait('irn', 'Iran', 'Plateau-logistiek', '+6% DEF in het eigen core territory; +4% land-front supply; +4% research progress in advanced-weapons.', 'Een kleine defensieve en technologische bonus voor een major power.', [
    modifier('defense', 6, CORE), modifier('front-supply', 4, LAND), modifier('research-progress', 4, { researchBranches: ['advanced-weapons'] }),
  ]),
  trait('isr', 'Israël', 'Reservistenstaat', '+8% passive recruitment; −3% military casualties als verdediger; +2% research progress in defensive-systems.', 'Kleine bevolking, maar snelle aanvulling en efficiënte verdediging.', [
    modifier('passive-recruitment', 8), modifier('military-casualties', -3, { role: 'defender' }), modifier('research-progress', 2, { researchBranches: ['defensive-systems'] }),
  ]),
  trait('jpn', 'Japan', 'Precisieweerbaarheid', '+6% DEF in urban homeland; +2% research output; +6% peacetime war-fatigue recovery.', 'Een subtiele kwaliteitsbonus passend bij een topmacht.', [
    modifier('national-iq', 1), modifier('defense', 5, { role: 'defender' }), modifier('research-progress', 4, { researchBranches: ['defensive-systems'] }),
  ]),
  trait('yem', 'Jemen', 'Jemenitische Volharding', '+15% condition recovery buiten oorlog; −10% food import cost; +12% DEF in desert homeland.', 'Geeft een beschadigde staat een geloofwaardige herstelroute.', [
    modifier('condition-recovery', 15, PEACE), modifier('food-import-cost', -10), modifier('defense', 12, { terrain: 'desert', homeland: true }),
  ]),
  trait('jor', 'Jordanië', 'Woestijncorridor', '−8% food import cost; +8% DEF in desert homeland; +6% condition recovery wanneer food security lager is dan 90%.', 'Overleeft door betaalbare import en crisisbestendig bestuur.', [
    modifier('food-import-cost', -8), modifier('defense', 8, { terrain: 'desert', homeland: true }), modifier('condition-recovery', 6, { foodSecurityBelow: 0.9 }),
  ]),
  trait('kaz', 'Kazachstan', 'Steppe-diepte', '+4% legercapaciteit; +7% land-front supply; +4% food storage capacity.', 'Benut ruimte voor een iets groter, langer bevoorraad landleger.', [
    modifier('army-capacity', 4), modifier('front-supply', 7, LAND), modifier('food-storage-capacity', 4),
  ]),
  trait('kgz', 'Kirgizië', 'Tien-Shanreserve', '+25% DEF in mountain homeland; −6% recruitment cost; +6% condition recovery buiten oorlog.', 'Goedkope wederopbouw achter een sterke bergbarrière.', [
    modifier('defense', 25, { terrain: 'mountain', homeland: true }), modifier('recruitment-cost', -6), modifier('condition-recovery', 6, PEACE),
  ]),
  trait('kwt', 'Koeweit', 'Diepe Kas', '−12% army upkeep; −10% food import cost; +7% research output zolang treasury niet negatief is.', 'Financiële draagkracht compenseert de uiterst kleine militaire basis.', [
    modifier('army-upkeep', -12), modifier('food-import-cost', -10), modifier('research-output', 7, { treasuryAtLeast: 0 }),
  ]),
  trait('lao', 'Laos', 'Mekong-binnenlinie', '+20% DEF in jungle homeland; +10% domestic food production; +14% land-front supply.', 'Een zelfvoorzienende jungle-verdediger met sterke binnenlandse lijnen.', [
    modifier('defense', 20, { terrain: 'jungle', homeland: true }), modifier('food-production', 10), modifier('front-supply', 14, LAND),
  ]),
  trait('lbn', 'Libanon', 'Levantijnse Herbouw', '+12% research output zolang treasury niet negatief is; −10% food import cost; +18% DEF in desert homeland.', 'Beloont financieel herstel met kennisopbouw en lokale veiligheid.', [
    modifier('research-output', 12, { treasuryAtLeast: 0 }), modifier('food-import-cost', -10), modifier('defense', 18, { terrain: 'desert', homeland: true }),
  ]),
  trait('mys', 'Maleisië', 'Straat van Malakka', '−5% food import cost; +3% research output; +5% naval-front supply.', 'Een kleine maar complete kennis-, import- en zeeroutebonus.', [
    modifier('food-import-cost', -5), modifier('research-output', 3), modifier('front-supply', 5, NAVAL),
  ]),
  trait('mng', 'Mongolië', 'Oneindige Steppe', '+9% legercapaciteit; +22% land-front supply; +14% food storage capacity.', 'De geringe bevolking krijgt strategische diepte zonder extra kwaliteit.', [
    modifier('army-capacity', 9), modifier('front-supply', 22, LAND), modifier('food-storage-capacity', 14),
  ]),
  trait('mmr', 'Myanmar', 'Irrawaddy-herstel', '+10% condition recovery buiten oorlog; +6% land-front supply vanuit jungle terrain; +2% domestic food production.', 'Herstelt de beschadigde staat via binnenlandse logistiek en voedsel.', [
    modifier('condition-recovery', 10, PEACE), modifier('front-supply', 6, { access: 'land', terrain: 'jungle' }), modifier('food-production', 2),
  ]),
  trait('npl', 'Nepal', 'Himalayabastion', '+22% DEF en −10% military casualties bij verdediging van mountain homeland; +6% condition recovery buiten oorlog.', 'Een sterke thuisverdediging die niet meegaat op verovering.', [
    modifier('defense', 22, { role: 'defender', terrain: 'mountain', homeland: true }), modifier('military-casualties', -10, { role: 'defender', terrain: 'mountain', homeland: true }), modifier('condition-recovery', 6, PEACE),
  ]),
  trait('prk', 'Noord-Korea', 'Ingegraven Mobilisatie', '−8% army upkeep; +6% DEF in homeland; +3% recruitment throughput tijdens oorlog.', 'Houdt een relatief groot leger goedkoop en defensief inzetbaar.', [
    modifier('army-upkeep', -8), modifier('defense', 6, CORE), modifier('recruitment-throughput', 3, WAR),
  ]),
  trait('uzb', 'Oezbekistan', 'Zijderoute-logistiek', '+7% land-front supply; −4% recruitment cost; +4% development-driven economy growth.', 'Betaalbare landmacht gekoppeld aan gestage economische opbouw.', [
    modifier('front-supply', 7, LAND), modifier('recruitment-cost', -4), modifier('development-economy-growth', 4),
  ]),
  trait('omn', 'Oman', 'Moessonroute', '+15% naval-front supply; −15% naval operation cost; +17% food storage capacity.', 'Een kleine staat met uitzonderlijk volhoudbare zeeverbindingen.', [
    modifier('front-supply', 15, NAVAL), modifier('operation-cost', -15, NAVAL), modifier('food-storage-capacity', 17),
  ]),
  trait('tls', 'Oost-Timor', 'Jonge Eilandstaat', '+18% domestic food production; +20% condition recovery buiten oorlog; +27% DEF in jungle homeland.', 'Grote herstel- en overlevingsbonus voor een van de zwakste starts.', [
    modifier('food-production', 18), modifier('condition-recovery', 18, PEACE), modifier('defense', 18, { terrain: 'jungle', homeland: true }),
  ]),
  trait('pak', 'Pakistan', 'Strategische Diepte', '+4% land-front supply; +4% recruitment throughput tijdens oorlog; +2% research progress in defensive-systems.', 'Een kleine, beheerste bonus voor een al sterke militaire staat.', [
    modifier('front-supply', 4, LAND), modifier('recruitment-throughput', 4, WAR), modifier('research-progress', 2, { researchBranches: ['defensive-systems'] }),
  ]),
  trait('psx', 'Palestina', 'Standvastigheid', '+26% DEF en −18% military casualties bij verdediging van desert homeland; resterende food-access vulnerability −12%.', 'Maakt overleven en voedseltoegang mogelijk zonder offensieve bonus.', [
    modifier('defense', 26, { role: 'defender', terrain: 'desert', homeland: true }), modifier('military-casualties', -18, { role: 'defender', terrain: 'desert', homeland: true }), modifier('food-access-vulnerability', -12),
  ]),
  trait('qat', 'Qatar', 'Compacte Welvaartsbuffer', '−15% army upkeep; +10% research output zolang treasury niet negatief is; +12% DEF in desert homeland.', 'Een piepkleine staat koopt tijd en technologische relevantie.', [
    modifier('army-upkeep', -15), modifier('research-output', 10, { treasuryAtLeast: 0 }), modifier('defense', 12, { terrain: 'desert', homeland: true }),
  ]),
  trait('sau', 'Saoedi-Arabië', 'Woestijnverbindingen', '+4% land-front supply vanuit desert terrain; −3% food import cost; −4% war-fatigue gain.', 'Alleen een subtiele logistieke bonus voor een topstart.', [
    modifier('front-supply', 4, { access: 'land', terrain: 'desert' }), modifier('food-import-cost', -3), modifier('war-fatigue-gain', -4),
  ]),
  trait('sgp', 'Singapore', 'Stadsstaat zonder Speling', '+10% research output; −8% army upkeep; +7% DEF in urban homeland.', 'Technologie en efficiëntie maken één kleine stad speelbaar.', [
    modifier('research-output', 10), modifier('army-upkeep', -8), modifier('defense', 7, { terrain: 'urban', homeland: true }),
  ]),
  trait('lka', 'Sri Lanka', 'Indische-Oceaananker', '+8% naval-front supply; +6% food storage capacity; +3,5% research progress in economy-science.', 'Veilige opbouw vanuit een strategisch eiland.', [
    modifier('front-supply', 8, NAVAL), modifier('food-storage-capacity', 6), modifier('research-progress', 3.5, { researchBranches: ['economy-science'] }),
  ]),
  trait('syr', 'Syrië', 'Levantijnse Verdedigingsgordel', '+18% DEF en −10% military casualties bij verdediging van desert homeland; +9% condition recovery tijdens oorlog.', 'Blijft functioneren terwijl het eigen grondgebied wordt bevochten.', [
    modifier('defense', 18, { role: 'defender', terrain: 'desert', homeland: true }), modifier('military-casualties', -10, { role: 'defender', terrain: 'desert', homeland: true }), modifier('condition-recovery', 9, WAR),
  ]),
  trait('tjk', 'Tadzjikistan', 'Pamirreserve', '+28% DEF in mountain homeland; +7% passive recruitment; +6% food storage capacity.', 'Bergveiligheid plus voldoende reserves om terug te vechten.', [
    modifier('defense', 28, { terrain: 'mountain', homeland: true }), modifier('passive-recruitment', 7), modifier('food-storage-capacity', 6),
  ]),
  trait('twn', 'Taiwan', 'Silicium Schild', '+3% research output; −2% recruitment cost; +3% DEF als verdediger.', 'Een kleine technologische kwaliteitsbonus zonder eilandimmuniteit.', [
    modifier('research-output', 3), modifier('recruitment-cost', -2), modifier('defense', 3, { role: 'defender' }),
  ]),
  trait('tha', 'Thailand', 'Chao Phraya-basis', '+5% domestic food production; +3% development-driven economy growth; +6% DEF in jungle homeland.', 'Evenwichtige voedsel-, groei- en thuisverdediging.', [
    modifier('food-production', 5), modifier('development-economy-growth', 3), modifier('defense', 6, { terrain: 'jungle', homeland: true }),
  ]),
  trait('tur', 'Turkije', 'Anatolische Binnenlijnen', '+4% land-front supply; −3% land operation cost; +2% ATK op land fronts.', 'Kleine operationele bonus voor een major power op twee continenten.', [
    modifier('front-supply', 4, LAND), modifier('operation-cost', -3, LAND), modifier('attack', 2, LAND),
  ]),
  trait('tkm', 'Turkmenistan', 'Karakumreserve', '+14% food storage capacity; −6% army upkeep; +6% land-front supply.', 'Voorraad en lage vaste kosten maken langdurige opbouw mogelijk.', [
    modifier('food-storage-capacity', 14), modifier('army-upkeep', -6), modifier('front-supply', 6, LAND),
  ]),
  trait('are', 'Verenigde Arabische Emiraten', 'Federale Knoop', '+6% research output zolang treasury niet negatief is; −4% army upkeep; +3% supply op land en naval fronts.', 'Financiële efficiëntie ondersteunt beide bestaande routetypen.', [
    modifier('research-output', 6, { treasuryAtLeast: 0 }), modifier('army-upkeep', -4), modifier('front-supply', 3),
  ]),
  trait('vnm', 'Vietnam', 'Deltaverdediging', '+8% DEF en −4% military casualties bij verdediging van jungle homeland; −7% condition damage door gevechten daar.', 'Maakt invasies duur zonder Vietnams sterke start verder offensief te buffen.', [
    modifier('defense', 8, { role: 'defender', terrain: 'jungle', homeland: true }), modifier('military-casualties', -4, { role: 'defender', terrain: 'jungle', homeland: true }), modifier('condition-loss', -7, { terrain: 'jungle', homeland: true }),
  ]),
  trait('chn', 'China', 'Geïntegreerde Productieketen', '+2% research progress in military-industry; −2% recruitment cost; +2% condition recovery.', 'Een minimale efficiëntiebonus voor de nummer twee van de wereld.', [
    modifier('research-progress', 3, { researchBranches: ['military-industry'] }), modifier('accelerated-recruitment', 3), modifier('front-supply', 3),
  ]),
  trait('kor', 'Zuid-Korea', 'Snelle Industriële Cyclus', '+3% accelerated recruitment; −2% recruitment cost; +4% DEF in urban homeland.', 'Hoogwaardige snelle vervanging met een kleine stedelijke defensiebonus.', [
    modifier('national-iq', 1), modifier('accelerated-recruitment', 3), modifier('defense', 4, { role: 'defender' }),
  ]),
]);

const traitsByPlayerId = Object.freeze(Object.fromEntries(
  COUNTRY_TRAITS_V2.map((entry) => [entry.playerId, entry]),
) as Readonly<Record<string, CountryTraitV2>>);

export const countryTraitV2 = (playerId: PlayerId | string): CountryTraitV2 | undefined => (
  traitsByPlayerId[String(playerId)]
);

export const countryTraitModifiersV2 = (
  playerId: PlayerId | string,
  key: TraitModifierKeyV2,
): readonly CountryTraitModifierV2[] => (
  countryTraitV2(playerId)?.modifiers.filter((entry) => entry.key === key) ?? Object.freeze([])
);

export const countryTraitOpeningWeaknessV2 = (
  playerId: PlayerId | string,
): TraitOpeningWeaknessV2 | undefined => countryTraitV2(playerId)?.openingWeakness;

export const traitOpeningWeaknessForModifierKeyV2 = (
  key: TraitModifierKeyV2,
): TraitOpeningWeaknessV2 => TRAIT_OPENING_WEAKNESS_BY_KEY_V2[key];

export function traitModifierAppliesV2(
  entry: CountryTraitModifierV2,
  context: TraitEvaluationContextV2 = {},
): boolean {
  const scope = entry.scope;
  if (!scope) return true;
  if (scope.atWar !== undefined && context.atWar !== scope.atWar) return false;
  if (scope.role !== undefined && context.role !== scope.role) return false;
  if (scope.access !== undefined && context.access !== scope.access) return false;
  if (scope.terrain !== undefined && context.terrain !== scope.terrain) return false;
  if (scope.homeland !== undefined && context.homeland !== scope.homeland) return false;
  if (scope.foodSecurityAtLeast !== undefined
    && (context.foodSecurity === undefined || context.foodSecurity < scope.foodSecurityAtLeast)) return false;
  if (scope.foodSecurityBelow !== undefined
    && (context.foodSecurity === undefined || context.foodSecurity >= scope.foodSecurityBelow)) return false;
  if (scope.treasuryAtLeast !== undefined
    && (context.treasury === undefined || context.treasury < scope.treasuryAtLeast)) return false;
  if (scope.conditionBelow !== undefined
    && (context.condition === undefined || context.condition >= scope.conditionBelow)) return false;
  if (scope.firstConquest !== undefined && context.firstConquest !== scope.firstConquest) return false;
  if (scope.bothFronts !== undefined && context.bothFronts !== scope.bothFronts) return false;
  if (scope.hasLandFront !== undefined && context.hasLandFront !== scope.hasLandFront) return false;
  if (scope.researchBranches !== undefined
    && (context.researchBranch === undefined || !scope.researchBranches.includes(context.researchBranch))) return false;
  return true;
}

export interface TraitFactorBoundsV2 {
  readonly minimum: number;
  readonly maximum: number;
}

const DEFAULT_FACTOR_BOUNDS = Object.freeze({ minimum: 0.7, maximum: 1.3 });
const FACTOR_BOUND_OVERRIDES: Readonly<Partial<Record<TraitModifierKeyV2, TraitFactorBoundsV2>>> = Object.freeze({
  // Greenland keeps meaningful AI recruitable room, while the human-only
  // underdog multiplier supplies most of its exceptional playable capacity.
  'army-capacity': Object.freeze({ minimum: 0.7, maximum: 13 }),
  // Greenland's exceptional cap is useful only when the same visible trait
  // can recruit and maintain it within a playable timescale.
  'recruitment-throughput': Object.freeze({ minimum: 0.7, maximum: 2.5 }),
  'army-upkeep': Object.freeze({ minimum: 0.2, maximum: 1.3 }),
  'military-casualties': Object.freeze({ minimum: 0.8, maximum: 1 }),
  'naval-distance-pressure': Object.freeze({ minimum: 0.55, maximum: 1 }),
  'treasury-seizure': Object.freeze({ minimum: 0.4, maximum: 1 }),
  'starting-treasury': Object.freeze({ minimum: 1, maximum: 1.75 }),
});

/** No trait or human amplification can make a standing army literally free. */
export const ARMY_UPKEEP_TRAIT_FACTOR_HARD_MINIMUM_V2 = 0.10;
/** Even the strongest player-scaled national identity must still take losses. */
export const MILITARY_CASUALTY_TRAIT_FACTOR_HARD_MINIMUM_V2 = 0.35;
export const INTEGRATION_DURATION_TRAIT_FACTOR_HARD_MINIMUM_V2 = 0.25;
export const ROUTE_PRESSURE_TRAIT_FACTOR_HARD_MINIMUM_V2 = 0.20;
export const COUNTRY_TRAIT_FACTOR_HARD_MINIMUM_V2 = 0.10;
/** IQ affects several core systems at once, so player scaling stays bounded. */
export const NATIONAL_IQ_TRAIT_FACTOR_HARD_MAXIMUM_V2 = 1.15;

export const traitFactorBoundsV2 = (
  key: TraitModifierKeyV2,
  signedDistanceMultiplier = 1,
): TraitFactorBoundsV2 => {
  const base = FACTOR_BOUND_OVERRIDES[key] ?? DEFAULT_FACTOR_BOUNDS;
  return Object.freeze({
    minimum: Math.max(0, 1 + (base.minimum - 1) * signedDistanceMultiplier),
    maximum: 1 + (base.maximum - 1) * signedDistanceMultiplier,
  });
};

const clampFactor = (value: number, bounds: TraitFactorBoundsV2): number => (
  Math.min(bounds.maximum, Math.max(bounds.minimum, value))
);

function humanTraitMultiplierFromContextV2(
  playerId: PlayerId | string,
  context: TraitEvaluationContextV2,
): number {
  if (!context.humanControlled) return 1;
  const override = context.humanTraitMultiplier;
  return override !== undefined && Number.isFinite(override) && override >= 0
    ? override
    : humanCountryTraitMultiplierV2(playerId);
}

/**
 * Scales a fixed replacement away from its neutral source by the same human
 * multiplier as ordinary percentages. Callers that consume `replacement.to`
 * directly can use this helper without creating another trait layer.
 */
export function countryTraitReplacementValueV2(
  playerId: PlayerId | string,
  entry: CountryTraitModifierV2,
  context: TraitEvaluationContextV2 = {},
): number | undefined {
  const replacement = entry.replacement;
  if (!replacement) return undefined;
  const multiplier = humanTraitMultiplierFromContextV2(playerId, context);
  return Math.max(0, replacement.from
    + (replacement.to - replacement.from) * multiplier);
}

/** Returns 1 when the country, channel or derived scope does not match. */
export function countryTraitFactorV2(
  playerId: PlayerId | string,
  key: TraitModifierKeyV2,
  context: TraitEvaluationContextV2 = {},
): number {
  const signedDistanceMultiplier = humanTraitMultiplierFromContextV2(playerId, context);
  const factor = countryTraitModifiersV2(playerId, key)
    .filter((entry) => traitModifierAppliesV2(entry, context))
    .reduce((product, entry) => (
      product * (1 + (entry.factor - 1) * signedDistanceMultiplier)
    ), 1);
  const bounded = clampFactor(factor, traitFactorBoundsV2(key, signedDistanceMultiplier));
  if (key === 'army-upkeep') {
    return Math.max(ARMY_UPKEEP_TRAIT_FACTOR_HARD_MINIMUM_V2, bounded);
  }
  if (key === 'military-casualties') {
    return Math.max(MILITARY_CASUALTY_TRAIT_FACTOR_HARD_MINIMUM_V2, bounded);
  }
  if (key === 'integration-duration') {
    return Math.max(INTEGRATION_DURATION_TRAIT_FACTOR_HARD_MINIMUM_V2, bounded);
  }
  if (key === 'naval-distance-pressure' || key === 'land-hop-pressure') {
    return Math.max(ROUTE_PRESSURE_TRAIT_FACTOR_HARD_MINIMUM_V2, bounded);
  }
  if (key === 'national-iq') {
    return Math.min(NATIONAL_IQ_TRAIT_FACTOR_HARD_MAXIMUM_V2, bounded);
  }
  return Math.max(COUNTRY_TRAIT_FACTOR_HARD_MINIMUM_V2, bounded);
}

/** Order-independent mechanical signature used to forbid duplicate country identities. */
export const countryTraitEffectSignatureV2 = (entry: CountryTraitV2): string => (
  entry.modifiers.map((modifierEntry) => {
    const scope = modifierEntry.scope ? JSON.stringify(modifierEntry.scope) : '*';
    const replacement = modifierEntry.replacement ? JSON.stringify(modifierEntry.replacement) : '';
    return `${modifierEntry.key}:${modifierEntry.percentage}:${scope}:${replacement}`;
  }).sort().join('|')
);
