import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import {
  advanceTerritoryIntegrationProgramsV2,
  beginFederationTerritoryIntegrationV2,
  beginTerritoryIntegrationV2,
  quoteTerritoryIntegrationV2,
  territoryIntegrationAnnualCostV2,
} from './integration';
import {
  canonicalStateHashV2,
  createSaveV2,
  loadSaveV2,
} from './persistence';
import { composeTraitContextV2, traitNationContextV2 } from './traitContext';
import { countryTraitFactorV2 } from './traits';
import {
  nationIdV2,
  territoryIdV2,
  type PlayerId,
  type TerritoryId,
} from './types';

const FIRST_HUMAN_INTEGRATION_COST_FACTOR_V2 = 0.25;
const belgium = nationIdV2('bel');
const netherlands = nationIdV2('nld');
const belgiumTerritory = territoryIdV2('bel');
const franceTerritory = territoryIdV2('fra');
const germanyTerritory = territoryIdV2('deu');
const luxembourgTerritory = territoryIdV2('lux');
const netherlandsTerritory = territoryIdV2('nld');

type TestWorldStateV2 = ReturnType<typeof createWorldStateV2>;

function configureHumanPlayersV2(
  state: TestWorldStateV2,
  humanPlayerIds: readonly PlayerId[],
): void {
  state.humanPlayerId = humanPlayerIds[0]!;
  state.humanPlayerIds = [...humanPlayerIds]
    .sort((left, right) => left.localeCompare(right));
  state.firstIntegrationDiscountUsedBy = [];
}

function ordinaryConquestQuoteV2(
  state: TestWorldStateV2,
  territoryId: TerritoryId,
  newOwnerId: PlayerId,
) {
  const ordinaryState = structuredClone(state);
  ordinaryState.firstIntegrationDiscountUsedBy = [
    ...new Set([...ordinaryState.firstIntegrationDiscountUsedBy, newOwnerId]),
  ].sort((left, right) => left.localeCompare(right));
  return quoteTerritoryIntegrationV2(
    ordinaryState,
    WORLD_CONTENT_V2,
    territoryId,
    newOwnerId,
    { cause: 'conquest', access: 'land' },
  );
}

describe('V2 one-time human conquest integration discount', () => {
  it('charges 25% for the first conquest integration and full cost thereafter', () => {
    const state = createWorldStateV2(96_001);
    configureHumanPlayersV2(state, [belgium]);

    const ordinaryFirst = ordinaryConquestQuoteV2(
      state,
      luxembourgTerritory,
      belgium,
    );
    const first = quoteTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      luxembourgTerritory,
      belgium,
      { cause: 'conquest', access: 'land' },
    );

    expect(first.firstPlayerIntegrationDiscount).toBe(true);
    expect(ordinaryFirst.firstPlayerIntegrationDiscount).toBe(false);
    expect(first.annualCost).toBeCloseTo(
      ordinaryFirst.annualCost * FIRST_HUMAN_INTEGRATION_COST_FACTOR_V2,
      8,
    );
    beginTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      luxembourgTerritory,
      belgium,
      'land',
    );
    expect(state.territories[luxembourgTerritory]!.integrationProgram?.annualCost)
      .toBe(first.annualCost);
    expect(state.firstIntegrationDiscountUsedBy).toEqual([belgium]);

    const second = quoteTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      netherlandsTerritory,
      belgium,
      { cause: 'conquest', access: 'land' },
    );
    const replayedFirstState = structuredClone(state);
    replayedFirstState.firstIntegrationDiscountUsedBy = [];
    const replayedFirst = quoteTerritoryIntegrationV2(
      replayedFirstState,
      WORLD_CONTENT_V2,
      netherlandsTerritory,
      belgium,
      { cause: 'conquest', access: 'land' },
    );

    expect(second.firstPlayerIntegrationDiscount).toBe(false);
    expect(replayedFirst.firstPlayerIntegrationDiscount).toBe(true);
    expect(second.annualCost).toBeCloseTo(
      replayedFirst.annualCost / FIRST_HUMAN_INTEGRATION_COST_FACTOR_V2,
      8,
    );
    beginTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      netherlandsTerritory,
      belgium,
      'land',
    );
    expect(state.territories[netherlandsTerritory]!.integrationProgram?.annualCost)
      .toBe(second.annualCost);
    expect(state.firstIntegrationDiscountUsedBy).toEqual([belgium]);
  });

  it('never discounts or consumes the ledger for an AI integration', () => {
    const state = createWorldStateV2(96_002);
    configureHumanPlayersV2(state, [belgium]);
    const target = state.territories[luxembourgTerritory]!;
    const definition = WORLD_CONTENT_V2.territories[luxembourgTerritory]!;
    const quote = quoteTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      luxembourgTerritory,
      netherlands,
      { cause: 'conquest', access: 'land' },
    );
    const context = composeTraitContextV2(
      traitNationContextV2(state, netherlands),
      {
        access: 'land',
        terrain: definition.terrain,
        homeland: definition.initialOwnerId === netherlands,
        firstConquest: true,
        atWar: false,
        treasury: state.players[netherlands]!.treasury,
        foodSecurity: state.players[netherlands]!.foodSecurity,
        condition: target.condition,
      },
    );
    const ordinaryAnnualCost = territoryIntegrationAnnualCostV2(target.economy)
      * countryTraitFactorV2(netherlands, 'integration-cost', context);

    expect(quote.firstPlayerIntegrationDiscount).toBe(false);
    expect(quote.annualCost).toBeCloseTo(ordinaryAnnualCost, 8);
    beginTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      luxembourgTerritory,
      netherlands,
      'land',
    );
    expect(state.territories[luxembourgTerritory]!.integrationProgram?.annualCost)
      .toBe(quote.annualCost);
    expect(state.firstIntegrationDiscountUsedBy).toEqual([]);
  });

  it('tracks the first discounted integration independently for every multiplayer human', () => {
    const state = createWorldStateV2(96_003);
    configureHumanPlayersV2(state, [netherlands, belgium]);

    const belgianOrdinary = ordinaryConquestQuoteV2(
      state,
      luxembourgTerritory,
      belgium,
    );
    const belgianFirst = quoteTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      luxembourgTerritory,
      belgium,
      { cause: 'conquest', access: 'land' },
    );
    expect(belgianFirst.firstPlayerIntegrationDiscount).toBe(true);
    expect(belgianFirst.annualCost).toBeCloseTo(
      belgianOrdinary.annualCost * FIRST_HUMAN_INTEGRATION_COST_FACTOR_V2,
      8,
    );
    beginTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      luxembourgTerritory,
      belgium,
      'land',
    );
    expect(state.firstIntegrationDiscountUsedBy).toEqual([belgium]);

    const dutchOrdinary = ordinaryConquestQuoteV2(
      state,
      germanyTerritory,
      netherlands,
    );
    const dutchFirst = quoteTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      germanyTerritory,
      netherlands,
      { cause: 'conquest', access: 'land' },
    );
    expect(dutchFirst.firstPlayerIntegrationDiscount).toBe(true);
    expect(dutchFirst.annualCost).toBeCloseTo(
      dutchOrdinary.annualCost * FIRST_HUMAN_INTEGRATION_COST_FACTOR_V2,
      8,
    );
    beginTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      germanyTerritory,
      netherlands,
      'land',
    );
    expect(state.firstIntegrationDiscountUsedBy).toEqual(
      [belgium, netherlands].sort((left, right) => left.localeCompare(right)),
    );
    expect(quoteTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      franceTerritory,
      belgium,
      { cause: 'conquest', access: 'land' },
    ).firstPlayerIntegrationDiscount).toBe(false);
    expect(quoteTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      franceTerritory,
      netherlands,
      { cause: 'conquest', access: 'land' },
    ).firstPlayerIntegrationDiscount).toBe(false);
  });

  it('does not consume the discount on a sovereign recapture or federation', () => {
    const state = createWorldStateV2(96_004);
    configureHumanPlayersV2(state, [belgium]);
    const homeland = state.territories[belgiumTerritory]!;
    homeland.owner = netherlands;
    homeland.integration = 0.25;
    delete homeland.integrationProgram;

    const recapture = quoteTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      belgiumTerritory,
      belgium,
      { cause: 'conquest', access: 'land' },
    );
    expect(recapture).toMatchObject({
      firstPlayerIntegrationDiscount: false,
      durationWeeks: 0,
      annualCost: 0,
    });
    beginTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      belgiumTerritory,
      belgium,
      'land',
    );
    expect(state.firstIntegrationDiscountUsedBy).toEqual([]);

    const federation = quoteTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      luxembourgTerritory,
      belgium,
      { cause: 'federation' },
    );
    expect(federation.firstPlayerIntegrationDiscount).toBe(false);
    beginFederationTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      luxembourgTerritory,
      belgium,
    );
    expect(state.firstIntegrationDiscountUsedBy).toEqual([]);

    const conquest = quoteTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      netherlandsTerritory,
      belgium,
      { cause: 'conquest', access: 'land' },
    );
    const ordinary = ordinaryConquestQuoteV2(
      state,
      netherlandsTerritory,
      belgium,
    );
    expect(conquest.firstPlayerIntegrationDiscount).toBe(true);
    expect(conquest.annualCost).toBeCloseTo(
      ordinary.annualCost * FIRST_HUMAN_INTEGRATION_COST_FACTOR_V2,
      8,
    );
  });

  it('persists a consumed discount after completion and through save/load', () => {
    const state = createWorldStateV2(96_005);
    configureHumanPlayersV2(state, [belgium]);
    beginTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      luxembourgTerritory,
      belgium,
      'land',
    );
    state.tick = state.territories[luxembourgTerritory]!.integrationProgram!.completesTick;
    advanceTerritoryIntegrationProgramsV2(state, WORLD_CONTENT_V2);

    expect(state.territories[luxembourgTerritory]!.integrationProgram).toBeUndefined();
    expect(state.firstIntegrationDiscountUsedBy).toEqual([belgium]);
    const loaded = loadSaveV2(
      createSaveV2(state, WORLD_CONTENT_V2),
      WORLD_CONTENT_V2,
    );
    expect(loaded.firstIntegrationDiscountUsedBy).toEqual([belgium]);

    const second = quoteTerritoryIntegrationV2(
      loaded,
      WORLD_CONTENT_V2,
      netherlandsTerritory,
      belgium,
      { cause: 'conquest', access: 'land' },
    );
    const resetLedger = structuredClone(loaded);
    resetLedger.firstIntegrationDiscountUsedBy = [];
    const wouldBeFirst = quoteTerritoryIntegrationV2(
      resetLedger,
      WORLD_CONTENT_V2,
      netherlandsTerritory,
      belgium,
      { cause: 'conquest', access: 'land' },
    );
    expect(second.firstPlayerIntegrationDiscount).toBe(false);
    expect(wouldBeFirst.firstPlayerIntegrationDiscount).toBe(true);
    expect(second.annualCost).toBeCloseTo(
      wouldBeFirst.annualCost / FIRST_HUMAN_INTEGRATION_COST_FACTOR_V2,
      8,
    );
  });

  it('loads authenticated V2.62 saves without a ledger as unused', () => {
    const state = createWorldStateV2(96_006);
    const legacy = structuredClone(
      createSaveV2(state, WORLD_CONTENT_V2),
    ) as unknown as Record<string, unknown>;
    delete legacy.firstIntegrationDiscountUsedBy;
    legacy.rulesVersion = 'frontier-command-v2.62-temporary-opening-armies';
    legacy.canonicalStateHash = canonicalStateHashV2(legacy);

    const loaded = loadSaveV2(legacy as never, WORLD_CONTENT_V2);
    expect(loaded.firstIntegrationDiscountUsedBy).toEqual([]);
    expect(quoteTerritoryIntegrationV2(
      loaded,
      WORLD_CONTENT_V2,
      luxembourgTerritory,
      belgium,
      { cause: 'conquest', access: 'land' },
    ).firstPlayerIntegrationDiscount).toBe(true);
  });
});
