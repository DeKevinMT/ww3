import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from '../sim/v2/bootstrap';
import { WORLD_CONTENT_V2 } from '../sim/v2/content';
import {
  territoryIntegrationAnnualCostV2,
  territoryIntegrationDurationWeeksV2,
} from '../sim/v2/integration';
import { countryTraitFactorV2, countryTraitV2 } from '../sim/v2/traits';
import { nationIdV2 } from '../sim/v2/types';
import { WorldEngineV2 } from '../sim/v2/WorldEngineV2';
import {
  IntroOpeningMetricsCacheV2,
  quoteConquestIntegrationPreviewV2,
  renderCountryTraitIntelV2,
  renderCountryTraitPresentationV2,
  renderNationPickerV2,
} from './WorldUIV2';

describe('retired country-trait presentation', () => {
  it('keeps trait records out of the shared nation picker', () => {
    const engine = new WorldEngineV2(42_001);
    const opening = new IntroOpeningMetricsCacheV2().read(engine);
    const belgium = nationIdV2('bel');
    const archivedTrait = countryTraitV2(belgium)!;
    const rendered = renderNationPickerV2(opening, {
      previewCountryId: belgium,
      searchQuery: '',
      continent: 'ALL',
      sort: 'power',
      context: 'campaign',
    });

    expect(rendered.html).not.toContain('data-country-trait');
    expect(rendered.html).not.toContain('PLAYER TRAIT');
    expect(rendered.html).not.toContain('COUNTRY TRAIT');
    expect(rendered.html).not.toContain('ARSENAL TRAIT');
    expect(rendered.html).not.toContain('NATIONAL IDENTITY');
    expect(rendered.html).not.toContain(archivedTrait.name);
    expect(rendered.html).not.toContain(archivedTrait.effect);
    expect(rendered.html).toContain('MILITARY POWER');
    expect(rendered.html).toContain('STARTING TREASURY');
  });

  it('ignores legacy account trait scale without hiding mastery power or core stats', () => {
    const engine = new WorldEngineV2(42_002);
    const opening = new IntroOpeningMetricsCacheV2().read(engine);
    const belgium = nationIdV2('bel');
    const rendered = renderNationPickerV2(opening, {
      previewCountryId: belgium,
      searchQuery: '',
      continent: 'ALL',
      sort: 'power',
      context: 'campaign',
      availableCountryIds: new Set([belgium]),
      countryMasteryLevels: new Map([[belgium, 4]]),
      countryLoadouts: new Map([[belgium, {
        openingArmyMultiplier: 1,
        openingEconomyMultiplier: 1,
        trainedReserveMultiplier: 1,
        traitScale: 999,
      }]]),
    });

    expect(rendered.html).toContain('MASTERY LEVEL 4');
    expect(rendered.html).toContain('MASTERED POWER');
    expect(rendered.html).not.toContain('TRAIT');
    expect(rendered.html).not.toContain('data-country-trait');
  });

  it('keeps both exported compatibility renderers empty on every surface', () => {
    const greenland = nationIdV2('grl');
    expect(renderCountryTraitPresentationV2(greenland, 'picker')).toBe('');
    expect(renderCountryTraitPresentationV2(greenland, 'nation', WORLD_CONTENT_V2, 1)).toBe('');
    expect(renderCountryTraitIntelV2(greenland, false)).toBe('');
    expect(renderCountryTraitIntelV2(greenland, true, WORLD_CONTENT_V2, 99)).toBe('');
  });
});

describe('trait-neutral conquest preview', () => {
  it('quotes integration with the canonical duration and cost only', () => {
    const state = createWorldStateV2(42_003);
    const belize = nationIdV2('blz');
    const target = WORLD_CONTENT_V2.territoryIds.find((territoryId) => (
      state.territories[territoryId]?.owner !== belize
    ))!;
    const preview = quoteConquestIntegrationPreviewV2(state, belize, [target], 'land');

    expect(countryTraitFactorV2(belize, 'integration-duration', {
      firstConquest: true,
    })).toBe(1);
    expect(countryTraitFactorV2(belize, 'integration-cost', {
      firstConquest: true,
    })).toBe(1);
    expect(preview.durationWeeks).toBe(
      territoryIntegrationDurationWeeksV2(WORLD_CONTENT_V2, target),
    );
    expect(preview.annualCost).toBeCloseTo(
      territoryIntegrationAnnualCostV2(state.territories[target]!.economy),
      8,
    );
  });

  it('cannot inherit archived modifiers from absorbed or target countries', () => {
    const state = createWorldStateV2(42_004);
    const france = nationIdV2('fra');
    const target = WORLD_CONTENT_V2.territoryIds.find((territoryId) => (
      state.territories[territoryId]?.owner !== france
    ))!;
    const ownerBefore = state.territories[target]!.owner;
    const rawCost = territoryIntegrationAnnualCostV2(state.territories[target]!.economy);
    const preview = quoteConquestIntegrationPreviewV2(state, france, [target], 'naval');

    expect(preview.annualCost).toBeCloseTo(rawCost, 8);
    expect(countryTraitFactorV2(france, 'integration-cost')).toBe(1);
    expect(countryTraitFactorV2(ownerBefore, 'integration-cost')).toBe(1);
    expect(state.territories[target]!.owner).toBe(ownerBefore);
  });
});
