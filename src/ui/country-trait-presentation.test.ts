import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from '../sim/v2/bootstrap';
import { WORLD_CONTENT_V2 } from '../sim/v2/content';
import {
  quoteTerritoryIntegrationV2,
  territoryIntegrationAnnualCostV2,
  territoryIntegrationDurationWeeksV2,
} from '../sim/v2/integration';
import { countryTraitV2 } from '../sim/v2/traits';
import { nationIdV2, territoryIdV2 } from '../sim/v2/types';
import { WorldEngineV2 } from '../sim/v2/WorldEngineV2';
import {
  IntroOpeningMetricsCacheV2,
  quoteConquestIntegrationPreviewV2,
  renderCountryTraitPresentationV2,
  renderNationPickerV2,
} from './WorldUIV2';

describe('country trait presentation', () => {
  it('shows the selected country trait name, exact effect and identity in the shared picker', () => {
    const engine = new WorldEngineV2(42_001);
    const opening = new IntroOpeningMetricsCacheV2().read(engine);
    const belgium = nationIdV2('bel');
    const trait = countryTraitV2(belgium)!;
    const rendered = renderNationPickerV2(opening, {
      previewCountryId: belgium,
      searchQuery: '',
      continent: 'ALL',
      sort: 'power',
      context: 'lobby',
    });

    expect(rendered.html).toContain(`data-country-trait="${belgium}"`);
    expect(rendered.html).toContain(trait.name);
    expect(rendered.html).toContain(trait.effect);
    expect(rendered.html).toContain(trait.description);
    expect(rendered.html).toContain('UNIQUE COUNTRY TRAIT');
  });

  it('renders one active nation trait and explicitly rejects fusion stacking', () => {
    const france = nationIdV2('fra');
    const congo = nationIdV2('cod');
    const activeTrait = countryTraitV2(france)!;
    const absorbedTrait = countryTraitV2(congo)!;
    const nationPanelTrait = renderCountryTraitPresentationV2(france, 'nation');

    expect(nationPanelTrait).toContain('ACTIVE NATIONAL TRAIT · SOLE IDENTITY');
    expect(nationPanelTrait).toContain(activeTrait.name);
    expect(nationPanelTrait).toContain(activeTrait.effect);
    expect(nationPanelTrait).toContain('Fused or conquered countries never add or stack their traits.');
    expect(nationPanelTrait).not.toContain(absorbedTrait.name);
    expect(nationPanelTrait).not.toContain(absorbedTrait.effect);
  });
});

describe('war confirmation integration preview', () => {
  it('shows an occupied sovereign core as an instant, free recapture', () => {
    const state = createWorldStateV2(42_000);
    const netherlands = nationIdV2('nld');
    const belgium = nationIdV2('bel');
    const homelandId = territoryIdV2('nld');
    state.territories[homelandId]!.owner = belgium;
    state.territories[homelandId]!.integration = 0.25;

    const preview = quoteConquestIntegrationPreviewV2(
      state,
      netherlands,
      [homelandId],
      'land',
    );
    expect(preview.durationWeeks).toBe(0);
    expect(preview.annualCost).toBe(0);
    expect(preview.quotes[0]).toMatchObject({ firstConquest: false });
    expect(state.territories[homelandId]!.owner).toBe(belgium);
  });

  it('uses the canonical trait-adjusted frozen quote for every target territory and route access', () => {
    const state = createWorldStateV2(42_002);
    const albania = nationIdV2('alb');
    const coastalTargets = WORLD_CONTENT_V2.territoryIds.filter((territoryId) => (
      WORLD_CONTENT_V2.territories[territoryId]?.terrain === 'coastal'
        && state.territories[territoryId]?.owner !== albania
    )).slice(0, 2);
    expect(coastalTargets).toHaveLength(2);
    const directQuotes = coastalTargets.map((territoryId) => quoteTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      territoryId,
      albania,
      { cause: 'conquest', access: 'naval' },
    ));

    const preview = quoteConquestIntegrationPreviewV2(
      state,
      albania,
      coastalTargets,
      'naval',
    );

    expect(preview.access).toBe('naval');
    expect(preview.territoryCount).toBe(2);
    expect(preview.durationWeeks).toBe(Math.max(...directQuotes.map((quote) => quote.durationWeeks)));
    expect(preview.annualCost).toBeCloseTo(
      directQuotes.reduce((total, quote) => total + quote.annualCost, 0),
      8,
    );
  });

  it('applies a first-conquest trait to only the first territory without mutating live ownership', () => {
    const state = createWorldStateV2(42_004);
    const belize = nationIdV2('blz');
    const targets = WORLD_CONTENT_V2.territoryIds.filter((territoryId) => (
      state.territories[territoryId]?.owner !== belize
    )).slice(0, 2);
    const ownersBefore = targets.map((territoryId) => state.territories[territoryId]!.owner);
    const preview = quoteConquestIntegrationPreviewV2(state, belize, targets, 'land');

    expect(preview.quotes.map((quote) => quote.firstConquest)).toEqual([true, false]);
    expect(preview.quotes[0]!.durationWeeks).toBe(Math.round(
      territoryIntegrationDurationWeeksV2(WORLD_CONTENT_V2, targets[0]!) * 0.70,
    ));
    expect(preview.quotes[1]!.durationWeeks).toBe(
      territoryIntegrationDurationWeeksV2(WORLD_CONTENT_V2, targets[1]!),
    );
    expect(targets.map((territoryId) => state.territories[territoryId]!.owner)).toEqual(ownersBefore);
  });

  it('keeps absorbed and target-country traits out of the active leader quote', () => {
    const state = createWorldStateV2(42_003);
    const france = nationIdV2('fra');
    const absorbedCongo = territoryIdV2('cod');
    const nextTarget = territoryIdV2('aut');
    state.territories[absorbedCongo]!.owner = france;
    state.territories[absorbedCongo]!.coreOwner = france;
    state.territories[absorbedCongo]!.integration = 1;

    const rawCost = territoryIntegrationAnnualCostV2(state.territories[nextTarget]!.economy);
    const preview = quoteConquestIntegrationPreviewV2(state, france, [nextTarget], 'land');

    expect(preview.annualCost).toBeCloseTo(rawCost * 0.96, 8);
    expect(preview.annualCost).not.toBeCloseTo(rawCost * 0.96 * 0.88, 8);
    expect(preview.annualCost).not.toBeCloseTo(rawCost * 0.96 * 0.90, 8);
  });
});
