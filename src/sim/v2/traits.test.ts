import { describe, expect, it } from 'vitest';
import { WORLD_CONTENT_V2 } from './content';
import { createWorldStateV2 } from './bootstrap';
import { selectGlobalRankingV2 } from './selectors';
import {
  COUNTRY_TRAITS_V2,
  HUMAN_TRAIT_MULTIPLIER_STRONGEST_V2,
  HUMAN_TRAIT_MULTIPLIER_WEAKEST_V2,
  OPENING_MILITARY_ORDER_V2,
  TRAIT_MODIFIER_KEYS_V2,
  countryTraitEffectSignatureV2,
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
      effect: '−6% operation cost on naval fronts; +4% front supply on naval fronts.',
      description: 'Offsets the cost and supply burden of projecting the strongest opening military across oceans.',
    });
    expect(countryTraitV2('lka')?.effect).toBe(
      '+8% front supply on naval fronts; +6% food storage capacity; +3.5% weekly research progress in economy-science.',
    );
    expect(countryTraitV2('vnm')?.description).toBe(
      'Offsets jungle-homeland invasion risk without further increasing an already strong offensive start.',
    );
    expect(countryTraitV2('png')?.effect).toBe(
      '+30% defense when defending in coastal terrain in original homeland territory; +30% domestic food production; −20% military casualties when defending in coastal terrain in original homeland territory.',
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

  it('audits one material opening weakness for every single country identity', () => {
    for (const entry of COUNTRY_TRAITS_V2) {
      expect(countryTraitOpeningWeaknessV2(entry.playerId)).toBe(entry.openingWeakness);
      expect(entry.openingWeakness).toBe(
        traitOpeningWeaknessForModifierKeyV2(entry.modifiers[0]!.key),
      );
      expect(Math.abs(entry.modifiers[0]!.percentage)).toBeGreaterThanOrEqual(2);
      expect(entry.description).toMatch(/^(?:Addresses|Gives|Makes|Offsets|Transforms|Turns)\b/);
    }
  });

  it('locks the bottom-tail buffs to unique bounded mechanics', () => {
    expect(countryTraitModifiersV2('tls', 'food-production')[0]?.percentage).toBe(30);
    expect(countryTraitModifiersV2('tls', 'condition-recovery')[0]?.percentage).toBe(30);
    expect(countryTraitModifiersV2('tls', 'defense')[0]?.percentage).toBe(30);
    expect(countryTraitModifiersV2('swz', 'army-capacity')[0]?.percentage).toBe(30);
    expect(countryTraitModifiersV2('lux', 'tax-efficiency')[0]?.percentage).toBe(30);
    expect(countryTraitModifiersV2('lux', 'army-upkeep')[0]?.percentage).toBe(-30);
    expect(countryTraitModifiersV2('dji', 'naval-distance-pressure')[0]?.percentage).toBe(-45);
    expect(countryTraitModifiersV2('guy', 'starting-treasury')[0]?.percentage).toBe(75);
    expect(countryTraitModifiersV2('btn', 'food-storage-capacity')[0]?.percentage).toBe(30);
    expect(countryTraitModifiersV2('mne', 'operation-cost')[0]?.scope).toBeUndefined();
    expect(countryTraitModifiersV2('sur', 'defense')[0]?.scope).toEqual({ role: 'defender' });
    expect(countryTraitModifiersV2('brn', 'research-output')[0]?.percentage).toBe(30);
    expect(countryTraitModifiersV2('brn', 'army-upkeep')[0]?.percentage).toBe(-30);
    expect(countryTraitModifiersV2('isl', 'defense')[0]?.scope).toEqual({ role: 'defender' });
    expect(countryTraitModifiersV2('blz', 'military-casualties')[0]?.scope).toBeUndefined();

    const greenland = countryTraitV2('grl')!;
    expect(greenland.modifiers.map(({ key, percentage }) => ({ key, percentage }))).toEqual([
      { key: 'army-capacity', percentage: 1_200 },
      { key: 'recruitment-throughput', percentage: 150 },
      { key: 'army-upkeep', percentage: -80 },
    ]);
    expect(countryTraitFactorV2('grl', 'army-capacity')).toBeCloseTo(13, 10);
    expect(countryTraitFactorV2('grl', 'recruitment-throughput')).toBeCloseTo(2.5, 10);
    expect(countryTraitFactorV2('grl', 'army-upkeep')).toBeCloseTo(0.2, 10);
    expect(greenland.effect).toContain('+1200% army capacity');
    expect(greenland.effect).toContain('+150% recruitment throughput');
    expect(greenland.effect).toContain('−80% army upkeep');
  });

  it('keeps weak-country trait strength materially above the strongest tier', () => {
    const averageSignedBonusMass = (ids: readonly string[]): number => ids.reduce((sum, id) => (
      sum + countryTraitV2(id)!.modifiers.reduce(
        (modifierSum, modifier) => modifierSum + Math.abs(modifier.percentage),
        0,
      )
    ), 0) / ids.length;
    const strongestTwenty = averageSignedBonusMass(OPENING_MILITARY_ORDER_V2.slice(0, 20));
    const weakestTwenty = averageSignedBonusMass(OPENING_MILITARY_ORDER_V2.slice(-20));
    const weakestTwentyWithoutGreenland = OPENING_MILITARY_ORDER_V2.slice(-21, -1);
    const weakestWithoutGreenland = averageSignedBonusMass(weakestTwentyWithoutGreenland);
    const strongestIndividual = Math.max(...OPENING_MILITARY_ORDER_V2.slice(0, 20)
      .map((id) => countryTraitV2(id)!.modifiers.reduce(
        (sum, modifier) => sum + Math.abs(modifier.percentage),
        0,
      )));
    const weakestTailIndividual = Math.min(...weakestTwentyWithoutGreenland
      .map((id) => countryTraitV2(id)!.modifiers.reduce(
        (sum, modifier) => sum + Math.abs(modifier.percentage),
        0,
      )));

    expect(weakestTwenty).toBeGreaterThan(strongestTwenty * 2);
    // Greenland is deliberately exceptional, but cannot be allowed to mask a
    // weak bottom tail. Every other extreme underdog carries more visible
    // signed bonus mass than even the strongest individual top-20 trait.
    expect(weakestWithoutGreenland).toBeGreaterThan(strongestTwenty * 4);
    expect(weakestTailIndividual).toBeGreaterThan(strongestIndividual);
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

    expect(countryTraitFactorV2('usa', 'operation-cost', {
      access: 'naval', humanControlled: true,
    })).toBeCloseTo(1 - 0.06 * HUMAN_TRAIT_MULTIPLIER_STRONGEST_V2, 12);
    expect(countryTraitFactorV2('grl', 'army-capacity', {
      humanControlled: true,
    })).toBeCloseTo(1 + 12 * HUMAN_TRAIT_MULTIPLIER_WEAKEST_V2, 12);
    expect(countryTraitFactorV2('grl', 'army-capacity', {
      humanControlled: true,
    })).toBeGreaterThan(countryTraitFactorV2('grl', 'army-capacity'));
    expect(countryTraitFactorV2('grl', 'recruitment-throughput', {
      humanControlled: true,
    })).toBeCloseTo(3.7, 12);
    expect(countryTraitFactorV2('grl', 'army-upkeep', {
      humanControlled: true,
    })).toBeCloseTo(0.10, 12);
    expect(countryTraitV2('grl')).toBe(countryTraitV2('grl'));
  });

  it('keeps the immutable human-scaling order equal to the pure opening military ranking', () => {
    const state = createWorldStateV2(2026);
    expect(selectGlobalRankingV2(state, WORLD_CONTENT_V2).map((entry) => entry.player.id))
      .toEqual(OPENING_MILITARY_ORDER_V2);
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

    expect(countryTraitFactorV2('brn', 'research-output', { treasury: 0 })).toBeCloseTo(1.30);
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
    expect(seizure && countryTraitReplacementValueV2('che', seizure)).toBeCloseTo(0.10);
    expect(seizure && countryTraitReplacementValueV2('che', seizure, {
      humanControlled: true,
    })).toBeLessThan(0.10);
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
