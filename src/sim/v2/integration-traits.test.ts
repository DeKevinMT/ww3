import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import {
  FEDERATION_INTEGRATION_DURATION_FACTOR_V2,
  advanceTerritoryIntegrationProgramsV2,
  beginFederationTerritoryIntegrationV2,
  beginTerritoryIntegrationV2,
  quoteTerritoryIntegrationV2,
  territoryIntegrationAnnualCostV2,
  territoryIntegrationDurationWeeksV2,
} from './integration';
import { countryTraitFactorV2 } from './traits';
import {
  nationIdV2,
  territoryIdV2,
  type PlayerId,
  type TerritoryId,
} from './types';

function foreignTerritoryV2(
  playerId: PlayerId,
  predicate: (territoryId: TerritoryId) => boolean = () => true,
): TerritoryId {
  const territoryId = WORLD_CONTENT_V2.territoryIds.find((candidateId) => (
    WORLD_CONTENT_V2.territories[candidateId]?.initialOwnerId !== playerId
      && predicate(candidateId)
  ));
  if (!territoryId) throw new Error(`No suitable foreign territory for ${playerId}.`);
  return territoryId;
}

describe('V2 country traits in immutable integration quotes', () => {
  it('quotes a sovereign-core recapture as instant and free like runtime', () => {
    const state = createWorldStateV2(31_000);
    const netherlands = nationIdV2('nld');
    const belgium = nationIdV2('bel');
    const homelandId = territoryIdV2('nld');
    const homeland = state.territories[homelandId]!;
    homeland.owner = belgium;
    homeland.integration = 0.25;

    const quote = quoteTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      homelandId,
      netherlands,
      { cause: 'conquest', access: 'land' },
    );
    expect(quote).toMatchObject({
      firstConquest: false,
      durationWeeks: 0,
      annualCost: 0,
    });

    beginTerritoryIntegrationV2(state, WORLD_CONTENT_V2, homelandId, netherlands, 'land');
    expect(homeland.owner).toBe(netherlands);
    expect(homeland.integration).toBe(1);
    expect(homeland.integrationProgram).toBeUndefined();
  });

  it('applies target-terrain and access scopes without changing the raw helpers', () => {
    const state = createWorldStateV2(31_001);
    const albania = nationIdV2('alb');
    const hungary = nationIdV2('hun');
    const coastalTarget = foreignTerritoryV2(albania, (territoryId) => (
      WORLD_CONTENT_V2.territories[territoryId]?.terrain === 'coastal'
    ));
    const accessTarget = foreignTerritoryV2(hungary);
    const coastalRaw = territoryIntegrationDurationWeeksV2(
      WORLD_CONTENT_V2,
      coastalTarget,
    );
    const accessRaw = territoryIntegrationDurationWeeksV2(
      WORLD_CONTENT_V2,
      accessTarget,
    );

    const coastalFactor = countryTraitFactorV2(albania, 'integration-duration', {
      access: 'naval',
      terrain: 'coastal',
      firstConquest: true,
      atWar: false,
    });
    expect(quoteTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      coastalTarget,
      albania,
      { cause: 'conquest', access: 'naval' },
    ).durationWeeks).toBe(Math.round(coastalRaw * coastalFactor));
    const landFactor = countryTraitFactorV2(hungary, 'integration-duration', {
      access: 'land',
      terrain: WORLD_CONTENT_V2.territories[accessTarget]?.terrain,
      firstConquest: true,
      atWar: false,
    });
    expect(quoteTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      accessTarget,
      hungary,
      { cause: 'conquest', access: 'land' },
    ).durationWeeks).toBe(Math.round(accessRaw * landFactor));
    expect(quoteTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      accessTarget,
      hungary,
      { cause: 'conquest', access: 'naval' },
    ).durationWeeks).toBe(accessRaw);

    expect(territoryIntegrationDurationWeeksV2(WORLD_CONTENT_V2, coastalTarget))
      .toBe(coastalRaw);
  });

  it('derives first conquest from current foreign opening homelands before capture', () => {
    const state = createWorldStateV2(31_002);
    const belize = nationIdV2('blz');
    const firstTarget = foreignTerritoryV2(belize);
    const rawDuration = territoryIntegrationDurationWeeksV2(
      WORLD_CONTENT_V2,
      firstTarget,
    );
    const firstQuote = quoteTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      firstTarget,
      belize,
      { cause: 'conquest', access: 'land' },
    );

    expect(firstQuote.firstConquest).toBe(true);
    expect(firstQuote.durationWeeks).toBe(Math.round(rawDuration
      * countryTraitFactorV2(belize, 'integration-duration', {
        access: 'land',
        terrain: WORLD_CONTENT_V2.territories[firstTarget]?.terrain,
        firstConquest: true,
        atWar: false,
      })));
    beginTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      firstTarget,
      belize,
      'land',
    );
    expect(state.territories[firstTarget]?.integrationProgram?.completesTick)
      .toBe(state.tick + firstQuote.durationWeeks);

    const laterQuote = quoteTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      firstTarget,
      belize,
      { cause: 'conquest', access: 'land' },
    );
    expect(laterQuote.firstConquest).toBe(false);
    expect(laterQuote.durationWeeks).toBe(rawDuration);
  });

  it('uses only the federation leader trait and composes the 0.25 factor once', () => {
    const durationState = createWorldStateV2(31_003);
    const benin = nationIdV2('ben');
    const rwandaTerritory = territoryIdV2('rwa');
    const rawDuration = territoryIntegrationDurationWeeksV2(
      WORLD_CONTENT_V2,
      rwandaTerritory,
    );
    const durationQuote = quoteTerritoryIntegrationV2(
      durationState,
      WORLD_CONTENT_V2,
      rwandaTerritory,
      benin,
      { cause: 'federation' },
    );

    expect(durationQuote.firstConquest).toBe(false);
    const beninFactor = countryTraitFactorV2(benin, 'integration-duration', {
      terrain: WORLD_CONTENT_V2.territories[rwandaTerritory]?.terrain,
      firstConquest: false,
      atWar: false,
    });
    expect(durationQuote.durationWeeks).toBe(Math.round(
      rawDuration * FEDERATION_INTEGRATION_DURATION_FACTOR_V2 * beninFactor,
    ));
    expect(durationQuote.durationWeeks).not.toBe(Math.round(
      rawDuration * FEDERATION_INTEGRATION_DURATION_FACTOR_V2 * beninFactor * 0.75,
    ));
    beginFederationTerritoryIntegrationV2(
      durationState,
      WORLD_CONTENT_V2,
      rwandaTerritory,
      benin,
    );
    expect(durationState.territories[rwandaTerritory]?.integrationProgram?.completesTick)
      .toBe(durationState.tick + durationQuote.durationWeeks);

    const costState = createWorldStateV2(31_004);
    const france = nationIdV2('fra');
    const congoTerritory = territoryIdV2('cod');
    const rawAnnualCost = territoryIntegrationAnnualCostV2(
      costState.territories[congoTerritory]!.economy,
    );
    const costQuote = quoteTerritoryIntegrationV2(
      costState,
      WORLD_CONTENT_V2,
      congoTerritory,
      france,
      { cause: 'federation' },
    );
    const franceFactor = countryTraitFactorV2(france, 'integration-cost', {
      terrain: WORLD_CONTENT_V2.territories[congoTerritory]?.terrain,
      firstConquest: false,
      atWar: false,
    });
    expect(costQuote.annualCost).toBeCloseTo(rawAnnualCost * franceFactor, 8);
    expect(costQuote.annualCost).not.toBeCloseTo(rawAnnualCost * franceFactor * 0.88, 8);
  });

  it('freezes the quote into the program instead of recalculating it weekly', () => {
    const state = createWorldStateV2(31_005);
    const belize = nationIdV2('blz');
    const targetId = foreignTerritoryV2(belize);
    const quote = quoteTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      targetId,
      belize,
      { cause: 'conquest', access: 'land' },
    );

    beginTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      targetId,
      belize,
      { access: 'land' },
    );
    const territory = state.territories[targetId]!;
    const frozenProgram = { ...territory.integrationProgram! };
    expect(frozenProgram.completesTick - frozenProgram.startedTick).toBe(quote.durationWeeks);
    expect(frozenProgram.annualCost).toBe(quote.annualCost);

    territory.economy *= 50;
    state.tick += 1;
    advanceTerritoryIntegrationProgramsV2(state, WORLD_CONTENT_V2);

    expect(territory.integrationProgram).toEqual(frozenProgram);
    expect(territory.integrationProgram?.annualCost).not.toBe(
      territoryIntegrationAnnualCostV2(territory.economy),
    );
  });
});
