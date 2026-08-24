import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from '../sim/v2/bootstrap';
import { WORLD_CONTENT_V2 } from '../sim/v2/content';
import {
  quoteTerritoryIntegrationV2,
  territoryIntegrationAnnualCostV2,
  territoryIntegrationDurationWeeksV2,
} from '../sim/v2/integration';
import {
  countryTraitFactorV2,
  countryTraitV2,
  describeCountryTraitModifiersV2,
  humanCountryTraitMultiplierV2,
} from '../sim/v2/traits';
import { nationIdV2, territoryIdV2 } from '../sim/v2/types';
import { WorldEngineV2 } from '../sim/v2/WorldEngineV2';
import {
  IntroOpeningMetricsCacheV2,
  quoteConquestIntegrationPreviewV2,
  renderCountryTraitIntelV2,
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
    const appliedEffect = describeCountryTraitModifiersV2(
      trait.modifiers,
      humanCountryTraitMultiplierV2(belgium),
    );

    expect(rendered.html).toContain(`data-country-trait="${belgium}"`);
    expect(rendered.html).toContain(trait.name);
    expect(rendered.html).toContain(appliedEffect);
    expect(rendered.html).toContain(trait.description);
    expect(rendered.html).toContain('PLAYER TRAIT');
    expect(rendered.html).toContain(`×${humanCountryTraitMultiplierV2(belgium).toFixed(2)}`);
    expect(rendered.html).toContain('STARTING TREASURY');
    expect(rendered.html).not.toContain('This amplifies the same trait');
  });

  it('previews the selected human multiplier before country choice', () => {
    const engine = new WorldEngineV2(42_005);
    const opening = new IntroOpeningMetricsCacheV2().read(engine);
    const greenland = nationIdV2('grl');
    const rendered = renderNationPickerV2(opening, {
      previewCountryId: greenland,
      searchQuery: '',
      continent: 'ALL',
      sort: 'power',
      context: 'campaign',
    });

    const trait = countryTraitV2(greenland)!;
    expect(rendered.html).toContain('PLAYER TRAIT');
    expect(rendered.html).toContain('×20.00');
    expect(rendered.html).toContain(describeCountryTraitModifiersV2(
      trait.modifiers,
      humanCountryTraitMultiplierV2(greenland),
    ));
  });

  it('renders one compact player-applied nation trait without fusion bloat', () => {
    const france = nationIdV2('fra');
    const congo = nationIdV2('cod');
    const activeTrait = countryTraitV2(france)!;
    const absorbedTrait = countryTraitV2(congo)!;
    const nationPanelTrait = renderCountryTraitPresentationV2(france, 'nation');
    const appliedEffect = describeCountryTraitModifiersV2(
      activeTrait.modifiers,
      humanCountryTraitMultiplierV2(france),
    );

    expect(nationPanelTrait).toContain('NATIONAL TRAIT');
    expect(nationPanelTrait).toContain(activeTrait.name);
    expect(nationPanelTrait).toContain(appliedEffect);
    expect(nationPanelTrait).not.toContain('Fused or conquered');
    expect(nationPanelTrait).not.toContain('This amplifies');
    expect(nationPanelTrait).not.toContain(activeTrait.description);
    expect(nationPanelTrait).not.toContain(absorbedTrait.name);
    expect(nationPanelTrait).not.toContain(absorbedTrait.effect);
  });

  it('shows compact base trait intel for AI map targets and scaled intel for human owners', () => {
    const greenland = nationIdV2('grl');
    const trait = countryTraitV2(greenland)!;
    const aiIntel = renderCountryTraitIntelV2(greenland, false);
    const humanIntel = renderCountryTraitIntelV2(greenland, true);

    expect(aiIntel).toContain('COUNTRY TRAIT');
    expect(aiIntel).toContain(trait.effect);
    expect(aiIntel).not.toContain(trait.description);
    expect(humanIntel).toContain('PLAYER TRAIT');
    expect(humanIntel).toContain(describeCountryTraitModifiersV2(
      trait.modifiers,
      humanCountryTraitMultiplierV2(greenland),
    ));
  });

  it('caps Palestine player casualty prevention below immunity in mechanics and text', () => {
    const palestine = nationIdV2('psx');
    const context = {
      role: 'defender', terrain: 'desert', homeland: true, humanControlled: true,
    } as const;
    const factor = countryTraitFactorV2(palestine, 'military-casualties', context);
    const rendered = renderCountryTraitPresentationV2(palestine, 'picker');

    expect(factor).toBe(0.35);
    expect(rendered).toContain('−65% military casualties');
    expect(rendered).not.toMatch(/−(?:[1-9]\d{2,}|100)% military casualties/);
  });

  it('caps player route and integration reductions at real positive mechanics', () => {
    const madagascar = nationIdV2('mdg');
    const albania = nationIdV2('alb');
    const madagascarCard = renderCountryTraitPresentationV2(madagascar, 'picker');
    const albaniaCard = renderCountryTraitPresentationV2(albania, 'picker');

    expect(countryTraitFactorV2(madagascar, 'naval-distance-pressure', {
      access: 'naval', humanControlled: true,
    })).toBeGreaterThanOrEqual(0.20);
    expect(countryTraitFactorV2(albania, 'integration-duration', {
      access: 'naval', humanControlled: true,
    })).toBeGreaterThanOrEqual(0.25);
    expect(madagascarCard).toContain('−80% naval distance penalty');
    expect(albaniaCard).not.toMatch(
      /−(?:7[6-9]|[89]\d|\d{3,})(?:\.\d+)?% integration duration/,
    );
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
    const firstFactor = countryTraitFactorV2(belize, 'integration-duration', {
      firstConquest: true,
    });
    expect(preview.quotes[0]!.durationWeeks).toBe(Math.round(
      territoryIntegrationDurationWeeksV2(WORLD_CONTENT_V2, targets[0]!) * firstFactor,
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

    const franceFactor = countryTraitFactorV2(france, 'integration-cost');
    expect(preview.annualCost).toBeCloseTo(rawCost * franceFactor, 8);
    expect(preview.annualCost).not.toBeCloseTo(
      rawCost * franceFactor * countryTraitFactorV2(absorbedCongo, 'integration-cost'),
      8,
    );
    expect(preview.annualCost).not.toBeCloseTo(
      rawCost * franceFactor * countryTraitFactorV2(nextTarget, 'integration-cost'),
      8,
    );
  });
});
