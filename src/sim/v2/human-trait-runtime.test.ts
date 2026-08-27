import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import {
  initialTerritoryArmyCapacityV2,
  stateTerritoryArmyCapacityTargetV2,
} from './capacity';
import { WORLD_CONTENT_V2 } from './content';
import {
  quoteTerritoryIntegrationV2,
  territoryIntegrationDurationWeeksV2,
} from './integration';
import { invariantErrorsV2 } from './invariants';
import { openingStartingTreasuryV2 } from './nationState';
import { processResearchV2 } from './research';
import {
  createPowerSnapshotV2,
  selectResearchCatchUpFactorV2,
  selectResearchPortfolioV2,
  selectTreasurySeizureShareV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import { applyResearchProgressTraitV2 } from './traitResearch';
import {
  countryTraitFactorV2,
  countryTraitModifiersV2,
  countryTraitReplacementValueV2,
  humanStartingArmyMultiplierForContentV2,
} from './traits';
import { nationIdV2, territoryIdV2 } from './types';
import { WorldEngineV2 } from './WorldEngineV2';

describe('human country-trait runtime propagation', () => {
  it('uses the human multiplier in both research forecasts and weekly progress', () => {
    const state = createWorldStateV2(92_001);
    const czechia = nationIdV2('cze');
    state.humanPlayerId = czechia;
    state.humanPlayerIds = [czechia];

    const aiProjection = applyResearchProgressTraitV2(
      czechia,
      'military-industry',
      10,
    );
    const humanProjection = applyResearchProgressTraitV2(
      czechia,
      'military-industry',
      10,
      { humanControlled: true },
    );
    expect(humanProjection).toBeGreaterThan(aiProjection);
    expect(humanProjection).toBeCloseTo(
      10 * countryTraitFactorV2(czechia, 'research-progress', {
        humanControlled: true,
        researchBranch: 'military-industry',
      }),
      8,
    );

    const powers = createPowerSnapshotV2(state, WORLD_CONTENT_V2);
    const finance = selectWeeklyFinanceBreakdownV2(
      state,
      WORLD_CONTENT_V2,
      czechia,
      powers,
    );
    const catchUp = selectResearchCatchUpFactorV2(
      state,
      WORLD_CONTENT_V2,
      czechia,
      powers,
    );
    const portfolio = selectResearchPortfolioV2(
      state,
      WORLD_CONTENT_V2,
      czechia,
      finance,
      powers,
      catchUp,
    );
    const militaryIndustry = portfolio.find((row) => row.branch === 'military-industry')!;
    const progressBefore = state.players[czechia]!.research.progress['military-industry'];

    processResearchV2(
      state,
      WORLD_CONTENT_V2,
      new Map([[czechia, finance]]),
      powers,
    );

    expect(state.players[czechia]!.research.progress['military-industry'])
      .toBeCloseTo(progressBefore + militaryIndustry.weeklyProgress, 6);
  });

  it('amplifies the active human leader in an immutable integration quote only once', () => {
    const state = createWorldStateV2(92_002);
    const belize = nationIdV2('blz');
    const targetId = territoryIdV2('guy');
    const rawDuration = territoryIntegrationDurationWeeksV2(WORLD_CONTENT_V2, targetId);
    const aiQuote = quoteTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      targetId,
      belize,
      { cause: 'conquest', access: 'land' },
    );

    state.humanPlayerId = belize;
    state.humanPlayerIds = [belize];
    const humanQuote = quoteTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      targetId,
      belize,
      { cause: 'conquest', access: 'land' },
    );
    const expectedFactor = countryTraitFactorV2(
      belize,
      'integration-duration',
      {
        humanControlled: true,
        access: 'land',
        terrain: WORLD_CONTENT_V2.territories[targetId]!.terrain,
        homeland: false,
        firstConquest: true,
        atWar: false,
        treasury: state.players[belize]!.treasury,
        foodSecurity: state.players[belize]!.foodSecurity,
        condition: state.territories[targetId]!.condition,
      },
    );

    expect(aiQuote.durationWeeks).toBe(Math.round(
      rawDuration * countryTraitFactorV2(belize, 'integration-duration', {
        access: 'land',
        terrain: WORLD_CONTENT_V2.territories[targetId]!.terrain,
        homeland: false,
        firstConquest: true,
        atWar: false,
        treasury: state.players[belize]!.treasury,
        foodSecurity: state.players[belize]!.foodSecurity,
        condition: state.territories[targetId]!.condition,
      }),
    ));
    expect(humanQuote.durationWeeks).toBe(Math.max(1, Math.round(rawDuration * expectedFactor)));
    expect(humanQuote.durationWeeks).toBeLessThan(aiQuote.durationWeeks);
  });

  it('scales a fixed treasury-seizure replacement for its defeated human identity', () => {
    const state = createWorldStateV2(92_003);
    const switzerland = nationIdV2('che');
    const replacementEntry = countryTraitModifiersV2(
      switzerland,
      'treasury-seizure',
    ).find((entry) => entry.replacement?.unit === 'share')!;

    expect(selectTreasurySeizureShareV2(state, switzerland)).toBe(0.10);
    state.humanPlayerId = switzerland;
    state.humanPlayerIds = [switzerland];
    const expected = countryTraitReplacementValueV2(
      switzerland,
      replacementEntry,
      { humanControlled: true },
    )!;

    expect(selectTreasurySeizureShareV2(state, switzerland)).toBeCloseTo(expected, 12);
    expect(selectTreasurySeizureShareV2(state, switzerland)).toBeLessThan(0.10);
  });

  it('requotes opening cash and synchronizes army capacity across choose and lobby changes', () => {
    const engine = new WorldEngineV2(92_004);
    const belgium = nationIdV2('bel');
    const greenland = nationIdV2('grl');
    const luxembourg = nationIdV2('lux');
    const greenlandTerritory = territoryIdV2('grl');
    const ordinaryGreenlandCapacity = engine.state.territories[greenlandTerritory]!.army.capacity;
    const rawGreenlandCapacity = initialTerritoryArmyCapacityV2(
      WORLD_CONTENT_V2,
      greenlandTerritory,
    );

    expect(engine.chooseCountry(greenland)).toEqual({ accepted: true });
    engine.stopClock();
    expect(engine.state.territories[greenlandTerritory]!.army.capacity).toBeCloseTo(
      rawGreenlandCapacity * countryTraitFactorV2(
        greenland,
        'army-capacity',
        { humanControlled: true },
      ) * humanStartingArmyMultiplierForContentV2(WORLD_CONTENT_V2, greenland),
      5,
    );

    expect(engine.chooseCountry(luxembourg)).toEqual({ accepted: true });
    engine.stopClock();
    expect(engine.state.players[luxembourg]!.treasury).toBe(
      openingStartingTreasuryV2(luxembourg, WORLD_CONTENT_V2, true),
    );
    expect(engine.state.territories[greenlandTerritory]!.army.capacity)
      .toBeCloseTo(ordinaryGreenlandCapacity, 5);

    expect(engine.configureHumanPlayers([luxembourg, greenland], luxembourg))
      .toEqual({ accepted: true });
    const amplifiedGreenlandCapacity = engine.state.territories[greenlandTerritory]!.army.capacity;
    expect(engine.state.territories[greenlandTerritory]!.army.capacity).toBeCloseTo(
      stateTerritoryArmyCapacityTargetV2(
        engine.state,
        WORLD_CONTENT_V2,
        greenlandTerritory,
        greenland,
      ),
      8,
    );
    const amplifiedLuxembourgTreasury = engine.state.players[luxembourg]!.treasury;
    expect(engine.configureHumanPlayers([luxembourg, greenland], luxembourg))
      .toEqual({ accepted: true });
    expect(engine.state.players[luxembourg]!.treasury).toBe(amplifiedLuxembourgTreasury);
    expect(engine.state.territories[greenlandTerritory]!.army.capacity)
      .toBeCloseTo(amplifiedGreenlandCapacity, 8);
    expect(countryTraitFactorV2(greenland, 'army-capacity', { humanControlled: true }))
      .toBeCloseTo(1.27, 12);

    expect(engine.chooseCountry(belgium)).toEqual({ accepted: true });
    engine.stopClock();
    expect(engine.state.players[luxembourg]!.treasury).toBe(
      openingStartingTreasuryV2(luxembourg, WORLD_CONTENT_V2, false),
    );
    expect(engine.state.territories[greenlandTerritory]!.army.capacity)
      .toBeCloseTo(ordinaryGreenlandCapacity, 5);
    expect(engine.state.players[luxembourg]).not.toHaveProperty('trait');
    expect(engine.state.territories[greenlandTerritory]).not.toHaveProperty('trait');
    expect(invariantErrorsV2(engine.state, WORLD_CONTENT_V2)).toEqual([]);

    const restored = WorldEngineV2.fromSave(engine.save());
    expect(restored.canonicalHash()).toBe(engine.canonicalHash());
    expect(restored.state.players[luxembourg]!.treasury)
      .toBe(engine.state.players[luxembourg]!.treasury);
  });
});
