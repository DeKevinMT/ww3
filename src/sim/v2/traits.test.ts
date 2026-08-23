import { describe, expect, it } from 'vitest';
import { WORLD_CONTENT_V2 } from './content';
import {
  COUNTRY_TRAITS_V2,
  TRAIT_MODIFIER_KEYS_V2,
  countryTraitEffectSignatureV2,
  countryTraitFactorV2,
  countryTraitModifiersV2,
  countryTraitV2,
  traitFactorBoundsV2,
  traitModifierAppliesV2,
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

  it('keeps Dutch names, effect wording and order-independent mechanics unique', () => {
    const names = COUNTRY_TRAITS_V2.map((entry) => entry.name);
    const effects = COUNTRY_TRAITS_V2.map((entry) => entry.effect);
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
    expect(new Set(effects).size).toBe(166);
    expect(duplicateMechanics).toEqual([]);

    expect(countryTraitV2('usa')).toMatchObject({
      countryName: 'Verenigde Staten',
      name: 'Wereldwijde Projectie',
      effect: '−6% wekelijkse operatiekosten en +4% supply voor oorlogen met naval access.',
      description: 'Kleine, wereldwijde specialisatie voor het sterkste startland.',
    });
    expect(countryTraitV2('lka')?.effect).toBe(
      '+8% naval-front supply; +6% food storage capacity; +3,5% research progress in economy-science.',
    );
    expect(countryTraitV2('vnm')?.description).toBe(
      'Maakt invasies duur zonder Vietnams sterke start verder offensief te buffen.',
    );
    expect(countryTraitV2('png')?.effect).toBe(
      '+30% DEF en −20% military casualties bij verdediging van coastal homeland; +30% food production.',
    );
  });

  it('uses one to three immutable modifiers and only declared V2 result channels', () => {
    const declaredKeys = new Set<string>(TRAIT_MODIFIER_KEYS_V2);
    const modifiers = COUNTRY_TRAITS_V2.flatMap((entry) => entry.modifiers);

    expect(modifiers).toHaveLength(482);
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

    expect(countryTraitFactorV2('lux', 'starting-treasury')).toBeCloseTo(1.75);
    expect(countryTraitFactorV2('isl', 'naval-distance-pressure', { access: 'naval' })).toBeCloseTo(0.55);
    expect(countryTraitFactorV2('arm', 'military-casualties', {
      role: 'defender', terrain: 'mountain', homeland: true,
    })).toBeCloseTo(0.8);
  });

  it('evaluates war, role, access, terrain and homeland conditions', () => {
    expect(countryTraitFactorV2('usa', 'operation-cost', { access: 'naval' })).toBeCloseTo(0.94);
    expect(countryTraitFactorV2('usa', 'operation-cost', { access: 'land' })).toBe(1);

    const mountainDefense = { role: 'defender', terrain: 'mountain', homeland: true } as const;
    expect(countryTraitFactorV2('afg', 'defense', mountainDefense)).toBeCloseTo(1.24);
    expect(countryTraitFactorV2('afg', 'defense', { ...mountainDefense, homeland: false })).toBe(1);
    expect(countryTraitFactorV2('afg', 'defense', { ...mountainDefense, role: 'attacker' })).toBe(1);

    expect(countryTraitFactorV2('cyp', 'military-casualties', {
      role: 'attacker', access: 'naval',
    })).toBeCloseTo(0.82);
    expect(countryTraitFactorV2('cyp', 'military-casualties', {
      role: 'defender', access: 'naval',
    })).toBe(1);

    expect(WORLD_CONTENT_V2.territories.png?.terrain).toBe('coastal');
    expect(countryTraitFactorV2('png', 'defense', {
      role: 'defender', terrain: 'coastal', homeland: true,
    })).toBeCloseTo(1.3);
    expect(countryTraitFactorV2('png', 'defense', {
      role: 'defender', terrain: 'coastal', homeland: false,
    })).toBe(1);

    expect(countryTraitFactorV2('cri', 'research-output', { atWar: false })).toBeCloseTo(1.3);
    expect(countryTraitFactorV2('cri', 'research-output', { atWar: true })).toBe(1);
    expect(countryTraitFactorV2('cri', 'recruitment-throughput', { atWar: true })).toBeCloseTo(1.3);
  });

  it('evaluates food, treasury, condition, first-conquest and front composition conditions', () => {
    expect(countryTraitFactorV2('hti', 'defense', { foodSecurity: 0.799 })).toBeCloseTo(1.3);
    expect(countryTraitFactorV2('hti', 'defense', { foodSecurity: 0.8 })).toBe(1);

    expect(countryTraitFactorV2('brn', 'research-output', { treasury: 0 })).toBeCloseTo(1.21);
    expect(countryTraitFactorV2('brn', 'research-output', { treasury: -0.001 })).toBe(1);

    expect(countryTraitFactorV2('sdn', 'condition-recovery', { condition: 0.799 })).toBeCloseTo(1.3);
    expect(countryTraitFactorV2('sdn', 'condition-recovery', { condition: 0.8 })).toBe(1);

    expect(countryTraitFactorV2('blz', 'integration-duration', { firstConquest: true })).toBeCloseTo(0.7);
    expect(countryTraitFactorV2('blz', 'integration-duration', { firstConquest: false })).toBe(1);

    expect(countryTraitFactorV2('cmr', 'operation-cost', { bothFronts: true })).toBeCloseTo(0.85);
    expect(countryTraitFactorV2('cmr', 'operation-cost', { bothFronts: false })).toBe(1);
    expect(countryTraitFactorV2('pan', 'tax-efficiency', { hasLandFront: false })).toBeCloseTo(1.3);
    expect(countryTraitFactorV2('pan', 'tax-efficiency', { hasLandFront: true })).toBe(1);
  });

  it('selects branch-specific research and represents fixed treasury seizure replacement', () => {
    expect(countryTraitFactorV2('deu', 'research-progress', {
      researchBranch: 'military-industry',
    })).toBeCloseTo(1.04);
    expect(countryTraitFactorV2('deu', 'research-progress', {
      researchBranch: 'economy-science',
    })).toBeCloseTo(1.04);
    expect(countryTraitFactorV2('deu', 'research-progress', {
      researchBranch: 'advanced-weapons',
    })).toBe(1);

    const seizure = countryTraitModifiersV2('che', 'treasury-seizure')[0];
    expect(seizure?.factor).toBeCloseTo(0.4);
    expect(seizure?.replacement).toEqual({ from: 0.25, to: 0.10, unit: 'share' });
    expect(Object.isFrozen(seizure?.replacement)).toBe(true);
  });

  it('looks up only the active nation id and never stacks absorbed country traits', () => {
    // Germany has no naval-operation modifier. France and Portugal do, but the
    // API deliberately accepts no absorbed/core-owner id list to inherit them.
    expect(countryTraitFactorV2('deu', 'operation-cost', { access: 'naval' })).toBe(1);
    expect(countryTraitFactorV2('fra', 'operation-cost', { access: 'naval' })).toBeCloseTo(0.96);
    expect(countryTraitFactorV2('prt', 'operation-cost', { access: 'naval' })).toBeCloseTo(0.85);
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
    const branchModifier = countryTraitModifiersV2('deu', 'research-progress')[0];
    const unconditionalModifier = countryTraitModifiersV2('lux', 'starting-treasury')[0];
    expect(branchModifier && traitModifierAppliesV2(branchModifier, {})).toBe(false);
    expect(unconditionalModifier && traitModifierAppliesV2(unconditionalModifier, {})).toBe(true);
  });
});
