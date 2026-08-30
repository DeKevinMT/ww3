import { afterEach, describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import {
  stateTerritoryArmyCapacityTargetV2,
  synchronizeArmyCapacityV2,
} from './capacity';
import { WORLD_CONTENT_V2, type WorldContentV2 } from './content';
import {
  registerCountryMasteryRuntimeV2,
  resetCountryMasteryRuntimeV2,
  selectCountryMasteryNationalRuntimeV2,
  selectCountryMasteryReplenishmentRuntimeV2,
  selectRegisteredCountryMasteryRuntimeV2,
  selectTerritoryCountryMasteryRuntimeV2,
  type CountryMasteryRuntimeRegistrationV2,
} from './countryMasteryRuntime';
import { createFinancePlansV2, processFinanceMilitaryV2 } from './economy';
import { loadSaveV2, serializeSaveV2 } from './persistence';
import { resolveScenarioV2 } from './scenarios';
import {
  selectRecruitmentTrainingPipelineV2,
  selectRecruitmentUnitCostV2,
  selectBaseOperatingCostShareV2,
  selectEffectiveAttackV2,
  selectEffectiveDefenseV2,
  selectWeeklyFinanceBreakdownV2,
} from './selectors';
import { formSurvivalEmpireV2 } from './survivalEmpire';
import {
  nationIdV2,
  territoryIdV2,
  type FrontOperationV2,
  type PlayerId,
  type WarStateV2,
  type WorldStateV2,
} from './types';
import {
  internalArmyTransferLogisticsTermsV2,
  resolveBattlePulseV2,
  supplyFactorV2,
} from './war';

const BELGIUM = nationIdV2('bel');
const LUXEMBOURG = nationIdV2('lux');
const BELGIUM_TERRITORY = territoryIdV2('bel');
const LUXEMBOURG_TERRITORY = territoryIdV2('lux');

afterEach(() => {
  resetCountryMasteryRuntimeV2(WORLD_CONTENT_V2);
});

const modifiers = (
  armyCapacityMultiplier: number,
  recruitmentMultiplier: number,
  reserveTrainingMultiplier: number,
  extra: Partial<CountryMasteryRuntimeRegistrationV2> = {},
): CountryMasteryRuntimeRegistrationV2 => ({
  armyCapacityMultiplier,
  recruitmentMultiplier,
  reserveTrainingMultiplier,
  ...extra,
});

function fullyFunded(state: WorldStateV2, ownerId: PlayerId): void {
  state.players[ownerId]!.treasury = 1_000_000;
  state.players[ownerId]!.foodSecurity = 1;
  state.players[ownerId]!.budget = { military: 90, research: 5, development: 5 };
  state.players[ownerId]!.trainedReserves = 0;
  for (const territory of Object.values(state.territories)) {
    if (territory.owner === ownerId) territory.army.manpower = territory.army.capacity;
  }
}

describe('Country Mastery simulation runtime', () => {
  it('uses the flagship capacity on Campaign conquests and member capacity when registered', () => {
    const state = createWorldStateV2(95_101, WORLD_CONTENT_V2);
    const captured = state.territories[LUXEMBOURG_TERRITORY]!;
    captured.owner = BELGIUM;
    captured.integration = 1;
    delete captured.integrationProgram;
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const baselineHome = stateTerritoryArmyCapacityTargetV2(
      state, WORLD_CONTENT_V2, BELGIUM_TERRITORY, BELGIUM,
    );
    const baselineCaptured = stateTerritoryArmyCapacityTargetV2(
      state, WORLD_CONTENT_V2, LUXEMBOURG_TERRITORY, BELGIUM,
    );
    const baselineCapturedAttack = selectEffectiveAttackV2(
      state, WORLD_CONTENT_V2, BELGIUM, captured.army,
    );
    const baselineCapturedDefense = selectEffectiveDefenseV2(
      state, WORLD_CONTENT_V2, BELGIUM, captured.army,
    );

    registerCountryMasteryRuntimeV2(
      WORLD_CONTENT_V2,
      BELGIUM,
      modifiers(2, 1, 1, { attackMultiplier: 1.20, defenseMultiplier: 1.10 }),
    );
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    expect(stateTerritoryArmyCapacityTargetV2(
      state, WORLD_CONTENT_V2, BELGIUM_TERRITORY, BELGIUM,
    )).toBeCloseTo(baselineHome * 2, 5);
    expect(stateTerritoryArmyCapacityTargetV2(
      state, WORLD_CONTENT_V2, LUXEMBOURG_TERRITORY, BELGIUM,
    )).toBeCloseTo(baselineCaptured * 2, 5);

    registerCountryMasteryRuntimeV2(
      WORLD_CONTENT_V2,
      LUXEMBOURG,
      modifiers(3, 1, 1, { attackMultiplier: 1.50, defenseMultiplier: 1.40 }),
    );
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    expect(stateTerritoryArmyCapacityTargetV2(
      state, WORLD_CONTENT_V2, BELGIUM_TERRITORY, BELGIUM,
    )).toBeCloseTo(baselineHome * 2, 5);
    expect(stateTerritoryArmyCapacityTargetV2(
      state, WORLD_CONTENT_V2, LUXEMBOURG_TERRITORY, BELGIUM,
    )).toBeCloseTo(baselineCaptured * 3, 5);
    expect(selectEffectiveAttackV2(
      state, WORLD_CONTENT_V2, BELGIUM, captured.army,
    ) / baselineCapturedAttack).toBeCloseTo(1.50, 5);
    expect(selectEffectiveDefenseV2(
      state, WORLD_CONTENT_V2, BELGIUM, captured.army,
    ) / baselineCapturedDefense).toBeCloseTo(1.40, 5);
  });

  it('preserves every fused Survival member multiplier and blends training by recruiting population', () => {
    const content = resolveScenarioV2({ mode: 'survival', seed: 95_102 }).content;
    const state = createWorldStateV2(95_102, content);
    const flagshipId = state.humanPlayerId;
    const memberId = flagshipId === BELGIUM ? LUXEMBOURG : BELGIUM;
    const flagshipTerritoryId = content.nations[flagshipId]!.initialCapitalId;
    const memberTerritoryId = content.nations[memberId]!.initialCapitalId;
    expect(formSurvivalEmpireV2(
      state,
      content,
      flagshipId,
      [memberId],
    ).accepted).toBe(true);
    // Keep whole-soldier (nine-decimal million) rounding from obscuring the
    // exact blend in this focused arithmetic test.
    for (const territory of Object.values(state.territories)) {
      if (territory.owner === flagshipId) territory.population *= 100;
    }

    synchronizeArmyCapacityV2(state, content);
    const flagshipCapacity = stateTerritoryArmyCapacityTargetV2(
      state, content, flagshipTerritoryId, flagshipId,
    );
    const memberCapacity = stateTerritoryArmyCapacityTargetV2(
      state, content, memberTerritoryId, flagshipId,
    );
    const baselinePipeline = selectRecruitmentTrainingPipelineV2(
      state, content, flagshipId,
    );

    registerCountryMasteryRuntimeV2(
      content,
      flagshipId,
      modifiers(2, 1.20, 1.40),
    );
    registerCountryMasteryRuntimeV2(
      content,
      memberId,
      modifiers(3, 2, 2.50),
    );
    synchronizeArmyCapacityV2(state, content);
    expect(stateTerritoryArmyCapacityTargetV2(
      state, content, flagshipTerritoryId, flagshipId,
    )).toBeCloseTo(flagshipCapacity * 2, 5);
    expect(stateTerritoryArmyCapacityTargetV2(
      state, content, memberTerritoryId, flagshipId,
    )).toBeCloseTo(memberCapacity * 3, 5);

    const productiveTerritoryIds = [flagshipTerritoryId, memberTerritoryId];
    const flagshipWeight = state.territories[flagshipTerritoryId]!.population
      * state.territories[flagshipTerritoryId]!.integration;
    const memberWeight = state.territories[memberTerritoryId]!.population
      * state.territories[memberTerritoryId]!.integration;
    const totalWeight = flagshipWeight + memberWeight;
    const expectedRecruitment = (1.20 * flagshipWeight + 2 * memberWeight) / totalWeight;
    const expectedReserve = (1.40 * flagshipWeight + 2.50 * memberWeight) / totalWeight;
    expect(selectCountryMasteryReplenishmentRuntimeV2(
      state,
      content,
      flagshipId,
      productiveTerritoryIds,
    )).toEqual({
      recruitmentMultiplier: expect.closeTo(expectedRecruitment, 10),
      reserveTrainingMultiplier: expect.closeTo(expectedReserve, 10),
    });

    // Capacity is a separate Force effect; reset it to 1× to isolate the exact
    // weighted Mobilization contribution in the shared pipeline and finance.
    registerCountryMasteryRuntimeV2(
      content,
      flagshipId,
      modifiers(1, 1.20, 1.40),
    );
    registerCountryMasteryRuntimeV2(
      content,
      memberId,
      modifiers(1, 2, 2.50),
    );
    synchronizeArmyCapacityV2(state, content);
    // The full Survival empire has more members than this two-territory
    // assertion, so derive the exact runtime blend used by selectors below.
    const allProductiveTerritories = Object.entries(state.territories)
      .filter(([, territory]) => territory.owner === flagshipId)
      .map(([id]) => territoryIdV2(id));
    const liveBlend = selectCountryMasteryReplenishmentRuntimeV2(
      state,
      content,
      flagshipId,
      allProductiveTerritories,
    );
    expect(selectRecruitmentTrainingPipelineV2(state, content, flagshipId)
      / baselinePipeline).toBeCloseTo(liveBlend.recruitmentMultiplier, 4);

    resetCountryMasteryRuntimeV2(content);
    synchronizeArmyCapacityV2(state, content);
    fullyFunded(state, flagshipId);
    const baselineReserve = selectWeeklyFinanceBreakdownV2(
      state, content, flagshipId,
    ).reserveTraining;
    registerCountryMasteryRuntimeV2(
      content,
      flagshipId,
      modifiers(1, 1.20, 1.40),
    );
    registerCountryMasteryRuntimeV2(
      content,
      memberId,
      modifiers(1, 2, 2.50),
    );
    const masteredReserve = selectWeeklyFinanceBreakdownV2(
      state, content, flagshipId,
    ).reserveTraining;
    expect(masteredReserve / baselineReserve)
      // Weekly manpower is persisted in whole-soldier units, so this final
      // finance value carries slightly more quantization than the pure blend.
      .toBeCloseTo(liveBlend.reserveTrainingMultiplier, 3);
  });

  it('weights military-industry costs across original member recruiting populations', () => {
    const state = createWorldStateV2(95_104, WORLD_CONTENT_V2);
    const captured = state.territories[LUXEMBOURG_TERRITORY]!;
    captured.owner = BELGIUM;
    captured.integration = 1;
    delete captured.integrationProgram;
    const territoryIds = [BELGIUM_TERRITORY, LUXEMBOURG_TERRITORY];
    const baselineRecruitmentCost = selectRecruitmentUnitCostV2(
      state, BELGIUM, WORLD_CONTENT_V2,
    );
    const baselineOperatingCost = selectBaseOperatingCostShareV2(
      state, BELGIUM, WORLD_CONTENT_V2,
    );
    registerCountryMasteryRuntimeV2(
      WORLD_CONTENT_V2,
      BELGIUM,
      modifiers(1, 1, 1, {
        recruitmentCostMultiplier: 0.80,
        standingOperatingCostMultiplier: 0.70,
      }),
    );
    registerCountryMasteryRuntimeV2(
      WORLD_CONTENT_V2,
      LUXEMBOURG,
      modifiers(1, 1, 1, {
        recruitmentCostMultiplier: 0.60,
        standingOperatingCostMultiplier: 0.50,
      }),
    );
    const blend = selectCountryMasteryNationalRuntimeV2(
      state,
      WORLD_CONTENT_V2,
      BELGIUM,
      territoryIds,
    );
    const belgianWeight = state.territories[BELGIUM_TERRITORY]!.population;
    const luxembourgWeight = state.territories[LUXEMBOURG_TERRITORY]!.population;
    expect(blend.recruitmentCostMultiplier).toBeCloseTo(
      (0.80 * belgianWeight + 0.60 * luxembourgWeight)
        / (belgianWeight + luxembourgWeight),
      10,
    );
    expect(blend.standingOperatingCostMultiplier).toBeCloseTo(
      (0.70 * belgianWeight + 0.50 * luxembourgWeight)
        / (belgianWeight + luxembourgWeight),
      10,
    );
    expect(selectRecruitmentUnitCostV2(state, BELGIUM, WORLD_CONTENT_V2)
      / baselineRecruitmentCost).toBeCloseTo(blend.recruitmentCostMultiplier, 6);
    expect(selectBaseOperatingCostShareV2(state, BELGIUM, WORLD_CONTENT_V2)
      / baselineOperatingCost).toBeCloseTo(blend.standingOperatingCostMultiplier, 6);
  });

  it('uses source-country land/naval logistics mastery on a fused empire route', () => {
    const routeContent = (
      kind: 'land' | 'sea',
      distanceKm?: number,
    ): WorldContentV2 => ({
      ...WORLD_CONTENT_V2,
      territories: {
        ...WORLD_CONTENT_V2.territories,
        [BELGIUM_TERRITORY]: {
          ...WORLD_CONTENT_V2.territories[BELGIUM_TERRITORY]!,
          connections: [{ targetId: LUXEMBOURG_TERRITORY, kind, distanceKm }],
        },
        [LUXEMBOURG_TERRITORY]: {
          ...WORLD_CONTENT_V2.territories[LUXEMBOURG_TERRITORY]!,
          baseline: {
            ...WORLD_CONTENT_V2.territories[LUXEMBOURG_TERRITORY]!.baseline,
            landArea: 10_000_000,
          },
          connections: [{ targetId: BELGIUM_TERRITORY, kind, distanceKm }],
        },
      },
    });

    const landContent = routeContent('land');
    const landState = createWorldStateV2(95_105, landContent);
    landState.territories[LUXEMBOURG_TERRITORY]!.owner = BELGIUM;
    landState.territories[LUXEMBOURG_TERRITORY]!.integration = 1;
    const landSupplyBefore = supplyFactorV2(
      landState,
      landContent,
      BELGIUM,
      LUXEMBOURG_TERRITORY,
      'land',
      BELGIUM_TERRITORY,
    );
    const landTransferBefore = internalArmyTransferLogisticsTermsV2(
      landState,
      landContent,
      BELGIUM,
      LUXEMBOURG_TERRITORY,
      BELGIUM_TERRITORY,
    );
    registerCountryMasteryRuntimeV2(
      landContent,
      BELGIUM,
      modifiers(1, 1, 1),
    );
    registerCountryMasteryRuntimeV2(
      landContent,
      LUXEMBOURG,
      modifiers(1, 1, 1, {
        landSupplyMultiplier: 1.10,
        landTransferThroughputMultiplier: 1.20,
      }),
    );
    const landSupplyAfter = supplyFactorV2(
      landState,
      landContent,
      BELGIUM,
      LUXEMBOURG_TERRITORY,
      'land',
      BELGIUM_TERRITORY,
    );
    const landTransferAfter = internalArmyTransferLogisticsTermsV2(
      landState,
      landContent,
      BELGIUM,
      LUXEMBOURG_TERRITORY,
      BELGIUM_TERRITORY,
    );
    expect(landSupplyAfter).toBeCloseTo(Math.min(1, landSupplyBefore * 1.10), 9);
    expect(landTransferAfter.throughputMultiplier)
      .toBeCloseTo(Math.min(1, landTransferBefore.throughputMultiplier * 1.20), 8);

    const navalContent = routeContent('sea', 7_000);
    const navalState = createWorldStateV2(95_106, navalContent);
    navalState.territories[LUXEMBOURG_TERRITORY]!.owner = BELGIUM;
    navalState.territories[LUXEMBOURG_TERRITORY]!.integration = 1;
    // A displaced capital leaves meaningful route headroom below the physical
    // naval ceiling, making the supply mastery contribution observable.
    navalState.players[BELGIUM]!.capitalId = territoryIdV2('usa');
    const navalSupplyBefore = supplyFactorV2(
      navalState,
      navalContent,
      BELGIUM,
      LUXEMBOURG_TERRITORY,
      'naval',
      BELGIUM_TERRITORY,
    );
    const navalTransferBefore = internalArmyTransferLogisticsTermsV2(
      navalState,
      navalContent,
      BELGIUM,
      LUXEMBOURG_TERRITORY,
      BELGIUM_TERRITORY,
      1,
    );
    registerCountryMasteryRuntimeV2(
      navalContent,
      BELGIUM,
      modifiers(1, 1, 1),
    );
    registerCountryMasteryRuntimeV2(
      navalContent,
      LUXEMBOURG,
      modifiers(1, 1, 1, {
        navalSupplyMultiplier: 1.15,
        navalTransferThroughputMultiplier: 1.10,
        navalTransferCostMultiplier: 0.80,
      }),
    );
    const navalSupplyAfter = supplyFactorV2(
      navalState,
      navalContent,
      BELGIUM,
      LUXEMBOURG_TERRITORY,
      'naval',
      BELGIUM_TERRITORY,
    );
    const navalTransferAfter = internalArmyTransferLogisticsTermsV2(
      navalState,
      navalContent,
      BELGIUM,
      LUXEMBOURG_TERRITORY,
      BELGIUM_TERRITORY,
      1,
    );
    expect(navalSupplyAfter).toBeGreaterThan(navalSupplyBefore);
    expect(navalTransferAfter.throughputMultiplier).toBeCloseTo(
      Math.min(0.75, navalTransferBefore.throughputMultiplier * 1.10),
      8,
    );
    expect(navalTransferAfter.costPerMillion)
      .toBeCloseTo(navalTransferBefore.costPerMillion * 0.80, 10);
  });

  it('applies field-medicine mastery to the local army taking casualties', () => {
    const pulse = (): ReturnType<typeof resolveBattlePulseV2> => {
      const state = createWorldStateV2(95_107, WORLD_CONTENT_V2);
      state.tick = 2;
      state.territories[BELGIUM_TERRITORY]!.army.manpower = 0.10;
      state.territories[BELGIUM_TERRITORY]!.army.capacity = 0.10;
      state.territories[LUXEMBOURG_TERRITORY]!.army.manpower = 0.10;
      state.territories[LUXEMBOURG_TERRITORY]!.army.capacity = 0.10;
      const war: WarStateV2 = {
        id: 'mastery-field-medicine',
        attackerId: BELGIUM,
        defenderId: LUXEMBOURG,
        startedTick: 0,
        lastBattleTick: 0,
        warScore: 0,
        battles: 0,
        attackerLosses: 0,
        defenderLosses: 0,
        lastPeaceOfferTick: -1,
        attackerOperations: [],
        defenderOperations: [],
      };
      state.wars = [war];
      const operation: FrontOperationV2 = {
        commanderId: BELGIUM,
        sourceId: BELGIUM_TERRITORY,
        targetId: LUXEMBOURG_TERRITORY,
        doctrine: 'pressure',
        access: 'land',
        startedTick: 0,
        lastBattleTick: 0,
        holdUntilTick: 12,
        momentum: 0,
      };
      return resolveBattlePulseV2(state, WORLD_CONTENT_V2, war, operation);
    };
    const baseline = pulse()!;
    registerCountryMasteryRuntimeV2(
      WORLD_CONTENT_V2,
      LUXEMBOURG,
      modifiers(1, 1, 1, { casualtyMultiplier: 0.50 }),
    );
    const protectedPulse = pulse()!;
    expect(protectedPulse.defenderLosses).toBeCloseTo(baseline.defenderLosses * 0.50, 8);
    expect(protectedPulse.attackerLosses).toBe(baseline.attackerLosses);
  });

  it('keeps exact Firepower and Defense mastery through repeated recruitment ticks', () => {
    const state = createWorldStateV2(95_108, WORLD_CONTENT_V2);
    fullyFunded(state, BELGIUM);
    const army = state.territories[BELGIUM_TERRITORY]!.army;
    army.manpower = army.capacity * 0.20;
    const startingManpower = army.manpower;
    const startingBaseAttack = army.baseAttack;
    const startingBaseDefense = army.baseDefense;
    const mastered = modifiers(1, 1, 1, {
      attackMultiplier: 1.50,
      defenseMultiplier: 1.40,
    });
    registerCountryMasteryRuntimeV2(WORLD_CONTENT_V2, BELGIUM, mastered);

    for (let week = 0; week < 8; week += 1) {
      const plans = createFinancePlansV2(state, WORLD_CONTENT_V2);
      processFinanceMilitaryV2(state, WORLD_CONTENT_V2, plans);
      state.tick += 1;
      const masteredAttack = selectEffectiveAttackV2(
        state, WORLD_CONTENT_V2, BELGIUM, army,
      );
      const masteredDefense = selectEffectiveDefenseV2(
        state, WORLD_CONTENT_V2, BELGIUM, army,
      );
      resetCountryMasteryRuntimeV2(WORLD_CONTENT_V2);
      const neutralAttack = selectEffectiveAttackV2(
        state, WORLD_CONTENT_V2, BELGIUM, army,
      );
      const neutralDefense = selectEffectiveDefenseV2(
        state, WORLD_CONTENT_V2, BELGIUM, army,
      );
      expect(masteredAttack / neutralAttack).toBeCloseTo(1.50, 5);
      expect(masteredDefense / neutralDefense).toBeCloseTo(1.40, 5);
      registerCountryMasteryRuntimeV2(WORLD_CONTENT_V2, BELGIUM, mastered);
    }

    expect(army.manpower).toBeGreaterThan(startingManpower);
    // Runtime mastery is deliberately outside stored base quality. Training
    // and save/load can therefore never dilute or compound either multiplier.
    expect(army.baseAttack).toBe(startingBaseAttack);
    expect(army.baseDefense).toBe(startingBaseDefense);
  });

  it('is idempotent across synchronization and survives save/reconnect without entering the save', () => {
    const content: WorldContentV2 = { ...WORLD_CONTENT_V2 };
    const state = createWorldStateV2(95_103, content);
    const ownerId = state.humanPlayerId;
    const territoryId = content.nations[ownerId]!.initialCapitalId;
    const frozen = modifiers(2.75, 1.60, 1.90);
    registerCountryMasteryRuntimeV2(content, ownerId, frozen);
    registerCountryMasteryRuntimeV2(content, ownerId, frozen);
    synchronizeArmyCapacityV2(state, content);
    const capacity = stateTerritoryArmyCapacityTargetV2(
      state, content, territoryId, ownerId,
    );
    const pipeline = selectRecruitmentTrainingPipelineV2(state, content, ownerId);

    synchronizeArmyCapacityV2(state, content);
    expect(stateTerritoryArmyCapacityTargetV2(
      state, content, territoryId, ownerId,
    )).toBe(capacity);
    expect(selectRecruitmentTrainingPipelineV2(state, content, ownerId)).toBe(pipeline);
    expect(selectRegisteredCountryMasteryRuntimeV2(content, ownerId))
      .toEqual(expect.objectContaining(frozen));
    expect(selectTerritoryCountryMasteryRuntimeV2(content, territoryId, ownerId))
      .toEqual(expect.objectContaining(frozen));

    const serialized = serializeSaveV2(state, content);
    expect(serialized).not.toContain('countryMasteryRuntime');
    const reconnected = loadSaveV2(serialized, content);
    expect(stateTerritoryArmyCapacityTargetV2(
      reconnected, content, territoryId, ownerId,
    )).toBe(capacity);
    expect(selectRecruitmentTrainingPipelineV2(reconnected, content, ownerId)).toBe(pipeline);
  });
});
