import { describe, expect, it } from 'vitest';
import { WORLD_CONTENT_V2 } from './content';
import { createWorldStateV2 } from './bootstrap';
import { selectGlobalRankingV2 } from './selectors';
import {
  ABSOLUTE_UNDERDOG_ARMY_CAP_COUNT_V2,
  BASE_COUNTRY_TRAIT_VALUE_BUDGET_V2,
  MICROSTATE_GROWTH_KEYS_V2,
  COUNTRY_TRAITS_V2,
  HUMAN_TRAIT_MULTIPLIER_STRONGEST_V2,
  HUMAN_TRAIT_MULTIPLIER_WEAKEST_V2,
  OPENING_MILITARY_ORDER_V2,
  TRAIT_MODIFIER_KEYS_V2,
  countryTraitEffectSignatureV2,
  countryTraitBaseValueScoreV2,
  countryTraitFactorV2,
  countryTraitModifiersV2,
  countryTraitOpeningWeaknessV2,
  countryTraitReplacementValueV2,
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

  it('keeps English names, exact generated effects and order-independent mechanics unique', () => {
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

    expect(new Set(names).size).toBe(166);
    expect(duplicateEffects).toEqual([]);
    expect(duplicateMechanics).toEqual([]);

    const dutchVisibleWords = /\b(?:wanneer|zolang|eigen|verdediging|leger|legercapaciteit|buiten|oorlog|vrede|zwakste|kleine|sterke|voedsel|herstel|voorraad|kosten|aanvoer|verovering)\b/i;
    for (const entry of COUNTRY_TRAITS_V2) {
      expect(entry.countryName).toBe(WORLD_CONTENT_V2.nations[entry.playerId]?.name);
      expect(entry.effect).toBe(describeCountryTraitModifiersV2(entry.modifiers));
      expect(`${entry.countryName} ${entry.name} ${entry.effect} ${entry.description}`)
        .not.toMatch(dutchVisibleWords);
    }

    expect(countryTraitV2('usa')).toMatchObject({
      countryName: 'United States of America',
      name: 'Global Projection',
      effect: '−16.81% operation cost on naval fronts; +11.21% front supply on naval fronts.',
      description: 'Offsets the cost and supply burden of projecting the strongest opening military across oceans.',
    });
    expect(countryTraitV2('lka')?.effect).toBe(
      describeCountryTraitModifiersV2(countryTraitV2('lka')!.modifiers),
    );
    expect(countryTraitV2('vnm')?.description).toBe(
      'Offsets invasion risk without further increasing an already strong offensive start.',
    );
    expect(countryTraitV2('png')?.effect).toBe(
      describeCountryTraitModifiersV2(countryTraitV2('png')!.modifiers),
    );
  });

  it('uses one to three immutable modifiers and only declared V2 result channels', () => {
    const declaredKeys = new Set<string>(TRAIT_MODIFIER_KEYS_V2);
    const modifiers = COUNTRY_TRAITS_V2.flatMap((entry) => entry.modifiers);

    expect(modifiers).toHaveLength(483);
    for (const entry of COUNTRY_TRAITS_V2) {
      expect(entry.modifiers.length).toBeGreaterThanOrEqual(1);
      expect(entry.modifiers.length).toBeLessThanOrEqual(3);
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.modifiers)).toBe(true);
      for (const modifier of entry.modifiers) {
        expect(declaredKeys.has(modifier.key)).toBe(true);
        expect(Object.isFrozen(modifier)).toBe(true);
        if (modifier.scope) expect(Object.isFrozen(modifier.scope)).toBe(true);
      }
    }
  });

  it('audits one material opening weakness for every single country identity', () => {
    for (const entry of COUNTRY_TRAITS_V2) {
      expect(countryTraitOpeningWeaknessV2(entry.playerId)).toBe(entry.openingWeakness);
      expect(entry.openingWeakness).toBe(
        traitOpeningWeaknessForModifierKeyV2(entry.modifiers[0]!.key),
      );
      expect(Math.abs(entry.modifiers[0]!.percentage), entry.countryName)
        .toBeGreaterThanOrEqual(entry.modifiers[0]!.key === 'national-iq' ? 0.5 : 2);
      expect(entry.description).toMatch(/^(?:Addresses|Gives|Makes|Offsets|Transforms|Turns)\b/);
    }
  });

  it('keeps bottom-tail base identities bounded while player control supplies the large advantage', () => {
    expect(countryTraitModifiersV2('tls', 'army-capacity')[0]?.percentage).toBeGreaterThan(0);
    expect(countryTraitModifiersV2('swz', 'army-capacity')[0]?.percentage).toBeGreaterThan(0);
    expect(countryTraitModifiersV2('lux', 'tax-efficiency')[0]?.percentage).toBeGreaterThan(0);
    expect(countryTraitModifiersV2('lux', 'development-economy-growth')[0]?.percentage).toBeGreaterThan(0);
    expect(countryTraitModifiersV2('dji', 'naval-distance-pressure')[0]?.percentage).toBeLessThan(0);
    expect(countryTraitModifiersV2('guy', 'army-capacity')[0]?.percentage).toBeGreaterThan(0);
    expect(countryTraitModifiersV2('lux', 'army-capacity')[0]?.percentage).toBeGreaterThan(0);
    expect(countryTraitModifiersV2('btn', 'army-capacity')[0]?.percentage).toBeGreaterThan(0);
    expect(countryTraitModifiersV2('mne', 'operation-cost')).toHaveLength(0);
    expect(countryTraitModifiersV2('mne', 'army-capacity')[0]?.percentage).toBeGreaterThan(0);
    expect(countryTraitModifiersV2('sur', 'army-capacity')[0]?.percentage).toBeGreaterThan(0);
    expect(countryTraitModifiersV2('sur', 'military-casualties')[0]?.scope)
      .toEqual({ role: 'defender' });
    expect(countryTraitModifiersV2('brn', 'research-output')[0]?.percentage).toBeGreaterThan(0);
    expect(countryTraitModifiersV2('brn', 'army-upkeep')[0]?.percentage).toBeLessThan(0);
    expect(countryTraitModifiersV2('isl', 'army-capacity')[0]?.percentage).toBeGreaterThan(0);
    expect(countryTraitModifiersV2('blz', 'military-casualties')[0]?.scope).toBeUndefined();

    for (const playerId of ['deu', 'jpn', 'kor'] as const) {
      expect(countryTraitModifiersV2(playerId, 'national-iq')[0]?.percentage)
        .toBeGreaterThan(0);
      expect(countryTraitFactorV2(playerId, 'national-iq')).toBeLessThanOrEqual(1.02);
      expect(countryTraitFactorV2(playerId, 'national-iq', { humanControlled: true }))
        .toBeLessThanOrEqual(1.15);
    }

    const greenland = countryTraitV2('grl')!;
    expect(greenland.modifiers.map(({ key }) => key)).toEqual([
      'army-capacity', 'recruitment-throughput', 'army-upkeep',
    ]);
    expect(countryTraitFactorV2('grl', 'army-capacity')).toBeLessThanOrEqual(1.3);
    expect(countryTraitFactorV2('grl', 'army-capacity', { humanControlled: true }))
      .toBeGreaterThan(2);
    expect(countryTraitFactorV2('grl', 'recruitment-throughput', { humanControlled: true }))
      .toBeGreaterThan(countryTraitFactorV2('grl', 'recruitment-throughput'));
    expect(countryTraitFactorV2('grl', 'army-upkeep', { humanControlled: true }))
      .toBeLessThan(countryTraitFactorV2('grl', 'army-upkeep'));
  });

  it('gives every absolute military underdog a structural army-capacity path', () => {
    const underdogs = OPENING_MILITARY_ORDER_V2.slice(-ABSOLUTE_UNDERDOG_ARMY_CAP_COUNT_V2);
    expect(underdogs).toHaveLength(24);
    for (const playerId of underdogs) {
      expect(
        countryTraitModifiersV2(playerId, 'army-capacity')[0]?.percentage,
        String(playerId),
      ).toBeGreaterThan(0);
    }
  });

  it('normalizes every AI base trait with value-aware weights', () => {
    const greenland = countryTraitV2('grl')!;
    const scored = COUNTRY_TRAITS_V2.filter((entry) => entry.playerId !== 'grl')
      .map((entry) => ({ playerId: entry.playerId, score: countryTraitBaseValueScoreV2(entry) }));
    const highest = [...scored].sort((left, right) => right.score - left.score)[0]!;
    const lowest = [...scored].sort((left, right) => left.score - right.score)[0]!;
    expect(highest.score, highest.playerId)
      .toBeLessThanOrEqual(BASE_COUNTRY_TRAIT_VALUE_BUDGET_V2 + 0.05);
    expect(lowest.score, lowest.playerId)
      .toBeGreaterThanOrEqual(BASE_COUNTRY_TRAIT_VALUE_BUDGET_V2 - 2);
    expect(countryTraitBaseValueScoreV2(greenland)).toBeLessThan(lowest.score);

    for (const entry of COUNTRY_TRAITS_V2.filter((traitEntry) => (
      WORLD_CONTENT_V2.nations[traitEntry.playerId]!.real.population < 3
    ))) {
      expect(entry.modifiers.some((modifierEntry) => (
        MICROSTATE_GROWTH_KEYS_V2.has(modifierEntry.key)
      )), entry.countryName).toBe(true);
    }

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
    expect(countryTraitFactorV2('grl', 'army-upkeep', { humanControlled: true }))
      .toBeLessThan(1);
    expect(countryTraitV2('grl')).toBe(countryTraitV2('grl'));
  });

  it('keeps the immutable human-scaling order equal to the pure opening military ranking', () => {
    const state = createWorldStateV2(2026);
    const liveOpening = selectGlobalRankingV2(state, WORLD_CONTENT_V2)
      .map((entry) => entry.player.id);
    expect(liveOpening.slice(0, 20)).toEqual(OPENING_MILITARY_ORDER_V2.slice(0, 20));
    expect(liveOpening.indexOf('deu')).toBe(11);
  });

  it('encodes finite numeric factors inside their channel caps', () => {
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
    expect(COUNTRY_TRAITS_V2.every((entry) => (
      entry.modifiers.every((modifierEntry) => modifierEntry.key !== 'defense')
    ))).toBe(true);
    expect(countryTraitFactorV2('isl', 'naval-distance-pressure', { access: 'naval' })).toBeLessThan(1);
    expect(countryTraitFactorV2('arm', 'military-casualties', {
      role: 'defender', terrain: 'mountain', homeland: true,
    })).toBeLessThan(1);
  });

  it('evaluates war, role and access conditions without terrain, homeland or flat DEF traits', () => {
    expect(countryTraitFactorV2('usa', 'operation-cost', { access: 'naval' })).toBeLessThan(1);
    expect(countryTraitFactorV2('usa', 'operation-cost', { access: 'land' })).toBe(1);

    const mountainDefense = { role: 'defender', terrain: 'mountain', homeland: true } as const;
    expect(countryTraitFactorV2('afg', 'defense', mountainDefense)).toBe(1);
    expect(countryTraitModifiersV2('afg', 'reserve-deployment-throughput')[0]?.percentage)
      .toBeGreaterThan(0);

    expect(countryTraitFactorV2('cyp', 'military-casualties', {
      role: 'attacker', access: 'naval',
    })).toBeLessThan(1);
    expect(countryTraitFactorV2('cyp', 'military-casualties', {
      role: 'defender', access: 'naval',
    })).toBe(1);

    expect(WORLD_CONTENT_V2.territories.png?.terrain).toBe('coastal');
    expect(countryTraitFactorV2('png', 'defense', {
      role: 'defender', terrain: 'coastal', homeland: true,
    })).toBe(1);
    expect(countryTraitModifiersV2('png', 'army-capacity')[0]?.percentage).toBeGreaterThan(0);

    expect(countryTraitFactorV2('cri', 'research-output', { atWar: false })).toBeGreaterThan(1);
    expect(countryTraitFactorV2('cri', 'research-output', { atWar: true })).toBe(1);
    expect(countryTraitFactorV2('cri', 'recruitment-throughput', { atWar: true })).toBeGreaterThan(1);
  });

  it('evaluates food, treasury, condition, first-conquest and front composition conditions', () => {
    expect(countryTraitFactorV2('hti', 'defense', { foodSecurity: 0.799 })).toBe(1);
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

    const seizure = countryTraitModifiersV2('che', 'treasury-seizure')[0];
    expect(seizure?.factor).toBeCloseTo(0.4);
    expect(seizure?.replacement).toEqual({ from: 0.25, to: 0.10, unit: 'share' });
    expect(Object.isFrozen(seizure?.replacement)).toBe(true);
    expect(seizure && countryTraitReplacementValueV2('che', seizure)).toBeCloseTo(0.10);
    expect(seizure && countryTraitReplacementValueV2('che', seizure, {
      humanControlled: true,
    })).toBeLessThan(0.10);
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
