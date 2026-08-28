import { describe, expect, it } from 'vitest';
import { WORLD_CONTENT_V2 } from './content';
import { createWorldStateV2 } from './bootstrap';
import { selectGlobalRankingV2 } from './selectors';
import {
  BASE_COUNTRY_TRAIT_VALUE_BUDGET_V2,
  BELGIUM_TRAIT_VALUE_MULTIPLIER_V2,
  COUNTRY_TRAITS_V2,
  FOOD_TRAIT_ALLOWLIST_V2,
  FOOD_TRAIT_MODIFIER_KEYS_V2,
  HUMAN_TRAIT_MULTIPLIER_STRONGEST_V2,
  HUMAN_TRAIT_MULTIPLIER_WEAKEST_V2,
  OPENING_MILITARY_ORDER_V2,
  TOP_POWER_COUNTRY_TRAIT_VALUE_BUDGET_V2,
  TRAIT_MODIFIER_KEYS_V2,
  countryTraitEffectSignatureV2,
  countryTraitBaseValueScoreV2,
  countryTraitFactorV2,
  countryTraitModifiersV2,
  countryTraitOpeningWeaknessV2,
  countryTraitV2,
  describeCountryTraitModifiersV2,
  humanCountryTraitMultiplierV2,
  openingMilitaryRankV2,
  traitFactorBoundsV2,
  traitModifierAppliesV2,
  traitOpeningWeaknessForModifierKeyV2,
  type TraitEvaluationContextV2,
  type TraitModifierKeyV2,
} from './traits';

const stableStructuralValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return [...value].map(stableStructuralValue).sort();
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Readonly<Record<string, unknown>>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => [key, stableStructuralValue(entry)]));
};

/** Country identity must differ by mechanics, not merely by tuned percentages. */
const structuralTraitSignature = (entry: (typeof COUNTRY_TRAITS_V2)[number]): string => (
  entry.modifiers.map(({ key, scope, replacement }) => JSON.stringify({
    key,
    scope: stableStructuralValue(scope ?? null),
    replacement: stableStructuralValue(replacement ?? null),
  })).sort().join('|')
);

describe('country trait catalog V2', () => {
  it('covers every canonical country exactly once', () => {
    const canonicalIds = WORLD_CONTENT_V2.nationIds.map(String).sort();
    const traitIds = COUNTRY_TRAITS_V2.map((entry) => String(entry.playerId)).sort();

    expect(canonicalIds).toHaveLength(166);
    expect(traitIds).toHaveLength(166);
    expect(traitIds).toEqual(canonicalIds);
    expect(new Set(traitIds).size).toBe(166);
    expect(traitIds.every((id) => countryTraitV2(id)?.playerId === id)).toBe(true);
  });

  it('keeps English copy, exact effects and percentage-independent mechanics unique', () => {
    const names = COUNTRY_TRAITS_V2.map((entry) => entry.name);
    const effects = COUNTRY_TRAITS_V2.map((entry) => entry.effect);
    const effectCountries = new Map<string, string[]>();
    COUNTRY_TRAITS_V2.forEach((entry) => effectCountries.set(entry.effect, [
      ...(effectCountries.get(entry.effect) ?? []),
      String(entry.playerId),
    ]));
    const duplicateEffects = [...effectCountries.values()]
      .filter((countryIds) => countryIds.length > 1);
    const signatures = COUNTRY_TRAITS_V2.map(countryTraitEffectSignatureV2);
    const signatureCountries = new Map<string, string[]>();
    COUNTRY_TRAITS_V2.forEach((entry, index) => {
      const signature = signatures[index]!;
      signatureCountries.set(signature, [
        ...(signatureCountries.get(signature) ?? []),
        String(entry.playerId),
      ]);
    });
    const duplicateMechanics = [...signatureCountries.values()]
      .filter((countryIds) => countryIds.length > 1);
    const structuralCountries = new Map<string, string[]>();
    COUNTRY_TRAITS_V2.forEach((entry) => {
      const signature = structuralTraitSignature(entry);
      structuralCountries.set(signature, [
        ...(structuralCountries.get(signature) ?? []),
        String(entry.playerId),
      ]);
    });
    const duplicateStructures = [...structuralCountries.values()]
      .filter((countryIds) => countryIds.length > 1);

    expect(new Set(names).size).toBe(166);
    expect(duplicateEffects).toEqual([]);
    expect(duplicateMechanics).toEqual([]);
    expect(duplicateStructures).toEqual([]);

    const dutchVisibleWords = /\b(?:wanneer|zolang|eigen|verdediging|leger|legercapaciteit|buiten|oorlog|vrede|zwakste|kleine|sterke|voedsel|herstel|voorraad|kosten|aanvoer|verovering)\b/i;
    for (const entry of COUNTRY_TRAITS_V2) {
      expect(entry.countryName).toBe(WORLD_CONTENT_V2.nations[entry.playerId]?.name);
      expect(entry.effect).toBe(describeCountryTraitModifiersV2(entry.modifiers));
      expect(`${entry.countryName} ${entry.name} ${entry.effect} ${entry.description}`)
        .not.toMatch(dutchVisibleWords);
    }

    expect(countryTraitV2('usa')).toMatchObject({
      countryName: 'United States of America',
      name: 'Advanced Weapons Command',
      description: 'Couples advanced-weapons industry with precise expeditionary offense while Arctic megaprojects remain exceptionally expensive.',
    });
    expect(countryTraitV2('usa')?.modifiers.map(({ key }) => key)).toEqual([
      'research-progress', 'attack', 'operation-cost', 'arctic-research-cost',
    ]);
    expect(countryTraitModifiersV2('usa', 'research-progress')[0]?.scope)
      .toEqual({ researchBranches: ['advanced-weapons'] });
    expect(countryTraitV2('lka')?.effect).toBe(
      describeCountryTraitModifiersV2(countryTraitV2('lka')!.modifiers),
    );
    expect(countryTraitV2('vnm')?.description).toContain('rice-producing delta');
    expect(countryTraitV2('png')?.effect).toBe(
      describeCountryTraitModifiersV2(countryTraitV2('png')!.modifiers),
    );
  });

  it('uses one to three ordinary modifiers plus at most one Arctic auxiliary', () => {
    const declaredKeys = new Set<string>(TRAIT_MODIFIER_KEYS_V2);

    for (const entry of COUNTRY_TRAITS_V2) {
      const arcticModifiers = entry.modifiers
        .filter(({ key }) => key === 'arctic-research-cost');
      const ordinaryModifiers = entry.modifiers
        .filter(({ key }) => key !== 'arctic-research-cost');
      expect(ordinaryModifiers.length, entry.playerId).toBeGreaterThanOrEqual(1);
      expect(ordinaryModifiers.length, entry.playerId).toBeLessThanOrEqual(3);
      expect(arcticModifiers.length, entry.playerId).toBeLessThanOrEqual(1);
      expect(new Set(entry.modifiers.map(({ key }) => key)).size, entry.playerId)
        .toBe(entry.modifiers.length);
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.modifiers)).toBe(true);
      for (const modifier of entry.modifiers) {
        expect(declaredKeys.has(modifier.key)).toBe(true);
        expect(Object.isFrozen(modifier)).toBe(true);
        if (modifier.scope) expect(Object.isFrozen(modifier.scope)).toBe(true);
      }
    }
    expect(COUNTRY_TRAITS_V2
      .filter((entry) => entry.modifiers.some(({ key }) => key === 'arctic-research-cost'))
      .map(({ playerId }) => playerId)
      .sort()).toEqual(['can', 'fin', 'grl', 'isl', 'nor', 'rus', 'swe', 'usa']);
  });

  it('audits one material opening weakness for every single country identity', () => {
    for (const entry of COUNTRY_TRAITS_V2) {
      expect(countryTraitOpeningWeaknessV2(entry.playerId)).toBe(entry.openingWeakness);
      expect(entry.openingWeakness).toBe(
        traitOpeningWeaknessForModifierKeyV2(entry.modifiers[0]!.key),
      );
      expect(Math.abs(entry.modifiers[0]!.percentage), entry.countryName)
        .toBeGreaterThanOrEqual(entry.modifiers[0]!.key === 'national-iq' ? 0.5 : 2);
      expect(entry.description.trim().length, entry.countryName).toBeGreaterThan(20);
    }
  });

  it('keeps useful underdog identities while generic food filler is replaced', () => {
    const foodKeys = new Set<string>(FOOD_TRAIT_MODIFIER_KEYS_V2);
    for (const playerId of ['tls', 'btn', 'sur', 'mwi'] as const) {
      expect(countryTraitV2(playerId)?.modifiers
        .some(({ key }) => foodKeys.has(key)), playerId).toBe(false);
    }
    expect(countryTraitV2('tls')?.modifiers.map(({ key }) => key)).toEqual([
      'research-output', 'condition-recovery', 'defense',
    ]);
    expect(countryTraitV2('cri')?.modifiers.map(({ key }) => key)).toEqual([
      'development-economy-growth', 'research-output', 'recruitment-throughput',
    ]);
    expect(countryTraitV2('btn')?.modifiers.map(({ key }) => key)).toContain('reserve-training');
    expect(countryTraitV2('dji')?.modifiers.map(({ key }) => key)).toEqual([
      'operation-cost', 'naval-distance-pressure', 'tax-efficiency',
    ]);
    expect(countryTraitV2('guy')?.modifiers.map(({ key }) => key)).toEqual([
      'tax-efficiency', 'defense', 'development-economy-growth',
    ]);
    expect(countryTraitV2('mne')?.modifiers.map(({ key }) => key)).toEqual([
      'defense', 'military-casualties', 'operation-cost',
    ]);
    expect(countryTraitV2('sur')?.modifiers.map(({ key }) => key))
      .toContain('development-economy-growth');
    expect(countryTraitV2('isl')?.modifiers.map(({ key }) => key)).toEqual([
      'naval-distance-pressure', 'operation-cost', 'defense', 'arctic-research-cost',
    ]);

    for (const playerId of ['tls', 'cri', 'btn', 'dji', 'guy', 'mne', 'sur', 'isl'] as const) {
      expect(countryTraitModifiersV2(playerId, 'army-capacity'), playerId).toEqual([]);
    }

    // These capacity clauses are explicitly authored national identities.
    expect(countryTraitModifiersV2('swz', 'army-capacity')[0]?.percentage).toBeGreaterThan(0);
    expect(countryTraitModifiersV2('lux', 'army-capacity')[0]?.percentage).toBeGreaterThan(0);
    expect(countryTraitModifiersV2('lux', 'tax-efficiency')[0]?.percentage).toBeGreaterThan(0);
    expect(countryTraitModifiersV2('lux', 'development-economy-growth')[0]?.percentage)
      .toBeGreaterThan(0);
    expect(countryTraitModifiersV2('dji', 'naval-distance-pressure')[0]?.percentage).toBeLessThan(0);
    expect(countryTraitModifiersV2('mne', 'operation-cost')[0]?.percentage).toBeLessThan(0);
    expect(countryTraitModifiersV2('sur', 'military-casualties')[0]?.scope)
      .toEqual({ role: 'defender' });
    expect(countryTraitModifiersV2('brn', 'research-output')[0]?.percentage).toBeGreaterThan(0);
    expect(countryTraitModifiersV2('brn', 'army-upkeep')[0]?.percentage).toBeLessThan(0);
    expect(countryTraitModifiersV2('blz', 'military-casualties')[0]?.scope).toBeUndefined();

    for (const playerId of ['deu', 'jpn'] as const) {
      expect(countryTraitModifiersV2(playerId, 'national-iq')[0]?.percentage)
        .toBeGreaterThan(0);
      expect(countryTraitFactorV2(playerId, 'national-iq')).toBeLessThanOrEqual(1.02);
      expect(countryTraitFactorV2(playerId, 'national-iq', { humanControlled: true }))
        .toBeLessThanOrEqual(1.15);
    }
    expect(countryTraitModifiersV2('kor', 'research-progress')[0]?.scope)
      .toEqual({ researchBranches: ['advanced-weapons'] });

    const greenland = countryTraitV2('grl')!;
    expect(greenland.modifiers.map(({ key }) => key)).toEqual([
      'army-capacity', 'recruitment-throughput', 'research-progress',
      'arctic-research-cost',
    ]);
    expect(greenland.effect).toBe('+9% army capacity; +5% recruitment throughput; +4% research progress in population-recruitment; −50% Arctic research cost.');
    expect(describeCountryTraitModifiersV2(
      greenland.modifiers,
      HUMAN_TRAIT_MULTIPLIER_WEAKEST_V2,
    )).toBe('+27% army capacity; +15% recruitment throughput; +12% research progress in population-recruitment; −50% Arctic research cost.');
    expect(countryTraitModifiersV2('grl', 'army-capacity')[0]?.percentage).toBe(9);
    expect(countryTraitModifiersV2('grl', 'recruitment-throughput')[0]?.percentage).toBe(5);
    expect(countryTraitModifiersV2('grl', 'research-progress')[0]).toMatchObject({
      percentage: 4,
      scope: { researchBranches: ['population-recruitment'] },
    });
    expect(countryTraitModifiersV2('grl', 'army-upkeep')).toEqual([]);
    expect(countryTraitFactorV2('grl', 'army-capacity')).toBeCloseTo(1.09, 12);
    expect(countryTraitFactorV2('grl', 'recruitment-throughput')).toBeCloseTo(1.05, 12);
    expect(countryTraitFactorV2('grl', 'research-progress', {
      researchBranch: 'population-recruitment',
    })).toBeCloseTo(1.04, 12);
    expect(countryTraitFactorV2('grl', 'army-capacity', { humanControlled: true }))
      .toBeCloseTo(1.27, 12);
    expect(countryTraitFactorV2('grl', 'recruitment-throughput', { humanControlled: true }))
      .toBeCloseTo(1.15, 12);
    expect(countryTraitFactorV2('grl', 'research-progress', {
      humanControlled: true, researchBranch: 'population-recruitment',
    })).toBeCloseTo(1.12, 12);
    expect(countryTraitFactorV2('grl', 'research-progress', {
      humanControlled: true, researchBranch: 'economy-science',
    })).toBe(1);
    expect(countryTraitFactorV2('grl', 'arctic-research-cost')).toBe(0.5);
    expect(countryTraitFactorV2('grl', 'arctic-research-cost', { humanControlled: true }))
      .toBe(0.5);

    expect(countryTraitModifiersV2('bel', 'base-operating-cost')).toEqual([]);
    expect(BELGIUM_TRAIT_VALUE_MULTIPLIER_V2).toBe(1.08);
    expect(countryTraitModifiersV2('bel', 'tax-efficiency')).toEqual([]);
    expect(countryTraitModifiersV2('bel', 'army-capacity')[0]?.percentage).toBeGreaterThan(0);
    expect(countryTraitModifiersV2('bel', 'attack')[0]?.scope).toBeUndefined();
    expect(countryTraitModifiersV2('bel', 'defense')[0]?.scope).toBeUndefined();
    expect(countryTraitFactorV2('bel', 'army-capacity')).toBeGreaterThan(1);
    expect(countryTraitFactorV2('bel', 'attack', { terrain: 'plains' })).toBeGreaterThan(1);
    expect(countryTraitFactorV2('bel', 'defense', { terrain: 'urban' })).toBeGreaterThan(1);
    expect(countryTraitFactorV2('bel', 'army-capacity', { humanControlled: true }))
      .toBeGreaterThan(countryTraitFactorV2('bel', 'army-capacity'));
  });

  it('normalizes rank-aware AI trait budgets while reserving Greenland as explicit exception', () => {
    const scored = COUNTRY_TRAITS_V2.filter((entry) => entry.playerId !== 'grl')
      .map((entry) => ({ playerId: entry.playerId, score: countryTraitBaseValueScoreV2(entry) }));
    const highest = [...scored].sort((left, right) => right.score - left.score)[0]!;
    expect(highest.score, highest.playerId)
      .toBeLessThanOrEqual(BASE_COUNTRY_TRAIT_VALUE_BUDGET_V2 + 0.05);
    const topIds = OPENING_MILITARY_ORDER_V2.slice(0, 10);
    const bottomIds = OPENING_MILITARY_ORDER_V2.slice(-24)
      .filter((playerId) => playerId !== 'grl');
    const topScores = topIds.map((playerId) => (
      countryTraitBaseValueScoreV2(countryTraitV2(playerId)!)
    ));
    const bottomScores = bottomIds.map((playerId) => (
      countryTraitBaseValueScoreV2(countryTraitV2(playerId)!)
    ));
    const mean = (values: readonly number[]) => (
      values.reduce((sum, value) => sum + value, 0) / values.length
    );
    expect(Math.max(...topScores)).toBeLessThanOrEqual(
      TOP_POWER_COUNTRY_TRAIT_VALUE_BUDGET_V2 + 1,
    );
    expect(Math.min(...bottomScores)).toBeGreaterThanOrEqual(24);
    expect(mean(bottomScores) / mean(topScores)).toBeGreaterThanOrEqual(2.2);

    const attackPercent = Math.abs(countryTraitModifiersV2('col', 'attack')[0]!.percentage);
    const foodPercent = Math.abs(countryTraitModifiersV2('arg', 'food-production')[0]!.percentage);
    expect(attackPercent).toBeGreaterThan(0);
    expect(foodPercent).toBeGreaterThan(0);
  });

  it('amplifies the same signed modifier smoothly for human seats by immutable opening rank', () => {
    expect(OPENING_MILITARY_ORDER_V2).toHaveLength(166);
    expect(new Set(OPENING_MILITARY_ORDER_V2).size).toBe(166);
    expect([...OPENING_MILITARY_ORDER_V2].sort()).toEqual(
      WORLD_CONTENT_V2.nationIds.map(String).sort(),
    );
    expect(openingMilitaryRankV2('usa')).toBe(1);
    expect(openingMilitaryRankV2('grl')).toBe(166);
    expect(humanCountryTraitMultiplierV2('usa')).toBeCloseTo(HUMAN_TRAIT_MULTIPLIER_STRONGEST_V2, 12);
    expect(humanCountryTraitMultiplierV2('grl')).toBeCloseTo(HUMAN_TRAIT_MULTIPLIER_WEAKEST_V2, 12);

    const multipliers = OPENING_MILITARY_ORDER_V2.map(humanCountryTraitMultiplierV2);
    for (let index = 1; index < multipliers.length; index += 1) {
      expect(multipliers[index]).toBeGreaterThanOrEqual(multipliers[index - 1]!);
    }

    const usaOperation = countryTraitModifiersV2('usa', 'operation-cost')[0]!.percentage / 100;
    const greenlandCapacity = countryTraitModifiersV2('grl', 'army-capacity')[0]!.percentage / 100;
    expect(countryTraitFactorV2('usa', 'operation-cost', {
      access: 'naval', humanControlled: true,
    })).toBeCloseTo(1 + usaOperation * HUMAN_TRAIT_MULTIPLIER_STRONGEST_V2, 12);
    expect(countryTraitFactorV2('grl', 'army-capacity', {
      humanControlled: true,
    })).toBeCloseTo(1 + greenlandCapacity * HUMAN_TRAIT_MULTIPLIER_WEAKEST_V2, 12);
    expect(countryTraitFactorV2('grl', 'army-capacity', {
      humanControlled: true,
    })).toBeGreaterThan(countryTraitFactorV2('grl', 'army-capacity'));
    expect(countryTraitFactorV2('grl', 'recruitment-throughput', { humanControlled: true }))
      .toBeGreaterThan(1);
    expect(countryTraitFactorV2('grl', 'research-progress', {
      humanControlled: true, researchBranch: 'population-recruitment',
    })).toBeCloseTo(1.12, 12);
    expect(countryTraitFactorV2('grl', 'army-upkeep', { humanControlled: true })).toBe(1);
    expect(countryTraitV2('grl')).toBe(countryTraitV2('grl'));
  });

  it('keeps food traits exceptional, meaningful and limited to the exact allowlist', () => {
    const foodKeys = new Set<string>(FOOD_TRAIT_MODIFIER_KEYS_V2);
    const foodCountries = COUNTRY_TRAITS_V2
      .filter((entry) => entry.modifiers.some(({ key }) => foodKeys.has(key)))
      .map(({ playerId }) => playerId)
      .sort();
    expect(foodCountries).toEqual([...FOOD_TRAIT_ALLOWLIST_V2].sort());
    expect(foodCountries.length / COUNTRY_TRAITS_V2.length).toBeLessThan(0.10);
    for (const playerId of FOOD_TRAIT_ALLOWLIST_V2) {
      const modifiers = countryTraitV2(playerId)!.modifiers;
      const foodModifiers = modifiers.filter(({ key }) => foodKeys.has(key));
      expect(foodModifiers, playerId).toHaveLength(1);
      // Thailand deliberately bundles food as a secondary bonus beside broad
      // offensive combat value, so its fixed-budget food share remains smaller.
      const minimumFoodPercentage = playerId === 'tha' ? 4 : 12;
      expect(Math.abs(foodModifiers[0]!.percentage), playerId)
        .toBeGreaterThanOrEqual(minimumFoodPercentage);
      expect(modifiers.some(({ key }) => !foodKeys.has(key)), playerId).toBe(true);
    }
    expect(COUNTRY_TRAITS_V2.every(({ description }) => (
      !description.includes('converts national strengths')
    ))).toBe(true);
  });

  it('gives each top power a distinct scoped identity without flattening underdog budgets', () => {
    const expected = [
      ['usa', 'Advanced Weapons Command'],
      ['chn', 'Integrated War Economy'],
      ['rus', 'Deep Mobilization Front'],
      ['ind', 'Strategic Mass'],
      ['kor', 'Rapid Arsenal Cycle'],
      ['fra', 'Autonomous Deterrent'],
      ['jpn', 'Precision Shield'],
      ['gbr', 'Global Intelligence Network'],
      ['tur', 'Straits Command'],
      ['ita', 'Mediterranean Operational Depth'],
    ] as const;
    expect(OPENING_MILITARY_ORDER_V2.slice(0, 10)).toEqual(
      expected.map(([playerId]) => playerId),
    );
    for (const [playerId, name] of expected) {
      expect(countryTraitV2(playerId)?.name).toBe(name);
    }
    expect(countryTraitModifiersV2('gbr', 'naval-distance-pressure')).toHaveLength(1);
    expect(countryTraitModifiersV2('gbr', 'operation-cost')).toEqual([]);
    expect(countryTraitModifiersV2('gbr', 'front-supply')).toEqual([]);
    expect(countryTraitModifiersV2('gbr', 'research-catch-up-bonus')).toHaveLength(1);
    expect(countryTraitModifiersV2('gbr', 'war-fatigue-recovery')).toHaveLength(1);
  });

  it('keeps the immutable human-scaling order equal to the pure opening military ranking', () => {
    const state = createWorldStateV2(2026);
    const liveOpening = selectGlobalRankingV2(state, WORLD_CONTENT_V2)
      .map((entry) => entry.player.id);
    expect(liveOpening.slice(0, 20)).toEqual(OPENING_MILITARY_ORDER_V2.slice(0, 20));
    expect(liveOpening.indexOf('deu')).toBe(11);
  });

  it('encodes finite factors, authored DEF and terrain scopes while filtering homeland', () => {
    for (const entry of COUNTRY_TRAITS_V2) {
      for (const modifier of entry.modifiers) {
        const bounds = traitFactorBoundsV2(modifier.key);
        expect(Number.isFinite(modifier.percentage)).toBe(true);
        expect(Number.isFinite(modifier.factor)).toBe(true);
        expect(modifier.factor).toBeCloseTo(1 + modifier.percentage / 100, 12);
        expect(modifier.factor).toBeGreaterThanOrEqual(bounds.minimum);
        expect(modifier.factor).toBeLessThanOrEqual(bounds.maximum);
      }
    }

    expect(COUNTRY_TRAITS_V2.every((entry) => (
      entry.modifiers.every((modifierEntry) => modifierEntry.key !== 'starting-treasury')
    ))).toBe(true);
    const modifiers = COUNTRY_TRAITS_V2.flatMap((entry) => entry.modifiers);
    expect(modifiers.filter(({ key }) => key === 'defense')).toHaveLength(68);
    expect(modifiers.filter(({ scope }) => scope?.terrain !== undefined).length)
      .toBeGreaterThanOrEqual(63);
    expect(modifiers.every(({ scope }) => scope?.homeland === undefined)).toBe(true);
    expect(COUNTRY_TRAITS_V2.every(({ effect }) => !effect.includes('original homeland territory')))
      .toBe(true);
    expect(countryTraitFactorV2('isl', 'naval-distance-pressure', { access: 'naval' })).toBeLessThan(1);
    expect(countryTraitFactorV2('arm', 'military-casualties', {
      role: 'defender', terrain: 'mountain', homeland: true,
    })).toBeLessThan(1);
  });

  it('evaluates war, role, access and terrain while homeland does not restrict a trait', () => {
    expect(countryTraitFactorV2('usa', 'operation-cost', { access: 'naval' })).toBeLessThan(1);
    expect(countryTraitFactorV2('usa', 'operation-cost', { access: 'land' })).toBe(1);

    const mountainDefense = { role: 'defender', terrain: 'mountain', homeland: true } as const;
    const afghanDefense = countryTraitFactorV2('afg', 'defense', mountainDefense);
    expect(afghanDefense).toBeGreaterThan(1);
    expect(countryTraitModifiersV2('afg', 'defense')[0]?.scope)
      .toEqual({ role: 'defender', terrain: 'mountain' });
    expect(countryTraitFactorV2('afg', 'defense', {
      ...mountainDefense, homeland: false,
    })).toBeCloseTo(afghanDefense, 12);
    expect(countryTraitFactorV2('afg', 'defense', {
      ...mountainDefense, terrain: 'plains',
    })).toBe(1);
    expect(countryTraitFactorV2('afg', 'defense', {
      ...mountainDefense, role: 'attacker',
    })).toBe(1);
    expect(countryTraitModifiersV2('afg', 'reserve-deployment-throughput')).toEqual([]);

    expect(countryTraitFactorV2('cyp', 'military-casualties', {
      role: 'attacker', access: 'naval',
    })).toBeLessThan(1);
    expect(countryTraitFactorV2('cyp', 'military-casualties', {
      role: 'defender', access: 'naval',
    })).toBe(1);

    expect(WORLD_CONTENT_V2.territories.png?.terrain).toBe('jungle');
    expect(WORLD_CONTENT_V2.territories.png?.terrainProfile
      ?.some((entry) => entry.terrain === 'coastal')).toBe(true);
    const papuaDefense = countryTraitFactorV2('png', 'defense', {
      role: 'defender', terrain: 'coastal', homeland: true,
    });
    expect(papuaDefense).toBeGreaterThan(1);
    expect(countryTraitFactorV2('png', 'defense', {
      role: 'defender', terrain: 'coastal', homeland: false,
    })).toBeCloseTo(papuaDefense, 12);
    expect(countryTraitFactorV2('png', 'defense', {
      role: 'defender', terrain: 'jungle', homeland: true,
    })).toBe(1);
    expect(countryTraitModifiersV2('png', 'army-capacity')).toEqual([]);

    expect(countryTraitFactorV2('cri', 'research-output', { atWar: false })).toBeGreaterThan(1);
    expect(countryTraitFactorV2('cri', 'research-output', { atWar: true })).toBe(1);
    expect(countryTraitFactorV2('cri', 'recruitment-throughput', { atWar: true })).toBeGreaterThan(1);
  });

  it('evaluates food, treasury, condition, first-conquest and front composition conditions', () => {
    expect(countryTraitFactorV2('hti', 'defense', { foodSecurity: 0.799 })).toBeGreaterThan(1);
    expect(countryTraitFactorV2('hti', 'defense', { foodSecurity: 0.8 })).toBe(1);
    expect(countryTraitFactorV2('hti', 'military-casualties', {
      foodSecurity: 0.799, role: 'defender',
    })).toBeLessThan(1);
    expect(countryTraitFactorV2('hti', 'military-casualties', {
      foodSecurity: 0.8, role: 'defender',
    })).toBe(1);

    expect(countryTraitFactorV2('brn', 'research-output', { treasury: 0 })).toBeGreaterThan(1);
    expect(countryTraitFactorV2('brn', 'research-output', { treasury: -0.001 })).toBe(1);

    expect(countryTraitFactorV2('sdn', 'condition-recovery', { condition: 0.799 })).toBeGreaterThan(1);
    expect(countryTraitFactorV2('sdn', 'condition-recovery', { condition: 0.8 })).toBe(1);

    expect(countryTraitFactorV2('blz', 'integration-duration', { firstConquest: true })).toBeLessThan(1);
    expect(countryTraitFactorV2('blz', 'integration-duration', { firstConquest: false })).toBe(1);

    expect(countryTraitFactorV2('cmr', 'operation-cost', { bothFronts: true })).toBeLessThan(1);
    expect(countryTraitFactorV2('cmr', 'operation-cost', { bothFronts: false })).toBe(1);
    expect(countryTraitFactorV2('pan', 'tax-efficiency', { hasLandFront: false })).toBeGreaterThan(1);
    expect(countryTraitFactorV2('pan', 'tax-efficiency', { hasLandFront: true })).toBe(1);
  });

  it('selects branch-specific research and represents fixed treasury seizure replacement', () => {
    expect(countryTraitFactorV2('fra', 'research-progress', {
      researchBranch: 'advanced-weapons',
    })).toBeGreaterThan(1);
    expect(countryTraitFactorV2('fra', 'research-progress', {
      researchBranch: 'economy-science',
    })).toBe(1);

    expect(countryTraitModifiersV2('che', 'treasury-seizure')).toEqual([]);
    expect(countryTraitFactorV2('che', 'reserve-training')).toBeGreaterThan(1);
    expect(countryTraitFactorV2('che', 'reserve-training', { humanControlled: true }))
      .toBeGreaterThan(countryTraitFactorV2('che', 'reserve-training'));
  });

  it('looks up only the active nation id and never stacks absorbed country traits', () => {
    // Germany has no naval-operation modifier. France and Portugal do, but the
    // API deliberately accepts no absorbed/core-owner id list to inherit them.
    expect(countryTraitFactorV2('deu', 'operation-cost', { access: 'naval' })).toBe(1);
    expect(countryTraitFactorV2('fra', 'operation-cost', { access: 'naval' })).toBeLessThan(1);
    expect(countryTraitFactorV2('prt', 'operation-cost', { access: 'naval' })).toBeLessThan(1);
    expect(countryTraitV2('not-a-country')).toBeUndefined();
  });

  it('keeps every evaluated factor valid across representative derived contexts', () => {
    const contexts: readonly TraitEvaluationContextV2[] = [
      {},
      { atWar: false, foodSecurity: 1, treasury: 1, condition: 1, firstConquest: false, bothFronts: false, hasLandFront: false },
      { atWar: true, role: 'attacker', access: 'land', terrain: 'desert', homeland: false, foodSecurity: 0.7, treasury: -1, condition: 0.7, firstConquest: true, bothFronts: true, hasLandFront: true, researchBranch: 'advanced-weapons' },
      { atWar: true, role: 'defender', access: 'naval', terrain: 'jungle', homeland: true, foodSecurity: 0.9, treasury: 0, condition: 0.79, firstConquest: true, bothFronts: true, hasLandFront: true, researchBranch: 'defensive-systems' },
      { atWar: false, role: 'defender', access: 'land', terrain: 'mountain', homeland: true, foodSecurity: 0.96, treasury: 0, condition: 0.5, firstConquest: false, bothFronts: false, hasLandFront: false, researchBranch: 'economy-science' },
      { atWar: true, role: 'defender', access: 'naval', terrain: 'arctic', homeland: true, foodSecurity: 0.79, treasury: 10, condition: 0.9, firstConquest: false, bothFronts: false, hasLandFront: false, researchBranch: 'logistics-medicine' },
    ];

    for (const entry of COUNTRY_TRAITS_V2) {
      for (const key of TRAIT_MODIFIER_KEYS_V2 as readonly TraitModifierKeyV2[]) {
        const bounds = traitFactorBoundsV2(key);
        for (const context of contexts) {
          const factor = countryTraitFactorV2(entry.playerId, key, context);
          expect(Number.isFinite(factor)).toBe(true);
          expect(factor).toBeGreaterThanOrEqual(bounds.minimum);
          expect(factor).toBeLessThanOrEqual(bounds.maximum);
        }
      }
    }
  }, 10_000);

  it('treats missing required context as non-applicable', () => {
    const branchModifier = countryTraitModifiersV2('fra', 'research-progress')[0];
    const unconditionalModifier = countryTraitModifiersV2('lux', 'tax-efficiency')[0];
    expect(branchModifier && traitModifierAppliesV2(branchModifier, {})).toBe(false);
    expect(unconditionalModifier && traitModifierAppliesV2(unconditionalModifier, {})).toBe(true);
  });
});
