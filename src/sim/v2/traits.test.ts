import { describe, expect, it } from 'vitest';
import { isHumanSelectableNationV2, WORLD_CONTENT_V2 } from './content';
import {
  COUNTRY_TRAITS_V2,
  HUMAN_TRAIT_MULTIPLIER_STRONGEST_V2,
  HUMAN_TRAIT_MULTIPLIER_WEAKEST_V2,
  TRAIT_MODIFIER_KEYS_V2,
  countryTraitFactorV2,
  countryTraitModifiersV2,
  countryTraitReplacementValueV2,
  countryTraitV2,
  humanCountryTraitMultiplierForContentV2,
  humanCountryTraitMultiplierForContentVersionV2,
  humanCountryTraitMultiplierV2,
  type CountryTraitModifierV2,
  type TraitEvaluationContextV2,
} from './traits';

describe('retired country-trait compatibility catalog', () => {
  it('keeps every authored human-country record available for old saves', () => {
    const humanIds = WORLD_CONTENT_V2.nationIds
      .filter((id) => isHumanSelectableNationV2(WORLD_CONTENT_V2, id))
      .map(String)
      .sort();
    const traitIds = COUNTRY_TRAITS_V2.map(({ playerId }) => String(playerId)).sort();

    expect(traitIds).toEqual(humanIds);
    expect(new Set(traitIds).size).toBe(humanIds.length);
    expect(COUNTRY_TRAITS_V2).toHaveLength(166);
    expect(countryTraitV2('rai')).toBeUndefined();
    expect(countryTraitV2('grl')).toMatchObject({
      playerId: 'grl',
      name: expect.any(String),
      description: expect.any(String),
      modifiers: expect.any(Array),
    });
    expect(countryTraitV2('grl')!.modifiers.length).toBeGreaterThan(0);
    expect(Object.isFrozen(COUNTRY_TRAITS_V2)).toBe(true);
    expect(countryTraitV2('grl')).toBe(countryTraitV2('grl'));
  });

  it('returns no active modifiers and an exact neutral factor in every context', () => {
    const contexts: readonly TraitEvaluationContextV2[] = [
      {},
      { humanControlled: true, humanTraitMultiplier: 99 },
      { atWar: true, role: 'attacker', access: 'naval', terrain: 'arctic' },
      { atWar: false, foodSecurity: 0.2, treasury: -1, firstConquest: true },
    ];

    for (const trait of COUNTRY_TRAITS_V2) {
      for (const key of TRAIT_MODIFIER_KEYS_V2) {
        expect(countryTraitModifiersV2(trait.playerId, key), `${trait.playerId}:${key}`)
          .toEqual([]);
        for (const context of contexts) {
          expect(countryTraitFactorV2(trait.playerId, key, context), `${trait.playerId}:${key}`)
            .toBe(1);
        }
      }
    }
  });

  it('keeps legacy multiplier APIs inert regardless of country or content version', () => {
    expect(HUMAN_TRAIT_MULTIPLIER_STRONGEST_V2).toBe(0);
    expect(HUMAN_TRAIT_MULTIPLIER_WEAKEST_V2).toBe(0);
    expect(humanCountryTraitMultiplierV2('usa')).toBe(0);
    expect(humanCountryTraitMultiplierV2('grl')).toBe(0);
    expect(humanCountryTraitMultiplierForContentV2(WORLD_CONTENT_V2, 'grl')).toBe(0);
    expect(humanCountryTraitMultiplierForContentVersionV2(
      'grl',
      WORLD_CONTENT_V2.metadata!.contentVersion,
    )).toBe(0);
  });

  it('resolves archived replacement modifiers to their neutral source value', () => {
    const archivedReplacement: CountryTraitModifierV2 = {
      key: 'treasury-seizure',
      percentage: -40,
      factor: 0.6,
      replacement: { from: 0.6, to: 0.35 },
    };

    expect(countryTraitReplacementValueV2('che', archivedReplacement)).toBe(0.6);
    expect(countryTraitReplacementValueV2('che', archivedReplacement, {
      humanControlled: true,
      humanTraitMultiplier: 500,
    })).toBe(0.6);
  });
});
