import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { synchronizeArmyCapacityV2 } from './capacity';
import { WORLD_CONTENT_V2 } from './content';
import {
  TERRITORY_INTEGRATION_PRESSURE_REVOLUTION_MAX_CHANCE_V2,
  TERRITORY_INTEGRATION_PRESSURE_REVOLUTION_MIN_CHANCE_V2,
  beginFederationTerritoryIntegrationV2,
  beginTerritoryIntegrationV2,
  processTerritoryIntegrationRevolutionsV2,
  territoryIntegrationPressureRevolutionDueV2,
  territoryIntegrationRevolutionTickV2,
  territoryIntegrationWarPressureRevolutionBonusChanceV2,
  territoryIntegrationWarPressureRevolutionRiskV2,
} from './integration';
import { processOpeningArmyBonusDecayV2 } from './openingArmyBonus';
import { canonicalStateHashV2, createSaveV2, loadSaveV2 } from './persistence';
import { selectWarStrainSummaryV2 } from './warStrain';
import {
  nationIdV2,
  territoryIdV2,
  type IntegrationProgramStateV2,
  type WarStateV2,
} from './types';

const bel = nationIdV2('bel');
const luxTerritory = territoryIdV2('lux');

function program(duration: number, cause: 'conquest' | 'federation' = 'conquest'):
IntegrationProgramStateV2 {
  return {
    cause,
    fromOwnerId: nationIdV2('lux'),
    fromCoreOwnerId: nationIdV2('lux'),
    toOwnerId: bel,
    startedTick: 0,
    completesTick: duration,
    annualCost: 1,
  };
}

function sustainedChanceRate(chance: number, duration: number, seeds = 10_000): number {
  const integration = program(duration);
  const lastWindowTick = Math.floor(duration * 0.80);
  let triggered = 0;
  for (let seed = 1; seed <= seeds; seed += 1) {
    if (territoryIntegrationPressureRevolutionDueV2(
      { seed, tick: lastWindowTick },
      luxTerritory,
      integration,
      chance,
    )) triggered += 1;
  }
  return triggered / seeds;
}

describe('integration revolution pressure risk', () => {
  it('starts only at critical pressure and scales monotonically from 10% to 35%', () => {
    expect(territoryIntegrationWarPressureRevolutionBonusChanceV2(74)).toBe(0);
    expect(territoryIntegrationWarPressureRevolutionBonusChanceV2(75))
      .toBe(TERRITORY_INTEGRATION_PRESSURE_REVOLUTION_MIN_CHANCE_V2);
    expect(territoryIntegrationWarPressureRevolutionBonusChanceV2(85))
      .toBeGreaterThan(TERRITORY_INTEGRATION_PRESSURE_REVOLUTION_MIN_CHANCE_V2);
    expect(territoryIntegrationWarPressureRevolutionBonusChanceV2(95))
      .toBeGreaterThan(territoryIntegrationWarPressureRevolutionBonusChanceV2(85));
    expect(territoryIntegrationWarPressureRevolutionBonusChanceV2(100))
      .toBe(TERRITORY_INTEGRATION_PRESSURE_REVOLUTION_MAX_CHANCE_V2);
    expect(territoryIntegrationWarPressureRevolutionBonusChanceV2(250))
      .toBe(TERRITORY_INTEGRATION_PRESSURE_REVOLUTION_MAX_CHANCE_V2);
  });

  it('uses one stable bounded roll instead of compounding with integration duration', () => {
    const tenPercentShort = sustainedChanceRate(0.10, 100);
    const tenPercentLong = sustainedChanceRate(0.10, 10_000);
    const thirtyFivePercentShort = sustainedChanceRate(0.35, 100);
    const thirtyFivePercentLong = sustainedChanceRate(0.35, 10_000);
    expect(tenPercentShort).toBeGreaterThan(0.08);
    expect(tenPercentShort).toBeLessThan(0.12);
    expect(tenPercentLong).toBeGreaterThan(0.08);
    expect(tenPercentLong).toBeLessThan(0.12);
    expect(thirtyFivePercentShort).toBeGreaterThan(0.32);
    expect(thirtyFivePercentShort).toBeLessThan(0.38);
    expect(thirtyFivePercentLong).toBeGreaterThan(0.32);
    expect(thirtyFivePercentLong).toBeLessThan(0.38);
    expect(sustainedChanceRate(0.35, 100, 1_000))
      .toBe(sustainedChanceRate(0.35, 100, 1_000));
  });

  it('never grants the War Pressure bonus to voluntary federation integration', () => {
    const state = createWorldStateV2(91_001);
    beginFederationTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      luxTerritory,
      bel,
    );
    state.players[bel]!.warFatigue = 100;
    expect(territoryIntegrationWarPressureRevolutionRiskV2(
      state,
      WORLD_CONTENT_V2,
      bel,
    )).toEqual({
      exposedTerritories: 0,
      bonusChance: 0,
      level: 'none',
      label: 'NO OCCUPIED TERRITORIES',
    });
    expect(territoryIntegrationPressureRevolutionDueV2(
      { seed: 1, tick: 80 },
      luxTerritory,
      program(100, 'federation'),
      1,
    )).toBe(false);

    const conquest = createWorldStateV2(91_002);
    beginTerritoryIntegrationV2(conquest, WORLD_CONTENT_V2, luxTerritory, bel);
    expect(territoryIntegrationWarPressureRevolutionRiskV2(
      conquest,
      WORLD_CONTENT_V2,
      bel,
    ).exposedTerritories).toBe(1);
  });

  it('triggers the pressure path identically after save/load without consuming RNG', () => {
    const state = createWorldStateV2(91_003);
    beginTerritoryIntegrationV2(state, WORLD_CONTENT_V2, luxTerritory, bel);
    const integration = state.territories[luxTerritory]!.integrationProgram!;
    const duration = integration.completesTick - integration.startedTick;
    state.tick = integration.startedTick + Math.floor(duration * 0.80);
    state.players[bel]!.warFatigue = 100;
    const opponents = [nationIdV2('nld'), nationIdV2('fra'), nationIdV2('deu')];
    state.wars = opponents.map((defenderId, index): WarStateV2 => ({
      id: `pressure-war-${index}`,
      attackerId: bel,
      defenderId,
      // Three fresh declarations no longer imply critical pressure by
      // themselves. Keep these campaigns active long enough for the canonical
      // duration curve to expose the occupied territory to revolution risk.
      startedTick: state.tick - 104,
      lastBattleTick: state.tick,
      warScore: 0,
      battles: 0,
      attackerLosses: 0,
      defenderLosses: 0,
      attackerCivilianLosses: 0,
      defenderCivilianLosses: 0,
      lastPeaceOfferTick: -1_000_000,
      attackerOperations: [],
      defenderOperations: [],
      revenge: null,
    }));
    state.aiEscalation.lastWarStartTick = state.tick;
    processOpeningArmyBonusDecayV2(state, WORLD_CONTENT_V2);
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    expect(selectWarStrainSummaryV2(state, WORLD_CONTENT_V2, bel).score)
      .toBeGreaterThanOrEqual(75);
    const risk = territoryIntegrationWarPressureRevolutionRiskV2(
      state,
      WORLD_CONTENT_V2,
      bel,
    );
    expect(risk.exposedTerritories).toBe(1);
    expect(risk.bonusChance).toBeGreaterThanOrEqual(0.10);

    let pressureSeed: number | undefined;
    for (let seed = 1; seed <= 100_000; seed += 1) {
      if (territoryIntegrationPressureRevolutionDueV2(
        { seed, tick: state.tick },
        luxTerritory,
        integration,
        risk.bonusChance,
      ) && territoryIntegrationRevolutionTickV2(
        { seed },
        luxTerritory,
        integration,
      ) !== state.tick) {
        pressureSeed = seed;
        break;
      }
    }
    expect(pressureSeed).toBeDefined();
    state.seed = pressureSeed!;
    const resumed = loadSaveV2(createSaveV2(state, WORLD_CONTENT_V2), WORLD_CONTENT_V2);
    expect(resumed.rngState).toBe(state.rngState);
    expect(processTerritoryIntegrationRevolutionsV2(state, WORLD_CONTENT_V2))
      .toEqual(processTerritoryIntegrationRevolutionsV2(resumed, WORLD_CONTENT_V2));
    expect(resumed.rngState).toBe(state.rngState);
    expect(canonicalStateHashV2(createSaveV2(resumed, WORLD_CONTENT_V2)))
      .toBe(canonicalStateHashV2(createSaveV2(state, WORLD_CONTENT_V2)));
  });
});
